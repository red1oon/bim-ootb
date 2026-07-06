// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser proof for RESUME_HR_BIM_ASSET.md §2026-07-06d (Human-Asset pill desync).
//   User report: "Human-Asset icon does not go off when press again." Root cause: the hbaFM
//   ("Human-Asset") drawer's own ✕ close button (viewer/hba_lens.js openFamilyDrawer) removed the
//   #hba-fm-drawer DOM node but never called _syncPillHighlights() — the same bug class already
//   fixed for the Navigate/Inspect/Camera-View master drawers (PILL_DRAWER_REORGANIZATION.md Item 1,
//   panels.js's _buildMasterDrawer onClose) but left unpatched on this older, hand-rolled drawer.
//   Re-tapping the pill itself already worked (pill_builder.js calls act.fn(); _sync(); on every
//   click) — only the in-drawer ✕ path was desynced.
// Drives the REAL viewer.html + HHS_Office_Federated_extracted.db, real user click path (pill open
// -> ✕ close), not a seam/unit test. Read the log after the run, not just the exit code.
// Run:  node viewer/tests/witness_hba_pill_desync_fix.js
'use strict';
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
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
      && window.APP.streaming === false && window.APP._hbaRooms && window.APP._hbaRooms.length > 0)); } catch (e) {}
  }
  return ready;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-HBA-PILL-DESYNC — Human-Asset (hbaFM) pill must de-highlight when its drawer is closed via ✕');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'load', timeout: 60000 });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await browser.close(); server.close(); process.exit(1); return; }

  await page.click('#mobile-trigger').catch(() => {});
  await page.waitForTimeout(300);

  // ── step 1: open the drawer via the pill, confirm it opens + pill highlights ──
  await page.click('#pill-hbaFM');
  await page.waitForTimeout(300);
  const afterOpen = await page.evaluate(() => ({
    drawerExists: !!document.getElementById('hba-fm-drawer'),
    pillActive: document.getElementById('pill-hbaFM').classList.contains('active')
  }));
  verdict(afterOpen.drawerExists, 'drawer opened on pill click', JSON.stringify(afterOpen));
  verdict(afterOpen.pillActive, 'pill highlighted (active class) while drawer open', JSON.stringify(afterOpen));

  // ── step 2: close via the drawer's OWN ✕ button (NOT re-tapping the pill) — this is the exact
  //    path the user reported as broken; re-tapping the pill already worked before this fix. ──
  await page.click('#hba-fm-drawer button[data-role="close"]');
  await page.waitForTimeout(300);
  const afterClose = await page.evaluate(() => ({
    drawerExists: !!document.getElementById('hba-fm-drawer'),
    pillActive: document.getElementById('pill-hbaFM').classList.contains('active')
  }));
  verdict(!afterClose.drawerExists, 'drawer removed by ✕', JSON.stringify(afterClose));
  verdict(!afterClose.pillActive, 'pill goes OFF (active class removed) after ✕ close — the reported bug', JSON.stringify(afterClose));

  // ── step 3: re-open via the pill still works (proves the fix did not break the open path) ──
  await page.click('#pill-hbaFM');
  await page.waitForTimeout(300);
  const reopened = await page.evaluate(() => ({
    drawerExists: !!document.getElementById('hba-fm-drawer'),
    pillActive: document.getElementById('pill-hbaFM').classList.contains('active')
  }));
  verdict(reopened.drawerExists && reopened.pillActive, 'pill re-opens + re-highlights cleanly after the ✕-close/resync cycle', JSON.stringify(reopened));

  verdict(errs.length === 0, '0 pageerrors', errs.slice(0, 5).join(' | '));

  const pass = fails === 0;
  S('\n§W-HBA-PILL-DESYNC ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'witness_hba_pill_desync_fix.log'), log.join('\n'));
  await page.close(); await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
