// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-PRES witness (§T&A SLICE-2 — viewer presence lens). Each check NAMES the issue it
//   proves. Load-bearing claims: the signed check-in log folds to a headcount-by-zone overlay that RIDES THE
//   EXISTING density-dots seam (overlay.applyOverlay over a MeshPort — zero new viewer-core); the headcount is
//   a REAL distinct-employee count (never fabricated); a zone not in the loaded model is honestly UN-LINKED
//   (never tinted); the density ladder (1/2-4/5+) tracks the real count; the adapter viewer/hba_lens.js drives
//   it through the SAME MeshPort as tenancy/IoT, one-mode, restore-on-off (zero residue).
//   Run: node hr_bim_asset/tests/witness_presence.js
'use strict';
var fs = require('fs'), path = require('path');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-PRES ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// engine under test (node require path)
var O = require('../overlay'), At = require('../attendance'), C = require('../connectors'), B = require('../binding');
var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));

// real building zones (extracted rooms) + one zone NOT in this building (render-side gate).
var Z_HIGH = FX.rooms[0].guid, Z_MED = FX.rooms[1].guid, Z_LOW = FX.rooms[2].guid, Z_FAKE = 'GUID-NOT-IN-BUILDING';

// build a SIGNED, chained check-in log: N distinct employees per zone (open sessions count for presence).
// No knownGuids gate here → the FAKE zone enters the log; computePresence is the RENDER gate that un-links it.
function punchIn(log, emp, zone, ts) {
  var prev = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  var r = At.checkIn({ employee: emp, zone: zone, ts: ts }, null, prev);
  if (r.op) log.push(r.op);
  return r;
}
var log = [], min = 0;
function fill(zone, n, tag) { for (var i = 0; i < n; i++) punchIn(log, tag + i, zone, '2026-06-30T08:' + ('0' + (min++)).slice(-2) + ':00Z'); }
fill(Z_HIGH, 6, 'H');   // 6 → high
fill(Z_MED, 3, 'M');    // 3 → med
fill(Z_LOW, 1, 'L');    // 1 → low
fill(Z_FAKE, 1, 'F');   // 1 but un-located → un-linked

// ---- P0: the presence overlay rides a SIGNED, tamper-evident log -----------------------------------------
ok('P0-signed-log', C.verifyChain(log).ok === true && log.every(function (o) { return o.sig; }),
  'every check-in is signed + the chain verifies (presence derives from a tamper-evident log)');

// ---- P1: headcount per REAL zone == distinct employees (non-invent) ---------------------------------------
var rows = At.presenceByZone(log, '2026-06');
var rowOf = {}; rows.forEach(function (r) { rowOf[r.zone] = r.headcount; });
ok('P1-real-headcount', rowOf[Z_HIGH] === 6 && rowOf[Z_MED] === 3 && rowOf[Z_LOW] === 1 && rowOf[Z_FAKE] === 1,
  'presenceByZone counts DISTINCT employees from the signed log (H=6, M=3, L=1) — never fabricated');

// ---- P2/P3: computePresence — density plan + non-invent render gate ---------------------------------------
var plan = O.computePresence(rows, { knownGuids: FX, period: '2026-06' });
ok('P2-ladder', plan.tints[Z_HIGH].state === 'presence_high' && plan.tints[Z_HIGH].color === O.PRESENCE.high
  && plan.tints[Z_MED].state === 'presence_med' && plan.tints[Z_MED].color === O.PRESENCE.med
  && plan.tints[Z_LOW].state === 'presence_low' && plan.tints[Z_LOW].color === O.PRESENCE.low
  && plan.tints[Z_HIGH].headcount === 6,
  'headcount density ladder: 1→low, 2-4→med, 5+→high (blue intensity), carrying the REAL count');
ok('P3-gate-unlinked', plan.linked.length === 3 && plan.unlinked.indexOf(Z_FAKE) >= 0 && !plan.tints[Z_FAKE],
  'a zone not in the loaded model is honestly UN-LINKED (in unlinked[], never tinted) — render-side non-invent gate');
ok('P3b-bucket-fn', O.presenceBucket(1) === 'low' && O.presenceBucket(4) === 'med' && O.presenceBucket(5) === 'high',
  'presenceBucket boundaries: 1=low, 4=med, 5=high');

// ---- P4: rides the EXISTING density seam — applyOverlay over a stub MeshPort (zero new viewer-core) --------
function makePort(guids) {
  var st = { tint: {}, ghost: {} };
  return { _st: st, allGuids: function () { return guids.slice(); },
    setTint: function (g, c) { st.tint[g] = c; delete st.ghost[g]; },
    setGhost: function (g) { st.ghost[g] = true; delete st.tint[g]; },
    restoreAll: function () { st.tint = {}; st.ghost = {}; },
    tintGuids: function () { return Object.keys(st.tint); }, ghostN: function () { return Object.keys(st.ghost).length; } };
}
var port = makePort([Z_HIGH, Z_MED, Z_LOW, 'OTHER-1', 'OTHER-2']);
var litN = O.applyOverlay(port, plan);
ok('P4-seam-apply', litN === 3 && port.tintGuids().sort().join(',') === [Z_HIGH, Z_MED, Z_LOW].sort().join(',') && port.ghostN() === 2,
  'applyOverlay (the SAME MeshPort seam as tenancy/IoT) tints the 3 located zones, ghosts the other 2');
