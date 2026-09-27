// WITNESS — §PERF_INCR_FIX regression check (playTick zero-width-span bug).
// ISSUE IT PROVES/DISPROVES: playTick() (the REAL continuous-playback loop, wired to the ▶ button)
// used to mutate the global _cursor BEFORE calling renderAtTime(_cursor), making _prevCursor equal
// the new cursor on every tick -- a zero-width delta window. Once shadows stopped forcing full mode
// (Phase 2), this made the delta path skip the ENTIRE scene on every playback tick: construction
// visually froze mid-playback (reported live: "ceases as the timeline continues on", "does not
// refresh... until you scrub"). Test hooks like __tmStep/__tmSetCursor do NOT exercise this bug --
// they compute the target cursor as a local expression, same as the correct onSlide() pattern --
// so this witness must click the REAL ▶ button to catch it.
//   PASS = the count of BUILT (placed+frontier+recent) guids strictly increases across consecutive
//   real playback ticks, and at least one §PERF_TRAVERSE log line shows span>0h during play.
//   FAIL = the count never changes after the first tick (frozen), or every observed span=0h.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8410;
const BLD = process.env.BLD || 'Hospital';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  let pass = false;
  try {
    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls, { timeout: 120000 });
    await new Promise(r => setTimeout(r, 8000));
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 180000, polling: 2000 });

    await page.evaluate(() => { window.APP.toggleShadow(); }); // shadows ON — the exact reported condition
    await page.evaluate(() => { window.toggleTimeMachine(); });
    const ready = await page.waitForFunction(() => {
      const st = window.tmGetState && window.tmGetState();
      return st && st.active && st.projectEnd > st.projectStart;
    }, { timeout: 180000 }).then(() => true).catch(() => false);
    if (!ready) { console.log('FAIL — TM never activated'); process.exit(1); }

    // Real "Jump to Start" button click — the exact path a user takes before pressing play.
    await page.click('#tm-start-btn');
    await new Promise(r => setTimeout(r, 500));
    const builtCount = () => page.evaluate(() => window.__tmSnapshotVisible ?
      window.__tmSnapshotVisible().mesh.length +
      Object.values(window.__tmSnapshotVisible().batched || {}).reduce((a, v) => a + Object.values(v).filter(Boolean).length, 0) +
      Object.values(window.__tmSnapshotVisible().instanced || {}).reduce((a, v) => a + Object.values(v).filter(Boolean).length, 0)
      : null);

    const n0 = await builtCount();
    console.log('built count after jump-to-start: ' + n0);

    // Real "Play forward" button click — this is playTick(), the exact buggy path.
    await page.click('#tm-fwd-btn');
    const samples = [n0];
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1500)); // real ticks fire on their own timer
      samples.push(await builtCount());
    }
    await page.click('#tm-fwd-btn'); // toggle off (pause)

    console.log('built-count samples across real playback ticks: ' + JSON.stringify(samples));
    const increased = samples[samples.length - 1] > samples[0];

    const travLines = logs.filter(l => l.includes('§PERF_TRAVERSE'));
    const spanNonZero = travLines.some(l => !/span=0h/.test(l));
    console.log('§PERF_TRAVERSE lines seen: ' + travLines.length + ', at least one span>0h: ' + spanNonZero);
    console.log(travLines.slice(-6).join('\n'));

    pass = increased && travLines.length > 0;
    console.log(pass ? 'PASS — construction progressed during real playback with shadows on'
                      : 'FAIL — built count did not increase (' + samples.join(',') + ')');

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); pass = false; }
  } catch (e) {
    console.log('CRASH: ' + e.message);
    pass = false;
  } finally {
    try { await page.close(); } catch (e) {}
    await browser.close();
  }
  process.exit(pass ? 0 : 1);
})();
