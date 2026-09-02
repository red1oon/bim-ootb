// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for Leg 1 of the iDempiere L&F FIDELITY lane (RESUME_IDMP_FIDELITY.md §SPEC Leg 1):
//   the toolbar ZOOM ACROSS button (iDempiere btnZoomAcross / WZoomAcross — WHERE-USED drill). W-ZOOM-ACROSS PROVES:
//     A — the classic toolbar carries a "Zoom" button (magnifier svg, faithful to iDempiere theme ZoomAcross24.png),
//         ENABLED on a saved Business Partner record (#118).
//     B — clicking it folds AD + data into a WHERE-USED popup: the windows whose records reference THIS BP —
//         Sales Order / Sales Invoice / Shipment (Customer) — each with a real count>0 (every item ends "(n)").
//         Destinations are EXTRACTED (AD_Column named C_BPartner_ID in header-tab tables, COUNT in data), not
//         invented; tables absent from the seed are honestly skipped.
//     C — picking "Sales Order" opens window 143 FILTERED to C_BPartner_ID=118: the §ZOOM-ACROSS-FILTER log fires,
//         the active window tab reads "Sales Order", and the loaded row count equals the popup's promised count
//         (the drill is REAL, not a dead button).
//   All assertions are DOM/console only (internal state is closure-private). 0 pageerrors.
//   §-log first — READ tests/poc_zoom_across_live.log before any conclusion.
// Run:  node tests/poc_zoom_across_live.js 2>&1 | tee tests/poc_zoom_across_live.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const errs = [], logs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { const t = m.text(); if (/^§(ZOOM|IDEMPIERE tab)/.test(t)) logs.push(t); });

  // Business Partner window (123), GardenWorld, land directly on BP #118 (a BP GardenWorld data references).
  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=123&record=118`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 });
  await page.waitForTimeout(1000);

  const zoomBtn = () => page.evaluate(() => {
    const tb = document.getElementById('idmp-toolbar');
    const b = tb && Array.from(tb.querySelectorAll('button')).find(x => /Zoom/i.test((x.textContent || '') + ' ' + x.title));
    return b ? { present: true, enabled: !b.disabled, magnifier: !!b.querySelector('svg') } : { present: false };
  });

  // ACT A — toolbar carries an enabled Zoom button (magnifier).
  const A = await zoomBtn();
  console.log('§ZOOM-A present=' + A.present + ' enabled=' + A.enabled + ' magnifier=' + A.magnifier);
  const actA = A.present && A.enabled;

  // ACT B — click Zoom → where-used popup with real destinations, each carrying a count.
  await page.evaluate(() => {
    const tb = document.getElementById('idmp-toolbar');
    const b = tb && Array.from(tb.querySelectorAll('button')).find(x => /Zoom/i.test((x.textContent || '') + ' ' + x.title));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  const B = await page.evaluate(() => {
    const ov = document.getElementById('idmp-zoom-ov');
    if (!ov) return { open: false, items: [] };
    return { open: true, items: Array.from(ov.querySelectorAll('div')).filter(d => d.style.cursor === 'pointer').map(d => (d.textContent || '').trim()) };
  });
  console.log('§ZOOM-B popup=' + B.open + ' items=' + JSON.stringify(B.items));
  const hasDest = (re) => B.items.some(t => re.test(t));
  const allCounted = B.items.length > 0 && B.items.every(t => /\(\d+\)\s*$/.test(t));
  const soItem = B.items.find(t => /Sales Order/i.test(t)) || '';
  const soPromised = (soItem.match(/\((\d+)\)\s*$/) || [])[1];   // count promised in the "Sales Order (n)" label
  const actB = B.open && allCounted && hasDest(/Sales Order/i) && hasDest(/Invoice/i) && hasDest(/Shipment/i);

  // ACT C — pick "Sales Order" → window 143 opens filtered to C_BPartner_ID=118.
  await page.evaluate(() => {
    const ov = document.getElementById('idmp-zoom-ov');
    const it = ov && Array.from(ov.querySelectorAll('div')).find(d => d.style.cursor === 'pointer' && /Sales Order/i.test(d.textContent || ''));
    if (it) it.click();
  });
  await page.waitForTimeout(1000);
  const C = await page.evaluate(() => {
    const active = document.querySelector('#idmp-wintabs .idmp-wintab.active .lbl');
    const popupGone = !document.getElementById('idmp-zoom-ov');
    return { winTab: active ? active.textContent.trim() : null, popupGone };
  });
  // the C_Order render log after the filter — proves the destination loaded filtered, with its row count
  const orderLog = logs.slice().reverse().find(t => /^§IDEMPIERE tab=.*table=C_Order /.test(t)) || '';
  const loadedRows = (orderLog.match(/rows=(\d+)/) || [])[1];
  const filterLog = logs.find(t => /^§ZOOM-ACROSS-FILTER table=C_Order .*C_BPartner_ID=118/i.test(t)) || '';
  console.log('§ZOOM-C winTab=' + JSON.stringify(C.winTab) + ' filterLog=' + (filterLog ? 'yes' : 'no') +
    ' loadedRows=' + loadedRows + ' promisedByPopup=' + soPromised);
  const actC = /Sales Order/i.test(C.winTab || '') && !!filterLog && C.popupGone &&
    loadedRows != null && loadedRows === soPromised && Number(loadedRows) > 0;

  await page.screenshot({ path: path.join(__dirname, 'zoom_across.png'), fullPage: false });

  const pass = actA && actB && actC && errs.length === 0;
  console.log('§W-ZOOM-ACROSS ACT_A=' + actA + ' ACT_B=' + actB + ' ACT_C=' + actC + ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));
  console.log('§W-ZOOM-ACROSS-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-ZOOM-ACROSS-RESULT FAIL ' + e.message); process.exit(1); });
