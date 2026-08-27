#!/usr/bin/env node
// PROBE — §TPL_MODEL_STREAM: can a witness that wraps the console actually SEE the fork take the
// dead branch? Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.5j(b).
//
// ISSUE THIS PROVES OR DISPROVES. `materializeZones` names which model ran on two different
// streams — the canonical branch on console.log, the legacy-deriveZones branch on console.warn —
// and witness_4d_template_instantiation.js installs `console.warn = () => {}`. So the witness built
// to catch a silent fallback to the dead model is STRUCTURALLY BLIND to it: the line is emitted and
// then deleted before the collector sees it. PRIMAL LAW clause 4 — a witness that cannot report its
// own failure case is not a witness.
//
// METHOD. Force the legacy branch (call materializeZones with NO `template:`) under the EXACT
// console wrapper the witness installs, and report whether a §TPL_MODEL line reached the collector.
// Run it against an unfixed viewer to reproduce the blindness, and against a fixed one to see it
// lift. Both branches are exercised so the probe cannot pass by never firing the fork.
//
//   VIEWER_DIR=<viewer> node viewer/tests/probe_tpl_model_stream.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HOME = require('os').homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const ScheduleGate = require(path.join(VIEWER_DIR, 'schedule_gate.js'));
global.ScheduleGate = ScheduleGate;
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BLD = process.argv[2] || 'Duplex';

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sb);
  return sb;
}
const T = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', '4D_template.json'), 'utf8'));

// The wrapper witness_4d_template_instantiation.js:62-63 installs, reproduced VERBATIM. If this
// probe invented a friendlier wrapper it would prove nothing about the shipped witness.
function runUnderWitnessWrapper(db, R, withTemplate) {
  const logs = [];
  const _l = console.log, _w = console.warn;
  console.log = (...a) => { const s = a.join(' '); if (s.indexOf('§TPL_') === 0 || s.indexOf('§AUTHOR_TPL') === 0) logs.push(s); };
  console.warn = () => {};
  const base = {
    start: '2026-01-01', laborRates: R.LABOR_RATES, rates: R.RATES,
    nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
    scheduleGate: ScheduleGate, shiftHours: T.calendar.hours_per_shift
  };
  let res;
  try {
    res = ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES,
      withTemplate ? Object.assign({}, base, { template: T }) : base);
  } finally { console.log = _l; console.warn = _w; }
  return { logs, res };
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const file = path.join(BLD_DIR, BLD + '_extracted.db');
  if (!fs.existsSync(file)) { console.log('§TPL_STREAM INCONCLUSIVE — no db ' + file); process.exit(2); }

  const buf = new Uint8Array(fs.readFileSync(file));
  let fail = 0;
  const modelLine = ls => ls.filter(l => l.indexOf('§TPL_MODEL') === 0).pop() || '';

  // ---- CASE A: the CANONICAL branch. Must be visible today (it already is) ----
  const dbA = new SQL.Database(buf.slice());
  const A = runUnderWitnessWrapper(dbA, R, true);
  dbA.close();
  const lineA = modelLine(A.logs);
  const okA = lineA.indexOf('model=template') >= 0;
  console.log('§TPL_STREAM canonical-branch-visible=' + (okA ? 'YES' : 'NO') + ' line=' + (lineA ? '"' + lineA.slice(0, 70) + '"' : '<NONE>'));
  if (!okA) fail++;

  // ---- CASE B: the DEAD branch. THE POINT OF THIS PROBE ----
  // Not a synthetic stub: this is materializeZones' real fallback, reached the way live UI reaches
  // it (schedule_author_ui.js:288, `window._4dTemplate` null → no `template:` passed).
  const dbB = new SQL.Database(buf.slice());
  const B = runUnderWitnessWrapper(dbB, R, false);
  dbB.close();
  const lineB = modelLine(B.logs);
  const okB = lineB.indexOf('model=legacy-deriveZones') >= 0;
  console.log('§TPL_STREAM legacy-branch-visible=' + (okB ? 'YES' : 'NO') + ' line=' + (lineB ? '"' + lineB.slice(0, 70) + '"' : '<NONE>'));
  if (!okB) fail++;

  // A probe that never fired the fork would report YES/NO on an empty population. Prove the dead
  // branch actually RAN, independently of the console, by checking it produced a schedule.
  const ranB = !!(B.res && B.res.ok);
  console.log('§TPL_STREAM legacy-branch-actually-ran=' + (ranB ? 'YES' : 'NO') +
    ' — if NO, the visibility verdict above is VACUOUS');
  if (!ranB) { console.log('§TPL_STREAM VERDICT=INCONCLUSIVE — the dead branch never executed'); process.exit(2); }

  console.log('§TPL_STREAM ' + BLD + ' VERDICT=' + (fail ? 'BLIND fail=' + fail : 'VISIBLE') +
    ' — the shipped witness wrapper ' + (fail ? 'CANNOT' : 'can') + ' see which model ran on both branches');
  process.exit(fail ? 1 : 0);
})();
