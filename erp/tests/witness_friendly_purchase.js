// ⚠ DO NOT REMOVE — W-FRIENDLY-PURCHASE (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §44). READ THE LOG; exit code is not evidence.
// W-PLUGIN-ROLE: this install/start/stop is SETUP, not the behaviour under test - done through reg.system (the host's own boot-restore path; a real user's bundle was installed earlier by the System Administrator). Who may write is judged in witness_plugin_role.js.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.FR_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let DBG = [], PGX = null; let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 220) : '')); };


// ISSUE it proves/disproves: with the Friendly plugin active, a COMPLETED Purchase Order carries Receive and Create Bill as toolbar buttons (dictionary rows); Receive books a completed Material Receipt of
//   the open lines (M_MatchPO, QtyDelivered, on-hand, balanced Fact_Acct), Create Bill books a completed vendor invoice linked to the receipt lines (M_MatchInv, QtyInvoiced, balanced Fact_Acct);
//   each button disappears once its work is done; plugin off = no buttons; Stop removes the rows. INCONCLUSIVE (never PASS) when no PO reaches CO.
// Run: [FR_BREAK=nolines|nosql] node erp/tests/witness_friendly_purchase.js > <log>
async function gearItems(pg) { const on = await pg.$eval('#idmp-toolbar [data-tb="process"]', e => !e.disabled).catch(() => false); if (!on) return []; await pg.click('#idmp-toolbar [data-tb="process"]'); await pg.waitForSelector('#idmp-proc-ov', { timeout: 5000 }).catch(() => {}); const r = await pg.$$eval('#idmp-proc-ov [data-tbb]', e => e.map(x => x.getAttribute('data-tbb'))); await pg.evaluate(() => { const o = document.getElementById('idmp-proc-ov'); if (o) o.remove(); }); return r; }   // 2026-10-17 §45: process shortcuts live in the gear (Process) popup
async function run(base, browser, lens) {
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = []; DBG = logs; PGX = pg; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  for (const n of ['erp_cache', 'fold_plugins']) await pg.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
  await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  if (lens) await pg.evaluate(async (a) => { if (a.brk === 'nolines') globalThis.__FOPS_BREAK = 'nolines'; if (a.brk === 'nosql') window.__frBreak = 'nosql'; const r = window.PluginEngine._reg().system; await r.installBundle(a.u); await r.startBundle('org.kernel.friendly-ops'); }, { u: base + '/plugins/friendly_ops.mjs', brk: BREAK });
  const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(450); };
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const pick = async (col, re) => { const o = (await pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', x => x.map(y => ({ v: y.value, t: y.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col); await pg.selectOption(F(col, 'select'), o.v); await pg.waitForTimeout(700); };
  const mid = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=181 AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); });
  const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
  for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]');
  const NEWB = '#idmp-toolbar [data-tb="new"]'; await pg.waitForSelector(NEWB); await pg.waitForTimeout(800);
  await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  await pick('c_doctypetarget_id', /^Purchase Order/); await pick('c_bpartner_id', /Seed Farm/); await pick('ad_org_id', /^HQ/);
  await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · C_OrderLine"]'); await pg.waitForTimeout(1200); await hc(NEWB); await pg.waitForTimeout(900);
  await pick('m_product_id', /Mulch/);
  await pg.fill(F('qtyentered'), '5'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
  await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000);
  await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
  const bars = async () => (await gearItems(pg)).filter(c => /^FO_Order_/.test(c));
  const gearClick = async (comp) => { await hc('#idmp-toolbar [data-tb="process"]'); await hc('#idmp-proc-ov [data-tbb="' + comp + '"]'); };
  const po = (await tip("SELECT c_order_id AS i, docstatus AS s, issotrx AS t FROM c_order WHERE c_order_id < 0 ORDER BY c_order_id DESC LIMIT 1"))[0];
  const R = { lens, po, bar0: await bars(), steps: {} };
  if (!lens || !po || po.s !== 'CO') return R;
  const onhand = async () => Number(((await tip("SELECT COALESCE(SUM(s.qtyonhand),0) AS q FROM m_storageonhand s JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE s.m_product_id=(SELECT m_product_id FROM c_orderline WHERE c_order_id=" + po.i + " LIMIT 1) AND l.m_warehouse_id=(SELECT m_warehouse_id FROM c_order WHERE c_order_id=" + po.i + ")"))[0] || {}).q || 0);
  const fact = async (tbl, id) => (await tip("SELECT COUNT(*) AS n, COALESCE(SUM(amtacctdr),0) AS d, COALESCE(SUM(amtacctcr),0) AS c FROM fact_acct WHERE ad_table_id=" + tbl + " AND record_id=" + id))[0];
  const oh0 = await onhand();
  // Receive
  const from1 = logs.length; await gearClick('FO_Order_Receive'); await pg.waitForTimeout(7000);
  const okb1 = await pg.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 15000 }).then(() => true, () => false); if (okb1) { await hc('#idmp-procdlg [data-procdlg-ok]'); await pg.waitForTimeout(1500); }
  const rcpt = await tip("SELECT m_inout_id AS id, docstatus AS s, movementtype AS m, c_order_id AS o FROM m_inout WHERE m_inout_id < 0 AND c_order_id=" + po.i);
  const rl = rcpt[0] ? await tip("SELECT m_inoutline_id AS id, movementqty AS q, c_orderline_id AS ol FROM m_inoutline WHERE m_inout_id=" + rcpt[0].id) : [];
  R.steps.recv = { log: logs.slice(from1).filter(l => /§AD-PROC-LIVE proc=53403 .*dispatched=/.test(l)).pop() || '', rcpt, rl, bar: await bars(),
    delivered: Number(((await tip("SELECT SUM(qtydelivered) AS d FROM c_orderline WHERE c_order_id=" + po.i))[0] || {}).d), mpo: Number(((await tip("SELECT COUNT(*) AS n FROM m_matchpo WHERE m_matchpo_id < 0"))[0] || {}).n),
    dOnhand: (await onhand()) - oh0, fact: rcpt[0] ? await fact(319, rcpt[0].id) : null };
  // Create Bill
  const from2 = logs.length; if (R.steps.recv.bar.includes('FO_Order_Bill')) { await gearClick('FO_Order_Bill'); await pg.waitForTimeout(7000);
    const okb2 = await pg.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 15000 }).then(() => true, () => false); if (okb2) { await hc('#idmp-procdlg [data-procdlg-ok]'); await pg.waitForTimeout(1500); } }
  R.billLog = logs.slice(from2).filter(l => /POST|FACT|DOCACTION|MODEL-NAMED|PROC-|INVOICE|COMMIT/i.test(l)).slice(0, 40).map(l => l.slice(0, 240));
  const inv = await tip("SELECT c_invoice_id AS id, docstatus AS s, c_order_id AS o, grandtotal AS g, issotrx AS t FROM c_invoice WHERE c_invoice_id < 0 AND c_order_id=" + po.i);
  const il = inv[0] ? await tip("SELECT c_invoiceline_id AS id, qtyinvoiced AS q, m_inoutline_id AS iol FROM c_invoiceline WHERE c_invoice_id=" + inv[0].id) : [];
  R.steps.bill = { log: logs.slice(from2).filter(l => /§AD-PROC-LIVE proc=53404 .*dispatched=/.test(l)).pop() || '', inv, il, bar: await bars(),
    mi: Number(((await tip("SELECT COUNT(*) AS n FROM m_matchinv WHERE m_matchinv_id < 0"))[0] || {}).n), fact: inv[0] ? await fact(318, inv[0].id) : null,
    invoiced: Number(((await tip("SELECT SUM(qtyinvoiced) AS d FROM c_orderline WHERE c_order_id=" + po.i))[0] || {}).d),
    mpoLinked: Number(((await tip("SELECT COUNT(*) AS n FROM m_matchpo WHERE c_orderline_id IN (SELECT c_orderline_id FROM c_orderline WHERE c_order_id=" + po.i + ") AND c_invoiceline_id IS NOT NULL AND m_inoutline_id IS NOT NULL"))[0] || {}).n),
    miN: Number(((await tip("SELECT COUNT(*) AS n FROM m_matchinv WHERE c_invoiceline_id IN (SELECT c_invoiceline_id FROM c_invoiceline WHERE c_invoice_id=" + (inv[0] ? inv[0].id : 0) + ")"))[0] || {}).n),
    posted: inv[0] ? ((await tip("SELECT posted AS p FROM c_invoice WHERE c_invoice_id=" + inv[0].id))[0] || {}).p : null,
    miFact: inv[0] ? (await tip("SELECT COUNT(*) AS n, COALESCE(SUM(amtacctdr),0) AS d, COALESCE(SUM(amtacctcr),0) AS c FROM fact_acct WHERE ad_table_id=472 AND record_id IN (SELECT m_matchinv_id FROM m_matchinv WHERE c_invoiceline_id IN (SELECT c_invoiceline_id FROM c_invoiceline WHERE c_invoice_id=" + inv[0].id + "))"))[0] : null };
  const cnt = () => pg.evaluate(() => { const q = t => { const r = window.__idmpDb.exec(t); return r.length ? Number(r[0].values[0][0]) : 0; }; return q('SELECT COUNT(*) FROM ad_toolbarbutton WHERE ad_toolbarbutton_id IN (53431,53432,53433,53434)') + q('SELECT COUNT(*) FROM ad_process WHERE ad_process_id IN (53401,53402,53403,53404)'); });
  R.rowsLive = await cnt(); await pg.evaluate(async () => { await window.PluginEngine._reg().system.stopBundle('org.kernel.friendly-ops'); }); await pg.waitForTimeout(500); R.rowsStopped = await cnt();
  R.pageErr = logs.filter(l => /^PAGEERR/.test(l)).slice(0, 3);
  return R;
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const off = await run(base, browser, false), on = await run(base, browser, true);
    console.log('§FOPUR bill-log\n' + (on.billLog || []).join('\n')); console.log('§FOPUR off=' + JSON.stringify({ po: off.po, bar: off.bar0 }) + ' on=' + JSON.stringify(on.steps));
    if (!on.po || on.po.s !== 'CO' || !off.po || off.po.s !== 'CO') { incon++; console.log('  INCONCLUSIVE no Purchase Order reached CO (off ' + JSON.stringify(off.po) + ' on ' + JSON.stringify(on.po) + ')'); }
    else {
      const r = on.steps.recv, b = on.steps.bill;
      J('P1', 'plugin off: a completed PO shows no Receive / Create Bill', off.bar0.length === 0, off.bar0);
      J('P2', 'plugin on: the completed PO shows Receive, and Create Bill only after the receipt', on.bar0.includes('FO_Order_Receive') && !on.bar0.includes('FO_Order_Bill'), on.bar0);
      J('P3', 'Receive: one completed V+ Material Receipt linked to the PO, one line per PO line with the PO quantity', r.rcpt.length === 1 && r.rcpt[0].s === 'CO' && r.rcpt[0].m === 'V+' && r.rl.length === 1 && Number(r.rl[0].q) === 5, JSON.stringify([r.rcpt, r.rl]));
      J('P4', 'Receive: QtyDelivered = 5, on-hand +5, one M_MatchPO, receipt Fact_Acct balanced and non-empty', r.delivered === 5 && r.dOnhand === 5 && r.mpo >= 1 && r.fact && r.fact.n > 0 && Math.abs(r.fact.d - r.fact.c) < 0.005, JSON.stringify({ d: r.delivered, oh: r.dOnhand, mpo: r.mpo, f: r.fact }));
      J('P5', 'after Receive: Receive is gone, Create Bill is offered', !r.bar.includes('FO_Order_Receive') && r.bar.includes('FO_Order_Bill'), r.bar);
      J('P6', 'Create Bill: one completed vendor invoice of the PO whose line points at the receipt line, QtyInvoiced = 5, M_MatchInv written', b.inv.length === 1 && b.inv[0].s === 'CO' && b.inv[0].t === 'N' && b.il.length === 1 && Number(b.il[0].q) === 5 && r.rl[0] && Number(b.il[0].iol) === Number(r.rl[0].id) && b.mi >= 1, JSON.stringify([b.inv, b.il, b.mi]));
      // P7 vs the REAL iDempiere: the P2P chain recorded on the pilot (ERP parallel run c5_po_chain, ~/.cache/pilot/c5_po_chain/ref_diff.json: PO 5 x 36 -> receipt -> AP invoice, all completed) ends with
      //   C_OrderLine QtyDelivered 5 / QtyInvoiced 5, ONE M_MatchPO (qty 5) carrying BOTH the receipt line and the invoice line, ONE M_MatchInv (qty 5), Fact_Acct 4 rows each for the receipt (319),
      //   the invoice (318) and the M_MatchInv (472), every document Posted='Y'. The same shape is asserted here (quantities scale with this PO).
      J('P7', 'Create Bill vs the recorded legacy chain: invoice Fact_Acct 4 rows balanced, order QtyInvoiced = 5, one M_MatchPO carrying the invoice line and the receipt line, one M_MatchInv', b.fact && b.fact.n === 4 && Math.abs(b.fact.d - b.fact.c) < 0.005 && b.invoiced === 5 && b.mpoLinked === 1 && b.miN === 1 && b.posted === 'Y', JSON.stringify({ f: b.fact, inv: b.invoiced, mpoLinked: b.mpoLinked, mi: b.miN, posted: b.posted }));
      // P7b (spec §48, Doc_MatchInv ported): the M_MatchInv posts like legacy's recorded chain - 4 Fact_Acct rows on table 472, balanced (price = invoice price, so no variance line).
      J('P7b', 'Create Bill: the M_MatchInv is posted - Fact_Acct 4 rows on table 472, balanced (legacy recorded c5_po_chain: 4)', b.miFact && b.miFact.n === 4 && Math.abs(b.miFact.d - b.miFact.c) < 0.005, JSON.stringify(b.miFact));
      J('P8', 'once received and billed neither button is offered', !b.bar.includes('FO_Order_Receive') && !b.bar.includes('FO_Order_Bill'), b.bar);
      J('P9', 'Stop removes every row (processes, buttons)', on.rowsLive === 8 && on.rowsStopped === 0, 'live ' + on.rowsLive + ' stopped ' + on.rowsStopped);
      J('P0', 'no page errors', !(on.pageErr || []).length, on.pageErr);
    }
  } catch (e) { console.log('§FOPUR HARNESS-FAIL ' + e.message); fails++; try { console.log(DBG.filter(l => /AD-TBB|AD-PROC-LIVE|PROC-EXC|PAGEERR|ERROR/.test(l)).slice(-12).join('\n')); } catch (e2) {} }
  await browser.close(); srv.close();
  console.log('§FOPUR_VERDICT ' + (incon ? 'INCONCLUSIVE' : fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + (BREAK ? ' break=' + BREAK : ''));
  process.exit(fails || incon ? 1 : 0);
})();
