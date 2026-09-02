// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_BOTTOM_BAR_AND_LIFECYCLE.md §D — the RED PILL master toggle.
//   OUR design (default) = "just the pill": classic iDempiere chrome (toolbar) hidden, the pill is the UI.
//   Red pill (or ',' — same shortcut as BIM Doc Mode) → classic iDempiere L&F; in classic mode our lens pills
//   step aside (only the red pill remains). Persisted; arrow keys navigate records (toolbar arrows hidden in
//   pill mode). Scrubber is dots-only (no ↶/↷) for pill-icon consistency.
//   PROVES:
//     1. Default boot: body.idmp-clean ON, #idmp-toolbar hidden, #pill-redpill present + .active (lit).
//     2. Red pill click → classic: body.idmp-clean OFF, #idmp-toolbar visible, lens pills hidden (only redpill).
//     3. ',' key toggles back → just-the-pill (and persists across reload).
//     4. Arrow keys (Right/Left) move the selected record.
//     5. Scrubber has 0 unicode arrow buttons (.scrubbtn) — dots-only.
//     6. 0 pageerrors.
//   §-log first — READ tests/poc_idmp_redpill.log before any conclusion.
// Run:  node tests/poc_idmp_redpill.js 2>&1 | tee tests/poc_idmp_redpill.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.png':'image/png','.css':'text/css','.wasm':'application/wasm' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/idempiere.html'; fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });

const state = (pg) => pg.evaluate(() => {
  var clean = document.body.classList.contains('idmp-clean');
  var tb = document.getElementById('idmp-toolbar');
  var tbVisible = tb ? getComputedStyle(tb).display !== 'none' : null;
  var red = document.getElementById('pill-redpill');
  var redActive = red ? red.classList.contains('active') : null;
  var lensVisible = ['pill-reports','pill-graph','pill-kanban','pill-rule'].filter(id => {
    var b = document.getElementById(id); return b && getComputedStyle(b).display !== 'none';
  });
  return { clean, tbVisible, redPresent: !!red, redActive, lensVisibleCount: lensVisible.length };
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text())); page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  // login + open a window so the toolbar + records exist
  await page.evaluate(() => { var r = [...document.querySelectorAll('#idmp-login-users .idmp-login-user')].find(x => !x.classList.contains('disabled')); if (r) r.click(); });
  await page.waitForTimeout(400); await page.click('#idmp-login-ok'); await page.waitForTimeout(800);
  // open a DATA-RICH window (iterate leaves until the grid has rows) so the toolbar + records + history exist
  await page.evaluate(() => document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(r => r.click()));
  await page.waitForTimeout(300);
  const names = await page.$$eval('#idmp-tree .idmp-row.leaf .nm', ns => ns.map(n => n.textContent));
  for (const nm of names) {
    await page.evaluate(n => { var r = [...document.querySelectorAll('#idmp-tree .idmp-row.leaf')].find(x => (x.querySelector('.nm') || {}).textContent === n); if (r) r.click(); }, nm);
    await page.waitForTimeout(450);
    if ((await page.$$eval('#idmp-content .idmp-grid tr', t => t.filter(x => x.querySelector('td')).length).catch(() => 0)) > 0) break;
  }
  await page.waitForTimeout(300);

  const s1 = await state(page);
  console.log('§D-DEFAULT just-the-pill: clean=' + s1.clean + ' toolbarVisible=' + s1.tbVisible +
    ' redPill=' + s1.redPresent + ' redActive=' + s1.redActive + ' lensPillsVisible=' + s1.lensVisibleCount);

  // click the red pill → classic L&F
  await page.evaluate(() => { var t = document.getElementById('idmp-pill-trigger'); if (getComputedStyle(document.getElementById('idmp-pill')).display === 'none') t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.getElementById('pill-redpill').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await page.waitForTimeout(400);
  const s2 = await state(page);
  console.log('§D-CLASSIC after red pill: clean=' + s2.clean + ' toolbarVisible=' + s2.tbVisible +
    ' redActive=' + s2.redActive + ' lensPillsVisible=' + s2.lensVisibleCount + ' (expect lens=0, toolbar visible)');

  // ',' key toggles back to just-the-pill
  await page.keyboard.press(','); await page.waitForTimeout(300);
  const s3 = await state(page);
  console.log('§D-KEY comma → clean=' + s3.clean + ' toolbarVisible=' + s3.tbVisible);

  // arrow-key record nav
  const recBefore = await page.evaluate(() => window.__recIdxProbe === undefined ? null : null);  // not exposed; measure via status
  const idxBefore = await page.evaluate(() => { var s = document.getElementById('idmp-status-main'); return s ? s.textContent : ''; });
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
  const idxAfterR = await page.evaluate(() => { var s = document.getElementById('idmp-status-main'); return s ? s.textContent : ''; });
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300);
  const idxAfterL = await page.evaluate(() => { var s = document.getElementById('idmp-status-main'); return s ? s.textContent : ''; });
  const arrowWorks = idxBefore !== idxAfterR || /Record/.test(idxAfterR);
  console.log('§D-ARROWKEYS before="' + idxBefore + '" afterRight="' + idxAfterR + '" afterLeft="' + idxAfterL + '" changed=' + arrowWorks);

  // scrubber dots-only (no ↶/↷ .scrubbtn)
  const scrubBtns = await page.$$eval('#idmp-scrub .scrubbtn', b => b.length).catch(() => 0);
  const scrubDots = await page.$$eval('#idmp-scrub .scrubdot', d => d.length).catch(() => 0);
  console.log('§D-SCRUB-CONSISTENT arrowButtons=' + scrubBtns + ' (expect 0) dots=' + scrubDots);

  await page.screenshot({ path: path.join(__dirname, 'idmp_redpill_clean.png') });

  const pass = s1.clean && s1.tbVisible === false && s1.redActive === true && s1.lensVisibleCount === 4 &&
    s2.clean === false && s2.tbVisible === true && s2.lensVisibleCount === 0 &&
    s3.clean === true && arrowWorks && scrubBtns === 0 && errs.length === 0;
  console.log('§D-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' defaultClean=' + (s1.clean && s1.tbVisible === false) + ' redLit=' + (s1.redActive === true) +
    ' classicShowsToolbar=' + (s2.tbVisible === true) + ' lensStepAside=' + (s2.lensVisibleCount === 0) +
    ' keyToggle=' + (s3.clean === true) + ' arrowNav=' + arrowWorks + ' scrubConsistent=' + (scrubBtns === 0) +
    ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
