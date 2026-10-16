// Shared harness for W-BUDGET-* witnesses (FLY_TOUR_DLOD_SCALE.md §20). Copy of the existing
// tracked witness/harness.js (§13/§16 room-occlusion work) with ONE change: its own port (8406,
// this worktree's own static server) instead of the shared :8401, per worktree-hygiene "don't
// collide with a concurrent worktree's own standing server" — kept as a SEPARATE file rather than
// editing the tracked harness.js's URL, to avoid touching shared test infra for an unrelated
// change. Adds aerialPose() (§20-specific: a wide-orbit pose from the DB envelope, matching §10's
// "wide orbit" measurement shape) on top of the same proven primitives.
const path = require('path');
const { chromium } = require(path.join('/home/red1/bim-ootb/tests/node_modules', 'playwright-core'));

// §R15 (2026-09-03): port made overridable so a concurrent worktree can point the SAME proven
// primitives at its own static server without a third copy of this file. Default unchanged (8406),
// so every existing W-BUDGET-* witness behaves exactly as before.
const URL = process.env.WITNESS_URL ||
  'http://localhost:8406/viewer/viewer.html?db=/buildings/LTU_AHouse_extracted.db';

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

// Wait until the chunked scan has fully settled at the current pose/boost: run rAF frames until
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

// §20-specific: a wide aerial pose (same shape as §10's "wide orbit" case) from the DB envelope.
// factor scales how far out from the envelope (1.3 = comfortably wide, matches §10's fully-boxed
// aerial regime); angle rotates around the building center for multiple vantage samples.
async function aerialPose(page, factor, angle) {
  return await page.evaluate(({ factor, angle }) => {
    const A = window.APP || window.A;
    const env = A.dbQuery("SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MAX(center_z) FROM element_transforms")[0];
    const cx = (env[0] + env[1]) / 2, cy = (env[2] + env[3]) / 2;
    const rad = Math.max(env[1] - env[0], env[3] - env[2]) * factor;
    const ctr = A.ifc2three(cx, cy, env[4] / 2);
    const p = A.ifc2three(cx + rad * Math.cos(angle), cy + rad * Math.sin(angle), env[4] * 1.1);
    return { pos: [p.x, p.y, p.z], look: [ctr.x, ctr.y, ctr.z] };
  }, { factor, angle });
}

module.exports = { launch, loadLTU, engageDlod, settle, setPose, aerialPose, URL };
