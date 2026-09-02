#!/usr/bin/env node
/* ⚠ WITNESS — §CPE_AIM_DEPTH (2026-07-31). Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md
 * §CPE_AIM_DEPTH. User directive: "if it is flying into area with a floor, a left side wall and
 * front wall, it turns to face which is further" ... "if near a wall along a corridor it wont face
 * dense fleeting but look to a more distance facade."
 *
 * NAMES THE ISSUE: does the subject-selection formula (weighted centroid, weight = count * distance,
 * over cells BEYOND the close-exclusion radius) actually prefer a further facade over a closer, denser
 * one? A formula that just picked the single densest nearby cell would fail this — it would face the
 * close corridor wall it's about to whip past, exactly what the user said NOT to do.
 *
 * Pure-math replica of _aimGrid/_aimDepthWeight/_aimDepthSubject from viewer/effects.js (same
 * whitebox convention as tests/test_host_order.js) — synthetic point cloud, no browser/THREE needed;
 * the formula itself is pure arithmetic over element centroids.
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
function softDensity(pIfc, pts, R) {
  var R2 = R * R, acc = 0;
  for (var i = 0; i < pts.length; i++) {
    var dx = pts[i][0] - pIfc.x, dy = pts[i][1] - pIfc.y, dz = pts[i][2] - pIfc.z;
    var u = (dx * dx + dy * dy + dz * dz) / R2;
    if (u >= 1) continue;
    var g = 1 - u; acc += g * g;
  }
  return acc;
}
function aimDepthWeight(pIfc, pts, envelope, CLOSE_FRAC, DENS_FLOOR) {
  var Rclose = Math.max(1.5, envelope * CLOSE_FRAC);
  var dens = softDensity(pIfc, pts, Rclose);
  return { w: cinemaSmoothstep(Math.min(1, dens / DENS_FLOOR)), dens: dens, R: Rclose };
}
function aimDepthSubject(pIfc, cells, Rclose, envelope, SEARCH_FRAC) {
  var Rsearch = Math.max(Rclose * 2, envelope * SEARCH_FRAC);
  var minZSpan = Math.max(2, envelope / 8) * 0.3;
  var sx = 0, sy = 0, sz = 0, sw = 0;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    if (c.zSpan < minZSpan) continue;          // floor/ceiling-like — not a facade
    var d = Math.hypot(c.x - pIfc.x, c.y - pIfc.y, c.z - pIfc.z);
    if (d <= Rclose || d > Rsearch) continue;
    var w = c.n * d;
    sx += c.x * w; sy += c.y * w; sz += c.z * w; sw += w;
  }
  if (sw <= 1e-9) return null;
  return { x: sx / sw, y: sy / sw, z: sz / sw };
}

// ── Scenario: the user's own example — floor + left wall (CLOSE) + front wall (FURTHER) ──────────
// Camera at origin, standing in a corridor-like corner. envelope = building scale (Duplex-ish, 15m).
var ENVELOPE = 15;
var CLOSE_FRAC = 0.05, SEARCH_FRAC = 0.30, DENS_FLOOR = 10;
var camIfc = { x: 0, y: 0, z: 1.5 };   // eye height

var pts = [];
// Floor: a broad slab right under the camera, z=0, dense.
for (var fx = -3; fx <= 3; fx += 0.5) for (var fy = -3; fy <= 3; fy += 0.5) pts.push([fx, fy, 0]);
// LEFT wall: CLOSE (0.8m away, well inside the close-exclusion radius) — the "fleeting" one, made
// DENSER than the front wall on purpose, so a naive "pick the densest nearby cell" would choose it.
for (var lz = 0; lz <= 3; lz += 0.3) for (var ly = -2; ly <= 2; ly += 0.3) pts.push([-0.8, ly, lz]);
// FRONT wall: FURTHER (4m away, well inside the search bubble but clearly further than the left
// wall) — the one the user says the camera SHOULD face.
for (var fz = 0; fz <= 3; fz += 0.3) for (var fy2 = -2; fy2 <= 2; fy2 += 0.3) pts.push([4, fy2, fz]);

var cells = buildGrid(pts, ENVELOPE);
var A0 = aimDepthWeight(camIfc, pts, ENVELOPE, CLOSE_FRAC, DENS_FLOOR);
console.log('§CPE_AIM_DEPTH_WITNESS pts=' + pts.length + ' cells=' + cells.length +
  ' envelope=' + ENVELOPE + ' Rclose=' + A0.R.toFixed(2) + 'm dens@close=' + A0.dens.toFixed(1) +
  ' floor=' + DENS_FLOOR + ' trigger_w=' + A0.w.toFixed(2));

var trigger = A0.w > 0.5;
var subj = trigger ? aimDepthSubject(camIfc, cells, A0.R, ENVELOPE, SEARCH_FRAC) : null;

var RED = 0, measured = 0;

measured++;
if (!trigger) { RED++; console.log('§W-AIM-DEPTH-TRIGGER FAIL — expected boxed-in trigger to fire (w>0.5), got ' + A0.w.toFixed(3)); }
else console.log('§W-AIM-DEPTH-TRIGGER OK — boxed-in trigger fired, w=' + A0.w.toFixed(3));

measured++;
if (!subj) { RED++; console.log('§W-AIM-DEPTH-SUBJECT FAIL — no candidate facade found in the search bubble'); }
else {
  var distToLeft = Math.hypot(subj.x - (-0.8), subj.y - 0, subj.z - 1.5);
  var distToFront = Math.hypot(subj.x - 4, subj.y - 0, subj.z - 1.5);
  var pickedFront = distToFront < distToLeft;
  console.log('§W-AIM-DEPTH-SUBJECT subject=(' + subj.x.toFixed(2) + ',' + subj.y.toFixed(2) + ',' +
    subj.z.toFixed(2) + ') distToLeftWall=' + distToLeft.toFixed(2) + 'm distToFrontWall=' + distToFront.toFixed(2) + 'm' +
    (pickedFront ? '  PICKED FRONT (further, correct)' : '  PICKED LEFT (closer, WRONG — the exact bug the user named)'));
  if (!pickedFront) { RED++; }
}

// Control: with the close-wall exclusion DISABLED (Rclose=0), does the naive "nearest dense cell"
// version actually pick the close wall? Proves the exclusion is load-bearing, not a no-op.
measured++;
var subjNoExclude = aimDepthSubject(camIfc, cells, 0, ENVELOPE, SEARCH_FRAC);
if (subjNoExclude) {
  var dLeft2 = Math.hypot(subjNoExclude.x - (-0.8), subjNoExclude.y - 0, subjNoExclude.z - 1.5);
  var dFront2 = Math.hypot(subjNoExclude.x - 4, subjNoExclude.y - 0, subjNoExclude.z - 1.5);
  console.log('§W-AIM-DEPTH-CONTROL (Rclose=0, no exclusion) subject=(' + subjNoExclude.x.toFixed(2) + ',' +
    subjNoExclude.y.toFixed(2) + ',' + subjNoExclude.z.toFixed(2) + ') distToLeft=' + dLeft2.toFixed(2) +
    ' distToFront=' + dFront2.toFixed(2) +
    (dLeft2 < dFront2 ? '  closer to LEFT — confirms exclusion is necessary' : '  still further-leaning even unexcluded'));
}

console.log('§VERDICT ' + (RED ? 'RED' : 'GREEN') + ' — ' + RED + ' of ' + measured +
  ' witnesses violated. See bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_AIM_DEPTH.');
process.exit(RED ? 1 : 0);
