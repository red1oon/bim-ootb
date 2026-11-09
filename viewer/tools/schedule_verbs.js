#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — Schedule verbs `viewer.schedule_at` and `viewer.schedule_compare` (W-SCHED-VERB / -COMPARE / -RETIRE / -CACHE).
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §23.5. READ THE §-LOG (stderr) after every run: it is the evidence, nothing here silences it.
// SCOPE: READ ONLY. No DB write, no GPU, no bake, no model call. No 4D engine code is changed or re-implemented here.
//   at      --building B --day N        the 4D state at day N, read from the PERSISTED run (scripts/cache_4d_run.js, ~/.cache/bim4d/): the cache is
//                                       read when its key (building DB + the schedule code) matches; when it does not, cache_4d_run.js is run ONCE
//                                       (it persists) and then read. Elements are judged placed / frontier / future by the on-screen rule
//                                       (viewer/tm_render.js:49: placed = end_ts <= cursor; frontier = start_ts <= cursor < end_ts) over the PLAYED layer
//                                       (CACHE.layerOf(run,'played'): what the film and the Time Machine scrubber reveal). Tasks come from the run's task grid.
//   compare --building B [--shift-hours H]
//                                       ScheduleEngine.compute() against the reference pair ScheduleGate.computeSchedule -> CpmSchedule.run on the SAME
//                                       elements (the former scripts/probe_schedule_engine.js, moved here unchanged: same §SE_* lines, same numbers).
// Exit: 0 answered (JSON on stdout) · 3 INCONCLUSIVE (JSON on stdout; nothing was judged) · 1 error (reason on stderr) · 2 usage.
// Run:  node viewer/tools/schedule_verbs.js at --building Duplex --day 20
//       node viewer/tools/schedule_verbs.js compare --building Duplex
'use strict';
const __readSrc = require('../tests/_split_families.js').readSource;   // split-aware source reads: a split module reads back as its original text (bim-compiler VIEWER_FILE_SPLIT_PLAN.md)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = 86400000;
const BREAK = () => process.env.SCHED_VERB_BREAK || '';   // the witnesses' falsifiers: day (answers for day+1) | row (perturbs one compare row)

// ── evidence: every § line is kept AND written to stderr (PRIMAL LAW clause 3: never suppressed) ──────────────────────────────────────────────
const LINES = [];
function emit(s) { LINES.push(s); process.stderr.write(s + '\n'); }
const say = (s) => emit(s.indexOf('§') === 0 ? s : '§SCHED_VERB ' + s);
function bad(msg) { const e = new Error(msg); e.usage = true; return e; }

// building name -> a DB file. Dirs: $BLD_DIR (what cache_4d_run.js reads too), the primary checkout's buildings/, this checkout's buildings/.
function resolveExtracted(building) {
  if (typeof building !== 'string' || !NAME.test(building)) throw bad('building must be a name such as "Duplex" (letters, digits, _ and - only)');
  const dirs = [process.env.BLD_DIR, path.join(os.homedir(), 'bim-ootb', 'buildings'), path.join(ROOT, 'buildings')].filter(Boolean);
  for (const d of dirs) { const p = path.join(d, building + '_extracted.db'); if (fs.existsSync(p) && fs.statSync(p).size > 100000) return { dir: d, file: p }; }
  throw new Error('unknown building "' + building + '": no ' + building + '_extracted.db in ' + dirs.join(', '));
}

// ═════════════════════════════════════ schedule_at ═══════════════════════════════════════════════════════════════════════════════════════════
// Which state each played interval is in at `cursor`: the on-screen rule, applied verbatim (viewer/tm_render.js:49-52, tm_core.js:395-397).
const stateOf = (iv, cursor) => (iv.e <= cursor ? 'placed' : (iv.s <= cursor ? 'frontier' : 'future'));

