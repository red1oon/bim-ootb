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
  async function verifySet(set) {                                 // -> null | 'unsigned' | 'untrusted-signer' | 'bad-signature'
    if (!set || !set.sig || !set.signer) return 'unsigned';
    var t = trust();
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
  async function load(set) { var r = await reg.loadSet(set); console.log('§TEAM_VERSIONS_SET op=' + (set && set.op) + ' ' + (r.ok ? 'ok' : 'refused:' + r.reason)); if (r.ok) loaded++; return r; }
  var ready = (async function () {
    for (var i = 0; i < offered.length; i++) await load(offered[i]);
    console.log('§TEAM_VERSIONS appV=' + OPS.map(function (o) { return o + ':' + appV(o); }).join(',') + ' sets=' + loaded + '/' + offered.length);
  })().catch(function (e) { console.log('🔴 §TEAM_VERSIONS ' + (e && e.message)); });
  global.TeamVersions = { registry: reg, ready: ready, appV: appV, load: load, loaded: function () { return loaded; } };
})(typeof window !== 'undefined' ? window : globalThis);
