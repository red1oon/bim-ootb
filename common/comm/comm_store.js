// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_store.js — the device's local comm store (comm.db) and the post-office visit (sync).
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.11 + §11.15 + §11.17 + §12.4 (CL3) + §12.6 + §12.7 (CL4) + §13.2 (CL8)
 * — Witnesses: W-STORE-NODE, W-FOLDER-2CTX, W-ADMIT-FOLD, W-PIPE-OPAQUE.
 *
 * Holds ALL sync state on the device so the pipe holds only bytes. Sits OUTSIDE the business DB: the kernel only
 * ever sees ops that came out of order() as MERGED.
 *   ingest  — structural checks only (a device's key may arrive later, inside an ENROLL op).
 *   order   — 1) fold the roster from identity ops (comm_roster.js, trust pinned by the space id)
 *             2) admit every business op against it (comm_admit.js + the AD layer's canUpdate via opts.access)
 *             3) order the admitted ops by the versions they read (comm_order.js, §12.6)
 *             4) an op that read a REFUSED version is REFUSED too (the version it saw never happened).
 * Depends on CommEnvelope, CommOrder, CommRoster, CommAdmit; sql.js injected (opts.SQL); opts.access injected.
 *
 * CL8 encryption (§13.2): the pipe sees only ciphertext. A space with a founder dh_jwk has an AES-GCM-256 space key per
 * EPOCH. Bundles carry business envelopes as `enc:<epoch>:<b64(iv‖ct)>` (op_hash stays plaintext; identity ops and heads
 * stay plaintext). A device derives its epoch keys at fold time from the KEYGRANTs addressed to it (ECDH(its private key,
 * granter public key) → HKDF-SHA256 → AES-KW) — no symmetric key is ever stored. Ops it cannot open yet wait in cl_sealed.
 */
