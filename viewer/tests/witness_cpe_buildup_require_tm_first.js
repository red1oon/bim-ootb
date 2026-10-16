#!/usr/bin/env node
// witness_cpe_buildup_require_tm_first.js — W-REQUIRE-TM-FIRST
// Implementing bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REQUIRE_TM_FIRST
//
// THE ISSUE THIS WITNESS PROVES OR DISPROVES:
//   Before this fix, Alt+C's bake (tmActivateForBake -> activate(true) -> _activateAsync) would
//   silently GENERATE the building's first-ever 4D schedule if none existed yet — the user's own
//   ruling was "no auto JSON outside TM": the first schedule for a building must come from a real
//   Time Machine open, where the user can actually see the buildup, never manufactured on the fly
//   by the movie button. window.tmHasExistingSchedule() is the read-only gate cinema_maxq now
//   checks BEFORE ever calling tmActivateForBake — it must say NO when nothing has been generated
//   yet (cache empty, kernel_ops has no ELEMENT_PLACE rows) and YES once a real schedule exists,
//   from either source, without EVER calling activate()/generating anything itself.
//
//   A witness that only checks "returns a boolean" would PASS on a version that always returns
//   true (or always false) — the assertion here is that the SAME function returns different
//   answers for 5 real states, and never touches activate/cacheDel/cachePut/db.run (proving it is
//   truly read-only, not a disguised generate-and-check).
//
// HOW IT FALSIFIES: runs against `origin/main` (shipped — has tmActivateForBake but no
// tmHasExistingSchedule at all, so `typeof` must read 'undefined' — the RED control) and the
// working tree (must exist and answer all 5 gates correctly).
//
// Run (from the repo root): node witness_cpe_buildup_require_tm_first.js
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

const PLACE = (guid, t) => ({ output_guid: guid, input_guids: [], start_ts: t, end_ts: t + 86400000, op_type: 'ELEMENT_PLACE' });
const NON_PLACE = { output_guid: null, input_guids: [], start_ts: 0, end_ts: 0, op_type: 'BUILDING_OPEN' };

function makeHarness(src, state) {
  const calls = { activate: 0, cacheDel: 0, cachePut: 0, dbRun: 0 };
  const ctx = {
    _ops: state.active ? state.activeOps : [],
    _active: !!state.active,
    console: { log: () => {}, warn: () => {} },
    activate: () => { calls.activate++; },
    cacheDel: () => { calls.cacheDel++; },
    cachePut: () => { calls.cachePut++; },
    cacheGet: (k) => Promise.resolve(state.cachedOps === undefined ? null : state.cachedOps),
    A: () => ({
      db: state.dbOps === undefined ? null : {
        exec: () => [{ values: state.dbOps.map(o => [1, o.start_ts, o.op_type,
          JSON.stringify({ _end_ts: o.end_ts }), JSON.stringify(o.input_guids), o.output_guid]) }],
        run: () => { calls.dbRun++; },
      },
    }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    slice(src, 'function loadOps()'),
    slice(src, 'window.tmHasExistingSchedule = function', true),
  ].join('\n'), ctx);
  return { ctx, calls };
}

async function runGates(src, label) {
  const probe = makeHarness(src, { active: false, cachedOps: null, dbOps: [] });
  const presentType = typeof probe.ctx.window.tmHasExistingSchedule;
  const out = { label, present: presentType === 'function' };
  console.log('§REQUIRE_TM_FIRST G-0 ' + label + ' tmHasExistingSchedule typeof=' + presentType +
    ' → ' + (out.present ? 'EXISTS (testable)' : 'MISSING'));
  if (!out.present) { out.g1 = out.g2 = out.g3 = out.g4 = out.g5 = false; return out; }

  const cases = [
    { name: 'G-1 nothing generated yet',        state: { active: false, cachedOps: null, dbOps: [] },                 want: false },
    { name: 'G-2 cache has a real schedule',     state: { active: false, cachedOps: [PLACE('g1', 1.7e12)], dbOps: [] }, want: true },
    { name: 'G-3 kernel_ops has a real schedule (cache empty)', state: { active: false, cachedOps: null, dbOps: [PLACE('g1', 1.7e12)] }, want: true },
    { name: 'G-4 only bookkeeping ops (no ELEMENT_PLACE) anywhere', state: { active: false, cachedOps: [NON_PLACE], dbOps: [NON_PLACE] }, want: false },
    { name: 'G-5 TM already active with real ops loaded', state: { active: true, activeOps: [PLACE('g1', 1.7e12)], cachedOps: null, dbOps: [] }, want: true },
  ];
  let idx = 1;
  for (const c of cases) {
    const h = makeHarness(src, c.state);
    let got = null, threw = null;
    try { got = await h.ctx.window.tmHasExistingSchedule(); } catch (e) { threw = e.message; }
    const pass = threw === null && got === c.want && h.calls.activate === 0 && h.calls.cacheDel === 0 &&
      h.calls.cachePut === 0 && h.calls.dbRun === 0;
    out['g' + idx] = pass;
    console.log('§REQUIRE_TM_FIRST ' + c.name + ' ' + label + ' got=' + got + ' want=' + c.want +
      ' sideEffects(activate=' + h.calls.activate + ' cacheDel=' + h.calls.cacheDel +
      ' cachePut=' + h.calls.cachePut + ' dbRun=' + h.calls.dbRun + ')' +
      (threw ? ' THREW=' + threw : '') + ' → ' + (pass ? 'PASS' : 'FAIL'));
    idx++;
  }
  return out;
}

(async function () {
  console.log('§REQUIRE_TM_FIRST W-REQUIRE-TM-FIRST — §CPE_BUILDUP_REQUIRE_TM_FIRST, two sources, one harness\n');
  const shipped = await runGates(shippedSrc, 'SHIPPED(origin/main)');
  console.log('');
  const fixed = await runGates(workingSrc, 'FIXED(working-tree)');

  const redReproduces = shipped.present === false;
  console.log('\n§REQUIRE_TM_FIRST_RESULT red=' + (redReproduces
    ? 'shipped has no tmHasExistingSchedule at all — a bake there cannot refuse before generating (the gap reproduces)'
    : 'WITNESS IS BLIND — shipped source unexpectedly already has this gate'));
  const green = fixed.present && fixed.g1 && fixed.g2 && fixed.g3 && fixed.g4 && fixed.g5;
  console.log('§REQUIRE_TM_FIRST_RESULT green=' + (green ? 'all gates pass on the fix' : 'FIX INCOMPLETE') +
    ' (present=' + fixed.present + ' g1=' + fixed.g1 + ' g2=' + fixed.g2 + ' g3=' + fixed.g3 +
    ' g4=' + fixed.g4 + ' g5=' + fixed.g5 + ')');
  const verdict = redReproduces && green;
  console.log('§REQUIRE_TM_FIRST_VERDICT ' + (verdict ? 'GREEN — falsifiable and fixed' : 'RED — see gates above'));
  process.exit(verdict ? 0 : 1);
})();
