/**
 * BIM OOTB — Cross-Edges (the typed SPATIAL DEPENDENCY GRAPH, derived on-the-fly in the Modeller).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * SPATIAL_DEPENDENCY_GRAPH.md §ABUTS — the typed LATERAL edges over the bom-graph containment backbone.
 * The bom-graph tab (PR #539) shipped the TREE half (Building→Storey→Room→element). This is the GRAPH
 * half: the typed cross-edges, DERIVED AT RUNTIME from the pristine bbox substrate (element_transforms),
 * NOT baked into the DB — the modeller's residents stay pristine (containment + spatial_structure only).
 *
 * This slice ships the FIRST cross-edge: `abuts` (face-touch adjacency). It is a faithful JS port of the
 * witnessed Python `_face_touch` + `derive_adjacency` (extractIFCtoDB.py, W-SDG-ABUTS 16/16) — same tol,
 * same min-overlap, same touch-axis rule, same unordered de-dup. NON-INVENT: every edge is a MEASURED
 * shared-face contact (provenance 'derived:face-touch'); NO proximity radius, NO IFC class names (grep-clean).
 *
 * AABB convention (scripts/backfill_bbox.py): element_transforms.bbox_k = FULL extent (maxK-minK),
 * center_k = (minK+maxK)/2 → minK = center_k - bbox_k/2, maxK = center_k + bbox_k/2.
 *
 * Scale: sweep-and-prune on X (sort by minX, active window pruned by maxX) → near-linear on the 48k
 * Terminal substrate, replacing the Python rtree candidate query. Pure over the DB (node-witnessable).
 */
