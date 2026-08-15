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
const _TIER1_ORDER_LINE = "var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];";
const _midairRepair = buildFn([_TIER1_ORDER_LINE, sliceFn(tmSrc, '_midairRepair')], '_midairRepair');

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

  // PRE-repair, RAW generative floating (sanity baseline, no rescale/no repair)
  const rawCensus = floatingCensus(_allScheduled.map(o => Object.assign({}, o)));
  console.log('§CAP_RAW_FLOATING midair=' + rawCensus.midair + ' orphans=' + rawCensus.orphans);

  // §GANTT_TASK_WINDOW_FIDELITY rescale, verbatim (time_machine.js:5548-5563)
  const rescaled = _allScheduled.map(o => Object.assign({}, o));
  const _taskSpan = {};
  rescaled.forEach(function (item) {
    const sp = _taskSpan[item.task] || (_taskSpan[item.task] = { min: Infinity, max: -Infinity });
    if (item.s < sp.min) sp.min = item.s;
    if (item.e > sp.max) sp.max = item.e;
  });
  rescaled.forEach(function (item) {
    const w = taskWin[item.task], sp = _taskSpan[item.task];
    const tSpan = Math.max(1, w.e - w.s), lsSpan = Math.max(1, sp.max - sp.min);
    item.s = w.s + Math.floor(((item.s - sp.min) / lsSpan) * tSpan);
    item.e = w.s + Math.floor(((item.e - sp.min) / lsSpan) * tSpan);
    if (item.e <= item.s) item.e = item.s + 60000;
  });

  const preRepair = floatingCensus(rescaled.map(o => Object.assign({}, o)));
  console.log('§CAP_PRE_REPAIR_FLOATING midair=' + preRepair.midair + ' byClass=' + JSON.stringify(preRepair.byClass));

  // _ogSupportSweep repair (mutates rescaled in place, sorts by bz)
  const beforeByGuid = {}; rescaled.forEach(o => beforeByGuid[o.guid] = o.s);
  const forRepair = rescaled.map(o => Object.assign({}, o));
  _ogSupportSweep(forRepair);
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
  _ogSupportSweep(exp3ForRepair);
  const exp3Post = floatingCensus(exp3ForRepair);
  console.log('§EXP3_FINAL total=' + exp3Post.midair + '/' + exp3ForRepair.length +
    ' orphans=' + exp3Post.orphans + ' grounded=' + exp3Post.grounded +
    ' ok=' + (exp3ForRepair.length - exp3Post.midair - exp3Post.orphans - exp3Post.grounded));
  console.log('§EXP3_FINAL_BYCLASS ' + JSON.stringify(exp3Post.byClass));
}
main().catch(e => { console.error(e); process.exit(1); });
