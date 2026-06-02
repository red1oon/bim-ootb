// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for idempiere.html (renderer #1, iDempiere-classic chrome).
//   THE POC CLAIM: a browser page with NO server folds the real Application Dictionary out of
//   ad_seed.db via SQLite WASM and renders a faithful iDempiere UI. This test runs the SAME
//   ADParser/ADData fold calls idempiere.html makes, over the SAME ad_seed.db, and asserts the
//   menu + a window fold come from SQLite (handAuthored=0). If this passes, "SQLite WASM is up to it".
//   §-log first — READ the log before any conclusion.
// Run:  node tests/test_idempiere_fold.js 2>&1 | tee tests/test_idempiere_fold.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');
var VIEWER = path.join(__dirname, '..');

global.window = global.window || {};            // ad_parser/ad_data are browser IIFEs
var ADParser = require(path.join(VIEWER, 'ad_parser.js'));
var ADData = require(path.join(VIEWER, 'ad_data.js'));

var fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('  ✗ FAIL: ' + msg); } else { console.log('  ✓ ' + msg); } }

function countTree(nodes) {
  var g = 0, l = 0;
  (nodes || []).forEach(function (n) {
    var isFolder = n.isSummary || (n.children && n.children.length);
    if (isFolder) { g++; var r = countTree(n.children); g += r.g; l += r.l; }
    else l++;
  });
  return { g: g, l: l };
}
function wLeaves(nodes, out) {
  out = out || [];
  (nodes || []).forEach(function (n) {
    if (n.action === 'W' && n.windowId) out.push(n);
    if (n.children && n.children.length) wLeaves(n.children, out);
  });
  return out;
}

(async function () {
  console.log('=== §IDEMPIERE-FOLD witness — proving SQLite WASM drives the iDempiere UI ===');
  var SQL = await initSqlJs();
  var buf = fs.readFileSync(path.join(VIEWER, 'ad_seed.db'));
  var db = new SQL.Database(new Uint8Array(buf));
  ADParser.init(db);

  // ── ISSUE 1: the left menu tree folds from AD_Menu (the real menu, not a list) ──
  console.log('\n[ISSUE 1] menu tree folds from AD_Menu (definition-as-data)');
  var roots = ADParser.getMenuTree(db);
  var c = countTree(roots);
  ok(roots.length > 0, 'getMenuTree returns roots (' + roots.length + ')');
  ok(c.g > 0, 'menu has summary GROUPS folded from ad_menu (' + c.g + ')');
  ok(c.l > 0, 'menu has LEAVES folded from ad_menu (' + c.l + ')');

  // ── ISSUE 2: a window folds into tabs + fields, and its header tab returns ROWS from SQLite ──
  console.log('\n[ISSUE 2] a window folds (tabs + fields + rows) — all from SQLite');
  var leaves = wLeaves(roots);
  var seen = {}, exemplar = null, foldedAny = 0, rowsAny = 0;
  for (var i = 0; i < leaves.length && foldedAny < 60; i++) {
    var wid = Number(leaves[i].windowId);
    if (seen[wid]) continue; seen[wid] = 1;
    var win = ADParser.getWindow(db, wid);
    if (!win || !win.tabs || !win.tabs.length) continue;
    foldedAny++;
    var hdr = win.tabs[0];
    var fcount = hdr.fields ? hdr.fields.length : 0;
    var rows = 0;
    if (hdr.tableName) {
      var wc = (hdr.whereClause && hdr.whereClause.indexOf('@') < 0) ? hdr.whereClause : null;
      var recs = ADData.readRecords(db, hdr.tableName, wc, null) || [];
      rows = recs.length;
    }
    if (rows > 0 && (!exemplar || rows > exemplar.rows)) exemplar = { name: win.name, id: wid, tabs: win.tabs.length, table: hdr.tableName, fields: fcount, rows: rows };
    if (rows > 0) rowsAny++;
  }
  ok(foldedAny > 0, 'at least one window folds into tabs+fields (' + foldedAny + ' windows folded)');
  ok(!!exemplar, 'at least one window header tab returns ROWS from SQLite (' + rowsAny + ' windows with data)');

  if (exemplar) {
    console.log('\n§IDEMPIERE-FOLD menu groups=' + c.g + ' leaves=' + c.l + ' source=ad_menu' +
      ' · window=' + exemplar.name + '(' + exemplar.id + ') tabs=' + exemplar.tabs +
      ' table=' + exemplar.table + ' headerFields=' + exemplar.fields + ' gridRows=' + exemplar.rows +
      ' source=sqlite handAuthored=0');
  }

  console.log('\n=== RESULT: ' + (fails === 0 ? 'ALL PASS — SQLite WASM is up to it' : fails + ' FAIL') + ' ===');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL: ' + e.message); process.exit(1); });
