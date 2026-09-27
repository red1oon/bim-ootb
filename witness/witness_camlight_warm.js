// WITNESS — §PHOTO_REALISM_RETUNE item 3, CAM_LIGHT_COLOR warmed 0xfff2e0 -> 0xffdca8.
// ISSUE IT PROVES/DISPROVES: the camera fill light ("torch," dominant interior-walk fill, per
// §CAM_LIGHT's own "bright torch light follows camera" confirmation) was barely off pure white,
// noticeably cooler than the warm palette this codebase already uses elsewhere (NIGHT_MODE
// 0xffdca8/0xffe4b5). Does the retune (a) actually shift the color served, (b) warm the rendered
// frame's color balance (R channel up relative to B), and (c) leave overall brightness/luma
// materially unchanged (a colour retune, not a brightness one)? Drives A.startStillRefine() (the
// real Alt+S entry point, same technique witness_envmap_retune.js already used) on a real
// building, reads back the REAL light object's .color plus a real canvas pixel readback (mean
// R/G/B channels + luma) — direct numeric proof, not inference from logs or a screenshot.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8521;
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

  console.log(`\n${'='.repeat(78)}\n§PHOTO_CAMLIGHT_WARM witness [${LABEL}] — ${BLD}\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.startStillRefine === 'function' && window.APP._composer, { timeout: 90000 });
  await page.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue||[]).length > 0,
    { timeout: 60000, polling: 250 }).catch(() => {});
  await page.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue||[]).length),
    { timeout: 300000, polling: 1000 }).catch(() => {});

  // Move the camera to a plausible interior-ish pose so the cam-light's contribution is real, not
  // negligible against a wide exterior shot — same envelope-relative placement style this project's
  // own witnesses use elsewhere (fractional offset from scene bounds), not a hardcoded world coord
  // that would only work for one building.
  await page.evaluate(() => {
    var a = window.APP, box = new THREE.Box3();
    a.scene.traverse(function(o) { if (o.isMesh && o.visible) box.expandByObject(o); });
    var c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    a.camera.position.set(c.x + s.x * 0.05, c.y + Math.min(s.y * 0.15, 1.8), c.z + s.z * 0.05);
    a.controls.target.set(c.x, c.y, c.z);
    a.controls.update();
  });

  await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); window.APP.startStillRefine(); });
  await page.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 60000, polling: 100 }).catch(() => {});
  await new Promise(res => setTimeout(res, 500));

  const lightState = await page.evaluate(() => {
    var L = window.APP._camLight;
    if (!L) return { present: false };
    return { present: true, hex: '0x' + L.color.getHexString(), r: L.color.r, g: L.color.g, b: L.color.b,
             intensity: L.intensity, distance: L.distance, decay: L.decay };
  });
  console.log('§CAMLIGHT_STATE ' + JSON.stringify(lightState));

  const pixelStats = await page.evaluate(() => {
    try {
      window.APP._composer.render();
      var SZ = 128;
      var c = document.createElement('canvas');
      c.width = SZ; c.height = SZ;
      var ctx = c.getContext('2d');
      ctx.drawImage(window.APP.renderer.domElement, 0, 0, SZ, SZ);
      var data = ctx.getImageData(0, 0, SZ, SZ).data;
      var n = data.length / 4, sumR = 0, sumG = 0, sumB = 0, sumLuma = 0, sumSqLuma = 0, clipped = 0;
      for (var p = 0; p < data.length; p += 4) {
        var r = data[p], g = data[p + 1], b = data[p + 2];
        var luma = 0.299 * r + 0.587 * g + 0.114 * b;
        sumR += r; sumG += g; sumB += b; sumLuma += luma; sumSqLuma += luma * luma;
        if (r >= 250 && g >= 250 && b >= 250) clipped++;
      }
      var meanLuma = sumLuma / n;
      var variance = (sumSqLuma / n) - (meanLuma * meanLuma);
      return { meanR: sumR / n, meanG: sumG / n, meanB: sumB / n, meanLuma: meanLuma,
               stdLuma: Math.sqrt(Math.max(0, variance)), clippedFrac: clipped / n, rMinusB: (sumR - sumB) / n, n: n };
    } catch (e) { return { error: String(e && e.message || e) }; }
  });
  console.log('§PIXELSTATS meanR=' + pixelStats.meanR.toFixed(2) + ' meanG=' + pixelStats.meanG.toFixed(2) +
    ' meanB=' + pixelStats.meanB.toFixed(2) + ' rMinusB=' + pixelStats.rMinusB.toFixed(2) +
    ' meanLuma=' + pixelStats.meanLuma.toFixed(2) + ' stdLuma=' + pixelStats.stdLuma.toFixed(2) +
    ' clippedWhiteFrac=' + (pixelStats.clippedFrac * 100).toFixed(2) + '%');

  await page.evaluate(() => { if (window.APP._stillRefineActive) window.APP.stopStillRefine(true); });

  console.log('\n§RESULT [' + LABEL + '] bld=' + BLD +
    ' camLightHex=' + (lightState.present ? lightState.hex : 'ABSENT') +
    ' meanR=' + pixelStats.meanR.toFixed(2) + ' meanG=' + pixelStats.meanG.toFixed(2) + ' meanB=' + pixelStats.meanB.toFixed(2) +
    ' rMinusB=' + pixelStats.rMinusB.toFixed(2) +
    ' meanLuma=' + pixelStats.meanLuma.toFixed(2) + ' stdLuma=' + pixelStats.stdLuma.toFixed(2) +
    ' clippedWhiteFrac=' + (pixelStats.clippedFrac * 100).toFixed(2) + '%');

  await browser.close();
  process.exit(0);
})();
