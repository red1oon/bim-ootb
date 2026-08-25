#!/usr/bin/env node
// PROBE — does binding the movie to the template's bars (§S70) create MIDAIR?
// The user's acceptance bar, verbatim: "all i want is not to see a single item hanging in midair
// that is all". §TPL_MOVIE_BINDS_BARS proved order is preserved WITHIN a task; it proved nothing
// ACROSS tasks, and the template's chain moves whole tasks relative to each other.
//
// Judge: census() sliced verbatim out of viewer/tests/witness_midair_zero.js — the INDEPENDENT
// judge that re-derives contact geometry itself rather than calling the shipped repair's helpers.
// Sliced, never reimplemented, so this probe cannot drift from the witness that owns the rule.
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S71.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const V = path.join(__dirname, '..');
const ScheduleGate = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = ScheduleGate;
const SA = require(path.join(V, 'schedule_author.js'));
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const START = '2026-01-01';

// ── census(), sliced verbatim from witness_midair_zero.js ──────────────────────────────────────
const mzSrc = fs.readFileSync(path.join(V, 'tests', 'witness_midair_zero.js'), 'utf8');
function sliceFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in witness_midair_zero.js');
  let d = 0, open = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; open = true; }
    else if (src[k] === '}') { d--; if (open && d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}
const CELL = ScheduleGate.CELL, EPS = ScheduleGate.EPS, GAP = ScheduleGate.GAP, D = 86400000;
const census = new Function('CELL', 'EPS', 'GAP', 'D',
  sliceFn(mzSrc, 'census') + '; return census;')(CELL, EPS, GAP, D);

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Hospital', 'Terminal', 'HHS_Office_Federated', 'Duplex'];

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) });
  const R = executedRules(), SHIFT = T.calendar.hours_per_shift;
  const maxCrews = {};
  for (const k in R.LABOR_RATES) if (R.LABOR_RATES[k].max_crews) maxCrews[k] = R.LABOR_RATES[k].max_crews;

  for (const bld of BUILDINGS) {
    const f = path.join(HOME, 'bim-ootb', 'buildings', bld + '_extracted.db');
    if (!fs.existsSync(f)) { console.log('§MUT_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(f)));
    const _l = console.log, _w = console.warn;
    console.log = () => {}; console.warn = () => {};
    const els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT });
    const raw = ScheduleGate.computeSchedule(els, Date.parse(START), 1, maxCrews, SHIFT);
    const res = SA.materializeZones(db, R.SEQUENCE_RULES, {
      start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
      scheduleGate: ScheduleGate, shiftHours: SHIFT, template: T });
    console.log = _l; console.warn = _w;

    // Same element shape witness_midair_zero builds. geoEls = those with real geometry.
    const geoEls = els.filter(e => (e.x1 - e.x0) || (e.y1 - e.y0) || (e.top_z - e.base_z));
    const mk = sched => geoEls.filter(e => sched[e.guid]).map(e => ({
      guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1,
      cls: e.cls, seq: e.seq, phase: e.phase }));

    const before = census(mk(raw));
    const after = census(mk(res.displaySchedule));
    const pct = (x, t) => (100 * x / Math.max(1, t)).toFixed(2) + '%';
    const tot = geoEls.length;
    console.log('§MUT ' + bld + ' n=' + tot);
    console.log('   RAW solve          midair=' + before.midair + ' (' + pct(before.midair, tot) + ') orphan=' + before.orphan + ' grounded=' + before.grounded + ' ok=' + before.ok);
    console.log('   TEMPLATE+REMAP     midair=' + after.midair + ' (' + pct(after.midair, tot) + ') orphan=' + after.orphan + ' grounded=' + after.grounded + ' ok=' + after.ok +
      '   delta=' + (after.midair - before.midair >= 0 ? '+' : '') + (after.midair - before.midair));
    if (after.worst.length) {
      console.log('   worst after: ' + after.worst.slice(0, 3).map(w =>
        w.cls + '/' + w.phase + ' starts d' + w.start.toFixed(1) + ' support d' + w.sup.toFixed(1) +
        ' (hangs ' + (w.sup - w.start).toFixed(1) + 'd)').join('  |  '));
    }
    db.close();
  }
})();
