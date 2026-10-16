// FULL RENDER — the real HHS saved cinema path (61.04s, 4 bands, cinema_path table) through the
// WebGPU SSGI/GTAO/TRAA pipeline, with the film's own 2D overlays composited by the real
// window.APP functions. 15 fps because that is the bake's own rate (cinema_maxq.js:481
// MAXQ_FPS = 15), not the 24 used elsewhere in the app.
// Usage: node run_realpath_overlay_full.js [--frames N] [--w 1920] [--h 1080] [--fps 15] [--out DIR]
//   --frames N renders only the first N frames (smoke test); omit for the whole path.
// Reads nothing from viewer/*; touches no shipped file. Frames POST to this driver's own server.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path'), http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const W = +opt('--w', 1920), H = +opt('--h', 1080), FPS = +opt('--fps', 15);
const LIMIT = opt('--frames') ? +opt('--frames') : null;
const OUT = opt('--out', path.join(__dirname, 'out', LIMIT ? 'frames_realpath_smoke' : 'frames_realpath_overlay'));
const DB_FILE = '/buildings/HHS_Office_Federated_silent.db';
const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_BUILDINGS = '/home/red1/bim-ootb/buildings';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json' };
const PORT = 8860 + Math.floor(Math.random() * 40);
fs.mkdirSync(OUT, { recursive: true });
let framesSaved = 0, bytesSaved = 0;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__saveFrame/')) {
    const idx = req.url.slice('/__saveFrame/'.length); const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => { const b = Buffer.concat(chunks); fs.writeFileSync(path.join(OUT, `frame_${idx}.png`), b); framesSaved++; bytesSaved += b.length; res.writeHead(200); res.end(); });
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
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000,
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--enable-unsafe-webgpu',
           '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=1300,900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.evaluateOnNewDocument((cfg) => { window.__GI_TAP_CONFIG = cfg; }, { w: W, h: H, port: PORT, dbFile: DB_FILE });
  await p.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname, 'gi_webgpu_tap.js'), 'utf8'));
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=${DB_FILE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  for (const bb of await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]))) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  let status = null;
  for (let i = 0; i < 180; i++) {
    status = await p.evaluate(() => window.__giWebgpuTapStatus || null);
    if (status && (status.phase === 'ready' || /failed|blocked|timeout/i.test(status.phase))) break;
    await sleep(1000);
  }
  console.log('§RP_TAP_STATUS ' + JSON.stringify(status));
  if (!status || status.phase !== 'ready') { console.log(logs.filter(l => /GI_WEBGPU_TAP|error/i.test(l)).slice(0, 40).join('\n')); await b.close(); server.close(); process.exit(1); }
  const setup = await p.evaluate(async (fps) => { try { return { ok: true, r: await window.__giFullBakeSetup(fps) }; } catch (e) { return { ok: false, error: String(e && e.stack || e) }; } }, FPS);
  console.log('§RP_SETUP ' + JSON.stringify(setup));
  if (!setup.ok || !setup.r) { console.log(logs.filter(l => /FULLBAKE|GI_WEBGPU_TAP|error/i.test(l)).slice(0, 60).join('\n')); await b.close(); server.close(); process.exit(2); }
  const nAll = setup.r.nFrames, n = LIMIT ? Math.min(LIMIT, nAll) : nAll;
  console.log(`§RP_PLAN totalPathSec=${setup.r.total.toFixed(4)} fps=${FPS} nFramesFullPath=${nAll} rendering=${n} res=${W}x${H} out=${OUT}`);
  // WARM-UP (red1-84): the smoke run measured frame 0 at stdev 18.1 against 44.1 for frames 1-2 —
  // flat, because SSGI/TRAA have no temporal history on the very first render. Render the opening
  // pose a few times WITHOUT saving so the saved frame 0 matches its neighbours.
  const _wu0 = Date.now();
  await p.evaluate(async () => { for (let k = 0; k < 12; k++) await window.__giWebgpuRenderFrame(); });
  console.log('§RP_WARMUP renders=12 ms=' + (Date.now() - _wu0));
  const t0 = Date.now(); let failed = 0;
  for (let i = 0; i < n; i++) {
    const r = await p.evaluate(async (idx) => { try { return { ok: true, r: await window.__giFullBakeFrame(idx) }; } catch (e) { return { ok: false, error: String(e && e.stack || e) }; } }, i);
    if (!r.ok) { failed++; if (failed <= 3) console.log('§RP_FRAME_ERR i=' + i + ' ' + r.error.split('\n')[0]); }
    if (i % 50 === 0 || i === n - 1) {
      const el = (Date.now() - t0) / 1000;
      console.log(`§RP_PROGRESS i=${i}/${n} saved=${framesSaved} elapsed=${el.toFixed(0)}s perFrame=${(el / (i + 1) * 1000).toFixed(0)}ms eta=${((el / (i + 1)) * (n - i - 1)).toFixed(0)}s`);
    }
  }
  const stats = await p.evaluate(() => ({ stats: window.__giOverlayStats, errors: window.__giOverlayErrors }));
  console.log('§RP_OVERLAY_STATS ' + JSON.stringify(stats.stats));
  console.log('§RP_OVERLAY_ERRORS ' + JSON.stringify(stats.errors));
  console.log(`§RP_DONE frames=${n} saved=${framesSaved} failed=${failed} MB=${(bytesSaved / 1048576).toFixed(0)} totalSec=${((Date.now() - t0) / 1000).toFixed(0)}`);
  const bad = logs.filter(l => /PAGEERROR|OVERLAY_ERR|FULLBAKE_SETUP_FAILED|Uncaught|\berror\b/i.test(l));
  console.log('§RP_PAGE_ERRORS count=' + bad.length + (bad.length ? '\n' + bad.slice(0, 30).join('\n') : ''));
  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (e2) {} process.exit(1); });
