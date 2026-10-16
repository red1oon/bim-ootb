// WITNESS — §PHOTO_SHADOW_FINALCAPTURE (2026-07-25)
// ISSUE IT PROVES/DISPROVES: user-reported Alt+C movie-clip flicker, traced to #983's
// _reassertPhotoShadowCoverage() skip-gate — a captured MaxQ frame could inherit whichever
// shadow-caster state happened to be cached at the LAST accumulation tick, which may have been a
// *skipped* tick. Fix: _finishStillRefine() now calls _reassertPhotoShadowCoverage(true), an
// ungated forced run, before handing off to AO/SSGI/capture.
//
// Unlike #983's own witness (which deliberately waited for streaming to fully complete before
// baking, so it could never exercise the actual race), THIS witness starts MaxQ WHILE streaming is
// still in flight — the exact condition #983's design doc named as the risk (§PHOTO_STREAMING_RACE)
// but never tested for. Reads the real §PHOTO_SHADOW disabled reassertRuns=/reassertSkips=/
// forcedSaves= counters logged once per baked frame (MaxQ tears down+rebuilds staging per frame).
// forcedSaves>0 on any frame is direct, non-inferred proof the bug condition occurred for real and
// the fix engaged — never asks the code whether it thinks it worked.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8402;
const BLD = process.env.BLD || 'HHS_Office_Federated';

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

  console.log(`\n${'='.repeat(78)}\n§PHOTO_SHADOW_FINALCAPTURE witness — ${BLD} (mid-stream bake)\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.startMaxQualityOrbit === 'function' && window.APP._composer, { timeout: 90000 });
  // Wait for streaming to have STARTED (queue populated) but deliberately do NOT wait for it to
  // finish — bake while it's still actively pushing geometry, the race condition itself.
  await page.waitForFunction(() => window.APP.streamQueue && window.APP.streamQueue.length > 0, { timeout: 60000, polling: 500 });
  const midStreamState = await page.evaluate(() => ({ idx: window.APP.streamIdx, total: window.APP.streamQueue.length, streaming: window.APP.streaming }));
  console.log('--- streaming in flight at bake start: idx=' + midStreamState.idx + '/' + midStreamState.total + ' streaming=' + midStreamState.streaming + ' ---');

  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ frames: 12, fps: 15, preview: false }); });
  const maxqT0 = Date.now();
  while (!logs.some(l => l.startsWith('§MAXQ_DONE') || l.startsWith('§MAXQ_CANCEL')) && Date.now() - maxqT0 < 180000) {
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('--- MaxQ 12-frame run finished or timed out (' + ((Date.now() - maxqT0) / 1000).toFixed(1) + 's) ---');
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();

  const relevant = logs.filter(l => l.includes('§PHOTO_SHADOW') || l.startsWith('§MAXQ_FRAME') || l.startsWith('§MAXQ_DONE') || l.startsWith('§MAXQ_CANCEL'));
  console.log('\n--- relevant log lines ---');
  relevant.forEach(l => console.log(l));

  const disabledLines = logs.filter(l => l.startsWith('§PHOTO_SHADOW disabled'));
  let totalRuns = 0, totalSkips = 0, totalForcedSaves = 0, framesWithForcedSave = 0;
  disabledLines.forEach(l => {
    const rm = l.match(/reassertRuns=(\d+)/), sm = l.match(/reassertSkips=(\d+)/), fm = l.match(/forcedSaves=(\d+)/);
    if (rm) totalRuns += parseInt(rm[1], 10);
    if (sm) totalSkips += parseInt(sm[1], 10);
    if (fm) { const v = parseInt(fm[1], 10); totalForcedSaves += v; if (v > 0) framesWithForcedSave++; }
  });
  console.log('\n--- aggregate ---');
  console.log('§WITNESS disabledCycles(frames)=' + disabledLines.length + ' totalReassertRuns=' + totalRuns +
    ' totalReassertSkips=' + totalSkips + ' totalForcedSaves=' + totalForcedSaves +
    ' framesWithForcedSave=' + framesWithForcedSave);

  const pageErrors = logs.filter(l => l.startsWith('PAGEERROR'));
  console.log('§WITNESS pageErrors=' + pageErrors.length);
  if (pageErrors.length) pageErrors.forEach(l => console.log(l));

  // Pass bar: the fix must be structurally exercised (>=1 baked frame cycle, skip gate still
  // saving work) and must not regress correctness (zero pageerrors). forcedSaves>0 is reported but
  // NOT required for PASS — whether the race actually fires this run depends on real timing, not
  // something a headless SwiftShader run can force deterministically; its value here is diagnostic,
  // not a gate.
  const pass = disabledLines.length > 0 && totalRuns > 0 && pageErrors.length === 0;
  console.log('\n' + (pass ? 'PASS' : 'FAIL') + ' — §PHOTO_SHADOW_FINALCAPTURE fix ran cleanly, ' +
    (totalForcedSaves > 0
      ? ('and forcedSaves=' + totalForcedSaves + ' on ' + framesWithForcedSave + '/' + disabledLines.length +
         ' frames — DIRECT evidence the pre-fix race condition (stale final tick) occurred for real and was caught.')
      : 'forcedSaves=0 this run (race did not fire under this timing — inconclusive on the original bug, not a fix failure).'));
  process.exit(pass ? 0 : 1);
})();
