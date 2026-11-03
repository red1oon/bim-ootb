#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-ENGINE (spec bim-ootb prompts/CAPEX_DASHBOARD.md §5.14 / §5.18). READ THE LOG: verdict = §PA_ENGINE_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "a PA-defined tile gives a different number / colour on the SQLite twin than on legacy iDempiere" (CARDINAL RULE) — judged on the ONE PA owner of the twin,
//   erp/overlay/goal_engine.js (evaluate + the storing path §5.18) and erp/overlay/dashboard_gadgets.js colorOf. (The §5.15 second engine erp/pa_engine.js was deleted, §5.18.)
// Steps: M the SAME migration script legacy applied is applied to the twin · V vectors from the Java rules · N negatives · Q the PA_Goal model class reproduces legacy's no-compute-on-create +
//   previous-target behaviours · A oracle legacy pilot (READ-ONLY stock query_data; INCONCLUSIVE when down / stale) · B oracle tiles.js on the same rows.
// Breaks (MUST FAIL): BREAK=1 (+1 cent on the twin's value before the oracles compare).
// Usage: node erp/tests/witness_pa_engine.js [--offline]   (NODE_PATH=<bim-ootb>/node_modules for the pilot part: fetch + the capex adapters)
'use strict';
var fs = require('fs'), path = require('path'), C = require('./dd_common.js');
var ROOT = path.join(__dirname, '..', '..'), MIG = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql/202611031900_CAPEX-R0.sql');
var GE = require('../overlay/goal_engine.js'), DG = require('../overlay/dashboard_gadgets.js'), MA = require('../../capex/tools/migration_apply.js'), BD = require('../bigdecimal.js');
var OFFLINE = process.argv.indexOf('--offline') >= 0, BREAK = process.env.BREAK === '1';
var judged = 0, fails = 0, inconc = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §PA_ENGINE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
function inc(n, why) { inconc++; log('  §PA_ENGINE ' + n + ' INCONCLUSIVE ' + why); }
function bd(v) { if (v == null) return null; var s = String(v); if (/e/i.test(s)) s = Number(v).toFixed(12); return BD.fromString(s); }
var R0_MEASURE = 1000000, GOAL = 'CAPEX Approved Budget (USD)';

