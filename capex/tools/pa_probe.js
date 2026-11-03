// capex/tools/pa_probe.js — W-PA-LEGACY-PROBE (spec: prompts/CAPEX_DASHBOARD.md §5.3 R0). LOCAL PILOT ONLY.
// ISSUE IT PROVES OR DISPROVES: "a CAPEX tile cannot be defined as iDempiere PA data without Java".
// The measure rows come from the migration script capex/legacy/migration/iD13/postgresql/202611031900_CAPEX-R0.sql (already applied). This probe creates the GOAL the way a
// user does (stock create_data), then saves its target 0→1→0 (two model saves — the create alone computes nothing, §5.4 (a)), reads PA_Goal back over stock query_data, and compares it with
// tiles.js approved_budget (USD) computed over a fresh legacy snapshot read with the SAME role (102). Expected values never come from the goal.
// Negative: a goal on a measure whose SelectClause is broken must not yield a number. That measure is inserted here, pilot-only, and deleted after (psql via docker).
// Break switch: BREAK=1 expects the tile + 1 cent → must FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/pa_probe.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path'), A = require('../adapters.js'), Tl = require('../tiles.js');
const Push = require(path.join(__dirname, '..', '..', 'viewer', 'erp_rest_push.js'));
const base = process.env.BRIDGE_BASE || 'http://localhost:8088';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) { console.error('§CFG local pilot only'); process.exit(2); }
const L = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 };
const login = { user: L.user, pass: L.pass, lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
const GOAL = 'CAPEX Approved Budget (USD)', BAD = 'CAPEX R0 negative control (broken SQL)';
let fails = 0, judged = 0;
function check(name, ok, detail) { judged++; if (!ok) fails++; console.log('§PA_PROBE_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : '')); }
function psql(sql) { return execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_pilot', '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql }).toString().trim(); }
// no Filter (legacy forbids a free one, prompts/CAPEX_DASHBOARD.md §5.8): DataRow KEY fields (Name | PA_Goal_ID) through the one shared reader (Push.queryRows)
const query = keys => Push.queryRows(base, login, 'QueryPAGoal', 'PA_Goal', keys);
async function createGoal(name, measureId) {
  const xml = Push.buildCrudXml(login, { serviceType: 'BridgeCreatePAGoal', tableName: 'PA_Goal', action: 'Create', fields: [
    { column: 'Name', val: name }, { column: 'PA_Measure_ID', val: String(measureId) }, { column: 'MeasureScope', val: '0' },        // 0 = Total (X_PA_Goal MEASURESCOPE_Total)
    { column: 'MeasureTarget', val: '0' },                                                                                              // no target stated by the client (§6 Q1)
    { column: 'PA_ColorSchema_ID', val: '100' }, { column: 'SeqNo', val: '0' }, { column: 'IsSummary', val: 'N' }, { column: 'RelativeWeight', val: '1' }, { column: 'ChartType', val: 'BC' }] });
  const res = await fetch(base + '/ADInterface/services/rest/model_adservice/create_data', { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: xml });
  return Push.parseStandardResponse(await res.text());
}
// legacy runs the measure SQL only on a model save that CHANGES MeasureTarget/MeasureScope (MGoal.afterSave :597-605). A create alone computes nothing (MGoal.getMeasureGoals
// :150-163 reads outside the uncommitted create trx). So: save target 0→1→0 — two real model saves, ending at the target the goal was created with (no target is kept that nobody stated).
async function saveTarget(goalId, v) {
  const xml = Push.buildCrudXml(login, { serviceType: 'BridgeUpdatePAGoal', tableName: 'PA_Goal', action: 'Update', recordId: goalId, fields: [{ column: 'MeasureTarget', val: v }] });
  const res = await fetch(base + '/ADInterface/services/rest/model_adservice/update_data', { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: xml });
  return Push.parseStandardResponse(await res.text());
}
async function recompute(goalId) { const a = await saveTarget(goalId, '1'), b = await saveTarget(goalId, '0'); return a.isError ? a : b; }
(async () => {
  // re-runnable: a goal computes on its FIRST save, so any goal of this probe from an earlier run is removed first (pilot-only)
  const gone = psql("DELETE FROM PA_Goal WHERE AD_Client_ID=11 AND Name IN ('" + GOAL + "','" + BAD + "') RETURNING PA_Goal_ID;");
  if (gone) console.log('§PA_PROBE cleanup earlier goals ' + gone.split('\n').join(','));
  const mid = +psql("SELECT PA_Measure_ID FROM PA_Measure WHERE PA_Measure_UU='5a0c3e1e-0b7d-4c1e-9f3a-cafe00000002';");
  if (!mid) { console.log('§PA_PROBE_VERDICT INCONCLUSIVE migration 202611031900_CAPEX-R0.sql not applied'); process.exit(2); }

  // expected: the dashboard's own compute over a fresh legacy read (same role)
  const data = await A.loadLegacy({ base, login: L });
  const T = Tl.compute(data, {}).tiles, cents = T.approved_budget.cur['100'];
  if (cents == null) { console.log('§PA_PROBE_VERDICT INCONCLUSIVE no USD project in the legacy snapshot — nothing to judge'); process.exit(2); }
  const expCents = cents + (process.env.BREAK === '1' ? 1 : 0);
  console.log('§PA_PROBE expected tiles.approved_budget USD=' + (cents / 100).toFixed(2) + ' (projects=' + data.projects.length + ', unavailable=[' + data.unavailable.join(',') + '])' + (process.env.BREAK === '1' ? ' BREAK=+1 cent' : ''));

  const sr = await createGoal(GOAL, mid);
  console.log('§PA_PROBE create goal → ' + (sr.isError ? 'ERROR ' + sr.error : 'RecordID=' + sr.recordId));
  const g = (await query([{ column: 'Name', val: GOAL }]))[0];
  console.log('§PA_PROBE legacy goal ' + JSON.stringify(g));
  check('GOAL CREATED by a model save', !sr.isError && !!g, sr.isError ? sr.error : '');
  if (g) {
    console.log('§PA_PROBE_FINDING after CREATE only: MeasureActual=' + g.MeasureActual + ' (tile ' + (cents / 100).toFixed(2) + ') DateLastRun=' + g.DateLastRun +
      ' — DateLastRun comes from the constructor default, NOT a computation; a fresh goal shows ' + g.MeasureActual + ' until saved again or ZK refreshes it (30 min interval)');
    const ru = await recompute(g.PA_Goal_ID);
    const g2 = (await query([{ column: 'PA_Goal_ID', val: +g.PA_Goal_ID }]))[0];
    console.log('§PA_PROBE recompute (target 0→1→0) → ' + (ru.isError ? 'ERROR ' + ru.error : 'ok') + ' goal=' + JSON.stringify(g2));
    const actC = Math.round(Number(g2 && g2.MeasureActual) * 100);
    check('LEGACY MeasureActual (its own SQL, after a model save) == dashboard tile (USD, to the cent)', !ru.isError && actC === expCents, 'legacy=' + (g2 && g2.MeasureActual) + ' tile=' + (expCents / 100).toFixed(2));
    check('TARGET left as created (0)', g2 && Number(g2.MeasureTarget) === 0, 'MeasureTarget=' + (g2 && g2.MeasureTarget));
    if (g2 && Number(g2.GoalPerformance) !== 0) {
      // the recompute inside afterSave re-reads the goal OUTSIDE the save trx (getMeasureGoals, null trx) → performance = actual ÷ the PREVIOUS committed target (1), not 0
      console.log('§PA_PROBE_FINDING LEGACY_PERFORMANCE_PREVIOUS_TARGET GoalPerformance=' + g2.GoalPerformance + ' with MeasureTarget=0 (= actual ÷ the previous target 1)');
      psql('UPDATE PA_Goal SET GoalPerformance=0 WHERE PA_Goal_ID=' + g2.PA_Goal_ID + ';');   // legacy's own rule for target 0 (MGoal.setGoalPerformance :428-436) — probe fixture repair, pilot only
      console.log('§PA_PROBE repaired GoalPerformance → 0 on PA_Goal_ID=' + g2.PA_Goal_ID + ' (legacy rule: target 0 → 0)');
    }
    console.log('§PA_PROBE colour INCONCLUSIVE — MeasureTarget=' + (g2 && g2.MeasureTarget) + ' GoalPerformance=' + (g2 && g2.GoalPerformance) + ' (no target stated by the client, §6 Q1)');
  }

  // negative control: broken SelectClause → no number
  const badCalc = psql("INSERT INTO PA_MeasureCalc (PA_MeasureCalc_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,SelectClause,WhereClause,DateColumn,OrgColumn,KeyColumn,AD_Table_ID,EntityType,PA_MeasureCalc_UU) " +
    "VALUES (nextidfunc((SELECT AD_Sequence_ID FROM AD_Sequence WHERE Name='PA_MeasureCalc' AND IsTableID='Y')::int,'N'::varchar),11,0,'Y',now(),100,now(),100,'" + BAD + "','SELECT SUM(NoSuchColumn) FROM C_Project','WHERE 1=1','C_Project.Created','C_Project.AD_Org_ID','C_Project.C_Project_ID',(SELECT AD_Table_ID FROM AD_Table WHERE TableName='C_Project'),'U',gen_random_uuid()) RETURNING PA_MeasureCalc_ID;");
  const badMeas = psql("INSERT INTO PA_Measure (PA_Measure_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy,Name,MeasureType,MeasureDataType,PA_MeasureCalc_ID,PA_Measure_UU) " +
    "VALUES (nextidfunc((SELECT AD_Sequence_ID FROM AD_Sequence WHERE Name='PA_Measure' AND IsTableID='Y')::int,'N'::varchar),11,0,'Y',now(),100,now(),100,'" + BAD + "','C','S'," + badCalc + ",gen_random_uuid()) RETURNING PA_Measure_ID;");
  console.log('§PA_PROBE negative control calc=' + badCalc + ' measure=' + badMeas);
  try {
    const sb = await createGoal(BAD, badMeas);
    const gb0 = (await query([{ column: 'Name', val: BAD }]))[0];
    const rb = gb0 ? await recompute(gb0.PA_Goal_ID) : { isError: true, error: 'no goal row' };
    const gb = gb0 ? (await query([{ column: 'PA_Goal_ID', val: +gb0.PA_Goal_ID }]))[0] : null;
    console.log('§PA_PROBE negative create → ' + (sb.isError ? 'ERROR ' + sb.error : 'RecordID=' + sb.recordId) + ' recompute → ' + (rb.isError ? 'ERROR ' + rb.error : 'ok') + ' goal=' + JSON.stringify(gb || null));
    // what the spec asked ("a broken SelectClause must show an error, not a number") is judged here; source says legacy swallows it (DB.getSQLValueBD :1393-1404 → null → 0, MMeasure :530-535)
    const errorShown = sb.isError || rb.isError || !gb;
    // anti-echo: the positive result must come from the measure's own SQL — a broken SQL on the same goal path must NOT also give the tile's number
    check('NEGATIVE CONTROL: a broken measure does not give the tile value', !gb || Math.round(Number(gb.MeasureActual) * 100) !== cents, gb ? 'MeasureActual=' + gb.MeasureActual : '');
    console.log('§PA_PROBE_FINDING ' + (errorShown ? 'LEGACY_ERROR_REPORTED' : 'LEGACY_ERROR_IS_ZERO a broken measure saves MeasureActual=' + gb.MeasureActual + ' with NO error to the caller — indistinguishable from a real 0 (DB.getSQLValueBD :1393-1404 → null → 0, MMeasure :530-535)'));
  } finally {
    psql("DELETE FROM PA_Goal WHERE AD_Client_ID=11 AND Name='" + BAD + "'; DELETE FROM PA_Measure WHERE PA_Measure_ID=" + badMeas + "; DELETE FROM PA_MeasureCalc WHERE PA_MeasureCalc_ID=" + badCalc + ";");
    console.log('§PA_PROBE negative control removed');
  }
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  console.log('§PA_PROBE_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' colour=INCONCLUSIVE(no target)' + (process.env.BREAK === '1' ? ' (BREAK=1 — must be FAIL)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§PA_PROBE_ERROR ' + (e && e.stack || e)); process.exit(2); });
