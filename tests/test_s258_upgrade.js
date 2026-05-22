#!/usr/bin/env node
/**
 * S258 Three.js Upgrade — Whitebox verification
 * REAL tests: move camera, click-pick, verify DLOD, BVH, brightness
 * Usage: node deploy/dev/tests/test_s258_upgrade.js [db_path]
 */
const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules/playwright'));

const DB = process.argv[2] || 'buildings/SampleHouse_extracted.db';
const IS_LARGE = DB.includes('Terminal') || DB.includes('LTU');
const PORT = 8799;
const STREAM_WAIT = DB.includes('LTU') ? 100000 : DB.includes('Terminal') ? 60000 : 20000;

(async () => {
  const http = require('http');
  const fs = require('fs');
  const MIME = { '.html':'text/html', '.js':'application/javascript', '.wasm':'application/wasm',
    '.db':'application/octet-stream', '.json':'application/json', '.css':'text/css', '.png':'image/png' };
  const root = path.join(__dirname, '..');
  const server = http.createServer((req, res) => {
    const fp = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  server.listen(PORT);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  page.on('pageerror', err => logs.push('PAGE_ERROR: ' + err.message));

  console.log(`\n═══ S258 Whitebox — ${DB} ═══`);
  console.log(`Streaming wait: ${STREAM_WAIT/1000}s\n`);

  await page.goto(`http://localhost:${PORT}/index.html?db=${DB}`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await page.waitForTimeout(STREAM_WAIT);

  var pass = 0, fail = 0;
  function check(name, actual, expected, msg) {
    const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
    const label = typeof expected === 'function' ? String(actual) : `${actual} (expected: ${expected})`;
    console.log(`  ${ok ? '✓' : '✗'} ${name}: ${ok ? actual : label}${msg ? ' — ' + msg : ''}`);
    if (ok) pass++; else fail++;
  }

  // ═══ T1: Core settings ═══
  console.log('\n── T1: r156 core settings ──');
  const core = await page.evaluate(() => ({
    rev: THREE.REVISION,
    colorMgmt: THREE.ColorManagement.enabled,
    outputCS: APP.renderer.outputColorSpace,
    toneMapping: APP.renderer.toneMapping,
    useLegacy: APP.renderer.useLegacyLights,
    bvhReady: !!window._bvhReady,
    streamedCount: APP.streamedCount
  }));
  check('r156 loaded', core.rev, '156');
  check('ColorManagement off', core.colorMgmt, false);
  check('LinearSRGB output', core.outputCS, 'srgb-linear');
  check('Legacy lights', core.useLegacy, true);
  check('BVH ready', core.bvhReady, true);
  check('Streaming complete', core.streamedCount, v => v > 0);

  // ═══ T2: Click-pick — does raycaster find a mesh? ═══
  console.log('\n── T2: Click-pick (BVH accelerated raycast) ──');
  const pickResult = await page.evaluate(() => {
    // Aim ray at scene centre
    var raycaster = new THREE.Raycaster();
    var mouse = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(mouse, APP.camera);
    raycaster.firstHitOnly = !!window._bvhReady;
    var meshes = [];
    APP.scene.traverse(o => {
      if ((o.isMesh || o.isInstancedMesh) && o.visible) meshes.push(o);
    });
    var t0 = performance.now();
    var hits = raycaster.intersectObjects(meshes, false);
    var ms = (performance.now() - t0).toFixed(2);
    return {
      meshCount: meshes.length,
      hitCount: hits.length,
      firstHitOnly: raycaster.firstHitOnly,
      ms: parseFloat(ms),
      hitDist: hits.length ? hits[0].distance.toFixed(1) : null,
      hitType: hits.length ? (hits[0].object.isInstancedMesh ? 'instanced' : 'mesh') : null
    };
  });
  check('Meshes available', pickResult.meshCount, v => v > 0);
  check('Ray hit something', pickResult.hitCount, v => v > 0, `${pickResult.hitCount} hits in ${pickResult.ms}ms`);
  check('firstHitOnly (BVH)', pickResult.firstHitOnly, true);
  if (IS_LARGE) {
    check('Pick speed <50ms', pickResult.ms, v => v < 50, `${pickResult.ms}ms`);
  }
  console.log(`  info: hitDist=${pickResult.hitDist} type=${pickResult.hitType}`);

  // ═══ T3: InstancedMesh native raycast (no polyfill) ═══
  console.log('\n── T3: InstancedMesh native raycast ──');
  const instTest = await page.evaluate(() => {
    var proto = THREE.InstancedMesh.prototype;
    return {
      hasPolyfill: !!proto._hasRaycastPoly,
      hasNativeRaycast: typeof proto.raycast === 'function'
    };
  });
  check('Polyfill removed', instTest.hasPolyfill, false);
  check('Native raycast exists', instTest.hasNativeRaycast, true);

  // ═══ T4: DLOD — move camera, verify visibility changes ═══
  if (IS_LARGE) {
    console.log('\n── T4: DLOD — camera move → visibility delta ──');

    // Snapshot visibility at current (far) camera
    const before = await page.evaluate(() => {
      var vis = 0; APP.scene.traverse(o => { if (o.isMesh && o.userData.guid && o.visible) vis++; });
      return { vis: vis, dlod: APP._dlodEnabled, camDist: APP.camera.position.distanceTo(APP.controls.target).toFixed(0) };
    });
    console.log(`  before: vis=${before.vis} dlod=${before.dlod} camDist=${before.camDist}`);

    // Move camera CLOSE to building (zoom in) — should trigger storey culling
    await page.evaluate(() => {
      var t = APP.controls.target;
      APP.camera.position.set(t.x + 5, t.y + 3, t.z + 5);
      APP.controls.update();
      APP.camera.updateMatrixWorld();
      // Force DLOD tick
      if (APP.dlodTick) { APP._dlodFrame = 5; APP.dlodTick(); }
    });
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      var vis = 0, dlodHid = 0;
      APP.scene.traverse(o => {
        if (o.isMesh && o.userData.guid) {
          if (o.visible) vis++; else if (o.userData._dlodHidden) dlodHid++;
        }
      });
      return { vis: vis, dlodHid: dlodHid, camDist: APP.camera.position.distanceTo(APP.controls.target).toFixed(0) };
    });
    console.log(`  after:  vis=${after.vis} dlodHid=${after.dlodHid} camDist=${after.camDist}`);
    check('DLOD reduced visible count', after.vis, v => v < before.vis, `${before.vis} → ${after.vis}`);
    check('DLOD hid elements', after.dlodHid, v => v > 0, `${after.dlodHid} hidden`);

    // Move camera BACK — visibility should restore
    await page.evaluate(() => {
      var t = APP.controls.target;
      var dist = 500;
      APP.camera.position.set(t.x + dist * 0.6, t.y + dist * 0.8, t.z + dist * 0.6);
      APP.controls.update();
      APP.camera.updateMatrixWorld();
      if (APP.dlodTick) { APP._dlodFrame = 5; APP.dlodTick(); }
    });
    await page.waitForTimeout(500);

    const restored = await page.evaluate(() => {
      var vis = 0; APP.scene.traverse(o => { if (o.isMesh && o.userData.guid && o.visible) vis++; });
      return { vis: vis };
    });
    console.log(`  restored: vis=${restored.vis}`);
    check('DLOD restored on zoom out', restored.vis, v => v >= before.vis * 0.9, `${restored.vis} ≥ ${Math.floor(before.vis * 0.9)}`);
  }

  // ═══ T5: BVH deferred — verify built in background ═══
  console.log('\n── T5: BVH deferred build ──');
  const bvhDeferred = logs.filter(l => l.includes('BVH_DEFERRED'));
  if (bvhDeferred.length) {
    const m = bvhDeferred[0].match(/built=(\d+)\s+ms=(\d+)/);
    if (m) {
      check('BVH built in background', parseInt(m[1]), v => v > 0, `${m[1]} geometries in ${m[2]}ms`);
    } else {
      check('BVH_DEFERRED log parseable', false, true);
    }
  } else {
    // LTU may not finish in time — check bvh=0 during streaming instead
    const bvhZero = logs.filter(l => l.includes('BLOB_FETCH') && l.includes('bvh=0'));
    check('BVH skipped during streaming', bvhZero.length, v => v > 0, `${bvhZero.length} batches with bvh=0`);
  }

  // ═══ T6: Brightness — material color not clamped/darkened ═══
  console.log('\n── T6: Material brightness ──');
  const brightness = await page.evaluate(() => {
    var samples = [];
    APP.scene.traverse(o => {
      if (samples.length < 10 && o.isMesh && o.userData.guid && o.material) {
        var c = o.material.color;
        samples.push({ r: c.r, g: c.g, b: c.b, hex: '#' + c.getHexString() });
      }
    });
    // Check that colors aren't all near-black (gamma double-correction symptom)
    var avgBrightness = samples.reduce((s, c) => s + (c.r + c.g + c.b) / 3, 0) / Math.max(1, samples.length);
    return { avgBrightness: avgBrightness.toFixed(3), sampleCount: samples.length, first: samples[0]?.hex };
  });
  check('Material avg brightness > 0.15', parseFloat(brightness.avgBrightness), v => v > 0.15,
    `avg=${brightness.avgBrightness} first=${brightness.first}`);

  // ═══ T7: Page errors ═══
  console.log('\n── T7: Runtime errors ──');
  const pageErrors = logs.filter(l => l.includes('PAGE_ERROR'));
  const initErrors = logs.filter(l => l.includes('§INIT_ERROR') || l.includes('§INIT_VIEWER_ERROR'));
  check('No page errors', pageErrors.length, 0);
  check('No init errors', initErrors.length, 0);
  if (pageErrors.length) pageErrors.forEach(l => console.log('  ' + l));
  if (initErrors.length) initErrors.forEach(l => console.log('  ' + l));

  // ═══ Summary ═══
  console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);

  await browser.close();
  server.close();
  process.exit(fail > 0 ? 1 : 0);
})();
