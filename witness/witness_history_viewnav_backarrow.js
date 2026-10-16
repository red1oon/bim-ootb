// witness_history_viewnav_backarrow.js — witness prompts/HISTORY_KNOB_SIGNAL_TAP.md §BUG (2026-07-12).
// PROVES: back-arrow (#hist-back → viewStepBack) does NOT spawn a spurious forward dot / snap the view
// cursor to the tip when the restored moment's write() drives a real setter (A.toggleXray → §XRAY).
// Root cause under test: history_tap.js feedCrumb() didn't gate on isApplying(), and §HIST_VIEWNAV was
// missing from DENY_TAG, so a restore-driven §XRAY line got queued and flushed by the NEXT §HIST_VIEWNAV
// line once isApplying() reset — minting a bogus §HIST_PUSH right after the back-press.
// NOTE on padding: feedCrumb() has an unrelated anti-duplicate heuristic (skip if the same tag+label
// appeared in the last 3 sniffed crumbs) that would otherwise mask this bug in a short synthetic session
// (a real ~100-dot session, like the user's repro log, always has unrelated crumbs in between). We inject
// a few distinct §MAT_SELECT padding lines between the xray toggles purely to clear that dedupe window —
// this does not fabricate the mechanism under test: the actual signal (toggleXray → restore → #hist-back
// click) is 100% real DOM/API calls, only the "session has other stuff in it" filler is synthetic.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8955;
const URL = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/modeller/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding;
    }, { timeout: 60000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 60000 }).catch(e => console.log('STREAM_WAIT_FAIL ' + e.message));
    await sleep(1200);

    if (!(await page.evaluate(() => !!window.UniversalHistory))) {
      console.log('SETUP_FAIL no UniversalHistory'); await browser.close(); process.exit(1);
    }
    await page.evaluate(() => { window.UniversalHistory.open(); });
    await sleep(200);

    // ── SETUP: xray ON (dot0) → 4 distinct padding crumbs (clears the dedupe window) → xray OFF (tip) ──
    logs.length = 0;
    await page.evaluate(() => { window.toggleXray(); });         // dot0: XRAY on=true
    await sleep(120);
    await page.evaluate(() => {
      for (let i = 1; i <= 4; i++) console.log('§MAT_SELECT padding-' + i);  // distinct tag+label each
    });
    await sleep(120);
    await page.evaluate(() => { window.toggleXray(); });         // tip: XRAY on=false
    await sleep(150);
    console.log('--- SETUP (xray on → 4 padding dots → xray off=tip) ---');
    console.log(logs.filter(l => l.includes('§XRAY') || l.includes('§MAT_SELECT') || l.includes('§HIST_PUSH')).join('\n'));

    // ── press #hist-back TWICE (the real user gesture) — read §HIST_VIEWNAV idx each time ──
    logs.length = 0;
    const backBtn = await page.$('#hist-back');
    if (!backBtn) { console.log('SETUP_FAIL #hist-back not found'); await browser.close(); process.exit(1); }
    await backBtn.click();
    await sleep(250);
    const afterFirst = logs.slice();
    logs.length = 0;
    await backBtn.click();
    await sleep(250);
    const afterSecond = logs.slice();

    console.log('--- §1 FIRST BACK-PRESS (raw log) ---');
    console.log(afterFirst.join('\n'));
    console.log('--- §2 SECOND BACK-PRESS (raw log) ---');
    console.log(afterSecond.join('\n'));

    function idxOf(lines) {
      for (const l of lines) { const m = /§HIST_VIEWNAV idx=(-?\d+)/.exec(l); if (m) return parseInt(m[1], 10); }
      return null;
    }
    function bogusAfterViewnav(lines) {
      // a §HIST_PUSH or §HIST_TAP_DOT AFTER the §HIST_VIEWNAV line in the same batch = the bug
      // (the restore's own setter-echo got flushed as a brand-new forward dot).
      const vIdx = lines.findIndex(l => l.includes('§HIST_VIEWNAV'));
      if (vIdx === -1) return false;
      return lines.slice(vIdx + 1).some(l => l.includes('§HIST_PUSH') || l.includes('§HIST_TAP_DOT'));
    }

    const idx1 = idxOf(afterFirst), idx2 = idxOf(afterSecond);
    const bogus1 = bogusAfterViewnav(afterFirst), bogus2 = bogusAfterViewnav(afterSecond);

    console.log('--- §3 ASSERTIONS ---');
    console.log('idx after 1st back=' + idx1 + ', idx after 2nd back=' + idx2 +
      ' (want: idx2 = idx1-1, i.e. monotonic step-back, NOT snapped to tip)');
    console.log('bogus §HIST_PUSH/§HIST_TAP_DOT after 1st §HIST_VIEWNAV: ' + bogus1 + ' (want: false)');
    console.log('bogus §HIST_PUSH/§HIST_TAP_DOT after 2nd §HIST_VIEWNAV: ' + bogus2 + ' (want: false)');
    const monotonic = (idx1 !== null && idx2 !== null && idx2 === idx1 - 1);
    console.log('monotonic step-back: ' + monotonic + ' (want: true)');

    const pass = !bogus1 && !bogus2 && monotonic;
    console.log(pass ? 'RESULT: PASS — back-arrow steps back cleanly, no spurious forward dot' :
      'RESULT: FAIL — back-arrow mints a spurious dot / snaps the view cursor forward (the bug this witness proves)');

    await browser.close();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.log('WITNESS_ERROR ' + (e && e.stack || e));
    await browser.close();
    process.exit(1);
  }
})();
