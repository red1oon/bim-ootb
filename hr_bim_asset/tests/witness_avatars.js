// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-AVATARS witness (§AVATAR-LOD — P6, the LOD ladder over the presence lens, 2026-07-01).
//   Drives the pure avatar engine over a REAL signed check-in log (attendance.demoSeed over the HHS room fixture)
//   and asserts: one avatar per present person per RESOLVED zone (count == presenceByZone headcount), ring-placed
//   around the real centroid; the LOD ladder (far→dot, mid→mini, near→full); the watermarked hover tip; and
//   NON-INVENT (an unresolved zone / a zone with no centroid / zero check-ins → zero avatars, never a faked
//   person). No Three.js — the browser render is the live check. Run:  node hr_bim_asset/tests/witness_avatars.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-AVATARS ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');
var Av = require('../avatars'), At = require('../attendance');
var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'hhs_rooms.json'), 'utf8'));
var G = FX.rooms.map(function (r) { return r.guid; });
var PERIOD = '2026-07';

// enriched check-in log over the real rooms → per-person sessions (the presence substrate)
var log = At.demoSeed(FX.rooms, PERIOD).log;
var sessions = At.sessions(log, PERIOD);
var head = At.presenceByZone(log, PERIOD);                        // {zone, headcount} — the density truth
var totalHead = head.reduce(function (s, x) { return s + x.headcount; }, 0);

// a resolvable-zone gate + a deterministic fake centroid per zone (stands in for the member-mesh centroid)
var realSet = new Set(G);
function resolveZone(z) { return realSet.has(z); }
var CEN = {}; G.forEach(function (g, i) { CEN[g] = { x: i * 10, y: 3, z: i * 5 }; });   // distinct, deterministic
function zoneCentroid(z) { return CEN[z] || null; }

// ---- A1 — one avatar per present person per resolved zone; count == presenceByZone headcount (non-invent count).
var plan = Av.avatarPlan(sessions, { resolveZone: resolveZone, zoneCentroid: zoneCentroid, ringRadius: 0.6 });
var perZone = {}; plan.forEach(function (a) { perZone[a.zone] = (perZone[a.zone] || 0) + 1; });
var matchesHead = head.filter(function (h) { return realSet.has(h.zone); }).every(function (h) { return (perZone[h.zone] || 0) === h.headcount; });
ok('A1-one-avatar-per-person', plan.length === totalHead && matchesHead && plan.every(function (a) { return realSet.has(a.zone); }),
  plan.length + ' avatars == ' + totalHead + ' checked-in people (per-zone count matches presenceByZone headcount), every avatar on a real zone');

// ---- A2 — ring placement: N>1 people in a zone are spread around the centroid (not stacked); n==1 sits centre.
var multi = Object.keys(perZone).filter(function (z) { return perZone[z] > 1; })[0];
var ringOk = true, centreOk = true;
if (multi) {
  var inZone = plan.filter(function (a) { return a.zone === multi; });
  var c = CEN[multi];
  ringOk = inZone.every(function (a) { var d = Math.hypot(a.pos.x - c.x, a.pos.z - c.z); return Math.abs(d - 0.6) < 1e-6; })
    && new Set(inZone.map(function (a) { return a.pos.x.toFixed(4) + ',' + a.pos.z.toFixed(4); })).size === inZone.length;  // all distinct
}
var single = plan.filter(function (a) { return perZone[a.zone] === 1; })[0];
if (single) { var sc = CEN[single.zone]; centreOk = single.pos.x === sc.x && single.pos.z === sc.z; }
ok('A2-ring-placement', ringOk && centreOk,
  'multiple people in a zone ring around its centroid (radius 0.6, all distinct positions); a lone person sits at centre');

// ---- A3 — the LOD ladder: far → dot, mid → mini, near → full (thresholds full=12, mini=30).
ok('A3-lod-ladder', Av.avatarLOD(100) === 'dot' && Av.avatarLOD(31) === 'dot' && Av.avatarLOD(30) === 'mini'
  && Av.avatarLOD(13) === 'mini' && Av.avatarLOD(12) === 'full' && Av.avatarLOD(2) === 'full' && Av.avatarLOD(null) === 'dot',
  'avatarLOD: >30m dot · 12–30m mini · ≤12m full (no distance → dot)');

// ---- A4 — hover tip: a watermarked person card with the planned image field; falls back to id, never invents.
var tip = Av.avatarTip(plan[0], { name: 'Aisha Rahman', image: 'bp/AISHA.png' }, 'ms');
var tipNoProfile = Av.avatarTip(plan[0], null, 'en');
ok('A4-hover-tip', tip.name === 'Aisha Rahman' && tip.imageRef === 'bp/AISHA.png' && tip._watermark === 'CONTOH — TIDAK RASMI'
  && tip.zone === plan[0].zone && tipNoProfile.name === plan[0].employee && tipNoProfile.imageRef === null && tipNoProfile._watermark === 'SAMPLE — NOT OFFICIAL',
  'tip = watermarked card {name(AD_User)·image(C_BPartner.image, planned)·zone·since·status}; no profile → falls back to id, image null (never fabricated)');

// ---- A5 — NON-INVENT: unresolved zone, no-centroid zone, and empty log all yield ZERO avatars.
var noneResolve = Av.avatarPlan(sessions, { resolveZone: function () { return false; }, zoneCentroid: zoneCentroid }).length;
var noCentroid = Av.avatarPlan(sessions, { resolveZone: resolveZone, zoneCentroid: function () { return null; } }).length;
var emptyLog = Av.avatarPlan(At.sessions([], PERIOD), { resolveZone: resolveZone, zoneCentroid: zoneCentroid }).length;
ok('A5-noninvent', noneResolve === 0 && noCentroid === 0 && emptyLog === 0,
  'zero avatars when: no zone resolves (' + noneResolve + '), no centroid exists (' + noCentroid + '), or no check-ins (' + emptyLog + ') — an avatar is never faked');

// ---- A6 — DETERMINISTIC: same sessions → identical plan (ids, order, positions) — replays exactly.
var plan2 = Av.avatarPlan(At.sessions(At.demoSeed(FX.rooms, PERIOD).log, PERIOD), { resolveZone: resolveZone, zoneCentroid: zoneCentroid, ringRadius: 0.6 });
ok('A6-deterministic', JSON.stringify(plan) === JSON.stringify(plan2),
  'the avatar plan is fully deterministic (re-seed → identical ids, order and positions)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-AVATARS ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
