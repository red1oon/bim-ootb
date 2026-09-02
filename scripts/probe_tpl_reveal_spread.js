#!/usr/bin/env node
// probe_tpl_reveal_spread.js — 4D_GANTT_TM_REFACTOR.md §FUTURE item 2, the RED/before measurement
// ⚠ DO NOT REMOVE — SCOPE. Spec-First (CLAUDE.md): measure the CURRENT distribution before any code
// change. Reads the persisted cache (bim-ootb/scripts/cache_4d_run.js) — never re-invokes the
// pipeline. Question: for a task spanning [task_sDays, task_eDays], where does each of its elements'
// reveal timestamp (displaySchedule[guid].s, from §TPL_MOVIE_BINDS_BARS) fall inside that window,
// normalized to [0,1]? A histogram skewed toward 0 is "crammed at the start"; a flat histogram is
// "spread across the bar" (the fixed shape).
'use strict';
const path = require('path');
const CACHE = require(path.join(__dirname, 'cache_4d_run.js'));

const bld = process.argv[2] || 'Hospital';
const run = CACHE.read(bld);
if (!run) { console.log('§TPL_REVEAL_SPREAD_FAIL bld=' + bld + ' — no cache, run: node scripts/cache_4d_run.js ' + bld); process.exit(1); }
if (!run.tasks) { console.log('§TPL_REVEAL_SPREAD_FAIL bld=' + bld + ' — cache has no tasks field, rebuild with --force'); process.exit(1); }

const BUCKETS = 10;
const hist = new Array(BUCKETS).fill(0);
let n = 0, skipped = 0;
const base = Date.parse('2026-01-01');
const perTask = [];

for (const t of run.tasks) {
  const wS = base + t.sDays * 86400000, wE = base + t.eDays * 86400000;
  const wSpan = wE - wS;
  const tHist = new Array(BUCKETS).fill(0);
  let tN = 0;
  for (const g of t.guids) {
    const sc = run.sched[g];
    if (!sc) { skipped++; continue; }
    let pos = wSpan > 0 ? (sc.s - wS) / wSpan : 0;
    if (pos < 0) pos = 0; if (pos > 1) pos = 1;
    let b = Math.floor(pos * BUCKETS); if (b >= BUCKETS) b = BUCKETS - 1;
    hist[b]++; n++;
    tHist[b]++; tN++;
  }
  if (tN) perTask.push({ id: t.id, n: tN, days: t.eDays - t.sDays,
    firstDecilePct: 100 * tHist[0] / tN });
}

perTask.sort((a, b) => b.firstDecilePct - a.firstDecilePct);
console.log('§TPL_REVEAL_SPREAD_WORST bld=' + bld + ' top5-by-firstDecilePct=' +
  JSON.stringify(perTask.slice(0, 5)));

const pct = hist.map(c => (100 * c / n).toFixed(1));
console.log('§TPL_REVEAL_SPREAD bld=' + bld + ' tasks=' + run.tasks.length + ' n=' + n + ' skipped=' + skipped +
  ' decileCounts=[' + hist.join(',') + '] decilePct=[' + pct.join(',') + ']' +
  ' — decile 0 = first 10% of the task own window, decile 9 = last 10%; a flat 10.0 each = uniform spread');

// Simple skew signal: share of elements landing in the FIRST decile vs a uniform-spread expectation
// of 10%. This is the number item 2's "crammed at the start" claim is actually about.
const first = parseFloat(pct[0]);
console.log('§TPL_REVEAL_SPREAD_SKEW bld=' + bld + ' firstDecilePct=' + first.toFixed(1) +
  ' uniformExpected=10.0 ratio=' + (first / 10).toFixed(2) + 'x' +
  (first > 20 ? ' — CRAMMED (>2x uniform)' : first > 12 ? ' — mild skew' : ' — roughly uniform'));
