// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// structural_sanity.js — "Sanity" rule evaluator (prompts/STRUCTURAL_SANITY.md T2).
// PORTABLE by construction, same contract as common/room_graph.js: dbQuery(sql, params) -> rows
// (array of arrays) in, plain JS out, no DOM/THREE.js — so the exact same code path a Node
// witness runs is the code path the browser panel runs (viewer/measure.js's A.dbQuery has this
// same signature). No new DB, no new R-tree table — reuses element_transforms + elements_meta
// (SOURCE OF TRUTH), and does the support/continuity spatial checks as one in-memory pass since
// the STR dataset is small (thousands, not the 48k+ that justifies a real spatial index) — see
// EXECUTE below for the measured Hospital numbers this was validated against.
//
// EXECUTE — algorithm decisions made here, validated against real buildings/Hospital_meta.db by
// a throwaway Node prototype before this file was written (Spec-First, Prime Directive):
//   - Beam long axis = max(bbox_x, bbox_y) (rotation_z confirmed 0 for all Hospital STR beams/
//     columns — same fact EGRESS_SANITY.md's SOURCE OF TRUTH cites for doors). Depth = bbox_z
//     (confirmed against a real 533x210x92UB row: bbox_z=0.5331, matches the 533mm web height).
//   - Floating member support test = a point-in-footprint (horizontal, within tolerance_m) +
//     Z-bracket (support's [zmin,zmax] within tolerance_m of the beam end's z) test for vertical
//     supports, OR a same-level framing test (another beam whose zmin is within framing_dz_m and
//     whose footprint contains the endpoint). Real count: 43/1970 (2.2%), Level 6:26 Level 7:8
//     Level 3-5:9 — matches STRUCTURAL_SANITY.md's VALIDATION section exactly.
//   - Column continuity uses a CENTERLINE distance test (horizontal distance between the column's
//     own center and a candidate support's center, within tolerance_m), not a footprint-overlap
//     test — footprint overlap at tolerance_m=0.3 undercounted (12/255) because it's too lenient;
//     a footprint-overlap test conflates "roughly under" with "aligned load path". Centerline +
//     support-top-near-column-bottom ("touch", within tolerance_m) gives 24/255 (9.4%) at the
//     default 0.3m tolerance on real Hospital data — same order of magnitude and same qualitative
//     0.15->0.3 drop-then-plateau shape as STRUCTURAL_SANITY.md's own validation (55->22,
//     plateau 17-18); the exact count differs because this is an independently-derived test
//     against the spec's prose description, not a copy of an earlier session's code. Recorded
//     here, not silently overwritten, per Prime Directive (every number traces to a real query).
//   - Span/depth combined (steel+cantilever, Hospital has 0 concrete-named beams; floating beams
//     are excluded from span/depth scoring per rule 1 — "independent of span/depth") flags
//     421/1970 (21.4%), measured by this file's own real witness run (tests/
//     test_structural_sanity_rules.js): steel 204 WARNING (7 would be CRITICAL uncapped) of 1736
//     non-floating steel beams; cantilever 217 WARNING (199 would be CRITICAL uncapped) of 234.
//     Same ballpark and same conclusion as STRUCTURAL_SANITY.md's ~23% figure. All ship WARNING-
//     ceiling only per max_severity in structural_rules.json — the uncapped count is logged
//     (§ line) but never surfaces as CRITICAL in a row's severity.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.StructuralSanity = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ══ §RULE_FALLBACK_ONE_SOURCE (prompts/STRUCTURAL_SANITY.md T8.13) ═══════════════════════════
  // THE ONE LITERAL. Every threshold this file can apply without a rules file is written HERE and
  // nowhere else. It is a verbatim copy of viewer/rates/structural_rules.json — the AUTHORED
  // source — kept in JS because a browser cannot read that file synchronously when the fetch for
  // it has just failed.
  //
  // ⚠ Before T8.13 this object existed THREE times: here (as per-rule inline `byName.x || {...}`
  // defaults), in rule_checklist.js as STRUCTURAL_RULES_FALLBACK, and again in
  // rule_findings_film.js. They HAD already drifted across a branch boundary — the film branch
  // carries span_depth_concrete 20/26 and door_clear_width 0.80 where main carries the #1715
  // cited values 16/21 and 0.813 — which is exactly how a bake reports 205 findings for a
  // building main's own evaluators score at 203. One literal, or that recurs.
  //
  // Changing a number here changes it for the panel, the film and the report at once. If you
  // change one, change rates/structural_rules.json to match — T8.13's witness fails otherwise.
  var FALLBACK_RULES = {
    structural_rules: [
      { name: 'floating_member', applies_to: ['IfcBeam'], tolerance_m: 0.15, framing_dz_m: 0.4 },
      { name: 'span_depth_steel', applies_to: ['IfcBeam'], material: 'steel',
        name_hints: ['UB', 'UC', 'Channel', 'HSS'], cantilever: false,
        warning_ratio: 24, critical_ratio: 30, max_severity: 'WARNING' },
      { name: 'span_depth_concrete', applies_to: ['IfcBeam'], material: 'concrete',
        name_hints: ['Concrete', 'RC'], cantilever: false,
        warning_ratio: 16, critical_ratio: 21, max_severity: 'WARNING' },
      { name: 'span_depth_cantilever', applies_to: ['IfcBeam'], cantilever: true,
        warning_ratio: 12, critical_ratio: 16, max_severity: 'WARNING' },
      { name: 'column_continuity', applies_to: ['IfcColumn'], tolerance_m: 0.3 }
    ]
  };
  function _fallback(name) {
    var rs = FALLBACK_RULES.structural_rules;
    for (var i = 0; i < rs.length; i++) if (rs[i].name === name) return rs[i];
    return {};
  }

  // ══ §SUPPORT_CLASS_PARITY (prompts/STRUCTURAL_SANITY.md T9.1) ════════════════════════════════
  // `IfcWall` was missing from BOTH lists. IfcWall vs IfcWallStandardCase is an EXPORTER choice,
  // not a structural distinction — a beam bearing on a wall is bearing on a wall either way.
  // MEASURED on the fleet: Terminal models all 333 of its walls as IfcWall and has ZERO
  // IfcWallStandardCase, so before this line a Terminal column could only be supported by another
  // column; 108 beam free-ends and 1 column rejection across the fleet sat on an IfcWall.
  //
  // For COLUMNS, IfcSlab (80 fleet rejections), IfcBeam (51) and IfcMember (9) are added too: a
  // column landing on a transfer slab, a transfer beam or a truss member is real structure. The
  // continuity test is not made vacuous by this — it still requires the support's TOP within
  // tolerance_m of the column's BOTTOM, which finishes and services never satisfy.
  //
  // ══ §SLAB_BEARING (T9.3) — IfcSlab IS a beam support, and the z-bracket already makes it safe ═
  // Held back through T9.1 on the worry that a slab spans a whole floor, so its footprint contains
  // nearly every beam at that level and adding it would make floating_member vacuous. MEASURED,
  // that worry was wrong on the mechanism: the vertical test is
  //     if (pt.z < sb.zmin - tol || pt.z > sb.zmax + tol) continue;
  // and `pt.z` is the beam's CENTRE. A beam hanging BELOW a slab has its centre under the slab's
  // zmin and is rejected — which is the case that must stay flagged. Only a beam whose centre
  // lies within the slab's own z-range is admitted, and such a beam is inside the floor plate, not
  // suspended in space.
  //
  // The evidence: of the 247 remaining fleet DEFECTS (load-bearing geometry inside the rule's own
  // 0.15 m tolerance), 246 are IfcSlab. Of those, 201 have the slab OVERLAPPING the beam's z-range
  // and only 3 have it entirely above. Slab footprints are whole floors — median long side 48.8 m,
  // p90 119.6 m — which is exactly why "is the end near a slab EDGE" is the wrong question: at
  // p50 the endpoint is 0.76 m from an edge and at p90 it is 5.95 m, and neither says anything
  // about whether the beam has a load path.
  //
  // Non-vacuity is guarded by a fixture: a beam suspended BELOW a slab must still flag CRITICAL.
  var SUPPORT_CLASSES = ['IfcColumn', 'IfcWall', 'IfcWallStandardCase', 'IfcFooting', 'IfcMember', 'IfcPlate', 'IfcSlab'];
  var COL_SUPPORT_CLASSES = ['IfcColumn', 'IfcWall', 'IfcWallStandardCase', 'IfcFooting', 'IfcSlab', 'IfcBeam', 'IfcMember'];

  function bbox(row) {
    // row: [guid, ifc_class|name, storey, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z]
    var cx = row[3], cy = row[4], cz = row[5], bx = row[6] || 0, by = row[7] || 0, bz = row[8] || 0;
    return {
      cx: cx, cy: cy, cz: cz, bx: bx, by: by, bz: bz,
      xmin: cx - bx / 2, xmax: cx + bx / 2,
      ymin: cy - by / 2, ymax: cy + by / 2,
      zmin: cz - bz / 2, zmax: cz + bz / 2
    };
  }

  function beamEndpoints(b) {
    var longX = b.bx >= b.by;
    var half = (longX ? b.bx : b.by) / 2;
    if (longX) return [{ x: b.cx - half, y: b.cy, z: b.cz }, { x: b.cx + half, y: b.cy, z: b.cz }];
    return [{ x: b.cx, y: b.cy - half, z: b.cz }, { x: b.cx, y: b.cy + half, z: b.cz }];
  }

  function pointInFootprint(pt, s, tol) {
    return pt.x >= s.xmin - tol && pt.x <= s.xmax + tol &&
           pt.y >= s.ymin - tol && pt.y <= s.ymax + tol;
  }

  // ── Rule 1: floating member (also feeds rules 2-4's supportedCount classification) ──
  // ── §STRUCT_WITNESS (T8.12): what actually sits at an end the rule judged UNSUPPORTED.
  // `anyRows` is the WIDE candidate set (every class, every discipline) that the rule itself does
  // NOT consult — the point is to show the reader the element the rule could not count, so
  // "floating" and "cantilever" can be eyeballed instead of taken on trust. Returns null when
  // genuinely nothing is near. Distances are real, never rounded away.
  //
  // ══ T12.3 — PUBLISHED AT 6 dp, AND A BEAM CANDIDATE CARRIES ITS FRAMING DATUM ═══════════════
  // These numbers are not decoration: `artifactRates` compares the PUBLISHED value against the
  // rule's own tolerance to decide defect vs near-miss. At `toFixed(3)` a real 0.300001621 m gap
  // prints as `0.3` and reads as INSIDE a 0.3 m tolerance the rule measured it OUTSIDE of — which
  // is how four LTU_AHouse columns became "defects" the rule had judged correctly (T12.1). µm on
  // metres is the precision that separates inside from outside here, so it earns its digits.
  //
  // `topDzM`/`bottomDzM` exist for the same reason. An `IfcBeam` is load-bearing, but this rule
  // admits one ONLY through the §FRAMING_TOP_OF_STEEL path — top- or bottom-flush within
  // `framing_dz_m`, then footprint — never by bare 3D proximity. Without the two datums published,
  // the metric cannot apply the condition the rule applies, and a parallel precast beam running
  // end-to-end half a metre higher reads as proof of support (T12.1 row 6). Null for a
  // non-beam candidate, whose support test really is the z-bracket `gapVertM` already carries.
  function _nearestAtPoint(pt, anyRows, selfGuid, horizTol, vertTol, subj) {
    var best = null;
    for (var i = 0; i < anyRows.length; i++) {
      var r = anyRows[i];
      if (r[0] === selfGuid) continue;
      var b = bbox(r);
      var dxy = Math.max(0, Math.max(b.xmin - pt.x, pt.x - b.xmax));
      var dy = Math.max(0, Math.max(b.ymin - pt.y, pt.y - b.ymax));
      dxy = Math.sqrt(dxy * dxy + dy * dy);
      if (dxy > horizTol) continue;
      var dz = (pt.z < b.zmin) ? (b.zmin - pt.z) : (pt.z > b.zmax ? pt.z - b.zmax : 0);
      if (dz > vertTol) continue;
      var d = dxy + dz;
      if (!best || d < best._d) best = { guid: r[0], ifc_class: r[9] || null, name: r[1],
        gapHorizM: +dxy.toFixed(6), gapVertM: +dz.toFixed(6), topDzM: null, bottomDzM: null, _d: d, _b: b };
    }
    if (best) {
      if (subj && best.ifc_class === 'IfcBeam') {
        best.topDzM = +Math.abs(best._b.zmax - subj.zmax).toFixed(6);
        best.bottomDzM = +Math.abs(best._b.zmin - subj.zmin).toFixed(6);
      }
      delete best._d; delete best._b;
    }
    return best;
  }

  function _supportChecks(beams, supports, tolerance_m, framing_dz_m, anyRows, framingCandidates) {
    // out[guid] = { supportedCount: 0|1|2, span, depth, freeEnds:[witness] }
    var out = {};
    for (var i = 0; i < beams.length; i++) {
      var beam = beams[i];
      var bb = bbox(beam);
      var ends = beamEndpoints(bb);
      var supportedCount = 0;
      var freeEnds = [];
      for (var e = 0; e < ends.length; e++) {
        var pt = ends[e];
        var found = false;
        // (a) vertical support element, Z-bracketed
        for (var s = 0; s < supports.length; s++) {
          var sb = bbox(supports[s]);
          if (pt.z < sb.zmin - tolerance_m || pt.z > sb.zmax + tolerance_m) continue;
          if (!pointInFootprint(pt, sb, tolerance_m)) continue;
          found = true; break;
        }
        // (b) another beam framing in at the same level.
        //
        // ══ §FRAMING_TOP_OF_STEEL (T9.2) — THIS TEST USED THE WRONG DATUM ═══════════════════
        // It compared BOTTOMS (`ob.zmin - bb.zmin`). Steel frames to TOP of steel: a shallower
        // beam framing into a deeper one has its top flush and its bottom high. MEASURED on
        // Hospital_meta.db: of the 55 beam-to-beam free ends among the 43 flagged floating
        // members, 55/55 were rejected by the bottom test and 55/55 would pass a top test — a
        // typical pair being a 0.355 m beam into a 0.841 m beam, tops 4 mm apart and bottoms
        // 482 mm apart. The bake DBs name the storeys "Level 6 TOS", "Level 7 TOS" — Top Of
        // Steel — so the model states the convention the test was ignoring.
        //
        // Accept EITHER datum: top-flush (the steel norm) or bottom-flush (soffit-aligned
        // concrete framing, which the original test was right about). Widening to two datums
        // cannot hide a genuinely unsupported end — nothing is near either way.
        if (!found) {
          var cands = framingCandidates || beams;
          for (var j = 0; j < cands.length; j++) {
            if (cands[j][0] === beam[0]) continue;
            var ob = bbox(cands[j]);
            var topAligned = Math.abs(ob.zmax - bb.zmax) <= framing_dz_m;
            var botAligned = Math.abs(ob.zmin - bb.zmin) <= framing_dz_m;
            if (!topAligned && !botAligned) continue;
            if (!pointInFootprint(pt, ob, tolerance_m)) continue;
            found = true; break;
          }
        }
        if (found) supportedCount++;
        // Witness only for the ends the rule REJECTED — a supported end needs no explaining.
        // Search radius is deliberately WIDER than the rule's own tolerance (4x horizontal, 1m
        // vertical) so a near-miss shows up as a near-miss instead of as nothing.
        else if (anyRows) freeEnds.push({ end: e, at: { x: +pt.x.toFixed(2), y: +pt.y.toFixed(2), z: +pt.z.toFixed(2) },
          nearest: _nearestAtPoint(pt, anyRows, beam[0], tolerance_m * 4, 1.0, bb) });
      }
      out[beam[0]] = { supportedCount: supportedCount, span: Math.max(bb.bx, bb.by), depth: bb.bz, freeEnds: freeEnds };
    }
    return out;
  }

  // ── Rule 5: column load-path continuity — centerline distance, not footprint overlap ──
  function _columnContinuity(columns, supports, tolerance_m, anyRows) {
    var out = {};
    for (var i = 0; i < columns.length; i++) {
      var col = columns[i];
      var cb = bbox(col);
      var found = false;
      for (var s = 0; s < supports.length; s++) {
        if (supports[s][0] === col[0]) continue;
        var sb = bbox(supports[s]);
        var dx = cb.cx - sb.cx, dy = cb.cy - sb.cy;
        if (Math.sqrt(dx * dx + dy * dy) > tolerance_m) continue;
        // support's top must be near this column's bottom (storey immediately below / foundation)
        if (Math.abs(sb.zmax - cb.zmin) > tolerance_m) continue;
        found = true; break;
      }
      var witness = null;
      if (!found && anyRows) {
        // §STRUCT_WITNESS — what IS under this column, across EVERY class (not just
        // COL_SUPPORT_CLASSES), at a deliberately looser radius than the rule's own. This is the
        // difference between "nothing is there" and "an IfcMember is there, 0.42 m out, and the
        // rule cannot count an IfcMember" — the reader can tell those apart at a glance.
        var best = null;
        for (var k = 0; k < anyRows.length; k++) {
          var r = anyRows[k];
          if (r[0] === col[0]) continue;
          var b = bbox(r);
          var ddx = cb.cx - b.cx, ddy = cb.cy - b.cy;
          var dxy = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dxy > tolerance_m * 4) continue;
          var dz = Math.abs(b.zmax - cb.zmin);
          if (dz > 1.0) continue;
          var d = dxy + dz;
          // T12.3 — 6 dp, and the SIGNED gap alongside the absolute one. `topToColumnBaseM` is
          // an absolute value, so a candidate whose top sits 0.30 m ABOVE this column's base
          // measures identically to one sitting 0.30 m BELOW it. The four LTU_AHouse columns
          // that read as defects at handover were each an ARC twin of the same physical column,
          // sharing its top plane and running 0.25 m past its bottom — a thing that CONTAINS the
          // column, not a thing that holds it up. `topBelowColumnBaseM` is positive only when the
          // candidate really is underneath.
          //
          // `topAboveColumnTopM` is the one comparison here that does NOT sit on a knife edge.
          // Two of these twins measure 0.300000190 m from the column's base against a 0.3 m
          // tolerance — a 190 nm difference, which is float noise on a building, not geometry,
          // and no rounding can decide it honestly. But the twin and the column share a top
          // plane EXACTLY (identical doubles, 8.200000762939453), so "does this candidate reach
          // as high as the column itself" is decided by an equality that is exact. A support
          // below a column always has its top under the column's top; a co-located duplicate
          // does not.
          if (!best || d < best._d) best = { guid: r[0], ifc_class: r[9] || null, name: r[1],
            centrelineOffsetM: +dxy.toFixed(6), topToColumnBaseM: +dz.toFixed(6),
            topBelowColumnBaseM: +(cb.zmin - b.zmax).toFixed(6),
            topAboveColumnTopM: +(b.zmax - cb.zmax).toFixed(6), _d: d };
        }
        if (best) {
          delete best._d;
          best.rejectedBecause = (best.centrelineOffsetM > tolerance_m ? 'centreline offset > tolerance ' + tolerance_m + ' m' : null) ||
            (best.topAboveColumnTopM >= 0 ? 'its top reaches ' + best.topAboveColumnTopM + ' m ABOVE this column\'s own top — a co-located duplicate, not something underneath the column' : null) ||
            (best.topBelowColumnBaseM < -tolerance_m ? 'its top is ' + (-best.topBelowColumnBaseM) + ' m above this column\'s base — it overlaps the column rather than sitting below it' : null) ||
            (best.topToColumnBaseM > tolerance_m ? 'top-to-base gap > tolerance ' + tolerance_m + ' m' : null) ||
            (COL_SUPPORT_CLASSES.indexOf(best.ifc_class) === -1 ? best.ifc_class + ' is not a column-support class (' + COL_SUPPORT_CLASSES.join('/') + ')' : 'unknown');
        }
        witness = { nearestBelow: best, columnBaseZ: +cb.zmin.toFixed(2) };
      }
      out[col[0]] = { supported: found, witness: witness };
    }
    return out;
  }

  function _matchesHints(name, hints) {
    name = name || '';
    for (var i = 0; i < hints.length; i++) if (name.indexOf(hints[i]) >= 0) return true;
    return false;
  }

  function _severityForRatio(ratio, rule) {
    if (ratio >= rule.critical_ratio) return rule.max_severity === 'WARNING' ? 'WARNING' : 'CRITICAL';
    if (ratio >= rule.warning_ratio) return 'WARNING';
    return null;
  }

  /**
   * Evaluate all structural_rules against real STR elements.
   * @param {function} dbQuery - (sql, params?) -> array of row arrays
   * @param {object} rules - parsed structural_rules.json ({ structural_rules: [...] })
   * @param {object} [opts] - { log: fn(msg) } — defaults to console.log
   * @returns {Array<{guid,ifc_class,name,storey,rule,severity,ratio}>}
   */
  function evaluate(dbQuery, rules, opts) {
    opts = opts || {};
    var log = opts.log || (typeof console !== 'undefined' ? console.log.bind(console) : function () {});

    var byName = {};
    (rules.structural_rules || []).forEach(function (r) { byName[r.name] = r; });
    // T8.13 — defaults come from the ONE literal above, never re-typed per call site.
    var floatingRule = byName.floating_member || _fallback('floating_member');
    var steelRule = byName.span_depth_steel || _fallback('span_depth_steel');
    var concreteRule = byName.span_depth_concrete || _fallback('span_depth_concrete');
    var cantileverRule = byName.span_depth_cantilever || _fallback('span_depth_cantilever');
    var columnRule = byName.column_continuity || _fallback('column_continuity');

    var beamRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.discipline = 'STR' AND em.ifc_class = 'IfcBeam'"
    );
    // ══ §SUPPORT_NOT_DISCIPLINE_FILTERED (T9.4) — THE ROOT DEFECT ══════════════════════════════
    // These support queries used to carry `em.discipline = 'STR'`. `discipline` is a label the
    // EXTRACTION assigns for view/layer purposes — it is not a structural fact, and a column holds
    // a beam up whether an exporter tagged it ARC or STR.
    //
    // MEASURED across the fleet, elements in a SUPPORT class that the STR filter hid:
    //   Hospital  349 of 604 IfcColumn (58%), 1282 IfcWallStandardCase, 158 IfcWall, 2211 IfcPlate
    //   Terminal  ALL 333 IfcWall, ALL 705 IfcSlab, 33,324 IfcPlate — its walls and slabs are
    //             entirely ARC, so before this change nothing but a column could support anything
    //   LTU       780 of 1785 IfcColumn, 2408 IfcWallStandardCase, 896 IfcSlab
    // The five Hospital beams still flagged floating after the class-list and datum fixes each sat
    // on an IfcWall at gapHoriz 0 m / gapVert 0 m — touching — and the rule could not see it
    // because that wall is discipline ARC.
    //
    // The SUBJECT of a rule stays STR-filtered (we check structural beams and columns). What may
    // HOLD SOMETHING UP is selected by ifc_class alone. Those are different questions and only one
    // of them is about which drawing layer an element was exported on.
    var colClassesSql = "'" + SUPPORT_CLASSES.join("','") + "'";
    var supportRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class IN (" + colClassesSql + ")"
    );
    var colRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.discipline = 'STR' AND em.ifc_class = 'IfcColumn'"
    );
    var colSupportClassesSql = "'" + COL_SUPPORT_CLASSES.join("','") + "'";
    var colSupportRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class IN (" + colSupportClassesSql + ")"   // §SUPPORT_NOT_DISCIPLINE_FILTERED
    );

    // ── §STRUCT_WITNESS (prompts/STRUCTURAL_SANITY.md T8.12) — OPT-IN, default OFF.
    // The rules above deliberately look only at STR-discipline support classes. That is what
    // makes a "floating" or "unsupported" verdict cheap — and also what makes it unreadable: the
    // user cannot tell "nothing is there" from "something is there that this rule cannot count".
    // With opts.witness, ONE extra query fetches every element that has a transform, across every
    // class and discipline, purely so a flagged row can name the neighbour it was measured
    // against. It changes NO count and produces NO row — R12 asserts exactly that.
    var anyRows = null;
    if (opts.witness) {
      anyRows = dbQuery(
        "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z, em.ifc_class " +
        "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid"
      );
      log('§STRUCT_WITNESS enabled candidates=' + anyRows.length + ' (every class/discipline with a transform — evidence only, never a rule input)');
    }

    var rows = [];

    // §SUPPORT_NOT_DISCIPLINE_FILTERED also applies to the beam-framing half of the support test:
    // an ARC-tagged beam frames a STR beam just as well. Subject list stays STR; candidate list does not.
    var framingRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.ifc_class = 'IfcBeam'"
    );

    // Rule 1 (+ classification feeding rules 2-4)
    var support = _supportChecks(beamRows, supportRows, floatingRule.tolerance_m, floatingRule.framing_dz_m, anyRows, framingRows);
    var floatingCount = { CRITICAL: 0 };
    var unmatched = 0;
    var spanDepthCounts = { span_depth_steel: { WARNING: 0, uncapped_critical: 0 }, span_depth_concrete: { WARNING: 0, uncapped_critical: 0 }, span_depth_cantilever: { WARNING: 0, uncapped_critical: 0 } };

    beamRows.forEach(function (b) {
      var guid = b[0], name = b[1], storey = b[2];
      var sup = support[guid];
      if (sup.supportedCount === 0) {
        rows.push({ guid: guid, ifc_class: 'IfcBeam', name: name, storey: storey, rule: 'floating_member', severity: 'CRITICAL', ratio: null,
          witness: anyRows ? { supportedEnds: 0, of: 2, freeEnds: sup.freeEnds,
            reads: 'neither end found a support within ' + floatingRule.tolerance_m + ' m; `nearest` is what actually sits there, searched at 4x that radius across every class' } : undefined });
        floatingCount.CRITICAL++;
        return; // floating members aren't also scored for span/depth
      }
      var ratio = sup.depth > 0 ? sup.span / sup.depth : 0;
      var isCantilever = sup.supportedCount === 1;
      var ruleName, rule;
      if (isCantilever) {
        ruleName = 'span_depth_cantilever'; rule = cantileverRule;
      } else if (_matchesHints(name, steelRule.name_hints || [])) {
        ruleName = 'span_depth_steel'; rule = steelRule;
      } else if (_matchesHints(name, concreteRule.name_hints || [])) {
        ruleName = 'span_depth_concrete'; rule = concreteRule;
      } else {
        unmatched++;
        return; // no material signal — not scored, not silently guessed (Prime Rule)
      }
      var uncappedCrit = ratio >= rule.critical_ratio;
      if (uncappedCrit) spanDepthCounts[ruleName].uncapped_critical++;
      var sev = _severityForRatio(ratio, rule);
      if (sev) {
        spanDepthCounts[ruleName].WARNING += (sev === 'WARNING' ? 1 : 0);
        var w;
        if (anyRows) {
          w = { supportedEnds: sup.supportedCount, of: 2, spanM: +sup.span.toFixed(3), depthM: +sup.depth.toFixed(3),
                warningRatio: rule.warning_ratio, criticalRatio: rule.critical_ratio };
          if (isCantilever) {
            // The single highest-value witness in this file. `isCantilever` is an INFERENCE
            // (supportedCount === 1) that preempts material classification, and it routes the
            // beam to a 12/16 ratio instead of its material's own. Naming what sits at the
            // un-counted end lets the reader see at once whether this is a real cantilever.
            w.freeEnds = sup.freeEnds;
            w.classifiedAs = 'cantilever';
            w.classifiedBy = 'inference: exactly one end found a support — NOT a modelled cantilever attribute (none exists in this schema)';
            w.wouldBeCleanUnderSteelRule = (steelRule.warning_ratio != null && ratio < steelRule.warning_ratio);
            w.reads = 'if `nearest` at the free end is real bearing, this beam is not a cantilever and the 12/16 ratio does not apply to it';
          }
        }
        rows.push({ guid: guid, ifc_class: 'IfcBeam', name: name, storey: storey, rule: ruleName, severity: sev, ratio: ratio, witness: w });
      }
    });

    log('§STRUCT_SANITY rule=floating_member severity=' + floatingCount.CRITICAL);
    log('§MATERIAL_INFERRED unmatched=' + unmatched);
    ['span_depth_steel', 'span_depth_concrete', 'span_depth_cantilever'].forEach(function (rn) {
      log('§STRUCT_SANITY rule=' + rn + ' severity=' + spanDepthCounts[rn].WARNING + ' uncapped_critical=' + spanDepthCounts[rn].uncapped_critical);
    });

    // Rule 5: column continuity
    var colContinuity = _columnContinuity(colRows, colSupportRows, columnRule.tolerance_m, anyRows);
    var unsupportedColCount = 0;
    var colLowestZ = null;
    colRows.forEach(function (c) { var z = bbox(c).zmin; if (colLowestZ === null || z < colLowestZ) colLowestZ = z; });
    colRows.forEach(function (c) {
      var guid = c[0], name = c[1], storey = c[2];
      if (!colContinuity[guid].supported) {
        var w;
        if (anyRows) {
          w = colContinuity[guid].witness || {};
          w.toleranceM = columnRule.tolerance_m;
          w.supportClasses = COL_SUPPORT_CLASSES.slice();
          // A column standing on the model's lowest plane with no footing under it is the single
          // commonest false positive this rule produces (a real building measured 131/131 of its
          // ground-floor columns flagged, with 0 IfcFooting anywhere). Say so on the row.
          w.atLowestModelledLevel = (colLowestZ !== null && bbox(c).zmin <= colLowestZ + 0.5);
          w.reads = w.atLowestModelledLevel
            ? 'this column sits on the lowest modelled level — if the model has no footings, there is nothing here for the rule to find and this flag is a metadata gap, not a load-path break (see dataSufficiency.footings_modelled)'
            : 'nothing in ' + COL_SUPPORT_CLASSES.join('/') + ' lies within ' + columnRule.tolerance_m + ' m below; `nearestBelow` is what is actually there';
        }
        rows.push({ guid: guid, ifc_class: 'IfcColumn', name: name, storey: storey, rule: 'column_continuity', severity: 'CRITICAL', ratio: null, witness: w });
        unsupportedColCount++;
      }
    });
    log('§STRUCT_SANITY rule=column_continuity severity=' + unsupportedColCount);

    return rows;
  }

  return { evaluate: evaluate,
    // T8.13 — the ONE fallback literal, exported so rule_checklist.js / rule_findings_film.js
    // consume it instead of each keeping a copy that drifts.
    FALLBACK_RULES: FALLBACK_RULES,
    // T12.6 — exported for the SAME reason. rule_report.js's `support_classes_present` probe
    // used to carry a TYPED COPY of these two lists in a comment and in its own SQL, and that
    // copy went stale the moment §SUPPORT_CLASS_PARITY (T9.1) added IfcWall and §SLAB_BEARING
    // (T9.3) added IfcSlab: the probe went on reporting "IfcWall and IfcSlab are in neither
    // support list" and flagging Terminal_silent `degraded` for a gap that had been closed.
    // The probe reads these now. A copy of a list is a list that will disagree with it.
    // Frozen: these are handed to rule_report.js's probe, and a consumer that mutated the array
    // it was given would corrupt the list for every later caller — the same class of drift the
    // export exists to end.
    SUPPORT_CLASSES: Object.freeze(SUPPORT_CLASSES.slice()),
    COL_SUPPORT_CLASSES: Object.freeze(COL_SUPPORT_CLASSES.slice()),
    // exported for the witness fixture / debugging — not part of the row-producing contract above
    _supportChecks: _supportChecks, _columnContinuity: _columnContinuity, _matchesHints: _matchesHints
  };
});
