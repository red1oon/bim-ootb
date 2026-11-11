#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-BASIS-DIFFERS (prompts/CAPEX_DASHBOARD.md §5.45). READ THE LOG: §BASIS_VERDICT.
// ISSUE (§5.42 F2): "a Forecast far from Planned with CPI far from 1 is shown as a result, not as a data-basis alarm".
'use strict';
const T = require('../tiles.js'); let judged = 0, fails = 0;
const chk = (n, ok, i) => { judged++; if (!ok) fails++; console.log('  §BASIS ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (i || '')); };
const mk = spent => ({ projects: [{ C_Project_ID: 1, Value: 'P', IsActive: 'Y', Processed: 'N', AD_Org_ID: 1, C_Currency_ID: 100, PlannedAmt: '1000000', ProjectBalanceAmt: spent }],
  phases: [{ C_Project_ID: 1, StartDate: '2026-01-01', EndDate: '2026-02-01', IsComplete: 'Y', PlannedAmt: '500000' }, { C_Project_ID: 1, StartDate: '2026-02-01', EndDate: '2026-12-01', IsComplete: 'N', PlannedAmt: '500000' }] });
const f = s => T.compute(mk(s), { today: '2026-06-01' }).tiles.forecast_cost;
const a = f('528'), b = f('500000');
chk('B1 CPI ~946 -> basisDiffers 1', a.basisDiffers === 1 && a.cur['100'] > 0, JSON.stringify(a));
chk('B2 CPI 1.0 -> not flagged, forecast == budget', b.basisDiffers === 0 && b.cur['100'] === 100000000, JSON.stringify(b));
const fl = T.flatten(T.compute(mk('528'), { today: '2026-06-01' }).tiles);
chk('B3 the compared string carries no flag', JSON.stringify(fl).indexOf('basis') < 0);
const v = fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE'; console.log('§BASIS_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails); process.exit(v === 'PASS' ? 0 : 1);
