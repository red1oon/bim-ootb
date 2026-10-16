// WITNESS — §PHOTO_ENVMAP_RETUNE (2026-08-27)
// ISSUE IT PROVES/DISPROVES: with §MIRROR_ROOM_PROBE now supplying a real local-scene reflection
// on top of PHOTO_ENVMAP_BOOST=3.0 (a multiplier calibrated pre-room-probe, pre-§TRINORM_LINEAR,
// when metal read near-black), are glossy materials over-bright/over-reflective (the user's "too
// bright, shiny reflection" complaint)? Drives A.startStillRefine() (the real Alt+S entry point,
// same as witness_envmap_stomp.js) on a real building DB, then reads back REAL numeric material
// state (envMapIntensity, roughness, metalness) for every glossy/boosted material in A._matCache
// plus a real canvas pixel-luminance readback (mean + bright-clip fraction as a whitewash proxy) —
// direct numeric proof, not inference from logs or a screenshot.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8410;
const BLD = process.env.BLD || 'Clinic';
const LABEL = process.env.LABEL || 'run';

process.on('unhandledRejection', function(e) { console.error('UNHANDLED_REJECTION: ' + (e && e.stack || e)); process.exit(1); });

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  console.log(`\n${'='.repeat(78)}\n§PHOTO_ENVMAP_RETUNE witness [${LABEL}] — ${BLD}\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.startStillRefine === 'function' && window.APP._composer, { timeout: 90000 });
  // Wait for streaming to actually START first (it kicks off async after §DS_AUTO_START) —
  // otherwise the settle-check below races and resolves true on `!window.APP.streaming` before
  // any element has streamed at all (found live during this session's own building-population probe).
  await page.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue||[]).length > 0,
    { timeout: 60000, polling: 250 }).catch(() => {});
  await page.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue||[]).length),
    { timeout: 300000, polling: 1000 }).catch(() => {});
  const _settleState = await page.evaluate(() => ({ streamIdx: window.APP.streamIdx, streamTotal: (window.APP.streamQueue||[]).length }));
  console.log('--- streaming settled: ' + _settleState.streamIdx + '/' + _settleState.streamTotal + ' ---');

  const matCacheCount = await page.evaluate(() => Object.keys(window.APP._matCache || {}).length);
  console.log('matCache entries pre-stage: ' + matCacheCount);

  // Fire real Alt+S staging (A.startStillRefine is the exact function keyboard.js's Alt+S calls)
  await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); window.APP.startStillRefine(); });
  await page.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 60000, polling: 100 }).catch(() => {});
  // §PHOTO_ENVMAP_STALE's own safety net (effects.js:4689) only pushes the room-probe texture onto
  // materials via a 2200ms setTimeout OR the per-accumulation-frame step() loop — wait explicitly
  // for at least one glossy material's envMap to stop pointing at the plain sky env map (A._envMap;
  // _roomProbeRT itself is a closure-private var, not reachable from page.evaluate, so identity
  // vs. the known sky map is the only externally-visible signal) so the pixel readback below
  // reflects the real staged look, not a mid-swap state.
  await page.waitForFunction(() => {
    var cache = window.APP._matCache || {}, sky = window.APP._envMap;
    if (!sky) return false;
    return Object.keys(cache).some(function(k) {
      var m = cache[k];
      return m && m.userData && m.userData._photoRoomProbeEligible && m.envMap && m.envMap !== sky;
    });
  }, { timeout: 6000, polling: 200 }).catch(() => {});
  await new Promise(res => setTimeout(res, 500));

  const matStats = await page.evaluate(() => {
    var cache = window.APP._matCache || {};
    var glossy = [], metal = [], allBoosted = [];
    Object.keys(cache).forEach(function(k) {
      var m = cache[k];
      if (!m || !m.userData) return;
      if (m.userData._photoBoosted) allBoosted.push(m);
      if (m.userData._photoRoomProbeEligible) {
        glossy.push({
          key: k,
          envMapIntensity: m.envMapIntensity,
          origEnvMapIntensity: m.userData._photoOrigEnvMapIntensity,
          roughness: m.roughness,
          origRoughness: m.userData._photoOrigRoughness,
          metalness: m.metalness,
          hasRoomProbeTex: !!(m.envMap && window.APP._envMap && m.envMap !== window.APP._envMap)
        });
      }
    });
    return { totalBoosted: allBoosted.length, glossyCount: glossy.length, glossy: glossy };
  });

  console.log('§MATSTATS totalBoosted=' + matStats.totalBoosted + ' glossyRoomProbeEligible=' + matStats.glossyCount);
  var envRatios = matStats.glossy.filter(function(g){ return typeof g.origEnvMapIntensity === 'number' && g.origEnvMapIntensity > 0; })
    .map(function(g){ return g.envMapIntensity / g.origEnvMapIntensity; });
  var meanRatio = envRatios.length ? envRatios.reduce(function(a,b){return a+b;},0)/envRatios.length : NaN;
  var meanEnvInt = matStats.glossy.length ? matStats.glossy.reduce(function(a,g){return a+(g.envMapIntensity||0);},0)/matStats.glossy.length : NaN;
  var meanOrigEnvInt = matStats.glossy.length ? matStats.glossy.reduce(function(a,g){return a+(g.origEnvMapIntensity||0);},0)/matStats.glossy.length : NaN;
  var meanRoughness = matStats.glossy.length ? matStats.glossy.reduce(function(a,g){return a+(typeof g.roughness==='number'?g.roughness:0);},0)/matStats.glossy.length : NaN;
  var roomProbeCount = matStats.glossy.filter(function(g){return g.hasRoomProbeTex;}).length;
  console.log('§MATSTATS meanOrigEnvMapIntensity=' + meanOrigEnvInt.toFixed(4) +
    ' meanBoostedEnvMapIntensity=' + meanEnvInt.toFixed(4) +
    ' meanBoostRatio=' + meanRatio.toFixed(4) +
    ' meanRoughness=' + meanRoughness.toFixed(4) +
    ' usingRoomProbeTex=' + roomProbeCount + '/' + matStats.glossy.length);

  // Full-frame render + pixel readback — same 32x32 downsample technique as witness_envmap_stomp.js,
  // extended with clipped-highlight fraction and stddev as a whitewash/contrast proxy.
  const pixelStats = await page.evaluate(() => {
    try {
      window.APP._composer.render();
      var SZ = 128;
      var c = document.createElement('canvas');
      c.width = SZ; c.height = SZ;
      var ctx = c.getContext('2d');
      ctx.drawImage(window.APP.renderer.domElement, 0, 0, SZ, SZ);
      var data = ctx.getImageData(0, 0, SZ, SZ).data;
      var n = data.length / 4, sum = 0, sumSq = 0, clipped = 0;
      var lumas = [];
      for (var p = 0; p < data.length; p += 4) {
        var luma = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        lumas.push(luma);
        sum += luma; sumSq += luma * luma;
        if (data[p] >= 250 && data[p+1] >= 250 && data[p+2] >= 250) clipped++;
      }
      var mean = sum / n;
      var variance = (sumSq / n) - (mean * mean);
      return { meanLuma: mean, stdLuma: Math.sqrt(Math.max(0, variance)), clippedFrac: clipped / n, n: n };
    } catch (e) { return { error: String(e && e.message || e) }; }
  });
  console.log('§PIXELSTATS meanLuma=' + pixelStats.meanLuma.toFixed(2) +
    ' stdLuma=' + pixelStats.stdLuma.toFixed(2) +
    ' clippedWhiteFrac=' + (pixelStats.clippedFrac*100).toFixed(2) + '%');

  await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); });

  console.log('\n--- §MIRROR_ROOM_PROBE / §PHOTO log lines seen ---');
  logs.filter(l => l.includes('MIRROR_ROOM_PROBE') || l.includes('PHOTO_STAGING') || l.includes('PHOTO_ENVMAP')).forEach(l => console.log(l));

  console.log('\n§RESULT [' + LABEL + '] bld=' + BLD +
    ' glossyMats=' + matStats.glossyCount +
    ' meanBoostRatio=' + meanRatio.toFixed(4) +
    ' meanBoostedEnvMapIntensity=' + meanEnvInt.toFixed(4) +
    ' meanRoughness=' + meanRoughness.toFixed(4) +
    ' meanLuma=' + pixelStats.meanLuma.toFixed(2) +
    ' stdLuma=' + pixelStats.stdLuma.toFixed(2) +
    ' clippedWhiteFrac=' + (pixelStats.clippedFrac*100).toFixed(2) + '%');

  await browser.close();
  process.exit(0);
})();
