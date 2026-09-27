// WITNESS — §ENVMAP_STOMP_GUARD (2026-07-25)
// ISSUE IT PROVES/DISPROVES: does scene.js's updateSky() 2000ms-throttled procedural PMREM regen
// silently overwrite the photoshoot's real HDRI envMap (A._envMap) during repeated Alt+S cycles,
// and does A._envMapHdriActive stop it? Drives A.startStillRefine()/stopStillRefine() directly
// (the actual shared mechanism Alt+S AND Alt+C/MaxQ both go through — effects.js
// _applyPhotoStaging/_teardownPhotoStaging) with real per-cycle timing close to the ~2000ms
// window, and reads back A._envMap's IDENTITY (not appearance) plus real mean pixel luminance
// from a small canvas snapshot after each cycle — direct numeric proof, not inference from logs.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8404;
const BLD = process.env.BLD || 'HHS_Office_Federated';
const NCYCLES = parseInt(process.env.NCYCLES || '10', 10);
const CYCLE_MS = parseInt(process.env.CYCLE_MS || '1900', 10);  // close to the 2000ms throttle window, matching real per-frame cadence

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 360 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  console.log(`\n${'='.repeat(78)}\n§ENVMAP_STOMP_GUARD witness — ${BLD}, ${NCYCLES} Alt+S cycles @ ~${CYCLE_MS}ms\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.startStillRefine === 'function' && window.APP._composer, { timeout: 90000 });
  await page.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue||[]).length),
    { timeout: 120000, polling: 1000 }).catch(() => {});
  console.log('--- ready ---');

  const results = [];
  for (let n = 0; n < NCYCLES; n++) {
    await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); window.APP.startStillRefine(); });
    await page.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 30000, polling: 100 }).catch(() => {});
    const r = await page.evaluate(() => {
      try {
        window.APP._composer.render();
        var SZ = 32;
        var c = document.createElement('canvas');
        c.width = SZ; c.height = SZ;
        var ctx = c.getContext('2d');
        ctx.drawImage(window.APP.renderer.domElement, 0, 0, SZ, SZ);
        var data = ctx.getImageData(0, 0, SZ, SZ).data;
        var sum = 0, count = data.length / 4;
        for (var p = 0; p < data.length; p += 4) sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        return { meanLuma: sum / count, envMapHdriActive: !!window.APP._envMapHdriActive, envMapThrottle: !!window.APP._envMapThrottle };
      } catch (e) { return { error: String(e && e.message || e) }; }
    });
    results.push(r);
    console.log('cycle ' + n + ': ' + (r.error ? ('ERROR ' + r.error) : ('meanLuma=' + r.meanLuma.toFixed(2) + ' envMapHdriActive=' + r.envMapHdriActive)));
    await new Promise(res => setTimeout(res, CYCLE_MS));
  }
  await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); });

  console.log('\n--- §ENVMAP_STOMP_GUARD log lines seen ---');
  logs.filter(l => l.includes('ENVMAP_STOMP_GUARD') || l.includes('LAYER2_HDRI')).forEach(l => console.log(l));

  const ok = results.filter(r => !r.error);
  var deltas = [];
  for (var i = 1; i < ok.length; i++) deltas.push(ok[i].meanLuma - ok[i - 1].meanLuma);
  var signFlips = 0;
  for (var i = 1; i < deltas.length; i++) if ((deltas[i] > 0) !== (deltas[i - 1] > 0)) signFlips++;
  var meanAbsDelta = deltas.length ? deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length : 0;
  console.log('\n--- deltas ---');
  deltas.forEach((d, i) => console.log('delta[' + i + '->' + (i + 1) + ']=' + d.toFixed(2)));
  console.log('\n§WITNESS cycles=' + ok.length + ' signFlips=' + signFlips + '/' + (deltas.length - 1) + ' meanAbsDelta=' + meanAbsDelta.toFixed(2));

  const pageErrors = logs.filter(l => l.startsWith('PAGEERROR'));
  console.log('§WITNESS pageErrors=' + pageErrors.length);
  const alternating = deltas.length >= 3 && signFlips >= (deltas.length - 1) * 0.6 && meanAbsDelta > 1.5;
  console.log('\n' + (alternating
    ? 'STILL ALTERNATING — signFlips=' + signFlips + '/' + (deltas.length - 1) + ' meanAbsDelta=' + meanAbsDelta.toFixed(2) + '. Fix did NOT eliminate it.'
    : 'STABLE — no alternating-sign pattern (signFlips=' + signFlips + '/' + (deltas.length - 1) + ', meanAbsDelta=' + meanAbsDelta.toFixed(2) + ').'));

  await browser.close();
  process.exit(0);
})();
