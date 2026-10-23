// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_store.js — the device's local comm store (comm.db) and the post-office visit (sync).
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.11 + §11.15 + §11.17 + §12.4 (CL3) — Witnesses: W-STORE-NODE, W-FOLDER-2CTX.
 *
 * Holds ALL sync state on the device so the pipe holds only bytes. Sits OUTSIDE the business DB: the kernel
 * only ever sees ops that came out of order() (CL4 adds fold-time admission between the two).
 * Depends on CommEnvelope (sign/verify/validate/hash) and CommOrder (linearize); sql.js is injected (opts.SQL).
 *
 * ⚠ CL3-only temporary trust: a device key published at d/<kid> is accepted as-is. CL4 replaces this with
 * signed ENROLL ops (§11.5). Every sync logs §COMM_TRUST mode=CL3-temporary so no reader mistakes it for a roster.
 */
(function (global) {
  'use strict';

  var ENV = global.CommEnvelope || (typeof require === 'function' ? require('./comm_envelope.js') : null);
  var ORD = global.CommOrder || (typeof require === 'function' ? require('./comm_order.js') : null);

  var SCHEMA = [
    'CREATE TABLE IF NOT EXISTS cl_device (kid TEXT PRIMARY KEY, pub_jwk TEXT NOT NULL, source TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_self (kid TEXT PRIMARY KEY, space TEXT, next_seq INTEGER, head_hash TEXT, seen_json TEXT, bundled_to INTEGER)',
    'CREATE TABLE IF NOT EXISTS cl_op (op_hash TEXT PRIMARY KEY, author_kid TEXT NOT NULL, author_seq INTEGER NOT NULL, prev_hash TEXT, deps_json TEXT,' +
      ' target_table TEXT, target_uu TEXT, envelope TEXT NOT NULL, first_pipe TEXT, state TEXT NOT NULL, UNIQUE(author_kid, author_seq))',
    'CREATE TABLE IF NOT EXISTS cl_equivocation (author_kid TEXT, author_seq INTEGER, hash_a TEXT, hash_b TEXT, envelope_b TEXT, PRIMARY KEY(author_kid, author_seq))',
    'CREATE TABLE IF NOT EXISTS cl_refused (op_hash TEXT PRIMARY KEY, author_kid TEXT, reason TEXT, pipe TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_verdict (op_hash TEXT PRIMARY KEY, fold_pos INTEGER, verdict TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_fetched (name TEXT, pipe_id TEXT, PRIMARY KEY(name, pipe_id))',
    'CREATE TABLE IF NOT EXISTS cl_outbox (bundle_name TEXT PRIMARY KEY, from_seq INTEGER, to_seq INTEGER, state TEXT)',
    'CREATE TABLE IF NOT EXISTS cl_head_seen (author_kid TEXT, pipe_id TEXT, seq INTEGER, head_hash TEXT, frontier_json TEXT, sig TEXT, PRIMARY KEY(author_kid, pipe_id))'
  ];

  function _q(db, sql, args) { var st = db.prepare(sql); if (args) st.bind(args); var out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  function _hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  async function _sha(s) { return _hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
  function _json(o) { return new TextEncoder().encode(JSON.stringify(o)); }
  function _unjson(b) { return JSON.parse(new TextDecoder().decode(b)); }

  // kid = first 16 hex of sha256 over the public point — short enough for a pipe path, derived, never chosen
  async function kidOf(jwk) { return (await _sha(jwk.x + '.' + jwk.y)).slice(0, 16); }

  function open(db, opts) {
    var SQL = opts.SQL, self = opts.self, space = opts.space, log = opts.log || function (m) { console.log(m); };
    SCHEMA.forEach(function (s) { db.run(s); });
    db.run('INSERT OR IGNORE INTO cl_self (kid, space, next_seq, head_hash, seen_json, bundled_to) VALUES (?,?,1,NULL,?,0)', [self.kid, space, '{}']);
    db.run('INSERT OR IGNORE INTO cl_device (kid, pub_jwk, source) VALUES (?,?,?)', [self.kid, JSON.stringify(self.pubJwk), 'self']);
    var lastOrder = null;

    function selfRow() { return _q(db, 'SELECT * FROM cl_self WHERE kid=?', [self.kid])[0]; }
    function enrol(kid, jwk, source) { db.run('INSERT OR IGNORE INTO cl_device (kid, pub_jwk, source) VALUES (?,?,?)', [kid, JSON.stringify(jwk), source || 'pipe-d']); }
    function deviceJwk(kid) { var r = _q(db, 'SELECT pub_jwk FROM cl_device WHERE kid=?', [kid])[0]; return r ? JSON.parse(r.pub_jwk) : null; }

    function order() {
      var ops = _q(db, "SELECT op_hash AS hash, author_kid AS author, author_seq AS seq, prev_hash AS prev, deps_json FROM cl_op WHERE state IN ('OWN','VERIFIED')")
        .map(function (r) { return { hash: r.hash, author: r.author, seq: r.seq, prev: r.prev || null, deps: JSON.parse(r.deps_json || '[]') }; });
      // an equivocated slot: feed the second op too, so linearize marks BOTH and places neither (comm_order.js)
      _q(db, 'SELECT * FROM cl_equivocation').forEach(function (e) { ops.push({ hash: e.hash_b, author: e.author_kid, seq: e.author_seq, prev: null, deps: [] }); });
      var L = ORD.linearize(ops);
      db.run('DELETE FROM cl_verdict');
      L.order.forEach(function (h, i) { db.run('INSERT INTO cl_verdict VALUES (?,?,?)', [h, i, 'MERGED']); });
      L.parked.forEach(function (h) { db.run('INSERT OR REPLACE INTO cl_verdict VALUES (?,NULL,?)', [h, 'PARKED']); });
      L.equivocations.forEach(function (e) { [e.a, e.b].forEach(function (h) { db.run('INSERT OR REPLACE INTO cl_verdict VALUES (?,NULL,?)', [h, 'EQUIVOCATED']); }); });
      lastOrder = L; return L;
    }

    // per author: how many of its ops are placed (placement needs prev, so placed ops are always 1..n)
    function frontier() {
      var L = lastOrder || order(), byHash = {}, f = {};
      _q(db, 'SELECT op_hash, author_kid, author_seq FROM cl_op').forEach(function (r) { byHash[r.op_hash] = r; });
      L.order.forEach(function (h) { var r = byHash[h]; if (r) f[r.author_kid] = Math.max(f[r.author_kid] || 0, r.author_seq); });
      return f;
    }
    function headsPlaced() {
      var L = lastOrder || order(), byHash = {}, heads = {};
      _q(db, 'SELECT op_hash, author_kid, author_seq FROM cl_op').forEach(function (r) { byHash[r.op_hash] = r; });
      L.order.forEach(function (h) { var r = byHash[h]; if (r && (!heads[r.author_kid] || heads[r.author_kid].seq < r.author_seq)) heads[r.author_kid] = { seq: r.author_seq, hash: h }; });
      return heads;
    }

    async function author(spec) {
      var me = selfRow(), seen = JSON.parse(me.seen_json || '{}'), heads = headsPlaced(), deps = [];
      Object.keys(heads).forEach(function (k) { if (k !== self.kid && seen[k] !== heads[k].hash) { deps.push(heads[k].hash); seen[k] = heads[k].hash; } });
      var env = { v: 3, space: space, author: self.kid, seq: me.next_seq, prev: me.head_hash || null, deps: deps.sort(),
                  manifest: spec.manifest || 'm0', policy: spec.policy || 'p0', intent: spec.intent || 'K1',
                  target: spec.target, base: spec.base || null, ts: spec.ts != null ? spec.ts : Date.now(), body: spec.body };
      if (spec.attrib) env.attrib = spec.attrib;
      var vr = ENV.validate(env); if (!vr.ok) throw new Error('author: invalid envelope — ' + vr.errors.join('; '));
      env = await ENV.sign(env, self);
      var h = await ENV.hashHex(env);
      db.run('INSERT INTO cl_op VALUES (?,?,?,?,?,?,?,?,?,?)', [h, self.kid, env.seq, env.prev, JSON.stringify(env.deps), env.target.table, env.target.uu, JSON.stringify(env), 'local', 'OWN']);
      db.run('UPDATE cl_self SET next_seq=?, head_hash=?, seen_json=? WHERE kid=?', [env.seq + 1, h, JSON.stringify(seen), self.kid]);
      lastOrder = null; return { env: env, hash: h };
    }

    async function ingest(env, pipeId) {
      var h = await ENV.hashHex(env);
      if (_q(db, 'SELECT 1 FROM cl_op WHERE op_hash=?', [h]).length) return 'DUP';
      function refuse(why) { db.run('INSERT OR IGNORE INTO cl_refused VALUES (?,?,?,?)', [h, env && env.author, why, pipeId]); return 'REFUSED:' + why; }
      var jwk = deviceJwk(env.author); if (!jwk) return refuse('unknown-device');
      if (env.space !== space) return refuse('space');
      var vr = ENV.validate(env); if (!vr.ok) return refuse('invalid ' + vr.errors.join('; '));
      if (!(await ENV.verify(env, jwk))) return refuse('signature');
      var slot = _q(db, 'SELECT op_hash FROM cl_op WHERE author_kid=? AND author_seq=?', [env.author, env.seq])[0];
      if (slot) { db.run('INSERT OR IGNORE INTO cl_equivocation VALUES (?,?,?,?,?)', [env.author, env.seq, slot.op_hash, h, JSON.stringify(env)]); lastOrder = null; return 'EQUIVOCATION'; }
      db.run('INSERT INTO cl_op VALUES (?,?,?,?,?,?,?,?,?,?)', [h, env.author, env.seq, env.prev, JSON.stringify(env.deps), env.target.table, env.target.uu, JSON.stringify(env), pipeId, 'VERIFIED']);
      lastOrder = null; return 'VERIFIED';
    }

    // bundle = a tiny SQLite file, one table ops(op_hash, envelope); name hash = sha256 over the op hashes (row stream)
    async function bundleNew() {
      var me = selfRow(), rows = _q(db, "SELECT op_hash, author_seq, envelope FROM cl_op WHERE author_kid=? AND state='OWN' AND author_seq>? ORDER BY author_seq", [self.kid, me.bundled_to]);
      if (!rows.length) return null;
      var b = new SQL.Database(); b.run('CREATE TABLE ops (op_hash TEXT PRIMARY KEY, envelope TEXT NOT NULL)');
      rows.forEach(function (r) { b.run('INSERT INTO ops VALUES (?,?)', [r.op_hash, r.envelope]); });
      var bytes = b.export(); b.close();
      var from = rows[0].author_seq, to = rows[rows.length - 1].author_seq;
      var h12 = (await _sha(rows.map(function (r) { return r.op_hash; }).join(','))).slice(0, 12);
      return { name: 'o/' + self.kid + '/' + from + '-' + to + '.' + h12 + '.bimpack', bytes: bytes, from: from, to: to, hashes: rows.map(function (r) { return r.op_hash; }) };
    }
    async function readBundle(bytes) {
      var b = new SQL.Database(bytes), out = _q(b, 'SELECT op_hash, envelope FROM ops').map(function (r) { return { hash: r.op_hash, env: JSON.parse(r.envelope) }; });
      b.close(); return out;
    }

    async function signedHead() {
      var me = selfRow(), head = { v: 1, space: space, author: self.kid, seq: me.next_seq - 1, hash: me.head_hash || null, frontier: frontier(), ts: Date.now() };
      return ENV.sign(head, self);
    }

    // the post-office visit (§11.17): note my visit, collect my mail
    async function sync(pipe) {
      var rep = { sent: 0, fetched: 0, ingested: 0, refused: 0, equivocations: 0, readBackFail: 0 };
      var dNames = await pipe.list('d/');
      if (dNames.indexOf('d/' + self.kid) < 0) await pipe.put('d/' + self.kid, _json({ kid: self.kid, jwk: self.pubJwk }));   // publish my key once
      var nb = await bundleNew();
      if (nb) {
        await pipe.put(nb.name, nb.bytes);
        var back = await pipe.get(nb.name), ok = false;
        if (back) { var got = (await readBundle(back)).map(function (x) { return x.hash; }); ok = got.length === nb.hashes.length && got.every(function (h, i) { return h === nb.hashes[i]; }); }
        db.run('INSERT OR REPLACE INTO cl_outbox VALUES (?,?,?,?)', [nb.name, nb.from, nb.to, ok ? 'SENT' : 'PUT-UNVERIFIED']);
        if (ok) { db.run('UPDATE cl_self SET bundled_to=? WHERE kid=?', [nb.to, self.kid]); rep.sent = nb.hashes.length; } else rep.readBackFail++;
      }
      for (var dn of dNames) { if (deviceJwk(dn.slice(2))) continue;          // known key: no re-read (low noise)
        var d = await pipe.get(dn); if (d) { var dj = _unjson(d); if (dj.kid === await kidOf(dj.jwk)) enrol(dj.kid, dj.jwk, 'pipe-d'); } }
      for (var on of await pipe.list('o/')) {
        if (on.indexOf('o/' + self.kid + '/') === 0) continue;
        if (_q(db, 'SELECT 1 FROM cl_fetched WHERE name=? AND pipe_id=?', [on, pipe.id]).length) continue;
        var ob = await pipe.get(on); if (!ob) continue;                 // withheld/absent: try again next visit
        rep.fetched++;
        for (var it of await readBundle(ob)) { var st = await ingest(it.env, pipe.id);
          if (st === 'VERIFIED') rep.ingested++; else if (st === 'EQUIVOCATION') rep.equivocations++; else if (st.indexOf('REFUSED') === 0) rep.refused++; }
        db.run('INSERT OR IGNORE INTO cl_fetched VALUES (?,?)', [on, pipe.id]);
      }
      var L = order();
      await pipe.put('h/' + self.kid, _json(await signedHead()));
      for (var hn of await pipe.list('h/')) {
        var hb = await pipe.get(hn); if (!hb) continue; var hd = _unjson(hb), jwk = deviceJwk(hd.author);
        if (!jwk || !(await ENV.verify(hd, jwk))) continue;
        db.run('INSERT OR REPLACE INTO cl_head_seen VALUES (?,?,?,?,?,?)', [hd.author, pipe.id, hd.seq, hd.hash, JSON.stringify(hd.frontier || {}), hd.sig]);
      }
      rep.placed = L.order.length; rep.parked = L.parked.length; rep.equivocationsKnown = _q(db, 'SELECT COUNT(*) AS n FROM cl_equivocation')[0].n;
      log('§COMM_TRUST mode=CL3-temporary devices=' + _q(db, 'SELECT COUNT(*) AS n FROM cl_device')[0].n);
      log('§COMM_SYNC kid=' + self.kid + ' pipe=' + pipe.id + ' sent=' + rep.sent + ' fetched=' + rep.fetched + ' ingested=' + rep.ingested +
          ' refused=' + rep.refused + ' placed=' + rep.placed + ' parked=' + rep.parked + ' equivocations=' + rep.equivocationsKnown);
      return rep;
    }

    // delivery ladder for my own ops (§11.15): SAVED → SENT (read-back) → SEEN by <kid> (their signed head covers my seq)
    function delivery() {
      var me = selfRow(), seenBy = {};
      _q(db, 'SELECT author_kid, frontier_json FROM cl_head_seen WHERE author_kid<>?', [self.kid]).forEach(function (r) { seenBy[r.author_kid] = JSON.parse(r.frontier_json)[self.kid] || 0; });
      return _q(db, "SELECT op_hash, author_seq FROM cl_op WHERE author_kid=? AND state='OWN' ORDER BY author_seq", [self.kid]).map(function (r) {
        var by = Object.keys(seenBy).filter(function (k) { return seenBy[k] >= r.author_seq; }).sort();
        return { seq: r.author_seq, hash: r.op_hash, state: by.length ? 'SEEN' : (r.author_seq <= me.bundled_to ? 'SENT' : 'SAVED'), seenBy: by };
      });
    }

    function placedEnvelopes() {
      var L = lastOrder || order(), env = {};
      _q(db, 'SELECT op_hash, envelope FROM cl_op').forEach(function (r) { env[r.op_hash] = JSON.parse(r.envelope); });
      return L.order.map(function (h) { return { hash: h, env: env[h] }; });
    }

    return { kid: self.kid, space: space, db: db, enrol: enrol, author: author, ingest: ingest, order: order, frontier: frontier,
             bundleNew: bundleNew, readBundle: readBundle, signedHead: signedHead, sync: sync, delivery: delivery, placedEnvelopes: placedEnvelopes,
             query: function (sql, args) { return _q(db, sql, args); } };
  }

  // a fresh device identity: WebCrypto P-256, private key non-extractable (as erp/erp_signer.js)
  async function newDevice() {
    var kp = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    var jwk = await globalThis.crypto.subtle.exportKey('jwk', kp.publicKey);
    var pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    return { kid: await kidOf(pub), privateKey: kp.privateKey, pubJwk: pub };
  }

  var API = { open: open, newDevice: newDevice, kidOf: kidOf };
  global.CommStore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
