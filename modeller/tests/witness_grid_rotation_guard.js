#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRID-ROTATION-GUARD: prompts/GRID_ROTATION_GUARD.md §3's witness. Pure node, same
 * style as witness_grid_kinematics_pure.js — hand-computed fixtures, exact assertions, every expected number
 * worked out in the comments BEFORE the assertion. No browser, no THREE, no screenshots.
 *
 * THE GAP UNDER TEST (spec §0): _findBestGrid treats an element's world-AABB lo/hi as its real physical
 * edges. For yaw = a 90°-multiple, AABB edge == real edge (exact). For ANY other yaw the AABB only touches
 * the true rotated body at corners, so EDGE/SPAN/ATTACH classification against lo/hi is fabricated. The fix
 * is a GUARD only: an element with a defined, oblique yawRad (> YAW_TOL=0.01 rad off every 90°-multiple) is
 * skipped on the plan axes x/z (NOT y — height, yaw-invariant) and falls through to the center-only (hence
 * rotation-safe) bay-proportional interior path.
 *
 * SECTIONS:
 *  (a) R1-R2  — 90°/180°/270°/-90° yaws classify + drag BYTE-IDENTICAL to no-yaw (the regression bar).
 *  (b) R3-R5  — a 45° wall at positions that WOULD produce EDGE_LEFT / SPAN / ATTACH under the old
 *               unguarded math (proven by running the same fixture WITHOUT yawRad) instead produces NO
 *               attach-map entry and lands in the interior list.
 *      R6     — the guard is x/z only: an oblique element still ATTACHes on the y (height) axis.
 *  (c) R7     — yawRad undefined everywhere ⇒ zero skips, classifications match the engine's documented
 *               rules exactly (existing callers unaffected).
 *  (d) R8     — adapter boundary (bonsai_gridmove.js): GEOM_INSERT placement.rot (DEGREES) → elementData
 *               yawRad (RADIANS); absent placement / §ARC-3AXIS rotZRad-shape rows → yawRad undefined.
 *      R9     — _isObliqueYaw tolerance arithmetic at the YAW_TOL=0.01 rad boundary.
 */
'use strict';
var path = require('path');
var GK = require(path.join(__dirname, '..', 'grid_kinematics.js'));
var GridKinematicEngine = GK.GridKinematicEngine;

var _pass = 0, _fail = 0;
function assert(cond, msg) {
  if (cond) { _pass++; console.log('  ✓ ' + msg); }
  else { _fail++; console.error('  ✗ FAIL: ' + msg); }
}
function section(name) { console.log('\n── ' + name + ' ──'); }

console.log('═══ W-GRID-ROTATION-GUARD — oblique-yaw guard (GRID_ROTATION_GUARD.md §3) ═══');

// ═══ (a) 90°-multiple yaws: BYTE-IDENTICAL to unrotated ═════════════════════════════════════════════════
// Fixture (grid A: x=10, grid Zg: z=5) — each element's expected relation hand-derived from the engine's
// own documented tolerances (ATTACH_TOL=0.5, EDGE_TOL=0.1):
//   WA x=10.1  bboxX=0.08 → |10.1-10|=0.1<0.5 ⇒ ATTACH on A;  z=5, bboxZ=0.08 → |5-5|=0<0.5 ⇒ ATTACH on Zg
//   WL x=11.25 bboxX=2.5  → lo=11.25-1.25=10.0, |10.0-10|=0<0.1 ⇒ EDGE_LEFT on A
//   WR x=8.5   bboxX=3.0  → hi=8.5+1.5=10.0,   |10.0-10|=0<0.1 ⇒ EDGE_RIGHT on A
//   WS x=11.0  bboxX=3.0  → lo=9.5 hi=12.5; center dist 1.0>0.5 (no ATTACH), edge dists 0.5/2.5>0.1
//               (no EDGE), 10 ∈ (9.51,12.49) ⇒ SPAN on A
//   WI x=15    bboxX=0.3  → nothing within any tolerance ⇒ interior
// The yawed twin feeds the SAME world AABBs (the contract: bbox fields ARE the world AABB) with yaws that
// are exact 90°-multiples — the guard must not fire, so every map entry, interior record, and drag command
// must be byte-identical.
function fixtureA(yaws) {
  yaws = yaws || {};
  return [
    { guid: 'WA', x: 10.1,  y: 1.5, z: 5, bboxX: 0.08, bboxY: 3, bboxZ: 0.08, ifcClass: 'IfcColumn', yawRad: yaws.WA },
    { guid: 'WL', x: 11.25, y: 1.5, z: 3, bboxX: 2.5,  bboxY: 3, bboxZ: 0.2,  ifcClass: 'IfcWall',   yawRad: yaws.WL },
    { guid: 'WR', x: 8.5,   y: 1.5, z: 3, bboxX: 3.0,  bboxY: 3, bboxZ: 0.2,  ifcClass: 'IfcWall',   yawRad: yaws.WR },
    { guid: 'WS', x: 11.0,  y: 1.5, z: 3, bboxX: 3.0,  bboxY: 3, bboxZ: 0.2,  ifcClass: 'IfcWall',   yawRad: yaws.WS },
    { guid: 'WI', x: 15.0,  y: 1.5, z: 3, bboxX: 0.3,  bboxY: 3, bboxZ: 0.3,  ifcClass: 'IfcWall',   yawRad: yaws.WI }
  ];
}
var GRIDS_A = [{ id: 'A', axis: 'x', pos: 10 }, { id: 'Zg', axis: 'z', pos: 5 }];

