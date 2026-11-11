#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CAPEX-STAGES + W-CAPEX-PROPOSED (spec prompts/CAPEX_DASHBOARD.md §5.38, T5). READ THE LOG: verdict = §CAPEX_PROPOSED_VERDICT; the exit code is not evidence.
// THE ISSUES it proves/disproves: (Q2) "the five CAPEX stages exist only in prose: the same rows are not on legacy and on the twin, in order, and a project at a stage does not show it";
//   (Q4/Q3) "contract, verified and the forecast (EAC) are undefined, or defined twice with different numbers": ONE definition (a PA measure row) gives the same value on legacy's PostgreSQL, on the twin's goal engine, and (Forecast) on the page's tiles.js.
// LEGACY = the TEST instance DB idempiere_bimdoc (never the pilot): the two migration scripts are applied there by psql; a fixture (projects 9300001-9300005, phases, two Project Issues, three existing completed POs
//   pointed at projects) is COMMITTED then restored. Expected numbers are recomputed BY HAND below from the fixture figures, so the SQL itself is judged, not only equal on both sides.
//   Fixture (USD): P1 plan 100 spent 40 done 20 → EAC 200 · P2 plan 50 spent 30 done 25 → EAC 60 · P3 no phase done (excluded) · P4 spent 0 (excluded) · P5 closed (excluded) → EAC total 260.00.
//   Contract = completed POs 104 + 105 on projects (3657.5 + 2895.55 = 6553.05; PO 106 has no project). Verified = ProjectBalanceAmt of projects with a Processed Issue: P1 (2 issues, counted once) 40 + P5 20 = 60.
// A measure whose population is empty prints INCONCLUSIVE, never PASS. Breaks: PROPOSED_BREAK=1 adds 1 to the twin value → FAIL; STAGES_BREAK=1 deletes one phase on the twin → S1 FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_capex_proposed.js
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), MIGDIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql'), DB = 'idempiere_bimdoc';
const C = require(path.join(ROOT, 'erp/tests/dd_common.js')), GE = require(path.join(ROOT, 'erp/goal_engine.js')), MA = require(path.join(ROOT, 'capex/tools/migration_apply.js'));
const Ad = require('../adapters.js'), Tl = require('../tiles.js'), BREAK = process.env.PROPOSED_BREAK === '1', SBREAK = process.env.STAGES_BREAK === '1';
const F_Q2 = '202611111300_CAPEX-Q2-STAGES.sql', F_MS = '202611111310_CAPEX-PROPOSED-MEASURES.sql', log = console.log, TODAY = '2026-11-11';
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §CAPEX_PROPOSED_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (n, why) => { inconc++; log('  §CAPEX_PROPOSED_W ' + n + ' INCONCLUSIVE ' + why); };
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql, maxBuffer: 64 << 20 }).toString().trim();
const applyLegacy = (f) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-qtA', '-c', 'set search_path=adempiere', '-f', '-'], { input: fs.readFileSync(path.join(MIGDIR, f), 'utf8') }).toString();
const cents = (v) => Math.round(Number(v) * 100);
const NAMES = ['Concept', 'Initiation', 'Planning', 'Execution', 'Closing'];
const FIXUP = [[9300001, 100, 40, 1000103], [9300002, 50, 30, 1000104], [9300003, 70, 10, null], [9300004, 90, 0, null], [9300005, 60, 20, null]];   // id, planned, spent, stage
const PHASES = [[9310001, 9300001, 20, 'Y'], [9310002, 9300001, 80, 'N'], [9310003, 9300002, 25, 'Y'], [9310004, 9300003, 70, 'N'], [9310005, 9300004, 45, 'Y'], [9310006, 9300005, 30, 'Y']];
const restore = () => psql("DELETE FROM c_projectissue WHERE c_project_id BETWEEN 9300001 AND 9300005; DELETE FROM c_projectphase WHERE c_projectphase_id BETWEEN 9310001 AND 9310006; UPDATE c_order SET c_project_id=NULL WHERE c_order_id IN (104,105,106); DELETE FROM c_project WHERE c_project_id BETWEEN 9300001 AND 9300005;");
const finish = () => { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§CAPEX_PROPOSED_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK || SBREAK ? ' (BREAK switch ON: FAIL expected)' : '')); process.exit(v === 'PASS' ? 0 : 1); };
(async () => {
  try {
    restore();
    // ── legacy: the scripts (idempotent), then the fixture
    applyLegacy(F_Q2); applyLegacy(F_MS);
    const cnt = () => psql("SELECT (SELECT COUNT(*) FROM c_phase WHERE c_projecttype_id=1000100)||'/'||(SELECT COUNT(*) FROM c_projecttype WHERE c_projecttype_id=1000100)||'/'||(SELECT COUNT(*) FROM pa_measure WHERE pa_measure_id BETWEEN 1000040 AND 1000042)||'/'||(SELECT COUNT(*) FROM pa_measurecalc WHERE pa_measurecalc_id BETWEEN 1000040 AND 1000042)");
    const before = cnt(); applyLegacy(F_Q2); applyLegacy(F_MS); const after = cnt();
    ck('S3a applying both scripts a second time changes nothing on legacy (phases/type/measures/calcs)', before === after && before === '5/1/3/3', { before, after });
    psql(FIXUP.map(p => "INSERT INTO c_project (c_project_id,ad_client_id,ad_org_id,createdby,updatedby,value,name,c_currency_id,isactive,processed,plannedamt,projectbalanceamt,c_phase_id) VALUES (" + [p[0], 11, 11, 100, 100, "'WCP-" + p[0] + "'", "'W-CAPEX-PROPOSED " + p[0] + "'", 100, "'Y'", p[0] === 9300005 ? "'Y'" : "'N'", p[1], p[2], p[3] == null ? 'NULL' : p[3]].join(',') + ');').join('\n') +
      PHASES.map(h => "INSERT INTO c_projectphase (c_projectphase_id,ad_client_id,ad_org_id,createdby,updatedby,c_project_id,name,seqno,plannedamt,iscomplete) VALUES (" + [h[0], 11, 11, 100, 100, h[1], "'W-CAPEX-PROPOSED ph'", 10, h[2], "'" + h[3] + "'"].join(',') + ');').join('\n') +
      [[9320001, 9300001, 1], [9320002, 9300001, 2], [9320003, 9300005, 1]].map(i => "INSERT INTO c_projectissue (c_projectissue_id,ad_client_id,ad_org_id,createdby,updatedby,c_project_id,line,m_product_id,m_locator_id,movementdate,movementqty,processed,docstatus) VALUES (" + [i[0], 11, 11, 100, 100, i[1], i[2], 123, 102, "'2026-11-10'", 1, "'Y'", "'CO'"].join(',') + ');').join('\n') +
      "\nUPDATE c_order SET c_project_id=9300001 WHERE c_order_id=104; UPDATE c_order SET c_project_id=9300002 WHERE c_order_id=105;");
    log('§CAPEX_PROPOSED_W fixture committed: projects=' + psql('SELECT COUNT(*) FROM c_project WHERE c_project_id BETWEEN 9300001 AND 9300005') + ' phases=' + psql('SELECT COUNT(*) FROM c_projectphase WHERE c_projectphase_id BETWEEN 9310001 AND 9310006') + ' issues=' + psql('SELECT COUNT(*) FROM c_projectissue WHERE c_project_id BETWEEN 9300001 AND 9300005'));
    const legacyPhases = psql("SELECT name||'|'||seqno||'|'||c_projecttype_id FROM c_phase WHERE c_projecttype_id=1000100 ORDER BY seqno").split('\n');
    const lsql = (id) => psql("SELECT selectclause||' '||whereclause FROM pa_measurecalc WHERE pa_measurecalc_id=" + id);
    const legacyVal = {}; [1000040, 1000041, 1000042].forEach(id => { legacyVal[id] = psql('SELECT ROUND((' + lsql(id).replace(/;\s*$/, '') + ')::numeric,2)'); });
    log('§CAPEX_PROPOSED_W legacy measure values (PostgreSQL, the measure SQL as applied): ' + JSON.stringify(legacyVal));
    // ── twin: seed + the SAME scripts + the fixture rows copied down
    const H = await C.boot(), has = t => !!H.one('SELECT 1 AS x FROM sqlite_master WHERE lower(name)=?', [t]);
    const app = (f) => MA.apply(fs.readFileSync(path.join(MIGDIR, f), 'utf8'), { file: f, run: s => H.db.run(s), convertSql: H.A.convertSql, log: () => {}, has });
    app(F_Q2); app(F_MS);
    if (SBREAK) H.db.run('DELETE FROM c_phase WHERE c_phase_id=1000103');
    const tcnt = () => H.one('SELECT (SELECT COUNT(*) FROM c_phase WHERE c_projecttype_id=1000100) AS ph, (SELECT COUNT(*) FROM c_projecttype WHERE c_projecttype_id=1000100) AS pt, (SELECT COUNT(*) FROM pa_measure WHERE pa_measure_id BETWEEN 1000040 AND 1000042) AS m');
    const tb = JSON.stringify(tcnt()); if (!SBREAK) { app(F_Q2); app(F_MS); } const ta = JSON.stringify(tcnt());
    ck('S3b applying both scripts a second time changes nothing on the twin', tb === ta && ta === '{"ph":5,"pt":1,"m":3}', { before: tb, after: ta });
    const twinPhases = H.q('SELECT name, seqno, c_projecttype_id FROM c_phase WHERE c_projecttype_id=1000100 ORDER BY seqno').map(r => r.name + '|' + r.seqno + '|' + r.c_projecttype_id);
    ck('S1 legacy and twin hold the same five stages, in order (name|SeqNo|type)', JSON.stringify(legacyPhases) === JSON.stringify(twinPhases) && legacyPhases.map(x => x.split('|')[0]).join() === NAMES.join(), { legacy: legacyPhases, twin: twinPhases });
    ['c_project', 'c_projectphase', 'c_order', 'c_projectissue'].forEach(t => {
      const rows = JSON.parse(psql("SELECT COALESCE(json_agg(x),'[]') FROM " + t + " x WHERE ad_client_id=11;") || '[]'), cols = H.q('PRAGMA table_info(' + t + ')').map(c => c.name.toLowerCase());
      H.db.run('DELETE FROM ' + t);
      rows.forEach(r => { const ks = Object.keys(r).filter(k => cols.includes(k)); H.db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(() => '?').join(',') + ')', ks.map(k => { const v = r[k]; return v == null ? null : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'Y' : 'N') : v; })); });
      log('§CAPEX_PROPOSED_DOWN ' + t + '=' + rows.length);
    });
    GE.install(H.db); const CTX = { client: 11, role: 102, today: TODAY, now: TODAY + ' 12:00:00', convertSql: H.A.convertSql }, run = (s, p) => H.db.run(s, p || []), twin = {};
    [1000040, 1000041, 1000042].forEach(id => {
      const m = H.one('SELECT * FROM pa_measure WHERE pa_measure_id=?', [id]); H.save('pa_goal', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: m.name, pa_measure_id: id, pa_colorschema_id: 100, measuretarget: 0, measurescope: '0', seqno: 0, issummary: 'N', relativeweight: 1, charttype: 'BC' });
      const gid = H.lastId('pa_goal'), u = GE.updateGoal(H.q, run, gid, CTX, { force: true }); (u.goals || []).forEach(r => log('    §CAPEX_PROPOSED_TWIN measure=' + id + ' written=' + r.written + ' actual=' + r.actual + (r.reason ? ' reason=' + JSON.stringify(r.reason) : '')));
      twin[id] = H.one('SELECT measureactual AS a FROM pa_goal WHERE pa_goal_id=?', [gid]).a;
    });
    const WANT = { 1000040: 6553.05, 1000041: 60, 1000042: 260 };
    const LBL = { 1000040: 'Q4 contract committed', 1000041: 'Q4 verified cost', 1000042: 'Q3 forecast EAC' };
    [1000040, 1000041, 1000042].forEach(id => {
      let tv = Number(twin[id]); if (BREAK) tv += 1;
      if (twin[id] == null || WANT[id] === 0) { inc(id + ' ' + LBL[id], 'empty population'); return; }
      ck(id + ' ' + LBL[id] + ': the SQL gives the hand-computed value ' + WANT[id].toFixed(2) + ' on legacy (PostgreSQL)', cents(legacyVal[id]) === cents(WANT[id]), { legacy: legacyVal[id], want: WANT[id] });
      ck(id + ' ' + LBL[id] + ': legacy == twin engine', cents(legacyVal[id]) === cents(tv), { legacy: legacyVal[id], twin: tv });
    });
    // ── the page's engine (tiles.js) over legacy's own web-service read, and over the twin's rows
    const cfg = { base: 'http://localhost:8108', login: { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', ClientID: 11, RoleID: 102, OrgID: 11, WarehouseID: 103, stage: 0 } };
    // the test instance may hold other projects (a pushed order for a film, 2026-11-11): the tiles are judged over the FIXTURE projects only
    const isFx = id => Number(id) >= 9300001 && Number(id) <= 9300005, scope = d => Object.assign({}, d, { projects: d.projects.filter(p => isFx(p.C_Project_ID)), phases: (d.phases || []).filter(x => isFx(x.C_Project_ID)), orders: (d.orders || []).filter(o => isFx(o.C_Project_ID)), issues: (d.issues || []).filter(i => isFx(i.C_Project_ID)) });
    const ldata = scope(await Ad.loadLegacy(cfg)), tdata = scope(Ad.fromSqlite(H.db, {}));
    const L = Tl.compute(ldata, { status: 'active', today: TODAY }).tiles, Tw = Tl.compute(tdata, { status: 'active', today: TODAY }).tiles;
    const fc = (T) => T.forecast_cost && T.forecast_cost.cur ? T.forecast_cost.cur['100'] : undefined;
    log('§CAPEX_PROPOSED_W tiles forecast legacy=' + fc(L) + ' twin=' + fc(Tw) + ' (cents) · stage legacy=' + JSON.stringify(L.stage.stages) + ' twin=' + JSON.stringify(Tw.stage.stages));
    ck('Q3 the page tile (tiles.js over the legacy web-service read) == the hand-computed EAC 260.00 and == the measure', fc(L) === 26000 && cents(legacyVal[1000042]) === 26000, { tile: fc(L), measure: legacyVal[1000042] });
    ck('Q3 the page tile on the twin rows == the same', fc(Tw) === 26000, { tile: fc(Tw) });
    ck('Q3 the tile says it is proposed (formula line)', /proposed/i.test(Tl.FORMULA.forecast_cost), Tl.FORMULA.forecast_cost);
    // Q4 page tiles (status all: P5 is closed but counts in the measure): contract 6553.05, verified 60.00, on the legacy WS read and on the twin rows
    const tl = (d) => Tl.flatten(Tl.compute(d, { status: 'all', today: TODAY }).tiles);
    const FL = tl(ldata), FT = tl(tdata);
    log('§CAPEX_PROPOSED_W Q4 tiles legacy contract=' + FL.committed_contract + ' verified=' + FL.committed_verified + ' · twin contract=' + FT.committed_contract + ' verified=' + FT.committed_verified);
    ck('Q4 page tile contract == the measure 6553.05 (legacy read), and the twin rows agree', FL.committed_contract === '100:6553.05' && FT.committed_contract === '100:6553.05', { legacy: FL.committed_contract, twin: FT.committed_contract });
    ck('Q4 page tile verified == the measure 60.00 (legacy read), and the twin rows agree', FL.committed_verified === '100:60.00' && FT.committed_verified === '100:60.00', { legacy: FL.committed_verified, twin: FT.committed_verified });
    const nolt = tl({ projects: ldata.projects, phases: [], unavailable: ['orders', 'issues'] });
    ck('Q4 a server with no read type prints "no data (not installed)", not 0', nolt.committed_contract === 'no data (not installed)' && nolt.committed_verified === 'no data (not installed)', { contract: nolt.committed_contract });
    // S2 stage on the page engine: P1 = Planning, P2 = Execution
    const stL = L.stage.stages || {}, stT = Tw.stage.stages || {};
    ck('S2 a project at stage "Planning" shows it: Stage Planning=1 and Execution=1 on legacy rows, and the same on the twin rows', stL.Planning === 1 && stL.Execution === 1 && stT.Planning === 1 && stT.Execution === 1, { legacy: stL, twin: stT });
    if (!Object.keys(stL).length) inc('S4', 'empty stage population'); else ck('S4 a project with no stage is counted under "(no phase)", not dropped', (stL['(no phase)'] || 0) >= 1, stL);
  } catch (e) { ck('D0 the run', false, String(e && e.stack || e).slice(0, 400)); }
  finally { try { restore(); log('§CAPEX_PROPOSED_W fixture restored: projects left=' + psql('SELECT COUNT(*) FROM c_project WHERE c_project_id BETWEEN 9300001 AND 9300005') + ' POs with a project=' + psql('SELECT COUNT(*) FROM c_order WHERE c_order_id IN (104,105,106) AND c_project_id IS NOT NULL')); } catch (e) { log('§CAPEX_PROPOSED_W restore failed ' + e.message); } }
  finish();
})();
