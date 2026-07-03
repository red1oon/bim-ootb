// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — BIM RECIPE TREE **LIVES IN** NATIVE iDempiere `pp_product_bom`/`pp_product_bomline`
//   (bim-compiler prompts/RESUME_HBA_ERP_GOVERNED_DISPLAY.md §DESIGN-BOM-COMPILE + §BOM-ERP-CENTERED). The
//   BOM PRINCIPLE (one parent, N children each with a quantity, recursive) is expressed as REAL rows in the
//   stock iDempiere MRP pair — the cleanest AD fit in the whole thread (pp_product_bom carries NO doc-lifecycle
//   columns, so a static BIM recipe needs no workflow/approval handling).
//
//   ★ ERP-CENTERED (user directive 2026-07-03: "the Java era is not source of truth, the ERP is; all BIM data
//   models are ERP-centered"). The AUTHORITY for the BOM is iDempiere — the pp_product_bom rows SEEDED into
//   erp/ad_seed.db by scripts/seed_hba_bom.js from the REAL IFC extraction (a building's own
//   rel_contained_in_space room→elements containment). The BIM BOM panel is a LENS (readBom, an AD_InfoWindow
//   JOIN pp_product_bom⋈pp_product_bomline⋈M_Product⋈M_Locator⋈M_Warehouse) over those rows — never a store.
//   The Java `m_bom`/`m_bom_line` (X_M_BOM.java / schema_snapshot_bom.sql / BOMWalker.java) is a TRANSITIONAL
//   MIGRATION SOURCE being ABSORBED into the one iDempiere base ([[project_erp_one_base_doctrine]]), NOT an
//   authority anything reads from. This module is therefore two ERP-native halves:
//     (1) the SEED row-builders (toBomRow/toBomLineRow/compileBom) — the ONE shape definition the seed reuses,
//         fed by the real building extraction (never Java m_bom); and
//     (2) readBom(erpQuery) — the lens read over the real seeded rows (the panel's data source).
//
//   ⚠ TWO "M_Product" IDENTITY DISCIPLINE (load-bearing): a BIM element's guid is NOT an AD id. compileBom
//   resolves each guid → the REAL AD m_product_id (seeded by seed_hba_bom.js / minted by ad_tenancy.js
//   toProductRow / ProductRegistrar.java for that same guid) via an injected `productResolver`. This module
//   NEVER mints a competing Product identity; a node/line whose product does not resolve is SKIPPED
//   (non-invent), never given a fabricated FK.
//
//   bomtype='B' (BIM) — pp_product_bom.BOMType is AD_Ref_List 347 ("M_BOM Type"). 'B'="BIM" is NOT a stock
//   value (A/C/F/K/M/O/P/R/S); seed_hba_bom.js ADDS the AD_Ref_List row (the "extend the dictionary with a
//   missing master value" idiom, exact iDempiere mapping — real AD_Ref_List columns, FK to AD_Reference 347).
//   Accepted tradeoff: a 'B' BOM is invisible to native costing/MRP/production-explosion (which hardcode 'A')
//   — correct for a structural/spatial BIM recipe (not a manufacturing plan).
'use strict';
(function () {
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

var BOM_TYPE_BIM = 'B';                 // the BIM bomtype (AD_Ref_List extension — see header)
// bom_type (BUILDING/FLOOR/ROOM/SET/ITEM, m_bom CHECK) → bomuse is a free classification; carried as the
// business bom_type via `value`/`name`; bomuse defaults to 'M' (Master) — the only universally-safe stock value.
var BOM_USE_MASTER = 'M';

// ONE pp_product_bom HEADER row for a BOM node. Column-pure (keys ⊆ real pp_product_bom columns — the witness
// enforces the subset). `m_product_id` = the PARENT element's REAL AD Product (resolved by the caller, same
// identity ad_tenancy.js toProductRow mints per guid). Geometry stays OUT of the row (no AD column) — it rides
// the view-trace wrapper compileBom returns, never forced into a fabricated column.
function toBomRow(node, m_product_id, seedId) {
  if (!node || m_product_id == null) return null;
  return { pp_product_bom_id: seedId ? seedId() : 1, m_product_id: m_product_id,
    value: node.bom_id != null ? String(node.bom_id) : null,
    name: node.bom_name || (node.bom_id != null ? String(node.bom_id) : null),
    bomtype: BOM_TYPE_BIM, bomuse: BOM_USE_MASTER,
    c_uom_id: (node.c_uom_id != null ? node.c_uom_id : null) };
}

// ONE pp_product_bomline CHILD row. `child_m_product_id` = the CHILD element's REAL AD Product (resolved).
// `qtybom` = the recipe quantity (m_bom_line.qty); `line` = the sequence ordinal. componenttype mapped from
// the source component_type when present (else left null — never guessed).
function toBomLineRow(line, pp_product_bom_id, child_m_product_id, seedId, seq) {
  if (!line || pp_product_bom_id == null || child_m_product_id == null) return null;
  return { pp_product_bomline_id: seedId ? seedId() : 1, pp_product_bom_id: pp_product_bom_id,
    m_product_id: child_m_product_id, qtybom: (line.qty != null ? line.qty : 1),
    line: (seq != null ? seq * 10 : 10),
    componenttype: (line.component_type != null ? line.component_type : null) };
}

// compile a FLAT, parent-tagged BOM node list (the BOMWalker "flattened with parent context" shape — each node
// = one BOM header + its immediate lines) onto native pp_product_bom + pp_product_bomline rows.
//   nodes: [{ bom_id, bom_name, bom_type, product_ref, c_uom_id?,
//             origin_x/y/z?, aabb_width/depth/height_mm?,                        (BIM-only geometry, view-trace)
//             lines: [{ child_product_id, qty, role?, component_type?, dx?,dy?,dz?, rotation_rule?, ... }] }]
//   productResolver: (ref) => real AD m_product_id | null   (maps BIM-catalog TEXT id/guid → real AD id)
// Returns { headers, lines, skipped, geometry, _watermark }. `headers`/`lines` are column-pure AD rows;
// `geometry` is the [{pp_product_bom_id, origin/aabb/placement…}] view-trace wrapper (the BIM facts with NO AD
// column, kept honestly beside the rows, never fabricated into a column). A node whose PARENT product does not
// resolve, or a line whose CHILD product does not resolve, is SKIPPED with a reason (non-invent).
function compileBom(nodes, productResolver, opts) {
  nodes = nodes || []; opts = opts || {};
  var resolve = (typeof productResolver === 'function') ? productResolver : function () { return null; };
  var seqH = 0, seqL = 0;
  var seedH = function () { return ++seqH; }, seedL = function () { return ++seqL; };
  var headers = [], lines = [], skipped = [], geometry = [];
  nodes.forEach(function (node) {
    var parentId = resolve(node.product_ref != null ? node.product_ref : node.bom_id);
    if (parentId == null) { skipped.push({ bom_id: node.bom_id, kind: 'header', reason: 'parent product_ref resolves to no real AD M_Product' }); return; }
    var header = toBomRow(node, parentId, seedH); headers.push(header);
    // BIM-only geometry — no AD column exists; carried as a view-trace wrapper keyed by the header PK.
    geometry.push({ pp_product_bom_id: header.pp_product_bom_id, bom_type: node.bom_type || null,
      target_ifc_class: node.target_ifc_class || null,
      origin_x: node.origin_x, origin_y: node.origin_y, origin_z: node.origin_z,
      aabb_width_mm: node.aabb_width_mm, aabb_depth_mm: node.aabb_depth_mm, aabb_height_mm: node.aabb_height_mm });
    (node.lines || []).forEach(function (ln, i) {
      var childId = resolve(ln.child_product_id);
      if (childId == null) { skipped.push({ bom_id: node.bom_id, child: ln.child_product_id, kind: 'line', reason: 'child_product_id resolves to no real AD M_Product' }); return; }
      lines.push(toBomLineRow(ln, header.pp_product_bom_id, childId, seedL, i + 1));
    });
  });
  var out = { headers: headers, lines: lines, skipped: skipped, geometry: geometry };
  return W ? W.stamp(out, opts.locale || 'en') : out;
}

// ★ ERP-CENTERED LENS READ — the BIM BOM panel's data source. Reads the REAL seeded pp_product_bom rows back
// through the native JOIN (the AD_InfoWindow lens seed_hba_bom.js also declares): every assembly + its
// components resolve pp_product_bom→M_Product(assembly)→M_Locator(room)→M_Warehouse(building) and each line
// →M_Product(component). `erpQuery` = the SAME sync ad_seed.db reader ad_tenancy/ad_payroll use (A.erpQuery /
// a witness handle). Honest empty when no db / no 'B' BOMs. opts.m_warehouse_id scopes to one building.
// Returns { assemblies: [{ bom_id, assembly_guid, assembly_name, room, building, lines: [{line_id,
// component_guid, component_name, qty}] }], _watermark } — NOTHING is stored here; it is purely a lens.
function readBom(erpQuery, opts) {
  opts = opts || {};
  if (typeof erpQuery !== 'function') return W ? W.stamp({ assemblies: [] }, opts.locale || 'en') : { assemblies: [] };
  var where = "WHERE H.BOMType='B'", params = [];
  if (opts.m_warehouse_id != null) { where += ' AND W.M_Warehouse_ID=?'; params.push(opts.m_warehouse_id); }
  var sql = 'SELECT H.PP_Product_BOM_ID AS bom_id, HP.Value AS assembly_guid, HP.Name AS assembly_name,'
    + ' W.Name AS building, L.Value AS room, BL.PP_Product_BOMLine_ID AS line_id, CP.Value AS component_guid,'
    + ' CP.Name AS component_name, BL.QtyBOM AS qty'
    + ' FROM PP_Product_BOM H JOIN M_Product HP ON H.M_Product_ID=HP.M_Product_ID'
    + ' LEFT JOIN M_Locator L ON HP.M_Locator_ID=L.M_Locator_ID'
    + ' LEFT JOIN M_Warehouse W ON L.M_Warehouse_ID=W.M_Warehouse_ID'
    + ' JOIN PP_Product_BOMLine BL ON BL.PP_Product_BOM_ID=H.PP_Product_BOM_ID'
    + ' JOIN M_Product CP ON BL.M_Product_ID=CP.M_Product_ID ' + where + ' ORDER BY H.PP_Product_BOM_ID, BL.Line';
  var rows;
  try { rows = erpQuery(sql, params); } catch (e) { rows = []; }
  var byBom = {}, order = [];
  (rows || []).forEach(function (r) {
    var b = byBom[r.bom_id];
    if (!b) { b = byBom[r.bom_id] = { bom_id: r.bom_id, assembly_guid: r.assembly_guid, assembly_name: r.assembly_name,
      room: r.room, building: r.building, lines: [] }; order.push(r.bom_id); }
    b.lines.push({ line_id: r.line_id, component_guid: r.component_guid, component_name: r.component_name, qty: r.qty });
  });
  var out = { assemblies: order.map(function (id) { return byBom[id]; }) };
  return W ? W.stamp(out, opts.locale || 'en') : out;
}

var AD = { BOM_TYPE_BIM: BOM_TYPE_BIM, BOM_USE_MASTER: BOM_USE_MASTER,
  toBomRow: toBomRow, toBomLineRow: toBomLineRow, compileBom: compileBom, readBom: readBom };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdBom = AD;
})();
