// capex/tests/witness_tiles_sum_once.js — W-TILES-SUM-ONCE (spec: prompts/CAPEX_DASHBOARD.md §5.9). Node only.
// ISSUE IT PROVES OR DISPROVES: "a money tile rounds each project to the cent before adding, so it drifts from legacy's SUM" (pa_probe legacy=14989562.481 vs tile 14989562.49).
// Expected values are computed here by hand-written exact arithmetic on the test values, not by tiles.js. Break: BREAK=1 expects the per-row-rounded answer → must FAIL.
'use strict';
const T = require('../tiles.js');
let fails = 0, judged = 0;
const check = (n, ok, d) => { judged++; if (!ok) fails++; console.log('§W_SUM1_ASSERT ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + (d ? ' ' + d : '')); };
const P = (amt, cur) => ({ PlannedAmt: amt, C_Currency_ID: cur });
const BREAK = process.env.BREAK === '1';
// three projects of 0.004 each: exact SUM = 0.012 → 1 cent; per-row rounding = 0+0+0 = 0 cents
let r = T._sumBy([P('0.004', 100), P('0.004', 100), P('0.004', 100)], p => p.PlannedAmt);
check('SUM then round once (3 × 0.004 = 0.012 → 1 cent)', r['100'] === (BREAK ? 0 : 1), 'got=' + r['100']);
// the pilot's own case: 4996320.867 + 4996320.807 + 4996320.807 = 14988962.481 → 1498896248 cents (half away from zero on .481 → .48)
r = T._sumBy([P('4996320.867', 100), P('4996320.807', 100), P('4996320.807', 100)], p => p.PlannedAmt);
check('pilot-shape sum (3 HHS-sized amounts)', r['100'] === 1498896248, 'got=' + r['100']);
// currencies never mixed; NULL / '' skipped (no data, not 0); negatives round half away from zero
r = T._sumBy([P('15139265.66847', 322), P(null, 322), P('', 100), P('-0.005', 100)], p => p.PlannedAmt);
check('per currency, NULL skipped, -0.005 → -1 cent', r['322'] === 1513926567 && r['100'] === -1, JSON.stringify(r));
// numbers as JS numbers (sql.js returns REAL) parse by their decimal text
r = T._sumBy([P(0.1, 100), P(0.2, 100)], p => p.PlannedAmt);
check('JS numbers 0.1 + 0.2 → 30 cents exactly', r['100'] === 30, 'got=' + r['100']);
const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
console.log('§W_SUM1_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + (BREAK ? ' (BREAK=1 — must be FAIL)' : ''));
process.exit(v === 'PASS' ? 0 : 1);
