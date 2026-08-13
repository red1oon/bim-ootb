#!/usr/bin/env node
/* ⚠ WITNESS — §CPE_AIM_DEPTH_BUILDUP candidate 1, both parts (2026-08-13). Spec: bim-compiler
 * prompts/CINEMA_PATH_EDITOR.md §CPE_AIM_DEPTH_BUILDUP. User-reported, live buildup bake: "it chose
 * to turn to see the empty sky instead of down at more better space corridors halls" and "it chooses
 * to face up close empty wall when the room is right behind to have more density*depth value."
 * Confirmed independently on Terminal, same session: "it kept facing the ceiling due to large
 * density of roof tiles perhaps... it should be noise bias to the ground objects or eye level to be
 * more meaningful."
 *
 * NAMES THE ISSUE: §CPE_AIM_DENSITY (`_aimSubject`) is the aim rule active during buildup (its
 * sibling §CPE_AIM_DEPTH is gated off during buildup). Unlike that sibling, it carried NO facade
 * filter and no height preference — a flat, near, dense floor/ceiling/roof cell competed for the
 * pick on density alone, and even a cell with SOME height variance but far overhead (a sloped roof/
 * truss cluster) could still out-score a genuine hall further away.
 *
 * TWO fixes, both replicated below:
 *   1. zSpan facade filter — reuses §CPE_AIM_DEPTH_VERTICALITY's classifier, excludes near-FLAT
 *      cells (a true floor/ceiling slab) outright.
 *   2. eye-level bias — a CONTINUOUS weight applied on top, for the case the binary filter above
 *      cannot catch: a cell with enough height variance to pass zSpan but still clearly overhead.
 *      Never zero (a genuinely tall facade still has mass near eye level and stays competitive).
 *
 * Pure-math replica of _aimGrid/_aimSubject from viewer/effects.js (same whitebox convention as
 * tests/test_aim_depth.js) — synthetic point cloud, no browser/THREE needed.
 *
 * Read the §-log lines. Exit code alone is not evidence.
 */
'use strict';

function cinemaSmoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

function buildGrid(pts, envelope) {
  var cs = Math.max(2, envelope / 8), map = {}, cells = [];
  for (var i = 0; i < pts.length; i++) {
    var kx = Math.floor(pts[i][0] / cs), ky = Math.floor(pts[i][1] / cs), kz = Math.floor(pts[i][2] / cs);
    var key = kx + ',' + ky + ',' + kz, c = map[key];
    if (!c) { c = map[key] = { n: 0, x: 0, y: 0, z: 0, zMin: pts[i][2], zMax: pts[i][2] }; cells.push(c); }
    c.n++; c.x += pts[i][0]; c.y += pts[i][1]; c.z += pts[i][2];
    if (pts[i][2] < c.zMin) c.zMin = pts[i][2];
    if (pts[i][2] > c.zMax) c.zMax = pts[i][2];
  }
  for (var j = 0; j < cells.length; j++) {
    var q = cells[j]; q.x /= q.n; q.y /= q.n; q.z /= q.n; q.zSpan = q.zMax - q.zMin;
  }
  return cells;
}
var EYE_FLOOR = 0.3;
// Replica of _aimSubject. `variant`: 'raw' = shipped bug (neither fix); 'zspan' = candidate 1 part 1
// only; 'eye' = both parts, the current shipped formula.
function aimSubject(pIfc, cells, envelope, variant) {
  var scale = Math.max(1, envelope * 0.5);
  var minZSpan = Math.max(2, envelope / 8) * 0.3;
  var eyeScale = Math.max(3, Math.min(8, envelope * 0.08));
  var sx = 0, sy = 0, sz = 0, sw = 0;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    if (variant !== 'raw' && c.zSpan < minZSpan) continue;
    var d = Math.hypot(c.x - pIfc.x, c.y - pIfc.y, c.z - pIfc.z) / scale;
    var w = c.n / ((1 + d) * (1 + d) * (1 + d));
    if (variant === 'eye') {
      var dz = Math.abs(c.z - pIfc.z);
      w *= EYE_FLOOR + (1 - EYE_FLOOR) * (1 - cinemaSmoothstep(Math.min(1, dz / eyeScale)));
    }
    sx += c.x * w; sy += c.y * w; sz += c.z * w; sw += w;
  }
  if (sw <= 1e-9) return null;
  return { x: sx / sw, y: sy / sw, z: sz / sw };
}

// ── Scenario: user's own report — a close, dense, FLAT ceiling/roof cell vs. a further, sparser,
// genuinely-tall hall wall. envelope = a mid-size building (Clinic-ish, 60m — the film named in the
// spec section this witness proves).
var ENVELOPE = 60;
var camIfc = { x: 0, y: 0, z: 6 };   // camera on an outside swoop, eye level mid-building height

