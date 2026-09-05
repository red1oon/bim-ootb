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
//
// ── §R17_STAGING_CYCLE_LEAK (2026-09-05, bim-compiler CPE_4D_PERF_MEM_STUDY.md §R17) ────────────
// §R16 measured TWO presses and reported "+23 textures / +49 programs retained". Its OWN C2
// (`texturesPress2=0`) says that set does not grow on the second press — so on §R16's evidence it is
// a one-time CACHE, not a per-press leak, and disposing it would make every press pay press-1 cost
// (`_ensureStillAO` latches N8AO on purpose; `_stopStillAOPhase` deliberately only disables).
// The deciding question is therefore whether the retained set GROWS WITHOUT BOUND over MANY cycles.
//   §R17 C1  per-cycle slope of textures / geometries / programs over N >= 8 cycles  (NO-OP if 0)
//   §R17 C2  every texture allocated after the baseline, attributed to its ALLOCATION STACK
//   §R17 C3  render-target BYTES actually measured — §R16 instrument-limit 2 left this at rtSeen=0
// Instrument deltas, all on the LIVE APP.renderer instance because §R16 established that TWO three
// builds coexist (classes r185, renderer r184) so any patch on a CLASS patches the wrong object:
//   - renderer.info.memory.textures redefined as a getter/setter — three.js `++`s it on upload and
//     `--`s it in onTextureDispose, so this catches every alloc (with stack) and every free.
//   - renderer.setRenderTarget patched as an OWN property (the fix §R16 limit 2 already named).
//   - forced GC via CDP HeapProfiler.collectGarbage, not window.gc (§R12: headless-new exposes no
//     callable window.gc, AND the viewer defines a non-function window.gc via a DOM id collision).
// GPU counts need no GC — three.js only decrements them on an explicit dispose() — so the C1 slopes
// are deterministic; GC only cleans the heap column.
// Env: ROOT · BLD (default Hospital — the viewer appends _meta/_geo) · BLD_DIR · GPU · PORT · LOG
//      · IDLE_MS · PRESSES (default 2 = the original §R16 run; 8 = the §R17 cycle arm)
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
const PRESSES = +(process.env.PRESSES || 2);   // §R17 C1: 2 reproduces §R16 exactly; >=8 is the cycle arm
const RENDER_SKIP = process.env.RENDER_SKIP === '1';   // §PROBE_RENDER_SKIP — needed on the software rasteriser
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
  window.__rt = { seen: new Map(), bySize: {}, calls: 0, where: 'none', freed: 0, freedBytes: 0 };
  // §R16 instrument note: patching THREE.WebGLRenderTarget on the GLOBAL catches nothing — the
  // post-processing stack is an ESM and its `new WebGLRenderTarget` binds inside the module, not to
  // window.THREE (measured: rtMade=0 on the first run). setRenderTarget is the choke point every
  // target must pass through to be drawn into, whoever built it.
  // §R17 C3 FIX: the PROTOTYPE patch also caught nothing, because two three builds coexist —
  // window.THREE is r185 but APP.renderer is an r184 WebGLRenderer, so the prototype patched is not
  // the class in use. Patch the LIVE INSTANCE as an own property; it cannot miss for that reason.
  const tapRt = (target, label) => {
    if (!target || target.__rtTapped) return false;
    const T = window.THREE, orig = target.setRenderTarget;
    if (typeof orig !== 'function') return false;
    target.setRenderTarget = function (rt) {
      const R = window.__rt; R.calls++;
      if (rt && !R.seen.has(rt)) {
        const c = (rt.textures && rt.textures.length) || 1;
        const ty = rt.texture && rt.texture.type;
        const bpp = (T && ty === T.FloatType) ? 16 : (T && ty === T.HalfFloatType) ? 8 : 4;
        const bytes = (rt.width | 0) * (rt.height | 0) * bpp * c * ((rt.samples | 0) > 1 ? 2 : 1);
        const rec = { bytes, w: rt.width, h: rt.height, c, bpp, samples: rt.samples | 0, depth: !!rt.depthBuffer, first: R.calls, live: true };
        R.seen.set(rt, rec);
        // §R17 LIVENESS: R.seen is monotonic by construction, so a FLAT rtSeen proves only that no
        // NEW target appeared — it can NEVER prove one was released. WebGLRenderTarget is an
        // EventDispatcher that fires 'dispose' from both dispose() and setSize() (three.js's
        // setSize disposes when the dimensions actually change), so this is the release signal.
        try { rt.addEventListener('dispose', function () { rec.live = false; R.freedBytes += rec.bytes; R.freed++; }); } catch (e) {}
        const k = rt.width + 'x' + rt.height + (c > 1 ? 'x' + c : '') + (bpp !== 4 ? '@' + bpp : '');
        R.bySize[k] = (R.bySize[k] || 0) + 1;
      }
      return orig.apply(this, arguments);
    };
    target.__rtTapped = true; window.__rt.where = label; return true;
  };
  // §R17 C2: renderer.info.memory.textures is a plain number three.js `++`s on upload and `--`s in
  // onTextureDispose. Redefining it on the LIVE info.memory object records every allocation with the
  // stack that made it — the attribution §R16 could only count.
  window.__tex = { alloc: {}, allocs: 0, frees: 0, base: 0, tapped: false, reset: null };
  const tapTex = (renderer) => {
    const info = renderer && renderer.info;
    if (!info || !info.memory || info.__memTapped) return false;
    const mem = info.memory; let _t = mem.textures | 0, _g = mem.geometries | 0;
    const R = window.__tex; R.base = _t;
    const site = () => {
      const raw = (new Error().stack || '').split('\n');
      // drop this arrow + the setter frame; keep the first 4 real frames, trimmed of the origin
      return raw.slice(3, 9).map(s => s.trim().replace(/https?:\/\/[^/]+/g, '').replace(/^at\s+/, '')).join(' <- ') || '(no stack)';
    };
    Object.defineProperty(mem, 'textures', {
      configurable: true,
      get() { return _t; },
      set(v) { if (v > _t) { R.allocs++; const k = site(); R.alloc[k] = (R.alloc[k] || 0) + 1; } else if (v < _t) R.frees++; _t = v; }
    });
    Object.defineProperty(mem, 'geometries', { configurable: true, get() { return _g; }, set(v) { _g = v; } });
    R.tapped = true;
    R.reset = function () { R.alloc = {}; R.allocs = 0; R.frees = 0; R.base = _t; };
    window.__texReset = R.reset;
    info.__memTapped = true; return true;
  };
  // INSTANCE ONLY, deliberately. The prototype patch is the one §R16 proved catches nothing, and
  // running both would double-count R.calls once the instance appears.
  const hook = () => {
    const A = window.APP;
    if (A && A.renderer) { tapRt(A.renderer, 'instance'); tapTex(A.renderer); }
    return !!(A && A.renderer && A.renderer.__rtTapped && window.__tex.tapped);
  };
  if (!hook()) { const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 50); setTimeout(() => clearInterval(iv), 900000); }
}

