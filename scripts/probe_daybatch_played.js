#!/usr/bin/env node
// probe_daybatch_played.js — §DAYBATCH_*, RE-MEASURED ON THE LAYER THE FILM ACTUALLY PLAYS.
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/GANTT_ACCURACY.md §BUILDUP_DAY_BATCH_FEASIBILITY,
// re-measured 2026-09-02 under queue item A-0; layer machinery: 4D_GANTT_TM_REFACTOR.md
// §CACHE_PLAYED_LAYER). Read the log after every run (project Log Mandate).
//
// WHY THIS EXISTS. §BUILDUP_DAY_BATCH_FEASIBILITY's original numbers were computed by session
// scratchpad scripts over the cache's `sched` key = materializeZones' displaySchedule — the map
// §TM_REVEAL_SHIPPED then measured that viewer/time_machine.js NEVER READS. Its NO-GO verdict and
// its "no real day-buckets exist" finding survive that (both are properties of a continuous
// schedule, true of either map), but every WITHIN-TASK magnitude it published described a layer
// nobody plays. Those magnitudes are re-measured here, on the persisted PLAYED layer, by a probe
// that lives in the repo instead of a scratchpad — so the next session reads a § line instead of
// re-deriving it (CLAUDE.md, PRIMAL LAW clause 5).
//
// Usage: node scripts/probe_daybatch_played.js [Building ...]      (default Hospital Duplex)
//        LAYER=display node scripts/probe_daybatch_played.js ...   (the old, unplayed map)
//        FRAMES=3118 ...                                           (film frame count, default 3118)
'use strict';
const path = require('path');
const CACHE = require(path.join(__dirname, 'cache_4d_run.js'));
const DAY_MS = 86400000;
const FRAMES = process.env.FRAMES ? Number(process.env.FRAMES) : 3118;

function pct(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; }
function cv(a) {
  if (a.length < 2) return null;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length;
  return { mean: m, cv: m ? Math.sqrt(v) / m : null };
}

