/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — seed_hba_construction.js — W-HBA-CONSTRUCTION reproducible seed + self-witness.
//
// Implementing bim-compiler prompts/RESUME_HR_BIM_ASSET.md §2026-07-04 thread A ("Construction" window).
// User observation: a Building compiles onto the REAL M_Warehouse table, but the only native AD_Window over
// it is 139 "Warehouse and Locators" — warehouse-industry language for what's conceptually a construction/
// building context. Fix per user's own precedent: C_BPartner already carries 10 distinct native AD_Windows
// over ONE table (Business Partner/Vendor Details/Customer/Payroll Employee/...) — a SECOND AD_Window over
// M_Warehouse, named "Construction", is the SAME established iDempiere convention, not a new mechanism.
// Window 139 stays byte-for-byte untouched; every AD_Window/AD_Tab/AD_Field row below is a PROTO-CLONE of
// 139's real structure (exact table/column/field map — never a hand-typed partial row), only the WINDOW's
// own Name/Description/id differ. A menu leaf makes it discoverable in the sidebar; the ?window= deep-link
// (viewer/hba_lens.js erpLink, per the already-shipped §P11 pattern) works without one (ad_parser.js getWindow
// reads AD_Window/AD_Tab/AD_Field purely by id — confirmed, no manifest entry exists for a NEW id).
//
// ID band: CONSTR_BASE = 7,800,000 — chosen clear of every existing HBA/Ninja band in this db (Ninja dictionary
// staging 7,000,000-7,599,999; AD_InfoWindow lenses 7,600,000/7,700,000 — see seed_hba_erp.js/seed_hba_bom.js).
// IDEMPOTENT: find-or-create everywhere (a 2nd run adds 0 rows — §-log says so).
//
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node scripts/seed_hba_construction.js   (writes erp/ad_seed.db)

'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const ROOT = path.join(__dirname, '..');
const SEED = path.join(ROOT, 'erp', 'ad_seed.db');

const SRC_WINDOW_ID = 139;                 // "Warehouse and Locators" — never edited, only read
const CONSTR_BASE   = 7800000;
const WIN_ID   = CONSTR_BASE;               // one new AD_Window row
const TAB_BASE = CONSTR_BASE + 10000;       // 7810000 + tab index
const FLD_BASE = CONSTR_BASE + 20000;       // 7820000 + tabIndex*100 + fieldIndex
const MENU_ID  = CONSTR_BASE + 30000;       // 7830000