// stateAt(run, day, startMs) — PURE: reads a cache `run` (CACHE.read shape) and returns the answer. Exported for the witness's empty-population case.
function stateAt(run, day, startMs) {
  const L = CACHE.layerOf(run, 'played');
  const play = L.map || {}, n = Object.keys(play).length;
  const out = { layer: L.id, layerDesc: L.desc, total: n };
  if (L.missing || n === 0) return Object.assign(out, { verdict: 'INCONCLUSIVE', summary: 'the persisted run holds no played schedule (' + (L.missing ? 'layer missing' : 'layer empty') + '): nothing to judge at day ' + day });
  const cursor = startMs + day * DAY, counts = { placed: 0, frontier: 0, future: 0 }, st = {}, minS = Object.keys(play).reduce((m, g) => Math.min(m, play[g].s), Infinity);
  for (const g in play) { const s = stateOf(play[g], cursor); st[g] = s; counts[s]++; }
  const tasks = (run.tasks || []).map(t => {
    const c = { placed: 0, frontier: 0, future: 0, untracked: 0 };
    (t.guids || []).forEach(g => { if (st[g]) c[st[g]]++; else c.untracked++; });
    return { id: t.id, phase: t.phase, storey: t.storey, sDays: t.sDays, eDays: t.eDays,
      state: t.eDays <= day ? 'done' : (t.sDays <= day ? 'active' : 'pending'), elements: (t.guids || []).length, placed: c.placed, frontier: c.frontier, future: c.future };
  });
  const byPhase = {};
  tasks.forEach(t => { const p = byPhase[t.phase] || (byPhase[t.phase] = { placed: 0, frontier: 0, future: 0 }); p.placed += t.placed; p.frontier += t.frontier; p.future += t.future; });
  const tc = { done: 0, active: 0, pending: 0 }; tasks.forEach(t => tc[t.state]++);
  const nc = [];
  if (!tasks.length) nc.push('the run carries no task grid: tasks and byPhase are empty');
  if (minS !== startMs) nc.push('the played layer starts at ' + new Date(minS).toISOString() + ', not at the project start ' + new Date(startMs).toISOString() + ': day numbers may be offset');
  return Object.assign(out, { verdict: 'OK', cursorISO: new Date(cursor).toISOString(), counts, unscheduled: (run.els ? run.els.length : n) - n,
    tasksCounts: tc, projectEndDay: tasks.reduce((m, t) => Math.max(m, t.eDays), 0), tasks, byPhase, notChecked: nc,
    summary: 'day ' + day + ': placed ' + counts.placed + ', frontier ' + counts.frontier + ', future ' + counts.future + ' of ' + n });
}

// The persisted run: read when the cache key matches; otherwise run cache_4d_run.js ONCE (it persists), then read.
function cachedRun(building) {
  const dbf = CACHE.resolveDbFile(building);
  if (!dbf.path) throw new Error('unknown building "' + building + '": ' + dbf.reason);   // no database is an error; a database with no schedule is INCONCLUSIVE
  let run = CACHE.read(building), status = 'HIT', spawned = 0, failLine = null;
  if (!run) {
    status = 'BUILT'; spawned = 1;
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'cache_4d_run.js'), building], { env: process.env, encoding: 'utf8', maxBuffer: 1 << 28 });
    String(r.stdout || '').split('\n').filter(l => l).forEach(l => emit(l));   // the pipeline's own § lines, teed to the evidence
    String(r.stderr || '').split('\n').filter(l => l).forEach(l => emit(l));
    failLine = (String(r.stdout || '').split('\n').filter(l => /^§CACHE_(FAIL|SKIP|ERROR)/.test(l)).pop()) || null;
    run = CACHE.read(building);
    if (!run) return { run: null, spawned, status, why: failLine || ('cache_4d_run.js exited ' + r.status + ' and persisted nothing') };
  }
  say('cache=' + status + ' spawned=' + spawned + ' building=' + building + ' dbFile=' + run.dbFile + ' kind=' + run.dbKind + ' dir=' + run.dir);
  return { run, status, spawned, dbf };
}

