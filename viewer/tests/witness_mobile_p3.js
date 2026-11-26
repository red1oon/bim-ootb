// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-MOBILE-P3 — bim-compiler prompts/MOBILE_PERF.md §P3 SPEC stages 1-3 (owner GO 2026-11-27 "Proceed").
// Issues this witness proves or disproves on the real (minified) viewer, phone emulation, CPU 4x (Lighthouse's mobile
// calibration: Moto G Power 2022), Duplex, on a REAL GPU backend (Intel iGPU via ANGLE gl-egl — software GL has no
// KHR_parallel_shader_compile, so the shader claim would be vacuous there and is reported INCONCLUSIVE):
//   K1 the page froze 1.1-3.7 s waiting for shader programs (P0 sandbox) → blocking shader calls total < 150 ms.
//   K2 that freeze was the longest main-thread task after §DB_LOADED → it is shorter than in the red run.
//   K3 silhouette refine cost ~0.3 s before the first phone frame → `§DUCT_SILHOUETTE_SKIP phone`.
//   K4 SheetJS (952 KB) fetched on every phone boot → no xlsx request at boot; XLSX defined after the Issues hook runs.
//   K5 the model is still drawn (triangles > 0).
//   Desktop control: xlsx fetched at boot, no skip line, no §SHADER_ASYNC.
//   RED control: ?shaderasync=0 → the shader wait returns (> 1 s) — K1 must go RED.
// MEASURE_ONLY=1 ROOT=<tree> prints the numbers for any tree (used for the before/after table) without verdicts.
// §-log first — READ viewer/tests/witness_mobile_p3.log after every run before any conclusion. Run under the GPU lock:
//   flock /tmp/claude-1000/gpu.lock node viewer/tests/witness_mobile_p3.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const MEASURE_ONLY = !!process.env.MEASURE_ONLY;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const URL_PATH = '/viewer/viewer.html?db=buildings/Duplex_extracted.db';
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };
const DESKTOP = { viewport: { width: 1400, height: 900 } };
// fresh browser per run + no shader disk cache: a second run would otherwise reuse the first run's compiled programs (measured: 386 ms vs 3.7 s)
const GPU_ARGS = ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--disable-gpu-shader-disk-cache'];

const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (MEASURE_ONLY) { S('   · ' + label + ' — ' + detail); return ok; } judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }

const INSTRUMENT = () => {
  const G = window.__gl = { block: 0, infoLog: 0, n: 0 }; window.__lt = [];
  try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  // the calls that make the page wait for a shader program to finish linking
  const BLOCK = ['getProgramInfoLog', 'getShaderInfoLog', 'getProgramParameter', 'getShaderParameter', 'getActiveUniform', 'getUniformLocation', 'getActiveAttrib', 'getAttribLocation'];
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) if (C) BLOCK.forEach(n => { const f = C.prototype[n]; C.prototype[n] = function () {
    const t = performance.now(), r = f.apply(this, arguments), d = performance.now() - t; G.block += d; G.n++; if (n === 'getProgramInfoLog') G.infoLog += d; return r; }; });
};

