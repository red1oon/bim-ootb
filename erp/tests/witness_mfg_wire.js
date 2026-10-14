#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-MFG-WIRE (Milestone 1; spec ~/Projects/Mfg/MILESTONE_1_SPEC.md). READ THE LOG after every run: verdict = §MFG-VERDICT.
// THE ISSUE it proves/disproves: the Manufacturing Order window (AD_Window 53009, 13 tabs) cannot be used because (a) 8 PP tables have no
//   physical table and 2 are column-short, (b) no active AD_Menu path reaches it (M3 now: the BASE carries none; the Libero bundle stages the path, witness_libero_bundle.js L2).  PASS = the window carries 13 tabs whose
//   tables hold every dictionary column.  The seed is loaded AS THE LOADER LOADS IT: ad_seed.db + patches/ad_seed.db.sql statement by statement.
// Deliberate breaks (each MUST turn the verdict red and NAME the culprit):  MFG_BREAK=table|col|menu
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs, REAL_SQLJS = false; try { initSqlJs = require('sql.js'); REAL_SQLJS = true; } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }   // the bundled wasm only goes with the bundled loader
var BREAK = process.env.MFG_BREAK || '', WIN = 53009, MENU_LEAF = 53055, EXPECT_TABS = 13;
var EIGHT = ['pp_order_workflow', 'pp_order_node_product', 'pp_order_node_asset', 'pp_order_nodenext', 'pp_cost_collector', 'pp_cost_collectorma', 'pp_wf_node_product', 'pp_wf_node_asset'];
var fails = 0, judged = 0, inconclusive = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; console.log('  §MFG ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var SQL = await initSqlJs(REAL_SQLJS ? {} : { wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var ok = 0, bad = 0;
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) {   // the loader's order: seed patch, then the Manufacturing patch
    fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) {
      st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return;
      try { db.run(st); ok++; } catch (e) { bad++; }
    });
  });
  console.log('§MFG-LOAD patch statements ok=' + ok + ' failed=' + bad + ' break=' + (BREAK || 'none'));
  // deliberate breaks, applied AFTER the load so they model "the patch lost something"
  if (BREAK === 'table') db.run('DROP TABLE pp_cost_collector');
  if (BREAK === 'col') db.run('ALTER TABLE pp_order_node DROP COLUMN ad_wf_responsible_id');
  if (BREAK === 'menu') db.run('DELETE FROM ad_menu WHERE ad_menu_id=53052');
  function q(sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; }
  var phys = {}; q("SELECT name FROM sqlite_master WHERE type='table'").forEach(function (r) { phys[r.name.toLowerCase()] = 1; });

  // M1 — the eight tables exist physically
  var miss = EIGHT.filter(function (t) { return !phys[t]; });
  check('M1 eight missing PP tables are physical', miss.length === 0, { missing: miss });

  // M2 — every dictionary column of every table behind the window's tabs has a physical column (names the culprit)
  var tabs = q("SELECT t.ad_tab_id, t.name AS tab, lower(tb.tablename) AS tn FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE t.ad_window_id=? AND t.isactive='Y' ORDER BY t.seqno", [WIN]);
  var tables = {}; tabs.forEach(function (t) { tables[t.tn] = 1; });
  var tnames = Object.keys(tables), lacking = [], judgedCols = 0;
  tnames.forEach(function (tn) {
    if (!phys[tn]) { lacking.push(tn + ' (no table)'); return; }
    var have = {}; q('PRAGMA table_info("' + tn + '")').forEach(function (c) { have[c.name.toLowerCase()] = 1; });
    q("SELECT lower(c.columnname) AS cn FROM ad_column c JOIN ad_table tb ON tb.ad_table_id=c.ad_table_id WHERE lower(tb.tablename)=? AND c.isactive='Y' AND (c.columnsql IS NULL OR c.columnsql='')", [tn])
      .forEach(function (c) { judgedCols++; if (!have[c.cn]) lacking.push(tn + '.' + c.cn); });
  });
  console.log('§MFG-COLS tables=' + tnames.length + ' dictionary columns judged=' + judgedCols + ' lacking=' + lacking.length);
  if (!tnames.length || !judgedCols) { inconclusive++; console.log('§MFG M2 INCONCLUSIVE — empty population (tables=' + tnames.length + ' cols=' + judgedCols + ')'); }
  else check('M2 every tab table has every dictionary column', lacking.length === 0, { lacking: lacking.slice(0, 12), n: lacking.length });

  // M3 — menu: since the Libero bundle (erp/plugins/libero_manufacturing.mjs) owns the EE01 menu path, the BASE must NOT carry an active path to the window (legacy parity: EE01 ships disabled).
  //      The positive walk (leaf -> root through active rows, opens window 53009) is witnessed by witness_libero_bundle.js L2 after the bundle activates. MFG_BREAK=menu re-adds one row and must turn this red.
  if (BREAK === 'menu') db.run("INSERT INTO ad_menu (ad_menu_id, name, isactive, issummary, action, ad_window_id) VALUES (53055, 'Manufacturing Order', 'Y', 'N', 'W', 53009)");
  var anyMenu = q("SELECT ad_menu_id AS id FROM ad_menu WHERE ad_menu_id IN (53014,53052,53053,53055)");
  var menuWin = q("SELECT ad_menu_id AS id FROM ad_menu WHERE ad_window_id=? AND action='W' AND isactive='Y'", [WIN]);
  console.log('§MFG-MENU base rows for the EE01 path=' + anyMenu.length + ' active menu leaves for window ' + WIN + '=' + menuWin.length + ' (expected 0 and 0 until the bundle activates)');
  check('M3 the base has no EE01 menu rows and no active menu leaf for window ' + WIN + ' (the bundle stages them)', anyMenu.length === 0 && menuWin.length === 0, { rows: anyMenu, leaves: menuWin });

  // M4 — the window as the app opens it (ad_parser.getWindow) carries 13 tabs
  var P = require(path.join(ERP, 'ad_parser.js'));
  var shim = { exec: function (sql, p) { var s = db.prepare(sql); try { if (p) s.bind(p); var cols = s.getColumnNames(), vals = []; while (s.step()) vals.push(s.get()); return vals.length ? [{ columns: cols, values: vals }] : []; } finally { s.free(); } } };
  var w = P.getWindow(shim, WIN), nt = w ? w.tabs.length : 0;
  if (!w || nt === 0) { inconclusive++; console.log('§MFG M4 INCONCLUSIVE — window/tabs empty'); }
  else check('M4 getWindow(' + WIN + ') returns ' + EXPECT_TABS + ' tabs', nt === EXPECT_TABS, { tabs: nt, names: w.tabs.map(function (t) { return t.name; }) });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('§MFG-VERDICT ' + verdict + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§MFG-VERDICT FAIL harness error: ' + e.message); process.exit(2); });