function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
function rows(db, sql, p) {
  var r = db.exec(sql, p || []); if (!r.length) return [];
  var cs = r[0].columns;
  return r[0].values.map(function (v) { var o = {}; cs.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}
function ins(db, table, obj) {
  var ks = Object.keys(obj);
  db.run('INSERT INTO ' + table + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')',
    ks.map(function (k) { return obj[k]; }));
}
// proto-clone: read a REAL row (matching whereSql), keep its populated columns, apply overrides.
// Guarantees EXACT iDempiere column map — no hand-built partial row (house idiom, seed_hba_erp.js/seed_hba_bom.js).
function protoClone(db, table, whereSql, params, overrides) {
  var r = db.exec('SELECT * FROM ' + table + (whereSql ? (' WHERE ' + whereSql) : '') + ' LIMIT 1', params || []);
  if (!r.length || !r[0].values.length) return null;
  var proto = {}; r[0].columns.forEach(function (c, i) { if (r[0].values[0][i] != null) proto[c] = r[0].values[0][i]; });
  return Object.assign({}, proto, overrides);
}

(async function () {
  var fails = 0;
  function L(m) { console.log(m); }
  function must(tag, cond, msg) { L('§W-HBA-CONSTRUCTION ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); if (!cond) fails++; }

  if (!fs.existsSync(SEED)) { L('§SEED_HBA_CONSTRUCTION FAIL — erp/ad_seed.db not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(SEED));
  var added = { window: 0, tabs: 0, fields: 0, menu: 0 };

  var srcWin = rows(db, 'SELECT * FROM AD_Window WHERE AD_Window_ID=?', [SRC_WINDOW_ID])[0];
  must('SRC-WINDOW-REAL', !!srcWin && srcWin.Name === 'Warehouse and Locators',
    'source window 139 exists untouched (Name=' + (srcWin && srcWin.Name) + ')');

  // ── 1. AD_Window — proto-clone 139, override id/Name/Description only ──────────────────────────────────
  if (scalar(db, 'SELECT AD_Window_ID FROM AD_Window WHERE AD_Window_ID=?', [WIN_ID]) == null) {
    var winRow = protoClone(db, 'AD_Window', 'AD_Window_ID=?', [SRC_WINDOW_ID], {
      AD_Window_ID: WIN_ID, Name: 'Construction',
      Description: 'Building / construction lens over the same M_Warehouse record as window 139 — '
        + 'HBA §2026-07-04 thread A (second AD_Window over one table, same convention as C_BPartner\'s 10 windows)'
    });
    ins(db, 'AD_Window', winRow); added.window++;
    L('§SEED_CONSTR_WIN ADD id=' + WIN_ID + " Name='Construction' (proto=139)");
  } else L('§SEED_CONSTR_WIN SKIP exists id=' + WIN_ID);

  // ── 2. AD_Tab — proto-clone every tab of 139 (SAME tables/levels/seqno), repoint AD_Window_ID ───────────
  var srcTabs = rows(db, 'SELECT AD_Tab_ID FROM AD_Tab WHERE AD_Window_ID=? ORDER BY SeqNo', [SRC_WINDOW_ID]);
  var tabIdMap = {};   // srcTabId -> new tabId
  srcTabs.forEach(function (t, i) {
    var newTabId = TAB_BASE + i;
    tabIdMap[t.AD_Tab_ID] = newTabId;
    if (scalar(db, 'SELECT AD_Tab_ID FROM AD_Tab WHERE AD_Tab_ID=?', [newTabId]) == null) {
      var tabRow = protoClone(db, 'AD_Tab', 'AD_Tab_ID=?', [t.AD_Tab_ID], { AD_Tab_ID: newTabId, AD_Window_ID: WIN_ID });
      ins(db, 'AD_Tab', tabRow); added.tabs++;
    }
  });
  L('§SEED_CONSTR_TAB source_tabs=' + srcTabs.length + ' added=' + added.tabs);

  // ── 3. AD_Field — proto-clone every field of every source tab, repoint AD_Tab_ID; AD_Column_ID UNCHANGED ─
  srcTabs.forEach(function (t, ti) {
    var srcFields = rows(db, 'SELECT AD_Field_ID FROM AD_Field WHERE AD_Tab_ID=? ORDER BY SeqNo', [t.AD_Tab_ID]);
    srcFields.forEach(function (f, fi) {
      var newFieldId = FLD_BASE + ti * 100 + fi;
      if (scalar(db, 'SELECT AD_Field_ID FROM AD_Field WHERE AD_Field_ID=?', [newFieldId]) != null) return;
      var fRow = protoClone(db, 'AD_Field', 'AD_Field_ID=?', [f.AD_Field_ID],
        { AD_Field_ID: newFieldId, AD_Tab_ID: tabIdMap[t.AD_Tab_ID] });
      ins(db, 'AD_Field', fRow); added.fields++;
    });
  });
  L('§SEED_CONSTR_FLD added=' + added.fields);

  // ── 4. AD_Menu leaf — same parent node as window 139's own menu (125), Action='W' ───────────────────────
  var parentId = scalar(db, 'SELECT Parent_ID FROM AD_TreeNodeMM WHERE Node_ID=?',
    [scalar(db, "SELECT AD_Menu_ID FROM AD_Menu WHERE AD_Window_ID=? AND Action='W'", [SRC_WINDOW_ID])]);
  if (scalar(db, 'SELECT AD_Menu_ID FROM AD_Menu WHERE AD_Menu_ID=?', [MENU_ID]) == null) {
    ins(db, 'AD_Menu', { AD_Menu_ID: MENU_ID, Name: 'Construction', Description: 'HBA Construction window',
      IsSummary: 'N', Action: 'W', AD_Window_ID: WIN_ID, IsActive: 'Y' });
    added.menu++;
    if (parentId != null && scalar(db, 'SELECT Node_ID FROM AD_TreeNodeMM WHERE Node_ID=?', [MENU_ID]) == null) {
      db.run('INSERT INTO AD_TreeNodeMM (AD_Tree_ID, Node_ID, Parent_ID, SeqNo, IsActive) VALUES (10,' + MENU_ID + ',' + parentId + ',1010,"Y")');
    }
    L('§SEED_CONSTR_MENU ADD id=' + MENU_ID + ' parent=' + parentId);
  } else L('§SEED_CONSTR_MENU SKIP exists id=' + MENU_ID);

  // ── 5. SELF-WITNESS ──────────────────────────────────────────────────────────────────────────────────────
  var win = rows(db, 'SELECT * FROM AD_Window WHERE AD_Window_ID=?', [WIN_ID])[0];
  must('WINDOW-NAMED', !!win && win.Name === 'Construction', 'new window carries Name=Construction, id=' + WIN_ID);
  must('WINDOW-139-UNTOUCHED', scalar(db, 'SELECT Name FROM AD_Window WHERE AD_Window_ID=139') === 'Warehouse and Locators',
    'window 139 Name is byte-identical to before (never edited)');

  var newTabs = rows(db, 'SELECT AD_Tab_ID, Name, AD_Table_ID, TabLevel FROM AD_Tab WHERE AD_Window_ID=? ORDER BY SeqNo', [WIN_ID]);
  var srcTabDetail = rows(db, 'SELECT Name, AD_Table_ID, TabLevel FROM AD_Tab WHERE AD_Window_ID=? ORDER BY SeqNo', [SRC_WINDOW_ID]);
  must('TAB-COUNT-PARITY', newTabs.length === srcTabDetail.length,
    'Construction has ' + newTabs.length + ' tabs == source window 139\'s ' + srcTabDetail.length);
  must('TAB-TABLE-PARITY', newTabs.every(function (t, i) { return t.AD_Table_ID === srcTabDetail[i].AD_Table_ID && t.Name === srcTabDetail[i].Name; }),
    'every cloned tab points at the SAME real AD_Table_ID + same Name as its 139 source (exact map, nothing invented)');

  var fieldCountsOk = true, fieldTotal = 0;
  newTabs.forEach(function (t, i) {
    var n = Number(scalar(db, 'SELECT COUNT(*) FROM AD_Field WHERE AD_Tab_ID=?', [t.AD_Tab_ID]));
    var srcN = Number(scalar(db, 'SELECT COUNT(*) FROM AD_Field WHERE AD_Tab_ID=?', [srcTabs[i].AD_Tab_ID]));
    fieldTotal += n;
    if (n !== srcN) fieldCountsOk = false;
  });
  must('FIELD-COUNT-PARITY', fieldCountsOk, 'every cloned tab carries the SAME field count as its 139 source (total=' + fieldTotal + ')');

  // every cloned field's AD_Column_ID resolves in the real dictionary (no dangling FK, no invented column)
  var orphanCols = Number(scalar(db,
    'SELECT COUNT(*) FROM AD_Field F WHERE F.AD_Tab_ID>=' + TAB_BASE + ' AND F.AD_Tab_ID<' + (TAB_BASE + 100)
    + ' AND NOT EXISTS (SELECT 1 FROM AD_Column C WHERE C.AD_Column_ID=F.AD_Column_ID)'));
  must('FIELD-COLUMN-REAL', orphanCols === 0, 'every cloned AD_Field.AD_Column_ID resolves to a real AD_Column row (0 dangling)');

  // deep-link path — mirror ad_parser.js getWindow's own query (DB path, no manifest entry for this new id)
  var winQ = rows(db, 'SELECT AD_Window_ID, Name, Description, WindowType FROM AD_Window WHERE AD_Window_ID=? AND IsActive=\'Y\'', [WIN_ID])[0];
  must('GETWINDOW-QUERY-SHAPE', !!winQ && winQ.Name === 'Construction', 'ad_parser.js getWindow()\'s own SELECT resolves the new window (DB path, no manifest edit needed)');

  must('MENU-LEAF', scalar(db, "SELECT COUNT(*) FROM AD_Menu WHERE AD_Window_ID=? AND Action='W'", [WIN_ID]) == 1,
    'exactly one discoverable menu leaf points at the new window');

  // ── write-back + summary ─────────────────────────────────────────────────────────────────────────────────
  var changed = added.window + added.tabs + added.fields + added.menu;
  if (changed > 0 && fails === 0) { fs.writeFileSync(SEED, Buffer.from(db.export())); L('§SEED_HBA_CONSTRUCTION WROTE erp/ad_seed.db (' + changed + ' additions)'); }
  else if (fails === 0) L('§SEED_HBA_CONSTRUCTION NO-OP — seed already current (idempotent 2nd run)');
  else L('§SEED_HBA_CONSTRUCTION NOT WRITTEN — ' + fails + ' witness failure(s), DB left untouched');
  L('§W-HBA-CONSTRUCTION ' + (fails === 0 ? 'PASS' : 'FAIL') + ' — summary ' + JSON.stringify(added));
  db.close();
  process.exit(fails === 0 ? 0 : 1);
})();
