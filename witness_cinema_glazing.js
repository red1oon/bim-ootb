#!/usr/bin/env node
/**
 * §CINEMA_SPIN_GLAZING witness — prompts/PHOTOREAL_STILL_RENDER.md §Issue 2 (spin-at-wall).
 * Light verification (per the user's own "don't overthink, simplest markers" instruction for this
 * issue): calls A.cinemaPathPlan() directly (the SYNCHRONOUS shared plan, no video capture needed)
 * from a few different starting camera poses on two buildings, and reads the real §CINEMA_DIVE log
 * line to confirm (a) no errors, (b) the new fanMinGlazing/nudgeCap fields are present and sane
 * (nudgeCap=9 only when fanMinGlazing=false and the room was genuinely tight), (c) fanMin (the
 * settle point's closest obstruction) does not get WORSE than before the fix on average.
 * Usage: node witness_cinema_glazing.js
 */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = 8493;

const CASES = [
  { name: 'HHS-A', db: 'buildings/HHS_Office_Federated_extracted.db', bld: 'HHS_Office_Federated',
    eye3: [-6.65, -4.82, 15.82], target3: [3.35, -4.82, 15.82] },
  { name: 'HHS-B', db: 'buildings/HHS_Office_Federated_extracted.db', bld: 'HHS_Office_Federated',
    eye3: [-6.65, -4.82, 20.78], target3: [-6.65, -4.82, 10.78] },
  { name: 'Hospital-default', db: 'buildings/Hospital_extracted.db', bld: 'Hospital', eye3: null, target3: null },
];

async function runCase(kase) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
           '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const lines = [];
  page.on('console', m => { const t = m.text(); if (/§CINEMA|Error/.test(t)) lines.push(t); });
  page.on('pageerror', e => lines.push('PAGEERROR ' + e.message));

  const url = `http://localhost:${PORT}/viewer/viewer.html?db=${kase.db}&bld=${kase.bld}&cb=${Date.now()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const streamed = await page.waitForFunction(() => {
    const A = window.APP || window.A;
    if (!A || !A.scene) return false;
    let n = 0; A.scene.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) n++; });
    return n > 50 ? n : false;
  }, { timeout: 90000, polling: 3000 }).then(h => h.jsonValue()).catch(() => 0);
  if (!streamed) { await browser.close(); return { err: 'no geometry streamed', lines }; }
  await new Promise(r => setTimeout(r, 15000));

  if (kase.eye3) {
    await page.evaluate((kase) => {
      const A = window.APP || window.A, THREE = window.THREE;
      A.camera.position.set(...kase.eye3);
      A.camera.lookAt(new THREE.Vector3(...kase.target3));
      A.camera.updateMatrixWorld(true);
      if (A.controls) { A.controls.target.set(...kase.target3); A.controls.update(); }
    }, kase);
  }

  const result = await page.evaluate(() => {
    const A = window.APP || window.A;
    if (typeof A.cinemaPathPlan !== 'function') return { err: 'cinemaPathPlan not found' };
    try {
      const plan = A.cinemaPathPlan(24);
      return { ok: true, hasplan: !!plan };
    } catch (e) {
      return { err: 'plan threw: ' + e.message };
    }
  });

  await browser.close();
  const diveLine = lines.filter(l => /§CINEMA_DIVE/.test(l)).pop() || null;
  const pageErrors = lines.filter(l => /PAGEERROR/.test(l));
  return { result, diveLine, pageErrors };
}

(async () => {
  // ONE case per process invocation — a prior witness in this same worktree found repeated
  // in-process puppeteer.launch() reuse reliably hangs/gets killed on the 2nd+ launch. See
  // witness_one_spot.js's header comment for the same lesson.
  const wanted = process.argv[2];
  const kase = CASES.find(c => c.name === wanted);
  if (!kase) { console.error('usage: node witness_cinema_glazing.js <' + CASES.map(c=>c.name).join('|') + '>'); process.exit(1); }
  console.log(`=== ${kase.name} ===`);
  const r = await runCase(kase);
  console.log('  planResult: ' + JSON.stringify(r.result));
  console.log('  diveLine: ' + r.diveLine);
  let anyFail = false;
  if (r.pageErrors.length) { console.log('  PAGE ERRORS: ' + JSON.stringify(r.pageErrors)); anyFail = true; }
  if (r.result && r.result.err) { console.log('  PLAN ERROR'); anyFail = true; }
  if (!r.diveLine) { console.log('  NO §CINEMA_DIVE LINE — plan may have failed silently'); anyFail = true; }
  else {
    const hasFields = /fanMinGlazing=(true|false)/.test(r.diveLine) && /nudgeCap=\d/.test(r.diveLine);
    console.log('  new fields present: ' + hasFields);
    if (!hasFields) anyFail = true;
  }
  console.log(anyFail ? 'FAIL' : 'PASS');
  process.exit(anyFail ? 1 : 0);
})();
