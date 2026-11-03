#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-ENGINE (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.14, R2/G1). READ THE LOG: verdict = §PA_ENGINE_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "a PA-defined tile gives a different number / colour on the SQLite twin than on legacy iDempiere" (CARDINAL RULE).
// Steps: M the SAME migration script legacy applied (capex/legacy/migration/iD13/postgresql/202611031900_CAPEX-R0.sql) is applied to the twin · V pure vectors from the Java rules (offline) ·
//   N negatives (broken SQL / empty population / unsupported type → INCONCLUSIVE, never PASS) · Q the registry hook reproduces legacy's no-compute-on-create + previous-target behaviours ·
//   A oracle legacy pilot (READ-ONLY: stock query_data; skipped as INCONCLUSIVE when the pilot is down or its goal is stale) · B oracle tiles.js on the same rows.
// Breaks (MUST FAIL): BREAK=1 (+1 cent on the engine's value before the oracle compares).
// Usage: NODE_PATH=<bim-ootb>/node_modules node erp/tests/witness_pa_engine.js [--offline]
'use strict';
var fs = require('fs'), path = require('path'), C = require('./dd_common.js');
var ROOT = path.join(__dirname, '..', '..'), MIG = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql/202611031900_CAPEX-R0.sql');
var PA = require('../pa_engine.js'), MA = require('../migration_apply.js'), BD = require('../bigdecimal.js');
var OFFLINE = process.argv.indexOf('--offline') >= 0, BREAK = process.env.BREAK === '1';
var judged = 0, fails = 0, inconc = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §PA_ENGINE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
function inc(n, why) { inconc++; log('  §PA_ENGINE ' + n + ' INCONCLUSIVE ' + why); }
var R0_MEASURE = 1000000, GOAL = 'CAPEX Approved Budget (USD)';

