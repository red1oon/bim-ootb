// ⚠ DO NOT REMOVE — Scope guard
// Scope: "Find box appears on its own at onset" + "Find panel renders above browser top border" —
// open since §FIND_VIS_TRACE diagnostics were added 2026-07-06, root cause never traced (the
// MutationObserver trace only fires on INLINE style flips, and the onset appearance involved none).
// TWO-PART ROOT CAUSE (one report, one mechanism), fixed in viewer/navigate_find.js's own CSS rule:
//   Part 1 — visible at onset: NavigateFind.init() builds #find-panel and appendChild()s it with
//     NO display set. The shared .bim-panel class (viewer.html) sets position:fixed but NOT
//     display:none, and a <div> defaults to display:block — so the instant ANY boot path
//     eager-loads the navigate modules without opening Find (e.g. main.js §ZOOM-SCOPE share links
//     call APP.loadNavigate() at boot), the panel was visible. Every sibling panel avoids this
//     (wizard.js self-declares its CSS; panels.js A.createPanel() explicitly hides on creation).
//     Fix: the #find-panel rule now self-declares `position:fixed; display:none`.
//   Part 2 — above the top border: the rule used to center via `top:50%; translateY(-50%)`.
//     panels.js §PANEL-AUTOPLACE fires on the panel's first style mutation (init-time —
//     _makeDraggable's cursor write; inline display '' ≠ 'none') and overwrites top to 54px
//     inline, but never clears the CSS transform → the panel rendered half its height ABOVE
//     top:54 (measured top=-101.5, height 311, 1400×900 desktop — this witness, first run).
//     Fix: desktop CSS declares top:54px with NO transform (the ≤600px media query already had
//     its own top:60/transform:none, which is why mobile never showed the off-screen half).
// This witness proves, on a REAL loaded building, per viewport (desktop 1400px + iPhone 13):
//   1. REGRESSION Part 1: model loaded, zero interaction → #find-panel is NOT in the DOM (lazy
//      module). Then APP.loadNavigate() WITHOUT opening (the exact field onset path) → panel is
//      in the DOM but computed display is 'none', and no §FIND_VIS_TRACE display=block fired.
//   2. REGRESSION Part 2 + real user path: #pill-navigate rail pill → Navigate drawer →
//      #drawer-row-find (fires A.openFindPanel('')) → panel visible, rect top >= 0 (NOT above
//      the browser top border), fully on-screen horizontally.
//   3. Tapping #drawer-row-find again (openFindPanel's documented toggle) returns display to
//      'none', and §FIND_VIS_TRACE logged both the open and close inline-style flips.
// §-log first — READ tests/witness_find_panel_hidden_onload_2026-07-11.log before any conclusion.
// Run:  node viewer/tests/witness_find_panel_hidden_onload_2026-07-11.js
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

