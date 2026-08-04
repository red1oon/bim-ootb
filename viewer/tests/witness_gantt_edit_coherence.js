// witness_gantt_edit_coherence.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT W1.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   A Gantt bar's drawn span is derived from its ELEMENT ops (§GANTT_BAR_IDENTITY K0), while an edit
//   writes TASK dates (§GANTT_EDIT C1/C2). If an accepted edit moves the task but not its elements,
//   the drawer says one thing and the 3D movie plays another — the exact class of divergence PR #1162
//   had to close on the CPM side. W1 re-times each moved task's own elements onto its new window so
//   the two cannot disagree.
//
//   Tests the SHIPPED function: _retimeSpan is sliced out of viewer/time_machine.js source and
//   evaluated, not re-implemented here. Re-implementing it is precisely the hand-copied-duplicate
//   mistake this codebase already paid for three times with the support predicate.
//
//   Fails if a remapped element can land outside its task's new window, if the engine's internal
//   ordering within a zone is not preserved, or if any element ends up with a non-positive duration.
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', '..', 'viewer', 'time_machine.js');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-COH PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-COH FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// ---- Slice the shipped function out of the real source.
var txt = fs.readFileSync(SRC, 'utf8');
var i = txt.indexOf('function _retimeSpan(');
check('G-COH-0 shipped-function-found', i >= 0, 'viewer/time_machine.js');
if (i < 0) { console.log('§W-COH RESULT pass=' + pass + ' fail=' + fail); process.exit(1); }
var depth = 0, started = false, end = i;
for (var c = i; c < txt.length; c++) {
  if (txt[c] === '{') { depth++; started = true; }
  else if (txt[c] === '}') { depth--; if (started && depth === 0) { end = c + 1; break; } }
}
var _retimeSpan = (new Function(txt.slice(i, end) + '\n return _retimeSpan;'))();
check('G-COH-1 shipped-function-evaluates', typeof _retimeSpan === 'function');

var DAY = 86400000;
// A realistic zone: 40 elements laid across a 20-day window, in engine order, some overlapping.
function makeZone(oS, days, n) {
  var ops = [], span = days * DAY;
  for (var k = 0; k < n; k++) {
    var s = oS + Math.floor((k / n) * span);
    var e = oS + Math.floor(((k + 1) / n) * span);
    if (e <= s) e = s + 60000;
    ops.push({ s: s, e: e });
  }
  return ops;
}

// Scenarios: pure move, stretch, shrink, and a move that also changes duration. Each must hold.
// The last case is the one that actually exercises the window clamp, and it is not contrived: a real
// Hospital zone holds thousands of elements, so shrinking one to a single day drives the per-element
// span below the 60s minimum-duration floor. The floor then bumps each end forward, and without a
// clamp the tail of the zone walks straight out past the task's finish.
var CASES = [
  { name: 'move-later-same-duration',   oS: 0, oDays: 20, nS: 45 * DAY, nDays: 20, n: 40 },
  { name: 'move-earlier-same-duration', oS: 60 * DAY, oDays: 20, nS: 10 * DAY, nDays: 20, n: 40 },
  { name: 'stretch-2x',                 oS: 0, oDays: 20, nS: 0, nDays: 40, n: 40 },
  { name: 'shrink-half',                oS: 0, oDays: 20, nS: 0, nDays: 10, n: 40 },
  { name: 'shrink-hard-to-1-day',       oS: 0, oDays: 40, nS: 5 * DAY, nDays: 1, n: 40 },
  { name: 'move-and-stretch',           oS: 12 * DAY, oDays: 13, nS: 80 * DAY, nDays: 33, n: 40 },
  { name: 'dense-zone-shrunk-to-1-day', oS: 0, oDays: 30, nS: 20 * DAY, nDays: 1, n: 5000 }
];

var totalOps = 0, outside = 0, disordered = 0, nonPositive = 0, worstCase = '';
CASES.forEach(function (cs) {
  var ops = makeZone(cs.oS, cs.oDays, cs.n);
  var oE = cs.oS + cs.oDays * DAY, nE = cs.nS + cs.nDays * DAY;
  var prevS = -Infinity, caseBad = 0;
  ops.forEach(function (op) {
    var r = _retimeSpan(op.s, op.e, cs.oS, oE, cs.nS, nE);
    totalOps++;
    // W1's core claim: an element never leaves its task's new window.
    if (r.s < cs.nS || r.e > nE) { outside++; caseBad++; }
    // The engine already ordered this zone correctly — an edit must preserve that, not re-derive it.
    if (r.s < prevS) { disordered++; caseBad++; }
    prevS = r.s;
    if (r.e <= r.s) { nonPositive++; caseBad++; }
  });
  if (caseBad && !worstCase) worstCase = cs.name;
  console.log("§W-COH case=" + cs.name + " ops=" + cs.n + " bad=" + caseBad);
});

check('G-COH-2 no-element-escapes-its-task-window', outside === 0,
  'escaped=' + outside + '/' + totalOps + (worstCase ? ' worstCase=' + worstCase : ''));
check('G-COH-3 engine-internal-order-preserved', disordered === 0, 'reordered=' + disordered);
check('G-COH-4 no-zero-or-negative-durations', nonPositive === 0, 'nonPositive=' + nonPositive);

// ---- RED CONTROL — corrected 2026-08-04. The first version of this control asserted that a NAIVE
// remap (affine, no window clamp) escapes the window. It does not, and cannot for realistic input:
// the affine map sends [oS,oE] onto [nS,nE] exactly, and the 60s minimum-duration bump only fires
// when a task's new span divided by its element count drops below 1ms — that needs more elements
// than a day has milliseconds. So the clamp inside _retimeSpan is belt-and-braces, NOT a
// load-bearing fix, and this witness must not claim otherwise.
//
// The real defect W1 exists to prevent is different and much larger: the task's dates move while its
// ELEMENTS DO NOT. That is the drawer-vs-movie divergence. The honest control is therefore to skip
// the re-time entirely and confirm the elements are then left stranded outside the task's new window.
var strandedNoRetime = 0, checkedNoRetime = 0;
CASES.forEach(function (cs) {
  if (cs.nS === cs.oS) return;                 // pure resize keeps the origin — not a divergence case
  var ops = makeZone(cs.oS, cs.oDays, cs.n);
  var nE = cs.nS + cs.nDays * DAY;
  ops.forEach(function (op) {
    checkedNoRetime++;
    if (op.s < cs.nS || op.e > nE) strandedNoRetime++;   // untouched op vs the task's NEW window
  });
});
check('G-COH-5 RED-CONTROL-without-W1-elements-are-stranded', strandedNoRetime > 0,
  'skipping the re-time strands ' + strandedNoRetime + '/' + checkedNoRetime +
  ' elements outside their task window — that divergence is exactly what W1 prevents');

// ---- The drag path must call the shipped function, not inline its own arithmetic.
var rt = txt.indexOf('function retimeTaskElements(');
var body = rt >= 0 ? txt.slice(rt, rt + 2200) : '';
check('G-COH-6 retime-path-uses-the-shipped-function', body.indexOf('_retimeSpan(') >= 0,
  'retimeTaskElements must not carry its own copy of the remap');

console.log('§W-COH RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
