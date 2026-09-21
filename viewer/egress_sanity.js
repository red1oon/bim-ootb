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
  // §EGRESS_HARDENING item 1 (EGRESS_HARDENING.md, 2026-09-18) — same dual-mode resolve pattern.
  var _nodeRoomCoverage = (typeof module !== 'undefined' && module.exports) ? require('../common/room_coverage.js') : null;
  function _resolveRoomCoverage() { return _nodeRoomCoverage || ROOT.RoomCoverage; }

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
      { name: 'isolated_room', applies_to: ['room_graph_node'], target: 'own_storey_circ' },
      // §12.1/§12.2 (ESCAPE_ROUTE_REVEAL.md, 2026-09-20) — kept verbatim in step with
      // viewer/rates/egress_rules.json per §RULE_FALLBACK_ONE_SOURCE. Both CITED; see that file.
      { name: 'common_path_of_egress_travel', applies_to: ['room_graph_node'],
        target: 'first_choice_of_two_paths',
        critical_m: 22.9, critical_m_sprinklered: 30.5, max_severity: 'WARNING' },
      { name: 'exit_remoteness', applies_to: ['storey'], target: 'max_overall_diagonal',
        ratio_unsprinklered: 0.5, ratio_sprinklered: 0.3333, max_severity: 'WARNING' }
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

  // ══ §12.3 SPRINKLER EVIDENCE (ESCAPE_ROUTE_REVEAL.md, 2026-09-20) ═══════════════════════════
  // Every threshold in Chapter 10 forks on sprinklered/unsprinklered, and until now this file had
  // no way to tell — rule 5's own comment says so out loud ("No sprinkler-system data extracted
  // either — uses the STRICTER non-sprinklered figure"). It IS extractable: MEASURED 2026-09-20,
  // Hospital_meta.db carries 1,354 IfcFireSuppressionTerminal (plus 6,228 FP pipe segments, 5,900
  // fittings, 861 controls, 8 valves) and Terminal_meta.db 909. That is a real, positioned
  // sprinkler-head class, not an inference.
  //
  // ⚠ WHAT THIS CANNOT SAY. IBC's fork requires the building to be "equipped THROUGHOUT with an
  // automatic sprinkler system in accordance with §903.3.1.1 or §903.3.1.2". Counting heads proves
  // PRESENCE, never "throughout", never the standard they were designed to, never that the system
  // is charged. So `sprinklered` below is deliberately NOT used to relax any threshold: the
  // evaluator keeps the STRICTER unsprinklered figure and reports the head count as evidence that
  // the laxer one MAY apply. Same over-flag-never-under-flag bias rule 5 already chose, and the
  // same reason: this is a screening tool, not a code consultant.
  // ⚠ NOT APPLIED TO THE SHIPPED RULES. circulation_distance's critical_m 60.96 is the SPRINKLERED
  // I-2 figure and rule 5 uses the unsprinklered width factor; both now have evidence available to
  // them, and neither is retuned here. Changing a number the Egress report already shows is a
  // separate decision — this only stops it being unknowable.
  function _sprinklerEvidence(dbQuery, log) {
    var heads = 0, fp = 0;
    try {
      var r = dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class = 'IfcFireSuppressionTerminal'");
      heads = (r && r.length && r[0][0]) || 0;
      var r2 = dbQuery("SELECT COUNT(*) FROM elements_meta WHERE discipline = 'FP'");
      fp = (r2 && r2.length && r2[0][0]) || 0;
    } catch (e) { log('§EGRESS_SPRINKLER_ERR ' + e.message + ' — treated as no evidence'); }
    log('§EGRESS_SPRINKLER heads=' + heads + ' (IfcFireSuppressionTerminal) fpElements=' + fp +
      ' evidence=' + (heads > 0 ? 'PRESENT' : 'NONE') +
      ' — thresholds still use the STRICTER unsprinklered figure either way; head COUNT cannot' +
      ' establish IBC\'s "equipped throughout per §903.3.1.1/§903.3.1.2"');
    return { heads: heads, fpElements: fp, present: heads > 0 };
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

  function _exitsByStorey(graph) {
    var out = {};
    Object.keys(graph.nodesByGuid || {}).forEach(function (g) {
      var n = graph.nodesByGuid[g];
      if (!n || n.kind !== 'exit' || n.cx == null) return;
      (out[n.storey] = out[n.storey] || []).push(n);
    });
    return out;
  }
  /**
   * §12.2 exit_remoteness — IBC 2021 §1007.1.1. PURE over (graph, rule): no DB, no pathfinding.
   * Exported so a witness can feed it a storey that MUST fail (Hospital passes, and a rule only
   * ever seen passing is indistinguishable from a rule that never speaks).
   * @returns {Array} zero or more finding rows, same shape as every other rule here.
   */
  function exitRemoteness(graph, rule, sprinklers, withWitness) {
    var ratio = rule.ratio_unsprinklered;     // the STRICTER figure — see _sprinklerEvidence
    var heads = (sprinklers && sprinklers.heads) || 0;
    var present = !!(sprinklers && sprinklers.present);
    var byStorey = _exitsByStorey(graph), out = [];
    Object.keys(byStorey).forEach(function (st) {
      var ex = byStorey[st];
      var rects = (graph.roomRectsByStorey && graph.roomRectsByStorey[st]) || [];
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      rects.forEach(function (rc) {
        x0 = Math.min(x0, rc.x0); y0 = Math.min(y0, rc.y0);
        x1 = Math.max(x1, rc.x1); y1 = Math.max(y1, rc.y1);
      });
      var haveFootprint = isFinite(x0);
      var diag = haveFootprint ? Math.hypot(x1 - x0, y1 - y0) : null;
      var needM = haveFootprint ? ratio * diag : null;
      var best = 0, bestPair = null;
      for (var i = 0; i < ex.length; i++) {
        for (var j = i + 1; j < ex.length; j++) {
          var d = Math.hypot(ex[i].cx - ex[j].cx, ex[i].cy - ex[j].cy);
          if (d > best) { best = d; bestPair = [ex[i].guid, ex[j].guid]; }
        }
      }
      var single = ex.length < 2;
      // No compiled footprint = no diagonal = the rule cannot be evaluated. Reported as
      // INCONCLUSIVE, never as a pass — that is this project's own rule about empty populations.
      if (!single && !haveFootprint) {
        out.push({ guid: 'STOREY::' + st, ifc_class: 'IfcBuildingStorey', name: st, storey: st,
          rule: 'exit_remoteness', severity: 'WARNING', ratio: null,
          target: 'no compiled footprint — cannot measure the diagonal',
          witness: withWitness ? { exitsOnStorey: ex.length, bestSeparationM: +best.toFixed(2),
            reads: 'this storey has ' + ex.length + ' exits but no compiled room rects, so §1007.1.1\'s' +
              ' "maximum overall diagonal dimension" has nothing to measure against. INCONCLUSIVE, not a pass.' } : undefined });
        return;
      }
      if (!single && best >= needM) return;   // satisfied
      out.push({ guid: 'STOREY::' + st, ifc_class: 'IfcBuildingStorey', name: st, storey: st,
        rule: 'exit_remoteness', severity: 'WARNING',
        ratio: single ? null : +(best / diag).toFixed(4),
        target: single ? 'only one exit on this storey'
                       : 'needs ' + needM.toFixed(1) + 'm of ' + diag.toFixed(1) + 'm diagonal',
        witness: withWitness ? {
          exitsOnStorey: ex.length, diagonalM: diag == null ? null : +diag.toFixed(2),
          requiredRatio: ratio, requiredSeparationM: needM == null ? null : +needM.toFixed(2),
          bestSeparationM: +best.toFixed(2), bestPair: bestPair,
          ratioSprinklered: rule.ratio_sprinklered, sprinklerHeads: heads,
          reads: (single
            ? 'this storey has ' + ex.length + ' detected exit node(s); §1007.1.1 governs the separation of TWO exits, so it cannot be satisfied and cannot be measured. Whether two are REQUIRED here depends on occupant load and common path (Table 1006.2.1), which this rule does not evaluate'
            : 'the two most widely separated exits are ' + best.toFixed(1) + 'm apart against a required ' +
              needM.toFixed(1) + 'm (' + ratio + ' x the ' + diag.toFixed(1) + 'm diagonal)') +
            '. The diagonal is the COMPILED room footprint\'s bounding box, not the building\'s true overall dimension — a storey with poor room coverage understates it. Measured exit-to-exit at door CENTRES; §1007.1.1 allows measuring to any point along the doorway width, so a real check is marginally more generous. Applied at the UNSPRINKLERED ' + ratio + '; ' +
            (present ? heads + ' sprinkler heads exist, so ' + rule.ratio_sprinklered + ' MAY apply' : 'no sprinkler heads found')
        } : undefined });
    });
    return out;
  }

  /**
   * @param {function} dbQuery - (sql, params?) -> array of row arrays
   * @param {object} rules - parsed egress_rules.json ({ egress_rules: [...] })
   * @param {object} [opts] - { log: fn(msg), doorRealXY: {guid:[x,y]} — see room_graph.js §REAL-AABB }
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

    // §12.3 — resolved ONCE, before any rule reads it. Reports evidence; relaxes nothing.
    var sprinklers = _sprinklerEvidence(dbQuery, log);

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
    // §REAL-AABB (ROOM_GRAPH_REAL_AABB.md §4 item 3): pass through opts.doorRealXY unchanged (this
    // file stays dbQuery-only/DB-io-free — see file header — the caller resolves it against a live
    // db/geoDb handle via common/door_real_position.js). undefined here = today's coarse behaviour.
    var graph = RoomGraph.buildGraph(dbQuery, { log: function () {}, doorRealXY: opts.doorRealXY });
    var circCount = { WARNING: 0, uncapped_critical: 0 }, isolatedCount = 0;
    var viaExit = 0, viaFallback = 0;

    // ── Rule 4: space coverage (§EGRESS_HARDENING item 1) — reuses the graph just built, no new
    // query. Runs here (report-generation time), NOT in buildGraph()/escapeRoute() — zero cost to
    // live Find Panel pathing, see EGRESS_HARDENING.md's own cost measurement. ──
    var RoomCoverage = _resolveRoomCoverage();
    var coverageCount = { WARNING: 0 };
    if (RoomCoverage) {
      RoomCoverage.computeCoverage(graph).forEach(function (c) {
        if (!c.severity) return;
        coverageCount[c.severity]++;
        rows.push({ guid: 'STOREY::' + c.storey, ifc_class: 'IfcBuildingStorey', name: c.storey, storey: c.storey,
          rule: 'space_coverage', severity: c.severity, ratio: c.ratio,
          witness: opts.witness ? {
            roomAreaM2: +c.roomAreaM2.toFixed(1), walkableAreaM2: c.walkableAreaM2 != null ? +c.walkableAreaM2.toFixed(1) : null,
            reads: 'this storey\'s compiled room area covers only ' + (c.ratio * 100).toFixed(0) + '% of its real walkable ' +
              'floor area (raster-measured) — every rule above ran on the ' + (c.ratio * 100).toFixed(0) + '% that WAS compiled; ' +
              'the rest was never checked, not confirmed clean'
          } : undefined });
      });
      log('§EGRESS rule=space_coverage severity=' + coverageCount.WARNING);
    } else {
      log('§EGRESS_NO_ROOMCOVERAGE RoomCoverage module not available — rule 4 skipped');
    }

    // ── Rule 5: door occupant-load capacity (§EGRESS_HARDENING item 2, 2026-09-18) ──
    // IBC 2021 Table 1004.5 "Business areas" = 150 gross sf/person = 13.94 m^2/person (WebSearch-
    // verified, https://up.codes/s/areas-without-fixed-seating). Occupancy-generic default — same
    // limitation already disclosed above for the I-2 door-width figure: this pipeline extracts no
    // occupancy classification, so a room whose real occupancy uses a denser Table 1004.5 factor
    // (e.g. I-2 inpatient treatment = 240 gross sf, assembly w/o fixed seating = 15 net sf) would
    // need real occupancy data this tool does not have. Business (150 gross sf) is a mid-range
    // general default, not a claim about any specific room's real use.
    // IBC 2021 §1005.3.2 "other egress components" (doors/corridors/ramps — NOT §1005.3.1
    // stairways, which is stricter): 0.2 in/occupant non-sprinklered, 0.15 in/occupant sprinklered
    // (WebSearch-verified, https://up.codes/s/means-of-egress-sizing). No sprinkler-system data
    // extracted either — uses the STRICTER non-sprinklered figure as the safer default, the same
    // "over-flag, never under-flag" bias circulation_distance's own citation already states as its
    // design philosophy for this screening tool.
    var OCCUPANT_LOAD_FACTOR_M2 = 13.94;   // IBC Table 1004.5, "Business areas", 150 gross sf/person
    var WIDTH_PER_OCCUPANT_M = 0.00508;    // IBC §1005.3.2, non-sprinklered, 0.2in/occupant
    var roomAreaByGuid = {};
    graph.nodes.forEach(function (r) {
      var a = 0;
      (r.rects || []).forEach(function (rc) { a += Math.max(0, rc.x1 - rc.x0) * Math.max(0, rc.y1 - rc.y0); });
      roomAreaByGuid[r.guid] = a;
    });
    // A door's real room connection(s) — E1 (2-room), E2 (1-room rescue) and E9 (ambiguous-residual
    // extra neighbours) all carry a real doorGuid onto a real room node; E4 (exit) does not, since
    // its far side is an EXIT:: node, never 'room'-kind, so it is excluded automatically below.
    var doorRoomsByGuid = {};
    (graph.edges || []).forEach(function (e) {
      if (!e.doorGuid) return;
      [e.a, e.b].forEach(function (g) {
        if (graph.nodesByGuid[g] && graph.nodesByGuid[g].kind === 'room') {
          (doorRoomsByGuid[e.doorGuid] = doorRoomsByGuid[e.doorGuid] || []).push(g);
        }
      });
    });
    var occCount = { WARNING: 0 };
    doorRows.forEach(function (d) {
      var guid = d[0], name = d[1], storey = d[2], bx = d[3] || 0, by = d[4] || 0;
      var actualWidthM = Math.max(bx, by);
      var roomGuids = doorRoomsByGuid[guid];
      if (!roomGuids || !roomGuids.length) return; // no measured room connection — nothing to size against
      var occupantLoad = 0, seen = {};
      roomGuids.forEach(function (rg) { if (seen[rg]) return; seen[rg] = 1; occupantLoad += (roomAreaByGuid[rg] || 0) / OCCUPANT_LOAD_FACTOR_M2; });
      var requiredWidthM = occupantLoad * WIDTH_PER_OCCUPANT_M;
      if (requiredWidthM > actualWidthM) {
        occCount.WARNING++;
        rows.push({ guid: guid, ifc_class: 'IfcDoor', name: name, storey: storey, rule: 'door_occupant_capacity',
          severity: 'WARNING', ratio: actualWidthM,
          witness: opts.witness ? {
            actualWidthM: +actualWidthM.toFixed(3), requiredWidthM: +requiredWidthM.toFixed(3),
            occupantLoad: +occupantLoad.toFixed(1), roomsServed: roomGuids.length,
            reads: 'door is ' + actualWidthM.toFixed(2) + 'm wide but the room(s) it directly serves have an ' +
              'estimated occupant load of ' + occupantLoad.toFixed(0) + ' — IBC §1005.3.2 wants ' + requiredWidthM.toFixed(2) +
              'm for that load. LOCAL only: sums the room(s) this door directly connects to, not the full ' +
              'cumulative downstream convergence §1005.1 defines for a real capacity audit'
          } : undefined });
      }
    });
    log('§EGRESS rule=door_occupant_capacity severity=' + occCount.WARNING);

    // ── §EGRESS_WITNESS (prompts/STRUCTURAL_SANITY.md T8.12) — OPT-IN, default OFF.
    // "Isolated room" is the finding a reader most wants to disbelieve on sight, and the rule's
    // own evidence for it is an ABSENCE (no path found), which is exactly what a bare row cannot
    // show. This indexes the graph's own edges once so a flagged room can state its degree, its
    // actual neighbours, and whether its storey even HAS a circulation node to reach — the three
    // facts that separate "genuinely sealed off" from "the graph never connected it".
    var degree = null, neighbours = null, storeyHasCirc = null, exitCount = 0, comp = null;
    if (opts.witness) {
      degree = {}; neighbours = {}; storeyHasCirc = {};
      (graph.edges || []).forEach(function (e) {
        degree[e.a] = (degree[e.a] || 0) + 1; degree[e.b] = (degree[e.b] || 0) + 1;
        (neighbours[e.a] = neighbours[e.a] || []).push({ guid: e.b, via: e.kind, doorName: e.doorName || null });
        (neighbours[e.b] = neighbours[e.b] || []).push({ guid: e.a, via: e.kind, doorName: e.doorName || null });
      });
      (graph.nodes || []).forEach(function (n) { if (n.kind === 'circ') storeyHasCirc[n.storey] = true; });
      Object.keys(graph.nodesByGuid || {}).forEach(function (g) { if (g.indexOf('EXIT::') === 0) exitCount++; });
      comp = _components(graph);
      log('§EGRESS_WITNESS enabled nodes=' + (graph.nodes || []).length + ' edges=' + (graph.edges || []).length +
        ' exitNodes=' + exitCount + ' storeysWithCirc=' + Object.keys(storeyHasCirc).length +
        ' components=' + comp.count);
    }

    // ── T12.3 §ISOLATED_COMPONENT — union-find over the graph's own edge list. Returns, per
    // node, its component id, that component's size, and whether the component contains ANY
    // exit or circulation node. Deliberately topological only: no distances, no door
    // admissibility, none of escapeRoute's own logic — the witness must be able to disagree
    // with the rule, which it cannot do if it IS the rule.
    function _components(g) {
      var parent = {};
      function find(x) { while (parent[x] !== undefined && parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
      function union(a, b) { if (parent[a] === undefined) parent[a] = a; if (parent[b] === undefined) parent[b] = b; var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
      (g.nodes || []).forEach(function (n) { if (parent[n.guid] === undefined) parent[n.guid] = n.guid; });
      Object.keys(g.nodesByGuid || {}).forEach(function (k) { if (parent[k] === undefined) parent[k] = k; });
      (g.edges || []).forEach(function (e) { union(e.a, e.b); });
      // The target set is the RULE's, not a looser one: escapeRoute reaches any EXIT node, and
      // the fallback reaches a circulation node ON THE ROOM'S OWN STOREY only
      // (_circulationNodesOn above). Accepting another storey's circulation here would invent
      // disagreements the rule never had.
      var of = {}, size = {}, hasExit = {}, circStoreys = {}, roots = {};
      function _circStorey(gid, n) {
        if (n && n.storey != null) return String(n.storey);
        var i = gid.indexOf('::');
        if (i === -1) return null;
        var rest = gid.slice(i + 2), bar = rest.indexOf('|');
        return bar === -1 ? rest : rest.slice(0, bar);   // 'SPINE::Level 1|x|-7.00' -> 'Level 1'
      }
      Object.keys(parent).forEach(function (k) {
        var r = find(k);
        of[k] = r; roots[r] = 1;
        size[r] = (size[r] || 0) + 1;
        var n = (g.nodesByGuid || {})[k] || null;
        if (k.indexOf('EXIT::') === 0 || (n && n.kind === 'exit')) hasExit[r] = true;
        var isCirc = k.indexOf('CIRC::') === 0 || k.indexOf('SPINE::') === 0 ||
                     (n && (n.kind === 'circ' || n.kind === 'spine'));
        if (isCirc) {
          var st = _circStorey(k, n);
          if (st != null) (circStoreys[r] = circStoreys[r] || {})[st] = true;
        }
      });
      var perNode = {};
      Object.keys(of).forEach(function (k) { perNode[k] = size[of[k]]; });
      return {
        of: of, size: perNode, count: Object.keys(roots).length,
        // true when this node's component holds a target the rule itself would have aimed at
        hasTargetFor: function (guid, storey) {
          var r = of[guid];
          if (r === undefined) return false;
          return !!hasExit[r] || !!((circStoreys[r] || {})[String(storey)]);
        }
      };
    }

    // §EGRESS_HARDENING item 3 — OPT-IN (opts.protectedExitStair, default false/unset): every
    // existing caller (rule_checklist.js's showEgressSanity, the Sanity report's own "Longest path
    // to exit" headline stat) is UNCHANGED unless it explicitly passes this. Verified never worse,
    // often meaningfully shorter for upper-storey rooms (see common/room_graph.js's own header and
    // witness_egress_hardening.js) — left opt-in rather than the new default because it changes a
    // number the report already shows on screen; flipping the default is a decision for whoever
    // reviews this PR, not something to silently ship.
    var escapeFn = (opts.protectedExitStair && RoomGraph.escapeRouteViaProtectedStair)
      ? RoomGraph.escapeRouteViaProtectedStair : RoomGraph.escapeRoute;
    graph.nodes.forEach(function (r) {
      var esc = escapeFn(graph, r.guid, { log: function () {} });
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
              // T12.3 — the fact that can actually CONTRADICT this rule. "Has an edge"
              // (graphDegree) cannot: the rule's claim is that no route reaches an exit or this
              // storey's circulation spine, and a room wired only to another sealed room is
              // exactly that. Plain undirected connectivity over graph.edges is strictly weaker
              // than escapeRoute's weighted, door-aware search, so a component that DOES hold an
              // exit or circ node while the rule reports "isolated" is a real disagreement.
              componentSize: comp.size[r.guid] || 1,
              componentHasExitOrCirc: comp.hasTargetFor(r.guid, r.storey),
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

    // LARGE_DB_BAKE.md §2 L1 — this is "the egress rule" the raster is for: without
    // storey_walkable_raster, every room's shortestPath() fallback above legalizes its chords from
    // scratch (rect/corridor scan instead of an O(1) bitset lookup). A building that never grew a
    // raster paid that cost silently unless a session went looking for it in the per-call
    // §PATH_LEGAL lines; this is the one summary line that stops that being silent.
    if (!graph.rasters || !Object.keys(graph.rasters).length) {
      var _lgSt = graph._legalizeStats;
      if (_lgSt && _lgSt.calls) {
        var _bnRows = dbQuery("SELECT value FROM project_metadata WHERE key='building_name'") || [];
        var _bname = (_bnRows[0] && _bnRows[0][0]) || 'unknown';
        log('§PATH_LEGAL_NO_RASTER building=' + _bname + ' legalizations=' + _lgSt.legalized +
          ' calls=' + _lgSt.calls + ' ms=' + _lgSt.ms.toFixed(1));
      }
    }

    // ══ Rule 6: common path of egress travel (§12.1) ═══════════════════════════════════════════
    // IBC 2021 §1006.2.1: the distance from the most remote point in a space to where an occupant
    // FIRST gains a choice of two paths. RoomGraph.escapeRoutes() gives every reachable exit from
    // ONE Dijkstra and RoomGraph.divergenceFrom() finds where the two nearest part — the lowest
    // common ancestor in that search's own shortest-path tree, so this costs one search per room,
    // the same the rules above already pay.
    var cpRule = byName.common_path_of_egress_travel || _fallback('common_path_of_egress_travel');
    var cpLimit = cpRule.critical_m;                   // the UNSPRINKLERED figure — see _sprinklerEvidence
    var cpCount = { WARNING: 0 }, cpNoChoice = 0, cpMeasured = 0, cpSkipped = 0;
    if (RoomGraph.escapeRoutes && RoomGraph.divergenceFrom && cpLimit > 0) {
      graph.nodes.forEach(function (r) {
        var er = RoomGraph.escapeRoutes(graph, r.guid, { log: function () {} });
        if (!er || !er.routes.length) { cpSkipped++; return; }   // no exit at all — isolated_room already owns that
        var A0 = er.routes[0];
        // ONE reachable exit, or a runner-up whose path merely extends the winner's: either way
        // the occupant never gets a choice. Reported as its own state, NEVER as a big number —
        // an infinite common path is not "a long one" (§12.1).
        var div = er.routes.length > 1 ? RoomGraph.divergenceFrom(A0.path, er.routes[1].path) : null;
        if (!div) {
          cpNoChoice++;
          rows.push({ guid: r.guid, ifc_class: 'IfcSpace', name: r.name, storey: r.storey,
            rule: 'common_path_of_egress_travel', severity: 'WARNING', ratio: null,
            target: 'no second path exists', witness: opts.witness ? {
              exitsReachable: er.routes.length, limitM: cpLimit,
              reads: er.routes.length === 1
                ? 'only ONE exit is reachable from this room, so there is no point at which the occupant gains a choice — the common path is the WHOLE route and no finite number describes it'
                : 'every reachable exit lies along one route out of this room (no branch point), so the occupant never gains a choice — the common path is the whole route'
            } : undefined });
          return;
        }
        // Measure along the SAME anchors the route is built from — IN METRES.
        // ⚠ `route.distance` is a penalty-weighted Dijkstra COST, not a length
        // (§UTILITY-ROUTING-PENALTY multiplies utility-room edges by 8), so it is NEVER compared
        // with, or reported as, a distance here. Both figures below are real metres; the cost is
        // carried separately and labelled as a cost. This is the same trap
        // ESCAPE_ROUTE_REVEAL.md §8 documents, and the first cut of this rule fell straight into
        // it — the witness caught a 117.1 m common path against a "108.7 m" route.
        function _mLen(path, upto) {
          var m = 0;
          for (var i = 1; i <= upto; i++) {
            var a = graph.nodesByGuid[path[i - 1]], b = graph.nodesByGuid[path[i]];
            if (!a || !b) continue;
            m += Math.hypot(b.cx - a.cx, b.cy - a.cy, (b.cz || 0) - (a.cz || 0));
          }
          return m;
        }
        var cpM = _mLen(A0.path, div.index);
        var routeM = _mLen(A0.path, A0.path.length - 1);
        cpMeasured++;
        if (cpM < cpLimit) return;
        cpCount.WARNING++;
        rows.push({ guid: r.guid, ifc_class: 'IfcSpace', name: r.name, storey: r.storey,
          rule: 'common_path_of_egress_travel', severity: 'WARNING', ratio: cpM,
          target: 'divergence at ' + div.node, witness: opts.witness ? {
            limitM: cpLimit, limitMSprinklered: cpRule.critical_m_sprinklered,
            sprinklerHeads: sprinklers.heads, exitsReachable: er.routes.length,
            divergenceNode: div.node, hopsToDivergence: div.index,
            routeM: +routeM.toFixed(2), commonPathShareOfRoute: routeM > 0 ? +(cpM / routeM).toFixed(3) : null,
            // COSTS, named as costs — penalty-weighted, not lengths. See the note above.
            nearestExitCost: +A0.distance.toFixed(2), secondExitCost: +er.routes[1].distance.toFixed(2),
            reads: 'measured from the room CENTROID, not the most remote point in the space as ' +
              '§1006.2.1 specifies — this UNDERSTATES the regulated quantity by roughly half the ' +
              'room\'s own diagonal, so this rule UNDER-flags (the opposite bias to ' +
              'circulation_distance). The limit applied is the UNSPRINKLERED ' + cpLimit + 'm; ' +
              (sprinklers.present
                ? sprinklers.heads + ' sprinkler heads exist in this model, so the ' + cpRule.critical_m_sprinklered +
                  'm sprinklered figure MAY apply — head count cannot establish "equipped throughout"'
                : 'no sprinkler heads found in this model') +
              '. Occupancy class is not extracted, so Table 1006.2.1\'s row is assumed.'
          } : undefined });
      });
      log('§EGRESS rule=common_path_of_egress_travel severity=' + cpCount.WARNING +
        ' noChoice=' + cpNoChoice + ' measured=' + cpMeasured + ' skippedNoExit=' + cpSkipped +
        ' limit=' + cpLimit + 'm (unsprinklered; sprinklered would be ' + cpRule.critical_m_sprinklered + 'm)');
    } else {
      log('§EGRESS rule=common_path_of_egress_travel SKIPPED — RoomGraph.escapeRoutes/divergenceFrom' +
        ' unavailable (older cached room_graph.js) or no limit in the rulebook');
    }

    // ══ Rule 7: exit remoteness (§12.2) ════════════════════════════════════════════════════════
    // The computation lives in exitRemoteness() below and is EXPORTED — Hospital passes this rule,
    // so a green line here would otherwise only prove the rule is quiet. A witness needs to be able
    // to hand it a storey that must fail. Same precedent as room_graph.js exporting
    // chordIllegalCount/astarHop purely so a harness can measure without re-implementing.
    var remRule = byName.exit_remoteness || _fallback('exit_remoteness');
    var remRows = exitRemoteness(graph, remRule, sprinklers, opts.witness);
    remRows.forEach(function (r) { rows.push(r); });
    log('§EGRESS rule=exit_remoteness severity=' + remRows.length +
      ' storeysWithExits=' + Object.keys(_exitsByStorey(graph)).length +
      ' ratio=' + remRule.ratio_unsprinklered +
      ' (unsprinklered; sprinklered would be ' + remRule.ratio_sprinklered + ')');

    return rows;
  }

  return { evaluate: evaluate, FALLBACK_RULES: FALLBACK_RULES,
           // §12.2 — exported for the red control; see exitRemoteness()'s own header.
           exitRemoteness: exitRemoteness };
});
