#!/usr/bin/env node
// witness_gantt_ruler_shift_lock.js — §TM_RULER_SHIFT UI gate (2026-08-05). Proves the ruler-drag
// entry point respects the SAME edit lock as bar drag/resize/link (this is the biggest possible
// edit, not a reason to exempt it), and that the pixel-to-days conversion matches the qualified
// axis math used everywhere else in the drawer. Slices the real wireGanttRulerShift by balanced
// braces, never reimplements the gate or the day math.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
const sliced = sliceFn(tmSrc, 'wireGanttRulerShift');

function fakeElement(clientWidth) {
  const handlers = {};
  return {
    _shiftWired: false,
    addEventListener: function (type, fn) { handlers[type] = fn; },
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    clientWidth: clientWidth, style: {}, _handlers: handlers
  };
}
function ev(clientX) { return { clientX: clientX, preventDefault: function () {}, stopPropagation: function () {} }; }

function makeSandbox(editable) {
  const ruler = fakeElement(660);   // 660 - 60 gutter = 600px bar width
  const tip = fakeElement(0);
  let shiftCalls = [];
  const sandbox = {
    console: console, Math: Math, setTimeout: setTimeout,
    document: { getElementById: function (id) { return id === 'tm-gantt-ruler' ? ruler : (id === 'tm-gantt-tip' ? tip : null); } },
    _ganttEditable: editable,
    _ganttAxisStart: 0, _ganttAxisEnd: 30 * 86400000,   // 30-day project -> 20px/day over a 600px bar area
    shiftGanttSchedule: function (d) { shiftCalls.push(d); }
  };
  vm.createContext(sandbox);
  vm.runInContext(sliced, sandbox);
  sandbox.wireGanttRulerShift();
  return { sandbox: sandbox, ruler: ruler, getShiftCalls: function () { return shiftCalls; } };
}

// ── Case 1: locked — a full drag gesture must never reach shiftGanttSchedule ──
{
  const h = makeSandbox(false);
  h.ruler._handlers.pointerdown(ev(100));
  h.ruler._handlers.pointermove(ev(300));   // would-be a large rightward drag
  h.ruler._handlers.pointerup(ev(300));
  assert(h.getShiftCalls().length === 0, 'locked: a full ruler drag gesture never calls shiftGanttSchedule');
}

// ── Case 2: unlocked — a real drag calls shiftGanttSchedule with the correct day delta ──
{
  const h = makeSandbox(true);
  h.ruler._handlers.pointerdown(ev(100));
  h.ruler._handlers.pointermove(ev(140));   // +40px at 20px/day (600px bar / 30 days) = +2 days
  h.ruler._handlers.pointerup(ev(140));
  const calls = h.getShiftCalls();
  assert(calls.length === 1 && calls[0] === 2, 'unlocked: +40px drag on a 30-day/600px axis calls shiftGanttSchedule(2) — got ' + JSON.stringify(calls));
}

// ── Case 3: unlocked but no actual movement (a click) — must NOT call shiftGanttSchedule ──
{
  const h = makeSandbox(true);
  h.ruler._handlers.pointerdown(ev(100));
  h.ruler._handlers.pointerup(ev(100));
  assert(h.getShiftCalls().length === 0, 'unlocked click (zero delta) never calls shiftGanttSchedule — a click is not a drag');
}

// ── RED CONTROL: unlocked + a real drag with pointerdown skipped must not call shift either
// (pointermove alone, no drag in progress) — proves the gate isn't just "editable=true always calls" ──
{
  const h = makeSandbox(true);
  h.ruler._handlers.pointermove(ev(999));
  h.ruler._handlers.pointerup(ev(999));
  assert(h.getShiftCalls().length === 0, 'RED CONTROL: pointermove/up with no pointerdown never calls shiftGanttSchedule');
}

console.log('\n§GANTT_RULER_SHIFT_LOCK SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
