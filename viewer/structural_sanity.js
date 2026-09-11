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

  var SUPPORT_CLASSES = ['IfcColumn', 'IfcWallStandardCase', 'IfcFooting', 'IfcMember'];
  var COL_SUPPORT_CLASSES = ['IfcColumn', 'IfcWallStandardCase', 'IfcFooting'];

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
  function _supportChecks(beams, supports, tolerance_m, framing_dz_m) {
    // out[guid] = { supportedCount: 0|1|2 }
    var out = {};
    for (var i = 0; i < beams.length; i++) {
      var beam = beams[i];
      var bb = bbox(beam);
      var ends = beamEndpoints(bb);
      var supportedCount = 0;
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
        // (b) another beam framing in at the same level
        if (!found) {
          for (var j = 0; j < beams.length; j++) {
            if (j === i) continue;
            var ob = bbox(beams[j]);
            if (Math.abs(ob.zmin - bb.zmin) > framing_dz_m) continue;
            if (!pointInFootprint(pt, ob, tolerance_m)) continue;
            found = true; break;
          }
        }
        if (found) supportedCount++;
      }
      out[beam[0]] = { supportedCount: supportedCount, span: Math.max(bb.bx, bb.by), depth: bb.bz };
    }
    return out;
  }

  // ── Rule 5: column load-path continuity — centerline distance, not footprint overlap ──
  function _columnContinuity(columns, supports, tolerance_m) {
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
      out[col[0]] = { supported: found };
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
    var floatingRule = byName.floating_member || { tolerance_m: 0.15, framing_dz_m: 0.4 };
    var steelRule = byName.span_depth_steel || { warning_ratio: 24, critical_ratio: 30, max_severity: 'WARNING', name_hints: ['UB', 'UC', 'Channel', 'HSS'] };
    var concreteRule = byName.span_depth_concrete || { warning_ratio: 20, critical_ratio: 26, max_severity: 'WARNING', name_hints: ['Concrete', 'RC'] };
    var cantileverRule = byName.span_depth_cantilever || { warning_ratio: 12, critical_ratio: 16, max_severity: 'WARNING' };
    var columnRule = byName.column_continuity || { tolerance_m: 0.3 };

    var beamRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.discipline = 'STR' AND em.ifc_class = 'IfcBeam'"
    );
    var colClassesSql = "'" + SUPPORT_CLASSES.join("','") + "'";
    var supportRows = dbQuery(
      "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y, et.bbox_z " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
      "WHERE em.discipline = 'STR' AND em.ifc_class IN (" + colClassesSql + ")"
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
      "WHERE em.discipline = 'STR' AND em.ifc_class IN (" + colSupportClassesSql + ")"
    );

    var rows = [];

    // Rule 1 (+ classification feeding rules 2-4)
    var support = _supportChecks(beamRows, supportRows, floatingRule.tolerance_m, floatingRule.framing_dz_m);
    var floatingCount = { CRITICAL: 0 };
    var unmatched = 0;
    var spanDepthCounts = { span_depth_steel: { WARNING: 0, uncapped_critical: 0 }, span_depth_concrete: { WARNING: 0, uncapped_critical: 0 }, span_depth_cantilever: { WARNING: 0, uncapped_critical: 0 } };

    beamRows.forEach(function (b) {
      var guid = b[0], name = b[1], storey = b[2];
      var sup = support[guid];
      if (sup.supportedCount === 0) {
        rows.push({ guid: guid, ifc_class: 'IfcBeam', name: name, storey: storey, rule: 'floating_member', severity: 'CRITICAL', ratio: null });
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
        rows.push({ guid: guid, ifc_class: 'IfcBeam', name: name, storey: storey, rule: ruleName, severity: sev, ratio: ratio });
      }
    });

    log('§STRUCT_SANITY rule=floating_member severity=' + floatingCount.CRITICAL);
    log('§MATERIAL_INFERRED unmatched=' + unmatched);
    ['span_depth_steel', 'span_depth_concrete', 'span_depth_cantilever'].forEach(function (rn) {
      log('§STRUCT_SANITY rule=' + rn + ' severity=' + spanDepthCounts[rn].WARNING + ' uncapped_critical=' + spanDepthCounts[rn].uncapped_critical);
    });

    // Rule 5: column continuity
    var colContinuity = _columnContinuity(colRows, colSupportRows, columnRule.tolerance_m);
    var unsupportedColCount = 0;
    colRows.forEach(function (c) {
      var guid = c[0], name = c[1], storey = c[2];
      if (!colContinuity[guid].supported) {
        rows.push({ guid: guid, ifc_class: 'IfcColumn', name: name, storey: storey, rule: 'column_continuity', severity: 'CRITICAL', ratio: null });
        unsupportedColCount++;
      }
    });
    log('§STRUCT_SANITY rule=column_continuity severity=' + unsupportedColCount);

    return rows;
  }

  return { evaluate: evaluate,
    // exported for the witness fixture / debugging — not part of the row-producing contract above
    _supportChecks: _supportChecks, _columnContinuity: _columnContinuity, _matchesHints: _matchesHints
  };
});
