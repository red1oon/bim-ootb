// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-OCCUPANCY witness (Resource-Assignment slice — iDempiere S_Resource / S_Resource-
//   Assignment as a room occupancy/availability graph). Each check NAMES the issue it proves. Load-bearing
//   claims: a room ASSIGN is SIGNED + scoped to a REAL building room (phantom → REFUSE); AVAILABILITY is a
//   REPLAY of the op-log (occupied/vacant/expiring/unavailable, early-release + blackout honored); vacancy is
//   ABSENCE of an assignment (never fabricated); the PIVOT (room×period + per-storey utilization) is pure data
//   the dashboard renders; a REQUEST maps to its availability effect over the shared resource guid; the lens
//   rides the EXISTING MeshPort seam. Run: node hr_bim_asset/tests/witness_occupancy.js
'use strict';
var fs = require('fs'), path = require('path');
var Oc = require('../occupancy'), O = require('../overlay'), C = require('../connectors'), B = require('../binding'), M = require('../models');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-OCC ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var G = FX.rooms.map(function (r) { return r.guid; });
var storeyOf = {}; FX.rooms.forEach(function (r) { storeyOf[r.guid] = r.storey; });
var PERIODS = []; for (var m = 1; m <= 12; m++) PERIODS.push('2026-' + ('0' + m).slice(-2));

// seed HHS across REAL rooms (signed ledger). g0 occupied all-year · g1 expiring · g3 occupied+renovated ·
// g4 occupied then early move-out Aug · g2 & the rest VACANT (no op).
var S = Oc.demoSeed(FX.rooms), log = S.log;

// ---- O0: the availability graph is a SIGNED, tamper-evident log ------------------------------------------
ok('O0-signed-chain', log.length >= 5 && log.every(function (o) { return o.sig && o.op_hash; }) && C.verifyChain(log).ok,
  'every ASSIGN/RELEASE/UNAVAIL is signed; verifyChain OK (the occupancy graph is tamper-evident)');

// ---- O1: a room not in the building is REFUSED (spatial non-invent gate) ---------------------------------
var rf = Oc.assign({ resource: 'GUID-NOT-IN-BUILDING', party: 'BP-X', from: '2026-01', to: '2026-12', ts: '2026-01-01T00:00:00Z' }, FX);
ok('O1-refuse-phantom', rf.refused === 'unlocated-room' && B.resolveGuid('GUID-NOT-IN-BUILDING', FX) === false,
  'cannot assign a room not in the building → REFUSE (never a phantom resource)');

// ---- O2: AVAILABILITY = REPLAY (occupied / expiring / vacant / unavailable) -------------------------------
ok('O2a-occupied', Oc.availability(log, G[0], '2026-03').state === 'occupied' && Oc.availability(log, G[0], '2026-03').party === 'BP-TEN-1',
  'g0 mid-term → occupied by BP-TEN-1 (replayed from the assignment)');
ok('O2b-expiring', Oc.availability(log, G[1], '2026-06').state === 'expiring',
  'g1 lease ends 2026-06 → expiring within horizon');
ok('O2c-vacant', Oc.availability(log, G[2], '2026-03').state === 'vacant' && Oc.occupancyAt(log, G[2], '2026-03') === null,
  'g2 has NO assignment → vacant (vacancy = absence of an op, never a fabricated tenant)');
ok('O2d-unavailable', Oc.availability(log, G[3], '2026-03').state === 'unavailable' && Oc.availability(log, G[3], '2026-01').state === 'occupied',
  'g3 renovation blackout 2026-03 → unavailable (wins); 2026-01 → occupied (S_ResourceUnAvailable honored)');

// ---- O3: early RELEASE caps the term -----------------------------------------------------------------------
ok('O3-early-release', Oc.occupancyAt(log, G[4], '2026-07') === 'BP-TEN-4' && Oc.availability(log, G[4], '2026-09').state === 'vacant',
  'g4 released Aug → occupied through Jul, vacant from Sep (early move-out respected, not the original to-date)');

