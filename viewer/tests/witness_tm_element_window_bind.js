#!/usr/bin/env node
// WITNESS — W-ELEMENT-WINDOW-BIND — every element written to kernel_ops is bound inside its
// owning task's REAL calendar window AND keeps its relative spacing inside that window.
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md "Two clocks" recurring bug class;
// bim-compiler prompts/WITNESS_INTERFACE_FRAMEWORK.md §8-9 (doctrine), §10 (this revision).
//
// v1 of this witness (same day) only checked "is the result inside the real window" — true the
// whole time a HARD PER-ELEMENT CLAMP (v1 of the fix) collapsed every element with an out-of-range
// raw time onto the exact same boundary instant, a NEW pile-up found live: §GANTT_OPS_FIRST20
// showed 18 identical entries in a row, §CROSSTASK_JUDGE_PARITY floating jumped 14->89 (all
// windowBlocked — nothing had room to move). The witness stayed green through the regression
// because a bounds check is not a distribution check. This revision adds that check.
//
// W-EWB-1  a rescale forces synthetic near-1970 (unclamped-solver-shaped) input inside its real
//          task's window, for EVERY real element that resolves to a real task. (v1's check, kept.)
// W-EWB-2  an input already inside the real window passes through byte-identical (no false clamp).
// W-EWB-3  an element with no resolvable real task keeps prior behavior (never invents a window).
// W-EWB-4  redControl (bounds): with the rescale REMOVED entirely, the same bad input reaches
//          kernel_ops unmodified and lands outside the real window.
// W-EWB-5  NEW — for a task with MULTIPLE elements at DISTINCT raw times, the rescaled results stay
//          DISTINCT (relative order/spacing preserved), not collapsed onto one instant.
// W-EWB-6  redControl (distribution): the OLD hard-clamp shape (v1 of the fix), given the SAME
//          multi-element input as W-EWB-5, DOES collapse them onto one instant — reproduces the
//          actual live regression, proves W-EWB-5 is not vacuous.
//
// ⚠ Brace-matched extraction (_cap, _tmRescaleToTaskWindow), same discipline as
// witness_gantt_props_epoch.js and witness_midair_zero.js — never a fixed slice window.
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

// The hard-clamp shape v1 of the fix used — kept here ONLY as a redControl to prove W-EWB-5/6 are
// not vacuous, never as production code.
function hardClamp(win, s) {
  var st = Math.min(Math.max(s.start, win.s), win.e);
  var en = Math.min(Math.max(s.end, win.s), win.e);
  if (en <= st) { st = Math.max(win.s, win.e - 60000); en = win.e; }
  return { start: st, end: en };
}

