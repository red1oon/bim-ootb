/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * storey_footprint.js — the missing half of "raster + footprint" named by
 * prompts/EXIT_DETECTION.md T1: common/storey_raster.js's `contains(px,py)` answers "is this
 * exact point on real walkable floor" — it does NOT answer "is this point genuinely OUTSIDE the
 * building" (a point can fail `contains()` either because it's really outside, OR because it's an
 * internal void the raster doesn't cover — an atrium, light well, elevator shaft, open stairwell —
 * and those two cases must never be confused, per EXIT_DETECTION.md's own warning: conflating them
 * is "the exact same false-positive class... that killed the prior E4 attempt, just with a
 * different wrong answer than a lift").
 *
 * ALGORITHM (measured, not assumed): every one of Hospital's 7 rastered storeys has a ZERO-
 * walkable border (checked directly: Level 1's 1550 border cells are 0/1550 walkable) — the
 * raster's own build script sizes the grid with margin around the building, so the grid border is
 * always real exterior. That makes "true exterior" a pure CONNECTIVITY fact, not a shape guess: a
 * non-walkable cell is real exterior iff a 4-connected flood fill of non-walkable cells starting
 * from the grid's border can reach it. A non-walkable cell the flood fill can NEVER reach (fully
 * enclosed by walkable cells on all connected paths) is an internal void — this is the same
 * "concave slab" caution storey_raster.js's own header names, one level up: don't approximate the
 * envelope with a hull/bbox (that re-introduces the courtyard-chord-reads-legal bug this whole
 * raster system exists to avoid) — walk the REAL bit graph instead.
 *
 * Caller contract, same as storey_raster.js/room_graph.js: DB/file I/O-free, takes an already-
 * decoded StoreyRaster instance (or the raw {cols,rows,bits,...} shape `StoreyRaster.fromRow`
 * returns) and does no querying itself.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.StoreyFootprint = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function getBit(bits, cols, col, row) {
    var idx = row * cols + col;
    return (bits[idx >> 3] >> (idx & 7)) & 1;
  }
  function setBit(bits, cols, col, row) {
    var idx = row * cols + col;
    bits[idx >> 3] |= (1 << (idx & 7));
  }

  /**
   * Flood-fill non-walkable cells reachable from the grid border. Returns a footprint object with
   * `.isOutside(px, py)` — true only for a MEASURED true-exterior point (reached by the flood fill,
   * or entirely off the raster grid); false for walkable floor OR an enclosed internal void.
   * @param {{cols:number, rows:number, bits:Uint8Array, res:number, x0:number, y0:number}} raster
   */
  function buildFootprint(raster) {
    var cols = raster.cols, rows = raster.rows, bits = raster.bits;
    var exterior = new Uint8Array(Math.ceil((cols * rows) / 8));
    var visited = new Uint8Array(cols * rows);
    var stack = [];

    function pushIfUnwalkable(c, r) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      var lin = r * cols + c;
      if (visited[lin]) return;
      if (getBit(bits, cols, c, r)) return; // walkable — not exterior, not a flood seed
      visited[lin] = 1;
      setBit(exterior, cols, c, r);
      stack.push(c, r);
    }

    // Seed from every border cell.
    for (var c0 = 0; c0 < cols; c0++) { pushIfUnwalkable(c0, 0); pushIfUnwalkable(c0, rows - 1); }
    for (var r0 = 0; r0 < rows; r0++) { pushIfUnwalkable(0, r0); pushIfUnwalkable(cols - 1, r0); }

    while (stack.length) {
      var r = stack.pop(), c = stack.pop();
      pushIfUnwalkable(c - 1, r); pushIfUnwalkable(c + 1, r);
      pushIfUnwalkable(c, r - 1); pushIfUnwalkable(c, r + 1);
    }

    return {
      cols: cols, rows: rows, res: raster.res, x0: raster.x0, y0: raster.y0, exteriorBits: exterior,
      isOutside: function (px, py) {
        var col = Math.floor((px - raster.x0) / raster.res), row = Math.floor((py - raster.y0) / raster.res);
        if (col < 0 || row < 0 || col >= cols || row >= rows) return true; // off the modeled grid entirely
        return getBit(exterior, cols, col, row) === 1;
      }
    };
  }

  return { buildFootprint: buildFootprint };
});
