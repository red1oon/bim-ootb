// probe_measure_dot.js — W-MEASURE-WAKE: placing the first measure dot wakes the idle loop.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8199;
const BLD = 'Duplex';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function measureAt(px, py) {
  const A = window.A || window.APP;
  const canvas = A.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  A.mouse.x = ((px - rect.left) / rect.width) * 2 - 1;
  A.mouse.y = -((py - rect.top) / rect.height) * 2 + 1;
  A.raycaster.setFromCamera(A.mouse, A.camera);
  const meshes = [];
  A.scene.traverse(o => { if (o.isMesh && o !== A.ground && o.visible) meshes.push(o); });
  const hit = A.raycaster.intersectObjects(meshes, false).length > 0;
  if (hit) A._doMeasureClick({ clientX: px, clientY: py });
  return hit;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  let fail = 0;
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0; }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 120000 }).catch(() => {});
    await sleep(2000);
    // Confirm the served HTML actually loaded the fixed measure.js (?v=50 has the markDirty wake).
    const fixPresent = await page.evaluate(() => { const A = window.A || window.APP; return typeof A._doMeasureClick === 'function'; });
    console.log('§PROBE _doMeasureClick present=' + fixPresent);
    await page.evaluate(() => { const A = window.A || window.APP; A.measureActive = true; A.measureFirstPoint = null; });
    let prev = -1, stable = 0;
    for (let i = 0; i < 8 && stable < 3; i++) { await sleep(1000); const n = logs.filter(l => l.includes('§RENDER_LOOP start')).length; if (n === prev) stable++; else { stable = 0; prev = n; } }
    const loopBefore = logs.filter(l => l.includes('§RENDER_LOOP start')).length;
    const placedBefore = logs.filter(l => l.includes('§MEASURE dot placed')).length;
    let hit = false;
    for (const [fx, fy] of [[0.5,0.5],[0.5,0.45],[0.45,0.55],[0.55,0.5],[0.5,0.6],[0.4,0.5],[0.6,0.55],[0.5,0.35]]) {
      hit = await page.evaluate(({fx,fy,src}) => { const measureAt = eval('(' + src + ')'); return measureAt(Math.round(window.innerWidth*fx), Math.round(window.innerHeight*fy)); }, { fx, fy, src: measureAt.toString() });
      if (hit) break;
    }
    await sleep(900);
    const placedAfter = logs.filter(l => l.includes('§MEASURE dot placed')).length;
    const loopAfter = logs.filter(l => l.includes('§RENDER_LOOP start')).length;
    const markerInScene = await page.evaluate(() => { const A = window.A || window.APP; return !!(A.measureFirstMarker && A.measureGroup && A.measureGroup.children.includes(A.measureFirstMarker)); });
    const dotPlaced = placedAfter > placedBefore, loopWoke = loopAfter > loopBefore;
    console.log(`§W-MEASURE-WAKE rayHit=${hit} dotPlaced=${dotPlaced} markerInScene=${markerInScene} loop=${loopBefore}->${loopAfter} loopWoke=${loopWoke}`);
    if (!(fixPresent && dotPlaced && markerInScene && loopWoke)) { console.log('§W-MEASURE-WAKE FAIL'); fail++; } else console.log('§W-MEASURE-WAKE PASS');
  } catch (e) { console.log('PROBE_ERROR ' + e.message); fail++; }
  finally { await browser.close(); }
  console.log(fail === 0 ? '\n§PROBE ALL PASS' : `\n§PROBE FAIL (${fail})`);
  process.exit(fail === 0 ? 0 : 1);
})();