async function run(ctxOpts, query, label, throttle) {
  const browser = await chromium.launch({ args: GPU_ARGS });
  const ctx = await browser.newContext(ctxOpts); const page = await ctx.newPage(); const cons = [], reqs = [];
  page.on('console', m => { const t = m.text(); cons.push([Date.now(), t]); if (/§(SHADER_ASYNC|DUCT_SILHOUETTE_SKIP|SHEETJS_|CAPS)/.test(t)) log.push('  [console ' + label + '] ' + t); });
  page.on('request', r => reqs.push(r.url()));
  page.on('pageerror', e => log.push('  [pageerror ' + label + '] ' + String(e.message).slice(0, 200)));
  await page.addInitScript(INSTRUMENT);
  if (throttle) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:' + server.address().port + URL_PATH + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let first = null, hooked = false;
  while (Date.now() - t0 < 120000) { await page.waitForTimeout(50);
    if (!hooked) hooked = await page.evaluate(() => { const r = window.APP && APP.renderer; if (!r || !APP.scene) return false; const f = r.render;
      r.render = function (sc, cam) { const out = f.apply(this, arguments); if (sc === APP.scene && !window.__modelAt && this.info.render.triangles > 100000) { window.__modelAt = performance.now(); window.__modelTris = this.info.render.triangles; } return out; };
      return true; }).catch(() => false);
    const at = await page.evaluate(() => window.__modelAt || 0).catch(() => 0);
    if (at) { first = Math.round(at); break; } }
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => { const r = APP.renderer, gl = r.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info');
    return { gl: window.__gl, lt: window.__lt, tris: window.__modelTris || 0, programs: (r.info.programs || []).length, gpu: gl.getParameter(e.UNMASKED_RENDERER_WEBGL),
      parallel: !!gl.getExtension('KHR_parallel_shader_compile'), xlsx: typeof XLSX !== 'undefined' }; });
  const dbAt = (cons.find(([, t]) => /§DB_LOADED/.test(t)) || [null])[0];
  const dbMs = dbAt ? dbAt - t0 : null;
  const after = st.lt.filter(([s]) => dbMs == null || s >= dbMs - 1000);
  const longest = after.reduce((m, [, d]) => Math.max(m, d), 0), blocking = after.reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
  const xlsxBoot = reqs.some(u => /xlsx\.full\.min\.js/.test(u));
  let xlsxOnDemand = null;
  if (!xlsxBoot && !st.xlsx) { await page.evaluate(() => window.APP._cacheIssuesForExport && window.APP._cacheIssuesForExport()); await page.waitForTimeout(4000);
    xlsxOnDemand = await page.evaluate(() => typeof XLSX !== 'undefined'); }
  // K6 (phone, this tree only): three's readiness poll throws inside its own setTimeout → its promise never settles.
  // The hold must still release and drawing resume (else a phone picture freezes for good).
  let k6 = null;
  if (label === 'phone' && !MEASURE_ONLY) k6 = await page.evaluate(async () => {
    const A = window.APP, Sa = A._shaderAsync; if (!Sa) return { missing: true };
    // a program that stays "not ready" for ~50 ms, then its readiness check throws mid-poll
    const orig = A.renderer.compile, origGet = A.renderer.properties.get, f0 = A.renderer.info.render.frame, fake = {};
    let polls = 0; const fakeProg = { isReady() { if (++polls > 5) throw new Error('simulated readiness failure'); return false; } };
    A.renderer.compile = function () { return new Set([fake]); };
    A.renderer.properties.get = function (m) { return m === fake ? { currentProgram: fakeProg } : origGet.apply(this, arguments); };
    Sa.on = true; Sa.settled = false; if (A.markDirty) A.markDirty();
    await new Promise(r => setTimeout(r, 25)); const held = Sa.pending;
    await new Promise(r => setTimeout(r, 1500));
    if (A.markDirty) A.markDirty(); await new Promise(r => setTimeout(r, 600));
    A.renderer.compile = orig; A.renderer.properties.get = origGet;
    return { held, pendingAfter: Sa.pending, fellBack: Sa.on === false, framesAdvanced: A.renderer.info.render.frame - f0 };
  });
  const lines = cons.map(([, t]) => t);
  const res = { label, gpu: st.gpu, parallel: st.parallel, dbMs, firstMs: first, shaderBlockMs: Math.round(st.gl.block), infoLogMs: Math.round(st.gl.infoLog), longestMs: longest, tbtAfterDbMs: blocking,
    tris: st.tris, programs: st.programs, k6, fallbackLine: lines.some(t => /^§SHADER_ASYNC_FALLBACK why=poll-threw/.test(t)), realFallback: lines.filter(t => /^§SHADER_ASYNC_FALLBACK why=(?!poll-threw)/.test(t)).length, xlsxBoot, xlsxOnDemand, silSkip: lines.some(t => /^§DUCT_SILHOUETTE_SKIP phone/.test(t)), shaderAsync: lines.filter(t => /^§SHADER_ASYNC/.test(t)).length };
  S('§P3_RUN ' + JSON.stringify(res));
  await ctx.close(); await browser.close();
  return res;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  S('── PHONE (CPU 4x, ' + (MEASURE_ONLY ? 'MEASURE ' + ROOT : 'this tree') + ') ──');
  const ph = await run(PHONE, '', 'phone', true);
  const real = /Intel|NVIDIA|AMD|Mesa/.test(ph.gpu) && !/SwiftShader/.test(ph.gpu) && ph.parallel;
  if (!real) S('   ⚪ K1/K2 INCONCLUSIVE — backend "' + ph.gpu + '" parallel=' + ph.parallel + ' (no parallel compile → nothing to overlap)');
  else {
    verdict(ph.shaderBlockMs < 150, 'K1 shader wait on the phone path < 150 ms', 'blocking_shader_calls_ms=' + ph.shaderBlockMs + ' getProgramInfoLog_ms=' + ph.infoLogMs + ' (P0: 3,694 ms on this GPU)');
  }
  verdict(ph.silSkip, 'K3 silhouette refine skipped on the phone', 'skip_line=' + ph.silSkip);
  verdict(!ph.xlsxBoot && ph.xlsxOnDemand === true, 'K4 no SheetJS at phone boot, loaded when Issues opens', 'boot_request=' + ph.xlsxBoot + ' on_demand_defined=' + ph.xlsxOnDemand);
  if (ph.k6 && !ph.k6.missing) verdict(ph.k6.held && !ph.k6.pendingAfter && ph.k6.fellBack && ph.k6.framesAdvanced > 0 && ph.fallbackLine,
    'K6 a shader-compile failure does not freeze the picture', JSON.stringify(ph.k6) + ' fallback_line=' + ph.fallbackLine);
  else if (!MEASURE_ONLY) verdict(false, 'K6 APP._shaderAsync exposed', JSON.stringify(ph.k6));
  verdict(ph.realFallback === 0, 'K7 no real fallback during the load (the vendored-three poll crash cannot happen)', 'real_fallback_lines=' + ph.realFallback);
  verdict(ph.tris > 100000 && ph.firstMs != null, 'K5 model drawn on the phone', 'model_tris=' + ph.tris + ' model_drawn_ms(page clock)=' + ph.firstMs);

  S('\n── RED CONTROL: phone with ?shaderasync=0 (the old blocking path) ──');
  const red = await run(PHONE, '&shaderasync=0', 'phone-red', true);
  if (real) {
    const redFired = red.shaderBlockMs > 1000;
    if (!MEASURE_ONLY) { judged++; if (!redFired) fails++; }
    S('   ' + (redFired ? '🟢 red control went RED as required' : '🔴 red control did NOT go red — K1 cannot fail') + ' — blocking_shader_calls_ms=' + red.shaderBlockMs);
    verdict(ph.longestMs < red.longestMs, 'K2 longest main-thread task after the DB is shorter than the blocking path', 'async=' + ph.longestMs + ' ms vs blocking=' + red.longestMs + ' ms');
  }

  S('\n── DESKTOP control (no throttle; must be unchanged) ──');
  const dk = await run(DESKTOP, '', 'desktop', false);
  verdict(dk.xlsxBoot && !dk.silSkip && dk.shaderAsync === 0, 'desktop: SheetJS at boot, silhouette refine on, no §SHADER_ASYNC', 'xlsx_boot=' + dk.xlsxBoot + ' sil_skip=' + dk.silSkip + ' shader_async_lines=' + dk.shaderAsync);

  server.close();
  const outcome = MEASURE_ONLY ? 'MEASURED' : judged === 0 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_MOBILE_P3 ' + outcome + ' judged=' + judged + ' fails=' + fails + ' backend="' + ph.gpu + '"');
  fs.writeFileSync(path.join(__dirname, MEASURE_ONLY ? 'witness_mobile_p3.measure.log' : 'witness_mobile_p3.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' || outcome === 'MEASURED' ? 0 : 1);
})();
