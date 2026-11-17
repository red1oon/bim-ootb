#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — scope: W-D8, the Time Machine cost donut prices WORK CONTENT, not played duration.
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.9 F8, §Q.9.4 D8. Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: "stretching a bar, or re-ordering elements inside it, changes the
// project cost on the dashboard although the work did not change". Before D8 it did: the donut priced
// rate x (end_ts - start_ts). Claims, one row per rated trade in the REAL rates table:
//   D8-1  an op of the same install seconds costs the same played over 1 day or over 10 days
//   D8-2  that cost equals §HR_COST's own formula: secs / basis x crew_size x rate_per_day
//   D8-3  an op that carries no install seconds falls back to duration pricing AND says so (basis=duration)
//   D8-4  injectGantt writes the element's install seconds onto the op (wiring)
'use strict';
const fs = require('fs'), path = require('path');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
const src = fs.readFileSync(path.join(__dirname, '..', 'tm_dash.js'), 'utf8');
const at = src.search(/^[ \t]*function _dashOpCost\(/m);
if (at < 0) { console.log('  FAIL D8 _dashOpCost not found in tm_dash.js'); console.log('§WITNESS_DASH_COST_IS_WORK pass=0 fail=1 ran=0'); process.exit(1); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', at); i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i + 1; break; } }
const dashOpCost = new Function(src.slice(at, end) + '\nreturn _dashOpCost;')();
const LR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8')).LABOR_RATES;
const basis = LR._productivity_basis_secs || 28800, SECS = 7200, DAY = 86400000;

const rows = Object.keys(LR).filter(k => LR[k] && typeof LR[k] === 'object' && LR[k].rate_per_day).map(t => {
  const p = { resource: t, _secs: SECS };
  const a = dashOpCost(p, 1 * DAY, LR), b = dashOpCost(p, 10 * DAY, LR), old = dashOpCost({ resource: t }, 10 * DAY, LR);
  return { trade: t, costShort: a.cost, costLong: b.cost, basis: a.basis, owner: SECS / basis * (LR[t].crew_size || 1) * LR[t].rate_per_day,
           fallbackBasis: old.basis, fallbackLong: old.cost };
});
let extra = 0;
const gb = fs.readFileSync(path.join(__dirname, '..', 'tm_gantt_build.js'), 'utf8');
const wired = /_secs\s*:\s*el\.installSecs/.test(gb);
console.log((wired ? '  PASS' : '  FAIL') + ' D8-4 injectGantt writes _secs: el.installSecs onto each op'); if (!wired) extra++;

const r = Witness('dash_cost_is_work')
  .population(() => rows)
  .schema({ type: 'object', required: ['trade', 'costShort', 'costLong', 'basis', 'owner', 'fallbackBasis'],
    properties: { trade: { type: 'string', minLength: 1 }, costShort: { type: 'number', exclusiveMinimum: 0 }, costLong: { type: 'number', exclusiveMinimum: 0 },
      basis: { const: 'work' }, owner: { type: 'number', exclusiveMinimum: 0 }, fallbackBasis: { const: 'duration' } } })
  .invariant('D8-1 same work costs the same over 1 day and over 10 days', rs => rs.every(o => o.costShort === o.costLong))
  .invariant('D8-2 cost equals the §HR_COST formula (secs / basis x crew_size x rate_per_day)', rs => rs.every(o => Math.abs(o.costShort - o.owner) < 1e-9))
  .invariant('D8-3 no install seconds on the op -> duration pricing, said aloud', rs => rs.every(o => o.fallbackBasis === 'duration' && o.fallbackLong !== o.costLong))
  .redControl(rs => { if (rs.length) rs[0].costLong = rs[0].costShort * 10; return rs; })   // the pre-D8 behaviour: 10x the days, 10x the cost
  .run();
if (extra) process.exitCode = 1;
console.log('§W_D8 trades=' + rows.length + ' basis=' + basis + 's wiring=' + (wired ? 'ok' : 'MISSING') + ' ' + ((r.fail || extra) ? 'FAIL' : (rows.length ? 'PASS' : 'INCONCLUSIVE')));
