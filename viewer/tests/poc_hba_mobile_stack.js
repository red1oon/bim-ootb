// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the HBA MOBILE CARD-STACK (RESUME_HBA_MOBILE_CARD_STACK.md) against the
//   REAL adapter files (hba_mobile_stack.js + hba_leave.js/hba_payslip.js + hba_lens.js) via the established
//   hr_bim_asset/demo/fm_panel.html harness. window._isMobile is forced (addInitScript) to exercise the mobile
//   branch under headless Chromium (no touch hardware).
//   PROVES (the interaction model the user asked for — open several panes → a swipeable/scrollable deck → tap
//   one full-screen → back/close → land on the deck, "pick up where they left off"):
//     P1  present() re-parents the LIVE leave pane into #hba-card-stack (NOT document.body), mobile focus=0.
//     P2  opening a 2nd pane (payslip) stacks it → 2 cards in the deck, newest is full-screen.
//     P2b back() (minimise) → deck state (focus=-1), BOTH panes still open (nothing removed).
//     P2c tap a deck card → that card goes full-screen (push).
//     P3  carousel(+1/-1) switches focus between full-screen cards WITHOUT returning to the deck.
//     P3b a REAL left-swipe pointer drag (page.mouse) advances the carousel (wiring, not just the state API).
//     P4  the pane's own × close removes ONE card (deck rebuilds to 1); leave×→ host tears down to zero residue.
//     DESK desktop (_isMobile=false) is a provable no-op: leave pane appends to document.body, NO #hba-card-stack.
//     0 pageerrors throughout.
//   NON-INVENT: pure DOM/interaction over panes that already render — no data/geometry touched.
//   §-log first — READ tests/poc_hba_mobile_stack.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_hba_mobile_stack.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/hr_bim_asset/demo/fm_panel.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [], errs = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

