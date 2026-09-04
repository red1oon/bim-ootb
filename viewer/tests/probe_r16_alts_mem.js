#!/usr/bin/env node
// ⚠ DO NOT REMOVE — PROBE §R16_ALTS_MEM (2026-09-04, bim-compiler prompts/CPE_4D_PERF_MEM_STUDY.md §R16)
// Scope: what ONE Alt+S still-refine costs in memory, and whether it gives it back.
// USER (2026-09-04): "alt-s perf, seems to hog memory. Of course it is doing alot of good imagery,
// surface treatment and some 10 sec lag is needed. But let's see if we can find room to improve."
// §R12_HOSPITAL_MEM measured the LOAD baseline (1,546-1,577 MB). The press DELTA was never measured.
// Read the log after every run — the exit code is not evidence.
//
// CLAIMS UNDER TEST (each can come back NO, and the probe says which):
//   C1 a completed Alt+S returns the tab to its pre-press JS heap    (retainedMB at +30 s idle)
//   C2 a second press costs no more than the first                   (press-2 delta vs press-1)
//   C3 every render target the press allocates is disposed           (rtLive back to its pre-press count)
// Instrument: page-side monkey-patch on THREE.WebGLRenderTarget's constructor + dispose (repo
// untouched — the §MEM_PROBE idiom), plus performance.memory and renderer.info.memory.
// VACUOUS GUARD: if §STILL_REFINE never reports done, the run prints INCONCLUSIVE, not a number.
// Env: ROOT · BLD (default Hospital_meta — the split pair §R12 used) · BLD_DIR · GPU · PORT · LOG · IDLE_MS
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Hospital';   // the viewer appends _meta/_geo itself — passing 'Hospital_meta' asks for Hospital_meta_meta.db and silently loads an EMPTY scene
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8590);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const IDLE_MS = +(process.env.IDLE_MS || 30000);
const LOG = process.env.LOG || '/tmp/probe_r16_alts_mem.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
const t0 = Date.now();
function ts() { return new Date().toISOString().slice(11, 23) + ' +' + ((Date.now() - t0) / 1000).toFixed(1).padStart(7) + 's'; }
function log(l) { const s = ts() + ' ' + l; logStream.write(s + '\n'); console.log(s); }
function logRaw(l) { logStream.write(ts() + ' ' + l + '\n'); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

// installed at document start: count every WebGLRenderTarget ever made, and every one disposed
function rtTap() {
  window.__rt = { seen: new Map(), bySize: {}, calls: 0 };
  // §R16 instrument note: patching THREE.WebGLRenderTarget on the GLOBAL catches nothing — the
  // post-processing stack is an ESM and its `new WebGLRenderTarget` binds inside the module, not to
  // window.THREE (measured: rtMade=0 on the first run). setRenderTarget is the choke point every
  // target must pass through to be drawn into, whoever built it.
  const hook = () => {
    const T = window.THREE; if (!T || !T.WebGLRenderer || T.WebGLRenderer.__rtTapped) return false;
    const proto = T.WebGLRenderer.prototype, orig = proto.setRenderTarget;
    proto.setRenderTarget = function (rt) {
      const R = window.__rt; R.calls++;
      if (rt && !R.seen.has(rt)) {
        const c = (rt.textures && rt.textures.length) || 1;
        const ty = rt.texture && rt.texture.type;
        const bpp = ty === T.FloatType ? 16 : ty === T.HalfFloatType ? 8 : 4;
        const bytes = (rt.width | 0) * (rt.height | 0) * bpp * c * ((rt.samples | 0) > 1 ? 2 : 1);
        R.seen.set(rt, { bytes, w: rt.width, h: rt.height, c, bpp, samples: rt.samples | 0, depth: !!rt.depthBuffer, first: R.calls });
        const k = rt.width + 'x' + rt.height + (c > 1 ? 'x' + c : '') + (bpp !== 4 ? '@' + bpp : '');
        R.bySize[k] = (R.bySize[k] || 0) + 1;
      }
      return orig.apply(this, arguments);
    };
    T.WebGLRenderer.__rtTapped = true; return true;
  };
  if (!hook()) { const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 50); setTimeout(() => clearInterval(iv), 120000); }
}

