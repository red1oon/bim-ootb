/**
 * bom_diff.js — §S272 BOM Engine Phase 1: Diff Engine
 * Implementing BOM_ENGINE_SPEC.md §7 — Witness: W-BOM-ENGINE
 *
 * Target state vs current state → KEEP/MOVE/ADD/REMOVE/SCALE commands.
 * Idempotent — run twice, same result.
 * Sort: REMOVE first, then MOVE/SCALE, then ADD.
 *
 * No DOM, no Three.js, no SQL.
 */
(function(exports) {
  'use strict';

  var POS_TOL   = 0.1;   // mm — position equality tolerance
  var SCALE_TOL = 0.1;   // mm — scale equality tolerance

  /**
   * Element state for diffing.
   * @typedef {Object} ElementState
   * @property {string} id      - unique identifier (guid)
   * @property {number} x       - position x (mm)
   * @property {number} y       - position y (mm)
   * @property {number} z       - position z (mm)
   * @property {number} w       - width (mm)
   * @property {number} d       - depth (mm)
   * @property {number} h       - height (mm)
   * @property {string} [productId] - product reference (for ADD)
   */

  /**
   * @typedef {Object} DiffCommand
   * @property {string} type       - KEEP | MOVE | SCALE | ADD | REMOVE
   * @property {string} id         - element id
   * @property {Object} [from]     - previous state (MOVE/SCALE)
   * @property {Object} [to]       - target state (MOVE/SCALE/ADD)
   * @property {string} [productId] - product reference (ADD)
   */

  /**
   * Diff current state against target state.
   * @param {ElementState[]} current - current element states
   * @param {ElementState[]} target  - desired element states
   * @returns {DiffCommand[]} sorted: REMOVE, MOVE/SCALE, ADD
   */
  function diff(current, target) {
    // Index current by id
    var currentById = {};
    for (var i = 0; i < current.length; i++) {
      currentById[current[i].id] = current[i];
    }

    // Index target by id
    var targetById = {};
    for (var j = 0; j < target.length; j++) {
      targetById[target[j].id] = target[j];
    }

    var removes = [];
    var moves   = [];
    var adds    = [];

    // Pass 1: Check current elements against target
    for (var ci = 0; ci < current.length; ci++) {
      var cur = current[ci];
      var tgt = targetById[cur.id];

      if (!tgt) {
        // In current but not in target → REMOVE
        removes.push({ type: 'REMOVE', id: cur.id });
      } else {
        var posMoved = Math.abs(cur.x - tgt.x) > POS_TOL ||
                       Math.abs(cur.y - tgt.y) > POS_TOL ||
                       Math.abs(cur.z - tgt.z) > POS_TOL;
        var scaled   = Math.abs(cur.w - tgt.w) > SCALE_TOL ||
                       Math.abs(cur.d - tgt.d) > SCALE_TOL ||
                       Math.abs(cur.h - tgt.h) > SCALE_TOL;

        if (posMoved && scaled) {
          // Both moved and scaled — emit SCALE (which includes position)
          moves.push({
            type: 'SCALE', id: cur.id,
            from: { x: cur.x, y: cur.y, z: cur.z, w: cur.w, d: cur.d, h: cur.h },
            to:   { x: tgt.x, y: tgt.y, z: tgt.z, w: tgt.w, d: tgt.d, h: tgt.h }
          });
        } else if (posMoved) {
          moves.push({
            type: 'MOVE', id: cur.id,
            from: { x: cur.x, y: cur.y, z: cur.z },
            to:   { x: tgt.x, y: tgt.y, z: tgt.z }
          });
        } else if (scaled) {
          moves.push({
            type: 'SCALE', id: cur.id,
            from: { x: cur.x, y: cur.y, z: cur.z, w: cur.w, d: cur.d, h: cur.h },
            to:   { x: tgt.x, y: tgt.y, z: tgt.z, w: tgt.w, d: tgt.d, h: tgt.h }
          });
        }
        // else: KEEP — no command needed, but we include it for completeness
      }
    }

    // Pass 2: Check target elements not in current → ADD
    for (var ti = 0; ti < target.length; ti++) {
      var t = target[ti];
      if (!currentById[t.id]) {
        adds.push({
          type: 'ADD', id: t.id,
          to: { x: t.x, y: t.y, z: t.z, w: t.w, d: t.d, h: t.h },
          productId: t.productId || null
        });
      }
    }

    // Sort order: REMOVE, MOVE/SCALE, ADD
    return removes.concat(moves).concat(adds);
  }

  /**
   * Count commands by type.
   * @param {DiffCommand[]} commands
   * @returns {{keep:number, move:number, scale:number, add:number, remove:number}}
   */
  function summarize(commands) {
    var s = { keep: 0, move: 0, scale: 0, add: 0, remove: 0 };
    for (var i = 0; i < commands.length; i++) {
      var t = commands[i].type.toLowerCase();
      if (s[t] !== undefined) s[t]++;
    }
    return s;
  }

  // ── Exports ──────────────────────────────────────────────────────────────

  exports.diff      = diff;
  exports.summarize = summarize;

})(typeof module !== 'undefined' ? module.exports : (window.BomDiff = {}));