// open a lens row in the family drawer (same button the real panels.js click produces).
// On mobile the full-screen card covers the launcher, so first drop to the DECK (real flow: ‹Back → tap lens)
// where the host raises the drawer above the stack (syncLauncher). deckFirst=false for the desktop path.
async function openLens(page, id, deckFirst) {
  if (deckFirst) { await page.evaluate(() => window.HbaPaneHost && window.HbaPaneHost.back()); await page.waitForTimeout(150); }
  // skip rows the drawer greys out (no data for that lens in this building) — return false, don't hang on click
  const avail = await page.evaluate((i) => { const b = document.querySelector('button[data-lens="' + i + '"]'); return b ? !b.disabled : null; }, id);
  if (!avail) return false;
  await page.click('button[data-lens="' + id + '"]');
  await page.waitForTimeout(350);
  return true;
}
function state(page) { return page.evaluate(() => window.HbaPaneHost && window.HbaPaneHost._state()); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  // ══ MOBILE — force _isMobile before any script runs, phone viewport ══════════════════════════════════════════
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => { window._isMobile = true; });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-HBA-MOBILE-STACK — card-stack host over the 6 HBA panes (mobile @390px)');
  await page.goto('http://127.0.0.1:' + port + '/hr_bim_asset/demo/fm_panel.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const hostLoaded = await page.evaluate(() => !!(window.HbaPaneHost && window.HbaPaneHost._isMobile()));
  verdict(hostLoaded, 'P0 host module loaded + reports _isMobile=true');

  // ── P1: open Leave → re-parented into #hba-card-stack (NOT body), full-screen ───────────────────────────────
  await openLens(page, 'leave');
  const p1 = await page.evaluate(() => {
    const pane = document.getElementById('hba-leave-pane');
    const host = document.getElementById('hba-card-stack');
    return {
      paneExists: !!pane,
      parentIsHost: !!(pane && pane.closest('#hba-card-stack')),
      parentIsBody: !!(pane && pane.parentNode === document.body),
      st: window.HbaPaneHost._state()
    };
  });
  verdict(p1.paneExists && p1.parentIsHost && !p1.parentIsBody, 'P1 leave pane re-parented into #hba-card-stack (not body)',
    'host=' + p1.parentIsHost + ' body=' + p1.parentIsBody);
  verdict(p1.st.ids.length === 1 && p1.st.ids[0] === 'hba-leave-pane' && p1.st.focus === 0,
    'P1 state: 1 card, leave full-screen (focus=0)', JSON.stringify(p1.st));

  // ── P2: open Payslip → 2 cards, newest full-screen (drop to deck first — real flow: ‹Back → tap lens) ───────
  await openLens(page, 'payslip', true);
  let st = await state(page);
  verdict(st.ids.length === 2 && st.ids[1] === 'hba-payslip-pane' && st.focus === 1,
    'P2 payslip stacks as 2nd card, opens full-screen (focus=1)', JSON.stringify(st));

  // ── P2b: back() (minimise) → deck, both panes still open ────────────────────────────────────────────────────
  await page.evaluate(() => window.HbaPaneHost.back());
  await page.waitForTimeout(150);
  st = await state(page);
  const deckClass = await page.evaluate(() => document.getElementById('hba-card-stack').className);
  verdict(st.focus === -1 && st.ids.length === 2 && deckClass === 'deck',
    'P2b back → deck (focus=-1), both panes still open, host class="deck"', JSON.stringify(st) + ' class=' + deckClass);

  // ── P2c: tap deck card 0 → full-screen (push) ───────────────────────────────────────────────────────────────
  await page.evaluate(() => document.querySelectorAll('#hba-card-stack .hba-card')[0].click());
  await page.waitForTimeout(150);
  st = await state(page);
  const fsClass = await page.evaluate(() => document.getElementById('hba-card-stack').className);
  verdict(st.focus === 0 && fsClass === 'fs', 'P2c tap deck card 0 → full-screen (focus=0, class="fs")',
    JSON.stringify(st) + ' class=' + fsClass);

  // ── P3: carousel between full-screen cards (state API) ──────────────────────────────────────────────────────
  const car1 = await page.evaluate(() => window.HbaPaneHost.carousel(+1));
  st = await state(page);
  verdict(car1 === true && st.focus === 1 && fsClass === 'fs', 'P3 carousel(+1) → focus=1 without leaving full-screen',
    JSON.stringify(st));
  const carEdge = await page.evaluate(() => window.HbaPaneHost.carousel(+1)); // at end → no-op
  st = await state(page);
  verdict(carEdge === false && st.focus === 1, 'P3 carousel(+1) at the last card is a no-op (stays focus=1)', 'ret=' + carEdge);

  // ── P3b: a REAL left-swipe pointer drag advances the carousel (wiring) ──────────────────────────────────────
  await page.evaluate(() => window.HbaPaneHost.focus(0)); // back to first full-screen card
  await page.waitForTimeout(120);
  // drag left across the focused card: start right-center → left, > threshold(80px)
  await page.mouse.move(320, 420); await page.mouse.down();
  await page.mouse.move(260, 424, { steps: 4 }); await page.mouse.move(160, 426, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(SNAP_WAIT());
  st = await state(page);
  verdict(st.focus === 1, 'P3b real left-swipe drag advanced carousel focus 0→1', JSON.stringify(st));

  // ── P4: pane's own × close removes ONE card (deck rebuilds to 1) ─────────────────────────────────────────────
  // close the payslip pane via ITS OWN × button (the pane's unmount → MutationObserver drop)
  await page.evaluate(() => { const p = document.getElementById('hba-payslip-pane'); if (p) p.querySelector('button').click(); });
  await page.waitForTimeout(300);
  st = await state(page);
  verdict(st.ids.length === 1 && st.ids[0] === 'hba-leave-pane', 'P4 payslip × → removed, 1 card (leave) remains',
    JSON.stringify(st));

  // close leave too → host tears down to zero residue
  await page.evaluate(() => { const p = document.getElementById('hba-leave-pane'); if (p) p.querySelector('button').click(); });
  await page.waitForTimeout(300);
  const residue = await page.evaluate(() => ({
    host: !!document.getElementById('hba-card-stack'),
    style: !!document.getElementById('hba-card-stack-style'),
    count: window.HbaPaneHost.cardCount(),
    leave: !!document.getElementById('hba-leave-pane')
  }));
  verdict(!residue.host && !residue.style && residue.count === 0 && !residue.leave,
    'P4 last × → host + style torn down, zero residue', JSON.stringify(residue));

  // ── P5: ALL SIX panes stack cleanly (phase 4 wiring) + iot timers survive re-parent & stop on unmount ───────
  // lens ids → pane element ids (iot opens via the "maintenance" lens, not a pane row; §P10b line 770)
  const SIX = [['leave', 'hba-leave-pane'], ['payslip', 'hba-payslip-pane'], ['dash', 'hba-dash-pane'],
    ['tenancy', 'hba-tenancy-pane'], ['bom', 'hba-bom-pane'], ['maintenance', 'hba-iot-pane']];
  let openedIds = [];
  for (const [lens, paneId] of SIX) {
    const ok = await openLens(page, lens, true);
    if (ok) openedIds.push(paneId);
  }
  st = await state(page);
  // every pane that has data in THIS mock building must stack as a card, in open order (bom is data-greyed here
  // — its wiring is the identical 1-line swap, node --check'd; it renders when a building carries BOM rows).
  verdict(openedIds.length >= 4 && openedIds.every(id => st.ids.indexOf(id) >= 0) && st.ids.length === openedIds.length,
    'P5 every data-available pane stacked as a card (incl. iot)', 'opened=' + JSON.stringify(openedIds) + ' stack=' + JSON.stringify(st.ids));
  verdict(st.ids.indexOf('hba-iot-pane') >= 0, 'P5 iot pane present in the stack (drives the timer-survival check)');

  // evidence: the peek-DECK (all open panes as a scrollable card stack) + a FULL-SCREEN card
  await page.evaluate(() => window.HbaPaneHost.back()); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, 'hba_mobile_stack_deck_390.png') });
  await page.evaluate(() => window.HbaPaneHost.focus(0)); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, 'hba_mobile_stack_fs_390.png') });

  // iot timers survive re-parent: focus the iot card, canvas-diff a bar chart over > 900ms (the _barTimer tick)
  await page.evaluate(() => { const i = window.HbaPaneHost._state().ids.indexOf('hba-iot-pane'); window.HbaPaneHost.focus(i); });
  await page.waitForTimeout(120);
  const iotReparented = await page.evaluate(() => {
    const p = document.getElementById('hba-iot-pane');
    return !!(p && p.closest('#hba-card-stack')) && !!(p && p.parentNode !== document.body);
  });
  verdict(iotReparented, 'P5 iot pane re-parented into the stack (not body)');
  // the sensor bars are DIVs whose inline width/left + value text advance every _barTimer tick (900ms) — snapshot
  // those (the CCTV canvas has a pre-existing dead rAF loop, unrelated to this feature, so we don't rely on it).
  const snap = () => page.evaluate(() => {
    const p = document.getElementById('hba-iot-pane');
    if (!p) return '';
    const fills = Array.from(p.querySelectorAll('div[style*="width"]')).map(d => d.style.width);
    const vals = Array.from(p.querySelectorAll('span[style*="left"]')).map(s => s.textContent);
    return fills.join(',') + '|' + vals.join(',');
  });
  const t0 = await snap();
  await page.waitForTimeout(1500);   // > 900ms so _barTimer ticks ≥1× while re-parented
  const t1 = await snap();
  verdict(t0 !== t1 && t0 !== '', 'P5 iot sensor bars advance after re-parent → _barTimer alive', 'changed=' + (t0 !== t1));

  // close iot via its own × (NOT the preceding mute button) → unmount clears the timers
  await page.evaluate(() => {
    const p = document.getElementById('hba-iot-pane'); if (!p) return;
    const x = Array.from(p.querySelectorAll('button')).find(b => b.textContent.trim() === '×');
    if (x) x.click();
  });
  await page.waitForTimeout(300);
  const iotClosed = await page.evaluate(() => ({ active: window.HBAIotPane.isActive(), inStack: !!document.getElementById('hba-iot-pane'), n: window.HbaPaneHost.cardCount() }));
  verdict(iotClosed.active === false && !iotClosed.inStack && iotClosed.n === openedIds.length - 1,
    'P5 iot × → unmount (timers stopped, isActive=false), remaining cards = opened−1', JSON.stringify(iotClosed) + ' expected=' + (openedIds.length - 1));

  await page.screenshot({ path: path.join(__dirname, 'hba_mobile_stack_390.png') });
  verdict(errs.length === 0, 'mobile: 0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');
  await page.close();

  // ══ DESKTOP — _isMobile stays false → provable no-op (append to body, no card-stack) ════════════════════════
  const errsD = [];
  const pgD = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  pgD.on('console', m => log.push('  [console.desk] ' + m.text()));
  pgD.on('pageerror', e => { errsD.push(String(e)); log.push('  [pageerror.desk] ' + e); });
  await pgD.goto('http://127.0.0.1:' + port + '/hr_bim_asset/demo/fm_panel.html', { waitUntil: 'networkidle' });
  await pgD.waitForTimeout(1000);
  await openLens(pgD, 'leave');
  const desk = await pgD.evaluate(() => {
    const pane = document.getElementById('hba-leave-pane');
    return { paneExists: !!pane, parentIsBody: !!(pane && pane.parentNode === document.body),
      host: !!document.getElementById('hba-card-stack') };
  });
  verdict(desk.paneExists && desk.parentIsBody && !desk.host,
    'DESK desktop no-op: leave pane appends to document.body, NO #hba-card-stack', JSON.stringify(desk));
  verdict(errsD.length === 0, 'desktop: 0 pageerrors', errsD.length ? errsD.slice(0, 3).join(' | ') : 'clean');
  await pgD.close();

  const pass = fails === 0;
  S('\n§W-HBA-MOBILE-STACK ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'poc_hba_mobile_stack.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); try { fs.writeFileSync(path.join(__dirname, 'poc_hba_mobile_stack.log'), log.join('\n') + '\nPROBE-ERR ' + e); } catch (_) {} server.close(); process.exit(2); });

function SNAP_WAIT() { return 260; } // > SNAP_MS(200) so the snap-back settles before we read state
