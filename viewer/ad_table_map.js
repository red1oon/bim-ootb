// ad_table_map.js — PB bridge: every AD business table -> a 5-table slot.
// Implementing docs/ERP.md §0 + §0.1 — Witness: PB gate §BRIDGE (scripts/test_bridge.js).
//
// Two responsibilities:
//   1. slotOf(table, facts) — classify ANY AD table into one of
//      {documents, document_lines, items, containers, journal, compiler}.
//      OVERRIDES (the 32 residual tables, §0.1) win; else the PV heuristic
//      (ported verbatim from test_5table_bom.js so the gate stays self-consistent).
//   2. target(table) — for the curated hubs, the structural fk_map that tells
//      ad_data which legacy column lands in which real column vs metadata.
// EXTRACT, do not invent: every OVERRIDE resolves a logged unmappable edge.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  // ── §0.1 OVERRIDES — the 32 residuals the heuristic fallback mis-slotted ─────
  // slot + (for settlement rows) match_type. Each comment = the edge it fixes.
  var OVERRIDES = {
    // sub-document headers (group lines / nodes under a parent doc; no DocStatus)
    M_ProductionPlan:        { slot: 'documents' },   // M_ProductionLine->M_ProductionPlan = line->doc
    PP_Order_Workflow:       { slot: 'documents' },   // PP_Order_Node->PP_Order_Workflow = doc->doc (2nd-order)

    // child of a document (-> document_id) or of another line (-> source_line_id)
    C_InvoicePaySchedule:    { slot: 'document_lines' },
    C_OrderPaySchedule:      { slot: 'document_lines' },
    C_OrderLandedCost:       { slot: 'document_lines' },
    C_PaymentAllocate:       { slot: 'document_lines' },
    C_POSPayment:            { slot: 'document_lines' },
    M_Package:               { slot: 'document_lines' },
    M_InOutLineConfirm:      { slot: 'document_lines' },
    M_InOutLineMA:           { slot: 'document_lines' },
    M_InventoryLineMA:       { slot: 'document_lines' },
    M_MovementLineConfirm:   { slot: 'document_lines' },
    M_MovementLineMA:        { slot: 'document_lines' },
    M_ProductionLine:        { slot: 'document_lines' },
    M_ProductionLineMA:      { slot: 'document_lines' },
    PP_Cost_CollectorMA:     { slot: 'document_lines' },
    PP_Order_BOM:            { slot: 'document_lines' },
    PP_Order_Cost:           { slot: 'document_lines' },
    PP_Order_Node_Asset:     { slot: 'document_lines' },
    PP_Order_NodeNext:       { slot: 'document_lines' },
    PP_Order_Node_Product:   { slot: 'document_lines' },
    MP_Maintain_Task:        { slot: 'document_lines' },
    MP_OT_Task:              { slot: 'document_lines' },
    A_Depreciation_Exp:      { slot: 'document_lines' },
    // 2nd-order: child lines of the document_lines rows above (-> source_line_id)
    M_PackageLine:           { slot: 'document_lines' },   // -> M_Package
    M_PackageMPS:            { slot: 'document_lines' },   // -> M_Package
    PP_Order_BOMLine:        { slot: 'document_lines' },   // -> PP_Order_BOM
    MP_Maintain_Resource:    { slot: 'document_lines' },   // -> MP_Maintain_Task
    MP_OT_Resource:          { slot: 'document_lines' },   // -> MP_OT_Task
    C_OrderLandedCostAllocation: { slot: 'document_lines' }, // -> C_OrderLandedCost

    // §18.2 settlement / three-way match — a row LINKS >=2 lines (an edge, not content)
    M_MatchInv:              { slot: 'document_lines', match_type: 'MATCH_INV' },
    M_MatchPO:               { slot: 'document_lines', match_type: 'MATCH_PO' },
    C_LandedCost:            { slot: 'document_lines', match_type: 'LANDED_COST' },
    C_LandedCostAllocation:  { slot: 'document_lines', match_type: 'LANDED_COST' },

    // master / link rows the /Project|Year|Period/ containers regex over-grabbed
    R_IssueProject:          { slot: 'items' },
    HR_Year:                 { slot: 'items' },
    HR_Period:               { slot: 'items' }   // HR_Period->HR_Year = items->items (2nd-order)
  };

  // ── PV heuristic (ported verbatim from test_5table_bom.js slotOf) ────────────
  // facts = { isDoc: {TableName:true}, contain: {'child>parent':true} }
  function heuristic(t, facts) {
    if (/^AD_/.test(t) || /_Trl$/.test(t) || /^RV_/.test(t)) return 'compiler';
    if (/^Fact_Acct|^GL_Journal/.test(t)) return 'journal';
    if (facts.isDoc[t]) return 'documents';
    if (/(Line|Tax|Trx|Allocation(Line)?)$/.test(t) &&
        Object.keys(facts.contain).some(function (k) {
          return k.indexOf(t + '>') === 0 && facts.isDoc[k.split('>')[1]];
        }))
      return 'document_lines';
    if (/(Warehouse|Locator|Project|Campaign|Region|Country|^AD_Org|^AD_Client|^M_Warehouse|Period|Year|Calendar)/.test(t))
      return 'containers';
    return 'items';
  }

  // slotOf: OVERRIDES win; else heuristic. `facts` optional — without it, only
  // OVERRIDES + name-rule slots resolve (enough for the curated runtime tables).
  function slotOf(t, facts) {
    if (OVERRIDES[t]) return OVERRIDES[t].slot;
    if (HUBS[t]) return HUBS[t].slot;
    return heuristic(t, facts || { isDoc: {}, contain: {} });
  }

  function matchTypeOf(t) {
    return (OVERRIDES[t] && OVERRIDES[t].match_type) || null;
  }

  // ── Curated-hub fk_map — structural columns vs metadata (extract-derived) ────
  // fk_map values: a real 5-table column name, or omitted => metadata[ColumnName].
  // The key column (<Table>_ID) defaults to 'id'; DocStatus defaults to 'doc_status'
  // for document-slot tables. Only NON-default routings are listed.
  var HUBS = {
    C_Order:       { slot: 'documents',      docType: 'C_Order',     fk_map: {} },
    C_Invoice:     { slot: 'documents',      docType: 'C_Invoice',   fk_map: { C_Order_ID: 'source_id' } },
    C_Payment:     { slot: 'documents',      docType: 'C_Payment',   fk_map: { C_Invoice_ID: 'source_id' } },
    M_InOut:       { slot: 'documents',      docType: 'M_InOut',     fk_map: { C_Order_ID: 'source_id' } },
    C_OrderLine:   { slot: 'document_lines', docType: 'C_OrderLine', fk_map: { C_Order_ID: 'document_id', Line: 'line_no' } },
    C_InvoiceLine: { slot: 'document_lines', docType: 'C_InvoiceLine', fk_map: { C_Invoice_ID: 'document_id', C_OrderLine_ID: 'source_line_id', Line: 'line_no' } },
    M_InOutLine:   { slot: 'document_lines', docType: 'M_InOutLine', fk_map: { M_InOut_ID: 'document_id', C_OrderLine_ID: 'source_line_id', Line: 'line_no' } },
    C_BPartner:    { slot: 'items',          docType: 'C_BPartner',  fk_map: {} },
    M_Product:     { slot: 'items',          docType: 'M_Product',   fk_map: { M_Product_Category_ID: 'parent_id' } },
    // settlement hub with explicit line refs: M_InOutLine is the structural lineage,
    // C_InvoiceLine the counterpart kept in metadata (§0.1 rule b)
    M_MatchInv:    { slot: 'document_lines', docType: 'M_MatchInv', match_type: 'MATCH_INV',
                     fk_map: { M_InOutLine_ID: 'source_line_id' } }
  };

  // target(table): full routing spec for ad_data. Falls back to a generic
  // documents/items/line spec for any non-curated table.
  function target(table) {
    if (HUBS[table]) {
      var h = HUBS[table];
      return { slot: h.slot, docType: h.docType || table, match_type: h.match_type || matchTypeOf(table), fk_map: h.fk_map || {} };
    }
    var slot = slotOf(table);
    return { slot: slot, docType: table, match_type: matchTypeOf(table), fk_map: {} };
  }

  var ADTableMap = {
    OVERRIDES:  OVERRIDES,
    HUBS:       HUBS,
    slotOf:     slotOf,
    matchTypeOf: matchTypeOf,
    target:     target
  };

  if (typeof window !== 'undefined') window.ADTableMap = ADTableMap;
  if (typeof module !== 'undefined' && module.exports) module.exports = ADTableMap;

  if (typeof console !== 'undefined') console.log('§ADTABLEMAP_LOADED overrides=' + Object.keys(OVERRIDES).length + ' hubs=' + Object.keys(HUBS).length);
})();
