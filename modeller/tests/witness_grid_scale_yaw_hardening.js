#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRID-SCALE-YAW-HARDENING: prompts/GRID_ROTATED_SCALE_HARDENING.md §1's witness.
 * SCOPE: proves the §SCALE-YAW-GUARD in bonsai_kernel_worker.js's GEOM_GRID_MOVE SCALE fold + the yawRad
 * thread-through in bonsai_gridmove.js (§1.1). Pure node, no browser/puppeteer/e2e. Read the log after
 * every run — exit code alone is not evidence.
 *
 * THE ISSUE EACH PART PROVES OR DISPROVES:
 *  Part A (worker fold, REAL bonsai_kernel_worker.js + REAL occt-wasm, harness technique copied from
 *  witness_gridmove_fold_pure.mjs — zero fold math reimplemented):
 *   A1/A2  ISSUE: does the guard change ANY behavior for yawRad-undefined / yawRad-aligned commands?
 *          (must be NO — §1.3's byte-identical bar; a regression here is the one forbidden outcome)
 *   A3     ISSUE: does a 90°-multiple yawRad wrongly trigger the hardened branch? (must be NO — at 90°
 *          multiples AABB==OBB and the naive world-axis stretch is already geometrically correct)
 *   A4     ISSUE: is the legacy path on a ROTATED shape without yawRad still byte-identical (the dormant
 *          shear, deliberately preserved for unannotated callers)? Also DEMONSTRATES the shear defect §0
 *          diagnosed: the legacy result is NOT the cleanly-stretched wall of A5.
 *   A5/A6  ISSUE (the core one): does the hardened branch stretch a 30°-yawed wall along its OWN axis with
 *          NO shear? Proven by matching every tessellated vertex against the 8 HAND-COMPUTED corners of the
 *          cleanly-stretched rotated box (AABB alone cannot distinguish shear from stretch).
 *   A7     ISSUE: is an axis-'z' (world-vertical) stretch left on the naive path even when yaw is oblique?
 *          (yaw is about Z in the worker frame — vertical stretch cannot shear; guard must not engage)
 *   A8     ISSUE: is the 0.01-rad tolerance gate real? (0.009 rad off 0 → naive; 0.02 rad off 0 → hardened)
 *   A9     ISSUE (§2 stop-condition check): does the ONE composed matrix equal the hand-computed 3-step
 *          rotate→scale→rotate-back applied sequentially (pure JS, verification-only — never shipped as 3
 *          kernel calls, per the GEOM_SCALE Copy=false aliasing hazard)?
 *  Part B (adapter, hand-built fakes, technique copied from witness_gridmove_adapter_fakes.js):
 *   B1     ISSUE: does _buildInsertMaps() read placement.rot in DEGREES and convert to RADIANS (the exact
 *          units landmine GRID_ROTATION_GUARD.md §0 flags), keying by fid, with placement-less / row-less
 *          fids ABSENT (undefined ⇒ unguarded, symmetric with the class-UNKNOWN rule)?
 *   B2     ISSUE: does computeCommands() stamp yawRad onto the commands it hands the worker — present
 *          (radians) for a recorded fid, undefined for unrecorded ones?
 *
 * HAND MATH (worked out BEFORE the assertions — the wall fixture is the extruded rect profile
 * [0,0]-[4,0]-[4,0.2]-[0,0.2], depth 1 ⇒ box x:[0,4] y:[0,0.2] z:[0,1], centre (2, 0.1), in-plan
 * half-extents hu=2 (local x), hv=0.1 (local y)):
 *  · GEOM_ROTATE drot=30° spins about the bbox centre (2,0.1). cos30=√3/2=0.8660254037844387, sin30=0.5.
 *    Rotated world AABB half-extents: Hx = 2·cos+0.1·sin = 1.7820508075688772, Hy = 2·sin+0.1·cos =
 *    1.0866025403784439 ⇒ AABB x:[0.2179491924311228, 3.7820508075688772],
 *    y:[-0.9866025403784439, 1.1866025403784439], z:[0,1].
 *  · A5 hardened SCALE axis 'x' f=1.5 td=0 on that shape: local half-length hu 2→3, hv unchanged, centre
 *    fixed (bbox-centre anchor). Corners = centre + R(30°)·(±3, ±0.1), z∈{0,1}:
 *      (+3,+0.1) → (4.5480762113533160, 1.6866025403784439)
 *      (+3,−0.1) → (4.6480762113533160, 1.5133974596215561)
 *      (−3,+0.1) → (−0.6480762113533156, −1.3133974596215561)
 *      (−3,−0.1) → (−0.5480762113533156, −1.4866025403784439)
 *    ⇒ AABB x:[−0.6480762113533156, 4.6480762113533160], y:[−1.4866025403784439, 1.6866025403784439].
 *  · A4 legacy (no yawRad) on the same rotated shape: x' = 1.5·x + xmin·(1−1.5), xmin=0.2179491924311228
 *    ⇒ xmin fixed, xmax = 1.5·3.7820508075688772 − 0.1089745962155614 = 5.5641016151377534, y untouched.
 *  · A3 GEOM_ROTATE drot=90°: Hx=0.1, Hy=2 ⇒ AABB x:[1.9,2.1], y:[−1.9,2.1]. Naive SCALE axis 'y' f=1.5
 *    about ymin=−1.9: y' = 1.5y + 0.95 ⇒ y:[−1.9, 4.1] (2.1·1.5+0.95 = 4.1), x untouched.
 *  · B1: placement.rot = 30 (DEGREES) ⇒ yawRad = 30·π/180 = 0.5235987755982988.
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
// Every tessellated vertex must sit ON one of the expected corners AND every expected corner must be hit —
// this is the shear discriminator (an equal-AABB sheared solid has vertices OFF the clean corner set).
function cornersMatch(positions, corners, tol) {
  tol = tol != null ? tol : 1e-4;
  const hit = corners.map(() => false);
  for (let i = 0; i < positions.length; i += 3) {
    let best = Infinity, bi = -1;
    for (let k = 0; k < corners.length; k++) {
      const d = Math.max(Math.abs(positions[i] - corners[k][0]), Math.abs(positions[i + 1] - corners[k][1]), Math.abs(positions[i + 2] - corners[k][2]));
      if (d < best) { best = d; bi = k; }
    }
    if (best > tol) return { ok: false, why: 'vertex (' + positions[i].toFixed(6) + ',' + positions[i + 1].toFixed(6) + ',' + positions[i + 2].toFixed(6) + ') is ' + best.toFixed(6) + ' from nearest expected corner' };
    hit[bi] = true;
  }
  const missed = hit.filter(h => !h).length;
  return missed ? { ok: false, why: missed + ' expected corner(s) never hit' } : { ok: true };
}

// ── Pure-JS reference transforms (mirrors of the DOCUMENTED formulas, used only to derive expectations) ──
const rotZ = (theta, cx, cy) => (p) => {
  const c = Math.cos(theta), s = Math.sin(theta), x = p[0] - cx, y = p[1] - cy;
  return [cx + c * x - s * y, cy + s * x + c * y, p[2]];
};
// Naive worker SCALE: coord' = f·coord + (min·(1−f) + td) on the one world axis.
const refNaive = (axis, f, td, min) => (p) => {
  const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const q = p.slice(); q[k] = f * q[k] + min * (1 - f) + td; return q;
};
// Hardened composed matrix (same formula the worker builds): L = R(yaw)·S·R(−yaw), bbox-centre anchored,
// td applied along the world command axis.
function refComposed(axis, f, td, yaw, px, py) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const sx = axis === 'x' ? f : 1, sy = axis === 'y' ? f : 1;
  const l00 = sx * cs * cs + sy * sn * sn, l01 = (sx - sy) * cs * sn, l11 = sx * sn * sn + sy * cs * cs;
  const t0 = px - (l00 * px + l01 * py) + (axis === 'x' ? td : 0);
  const t1 = py - (l01 * px + l11 * py) + (axis === 'y' ? td : 0);
  return (p) => [l00 * p[0] + l01 * p[1] + t0, l01 * p[0] + l11 * p[1] + t1, p[2]];
}
// The SAME transform as 3 sequential steps (verification-only — never shipped as 3 kernel calls):
// rotate −yaw about centre → scale about centre on the (now-local) axis → rotate +yaw back → shift td·e_axis.
function refSequential(axis, f, td, yaw, px, py) {
  const k = axis === 'x' ? 0 : 1;
  return (p) => {
    let q = rotZ(-yaw, px, py)(p);
    const c = k === 0 ? px : py; q = q.slice(); q[k] = c + f * (q[k] - c);
    q = rotZ(yaw, px, py)(q);
    q[k] += td; return q;
  };
}

