// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_store.js — the device's local comm store (comm.db) and the post-office visit (sync).
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.11 + §11.15 + §11.17 + §12.4 (CL3) + §12.6 + §12.7 (CL4)
 * — Witnesses: W-STORE-NODE, W-FOLDER-2CTX, W-ADMIT-FOLD.
 *
 * Holds ALL sync state on the device so the pipe holds only bytes. Sits OUTSIDE the business DB: the kernel only
 * ever sees ops that came out of order() as MERGED.
 *   ingest  — structural checks only (a device's key may arrive later, inside an ENROLL op).
 *   order   — 1) fold the roster from identity ops (comm_roster.js, trust pinned by the space id)
 *             2) admit every business op against it (comm_admit.js + the AD layer's canUpdate via opts.access)
 *             3) order the admitted ops by the versions they read (comm_order.js, §12.6)
 *             4) an op that read a REFUSED version is REFUSED too (the version it saw never happened).
 * Depends on CommEnvelope, CommOrder, CommRoster, CommAdmit; sql.js injected (opts.SQL); opts.access injected.
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
    'CREATE TABLE IF NOT EXISTS cl_outbox (bundle_name TEXT PRIMARY KEY, from_seq INTEGER, to_seq INTEGER, state TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_head_seen (author_kid TEXT, pipe_id TEXT, seq INTEGER, head_hash TEXT, frontier_json TEXT, sig TEXT, PRIMARY KEY(author_kid, pipe_id))'
  ];

  function _q(db, sql, args) { var st = db.prepare(sql); if (args) st.bind(args); var out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  function _hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  async function _sha(s) { return _hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
  function _json(o) { return new TextEncoder().encode(JSON.stringify(o)); }
  function _unjson(b) { return JSON.parse(new TextDecoder().decode(b)); }
  function _num(v) { return v == null || v === '' ? null : Number(v); }

  // record scope for canUpdate: a CREATE carries it (fields or the stdDefaults buildOp stamps); later ops inherit
  // it from their record's CREATE. Unknown → null → admission refuses (fail-closed).
  function _scopeOfCreate(env) {
    var p = env.body.params || {}, f = p.fields || {}, sd = p.stdDefaults || {};
    var c = _num(f.ad_client_id != null ? f.ad_client_id : sd.clientId), o = _num(f.ad_org_id != null ? f.ad_org_id : sd.orgId);
    return c == null || o == null ? null : { client: c, org: o };
  }

  function open(db, opts) {
    var SQL = opts.SQL, self = opts.self, space = opts.space, access = opts.access, log = opts.log || function (m) { console.log(m); };
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
    async function genesis(params) { return author({ target: { table: 'comm_space', uu: await ROS.spaceUU(space) }, body: { op_type: 'GENESIS', params: params } }); }
    async function addPerson(p) { return author({ target: { table: 'comm_person', uu: String(p.person_uu).toLowerCase() }, body: { op_type: 'PERSON', params: p } }); }
    async function enroll(kid, jwk, personUu) { return author({ target: { table: 'comm_device', uu: await ROS.devUU(kid) }, refs: [String(personUu).toLowerCase()], body: { op_type: 'ENROLL', params: { kid: kid, jwk: jwk, person_uu: String(personUu).toLowerCase() } } }); }
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

    // bundle = a tiny SQLite file, one table ops(op_hash, envelope); name hash = sha256 over the op hashes (row stream)
    async function bundleNew() {
      var me = selfRow(), rows = _q(db, "SELECT op_hash, author_seq, envelope FROM cl_op WHERE author_kid=? AND state='OWN' AND author_seq>? ORDER BY author_seq", [self.kid, me.bundled_to]);
      if (!rows.length) return null;
      var b = new SQL.Database(); b.run('CREATE TABLE ops (op_hash TEXT PRIMARY KEY, envelope TEXT NOT NULL)');
      rows.forEach(function (r) { b.run('INSERT INTO ops VALUES (?,?)', [r.op_hash, r.envelope]); });
      var bytes = b.export(); b.close();
      var from = rows[0].author_seq, to = rows[rows.length - 1].author_seq, h12 = (await _sha(rows.map(function (r) { return r.op_hash; }).join(','))).slice(0, 12);
      return { name: 'o/' + self.kid + '/' + from + '-' + to + '.' + h12 + '.bimpack', bytes: bytes, from: from, to: to, hashes: rows.map(function (r) { return r.op_hash; }) };
    }
    async function readBundle(bytes) {
      var b = new SQL.Database(bytes), out = _q(b, 'SELECT op_hash, envelope FROM ops').map(function (r) { return { hash: r.op_hash, env: JSON.parse(r.envelope) }; });
      b.close(); return out;
    }
    async function signedHead() {
      var me = selfRow(), head = { v: 1, space: space, author: self.kid, seq: me.next_seq - 1, hash: me.head_hash || null, frontier: await frontier(), ts: Date.now() };
      return ENV.sign(head, self);
    }

    // the post-office visit (§11.17): note my visit, collect my mail
    async function sync(pipe) {
      var rep = { sent: 0, fetched: 0, received: 0, contenders: 0, rejected: 0, readBackFail: 0 };
      var nb = await bundleNew();
      if (nb) {
        await pipe.put(nb.name, nb.bytes);
        var back = await pipe.get(nb.name), ok = false;
        if (back) { var got = (await readBundle(back)).map(function (x) { return x.hash; }); ok = got.length === nb.hashes.length && got.every(function (h, i) { return h === nb.hashes[i]; }); }
        db.run('INSERT OR REPLACE INTO cl_outbox VALUES (?,?,?,?)', [nb.name, nb.from, nb.to, ok ? 'SENT' : 'PUT-UNVERIFIED']);
        if (ok) { db.run('UPDATE cl_self SET bundled_to=? WHERE kid=?', [nb.to, self.kid]); rep.sent = nb.hashes.length; } else rep.readBackFail++;
      }
      for (var on of await pipe.list('o/')) {
        if (on.indexOf('o/' + self.kid + '/') === 0) continue;
        if (_q(db, 'SELECT 1 FROM cl_fetched WHERE name=? AND pipe_id=?', [on, pipe.id]).length) continue;
        var ob = await pipe.get(on); if (!ob) continue;                 // withheld/absent: try again next visit
        rep.fetched++;
        for (var it of await readBundle(ob)) { var st = await ingest(it.env, pipe.id);
          if (st === 'RECEIVED') rep.received++; else if (st === 'CONTENDER') rep.contenders++; else if (st.indexOf('REFUSED') === 0) rep.rejected++; }
        db.run('INSERT OR IGNORE INTO cl_fetched VALUES (?,?)', [on, pipe.id]);
      }
      var L = await order();
      await pipe.put('h/' + self.kid, _json(await signedHead()));
      for (var hn of await pipe.list('h/')) {
        var hb = await pipe.get(hn); if (!hb) continue; var hd = _unjson(hb), dv = L.roster.devices[hd.author];
        if (!dv || !(await ENV.verify(hd, dv.jwk))) continue;            // a head counts only from an enrolled device
        db.run('INSERT OR REPLACE INTO cl_head_seen VALUES (?,?,?,?,?,?)', [hd.author, pipe.id, hd.seq, hd.hash, JSON.stringify(hd.frontier || {}), hd.sig]);
      }
      var cnt = function (v) { return Object.keys(L.verdict).filter(function (h) { return L.verdict[h].verdict === v; }).length; };
      rep.placed = L.order.length; rep.parked = cnt('PARKED'); rep.refused = cnt('REFUSED'); rep.gaps = gaps().length; rep.equivocations = L.equivocations.length;
      log('§COMM_TRUST mode=roster genesis=' + (L.roster.ok ? String(L.roster.genesis).slice(0, 12) : 'NONE(' + L.roster.reason + ')') +
          ' space=' + space.slice(0, 12) + ' devices=' + Object.keys(L.roster.devices).length + ' revoked=' + Object.keys(L.roster.revokes).length);
      log('§COMM_SYNC kid=' + self.kid + ' pipe=' + pipe.id + ' sent=' + rep.sent + ' fetched=' + rep.fetched + ' received=' + rep.received +
          ' placed=' + rep.placed + ' parked=' + rep.parked + ' refused=' + rep.refused + ' gaps=' + rep.gaps + ' equivocations=' + rep.equivocations);
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
             bundleNew: bundleNew, readBundle: readBundle, signedHead: signedHead, sync: sync, delivery: delivery, placedEnvelopes: placedEnvelopes,
             conflicts: conflicts, foldable: foldable, notices: notices, saveCheck: saveCheck,
             verdicts: verdicts, query: function (sql, args) { return _q(db, sql, args); } };
  }

  // a fresh device identity: WebCrypto P-256, private key non-extractable (as erp/erp_signer.js)
  async function newDevice() {
    var kp = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    var jwk = await globalThis.crypto.subtle.exportKey('jwk', kp.publicKey);
    var pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    return { kid: await ROS.kidOf(pub), privateKey: kp.privateKey, pubJwk: pub };
  }
  // a new space: the founder's genesis params and the space id they hash to (the invite)
  async function newSpace(name, founder, personUu, personName, adRoleId) {
    var nonce = _hex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
    var params = { name: name, nonce: nonce, founder: { kid: founder.kid, jwk: founder.pubJwk, person_uu: String(personUu).toLowerCase(), name: personName, ad_role_id: adRoleId } };
    return { params: params, space: await ROS.spaceOf(params) };
  }

  var API = { open: open, newDevice: newDevice, newSpace: newSpace, kidOf: function (j) { return ROS.kidOf(j); } };
  global.CommStore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
