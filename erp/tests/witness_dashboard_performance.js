#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-PERF (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D2b). READ THE LOG: §DP lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: the legacy Performance gadget (DPPerformance -> WPAPanel.loadGoal -> MGoal.getUserGoals; WPerformanceIndicator.init title/tooltip; MGoal.getPercent/getColor ->
//   MColorSchema.getColor -> MPrintColor.getColor) shows, for GardenWorld Admin, FOUR indicators with a title "<Name>: <percent>%" (or "<Name>: <actual>" when the goal has no target), a tooltip
//   "<Description>: <actual> of <target>" and a colour picked by the goal's colour schema marks (percent beyond the last mark falls back to colour 3). The twin's gadget model must produce the same
//   texts, order and colours from the dictionary (+ goal engine). Oracle = scripts/bridge/goal_oracle_legacy.js `gadget`. Neg-controls: no-target goal shows the actual instead of a percent; a goal for another
//   user/role is excluded; a different colour schema flips the colour.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), DG = null, GE = require(path.join(ERP, 'overlay', 'goal_engine.js'));
try { DG = require(path.join(ERP, 'overlay', 'dashboard_gadgets.js')); } catch (e) { DG = null; }
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var ORA = process.env.GE_ORACLE || '/home/red1/bim-compiler/scripts/bridge/out/goal_oracle_legacy.json', log = console.log, fails = 0, judged = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; log('  §DP-CHECK ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  if (!fs.existsSync(ORA)) { log('§DP-VERDICT INCONCLUSIVE oracle missing'); process.exit(3); }
  if (!DG) { check('DP0 dashboard_gadgets.js exists', false, 'missing'); log('§DP-VERDICT FAIL judged=' + judged + ' failed=' + fails); process.exit(1); }
  var O = JSON.parse(fs.readFileSync(ORA, 'utf8')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  fs.readFileSync(path.join(ERP, 'patches', 'ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { seed.run(st); } catch (e) {} });
  var db = new SQL.Database();
  ['pa_goal', 'pa_measure', 'pa_measurecalc', 'r_requesttype', 'pa_colorschema', 'ad_printcolor', 'ad_user_roles'].forEach(function (t) {
    var r = seed.exec('SELECT * FROM ' + t)[0]; if (!r) return; db.run('CREATE TABLE ' + t + ' (' + r.columns.join(',') + ')');
    var ins = db.prepare('INSERT INTO ' + t + ' VALUES (' + r.columns.map(function () { return '?'; }).join(',') + ')'); r.values.forEach(function (v) { ins.run(v); }); ins.free();
  });
  Object.keys(O.tables).forEach(function (t) {
    var spec = O.tables[t]; db.run('CREATE TABLE ' + t + ' (' + spec.cols.join(',') + ')');
    var ins = db.prepare('INSERT INTO ' + t + ' VALUES (' + spec.cols.map(function () { return '?'; }).join(',') + ')');
    spec.rows.forEach(function (r) { ins.run(spec.cols.map(function (c) { var v = r[c]; return v !== null && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; })); }); ins.free();
  });
  GE.install(db);
  var q = function (sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; };
  var session = { client: 11, user: 101, role: 102, today: O.today, access: { clientIds: [0, 11], orgIds: O.orgs } };
  var got = DG.performance(q, session, GE), want = O.gadget;
  log('§DP gadgets=' + got.length + ' want=' + want.length);
  var bad = [];
  want.forEach(function (w, i) { var g = got[i] || {}; if (g.id !== w.id || g.title !== w.title || g.tooltip !== w.tooltip || g.color !== w.color || g.percent !== w.percent) bad.push({ want: w, got: { id: g.id, title: g.title, tooltip: g.tooltip, color: g.color, percent: g.percent } }); });
  check('DP1 4 indicators, same order, title, tooltip, percent and colour as the legacy gadget', got.length === want.length && bad.length === 0, bad.slice(0, 2));
  var colors = {}; got.forEach(function (g) { colors[g.color] = 1; });
  check('DP2 discriminating: at least 2 distinct colours (green and the beyond-last-mark fallback)', Object.keys(colors).length >= 2, colors);
  db.run('UPDATE pa_goal SET measuretarget=0 WHERE pa_goal_id=101'); var nt = DG.performance(q, session, GE)[0];
  check('DP3 NEG: a goal without a target shows "<Name>: <actual>" (no percent) and no " of " tooltip', nt && nt.title === 'Invoice Revenue: 816,758' && !/ of /.test(nt.tooltip), nt && nt.title + ' | ' + nt.tooltip);
  db.run('UPDATE pa_goal SET measuretarget=100000 WHERE pa_goal_id=101');
  db.run('UPDATE pa_goal SET ad_role_id=999999 WHERE pa_goal_id=104'); var ex = DG.performance(q, session, GE);
  check('DP4 NEG: a goal bound to a role (999999) that user 101 does not hold is excluded (MGoal.getUserGoals)', ex.length === want.length - 1 && ex.every(function (g) { return g.id !== 104; }), ex.map(function (g) { return g.id; }));
  db.run('UPDATE pa_goal SET ad_role_id=NULL WHERE pa_goal_id=104'); db.run('UPDATE pa_goal SET pa_colorschema_id=101 WHERE pa_goal_id=101');
  var fl = DG.performance(q, session, GE)[0]; check('DP5 NEG: switching the goal to the reversed colour schema (101) flips its colour', fl && fl.color !== want[0].color, fl && fl.color);
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DP-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§DP-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