function panelState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('find-panel');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { computedDisplay: getComputedStyle(el).display, inlineDisplay: el.style.display,
      top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

async function tap(page, id) {
  // dispatch-click via evaluate — bypasses actionability/overlap checks, same convention as
  // witness_pill_drawer_mobile_position_2026-07-11.js (an open sibling panel legitimately
  // overlapping the rail is a pre-existing layout fact unrelated to this bug).
  const hit = await page.evaluate((eid) => {
    const el = document.getElementById(eid);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, id);
  await page.waitForTimeout(400);
  return hit;
}

async function runViewport(browser, label, ctxOpts, openRail) {
  S('── ' + label + ' ──');
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { const t = m.text(); cons.push(t);
    if (t.indexOf('§FIND_VIS_TRACE') === 0) log.push('  [console] ' + t.split('\n')[0]); });
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await ctx.close(); return; }

  // 1a. Cold onset: navigate modules are lazy — panel must not exist yet (nothing eager-loaded).
  const cold = await panelState(page);
  verdict(cold === null, 'cold onset: #find-panel not in DOM (navigate modules lazy, nothing loaded them)',
    cold ? 'UNEXPECTEDLY PRESENT computed=' + cold.computedDisplay : '');

  // 1b. THE Part-1 regression path: eager-load the navigate modules WITHOUT opening Find —
  // exactly what main.js §ZOOM-SCOPE (share links) does at boot. Pre-fix, the panel became
  // visible right here (display:block <div> default, no inline style, no trace line).
  const loaded = await page.evaluate(() => window.APP.loadNavigate().then(() => true).catch(e => 'ERR ' + (e && e.message)));
  verdict(loaded === true, 'APP.loadNavigate() eager-load (field onset path, NO open)', String(loaded));
  await page.waitForTimeout(500);
  const onset = await panelState(page);
  verdict(!!onset, '#find-panel now in DOM after module init', onset ? '' : 'element missing');
  if (onset) {
    verdict(onset.computedDisplay === 'none', 'panel hidden after init with zero interaction (THE bug: was visible)',
      'computed=' + onset.computedDisplay + ' inline="' + onset.inlineDisplay + '"');
  }
  const onsetTraceBlock = cons.filter(t => t.indexOf('§FIND_VIS_TRACE display=block') === 0).length;
  verdict(onsetTraceBlock === 0, 'no §FIND_VIS_TRACE display=block before any interaction', 'count=' + onsetTraceBlock);

  // 2. REAL USER PATH open: rail pill Navigate → drawer row Find → A.openFindPanel('')
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await openRail(page);
  const railHit = await tap(page, 'pill-navigate');
  verdict(railHit, 'Navigate rail pill (#pill-navigate) present + tapped');
  const rowHit = await tap(page, 'drawer-row-find');
  verdict(rowHit, 'Find drawer row (#drawer-row-find) present + tapped (fires A.openFindPanel(""))');
  const vw = page.viewportSize().width, vh = page.viewportSize().height;
  const open = await panelState(page);
  const openVisible = !!open && open.computedDisplay !== 'none' && open.width > 0 && open.height > 0;
  verdict(openVisible, 'panel visible after real-path open', open ? 'computed=' + open.computedDisplay + ' rect=' + JSON.stringify({ top: open.top, left: open.left, right: open.right, height: open.height }) : 'element missing');
  if (openVisible) {
    verdict(open.top >= 0, 'panel top >= 0 (NOT above browser top border — Part-2 regression)', 'top=' + open.top.toFixed(1) + ' vh=' + vh);
    verdict(open.left >= 0 && open.right <= vw, 'panel horizontally on-screen', 'left=' + open.left.toFixed(1) + ' right=' + open.right.toFixed(1) + ' vw=' + vw);
  }
  const openTrace = cons.filter(t => t.indexOf('§FIND_VIS_TRACE display=block') === 0).length;
  verdict(openTrace >= 1, '§FIND_VIS_TRACE logged the open (display=block inline-style flip)', 'count=' + openTrace);

  // 3. Toggle-close via the SAME real path (openFindPanel with no term + open panel ⇒ close).
  await tap(page, 'drawer-row-find');
  const closed = await panelState(page);
  verdict(!!closed && closed.computedDisplay === 'none', 'panel display back to none after toggle-close',
    closed ? 'computed=' + closed.computedDisplay + ' inline="' + closed.inlineDisplay + '"' : 'element missing');
  const closeTrace = cons.filter(t => t.indexOf('§FIND_VIS_TRACE display=none') === 0).length;
  verdict(closeTrace >= 1, '§FIND_VIS_TRACE logged the close (display=none inline-style flip)', 'count=' + closeTrace);

  await page.close(); await ctx.close();
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();

  await runViewport(browser, 'Desktop (1400×900)', { viewport: { width: 1400, height: 900 } },
    async (page) => { await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(300); });

  S('');
  await runViewport(browser, 'Mobile (iPhone 13, 390px wide)', { ...devices['iPhone 13'] },
    async (page) => { await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); }); await page.waitForTimeout(300); });

  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_find_panel_hidden_onload_2026-07-11.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
