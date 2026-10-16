#!/usr/bin/env node
// witness_gantt_bars_in_rect.js — §GANTT_GROUP_MOVE marquee geometry (2026-08-05). Proves
// barsInRect uses the EXACT same bar geometry as findBarAtClick (marginL=60, rowH=14) — a marquee
// that misses a bar findBarAtClick would hit is a real bug, not a UI nuance. Slices the real
// barsInRect by balanced braces.
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
const sliced = sliceFn(tmSrc, 'barsInRect');

// A 30-day axis over a 600px bar area (+60px gutter = 660px canvas) -> 20px/day.
// Row height 14 (barH=12 + gapH=2), rows start at y = i*14 + 2.
const _ganttTasks = [
  { taskId: 'A', startTs: 0,              endTs: 5 * 86400000  },  // row 0: x=[60,160],  y=[2,14]
  { taskId: 'B', startTs: 10 * 86400000,  endTs: 15 * 86400000 },  // row 1: x=[260,360], y=[16,28]
  { taskId: 'C', startTs: 20 * 86400000,  endTs: 25 * 86400000 },  // row 2: x=[460,560], y=[30,42]
  { taskId: null, startTs: 0, endTs: 5 * 86400000 },               // row 3: un-authored, must NEVER be selectable
];

function makeSandbox() {
  const sandbox = { Math: Math, _ganttTasks: _ganttTasks, _ganttAxisStart: 0, _ganttAxisEnd: 30 * 86400000 };
  vm.createContext(sandbox);
  vm.runInContext(sliced, sandbox);
  return sandbox;
}

// ── Case 1: a marquee over rows 0-1 only selects A and B, not C ──
{
  const sb = makeSandbox();
  const hit = sb.barsInRect(660, 50, 0, 400, 29);
  const ids = hit.map(function (t) { return t.taskId; }).sort();
  assert(JSON.stringify(ids) === JSON.stringify(['A', 'B']), 'marquee over rows 0-1 selects exactly [A,B], got ' + JSON.stringify(ids));
}

// ── Case 2: a marquee that only grazes A's right edge still counts it (any overlap, not full containment) ──
{
  const sb = makeSandbox();
  const hit = sb.barsInRect(660, 150, 0, 200, 14);
  const ids = hit.map(function (t) { return t.taskId; });
  assert(ids.indexOf('A') !== -1, 'a marquee that only grazes a bar\'s edge still selects it (overlap, not full containment)');
}

// ── Case 3: a marquee entirely inside the label gutter (x < 60) selects nothing ──
{
  const sb = makeSandbox();
  const hit = sb.barsInRect(660, 0, 0, 55, 100);
  assert(hit.length === 0, 'a marquee entirely inside the storey-label gutter selects zero bars');
}

// ── Case 4: reversed drag direction (bottom-right to top-left) must give the identical result ──
{
  const sb = makeSandbox();
  const forward = sb.barsInRect(660, 50, 0, 400, 29).map(function (t) { return t.taskId; }).sort();
  const reversed = sb.barsInRect(660, 400, 29, 50, 0).map(function (t) { return t.taskId; }).sort();
  assert(JSON.stringify(forward) === JSON.stringify(reversed), 'drag direction does not matter — same rect, same selection, got fwd=' + JSON.stringify(forward) + ' rev=' + JSON.stringify(reversed));
}

// ── RED CONTROL: a bar with no task_id (un-authored) is NEVER selectable, even dead-center in the marquee ──
{
  const sb = makeSandbox();
  const hit = sb.barsInRect(660, 50, 40, 200, 45);
  assert(hit.length === 0, 'RED CONTROL: an un-authored bar (taskId=null) directly inside the marquee is never selected');
}

console.log('\n§GANTT_BARS_IN_RECT SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
