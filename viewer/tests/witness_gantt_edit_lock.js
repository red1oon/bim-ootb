#!/usr/bin/env node
// witness_gantt_edit_lock.js — §GANTT_EDIT_LOCK (2026-08-05). Proves the drawer's edit lock toggle
// actually gates every edit-initiating entry point (drag/resize move-start, drag-to-link — which
// can only ever fire off a live _drag, so gating pointerdown alone covers it — and the E7
// double-click props panel), while leaving hit-testing/geometry untouched (stubbed, not re-tested
// here — that's ganttHit's own concern, covered elsewhere). Slices the SHIPPED wireGanttDrag out of
// time_machine.js by balanced braces (same convention as witness_gantt_edit_undo.js /
// witness_gantt_native_generate.js) — never a reimplementation of the gate logic.
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
const sliced = sliceFn(tmSrc, 'wireGanttDrag');

function fakeElement() {
  const handlers = {};
  return {
    _dragWired: false,
    _handlers: handlers,
    addEventListener: function (type, fn) { handlers[type] = fn; },
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    style: {}, textContent: ''
  };
}

function makeSandbox() {
  const canvas = fakeElement();
  const tip = fakeElement();
  let openGanttPropsCalls = 0;
  const fakeBar = { taskId: 'T1', storey: 'Level 1', phase: 'Superstructure' };
  const sandbox = {
    console: console, Math: Math, Object: Object, setTimeout: setTimeout,
    document: { getElementById: function (id) { return id === 'tm-gantt-canvas' ? canvas : (id === 'tm-gantt-tip' ? tip : null); } },
    _active: true, _ganttTasks: [fakeBar], _ganttEditable: false, _drag: null, _dragConsumed: false,
    // §GANTT_GROUP_MOVE additions to wireGanttDrag — not this witness's concern (that's
    // witness_gantt_group_move.js), just enough state for the sliced function to run without
    // throwing on a reference it now makes.
    _ganttSelected: {}, _marquee: null, _groupDrag: null,
    barsInRect: function () { return []; }, commitGanttGroupShift: function () {},
    ganttHit: function () { return { bar: fakeBar, mode: 'move', dayPx: 10 }; },
    openGanttProps: function () { openGanttPropsCalls++; },
    linkGanttBars: function () {}, commitGanttDrag: function () {}
  };
  vm.createContext(sandbox);
  vm.runInContext(sliced, sandbox);
  sandbox.wireGanttDrag();
  return { sandbox: sandbox, canvas: canvas, getOpenGanttPropsCalls: function () { return openGanttPropsCalls; } };
}

// ── Case 1: locked (default) — pointerdown on an editable bar must NOT start a drag ──
{
  const h = makeSandbox();
  h.sandbox._ganttEditable = false;
  h.canvas._handlers.pointerdown({ clientX: 10, clientY: 10 });
  assert(h.sandbox._drag === null, 'locked: pointerdown on an editable bar does not start _drag');
}

// ── Case 2: unlocked — the SAME pointerdown must start a drag ──
{
  const h = makeSandbox();
  h.sandbox._ganttEditable = true;
  h.canvas._handlers.pointerdown({ clientX: 10, clientY: 10 });
  assert(h.sandbox._drag !== null && h.sandbox._drag.bar.taskId === 'T1', 'unlocked: pointerdown on an editable bar starts _drag');
}

// ── Case 3: locked — double-click must NOT open the props panel ──
{
  const h = makeSandbox();
  h.sandbox._ganttEditable = false;
  h.canvas._handlers.dblclick({ clientX: 10, clientY: 10 });
  assert(h.getOpenGanttPropsCalls() === 0, 'locked: double-click does not open the props panel');
}

// ── Case 4: unlocked — double-click DOES open the props panel ──
{
  const h = makeSandbox();
  h.sandbox._ganttEditable = true;
  h.canvas._handlers.dblclick({ clientX: 10, clientY: 10 });
  assert(h.getOpenGanttPropsCalls() === 1, 'unlocked: double-click opens the props panel');
}

// ── RED CONTROL: prove the gate is actually load-bearing, not vacuously true because pointerdown
// never runs at all — a bar with NO taskId is rejected regardless of lock state, on a DIFFERENT
// reason, so this must not be confused with the lock gate.
{
  const h = makeSandbox();
  h.sandbox._ganttEditable = true;
  h.sandbox.ganttHit = function () { return { bar: { taskId: null, storey: 'x', phase: 'y' }, mode: 'move', dayPx: 10 }; };
  h.canvas._handlers.pointerdown({ clientX: 10, clientY: 10 });
  assert(h.sandbox._drag === null, 'RED-CONTROL: a bar with no task_id is still rejected even when unlocked (different guard, not this one)');
}

console.log('\n§GANTT_EDIT_LOCK SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
