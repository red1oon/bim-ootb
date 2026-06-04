// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that the mobile top bar of erp.html survives the pill-registry change.
//   PROVES (issue: "did removing gbHud/switcher + adding pills break the mobile top layout?"):
//     1. §MOB-TOPBAR — the #breadcrumb top bar renders, is full-width, and does NOT horizontally overflow
//        the 390px viewport (no buttons spilling / no h-scroll).
//     2. §MOB-PILLS — the pill rail mounts on mobile (trigger present, pills openable), incl. verify+erpdoc.
//     3. §MOB-CLEAN — no pageerror, no §PILL_ICON_MISS at mobile width.
//   §-log first — READ tests/poc_mobile_topbar.log before any conclusion.
// Run:  node tests/poc_mobile_topbar.js 2>&1 | tee tests/poc_mobile_topbar.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/erp.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/erp.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const bar = await page.$eval('#breadcrumb', el => {
    const r = el.getBoundingClientRect();
    return { exists: true, w: Math.round(r.width), left: Math.round(r.left), top: Math.round(r.top) };
  }).catch(() => ({ exists: false }));
  const docOverflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  const trigger = await page.$('#erp-pill-trigger');
  if (trigger) { await trigger.click(); await page.waitForTimeout(400); }
  const pills = await page.$$eval('#erp-pill button[id^="pill-"]', bs => bs.map(b => b.id)).catch(() => []);
  const iconMiss = logs.filter(l => l.includes('§PILL_ICON_MISS')).join('|') || 'none';

  console.log('§MOB-TOPBAR breadcrumb=' + JSON.stringify(bar) + ' viewport=390 hOverflow=' + docOverflow);
  console.log('§MOB-PILLS trigger=' + (trigger ? 'present' : 'MISSING') + ' count=' + pills.length +
    ' verify=' + pills.includes('pill-verify') + ' erpdoc=' + pills.includes('pill-erpdoc'));
  console.log('§MOB-CLEAN iconMiss=' + iconMiss + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  await page.screenshot({ path: path.join(__dirname, 'mobile_topbar.png') });

  const pass = bar.exists && bar.left === 0 && bar.w === 390 && docOverflow === 0 &&
    !!trigger && pills.includes('pill-verify') && iconMiss === 'none' && errs.length === 0;
  console.log('§MOB-TOPBAR-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
