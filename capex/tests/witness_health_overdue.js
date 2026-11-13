#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-HEALTH-OVERDUE (spec prompts/CAPEX_DASHBOARD.md §5.44). READ THE LOG: verdict = §HEALTH_OVERDUE_VERDICT.
// ISSUE it proves/disproves (§5.42 F3): "Project Health reads Green while a phase is overdue and not complete".
// HEALTH_BREAK=1 restores the old rule (the Health Green / Amber rows of migration G4, before §5.44's overdue term): H1 must FAIL.
// §5.75 step 3: the rule under test is the PA row's SQL (computed through capex/tests/pa_harness.js), no longer the hand formula in tiles.js.
'use strict';
const H = require('./pa_harness.js'); let judged = 0, fails = 0;
(async () => { await H.init();
const chk = (n, ok, i) => { judged++; if (!ok) fails++; console.log('  §HEALTH_OVERDUE ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (i || '')); };
const proj = id => ({ C_Project_ID: id, Value: 'P' + id, IsActive: 'Y', Processed: 'N', AD_Org_ID: 1, C_Currency_ID: 100, PlannedAmt: '1000', ProjectBalanceAmt: '100' });
// A: phase1 due + complete (EV>=PV, CPI>=0.9 -> Green indices); phase2 overdue & incomplete but zero amount keeps indices Green
const ph = (pid, n, end, done, amt) => ({ C_ProjectPhase_ID: pid * 10 + n, C_Project_ID: pid, StartDate: '2026-01-01', EndDate: end, IsComplete: done, PlannedAmt: amt });
const data = { projects: [proj(1), proj(2), proj(3)], phases: [
  ph(1, 1, '2026-02-01', 'Y', '500'), ph(1, 2, '2026-03-01', 'N', '0'),      // overdue incomplete, indices Green
  ph(2, 1, '2026-02-01', 'Y', '500'), ph(2, 2, '2026-03-01', 'Y', '0'),      // same, but ticked
  ph(3, 1, '2026-02-01', 'Y', '500'), ph(3, 2, '2027-03-01', 'N', '0') ] };  // not yet due
// the falsifier: the Green row as it was BEFORE §5.44, i.e. without its last term (NOT EXISTS an overdue incomplete phase): a project with an overdue phase is then counted Green again
let rows = null;
if (process.env.HEALTH_BREAK === '1') { rows = H.rows(); const g = rows.find(r => r.PA_MeasureCalc_UU === H.PT.BIND.green), at = g.WhereClause.lastIndexOf(' AND NOT EXISTS (SELECT 1 FROM C_ProjectPhase');
  if (at < 0) throw new Error('HEALTH_BREAK: the Green row has no overdue term to cut'); g.WhereClause = g.WhereClause.slice(0, at); }
const h = id => H.compute(data, { today: '2026-06-01', project: 'P' + id }, rows ? { rows } : null).tiles.health;
const a = h(1), b = h(2), c = h(3);
chk('H0 population judged (the indices alone would be Green for all three)', [a, b, c].every(x => x.green + x.amber + x.red === 1), JSON.stringify([a, b, c]));
chk('H1 overdue incomplete phase -> Amber, not Green', a.amber === 1 && a.green === 0, JSON.stringify(a));
chk('H2 same project with the phase ticked -> Green', b.green === 1, JSON.stringify(b));
chk('H3 phase not yet due -> Green as before', c.green === 1, JSON.stringify(c));
const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
console.log('§HEALTH_OVERDUE_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§HEALTH_OVERDUE_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
