// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_roster.js — identity as ops: who is in the space, which devices are theirs, what role they hold.
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.5 + §12.7 (CL4) — Witness: W-ADMIT-FOLD.
 *
 * Identity ops are ordinary v3 envelopes: GENESIS · PERSON · ENROLL · ROLE · REVOKE · KEYGRANT · REKEY · POLICY · CHECKPOINT.
 *   §13.12.3 (Witness: W-CHECKPOINT): CHECKPOINT {pos, state_hash, frontier, prev, bytes_ref} names a closed prefix of the log and the hash of its fold.
 *   The roster only records WHICH checkpoints were validly published/co-signed (roster.checkpoints); whether one is in force is decided by the store.
 *   §13.12 (Witness: W-POLICY-FOLD): POLICY is the admin-signed config controller — visit period, stagger rule, bundle cap, gate parameters,
 *   checkpoint cadence, lease TTL and informational entries. Folded like REKEY: every device applies the same policy at the same log position;
 *   a higher `epoch` supersedes, an equal or lower one is REFUSED; a non-admin POLICY is REFUSED.
 *   CL8 (§13.2, Witness: W-PIPE-OPAQUE): KEYGRANT wraps a space-key epoch for one device, REKEY opens epoch n+1 after a REVOKE.
 *   Both stay plaintext in bundles (a new device must read its own grant before it has a key); they hold only public keys and wrapped keys.
 *   - The space id IS sha256(canonical(GENESIS params)), so an invite (the space id) pins the founder key.
 *   - Authority changes take effect from a per-device seq CUT-OFF named by the authority (REVOKE.last_good_seq,
 *     ROLE.from_seq), so no verdict depends on the order ops happened to arrive in.
 * fold() walks the identity ops in data order, then re-walks with the accepted REVOKE cut-offs known up front
 * until the accepted set is stable (≤5 walks). PURE apart from WebCrypto verify (pre-computed before the walk).
 */
