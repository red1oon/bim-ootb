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
 * §13.12.I.1 (Witness: W-BASE-HASH, W-BASE-EDIT) the BASE: newSpace(..., {base}) pins a shared loaded DB in the genesis; baseInfo()/checkBase() let a host verify its copy before folding;
 * ops carry manifest 'b:<sha12>' and an op from another base is REFUSED base-skew; opts.baseRow(table, uu) gives the scope of a record that lives in the base (else base-row-missing).
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
    'CREATE TABLE IF NOT EXISTS cl_lane (op_hash TEXT PRIMARY KEY, lane TEXT NOT NULL)',       // F1 (TEAMWORK_FRAMEWORK §45.8): the mailbox an own op was addressed to; empty in every space without mailboxes
    'CREATE TABLE IF NOT EXISTS cl_boxseq (lane TEXT PRIMARY KEY, n INTEGER NOT NULL)',       // §45.11: the last per-mailbox sequence number I assigned, per lane
    'CREATE TABLE IF NOT EXISTS cl_box (op_hash TEXT PRIMARY KEY, author_kid TEXT NOT NULL, author_seq INTEGER NOT NULL, box TEXT NOT NULL, bseq INTEGER NOT NULL)',       // §45.11: every op I hold that carries a signed `box`
    'CREATE INDEX IF NOT EXISTS cl_box_ab ON cl_box(author_kid, box)',
    'CREATE TABLE IF NOT EXISTS cl_head_boxes (author_kid TEXT, pipe_id TEXT, boxes_json TEXT, PRIMARY KEY(author_kid, pipe_id))',       // §45.11: the `boxes` a signed head claimed
    'CREATE TABLE IF NOT EXISTS cl_sealed (op_hash TEXT PRIMARY KEY, epoch INTEGER, ct TEXT NOT NULL, bundle TEXT, pipe_id TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_outbox (bundle_name TEXT PRIMARY KEY, from_seq INTEGER, to_seq INTEGER, state TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_head_seen (author_kid TEXT, pipe_id TEXT, seq INTEGER, head_hash TEXT, frontier_json TEXT, sig TEXT, PRIMARY KEY(author_kid, pipe_id))',
    'CREATE INDEX IF NOT EXISTS cl_op_type ON cl_op(op_type)',
    'CREATE TABLE IF NOT EXISTS cl_ckpt (state_hash TEXT PRIMARY KEY, status TEXT NOT NULL, state_json TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_snapmeta (state_hash TEXT PRIMARY KEY, name TEXT, state_json TEXT NOT NULL)'
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
  var _aad = function (space, epoch, aud) { return new TextEncoder().encode('bim-comm-op|' + space + '|' + epoch + (aud ? '|' + aud : '')); };      // §45.11: an audience-sealed op cannot be moved to another audience
  // the KEK for one grant: ECDH(my private, their public) → HKDF-SHA256 (bound to space, epoch, from, to) → AES-KW-256
  async function _kek(priv, pubJwk, space, epoch, from, to, aud) {
    var pub = await _sub().importKey('jwk', ROS.dhOf(pubJwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    var bits = await _sub().deriveBits({ name: 'ECDH', public: pub }, priv, 256);
    var hk = await _sub().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return _sub().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('bim-comm-keygrant'),
      info: new TextEncoder().encode(space + '|' + epoch + '|' + from + '|' + to + (aud ? '|' + aud : '')) }, hk, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  }
  async function _newSpaceKey() { return _sub().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); }
  async function _wrap(key, priv, pubJwk, space, epoch, from, to, aud) { return _b64(await _sub().wrapKey('raw', key, await _kek(priv, pubJwk, space, epoch, from, to, aud), 'AES-KW')); }
  async function _unwrap(wrapped, priv, pubJwk, space, epoch, from, to, aud) {
    return _sub().unwrapKey('raw', _unb64(wrapped), await _kek(priv, pubJwk, space, epoch, from, to, aud), 'AES-KW', { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function _seal(env, key, epoch, space, aud) {       // aud (§45.11): sealed to one audience, `enc:<epoch>@<aud>:<b64>`; no aud = the space key, `enc:<epoch>:<b64>`, exactly as before
    var iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await _sub().encrypt({ name: 'AES-GCM', iv: iv, additionalData: _aad(space, epoch, aud) }, key, new TextEncoder().encode(ENV.canonical(env))));
    var out = new Uint8Array(12 + ct.length); out.set(iv, 0); out.set(ct, 12); return 'enc:' + epoch + (aud ? '@' + aud : '') + ':' + _b64(out);
  }
  // → {state:'ok', env, epoch} | {state:'sealed', epoch} (no key for that epoch yet) | {state:'tampered'} (key held, GCM refused it)
  async function _openText(text, ring, space, audRing) {
    var m = /^enc:(\d+)(?:@([A-Za-z0-9_.-]+))?:([A-Za-z0-9+\/=]+)$/.exec(String(text)); if (!m) return { state: 'tampered' };
    var epoch = Number(m[1]), aud = m[2] || null, b = _unb64(m[3]); if (b.length < 28) return { state: 'tampered' };
    var ks = aud ? (((audRing || {})[aud] || {})[epoch] || []).map(function (e) { return e.key; }) : ring[epoch]; if (!ks || !ks.length) return { state: 'sealed', epoch: epoch, aud: aud };
    for (var i = 0; i < ks.length; i++) {
      try { var pt = await _sub().decrypt({ name: 'AES-GCM', iv: b.slice(0, 12), additionalData: _aad(space, epoch, aud) }, ks[i], b.slice(12));
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
    // claims: KEYCLAIM only. Document numbering (BOOKING/BLOCK, opts.sequences, docno_ref) is RETIRED from the comm engine (TEAM_REPLICATION_PLUGIN_STUDY §8.3 A3 / §12.5, owner Q4):
    //   numbering is a core function (AD_Sequence: the processor's own sequence, station tickets as namespace keys). A BOOKING envelope still routes through the claim admission and is
    //   refused bad-claim:op_type; no host ever authored one (§12.1 M6), so no team log is affected.
    var CLAIM = { KEYCLAIM: 1 }, RETIRED_CLAIM = { BOOKING: 1 }, KH = {};
    async function keyhFor(key) { if (!KH[key]) KH[key] = await _sha('claim:' + space + ':' + key); return KH[key]; }
    var SP = 's/' + space + '/';             // §13.6: every pipe name I write or list lives under my space — two spaces on one pipe never meet
    SCHEMA.forEach(function (s) { db.run(s); });
    db.run('INSERT OR IGNORE INTO cl_self (kid, space, person_uu, next_seq, head_hash, bundled_to) VALUES (?,?,?,1,NULL,0)', [self.kid, space, self.person_uu || null]);
    var last = null, sigCache = {};
    // F1 per-device mailboxes (§45.8). MB = the host's three callbacks { laneOf(spec)->lane|null, read({roster,self})->[box], wantHead(kid,{roster,self})->bool }; mbFlag = MB installed AND the genesis says `mailboxes:1`.
    // A space whose genesis lacks the flag (every space founded before F1, every office space) never leaves the shared stream: nothing below changes for it.
    var MB = null, mbFlag = false, mbBoxes = [];
    function setMailbox(cfg) { MB = cfg && typeof cfg.laneOf === 'function' && typeof cfg.read === 'function' ? cfg : null; }
    // §45.11 SEALING IN THE REAL LAYER. Audience sealing is ON only in an encrypted mailbox space whose host supplies holds(aud, kid, ctx) -> bool (who may hold the key of an audience: 'hub' = the hub devices,
    // 'p_<person>' = that person's devices + the hub devices). Without holds the space behaves as F1 (laned ops under the space key). Eligibility is the HOST's; the store only asks.
    function audOn(R) { return !!(MB && typeof MB.holds === 'function' && R && R.ok && R.mailboxes && R.encrypted); }
    function holdsOf(aud, kid, R) { try { return !!MB.holds(aud, kid, { roster: R, self: self }); } catch (e) { return false; } }
    function eligForGrant(aud, kid, R) { return holdsOf(aud, kid, R); }
    function eligForSeal(aud, origin, R) { return holdsOf(aud, origin, R); }
    function audFor(lane, kid, R) {                       // the audience of a laned op: DOWN p_X -> p_X; UP (hub) by a station of person X -> p_X; UP/hub by a hub device -> hub
      if (lane.indexOf('p_') === 0) return lane;
      if (lane === 'hub') { if (holdsOf('hub', kid, R)) return 'hub'; var d = R.devices[kid]; return d ? 'p_' + d.person : null; }
      return null;
    }
    function sealerKey(aud, ep, ar, R) {                  // the first accepted key (fold order) for (aud, epoch) whose ORIGIN is eligible - a member's own candidate key is never sealed to
      var es = (ar[aud] || {})[ep] || [];
      for (var i = 0; i < es.length; i++) if (eligForSeal(aud, es[i].origin, R)) return es[i].key;
      return null;
    }
    function boxOfName(n) { var p = String(n).split('/'); return p[2] === 'm' ? p[3] : null; }

    function selfRow() { return _q(db, 'SELECT * FROM cl_self WHERE kid=?', [self.kid])[0]; }
    function allOps() { return _q(db, 'SELECT op_hash, envelope FROM cl_op').map(function (r) { return { hash: r.op_hash, env: JSON.parse(r.envelope) }; }); }
    async function sigOk(hash, env, jwk) { var k = hash + '|' + (jwk ? jwk.x : ''); if (sigCache[k] == null) sigCache[k] = !!jwk && (await ENV.verify(env, jwk)); return sigCache[k]; }

    // §13.12.I.1 — the scope of a record that lives in the BASE: opts.baseRow(table, uu) -> {client, org} | null (sync or async). The base is immutable
    // (its hash is pinned in the genesis), so an answer is remembered for the life of the store. null = the base has no such row; a host that cannot
    // ANSWER (e.g. the base is not available right now) must throw, not return null — a thrown lookup fails the fold loudly instead of refusing ops.
    var baseMemo = {};
    async function baseLookup(table, uu) {                          // → { found, sc }: found = the base has that row; sc = its {client, org} (null if the row carries none)
      var k = String(table) + '|' + String(uu).toLowerCase(); if (baseMemo[k]) return baseMemo[k];
      var r = await opts.baseRow(String(table), String(uu).toLowerCase()), c = r ? _num(r.client) : null, o = r ? _num(r.org) : null;
      return (baseMemo[k] = { found: !!r, sc: c == null || o == null ? null : { client: c, org: o } });
    }

    // ── the fold ─────────────────────────────────────────────────────────────────────────────────────────────────
    // core(bs, raw, contenders, idS) is the body of order(): bs = a base (the in-force checkpoint's frozen fold of a closed prefix S) or null;
    // raw = the ops to judge (ALL ops when bs is null, else only those beyond S's frontier); idS = the identity ops of S (roster input only).
    // With bs === null every line below is the fold as it was before checkpoints existed.
    async function core(bs, raw, contenders, idS) {
      var byHash = {};
      raw.concat(contenders).forEach(function (o) { byHash[o.hash] = o.env; });
      var known = function (h) { return !!byHash[h] || !!(bs && bs.verdict[h]); };
      // every op claiming a slot is judged the same way whichever arrived first: keep the ONE validly signed claimant;
      // two valid = equivocation; none valid = forged. Identity ops' keys come from the roster itself (fold below).
      var slots = {}; raw.concat(contenders).forEach(function (o) { var k = o.env.author + '#' + o.env.seq; (slots[k] = slots[k] || []).push(o); });
      var roster0 = await ROS.fold(idS.concat(raw, contenders), space), verdict = bs ? Object.create(bs.verdict) : {}, bad = {}, equiv = [], ops = [];
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
      var roster = await ROS.fold(idS.concat(ops), space);
      Object.keys(roster.verdicts).forEach(function (h) { if (!bad[h] && !(bs && bs.verdict[h])) verdict[h] = roster.verdicts[h]; });
      // admit business ops
      var createOf = {}; ops.forEach(function (o) { if (o.env.body.op_type === 'CRUD_CREATE') createOf[o.env.target.uu] = o.env; });
      for (var o of ops) {
        if (ROS.IDENTITY[o.env.body.op_type]) continue;
        if ((o.env.deps || []).some(function (x) { return !known(x); })) { verdict[o.hash] = { verdict: 'PARKED', reason: 'deps' }; continue; }   // what it read hasn't arrived yet
        var dv = roster.devices[o.env.author];
        if (CLAIM[o.env.body.op_type] || RETIRED_CLAIM[o.env.body.op_type]) { verdict[o.hash] = ADM.admitClaim(o.env, roster, { sigOk: dv ? await sigOk(o.hash, o.env, dv.jwk) : false }); continue; }
        var cr = o.env.body.op_type === 'CRUD_CREATE' ? o.env : createOf[o.env.target.uu];
        var sc = cr ? _scopeOfCreate(cr) : (bs && bs.scopes[o.env.target.uu] ? { client: bs.scopes[o.env.target.uu][0], org: bs.scopes[o.env.target.uu][1] } : null), bmiss = false;
        // §13.12.I.1: no CREATE in the log and none frozen in a checkpoint -> the scope of the BASE ROW (the host's lookup over the hash-verified base); only a space that HAS a base asks (a host may supply baseRow unconditionally)
        if (!sc && !cr && !(bs && bs.scopes[o.env.target.uu]) && opts.baseRow && roster.base) { var bl = await baseLookup(o.env.target.table, o.env.target.uu); sc = bl.sc; bmiss = !bl.found; }
        verdict[o.hash] = ADM.admit(o.env, roster, { sigOk: dv ? await sigOk(o.hash, o.env, dv.jwk) : false, base: ADM.baseStamp(roster.base), baseMissing: bmiss,
          scope: sc, access: access || function () { return { allowed: false, reason: 'no-access-adapter' }; } });
        // §16.31: the shape-version judgement only ever DOWNGRADES an op that was admitted (a refusal or park for signature, role, access, scope or deps stays as it is)
        if (opts.versions && verdict[o.hash].verdict === 'MERGED') { var vj = opts.versions.judge(o.env.body, roster.minVAt ? { min_v: roster.minVAt(o.env.author, o.env.seq) } : (roster.policy ? roster.policy.params : null)); if (vj) verdict[o.hash] = vj; }       // §46.6 S1: the floor in force at THIS op's position (like exeAt), never the final policy
        // FL-8 E3 (§38.3): a DocAction status op on a table with a named executor is admitted only from a device whose signed team role IS that executor (study §12.2 2.5: a role only)
        if (roster.executors && verdict[o.hash].verdict === 'MERGED' && o.env.body.op_type === 'SET_STATUS') { var exm = roster.exeAt(o.env.author, o.env.seq), ex = exm ? exm[String(o.env.target.table).toLowerCase()] : undefined;       // §41.2 L2: the map at THIS op's position, not the final one
          if (ex !== undefined) { var okExe = roster.roleAt(o.env.author, o.env.seq).ad_role_id === ex;
            if (!okExe) verdict[o.hash] = { verdict: 'REFUSED', reason: 'not-executor' }; } }
      }
      // TEAMWORK §48.11c piece 4 — LOCAL NUMBERING at fold (host rule opts.docno, downgrade-only like versions): run AFTER every op was admitted, so the log it reads (a format edit on a
      // sequence, a user's CREATE) is the set of MERGED ops — the same on every device whatever the slot order. The station = the author's roster person (bound to an AD_User, §38.15).
      var docno = { judged: 0, refused: 0, unjudged: {} };
      if (opts.docno) {
        var merged = ops.filter(function (x) { return verdict[x.hash] && verdict[x.hash].verdict === 'MERGED'; }), byT = {};
        merged.forEach(function (x) { var tt = String(x.env.target.table).toLowerCase(); (byT[tt] = byT[tt] || []).push({ uu: x.env.target.uu, op_type: x.env.body.op_type, params: x.env.body.params || {} }); });
        for (var dno of merged) { var bt = dno.env.body.op_type; if (bt !== 'CRUD_CREATE' && bt !== 'CRUD_UPDATE') continue;
          var dd = roster.devices[dno.env.author], dj = await opts.docno({ table: dno.env.target.table, uu: dno.env.target.uu, body: dno.env.body, person: dd ? dd.person : null, logOps: function (tt) { return byT[String(tt).toLowerCase()] || []; } });
          if (!dj) continue; docno.judged++;
          if (dj.verdict) { verdict[dno.hash] = { verdict: dj.verdict, reason: dj.reason }; docno.refused++; if (dj.detail) _once('dn:' + dno.hash, '§TEAM_DOCNO_REFUSED ' + dj.reason + ' ' + dj.detail); }
          else if (dj.unjudged) docno.unjudged[dj.unjudged] = (docno.unjudged[dj.unjudged] || 0) + 1; }
      }
      // all-or-none: every op of a DocAction group whose status op was refused not-executor is refused with it (no ghost consequence is ever placed)
      var badGrp = {}; ops.forEach(function (o) { var v = verdict[o.hash], g = (o.env.body.params || {}).grp; if (v && v.reason === 'not-executor' && g) badGrp[g] = 1; });
      ops.forEach(function (go) { var g = (go.env.body.params || {}).grp; if (g && badGrp[g] && verdict[go.hash] && verdict[go.hash].verdict === 'MERGED') verdict[go.hash] = { verdict: 'REFUSED', reason: 'not-executor-group' }; });
      // order the MERGED ones by what they read; cascade refusals onto ops that read a refused version
      var ok = ops.filter(function (o) { return verdict[o.hash] && verdict[o.hash].verdict === 'MERGED'; });
      var okSet = {}; ok.forEach(function (o) { okSet[o.hash] = 1; });
      var cOp = bs && bs.c && okSet[bs.c] ? bs.c : null;            // every op beyond the barrier is placed after the CHECKPOINT op (§13.12.3)
      // claim keys are hashed once per key (the key itself never leaves the device in a snapshot)
      for (var ko of ok) { var kt = ko.env.body.op_type;
        if (CLAIM[kt]) { var ksp = ADM.claimSpec(ko.env); if (!ksp.problem) await keyhFor(ksp.key); } }
      var excluded = {}, L, claims = null, used = null, isRefused = function (x) { var v = verdict[x]; return !!v && v.verdict !== 'MERGED' && v.verdict !== 'PARKED'; };
      for (var pass = 0; pass < 50; pass++) {
        var okNow = ok.filter(function (o) { return !excluded[o.hash]; });
        L = ORD.linearize(okNow.map(function (o) {
          var deps = o.env.deps || [];
          if (bs) { deps = deps.filter(function (d) { return !(bs.verdict[d] && bs.verdict[d].verdict === 'MERGED'); }); if (cOp && o.hash !== cOp) deps = deps.concat([cOp]); }
          return { hash: o.hash, author: o.env.author, seq: o.env.seq, prev: null, deps: deps }; }));
        // order the MERGED ones by what they read; cascade refusals onto ops that read a refused version
        var parkedSet = {}; L.parked.forEach(function (h) { parkedSet[h] = 1; });
        var changed = true;
        while (changed) { changed = false; Object.keys(parkedSet).forEach(function (h) {
          if ((byHash[h].deps || []).some(function (x) { return isRefused(x); })) { verdict[h] = { verdict: 'REFUSED', reason: 'dep-refused' }; delete parkedSet[h]; changed = true; } }); }
        Object.keys(parkedSet).forEach(function (h) { verdict[h] = { verdict: 'PARKED', reason: 'deps' }; });
        // claims: first in fold order wins (§13.12.2); a loser leaves the order, the pass repeats
        var cp = claimsPass(L.order, byHash, bs); claims = cp.claims; used = cp.used;
        if (!cp.losers.length) break;
        cp.losers.forEach(function (l) { verdict[l.h] = { verdict: 'REFUSED', reason: l.reason }; excluded[l.h] = 1; });
      }
      return { docno: docno, order: L.order, verdict: verdict, parked: Object.keys(verdict).filter(function (h) { return verdict[h].verdict === 'PARKED'; }).sort(), equivocations: equiv, roster: roster, createOf: createOf, ops: ops, claims: claims, used: used };
    }

    function claimsPass(order, byHash, bs) {
      var claims = Object.create(bs ? bs.claims : {}), used = Object.create(bs ? bs.used : {}), losers = [];
      function lose(h, why) { losers.push({ h: h, reason: why }); }
      order.forEach(function (h) {
        var env = byHash[h], t = env.body.op_type;
        if (CLAIM[t]) {
          var sp = ADM.claimSpec(env), kh = KH[sp.key], cur = claims[kh];
          if (!cur) { claims[kh] = { h: h, a: env.author, u: sp.until, p: sp.payload }; return; }
          if (sp.takes) { if (sp.takes !== cur.h) return lose(h, 'bad-takeover');
            if (cur.u == null || !(env.ts >= cur.u)) return lose(h, 'lease-live');
            claims[kh] = { h: h, a: env.author, u: sp.until, p: sp.payload }; return; }
          return lose(h, 'key-claimed');
        }
      });
      // `used` (numbers held per sequence/device) stays in the fold result and the checkpoint state SHAPE, carried forward unchanged: it was {} in every host team (no host numbered
      //   documents, §12.1 M6), so a checkpoint's state hash is byte-identical before and after the retirement
      return { claims: claims, used: used, losers: losers };
    }
    // ── checkpoints (§13.12.3) ───────────────────────────────────────────────────────────────────────────────────
    var VERSION_WAIT = { 'needs-upgrade': 1, 'needs-mapping': 1, 'needs-translation': 1 };     // §46.6: the parked reasons that are about what THIS app can read yet - a wait, never a condemnation
    var IDTYPES = Object.keys(ROS.IDENTITY), base = null, verified = {}, badCk = {}, waitCk = {}, rosterCache = {}, baseCache = {}, trusted = {}, authors = null, hasCk = null, ckLoaded = false, prevRest = [], logged = {};
    var HEX = /^[0-9a-f]{64}$/;
    function _once(key, msg) { if (!logged[key]) { logged[key] = 1; log(msg); } }
    function authorList() { if (!authors) { authors = {}; _q(db, 'SELECT DISTINCT author_kid FROM cl_op').forEach(function (r) { authors[r.author_kid] = 1; }); } return Object.keys(authors); }
    function anyCkpt() { if (hasCk === null) hasCk = _q(db, "SELECT 1 FROM cl_op WHERE op_type='CHECKPOINT' LIMIT 1").length > 0; return hasCk; }
    function rowsOf(sql, args) { return _q(db, sql, args).map(function (r) { return { hash: r.op_hash, env: JSON.parse(r.envelope) }; }); }
    function identityRows() { return rowsOf('SELECT op_hash, envelope FROM cl_op WHERE op_type IN (' + IDTYPES.map(function () { return '?'; }).join(',') + ')', IDTYPES); }
    function contenderRows() { return rowsOf('SELECT op_hash, envelope FROM cl_contender'); }
    // the ops of author a with lo < seq <= hi (index range, O(new))
    function rangeRows(lo, hi) { var out = [];
      authorList().forEach(function (a) { var l = lo ? (lo[a] || 0) : 0, h = hi ? hi[a] : null;
        if (hi && !h) return; if (h != null && h <= l) return;
        out = out.concat(rowsOf(h != null ? 'SELECT op_hash, envelope FROM cl_op WHERE author_kid=? AND author_seq>? AND author_seq<=?' : 'SELECT op_hash, envelope FROM cl_op WHERE author_kid=? AND author_seq>?', h != null ? [a, l, h] : [a, l])); });
      return out; }
    function idUpTo(rows, f) { return rows.filter(function (o) { return o.env.seq <= (f[o.env.author] || 0); }); }
    function present(f) { return Object.keys(f).every(function (k) { return _q(db, 'SELECT COUNT(*) AS n FROM cl_op WHERE author_kid=? AND author_seq<=?', [k, f[k]])[0].n === f[k]; }); }
    function persistCk(sh, status, st) { db.run('INSERT OR REPLACE INTO cl_ckpt VALUES (?,?,?)', [sh, status, st ? JSON.stringify(st) : null]); }
    async function loadCk() {
      if (ckLoaded) return; ckLoaded = true;
      for (var r of _q(db, 'SELECT * FROM cl_ckpt')) {
        if (r.status === 'ACTIVE') continue;
        if (r.status === 'BAD') { badCk[r.state_hash] = 1; continue; }
        try { var st = JSON.parse(r.state_json); if (st.hash === r.state_hash && Array.isArray(st.order)) verified[r.state_hash] = st; } catch (e) { /* a damaged row is simply not used */ }       // my own saved fold: no need to hash it again
      }
    }
    // state of S = (prev base ++ the ops in (prev frontier, frontier]), judged by the roster of S alone; prevC = the CHECKPOINT op of prev (placed first)
    async function foldS(prevSt, frontier, prevC) {
      var pf = prevSt ? prevSt.frontier : {}, ids = identityRows(), idS = prevSt ? idUpTo(ids, pf) : [];
      var bs = prevSt ? { verdict: prevSt.verdict, scopes: prevSt.scopes, claims: prevSt.claims || {}, used: prevSt.used || {}, c: prevC } : null;
      var raw = rangeRows(pf, frontier), res = await core(bs, raw, [], idS);
      if (res.parked.length) return { problem: 'parked-in-S', versioned: res.parked.some(function (h) { var r = res.verdict[h] && res.verdict[h].reason; return VERSION_WAIT[r]; }) };
      if (res.equivocations.length) return { problem: 'equivocation-in-S' };
      var verdict = Object.assign({}, prevSt ? prevSt.verdict : {}, res.verdict), scopes = Object.assign({}, prevSt ? prevSt.scopes : {});
      Object.keys(res.createOf).forEach(function (u) { var sc = _scopeOfCreate(res.createOf[u]); if (sc) scopes[u] = [sc.client, sc.org]; });
      var st = { v: 1, space: space, frontier: frontier, prev: prevSt ? prevSt.hash : null, order: (prevSt ? prevSt.order : []).concat(res.order), verdict: verdict, scopes: scopes,
                 claims: Object.assign({}, prevSt ? prevSt.claims : {}, res.claims), used: Object.assign({}, prevSt ? prevSt.used : {}, res.used) };
      return { state: st };
    }
    async function stateHashOf(st) { var body = Object.assign({}, st); delete body.hash; return _sha(ENV.canonical(body)); }

    // find the checkpoint to use: highest pos that is accepted, established (verified here, or trusted) and stable
    async function resolveBase(rosterAll, ids, contenders) {
      await loadCk();
      var cands = Object.keys(rosterAll.checkpoints).map(function (sh) { var c = rosterAll.checkpoints[sh]; return { sh: sh, c: c, pos: c.params.pos }; }).sort(function (a, b) { return b.pos - a.pos || (a.sh < b.sh ? -1 : 1); });
      var N = (rosterAll.policy && rosterAll.policy.params.checkpoint && rosterAll.policy.params.checkpoint.cosigs) || 2;
      for (var cd of cands) {
        if (badCk[cd.sh] || waitCk[cd.sh]) continue;
        var st = verified[cd.sh] || await establish(cd, rosterAll, ids, N);
        if (!st) continue;
        var ck = await baseFrom(st, cd, rosterAll, ids, contenders);
        if (ck.problem) { _once('stale:' + cd.sh + ':' + ck.problem, '§CKPT_STALE kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' pos=' + cd.pos + ' reason=' + ck.problem + ' — falling back to the full fold'); continue; }
        return ck.base;
      }
      return null;
    }
    async function establish(cd, rosterAll, ids, N) {
      var f = cd.c.params.frontier;
      if (!present(f)) { _once('pend:' + cd.sh, '§CKPT_PENDING kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' pos=' + cd.pos + ' — not all of its ops are held yet'); return null; }
      // light client: >= N co-signing persons and a snapshot whose state hashes to state_hash — nothing is folded
      if (opts.trustCheckpoints && Object.keys(cd.c.persons).length >= N) {
        var sealedMeta = false;
        for (var mr of _q(db, 'SELECT state_json FROM cl_snapmeta WHERE state_hash=?', [cd.sh])) {
          if (String(mr.state_json).indexOf('enc:') === 0) { sealedMeta = true; continue; }       // not opened yet (openSnapMeta runs after the keys): wait, do not fold
          var st = null, okh = false;
          try { st = JSON.parse(mr.state_json); okh = (await stateHashOf(st)) === cd.sh && ENV.canonical(st.frontier) === ENV.canonical(f) && st.prev === cd.c.params.prev && st.space === space;
            if (okh) { var held = {}; Object.keys(f).forEach(function (k) { _q(db, 'SELECT op_hash FROM cl_op WHERE author_kid=? AND author_seq<=?', [k, f[k]]).forEach(function (r) { held[r.op_hash] = 1; }); });
              var listed = Object.keys(st.verdict); okh = listed.length === Object.keys(held).length && listed.every(function (h) { return held[h]; }); }
          } catch (e) { okh = false; }
          if (okh) { st.hash = cd.sh; verified[cd.sh] = st; trusted[cd.sh] = 1; persistCk(cd.sh, 'OK', st);
            log('§CKPT_TRUST kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' pos=' + cd.pos + ' cosigners=' + Object.keys(cd.c.persons).length + ' adopted without folding S'); return st; }
          log('§CKPT_REFUSED kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' reason=snapshot-state-does-not-hash-to-state_hash-or-lists-other-ops — falling back to my own fold');
        }
        if (sealedMeta && !_q(db, "SELECT 1 FROM cl_snapmeta WHERE state_hash=? AND state_json NOT LIKE 'enc:%'", [cd.sh]).length) { _once('sealedmeta:' + cd.sh, '§CKPT_PENDING kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' — its snapshot state is sealed and my key has not opened it yet'); return null; }
      }
      // verify by my own fold of S (under the barrier of prev)
      var prevSt = null, prevC = null;
      if (cd.c.params.prev) { var pc = rosterAll.checkpoints[cd.c.params.prev]; prevSt = verified[cd.c.params.prev];
        if (!prevSt && pc && !badCk[cd.c.params.prev]) prevSt = await establish({ sh: cd.c.params.prev, c: pc, pos: pc.params.pos }, rosterAll, ids, N);
        if (!prevSt || !pc) { _once('prev:' + cd.sh, '§CKPT_PENDING kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' — its previous checkpoint is not established here'); return null; }
        prevC = pc.ops[0].hash; }
      var r = await foldS(prevSt, f, prevC);
      // §16.31: a prefix this app cannot READ yet (version-parked ops) is not a lie by the co-signers: wait, do not condemn (BAD is persisted forever). refold() lets the next fold look again.
      if (r.problem === 'parked-in-S' && r.versioned) { waitCk[cd.sh] = 1; log('§CKPT_VERSION_WAIT kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' — S holds ops this app cannot read yet; not adopted, not condemned'); return null; }
      if (r.problem) { badCk[cd.sh] = 1; persistCk(cd.sh, 'BAD', null); log('§CKPT_REFUSED kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' reason=' + r.problem); return null; }
      var body = r.state, sh = await stateHashOf(body);
      if (sh !== cd.sh) { badCk[cd.sh] = 1; persistCk(cd.sh, 'BAD', null);
        log('§CKPT_REFUSED kid=' + self.kid + ' state=' + cd.sh.slice(0, 12) + ' reason=state_hash-differs-from-my-fold mine=' + sh.slice(0, 12)); return null; }
      body.hash = sh; verified[sh] = body; persistCk(sh, 'OK', body);
      log('§CKPT_VERIFY kid=' + self.kid + ' state=' + sh.slice(0, 12) + ' pos=' + cd.pos + ' = my own fold of S (' + body.order.length + ' placed, ' + Object.keys(body.verdict).length + ' judged)');
      return body;
    }
    // the static part of a base is built once per checkpoint; the stability check runs at every fold
    async function baseFrom(st, cd, rosterAll, ids, contenders) {
      var f = st.frontier, bc = baseCache[cd.sh];
      if (!bc) {
        var rs = await ROS.fold(idUpTo(ids, f), space);
        if (!rs.ok) return { problem: 'roster-of-S-not-ok' };
        var nRef = 0; Object.keys(st.verdict).forEach(function (h) { if (st.verdict[h].verdict === 'REFUSED') nRef++; });
        bc = baseCache[cd.sh] = { rs: rs, idHashes: idUpTo(ids, f).map(function (o) { return o.hash; }), nRefused: nRef };
      }
      var why = ROS.stableAgainst(bc.rs, rosterAll, f, bc.idHashes);
      if (!why) contenders.forEach(function (o) { if (!why && o.env.seq <= (f[o.env.author] || 0)) why = 'slot-contested'; });
      var first = cd.c.ops[0], cEnv = null; ids.forEach(function (o) { if (o.hash === first.hash) cEnv = o.env; });
      if (!why && (!cEnv || (cEnv.deps || []).some(function (d) { return !st.verdict[d]; }))) why = 'checkpoint-reads-outside-S';
      if (!why && st.verdict[first.hash]) why = 'checkpoint-inside-its-own-S';
      if (why) return { problem: why };
      return { base: { stateHash: cd.sh, state: st, frontier: f, order: st.order, verdict: st.verdict, scopes: st.scopes, claims: st.claims || {}, used: st.used || {}, c: first.hash, rosterS: bc.rs, idHashes: bc.idHashes, nRefused: bc.nRefused, pos: st.order.length } };
    }

    async function plainOrder() {
      if (base) { base = null; prevRest = []; }
      if (hasCk !== false) db.run("DELETE FROM cl_ckpt WHERE status='ACTIVE'");
      var raw = allOps(), contenders = contenderRows();
      var res = await core(null, raw, contenders, []);
      db.run('DELETE FROM cl_verdict');
      var pos = {}; res.order.forEach(function (h, i) { pos[h] = i; });
      Object.keys(res.verdict).forEach(function (h) { db.run('INSERT INTO cl_verdict VALUES (?,?,?,?)', [h, pos[h] != null ? pos[h] : null, res.verdict[h].verdict, res.verdict[h].reason || null]); });
      last = { docno: res.docno, order: res.order, parked: res.parked, equivocations: res.equivocations, roster: res.roster, verdict: res.verdict, claims: res.claims, used: res.used };
      return last;
    }
    async function orderWithCkpt() {
      var ids = identityRows(), contenders = contenderRows();
      var rosterAll = await ROS.fold(ids, space);
      if (!rosterAll.ok) return null;
      var b = await resolveBase(rosterAll, ids, contenders);
      if (!b) return null;
      var raw = rangeRows(b.frontier, null), res = await core(b, raw, contenders, idUpTo(ids, b.frontier));
      var why = ROS.stableAgainst(b.rosterS, res.roster, b.frontier, b.idHashes);         // the authoritative check, with the roster the fold actually used
      if (why) { _once('stale2:' + b.stateHash + why, '§CKPT_STALE kid=' + self.kid + ' state=' + b.stateHash.slice(0, 12) + ' reason=' + why + ' — falling back to the full fold'); return null; }
      if (!base || base.stateHash !== b.stateHash) {                   // activation: the frozen rows go into cl_verdict once (a saved comm.db already has them)
        base = b; prevRest = [];
        if (!_q(db, "SELECT 1 FROM cl_ckpt WHERE state_hash=? AND status='ACTIVE'", ['A:' + b.stateHash]).length) {
          db.run("DELETE FROM cl_ckpt WHERE status='ACTIVE'"); db.run('DELETE FROM cl_verdict');
          var sp = {}; b.order.forEach(function (h, i) { sp[h] = i; });
          Object.keys(b.verdict).forEach(function (h) { db.run('INSERT INTO cl_verdict VALUES (?,?,?,?)', [h, sp[h] != null ? sp[h] : null, b.verdict[h].verdict, b.verdict[h].reason || null]); });
          db.run("INSERT INTO cl_ckpt VALUES (?,?,NULL)", ['A:' + b.stateHash, 'ACTIVE']); }
        log('§CKPT_ADOPT kid=' + self.kid + ' state=' + b.stateHash.slice(0, 12) + ' pos=' + b.pos + ' judged=' + Object.keys(b.verdict).length + ' refused=' + b.nRefused + ' rest=' + raw.length);
      }
      if (Object.keys(verified).length > 1) {                           // older folded states are not needed again: keep only the one in force (memory and comm.db)
        Object.keys(verified).forEach(function (h) { if (h !== b.stateHash && verified[h].order.length <= b.pos) { delete verified[h]; delete trusted[h]; delete baseCache[h]; } });
        db.run("DELETE FROM cl_ckpt WHERE status='OK' AND state_hash<>?", [b.stateHash]); }
      prevRest.forEach(function (h) { db.run('DELETE FROM cl_verdict WHERE op_hash=?', [h]); });
      var pos = {}; res.order.forEach(function (h, i) { pos[h] = b.pos + i; });
      var own = Object.keys(res.verdict); prevRest = own;
      own.forEach(function (h) { db.run('INSERT OR REPLACE INTO cl_verdict VALUES (?,?,?,?)', [h, pos[h] != null ? pos[h] : null, res.verdict[h].verdict, res.verdict[h].reason || null]); });
      last = { order: b.order.concat(res.order), parked: res.parked, equivocations: res.equivocations, roster: res.roster, verdict: res.verdict, base: b, claims: res.claims, used: res.used };
      return last;
    }
    async function order() {
      var res;
      if (!opts.noCheckpoint && anyCkpt()) { var r = await orderWithCkpt(); if (r) res = r; }
      if (!res) res = await plainOrder();
      mbFlag = !!(MB && res && res.roster && res.roster.mailboxes); mbBoxes = mbFlag ? ((await MB.read({ roster: res.roster, self: self })) || []) : []; return res;
    }

    async function cur() { return last || order(); }

    // my epoch keys, derived from the KEYGRANTs addressed to me that the roster accepted: {epoch: [CryptoKey]} (§13.2).
    // Memoised on the fold result, so any new op (a new grant, a revoke) re-derives; nothing is persisted.
    var ringFor = null, ringVal = {}, audVal = {};
    async function keyring() {
      var L = await cur(); if (ringFor === L) return ringVal;
      var ring = {}, ar = {}, R = L.roster;
      if (self.dhPrivateKey && R.ok) for (var g of R.grants) {
        if (g.kid !== self.kid) continue;
        var from = R.devices[g.from_kid]; if (!from || !from.dh) continue;
        try { var k = await _unwrap(g.wrapped, self.dhPrivateKey, from.dh, space, g.epoch, g.from_kid, self.kid, g.aud);
          if (g.aud) ((ar[g.aud] = ar[g.aud] || {})[g.epoch] = ar[g.aud][g.epoch] || []).push({ key: k, origin: g.origin });       // §45.11: {aud: {epoch: [{key, origin}]}}
          else (ring[g.epoch] = ring[g.epoch] || []).push(k); } catch (e) { /* a grant that does not open is not a key */ }
      }
      ringFor = L; ringVal = ring; audVal = ar; return ring;
    }
    async function audKeyring() { await keyring(); return audVal; }
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
      L.order.forEach(function (h, i) { pos[h] = i; var e = byHash[h]; if (ROS.IDENTITY[e.body.op_type] || CLAIM[e.body.op_type]) return; (rec[e.target.uu] = rec[e.target.uu] || []).push(h); });
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
        if (opts.versions) p = { hash: p.hash, env: Object.assign({}, p.env, { body: opts.versions.upcast(p.env.body) }) };      // §16.31: a COPY in the app's current shape; the stored envelope is never touched
        if (!hold[p.hash]) return p;
        var e = JSON.parse(JSON.stringify(p.env)), ch = e.body.params.changes || {};
        Object.keys(hold[p.hash]).forEach(function (c) { delete ch[c]; });
        return { hash: p.hash, env: e, held: Object.keys(hold[p.hash]) };
      });
    }
    // §16.31: what a UI says instead of a spinner. Provisional while any op is parked for a version reason; re-judged by every fold (call refold() after loading a set or changing appV).
    async function versionState() {
      var L = await order(), parked = {}, refused = {}, prov = false, nP = 0, nR = 0;
      Object.keys(L.verdict).forEach(function (h) { var v = L.verdict[h];
        if (v.verdict === 'PARKED') { nP++; parked[v.reason] = (parked[v.reason] || 0) + 1; if (VERSION_WAIT[v.reason]) prov = true; }
        else if (v.verdict === 'REFUSED' && /^(bogus-version|retired-version)$/.test(v.reason)) { nR++; refused[v.reason] = (refused[v.reason] || 0) + 1; } });
      return { parked_count: nP, provisional: prov, parked_by_reason: parked, refused_count: nR, refused_by_reason: refused };
    }
    function refold() { last = null; waitCk = {}; }
    // §46.6 S3: the version-parked ops that hold their OWN author's chain out of every checkpoint (an undecided op caps that author's frontier; the other authors proceed). [{author, seq, reason, hash}], first held op per author.
    function heldOps(L) { var by = {};
      Object.keys(L.verdict).forEach(function (h) { var v = L.verdict[h]; if (v.verdict !== 'PARKED' || !VERSION_WAIT[v.reason]) return;
        var r = _q(db, 'SELECT author_kid AS a, author_seq AS q FROM cl_op WHERE op_hash=?', [h])[0]; if (!r) return;
        if (!by[r.a] || r.q < by[r.a].seq) by[r.a] = { author: r.a, seq: r.q, reason: v.reason, hash: h }; });
      return Object.keys(by).sort().map(function (a) { return by[a]; }); }
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
      var f = {};
      _q(db, 'SELECT author_kid AS a, MAX(author_seq) AS m, COUNT(*) AS c FROM cl_op GROUP BY author_kid').forEach(function (r) {
        if (r.m === r.c) { f[r.a] = r.m; return; }                           // seqs are unique and >= 1, so count == max means 1..max are all held
        var have = {}; _q(db, 'SELECT author_seq FROM cl_op WHERE author_kid=?', [r.a]).forEach(function (q) { have[q.author_seq] = 1; });
        var n = 0; while (have[n + 1]) n++; f[r.a] = n; });
      return f;
    }
    // F1: in a mailbox space a seq hole may be an op addressed to someone else, so the receipt a head carries is the highest seq held per author (the sender's SEEN still turns on).
    // A withheld mailbox bundle is seen through the signed per-box sequence instead (§45.11, boxGaps below).
    async function recvMax() { var f = {}; _q(db, 'SELECT author_kid AS a, MAX(author_seq) AS m FROM cl_op GROUP BY author_kid').forEach(function (r) { f[r.a] = r.m; }); return f; }
    // §45.11: in a mailbox space a missing op is a missing BOX sequence number. Per (author, box I read): the numbers I hold (cl_box) plus the top the author's signed head claimed (cl_head_boxes);
    // every n below the top that I do not hold is a gap {author, box, seq}. (Plain author seq holes stay meaningless here: they are mail for another box.)
    function boxGaps() {
      var mine = {}, held = {}, top = {}, out = []; mbBoxes.forEach(function (b) { mine[b] = 1; });
      _q(db, 'SELECT author_kid AS a, box AS b, bseq AS s FROM cl_box WHERE author_kid<>?', [self.kid]).forEach(function (r) { if (!mine[r.b]) return;
        ((held[r.a] = held[r.a] || {})[r.b] = held[r.a][r.b] || {})[r.s] = 1; ((top[r.a] = top[r.a] || {})[r.b] = Math.max(top[r.a][r.b] || 0, r.s)); });
      _q(db, 'SELECT author_kid AS a, boxes_json AS j FROM cl_head_boxes').forEach(function (r) { if (r.a === self.kid) return; var bx; try { bx = JSON.parse(r.j); } catch (e) { return; }
        Object.keys(bx).forEach(function (b) { if (!mine[b] || !Number.isInteger(bx[b])) return; (top[r.a] = top[r.a] || {}); top[r.a][b] = Math.max(top[r.a][b] || 0, bx[b]); }); });
      Object.keys(top).sort().forEach(function (a) { Object.keys(top[a]).sort().forEach(function (b) { var have = (held[a] || {})[b] || {};
        for (var n = 1; n <= top[a][b]; n++) if (!have[n]) out.push({ author: a, box: b, seq: n }); }); });
      return out;
    }
    function gaps() {
      if (mbFlag) return boxGaps();
      var out = [], ops = {}, top = {}, order = [];
      _q(db, 'SELECT author_kid AS a, MAX(author_seq) AS m, COUNT(*) AS c FROM cl_op GROUP BY author_kid').forEach(function (r) { ops[r.a] = r; top[r.a] = r.m; order.push(r.a); });
      _q(db, 'SELECT author_kid AS a, MAX(seq) AS s FROM cl_head_seen GROUP BY author_kid').forEach(function (r) { if (!(r.a in top)) order.push(r.a); top[r.a] = Math.max(top[r.a] || 0, r.s); });
      order.forEach(function (a) {
        if (ops[a] && ops[a].c === top[a]) return;                           // nothing missing below the top
        var have = {}; _q(db, 'SELECT author_seq FROM cl_op WHERE author_kid=?', [a]).forEach(function (q) { have[q.author_seq] = 1; });
        for (var q = 1; q <= top[a]; q++) if (!have[q]) out.push({ author: a, seq: q }); });
      return out;
    }

    // spec = { target, body, intent?, refs?:[uu], ts?, attrib? }. Identity ops also read the space + my device + my person.
    var unrFor = null, unrVal = {};
    async function unreadable() { var L = await cur(); if (unrFor === L) return unrVal; var out = {};          // §46.6 S5: every record touched by an op parked for a VERSION reason (memoised on the fold result)
      for (var h of Object.keys(L.verdict)) { var v = L.verdict[h]; if (v.verdict !== 'PARKED' || !VERSION_WAIT[v.reason]) continue;
        var rr = _q(db, 'SELECT envelope FROM cl_op WHERE op_hash=?', [h])[0]; if (!rr) continue;
        for (var tu of await ROS.touched(JSON.parse(rr.envelope))) out[String(tu).toLowerCase()] = 1; }
      unrFor = L; unrVal = out; return out; }
    async function author(spec) { return authorOne(spec, await versions(), null); }
    // §41.2 L1 (profiled: author() costs O(log size) per op - versions() walks the whole log, cur() refolds it - so N ops cost O(N^2)): a BATCH of business ops reads the versions and the base ONCE and keeps its own
    // heads current (an op's head replaces what it read). The envelopes are the ones author() would have made one by one. -> { done: [{env, hash}], error }
    async function authorMany(specs) {
      var ver = await versions(), rbc = {}, done = [];
      try { for (var sp of specs) { if (ROS.IDENTITY[sp.body.op_type]) throw new Error('authorMany: business ops only'); var a = await authorOne(sp, ver, rbc); ver[String(sp.target.uu).toLowerCase()] = a.hash; done.push(a); } }
      catch (e) { return { done: done, error: e }; }
      return { done: done, error: null };
    }
    async function authorOne(spec, ver, rbc) {
      var me = selfRow(), reads = {}, ident = !!ROS.IDENTITY[spec.body.op_type];
      var uus = [String(spec.target.uu).toLowerCase()].concat((spec.refs || []).map(function (u) { return String(u).toLowerCase(); }));
      if (opts.versions && !ident) { var unr = await unreadable(), hit = uus.filter(function (u) { return unr[u]; })[0];         // §46.6 S5 (D10): a record whose history holds ops THIS app has parked is read-only here - a write would be made from a partial picture of it
        if (hit) { var er = new Error('needs-upgrade: record ' + hit + ' has changes this app cannot read yet; it is read-only here until the app (or a translation) is updated'); er.code = 'needs-upgrade'; er.uu = hit; log('§VERSION_READONLY kid=' + self.kid + ' uu=' + hit.slice(0, 8) + ' (a write was refused locally: needs-upgrade)'); throw er; } }
      if (ident && spec.body.op_type !== 'GENESIS') uus = uus.concat([await ROS.spaceUU(space), await ROS.devUU(self.kid), String(me.person_uu || '').toLowerCase()].filter(Boolean));
      uus.forEach(function (u) { reads[u] = ver[u] || null; });
      var deps = [].concat.apply([], Object.keys(reads).map(function (k) { var r = reads[k]; return r == null ? [] : (Array.isArray(r) ? r : [r]); })).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
      // §13.12.I.1: in a space with a base every business op carries the short hash of the base it was authored on (the DB the host actually
      // loaded, opts.baseSha256, else the team's own); identity ops stay m0. A caller-supplied manifest wins.
      var rb = ident ? null : rbc ? (rbc.v !== undefined ? rbc.v : (rbc.v = (await cur()).roster.base)) : (await cur()).roster.base, stamp = rb ? ADM.baseStamp({ sha256: opts.baseSha256 || rb.sha256 }) : null;
      // F1 (§45.8): the lane of a business op in a mailbox space (the genesis gate: a space without `mailboxes:1` never has a lane). §45.11: computed BEFORE signing, because a laned op carries a SIGNED
      // per-mailbox sequence `box: {name, seq}` (n = 1,2,3... per author and lane), which is what lets a receiver see a withheld mailbox bundle as a gap.
      var lane = null, box = null;
      if (!ident && MB) { var mbOn = rbc ? (rbc.mb !== undefined ? rbc.mb : (rbc.mb = !!(await cur()).roster.mailboxes)) : !!(await cur()).roster.mailboxes;
        if (mbOn) { lane = MB.laneOf(spec); if (lane != null && !/^[A-Za-z0-9_.-]+$/.test(String(lane))) lane = null; if (lane) { lane = String(lane); var bq0 = _q(db, 'SELECT n FROM cl_boxseq WHERE lane=?', [lane])[0]; box = { name: lane, seq: (bq0 ? bq0.n : 0) + 1 }; } } }
      var env = { v: 3, space: space, author: self.kid, seq: me.next_seq, prev: me.head_hash || null, deps: deps, reads: reads,
                  manifest: spec.manifest || stamp || 'm0', policy: spec.policy || 'p0', intent: spec.intent || (ident ? 'K-ID' : 'K1'),
                  target: spec.target, base: reads[uus[0]], ts: spec.ts != null ? spec.ts : Date.now(), body: spec.body };
      if (spec.attrib) env.attrib = spec.attrib;
      if (box) env.box = box;
      var vr = ENV.validate(env); if (!vr.ok) throw new Error('author: invalid envelope — ' + vr.errors.join('; '));
      env = await ENV.sign(env, self);
      var h = await ENV.hashHex(env);
      db.run('INSERT INTO cl_op VALUES (?,?,?,?,?,?,?,?,?,?,?)', [h, self.kid, env.seq, env.prev, JSON.stringify(env.deps), env.body.op_type, env.target.table, env.target.uu, JSON.stringify(env), 'local', 'OWN']);
      db.run('UPDATE cl_self SET next_seq=?, head_hash=? WHERE kid=?', [env.seq + 1, h, self.kid]);
      if (lane) db.run('INSERT OR REPLACE INTO cl_lane VALUES (?,?)', [h, lane]);
      if (env.box) { db.run('INSERT OR REPLACE INTO cl_boxseq VALUES (?,?)', [lane, env.box.seq]); db.run('INSERT OR REPLACE INTO cl_box VALUES (?,?,?,?,?)', [h, self.kid, env.seq, env.box.name, env.box.seq]); }
      if (authors) authors[self.kid] = 1; if (env.body.op_type === 'CHECKPOINT') hasCk = true;
      last = null; return { env: env, hash: h };
    }

    // identity helpers (the ops §11.5 names)
    async function grantKey(kid, dhJwk, epoch, key, aud, origin) {     // one KEYGRANT: the epoch key wrapped for device `kid` (§13.2); with aud/origin (§45.11) an AUDIENCE key of that epoch
      var wrapped = await _wrap(key, self.dhPrivateKey, dhJwk, space, epoch, self.kid, kid, aud);
      var params = { kid: kid, epoch: epoch, from_kid: self.kid, wrapped: wrapped }; if (aud) { params.aud = aud; params.origin = origin; }
      return author({ target: { table: 'comm_device', uu: await ROS.devUU(kid) }, refs: [await ROS.epochUU(space, epoch)], body: { op_type: 'KEYGRANT', params: params } });
    }
    // §45.11 audience keys, a HUB device's housekeeping (and at enroll): at the newest epoch every audience ('hub', 'p_<person>' of every person with a non-hub device) has a key whose origin is eligible;
    // a missing one is created here and granted to the eligible devices; every audience key I hold (eligible origin) that an eligible device lacks is granted. A station never creates keys.
    async function audKeys(rep) {
      var L = await cur(), R = L.roster;
      if (!audOn(R) || !self.dhPrivateKey || !R.devices[self.kid] || R.revokes[self.kid] != null || !holdsOf('hub', self.kid, R)) return 0;
      var ring = await keyring(), ep = _newest(ring); if (ep == null) return 0;
      var ar = await audKeyring(), me = R.devices[self.kid], role = R.roleAt(self.kid, selfRow().next_seq), n = 0;
      var active = Object.keys(R.devices).sort().filter(function (k) { return R.revokes[k] == null && R.devices[k].dh; });
      var auds = {}; auds.hub = 1; active.forEach(function (k) { if (!holdsOf('hub', k, R)) auds['p_' + R.devices[k].person] = 1; });
      var have = {}; R.grants.forEach(function (g) { if (g.aud && holdsOf(g.aud, g.origin, R)) have[g.kid + '#' + g.aud + '#' + g.epoch] = 1; });
      rowsOf("SELECT op_hash, envelope FROM cl_op WHERE author_kid=? AND op_type='KEYGRANT'", [self.kid]).forEach(function (o) { var q = o.env.body.params; if (q.aud) have[q.kid + '#' + q.aud + '#' + q.epoch] = 1; });      // mine, accepted or not: never re-issue
      function mayGrant(k) { return role.comm_admin || R.devices[k].person === me.person; }
      async function give(aud, epoch, key, origin) {
        for (var k of active) { if (have[k + '#' + aud + '#' + epoch] || !mayGrant(k) || !eligForGrant(aud, k, R)) continue;
          await grantKey(k, R.devices[k].dh, epoch, key, aud, origin); have[k + '#' + aud + '#' + epoch] = 1; n++; if (rep) rep.granted++;
          log('§COMM_KEY kid=' + self.kid + ' aud-grant to=' + k + ' aud=' + aud + ' epoch=' + epoch + ' origin=' + origin.slice(0, 12)); } }
      for (var aud of Object.keys(auds).sort()) {                      // 1. create the key of an audience that has no eligible-origin key at the newest epoch
        var has = ((ar[aud] || {})[ep] || []).some(function (e) { return holdsOf(aud, e.origin, R); });
        if (!has) { var key = await _newSpaceKey(); if (!holdsOf(aud, self.kid, R)) continue; await give(aud, ep, key, self.kid); log('§COMM_KEY kid=' + self.kid + ' aud-create aud=' + aud + ' epoch=' + ep); } }
      ar = await audKeyring();
      for (var a2 of Object.keys(ar).sort()) for (var e2 of Object.keys(ar[a2]).map(Number).sort())          // 2. repair: a key I hold (eligible origin) that an eligible device lacks
        for (var ent of ar[a2][e2]) if (holdsOf(a2, ent.origin, R)) await give(a2, e2, ent.key, ent.origin);
      return n;
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
        log('§COMM_KEY kid=' + self.kid + ' enroll=' + kid + ' granted_epochs=' + n);
        await audKeys(null); }                                                                  // §45.11: the same visit - the pair key(s) of the new device's audiences
      return r;
    }
    async function setRole(p) { return author({ target: { table: 'comm_person', uu: String(p.person_uu).toLowerCase() }, body: { op_type: 'ROLE', params: p } }); }
    // §13.12.1: the admin's config op. params = { epoch, visit_ms?, bundle_max_ops?, gate?, checkpoint?, lease_ttl_ms?, pipes?, manifest?, number_prefix? }.
    // A new POLICY reads the previous one (same record), so concurrent policies show up as heads and the fold keeps one epoch.
    async function setPolicy(params) {
      if (params && params.executors !== undefined && params.from_seq === undefined) params = Object.assign({}, params, { from_seq: await frontier() });       // §41.2 L2: a map is published WITH the frontier it was published at
      if (params && params.min_v && typeof params.min_v === 'object') { var cp0 = await policy(), cm0 = (cp0 && cp0.params.min_v) || {};         // §46.6 S1: a RAISE of the floor is published WITH the frontier it was published at (a carried-forward stamp is stale: replaced)
        if (Object.keys(params.min_v).some(function (k) { return params.min_v[k] > (cm0[k] || 1); }) && (params.from_seq === undefined || (cp0 && ENV.canonical(params.from_seq) === ENV.canonical(cp0.params.from_seq || null)))) params = Object.assign({}, params, { from_seq: await frontier() }); }
      return author({ target: { table: 'comm_policy', uu: await ROS.policyUU(space) }, body: { op_type: 'POLICY', params: params } }); }
    // §38.10 (G-8): publish an owner-signed statement (executors map / plan-trust rotation) as the next POLICY, every other param carried forward; the answer is THIS
    // device's fold verdict — the same one every device reaches — so a stale, untrusted or non-admin statement is reported at once, before any Visit
    var STMT_PARAM = { executors: ['executors', 'executorsStmtProblem'], 'plan-trust': ['planTrust', 'planTrustStmtProblem'] };
    async function publishStatement(stmt) {
      var k = stmt && STMT_PARAM[stmt.kind]; if (!k) return { ok: false, reason: 'unknown-kind' };
      var prob = ROS[k[1]](stmt); if (prob) return { ok: false, reason: 'bad-statement:' + prob };
      var pol = await policy(); var base = pol ? JSON.parse(JSON.stringify(pol.params)) : {};
      base.epoch = (pol ? pol.epoch : 0) + 1; base[k[0]] = stmt; if (stmt.kind === 'executors') delete base.from_seq;       // a fresh frontier is stamped by setPolicy
      var op = await setPolicy(base), v = (await cur()).verdict[op.hash];
      return { ok: !!v && v.verdict === 'MERGED', verdict: v ? v.verdict + (v.reason ? ':' + v.reason : '') : 'none', reason: v && v.verdict !== 'MERGED' ? v.reason : null, hash: op.hash };
    }
    // the policy as folded: { epoch, params, hash, author } | null — and where it sits in the fold order (the same on every device)
    async function policy() { var L = await cur(), pol = L.roster.policy; if (!pol) return null;
      var vr = _q(db, 'SELECT fold_pos FROM cl_verdict WHERE op_hash=?', [pol.hash])[0]; return { epoch: pol.epoch, params: pol.params, hash: pol.hash, author: pol.author, pos: vr ? vr.fold_pos : null, setTrust: L.roster.setTrust || {}, setThreshold: L.roster.setThreshold || {} }; }
    // §13.12.I.1: the base this space sits on, as folded from the trusted genesis: {name, sha256, bytes?, version?} | null (no genesis seen yet, or a space without base —
    // tell them apart with (await order()).roster.ok)
    async function planTrust() { var R = (await cur()).roster; return R.ok && R.planTrust ? R.planTrust : null; }   // §33: the pinned plan trust list, or null
    // §46.5 F5/F7: the folded trust list WITH roles and the threshold in force; the admin time anchor (ms | null). publishAnchor(ts): the admin NAMES ts (no implicit clock read here); the answer is this device's fold verdict.
    async function planTrustInfo() { var R = (await cur()).roster; return R.ok && R.planTrust ? { keys: R.planTrust, threshold: R.planTrustThreshold || 1, epoch: R.planTrustEpoch } : null; }
    async function anchor() { var R = (await cur()).roster; return R.ok && typeof R.anchor === 'number' ? R.anchor : null; }
    async function publishAnchor(ts) {
      var pol = await policy(), base = pol ? JSON.parse(JSON.stringify(pol.params)) : {}; base.epoch = (pol ? pol.epoch : 0) + 1; base.anchor_ts = ts;
      var op = await setPolicy(base), v = (await cur()).verdict[op.hash];
      return { ok: !!v && v.verdict === 'MERGED', verdict: v ? v.verdict + (v.reason ? ':' + v.reason : '') : 'none', reason: v && v.verdict !== 'MERGED' ? v.reason : null, hash: op.hash };
    }
    async function baseInfo() { var R = (await cur()).roster; return R.ok && R.base ? R.base : null; }
    // my offset inside the visit period V (ms); null until a policy fixes V
    async function visitOffset() { var pol = (await cur()).roster.policy; return pol && pol.params.visit_ms ? ROS.staggerOffset(self.kid, pol.params.visit_ms) : null; }
    async function revoke(kid, lastGood) { return author({ target: { table: 'comm_device', uu: await ROS.devUU(kid) }, body: { op_type: 'REVOKE', params: { kid: kid, last_good_seq: lastGood } } }); }

    async function ingest(env, pipeId, bundle) {         // bundle (§45.11) = the object name it came out of, null for a checkpoint snapshot / unknown
      var h = await ENV.hashHex(env);
      if (_q(db, 'SELECT 1 FROM cl_op WHERE op_hash=? UNION SELECT 1 FROM cl_contender WHERE op_hash=?', [h, h]).length) return 'DUP';
      if (!env || env.space !== space) return 'REFUSED:space';
      var vr = ENV.validate(env); if (!vr.ok) return 'REFUSED:invalid ' + vr.errors.join('; ');
      if (env.box !== undefined && (!env.box || typeof env.box.name !== 'string' || !Number.isInteger(env.box.seq) || env.box.seq < 1)) return 'REFUSED:invalid box';
      if (bundle) { var bn = boxOfName(bundle);          // a laned op is only ever in the bundle of its own box; an op with no `box` (F1-era senders) is not judged here
        if (env.box && env.box.name !== bn) { log('§COMM_BOX_MISMATCH kid=' + self.kid + ' op=' + h.slice(0, 12) + ' box=' + env.box.name + ' bundle=' + bundle + ' not ingested'); return 'REFUSED:box-mismatch'; } }
      var slot = _q(db, 'SELECT op_hash FROM cl_op WHERE author_kid=? AND author_seq=?', [env.author, env.seq])[0];
      if (slot) { db.run('INSERT OR IGNORE INTO cl_contender VALUES (?,?,?,?)', [h, env.author, env.seq, JSON.stringify(env)]); last = null; return 'CONTENDER'; }
      db.run('INSERT INTO cl_op VALUES (?,?,?,?,?,?,?,?,?,?,?)', [h, env.author, env.seq, env.prev, JSON.stringify(env.deps), env.body.op_type, env.target.table, env.target.uu, JSON.stringify(env), pipeId, 'RECEIVED']);
      if (env.box) db.run('INSERT OR IGNORE INTO cl_box VALUES (?,?,?,?,?)', [h, env.author, env.seq, env.box.name, env.box.seq]);
      if (authors) authors[env.author] = 1; if (env.body.op_type === 'CHECKPOINT') hasCk = true;
      last = null; return 'RECEIVED';
    }

    // bundle = a tiny SQLite file, one table ops(op_hash, envelope); name hash = sha256 over the op hashes (row stream).
    // CL8: a business envelope is stored as enc:<epoch>:<b64> under my newest epoch key; identity ops stay plaintext. In an
    // encrypted space a business op I cannot yet encrypt is NOT sent (never plaintext) — the bundle stops before it (§13.2).
    async function bundleNew() {
      var me = selfRow(), rows = _q(db, "SELECT op_hash, author_seq, op_type, envelope FROM cl_op WHERE author_kid=? AND state='OWN' AND author_seq>? ORDER BY author_seq", [self.kid, me.bundled_to]);
      var R = (await cur()).roster, ring = await keyring(), ep = _newest(ring), take = [], enc = {}, ar = await audKeyring(), aOn = audOn(R);
      var cap = R.policy && R.policy.params.bundle_max_ops ? R.policy.params.bundle_max_ops : Infinity;     // §13.12.1: the rest goes out at the next visit
      // F1 (§45.8): the ops an own CL_LANE row addresses leave in a bundle of their own under m/<lane>/o/<me>/; everything else (identity ops, ops with no addressee) is the shared bundle, byte-for-byte as before
      var laneOf = {}; if (MB && R.mailboxes) _q(db, 'SELECT op_hash, lane FROM cl_lane').forEach(function (l) { laneOf[l.op_hash] = l.lane; });
      for (var r of rows) {
        if (take.length >= cap) break;
        if (!ROS.IDENTITY[r.op_type]) {
          if (!R.ok || R.encrypted) { if (ep == null) { log('§COMM_SEAL kid=' + self.kid + ' hold seq=' + r.author_seq + ' reason=no-key-yet'); break; }
            var ln = aOn ? laneOf[r.op_hash] : null;
            if (ln) {        // §45.11: a laned op is sealed to ONE audience - held (never the space key, never plaintext) until an eligible-origin key of that audience exists at the newest epoch
              var au = audFor(ln, self.kid, R), ak = au ? sealerKey(au, ep, ar, R) : null;
              if (!ak) { log('§COMM_SEAL kid=' + self.kid + ' hold seq=' + r.author_seq + ' reason=no-aud-key aud=' + au); break; }
              enc[r.op_hash] = await _seal(JSON.parse(r.envelope), ak, ep, space, au); }
            else enc[r.op_hash] = await _seal(JSON.parse(r.envelope), ring[ep][0], ep, space); }
        }
        take.push(r);
      }
      if (!take.length) return null;
      var groups = {}; take.forEach(function (r) { var k = laneOf[r.op_hash] || ''; (groups[k] = groups[k] || []).push(r); });
      var parts = [];
      for (var gk of Object.keys(groups).sort()) {                     // '' (the shared stream) sorts first
        var rowsG = groups[gk], b = new SQL.Database(); b.run('CREATE TABLE ops (op_hash TEXT PRIMARY KEY, envelope TEXT NOT NULL)');
        rowsG.forEach(function (r) { b.run('INSERT INTO ops VALUES (?,?)', [r.op_hash, enc[r.op_hash] || r.envelope]); });
        var bytes = b.export(); b.close();
        var from = rowsG[0].author_seq, to = rowsG[rowsG.length - 1].author_seq, h12 = (await _sha(rowsG.map(function (r) { return r.op_hash; }).join(','))).slice(0, 12);
        parts.push({ name: SP + (gk ? 'm/' + gk + '/o/' : 'o/') + self.kid + '/' + from + '-' + to + '.' + h12 + '.bimpack', bytes: bytes, from: from, to: to, hashes: rowsG.map(function (r) { return r.op_hash; }), sealed: rowsG.filter(function (r) { return enc[r.op_hash]; }).length, lane: gk || null });
      }
      var nb = Object.assign({}, parts[0]);                            // one part (every space without lanes): exactly the descriptor it always was
      if (parts.length > 1) { nb.from = take[0].author_seq; nb.to = take[take.length - 1].author_seq; nb.hashes = take.map(function (r) { return r.op_hash; }); nb.sealed = Object.keys(enc).length; }
      nb.parts = parts; return nb;
    }
    function _rows(bytes) { var b = new SQL.Database(bytes), out = _q(b, 'SELECT op_hash, envelope FROM ops').map(function (r) { return { hash: r.op_hash, text: r.envelope }; }); b.close(); return out; }
    // readBundle → [{hash, env}]; a sealed row I can open now is opened, one I cannot is {hash, env:null, enc:<epoch>}
    async function readBundle(bytes) {
      var ring = await keyring(), arr = await audKeyring(), out = [];
      for (var r of _rows(bytes)) {
        if (r.text.indexOf('enc:') !== 0) { out.push({ hash: r.hash, env: JSON.parse(r.text) }); continue; }
        var o = await _openText(r.text, ring, space, arr);
        out.push(o.state === 'ok' && (await ENV.hashHex(o.env)) === r.hash ? { hash: r.hash, env: o.env } : { hash: r.hash, env: null, enc: o.epoch != null ? o.epoch : 'tampered' });
      }
      return out;
    }
    async function signedHead(upTo) {         // upTo = the highest own seq this visit's batch carries (the put is not read back yet): the head's `boxes` claim only what is sent
      var me = selfRow(), head = { v: 1, space: space, author: self.kid, seq: me.next_seq - 1, hash: me.head_hash || null, frontier: mbFlag ? await recvMax() : await frontier(), ts: Date.now() };
      if (mbFlag) { var bx = {}; _q(db, 'SELECT box AS b, MAX(bseq) AS m FROM cl_box WHERE author_kid=? AND author_seq<=? GROUP BY box', [self.kid, Math.max(me.bundled_to, upTo || 0)]).forEach(function (r) { bx[r.b] = r.m; }); head.boxes = bx; }       // §45.11
      return ENV.sign(head, self);
    }

    // sealed ops whose epoch key I now hold are opened and ingested; a held key that refuses one = tampered (§13.2)
    async function openSealed(rep) {
      for (var round = 0; round < 5; round++) {
        var rows = _q(db, 'SELECT * FROM cl_sealed'); if (!rows.length) return;
        var ring = await keyring(), arr = await audKeyring(), progressed = 0;
        for (var r of rows) {
          var o = await _openText(r.ct, ring, space, arr);
          if (o.state === 'sealed') continue;
          db.run('DELETE FROM cl_sealed WHERE op_hash=?', [r.op_hash]); progressed++;
          if (o.state === 'ok' && (await ENV.hashHex(o.env)) === r.op_hash) {
            var st = await ingest(o.env, r.pipe_id, /\.bimsnap$/.test(String(r.bundle)) ? null : r.bundle); rep.opened++; if (st === 'RECEIVED') rep.received++; else if (st === 'CONTENDER') rep.contenders++; else if (st.indexOf('REFUSED') === 0) rep.rejected++;
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
      var mine = rowsOf("SELECT op_hash, envelope FROM cl_op WHERE author_kid=? AND op_type IN ('KEYGRANT','REKEY')", [self.kid]);
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
      rowsOf("SELECT op_hash, envelope FROM cl_op WHERE author_kid=? AND op_type='KEYGRANT'", [self.kid]).forEach(function (o) { have[o.env.body.params.kid + '#' + o.env.body.params.epoch] = 1; });   // mine, accepted or not: never re-issue
      for (var kid of Object.keys(R.devices).sort()) { var d = R.devices[kid];
        if (kid === self.kid || R.revokes[kid] != null || !d.dh || !(role.comm_admin || d.person === me.person)) continue;
        for (var ep of Object.keys(ring).map(Number).sort()) { if (have[kid + '#' + ep]) continue;
          await grantKey(kid, d.dh, ep, ring[ep][0]); rep.granted++; log('§COMM_KEY kid=' + self.kid + ' repair-grant to=' + kid + ' epoch=' + ep); } }
      await audKeys(rep);                                                  // §45.11: the audience (pair) keys of a mailbox space
    }

    // the post-office visit (§11.17): note my visit, collect my mail
    // take one fetched object (a bundle or a checkpoint snapshot, which is a bundle with a meta table) into the store
    async function takeBundle(on, ob, pipe, rep) {
      var isSnap = /\.bimsnap$/.test(on), meta = null;
      rep.fetched++;
      if (isSnap) { try { var sb = new SQL.Database(ob), mt = {}; _q(sb, 'SELECT k, v FROM meta').forEach(function (r) { mt[r.k] = r.v; }); sb.close();
        if (HEX.test(String(mt.state_hash || '')) && mt.state) { meta = mt; db.run('INSERT OR REPLACE INTO cl_snapmeta VALUES (?,?,?)', [mt.state_hash, on, mt.state]); } } catch (e) { /* not a snapshot after all: read it as a bundle */ } }
      // a snapshot repeats what a full-log device already holds: when every op under its frontier is held, its rows are not even read
      var skipRows = false; if (meta && meta.frontier) { try { skipRows = present(JSON.parse(meta.frontier)); } catch (e) { skipRows = false; } }
      if (!skipRows) for (var it of _rows(ob)) {
        if (isSnap && _q(db, 'SELECT 1 FROM cl_op WHERE op_hash=?', [it.hash]).length) continue;
        if (it.text.indexOf('enc:') === 0) {
          var ex = _q(db, 'SELECT 1 FROM cl_op WHERE op_hash=? UNION SELECT 1 FROM cl_contender WHERE op_hash=? UNION SELECT 1 FROM cl_sealed WHERE op_hash=?', [it.hash, it.hash, it.hash]);
          if (!ex.length) { var m = /^enc:(\d+)/.exec(it.text); db.run('INSERT INTO cl_sealed VALUES (?,?,?,?,?)', [it.hash, m ? Number(m[1]) : null, it.text, on, pipe.id]); }
          continue;
        }
        var st = await ingest(JSON.parse(it.text), pipe.id, isSnap ? null : on);
        if (st === 'RECEIVED') rep.received++; else if (st === 'CONTENDER') rep.contenders++; else if (st.indexOf('REFUSED') === 0) rep.rejected++;
      }
      db.run('INSERT OR IGNORE INTO cl_fetched VALUES (?,?)', [on, pipe.id]);
    }
    // a snapshot's state travels sealed (enc:…) in an encrypted space; once I hold the epoch key I keep it opened in MY comm.db (like opened ops)
    async function openSnapMeta() {
      var rows = _q(db, "SELECT state_hash, state_json FROM cl_snapmeta WHERE state_json LIKE 'enc:%'"); if (!rows.length) return;
      var ring = await keyring(), arr = await audKeyring();
      for (var r of rows) { var o = await _openText(r.state_json, ring, space, arr);
        if (o.state === 'ok') db.run('UPDATE cl_snapmeta SET state_json=? WHERE state_hash=?', [JSON.stringify(o.env), r.state_hash]);
        else if (o.state === 'tampered') db.run("UPDATE cl_snapmeta SET state_json='tampered' WHERE state_hash=?", [r.state_hash]); }       // a held key that refuses it: not a state
    }
    // a light client (opts.trustCheckpoints) that sees a co-signed checkpoint it has no snapshot for fetches the object bytes_ref names
    async function fetchSnapshots(pipe, rep) {
      if (!opts.trustCheckpoints || !anyCkpt()) return;
      var R = (await cur()).roster; if (!R.ok) return;
      var N = (R.policy && R.policy.params.checkpoint && R.policy.params.checkpoint.cosigs) || 2;
      for (var sh of Object.keys(R.checkpoints)) { var c = R.checkpoints[sh];
        if (verified[sh] || badCk[sh] || Object.keys(c.persons).length < N || _q(db, 'SELECT 1 FROM cl_snapmeta WHERE state_hash=?', [sh]).length) continue;
        for (var o of c.ops) { if (!o.bytes_ref || o.bytes_ref.indexOf(SP) !== 0) continue;
          if (_q(db, 'SELECT 1 FROM cl_fetched WHERE name=? AND pipe_id=?', [o.bytes_ref, pipe.id]).length) continue;
          var ob = await pipe.get(o.bytes_ref); if (ob) { await takeBundle(o.bytes_ref, ob, pipe, rep); break; } } }
    }

    async function sync(pipe) {
      var rep = { sent: 0, fetched: 0, received: 0, contenders: 0, rejected: 0, readBackFail: 0, sealed: 0, opened: 0, tampered: 0, granted: 0 };
      // 1. collect: plaintext ops are ingested; sealed ones wait in cl_sealed until a key opens them
      for (var on of await pipe.list(SP + 'o/')) {
        if (on.indexOf(SP + 'o/' + self.kid + '/') === 0) continue;
        if (_q(db, 'SELECT 1 FROM cl_fetched WHERE name=? AND pipe_id=?', [on, pipe.id]).length) continue;
        var ob = await pipe.get(on); if (!ob) continue;                 // withheld/absent: try again next visit
        await takeBundle(on, ob, pipe, rep);
      }
      // F1 (§45.8): my own mailboxes, listed AFTER the shared stream (the ENROLL that gives this device its role/person arrived in it). A device lists only the boxes the host names for it.
      var mbCtx = null;
      if (MB) { var R0 = (await cur()).roster;
        if (R0.mailboxes) { mbCtx = { roster: R0, self: self };
          for (var box of ((await MB.read(mbCtx)) || [])) for (var mn of await pipe.list(SP + 'm/' + box + '/')) {
            if (mn.split('/')[5] === self.kid) continue;
            if (_q(db, 'SELECT 1 FROM cl_fetched WHERE name=? AND pipe_id=?', [mn, pipe.id]).length) continue;
            var mb2 = await pipe.get(mn); if (!mb2) continue;
            await takeBundle(mn, mb2, pipe, rep); } } }
      await openSnapMeta();                                    // before the sealed ops open: a light client must know the state before it sees the ops it would otherwise fold
      await openSealed(rep);
      await fetchSnapshots(pipe, rep);
      await openSealed(rep);
      await openSnapMeta();
      await autoKeys(rep);
      // 2. send my news
      var nb = await bundleNew();
      async function readBack() {
        var allOk = true;
        for (var pt of nb.parts) {
          var back = await pipe.get(pt.name), ok = false;
          if (back) { var got = _rows(back).map(function (x) { return x.hash; }); ok = got.length === pt.hashes.length && got.every(function (h, i) { return h === pt.hashes[i]; }); }
          db.run('INSERT OR REPLACE INTO cl_outbox VALUES (?,?,?,?)', [pt.name, pt.from, pt.to, ok ? 'SENT' : 'PUT-UNVERIFIED']);
          if (!ok) { allOk = false; rep.readBackFail++; } }
        if (allOk) { db.run('UPDATE cl_self SET bundled_to=? WHERE kid=?', [nb.to, self.kid]); rep.sent = nb.hashes.length; }
      }
      // a pipe that can batch (GitHub: 6 pushes/min/repo) gets bundle + head in ONE putMany at the end of the visit
      var batched = typeof pipe.putMany === 'function';
      if (nb && !batched) { for (var pp of nb.parts) await pipe.put(pp.name, pp.bytes); await readBack(); }
      var L = await order();
      if (batched) { var batch = [{ name: SP + 'h/' + self.kid, bytes: _json(await signedHead(nb ? nb.to : 0)) }]; if (nb) nb.parts.slice().reverse().forEach(function (pt) { batch.unshift({ name: pt.name, bytes: pt.bytes }); });
        await pipe.putMany(batch); if (nb) await readBack(); }
      else await pipe.put(SP + 'h/' + self.kid, _json(await signedHead()));
      for (var hn of await pipe.list(SP + 'h/')) {
        if (mbCtx && typeof MB.wantHead === 'function' && !MB.wantHead(hn.split('/')[3], { roster: L.roster, self: self })) continue;      // F1: a station needs the hub's head (its ACK), not every peer's
        var hb = await pipe.get(hn); if (!hb) continue; var hd = _unjson(hb), dv = L.roster.devices[hd.author];
        if (!dv || !(await ENV.verify(hd, dv.jwk))) continue;            // a head counts only from an enrolled device
        db.run('INSERT OR REPLACE INTO cl_head_seen VALUES (?,?,?,?,?,?)', [hd.author, pipe.id, hd.seq, hd.hash, JSON.stringify(hd.frontier || {}), hd.sig]);
        if (hd.boxes && typeof hd.boxes === 'object') db.run('INSERT OR REPLACE INTO cl_head_boxes VALUES (?,?,?)', [hd.author, pipe.id, JSON.stringify(hd.boxes)]);
      }
      var cnt = function (v) { return Object.keys(L.verdict).filter(function (h) { return L.verdict[h].verdict === v; }).length; };
      rep.placed = L.order.length; rep.parked = cnt('PARKED'); rep.refused = cnt('REFUSED') + (L.base ? L.base.nRefused : 0); rep.gaps = gaps().length; rep.equivocations = L.equivocations.length;
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
      return L.order.map(function (h) { return { hash: h, env: env[h] }; }).filter(function (p) { return !ROS.IDENTITY[p.env.body.op_type] && !CLAIM[p.env.body.op_type]; });
    }
    function verdicts() { return _q(db, 'SELECT * FROM cl_verdict'); }



    // ── claims and document numbers (§13.12.2, §13.12.F.1) ──────────────────────────────────────────────────────
    async function claim(key, o) {
      o = o || {}; var params = { key: String(key) }; if (o.until != null) params.until = o.until; if (o.takes) params.takes = o.takes;
      return author({ target: { table: 'comm_claim', uu: await ROS.claimUU(space, key) }, body: { op_type: 'KEYCLAIM', params: params }, ts: o.ts, intent: 'K1' });
    }
    async function claimOf(key) {
      var L = await cur(); if (!L.claims) return null; var e = L.claims[await keyhFor(key)]; if (!e) return null;
      var d = L.roster.devices[e.a]; return { hash: e.h, author: e.a, person: d ? d.person : null, until: e.u };
    }
    // every claim op I hold with its verdict (and the winner of its key)
    async function claims() {
      var L = await cur(), out = [];
      for (var o of rowsOf("SELECT op_hash, envelope FROM cl_op WHERE op_type IN ('KEYCLAIM','BOOKING')")) {
        var sp = ADM.claimSpec(o.env), v = L.verdict[o.hash] || null, w = !sp.problem && L.claims ? L.claims[await keyhFor(sp.key)] : null, d = L.roster.devices[o.env.author];
        out.push({ hash: o.hash, key: sp.key || null, type: o.env.body.op_type, author: o.env.author, person: d ? d.person : null, verdict: v ? v.verdict : null, reason: v ? v.reason : null, winner: w ? w.h : null });
      }
      return out;
    }
    // the Notice a loser sees: derived from the fold, like conflicts
    async function claimNotices(personUu) {
      var pu = String(personUu).toLowerCase(), L = await cur();
      return (await claims()).filter(function (c) { return c.person === pu && c.verdict === 'REFUSED' && /^(key-claimed|lease-live|bad-takeover)$/.test(c.reason); })
        .map(function (c) { var wd = c.winner ? (L.roster.devices[(L.claims[Object.keys(L.claims).filter(function (k) { return L.claims[k].h === c.winner; })[0]] || {}).a] || {}) : {};
          return { key: c.key, reason: c.reason, op: c.hash, winner: c.winner, winner_person: wd.person || null, textmsg: 'KeyClaimed ' + c.key + ': held by ' + (wd.person || 'someone else') + ' (' + c.reason + ')' }; });
    }
    // ── publishing / co-signing a checkpoint (§13.12.3) ─────────────────────────────────────────────────────────
    // checkpoint(pipe, {keepTail}) → {name, state_hash, pos, hash} | {skipped: reason}. The snapshot object goes to the pipe first, then the op.
    async function checkpoint(pipe, o) {
      o = o || {}; var L = await cur(); if (!L.roster.ok) return { skipped: 'no-roster' };
      var bs = base, f0 = bs ? bs.frontier : {}, rows = rangeRows(f0, null), byHash = {}, byAuth = {};
      rows.forEach(function (r) { byHash[r.hash] = r; (byAuth[r.env.author] = byAuth[r.env.author] || {})[r.env.seq] = r; });
      var decided = function (h) { var v = L.verdict[h]; return !!v && (v.verdict === 'MERGED' || v.verdict === 'REFUSED'); };
      var f = {};
      authorList().forEach(function (a) { var n = f0[a] || 0, m = byAuth[a] || {}; while (m[n + 1] && decided(m[n + 1].hash)) n++;
        n = Math.max(f0[a] || 0, n - (o.keepTail || 0)); if (n >= 1) f[a] = n; });
      contenderRows().forEach(function (c) { if (f[c.env.author] != null && c.env.seq <= f[c.env.author]) f[c.env.author] = c.env.seq - 1; });
      var changed = true;
      while (changed) { changed = false;
        rows.forEach(function (r) { if (changed || r.env.seq > (f[r.env.author] || 0)) return;
          for (var d of (r.env.deps || [])) { var dr = byHash[d];
            if (!(bs && bs.verdict[d]) && !(dr && dr.env.seq <= (f[dr.env.author] || 0))) { f[r.env.author] = r.env.seq - 1; changed = true; return; } } }); }
      Object.keys(f).forEach(function (a) { if (f[a] < 1) delete f[a]; });
      if (!Object.keys(f).some(function (a) { return f[a] > (f0[a] || 0); })) return { skipped: 'nothing-new' };
      var held = heldOps(L); if (held.length) _once('held:' + held.map(function (x) { return x.author + '#' + x.seq; }).join(','), '§CKPT_HELD kid=' + self.kid + ' held=' + held.map(function (x) { return x.author.slice(0, 8) + '@' + x.seq + ':' + x.reason; }).join(',') + ' — each holds only its own author out of the checkpoint; the others proceed; a loaded translation lifts the hold');
      var r = await foldS(bs ? bs.state : null, f, bs ? bs.c : null); if (r.problem) return { skipped: r.problem };
      var body = r.state, sh = await stateHashOf(body); body.hash = sh;
      var ids = identityRows(), rs = await ROS.fold(idUpTo(ids, f), space);
      var why = rs.ok ? ROS.stableAgainst(rs, L.roster, f, idUpTo(ids, f).map(function (x) { return x.hash; })) : 'roster-of-S-not-ok';
      if (why) return { skipped: 'unstable:' + why };
      var ver = await versions(), uuC = await ROS.ckptUU(space, sh), reads = [uuC, await ROS.spaceUU(space), await ROS.devUU(self.kid), String(selfRow().person_uu || '').toLowerCase()];
      for (var u of reads) { var hh = ver[u], arr = hh == null ? [] : (Array.isArray(hh) ? hh : [hh]); if (arr.some(function (x) { return !body.verdict[x]; })) return { skipped: 'reads-outside-frontier' }; }
      // the snapshot object: a bundle of S's ops (business sealed like any bundle) + the state
      var R = L.roster, ring = await keyring(), ep = _newest(ring), sealedSpace = !R.ok || R.encrypted, arC = await audKeyring(), aOnC = audOn(R);
      if (sealedSpace && ep == null) return { skipped: 'no-key-yet' };
      var pk = new SQL.Database(); pk.run('CREATE TABLE ops (op_hash TEXT PRIMARY KEY, envelope TEXT NOT NULL)'); pk.run('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
      for (var a of Object.keys(f)) for (var q of _q(db, 'SELECT op_hash, op_type, envelope FROM cl_op WHERE author_kid=? AND author_seq<=? ORDER BY author_seq', [a, f[a]])) {
        var txt = q.envelope;
        if (!ROS.IDENTITY[q.op_type] && sealedSpace) { var qe = JSON.parse(q.envelope);
          if (aOnC && qe.box) {        // §45.11: a laned op keeps its AUDIENCE seal inside the snapshot (every device reads the snapshot; only the audience may open the op). No key for it = no snapshot.
            var qa = audFor(qe.box.name, qe.author, R), qk = qa ? sealerKey(qa, ep, arC, R) : null;
            if (!qk) { pk.close(); log('§CKPT_HELD kid=' + self.kid + ' laned op ' + q.op_hash.slice(0, 12) + ' has no audience key at epoch ' + ep + ' - snapshot not built'); return { skipped: 'no-aud-key' }; }
            txt = await _seal(qe, qk, ep, space, qa); }
          else txt = await _seal(qe, ring[ep][0], ep, space); }
        pk.run('INSERT INTO ops VALUES (?,?)', [q.op_hash, txt]); }
      var bodyOnly = Object.assign({}, body); delete bodyOnly.hash;
      var stText = sealedSpace ? await _seal(bodyOnly, ring[ep][0], ep, space) : JSON.stringify(bodyOnly);        // the state is sealed like any business op: it holds record uuids, scopes, claim keys (hashed)
      // G5 (§49.1): in a mailbox space the state lists laned op ids + verdicts + record ids, and the space key is every member's: so it is NOT published at all (state_hash + frontier stay, they are hashes).
      // Cost: a light client cannot adopt the state without folding (no snapshot meta -> it folds S itself); full-log devices and the hub are unaffected.
      if (!aOnC) pk.run('INSERT INTO meta VALUES (?,?)', ['state', stText]);
      else log('§CKPT_STATE_OMITTED kid=' + self.kid + ' state=' + sh.slice(0, 12) + ' reason=mailbox-space-laned-detail');
      pk.run('INSERT INTO meta VALUES (?,?)', ['state_hash', sh]); pk.run('INSERT INTO meta VALUES (?,?)', ['frontier', JSON.stringify(f)]);
      var bytes = pk.export(); pk.close();
      var name = SP + 'o/' + self.kid + '/ck.' + body.order.length + '.' + sh.slice(0, 12) + '.bimsnap';
      if ((await pipe.put(name, bytes)) === false) return { skipped: 'put-refused' };
      var op = await author({ target: { table: 'comm_checkpoint', uu: uuC }, body: { op_type: 'CHECKPOINT', params: { pos: body.order.length, state_hash: sh, frontier: f, prev: body.prev, bytes_ref: name } } });
      verified[sh] = body; persistCk(sh, 'OK', body);
      log('§CKPT_PUBLISH kid=' + self.kid + ' state=' + sh.slice(0, 12) + ' pos=' + body.order.length + ' judged=' + Object.keys(body.verdict).length + ' snapshot=' + bytes.length + ' B prev=' + (body.prev ? body.prev.slice(0, 12) : 'none'));
      return { name: name, state_hash: sh, pos: body.order.length, hash: op.hash, bytes: bytes.length };
    }
    // co-sign every checkpoint I have verified by my own fold and have not signed yet (a light client that only trusted one does not co-sign)
    async function cosign() {
      var R = (await order()).roster, me = R.devices[self.kid], out = [];
      if (!me) return out;
      for (var sh of Object.keys(R.checkpoints)) { var c = R.checkpoints[sh];
        if (!verified[sh] || trusted[sh] || c.persons[me.person]) continue;
        var pr = c.params, op = await author({ target: { table: 'comm_checkpoint', uu: await ROS.ckptUU(space, sh) }, body: { op_type: 'CHECKPOINT', params: { pos: pr.pos, state_hash: sh, frontier: pr.frontier, prev: pr.prev, bytes_ref: c.ops[0].bytes_ref } } });
        log('§CKPT_COSIGN kid=' + self.kid + ' state=' + sh.slice(0, 12) + ' pos=' + pr.pos); out.push({ state_hash: sh, hash: op.hash }); }
      return out;
    }
    async function checkpointInfo() {
      var L = await cur(), R = L.roster; await loadCk();
      return { held: heldOps(L), inForce: L.base ? { state_hash: L.base.stateHash, pos: L.base.pos, frontier: L.base.frontier } : null,
        candidates: Object.keys(R.checkpoints || {}).map(function (sh) { var c = R.checkpoints[sh];
          return { state_hash: sh, pos: c.params.pos, cosigners: Object.keys(c.persons).length, status: badCk[sh] ? 'BAD' : (waitCk[sh] ? 'WAITING-VERSION' : (L.base && L.base.stateHash === sh ? 'IN-FORCE' : (verified[sh] ? (trusted[sh] ? 'TRUSTED' : 'VERIFIED') : 'PENDING'))) }; }) };
    }
    // policy.checkpoint.every_ops: how many ops are folded beyond the in-force checkpoint (or all, if none)
    async function checkpointDue() {
      var L = await cur(), every = L.roster.policy && L.roster.policy.params.checkpoint && L.roster.policy.params.checkpoint.every_ops;
      return !!every && (L.order.length - (L.base ? L.base.pos : 0)) >= every;
    }

    return { kid: self.kid, space: space, db: db, author: author, authorMany: authorMany, ingest: ingest, order: order, frontier: frontier, versions: versions, gaps: gaps,
             genesis: genesis, baseInfo: baseInfo, planTrust: planTrust, planTrustInfo: planTrustInfo, anchor: anchor, publishAnchor: publishAnchor, addPerson: addPerson, enroll: enroll, setRole: setRole, revoke: revoke, setPolicy: setPolicy, publishStatement: publishStatement, policy: policy, visitOffset: visitOffset, versionState: versionState, refold: refold,
             checkpoint: checkpoint, cosign: cosign, claim: claim, claimOf: claimOf, claims: claims, claimNotices: claimNotices, checkpointInfo: checkpointInfo, checkpointDue: checkpointDue,
             keyring: keyring, sealed: function () { return _q(db, 'SELECT op_hash, epoch, bundle FROM cl_sealed'); },
             bundleNew: bundleNew, readBundle: readBundle, signedHead: signedHead, sync: sync, setMailbox: setMailbox, delivery: delivery, placedEnvelopes: placedEnvelopes,
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
  async function newSpace(name, founder, personUu, personName, adRoleId, nsOpts) {
    var nonce = _hex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
    var params = { name: name, nonce: nonce, founder: { kid: founder.kid, jwk: founder.pubJwk, person_uu: String(personUu).toLowerCase(), name: personName, ad_role_id: adRoleId } };
    if (founder.dhPubJwk) params.founder.dh_jwk = founder.dhPubJwk;       // CL8: the founder's key-exchange key makes this an encrypted space
    if (nsOpts && nsOpts.base !== undefined && nsOpts.base !== null) {      // §13.12.I.1: the shared loaded DB this space sits on; the space id hashes it (a different base = a different space)
      var bp = ROS.baseProblem(nsOpts.base); if (bp) throw new Error('newSpace: invalid base (' + bp + ')');
      params.base = { name: nsOpts.base.name, sha256: nsOpts.base.sha256 };
      if (nsOpts.base.bytes !== undefined) params.base.bytes = nsOpts.base.bytes; if (nsOpts.base.version !== undefined) params.base.version = nsOpts.base.version;
    }
    if (nsOpts && nsOpts.planTrust !== undefined && nsOpts.planTrust !== null) {      // §33: the plan trust list (public keys only) is pinned in the genesis; the space id hashes it
      var tp = ROS.planTrustProblem(nsOpts.planTrust); if (tp) throw new Error('newSpace: invalid planTrust (' + tp + ')');
      params.planTrust = ROS.planTrustOf(nsOpts.planTrust);
      if (nsOpts.planTrustThreshold !== undefined && nsOpts.planTrustThreshold !== null) {      // §46.5 F5: the signing threshold, pinned with the list
        var thp = ROS.planTrustThresholdProblem(nsOpts.planTrust, nsOpts.planTrustThreshold); if (thp) throw new Error('newSpace: invalid planTrustThreshold (' + thp + ')');
        params.planTrustThreshold = nsOpts.planTrustThreshold; }
    }
    if (nsOpts && nsOpts.plan !== undefined && nsOpts.plan !== null) {      // §38.15: the topology - 'office' (the mesh plan, the default) or 'pos' (the star plan); the space id hashes it, so every device reads the same one
      if (nsOpts.plan !== 'office' && nsOpts.plan !== 'pos') throw new Error('newSpace: invalid plan (' + String(nsOpts.plan) + ')');
      params.plan = nsOpts.plan;
    }
    if (params.plan === 'pos' && !(nsOpts && nsOpts.mailboxes === false)) params.mailboxes = 1;      // F1 (§45.8): a NEW star space is founded with per-device mailboxes; a genesis without the field (every earlier space) keeps the shared stream
    return { params: params, space: await ROS.spaceOf(params) };
  }

  // §13.12.I.1 — the identity of a loaded DB: sha256 of its bytes (the HOST reads the file; the engine never opens a DB). → {name, sha256, bytes, version?}
  async function baseFromBytes(name, bytes, version) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b = { name: String(name), sha256: _hex(await globalThis.crypto.subtle.digest('SHA-256', u8)), bytes: u8.length };
    if (version !== undefined && version !== null) b.version = String(version); return b;
  }
  // §13.12.I.1 — PURE. baseInfo = store.baseInfo(); loaded = {sha256, bytes?} of the DB the host actually has. A mismatch is never folded onto.
  function checkBase(info, loaded) {
    if (!info) return { ok: true, base: false };                       // a space without base: whatever DB the host has (additive)
    var have = loaded && typeof loaded.sha256 === 'string' ? loaded.sha256.toLowerCase() : null, want = info.sha256;
    var bytesOk = !(loaded && loaded.bytes != null && info.bytes != null) || Number(loaded.bytes) === Number(info.bytes);
    if (have === want && bytesOk) return { ok: true, base: true };
    return { ok: false, reason: 'base-mismatch', have: have, want: want, haveBytes: loaded && loaded.bytes != null ? Number(loaded.bytes) : null, wantBytes: info.bytes != null ? info.bytes : null,
             message: 'Your copy of ' + info.name + ' is not the team\'s (yours ' + (have ? have.slice(0, 12) : 'unknown') + ', the team\'s ' + want.slice(0, 12) + (info.version ? ', version ' + info.version : '') + '). Update it, then try again.' };
  }

  var API = { _t: { seal: _seal, openText: _openText, wrap: _wrap, newKey: _newSpaceKey }, open: open, newDevice: newDevice, ensureDh: ensureDh, newSpace: newSpace, baseFromBytes: baseFromBytes, checkBase: checkBase, kidOf: function (j) { return ROS.kidOf(j); } };
  global.CommStore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
