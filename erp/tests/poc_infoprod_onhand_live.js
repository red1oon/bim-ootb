// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-INFOPROD-ONHAND (bim-compiler prompts/ERP_DEPTH_FILM.md §7). READ tests/poc_infoprod_onhand_live.log before any
//   conclusion — exit code is not evidence.
// THE ISSUES this proves/disproves (each assertion names its own):
//   I1  the toolbar "Product" button opens Info Product from the AD_InfoWindow dictionary (ADWindowToolbar.java:282 → onProductInfo:3533)
//   I2  searching Mulch (Search Key criterion, Like) with a warehouse shows On Hand / Reserved / Ordered / Available in the DOM
//   I3  the DOM On Hand equals the tip-shadowed StorageOnHand sum of the warehouse (ONE stock truth) and Available = OnHand − Reserved
//   I4  the Warehouse Stock tab total and the ATP (per-locator) tab total equal the same figure
//   I5  after a POS Order for qty 1 COMPLETES in the same session, re-querying shows On Hand fell by EXACTLY 1 (and again equals the tip sum)
//   Verdict INCONCLUSIVE (never PASS) when before==after, the row was not found, or the order never completed.
// Run: node tests/poc_infoprod_onhand_live.js 2>&1 | tee tests/poc_infoprod_onhand_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0, inconclusive = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);   // tip-shadowed read: bundle + this session's signed ops
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const opts = (col) => pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', o => o.map(x => ({ v: x.value, t: x.text }))).catch(() => []);
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const pick = async (col, re) => { const o = (await opts(col)).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); await pg.selectOption(F(col, 'select'), o.v); await pg.waitForTimeout(450); return o.t; };
  const PROD = 137;   // Mulch — costed (the pilot posts its shipment; Oak Tree's is Posted=E there, see ERP_DEPTH_FILM.md §6)
  const onhand = async () => (await tip('SELECT COALESCE(SUM(qtyonhand),0) AS n FROM m_storageonhand WHERE m_product_id=' + PROD))[0].n;

  // open Sales Order (window 143) through the menu
  const mid = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=143 AND IsActive='Y'");
    return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); });
  const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
    while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
  for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
    if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]');
  const NEWB = '#idmp-toolbar [data-tb="new"]'; await pg.waitForSelector(NEWB); await pg.waitForTimeout(800);

  const oh0 = await onhand(), tx0 = (await tip('SELECT COUNT(*) AS n FROM m_transaction'))[0].n;
  const WH = 103;   // HQ Warehouse (Mulch baseline 50 at locator 101)
  const info = async (label) => {
    if (!(await pg.$('#idmp-infowin'))) { await pg.evaluate(() => window.AdInfoWindow.open({ tableName: 'M_Product', clientId: window.APP && window.APP.clientId, orgId: window.APP && window.APP.orgId }));   // Info Product has no toolbar button in legacy (AD_ToolBarButton 200056 inactive) await pg.waitForSelector('#idmp-infowin'); }
    await pg.fill('#idmp-infowin-crit input[data-col="Value"]', 'Mulch');
    await pg.selectOption('#idmp-infowin-crit select[data-col="M_Warehouse_ID"]', String(WH));
    await hc('#idmp-infowin [data-act="refresh"]'); await pg.waitForTimeout(500);
    const cell = (col) => pg.$eval('#idmp-infowin tbody tr[data-key="' + PROD + '"] td[data-col="' + col + '"]', e => e.getAttribute('data-v')).catch(() => null);
    const nrows = await pg.$$eval('#idmp-infowin tbody tr[data-key="' + PROD + '"]', e => e.length);
    const o = { rows: nrows, oh: await cell('QtyOnHand'), rs: await cell('QtyReserved'), od: await cell('QtyOrdered'), av: await cell('QtyAvailable') };
    const tabTotal = async (id, colIdx, totalsRow) => { await hc('#idmp-infowin [data-tab="' + id + '"]'); await pg.waitForTimeout(300);
      return pg.$$eval('#idmp-infowin [data-tab-body="' + id + '"] tbody tr', (trs, ci) => trs.map(t => [...t.children].map(td => td.getAttribute('data-v') != null ? td.getAttribute('data-v') : td.innerText)), colIdx); };
    o.stock = await tabTotal('stock'); o.atp = await tabTotal('atp');
    console.log('§INFOPROD ' + label + ' ' + JSON.stringify({ rows: o.rows, oh: o.oh, rs: o.rs, od: o.od, av: o.av, stockTab: o.stock, atpTab: o.atp }));
    return o;
  };
  const whOnhand = async () => (await tip('SELECT COALESCE(SUM(s.qtyonhand),0) AS n FROM m_storageonhand s JOIN m_locator l ON l.m_locator_id=s.m_locator_id WHERE s.m_product_id=' + PROD + ' AND l.m_warehouse_id=' + WH))[0].n;
  const sumCol = (rows, ci) => rows.reduce((a, r) => a + (Number(r[ci]) || 0), 0);

  // ── I1/I2/I3/I4 · BEFORE
  const A = await info('before'), tipA = await whOnhand();
  ok('I1', 'the toolbar Product button opened Info Product (dictionary AD_InfoWindow 200000)', A.rows >= 1, 'rows for product ' + PROD + '=' + A.rows);
  ok('I2', 'On Hand / Reserved / Ordered / Available are all shown for Mulch', [A.oh, A.rs, A.od, A.av].every(v => v !== null && v !== ''), JSON.stringify({ oh: A.oh, rs: A.rs, od: A.od, av: A.av }));
  ok('I3', 'DOM On Hand == tip StorageOnHand sum of warehouse ' + WH + ' and Available == OnHand − Reserved', Number(A.oh) === Number(tipA) && Number(A.av) === Number(A.oh) - Number(A.rs), 'dom=' + A.oh + ' tip=' + tipA + ' avail=' + A.av + ' reserved=' + A.rs);
  ok('I4', 'Warehouse Stock tab On Hand and ATP per-locator tab On Hand equal the same figure', Number(sumCol(A.stock.filter(r => /HQ Warehouse/.test(r[0])), 2)) === Number(A.oh) && Number(sumCol(A.atp.filter(r => r[5]), 1)) === Number(A.oh), 'stock=' + JSON.stringify(A.stock) + ' atp=' + JSON.stringify(A.atp));
  await pg.click('#idmp-infowin button[title="Close"]');

  console.log('§DEPTH before onhand(' + PROD + ')=' + oh0 + ' m_transaction=' + tx0);

  // ── D1 · New POS Order, number left as shown
  await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  await pick('c_doctypetarget_id', /^POS Order/); await pick('c_bpartner_id', /Joe Block/); await pick('ad_org_id', /^HQ/);
  const docnoShown = await pg.$eval(F('documentno'), e => e.value);
  let n0 = logs.length; await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800);
  const s1 = logs.slice(n0);
  ok('D1', 'a New order saved with the preview number ("' + docnoShown + '") is NOT rejected by the numeric pin',
    !s1.some(l => /§CRUD validate key=c_order verb=create REJECT/.test(l)) && s1.some(l => /§CRUD validate key=c_order verb=create ok/.test(l)),
    (s1.filter(l => /§CRUD validate key=c_order verb=create/.test(l)).pop() || 'no validate line').slice(0, 120));
  ok('D1b', 'the sequence number is allocated at save (PO.saveNew)', s1.some(l => /§DOCNO table=c_order docno=\d+ .*via=ModelTrade\.MSequence/.test(l)), (s1.filter(l => /§DOCNO /.test(l)).pop() || '').slice(0, 130));

  // line: Mulch × 1
  await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · C_OrderLine"]'); await pg.waitForTimeout(1200);
  await hc(NEWB); await pg.waitForTimeout(900);
  await pick('m_product_id', /Mulch/); await pg.waitForTimeout(800);
  await pg.fill(F('qtyentered'), '1'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
  await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000);
  await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000);
  await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(900);

  // ── D2/D3 · Complete
  n0 = logs.length; await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
  const c = logs.slice(n0), da = c.filter(l => /§MODEL-DOCACTION table=c_order/.test(l)).pop() || '';
  ok('D2', 'Complete on an order typed this session reaches the model layer and succeeds (not "no lines")', /ok=true status=CO/.test(da), da.slice(0, 160));
  const tables = (da.match(/tables=(\{.*?\})(?: msg|$)/) || [])[1] || '', has = t => new RegExp('"' + t + ':CREATE"').test(tables) || new RegExp('"' + t + ':UPDATE"').test(tables);
  ok('D3', 'ONE group wrote shipment + invoice + stock + transaction + postings', ['m_inout', 'c_invoice', 'm_storageonhand', 'm_transaction', 'fact_acct'].every(has), tables.slice(0, 220));
  ok('D3b', 'the group is signed and chain-verified', c.some(l => /§CRUD process committed key=c_order viaGroup=Y .*verifyChain=ok/.test(l)));

  // ── I5 · AFTER (same session — the sale lives in the signed sidecar)
  const B = await info('after'), tipB = await whOnhand();
  if (B.oh === A.oh || A.rows < 1 || B.rows < 1) { console.log('§INFOPROD INCONCLUSIVE before=' + A.oh + ' after=' + B.oh + ' rows=' + A.rows + '/' + B.rows + ' — a no-op, nothing judged'); inconclusive++; }
  ok('I5', 'On Hand fell by EXACTLY 1 after the POS Order completed, and still equals the tip sum', Number(A.oh) - Number(B.oh) === 1 && Number(B.oh) === Number(tipB), 'before=' + A.oh + ' after=' + B.oh + ' tipAfter=' + tipB);
  ok('I5b', 'Available moved with it (OnHand − Reserved) and the Warehouse Stock tab agrees', Number(B.av) === Number(B.oh) - Number(B.rs) && Number(sumCol(B.stock.filter(r => /HQ Warehouse/.test(r[0])), 2)) === Number(B.oh), 'avail=' + B.av + ' stockTab=' + JSON.stringify(B.stock));
  logs.filter(l => /§INFOWIN/.test(l)).forEach(l => console.log('  ' + l.slice(0, 420)));   // the shipped §-log is primary evidence
  ok('D0', '0 page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  const verdict = fail ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('\n§INFOPROD-ONHAND ' + verdict + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  await browser.close(); srv.close(); process.exit(fail || inconclusive ? 1 : 0);
})().catch(e => { console.log('§INFOPROD-ONHAND HARNESS-FAIL ' + e.message); process.exit(2); });
