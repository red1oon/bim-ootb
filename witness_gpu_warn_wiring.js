#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GPU-WARN wiring witness (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Viewer/FLY_TOUR_DLOD_SCALE.md §14.
 * ISSUE IT PROVES/DISPROVES: the four pure-logic witnesses (witness_gpu_warn_*.js) prove
 * gpuBaselineCheck's decisions, but NOT that scene.js actually calls it at the §RENDERER_CAPS
 * point on a real page load, nor that the DEGRADED branch renders a real dismissible toast in
 * the DOM. This witness proves that wiring live in headless Chrome — degradation is forced at
 * the JS boundary (stub getExtension('WEBGL_multi_draw') → null, so multiDraw goes true→false
 * against a seeded discrete baseline), per §14's "mocked state, not real hardware" approach.
 *   PASS = load1 (clean storage): §GPU_BASELINE_INIT + baseline key written, no toast.
 *          load2 (seeded NVIDIA/multiDraw:true baseline + stub): §GPU_DEGRADED_WARN + visible
 *          #_gpu_warn_toast whose ✕ removes it, baseline NOT overwritten.
 *          load3 (same degraded state): §GPU_DEGRADED_NONAG, NO toast element.
 *   FAIL = any of those missing — i.e. the logic exists but never runs / never shows UI.
 * RUN: node witness_gpu_warn_wiring.js   (spins its own static server on PORT, default 8437)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const PORT = process.env.PORT || 8437;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css',
  '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
      r.end(b);
    });
  });
}

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const DISCRETE = 'NVIDIA GeForce RTX 3060/PCIe/SSE2';

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  let logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  const waitLog = (needle, ms) => new Promise((res) => {
    const t0 = Date.now();
    (function poll() {
      if (logs.some(l => l.indexOf(needle) >= 0)) return res(true);
      if (Date.now() - t0 > ms) return res(false);
      setTimeout(poll, 250);
    })();
  });
  const URL = `http://localhost:${PORT}/viewer/viewer.html`;

  // ── Load 1: clean storage → FIRSTRUN wiring ──
  console.log('LOAD 1 — clean localStorage (first-ever run wiring)');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  logs = [];
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  chk('§RENDERER_CAPS logged (probe ran)', await waitLog('§RENDERER_CAPS', 30000));
  chk('§GPU_BASELINE_INIT logged on real page load', await waitLog('§GPU_BASELINE_INIT', 15000));
  const base1 = await page.evaluate(() => localStorage.getItem('bim_gpu_lastgood'));
  chk('baseline key written to real localStorage', !!base1, 'val=' + base1);
  chk('no toast on first run', await page.evaluate(() => !document.getElementById('_gpu_warn_toast')));

  // ── Load 2: seeded discrete baseline + multi_draw stubbed away → DEGRADED wiring + toast DOM ──
  console.log('LOAD 2 — seeded NVIDIA/multiDraw:true baseline, WEBGL_multi_draw stubbed to null');
  await page.evaluate((r) => {
    localStorage.setItem('bim_gpu_lastgood', JSON.stringify({ renderer: r, multiDraw: true, ts: Date.now() }));
    localStorage.removeItem('bim_gpu_warned');
  }, DISCRETE);
  await page.evaluateOnNewDocument(() => {
    // Force the multiDraw true→false leg at the JS boundary — no real GPU change needed (§14).
    const stub = (proto) => {
      const orig = proto.getExtension;
      proto.getExtension = function (name) {
        if (name === 'WEBGL_multi_draw') return null;
        return orig.call(this, name);
      };
    };
    if (window.WebGLRenderingContext) stub(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) stub(WebGL2RenderingContext.prototype);
  });
  logs = [];
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  chk('§RENDERER_CAPS reports multi_draw=off under stub', await waitLog('§RENDERER_CAPS multi_draw=off', 30000));
  chk('§GPU_DEGRADED_WARN logged on real page load', await waitLog('§GPU_DEGRADED_WARN', 15000));
  const toast = await page.waitForSelector('#_gpu_warn_toast', { timeout: 15000 }).catch(() => null);
  chk('toast element #_gpu_warn_toast rendered in DOM', !!toast);
  const toastTxt = toast ? await page.evaluate(t => t.textContent, toast) : '';
  chk('toast carries §14 message shape', /Rendering fell back to a slower GPU \(/.test(toastTxt) &&
    /check GPU drivers or reboot/.test(toastTxt), 'txt=' + toastTxt.slice(0, 120));
  const base2 = await page.evaluate(() => JSON.parse(localStorage.getItem('bim_gpu_lastgood')));
  chk('baseline NOT overwritten by degraded load', base2 && base2.renderer === DISCRETE && base2.multiDraw === true,
    'stored=' + (base2 && base2.renderer));
  // Dismissible: click the ✕
  await page.evaluate(() => { const t = document.getElementById('_gpu_warn_toast'); t.querySelector('button').click(); });
  chk('✕ dismisses the toast', await page.evaluate(() => !document.getElementById('_gpu_warn_toast')));

  // ── Load 3: same degraded state again → NONAG wiring (no toast) ──
  console.log('LOAD 3 — same degraded signature (stub persists) → must not re-toast');
  logs = [];
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  chk('§GPU_DEGRADED_NONAG logged', await waitLog('§GPU_DEGRADED_NONAG', 30000));
  await new Promise(r => setTimeout(r, 3000)); // grace: toast would have appeared with the WARN line
  chk('NO toast element on repeat degraded load', await page.evaluate(() => !document.getElementById('_gpu_warn_toast')));

  await browser.close();
  server.close();
  console.log(`\nW-GPU-WARN wiring: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} ok, ${fail} bad)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('WITNESS CRASH: ' + e.message); process.exit(2); });
