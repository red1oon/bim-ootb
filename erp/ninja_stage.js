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
// §GT-NINJA (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md): a DETAIL table (model.master names ANOTHER table staged in the
// same model, and that table has the `<Master>_ID` FK column) is staged the iDempiere way — a TabLevel = master+1 AD_Tab INSIDE
// its master's AD_Window (no window / menu leaf of its own), with AD_Column.IsParent='Y' on `<Master>_ID`. The generic GridTab
// layer (ad_gridtab.js, GridWindow.initTab:193-242) then resolves the link column from IsParent alone — AD_Tab.AD_Column_ID is
// only written where iDempiere needs it (more than one IsParent column on the tab's table; the Ninja grammar yields exactly one).
// A table whose master is NOT in the model (external FK) keeps the legacy own-window shape: no parent tab to be a detail of.
//
// ID policy (deterministic): NINJA_BASE = 7_000_000. Same model → same IDs on every re-run.
// Rollback: SET IsActive='N' on the rows of ONE model (its tables, by name); another bundle's rows are not touched.
// Menu: each bundle has its own summary node, found by the bundle's name in the node range (NINJA_BASE + 450000 up).
// kernel_ops audit: NINJA_STAGE / NINJA_ROLLBACK ops appended.

(function (global) {
  'use strict';

  var NINJA_BASE    = 7000000;  // matches oracle PackOut.xml starting IDs
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.NINJAISO_BREAK) || '';   // the falsifiers of W-NINJA-STAGE-ISO
  var NINJA_TREE_ID = 10;       // AD_TreeNodeMM tree (10 = menu tree in seed db)

  // Stock iDempiere DefaultValue of the standard columns (verified against ad_seed C_Order: IsActive 'Y', AD_Org_ID/AD_Client_ID
  // @#..@, Created/Updated SYSDATE). Without IsActive='Y' a NEW record is "inactive" and GridField.isEditable (:565-585) makes every
  // other field read-only — the staged window opened with a dead form.
  var STD_DEFAULTS = { IsActive: 'Y', AD_Org_ID: '@#AD_Org_ID@', AD_Client_ID: '@#AD_Client_ID@', Created: 'SYSDATE', Updated: 'SYSDATE' };

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
  // dataTableSql(name, columns[{name, refId}]) — THE rule for a staged table's physical table (seed convention: NUMERIC / TEXT, PRIMARY KEY on <Table>_ID; IF NOT EXISTS, so rows
  // already entered are never touched). stageModels runs it; the door's boot step (common/door/erp_cli.js ensureTables, bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §10) runs the same text.
  var NUMERIC_REFS = { 11: 1, 12: 1, 13: 1, 18: 1, 19: 1, 29: 1 };
  function dataTableSql(name, columns) {
    var ddl = columns.map(function (col) { return '"' + String(col.name).replace(/"/g, '') + '" ' + (NUMERIC_REFS[col.refId] ? 'NUMERIC' : 'TEXT'); });
    var hasPk = columns.some(function (col) { return col.name === name + '_ID'; });
    return 'CREATE TABLE IF NOT EXISTS "' + String(name).replace(/"/g, '') + '" (' + ddl.join(', ') + (hasPk ? ', PRIMARY KEY ("' + name + '_ID")' : '') + ')';
  }
  // one new column of a table that is already there (a reused dictionary table, or a staged table that gains a column): the same type rule as dataTableSql
  function columnSql(physName, col) {
    return 'ALTER TABLE "' + String(physName).replace(/"/g, '') + '" ADD COLUMN "' + String(col.name).replace(/"/g, '') + '" ' + (NUMERIC_REFS[col.refId] ? 'NUMERIC' : 'TEXT');
  }
  // A model table whose name the dictionary already holds outside the Ninja range (legacy Ninja, MRO_ModelMaker.handleModel L108-150: the table is looked up by name, upper case;
  // absent it is created, present it is reused and the sheet's columns are added; present, not user-maintained and with NO master, the row is left alone, L110).
  function existingTable(db, name) {
    var r = db.exec("SELECT AD_Table_ID, TableName, EntityType FROM AD_Table WHERE upper(TableName)=upper('" + q(name) + "') AND AD_Table_ID<" + NINJA_BASE + ' ORDER BY AD_Table_ID');
    return r.length && r[0].values.length ? { id: Number(r[0].values[0][0]), name: r[0].values[0][1], entity: r[0].values[0][2] } : null;
  }
  function stageModels(db, model, ts) {
    ts = ts != null ? ts : 0;
    var bundleName = model.bundleName || 'Ninja';
    var tables = model.tables || [];
    var counts = { tables: 0, cols: 0, windows: 0, tabs: 0, fields: 0, menus: 0, skipped: 0, callouts: 0, reused: [], leftAlone: [] };
    var ext = tables.map(function (t) { return existingTable(db, t.name); });
    var leave = tables.map(function (t, i) { return !!ext[i] && !t.master && ext[i].entity !== 'U'; });

    // ensure AD_Column.Callout exists (additive — ad_seed.db omits it; ALTER is safe if missing)
    var hasCalloutCol = db.exec("SELECT name FROM pragma_table_info('AD_Column') WHERE lower(name)='callout'").length > 0;
    if (!hasCalloutCol) db.run('ALTER TABLE AD_Column ADD COLUMN Callout TEXT');
    // same for AD_Column.IsParent (§GT-NINJA) — the simplified post_poc seed omits it; the full ad_seed has it
    var hasParentCol = db.exec("SELECT name FROM pragma_table_info('AD_Column') WHERE lower(name)='isparent'").length > 0;
    if (!hasParentCol) db.run("ALTER TABLE AD_Column ADD COLUMN IsParent TEXT DEFAULT 'N'");

    // ID sub-ranges (each table gets 200 column/field slots)
    var tBase  = NINJA_BASE;
    var wBase  = NINJA_BASE + 100000;
    var tabBase = NINJA_BASE + 200000;
    var fBase  = NINJA_BASE + 300000;
    var mBase  = NINJA_BASE + 400000;
    var cBase  = NINJA_BASE + 500000;
    var sBase  = NINJA_BASE + 450000, sEnd = cBase;   // the bundles' summary nodes

    // Determine parent menu ID: use the highest existing summary menu below NINJA_BASE
    var parentMenuId = Number(val(db,
      "SELECT COALESCE(MAX(AD_Menu_ID),0) FROM AD_Menu WHERE IsSummary='Y' AND AD_Menu_ID < " + NINJA_BASE
    )) || 0;

    // ── Summary menu node: the bundle's OWN, found by its name (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.1 F2) ──
    var summaryMenuId = BREAK === 'onenode' ? mBase : (Number(val(db, "SELECT MIN(AD_Menu_ID) FROM AD_Menu WHERE IsSummary='Y' AND AD_Menu_ID>=" + sBase +
      ' AND AD_Menu_ID<' + sEnd + " AND Name='" + q(bundleName) + "'")) || 0);
    if (!summaryMenuId) summaryMenuId = Math.max(sBase - 1, Number(val(db, 'SELECT MAX(AD_Menu_ID) FROM AD_Menu WHERE AD_Menu_ID>=' + sBase + ' AND AD_Menu_ID<' + sEnd)) || 0) + 1;
    if (ensure(db, 'AD_Menu', 'AD_Menu_ID', summaryMenuId)) {
      db.run("INSERT INTO AD_Menu (AD_Menu_ID, Name, Description, IsSummary, IsActive)" +
        " VALUES (" + summaryMenuId + ",'" + q(bundleName) + "','Ninja bundle: " + q(bundleName) + "','Y','Y')");
      counts.menus++;
    } else { counts.skipped++; }
    if (parentMenuId && isMissing(db, 'AD_TreeNodeMM', 'AD_Tree_ID=' + NINJA_TREE_ID + ' AND Node_ID=' + summaryMenuId)) {
      db.run('INSERT INTO AD_TreeNodeMM (AD_Tree_ID, Node_ID, Parent_ID, SeqNo, IsActive)' +
        ' VALUES (' + NINJA_TREE_ID + ',' + summaryMenuId + ',' + parentMenuId + ',1000,"Y")');
    }
    counts.node = summaryMenuId;

    // ── §GT-NINJA master/detail resolution — from the model only (t.master + the staged table set) ──
    var byName = {};
    tables.forEach(function (t, i) { byName[t.name] = i; });
    var parentOf = tables.map(function (t) {
      var m = t.master, mi = (m && m !== t.name) ? byName[m] : undefined;
      if (mi === undefined) return -1;
      var fk = m + '_ID';
      return t.columns.some(function (c) { return c.name === fk; }) ? mi : -1;
    });
    tables.forEach(function (t, i) {                       // cycle guard: a loop has no root — break it at its entry point
      var j = i, n = 0; while (parentOf[j] >= 0 && n <= tables.length) { j = parentOf[j]; n++; }
      if (n > tables.length) parentOf[i] = -1;
    });
    var rootOf = [], levelOf = [], seqOf = [], kids = tables.map(function () { return []; }), roots = [];
    tables.forEach(function (t, i) { if (parentOf[i] >= 0) kids[parentOf[i]].push(i); else roots.push(i); });
    (function walk() {                                     // depth-first per root: a detail tab always follows its master tab
      roots.forEach(function (r) {
        var pos = 0;
        (function dfs(i, lvl) { rootOf[i] = r; levelOf[i] = lvl; seqOf[i] = 10 * (++pos); kids[i].forEach(function (k) { dfs(k, lvl + 1); }); })(r, 0);
      });
    })();
    counts.details = 0; counts.dataTables = 0;

    // ── slot offset: IDs are index-derived (deterministic), but a slot may already hold a DIFFERENT table — ad_seed.db ships a
    //    deactivated Ninja leftover (C_Attendance @7000000), and ensure() would silently reactivate it AS this model's table.
    //    Shift the whole model to the first offset where every slot is free or already ours (same TableName) — re-stage-stable.
    var slot = 0;
    for (;;) {
      var clash = tables.some(function (t, i) {
        if (ext[i]) return false;                              // a reused table takes no slot of its own
        var nm = val(db, 'SELECT TableName FROM AD_Table WHERE AD_Table_ID=' + (tBase + i + slot));
        return nm != null && nm !== t.name;
      });
      if (!clash) break;
      slot++;
    }
    counts.slot = slot;

    tables.forEach(function (t, ti) {
      if (leave[ti]) { counts.leftAlone.push(t.name); return; }
      var isDetail = parentOf[ti] >= 0, E = ext[ti];
      var si       = ti + slot;
      var tableId  = E ? E.id : tBase + si;
      var have = {}, others = [];                              // a reused table: its columns by name, and the ones the sheet does not name
      if (E) {
        counts.reused.push(t.name);
        var ec = db.exec("SELECT AD_Column_ID, ColumnName FROM AD_Column WHERE AD_Table_ID=" + E.id + " AND IsActive='Y' AND AD_Column_ID<" + NINJA_BASE + ' ORDER BY AD_Column_ID');
        (ec.length ? ec[0].values : []).forEach(function (v) { have[String(v[1]).toUpperCase()] = Number(v[0]); });
        var named = {}; t.columns.forEach(function (c) { named[c.name.toUpperCase()] = 1; });
        (ec.length ? ec[0].values : []).forEach(function (v) { if (!named[String(v[1]).toUpperCase()]) others.push({ id: Number(v[0]), name: v[1] }); });
      }
      var windowId = wBase    + (isDetail ? rootOf[ti] : ti) + slot;   // a detail lives in its root master's window
      var ownWinId = wBase    + si;
      var tabId    = tabBase  + si;
      var menuId   = mBase    + 1 + si;
      var tabLevel = isDetail ? levelOf[ti] : (t.master ? 1 : 0);
      var tabSeq   = isDetail ? seqOf[ti] : 10;
      if (isDetail) counts.details++;
      var colStart = cBase    + si * 200;
      var fieldStart = fBase  + si * 200;

      // AD_Window — a detail has none of its own (a stale one from a pre-§GT-NINJA staging is deactivated, with its menu leaf)
      if (isDetail) {
        db.run("UPDATE AD_Window SET IsActive='N' WHERE AD_Window_ID=" + ownWinId);
        db.run("UPDATE AD_Menu SET IsActive='N' WHERE AD_Menu_ID=" + menuId);
      } else if (ensure(db, 'AD_Window', 'AD_Window_ID', windowId)) {
        db.run("INSERT INTO AD_Window (AD_Window_ID, Name, Description, WindowType, IsActive)" +
          " VALUES (" + windowId + ",'" + q(t.name.replace(/_/g, ' ')) + "'," +
          "'Ninja: " + q(t.name) + "','M','Y')");
        counts.windows++;
      } else { counts.skipped++; }

      // AD_Table (a reused table keeps its own row untouched)
      if (E) { /* reused */ }
      else if (ensure(db, 'AD_Table', 'AD_Table_ID', tableId)) {
        db.run("INSERT INTO AD_Table (AD_Table_ID, TableName, Name, Description, AD_Window_ID, IsActive)" +
          " VALUES (" + tableId + ",'" + q(t.name) + "','" + q(t.name.replace(/_/g, ' ')) + "'," +
          "'Ninja: " + q(t.name) + "'," + windowId + ",'Y')");
        counts.tables++;
      } else { counts.skipped++; }
      if (!E) db.run('UPDATE AD_Table SET AD_Window_ID=' + windowId + ' WHERE AD_Table_ID=' + tableId);   // re-stage corrects the shape

      // AD_Tab
      if (ensure(db, 'AD_Tab', 'AD_Tab_ID', tabId)) {
        db.run("INSERT INTO AD_Tab (AD_Tab_ID, AD_Window_ID, Name, AD_Table_ID, TabLevel, SeqNo, IsActive)" +
          " VALUES (" + tabId + "," + windowId + ",'" + q(t.name.replace(/_/g, ' ')) + "'," +
          tableId + "," + tabLevel + "," + tabSeq + ",'Y')");
        counts.tabs++;
      } else { counts.skipped++; }
      db.run('UPDATE AD_Tab SET AD_Window_ID=' + windowId + ', TabLevel=' + tabLevel + ', SeqNo=' + tabSeq + ' WHERE AD_Tab_ID=' + tabId);

      // AD_Columns + AD_Fields
      // a reused table's other columns get a field too, first, in their own order (legacy createTabFields: every column of the table, by AD_Column_ID)
      others.forEach(function (o, k) {
        var fid = fieldStart + 100 + k;
        if (ensure(db, 'AD_Field', 'AD_Field_ID', fid)) {
          db.run("INSERT INTO AD_Field (AD_Field_ID, AD_Tab_ID, AD_Column_ID, Name, SeqNo, IsDisplayed, IsReadOnly, IsActive)" +
            " VALUES (" + fid + "," + tabId + "," + o.id + ",'" + q(String(o.name).replace(/_/g, ' ')) + "'," + ((k + 1) * 10) + ",'Y','N','Y')");
          counts.fields++;
        } else { counts.skipped++; }
      });
      var newCols = [];
      t.columns.forEach(function (col, ci) {
        var old     = E ? have[col.name.toUpperCase()] : 0;
        var colId   = old || (colStart + ci);
        var fieldId = fieldStart + ci;
        var fieldLen = 22;
        if (col.refId === 20) fieldLen = 1;                   // YesNo
        else if (col.refId === 12 || col.refId === 29) fieldLen = 11; // Amount/Qty
        else if (col.refId === 15 || col.refId === 16) fieldLen = 7;  // Date/DateTime
        else if (col.refId === 14) fieldLen = 2000;           // Text

        var isKey = col.name === (t.name + '_ID') ? 'Y' : 'N';
        var isId  = (col.name === 'Name' || isKey === 'Y') ? 'Y' : 'N';
        var stdDef = Object.prototype.hasOwnProperty.call(STD_DEFAULTS, col.name) && col.isStandard ? "'" + q(STD_DEFAULTS[col.name]) + "'" : 'NULL';
        var isParent = (isDetail && col.name === t.master + '_ID') ? 'Y' : 'N';   // §GT-NINJA — iDempiere's link-column marker

        if (old) { /* the table has this column already: it is left as it is */ }
        else if (ensure(db, 'AD_Column', 'AD_Column_ID', colId)) {
          newCols.push(col);
          var calloutVal = col.callout ? "'" + q(col.callout) + "'" : 'NULL';
          db.run("INSERT INTO AD_Column (AD_Column_ID, AD_Table_ID, ColumnName, Name, Description," +
            " AD_Reference_ID, FieldLength, IsMandatory, IsKey, IsParent, IsIdentifier, Callout, DefaultValue, IsActive)" +
            " VALUES (" + colId + "," + tableId + ",'" + q(col.name) + "'," +
            "'" + q(col.name.replace(/_/g, ' ')) + "','Ninja col'," +
            col.refId + "," + fieldLen + ",'N','" + isKey + "','" + isParent + "','" + isId + "'," + calloutVal + "," + stdDef + ",'Y')");
          counts.cols++;
          if (col.callout) counts.callouts++;
        } else { counts.skipped++; }
        if (!old) db.run("UPDATE AD_Column SET IsParent='" + isParent + "'" + (stdDef !== 'NULL' ? ', DefaultValue=COALESCE(DefaultValue,' + stdDef + ')' : '') + ' WHERE AD_Column_ID=' + colId);

        if (ensure(db, 'AD_Field', 'AD_Field_ID', fieldId)) {
          db.run("INSERT INTO AD_Field (AD_Field_ID, AD_Tab_ID, AD_Column_ID, Name," +
            " SeqNo, IsDisplayed, IsReadOnly, IsActive)" +
            " VALUES (" + fieldId + "," + tabId + "," + colId + "," +
            "'" + q(col.name.replace(/_/g, ' ')) + "'," + ((others.length + ci + 1) * 10) + ",'Y','N','Y')");
          counts.fields++;
        } else { counts.skipped++; }
      });

      // Data table (iDempiere: Synchronize Column / "Create Table in DB"). Without it the window renders "table not in this seed"
      // (idempiere.html renderActiveTab) and neither tab has a row source — AD alone is not a module. Seed convention: NUMERIC / TEXT,
      // PRIMARY KEY on <Table>_ID. IF NOT EXISTS: a re-stage / rollback never touches rows already entered.
      if (E) {                                                 // the table is there: only the columns the sheet adds (legacy: Synchronize Column, ALTER TABLE ADD)
        var phys = val(db, "SELECT name FROM sqlite_master WHERE type='table' AND lower(name)=lower('" + q(E.name) + "')");
        if (phys) {
          var pc = {}; var pr = db.exec('PRAGMA table_info("' + String(phys).replace(/"/g, '') + '")'); (pr.length ? pr[0].values : []).forEach(function (v) { pc[String(v[1]).toUpperCase()] = 1; });
          t.columns.forEach(function (col) { if (!have[col.name.toUpperCase()] && !pc[col.name.toUpperCase()]) { db.run(columnSql(phys, col)); counts.colsAdded = (counts.colsAdded || 0) + 1; } });
        }
      } else {
      if (isMissing(db, 'sqlite_master', "type='table' AND lower(name)=lower('" + q(t.name) + "')")) counts.dataTables = (counts.dataTables || 0) + 1;
      db.run(dataTableSql(t.name, t.columns));
      }

      // AD_Menu leaf — one per WINDOW (a detail is a tab of its master's window, not a menu entry)
      if (isDetail) { /* §GT-NINJA no menu leaf */ }
      else if (ensure(db, 'AD_Menu', 'AD_Menu_ID', menuId)) {
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
      if (!isDetail) db.run('UPDATE AD_TreeNodeMM SET Parent_ID=' + summaryMenuId + ' WHERE AD_Tree_ID=' + NINJA_TREE_ID + ' AND Node_ID=' + menuId);   // a re-stage moves the leaf under its bundle's own node
    });
    emptyNodesOff(db);

    // kernel_ops audit
    ensureKernelOps(db);
    db.run("INSERT INTO kernel_ops (timestamp, op_type, parameters)" +
      " VALUES (" + ts + ",'NINJA_STAGE','" +
      q(JSON.stringify({ bundle: bundleName, tables: counts.tables, cols: counts.cols })) + "')");

    return counts;
  }

  // A staged summary node with no active leaf under it is switched off (stage and rollback both end with it).
  function emptyNodesOff(db) {
    db.run("UPDATE AD_Menu SET IsActive='N' WHERE IsSummary='Y' AND IsActive='Y' AND AD_Menu_ID>=" + NINJA_BASE +
      ' AND NOT EXISTS (SELECT 1 FROM AD_TreeNodeMM n JOIN AD_Menu l ON l.AD_Menu_ID=n.Node_ID' +
      " WHERE n.AD_Tree_ID=" + NINJA_TREE_ID + " AND n.Parent_ID=AD_Menu.AD_Menu_ID AND l.IsActive='Y')");
  }

  // ── rollbackModel(db, model) — SET IsActive='N' on what ONE model staged (§12.1 F1). `model` is the model object
  //    ({ bundleName, tables:[{name}] }); a bundle NAME is taken too (an emitted bundle module passes it): its tables are
  //    the ones whose windows hang under the node of that name. No model, or a name no node carries: refused (never "all").
  function rollbackModel(db, model) {
    var counts = { tables: 0, cols: 0, windows: 0, tabs: 0, fields: 0, menus: 0 }, ids = [], name;
    function list(sql) { var r = db.exec(sql); return r.length ? r[0].values.map(function (v) { return Number(v[0]); }) : []; }
    function off(table, where) {
      var n = Number(val(db, 'SELECT COUNT(*) FROM ' + table + " WHERE IsActive='Y' AND " + where)) || 0;
      if (n) db.run('UPDATE ' + table + " SET IsActive='N' WHERE " + where);
      return n;
    }
    if (BREAK === 'blanket') ids = list('SELECT AD_Table_ID FROM AD_Table WHERE AD_Table_ID>=' + NINJA_BASE);
    else if (model && typeof model === 'object' && model.tables) {
      name = model.bundleName;
      model.tables.forEach(function (t) { ids = ids.concat(list("SELECT AD_Table_ID FROM AD_Table WHERE upper(TableName)=upper('" + q(t.name) + "')")); });   // a reused dictionary table too: only its Ninja-range columns and tabs go off
    } else if (typeof model === 'string' && model) {
      name = model;
      ids = list('SELECT DISTINCT t.AD_Table_ID FROM AD_Menu s JOIN AD_TreeNodeMM n ON n.Parent_ID=s.AD_Menu_ID AND n.AD_Tree_ID=' + NINJA_TREE_ID +
        ' JOIN AD_Menu l ON l.AD_Menu_ID=n.Node_ID JOIN AD_Tab t ON t.AD_Window_ID=l.AD_Window_ID' +
        " WHERE s.IsSummary='Y' AND s.AD_Menu_ID>=" + NINJA_BASE + " AND s.Name='" + q(model) + "' AND t.AD_Tab_ID>=" + NINJA_BASE);
      if (!ids.length) throw new Error('rollbackModel: no staged bundle is named ' + model + ' (nothing was changed)');
    } else throw new Error('rollbackModel needs the model (or its bundle name): a rollback of every staged model is not offered');
    if (ids.length) {
      var inT = '(' + ids.join(',') + ')', tabs = list('SELECT AD_Tab_ID FROM AD_Tab WHERE AD_Table_ID IN ' + inT + ' AND AD_Tab_ID>=' + NINJA_BASE), wins = list('SELECT DISTINCT AD_Window_ID FROM AD_Tab WHERE AD_Table_ID IN ' + inT + ' AND AD_Tab_ID>=' + NINJA_BASE + ' AND AD_Window_ID>=' + NINJA_BASE);
      counts.tables = off('AD_Table', 'AD_Table_ID IN ' + inT + ' AND AD_Table_ID>=' + NINJA_BASE);
      counts.cols   = off('AD_Column', 'AD_Table_ID IN ' + inT + ' AND AD_Column_ID>=' + NINJA_BASE);
      if (tabs.length) { counts.fields = off('AD_Field', 'AD_Tab_ID IN (' + tabs.join(',') + ')'); counts.tabs = off('AD_Tab', 'AD_Tab_ID IN (' + tabs.join(',') + ')'); }
      wins.forEach(function (w) {   // a window goes when no active tab is left in it; its menu leaf goes with it
        if (Number(val(db, "SELECT COUNT(*) FROM AD_Tab WHERE IsActive='Y' AND AD_Window_ID=" + w))) return;
        counts.windows += off('AD_Window', 'AD_Window_ID=' + w);
        counts.menus += off('AD_Menu', 'AD_Window_ID=' + w + ' AND AD_Menu_ID>=' + NINJA_BASE);
      });
      var before = Number(val(db, "SELECT COUNT(*) FROM AD_Menu WHERE IsSummary='Y' AND IsActive='Y' AND AD_Menu_ID>=" + NINJA_BASE)) || 0;
      emptyNodesOff(db);
      counts.menus += before - (Number(val(db, "SELECT COUNT(*) FROM AD_Menu WHERE IsSummary='Y' AND IsActive='Y' AND AD_Menu_ID>=" + NINJA_BASE)) || 0);
    }
    console.log('§NINJA_ROLLBACK bundle=' + (name || 'unknown') + ' tables=' + counts.tables + ' cols=' + counts.cols + ' windows=' + counts.windows + ' tabs=' + counts.tabs + ' fields=' + counts.fields + ' menus=' + counts.menus);

    ensureKernelOps(db);
    db.run("INSERT INTO kernel_ops (timestamp, op_type, parameters)" +
      " VALUES (0,'NINJA_ROLLBACK','" +
      q(JSON.stringify(Object.assign({ bundle: name || 'unknown' }, counts))) + "')");
    return counts;
  }

  // ── extractModel(db, AD_Window_ID) — INVERSE of stageModels. Implementing NINJA_MODE_LANE.md §1.
  // Reads AD_Window/AD_Table/AD_Tab/AD_Column back from db and reconstructs the model shape
  // { bundleName, tables:[{name,master,workflow,kanban,columns}] } that parseSheet produces.
  // PURE read — no mutations. Non-standard columns only (standard cols are re-added by buildTable).
  //
  // STRUCTURAL BOUNDARY (NINJA_MODE_LANE.md §3): the round-trip is EXACT for everything stageModels
  // persists — table/column/refId/master/workflow/callout. It does NOT reconstruct what staging never
  // writes: L#-list values (parsed by parseColDef but not staged to AD_Ref_List), validation rules
  // (AD_Val_Rule_ID), or display logic. Those travel as crafted JS / behaviour, not via the grammar.
  var STANDARD_COL_NAMES = ['AD_Client_ID','AD_Org_ID','IsActive','Created','CreatedBy','Updated','UpdatedBy'];
  var WORKFLOW_COL_NAMES  = ['DocStatus','DocAction'];
  var DT_ID = 13, DT_STRING = 10, DT_TABLEDIR = 19, DT_TABLE = 18;

  function extractModel(db, AD_Window_ID) {
    function rows(sql, p) {
      var r = db.exec(sql, p || []); if (!r.length) return [];
      var cs = r[0].columns;
      return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c,i){ o[c]=v[i]; }); return o; });
    }
    function one(sql, p) { var r = rows(sql, p); return r[0] || null; }

    var win = one('SELECT AD_Window_ID,Name,Description FROM AD_Window WHERE AD_Window_ID=?', [AD_Window_ID]);
    if (!win) return null;

    // bundleName: strip "Ninja: " prefix from Description, fall back to Name
    var bundleName = win.Description ? String(win.Description).replace(/^Ninja:\s*/,'') : win.Name;

    var tables = rows(
      'SELECT AD_Table_ID,TableName FROM AD_Table WHERE AD_Window_ID=? AND IsActive="Y" ORDER BY AD_Table_ID',
      [AD_Window_ID]
    );

    var modelTables = tables.map(function (tbl) {
      var tab = one(
        'SELECT TabLevel FROM AD_Tab WHERE AD_Table_ID=? AND IsActive="Y" ORDER BY SeqNo LIMIT 1',
        [tbl.AD_Table_ID]
      );
      var tabLevel = tab ? Number(tab.TabLevel) : 0;

      var cols = rows(
        'SELECT ColumnName,AD_Reference_ID,IsParent FROM AD_Column WHERE AD_Table_ID=? AND IsActive="Y" ORDER BY AD_Column_ID',
        [tbl.AD_Table_ID]
      );

      var tableName = tbl.TableName;
      var stdSet    = { [tableName+'_ID']:1, [tableName+'_UU']:1 };
      STANDARD_COL_NAMES.forEach(function(n){ stdSet[n]=1; });

      var hasWorkflow = false, hasKanban = false;
      var userCols = [];

      cols.forEach(function (c) {
        var nm = c.ColumnName;
        if (stdSet[nm]) return;                     // skip standard boilerplate
        if (WORKFLOW_COL_NAMES.indexOf(nm) >= 0) { hasWorkflow = true; if (nm==='DocStatus') hasKanban=true; return; }
        userCols.push({ name: nm, refId: c.AD_Reference_ID, isParent: c.IsParent === 'Y' });
      });

      // §GT-NINJA master = the column AD marks IsParent='Y' (iDempiere's own link marker, GridWindow.initTab) — read from the AD,
      // not inferred from position. buildTable APPENDS the generated FK after the user columns, so on re-parse it lands last again.
      // LEGACY (staged before §GT-NINJA, own-window TabLevel-1 shape, no IsParent): fall back to the last non-standard *_ID TableDir
      // col of a TabLevel>0 tab — never the first (a user col like AD_User_ID/C_BPartner_ID can precede it). Pop it off the tail.
      var masterCol = null, pi = -1;
      userCols.forEach(function (c, i) { if (c.isParent && c.name.slice(-3) === '_ID' && pi < 0) pi = i; });
      if (pi >= 0) { masterCol = userCols[pi].name.slice(0, -3); userCols.splice(pi, 1); }
      else if (tabLevel > 0 && userCols.length) {
        var last = userCols[userCols.length - 1];
        if (last.name.slice(-3) === '_ID' &&
            (last.refId === DT_TABLEDIR || last.refId === DT_TABLE)) {
          masterCol = last.name.slice(0, -3);       // strip _ID → master table name
          userCols.pop();                           // drop the generated FK col
        }
      }
      userCols = userCols.map(function (c) { return { name: c.name, refId: c.refId }; });

      return { name: tableName, master: masterCol || null, workflow: hasWorkflow, kanban: hasKanban,
               columns: userCols };
    });

    return { bundleName: bundleName, tables: modelTables };
  }

  var API = { stageModels: stageModels, dataTableSql: dataTableSql, columnSql: columnSql, existingTable: existingTable, rollbackModel: rollbackModel, extractModel: extractModel, NINJA_BASE: NINJA_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaStage = API;

})(typeof self !== 'undefined' ? self : this);
