// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the §OUTSTANDING "no buttons outside the pill" item.
//   PROVES (registry concept from BIM OOTB applied to erp.html):
//     1. §VERIFY-PILL-MOUNTED — the Verify-ledger control is now a REGISTERED pill (pills.json id=verify,
//        checkList glyph), NOT a free-floating button. DOM: zero #verify-ledger-pill; pill-verify present.
//     2. §SWITCHER-GONE — the System/GardenWorld client switcher (two buttons outside the pill) is removed:
//        zero buttons whose text is exactly "System" or "GardenWorld".
//     3. §NO-ICON-MISS — the verify pill icon resolves (no §PILL_ICON_MISS verify), no pageerror.
//   Issue it disproves: "the redundant top/floating buttons still render outside the pill rail."
//   §-log first — READ tests/poc_pill_registry.log before any conclusion.
// Run:  node tests/poc_pill_registry.js 2>&1 | tee tests/poc_pill_registry.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');                       // bim-ootb/erp
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
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/erp.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);                              // let DB + pills settle

  // Open the pill rail so its buttons are in the DOM
  const trigger = await page.$('#erp-pill-trigger');
  if (trigger) { await trigger.click(); await page.waitForTimeout(400); }

  const verifyPill   = await page.$$eval('#erp-pill button[id^="pill-"]',
    bs => bs.map(b => b.id)).catch(() => []);
  const floatingBtn  = await page.$('#verify-ledger-pill');
  const switcherBtns = await page.$$eval('button',
    bs => bs.filter(b => /^(System|GardenWorld)$/.test((b.textContent||'').trim())).length);
  // gbHud companion links lived OUTSIDE the pill as <a> with these texts — must be gone now
  const hudLinks     = await page.$$eval('a',
    as => as.filter(a => /Glassbowl|Gravity|Read/.test((a.textContent||''))).map(a => a.textContent.trim()));
  const hudGoneLog   = logs.find(l => l.includes('gbHud-removed')) || '(no gbHud log)';
  const manifest     = logs.find(l => l.startsWith('§PILL-MANIFEST')) || '(no manifest)';
  const switcherLog  = logs.find(l => l.includes('switcher-removed')) || '(no switcher log)';
  const iconMiss     = logs.filter(l => l.includes('§PILL_ICON_MISS')).join(' | ') || 'none';

  console.log('§VERIFY-PILL-MOUNTED pill-verify=' + (verifyPill.includes('pill-verify')) +
    ' floatingButton=' + (floatingBtn ? 'PRESENT' : 'gone') + ' allPills=[' + verifyPill.join(',') + ']');
  console.log('§SWITCHER-GONE systemOrGardenworldButtons=' + switcherBtns + ' log=' + switcherLog);
  console.log('§HUD-GONE companionLinksOutsidePill=[' + hudLinks.join(',') + '] log=' + hudGoneLog);
  console.log('§ERPDOC-PILL pill-erpdoc=' + verifyPill.includes('pill-erpdoc') +
    ' glassbowl/gravity-in-rail=' + (verifyPill.includes('pill-glassbowl') && verifyPill.includes('pill-gravity')));
  console.log('§NO-ICON-MISS iconMiss=' + iconMiss + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  console.log('§MANIFEST ' + manifest);

  await page.screenshot({ path: path.join(__dirname, 'pill_registry.png') });

  const pass = verifyPill.includes('pill-verify') && !floatingBtn && switcherBtns === 0 &&
    hudLinks.length === 0 && verifyPill.includes('pill-erpdoc') &&
    iconMiss === 'none' && errs.length === 0;
  console.log('§PILL-REGISTRY ' + (pass ? 'PASS' : 'FAIL'));

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
