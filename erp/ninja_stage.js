// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_stage.js — Phase B: AD staging into sql.js (stageModels / rollbackModel)
//
// Implementing NINJA_MODE_LANE.md §Phase B — Witness: W-NINJA-STAGE
// Uses the browser ERP's simplified ad_seed schema (post_poc/ad_seed.db):
//   AD_Menu(ID,Name,Description,IsSummary,Action,AD_Window_ID,IsActive)
//   AD_Table(ID,TableName,Name,Description,AD_Window_ID,IsActive)
//   AD_Column(ID,AD_Table_ID,ColumnName,Name,Description,AD_Reference_ID,FieldLength,
//             IsMandatory,IsKey,IsIdentifier,DefaultValue,IsActive)
//   AD_Tab(ID,AD_Window_ID,Name,Description,AD_Table_ID,TabLevel,SeqNo,IsSingleRow,IsActive)
//   AD_Field(ID,AD_Tab_ID,AD_Column_ID,Name,SeqNo,IsDisplayed,IsMandatory,IsReadOnly,IsActive)
//   AD_Window(ID,Name,Description,WindowType,IsActive)
//   AD_TreeNodeMM(AD_Tree_ID,Node_ID,Parent_ID,SeqNo,IsActive)
//
// ID policy (deterministic): NINJA_BASE = 7_000_000. Same model → same IDs on every re-run.
// Rollback: SET IsActive='N' on all rows with ID >= NINJA_BASE.
// kernel_ops audit: NINJA_STAGE / NINJA_ROLLBACK ops appended.

