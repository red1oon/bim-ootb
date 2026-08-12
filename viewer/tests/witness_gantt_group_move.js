#!/usr/bin/env node
// witness_gantt_group_move.js — §GANTT_GROUP_MOVE gesture state machine (2026-08-05). Proves the
// marquee-select / group-drag routing inside wireGanttDrag: empty-space drag starts a marquee
// (gated by the lock, same as everything else), a near-zero marquee clears the selection
// (click-away = ungroup, no separate verb), a real marquee populates _ganttSelected via the real
// barsInRect, dragging a SELECTED bar calls commitGanttGroupShift (not commitGanttDrag) with every
// selected task_id, and dragging an UNselected bar clears the group and falls through to the
// normal single-bar commitGanttDrag. Slices the real wireGanttDrag + barsInRect by balanced
// braces — hit-test geometry itself is separately proven in witness_gantt_bars_in_rect.js, so
// ganttHit is stubbed here to a deterministic lookup rather than re-driving real pixel math.
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
const sliced = sliceFn(tmSrc, 'barsInRect') + '\n' + sliceFn(tmSrc, 'wireGanttDrag');

function fakeElement(rectOverrides) {
  const handlers = {};
  return {
    _dragWired: false, clientWidth: 660,
    addEventListener: function (type, fn) { handlers[type] = fn; },
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    getBoundingClientRect: function () { return Object.assign({ left: 0, top: 0, width: 660 }, rectOverrides || {}); },
    style: {}, _handlers: handlers
  };
}
function ev(clientX, clientY, target) { return { clientX: clientX, clientY: clientY || 0, target: target, offsetX: 0, offsetY: 0, preventDefault: function () {}, stopPropagation: function () {} }; }

// Same geometry as witness_gantt_bars_in_rect.js: 30-day axis, 20px/day, rows 14px tall.
const BAR_A = { taskId: 'A', storey: 's', phase: 'p', startTs: 0, endTs: 5 * 86400000 };
const BAR_B = { taskId: 'B', storey: 's', phase: 'p', startTs: 10 * 86400000, endTs: 15 * 86400000 };
const BAR_C = { taskId: 'C', storey: 's', phase: 'p', startTs: 20 * 86400000, endTs: 25 * 86400000 };

function makeSandbox(editable) {
  const cv = fakeElement({});
  const tip = fakeElement({});
  const marquee = fakeElement({});
  const calls = { groupShift: [], singleDrag: [], link: [] };
  // Deterministic hit lookup: clientX buckets, matching each bar's OWN row/x-range from the
  // barsInRect witness — this is a TEST INPUT stub, not a re-implementation of ganttHit's geometry.
  const HITMAP = { 100: { bar: BAR_A, mode: 'move', dayPx: 20 }, 300: { bar: BAR_B, mode: 'move', dayPx: 20 }, 500: { bar: BAR_C, mode: 'move', dayPx: 20 } };
  const sandbox = {
    console: console, Math: Math, Object: Object, setTimeout: setTimeout,
    document: { getElementById: function (id) { return id === 'tm-gantt-canvas' ? cv : (id === 'tm-gantt-tip' ? tip : (id === 'tm-gantt-marquee' ? marquee : null)); } },
    _active: true, _ganttTasks: [BAR_A, BAR_B, BAR_C], _ganttAxisStart: 0, _ganttAxisEnd: 30 * 86400000,
    _ganttEditable: editable, _ganttSelected: {}, _marquee: null, _groupDrag: null, _drag: null, _dragConsumed: false,
    ganttHit: function (e) { return HITMAP[e.clientX] || null; },
    drawGanttMini: function () {},
    commitGanttGroupShift: function (taskIds, days) { calls.groupShift.push({ taskIds: taskIds.slice().sort(), days: days }); },
    commitGanttDrag: function (bar, mode, days) { calls.singleDrag.push({ id: bar.taskId, mode: mode, days: days }); },
    linkGanttBars: function (a, b) { calls.link.push({ a: a.taskId, b: b.taskId }); }
  };
  vm.createContext(sandbox);
  vm.runInContext(sliced, sandbox);
  sandbox.wireGanttDrag();
  return { sandbox: sandbox, cv: cv, calls: calls };
}

