/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * room_coverage.js — §EGRESS_HARDENING item 1: per-storey room/space coverage validation.
 * (prompts/EGRESS_HARDENING.md item 1, 2026-09-18)
 *
 * WHY: every rule in egress_sanity.js/rule_checklist.js only ever sees the rooms that made it
 * into `spatial_structure` (real extraction) or `RM_`-prefixed Room Injection. When a storey's
 * real coverage is thin (measured: Hospital's `buildings/Hospital_silent.db` has only 8 IfcSpace
 * rows covering a many-thousand-element building), every downstream rule silently under-checks
 * that storey — not "passing", just never evaluated. This module measures the gap directly and
 * gives rule_checklist.js a real number to show, instead of a report that looks clean because
 * most of the floor was never looked at.
 *
 * METHOD: reuses RoomGraph.buildGraph()'s own already-built `graph.nodes` (room rects, including
 * §CORRIDOR-ROOM-BACKPROP's real hallway injections — those count as covered too, they are real
 * space) and `graph.rasters` (the per-storey walkable bitset built for EXIT_DETECTION.md's
 * footprint test — see common/storey_raster.js). No new DB query, no new data source: coverage =
 * (sum of room rect areas on a storey) / (raster's real walkable cell area on that storey).
 *
 * KNOWN APPROXIMATION, disclosed: room area is SUM of each room's rect area, not the UNION —
 * overlapping rects (rare; the corridor-backprop injection already guards >0.5m^2 overlaps, see
 * room_graph.js §OVERLAP-GUARD) would overstate coverage slightly. Same rigor level as this
 * codebase's other area-ish measures (door_clear_width reads raw bbox, not true clear opening).
 *
 * THRESHOLD: 0.5 (50%) — UNCITED. No WHO/IBC number exists for "minimum fraction of a storey that
 * must be assigned to a compiled space" — this is a heuristic screening threshold this module
 * picks, not a code-cited quantity, same disclosure discipline as `egress_rules.json`'s own
 * uncited `warning_m` buffers. Calibrated against real fixtures (see witness_egress_hardening.js):
 * Hospital measures ~9% (known-bad, MEMORY bim-ootb-t10-hospital-slab-coverage), Duplex/HHS both
 * measure >85% (known-good) — 50% sits with a wide margin on both sides of that real gap.
 *
 * Caller contract: takes an already-built `graph` (RoomGraph.buildGraph()'s return value) — this
 * module does no DB I/O itself, dual-mode like every sibling in common/.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RoomCoverage = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var COVERAGE_WARNING_RATIO = 0.5;

  function popcount(bits) {
    var n = 0;
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      while (b) { n += b & 1; b >>= 1; }
    }
    return n;
  }

  function rectArea(r) {
    return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
  }

  // Returns [{ storey, roomAreaM2, walkableAreaM2, ratio, severity }], one row per storey that
  // has EITHER a room or a raster (a storey with neither is not this module's business — nothing
  // to compare). `ratio` is null (never 0) when no raster exists for that storey — an UNKNOWN,
  // not a false CRITICAL (same "unknown/unavailable, never a guess" discipline EXIT_DETECTION.md
  // already established for the fleet raster-coverage gap).
  function computeCoverage(graph, opts) {
    opts = opts || {};
    var warnRatio = opts.warningRatio != null ? opts.warningRatio : COVERAGE_WARNING_RATIO;
    var byStorey = {};
    (graph.nodes || []).forEach(function (n) {
      if (n.kind !== 'room') return;
      var st = n.storey || '(no storey)';
      if (!byStorey[st]) byStorey[st] = { storey: st, roomAreaM2: 0 };
      (n.rects || []).forEach(function (r) { byStorey[st].roomAreaM2 += rectArea(r); });
    });
    var rasters = graph.rasters || {};
    Object.keys(rasters).forEach(function (st) {
      if (!byStorey[st]) byStorey[st] = { storey: st, roomAreaM2: 0 };
    });
    var rows = Object.keys(byStorey).map(function (st) {
      var row = byStorey[st];
      var raster = rasters[st];
      if (!raster) { row.walkableAreaM2 = null; row.ratio = null; row.severity = null; return row; }
      var walkableCells = popcount(raster.bits);
      row.walkableAreaM2 = walkableCells * raster.res * raster.res;
      row.ratio = row.walkableAreaM2 > 0 ? row.roomAreaM2 / row.walkableAreaM2 : null;
      row.severity = (row.ratio != null && row.ratio < warnRatio) ? 'WARNING' : null;
      return row;
    });
    return rows;
  }

  return { computeCoverage: computeCoverage, COVERAGE_WARNING_RATIO: COVERAGE_WARNING_RATIO };
});
