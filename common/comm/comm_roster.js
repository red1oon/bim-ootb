// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_roster.js — identity as ops: who is in the space, which devices are theirs, what role they hold.
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.5 + §12.7 (CL4) — Witness: W-ADMIT-FOLD.
 *
 * Identity ops are ordinary v3 envelopes: GENESIS · PERSON · ENROLL · ROLE · REVOKE.
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
  var IDENTITY = { GENESIS: 1, PERSON: 1, ENROLL: 1, ROLE: 1, REVOKE: 1 };

  function _hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  async function _sha(s) { return _hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
  function _uuid(h) { return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
  async function kidOf(jwk) { return (await _sha(jwk.x + '.' + jwk.y)).slice(0, 16); }
  async function devUU(kid) { return _uuid(await _sha('dev:' + kid)); }
  async function spaceUU(space) { return _uuid(await _sha('space:' + space)); }
  async function spaceOf(params) { return _sha(ENV.canonical(params)); }

  // the records an op creates or changes (GENESIS makes three: the space, the founder's device and person)
  async function touched(env) {
    if (env.body && env.body.op_type === 'GENESIS') { var f = env.body.params.founder; return [env.target.uu, await devUU(f.kid), String(f.person_uu).toLowerCase()]; }
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
    if (!gen) return { ok: false, reason: 'no-trusted-genesis', verdicts: verdict, devices: {}, persons: {}, revokes: {}, roleAt: function () { return { ad_role_id: null, comm_admin: false }; } };

    // the only key a kid can have is the one that hashes to it — collect them, then verify every op once
    var jwkOf = {}, keyOk = {}; jwkOf[gen.env.body.params.founder.kid] = gen.env.body.params.founder.jwk;
    for (var j = 0; j < ident.length; j++) { var e = ident[j].env;
      if (e.body.op_type === 'ENROLL' && e.body.params.jwk && (await kidOf(e.body.params.jwk)) === e.body.params.kid) { keyOk[ident[j].hash] = true; jwkOf[e.body.params.kid] = e.body.params.jwk; } }
    var sigOk = {};
    for (var k = 0; k < ident.length; k++) { var ek = ident[k].env; sigOk[ident[k].hash] = !!jwkOf[ek.author] && (await ENV.verify(ek, jwkOf[ek.author])); }

    var byHash = {}; ident.forEach(function (o) { byHash[o.hash] = o.env; });
    var L = ORD.linearize(ident.filter(function (o) { return !verdict[o.hash]; }).map(function (o) {
      return { hash: o.hash, author: o.env.author, seq: o.env.seq, prev: null, deps: o.env.deps || [] }; }));

    function walk(cut) {
      var dev = {}, person = {}, rev = {}, v = {};
      L.order.forEach(function (h) {
        var e = byHash[h], p = e.body.params || {}, t = e.body.op_type;
        if (h === gen.hash) {
          var f = p.founder; person[String(f.person_uu).toLowerCase()] = { name: f.name, hist: [{ ad_role_id: f.ad_role_id, comm_admin: true, from: {} }] };
          dev[f.kid] = { jwk: f.jwk, person: String(f.person_uu).toLowerCase() }; v[h] = { verdict: 'MERGED', reason: 'genesis' }; return;
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
          dev[p.kid] = { jwk: p.jwk, person: ep };
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
        } else if (t === 'GENESIS') return no('second-genesis');
        v[h] = { verdict: 'MERGED', reason: t.toLowerCase() };
      });
      return { dev: dev, person: person, rev: rev, v: v };
    }
    var cut = {}, w = null, walks = 0, stable = false;
    while (walks < 5) { walks++; w = walk(cut); if (JSON.stringify(w.rev) === JSON.stringify(cut)) { stable = true; break; } cut = w.rev; }
    Object.keys(w.v).forEach(function (h) { verdict[h] = w.v[h]; });
    L.parked.forEach(function (h) { verdict[h] = { verdict: 'PARKED', reason: 'deps' }; });
    return { ok: stable, reason: stable ? 'ok' : 'unstable', genesis: gen.hash, walks: walks, devices: w.dev, persons: w.person, revokes: w.rev, verdicts: verdict,
             roleAt: function (kid, seq) { var d = w.dev[kid]; return roleAt(d && w.person[d.person], kid, seq); } };
  }

  var API = { IDENTITY: IDENTITY, fold: fold, kidOf: kidOf, devUU: devUU, spaceUU: spaceUU, spaceOf: spaceOf, touched: touched };
  global.CommRoster = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
