#!/usr/bin/env node
// probe_schedule_engine.js — 4D_GANTT_TM_REFACTOR.md stage-1 witness. Feeds real fleet element
// data through ScheduleEngine.compute() and diffs its per-element output against
// ScheduleGate.computeSchedule -> CpmSchedule.run called directly (the exact reference pattern
// scripts/probe_cpm_schedule.js already uses) on the SAME data. Any divergence is a bug in the
// new class's wiring, since it repackages this pair rather than reimplementing it.
// Also confirms floating=0/7 via the same judge probe_cpm_schedule.js already uses, independently
// of the new class (proves the underlying engine is unaffected, not just that the wrapper agrees
// with itself).
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'viewer', 'cpm_schedule.js'));
const ScheduleEngine = require(path.join(__dirname, '..', 'viewer', 'schedule_engine.js'));
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

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const FLEET = (process.env.ONLY ? [process.env.ONLY] : [
  'Duplex_extracted', 'Clinic_extracted', 'HHS_Office_Federated_extracted', 'JKR_extracted',
  'Hospital_extracted', 'Terminal_extracted', 'LTU_AHouse_extracted'
]);
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;

// floatingCensus — same judge as probe_cpm_schedule.js, independent of ScheduleEngine.
function floatingCensus(items) {
  const G = _contactGraph(items);
  let midair = 0; const byClass = {};
  for (let i = 0; i < items.length; i++) {
    const list = G.contacts[i]; if (!list) continue;
    let first = Infinity;
    for (const k of list) { const s = items[k].s; if (s < first) first = s; }
    if (first > items[i].s + 1) { midair++; byClass[items[i].cls] = (byClass[items[i].cls] || 0) + 1; }
  }
  return { midair, orphans: G.orphans, grounded: G.groundedN, byClass };
}

async function runBuilding(RATES, name) {
  const SQL = await getSQL();
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, name + '.db')));
  const rawElements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT
  });
  db.close();
  const maxCrews = {};
  for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;

  // §CPM_ENGINE_REACHABILITY — proof this run exercised the REAL, required modules, not a slice.
  console.log('§CPM_ENGINE_REACHABILITY ' + name +
    ' ScheduleEngine=' + (typeof ScheduleEngine.compute === 'function') +
    ' computeSchedule=' + (typeof ScheduleGate.computeSchedule === 'function') +
    ' cpmScheduleRun=' + (typeof CpmSchedule.run === 'function'));

  // ── REFERENCE — the exact direct-call pattern probe_cpm_schedule.js already uses, unmodified.
  const refElements = rawElements.map(function (it) { return Object.assign({}, it, { bz: it.base_z, tz: it.top_z }); });
  const refSchedule = ScheduleGate.computeSchedule(refElements, 0, 1, maxCrews, SHIFT_HOURS);
  const refItems = refElements.map(function (el) {
    const st = refSchedule[el.guid]; if (!st) return null;
    return { guid: el.guid, cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey,
             x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, bz: el.bz, tz: el.tz,
             s: st.start, e: st.end, resource: el.resource };
  }).filter(Boolean);
  const refRun = CpmSchedule.run(refItems, { maxCrews: maxCrews });
  const refByGuid = {};
  refItems.forEach(function (it, i) { refByGuid[it.guid] = refRun.solution.times[i]; });

  // ── NEW CLASS — ScheduleEngine.compute(elements, opts), fed the SAME rawElements + SAME opts.
  const model = ScheduleEngine.compute(rawElements, { baseMs: 0, scaleFactor: 1, maxCrews: maxCrews, shiftHours: SHIFT_HOURS });
  if (!model.ok) { console.log('§SE_DIFF ' + name + ' FAIL error=' + model.error); return { name, fail: true }; }

  // ── DIFF — per-element start/end, converted back to the SAME ms clock as the reference (the
  // reference is ms since refRun's own base epoch; the class emits day-offset from its own solved
  // min-start — both are anchored to the SAME earliest solved start, so a day->ms conversion off
  // the class's own projectStart should reproduce the reference's ms values exactly).
  let minRefMs = Infinity;
  refItems.forEach(function (it, i) { if (refRun.solution.times[i].s < minRefMs) minRefMs = refRun.solution.times[i].s; });
  const DAY = 86400000;
  let mismatches = 0, checked = 0, maxDeltaMs = 0;
  const missingInModel = [];
  const modelByGuid = {};
  model.elements.forEach(function (e) { modelByGuid[e.guid] = e; });
  refItems.forEach(function (it, i) {
    const refT = refRun.solution.times[i];
    const me = modelByGuid[it.guid];
    if (!me) { missingInModel.push(it.guid); return; }
    checked++;
    const meS = minRefMs + me.start * DAY, meE = minRefMs + me.end * DAY;
    const dS = Math.abs(meS - refT.s), dE = Math.abs(meE - refT.e);
    if (dS > 1 || dE > 1) mismatches++;
    maxDeltaMs = Math.max(maxDeltaMs, dS, dE);
  });
  console.log('§SE_DIFF ' + name + ' refItems=' + refItems.length + ' modelElements=' + model.elements.length +
    ' checked=' + checked + ' mismatches=' + mismatches + ' missingInModel=' + missingInModel.length +
    ' maxDeltaMs=' + maxDeltaMs.toFixed(1) + ' deps=' + model.dependencies.length +
    ' milestones=' + model.milestones.length + ' tasks=' + model.tasks.length +
    ' ' + (mismatches === 0 && missingInModel.length === 0 ? 'PASS' : 'FAIL'));

  // ── FLOATING GATE — same judge, on the CPM-SOLVED items (probe_cpm_schedule.js's own
  // `cpmItems` pattern: refItems.s/e replaced with refRun.solution.times, NOT the raw pre-CPM
  // times refItems still carries at this point — floating>0 on raw-only items is expected/normal,
  // the invariant is about the CPM output). Independent of ScheduleEngine, proves the underlying
  // engine's own invariant, not just that the wrapper agrees with itself.
  const cpmItems = refItems.map(function (o, i) {
    return Object.assign({}, o, { s: refRun.solution.times[i].s, e: refRun.solution.times[i].e });
  });
  const census = floatingCensus(cpmItems);
  const STRUCTURAL = ['IfcFooting', 'IfcColumn', 'IfcBeam', 'IfcSlab'];
  let structural = 0;
  Object.keys(census.byClass).forEach(function (c) {
    if (STRUCTURAL.some(function (p) { return c.indexOf(p) === 0; })) structural += census.byClass[c];
  });
  console.log('§SE_FLOATING ' + name + ' midair=' + census.midair + ' structural=' + structural +
    ' orphans=' + census.orphans + ' ' + (census.midair === 0 && structural === 0 ? 'PASS' : 'FAIL'));

  return { name, fail: mismatches > 0 || missingInModel.length > 0 || census.midair !== 0 || structural !== 0 };
}

let _SQL = null;
async function getSQL() {
  if (_SQL) return _SQL;
  _SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  return _SQL;
}

async function main() {
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();
  let anyFail = false;
  for (const name of FLEET) {
    const r = await runBuilding(RATES, name);
    if (r.fail) anyFail = true;
  }
  console.log('§SE_FLEET_SUMMARY buildings=' + FLEET.length + ' ' + (anyFail ? 'FAIL' : 'PASS'));
  process.exit(anyFail ? 1 : 0);
}
main().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