(async function () {
  var H = await C.boot(), NOW = H.TODAY + ' 12:00:00';
  var host = { q: H.q, run: function (s, p) { H.db.run(s, p || []); }, convertSql: H.A.convertSql, ctx: H.ctx, now: function () { return NOW; }, log: log };
  var E = PA.create(host);
  log('§PA_ENGINE_LOAD measures=' + H.one('SELECT COUNT(*) AS n FROM pa_measure').n + ' calcs=' + H.one('SELECT COUNT(*) AS n FROM pa_measurecalc').n + ' goals=' + H.one('SELECT COUNT(*) AS n FROM pa_goal').n +
    ' schemas=' + H.one('SELECT COUNT(*) AS n FROM pa_colorschema').n + ' printcolors=' + H.one('SELECT COUNT(*) AS n FROM ad_printcolor').n + ' refreshMs=' + E.sysInterval());

  // ── M: one artefact — the legacy migration script, applied as-is ──
  var m = MA.apply(fs.readFileSync(MIG, 'utf8'), { file: path.basename(MIG), run: function (s) { H.db.run(s); }, convertSql: H.A.convertSql, log: log,
    has: function (t) { return !!H.one("SELECT 1 AS x FROM sqlite_master WHERE lower(name)=?", [t]); } });
  var meas = H.one('SELECT * FROM pa_measure WHERE pa_measure_id=?', [R0_MEASURE]), calc = H.one('SELECT * FROM pa_measurecalc WHERE pa_measurecalc_id=?', [R0_MEASURE]);
  check('M1 the legacy migration script applies to the twin unchanged (0 failed statements)', m.failed === 0 && m.ok >= 2, m);
  check('M2 its rows are the same definition (measure C/S on calc ' + R0_MEASURE + ', AD_Table = C_Project)', !!meas && !!calc && meas.measuretype === 'C' && meas.measuredatatype === 'S' &&
    String(H.one('SELECT tablename AS t FROM ad_table WHERE ad_table_id=?', [calc && calc.ad_table_id]) && H.one('SELECT tablename AS t FROM ad_table WHERE ad_table_id=?', [calc.ad_table_id]).t) === 'C_Project',
    { measure: meas && meas.name, select: calc && calc.selectclause, where: calc && calc.whereclause });

  // ── V: vectors computed from the Java rules (MGoal :428-475, MColorSchema :231-262, MRole.addAccessSQL :2074) ──
  var V = [
    ['E6 target 0 → performance 0', PA.performance('123.45', '0').toString(), '0'],
    ['E6 6dp HALF_UP 1/3', PA.performance('1', '3').toString(), '0.333333'],
    ['E6 2/3 rounds up', PA.performance('2', '3').toString(), '0.666667'],
    ['E7 truncates 0.099999 → 9', PA.percent('0.099999'), 9],
    ['E7 toward zero -0.019999 → -1', PA.percent('-0.019999'), -1]
  ];
  var cs100 = H.one('SELECT * FROM pa_colorschema WHERE pa_colorschema_id=100');   // "Red (50) - Yellow (100) - Green": 50 / 100 / 9999 / 0 ; colours 200000 / 200001 / 200002 / 0
  if (cs100) [[50, 200000], [51, 200001], [100, 200001], [101, 200002], [9999, 200002], [10000, 200002], [-5, 200000]].forEach(function (p) { V.push(['E9 schema 100 percent ' + p[0], PA.schemaColorId(cs100, p[0]), p[1]]); });
  else inc('E9', 'schema 100 absent from the seed');
  V.push(['E9 colour id 0 falls back 3→2→1', PA.schemaColorId({ mark1percent: 50, mark2percent: 0, ad_printcolor1_id: 0, ad_printcolor2_id: 7, ad_printcolor3_id: 0 }, 10), 7]);
  V.push(['E8 target 0 → white', E.colorFor({ measuretarget: 0, pa_colorschema_id: 100, goalperformance: 2 }).hex, '#ffffff']);
  V.push(['E8 perf 0.5 on schema 100 → colour 1 (Red)', E.colorFor({ measuretarget: 10, pa_colorschema_id: 100, goalperformance: 0.5 }).id, 200000]);
  V.push(['E2 main table synonym', PA.mainTable("SELECT SUM(GrandTotal) FROM RV_C_Invoice C_Invoice WHERE IsSOTrx='Y'"), 'C_Invoice']);
  V.push(['E2 main table, sub-select ignored', PA.mainTable('SELECT (SELECT 1 FROM AD_Org o) FROM C_Project WHERE 1=1'), 'C_Project']);
  V.forEach(function (v) { check('V ' + v[0], String(v[1]) === String(v[2]), 'got=' + v[1] + ' want=' + v[2]); });
  var role102 = H.one('SELECT * FROM ad_role WHERE ad_role_id=102');
  var acc = E.addAccessSQL('SELECT SUM(PlannedAmt) FROM C_Project WHERE C_Currency_ID=100', role102);
  check('V E2 access predicate on the main table (role 102, isaccessallorgs=' + role102.isaccessallorgs + ')', /WHERE C_Currency_ID=100 AND C_Project\.AD_Client_ID(=| IN \()/.test(acc) && (role102.isaccessallorgs === 'Y' || /C_Project\.AD_Org_ID/.test(acc)), acc);

  // ── N: negatives — a 0 that is not a measurement must not read as one ──
  H.begin('neg');
  H.db.run("INSERT INTO pa_measurecalc (pa_measurecalc_id,ad_client_id,ad_org_id,isactive,name,selectclause,whereclause,ad_table_id) VALUES (9100001,11,0,'Y','neg broken','SELECT SUM(NoSuchColumn) FROM C_Project','WHERE 1=1',(SELECT ad_table_id FROM ad_table WHERE tablename='C_Project'))");
  H.db.run("INSERT INTO pa_measurecalc (pa_measurecalc_id,ad_client_id,ad_org_id,isactive,name,selectclause,whereclause,ad_table_id) VALUES (9100002,11,0,'Y','neg empty','SELECT SUM(PlannedAmt) FROM C_Project','WHERE 1=2',(SELECT ad_table_id FROM ad_table WHERE tablename='C_Project'))");
  var g0 = { pa_goal_id: 0, measurescope: '0', ad_role_id: 102 };
  var nb = E.calcMeasure({ pa_measure_id: -1, name: 'neg broken', measuretype: 'C', measuredatatype: 'S', pa_measurecalc_id: 9100001 }, g0);
  var ne = E.calcMeasure({ pa_measure_id: -2, name: 'neg empty', measuretype: 'C', measuredatatype: 'S', pa_measurecalc_id: 9100002 }, g0);
  var nt = E.calcMeasure({ pa_measure_id: -3, name: 'neg type', measuretype: 'Q', measuredatatype: 'S' }, g0);
  H.rollback('neg');
  check('N1 broken SQL → 0 (legacy) AND state ERROR', nb.actual && nb.actual.isZero() && nb.state === 'ERROR', nb.state + ' ' + nb.err);
  check('N2 empty population → 0 (legacy) AND state EMPTY', ne.actual && ne.actual.isZero() && ne.state === 'EMPTY', ne.state);
  check('N3 unsupported measure type → INCONCLUSIVE (no number)', nt.actual == null && nt.state === 'INCONCLUSIVE', nt.why);

  // ── Q: E10/E11 — the model class in the registry; legacy's two transaction behaviours fall out of reading committed rows ──
  PA.install(H.ML, function (trx) { return Object.assign({}, host, { q: trx.q }); });
  var gid;
  var r1 = H.save('pa_goal', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: 'W-PA-ENGINE goal', pa_measure_id: R0_MEASURE, pa_colorschema_id: 100, measuretarget: 0, measurescope: '0', measuredisplay: '0', ad_role_id: 102, seqno: 0, issummary: 'N', relativeweight: 1 });
  (r1.log || []).forEach(function (l) { if (/§PA_/.test(l)) log('    ' + l); });
  gid = H.lastId('pa_goal');   // H.save commits through ML.run (no H.apply: that would insert a 2nd copy)
  var a1 = H.one('SELECT * FROM pa_goal WHERE pa_goal_id=?', [gid]);
  var nG = Number(H.one('SELECT COUNT(*) AS n FROM pa_goal WHERE pa_measure_id=?', [R0_MEASURE]).n);
  check('Q0 exactly one goal on the measure (fixture not duplicated)', nG === 1, { goals: nG });
  check('Q1 a NEW goal is not computed by its own create (legacy §5.4 a)', r1.ok !== false && a1 && Number(a1.measureactual || 0) === 0, { ok: r1.ok, measureactual: a1 && a1.measureactual, error: r1.error });
  var r2 = H.update('pa_goal', gid, { measuretarget: 1 });
  var a2 = H.one('SELECT * FROM pa_goal WHERE pa_goal_id=?', [gid]);
  var direct = H.one(H.A.convertSql(E.sqlPI(calc, '0', 'S', null, role102)));
  var directV = direct ? PA.bd(direct[Object.keys(direct)[0]]) : null;
  check('Q2 a target change computes it (MGoal.afterSave) and the actual = the measure SQL', a2 && directV && PA.bd(a2.measureactual).eq(directV), { measureactual: a2 && a2.measureactual, sql: directV && directV.toString() });
  check('Q3 performance scored against the PREVIOUS committed target (0 → performance 0, legacy §5.4 b)', a2 && Number(a2.goalperformance) === 0 && Number(a2.measuretarget) === 1, { target: a2 && a2.measuretarget, perf: a2 && a2.goalperformance });
  var r3 = E.updateGoal(gid, { force: false });
  check('Q4 renderer path (force=false) recomputes only when due (DateLastRun ' + (a2 && a2.datelastrun) + ' vs interval)', r3.updated === false && r3.why === 'not due', r3.why);
  H.ML.unregisterModel('pa_goal', 'core');

  // ── A + B: oracles on the SAME project rows ──
  var A = null, B = null;
  if (OFFLINE) { inc('A', '--offline (pilot not read)'); inc('B', '--offline'); }
  else {
    var Ad = require(path.join(ROOT, 'capex/adapters.js')), Tl = require(path.join(ROOT, 'capex/tiles.js')), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js'));
    var base = process.env.BRIDGE_BASE || 'http://localhost:8088';
    var L = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
    var login = { user: L.user, pass: L.pass, lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
    var data = null, lg = null;
    try { data = await Ad.loadLegacy({ base: base, login: L }); lg = (await Push.queryRows(base, login, 'QueryPAGoal', 'PA_Goal', [{ column: 'Name', val: GOAL }]))[0]; }
    catch (e) { inc('A', 'pilot not readable: ' + String(e && e.message || e)); }
    if (data && !lg) inc('A', 'pilot has no goal "' + GOAL + '" (run capex/tools/pa_probe.js)');
    if (data) {
      var pr = data.projects.map(function (p) { var o = {}; Object.keys(p).forEach(function (k) { o[k.toLowerCase()] = p[k]; }); return o; });
      var lastUpd = pr.filter(function (p) { return Number(p.c_currency_id) === 100; }).map(function (p) { return String(p.updated || ''); }).sort().pop();
      H.db.run('DELETE FROM c_project');
      pr.forEach(function (p) { H.db.run('INSERT INTO c_project (c_project_id,ad_client_id,ad_org_id,isactive,value,name,c_currency_id,plannedamt,processed) VALUES (?,?,?,?,?,?,?,?,?)', [Number(p.c_project_id), 11, Number(p.ad_org_id), p.isactive || 'Y', p.value, p.name, Number(p.c_currency_id), p.plannedamt == null ? null : String(p.plannedamt), p.processed || 'N']); });
      var goal = { pa_goal_id: 0, measurescope: '0', ad_role_id: 102 }, c = E.calcMeasure(meas, goal), eng = c.actual && (BREAK ? c.actual.add(BD.fromString('0.01')) : c.actual);
      log('§PA_ENGINE_TWIN rows=' + pr.length + ' usd=' + pr.filter(function (p) { return Number(p.c_currency_id) === 100; }).length + ' engine=' + (eng && eng.toString()) + ' state=' + c.state + (BREAK ? ' (BREAK=+0.01)' : ''));
      if (lg) {
        var stale = lg.DateLastRun && lastUpd && String(lastUpd) > String(lg.DateLastRun);
        if (stale) inc('A', 'legacy goal computed ' + lg.DateLastRun + ' before the last USD project change ' + lastUpd + ' — run capex/tools/pa_probe.js, then re-run');
        else {
          var lv = PA.bd(lg.MeasureActual), sc = (String(lg.MeasureActual).split('.')[1] || '').length;
          A = eng && lv && eng.setScale(sc, BD.RoundingMode.HALF_UP).eq(lv);
          check('A legacy PA_Goal.MeasureActual == engine, at legacy\'s own scale (' + sc + ' dp)', !!A, 'legacy=' + lg.MeasureActual + ' engine=' + (eng && eng.toString()) + ' legacyDateLastRun=' + lg.DateLastRun);
        }
      }
      var cents = Tl.compute(data, {}).tiles.approved_budget.cur['100'];
      if (cents == null) inc('B', 'no USD project in the legacy rows');
      else { B = eng && Number(eng.setScale(2, BD.RoundingMode.HALF_UP).multiply(BD.of(100)).setScale(0, BD.RoundingMode.DOWN).toString()) === cents; check('B tiles.js approved_budget USD == engine rounded once to the cent (§5.9)', !!B, 'tile=' + (cents / 100).toFixed(2) + ' engine=' + (eng && eng.toString())); }
    }
  }

  var conv = H.q('SELECT pa_measurecalc_id AS id, name, selectclause AS s, whereclause AS w FROM pa_measurecalc WHERE pa_measurecalc_id < 9000000'), cx = 0;
  conv.forEach(function (mc) { try { H.q(H.A.convertSql(E.addAccessSQL(mc.s + ' ' + mc.w, role102))); cx++; } catch (e) { log('  §PA_ENGINE_CONVERT_FAIL calc=' + mc.id + ' ' + JSON.stringify(mc.name) + ' err=' + JSON.stringify(String(e && e.message || e) || '(sql.js gave no message)')); } });
  log('§PA_ENGINE_X_OF_N convertible=' + cx + ' of ' + conv.length + ' PA_MeasureCalc rows run on the twin after convertSql + access');

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§PA_ENGINE_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (BREAK=1: FAIL expected)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { log('§PA_ENGINE_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