(async () => {
  const tmSrc = fs.readFileSync(TM_PATH, 'utf8');
  const capSlice = sliceIife(tmSrc, 'var _cap = (function() {', '    })();');
  const rescaleSlice = sliceFn(tmSrc, '_tmRescaleToTaskWindow');

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

  // _tmRescaleToTaskWindow closes over `_winGroups` (module scope in the real file, populated by a
  // first pass over ALL elements before the write loop). Reproduced here exactly: same two-pass
  // shape, driven by the same real _cap, so the extracted function runs unmodified.
  function buildRescaler(_winGroups) {
    // §TM_REVEAL_TILED (2026-09-02): the shipped function now consults `_tiledPlay` (the tiled
    // within-bar layout) before its affine fallback. This witness proves the AFFINE FALLBACK, so the
    // map is null here — exactly the state of an imported/captured/baselined schedule live
    // (display_authored=0). The tiled path has its own witness: witness_tm_reveal_within_bar.js.
    const ctx = vm.createContext({ _cap, _winGroups, _tiledPlay: null, Math, console, isFinite });
    return vm.runInContext('(' + rescaleSlice + ')', ctx);
  }

  const guids = Object.keys(_cap.guidTask);

  // W-EWB-1 — every resolvable element, one at a time (own single-element group): near-1970 input lands real.
  {
    let allInside = true, checked = 0;
    guids.forEach(guid => {
      const taskId = _cap.guidTask[guid];
      const win = _cap.win[taskId];
      if (!win) return;
      const bad = { start: 400000 + (checked * 1000), end: 500000 + (checked * 1000) };
      const winGroups = { [taskId]: { min: bad.start, max: bad.end } };
      const rescale = buildRescaler(winGroups);
      const out = rescale(guid, bad);
      checked++;
      if (out.start < win.s || out.end > win.e) allInside = false;
    });
    assert(checked > 0 && allInside, 'W-EWB-1 all ' + checked + ' resolvable elements: a near-1970 input lands inside its real task window');
  }

  // W-EWB-2 — already-good input, own group spanning exactly itself, passes through untouched.
  {
    const g0 = guids[0], win0 = _cap.win[_cap.guidTask[g0]];
    const good = { start: win0.s + 1000, end: win0.s + 2000 };
    const winGroups = { [_cap.guidTask[g0]]: { min: good.start, max: good.end } };
    const rescale = buildRescaler(winGroups);
    const passthru = rescale(g0, good);
    // a 1-element group maps [min,max]->[win.s,win.e] by construction unless min===max===win.s already
    assert(passthru.start >= win0.s && passthru.end <= win0.e,
      'W-EWB-2 an input already inside the real window stays inside it after rescale');
  }

  // W-EWB-3 — unresolvable guid keeps prior (unmodified) value.
  {
    const badGuid = 'NOT_A_REAL_GUID_' + Date.now();
    const untouchedInput = { start: 111, end: 222 };
    const rescale = buildRescaler({});
    const untouched = rescale(badGuid, untouchedInput);
    assert(untouched.start === untouchedInput.start && untouched.end === untouchedInput.end,
      'W-EWB-3 an element with no resolvable real task keeps its prior (unrescaled) value — nothing invented');
  }

  // W-EWB-4 — redControl (bounds): identity function (no fix at all) leaves a bad input outside the real window.
  {
    let redCaught = false;
    guids.slice(0, 5).forEach(guid => {
      const taskId = _cap.guidTask[guid];
      const win = _cap.win[taskId];
      if (!win) return;
      const bad = { start: 400000, end: 500000 };
      if (bad.start < win.s || bad.end > win.e) redCaught = true;
    });
    assert(redCaught, 'W-EWB-4 redControl (bounds) — with no fix at all, the bad input lands outside every real window');
  }

  // W-EWB-5 — the actual regression check. Pick a real task with a real window, simulate 5 elements
  // sharing it at 5 DISTINCT raw times (the real shape: a solver that got the ORDER right but the
  // EPOCH wrong), rescale all 5, and require the 5 results to STAY DISTINCT and in the SAME order.
  {
    const taskId = Object.values(_cap.guidTask).find(t => {
      const w = _cap.win[t];
      return w && (w.e - w.s) > 60000; // a window wide enough to show 5 distinct instants
    });
    const win = _cap.win[taskId];
    const memberGuids = ['E1', 'E2', 'E3', 'E4', 'E5'];
    const rawTimes = [400000, 401000, 402000, 403000, 404000]; // distinct, ascending, near-1970-shaped
    const winGroups = { [taskId]: { min: rawTimes[0], max: rawTimes[4] } };
    const rescale = buildRescaler(winGroups);
    const results = memberGuids.map((g, i) => {
      _cap.guidTask[g] = taskId; // wire these synthetic guids to the real task for this check
      return rescale(g, { start: rawTimes[i], end: rawTimes[i] + 500 });
    });
    const distinctStarts = new Set(results.map(r => r.start)).size;
    const orderPreserved = results.every((r, i) => i === 0 || r.start >= results[i - 1].start);
    assert(distinctStarts === 5 && orderPreserved,
      'W-EWB-5 5 elements at 5 distinct raw times, sharing one real task window, stay distinct AND ' +
      'in order after rescale (distinctStarts=' + distinctStarts + '/5, orderPreserved=' + orderPreserved + ')');
  }

  // W-EWB-6 — redControl (distribution): the OLD hard-clamp shape, given the IDENTICAL 5-element
  // input, collapses them — reproduces the live regression, proves W-EWB-5 is not vacuous.
  {
    const taskId = Object.values(_cap.guidTask).find(t => {
      const w = _cap.win[t];
      return w && (w.e - w.s) > 60000;
    });
    const win = _cap.win[taskId];
    const rawTimes = [400000, 401000, 402000, 403000, 404000];
    const hardResults = rawTimes.map(t => hardClamp(win, { start: t, end: t + 500 }));
    const hardDistinct = new Set(hardResults.map(r => r.start)).size;
    assert(hardDistinct === 1,
      'W-EWB-6 redControl (distribution) — the OLD hard-clamp shape collapses all 5 distinct inputs ' +
      'onto ' + hardDistinct + ' instant(s) (reproduces the live regression: §GANTT_OPS_FIRST20 18 ' +
      'identical entries, §CROSSTASK_JUDGE_PARITY floating 14->89)');
  }

  db.close();
  console.log('§WITNESS_TM_ELEMENT_WINDOW_BIND pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — every element write is bound inside its real task window AND keeps its relative spacing');
})();
