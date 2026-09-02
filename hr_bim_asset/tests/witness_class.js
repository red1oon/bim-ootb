// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-CLASS witness (§RESUME §CLASS facet — color/filter units by building-use class,
//   user 2026-07-01). Each check NAMES the issue it proves. Proves: (1) the resolver is NON-INVENT — a REAL
//   model IfcSpace predefined_type wins, else the DECLARED lease unit_class, else 'unclassified' (never
//   guessed); (2) computeClassOverlay colors each unit by its class palette (deterministic); (3) the FILTER
//   facet (classFilter) tints ONLY the chosen class; (4) the knownGuids gate keeps unresolved guids un-linked;
//   (5) the lens 'class' mode tints real units via the MeshPort + toggle-off restores (zero residue);
//   (6) the data-gate; (7) static wiring; (8) watermark + declared field. Run:
//     node hr_bim_asset/tests/witness_class.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-CLASS ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');
global.self = global;
self.HbaWatermark = require('../watermark');
self.HbaModels    = require('../models');
self.HbaBinding   = require('../binding');
self.HbaOverlay   = require('../overlay');
self.HbaLens      = require('../lens');
self.HbaTimeline  = require('../timeline');
var M = self.HbaModels, O = self.HbaOverlay;
var HBALens = require('../../viewer/hba_lens');
var CLASS = O.CLASS;
ok('C0-load', HBALens && typeof O.computeClassOverlay === 'function' && CLASS.office && CLASS.unclassified,
  'overlay.computeClassOverlay + CLASS palette load; hba_lens binds the engine');

// stub THREE-like material + mesh + APP (meshId→guid), mirroring witness_wire/presspane.
function mat() { var h = 0; return { emissive: { getHex: function () { return h; }, setHex: function (v) { h = v; } }, opacity: 1, transparent: false }; }
function mesh(id) { return { id: id, isMesh: true, material: mat() }; }
function makeAPP(guidMap) {
  var meshes = Object.keys(guidMap).map(function (id) { return mesh(+id); });
  return { guidMap: guidMap, status: { textContent: '' }, _dirty: 0, markDirty: function () { this._dirty++; },
    collectMeshes: function (pred) { return meshes.filter(pred); }, _meshes: meshes };
}
function emissiveOf(A, meshId) { return A._meshes.filter(function (m) { return m.id === meshId; })[0].material.emissive.getHex(); }
function hex(s) { return parseInt(s.replace('#', ''), 16); }

// the three declared leases (office/commercial/residential) over REAL HHS rooms + the strata parcel (unclassified).
var OFFICE = 'RM_Level_1_1', COMM = 'RM_Level_1_3', RES = 'RM_Level_1_4', STRATA = 'RM_Level_1_2';
var guidMap = {}; guidMap['8001'] = OFFICE; guidMap['8003'] = COMM; guidMap['8004'] = RES; guidMap['8002'] = STRATA; guidMap['8009'] = 'SOME-OTHER-ELEMENT';
var A = makeAPP(guidMap);

// ---- C1 — NON-INVENT resolver priority. With NO model class (HHS-like), the DECLARED lease class is used;
//   the strata unit (no unit_class) → 'unclassified'; a REAL model predefined_type OVERRIDES the declared one.
HBALens.toggle(A, 'class');                                   // model class map absent → declared lease classes
var c1 = emissiveOf(A, 8001) === hex(CLASS.office) && emissiveOf(A, 8003) === hex(CLASS.commercial)
      && emissiveOf(A, 8004) === hex(CLASS.residential) && emissiveOf(A, 8002) === hex(CLASS.unclassified)
      && emissiveOf(A, 8009) === 0;                           // no record references 8009 → untouched
HBALens.toggle(A, 'class');                                   // off
var Aover = makeAPP(guidMap); Aover._hbaSpaceClass = { 'RM_Level_1_1': 'residential' };   // model says RM_1_1 is residential
HBALens.toggle(Aover, 'class');
var c1b = emissiveOf(Aover, 8001) === hex(CLASS.residential);   // model predefined_type WINS over declared 'office'
HBALens.toggle(Aover, 'class');
ok('C1-resolver-noninvent', c1 && c1b,
  'resolver: declared lease class used when model has none (office/commercial/residential), strata→unclassified, unreferenced unit untouched; a REAL model predefined_type overrides the declared class (RM_1_1 office→residential)');

