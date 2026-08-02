// WITNESS — §PHOTO_SKYLINE_SHADOW_FRUSTUM (2026-08-02)
// ISSUE IT PROVES/DISPROVES: user report "the silhouette buildings in distance cannot cast
// shadows well now" — the distant skyline ring (_buildPhotoProps, effects.js, radius = envelope *
// PHOTO_SKYLINE_RADIUS_MULT) sat OUTSIDE the shadow-camera's orthographic frustum
// (_enablePhotoShadows, _env sized to the main building's envelope only, 1x) — the ring was
// clipped from the shadow depth pass entirely, before any render, regardless of castShadow being
// set correctly elsewhere. Confirmed via real measured numbers before fixing (not assumption):
// HHS_Office_Federated envelope=68.17m → pre-fix frustum half-width=69m, skyline boxes at
// 139.5-160.4m from center — 36/36 outside. This has been true since the photo-shadow feature's
// OWN introduction (PR #806, 2026-07-16) — the same commit that set the skyline radius multiplier
// never sized this frustum to match; not a later drift-apart regression.
//
// This witness reads the REAL THREE.js shadow-camera frustum (A.sun.shadow.camera.left/right, the
// same object the renderer's shadow pass actually uses) and the REAL skyline box world positions
// (A._getPhotoSkyline().children) live from the running app — never asks the code whether it
// thinks it worked. PASS bar: every skyline box's position falls within [-_env,_env] on both X and
// Z (relative to the shadow camera's look-at target), zero page errors.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8461;
const BLD = process.env.BLD || 'HHS_Office_Federated';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  console.log(`\n${'='.repeat(78)}\n§PHOTO_SKYLINE_SHADOW_FRUSTUM witness — ${BLD}\n${'='.repeat(78)}`);
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls &&
    typeof window.APP.toggleStillRefine === 'function', { timeout: 90000 });
  // Must wait for the DB to be actually loaded (buildingCentres.envelope populated) before
  // triggering Alt+S — an early trigger falls back to the unrelated _env=300 default, which is
  // not the production condition this bug was reported under.
  await page.waitForFunction(() => {
    const bc = window.APP.buildingCentres && Object.values(window.APP.buildingCentres)[0];
    return bc && bc.envelope > 0 && window.APP.dbQuery;
  }, { timeout: 120000, polling: 500 });
  await page.waitForFunction(() => window.APP.streaming === false, { timeout: 60000, polling: 500 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => { window.APP.toggleStillRefine(); });
  await new Promise(r => setTimeout(r, 3000));

  const nums = await page.evaluate(() => {
    const A = window.APP;
    const bc = Object.values(A.buildingCentres || {})[0];
    const envelope = bc ? bc.envelope : null;
    const _env = A.sun && A.sun.shadow ? A.sun.shadow.camera.right : null;
    const mapSize = A.sun && A.sun.shadow ? A.sun.shadow.mapSize.width : null;
    const skyline = A._getPhotoSkyline ? A._getPhotoSkyline() : null;
    const ctr = A.controls ? A.controls.target : { x: 0, y: 0, z: 0 };
    const boxResults = [];
    if (skyline) {
      skyline.children.forEach(function(b) {
        const dx = b.position.x - ctr.x, dz = b.position.z - ctr.z;
        const insideX = Math.abs(dx) <= _env, insideZ = Math.abs(dz) <= _env;
        boxResults.push({ dx: +dx.toFixed(1), dz: +dz.toFixed(1), inside: insideX && insideZ });
      });
    }
    return { envelope, _env, mapSize, skylineBoxCount: skyline ? skyline.children.length : 0, boxResults };
  });

  const outside = nums.boxResults.filter(b => !b.inside);
  const texelPerM = nums._env ? (nums.mapSize / (2 * nums._env)).toFixed(1) : null;
  console.log('--- measured ---');
  console.log('envelope=' + nums.envelope + ' frustum_env(half-width)=' + nums._env +
    ' skylineBoxCount=' + nums.skylineBoxCount + ' outside=' + outside.length + ' texelPerM=' + texelPerM);
  if (outside.length) console.log('outside sample: ' + JSON.stringify(outside.slice(0, 5)));

  const relevant = logs.filter(l => l.includes('§PHOTO_SHADOW') || l.includes('§PHOTO_ADDONS'));
  console.log('\n--- relevant log lines ---');
  relevant.forEach(l => console.log(l));

  const pageErrors = logs.filter(l => l.startsWith('PAGEERROR'));
  console.log('§WITNESS pageErrors=' + pageErrors.length);
  if (pageErrors.length) pageErrors.forEach(l => console.log(l));

  await browser.close();

  const pass = nums.skylineBoxCount > 0 && outside.length === 0 && pageErrors.length === 0;
  console.log('\n' + (pass ? 'PASS' : 'FAIL') + ' — §PHOTO_SKYLINE_SHADOW_FRUSTUM: ' +
    (outside.length === 0
      ? 'all ' + nums.skylineBoxCount + ' skyline boxes fall inside the shadow-camera frustum (env=' + nums._env + '), zero pageerrors.'
      : outside.length + '/' + nums.skylineBoxCount + ' skyline boxes fall OUTSIDE the frustum — they cannot cast shadows.'));
  process.exit(pass ? 0 : 1);
})();
