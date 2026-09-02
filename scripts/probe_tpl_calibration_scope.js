#!/usr/bin/env node
// probe_tpl_calibration_scope.js — §TPL_CALIB_SCOPE
//
// ⚠ DO NOT REMOVE — SCOPE. bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2, DECISION
// step 1 (user, 2026-08-27): "Measure the 3x calibration mismatch's real scope FIRST — across all
// 42 tasks, not just the 7 already floored at min_days=1. This is the load-bearing unknown: if it
// meaningfully lengthens the other 35 tasks too, the whole 369-day project total moves, which is a
// materially bigger decision than fixing 7 short bars — STOP AND REPORT before implementing
// broadly if so."  Read the log after every run; this probe prints only §-tagged lines.
//
// WITNESS CLAIM (stated before the code, Spec-First):
//   C1. Recomputing the SHIPPED instantiateTemplate with _installSecs' basis recalibrated from
//       28800 s (the rate table's own 8-hour crew-day) to 86400 s (the 24-hour shift priceCell
//       actually divides by) changes N of the building's tasks' `days`, and moves totalDays from
//       A to B. N and B are the measurement; nothing here decides whether to ship it.
//   C2. The "recalibrate the numerator" fix and the ALREADY-REJECTED "revert shiftHours 24->8"
//       are either the same lever or different levers. priceCell is
//       days = ceil( secs / (shiftSecs * crews) ), so scaling secs by 3 and dividing shiftSecs by
//       3 are algebraically identical — this probe RUNS BOTH through the shipped function and
//       asserts task-for-task equality rather than asserting the algebra.
//   C3. The effect is either CONFINED to the tasks currently floored at min_days=1 (the premise
//       the fix was scoped on) or it is not. Reported as a split: floored vs non-floored.
//
// NON-INVENT: every input is read back from the persisted cache_4d_run.js run (elements with their
// OWN installSecs as the shipped _installSecs computed them) and pushed through the SHIPPED
// ScheduleAuthor.instantiateTemplate / ScheduleGate.deriveBandRanks. No duration is authored here.
// The baseline arm is asserted against the cached run's own §AUTHOR_TPL totalDays before any
// comparison is believed (§TPL_CALIB_BASELINE) — if the reconstruction cannot reproduce the
// shipped number, this probe reports INCONCLUSIVE and exits non-zero rather than compare
// (PRIMAL LAW clause 4: a witness that cannot report its own failure is not a witness).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..', 'viewer');
const CACHE = require(path.join(__dirname, 'cache_4d_run.js'));

const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const sb = { console: { log() {}, warn() {}, error() {} } };
vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
const LR = sb.LABOR_RATES;
const SHIFT_H = T.calendar.hours_per_shift;            // 24, the standing ruling
const RATE_TABLE_CREW_DAY_S = 28800;                   // _installSecs' own basis (schedule_author.js:91)

// Silence the shipped function's own §-logging for the ARMS only (it would print the same
// §TPL_* lines three times per building and drown the comparison). The cached witness.log
// already carries the real run's log verbatim — that is the primary evidence, not this.
function quiet(fn) {
  const l = console.log, w = console.warn;
  console.log = function () {}; console.warn = function () {};
  try { return fn(); } finally { console.log = l; console.warn = w; }
}

function arm(els, shiftHours, secsScale) {
  // elements are cloned per arm so one arm cannot see another's installSecs
  const e2 = els.map(e => ({
    guid: e.guid, cls: e.cls, phase: e.phase, storey: e.storey, resource: e.resource,
    base_z: e.bz, top_z: e.tz, installSecs: (e.installSecs || 0) * secsScale
  }));
  const bandRank = (SG.deriveBandRanks(e2, null) || {}).bandRank || {};
  const collapse = function (st) { return SG.collapsePhase(st); };   // storeyMergeMap is null on the
  // buildings measured here (§S18_STOREY_MERGE_FAIL: no spatial_structure) — matched, not assumed:
  // the baseline arm's totalDays assertion below is what proves the reconstruction is faithful.
  return quiet(() => SA.instantiateTemplate(e2, T, LR, shiftHours, bandRank, collapse, null));
}

function shippedTotalDays(log) {
  const m = /§AUTHOR_TPL[^\n]*\btotalDays=(\d+(?:\.\d+)?)/.exec(log);
  return m ? Number(m[1]) : null;
}