// ═══ Part B first (sync, no wasm needed) — adapter thread-through with hand-built fakes ═══
console.log('═══ W-GRID-SCALE-YAW-HARDENING — Part B: bonsai_gridmove.js yawRad thread-through (fakes) ═══');
{
  global.window = global.window || {};
  // fid=1: recorded GEOM_INSERT, placement.rot=30 DEGREES → yawRad must be 30·π/180 = 0.5235987755982988
  // fid=2: recorded GEOM_INSERT, placement WITHOUT rot → NO yawRadByFid entry (undefined downstream)
  // fid=3: NO row at all (synthetic/hand-authored) → NO entry
  const INSERT_ROWS = [
    [1, JSON.stringify({ ifc_class: 'IfcWall', placement: { x: 0, y: 0, z: 0, rot: 30 } })],
    [2, JSON.stringify({ ifc_class: 'IfcWall', placement: { x: 0, y: 0, z: 0 } })],
  ];
  window.Bonsai = window.Bonsai || {};
  window.Bonsai.oplog = { db: { exec(sql) { return /kernel_ops/.test(sql) ? [{ columns: ['id', 'parameters'], values: INSERT_ROWS }] : []; } } };
  // grid xs=[0,4,8], ys=[0,3] → gridLines gx0(0) gx1(4) gx2(8), gy0(0) gy1(3). All three walls span
  // x:[0,4] (lo=0=gx0, hi=4=gx1 ⇒ SPAN) at distinct y so dragging gx1 emits a SCALE per wall.
  window.Bonsai.grid = { xs: [0, 4, 8], ys: [0, 3] };
  const mesh = (fid, ycen) => ({ isMesh: true, userData: { featureId: fid }, geometry: {
    computeBoundingBox() { }, boundingBox: { min: { x: 0, y: ycen - 0.1, z: 0 }, max: { x: 4, y: ycen + 0.1, z: 1 } } } });
  const fakeGroup = { children: [mesh(1, 0.1), mesh(2, 1.0), mesh(3, 2.0)] };
  window.Bonsai.group = () => fakeGroup;
  window.GridKinematics = require(path.join(MOD, 'grid_kinematics.js'));
  require(path.join(MOD, 'bonsai_gridmove.js'));
  const GM = window.Bonsai.gridmove;

  const maps = GM._buildInsertMaps();
  chk('B1 yawRadByFid: fid1 = 30° in RADIANS (0.5235987755982988)', approx(maps.yawRadByFid[1], 0.5235987755982988, 1e-12), 'got ' + maps.yawRadByFid[1]);
  chk('B1 yawRadByFid: fid2 (placement w/o rot) ABSENT', !(2 in maps.yawRadByFid));
  chk('B1 yawRadByFid: fid3 (no row) ABSENT', !(3 in maps.yawRadByFid));
  chk('B1 classByFid delegate unchanged (fid1+fid2 recorded)', maps.classByFid[1] === 'IfcWall' && GM._buildClassByFid()[2] === 'IfcWall');

  const cmds = GM.computeCommands('gx1', 1);
  const byFid = {}; cmds.forEach(c => { byFid[c.featureId] = c; });
  chk('B2 dragGrid produced commands for all 3 spanning walls', !!(byFid[1] && byFid[2] && byFid[3]), 'cmds=' + JSON.stringify(cmds.map(c => ({ fid: c.featureId, a: c.action, yaw: c.yawRad }))));
  chk('B2 fid1 command carries yawRad ≈ 0.5235988 (radians, NOT 30)', !!byFid[1] && approx(byFid[1].yawRad, 0.5235987755982988, 1e-12));
  chk('B2 fid2 command yawRad undefined (placement w/o rot)', !!byFid[2] && byFid[2].yawRad === undefined);
  chk('B2 fid3 command yawRad undefined (synthetic, no row)', !!byFid[3] && byFid[3].yawRad === undefined);
}

