// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-PRESPANE witness (§RESUME §T&A SLICE-2 PILL — presence-lens pill wire-in). Each
//   check NAMES the issue it proves. The presence ENGINE + lens-mode + computePresence seam were already
//   witnessed (W-HBA-PRES 14/14); THIS slice adds the missing wiring so the pill can light + tint live:
//   (1) HbaAttendance.demoSeed — a deterministic SIGNED check-in log over the model's REAL rooms so the lens
//   has data on a building that carries rooms (parity with occupancy.demoSeed); (2) the data-gate flips the
//   pill icon ON only when a located check-in resolves to a real mesh; (3) the MeshPort over A.guidMap tints
//   ONLY present zones + toggle-off restores every material (zero residue); (4) static wiring — panels.js
//   registers the hbaPresence action + hba_lens.js gates it. Live 3D render = the remaining browser check.
//   Run:  node hr_bim_asset/tests/witness_presspane.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-PRESPANE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');

// ---- engine + adapter under node require (hba_lens returns before the DOM gate) ------------------------
global.self = global;
self.HbaWatermark  = require('../watermark');
self.HbaModels     = require('../models');
self.HbaBinding    = require('../binding');
self.HbaOverlay    = require('../overlay');
self.HbaLens       = require('../lens');
self.HbaTimeline   = require('../timeline');
self.HbaAttendance = require('../attendance');
self.HbaOccupancy  = require('../occupancy');
var ATT = self.HbaAttendance, C = require('../connectors');
var HBALens = require('../../viewer/hba_lens');
ok('PP0-load', HBALens && typeof HBALens.toggle === 'function' && typeof ATT.demoSeed === 'function',
  'viewer/hba_lens.js + HbaAttendance.demoSeed load under node (witness-drive path)');

// ---- a stub THREE-like material + mesh + APP (meshId→guid), mirroring witness_wire ----------------------
function mat() { var h = 0; return { emissive: { getHex: function () { return h; }, setHex: function (v) { h = v; } }, opacity: 1, transparent: false }; }
function mesh(id) { return { id: id, isMesh: true, material: mat() }; }
function makeAPP(guidMap, period) {
  var meshes = Object.keys(guidMap).map(function (id) { return mesh(+id); });
  return { guidMap: guidMap, _hbaPeriod: period, status: { textContent: '' }, _dirty: 0, markDirty: function () { this._dirty++; },
    collectMeshes: function (pred) { return meshes.filter(pred); }, _meshes: meshes };
}
function emissiveOf(A, meshId) { return A._meshes.filter(function (m) { return m.id === meshId; })[0].material.emissive.getHex(); }

var PERIOD = '2026-07';
// Two REAL rooms in this building (meshId→guid). 7001→zone0 (3 present), 7002→zone1 (1 present),
// 7009→a present-irrelevant element. A third REAL room guid exists in the model but is NOT in guidMap (un-located).
var ZONE0 = 'RM_Level_1_1', ZONE1 = 'RM_Level_1_2', UNLOCATED = 'RM_Level_9_9';
var guidMap = { '7001': ZONE0, '7002': ZONE1, '7009': 'SOME-OTHER-ELEMENT' };
var A = makeAPP(guidMap, PERIOD);

// rooms passed to demoSeed include a real-but-un-located zone to prove the non-invent gate (PP5).
var rooms = [ { guid: ZONE0 }, { guid: ZONE1 }, { guid: UNLOCATED } ];

// ---- PP1 — demoSeed produces a SIGNED, verifiable, deterministic check-in log with the expected headcounts.
var seed = ATT.demoSeed(rooms, PERIOD);
var verify = C.verifyChain(seed.log);
var pbz = ATT.presenceByZone(seed.log, PERIOD);
function headOf(zone) { var r = pbz.filter(function (x) { return x.zone === zone; })[0]; return r ? r.headcount : 0; }
var seed2 = ATT.demoSeed(rooms, PERIOD);
ok('PP1-seed-signed', verify.ok && headOf(ZONE0) === 3 && headOf(ZONE1) === 1 && headOf(UNLOCATED) === 0
  && JSON.stringify(seed.log) === JSON.stringify(seed2.log),
  'demoSeed → signed chain (verifyChain ok), headcounts zone0=3/zone1=1/un-checked=0, deterministic (replay==live) — '
  + JSON.stringify(pbz));

// ---- PP2 — data-gate: FALSE with no attendance log; TRUE once the seed is injected over a real-guid building.
var detectBefore = HBALens.detect(A, 'presence');           // A._hbaAttendanceLog not set yet
A._hbaAttendanceLog = seed.log;                             // host injects the seam (gate does this live)
var detectAfter = HBALens.detect(A, 'presence');
var Aempty = makeAPP({ '1': 'X', '2': 'Y' }, PERIOD); Aempty._hbaAttendanceLog = seed.log;  // log present, zones absent
ok('PP2-gate', detectBefore === false && detectAfter === true && HBALens.detect(Aempty, 'presence') === false,
  'data-gate: no log → no icon; seed over real rooms → icon shows; log whose zones are absent from THIS building → honestly off');

