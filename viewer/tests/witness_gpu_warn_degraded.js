#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GPU-WARN-DEGRADED scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Viewer/FLY_TOUR_DLOD_SCALE.md §14.
 * ISSUE IT PROVES/DISPROVES: both real machine incidents (silent iGPU fallback after a driver
 * update; broken launcher losing WebGL caps) were 100% invisible in-app. This witness proves the
 * check now catches exactly that shape: stored baseline = discrete GPU + multiDraw=true, current
 * = integrated + multiDraw=false → visible toast + §GPU_DEGRADED_WARN, AND the last-known-good
 * baseline is NOT silently overwritten by the degraded reading (persistence semantics per §14:
 * baseline only refreshes on same-or-improved, so the warning stays meaningful on later checks).
 *   PASS = outcome 'warn', 1 toast with the §14 message shape, §GPU_DEGRADED_WARN logged,
 *          bim_gpu_lastgood still the discrete-GPU baseline afterwards.
 *   FAIL = no toast, or baseline overwritten by the degraded signature.
 * RUN: node witness_gpu_warn_degraded.js   (pure node — real gpuBaselineCheck from
 * viewer/scene.js via vm, mocked localStorage; no browser/GPU needed per §14.)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'viewer', 'scene.js'), 'utf8');
const lines = [];
const rec = { log: (...a) => { const s = a.join(' '); lines.push(s); console.log('  [page] ' + s); } };
rec.warn = rec.log; rec.error = rec.log;
const ctx = vm.createContext({ console: rec, window: {}, setTimeout });
vm.runInContext(SRC, ctx, { filename: 'viewer/scene.js' });
const check = ctx.gpuBaselineCheck;

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function mockStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) };
}

console.log('W-GPU-WARN-DEGRADED — discrete/multiDraw baseline vs integrated/no-multiDraw current');
chk('gpuBaselineCheck extracted from real viewer/scene.js', typeof check === 'function');

const DISCRETE = 'NVIDIA GeForce RTX 3060/PCIe/SSE2';
const INTEGRATED = 'Intel(R) UHD Graphics 630';

// ── Case A (the §14 witness scenario): discrete+md=true → integrated+md=false ──
const st = mockStorage({ bim_gpu_lastgood: JSON.stringify({ renderer: DISCRETE, multiDraw: true, ts: 1000 }) });
const toasts = [];
const r = check(INTEGRATED, false, st, m => toasts.push(m));

chk('outcome tag = warn', r === 'warn', 'got=' + r);
chk('exactly 1 toast', toasts.length === 1, 'toasts=' + toasts.length);
chk('toast has §14 message shape (fell back / renderer / drivers or reboot)',
  toasts.length === 1 && /Rendering fell back to a slower GPU \(/.test(toasts[0]) &&
  toasts[0].indexOf(INTEGRATED) >= 0 && /check GPU drivers or reboot/.test(toasts[0]),
  'msg=' + toasts[0]);
chk('§GPU_DEGRADED_WARN logged', lines.some(l => l.indexOf('§GPU_DEGRADED_WARN') >= 0));
const after = JSON.parse(st.getItem('bim_gpu_lastgood'));
chk('baseline NOT overwritten by degraded reading (still discrete GPU)',
  after.renderer === DISCRETE && after.multiDraw === true, 'stored=' + after.renderer + '/md=' + after.multiDraw);
chk('warned flag pinned to degraded signature', st.getItem('bim_gpu_warned') === INTEGRATED + '|false',
  'flag=' + st.getItem('bim_gpu_warned'));

// ── Case B (the RTX-incident shape alone): multiDraw true→false, renderer string unchanged ──
// Proves the multiDraw leg of the OR triggers independently of the discrete→integrated regex.
const st2 = mockStorage({ bim_gpu_lastgood: JSON.stringify({ renderer: DISCRETE, multiDraw: true, ts: 1000 }) });
const toasts2 = [];
const r2 = check(DISCRETE, false, st2, m => toasts2.push(m));
chk('multiDraw true→false ALONE also warns', r2 === 'warn' && toasts2.length === 1, 'got=' + r2);
const after2 = JSON.parse(st2.getItem('bim_gpu_lastgood'));
chk('baseline preserved in multiDraw-only case too', after2.multiDraw === true);

console.log(`\nW-GPU-WARN-DEGRADED: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} ok, ${fail} bad)`);
process.exit(fail === 0 ? 0 : 1);
