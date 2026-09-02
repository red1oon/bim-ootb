// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-CAMERA-POV witness (RESUME_HR_BIM_ASSET.md §2026-07-06, the "camera-POV-assume-
//   flight" item, unblocked once 6 real `facing:[x,y,z]` vectors were declared on iot.js CAMERAS — structural-
//   centroid heuristic, not extracted). Covers `viewer/hba_lens.js` `flyToFacing` + 3 bugs found+fixed while
//   sanity-checking the live flight before trusting all 6 doors blind (per this project's "test the real user
//   path, verify by maths, not eyes" standard — a live screenshot caught two of these, not code review):
//   (1) the declared facing vectors are in the RAW extraction's own coordinate system (X=east/Y=north/Z=up),
//       but `_zoneCentroid`'s eye is already Three.js WORLD space (`A.ifc2three` swaps Y/Z) — a raw-space
//       direction must be rotated the SAME way before use, or a facing with a Y-component points at the wrong
//       (often vertical) axis. Live symptom: CAM1's POV screenshot was a blank grey floor/ceiling plane.
//   (2) flyToPOV's tiny "avoid clipping the camera's own mount" standoff put flyToFacing's eye almost exactly
//       ON the door's centroid — INSIDE the door leaf geometry. flyToFacing needs its own real-metres standoff.
//   (3) a genuine DLOD-binding race: right after the camera moves, an instanced/batched guid->meshId/slot
//       lookup can transiently resolve to a RESERVED-BUT-UNWRITTEN slot (identity local matrix) or a stale
//       container whose resolved world position is exactly (0,0,0) — never a real element's position. Both
//       must honestly no-op (the caller's existing "no rendered members" path), scoped to the slot!=null
//       (real instanced/batched) branch ONLY so it can never reject a legitimate slot===null stub/plain-mesh
//       position that happens to be (0,0,0) (regression-guarded here — see witness_find_guid.js's RM-A case,
//       which sits at a stub (0,0,0) by construction and must keep resolving).
//   Drives the REAL viewer/hba_lens.js through a stub THREE (Matrix4/Vector3 with real 4x4 multiply — not a
//   trivial passthrough, so a wrong rotation/translation actually shows up) + stub InstancedMesh, same
//   convention as witness_meshport.js. Run: node hr_bim_asset/tests/witness_camera_pov.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-CAMERA-POV ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- minimal-but-REAL THREE shim: Vector3 + Matrix4 with an actual column-major 4x4 multiply -----------------
function mul4(a, b) {   // a * b, both length-16 column-major arrays (three.js convention)
  var r = new Array(16);
  for (var c = 0; c < 4; c++) for (var row = 0; row < 4; row++) {
    var s = 0;
    for (var k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
    r[c * 4 + row] = s;
  }
  return r;
}
function Matrix4() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
Matrix4.prototype.equals = function (m) { for (var i = 0; i < 16; i++) if (this.elements[i] !== m.elements[i]) return false; return true; };
Matrix4.prototype.premultiply = function (m) { this.elements = mul4(m.elements, this.elements); return this; };
Matrix4.prototype.setTranslation = function (x, y, z) { this.elements[12] = x; this.elements[13] = y; this.elements[14] = z; return this; };
function Vector3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
Vector3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
Vector3.prototype.clone = function () { return new Vector3(this.x, this.y, this.z); };
Vector3.prototype.copy = function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
Vector3.prototype.add = function (v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
Vector3.prototype.lengthSq = function () { return this.x * this.x + this.y * this.y + this.z * this.z; };
Vector3.prototype.normalize = function () { var l = Math.sqrt(this.lengthSq()) || 1; this.x /= l; this.y /= l; this.z /= l; return this; };
Vector3.prototype.multiplyScalar = function (s) { this.x *= s; this.y *= s; this.z *= s; return this; };
Vector3.prototype.lerpVectors = function (a, b, t) { this.x = a.x + (b.x - a.x) * t; this.y = a.y + (b.y - a.y) * t; this.z = a.z + (b.z - a.z) * t; return this; };
Vector3.prototype.setFromMatrixPosition = function (m) { this.x = m.elements[12]; this.y = m.elements[13]; this.z = m.elements[14]; return this; };
global.THREE = { Matrix4: Matrix4, Vector3: Vector3 };
// drive the real lerp animation to COMPLETION synchronously (t+=0.05 per "frame" -> 20 calls reaches t=1) so
// this witness can assert the FINAL camera.position/controls.target the shipped code actually computes, not a
// restatement of the intended formula — a reverted fix will genuinely fail this test, not just look correct.
global.requestAnimationFrame = function (cb) { cb(); };
function fakeCamera(A) {
  A.camera = { position: new Vector3(0, 0, 0) };
  A.controls = { target: new Vector3(0, 0, 0), update: function () {} };
  return A;
}

global.self = global;
self.HbaWatermark = require('../watermark');
self.HbaModels = require('../models');
self.HbaBinding = require('../binding');
self.HbaOverlay = require('../overlay');
self.HbaLens = require('../lens');
self.HbaTimeline = require('../timeline');
var HBALens = require('../../viewer/hba_lens');

// ---- stub instanced mesh: one guid -> one meshId+slot, with a settable local matrix --------------------------
function instMesh(id, slotMats) {   // slotMats: {slot: [x,y,z] or 'identity'}
  return {
    id: id, isMesh: true, isInstancedMesh: true, matrixWorld: new Matrix4(),
    getMatrixAt: function (slot, target) {
      var v = slotMats[slot];
      if (v === 'identity' || v == null) { target.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return; }
      target.setTranslation(v[0], v[1], v[2]);
    }
  };
}
function makeAPP(guidMap, meshes, roomMembers, modelOffset) {
  var A = {
    guidMap: guidMap, _hbaRoomMembers: roomMembers || null, status: { textContent: '' }, _dirty: 0,
    markDirty: function () { this._dirty++; }, collectMeshes: function (pred) { return meshes.filter(pred); },
    modelOffset: modelOffset || { x: 0, y: 0, z: 0 }
  };
  // the REAL scene.js:370 rotational mapping — IFC(X=east,Y=north,Z=up) -> Three(X=east,Y=up,Z=south)
  A.ifc2three = function (ix, iy, iz) { return { x: ix - A.modelOffset.x, y: iz - A.modelOffset.z, z: -(iy - A.modelOffset.y) }; };
  return A;
}

// ================================================================================================================
// (1) coordinate-system fix — a facing vector with a raw-space Y-component must rotate into Three.js space
// ================================================================================================================
var DOOR1 = 'DOOR1';
var guidMap1 = {}; guidMap1['500_0'] = DOOR1;
var mesh1 = instMesh(500, { 0: [10, 20, 30] });   // door sits at Three-world (10,20,30)
var A1 = fakeCamera(makeAPP(guidMap1, [mesh1], { RM: [DOOR1] }));
// raw-space facing (0,-1,0) — per scene.js's OWN rotational rule, a raw dy=-1 becomes Three dz=+1 (dy=0,dz=0
// stay 0) — i.e. the Three-space facing should be (0,0,1), NEVER (0,-1,0) (which would aim the camera at the
// floor — the exact live bug this fix closes). Drives the REAL flyToFacing + its animation to completion
// (global.requestAnimationFrame is wired synchronous above) so the assertion is on the SHIPPED code's actual
// final camera.position/controls.target, not a restatement of the intended formula — a reverted fix fails this.
var r1 = HBALens.flyToFacing(A1, DOOR1, [0, -1, 0], { dist: 3 });
ok('F1-rotates-raw-facing-into-world-space', r1.flew === true,
  'flyToFacing resolves against a real bound door — got ' + JSON.stringify(r1));
// expected: eye=(10,20,30), Three-space facing=(0,0,1) (per the rotation above), so controls.target should
// lerp toward eye+facing=(10,20,31), and camera.position toward eye-facing*standoff=(10,20,27). A reverted fix
// (raw facing used as-is) would instead send controls.target toward (10,19,30) and camera toward (10,23,30) —
// clearly distinguishable from the correct values below.
ok('F2-controls-target-lands-on-rotated-look-point', Math.abs(A1.controls.target.x - 10) < 1e-6 && Math.abs(A1.controls.target.y - 20) < 1e-6 && Math.abs(A1.controls.target.z - 31) < 1e-6,
  'controls.target must settle at eye+ROTATED-facing=(10,20,31), not the unrotated (10,19,30) a reverted fix would give — got ' + JSON.stringify(A1.controls.target));
ok('F3-standoff-is-real-metres-not-dampened', Math.abs(A1.camera.position.x - 10) < 1e-6 && Math.abs(A1.camera.position.y - 20) < 1e-6 && Math.abs(A1.camera.position.z - 27) < 1e-6,
  'camera.position must settle 3 REAL world units back along the rotated facing (10,20,27) — not flyToPOV\'s dampened dist*0.15=0.45 standoff (which would give ~(10,20,29.55), clipping into the door) — got ' + JSON.stringify(A1.camera.position));

// ================================================================================================================
// (3a) DLOD race — a reserved-but-unwritten instanced slot (identity local matrix) must honestly no-op
// ================================================================================================================
var DOOR2 = 'DOOR2';
var guidMap2 = {}; guidMap2['501_2'] = DOOR2;
var mesh2 = instMesh(501, { 2: 'identity' });   // slot 2 reserved but never written — THREE's own default
var A2 = makeAPP(guidMap2, [mesh2], { RM: [DOOR2] });
var r2 = HBALens.flyToFacing(A2, DOOR2, [1, 0, 0], { dist: 3 });
ok('F4-identity-slot-honest-no-op', r2.flew === false && r2.reason === 'no-members',
  'a reserved-but-unwritten instanced slot (identity local matrix) must no-op, never fly to the world origin — got ' + JSON.stringify(r2));

// ================================================================================================================
// (3b) DLOD race variant — a real-looking local matrix whose WORLD position still resolves to exact (0,0,0)
//      (the harder-to-pin-down stale-container-reference variant actually reproduced live) must ALSO no-op
// ================================================================================================================
var DOOR3 = 'DOOR3';
var guidMap3 = {}; guidMap3['502_1'] = DOOR3;
var mesh3 = instMesh(502, { 1: [5, 5, 5] });   // non-identity local matrix — a real-looking translation...
// ...but a degenerate/all-zero matrixWorld (a stale/uninitialised container, reproduced live via a
// camera-move-triggered DLOD reflow — THREE.js hasn't run updateMatrixWorld() on it yet) whose rotation AND
// translation parts are all 0 drives the FINAL premultiplied world position to exactly (0,0,0), regardless of
// the local translation: result = matrixWorld_rotation*local_translation + matrixWorld_translation = 0+0.
mesh3.matrixWorld = new Matrix4(); mesh3.matrixWorld.elements = new Array(16).fill(0); mesh3.matrixWorld.elements[15] = 1;
var guidMap3b = {}; guidMap3b['502_1'] = DOOR3;
var A3 = makeAPP(guidMap3b, [mesh3], { RM: [DOOR3] });
var r3b = HBALens.flyToFacing(A3, DOOR3, [1, 0, 0], { dist: 3 });
ok('F5-stale-world-zero-honest-no-op', r3b.flew === false && r3b.reason === 'no-members',
  'a non-identity LOCAL matrix whose WORLD position still resolves to exact (0,0,0) (a stale-container variant of the same race, reproduced live) must ALSO no-op, not fly to the origin — got ' + JSON.stringify(r3b));

// ================================================================================================================
// (3c) regression guard — a slot===null plain-mesh/stub position that legitimately IS (0,0,0) must NOT be
//      rejected (this is exactly witness_find_guid.js's RM-A stub room, which sits at (0,0,0) by construction
//      — the (0,0,0) guard above is scoped to the slot!=null branch ONLY so it can never collide with this)
// ================================================================================================================
var RM_ORIGIN = 'RM_ORIGIN';
var plainMesh = { id: 900, isMesh: true, userData: { guid: RM_ORIGIN }, position: { x: 0, y: 0, z: 0 } };
var guidMap4 = {}; guidMap4['900'] = RM_ORIGIN;
var A4 = makeAPP(guidMap4, [plainMesh], { RM: [RM_ORIGIN] });
var r4 = HBALens.flyToZone(A4, RM_ORIGIN, {});
ok('F6-plain-mesh-at-origin-still-resolves', r4.flew === true && r4.center.x === 0 && r4.center.y === 0 && r4.center.z === 0,
  'a plain (non-instanced) mesh legitimately positioned at (0,0,0) — e.g. a witness stub room — must still resolve normally, proving the DLOD-race guard is scoped to real instanced/batched slots only — got ' + JSON.stringify(r4));

var pass = checks.every(Boolean);
console.log('\nW-HBA-CAMERA-POV ' + checks.filter(Boolean).length + '/' + checks.length + (pass ? ' PASS' : ' FAIL'));
process.exit(pass ? 0 : 1);
