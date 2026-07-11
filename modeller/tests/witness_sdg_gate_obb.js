#!/usr/bin/env node
/**
 * W-SDG-OBB — §OBB narrow-phase witness (PURE NODE, REAL SampleHouse/Terminal/Hospital data).
 * CLASH_GATE_OBB_NARROWPHASE.md §2/§3: the RED/ORANGE gate's clash test upgraded from AABB-only to a two-phase
 * broad(AABB)/narrow(OBB-OBB Separating Axis Theorem, 15 candidate axes) collision test. Each case names the
 * issue it proves:
 *
 *   W1 known-answer FP    — axis-aligned cube vs 45°-rotated cube placed diagonally: AABBs overlap (pen 0.214m,
 *                           the OLD gate's false positive) but the real OBBs are disjoint → SAT returns 0.
 *                           Numbers verified by hand (see inline derivation).
 *   W2 REAL-data FP fixed — the two genuinely non-90°-rotated SampleHouse elements (IfcFurniture, rotZ≈+37°/−35°,
 *                           LOCAL half-extents measured from base_geometries) placed so their world AABBs
 *                           interpenetrate > CLASH_TOL but their real OBBs are disjoint. evaluate() WITHOUT
 *                           opts.obb (= the old AABB-only gate, byte-identical path) flags RED clash; WITH
 *                           opts.obb the same edit is correctly CLEAR.
 *   W3 rotation-0 exact   — for real unrotated SampleHouse elements, obbPenetration ≡ penetration to 1e-12
 *                           (why the 11/11 axis-aligned regression holds structurally, not by luck).
 *   W4 data-landmine lock — element_transforms bbox_x/y/z is the WORLD-AABB full extent and rotation is RADIANS:
 *                           re-project the −90° wall's and the 37° furniture's LOCAL box through obbAxes() and
 *                           reproduce the stored bbox_x/y/z to <1mm. (The dw-rot-units landmine, now an assertion.)
 *   W5 cross-axes load-bearing — a pair separable ONLY by an A_i×B_j cross-product axis: all 6 face axes overlap,
 *                           full 15-axis SAT separates. Proves the 9 cross axes are not decorative.
 *   W6 parallel-edge epsilon — identically-rotated pair (all 9 cross products near-zero): no NaN, exact analytic
 *                           depth; plus a π-vs-0 anti-parallel pair ≡ AABB result. (Ericson §4.4.1 pitfall.)
 *   W7 true depth         — penetrating rotated pair: AABB claims 0.914m, real OBB minimum-translation depth is
 *                           0.293m (hand-derived) — the gate now reports the honest depth.
 *   W8 PERF               — Terminal_ARC.db (35,552 elements) + Hospital_ARC.db (14,409): full broad-phase
 *                           census of AABB-overlapping pairs, then measured SAT cost over all of them + the
 *                           rotated-pair subset. Reports real ns/pair and the implied cost per gate call.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var SdgGate = require(path.join(ROOT, 'sdg_gate.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }

function obbOf(h, r) { return { h: h, axes: SdgGate.obbAxes(r), rotated: !!(r[0] || r[1] || r[2]) }; }
// world AABB of an OBB at centre c: c_k ± Σ_i h_i·|axis_i·e_k| — the same projection the IFC extractor's stored
// bbox_x/y/z satisfies (verified in W4), so these constructed AABBs are exactly what a real fold would hand the gate.
function obbAabb(c, o) {
  var out = [];
  for (var k = 0; k < 3; k++) {
    var r = 0; for (var i = 0; i < 3; i++) r += o.h[i] * Math.abs(o.axes[i][k]);
    out.push(c[k] - r, c[k] + r);
  }
  return [out[0], out[1], out[2], out[3], out[4], out[5]];
}

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  console.log('═══ W-SDG-OBB — §OBB SAT narrow phase (node, REAL SampleHouse/Terminal/Hospital data) ═══');

  // ── W1: known-answer false positive (hand-derived) ──────────────────────────────────────────────
  // A: unit-cube h=(1,1,1) unrotated at origin. B: same cube rotated 45° about Z, centre (2.2, 2.2, 0).
  // B's world AABB half-extent in x,y = √2 ≈ 1.4142 → AABB x-overlap = 1 − (2.2−1.4142) = 0.2142 (> tol) — the
  // AABB-only gate calls this a clash. Real separating axis = B's local x (u = (√2/2, √2/2, 0)):
  // dist = |d·u| = 4.4·0.70711 = 3.1113;  ra = 1·|A0·u| + 1·|A1·u| = 1.4142;  rb = 1 → ra+rb = 2.4142 < 3.1113 ⇒ disjoint.
  var A1o = obbOf([1, 1, 1], [0, 0, 0]), B1o = obbOf([1, 1, 1], [0, 0, Math.PI / 4]);
  var A1b = obbAabb([0, 0, 0], A1o), B1b = obbAabb([2.2, 2.2, 0], B1o);
  var aabbPen1 = SdgGate.penetration(A1b, B1b), satPen1 = SdgGate.obbPenetration(A1b, A1o, B1b, B1o);
  chk('W1 known-answer: 45° pair — AABB pen ' + aabbPen1.toFixed(4) + 'm (old gate = clash) but SAT = 0 (disjoint)',
    Math.abs(aabbPen1 - 0.2142) < 1e-3 && satPen1 === 0, 'aabb=' + aabbPen1.toFixed(4) + ' sat=' + satPen1);

  // ── real SampleHouse data for W2/W3/W4 ───────────────────────────────────────────────────────────
  var db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'SampleHouse_extracted.db')));
  function localHalf(guid) {   // LOCAL half-extents from the element's OWN base_geometries mesh (f32 verts)
    var gh = db.exec("SELECT geometry_hash FROM element_instances WHERE guid='" + guid + "'")[0].values[0][0];
    var row = db.exec("SELECT vertices, vertex_count FROM base_geometries WHERE geometry_hash='" + gh + "'")[0].values[0];
    var buf = row[0], n = row[1];
    var a = new Float32Array(buf.buffer, buf.byteOffset, n * 3);
    var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (var i = 0; i < a.length; i += 3) for (var k = 0; k < 3; k++) { if (a[i + k] < mn[k]) mn[k] = a[i + k]; if (a[i + k] > mx[k]) mx[k] = a[i + k]; }
    return [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2];
  }
  function etRow(guid) {
    var v = db.exec("SELECT center_x,center_y,center_z,rotation_x,rotation_y,rotation_z,bbox_x,bbox_y,bbox_z FROM element_transforms WHERE guid='" + guid + "'")[0].values[0];
    return { c: [v[0], v[1], v[2]], r: [v[3] || 0, v[4] || 0, v[5] || 0], bbox: [v[6], v[7], v[8]] };
  }
  var G37 = '3cUkl32yn9qRSPvBJVyY1R', G35 = '3cUkl32yn9qRSPvBJVyY48', GW90 = '3cUkl32yn9qRSPvBJVyWx4';
  var e37 = etRow(G37), e35 = etRow(G35), eW = etRow(GW90);
  var h37 = localHalf(G37), h35 = localHalf(G35), hW = localHalf(GW90);

  // ── W4 first (data-landmine lock: everything else builds on these conventions) ──────────────────
  // Re-project each element's measured LOCAL box through obbAxes(rotation radians) → world extent must
  // reproduce the STORED bbox_x/y/z. Proves: bbox = world-AABB FULL extent; rotation = radians; obbAxes
  // mirrors the production rotation the extractor/viewer/fold agree on.
  function worldExt(h, r) {
    var ax = SdgGate.obbAxes(r), out = [];
    for (var k = 0; k < 3; k++) { var s = 0; for (var i = 0; i < 3; i++) s += h[i] * Math.abs(ax[i][k]); out.push(2 * s); }
    return out;
  }
  var wE37 = worldExt(h37, e37.r), wEW = worldExt(hW, eW.r);
  var d37 = Math.max(Math.abs(wE37[0] - e37.bbox[0]), Math.abs(wE37[1] - e37.bbox[1]), Math.abs(wE37[2] - e37.bbox[2]));
  var dW = Math.max(Math.abs(wEW[0] - eW.bbox[0]), Math.abs(wEW[1] - eW.bbox[1]), Math.abs(wEW[2] - eW.bbox[2]));
  chk('W4 data-landmine lock: local box × obbAxes(radians) reproduces stored WORLD bbox_x/y/z — 37° furniture Δ='
    + (d37 * 1000).toFixed(2) + 'mm, −90° wall Δ=' + (dW * 1000).toFixed(2) + 'mm', d37 < 1e-3 && dW < 1e-3,
    'furn=(' + wE37.map(function (x) { return x.toFixed(3); }) + ') vs (' + e37.bbox.map(function (x) { return x.toFixed(3); }) + ')');

  // ── W2: REAL-data false positive fixed, through evaluate() ──────────────────────────────────────
  // The two real non-90° elements. Keep the −35° piece at its MEASURED centre; sweep the +37° piece toward it
  // along fixed compass directions (deterministic order) to the first placement where the world AABBs
  // interpenetrate > 2×CLASH_TOL but the real OBBs are disjoint — the AABB false-positive band this pair
  // genuinely has. Then drive evaluate() both ways on that same edit.
  var o37 = obbOf(h37, e37.r), o35 = obbOf(h35, e35.r);
  var cFix = e35.c.slice();
  var found = null;
  var dirs = []; for (var di = 0; di < 16; di++) dirs.push([Math.cos(di * Math.PI / 8), Math.sin(di * Math.PI / 8), 0]);
  for (var dd = 0; dd < dirs.length && !found; dd++) {
    for (var t = 3.0; t >= 0.3; t -= 0.005) {
      var cTry = [cFix[0] + dirs[dd][0] * t, cFix[1] + dirs[dd][1] * t, cFix[2]];   // same z: full z overlap, planar case
      var bA = obbAabb(cTry, o37), bB = obbAabb(cFix, o35);
      var pAabb = SdgGate.penetration(bA, bB);
      if (pAabb <= 2 * SdgGate.CLASH_TOL) continue;
      var pSat = SdgGate.obbPenetration(bA, o37, bB, o35);
      if (pSat === 0) { found = { dir: dd, t: t, bA: bA, bB: bB, pAabb: pAabb }; }
      break;   // first (deepest-allowed) AABB hit per direction decides; deterministic
    }
  }
  chk('W2a real-data AABB-overlap/OBB-disjoint placement EXISTS for the real ±37°/−35° furniture pair',
    !!found, found ? ('dir=' + found.dir + ' t=' + found.t.toFixed(3) + ' aabbPen=' + found.pAabb.toFixed(4) + 'm') : 'none in sweep');
  if (found) {
    // the edit: fid 101 (the 37° piece) moves from far away to the found spot; fid 102 (−35°) never moves.
    var farB = obbAabb([cFix[0] + 50, cFix[1], cFix[2]], o37);
    var before = { 101: farB, 102: found.bB }, after = { 101: found.bA, 102: found.bB };
    var obbMap = { 101: { h: h37, r: e37.r }, 102: { h: h35, r: e35.r } };
    var gOld = SdgGate.evaluate(before, after, [101], {}, {});                 // no obb = the OLD AABB-only gate path
    var gNew = SdgGate.evaluate(before, after, [101], {}, { obb: obbMap });    // §OBB narrow phase ON
    chk('W2b OLD gate (no obb — byte-identical AABB path) falsely flags RED clash on the real rotated pair',
      gOld.red.length === 1 && gOld.red[0].kind === 'clash', JSON.stringify(gOld.red));
    chk('W2c NEW gate (opts.obb) correctly CLEARS the same edit (real OBBs disjoint)',
      gNew.red.length === 0, 'red=' + JSON.stringify(gNew.red));
  }

  // ── W3: rotation-0 exactness on real unrotated elements ─────────────────────────────────────────
  // Every unrotated SampleHouse element vs a half-extent-shifted copy of itself (guaranteed real overlap):
  // obbPenetration with identity axes must equal penetration EXACTLY (1e-12) — the structural reason the
  // existing 11/11 axis-aligned witness cannot drift under this change.
  var un = db.exec("SELECT guid, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE ABS(rotation_x)<1e-9 AND ABS(rotation_y)<1e-9 AND ABS(rotation_z)<1e-9 AND bbox_x>0 AND bbox_y>0 AND bbox_z>0")[0].values;
  var worst3 = 0, n3 = 0;
  un.forEach(function (v) {
    var h = [v[1] / 2, v[2] / 2, v[3] / 2], o = obbOf(h, [0, 0, 0]);
    var b1 = obbAabb([0, 0, 0], o), b2 = obbAabb([h[0], h[1] / 2, 0], o);   // overlapping offset copy
    var d = Math.abs(SdgGate.penetration(b1, b2) - SdgGate.obbPenetration(b1, o, b2, o));
    if (d > worst3) worst3 = d; n3++;
  });
  chk('W3 rotation-0 exact: SAT ≡ AABB penetration on ' + n3 + ' real unrotated elements (worst Δ=' + worst3.toExponential(2) + ')',
    n3 > 0 && worst3 < 1e-12);

  // ── W5: the 9 cross-product axes are load-bearing ────────────────────────────────────────────────
  // Two long thin rods, each tilted 45° about a DIFFERENT axis, offset diagonally: every one of the 6 face
  // axes still overlaps, only an edge×edge cross axis separates. Face-axis overlaps computed explicitly here
  // (same projection formula) so the witness itself shows the 6-axis test would have MISSED the separation.
  var rodA = obbOf([3, 0.1, 0.1], [Math.PI / 4, 0, 0]);           // long x, rolled 45° about X (rx-only branch: R = Rx)
  var cy = Math.cos(Math.PI / 4), sy = Math.sin(Math.PI / 4);
  var rodB = { h: [0.1, 3, 0.1], axes: [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]], rotated: true };   // long y, pitched 45° about Y (manual Ry(45°) columns — a distinct tilt from A)
  var found5 = null;
  for (var t5 = 3.0; t5 >= 0.05; t5 -= 0.01) {
    var c5 = [t5 * 0.35, 0, t5];                                   // slide B up a skewed diagonal over A
    var b5A = obbAabb([0, 0, 0], rodA), b5B = obbAabb(c5, rodB);
    // 6 face-axis overlaps (unit axes of A and B):
    var faceSeparated = false, allAxes = rodA.axes.concat(rodB.axes);
    for (var f5 = 0; f5 < 6; f5++) {
      var L = allAxes[f5], ra = 0, rb = 0, k5;
      for (k5 = 0; k5 < 3; k5++) ra += rodA.h[k5] * Math.abs(rodA.axes[k5][0] * L[0] + rodA.axes[k5][1] * L[1] + rodA.axes[k5][2] * L[2]);
      for (k5 = 0; k5 < 3; k5++) rb += rodB.h[k5] * Math.abs(rodB.axes[k5][0] * L[0] + rodB.axes[k5][1] * L[1] + rodB.axes[k5][2] * L[2]);
      if (Math.abs(c5[0] * L[0] + c5[1] * L[1] + c5[2] * L[2]) > ra + rb) { faceSeparated = true; break; }
    }
    if (faceSeparated) continue;
    if (SdgGate.obbPenetration(b5A, rodA, b5B, rodB) === 0) { found5 = { c: c5 }; break; }
  }
  chk('W5 cross axes load-bearing: pair separated by an edge×edge axis while ALL 6 face axes overlap',
    !!found5, found5 ? ('B centre=(' + found5.c.map(function (x) { return x.toFixed(3); }) + ')') : 'no such config found');

  // ── W6: parallel-edge epsilon robustness (Ericson §4.4.1) ───────────────────────────────────────
  // Identically 45°-rotated cubes: all 9 cross products ‖A_i×B_j‖ ≈ 0 → every cross axis must be SKIPPED, not
  // divided by ~0. Offset 1.9m along the shared rotated x-axis ⇒ exact depth 2·1 − 1.9 = 0.1m on that axis.
  var q = Math.PI / 4, oP = obbOf([1, 1, 1], [0, 0, q]), oQ = obbOf([1, 1, 1], [0, 0, q]);
  var cQ = [1.9 * Math.cos(q), 1.9 * Math.sin(q), 0];
  var p6 = SdgGate.obbPenetration(obbAabb([0, 0, 0], oP), oP, obbAabb(cQ, oQ), oQ);
  // anti-parallel axes: π-rotated vs unrotated cube — SAT must equal the plain AABB answer exactly
  var oR = obbOf([1, 1, 1], [0, 0, Math.PI]), oS = obbOf([1, 1, 1], [0, 0, 0]);
  var bR = obbAabb([0, 0, 0], oR), bS = obbAabb([1.5, 0.5, 0], oS);
  var p6b = SdgGate.obbPenetration(bR, oR, bS, oS), p6ref = SdgGate.penetration(bR, bS);
  chk('W6 parallel-edge epsilon: co-rotated pair exact depth (=0.1m, no NaN) + π/0 pair ≡ AABB',
    isFinite(p6) && Math.abs(p6 - 0.1) < 1e-9 && Math.abs(p6b - p6ref) < 1e-12,
    'coRot=' + p6.toFixed(6) + ' antiPar=' + p6b.toFixed(6) + ' aabbRef=' + p6ref.toFixed(6));

  // ── W7: honest penetration depth on a genuinely clashing rotated pair (hand-derived) ────────────
  // A: unit cube at origin. B: 45° cube at (1.5, 1.5, 0). AABB pen = 1 + √2 − 1.5 = 0.9142m (x and y equally);
  // real minimum-translation axis = B's local x: 2.4142 − 3·0.70711 = 0.2929m.
  var A7 = obbOf([1, 1, 1], [0, 0, 0]), B7 = obbOf([1, 1, 1], [0, 0, Math.PI / 4]);
  var bA7 = obbAabb([0, 0, 0], A7), bB7 = obbAabb([1.5, 1.5, 0], B7);
  var pen7a = SdgGate.penetration(bA7, bB7), pen7s = SdgGate.obbPenetration(bA7, A7, bB7, B7);
  chk('W7 true depth: AABB claims ' + pen7a.toFixed(4) + 'm, OBB minimum-translation depth = ' + pen7s.toFixed(4) + 'm (analytic 0.2929)',
    Math.abs(pen7a - 0.9142) < 1e-3 && Math.abs(pen7s - 0.29289) < 1e-4);
  db.close();

  // ── W8: PERF at real scale (Terminal 35,552 / Hospital 14,409 elements) ─────────────────────────
  // Broad phase: x-sweep over world AABBs (centre ± bbox/2 — the stored WORLD extent, the exact box the real
  // gate's broad phase sees). Narrow phase timed over EVERY AABB-overlapping pair. h for timing = bbox/2
  // (world extents as local dims — fidelity-neutral for TIMING; the arithmetic cost is identical).
  ['Terminal_ARC.db', 'Hospital_ARC.db'].forEach(function (f) {
    var bdb = new SQL.Database(fs.readFileSync(path.join(ROOT, f)));
    var rows = bdb.exec("SELECT center_x,center_y,center_z,rotation_x,rotation_y,rotation_z,bbox_x,bbox_y,bbox_z FROM element_transforms WHERE bbox_x>0 AND bbox_y>0 AND bbox_z>0 AND center_x IS NOT NULL")[0].values;
    bdb.close();
    var boxes = [], obbs = [], rotFlag = [];
    rows.forEach(function (v) {
      var c = [v[0], v[1], v[2]], r = [v[3] || 0, v[4] || 0, v[5] || 0], h = [v[6] / 2, v[7] / 2, v[8] / 2];
      boxes.push([c[0] - h[0], c[0] + h[0], c[1] - h[1], c[1] + h[1], c[2] - h[2], c[2] + h[2]]);
      obbs.push(obbOf(h, r)); rotFlag.push(!!(r[0] || r[1] || r[2]));
    });
    var idx = boxes.map(function (b, i) { return i; }).sort(function (i, j) { return boxes[i][0] - boxes[j][0]; });
    var pairs = [], t0 = process.hrtime.bigint();
    for (var ii = 0; ii < idx.length; ii++) {
      var a = boxes[idx[ii]];
      for (var jj = ii + 1; jj < idx.length; jj++) {
        var b = boxes[idx[jj]];
        if (b[0] > a[1]) break;                                   // x-sweep prune
        if (a[2] < b[3] && b[2] < a[3] && a[4] < b[5] && b[4] < a[5]) pairs.push([idx[ii], idx[jj]]);
      }
    }
    var tBroad = Number(process.hrtime.bigint() - t0) / 1e6;
    var rotPairs = pairs.filter(function (p) { return rotFlag[p[0]] || rotFlag[p[1]]; });
    var t1 = process.hrtime.bigint(), acc = 0;
    pairs.forEach(function (p) { acc += SdgGate.obbPenetration(boxes[p[0]], obbs[p[0]], boxes[p[1]], obbs[p[1]]); });
    var tSatAll = Number(process.hrtime.bigint() - t1) / 1e6;
    var t2 = process.hrtime.bigint(), acc2 = 0;
    rotPairs.forEach(function (p) { acc2 += SdgGate.obbPenetration(boxes[p[0]], obbs[p[0]], boxes[p[1]], obbs[p[1]]); });
    var tSatRot = Number(process.hrtime.bigint() - t2) / 1e6;
    var t3 = process.hrtime.bigint(), acc3 = 0;
    pairs.forEach(function (p) { acc3 += SdgGate.penetration(boxes[p[0]], boxes[p[1]]); });
    var tAabb = Number(process.hrtime.bigint() - t3) / 1e6;
    console.log('  §PERF ' + f + ' elements=' + rows.length + ' aabbOverlapPairs=' + pairs.length +
      ' (broad ' + tBroad.toFixed(1) + 'ms) rotatedPairs=' + rotPairs.length);
    console.log('  §PERF SAT all pairs: ' + tSatAll.toFixed(1) + 'ms (' + (pairs.length ? (tSatAll * 1e6 / pairs.length).toFixed(0) : 0) + 'ns/pair)' +
      '  SAT rotated-only (the real gate workload): ' + tSatRot.toFixed(2) + 'ms' +
      '  AABB baseline same pairs: ' + tAabb.toFixed(1) + 'ms  [checksums ' + acc.toFixed(2) + '/' + acc2.toFixed(2) + '/' + acc3.toFixed(2) + ']');
    chk('W8 ' + f + ': SAT over ALL ' + pairs.length + ' AABB-overlapping pairs completes in ' + tSatAll.toFixed(1) + 'ms (measured, not assumed)',
      pairs.length > 0 && tSatAll < 5000);
  });

  console.log('W-SDG-OBB: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
