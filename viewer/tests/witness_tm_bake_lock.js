#!/usr/bin/env node
/**
 * witness_tm_bake_lock.js — the Gantt refuses edits while the film is recording (§TM_BAKE_LOCK).
 *
 * Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S56 — Witness: W-TBL
 *
 * THE ISSUE EACH CHECK PROVES OR DISPROVES. The user's separation-of-concern rule is that the movie
 * bake PLAYS the Time Machine and nobody should edit the schedule while it records. Before this
 * change that rule existed only as discipline: cinema_maxq.js sets A._maxqActive and dlod_nav.js /
 * panels.js honour it, but time_machine.js — the thing being recorded — never read it, so a drag or
 * a re-generate mid-bake would mutate the timeline the recorder was mid-way through playing.
 *
 * These checks are RELATIVE, not absolute: each asserts that the edit verb DID NOT reach its engine
 * call while a flag is set, and DID reach it when no flag is set. A guard that refuses everything
 * would pass the first half and fail the second — that pairing is the point.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found in time_machine.js');
  let d = 0, i = idx, open = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) break; }
  }
  return src.slice(idx, i + 1);
}

// One sandbox per case: the verbs are sliced with the guard helper they call. ScheduleAuthor is a
// COUNTING STUB — reaching it is exactly what "the edit happened" means, so the count is the assert.
function run(flags) {
  const calls = { move: 0, materialize: 0, shiftSchedule: 0, shiftTasks: 0 };
  const logs = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: () => {} },
    Math: Math, Date: Date, setTimeout: () => {},
    document: { getElementById: () => null },
    window: {
      ScheduleAuthor: {
        moveTaskCascade: () => { calls.move++; return { moved: [] }; },
        materializeZones: () => { calls.materialize++; return { tasks: 0 }; },
        // §S69: the ruler shift and the group shift are edit paths too — same counting-stub
        // contract, reaching them is what "the edit happened" means.
        shiftSchedule: () => { calls.shiftSchedule++; return { ok: true, moved: [] }; },
        shiftTasks: () => { calls.shiftTasks++; return { ok: true, moved: [] }; }
      }
    },
    A: () => Object.assign({ db: { exec: () => [], run: () => {}, prepare: () => ({ step: () => false, free: () => {} }) },
                             activeBuilding: 'Hospital' }, flags)
  };
  // Module vars the verbs read AFTER the guard. Without these the idle case throws before reaching
  // ScheduleAuthor — which is how W-TBL-4b caught this stub being incomplete rather than the guard
  // being wrong. They are inputs to the code under test, not part of what is being asserted.
  sandbox._taskIndex = { scheduleId: 'SCH_AUTHORED', tasks: {}, byGuid: {} };
  sandbox._GANTT_CACHE_VERSION = 1;
  sandbox._ganttTasks = [];
  sandbox._ops = [];
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(
    sliceFn(tmSrc, '_tmBusyRecording') + '\n' +
    sliceFn(tmSrc, '_tmEditLocked') + '\n' +      // §S69: the refusal now lives in one helper
    sliceFn(tmSrc, 'commitGanttDrag') + '\n' +
    sliceFn(tmSrc, 'generateGanttSchedule') + '\n' +
    sliceFn(tmSrc, 'shiftGanttSchedule') + '\n' +
    sliceFn(tmSrc, 'commitGanttGroupShift') + '\n' +
    'this.__drag = commitGanttDrag; this.__gen = generateGanttSchedule; ' +
    'this.__shift = shiftGanttSchedule; this.__group = commitGanttGroupShift;', sandbox);

  // Each verb is driven independently and its throw caught: past the guard these paths run into
  // render/retime helpers this sandbox deliberately does not provide. That is fine and is not what
  // is being asserted — the counting stub has already recorded whether the ENGINE was reached,
  // which is the whole claim. A verb that never gets past the guard increments nothing.
  try { sandbox.__drag({ taskId: 'T1', storey: 'L1', phase: 'Architecture' }, 'move', 1); } catch (e) { logs.push('THREW ' + e.message); }
  try { sandbox.__gen(); } catch (e) { logs.push('THREW ' + e.message); }
  try { sandbox.__shift(3); } catch (e) { logs.push('THREW ' + e.message); }
  try { sandbox.__group(['T1'], 3); } catch (e) { logs.push('THREW ' + e.message); }
  return { calls, logs, locked: logs.filter(l => l.indexOf('§TM_BAKE_LOCK') === 0 || l.indexOf('§TM_BAKE_LOCK') > 0) };
}

console.log('── witness_tm_bake_lock (§S56 + §S69) ──');

// If the shared refusal helper is missing, every sandbox slice below throws an opaque ReferenceError
// and the run reads as infrastructure breakage rather than as the finding it is. Say it plainly and
// stop — this is what the witness reports when run against a tree predating §S69.
if (tmSrc.indexOf('function _tmEditLocked(') < 0) {
  assert(false, 'W-TBL-0c _tmEditLocked (the ONE refusal every edit path calls, §S69) is not defined in time_machine.js — ' +
    'the guard is still duplicated per-site, so any path that never got a copy can mutate the timeline mid-bake');
  console.log('§TM_BAKE_LOCK_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(1);
}

// W-TBL-0 — the guard reads the flags that already exist, not a new one it invented.
assert(tmSrc.indexOf('function _tmBusyRecording(') >= 0, 'W-TBL-0a _tmBusyRecording is defined in time_machine.js');
// Checks for a real READ/WRITE of a new flag, not the word — the guard's own comment explains why
// there is no _bakeActive, and an earlier version of this assert matched that comment and failed.
assert(!/app\._bakeActive|_bakeActive\s*=/.test(tmSrc),
  'W-TBL-0b no new _bakeActive flag was invented — the guard reuses the triple dlod_nav.js already names');

// W-TBL-1..3 — each recording flag independently refuses BOTH edit verbs.
for (const [flag, label] of [['_maxqActive', 'maxq_bake'], ['_cinemaOrbitActive', 'cinema_orbit'], ['_stillRefineActive', 'still_refine']]) {
  const r = run({ [flag]: true });
  const reached = r.calls.move + r.calls.materialize + r.calls.shiftSchedule + r.calls.shiftTasks;
  assert(reached === 0,
    'W-TBL-1 ' + flag + ': NO edit verb reached ScheduleAuthor (move=' + r.calls.move + ' materialize=' + r.calls.materialize +
    ' shiftSchedule=' + r.calls.shiftSchedule + ' shiftTasks=' + r.calls.shiftTasks + ')');
  assert(r.locked.length >= 4 && r.locked.some(l => l.indexOf(label) > 0),
    'W-TBL-2 ' + flag + ': every refusal is LOUD and names the reason (' + label + ', ' + r.locked.length + ' §TM_BAKE_LOCK lines)');
}

// W-TBL-4 — THE PAIRED CHECK. With nothing recording, the verbs must still work: a guard that
// refuses unconditionally would satisfy every assert above while silently disabling the feature.
const idle = run({});
assert(idle.locked.length === 0, 'W-TBL-4a idle: no §TM_BAKE_LOCK refusal fires when nothing is recording');
// What this asserts and what it deliberately does NOT: driving commitGanttDrag all the way into
// moveTaskCascade needs a real task snapshot in the db, i.e. a full fixture. The claim under test
// here is narrower and provable without one — that execution PASSES THE GUARD and continues into
// the verb's own logic, evidenced by the verb reaching its OWN downstream refusal. A guard that
// refused unconditionally would emit §TM_BAKE_LOCK and no downstream line at all, which is exactly
// what this distinguishes. Stated rather than dressed up as a completed edit.
const idleReachedBody = idle.logs.some(l => l.indexOf('§GANTT_DRAG_REJECT') >= 0) || idle.calls.move > 0;
assert(idleReachedBody,
  'W-TBL-4b idle: commitGanttDrag runs PAST the guard into its own logic (' +
  (idle.calls.move > 0 ? 'reached moveTaskCascade' : 'reached its own §GANTT_DRAG_REJECT') +
  ') — the guard did not disable editing');

// ── W-TBL-6 (§S69) — the RELATIVE pairing extended to the two newly-guarded verbs. Locked above
// proved they refuse; this proves they still work when nothing is recording. Without this half, a
// guard that refused unconditionally would pass everything above.
const shiftRan = idle.calls.shiftSchedule > 0 || idle.logs.some(l => l.indexOf('§TM_RULER_SHIFT_REJECT') >= 0);
const groupRan = idle.calls.shiftTasks > 0 || idle.logs.some(l => l.indexOf('§GANTT_GROUP_SHIFT_REJECT') >= 0);
assert(shiftRan, 'W-TBL-6a idle: shiftGanttSchedule runs PAST the guard into its own logic (' +
  (idle.calls.shiftSchedule > 0 ? 'reached SA.shiftSchedule' : 'reached its own reject') + ')');
assert(groupRan, 'W-TBL-6b idle: commitGanttGroupShift runs PAST the guard into its own logic (' +
  (idle.calls.shiftTasks > 0 ? 'reached SA.shiftTasks' : 'reached its own reject') + ')');

// ── W-TBL-5 (§S69) — THE GATE THAT KEEPS THE COUNT HONEST. Item 2 existed because two edit paths
// (linkGanttBars, openGanttProps) were added after §S56 and nobody re-typed the guard into them, and
// the note describing the gap said "2 of 5" when it was really 2 of 7. So do NOT hardcode a list:
// derive "this function mutates the timeline" from the code — it calls retimeTaskElements or one of
// the mutating engine verbs — and require every such function to be guarded. A path added next month
// is caught by construction.
function namedFns(text) {
  const out = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = text.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > 0) out.push({ name: m[1], start: m.index, end: end, body: text.slice(m.index, end) });
  }
  return out;
}
const FNS = namedFns(tmSrc);
const MUTATORS = ['retimeTaskElements(', '.moveTaskCascade(', '.shiftSchedule(', '.shiftTasks(',
                  '.rescheduleAsap(', '.materializeZones(', '.addDependency(', '.removeDependency('];
// Skip the wrappers that are not user-facing edit ENTRY points: the pre-materialize bootstrap runs
// before any film exists, and the helper/model builders below are called BY the guarded verbs.
// _materializeNativeSchedule is the ONLY name-based exemption, and W-TBL-5d below asserts the
// property that earns it rather than taking the name on trust.
const NOT_ENTRY = ['retimeTaskElements', '_tmEditLocked', 'buildGanttTasks', '_materializeNativeSchedule'];
const mutating = FNS.filter(f => !NOT_ENTRY.includes(f.name) &&
  MUTATORS.some(v => f.body.indexOf(v) >= 0) &&
  // the innermost named function only — an outer function containing a guarded inner one would
  // otherwise be reported as unguarded for its inner's verb call
  !FNS.some(g => g !== f && g.start > f.start && g.end < f.end && MUTATORS.some(v => g.body.indexOf(v) >= 0)));
const unguarded = mutating.filter(f => f.body.indexOf('_tmEditLocked(') < 0).map(f => f.name);
console.log('§TM_BAKE_LOCK_WIRING mutatingEntryPoints=' + mutating.length +
  ' [' + mutating.map(f => f.name).join(',') + '] unguarded=' + unguarded.length +
  (unguarded.length ? ' [' + unguarded.join(',') + ']' : ''));
assert(mutating.length >= 5, 'W-TBL-5a the derivation found the real edit paths (n=' + mutating.length +
  ') — a 0 here means the verb names changed and this gate went blind, not that everything is guarded');
assert(unguarded.length === 0, 'W-TBL-5 every timeline-mutating entry point calls _tmEditLocked() — ' +
  (unguarded.length ? 'UNGUARDED: ' + unguarded.join(', ') : 'all ' + mutating.length + ' guarded'));

// undoLastGanttEdit mutates by restoring `tasks` and `kernel_ops` rows DIRECTLY — it calls none of
// the engine verbs above, so the derivation cannot see it. Checked by name, same as W-CPM-1b.
const undoFn = FNS.find(f => f.name === 'undoLastGanttEdit');
assert(!!undoFn && undoFn.body.indexOf('_tmEditLocked(') >= 0,
  'W-TBL-5b undoLastGanttEdit is guarded too — an undo mutates the timeline exactly as much as the edit it reverses');

// _materializeNativeSchedule is exempt because it can only write a building's FIRST schedule — it
// returns early when one already exists, and a bake plays an existing schedule by definition. That
// early return IS the exemption, so it is asserted, not assumed.
const matFn = FNS.find(f => f.name === '_materializeNativeSchedule');
assert(!!matFn && /activeSchedule\s*\(/.test(matFn.body) && /if\s*\(act\)\s*return false/.test(matFn.body),
  'W-TBL-5d _materializeNativeSchedule still bails when a schedule already exists — the property that exempts it from the lock');

// setGanttBaseline is deliberately NOT guarded: it writes only the task_baseline snapshot table and
// touches no date and no kernel_ops row, so it cannot desync a recording. Asserted so the exemption
// is a decision on record rather than an oversight someone "fixes" later.
const blFn = FNS.find(f => f.name === 'setGanttBaseline');
assert(!!blFn && !MUTATORS.some(v => blFn.body.indexOf(v) >= 0),
  'W-TBL-5c setGanttBaseline still mutates nothing on the timeline — the reason it is exempt from the lock');

console.log('§TM_BAKE_LOCK_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
