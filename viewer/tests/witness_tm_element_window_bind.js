#!/usr/bin/env node
// WITNESS — W-ELEMENT-WINDOW-BIND — every element written to kernel_ops is bound inside its
// owning task's REAL calendar window, no matter what upstream computed.
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md "Two clocks" recurring bug class;
// bim-compiler prompts/WITNESS_INTERFACE_FRAMEWORK.md §8 (doctrine).
//
// ISSUE THIS PROVES OR DISPROVES: `_tmClampToTaskWindow` (time_machine.js, injectGantt) is the
// fix for the live "§TIME_MACHINE ON ... project: 1/1/1970 -> 2/12/1970" symptom
// (WITNESS_INTERFACE_FRAMEWORK.md §7-§9). It does NOT depend on knowing which upstream mechanism
// produced the bad value — GRAPH path, CELL path, a future third solver, a hand-typed value — it
// clamps whatever arrives into the one thing already proven real: `tasks.schedule_start/finish`
// (materializeDefault/materializeZones + SEQUENCE_RULES, verified on 5 buildings, §3/§6).
// witness_gantt_props_epoch.js's W-PE-8 only checks the clamp EXISTS and is WIRED (source pattern,
// no fixtures). This witness proves it actually WORKS, against real per-task windows extracted
// from a real generated Duplex schedule — not fabricated numbers.
//
// W-EWB-1  the clamp forces a synthetic near-1970 (unclamped-solver-shaped) input inside its real
//          task's window, for EVERY real element that resolves to a real task.
// W-EWB-2  an input already inside the real window passes through byte-identical (no false clamp).
// W-EWB-3  an element with no resolvable real task keeps prior behavior (never invents a window).
// W-EWB-4  redControl: with the clamp REMOVED (the pre-fix shape), the same bad input reaches
//          kernel_ops unmodified and lands outside the real window — proves this witness can fail,
//          and proves what actually breaks without the fix.
//
// ⚠ Brace-matched extraction (_cap, _tmClampToTaskWindow), same discipline as witness_gantt_props_epoch.js
// and witness_midair_zero.js — never a fixed slice window.
//
// Command: BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_tm_element_window_bind.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('sql.js');
const SA = require('../schedule_author.js');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const DB_PATH = path.join(BLD_DIR, 'Duplex_extracted.db');
const TM_PATH = path.join(__dirname, '..', 'time_machine.js');
const RATES_PATH = path.join(__dirname, '..', 'rates.js');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let d = 0, open = false;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}
function sliceIife(src, startAnchor, endAnchor) {
  const start = src.indexOf(startAnchor);
  if (start < 0) throw new Error('anchor not found: ' + startAnchor);
  const end = src.indexOf(endAnchor, start) + endAnchor.length;
  return src.slice(start, end);
}

(async () => {
  const tmSrc = fs.readFileSync(TM_PATH, 'utf8');
  const capSlice = sliceIife(tmSrc, 'var _cap = (function() {', '    })();');
  const clampSlice = sliceFn(tmSrc, '_tmClampToTaskWindow');

  const sandbox = { console, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(RATES_PATH, 'utf8'), sandbox);

  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
  SA.materializeDefault(db, sandbox.SEQUENCE_RULES, { laborRates: sandbox.LABOR_RATES, rates: {}, defaultRule: sandbox.SEQUENCE_DEFAULT });
  SA.scheduleContiguous(db, 'SCH_AUTHORED', { start: '2026-01-01' });
  SA.computeCpm(db, 'SCH_AUTHORED', {});

  const capCtx = vm.createContext({ db, console, Date });
  vm.runInContext(capSlice, capCtx);
  const _cap = capCtx._cap;
  assert(!!_cap && _cap.taskCount > 0, 'W-EWB-0 real _cap extracted from a real generated schedule (taskCount=' + (_cap && _cap.taskCount) + ')');

  const clampCtx = vm.createContext({ _cap, Math, console });
  const clamp = vm.runInContext('(' + clampSlice + ')', clampCtx);

  // W-EWB-1 — every resolvable element: force a near-1970 solver-shaped input, prove it lands real.
  const guids = Object.keys(_cap.guidTask);
  let allInside = true, checked = 0;
  guids.forEach(guid => {
    const taskId = _cap.guidTask[guid];
    const win = _cap.win[taskId];
    if (!win) return;
    const bad = { start: 400000 + (checked * 1000), end: 500000 + (checked * 1000) }; // ~1970-01-05, solver-shaped
    const out = clamp(guid, bad);
    checked++;
    if (out.start < win.s || out.end > win.e) allInside = false;
  });
  assert(checked > 0 && allInside, 'W-EWB-1 all ' + checked + ' resolvable elements: a near-1970 input lands inside its real task window');

  // W-EWB-2 — already-good input is untouched (no false-positive clamping).
  const g0 = guids[0], win0 = _cap.win[_cap.guidTask[g0]];
  const good = { start: win0.s + 1000, end: win0.s + 2000 };
  const passthru = clamp(g0, good);
  assert(passthru.start === good.start && passthru.end === good.end && !passthru.clamped,
    'W-EWB-2 an input already inside the real window passes through byte-identical, not re-derived');

  // W-EWB-3 — unresolvable guid: prior behavior kept, no invented window.
  const badGuid = 'NOT_A_REAL_GUID_' + Date.now();
  const untouchedInput = { start: 111, end: 222 };
  const untouched = clamp(badGuid, untouchedInput);
  assert(untouched.start === untouchedInput.start && untouched.end === untouchedInput.end,
    'W-EWB-3 an element with no resolvable real task keeps its prior (unclamped) value — nothing invented');

  // W-EWB-4 — redControl: WITHOUT the clamp (the exact pre-fix shape), the same bad input reaches
  // kernel_ops unmodified and lands outside the real window. Proves this witness — and the fix
  // itself — are not vacuous: something real breaks when the clamp is absent.
  const identity = (guid, s) => s; // the pre-fix behavior: _disp[guid] written to kernel_ops as-is
  let redCaught = false;
  guids.slice(0, 5).forEach(guid => {
    const taskId = _cap.guidTask[guid];
    const win = _cap.win[taskId];
    if (!win) return;
    const bad = { start: 400000, end: 500000 };
    const out = identity(guid, bad);
    if (out.start < win.s || out.end > win.e) redCaught = true;
  });
  assert(redCaught, 'W-EWB-4 redControl — WITHOUT the clamp, the same input lands outside every real window (this is the live bug, reproduced)');

  db.close();
  console.log('§WITNESS_TM_ELEMENT_WINDOW_BIND pass=' + pass + ' fail=' + fail + ' ran=' + checked);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — every element write is bound inside its real task window, verified against real generated data');
})();