section('R1 — attach map + interior byte-identical for 90°-multiple yaws');
(function () {
  var e0 = new GridKinematicEngine(fixtureA(), GRIDS_A);                      // no yawRad anywhere (old world)
  var e90 = new GridKinematicEngine(fixtureA({                                // exact 90°-multiples
    WA: Math.PI / 2, WL: Math.PI, WR: 3 * Math.PI / 2, WS: -Math.PI / 2, WI: Math.PI / 2 }), GRIDS_A);
  e0.attachGridToElements(); e90.attachGridToElements();
  assert(JSON.stringify(e0.getAttachMap()) === JSON.stringify(e90.getAttachMap()),
    'attach map byte-identical (90°/180°/270°/-90° vs no yaw)');
  assert(JSON.stringify(e0.getInteriorElements()) === JSON.stringify(e90.getInteriorElements()),
    'interior list byte-identical');
  assert(e90.getYawSkipCount() === 0, 'zero yaw-skips at exact 90°-multiples (got ' + e90.getYawSkipCount() + ')');
  // sanity: the fixture really exercises all four relations (hand-derivation above holds)
  var rel = {}; (e0.getAttachMap()['A'] || []).forEach(function (it) { rel[it.guid] = it.relation; });
  assert(rel.WA === 'ATTACH' && rel.WL === 'EDGE_LEFT' && rel.WR === 'EDGE_RIGHT' && rel.WS === 'SPAN',
    'fixture covers ATTACH/EDGE_LEFT/EDGE_RIGHT/SPAN as hand-derived (got ' + JSON.stringify(rel) + ')');

  section('R2 — dragGrid commands byte-identical for 90°-multiple yaws');
  // delta=0.5 on A and on Zg — full command arrays (TRANSLATE/SCALE math included) must match byte-for-byte.
  assert(JSON.stringify(e0.dragGrid('A', 0.5)) === JSON.stringify(e90.dragGrid('A', 0.5)),
    'dragGrid(A, +0.5) commands byte-identical');
  assert(JSON.stringify(e0.dragGrid('Zg', -0.25)) === JSON.stringify(e90.dragGrid('Zg', -0.25)),
    'dragGrid(Zg, -0.25) commands byte-identical');
})();