function sampler() {
  window.__snap = function (tag) {
    const A = window.APP, R = window.__rt, m = performance.memory || {};
    const ri = (A.renderer && A.renderer.info) || { memory: {}, programs: [] };
    let live = 0, bytes = 0, alive = 0, aliveBytes = 0;
    R.seen.forEach(v => { live++; bytes += v.bytes; if (v.live) { alive++; aliveBytes += v.bytes; } });
    // §R17 — the sun shadow map is read DIRECTLY off the light, not inferred: three.js allocates it
    // once at whatever shadow.mapSize was current on the first shadow render and NEVER reallocates
    // on a mapSize change (the only reallocation trigger in WebGLShadowMap is a shadow TYPE change),
    // so mapSize and the map's real dimensions can disagree — and that disagreement is the defect.
    const sun = A && A.sun, sh = sun && sun.shadow;
    const shadow = { mapSizeW: sh ? sh.mapSize.width : -1, mapW: (sh && sh.map) ? sh.map.width : 0,
      mapH: (sh && sh.map) ? sh.map.height : 0, casts: !!(sun && sun.castShadow),
      mapMB: (sh && sh.map) ? +((sh.map.width * sh.map.height * 4 * ((sh.map.depthTexture) ? 2 : 1)) / 1048576).toFixed(1) : 0 };
    // §R17 C2 — renderer.info.programs is the LIVE enumerable cache; each entry carries .name and
    // .usedTimes, so a retained program can be NAMED, not just counted.
    const progs = {};
    (ri.programs || []).forEach(p => { const n = (p && p.name) || '(unnamed)'; progs[n] = (progs[n] || 0) + 1; });
    const TX = window.__tex || {};
    return { tag, heapMB: +((m.usedJSHeapSize || 0) / 1048576).toFixed(1),
      heapTotalMB: +((m.totalJSHeapSize || 0) / 1048576).toFixed(1),
      geometries: ri.memory.geometries || 0, textures: ri.memory.textures || 0,
      programs: (ri.programs && ri.programs.length) || 0, progs,
      streamed: A.streamedCount || 0,
      texTapped: !!TX.tapped, texAllocs: TX.allocs || 0, texFrees: TX.frees || 0,
      rtWhere: R.where, rtSeen: live, rtMB: +(bytes / 1048576).toFixed(1), rtCalls: R.calls,
      rtLive: alive, rtLiveMB: +(aliveBytes / 1048576).toFixed(1), rtFreed: R.freed, rtFreedMB: +(R.freedBytes / 1048576).toFixed(1),
      shadow };
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
  const cdp = await page.target().createCDPSession();
  try { await cdp.send('HeapProfiler.enable'); } catch (e) { logRaw('[gc] enable failed ' + e.message); }
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
    if (RENDER_SKIP) {
      // §PROBE_RENDER_SKIP (§R12's own trick, repo untouched): the software rasteriser renders every
      // frame while APP.streaming and starves streamTick, projecting a load to HOURS. No-op the
      // render DURING STREAMING ONLY, then hand it straight back. GPU-side memory counters are
      // render-independent — three.js increments info.memory.textures on upload whatever the backend
      // is — so this changes how long the LOAD takes, not what §R17 C1 measures.
      const inst = await page.evaluate(() => { const A = window.APP; if (!A || !A.renderer || A.renderer.__renderSkipOn) return false;
        const orig = A.renderer.render.bind(A.renderer); let n = 0;
        A.renderer.render = function () { if (A.streaming) { n++; return; } return orig.apply(this, arguments); };
        A.renderer.__renderSkipOn = true;
        A.renderer.__renderSkipOff = function () { A.renderer.render = orig; A.renderer.__renderSkipOn = false; return n; }; return true; });
      log('§PROBE_RENDER_SKIP installed=' + inst);
    }
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    if (RENDER_SKIP) {
      const skipped = await page.evaluate(() => { try { return window.APP.renderer.__renderSkipOff(); } catch (e) { return -1; } });
      log('§PROBE_RENDER_SKIP released framesSkippedDuringStreaming=' + skipped + ' — real frames run from here');
      await new Promise(r => setTimeout(r, 30000));   // let real frames run before anything is sampled
    }
    await page.evaluate(sampler);
    // let prewarm (§R11) finish so press 1 is not measuring one-time smoothing work
    await new Promise(r => setTimeout(r, 20000));
    const take = async (tag) => { const s = await page.evaluate(t => window.__snap(t), tag); snaps.push(s);
      log(`§R16_SNAP ${tag} heapMB=${s.heapMB} streamed=${s.streamed} geometries=${s.geometries} textures=${s.textures} programs=${s.programs} rtSeen=${s.rtSeen} rtMB=${s.rtMB} rtLive=${s.rtLive} rtLiveMB=${s.rtLiveMB} rtFreedMB=${s.rtFreedMB} setRenderTargetCalls=${s.rtCalls} texAllocs=${s.texAllocs} texFrees=${s.texFrees}`);
      log(`§R17_SHADOWMAP ${tag} mapSize=${s.shadow.mapSizeW} realMap=${s.shadow.mapW}x${s.shadow.mapH} mapMB=${s.shadow.mapMB} castShadow=${s.shadow.casts}`); return s; };
    const s0probe = await take('S0_pre_press');
    if (!s0probe.streamed) { log('§R16_VERDICT INCONCLUSIVE reason=streamed=0 — the scene is EMPTY, nothing was judged (check BLD: the viewer appends _meta/_geo itself)'); throw new Error('vacuous'); }
    // §R17 instrument gates — a tap that caught nothing must SAY so, never let its zeros read as data
    log(`§R17_TAP texTapped=${s0probe.texTapped} rtTapWhere=${s0probe.rtWhere} rtSeenAtBaseline=${s0probe.rtSeen} baselineTextures=${s0probe.textures} baselinePrograms=${s0probe.programs}`);
    if (!s0probe.texTapped) log('§R17_C2 VACUOUS reason=texture tap never installed — allocation counts below mean NOTHING, do not read them as zero allocations');
    // reset the allocation ledger so it measures the PRESSES, not the load
    await page.evaluate(() => { try { if (typeof window.__texReset === 'function') window.__texReset(); } catch (e) {} });
    for (const pass of Array.from({ length: PRESSES }, (_, i) => i + 1)) {
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
      // §R17: CDP collectGarbage, not window.gc — §R12 recorded that headless-new exposes no callable
      // window.gc AND that the viewer defines a NON-FUNCTION window.gc (DOM id collision), so the old
      // line silently did nothing. GPU counts need no GC either way (three.js only decrements them on
      // an explicit dispose()), so the C1 slopes are unaffected by this; only the heap column is.
      try { await cdp.send('HeapProfiler.collectGarbage'); } catch (e) { logRaw('[gc] ' + e.message); }
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

    // ───────────── §R17 C1: does the retained set GROW across cycles, or is it a one-time cache?
    const rests = snaps.filter(s => /_after_idle/.test(s.tag));   // one per completed cycle, post-teardown+GC
    log('§R17_CYCLES n=' + rests.length + ' of PRESSES=' + PRESSES);
    rests.forEach((s, i) => log(`§R17_CYCLE i=${i + 1} textures=${s.textures} geometries=${s.geometries} programs=${s.programs} heapMB=${s.heapMB} rtSeen=${s.rtSeen} rtMB=${s.rtMB} texAllocsCum=${s.texAllocs} texFreesCum=${s.texFrees}`));
    if (rests.length < 3) {
      log(`§R17_C1 VACUOUS reason=only ${rests.length} completed cycle(s) — a slope needs >=3, nothing was judged`);
    } else {
      // least-squares slope per cycle over the post-teardown rest points
      const slope = (key) => { const n = rests.length; let sx = 0, sy = 0, sxy = 0, sxx = 0;
        rests.forEach((s, i) => { const x = i + 1, y = +s[key] || 0; sx += x; sy += y; sxy += x * y; sxx += x * x; });
        const d = n * sxx - sx * sx; return d === 0 ? 0 : (n * sxy - sx * sy) / d; };
      const tS = slope('textures'), pS = slope('programs'), gS = slope('geometries'), hS = slope('heapMB');
      const span = (key) => { const v = rests.map(s => +s[key] || 0); return (v[v.length - 1] - v[0]); };
      const THRESH = 0.5;   // >0.5 per cycle is growth no rounding can explain
      const compounding = tS > THRESH || pS > THRESH || gS > THRESH;
      log(`§R17_C1 texturesPerCycle=${tS.toFixed(3)} programsPerCycle=${pS.toFixed(3)} geometriesPerCycle=${gS.toFixed(3)} heapMBPerCycle=${hS.toFixed(2)}`);
      log(`§R17_C1_SPAN textures=${span('textures')} programs=${span('programs')} geometries=${span('geometries')} heapMB=${span('heapMB').toFixed(1)} overCycles=${rests.length}`);
      log(`§R17_C1 verdict=${compounding ? 'COMPOUNDING — the retained set grows per cycle, §R16 +23/+49 is a real leak' : 'NO-OP — slope is flat within ' + THRESH + '/cycle; the §R16 retained set is a ONE-TIME CACHE, not a compounding leak'}`);
    }
    // §R17 C2 — attribution of every texture allocated since the pre-press baseline
    const tex = await page.evaluate(() => ({ alloc: window.__tex.alloc, allocs: window.__tex.allocs, frees: window.__tex.frees, tapped: window.__tex.tapped }));
    if (!tex.tapped) log('§R17_C2 VACUOUS reason=tap never installed — no attribution is possible from this run');
    else if (!tex.allocs) log('§R17_C2 VACUOUS reason=allocs=0 with the tap live — either the presses allocated nothing, or the tap sits on the wrong object; do NOT read this as proof of zero allocation');
    else {
      log(`§R17_C2 texAllocsSincePrePress=${tex.allocs} texFreesSincePrePress=${tex.frees} netRetained=${tex.allocs - tex.frees} distinctSites=${Object.keys(tex.alloc).length}`);
      Object.entries(tex.alloc).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .forEach(([k, v], i) => log(`§R17_C2_SITE ${i + 1} n=${v} ${k}`));
    }
    // §R17 C2 — which compiled programs are retained, BY NAME, pre-press vs final
    const s0p = snaps[0] && snaps[0].progs, lp = last && last.progs;
    if (s0p && lp) {
      const keys = Array.from(new Set(Object.keys(s0p).concat(Object.keys(lp))));
      const diff = keys.map(k => [k, (lp[k] || 0) - (s0p[k] || 0)]).filter(e => e[1] !== 0).sort((a, b) => b[1] - a[1]);
      log('§R17_C2_PROGRAMS delta ' + (diff.length ? diff.map(([k, v]) => k + '=' + (v > 0 ? '+' : '') + v).join(' ') : 'none — the program cache ends where it started'));
      log('§R17_C2_PROGRAMS_FINAL ' + Object.entries(lp).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + '=' + v).join(' '));
    }
    // §R17 C3 — render-target bytes; §R16 left this at rtSeen=0 with the tap on the wrong object
    if (last) {
      if (!last.rtSeen) log(`§R17_C3 VACUOUS reason=rtSeen=0 with tapWhere=${last.rtWhere} — the render-target tap caught nothing; this is an INSTRUMENT failure, not "no render targets"`);
      else {
        const s0 = snaps[0];
        log(`§R17_C3 rtEverSeen=${last.rtSeen} rtEverMB=${last.rtMB} rtLive=${last.rtLive} rtLiveMB=${last.rtLiveMB} rtFreed=${last.rtFreed} rtFreedMB=${last.rtFreedMB} tapWhere=${last.rtWhere} setRenderTargetCalls=${last.rtCalls}`);
        log(`§R17_C3_PRESS_DELTA allocatedByPresses=${last.rtSeen - s0.rtSeen} allocatedMB=${(last.rtMB - s0.rtMB).toFixed(1)} stillLiveAfterTeardown=${last.rtLive - s0.rtLive} stillLiveMB=${(last.rtLiveMB - s0.rtLiveMB).toFixed(1)}`);
      }
    }
    // §R17 C4 — the sun shadow map. _applyPhotoStaging raises A.sun.shadow.mapSize 2048 -> 4096 for
    // the still. three.js reallocates a shadow map ONLY on a shadow TYPE change, so a mapSize written
    // back without disposing the map is a NO-OP on memory AND corrupts the render viewport. The two
    // things that must both be true after a real Alt+S exit: mapSize is back, and the 4096 map is gone.
    const peak = snaps.find(s => /1a_still_done/.test(s.tag)), rest1 = snaps.find(s => /1c_after_idle/.test(s.tag));
    if (!peak || !rest1) log('§R17_C4 VACUOUS reason=press 1 never produced both a still-done and a post-teardown sample — nothing was judged');
    else if (peak.shadow.mapW === 0) log('§R17_C4 VACUOUS reason=no shadow map was ever allocated on this run (castShadow off throughout) — the 4096 path never ran, so its release cannot be judged');
    else {
      const raised = peak.shadow.mapW >= 4096;
      const released = rest1.shadow.mapW === 0 || rest1.shadow.mapW < peak.shadow.mapW;
      const sizeBack = rest1.shadow.mapSizeW < peak.shadow.mapSizeW || rest1.shadow.mapSizeW <= 2048;
      log(`§R17_C4 stillPeak mapSize=${peak.shadow.mapSizeW} realMap=${peak.shadow.mapW}x${peak.shadow.mapH} mapMB=${peak.shadow.mapMB} | afterTeardown mapSize=${rest1.shadow.mapSizeW} realMap=${rest1.shadow.mapW}x${rest1.shadow.mapH} mapMB=${rest1.shadow.mapMB}`);
      log(`§R17_C4 raisedForStill=${raised} sizeRestored=${sizeBack} mapReleased=${released} freedMB=${(peak.shadow.mapMB - rest1.shadow.mapMB).toFixed(1)} verdict=${!raised ? 'VACUOUS — the still never raised the map, nothing to release' : (released && sizeBack) ? 'RELEASED' : 'RETAINED — the still-only 4096 map outlives the still'}`);
      if (sizeBack && !released) log('§R17_C4 WRONG — mapSize was written back but the map was NOT disposed. three.js keeps the old 4096 texture and renders into a mapSize-sized viewport inside it: this frees nothing AND breaks the shadow. Dispose+null the map in the same step.');
    }
  } catch (e) { log('§R16_ERROR ' + (e && e.stack || e)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  fs.writeFileSync(LOG.replace(/\.log$/, '') + '.json', JSON.stringify({ snaps, marks: marks.lines }, null, 1));
  log(`§R16_DONE snaps=${snaps.length} json=${LOG.replace(/\.log$/, '')}.json`);
  logStream.end();
})();
