/**
 * bom_grid.js — §S272 BOM Engine Phase 2: GridLineManager
 * Implementing BOM_ENGINE_SPEC.md §5 — Witness: W-BOM-ENGINE
 *
 * Level-scoped grid lines. Each BOM level materializes its own grids.
 * Shared keys, editable flags, position clamping within parent AABB.
 *
 * No DOM, no Three.js, no SQL. Pure state management.
 */
(function(exports) {
  'use strict';

  // ── GridLine ─────────────────────────────────────────────────────────────

  /**
   * @typedef {Object} GridLine
   * @property {string} id           - unique within level
   * @property {string} bomNodeId    - which BOMNode this grid belongs to
   * @property {number} level        - BOM depth (0, 1, 2, ...)
   * @property {string} axis         - 'x'|'z' (fill axis of parent)
   * @property {number} position     - current position along axis
   * @property {boolean} editable    - draggable?
   * @property {string|null} sharedKey - grid_shared_key
   * @property {number} minPos       - lower bound (parent AABB min)
   * @property {number} maxPos       - upper bound (parent AABB max)
   */

  // ── GridLineManager ──────────────────────────────────────────────────────

  function GridLineManager() {
    // level → GridLine[]
    this._gridsByLevel = {};
    // id → GridLine
    this._gridById = {};
    // sharedKey → GridLine[]
    this._sharedGroups = {};
    // Internal counter for unique IDs
    this._nextId = 1;
  }

  /**
   * Add grid lines for BOMNodes at a given level.
   * Only creates grids for nodes with _createsGrid = true.
   *
   * @param {BOMNode[]} bomNodes - nodes at this level
   * @param {number} level - BOM depth
   * @returns {GridLine[]} created grid lines
   */
  GridLineManager.prototype.addGridsForLevel = function(bomNodes, level) {
    if (!this._gridsByLevel[level]) {
      this._gridsByLevel[level] = [];
    }

    var created = [];

    for (var i = 0; i < bomNodes.length; i++) {
      var node = bomNodes[i];
      if (!node._createsGrid) continue;

      // Determine axis and position from node's currentAABB
      var axis = node.fillAxis || 'x';
      var position = 0;
      var minPos = 0;
      var maxPos = 0;

      if (node.currentAABB) {
        if (axis === 'x') {
          position = node.currentAABB.x + node.currentAABB.w / 2;
          // Clamp bounds from parent's AABB
          var parent = node.getParentBOM();
          if (parent && parent.currentAABB) {
            minPos = parent.currentAABB.x;
            maxPos = parent.currentAABB.x + parent.currentAABB.w;
          }
        } else {
          position = node.currentAABB.z + node.currentAABB.h / 2;
          var parentZ = node.getParentBOM();
          if (parentZ && parentZ.currentAABB) {
            minPos = parentZ.currentAABB.z;
            maxPos = parentZ.currentAABB.z + parentZ.currentAABB.h;
          }
        }
      }

      var gridLine = {
        id:         'BG_' + this._nextId++,
        bomNodeId:  node.id,
        level:      level,
        axis:       axis,
        position:   position,
        editable:   node._gridEditable !== false,
        sharedKey:  node._gridSharedKey || null,
        minPos:     minPos,
        maxPos:     maxPos
      };

      this._gridsByLevel[level].push(gridLine);
      this._gridById[gridLine.id] = gridLine;

      // Register shared group
      if (gridLine.sharedKey) {
        if (!this._sharedGroups[gridLine.sharedKey]) {
          this._sharedGroups[gridLine.sharedKey] = [];
        }
        this._sharedGroups[gridLine.sharedKey].push(gridLine);
      }

      created.push(gridLine);
    }

    return created;
  };

  /**
   * Remove all grid lines for a given level.
   * @param {number} level
   */
  GridLineManager.prototype.removeGridsForLevel = function(level) {
    var grids = this._gridsByLevel[level];
    if (!grids) return;

    for (var i = 0; i < grids.length; i++) {
      var g = grids[i];
      delete this._gridById[g.id];

      // Remove from shared groups
      if (g.sharedKey && this._sharedGroups[g.sharedKey]) {
        var group = this._sharedGroups[g.sharedKey];
        for (var j = group.length - 1; j >= 0; j--) {
          if (group[j].id === g.id) group.splice(j, 1);
        }
        if (group.length === 0) delete this._sharedGroups[g.sharedKey];
      }
    }

    delete this._gridsByLevel[level];
  };

  /**
   * Get all editable grids for a level.
   * @param {number} level
   * @returns {GridLine[]}
   */
  GridLineManager.prototype.getEditableGrids = function(level) {
    var grids = this._gridsByLevel[level] || [];
    var result = [];
    for (var i = 0; i < grids.length; i++) {
      if (grids[i].editable) result.push(grids[i]);
    }
    return result;
  };

  /**
   * Get all visible grids for a level (editable + display-only).
   * @param {number} level
   * @returns {GridLine[]}
   */
  GridLineManager.prototype.getDisplayGrids = function(level) {
    return (this._gridsByLevel[level] || []).slice();
  };

  /**
   * Get all grid lines sharing a key.
   * @param {string} sharedKey
   * @returns {GridLine[]}
   */
  GridLineManager.prototype.getSharedGroup = function(sharedKey) {
    return (this._sharedGroups[sharedKey] || []).slice();
  };

  /**
   * Is a grid editable?
   * @param {string} gridId
   * @returns {boolean}
   */
  GridLineManager.prototype.isEditable = function(gridId) {
    var g = this._gridById[gridId];
    return g ? g.editable : false;
  };

  /**
   * Set grid position, clamped to [minPos, maxPos].
   * If shared key, updates ALL grids with same key.
   * @param {string} gridId
   * @param {number} newPos
   */
  GridLineManager.prototype.setPosition = function(gridId, newPos) {
    var g = this._gridById[gridId];
    if (!g || !g.editable) return;

    var clamped = Math.max(g.minPos, Math.min(g.maxPos, newPos));

    if (g.sharedKey) {
      // Update all in shared group
      var group = this._sharedGroups[g.sharedKey] || [];
      for (var i = 0; i < group.length; i++) {
        group[i].position = clamped;
      }
    } else {
      g.position = clamped;
    }
  };

  /**
   * Get BOMNode IDs affected by a grid line.
   * @param {string} gridId
   * @returns {string[]} bomNodeIds
   */
  GridLineManager.prototype.getAffectedBomNodeIds = function(gridId) {
    var g = this._gridById[gridId];
    if (!g) return [];

    if (g.sharedKey) {
      var group = this._sharedGroups[g.sharedKey] || [];
      var ids = [];
      for (var i = 0; i < group.length; i++) {
        ids.push(group[i].bomNodeId);
      }
      return ids;
    }
    return [g.bomNodeId];
  };

  /**
   * Get all levels that have grids.
   * @returns {number[]}
   */
  GridLineManager.prototype.getLevels = function() {
    var levels = [];
    for (var k in this._gridsByLevel) {
      levels.push(parseInt(k, 10));
    }
    return levels.sort();
  };

  // ── Exports ──────────────────────────────────────────────────────────────

  exports.GridLineManager = GridLineManager;

})(typeof module !== 'undefined' ? module.exports : (window.BomGrid = {}));
