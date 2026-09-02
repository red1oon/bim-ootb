#!/usr/bin/env node
// witness_crosstask_judge_parity.js — §CROSSTASK_JUDGE_PARITY (2026-08-16, bim-compiler
// prompts/4D_SCHEDULE_PERFECTION.md).
//
// ISSUE this witness proves/disproves: the captured-path judge (_contactGraph, class-blind and
// pool-blind — the 🔓→🔒 lock rule) flags floating that _ogSupportSweep can never repair (its
// carrier pool is narrower than the judge's contact relation), so 3090 elements sat permanently
// floating across the 7 shipped buildings. _cjpJudgeParity closes that mismatch with the
// §MIDAIR_REPAIR weakest rule, window-bounded. The 2026-08-13 unbounded _midairRepair swap was
// REJECTED for 100-300d window-crossing desync — so the load-bearing claims here are the bounds,
// not just the improvement:
//
//   W-CJP-1  WIRING: injectGantt's captured path actually calls _cjpJudgeParity(_allScheduled,
//            _cap.win) after _ogSupportSweep (§DOOR_WINDOW_HOST_WALL's lesson — an unwired gate
//            is silently a no-op).
//   W-CJP-2  THE BAR: on a real building schedule with judge-rule floating present, the pass
//            strictly reduces it (numbers per building live in probe_captured_floating.js §EXP4 —
//            measured 2026-08-16: 3090 -> 656 across the 7 buildings).
//   W-CJP-3  WINDOW SAFETY (the anti-desync contract): every element the pass MOVES ends inside its
//            own task's authored window, WITHIN ONE DAY (§CJP_DAY_ROUNDING_TOL, 2026-08-16 —
//            the window's own end is itself rounded to a whole day by materializeZones, so a push
//            landing inside that same calendar day is not a desync, it's honouring the window's own
//            rounding). MEASURED: this closed 90% of Clinic's residual floating (91->9) and the
//            fleet total 265->133 (-49.8%), zero regressions on any of the 7 buildings — see
//            probe_captured_floating.js §CJP_DECOMP_EXP8. Never more than one day, ever — the
//            2026-08-13 unbounded _midairRepair swap was REJECTED for 100-300d desync; this is
//            bounded by construction to the window's own rounding quantum, not an open-ended push.
//   W-CJP-4  MONOTONE: zero elements start EARLIER after the pass (§TIER_SERIAL W-TS-3's property).
//   W-CJP-5  JUDGE UNTOUCHED: orphans/grounded counts byte-identical — the pass repairs against
//            the judge, it never weakens the judge.
//   W-CJP-6  NOT VACUOUS + HONEST RESIDUAL (synthetic, no DB): a reachable violation is repaired
//            to exactly its first contact's start; a WINDOW_BLOCKED violation and an
//            already-out-of-window element are left byte-identical (honestly floating), never
//            pushed to a fabricated in-window date.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_crosstask_judge_parity.js  (from viewer/)
// Read the § log lines, not the exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const SupportSweep = require(path.join(__dirname, '..', 'support_sweep.js'));   // §S58: required, never sliced
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() { console.log('\n§CJP_WITNESS_SUMMARY pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0); }

function sliceFn(src, name) {
  const idx = src.lastIndexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
function buildFn(srcParts, ret) {
  return new Function('ScheduleGate', srcParts.join('\n') + '\nreturn ' + ret + ';')(ScheduleGate);
}
const _contactGraph = SupportSweep.contactGraph;        // §S58: the real module, not a text slice
const _designatedSupport = SupportSweep.designatedSupport;  // §S58
const _cjpJudgeParity = SupportSweep.cjpJudgeParity;    // §S58 (the module resolves its own contactGraph)

// census — directional (§MIDAIR_DIRECTIONAL, 4D_GANTT_TM_REFACTOR.md, 2026-08-18). NOTE: the
// specific counts cited in this file's header (3090->656, 265->133, Clinic 91->9) were measured
// against the OLD symmetric judge and are now stale baselines, not re-verified here — this fix's
// scope is making the judge consistent everywhere, not re-deriving every historical figure. The
// witness's own PASS/FAIL assertions (W-CJP-2 strictly-reduces, W-CJP-4 monotone, W-CJP-5
// byte-identical) are relative comparisons, not hardcoded expected numbers, so they remain valid.
function census(items) {
  const G = _contactGraph(items);
  const des = _designatedSupport(items, G);
  let midair = 0;
  for (let i = 0; i < items.length; i++) {
    const sIdx = des[i]; if (sIdx < 0) continue;
    if (items[sIdx].s > items[i].s + 1) midair++;
  }
  return { midair, orphans: G.orphans, grounded: G.groundedN };
}
function windowCounts(items, taskWin) {
  let inW = 0, outW = 0;
  items.forEach(it => {
    const w = taskWin[it.task]; if (!w) return;
    if (it.s >= w.s && it.e <= w.e) inW++; else outW++;
  });
  return { inW, outW };
}

// ── W-CJP-1: wiring — the captured path calls the pass right after _ogSupportSweep ────────────
console.log('W-CJP-1 wiring');
const sweepCall = tmSrc.indexOf('_ogSupportSweep(_allScheduled, _cap.win)');
const parityCall = tmSrc.indexOf('_cjpJudgeParity(_allScheduled, _cap.win)');
assert(sweepCall >= 0 && parityCall > sweepCall && (parityCall - sweepCall) < 300,
  'injectGantt captured path calls _cjpJudgeParity(_allScheduled, _cap.win) immediately after _ogSupportSweep');

// ── W-CJP-6: synthetic contract (no DB) — vacuousness + honest residual ───────────────────────
console.log('W-CJP-6 synthetic contract');
const DAY = 86400000;
function mk(guid, s, e, bz, tz, task) {
  return { guid, s: s * DAY, e: e * DAY, bz, tz, x0: 0, x1: 2, y0: 0, y1: 2, cls: 'IfcSlab', seq: 5, task };
}
{
  // carrier C (day 10) with five dependents resting on it, each floating (start day 0):
  //   R in a window wide enough to absorb the push        -> must land exactly on C.s
  //   B in a window that ends before C.s + dur            -> WINDOW_BLOCKED, byte-identical
  //   O already outside its own window                    -> byte-identical
  //   T in a window whose overrun is INSIDE the 1-day §CJP_DAY_ROUNDING_TOL -> gets pushed anyway
  //   X in a window whose overrun EXCEEDS the 1-day tolerance             -> still WINDOW_BLOCKED
  const C = mk('C', 10, 11, 0, 3, 'TC');
  const R = mk('R', 0, 1, 3, 4, 'TR');
  const B = mk('B', 0, 1, 3, 4, 'TB'); B.x0 = 10; B.x1 = 12; C.x1 = 12; // widen C to touch B too
  const O = mk('O', 0, 1, 3, 4, 'TO'); O.y0 = 10; O.y1 = 12; C.y1 = 12; // widen C to touch O too
  const T = mk('T', 0, 1, 3, 4, 'TT'); T.x0 = 20; T.x1 = 22; C.x1 = 22; // widen C to touch T too
  const X = mk('X', 0, 1, 3, 4, 'TX'); X.y0 = 20; X.y1 = 22; C.y1 = 22; // widen C to touch X too
  const taskWin = {
    TC: { s: 0, e: 100 * DAY },
    TR: { s: 0, e: 100 * DAY },
    TB: { s: 0, e: 5 * DAY },
    TO: { s: 5 * DAY, e: 100 * DAY },  // O.s=0 sits BEFORE its window -> already-out
    TT: { s: 0, e: 10.5 * DAY },       // push would end at day 11, overrun 0.5d < 1d tol -> pushed
    TX: { s: 0, e: 8 * DAY }           // push would end at day 11, overrun 3d > 1d tol -> blocked
  };
  const items = [C, R, B, O, T, X];
  const before = census(items.map(o => Object.assign({}, o)));
  const r = _cjpJudgeParity(items, taskWin);
  assert(r.pushed >= 2, 'pass pushed at least the reachable + in-tolerance violations (pushed=' + r.pushed + ')');
  assert(R.s === C.s && R.e === R.s + 1 * DAY, 'reachable dependent lands exactly on first-contact start, duration preserved');
  assert(B.s === 0 && B.e === 1 * DAY, 'WINDOW_BLOCKED dependent left byte-identical (honest floating)');
  assert(O.s === 0 && O.e === 1 * DAY, 'already-out-of-window element left byte-identical');
  assert(C.s === 10 * DAY, 'carrier itself never moved');
  assert(T.s === C.s && T.e === T.s + 1 * DAY, '§CJP_DAY_ROUNDING_TOL: in-tolerance overrun (0.5d) IS pushed, lands on first-contact start');
  assert(T.e - taskWin.TT.e === 0.5 * DAY, 'in-tolerance push overruns its window by exactly the real 0.5d gap (never more)');
  assert(X.s === 0 && X.e === 1 * DAY, 'over-tolerance overrun (3d > 1d) still WINDOW_BLOCKED, byte-identical');
  const after = census(items.map(o => Object.assign({}, o)));
  assert(before.midair === 5 && after.midair === 3,
    'census: 5 floating before, reachable + in-tolerance repaired, B/O/X honestly remain (after=' + after.midair + ')');
}

// ── W-CJP-2..5: real buildings, full generative schedule + real task windows ──────────────────
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = (process.env.CJP_BUILDINGS || 'Duplex_extracted,HHS_Office_Federated_extracted').split(',');
function _slug(name) { return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();

  for (const B of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, B + '.db');
    if (!fs.existsSync(dbPath)) { console.log('  SKIP ' + B + ' (no DB)'); continue; }
    console.log('W-CJP-2..5 ' + B);
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const rawElements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
      laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
      defaultRule: RATES.SEQUENCE_DEFAULT
    });
    const elements = rawElements.map(it => Object.assign({}, it, { bz: it.base_z, tz: it.top_z }));
    const maxCrews = {};
    for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;
    const schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, 24);
    const rolled = ScheduleGate.deriveZones(elements, schedule);
    const minStart = Math.min.apply(null, rolled.zones.map(z => z.start));
    const zoneTaskId = {}, taskWin = {};
    rolled.zones.forEach(z => {
      const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
      zoneTaskId[z.id] = tid;
      const sDays = Math.round((z.start - minStart) / DAY);
      let eDays = Math.round((z.end - minStart) / DAY);
      if (eDays <= sDays) eDays = sDays + 1;
      taskWin[tid] = { s: minStart + sDays * DAY, e: minStart + eDays * DAY };
    });
    const items = elements.map(el => {
      const st = schedule[el.guid]; if (!st) return null;
      const zid = (el.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(el.storey);
      return { guid: el.guid, s: st.start, e: st.end, bz: el.bz, tz: el.tz,
        x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, cls: el.cls, seq: el.seq, task: zoneTaskId[zid] };
    }).filter(Boolean);

    const before = census(items.map(o => Object.assign({}, o)));
    const winBefore = windowCounts(items, taskWin);
    const sBefore = {}; items.forEach(o => sBefore[o.guid] = o.s);
    const r = _cjpJudgeParity(items, taskWin);
    const after = census(items.map(o => Object.assign({}, o)));
    const winAfter = windowCounts(items, taskWin);
    console.log('  §CJP_WITNESS ' + B + ' floating ' + before.midair + ' -> ' + after.midair +
      ' pushed=' + r.pushed + ' inWindow ' + winBefore.inW + '->' + winAfter.inW);
    assert(before.midair === 0 || after.midair < before.midair,
      'W-CJP-2 floating strictly reduced (' + before.midair + ' -> ' + after.midair + ')');
    // §CJP_DAY_ROUNDING_TOL (2026-08-16): a moved element may now end up to ONE DAY past its
    // window's own (already day-rounded) end — desyncOut counts anything WORSE than that, the real
    // anti-desync bar. movedPastWindow (informational) reports how many pushes used the tolerance.
    const DAY_TOL = DAY;
    let desyncOut = 0, movedPastWindow = 0, earlier = 0;
    items.forEach(o => {
      if (o.s < sBefore[o.guid]) earlier++;
      if (o.s !== sBefore[o.guid]) {
        const w = taskWin[o.task];
        if (!w || o.s < w.s || o.e > w.e + DAY_TOL) desyncOut++;
        else if (o.e > w.e) movedPastWindow++;
      }
    });
    assert(desyncOut === 0,
      'W-CJP-3a every moved element ends within its window + 1-day rounding tolerance (desyncOut=' + desyncOut + ')');
    assert(winAfter.outW - winBefore.outW === movedPastWindow,
      'W-CJP-3b in/out-window count delta matches exactly the tolerance-zone pushes (' +
      winBefore.outW + '->' + winAfter.outW + ', movedPastWindow=' + movedPastWindow + ')');
    assert(earlier === 0, 'W-CJP-4 monotone — zero elements start earlier (earlier=' + earlier + ')');
    assert(before.orphans === after.orphans && before.grounded === after.grounded,
      'W-CJP-5 judge untouched — orphans/grounded byte-identical (' + after.orphans + '/' + after.grounded + ')');
  }
  finish();
}
main().catch(e => { console.error(e); process.exit(1); });