function run(bld) {
  const c = CACHE.read(bld);
  if (!c) { console.log('§TPL_CALIB_SCOPE bld=' + bld + ' INCONCLUSIVE — no current cache (run scripts/cache_4d_run.js ' + bld + ')'); return null; }
  if (!c.els || !c.els.length) { console.log('§TPL_CALIB_SCOPE bld=' + bld + ' INCONCLUSIVE — cache has no elements'); return null; }
  // §CACHE_PLAYED_LAYER (2026-09-02, queue item A-9) — every cache reader must name the layer it
  // judged. This one is layer-INDEPENDENT and says so: it re-instantiates the TEMPLATE from the
  // cached ELEMENTS (installSecs) and checks its arms against the shipped §AUTHOR_TPL totalDays in
  // the cached LOG. It reads neither schedule map, so no re-pointing was needed — but "I read no
  // layer" is itself an attribution, and an unstated one is what let a whole class of measurement
  // judge the wrong map for four weeks.
  console.log('§TPL_CALIB_LAYER bld=' + bld + ' layer=NONE — this probe judges cached ELEMENTS ' +
    '(installSecs) + the shipped §AUTHOR_TPL log line; it reads neither the played nor the display ' +
    'schedule map, so its numbers are unaffected by §CACHE_PLAYED_LAYER. cacheHasPlayedLayer=' +
    (c.play ? 'yes' : 'NO (rebuild with --force)'));

  // ── arms ────────────────────────────────────────────────────────────────────────────────────
  const base = arm(c.els, SHIFT_H, 1);                                   // shipped, as deployed
  const recal = arm(c.els, SHIFT_H, 86400 / RATE_TABLE_CREW_DAY_S);      // C1: numerator recalibrated to the 24h shift
  const revert = arm(c.els, RATE_TABLE_CREW_DAY_S / 3600, 1);            // C2: the rejected shiftHours 24->8 revert

  // ── C-baseline: the reconstruction must reproduce the shipped run's own number ───────────────
  const shipped = shippedTotalDays(c.log);
  const ok = shipped != null && Math.abs(base.totalDays - shipped) < 1e-9;
  console.log('§TPL_CALIB_BASELINE bld=' + bld + ' reconstructed=' + base.totalDays +
    ' shippedAUTHOR_TPL=' + (shipped == null ? 'ABSENT' : shipped) + ' tasks=' + base.tasks.length +
    ' ' + (ok ? 'MATCH' : 'MISMATCH — every number below is INCONCLUSIVE'));
  if (!ok) return { bld: bld, ok: false };

  // ── C2: same lever or two levers? task-for-task, not algebra ─────────────────────────────────
  const rc = {}; recal.tasks.forEach(t => rc[t.id] = t);
  let c2diff = 0;
  revert.tasks.forEach(t => { const o = rc[t.id]; if (!o || o.days !== t.days || o.sDays !== t.sDays || o.eDays !== t.eDays) c2diff++; });
  console.log('§TPL_CALIB_SAMELEVER bld=' + bld + ' recalibrateNumerator_vs_revertShift tasksDiffering=' +
    c2diff + '/' + revert.tasks.length + ' totalDays ' + recal.totalDays + ' vs ' + revert.totalDays +
    ' — ' + (c2diff === 0 && recal.totalDays === revert.totalDays
      ? 'IDENTICAL: these are ONE lever, not two options'
      : 'DIFFERENT: they are genuinely separate levers'));

  // ── C1 + C3: per-task before/after, split by whether the task is currently at the min_days floor
  const minDays = (T.duration_rule && T.duration_rule.min_days) || 1;
  const bm = {}; base.tasks.forEach(t => bm[t.id] = t);
  const rows = [];
  recal.tasks.forEach(t => {
    const b = bm[t.id]; if (!b) return;
    rows.push({ id: t.id, phase: b.phase, storey: b.storey, n: b.guids.length,
      beforeDays: b.days, afterDays: t.days, beforeCrewDays: b.crewDays, afterCrewDays: t.crewDays,
      floored: b.days === minDays && b.crewDays < minDays, bott: b.bottleneck });
  });
  const floored = rows.filter(r => r.floored), nonFloored = rows.filter(r => !r.floored);
  const changed = rows.filter(r => r.afterDays !== r.beforeDays);
  const changedNonFloored = nonFloored.filter(r => r.afterDays !== r.beforeDays);
  const sumB = rows.reduce((a, r) => a + r.beforeDays, 0), sumA = rows.reduce((a, r) => a + r.afterDays, 0);
  const nfB = nonFloored.reduce((a, r) => a + r.beforeDays, 0), nfA = nonFloored.reduce((a, r) => a + r.afterDays, 0);

  console.log('§TPL_CALIB_SCOPE bld=' + bld + ' tasks=' + rows.length +
    ' totalDays ' + base.totalDays + '->' + recal.totalDays +
    ' (x' + (recal.totalDays / base.totalDays).toFixed(2) + ')' +
    ' tasksChanged=' + changed.length + '/' + rows.length +
    ' sumTaskDays ' + sumB + '->' + sumA + ' (x' + (sumA / sumB).toFixed(2) + ')');
  console.log('§TPL_CALIB_SPLIT bld=' + bld +
    ' flooredAtMinDays=' + floored.length + ' (changed=' + floored.filter(r => r.afterDays !== r.beforeDays).length + ')' +
    ' nonFloored=' + nonFloored.length + ' (changed=' + changedNonFloored.length + ')' +
    ' nonFlooredSumDays ' + nfB + '->' + nfA + ' (x' + (nfB ? (nfA / nfB).toFixed(2) : 'n/a') + ')' +
    ' — ' + (changedNonFloored.length === 0
      ? 'CONFINED to the floored tasks'
      : 'NOT CONFINED: ' + changedNonFloored.length + ' of the ' + nonFloored.length +
        ' non-floored tasks lengthen too'));

  // every task, sorted longest-growth first — the numbers the decision rests on
  rows.slice().sort((a, b2) => (b2.afterDays - b2.beforeDays) - (a.afterDays - a.beforeDays)).forEach(r => {
    console.log('§TPL_CALIB_TASK bld=' + bld + ' ' + r.id + ' phase="' + r.phase + '" level="' + r.storey +
      '" n=' + r.n + ' days ' + r.beforeDays + '->' + r.afterDays + ' (+' + (r.afterDays - r.beforeDays) + ')' +
      ' crewDays ' + r.beforeCrewDays.toFixed(3) + '->' + r.afterCrewDays.toFixed(3) +
      ' bottleneck=' + r.bott + (r.floored ? ' FLOORED' : ''));
  });

  // element-weighted view: how much of the model sits in a bar that grows, and by how much
  const elsInChanged = changed.reduce((a, r) => a + r.n, 0), elsAll = rows.reduce((a, r) => a + r.n, 0);
  console.log('§TPL_CALIB_ELEMENTS bld=' + bld + ' elementsInGrowingBars=' + elsInChanged + '/' + elsAll +
    ' (' + (100 * elsInChanged / elsAll).toFixed(1) + '%)');

  // ── THE COMPLAINT'S OWN UNIT: a bar is "squashed" as a FRACTION OF THE DRAWN AXIS, not in days.
  // Lengthening every task AND the project total together can leave a short bar relatively NARROWER
  // than it started. This is the number the user's screenshot is actually about, so it is measured
  // rather than argued: axisPct = days / totalDays.
  const shortest = rows.slice().sort((a, b2) => a.beforeDays - b2.beforeDays).slice(0, 10);
  let narrower = 0;
  rows.forEach(r => {
    if ((r.afterDays / recal.totalDays) < (r.beforeDays / base.totalDays) - 1e-12) narrower++;
  });
  console.log('§TPL_CALIB_AXIS_FRACTION bld=' + bld + ' tasksDrawnRELATIVELY_NARROWER_after=' + narrower +
    '/' + rows.length + ' — ' + (narrower > rows.length / 2
      ? 'the lever makes the SQUASHED-BAR complaint WORSE for most bars'
      : 'most bars gain axis share'));
  shortest.forEach(r => {
    const pb = 100 * r.beforeDays / base.totalDays, pa = 100 * r.afterDays / recal.totalDays;
    console.log('§TPL_CALIB_AXIS_TASK bld=' + bld + ' ' + r.id + ' n=' + r.n +
      ' days ' + r.beforeDays + '->' + r.afterDays +
      ' axisPct ' + pb.toFixed(3) + '%->' + pa.toFixed(3) + '% ' +
      (pa < pb ? 'NARROWER' : pa > pb ? 'wider' : 'same'));
  });
  return { bld: bld, ok: true, before: base.totalDays, after: recal.totalDays,
    changed: changed.length, changedNonFloored: changedNonFloored.length, tasks: rows.length };
}

const list = process.argv.slice(2).filter(a => a[0] !== '-');
const out = (list.length ? list : ['Hospital', 'HHS_Office_Federated']).map(run).filter(Boolean);
const bad = out.filter(o => !o.ok);
console.log('§TPL_CALIB_VERDICT buildings=' + out.length + ' inconclusive=' + bad.length + ' ' +
  out.filter(o => o.ok).map(o => o.bld + ':' + o.before + '->' + o.after +
    '(nonFlooredChanged=' + o.changedNonFloored + ')').join(' '));
process.exit(bad.length ? 2 : 0);
