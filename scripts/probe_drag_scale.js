// Probe: how many METRES does one PIXEL of drag move a band handle?
// §CPE_SCREEN_PLANE is settled — a drag moves the handle in the camera's view plane, and G-DRAG-4
// already proves that mapping is 1:1 in SCREEN terms (0.997x). This asks the different question the
// user's "wp1 jumps to way high" implies: 1:1 on screen is not 1:1 in the world, because the view
// plane sits at the handle's distance from the camera. The further the building, the more world
// metres one pixel buys. Proves or disproves: is the drag's world-space sensitivity the reason a
// small gesture throws a waypoint far off the walking plane?
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8403;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal,Hospital').split(',');
const DUR = 24;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  for (const BLD of BUILDINGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaSeedBands,
      { timeout: 120000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    const r = await page.evaluate(async (dur) => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      A._cinemaPathEdit = null;
      const plan = A.cinemaPathPlan(dur, null);
      const bands = A.cinemaSeedBands(plan.waypoints, plan.pathLen);
      const cam = A.camera || (A.viewer && A.viewer.camera);
      if (!cam) return { err: 'no camera' };
      const vpH = (A.renderer && A.renderer.domElement && A.renderer.domElement.clientHeight) || 700;
      // metres per pixel in the view plane at distance d: 2*d*tan(fov/2) / viewportHeight
      const fov = cam.fov * Math.PI / 180;
      const out = bands.map((b, i) => {
        const d = Math.hypot(b.c.x - cam.position.x, b.c.y - cam.position.y, b.c.z - cam.position.z);
        return { band: i, dist: d, mPerPx: 2 * d * Math.tan(fov / 2) / vpH };
      });
      // the walking plane the bands are supposed to sit on
      const ys = bands.map(b => b.c.y);
      return { out, vpH, fov: cam.fov, camY: cam.position.y,
               bandY: { min: Math.min(...ys), max: Math.max(...ys) }, pathLen: plan.pathLen };
    }, DUR);

    if (r.err) { console.log(`${BLD}: ${r.err}`); await page.close(); continue; }
    console.log(`\n=== ${BLD} (fov=${r.fov}, viewport ${r.vpH}px, walk ${r.pathLen.toFixed(1)}m) ===`);
    for (const b of r.out) {
      console.log(`  band ${b.band}: dist=${b.dist.toFixed(1)}m  ->  ${b.mPerPx.toFixed(4)} m/px` +
        `   (a 50px nudge = ${(b.mPerPx * 50).toFixed(2)}m,  a 200px drag = ${(b.mPerPx * 200).toFixed(1)}m)`);
    }
    await page.close();
  }
  await browser.close();
})();
