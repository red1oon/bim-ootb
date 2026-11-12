#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-PROC-HANDOVER (spec prompts/CAPEX_DASHBOARD.md §5.51). READ THE LOG: verdict = §PROC_HANDOVER_VERDICT. ISSUE: "two of the six menu entries (Procurement Risks, Handover) open an empty 'definition pending' card".
// Hand-counted fixture: P1 open POs, P2 over-committed, P3 no-PO, P4 ready, P5 handed over, P6 orders absent -> not installed (never 0), P7 empty population -> INCONCLUSIVE, P8 drill keys == counted projects. PH_BREAK=1: a voided PO counts as open -> P1 FAIL.
'use strict';
const T = require('../tiles.js'); let judged = 0, fails = 0, inc = 0; const log = console.log;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §PROC_HANDOVER ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const pr = (id, v, planned, committed, processed) => ({ C_Project_ID: id, Value: v, Name: v, IsActive: 'Y', Processed: processed || 'N', AD_Org_ID: 1, C_Currency_ID: 100, PlannedAmt: planned, CommittedAmt: committed, ProjectBalanceAmt: '0' });
const ph = (pid, n, done) => ({ C_ProjectPhase_ID: pid * 10 + n, C_Project_ID: pid, Name: 'ph' + n, StartDate: '2026-01-01', EndDate: '2026-02-01', IsComplete: done, PlannedAmt: '10' });
const po = (id, pid, st, amt) => ({ C_Order_ID: id, C_Project_ID: pid, GrandTotal: amt, C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: st });
const data = (orders) => ({ projects: [pr(1, 'A', '1000', '1500'), pr(2, 'B', '1000', '200'), pr(3, 'C', '0', '0'), pr(4, 'D', '500', '0'), pr(5, 'E', '800', '0', 'Y')],
  phases: [ph(1, 1, 'N'), ph(2, 1, 'Y'), ph(2, 2, 'Y'), ph(3, 1, 'Y'), ph(4, 1, 'Y'), ph(4, 2, 'N'), ph(5, 1, 'Y')], orders,
  phaseRef: [], wf: [], currencies: [{ C_Currency_ID: 100, ISO_Code: 'USD', StdPrecision: 2 }], unavailable: [] });
const orders = [po(1, 1, 'DR', '100'), po(2, 1, 'IP', '50'), po(3, 2, 'CO', '70'), po(4, 4, 'VO', '30'), po(5, 4, 'RE', '20'), po(6, 5, 'CL', '10')];
const run = (d, st) => T.compute(d, { org: '', category: '', status: st || 'all', project: '', today: '2026-06-01' });
const R = run(data(orders)), t = R.tiles, D = R.drill;
// hand: open POs = #1 DR 100 + #2 IP 50 (VO, RE, CO, CL are not open) = 2 orders, 150.00 USD; over-committed: A (1500 > 1000) only (B 200<1000; C planned 0; D,E committed 0);
//       no-PO among ACTIVE with planned>0: B has a CO order (so it HAS a PO), A has POs, D has VO/RE orders (it HAS orders), C planned 0 -> none; E closed -> 0 ;
//       ready: active with phases all complete: B (2/2), C (1/1) -> 2; D has 1 open phase, A none complete -> not ready; handed over: E (closed) -> 1
const f = (x) => JSON.stringify(x);
ck('P1 open purchase orders: 2 orders, 150.00 USD (a voided, reversed, completed or closed PO is not open)', t.procurement && t.procurement.openpo && t.procurement.openpo.n === 2 && f(t.procurement.openpo.cur) === f({ '100': 15000 }), t.procurement && f(t.procurement.openpo));
ck('P2 over-committed projects: A only', t.procurement && t.procurement.overcommitted && t.procurement.overcommitted.n === 1 && D['proc:overcommitted'] && D['proc:overcommitted'][0].Value === 'A', t.procurement && f(t.procurement.overcommitted));
ck('P3 budget but nothing ordered: no active project qualifies on this fixture (0)', t.procurement && t.procurement.nopo && t.procurement.nopo.n === 0, t.procurement && f(t.procurement.nopo));
ck('P4 ready for handover: B and C (every phase complete)', t.handover && t.handover.ready === 2 && D['handover:ready'] && D['handover:ready'].map(r => r.Value).sort().join() === 'B,C', t.handover && f(t.handover));
ck('P5 handed over: E (closed)', t.handover && t.handover.done === 1 && D['handover:done'] && D['handover:done'][0].Value === 'E');
const nopo = run(data(orders.filter(o => o.C_Project_ID !== 4 && o.C_Project_ID !== 2))).tiles.procurement;   // B and D lose every order: both have budget and no PO
ck('P3b with B and D un-ordered the no-PO list is B and D', nopo && nopo.nopo.n === 2, nopo && f(nopo.nopo));
const noOrders = run(data(null)).tiles;
ck('P6 orders entity absent -> open POs and no-PO say not installed, never 0', noOrders.procurement && noOrders.procurement.openpo.notinstalled === true && noOrders.procurement.nopo.notinstalled === true && noOrders.procurement.overcommitted.n === 1, noOrders.procurement && f(noOrders.procurement));
const em = run({ projects: [], phases: [], orders: [], phaseRef: [], wf: [], currencies: [], unavailable: [] }).tiles;
if (!em.handover || em.handover.vacuous !== true) ck('P7 empty population is flagged vacuous, not 0', false, em.handover); else { inc++; log('  §PROC_HANDOVER P7 INCONCLUSIVE empty population flagged vacuous (nothing judged), as required'); }
const keys = ['proc:openpo', 'proc:overcommitted', 'proc:nopo', 'handover:ready', 'handover:done'];
ck('P8 the drill has all five keys; open-PO list = the projects holding an open PO (A), count n = orders (2) on projects (1); the other lists == their counts', keys.every(k => D[k]) && D['proc:openpo'].map(r => r.Value).join() === 'A' && t.procurement.openpo.projects === 1 && D['proc:overcommitted'].length === t.procurement.overcommitted.n && D['proc:nopo'].length === t.procurement.nopo.n && D['handover:ready'].length === t.handover.ready && D['handover:done'].length === t.handover.done, keys.map(k => k + '=' + (D[k] ? D[k].length : 'missing')).join(' '));
const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§PROC_HANDOVER_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc); process.exit(v === 'PASS' ? 0 : 1);
