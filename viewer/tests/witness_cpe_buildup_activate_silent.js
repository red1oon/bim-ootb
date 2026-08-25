#!/usr/bin/env node
// witness_cpe_buildup_activate_silent.js — W-ACTIVATE-SILENT
// Implementing bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_ACTIVATE_POPS_PANEL
//
// THE ISSUE THIS WITNESS PROVES OR DISPROVES:
//   Alt+C's bake (tmActivateForBake) used to call the real, panel-popping activate() to get the
//   schedule ready — every bake visibly opened the Time Machine panel, drew the mini-Gantt and
//   dashboard, and fetched the twin-cost drawer, none of which a camera-only bake needs. The fix
//   threads a `silent` flag through activate()->_activateAsync()->_finishActivate() so the bake
//   path loads the same _ops/_projectStart/_projectEnd data WITHOUT touching panel DOM, and a
//   companion tmDeactivateIfBakeOwned() turns TM back off afterward ONLY if the bake itself was
//   the one that turned it on (never touching a real user's already-open session).
//
//   A witness that only checks "_ops got populated" would PASS on the broken build — the data
//   loaded fine before this fix too. The assertion here is the panel-facing call COUNTS:
//   setToolbarHighlight/_panel.display/switchMode/renderAtTime/updateStatus/drawGanttMini/
//   drawDashboard/_loadTwin must be ZERO on a silent activation and UNCHANGED (>0, same as a
//   plain call) on a real one.
//
// HOW IT FALSIFIES: Gate A runs against the CURRENT working tree — re-deriving the panel-call
// contract from real source every run is what makes this falsifiable, not a permanent RED control.
// It also runs the same gates against `origin/main` and logs the comparison, but that comparison is
// informational only, NOT a verdict gate: this fix (bim-ootb #1510) is itself part of origin/main
// from the day it merged, so "shipped still reproduces the bug" becomes permanently unsatisfiable —
// that's the fix being live, not the witness going blind. The verdict is `fixed`'s gates alone.
//
// Run (from the repo root): node witness_cpe_buildup_activate_silent.js
// Read the log, not the exit code.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const TM = path.join(__dirname, '..', 'time_machine.js');
const workingSrc = fs.readFileSync(TM, 'utf8');
const shippedSrc = cp.execFileSync('git', ['show', 'origin/main:viewer/time_machine.js'],
  { cwd: __dirname, maxBuffer: 1 << 28 }).toString();

function slice(src, marker, optional) {
  const idx = src.indexOf(marker);
  if (idx < 0) {
    if (optional) return '';
    throw new Error('marker not found: ' + marker);
  }
  let depth = 0, seen = false, i = idx;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seen = true; }
    else if (src[i] === '}') { depth--; if (seen && depth === 0) break; }
  }
  return src.slice(idx, i + 1) + ';';
}

// ── Gate A: activate()/_activateAsync()/_finishActivate() — panel calls gated on `silent` ──────
function makeActivateHarness(src) {
  const calls = { setToolbarHighlight: 0, panelDisplaySets: [], switchMode: 0, renderAtTime: 0,
                  updateStatus: 0, drawGanttMini: 0, drawDashboard: 0, loadTwin: 0,
                  xrayCache: 0, computeDays: 0, saveVisibility: 0 };
  const _panel = { style: {} };
  Object.defineProperty(_panel.style, 'display', {
    set(v) { calls.panelDisplaySets.push(v); this._v = v; },
    get() { return this._v; },
  });
  const ctx = {
    _ops: [], _active: false, _projectStart: 0, _projectEnd: 0, _days: [],
    _lastEdit: null, _ganttAutoGenAttempted: false, _ganttSelected: {}, _marquee: null, _groupDrag: null,
    _s4ActT0: 0, _tmEnabledGI: false, _activeBuildingCount: 0, _isLargeBuilding: false,
    _dlodProxyOn: false, _anchorDay: null, _anchorHr: null, _ganttVisible: false, _dashVisible: false,
    _panel,
    LARGE_BUILDING: 50000, DLOD_TM_MIN_ELEMENTS: 1000,
    performance: { now: () => Date.now() },
    console: { log: () => {}, warn: (m) => console.warn(String(m)) },
    document: { getElementById: () => null },
    setInterval, clearInterval,
    setToolbarHighlight: (on) => { calls.setToolbarHighlight++; },
    switchMode: () => { calls.switchMode++; },
    renderAtTime: () => { calls.renderAtTime++; },
    updateStatus: () => { calls.updateStatus++; },
    drawGanttMini: () => { calls.drawGanttMini++; },
    drawDashboard: () => { calls.drawDashboard++; },
    _loadTwin: () => { calls.loadTwin++; return Promise.resolve(null); },
    _tmRebuildXrayCache: () => { calls.xrayCache++; },
    computeDays: () => {
      calls.computeDays++;
      // Real computeDays derives projectStart/projectEnd from _ops — the bake NEEDS this to keep
      // working under `silent`, so the stub reproduces exactly that side effect.
      if (ctx._ops.length) {
        ctx._projectStart = Math.min.apply(null, ctx._ops.map(o => o.start_ts));
        ctx._projectEnd = Math.max.apply(null, ctx._ops.map(o => o.end_ts));
        ctx._days = [ctx._projectStart, ctx._projectEnd];
      }
    },
    saveVisibility: () => { calls.saveVisibility++; },
    viewerStatus: () => {},
    cacheGet: (k) => Promise.resolve(ctx._cachedOps || null),
    cacheDel: () => {},
    cachePut: () => {},
    loadOps: () => ctx._cachedOps || [],   // simulates "the DB now reflects what cache-hit just inserted"
    A: () => ({
      db: {
        run: () => {},
        prepare: () => ({ run: () => {}, free: () => {} }),
      },
      _tmOn: false,
    }),
  };
  ctx.window = ctx;
  ctx.window.ScheduleAuthor = { activeSchedule: () => ({ id: 1 }) }; // keep the cache-hit path live

  vm.createContext(ctx);
  vm.runInContext([
    slice(src, 'function activate('),
    slice(src, 'function _activateAsync('),
    slice(src, 'function _finishActivate('),
  ].join('\n'), ctx);

  return { ctx, calls };
}

