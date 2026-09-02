// ⚠ DO NOT REMOVE — Red Pill RosettaStone GATE maths (G8-GOVERNANCE). RedPillRosetta.md §2/§3/§4.
// REUSE, DON'T FORK: this is the JS port of the Java gate arithmetic so a browser-computed verdict
// is byte-comparable with the Java oracle (the ledger oracle-equivalence pattern, on geometry):
//   - COUNT   = G1 (RosettaStoneGateTest.java:154-170) — per-class element count, exact.
//   - VOLUME  = G2 (:190-203) — Σ AABB volume, |Δ%| ≤ 0.1.
//   - DIGEST  = G3 cross-mode (SpatialDigest.java:168-242, includeGeoHash=false) — per-class
//               "CLASS=x COUNT=n" then "minX|maxX|minY|maxY|minZ|maxZ|rgba" in Math.round(mm),
//               ordered (class, minX,minY,minZ, maxX,maxY,maxZ), sha256 of lines join "\n".
//   - CENTROID = SpatialDiff bands (EyesConstants SPATIAL_EXACT_MM=1.0) — EXACT ≤ 1mm.
//   - GOVERNANCE = the genuinely-new dynamic peer (§4): every delta is BOM-explained.
// NON-INVENT: tolerances recovered from code (see citations); no new numbers here.
// This browser DB carries geometry in element_transforms (center ± bbox/2), NOT elements_rtree —
// the AABB is reconstructed center±bbox/2 (Java reads rtree min/max directly; same AABB, same maths).
'use strict';
var crypto = require('crypto');

var SPATIAL_EXACT_MM = 1.0;   // EyesConstants.java:39 (Q2 — governed-delta + centroid tol)
var VOLUME_BAND_PCT  = 0.1;   // RosettaStoneGateTest.java:200 (G2)

// AABB rows from the browser schema: one per PLACED element (element_transforms ⋈ elements_meta).
// Returns {guid, cls, rgba, minX,maxX,minY,maxY,minZ,maxZ, cx,cy,cz} in metres.
function aabbRows(db) {
  var r = db.exec(
    "SELECT t.guid, COALESCE(m.ifc_class,''), COALESCE(m.material_rgba,''), " +
    "t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
    "FROM element_transforms t LEFT JOIN elements_meta m ON t.guid = m.guid");
  if (!r.length) return [];
  return r[0].values.map(function (v) {
    var cx = v[3] || 0, cy = v[4] || 0, cz = v[5] || 0;
    var hx = (v[6] || 0) / 2, hy = (v[7] || 0) / 2, hz = (v[8] || 0) / 2;
    return { guid: v[0], cls: v[1], rgba: v[2],
      cx: cx, cy: cy, cz: cz,
      minX: cx - hx, maxX: cx + hx, minY: cy - hy, maxY: cy + hy, minZ: cz - hz, maxZ: cz + hz };
  });
}

function mm(x) { return Math.round(x * 1000); }   // Java Math.round — half toward +∞, JS identical

// G1 — per-class count map.
function classCounts(rows) {
  var m = {}; for (var i = 0; i < rows.length; i++) m[rows[i].cls] = (m[rows[i].cls] || 0) + 1; return m;
}

// G2 — Σ AABB volume (m³).
function totalVolume(rows) {
  var v = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    v += (r.maxX - r.minX) * (r.maxY - r.minY) * (r.maxZ - r.minZ);
  }
  return v;
}
function volumeDeltaPct(refVol, outVol) { return refVol > 0 ? ((outVol - refVol) / refVol) * 100.0 : 0.0; }

