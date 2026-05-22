/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// bom_walker.js — JS port of Java BOMWalker (DAGCompiler bom/walker/BOMWalker.java)
// Implementing S267_BOM_TREE_EXTRACTION.md §1 — Witness: W-BOM-WALKER
//
// Walks m_bom / m_bom_line from BOM.db via sql.js. Fires visitor callbacks for
// each node: onSubAssembly, onSubAssemblyComplete, onLeaf, onPhantom.
// Structural dispatch: child_product_id matches bom_id → recurse. PHANTOM → skip.

(function(window) {
'use strict';

var MAX_DEPTH = 20; // guard against circular BOM references

/**
 * Helper: query sql.js db, return array of row arrays.
 * @param {object} db — sql.js Database
 * @param {string} sql
 * @returns {Array[]} rows
 */
function _query(db, sql) {
  var result = db.exec(sql);
  if (!result.length || !result[0].values.length) return [];
  return result[0].values;
}

/**
 * Load a BOM by bom_id (the business key, Value column).
 * @returns {object|null} { bomId, value, name, bomLevel, bomType, ... } or null
 */
function _loadBom(db, bomId) {
  var rows = _query(db,
    "SELECT bom_id, Value, Name, bom_level, bom_type, origin_x, origin_y, origin_z " +
    "FROM m_bom WHERE bom_id = '" + bomId.replace(/'/g, "''") + "' AND is_active = 1"
  );
  if (!rows.length) return null;
  var r = rows[0];
  return {
    bomId: r[0], value: r[1], name: r[2], bomLevel: r[3], bomType: r[4],
    originX: r[5] || 0, originY: r[6] || 0, originZ: r[7] || 0
  };
}

/**
 * Load BOM lines for a given bom_id, ordered by sequence.
 * @returns {object[]} array of line objects
 */
function _loadLines(db, bomId) {
  var rows = _query(db,
    "SELECT M_BOM_Line_ID, bom_id, child_product_id, component_type, role, qty, " +
    "dx, dy, dz, verb_ref, sequence, allocated_width_mm, allocated_depth_mm, allocated_height_mm, " +
    "storey " +
    "FROM m_bom_line WHERE bom_id = '" + bomId.replace(/'/g, "''") + "' AND is_active = 1 " +
    "ORDER BY sequence"
  );
  return rows.map(function(r) {
    return {
      lineId: r[0], bomId: r[1], childProductId: r[2], componentType: r[3],
      role: r[4], qty: r[5], dx: r[6] || 0, dy: r[7] || 0, dz: r[8] || 0,
      verbRef: r[9], sequence: r[10],
      allocWidth: r[11] || 0, allocDepth: r[12] || 0, allocHeight: r[13] || 0,
      storey: r[14]
    };
  });
}

/**
 * Walk BOM tree children recursively.
 * @param {object} db — sql.js Database (BOM.db)
 * @param {object} bom — parent BOM object from _loadBom
 * @param {object} visitor — { onSubAssembly, onSubAssemblyComplete, onLeaf, onPhantom }
 * @param {string} buildingType — context string
 * @param {number} level — current depth
 */
function _walkChildren(db, bom, visitor, buildingType, level) {
  if (level > MAX_DEPTH) {
    console.error('§BOM_WALK MAX_DEPTH exceeded at BOM ' + bom.bomId + ' — circular?');
    return;
  }

  var lines = _loadLines(db, bom.bomId);

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.childProductId) {
      console.warn('§BOM_WALK line ' + line.lineId + ' has null child_product_id — skip');
      continue;
    }

    // Three-way dispatch: sub-assembly / PHANTOM / leaf
    var childBom = _loadBom(db, line.childProductId);

    var ctx = {
      line: line,
      bom: bom,
      childBom: childBom,
      level: level,
      buildingType: buildingType
    };

    if (childBom) {
      // Sub-assembly — recurse
      if (visitor.onSubAssembly) visitor.onSubAssembly(ctx);
      _walkChildren(db, childBom, visitor, buildingType, level + 1);
      if (visitor.onSubAssemblyComplete) visitor.onSubAssemblyComplete(ctx);
    } else if (line.componentType === 'PHANTOM') {
      // PHANTOM — filler, no output
      if (visitor.onPhantom) visitor.onPhantom(ctx);
    } else {
      // Leaf — geometry element
      if (visitor.onLeaf) visitor.onLeaf(ctx);
    }
  }
}

/**
 * walk(db, rootBomId, visitor, buildingType) — main entry point.
 * Walks BOM tree from rootBomId. Does NOT fire onSubAssembly for root itself.
 *
 * @param {object} db — sql.js Database loaded with BOM.db
 * @param {string} rootBomId — e.g. 'BUILDING_HI_STD'
 * @param {object} visitor — { onSubAssembly(ctx), onSubAssemblyComplete(ctx), onLeaf(ctx), onPhantom(ctx) }
 * @param {string} [buildingType] — optional context
 */
function walk(db, rootBomId, visitor, buildingType) {
  var t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  var bom = _loadBom(db, rootBomId);
  if (!bom) {
    console.error('§BOM_WALK BOM not found: ' + rootBomId);
    return { leafCount: 0, subAssemblyCount: 0, phantomCount: 0, ms: 0 };
  }

  // Counting visitor wrapper
  var stats = { leafCount: 0, subAssemblyCount: 0, phantomCount: 0 };
  var wrappedVisitor = {
    onSubAssembly: function(ctx) {
      stats.subAssemblyCount++;
      if (visitor.onSubAssembly) visitor.onSubAssembly(ctx);
    },
    onSubAssemblyComplete: function(ctx) {
      if (visitor.onSubAssemblyComplete) visitor.onSubAssemblyComplete(ctx);
    },
    onLeaf: function(ctx) {
      stats.leafCount++;
      if (visitor.onLeaf) visitor.onLeaf(ctx);
    },
    onPhantom: function(ctx) {
      stats.phantomCount++;
      if (visitor.onPhantom) visitor.onPhantom(ctx);
    }
  };

  _walkChildren(db, bom, wrappedVisitor, buildingType || '', 0);

  var ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  console.log('§BOM_WALK root=' + rootBomId +
    ' leaves=' + stats.leafCount +
    ' subs=' + stats.subAssemblyCount +
    ' phantoms=' + stats.phantomCount +
    ' ms=' + ms);

  stats.ms = ms;
  return stats;
}

/**
 * walkSelf(db, rootBomId, visitor, buildingType) — walk with root as assembly.
 * Fires onSubAssembly/onSubAssemblyComplete for the root BOM itself (level = -1).
 */
function walkSelf(db, rootBomId, visitor, buildingType) {
  var bom = _loadBom(db, rootBomId);
  if (!bom) {
    console.error('§BOM_WALK walkSelf: BOM not found: ' + rootBomId);
    return { leafCount: 0, subAssemblyCount: 0, phantomCount: 0, ms: 0 };
  }

  var rootCtx = { line: null, bom: bom, childBom: null, level: -1, buildingType: buildingType || '' };
  if (visitor.onSubAssembly) visitor.onSubAssembly(rootCtx);
  var stats = walk(db, rootBomId, visitor, buildingType);
  if (visitor.onSubAssemblyComplete) visitor.onSubAssemblyComplete(rootCtx);
  return stats;
}

/**
 * collectLeaves(db, rootBomId) — convenience: walk and collect all leaf contexts.
 * @returns {object[]} array of leaf ctx objects
 */
function collectLeaves(db, rootBomId) {
  var leaves = [];
  walk(db, rootBomId, {
    onLeaf: function(ctx) { leaves.push(ctx); }
  });
  return leaves;
}

/**
 * listBoms(db) — list all active BOMs in the database.
 * @returns {object[]} array of { bomId, name, bomLevel, bomType }
 */
function listBoms(db) {
  var rows = _query(db,
    "SELECT bom_id, Name, bom_level, bom_type FROM m_bom WHERE is_active = 1 ORDER BY bom_id"
  );
  return rows.map(function(r) {
    return { bomId: r[0], name: r[1], bomLevel: r[2], bomType: r[3] };
  });
}

// ── Public API ──────────────────────────────────────────────────────────────
window.BOMWalker = {
  walk: walk,
  walkSelf: walkSelf,
  collectLeaves: collectLeaves,
  listBoms: listBoms,
  // Exposed for testing
  _loadBom: _loadBom,
  _loadLines: _loadLines,
  _query: _query
};

})(window);