// ── Case 1: locked — empty-space drag never starts a marquee ──
{
  const h = makeSandbox(false);
  h.cv._handlers.pointerdown(ev(1000, 1, h.cv));   // no HITMAP entry at x=1000 -> empty space
  assert(h.sandbox._marquee === null, 'locked: pointerdown on empty canvas never starts a marquee');
}

// ── Case 2: unlocked — a real marquee drag over A and B populates _ganttSelected via the real barsInRect ──
{
  const h = makeSandbox(true);
  h.cv._handlers.pointerdown(ev(1000, 0, h.cv));
  assert(h.sandbox._marquee !== null, 'unlocked: pointerdown on empty canvas starts a marquee');
  h.cv._handlers.pointermove(ev(1000, 400, h.cv));   // sweep down toward x=400,y=29 covering rows 0-1 (A,B)
  // pointermove sets _marquee.x1/y1 off e.clientX/e.clientY directly (canvas-local, rect.left/top=0)
  h.sandbox._marquee.x0 = 50; h.sandbox._marquee.y0 = 0; h.sandbox._marquee.x1 = 400; h.sandbox._marquee.y1 = 29;
  h.cv._handlers.pointerup(ev(400, 29, h.cv));
  const selected = Object.keys(h.sandbox._ganttSelected).sort();
  assert(JSON.stringify(selected) === '["A","B"]', 'a marquee over rows 0-1 selects exactly [A,B] via the real barsInRect, got ' + JSON.stringify(selected));
}

// ── Case 3: click-away (near-zero marquee) clears an existing selection ──
{
  const h = makeSandbox(true);
  h.sandbox._ganttSelected = { A: true, B: true };
  h.cv._handlers.pointerdown(ev(1000, 0, h.cv));
  h.cv._handlers.pointerup(ev(1000, 0, h.cv));   // zero movement -> a click, not a drag
  assert(Object.keys(h.sandbox._ganttSelected).length === 0, 'a near-zero marquee (click-away) clears the existing selection');
}

// ── Case 4: dragging a SELECTED bar moves the whole group via commitGanttGroupShift, not a single drag ──
{
  const h = makeSandbox(true);
  h.sandbox._ganttSelected = { A: true, B: true };
  h.cv._handlers.pointerdown(ev(100, 0, h.cv));    // bar A, which IS in the selection
  h.cv._handlers.pointermove(ev(140, 0, h.cv));    // +40px / 20px-per-day = +2 days
  h.cv._handlers.pointerup(ev(140, 0, h.cv));
  assert(h.calls.singleDrag.length === 0, 'dragging a selected bar never calls the single-bar commitGanttDrag');
  assert(h.calls.groupShift.length === 1 && h.calls.groupShift[0].days === 2 &&
    JSON.stringify(h.calls.groupShift[0].taskIds) === '["A","B"]',
    'dragging a selected bar calls commitGanttGroupShift(["A","B"], 2) — got ' + JSON.stringify(h.calls.groupShift));
}

// ── Case 5: dragging a bar NOT in the selection clears the group and does a normal single drag ──
{
  const h = makeSandbox(true);
  h.sandbox._ganttSelected = { A: true, B: true };
  h.cv._handlers.pointerdown(ev(500, 0, h.cv));    // bar C, NOT in the selection
  h.cv._handlers.pointermove(ev(540, 0, h.cv));
  h.cv._handlers.pointerup(ev(540, 0, h.cv));
  assert(Object.keys(h.sandbox._ganttSelected).length === 0, 'dragging an unselected bar clears the group selection');
  assert(h.calls.groupShift.length === 0, 'dragging an unselected bar never calls commitGanttGroupShift');
  assert(h.calls.singleDrag.length === 1 && h.calls.singleDrag[0].id === 'C',
    'dragging an unselected bar falls through to the normal single-bar commitGanttDrag on that bar');
}

console.log('\n§GANTT_GROUP_MOVE SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