(function (global) {
  'use strict';

  var NINJA_BASE    = 7000000;  // matches oracle PackOut.xml starting IDs
  var NINJA_TREE_ID = 10;       // AD_TreeNodeMM tree (10 = menu tree in seed db)

  // ── tiny helpers ────────────────────────────────────────────────────────────────────────
  function q(s) { return String(s == null ? '' : s).replace(/'/g, "''"); }

  function val(db, sql) {
    var r = db.exec(sql);
    if (!r.length || !r[0].values.length) return null;
    return r[0].values[0][0];
  }

  function isMissing(db, table, where) {
    return !Number(val(db, 'SELECT COUNT(*) FROM ' + table + ' WHERE ' + where));
  }

  // ensure(db, table, idCol, id) — reactivate-or-insert. Returns true if the row is MISSING (caller inserts);
  // if it already exists (e.g. a prior bundle that was rolled back to IsActive='N'), reactivates it and
  // returns false. This makes re-Create (edit sheet → re-emit) restore the model, not leave it deactivated.
  function ensure(db, table, idCol, id) {
    if (isMissing(db, table, idCol + '=' + id)) return true;
    db.run('UPDATE ' + table + " SET IsActive='Y' WHERE " + idCol + '=' + id);
    return false;
  }

  function ensureKernelOps(db) {
    db.run('CREATE TABLE IF NOT EXISTS kernel_ops (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      'timestamp INTEGER,' +
      'op_type TEXT NOT NULL,' +
      'parameters TEXT,' +
      'input_guids TEXT,' +
      'output_guid TEXT,' +
      'undone INTEGER DEFAULT 0' +
    ')');
  }

  // ── stageModels(db, model, ts) ───────────────────────────────────────────────────────────
  // db    : sql.js Database (loaded with post_poc/ad_seed schema)
  // model : NinjaModel.parseSheet() result
  // ts    : optional deterministic timestamp (integer)
  function stageModels(db, model, ts) {
    ts = ts != null ? ts : 0;
    var bundleName = model.bundleName || 'Ninja';
    var tables = model.tables || [];
    var counts = { tables: 0, cols: 0, windows: 0, tabs: 0, fields: 0, menus: 0, skipped: 0 };

    // ID sub-ranges (each table gets 200 column/field slots)
    var tBase  = NINJA_BASE;
    var wBase  = NINJA_BASE + 100000;
    var tabBase = NINJA_BASE + 200000;
    var fBase  = NINJA_BASE + 300000;
    var mBase  = NINJA_BASE + 400000;
    var cBase  = NINJA_BASE + 500000;

    // Determine parent menu ID: use the highest existing summary menu below NINJA_BASE
    var parentMenuId = Number(val(db,
      "SELECT COALESCE(MAX(AD_Menu_ID),0) FROM AD_Menu WHERE IsSummary='Y' AND AD_Menu_ID < " + NINJA_BASE
    )) || 0;

    // ── Summary menu node ──────────────────────────────────────────────────────────────
    var summaryMenuId = mBase;
    if (ensure(db, 'AD_Menu', 'AD_Menu_ID', summaryMenuId)) {
      db.run("INSERT INTO AD_Menu (AD_Menu_ID, Name, Description, IsSummary, IsActive)" +
        " VALUES (" + summaryMenuId + ",'" + q(bundleName) + "','Ninja bundle: " + q(bundleName) + "','Y','Y')");
      counts.menus++;
      if (parentMenuId && isMissing(db, 'AD_TreeNodeMM',
        'AD_Tree_ID=' + NINJA_TREE_ID + ' AND Node_ID=' + summaryMenuId)) {
        db.run('INSERT INTO AD_TreeNodeMM (AD_Tree_ID, Node_ID, Parent_ID, SeqNo, IsActive)' +
          ' VALUES (' + NINJA_TREE_ID + ',' + summaryMenuId + ',' + parentMenuId + ',1000,"Y")');
      }
    } else { counts.skipped++; }

    tables.forEach(function (t, ti) {
      var tableId  = tBase    + ti;
      var windowId = wBase    + ti;
      var tabId    = tabBase  + ti;
      var menuId   = mBase    + 1 + ti;
      var colStart = cBase    + ti * 200;
      var fieldStart = fBase  + ti * 200;

      // AD_Window
      if (ensure(db, 'AD_Window', 'AD_Window_ID', windowId)) {
        db.run("INSERT INTO AD_Window (AD_Window_ID, Name, Description, WindowType, IsActive)" +
          " VALUES (" + windowId + ",'" + q(t.name.replace(/_/g, ' ')) + "'," +
          "'Ninja: " + q(t.name) + "','M','Y')");
        counts.windows++;
      } else { counts.skipped++; }

      // AD_Table
      if (ensure(db, 'AD_Table', 'AD_Table_ID', tableId)) {
        db.run("INSERT INTO AD_Table (AD_Table_ID, TableName, Name, Description, AD_Window_ID, IsActive)" +
          " VALUES (" + tableId + ",'" + q(t.name) + "','" + q(t.name.replace(/_/g, ' ')) + "'," +
          "'Ninja: " + q(t.name) + "'," + windowId + ",'Y')");
        counts.tables++;
      } else { counts.skipped++; }

      // AD_Tab
      if (ensure(db, 'AD_Tab', 'AD_Tab_ID', tabId)) {
        db.run("INSERT INTO AD_Tab (AD_Tab_ID, AD_Window_ID, Name, AD_Table_ID, TabLevel, SeqNo, IsActive)" +
          " VALUES (" + tabId + "," + windowId + ",'" + q(t.name.replace(/_/g, ' ')) + "'," +
          tableId + "," + (t.master ? 1 : 0) + ",10,'Y')");
        counts.tabs++;
      } else { counts.skipped++; }

      // AD_Columns + AD_Fields
      t.columns.forEach(function (col, ci) {
        var colId   = colStart   + ci;
        var fieldId = fieldStart + ci;
        var fieldLen = 22;
        if (col.refId === 20) fieldLen = 1;                   // YesNo
        else if (col.refId === 12 || col.refId === 29) fieldLen = 11; // Amount/Qty
        else if (col.refId === 15 || col.refId === 16) fieldLen = 7;  // Date/DateTime
        else if (col.refId === 14) fieldLen = 2000;           // Text

        var isKey = col.name === (t.name + '_ID') ? 'Y' : 'N';
        var isId  = (col.name === 'Name' || isKey === 'Y') ? 'Y' : 'N';

        if (ensure(db, 'AD_Column', 'AD_Column_ID', colId)) {
          db.run("INSERT INTO AD_Column (AD_Column_ID, AD_Table_ID, ColumnName, Name, Description," +
            " AD_Reference_ID, FieldLength, IsMandatory, IsKey, IsIdentifier, IsActive)" +
            " VALUES (" + colId + "," + tableId + ",'" + q(col.name) + "'," +
            "'" + q(col.name.replace(/_/g, ' ')) + "','Ninja col'," +
            col.refId + "," + fieldLen + ",'N','" + isKey + "','" + isId + "','Y')");
          counts.cols++;
        } else { counts.skipped++; }

        if (ensure(db, 'AD_Field', 'AD_Field_ID', fieldId)) {
          db.run("INSERT INTO AD_Field (AD_Field_ID, AD_Tab_ID, AD_Column_ID, Name," +
            " SeqNo, IsDisplayed, IsReadOnly, IsActive)" +
            " VALUES (" + fieldId + "," + tabId + "," + colId + "," +
            "'" + q(col.name.replace(/_/g, ' ')) + "'," + ((ci + 1) * 10) + ",'Y','N','Y')");
          counts.fields++;
        } else { counts.skipped++; }
      });

      // AD_Menu leaf
      if (ensure(db, 'AD_Menu', 'AD_Menu_ID', menuId)) {
        db.run("INSERT INTO AD_Menu (AD_Menu_ID, Name, Description, IsSummary, Action, AD_Window_ID, IsActive)" +
          " VALUES (" + menuId + ",'" + q(t.name.replace(/_/g, ' ')) + "'," +
          "'Ninja: " + q(t.name) + "','N','W'," + windowId + ",'Y')");
        counts.menus++;
        if (isMissing(db, 'AD_TreeNodeMM',
          'AD_Tree_ID=' + NINJA_TREE_ID + ' AND Node_ID=' + menuId)) {
          db.run('INSERT INTO AD_TreeNodeMM (AD_Tree_ID, Node_ID, Parent_ID, SeqNo, IsActive)' +
            ' VALUES (' + NINJA_TREE_ID + ',' + menuId + ',' + summaryMenuId + ',' + (ti + 1) + ',"Y")');
        }
      } else { counts.skipped++; }
    });

    // kernel_ops audit
    ensureKernelOps(db);
    db.run("INSERT INTO kernel_ops (timestamp, op_type, parameters)" +
      " VALUES (" + ts + ",'NINJA_STAGE','" +
      q(JSON.stringify({ bundle: bundleName, tables: counts.tables, cols: counts.cols })) + "')");

    return counts;
  }

  // ── rollbackModel(db) — SET IsActive='N' on all Ninja-staged rows (ID >= NINJA_BASE) ──────
  function rollbackModel(db, bundleName) {
    var counts = {};
    function deact(table, col) {
      var n = Number(val(db, 'SELECT COUNT(*) FROM ' + table +
        " WHERE IsActive='Y' AND " + col + '>=' + NINJA_BASE)) || 0;
      db.run("UPDATE " + table + " SET IsActive='N' WHERE " + col + '>=' + NINJA_BASE);
      return n;
    }
    counts.tables  = deact('AD_Table',  'AD_Table_ID');
    counts.cols    = deact('AD_Column', 'AD_Column_ID');
    counts.windows = deact('AD_Window', 'AD_Window_ID');
    counts.tabs    = deact('AD_Tab',    'AD_Tab_ID');
    counts.fields  = deact('AD_Field',  'AD_Field_ID');
    counts.menus   = deact('AD_Menu',   'AD_Menu_ID');

    ensureKernelOps(db);
    db.run("INSERT INTO kernel_ops (timestamp, op_type, parameters)" +
      " VALUES (0,'NINJA_ROLLBACK','" +
      q(JSON.stringify(Object.assign({ bundle: bundleName || 'unknown' }, counts))) + "')");
    return counts;
  }

  var API = { stageModels: stageModels, rollbackModel: rollbackModel, NINJA_BASE: NINJA_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaStage = API;

})(typeof self !== 'undefined' ? self : this);
