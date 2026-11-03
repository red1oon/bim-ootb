#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-TILES-ORACLE (spec prompts/CAPEX_DASHBOARD.md §5.16, G2). LOCAL PILOT ONLY. READ THE LOG: verdict = §PA_TILES_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "the CAPEX count/sum tiles cannot be expressed as iDempiere PA data that gives the same value on legacy, on the SQLite twin, and in today's tiles.js".
// Per measure (R0 + the 12 of 202611032000_CAPEX-G2.sql): legacy PA_Goal.MeasureActual (legacy's own engine, after a target save) == erp/overlay/goal_engine.js (the twin's one PA owner) on the twin over the SAME rows (C_Project and
//   AD_WF_Activity of clients 0+11 copied DOWN read-only) at legacy's scale == tiles.js over the stock web-service read (money: engine rounded once to the cent, §5.9).
// A measure whose population is empty prints INCONCLUSIVE, never PASS. Break: BREAK=1 adds 1 to every engine value → FAIL.
// Pilot writes (owner "proceed", §5.16): a missing goal is created through stock create_data and every goal is recomputed by a target save 1→0; legacy's previous-target GoalPerformance is
//   reset to its own rule for target 0 (= 0, MGoal.setGoalPerformance :428-436), as capex/tools/pa_probe.js does.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_pa_tiles.js
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), MIGDIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql');
const C = require(path.join(ROOT, 'erp/tests/dd_common.js')), GE = require(path.join(ROOT, 'erp/goal_engine.js')), MA = require(path.join(ROOT, 'capex/tools/migration_apply.js')), BD = require(path.join(ROOT, 'erp/bigdecimal.js'));
const Ad = require('../adapters.js'), Tl = require('../tiles.js'), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js'));
const base = process.env.BRIDGE_BASE || 'http://localhost:8088', BREAK = process.env.BREAK === '1';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) { console.log('§PA_TILES_VERDICT INCONCLUSIVE local pilot only'); process.exit(2); }
const L = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
const login = { user: L.user, pass: L.pass, lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
const SCRIPTS = ['202611031900_CAPEX-R0.sql', '202611032000_CAPEX-G2.sql', '202611032200_CAPEX-G4.sql'];   // G3 = goals only (the twin makes its own below); G4 = the bucket measures, §5.20
const log = console.log; let judged = 0, fails = 0, inconc = 0;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §PA_TILES ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info ? ' ' + info : '')); }
function inc(n, why) { inconc++; log('  §PA_TILES ' + n + ' INCONCLUSIVE ' + why); }
function psql(sql) { return execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_pilot', '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql, maxBuffer: 64 << 20 }).toString().trim(); }
async function ws(method, body) { const r = await fetch(base + '/ADInterface/services/rest/model_adservice/' + method, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body }); return Push.parseStandardResponse(await r.text()); }
const createGoal = (name, mid, scope) => ws('create_data', Push.buildCrudXml(login, { serviceType: 'BridgeCreatePAGoal', tableName: 'PA_Goal', action: 'Create', fields: [
  { column: 'Name', val: name }, { column: 'PA_Measure_ID', val: String(mid) }, { column: 'MeasureScope', val: scope }, { column: 'MeasureTarget', val: '0' },
  { column: 'PA_ColorSchema_ID', val: '100' }, { column: 'SeqNo', val: '0' }, { column: 'IsSummary', val: 'N' }, { column: 'RelativeWeight', val: '1' }, { column: 'ChartType', val: 'BC' }] }));
const saveTarget = (id, v) => ws('update_data', Push.buildCrudXml(login, { serviceType: 'BridgeUpdatePAGoal', tableName: 'PA_Goal', action: 'Update', recordId: id, fields: [{ column: 'MeasureTarget', val: v }] }));
const queryGoal = keys => Push.queryRows(base, login, 'QueryPAGoal', 'PA_Goal', keys);
const scopeOf = m => m.measuredatatype === 'T' ? '1' : '0';   // the T measure (tile 7) is judged per year: X_PA_Goal MEASURESCOPE_Year = "1"; others Total = "0"
const bd = v => { if (v == null) return null; let x = String(v); if (/e/i.test(x)) x = Number(v).toFixed(12); return BD.fromString(x); };
const dt = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? v.replace('T', ' ').replace(/\.\d+$/, '') : v;

