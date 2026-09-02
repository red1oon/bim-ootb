// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-WIRE witness (§RESUME NEXT#2 — viewer wire-in). Each check NAMES the issue it
//   proves. Drives the ACTUAL viewer adapter viewer/hba_lens.js through a stub THREE-like scene + a real
//   APP.guidMap (meshId→guid). Proves: (1) the HBA modules load browser-style (self.Hba* globals, no
//   `require` crash); (2) the data-gate detects a real binding / honestly rejects an absent one;
//   (3) the MeshPort over A.guidMap tints ONLY the real-guid unit and toggle-off restores every material
//   (zero residue). Live 3D render is the remaining Playwright/deploy check (NEXT#2b). Run:
//     node hr_bim_asset/tests/witness_wire.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-WIRE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- W0: the TRUE browser path — load each engine file as a plain <script> with NO require/module in
//   scope, sharing one `self`. Proves the `typeof require !== 'undefined' ? require : self.Hba*` guards
//   actually take the BROWSER branch (a require-based load would silently skip it). vm sandbox = the closest
//   node can get to a <script> tag.
var vm = require('vm'), fs = require('fs'), path = require('path');
var browserSelf = {};
var sandbox = { self: browserSelf, console: { log: function () {}, warn: function () {} } };
vm.createContext(sandbox);
['watermark', 'models', 'binding', 'overlay', 'lens', 'timeline'].forEach(function (f) {   // dependency order = load order
  var code = fs.readFileSync(path.join(__dirname, '..', f + '.js'), 'utf8');
  vm.runInContext(code, sandbox, { filename: f + '.js' });
});
ok('W0-browser-path', browserSelf.HbaModels && browserSelf.HbaOverlay && browserSelf.HbaBinding && browserSelf.HbaLens && browserSelf.HbaTimeline
  && browserSelf.HbaModels.records('Tenancy')[0]._watermark === 'SAMPLE — NOT OFFICIAL'
  && browserSelf.HbaModels.records('Tenancy')[0].unit_guid === 'RM_Level_1_1'
  && browserSelf.HbaTimeline.buildSchedule(browserSelf.HbaModels.records('Asset'), { from: '2026-07', months: 3 }).tasks.length === 4,
  'engine files (incl timeline) load as <script> (no require) → self.Hba* globals set, models bound + timeline derives');

// ---- the rest of the witness drives the adapter via node require (its node branch returns before the DOM gate)
global.self = global;
self.HbaWatermark = require('../watermark');
self.HbaModels = require('../models');
self.HbaBinding = require('../binding');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
self.HbaTimeline = require('../timeline');
var loaded = !!(self.HbaModels && self.HbaOverlay && self.HbaBinding);
ok('W1-node-load', loaded && self.HbaModels.records('Tenancy').length >= 1,
  'HBA engine modules also load under node require (witness-drive path)');

// hba_lens.js exports HBALens under node (returns before the DOM gate)
var HBALens = require('../../viewer/hba_lens');
ok('W2-adapter-load', HBALens && typeof HBALens.toggle === 'function' && HBALens._ready(),
  'viewer/hba_lens.js loads and binds the engine (HBALens.toggle/detect/buildMeshPort present)');

// ---- a stub THREE-like material + mesh + APP. emissive mirrors three.js Color (getHex/setHex). -----------
function mat() { var h = 0; return { emissive: { getHex: function () { return h; }, setHex: function (v) { h = v; } }, opacity: 1, transparent: false }; }
function mesh(id) { return { id: id, isMesh: true, material: mat() }; }
function makeAPP(guidMap) {
  var meshes = Object.keys(guidMap).map(function (id) { return mesh(+id); });
  return { guidMap: guidMap, status: { textContent: '' }, _dirty: 0, markDirty: function () { this._dirty++; },
    collectMeshes: function (pred) { return meshes.filter(pred); }, _meshes: meshes };
}
function emissiveOf(A, meshId) { return A._meshes.filter(function (m) { return m.id === meshId; })[0].material.emissive.getHex(); }

