#!/usr/bin/env node
// witness_gantt_phase_palette.js — W-PHASE-KEY
// Implementing bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §GANTT_PHASE_CLOBBER
//
// THE ISSUE THIS WITNESS PROVES OR DISPROVES:
//   The Time Machine's Gantt drawer keys colour, ink, short-code and ROW ORDER off one field —
//   `parameters.phase`. The captured/authored overlay overwrote that field with the TASK NAME, and
//   since zone-level authoring became the default those names read "<Phase> — <Storey>". Every
//   lookup then misses: bars go grey, and _phaseRank() returns -1 for every row so the sort falls
//   through to ALPHABETICAL — which is §GANTT_ROW_ORDER (K1)'s original reported bug ("substructure
//   which has above ground appearing first"), silently back.
//
//   The strings below are the user's own, copied from their Hospital console:
//     §GANTT_ROW_ORDER phases=["Architecture — Level 1", … ,"Superstructure — Level 7A"]
//
// HOW IT FALSIFIES: G-PAL-1 feeds those exact strings through the SHIPPED palette + rank code
// (sliced from viewer/time_machine.js, not retyped) and must show grey/unranked — if it ever passes,
// the RED case stopped reproducing and this witness is blind. G-PAL-3 asserts on the source itself:
// the overlay must not write a task name into the field the palette reads.
//
// A witness that only checked "the drawer rendered" would pass on the broken build — it did render,
// in grey, in the wrong order. The assertions here are the colour string and the rank integer.
//
// Run (from the repo root):  node witness_gantt_phase_palette.js
// Read the log, not the exit code.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const TM = path.join(__dirname, 'viewer', 'time_machine.js');
const workingSrc = fs.readFileSync(TM, 'utf8');
const shippedSrc = cp.execFileSync('git', ['show', 'origin/main:viewer/time_machine.js'],
  { cwd: __dirname, maxBuffer: 1 << 28 }).toString();

function sliceBraces(src, marker) {
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error('marker not found: ' + marker);
  let depth = 0, seen = false, i = idx;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seen = true; }
    else if (src[i] === '}') { depth--; if (seen && depth === 0) break; }
  }
  return src.slice(idx, i + 1) + ';';
}
// An IIFE's balanced brace closes the FUNCTION BODY, not the statement — slice through its
// `})();` terminator instead, or the assembled script is `var X = (function(){…};` and won't parse.
function sliceIife(src, marker) {
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error('marker not found: ' + marker);
  const end = src.indexOf('})();', idx);
  if (end < 0) throw new Error('IIFE terminator not found for: ' + marker);
  return src.slice(idx, end + 5);
}

// The shipped palette tables + the shipped row-rank derivation, executed as-is.
function palette(src) {
  const ctx = { console: { log() {}, warn() {} }, window: {} };
  vm.createContext(ctx);
  vm.runInContext([
    sliceBraces(src, 'var PHASE_COLORS = {'),
    sliceBraces(src, 'var PHASE_SHORT = {'),
    sliceBraces(src, 'var PHASE_INK = {'),
    // _ROW_PHASE_ORDER is an IIFE assigned to a var; with window.SEQUENCE_RULES absent it takes its
    // own documented fallback — the same canonical order the engine derives from SEQUENCE_RULES.
    sliceIife(src, 'var _ROW_PHASE_ORDER = (function ()'),
    sliceBraces(src, 'function _phaseRank(p)'),
  ].join('\n'), ctx);
  return ctx;
}

const ENGINE_PHASES = ['Substructure', 'Superstructure', 'Architecture',
                       'MEP Rough-in', 'MEP Final', 'Finishes'];

// The captured overlay's own assignment statement, taken from the source as CODE (comment lines
// excluded — an early draft of this witness matched the fix's own explanatory comment and reported
// the fixed tree as broken). Executed, not paraphrased: whatever the shipped line does to `p` is
// what the drawer will key on.
function overlayAssign(src) {
  const line = src.split('\n').filter(function (l) {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && /^\s*p\.\w+\s*=\s*w\.name\s*;/.test(l);
  })[0];
  if (!line) throw new Error('no `p.<field> = w.name;` assignment found in the captured overlay');
  return line.trim();
}

