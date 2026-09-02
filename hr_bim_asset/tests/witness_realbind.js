// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-REALBIND witness (§REAL-BIND — the live-3D binding gap the WHITEBOX log exposed,
//   2026-07-01). The earlier spatial witnesses used SYNTHETIC guidMaps (room guids AS mesh values), which
//   masked a real bug: on a REAL model the rendered meshes carry IFC GlobalIds and an IfcSpace ROOM is NOT
//   rendered, so a lease keyed to a room guid resolved to NOTHING and tinted nothing (driver §DIAG said
//   roomsInGuidMap=0). This test runs against the REAL HHS guid domains (fixtures/hhs_room_members.json,
//   EXTRACTED from the db) and asserts the gap + the fix: a room resolves + tints via its rendered CONTAINED
//   members (rel_contained_in_space). It TELLS us the lens lights on real data — no browser, no visual check.
//   Run:  node hr_bim_asset/tests/witness_realbind.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-REALBIND ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var fs = require('fs'), path = require('path');
var B = require('../binding');
var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'hhs_room_members.json'), 'utf8'));

// The REAL rendered-guid domain (every value is a real IFC GlobalId of a rendered element). Simulate APP.guidMap
// = meshId→renderedGuid (the live viewer shape), built from the extracted rendered set.
var rendered = FX.renderedGuids;
var guidMap = {}; rendered.forEach(function (g, i) { guidMap[String(10000 + i)] = g; });
var roomMembers = FX.roomMembers;
var LEASE = FX.leaseRooms;   // RM_Level_1_1 / _1_3 / _1_4

// ---- R0 — provenance: the fixture is extracted from the real building, rooms are NOT rendered directly.
ok('R0-extracted-gap', FX.roomsRenderedDirectly === 0 && rendered.length > 0 && Object.keys(roomMembers).length > 0,
  'REAL domain: ' + rendered.length + ' rendered element guids, ' + Object.keys(roomMembers).length + ' rooms with members, '
  + FX.roomsRenderedDirectly + ' rooms rendered directly (the gap: a room is not a mesh)');

// ---- R1 — THE BUG (pre-fix behaviour): a lease room guid does NOT resolve against the raw rendered guidMap.
var rawSet = B.knownGuidSet(guidMap);
var noneResolveRaw = LEASE.every(function (rm) { return rawSet.has(rm) === false; });
ok('R1-bug-rooms-unresolved-raw', noneResolveRaw,
  'pre-fix: NONE of the lease rooms resolve against the raw rendered guidMap (this is why the live lens showed "no data") — '
  + JSON.stringify(LEASE.map(function (rm) { return rm + ':' + (rawSet.has(rm) ? 'hit' : 'miss'); })));

// ---- R2 — THE FIX (augmentKnown): each lease room HAS ≥1 rendered member, so it now resolves (is "located").
var known = B.augmentKnown(guidMap, roomMembers);
var allResolve = LEASE.every(function (rm) { return known.has(rm) === true; });
ok('R2-fix-rooms-resolve', allResolve,
  'post-fix: every lease room resolves via augmentKnown (≥1 rendered contained member) → the lens detects + lights it');

// ---- R3 — zoneMeshGuids returns the REAL rendered members to tint (never the un-rendered room guid itself).
var paint = {}; var allPaint = true;
LEASE.forEach(function (rm) {
  var g = B.zoneMeshGuids(rm, guidMap, roomMembers);
  paint[rm] = g.length;
  if (!(g.length >= 1 && g.every(function (x) { return rawSet.has(x); }) && g.indexOf(rm) === -1)) allPaint = false;
});
ok('R3-zone-paints-members', allPaint,
  'zoneMeshGuids(room) → its RENDERED members (each a real mesh guid, never the room guid) — counts ' + JSON.stringify(paint));

// ---- R4 — non-invent: a room with NO rendered member, and a fabricated room, paint NOTHING (no faked tint).
var fakeMembers = { 'RM_GHOST': ['NOT-RENDERED-1', 'NOT-RENDERED-2'] };
var knownFake = B.augmentKnown(guidMap, fakeMembers);
var ghostPaint = B.zoneMeshGuids('RM_GHOST', guidMap, fakeMembers);
var unknownPaint = B.zoneMeshGuids('RM_DOES_NOT_EXIST', guidMap, roomMembers);
ok('R4-noninvent', knownFake.has('RM_GHOST') === false && ghostPaint.length === 0 && unknownPaint.length === 0,
  'a room whose members are not rendered → NOT resolved + paints nothing; an unknown room → nothing (never a faked tint)');

// ---- R5 — the live lens path: with member-aware known set, occupancy/class detect would fire on the real model.
//   (Mirror of detect(): does any lease/occupancy zone resolve in the augmented set?) Proves the gate flips ON.
var occZonesResolve = LEASE.filter(function (rm) { return B.resolveGuid(rm, known); }).length;
ok('R5-gate-fires', occZonesResolve === LEASE.length,
  'the data-gate now fires on the REAL model: ' + occZonesResolve + '/' + LEASE.length + ' lease rooms resolve → FM lens lights (was 0 before the fix)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-REALBIND ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
