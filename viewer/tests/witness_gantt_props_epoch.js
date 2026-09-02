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
// EXTENSION 2026-08-25 (bim-compiler prompts/WITNESS_INTERFACE_FRAMEWORK.md §7) — W-PE-5/6/7:
//   The house rule this whole file exists to gate is "anything user-facing reads `tasks`, never the
//   bar" (4D_GANTT_TM_REFACTOR.md "recurring bug classes" §(a) "Two clocks"). That rule had ALREADY
//   bitten twice (commitGanttDrag §S22, the typed panel above §S72) before this extension — both
//   fixes were scoped to the one function an incident happened to touch, never swept to every OTHER
//   function doing the identical `new Date(<internal clock>).toLocaleDateString/toISOString(...)`
//   thing. Live evidence the sweep below exists to close: a fresh HHS_Office_Federated load
//   (2026-08-25) printed `§TIME_MACHINE ON — 6881 ops, 43 days, project: 1/1/1970 → 2/12/1970` in
//   the SAME session `§4D_COVERAGE window=2026-08-25..2026-10-06` — the real 2026 dates existed one
//   layer over, `activate()`'s own status line just never read them. `updateStatus()`'s live scrubber
//   date label carries the identical unconverted read. Traced via source (fnBody, same as W-PE-1..4),
//   not a screenshot — no `new Date(op.start_ts|_cursor|_projectStart|_projectEnd)` was ever run to
//   confirm the epoch live; the point is these call sites read the SAME unconverted variables §S22/
//   §S72 already proved corrupt, independent of what a live run happens to show.
//   W-PE-5  updateStatus()'s scrubber date/time label does not format _cursor as an absolute date.
//   W-PE-6  activate()'s "§TIME_MACHINE ON" line does not format _projectStart/_projectEnd as dates.
//   W-PE-7  refoldSchedule()'s §TM_PINPOINT_JUMP/§TM_ORDER_JUMP diagnostics don't either (console-only,
//           lower severity, same violation — named so it can't hide behind "just a log line").
//   ⚠ THESE ARE EXPECTED RED TODAY — this extension is the witness FIRST, per this project's Spec-
//   First rule: it names the gap; the fix is a separate, deliberate pass, not bundled into this file.
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

// W-PE-5/6/7 — does `body` ever turn one of the TM's internal-clock variables into an absolute
// calendar date? Covers BOTH idioms actually used in this file: the direct chain
// (`new Date(_projectStart).toLocaleDateString()`) and assign-then-format
// (`var d = new Date(_cursor); ... d.toLocaleDateString()`), so this catches updateStatus()'s shape
// (the latter) as well as activate()'s (the former) — a regex tied to only one idiom would silently
// miss the other, the exact "population gap" this extension exists to close.
const CLOCK_VARS = '_cursor|_projectStart|_projectEnd|bar\\.startTs|bar\\.endTs|op\\.start_ts|op\\.end_ts|op2\\.start_ts';
const DATE_FMT_METHODS = 'toLocaleDateString|toLocaleTimeString|toLocaleString|toDateString|toISOString';
function clockFormattedAsDate(body) {
  const directRe = new RegExp('new Date\\((' + CLOCK_VARS + ')\\)\\s*\\.\\s*(' + DATE_FMT_METHODS + ')');
  if (directRe.test(body)) return true;
  const assignRe = new RegExp('\\b(?:var|let|const)\\s+(\\w+)\\s*=\\s*new Date\\((' + CLOCK_VARS + ')\\)', 'g');
  let m;
  while ((m = assignRe.exec(body))) {
    const varName = m[1];
    const useRe = new RegExp('\\b' + varName + '\\s*\\.\\s*(' + DATE_FMT_METHODS + ')');
    if (useRe.test(body)) return true;
  }
  return false;
}
// Around one console.log TAG — for the two diagnostics (§TM_PINPOINT_JUMP/§TM_ORDER_JUMP) that live
// inside anonymous `window.tmX = function(...) {...}` closures fnBody() can't brace-match by name
// (it only matches `function NAME(`). A window is enough since these are single console.log calls.
function clockFormattedNearTag(tag) {
  const idx = src.indexOf(tag);
  if (idx < 0) return { found: false, bad: false };
  return { found: true, bad: clockFormattedAsDate(src.slice(Math.max(0, idx - 400), idx + 400)) };
}

const updStatus = fnBody('updateStatus');
assert(updStatus.length > 0, 'W-PE-5-0 updateStatus found and brace-matched (' + updStatus.length + ' chars)');
assert(!clockFormattedAsDate(updStatus),
  'W-PE-5 updateStatus() does not format _cursor (the TM playback clock, near-1970 by construction, ' +
  'same clock §S22/§S72 already proved corrupt) as an absolute calendar date for the live scrubber label');

