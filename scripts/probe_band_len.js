// Probe §CPE_BAND_REACH: seeded band length in METRES and in PIXELS, per building.
// Proves or disproves "hard to grab the right end": a band whose three handles span fewer than
// ~88px cannot have its end told apart from its middle by pointer or finger.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8403;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal,Hospital').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'] });
  for (const BLD of BUILDINGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = []; page.on('console', m => logs.push(m.text()));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaSeedBands, { timeout: 120000 });
    await sleep(9000);
    await page.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch(e){ return false; } }, { timeout: 60000, polling: 2000 });
    const r = await page.evaluate(async () => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch(e){} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch(e){} }
      A._cinemaPathEdit = null;
      const plan = A.cinemaPathPlan(24, null);
      const bands = A.cinemaSeedBands(plan.waypoints, plan.pathLen);
      const cam = A.camera, el = A.renderer.domElement;
      const mPerPx = b => { const d = Math.hypot(b.c.x-cam.position.x, b.c.y-cam.position.y, b.c.z-cam.position.z);
        return 2*d*Math.tan(cam.fov*Math.PI/360)/el.clientHeight; };
      return { pathLen: plan.pathLen, flown: A.cinemaBandFlow(bands).length,
        bands: bands.map(b => ({ len: b.len, px: b.len / mPerPx(b), mpp: mPerPx(b) })) };
    });
    console.log(`\n=== ${BLD} (walk ${r.pathLen.toFixed(1)}m, flown ${r.flown} pts) ===`);
    r.bands.forEach((b,i) => console.log(`  band ${i}: ${b.len.toFixed(2)}m = ${b.px.toFixed(0)}px  (${b.mpp.toFixed(3)} m/px)  ends ${(b.px/2).toFixed(0)}px apart from mid`));
    const bind = logs.filter(l => l.includes('CPE_BAND_REACH'));
    if (bind.length) console.log('  ' + bind[0]);
    await page.close();
  }
  await browser.close();
})();
