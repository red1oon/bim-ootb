// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_model.js — Phase A: pure Ninja sheet parser (UMD, no DB, no iDempiere)
//
// Implementing NINJA_MODE_LANE.md §Phase A — Witness: W-NINJA-MODEL
// Grammar ported verbatim from NinjaProcessor.java addColumnFromDef (line 469) and
// processLegacyModelMakerSheet (line 270). EXTRACT-DON'T-INVENT: no new prefixes,
// no new reference types — unknown prefix → String + WARN, never guessed.
//
// Supports TWO input formats (same output shape):
//   'romo'    — 2_RO_ModelMaker rows: each row = one table (SeqNo/WF/Kanban/Master/Name/Help/ColumnSet)
//   'columnar'— ModelMakerSource rows: col = table (row[1]=names, row[2+]=col defs per table)
//
// parseSheet(rows, opts) → { bundleName, version, entityType, tables, warnings }
// tables → [{ name, master, workflow, kanban, columns:[{ name, refId, isStandard, fkTable, listValues }] }]

(function (global) {
  'use strict';

  // ── iDempiere DisplayType constants (source: org.compiere.util.DisplayType) ───────────────────────
  var DT = {
    String: 10,
    Integer: 11,
    Amount: 12,
    ID: 13,
    Text: 14,
    Date: 15,
    DateTime: 16,
    List: 17,
    TableDir: 18,
    Table: 19,
    YesNo: 20,
    Button: 28,
    Quantity: 29
  };

  // Prefix → AD_Reference_ID (§Grammar from NINJA_MODE_LANE.md, ported from NinjaProcessor.java)
  var PREFIX_MAP = {
    'S': DT.String,    // 10
    'Q': DT.Quantity,  // 29
    'A': DT.Amount,    // 12
    'Y': DT.YesNo,     // 20
    'D': DT.Date,      // 15
    'd': DT.DateTime,  // 16
    'T': DT.Text,      // 14
    'L': DT.List       // 17
  };

  // Standard columns per table (mirror PackOut.xml; addWorkflowStructureColumns excluded here)
  var STD_COLS = [
    { nameSuffix: '_ID', refId: DT.ID },         // <Table>_ID  — PK
    { nameSuffix: '_UU', refId: DT.String },      // <Table>_UU
    { name: 'AD_Client_ID', refId: DT.Table },
    { name: 'AD_Org_ID',    refId: DT.Table },
    { name: 'IsActive',     refId: DT.YesNo },
    { name: 'Created',      refId: DT.DateTime },
    { name: 'CreatedBy',    refId: DT.TableDir },
    { name: 'Updated',      refId: DT.DateTime },
    { name: 'UpdatedBy',    refId: DT.TableDir }
  ];

  // WorkflowStructure columns (added when workflow=Y)
  var WORKFLOW_COLS = [
    { name: 'DocStatus',  refId: DT.List },
    { name: 'DocAction',  refId: DT.Button },
    { name: 'Processed',  refId: DT.YesNo },
    { name: 'DocumentNo', refId: DT.String },
    { name: 'IsApproved', refId: DT.YesNo }
  ];

  // ── parseColDef — NinjaProcessor.java addColumnFromDef §469, ported verbatim ────────────────────
  // Unknown prefix → String + appended to warnings; never invented.
  function parseColDef(colDef, warnings) {
    colDef = String(colDef || '').replace(/\s+/g, '');
    if (!colDef) return null;

    var parts = colDef.split('#');
    var prefix = '';
    var colName = colDef;

    if (parts.length === 2) {
      prefix = parts[0];
      colName = parts[1];
    } else if (parts.length > 2) {
      // malformed: report, skip
      if (warnings) warnings.push('malformed colDef (multiple #): ' + colDef);
      return null;
    }

    // L#ColName=Value1/Value2/... — strip inline list values
    var listValues = null;
    if (prefix === 'L' && colName.indexOf('=') !== -1) {
      var eqIdx = colName.indexOf('=');
      listValues = colName.slice(eqIdx + 1).split('/').map(function (v) { return v.trim(); });
      colName = colName.slice(0, eqIdx);
    }

    if (!colName) return null;

    var refId = DT.String;  // default

    // NinjaProcessor.java addColumnFromDef line 485-507 (verbatim logic)
    if (prefix === 'Q' || colName.indexOf('Qty') !== -1) {
      refId = DT.Quantity;
    } else if (prefix === 'Y' || colName.indexOf('Is') === 0) {
      refId = DT.YesNo;
    } else if (prefix === 'A' || colName.indexOf('Amt') !== -1) {
      refId = DT.Amount;
    } else if (prefix === 'D' || colName.indexOf('Date') !== -1) {
      refId = DT.Date;
    } else if (prefix === 'd' || colName.indexOf('Time') !== -1) {
      refId = DT.DateTime;
    } else if (prefix === 'T' || colName.indexOf('Text') !== -1) {
      refId = DT.Text;
    } else if (prefix === 'L') {
      refId = DT.List;
    } else if (prefix === 'S' || prefix === '') {
      if (colName.slice(-3) === '_ID') {
        refId = DT.TableDir;
      } else {
        refId = DT.String;
      }
    } else {
      // Unknown prefix — report, treat as String
      if (warnings) warnings.push('unknown prefix "' + prefix + '" in: ' + colDef + ' — defaulting to String');
      refId = DT.String;
    }

    var fkTable = (colName.slice(-3) === '_ID') ? colName.slice(0, -3) : null;

    return { name: colName, refId: refId, isStandard: false, fkTable: fkTable, listValues: listValues };
  }

  // ── standardColumns(tableName) — mirror PackOut.xml standard set ────────────────────────────────
  function standardColumns(tableName) {
    return [
      { name: tableName + '_ID', refId: DT.ID, isStandard: true },
      { name: tableName + '_UU', refId: DT.String, isStandard: true },
      { name: 'AD_Client_ID', refId: DT.Table, isStandard: true },
      { name: 'AD_Org_ID', refId: DT.Table, isStandard: true },
      { name: 'IsActive', refId: DT.YesNo, isStandard: true },
      { name: 'Created', refId: DT.DateTime, isStandard: true },
      { name: 'CreatedBy', refId: DT.TableDir, isStandard: true },
      { name: 'Updated', refId: DT.DateTime, isStandard: true },
      { name: 'UpdatedBy', refId: DT.TableDir, isStandard: true }
    ];
  }

  // ── buildTable(name, master, workflow, kanban, colDefs, warnings) → table object ─────────────────
  function buildTable(name, master, workflow, kanban, colDefs, warnings) {
    var columns = standardColumns(name);
    var seen = {};
    columns.forEach(function (c) { seen[c.name] = true; });

    // User-defined columns from ColumnSet / col defs
    colDefs.forEach(function (def) {
      var parsed = parseColDef(def, warnings);
      if (!parsed) return;
      if (seen[parsed.name]) return;  // idempotent (NinjaProcessor skips existing)
      seen[parsed.name] = true;
      columns.push(parsed);
    });

    // Master → FK column (NinjaProcessor line 336)
    if (master) {
      var fkName = master + '_ID';
      if (!seen[fkName]) {
        seen[fkName] = true;
        columns.push({ name: fkName, refId: DT.TableDir, isStandard: false, fkTable: master });
      }
    }

    // WorkflowStructure columns (NinjaProcessor line 365-401)
    if (workflow) {
      WORKFLOW_COLS.forEach(function (wc) {
        if (!seen[wc.name]) {
          seen[wc.name] = true;
          columns.push({ name: wc.name, refId: wc.refId, isStandard: false });
        }
      });
    }

    return { name: name, master: master, workflow: workflow, kanban: kanban, columns: columns };
  }

  // ── parseRomo(rows, opts) — 2_RO_ModelMaker format ─────────────────────────────────────────────
  // rows: array-of-arrays; row[0] = header; rows[1..] = data
  // Header cols: RO_ModelHeader_ID, SeqNo, WorkflowStructure, KanbanBoard, Master, Name, Help, ColumnSet
  function parseRomo(rows, opts, warnings) {
    if (!rows || rows.length < 2) return [];
    var hdr = (rows[0] || []).map(function (v) { return String(v || '').trim().toLowerCase(); });

    function col(name) {
      var idx = hdr.indexOf(name);
      return function (row) { return idx >= 0 ? String(row[idx] || '').trim() : ''; };
    }

    var getBundle  = col('ro_modelheader_id');
    var getWF      = col('workflowstructure');
    var getKanban  = col('kanbanboard');
    var getMaster  = col('master');
    var getName    = col('name');
    var getColSet  = col('columnset');

    var bundleName = opts.bundleName || '';
    var tables = [];

    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var tableName = getName(row).replace(/\s+/g, '');
      if (!tableName) continue;

      if (!bundleName) bundleName = getBundle(row);

      var master   = getMaster(row).replace(/\s+/g, '');
      var workflow = getWF(row).toUpperCase() === 'Y';
      var kanban   = getKanban(row).toUpperCase() === 'Y';
      var colDefs  = getColSet(row).split(',').map(function (s) { return s.trim(); }).filter(Boolean);

      tables.push(buildTable(tableName, master, workflow, kanban, colDefs, warnings));
    }

    return { bundleName: bundleName, tables: tables };
  }

  // ── parseColumnar(rows, opts) — ModelMakerSource transposed format ──────────────────────────────
  // rows: array-of-arrays (0-indexed); row[0]=parent names, row[1]=table names, row[2+]=col defs
  function parseColumnar(rows, opts, warnings) {
    if (!rows || rows.length < 3) return { bundleName: '', tables: [] };

    var tableNameRow = rows[1] || [];  // 0-based index 1 = row 2 in 1-based (table names)
    var tables = [];
    var bundleName = opts.bundleName || '';

    // Each column (0-based) is one table
    var numCols = tableNameRow.length;
    for (var col = 0; col < numCols; col++) {
      var rawName = String(tableNameRow[col] || '').trim();
      // Skip empty, formula refs (=...) or Excel-style cell refs (A1, B4...)
      if (!rawName || rawName[0] === '=' || /^[A-Z]+\d+$/.test(rawName)) continue;

      var tableName = rawName.replace(/\s+/g, '');

      // Collect col defs from rows[2+]
      var colDefs = [];
      for (var r = 2; r < rows.length; r++) {
        var row = rows[r] || [];
        var val = String(row[col] || '').trim();
        if (!val || val[0] === '=' || /^[A-Z]+\d+$/.test(val)) continue;
        colDefs.push(val.replace(/"/g, ''));
      }

      // Master from row[0] (parent name row)
      var parentName = String((rows[0] || [])[col] || '').trim();
      var master = (parentName && parentName !== tableName) ? parentName.replace(/\s+/g, '') : '';

      tables.push(buildTable(tableName, master, false, false, colDefs, warnings));
    }

    return { bundleName: bundleName, tables: tables };
  }

  // ── parseSheet(rows, opts) — public entry point ─────────────────────────────────────────────────
  // opts.format = 'romo' (default) | 'columnar'
  // opts.bundleName, opts.version, opts.entityType — override metadata
  function parseSheet(rows, opts) {
    opts = opts || {};
    var warnings = [];
    var format = opts.format || 'romo';
    var result;

    if (format === 'columnar') {
      result = parseColumnar(rows, opts, warnings);
    } else {
      result = parseRomo(rows, opts, warnings);
    }

    return {
      bundleName: result.bundleName || opts.bundleName || '',
      version: opts.version || '1.0.0',
      entityType: opts.entityType || 'U',
      tables: result.tables || [],
      warnings: warnings
    };
  }

  // ── REF_TYPE map (mirrors ad_process.js REF_TYPE for downstream compatibility) ─────────────────
  var REF_TYPE = {
    10: 'string', 14: 'string',
    11: 'integer', 13: 'integer', 18: 'integer', 19: 'integer',
    12: 'number', 22: 'number', 29: 'number',
    15: 'date', 16: 'date',
    17: 'list', 20: 'yesno', 28: 'button'
  };

  function refType(id) { return REF_TYPE[Number(id)] || 'string'; }

  var API = {
    parseSheet: parseSheet,
    parseColDef: parseColDef,
    standardColumns: standardColumns,
    REF_TYPE: REF_TYPE,
    refType: refType,
    DT: DT
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaModel = API;

})(typeof self !== 'undefined' ? self : this);
