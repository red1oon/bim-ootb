// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET MAINTENANCE TIMELINE (RESUME_HR_BIM_ASSET.md §RESUME NEXT#4(c) · §7D).
//   DERIVES a 4D preventive-maintenance schedule from REAL PM_Asset fields (next_due + pm_cycle), emitted in
//   the viewer's OWN 4D schema (schedules · tasks · task_elements · task_sequences) so the already-merged 4D
//   editor/importer (#504–#521) can FOLD it with ZERO new editor code. NON-INVENT GATE:
//     • due dates    = next_due stepped by the DECLARED pm_cycle (computed recurrence, not made up)
//     • duration     = 0 (MILESTONE) — only the due date is a real datum; no work-length is declared, so none
//                      is fabricated. day floored to '-01' (the model's granularity is the month, not the day).
//     • binding      = task_elements.guid = the asset's REAL bim_guid (actual geometry)
//     • uninterpretable pm_cycle → HONEST SKIP (logged), never a guessed cadence.
//   Pure + deterministic (no Date.now — caller passes `today`/`from`). Read the log after run.
'use strict';

// known cadences → month step. Anything else = we cannot interpret it → skip (non-invent).
var CYCLE_MONTHS = { weekly: null, monthly: 1, bimonthly: 2, 'bi-monthly': 2, quarterly: 3,
                     'semi-annual': 6, semiannual: 6, biannual: 6, annual: 12, yearly: 12 };
function cycleMonths(pm_cycle) {
  var k = String(pm_cycle || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(CYCLE_MONTHS, k) ? CYCLE_MONTHS[k] : undefined;
}

// 'YYYY-MM' month arithmetic (timezone-free, matches the model's granularity).
function addMonths(ym, n) {
  var p = ym.split('-'), y = +p[0], m = (+p[1] - 1) + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + ('0' + (m + 1)).slice(-2);
}

// expand ONE asset → maintenance occurrences in [from, from+months] from next_due stepping by pm_cycle.
function expandAsset(asset, opts) {
  opts = opts || {};
  var months = opts.months != null ? opts.months : 12;
  var from = opts.from || asset.next_due;
  if (!asset || !asset.next_due) return { asset: asset && asset.asset, skipped: 'no next_due', occurrences: [] };
  var step = cycleMonths(asset.pm_cycle);
  if (step === undefined) return { asset: asset.asset, skipped: 'uninterpretable pm_cycle: ' + asset.pm_cycle, occurrences: [] };
  if (step === null) return { asset: asset.asset, skipped: 'sub-month cycle not month-griddable: ' + asset.pm_cycle, occurrences: [] };
  var end = addMonths(from, months), occ = [], due = asset.next_due, i = 0;
  // walk forward from next_due; collect occurrences within [from, end]
  while (due <= end && i < 600) {
    if (due >= from) occ.push({ seq: occ.length + 1, due: due, asset: asset.asset, bim_guid: asset.bim_guid,
      pm_cycle: asset.pm_cycle, _derivedFrom: { next_due: asset.next_due, pm_cycle: asset.pm_cycle } });
    due = addMonths(due, step); i++;
  }
  return { asset: asset.asset, step: step, occurrences: occ };
}

// build a DERIVED 4D schedule (viewer schema) for a set of PM_Asset records.
function buildSchedule(assets, opts) {
  opts = opts || {};
  var sched = { schedule_id: opts.schedule_id || 'HBA-PM', name: 'HR_BIM_Asset · Preventive Maintenance',
                status: 'derived', created_date: opts.today || null };
  var tasks = [], elems = [], seqs = [], skipped = [];
  (assets || []).forEach(function (a) {
    var ex = expandAsset(a, opts);
    if (ex.skipped) { skipped.push({ asset: ex.asset, why: ex.skipped }); return; }
    var prev = null;
    ex.occurrences.forEach(function (o) {
      var tid = a.asset + '#' + o.seq, d = o.due + '-01';   // milestone at the due month (day floored — non-invent)
      tasks.push({ task_id: tid, schedule_id: sched.schedule_id,
        name: a.asset + ' · ' + (a.category || 'asset') + ' PM (' + a.pm_cycle + ')',
        start_date: d, finish_date: d, duration_days: 0, status: 'planned' });
      if (a.bim_guid) elems.push({ task_id: tid, guid: a.bim_guid });   // bind to the REAL asset element
      if (prev) seqs.push({ predecessor_id: prev, successor_id: tid, sequence_type: 'FS', lag_days: 0 }); // recurrence chain
      prev = tid;
    });
  });
  return { schedule: sched, tasks: tasks, task_elements: elems, task_sequences: seqs, skipped: skipped };
}

// recurrence-aware status for the §7D overlay: is the asset DUE in `period`, and is an occurrence OVERDUE?
//   ok       = period is before the first occurrence in the asset's series (and not on one)
//   due      = period exactly matches an occurrence month
//   overdue  = period is past an occurrence but before the next (a missed/active due window)
function statusAt(asset, period, opts) {
  var ex = expandAsset(asset, { from: asset && asset.next_due, months: (opts && opts.months) || 120 });
  if (ex.skipped || !ex.occurrences.length) return { state: 'ok', skipped: ex.skipped || null };
  var dues = ex.occurrences.map(function (o) { return o.due; });
  if (dues.indexOf(period) >= 0) return { state: 'due', due: period };
  // last occurrence on/before period
  var last = null; for (var i = 0; i < dues.length; i++) { if (dues[i] <= period) last = dues[i]; else break; }
  if (last) return { state: 'overdue', since: last };   // a due date has passed
  return { state: 'ok' };                                // all occurrences are in the future
}

var T = { cycleMonths: cycleMonths, addMonths: addMonths, expandAsset: expandAsset, buildSchedule: buildSchedule, statusAt: statusAt };
if (typeof module === 'object' && module.exports) module.exports = T;
else (typeof self !== 'undefined' ? self : this).HbaTimeline = T;
