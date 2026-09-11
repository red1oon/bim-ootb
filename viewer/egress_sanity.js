// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// egress_sanity.js — "Egress" rule evaluator (prompts/EGRESS_SANITY.md T3).
// PORTABLE by construction, same contract as viewer/structural_sanity.js / common/room_graph.js:
// dbQuery(sql, params) -> rows in, plain JS out, no DOM/THREE.js.
//
// RULE 2 UPDATE (prompts/EXIT_DETECTION.md T1-T4 landed, 2026-09-11): distance-to-exit now tries
// RoomGraph.escapeRoute() FIRST (a real measured exterior-door exit exists in the graph now) and
// falls back to RoomGraph.shortestPath(room, 'CIRC::'+storey) only when escapeRoute() returns null
// (a building without a raster — fleet coverage gap — or a genuinely exit-unreachable room). Every
// row is labelled which target it actually measured ('exit' vs 'circulation (fallback)') so the UI
// never overclaims. Measured on real Hospital_meta.db (see tests/test_egress_sanity_rules.js):
// escapeRoute() now reaches 149/156 rooms; the OLD warning_m:30/critical_m:45 thresholds (carried
// forward from the circulation-only design) are NOT re-calibrated for this farther metric — see
// EGRESS_SANITY.md's own UPDATE section. Shipped anyway (WARNING-ceiling, uncited placeholder,
// same discipline as every other threshold in this PR) with that miscalibration disclosed, not
// hidden.
//
// §EGRESS_ROOMGRAPH_LATE_BIND (real bug found via a sibling session baking this into a movie,
// bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §59.7, 2026-09-11 — fixed here independently on
// this branch): this file is a static <script> in viewer.html, loaded at page boot; common/
// room_graph.js is lazy-loaded later by APP.loadNavigate() (viewer/main.js). Reading
// `ROOT.RoomGraph` ONCE at factory time (module load) captured `undefined` PERMANENTLY — a later
// loadNavigate() populates window.RoomGraph, but nothing here ever looked again, so rules 2/3
// silently no-op'd in every real browser/bake run despite every Node witness passing (Node's
// require() branch was never the broken half). Fixed by resolving RoomGraph at CALL time inside
// evaluate() instead — the Node require() branch is untouched (no lazy-loading exists there).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EgressSanity = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : {};
  // Node: eager require (no lazy-loading exists there — every Node caller expects this to just
  // work). Browser: resolved at CALL time by _resolveRoomGraph() below, not captured here.
  var _nodeRoomGraph = (typeof module !== 'undefined' && module.exports) ? require('../common/room_graph.js') : null;
  function _resolveRoomGraph() { return _nodeRoomGraph || ROOT.RoomGraph; }

  function _severityBelow(value, rule) {
    // Door width: NARROWER is worse (flag when value <= threshold), opposite direction from a
    // span/depth ratio rule.
    if (value <= rule.critical_m) return rule.max_severity === 'WARNING' ? 'WARNING' : 'CRITICAL';
    if (value <= rule.warning_m) return 'WARNING';
    return null;
  }
  function _severityAbove(value, rule) {
    if (value >= rule.critical_m) return rule.max_severity === 'WARNING' ? 'WARNING' : 'CRITICAL';
    if (value >= rule.warning_m) return 'WARNING';
    return null;
  }

  /**
   * @param {function} dbQuery - (sql, params?) -> array of row arrays
   * @param {object} rules - parsed egress_rules.json ({ egress_rules: [...] })
   * @param {object} [opts] - { log: fn(msg) }
   * @returns {Array<{guid,ifc_class,name,storey,rule,severity,ratio}>}
   */
  function evaluate(dbQuery, rules, opts) {
    opts = opts || {};
    var log = opts.log || (typeof console !== 'undefined' ? console.log.bind(console) : function () {});
    var byName = {};
    (rules.egress_rules || []).forEach(function (r) { byName[r.name] = r; });
    var doorRule = byName.door_clear_width || { warning_m: 0.85, critical_m: 0.80, max_severity: 'WARNING' };
    var circRule = byName.circulation_distance || { warning_m: 30, critical_m: 45, max_severity: 'WARNING' };

    var rows = [];

    // ── Rule 1: door clear width ──
    var doorRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.bbox_x, et.bbox_y " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.discipline = 'ARC' AND em.ifc_class = 'IfcDoor'"
    );
    var doorFlags = { CRITICAL: 0, WARNING: 0 };
    doorRows.forEach(function (d) {
      var guid = d[0], name = d[1], storey = d[2], bx = d[3] || 0, by = d[4] || 0;
      var width = Math.max(bx, by);
      var sev = _severityBelow(width, doorRule);
      if (sev) {
        doorFlags[sev]++;
        rows.push({ guid: guid, ifc_class: 'IfcDoor', name: name, storey: storey, rule: 'door_clear_width', severity: sev, ratio: width });
      }
    });
    log('§EGRESS rule=door_clear_width severity=' + (doorFlags.CRITICAL + doorFlags.WARNING) + ' critical=' + doorFlags.CRITICAL);

    // ── Rules 2 + 3: circulation-distance / isolated-room, via the real room graph ──
    // Resolved HERE, at call time — not captured at module-load time (§EGRESS_ROOMGRAPH_LATE_BIND
    // above). A caller that awaits A.loadNavigate() before calling evaluate() (rule_checklist.js's
    // A.showEgressSanity does exactly this) now actually sees the loaded RoomGraph.
    var RoomGraph = _resolveRoomGraph();
    if (!RoomGraph) {
      log('§EGRESS_NO_ROOMGRAPH RoomGraph module not available — rules 2/3 skipped');
      return rows;
    }
    var graph = RoomGraph.buildGraph(dbQuery, { log: function () {} });
    var circCount = { WARNING: 0, uncapped_critical: 0 }, isolatedCount = 0;
    var viaExit = 0, viaFallback = 0;
    graph.nodes.forEach(function (r) {
      var esc = RoomGraph.escapeRoute(graph, r.guid, { log: function () {} });
      var target, distance;
      if (esc && esc.distance != null) {
        target = 'exit'; distance = esc.distance; viaExit++;
      } else {
        var circGuid = 'CIRC::' + r.storey;
        var sp = graph.nodesByGuid[circGuid] ? RoomGraph.shortestPath(graph, r.guid, circGuid) : null;
        if (sp && sp.distance != null) { target = 'circulation (fallback)'; distance = sp.distance; viaFallback++; }
        else {
          // Rule 3: isolated — no path to escape via a real exit NOR to this storey's own
          // circulation spine at all. A real graph-connectivity fact, not a threshold guess.
          rows.push({ guid: r.guid, ifc_class: 'IfcSpace', name: r.name, storey: r.storey, rule: 'isolated_room', severity: 'CRITICAL', ratio: null });
          isolatedCount++;
          return;
        }
      }
      var sev = _severityAbove(distance, circRule);
      if (sev) {
        circCount.WARNING++;
        if (distance >= circRule.critical_m) circCount.uncapped_critical++;
        rows.push({ guid: r.guid, ifc_class: 'IfcSpace', name: r.name, storey: r.storey,
          rule: 'circulation_distance', severity: sev, ratio: distance, target: target });
      }
    });
    log('§EGRESS rule=circulation_distance severity=' + circCount.WARNING + ' uncapped_critical=' + circCount.uncapped_critical +
      ' viaExit=' + viaExit + ' viaFallback=' + viaFallback);
    log('§EGRESS rule=isolated_room severity=' + isolatedCount);

    return rows;
  }

  return { evaluate: evaluate };
});