(function (global) {
  'use strict';
  function _dep(n, f) { return global[n] || (typeof require === 'function' ? require('./' + f) : null); }
  var ENV = _dep('CommEnvelope', 'comm_envelope.js'), ORD = _dep('CommOrder', 'comm_order.js');
  var ROS = _dep('CommRoster', 'comm_roster.js'), ADM = _dep('CommAdmit', 'comm_admit.js');

  var SCHEMA = [
    'CREATE TABLE IF NOT EXISTS cl_self (kid TEXT PRIMARY KEY, space TEXT, person_uu TEXT, next_seq INTEGER, head_hash TEXT, bundled_to INTEGER)',
    'CREATE TABLE IF NOT EXISTS cl_op (op_hash TEXT PRIMARY KEY, author_kid TEXT NOT NULL, author_seq INTEGER NOT NULL, prev_hash TEXT, deps_json TEXT,' +
      ' op_type TEXT, target_table TEXT, target_uu TEXT, envelope TEXT NOT NULL, first_pipe TEXT, state TEXT NOT NULL, UNIQUE(author_kid, author_seq))',
    'CREATE TABLE IF NOT EXISTS cl_contender (op_hash TEXT PRIMARY KEY, author_kid TEXT, author_seq INTEGER, envelope TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_verdict (op_hash TEXT PRIMARY KEY, fold_pos INTEGER, verdict TEXT, reason TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_fetched (name TEXT, pipe_id TEXT, PRIMARY KEY(name, pipe_id))',
    'CREATE TABLE IF NOT EXISTS cl_sealed (op_hash TEXT PRIMARY KEY, epoch INTEGER, ct TEXT NOT NULL, bundle TEXT, pipe_id TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_outbox (bundle_name TEXT PRIMARY KEY, from_seq INTEGER, to_seq INTEGER, state TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_head_seen (author_kid TEXT, pipe_id TEXT, seq INTEGER, head_hash TEXT, frontier_json TEXT, sig TEXT, PRIMARY KEY(author_kid, pipe_id))'
  ];

  function _q(db, sql, args) { var st = db.prepare(sql); if (args) st.bind(args); var out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  function _hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  async function _sha(s) { return _hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
  function _json(o) { return new TextEncoder().encode(JSON.stringify(o)); }
  function _unjson(b) { return JSON.parse(new TextDecoder().decode(b)); }
  function _num(v) { return v == null || v === '' ? null : Number(v); }

  // ── CL8 crypto helpers (WebCrypto only; the epoch key lives in memory, never in comm.db) ──
  function _sub() { return globalThis.crypto.subtle; }
  function _b64(b) { b = new Uint8Array(b); if (typeof Buffer !== 'undefined') return Buffer.from(b).toString('base64'); var t = ''; for (var i = 0; i < b.length; i++) t += String.fromCharCode(b[i]); return btoa(t); }
  function _unb64(t) { if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(t), 'base64')); var s = atob(String(t)), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  var _aad = function (space, epoch) { return new TextEncoder().encode('bim-comm-op|' + space + '|' + epoch); };
  // the KEK for one grant: ECDH(my private, their public) → HKDF-SHA256 (bound to space, epoch, from, to) → AES-KW-256
  async function _kek(priv, pubJwk, space, epoch, from, to) {
    var pub = await _sub().importKey('jwk', ROS.dhOf(pubJwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    var bits = await _sub().deriveBits({ name: 'ECDH', public: pub }, priv, 256);
    var hk = await _sub().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return _sub().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('bim-comm-keygrant'),
      info: new TextEncoder().encode(space + '|' + epoch + '|' + from + '|' + to) }, hk, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  }
  async function _newSpaceKey() { return _sub().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); }
  async function _wrap(key, priv, pubJwk, space, epoch, from, to) { return _b64(await _sub().wrapKey('raw', key, await _kek(priv, pubJwk, space, epoch, from, to), 'AES-KW')); }
  async function _unwrap(wrapped, priv, pubJwk, space, epoch, from, to) {
    return _sub().unwrapKey('raw', _unb64(wrapped), await _kek(priv, pubJwk, space, epoch, from, to), 'AES-KW', { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function _seal(env, key, epoch, space) {
    var iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await _sub().encrypt({ name: 'AES-GCM', iv: iv, additionalData: _aad(space, epoch) }, key, new TextEncoder().encode(ENV.canonical(env))));
    var out = new Uint8Array(12 + ct.length); out.set(iv, 0); out.set(ct, 12); return 'enc:' + epoch + ':' + _b64(out);
  }
  // → {state:'ok', env, epoch} | {state:'sealed', epoch} (no key for that epoch yet) | {state:'tampered'} (key held, GCM refused it)
  async function _openText(text, ring, space) {
    var m = /^enc:(\d+):([A-Za-z0-9+\/=]+)$/.exec(String(text)); if (!m) return { state: 'tampered' };
    var epoch = Number(m[1]), b = _unb64(m[2]); if (b.length < 28) return { state: 'tampered' };
    var ks = ring[epoch]; if (!ks || !ks.length) return { state: 'sealed', epoch: epoch };
    for (var i = 0; i < ks.length; i++) {
      try { var pt = await _sub().decrypt({ name: 'AES-GCM', iv: b.slice(0, 12), additionalData: _aad(space, epoch) }, ks[i], b.slice(12));
        return { state: 'ok', env: JSON.parse(new TextDecoder().decode(pt)), epoch: epoch }; } catch (e) { /* try the next candidate key of this epoch */ }
    }
    return { state: 'tampered' };
  }

  // record scope for canUpdate: a CREATE carries it (fields or the stdDefaults buildOp stamps); later ops inherit
  // it from their record's CREATE. Unknown → null → admission refuses (fail-closed).
  function _scopeOfCreate(env) {
    var p = env.body.params || {}, f = p.fields || {}, sd = p.stdDefaults || {};
    var c = _num(f.ad_client_id != null ? f.ad_client_id : sd.clientId), o = _num(f.ad_org_id != null ? f.ad_org_id : sd.orgId);
    return c == null || o == null ? null : { client: c, org: o };
  }

  function open(db, opts) {
    var SQL = opts.SQL, self = opts.self, space = opts.space, access = opts.access, log = opts.log || function (m) { console.log(m); };
    var SP = 's/' + space + '/';             // §13.6: every pipe name I write or list lives under my space — two spaces on one pipe never meet
    SCHEMA.forEach(function (s) { db.run(s); });
    db.run('INSERT OR IGNORE INTO cl_self (kid, space, person_uu, next_seq, head_hash, bundled_to) VALUES (?,?,?,1,NULL,0)', [self.kid, space, self.person_uu || null]);
    var last = null, sigCache = {};

    function selfRow() { return _q(db, 'SELECT * FROM cl_self WHERE kid=?', [self.kid])[0]; }
    function allOps() { return _q(db, 'SELECT op_hash, envelope FROM cl_op').map(function (r) { return { hash: r.op_hash, env: JSON.parse(r.envelope) }; }); }
    async function sigOk(hash, env, jwk) { var k = hash + '|' + (jwk ? jwk.x : ''); if (sigCache[k] == null) sigCache[k] = !!jwk && (await ENV.verify(env, jwk)); return sigCache[k]; }

    async function order() {
      var raw = allOps(), byHash = {};
      var contenders = _q(db, 'SELECT op_hash, envelope FROM cl_contender').map(function (r) { return { hash: r.op_hash, env: JSON.parse(r.envelope) }; });
      raw.concat(contenders).forEach(function (o) { byHash[o.hash] = o.env; });
      // every op claiming a slot is judged the same way whichever arrived first: keep the ONE validly signed claimant;
      // two valid = equivocation; none valid = forged. Identity ops' keys come from the roster itself (fold below).
      var slots = {}; raw.concat(contenders).forEach(function (o) { var k = o.env.author + '#' + o.env.seq; (slots[k] = slots[k] || []).push(o); });
      var roster0 = await ROS.fold(raw.concat(contenders), space), verdict = {}, bad = {}, equiv = [], ops = [];
      for (var sk of Object.keys(slots)) {
        var cands = slots[sk];
        if (cands.length === 1) { ops.push(cands[0]); continue; }
        var dv0 = roster0.devices[cands[0].env.author];
        if (!dv0) { cands.forEach(function (c) { verdict[c.hash] = { verdict: 'PARKED', reason: 'unknown-device' }; bad[c.hash] = 1; }); continue; }
        var valid = []; for (var c of cands) if (await sigOk(c.hash, c.env, dv0.jwk)) valid.push(c);
        cands.forEach(function (c) { if (valid.indexOf(c) < 0) { verdict[c.hash] = { verdict: 'REFUSED', reason: 'signature' }; bad[c.hash] = 1; } });
        if (valid.length === 1) ops.push(valid[0]);
        else if (valid.length > 1) { equiv.push({ author: valid[0].env.author, seq: valid[0].env.seq, hashes: valid.map(function (v) { return v.hash; }).sort() });
          valid.forEach(function (v) { verdict[v.hash] = { verdict: 'EQUIVOCATED', reason: valid.length + ' signed ops at seq ' + v.env.seq }; bad[v.hash] = 1; }); }
      }
      var roster = await ROS.fold(ops, space);
      Object.keys(roster.verdicts).forEach(function (h) { if (!bad[h]) verdict[h] = roster.verdicts[h]; });
      // admit business ops
      var createOf = {}; ops.forEach(function (o) { if (o.env.body.op_type === 'CRUD_CREATE') createOf[o.env.target.uu] = o.env; });
      for (var o of ops) {
        if (ROS.IDENTITY[o.env.body.op_type]) continue;
        if ((o.env.deps || []).some(function (x) { return !byHash[x]; })) { verdict[o.hash] = { verdict: 'PARKED', reason: 'deps' }; continue; }   // what it read hasn't arrived yet
        var dv = roster.devices[o.env.author], cr = o.env.body.op_type === 'CRUD_CREATE' ? o.env : createOf[o.env.target.uu];
        verdict[o.hash] = ADM.admit(o.env, roster, { sigOk: dv ? await sigOk(o.hash, o.env, dv.jwk) : false,
          scope: cr ? _scopeOfCreate(cr) : null, access: access || function () { return { allowed: false, reason: 'no-access-adapter' }; } });
      }
      // order the MERGED ones by what they read; cascade refusals onto ops that read a refused version
      var ok = ops.filter(function (o) { return verdict[o.hash] && verdict[o.hash].verdict === 'MERGED'; });
      var L = ORD.linearize(ok.map(function (o) { return { hash: o.hash, author: o.env.author, seq: o.env.seq, prev: null, deps: o.env.deps || [] }; }));
      var refused = {}; Object.keys(verdict).forEach(function (h) { if (verdict[h].verdict !== 'MERGED' && verdict[h].verdict !== 'PARKED') refused[h] = 1; });
      var parkedSet = {}; L.parked.forEach(function (h) { parkedSet[h] = 1; });
      var changed = true;
      while (changed) { changed = false; Object.keys(parkedSet).forEach(function (h) {
        if ((byHash[h].deps || []).some(function (x) { return refused[x]; })) { verdict[h] = { verdict: 'REFUSED', reason: 'dep-refused' }; refused[h] = 1; delete parkedSet[h]; changed = true; } }); }
      Object.keys(parkedSet).forEach(function (h) { verdict[h] = { verdict: 'PARKED', reason: 'deps' }; });
      db.run('DELETE FROM cl_verdict');
      var pos = {}; L.order.forEach(function (h, i) { pos[h] = i; });
      Object.keys(verdict).forEach(function (h) { db.run('INSERT INTO cl_verdict VALUES (?,?,?,?)', [h, pos[h] != null ? pos[h] : null, verdict[h].verdict, verdict[h].reason || null]); });
      last = { order: L.order, parked: Object.keys(verdict).filter(function (h) { return verdict[h].verdict === 'PARKED'; }).sort(), equivocations: equiv, roster: roster, verdict: verdict };
      return last;
    }
    async function cur() { return last || order(); }

    // my epoch keys, derived from the KEYGRANTs addressed to me that the roster accepted: {epoch: [CryptoKey]} (§13.2).
    // Memoised on the fold result, so any new op (a new grant, a revoke) re-derives; nothing is persisted.
    var ringFor = null, ringVal = {};
    async function keyring() {
      var L = await cur(); if (ringFor === L) return ringVal;
      var ring = {}, R = L.roster;
      if (self.dhPrivateKey && R.ok) for (var g of R.grants) {
        if (g.kid !== self.kid) continue;
        var from = R.devices[g.from_kid]; if (!from || !from.dh) continue;
        try { var k = await _unwrap(g.wrapped, self.dhPrivateKey, from.dh, space, g.epoch, g.from_kid, self.kid); (ring[g.epoch] = ring[g.epoch] || []).push(k); } catch (e) { /* a grant that does not open is not a key */ }
      }
      ringFor = L; ringVal = ring; return ring;
    }
    function _newest(ring) { var e = Object.keys(ring).map(Number).sort(function (a, b) { return b - a; })[0]; return e == null ? null : e; }

    // the version of each record THIS author sees: the record's HEADS (ops on it with no descendant on it), over the
    // placed order with my own not-yet-placed ops on top — what my screen shows. One head = a hash; several = the
    // sorted list (concurrent edits I can see; an edit now descends from all of them — §12.9).
    function _parents(env, uu) { var r = (env.reads || {})[uu]; return r == null ? [] : (Array.isArray(r) ? r : [r]); }
    async function versions() {
      var L = await cur(), heads = {}, byHash = {}, placed = {}; allOps().forEach(function (o) { byHash[o.hash] = o.env; });
      async function step(h) { for (var u of await ROS.touched(byHash[h])) { var ps = _parents(byHash[h], u);
        heads[u] = (heads[u] || []).filter(function (x) { return ps.indexOf(x) < 0; }).concat([h]); } }
      for (var h of L.order) { placed[h] = 1; await step(h); }
      for (var r of _q(db, "SELECT op_hash FROM cl_op WHERE author_kid=? AND state='OWN' ORDER BY author_seq", [self.kid]))
        if (!placed[r.op_hash] && !(L.verdict[r.op_hash] && L.verdict[r.op_hash].verdict === 'REFUSED')) await step(r.op_hash);
      var v = {}; Object.keys(heads).forEach(function (u) { var hs = heads[u].slice().sort(); v[u] = hs.length === 1 ? hs[0] : hs; });
      return v;
    }

    // crossed saves, the Git way (§11.15 / §12.9): per record and column, the writers with no descendant on that record
    // that also writes the column. One = it applies. Several = conflicted: the record keeps the value from before.
    function _cols(env) { var p = env.body.params || {}; return Object.keys(env.body.op_type === 'CRUD_CREATE' ? (p.fields || {}) : (p.changes || {})); }
    function _val(env, c) { var p = env.body.params || {}; if (env.body.op_type === 'CRUD_CREATE') return (p.fields || {})[c];
      var ch = (p.changes || {})[c]; return ch && Object.prototype.hasOwnProperty.call(ch, 'new') ? ch.new : ch; }
    async function conflicts() {
      var L = await cur(), byHash = {}, pos = {}, rec = {}; allOps().forEach(function (o) { byHash[o.hash] = o.env; });
      L.order.forEach(function (h, i) { pos[h] = i; var e = byHash[h]; if (ROS.IDENTITY[e.body.op_type]) return; (rec[e.target.uu] = rec[e.target.uu] || []).push(h); });
      var out = [], devs = L.roster.devices;
      Object.keys(rec).forEach(function (uu) {
        var hs = rec[uu], anc = {};
        function ancestors(h) { if (anc[h]) return anc[h]; var a = {}; _parents(byHash[h], uu).forEach(function (p) { if (byHash[p]) { a[p] = 1; Object.keys(ancestors(p)).forEach(function (x) { a[x] = 1; }); } }); return (anc[h] = a); }
        var cols = {}; hs.forEach(function (h) { _cols(byHash[h]).forEach(function (c) { (cols[c] = cols[c] || []).push(h); }); });
        Object.keys(cols).sort().forEach(function (c) {
          var w = cols[c], cand = w.filter(function (h) { return !w.some(function (h2) { return h2 !== h && ancestors(h2)[h]; }); });
          if (cand.length < 2) return;
          // before = the last AGREED write of c: walk back through common ancestors until one writer dominates the rest
          // (an earlier, still-open clash is not a value anyone agreed on — §12.10)
          var set = cand, agreed = null;
          for (var guard = 0; guard < 64 && !agreed; guard++) {
            var common = w.filter(function (h) { return set.every(function (k) { return ancestors(k)[h]; }); });
            if (!common.length) break;
            var tops = common.filter(function (h) { return !common.some(function (h2) { return h2 !== h && ancestors(h2)[h]; }); });
            if (tops.length === 1) agreed = tops[0]; else set = tops;
          }
          var contested = w.filter(function (h) { return agreed ? ancestors(h)[agreed] : true; });   // every write of c after the agreed one
          out.push({ uu: uu, table: byHash[hs[0]].target.table, col: c, before: agreed ? _val(byHash[agreed], c) : null, agreed: agreed, contested: contested.sort(),
                     candidates: cand.sort().map(function (h) { var e = byHash[h]; return { hash: h, author: e.author, person_uu: devs[e.author] ? devs[e.author].person : null, value: _val(e, c) }; }) });
        });
      });
      return out;
    }
    // the ops handed to the REAL fold (kernel_ops + crud_core.listTip): placed business ops in order, with every
    // contested write of a conflicted column held back, so the row keeps its last agreed value until resolved.
    async function foldable() {
      var hold = {}; (await conflicts()).forEach(function (cf) { cf.contested.forEach(function (h) { (hold[h] = hold[h] || {})[cf.col] = 1; }); });
      return (await placedEnvelopes()).map(function (p) {
        if (!hold[p.hash]) return p;
        var e = JSON.parse(JSON.stringify(p.env)), ch = e.body.params.changes || {};
        Object.keys(hold[p.hash]).forEach(function (c) { delete ch[c]; });
        return { hash: p.hash, env: e, held: Object.keys(hold[p.hash]) };
      });
    }
    // notices for one person: every conflict where one of their devices is a candidate (derived, never an op)
    async function notices(personUu) {
      var pu = String(personUu).toLowerCase(), msg = opts.messageText ? opts.messageText('CurrentRecordModified') : null;
      return (await conflicts()).filter(function (cf) { return cf.candidates.some(function (k) { return k.person_uu === pu; }); }).map(function (cf) {
        var mine = cf.candidates.filter(function (k) { return k.person_uu === pu; })[0], theirs = cf.candidates.filter(function (k) { return k.person_uu !== pu; });
        return { ad_message: 'CurrentRecordModified', message: msg, ad_table_id: opts.tableId ? opts.tableId(cf.table) : null, table: cf.table, record_uu: cf.uu, col: cf.col,
                 textmsg: cf.col + ': mine=' + JSON.stringify(mine.value) + ' theirs=' + JSON.stringify(theirs.map(function (t) { return t.value; })) + ' before=' + JSON.stringify(cf.before) };
      });
    }
    // online save check = iDempiere's record-wide rule (GridTable.hasChanged :3482): has the record moved since I loaded it?
    async function saveCheck(uu, loaded) {
      var curV = (await versions())[String(uu).toLowerCase()] || null, stale = JSON.stringify(curV) !== JSON.stringify(loaded == null ? null : loaded);
      return stale ? { stale: true, ad_message: 'CurrentRecordModified', message: opts.messageText ? opts.messageText('CurrentRecordModified') : null, current: curV }
                   : { stale: false, current: curV };
    }

    // receipts: per author, the highest seq I hold with nothing missing below it. SEEN means RECEIVED — whether an op
    // was accepted is its verdict, a separate fact (a refused op is still delivered).
    async function frontier() {
      var have = {}, f = {};
      _q(db, 'SELECT author_kid, author_seq FROM cl_op').forEach(function (r) { (have[r.author_kid] = have[r.author_kid] || {})[r.author_seq] = 1; });
      Object.keys(have).forEach(function (a) { var n = 0; while (have[a][n + 1]) n++; f[a] = n; });
      return f;
    }
    function gaps() {
      var have = {}, top = {}, out = [];
      _q(db, 'SELECT author_kid, author_seq FROM cl_op').forEach(function (r) { (have[r.author_kid] = have[r.author_kid] || {})[r.author_seq] = 1; top[r.author_kid] = Math.max(top[r.author_kid] || 0, r.author_seq); });
      _q(db, 'SELECT author_kid, MAX(seq) AS s FROM cl_head_seen GROUP BY author_kid').forEach(function (r) { top[r.author_kid] = Math.max(top[r.author_kid] || 0, r.s); have[r.author_kid] = have[r.author_kid] || {}; });
      Object.keys(top).forEach(function (a) { for (var q = 1; q <= top[a]; q++) if (!have[a][q]) out.push({ author: a, seq: q }); });
      return out;
    }

    // spec = { target, body, intent?, refs?:[uu], ts?, attrib? }. Identity ops also read the space + my device + my person.
    async function author(spec) {
      var me = selfRow(), ver = await versions(), reads = {}, ident = !!ROS.IDENTITY[spec.body.op_type];
      var uus = [String(spec.target.uu).toLowerCase()].concat((spec.refs || []).map(function (u) { return String(u).toLowerCase(); }));
      if (ident && spec.body.op_type !== 'GENESIS') uus = uus.concat([await ROS.spaceUU(space), await ROS.devUU(self.kid), String(me.person_uu || '').toLowerCase()].filter(Boolean));
      uus.forEach(function (u) { reads[u] = ver[u] || null; });
      var deps = [].concat.apply([], Object.keys(reads).map(function (k) { var r = reads[k]; return r == null ? [] : (Array.isArray(r) ? r : [r]); })).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
      var env = { v: 3, space: space, author: self.kid, seq: me.next_seq, prev: me.head_hash || null, deps: deps, reads: reads,
                  manifest: spec.manifest || 'm0', policy: spec.policy || 'p0', intent: spec.intent || (ident ? 'K-ID' : 'K1'),
                  target: spec.target, base: reads[uus[0]], ts: spec.ts != null ? spec.ts : Date.now(), body: spec.body };
      if (spec.attrib) env.attrib = spec.attrib;
      var vr = ENV.validate(env); if (!vr.ok) throw new Error('author: invalid envelope — ' + vr.errors.join('; '));
      env = await ENV.sign(env, self);
      var h = await ENV.hashHex(env);
      db.run('INSERT INTO cl_op VALUES (?,?,?,?,?,?,?,?,?,?,?)', [h, self.kid, env.seq, env.prev, JSON.stringify(env.deps), env.body.op_type, env.target.table, env.target.uu, JSON.stringify(env), 'local', 'OWN']);
      db.run('UPDATE cl_self SET next_seq=?, head_hash=? WHERE kid=?', [env.seq + 1, h, self.kid]);
      last = null; return { env: env, hash: h };
    }

    // identity helpers (the ops §11.5 names)
    async function grantKey(kid, dhJwk, epoch, key) {     // one KEYGRANT: the epoch key wrapped for device `kid` (§13.2)
      var wrapped = await _wrap(key, self.dhPrivateKey, dhJwk, space, epoch, self.kid, kid);
      return author({ target: { table: 'comm_device', uu: await ROS.devUU(kid) }, refs: [await ROS.epochUU(space, epoch)],
                      body: { op_type: 'KEYGRANT', params: { kid: kid, epoch: epoch, from_kid: self.kid, wrapped: wrapped } } });
    }
    async function genesis(params) {
      var g = await author({ target: { table: 'comm_space', uu: await ROS.spaceUU(space) }, body: { op_type: 'GENESIS', params: params } });
      var f = params.founder || {};
      if (ROS.dhOf(f.dh_jwk) && f.kid === self.kid && self.dhPrivateKey) {      // the founder creates epoch 1 and grants it to itself
        await grantKey(self.kid, f.dh_jwk, 1, await _newSpaceKey()); log('§COMM_KEY kid=' + self.kid + ' epoch=1 founder-grant space=' + space.slice(0, 12));
      }
      return g;
    }
    async function addPerson(p) { return author({ target: { table: 'comm_person', uu: String(p.person_uu).toLowerCase() }, body: { op_type: 'PERSON', params: p } }); }
    // dhJwk is OPTIONAL: with it the enroller also grants every epoch key it holds, in the same visit (§13.2); without it the
    // device is enrolled but holds no key, so it cannot read business ops.
    async function enroll(kid, jwk, personUu, dhJwk) {
      var params = { kid: kid, jwk: jwk, person_uu: String(personUu).toLowerCase() }; if (dhJwk) params.dh_jwk = dhJwk;
      var r = await author({ target: { table: 'comm_device', uu: await ROS.devUU(kid) }, refs: [String(personUu).toLowerCase()], body: { op_type: 'ENROLL', params: params } });
      if (dhJwk && self.dhPrivateKey) { var ring = await keyring(), n = 0;
        for (var ep of Object.keys(ring).map(Number).sort()) { await grantKey(kid, dhJwk, ep, ring[ep][0]); n++; }
        log('§COMM_KEY kid=' + self.kid + ' enroll=' + kid + ' granted_epochs=' + n); }
      return r;
    }
    async function setRole(p) { return author({ target: { table: 'comm_person', uu: String(p.person_uu).toLowerCase() }, body: { op_type: 'ROLE', params: p } }); }
    async function revoke(kid, lastGood) { return author({ target: { table: 'comm_device', uu: await ROS.devUU(kid) }, body: { op_type: 'REVOKE', params: { kid: kid, last_good_seq: lastGood } } }); }

    async function ingest(env, pipeId) {
      var h = await ENV.hashHex(env);
      if (_q(db, 'SELECT 1 FROM cl_op WHERE op_hash=? UNION SELECT 1 FROM cl_contender WHERE op_hash=?', [h, h]).length) return 'DUP';
      if (!env || env.space !== space) return 'REFUSED:space';
      var vr = ENV.validate(env); if (!vr.ok) return 'REFUSED:invalid ' + vr.errors.join('; ');
      var slot = _q(db, 'SELECT op_hash FROM cl_op WHERE author_kid=? AND author_seq=?', [env.author, env.seq])[0];
      if (slot) { db.run('INSERT OR IGNORE INTO cl_contender VALUES (?,?,?,?)', [h, env.author, env.seq, JSON.stringify(env)]); last = null; return 'CONTENDER'; }
      db.run('INSERT INTO cl_op VALUES (?,?,?,?,?,?,?,?,?,?,?)', [h, env.author, env.seq, env.prev, JSON.stringify(env.deps), env.body.op_type, env.target.table, env.target.uu, JSON.stringify(env), pipeId, 'RECEIVED']);
      last = null; return 'RECEIVED';
    }

    // bundle = a tiny SQLite file, one table ops(op_hash, envelope); name hash = sha256 over the op hashes (row stream).
    // CL8: a business envelope is stored as enc:<epoch>:<b64> under my newest epoch key; identity ops stay plaintext. In an
    // encrypted space a business op I cannot yet encrypt is NOT sent (never plaintext) — the bundle stops before it (§13.2).
    async function bundleNew() {
      var me = selfRow(), rows = _q(db, "SELECT op_hash, author_seq, op_type, envelope FROM cl_op WHERE author_kid=? AND state='OWN' AND author_seq>? ORDER BY author_seq", [self.kid, me.bundled_to]);
      var R = (await cur()).roster, ring = await keyring(), ep = _newest(ring), take = [], enc = {};
      for (var r of rows) {
        if (!ROS.IDENTITY[r.op_type]) {
          if (!R.ok || R.encrypted) { if (ep == null) { log('§COMM_SEAL kid=' + self.kid + ' hold seq=' + r.author_seq + ' reason=no-key-yet'); break; }
            enc[r.op_hash] = await _seal(JSON.parse(r.envelope), ring[ep][0], ep, space); }
        }
        take.push(r);
      }
      if (!take.length) return null;
      var b = new SQL.Database(); b.run('CREATE TABLE ops (op_hash TEXT PRIMARY KEY, envelope TEXT NOT NULL)');
      take.forEach(function (r) { b.run('INSERT INTO ops VALUES (?,?)', [r.op_hash, enc[r.op_hash] || r.envelope]); });
      var bytes = b.export(); b.close();
      var from = take[0].author_seq, to = take[take.length - 1].author_seq, h12 = (await _sha(take.map(function (r) { return r.op_hash; }).join(','))).slice(0, 12);
      return { name: SP + 'o/' + self.kid + '/' + from + '-' + to + '.' + h12 + '.bimpack', bytes: bytes, from: from, to: to, hashes: take.map(function (r) { return r.op_hash; }), sealed: Object.keys(enc).length };
    }
    function _rows(bytes) { var b = new SQL.Database(bytes), out = _q(b, 'SELECT op_hash, envelope FROM ops').map(function (r) { return { hash: r.op_hash, text: r.envelope }; }); b.close(); return out; }
    // readBundle → [{hash, env}]; a sealed row I can open now is opened, one I cannot is {hash, env:null, enc:<epoch>}
    async function readBundle(bytes) {
      var ring = await keyring(), out = [];
      for (var r of _rows(bytes)) {
        if (r.text.indexOf('enc:') !== 0) { out.push({ hash: r.hash, env: JSON.parse(r.text) }); continue; }
        var o = await _openText(r.text, ring, space);
        out.push(o.state === 'ok' && (await ENV.hashHex(o.env)) === r.hash ? { hash: r.hash, env: o.env } : { hash: r.hash, env: null, enc: o.epoch != null ? o.epoch : 'tampered' });
      }
      return out;
    }
    async function signedHead() {
      var me = selfRow(), head = { v: 1, space: space, author: self.kid, seq: me.next_seq - 1, hash: me.head_hash || null, frontier: await frontier(), ts: Date.now() };
      return ENV.sign(head, self);
    }

    // sealed ops whose epoch key I now hold are opened and ingested; a held key that refuses one = tampered (§13.2)
    async function openSealed(rep) {
      for (var round = 0; round < 5; round++) {
        var rows = _q(db, 'SELECT * FROM cl_sealed'); if (!rows.length) return;
        var ring = await keyring(), progressed = 0;
        for (var r of rows) {
          var o = await _openText(r.ct, ring, space);
          if (o.state === 'sealed') continue;
          db.run('DELETE FROM cl_sealed WHERE op_hash=?', [r.op_hash]); progressed++;
          if (o.state === 'ok' && (await ENV.hashHex(o.env)) === r.op_hash) {
            var st = await ingest(o.env, r.pipe_id); rep.opened++; if (st === 'RECEIVED') rep.received++; else if (st === 'CONTENDER') rep.contenders++; else if (st.indexOf('REFUSED') === 0) rep.rejected++;
          } else {                                     // GCM tag (or the op_hash) refused it: drop it, and forget the bundle so an honest copy can heal it
            rep.tampered++; rep.rejected++; db.run('DELETE FROM cl_fetched WHERE name=? AND pipe_id=?', [r.bundle, r.pipe_id]);
            log('§COMM_SEAL kid=' + self.kid + ' TAMPERED op=' + r.op_hash.slice(0, 12) + ' epoch=' + r.epoch + ' bundle=' + r.bundle + ' refused (GCM)');
          }
        }
        if (!progressed) return;
      }
    }

    // admin/same-person housekeeping at the start of a visit (§13.2): (1) a revoked device that held a key → REKEY epoch n+1 and
    // grant it to every non-revoked device; (2) any epoch key I hold that an eligible device still lacks → grant it.
    async function autoKeys(rep) {
      if (!self.dhPrivateKey) return;
      var L = await cur(), R = L.roster; if (!R.ok || !R.encrypted || !R.devices[self.kid] || R.revokes[self.kid] != null) return;
      var me = R.devices[self.kid], role = R.roleAt(self.kid, selfRow().next_seq), ring = await keyring();
      var mine = allOps().filter(function (o) { return o.env.author === self.kid && (o.env.body.op_type === 'KEYGRANT' || o.env.body.op_type === 'REKEY'); });
      var rekeyed = {}; R.rekeys.forEach(function (k) { k.excludes.forEach(function (x) { rekeyed[x] = 1; }); });
      mine.forEach(function (o) { if (o.env.body.op_type === 'REKEY') (o.env.body.params.excludes || []).forEach(function (x) { rekeyed[x] = 1; }); });   // my own, even if still unplaced
      var need = Object.keys(R.revokes).filter(function (k) { return R.holdersAll[k] && !rekeyed[k]; }).sort();
      if (role.comm_admin && need.length) {
        var epoch = R.epoch + 1, key = await _newSpaceKey();
        await author({ target: { table: 'comm_epoch', uu: await ROS.epochUU(space, epoch) }, body: { op_type: 'REKEY', params: { epoch: epoch, excludes: need } } });
        var n = 0, kids = Object.keys(R.devices).sort();
        for (var k of kids) { if (R.revokes[k] != null || !R.devices[k].dh) continue; await grantKey(k, R.devices[k].dh, epoch, key); n++; }
        rep.granted += n; log('§COMM_REKEY kid=' + self.kid + ' epoch=' + epoch + ' excludes=' + need.join(',') + ' grants=' + n);
        L = await cur(); R = L.roster; ring = await keyring();
      }
      var have = {}; R.grants.forEach(function (g) { have[g.kid + '#' + g.epoch] = 1; });
      allOps().forEach(function (o) { if (o.env.author === self.kid && o.env.body.op_type === 'KEYGRANT') have[o.env.body.params.kid + '#' + o.env.body.params.epoch] = 1; });   // mine, accepted or not: never re-issue
      for (var kid of Object.keys(R.devices).sort()) { var d = R.devices[kid];
        if (kid === self.kid || R.revokes[kid] != null || !d.dh || !(role.comm_admin || d.person === me.person)) continue;
        for (var ep of Object.keys(ring).map(Number).sort()) { if (have[kid + '#' + ep]) continue;
          await grantKey(kid, d.dh, ep, ring[ep][0]); rep.granted++; log('§COMM_KEY kid=' + self.kid + ' repair-grant to=' + kid + ' epoch=' + ep); } }
    }

    // the post-office visit (§11.17): note my visit, collect my mail
    async function sync(pipe) {
      var rep = { sent: 0, fetched: 0, received: 0, contenders: 0, rejected: 0, readBackFail: 0, sealed: 0, opened: 0, tampered: 0, granted: 0 };
      // 1. collect: plaintext ops are ingested; sealed ones wait in cl_sealed until a key opens them
      for (var on of await pipe.list(SP + 'o/')) {
        if (on.indexOf(SP + 'o/' + self.kid + '/') === 0) continue;
        if (_q(db, 'SELECT 1 FROM cl_fetched WHERE name=? AND pipe_id=?', [on, pipe.id]).length) continue;
        var ob = await pipe.get(on); if (!ob) continue;                 // withheld/absent: try again next visit
        rep.fetched++;
        for (var it of _rows(ob)) {
          if (it.text.indexOf('enc:') === 0) {
            var ex = _q(db, 'SELECT 1 FROM cl_op WHERE op_hash=? UNION SELECT 1 FROM cl_contender WHERE op_hash=? UNION SELECT 1 FROM cl_sealed WHERE op_hash=?', [it.hash, it.hash, it.hash]);
            if (!ex.length) { var m = /^enc:(\d+):/.exec(it.text); db.run('INSERT INTO cl_sealed VALUES (?,?,?,?,?)', [it.hash, m ? Number(m[1]) : null, it.text, on, pipe.id]); }
            continue;
          }
          var st = await ingest(JSON.parse(it.text), pipe.id);
          if (st === 'RECEIVED') rep.received++; else if (st === 'CONTENDER') rep.contenders++; else if (st.indexOf('REFUSED') === 0) rep.rejected++;
        }
        db.run('INSERT OR IGNORE INTO cl_fetched VALUES (?,?)', [on, pipe.id]);
      }
      await openSealed(rep);
      await autoKeys(rep);
      // 2. send my news
      var nb = await bundleNew();
      async function readBack() {
        var back = await pipe.get(nb.name), ok = false;
        if (back) { var got = _rows(back).map(function (x) { return x.hash; }); ok = got.length === nb.hashes.length && got.every(function (h, i) { return h === nb.hashes[i]; }); }
        db.run('INSERT OR REPLACE INTO cl_outbox VALUES (?,?,?,?)', [nb.name, nb.from, nb.to, ok ? 'SENT' : 'PUT-UNVERIFIED']);
        if (ok) { db.run('UPDATE cl_self SET bundled_to=? WHERE kid=?', [nb.to, self.kid]); rep.sent = nb.hashes.length; } else rep.readBackFail++;
      }
      // a pipe that can batch (GitHub: 6 pushes/min/repo) gets bundle + head in ONE putMany at the end of the visit
      var batched = typeof pipe.putMany === 'function';
      if (nb && !batched) { await pipe.put(nb.name, nb.bytes); await readBack(); }
      var L = await order();
      if (batched) { var batch = [{ name: SP + 'h/' + self.kid, bytes: _json(await signedHead()) }]; if (nb) batch.unshift({ name: nb.name, bytes: nb.bytes });
        await pipe.putMany(batch); if (nb) await readBack(); }
      else await pipe.put(SP + 'h/' + self.kid, _json(await signedHead()));
      for (var hn of await pipe.list(SP + 'h/')) {
        var hb = await pipe.get(hn); if (!hb) continue; var hd = _unjson(hb), dv = L.roster.devices[hd.author];
        if (!dv || !(await ENV.verify(hd, dv.jwk))) continue;            // a head counts only from an enrolled device
        db.run('INSERT OR REPLACE INTO cl_head_seen VALUES (?,?,?,?,?,?)', [hd.author, pipe.id, hd.seq, hd.hash, JSON.stringify(hd.frontier || {}), hd.sig]);
      }
      var cnt = function (v) { return Object.keys(L.verdict).filter(function (h) { return L.verdict[h].verdict === v; }).length; };
      rep.placed = L.order.length; rep.parked = cnt('PARKED'); rep.refused = cnt('REFUSED'); rep.gaps = gaps().length; rep.equivocations = L.equivocations.length;
      rep.sealed = _q(db, 'SELECT COUNT(*) AS n FROM cl_sealed')[0].n;
      var ringNow = await keyring(), held = Object.keys(ringNow).map(Number).sort();
      log('§COMM_TRUST mode=roster genesis=' + (L.roster.ok ? String(L.roster.genesis).slice(0, 12) : 'NONE(' + L.roster.reason + ')') +
          ' space=' + space.slice(0, 12) + ' devices=' + Object.keys(L.roster.devices).length + ' revoked=' + Object.keys(L.roster.revokes).length);
      log('§COMM_SYNC kid=' + self.kid + ' pipe=' + pipe.id + ' sent=' + rep.sent + ' fetched=' + rep.fetched + ' received=' + rep.received +
          ' placed=' + rep.placed + ' parked=' + rep.parked + ' refused=' + rep.refused + ' gaps=' + rep.gaps + ' equivocations=' + rep.equivocations);
      if (L.roster.encrypted || rep.sealed || rep.tampered) log('§COMM_CRYPT kid=' + self.kid + ' epochs=' + (held.join(',') || 'none') + ' sealed=' + rep.sealed + ' opened=' + rep.opened + ' tampered=' + rep.tampered + ' granted=' + rep.granted);
      return rep;
    }

    // delivery ladder for my own ops (§11.15): SAVED → SENT (read-back) → SEEN by <kid> (their signed head covers my seq)
    function delivery() {
      var me = selfRow(), seenBy = {}, vd = {};
      _q(db, 'SELECT author_kid, frontier_json FROM cl_head_seen WHERE author_kid<>?', [self.kid]).forEach(function (r) { seenBy[r.author_kid] = JSON.parse(r.frontier_json)[self.kid] || 0; });
      _q(db, 'SELECT op_hash, verdict, reason FROM cl_verdict').forEach(function (r) { vd[r.op_hash] = r; });
      return _q(db, "SELECT op_hash, author_seq FROM cl_op WHERE author_kid=? AND state='OWN' ORDER BY author_seq", [self.kid]).map(function (r) {
        var by = Object.keys(seenBy).filter(function (k) { return seenBy[k] >= r.author_seq; }).sort(), v = vd[r.op_hash];
        return { seq: r.author_seq, hash: r.op_hash, state: by.length ? 'SEEN' : (r.author_seq <= me.bundled_to ? 'SENT' : 'SAVED'), seenBy: by,
                 verdict: v ? v.verdict : null, reason: v ? v.reason : null };
      });
    }
    async function placedEnvelopes() {
      var L = await cur(), env = {}; allOps().forEach(function (o) { env[o.hash] = o.env; });
      return L.order.map(function (h) { return { hash: h, env: env[h] }; }).filter(function (p) { return !ROS.IDENTITY[p.env.body.op_type]; });
    }
    function verdicts() { return _q(db, 'SELECT * FROM cl_verdict'); }

    return { kid: self.kid, space: space, db: db, author: author, ingest: ingest, order: order, frontier: frontier, versions: versions, gaps: gaps,
             genesis: genesis, addPerson: addPerson, enroll: enroll, setRole: setRole, revoke: revoke,
             keyring: keyring, sealed: function () { return _q(db, 'SELECT op_hash, epoch, bundle FROM cl_sealed'); },
             bundleNew: bundleNew, readBundle: readBundle, signedHead: signedHead, sync: sync, delivery: delivery, placedEnvelopes: placedEnvelopes,
             conflicts: conflicts, foldable: foldable, notices: notices, saveCheck: saveCheck,
             verdicts: verdicts, query: function (sql, args) { return _q(db, sql, args); } };
  }

  // a fresh device identity: WebCrypto P-256, private key non-extractable (as erp/erp_signer.js)
  async function newDevice() {
    var kp = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    var jwk = await globalThis.crypto.subtle.exportKey('jwk', kp.publicKey);
    var pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    return ensureDh({ kid: await ROS.kidOf(pub), privateKey: kp.privateKey, pubJwk: pub });
  }
  // CL8: the second key pair, for key exchange (P-256 signing keys cannot do ECDH). Private part non-extractable.
  // Also upgrades a device object saved before CL8 (no dh keys yet) — it is only useful if done BEFORE the device is enrolled.
  async function ensureDh(dev) {
    if (dev.dhPrivateKey && dev.dhPubJwk) return dev;
    var dk = await globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    var dj = await globalThis.crypto.subtle.exportKey('jwk', dk.publicKey);
    dev.dhPrivateKey = dk.privateKey; dev.dhPubJwk = { kty: dj.kty, crv: dj.crv, x: dj.x, y: dj.y }; return dev;
  }
  // a new space: the founder's genesis params and the space id they hash to (the invite)
  async function newSpace(name, founder, personUu, personName, adRoleId) {
    var nonce = _hex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
    var params = { name: name, nonce: nonce, founder: { kid: founder.kid, jwk: founder.pubJwk, person_uu: String(personUu).toLowerCase(), name: personName, ad_role_id: adRoleId } };
    if (founder.dhPubJwk) params.founder.dh_jwk = founder.dhPubJwk;       // CL8: the founder's key-exchange key makes this an encrypted space
    return { params: params, space: await ROS.spaceOf(params) };
  }

  var API = { open: open, newDevice: newDevice, ensureDh: ensureDh, newSpace: newSpace, kidOf: function (j) { return ROS.kidOf(j); } };
  global.CommStore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
