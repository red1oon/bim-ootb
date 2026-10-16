#!/usr/bin/env node
// PROBE — the movie plays the ELEMENT SOLVE; the bars now come from 4D_template.json. Two
// timelines. This measures whether they agree, before anything is wired live.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S70.
// Command: node viewer/tests/probe_4d_movie_vs_bars.js [Building ...]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const V = path.join(__dirname, '..');
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const START = '2026-01-01';

function rules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Hospital', 'Terminal', 'HHS_Office_Federated', 'Duplex'];

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = rules(), SHIFT = T.calendar.hours_per_shift;
  const maxCrews = {};
  for (const k in R.LABOR_RATES) if (R.LABOR_RATES[k].max_crews) maxCrews[k] = R.LABOR_RATES[k].max_crews;

  for (const bld of BUILDINGS) {
    const f = path.join(HOME, 'bim-ootb', 'buildings', bld + '_extracted.db');
    if (!fs.existsSync(f)) { console.log('§MVB_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(f)));
    const _l = console.log, _w = console.warn;
    console.log = () => {}; console.warn = () => {};
    const els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT });
    const solve = SG.computeSchedule(els, Date.parse(START), 1, maxCrews, SHIFT);
    const mres = SA.materializeZones(db, R.SEQUENCE_RULES, { start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
      scheduleGate: SG, shiftHours: SHIFT, template: process.env.LEGACY ? undefined : T });
    // REMAP=1 measures the movie AFTER §TPL_MOVIE_BINDS_BARS binds it to the authored windows.
    const play = (process.env.REMAP && mres && mres.displaySchedule) ? mres.displaySchedule : solve;
    console.log = _l; console.warn = _w;

    const q = s => { const r = db.exec(s); return r.length ? r[0].values : []; };
    const win = {};
    q("SELECT task_id,schedule_start,schedule_finish FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0")
      .forEach(([t, s, e]) => { win[t] = { s: Date.parse(s), e: Date.parse(e) }; });
    const taskOf = {};
    q("SELECT task_id,guid FROM task_elements").forEach(([t, g]) => { taskOf[g] = t; });

    let inside = 0, early = 0, late = 0, noTask = 0, n = 0;
    let worstEarly = 0, worstLate = 0;
    let sMin = Infinity, sMax = -Infinity, tMin = Infinity, tMax = -Infinity;
    els.forEach(e => {
      const st = play[e.guid]; if (!st) return;
      n++;
      if (st.start < sMin) sMin = st.start;
      if (st.end > sMax) sMax = st.end;
      const w = win[taskOf[e.guid]];
      if (!w) { noTask++; return; }
      if (w.s < tMin) tMin = w.s;
      if (w.e > tMax) tMax = w.e;
      const eBy = (w.s - st.start) / 86400000, lBy = (st.end - w.e) / 86400000;
      if (eBy > 0) { early++; if (eBy > worstEarly) worstEarly = eBy; }
      if (lBy > 0) { late++; if (lBy > worstLate) worstLate = lBy; }
      if (eBy <= 0 && lBy <= 0) inside++;
    });
    // A monotone map cannot swap two times. Verify that claim rather than assert it: for every
    // task, compare the raw-solve ordering of its members against the played ordering.
    let inv = 0, cmp = 0;
    Object.keys(win).forEach(tid => {
      const gs = [];
      for (const g in taskOf) if (taskOf[g] === tid && solve[g] && play[g]) gs.push(g);
      gs.sort((a, b) => solve[a].start - solve[b].start || (a < b ? -1 : 1));
      for (let i = 1; i < gs.length; i++) { cmp++; if (play[gs[i]].start < play[gs[i - 1]].start) inv++; }
    });
    const pct = x => (100 * x / Math.max(1, n)).toFixed(1) + '%';
    console.log('§MVB[' + (process.env.LEGACY ? 'LEGACY' : (process.env.REMAP ? 'TEMPLATE+REMAP' : 'TEMPLATE')) + '] ' + bld + ' n=' + n +
      ' movieSpan=' + ((sMax - sMin) / 86400000).toFixed(1) + 'd' +
      ' barsSpan=' + ((tMax - tMin) / 86400000).toFixed(1) + 'd' +
      ' ratio=' + ((tMax - tMin) / Math.max(1, sMax - sMin)).toFixed(2) + 'x');
    console.log('   insideItsOwnBar=' + inside + ' (' + pct(inside) + ')' +
      '  startsBeforeItsBar=' + early + ' (' + pct(early) + ', worst ' + worstEarly.toFixed(1) + 'd)' +
      '  endsAfterItsBar=' + late + ' (' + pct(late) + ', worst ' + worstLate.toFixed(1) + 'd)' +
      (noTask ? '  UNASSIGNED=' + noTask : '') +
      '\n   orderInversionsVsSolve=' + inv + '/' + cmp + ' (a monotone remap must be 0)');
    db.close();
  }
})();
