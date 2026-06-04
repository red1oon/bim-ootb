// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for MIGRATE_ERP_PICKER.md §ALSO-REQUESTED — the no-pivot heat-map fallback.
//   PROVES:
//     1. §HEATMAP — a window with NO docstatus lifecycle (window=140, Product/M_Product) no longer renders an
//        empty drop-zone board: the Kanban pill renders a HEAT MAP over a sensibly-detected lookup column
//        (M_Product_Category_ID), with real per-value row counts (.hm-cell tiles > 1). _groupRecs picks a
//        lookup, NOT a blind flds[0].
//     2. board still wins when there IS a lifecycle — a docstatus window (window=167, C_Invoice) logs
//        §KANBAN-PILL (board) and renders ZERO .hm-cell (no heat map hijack).
//   Issue it disproves: "a window with no wfmc lifecycle shows an empty/degenerate Kanban board."
//   §-log first — READ tests/poc_heatmap.log before any conclusion.
// Run:  node tests/poc_heatmap.js 2>&1 | tee tests/poc_heatmap.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
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

async function openWindowKanban(browser, port, win) {
  const logs = [], errs = [];
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/idempiere.html?window=${win}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok'); await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const k = await page.$('.idmp-pill[title="Kanban"]');
  if (k) { await k.click(); await page.waitForTimeout(1800); }
  const cells = await page.$$eval('.hm-cell', els => els.length).catch(() => 0);
  await page.screenshot({ path: path.join(__dirname, 'heatmap_w' + win + '.png') });
  await page.close();
  return { logs, errs, cells };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  // 1) no-lifecycle window (AD_Table) → heat map
  const hm = await openWindowKanban(browser, port, 140);
  const heatLog = hm.logs.find(l => l.startsWith('§HEATMAP')) || '(no §HEATMAP)';
  const heatKanban = hm.logs.find(l => l.startsWith('§KANBAN-PILL heatmap')) || '(no heatmap pill)';
  console.log('§HM-NOPIVOT win=140 ' + heatLog + ' | ' + heatKanban + ' cells=' + hm.cells + ' errs=' + (hm.errs.length ? hm.errs.join('|') : 0));

  // 2) lifecycle window (C_Invoice, has DocStatus) → board, NOT heat map
  const bd = await openWindowKanban(browser, port, 167);
  const boardLog = bd.logs.find(l => /^§KANBAN-PILL (live|readonly)/.test(l)) || '(no board)';
  const noHeat = !bd.logs.find(l => l.startsWith('§HEATMAP'));
  console.log('§HM-LIFECYCLE win=167 ' + boardLog + ' heatCells=' + bd.cells + ' noHeatMap=' + noHeat + ' errs=' + (bd.errs.length ? bd.errs.join('|') : 0));

  const heatOk = /^§HEATMAP by=/.test(heatLog) && hm.cells > 1 && hm.errs.length === 0;
  const boardOk = /^§KANBAN-PILL (live|readonly)/.test(boardLog) && bd.cells === 0 && noHeat && bd.errs.length === 0;
  console.log('§HEATMAP-WITNESS heatOk=' + heatOk + ' boardOk=' + boardOk);
  const pass = heatOk && boardOk;
  console.log('§HEATMAP ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