function sampler() {
  window.__snap = function (tag) {
    const A = window.APP, R = window.__rt, m = performance.memory || {};
    const ri = (A.renderer && A.renderer.info) || { memory: {}, programs: [] };
    let live = 0, bytes = 0;
    R.seen.forEach(v => { live++; bytes += v.bytes; });
    return { tag, heapMB: +((m.usedJSHeapSize || 0) / 1048576).toFixed(1),
      heapTotalMB: +((m.totalJSHeapSize || 0) / 1048576).toFixed(1),
      geometries: ri.memory.geometries || 0, textures: ri.memory.textures || 0,
      programs: (ri.programs && ri.programs.length) || 0,
      streamed: A.streamedCount || 0,
      rtSeen: live, rtMB: +(bytes / 1048576).toFixed(1), rtCalls: R.calls };
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'r16-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§R16_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} idleMs=${IDLE_MS} log=${LOG}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 20 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv),
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840', '--js-flags=--expose-gc'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const marks = { stillDone: 0, aoDone: 0, restarts: 0, lines: [] };
  page.on('console', m => { const t = m.text(); logRaw('[con] ' + t);
    if (/§STILL_REFINE done/.test(t)) { marks.stillDone++; marks.lines.push(t); }
    if (/§PHOTO_AO done/.test(t)) { marks.aoDone++; marks.lines.push(t); }
    if (/§STILL_REFINE_RESTART/.test(t)) marks.restarts++; });
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  const snaps = [];
  try {
    await page.evaluateOnNewDocument(rtTap);
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§R16_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer, { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    await page.evaluate(sampler);
    // let prewarm (§R11) finish so press 1 is not measuring one-time smoothing work
    await new Promise(r => setTimeout(r, 20000));
    const take = async (tag) => { const s = await page.evaluate(t => window.__snap(t), tag); snaps.push(s);
      log(`§R16_SNAP ${tag} heapMB=${s.heapMB} streamed=${s.streamed} geometries=${s.geometries} textures=${s.textures} programs=${s.programs} rtSeen=${s.rtSeen} rtMB=${s.rtMB} setRenderTargetCalls=${s.rtCalls}`); return s; };
    const s0probe = await take('S0_pre_press');
    if (!s0probe.streamed) { log('§R16_VERDICT INCONCLUSIVE reason=streamed=0 — the scene is EMPTY, nothing was judged (check BLD: the viewer appends _meta/_geo itself)'); throw new Error('vacuous'); }
    for (const pass of [1, 2]) {
      const want = marks.stillDone + 1, t = Date.now();
      const ok = await page.evaluate(() => { if (typeof window.APP.toggleStillRefine !== 'function') return false; window.APP.toggleStillRefine(); return true; });
      if (!ok) { log('§R16_VERDICT INCONCLUSIVE reason=no toggleStillRefine — nothing was judged'); break; }
      const deadline = Date.now() + 240000;
      while (marks.stillDone < want && Date.now() < deadline) await new Promise(r => setTimeout(r, 250));
      if (marks.stillDone < want) { log(`§R16_VERDICT INCONCLUSIVE reason=press${pass} never reported §STILL_REFINE done in 240s — nothing was judged`); break; }
      log(`§R16_PRESS ${pass} stillDoneAfterMs=${Date.now() - t} restarts=${marks.restarts} last="${marks.lines[marks.lines.length - 1]}"`);
      await take(`S${pass}a_still_done`);
      const aoWant = marks.aoDone + 1, aoDeadline = Date.now() + 60000;
      while (marks.aoDone < aoWant && Date.now() < aoDeadline) await new Promise(r => setTimeout(r, 250));
      await take(marks.aoDone >= aoWant ? `S${pass}b_ao_done` : `S${pass}b_ao_absent`);
      // toggle back off — the teardown path — then idle and re-sample
      await page.evaluate(() => { try { window.APP.toggleStillRefine(); } catch (e) {} });
      await new Promise(r => setTimeout(r, IDLE_MS));
      await page.evaluate(() => { try { if (typeof window.gc === 'function') window.gc(); } catch (e) {} });
      await new Promise(r => setTimeout(r, 2000));
      await take(`S${pass}c_after_idle${Math.round(IDLE_MS / 1000)}s`);
    }
    const g = t => snaps.find(s => s.tag.startsWith(t));
    const s0 = g('S0'), p1 = g('S1c'), p2 = g('S2c'), a1 = g('S1a'), a2 = g('S2a');
    if (s0 && p1) log(`§R16_C1 retainedAfterPress1MB=${(p1.heapMB - s0.heapMB).toFixed(1)} rtSeenDelta=${p1.rtSeen - s0.rtSeen} rtMBDelta=${(p1.rtMB - s0.rtMB).toFixed(1)} texturesDelta=${p1.textures - s0.textures} programsDelta=${p1.programs - s0.programs}`);
    if (p1 && p2) log(`§R16_C2 retainedAfterPress2MB=${(p2.heapMB - s0.heapMB).toFixed(1)} press2ExtraMB=${(p2.heapMB - p1.heapMB).toFixed(1)} rtSeenPress2=${p2.rtSeen - p1.rtSeen} texturesPress2=${p2.textures - p1.textures}`);
    if (a1 && s0) log(`§R16_PEAK press1PeakDeltaMB=${(a1.heapMB - s0.heapMB).toFixed(1)} rtMBAtPeak=${a1.rtMB} rtSeenAtPeak=${a1.rtSeen} texturesAtPeak=${a1.textures}`);
    if (a2 && a1) log(`§R16_PEAK2 press2PeakDeltaMB=${(a2.heapMB - a1.heapMB).toFixed(1)}`);
    const last = snaps[snaps.length - 1];
    if (last) { const bySize = await page.evaluate(() => window.__rt.bySize);
      log('§R16_RT_BYSIZE ' + Object.entries(bySize).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + '=' + v).join(' ')); }
  } catch (e) { log('§R16_ERROR ' + (e && e.stack || e)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  fs.writeFileSync(LOG.replace(/\.log$/, '') + '.json', JSON.stringify({ snaps, marks: marks.lines }, null, 1));
  log(`§R16_DONE snaps=${snaps.length} json=${LOG.replace(/\.log$/, '')}.json`);
  logStream.end();
})();