var leaseGuid = self.HbaModels.records('Tenancy')[0].unit_guid;   // RM_Level_1_1 (real HHS room)
// guidMap: meshId→guid. 4012→the leased room (REAL), 4013→another real room, 4099→an unrelated element.
var guidMap = {};
guidMap['4012'] = leaseGuid; guidMap['4013'] = 'RM_Level_1_2'; guidMap['4099'] = 'SOME-OTHER-ELEMENT';
var A = makeAPP(guidMap);

// W3 — data-gate: a building containing the leased room DETECTS tenancy; one without it honestly does not.
var Aempty = makeAPP({ '1': 'X', '2': 'Y' });
ok('W3-gate-detect', HBALens.detect(A, 'tenancy') === true && HBALens.detect(Aempty, 'tenancy') === false,
  'data-gate: lens detects a real binding (icon shows) / honestly absent → no icon (no clutter)');

// W4 — toggle ON lights ONLY the bound unit's mesh (emissive = occupied green), the rest untouched.
var GREEN = parseInt('2e7d32', 16);
HBALens.toggle(A, 'tenancy');
ok('W4-tint-real-only', emissiveOf(A, 4012) === GREEN && emissiveOf(A, 4013) === 0 && emissiveOf(A, 4099) === 0,
  'MeshPort over A.guidMap tints ONLY the leased real-guid mesh (4012 green); other meshes untouched (non-invent)');
ok('W4b-status', /1 unit lit/.test(A.status.textContent) && A._dirty > 0,
  'status reports "1 unit lit" + markDirty fired (render requested) — ' + JSON.stringify(A.status.textContent));

// W5 — toggle OFF restores every touched material to its original emissive (zero residue / zero-impact).
HBALens.toggle(A, 'tenancy');
ok('W5-restore', emissiveOf(A, 4012) === 0 && emissiveOf(A, 4013) === 0 && emissiveOf(A, 4099) === 0 && HBALens.isActive('tenancy') === false,
  'toggle OFF restores the model — emissive back to 0 on every mesh, lens inactive (zero residue)');

// W6 — non-invent: an Asset whose guid is NOT in this building does not light (honest), gate stays off.
ok('W6-iot-honest', HBALens.detect(A, 'maintenance') === false,
  'IoT lens: the demo asset guid is absent from THIS building → honestly un-detected (never a faked tint)');

// W7 — one mode at a time: switching modes restores the prior before applying the next (no stacked tint).
var assetGuid = self.HbaModels.records('Asset')[0].bim_guid;            // the real asset bim_guid (model-driven)
var GBLD = makeAPP({ '5012': leaseGuid, '5013': assetGuid });          // building that has BOTH a lease + the asset
HBALens.toggle(GBLD, 'tenancy');                                       // tenancy on → 5012 green
HBALens.toggle(GBLD, 'maintenance');                                   // switch → tenancy restored, asset tinted
ok('W7-one-mode', emissiveOf(GBLD, 5012) === 0 && emissiveOf(GBLD, 5013) !== 0 && HBALens.isActive('maintenance'),
  'switching lens restores the prior mode first (5012 cleared) then tints the new (5013 lit) — no stacking');
HBALens.toggle(GBLD, 'maintenance');                                   // clean up

// W8 — §7D accessor: maintenanceSchedule(A) returns a DERIVED schedule for assets bound to THIS building only.
//   GBLD has the asset (5013) → tasks emitted + bound; A (no asset guid) → filtered to empty.
var schBound = HBALens.maintenanceSchedule(GBLD, { from: '2026-07', months: 6 });
var schNone = HBALens.maintenanceSchedule(A, { from: '2026-07', months: 6 });
ok('W8-pm-schedule', schBound && schBound.tasks.length === 7 && schBound.task_elements.every(function (e) { return e.guid === assetGuid; })
  && schNone && schNone.tasks.length === 0,
  'maintenanceSchedule: building WITH the asset → 7 derived PM milestones bound to its real guid; building without → empty (no un-located tasks)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-WIRE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
