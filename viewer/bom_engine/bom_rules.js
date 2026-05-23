/**
 * bom_rules.js — §S272 BOM Engine Phase 4: DiscRuleProvider
 * Implementing BOM_ENGINE_SPEC.md §6 — Witness: W-BOM-ENGINE
 *
 * Loads discipline rules from JSON, filters by org/jurisdiction,
 * checks placements against UBBL/NFPA/IBC standards.
 *
 * No DOM, no Three.js. Pure validation logic.
 */
(function(exports) {
  'use strict';

  // ── Rule loading ────────────────────────────────────────────────────────

  /**
   * Load rules from a parsed JSON object (disc_rules.json format).
   * @param {Object} json - parsed JSON with { rules: [...] }
   * @returns {Object[]} flat array of rule objects
   */
  function loadFromJSON(json) {
    if (!json || !json.rules || !Array.isArray(json.rules)) return [];
    return json.rules.slice(); // defensive copy
  }

  /**
   * Filter rules by ad_org_id and/or jurisdiction.
   * org=0 means "all orgs" — always included.
   * @param {Object[]} allRules
   * @param {number} [adOrgId] - filter by org (0 = global, always included)
   * @param {string} [jurisdiction] - filter by jurisdiction code ('MY','INTL',etc.)
   * @returns {Object[]}
   */
  function loadRules(allRules, adOrgId, jurisdiction) {
    var result = [];
    for (var i = 0; i < allRules.length; i++) {
      var r = allRules[i];
      // Org filter: include if rule is global (0) or matches requested org
      var orgOk = (r.ad_org_id === 0) || (adOrgId != null && r.ad_org_id === adOrgId);
      if (!orgOk) continue;
      // Jurisdiction filter: include if no jurisdiction specified, or matches
      var jurisOk = !jurisdiction || !r.jurisdiction || r.jurisdiction === jurisdiction;
      if (!jurisOk) continue;
      result.push(r);
    }
    return result;
  }

  // ── Condition matching ──────────────────────────────────────────────────

  /**
   * Evaluate a simple condition string against a BOMNode.
   * Supports: "bomType IN ('X','Y')" and "bomType = 'X'"
   * @param {string} condition
   * @param {Object} bomNode
   * @returns {boolean} true if condition matches or is empty
   */
  function _matchCondition(condition, bomNode) {
    if (!condition) return true;

    // bomType IN ('X','Y')
    var inMatch = condition.match(/bomType\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      var types = inMatch[1].replace(/'/g, '').split(',');
      for (var i = 0; i < types.length; i++) {
        types[i] = types[i].trim();
      }
      return types.indexOf(bomNode.bomType || '') !== -1;
    }

    // bomType = 'X'
    var eqMatch = condition.match(/bomType\s*=\s*'([^']+)'/i);
    if (eqMatch) {
      return (bomNode.bomType || '') === eqMatch[1].trim();
    }

    // Unknown condition format — pass (don't block)
    return true;
  }

  // ── Check methods ───────────────────────────────────────────────────────

  /**
   * MIN_AREA: parent AABB area (w * d) >= min_area_m2 (converted mm² → m²).
   */
  function _checkMinArea(hostAABB, params) {
    var areaM2 = (hostAABB.w / 1000) * (hostAABB.d / 1000);
    if (areaM2 < params.min_area_m2) {
      return 'area=' + areaM2.toFixed(1) + 'm² < min=' + params.min_area_m2 + 'm²';
    }
    return null;
  }

  /**
   * MIN_DIMENSION: check a single axis >= min_mm.
   */
  function _checkMinDimension(hostAABB, params) {
    var axis = params.axis || 'w';
    var val = axis === 'w' ? hostAABB.w : (axis === 'd' ? hostAABB.d : hostAABB.h);
    if (val < params.min_mm) {
      return axis + '=' + val + 'mm < min=' + params.min_mm + 'mm';
    }
    return null;
  }

  /**
   * DIMENSION_RANGE: check axis is within [min_mm, max_mm].
   */
  function _checkDimensionRange(hostAABB, params) {
    var axis = params.axis || 'w';
    var val = axis === 'w' ? hostAABB.w : (axis === 'd' ? hostAABB.d : hostAABB.h);
    if (params.min_mm != null && val < params.min_mm) {
      return axis + '=' + val + 'mm < min=' + params.min_mm + 'mm';
    }
    if (params.max_mm != null && val > params.max_mm) {
      return axis + '=' + val + 'mm > max=' + params.max_mm + 'mm';
    }
    return null;
  }

  /**
   * MAX_DISTANCE: max spacing between adjacent siblings along fill axis.
   */
  function _checkMaxDistance(siblings, params, fillAxis) {
    if (siblings.length < 2) return null;
    var axis = fillAxis || 'x';

    // Sort siblings by position on fill axis
    var sorted = siblings.slice().sort(function(a, b) {
      var aPos = axis === 'x' ? a.x : (axis === 'y' ? a.y : a.z);
      var bPos = axis === 'x' ? b.x : (axis === 'y' ? b.y : b.z);
      return aPos - bPos;
    });

    for (var i = 1; i < sorted.length; i++) {
      var prevPos = axis === 'x' ? sorted[i-1].x : (axis === 'y' ? sorted[i-1].y : sorted[i-1].z);
      var prevSize = axis === 'x' ? sorted[i-1].w : (axis === 'y' ? sorted[i-1].d : sorted[i-1].h);
      var currPos = axis === 'x' ? sorted[i].x : (axis === 'y' ? sorted[i].y : sorted[i].z);
      var spacing = currPos - (prevPos + prevSize);
      if (spacing > params.max_spacing_mm) {
        return 'spacing=' + spacing.toFixed(0) + 'mm > max=' + params.max_spacing_mm + 'mm between [' + (i-1) + ']-[' + i + ']';
      }
    }
    return null;
  }

  /**
   * MIN_DISTANCE: min clearance between adjacent siblings.
   */
  function _checkMinDistance(siblings, params, fillAxis) {
    if (siblings.length < 2) return null;
    var axis = fillAxis || 'x';

    var sorted = siblings.slice().sort(function(a, b) {
      var aPos = axis === 'x' ? a.x : (axis === 'y' ? a.y : a.z);
      var bPos = axis === 'x' ? b.x : (axis === 'y' ? b.y : b.z);
      return aPos - bPos;
    });

    for (var i = 1; i < sorted.length; i++) {
      var prevPos = axis === 'x' ? sorted[i-1].x : (axis === 'y' ? sorted[i-1].y : sorted[i-1].z);
      var prevSize = axis === 'x' ? sorted[i-1].w : (axis === 'y' ? sorted[i-1].d : sorted[i-1].h);
      var currPos = axis === 'x' ? sorted[i].x : (axis === 'y' ? sorted[i].y : sorted[i].z);
      var clearance = currPos - (prevPos + prevSize);
      if (clearance < params.min_spacing_mm) {
        return 'clearance=' + clearance.toFixed(0) + 'mm < min=' + params.min_spacing_mm + 'mm between [' + (i-1) + ']-[' + i + ']';
      }
    }
    return null;
  }

  /**
   * MAX_COVERAGE: max area per element (host area / sibling count).
   */
  function _checkMaxCoverage(hostAABB, siblings, params) {
    if (!siblings.length) return null;
    var hostAreaM2 = (hostAABB.w / 1000) * (hostAABB.d / 1000);
    var coveragePerElement = hostAreaM2 / siblings.length;
    if (coveragePerElement > params.max_coverage_m2) {
      return 'coverage=' + coveragePerElement.toFixed(1) + 'm²/element > max=' + params.max_coverage_m2 + 'm²';
    }
    return null;
  }

  // ── Main check entry point ──────────────────────────────────────────────

  /**
   * @typedef {Object} Violation
   * @property {string} rule    - rule name
   * @property {string} severity - 'BLOCK'|'WARN'
   * @property {string} ref     - standard reference
   * @property {string} message - human-readable violation detail
   */

  /**
   * Check a BOM node placement against a set of rules.
   * @param {Object} bomNode - node being checked (needs bomType, fillAxis)
   * @param {{x,y,z,w,d,h}} hostAABB - parent AABB
   * @param {Object[]} siblings - sibling states [{x,y,z,w,d,h}]
   * @param {Object[]} rules - filtered rules from loadRules()
   * @returns {{ok: boolean, violations: Violation[]}}
   */
  function checkPlacement(bomNode, hostAABB, siblings, rules) {
    var violations = [];

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];

      // Condition filter — skip rules that don't apply to this node
      if (!_matchCondition(rule.condition, bomNode)) continue;

      var msg = null;
      var method = rule.check_method;
      var params = rule.params || {};

      if (method === 'MIN_AREA') {
        msg = _checkMinArea(hostAABB, params);
      } else if (method === 'MIN_DIMENSION') {
        msg = _checkMinDimension(hostAABB, params);
      } else if (method === 'DIMENSION_RANGE') {
        msg = _checkDimensionRange(hostAABB, params);
      } else if (method === 'MAX_DISTANCE') {
        msg = _checkMaxDistance(siblings, params, bomNode.fillAxis);
      } else if (method === 'MIN_DISTANCE') {
        msg = _checkMinDistance(siblings, params, bomNode.fillAxis);
      } else if (method === 'MAX_COVERAGE') {
        msg = _checkMaxCoverage(hostAABB, siblings, params);
      }
      // Unknown check_method → skip silently (future rule types)

      if (msg) {
        violations.push({
          rule:     rule.name,
          severity: rule.severity || 'WARN',
          ref:      rule.standard_ref || '',
          message:  msg
        });
      }
    }

    return {
      ok: violations.length === 0,
      violations: violations
    };
  }

  // ── Exports ─────────────────────────────────────────────────────────────

  exports.loadFromJSON    = loadFromJSON;
  exports.loadRules       = loadRules;
  exports.checkPlacement  = checkPlacement;

})(typeof module !== 'undefined' ? module.exports : (window.BomRules = {}));
