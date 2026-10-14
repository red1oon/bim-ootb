#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-GOAL-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D1). READ THE LOG: §GE lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: the four PA_Goal actuals the legacy Performance gadget shows (MGoal.updateGoal -> MMeasure.updateCalculatedGoals / updateRequests -> MMeasureCalc.getSqlPI / MRequestType.getSqlPI + role
//   client/org access SQL) are reproduced by the twin's goal engine, which BUILDS THE SQL FROM THE DICTIONARY ROWS (PA_Goal, PA_Measure, PA_MeasureCalc, R_RequestType) - no per-goal code. Oracle = scripts/bridge/goal_oracle_legacy.js
//   (the same SQL run on the legacy pilot, GardenWorld Admin role 102) over the pilot's own rows loaded into a scratch db. Also: scope Total vs the goal's scope differ on this data (discriminating), performance = actual/target
//   at scale 6 HALF_UP, percent = int(perf x 100), an org-restricted role changes the answer, and an unknown measure type is INCONCLUSIVE not 0.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), GE = null;
try { GE = require(path.join(ERP, 'overlay', 'goal_engine.js')); } catch (e) { GE = null; }
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var ORA = process.env.GE_ORACLE || '/home/red1/bim-compiler/scripts/bridge/out/goal_oracle_legacy.json', log = console.log, fails = 0, judged = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; log('  §GE-CHECK ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  if (!fs.existsSync(ORA)) { log('§GE-VERDICT INCONCLUSIVE oracle missing: ' + ORA); process.exit(3); }
  if (!GE) { check('GE0 goal_engine.js exists', false, 'missing'); log('§GE-VERDICT FAIL judged=' + judged + ' failed=' + fails); process.exit(1); }
  var O = JSON.parse(fs.readFileSync(ORA, 'utf8')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  // dictionary = the seed AS LOADED (patch applied with the loader's split); data = the pilot's rows
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { seed.run(st); } catch (e) {} });
  var db = new SQL.Database();
  ['pa_goal', 'pa_measure', 'pa_measurecalc', 'r_requesttype'].forEach(function (t) {
    var r = seed.exec('SELECT * FROM ' + t)[0]; db.run('CREATE TABLE ' + t + ' (' + r.columns.join(',') + ')');
    var ins = db.prepare('INSERT INTO ' + t + ' VALUES (' + r.columns.map(function () { return '?'; }).join(',') + ')'); r.values.forEach(function (v) { ins.run(v); }); ins.free();
  });
  Object.keys(O.tables).forEach(function (t) {
    var spec = O.tables[t]; db.run('CREATE TABLE ' + t + ' (' + spec.cols.join(',') + ')');
    var ins = db.prepare('INSERT INTO ' + t + ' VALUES (' + spec.cols.map(function () { return '?'; }).join(',') + ')');
    spec.rows.forEach(function (r) { ins.run(spec.cols.map(function (c) { var v = r[c]; return v !== null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; })); }); ins.free();
  });
  GE.install(db);
  var q = function (sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; };
  var ctx = { today: O.today, access: { clientIds: [0, O.client], orgIds: O.orgs } };
  var ids = Object.keys(O.goals), eq = [], bad = [];
  ids.forEach(function (g) { var r = GE.evaluate(q, Number(g), ctx), want = O.goals[g].actual; (r.ok && Math.abs(r.actual - want) < 0.005 ? eq : bad).push(g + ':' + (r.ok ? r.actual : r.reason) + '!=' + want); });
  log('§GE population goals=' + ids.length + ' equal=' + eq.length);
  check('GE1 all 4 PA_Goal actuals == the legacy pilot (revenue Year, open invoices, requests Quarter, open requests)', bad.length === 0 && eq.length === 4, bad);
  // discriminating: forcing the Total scope must give the legacy no-date-restriction answer and DIFFER from the Year/Quarter one
  var tot = [101, 104].map(function (g) { var r = GE.evaluate(q, g, ctx, { scope: '0' }); return r.ok && Math.abs(r.actual - O.goals[g].totalActual) < 0.005; });
  check('GE2 Total scope drops the date restriction (101: ' + O.goals[101].totalActual + ', 104: ' + O.goals[104].totalActual + ') and differs from the goal scope', tot[0] && tot[1] && O.goals[101].totalActual !== O.goals[101].actual && O.goals[104].totalActual !== O.goals[104].actual, tot);
  // performance
  var p101 = GE.evaluate(q, 101, ctx), want = Math.round(O.goals[101].actual / O.goals[101].target * 1e6) / 1e6;
  check('GE3 performance = actual/target at scale 6 HALF_UP, percent = int(perf x 100) (101: ' + want + ')', p101.ok && p101.performance === want.toFixed(6) && p101.percent === Math.trunc(want * 100), { got: p101.performance, pct: p101.percent });
  // role org restriction (MRole.getOrgWhere): a role that sees only org 12 gets a smaller revenue than all orgs
  var one = GE.evaluate(q, 101, { today: O.today, access: { clientIds: [0, O.client], orgIds: [0, 12] } }), many = GE.evaluate(q, 101, ctx);
  check('GE4 org-restricted role changes the answer (org 0,12 only < all orgs)', one.ok && many.ok && one.actual < many.actual, { one: one.actual, many: many.actual });
  // unknown measure type -> INCONCLUSIVE (never 0)
  db.run("UPDATE pa_measure SET measuretype='X' WHERE pa_measure_id=101"); var un = GE.evaluate(q, 101, ctx);
  check('GE5 unknown MeasureType is not ok and carries a reason (INCONCLUSIVE, not 0)', !un.ok && /measure ?type/i.test(un.reason || ''), un);
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§GE-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§GE-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
