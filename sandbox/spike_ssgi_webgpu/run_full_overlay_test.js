// SMALL TEST (2-3 frames, NOT a full render) for the extended gi_webgpu_tap.js full-bake overlay
// driver. Loads the real viewer.html (classic pipeline live), injects window.__GI_TAP_CONFIG (res +
// save port + db file — all now configurable, was hardcoded) then gi_webgpu_tap.js, calls
// window.__giFullBakeSetup(fps) once and window.__giFullBakeFrame(i) a few times, saving each
// composited (GI + real 2D overlays) frame via POST — same /__saveFrame/NNNN model run_spike.js
// uses. Does NOT touch cli_silent_bake.js/cinema_maxq.js/effects_gi_poc.js.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, 'out', 'full_overlay_test');
fs.mkdirSync(OUT, { recursive: true });

const N_TEST_FRAMES = 3;   // small on purpose — proves overlays draw, not a real bake
const FPS = 24, W = 960, H = 540;   // small res for a fast test; the real run would use 1920x1080
const DB_FILE = '/buildings/HHS_Office_Federated_silent.db';

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_BUILDINGS = '/home/red1/bim-ootb/buildings';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json' };
const PORT = 8851;
let framesSaved = 0;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__saveFrame/')) {
    const idx = req.url.slice('/__saveFrame/'.length);
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => { fs.writeFileSync(path.join(OUT, `frame_${idx}.png`), Buffer.concat(chunks)); framesSaved++; res.writeHead(200); res.end(); });
    return;
  }
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
  await p.evaluateOnNewDocument((cfg) => { window.__GI_TAP_CONFIG = cfg; }, { w: W, h: H, port: PORT, dbFile: DB_FILE });
  const tapSrc = fs.readFileSync(path.join(__dirname, 'gi_webgpu_tap.js'), 'utf8');
  await p.evaluateOnNewDocument(tapSrc);
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=${DB_FILE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  const want = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of want) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  console.log('§FULL_OVERLAY_TEST real app streamed; watching tap status...');
  let status = null;
  for (let i = 0; i < 120; i++) {
    status = await p.evaluate(() => window.__giWebgpuTapStatus || null);
    if (status && (status.phase === 'ready' || /failed|blocked|timeout/i.test(status.phase))) break;
    await sleep(1000);
  }
  console.log('§FULL_OVERLAY_TAP_STATUS ' + JSON.stringify(status));
  if (!status || status.phase !== 'ready') {
    console.log(logs.filter(l => /GI_WEBGPU_TAP|error|ERROR/i.test(l)).slice(0, 40).join('\n'));
    await b.close(); server.close();
    process.exit(1);
  }

  const setupResult = await p.evaluate(async (fps) => {
    try { return { ok: true, r: await window.__giFullBakeSetup(fps) }; }
    catch (e) { return { ok: false, error: String(e && e.stack || e) }; }
  }, FPS);
  console.log('§FULL_OVERLAY_SETUP ' + JSON.stringify(setupResult));
  if (!setupResult.ok || !setupResult.r) {
    console.log(logs.filter(l => /GI_WEBGPU_TAP|FULLBAKE|error|ERROR/i.test(l)).slice(0, 60).join('\n'));
    await b.close(); server.close();
    process.exit(2);
  }
  console.log('§FULL_OVERLAY_REAL_DURATION nFrames=' + setupResult.r.nFrames + ' fps=' + setupResult.r.fps + ' total=' + setupResult.r.total.toFixed(2) + 's (informational — this test only renders ' + N_TEST_FRAMES + ' frames)');

  // Spread the tiny test across the real duration (start / mid / near-end) rather than 3 consecutive
  // frames, so it exercises different plan beats (captions/sun angle differ) in one small run.
  const testIdxs = [0, Math.floor(setupResult.r.nFrames / 2), setupResult.r.nFrames - 1].slice(0, N_TEST_FRAMES);
  for (const i of testIdxs) {
    const t0 = Date.now();
    const r = await p.evaluate(async (idx) => {
      try { return { ok: true, r: await window.__giFullBakeFrame(idx) }; }
      catch (e) { return { ok: false, error: String(e && e.stack || e) }; }
    }, i);
    console.log('§FULL_OVERLAY_FRAME i=' + i + ' ms=' + (Date.now() - t0) + ' ' + JSON.stringify(r));
  }
  console.log('§FULL_OVERLAY_FRAMES_SAVED ' + framesSaved);
  console.log(logs.filter(l => /GI_WEBGPU_TAP|FULLBAKE|error|ERROR|warn/i.test(l)).slice(0, 80).join('\n'));
  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (e2) {} process.exit(1); });
