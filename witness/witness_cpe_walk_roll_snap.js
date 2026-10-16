// WITNESS — §CPE_WALK_ROLL_SNAP fix (prompts/CPE_POV_WALK_PATHING.md, 2026-08-11).
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G-ORDER-YXZ      mounting walk mode sets _vfCam.rotation.order to 'YXZ' (three.js's own
//                     PointerLockControls convention), not the default 'XYZ' — the structural root
//                     cause of the bug (pitch composed around WORLD X after yaw under 'XYZ' bakes
//                     roll into any diagonal look).
//   G-SPAWN-LEVEL    immediately after mount, BEFORE any mousemove, the camera's right vector has
//                     zero vertical component (no roll) — proves the fresh-spawn branch now applies
//                     rotation.set(pitch,yaw,0) itself instead of leaving whatever roll the inherited
//                     lookAt()-built pose had on screen until the first mousemove silently snapped it
//                     away (that silent snap was the user's "topples upside-down" report).
//   G-DIAGONAL-NO-ROLL for a spread of combined yaw+pitch poses (including near the +-90deg pitch
//                     clamp), set via the real _setPoseForTest surface — which calls the SAME
//                     `_vfCam.rotation.set(pitch, yaw, 0)` line _onMouseMove itself calls, so this
//                     exercises the actual shared write path, not a reimplementation — the camera's
//                     right vector stays level (y ~= 0). Direct regression test: under the old 'XYZ'
//                     order, right.y = sin(pitch)*sin(yaw), nonzero whenever BOTH yaw and pitch are
//                     nonzero, i.e. on nearly every real diagonal mouse move. A genuine OS pointer
//                     lock cannot be forced from automation (§CPE_WALK_CHROME_POC precedent, this same
//                     file's history: synthetic .click() gets NotAllowedError) so _onMouseMove's own
//                     _pointerLocked gate can't be exercised end-to-end headless; this gate proves the
//                     maths it depends on instead, at the same call site.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8534;
const BLD = process.env.BLD || 'Duplex';
const EPS = 1e-6;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openEditor(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.CpeWalk && window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(800);
  return { page, logs };
}

// Reads the live vfCam's right-vector Y component (the roll signature) directly from the page.
async function rightY(page) {
  return page.evaluate(() => {
    const cam = window.APP.cinemaPathEditor.activePOVCamera();
    if (!cam) return null;
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    return r.y;
  });
}

async function main() {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const { page, logs } = await openEditor(browser);

  // ══ mount walk mode (fresh spawn — no resume pose exists yet) ══
  await page.evaluate(() => window.CpeWalk.toggle());
  await sleep(150);

  const order = await page.evaluate(() => {
    const cam = window.APP.cinemaPathEditor.activePOVCamera();
    return cam ? cam.rotation.order : null;
  });
  P('G-ORDER-YXZ mount sets _vfCam.rotation.order to YXZ, not the XYZ default', order === 'YXZ', `order=${order}`);

  const spawnRightY = await rightY(page);
  P('G-SPAWN-LEVEL fresh spawn is level (right.y ~= 0) before any mousemove — no lingering lookAt() roll',
    spawnRightY !== null && Math.abs(spawnRightY) < EPS, `right.y=${spawnRightY}`);

  // ══ G-DIAGONAL-NO-ROLL — drive combined yaw+pitch via the real _setPoseForTest surface ══
  const combos = [
    { yaw: 45 * Math.PI / 180, pitch: 30 * Math.PI / 180 },
    { yaw: -60 * Math.PI / 180, pitch: 50 * Math.PI / 180 },
    { yaw: 170 * Math.PI / 180, pitch: -40 * Math.PI / 180 },
    { yaw: -170 * Math.PI / 180, pitch: 80 * Math.PI / 180 },   // near the +-90deg pitch clamp
    { yaw: 10 * Math.PI / 180, pitch: -89 * Math.PI / 180 },
  ];
  let diagPass = true, diagDetail = [];
  for (const c of combos) {
    await page.evaluate((yaw, pitch) => {
      window.CpeWalk._setPoseForTest({ x: 0, y: 1.6, z: 0 }, yaw, pitch);
    }, c.yaw, c.pitch);
    const ry = await rightY(page);
    const ok = ry !== null && Math.abs(ry) < 1e-9;
    if (!ok) diagPass = false;
    diagDetail.push(`yaw=${(c.yaw * 180 / Math.PI).toFixed(0)} pitch=${(c.pitch * 180 / Math.PI).toFixed(0)} right.y=${ry}`);
  }
  P('G-DIAGONAL-NO-ROLL combined yaw+pitch poses stay level (right.y ~= 0) across 5 combos incl. near +-90deg',
    diagPass, diagDetail.join(' | '));

  console.log('\n' + '='.repeat(78));
  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}`);
    console.log(`          ${c.d}`);
    if (!c.ok) allPass = false;
  }
  console.log('='.repeat(78));
  console.log(allPass ? `\nWITNESS PASS (${checks.length}/${checks.length})` : `\nWITNESS FAIL`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error('INFRA-ERROR', e); process.exit(2); });
