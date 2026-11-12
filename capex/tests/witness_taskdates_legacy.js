#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-TASKDATES-LEGACY (spec prompts/CAPEX_DASHBOARD.md §5.58, arm T8). READ THE LOG: verdict = §TASKDATES_LEGACY_VERDICT; 0 rows judged = INCONCLUSIVE.
// ISSUE it proves/disproves: "the task-date columns exist in the twin only: a real iDempiere with the BIM Document plugin has no such columns, or its read type does not return them, so the twin's Schedule tab and legacy's disagree".
// Runs against the TEST instance ~/idempiere-bimdoc (:8108, DB idempiere_bimdoc; NEVER the pilot). L1 the pack made both physical columns on C_ProjectTask (information_schema) with AD_Column EntityType 'A' and IsSyncDatabase 'Y';
// L2 a fixture of 3 task rows with known dates is COMMITTED through psql and read back through the stock read type QueryCProjectTask by the dashboard's own adapter (loadLegacy): the dates come back equal;
// L3 the SAME fixture shape through the twin adapter (fromSqlite) gives the same normalised rows (TWIN CARDINAL RULE); L4 a task with no dates reads back null, not a guessed date. The fixture is removed in `finally`.
// TASKDATES_LEGACY_BREAK=1 shifts one expected date +1 day and must FAIL L2. Needs setup_test_instance.sh applied and the instance restarted (WS types are cached).
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_taskdates_legacy.js
'use strict';
const path = require('path'), { execFileSync } = require('child_process'), initSqlJs = require('sql.js'), ROOT = path.join(__dirname, '..', '..'), A = require(path.join(ROOT, 'capex/adapters.js'));
const BASE = process.env.BRIDGE_BASE || 'http://localhost:8108', DB = 'idempiere_bimdoc', BREAK = process.env.TASKDATES_LEGACY_BREAK === '1', log = console.log;
let judged = 0, fails = 0, inc = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §TASKDATES_LEGACY ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql }).toString().trim();
const done = () => { const v = fails ? 'FAIL' : (judged && !inc) ? 'PASS' : 'INCONCLUSIVE'; log('§TASKDATES_LEGACY_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1); };
const FIX = [[9300001, 'W-TASKDATES a', '2026-11-03', '2026-11-12'], [9300002, 'W-TASKDATES b', '2026-11-13', '2026-12-01'], [9300003, 'W-TASKDATES c (no dates)', null, null]];
(async () => {
  try { psql('select 1'); } catch (e) { inc++; log('  §TASKDATES_LEGACY INCONCLUSIVE test instance DB unreachable'); return done(); }
  const cols = psql("select string_agg(column_name||':'||data_type, ',' order by column_name) from information_schema.columns where table_name='c_projecttask' and column_name in ('bim_startdate','bim_enddate')"),
    ad = psql("select string_agg(columnname||':'||entitytype||':'||issyncdatabase, ',' order by columnname) from ad_column where columnname in ('BIM_StartDate','BIM_EndDate') and ad_table_id=(select ad_table_id from ad_table where tablename='C_ProjectTask')");
  if (!cols) { ck('L1 the physical columns exist on C_ProjectTask', false, 'none (pack not applied? refresh the instance)'); return done(); }
  ck('L1 both physical columns exist (' + cols + ') and the dictionary says EntityType A, IsSyncDatabase Y (' + ad + ')', /bim_enddate:/.test(cols) && /bim_startdate:/.test(cols) && ad === 'BIM_EndDate:A:Y,BIM_StartDate:A:Y', { cols, ad });
  const clean = () => psql("DELETE FROM c_projecttask WHERE name LIKE 'W-TASKDATES%'; DELETE FROM c_projectphase WHERE name LIKE 'W-TASKDATES%'");
  try {
    clean();
    psql("INSERT INTO c_projectphase (c_projectphase_id,ad_client_id,ad_org_id,createdby,updatedby,c_project_id,name,seqno) VALUES (9300000,11,11,100,100,100,'W-TASKDATES phase',10);\n" +
      FIX.map(r => "INSERT INTO c_projecttask (c_projecttask_id,ad_client_id,ad_org_id,createdby,updatedby,c_projectphase_id,name,seqno,bim_startdate,bim_enddate) VALUES (" + r[0] + ",11,11,100,100,9300000,'" + r[1] + "',10," + (r[2] ? "'" + r[2] + "'" : 'NULL') + ',' + (r[3] ? "'" + r[3] + "'" : 'NULL') + ');').join('\n'));
    log('§TASKDATES_LEGACY fixture committed tasks=' + psql("select count(*) from c_projecttask where name like 'W-TASKDATES%'"));
    let legacy = null; try { legacy = await A.loadLegacy({ base: BASE, login: { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 } }); } catch (e) { log('  read failed: ' + e.message); }
    if (!legacy) { inc++; log('  §TASKDATES_LEGACY INCONCLUSIVE legacy read failed (instance down? restart it after setup_test_instance.sh)'); return; }
    const got = {}; (legacy.tasks || []).filter(t => /^W-TASKDATES/.test(t.Name)).forEach(t => { got[t.Name] = [t.BIM_StartDate ? String(t.BIM_StartDate).slice(0, 10) : null, t.BIM_EndDate ? String(t.BIM_EndDate).slice(0, 10) : null]; });
    const want = {}; FIX.forEach((r, i) => { want[r[1]] = [r[2] && BREAK && i === 0 ? '2026-11-04' : r[2], r[3]]; });
    ck('L2 QueryCProjectTask returns the committed dates of ' + FIX.length + ' tasks through the dashboard adapter', Object.keys(got).length === FIX.length && JSON.stringify(got) === JSON.stringify(want), { got, want });
    ck('L4 a task with no dates reads back null, not a guessed date', got['W-TASKDATES c (no dates)'] && got['W-TASKDATES c (no dates)'][0] === null && got['W-TASKDATES c (no dates)'][1] === null, got['W-TASKDATES c (no dates)']);
    // L3 the same shape through the twin adapter
    const SQL = await initSqlJs(), db = new SQL.Database(); db.run('CREATE TABLE C_ProjectTask (C_ProjectTask_ID INTEGER, C_ProjectPhase_ID INTEGER, Name TEXT, PlannedAmt NUMERIC, BIM_StartDate TEXT, BIM_EndDate TEXT)');
    FIX.forEach(r => db.run('INSERT INTO C_ProjectTask VALUES (?,?,?,?,?,?)', [r[0], 9300000, r[1], 0, r[2], r[3]]));
    const tw = A.fromSqlite(db, {}), tg = {}; tw.tasks.forEach(t => { tg[t.Name] = [t.BIM_StartDate, t.BIM_EndDate]; });
    ck('L3 twin adapter and legacy adapter give the same (name, start, end) for the same rows', JSON.stringify(tg) === JSON.stringify(got), { tg });
  } finally { try { clean(); log('§TASKDATES_LEGACY fixture removed tasks=' + psql("select count(*) from c_projecttask where name like 'W-TASKDATES%'")); } catch (e) { log('§TASKDATES_LEGACY cleanup failed ' + e.message); } done(); }
})().catch(e => { console.error('§TASKDATES_LEGACY_ERROR ' + (e && e.stack || e)); process.exit(2); });
