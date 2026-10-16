#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-OPEN-MODE-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §OPEN-MODE). READ THE LOG: §OME lines; exit code is not evidence.
// THE ISSUE: does a tab open in the same presentation (form vs grid) as legacy? (A) for EVERY window both dictionaries have, the twin's mode per tab
//   (AdGridTab.singleRow over AD_Tab.IsSingleRow) == the REAL GridTab.isSingleRow() (oracle op `tabmode`); (B) the user's AD_Tab_Customization.IsDisplayedGrid
//   override (Y/N/null) on a tab of each default == the real class after MTabCustomization.saveData. VACUOUS if no window was judged.
// Run: node tests/witness_open_mode_engine.js   (cwd = bim-ootb/erp; pilot postgres + oracle :8097 up)
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ERP = path.join(__dirname, '..'), log = console.log, G = require(path.join(ERP, 'ad_gridtab.js'));
var initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js'));
var CTX = { client: 11, org: 11, role: 102, user: 101 };
function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 300))); } }); }); rq.on('error', rej); rq.end(d); }); }
var pass = 0, fail = 0, ok = function (id, n, c, d) { log((c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c ? pass++ : fail++; };
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var wins = db.exec("SELECT DISTINCT w.AD_Window_ID FROM AD_Window w JOIN AD_Tab t ON t.AD_Window_ID=w.AD_Window_ID WHERE w.IsActive='Y' AND t.IsActive='Y' ORDER BY 1")[0].values.map(function (v) { return v[0]; });
  var seedMode = {}; db.exec("SELECT AD_Tab_ID, IsSingleRow FROM AD_Tab WHERE IsActive='Y'")[0].values.forEach(function (v) { seedMode[v[0]] = v[1] === 'Y'; });
  var wJ = 0, tJ = 0, tOk = 0, bad = [], nSingle = 0, nGrid = 0, firstSingle = null, firstGrid = null;
  for (var i = 0; i < wins.length; i++) {
    var o; try { o = await oracle({ op: 'tabmode', window: wins[i], ctx: CTX }); } catch (e) { continue; }
    if (!o.ok) continue;
    wJ++;
    (o.tabs || []).forEach(function (t) {
      if (!(t.id in seedMode)) return;
      tJ++; var tw = G.singleRow(seedMode[t.id], null);
      if (tw === t.singleRow) tOk++; else bad.push(wins[i] + '/' + t.id + ' twin=' + tw + ' legacy=' + t.singleRow);
      if (t.singleRow) { nSingle++; firstSingle = firstSingle || t.id; } else { nGrid++; firstGrid = firstGrid || t.id; }
    });
  }
  log('§OME-A windows=' + wJ + ' tabs=' + tJ + ' equal=' + tOk + ' legacySingleRow=' + nSingle + ' legacyGrid=' + nGrid + (bad.length ? ' first-diffs=' + bad.slice(0, 5).join(' | ') : ''));
  ok('A', 'tab opening mode == the real GridTab.isSingleRow() (' + tJ + ' tabs of ' + wJ + ' windows)', tJ > 0 && tOk === tJ, bad.slice(0, 5).join(' | '));
  ok('A0', 'population covers BOTH modes (not vacuous)', nSingle > 0 && nGrid > 0, 'single=' + nSingle + ' grid=' + nGrid);
  // (B) the user's IsDisplayedGrid override (saveData stores no row for an empty Custom, so the row carries one field), one single-row tab and one grid tab, each Y / N / null
  var win = function (tab) { return db.exec("SELECT AD_Window_ID FROM AD_Tab WHERE AD_Tab_ID=" + tab)[0].values[0][0]; };
  var bJ = 0, bOk = 0, bBad = [];
  for (var pair of [[firstSingle, true], [firstGrid, false]]) {
    for (var m of ['Y', 'N', null]) {
      var o2 = await oracle({ op: 'tabmode', window: win(pair[0]), cust: { tab: pair[0], custom: String(db.exec("SELECT AD_Field_ID FROM AD_Field WHERE AD_Tab_ID=" + pair[0] + " AND IsActive='Y' ORDER BY SeqNo LIMIT 1")[0].values[0][0]), mode: m }, ctx: CTX });
      var leg = (o2.tabs || []).filter(function (t) { return t.id === pair[0]; })[0];
      var tw2 = G.singleRow(pair[1], m == null ? null : { isdisplayedgrid: m });
      bJ++; var same = leg && leg.singleRow === tw2; if (same) bOk++; else bBad.push(pair[0] + ' default=' + pair[1] + ' mode=' + m + ' twin=' + tw2 + ' legacy=' + (leg && leg.singleRow));
      log('§OME-B tab=' + pair[0] + ' tabDefaultSingle=' + pair[1] + ' IsDisplayedGrid=' + m + ' legacySingleRow=' + (leg && leg.singleRow) + ' twin=' + tw2);
    }
  }
  ok('B', 'IsDisplayedGrid override == the real class (' + bJ + ' cases)', bJ > 0 && bOk === bJ, bBad.join(' | '));
  log('§OME-SUMMARY ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { log('§OME-ERROR ' + e.stack); process.exit(2); });
