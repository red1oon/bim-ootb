/**
 * bom_constraints.js — §S272 BOM Engine Phase 1: Constraint Checks
 * Implementing BOM_ENGINE_SPEC.md §4 Step 5 — Witness: W-BOM-ENGINE
 *
 * L3 validation + PHANTOM computation. Pure functions.
 * All dimensions in millimetres. No DOM, no Three.js, no SQL.
 *
 * AABB format: {x, y, z, w, d, h} — origin at LBD corner, w/d/h are extents.
 */
(function(exports) {
  'use strict';

  /**
   * fitCheck — Does child AABB fit within host AABB? (Invariant I1)
   * @param {{x:number,y:number,z:number,w:number,d:number,h:number}} nodeAABB - child
   * @param {{x:number,y:number,z:number,w:number,d:number,h:number}} hostAABB - parent
   * @returns {{ok:boolean, conflicts:string[]}}
   */
  function fitCheck(nodeAABB, hostAABB) {
    var conflicts = [];

    if (nodeAABB.x < hostAABB.x) conflicts.push('x_min');
    if (nodeAABB.y < hostAABB.y) conflicts.push('y_min');
    if (nodeAABB.z < hostAABB.z) conflicts.push('z_min');
    if (nodeAABB.x + nodeAABB.w > hostAABB.x + hostAABB.w + 0.01) conflicts.push('x_max');
    if (nodeAABB.y + nodeAABB.d > hostAABB.y + hostAABB.d + 0.01) conflicts.push('y_max');
    if (nodeAABB.z + nodeAABB.h > hostAABB.z + hostAABB.h + 0.01) conflicts.push('z_max');

    return { ok: conflicts.length === 0, conflicts: conflicts };
  }

  /**
   * overlapCheck — Do any siblings overlap each other?
   * Checks axis-aligned overlap in all 3 dimensions.
   * @param {Array<{id:string, x:number, y:number, z:number, w:number, d:number, h:number}>} siblings
   * @returns {{ok:boolean, overlaps:Array<{a:string, b:string, overlap_mm:number}>}}
   */
  function overlapCheck(siblings) {
    var overlaps = [];

    for (var i = 0; i < siblings.length; i++) {
      for (var j = i + 1; j < siblings.length; j++) {
        var a = siblings[i], b = siblings[j];
        var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        var oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
        var oz = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);

        if (ox > 0.01 && oy > 0.01 && oz > 0.01) {
          overlaps.push({
            a: a.id,
            b: b.id,
            overlap_mm: Math.round(Math.min(ox, oy, oz) * 100) / 100
          });
        }
      }
    }

    return { ok: overlaps.length === 0, overlaps: overlaps };
  }

  /**
   * bufferCheck — Do siblings maintain minimum buffer distance?
   * Checks gap along the fill axis only.
   * @param {Array<{id:string, pos:number, size:number}>} siblings - position + size on fill axis
   * @param {number} bufferMm - required minimum gap
   * @returns {{ok:boolean, violations:Array<{a:string, b:string, deficit_mm:number}>}}
   */
  function bufferCheck(siblings, bufferMm) {
    if (bufferMm <= 0 || siblings.length < 2) return { ok: true, violations: [] };

    // Sort by position
    var sorted = siblings.slice().sort(function(a, b) { return a.pos - b.pos; });
    var violations = [];

    for (var i = 0; i < sorted.length - 1; i++) {
      var end_a = sorted[i].pos + sorted[i].size / 2;
      var start_b = sorted[i + 1].pos - sorted[i + 1].size / 2;
      var gap = start_b - end_a;

      if (gap < bufferMm - 0.01) {
        violations.push({
          a: sorted[i].id,
          b: sorted[i + 1].id,
          deficit_mm: Math.round((bufferMm - gap) * 100) / 100
        });
      }
    }

    return { ok: violations.length === 0, violations: violations };
  }

  /**
   * mandatoryCheck — Are all mandatory children present?
   * @param {Array<{id:string, mandatory:boolean, present:boolean}>} children
   * @returns {{ok:boolean, missing:string[]}}
   */
  function mandatoryCheck(children) {
    var missing = [];
    for (var i = 0; i < children.length; i++) {
      if (children[i].mandatory && !children[i].present) {
        missing.push(children[i].id);
      }
    }
    return { ok: missing.length === 0, missing: missing };
  }

  /**
   * computePhantom — Remaining capacity after children placed (BUFFER invariant §1.9).
   * PHANTOM.dim = max(0, hostInner.dim - SUM(children.dim)) per axis.
   * @param {{w:number, d:number, h:number}} hostInner - host inner dimensions (mm)
   * @param {Array<{w:number, d:number, h:number}>} childrenAllocated - allocated dimensions
   * @returns {{w:number, d:number, h:number}}
   */
  function computePhantom(hostInner, childrenAllocated) {
    var usedW = 0, usedD = 0, usedH = 0;
    for (var i = 0; i < childrenAllocated.length; i++) {
      usedW += childrenAllocated[i].w;
      usedD += childrenAllocated[i].d;
      usedH += childrenAllocated[i].h;
    }
    return {
      w: Math.max(0, hostInner.w - usedW),
      d: Math.max(0, hostInner.d - usedD),
      h: Math.max(0, hostInner.h - usedH)
    };
  }

  // ── Exports ──────────────────────────────────────────────────────────────

  exports.fitCheck       = fitCheck;
  exports.overlapCheck   = overlapCheck;
  exports.bufferCheck    = bufferCheck;
  exports.mandatoryCheck = mandatoryCheck;
  exports.computePhantom = computePhantom;

})(typeof module !== 'undefined' ? module.exports : (window.BomConstraints = {}));
