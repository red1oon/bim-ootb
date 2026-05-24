/**
 * bom_tree.js — §S272 BOM Engine Phase 2: Data Layer
 * Implementing BOM_ENGINE_SPEC.md §2, §8.3 — Witness: W-BOM-ENGINE
 *
 * Bridges SQL (m_bom / m_bom_line) to BOMNode engine.
 * materializeLevel() reads ONE level of m_bom_line → creates BOMNode[].
 * getAffectedBranch() consumes kinematics attach map → returns BOMNodes to recompose.
 *
 * Uses sql.js db.exec() API. No DOM, no Three.js.
 */
(function(exports) {
  'use strict';

  var BOMNode;
  if (typeof require !== 'undefined') {
    BOMNode = require('./bom_node.js').BOMNode;
  } else {
    BOMNode = window.BomNode.BOMNode;
  }

  // ── SQL helpers ──────────────────────────────────────────────────────────

  /**
   * Query sql.js db, return array of row objects.
   * @param {object} db - sql.js Database
   * @param {string} sql
   * @param {Array} [params]
   * @returns {Object[]}
   */
  function _queryRows(db, sql, params) {
    var stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    var rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  // ── BOM loader ───────────────────────────────────────────────────────────

  /**
   * Load parent BOM header (AABB + metadata).
   * @param {object} db
   * @param {string} bomId
   * @returns {Object|null}
   */
  function loadBom(db, bomId) {
    var rows = _queryRows(db,
      "SELECT bom_id, bom_type, bom_level, " +
      "origin_x, origin_y, origin_z, " +
      "aabb_width_mm, aabb_depth_mm, aabb_height_mm " +
      "FROM m_bom WHERE bom_id = ?1 AND is_active = 1",
      [bomId]
    );
    if (!rows.length) return null;
    var r = rows[0];
    return {
      bomId:    r.bom_id,
      bomType:  r.bom_type,
      bomLevel: r.bom_level,
      originX:  r.origin_x || 0,
      originY:  r.origin_y || 0,
      originZ:  r.origin_z || 0,
      aabbW:    r.aabb_width_mm || 0,
      aabbD:    r.aabb_depth_mm || 0,
      aabbH:    r.aabb_height_mm || 0
    };
  }

  // ── materializeLevel ─────────────────────────────────────────────────────

  /**
   * Materialize one BOM level: query m_bom_line for parentBomId,
   * create BOMNode for each line, wire parent-child.
   *
   * @param {object} db - sql.js Database
   * @param {string} parentBomId - parent BOM id to load children for
   * @param {{x:number,y:number,z:number,w:number,d:number,h:number}} [hostAABB]
   *   - optional host AABB override. If null, uses parent BOM's AABB from DB.
   * @returns {{parentNode: BOMNode, children: BOMNode[], hostAABB: Object}}
   */
  function materializeLevel(db, parentBomId, hostAABB) {
    // Load parent BOM for AABB
    var parentBom = loadBom(db, parentBomId);
    if (!parentBom) {
      return { parentNode: null, children: [], hostAABB: null };
    }

    // Use provided hostAABB or build from DB
    var host = hostAABB || {
      x: parentBom.originX * 1000,  // m → mm
      y: parentBom.originY * 1000,
      z: parentBom.originZ * 1000,
      w: parentBom.aabbW,
      d: parentBom.aabbD,
      h: parentBom.aabbH
    };

    // Query children — the §8.3 one-level query
    var rows = _queryRows(db,
      "SELECT " +
      "  bl.M_BOM_Line_ID, bl.bom_id, " +
      "  bl.child_product_id, bl.qty, bl.qty_type, bl.sequence, " +
      "  bl.layout_strategy, bl.min_space_mm, " +
      "  bl.anchor_face, bl.fit_priority, " +
      "  bl.rotation_rule, bl.component_type, " +
      "  bl.allocated_width_mm, bl.allocated_depth_mm, bl.allocated_height_mm, " +
      "  bl.dx, bl.dy, bl.dz, " +
      "  bl.mandatory, bl.edge_offset_mm, bl.buffer_mm, " +
      "  bl.min_count, bl.max_count, bl.fill_axis, " +
      "  bl.creates_grid, bl.drag_axis, bl.grid_shared_key, bl.grid_editable, " +
      "  bl.element_ref, bl.storey, bl.entity_type " +
      "FROM m_bom_line bl " +
      "WHERE bl.is_active = 1 AND bl.bom_id = ?1 " +
      "ORDER BY bl.sequence",
      [parentBomId]
    );

    // Build parent BOMNode
    var parentNode = new BOMNode({
      id: parentBomId,
      strategy: 'UNIFORM', // parent strategy from first child's context
      fillAxis: 'x'
    });

    // Build child BOMNodes
    var children = [];
    var firstStrategy = null;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];

      // Skip PHANTOM lines — they're computed, not placed
      if (r.component_type === 'PHANTOM') continue;

      var strategy = r.layout_strategy || 'LINEAR';
      if (!firstStrategy) firstStrategy = strategy;

      // Convert dx/dy/dz from metres to mm
      var dxMm = (r.dx || 0) * 1000;
      var dyMm = (r.dy || 0) * 1000;
      var dzMm = (r.dz || 0) * 1000;

      var child = new BOMNode({
        id:            r.child_product_id || ('line_' + r.M_BOM_Line_ID),
        strategy:      strategy,
        mandatory:     !!(r.mandatory),
        spacing:       r.min_space_mm || 0,
        edgeOffset:    r.edge_offset_mm || 0,
        buffer:        r.buffer_mm || 0,
        minCount:      r.min_count || 0,
        maxCount:      r.max_count != null ? r.max_count : null,
        fillAxis:      r.fill_axis || 'x',
        childSize:     r.allocated_width_mm || 0,  // size on primary fill axis
        tack:          { dx: dxMm, dy: dyMm, dz: dzMm },
        allocatedSize: {
          w: r.allocated_width_mm || 0,
          d: r.allocated_depth_mm || 0,
          h: r.allocated_height_mm || 0
        },
        componentType: r.component_type || 'MAKE',
        fitPriority:   r.fit_priority || 100,
        productId:     r.child_product_id
      });

      // Anchor face — for edge-following on resize
      child._anchorFace    = r.anchor_face || 'BACK';

      // Grid metadata (for bom_grid.js)
      child._bomLineId     = r.M_BOM_Line_ID;
      child._createsGrid   = !!(r.creates_grid);
      child._dragAxis      = r.drag_axis || null;
      child._gridSharedKey = r.grid_shared_key || null;
      child._gridEditable  = r.grid_editable != null ? !!(r.grid_editable) : true;
      child._elementRef    = r.element_ref || null;
      child._storey        = r.storey || null;
      child._entityType    = r.entity_type || 'D';
      child._qty           = r.qty || 1;

      parentNode.addChild(child);
      children.push(child);
    }

    // Set parent's strategy from first child's strategy
    if (firstStrategy) {
      parentNode.strategy = firstStrategy;
    }

    return {
      parentNode: parentNode,
      children:   children,
      hostAABB:   host
    };
  }

  // ── getAffectedBranch ────────────────────────────────────────────────────

  /**
   * Given a kinematics attach map entry (gridId → attached elements),
   * find which BOMNodes need recomposing.
   *
   * @param {BOMNode[]} bomNodes - flat list of materialized BOMNodes
   * @param {Object} attachMap - gridId → [{guid}] from GridKinematicEngine
   * @param {string} gridId - which grid was dragged
   * @returns {BOMNode[]} parent BOMNodes whose children are affected
   */
  function getAffectedBranch(bomNodes, attachMap, gridId) {
    var attached = attachMap[gridId];
    if (!attached || !attached.length) return [];

    // Build guid set for fast lookup
    var guidSet = {};
    for (var i = 0; i < attached.length; i++) {
      guidSet[attached[i].guid] = true;
    }

    // Find BOMNodes whose _elementRef matches an attached guid
    var affectedParents = {};
    for (var j = 0; j < bomNodes.length; j++) {
      var node = bomNodes[j];
      if (node._elementRef && guidSet[node._elementRef]) {
        var parent = node.getParentBOM();
        if (parent && !affectedParents[parent.id]) {
          affectedParents[parent.id] = parent;
        }
      }
    }

    var result = [];
    for (var pid in affectedParents) {
      result.push(affectedParents[pid]);
    }
    return result;
  }

  // ── listRoots ────────────────────────────────────────────────────────────

  /**
   * List root-level BOMs (bom_level = 0 or BUILDING type).
   * @param {object} db
   * @returns {Object[]}
   */
  function listRoots(db) {
    return _queryRows(db,
      "SELECT bom_id, bom_type, bom_level FROM m_bom " +
      "WHERE is_active = 1 AND (bom_level = 0 OR bom_type = 'BUILDING') " +
      "ORDER BY bom_id"
    );
  }

  // ── Exports ──────────────────────────────────────────────────────────────

  exports.materializeLevel  = materializeLevel;
  exports.getAffectedBranch = getAffectedBranch;
  exports.loadBom           = loadBom;
  exports.listRoots         = listRoots;
  exports._queryRows        = _queryRows;

})(typeof module !== 'undefined' ? module.exports : (window.BomTree = {}));
