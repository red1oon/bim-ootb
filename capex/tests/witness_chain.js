#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-CHAIN (spec prompts/CAPEX_DASHBOARD.md §5.59). READ THE LOG: verdict = §CHAIN_VERDICT; 0 rows judged = INCONCLUSIVE.
// ISSUE it proves/disproves: "the supply chain after the purchase order (receipt, vendor invoice, payment) is invisible, or the page shows a chain its rows do not hold; and the glance must not get crowded by it".
// C1 projectDetail().chain == an independent recompute from the raw rows (written here, no tiles.js code) over a fixture with every awkward case · C2 strip counts == the table's stages · C3 an unavailable entity -> chain null and the card
// says "not installed" · C4 real page: the card sits inside the Procurement tab, the glance (tile list + left menu) is unchanged, strip counts == rows · CHAIN_BREAK=1 counts a draft receipt as received and must FAIL C1.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_chain.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), ROOT = path.join(__dirname, '..', '..'), T = require('./pa_harness.js'), BREAK = process.env.CHAIN_BREAK === '1', log = console.log;
(async () => { await require('./pa_harness.js').init({ quiet: true });   // §5.75 step 3: the numbers come from the PA rows (pa_harness.js), not the hand formulas in tiles.js
let judged = 0, fails = 0, inc = 0; const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §CHAIN ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const P = 1, OTHER = 2;
const base = () => ({ source: 'legacy', unavailable: [], projects: [{ C_Project_ID: P, Value: 'CH1', Name: 'Chain', IsActive: 'Y', Processed: 'N', C_Currency_ID: 100, PlannedAmt: '10000', ProjectBalanceAmt: '0' }, { C_Project_ID: OTHER, Value: 'CH2', Name: 'Other', IsActive: 'Y', Processed: 'N', C_Currency_ID: 100, PlannedAmt: '500', ProjectBalanceAmt: '0' }],
  phases: [], tasks: [], lines: [], orgs: [], phaseRef: [], currencies: [{ C_Currency_ID: 100, ISO_Code: 'USD', CurSymbol: '$', StdPrecision: 2 }, { C_Currency_ID: 102, ISO_Code: 'EUR', CurSymbol: 'E', StdPrecision: 2 }], wf: [],
  orders: [ // 11 full chain · 12 draft PO · 13 part paid · 14 paid by invoice link only · 15 received only · 16 ordered only · 17 other-currency invoice · 18 sales order (not a PO) · 21 other project
    { C_Order_ID: 11, C_Project_ID: P, GrandTotal: '1000', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }, { C_Order_ID: 12, C_Project_ID: P, GrandTotal: '200', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'DR' },
    { C_Order_ID: 13, C_Project_ID: P, GrandTotal: '800', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }, { C_Order_ID: 14, C_Project_ID: P, GrandTotal: '600', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' },
    { C_Order_ID: 15, C_Project_ID: P, GrandTotal: '300', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }, { C_Order_ID: 16, C_Project_ID: P, GrandTotal: '100', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' },
    { C_Order_ID: 17, C_Project_ID: P, GrandTotal: '400', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }, { C_Order_ID: 18, C_Project_ID: P, GrandTotal: '90', C_Currency_ID: 100, IsSOTrx: 'Y', DocStatus: 'CO' },
    { C_Order_ID: 21, C_Project_ID: OTHER, GrandTotal: '50', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }],
  issues: [],
  receipts: [{ M_InOut_ID: 1, C_Project_ID: P, C_Order_ID: 11, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-02' }, { M_InOut_ID: 2, C_Project_ID: P, C_Order_ID: 11, IsSOTrx: 'N', DocStatus: 'CL', MovementDate: '2026-11-03' },
    { M_InOut_ID: 3, C_Project_ID: P, C_Order_ID: 12, IsSOTrx: 'N', DocStatus: 'DR', MovementDate: '2026-11-03' }, { M_InOut_ID: 4, C_Project_ID: P, C_Order_ID: 13, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-04' },
    { M_InOut_ID: 5, C_Project_ID: P, C_Order_ID: 14, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-04' }, { M_InOut_ID: 6, C_Project_ID: P, C_Order_ID: 15, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-05' },
    { M_InOut_ID: 7, C_Project_ID: P, C_Order_ID: 15, IsSOTrx: 'N', DocStatus: 'DR', MovementDate: '2026-11-05' }, { M_InOut_ID: 8, C_Project_ID: P, C_Order_ID: null, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-06' },
    { M_InOut_ID: 9, C_Project_ID: P, C_Order_ID: 17, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-06' }, { M_InOut_ID: 10, C_Project_ID: P, C_Order_ID: 18, IsSOTrx: 'Y', DocStatus: 'CO', MovementDate: '2026-11-06' },
    { M_InOut_ID: 11, C_Project_ID: OTHER, C_Order_ID: 21, IsSOTrx: 'N', DocStatus: 'CO', MovementDate: '2026-11-06' }],
  vinvoices: [{ C_Invoice_ID: 1, C_Project_ID: P, C_Order_ID: 11, GrandTotal: '1000', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }, { C_Invoice_ID: 2, C_Project_ID: P, C_Order_ID: 13, GrandTotal: '800', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' },
    { C_Invoice_ID: 3, C_Project_ID: P, C_Order_ID: 14, GrandTotal: '600', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }, { C_Invoice_ID: 4, C_Project_ID: P, C_Order_ID: 17, GrandTotal: '350', C_Currency_ID: 102, IsSOTrx: 'N', DocStatus: 'CO' },
    { C_Invoice_ID: 5, C_Project_ID: P, C_Order_ID: 16, GrandTotal: '100', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'DR' }, { C_Invoice_ID: 6, C_Project_ID: P, C_Order_ID: null, GrandTotal: '77', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' },
    { C_Invoice_ID: 7, C_Project_ID: P, C_Order_ID: 11, GrandTotal: '55', C_Currency_ID: 100, IsSOTrx: 'Y', DocStatus: 'CO' }, { C_Invoice_ID: 8, C_Project_ID: OTHER, C_Order_ID: 21, GrandTotal: '50', C_Currency_ID: 100, IsSOTrx: 'N', DocStatus: 'CO' }],
  payments: [{ C_Payment_ID: 1, C_Project_ID: P, C_Order_ID: 11, C_Invoice_ID: 1, PayAmt: '1000', C_Currency_ID: 100, IsReceipt: 'N', DocStatus: 'CO' }, { C_Payment_ID: 2, C_Project_ID: P, C_Order_ID: 13, C_Invoice_ID: 2, PayAmt: '300', C_Currency_ID: 100, IsReceipt: 'N', DocStatus: 'CO' },
    { C_Payment_ID: 3, C_Project_ID: P, C_Order_ID: null, C_Invoice_ID: 3, PayAmt: '600', C_Currency_ID: 100, IsReceipt: 'N', DocStatus: 'CO' }, { C_Payment_ID: 4, C_Project_ID: P, C_Order_ID: 13, C_Invoice_ID: 2, PayAmt: '50', C_Currency_ID: 100, IsReceipt: 'N', DocStatus: 'DR' },
    { C_Payment_ID: 5, C_Project_ID: P, C_Order_ID: 11, C_Invoice_ID: null, PayAmt: '999', C_Currency_ID: 100, IsReceipt: 'Y', DocStatus: 'CO' }, { C_Payment_ID: 6, C_Project_ID: P, C_Order_ID: null, C_Invoice_ID: null, PayAmt: '40', C_Currency_ID: 100, IsReceipt: 'N', DocStatus: 'CO' },
    { C_Payment_ID: 7, C_Project_ID: OTHER, C_Order_ID: 21, C_Invoice_ID: 8, PayAmt: '50', C_Currency_ID: 100, IsReceipt: 'N', DocStatus: 'CO' }] });
// independent recompute (map based; the only shared thing is the written definition in §5.59)
function indep(d, proj) {
  const done = s => s === 'CO' || s === 'CL', n = x => Number(x) || 0, byId = {}; (d.orders || []).forEach(o => { byId[o.C_Order_ID] = o; });
  const pos = d.orders.filter(o => o.C_Project_ID === proj && o.IsSOTrx === 'N');
  const invs = d.vinvoices.filter(i => i.C_Project_ID === proj && i.IsSOTrx === 'N' && done(i.DocStatus)), pays = d.payments.filter(p => p.C_Project_ID === proj && p.IsReceipt === 'N' && done(p.DocStatus)), recs = d.receipts.filter(r => r.C_Project_ID === proj && r.IsSOTrx === 'N' && (BREAK ? true : done(r.DocStatus)));
  const rows = pos.map(o => {
    const my = invs.filter(i => i.C_Order_ID === o.C_Order_ID), same = my.filter(i => i.C_Currency_ID === o.C_Currency_ID), oc = my.length - same.length, invoiced = same.reduce((a, i) => a + n(i.GrandTotal), 0), ids = new Set(my.map(i => i.C_Invoice_ID));
    const mp = pays.filter(p => p.C_Order_ID === o.C_Order_ID || (p.C_Invoice_ID != null && ids.has(p.C_Invoice_ID))), ps = mp.filter(p => p.C_Currency_ID === o.C_Currency_ID), paid = ps.reduce((a, p) => a + n(p.PayAmt), 0), received = recs.filter(r => r.C_Order_ID === o.C_Order_ID).length;
    const stage = !done(o.DocStatus) ? 'unfinished' : invoiced > 0 ? (paid >= invoiced ? 'paid' : 'invoiced') : received > 0 ? 'received' : 'ordered';
    return { order: o.C_Order_ID, received, invoiced, paid, stage, otherCur: oc + (mp.length - ps.length) };
  });
  const strip = { ordered: 0, received: 0, invoiced: 0, paid: 0 }; rows.forEach(r => { if (strip[r.stage] != null) strip[r.stage]++; });
  const linkedOrder = new Set(pos.map(o => o.C_Order_ID)), invIds = new Set(invs.filter(i => linkedOrder.has(i.C_Order_ID)).map(i => i.C_Invoice_ID));
  return { rows, strip, unlinked: { receipts: recs.filter(r => !linkedOrder.has(r.C_Order_ID)).length, invoices: invs.filter(i => !linkedOrder.has(i.C_Order_ID)).length, payments: pays.filter(p => !linkedOrder.has(p.C_Order_ID) && !(p.C_Invoice_ID != null && invIds.has(p.C_Invoice_ID))).length } };
}
(async () => {
  const d = base(), det = T.projectDetail(d, { today: '2026-11-12' }, P), ex = indep(d, P);
  if (!det || !det.chain) { ck('C1 projectDetail().chain exists', false, det ? 'chain=' + det.chain : 'no detail'); }
  else {
    const g = det.chain, key = r => [r.order, r.received, r.invoiced, r.paid, r.stage, r.otherCur].join('|');
    ck('C1 ' + ex.rows.length + ' PO rows == the independent recompute (order, received, invoiced, paid, stage, otherCur)', g.rows.map(key).sort().join(';') === ex.rows.map(key).sort().join(';'), { got: g.rows.map(key), want: ex.rows.map(key) });
    ck('C1b unlinked receipts/invoices/payments == recompute', JSON.stringify(g.unlinked) === JSON.stringify(ex.unlinked), { got: g.unlinked, want: ex.unlinked });
    ck('C2 strip ' + JSON.stringify(g.strip) + ' == the table\'s stages', JSON.stringify(g.strip) === JSON.stringify(ex.strip));
    ck('C1c the sales order and the other project\'s order are not in the chain', g.rows.every(r => r.order !== 18 && r.order !== 21));
  }
  const d3 = base(); d3.unavailable = ['receipts']; d3.receipts = []; const det3 = T.projectDetail(d3, { today: '2026-11-12' }, P);
  ck('C3 an unavailable entity -> chain null (never zeros)', det3 && det3.chain === null);
  const d4 = base(); delete d4.receipts; delete d4.vinvoices; delete d4.payments; const det4 = T.projectDetail(d4, { today: '2026-11-12' }, P); ck('C3b entities absent from the data -> chain null', det4 && det4.chain === null);
  // C4 real page
  let pw = null; try { pw = require('/home/red1/bim-ootb/tests/node_modules/playwright'); } catch (e) { }
  if (!pw) { inc++; log('  §CHAIN INCONCLUSIVE C4 playwright missing'); }
  else {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    const srv = http.createServer((rq, rs) => { const u = rq.url.split('?')[0]; if (u.endsWith('/__snap.json')) { rs.writeHead(200, { 'Content-Type': 'application/json' }); return rs.end(JSON.stringify(base())); }
      fs.readFile(path.join(ROOT, decodeURIComponent(u)), (e, b) => { if (e) { rs.writeHead(404); return rs.end('404'); } rs.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); rs.end(b); }); });
    await new Promise(r => srv.listen(0, r)); const br = await pw.chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), errs = [];
    try {
      const pg = await (await br.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(String(e))); const url = 'http://localhost:' + srv.address().port + '/capex/index.html?snapshot=__snap.json&source=legacy&today=2026-11-12';
      await pg.goto(url, { waitUntil: 'load' }); await pg.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await pg.waitForTimeout(400);
      const glance = await pg.$$eval('#view [data-tile], #view [data-chain]', e => e.map(x => (x.getAttribute('data-tile') || '') + (x.hasAttribute('data-chain') ? 'CHAIN' : ''))), menu = await pg.$$eval('nav [data-view], .menu [data-view], [data-view]', e => e.map(x => x.getAttribute('data-view')));
      ck('C4a the glance has no chain element (' + glance.length + ' tiles) and no new menu item (' + menu.join(',') + ')', !glance.some(x => /CHAIN/.test(x)) && !menu.some(x => /chain|receipt|payment/i.test(x)), { glance, menu });
      await pg.goto(url + '#project/' + P + '/procurement', { waitUntil: 'load' }); await pg.waitForFunction(() => window.__capex && window.__capex.rendered, null, { timeout: 30000 }); await pg.waitForTimeout(500);
      const inTab = await pg.$$eval('#view [data-chain]', e => e.map(x => !!x.closest('[data-pane="procurement"], #panel-procurement, [data-panel="procurement"]'))), rows = await pg.$$eval('#view [data-chain] tr[data-order]', e => e.map(x => [x.getAttribute('data-order'), x.getAttribute('data-stage')].join('|'))), strip = await pg.$$eval('#view [data-chain] [data-strip]', e => e.map(x => x.getAttribute('data-strip') + '=' + x.getAttribute('data-count')));
      ck('C4b the card is inside the Procurement tab', inTab.length === 1 && inTab[0] === true, inTab);
      ck('C4c page rows == the recompute (' + ex.rows.length + ') and strip == ' + JSON.stringify(ex.strip), rows.slice().sort().join(';') === ex.rows.map(r => r.order + '|' + r.stage).sort().join(';') && strip.slice().sort().join(';') === Object.keys(ex.strip).map(k => k + '=' + ex.strip[k]).sort().join(';'), { rows, strip });
      const hrefs = await pg.$$eval('#view [data-chain] a[data-doc]', e => e.map(x => [x.getAttribute('data-doc'), x.getAttribute('data-id'), x.getAttribute('href')])), nDocs = ex.rows.length + ex.rows.reduce((a, r) => a + r.received, 0);
      const want = []; d.orders.filter(o => o.C_Project_ID === P && o.IsSOTrx === 'N').forEach(o => want.push('C_Order|' + o.C_Order_ID));
      const re = hrefs.filter(h => /\?Action=Zoom&TableName=[A-Za-z_]+&Record_ID=\d+$/.test(h[2]) && h[2].indexOf('TableName=' + h[0] + '&Record_ID=' + h[1]) > 0);
      ck('C5 every document in the card opens its record in legacy by URL (Action=Zoom&TableName=<its table>&Record_ID=<its id>): ' + hrefs.length + ' links, ' + re.length + ' well formed', hrefs.length > 0 && re.length === hrefs.length && want.every(w => hrefs.some(h => h[0] + '|' + h[1] === w)) && ['M_InOut', 'C_Invoice', 'C_Payment'].every(t => hrefs.some(h => h[0] === t)), { hrefs: hrefs.length });
      ck('C4d no page error', errs.length === 0, errs);
    } finally { await br.close(); srv.close(); }
  }
  const v = fails ? 'FAIL' : (judged && !inc) ? 'PASS' : 'INCONCLUSIVE'; log('§CHAIN_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK)' : '')); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { console.error('§CHAIN_ERROR ' + (e && e.stack || e)); process.exit(2); });

})().catch(function (e) { console.log('§PA_HARNESS_CRASH ' + (e && e.stack || e)); process.exit(1); });