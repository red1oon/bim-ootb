// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for prompts/HISTORY_KNOB_DIAL.md — the line-art amp-knob history dial.
//   PROVES (issue: "the old scrubber wired nav to undo/redo → it FLIPPED kernel ops → looked corrupted"):
//     1. §KNOB_RENDER — 6 ticks (4 depth + 2 nav), default depth=high, empty-state flag correct.
//     2. Rest = a DOT; clicking it BLOOMS to the knob (§KNOB_BLOOM on).
//     3. Clicking a DEPTH tick sets breadth + snaps the pointer + sounds a detent (§KNOB_TICK + §KNOB_SOUND).
//     4. Clicking a NAV tick is READ-ONLY: §KNOB_RESTORE opLogMutated=NO, the host only applyView()s,
//        cursor moves, ZERO op-log mutations (window.__opLogMutations stays 0).
//     5. SOUND fires only on CHANGE + is MUTE-AWARE (muted=true when sfx is off).
//     6. FOCUS → amber halo; ◄/► arrow keys drive back/front while focused (§KNOB_FOCUS).
//     7. REDUCED MOTION — emulated prefers-reduced-motion is reflected in §KNOB_RENDER reducedMotion=1.
//   §-log first — READ common/tests/poc_knob.log before any conclusion (exit code is NOT evidence).
// Run:  node common/tests/poc_knob.js 2>&1 | tee common/tests/poc_knob.log   (cwd = bim-ootb)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');   // serve bim-ootb root so ../history_knob.js resolves
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/common/tests/knob_harness.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const PASS = []; const FAIL = [];
function check(name, cond) { (cond ? PASS : FAIL).push(name); console.log((cond ? '✅ ' : '❌ ') + name); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [];
  const browser = await chromium.launch();

  // ── Pass 1: default motion ──────────────────────────────────────────────
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('console', m => logs.push(m.text()));
  await page.goto(`http://localhost:${port}/common/tests/knob_harness.html`);
  await page.waitForFunction(() => window.__knob && window.__getState);

  const line = re => logs.find(l => re.test(l)) || '';
  // SVG <line> ticks read 'not visible' to Playwright's heuristic — fire a bubbling click (handler is
  // on the <svg>, reading e.target's data-tick), exactly what a real tap dispatches.
  const tapTick = id => page.evaluate(t => {
    const el = document.querySelector(`[data-tick="${t}"]`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, id);
  check('§KNOB_RENDER 6 ticks (4 depth + 2 nav)', /§KNOB_RENDER ticks=6 depth=4\(Max,High\*,Low,Off\) nav=2/.test(line(/§KNOB_RENDER/)));
  check('§KNOB_RENDER default start=high', /start=high/.test(line(/§KNOB_RENDER/)));

  // rest = dot; bloom on click
  await page.click('.hk-dot');
  await page.waitForTimeout(50);
  check('Bloom on dot press (§KNOB_BLOOM on)', logs.some(l => /§KNOB_BLOOM on source=harness/.test(l)));
  check('Knob visible, dot hidden after bloom', await page.evaluate(() => {
    const k = document.querySelector('.hk-knob'), d = document.querySelector('.hk-dot');
    return getComputedStyle(k).display !== 'none' && getComputedStyle(d).display === 'none';
  }));

  // DEPTH tick → set breadth + pointer snap + detent sound
  await tapTick('max');
  await page.waitForTimeout(50);
  check('Depth tick → §KNOB_TICK selected=depth:max', logs.some(l => /§KNOB_TICK selected=depth:max pointerSnap=360/.test(l)));
  check('Depth tick → host setDepth=max', logs.some(l => /§HARNESS setDepth=max/.test(l)));
  check('Depth tick → §KNOB_SOUND fired onChange (hz=622)', logs.some(l => /§KNOB_SOUND fired=onChange hz=622 played=true muted=false/.test(l)));

  // NAV back → READ-ONLY restore (opLogMutated=NO, cursor moves, zero mutations)
  const before = await page.evaluate(() => window.__getState());
  await tapTick('back');
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => window.__getState());
  check('Nav back → §KNOB_RESTORE opLogMutated=NO', logs.some(l => /§KNOB_RESTORE .*opLogMutated=NO dotJump=ok halo=amber/.test(l)));
  check('Nav back → cursor decremented (read-only step)', after.cursor === before.cursor - 1);
  check('Nav back → ZERO op-log mutations', after.mutations === 0);
  check('Nav back → host applyView() called (view restore only)', after.applied.length === 1 && after.applied[0] === before.cursor - 1);

  // SOUND mute-aware: mute, then change depth → muted=true
  await page.evaluate(() => window.__setMuted(true));
  await tapTick('low');
  await page.waitForTimeout(50);
  check('§KNOB_SOUND mute-aware (muted=true when sfx off)', logs.some(l => /§KNOB_SOUND .*muted=true/.test(l)));
  await page.evaluate(() => window.__setMuted(false));

  // FOCUS + arrow keys
  await page.evaluate(() => document.querySelector('.hk-knob').focus());
  await page.waitForTimeout(30);
  check('Focus → §KNOB_FOCUS halo=amber arrows=active', logs.some(l => /§KNOB_FOCUS halo=amber arrows=active/.test(l)));
  const c1 = (await page.evaluate(() => window.__getState())).cursor;
  await page.keyboard.press('ArrowLeft');   // back
  await page.waitForTimeout(40);
  const c2 = (await page.evaluate(() => window.__getState())).cursor;
  check('ArrowLeft (while focused) = back, read-only', c2 === c1 - 1 && (await page.evaluate(() => window.__getState())).mutations === 0);
  await page.keyboard.press('ArrowRight');  // front
  await page.waitForTimeout(40);
  const c3 = (await page.evaluate(() => window.__getState())).cursor;
  check('ArrowRight (while focused) = front', c3 === c2 + 1);

  // ── Pass 2: reduced motion ──────────────────────────────────────────────
  const page2 = await browser.newContext({ reducedMotion: 'reduce' }).then(c => c.newPage());
  const logs2 = []; page2.on('console', m => logs2.push(m.text()));
  await page2.goto(`http://localhost:${port}/common/tests/knob_harness.html`);
  await page2.waitForFunction(() => window.__knob);
  check('§KNOB_RENDER reducedMotion=1 under prefers-reduced-motion', logs2.some(l => /§KNOB_RENDER .*reducedMotion=1/.test(l)));

  await browser.close(); server.close();
  console.log('\n— DUMP key §-lines —');
  logs.filter(l => /§KNOB_|§HARNESS/.test(l)).forEach(l => console.log('   ' + l));
  console.log(`\nRESULT ${PASS.length} pass / ${FAIL.length} fail`);
  if (FAIL.length) { console.log('FAILED: ' + FAIL.join(' | ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
