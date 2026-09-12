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
// escapeRoute() now reaches 149/156 rooms.
//
// THRESHOLD CITATIONS (2026-09-12, WebSearch-verified, see EGRESS_SANITY.md's own UPDATE section
// for the full reasoning):
//   - door_clear_width critical_m=0.813 — CITED: IBC 2021 §1010.1.1, the general minimum clear
//     opening width (32in). warning_m=0.85 stays an uncited early-heads-up buffer above it, not
//     itself cited. NOTE: IBC also requires 1.054m (41.5in) for Group I-2 bed-movement egress
//     doors specifically — Hospital's own real occupancy — but this pipeline extracts no
//     occupancy classification (checked: project_metadata only carries building_name/
//     import_date), so the stricter I-2 figure is NOT applied; using it as a blanket default
//     would false-flag every non-bed-movement door in the building.
//   - circulation_distance critical_m=60.96 — CITED: IBC 2021 Table 1017.2, Group I-2
//     (sprinklered, required for I-2) maximum exit access travel distance = 200ft = 60.96m.
//     warning_m=45.7 (~75%) is an uncited early-heads-up buffer. ⚠ KNOWN METRIC MISMATCH: Table
//     1017.2 limits distance to the NEAREST AVAILABLE EXIT, which on a multi-storey building is
//     normally the protected exit-stair ENCLOSURE on the occupant's own floor — but
//     RoomGraph.escapeRoute() measures distance all the way to a real EXTERIOR door (this
//     session's E4 exit-detection only finds ground-floor exits on Hospital, since that's where
//     its raster-confirmed exterior doors are). So this tool's number is a real measured upper
//     bound, not the code-defined quantity — it likely OVERSTATES true code-relevant distance
//     for upper-floor rooms (conservative bias: over-flags, never under-flags, the safer
//     direction for a screening tool, but not the same claim as "measures Table 1017.2's own
//     quantity"). Do not present a flagged row as a confirmed code violation on this evidence
//     alone. Also assumes I-2 occupancy (Hospital's real classification) without verifying it —
//     this pipeline has no occupancy data to check against; a non-institutional building would
//     have a different, uncited-here Table 1017.2 limit.
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

  // ══ §RULE_FALLBACK_ONE_SOURCE (prompts/STRUCTURAL_SANITY.md T8.13) ═══════════════════════════
  // THE ONE LITERAL for this evaluator — verbatim from viewer/rates/egress_rules.json. See
  // structural_sanity.js's twin for the full reasoning; the short version is that this object
  // used to exist three times and the copies had ALREADY drifted across a branch boundary
  // (circulation_distance 30/45 on the film branch vs the #1715 cited 45.7/60.96 here).
  var FALLBACK_RULES = {
    egress_rules: [
      { name: 'door_clear_width', applies_to: ['IfcDoor'],
        warning_m: 0.85, critical_m: 0.813, max_severity: 'WARNING' },
      { name: 'circulation_distance', applies_to: ['room_graph_node'],
        target: 'exit_or_own_storey_circ', warning_m: 45.7, critical_m: 60.96, max_severity: 'WARNING' },
      { name: 'isolated_room', applies_to: ['room_graph_node'], target: 'own_storey_circ' }
    ]
  };
  function _fallback(name) {
    var rs = FALLBACK_RULES.egress_rules;
    for (var i = 0; i < rs.length; i++) if (rs[i].name === name) return rs[i];
    return {};
  }

  // §CIRC_NODE_NOT_A_GUESSED_GUID (T9.6) — every circulation node on a storey, however the graph
  // chose to name it. `kind === 'circ'` is the graph's own marker; the guid prefixes are the
  // fallback for nodes that carry the storey only in their id. Returns [] when a storey genuinely
  // has no circulation, which is a real finding and different from "we looked up the wrong name".
  function _circulationNodesOn(graph, storey) {
    var out = [];
    (graph.nodes || []).forEach(function (n) {
      if (n.storey === storey && n.kind === 'circ' && out.indexOf(n.guid) === -1) out.push(n.guid);
    });
    Object.keys(graph.nodesByGuid || {}).forEach(function (gid) {
      if (out.indexOf(gid) !== -1) return;
      if (gid.indexOf('CIRC::') !== 0 && gid.indexOf('SPINE::') !== 0) return;
      var n = graph.nodesByGuid[gid];
      // Match on the node's own storey when it has one, else on the storey embedded in the guid.
      if ((n && n.storey === storey) || gid.indexOf('::' + storey) === gid.indexOf('::')) out.push(gid);
    });
    return out;
  }

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
    // T8.13 — from the ONE literal above, never re-typed here.
    var doorRule = byName.door_clear_width || _fallback('door_clear_width');
    var circRule = byName.circulation_distance || _fallback('circulation_distance');

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
        rows.push({ guid: guid, ifc_class: 'IfcDoor', name: name, storey: storey, rule: 'door_clear_width', severity: sev, ratio: width,
          witness: opts.witness ? {
            bboxXM: +(bx || 0).toFixed(3), bboxYM: +(by || 0).toFixed(3), widthTakenAs: (bx >= by ? 'bbox_x' : 'bbox_y'),
            warningM: doorRule.warning_m, criticalM: doorRule.critical_m,
            reads: 'width is the NOMINAL bbox extent. Clear opening width — what the threshold cites — is narrower by the stop, the leaf thickness and the hardware, none of which this schema carries, so this rule under-flags'
          } : undefined });
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

    // ── §EGRESS_WITNESS (prompts/STRUCTURAL_SANITY.md T8.12) — OPT-IN, default OFF.
    // "Isolated room" is the finding a reader most wants to disbelieve on sight, and the rule's
    // own evidence for it is an ABSENCE (no path found), which is exactly what a bare row cannot
    // show. This indexes the graph's own edges once so a flagged room can state its degree, its
    // actual neighbours, and whether its storey even HAS a circulation node to reach — the three
    // facts that separate "genuinely sealed off" from "the graph never connected it".
    var degree = null, neighbours = null, storeyHasCirc = null, exitCount = 0;
    if (opts.witness) {
      degree = {}; neighbours = {}; storeyHasCirc = {};
      (graph.edges || []).forEach(function (e) {
        degree[e.a] = (degree[e.a] || 0) + 1; degree[e.b] = (degree[e.b] || 0) + 1;
        (neighbours[e.a] = neighbours[e.a] || []).push({ guid: e.b, via: e.kind, doorName: e.doorName || null });
        (neighbours[e.b] = neighbours[e.b] || []).push({ guid: e.a, via: e.kind, doorName: e.doorName || null });
      });
      (graph.nodes || []).forEach(function (n) { if (n.kind === 'circ') storeyHasCirc[n.storey] = true; });
      Object.keys(graph.nodesByGuid || {}).forEach(function (g) { if (g.indexOf('EXIT::') === 0) exitCount++; });
      log('§EGRESS_WITNESS enabled nodes=' + (graph.nodes || []).length + ' edges=' + (graph.edges || []).length +
        ' exitNodes=' + exitCount + ' storeysWithCirc=' + Object.keys(storeyHasCirc).length);
    }

    graph.nodes.forEach(function (r) {
      var esc = RoomGraph.escapeRoute(graph, r.guid, { log: function () {} });
      var target, distance;
      if (esc && esc.distance != null) {
        target = 'exit'; distance = esc.distance; viaExit++;
      } else {
        // ══ §CIRC_NODE_NOT_A_GUESSED_GUID (T9.6) — the fallback used to CONSTRUCT one guid,
        // 'CIRC::' + storey, and give up if that exact string was not a node. The graph does not
        // name circulation that way everywhere: it also emits SPINE:: nodes keyed by storey AND
        // axis position, e.g. 'SPINE::Level 1|x|-7.00'. MEASURED on HHS_Office_Federated: the
        // graph holds 3 CIRC:: nodes and 15 SPINE:: nodes, and the single room reported
        // `isolated_room` had **6 edges, four of them doors onto SPINE::Unknown|x|32.44** — its
        // own storey's circulation. The rule looked up 'CIRC::Unknown', found nothing, and called
        // a connected room isolated. A guessed identifier is not a lookup.
        //
        // Reach for ANY circulation node on the storey and take the nearest reachable one.
        var circNodes = _circulationNodesOn(graph, r.storey);
        var sp = null;
        for (var ci = 0; ci < circNodes.length; ci++) {
          var cand = RoomGraph.shortestPath(graph, r.guid, circNodes[ci]);
          if (cand && cand.distance != null && (!sp || cand.distance < sp.distance)) sp = cand;
        }
        if (sp && sp.distance != null) { target = 'circulation (fallback)'; distance = sp.distance; viaFallback++; }
        else {
          // Rule 3: isolated — no path to escape via a real exit NOR to this storey's own
          // circulation spine at all. A real graph-connectivity fact, not a threshold guess.
          rows.push({ guid: r.guid, ifc_class: 'IfcSpace', name: r.name, storey: r.storey, rule: 'isolated_room', severity: 'CRITICAL', ratio: null,
            witness: opts.witness ? {
              graphDegree: degree[r.guid] || 0,
              neighbours: (neighbours[r.guid] || []).slice(0, 8),
              storeyHasCirculationNode: !!storeyHasCirc[r.storey],
              exitNodesInModel: exitCount,
              // The room's own name carries the extraction's confidence mark (≈ approximate,
              // ⚠ suspect). The rule cannot read it; the witness can, so the reader sees whether
              // the "room" that failed to connect was itself a guess.
              roomNameSigil: (function (n) { var c = String(n || '').charAt(0); return c === '\u2248' ? 'approximate' : (c === '\u26a0' ? 'suspect' : null); })(r.name),
              reads: (degree[r.guid] || 0) === 0
                ? 'this node has NO edges at all — the room graph never connected it to anything, so "isolated" here describes the extraction, not necessarily the building'
                : 'this node HAS ' + (degree[r.guid] || 0) + ' edge(s) but no route reaches an exit or its storey\'s circulation spine' +
                  (storeyHasCirc[r.storey] ? '' : '; note its storey has NO circulation node at all, so the fallback target did not exist')
            } : undefined });
          isolatedCount++;
          return;
        }
      }
      var sev = _severityAbove(distance, circRule);
      if (sev) {
        circCount.WARNING++;
        if (distance >= circRule.critical_m) circCount.uncapped_critical++;
        rows.push({ guid: r.guid, ifc_class: 'IfcSpace', name: r.name, storey: r.storey,
          rule: 'circulation_distance', severity: sev, ratio: distance, target: target,
          witness: opts.witness ? {
            measuredTo: target, hops: (esc && esc.path) ? esc.path.length : null,
            doorsOnRoute: (esc && esc.doors) ? esc.doors.length : null,
            warningM: circRule.warning_m, criticalM: circRule.critical_m,
            roomNameSigil: (function (n) { var c = String(n || '').charAt(0); return c === '\u2248' ? 'approximate' : (c === '\u26a0' ? 'suspect' : null); })(r.name),
            reads: target === 'exit'
              ? 'distance is to a real EXTERIOR door, not to the nearest protected exit stair the travel-distance code actually regulates — on an upper storey this overstates the code quantity'
              : 'no exit was reachable; this is the distance to the storey\'s own circulation spine, a weaker claim than distance-to-exit'
          } : undefined });
      }
    });
    log('§EGRESS rule=circulation_distance severity=' + circCount.WARNING + ' uncapped_critical=' + circCount.uncapped_critical +
      ' viaExit=' + viaExit + ' viaFallback=' + viaFallback);
    log('§EGRESS rule=isolated_room severity=' + isolatedCount);

    return rows;
  }

  return { evaluate: evaluate, FALLBACK_RULES: FALLBACK_RULES };
});
