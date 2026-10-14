#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-FN-PARITY (bim-compiler prompts/ERP_DEPTH_FILM.md §FN-CENSUS stage 2/3; CARDINAL RULE: the twin's stored-function ports return what legacy returns).
//   READ THE LOG after every run: every verdict is a §FN_PARITY line; the exit code is not the evidence.
// THE ISSUE it proves/disproves: erp/callouts/sqlfn.js's UDFs == the pilot's PL/pgSQL functions, for the SAME input rows. Input: scripts/bridge/fn_parity_legacy.js -> out/fn_parity_legacy.json
//   (pilot results + the exact rows each function read). The twin replays those rows in a scratch SQLite and calls the REGISTERED UDF through SQL (the path the app uses).
//   INCONCLUSIVE per function when every pilot result was NULL/0 (branch never exercised) or the legacy file is missing. Never PASS on an unjudged function.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var LEG = process.env.FN_PARITY_JSON || path.join(process.env.HOME, 'bim-compiler/scripts/bridge/out/fn_parity_legacy.json');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var log = function (s) { console.log(s); };
(async function main() {
  if (!fs.existsSync(LEG)) { log('§FN_PARITY verdict=INCONCLUSIVE reason="legacy file missing: ' + LEG + '"'); process.exit(0); }
  var L = JSON.parse(fs.readFileSync(LEG, 'utf8')), SQL = await initSqlJs();
  var norm = function (v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) ? v.replace('T', ' ').replace(/(\.\d+)?([+-]\d\d(:\d\d)?|Z)?$/, '') : (v && typeof v === 'object' ? JSON.stringify(v) : v); };
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  var lit = function (v, t) { return v === null ? 'NULL' : t === 's' ? "'" + String(v).replace(/'/g, "''") + "'" : t === 't' ? "'" + v + "'" : String(v); };
  var num = function (x) { return x != null && x !== '' && !isNaN(Number(x)); };
  var byFn = {}, bad = [], total = 0;
  L.scenarios.forEach(function (sc) {
    var db = new SQL.Database(), tn = 0, made = {};                                   // a FRESH scratch twin per scenario: the rows the pilot function read
    Object.keys(sc.tables).sort(function (a, b) { return (b[0] === '_') - (a[0] === '_'); }).forEach(function (t) {
      var rows = sc.tables[t], name = t.replace(/^__/, ''); if (made[name.toLowerCase()]) return; made[name.toLowerCase()] = 1;
      if (!rows.length) { db.run('CREATE TABLE "' + name + '" ("_empty")'); return; }
      var cols = Object.keys(rows[0]); db.run('CREATE TABLE "' + name + '" (' + cols.map(function (c) { return '"' + c + '"'; }).join(',') + ')');
      var st = db.prepare('INSERT INTO "' + name + '" VALUES (' + cols.map(function () { return '?'; }).join(',') + ')');
      rows.forEach(function (r) { st.run(cols.map(function (c) { var v = norm(r[c]); return v === undefined ? null : v; })); }); st.free(); tn++;
    });
    A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
    A.bind(function (sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }, {});
    log('§FN_PARITY-SEED scenario=' + sc.name + ' legacy=' + path.basename(LEG) + ' date=' + L.date + ' scratchTables=' + tn + ' cases=' + sc.cases.length);
    sc.cases.forEach(function (c) {
      total++;
      var twin, terr = null;
      try { var r = db.exec(c.fn === '@sql' ? A.convertSql(c.sql) : 'SELECT ' + c.fn + '(' + c.args.map(function (a, i) { return lit(a, c.types[i]); }).join(',') + ')'); twin = r[0] ? r[0].values[0][0] : null; } catch (e) { terr = String(e.message || e); }
      var want = c.err ? { err: c.err } : { v: c.pilotNull ? null : c.pilot }, ok, why = '';
      if (c.clock && want.v != null && twin != null) { want.v = String(want.v).slice(0, 10); twin = String(twin).slice(0, 10); }   // both sides read their own clock: compare the DATE
      if (want.v != null && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d([+-]\d\d(:\d\d)?)?$/.test(want.v)) want.v = want.v.replace(/([+-]\d\d(:\d\d)?)$/, '');   // timestamptz text from psql (session TZ = UTC): compare the wall clock
      if (want.err) { ok = terr != null; why = ok ? '' : 'legacy raised "' + want.err + '" but the twin returned ' + JSON.stringify(twin); }
      else if (terr) { ok = false; why = 'twin raised "' + terr + '" but legacy returned ' + JSON.stringify(want.v); }
      else if (want.v != null && /^\d{4}-\d\d-\d\d$/.test(want.v) && twin != null && /^\d{4}-\d\d-\d\d 00:00:00$/.test(String(twin))) { ok = String(twin).slice(0, 10) === want.v; why = ok ? '' : 'legacy(date)=' + want.v + ' twin=' + twin; }   // a DATE result: the twin stores dates as "YYYY-MM-DD 00:00:00" (ad_seed convention)
      else if (want.v === null || twin === null) { ok = want.v === null && twin === null; why = ok ? '' : 'legacy=' + JSON.stringify(want.v) + ' twin=' + JSON.stringify(twin); }
      else if (['t', 'f', 'true', 'false'].indexOf(want.v) >= 0) { ok = (want.v === 't' || want.v === 'true') === (Number(twin) === 1 || twin === true); why = ok ? '' : 'legacy=' + want.v + ' twin=' + twin; }
      else if (num(want.v) && num(twin)) { ok = Math.abs(Number(want.v) - Number(twin)) < 1e-9; why = ok ? '' : 'legacy=' + want.v + ' twin=' + twin; }
      else { ok = String(want.v) === String(twin); why = ok ? '' : 'legacy=' + JSON.stringify(want.v) + ' twin=' + JSON.stringify(twin); }
      var b = byFn[c.fn === '@sql' ? 'sql-converter' : c.fn] = byFn[c.fn === '@sql' ? 'sql-converter' : c.fn] || { n: 0, fail: 0, informative: 0 }; b.n++;
      if (!ok) { b.fail++; bad.push(c.fn + ' [' + sc.name + '] ' + c.label + ': ' + why); }
      var informative = want.err ? true : want.v !== null && !(num(want.v) && Number(want.v) === 0) && want.v !== 'f' && want.v !== 'false' && want.v !== ''; if (informative) b.informative++;
    });
  });
  log('§FN_PARITY-TOTAL scenarios=' + L.scenarios.length + ' cases=' + total);
  var worst = 0;
  Object.keys(byFn).forEach(function (f) {
    var b = byFn[f], v = b.fail ? 'FAIL' : b.informative === 0 ? 'INCONCLUSIVE' : 'PASS';
    log('§FN_PARITY fn=' + f + ' verdict=' + v + ' cases=' + b.n + ' failed=' + b.fail + ' nonTrivialLegacyResults=' + b.informative + (v === 'INCONCLUSIVE' ? ' (every legacy result NULL/0/false - the real branch was never exercised)' : ''));
    if (v === 'FAIL') worst = 1;
  });
  bad.slice(0, 40).forEach(function (s) { log('  §FN_PARITY-DIFF ' + s); });
  log('§FN_PARITY summary functions=' + Object.keys(byFn).length + ' PASS=' + Object.keys(byFn).filter(function (f) { return !byFn[f].fail && byFn[f].informative; }).length + ' FAIL=' + Object.keys(byFn).filter(function (f) { return byFn[f].fail; }).length + ' INCONCLUSIVE=' + Object.keys(byFn).filter(function (f) { return !byFn[f].fail && !byFn[f].informative; }).length);
  process.exit(worst);
})().catch(function (e) { console.log('§FN_PARITY ERROR ' + (e.stack || e)); process.exit(2); });
