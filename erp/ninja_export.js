// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_export.js — the workbook-serialize leg of PackOut: model → Excel sheet (download).
//
// Implementing NINJA_MODE_LANE.md §1 (two-way / "Export an existing window"). The clean INVERSE of
// ninja_model.parseRomo: take the `model` shape that extractModel reconstructs from a staged AD_Window
// and serialise it back to the SAME 1_RO_ModelHeader + 2_RO_ModelMaker sheets a user could re-drop into
// the Create face. Round-trips: DB → extractModel → modelToWorkbook → bytes → parseSheet == original.
//
// EXTRACT-DON'T-INVENT: every emitted token is the deterministic inverse of the grammar in
// ninja_model.js (REF map line 22; parseColDef line 84). No Excel styling, no invented columns —
// the sheet carries exactly what stageModels persists and extractModel reads back, nothing more.
//
// STRUCTURAL BOUNDARY (NINJA_MODE_LANE.md §3, inherited from extractModel): the workbook does NOT carry
// L#-list values, validation rules, or display logic — staging never writes them, so extract can't read
// them, so export can't serialise them. Those travel as crafted JS. The grammar round-trip is exact for
// table / column / refId / master / workflow.

(function (global) {
  'use strict';

  var HEADER_SHEET = '1_RO_ModelHeader';
  var MODEL_SHEET  = '2_RO_ModelMaker';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var NinjaStage = isNode ? require('./ninja_stage.js') : (global.NinjaStage || null);

  // ── REV_PREFIX — AD_Reference_ID → field-def PREFIX# (inverse of ninja_model.PREFIX_MAP) ──────────
  // Typed refs get an explicit prefix; String(10) and TableDir/Table(18/19, name ends _ID → auto-detect)
  // emit BARE — exactly how ninja_starter.js writes its ColumnSet, so re-parse reconstructs the same refId.
  var REV_PREFIX = {
    29: 'Q#',  // Quantity
    12: 'A#',  // Amount
    20: 'Y#',  // YesNo
    15: 'D#',  // Date
    16: 'd#',  // DateTime
    14: 'T#',  // Text
    17: 'L#'   // List
    // 10 String, 18 TableDir, 19 Table → '' (bare)
  };

  // ── colDef(col) — one user column {name, refId} → its field-def token ─────────────────────────────
  function colDef(col) {
    var pre = REV_PREFIX[Number(col.refId)] || '';
    return pre + col.name;
  }

  // ── modelToRows(model) → { header, model, headerSheet, modelSheet } (array-of-arrays) ─────────────
  // INVERSE of parseRomo. header = 1_RO_ModelHeader; model = 2_RO_ModelMaker with the canonical
  // RO_ModelHeader_ID, SeqNo, WorkflowStructure, KanbanBoard, Master, Name, Help, ColumnSet columns.
  function modelToRows(model) {
    if (!model || !Array.isArray(model.tables)) throw new Error('ninja_export: not a model');
    var bundle = model.bundleName || '';
    var version = model.version || '1.0.0';

    var header = [
      ['Name', 'Version'],
      [bundle, version]
    ];

    var modelRows = [
      ['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet']
    ];

    model.tables.forEach(function (t, i) {
      var colSet = (t.columns || []).map(colDef).join(',');
      modelRows.push([
        bundle,
        String(i + 1),
        t.workflow ? 'Y' : 'N',
        t.kanban   ? 'Y' : 'N',
        t.master || '',
        t.name,
        t.help || '',
        colSet
      ]);
    });

    return { header: header, model: modelRows, headerSheet: HEADER_SHEET, modelSheet: MODEL_SHEET };
  }

  // ── modelToWorkbook(model, XLSX) → SheetJS workbook ───────────────────────────────────────────────
  function modelToWorkbook(model, XLSX) {
    if (!XLSX || !XLSX.utils) throw new Error('ninja_export: SheetJS (XLSX) not provided');
    var r = modelToRows(model);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.header), r.headerSheet);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.model),  r.modelSheet);
    return wb;
  }

  // ── exportWindow(db, AD_Window_ID, XLSX) → SheetJS workbook (or null if window missing) ───────────
  // Chains the engine: extractModel(db, winId) → modelToWorkbook. The literal PackOut for one window.
  function exportWindow(db, AD_Window_ID, XLSX) {
    var stage = NinjaStage || (global && global.NinjaStage);
    if (!stage || !stage.extractModel) throw new Error('ninja_export: NinjaStage.extractModel unavailable');
    var model = stage.extractModel(db, AD_Window_ID);
    if (!model) return null;                                   // ghost window → null (falsifier-safe)
    return modelToWorkbook(model, XLSX);
  }

  // ── exportBlob(db, AD_Window_ID, XLSX) → Blob for the pill's download link (or null) ──────────────
  function exportBlob(db, AD_Window_ID, XLSX) {
    var wb = exportWindow(db, AD_Window_ID, XLSX);
    if (!wb) return null;
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  var API = {
    REV_PREFIX: REV_PREFIX,
    colDef: colDef,
    modelToRows: modelToRows,
    modelToWorkbook: modelToWorkbook,
    exportWindow: exportWindow,
    exportBlob: exportBlob,
    HEADER_SHEET: HEADER_SHEET,
    MODEL_SHEET: MODEL_SHEET
  };

  if (isNode) module.exports = API;
  else global.NinjaExport = API;

})(typeof self !== 'undefined' ? self : this);