// ---- O4: PIVOT — room×period matrix + utilization + per-storey + per-period (the dashboard data) ----------
var pv = Oc.pivot(log, PERIODS, { allResources: G, storeyOf: function (r) { return storeyOf[r]; }, locale: 'en' });
ok('O4a-util', pv.byRoom[G[0]].utilization === 1 && pv.byRoom[G[4]].utilization === 0.67 && pv.byRoom[G[2]].utilization === 0,
  'per-room utilization: g0=1.0 (full year), g4=0.67 (8/12, released Aug), g2=0 (vacant)');
ok('O4b-period-rollup', pv.byPeriod['2026-03'].unavailable === 1 && pv.byPeriod['2026-03'].total === G.length,
  'per-period rollup: 2026-03 has 1 unavailable room; total = all ' + G.length + ' rooms (vacancies counted)');
ok('O4c-overall-storey', pv.overall.rooms === G.length && pv.byStorey.length >= 1 && pv.byStorey.every(function (s) { return s.utilization >= 0 && s.utilization <= 1; }),
  'overall covers all ' + G.length + ' rooms; per-storey utilization in [0,1] (pivot is dashboard-ready)');

// ---- O5: lens rides the EXISTING MeshPort seam (occupied green / vacant grey / unavailable purple) --------
var rows = Oc.lensRows(log, '2026-03', { resources: G });          // include vacant rooms
var plan = O.computeOccupancy(rows.concat([{ zone: 'FAKE-ROOM', state: 'vacant' }]), { knownGuids: FX, period: '2026-03' });
ok('O5a-gate', plan.unlinked.indexOf('FAKE-ROOM') >= 0 && !plan.tints['FAKE-ROOM'],
  'a room not in the model is honestly UN-LINKED (render-side non-invent gate)');
ok('O5b-states', plan.tints[G[0]].color === O.COLORS.occupied && plan.tints[G[2]].color === O.COLORS.vacant && plan.tints[G[3]].color === O.COLORS.unavailable,
  'computeOccupancy paints occupied=green, vacant=grey, unavailable=purple (state-as-color)');
function makePort(guids) { var st = { tint: {}, ghost: {} }; return { _st: st, allGuids: function () { return guids.slice(); },
  setTint: function (g, c) { st.tint[g] = c; }, setGhost: function (g) { st.ghost[g] = true; }, restoreAll: function () { st.tint = {}; st.ghost = {}; },
  tintN: function () { return Object.keys(st.tint).length; } }; }
var port = makePort(G); var lit = O.applyOverlay(port, plan);
ok('O5c-seam', lit === G.length && port.tintN() === G.length,
  'applyOverlay (the SAME seam as tenancy/presence) paints every located room — the full availability picture');

// ---- O6: REQUEST RELATION — an R_Request maps to its availability effect over the shared resource guid ----
ok('O6a-map', Oc.linkRequest({ type: 'move-out', resource: G[0], party: 'BP-TEN-1', at: '2026-09', ts: 't' }).kind === 'RELEASE'
  && Oc.linkRequest({ type: 'maintenance', resource: G[5], from: '2026-05', to: '2026-06', ts: 't' }).kind === 'UNAVAIL'
  && Oc.linkRequest({ type: 'move-in', resource: G[2], party: 'BP-NEW', from: '2026-07', to: '2026-12', ts: 't' }).kind === 'ASSIGN'
  && Oc.linkRequest({ type: 'complaint', resource: G[0], ts: 't' }) === null,
  'linkRequest: move-out→RELEASE · maintenance→UNAVAIL · move-in→ASSIGN · complaint→null (pure ticket)');
var link = Oc.linkRequest({ type: 'maintenance', resource: G[5], from: '2026-05', to: '2026-06', ts: '2026-04-20T00:00:00Z' });
var prev = log[log.length - 1].op_hash;
var effect = Oc.unavailable(link.ev, FX, prev);                   // apply the request's effect
var log2 = log.concat([effect.op]);
ok('O6b-effect', effect.op && Oc.availability(log2, G[5], '2026-05').state === 'unavailable' && Oc.availability(log, G[5], '2026-05').state === 'vacant',
  'applying a maintenance request → the shared room goes unavailable (Request drives occupancy via the guid)');

