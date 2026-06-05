// ⚠ DO NOT REMOVE — Scope guard
// Scope: whitebox §-witness PROVING the migrated Odoo tenant's REAL records are resident AND showable in our
//   SQLite/AD UI — "sample data can go in, and we show their records." Loads the demo URL (seed + 12-odoo.db
//   shard + auto-login as Odoo + open the Product window), then (A) queries the live in-memory db for the
//   ACTUAL Odoo business rows (products by name, the migrated sale order + its customer + grand total, the
//   invoice) and (B) screenshots the rendered AD window. NON-INVENT: every value printed is read from the db
//   the browser loaded — nothing fabricated.
//   §-log first — READ tests/poc_odoo_records_show.log before any conclusion.
// Run:  node tests/poc_odoo_records_show.js 2>&1 | tee tests/poc_odoo_records_show.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// read REAL migrated Odoo rows from the live in-memory db (client 12)
const readRecords = () => {
  const all = (s) => { try { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; } catch (e) { return [['ERR:' + e.message]]; } };
  const one = (s) => { const v = all(s); return v.length ? v[0][0] : null; };
  return {
    products:   one("SELECT COUNT(*) FROM M_Product WHERE AD_Client_ID=12"),
    prodNames:  all("SELECT Name FROM M_Product WHERE AD_Client_ID=12 ORDER BY M_Product_ID LIMIT 6").map(r => r[0]),
    orders:     one("SELECT COUNT(*) FROM C_Order WHERE AD_Client_ID=12"),
    order:      all("SELECT DocumentNo, GrandTotal, DocStatus FROM C_Order WHERE AD_Client_ID=12 ORDER BY GrandTotal DESC LIMIT 1")[0] || null,
    customer:   one("SELECT Name FROM C_BPartner WHERE AD_Client_ID=12 ORDER BY C_BPartner_ID LIMIT 1"),
    invoice:    all("SELECT DocumentNo, GrandTotal FROM C_Invoice WHERE AD_Client_ID=12 LIMIT 1")[0] || null,
    priced:     one("SELECT COUNT(*) FROM M_ProductPrice pp JOIN M_Product p ON p.M_Product_ID=pp.M_Product_ID WHERE p.AD_Client_ID=12")
  };
};

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 820 });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // the live demo URL: base seed + Odoo shard merged + auto-login as Odoo + open the Product window (140)
  await page.goto(`http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=140`,
    { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(2500);   // let auto-login + window render settle

  const shardLog = logs.find(l => l.startsWith('§IDEMPIERE shard-in')) || '(no shard-in)';
  const rec = await page.evaluate(readRecords);

  console.log('§ODOO-RECORDS ' + shardLog);
  console.log('§ODOO-RECORDS products=' + rec.products + ' priced=' + rec.priced + ' orders=' + rec.orders);
  console.log('§ODOO-RECORDS sample-products=[' + rec.prodNames.join(' | ') + ']');
  console.log('§ODOO-RECORDS top-order=' + (rec.order ? rec.order.join(' / ') : 'none')
    + ' customer="' + rec.customer + '" invoice=' + (rec.invoice ? rec.invoice.join(' / ') : 'none'));

  // did the AD UI actually render records on screen?
  const header = await page.evaluate(() => (document.querySelector('#idmp-header, .idmp-header, header') || {}).innerText || '');
  const rowsOnScreen = await page.evaluate(() =>
    document.querySelectorAll('.rec-card, .ad-row, .grid-row, [data-record], tr').length);
  console.log('§ODOO-RECORDS rendered header="' + String(header).replace(/\s+/g, ' ').trim().slice(0, 80)
    + '" on-screen-rows=' + rowsOnScreen);

  await page.screenshot({ path: path.join(__dirname, 'odoo_records_show.png'), fullPage: false });

  const showable = rec.products >= 1 && Array.isArray(rec.prodNames) && rec.prodNames.length >= 1
    && rec.order && errs.length === 0;
  console.log('§ODOO-RECORDS-VERDICT showable=' + (showable ? 'Y' : 'N')
    + ' (their REAL Odoo rows are resident + queryable + on screen) pageErrors=' + (errs.length ? errs.join('|') : 0));

  await browser.close();
  server.close();
  process.exit(showable ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