// ═══ Part A (async) — the REAL worker fold against the REAL occt-wasm kernel ═══
async function partA() {
  console.log('═══ W-GRID-SCALE-YAW-HARDENING — Part A: worker SCALE fold (real occt-wasm) ═══');
  // Mirror the real worker + its real lib/kernel/ into a throwaway ESM-scoped temp dir (byte-identical,
  // read fresh off disk — harness plumbing only; technique from witness_gridmove_fold_pure.mjs).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaleyaw-witness-'));
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
  const spin = (suf, deg) => ({ id: 2, op_hash: 'rot:' + suf, op_type: 'GEOM_ROTATE', parent: 1, parameters: { drot: deg } });
  const grid = (suf, id, cmd) => ({ id, op_hash: 'grid:' + suf, op_type: 'GEOM_GRID_MOVE', parameters: { gridId: 'gx1', delta: 1, commands: [Object.assign({ featureId: 1 }, cmd)] } });
  const C30 = Math.sqrt(3) / 2, S30 = 0.5, YAW30 = Math.PI / 6;
  // the 8 corners of the UNROTATED wall (z 0 and 1)
  const baseCorners = [];
  for (const z of [0, 1]) for (const xy of [[0, 0], [4, 0], [4, 0.2], [0, 0.2]]) baseCorners.push([xy[0], xy[1], z]);
  const rot30Corners = baseCorners.map(rotZ(YAW30, 2, 0.1));

  // A0 fixture sanity — hand math: x:[0,4] y:[0,0.2] z:[0,1]
  const r0 = await send({ id: 10, ops: [wall('a0')] });
  const b0 = r0.ok && aabb(r0.meshes[0].positions);
  chk('A0 fixture AABB x:[0,4] y:[0,0.2] z:[0,1]', r0.ok && approx(b0.xmin, 0) && approx(b0.xmax, 4) && approx(b0.ymin, 0) && approx(b0.ymax, 0.2) && approx(b0.zmin, 0) && approx(b0.zmax, 1), r0.ok ? JSON.stringify(b0) : r0.error);

  // A1 regression: NO yawRad, unrotated, SCALE x f=1.5 td=0 → min-anchored: x:[0,6] (0·(1−1.5)=0)
  const r1 = await send({ id: 11, ops: [wall('a1'), grid('a1', 2, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0 })] });
  const b1 = r1.ok && aabb(r1.meshes[0].positions);
  chk('A1 yawRad ABSENT → legacy naive x:[0,6]', r1.ok && approx(b1.xmin, 0) && approx(b1.xmax, 6) && approx(b1.ymin, 0) && approx(b1.ymax, 0.2), r1.ok ? JSON.stringify(b1) : r1.error);

  // A2 yawRad=0 (defined, aligned) → identical naive result
  const r2 = await send({ id: 12, ops: [wall('a2'), grid('a2', 2, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0, yawRad: 0 })] });
  const b2 = r2.ok && aabb(r2.meshes[0].positions);
  chk('A2 yawRad=0 → same naive x:[0,6]', r2.ok && approx(b2.xmin, 0) && approx(b2.xmax, 6), r2.ok ? JSON.stringify(b2) : r2.error);

  // A3 rotated 90° + yawRad=π/2 → 90°-multiple must NOT trigger guard. Hand math: rotated AABB x:[1.9,2.1]
  // y:[−1.9,2.1]; naive SCALE y f=1.5 about ymin=−1.9 → y:[−1.9,4.1], x untouched.
  const r3 = await send({ id: 13, ops: [wall('a3'), spin('a3', 90), grid('a3', 3, { action: 'SCALE', axis: 'y', newScale: 1.5, translateDelta: 0, yawRad: Math.PI / 2 })] });
  const b3 = r3.ok && aabb(r3.meshes[0].positions);
  chk('A3 90°-multiple yawRad → naive: x:[1.9,2.1] y:[−1.9,4.1]', r3.ok && approx(b3.xmin, 1.9, 1e-4) && approx(b3.xmax, 2.1, 1e-4) && approx(b3.ymin, -1.9, 1e-4) && approx(b3.ymax, 4.1, 1e-4), r3.ok ? JSON.stringify(b3) : r3.error);

  // A4 rotated 30°, NO yawRad → BYTE-IDENTICAL legacy shear preserved. Hand math: xmin fixed at
  // 0.2179491924311228, xmax = 5.5641016151377534, y untouched [−0.9866025403784439, 1.1866025403784439].
  // Corner check: legacy = refNaive applied to the hand-computed rotated corners (this IS the shear §0
  // diagnosed — compare A5's clean corners, which these are NOT).
  const r4 = await send({ id: 14, ops: [wall('a4'), spin('a4', 30), grid('a4', 3, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0 })] });
  const b4 = r4.ok && aabb(r4.meshes[0].positions);
  const shearCorners = rot30Corners.map(refNaive('x', 1.5, 0, 0.2179491924311228));
  const m4 = r4.ok && cornersMatch(r4.meshes[0].positions, shearCorners);
  chk('A4 rotated + yawRad ABSENT → legacy shear AABB x:[0.2179492, 5.5641016] y untouched', r4.ok && approx(b4.xmin, 0.2179491924311228, 1e-4) && approx(b4.xmax, 5.5641016151377534, 1e-4) && approx(b4.ymin, -0.9866025403784439, 1e-4) && approx(b4.ymax, 1.1866025403784439, 1e-4), r4.ok ? JSON.stringify(b4) : r4.error);
  chk('A4 legacy vertices == sheared corner set (dormant behavior byte-preserved)', r4.ok && m4.ok, m4 && m4.why);

  // A5 THE FIX: rotated 30° + yawRad=π/6, SCALE x f=1.5 td=0 → clean local-axis stretch, hand-computed
  // corners (header math): AABB x:[−0.6480762113533156, 4.6480762113533160] y:[−1.4866025403784439,
  // 1.6866025403784439] z:[0,1] — and EVERY vertex on the 8 clean corners (no shear).
  const clean5 = [];
  for (const z of [0, 1]) for (const uv of [[3, 0.1], [3, -0.1], [-3, 0.1], [-3, -0.1]]) {
    clean5.push([2 + C30 * uv[0] - S30 * uv[1], 0.1 + S30 * uv[0] + C30 * uv[1], z]);
  }
  const r5 = await send({ id: 15, ops: [wall('a5'), spin('a5', 30), grid('a5', 3, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0, yawRad: YAW30 })] });
  const b5 = r5.ok && aabb(r5.meshes[0].positions);
  const m5 = r5.ok && cornersMatch(r5.meshes[0].positions, clean5);
  chk('A5 hardened AABB x:[−0.6480762, 4.6480762] y:[−1.4866025, 1.6866025] z:[0,1]', r5.ok && approx(b5.xmin, -0.6480762113533156, 1e-4) && approx(b5.xmax, 4.648076211353316, 1e-4) && approx(b5.ymin, -1.4866025403784439, 1e-4) && approx(b5.ymax, 1.6866025403784439, 1e-4) && approx(b5.zmin, 0, 1e-4) && approx(b5.zmax, 1, 1e-4), r5.ok ? JSON.stringify(b5) : r5.error);
  chk('A5 every vertex ON the 8 hand-computed clean corners (NO SHEAR)', r5.ok && m5.ok, m5 && m5.why);

  // A6 same + translateDelta=0.7 → A5 corners shifted +0.7 in WORLD x (td keeps TRANSLATE's world semantics)
  const r6 = await send({ id: 16, ops: [wall('a6'), spin('a6', 30), grid('a6', 3, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0.7, yawRad: YAW30 })] });
  const m6 = r6.ok && cornersMatch(r6.meshes[0].positions, clean5.map(p => [p[0] + 0.7, p[1], p[2]]));
  chk('A6 translateDelta rides as world-x shift (+0.7 on every A5 corner)', r6.ok && m6.ok, r6.ok ? (m6.why || '') : r6.error);

  // A7 oblique yaw but axis 'z' → naive (vertical stretch is yaw-safe; yaw is about Z): z:[0,2], plan
  // AABB unchanged from the rotated wall (x:[0.2179492,3.7820508] y:[−0.9866025,1.1866025]).
  const r7 = await send({ id: 17, ops: [wall('a7'), spin('a7', 30), grid('a7', 3, { action: 'SCALE', axis: 'z', newScale: 2, translateDelta: 0, yawRad: YAW30 })] });
  const b7 = r7.ok && aabb(r7.meshes[0].positions);
  chk('A7 axis z + oblique yawRad → naive vertical: z:[0,2], plan AABB unchanged', r7.ok && approx(b7.zmin, 0, 1e-4) && approx(b7.zmax, 2, 1e-4) && approx(b7.xmin, 0.2179491924311228, 1e-4) && approx(b7.xmax, 3.7820508075688772, 1e-4) && approx(b7.ymin, -0.9866025403784439, 1e-4) && approx(b7.ymax, 1.1866025403784439, 1e-4), r7.ok ? JSON.stringify(b7) : r7.error);

  // A8 tolerance gate (0.01 rad): yawRad=0.009 (inside) → naive x:[0,6]; yawRad=0.02 (outside) → hardened
  // (== refComposed about the unrotated wall's centre (2,0.1) — GIGO-on-purpose: the guard trusts c.yawRad).
  const r8a = await send({ id: 18, ops: [wall('a8a'), grid('a8a', 2, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0, yawRad: 0.009 })] });
  const b8a = r8a.ok && aabb(r8a.meshes[0].positions);
  chk('A8a yawRad=0.009 (< tol) → naive x:[0,6]', r8a.ok && approx(b8a.xmin, 0) && approx(b8a.xmax, 6) && approx(b8a.ymin, 0) && approx(b8a.ymax, 0.2), r8a.ok ? JSON.stringify(b8a) : r8a.error);
  const r8b = await send({ id: 19, ops: [wall('a8b'), grid('a8b', 2, { action: 'SCALE', axis: 'x', newScale: 1.5, translateDelta: 0, yawRad: 0.02 })] });
  const m8 = r8b.ok && cornersMatch(r8b.meshes[0].positions, baseCorners.map(refComposed('x', 1.5, 0, 0.02, 2, 0.1)));
  chk('A8b yawRad=0.02 (> tol) → hardened (== composed-matrix reference corners)', r8b.ok && m8.ok, r8b.ok ? (m8.why || '') : r8b.error);

  // A9 §2 verification: composed single matrix ≡ 3 sequential steps (pure JS, tol 1e-12) across yaws/axes/td.
  let worst = 0;
  for (const [axis, f, td, yaw] of [['x', 1.5, 0, YAW30], ['x', 1.5, 0.7, YAW30], ['y', 0.5, 0, 0.02], ['y', 2, -0.3, 1.1], ['x', 0.25, 0.1, -0.7]]) {
    const cm = refComposed(axis, f, td, yaw, 2, 0.1), sq = refSequential(axis, f, td, yaw, 2, 0.1);
    for (const p of rot30Corners) {
      const a = cm(p), b = sq(p);
      worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    }
  }
  chk('A9 composed matrix ≡ rotate→scale→rotate-back 3-step (max |Δ| < 1e-12)', worst < 1e-12, 'worst=' + worst.toExponential(3));

  fs.rmSync(tmp, { recursive: true, force: true });
}

partA().then(() => {
  console.log('W-GRID-SCALE-YAW-HARDENING: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(e => { console.log('❌ HARNESS ERROR: ' + (e && e.stack || e)); process.exit(1); });