// activate(silent) is a thin async dispatcher (early-return guards, then
// `_activateAsync(...).then(...)`) — the "§TIME_MACHINE ON" line actually lives in
// _finishActivate(), which _activateAsync() calls once ops are ready. Checked directly (not
// assumed): fnBody('activate') is 3183 chars and ends at its `return;` before the async
// continuation; _finishActivate is the function whose body actually contains both
// "§TIME_MACHINE ON" occurrences (silent + non-silent).
const finishAct = fnBody('_finishActivate');
assert(finishAct.length > 0 && (finishAct.match(/§TIME_MACHINE ON/g) || []).length === 2,
  'W-PE-6-0 _finishActivate found, brace-matched, and contains both §TIME_MACHINE ON lines (' + finishAct.length + ' chars)');
assert(!clockFormattedAsDate(finishAct),
  'W-PE-6 _finishActivate()\'s "§TIME_MACHINE ON" line does not format _projectStart/_projectEnd as an ' +
  'absolute calendar date — same violation as W-PE-5, different function, same unswept population gap');

// §TM_PINPOINT_JUMP / §TM_ORDER_JUMP live inside anonymous `window.tmJumpToPhase = function(...)`/
// `window.tmJumpToOrder = function(...)` closures (doJump()), not named `function NAME(...)`
// declarations — fnBody('refoldSchedule') brace-matches a real but DIFFERENT, unrelated 10-line
// function; checked directly (its own content has neither tag). Anchored on 'built~...%' — the tag
// string itself also appears on an earlier, unrelated "skip=no-ops" line in the same closure, and
// indexOf() would silently anchor on THAT one instead (checked: it did, first draft of this check).
const pinpoint = clockFormattedNearTag("built~' + pct + '% (frozen on the item)");
const orderJump = clockFormattedNearTag("cost=' + Math.round(info.cost) + ' built~' + pct + '%'");
assert(pinpoint.found && orderJump.found,
  'W-PE-7-0 both §TM_PINPOINT_JUMP and §TM_ORDER_JUMP tags found in source');
assert(!pinpoint.bad,
  'W-PE-7a §TM_PINPOINT_JUMP does not format the internal clock (op.end_ts) as a date — console-only, ' +
  'but the identical violation, named so it cannot hide as "just a log line"');
assert(!orderJump.bad,
  'W-PE-7b §TM_ORDER_JUMP does not format the internal clock (_cursor) as a date either — same reason');

// EXTENSION 2026-08-25 (same day, follow-on) — W-PE-8: this is the fix for the W-PE-5/6/7 gap
// above, NOT a fifth display-site patch. `_disp[el.guid]` (from CpmSchedule.run, a pure relative
// CPM solver — verified by reading cpm_schedule.js end to end: zero references to baseMs/anchor
// anywhere) gets rescaled into its owning task's REAL window (`_cap.win[taskId]`, Date.parse() on
// the real `tasks.schedule_start/finish` — proven correct on 5 real buildings,
// WITNESS_INTERFACE_FRAMEWORK.md §3/§6) at the ONE place every element's placement is actually
// written to kernel_ops. This makes W-PE-5/6/7's residual pattern SAFE without touching any of the
// four display sites. Real numeric proof (real _cap data, not fabricated) lives in the sibling
// witness witness_tm_element_window_bind.js — this file only checks the mechanism is present and
// wired, matching its own "no fixtures, no DB" contract.
//
// REVISED same day — a hard per-element clamp (v1) fixed the epoch but broke distribution: every
// element's raw time was near-1970, so ALL of them clamped to the exact same boundary instant,
// found live (§GANTT_OPS_FIRST20 collapsed to 18 identical entries; §CROSSTASK_JUDGE_PARITY
// floating 14->89, windowBlocked=89). v2 (below) is a per-task PROPORTIONAL RESCALE — groups
// elements by real task, affine-maps each group's own raw min/max onto the real window, preserving
// relative order/spacing instead of collapsing outliers to a boundary.
const injectGantt = fnBody('injectGantt');
assert(injectGantt.length > 0 && /function _tmRescaleToTaskWindow\(guid, s\)/.test(injectGantt),
  'W-PE-8-0 injectGantt defines _tmRescaleToTaskWindow (found and brace-matched)');
assert(/var bound = _tmRescaleToTaskWindow\(el\.guid, s\);/.test(injectGantt) &&
       /s = bound;/.test(injectGantt) &&
       injectGantt.indexOf('_gStmt.run([s.start,') > injectGantt.indexOf('s = bound;'),
  'W-PE-8a every element write is routed through the rescale BEFORE the kernel_ops INSERT, not after ' +
  '(ordering checked directly — a rescale defined-but-unused would pass a naive presence check)');
assert(/if \(!_cap\) return s;/.test(injectGantt) && /if \(!win\) return s;/.test(injectGantt),
  'W-PE-8b the rescale has an explicit fallback for unresolvable elements — never invents a window, ' +
  'never silently drops prior behavior for an element with no real task');
assert(/var g = _winGroups\[taskId\];/.test(injectGantt) && /var scale = realSpan \/ rawSpan;/.test(injectGantt),
  'W-PE-8c the rescale is per-task-group and PROPORTIONAL (scale=realSpan/rawSpan), not a per-element ' +
  'hard clamp — the exact distinction between v1 (broke distribution) and v2 (this one)');

console.log('§PROPS_EPOCH_SUMMARY pass=' + pass + ' fail=' + fail);
if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
console.log('PASS — the typed panel reads and writes real calendar dates');
