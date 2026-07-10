#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRID-TILT-GUARD: GRID_ROTATION_GUARD.md §5 / GRID_ROTATED_SCALE_HARDENING.md §5's
 * witness. Proves the §ROTATION-GUARD-3AXIS extension: grid_kinematics.js's plan-axis classification and
 * bonsai_kernel_worker.js's SCALE fold now also skip/refuse for a non-negligible rotX/rotY tilt (read from
 * the §ARC-3AXIS {rotX,rotY,rotZRad} placement shape bonsai_gridmove.js's yawRad lookup never saw). Read the
 * log after every run — exit code alone is not evidence.
 *
 * THE GAP THIS CLOSES (verified live, GRID_ROTATION_GUARD.md §5): SampleCastle_ARC.db fids 933/1291/2514/3055
 * all have rotation_z=0 (yawRad stays undefined — the §ARC-3AXIS shape has no `.rot`) but rotation_y=±π/2
 * exactly — an EXACT 90°-multiple tilt on a DIFFERENT axis than yaw. Unlike yaw, a 90°-multiple tilt about
 * X/Y is NOT safe: it can swap which local dimension faces "up", so _isObliqueYaw's "safe at 90°" exemption
 * must NOT carry over — this guard skips on ANY non-negligible tiltXRad/tiltYRad, measured from ZERO.
 *
 * SECTIONS:
 *  (a) G1-G6 — grid_kinematics.js: exact-90° tilt DOES skip (contrast with yaw's 90°-exemption); undefined/
 *      sub-threshold tilt unaffected; y-axis still classifies (guard is x/z only, same scope as yaw); yaw
 *      and tilt skip-counts attributed independently; _hasTilt boundary arithmetic.
 *  (b) B1-B2 — bonsai_gridmove.js adapter: a §ARC-3AXIS row (rotX=0, rotY=π/2, rotZRad=0 — the REAL
 *      SampleCastle fid=3055 shape) now yields tiltYRad=π/2 while yawRad stays undefined; end-to-end through
 *      a real GridKinematicEngine, the element that used to ATTACH now falls to interior.
 *  (c) W1-W3 — bonsai_kernel_worker.js: a SCALE command carrying tiltYRad=π/2 REFUSES (output byte-identical
 *      to input, no shear/scale at all); tiltXRad/tiltYRad undefined ⇒ byte-identical to the existing
 *      yaw-only guard (regression bar); sub-threshold tilt (0.005 rad) does NOT refuse.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const MOD = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol != null ? tol : 1e-5); }
function aabb(positions) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    xmin = Math.min(xmin, positions[i]); xmax = Math.max(xmax, positions[i]);
    ymin = Math.min(ymin, positions[i + 1]); ymax = Math.max(ymax, positions[i + 1]);
    zmin = Math.min(zmin, positions[i + 2]); zmax = Math.max(zmax, positions[i + 2]);
  }
  return { xmin, xmax, ymin, ymax, zmin, zmax };
}

console.log('═══ W-GRID-TILT-GUARD — non-negligible rotX/rotY tilt guard (GRID_ROTATION_GUARD.md §5) ═══');

