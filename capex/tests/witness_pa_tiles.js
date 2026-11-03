#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-TILES-ORACLE (spec prompts/CAPEX_DASHBOARD.md §5.16, G2). LOCAL PILOT ONLY. READ THE LOG: verdict = §PA_TILES_VERDICT; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: "the CAPEX count/sum tiles cannot be expressed as iDempiere PA data that gives the same value on legacy, on the SQLite twin, and in today's tiles.js".
// Per measure (R0 + the 12 of 202611032000_CAPEX-G2.sql): legacy PA_Goal.MeasureActual (legacy's own engine, after a target save) == erp/pa_engine.js on the twin over the SAME rows (C_Project and
//   AD_WF_Activity of clients 0+11 copied DOWN read-only) at legacy's scale == tiles.js over the stock web-service read (money: engine rounded once to the cent, §5.9).
// A measure whose population is empty prints INCONCLUSIVE, never PASS. Break: BREAK=1 adds 1 to every engine value → FAIL.
// Pilot writes (owner "proceed", §5.16): a missing goal is created through stock create_data and every goal is recomputed by a target save 1→0; legacy's previous-target GoalPerformance is
//   reset to its own rule for target 0 (= 0, MGoal.setGoalPerformance :428-436), as capex/tools/pa_probe.js does.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_pa_tiles.js
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), MIGDIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql');
const C = require(path.join(ROOT, 'erp/tests/dd_common.js')), PA = require(path.join(ROOT, 'erp/pa_engine.js')), MA = require(path.join(ROOT, 'erp/migration_apply.js')), BD = require(path.join(ROOT, 'erp/bigdecimal.js'));
const Ad = require('../adapters.js'), Tl = require('../tiles.js'), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js'));
const base = process.env.BRIDGE_BASE || 'http://localhost:8088', BREAK = process.env.BREAK === '1';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) { console.log('§PA_TILES_VERDICT INCONCLUSIVE local pilot only'); process.exit(2); }
const L = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
const login = { user: L.user, pass: L.pass, lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
const SCRIPTS = ['202611031900_CAPEX-R0.sql', '202611032000_CAPEX-G2.sql'];
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
const dt = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? v.replace('T', ' ').replace(/\.\d+$/, '') : v;

(async () => {
  // ── the twin: seed + patch + the SAME two migration scripts legacy applied ──
  const H = await C.boot(), today = new Date().toISOString().slice(0, 10);
  SCRIPTS.forEach(f => MA.apply(fs.readFileSync(path.join(MIGDIR, f), 'utf8'), { file: f, run: s => H.db.run(s), convertSql: H.A.convertSql, log, has: t => !!H.one('SELECT 1 AS x FROM sqlite_master WHERE lower(name)=?', [t]) }));
  const measures = H.q('SELECT * FROM pa_measure WHERE pa_measure_id>=1000000 ORDER BY pa_measure_id');
  const legacyMs = psql("SELECT PA_Measure_ID FROM PA_Measure WHERE PA_Measure_ID>=1000000 AND (PA_Measure_UU::text LIKE '5a0c3e1e-0b7d-4c1e-9f3a-cafe%') ORDER BY 1;").split('\n').filter(Boolean).map(Number);
  check('M the same measures on both sides (by id)', JSON.stringify(measures.map(m => m.pa_measure_id)) === JSON.stringify(legacyMs), 'twin=' + measures.map(m => m.pa_measure_id).join(',') + ' legacy=' + legacyMs.join(','));

  // ── DOWN copy (read-only) of the rows the measures read ──
  const copied = {};
  ['c_project', 'ad_wf_activity'].forEach(t => {
    const rows = JSON.parse(psql('SELECT COALESCE(json_agg(x), \'[]\') FROM ' + t + ' x WHERE ad_client_id IN (0,11);') || '[]');
    const cols = H.q('PRAGMA table_info(' + t + ')').map(c => c.name.toLowerCase());
    H.db.run('DELETE FROM ' + t);
    rows.forEach(r => { const ks = Object.keys(r).filter(k => cols.includes(k)); H.db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(() => '?').join(',') + ')', ks.map(k => { const v = r[k]; return v == null ? null : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'Y' : 'N') : typeof v === 'number' ? String(v) : dt(v); })); });
    copied[t] = rows.length;
  });
  log('§PA_TILES_DOWN c_project=' + copied.c_project + ' ad_wf_activity=' + copied.ad_wf_activity + ' (clients 0+11, read-only psql)');

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
  const E = PA.create({ q: H.q, run: (s, p) => H.db.run(s, p || []), convertSql: H.A.convertSql, ctx: H.ctx, now: () => today + ' 12:00:00', log: l => { if (!/§PA_ACCESS/.test(l)) log('    ' + l); } });
  const twin = {};
  measures.forEach(m => {
    H.save('pa_goal', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: m.name, pa_measure_id: m.pa_measure_id, pa_colorschema_id: 100, measuretarget: 0, measurescope: scopeOf(m), seqno: 0, issummary: 'N', relativeweight: 1, charttype: 'BC' });
    const gid = H.lastId('pa_goal'); E.updateGoal(gid, { force: true });
    const row = H.one('SELECT * FROM pa_goal WHERE pa_goal_id=?', [gid]);
    twin[m.pa_measure_id] = PA.bd(row.measureactual);
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
  measures.forEach(m => {
    const t = TILE[m.pa_measure_id], tag = m.pa_measure_id + ' ' + (t ? t[0] : m.name), lg = legacy[m.pa_measure_id];
    if (!t) { inc(tag, 'no tiles.js mapping'); return; }
    const pop = Number(H.one('SELECT COUNT(*) AS n FROM ' + (t[4] || 'c_project') + ' WHERE ad_client_id=11 AND ' + t[3]).n);
    const money = t[1] === 'm', colPop = money ? Number(H.one('SELECT COUNT(*) AS n FROM c_project WHERE ad_client_id=11 AND ' + t[3] + ' AND ' + ({ 1000000: 'plannedamt', 1000014: 'plannedamt', 1000015: 'projectbalanceamt', 1000016: 'projectbalanceamt', 1000017: 'committedamt', 1000018: 'committedamt', 1000019: 'invoicedamt', 1000020: 'invoicedamt' }[m.pa_measure_id]) + ' IS NOT NULL').n) : pop;
    let eng = twin[m.pa_measure_id]; if (BREAK && eng) eng = eng.add(BD.of(1));
    const lv = lg && lg.goal ? PA.bd(lg.goal.MeasureActual) : null, sc = lg && lg.goal ? (String(lg.goal.MeasureActual).split('.')[1] || '').length : 0;
    const info = 'legacy=' + (lg && lg.goal ? lg.goal.MeasureActual : 'ERR ' + (lg && lg.err)) + ' engine=' + (eng && eng.toString()) + ' tiles=' + (money ? (t[2] == null ? 'no data' : (t[2] / 100).toFixed(2)) : t[2]) + ' population=' + pop + (money ? ' valued=' + colPop : '');
    if (lg && lg.err) { check(tag + ' legacy goal computed', false, info); return; }
    if (colPop === 0) { inc(tag, 'empty population (' + info + ') — a 0 here judges nothing'); return; }
    check(tag + ' legacy == engine', !!(eng && lv && eng.setScale(sc, BD.RoundingMode.HALF_UP).eq(lv)), info);
    const tv = money ? (eng ? Number(eng.setScale(2, BD.RoundingMode.HALF_UP).multiply(BD.of(100)).setScale(0, BD.RoundingMode.DOWN).toString()) : null) : (eng ? Number(eng.toString()) : null);
    check(tag + ' tiles.js == engine', t[2] != null && tv === t[2], info);
  });
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§PA_TILES_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (BREAK=1: FAIL expected)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { log('§PA_TILES_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
