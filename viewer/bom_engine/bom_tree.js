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

  /**
   * Set of column names present on a table (schema-tolerance for older/subset DBs
   * — e.g. the SampleCastle W022 export lacks the grid_* / count columns).
   * @param {object} db
   * @param {string} table
   * @returns {Object} colName → true
   */
  function _tableCols(db, table) {
    var set = {};
    try {
      var rows = _queryRows(db, "PRAGMA table_info(" + table + ")");
      for (var i = 0; i < rows.length; i++) set[rows[i].name] = true;
    } catch (e) { /* table may not exist */ }
    return set;
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

    // Query children — the §8.3 one-level query.
    // Schema-tolerant: a subset export (e.g. SampleCastle W022) may lack the grid_* / count
    // columns. Select only columns that EXIST; absent ones read as undefined → defaults below.
    var have = _tableCols(db, 'm_bom_line');
    var wanted = [
      'M_BOM_Line_ID', 'bom_id', 'child_product_id', 'qty', 'qty_type', 'sequence',
      'layout_strategy', 'min_space_mm', 'anchor_face', 'fit_priority',
      'rotation_rule', 'component_type',
      'allocated_width_mm', 'allocated_depth_mm', 'allocated_height_mm',
      'dx', 'dy', 'dz', 'mandatory', 'edge_offset_mm', 'buffer_mm',
      'min_count', 'max_count', 'fill_axis',
      'creates_grid', 'drag_axis', 'grid_shared_key', 'grid_editable',
      'element_ref', 'storey', 'entity_type'
    ];
    var selCols = [];
    for (var wi = 0; wi < wanted.length; wi++) {
      if (have[wanted[wi]]) selCols.push('bl.' + wanted[wi]);
    }
    var rows = _queryRows(db,
      "SELECT " + selCols.join(', ') + " " +
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

  // ── buildBomAttachMap (Red Pill B1, RedPillRosetta.md §7b.1) ──────────────

  /**
   * Build a grid→element attach map FROM THE BOM TREE (kills F1–F4 / F6: BOM data BUILDS
   * the map, proximity never enters). Each materialized child carrying an `_elementRef`
   * (bom_tree.js child._elementRef) is bound to the grid line(s) its PARENT BOM created
   * (a bomGridMgr GridLine whose `bomNodeId` == the parent's id, or — via grid_shared_key —
   * the parent's shared group). When no bomGridMgr grid maps to a parent (subset DB with no
   * grid_* columns, e.g. SampleCastle W022), the parent BOM id itself is the grid key, so the
   * whole floor's children are still BOM-governed under one synthetic line.
   *
   * @param {BOMNode[]} bomNodes - flat list of materialized BOMNodes (parents + children)
   * @param {Object} [bomGridMgr] - BomGrid.GridLineManager (optional; subset DBs have none)
   * @returns {{
   *   map: Object,        // gridId → [{guid,bomNodeId,parentId,anchorFace,strategy,axis,storey}]
   *   governed: Object,   // guid → true (every guid the BOM map governs)
   *   byGuid: Object,     // guid → host entry (the binding above)
   *   gridCount: number,
   *   bomCount: number    // count of governed (BOM-sourced) guids
   * }}
   */
  function buildBomAttachMap(bomNodes, bomGridMgr) {
    var map = {};        // gridId → entries[]
    var governed = {};   // guid → true
    var byGuid = {};     // guid → entry
    var bomCount = 0;

    // Index grid lines by the BOMNode id they belong to (and shared-group membership).
    // A child binds to grid(s) created by its PARENT BOM.
    var gridsByBomNode = {};   // bomNodeId → [gridId]
    if (bomGridMgr) {
      var levels = bomGridMgr.getLevels ? bomGridMgr.getLevels() : [];
      for (var li = 0; li < levels.length; li++) {
        var grids = bomGridMgr.getDisplayGrids(levels[li]) || [];
        for (var gi = 0; gi < grids.length; gi++) {
          var gl = grids[gi];
          if (!gridsByBomNode[gl.bomNodeId]) gridsByBomNode[gl.bomNodeId] = [];
          gridsByBomNode[gl.bomNodeId].push(gl);
        }
      }
    }

    for (var i = 0; i < bomNodes.length; i++) {
      var node = bomNodes[i];
      if (!node._elementRef) continue;          // no element binding → not BOM-governed (fallback)
      var parent = node.getParentBOM ? node.getParentBOM() : node.parentBOM;
      var parentId = parent ? parent.id : (node.id || '_root');

      // Which grid(s) govern this child? The grids the PARENT created (or shared-group),
      // else fall back to the parent BOM id as the grid key (subset-DB no-grid case).
      var parentGrids = (parent && gridsByBomNode[parent.id]) || [];
      var gridIds = [];
      if (parentGrids.length) {
        for (var pg = 0; pg < parentGrids.length; pg++) gridIds.push(parentGrids[pg]);
      } else {
        gridIds.push({ id: parentId, axis: node.fillAxis || 'x' });   // synthetic floor-grid
      }

      var guid = node._elementRef;
      for (var k = 0; k < gridIds.length; k++) {
        var g = gridIds[k];
        var entry = {
          guid:       guid,
          bomNodeId:  node.id,
          parentId:   parentId,
          anchorFace: node._anchorFace || 'BACK',
          strategy:   node.strategy || 'LINEAR',
          axis:       g.axis || node.fillAxis || 'x',
          storey:     node._storey || null
        };
        if (!map[g.id]) map[g.id] = [];
        map[g.id].push(entry);
      }
      if (!governed[guid]) { governed[guid] = true; bomCount++; }
      byGuid[guid] = byGuid[guid] || { bomNodeId: node.id, parentId: parentId,
        anchorFace: node._anchorFace || 'BACK', strategy: node.strategy || 'LINEAR',
        storey: node._storey || null };
    }

    var gridCount = 0;
    for (var gk in map) gridCount++;

    return { map: map, governed: governed, byGuid: byGuid, gridCount: gridCount, bomCount: bomCount };
  }

  /**
   * BOM-sourced peer of getAffectedBranch (the F4 fix): select affected parent BOMNodes
   * for a dragged grid FROM the BOM attach map — it does NOT read the heuristic proximity
   * attach map. Returns the parent BOMNodes whose children are bound to `gridId`.
   *
   * @param {{map:Object}} bomAttach - result of buildBomAttachMap
   * @param {BOMNode[]} bomNodes - flat node list (to resolve parentId → node)
   * @param {string} gridId
   * @returns {BOMNode[]}
   */
  function getAffectedBranchFromBom(bomAttach, bomNodes, gridId) {
    if (!bomAttach || !bomAttach.map) return [];
    var entries = bomAttach.map[gridId];
    if (!entries || !entries.length) return [];

    var wantParents = {};
    for (var i = 0; i < entries.length; i++) wantParents[entries[i].parentId] = true;

    var result = [];
    var seen = {};
    for (var j = 0; j < bomNodes.length; j++) {
      var n = bomNodes[j];
      if (wantParents[n.id] && !seen[n.id]) { seen[n.id] = true; result.push(n); }
    }
    // A child may carry the parentId without the parent node being in the flat list — fall back
    // to each governed child's own parent ref so the branch is never silently empty.
    if (!result.length) {
      for (var k = 0; k < bomNodes.length; k++) {
        var c = bomNodes[k];
        var par = c.getParentBOM ? c.getParentBOM() : c.parentBOM;
        if (par && wantParents[par.id] && !seen[par.id]) { seen[par.id] = true; result.push(par); }
      }
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

  exports.materializeLevel        = materializeLevel;
  exports.getAffectedBranch       = getAffectedBranch;
  exports.buildBomAttachMap       = buildBomAttachMap;       // Red Pill B1 §7b.1
  exports.getAffectedBranchFromBom = getAffectedBranchFromBom; // Red Pill B1 (F4 fix)
  exports.loadBom                 = loadBom;
  exports.listRoots               = listRoots;
  exports._queryRows              = _queryRows;
  exports._tableCols              = _tableCols;

})(typeof module !== 'undefined' ? module.exports : (window.BomTree = {}));
