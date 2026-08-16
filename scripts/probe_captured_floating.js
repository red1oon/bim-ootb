#!/usr/bin/env node
// probe_captured_floating.js — faithful node-side reproduction of the CAPTURED-path floating
// measurement (§AUDIT_FLOATING / §HOSPITAL_LIGHTING_STILL_FLOATING, 4D_SCHEDULE_PERFECTION.md):
// materializeZones' zones -> per-task window -> §GANTT_TASK_WINDOW_FIDELITY per-element rescale
// (time_machine.js injectGantt _cap overlay, ~5527-5563) -> _ogSupportSweep repair (~4193) ->
// floating audit (_contactGraph/_midairAudit, ~4557/4601). Pure node, no DOM — every step sliced
// verbatim from the shipped files so a fix measured here matches what the browser actually plays.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.lastIndexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
function buildFn(srcParts, ret) {
  return new Function('ScheduleGate', srcParts.join('\n') + '\nreturn ' + ret + ';')(ScheduleGate);
}
const _contactGraph = buildFn([sliceFn(tmSrc, '_contactGraph')], '_contactGraph');
const _ogSupportSweep = buildFn([sliceFn(tmSrc, '_ogSupportSweep')], '_ogSupportSweep');
const _cjpJudgeParity = buildFn([sliceFn(tmSrc, '_contactGraph'), sliceFn(tmSrc, '_cjpJudgeParity')], '_cjpJudgeParity');
const _TIER1_ORDER_LINE = "var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];";
// §MIDAIR_REPAIR_CONTACTGRAPH_DEDUP (bim-ootb PR #1378): _midairRepair now calls _contactGraph
// instead of inlining its own copy, so this standalone build needs _contactGraph's source too.
const _midairRepair = buildFn([_TIER1_ORDER_LINE, sliceFn(tmSrc, '_contactGraph'), sliceFn(tmSrc, '_midairRepair')], '_midairRepair');

