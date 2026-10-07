// W-FIND-ROW-CLIPPED — issue (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ZOOM_BACK_FIELD 4, user 2026-10-07): the Find panel's
//   lower row (cost · › ERP · open ↗) vanished and a refresh did not bring it back. Cause: a dragged-tall tree height saved in
//   localStorage findTreeH, re-forced on load, inside a panel capped at 88vh with overflow:hidden.
//   Proof: seed findTreeH=2000px (a user's earlier tall drag) → load → open Find → #find-erp-btn must lie INSIDE the panel's box.
//   RED (ROOT=<origin/main tree>) must FAIL. Run: node viewer/tests/witness_find_row_clipped.js — read the log.
'use strict';
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (/§FIND_ROW_CLIPPED|§FIND_GRIP/.test(m.text())) console.log('  [c] ' + m.text()); });
  await page.goto(base + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('findTreeH', '2000px'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 120; i++) { if (await page.evaluate(() => !!(window.APP && APP.db && APP.openFindPanel)).catch(() => false)) break; await page.waitForTimeout(1000); }
  await page.evaluate(() => APP.openFindPanel());
  for (let i = 0; i < 60 && !(await page.evaluate(() => { const t = document.getElementById('find-tree'); return !!(t && t.style.display !== 'none' && document.getElementById('find-erp-btn')); })); i++) await page.waitForTimeout(1000);
  // a user's tap on the first tree category = a selection, which makes the row (cost · › ERP · open ↗) show
  await page.evaluate(() => { const r = document.querySelector('[data-find-parent]'); if (r) r.children[1].dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const P = document.getElementById('find-panel').getBoundingClientRect(), B = document.getElementById('find-selected').getBoundingClientRect(), T = document.getElementById('find-tree').getBoundingClientRect();
    return { panelBottom: Math.round(P.bottom), btnTop: Math.round(B.top), btnBottom: Math.round(B.bottom), tree: Math.round(T.height), treeShown: document.getElementById('find-tree').style.display !== 'none' };
  });
  console.log('§W-FIND-ROW-CLIPPED ' + JSON.stringify(r));
  const verdict = !r.treeShown ? 'INCONCLUSIVE (tree never shown)' : !(r.btnBottom > r.btnTop) ? 'INCONCLUSIVE (selected row has no size — nothing judged)' : (r.btnBottom <= r.panelBottom && r.btnTop >= 0 ? 'PASS' : 'FAIL');
  console.log('§W-FIND-ROW-CLIPPED verdict=' + verdict + ' root=' + ROOT);
  await browser.close(); server.close(); process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.log('§W-FIND-ROW-CLIPPED ERROR ' + e.message); process.exit(2); });