(function (global) {
  'use strict';
  var ENV = global.CommEnvelope || (typeof require === 'function' ? require('./comm_envelope.js') : null);
  var ORD = global.CommOrder || (typeof require === 'function' ? require('./comm_order.js') : null);
  var IDENTITY = { GENESIS: 1, PERSON: 1, ENROLL: 1, ROLE: 1, REVOKE: 1, KEYGRANT: 1, REKEY: 1, POLICY: 1, CHECKPOINT: 1 };
  // a device's ECDH public key as it travels in GENESIS/ENROLL: an EC P-256 public JWK, nothing else (else treated as absent)
  function dhOf(j) { return j && j.kty === 'EC' && j.crv === 'P-256' && typeof j.x === 'string' && typeof j.y === 'string' && !j.d ? { kty: j.kty, crv: j.crv, x: j.x, y: j.y } : null; }

  function _hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  async function _sha(s) { return _hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
  function _uuid(h) { return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
  async function kidOf(jwk) { return (await _sha(jwk.x + '.' + jwk.y)).slice(0, 16); }
  async function devUU(kid) { return _uuid(await _sha('dev:' + kid)); }
  async function spaceUU(space) { return _uuid(await _sha('space:' + space)); }
  async function epochUU(space, epoch) { return _uuid(await _sha('epoch:' + space + ':' + epoch)); }   // the record a REKEY creates; KEYGRANTs read it so they order after it
  async function spaceOf(params) { return _sha(ENV.canonical(params)); }
  async function policyUU(space) { return _uuid(await _sha('policy:' + space)); }   // the one record every POLICY op writes (a new epoch reads the previous one)

  // §13.12.1 — the stagger rule: a device's offset inside the visit period V (ms). Pure, sync, deterministic (FNV-1a 32 over the kid text).
  function staggerOffset(kid, V) {
    if (!Number.isInteger(V) || V < 1) throw new Error('staggerOffset: V must be a positive integer');
    var h = 0x811c9dc5; var t = String(kid);
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h % V;
  }
  async function claimUU(space, key) { return _uuid(await _sha('claimrec:' + space + ':' + key)); }       // the record every claim on one key writes
  async function ckptUU(space, stateHash) { return _uuid(await _sha('ckpt:' + space + ':' + stateHash)); }
  var HEX64 = /^[0-9a-f]{64}$/;
  function ckptProblem(p) {
    if (!p || typeof p !== 'object') return 'params';
    if (!Number.isInteger(p.pos) || p.pos < 1) return 'pos';
    if (!HEX64.test(String(p.state_hash || ''))) return 'state_hash';
    if (!(p.prev === null || HEX64.test(String(p.prev || '')))) return 'prev';
    if (typeof p.bytes_ref !== 'string' || p.bytes_ref.length > 400) return 'bytes_ref';
    if (!p.frontier || typeof p.frontier !== 'object' || Array.isArray(p.frontier)) return 'frontier';
    var ks = Object.keys(p.frontier); if (!ks.length) return 'frontier';
    for (var i = 0; i < ks.length; i++) if (!Number.isInteger(p.frontier[ks[i]]) || p.frontier[ks[i]] < 1) return 'frontier';
    return null;
  }

  // §13.12.3 stability: may the verdicts of the closed prefix S (judged by the S-alone roster `rs`) be reused under the FULL roster `ra`?
  // Returns null when every input of every S verdict is unchanged, else the reason. idHashes = the identity ops that are in S.
  function stableAgainst(rs, ra, frontier, idHashes) {
    for (var i = 0; i < idHashes.length; i++) { var a = rs.verdicts[idHashes[i]], b = ra.verdicts[idHashes[i]];
      if (!a || !b || a.verdict !== b.verdict || (a.reason || null) !== (b.reason || null)) return 'identity-verdict-changed'; }
    function cutEq(x, y, f) { var X = x == null ? Infinity : x, Y = y == null ? Infinity : y; return X === Y || (X >= f && Y >= f); }
    var persons = {};
    var kids = Object.keys(frontier);
    for (var k = 0; k < kids.length; k++) { var kid = kids[k], f = frontier[kid], ds = rs.devices[kid], da = ra.devices[kid];
      if (!ds || !da) return 'device-missing';
      if (ds.jwk.x !== da.jwk.x || ds.jwk.y !== da.jwk.y || ds.person !== da.person) return 'device-changed';
      if (!cutEq(rs.revokes[kid], ra.revokes[kid], f)) return 'revoke-inside';
      persons[ds.person] = 1; }
    for (var pu of Object.keys(persons)) {
      var ps = rs.persons[pu], pa = ra.persons[pu]; if (!ps || !pa) return 'person-missing';
      var want = ps.hist.map(function (e) { return ENV.canonical(e); }), cnt = {}; want.forEach(function (w) { cnt[w] = (cnt[w] || 0) + 1; });
      var matched = [];
      for (var j = 0; j < pa.hist.length; j++) { var e = pa.hist[j], key = ENV.canonical(e);
        if (cnt[key] > 0) { cnt[key]--; matched.push(key); continue; }
        for (var q = 0; q < kids.length; q++) { var kk = kids[q]; if (ra.devices[kk].person !== pu) continue;       // an entry the S-alone roster lacks must not reach any S op of this person
          if (((e.from || {})[kk] || 0) < frontier[kk]) return 'role-inside'; } }
      if (JSON.stringify(matched) !== JSON.stringify(want)) return 'role-order';
    }
    return null;
  }

  // §13.12.1 — validate the POLICY params; unknown keys are tolerated (a newer admin may add values an older device does not know —
  // refusing them would make two devices judge the same op differently). Returns null when valid, else the offending field.
  function policyProblem(p) {
    function pint(x, lo) { return Number.isInteger(x) && x >= lo; }
    if (!p || typeof p !== 'object') return 'params';
    if (!pint(p.epoch, 1)) return 'epoch';
    if (p.visit_ms !== undefined && !pint(p.visit_ms, 1)) return 'visit_ms';
    if (p.stagger !== undefined && p.stagger !== 'kid-hash-mod-V') return 'stagger';
    if (p.bundle_max_ops !== undefined && !pint(p.bundle_max_ops, 1)) return 'bundle_max_ops';
    if (p.gate !== undefined) { if (!p.gate || typeof p.gate !== 'object' || (p.gate.max_object_bytes !== undefined && !pint(p.gate.max_object_bytes, 1)) ||
        (p.gate.max_puts_per_hour !== undefined && !pint(p.gate.max_puts_per_hour, 1))) return 'gate'; }
    if (p.checkpoint !== undefined) { if (!p.checkpoint || typeof p.checkpoint !== 'object' || (p.checkpoint.every_ops !== undefined && !pint(p.checkpoint.every_ops, 1)) ||
        (p.checkpoint.cosigs !== undefined && !pint(p.checkpoint.cosigs, 1))) return 'checkpoint'; }
    if (p.lease_ttl_ms !== undefined && !pint(p.lease_ttl_ms, 1)) return 'lease_ttl_ms';
    if (p.pipes !== undefined) { if (!p.pipes || typeof p.pipes !== 'object' || (p.pipes.primary !== undefined && typeof p.pipes.primary !== 'string') ||
        (p.pipes.fallback !== undefined && (!Array.isArray(p.pipes.fallback) || p.pipes.fallback.some(function (x) { return typeof x !== 'string'; })))) return 'pipes'; }
    if (p.manifest !== undefined && typeof p.manifest !== 'string') return 'manifest';
    if (p.number_prefix !== undefined && typeof p.number_prefix !== 'string') return 'number_prefix';
    if (p.min_v !== undefined) { if (!p.min_v || typeof p.min_v !== 'object' || Array.isArray(p.min_v) || Object.keys(p.min_v).some(function (k) { return !pint(p.min_v[k], 1); })) return 'min_v'; }       // §16.31: the lowest shape version still accepted, per op type
    return null;
  }

  // §13.12.I.1 — the BASE a space sits on: {name, sha256 (64 hex), bytes?, version?}. Returns null when valid, else the offending field.
  // It rides in the GENESIS params, so the space id (a hash of them) pins it. Unknown extra keys are dropped by baseOf (never folded into a verdict).
  function baseProblem(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return 'params';
    if (typeof b.name !== 'string' || !b.name.length || b.name.length > 200) return 'name';
    if (!HEX64.test(String(b.sha256 || ''))) return 'sha256';
    if (b.bytes !== undefined && !(Number.isInteger(b.bytes) && b.bytes >= 0)) return 'bytes';
    if (b.version !== undefined && typeof b.version !== 'string') return 'version';
    return null;
  }
  function baseOf(b) { if (baseProblem(b)) return null; var o = { name: b.name, sha256: b.sha256 }; if (b.bytes !== undefined) o.bytes = b.bytes; if (b.version !== undefined) o.version = b.version; return o; }

  // the records an op creates or changes (GENESIS makes three: the space, the founder's device and person)
  async function touched(env) {
    if (env.body && env.body.op_type === 'GENESIS') { var f = env.body.params.founder, r = [env.target.uu, await devUU(f.kid), String(f.person_uu).toLowerCase()];
      if (dhOf(f.dh_jwk)) r.push(await epochUU(env.space, 1)); return r; }          // an encrypted space's genesis also creates epoch 1
    return [env.target.uu];
  }

  function roleAt(person, kid, seq) {
    var r = { ad_role_id: null, comm_admin: false };
    if (!person) return r;
    person.hist.forEach(function (e) {
      if ((e.from[kid] || 0) < seq) { if (e.ad_role_id !== undefined) r.ad_role_id = e.ad_role_id; if (e.comm_admin !== undefined) r.comm_admin = !!e.comm_admin; }
    });
    return r;
  }

  var SIGMEMO = Object.create(null);
  // ops = [{hash, env}] — every identity op this device holds. pinned = the space id from the invite.
  async function fold(ops, pinned) {
    var ident = ops.filter(function (o) { return o.env && o.env.body && IDENTITY[o.env.body.op_type]; });
    var verdict = {}, gen = null;
    for (var i = 0; i < ident.length; i++) {                               // the ONE trusted genesis
      var g = ident[i].env;
      if (g.body.op_type !== 'GENESIS') continue;
      var p = g.body.params || {}, f = p.founder || {};
      var ok = g.space === pinned && g.seq === 1 && (await spaceOf(p)) === pinned && f.jwk && (await kidOf(f.jwk)) === f.kid &&
               g.author === f.kid && (await ENV.verify(g, f.jwk));
      if (ok && !gen) gen = ident[i]; else verdict[ident[i].hash] = { verdict: 'REFUSED', reason: ok ? 'second-genesis' : 'untrusted-genesis' };
    }
    if (!gen) return { ok: false, reason: 'no-trusted-genesis', verdicts: verdict, devices: {}, persons: {}, revokes: {}, grants: [], rekeys: [], epoch: 0, encrypted: false, holdersAll: {}, policy: null, checkpoints: {}, base: null, roleAt: function () { return { ad_role_id: null, comm_admin: false }; } };

    // the only key a kid can have is the one that hashes to it — collect them, then verify every op once
    var jwkOf = {}, keyOk = {}; jwkOf[gen.env.body.params.founder.kid] = gen.env.body.params.founder.jwk;
    for (var j = 0; j < ident.length; j++) { var e = ident[j].env;
      if (e.body.op_type === 'ENROLL' && e.body.params.jwk && (await kidOf(e.body.params.jwk)) === e.body.params.kid) { keyOk[ident[j].hash] = true; jwkOf[e.body.params.kid] = e.body.params.jwk; } }
    var sigOk = {};
    for (var k = 0; k < ident.length; k++) { var ek = ident[k].env, mk = ident[k].hash + '|' + (jwkOf[ek.author] ? jwkOf[ek.author].x : '');       // a signature verdict never changes: remember it across folds
      if (SIGMEMO[mk] == null) SIGMEMO[mk] = !!jwkOf[ek.author] && (await ENV.verify(ek, jwkOf[ek.author])); sigOk[ident[k].hash] = SIGMEMO[mk]; }

    var byHash = {}; ident.forEach(function (o) { byHash[o.hash] = o.env; });
    var L = ORD.linearize(ident.filter(function (o) { return !verdict[o.hash]; }).map(function (o) {
      return { hash: o.hash, author: o.env.author, seq: o.env.seq, prev: null, deps: o.env.deps || [] }; }));

    function walk(cut) {
      var dev = {}, person = {}, rev = {}, v = {}, holders = {}, grants = [], rekeys = [], maxE = 0, policy = null, ck = {};
      L.order.forEach(function (h) {
        var e = byHash[h], p = e.body.params || {}, t = e.body.op_type;
        if (h === gen.hash) {
          var f = p.founder; person[String(f.person_uu).toLowerCase()] = { name: f.name, hist: [{ ad_role_id: f.ad_role_id, comm_admin: true, from: {} }] };
          dev[f.kid] = { jwk: f.jwk, dh: dhOf(f.dh_jwk), person: String(f.person_uu).toLowerCase() }; v[h] = { verdict: 'MERGED', reason: 'genesis' };
          if (dev[f.kid].dh) { maxE = 1; holders[1] = {}; holders[1][f.kid] = 1; }    // the founder creates epoch 1 and holds it
          return;
        }
        function no(why) { v[h] = { verdict: 'REFUSED', reason: why }; }
        var signer = dev[e.author];
        if (!signer) return no('unknown-signer');
        if (cut[e.author] != null && e.seq > cut[e.author]) return no('revoked');
        if (!sigOk[h]) return no('signature');
        var admin = roleAt(person[signer.person], e.author, e.seq).comm_admin;
        if (t === 'PERSON') {
          var pu = String(p.person_uu || '').toLowerCase();
          if (!admin) return no('not-admin'); if (person[pu]) return no('person-exists');
          person[pu] = { name: p.name, hist: [{ ad_role_id: p.ad_role_id, comm_admin: !!p.comm_admin, from: {} }] };
        } else if (t === 'ENROLL') {
          var ep = String(p.person_uu || '').toLowerCase();
          if (!keyOk[h]) return no('kid-not-key');
          if (!person[ep]) return no('no-person');
          if (!(admin || signer.person === ep)) return no('not-admin-or-same-person');
          if (dev[p.kid]) return no('device-exists');
          dev[p.kid] = { jwk: p.jwk, dh: dhOf(p.dh_jwk), person: ep };
        } else if (t === 'ROLE') {
          var rp = String(p.person_uu || '').toLowerCase();
          if (!admin) return no('not-admin'); if (!person[rp]) return no('no-person');
          var ent = { from: p.from_seq || {} }; if (p.ad_role_id !== undefined) ent.ad_role_id = p.ad_role_id; if (p.comm_admin !== undefined) ent.comm_admin = p.comm_admin;
          person[rp].hist.push(ent);
        } else if (t === 'REVOKE') {
          var target = dev[p.kid];
          if (!target) return no('no-device');
          if (!(admin || target.person === signer.person)) return no('not-admin-or-same-person');
          rev[p.kid] = rev[p.kid] == null ? p.last_good_seq : Math.min(rev[p.kid], p.last_good_seq);
        } else if (t === 'KEYGRANT') {       // §13.2: the space key of one epoch, wrapped for one device
          var gk = dev[p.kid];
          if (!gk) return no('no-device'); if (!gk.dh) return no('no-dh');
          if (p.from_kid !== e.author) return no('from-mismatch');
          if (!(admin || gk.person === signer.person)) return no('not-admin-or-same-person');
          if (typeof p.wrapped !== 'string' || !holders[p.epoch]) return no('no-epoch');
          if (!holders[p.epoch][e.author]) return no('granter-not-holder');       // only a device that holds the epoch can pass it on
          holders[p.epoch][p.kid] = 1; grants.push({ hash: h, epoch: p.epoch, kid: p.kid, from_kid: e.author, wrapped: p.wrapped });
        } else if (t === 'REKEY') {          // §13.2: epoch n+1; a second REKEY for the same epoch is refused (first in fold order wins)
          if (!admin) return no('not-admin');
          if (!dev[e.author].dh) return no('no-dh');
          if (p.epoch !== maxE + 1) return no(Number.isInteger(p.epoch) && p.epoch <= maxE ? 'epoch-exists' : 'epoch-not-next');
          maxE = p.epoch; holders[p.epoch] = {}; holders[p.epoch][e.author] = 1; rekeys.push({ hash: h, epoch: p.epoch, author: e.author, excludes: Array.isArray(p.excludes) ? p.excludes : [] });
        } else if (t === 'POLICY') {         // §13.12.1: the config controller; epochs only go up, first in fold order wins an epoch
          if (!admin) return no('not-admin');
          var pb = policyProblem(p); if (pb) return no('bad-policy:' + pb);
          if (policy && p.epoch <= policy.epoch) return no(p.epoch === policy.epoch ? 'epoch-exists' : 'epoch-stale');
          if (policy && policy.params.min_v && Object.keys(policy.params.min_v).some(function (k) { return !p.min_v || !(p.min_v[k] >= policy.params.min_v[k]); })) return no('min_v-lowered');      // §16.31: a retirement never un-retires (checkpoints freeze verdicts)
          policy = { epoch: p.epoch, params: p, hash: h, author: e.author };
        } else if (t === 'CHECKPOINT') {     // §13.12.3: any enrolled device may publish; a second op for the same state is a co-signature
          var cb = ckptProblem(p); if (cb) return no('bad-checkpoint:' + cb);
          var prior = ck[p.state_hash];
          if (prior) { if (prior.params.pos !== p.pos || prior.params.prev !== p.prev || ENV.canonical(prior.params.frontier) !== ENV.canonical(p.frontier)) return no('checkpoint-mismatch');
            if (prior.authors[e.author]) return no('checkpoint-duplicate'); }
          else prior = ck[p.state_hash] = { params: { pos: p.pos, state_hash: p.state_hash, prev: p.prev, frontier: p.frontier }, ops: [], authors: {}, persons: {} };
          prior.ops.push({ hash: h, author: e.author, person: signer.person, bytes_ref: p.bytes_ref }); prior.authors[e.author] = 1; prior.persons[signer.person] = 1;
        } else if (t === 'GENESIS') return no('second-genesis');
        v[h] = { verdict: 'MERGED', reason: t.toLowerCase() };
      });
      return { dev: dev, person: person, rev: rev, v: v, holders: holders, grants: grants, rekeys: rekeys, epoch: maxE, policy: policy, ck: ck };
    }
    var cut = {}, w = null, walks = 0, stable = false;
    while (walks < 5) { walks++; w = walk(cut); if (JSON.stringify(w.rev) === JSON.stringify(cut)) { stable = true; break; } cut = w.rev; }
    Object.keys(w.v).forEach(function (h) { verdict[h] = w.v[h]; });
    L.parked.forEach(function (h) { verdict[h] = { verdict: 'PARKED', reason: 'deps' }; });
    return { ok: stable, reason: stable ? 'ok' : 'unstable', genesis: gen.hash, walks: walks, devices: w.dev, persons: w.person, revokes: w.rev, verdicts: verdict,
             encrypted: w.epoch > 0, epoch: w.epoch, base: baseOf(gen.env.body.params.base), grants: w.grants, rekeys: w.rekeys, policy: w.policy, checkpoints: w.ck, holdersAll: (function () { var a = {}; Object.keys(w.holders).forEach(function (e) { Object.keys(w.holders[e]).forEach(function (k) { a[k] = 1; }); }); return a; })(),
             roleAt: function (kid, seq) { var d = w.dev[kid]; return roleAt(d && w.person[d.person], kid, seq); } };
  }

  var API = { IDENTITY: IDENTITY, fold: fold, kidOf: kidOf, devUU: devUU, spaceUU: spaceUU, epochUU: epochUU, policyUU: policyUU, spaceOf: spaceOf, touched: touched, dhOf: dhOf,
              staggerOffset: staggerOffset, policyProblem: policyProblem, ckptUU: ckptUU, claimUU: claimUU, ckptProblem: ckptProblem, stableAgainst: stableAgainst, baseProblem: baseProblem };
  global.CommRoster = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
