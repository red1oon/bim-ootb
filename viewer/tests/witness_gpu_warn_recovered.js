#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GPU-WARN-RECOVERED scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Viewer/FLY_TOUR_DLOD_SCALE.md §14.
 * ISSUE IT PROVES/DISPROVES: after a real recovery (driver fixed / back on the dGPU) the check
 * must NOT warn and must refresh the stored baseline to the better state — otherwise "good"
 * stays pinned to a stale weaker baseline forever and future degradations compare against the
 * wrong thing. Also proves the persisted don't-nag flag is cleared on recovery, so a LATER
 * re-degradation warns again (§14: "only re-show if the signature changes again — recovers then
 * degrades again").
 *   PASS = outcome 'update', zero toasts, baseline now the discrete/improved signature,
 *          bim_gpu_warned cleared, and a subsequent re-degrade warns again.
 *   FAIL = toast on improvement, stale baseline kept, or re-degrade after recovery stays silent.
 * RUN: node witness_gpu_warn_recovered.js   (pure node — real gpuBaselineCheck from
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

console.log('W-GPU-WARN-RECOVERED — degraded baseline, current back on discrete GPU');
chk('gpuBaselineCheck extracted from real viewer/scene.js', typeof check === 'function');

const DISCRETE = 'NVIDIA GeForce RTX 3060/PCIe/SSE2';
const INTEGRATED = 'Intel(R) UHD Graphics 630';

// Stored state as it would be AFTER a warned degradation: NOTE per the pinned §14 semantics the
// baseline itself never gets downgraded (it stays last-known-GOOD) — the state that marks "we
// were degraded" is the bim_gpu_warned flag. To ALSO cover the spec's literal wording ("stored
// baseline = degraded state"), the baseline here is seeded AS the degraded signature (e.g. the
// user cleared site data mid-incident, first run re-baselined on the iGPU, then the dGPU came back).
const st = mockStorage({
  bim_gpu_lastgood: JSON.stringify({ renderer: INTEGRATED, multiDraw: false, ts: 2000 }),
  bim_gpu_warned: INTEGRATED + '|false',
});
const toasts = [];
const r = check(DISCRETE, true, st, m => toasts.push(m));

chk('outcome tag = update (improvement is silent)', r === 'update', 'got=' + r);
chk('NO toast on recovery', toasts.length === 0, 'toasts=' + toasts.length);
const after = JSON.parse(st.getItem('bim_gpu_lastgood'));
chk('baseline updated to the better state', after.renderer === DISCRETE && after.multiDraw === true,
  'stored=' + after.renderer + '/md=' + after.multiDraw);
chk('no §GPU_DEGRADED_WARN logged', !lines.some(l => l.indexOf('§GPU_DEGRADED_WARN') >= 0));
chk('don\'t-nag flag cleared on recovery', st.getItem('bim_gpu_warned') === null);

// ── Recover-then-degrade-again must WARN again (§14 re-show condition) ──
const toasts2 = [];
const r2 = check(INTEGRATED, false, st, m => toasts2.push(m));
chk('re-degrade AFTER recovery warns again', r2 === 'warn' && toasts2.length === 1, 'got=' + r2 + ' toasts=' + toasts2.length);

console.log(`\nW-GPU-WARN-RECOVERED: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} ok, ${fail} bad)`);
process.exit(fail === 0 ? 0 : 1);
