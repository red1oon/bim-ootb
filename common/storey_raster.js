/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * storey_raster.js — pack/unpack + O(1) point lookup for a per-storey walkable-space bitset
 * (prompts/Modeller/DISC_Walker/PATH_LEGAL_SEGMENTS.md §G3-REVISED, 2026-07-13).
 *
 * WHY: the original G3 walkable-space definition (room rects + floor-slab AABBs) measurably
 * misfires on concave slabs — a U-shaped floor slab's own bounding box overreaches into any notch
 * it wraps around (measured on HHS: a slab's bbox covering 105% of its storey's room extent), so
 * a courtyard chord samples as "legal" when it plainly crosses open air. The building's own real
 * triangulated mesh (component_geometries, already decoded for rendering by
 * modeller/real_geometry.js) does NOT have this problem — but decoding+rasterizing it at every
 * pathfinding query would be slow and pulls THREE/mesh-decode into the query path. So the
 * rasterization happens ONCE, offline (scripts/build_storey_walkable_raster.js), and ships as a
 * self-heal patch row per storey — this module is the SHARED pack/unpack + lookup contract between
 * that offline builder and this file's own runtime reader (room_graph.js), so both agree on the
 * bit layout without duplicating it.
 *
 * Caller contract, same convention as room_graph.js: this module is DB/file I/O-free — it only
 * packs/unpacks plain JS values (typed arrays, numbers) and does no querying itself.
 *
 * BIT LAYOUT: row-major, cell (col,row) -> bit index `row*cols+col` -> byte `bit>>3`, bit-in-byte
 * `bit&7` (LSB-first). Grid cell (col,row)'s CENTER is at
 * `(x0 + (col+0.5)*res, y0 + (row+0.5)*res)` — a point is walkable iff its containing cell's bit
 * is set, which itself was set at build time iff that cell's CENTER fell inside the union of real
 * slab mesh triangles + room rects (see the build script for the coverage test).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.StoreyRaster = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // §BIT-BUILD: cols*rows bits, row-major, LSB-first — a plain growable Uint8Array bitset.
  function makeBitset(cols, rows) {
    return new Uint8Array(Math.ceil((cols * rows) / 8));
  }
  function setBit(bits, cols, col, row) {
    var idx = row * cols + col;
    bits[idx >> 3] |= (1 << (idx & 7));
  }
  function getBit(bits, cols, col, row) {
    var idx = row * cols + col;
    return (bits[idx >> 3] >> (idx & 7)) & 1;
  }

  // Iterate every cell CENTER in a (x0,y0,res,cols,rows) grid — shared by the build script's
  // coverage-test pass so the center-point convention can never drift from what `contains()` below
  // assumes at read time.
  function forEachCellCenter(x0, y0, res, cols, rows, cb) {
    for (var r = 0; r < rows; r++) {
      var cy = y0 + (r + 0.5) * res;
      for (var c = 0; c < cols; c++) {
        cb(c, r, x0 + (c + 0.5) * res, cy);
      }
    }
  }

  // hex <-> bytes, for embedding a bitset into a self-heal patch SQL literal (X'...') and reading
  // it back if a caller only has the hex string rather than a real BLOB (dbQuery's sql.js/
  // better-sqlite3 rows already hand back a Uint8Array for BLOB columns — hex is the FILE-side
  // encoding used only when this module's build half writes SQL text, not the read half's contract).
  function bitsToHex(bits) {
    var s = '';
    for (var i = 0; i < bits.length; i++) { var h = bits[i].toString(16); s += (h.length < 2 ? '0' + h : h); }
    return s;
  }
  function hexToBits(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  // A raster object wraps one storey's bitset with the geometry needed to map a world (x,y) to a
  // cell — `contains(px,py)` is the O(1) query-time lookup room_graph.js calls per sampled point.
  function makeRaster(storey, res, x0, y0, cols, rows, bits) {
    return {
      storey: storey, res: res, x0: x0, y0: y0, cols: cols, rows: rows, bits: bits,
      contains: function (px, py) {
        var col = Math.floor((px - x0) / res), row = Math.floor((py - y0) / res);
        if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
        return getBit(bits, cols, col, row) === 1;
      }
    };
  }

  // §READ: build a raster from a dbQuery row — SELECT storey,res,x0,y0,cols,rows,bits FROM
  // storey_walkable_raster WHERE storey=? — `row[6]` (bits) arrives as a Uint8Array BLOB value
  // (sql.js/better-sqlite3 convention, same as component_geometries elsewhere in this codebase).
  function fromRow(row) {
    var bits = row[6];
    if (typeof bits === 'string') bits = hexToBits(bits); // defensive: hex-string fallback
    return makeRaster(row[0], row[1], row[2], row[3], row[4] | 0, row[5] | 0, bits);
  }

  return {
    makeBitset: makeBitset, setBit: setBit, getBit: getBit,
    forEachCellCenter: forEachCellCenter, bitsToHex: bitsToHex, hexToBits: hexToBits,
    makeRaster: makeRaster, fromRow: fromRow
  };
});