(async function () {
  var H = await C.boot(), NOW = H.TODAY + ' 12:00:00', CTX = { client: 11, role: 102, today: H.TODAY, now: NOW };
  GE.install(H.db);   // the Postgres-isms (trunc, invoiceopen, currencybase, the invoice views) the dictionary SQL needs
  var ACC = GE.accessOf(H.q, 102, 11);
  log('§PA_ENGINE_LOAD measures=' + H.one('SELECT COUNT(*) AS n FROM pa_measure').n + ' calcs=' + H.one('SELECT COUNT(*) AS n FROM pa_measurecalc').n + ' goals=' + H.one('SELECT COUNT(*) AS n FROM pa_goal').n +
    ' schemas=' + H.one('SELECT COUNT(*) AS n FROM pa_colorschema').n + ' printcolors=' + H.one('SELECT COUNT(*) AS n FROM ad_printcolor').n + ' access=' + JSON.stringify(ACC));

  // ── M: one artefact — the legacy migration script, applied as-is ──
  var m = MA.apply(fs.readFileSync(MIG, 'utf8'), { file: path.basename(MIG), run: function (s) { H.db.run(s); }, convertSql: H.A.convertSql, log: log,
    has: function (t) { return !!H.one("SELECT 1 AS x FROM sqlite_master WHERE lower(name)=?", [t]); } });
  var meas = H.one('SELECT * FROM pa_measure WHERE pa_measure_id=?', [R0_MEASURE]), calc = H.one('SELECT * FROM pa_measurecalc WHERE pa_measurecalc_id=?', [R0_MEASURE]);
  var tbl = calc && H.one('SELECT tablename AS t FROM ad_table WHERE ad_table_id=?', [calc.ad_table_id]);
  check('M1 the legacy migration script applies to the twin unchanged (0 failed statements)', m.failed === 0 && m.ok >= 2, m);
  check('M2 its rows are the same definition (measure C/S on calc ' + R0_MEASURE + ', AD_Table = C_Project)', !!meas && !!calc && meas.measuretype === 'C' && meas.measuredatatype === 'S' && tbl && tbl.t === 'C_Project',
    { measure: meas && meas.name, select: calc && calc.selectclause, where: calc && calc.whereclause });

  // ── V: vectors from the Java rules (MGoal.setGoalPerformance :428-441, MColorSchema.getColor :231-262, MRole client/org where) ──
  [['E6 target 0 → performance 0', GE._div6('123.45', '0'), '0.000000'], ['E6 6dp HALF_UP 1/3', GE._div6(1, 3), '0.333333'], ['E6 2/3 rounds up', GE._div6(2, 3), '0.666667']]
    .forEach(function (v) { check('V ' + v[0], String(v[1]) === String(v[2]), 'got=' + v[1] + ' want=' + v[2]); });
  var hex = function (id) { var r = H.one('SELECT code FROM ad_printcolor WHERE ad_printcolor_id=?', [id]); return r ? '#' + ('000000' + ((Number(r.code) & 0xFFFFFF) >>> 0).toString(16)).slice(-6) : null; };
  if (H.one('SELECT 1 AS x FROM pa_colorschema WHERE pa_colorschema_id=100')) [[50, 200000], [51, 200001], [100, 200001], [101, 200002], [9999, 200002], [10000, 200002], [-5, 200000]]   // "Red (50) - Yellow (100) - Green"
    .forEach(function (p) { var got = DG.colorOf(H.q, 100, p[0]); check('V E9 schema 100 percent ' + p[0] + ' → colour ' + p[1], got === hex(p[1]), 'got=' + got + ' want=' + hex(p[1])); });
  else inc('E9', 'schema 100 absent from the seed');
  check('V E2 access of role 102 (isaccessallorgs=N) = client 0+11 and its org-access rows', JSON.stringify(ACC.clientIds) === '[0,11]' && Array.isArray(ACC.orgIds) && ACC.orgIds.indexOf(0) === 0 && ACC.orgIds.indexOf(11) > 0, ACC);

  // ── N: negatives ──
  H.begin('neg');
  H.db.run("INSERT INTO pa_measurecalc (pa_measurecalc_id,ad_client_id,ad_org_id,isactive,name,selectclause,whereclause,ad_table_id) VALUES (9100001,11,0,'Y','neg broken','SELECT SUM(NoSuchColumn) FROM C_Project','WHERE 1=1',(SELECT ad_table_id FROM ad_table WHERE tablename='C_Project'))");
  H.db.run("INSERT INTO pa_measure (pa_measure_id,ad_client_id,ad_org_id,isactive,name,measuretype,measuredatatype,pa_measurecalc_id) VALUES (9100001,11,0,'Y','neg broken','C','S',9100001),(9100003,11,0,'Y','neg ratio','R','S',NULL)");
  H.db.run("INSERT INTO pa_goal (pa_goal_id,ad_client_id,ad_org_id,isactive,name,pa_measure_id,measuretarget,measurescope,seqno,ad_role_id) VALUES (9100001,11,0,'Y','neg broken',9100001,0,'0',0,102),(9100003,11,0,'Y','neg ratio',9100003,0,'0',0,102)");
  var nb = GE.evaluate(H.q, 9100001, { today: H.TODAY, access: ACC }), nbs = GE.updateGoal(H.q, function (s, p) { H.db.run(s, p || []); }, 9100001, CTX, { force: true });
  var nbRow = H.one('SELECT measureactual AS a FROM pa_goal WHERE pa_goal_id=9100001'), nt = GE.evaluate(H.q, 9100003, { today: H.TODAY, access: ACC });
  H.rollback('neg');
  check('N1 broken SQL → no number from evaluate (reason kept) AND legacy\'s 0 stored', !nb.ok && /^SQL failed/.test(nb.reason) && nbs.updated && Number(nbRow.a) === 0, { reason: nb.reason, stored: nbRow && nbRow.a });
  check('N3 unsupported measure type (Ratio) → no number, INCONCLUSIVE reason', !nt.ok && /not ported/.test(nt.reason), nt.reason);

  // ── Q: E10/E11 — the PA_Goal model class; legacy's two transaction behaviours fall out of reading committed rows ──
  GE.installModel(H.ML, function () { return CTX; });
  var r1 = H.save('pa_goal', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: 'W-PA-ENGINE goal', pa_measure_id: R0_MEASURE, pa_colorschema_id: 100, measuretarget: 0, measurescope: '0', measuredisplay: '0', ad_role_id: 102, seqno: 0, issummary: 'N', relativeweight: 1 });
  var gid = H.lastId('pa_goal'), a1 = H.one('SELECT * FROM pa_goal WHERE pa_goal_id=?', [gid]);   // H.save commits through ML.run
  var nG = Number(H.one('SELECT COUNT(*) AS n FROM pa_goal WHERE pa_measure_id=?', [R0_MEASURE]).n);
  check('Q0 exactly one goal on the measure (fixture not duplicated)', nG === 1, { goals: nG });
  check('Q1 a NEW goal is not computed by its own create (legacy §5.4 a)', r1.ok !== false && a1 && Number(a1.measureactual || 0) === 0, { ok: r1.ok, measureactual: a1 && a1.measureactual, error: r1.error });
  H.update('pa_goal', gid, { measuretarget: 1 });
  var a2 = H.one('SELECT * FROM pa_goal WHERE pa_goal_id=?', [gid]), direct = GE.evaluate(H.q, gid, { today: H.TODAY, access: ACC });
  check('Q2 a target change computes it (MGoal.afterSave) and the stored actual = the measure SQL', a2 && direct.ok && Number(a2.measureactual) === direct.actual, { stored: a2 && a2.measureactual, sql: direct.actual });
  check('Q3 performance scored against the PREVIOUS committed target (0 → 0, legacy §5.4 b)', a2 && Number(a2.goalperformance) === 0 && Number(a2.measuretarget) === 1, { target: a2 && a2.measuretarget, perf: a2 && a2.goalperformance });
  var r3 = GE.updateGoal(H.q, function (s, p) { H.db.run(s, p || []); }, gid, CTX, { force: false });
  check('Q4 render path (force=false) recomputes only when due', r3.updated === false && r3.reason === 'not due', r3);
  H.ML.unregisterModel('pa_goal', 'core');

  // ── A + B: oracles on the SAME project rows ──
  if (OFFLINE) { inc('A', '--offline (pilot not read)'); inc('B', '--offline'); }
  else {
    var Ad = require(path.join(ROOT, 'capex/adapters.js')), Tl = require(path.join(ROOT, 'capex/tiles.js')), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js'));
    var base = process.env.BRIDGE_BASE || 'http://localhost:8088';
    var L = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
    var login = { user: L.user, pass: L.pass, lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
    var data = null, lg = null;
    try { data = await Ad.loadLegacy({ base: base, login: L }); lg = (await Push.queryRows(base, login, 'QueryPAGoal', 'PA_Goal', [{ column: 'Name', val: GOAL }]))[0]; }
    catch (e) { inc('A', 'pilot not readable: ' + String(e && e.message || e)); }
    if (data && !lg) inc('A', 'pilot has no goal "' + GOAL + '" (apply capex/legacy/migration/iD13/postgresql/202611032100_CAPEX-G3.sql)');
    if (data) {
      var pr = data.projects.map(function (p) { var o = {}; Object.keys(p).forEach(function (k) { o[k.toLowerCase()] = p[k]; }); return o; });
      var lastUpd = pr.filter(function (p) { return Number(p.c_currency_id) === 100; }).map(function (p) { return String(p.updated || ''); }).sort().pop();
      H.db.run('DELETE FROM c_project');
      pr.forEach(function (p) { H.db.run('INSERT INTO c_project (c_project_id,ad_client_id,ad_org_id,isactive,value,name,c_currency_id,plannedamt,processed) VALUES (?,?,?,?,?,?,?,?,?)', [Number(p.c_project_id), 11, Number(p.ad_org_id), p.isactive || 'Y', p.value, p.name, Number(p.c_currency_id), p.plannedamt == null ? null : String(p.plannedamt), p.processed || 'N']); });
      var ev = GE.evaluate(H.q, gid, { today: H.TODAY, access: ACC }), eng = ev.ok ? bd(ev.actual) : null; if (BREAK && eng) eng = eng.add(BD.fromString('0.01'));
      log('§PA_ENGINE_TWIN rows=' + pr.length + ' usd=' + pr.filter(function (p) { return Number(p.c_currency_id) === 100; }).length + ' twin=' + (eng && eng.toString()) + ' sql=' + JSON.stringify(ev.sql) + (BREAK ? ' (BREAK=+0.01)' : ''));
      if (lg) {
        if (lg.DateLastRun && lastUpd && String(lastUpd) > String(lg.DateLastRun)) inc('A', 'legacy goal computed ' + lg.DateLastRun + ' before the last USD project change ' + lastUpd + ' — recompute it (capex/tests/witness_pa_tiles.js saves every CAPEX goal target), then re-run');
        else {
          var lv = bd(lg.MeasureActual), sc = (String(lg.MeasureActual).split('.')[1] || '').length;
          check('A legacy PA_Goal.MeasureActual == twin, at legacy\'s own scale (' + sc + ' dp)', !!(eng && lv && eng.setScale(sc, BD.RoundingMode.HALF_UP).eq(lv)), 'legacy=' + lg.MeasureActual + ' twin=' + (eng && eng.toString()) + ' legacyDateLastRun=' + lg.DateLastRun);
        }
      }
      var cents = Tl.compute(data, {}).tiles.approved_budget.cur['100'];
      if (cents == null) inc('B', 'no USD project in the legacy rows');
      else check('B tiles.js approved_budget USD == twin rounded once to the cent (§5.9)', !!eng && Number(eng.setScale(2, BD.RoundingMode.HALF_UP).multiply(BD.of(100)).setScale(0, BD.RoundingMode.DOWN).toString()) === cents, 'tile=' + (cents / 100).toFixed(2) + ' twin=' + (eng && eng.toString()));
    }
  }

  var conv = H.q('SELECT g.pa_goal_id AS id, c.pa_measurecalc_id AS c, c.name FROM pa_goal g JOIN pa_measure m ON m.pa_measure_id=g.pa_measure_id JOIN pa_measurecalc c ON c.pa_measurecalc_id=m.pa_measurecalc_id WHERE m.measuretype=\'C\' AND c.pa_measurecalc_id < 9000000'), cx = 0;
  conv.forEach(function (r) { var e = GE.evaluate(H.q, r.id, { today: H.TODAY, access: ACC }); if (e.ok) cx++; else log('  §PA_ENGINE_CONVERT_FAIL calc=' + r.c + ' ' + JSON.stringify(r.name) + ' ' + e.reason); });
  log('§PA_ENGINE_X_OF_N runs=' + cx + ' of ' + conv.length + ' calculated goals evaluate on the twin');

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§PA_ENGINE_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (BREAK=1: FAIL expected)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { log('§PA_ENGINE_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
