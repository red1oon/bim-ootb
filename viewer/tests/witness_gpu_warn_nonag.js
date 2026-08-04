#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GPU-WARN-NONAG scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Viewer/FLY_TOUR_DLOD_SCALE.md §14.
 * ISSUE IT PROVES/DISPROVES: §14 forbids nagging — the SAME degraded signature on consecutive
 * loads must toast ONCE, not every load. Mechanism under test (pinned in scene.js
 * gpuBaselineCheck comment): a PERSISTED flag, localStorage key bim_gpu_warned holding the
 * already-warned degraded signature "<renderer>|<multiDraw>". Chosen over a session-only flag
 * because every fresh page load is a new JS session — a session flag would re-toast on every
 * open, exactly the nagging §14 forbids. Re-show happens ONLY when the degraded signature
 * changes (e.g. degrades further).
 *   PASS = load1 toasts, load2 (same signature) does NOT toast and logs §GPU_DEGRADED_NONAG,
 *          load3 with a DIFFERENT degraded signature toasts again.
 *   FAIL = second toast for the same signature, or no re-toast on a changed signature.
 * RUN: node witness_gpu_warn_nonag.js   (pure node — real gpuBaselineCheck from
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

console.log('W-GPU-WARN-NONAG — same degraded signature twice → one toast; changed signature → re-toast');
chk('gpuBaselineCheck extracted from real viewer/scene.js', typeof check === 'function');

const DISCRETE = 'NVIDIA GeForce RTX 3060/PCIe/SSE2';
const INTEGRATED = 'Intel(R) UHD Graphics 630';
const INTEGRATED2 = 'Intel(R) Iris(R) Xe Graphics';   // a DIFFERENT degraded signature

// ONE persistent storage across simulated loads — localStorage survives page loads, which is the
// entire point of the persisted flag (a fresh JS session per load keeps no in-memory state).
const st = mockStorage({ bim_gpu_lastgood: JSON.stringify({ renderer: DISCRETE, multiDraw: true, ts: 1000 }) });
const toasts = [];
const onWarn = m => toasts.push(m);

// Load 1: degraded → toast
const r1 = check(INTEGRATED, false, st, onWarn);
chk('load1 outcome = warn', r1 === 'warn', 'got=' + r1);
chk('load1 toasted (1 total)', toasts.length === 1, 'toasts=' + toasts.length);

// Load 2: SAME degraded signature → no second toast
const r2 = check(INTEGRATED, false, st, onWarn);
chk('load2 outcome = nonag', r2 === 'nonag', 'got=' + r2);
chk('load2 did NOT toast (still 1 total)', toasts.length === 1, 'toasts=' + toasts.length);
chk('§GPU_DEGRADED_NONAG logged on load2', lines.some(l => l.indexOf('§GPU_DEGRADED_NONAG') >= 0));
chk('§GPU_DEGRADED_WARN still logged each degraded load (console visibility ≠ nag)',
  lines.filter(l => l.indexOf('§GPU_DEGRADED_WARN') >= 0).length === 2,
  'warn_lines=' + lines.filter(l => l.indexOf('§GPU_DEGRADED_WARN') >= 0).length);
chk('baseline still the discrete last-known-good',
  JSON.parse(st.getItem('bim_gpu_lastgood')).renderer === DISCRETE);

// Load 3: signature CHANGES (degrades to a different iGPU) → §14 says re-show
const r3 = check(INTEGRATED2, false, st, onWarn);
chk('load3 (changed degraded signature) outcome = warn again', r3 === 'warn', 'got=' + r3);
chk('load3 toasted (2 total)', toasts.length === 2, 'toasts=' + toasts.length);

console.log(`\nW-GPU-WARN-NONAG: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} ok, ${fail} bad)`);
process.exit(fail === 0 ? 0 : 1);
