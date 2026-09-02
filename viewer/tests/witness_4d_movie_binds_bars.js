#!/usr/bin/env node
// WITNESS — §TPL_MOVIE_BINDS_BARS: the movie plays inside the bars the 4D template authored.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S70.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1):
//   the RELATIONSHIP between two layers — ScheduleGate.computeSchedule's element times as remapped
//   for display, and the persisted `tasks` windows. It says nothing about drawn pixels or kernel_ops.
//
// ISSUE THIS PROVES OR DISPROVES: under the legacy path a bar was an ENVELOPE over the element
// solve, so an element was inside its own bar by construction — MEASURED 98.9% Hospital / 95.2%
// Terminal / 86.8% Duplex, worst offset 0.5d (day rounding). §S69 made the bar an INDEPENDENT
// statement authored from 4D_template.json, and the pair went wrong immediately: 54.5% / 35.4% /
// 18.8% inside, worst 274.3d on Hospital, and 81.1% of Duplex's elements appearing BEFORE their own
// bar. That is the user's reported hell made worse. This witness gates the bind that fixes it, and
// gates that the bind does not spend the orderings the solve was expensive to win.
//
// Command: node viewer/tests/witness_4d_movie_binds_bars.js [Building ...]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const V = process.env.VIEWER_DIR || path.join(__dirname, '..');
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));
const { PlayedElementRow } = require(path.join(KIT, 'schemas', '4d_movie_bars'));
const INV = require(path.join(KIT, 'invariants', '4d_movie_bars'));

const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Hospital', 'HHS_Office_Federated', 'Duplex'];
const START = '2026-01-01';

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules(), SHIFT = T.calendar.hours_per_shift;
  const maxCrews = {};
  for (const k in R.LABOR_RATES) if (R.LABOR_RATES[k].max_crews) maxCrews[k] = R.LABOR_RATES[k].max_crews;
  const rows = [];

  for (const bld of BUILDINGS) {
    const f = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(f)) { console.log('§MBB_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(f)));
    const _l = console.log, _w = console.warn;
    let bindLog = '';
    console.log = (...a) => { const s = a.join(' '); if (s.indexOf('§TPL_MOVIE_BINDS_BARS') === 0) bindLog = s; };
    console.warn = () => {};
    const els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT });
    const solve = SG.computeSchedule(els, Date.parse(START), 1, maxCrews, SHIFT);
    const res = SA.materializeZones(db, R.SEQUENCE_RULES, {
      start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
      scheduleGate: SG, shiftHours: SHIFT, template: T });
    console.log = _l; console.warn = _w;
    if (!res.ok || !res.displaySchedule) { console.log('§MBB_FAIL ' + bld); db.close(); continue; }

    // Windows read back from the PERSISTED tasks, never from the return value.
    const q = s => { const r = db.exec(s); return r.length ? r[0].values : []; };
    const win = {};
    q("SELECT task_id,schedule_start,schedule_finish FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0")
      .forEach(([t, s, e]) => { win[t] = { s: Date.parse(s), e: Date.parse(e) }; });
    const taskOf = {};
    q("SELECT task_id,guid FROM task_elements").forEach(([t, g]) => { taskOf[g] = t; });

    const play = res.displaySchedule;
    let added = 0;
    els.forEach(e => {
      const p = play[e.guid], w = win[taskOf[e.guid]], sv = solve[e.guid];
      if (!p || !w || !sv) return;
      rows.push({ building: bld, guid: e.guid, taskId: taskOf[e.guid],
        solveStart: sv.start, playStart: p.start, playEnd: p.end, winStart: w.s, winEnd: w.e });
      added++;
    });
    console.log('§MBB ' + bld + ' elements=' + els.length + ' played=' + added + '  ' + bindLog.replace('§TPL_MOVIE_BINDS_BARS ', ''));
    db.close();
  }

  Witness('4d_movie_binds_bars')
    .population(() => rows)
    .schema(PlayedElementRow)
    .invariant('every-element-inside-its-bar', INV.everyElementInsideItsBar)
    .invariant('remap-preserves-solve-order', INV.remapPreservesSolveOrder)
    .invariant('no-zero-width-element', INV.noZeroWidthElement)
    .invariant('movie-span-equals-bars-span', INV.movieSpanEqualsBarsSpan)
    // RED CONTROL — reproduce the real defect: put one element back on its RAW solve time, which is
    // exactly the shape measured before the bind (81.1% of Duplex outside its own bar).
    .redControl(rs => rs.map((r, i) => i ? r : Object.assign({}, r, { playStart: r.winStart - 86400000 })))
    .run();
})();
