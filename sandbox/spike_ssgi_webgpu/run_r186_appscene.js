// STEP 3, second attempt — the FIRST one answered the question, negatively and precisely:
// with the app on r185 and the pipeline on r186, both renders died on
//   "object.intersectsFrustum is not a function"
// r186's renderer calls that method on every object; r185's BatchedMesh/InstancedMesh do not have
// it. So a cross-version render is out, and ONE three.js version is required — exactly the library
// swap that was deferred.
//
// This tests the swap WITHOUT changing a single file on disk: the driver's own HTTP server serves
// the r186 build in place of /viewer/lib/three.webgpu.min.js and three.core.min.js for this session
// only (the import specifier is rewritten in memory). The repo is untouched; kill the process and
// nothing remains. If the app boots and streams under r186, the swap is viable and the app's real
// scene becomes renderable by the GI pipeline.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path'), http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DB_FILE = '/buildings/HHS_Office_Federated_silent.db';
const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_BUILDINGS = '/home/red1/bim-ootb/buildings';
const R186 = path.join(__dirname, 'vendor', 'r186');
const OVERRIDE = {
  '/viewer/lib/three.core.min.js': fs.readFileSync(path.join(R186, 'three.core.js'), 'utf8'),
  '/viewer/lib/three.webgpu.min.js': fs.readFileSync(path.join(R186, 'three.webgpu.js'), 'utf8')
    .split("from './three.core.js'").join("from './three.core.min.js'"),
  '/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.direct.js':
    rebind(path.join(R186, 'three.tsl.direct.js'), [["from './three.webgpu.js'", "from '/viewer/lib/three.webgpu.min.js'"]]),
  '/sandbox/spike_ssgi_webgpu/vendor/SSGINode.direct.js':
    rebind(path.join(__dirname, 'vendor', 'SSGINode.direct.js'),
           [["from './r186/three.webgpu.js'", "from '/viewer/lib/three.webgpu.min.js'"],
            ["from './r186/three.tsl.direct.js'", "from '/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.direct.js'"]]),
};
// ONE MODULE INSTANCE. The bisect found the cause: the app's lights are not `instanceof` this
// module's THREE.Light, because the probe imported its own copy of three.js from vendor/r186/ —
// a SECOND module instance. three.js identifies lights by class, so the renderer ignored all three
// of the app's lights and shaded everything black (own lights: 479,280 lit pixels; app's lights: 0).
// Fix without touching disk: serve the TSL/SSGI node modules with their imports rebound to the very
// URL the app itself loaded, /viewer/lib/three.webgpu.min.js (which this server already answers with
// r186). Then app, probe and nodes share one instance and the app's own lights are seen.
const APP_THREE_URL = '/viewer/lib/three.webgpu.min.js';
const TSL_URL = '/sandbox/spike_ssgi_webgpu/vendor/r186/three.tsl.direct.js';
function rebind(file, pairs) {
  let t = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) t = t.split(from).join(to);
  return t;
}
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json' };
const PORT = 8890 + Math.floor(Math.random() * 20);
let served = 0;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (OVERRIDE[u]) {
    served++;
    const body = OVERRIDE[u];
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
    res.end(body); return;
  }
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
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--enable-unsafe-webgpu', '--enable-features=Vulkan',
           '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=1300,900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname, 'gi_appscene_probe.js'), 'utf8'));
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=${DB_FILE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let booted = true;
  try { await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 }); }
  catch (e) { booted = false; }
  console.log('§R186_BOOT booted=' + booted + ' overridesServed=' + served);
  console.log('§R186_REVISION ' + JSON.stringify(await p.evaluate(() => ({ appThree: (window.THREE && window.THREE.REVISION) || null, hasWebGPURenderer: !!(window.THREE && window.THREE.WebGPURenderer) })).catch(() => null)));
  if (!booted) {
    console.log('§R186_BOOT_FAIL_LOGS\n' + logs.filter(l => /error|fail|Uncaught|PAGEERROR/i.test(l)).slice(0, 25).join('\n'));
    await b.close(); server.close(); process.exit(2);
  }
  await sleep(12000);
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) { console.log('§R186_DB_WAIT_TIMEOUT'); }
  for (const bb of await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]))) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) { console.log('§STREAM_FAIL ' + e.message); } }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  await p.evaluate(() => { try { const a = window.APP; a.cinemaPathPlan(60); const st = a._getCinemaPathEdit(); const pl = a.cinemaPathPlan(st._total, st); const q = pl.poseAt(10 / st._total); a.camera.position.set(q.x, q.y, q.z); a.controls.target.set(q.tx, q.ty, q.tz); a.controls.update(); } catch (e) { console.log('§POSE_FAIL ' + e.message); } });
  const inv = await p.evaluate(() => { let m=0,b2=0,i2=0,l=0,em=0; window.APP.scene.traverse(o=>{ if(o.isBatchedMesh)b2++; else if(o.isInstancedMesh)i2++; else if(o.isMesh)m++; if(o.isLight)l++; const mm=o.material; if(mm&&!Array.isArray(mm)&&mm.emissive&&(mm.emissive.r+mm.emissive.g+mm.emissive.b>0.01))em++; }); return {m,b2,i2,l,em}; });
  console.log('§R186_SCENE ' + JSON.stringify(inv));
  await p.evaluate(() => { window.__giProbeGo = true; });
  let r = null;
  for (let i = 0; i < 240; i++) { r = await p.evaluate(() => window.__giAppSceneProbe || null); if (r && (r.phase === 'done' || /fail|timeout|blocked/i.test(r.phase))) break; await sleep(1000); }
  console.log('§R186_APPSCENE_REPORT ' + JSON.stringify(r, null, 1));
  // CONTROL: what does the APP'S OWN renderer show at this same pose? If its canvas is black too,
  // the pose is wrong and the GI pipeline is exonerated. Saved as a PNG next to the log.
  try {
    const shot = await p.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(__dirname, 'out', 'r186_appview_control.png'), Buffer.from(shot, 'base64'));
    const st = await p.evaluate(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height } : null; });
    console.log('§R186_CONTROL_SHOT saved out/r186_appview_control.png canvas=' + JSON.stringify(st));
  } catch (e) { console.log('§R186_CONTROL_SHOT_FAIL ' + e.message); }
  console.log(logs.filter(l => /GI_APPSCENE|PAGEERROR|POSE_FAIL|STREAM_FAIL|§UPGRADE_THREE/i.test(l)).slice(0, 40).join('\n'));
  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (e2) {} process.exit(1); });
