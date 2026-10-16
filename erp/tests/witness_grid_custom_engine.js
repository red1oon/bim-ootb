#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GRID-CUSTOM-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §GRID-CUSTOM). READ THE LOG: §GCE lines; exit code is not evidence.
// THE ISSUE: does the twin keep a user's grid customization exactly as legacy keeps it? (A) the AD_Tab_Customization row after each save
//   (insert, reorder, widths, open-mode + auto-hide, empty Custom -> the row is DELETED, empty with no row -> nothing) == the REAL
//   MTabCustomization.saveData + get on the pilot (oracle op `tabcust`, throwaway rows removed through the model); (B) the Customize dialog's
//   Available list order (AD_Field IsDisplayed OR IsDisplayedGrid, active, ORDER BY SeqNoGrid, Name, SeqNo under the DB collation) == the
//   pilot's own query for EVERY tab both dictionaries have (X of N); (C) the auto-hide value saveData stores (:616-621) for every case.
// Run: node tests/witness_grid_custom_engine.js   (cwd = bim-ootb/erp; pilot postgres + oracle :8097 up)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
var ERP = path.join(__dirname, '..'), log = console.log, G = require(path.join(ERP, 'ad_gridtab.js')), ADP = require(path.join(ERP, 'ad_parser.js')), F = require(path.join(ERP, 'ad_find.js'));
var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js'));
function pgRows(sql) { return JSON.parse(cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'],
  { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(t),'[]') FROM (" + sql + ') t', encoding: 'utf8', maxBuffer: 1 << 30 }).trim()); }
function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }); rq.on('error', rej); rq.end(d); }); }
var pass = 0, fail = 0, ok = function (id, n, c, d) { log((c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c ? pass++ : fail++; };
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
  // (A) save sequences vs the real MTabCustomization (Order header tab 186, GardenAdmin)
  var TAB = 186, USER = 101, CTX = { client: 11, org: 11, role: 102, user: USER };
  var f = pgRows("SELECT f.ad_field_id::text id FROM ad_field f WHERE f.ad_tab_id=" + TAB + " AND f.isactive='Y' AND f.isdisplayedgrid='Y' ORDER BY f.seqnogrid LIMIT 3").map(function (r) { return r.id; });
  var SEQS = {
    'insert': [{ custom: f[0] + ',' + f[1] }],
    'update reorders': [{ custom: f[0] + ',' + f[1] }, { custom: f[1] + ',' + f[0] + ',' + f[2] }],
    'widths + open mode + auto-hide': [{ custom: f[0] + ',' + f[1] + ';120px,80px', displayedGrid: 'Y', autoHide: 'Y' }],
    'empty Custom deletes the row': [{ custom: f[0] }, { custom: '' }],
    'empty Custom with no row writes nothing': [{ custom: '' }],
    'open mode cleared back to null': [{ custom: f[0], displayedGrid: 'N' }, { custom: f[0], displayedGrid: null }]
  };
  var aJ = 0, aOk = 0, bad = [];
  for (var name in SEQS) {
    var steps = SEQS[name].map(function (s) { return { custom: s.custom == null ? null : s.custom, displayedGrid: s.displayedGrid == null ? null : s.displayedGrid, autoHide: s.autoHide == null ? null : s.autoHide }; });
    var o = await oracle({ op: 'tabcust', tab: TAB, reset: true, steps: steps, ctx: CTX });
    var row = null, seq = 1, twin = steps.map(function (s) {
      G.tabCustSave(row, { custom: s.custom, displayedGrid: s.displayedGrid, autoHide: s.autoHide, tab: TAB, user: USER }).forEach(function (it) {
        if (it.op === 'create') { row = Object.assign({ ad_tab_customization_id: seq++ }, it.fields); }
        else if (it.op === 'update') Object.assign(row, it.changes);
        else if (it.op === 'delete') row = null;
      });
      return row ? { exists: true, custom: row.custom, isdisplayedgrid: row.isdisplayedgrid, isautohideemptycolumn: row.isautohideemptycolumn, isquickform: row.isquickform } : { exists: false };
    });
    var leg = (o.steps || []).map(function (x) { var y = { exists: x.exists }; if (x.exists) { y.custom = x.custom; y.isdisplayedgrid = x.isdisplayedgrid; y.isautohideemptycolumn = x.isautohideemptycolumn; y.isquickform = x.isquickform; } return y; });
    aJ++; var same = JSON.stringify(twin) === JSON.stringify(leg); if (same) aOk++; else bad.push(name + ' twin=' + JSON.stringify(twin) + ' legacy=' + JSON.stringify(leg));
    log('§GCE-A ' + name + ' ' + (same ? 'EQUAL' : 'DIFF') + ' ' + JSON.stringify(leg));
  }
  ok('A', 'AD_Tab_Customization rows == the real MTabCustomization.saveData + get (' + aJ + ' sequences)', aJ > 0 && aOk === aJ, bad.join(' | '));
  // (B) the dialog's Available order, every tab
  var legL = {}; pgRows("SELECT ad_tab_id::text tab, ad_field_id::text id FROM ad_field WHERE (isdisplayed='Y' OR isdisplayedgrid='Y') AND isactive='Y' ORDER BY ad_tab_id, seqnogrid, name, seqno").forEach(function (r) { (legL[r.tab] = legL[r.tab] || []).push(r.id); });
  var tabs = db.exec("SELECT AD_Tab_ID FROM AD_Tab WHERE IsActive='Y'")[0].values.map(function (v) { return String(v[0]); });
  var bJ = 0, bOk = 0, bByte = 0, bBad = [];
  tabs.forEach(function (t) {
    if (!legL[t]) return;
    var r0 = db.exec("SELECT AD_Field_ID, Name, SeqNoGrid, SeqNo FROM AD_Field WHERE AD_Tab_ID=" + Number(t) + " AND (IsDisplayed='Y' OR IsDisplayedGrid='Y') AND IsActive='Y'");
    var flds = r0.length ? r0[0].values.map(function (v) { return { id: v[0], name: v[1], seqNoGrid: v[2], seqNo: v[3] }; }) : [];
    var tw = G.customizeLists(flds, [], F.collate).available.map(function (x) { return String(x.id); });
    var byte = G.customizeLists(flds, [], null).available.map(function (x) { return String(x.id); });
    bJ++; if (JSON.stringify(tw) === JSON.stringify(legL[t])) bOk++; else bBad.push(t); if (JSON.stringify(byte) === JSON.stringify(legL[t])) bByte++;
  });
  log('§GCE-B tabs judged=' + bJ + ' equal=' + bOk + ' (byte-order Name sort would give ' + bByte + ') diff=' + JSON.stringify(bBad.slice(0, 20)));
  ok('B', 'Customize dialog list order == the pilot\'s query on every tab (Name under the DB collation)', bJ > 0 && bOk === bJ, bBad.length + ' differ');
  // (C) the auto-hide value stored (saveData :616-621)
  var C = [[true, false, null, 'Y'], [false, false, null, null], [true, true, null, null], [false, true, null, 'N'], [false, false, 'Y', 'N'], [true, true, 'N', 'Y']];
  var cBad = C.filter(function (c) { return G.autoHideToSave(c[0], c[1], c[2]) !== c[3]; });
  ok('C', 'auto-hide value stored = saveData :616-621 for all ' + C.length + ' cases', cBad.length === 0, JSON.stringify(cBad));
  log('§GCE-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { log('§GCE-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
