#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-DICT (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY step D0). READ THE LOG: §DD lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: the legacy Home dashboard + Performance Measurement dictionary (PA_DashboardContent/_Access/Preference, PA_Goal/GoalRestriction, PA_Measure/MeasureCalc, PA_ColorSchema,
//   PA_Ratio, AD_Note, AD_RecentItem) is in the SEED AS LOADED (ad_seed.db + patches/ad_seed.db.sql applied statement by statement, as idempiere.html does) cell for cell equal to the legacy pilot.
//   Denominator = 15 tables / every row of each (D0b added PrintColor, StatusLine, Chart, ChartDataSource). Expected BEFORE the patch: 3 of 11 tables carry all their rows (RED). INCONCLUSIVE when the legacy dump is missing.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var LEG = process.env.DD_LEGACY || '/home/red1/bim-compiler/scripts/bridge/out/dashboard_dict_legacy.json', log = console.log, fails = 0, judged = 0;
function norm(v) { if (v === null || v === undefined) return null; var s = String(v); return /^-?\d+(\.\d+)?$/.test(s) ? String(Number(s)) : s; }
(async function () {
  if (!fs.existsSync(LEG)) { log('§DD-VERDICT INCONCLUSIVE legacy dump missing: ' + LEG); process.exit(3); }
  var L = JSON.parse(fs.readFileSync(LEG, 'utf8')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var ok = 0, bad = 0;
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } });
  log('§DD seed-as-loaded: patch statements ok=' + ok + ' failed=' + bad);
  Object.keys(L).forEach(function (t) {
    var spec = L[t], seedCols = null, rows = [];
    try { var ti = db.exec("SELECT lower(name) FROM pragma_table_info('" + t + "')"); seedCols = ti.length ? ti[0].values.map(function (r) { return r[0]; }) : null; } catch (e) { seedCols = null; }
    judged++;
    if (!seedCols) { fails++; log('  §DD-TABLE ' + t + ' FAIL absent from the seed (legacy rows=' + spec.rows.length + ')'); return; }
    var colMiss = spec.cols.filter(function (c) { return seedCols.indexOf(c) < 0; });
    if (colMiss.length) { fails++; log('  §DD-TABLE ' + t + ' FAIL seed lacks columns ' + colMiss.join(',')); return; }
    var r = db.exec('SELECT ' + spec.cols.join(',') + ' FROM ' + t); if (r.length) rows = r[0].values;
    var key = function (arr) { return JSON.stringify(arr.map(norm)); };
    var want = spec.rows.map(function (o) { return key(spec.cols.map(function (c) { return o[c]; })); }).sort(), got = rows.map(key).sort();
    var missing = want.filter(function (w) { return got.indexOf(w) < 0; }), extra = got.filter(function (g) { return want.indexOf(g) < 0; });
    var good = !missing.length && !extra.length;
    if (!good) fails++;
    log('  §DD-TABLE ' + t + ' ' + (good ? 'OK' : 'FAIL') + ' legacyRows=' + want.length + ' seedRows=' + got.length + (good ? '' : ' missing=' + missing.length + ' extra=' + extra.length + (missing[0] ? ' e.g. ' + missing[0].slice(0, 110) : '')));
  });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DD-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§DD-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