(function (window) {
  'use strict';
  var TOL = 0.03, MIN_OVERLAP = 0.02;   // metres — identical to the Python defaults (W-SDG-ABUTS)

  // Is the AABB pair (a,b) a FACE-TOUCH? Returns {axis, gap_m, contact_m2} or null. Exact port of the
  // witnessed Python _face_touch — references NO IFC class. a,b = [minX,maxX,minY,maxY,minZ,maxZ].
  function faceTouch(a, b, tol, minOverlap) {
    var ov = [];                          // signed overlap per axis: >0 interpenetrate, =0 touch, <0 gap
    for (var k = 0; k < 3; k++) {
      var lo = Math.max(a[2 * k], b[2 * k]);
      var hi = Math.min(a[2 * k + 1], b[2 * k + 1]);
      ov.push(hi - lo);
    }
    // touch axis = the axis whose |overlap| is smallest (the back-to-back face)
    var axis = 0;
    for (var i = 1; i < 3; i++) if (Math.abs(ov[i]) < Math.abs(ov[axis])) axis = i;
    if (Math.abs(ov[axis]) > tol) return null;       // faces not within tol on closest axis → not adjacent
    var o0 = axis === 0 ? 1 : 0, o1 = axis === 2 ? 1 : 2;
    if (ov[o0] < minOverlap || ov[o1] < minOverlap) return null;   // corner/edge graze → not a face-touch
    return { axis: 'XYZ'[axis], gap_m: Math.abs(ov[axis]), contact_m2: ov[o0] * ov[o1] };
  }

  // Read the pristine bboxes from element_transforms → [{guid, aabb}]. AABB = center ± bbox/2.
  function _readBoxes(db) {
    var boxes = [];
    try {
      var r = db.exec("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z " +
                      "FROM element_transforms WHERE bbox_x IS NOT NULL");
      if (r.length) r[0].values.forEach(function (v) {
        var cx = v[1], cy = v[2], cz = v[3], bx = v[4], by = v[5], bz = v[6];
        boxes.push({ guid: v[0], aabb: [cx - bx / 2, cx + bx / 2, cy - by / 2, cy + by / 2, cz - bz / 2, cz + bz / 2] });
      });
    } catch (e) { /* no element_transforms / no bbox → no geometric edges (graceful) */ }
    return boxes;
  }

  // §ABUTS — derive the `abuts` edge set from MEASURED face-touch over the bbox substrate.
  // Returns sorted unique edges: {a, b (guids, a<b), axis, gap_mm, contact_m2, provenance}.
  function deriveAdjacency(db, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : TOL, minOv = opts.minOverlap != null ? opts.minOverlap : MIN_OVERLAP;
    var boxes = _readBoxes(db);
    // sweep-and-prune on X: sort by minX, keep an active window of boxes whose maxX still reaches the cursor.
    boxes.sort(function (p, q) { return p.aabb[0] - q.aabb[0]; });
    var edges = [], active = [];
    for (var i = 0; i < boxes.length; i++) {
      var e = boxes[i], aMinX = e.aabb[0];
      // drop boxes that can no longer touch e on X (maxX < e.minX - tol)
      var keep = [];
      for (var j = 0; j < active.length; j++) if (active[j].aabb[1] >= aMinX - tol) keep.push(active[j]);
      active = keep;
      for (var k = 0; k < active.length; k++) {
        var o = active[k];
        if (o.guid === e.guid) continue;
        var ft = faceTouch(e.aabb, o.aabb, tol, minOv);
        if (!ft) continue;
        var lo = e.guid < o.guid ? e.guid : o.guid, hi = e.guid < o.guid ? o.guid : e.guid;
        edges.push({ a: lo, b: hi, axis: ft.axis,
          gap_mm: Math.round(ft.gap_m * 1000 * 1000) / 1000,
          contact_m2: Math.round(ft.contact_m2 * 1e6) / 1e6, provenance: 'derived:face-touch' });
      }
      active.push(e);
    }
    // de-dup unordered pairs (a box can re-meet a neighbour across the sweep only once here, but keep the guard)
    var seen = {}, uniq = [];
    for (var m = 0; m < edges.length; m++) {
      var key = edges[m].a + '|' + edges[m].b;
      if (seen[key]) continue;
      seen[key] = 1; uniq.push(edges[m]);
    }
    return uniq;
  }

  // ── §ANCHORED + §SPANS — the GRID cross-edges, JS-derived on-the-fly (user fork 2026-06-26 = JS-derive,
  //    not the baked tables). Faithful ports of extractIFCtoDB.derive_datums_and_anchors + derive_spans
  //    (W-SDG-ANCHORED / W-SDG-SPANS) over the SAME pristine AABBs (element_transforms center±bbox/2). A datum
  //    EMERGES where ≥min_support distinct element faces align within tol — never a recovered IfcGrid. These are
  //    element↔DATUM edges (not element↔element), so the adjacency lens reads them as per-element annotations.
  function _round(x, p) { var m = Math.pow(10, p); return Math.round(x * m) / m; }

  // Port of derive_datums_and_anchors(tol=0.05, min_support=3). Returns {datums, anchored}. datum_id is a
  // GLOBAL running counter in axis order X→Y→Z (matches the Python → datum ids line up with the baked table).
  function deriveDatumsAnchored(db, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : 0.05, minSupport = opts.minSupport != null ? opts.minSupport : 3;
    var boxes = _readBoxes(db);
    var byGuid = {}; boxes.forEach(function (e) { byGuid[e.guid] = e.aabb; });
    var datums = [], anchored = [], datumId = 0;
    for (var ax = 0; ax < 3; ax++) {
      var cand = [];
      boxes.forEach(function (e) { cand.push([e.aabb[2 * ax], e.guid]); cand.push([e.aabb[2 * ax + 1], e.guid]); });
      // Sort by (coord, guid) — EXACTLY the Python tuple sort — so the cluster-mean float SUMMATION ORDER is
      // identical (float + is non-associative; on big clusters a coord-only sort drifts the mean a sub-micron,
      // flipping the 3rd-decimal mm offset). This makes anchored offsets bit-for-bit equal to the oracle.
      cand.sort(function (p, q) { return p[0] - q[0] || (p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0); });
      var i = 0;
      while (i < cand.length) {
        var start = cand[i][0], j = i;
        while (j < cand.length && cand[j][0] - start <= tol) j++;
        var group = cand.slice(i, j); i = j;
        var gset = {}; group.forEach(function (c) { gset[c[1]] = 1; });
        var guids = Object.keys(gset);
        if (guids.length < minSupport) continue;
        var sum = 0; group.forEach(function (c) { sum += c[0]; });
        var coord = sum / group.length;
        datumId++;
        datums.push({ datum_id: datumId, axis: 'XYZ'[ax], coord: _round(coord, 6), support_count: guids.length, provenance: 'derived:cadence' });
        guids.forEach(function (g) {
          var b = byGuid[g], f0 = b[2 * ax] - coord, f1 = b[2 * ax + 1] - coord;
          var off = Math.abs(f1) < Math.abs(f0) ? f1 : f0;   // closest face → signed offset (ties keep min face)
          anchored.push({ element_guid: g, datum_id: datumId, axis: 'XYZ'[ax], offset_mm: _round(off * 1000, 3), provenance: 'derived:cadence-snap' });
        });
      }
    }
    return { datums: datums, anchored: anchored };
  }

  // Port of derive_spans(tol=0.05). Reuses the emerged datums. Returns [{element_guid,axis,datum_lo_id,
  // datum_hi_id,span_m}]. An element SPANS an axis when its min face is near one datum and its max face near a
  // DIFFERENT datum (both within tol). Nearest-datum picks the FIRST on a tie (matches Python min()).
  function deriveSpans(db, datums, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : 0.05;
    var byAxis = { 0: [], 1: [], 2: [] };
    (datums || []).forEach(function (d) { byAxis['XYZ'.indexOf(d.axis)].push([d.datum_id, d.coord]); });
    function nearest(arr, face) { var best = null, bd = Infinity; for (var i = 0; i < arr.length; i++) { var dd = Math.abs(arr[i][1] - face); if (dd < bd) { bd = dd; best = arr[i]; } } return best; }
    var boxes = _readBoxes(db), spans = [];
    boxes.forEach(function (e) {
      var b = e.aabb;
      for (var ax = 0; ax < 3; ax++) {
        var arr = byAxis[ax]; if (!arr.length) continue;
        var loFace = b[2 * ax], hiFace = b[2 * ax + 1];
        var lo = nearest(arr, loFace), hi = nearest(arr, hiFace);
        if (!lo || !hi) continue;
        if (Math.abs(lo[1] - loFace) > tol || Math.abs(hi[1] - hiFace) > tol || lo[0] === hi[0]) continue;
        var dLo = lo, dHi = hi; if (lo[1] > hi[1]) { dLo = hi; dHi = lo; }
        spans.push({ element_guid: e.guid, axis: 'XYZ'[ax], datum_lo_id: dLo[0], datum_hi_id: dHi[0], span_m: _round(hiFace - loFace, 6), provenance: 'derived:bbox-spans-datums' });
      }
    });
    return spans;
  }

  // ── §FILLS-HOST + §AGGREGATES — RECOVERED IFC relationships (provenance ifc:recovered), NOT derivable from
  //    geometry → READ from the recovered rows the extractor wrote (Path B: IfcRelFillsElement; IfcRelAggregates).
  //    Emitted as element↔element edges {a,b} so the adjacency lens highlights them: a door↔its host wall, a
  //    child↔its aggregate parent. Absent tables → [] (graceful; e.g. a local .db with no recovered rels).
  function readFillsHost(db) {
    try {
      var r = db.exec("SELECT opening_guid, host_guid, filling_guid, host_class, filling_class FROM rel_fills_host");
      if (!r.length) return [];
      return r[0].values.map(function (v) {
        // lens edge = the FILLING (door/window, a real leaf) ↔ its HOST (wall); opening kept for provenance.
        return { a: v[2] || v[0], b: v[1], opening_guid: v[0], host_guid: v[1], filling_guid: v[2],
          host_class: v[3], filling_class: v[4], kind: 'fills', provenance: 'ifc:recovered' };
      }).filter(function (e) { return e.a != null && e.b != null; });
    } catch (e) { return []; }
  }
  function readAggregates(db) {
    try {
      var r = db.exec("SELECT parent_guid, child_guid FROM rel_aggregates");
      if (!r.length) return [];
      return r[0].values.map(function (v) { return { a: v[0], b: v[1], parent_guid: v[0], child_guid: v[1], kind: 'aggregates', provenance: 'ifc:recovered' }; });
    } catch (e) { return []; }
  }

  // Derive/read the FULL SDG edge set in one call (the modeller stashes this on window.swXEdges on Open).
  // Geometric edges (abuts/anchored/spans) are JS-derived; recovered relations (fills/aggregates) are read.
  function deriveAll(db, opts) {
    var da = deriveDatumsAnchored(db, opts);
    return {
      abuts: deriveAdjacency(db, opts),
      anchored: da.anchored, datums: da.datums,
      spans: deriveSpans(db, da.datums, opts),
      fills: readFillsHost(db),
      aggregates: readAggregates(db)
    };
  }

  var API = { deriveAdjacency: deriveAdjacency, faceTouch: faceTouch, TOL: TOL, MIN_OVERLAP: MIN_OVERLAP,
    deriveDatumsAnchored: deriveDatumsAnchored, deriveSpans: deriveSpans,
    readFillsHost: readFillsHost, readAggregates: readAggregates, deriveAll: deriveAll };
  window.CrossEdges = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
