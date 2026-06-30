// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-VIEW witness (overlay + Find lenses). Each check NAMES the issue it proves.
//   Proves the viewer slice is ZERO-IMPACT (ports only, restore on toggle-off) + ZERO-CLUTTER (sparse,
//   one-mode, ghost-the-rest, density-by-population). Run: node hr_bim_asset/tests/witness_view.js.
'use strict';
var O = require('../overlay'), L = require('../lens'), M = require('../models');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-VIEW ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// stub MeshPort + ScenePort — the ONLY seams the viewer slice may touch (zero-impact proof)
function makePort(guids) {
  var st = { tint: {}, ghost: {}, calls: [] };
  return { _st: st, allGuids: function () { st.calls.push('allGuids'); return guids.slice(); },
    setTint: function (g, c) { st.calls.push('setTint'); st.tint[g] = c; delete st.ghost[g]; },
    setGhost: function (g) { st.calls.push('setGhost'); st.ghost[g] = true; delete st.tint[g]; },
    restoreAll: function () { st.calls.push('restoreAll'); st.tint = {}; st.ghost = {}; },
    tintGuids: function () { return Object.keys(st.tint); }, ghostN: function () { return Object.keys(st.ghost).length; } };
}
function makeScene() {
  var st = { dummies: {}, hi: {}, calls: [] };
  return { _st: st, zoomTo: function (g) { st.calls.push('zoomTo'); st.zoom = g; },
    placeDummy: function (g) { st.calls.push('placeDummy'); st.dummies[g] = true; },
    popup: function (d) { st.calls.push('popup'); st.last = d; },
    highlight: function (g, c) { st.calls.push('highlight'); st.hi[g] = c; },
    restoreAll: function () { st.calls.push('restoreAll'); st.dummies = {}; st.hi = {}; },
    hiGuids: function () { return Object.keys(st.hi); } };
}
var UNIT = M.records('Tenancy')[0].unit_guid, ASSET = M.records('Asset')[0].bim_guid;

// ---- OVERLAY (MeshPort): sparse, ghost-rest, one-mode, restore-on-off -----------------------------
var tplan = O.computeOverlay('tenancy', '2026-06');
ok('V1-sparse', tplan.linked.length === 1 && tplan.linked[0] === UNIT, 'tenancy overlay tints ONLY the 1 linked unit (no building-wide wash)');
var port = makePort([UNIT, 'GUID-X1', 'GUID-X2']);
O.applyOverlay(port, tplan);
ok('V2-ghost-rest', port.tintGuids().length === 1 && port.ghostN() === 2, 'tints the linked unit, ghosts the other 2 (focus by contrast, not marks)');
O.clearOverlay(port);
ok('V3-restore-on-off', port.tintGuids().length === 0 && port.ghostN() === 0, 'toggle OFF restores fully — zero residue (zero-impact)');
ok('V4-ladder', O.computeOverlay('maintenance', '2026-06').tints[ASSET].state === 'ok'
  && O.computeOverlay('maintenance', '2026-07').tints[ASSET].state === 'due'
  && O.computeOverlay('maintenance', '2026-08').tints[ASSET].state === 'overdue', 'maintenance color ladder ok/due/overdue tracks next_due vs period');
var port2 = makePort([UNIT, ASSET, 'GUID-X1']);
O.applyOverlay(port2, O.computeOverlay('tenancy', '2026-06'));
O.applyOverlay(port2, O.computeOverlay('maintenance', '2026-07'));
ok('V5-one-mode', port2.tintGuids().length === 1 && port2.tintGuids()[0] === ASSET, 'switching mode clears the prior — no stacked colors (only maintenance tinted)');

// ---- FIND LENSES: flaticon toggles, rows, density, drill ------------------------------------------
ok('V6-lenses', L.LENSES.tenancy.icon === 'users' && L.LENSES.tenancy.label === 'Tenancy' && L.LENSES.iot.icon === 'cpu', 'two flaticon lenses: Tenancy(users) + IoT(cpu), word on hover');
var trows = L.tenancyRows('2026-06');
ok('V7-tenancy-rows', trows.length >= 1 && trows.every(function (r) { return r.guid && r.detail && r._watermark === 'SAMPLE — NOT OFFICIAL'; }), 'occupancy rows carry guid + detail + watermark (feed existing Find list)');
var irows = L.iotRows();
ok('V8-iot-rows', irows.length >= 1 && irows[0].guid === ASSET, 'IoT lens rows from Asset model (guid = bim_guid)');
var dens = L.densityPlan([{ state: 'occupied', storey: 'S1' }, { state: 'occupied', storey: 'S1' }, { state: 'occupied', storey: 'S2' }, { state: 'vacant', storey: 'S2' }]);
ok('V9-density', dens.length === 2 && dens[0].count === 2 && dens[1].count === 1, 'storey density dots ∝ occupant count (S1=2, S2=1; vacant excluded) — non-invent');
var sc = makeScene();
L.onPick('tenancy', { guid: UNIT, state: 'occupied', detail: 'd' }, sc);
ok('V10-drill', sc._st.zoom === UNIT && sc._st.dummies[UNIT] && sc._st.calls.indexOf('popup') >= 0, 'click occupied → zoom + human dummy + popup (via ScenePort)');
var sc2 = makeScene(); L.onPick('tenancy', { guid: UNIT, state: 'vacant', detail: 'd' }, sc2);
ok('V11-vacant-no-dummy', !sc2._st.dummies[UNIT], 'vacant unit → no human dummy (dummy = occupied only)');
var sc3 = makeScene(); L.onPick('tenancy', { guid: UNIT, state: 'occupied', detail: 'a' }, sc3); L.onPick('iot', { guid: ASSET, state: 'asset', detail: 'b' }, sc3);
ok('V12-one-selection', sc3.hiGuids().length === 1 && sc3.hiGuids()[0] === ASSET, 'each pick clears the prior selection — no stacking');
ok('V13-zero-impact', sc3._st.calls.every(function (c) { return ['zoomTo', 'placeDummy', 'popup', 'highlight', 'restoreAll'].indexOf(c) >= 0; }), 'lens drives the scene ONLY through the ScenePort seam (no geometry mutation)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-VIEW ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
