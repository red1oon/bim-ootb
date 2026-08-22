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
  const calls = { move: 0, materialize: 0 };
  const logs = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: () => {} },
    Math: Math, Date: Date, setTimeout: () => {},
    document: { getElementById: () => null },
    window: {
      ScheduleAuthor: {
        moveTaskCascade: () => { calls.move++; return { moved: [] }; },
        materializeZones: () => { calls.materialize++; return { tasks: 0 }; }
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
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(
    sliceFn(tmSrc, '_tmBusyRecording') + '\n' +
    sliceFn(tmSrc, 'commitGanttDrag') + '\n' +
    sliceFn(tmSrc, 'generateGanttSchedule') + '\n' +
    'this.__drag = commitGanttDrag; this.__gen = generateGanttSchedule;', sandbox);

  try { sandbox.__drag({ taskId: 'T1', storey: 'L1', phase: 'Architecture' }, 'move', 1); } catch (e) { logs.push('THREW ' + e.message); }
  try { sandbox.__gen(); } catch (e) { logs.push('THREW ' + e.message); }
  return { calls, logs, locked: logs.filter(l => l.indexOf('§TM_BAKE_LOCK') === 0 || l.indexOf('§TM_BAKE_LOCK') > 0) };
}

console.log('── witness_tm_bake_lock (§S56) ──');

// W-TBL-0 — the guard reads the flags that already exist, not a new one it invented.
assert(tmSrc.indexOf('function _tmBusyRecording(') >= 0, 'W-TBL-0a _tmBusyRecording is defined in time_machine.js');
// Checks for a real READ/WRITE of a new flag, not the word — the guard's own comment explains why
// there is no _bakeActive, and an earlier version of this assert matched that comment and failed.
assert(!/app\._bakeActive|_bakeActive\s*=/.test(tmSrc),
  'W-TBL-0b no new _bakeActive flag was invented — the guard reuses the triple dlod_nav.js already names');

// W-TBL-1..3 — each recording flag independently refuses BOTH edit verbs.
for (const [flag, label] of [['_maxqActive', 'maxq_bake'], ['_cinemaOrbitActive', 'cinema_orbit'], ['_stillRefineActive', 'still_refine']]) {
  const r = run({ [flag]: true });
  assert(r.calls.move === 0 && r.calls.materialize === 0,
    'W-TBL-1 ' + flag + ': neither edit verb reached ScheduleAuthor (move=' + r.calls.move + ' materialize=' + r.calls.materialize + ')');
  assert(r.locked.length >= 2 && r.locked.some(l => l.indexOf(label) > 0),
    'W-TBL-2 ' + flag + ': both refusals are LOUD and name the reason (' + label + ', ' + r.locked.length + ' §TM_BAKE_LOCK lines)');
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

console.log('§TM_BAKE_LOCK_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