// ═══ (b) 45° yaw: old math fabricates EDGE/SPAN/ATTACH, guard yields none ═══════════════════════════════
// Wall 4.0m long × 0.3m thick (local half-dims hx=2.0, hz=0.15), yawed 45°. World-AABB half-extent on x
// (and z): hx·cos45 + hz·sin45 = (2.0+0.15)·√2/2 = 2.15·0.70710678 = 1.52028 → bboxX = bboxZ = 3.04056.
// Height 3m (bboxY=3). Grid A at x=10; no z/y grids (so the fall-through-to-interior claim is unambiguous).
var HALF45 = 2.15 * Math.SQRT1_2;        // 1.5202795…
var BBOX45 = 2 * HALF45;                 // 3.0405591…
var GRID_X10 = [{ id: 'A', axis: 'x', pos: 10 }];
function wall45(cx, yawRad) {
  return [{ guid: 'B1', x: cx, y: 1.5, z: 3, bboxX: BBOX45, bboxY: 3, bboxZ: BBOX45, ifcClass: 'IfcWall', yawRad: yawRad }];
}
// Each case: (i) UNGUARDED (yawRad undefined) run proves the position WOULD misclassify — the "old math"
// verdict; (ii) GUARDED (yawRad=π/4) run must produce NO attach-map entry + an interior record + 2 skips
// (axes x and z; y is never skipped).
function caseB(name, cx, expectedOldRelation) {
  section(name);
  var eOld = new GridKinematicEngine(wall45(cx, undefined), GRID_X10);
  eOld.attachGridToElements();
  var itemsOld = eOld.getAttachMap()['A'] || [];
  assert(itemsOld.length === 1 && itemsOld[0].relation === expectedOldRelation,
    'UNGUARDED (yawRad undefined): old math classifies ' + expectedOldRelation +
    ' (got ' + (itemsOld.length ? itemsOld[0].relation : 'none') + ') — the fabrication this guard kills');
  var eNew = new GridKinematicEngine(wall45(cx, Math.PI / 4), GRID_X10);
  eNew.attachGridToElements();
  var itemsNew = eNew.getAttachMap()['A'] || [];
  assert(itemsNew.length === 0, 'GUARDED (yawRad=45°): NO attach-map entry on axis x');
  assert(eNew.getInteriorElements().length === 1 && eNew.getInteriorElements()[0].guid === 'B1',
    'GUARDED: falls through to the interior (bay-proportional, center-only) list');
  assert(eNew.getYawSkipCount() === 2, 'exactly 2 skips (axes x+z, never y) — got ' + eNew.getYawSkipCount());
}
// R3 false EDGE_LEFT: cx=11.5 → AABB lo = 11.5-1.52028 = 9.97972; |9.97972-10| = 0.02028 < EDGE_TOL(0.1).
//   But the true 45° wall has NO edge at x=10 — its min-x is a single CORNER at 9.97972; the wall's real
//   edge lines run at 45° to the grid. (Center dist 1.5 > 0.5, so EDGE_LEFT is the old verdict.)
caseB('R3 — false EDGE_LEFT at cx=11.5 (AABB lo=9.980 within 0.1 of grid 10)', 11.5, 'EDGE_LEFT');
// R4 false SPAN: cx=11.4 → lo = 9.87972, hi = 12.92028. Center dist 1.4 > 0.5 (no ATTACH); edge dists
//   0.12028 and 2.92028, both > 0.1 (no EDGE); 10 ∈ (lo+0.01, hi-0.01) = (9.890, 12.910) ⇒ SPAN.
//   SPAN's axis-aligned stretch math is meaningless across a 45° body.
caseB('R4 — false SPAN at cx=11.4 (10 strictly inside AABB 9.880..12.920)', 11.4, 'SPAN');
// R5 false ATTACH: cx=10.3 → center dist 0.3 < 0.5 ⇒ ATTACH. An "attached centerline" assumes the wall
//   runs ALONG the grid; this one crosses it at 45°.
caseB('R5 — false ATTACH at cx=10.3 (center within 0.5 of grid 10)', 10.3, 'ATTACH');

section('R6 — guard is x/z only: oblique element still ATTACHes on the y (height) axis');
(function () {
  // y-grid at 0; element center y=0.2 → |0.2-0| = 0.2 < ATTACH_TOL(0.5) ⇒ ATTACH on y. Yaw about the
  // vertical never changes a body's height extent, so this classification must SURVIVE the guard.
  var eng = new GridKinematicEngine(
    [{ guid: 'BY', x: 10.3, y: 0.2, z: 3, bboxX: BBOX45, bboxY: 3, bboxZ: BBOX45, ifcClass: 'IfcWall', yawRad: Math.PI / 4 }],
    [{ id: 'A', axis: 'x', pos: 10 }, { id: 'Gy', axis: 'y', pos: 0 }]);
  eng.attachGridToElements();
  var yItems = eng.getAttachMap()['Gy'] || [];
  assert(yItems.length === 1 && yItems[0].axis === 'y' && yItems[0].relation === 'ATTACH',
    'y-axis ATTACH survives (got ' + JSON.stringify(yItems.map(function (i) { return i.relation; })) + ')');
  assert((eng.getAttachMap()['A'] || []).length === 0, 'x-axis still guarded on the same element');
  assert(eng.getYawSkipCount() === 2, 'skips remain exactly x+z (got ' + eng.getYawSkipCount() + ')');
})();

// ═══ (c) yawRad undefined everywhere ⇒ completely unaffected ═══════════════════════════════════════════
section('R7 — no yawRad anywhere: zero skips, documented classifications hold');
(function () {
  var eng = new GridKinematicEngine(fixtureA(), GRIDS_A);
  eng.attachGridToElements();
  assert(eng.getYawSkipCount() === 0, 'yawSkipCount stays 0 for yaw-less callers');
  var rel = {}; (eng.getAttachMap()['A'] || []).forEach(function (it) { rel[it.guid] = it.relation; });
  assert(rel.WA === 'ATTACH' && rel.WL === 'EDGE_LEFT' && rel.WR === 'EDGE_RIGHT' && rel.WS === 'SPAN' &&
    eng.getInteriorElements().some(function (ie) { return ie.guid === 'WI'; }),
    'all hand-derived relations + interior unchanged (got ' + JSON.stringify(rel) + ')');
})();

