#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §VERT_WELD_LOAD (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MEM_GROWTH M4-A). Read the log after every run.
// ISSUE PROVEN/DISPROVEN: does a welded civil DB load with less heap / less time / fewer scene vertices than the original?
// Loads each DB in a FRESH browser (alternating, N rounds), measures: ms navigation->ready, JS heap after gc, GPU/scene vertex count, median frame ms.
// Verdict prints numbers + INCONCLUSIVE if the scene vertex counts do not differ (nothing welded) — never PASS on a vacuous run.
// Env: A=<orig name> B=<welded name> BLD_DIR ROUNDS GPU=real PORT LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(path.join(__dirname, '..', '..'));
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const DIRS = process.env.WELD_DIR ? [process.env.ORIG_DIR || '/home/red1/bim-ootb/buildings', process.env.WELD_DIR] : null;
const NAMES = DIRS ? [process.env.NAME + '|orig', process.env.NAME + '|weld'] : [process.env.A || 'CivilWorksPath', process.env.B || 'CivilWorksPath.welded'], ROUNDS = +(process.env.ROUNDS || 2);
const PORT = +(process.env.PORT || 8597), LOG = process.env.LOG || '/tmp/witness_vertex_weld_load.log', REAL = process.env.GPU === 'real';
const out = []; const log = l => { out.push(l); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
let useIdx = 0;
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (DIRS && u.startsWith('/buildings/')) { for (const d of [DIRS[useIdx], DIRS[0]]) { const c = path.join(d, u.slice(11)); if (fs.existsSync(c) && fs.statSync(c).isFile()) { fp = c; break; } } }
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice(11));
  if (!fs.existsSync(fp)) { const alt = path.join('/home/red1/bim-ootb', u); if (fs.existsSync(alt)) fp = alt; else { res.writeHead(404); res.end(); return; } }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function one(name0) {
  const name = name0.split('|')[0]; if (DIRS) useIdx = name0.endsWith('|weld') ? 1 : 0;
  const b = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wvw-')), protocolTimeout: 1800000,
    env: Object.assign({}, process.env, REAL ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {}),
    args: ['--no-sandbox', '--js-flags=--max-old-space-size=8192 --expose-gc'].concat(REAL ? ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']) });
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
    const t0 = Date.now();
    await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${encodeURIComponent(name)}.db`, { waitUntil: 'domcontentloaded', timeout: 900000 });
    let ok = false;
    for (let i = 0; i < 1200 && !ok; i++) { await sleep(500); try { ok = await p.evaluate(() => !!(window.APP && APP.db && APP.streaming === false && APP.scene && APP.collectMeshes(o => o.isMesh).length > 0)); } catch (e) {} }
    const loadMs = Date.now() - t0; if (!ok) return { name: name0, ok: false };
    await sleep(3000);
    const r = await p.evaluate(async () => {
      const G = () => { if (typeof window.gc === 'function') window.gc(); }; G(); G(); await new Promise(r => setTimeout(r, 500)); G();
      const seen = new Set(); let verts = 0, idx = 0;
      APP.scene.traverse(o => { if ((o.isMesh || o.isBatchedMesh) && o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); const pa = o.geometry.attributes.position; if (pa) verts += pa.count; if (o.geometry.index) idx += o.geometry.index.count; } });
      const ft = []; let last = performance.now();
      await new Promise(res => { let n = 0; (function f(t) { ft.push(t - last); last = t; if (++n < 120) requestAnimationFrame(f); else res(); })(performance.now()); requestAnimationFrame(() => {}); });
      ft.sort((a, b) => a - b);
      return { heapMB: performance.memory.usedJSHeapSize / 1048576, verts, idx, frameMedMs: ft[ft.length >> 1], frameP95Ms: ft[Math.floor(ft.length * .95)] };
    });
    return Object.assign({ name: name0, ok: true, loadMs }, r);
  } finally { try { await b.close(); } catch (e) {} }
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  log('  [gpu] ' + (REAL ? 'real' : 'swiftshader') + ' rounds=' + ROUNDS + ' A=' + NAMES[0] + ' B=' + NAMES[1]);
  const R = { [NAMES[0]]: [], [NAMES[1]]: [] };
  for (let k = 0; k < ROUNDS; k++) for (const n of NAMES) {
    const r = await one(n); log('§VERT_WELD_LOAD run ' + JSON.stringify(r)); if (r.ok) R[n].push(r);
  }
  const med = (a, f) => { const v = a.map(f).sort((x, y) => x - y); return v[v.length >> 1]; };
  const S = n => ({ loadMs: med(R[n], r => r.loadMs), heapMB: med(R[n], r => r.heapMB), verts: R[n][0] && R[n][0].verts, frameMedMs: med(R[n], r => r.frameMedMs), frameP95Ms: med(R[n], r => r.frameP95Ms) });
  if (!R[NAMES[0]].length || !R[NAMES[1]].length) { log('§VERT_WELD_LOAD verdict=INCONCLUSIVE (a DB never became ready)'); fs.writeFileSync(LOG, out.join('\n') + '\n'); server.close(); process.exit(2); }
  const a = S(NAMES[0]), w = S(NAMES[1]); log('§VERT_WELD_LOAD median original ' + JSON.stringify(a)); log('§VERT_WELD_LOAD median welded   ' + JSON.stringify(w));
  const d = (x, y) => ((y - x) / x * 100).toFixed(1) + '%';
  log('§VERT_WELD_LOAD delta loadMs ' + d(a.loadMs, w.loadMs) + ' heapMB ' + d(a.heapMB, w.heapMB) + ' sceneVerts ' + d(a.verts, w.verts) + ' frameMed ' + d(a.frameMedMs, w.frameMedMs));
  log(a.verts === w.verts ? '§VERT_WELD_LOAD verdict=INCONCLUSIVE (scene vertex count identical — nothing welded)' : '§VERT_WELD_LOAD verdict=MEASURED (numbers above; pass bar is the user\'s)');
  fs.writeFileSync(LOG, out.join('\n') + '\n'); server.close(); process.exit(0);
})();