(async () => {
  // ── the twin: seed + patch + the SAME two migration scripts legacy applied ──
  const H = await C.boot(), today = (() => { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();   // the LOCAL day (legacy: the server's local date), §5.24
  SCRIPTS.forEach(f => MA.apply(fs.readFileSync(path.join(MIGDIR, f), 'utf8'), { file: f, run: s => H.db.run(s), convertSql: H.A.convertSql, log, has: t => !!H.one('SELECT 1 AS x FROM sqlite_master WHERE lower(name)=?', [t]) }));
  const measures = H.q('SELECT * FROM pa_measure WHERE pa_measure_id>=1000000 ORDER BY pa_measure_id');
  const legacyMs = psql("SELECT PA_Measure_ID FROM PA_Measure WHERE PA_Measure_ID>=1000000 AND (PA_Measure_UU::text LIKE '5a0c3e1e-0b7d-4c1e-9f3a-cafe%') ORDER BY 1;").split('\n').filter(Boolean).map(Number);
  check('M the same measures on both sides (by id)', JSON.stringify(measures.map(m => m.pa_measure_id)) === JSON.stringify(legacyMs), 'twin=' + measures.map(m => m.pa_measure_id).join(',') + ' legacy=' + legacyMs.join(','));

  // ── DOWN copy (read-only) of the rows the measures read ──
  const copied = {};
  ['c_project', 'c_projectphase', 'ad_wf_activity'].forEach(t => {
    const rows = JSON.parse(psql('SELECT COALESCE(json_agg(x), \'[]\') FROM ' + t + ' x WHERE ad_client_id IN (0,11);') || '[]');
    const cols = H.q('PRAGMA table_info(' + t + ')').map(c => c.name.toLowerCase());
    H.db.run('DELETE FROM ' + t);
    rows.forEach(r => { const ks = Object.keys(r).filter(k => cols.includes(k)); H.db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(() => '?').join(',') + ')', ks.map(k => { const v = r[k]; return v == null ? null : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'Y' : 'N') : typeof v === 'number' ? String(v) : dt(v); })); });
    copied[t] = rows.length;
  });
  log('§PA_TILES_DOWN c_project=' + copied.c_project + ' c_projectphase=' + copied.c_projectphase + ' ad_wf_activity=' + copied.ad_wf_activity + ' (clients 0+11, read-only psql)');

  // ── legacy: one goal per measure, computed by legacy's own model save ──
  const legacy = {};
  for (const m of measures) {
    let g = (await queryGoal([{ column: 'Name', val: m.name }]))[0];
    if (!g) { const r = await createGoal(m.name, m.pa_measure_id, scopeOf(m)); log('§PA_TILES legacy create goal ' + JSON.stringify(m.name) + ' → ' + (r.isError ? 'ERROR ' + r.error : 'RecordID=' + r.recordId)); g = (await queryGoal([{ column: 'Name', val: m.name }]))[0]; }
    if (!g) { legacy[m.pa_measure_id] = { err: 'no goal' }; continue; }
    const a = await saveTarget(g.PA_Goal_ID, '1'), b = await saveTarget(g.PA_Goal_ID, '0');
    const g2 = (await queryGoal([{ column: 'PA_Goal_ID', val: +g.PA_Goal_ID }]))[0];
    if (g2 && Number(g2.GoalPerformance) !== 0) psql('UPDATE PA_Goal SET GoalPerformance=0 WHERE PA_Goal_ID=' + Number(g2.PA_Goal_ID) + ';');   // §5.4 (b) fixture repair, pilot only
    legacy[m.pa_measure_id] = { goal: g2, err: a.isError ? a.error : b.isError ? b.error : null };
  }

  // ── twin: the same goals through the model layer, computed by the engine ──
  GE.install(H.db);   // the twin's ONE PA owner (erp/goal_engine.js, §5.18/§5.24): its SQLite ports of trunc / invoiceopen / currencybase / the invoice views
  const CTX = { client: 11, role: 102, today, now: today + ' 12:00:00', convertSql: H.A.convertSql }, run = (s, p) => H.db.run(s, p || []), twin = {};
  measures.forEach(m => {
    H.save('pa_goal', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: m.name, pa_measure_id: m.pa_measure_id, pa_colorschema_id: 100, measuretarget: 0, measurescope: scopeOf(m), seqno: 0, issummary: 'N', relativeweight: 1, charttype: 'BC' });
    const gid = H.lastId('pa_goal'), u = GE.updateGoal(H.q, run, gid, CTX, { force: true });
    (u.goals || []).forEach(r => log('    §PA_TILES_TWIN goal=' + r.goalId + ' measure=' + m.pa_measure_id + ' written=' + r.written + ' actual=' + r.actual + (r.reason ? ' reason=' + JSON.stringify(r.reason) : '') + ' sql=' + JSON.stringify(r.sql)));
    const row = H.one('SELECT * FROM pa_goal WHERE pa_goal_id=?', [gid]);
    twin[m.pa_measure_id] = bd(row.measureactual);
  });

  // ── tiles.js over the stock WS read (today's dashboard) ──
  const data = await Ad.loadLegacy({ base, login: L }), T = Tl.compute(data, { today }).tiles;
  log('§PA_TILES_WS projects=' + data.projects.length + ' wf=' + (data.wf || []).length + ' unavailable=[' + data.unavailable.join(',') + ']');
  const cents = (k, cur) => T[k] && T[k].cur ? T[k].cur[cur] : undefined;
  const TILE = {
    1000000: ['approved_budget USD', 'm', cents('approved_budget', '100'), 'C_Currency_ID=100'], 1000014: ['approved_budget BDT', 'm', cents('approved_budget', '322'), 'C_Currency_ID=322'],
    1000015: ['actual_cost USD', 'm', cents('actual_cost', '100'), 'C_Currency_ID=100'], 1000016: ['actual_cost BDT', 'm', cents('actual_cost', '322'), 'C_Currency_ID=322'],
    1000017: ['committed_cost USD', 'm', cents('committed_cost', '100'), 'C_Currency_ID=100'], 1000018: ['committed_cost BDT', 'm', cents('committed_cost', '322'), 'C_Currency_ID=322'],
    1000019: ['invoiced USD', 'm', T.committed_cost.invoiced['100'], 'C_Currency_ID=100'], 1000020: ['invoiced BDT', 'm', T.committed_cost.invoiced['322'], 'C_Currency_ID=322'],
    1000011: ['total_projects', 'n', T.total_projects.n, '1=1'], 1000012: ['total_projects closed', 'n', T.total_projects.closed, "Processed='Y'"],
    1000013: ['active_projects', 'n', T.active_projects.n, "IsActive='Y' AND Processed='N'"], 1000021: ['completed_year', 'n', T.completed_year.n, "Processed='Y'"],
    1000022: ['approvals', 'n', T.approvals && T.approvals.n, "WFState='OS' AND Processed='N'", 'ad_wf_activity']
  };
  // §5.20 G4 — the bucket tiles; population = the active projects (A); a bucket 0 on every side judges nothing (INCONCLUSIVE)
  const BK = (T2) => ({
    1000023: ['health green', 'b', T2.health.green], 1000024: ['health amber', 'b', T2.health.amber], 1000025: ['health red', 'b', T2.health.red], 1000026: ['health none', 'b', T2.health.none],
    1000027: ['schedule on time', 'b', T2.schedule.ontime], 1000028: ['schedule delayed', 'b', T2.schedule.delayed], 1000029: ['schedule at risk', 'b', T2.schedule.atrisk], 1000030: ['schedule no data', 'b', T2.schedule.nosched],
    1000031: ['schedule avg delay', 'd', T2.schedule.avgDelay], 1000032: ['budget within', 'b', T2.budget_status.within], 1000033: ['budget over', 'b', T2.budget_status.over], 1000034: ['budget not started', 'b', T2.budget_status.notstarted],
    1000035: ['budget overrun USD', 'o', T2.budget_status.overrun['100']], 1000036: ['budget overrun BDT', 'o', T2.budget_status.overrun['322']] });
  const actN = Number(H.one("SELECT COUNT(*) AS n FROM c_project WHERE ad_client_id=11 AND isactive='Y' AND processed='N'").n);
  function judgeBucket(tag, kind, eng, tv, lgv, sc) {   // eng BigDecimal (twin), tv tiles.js value, lgv legacy BigDecimal|undefined (undefined = not compared), sc legacy scale
    const info = 'legacy=' + (lgv === undefined ? '(not compared)' : lgv && lgv.toString()) + ' engine=' + (eng && eng.toString()) + ' tiles=' + (tv == null ? 'no data' : kind === 'o' ? (tv / 100).toFixed(2) : tv) + ' active=' + actN;
    if (!actN) { inc(tag, 'no active project (' + info + ')'); return; }
    const z = (v) => v == null || (typeof v === 'number' ? v === 0 : v.isZero());
    if (z(eng) && z(tv) && (lgv === undefined || z(lgv))) { inc(tag, 'bucket not exercised — 0 on every side (' + info + ')'); return; }
    if (lgv !== undefined) check(tag + ' legacy == engine', !!(eng && lgv && eng.setScale(Math.max(sc, 0), BD.RoundingMode.HALF_UP).eq(lgv.setScale(Math.max(sc, 0), BD.RoundingMode.HALF_UP))), info);
    const ev = kind === 'o' ? (eng ? Number(eng.setScale(2, BD.RoundingMode.HALF_UP).multiply(BD.of(100)).setScale(0, BD.RoundingMode.DOWN).toString()) : null) : (eng ? Number(eng.setScale(6, BD.RoundingMode.HALF_UP).toString()) : null);
    const tt = tv == null ? (kind === 'o' || kind === 'd' ? 0 : null) : (kind === 'd' ? Math.round(tv * 1e6) / 1e6 : tv);   // no over / no delayed project: tiles 'no data', PA's SUM/AVG of nothing = legacy 0
    check(tag + ' tiles.js == engine', ev === tt, info);
  }
  measures.forEach(m => {
    const bk = BK(T)[m.pa_measure_id];
    if (bk) { const lg0 = legacy[m.pa_measure_id], lgv = lg0 && lg0.goal ? bd(lg0.goal.MeasureActual) : null, e0 = twin[m.pa_measure_id];
      if (lg0 && lg0.err) { check(m.pa_measure_id + ' ' + bk[0] + ' legacy goal computed', false, lg0.err); return; }
      judgeBucket('A ' + m.pa_measure_id + ' ' + bk[0], bk[1], BREAK && e0 ? e0.add(BD.of(1)) : e0, bk[2], lgv, lg0 && lg0.goal ? (String(lg0.goal.MeasureActual).split('.')[1] || '').length : 0); return; }
    const t = TILE[m.pa_measure_id], tag = m.pa_measure_id + ' ' + (t ? t[0] : m.name), lg = legacy[m.pa_measure_id];
    if (!t) { inc(tag, 'no tiles.js mapping'); return; }
    const pop = Number(H.one('SELECT COUNT(*) AS n FROM ' + (t[4] || 'c_project') + ' WHERE ad_client_id=11 AND ' + t[3]).n);
    const money = t[1] === 'm', colPop = money ? Number(H.one('SELECT COUNT(*) AS n FROM c_project WHERE ad_client_id=11 AND ' + t[3] + ' AND ' + ({ 1000000: 'plannedamt', 1000014: 'plannedamt', 1000015: 'projectbalanceamt', 1000016: 'projectbalanceamt', 1000017: 'committedamt', 1000018: 'committedamt', 1000019: 'invoicedamt', 1000020: 'invoicedamt' }[m.pa_measure_id]) + ' IS NOT NULL').n) : pop;
    let eng = twin[m.pa_measure_id]; if (BREAK && eng) eng = eng.add(BD.of(1));
    const lv = lg && lg.goal ? bd(lg.goal.MeasureActual) : null, sc = lg && lg.goal ? (String(lg.goal.MeasureActual).split('.')[1] || '').length : 0;
    const info = 'legacy=' + (lg && lg.goal ? lg.goal.MeasureActual : 'ERR ' + (lg && lg.err)) + ' engine=' + (eng && eng.toString()) + ' tiles=' + (money ? (t[2] == null ? 'no data' : (t[2] / 100).toFixed(2)) : t[2]) + ' population=' + pop + (money ? ' valued=' + colPop : '');
    if (lg && lg.err) { check(tag + ' legacy goal computed', false, info); return; }
    if (colPop === 0) { inc(tag, 'empty population (' + info + ') — a 0 here judges nothing'); return; }
    check(tag + ' legacy == engine', !!(eng && lv && eng.setScale(sc, BD.RoundingMode.HALF_UP).eq(lv)), info);
    const tv = money ? (eng ? Number(eng.setScale(2, BD.RoundingMode.HALF_UP).multiply(BD.of(100)).setScale(0, BD.RoundingMode.DOWN).toString()) : null) : (eng ? Number(eng.toString()) : null);
    check(tag + ' tiles.js == engine', t[2] != null && tv === t[2], info);
  });
  // ── B: the twin engine == tiles.js at shifted dates (the SQL's SYSDATE through RUNTIME.now; legacy's server clock cannot be moved) ──
  for (const d of ['2026-12-10', '2027-06-01', '2028-08-01']) {
    H.A.RUNTIME.now = () => Date.parse(d + 'T12:00:00Z');
    const T2 = Tl.compute(data, { today: d }).tiles, map = BK(T2), acc = GE.accessOf(H.q, 102, 11);
    Object.keys(map).forEach(id => {
      const g = H.one('SELECT pa_goal_id AS g FROM pa_goal WHERE pa_measure_id=? ORDER BY pa_goal_id DESC', [Number(id)]);
      const r = g ? GE.evaluate(H.q, g.g, { today: d, access: acc, convertSql: H.A.convertSql }) : { ok: false, reason: 'no goal' };
      if (!r.ok) { check('B ' + d + ' ' + id + ' ' + map[id][0] + ' evaluates', false, r.reason); return; }
      const e = bd(r.actual); judgeBucket('B ' + d + ' ' + id + ' ' + map[id][0], map[id][1], BREAK ? e.add(BD.of(1)) : e, map[id][2], undefined, 0);
    });
  }
  H.A.RUNTIME.now = () => Date.now();
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§PA_TILES_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (BREAK=1: FAIL expected)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { log('§PA_TILES_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
