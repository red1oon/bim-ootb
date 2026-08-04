// WITNESS — §PHOTO_SHADOW_SKIP (2026-07-25)
// ISSUE IT PROVES/DISPROVES: does gating _reassertPhotoShadowCoverage() on real change signals
// (A.streamIdx / A.scene.children.length / A._visibilityGen) actually skip the redundant
// full-scene traversals during Alt+S (startStillRefine, up to 16 calls) and during Alt+C/MaxQ
// (which calls A.startStillRefine() once per baked frame, so up to 16 calls PER FRAME)? Never
// asks the code whether it thinks it worked — reads the real §PHOTO_SHADOW disabled
// reassertRuns=/reassertSkips= counters logged by the fix itself, aggregated across every
// occurrence in the console log.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8401;
const BLD = process.env.BLD || 'Hospital';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  console.log(`\n${'='.repeat(78)}\n§PHOTO_SHADOW_SKIP witness — ${BLD}\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.startStillRefine === 'function' && window.APP._composer, { timeout: 90000 });
  // Let streaming run for real (no artificial wait truncation) — mirrors MaxQ's own §MAXQ_STREAM_FIRST wait.
  // Must wait for it to have STARTED (streamQueue populated) before checking "not streaming",
  // else this resolves instantly on the pre-streaming state and the run proceeds against an
  // almost-empty scene (caught live: casters=2 on a 63,182-element building).
  await page.waitForFunction(() => window.APP.streamQueue && window.APP.streamQueue.length > 0, { timeout: 60000, polling: 500 });
  await page.waitForFunction(() => !window.APP.streaming && window.APP.streamIdx >= window.APP.streamQueue.length,
    { timeout: 120000, polling: 1000 });
  console.log('--- streaming complete, camera+controls ready ---');

  // ── Alt+S (startStillRefine) ─────────────────────────────────────────
  // _stillRefineActive stays true for the WHOLE frozen-still lifetime (converging AND showing
  // the finished result) — _stillRefineBusy is the real "still converging" flag, cleared at
  // every completion point (§CINEMA_ROW_BUSY). Wait on that, then force a real teardown
  // (mirrors what MaxQ itself does between frames: A.stopStillRefine(true)) so
  // _disablePhotoShadows() actually runs and emits the reassertRuns=/reassertSkips= summary.
  await page.evaluate(() => { window.APP.startStillRefine(); });
  await page.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 60000, polling: 200 });
  console.log('--- Alt+S converge+AO complete (busy=false) ---');
  await page.evaluate(() => { window.APP.stopStillRefine(true); });
  await new Promise(r => setTimeout(r, 300));
  console.log('--- Alt+S teardown forced ---');

  // ── Alt+C / MaxQ — same startStillRefine() called once per baked frame, short run (8 frames,
  // preview:false skips the 10s real-time mock — matches this project's existing "MaxQ 8-frame
  // run" witness convention) ──────────────────────────────────────────────
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ frames: 8, fps: 15, preview: false }); });
  const maxqT0 = Date.now();
  while (!logs.some(l => l.startsWith('§MAXQ_DONE') || l.startsWith('§MAXQ_CANCEL')) && Date.now() - maxqT0 < 150000) {
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('--- MaxQ 8-frame run finished or timed out (' + ((Date.now() - maxqT0) / 1000).toFixed(1) + 's) ---');
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();

  const altsLines = logs.filter(l => l.includes('§PHOTO_SHADOW') || l.includes('§STILL_REFINE') && !l.includes('RESTART'));
  console.log('\n--- relevant log lines ---');
  altsLines.forEach(l => console.log(l));

  const disabledLines = logs.filter(l => l.startsWith('§PHOTO_SHADOW disabled'));
  let totalRuns = 0, totalSkips = 0;
  disabledLines.forEach(l => {
    const rm = l.match(/reassertRuns=(\d+)/), sm = l.match(/reassertSkips=(\d+)/);
    if (rm) totalRuns += parseInt(rm[1], 10);
    if (sm) totalSkips += parseInt(sm[1], 10);
  });
  console.log('\n--- aggregate ---');
  console.log('§WITNESS disabledCycles=' + disabledLines.length + ' totalReassertRuns=' + totalRuns + ' totalReassertSkips=' + totalSkips);

  const pageErrors = logs.filter(l => l.startsWith('PAGEERROR'));
  console.log('§WITNESS pageErrors=' + pageErrors.length);
  if (pageErrors.length) pageErrors.forEach(l => console.log(l));

  const pass = disabledLines.length > 0 && totalSkips > 0 && pageErrors.length === 0;
  console.log('\n' + (pass ? 'PASS' : 'FAIL') + ' — §PHOTO_SHADOW_SKIP gate ' + (pass ? 'confirmed skipping redundant traversals, zero pageerrors' : 'did NOT show expected skip behavior'));
  process.exit(pass ? 0 : 1);
})();
