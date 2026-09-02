#!/usr/bin/env node
// WITNESS — 4D capacity: the crew cap must bind the FINAL emitted times, not only the times at
// first placement. Spec: viewer/rates/4D_template.json `capacity_rule`;
// bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S67.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1):
//   the SOLVE layer only — ScheduleGate.computeSchedule's emitted {start,end} per element. It says
//   nothing about zones, tasks, persisted dates or drawn bars.
//
// ISSUE THIS PROVES OR DISPROVES: schedule_gate.js enforces LABOR_RATES[trade].max_crews inside
// claimCrew, which runs at placement. The §DEQ_REPAIR sweep afterwards moves elements forward to
// satisfy geometry gates by writing o.start/o.end DIRECTLY, never re-claiming a crew slot. If that
// is a real breach, some trade's peak concurrency in the FINAL output exceeds its cap.
//
// MEASURED BEFORE THE FIX (2026-08-25, HHS_Office_Federated, 24h shift): CARPENTER cap=2, peak=8
// (4.0x). All 7 other trades legal. With the repair loop disabled, CARPENTER returns to 2 — so the
// repair sweep is the cause, isolated by A/B. Span 46.9d either way: the breach does not shorten
// the programme, it makes it unbuildable.
//
// Command: node viewer/tests/witness_4d_capacity_honoured.js [Building ...]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(require('os').homedir(), 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(require('os').homedir(), 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const ScheduleGate = require(path.join(VIEWER_DIR, 'schedule_gate.js'));
global.ScheduleGate = ScheduleGate;
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['HHS_Office_Federated', 'Duplex', 'Terminal'];

// The EXECUTED table, not the JSON mirror: viewer.html never calls loadSequenceRules(), so rates.js's
// own literal is what the browser runs (§RULES_TABLE_SOURCE, rates.js:107-110). Run the WHOLE file —
// slicing it from `var RATES = {` silently drops SEQUENCE_NAME_OVERRIDES and SHIFT_HOURS.
function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sb);
  return sb;
}
// ONE CLOCK: the shift comes from the template, which is gated equal to rates.js SHIFT_HOURS by
// witness_4d_template.js's calendar-matches-engine. Never a hand-typed third copy.
const T = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', '4D_template.json'), 'utf8'));
const SHIFT = T.calendar.hours_per_shift;

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const maxCrews = {};
  for (const k in R.LABOR_RATES) if (R.LABOR_RATES[k].max_crews) maxCrews[k] = R.LABOR_RATES[k].max_crews;

  let anyRan = 0;
  for (const bld of BUILDINGS) {
    const file = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§4DCAP_SKIP ' + bld + ' (no ' + path.basename(file) + ')'); continue; }
    anyRan++;
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    const _l = console.log, _w = console.warn;
    console.log = () => {}; console.warn = () => {};
    const els = ScheduleAuthor._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT
    });
    const sched = ScheduleGate.computeSchedule(els, 0, 1, maxCrews, SHIFT);
    console.log = _l; console.warn = _w;

    // Peak concurrency per trade, swept from the FINAL emitted times. An end-event is processed
    // before a start-event at the same instant (sort by [t, delta]) so a hand-off is not counted
    // as an overlap.
    const ev = {}, cap = {};
    els.forEach(e => {
      const st = sched[e.guid]; if (!st) return;
      const t = e.resource || '_DEFAULT';
      cap[t] = maxCrews[t] || 0;
      (ev[t] = ev[t] || []).push([st.start, 1], [st.end, -1]);
    });
    const breaches = [];
    let spanMin = Infinity, spanMax = -Infinity;
    for (const g in sched) { if (sched[g].start < spanMin) spanMin = sched[g].start; if (sched[g].end > spanMax) spanMax = sched[g].end; }
    Object.keys(ev).forEach(t => {
      if (!cap[t]) return;                       // a trade with no declared cap is not gated here
      ev[t].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let cur = 0, pk = 0;
      ev[t].forEach(x => { cur += x[1]; if (cur > pk) pk = cur; });
      if (pk > cap[t]) breaches.push(t + ' peak=' + pk + ' cap=' + cap[t] + ' (' + (pk / cap[t]).toFixed(1) + 'x)');
    });
    console.log('§4DCAP ' + bld + ' n=' + els.length + ' spanD=' + ((spanMax - spanMin) / 86400000).toFixed(1) +
      ' trades=' + Object.keys(ev).length + ' breaches=' + breaches.length +
      (breaches.length ? ' [' + breaches.join('; ') + ']' : ''));
    assert(breaches.length === 0, bld + ': every trade within max_crews in the FINAL emitted times');
    db.close();
  }
  assert(anyRan > 0, 'at least one building available to test');
  console.log('§WITNESS_4D_CAPACITY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