// ---- C2 — computeClassOverlay colors each unit by its palette; deterministic (same rows → identical plan).
var rows = [ { zone: OFFICE, class: 'office' }, { zone: COMM, class: 'commercial' }, { zone: RES, class: 'residential' }, { zone: STRATA, class: 'unclassified' } ];
var plan = O.computeClassOverlay(rows, { knownGuids: guidMap });
var plan2 = O.computeClassOverlay(rows, { knownGuids: guidMap });
ok('C2-color', plan.tints[OFFICE].color === CLASS.office && plan.tints[COMM].color === CLASS.commercial
  && plan.tints[RES].color === CLASS.residential && plan.linked.length === 4
  && JSON.stringify(plan) === JSON.stringify(plan2),
  'computeClassOverlay colors each unit by its class palette (4 linked) + deterministic — ' + JSON.stringify(plan.linked));

// ---- C3 — FILTER facet: classFilter='commercial' tints ONLY commercial units; the rest are left alone.
var planF = O.computeClassOverlay(rows, { knownGuids: guidMap, classFilter: 'commercial' });
ok('C3-filter', planF.linked.length === 1 && planF.linked[0] === COMM && planF.tints[OFFICE] === undefined && planF.classFilter === 'commercial',
  'classFilter=commercial → only the commercial unit tints (1 linked); office/residential left untouched (a filter, not a fabrication) — ' + JSON.stringify(planF.linked));

// ---- C4 — non-invent gate: a class row whose guid is ABSENT from the building → unlinked, never tinted.
var planG = O.computeClassOverlay([ { zone: OFFICE, class: 'office' }, { zone: 'RM_Level_9_9', class: 'residential' } ], { knownGuids: guidMap });
ok('C4-gate', planG.linked.indexOf(OFFICE) !== -1 && planG.unlinked.indexOf('RM_Level_9_9') !== -1 && planG.tints['RM_Level_9_9'] === undefined,
  'a unit absent from THIS building → unlinked (no tint); the real unit still colors — ' + JSON.stringify({ linked: planG.linked, unlinked: planG.unlinked }));

// ---- C5 — lens 'class' mode tints real units + toggle OFF restores every material (zero residue).
HBALens.toggle(A, 'class');
var lit = emissiveOf(A, 8001) !== 0 && emissiveOf(A, 8003) !== 0 && emissiveOf(A, 8004) !== 0;
HBALens.toggle(A, 'class');
var restored = emissiveOf(A, 8001) === 0 && emissiveOf(A, 8003) === 0 && emissiveOf(A, 8004) === 0 && emissiveOf(A, 8002) === 0 && HBALens.isActive('class') === false;
ok('C5-toggle-restore', lit && restored,
  'lens class mode tints real units via the MeshPort, toggle OFF restores all (zero residue / zero-impact)');

// ---- C6 — data-gate: detect TRUE for a building with classifiable leases; FALSE for one without them.
var Aempty = makeAPP({ '1': 'X', '2': 'Y' });
ok('C6-gate-detect', HBALens.detect(A, 'class') === true && HBALens.detect(Aempty, 'class') === false,
  'data-gate: a building with a lease/parcel guid → icon shows; one without → honestly off (no clutter)');

// ---- C7 — static wiring (post §FM-FAMILY): class is reached via the FM family drawer. Assert the FAMILY lists
//   'class' (drawer surfaces it + gate counts it) and panels.js carries the single hbaFM pill → openFamilyDrawer.
var panelsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'viewer', 'panels.js'), 'utf8');
var familyHasClass = HBALens.FAMILY.some(function (f) { return f.mode === 'class'; });
var wired = familyHasClass && /id:\s*'hbaFM'/.test(panelsSrc) && /HBALens\.openFamilyDrawer\(A\)/.test(panelsSrc)
  && typeof HBALens.openFamilyDrawer === 'function';
ok('C7-wiring', wired, 'class is a FAMILY entry; panels.js carries the single hbaFM pill → HBALens.openFamilyDrawer');

// ---- C8 — the declared class field is present + the record carries the CONTOH/SAMPLE watermark (§DISCLAIMER).
var leases = M.records('Tenancy');
var classed = leases.filter(function (r) { return r.unit_class; });
ok('C8-field-watermark', classed.length === 3 && leases[0].unit_class === 'office' && leases[0]._watermark === 'SAMPLE — NOT OFFICIAL',
  '3 demonstrator leases carry a declared unit_class + the CONTOH/SAMPLE watermark (sample data, real guid) — '
  + JSON.stringify(classed.map(function (r) { return r.lease_no + ':' + r.unit_class; })));

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-CLASS ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
