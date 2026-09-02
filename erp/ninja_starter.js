// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_starter.js — Phase D helper: the "shell Excel" a first-time user downloads to self-learn Ninja mode.
//
// Implementing NINJA_MODE_LANE.md §Phase D (the Create/author flow's onboarding artifact).
// NOT the full 18-table HRMIS — a MINIMAL 2-table master→detail sample that exercises every grammar token
// the user needs to learn: String / A#Amount / D#Date / Y#YesNo / Q#Quantity / T#Text / _ID TableDir / Master.
//
// starterModelRows() → the 1_RO_ModelHeader + 2_RO_ModelMaker rows (array-of-arrays), deterministic.
// starterWorkbook(XLSX) → a SheetJS workbook (caller passes the page's XLSX lib; node + browser both work).
// The browser pill turns it into a Blob download; the node witness reads it straight back via parseSheet.
//
// Theme: a tiny Asset Register (AST_Asset header + AST_Maintenance detail) — relatable, ERP-shaped,
// and small enough to read top-to-bottom in one glance.

(function (global) {
  'use strict';

  var HEADER_SHEET = '1_RO_ModelHeader';
  var MODEL_SHEET  = '2_RO_ModelMaker';

  // ── starterModelRows() — the two sheets as array-of-arrays ────────────────────────────────────────
  function starterModelRows() {
    var header = [
      ['Name', 'Version'],
      ['MyAssets', '1.0.0']
    ];

    // 2_RO_ModelMaker columns: RO_ModelHeader_ID, SeqNo, WorkflowStructure, KanbanBoard, Master, Name, Help, ColumnSet
    var model = [
      ['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'],
      ['MyAssets', '1', 'N', 'N', '', 'AST_Asset', 'An asset you own',
        'Name,Description,A#PurchaseCost,D#PurchaseDate,Y#IsInsured,C_BPartner_ID'],
      ['MyAssets', '2', 'N', 'N', 'AST_Asset', 'AST_Maintenance', 'A maintenance event on an asset',
        'Name,Description,D#ServiceDate,Q#HoursSpent,A#Cost,T#Notes']
    ];

    return { header: header, model: model, headerSheet: HEADER_SHEET, modelSheet: MODEL_SHEET };
  }

  // ── starterWorkbook(XLSX) — build a SheetJS workbook from the rows ────────────────────────────────
  // XLSX = the SheetJS namespace (window.XLSX in browser, require('xlsx') in node).
  function starterWorkbook(XLSX) {
    if (!XLSX || !XLSX.utils) throw new Error('ninja_starter: SheetJS (XLSX) not provided');
    var r = starterModelRows();
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.header), r.headerSheet);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.model),  r.modelSheet);
    return wb;
  }

  // ── starterBlob(XLSX) — a downloadable Blob for the pill's "Download starter template" link ───────
  function starterBlob(XLSX) {
    var wb = starterWorkbook(XLSX);
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  var API = {
    starterModelRows: starterModelRows,
    starterWorkbook: starterWorkbook,
    starterBlob: starterBlob,
    HEADER_SHEET: HEADER_SHEET,
    MODEL_SHEET: MODEL_SHEET
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaStarter = API;

})(typeof self !== 'undefined' ? self : this);
