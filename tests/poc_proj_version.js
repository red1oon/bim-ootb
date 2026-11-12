// ⚠ DO NOT REMOVE — W-PROJ-VERSION (bim-compiler docs/BIMtoProject.md §F; bim-ootb prompts/CAPEX_DASHBOARD.md ▶ RESUME T6). READ THE LOG: verdict = §PROJ_VERSION_VERDICT.
// ISSUE it proves/disproves: "a revised model pushed a second time adds nothing (stale rows stay) or overwrites without a trace"; owner 2026-11-11: version-tagged, the old simply replaced (alpha).
// V1 first push -> tag stored, state new. V2 the same model again -> state same, +0 rows anywhere. V3 a CHANGED model (one class quantity changed, one class removed, one added) -> state replaced: ONE project,
//   none of the old rows (the removed class's line is gone), the new class's line exists, PlannedAmt == the new golden, tag differs. V4 push the revised model again -> same, +0. V5 actuals (a Project Issue) on the project ->
//   a further change is REFUSED, the rows stay. V6 the tag is a function of the inputs only (row order does not matter). BREAK=1 passes opts.modelVersion=constant so V3 cannot see the change -> V3 must FAIL.
// Folds into an IN-MEMORY copy of erp/ad_seed.db. Usage: NODE_PATH=<bim-ootb>/node_modules node tests/poc_proj_version.js
'use strict';
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js'), PF = require('../viewer/proj_fold.js');
const ERP = path.join(__dirname, '..', 'erp', 'ad_seed.db'), SR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates', 'sequence_rules.json'), 'utf8'));
const BREAK = process.env.BREAK === '1';
let judged = 0, fails = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; console.log('  §PROJ_VERSION ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i ? ' ' + i : '')); };
const row = (cls, disc, storey, count, unit, qty, rate) => ({ cls, disc, storey, count, unit, qty, rate, cost: Math.round(rate * qty) });
const M1 = [row('IfcWall', 'ARC', 'L1', 10, 'M2', 120.5, 80), row('IfcSlab', 'STR', 'L1', 2, 'M3', 30, 400), row('IfcDoor', 'ARC', 'L1', 4, 'EA', 4, 900)];
const M2 = [row('IfcWall', 'ARC', 'L1', 10, 'M2', 140, 80), row('IfcSlab', 'STR', 'L1', 2, 'M3', 30, 400), row('IfcWindow', 'ARC', 'L1', 6, 'EA', 6, 700)];   // wall qty changed, door gone, window added
(async () => {
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(ERP)), B = 'VERSION_WITNESS';
  const opts = (extra) => Object.assign({ seqRules: SR, packCurrencyISO: 'USD', clientId: 11, orgId: 11, now: '2026-11-12 10:00:00' }, BREAK ? { modelVersion: 'CONST' } : {}, extra || {});
  const cnt = () => ['C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine'].map(t => Number(db.exec('SELECT COUNT(*) FROM ' + t + (t === 'C_Project' ? " WHERE Value='" + B + "'" : ''))[0].values[0][0]));
  const lines = () => (db.exec("SELECT p.Value FROM C_ProjectLine l JOIN M_Product p ON p.M_Product_ID=l.M_Product_ID JOIN C_Project j ON j.C_Project_ID=l.C_Project_ID WHERE j.Value='" + B + "' ORDER BY 1")[0] || { values: [] }).values.map(r => r[0]);
  const nProj = () => Number(db.exec("SELECT COUNT(*) FROM C_Project WHERE Value='" + B + "'")[0].values[0][0]);
  const r1 = PF.foldProjectOrder(db, B, M1, opts()), c1 = cnt();
  ck('V1 first push: tag stored, state new', r1.version && r1.version.state === 'new' && /^[0-9a-f]{12}$/.test(BREAK ? 'aaaaaaaaaaaa' : r1.version.tag) && lines().length === 3, JSON.stringify(r1.version) + ' lines=' + lines());
  const r2 = PF.foldProjectOrder(db, B, M1, opts()), c2 = cnt();
  ck('V2 the same model again: state same, +0 rows (project/phase/task/line)', r2.version.state === 'same' && JSON.stringify(c1) === JSON.stringify(c2) && Object.values(r2.created).every(v => v === 0), JSON.stringify(c1) + ' -> ' + JSON.stringify(c2));
  const r3 = PF.foldProjectOrder(db, B, M2, opts()), L = lines();
  ck('V3 a changed model: state replaced, ONE project, the removed class\'s line is gone, the new class\'s line exists', r3.version.state === 'replaced' && nProj() === 1 && L.indexOf('IfcDoor') < 0 && L.indexOf('IfcWindow') >= 0 && L.length === 3, JSON.stringify(r3.version) + ' lines=' + L);
  const gold = BigInt(Math.round(80 * 140) + Math.round(400 * 30) + Math.round(700 * 6));
  ck('V3b PlannedAmt after the replacement == the new model\'s golden (' + gold + '), not old+new', String(r3.plannedAmt).split('.')[0] === String(gold) || Number(r3.plannedAmt) === Number(gold), 'plannedAmt=' + r3.plannedAmt);
  ck('V3c the tag changed', r3.version.tag !== r1.version.tag && r3.version.previous === r1.version.tag, r1.version.tag + ' -> ' + r3.version.tag);
  const c3 = cnt(), r4 = PF.foldProjectOrder(db, B, M2, opts());
  ck('V4 the revised model pushed again: same, +0', r4.version.state === 'same' && JSON.stringify(c3) === JSON.stringify(cnt()), JSON.stringify(r4.version));
  const pid = r4.projectId;   // the seed holds no C_ProjectIssue table: this in-memory copy gets a minimal one (legacy's, keyed by project) so the refusal path runs; named here, not hidden
  db.run('CREATE TABLE IF NOT EXISTS C_ProjectIssue (C_ProjectIssue_ID INTEGER, C_Project_ID INTEGER)'); db.run('INSERT INTO C_ProjectIssue VALUES (9999901, ?)', [pid]);
  const M3 = M2.concat([row('IfcColumn', 'STR', 'L1', 8, 'EA', 8, 1200)]), r5 = PF.foldProjectOrder(db, B, M3, opts());
  ck('V5 with actuals (a Project Issue) a further change is REFUSED, the rows stay', r5.version.state === 'refused' && JSON.stringify(cnt()) === JSON.stringify(c3) && lines().indexOf('IfcColumn') < 0 && r5.notes.some(n => /VERSION_REPLACE_REFUSED/.test(n)), JSON.stringify(r5.version));
  ck('V6 the tag depends on the inputs only (row order changes nothing)', PF._modelTag(M2.slice().reverse(), null) === PF._modelTag(M2, null) && PF._modelTag(M1, null) !== PF._modelTag(M2, null));
  const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; console.log('§PROJ_VERSION_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails); process.exit(v === 'PASS' ? 0 : 1);
})();
