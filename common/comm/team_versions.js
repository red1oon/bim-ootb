// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// team_versions.js — host glue for event versioning (TEAMWORK_FRAMEWORK §16.30-§16.32). Builds the ONE OpVersions registry a host passes to CommStore.open({versions}).
// Configuration, all optional (absent = exactly today's behaviour; a shape-1 app judges nothing differently):
//   window.TEAM_SHAPE_V    {op_type: n}  the shape version this app build reads (default 1 for every op type)
//   window.TEAM_UPCASTERS  [signed set]  declarative old->new mappings (data, never code)
//   trust                  window.TEAM_PLAN_TRUST — the SAME public keys as plan signing (one admin key signs both).
// A set carries `signer` (a JWK: kty/crv/x/y) and `sig` (hex ECDSA P-256/SHA-256) over the canonical JSON of the set WITHOUT `sig` and `signer` — the plan's own scheme.
// An EMPTY trust list accepts NO set: a set rewrites the meaning of stored data, so unlike a plan it is never used unsigned.
(function (global) {
  'use strict';
  var OV = global.ERP && global.ERP.OpVersions;
  if (!OV) { console.log('🔴 §TEAM_VERSIONS op_versions.js not loaded'); return; }
  var OPS = ['CRUD_CREATE', 'CRUD_UPDATE', 'CRUD_DELETE', 'SET_STATUS'];   // every op type the team adapters author (the Modeller authors the first two, the ERP all four)
  function trust() { var t = global.TEAM_PLAN_TRUST; return Array.isArray(t) && t.length ? t : null; }
  function same(a, b) { return !!a && !!b && a.x === b.x && a.y === b.y && a.crv === b.crv; }
  function bytes(h) { var u = new Uint8Array(h.length / 2); for (var i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; }
  // §38.11 (G-7): a set from the log is judged against the list in force when its POLICY arrived (the engine's setTrust, the same on every device);
  //   a deployment-shipped set (window.TEAM_UPCASTERS) against the deployment list — `judgeWith` is set by adopt() around each load
  var judgeWith = null;
  async function verifySet(set) {                                 // -> null | 'unsigned' | 'untrusted-signer' | 'bad-signature'
    if (!set || !set.sig || !set.signer) return 'unsigned';
    var t = judgeWith || trust();
    if (!t || !t.some(function (k) { return same(set.signer, k); })) return 'untrusted-signer';
    try {
      var body = JSON.parse(JSON.stringify(set)); delete body.sig; delete body.signer;
      var key = await global.crypto.subtle.importKey('jwk', { kty: set.signer.kty, crv: set.signer.crv, x: set.signer.x, y: set.signer.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return (await global.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes(set.sig), new TextEncoder().encode(OV.canonical(body)))) ? null : 'bad-signature';
    } catch (e) { return 'bad-signature'; }
  }
  function appV(op) { var m = global.TEAM_SHAPE_V || {}, v = m[op]; return Number.isInteger(v) && v >= 1 ? v : 1; }
  var reg = OV.create({ verifySet: verifySet });
  OPS.forEach(function (op) { reg.setApp(op, appV(op)); });
  var offered = Array.isArray(global.TEAM_UPCASTERS) ? global.TEAM_UPCASTERS : [], loaded = 0;
  var okSets = {};                                                // canonical JSON of every set already loaded: the same set arriving twice (config AND policy) counts once
  async function load(set) {
    var key = set && typeof set === 'object' ? OV.canonical(set) : null;
    if (key && okSets[key]) return { ok: true, dup: true };
    var r = await reg.loadSet(set); console.log('§TEAM_VERSIONS_SET op=' + (set && set.op) + ' ' + (r.ok ? 'ok' : 'refused:' + r.reason)); if (r.ok) { loaded++; if (key) okSets[key] = 1; } return r;
  }
  var ready = (async function () {
    for (var i = 0; i < offered.length; i++) await load(offered[i]);
    console.log('§TEAM_VERSIONS appV=' + OPS.map(function (o) { return o + ':' + appV(o); }).join(',') + ' sets=' + loaded + '/' + offered.length);
  })().catch(function (e) { console.log('🔴 §TEAM_VERSIONS ' + (e && e.message)); });
  // §16.34 the ONE place the words live. verdictMap = the verdicts a host's render() already holds (S.order().verdict): { <hash>: {verdict, reason} }.
  function describe(verdictMap) {
    var by = {}, rby = {}, parked = 0, refused = 0;
    Object.keys(verdictMap || {}).forEach(function (h) { var v = verdictMap[h];
      if (v.verdict === 'PARKED') { parked++; by[v.reason] = (by[v.reason] || 0) + 1; }
      else if (v.verdict === 'REFUSED' && (v.reason === 'retired-version' || v.reason === 'bogus-version')) { refused++; rby[v.reason] = (rby[v.reason] || 0) + 1; } });
    var up = by['needs-upgrade'] || 0, mp = by['needs-mapping'] || 0, nt = by['needs-translation'] || 0, dp = by.deps || 0, ret = rby['retired-version'] || 0, bog = rby['bogus-version'] || 0, parts = [];
    var pl = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
    if (up) parts.push(pl(up, 'change from a newer app waits', 'changes from a newer app wait') + ' — update this app');
    if (mp) parts.push(pl(mp, 'change waits', 'changes wait') + ' for a translation rule from the team admin');
    if (nt) parts.push(pl(nt, 'change from a retired version waits', 'changes from a retired version wait') + ' for a translation from the team admin — nothing is lost');       // §46.6 S2: below the floor is a wait, never a refusal
    if ((up || mp || nt) && dp) parts.push(pl(dp, 'more waits', 'more wait') + ' on those');
    if (ret) parts.push(pl(ret, 'change from a retired version was ignored', 'changes from a retired version were ignored'));
    if (bog) parts.push(pl(bog, 'change with an unreadable version was ignored', 'changes with an unreadable version were ignored'));
    var vParked = up + mp + nt > 0, lines = Object.keys(by).sort().map(function (k) { return k + ': ' + by[k]; }).concat(Object.keys(rby).sort().map(function (k) { return k + ': ' + rby[k]; }));
    return { level: vParked ? 'provisional' : (refused ? 'refused' : 'ok'), parked: parked, refused: refused, by_reason: by, text: parts.length ? '⚠ ' + parts.join(' · ') : '', title: lines.join('\n') };
  }
  // paint the result on the host's Team chip (#team-chip) and append it to its warning line (#team-warn); the local-only warning is untouched
  function paint(chip, warn, verdictMap) {
    var d = describe(verdictMap);
    if (chip) { chip.setAttribute('data-versions', d.level); chip.setAttribute('data-parked', String(d.parked)); chip.setAttribute('data-version-refused', String(d.refused)); }
    if (warn && d.text) { warn.textContent = (warn.textContent ? warn.textContent + ' ' : '') + d.text; warn.title = (warn.title ? warn.title + '\n' : '') + d.title; }
    return d;
  }
  // §16.35 — sets an admin published inside the POLICY op. adopt(store): load every set of the policy in force that this device has not judged yet (same verifier as config sets);
  // if any was newly loaded, refold so the parked ops are judged again. A refused set is remembered and not retried every visit, unless the trust list changed (then it is judged afresh).
  var tried = {}, trustKey = null;
  async function adopt(store) {
    if (!store || typeof store.policy !== 'function') return 0;
    var pol = await store.policy(), sets = pol && pol.params && pol.params.upcasters; if (!Array.isArray(sets) || !sets.length) return 0;
    var tk = JSON.stringify(trust() || []); if (tk !== trustKey) { tried = {}; trustKey = tk; }
    var n = 0;
    var st = pol.setTrust || null; if (!st) console.log('§TEAM_VERSIONS_TRUST fallback=current (the engine names no per-set list)');
    for (var i = 0; i < sets.length; i++) { var k = OV.canonical(sets[i]); if (tried[k] !== undefined) continue;
      var at = st && Object.prototype.hasOwnProperty.call(st, k) ? (st[k] || []) : null;
      judgeWith = at; var r; try { r = await load(sets[i]); } finally { judgeWith = null; }
      tried[k] = r.ok ? 'ok' : r.reason; if (r.ok && !r.dup) n++; }
    if (n && typeof store.refold === 'function') store.refold();
    if (n) console.log('§TEAM_VERSIONS_ADOPT newly loaded=' + n + ' (from the POLICY in force, epoch ' + pol.epoch + ')');
    return n;
  }
  // publish(store, sets): admin only (the engine refuses a non-admin POLICY). The next POLICY = the previous params + epoch+1 + upcasters = previous ∪ sets (deduplicated): a published set is never dropped (the engine enforces it).
  async function publish(store, sets) {
    var pol = await store.policy(), base = pol ? JSON.parse(JSON.stringify(pol.params)) : {}, have = {}, merged = [];
    (Array.isArray(base.upcasters) ? base.upcasters : []).concat(sets || []).forEach(function (u) { var k = OV.canonical(u); if (!have[k]) { have[k] = 1; merged.push(u); } });
    base.epoch = (pol ? pol.epoch : 0) + 1; base.upcasters = merged;
    return store.setPolicy(base);
  }
  global.TeamVersions = { registry: reg, ready: ready, appV: appV, load: load, loaded: function () { return loaded; }, describe: describe, paint: paint, adopt: adopt, publish: publish };
})(typeof window !== 'undefined' ? window : globalThis);
