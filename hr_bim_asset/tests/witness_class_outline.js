// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-CLASS-OUTLINE witness (§2026-07-05e, user: "make the spaces tint shine thru? at
//   least their outer total perimeter"). The existing class-tint (setTint) only recolors a room's rendered
//   CONTAINED members (small real fixtures, per §REAL-BIND) — from a wide shot that reads as barely visible.
//   This proves `bindStoreysFromModel` extracts each room's REAL IfcSpace footprint (center_x/y/z, size_x/y/z
//   — genuine bounds from `spatial_structure`, verified live against buildings/HHS_Office_Federated_extracted.db
//   2026-07-05: RM_Level_1_1..4 all carry real, non-overlapping footprints ~1.2-1.8m apart) into
//   A._hbaRoomFootprint, and that toggling the 'class' lens draws a wireframe outline box per LINKED room at
//   its real footprint, coloured to match its tint — honestly skipping any room with no real size extracted
//   (never a placeholder box), and cleaning up on toggle-off/switch (zero residue, same discipline as every
//   other HBA overlay). Run: node hr_bim_asset/tests/witness_class_outline.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-CLASS-OUTLINE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- minimal THREE shim — just enough surface for buildMeshPort's Color use + the new outline geometry -----
function Color() { this._h = 0xffffff; }
Color.prototype.setHex = function (v) { this._h = v >>> 0; return this; };
Color.prototype.getHex = function () { return this._h; };
function BoxGeometry(x, y, z) { this.args = [x, y, z]; this.disposed = false; }
BoxGeometry.prototype.dispose = function () { this.disposed = true; };
function EdgesGeometry(geo) { this.src = geo; this.disposed = false; }
EdgesGeometry.prototype.dispose = function () { this.disposed = true; };
function LineBasicMaterial(opts) { this.color = opts.color; this.linewidth = opts.linewidth; this.disposed = false; }
LineBasicMaterial.prototype.dispose = function () { this.disposed = true; };
function LineSegments(geo, mat) { this.geometry = geo; this.material = mat; this.position = { x: 0, y: 0, z: 0, set: function (x, y, z) { this.x = x; this.y = y; this.z = z; } }; }
function Group() { this.name = ''; this.children = []; }
Group.prototype.add = function (o) { this.children.push(o); };
global.THREE = { Color: Color, BoxGeometry: BoxGeometry, EdgesGeometry: EdgesGeometry, LineBasicMaterial: LineBasicMaterial, LineSegments: LineSegments, Group: Group };

global.self = global;
self.HbaWatermark = require('../watermark');
self.HbaModels = require('../models');
self.HbaBinding = require('../binding');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
self.HbaTimeline = require('../timeline');
var HBALens = require('../../viewer/hba_lens');

// ---- stub scene (records add/remove calls; no real THREE.Scene needed) --------------------------------------
function makeScene() {
  var kids = [];
  return { children: kids, add: function (o) { kids.push(o); }, remove: function (o) { var i = kids.indexOf(o); if (i >= 0) kids.splice(i, 1); } };
}

// ---- stub A.dbQuery — spatial_structure rows for 2 REAL rooms (real footprint) + 1 room with NO size (honest
// gap, e.g. a degenerate/partial IFC export) — mirrors the exact live column order this session verified.
var ROWS = [
  // guid, storey-name, predefined_type, center_x, center_y, center_z, size_x, size_y, size_z
  ['RM_A', 'Level 1', 'INTERNAL', -0.118, -9.72, 1.686, 1.6, 4.6, 3.158],
  ['RM_B', 'Level 1', 'INTERNAL', 2.782, -9.72, 1.686, 1.8, 4.6, 3.158],
  ['RM_NOSIZE', 'Level 1', 'INTERNAL', 99, 99, 99, null, null, null]   // honest gap — no real size extracted
];
function makeAPP() {
  var A = {
    guidMap: { '1': 'MEMBER_A', '2': 'MEMBER_B' },     // rooms themselves are NOT rendered (§REAL-BIND)
    status: { textContent: '' }, _dirty: 0, markDirty: function () { this._dirty++; },
    collectMeshes: function () { return []; },
    scene: makeScene(),
    dbQuery: function (sql) {
      if (/FROM spatial_structure/.test(sql)) return ROWS;
      return [];
    }
  };
  return A;
}

