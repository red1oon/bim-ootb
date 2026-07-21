// ⚠ DO NOT REMOVE — §15 POC harness (FLY_TOUR_DLOD_SCALE.md). Verbatim adaptation of
// witness/harness.js (room-occlusion task, PR #962) with ONE change: static server port 8403
// (this POC's own server; 8401 belongs to the room-occlusion worktree). Headless HARDWARE-GL
// Chrome, aborts hard on SwiftShader. Report-only measurement tool. Read the log after every run.
const path = require('path');
const { chromium } = require(path.join('/home/red1/bim-ootb/tests/node_modules', 'playwright-core'));

const URL = 'http://localhost:8403/viewer/viewer.html?db=/buildings/LTU_AHouse_extracted.db';

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

// Wait until the chunked dlod scan has settled at the current pose (N consecutive clean audits)
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

module.exports = { launch, loadLTU, engageDlod, ensureRooms, settle, URL };
