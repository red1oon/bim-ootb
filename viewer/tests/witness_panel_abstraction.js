// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser proof for RESUME_HR_BIM_ASSET.md §2026-07-06d (Human-Asset pill desync +
//   generalized panel abstraction). User ask, verbatim intent: solve the pill-desync bug once and
//   for all — abstract/generalize so a FUTURE icon/drawer doesn't repeat the same class of bug, and
//   confirm the abstraction gives every panel Tab/Arrow row navigation and draggable + close-by-×.
// Proves, against the Human-Asset drawer as the flagship migrated instance (viewer/hba_lens.js's
// openFamilyDrawer, now built on top of viewer/panels.js's A._makeDraggable/A._placePanel + the
// existing viewer/panel_nav.js module instead of hand-rolled DOM):
//   D1 draggable   — A._makeDraggable was applied (cursor:grab side effect)
//   D2 arrow-nav   — ArrowDown moves focus between the drawer's own lens rows (viewer/panel_nav.js)
//   D3 auto-place  — A._placePanel actually ran (§PANEL_PLACE log line), not a hardcoded position
//   M1 mobile, stays a floating overlay — deliberately NOT folded into G.HbaPaneHost's card-stack.
//                     A first attempt did fold it in; live-testing (poc_hba_mobile_stack.js) showed
//                     that conflates two roles — the drawer is the PICKER used to open more panes,
//                     so it can never legitimately reach "zero cards" alongside its own content, and
//                     swiping through the deck would displace the very picker needed to browse the
//                     rest. This matches the file's own pre-existing syncLauncher(), which already
//                     treats 'hba-fm-drawer' as a persistent launcher chip, never stack content.
//   M2 mobile close — the drawer's own ✕ still removes it cleanly (no residue), independent of
//                     whatever panes are open in the stack alongside it.
// Drives the REAL viewer.html + HHS_Office_Federated_extracted.db, real user click/keyboard path.
// Read the log after the run, not just the exit code.
// Run:  node viewer/tests/witness_panel_abstraction.js
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
  const url = 'http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated';

  // ══ DESKTOP — drag / arrow-nav / auto-place ═══════════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const cons = []; const errs = [];
    page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
    page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });
    S('§W-PANEL-ABSTRACTION — desktop (draggable / arrow-nav / auto-place)');
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const ready = await waitReady(page);
    verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
    if (ready) {
      await page.click('#mobile-trigger').catch(() => {});
      await page.waitForTimeout(300);
      await page.click('#pill-hbaFM');
      await page.waitForTimeout(300);

      // D1 — draggable: A._makeDraggable sets cursor:grab as its first action on the element.
      const cursor = await page.evaluate(() => { var d = document.getElementById('hba-fm-drawer'); return d && d.style.cursor; });
      verdict(cursor === 'grab', 'D1 drawer is draggable (A._makeDraggable applied, cursor:grab)', 'cursor=' + cursor);

      // D3 — auto-place: the §PANEL_PLACE log line proves A._placePanel actually ran for this id
      // (rather than the drawer keeping its old hardcoded fixed position untouched).
      const placed = cons.some(c => c.indexOf('§PANEL_PLACE') >= 0 && c.indexOf('hba-fm-drawer') >= 0);
      verdict(placed, 'D3 A._placePanel ran for the drawer (§PANEL_PLACE log line seen)', cons.filter(c => c.indexOf('PANEL_PLACE') >= 0).join(' | '));

      // D2 — arrow-nav: PanelNav only routes ArrowDown to a panel once scene.js's panel-focus model
      // (_focusedPanel) actually points at it — that happens on a real pointerdown ANYWHERE inside
      // the panel (viewer/scene.js's _registerPanel), not a bare DOM .focus() call. Click the drawer
      // header (neutral — not a lens-row button, so it doesn't also toggle a lens) to establish
      // focus, THEN drive two ArrowDown presses and confirm PanelNav's own row highlight (§panel_nav.js
      // _highlightItem) lands on row 0 then row 1 (its zone starts at index -1, so the FIRST
      // ArrowDown lands on the first row, not the second).
      const rowIds = await page.evaluate(() => Array.from(document.querySelectorAll('#hba-fm-rows button:not([disabled])')).map(b => b.getAttribute('data-lens')));
      if (rowIds.length >= 2) {
        await page.click('#hba-fm-drawer div:has-text("Human-Asset")').catch(() => {});
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(150);
        const out0 = await page.evaluate((id) => { var b = document.querySelector('#hba-fm-rows button[data-lens="' + id + '"]'); return b && b.style.outline; }, rowIds[0]);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(150);
        const out0b = await page.evaluate((id) => { var b = document.querySelector('#hba-fm-rows button[data-lens="' + id + '"]'); return b && b.style.outline; }, rowIds[0]);
        const out1 = await page.evaluate((id) => { var b = document.querySelector('#hba-fm-rows button[data-lens="' + id + '"]'); return b && b.style.outline; }, rowIds[1]);
        verdict(!!out0 && out0.indexOf('none') < 0, 'D2a first ArrowDown highlights row 0 (zone starts at index -1)', 'row0.outline=' + out0);
        verdict((!out0b || out0b.indexOf('none') >= 0 || out0b === '') && !!out1 && out1.indexOf('none') < 0,
          'D2b second ArrowDown moves the highlight from row 0 to row 1', 'row0.outline=' + out0b + ' row1.outline=' + out1);
      } else {
        verdict(false, 'D2 ArrowDown moves PanelNav focus across rows', 'SKIPPED — fewer than 2 available rows in this building: ' + JSON.stringify(rowIds));
      }

      verdict(errs.length === 0, '0 pageerrors (desktop)', errs.slice(0, 5).join(' | '));
    }
    await page.close();
  }

  // ══ MOBILE — drawer stays a floating overlay (deliberately outside HbaPaneHost's stack) ══════
  {
    // hasTouch/isMobile make navigator.maxTouchPoints > 0 true under real Chromium, so
    // viewer/config.js's OWN detection (`window._isMobile = 'ontouchstart' in window ||
    // navigator.maxTouchPoints > 0`) naturally computes true — an addInitScript override would get
    // clobbered the moment config.js's <script> runs later in the same page load.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errs = [];
    page.on('console', m => log.push('  [console] ' + m.text()));
    page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });
    S('§W-PANEL-ABSTRACTION — mobile @390px (Human-Asset drawer stays a floating overlay)');
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const ready = await waitReady(page);
    verdict(ready, 'real model loaded + ready, mobile (HHS_Office_Federated)');
    if (ready) {
      await page.click('#mobile-trigger').catch(() => {});
      await page.waitForTimeout(300);
      await page.click('#pill-hbaFM');
      await page.waitForTimeout(400);

      // M1 — the drawer opens fine on mobile and is NOT one of HbaPaneHost's cards (it stays the
      // separate launcher chip syncLauncher() already assumes it is).
      const st1 = await page.evaluate(() => ({
        drawerExists: !!document.getElementById('hba-fm-drawer'),
        inStack: !!(window.HbaPaneHost && window.HbaPaneHost._state().ids.indexOf('hba-fm-drawer') >= 0)
      }));
      verdict(st1.drawerExists && !st1.inStack, 'M1 drawer opens on mobile as a floating overlay, NOT a HbaPaneHost stack card', JSON.stringify(st1));

      // M2 — the drawer's own ✕ still removes it cleanly, independent of the (empty, here) stack.
      try {
        await page.click('#hba-fm-drawer button[data-role="close"]', { timeout: 5000 });
      } catch (e) { log.push('  [M2 click error] ' + e); }
      await page.waitForTimeout(300);
      const goneCheck = await page.evaluate(() => !document.getElementById('hba-fm-drawer'));
      verdict(goneCheck, 'M2 ✕ removes the drawer cleanly on mobile (zero residue)');

      verdict(errs.length === 0, '0 pageerrors (mobile)', errs.slice(0, 5).join(' | '));
    }
    await page.close();
  }

  await browser.close(); server.close();
  const pass = fails === 0;
  S('\n§W-PANEL-ABSTRACTION ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'witness_panel_abstraction.log'), log.join('\n'));
  process.exit(pass ? 0 : 1);
})();
