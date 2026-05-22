/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// route_walker.js — JS port of Java RouteWalker (DAGCompiler/mep/RouteWalker.java)
// Implementing DISC_VALIDATION_DB_SRS.md §6.12.3 — Witness: W-PATTERN-CW, W-PATTERN-SP
//
// Pattern applier for MEP routing. NOT a routing engine — no A*, no pathfinding.
// Reads anchor pairs, applies topology patterns, emits placed pipe segments.
// Each emitted segment is a kernel_ops ELEMENT_PLACE — undoable, replayable.

(function(window) {
'use strict';

// ── GRID_STRATEGY equivalent: anchor_type → node_type per discipline ────────
var NODE_TYPE_MAP = {
  CW: { METER: 'METER',    FIXTURE: 'FIXTURE', VALVE: 'VALVE', GENERIC: 'JUNCTION' },
  SP: { METER: 'STACK',    FIXTURE: 'FIXTURE', VALVE: 'VALVE', GENERIC: 'JUNCTION' }
};

function _toNodeType(anchorType, discipline) {
  var map = NODE_TYPE_MAP[discipline] || NODE_TYPE_MAP.CW;
  return map[anchorType] || 'JUNCTION';
}

// ── A1. Pattern loading ─────────────────────────────────────────────────────
function _loadPatterns(db, discipline, buildingType) {
  if (!db) return [];
  var rows;
  try {
    rows = db.exec(
      "SELECT pattern_id, discipline, building_type, sequence, from_node_type, to_node_type, " +
      "direction_axis, piece_type, offset_rule, COALESCE(gradient, 0) " +
      "FROM ad_mep_pattern WHERE discipline = '" + discipline + "' " +
      "ORDER BY CASE WHEN building_type = '" + (buildingType || '') + "' THEN 0 ELSE 1 END, sequence"
    );
  } catch(e) {
    console.warn('§RW_PATTERN_ERR ' + e.message);
    return [];
  }
  if (!rows.length || !rows[0].values.length) return [];

  var steps = [];
  var selectedId = rows[0].values[0][0];  // first (best) pattern
  for (var i = 0; i < rows[0].values.length; i++) {
    var r = rows[0].values[i];
    if (r[0] !== selectedId) break;  // only load steps from best pattern
    steps.push({
      patternId:     r[0],
      discipline:    r[1],
      buildingType:  r[2],
      sequence:      r[3],
      fromNodeType:  r[4],
      toNodeType:    r[5],
      directionAxis: r[6],
      pieceType:     r[7],
      offsetRule:    r[8],
      gradient:      r[9] || 0
    });
  }
  if (steps.length) {
    console.log('§RW_PATTERN disc=' + discipline + ' id=' + selectedId + ' steps=' + steps.length);
  }
  return steps;
}

// ── A2. Anchor loading ──────────────────────────────────────────────────────
function _loadAnchors(db, buildingType) {
  if (!db) return [];
  var rows;
  try {
    rows = db.exec(
      "SELECT anchor_id, anchor_type, x_m, y_m, z_m, storey " +
      "FROM ad_mep_anchor WHERE source_building = '" + (buildingType || '') + "'"
    );
  } catch(e) {
    console.warn('§RW_ANCHOR_ERR ' + e.message);
    return [];
  }
  if (!rows.length || !rows[0].values.length) return [];

  return rows[0].values.map(function(r) {
    return {
      anchorId:   r[0],
      anchorType: r[1],
      x: r[2], y: r[3], z: r[4],
      storey: r[5] || 'Unknown'
    };
  });
}

// ── A3. Pattern application — core nearest-neighbor pairing ─────────────────
function _applyPattern(discipline, steps, allAnchors, arcBoxes) {
  // Group anchors by storey
  var byStorey = {};
  for (var i = 0; i < allAnchors.length; i++) {
    var a = allAnchors[i];
    var s = a.storey || 'Unknown';
    if (!byStorey[s]) byStorey[s] = [];
    byStorey[s].push(a);
  }

  var segments = [];  // emitted pipe segments
  var clashSkipped = 0;

  var storeys = Object.keys(byStorey);
  for (var si = 0; si < storeys.length; si++) {
    var storey = storeys[si];
    var storeyAnchors = byStorey[storey];
    var usedIds = {};  // track paired to_anchors

    for (var pi = 0; pi < steps.length; pi++) {
      var step = steps[pi];

      // Collect from/to candidates using discipline-specific node_type mapping
      var fromList = [];
      var toList = [];
      for (var ai = 0; ai < storeyAnchors.length; ai++) {
        var anc = storeyAnchors[ai];
        var nt = _toNodeType(anc.anchorType, discipline);
        if (nt === step.fromNodeType) fromList.push(anc);
        if (nt === step.toNodeType && !usedIds[anc.anchorId]) toList.push(anc);
      }

      if (!fromList.length || !toList.length) continue;

      // Pair each from_anchor with nearest unmatched to_anchor (XY distance)
      for (var fi = 0; fi < fromList.length; fi++) {
        var from = fromList[fi];
        var nearest = null;
        var minDist = Infinity;

        for (var ti = 0; ti < toList.length; ti++) {
          var to = toList[ti];
          if (usedIds[to.anchorId]) continue;
          var ddx = to.x - from.x;
          var ddy = to.y - from.y;
          var dist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dist < minDist) {
            minDist = dist;
            nearest = to;
          }
        }

        if (!nearest) continue;

        // Sanity guard: skip distance=0 or >50m
        if (minDist === 0 || minDist > 50.0) continue;

        // Compute dx, dy, dz
        var dx = nearest.x - from.x;
        var dy = nearest.y - from.y;
        var dz = nearest.z - from.z;

        // GRADIENT enforcement (MS 1228 §5.3)
        if (step.offsetRule === 'GRADIENT' && step.gradient > 0) {
          var horiz = Math.sqrt(dx * dx + dy * dy);
          dz = step.gradient * horiz;
        }

        // Pipe AABB: 50mm nominal × 1.5 cross-section
        var pipeW = 75;   // mm
        var pipeD = 75;   // mm
        var pipeLen = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;  // mm

        // ARC envelope clash check
        var midX = (from.x + nearest.x) / 2 * 1000;
        var midY = (from.y + nearest.y) / 2 * 1000;
        var midZ = (from.z + nearest.z) / 2 * 1000;

        if (_clashesWithArc(midX, midY, midZ, pipeW, pipeD, pipeLen, arcBoxes)) {
          clashSkipped++;
          continue;
        }

        // Emit segment
        segments.push({
          disc:     discipline,
          storey:   storey,
          step:     step.sequence,
          fromId:   from.anchorId,
          toId:     nearest.anchorId,
          dx: Math.round(dx * 1000) / 1000,
          dy: Math.round(dy * 1000) / 1000,
          dz: Math.round(dz * 1000) / 1000,
          length_mm: Math.round(pipeLen),
          pieceType: step.pieceType,
          axis:     step.directionAxis
        });

        usedIds[nearest.anchorId] = true;
      }
    }
  }

  return { segments: segments, clashSkipped: clashSkipped };
}

// ── A4. ARC envelope clash check ────────────────────────────────────────────
function _clashesWithArc(px, py, pz, pw, pd, ph, arcs) {
  if (!arcs || !arcs.length) return false;
  var tol = -10;  // tolerance: pipes may touch walls but not penetrate
  for (var i = 0; i < arcs.length; i++) {
    var a = arcs[i];
    if (_aabbOverlap(px, pw, a.cx, a.w, tol) &&
        _aabbOverlap(py, pd, a.cy, a.d, tol) &&
        _aabbOverlap(pz, ph, a.cz, a.h, tol)) {
      return true;
    }
  }
  return false;
}

function _aabbOverlap(c1, s1, c2, s2, tol) {
  return Math.abs(c1 - c2) < (s1 / 2 + s2 / 2 + tol);
}

// ── Load ARC envelope from building DB ──────────────────────────────────────
function _loadArcEnvelope(A) {
  if (!A || !A.dbQuery) return [];
  var rows = A.dbQuery(
    "SELECT t.center_x * 1000, t.center_y * 1000, t.center_z * 1000, " +
    "t.bbox_x * 2000, t.bbox_y * 2000, t.bbox_z * 2000 " +
    "FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid " +
    "WHERE m.discipline = 'ARC' AND m.ifc_class IN ('IfcWall','IfcWallStandardCase','IfcSlab','IfcColumn')"
  );
  return rows.map(function(r) {
    return { cx: r[0], cy: r[1], cz: r[2], w: r[3], d: r[4], h: r[5] };
  });
}

// ── Main entry point ────────────────────────────────────────────────────────
/**
 * walk(mepDb, A, buildingType) — apply MEP patterns to anchor set
 * @param {object} mepDb — sql.js Database with ad_mep_pattern + ad_mep_anchor
 * @param {object} A — the APP object (for ARC envelope + kernel_ops)
 * @param {string} buildingType — source_building name
 * @returns {object} { cwSegments, spSegments, cwClash, spClash, totalEmitted }
 */
function walk(mepDb, A, buildingType) {
  var t0 = performance.now();

  // A1. Load patterns
  var cwSteps = _loadPatterns(mepDb, 'CW', buildingType);
  var spSteps = _loadPatterns(mepDb, 'SP', buildingType);

  if (!cwSteps.length && !spSteps.length) {
    console.warn('§RW_WALK no patterns for building=' + buildingType);
    return { cwSegments: [], spSegments: [], cwClash: 0, spClash: 0, totalEmitted: 0 };
  }

  // A2. Load anchors
  var allAnchors = _loadAnchors(mepDb, buildingType);
  if (!allAnchors.length) {
    console.warn('§RW_WALK no anchors for building=' + buildingType);
    return { cwSegments: [], spSegments: [], cwClash: 0, spClash: 0, totalEmitted: 0 };
  }

  // A4. Load ARC envelope for clash
  var arcBoxes = _loadArcEnvelope(A);

  // A3. Apply patterns
  var cwResult = cwSteps.length ? _applyPattern('CW', cwSteps, allAnchors, arcBoxes)
                                : { segments: [], clashSkipped: 0 };
  var spResult = spSteps.length ? _applyPattern('SP', spSteps, allAnchors, arcBoxes)
                                : { segments: [], clashSkipped: 0 };

  var total = cwResult.segments.length + spResult.segments.length;
  var ms = Math.round(performance.now() - t0);

  // Log to kernel_ops — each segment is an ELEMENT_PLACE
  if (window.KernelOps && A && A.db) {
    var allSegs = cwResult.segments.concat(spResult.segments);
    for (var i = 0; i < allSegs.length; i++) {
      try {
        KernelOps.commitOp(A.db, 'ELEMENT_PLACE', JSON.stringify({
          family: 'MEP_ROUTE',
          disc: allSegs[i].disc,
          from: allSegs[i].fromId,
          to: allSegs[i].toId,
          dx: allSegs[i].dx, dy: allSegs[i].dy, dz: allSegs[i].dz,
          axis: allSegs[i].axis
        }), allSegs[i].fromId, 'MEP_' + allSegs[i].disc + '_' + i);
      } catch(e) { /* optional */ }
    }
  }

  console.log('§RW_WALK building=' + buildingType +
    ' CW=' + cwResult.segments.length + ' SP=' + spResult.segments.length +
    ' clash=' + (cwResult.clashSkipped + spResult.clashSkipped) +
    ' anchors=' + allAnchors.length + ' ms=' + ms);

  return {
    cwSegments: cwResult.segments,
    spSegments: spResult.segments,
    cwClash:    cwResult.clashSkipped,
    spClash:    spResult.clashSkipped,
    totalEmitted: total
  };
}

// ── Public API ──────────────────────────────────────────────────────────────
window.RouteWalker = {
  walk: walk,
  // Exposed for testing
  _toNodeType:    _toNodeType,
  _aabbOverlap:   _aabbOverlap,
  _clashesWithArc: _clashesWithArc,
  _loadPatterns:  _loadPatterns,
  _loadAnchors:   _loadAnchors,
  _applyPattern:  _applyPattern
};

})(window);