function scheduleAt(a) {
  if (typeof a.building !== 'string' || !NAME.test(a.building)) throw bad('building must be a name such as "Duplex" (letters, digits, _ and - only)');
  if (!Number.isInteger(a.day)) throw bad('day must be a whole number of days from the project start (day 0 = ' + CACHE.PROJECT_START + '), got "' + a.day + '"');
  const asked = a.day, day = BREAK() === 'day' ? a.day + 1 : a.day;   // falsifier: answers for the next day
  const c = cachedRun(a.building);
  const startMs = Date.parse(CACHE.PROJECT_START + 'T00:00:00Z');
  const base = { verb: 'schedule_at', building: a.building, day: asked,
    unit: 'whole days from the project start (day 0 = ' + CACHE.PROJECT_START + '); the state is taken at the start of the day, cursor = start + day * 86400000 ms' };
  if (!c.run) { const o = Object.assign(base, { verdict: 'INCONCLUSIVE', summary: 'no schedule for ' + a.building + ': ' + c.why, cache: { status: c.status || 'NONE', spawned: c.spawned || 0 } }); say('verdict=INCONCLUSIVE ' + o.summary); return o; }
  const ans = stateAt(c.run, day, startMs);
  const logLines = String(c.run.log || '').split('\n').filter(l => l.indexOf('§') === 0);
  const out = Object.assign(base, ans, { cache: { status: c.status, spawned: c.spawned, dir: c.run.dir, builtAt: c.run.builtAt, dbFile: c.run.dbFile, dbKind: c.run.dbKind },
    engineLinesNote: 'the run\'s own § log (witness.log), verbatim; it is per run, not per day: the per-day line is the §SCHED_AT line',
    engineLinesTotal: logLines.length, engineLines: logLines.map(l => l.slice(0, 600)) });
  if (out.verdict === 'OK') say('§SCHED_AT building=' + a.building + ' day=' + asked + ' layer=' + out.layer + ' placed=' + out.counts.placed + ' frontier=' + out.counts.frontier +
    ' future=' + out.counts.future + ' total=' + out.total + ' tasks done/active/pending=' + out.tasksCounts.done + '/' + out.tasksCounts.active + '/' + out.tasksCounts.pending + ' verdict=OK');
  else say('§SCHED_AT building=' + a.building + ' day=' + asked + ' verdict=INCONCLUSIVE ' + out.summary);
  return out;
}

// ═════════════════════════════════════ schedule_compare (the former scripts/probe_schedule_engine.js) ═════════════════════════════════════════
// Feeds real element data through ScheduleEngine.compute() and diffs its per-element output against ScheduleGate.computeSchedule -> CpmSchedule.run called
// directly (the exact reference pattern scripts/probe_cpm_schedule.js uses) on the SAME data. Any divergence is a bug in the new class's wiring, since it
// repackages this pair rather than reimplementing it. Also confirms floating=0 via the same judge probe_cpm_schedule.js uses, independently of the new class.
let _SQL = null;
async function getSQL() {
  if (_SQL) return _SQL;
  const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js'));
  _SQL = await initSqlJs({ wasmBinary: __readSrc(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) });
  return _SQL;
}

