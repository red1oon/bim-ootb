// ⚠ DO NOT REMOVE — Scope guard
// Scope: prompts/PILL_DRAWER_REORGANIZATION.md §2026-07-06 REOPENED — 3 items. Real-browser proof
// (not code-reading alone) for the 2 code fixes made this session + confirms item 2 is a genuine
// new-feature ask now closed via reused native-button semantics, not built as new custom nav.
//   Item 1: master pill (#pill-navigate/#pill-inspect/#pill-camview) must de-highlight when its
//     drawer is closed via the explicit ✕ — _buildMasterDrawer's onClose now also calls
//     _syncPillHighlights() (viewer/panels.js), matching the existing Palette/Settings pattern.
//   Item 2: Tab-to-a-drawer-row + Space/Enter must fire that row's action. Rows are real <button>
//     elements (native Tab focus already worked) — added a 'click' listener gated on
//     event.detail===0 (the synthetic click Space/Enter produces; a real mouse click always has
//     detail>=1) so keyboard activation fires without double-firing on real pointer clicks.
//   Item 3: Shadow+Ground cloud-icon cycle — the 'shadow' action's fn checked a bare `toggleShadow`
//     identifier instead of `A.toggleShadow`; fixed to call A.toggleShadow() directly (removes the
//     indirection entirely, the concrete failure mode item 3's own candidate-1 flagged).
// §-log first — READ tests/witness_pill_drawer_followup_2026-07-06.log before any conclusion.
// Run:  node viewer/tests/witness_pill_drawer_followup_2026-07-06.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const cons = [], errs = [];
  page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await browser.close(); server.close(); process.exit(1); }

  // Rail icons live inside #mobile-pill, revealed by #mobile-trigger (same overflow drawer at
  // both viewport sizes in this codebase — confirmed via witness_class_outline_live.js precedent).
  let triggerClicked = true;
  try { await page.click('#mobile-trigger', { timeout: 5000 }); } catch (e) { triggerClicked = false; log.push('  [trigger-click-err] ' + e.message); }
  verdict(triggerClicked, 'clicked #mobile-trigger to reveal the overflow pill rail');
  await page.waitForTimeout(300);

  // ── Item 1: master pill de-highlights on explicit ✕ close ──────────────────────────────────
  S('\n── Item 1: master de-highlight on ✕ close ──');
  await page.click('#pill-navigate', { timeout: 5000 });
  await page.waitForTimeout(200);
  let activeAfterOpen = await page.evaluate(() => document.getElementById('pill-navigate').classList.contains('active'));
  verdict(activeAfterOpen, 'pill-navigate highlighted after opening the drawer');
  const closeSel = '#navigate-drawer-panel .bim-panel-close, #navigate-drawer-panel [class*=close]';
  let closed = true;
  try { await page.click(closeSel, { timeout: 5000 }); } catch (e) { closed = false; log.push('  [close-click-err] ' + e.message); }
  verdict(closed, 'clicked the drawer panel\'s explicit ✕');
  await page.waitForTimeout(200);
  const panelHidden = await page.evaluate(() => {
    var p = document.getElementById('navigate-drawer-panel');
    return !p || p.style.display === 'none';
  });
  verdict(panelHidden, 'Navigate panel actually closed');
  let activeAfterClose = await page.evaluate(() => document.getElementById('pill-navigate').classList.contains('active'));
  verdict(!activeAfterClose, 'pill-navigate de-highlighted after ✕ close (the bug under test)');

  // ── Item 2: Tab + Space fires a drawer row's action (native button, no custom nav needed) ──
  S('\n── Item 2: Tab-focus + Space activates a drawer row ──');
  await page.click('#pill-inspect', { timeout: 5000 });
  await page.waitForTimeout(200);
  const rowFocusable = await page.evaluate(() => {
    var row = document.getElementById('drawer-row-section');
    return !!row && row.tabIndex >= 0 && row.tagName === 'BUTTON';
  });
  verdict(rowFocusable, 'a drawer row (section-cut) is a real focusable <button> (native Tab reaches it)');
  await page.evaluate(() => document.getElementById('drawer-row-section').focus());
  const focusLanded = await page.evaluate(() => document.activeElement && document.activeElement.id === 'drawer-row-section');
  verdict(focusLanded, 'focus actually landed on the row');
  const sectionBefore = await page.evaluate(() => !!(window.APP && window.APP.sectionOn));
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const keyRowLogFired = cons.some(l => l.includes('§DRAWER_ROW_KEY action=section'));
  verdict(keyRowLogFired, '§DRAWER_ROW_KEY fired for the Space-activated row (not silently swallowed)');
  const sectionAfter = await page.evaluate(() => !!(window.APP && window.APP.sectionOn));
  verdict(sectionAfter !== sectionBefore, 'Section Cut actually toggled from the keyboard activation', 'before=' + sectionBefore + ' after=' + sectionAfter);
  // toggle back off so it doesn't leak into later checks
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);

  // ── Item 3: Shadow+Ground cloud-icon cycle actually fires A.toggleShadow ────────────────────
  S('\n── Item 3: Shadow+Ground cloud-icon cycle ──');
  await page.click('#pill-navigate', { timeout: 5000 }).catch(() => {}); // reopen if a prior click order closed it — no-op if already closed
  await page.click('#pill-camview', { timeout: 5000 }); // ensure inspect/camview both openable without interference
  await page.waitForTimeout(150);
  // Open Visual FX (Palette) to reach the real shadow-ground cloud button
  await page.click('#pill-palette', { timeout: 5000 });
  await page.waitForTimeout(300);
  const keyBefore = await page.evaluate(() => window.APP && window.APP._shadowGroundKey);
  let cloudClicked = true;
  try { await page.click('#shadow-ground-cloud-btn', { timeout: 5000 }); } catch (e) { cloudClicked = false; log.push('  [cloud-click-err] ' + e.message); }
  verdict(cloudClicked, 'clicked the REAL cloud icon button');
  await page.waitForTimeout(200);
  const cycleLogFired = cons.some(l => l.includes('§SHADOW_GROUND cycle='));
  verdict(cycleLogFired, '§SHADOW_GROUND cycle= log line fired (A.toggleShadow actually ran)');
  const swatchLogFired = cons.some(l => l.includes('§SHADOW_GROUND_SWATCH key='));
  verdict(swatchLogFired, '§SHADOW_GROUND_SWATCH key= log line fired');
  const keyAfter = await page.evaluate(() => window.APP && window.APP._shadowGroundKey);
  verdict(keyAfter !== keyBefore, 'A._shadowGroundKey actually advanced', 'before=' + keyBefore + ' after=' + keyAfter);
  const shadowOnMatches = await page.evaluate(() => {
    var on = !!window.APP._shadowOn;
    var key = window.APP._shadowGroundKey;
    return key === 'off' ? !on : on;
  });
  verdict(shadowOnMatches, 'A._shadowOn matches the new cycle state (off => shadow off, else shadow on)');

  verdict(errs.length === 0, '0 page errors', errs.join(' | '));

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILURE(S)'));
  fs.writeFileSync(path.join(__dirname, 'witness_pill_drawer_followup_2026-07-06.log'), log.join('\n'));
  await page.close(); await browser.close(); server.close();
  process.exit(fails === 0 ? 0 : 1);
})();