// ---- O7: tamper-evident — edit an ASSIGN param → verifyChain breaks ---------------------------------------
var tampered = JSON.parse(JSON.stringify(log));
var ai = tampered.map(function (o) { return o.verb; }).indexOf('ASSIGN');
tampered[ai].params.to = '2030-12';                              // forge a longer lease
var v = C.verifyChain(tampered);
ok('O7-tamper', v.ok === false && v.at === ai && v.why === 'op_hash',
  'editing a signed assignment breaks verifyChain (availability cannot be silently extended)');

// ---- O8: deterministic pivot fingerprint + watermarked availability summary ------------------------------
ok('O8-deterministic', Oc.fingerprint(log, PERIODS, { allResources: G }) === Oc.fingerprint(JSON.parse(JSON.stringify(log)), PERIODS, { allResources: G }),
  'pivot fingerprint is deterministic (replay == live)');
var sum = Oc.summary(log, '2026-03', { resources: G }, 'ms');
ok('O9-watermark', sum._watermark === 'CONTOH — TIDAK RASMI' && sum.rollup.unavailable === 1 && sum.chainOk === true,
  'availability summary is a watermarked output (ms) with the replayed rollup + chainOk');

// ====== WIRE: drive the ACTUAL adapter viewer/hba_lens.js (reuses buildMeshPort over A.guidMap) ===========
global.self = global;
self.HbaWatermark = require('../watermark'); self.HbaModels = M; self.HbaBinding = B; self.HrConnectors = C;
self.HbaOverlay = O; self.HbaLens = require('../lens'); self.HbaTimeline = require('../timeline');
self.HbaAttendance = require('../attendance'); self.HbaOccupancy = Oc;
var HBALens = require('../../viewer/hba_lens');
function mat() { var h = 0; return { emissive: { getHex: function () { return h; }, setHex: function (v) { h = v; } }, opacity: 1, transparent: false }; }
function mesh(id) { return { id: id, isMesh: true, material: mat() }; }
function makeAPP(gmap, occLog) { var meshes = Object.keys(gmap).map(function (id) { return mesh(+id); });
  return { guidMap: gmap, status: { textContent: '' }, _dirty: 0, markDirty: function () { this._dirty++; },
    collectMeshes: function (p) { return meshes.filter(p); }, _meshes: meshes, _hbaOccupancyLog: occLog || [], _hbaPeriod: '2026-03' }; }
function emi(A, id) { return A._meshes.filter(function (m) { return m.id === id; })[0].material.emissive.getHex(); }
var gmap = { '8001': G[0], '8002': G[1], '8003': G[2], '8004': G[3] };
var A = makeAPP(gmap, log);
ok('O10-gate-detect', HBALens.detect(A, 'occupancy') === true && HBALens.detect(makeAPP({ '1': 'X' }, log), 'occupancy') === false,
  'occupancy data-gate: detects a located room op / a building without the rooms shows nothing');
var GREEN = parseInt('2e7d32', 16), GREY = parseInt('9e9e9e', 16), PURPLE = parseInt('8e24aa', 16);
HBALens.toggle(A, 'occupancy');
ok('O11-wire-tint', emi(A, 8001) === GREEN && emi(A, 8004) === PURPLE && emi(A, 8002) !== 0 && emi(A, 8003) === 0,
  'MeshPort paints ledger-tracked rooms: g0 occupied green, g3 unavailable purple, g1 tinted; g2 (untracked) not lit (honest)');
HBALens.toggle(A, 'occupancy');
ok('O12-wire-restore', emi(A, 8001) === 0 && emi(A, 8003) === 0 && HBALens.isActive('occupancy') === false,
  'toggle OFF restores every room mesh (zero residue)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-OCC ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