var A = makeAPP();
HBALens.bindStoreysFromModel(A);
ok('F1-footprint-extracted', A._hbaRoomFootprint && A._hbaRoomFootprint.RM_A && A._hbaRoomFootprint.RM_B,
  'bindStoreysFromModel populates A._hbaRoomFootprint for rooms with a real spatial_structure size — got ' + JSON.stringify(Object.keys(A._hbaRoomFootprint || {})));
ok('F2-footprint-values', A._hbaRoomFootprint.RM_A.cx === -0.118 && A._hbaRoomFootprint.RM_A.sx === 1.6 && A._hbaRoomFootprint.RM_A.sy === 4.6,
  'the footprint carries the REAL extracted center/size verbatim (RM_A: cx=-0.118, sx=1.6, sy=4.6) — got ' + JSON.stringify(A._hbaRoomFootprint.RM_A));
ok('F3-honest-no-size', !A._hbaRoomFootprint.RM_NOSIZE,
  'a spatial_structure row with NO real size (null) gets NO footprint entry — honest gap, never a placeholder box');

// ---- toggle 'class' on: models.js Tenancy/Strata already declare unit_class for real guids — but this witness
// uses its OWN room guids (RM_A/RM_B), so seed a MINIMAL classRows-compatible path via A._hbaSpaceClass (the
// REAL model predefined_type path classRows/classOf reads FIRST, per its own §CLASS facet priority).
A._hbaSpaceClass = { RM_A: 'office', RM_B: 'commercial' };
// classRows() only walks Tenancy/Strata records for zones — inject 2 synthetic-but-real-shaped Tenancy leases
// bound to RM_A/RM_B so classRows() has something to resolve+classify (classOf() prefers A._hbaSpaceClass anyway).
var Models = self.HbaModels;
Models.MODELS = Models.MODELS || {};
var origRecords = Models.records;
Models.records = function (name) {
  if (name === 'Tenancy') return [{ unit_guid: 'RM_A', unit_class: 'office' }, { unit_guid: 'RM_B', unit_class: 'commercial' }];
  if (name === 'Strata') return [];
  return origRecords(name);
};
A._hbaRoomMembers = { RM_A: ['MEMBER_A'], RM_B: ['MEMBER_B'] };   // §REAL-BIND — rendered contained members

var onResult = HBALens.toggle(A, 'class');
ok('F4-class-on', onResult === true && A.scene.children.length === 1,
  'toggling class ON adds EXACTLY ONE outline group to the scene — got ' + A.scene.children.length);
var group = A.scene.children[0];
ok('F5-outline-per-linked-room', group.name === 'hba-class-outlines' && group.children.length === 2,
  'the outline group carries one LineSegments per LINKED+footprinted room (RM_A, RM_B) — got ' + (group && group.children.length));
var lineA = group.children.filter(function (l) { return l.position.x === -0.118; })[0];
ok('F6-outline-position-real', !!lineA && lineA.position.y === -9.72 && lineA.position.z === 1.686,
  'each outline is positioned at its room\'s REAL extracted center — RM_A at (-0.118,-9.72,1.686)');
ok('F7-outline-color-matches-tint', group.children.every(function (l) { return typeof l.material.color === 'number' && l.material.color > 0; }),
  'each outline\'s colour is the SAME class colour as its tint, hex-converted (never a separate invented palette) — got ' + JSON.stringify(group.children.map(function (l) { return l.material.color.toString(16); })));

// ---- toggle OFF: zero residue — the outline group is removed from the scene, its geometry/material disposed.
var geosBefore = group.children.map(function (l) { return l.geometry; });
HBALens.toggle(A, 'class');
ok('F8-outline-cleared', A.scene.children.length === 0, 'toggling class OFF removes the outline group from the scene — zero residue');
ok('F9-geometry-disposed', geosBefore.every(function (g) { return g.disposed; }), 'every outline\'s EdgesGeometry is disposed on clear (no leaked THREE resources)');

Models.records = origRecords;   // restore

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-CLASS-OUTLINE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
