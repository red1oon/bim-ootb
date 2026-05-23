/**
 * bom_strategies.js — §S272 BOM Engine Phase 1: Strategy Functions
 * Implementing BOM_ENGINE_SPEC.md §3.3 — Witness: W-BOM-ENGINE
 *
 * 8 pure placement strategies. Each: (params) → {positions[], count}
 * No state, no side effects, no DOM, no Three.js, no SQL.
 *
 * Strategies compute WHERE children go within a parent's available space.
 * All dimensions in millimetres. Positions are offsets from parent origin (LBD corner).
 */
(function(exports) {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Clamp count to [min_count, max_count] range.
   * @param {number} count - computed count
   * @param {number} minCount - minimum (0 = no minimum)
   * @param {number|null} maxCount - maximum (null = no limit)
   * @returns {number}
   */
  function clampCount(count, minCount, maxCount) {
    var c = Math.max(0, Math.floor(count));
    if (minCount > 0 && c < minCount) c = minCount;
    if (maxCount != null && c > maxCount) c = maxCount;
    return c;
  }

  // ── Strategies ───────────────────────────────────────────────────────────

  /**
   * UNIFORM — Equal spacing, recount on resize.
   * @param {Object} p
   * @param {number} p.available   - available space along fill axis (mm)
   * @param {number} p.childSize   - size of one child along fill axis (mm)
   * @param {number} p.spacing     - center-to-center spacing (mm), 0 = use childSize
   * @param {number} p.edgeOffset  - offset from both edges (mm)
   * @param {number} p.minCount    - minimum count
   * @param {number|null} p.maxCount - maximum count (null = unlimited)
   * @returns {{positions: number[], count: number}}
   */
  function UNIFORM(p) {
    var avail = p.available - 2 * p.edgeOffset;
    if (avail <= 0 || p.childSize <= 0) return { positions: [], count: 0 };

    var step = p.spacing > 0 ? p.spacing : p.childSize;
    if (step <= 0) return { positions: [], count: 0 };

    // First child at edgeOffset + childSize/2 (centered in slot)
    // Count = how many fit with given spacing
    var count = Math.floor((avail - p.childSize) / step) + 1;
    count = clampCount(count, p.minCount, p.maxCount);

    var positions = [];
    for (var i = 0; i < count; i++) {
      positions.push(p.edgeOffset + p.childSize / 2 + i * step);
    }
    return { positions: positions, count: count };
  }

  /**
   * PACKED — Minimum gap, maximize count.
   * Children placed as tightly as possible with only buffer_mm between them.
   * @param {Object} p
   * @param {number} p.available   - available space (mm)
   * @param {number} p.childSize   - child size (mm)
   * @param {number} p.buffer      - minimum gap between children (mm)
   * @param {number} p.edgeOffset  - offset from edges (mm)
   * @param {number} p.minCount
   * @param {number|null} p.maxCount
   * @returns {{positions: number[], count: number}}
   */
  function PACKED(p) {
    var avail = p.available - 2 * p.edgeOffset;
    if (avail <= 0 || p.childSize <= 0) return { positions: [], count: 0 };

    var step = p.childSize + p.buffer;
    if (step <= 0) return { positions: [], count: 0 };

    var count = Math.floor((avail + p.buffer) / step);
    count = clampCount(count, p.minCount, p.maxCount);

    var positions = [];
    for (var i = 0; i < count; i++) {
      positions.push(p.edgeOffset + p.childSize / 2 + i * step);
    }
    return { positions: positions, count: count };
  }

  /**
   * CENTERED — Fixed count, centered in available space.
   * @param {Object} p
   * @param {number} p.available   - available space (mm)
   * @param {number} p.childSize   - child size (mm)
   * @param {number} p.spacing     - spacing between children (mm)
   * @param {number} p.count       - fixed number of children
   * @returns {{positions: number[], count: number}}
   */
  function CENTERED(p) {
    var count = Math.max(0, p.count || 0);
    if (count === 0 || p.childSize <= 0) return { positions: [], count: 0 };

    var step = p.spacing > 0 ? p.spacing : p.childSize;
    var totalSpan = (count - 1) * step + p.childSize;
    var startOffset = (p.available - totalSpan) / 2 + p.childSize / 2;

    var positions = [];
    for (var i = 0; i < count; i++) {
      positions.push(startOffset + i * step);
    }
    return { positions: positions, count: count };
  }

  /**
   * REPEAT — Clone child set with buffer between repeats.
   * Each repeat is a full copy of the template at a new position.
   * @param {Object} p
   * @param {number} p.available    - available space (mm)
   * @param {number} p.templateSize - size of one template set (mm)
   * @param {number} p.buffer       - gap between repeats (mm)
   * @param {number} p.edgeOffset   - offset from edges (mm)
   * @param {number} p.minCount
   * @param {number|null} p.maxCount
   * @returns {{positions: number[], count: number}}
   */
  function REPEAT(p) {
    var avail = p.available - 2 * p.edgeOffset;
    if (avail <= 0 || p.templateSize <= 0) return { positions: [], count: 0 };

    var step = p.templateSize + p.buffer;
    if (step <= 0) return { positions: [], count: 0 };

    var count = Math.floor((avail + p.buffer) / step);
    count = clampCount(count, p.minCount, p.maxCount);

    var positions = [];
    for (var i = 0; i < count; i++) {
      positions.push(p.edgeOffset + p.templateSize / 2 + i * step);
    }
    return { positions: positions, count: count };
  }

  /**
   * FIXED — Never recount. Proportional repositioning within available space.
   * Positions scale proportionally when parent resizes.
   * @param {Object} p
   * @param {number} p.available      - current available space (mm)
   * @param {number} p.origAvailable  - original available space (mm)
   * @param {number[]} p.origPositions - original positions (mm)
   * @returns {{positions: number[], count: number}}
   */
  function FIXED(p) {
    if (!p.origPositions || p.origPositions.length === 0) {
      return { positions: [], count: 0 };
    }
    if (p.origAvailable <= 0) {
      return { positions: p.origPositions.slice(), count: p.origPositions.length };
    }

    var ratio = p.available / p.origAvailable;
    var positions = [];
    for (var i = 0; i < p.origPositions.length; i++) {
      positions.push(p.origPositions[i] * ratio);
    }
    return { positions: positions, count: positions.length };
  }

  /**
   * SPAN — Single child stretches to fill parent entirely.
   * @param {Object} p
   * @param {number} p.available   - available space (mm)
   * @param {number} p.edgeOffset  - offset from edges (mm)
   * @returns {{positions: number[], count: number, size: number}}
   */
  function SPAN(p) {
    var avail = p.available - 2 * p.edgeOffset;
    if (avail <= 0) return { positions: [], count: 0, size: 0 };

    return {
      positions: [p.edgeOffset + avail / 2],
      count: 1,
      size: avail
    };
  }

  /**
   * ROUTE — Anchor-to-anchor pairing (stub — delegates to RouteWalker in Phase 3).
   * @param {Object} p
   * @param {Object} p.startAnchor - {x, y, z} start point
   * @param {Object} p.endAnchor   - {x, y, z} end point
   * @param {number} p.crossSection - pipe/duct cross-section (mm)
   * @returns {{segments: Object[]}}
   */
  function ROUTE(p) {
    // Stub: straight line from start to end. RouteWalker handles waypoints in Phase 3.
    return {
      segments: [{
        start: { x: p.startAnchor.x, y: p.startAnchor.y, z: p.startAnchor.z },
        end:   { x: p.endAnchor.x,   y: p.endAnchor.y,   z: p.endAnchor.z },
        crossSection: p.crossSection
      }]
    };
  }

  /**
   * LINEAR — Alias for UNIFORM (backwards compatibility).
   */
  function LINEAR(p) {
    return UNIFORM(p);
  }

  // ── Dispatcher ───────────────────────────────────────────────────────────

  /**
   * Dispatch to strategy by name.
   * @param {string} name - strategy name
   * @param {Object} params - strategy parameters
   * @returns {Object} strategy result
   */
  function dispatch(name, params) {
    var strategies = {
      'UNIFORM':  UNIFORM,
      'PACKED':   PACKED,
      'CENTERED': CENTERED,
      'REPEAT':   REPEAT,
      'FIXED':    FIXED,
      'SPAN':     SPAN,
      'ROUTE':    ROUTE,
      'LINEAR':   LINEAR
    };
    var fn = strategies[name];
    if (!fn) throw new Error('Unknown strategy: ' + name);
    return fn(params);
  }

  // ── Exports ──────────────────────────────────────────────────────────────

  exports.UNIFORM  = UNIFORM;
  exports.PACKED   = PACKED;
  exports.CENTERED = CENTERED;
  exports.REPEAT   = REPEAT;
  exports.FIXED    = FIXED;
  exports.SPAN     = SPAN;
  exports.ROUTE    = ROUTE;
  exports.LINEAR   = LINEAR;
  exports.dispatch = dispatch;

})(typeof module !== 'undefined' ? module.exports : (window.BomStrategies = {}));
