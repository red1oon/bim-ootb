// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for Leg 5 of the iDempiere L&F FIDELITY lane (RESUME_IDMP_FIDELITY.md §Leg 5):
//   the toolbar **Print** button (iDempiere btnPrint / Print24.png, Alt+P) — print THIS document = fold its
//   receipt from raw header+lines (window.__report.printRecord, PURE foldReceipt; no new verb). DISTINCT from the
//   ⋯ Reports pill, which stays the Performance-Analysis financial-statements MENU (iDempiere convention).
//   W-PRINT-TOOLBAR PROVES:
//     A — the classic toolbar carries a "Print" button (printer svg, faithful to theme Print24.png), ENABLED on a
//         printable document window (C_Invoice — a header/line table in REPORT_MAP).
//     B — opening a record + clicking Print folds THAT record's receipt to the cent: §REPORT-PRINT supported=Y +
//         §REPORT-RECEIPT doc=Invoice#<the opened id> (the OPEN record, not a lit demo doc), total>0, panel opens.
//     C — on a NON-printable window (Business Partner, C_BPartner — no REPORT_MAP entry) the Print button is
//         DISABLED/greyed (iDempiere enablePrint parity) — the gate is the real printable-doc test, not a hardcode.
//     D — the ⋯ Reports pill is UNCHANGED (still present = the financial-statements menu; per-doc receipt is now the
//         toolbar's job, statements stay the menu's — the faithful split).
//   All assertions are DOM/console only. 0 pageerrors.
//   §-log first — READ tests/poc_print_toolbar_live.log before any conclusion.
// Run:  node tests/poc_print_toolbar_live.js 2>&1 | tee tests/poc_print_toolbar_live.log   (cwd = bim-ootb/erp)
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
  page.on('console', m => { const t = m.text(); if (/^§(REPORT|TOOLBAR print|IDEMPIERE tab)/.test(t)) logs.push(t); });

  async function login(loginName, windowId) {
    await page.goto(`http://localhost:${port}/idempiere.html?login=${loginName}&window=${windowId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#idmp-content table.idmp-grid, #idmp-placeholder', { timeout: 20000 });
    await page.waitForTimeout(900);
  }
  const printBtn = () => page.evaluate(() => {
    const tb = document.getElementById('idmp-toolbar');
    const b = tb && Array.from(tb.querySelectorAll('button')).find(x => /\bPrint\b/.test((x.textContent || '') + ' ' + x.title) && !/Save/.test(x.textContent || ''));
    return b ? { present: true, enabled: !b.disabled, printer: !!b.querySelector('svg') } : { present: false };
  });

  // ── PART 1 — printable document (Sales Invoice, window 167 → C_Invoice in REPORT_MAP). ──
  await login('GardenAdmin', 167);

  // A — toolbar carries an enabled Print button (printer glyph) on a printable doc.
  const A = await printBtn();
  console.log('§PRINT-A present=' + A.present + ' enabled=' + A.enabled + ' printer=' + A.printer);
  const actA = A.present && A.enabled && A.printer;

  // B — open a specific record, click Print → that record's receipt folds to the cent.
  const openedId = await page.evaluate(() => {
    const tr = document.querySelector('#idmp-content table.idmp-grid tbody tr[data-ad-record]');
    if (!tr) return null; tr.click(); return tr.getAttribute('data-ad-record');
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const tb = document.getElementById('idmp-toolbar');
    const b = tb && Array.from(tb.querySelectorAll('button')).find(x => /\bPrint\b/.test((x.textContent || '') + ' ' + x.title) && !/Save/.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  const printLog = logs.slice().reverse().find(t => /^§REPORT-PRINT /.test(t)) || '';
  const receiptLog = logs.slice().reverse().find(t => /^§REPORT-RECEIPT /.test(t)) || '';
  const panelOpen = await page.evaluate(() => { const p = document.getElementById('reportPanel'); return !!(p && p.className.indexOf('open') >= 0); });
  const receiptId = (receiptLog.match(/#(\d+)/) || [])[1];
  const receiptTotal = (receiptLog.match(/total=([\d.]+)/) || [])[1];
  console.log('§PRINT-B openedId=' + openedId + ' printLog=' + JSON.stringify(printLog) + ' receiptLog=' + JSON.stringify(receiptLog) + ' panelOpen=' + panelOpen);
  const actB = /supported=Y/.test(printLog) && new RegExp('rec=' + openedId + '\\b').test(printLog) &&
    !!receiptLog && receiptId === String(openedId) && Number(receiptTotal) > 0 && panelOpen;

  // D — the Reports pill (financial-statements menu) is unchanged/present.
  const reportsPill = await page.evaluate(() => !!document.getElementById('pill-reports'));
  console.log('§PRINT-D reportsPillPresent=' + reportsPill);
  const actD = reportsPill;

  await page.evaluate(() => { const c = document.querySelector('#reportPanel .rpx'); if (c) c.click(); });
  await page.screenshot({ path: path.join(__dirname, 'print_toolbar.png'), fullPage: false });

  // ── PART 2 — NON-printable window (Business Partner 123 → C_BPartner, no REPORT_MAP entry). ──
  await login('GardenAdmin', 123);
  const C = await printBtn();
  console.log('§PRINT-C present=' + C.present + ' enabled=' + C.enabled);
  const actC = C.present && !C.enabled;   // present on the toolbar but DISABLED (greyed) — enablePrint parity

  const pass = actA && actB && actC && actD && errs.length === 0;
  console.log('§W-PRINT-TOOLBAR ACT_A=' + actA + ' ACT_B=' + actB + ' ACT_C=' + actC + ' ACT_D=' + actD +
    ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));
  console.log('§W-PRINT-TOOLBAR-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-PRINT-TOOLBAR-RESULT FAIL ' + e.message); process.exit(1); });