// G3 cross-mode — the SpatialDigest line format, sha256 hex. Byte-comparable with the Java oracle.
function digest(rows) {
  var sorted = rows.slice().sort(function (a, b) {
    if (a.cls !== b.cls) return a.cls < b.cls ? -1 : 1;
    var ks = ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'];
    for (var k = 0; k < ks.length; k++) { var d = mm(a[ks[k]]) - mm(b[ks[k]]); if (d) return d; }
    return 0;
  });
  var lines = [], cur = null, cnt = 0, coords = [];
  function flush() { if (cur !== null) { lines.push('CLASS=' + cur + ' COUNT=' + cnt); for (var j = 0; j < coords.length; j++) lines.push(coords[j]); } }
  for (var i = 0; i < sorted.length; i++) {
    var r = sorted[i];
    if (r.cls !== cur) { flush(); cur = r.cls; cnt = 0; coords = []; }
    cnt++;
    coords.push(mm(r.minX) + '|' + mm(r.maxX) + '|' + mm(r.minY) + '|' + mm(r.maxY) + '|' + mm(r.minZ) + '|' + mm(r.maxZ) + '|' + r.rgba);
  }
  flush();
  return crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

// ── Mode 1: identity round-trip (§3) ───────────────────────────────────────────
// ref = reference AABBs; out = materialized-output AABBs (in-session, F8/F9: NewIFC.db is P5 —
// swapping `out` for the materialized file is a one-line change of comparand). PASS iff
// per-class counts equal, |Δvol%| ≤ 0.1, digests equal, every centroid EXACT (≤1mm).
function identityGate(refRows, outRows, opts) {
  opts = opts || {};
  var rc = classCounts(refRows), oc = classCounts(outRows);
  var allCls = {}; Object.keys(rc).forEach(function (c) { allCls[c] = 1; }); Object.keys(oc).forEach(function (c) { allCls[c] = 1; });
  var countOk = true, countDetail = [];
  Object.keys(allCls).sort().forEach(function (c) {
    var a = rc[c] || 0, b = oc[c] || 0; if (a !== b) { countOk = false; countDetail.push(c + ' ref=' + a + ' out=' + b); }
  });
  var refVol = totalVolume(refRows), outVol = totalVolume(outRows);
  var dPct = volumeDeltaPct(refVol, outVol);
  var volOk = Math.abs(dPct) <= VOLUME_BAND_PCT;
  var dMatch = digest(refRows) === digest(outRows);
  // centroid: max |out-ref| over matched guids (mm)
  var refByGuid = {}; refRows.forEach(function (r) { refByGuid[r.guid] = r; });
  var centroidMaxMm = 0, missing = 0;
  outRows.forEach(function (o) {
    var rr = refByGuid[o.guid]; if (!rr) { missing++; return; }
    var dx = Math.abs(o.cx - rr.cx), dy = Math.abs(o.cy - rr.cy), dz = Math.abs(o.cz - rr.cz);
    centroidMaxMm = Math.max(centroidMaxMm, dx * 1000, dy * 1000, dz * 1000);
  });
  var centroidOk = centroidMaxMm <= SPATIAL_EXACT_MM;
  var pass = countOk && volOk && dMatch && centroidOk;
  return { mode: 'identity', pass: pass, countOk: countOk, countDetail: countDetail,
    refCount: refRows.length, outCount: outRows.length,
    volDeltaPct: dPct, volOk: volOk, digestMatch: dMatch, refDigest: digest(refRows), outDigest: digest(outRows),
    centroidMaxMm: centroidMaxMm, centroidOk: centroidOk, missing: missing, excludedMeta: opts.excludedMeta || 0 };
}

// ── Mode 2: governed-delta (§4) ────────────────────────────────────────────────
// predictor P(BOM, grid′): independent of the actual post-drag positions it judges.
//   A `bound` element (its BOM line is attached to the dragged grid) rides the grid translation
//   → predicted center = pre + gridDelta. An unbound element is predicted STATIC (= pre).
// The predictor reads ONLY (binding, gridDelta) — never the post-drag DB (the no-peeking rule §4.1).
// classify each PLACED element:
//   GOVERNED   : bound,   |predicted-actual| ≤ tol
//   STATIC     : unbound, actual == pre  (≤ tol)  — catches bulk-translation (the 111 regression)
//   UNGOVERNED : unbound, but actual moved > tol with no prediction        → FAIL
//   PREDICT_MISS: bound,  but |predicted-actual| > tol                     → FAIL
function predict(pre, bound, gridDelta) {
  return bound
    ? { cx: pre.cx + (gridDelta.x || 0), cy: pre.cy + (gridDelta.y || 0), cz: pre.cz + (gridDelta.z || 0) }
    : { cx: pre.cx, cy: pre.cy, cz: pre.cz };
}
function maxAxisMm(a, b) { return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy), Math.abs(a.cz - b.cz)) * 1000; }

// preRows/postRows: aabbRows() before & after the drag. boundSet: {guid:true} = BOM-attached to the
// dragged grid (built from buildBomAttachMap — proximity never enters). gridDelta: the drag input.
function governedDeltaGate(preRows, postRows, boundSet, gridDelta, tolMm) {
  tolMm = tolMm || SPATIAL_EXACT_MM;
  var preByGuid = {}; preRows.forEach(function (r) { preByGuid[r.guid] = r; });
  var governed = 0, staticOk = 0, ungoverned = 0, predictMiss = 0;
  var offenders = [], centroidMaxMm = 0;
  postRows.forEach(function (post) {
    var pre = preByGuid[post.guid]; if (!pre) return;   // appeared element — out of identity scope
    var bound = !!boundSet[post.guid];
    var movedMm = maxAxisMm(post, pre);
    var p = predict(pre, bound, gridDelta);
    var missMm = maxAxisMm(post, p);
    if (bound) {
      if (missMm <= tolMm) { governed++; centroidMaxMm = Math.max(centroidMaxMm, missMm); }
      else { predictMiss++; offenders.push({ guid: post.guid, cls: post.cls, reason: 'PREDICT_MISS',
        predicted: p, actual: { cx: post.cx, cy: post.cy, cz: post.cz }, dmaxMm: missMm }); }
    } else {
      if (movedMm <= tolMm) staticOk++;
      else { ungoverned++; offenders.push({ guid: post.guid, cls: post.cls, reason: 'UNGOVERNED',
        movedMm: movedMm }); }
    }
  });
  var unexplained = ungoverned + predictMiss;   // every delta that is NOT BOM-explained
  return { mode: 'delta', pass: unexplained === 0, governed: governed, staticOk: staticOk,
    ungoverned: ungoverned, predictMiss: predictMiss, unexplained: unexplained,
    offenders: offenders, centroidMaxMm: centroidMaxMm,
    boundTotal: Object.keys(boundSet).length };
}

module.exports = {
  SPATIAL_EXACT_MM: SPATIAL_EXACT_MM, VOLUME_BAND_PCT: VOLUME_BAND_PCT,
  aabbRows: aabbRows, classCounts: classCounts, totalVolume: totalVolume, volumeDeltaPct: volumeDeltaPct,
  digest: digest, predict: predict, identityGate: identityGate, governedDeltaGate: governedDeltaGate
};
