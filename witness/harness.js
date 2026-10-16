// Shared harness for W-OCCL-BVH-* browser witnesses (§17 real build). Headless HARDWARE-GL Chrome
// (same §HARNESS_GL approach as every prior witness in FLY_TOUR_DLOD_SCALE.md) against the static
// server at :8405 (this worktree's OWN server, /tmp/wt-occl-bvh — kept off :8401/:8402/:8403/:8404
// so it never collides with other concurrent worktrees' own standing servers there). Aborts hard if
// the renderer is SwiftShader (no software-GL evidence allowed).
const path = require('path');
const { chromium } = require(path.join('/home/red1/bim-ootb/tests/node_modules', 'playwright-core'));

const URL = 'http://localhost:8405/viewer/viewer.html?db=/buildings/LTU_AHouse_extracted.db';

async function launch(logSink) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
           '--window-size=1600,900'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', m => logSink(m.text()));
  page.on('pageerror', e => logSink('PAGEERROR ' + e.message));
  return { browser, page };
}

async function loadLTU(page, logSink) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // wait for geometry ACTUALLY resident: meta total + !streaming is not enough (streaming=false
  // before the stream even starts — first harness run engaged on an empty scene, REALIDX=0).
  // Poll the real per-guid representation count until >100k and stable across two polls.
  await page.waitForFunction(() =>
    (window.APP || window.A) && (window.APP || window.A).activeBuildingTotal > 100000 &&
    !(window.APP || window.A).streaming, null, { timeout: 300000, polling: 500 });
  let prev = -1;
  for (let i = 0; i < 300; i++) {
    const n = await page.evaluate(() => {
      const A = window.APP || window.A; let n = 0;
      if (A._instanceMeta) for (const k in A._instanceMeta) n += A._instanceMeta[k].length;
      if (A._batchMeta) for (const k in A._batchMeta) n += A._batchMeta[k].length;
      A.scene.traverse(o => { if (o.isMesh && o.userData && o.userData.guid) n++; });
      return n;
    });
    if (n > 100000 && n === prev) { logSink('§HARNESS_GEO resident=' + n); break; }
    prev = n;
    await new Promise(r => setTimeout(r, 2000));
    if (i === 299) throw new Error('geometry never became resident (last=' + n + ')');
  }
  const gl = await page.evaluate(() => {
    const A = window.APP || window.A;
    const ctx = A.renderer.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    return ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
  });
  logSink('§HARNESS_GL renderer=' + gl);
  if (/swiftshader/i.test(gl)) throw new Error('SOFTWARE GL — witness invalid: ' + gl);
  const total = await page.evaluate(() => (window.APP || window.A).activeBuildingTotal);
  logSink('§HARNESS_LOAD total=' + total);
  return { gl, total };
}

// Turn nav-DLOD pill on and wait until engaged (boxes built + real index). Asserts the real
// index is non-trivial — an entries=0 engage means the harness raced streaming (invalid run).
async function engageDlod(page, logLines) {
  await page.evaluate(() => window.toggleDlodNav());
  await page.waitForFunction(() => {
    const r = window.__dlodNavAudit && window.__dlodNavAudit();
    return r && r.engaged === true;
  }, null, { timeout: 120000, polling: 1000 });
  if (logLines) {
    const rl = logLines.filter(l => l.indexOf('§DLOD_NAV_REALIDX') >= 0).pop() || '';
    const m = /entries=(\d+)/.exec(rl);
    if (!m || +m[1] < 100000) throw new Error('REALIDX too small — raced streaming: ' + rl);
  }
}

// Compile/warm rooms explicitly (dlod's own warm is idle-deferred — witnesses need it NOW)
async function ensureRooms(page, logSink) {
  const res = await page.evaluate(async () => {
    const A = window.APP || window.A;
    await A.loadNavigate();
    const r = await A.ensureRooms({});
    return r;
  });
  logSink('§HARNESS_ROOMS ' + JSON.stringify(res));
  return res;
}

// Wait until the chunked scan has fully settled at the current pose: run rAF frames until
// N consecutive audits report mismatch==0 and fades==0 (end-state, not mid-transition).
async function settle(page, maxMs = 20000) {
  return await page.evaluate(async (maxMs) => {
    const t0 = performance.now();
    let stable = 0;
    while (performance.now() - t0 < maxMs) {
      await new Promise(r => requestAnimationFrame(r));
      const a = window.__dlodNavAudit();
      if (a.engaged && a.mismatch === 0 && a.fades === 0) { if (++stable >= 3) return a; }
      else stable = 0;
    }
    return window.__dlodNavAudit();
  }, maxMs);
}

// Deterministic scene fingerprint of the nav-proxy box set: FNV-1a over every isDlodNavProxy
// InstancedMesh's instanceMatrix array (meshes sorted by a stable key), plus counts.
async function proxyFingerprint(page) {
  return await page.evaluate(() => {
    const A = window.APP || window.A;
    const meshes = [];
    A.scene.traverse(o => { if (o.userData && o.userData.isDlodNavProxy) meshes.push(o); });
    meshes.sort((a, b) => (a.count - b.count) || (a.material.color.getHex() - b.material.color.getHex()));
    let h = 0x811c9dc5, nonZero = 0;
    for (const m of meshes) {
      const arr = m.instanceMatrix.array;
      for (let i = 0; i < arr.length; i++) {
        // hash the float bits
        const v = arr[i];
        const u = new Uint32Array(new Float32Array([v]).buffer)[0];
        h ^= u & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
        h ^= (u >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
        h ^= (u >>> 16) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
        h ^= (u >>> 24) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
      }
      for (let i = 0; i < m.count; i++) { if (arr[i * 16 + 0] !== 0 || arr[i * 16 + 5] !== 0) nonZero++; }
    }
    let hiddenMeshes = 0;
    A.scene.traverse(o => { if (o.isMesh && !o.visible && o.userData && o.userData.guid) hiddenMeshes++; });
    return { hash: ('00000000' + h.toString(16)).slice(-8), boxInstancesVisible: nonZero, hiddenMeshes, proxyMeshes: meshes.length };
  });
}

// Move camera to a pose (three coords) and look at a target, mark dirty
async function setPose(page, pos, look) {
  await page.evaluate(({ pos, look }) => {
    const A = window.APP || window.A;
    A.camera.position.set(pos[0], pos[1], pos[2]);
    A.camera.lookAt(look[0], look[1], look[2]);
    A.camera.updateMatrixWorld(true);
    if (A.controls && A.controls.target) A.controls.target.set(look[0], look[1], look[2]);
    if (A.markDirty) A.markDirty();
  }, { pos, look });
}

module.exports = { launch, loadLTU, engageDlod, ensureRooms, settle, proxyFingerprint, setPose, URL };
