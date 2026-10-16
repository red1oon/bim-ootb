// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP4-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-4). READ tests/poc_udp4_initial_query_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does a window OPEN the way legacy opens it (AbstractADWindowContent :416-422, initialQuery :899-991, initQueryOnNew :719-737)?
//   Sales Order (transaction) shows only current rows; a Find result shows history too; Business Partner (high volume) opens on the Find
//   dialog with an empty grid, OK shows the rows; Product (high volume) + Cancel closes the window; Sales Invoice (transaction, no current
//   rows in this seed) opens a New record. The judge of the rows: the grid's own read (§AD_DATA readRecords where=...) re-run on the page DB.
//   On origin/main every window opens straight on all its rows (RED).
// Run: node tests/poc_udp4_initial_query_live.js 2>&1 | tee tests/poc_udp4_initial_query_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const openWin = async (wid) => {
    const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + wid + " AND IsActive='Y'"))[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1500);
  };
  const lastRead = (tn, from) => { const re = new RegExp('^§AD_DATA readRecords table=' + tn + ' where=', 'i'); const l = logs.slice(from).filter(x => re.test(x)).pop(); return l ? l.replace(re, '') : null; };
  const rowsOf = (tn, from) => { const re = new RegExp('^§IDEMPIERE tab=.* table=' + tn + ' rows=(\\d+)', 'i'); const l = logs.slice(from).filter(x => re.test(x)).pop(); return l ? +re.exec(l)[1] : null; };
  const line = (re, from) => logs.slice(from).filter(x => re.test(x)).pop() || null;

  // U1 Sales Order: transaction window -> only current rows
  let from = logs.length; await openWin(143);
  const init = line(/§UDP4-INITIAL window=143/, from), w1 = lastRead('C_Order', from), r1 = rowsOf('C_Order', from);
  const n1 = w1 ? (await seed('SELECT count(*) FROM C_Order WHERE ' + w1))[0][0] : null;
  const notCur = w1 ? (await seed("SELECT count(*) FROM C_Order WHERE (" + w1 + ") AND NOT (Processed='N' OR Updated>datetime('now','localtime','-1 day'))"))[0][0] : null;
  const all1 = (await seed("SELECT count(*) FROM C_Order WHERE IsSOTrx='Y' AND AD_Client_ID IN (0,11)"))[0][0];
  ok('U1', 'Sales Order opens on only the current rows (Processed=N or updated within a day; GridTable :437-446)', !!init && /onlyCurrentRows=true findFirst=false/.test(init) && r1 === n1 && notCur === 0 && r1 < all1, init + ' | rows=' + r1 + ' whereCount=' + n1 + ' notCurrent=' + notCur + ' allSalesOrders=' + all1);
  // U2 a Find result shows history too
  await hc('#idmp-toolbar [data-tb="find"]'); await pg.waitForSelector('#idmp-find-ov'); from = logs.length; await hc('[data-find-ok]'); await pg.waitForTimeout(1200);
  const w2 = lastRead('C_Order', from), r2 = rowsOf('C_Order', from);
  ok('U2', 'after a Find (OK, no restriction) the window searches history too (doOnFind :2662)', r2 === all1 && !/Processed='N'/.test(w2 || ''), 'rows=' + r2 + ' all=' + all1 + ' where=' + w2);
  // U3 Business Partner: high volume -> Find first
  from = logs.length; await openWin(123);
  const init3 = line(/§UDP4-INITIAL window=123/, from), findShown = await pg.locator('#idmp-find-ov').count(), r3a = rowsOf('C_BPartner', from);
  ok('U3', 'Business Partner (high volume) opens on the Find dialog, no rows read yet (initialQuery :918, :939-980)', !!init3 && /findFirst=true/.test(init3) && findShown === 1 && r3a == null, init3 + ' dialog=' + findShown + ' rowsRead=' + r3a);
  from = logs.length; await hc('[data-find-ok]'); await pg.waitForTimeout(1200);
  const r3 = rowsOf('C_BPartner', from), w3 = lastRead('C_BPartner', from), n3 = w3 ? (await seed('SELECT count(*) FROM C_BPartner WHERE ' + w3))[0][0] : null;
  ok('U4', 'OK shows the rows of the (empty) query', r3 != null && r3 === Math.min(n3, 200) && r3 > 0, 'rows=' + r3 + ' whereCount=' + n3);
  // U5 Product: Find first, Cancel closes the window
  from = logs.length; await openWin(140);
  const shown5 = await pg.locator('#idmp-find-ov').count();
  await hc('[data-find-cancel]'); await pg.waitForTimeout(600);
  const tabs5 = await pg.$$eval('#idmp-wintabs .idmp-wintab', t => t.map(x => x.textContent));
  ok('U5', 'Product (high volume): Cancel on the first Find closes the window (initTab callback :765-768)', shown5 === 1 && !tabs5.some(t => /^Product/.test(t)) && !!line(/§UDP4-INITIAL find cancelled/, from), 'dialog=' + shown5 + ' windows=' + JSON.stringify(tabs5));
  // U6 Sales Invoice: transaction, no current rows -> New record
  const cur6 = (await seed("SELECT count(*) FROM C_Invoice WHERE IsSOTrx='Y' AND AD_Client_ID IN (0,11) AND (Processed='N' OR Updated>datetime('now','localtime','-1 day'))"))[0][0];
  from = logs.length; await openWin(167); await pg.waitForTimeout(1200);
  const an = line(/§UDP4-AUTONEW window=167/, from), mount = await pg.locator('#idmp-inline-mount').count();
  ok('U6', 'Sales Invoice with no current rows opens a New record (initQueryOnNew :719-737)', cur6 > 0 ? true : (!!an && mount === 1), 'currentRows=' + cur6 + ' ' + an + ' newForm=' + mount);
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('U7', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  logs.filter(l => /§UDP4-/.test(l)).forEach(l => console.log('  log| ' + l.slice(0, 260)));
  console.log('§UDP4L-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDP4L-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