async function scheduleCompare(a) {
  const loc = resolveExtracted(a.building), shiftHours = a.shiftHours === undefined ? 24 : a.shiftHours;
  if (!(typeof shiftHours === 'number' && isFinite(shiftHours) && shiftHours > 0)) throw bad('shift_hours must be a positive number of hours, got "' + a.shiftHours + '"');
  const name = a.building + '_extracted';
  // The engines print their own § lines through console.log: tee them into the evidence, never silence them (module load lines included: stdout stays the one JSON answer).
  const _log = console.log, _warn = console.warn;
  console.log = function () { emit(Array.prototype.join.call(arguments, ' ')); };
  console.warn = function () { emit(Array.prototype.join.call(arguments, ' ')); };
  const V = path.join(ROOT, 'viewer');
  const ScheduleGate = require(path.join(V, 'schedule_gate.js'));
  const ScheduleAuthor = require(path.join(V, 'schedule_author.js'));
  const CpmSchedule = require(path.join(V, 'cpm_schedule.js'));
  const ScheduleEngine = require(path.join(V, 'schedule_engine.js'));
  const SupportSweep = require(path.join(V, 'support_sweep.js'));   // §S58: required, never sliced
  const _contactGraph = SupportSweep.contactGraph, _designatedSupport = SupportSweep.designatedSupport;   // §S58: the real module, not a text slice
  const ratesSrc = __readSrc(path.join(V, 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc + '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();

  // floatingCensus — same directional judge as probe_cpm_schedule.js, independent of ScheduleEngine.
  function floatingCensus(items) {
    const G = _contactGraph(items), des = _designatedSupport(items, G);
    let midair = 0; const byClass = {};
    for (let i = 0; i < items.length; i++) {
      const sIdx = des[i]; if (sIdx < 0) continue;
      if (items[sIdx].s > items[i].s + 1) { midair++; byClass[items[i].cls] = (byClass[items[i].cls] || 0) + 1; }
    }
    return { midair, orphans: G.orphans, grounded: G.groundedN, byClass };
  }

  try {
    const SQL = await getSQL();
    const db = new SQL.Database(__readSrc(path.join(loc.dir, name + '.db')));
    const rawElements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
      laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES, defaultRule: RATES.SEQUENCE_DEFAULT });
    db.close();
    if (!rawElements.length) {   // an empty population is not a FAIL and not a PASS: nothing to compare (the base script printed FAIL error=no elements)
      say('§SE_VERDICT building=' + a.building + ' verdict=INCONCLUSIVE no schedulable element in ' + name + '.db');
      return { verb: 'schedule_compare', building: a.building, db: name + '.db', shiftHours, rows: [], verdict: 'INCONCLUSIVE', summary: 'nothing judged: no schedulable element in ' + name + '.db (refItems=0, checked=0)', lines: LINES.slice() };
    }
    const maxCrews = {};
    for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;

    // §CPM_ENGINE_REACHABILITY — proof this run exercised the REAL, required modules, not a slice.
    const reach = { ScheduleEngine: typeof ScheduleEngine.compute === 'function', computeSchedule: typeof ScheduleGate.computeSchedule === 'function', cpmScheduleRun: typeof CpmSchedule.run === 'function' };
    emit('§CPM_ENGINE_REACHABILITY ' + name + ' ScheduleEngine=' + reach.ScheduleEngine + ' computeSchedule=' + reach.computeSchedule + ' cpmScheduleRun=' + reach.cpmScheduleRun);

    // ── REFERENCE — the exact direct-call pattern probe_cpm_schedule.js already uses, unmodified.
    const refElements = rawElements.map(it => Object.assign({}, it, { bz: it.base_z, tz: it.top_z }));
    const refSchedule = ScheduleGate.computeSchedule(refElements, 0, 1, maxCrews, shiftHours);
    const refItems = refElements.map(el => {
      const st = refSchedule[el.guid]; if (!st) return null;
      return { guid: el.guid, cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey, x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, bz: el.bz, tz: el.tz, s: st.start, e: st.end, resource: el.resource };
    }).filter(Boolean);
    const refRun = CpmSchedule.run(refItems, { maxCrews: maxCrews });

    // ── NEW CLASS — ScheduleEngine.compute(elements, opts), fed the SAME rawElements + SAME opts.
    const model = ScheduleEngine.compute(rawElements, { baseMs: 0, scaleFactor: 1, maxCrews: maxCrews, shiftHours: shiftHours });
    const rows = [], res = { verb: 'schedule_compare', building: a.building, db: name + '.db', shiftHours, reachability: reach, rows };
    if (!model.ok) {
      emit('§SE_DIFF ' + name + ' FAIL error=' + model.error);
      rows.push({ row: 'SE_DIFF', verdict: 'FAIL', error: model.error });
      return Object.assign(res, { verdict: 'FAIL', summary: 'ScheduleEngine.compute failed: ' + model.error, lines: LINES.slice() });
    }

    // ── DIFF — per-element start/end, converted back to the SAME ms clock as the reference (the class emits day-offset from its own solved min-start).
    let minRefMs = Infinity;
    refItems.forEach((it, i) => { if (refRun.solution.times[i].s < minRefMs) minRefMs = refRun.solution.times[i].s; });
    let mismatches = 0, checked = 0, maxDeltaMs = 0;
    const missingInModel = [], modelByGuid = {};
    model.elements.forEach(e => { modelByGuid[e.guid] = e; });
    refItems.forEach((it, i) => {
      const refT = refRun.solution.times[i], me = modelByGuid[it.guid];
      if (!me) { missingInModel.push(it.guid); return; }
      checked++;
      const dS = Math.abs(minRefMs + me.start * DAY - refT.s), dE = Math.abs(minRefMs + me.end * DAY - refT.e);
      if (dS > 1 || dE > 1) mismatches++;
      maxDeltaMs = Math.max(maxDeltaMs, dS, dE);
    });
    if (BREAK() === 'row') mismatches += 1;   // the witness's falsifier: one row perturbed
    const diffPass = mismatches === 0 && missingInModel.length === 0;
    emit('§SE_DIFF ' + name + ' refItems=' + refItems.length + ' modelElements=' + model.elements.length + ' checked=' + checked + ' mismatches=' + mismatches +
      ' missingInModel=' + missingInModel.length + ' maxDeltaMs=' + maxDeltaMs.toFixed(1) + ' deps=' + model.dependencies.length + ' milestones=' + model.milestones.length +
      ' tasks=' + model.tasks.length + ' ' + (diffPass ? 'PASS' : 'FAIL'));
    rows.push({ row: 'SE_DIFF', refItems: refItems.length, modelElements: model.elements.length, checked, mismatches, missingInModel: missingInModel.length,
      maxDeltaMs: Number(maxDeltaMs.toFixed(1)), deps: model.dependencies.length, milestones: model.milestones.length, tasks: model.tasks.length, verdict: diffPass ? 'PASS' : 'FAIL' });

    // ── FLOATING GATE — same judge, on the CPM-SOLVED items (refItems with s/e replaced by refRun.solution.times). Independent of ScheduleEngine.
    const cpmItems = refItems.map((o, i) => Object.assign({}, o, { s: refRun.solution.times[i].s, e: refRun.solution.times[i].e }));
    const census = floatingCensus(cpmItems);
    const STRUCTURAL = ['IfcFooting', 'IfcColumn', 'IfcBeam', 'IfcSlab'];
    let structural = 0;
    Object.keys(census.byClass).forEach(c => { if (STRUCTURAL.some(p => c.indexOf(p) === 0)) structural += census.byClass[c]; });
    const floatPass = census.midair === 0 && structural === 0;
    emit('§SE_FLOATING ' + name + ' midair=' + census.midair + ' structural=' + structural + ' orphans=' + census.orphans + ' ' + (floatPass ? 'PASS' : 'FAIL'));
    rows.push({ row: 'SE_FLOATING', midair: census.midair, structural, orphans: census.orphans, judged: cpmItems.length, verdict: floatPass ? 'PASS' : 'FAIL' });

    // The base script would print PASS on an empty population; the verb does not (PRIMAL LAW clause 4).
    if (checked === 0 || cpmItems.length === 0) {
      const w = checked === 0 ? 'no element was compared' : 'no element was judged for floating';
      say('§SE_VERDICT building=' + a.building + ' verdict=INCONCLUSIVE ' + w);
      return Object.assign(res, { verdict: 'INCONCLUSIVE', summary: 'nothing judged: ' + w + ' (refItems=' + refItems.length + ', checked=' + checked + ')', lines: LINES.slice() });
    }
    const verdict = diffPass && floatPass ? 'PASS' : 'FAIL';
    say('§SE_VERDICT building=' + a.building + ' verdict=' + verdict + ' checked=' + checked + ' mismatches=' + mismatches);
    return Object.assign(res, { verdict, summary: 'engine vs reference over ' + checked + ' elements: ' + mismatches + ' mismatches, ' + missingInModel.length + ' missing; floating midair=' + census.midair + ' structural=' + structural, lines: LINES.slice() });
  } finally { console.log = _log; console.warn = _warn; }
}

module.exports = { scheduleAt, scheduleCompare, stateAt, stateOf, cachedRun };

if (require.main === module) {
  const argv = process.argv.slice(2), verb = argv[0], arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const num = (v) => (v === undefined ? undefined : (v !== '' && isFinite(Number(v)) ? Number(v) : NaN));
  const f = verb === 'at' ? () => Promise.resolve().then(() => scheduleAt({ building: arg('building'), day: num(arg('day')) }))
    : verb === 'compare' ? () => scheduleCompare({ building: arg('building'), shiftHours: num(arg('shift-hours')) }) : null;
  if (!f) { console.error('usage: node viewer/tools/schedule_verbs.js at --building B --day N | compare --building B [--shift-hours H]'); process.exit(2); }
  f().then(r => { process.stdout.write(JSON.stringify(r) + '\n', () => process.exit(r.verdict === 'INCONCLUSIVE' ? 3 : 0)); })
    .catch(e => { if (e && e.usage) { console.error('§SCHED_VERB USAGE ' + e.message); process.exit(2); } console.error('§SCHED_VERB FAIL ' + (e && e.message || e)); process.exit(1); });
}
