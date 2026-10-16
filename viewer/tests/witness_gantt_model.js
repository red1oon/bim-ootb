#!/usr/bin/env node
// witness_gantt_model.js — §S53 (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S53, item F3).
//
// ISSUE this witness proves/disproves: the Gantt bar model — the grouping, the bar-span trim, the
// row order and the display axis — was extracted out of time_machine.js into gantt_model.js. Are
// those four rules still the rules, and can they be judged WITHOUT slicing source text?
//
// Until this file, they could not be. `witness_midair_zero.js` had to slice `_tukeyBound` out of
// time_machine.js by source text (a slice that had already silently widened once, §S20) and to
// RE-IMPLEMENT buildGanttTasks' grouping to report on it (§S51_SCREEN's own comment: "this witness
// mirroring buildGanttTasks grouping"). A mirrored judge is §S25_REVIEW.1 one step removed — the
// drawer's rule changes, the judge keeps measuring the retired rule, and stays green throughout.
//
// This witness `require()`s the real module and calls the real functions. Fixtures are synthetic
// and tiny ON PURPOSE: each one is the smallest input that makes ONE rule's failure visible. Real
// building numbers are the other witness's job (witness_midair_zero.js, 7 buildings, locked
// baselines) — this one pins the rules those numbers are produced BY.
//
//   W-GM-1  grouping precedence: task id > cell stamp > storey|phase (the §S51 rule)
//   W-GM-2  one outlier member cannot define a bar's span (§GANTT_MINI_TRIM), n=1 stays non-negative
//   W-GM-3  row order is DERIVED from SEQUENCE_RULES, not a hardcoded copy (§GANTT_ROW_ORDER)
//   W-GM-4  an unknown phase sorts AFTER the known ones, never at position 0
//   W-GM-5  the DISPLAY axis is qualified while the PLAYBACK bounds stay true (§GANTT_AXIS_OUTLIER)
'use strict';
const path = require('path');
const GM = require(path.join(__dirname, '..', 'gantt_model.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const D = 86400000;
const T0 = Date.UTC(2026, 0, 1);
// op(day, len, storey, phase, extra) — the ELEMENT_PLACE shape buildTasks consumes.
let _g = 0;
function op(day, len, storey, phase, extra) {
  const p = { storey: storey, phase: phase };
  if (extra) for (const k in extra) p[k] = extra[k];
  return { op_type: 'ELEMENT_PLACE', start_ts: T0 + day * D, end_ts: T0 + (day + (len == null ? 1 : len)) * D,
           output_guid: 'g' + (++_g), parameters: p };
}

// ── W-GM-1 — grouping precedence. The SAME three ops, differing only in what identity they carry.
// If the cell stamp were dropped (the §S51 item-d regression this guards), all three collapse into
// one storey|phase bar and the count silently drops from 3 to 1 — visible here, not on a screen.
{
  assert(GM.groupKeyOf('T7', 'L1·Arch·0', 'L1', 'Architecture') === 'T:T7',
    'W-GM-1a a real authored task id wins over both the cell stamp and storey|phase');
  assert(GM.groupKeyOf(null, 'L1·Arch·0', 'L1', 'Architecture') === 'C:L1·Arch·0',
    'W-GM-1b with no task id, the schedule\'s own cell stamp is the grain');
  assert(GM.groupKeyOf(null, null, 'L1', 'Architecture') === 'L1|Architecture',
    'W-GM-1c with neither, the un-authored storey|phase fallback (graph-path buildings)');

  const cells = GM.buildTasks([op(0, 1, 'L1', 'Architecture', { _cell: 'L1·Arch·0' }),
                               op(1, 1, 'L1', 'Architecture', { _cell: 'L1·Arch·1' }),
                               op(2, 1, 'L1', 'Architecture', { _cell: 'L1·Arch·2' })], null, null).tasks;
  const flat = GM.buildTasks([op(0, 1, 'L1', 'Architecture'), op(1, 1, 'L1', 'Architecture'),
                              op(2, 1, 'L1', 'Architecture')], null, null).tasks;
  assert(cells.length === 3 && flat.length === 1,
    'W-GM-1d end to end: three cell stamps make three bars, the same ops without stamps make one');

  // The identity counters are what the §GANTT_BAR_IDENTITY log line reports as editable/not.
  const idx = { guidTask: {}, tasks: { T1: { name: 'Pour L1' } } };
  const o1 = op(0, 1, 'L1', 'Architecture'), o2 = op(1, 1, 'L1', 'Architecture');
  idx.guidTask[o1.output_guid] = 'T1';
  const r = GM.buildTasks([o1, o2], idx, null);
  assert(r.identified === 1 && r.unidentified === 1 && r.tasks.length === 2 &&
         r.tasks.filter(t => t.taskName === 'Pour L1').length === 1,
    'W-GM-1e identified/unidentified are counted per op and the task NAME is carried onto its bar');

  // A bookkeeping op (BUILDING_OPEN — §GANTT_OPS_BOOKKEEPING_LEAK) is not a task and must not become
  // a bar; _ops legitimately carries the full mixed history for other consumers.
  const mixed = GM.buildTasks([op(0, 1, 'L1', 'Architecture'),
    { op_type: 'BUILDING_OPEN', start_ts: T0 + 900 * D, end_ts: T0 + 900 * D, output_guid: null, parameters: {} }], null, null);
  assert(mixed.tasks.length === 1,
    'W-GM-1f a non-ELEMENT_PLACE op never becomes a bar (§GANTT_OPS_BOOKKEEPING_LEAK)');
}

// ── W-GM-2 — §GANTT_MINI_TRIM. This is the fixture the OLD (pre-stage-2) rule got wrong: a small
// group, so the retired n>=20 percentile rule applied NO trim at all and one outlier stretched the
// bar across the whole project ("one pile, full project length"). 12 members inside 12 days, one at
// day 900. If the trim ever regresses to a size-gated rule, this bar's span jumps ~75x.
{
  const ops = [];
  for (let d = 0; d < 12; d++) ops.push(op(d, 1, 'L1', 'Architecture'));
  ops.push(op(900, 1, 'L1', 'Architecture'));
  const bar = GM.buildTasks(ops, null, null).tasks[0];
  const spanDays = (bar.endTs - bar.startTs) / D;
  assert(bar.count === 13 && spanDays < 30,
    'W-GM-2a one outlier member (day 900 of 13) does not define the bar span — got ' +
    spanDays.toFixed(1) + 'd over ' + bar.count + ' members (untrimmed would be 901d)');
  assert(bar.guids.length === 13,
    'W-GM-2b the trimmed-out member is still COUNTED and still a bar member (§TIER_DAG_WINS: counted, never hidden)');

  const one = GM.buildTasks([op(5, 3, 'L1', 'Architecture')], null, null).tasks[0];
  assert(one.endTs >= one.startTs,
    'W-GM-2c an n=1 group is never negative-width (the degenerate-group clamp)');

  // The envelope itself, on a population whose fences are hand-checkable.
  const arr = [10, 11, 12, 13, 1000];
  assert(GM.tukeyBound(arr, false) < 1000 && GM.tukeyBound(arr, true) === 10 &&
         GM.tukeyBound([7], false) === 7,
    'W-GM-2d tukeyBound clamps the high fence below a lone outlier, never invents a value past the true min/max');
}

// ── W-GM-3 — §GANTT_ROW_ORDER must be DERIVED. The fixture is deliberately the WRONG order the
// stale _VAR_ORDER copy carries (MEP Rough-in before Architecture): if the derivation is ever
// replaced by a hardcoded list again, the derived order stops tracking this input and the test goes
// red. Sequence numbers here are arbitrary and out of order on purpose — only their RANK matters.
{
  const SR = { A: { phase: 'Finishes', sequence: 10 }, B: { phase: 'Substructure', sequence: 1 },
               C: { phase: 'MEP Rough-in', sequence: 3 }, D: { phase: 'Architecture', sequence: 7 },
               E: { phase: 'Substructure', sequence: 4 } };
  const ord = GM.phaseOrder(SR);
  assert(JSON.stringify(ord) === JSON.stringify(['Substructure', 'MEP Rough-in', 'Architecture', 'Finishes']),
    'W-GM-3a phase order follows SEQUENCE_RULES\' own sequence numbers, MINIMUM per phase (got ' + JSON.stringify(ord) + ')');
  assert(JSON.stringify(GM.phaseOrder({})) === JSON.stringify(GM.FALLBACK_PHASE_ORDER) &&
         GM.FALLBACK_PHASE_ORDER[0] === 'Substructure' &&
         GM.FALLBACK_PHASE_ORDER.indexOf('Architecture') < GM.FALLBACK_PHASE_ORDER.indexOf('MEP Rough-in'),
    'W-GM-3b with no rules loaded, the fallback list is used AND it is the post-#1165 order (envelope before MEP rough-in)');

  // Rows sort by phase rank first, then early start — a later-starting Substructure bar still
  // outranks an earlier-starting Architecture one (the P6/MSP WBS-then-start convention).
  const rows = GM.buildTasks([op(50, 1, 'L9', 'Architecture'), op(1, 1, 'L1', 'MEP Rough-in'),
                              op(80, 1, 'L1', 'Substructure')], null, SR).tasks;
  assert(rows.map(r => r.phase).join(',') === 'Substructure,MEP Rough-in,Architecture',
    'W-GM-3c bars are ordered by derived phase rank BEFORE start time (got ' + rows.map(r => r.phase).join(',') + ')');
}

// ── W-GM-4 — an unknown phase must sort after the known ones. The failure this guards is real and
// named in the code: a phase outside the canonical list silently bucketing at position 0, i.e. an
// unrecognised trade drawn as if it came first in the programme.
{
  const SR = { B: { phase: 'Substructure', sequence: 1 }, D: { phase: 'Finishes', sequence: 10 } };
  const rows = GM.buildTasks([op(0, 1, 'L1', 'Zebra Works'), op(1, 1, 'L1', 'Substructure'),
                              op(2, 1, 'L1', 'Alpha Works'), op(3, 1, 'L1', 'Finishes')], null, SR).tasks;
  const names = rows.map(r => r.phase);
  assert(names[0] === 'Substructure' && names[1] === 'Finishes',
    'W-GM-4a known phases keep their derived rank ahead of unknown ones (got ' + JSON.stringify(names) + ')');
  assert(names[2] === 'Alpha Works' && names[3] === 'Zebra Works',
    'W-GM-4b two unknown phases sort alphabetically between themselves, not by arrival order');
}

// ── W-GM-5 — §GANTT_AXIS_OUTLIER. The DISPLAY axis is qualified; the PLAYBACK bounds are not. Both
// halves matter: a single malformed op must not rescale the whole chart, AND the real bounds must
// still reach it or an element would never build (Prime Rule).
{
  const ops = [];
  for (let d = 0; d < 30; d++) ops.push(op(d, 1, 'L1', 'Architecture'));
  ops.push(op(1000, 1, '_UNKNOWN', 'Architecture'));
  const r = GM.computeDays(ops);
  assert(r.projectStart === ops[0].start_ts - 1,
    'W-GM-5a projectStart is 1ms BEFORE the first op, so the start of the movie is truly empty');
  assert(r.projectEnd === T0 + 1001 * D,
    'W-GM-5b projectEnd (real playback bound) still reaches the outlier — every element must eventually build');
  assert(r.axisEnd < r.projectEnd && (r.axisEnd - r.axisStart) / D < 100,
    'W-GM-5c the DISPLAY axis is qualified away from the outlier — got ' +
    ((r.axisEnd - r.axisStart) / D).toFixed(1) + 'd of axis for a 1001d unqualified span');
  assert(r.axisEnd <= r.projectEnd,
    'W-GM-5d the axis NEVER exceeds the true max (tukeyBound\'s own clamp) — a qualification, never an invention');
  assert(r.days.length === 31 && r.n === 31,
    'W-GM-5e the day ladder is one entry per distinct calendar day, outlier included (got ' + r.days.length + ')');

  const empty = GM.computeDays([]);
  assert(empty.days.length === 0 && empty.projectStart === null && empty.axisEnd === null,
    'W-GM-5f an empty op list yields no bounds rather than NaN/Infinity ones');
}

console.log('\n§GANTT_MODEL_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
