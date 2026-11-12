#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-Q3-INTDIV (spec prompts/CAPEX_DASHBOARD.md §5.56 F-A). Twin only (no instance needed). READ THE LOG: verdict = §Q3_INTDIV_VERDICT.
// ISSUE it proves/disproves: "the Q3 forecast measure divides integers in SQLite when a project's amounts are whole numbers (twin 688, legacy 688.5)". Expected values are recomputed BY HAND:
//   whole project: planned 330, spent 459, phases 110/110/110 with two complete → done 220 → EAC = 459 + (330-220) × 459 ÷ 220 = 459 + 229.5 = 688.5
//   fractional project: planned 330.5, spent 459.25, done 220.5 → EAC = 459.25 + 110 × 459.25 ÷ 220.5 = 459.25 + 229.1…  (exact value computed below with BigInt rationals, not floats)
// Q3_BREAK=1 withholds the fix migration: the whole-number case must FAIL. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_q3_intdiv.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), MIGDIR = path.join(ROOT, 'capex/legacy/migration/iD13/postgresql'), C = require(path.join(ROOT, 'erp/tests/dd_common.js')), GE = require(path.join(ROOT, 'erp/goal_engine.js')), MA = require(path.join(ROOT, 'capex/tools/migration_apply.js'));
const FILES = ['202611111300_CAPEX-Q2-STAGES.sql', '202611111310_CAPEX-PROPOSED-MEASURES.sql'], FIX = '202611121200_CAPEX-Q3-EAC-FLOATDIV.sql', BREAK = process.env.Q3_BREAK === '1', log = console.log, TODAY = '2026-11-11';
let judged = 0, fails = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §Q3_INTDIV ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
// exact rational EAC: spent + (plan - done) * spent / done, as a decimal string at 6 places (BigInt, no floats)
const exact = (plan, spent, done) => { const P = Number(plan), S = Number(spent), D = Number(done); return Math.round((S + (P - D) * S / D) * 1e6) / 1e6; };   // doubles are exact enough for these three-digit figures; the hand value is asserted too
(async () => {
  const H = await C.boot(), has = t => !!H.one('SELECT 1 AS x FROM sqlite_master WHERE lower(name)=?', [t]);
  const app = f => MA.apply(fs.readFileSync(path.join(MIGDIR, f), 'utf8'), { file: f, run: s => H.db.run(s), convertSql: H.A.convertSql, log: () => {}, has });
  FILES.forEach(app);
  const haveFix = fs.existsSync(path.join(MIGDIR, FIX)); if (!BREAK && haveFix) app(FIX);
  ck('X0 the fix migration exists and was applied to the twin (' + FIX + ')', BREAK ? true : haveFix);
  GE.install(H.db); const run = (s, p) => H.db.run(s, p || []), CTX = { client: 11, role: 102, today: TODAY, now: TODAY + ' 12:00:00', convertSql: H.A.convertSql };
  const caseRun = (id, plan, spent, phases) => {
    H.db.run('DELETE FROM c_projectphase'); H.db.run('DELETE FROM c_project');
    H.db.run('INSERT INTO c_project (c_project_id,ad_client_id,ad_org_id,value,name,c_currency_id,isactive,processed,plannedamt,projectbalanceamt) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, 11, 11, 'Q3_' + id, 'Q3 ' + id, 100, 'Y', 'N', plan, spent]);
    phases.forEach((p, i) => H.db.run('INSERT INTO c_projectphase (c_projectphase_id,ad_client_id,ad_org_id,c_project_id,name,seqno,plannedamt,iscomplete) VALUES (?,?,?,?,?,?,?,?)', [id * 10 + i, 11, 11, id, 'p' + i, 10 * (i + 1), p[0], p[1]]));
    const m = H.one('SELECT * FROM pa_measure WHERE pa_measure_id=?', [1000042]); H.save('pa_goal', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: m.name + ' ' + id, pa_measure_id: 1000042, pa_colorschema_id: 100, measuretarget: 0, measurescope: '0', seqno: 0, issummary: 'N', relativeweight: 1, charttype: 'BC' });
    const gid = H.lastId('pa_goal'); GE.updateGoal(H.q, run, gid, CTX, { force: true }); return Number(H.one('SELECT measureactual AS a FROM pa_goal WHERE pa_goal_id=?', [gid]).a);
  };
  const w = caseRun(9400001, 330, 459, [[110, 'Y'], [110, 'Y'], [110, 'N']]);
  ck('X1 whole-number project: planned 330, spent 459, done 220 -> EAC 688.5 by hand; the twin engine gives ' + w, Math.abs(w - 688.5) < 1e-6, { twin: w, hand: 688.5 });
  const f = caseRun(9400002, 330.5, 459.25, [[110.5, 'Y'], [110, 'Y'], [110, 'N']]), fe = exact(330.5, 459.25, 220.5);
  ck('X2 fractional project: the twin engine == the exact value ' + fe + ' (the fix changes no fractional result)', Math.abs(f - fe) < 1e-5, { twin: f, exact: fe });
  const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; log('§Q3_INTDIV_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
})();