function gates(src, label) {
  const P = palette(src);
  const out = { label };

  // G-PAL-1 — the DATA FLOW, end to end: run the shipped overlay statement over one op's params
  // (a zone task, named the way materializeZones names them), then look the result up in the
  // shipped palette exactly as the drawer does. This is the user's Hospital case reduced to two
  // values: the colour string and the rank integer.
  const stmt = overlayAssign(src);
  const p = { phase: 'Architecture', storey: 'Level 1' };
  const w = { name: 'Architecture — Level 1' };
  vm.runInNewContext(stmt, { p: p, w: w });
  const key = p.phase;                                   // what PHASE_COLORS/_phaseRank receive
  const color = P.PHASE_COLORS[key] || '#888';
  const ink = P.PHASE_INK[key] || '#fff';
  const short = P.PHASE_SHORT[key] || String(key).substring(0, 3);
  const rank = P._phaseRank(key);
  out.g1 = color !== '#888' && rank < P._ROW_PHASE_ORDER.length;
  console.log('§PHASE_KEY G-PAL-1 ' + label + ' stmt=`' + stmt + '`' +
    ' → phaseKey="' + key + '" colour=' + color + ' ink=' + ink + ' short=' + short + ' rank=' + rank +
    ' (of ' + P._ROW_PHASE_ORDER.length + ') taskName=' + JSON.stringify(p.taskName || null) +
    ' → ' + (out.g1 ? 'palette + row order resolve (PASS)'
      : 'BAR GREY + row unranked → alphabetical order (FAIL — this is the reported symptom)'));

  // G-PAL-2 — the canonical phases must always resolve; proves the tables themselves are intact,
  // so a G-PAL-1 failure can only be the KEY, never a missing palette entry.
  const bad = ENGINE_PHASES.filter(p => !P.PHASE_COLORS[p] || P._phaseRank(p) >= P._ROW_PHASE_ORDER.length);
  out.g2 = bad.length === 0;
  console.log('§PHASE_KEY G-PAL-2 ' + label + ' enginePhases=' + ENGINE_PHASES.length +
    ' unresolved=' + bad.length + ' order=' + JSON.stringify(P._ROW_PHASE_ORDER) +
    ' → ' + (out.g2 ? 'every real phase has a colour and a rank (PASS)' : 'palette itself is broken (FAIL)'));

  // G-PAL-3 — the task NAME must survive somewhere, or the fix would just be a deletion: the bar
  // detail header renders `bar.taskName || (bar.phase + ' — ' + bar.storey)`, so the name has to
  // land in a field that is not the palette's key. Same executed `p` as G-PAL-1.
  const nameKept = p.taskName === w.name;
  const phaseIntact = p.phase === 'Architecture';
  out.g3 = nameKept && phaseIntact;
  console.log('§PHASE_KEY G-PAL-3 ' + label + ' after the shipped statement: p.phase=' +
    JSON.stringify(p.phase) + ' p.taskName=' + JSON.stringify(p.taskName || null) +
    ' → ' + (out.g3 ? 'name kept AND phase left alone (PASS)'
      : !phaseIntact ? 'the overlay overwrote the field the palette keys on (FAIL)'
      : 'the task name was dropped entirely (FAIL)'));
  return out;
}

console.log('§PHASE_KEY W-PHASE-KEY — §GANTT_PHASE_CLOBBER, shipped vs fixed\n');
const shipped = gates(shippedSrc, 'SHIPPED(origin/main)');
console.log('');
const fixed = gates(workingSrc, 'FIXED(working-tree)');

console.log('\n§PHASE_KEY_RESULT red=' + (shipped.g1 === false && shipped.g3 === false
  ? 'G-PAL-1 + G-PAL-3 FAIL on origin/main (the bug reproduces)'
  : 'origin/main PASSES — WITNESS IS BLIND, the RED case no longer reproduces'));
const green = fixed.g1 && fixed.g2 && fixed.g3;
console.log('§PHASE_KEY_RESULT green=' + (green ? 'all gates pass on the fix' : 'FIX INCOMPLETE') +
  ' (G-PAL-1=' + fixed.g1 + ' G-PAL-2=' + fixed.g2 + ' G-PAL-3=' + fixed.g3 + ')');
const verdict = shipped.g1 === false && shipped.g3 === false && green;
console.log('§PHASE_KEY_VERDICT ' + (verdict ? 'GREEN — falsifiable and fixed' : 'RED — see gates above'));
process.exit(verdict ? 0 : 1);
