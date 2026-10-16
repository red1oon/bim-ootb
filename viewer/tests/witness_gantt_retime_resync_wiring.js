#!/usr/bin/env node
// WITNESS — W-RESYNC — §GANTT_RETIME_RESYNC wiring
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S67.
//
// ISSUE THIS PROVES OR DISPROVES:
//   A user report, 2026-08-22: "the last time I edited it, it screws up redisplay."
//   Root-caused to wiring, not maths. `retimeTaskElements()` rewrites every affected element's
//   kernel_ops row (timestamp + the parameters JSON). The 3D canvas does NOT re-read that by
//   itself — `_tmResyncAfterRetime()` is what re-sorts `_ops`, clears the incremental-reveal index
//   (`_evMesh/_evSig/_incrPrimed`) and rebuilds the X-ray cache. Its own call sites carry the
//   comment "without this the canvas plays the OLD times", which is exactly the reported symptom.
//
//   MEASURED on origin/main @ 3b5a3e9, before the fix: SIX call sites of retimeTaskElements, only
//   FOUR followed by a resync. The two that were not:
//     - linkGanttBars()  (E4, dependency link)          — time_machine.js ~:6614
//     - openGanttProps() (E7, typed properties apply)   — time_machine.js ~:6691
//   Both repaint the GANTT (invalidateGanttModel/computeDays/drawGanttMini/renderAtTime) but never
//   rebuild the reveal state, so the bars move and the model does not. Drag, ruler-shift, group-move
//   and undo were all correctly wired, which is why the bug only showed on those two gestures.
//
// THE GATE (W-RESYNC-1): every function that calls retimeTaskElements() must also call
//   _tmResyncAfterRetime(). Source-level, because the alternative is a browser gesture per path.
//
// ⚠ Brace-matched, never a fixed slice window. witness_gantt_edit_coherence.js's G-COH-6 asserts
//   over `txt.slice(rt, rt + 2200)` and has been a FALSE NEGATIVE since the function grew past it
//   (the call it looks for now sits at offset 5073) — see §S65. Do not reintroduce that pattern.
//
// Command: node viewer/tests/witness_gantt_retime_resync_wiring.js     (no fixtures, no DB, no browser)
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const TM = path.join(__dirname, '..', 'time_machine.js');
const src = fs.readFileSync(TM, 'utf8');

// Enclosing-NAMED-function extraction by BRACE MATCHING. Not "the nearest `function` above the
// call" — that lands on whatever anonymous callback happens to be nearer. Every `function NAME(` is
// brace-matched once, then the SMALLEST named body that contains the call index wins.
function namedFns(text) {
  const out = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = text.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > 0) out.push({ name: m[1], start: m.index, end: end, body: text.slice(m.index, end) });
  }
  return out;
}
const FNS = namedFns(src);
function enclosingFn(callIdx) {
  let best = null;
  for (const f of FNS) {
    if (f.start < callIdx && callIdx < f.end && (!best || (f.end - f.start) < (best.end - best.start))) best = f;
  }
  return best;
}

// Every CALL of retimeTaskElements (the declaration is skipped by requiring no `function ` prefix).
const CALL = 'retimeTaskElements(';
const sites = [];
for (let i = src.indexOf(CALL); i >= 0; i = src.indexOf(CALL, i + 1)) {
  if (/function\s+$/.test(src.slice(Math.max(0, i - 12), i))) continue;   // the declaration itself
  sites.push(i);
}
const lineOf = idx => src.slice(0, idx).split('\n').length;

assert(sites.length >= 5, 'W-RESYNC-0 retimeTaskElements call sites found (n=' + sites.length +
  ') — a 0 here means the function was renamed and this witness went blind, not that the wiring is clean');

const missing = [];
const seen = {};
for (const s of sites) {
  const fn = enclosingFn(s);
  if (!fn) { missing.push('line ' + lineOf(s) + ' <no enclosing function resolved>'); continue; }
  const key = fn.name + ':' + fn.start;
  if (seen[key]) continue;
  seen[key] = 1;
  if (fn.body.indexOf('_tmResyncAfterRetime(') < 0) missing.push(fn.name + '() at line ' + lineOf(fn.start) + ' (retime at line ' + lineOf(s) + ')');
}
console.log('§GANTT_RETIME_RESYNC_WIRING callSites=' + sites.length + ' distinctFns=' + Object.keys(seen).length +
  ' missingResync=' + missing.length + (missing.length ? ' [' + missing.join(' | ') + ']' : ''));
assert(missing.length === 0, 'W-RESYNC-1 every function that re-times elements also calls _tmResyncAfterRetime() ' +
  '(without it the canvas keeps playing the OLD times — the reported "editing screws up redisplay") — ' +
  (missing.length ? 'MISSING in ' + missing.join(', ') : 'all ' + Object.keys(seen).length + ' clean'));

// The resync must keep doing the three things the redisplay depends on. A resync that stopped
// clearing the reveal index would satisfy W-RESYNC-1 and still ship the bug.
const rs = FNS.find(f => f.name === '_tmResyncAfterRetime');
const rsBody = rs ? rs.body : '';
assert(!!rs, 'W-RESYNC-2 _tmResyncAfterRetime is present and brace-matched');
assert(/_ops\.sort\(/.test(rsBody), 'W-RESYNC-2a _tmResyncAfterRetime re-sorts _ops (edits reorder the timeline)');
assert(/_incrPrimed\s*=\s*false/.test(rsBody), 'W-RESYNC-2b it clears the incremental-reveal index (§PERF_INCR full rebuild)');
assert(/_tmRebuildXrayCache\(/.test(rsBody), 'W-RESYNC-2c it rebuilds the X-ray cache');

console.log('§GANTT_RETIME_RESYNC_WIRING_SUMMARY pass=' + pass + ' fail=' + fail);
if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
console.log('PASS — every re-time path resyncs the canvas');
