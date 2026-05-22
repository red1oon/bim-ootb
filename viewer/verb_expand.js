/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// verb_expand.js — JS port of Java PlacementCollectorVisitor verb expansion
// Implementing S267_BOM_TREE_EXTRACTION.md §2 — Witness: W-VERB-EXPAND
//
// Pure math: each verb_ref string → array of [dx, dy, dz] offsets (metres).
// No framework dependency. Ported from PlacementCollectorVisitor.java lines 1470-1717.

(function(window) {
'use strict';

/**
 * expandVerb(verbRef, qty, originDx, originDy, originDz)
 * @param {string|null} verbRef — verb pattern (TILE:..., CLUSTER:..., etc.) or null
 * @param {number} qty — number of instances
 * @param {number} originDx — pattern origin X (floor-relative, metres)
 * @param {number} originDy — pattern origin Y
 * @param {number} originDz — pattern origin Z
 * @returns {number[][]} array of [dx, dy, dz] offsets. CLUSTER returns [dx, dy, dz, w, d, h].
 */
function expandVerb(verbRef, qty, originDx, originDy, originDz) {
  if (!verbRef || verbRef === '') {
    // Unfactored: all instances at same position
    var result = [];
    for (var i = 0; i < qty; i++) {
      result.push([originDx, originDy, originDz]);
    }
    return result;
  }

  if (verbRef.indexOf('TILE:') === 0) return expandTile(verbRef, originDx, originDy, originDz);
  if (verbRef.indexOf('ROUTE:') === 0) return expandRoute(verbRef, originDx, originDy, originDz);
  if (verbRef.indexOf('FRAME:') === 0) return expandFrame(verbRef, originDz);
  if (verbRef.indexOf('CLUSTER:') === 0) return expandCluster(verbRef, originDx, originDy, originDz);
  if (verbRef.indexOf('SPRAY:') === 0) return expandSpray(verbRef, qty, originDx, originDy, originDz);
  if (verbRef.indexOf('LINE:') === 0) return expandLine(verbRef, qty, originDx, originDy, originDz);
  if (verbRef.indexOf('LINE_MULTI:') === 0) return expandLineMulti(verbRef, qty, originDx, originDy, originDz);
  if (verbRef.indexOf('PLACE_DEVICE:') === 0) {
    // Marker verb — position already in origin
    var r = [];
    for (var j = 0; j < qty; j++) r.push([originDx, originDy, originDz]);
    return r;
  }

  // Unknown verb — fall back to origin
  console.warn('§VERB_EXPAND unknown verb: ' + verbRef.substring(0, 20));
  var fallback = [];
  for (var k = 0; k < qty; k++) fallback.push([originDx, originDy, originDz]);
  return fallback;
}

/** TILE:nx:ny:stepX:stepY → 2D grid from origin. */
function expandTile(verbRef, originDx, originDy, originDz) {
  var parts = verbRef.substring(5).split(':');
  var nx = parseInt(parts[0], 10);
  var ny = parseInt(parts[1], 10);
  var stepX = parseFloat(parts[2]);
  var stepY = parseFloat(parts[3]);

  var result = [];
  for (var ix = 0; ix < nx; ix++) {
    for (var iy = 0; iy < ny; iy++) {
      result.push([
        originDx + ix * stepX,
        originDy + iy * stepY,
        originDz
      ]);
    }
  }
  return result;
}

/** ROUTE:X:step:n|Y:step:n|... → axis-aligned legs from origin. */
function expandRoute(verbRef, originDx, originDy, originDz) {
  var legs = verbRef.substring(6).split('|');

  var result = [];
  var curX = originDx;
  var curY = originDy;

  for (var li = 0; li < legs.length; li++) {
    var parts = legs[li].split(':');
    var axis = parts[0].charAt(0);
    var step = parseFloat(parts[1]);
    var count = parseInt(parts[2], 10);

    for (var i = 0; i < count; i++) {
      result.push([curX, curY, originDz]);
      if (axis === 'X') curX += step;
      else curY += step;
    }
  }
  return result;
}

/**
 * FRAME:x1,x2,...|y1,y2,...[|halfW,halfD] → cartesian product of gridlines.
 * LBD offsets stored directly — no half-extent conversion needed.
 */
function expandFrame(verbRef, originDz) {
  var halves = verbRef.substring(6).split('|');
  var xStrs = halves[0].split(',');
  var yStrs = halves[1].split(',');

  var xLines = [];
  var yLines = [];
  for (var i = 0; i < xStrs.length; i++) xLines.push(parseFloat(xStrs[i]));
  for (var j = 0; j < yStrs.length; j++) yLines.push(parseFloat(yStrs[j]));

  var result = [];
  for (var xi = 0; xi < xLines.length; xi++) {
    for (var yi = 0; yi < yLines.length; yi++) {
      result.push([xLines[xi], yLines[yi], originDz]);
    }
  }
  return result;
}

/** SPRAY:stepX:stepY — semi-regular grid, qty determines count. */
function expandSpray(verbRef, qty, originDx, originDy, originDz) {
  var parts = verbRef.substring(6).split(':');
  var stepX = parseFloat(parts[0]);
  var stepY = parseFloat(parts[1]);

  // Grid dimensions: aspect ratio from steps
  var ny = Math.max(1, Math.round(Math.sqrt(qty * stepX / stepY)));
  var nx = Math.ceil(qty / ny);

  var result = [];
  for (var ix = 0; ix < nx && result.length < qty; ix++) {
    for (var iy = 0; iy < ny && result.length < qty; iy++) {
      result.push([
        originDx + ix * stepX,
        originDy + iy * stepY,
        originDz
      ]);
    }
  }
  return result;
}

/**
 * CLUSTER:dx,dy,dz,w,d,h[,guid];... → exact per-instance offsets.
 * Returns [dx, dy, dz, w, d, h] per instance (6-element arrays).
 * w/d/h = 0 for legacy 3-field format.
 */
function expandCluster(verbRef, originDx, originDy, originDz) {
  var data = verbRef.substring(8); // skip "CLUSTER:"
  var entries = data.split(';');
  var result = [];
  for (var i = 0; i < entries.length; i++) {
    var vals = entries[i].split(',');
    var dx = originDx + parseFloat(vals[0]);
    var dy = originDy + parseFloat(vals[1]);
    var dz = originDz + parseFloat(vals[2]);
    var w = vals.length >= 6 ? parseFloat(vals[3]) : 0;
    var d = vals.length >= 6 ? parseFloat(vals[4]) : 0;
    var h = vals.length >= 6 ? parseFloat(vals[5]) : 0;
    result.push([dx, dy, dz, w, d, h]);
  }
  return result;
}

/** LINE:axis:pos1,pos2,...,posN → explicit positions along one axis. */
function expandLine(verbRef, qty, originDx, originDy, originDz) {
  var data = verbRef.substring(5); // skip "LINE:"
  var colonIdx = data.indexOf(':');
  var axis = data.substring(0, colonIdx);
  var posStrs = data.substring(colonIdx + 1).split(',');

  var result = [];
  for (var i = 0; i < posStrs.length; i++) {
    var pos = parseFloat(posStrs[i].trim());
    if (axis === 'X') result.push([pos, originDy, originDz]);
    else if (axis === 'Y') result.push([originDx, pos, originDz]);
    else if (axis === 'Z') result.push([originDx, originDy, pos]);
    else result.push([originDx, originDy, originDz]);
  }
  return result;
}

/** LINE_MULTI:axis:pos,...;axis:pos,... → multiple groups of explicit positions. */
function expandLineMulti(verbRef, qty, originDx, originDy, originDz) {
  var data = verbRef.substring(11); // skip "LINE_MULTI:"
  var groups = data.split(';');
  var result = [];
  for (var gi = 0; gi < groups.length; gi++) {
    var colonIdx = groups[gi].indexOf(':');
    var axis = groups[gi].substring(0, colonIdx);
    var posStrs = groups[gi].substring(colonIdx + 1).split(',');
    for (var i = 0; i < posStrs.length; i++) {
      var pos = parseFloat(posStrs[i].trim());
      if (axis === 'X') result.push([pos, originDy, originDz]);
      else if (axis === 'Y') result.push([originDx, pos, originDz]);
      else if (axis === 'Z') result.push([originDx, originDy, pos]);
      else result.push([originDx, originDy, originDz]);
    }
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────────────────────
window.VerbExpand = {
  expandVerb: expandVerb,
  // Exposed for testing
  expandTile: expandTile,
  expandRoute: expandRoute,
  expandFrame: expandFrame,
  expandCluster: expandCluster,
  expandSpray: expandSpray,
  expandLine: expandLine,
  expandLineMulti: expandLineMulti
};

})(window);