// ═══ (d) adapter boundary: placement.rot DEGREES → yawRad RADIANS ══════════════════════════════════════
section('R8 — bonsai_gridmove.js elementData() carries yawRad converted from placement.rot degrees');
(function () {
  // Tier-2-style fakes (witness_gridmove_adapter_fakes.js pattern): 4 GEOM_INSERT rows —
  //   fid=1 placement.rot = -90  (upright shape, DEGREES; buildSeedOps' real sample value) → yawRad = -π/2
  //   fid=2 placement.rot = 45                                                             → yawRad =  π/4
  //   fid=3 NO placement (synthetic GEOM_EXTRUDE_POLY-like)                                → yawRad undefined
  //   fid=4 placement.rotZRad = 0.7 (§ARC-3AXIS tilted shape: rotZRad RADIANS, NO rot)     → yawRad undefined
  //         (documented symmetry: unrecorded → unguarded/eligible, exactly like class-UNKNOWN)
  global.window = global.window || {};
  var ROWS = [
    [1, JSON.stringify({ ifc_class: 'IfcWall', placement: { x: 0, y: 0, z: 0, rot: -90 } })],
    [2, JSON.stringify({ ifc_class: 'IfcWall', placement: { x: 0, y: 0, z: 0, rot: 45 } })],
    [3, JSON.stringify({ ifc_class: 'IfcWall' })],
    [4, JSON.stringify({ ifc_class: 'IfcWall', placement: { x: 0, y: 0, z: 0, rotX: 0.1, rotY: 0.2, rotZRad: 0.7 } })]
  ];
  function fakeMesh(fid) {
    return { isMesh: true, userData: { featureId: fid },
      geometry: { computeBoundingBox: function () { }, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } } };
  }
  window.Bonsai = {
    group: function () { return { children: [1, 2, 3, 4].map(fakeMesh) }; },
    oplog: { db: { exec: function (sql) { return /kernel_ops/.test(sql) ? [{ columns: ['id', 'parameters'], values: ROWS }] : []; } } },
    grid: { xs: [0, 4], ys: [0, 3] }
  };
  require(path.join(__dirname, '..', 'bonsai_gridmove.js'));
  var GM = window.Bonsai.gridmove;
  GM._dragAxis = null; GM._dragOrthoAt = null;
  var byFid = {}; GM.elementData().forEach(function (e) { byFid[e.guid] = e; });
  assert(byFid[1] && byFid[1].yawRad === -90 * Math.PI / 180,
    'fid=1: rot=-90° → yawRad=-π/2 exactly (got ' + (byFid[1] && byFid[1].yawRad) + ')');
  assert(byFid[2] && byFid[2].yawRad === 45 * Math.PI / 180,
    'fid=2: rot=45° → yawRad=π/4 exactly (got ' + (byFid[2] && byFid[2].yawRad) + ')');
  assert(byFid[3] && byFid[3].yawRad === undefined, 'fid=3: no placement → yawRad undefined');
  assert(byFid[4] && byFid[4].yawRad === undefined, 'fid=4: rotZRad-only (§ARC-3AXIS shape) → yawRad undefined');
  var classMap = GM._buildClassByFid();
  assert(Object.keys(classMap).length === 4 && classMap[1] === 'IfcWall',
    '_buildClassByFid() unchanged by the shared-pass refactor (4 recorded classes intact)');
})();

section('R9 — _isObliqueYaw tolerance arithmetic (YAW_TOL=0.01 rad)');
(function () {
  var f = GK._isObliqueYaw;
  assert(GK.YAW_TOL === 0.01, 'exported YAW_TOL is the spec\'s 0.01 rad');
  assert(f(undefined) === false && f(null) === false, 'undefined/null → never oblique');
  assert(f(0) === false && f(Math.PI / 2) === false && f(-Math.PI) === false && f(2 * Math.PI) === false,
    'exact 90°-multiples (incl. negative, incl. 360°) → not oblique');
  assert(f(Math.PI / 2 + 0.005) === false && f(-0.005) === false,
    '0.005 rad off a multiple (< tol) → not oblique');
  assert(f(Math.PI / 2 + 0.02) === true && f(Math.PI / 4) === true && f(-3 * Math.PI / 4) === true,
    '0.02 rad off / 45° / -135° → oblique');
})();

console.log('\nW-GRID-ROTATION-GUARD: ' + _pass + ' PASS / ' + _fail + ' FAIL');
process.exit(_fail ? 1 : 0);