// ═══ (a) grid_kinematics.js — pure engine, sync ═════════════════════════════════════════════════════════
{
  const GK = require(path.join(MOD, 'grid_kinematics.js'));
  const GridKinematicEngine = GK.GridKinematicEngine;

  // G1: the REAL SampleCastle fid=3055 shape — center x within EDGE_TOL of a gridline, tiltYRad=π/2 exactly
  // (rotation_x=0, rotation_z=0, rotation_y=π/2). Under the OLD (yaw-only) guard this ATTACHed (yawRad
  // undefined ⇒ unguarded). Hand math: x=18.6779, bboxX=0.866 → half=0.433; grid at x=19.1109 (edge match,
  // |18.6779+0.433 - 19.1109| = 0 ⇒ EDGE_RIGHT under the old unguarded math). With tiltYRad=π/2 (>YAW_TOL
  // from zero) this axis must now be SKIPPED entirely — no attach-map entry, falls to interior.
  console.log('\n── G1 — exact 90° tilt (real SampleCastle fid=3055 shape) now skips, was reachable before ──');
  (function () {
    const elemNoTilt = { guid: 'NOTILT', x: 18.6779, y: 15.5005, z: 9.9792, bboxX: 0.866, bboxY: 0.042, bboxZ: 0.042, ifcClass: 'IfcRailing' };
    const elemTilted = Object.assign({}, elemNoTilt, { guid: 'TILTED', tiltYRad: Math.PI / 2 });
    const grids = [{ id: 'gx4', axis: 'x', pos: 19.1109 }];
    const engBefore = new GridKinematicEngine([elemNoTilt], grids); engBefore.attachGridToElements();
    const engAfter = new GridKinematicEngine([elemTilted], grids); engAfter.attachGridToElements();
    const beforeHit = (engBefore.getAttachMap()['gx4'] || []).length === 1;
    const afterHit = (engAfter.getAttachMap()['gx4'] || []).length === 0;
    const afterInterior = engAfter.getInteriorElements().some(function (ie) { return ie.guid === 'TILTED'; });
    chk('without tiltYRad this exact shape DOES classify (proves the old gap was real)', beforeHit,
      JSON.stringify(engBefore.getAttachMap()['gx4']));
    chk('with tiltYRad=π/2 the SAME shape/position no longer classifies', afterHit,
      JSON.stringify(engAfter.getAttachMap()['gx4']));
    chk('tilted element falls through to interior instead', afterInterior);
    chk('getTiltSkipCount() counted exactly 3 (x, y AND z all skipped, post-§AXIS-SCOPE)',
      engAfter.getTiltSkipCount() === 3, 'got ' + engAfter.getTiltSkipCount());
  })();

  console.log('\n── G2 — tiltXRad/tiltYRad undefined: zero tiltSkipCount, byte-identical to pre-fix ──');
  (function () {
    const eng = new GridKinematicEngine(
      [{ guid: 'WA', x: 10.1, y: 1.5, z: 5, bboxX: 0.08, bboxY: 3, bboxZ: 0.08, ifcClass: 'IfcColumn' }],
      [{ id: 'A', axis: 'x', pos: 10 }]);
    eng.attachGridToElements();
    chk('tiltSkipCount stays 0 for tilt-less callers', eng.getTiltSkipCount() === 0);
    chk('classification unaffected (still ATTACHes)', (eng.getAttachMap()['A'] || []).some(function (i) { return i.guid === 'WA' && i.relation === 'ATTACH'; }));
  })();

  console.log('\n── G3 — sub-threshold tilt (0.005 rad, < YAW_TOL) does NOT skip ──');
  (function () {
    const eng = new GridKinematicEngine(
      [{ guid: 'WA', x: 10.1, y: 1.5, z: 5, bboxX: 0.08, bboxY: 3, bboxZ: 0.08, ifcClass: 'IfcColumn', tiltXRad: 0.005, tiltYRad: -0.003 }],
      [{ id: 'A', axis: 'x', pos: 10 }]);
    eng.attachGridToElements();
    chk('sub-threshold tilt: tiltSkipCount stays 0', eng.getTiltSkipCount() === 0);
    chk('sub-threshold tilt: classification unaffected', (eng.getAttachMap()['A'] || []).some(function (i) { return i.guid === 'WA' && i.relation === 'ATTACH'; }));
  })();

  console.log('\n── G4 — §AXIS-SCOPE (GRID_ROTATION_GUARD.md §8): guard now covers y too — a tilted element no longer ATTACHes on y either ──');
  (function () {
    // CORRECTED 2026-07-10 (Watchdog finding, same as witness_grid_rotation_guard.js's R6): y is the
    // Modeller's real second plan axis (Z-up; bonsai_gridmove.js never emits axis:'z' grid lines), so a
    // non-negligible tilt must skip y exactly like it skips x.
    const eng = new GridKinematicEngine(
      [{ guid: 'BY', x: 50, y: 0.2, z: 50, bboxX: 0.866, bboxY: 3, bboxZ: 0.042, ifcClass: 'IfcRailing', tiltYRad: Math.PI / 2 }],
      [{ id: 'Gy', axis: 'y', pos: 0 }]);
    eng.attachGridToElements();
    const yItems = eng.getAttachMap()['Gy'] || [];
    chk('y-axis ATTACH NO LONGER survives with tiltYRad set (post-§AXIS-SCOPE)',
      yItems.length === 0, JSON.stringify(yItems));
    chk('falls through to interior instead', eng.getInteriorElements().some(function (ie) { return ie.guid === 'BY'; }));
  })();

  console.log('\n── G5 — yaw and tilt skip-counts attributed independently (x+y+z, post-§AXIS-SCOPE) ──');
  (function () {
    const eng = new GridKinematicEngine(
      [
        { guid: 'YAWONLY', x: 10.1, y: 1.5, z: 5, bboxX: 0.08, bboxY: 3, bboxZ: 0.08, ifcClass: 'IfcWall', yawRad: Math.PI / 4 },
        { guid: 'TILTONLY', x: 10.1, y: 1.5, z: 3, bboxX: 0.08, bboxY: 3, bboxZ: 0.08, ifcClass: 'IfcWall', tiltXRad: Math.PI / 2 }
      ],
      [{ id: 'A', axis: 'x', pos: 10 }]);
    eng.attachGridToElements();
    chk('yawSkipCount counts only the yaw-oblique element (x+y+z)', eng.getYawSkipCount() === 3, 'got ' + eng.getYawSkipCount());
    chk('tiltSkipCount counts only the tilted element (x+y+z)', eng.getTiltSkipCount() === 3, 'got ' + eng.getTiltSkipCount());
  })();

  console.log('\n── G6 — _hasTilt boundary arithmetic (distance from ZERO, unlike _isObliqueYaw\'s nearest-90°) ──');
  (function () {
    const f = GK._hasTilt;
    chk('undefined/undefined → not tilted', f(undefined, undefined) === false);
    chk('exact π/2 on X → TILTED (unlike yaw, no 90°-exemption)', f(Math.PI / 2, undefined) === true);
    chk('exact π (180°) on Y → TILTED', f(undefined, Math.PI) === true);
    chk('0.005 (< tol) on both → not tilted', f(0.005, -0.005) === false);
    chk('0.02 (> tol) on Y only → tilted', f(0, 0.02) === true);
    chk('negative exceeding tolerance → tilted (abs value)', f(-0.5, 0) === true);
  })();
}

