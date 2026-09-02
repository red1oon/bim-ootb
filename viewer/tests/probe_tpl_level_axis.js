#!/usr/bin/env node
// probe_tpl_level_axis.js — §TPL_LEVEL_AXIS / §TPL_LEVEL_DISAGREE
// Implementing bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.3
//
// ISSUE IT PROVES OR DISPROVES: the task grid keys its levels on `collapse(e.storey)`, where
// `e.storey` has already been rewritten by _buildScheduleElements's assignStoreyByZ — every element
// whose DB storey is absent/'_UNKNOWN' is given the nearest REAL storey NAME by median centre-Z.
// LevelDeriver answers the same question from the frozen DB and is not exposed to that rewrite.
// This probe MEASURES how far apart the two answers actually are, per building, instead of assuming
// the swap helps. It is a probe, not a witness: it asserts nothing, it reports numbers.
//   node viewer/tests/probe_tpl_level_axis.js [Building ...]
// Default buildings: Duplex, HHS_Office_Federated, Hospital (the three the instantiation witness uses).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');

const VIEWER_DIR = process.env.VIEWER_DIR || path.join(__dirname, '..');
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const SQLJS_DIST = path.join(os.homedir(), 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const initSqlJs = require(path.join(SQLJS_DIST, 'sql-wasm.js'));

const ScheduleGate = require(path.join(VIEWER_DIR, 'schedule_gate.js'));
// LevelDeriver self-registers on globalThis; schedule_author resolves it from there at call time.
globalThis.LevelDeriver = require(path.join(VIEWER_DIR, 'lib', 'level_deriver.js'));
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));

const T = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', '4D_template.json'), 'utf8'));
const START = '2026-01-01';
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Duplex', 'HHS_Office_Federated', 'Hospital'];

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sb);
  return sb;
}

// Run materializeZones on a FRESH copy of the db (it writes tasks), capturing the §-log.
function run(SQL, file, R, extraOpts) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
  const _l = console.log, _w = console.warn;
  const logs = [];
  console.log = (...a) => { logs.push(a.join(' ')); };
  console.warn = () => {};
  let res;
  try {
    res = ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES, Object.assign({
      start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
      scheduleGate: ScheduleGate, shiftHours: T.calendar.hours_per_shift, template: T
    }, extraOpts || {}));
  } finally { console.log = _l; console.warn = _w; }
  const q = s => { try { const r = db.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } };
  const tasks = q("SELECT task_id,name,schedule_start,schedule_finish FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0");
  const te = q('SELECT task_id,guid FROM task_elements');
  db.close();
  return { res, logs, tasks, te };
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const summary = [];

  for (const bld of BUILDINGS) {
    const file = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§PROBE_SKIP ' + bld + ' (no ' + file + ')'); continue; }
    console.log('\n════════ ' + bld + ' ════════');

    // A — OLD axis + probe on: shipped behaviour, plus the side-by-side measurement.
    const A = run(SQL, file, R, { levelProbe: true, label: bld });
    A.logs.filter(s => /^§TPL_LEVEL/.test(s)).forEach(s => console.log('  ' + s));

    // B — NEW axis: the swap actually applied.
    const B = run(SQL, file, R, { levelSource: 'deriver', label: bld });

    const dis = (A.logs.find(s => s.indexOf('§TPL_LEVEL_DISAGREE label=') === 0) || '');
    const m = /STRUCTURAL=(\d+) \(([\d.]+)%/.exec(dis);
    const mr = /relabelOnly=(\d+) \(([\d.]+)%/.exec(dis);
    const mf = /rawStoreyMissing=(\d+) \(([\d.]+)%/.exec(dis);

    const levelsOf = r => {
      const s = new Set();
      r.tasks.forEach(([, name]) => { const d = name.indexOf(' — '); if (d > 0) s.add(name.slice(d + 3)); });
      return [...s];
    };
    const row = {
      building: bld,
      elements: Number((/ n=(\d+) /.exec(dis) || [])[1] || 0),
      structural: m ? Number(m[1]) : null,
      structuralPct: m ? m[2] : null,
      relabelOnly: mr ? Number(mr[1]) : null,
      fabricated: mf ? Number(mf[1]) : null,
      fabricatedPct: mf ? mf[2] : null,
      tasksOld: A.tasks.length, tasksNew: B.tasks.length,
      levelsOld: levelsOf(A).length, levelsNew: levelsOf(B).length,
      totalDaysOld: A.res && A.res.totalDays, totalDaysNew: B.res && B.res.totalDays,
      assignedOld: new Set(A.te.map(r2 => r2[1])).size,
      assignedNew: new Set(B.te.map(r2 => r2[1])).size
    };
    summary.push(row);
    console.log('  §PROBE_AXIS_EFFECT ' + bld +
      ' tasks ' + row.tasksOld + '->' + row.tasksNew +
      ' levels ' + row.levelsOld + '->' + row.levelsNew +
      ' totalDays ' + row.totalDaysOld + '->' + row.totalDaysNew +
      ' elementsAssigned ' + row.assignedOld + '->' + row.assignedNew);
    console.log('  §PROBE_LEVELS_OLD ' + bld + ' ' + JSON.stringify(levelsOf(A).sort()));
    console.log('  §PROBE_LEVELS_NEW ' + bld + ' ' + JSON.stringify(levelsOf(B).sort()));
  }

  console.log('\n════════ SUMMARY ════════');
  console.log('§PROBE_TPL_LEVEL_AXIS ' + JSON.stringify(summary, null, 2));
  summary.forEach(r => {
    console.log('§PROBE_ROW ' + r.building +
      ' n=' + r.elements +
      ' STRUCTURAL=' + r.structural + ' (' + r.structuralPct + '%)' +
      ' relabelOnly=' + r.relabelOnly +
      ' fabricatedByAssignStoreyByZ=' + r.fabricated + ' (' + r.fabricatedPct + '%)' +
      ' tasks=' + r.tasksOld + '->' + r.tasksNew +
      ' assigned=' + r.assignedOld + '->' + r.assignedNew);
  });
})();
