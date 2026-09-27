// Reads the REAL scene-linear HDR distribution the grade pass operates on, so §PHOTO_GRADE v2's
// constants are extracted from the live buffer instead of guessed off a tone-mapped PNG (which is
// exactly why v1 over-lit). No canvas readback — reads the composer render target directly.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8521, BLD = process.env.BLD || 'Terminal';
process.on('unhandledRejection', e => { console.error('UNHANDLED_REJECTION: ' + (e && e.stack || e)); process.exit(1); });
(async () => {
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout: 900000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  page.on('console', m => { const t = m.text();
    if (/§PHOTO_GRADE|§PHOTO_AO |§PHOTO_STAGING|§CAM_LIGHT on/.test(t)) console.log('   ' + t); });
  page.on('pageerror', e => console.log('   PAGEERROR ' + e.message));
  console.log(`§PHOTO_GRADE_PROBE run — ${BLD} @ :${PORT}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP._composer &&
    typeof window.APP.probeGradeHdr === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue||[]).length > 0,
    { timeout: 120000, polling: 250 }).catch(() => {});
  await page.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue||[]).length),
    { timeout: 600000, polling: 1000 }).catch(() => {});
  const pose = await page.evaluate(() => {
    const a = window.APP, box = new THREE.Box3();
    a.scene.traverse(o => { if (o.isMesh && o.visible) box.expandByObject(o); });
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const eye = box.min.y + Math.min(s.y * 0.12, 1.7);
    a.camera.position.set(c.x + s.x * 0.08, eye, c.z + s.z * 0.08);
    a.controls.target.set(c.x, eye, c.z);
    a.controls.update();
    return a.camera.position.toArray().map(v => +v.toFixed(2));
  });
  console.log('pose', JSON.stringify(pose));
  // grade OFF so the probe sees the buffer the grade would receive
  await page.evaluate(() => { window.APP._gradeOff = true; window.APP.startStillRefine(); });
  await page.waitForFunction(() => window.APP._stillRefineBusy === false, { timeout: 300000, polling: 200 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  const probe = await page.evaluate(() => window.APP.probeGradeHdr());
  console.log('\nRESULT ' + (probe ? JSON.stringify(probe) : 'NULL — INCONCLUSIVE'));
  await browser.close();
})();
