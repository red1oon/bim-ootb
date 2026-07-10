#!/usr/bin/env node
// witness_find_panel_vis_onload.js — W-FIND-VIS-ONLOAD
//
// ISSUE UNDER TEST (names the issue per TestArchitecture rule): the untraced
// "Find box appears on its own at onset" bug (§FIND_VIS_TRACE, open since 2026-07-06,
// recorded in bim-compiler prompts/RESUME_SESSION_2026-07-06_WATCHDOG.md).
// ROOT CAUSE: #find-panel is appended to the DOM during NavigateFind.init() with NO
// display default — .bim-panel (viewer.html) sets position:fixed but NOT display:none,
// and no inline style.display is set at creation, so the panel rendered as a plain
// visible block the instant it hit the DOM. Every sibling panel avoids this (panels.js
// createPanel() hides on creation; wizard.js self-declares).
// FIX UNDER TEST: navigate_find.js injected CSS now gives #find-panel its own
// `position: fixed; ... display: none;` default (§FIND-PANEL-FIX 2026-07-11).
//
// WHY THE 2026-07-06 SYNTHETIC REPRO FAILED: navigate_find.js is LAZY-loaded
// (main.js APP.loadNavigate(), "78KB saved on first paint") — a cold load never even
// creates the panel, so cold-load checks stayed hidden. The panel is appended the
// moment ANY feature triggers loadNavigate WITHOUT opening the panel (zoom-scope
// ?find= param, tools.js Alt+X fallback, nav wiring…) — and in THAT path nothing
// ever set display, so it popped visible "on its own".
//
// PROOF PLAN (real user path — full building URL, not the Hub picker):
//   §FIND_VIS_ONLOAD  full model load, then trigger APP.loadNavigate() exactly as any
//                     lazy consumer does (NOT openFindPanel) → panel now exists AND
//                     computed display:none, position:fixed; no §FIND_VIS_TRACE
//                     flip-to-block ever fires with zero user input.
//   §FIND_VIS_FALSIFIER strip the new `display: none` token from the injected rule
//                     in-page → computed display flips to 'block' (i.e. WITHOUT the
//                     fix the panel is visible on load — the bug, reproduced at last).
//   §FIND_VIS_OPEN    restore rule; A.openFindPanel() → 'block'; closeFindPanel → 'none'
//                     (the display:none default cannot trap the panel shut).
//   §FIND_VIS_ERRORS  zero PAGEERRORs.
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');                       // this worktree
const BLD_FALLBACK = '/home/red1/bim-ootb/buildings';          // Duplex db lives here (read-only)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css',
  '.wasm': 'application/wasm', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p);
  if (!fs.existsSync(f) && p.startsWith('/buildings/')) f = path.join(BLD_FALLBACK, p.slice('/buildings/'.length));
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log(`  ${c ? '✓' : '✗ FAIL'} ${m}`); };

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const URL = `http://localhost:${port}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
  console.log('═══ W-FIND-VIS-ONLOAD — Find panel must NOT be visible on page load ═══');
  console.log('  url=' + URL);
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const logs = [], errors = [];
  page.on('console', m => { const t = m.text(); logs.push(t); if (t.includes('§FIND_VIS_TRACE')) console.log('  [PAGE] ' + t.split('\n')[0]); });
  page.on('pageerror', e => { errors.push(String(e)); console.log('  [PAGE] PAGEERROR ' + e); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ── full model load first (the panel does NOT exist yet — it's lazy) ──
  await page.waitForFunction(() => {
    const A = window.A || window.APP;
    return A && A.db && A.meshCache && Object.keys(A.meshCache).length > 0;
  }, { timeout: 180000 }).catch(e => console.log('  WAIT_FAIL ' + e.message));
  await sleep(1500);
  const preLazy = await page.evaluate(() => !!document.getElementById('find-panel'));
  console.log(`§FIND_VIS_ONLOAD pre-lazy panelExists=${preLazy} (lazy module — expected false)`);
  ok(preLazy === false, `cold load alone never creates the panel (why 07-06 repro failed) [exists=${preLazy}]`);

  // ── §FIND_VIS_ONLOAD: trigger the REAL bug path — a lazy consumer loads Navigate
  //    WITHOUT opening the panel. Pre-fix: panel pops visible here. ──
  await page.evaluate(() => (window.A || window.APP).loadNavigate());
  await page.waitForFunction(() => !!document.getElementById('find-panel'), { timeout: 30000 });
  const atInit = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('find-panel'));
    return { display: cs.display, position: cs.position };
  });
  const traceFlips = logs.filter(l => l.includes('§FIND_VIS_TRACE') && l.includes('display=block'));
  console.log(`§FIND_VIS_ONLOAD after-loadNavigate display=${atInit.display} position=${atInit.position} traceFlipsToBlock=${traceFlips.length}`);
  ok(atInit.display === 'none', `panel hidden the moment lazy-load appends it (the bug moment) [display=${atInit.display}]`);
  ok(atInit.position === 'fixed', `panel self-declares position:fixed [position=${atInit.position}]`);
  ok(traceFlips.length === 0, `no §FIND_VIS_TRACE flip-to-block fired without user input [${traceFlips.length}]`);

  // ── §FIND_VIS_FALSIFIER: remove ONLY the new display:none token → the bug reappears ──
  const falsified = await page.evaluate(() => {
    const st = Array.from(document.querySelectorAll('style'))
      .find(s => s.textContent.includes('#find-panel { position: fixed;'));
    if (!st) return { found: false };
    st._orig = st.textContent;
    st.textContent = st.textContent.replace('overflow: hidden; display: none; }', 'overflow: hidden; }');
    window.__findVisStyle = st;
    return { found: true, display: getComputedStyle(document.getElementById('find-panel')).display };
  });
  console.log(`§FIND_VIS_FALSIFIER ruleFound=${falsified.found} display-without-fix=${falsified.display}`);
  ok(falsified.found, `injected #find-panel rule located in-page`);
  ok(falsified.display === 'block', `WITHOUT the fix the panel IS visible on load — bug reproduced [display=${falsified.display}]`);

  // ── §FIND_VIS_OPEN: restore fix; open/close still work (display:none default can't trap it) ──
  const openClose = await page.evaluate(() => {
    const st = window.__findVisStyle; if (st && st._orig) st.textContent = st._orig;
    const A = window.A || window.APP;
    const restored = getComputedStyle(document.getElementById('find-panel')).display;
    A.openFindPanel();
    const opened = getComputedStyle(document.getElementById('find-panel')).display;
    A.closeFindPanel();
    const closed = getComputedStyle(document.getElementById('find-panel')).display;
    return { restored, opened, closed };
  });
  console.log(`§FIND_VIS_OPEN restored=${openClose.restored} opened=${openClose.opened} closed=${openClose.closed}`);
  ok(openClose.restored === 'none', `fix restored → hidden again [${openClose.restored}]`);
  ok(openClose.opened === 'block', `openFindPanel() still opens the panel [${openClose.opened}]`);
  ok(openClose.closed === 'none', `closeFindPanel() hides it again [${openClose.closed}]`);

  console.log(`§FIND_VIS_ERRORS pageErrors=${errors.length}`);
  ok(errors.length === 0, `zero PAGEERRORs [${errors.length}]`);

  await browser.close(); server.close();
  console.log(`\n═══ W-FIND-VIS-ONLOAD: ${pass}/${pass + fail} ${fail ? '✗ RED' : '🟢 GREEN'} ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('WITNESS_CRASH', e); process.exit(1); });