// ═══ (b) bonsai_gridmove.js adapter — hand-built fakes (Tier-2 style) ══════════════════════════════════
console.log('\n═══ (b) bonsai_gridmove.js: §ARC-3AXIS placement.rotX/rotY → elementData tiltXRad/tiltYRad ═══');
{
  global.window = global.window || {};
  // fid=1: §ARC-3AXIS row, REAL SampleCastle fid=3055 shape (rotX=0, rotY=π/2 exactly, rotZRad=0) — no
  // `.rot` field at all, so yawRadByFid must stay undefined while tiltYRadByFid picks it up.
  // fid=2: plain yaw-only row (placement.rot=45°) — tiltXRad/tiltYRad must stay undefined (regression bar).
  // fid=3: no row — everything undefined.
  const ROWS = [
    [1, JSON.stringify({ ifc_class: 'IfcRailing', placement: { x: 18.6779, y: 15.5005, z: 9.9792, rotX: 0, rotY: Math.PI / 2, rotZRad: 0 } })],
    [2, JSON.stringify({ ifc_class: 'IfcWall', placement: { x: 0, y: 0, z: 0, rot: 45 } })],
    [3, JSON.stringify({ ifc_class: 'IfcWall' })]
  ];
  function fakeMesh(fid, bb) {
    return { isMesh: true, userData: { featureId: fid },
      geometry: { computeBoundingBox: function () { }, boundingBox: bb } };
  }
  window.Bonsai = {
    group: function () {
      return { children: [
        fakeMesh(1, { min: { x: 18.6779 - 0.433, y: 15.5005 - 0.021, z: 9.9792 - 0.021 }, max: { x: 18.6779 + 0.433, y: 15.5005 + 0.021, z: 9.9792 + 0.021 } }),
        fakeMesh(2, { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }),
        fakeMesh(3, { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })
      ] };
    },
    oplog: { db: { exec: function (sql) { return /kernel_ops/.test(sql) ? [{ columns: ['id', 'parameters'], values: ROWS }] : []; } } },
    grid: { xs: [19.1109], ys: [] }
  };
  window.GridKinematics = require(path.join(MOD, 'grid_kinematics.js'));
  require(path.join(MOD, 'bonsai_gridmove.js'));
  const GM = window.Bonsai.gridmove;
  GM._dragAxis = null; GM._dragOrthoAt = null;

  const maps = GM._buildInsertMaps();
  chk('B1 fid=1 (§ARC-3AXIS): yawRadByFid ABSENT (no `.rot` field)', !(1 in maps.yawRadByFid));
  chk('B1 fid=1 (§ARC-3AXIS): tiltXRadByFid = 0 exactly', maps.tiltXRadByFid[1] === 0);
  chk('B1 fid=1 (§ARC-3AXIS): tiltYRadByFid = π/2 exactly', maps.tiltYRadByFid[1] === Math.PI / 2, 'got ' + maps.tiltYRadByFid[1]);
  chk('B1 fid=2 (yaw-only row): tiltXRad/tiltYRad ABSENT (regression bar)', !(2 in maps.tiltXRadByFid) && !(2 in maps.tiltYRadByFid));
  chk('B1 fid=3 (no row): everything ABSENT', !(3 in maps.yawRadByFid) && !(3 in maps.tiltXRadByFid) && !(3 in maps.tiltYRadByFid));

  const byFid = {}; GM.elementData().forEach(function (e) { byFid[e.guid] = e; });
  chk('B2 elementData() fid=1 carries tiltYRad=π/2, yawRad undefined', byFid[1] && byFid[1].yawRad === undefined && byFid[1].tiltYRad === Math.PI / 2);

  const eng = GM._buildEngine();
  const hits1 = (eng.getAttachMap()['gx0'] || []).filter(function (r) { return r.guid === 1; });
  chk('B2 end-to-end: fid=1 (real tilted shape) is NOT classified — falls to interior', hits1.length === 0, JSON.stringify(hits1));
  chk('B2 end-to-end: getTiltSkipCount() > 0 for this scene', eng.getTiltSkipCount() > 0, 'got ' + eng.getTiltSkipCount());
}

