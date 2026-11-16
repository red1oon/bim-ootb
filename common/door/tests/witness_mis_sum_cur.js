// ⚠ DO NOT REMOVE — W-MIS-SUM-CUR (bim-compiler prompts/CLI_ERP_IVR.md §35: mis.sum never adds two currencies; owner 2026-11-17 "Per currency"). READ THE LOG; an exit code is not evidence.
//   C1 ISSUE (a money sum adds MYR to USD: 64720079 for the seed's projects) · C2 ISSUE (one currency loses its total or its name) · C3 ISSUE (a non-money number column is split by currency)
//   C4 ISSUE (an Order total mixes currencies; a role that sees one currency gets no plain total). Expected values: an independent per-currency BigInt sum over the seed (sqlite3), never the verb's own.
//   Falsifier: SUM_BREAK=mixcur (the plain SUM) must FAIL C1 and C4. Each claim can say VACUOUS.
'use strict';
const path = require('path'), cp = require('child_process');
const { kit, tmp, run, ROOT, DOOR } = require('./_kit');
const k = kit('W-MIS-SUM-CUR');
(async () => {
  const dir = path.dirname(tmp('msc_')), SEED = path.join(ROOT, 'erp/ad_seed.db');
  const env = { BIM_OBJECT_OPLOG: path.join(dir, 'ops.jsonl'), BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl') }; if (process.env.SUM_BREAK) env.SUM_BREAK = process.env.SUM_BREAK;
  const door = (line) => run(DOOR, ['--actor', 'human', line], env).then(r => { try { return JSON.parse(r.out); } catch (x) { return { status: 'unparseable', why: String(r.out).slice(0, 160) }; } });
  const sq = (q) => JSON.parse(cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, q], { encoding: 'utf8' }).stdout || '[]');
  // exact decimal sum as a string, BigInt at 1e-9 (independent of object_cli decSum)
  const dsum = (vs) => { let t = 0n; vs.forEach(v => { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v)); const b = BigInt(m[2] + ((m[3] || '') + '000000000').slice(0, 9)); t += m[1] ? -b : b; }); const neg = t < 0n; let a = (neg ? -t : t).toString().padStart(10, '0'); let i = a.slice(0, -9), f = a.slice(-9).replace(/0+$/, ''); return (neg ? '-' : '') + i + (f ? '.' + f : ''); };
  const eqDec = (a, b) => dsum([a]) === dsum([b]);
  const per = (table, col, where) => { const g = {}; sq('SELECT CAST(c_currency_id AS TEXT) AS c, CAST(' + col + ' AS TEXT) AS v FROM ' + table + ' WHERE ' + col + ' IS NOT NULL' + (where ? ' AND ' + where : '')).forEach(r => { (g[r.c] = g[r.c] || []).push(r.v); }); return Object.keys(g).map(c => ({ c: Number(c), n: g[c].length, s: dsum(g[c]) })).sort((x, y) => x.c - y.c); };
  const same = (got, want) => !!got && got.length === want.length && want.every((w, i) => got[i].currency === w.c && got[i].n === w.n && eqDec(got[i].sum, w.s));

  const p = per('c_project', 'plannedamt'), a1 = await door('mis.sum kind=Project column=PlannedAmt');
  k.L('C1 independent: ' + JSON.stringify(p) + ' | door: sum=' + (a1.answer && a1.answer.sum) + ' byCurrency=' + JSON.stringify(a1.answer && a1.answer.byCurrency) + ' | "' + (a1.answer && a1.answer.summary) + '"');
  if (p.length < 2) k.incon('C1', 'VACUOUS: the seed\'s projects hold one currency');
  else k.chk('C1 Project PlannedAmt over ' + p.length + ' currencies: no single total, one exact sum per currency, the summary says they are not added', a1.status === 'ok' && a1.answer.sum === null && same(a1.answer.byCurrency, p) && /not added/.test(a1.answer.summary), 'sum=' + (a1.answer && a1.answer.sum));

  const myr = p.filter(x => x.c === 301)[0], a2 = await door('mis.sum kind=Project column=PlannedAmt C_Currency_ID=301');
  if (!myr) k.incon('C2', 'VACUOUS: no MYR project');
  else k.chk('C2 one currency (C_Currency_ID=301): the plain total == the independent MYR sum ' + myr.s + ', named MYR', a2.status === 'ok' && eqDec(a2.answer.sum, myr.s) && a2.answer.currency === 'MYR' && !a2.answer.byCurrency, 'sum=' + (a2.answer && a2.answer.sum) + ' currency=' + (a2.answer && a2.answer.currency));

  const q = dsum(sq('SELECT CAST(plannedqty AS TEXT) AS v FROM c_project WHERE plannedqty IS NOT NULL').map(r => r.v)), a3 = await door('mis.sum kind=Project column=PlannedQty');
  k.chk('C3 a Quantity column over the same mixed-currency rows sums as before: one total ' + q, a3.status === 'ok' && eqDec(a3.answer.sum, q) && !a3.answer.byCurrency, 'sum=' + (a3.answer && a3.answer.sum));

  const o = per('c_order', 'grandtotal'), a4 = await door('mis.sum kind=Order column=GrandTotal');
  const o12 = per('c_order', 'grandtotal', 'ad_client_id IN (0,12)'), a5 = await door('mis.sum kind=Order column=GrandTotal role=12000');
  k.L('C4 independent all: ' + JSON.stringify(o) + ' | role 12000 (client 12): ' + JSON.stringify(o12) + ' | door: ' + JSON.stringify(a4.answer && a4.answer.byCurrency) + ' / ' + (a5.answer && a5.answer.sum) + ' ' + (a5.answer && a5.answer.currency));
  if (o.length < 2 || o12.length !== 1) k.incon('C4', 'VACUOUS: orders hold one currency, or client 12 holds more than one');
  else k.chk('C4 Order GrandTotal: per currency == independent over ' + o.length + ' currencies; under role 12000 (one currency) a single total == ' + o12[0].s, a4.status === 'ok' && a4.answer.sum === null && same(a4.answer.byCurrency, o) && a5.status === 'ok' && eqDec(a5.answer.sum, o12[0].s) && !a5.answer.byCurrency, 'all sum=' + (a4.answer && a4.answer.sum) + ' role sum=' + (a5.answer && a5.answer.sum));
  k.end();
})().catch(e => { console.log('§W-MIS-SUM-CUR ERROR ' + (e && e.stack || e)); process.exit(2); });