O.clearOverlay(port);
ok('P5-restore', port.tintGuids().length === 0 && port.ghostN() === 0,
  'toggle OFF restores fully — zero residue (zero-impact, same seam)');

// ---- P6: one-mode-at-a-time — switching from tenancy clears the prior before painting presence ------------
var M = require('../models');
var TEN = M.records('Tenancy')[0].unit_guid;
var port2 = makePort([TEN, Z_HIGH]);
O.applyOverlay(port2, O.computeOverlay('tenancy', '2026-06'));   // tenancy tints the lease unit
O.applyOverlay(port2, plan);                                     // switch to presence
ok('P6-one-mode', port2.tintGuids().length === 1 && port2.tintGuids()[0] === Z_HIGH,
  'switching to presence restores the prior mode first (lease unit cleared) — no stacked color');

// ---- P7: DETERMINISTIC — same log → identical plan, headcounts == presenceByZone -------------------------
var plan2 = O.computePresence(At.presenceByZone(log, '2026-06'), { knownGuids: FX, period: '2026-06' });
ok('P7-deterministic', JSON.stringify(plan) === JSON.stringify(plan2),
  'computePresence is pure: identical log → byte-identical plan (replay == live)');

// ====== WIRE: drive the ACTUAL adapter viewer/hba_lens.js (reuses buildMeshPort over A.guidMap) ===========
global.self = global;
self.HbaWatermark = require('../watermark'); self.HbaModels = M; self.HbaBinding = B;
self.HbaConnectors = C; self.HrConnectors = C; self.HbaOverlay = O; self.HbaLens = require('../lens');
self.HbaTimeline = require('../timeline'); self.HbaAttendance = At;
var HBALens = require('../../viewer/hba_lens');

function mat() { var h = 0; return { emissive: { getHex: function () { return h; }, setHex: function (v) { h = v; } }, opacity: 1, transparent: false }; }
function mesh(id) { return { id: id, isMesh: true, material: mat() }; }
function makeAPP(guidMap, attLog) {
  var meshes = Object.keys(guidMap).map(function (id) { return mesh(+id); });
  return { guidMap: guidMap, status: { textContent: '' }, _dirty: 0, markDirty: function () { this._dirty++; },
    collectMeshes: function (pred) { return meshes.filter(pred); }, _meshes: meshes,
    _hbaAttendanceLog: attLog || [], _hbaPeriod: '2026-06' };
}
function emissiveOf(A, meshId) { return A._meshes.filter(function (m) { return m.id === meshId; })[0].material.emissive.getHex(); }

// guidMap: meshId→guid; 7001/7002/7003 = the real zones, 7099 = an unrelated element.
var gmap = { '7001': Z_HIGH, '7002': Z_MED, '7003': Z_LOW, '7099': 'SOME-OTHER-ELEMENT' };
var A = makeAPP(gmap, log);

ok('P8-adapter-load', HBALens && typeof HBALens.toggle === 'function' && HBALens._ready(),
  'viewer/hba_lens.js exposes the presence path (toggle/detect) bound to the engine');
var Aempty = makeAPP({ '1': 'X', '2': 'Y' }, log);          // building without the zones
ok('P9-gate-detect', HBALens.detect(A, 'presence') === true && HBALens.detect(Aempty, 'presence') === false,
  'data-gate: presence detects a located check-in / a building without the zones honestly shows nothing (no clutter)');

var HIGH = parseInt(O.PRESENCE.high.replace('#', ''), 16), MED = parseInt(O.PRESENCE.med.replace('#', ''), 16), LOW = parseInt(O.PRESENCE.low.replace('#', ''), 16);
HBALens.toggle(A, 'presence');
ok('P10-wire-tint', emissiveOf(A, 7001) === HIGH && emissiveOf(A, 7002) === MED && emissiveOf(A, 7003) === LOW && emissiveOf(A, 7099) === 0,
  'MeshPort over A.guidMap paints headcount density on the real zone meshes (high/med/low); unrelated mesh untouched');
ok('P10b-status', A._dirty > 0 && /3 unit/.test(A.status.textContent),
  'status reports "3 units lit" + markDirty fired (render requested) — ' + JSON.stringify(A.status.textContent));

HBALens.toggle(A, 'presence');
ok('P11-wire-restore', emissiveOf(A, 7001) === 0 && emissiveOf(A, 7002) === 0 && emissiveOf(A, 7003) === 0 && HBALens.isActive('presence') === false,
  'toggle OFF restores every zone mesh (emissive back to 0), lens inactive — zero residue');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-PRES ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
