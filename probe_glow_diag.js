// DIAGNOSTIC — W-GLOW-SPRITE came back PARTIAL: 841/841 sprites staged, 0 materials touched, but
// mean luminance moved only +0.7% over bloom-alone.
//
// FIRST RUN ANSWERED THE FIRST QUESTION (Clinic @ poseAt(0.60)):
//   inFrustum 159, occluded 158, clear 1, gap median 7.97m, p25 5.02m
// A 7.97m gap is not a fixture-thickness problem — those sprites are behind WALLS, in rooms the
// camera cannot see into, and depthTest hiding them is CORRECT. The pose simply has nothing to light.
// But gapMin was 0.019m, so some sprites are hidden by their OWN fitting, which the 0.15m eye offset
// was supposed to clear and did not.
//
// SO THIS RUN ANSWERS TWO THINGS, both by measurement, so neither the pose nor the offset is a guess:
//   1. gap HISTOGRAM — how many occlusions are the fitting itself (small gap) vs a wall (large gap)?
//      That threshold is what a corrective rule would key on.
//   2. POSE SCAN across the whole Alt+C plan — which t has fixtures actually in line of sight? The
//      witness must be measured somewhere the mechanism can be seen to work or fail on its merits.
// Run: PORT=8403 BLD=Clinic node probe_glow_diag.js
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8403, BLD = process.env.BLD || 'Clinic';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.startStillRefine && window.APP._composer, { timeout: 240000 });
  await sleep(12000);
  await page.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 180000, polling: 2000 });
  const all = await page.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const b of all.filter(x => /Architectural|Electrical/i.test(x)).sort()) {
    await page.evaluate(bb => { try { window.APP.streamBuilding(bb); } catch (e) {} }, b);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await page.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  await page.evaluate(() => window.APP.toggleNightMode());
  await sleep(4000);

  const scan = await page.evaluate(() => {
    const A = window.APP, THREE = window.THREE;
    const pos = A._nightFixtureWorldPositions();
    const cam = A.camera, plan = A.cinemaPathPlan(30);
    const meshes = A.collectMeshes(o => o.isMesh && o.visible);
    const rc = new THREE.Raycaster(), v = new THREE.Vector3(), dir = new THREE.Vector3();
    const EYE = 0.15;
    const rows = [], histAll = {};
    const BINS = [0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.5, 3, 6, 12, 1e9];
    BINS.forEach(b => histAll[b] = 0);
    for (let s = 0; s <= 20; s++) {
      const t = s / 20, p = plan.poseAt(t);
      cam.position.set(p.x, p.y, p.z);
      cam.lookAt(p.tx, p.ty, p.tz);
      cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      const fr = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      let inF = 0, clear = 0, near = 0;
      for (let i = 0; i < pos.length; i++) {
        // same eye-offset the staging applies
        const q = pos[i];
        dir.copy(cam.position).sub(q).normalize();
        v.copy(q).addScaledVector(dir, EYE);
        if (!fr.containsPoint(v)) continue;
        inF++;
        const dist = cam.position.distanceTo(v);
        dir.copy(v).sub(cam.position).normalize();
        rc.set(cam.position, dir); rc.far = dist;
        const hit = rc.intersectObjects(meshes, false);
        if (!hit.length || hit[0].distance >= dist - 0.001) { clear++; continue; }
        const gap = dist - hit[0].distance;
        for (const b of BINS) if (gap <= b) { histAll[b]++; break; }
        if (gap <= 0.8) near++;
      }
      rows.push({ t: +t.toFixed(2), inFrustum: inF, clear, nearOccluded: near,
        pose: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), tx: +p.tx.toFixed(1), ty: +p.ty.toFixed(1), tz: +p.tz.toFixed(1) } });
    }
    return { fixtures: pos.length, rows, histAll, bins: BINS, pathLen: plan.pathLen };
  });
  await browser.close();

  console.log(`\n=== §PHOTO_GLOW_SPRITE pose scan — ${BLD}, ${scan.fixtures} fixtures, Alt+C path ${scan.pathLen ? scan.pathLen.toFixed(1) : '?'}m`);
  console.log('  t      inFrustum  clearLOS  nearOccluded(<=0.8m, i.e. its own fitting)   camera');
  scan.rows.forEach(r => console.log(
    `  ${String(r.t).padEnd(6)} ${String(r.inFrustum).padStart(7)} ${String(r.clear).padStart(10)} ${String(r.nearOccluded).padStart(12)}          ` +
    `(${r.pose.x}, ${r.pose.y}, ${r.pose.z}) -> (${r.pose.tx}, ${r.pose.ty}, ${r.pose.tz})`));
  console.log('\n  occlusion gap histogram, all poses pooled — small gap = the fitting itself, large = a wall');
  let prev = 0;
  scan.bins.forEach(b => { console.log(`    <= ${String(b === 1e9 ? 'inf' : b + 'm').padEnd(6)} ${String(scan.histAll[b]).padStart(6)}   (from ${prev}m)`); prev = b; });
  const best = scan.rows.slice().sort((a, b) => b.clear - a.clear)[0];
  console.log(`\n  BEST POSE for the witness: t=${best.t} with ${best.clear} fixtures in clear line of sight (of ${best.inFrustum} in frustum)`);
  console.log(logs.filter(l => /PAGEERROR/.test(l)).join('\n'));
})();
