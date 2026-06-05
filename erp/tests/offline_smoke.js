// ⚠ DO NOT REMOVE — Offline smoke for the ERP Gravity/Glassbowl LOCAL rewire (sw v578).
// PROVES (issue: "clicking Gravity went to remote BIMCompiler GH Pages → dead offline"):
//   §SMOKE-NAV-LOCAL  — gravity pill nav is LOCAL (location.href, same tab), not a new-tab remote open.
//   §SMOKE-NO-LEAK    — loading erp + opening Gravity makes ZERO request to red1oon.github.io/BIMCompiler
//                       (and reports any other external host for visibility).
//   §SMOKE-GRAVITY    — the gravity page renders (§GRAVITY data-fold log fires), served LOCAL.
//   §SMOKE-OFFLINE    — with the network cut, reloading gravity STILL renders from the SW runtime cache
//                       (lazy-sync: visited once online → offline after), not the SW "Offline" fallback.
//   §SMOKE-REGRESSION — core erp.html still loads offline from precache; pills present; zero pageerror.
// §-log first — READ tests/offline_smoke.log before any conclusion.
// Run:  node tests/offline_smoke.js 2>&1 | tee tests/offline_smoke.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/erp.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const host = 'localhost:' + port;
  const logs = [], errs = [], external = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.on('request', r => {
    try { const h = new URL(r.url()).host; if (h !== host && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // ── ONLINE: boot ERP, wait for SW control ──────────────────────────────
  await page.goto(`http://${host}/erp.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // open the pill rail, click Gravity (local nav = same-tab location.href)
  const trig = await page.$('#erp-pill-trigger');
  if (trig) { await trig.click(); await page.waitForTimeout(400); }
  const gravBtn = await page.$('#pill-gravity');
  const navLogBefore = logs.length;
  if (gravBtn) {
    await Promise.all([
      page.waitForURL('**/glassbowl_gravity.html', { timeout: 8000 }).catch(() => {}),
      gravBtn.click(),
    ]);
  }
  await page.waitForTimeout(1500);

  const navLog   = logs.find(l => l.startsWith('§PILL-NAV gravity')) || '(no §PILL-NAV)';
  const gravLog  = logs.find(l => l.startsWith('§GRAVITY')) || '(no §GRAVITY)';
  const urlNow   = page.url();
  const onGravity = /glassbowl_gravity\.html$/.test(urlNow);
  const leaks    = external.filter(u => /red1oon\.github\.io|BIMCompiler/i.test(u));

  console.log('§SMOKE-NAV-LOCAL nav="' + navLog + '" url=' + urlNow + ' sameTab=' + (!/\(new tab\)/.test(navLog)));
  console.log('§SMOKE-GRAVITY rendered=' + onGravity + ' log="' + gravLog + '"');
  console.log('§SMOKE-NO-LEAK bimcompilerLeaks=' + leaks.length + (leaks.length ? ' [' + leaks.join(',') + ']' : '') +
              ' otherExternal=' + JSON.stringify([...new Set(external)].filter(u => !/red1oon/i.test(u))));

  // ── OFFLINE: cut the network, reload gravity → must survive from cache ──
  await ctx.setOffline(true);
  const preReload = logs.length;
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1200);
  const gravOffline = logs.slice(preReload).some(l => l.startsWith('§GRAVITY'));
  const offlineFallback = await page.evaluate(() => document.body && /Open the ERP after a first online visit/.test(document.body.innerText)).catch(() => false);
  console.log('§SMOKE-OFFLINE gravityStillRenders=' + gravOffline + ' swOfflineFallbackShown=' + offlineFallback);

  // ── REGRESSION: core erp.html offline from precache; pills + no errors ──
  const preErp = logs.length;
  await page.goto(`http://${host}/erp.html`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1500);
  const trig2 = await page.$('#erp-pill-trigger');
  if (trig2) { await trig2.click(); await page.waitForTimeout(400); }
  const pills = await page.$$eval('#erp-pill button[id^="pill-"]', bs => bs.map(b => b.id)).catch(() => []);
  console.log('§SMOKE-REGRESSION erpOfflinePills=' + pills.length + ' hasGravityPill=' + pills.includes('pill-gravity') +
              ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await ctx.setOffline(false);
  await page.screenshot({ path: path.join(__dirname, 'offline_smoke.png') }).catch(() => {});

  const pass = onGravity && /glassbowl_gravity\.html/.test(navLog) && !/\(new tab\)/.test(navLog) &&
    gravLog.startsWith('§GRAVITY') && leaks.length === 0 &&
    gravOffline && !offlineFallback &&
    pills.length > 0 && pills.includes('pill-gravity') && errs.length === 0;
  console.log('§OFFLINE-SMOKE ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('SMOKE-ERR', e && e.stack || e); server.close(); process.exit(2); });