function _slug(name) { return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const ONLY = process.env.ONLY || 'Hospital_extracted';
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;

function floatingCensus(items) {
  const G = _contactGraph(items);
  let midair = 0, byClass = {}, guids = [];
  const byGuid = {}; items.forEach((it, i) => byGuid[it.guid] = i);
  for (let i = 0; i < items.length; i++) {
    const list = G.contacts[i]; if (!list) continue;
    let first = Infinity;
    for (const k of list) { const s = items[k].s; if (s < first) first = s; }
    if (first > items[i].s + 1) {
      midair++; byClass[items[i].cls] = (byClass[items[i].cls] || 0) + 1;
      if (guids.length < 2000) guids.push({ guid: items[i].guid, cls: items[i].cls, task: items[i].task });
    }
  }
  return { midair, orphans: G.orphans, grounded: G.groundedN, byClass, guids, G };
}

// §STOREY_ORDER_REPORT (2026-08-16) — user report: "storey by storey build up not adhered to".
// items: [{storey, bz, s}]. Storeys ordered by REAL mean base_z (extracted geometry, never
// invented) — p10/p50 START DAY per storey, then a monotonicity check across that real elevation
// order. Shared by the RAW (pre-remap) and FINAL (post-overlay) call sites so the two are directly
// comparable — same math, different pipeline stage.
const DAY_MS = 86400000;
function storeyOrderReport(items, label) {
  const byStorey = {};
  items.forEach(function (o) {
    const key = o.storey || '_NONE';
    const g = byStorey[key] || (byStorey[key] = { zs: [], starts: [] });
    g.zs.push(o.bz);
    g.starts.push(o.s);
  });
  const globalMin = Math.min.apply(null, items.map(function (o) { return o.s; }));
  const rows = Object.keys(byStorey).map(function (k) {
    const g = byStorey[k];
    const meanZ = g.zs.reduce(function (a, b) { return a + b; }, 0) / g.zs.length;
    const starts = g.starts.slice().sort(function (a, b) { return a - b; });
    const n = starts.length;
    const p10 = Math.round((starts[Math.floor(n * 0.10)] - globalMin) / DAY_MS);
    const p50 = Math.round((starts[Math.floor(n * 0.50)] - globalMin) / DAY_MS);
    return { storey: k, z: meanZ, n: n, p10: p10, p50: p50 };
  }).sort(function (a, b) { return a.z - b.z; });
  let violations = 0, worst = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].p50 < rows[i - 1].p50) {
      violations++;
      worst = Math.max(worst, rows[i - 1].p50 - rows[i].p50);
    }
  }
  console.log('§STOREY_ORDER_TABLE_' + label + ' ' + JSON.stringify(rows.map(function (r) {
    return [r.storey, r.z.toFixed(1), r.n, r.p10, r.p50];
  })));
  console.log('§STOREY_ORDER_REPORT_' + label + ' violations=' + violations + '/' + (rows.length - 1) +
    ' worstInversionDays=' + worst + ' storeys=' + rows.length);
  return { violations, worst, storeys: rows.length };
}

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const dbPath = path.join(BLD_DIR, ONLY + '.db');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();

  const rawElements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT
  });
  const elements = rawElements.map(function (it) { return Object.assign({}, it, { bz: it.base_z, tz: it.top_z }); });
  console.log('§CAP_ELEMENTS n=' + elements.length);

  const maxCrews = {};
  for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;
  const schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, SHIFT_HOURS);
  const rolled = ScheduleGate.deriveZones(elements, schedule);
  console.log('§CAP_ZONES n=' + rolled.zones.length + ' edges=' + rolled.edges.length);

  // RAW baseline for §STOREY_ORDER_REPORT — computeSchedule's own §4D_BAND_MONOTONIC ladder is
  // supposed to enforce this at the per-element level BEFORE any remap/repair/overlay touches it.
  // Two granularities: RAW_SUBSTOREY is the label the movie actually renders per-element (e.g.
  // "Level 4 TOS" vs "Level 4" vs "Level 4 Ceiling" kept separate); RAW_LEVEL collapses those onto
  // the §4D_BAND_MONOTONIC gate's own granularity (ScheduleGate.collapsePhase) so a violation there
  // is a genuine ladder break, not just TOS-races-ahead-of-Ceiling sub-storey sequencing.
  storeyOrderReport(elements.map(function (e) {
    return { storey: e.storey, bz: e.bz, s: schedule[e.guid].start };
  }), 'RAW_SUBSTOREY');
  storeyOrderReport(elements.map(function (e) {
    return { storey: ScheduleGate.collapsePhase(e.storey), bz: e.bz, s: schedule[e.guid].start };
  }), 'RAW_LEVEL');

  // materializeZones' own task-id + window construction, verbatim (schedule_author.js:397-411)
  const minStart = Math.min.apply(null, rolled.zones.map(z => z.start));
  const zoneTaskId = {}, taskWin = {};
  rolled.zones.forEach(function (z) {
    const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
    zoneTaskId[z.id] = tid;
    const sDays = Math.round((z.start - minStart) / 86400000);
    let eDays = Math.round((z.end - minStart) / 86400000);
    if (eDays <= sDays) eDays = sDays + 1;
    taskWin[tid] = { s: minStart + sDays * 86400000, e: minStart + eDays * 86400000 };
  });
  // §ZONE_EDGE_LEAD-equivalent: edge existence between two TASKS (post phase/storey grouping)
  const taskEdge = {};
  rolled.edges.forEach(function (e) {
    const p = zoneTaskId[e.predId], s = zoneTaskId[e.succId]; if (!p || !s || p === s) return;
    taskEdge[p + '->' + s] = 1;
  });

  // per-element zone id + task assignment (mirrors deriveZones' own zid construction)
  function zoneIdOf(e) { return (e.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(e.storey); }

  const _allScheduled = elements.map(function (el) {
    const st = schedule[el.guid]; if (!st) return null;
    const zid = zoneIdOf(el), tid = zoneTaskId[zid];
    return { guid: el.guid, s: st.start, e: st.end, bz: el.bz, tz: el.tz,
      x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, cls: el.cls, seq: el.seq,
      task: tid, zoneId: zid };
  }).filter(Boolean);
  console.log('§CAP_SCHEDULED n=' + _allScheduled.length);

  if (process.env.RAW_TASK_DUMP) {
    const tgt = process.env.RAW_TASK_DUMP;
    const zw = taskWin[tgt];
    const raw = _allScheduled.filter(o => o.task === tgt);
    const rawS = raw.map(o => o.s).sort((a, b) => a - b);
    console.log('§RAW_TASK_DUMP task=' + tgt + ' n=' + raw.length +
      ' zoneWindow=[' + new Date(zw.s).toISOString().slice(0,10) + '..' + new Date(zw.e).toISOString().slice(0,10) + ']' +
      ' rawSMin=' + new Date(rawS[0]).toISOString().slice(0,10) +
      ' rawSMax=' + new Date(rawS[rawS.length-1]).toISOString().slice(0,10));
    // day-resolution histogram of raw start times across the zone's own [start,end]
    const dayBuckets = {};
    raw.forEach(o => { const d = Math.round((o.s - zw.s) / 86400000); dayBuckets[d] = (dayBuckets[d] || 0) + 1; });
    const days = Object.keys(dayBuckets).map(Number).sort((a, b) => a - b);
    console.log('§RAW_TASK_DUMP_DAYS ' + JSON.stringify(days.map(d => [d, dayBuckets[d]])));
  }

  // PRE-repair, RAW generative floating (sanity baseline, no rescale/no repair)
  const rawCensus = floatingCensus(_allScheduled.map(o => Object.assign({}, o)));
  console.log('§CAP_RAW_FLOATING midair=' + rawCensus.midair + ' orphans=' + rawCensus.orphans);

  // §GANTT_GAP_CLAMP_SPREAD rescale, verbatim (time_machine.js injectGantt _cap overlay) — each gap
  // gets its real value-scaled size OR the fair rank/count share, whichever is SMALLER (only
  // abnormal dead-air gaps get clamped; normal real gaps stay byte-identical to the original).
  // §CHASE_TO_ZERO_WINDOW_AUTHORING (2026-08-16): the shipped rescale, extracted into a function so
  // the EXP5 family can re-run the WHOLE pipeline under candidate window authorings. Body verbatim.
  function applyGapClampRescale(items, win) {
  const _taskItems = {}, _taskSpan = {};
  items.forEach(function (item) {
    (_taskItems[item.task] = _taskItems[item.task] || []).push(item);
    const sp = _taskSpan[item.task] || (_taskSpan[item.task] = { min: Infinity, max: -Infinity });
    if (item.s < sp.min) sp.min = item.s;
    if (item.e > sp.max) sp.max = item.e;
  });
  Object.keys(_taskItems).forEach(function (tid) {
    const arr = _taskItems[tid], w = win[tid], sp = _taskSpan[tid];
    const tSpan = Math.max(1, w.e - w.s), lsSpan = Math.max(1, sp.max - sp.min);
    const durFactor = tSpan / lsSpan;
    arr.sort(function (a, b) { return a.s - b.s || (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0); });
    const N = arr.length;
    // Pass 1 — clamp only STATISTICAL OUTLIER gaps (median * K), not every gap against a naive
    // tSpan/N fair share — with N in the thousands that share is often smaller than most REAL
    // gaps too, so almost everything got clamped (measured: converged to near-identical Q1
    // regression as pure rank/count spacing, 97.78% vs 97.80%). Median-based threshold only
    // touches genuine dead-air outliers; normal real gaps (the bulk of the distribution) pass
    // through untouched.
    const K = Number(process.env.GAP_CLAMP_K || 500);
    const rawValGaps = new Array(N);
    rawValGaps[0] = (arr[0].s - sp.min) * durFactor;
    for (let gi = 1; gi < N; gi++) rawValGaps[gi] = (arr[gi].s - arr[gi - 1].s) * durFactor;
    let target = 0; for (let gi = 0; gi < N; gi++) target += rawValGaps[gi];
    const sortedGaps = rawValGaps.slice(1).sort((a, b) => a - b);
    const medGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 0;
    const cap = Math.max(medGap * K, 60000);
    const clampedGap = new Array(N);
    clampedGap[0] = rawValGaps[0]; // never clamp the lead gap — outlier stat is about inter-element spacing
    let clampedSum = clampedGap[0];
    for (let gi = 1; gi < N; gi++) {
      clampedGap[gi] = Math.min(rawValGaps[gi], cap);
      clampedSum += clampedGap[gi];
    }
    // Pass 2 — redistribute EXACTLY what clamping removed (target - clampedSum), as an equal
    // additive pad — reduces to the identity (byte-identical to the original formula) when
    // nothing gets clamped, since target === clampedSum in that case.
    const pad = Math.max(0, target - clampedSum) / N;
    let cursor = w.s;
    for (let pi = 0; pi < N; pi++) {
      const item = arr[pi];
      const scaledDur = Math.max(60000, Math.floor(Math.max(0, item.e - item.s) * durFactor));
      cursor += clampedGap[pi] + pad;
      item.s = Math.floor(cursor);
      item.e = item.s + scaledDur;
    }
  });
  }
  const rescaled = _allScheduled.map(o => Object.assign({}, o));
  applyGapClampRescale(rescaled, taskWin);

  const preRepair = floatingCensus(rescaled.map(o => Object.assign({}, o)));
  console.log('§CAP_PRE_REPAIR_FLOATING midair=' + preRepair.midair + ' byClass=' + JSON.stringify(preRepair.byClass));

  // PRE-repair (post-rescale, before _ogSupportSweep) spread for the one task whose POST-repair
  // spread was starkly bimodal [1571,0,0,0,0,0,0,0,0,2779] — does the gap already exist before any
  // repair push, or does _ogSupportSweep itself CREATE the gap?
  if (process.env.SPREAD_PRE_TASK) {
    const tgt = process.env.SPREAD_PRE_TASK;
    const w0 = taskWin[tgt];
    const xs0 = rescaled.filter(o => o.task === tgt).map(o => (o.s - w0.s) / Math.max(1, w0.e - w0.s));
    const b0 = new Array(12).fill(0);
    xs0.forEach(x => b0[Math.max(0, Math.min(11, Math.floor(x * 10) + 1))]++);
    console.log('§CAP_SPREAD_PRE_REPAIR task=' + tgt + ' n=' + xs0.length + ' hist(<0,0-1,1-2,...,9-10,>1)=' + JSON.stringify(b0));
    const byClsPre = {};
    rescaled.filter(o => o.task === tgt).forEach(o => { byClsPre[o.cls] = (byClsPre[o.cls] || 0) + 1; });
    console.log('§CAP_SPREAD_PRE_REPAIR_BYCLASS task=' + tgt + ' ' + JSON.stringify(byClsPre));
  }

  // _ogSupportSweep repair (mutates rescaled in place, sorts by bz)
  const beforeByGuid = {}; rescaled.forEach(o => beforeByGuid[o.guid] = o.s);
  const forRepair = rescaled.map(o => Object.assign({}, o));
  _ogSupportSweep(forRepair, taskWin);
  const postRepair = floatingCensus(forRepair);
  console.log('§CAP_POST_REPAIR_FLOATING total=' + postRepair.midair + '/' + forRepair.length +
    ' orphans=' + postRepair.orphans + ' grounded=' + postRepair.grounded + ' ok=' + (forRepair.length - postRepair.midair - postRepair.orphans - postRepair.grounded));
  console.log('§CAP_POST_REPAIR_BYCLASS ' + JSON.stringify(postRepair.byClass));
  let maxShiftMs = 0, maxShiftGuid = null, pushedN = 0, shiftSum = 0;
  forRepair.forEach(o => {
    const d = o.s - beforeByGuid[o.guid];
    if (d > 0) { pushedN++; shiftSum += d; if (d > maxShiftMs) { maxShiftMs = d; maxShiftGuid = o.guid; } }
  });
  console.log('§CAP_PUSH_STATS pushed=' + pushedN + ' maxShiftDays=' + (maxShiftMs / 86400000).toFixed(1) +
    ' meanShiftDays=' + (pushedN ? (shiftSum / pushedN / 86400000).toFixed(2) : 0) + ' maxShiftGuid=' + maxShiftGuid);

  // ══ §GANTT_WINDOW_FIDELITY_AND_SPREAD — Q1: does the FINAL (post-_ogSupportSweep) display date
  // still sit inside its own task's authored [schedule_start, schedule_finish]? Same population/
  // same taskWin map §GANTT_TASK_WINDOW_FIDELITY (PR #1368) measured 97.87%/62063/63415 against,
  // re-measured here AFTER §OG_HANG_BAND (PR #1375) widened _ogSupportSweep's push reach. ══════════
  let inWindow = 0, outWindow = 0; const outByClass = {};
  const normItems = []; // Q2: {x: normalized start pos, cls, task, dur: element's own s..e span vs task span}
  const overshootDays = [];
  forRepair.forEach(function (item) {
    const w = taskWin[item.task]; if (!w) return;
    if (item.s >= w.s && item.e <= w.e) {
      inWindow++;
      const span = Math.max(1, w.e - w.s);
      normItems.push({ x: (item.s - w.s) / span, cls: item.cls, task: item.task,
        elemDurFracOfTask: (item.e - item.s) / span });
    } else {
      outWindow++; outByClass[item.cls] = (outByClass[item.cls] || 0) + 1;
      const over = Math.max(0, item.e - w.e, w.s - item.s) / 86400000;
      overshootDays.push(over);
    }
  });
  if (overshootDays.length) {
    overshootDays.sort((a, b) => a - b);
    const osN = overshootDays.length;
    console.log('§CAP_OVERSHOOT_DAYS n=' + osN + ' p50=' + overshootDays[Math.floor(osN * 0.5)].toFixed(2) +
      ' p90=' + overshootDays[Math.floor(osN * 0.9)].toFixed(2) + ' max=' + overshootDays[osN - 1].toFixed(2));
  }
  const totalWin = inWindow + outWindow;
  console.log('§CAP_WINDOW_FIDELITY inWindow=' + inWindow + '/' + totalWin + ' pct=' +
    (100 * inWindow / totalWin).toFixed(2) + ' outWindow=' + outWindow);
  console.log('§CAP_WINDOW_FIDELITY_OUT_BYCLASS ' + JSON.stringify(outByClass));

  // ══ §CROSSTASK_JUDGE_PARITY Step 1 (2026-08-16, 4D_SCHEDULE_PERFECTION.md) — residual
  // decomposition: WHY does each post-repair floating element stay floating? Two axes:
  //   reachability — REACHABLE (first-contact start + own dur fits own window) / WINDOW_BLOCKED /
  //                  ALREADY_OUT (element already sits outside its window);
  //   role — GROUND_CARRIER (grounded && seq<=4 && every contact merely STANDS ON it —
  //          S.bz >= T.tz - GAP, the judge's role-blind carrier-above clause) vs rest;
  //   pool — first contact inside vs outside _ogSupportSweep's carrier pool. ══════════════════════
  {
    const GAPc = ScheduleGate.GAP;
    const inPool = S => (S.seq <= 4 || (S.cls === 'IfcSlab' && S.seq > 4) || S.cls.indexOf('IfcWall') === 0);
    const Gd = postRepair.G;
    const reach = { REACHABLE: 0, WINDOW_BLOCKED: 0, ALREADY_OUT: 0 };
    let groundCarrier = 0, poolIn = 0, poolOut = 0;
    const gcByClass = {}, reachByClass = {};
    for (let i = 0; i < forRepair.length; i++) {
      const list = Gd.contacts[i]; if (!list) continue;
      const T = forRepair[i];
      let first = Infinity, firstIdx = -1;
      for (const k of list) { if (forRepair[k].s < first) { first = forRepair[k].s; firstIdx = k; } }
      if (first <= T.s + 1) continue;                       // not floating
      const w = taskWin[T.task];
      const dur = Math.max(60000, T.e - T.s);
      let cat;
      if (!w || T.s < w.s || T.e > w.e) cat = 'ALREADY_OUT';
      else if (first + dur <= w.e) cat = 'REACHABLE';
      else cat = 'WINDOW_BLOCKED';
      reach[cat]++;
      (reachByClass[cat] = reachByClass[cat] || {})[T.cls] = (reachByClass[cat][T.cls] || 0) + 1;
      let allStandOn = true;
      for (const k of list) { if (forRepair[k].bz < T.tz - GAPc) { allStandOn = false; break; } }
      if (Gd.grounded[i] && T.seq <= 4 && allStandOn) { groundCarrier++; gcByClass[T.cls] = (gcByClass[T.cls] || 0) + 1; }
      if (inPool(forRepair[firstIdx])) poolIn++; else poolOut++;
    }
    console.log('§CJP_DECOMP reach=' + JSON.stringify(reach) + ' groundCarrier=' + groundCarrier +
      ' firstContactPool in=' + poolIn + ' out=' + poolOut);
    console.log('§CJP_DECOMP_GROUND_BYCLASS ' + JSON.stringify(gcByClass));
    Object.keys(reachByClass).forEach(cat =>
      console.log('§CJP_DECOMP_' + cat + '_BYCLASS ' + JSON.stringify(reachByClass[cat])));
  }

  // ══ §CROSSTASK_JUDGE_PARITY Step 2 — EXP4: window-bounded judge-parity fixpoint AFTER
  // _ogSupportSweep. The EXACT judge rule (§MIDAIR_REPAIR's weakest rule: an element may not appear
  // before the first element it physically touches), pushed monotone-later only, clamped to the
  // element's OWN task window (§OG_HANG_WINDOW_BOUND discipline — the thing the rejected 2026-08-13
  // _midairRepair swap lacked). Never touches an element already out of window. ════════════════════
  {
    // sliced from the SHIPPED time_machine.js — the probe measures the real function, never a copy
    const exp4 = forRepair.map(o => Object.assign({}, o));
    const r4 = _cjpJudgeParity(exp4, taskWin);
    const pushed = r4.pushed, sweeps = r4.sweeps;
    const exp4Census = floatingCensus(exp4.map(o => Object.assign({}, o)));
    let inW4 = 0, outW4 = 0;
    exp4.forEach(function (item) {
      const w = taskWin[item.task]; if (!w) return;
      if (item.s >= w.s && item.e <= w.e) inW4++; else outW4++;
    });
    console.log('§EXP4_PUSH pushed=' + pushed + ' sweeps=' + sweeps);
    console.log('§EXP4_FINAL total=' + exp4Census.midair + '/' + exp4.length +
      ' orphans=' + exp4Census.orphans + ' grounded=' + exp4Census.grounded);
    console.log('§EXP4_FINAL_BYCLASS ' + JSON.stringify(exp4Census.byClass));
    console.log('§EXP4_WINDOW_FIDELITY inWindow=' + inW4 + '/' + (inW4 + outW4) + ' pct=' +
      (100 * inW4 / Math.max(1, inW4 + outW4)).toFixed(2) + ' outWindow=' + outW4);
  }

  // Q2 — distribution of normalized position within the bar for in-window elements
  const normPositions = normItems.map(function (o) { return o.x; }).sort(function (a, b) { return a - b; });
  const n = normPositions.length;
  const mean = normPositions.reduce(function (a, b) { return a + b; }, 0) / n;
  const median = n % 2 ? normPositions[(n - 1) / 2] : (normPositions[n / 2 - 1] + normPositions[n / 2]) / 2;
  const variance = normPositions.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / n;
  const stddev = Math.sqrt(variance);
  const buckets = new Array(10).fill(0);
  normPositions.forEach(function (x) { buckets[Math.min(9, Math.floor(x * 10))]++; });
  // one-sample KS statistic vs Uniform(0,1): D = max(D+, D-) over the sorted sample
  let dPlus = 0, dMinus = 0;
  for (let i = 0; i < n; i++) {
    const cdfEmpUpper = (i + 1) / n, cdfEmpLower = i / n, x = normPositions[i];
    if (cdfEmpUpper - x > dPlus) dPlus = cdfEmpUpper - x;
    if (x - cdfEmpLower > dMinus) dMinus = x - cdfEmpLower;
  }
  const ks = Math.max(dPlus, dMinus);
  console.log('§CAP_SPREAD n=' + n + ' mean=' + mean.toFixed(4) + ' median=' + median.toFixed(4) +
    ' stddev=' + stddev.toFixed(4) + ' ks_vs_uniform=' + ks.toFixed(4));
  console.log('§CAP_SPREAD_HISTOGRAM ' + JSON.stringify(buckets.map(function (c, i) {
    return { bucket: (i / 10).toFixed(1) + '-' + ((i + 1) / 10).toFixed(1), count: c, pct: (100 * c / n).toFixed(2) };
  })));

  // WHICH classes/tasks dominate the two extreme buckets vs the sparse middle?
  const frontBucket = {}, backBucket = {}, midBucket = {};
  const frontTasks = {}, backTasks = {};
  normItems.forEach(function (o) {
    if (o.x < 0.1) { frontBucket[o.cls] = (frontBucket[o.cls] || 0) + 1; frontTasks[o.task] = (frontTasks[o.task] || 0) + 1; }
    else if (o.x >= 0.9) { backBucket[o.cls] = (backBucket[o.cls] || 0) + 1; backTasks[o.task] = (backTasks[o.task] || 0) + 1; }
    else if (o.x >= 0.4 && o.x < 0.6) { midBucket[o.cls] = (midBucket[o.cls] || 0) + 1; }
  });
  function top(obj, k) { return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k); }
  console.log('§CAP_SPREAD_FRONT_BYCLASS(top8) ' + JSON.stringify(top(frontBucket, 8)));
  console.log('§CAP_SPREAD_BACK_BYCLASS(top8) ' + JSON.stringify(top(backBucket, 8)));
  console.log('§CAP_SPREAD_MID_BYCLASS(top8) ' + JSON.stringify(top(midBucket, 8)));
  console.log('§CAP_SPREAD_FRONT_BYTASK(top6) ' + JSON.stringify(top(frontTasks, 6)));
  console.log('§CAP_SPREAD_BACK_BYTASK(top6) ' + JSON.stringify(top(backTasks, 6)));

  // Per-task spread: for a handful of the LARGEST tasks by element count, is EACH ONE individually
  // U-shaped, or is the aggregate U-shape an artifact of averaging many differently-shaped tasks?
  const byTask = {};
  normItems.forEach(function (o) { (byTask[o.task] || (byTask[o.task] = [])).push(o.x); });
  const taskSizes = Object.entries(byTask).map(function (e) { return [e[0], e[1].length]; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
  taskSizes.forEach(function (e) {
    const xs = byTask[e[0]];
    const b10 = new Array(10).fill(0);
    xs.forEach(function (x) { b10[Math.min(9, Math.floor(x * 10))]++; });
    console.log('§CAP_SPREAD_PER_TASK task=' + e[0] + ' n=' + e[1] + ' hist=' + JSON.stringify(b10));
  });

  // For floating IfcBuildingElementProxy: does an edge exist between ITS task and its first-
  // contact's task? This is the direct test of the "missing cross-zone CPM edge" hypothesis.
  const byGuid = {}; forRepair.forEach((o, i) => byGuid[o.guid] = i);
  const G = postRepair.G;
  let edgeMissing = 0, edgeExists = 0, sameTask = 0, sampleGaps = [];
  for (let i = 0; i < forRepair.length; i++) {
    const T = forRepair[i];
    if (T.cls !== 'IfcBuildingElementProxy') continue;
    const list = G.contacts[i]; if (!list) continue;
    let first = Infinity, firstIdx = -1;
    for (const k of list) { if (forRepair[k].s < first) { first = forRepair[k].s; firstIdx = k; } }
    if (first <= T.s + 1) continue; // not floating
    const S = forRepair[firstIdx];
    if (S.task === T.task) { sameTask++; continue; }
    const has = taskEdge[S.task + '->' + T.task];
    if (has) edgeExists++; else {
      edgeMissing++;
      if (sampleGaps.length < 15) sampleGaps.push({ proxy: T.guid, proxyTask: T.task, carrierCls: S.cls, carrierTask: S.task, gapDays: ((first - T.s) / 86400000).toFixed(1) });
    }
  }
  console.log('§CAP_PROXY_EDGE_CHECK sameTask=' + sameTask + ' edgeExists=' + edgeExists + ' edgeMissing=' + edgeMissing);
  console.log('§CAP_PROXY_EDGE_SAMPLES ' + JSON.stringify(sampleGaps, null, 1));

  // ══ EXPERIMENT 3 — repair BEFORE the window is computed, not after ═══════════════════════════
  // Prior 2 attempts (documented, both ruled out) ran a repair AFTER materializeZones had already
  // computed each task's window from the raw generative times, so a cross-zone push necessarily
  // desynced the display from the already-fixed Gantt dates. Untried variant: run the SAME proven
  // fixpoint (_midairRepair, already gets generative floating to 0 on all 7 buildings) on the RAW
  // per-element schedule BEFORE deriveZones ever computes zone start/end — so materializeZones'
  // window is built FROM the corrected times, and can never be "desynced" from a Gantt that is
  // itself derived from those same corrected times. No display-layer trick, no bolt-on: this is
  // "give the task a window that already accounts for its real physical dependency", literally.
  const preZoneItems = _allScheduled.map(o => Object.assign({}, o));
  const mrStats = _midairRepair(preZoneItems);
  console.log('§EXP3_MIDAIR_REPAIR_RAW ' + JSON.stringify(mrStats));
  const repairedCensusRaw = floatingCensus(preZoneItems.map(o => Object.assign({}, o)));
  console.log('§EXP3_RAW_POST_REPAIR midair=' + repairedCensusRaw.midair);

  // Re-derive zones/windows from the REPAIRED per-element times (same deriveZones call, different input)
  const repairedSchedule = {};
  preZoneItems.forEach(function (it) { repairedSchedule[it.guid] = { start: it.s, end: it.e }; });
  const rolled2 = ScheduleGate.deriveZones(elements, repairedSchedule);
  const minStart2 = Math.min.apply(null, rolled2.zones.map(z => z.start));
  const zoneTaskId2 = {}, taskWin2 = {};
  rolled2.zones.forEach(function (z) {
    const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
    zoneTaskId2[z.id] = tid;
    const sDays = Math.round((z.start - minStart2) / 86400000);
    let eDays = Math.round((z.end - minStart2) / 86400000);
    if (eDays <= sDays) eDays = sDays + 1;
    taskWin2[tid] = { s: minStart2 + sDays * 86400000, e: minStart2 + eDays * 86400000 };
  });
  // compare total project span: does authoring off repaired times blow up totalDays?
  const maxEnd2 = Math.max.apply(null, rolled2.zones.map(z => z.end));
  const totalDays2 = Math.round((maxEnd2 - minStart2) / 86400000);
  const maxEnd1 = Math.max.apply(null, rolled.zones.map(z => z.end));
  const totalDays1 = Math.round((maxEnd1 - minStart) / 86400000);
  console.log('§EXP3_TOTAL_DAYS before=' + totalDays1 + ' after=' + totalDays2 + ' delta=' + (totalDays2 - totalDays1));

  // full pipeline on the repaired-zone windows: same rescale + _ogSupportSweep as the shipped path
  const exp3Items = preZoneItems.map(function (o) {
    return Object.assign({}, o, { task: zoneTaskId2[o.zoneId] });
  });
  const _taskSpan3 = {};
  exp3Items.forEach(function (item) {
    const sp = _taskSpan3[item.task] || (_taskSpan3[item.task] = { min: Infinity, max: -Infinity });
    if (item.s < sp.min) sp.min = item.s;
    if (item.e > sp.max) sp.max = item.e;
  });
  exp3Items.forEach(function (item) {
    const w = taskWin2[item.task], sp = _taskSpan3[item.task];
    const tSpan = Math.max(1, w.e - w.s), lsSpan = Math.max(1, sp.max - sp.min);
    item.s = w.s + Math.floor(((item.s - sp.min) / lsSpan) * tSpan);
    item.e = w.s + Math.floor(((item.e - sp.min) / lsSpan) * tSpan);
    if (item.e <= item.s) item.e = item.s + 60000;
  });
  const exp3PreRepair = floatingCensus(exp3Items.map(o => Object.assign({}, o)));
  console.log('§EXP3_PRE_OGSWEEP_FLOATING midair=' + exp3PreRepair.midair);
  const exp3ForRepair = exp3Items.map(o => Object.assign({}, o));
  _ogSupportSweep(exp3ForRepair, taskWin2);
  const exp3Post = floatingCensus(exp3ForRepair);
  console.log('§EXP3_FINAL total=' + exp3Post.midair + '/' + exp3ForRepair.length +
    ' orphans=' + exp3Post.orphans + ' grounded=' + exp3Post.grounded +
    ' ok=' + (exp3ForRepair.length - exp3Post.midair - exp3Post.orphans - exp3Post.grounded));
  console.log('§EXP3_FINAL_BYCLASS ' + JSON.stringify(exp3Post.byClass));

  // ══ §CHASE_TO_ZERO_WINDOW_AUTHORING (2026-08-16) — EXP5 family. The §CROSSTASK_JUDGE_PARITY
  // residual is 100% WINDOW_BLOCKED, so zero requires the BARS to change, not the elements'
  // relation to their bars. Both candidates run the FULL shipped pipeline (clamp rescale ->
  // _ogSupportSweep -> _cjpJudgeParity) — the third-lever lesson: nothing is judged mid-pipe. ═════
  function runPipeline(base, win) {
    const items = base.map(o => Object.assign({}, o));
    applyGapClampRescale(items, win);
    _ogSupportSweep(items, win);
    _cjpJudgeParity(items, win);
    return items;
  }
  function measureWin(items, win) {
    const c = floatingCensus(items.map(o => Object.assign({}, o)));
    let inW = 0, outW = 0;
    items.forEach(it => { const w = win[it.task]; if (!w) return; if (it.s >= w.s && it.e <= w.e) inW++; else outW++; });
    return { c, inW, outW };
  }
  const DAY5 = 86400000;

  // EXP5a — minimal authored-END extension, whole-pipeline fixpoint. Only ends move, only where a
  // WINDOW_BLOCKED element measurably needs it, day-quantized, iterated because an extension
  // changes that task's own rescale (durFactor) and can move other tasks' first-contact times.
  {
    const win5 = {}; Object.keys(taskWin).forEach(t => win5[t] = { s: taskWin[t].s, e: taskWin[t].e });
    const extTotals = {};
    let iter = 0, final = null, converged = false;
    for (; iter < 8; iter++) {
      const items = runPipeline(_allScheduled, win5);
      const m = measureWin(items, win5);
      const G5 = _contactGraph(items);
      const ext = {}; let blocked = 0; const gapDays = [];
      for (let i = 0; i < items.length; i++) {
        const list = G5.contacts[i]; if (!list) continue;
        const T = items[i];
        let first = Infinity;
        for (const k of list) { if (items[k].s < first) first = items[k].s; }
        if (first <= T.s + 1) continue;
        const w = win5[T.task]; if (!w) continue;
        const dur = Math.max(60000, T.e - T.s);
        const need = (first + dur) - w.e;
        if (need > 0) { blocked++; gapDays.push(need / DAY5); ext[T.task] = Math.max(ext[T.task] || 0, need); }
      }
      if (iter === 0 && gapDays.length) {
        gapDays.sort((a, b) => a - b);
        const gN = gapDays.length;
        console.log('§EXP5_DIAG blockedNeedingExt=' + blocked + ' tasks=' + Object.keys(ext).length +
          ' needDays p50=' + gapDays[Math.floor(gN * 0.5)].toFixed(1) +
          ' p90=' + gapDays[Math.floor(gN * 0.9)].toFixed(1) + ' max=' + gapDays[gN - 1].toFixed(1));
        console.log('§EXP5_DIAG_TASKS ' + JSON.stringify(Object.entries(ext).map(e => [e[0], (e[1] / DAY5).toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 8)));
      }
      console.log('§EXP5A_ITER ' + iter + ' floating=' + m.c.midair + ' blockedNeedingExt=' + blocked +
        ' inWindow=' + m.inW + ' outWindow=' + m.outW);
      final = m;
      if (!blocked) { converged = true; break; }
      Object.keys(ext).forEach(t => {
        const addDays = Math.ceil(ext[t] / DAY5);
        win5[t].e += addDays * DAY5;
        extTotals[t] = (extTotals[t] || 0) + addDays;
      });
    }
    const extList = Object.entries(extTotals).sort((a, b) => b[1] - a[1]);
    let maxE0 = 0, maxE1 = 0;
    Object.keys(taskWin).forEach(t => { if (taskWin[t].e > maxE0) maxE0 = taskWin[t].e; });
    Object.keys(win5).forEach(t => { if (win5[t].e > maxE1) maxE1 = win5[t].e; });
    console.log('§EXP5A_FINAL floating=' + final.c.midair + ' converged=' + converged + ' iters=' + (iter + 1) +
      ' tasksExtended=' + extList.length + ' inWindow=' + final.inW + ' outWindow=' + final.outW +
      ' totalDaysDelta=' + Math.round((maxE1 - maxE0) / DAY5) +
      ' orphans=' + final.c.orphans + ' grounded=' + final.c.grounded);
    console.log('§EXP5A_EXT_DAYS_BYTASK ' + JSON.stringify(extList.slice(0, 8)));
  }

  // EXP5b — EXP3 revisited WITH the parity layer: windows derived FROM the repaired raw times,
  // then the full shipped pipeline. preZoneItems/taskWin2/zoneTaskId2 come from the EXP3 block.
  {
    const base5b = preZoneItems.map(o => Object.assign({}, o, { task: zoneTaskId2[o.zoneId] }));
    const items = runPipeline(base5b, taskWin2);
    const m = measureWin(items, taskWin2);
    console.log('§EXP5B_FINAL floating=' + m.c.midair + ' inWindow=' + m.inW + ' outWindow=' + m.outW +
      ' orphans=' + m.c.orphans + ' grounded=' + m.c.grounded);
    console.log('§EXP5B_FINAL_BYCLASS ' + JSON.stringify(m.c.byClass));
  }

  // ══ EXP6 — BROWSER-FAITHFUL captured pipeline (2026-08-16, §CHASE_TO_ZERO_WINDOW_AUTHORING
  // correction from the user's live Hospital log). Everything above feeds the rescale from
  // computeSchedule's RAW times — but the real injectGantt overlay reads kernel_ops timestamps,
  // which carry the TWO-TIER DISPLAY timeline (_twoTierRemap + _midairRepair, §TIER_SERIAL 420d on
  // Hospital), while task windows are authored from the RAW schedule (334d). Live divergence proof:
  // browser §PHASE_OVERLAP_SUPPORT_GUARD pushed=4117 vs this probe's raw-fed 1152. This section
  // reproduces the REAL input using witness_midair_zero.js's validated display-timeline recipe. ════
  {
    const vm = require('vm');
    function sliceAt(src, name, which, optional) {
      let from = 0;
      for (let pass = 0; pass <= (which || 0); pass++) {
        const idx = src.indexOf('function ' + name + '(', from);
        if (idx < 0) { if (optional) return null; throw new Error(name + ' not found'); }
        let depth = 0, i = idx, seenOpen = false;
        for (; i < src.length; i++) {
          if (src[i] === '{') { depth++; seenOpen = true; }
          else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
        }
        if (pass === (which || 0)) return src.slice(idx, i + 1);
        from = i + 1;
      }
    }
    let mrCount = 0, mrFrom = 0;
    for (;;) { const k = tmSrc.indexOf('function _midairRepair(', mrFrom); if (k < 0) break; mrCount++; mrFrom = k + 1; }
    const zoneParts = [sliceAt(tmSrc, '_zoneIndexBuild', 0, true), sliceAt(tmSrc, '_zoneIndex', 0, true)].filter(Boolean);
    const classifyParts = [sliceAt(tmSrc, '_classifyNameOverride', 0, true), sliceAt(tmSrc, '_classifyRule', 0, true)].filter(Boolean);
    const sliced = ["var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];",
      (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
      sliceAt(tmSrc, '_zoneOf', 0, true) || '', classifyParts[0] || '', classifyParts[1] || '',
      sliceAt(tmSrc, '_promoteRoofLoadPath'), sliceAt(tmSrc, '_buildXrayElements'),
      sliceAt(tmSrc, '_tier1Extents'), sliceAt(tmSrc, '_tier1Serialize'),
      sliceAt(tmSrc, '_tier1Protrusion'), sliceAt(tmSrc, '_tierAuditRegate'),
      sliceAt(tmSrc, '_twoTierRemap'), sliceAt(tmSrc, '_contactGraph'),
      sliceAt(tmSrc, '_midairRepair', mrCount - 1)].join('\n');
    const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: RATES.SEQUENCE_RULES, SEQUENCE_DEFAULT: RATES.SEQUENCE_DEFAULT,
        SEQUENCE_NAME_OVERRIDES: RATES.SEQUENCE_NAME_OVERRIDES },
      ScheduleGate: ScheduleGate, Math: Math, A: () => ({ db: db }) };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__remap = _twoTierRemap; this.__repair = _midairRepair;', sandbox);
    const els6 = sandbox.__bxe();
    const nameOf = {};
    const nr = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[2]; });
    const frag = ScheduleAuthor._classFragmentation(db, RATES.RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES.RATES);
    const geoEls = els6.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => {
      const rule = ScheduleAuthor.matchNameOverride(e.cls, nameOf[e.guid] || '', RATES.SEQUENCE_NAME_OVERRIDES) ||
        ScheduleAuthor.matchRule(e.cls, RATES.SEQUENCE_RULES, RATES.SEQUENCE_DEFAULT);
      if (!e.phase) e.phase = rule.phase;
      e.resource = rule.resource || '_DEFAULT';
      const realQty = (frag.fragmented[e.cls] && frag.area[e.guid] != null) ? frag.area[e.guid] : null;
      const span = Math.max(e.x1 - e.x0, e.y1 - e.y0, e.top_z - e.base_z);
      const avgLen = lin.avgLength[e.cls];
      const lengthRatio = (realQty == null && span > 0 && avgLen > 0) ? span / avgLen : null;
      e.installSecs = ScheduleAuthor._installSecs(e.cls, rule, RATES.LABOR_RATES, realQty, lengthRatio);
    });
    const sched6 = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews, SHIFT_HOURS);
    // windows from RAW schedule — materializeZones semantics (what the browser's tasks table holds)
    const rolled6 = ScheduleGate.deriveZones(geoEls, sched6);
    const minStart6 = Math.min.apply(null, rolled6.zones.map(z => z.start));
    const zoneTaskId6 = {}, taskWin6 = {};
    rolled6.zones.forEach(function (z) {
      const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
      zoneTaskId6[z.id] = tid;
      const sD = Math.round((z.start - minStart6) / DAY5);
      let eD = Math.round((z.end - minStart6) / DAY5);
      if (eD <= sD) eD = sD + 1;
      taskWin6[tid] = { s: minStart6 + sD * DAY5, e: minStart6 + eD * DAY5 };
    });
    // DISPLAY timeline (what kernel_ops actually carries): two-tier remap + midair repair
    const disp = geoEls.map(e => ({ guid: e.guid, s: sched6[e.guid].start, e: sched6[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1,
      cls: e.cls, seq: e.seq, phase: e.phase, storey: e.storey }));
    const _preRemapS = {}; disp.forEach(function (o) { _preRemapS[o.guid] = o.s; });
    sandbox.__items = disp;
    vm.runInContext('this.__remap(this.__items);', sandbox);
    // §STOREY_ORDER_REPORT — split remap vs repair to localize suspect (c) inside DISPLAY.
    storeyOrderReport(disp.map(function (o) {
      return { storey: ScheduleGate.collapsePhase(o.storey), bz: o.bz, s: o.s };
    }), 'POST_REMAP_LEVEL');
    // §STOREY_ORDER_L1_DIAG — who exactly moved, and by how much, within raw storey "Level 1"?
    {
      const l1 = disp.filter(function (o) { return o.storey === 'Level 1'; })
        .map(function (o) { return Object.assign({}, o, { delta: Math.round((o.s - _preRemapS[o.guid]) / DAY5) }); })
        .sort(function (a, b) { return b.delta - a.delta; });
      console.log('§STOREY_ORDER_L1_DIAG n=' + l1.length + ' top=' + JSON.stringify(
        l1.slice(0, 8).map(function (o) { return [o.guid, o.cls, o.phase, o.delta, o._t1Straggler || false]; })));
      const byPhaseDelta = {};
      l1.forEach(function (o) {
        const p = byPhaseDelta[o.phase] || (byPhaseDelta[o.phase] = { n: 0, sumDelta: 0, maxDelta: -Infinity });
        p.n++; p.sumDelta += o.delta; if (o.delta > p.maxDelta) p.maxDelta = o.delta;
      });
      console.log('§STOREY_ORDER_L1_BYPHASE ' + JSON.stringify(Object.entries(byPhaseDelta).map(function (e) {
        return [e[0], e[1].n, Math.round(e[1].sumDelta / e[1].n), e[1].maxDelta];
      })));
    }
    vm.runInContext('this.__repair(this.__items);', sandbox);
    storeyOrderReport(disp.map(function (o) {
      return { storey: ScheduleGate.collapsePhase(o.storey), bz: o.bz, s: o.s };
    }), 'DISPLAY_LEVEL');
    let noTask = 0;
    const cap6 = disp.map(o => {
      const zid = (o.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(o.storey);
      const tid = zoneTaskId6[zid];
      if (!tid) { noTask++; return null; }
      return Object.assign({}, o, { task: tid, zoneId: zid });
    }).filter(Boolean);
    console.log('§EXP6_INPUT n=' + cap6.length + ' noTask=' + noTask +
      ' displaySpanDays=' + Math.round((Math.max.apply(null, disp.map(o => o.e)) - Math.min.apply(null, disp.map(o => o.s))) / DAY5) +
      ' rawWindowSpanDays=' + Math.round((Math.max.apply(null, Object.values(taskWin6).map(w => w.e)) - minStart6) / DAY5));
    const rawC6 = floatingCensus(cap6.map(o => Object.assign({}, o)));
    console.log('§EXP6_DISPLAY_FLOATING midair=' + rawC6.midair + ' orphans=' + rawC6.orphans + ' (pre-overlay, the kernel_ops truth)');
    applyGapClampRescale(cap6, taskWin6);
    const preC6 = floatingCensus(cap6.map(o => Object.assign({}, o)));
    console.log('§EXP6_PRE_REPAIR_FLOATING midair=' + preC6.midair);
    const sweep6 = _ogSupportSweep(cap6, taskWin6);
    console.log('§EXP6_OGSWEEP pushed=' + sweep6.pushed + ' sweeps=' + sweep6.sweeps + ' (live browser said 4117/2 on Hospital)');
    const postSweep6 = floatingCensus(cap6.map(o => Object.assign({}, o)));
    console.log('§EXP6_POST_SWEEP_FLOATING midair=' + postSweep6.midair + ' byClass=' + JSON.stringify(postSweep6.byClass));
    const r6 = _cjpJudgeParity(cap6, taskWin6);
    const final6 = floatingCensus(cap6.map(o => Object.assign({}, o)));
    let inW6 = 0, outW6 = 0;
    cap6.forEach(it => { const w = taskWin6[it.task]; if (!w) return; if (it.s >= w.s && it.e <= w.e) inW6++; else outW6++; });
    console.log('§EXP6_FINAL floating=' + final6.midair + '/' + cap6.length + ' parityPushed=' + r6.pushed +
      ' (live said 542) inWindow=' + inW6 + ' outWindow=' + outW6 +
      ' orphans=' + final6.orphans + ' grounded=' + final6.grounded);
    console.log('§EXP6_FINAL_BYCLASS ' + JSON.stringify(final6.byClass));

    // ── EXP7 — author the windows FROM the display timeline (the schedule the movie actually
    // plays), so windows and element times describe ONE schedule instead of two. Same overlay
    // pipeline afterwards. Prediction: rescale ≈ identity, floating → ~0, fidelity → ~100%. ────────
    const dispMap = {};
    disp.forEach(o => { dispMap[o.guid] = { start: o.s, end: o.e }; });
    const rolled7 = ScheduleGate.deriveZones(geoEls, dispMap);
    const minStart7 = Math.min.apply(null, rolled7.zones.map(z => z.start));
    const zoneTaskId7 = {}, taskWin7 = {};
    rolled7.zones.forEach(function (z) {
      const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
      zoneTaskId7[z.id] = tid;
      const sD = Math.round((z.start - minStart7) / DAY5);
      let eD = Math.round((z.end - minStart7) / DAY5);
      if (eD <= sD) eD = sD + 1;
      taskWin7[tid] = { s: minStart7 + sD * DAY5, e: minStart7 + eD * DAY5 };
    });
    const cap7 = disp.map(o => {
      const zid = (o.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(o.storey);
      const tid = zoneTaskId7[zid];
      return tid ? Object.assign({}, o, { task: tid, zoneId: zid }) : null;
    }).filter(Boolean);
    applyGapClampRescale(cap7, taskWin7);
    const preC7 = floatingCensus(cap7.map(o => Object.assign({}, o)));
    const sweep7 = _ogSupportSweep(cap7, taskWin7);
    const r7 = _cjpJudgeParity(cap7, taskWin7);
    const final7 = floatingCensus(cap7.map(o => Object.assign({}, o)));
    let inW7 = 0, outW7 = 0;
    cap7.forEach(it => { const w = taskWin7[it.task]; if (!w) return; if (it.s >= w.s && it.e <= w.e) inW7++; else outW7++; });
    console.log('§EXP7_FINAL floating=' + final7.midair + '/' + cap7.length +
      ' preRepair=' + preC7.midair + ' sweepPushed=' + sweep7.pushed + ' parityPushed=' + r7.pushed +
      ' inWindow=' + inW7 + ' outWindow=' + outW7 + ' totalDays=' +
      Math.round((Math.max.apply(null, Object.values(taskWin7).map(w => w.e)) - minStart7) / DAY5));
    console.log('§EXP7_FINAL_BYCLASS ' + JSON.stringify(final7.byClass));

    // ── EXP8 — consistent windows (from display timeline), NO _ogSupportSweep: rescale → parity
    // only. The sweep enforces the STRICT end-based bar (§SUPPORT_CHECK), which §MIDAIR_REPAIR's
    // header deliberately does NOT enforce on the display timeline ("a slab arriving over a glowing
    // half-built column is resting, not hanging") — on a consistent-window overlay its ~24k pushes
    // are the main source of out-of-window overshoot. Does dropping it reach ~0/~100%? ─────────────
    const cap8 = disp.map(o => {
      const zid = (o.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(o.storey);
      const tid = zoneTaskId7[zid];
      return tid ? Object.assign({}, o, { task: tid, zoneId: zid }) : null;
    }).filter(Boolean);
    applyGapClampRescale(cap8, taskWin7);
    const preC8 = floatingCensus(cap8.map(o => Object.assign({}, o)));
    // §STOREY_ORDER_REPORT PRE_PARITY — after window-authoring + gap-clamp rescale, BEFORE
    // _cjpJudgeParity. Isolates suspect (b) (spread/rescale) from suspect (a) (parity pushes).
    storeyOrderReport(cap8.map(function (o) {
      return { storey: ScheduleGate.collapsePhase(o.storey), bz: o.bz, s: o.s };
    }), 'PRE_PARITY_LEVEL');
    const r8 = _cjpJudgeParity(cap8, taskWin7);
    const final8 = floatingCensus(cap8.map(o => Object.assign({}, o)));
    let inW8 = 0, outW8 = 0;
    cap8.forEach(it => { const w = taskWin7[it.task]; if (!w) return; if (it.s >= w.s && it.e <= w.e) inW8++; else outW8++; });
    console.log('§EXP8_FINAL floating=' + final8.midair + '/' + cap8.length +
      ' preRepair=' + preC8.midair + ' parityPushed=' + r8.pushed +
      ' inWindow=' + inW8 + ' outWindow=' + outW8);
    console.log('§EXP8_FINAL_BYCLASS ' + JSON.stringify(final8.byClass));

    // §CJP_DECOMP_EXP8 (2026-08-16, thread 2 of §STOREY_ORDER_REPORT's handoff — distinct from the
    // older §CJP_DECOMP block above, which runs on the superseded EXP1 raw-fed pipeline, not EXP8)
    // — per-TASK breakdown of the remaining WINDOW_BLOCKED population on the FINAL
    // (post-_cjpJudgeParity) cap8 state, reusing final8's own contact graph (same clone order, zero
    // extra scan). For each still-floating element, names the exact task window it's blocked against
    // and the gap (days by which pushing it to its real first-contact would overrun that task's
    // authored end) — the number a coverage-rounding or per-task end-nudge fix would need to close.
    {
      const G8 = final8.G;
      const byTask = {};
      let noWin = 0;
      for (let i = 0; i < cap8.length; i++) {
        const list = G8.contacts[i]; if (!list) continue;
        const T = cap8[i];
        let first = Infinity;
        for (const k of list) { const s = cap8[k].s; if (s < first) first = s; }
        if (first <= T.s + 1) continue; // not floating
        const w = taskWin7[T.task]; if (!w) { noWin++; continue; }
        const dur = Math.max(60000, T.e - T.s);
        const gapDays = ((first + dur) - w.e) / DAY5;
        const g = byTask[T.task] || (byTask[T.task] = { n: 0, sumGap: 0, maxGap: -Infinity, cls: {} });
        g.n++; g.sumGap += gapDays; if (gapDays > g.maxGap) g.maxGap = gapDays;
        g.cls[T.cls] = (g.cls[T.cls] || 0) + 1;
      }
      const rows = Object.entries(byTask).map(function (e) {
        const t = e[0], g = e[1], w = taskWin7[t];
        return { task: t, n: g.n, avgGapDays: (g.sumGap / g.n), maxGapDays: g.maxGap,
          winDays: Math.round((w.e - w.s) / DAY5), cls: g.cls };
      }).sort(function (a, b) { return b.n - a.n; });
      const totalN = rows.reduce(function (a, r) { return a + r.n; }, 0);
      console.log('§CJP_DECOMP_EXP8 n_tasks=' + rows.length + ' total=' + totalN + ' noWindow=' + noWin);
      rows.slice(0, 15).forEach(function (r) {
        console.log('§CJP_DECOMP_EXP8_TASK ' + r.task + ' n=' + r.n + ' avgGapDays=' + r.avgGapDays.toFixed(1) +
          ' maxGapDays=' + r.maxGapDays.toFixed(1) + ' winDays=' + r.winDays + ' cls=' + JSON.stringify(r.cls));
      });
    }

    // §STOREY_ORDER_REPORT (2026-08-16) FINAL — same math as the RAW call above, run on the
    // FINAL overlay times (post-_cjpJudgeParity cap8, the EXP8 winner). Comparing RAW vs FINAL
    // isolates whether §4D_BAND_MONOTONIC's ladder survives the remap/repair/window/parity chain.
    storeyOrderReport(cap8, 'FINAL_SUBSTOREY');
    storeyOrderReport(cap8.map(function (o) {
      return Object.assign({}, o, { storey: ScheduleGate.collapsePhase(o.storey) });
    }), 'FINAL_LEVEL');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
