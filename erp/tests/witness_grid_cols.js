#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GRID-COLS-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §GRID-COLS). READ THE LOG: §GRC lines; exit code is not evidence.
// THE ISSUE: does every tab's grid show the columns legacy's grid shows, in the same order? Legacy = GridView.setupFields :409-470 evaluated
//   on the PILOT dictionary (AD_Field_v order SeqNo, IsDisplayed DESC; active field + column; IsDisplayedGrid; not a toolbar-only button =
//   Button reference with AD_Column.IsToolbarButton='Y'; stable sort by SeqNoGrid, null -> 0). Twin = ad_parser.getFields on the seed (with
//   the self-heal patch) + AdGridTab.gridFields. Judged per tab both dictionaries have (X of N); also how many tabs the OLD rule (the form's
//   display fields, first 7) got wrong - the defect. Mobile cap judged separately (first 10 in field order, then SeqNoGrid).
// Run: node tests/witness_grid_cols.js   (cwd = bim-ootb/erp; the pilot postgres container up)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ERP = path.join(__dirname, '..'), log = console.log;
var G = require(path.join(ERP, 'ad_gridtab.js')), ADP = require(path.join(ERP, 'ad_parser.js'));
var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js'));
function pgRows(sql) { return JSON.parse(cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'],
  { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t', encoding: 'utf8', maxBuffer: 1 << 30 }).trim()); }
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
  var leg = {}, legMob = {}, keyOf = {};
  var rows = pgRows("SELECT f.ad_tab_id AS tab, c.columnname AS col, f.seqno AS sq, f.isdisplayed AS d, f.isdisplayedgrid AS g, coalesce(f.seqnogrid,0) AS sg, " +
    "coalesce(f.ad_reference_id, c.ad_reference_id) AS ref, c.istoolbarbutton AS tb FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id " +
    "WHERE f.isactive='Y' AND c.isactive='Y' ORDER BY f.ad_tab_id, f.seqno, f.isdisplayed DESC, f.ad_field_id");
  var byTab = {}; rows.forEach(function (r) { (byTab[r.tab] = byTab[r.tab] || []).push(r); });
  var rule = function (list, max) {
    var out = []; for (var i = 0; i < list.length; i++) { var r = list[i]; if (r.g === 'Y' && !(Number(r.ref) === 28 && r.tb === 'Y')) out.push(r); if (max && out.length >= max) break; }
    return out.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return (a.r.sg - b.r.sg) || a.i - b.i; }).map(function (x) { keyOf[x.r.tab + '|' + x.r.col.toLowerCase()] = x.r.sg + '/' + x.r.sq + '/' + x.r.d; return x.r.col.toLowerCase(); });
  };
  Object.keys(byTab).forEach(function (t) { leg[t] = rule(byTab[t], 0); legMob[t] = rule(byTab[t], 10); });
  var tabs = db.exec("SELECT AD_Tab_ID FROM AD_Tab WHERE IsActive='Y' ORDER BY AD_Tab_ID")[0].values.map(function (v) { return String(v[0]); });
  // GridFieldVO.getSQL orders by IsDisplayed DESC, SeqNo with NO tie-break: fields equal on (SeqNoGrid, SeqNo, IsDisplayed) may legally swap
  var tieEq = function (t, a, b) { return a.length === b.length && a.every(function (c, i) { return c === b[i] || keyOf[t + '|' + c] === keyOf[t + '|' + b[i]]; }); };
  var judged = 0, ok = 0, exact = 0, okMob = 0, oldWrong = 0, bad = [], onlySeed = 0, empty = 0;
  tabs.forEach(function (t) {
    if (!leg[t]) { onlySeed++; return; }
    var f; try { f = ADP.getFields(db, Number(t)); } catch (e) { f = []; }
    var tw = (G.gridFields(f, {}) || []).map(function (x) { return x.columnName.toLowerCase(); });
    var twM = (G.gridFields(f, { mobile: true, maxMobile: 10 }) || []).map(function (x) { return x.columnName.toLowerCase(); });
    var old = f.filter(function (x) { return x.isDisplayed && !x.isKey; }).slice(0, 7).map(function (x) { return x.columnName.toLowerCase(); });
    judged++; if (!leg[t].length) empty++;
    if (JSON.stringify(tw) === JSON.stringify(leg[t])) exact++;
    if (tieEq(t, tw, leg[t])) ok++; else bad.push(t + ' twin=' + tw.join(',') + ' legacy=' + leg[t].join(','));
    if (tieEq(t, twM, legMob[t])) okMob++;
    if (JSON.stringify(old) !== JSON.stringify(leg[t])) oldWrong++;
  });
  log('§GRC-TABS judged=' + judged + ' equal=' + ok + ' (exact ' + exact + ', the rest differ only inside equal sort keys)' + ' mobileEqual=' + okMob + ' legacyEmptyGrid=' + empty + ' onlySeed=' + onlySeed);
  log('§GRC-CONTROL oldRule(form display fields, first 7) wrong on ' + oldWrong + ' of ' + judged + ' tabs');
  log('§GRC-DIFF n=' + bad.length + ' ' + JSON.stringify(bad.slice(0, 15)));
  var pass = judged > 0 && ok === judged && okMob === judged;
  log('§GRC-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE (nothing judged)' : pass ? 'PASS' : 'FAIL') + ' ' + ok + '/' + judged + ' tabs · mobile ' + okMob + '/' + judged);
  process.exit(pass ? 0 : 1);
})().catch(function (e) { log('§GRC-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
