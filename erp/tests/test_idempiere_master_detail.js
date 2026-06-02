// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for idempiere.html MASTER-DETAIL drill (the core iDempiere ZK behaviour).
//   ISSUE it proves: selecting a header record and opening a child tab filters the child rows by the
//   parent FK — i.e. the drill returns the parent's children ONLY, not the whole child table. Uses the
//   AD self-management window (Window → Tab → Field) since those dictionary tables hold data in ad_seed.db.
//   §-log first — READ the log before any conclusion.
// Run:  node tests/test_idempiere_master_detail.js 2>&1 | tee tests/test_idempiere_master_detail.log
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');
var VIEWER = path.join(__dirname, '..');
global.window = global.window || {};
var ADParser = require(path.join(VIEWER, 'ad_parser.js'));
var ADData = require(path.join(VIEWER, 'ad_data.js'));

var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  ✗ FAIL: ' + m); } else { console.log('  ✓ ' + m); } }
function count(db, t, where) { try { var r = db.exec('SELECT COUNT(*) FROM ' + t + (where ? ' WHERE ' + where : '')); return Number(r[0].values[0][0]); } catch (e) { return -1; } }
function keyCol(tab) { var k = (tab.fields || []).filter(function (f) { return f.isKey; })[0]; return k ? k.columnName : tab.tableName + '_ID'; }

(async function () {
  console.log('=== §IDEMPIERE-MD witness — master-detail drill filters child by parent FK ===');
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(VIEWER, 'ad_seed.db'))));
  ADParser.init(db);

  // Find the AD "Window" self-management window (header tab table = AD_Window).
  var r = db.exec("SELECT t.AD_Window_ID FROM AD_Tab t JOIN AD_Table tb ON t.AD_Table_ID=tb.AD_Table_ID WHERE tb.TableName='AD_Window' AND t.TabLevel=0 LIMIT 1");
  ok(r.length > 0, 'found the AD_Window self-management window');
  var winId = Number(r[0].values[0][0]);
  var win = ADParser.getWindow(db, winId);
  console.log('  window=' + win.name + '(' + winId + ') tabs=' + win.tabs.length);

  // Header (level 0) = AD_Window; pick the first record's key (what selecting a row does in the UI).
  var hdr = win.tabs.filter(function (t) { return (t.tabLevel || 0) === 0; })[0];
  var hdrRows = ADData.readRecords(db, hdr.tableName, null, null);
  ok(hdrRows.length > 0, 'header tab ' + hdr.tableName + ' has records (' + hdrRows.length + ')');
  var hdrKey = keyCol(hdr);
  var selPk = hdrRows[0][hdrKey];
  console.log('  selected header ' + hdr.tableName + '.' + hdrKey + '=' + selPk + ' (' + (hdrRows[0].Name || '') + ')');

  // Child (level 1) = AD_Tab; the drill filters AD_Tab WHERE AD_Window_ID = selected window.
  var child = win.tabs.filter(function (t) { return (t.tabLevel || 0) === 1 && t.tableName; })[0];
  ok(!!child, 'window has a level-1 child tab (' + (child && child.tableName) + ')');
  var childTotal = count(db, child.tableName);
  var childFiltered = count(db, child.tableName, hdrKey + '=' + selPk);
  console.log('§IDEMPIERE-MD parent=' + hdr.tableName + '.' + hdrKey + '=' + selPk +
    ' child=' + child.tableName + ' filtered=' + childFiltered + ' total=' + childTotal);
  ok(childFiltered > 0, child.tableName + ' filtered to the parent returns rows (' + childFiltered + ')');
  ok(childFiltered < childTotal, 'DRILL NARROWS: ' + child.tableName + ' filtered (' + childFiltered + ') << total (' + childTotal + ')');

  // Grandchild (level 2) = AD_Field; drill again by the selected child (AD_Tab) key.
  var childRows = ADData.readRecords(db, child.tableName, hdrKey + '=' + selPk, null);
  var childKey = keyCol(child);
  var selChildPk = childRows.length ? childRows[0][childKey] : null;
  var grand = win.tabs.filter(function (t) { return (t.tabLevel || 0) === 2 && t.tableName; })[0];
  if (grand && selChildPk != null) {
    var gTotal = count(db, grand.tableName);
    var gFiltered = count(db, grand.tableName, childKey + '=' + selChildPk);
    console.log('§IDEMPIERE-MD parent=' + child.tableName + '.' + childKey + '=' + selChildPk +
      ' child=' + grand.tableName + ' filtered=' + gFiltered + ' total=' + gTotal);
    ok(gFiltered > 0 && gFiltered < gTotal, 'DRILL NARROWS L2: ' + grand.tableName + ' filtered (' + gFiltered + ') << total (' + gTotal + ')');
  } else {
    console.log('  (no level-2 tab or no child row to drill — skipping L2)');
  }

  console.log('\n=== RESULT: ' + (fails === 0 ? 'ALL PASS — master-detail drill filters by parent FK' : fails + ' FAIL') + ' ===');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL: ' + e.message); process.exit(1); });