// ---- PP3 — toggle ON tints ONLY present-zone meshes (density band); other meshes untouched.
HBALens.toggle(A, 'presence');
var e0 = emissiveOf(A, 7001), e1 = emissiveOf(A, 7002), e9 = emissiveOf(A, 7009);
ok('PP3-tint-present-only', e0 !== 0 && e1 !== 0 && e0 !== e1 && e9 === 0,
  'MeshPort tints ONLY present zones: 7001(3→med) and 7002(1→low) lit with DIFFERENT band colors; 7009 (no presence) untouched — '
  + JSON.stringify({ z0: e0.toString(16), z1: e1.toString(16), other: e9 }));
ok('PP3b-status', /2 units lit/.test(A.status.textContent) && A._dirty > 0,
  'status reports "2 units lit" + markDirty fired — ' + JSON.stringify(A.status.textContent));

// ---- PP4 — toggle OFF restores every touched material (zero residue), lens inactive.
HBALens.toggle(A, 'presence');
ok('PP4-restore', emissiveOf(A, 7001) === 0 && emissiveOf(A, 7002) === 0 && emissiveOf(A, 7009) === 0
  && HBALens.isActive('presence') === false,
  'toggle OFF restores the model — emissive back to 0 on every mesh, lens inactive (zero residue / zero-impact)');

// ---- PP5 — non-invent: a check-in to a zone ABSENT from guidMap → unlinked, never tinted. Build it directly
//   via the overlay plan so we can read `unlinked` (the toggle path swallows it into the status string).
var rowsWithGhost = ATT.presenceByZone(
  ATT.demoSeed([ { guid: ZONE0 }, { guid: UNLOCATED } ], PERIOD).log, PERIOD);  // zone0 present + an un-located zone
var plan = self.HbaOverlay.computePresence(rowsWithGhost, { knownGuids: guidMap, period: PERIOD });
ok('PP5-noninvent', plan.linked.indexOf(ZONE0) !== -1 && plan.unlinked.indexOf(UNLOCATED) !== -1
  && plan.tints[UNLOCATED] === undefined,
  'a check-in to a guid absent from the building → unlinked (no tint, never fabricated); the real zone still lights — '
  + JSON.stringify({ linked: plan.linked, unlinked: plan.unlinked }));

// ---- PP6 — static wiring: panels.js registers hbaPresence (fn → toggle 'presence'), hba_lens.js gates it.
var panelsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'viewer', 'panels.js'), 'utf8');
var lensSrc   = fs.readFileSync(path.join(__dirname, '..', '..', 'viewer', 'hba_lens.js'), 'utf8');
var panelOk = /id:\s*'hbaPresence'/.test(panelsSrc) && /HBALens\.toggle\(A,\s*'presence'\)/.test(panelsSrc)
  && /I\.footprints\.svg/.test(panelsSrc) && /footprints:\s*\{ svg:/.test(panelsSrc);
var gateOk = /hbaPresence:\s*detect\(A,\s*'presence'\)/.test(lensSrc)
  && /h\.A\.demoSeed\(rooms,\s*period\(A\)\)/.test(lensSrc);
ok('PP6-wiring', panelOk && gateOk,
  'panels.js has the hbaPresence pill (footprints icon, fn→toggle presence) AND hba_lens.js data-gates it + seeds the log');

// ---- PP7 — watermark: the timesheet folded from the seeded log carries the disclaimer (§DISCLAIMER).
var sheet = ATT.timesheet(seed.log, PERIOD, 'en');
ok('PP7-watermark', sheet && sheet._watermark === 'SAMPLE — NOT OFFICIAL' && sheet.chainOk === true,
  'timesheet from the seeded log carries the CONTOH/SAMPLE watermark + chainOk (tamper-evident) — ' + sheet._watermark);

// ---- PP8 — actor- & building-class-agnostic: the SAME presence/occupancy primitive serves a TENANT checking
//   into a residential / commercial / office unit (not just an employee at a site). The op's actor is just a
//   party id (employee OR tenant BP); the lens keys on the room GUID — the IfcSpace class (residential/
//   commercial/office) is a label on the space, never hardcoded in the lens. Proven: a tenant party check-in
//   into a unit lights the SAME presence band, and a tenant ASSIGN over the same unit lights occupancy.
var tenantLog = [];
['BP-TEN-1', 'BP-TEN-2'].forEach(function (bp) {
  var r = ATT.checkIn({ employee: bp, zone: ZONE0, ts: PERIOD + '-15T09:0' + tenantLog.length + ':00Z' },
                      null, tenantLog.length ? tenantLog[tenantLog.length - 1].op_hash : 'GENESIS');
  if (r.op) tenantLog.push(r.op);
});
var tenantHead = ATT.presenceByZone(tenantLog, PERIOD).filter(function (x) { return x.zone === ZONE0; })[0];
// occupancy: a tenant move-in (ASSIGN) over the same unit guid → occupied (room=S_Resource, party=tenant BP).
var occ = self.HbaOccupancy;
var occLog = [ occ.assign({ resource: ZONE0, party: 'BP-TEN-1', from: PERIOD, to: '2027-06', ts: PERIOD + '-01T00:00:00Z' }, null, 'GENESIS').op ];
var avail = occ.availability(occLog, ZONE0, PERIOD);
ok('PP8-actor-class-agnostic', tenantHead && tenantHead.headcount === 2 && avail && avail.state === 'occupied',
  'a TENANT party (BP-TEN-*) check-in lights presence (headcount=2) AND a tenant move-in lights occupancy=occupied over the same unit guid — the lens serves residential/commercial/office tenants, class is a space label not lens logic — '
  + JSON.stringify({ presence: tenantHead, occupancy: avail.state }));

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-PRESPANE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
