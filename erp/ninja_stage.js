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
// Rollback: SET IsActive='N' on all rows with ID >= NINJA_BASE.
// kernel_ops audit: NINJA_STAGE / NINJA_ROLLBACK ops appended.

(function (global) {
  'use strict';

  var NINJA_BASE    = 7000000;  // matches oracle PackOut.xml starting IDs
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
  function stageModels(db, model, ts) {
    ts = ts != null ? ts : 0;
    var bundleName = model.bundleName || 'Ninja';
    var tables = model.tables || [];
    var counts = { tables: 0, cols: 0, windows: 0, tabs: 0, fields: 0, menus: 0, skipped: 0, callouts: 0 };

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
        var nm = val(db, 'SELECT TableName FROM AD_Table WHERE AD_Table_ID=' + (tBase + i + slot));
        return nm != null && nm !== t.name;
      });
      if (!clash) break;
      slot++;
    }
    counts.slot = slot;

    tables.forEach(function (t, ti) {
      var isDetail = parentOf[ti] >= 0;
      var si       = ti + slot;
      var tableId  = tBase    + si;
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

      // AD_Table
      if (ensure(db, 'AD_Table', 'AD_Table_ID', tableId)) {
        db.run("INSERT INTO AD_Table (AD_Table_ID, TableName, Name, Description, AD_Window_ID, IsActive)" +
          " VALUES (" + tableId + ",'" + q(t.name) + "','" + q(t.name.replace(/_/g, ' ')) + "'," +
          "'Ninja: " + q(t.name) + "'," + windowId + ",'Y')");
        counts.tables++;
      } else { counts.skipped++; }
      db.run('UPDATE AD_Table SET AD_Window_ID=' + windowId + ' WHERE AD_Table_ID=' + tableId);   // re-stage corrects the shape

      // AD_Tab
      if (ensure(db, 'AD_Tab', 'AD_Tab_ID', tabId)) {
        db.run("INSERT INTO AD_Tab (AD_Tab_ID, AD_Window_ID, Name, AD_Table_ID, TabLevel, SeqNo, IsActive)" +
          " VALUES (" + tabId + "," + windowId + ",'" + q(t.name.replace(/_/g, ' ')) + "'," +
          tableId + "," + tabLevel + "," + tabSeq + ",'Y')");
        counts.tabs++;
      } else { counts.skipped++; }
      db.run('UPDATE AD_Tab SET AD_Window_ID=' + windowId + ', TabLevel=' + tabLevel + ', SeqNo=' + tabSeq + ' WHERE AD_Tab_ID=' + tabId);

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
        var stdDef = Object.prototype.hasOwnProperty.call(STD_DEFAULTS, col.name) && col.isStandard ? "'" + q(STD_DEFAULTS[col.name]) + "'" : 'NULL';
        var isParent = (isDetail && col.name === t.master + '_ID') ? 'Y' : 'N';   // §GT-NINJA — iDempiere's link-column marker

        if (ensure(db, 'AD_Column', 'AD_Column_ID', colId)) {
          var calloutVal = col.callout ? "'" + q(col.callout) + "'" : 'NULL';
          db.run("INSERT INTO AD_Column (AD_Column_ID, AD_Table_ID, ColumnName, Name, Description," +
            " AD_Reference_ID, FieldLength, IsMandatory, IsKey, IsParent, IsIdentifier, Callout, DefaultValue, IsActive)" +
            " VALUES (" + colId + "," + tableId + ",'" + q(col.name) + "'," +
            "'" + q(col.name.replace(/_/g, ' ')) + "','Ninja col'," +
            col.refId + "," + fieldLen + ",'N','" + isKey + "','" + isParent + "','" + isId + "'," + calloutVal + "," + stdDef + ",'Y')");
          counts.cols++;
          if (col.callout) counts.callouts++;
        } else { counts.skipped++; }
        db.run("UPDATE AD_Column SET IsParent='" + isParent + "'" + (stdDef !== 'NULL' ? ', DefaultValue=COALESCE(DefaultValue,' + stdDef + ')' : '') + ' WHERE AD_Column_ID=' + colId);

        if (ensure(db, 'AD_Field', 'AD_Field_ID', fieldId)) {
          db.run("INSERT INTO AD_Field (AD_Field_ID, AD_Tab_ID, AD_Column_ID, Name," +
            " SeqNo, IsDisplayed, IsReadOnly, IsActive)" +
            " VALUES (" + fieldId + "," + tabId + "," + colId + "," +
            "'" + q(col.name.replace(/_/g, ' ')) + "'," + ((ci + 1) * 10) + ",'Y','N','Y')");
          counts.fields++;
        } else { counts.skipped++; }
      });

      // Data table (iDempiere: Synchronize Column / "Create Table in DB"). Without it the window renders "table not in this seed"
      // (idempiere.html renderActiveTab) and neither tab has a row source — AD alone is not a module. Seed convention: NUMERIC / TEXT,
      // PRIMARY KEY on <Table>_ID. IF NOT EXISTS: a re-stage / rollback never touches rows already entered.
      var NUMERIC_REFS = { 11: 1, 12: 1, 13: 1, 18: 1, 19: 1, 29: 1 };
      var ddl = t.columns.map(function (col) { return '"' + col.name.replace(/"/g, '') + '" ' + (NUMERIC_REFS[col.refId] ? 'NUMERIC' : 'TEXT'); });
      var hasPk = t.columns.some(function (col) { return col.name === t.name + '_ID'; });
      if (isMissing(db, 'sqlite_master', "type='table' AND lower(name)=lower('" + q(t.name) + "')")) counts.dataTables = (counts.dataTables || 0) + 1;
      db.run('CREATE TABLE IF NOT EXISTS "' + t.name.replace(/"/g, '') + '" (' + ddl.join(', ') + (hasPk ? ', PRIMARY KEY ("' + t.name + '_ID")' : '') + ')');

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

  var API = { stageModels: stageModels, rollbackModel: rollbackModel, extractModel: extractModel, NINJA_BASE: NINJA_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaStage = API;

})(typeof self !== 'undefined' ? self : this);
