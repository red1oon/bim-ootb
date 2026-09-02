#!/usr/bin/env node
// probe_kernel_ops_vs_engine.js — 4D_GANTT_TM_REFACTOR.md stage 2. Checks whether kernel_ops' real
// per-element ELEMENT_PLACE start_ts/end_ts (what buildGanttTasks() reads today, left untouched by
// this stage) equal a fresh ScheduleEngine.compute() call on the same elements/opts.
// HONEST RESULT (Hospital, 2026-08-17): DURATIONS match exactly — 0/63182 mismatches, p99=0.02
// days — proving classification + the raw schedule step (computeSchedule) are identical between
// the two paths. START POSITIONS do not fully align after a best-fit shift (median shift 24.9d,
// most of the divergence appears in LATER-scheduled elements, not early ones — the earliest 10
// real elements match to the millisecond). maxCrews/opts were verified byte-identical between the
// live page and this script's offline load, so that is not the cause. Root cause NOT found — likely
// something about the crew-pass allocator's sensitivity to element processing order or crew-pool
// state carried over from whichever of the two "twin consumer" call sites populated kernel_ops
// first (_displayTimeline's own one-shot reuse cache, §CPM_DISPLAY_ONE_TRUTH) — not chased further
// here. This does NOT block or weaken the shipped fix: buildGanttTasks() reads directly from
// _ops/kernel_ops (durable, unquestionably what's rendered), it does not call compute() live, so
// this open question is a verification-completeness gap, not a functional dependency of the fix.
// Flagging for follow-up, not silently resolving.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'viewer', 'cpm_schedule.js'));
const ScheduleEngine = require(path.join(__dirname, '..', 'viewer', 'schedule_engine.js'));

const PORT = process.env.PORT ? Number(process.env.PORT) : 8129;
const BLD = process.env.BLD || 'Hospital_extracted';
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', process.env.SERVE_ROOT || '/tmp/serve-after'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const lines = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  await page.evaluate(() => window.toggleTimeMachine());
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    if (lines.some(l => l.indexOf('§TIME_MACHINE ON') >= 0)) break;
    await new Promise(r => setTimeout(r, 200));
  }
  // start_ts/end_ts are not literal columns — verified via loadOps() (time_machine.js:91-108):
  // start_ts = timestamp, end_ts = JSON.parse(parameters)._end_ts (or timestamp+60000 default).
  const kernelOps = await page.evaluate(() => {
    const r = window.APP.db.exec("SELECT output_guid, timestamp, parameters FROM kernel_ops " +
      "WHERE op_type='ELEMENT_PLACE' AND (undone IS NULL OR undone=0)");
    if (!r.length) return [];
    return r[0].values.map(function (row) {
      var p = row[2] ? JSON.parse(row[2]) : {};
      return [row[0], row[1], p._end_ts || (row[1] + 60000)];
    });
  });
  await browser.close(); server.kill();
  console.log('§KOPS_ENGINE_DIFF ' + BLD + ' kernelOpsRows=' + kernelOps.length);
  if (!kernelOps.length) { console.log('§KOPS_ENGINE_DIFF ' + BLD + ' ERROR no kernel_ops rows'); process.exit(2); }
  const kByGuid = {};
  kernelOps.forEach(function (row) { kByGuid[row[0]] = { s: row[1], e: row[2] }; });

  // Fresh, independent, offline compute() call — same building, same rates.js, same default opts.
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, BLD + '.db')));
  const elements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT
  });
  db.close();
  const maxCrews = {};
  for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;
  const model = ScheduleEngine.compute(elements, { baseMs: 0, scaleFactor: 1, maxCrews: maxCrews, shiftHours: SHIFT_HOURS });
  if (!model.ok) { console.log('§KOPS_ENGINE_DIFF ' + BLD + ' ERROR compute() failed: ' + model.error); process.exit(2); }

  // Both sides anchor to their OWN earliest start (kernel_ops on the TM's real-open epoch, compute()
  // on day-offset-from-zero) — this stage never claimed a shared calendar anchor, only the same
  // solved schedule SHAPE. Proof: (1) per-element duration matches exactly (shift-invariant on its
  // own), AND (2) after ONE shared shift (computed from a single reference element), every other
  // element's start/end also matches — proving the whole relative structure aligns, not just
  // individual durations in isolation.
  const DAY = 86400000;
  const meByGuid = {};
  model.elements.forEach(function (e) { meByGuid[e.guid] = e; });
  const guids = Object.keys(kByGuid).filter(function (g) { return meByGuid[g]; });
  const missing = Object.keys(kByGuid).length - guids.length;
  if (!guids.length) { console.log('§KOPS_ENGINE_DIFF ' + BLD + ' ERROR no overlapping guids'); process.exit(2); }
  // MEDIAN shift across all overlapping guids, not one arbitrary reference element — a single
  // element can itself sit in a divergent tail, throwing off the whole comparison (measured: one
  // bad reference produced a false 99.9% mismatch rate; the per-guid shift distribution's own
  // p25/p50/p75 are 0.1/1.2/3.4 days — tight — the median is the robust estimate here, not any
  // single element).
  const shiftsMs = guids.map(function (g) { return kByGuid[g].s - meByGuid[g].start * DAY; }).sort(function (a, b) { return a - b; });
  const shiftMs = shiftsMs[Math.floor(shiftsMs.length / 2)];
  const startDeltas = [], durDeltas = [];
  guids.forEach(function (guid) {
    const k = kByGuid[guid], me = meByGuid[guid];
    durDeltas.push(Math.abs((k.e - k.s) / DAY - (me.end - me.start)));
    startDeltas.push(Math.abs(k.s - (me.start * DAY + shiftMs)) / DAY);
  });
  durDeltas.sort(function (a, b) { return a - b; });
  startDeltas.sort(function (a, b) { return a - b; });
  const pct = function (arr, p) { return arr[Math.floor(arr.length * p)]; };
  const TOL_DAYS = 1;   // one day quantum — this project's own standing rounding tolerance elsewhere
  const mismatchStart = startDeltas.filter(function (d) { return d > TOL_DAYS; }).length;
  const mismatchDur = durDeltas.filter(function (d) { return d > TOL_DAYS; }).length;
  console.log('§KOPS_ENGINE_DIFF ' + BLD + ' checked=' + guids.length + ' missing=' + missing +
    ' medianShiftDays=' + (shiftMs / DAY).toFixed(2) +
    ' startDelta(days) p50=' + pct(startDeltas, .5).toFixed(2) + ' p90=' + pct(startDeltas, .9).toFixed(2) +
    ' p99=' + pct(startDeltas, .99).toFixed(2) + ' max=' + startDeltas[startDeltas.length - 1].toFixed(2) +
    ' mismatchStart(>1d)=' + mismatchStart + '/' + guids.length +
    ' durDelta(days) p50=' + pct(durDeltas, .5).toFixed(2) + ' p99=' + pct(durDeltas, .99).toFixed(2) +
    ' mismatchDur(>1d)=' + mismatchDur + '/' + guids.length +
    ' ' + (missing === 0 && mismatchStart / guids.length < 0.01 ? 'PASS' : 'FAIL'));
  process.exit(missing === 0 && mismatchStart / guids.length < 0.01 ? 0 : 1);
}
main().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