const HOSPITAL_OPS = [
  { output_guid: 'g1', input_guids: [], start_ts: 1.7e12, end_ts: 1.7e12 + 86400000, parameters: {}, op_type: 'ELEMENT_PLACE' },
  { output_guid: 'g2', input_guids: [], start_ts: 1.7e12 + 86400000, end_ts: 1.7e12 + 2 * 86400000, parameters: {}, op_type: 'ELEMENT_PLACE' },
];

async function gateA(src, label) {
  const out = { label };
  // Real Play (no arg) — panel calls must fire, exactly as before this fix.
  {
    const h = makeActivateHarness(src);
    h.ctx._cachedOps = HOSPITAL_OPS;
    h.ctx.activate();
    for (let i = 0; i < 30 && !h.ctx._active; i++) await new Promise(r => setTimeout(r, 0));
    const panelFired = h.calls.setToolbarHighlight > 0 && h.calls.panelDisplaySets.includes('flex') &&
      h.calls.switchMode > 0 && h.calls.updateStatus > 0;
    const dataOk = h.ctx._ops.length === 2 && h.ctx._projectEnd > h.ctx._projectStart;
    out.realPlay = panelFired && dataOk;
    console.log('§ACTIVATE_SILENT G-A1 ' + label + ' realPlay panelCalls=' + JSON.stringify(h.calls) +
      ' data(ops=' + h.ctx._ops.length + ' span=' + (h.ctx._projectEnd - h.ctx._projectStart) + 'ms)' +
      ' → ' + (out.realPlay ? 'panel shown as before (PASS)' : 'FAIL — real Play stopped opening the panel'));
  }
  // Silent bake activation — panel calls must be ZERO; data must still populate.
  {
    const h = makeActivateHarness(src);
    h.ctx._cachedOps = HOSPITAL_OPS;
    h.ctx.activate(true);
    for (let i = 0; i < 30 && !h.ctx._active; i++) await new Promise(r => setTimeout(r, 0));
    const panelSilent = h.calls.setToolbarHighlight === 0 && h.calls.panelDisplaySets.length === 0 &&
      h.calls.switchMode === 0 && h.calls.renderAtTime === 0 && h.calls.updateStatus === 0 &&
      h.calls.drawGanttMini === 0 && h.calls.drawDashboard === 0 && h.calls.loadTwin === 0;
    const dataOk = h.ctx._ops.length === 2 && h.ctx._projectEnd > h.ctx._projectStart &&
      h.calls.xrayCache > 0 && h.calls.computeDays > 0 && h.calls.saveVisibility > 0;
    out.silent = panelSilent && dataOk;
    console.log('§ACTIVATE_SILENT G-A2 ' + label + ' silentBake panelCalls=' + JSON.stringify(h.calls) +
      ' data(ops=' + h.ctx._ops.length + ' span=' + (h.ctx._projectEnd - h.ctx._projectStart) + 'ms)' +
      ' → ' + (out.silent ? 'zero panel footprint, data still real (PASS)' : 'FAIL — silent activation still touched the panel, or lost the data'));
  }
  return out;
}

