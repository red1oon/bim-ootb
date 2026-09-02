// DIAGNOSTIC 3 — the pose scan returned clearLOS = 0 for the ENTIRE interior walk band
// (t=0.15..0.60, 100-200 fixtures in frustum each, none in line of sight). Standing in a corridor at
// night with zero ceiling lights visible is not plausible, so before touching the sprite mechanism
// again the pose itself has to be interrogated. Two questions, both answered numerically:
//
//   A. IS THE CAMERA INSIDE GEOMETRY? Cast 6 axis rays from each interior-band eye. If the nearest
//      hit is a few cm in most directions, the camera is embedded in a wall/slab and EVERY fixture
//      is occluded no matter what the sprites do. NIGHT_AND_FIXTURE_LIGHTING.md already records
//      three separate attempts that put a probe camera inside walls.
//
//   B. A POSE CHOSEN FROM THE FIXTURE DATA, not from a path. For each of N sampled fixtures, stand
//      the eye 1.6m below it (a fixture is on a ceiling; below it is the floor it lights), reject
//      the spot if anything is within 0.5m in any direction (that is the inside-a-wall test), then
//      score the candidate by how many fixtures it sees UNOCCLUDED. Pure search over measured
//      geometry — no hand-picked viewpoint, and the winner is reproducible.
// Run: PORT=8403 BLD=Clinic node probe_glow_pose.js
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

  const res = await page.evaluate(() => {
    const A = window.APP, THREE = window.THREE;
    const pos = A._nightFixtureWorldPositions();
    const meshes = A.collectMeshes(o => o.isMesh && o.visible);
    const rc = new THREE.Raycaster(), dir = new THREE.Vector3(), v = new THREE.Vector3();
    const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    function clearance(p) {                       // nearest hit in 6 directions — inside-a-wall test
      const out = [];
      for (const d of DIRS) {
        rc.set(p, dir.set(d[0], d[1], d[2])); rc.far = 6;
        const h = rc.intersectObjects(meshes, false);
        out.push(h.length ? +h[0].distance.toFixed(2) : null);
      }
      return out;
    }

    // ── A. the Alt+C interior band
    const plan = A.cinemaPathPlan(30);
    const band = [0.15, 0.25, 0.35, 0.45, 0.55, 0.60].map(t => {
      const p = plan.poseAt(t);
      const eye = new THREE.Vector3(p.x, p.y, p.z);
      return { t, eye: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], clearance: clearance(eye) };
    });

    // fixture height distribution — a ceiling light should sit ~2.5-3.5m above the floor it lights
    const ys = pos.map(p => p.y).sort((a, b) => a - b);
    const q = f => +ys[Math.min(ys.length - 1, Math.floor(ys.length * f))].toFixed(2);

    // ── B. search the fixture cloud for a standable eye
    const cam = A.camera;
    const bbox = new THREE.Box3(); pos.forEach(p => bbox.expandByPoint(p));
    const centre = bbox.getCenter(new THREE.Vector3());
    const STEP = Math.max(1, Math.floor(pos.length / 120));   // ~120 candidates, deterministic stride
    const cands = [];
    for (let i = 0; i < pos.length; i += STEP) {
      const eye = new THREE.Vector3(pos[i].x, pos[i].y - 1.6, pos[i].z);   // stand under the fixture
      const cl = clearance(eye);
      const blocked = cl.filter(d => d !== null && d < 0.5).length;
      if (blocked > 0) continue;                                           // embedded — reject
      // look horizontally toward the fixture-cloud centre; a ceiling light is then in the upper frame
      const look = new THREE.Vector3(centre.x, eye.y, centre.z);
      if (look.distanceTo(eye) < 2) look.set(eye.x + 1, eye.y, eye.z);
      cam.position.copy(eye); cam.lookAt(look);
      cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      const fr = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      let inF = 0, clear = 0;
      for (let j = 0; j < pos.length; j++) {
        const p = pos[j];
        dir.copy(eye).sub(p).normalize();
        v.copy(p).addScaledVector(dir, 0.15);
        if (!fr.containsPoint(v)) continue;
        inF++;
        const dist = eye.distanceTo(v);
        rc.set(eye, dir.copy(v).sub(eye).normalize()); rc.far = dist;
        const h = rc.intersectObjects(meshes, false);
        if (!h.length || h[0].distance >= dist - 0.001) clear++;
      }
      cands.push({ i, eye: [+eye.x.toFixed(2), +eye.y.toFixed(2), +eye.z.toFixed(2)],
                   look: [+look.x.toFixed(2), +look.y.toFixed(2), +look.z.toFixed(2)],
                   inFrustum: inF, clear, minClearance: Math.min(...cl.filter(d => d !== null).concat([99])) });
    }
    cands.sort((a, b) => b.clear - a.clear);
    return { fixtures: pos.length, band, yq: { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) },
             candidates: cands.length, top: cands.slice(0, 8), rejected: Math.ceil(pos.length / STEP) - cands.length };
  });
  await browser.close();

  console.log(`\n=== §PHOTO_GLOW_SPRITE pose interrogation — ${BLD}, ${res.fixtures} fixtures`);
  console.log('\nA. is the Alt+C interior band standing inside geometry?');
  console.log('   nearest hit within 6m along +X -X +Y -Y +Z -Z  (null = nothing within 6m)');
  res.band.forEach(b => console.log(`   t=${String(b.t).padEnd(5)} eye (${b.eye.join(', ')})   ${JSON.stringify(b.clearance)}`));
  console.log(`\n   fixture height (world Y) percentiles: p05 ${res.yq.p05}  p25 ${res.yq.p25}  p50 ${res.yq.p50}  p75 ${res.yq.p75}  p95 ${res.yq.p95}`);
  console.log(`\nB. fixture-anchored eye search: ${res.candidates} standable candidates, ${res.rejected} rejected as embedded`);
  console.log('   clear  inFrustum   eye -> look');
  res.top.forEach(c => console.log(`   ${String(c.clear).padStart(5)} ${String(c.inFrustum).padStart(10)}   (${c.eye.join(', ')}) -> (${c.look.join(', ')})   minClearance ${c.minClearance}m`));
  console.log(logs.filter(l => /PAGEERROR/.test(l)).join('\n'));
})();
