/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * flythru_maths.js — the TWO PRIMITIVES of the fly-through measurement model.
 * Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §FLYTHRU_DIMENSIONS §3 —
 * Witness: W-FLYTHRU-MATHS (probe_flythru_maths.js).
 *
 * §3 says every storyboarded beat is ONE OF TWO measurements, so an unseen building with unseen
 * classes still measures:
 *   A. MATERIAL CHORD   — a segment from an origin along a direction, ended by a stop predicate.
 *                         Only the predicate changes per beat. Every linear number is this.
 *   B. OCCUPANCY RASTER — area/perimeter of elements projected to a plane. Needed because a chord
 *                         cannot give area on a concave plan, and a bbox product LIES about one.
 *
 * The bbox lie is MEASURED, not theoretical — common/storey_raster.js's own header records it:
 * "a U-shaped floor slab's own bounding box overreaches into any notch it wraps around (measured on
 * HHS: a slab's bbox covering 105% of its storey's room extent)". That is why B exists.
 *
 * REUSE, NOT REINVENT: the bit layout, packing and O(1) lookup already ship in
 * common/storey_raster.js (shared contract between scripts/build_storey_walkable_raster.js and
 * room_graph.js). This module borrows that contract rather than defining a second one, and the
 * cell size is that builder's own RES — so the film introduces NO new tunable. Paramount objective
 * is a cinematic result with least effort from the user: nothing here asks them to pick a number.
 *
 * BOX SHAPE is {cx,cy,cz,sx,sy,sz} — the same shape navigate_find.js's _allRoomVolumes() already
 * returns (§5), so rooms, storeys and elements all feed the same functions.
 * DB DATUM: element_transforms is the DB's own Z-up frame, so the raster plane is XY and Z is height.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./storey_raster.js'));
  else root.FlythruMaths = factory(root.StoreyRaster);
})(typeof window !== 'undefined' ? window : this, function (SR) {
  'use strict';

  var RES = 0.25; // = scripts/build_storey_walkable_raster.js RES. Not a knob; keep them equal.

  // ══ PRIMITIVE A — extents / world-axis chord ═══════════════════════════════════════════════════
  // The B1 envelope chord's stop predicate is "outermost material", so along a world axis the chord
  // IS the extent of the box set. The directional/ray cases (B4-B7) are NOT here — §3.8 forbids
  // building the predicate family before B1-B3 have drawn in a real frame.
  function ftExtents(boxes) {
    if (!boxes || !boxes.length) return null;
    var i, b, r = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, minz: Infinity, maxz: -Infinity };
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      if (!isFinite(b.cx) || !isFinite(b.sx)) continue;
      if (b.cx - b.sx / 2 < r.minx) r.minx = b.cx - b.sx / 2;
      if (b.cx + b.sx / 2 > r.maxx) r.maxx = b.cx + b.sx / 2;
      if (b.cy - b.sy / 2 < r.miny) r.miny = b.cy - b.sy / 2;
      if (b.cy + b.sy / 2 > r.maxy) r.maxy = b.cy + b.sy / 2;
      if (b.cz - b.sz / 2 < r.minz) r.minz = b.cz - b.sz / 2;
      if (b.cz + b.sz / 2 > r.maxz) r.maxz = b.cz + b.sz / 2;
    }
    if (!isFinite(r.minx)) return null;
    r.sx = r.maxx - r.minx; r.sy = r.maxy - r.miny; r.sz = r.maxz - r.minz;
    r.cx = (r.minx + r.maxx) / 2; r.cy = (r.miny + r.maxy) / 2; r.cz = (r.minz + r.maxz) / 2;
    return r;
  }

  // ══ PRIMITIVE B — occupancy raster ═════════════════════════════════════════════════════════════
  // Coverage test is the CELL CENTRE, identical to the walkable builder's, so an area computed here
  // and one read from storey_walkable_raster are comparable numbers rather than two conventions.
  function ftRasterizeBoxes(boxes, res, name) {
    res = res || RES;
    var e = ftExtents(boxes);
    if (!e) return null;
    var x0 = Math.floor(e.minx / res) * res, y0 = Math.floor(e.miny / res) * res;
    var cols = Math.max(1, Math.ceil((e.maxx - x0) / res)), rows = Math.max(1, Math.ceil((e.maxy - y0) / res));
    if (cols * rows > 6000000) return null; // same guard as the builder's §RASTER_SKIP
    var bits = SR.makeBitset(cols, rows), i, b, c0, c1, r0, r1, c, rr;
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      if (!isFinite(b.cx) || !isFinite(b.sx)) continue;
      // cells whose CENTRE falls inside the box: centre_x = x0+(c+0.5)*res
      c0 = Math.ceil(((b.cx - b.sx / 2) - x0) / res - 0.5); c1 = Math.floor(((b.cx + b.sx / 2) - x0) / res - 0.5);
      r0 = Math.ceil(((b.cy - b.sy / 2) - y0) / res - 0.5); r1 = Math.floor(((b.cy + b.sy / 2) - y0) / res - 0.5);
      if (c0 < 0) c0 = 0; if (r0 < 0) r0 = 0; if (c1 > cols - 1) c1 = cols - 1; if (r1 > rows - 1) r1 = rows - 1;
      for (rr = r0; rr <= r1; rr++) for (c = c0; c <= c1; c++) SR.setBit(bits, cols, c, rr);
    }
    return SR.makeRaster(name || '', res, x0, y0, cols, rows, bits);
  }

  function ftRasterCells(r) {
    if (!r) return 0;
    var n = 0, c, rr;
    for (rr = 0; rr < r.rows; rr++) for (c = 0; c < r.cols; c++) if (SR.getBit(r.bits, r.cols, c, rr)) n++;
    return n;
  }
  function ftRasterArea(r) { return r ? ftRasterCells(r) * r.res * r.res : 0; }

  // Boundary edges × res. A cell edge counts when the 4-neighbour is unset or off-grid, so a
  // courtyard's inner edge is counted too — which is the honest perimeter of a plan with a hole.
  function ftRasterPerimeter(r) {
    if (!r) return 0;
    var p = 0, c, rr, g = function (cc, r2) {
      return (cc < 0 || r2 < 0 || cc >= r.cols || r2 >= r.rows) ? 0 : (SR.getBit(r.bits, r.cols, cc, r2) ? 1 : 0);
    };
    for (rr = 0; rr < r.rows; rr++) for (c = 0; c < r.cols; c++) {
      if (!g(c, rr)) continue;
      if (!g(c - 1, rr)) p++; if (!g(c + 1, rr)) p++; if (!g(c, rr - 1)) p++; if (!g(c, rr + 1)) p++;
    }
    return p * r.res;
  }

  // A logical room is the UNION of its sub-rects (§5) — RM_Level_1_12 + RM_Level_1_12b are ONE room.
  // Rasterising the union is what makes an L-shaped room read as an L instead of as its bbox.
  function ftUnionMeasure(rects, res) {
    var e = ftExtents(rects); if (!e) return null;
    var r = ftRasterizeBoxes(rects, res || RES);
    var area = ftRasterArea(r);
    // height = the tallest sub-rect; volume = area × height, never the bbox product.
    var h = 0, i; for (i = 0; i < rects.length; i++) if (rects[i].sz > h) h = rects[i].sz;
    return { area: area, perimeter: ftRasterPerimeter(r), height: h, volume: area * h,
             bboxArea: e.sx * e.sy, extents: e, parts: rects.length, raster: r };
  }

  return { RES: RES, ftExtents: ftExtents, ftRasterizeBoxes: ftRasterizeBoxes, ftRasterCells: ftRasterCells,
           ftRasterArea: ftRasterArea, ftRasterPerimeter: ftRasterPerimeter, ftUnionMeasure: ftUnionMeasure };
});
