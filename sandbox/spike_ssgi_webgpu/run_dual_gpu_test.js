// PROOF STAGE: does a second, independent WebGPU context (our SSGI/GTAO/TRAA pipeline) coexist in
// the SAME page as the real app's live WebGLRenderer? Loads the real viewer.html (classic pipeline
// active, exactly as a real session/bake would), injects gi_webgpu_tap.js via evaluateOnNewDocument
// (the same mechanism cli_silent_bake.js's --tap flag uses), then drives a few frames through
// window.__giWebgpuRenderFrame with real camera poses and saves each as a PNG. Does NOT touch
// cli_silent_bake.js or cinema_maxq.js — this is a standalone sandbox harness for the risk question
// only ("two GPU contexts in one page"), since the actual cinema_maxq.js _captureFrame splice hit a
// tool permission block (see report).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, 'out', 'dual_gpu_test');
fs.mkdirSync(OUT, { recursive: true });
// The pre-existing :8402 static server serves the MAIN checkout, which has no sandbox/ folder (that
// only exists in this worktree) — 404s on our vendor fetches. Serve OUR OWN, worktree-rooted server
// instead (same pattern as run_spike.js), so /sandbox/... resolves and /buildings/... still falls
// back to the main checkout (the DBs aren't in git).
const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_BUILDINGS = '/home/red1/bim-ootb/buildings';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json' };
const PORT = 8850;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let p2 = path.join(ROOT, u);
  if (u.startsWith('/buildings/') && !fs.existsSync(p2)) p2 = path.join(MAIN_BUILDINGS, u.slice('/buildings/'.length));
  fs.stat(p2, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p2)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(p2).pipe(res);
  });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--enable-unsafe-webgpu',
           '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--use-angle=gl-egl',
           '--window-size=1300,900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  const tapSrc = fs.readFileSync(path.join(__dirname, 'gi_webgpu_tap.js'), 'utf8');
  await p.evaluateOnNewDocument(tapSrc);
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/HHS_Office_Federated_silent.db`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  const want = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of want) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  console.log('§DUAL_GPU real app WebGL geometry streamed; watching tap status...');
  let status = null;
  for (let i = 0; i < 120; i++) {
    status = await p.evaluate(() => window.__giWebgpuTapStatus || null);
    if (status && (status.phase === 'ready' || /failed|blocked|timeout/i.test(status.phase))) break;
    await sleep(1000);
  }
  console.log('§DUAL_GPU_TAP_STATUS ' + JSON.stringify(status));
  if (!status || status.phase !== 'ready') {
    console.log(logs.filter(l => /GI_WEBGPU_TAP|error|ERROR/i.test(l)).slice(0, 40).join('\n'));
    await b.close(); server.close();
    process.exit(status && /blocked|failed/.test(status.phase) ? 2 : 1);
  }

  // Also confirm the REAL app's own WebGL context is still alive/rendering (proves coexistence, not
  // just that ours started while the other silently died).
  const glAlive = await p.evaluate(() => {
    try {
      const g = window.APP.renderer.getContext();
      return { contextLost: g.isContextLost ? g.isContextLost() : 'n/a', drawingBufferW: g.drawingBufferWidth };
    } catch (e) { return { error: e.message }; }
  });
  console.log('§DUAL_GPU_APP_WEBGL_ALIVE ' + JSON.stringify(glAlive));

  // Real poses from the saved cinema_path (same method traced this session): a couple of distinct
  // points along the actual authored path, driven the same way cinema_maxq.js's bake loop does
  // (A.camera.position.set + A.controls.target.set) — then render each via our tap.
  const poses = await p.evaluate(() => {
    const a = window.APP;
    try { a.cinemaPathPlan(60); } catch (e) {}
    const st = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
    if (!st) return null;
    const plan = a.cinemaPathPlan(st._total, st);
    const ts = [0, 10, 30, 61].map(t => Math.min(1, t / st._total));
    return ts.map(tn => plan.poseAt(tn));
  });
  console.log('§DUAL_GPU_POSES ' + JSON.stringify(poses));
  if (poses) {
    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i];
      await p.evaluate((pp) => {
        window.APP.camera.position.set(pp.x, pp.y, pp.z);
        window.APP.controls.target.set(pp.tx, pp.ty, pp.tz);
        window.APP.controls.update();
      }, pose);
      const t0 = Date.now();
      const err = await p.evaluate(async () => { try { await window.__giWebgpuRenderFrame(); return null; } catch (e) { return String(e && e.stack || e); } });
      const ms = Date.now() - t0;
      if (err) { console.log('§DUAL_GPU_RENDER_ERR i=' + i + ' ' + err); continue; }
      const durl = await p.evaluate(() => window.__GI_WEBGPU_CANVAS.toDataURL('image/png'));
      const fp = path.join(OUT, 'frame_' + i + '.png');
      fs.writeFileSync(fp, Buffer.from(durl.split(',')[1], 'base64'));
      console.log('§DUAL_GPU_FRAME i=' + i + ' ms=' + ms + ' saved=' + fp);
    }
  }
  console.log(logs.filter(l => /GI_WEBGPU_TAP|error|ERROR|warn/i.test(l)).slice(0, 40).join('\n'));
  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