var pts = [];
// Nearby ROOF/CEILING slab: 8m away, dense, but FLAT (all points within 0.3m of one height) — a
// roof truss cluster or ceiling plane, exactly what "faces the ceiling" names.
for (var rx = 6; rx <= 10; rx += 0.4) for (var ry = -4; ry <= 4; ry += 0.4) pts.push([rx, ry, 6.1]);
// Distant HALL wall: 22m away, sparser, but genuinely TALL (points spread floor-to-ceiling) — the
// "deep open hall" the user says it should have faced instead.
for (var hz = 0; hz <= 8; hz += 0.5) for (var hy = -5; hy <= 5; hy += 0.8) pts.push([22, hy, hz]);

var cells = buildGrid(pts, ENVELOPE);
var roofCells = cells.filter(function (c) { return c.x > 5 && c.x < 11; });
var hallCells = cells.filter(function (c) { return c.x > 20; });
console.log('§CPE_AIM_DENSITY_ZSPAN_WITNESS pts=' + pts.length + ' cells=' + cells.length +
  ' roofCells=' + roofCells.length + ' (zSpan~' + (roofCells[0] ? roofCells[0].zSpan.toFixed(2) : '?') +
  'm) hallCells=' + hallCells.length + ' (zSpan~' + (hallCells[0] ? hallCells[0].zSpan.toFixed(2) : '?') + 'm)');

var RED = 0, measured = 0;

// W1 — CONTROL: the RAW (neither fix) formula picks the near flat roof cell, reproducing the bug.
measured++;
var subjOld = aimSubject(camIfc, cells, ENVELOPE, 'raw');
var dRoofOld = Math.hypot(subjOld.x - 8, subjOld.y - 0, subjOld.z - 6.1);
var dHallOld = Math.hypot(subjOld.x - 22, subjOld.y - 0, subjOld.z - 4);
var pickedRoofOld = dRoofOld < dHallOld;
console.log('§W-AIM-DENSITY-CONTROL (raw, the shipped bug) subject=(' + subjOld.x.toFixed(2) + ',' +
  subjOld.y.toFixed(2) + ',' + subjOld.z.toFixed(2) + ') distToRoof=' + dRoofOld.toFixed(2) +
  'm distToHall=' + dHallOld.toFixed(2) + 'm' +
  (pickedRoofOld ? '  PICKED ROOF (near, flat — reproduces "faces the ceiling")' : '  picked hall — bug did not reproduce, scenario needs revisiting'));
if (!pickedRoofOld) { RED++; console.log('§W-AIM-DENSITY-CONTROL FAIL — control scenario does not reproduce the reported bug, fix below is unverified'); }

// W2 — FIX PART 1: with the zSpan filter, the flat roof cell is excluded; the subject must move
// toward the hall, away from where the raw formula put it.
measured++;
var subjNew = aimSubject(camIfc, cells, ENVELOPE, 'zspan');
if (!subjNew) { RED++; console.log('§W-AIM-DENSITY-FIXED FAIL — no candidate subject at all once roof cells are excluded'); }
else {
  var dRoofNew = Math.hypot(subjNew.x - 8, subjNew.y - 0, subjNew.z - 6.1);
  var dHallNew = Math.hypot(subjNew.x - 22, subjNew.y - 0, subjNew.z - 4);
  var movedTowardHall = dHallNew < dHallOld;
  console.log('§W-AIM-DENSITY-FIXED (zSpan-filtered) subject=(' + subjNew.x.toFixed(2) + ',' +
    subjNew.y.toFixed(2) + ',' + subjNew.z.toFixed(2) + ') distToRoof=' + dRoofNew.toFixed(2) +
    'm distToHall=' + dHallNew.toFixed(2) + 'm' +
    (movedTowardHall ? '  MOVED TOWARD HALL (fixed)' : '  did not move toward hall — filter had no effect'));
  if (!movedTowardHall) { RED++; }
}

// W3 — HONEST SCOPE CHECK: two genuinely vertical cells (both pass the zSpan filter), one near, one
// far — the fix must NOT claim to solve this; the near one is expected to still win (candidate 2's
// job, not this fix's). Reuses the same near-wall/far-wall shape as tests/test_aim_depth.js.
measured++;
var pts2 = [];
for (var lz = 0; lz <= 3; lz += 0.3) for (var ly = -2; ly <= 2; ly += 0.3) pts2.push([3, ly, lz]);   // near wall, tall
for (var fz = 0; fz <= 3; fz += 0.3) for (var fy = -2; fy <= 2; fy += 0.3) pts2.push([20, fy, fz]);  // far wall, tall
var cells2 = buildGrid(pts2, ENVELOPE);
var subj2 = aimSubject({ x: 0, y: 0, z: 1.5 }, cells2, ENVELOPE, 'zspan');
var dNear2 = Math.hypot(subj2.x - 3, subj2.y - 0, subj2.z - 1.5);
var dFar2 = Math.hypot(subj2.x - 20, subj2.y - 0, subj2.z - 1.5);
console.log('§W-AIM-DENSITY-SCOPE (two real walls, near vs far — zSpan filter does not apply to either) ' +
  'subject=(' + subj2.x.toFixed(2) + ',' + subj2.y.toFixed(2) + ',' + subj2.z.toFixed(2) + ')' +
  ' distToNear=' + dNear2.toFixed(2) + 'm distToFar=' + dFar2.toFixed(2) + 'm' +
  (dNear2 < dFar2 ? '  still picks NEAR wall — CONFIRMS this fix does not touch near-vs-far (candidate 2 still open)' : '  picked far wall — unexpected, re-check the claim above'));
