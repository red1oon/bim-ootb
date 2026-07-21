#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GPU-WARN-FIRSTRUN scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Viewer/FLY_TOUR_DLOD_SCALE.md §14.
 * ISSUE IT PROVES/DISPROVES: on the first-ever run (no stored baseline in localStorage key
 * bim_gpu_lastgood) the GPU-degradation check must NOT warn — there is nothing to compare
 * against yet — and must write the current renderer signature as the new baseline. If it
 * warned here, every fresh browser profile would see a false alarm on first open.
 *   PASS = no toast, §GPU_BASELINE_INIT logged, baseline written with the exact current
 *          {renderer, multiDraw}, no §GPU_DEGRADED_WARN.
 *   FAIL = any toast, or no/wrong baseline written.
 * RUN: node witness_gpu_warn_firstrun.js   (pure node — drives the REAL gpuBaselineCheck from
 * viewer/scene.js via vm with a mocked localStorage; no browser/GPU needed per §14.)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'viewer', 'scene.js'), 'utf8');
const lines = [];
const rec = { log: (...a) => { const s = a.join(' '); lines.push(s); console.log('  [page] ' + s); } };
rec.warn = rec.log; rec.error = rec.log;
const ctx = vm.createContext({ console: rec, window: {}, setTimeout });
vm.runInContext(SRC, ctx, { filename: 'viewer/scene.js' }); // top-level = function decls only, nothing executes
const check = ctx.gpuBaselineCheck;

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function mockStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) };
}

console.log('W-GPU-WARN-FIRSTRUN — no stored baseline → no toast, baseline gets written');
chk('gpuBaselineCheck extracted from real viewer/scene.js', typeof check === 'function');

const st = mockStorage();            // first-ever run: empty localStorage
const toasts = [];
const GPU = 'NVIDIA GeForce RTX 3060/PCIe/SSE2';
const r = check(GPU, true, st, m => toasts.push(m));

chk('outcome tag = init', r === 'init', 'got=' + r);
chk('NO toast on first run', toasts.length === 0, 'toasts=' + toasts.length);
const stored = JSON.parse(st.getItem('bim_gpu_lastgood') || 'null');
chk('baseline written', !!stored);
chk('baseline renderer matches current', stored && stored.renderer === GPU, 'stored=' + (stored && stored.renderer));
chk('baseline multiDraw matches current', stored && stored.multiDraw === true);
chk('baseline has ts', stored && typeof stored.ts === 'number');
chk('§GPU_BASELINE_INIT logged', lines.some(l => l.indexOf('§GPU_BASELINE_INIT') >= 0));
chk('no §GPU_DEGRADED_WARN logged', !lines.some(l => l.indexOf('§GPU_DEGRADED_WARN') >= 0));
chk('no bim_gpu_warned flag set', st.getItem('bim_gpu_warned') === null);

console.log(`\nW-GPU-WARN-FIRSTRUN: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} ok, ${fail} bad)`);
process.exit(fail === 0 ? 0 : 1);
