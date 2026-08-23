#!/usr/bin/env node
// WITNESS — W-PROPS-EPOCH — §GANTT_PROPS (E7) must speak REAL calendar dates
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S72.
//
// ISSUE THIS PROVES OR DISPROVES:
//   bar.startTs / bar.endTs are the Time Machine's OWN internal playback clock — a kernel_ops-derived
//   day-offset solve that sits near 1970 by construction. tasks.schedule_start is a real calendar
//   date. §S22 established that confusing the two silently corrupts the schedule, and fixed
//   commitGanttDrag by reading the task's real dates out of `tasks` first.
//
//   The typed properties panel (E7) was never brought along. MEASURED live on Duplex before the fix,
//   through a real dblclick and a real Apply click:
//     §GANTT_PROPS_OPEN task=TASK_Substructure_T_FDN     → the Start input read 1970-01-01
//     §GANTT_EDIT_MOVE  task=TASK_Substructure_T_FDN start=1970-01-05 clamped=false cascaded=0
//     §GANTT_EDIT_PERSIST what=propsApply ok=true        → and §S70 cached the corrupted date
//   The task's real start was 2026-09-07. Typing into that panel moved the task 56 years.
//
//   W-PE-1  the panel's date inputs come from `tasks`, never from bar.startTs/bar.endTs.
//   W-PE-2  the apply path COMPARES against those same real dates (comparing against the TM clock
//           made "start changed, finish didn't" always true, routing a pure finish edit through
//           moveTaskCascade as if it were a move).
//   W-PE-3  no real dates → loud refusal, never an edit offered on invented values.
//   W-PE-4  the sibling paths that already got §S22 right are still right (regression guard).
//
// ⚠ Brace-matched, never a fixed slice window (the G-COH-6 false-negative class, §S65/§S71).
//
// Command: node viewer/tests/witness_gantt_props_epoch.js     (no fixtures, no DB, no browser)
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const src = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
function fnBody(name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) return '';
  let d = 0, open = false;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) return src.slice(idx, i + 1); }
  }
  return '';
}
console.log('── witness_gantt_props_epoch (§S72) ──');

const props = fnBody('openGanttProps');
assert(props.length > 0, 'W-PE-0 openGanttProps found and brace-matched (' + props.length + ' chars)');

// The two inputs the user types into.
const startInput = /id="tmp-s"[^+]*\+\s*([A-Za-z_$][\w$.()]*)/.exec(props);
const finishInput = /id="tmp-f"[^+]*\+\s*([A-Za-z_$][\w$.()]*)/.exec(props);
console.log('§PROPS_EPOCH_SOURCE start=' + (startInput ? startInput[1] : '?') + ' finish=' + (finishInput ? finishInput[1] : '?'));
assert(!!startInput && !/bar\.startTs/.test(startInput[1]),
  'W-PE-1a the Start input is NOT populated from bar.startTs (the TM playback clock) — it reads ' + (startInput ? startInput[1] : '?'));
assert(!!finishInput && !/bar\.endTs/.test(finishInput[1]),
  'W-PE-1b the Finish input is NOT populated from bar.endTs — it reads ' + (finishInput ? finishInput[1] : '?'));
assert(/SELECT schedule_start, schedule_finish FROM tasks WHERE task_id=\?/.test(props),
  'W-PE-1c it reads the task\'s REAL dates from `tasks` — the same source ScheduleAuthor itself edits');

// The apply comparison. `d(bar.startTs)` anywhere in the compare re-introduces the clock mismatch.
assert(!/s\s*!==\s*d\(bar\.startTs\)/.test(props),
  'W-PE-2a the apply path does not compare the typed start against the TM clock');
assert(!/f\s*===\s*d\(bar\.endTs\)/.test(props),
  'W-PE-2b nor the typed finish against it — that comparison decided move-vs-resize, so it silently mis-routed pure finish edits');
assert(/s\s*!==\s*realS/.test(props) && /f\s*===\s*realF/.test(props),
  'W-PE-2c it compares against the same real dates the inputs were populated with');

assert(/§GANTT_PROPS_REJECT reason=no_real_task_dates/.test(props),
  'W-PE-3 no real dates → LOUD refusal, never an edit offered on invented values (same shape as commitGanttDrag\'s no_real_task_snapshot)');

// Regression guard: the paths §S22 already fixed must still convert through tasksBefore.
const drag = fnBody('commitGanttDrag');
assert(/tasksBefore\[bar\.taskId\]/.test(drag) && /no_real_task_snapshot/.test(drag),
  'W-PE-4a commitGanttDrag still targets the task\'s real calendar position (§S22 intact)');
const retime = fnBody('retimeTaskElements');
assert(/§S22_EPOCH_FIX/.test(retime),
  'W-PE-4b retimeTaskElements still carries its §S22 clock translation');

console.log('§PROPS_EPOCH_SUMMARY pass=' + pass + ' fail=' + fail);
if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
console.log('PASS — the typed panel reads and writes real calendar dates');