// not scored RED either way — this is a scope statement, not a pass/fail gate on THIS fix

// ── W4/W5 — Terminal's own report: a SLOPED roof/truss cluster (enough height variance to PASS the
// zSpan filter — a real truss is not perfectly flat) vs. a genuine hall at eye level, further away.
// This is the case zSpan alone cannot catch; only the eye-level bias can.
var camIfc3 = { x: 0, y: 0, z: 6 };
var pts3 = [];
// Sloped truss cluster: near (8m), dense, centred ~z=13.5 (7.5m above the camera's eye height) — well
// overhead — but spans z=12.0..14.9 (zSpan=2.9m), ABOVE minZSpan(2.25m for this envelope), so it
// passes the flat-cell filter and must be handled by the eye-level term instead.
for (var tx = 6; tx <= 10; tx += 0.4) for (var ty = -4; ty <= 4; ty += 0.4) for (var tz = 12.0; tz <= 14.9; tz += 1.45) pts3.push([tx, ty, tz]);
// Genuine hall: 22m away, sparser, spans floor-to-ceiling (0..8m) — its average height (~4m) is close
// to the camera's own eye level (6m).
for (var hz3 = 0; hz3 <= 8; hz3 += 0.5) for (var hy3 = -5; hy3 <= 5; hy3 += 0.8) pts3.push([22, hy3, hz3]);
var cells3 = buildGrid(pts3, ENVELOPE);
var trussCells = cells3.filter(function (c) { return c.x < 15; });
console.log('§CPE_AIM_DENSITY_EYE_WITNESS trussCells=' + trussCells.length +
  ' zSpan~' + (trussCells[0] ? trussCells[0].zSpan.toFixed(2) : '?') +
  'm (must be >= minZSpan to prove this is the zSpan-passes case) camEyeZ=' + camIfc3.z);

measured++;
var subjZspanOnly = aimSubject(camIfc3, cells3, ENVELOPE, 'zspan');
var dTrussA = Math.hypot(subjZspanOnly.x - 8, subjZspanOnly.y - 0, subjZspanOnly.z - 13.5);
var dHallA = Math.hypot(subjZspanOnly.x - 22, subjZspanOnly.y - 0, subjZspanOnly.z - 4);
var pickedTrussA = dTrussA < dHallA;
console.log('§W-AIM-DENSITY-EYE-CONTROL (zSpan-filter only, no eye bias) subject=(' + subjZspanOnly.x.toFixed(2) +
  ',' + subjZspanOnly.y.toFixed(2) + ',' + subjZspanOnly.z.toFixed(2) + ') distToTruss=' + dTrussA.toFixed(2) +
  'm distToHall=' + dHallA.toFixed(2) + 'm' +
  (pickedTrussA ? '  PICKED TRUSS (zSpan filter alone does not catch this — matches Terminal report)' : '  picked hall — zSpan alone was already enough here'));
if (!pickedTrussA) { RED++; console.log('§W-AIM-DENSITY-EYE-CONTROL FAIL — scenario does not reproduce the zSpan-insufficient case, fix below is unverified'); }

measured++;
var subjEye = aimSubject(camIfc3, cells3, ENVELOPE, 'eye');
var dTrussB = Math.hypot(subjEye.x - 8, subjEye.y - 0, subjEye.z - 13.5);
var dHallB = Math.hypot(subjEye.x - 22, subjEye.y - 0, subjEye.z - 4);
var movedTowardHallEye = dHallB < dHallA;
console.log('§W-AIM-DENSITY-EYE-FIXED (zSpan + eye-level bias) subject=(' + subjEye.x.toFixed(2) + ',' +
  subjEye.y.toFixed(2) + ',' + subjEye.z.toFixed(2) + ') distToTruss=' + dTrussB.toFixed(2) +
  'm distToHall=' + dHallB.toFixed(2) + 'm' +
  (movedTowardHallEye ? '  MOVED TOWARD HALL (fixed)' : '  did not move toward hall — eye bias had no effect'));
if (!movedTowardHallEye) { RED++; }

console.log('§VERDICT ' + (RED ? 'RED' : 'GREEN') + ' — ' + RED + ' of ' + measured +
  ' witnesses violated. See bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_AIM_DEPTH_BUILDUP.');
process.exit(RED ? 1 : 0);
