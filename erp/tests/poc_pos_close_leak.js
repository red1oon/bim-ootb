// poc_pos_close_leak.js — W-POS-CLOSE-LEAK. §BUGFIX 2026-07-13 (user report: "shop cart pill does not
//   close when we exited"). ISSUE THIS PROVES / DISPROVES: does closing the POS lens via the overlay's
//   OWN native ✕ (the obvious top-right close, distinct from the buried ⋯→Home dock button) actually
//   tear down every POS-owned DOM node, or does the body-level cart float panel + ⋯ dock survive and
//   keep floating over iDempiere.html?
//   Root cause fixed: `_overlay()` (idempiere.html) gained an optional onClose param; pos_lens.js wires
//   its float/dock teardown through it so EVERY close path (✕ tap, dock Home tap) shares one dispose.
//   §-log first (per docs/TestArchitecture.md §Browser Testing); Playwright drives the REAL idempiere.html
//   over the real GardenWorld seed (mirrors poc_zoom_across.js's login pattern).
// Run: node erp/tests/poc_pos_close_leak.js 2>&1 | tee build/pos_close_leak.log — then READ the log.
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.mjs': 'text/javascript', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = []; const W = (ok, m) => log.push((ok ? '🟢' : '🔴') + ' ' + m);

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const cons = []; page.on('console', m => cons.push(m.text())); page.on('pageerror', e => cons.push('PAGEERR ' + e));

  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let gate = false;
  for (let i = 0; i < 60; i++) { gate = await page.evaluate(() => typeof window.IdmpPillPosGate === 'function' && window.IdmpPillPosGate()).catch(() => false); if (gate) break; await sleep(1000); }
  W(gate, '§gate IdmpPillPosGate() true (GardenWorld tenant carries a c_pos row)');
  if (!gate) { console.log(log.join('\n')); console.log('\n❌ W-POS-CLOSE-LEAK cannot proceed — no POS station in seed'); await browser.close(); server.close(); process.exit(1); return; }

  // open POS the real way: the rail pill, not a direct function call
  await page.evaluate(() => { const t = document.getElementById('idmp-pill-trigger'); if (t) t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(500);
  await page.evaluate(() => { const b = document.getElementById('pill-pos'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(600);
  const opened = await page.evaluate(() => !!document.getElementById('posted-overlay') && !!document.getElementById('pos-float-panel') && !!document.getElementById('pos-dock'));
  W(opened, 'POS opened: #posted-overlay + #pos-float-panel + #pos-dock all present');

  // open the cart float panel (the "shop cart pill" itself, #pos-pill-payment) so it's visibly IN USE
  await page.click('#pos-pill-payment');
  await sleep(200);
  const floatOpen = await page.$eval('#pos-float-panel', n => n.classList.contains('open')).catch(() => false);
  W(floatOpen, 'cart float panel opened via #pos-pill-payment (§POS-FLOAT toggle=open)');

  // ── THE ACTUAL BUG: close via the overlay's OWN native ✕ (the obvious "exit" gesture) ──
  await page.click('#posted-overlay .posted-ov-x');
  await sleep(300);
  const afterX = await page.evaluate(() => ({
    overlay: !!document.getElementById('posted-overlay'),
    float: !!document.getElementById('pos-float-panel'),
    dock: !!document.getElementById('pos-dock')
  }));
  W(!afterX.overlay, '✕ close removes #posted-overlay', JSON.stringify(afterX));
  W(!afterX.float, '✕ close ALSO removes #pos-float-panel (was the leak — cart pill stuck floating)', JSON.stringify(afterX));
  W(!afterX.dock, '✕ close ALSO removes #pos-dock (⋯ dock, was the leak)', JSON.stringify(afterX));
  W(cons.some(l => l === '§POS-HOME closed dispose=float+dock'), '§POS-HOME logged the teardown on the ✕ path (not just dock-Home)');

  // ── re-open POS after a ✕ close — must be a single clean instance, never a stacked duplicate ──
  cons.length = 0;
  await page.evaluate(() => { const b = document.getElementById('pill-pos'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(600);
  const reopened = await page.evaluate(() => ({
    floats: document.querySelectorAll('#pos-float-panel').length,
    docks: document.querySelectorAll('#pos-dock').length,
    overlays: document.querySelectorAll('#posted-overlay').length
  }));
  W(reopened.floats === 1 && reopened.docks === 1 && reopened.overlays === 1, 'reopen after ✕-close → exactly ONE of each (no stacked duplicates)', JSON.stringify(reopened));

  // ── the dock Home path (⋯ → home icon) still fully closes too ──
  await page.evaluate(() => { const t = document.getElementById('pos-dock-trigger'); if (t) t.dispatchEvent(new PointerEvent('click', { bubbles: true })); });
  await sleep(200);
  const homeBtns = await page.$$('#pos-dock-items .pos-dock-item');
  if (homeBtns[0]) await homeBtns[0].dispatchEvent('pointerup');
  await sleep(300);
  const afterHome = await page.evaluate(() => ({
    overlay: !!document.getElementById('posted-overlay'),
    float: !!document.getElementById('pos-float-panel'),
    dock: !!document.getElementById('pos-dock')
  }));
  W(!afterHome.overlay && !afterHome.float && !afterHome.dock, '⋯ → Home still fully closes (overlay+float+dock)', JSON.stringify(afterHome));

  console.log(log.join('\n'));
  const pass = log.filter(l => l.startsWith('🟢')).length;
  console.log('\nW-POS-CLOSE-LEAK ' + pass + '/' + log.length);
  fs.writeFileSync(path.join(__dirname, 'poc_pos_close_leak.log'), log.join('\n') + '\n\n' + cons.filter(t => /§POS|PAGEERR/.test(t)).slice(0, 40).join('\n'));
  await browser.close(); server.close(); process.exit(pass === log.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
