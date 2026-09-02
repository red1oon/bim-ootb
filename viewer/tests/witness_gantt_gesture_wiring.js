#!/usr/bin/env node
// WITNESS — W-GEST — the Gantt's four CANVAS GESTURES are wired, and their precedence is explicit
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S73.
//
// ISSUE THIS PROVES OR DISPROVES:
//   Four edit paths are reachable only through a pointer on the canvas — marquee multi-select +
//   en-bloc move (E5), link by dragging bar→bar (E3), unlink (E4), and the typed properties panel
//   opened by double-click (E7). Having no node witness, they accumulated three separate defects
//   that shipped: §S67 (two paths re-timed the model and never resynced the canvas), §S69 (five
//   paths could mutate the timeline mid-bake), §S72 (the typed panel wrote 1970 dates and cached
//   them). Every one was a MISSING CALL that a source gate would have caught the day it landed.
//
//   This is the cheap half — it runs in milliseconds and gates the wiring. The other half, that a
//   real pointer actually reaches these verbs, needs a browser and lives in
//   scripts/probe_gantt_gestures.js (which drives all four and reads back their § lines).
//
//   W-GEST-1  each gesture is bound, and calls its own verb.
//   W-GEST-2  PRECEDENCE: a pointerdown on a bar inside a multi-selection starts a GROUP drag, and
//             that branch is tested BEFORE the single-bar/link branches. This is the behaviour a
//             user sees as "marquee then drag moves the whole block" — and it is why the link
//             gesture is deliberately shadowed while a selection is live.
//   W-GEST-3  every gesture's verb carries the four things this lane had to add by hand: the bake
//             lock, the canvas resync, the CPM re-annotate and the persist.
//
// ⚠ Brace-matched, never a fixed slice window (the G-COH-6 false-negative class, §S65/§S71).
//
// Command: node viewer/tests/witness_gantt_gesture_wiring.js     (no fixtures, no DB, no browser)
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
console.log('── witness_gantt_gesture_wiring (§S73) ──');

// ── W-GEST-1: the bindings exist and reach their verbs.
const wire = fnBody('wireGanttResize') || src;   // the canvas handlers live in the drawer wiring
assert(/addEventListener\('dblclick'/.test(src), 'W-GEST-1a the canvas binds dblclick (the typed-panel gesture)');
assert(/openGanttProps\(hit\.bar\)/.test(src), 'W-GEST-1b dblclick opens the typed properties panel');
assert(/linkGanttBars\(d\.bar, drop\.bar\)/.test(src), 'W-GEST-1c a bar→bar drop calls linkGanttBars');
assert(/commitGanttGroupShift\(/.test(src), 'W-GEST-1d the group drag calls commitGanttGroupShift');
assert(/§GANTT_GROUP_SELECT count=/.test(src), 'W-GEST-1e the marquee reports its selection count (the only way a probe can see it)');
assert(/barsInRect\(/.test(src), 'W-GEST-1f the marquee resolves its rectangle through barsInRect (gated separately by witness_gantt_bars_in_rect.js)');

// The link gesture's own guard: a horizontal wobble during a move must not silently create an edge.
assert(/Math\.abs\(e\.clientY - d\.y0\) >= 14/.test(src),
  'W-GEST-1g link requires real vertical travel (>=14px) — "put these two in sequence", not drift during a move');

// The typed panel is gated by the same edit lock as the drag, and refuses loudly.
assert(/§GANTT_PROPS_REJECT reason=locked/.test(src),
  'W-GEST-1h dblclick on a LOCKED gantt refuses loudly instead of opening an editor that cannot commit');

// ── W-GEST-2: precedence. Group drag must be considered before the single-bar/link path.
const iGroup = src.indexOf('_groupDrag = {');
const iLink = src.indexOf('linkGanttBars(d.bar, drop.bar)');
const iSelCheck = src.indexOf('_ganttSelected[hit.bar.taskId] && Object.keys(_ganttSelected).length > 1');
console.log('§GANTT_GESTURE_PRECEDENCE selCheck=' + iSelCheck + ' groupDragStart=' + iGroup + ' linkDrop=' + iLink);
assert(iSelCheck > 0 && iGroup > 0 && iSelCheck < iGroup + 200 && iSelCheck < iLink,
  'W-GEST-2 a pointerdown on a bar that is part of a multi-selection starts the GROUP drag, checked BEFORE the ' +
  'single-bar/link path — this is why "marquee then drag" moves the block, and why link is shadowed while a selection is live');
assert(/§GANTT_GROUP_SELECT count=0 \(cleared\)/.test(src),
  'W-GEST-2b a near-zero marquee on empty canvas CLEARS the selection — the documented way back to the single-bar gestures');

// ── W-GEST-3: every canvas-gesture verb carries the four calls this lane had to add by hand.
const NEED = [
  ['commitGanttGroupShift', ['_tmEditLocked(', '_tmResyncAfterRetime(', '_tmAnnotateCpm(', '_tmPersistEdit(']],
  ['linkGanttBars',         ['_tmEditLocked(', '_tmResyncAfterRetime(', '_tmAnnotateCpm(', '_tmPersistEdit(']],
  ['openGanttProps',        ['_tmEditLocked(', '_tmResyncAfterRetime(', '_tmAnnotateCpm(', '_tmPersistEdit(']],
  ['commitGanttDrag',       ['_tmEditLocked(', '_tmResyncAfterRetime(', '_tmAnnotateCpm(', '_tmPersistEdit(']],
  ['rescheduleGanttAsap',   ['_tmEditLocked(', '_tmResyncAfterRetime(', '_tmAnnotateCpm(', '_tmPersistEdit(']]
];
NEED.forEach(function (spec) {
  const body = fnBody(spec[0]);
  const missing = spec[1].filter(c => body.indexOf(c) < 0);
  assert(body.length > 0 && missing.length === 0,
    'W-GEST-3 ' + spec[0] + ' carries bake-lock + resync + CPM re-annotate + persist' +
    (missing.length ? ' — MISSING ' + missing.join(', ') : ' (all 4)'));
});

// §S72 regression, cheap to keep here too: the typed panel must not read the TM playback clock.
const props = fnBody('openGanttProps');
assert(!/value="' \+ d\(bar\.startTs\)/.test(props),
  'W-GEST-3b the typed panel still reads real calendar dates, not bar.startTs (§S72 — it wrote 1970 dates)');

console.log('§GANTT_GESTURE_WIRING_SUMMARY pass=' + pass + ' fail=' + fail);
if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
console.log('PASS — all four canvas gestures wired, precedence explicit');
