// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — BIM RECIPE TREE COMPILED ONTO NATIVE iDempiere MRP `pp_product_bom`/`pp_product_bomline`
//   (bim-compiler prompts/RESUME_HBA_ERP_GOVERNED_DISPLAY.md §DESIGN-BOM-COMPILE, Stage 2). The BOM PRINCIPLE
//   (one parent, N children each with a quantity, recursive) projected onto the REAL, live MRP pair — the
//   cleanest AD fit found across the whole thread (pp_product_bom carries NO doc-lifecycle columns, so a static
//   BIM recipe needs no workflow/approval handling — §DESIGN-BOM-COMPILE finding).
//
//   ⚠ RUNTIME-SOURCE GAP (honest, flagged not hidden): the SOURCE this compiles FROM — m_bom/m_bom_line
//   (library/schema_snapshot_bom.sql, walked by DAGCompiler/BOMWalker.java) — is **bim-compiler's** transient
//   Java pipeline output (library/*_BOM.db, deleted every run by scripts/rebuild_erp.sh). It is NOT present
//   viewer-side in bim-ootb (the streamed building DBs carry spatial_structure/elements_meta/element_transforms
//   but NO bom table — verified live 2026-07-03). So this module is the PURE, WITNESSED TRANSFORM (proven
//   against a real-SHAPED fixture in tests/witness_ad_bom.js); LIVE viewer wiring awaits a viewer-side BOM
//   source (either bim-compiler emitting a persisted *_BOM.db the viewer can fetch, or the compile running
//   bim-compiler-side). Do NOT fabricate a BOM source to make it "live" — that would violate the PRIME RULE.
//
//   ⚠ TWO "M_Product" LANDMINE (load-bearing, §DESIGN-BOM-COMPILE item ⚠): m_bom_line.child_product_id is a
//   TEXT id into library/component_library.db's OWN internal M_Product catalog — NOT the real AD dictionary's
//   integer m_product_id that pp_product_bomline FKs into. The caller MUST pass a `productResolver` that maps
//   the BIM-catalog TEXT id → the real AD m_product_id already minted by ProductRegistrar.java / ad_tenancy.js
//   toProductRow for that same guid. This module NEVER mints a competing Product identity; a line whose child
//   does not resolve is SKIPPED (non-invent), never given a fabricated FK.
//
//   ⚠ bomtype='B' (BIM) — §DESIGN-BOM-COMPILE item 1: pp_product_bom.BOMType is AD_Ref_List 347 ("M_BOM Type").
//   'B'="BIM" is NOT a stock value (A/C/F/K/M/O/P/R/S) — it must be added as an AD_Ref_List row (a Stage-1 SEED
//   step, the same "extend the dictionary with a missing master value" idiom as C_UOM/M_Warehouse). That seed
//   is NOT yet done (flagged for whoever seeds the BOM source). Accepted tradeoff: a 'B' BOM is invisible to
//   native costing/MRP/production-explosion (which hardcode 'A') — correct for a structural/spatial BIM recipe.
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

var AD = { BOM_TYPE_BIM: BOM_TYPE_BIM, BOM_USE_MASTER: BOM_USE_MASTER,
  toBomRow: toBomRow, toBomLineRow: toBomLineRow, compileBom: compileBom };
if (typeof module === 'object' && module.exports) module.exports = AD;
else (typeof self !== 'undefined' ? self : this).HbaAdBom = AD;
})();