// ═══ (c) bonsai_kernel_worker.js — real occt-wasm SCALE fold refusal ══════════════════════════════════
async function partC() {
  console.log('\n═══ (c) bonsai_kernel_worker.js: SCALE fold REFUSES on non-negligible tiltXRad/tiltYRad ═══');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tiltguard-witness-'));
  fs.mkdirSync(path.join(tmp, 'lib', 'kernel'), { recursive: true });
  for (const f of fs.readdirSync(path.join(MOD, 'lib', 'kernel'))) {
    fs.copyFileSync(path.join(MOD, 'lib', 'kernel', f), path.join(tmp, 'lib', 'kernel', f));
  }
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
  fs.copyFileSync(path.join(MOD, 'bonsai_kernel_worker.js'), path.join(tmp, 'worker.mjs'));
  globalThis.self = globalThis.self || {};
  self.postMessage = () => { };
  await import(path.join(tmp, 'worker.mjs'));
  const send = (data) => new Promise((resolve) => {
    self.postMessage = (msg) => { if (msg.id === data.id) resolve(msg); };
    self.onmessage({ data });
  });

  const RECT = { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] };   // wall: 4 long (x), 0.2 thick (y), 1 high (z)
  const wall = (suf) => ({ id: 1, op_hash: 'leaf:' + suf, op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: RECT, depth: 1 } });
  const grid = (suf, id, cmd) => ({ id, op_hash: 'grid:' + suf, op_type: 'GEOM_GRID_MOVE', parameters: { gridId: 'gx1', delta: 1, commands: [Object.assign({ featureId: 1 }, cmd)] } });

  // W1: unrotated wall, SCALE x f=1.5, tiltYRad=π/2 (exact 90°, non-negligible from ZERO) → REFUSE: output
  // must be BYTE-IDENTICAL to the untouched fixture (x:[0,4] y:[0,0.2] z:[0,1]), NOT the naive-scaled x:[0,6].
  const r0 = await send({ id: 20, ops: [wall('w0')] });
  const b0 = r0.ok && aabb(r0.meshes[0].positions);
  const r1 = await send({ id: 21, ops: [wall('w1'), grid('w1', 2, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0, tiltYRad: Math.PI / 2 })] });
  const b1 = r1.ok && aabb(r1.meshes[0].positions);
  chk('W1 tiltYRad=π/2 REFUSES the scale — output AABB byte-identical to unscaled fixture',
    r1.ok && approx(b1.xmin, b0.xmin, 1e-9) && approx(b1.xmax, b0.xmax, 1e-9) && approx(b1.ymin, b0.ymin, 1e-9) && approx(b1.ymax, b0.ymax, 1e-9),
    r1.ok ? ('fixture=' + JSON.stringify(b0) + ' got=' + JSON.stringify(b1)) : r1.error);

  // W2: same command WITHOUT tiltYRad (undefined) → the EXISTING naive path fires, x:[0,6] (regression bar —
  // proves W1's refusal is due to tilt specifically, not some unrelated change to the SCALE branch).
  const r2 = await send({ id: 22, ops: [wall('w2'), grid('w2', 2, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0 })] });
  const b2 = r2.ok && aabb(r2.meshes[0].positions);
  chk('W2 tiltYRad undefined → unchanged naive SCALE still fires, x:[0,6] (regression bar)',
    r2.ok && approx(b2.xmin, 0) && approx(b2.xmax, 6), r2.ok ? JSON.stringify(b2) : r2.error);

  // W3: sub-threshold tiltXRad=0.005 (< 0.01 tol) → must NOT refuse, naive path fires exactly like W2.
  const r3 = await send({ id: 23, ops: [wall('w3'), grid('w3', 2, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0, tiltXRad: 0.005 })] });
  const b3 = r3.ok && aabb(r3.meshes[0].positions);
  chk('W3 sub-threshold tiltXRad=0.005 does NOT refuse — naive SCALE still fires, x:[0,6]',
    r3.ok && approx(b3.xmin, 0) && approx(b3.xmax, 6), r3.ok ? JSON.stringify(b3) : r3.error);

  fs.rmSync(tmp, { recursive: true, force: true });
}

partC().then(() => {
  console.log('\n═══════════════════════════════════════════════');
  console.log('W-GRID-TILT-GUARD: ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('═══════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
}).catch(e => { console.error('FATAL', e); process.exit(1); });