function run(bld) {
  const r = CACHE.read(bld);
  if (!r) { console.log('§DAYBATCH_PLAYED bld=' + bld + ' INCONCLUSIVE — no cache, run: node scripts/cache_4d_run.js ' + bld); return; }
  const L = CACHE.layerOf(r);
  console.log('§DAYBATCH_LAYER bld=' + bld + ' layer=' + L.id + ' key=' + L.key + ' — ' + L.desc);
  if (L.missing) {
    console.log('§DAYBATCH_PLAYED bld=' + bld + ' INCONCLUSIVE — layer=' + L.id + ' ABSENT from this cache ' +
      '(predates §CACHE_PLAYED_LAYER). Rebuild: node scripts/cache_4d_run.js --force ' + bld +
      '. NOT falling back to the other layer: that substitution is the defect A-9 removed.');
    return;
  }
  const M = L.map, LAY = L.id, els = r.els, tasks = r.tasks || [];
  const guids = Object.keys(M);
  if (!guids.length) { console.log('§DAYBATCH_PLAYED bld=' + bld + ' layer=' + LAY + ' VACUOUS — the layer is empty'); return; }

  // ── 1. ties: are completions discrete day-buckets, or continuous instants? ──────────────────
  const ends = guids.map(g => M[g].e);
  const tally = {}; ends.forEach(e => { tally[e] = (tally[e] || 0) + 1; });
  const distinct = Object.keys(tally).length;
  let largest = 0; for (const k in tally) if (tally[k] > largest) largest = tally[k];
  console.log('§DAYBATCH_TIES bld=' + bld + ' layer=' + LAY + ' distinctEnds=' + distinct + '/' + ends.length +
    ' largestExactTie=' + largest +
    ' — a real day-bucket would show large exact ties; distinct instants mean the schedule is continuous');

  // ── 2. intraday: do completions pile at midnight? ───────────────────────────────────────────
  const t0 = Math.min.apply(null, guids.map(g => M[g].s));
  const hour = new Array(24).fill(0);
  let nearMidnight = 0;
  ends.forEach(e => {
    const off = e - t0;
    const h = Math.floor((off % DAY_MS) / 3600000);
    hour[Math.max(0, Math.min(23, h))]++;
    const intoDay = ((off % DAY_MS) + DAY_MS) % DAY_MS;
    if (intoDay < 60000 || intoDay > DAY_MS - 60000) nearMidnight++;
  });
  const hMin = Math.min.apply(null, hour), hMax = Math.max.apply(null, hour);
  console.log('§DAYBATCH_INTRADAY bld=' + bld + ' layer=' + LAY + ' hourHistogram min=' + hMin + ' max=' + hMax +
    ' uniformExpected=' + Math.round(ends.length / 24) +
    ' endsWithin1minOfDayBoundary=' + nearMidnight + '/' + ends.length +
    ' (' + (100 * nearMidnight / ends.length).toFixed(2) + '%) — 24/7 calendar, so a day boundary is not a shift change');

  // ── 3. the biggest task: successive-completion gaps, and the per-day rate ───────────────────
  const byTask = {};
  tasks.forEach(t => { byTask[t.id] = t.guids.filter(g => M[g]); });
  const big = Object.keys(byTask).sort((a, b) => byTask[b].length - byTask[a].length).slice(0, 4);
  big.forEach((tid, i) => {
    const gs = byTask[tid]; if (gs.length < 20) return;
    const es = gs.map(g => M[g].e).sort((a, b) => a - b);
    const gaps = []; for (let k = 1; k < es.length; k++) gaps.push(es[k] - es[k - 1]);
    gaps.sort((a, b) => a - b);
    if (i === 0) console.log('§DAYBATCH_GAPS bld=' + bld + ' layer=' + LAY + ' task=' + tid + ' n=' + gs.length +
      ' successiveCompletionGap p50=' + pct(gaps, 0.5) + 'ms(' + (pct(gaps, 0.5) / 60000).toFixed(2) + 'min)' +
      ' p90=' + (pct(gaps, 0.9) / 60000).toFixed(2) + 'min max=' + (gaps[gaps.length - 1] / 3600000).toFixed(2) + 'h' +
      ' — a smooth drip has a small p50; a daily clump would show p50~0 with a 24h max');
    const perDay = {};
    es.forEach(e => { const d = Math.floor((e - t0) / DAY_MS); perDay[d] = (perDay[d] || 0) + 1; });
    const c = cv(Object.values(perDay));
    console.log('§DAYBATCH_TASK_DAYRATE bld=' + bld + ' layer=' + LAY + ' task=' + tid + ' n=' + gs.length +
      ' days=' + Object.keys(perDay).length + ' meanPerDay=' + (c ? c.mean.toFixed(1) : 'n/a') +
      ' CV=' + (c && c.cv != null ? c.cv.toFixed(2) : 'n/a') +
      ' — a per-day count is the BINNING of a continuous layout, not a schedule structure');
  });

  // ── 4. frames: worst-frame pop on a calendar-linear cursor ──────────────────────────────────
  const starts = guids.map(g => M[g].s);
  const pStart = Math.min.apply(null, starts), pEnd = Math.max.apply(null, guids.map(g => M[g].e));
  const step = (pEnd - pStart) / FRAMES;
  const per = new Array(FRAMES).fill(0);
  const frameOf = {};
  guids.forEach(g => { let f = Math.floor((M[g].s - pStart) / step); if (f >= FRAMES) f = FRAMES - 1; if (f < 0) f = 0; per[f]++; frameOf[g] = f; });
  let worst = -1, worstF = -1;
  per.forEach((c, i) => { if (c > worst) { worst = c; worstF = i; } });
  const mean = guids.length / FRAMES;
  console.log('§DAYBATCH_FRAMES bld=' + bld + ' layer=' + LAY + ' frames=' + FRAMES +
    ' projectDays=' + ((pEnd - pStart) / DAY_MS).toFixed(1) +
    ' mean=' + mean.toFixed(1) + '/frame worst=' + worst + ' at f' + worstF +
    ' = ' + (worst / mean).toFixed(1) + 'x mean, day ' + ((worstF * step) / DAY_MS).toFixed(1));

  // ── 5. what is IN the worst frame — the short-element-run clustering claim ───────────────────
  const elBy = {}; els.forEach(e => { elBy[e.guid] = e; });
  const gTask = {}; tasks.forEach(t => t.guids.forEach(g => { if (gTask[g] == null) gTask[g] = t.id; }));
  const inWorst = guids.filter(g => frameOf[g] === worstF);
  const byT = {}; inWorst.forEach(g => { const t = gTask[g] || '_none'; byT[t] = (byT[t] || 0) + 1; });
  const topT = Object.keys(byT).sort((a, b) => byT[b] - byT[a])[0];
  const widths = inWorst.filter(g => (gTask[g] || '_none') === topT).map(g => (M[g].e - M[g].s) / 1000).sort((a, b) => a - b);
  const taskAll = (byTask[topT] || []).map(g => (M[g].e - M[g].s) / 1000).sort((a, b) => a - b);
  const isecs = inWorst.filter(g => (gTask[g] || '_none') === topT && elBy[g]).map(g => elBy[g].installSecs).sort((a, b) => a - b);
  const isecsAll = (byTask[topT] || []).filter(g => elBy[g]).map(g => elBy[g].installSecs).sort((a, b) => a - b);
  console.log('§DAYBATCH_BURST_MIX bld=' + bld + ' layer=' + LAY + ' worstFrame=f' + worstF +
    ' dominatedBy=' + topT + ' (' + byT[topT] + '/' + inWorst.length + ' of the frame)' +
    ' burstWidth p50=' + (widths.length ? widths[Math.floor(widths.length / 2)].toFixed(0) : 'n/a') + 's' +
    ' vs taskWidth p50=' + (taskAll.length ? taskAll[Math.floor(taskAll.length / 2)].toFixed(0) : 'n/a') + 's' +
    ' | installSecs p50 burst=' + (isecs.length ? isecs[Math.floor(isecs.length / 2)] : 'n/a') +
    ' vs task=' + (isecsAll.length ? isecsAll[Math.floor(isecsAll.length / 2)] : 'n/a') +
    ' — the duration-weighted tiling packs a short-duration run denser than the task mean');

  // ── 6. day-batching prediction (labelled a PREDICTION, computed from the measured per-day mix) ─
  const perDayAll = {};
  ends.forEach(e => { const d = Math.floor((e - t0) / DAY_MS); perDayAll[d] = (perDayAll[d] || 0) + 1; });
  const dayCounts = Object.values(perDayAll).sort((a, b) => a - b);
  const maxDay = dayCounts[dayCounts.length - 1];
  const overs = dayCounts.filter(c => c > worst).length;
  console.log('§DAYBATCH_PULSE_PREDICTION bld=' + bld + ' layer=' + LAY +
    ' framesPerDay=' + (FRAMES / ((pEnd - pStart) / DAY_MS)).toFixed(2) +
    ' perDay p50=' + pct(dayCounts, 0.5) + ' p90=' + pct(dayCounts, 0.9) + ' max=' + maxDay +
    ' -> predictedWorstFrameIfBatched=' + maxDay + ' = ' + (maxDay / mean).toFixed(1) + 'x mean' +
    ' (today ' + (worst / mean).toFixed(1) + 'x) daysWhoseFullCountExceedsCurrentWorstFrame=' + overs + '/' + dayCounts.length +
    ' — PREDICTION, not a measurement of a built thing');
}

const list = process.argv.slice(2).filter(a => a[0] !== '-');
(list.length ? list : ['Hospital', 'Duplex']).forEach(b => { run(b); console.log(''); });
