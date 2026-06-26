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

  var API = { deriveAdjacency: deriveAdjacency, faceTouch: faceTouch, TOL: TOL, MIN_OVERLAP: MIN_OVERLAP };
  window.CrossEdges = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