// ── Gate B: tmActivateForBake / tmDeactivateIfBakeOwned ownership — working tree only ──────────
function makeOwnershipHarness(src) {
  const spy = { activateCalls: 0, activateSilent: null, deactivateCalls: 0 };
  const ctx = {
    _ops: [1], _active: false, _projectStart: 0, _projectEnd: 100, _bakeOwnsActivation: false,
    console: { log: () => {}, warn: () => {} },
    setInterval, clearInterval,
    activate: (silent) => { spy.activateCalls++; spy.activateSilent = silent; ctx._active = true; },
    deactivate: () => { spy.deactivateCalls++; ctx._active = false; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    slice(src, 'function _bakeTimelineReady()'),
    slice(src, 'window.tmActivateForBake = function'),
    slice(src, 'window.tmDeactivateIfBakeOwned = function'),
  ].join('\n'), ctx);
  return { ctx, spy };
}

async function gateB() {
  // B1 — TM was OFF: the bake must be the one to turn it on, and tmDeactivateIfBakeOwned must turn it off after.
  {
    const h = makeOwnershipHarness(workingSrc);
    const ok = await h.ctx.window.tmActivateForBake();
    h.ctx.window.tmDeactivateIfBakeOwned();
    const pass = ok === true && h.spy.activateCalls === 1 && h.spy.activateSilent === true && h.spy.deactivateCalls === 1;
    console.log('§ACTIVATE_SILENT G-B1 TM-was-off armed=' + ok + ' activate(silent=' + h.spy.activateSilent +
      ')x' + h.spy.activateCalls + ' deactivate x' + h.spy.deactivateCalls +
      ' → ' + (pass ? 'bake owned + cleaned up its own activation (PASS)' : 'FAIL'));
    return pass;
  }
}
async function gateB2() {
  // B2 — a real user session was ALREADY active: the bake must not call activate(), and must NEVER
  // deactivate a session it did not open.
  const h = makeOwnershipHarness(workingSrc);
  h.ctx._active = true;
  const ok = await h.ctx.window.tmActivateForBake();
  h.ctx.window.tmDeactivateIfBakeOwned();
  const pass = ok === true && h.spy.activateCalls === 0 && h.spy.deactivateCalls === 0 && h.ctx._active === true;
  console.log('§ACTIVATE_SILENT G-B2 TM-already-on armed=' + ok + ' activateCalls=' + h.spy.activateCalls +
    ' deactivateCalls=' + h.spy.deactivateCalls + ' stillActive=' + h.ctx._active +
    ' → ' + (pass ? "left the user's real session untouched (PASS)" : 'FAIL — bake stole or closed a real TM session'));
  return pass;
}

(async function () {
  console.log('§ACTIVATE_SILENT W-ACTIVATE-SILENT — §CPE_BUILDUP_ACTIVATE_POPS_PANEL, two sources, one harness\n');
  const shipped = await gateA(shippedSrc, 'SHIPPED(origin/main)');
  console.log('');
  const fixed = await gateA(workingSrc, 'FIXED(working-tree)');
  console.log('');
  const b1 = await gateB();
  const b2 = await gateB2();

  // RED control vs origin/main: informational only, NOT a verdict gate. This fix (bim-ootb #1510)
  // is now itself part of origin/main, so "shipped still reproduces the bug" is permanently
  // unsatisfiable from the day this merged — that's the fix being live, not the witness going
  // blind. Same phenomenon already documented for the sibling witness_cpe_buildup_arm_gate.js in
  // bim-compiler prompts/CINEMA_PATH_EDITOR.md. The real, permanent regression test is `fixed`
  // below, which re-derives the panel-call contract from the CURRENT source every run regardless
  // of what origin/main contains.
  const redReproducedHistorically = shipped.realPlay === true && shipped.silent === false;
  console.log('\n§ACTIVATE_SILENT_RESULT vs-origin-main=' + (redReproducedHistorically
    ? 'origin/main still lacks the fix (unexpected post-merge — worth a look)'
    : 'origin/main already carries this fix (expected once #1510 merged — not a witness failure)'));
  const green = fixed.realPlay && fixed.silent && b1 && b2;
  console.log('§ACTIVATE_SILENT_RESULT green=' + (green ? 'all gates pass on the fix' : 'FIX INCOMPLETE') +
    ' (realPlay=' + fixed.realPlay + ' silent=' + fixed.silent + ' ownershipOn=' + b1 + ' ownershipAlreadyOn=' + b2 + ')');
  console.log('§ACTIVATE_SILENT_VERDICT ' + (green ? 'GREEN — contract holds on the working tree' : 'RED — see gates above'));
  process.exit(green ? 0 : 1);
})();
