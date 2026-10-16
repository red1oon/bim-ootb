// ⚠ DO NOT REMOVE — Scope guard
// Scope: mobile pill-icon flyout drawers (Navigate/Inspect/Camera-View) rendered off-screen on
// mobile — reported as "pill icons that should open a further panel/flyout of sub-icons don't".
// Root cause: viewer/panels.js's _buildMasterDrawer() positioned all 3 drawers with a hardcoded
// `left: 928px` (assumes a >=1158px desktop viewport). A.createPanel's §PANEL-AUTOPLACE
// MutationObserver normally corrects a bad hardcoded position via A._placePanel — but that
// observer explicitly skips mobile (`!window._isMobile`), so on a phone (~375-430px wide) these
// drawers opened fully off-screen: toggle()/isOpen() fired correctly (master pill icon lit
// "active") but nothing was visible or reachable. Fix: mobile gets its own right-anchored
// column (same per-drawer vertical stagger as desktop), independent of autoplace.
// §-log first — READ tests/witness_pill_drawer_mobile_position_2026-07-11.log before any conclusion.
// Run:  node viewer/tests/witness_pill_drawer_mobile_position_2026-07-11.js
'use strict';
const { chromium, devices } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

async function waitReady(page) {
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0
      && window.APP.streaming === false)); } catch (e) {}
  }
  return ready;
}

async function checkDrawer(page, cons, masterId, pillTitle, panelId, vw) {
  // dispatch-click via evaluate — bypasses actionability/overlap checks (a previously-opened
  // sibling drawer can legitimately cover the rail on desktop's tighter columns; that's a
  // pre-existing layout fact unrelated to the mobile-position bug this witness targets).
  await page.evaluate((id) => document.getElementById(id).dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), 'pill-' + masterId);
  await page.waitForTimeout(300);
  const rect = await page.evaluate((pid) => {
    const el = document.getElementById(pid);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, width: r.width };
  }, panelId);
  const onScreen = !!rect && rect.left >= 0 && rect.right <= vw && rect.top >= 0;
  verdict(onScreen, pillTitle + ' drawer fully on-screen', rect ? JSON.stringify(rect) + ' vw=' + vw : 'panel missing');
  // close it explicitly (direct style write) so the next drawer check isn't obscured
  await page.evaluate((pid) => { const el = document.getElementById(pid); if (el) el.style.display = 'none'; }, panelId);
  await page.waitForTimeout(150);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  // ── Mobile: the reported bug ─────────────────────────────────────────────────────────────
  S('── Mobile (iPhone 13, 390px wide): drawers must be on-screen ──');
  const mobileCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const mpage = await mobileCtx.newPage();
  const mcons = [];
  mpage.on('console', m => { log.push('  [console] ' + m.text()); mcons.push(m.text()); });
  await mpage.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'networkidle' });
  const mready = await waitReady(mpage);
  verdict(mready, 'real model loaded + ready on mobile viewport (HHS_Office_Federated)');
  if (mready) {
    await mpage.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
    await mpage.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); });
    await mpage.waitForTimeout(300);
    const vw = mpage.viewportSize().width;
    await checkDrawer(mpage, mcons, 'navigate', 'Navigate', 'navigate-drawer-panel', vw);
    await checkDrawer(mpage, mcons, 'inspect', 'Inspect', 'inspect-drawer-panel', vw);
    await checkDrawer(mpage, mcons, 'camview', 'Camera/View', 'camview-drawer-panel', vw);
  }
  await mpage.close(); await mobileCtx.close();

  // ── Desktop: must be unaffected (same behaviour as before this fix) ─────────────────────────
  S('\n── Desktop (1400px wide): drawers must remain on-screen (unaffected by mobile fix) ──');
  const desktopCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const dpage = await desktopCtx.newPage();
  const dcons = [];
  dpage.on('console', m => { log.push('  [console] ' + m.text()); dcons.push(m.text()); });
  await dpage.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'networkidle' });
  const dready = await waitReady(dpage);
  verdict(dready, 'real model loaded + ready on desktop viewport (HHS_Office_Federated)');
  if (dready) {
    await dpage.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
    await dpage.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
    await dpage.waitForTimeout(300);
    const vw = dpage.viewportSize().width;
    await checkDrawer(dpage, dcons, 'navigate', 'Navigate', 'navigate-drawer-panel', vw);
    await checkDrawer(dpage, dcons, 'inspect', 'Inspect', 'inspect-drawer-panel', vw);
    await checkDrawer(dpage, dcons, 'camview', 'Camera/View', 'camview-drawer-panel', vw);
  }
  await dpage.close(); await desktopCtx.close();

  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_pill_drawer_mobile_position_2026-07-11.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
