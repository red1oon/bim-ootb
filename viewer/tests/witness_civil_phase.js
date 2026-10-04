#!/usr/bin/env node
// W-CIVIL-PHASE (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §Q)
// Issue proved/disproved: a civil model (every element a CIVIL_DISCS discipline) got ONE building phase
// ("Architecture Envelope") in the Time Machine — no discipline breakdown. With §CIVIL_PHASE +
// §CIVIL_TEMPLATE each civil discipline must land in its own phase/task, in the template's order, and a
// building db must get byte-identical phases whether the civil table is active or not (NON-IMPACT rule).
// Runs the SHIPPED schedule_author.js / materializeZones; rates.js loaded in a vm like cache_4d_run.js.
// Usage: node viewer/tests/witness_civil_phase.js <civil.db> [<building.db> ...]   — read the § lines.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const V = path.join(__dirname, '..');
const HOME = os.homedir();

function load() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(V)) delete require.cache[k];
  const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
  const SA = require(path.join(V, 'schedule_author.js'));
  global.SupportSweep = require(path.join(V, 'support_sweep.js'));
  global.CpmSchedule = require(path.join(V, 'cpm_schedule.js'));
  global.GanttModel = require(path.join(V, 'gantt_model.js'));
  globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
  globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
  globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8') + ';this.__CIV=SEQUENCE_CIVIL;', sb);
  return { SG, SA, sb };
}

function phasesOf(SQL, file, civilOn) {
  const { SG, SA, sb } = load();
  const civ = sb.__CIV;
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
  const keys = Object.keys(civ);
  const r = db.exec("SELECT COUNT(*), SUM(CASE WHEN discipline IN (" + keys.map(() => '?').join(',') + ") THEN 1 ELSE 0 END) FROM elements_meta WHERE ifc_class != 'IfcOpeningElement' AND ifc_class != 'IfcSpace'", keys);
  const n = r[0].values[0][0], c = r[0].values[0][1] || 0;
  const allCivil = civilOn && n > 0 && c === n;   // the same rule time_machine.js _allCivil applies
  const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', allCivil ? '4D_template_civil.json' : '4D_template.json'), 'utf8'));
  const base = { start: '2026-01-01', laborRates: sb.LABOR_RATES, rates: sb.RATES, nameOverrides: sb.SEQUENCE_NAME_OVERRIDES,
    defaultRule: sb.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, db: db,
    civilRules: civilOn ? civ : undefined };
  const quiet = console.log; const lines = [];
  console.log = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  let els, res;
  try {
    els = SA._buildScheduleElements(db, sb.SEQUENCE_RULES, base);
    globalThis.APP = { db: db };
    res = SA.materializeZones(db, sb.SEQUENCE_RULES, base);
  } finally { console.log = quiet; }
  // the Gantt read model (schedule_read_4d.readTasks) over the tasks materializeZones just wrote — the panel's
  // per-task resource column. Issue (user 2026-10-05): "only one resource in play" — it read the CLASS rule.
  let readRes = null;
  try {
    const RD = require(path.join(V, 'schedule_read_4d.js'));
    global.ScheduleAuthor = SA; if (civilOn) global.SEQUENCE_CIVIL = civ; else delete global.SEQUENCE_CIVIL;
    const rt = RD.readTasks(db, { rules: sb.SEQUENCE_RULES, laborRates: sb.LABOR_RATES, quiet: true, scheduleAuthor: SA, civilRules: civilOn ? civ : undefined });
    if (!rt) lines.push('§W_READTASKS null'); const list = (rt && (rt.tasks || rt)) || [];
    if (process.env.DBG_RT) quiet('§DBG_RT type=' + (rt === null ? 'null' : Array.isArray(rt) ? 'array' : typeof rt) + ' keys=' + (rt && !Array.isArray(rt) ? Object.keys(rt).join(',') : '') + ' first=' + JSON.stringify(Array.isArray(list) ? list[0] : null).slice(0, 300));
    readRes = {}; (Array.isArray(list) ? list : []).forEach(t => { (String(t.resource || '').split(',')).forEach(r => { if (r) readRes[r] = (readRes[r] || 0) + 1; }); });
  } catch (e) { readRes = 'readTasks error ' + e.message; }
  const byPhase = {};
  els.forEach(e => { byPhase[e.phase] = (byPhase[e.phase] || 0) + 1; });
  const tasks = (res && res.tasks || []).map(t => ({ phase: t.phase, n: (t.guids || []).length, s: t.sDays, e: t.eDays }));
  return { n, civilCount: c, allCivil, template: T.meta.id, byPhase, tasks, readRes,
    log: lines.filter(l => /§(CIVIL_PHASE|TPL_ELEMENT_ORPHAN|TPL_PHASE_ABSENT|TPL_PHASE_COVERAGE)/.test(l)) };
}

(async () => {
  const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
  const SQL = await initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) });
  const files = process.argv.slice(2);
  if (!files.length) { console.log('§W_CIVIL_PHASE INCONCLUSIVE no db given'); process.exit(1); }
  for (const f of files) {
    const on = phasesOf(SQL, f, true), off = phasesOf(SQL, f, false);
    const name = path.basename(f);
    on.log.forEach(l => console.log('  ' + l));
    console.log('§W_CIVIL_PHASE file=' + name + ' n=' + on.n + ' civil=' + on.civilCount + ' allCivil=' + on.allCivil + ' template=' + on.template +
      ' phases(civilOn)=' + JSON.stringify(on.byPhase) + ' phases(civilOff)=' + JSON.stringify(off.byPhase));
    console.log('  tasks(civilOn)=' + JSON.stringify(on.tasks));
    console.log('  readTasks resources civilOn=' + JSON.stringify(on.readRes) + ' civilOff=' + JSON.stringify(off.readRes));
    if (on.n === 0) { console.log('  VERDICT INCONCLUSIVE (0 elements)'); continue; }
    if (on.allCivil) {
      const civilPhases = Object.keys(on.byPhase).length;
      console.log('  VERDICT ' + (civilPhases > 1 && !on.byPhase['Architecture Envelope'] ? 'PASS' : 'FAIL') +
        ' civil model splits into ' + civilPhases + ' discipline phases (was ' + Object.keys(off.byPhase).length + ')');
      const nRes = (on.readRes && typeof on.readRes === 'object') ? Object.keys(on.readRes).length : 0;
      console.log('  VERDICT ' + (nRes > 1 ? 'PASS' : nRes === 0 ? 'INCONCLUSIVE' : 'FAIL') + ' Gantt read model shows ' + nRes + ' resource(s) on the civil model');
    } else {
      const same = JSON.stringify(on.byPhase) === JSON.stringify(off.byPhase) && JSON.stringify(on.tasks) === JSON.stringify(off.tasks) && JSON.stringify(on.readRes) === JSON.stringify(off.readRes);
      console.log('  VERDICT ' + (same ? 'PASS' : 'FAIL') + ' non-civil model: phases+tasks identical with civil table ON vs OFF (civil elements=' + on.civilCount + ')');
    }
  }
})().catch(e => { console.log('§W_CIVIL_PHASE ERROR ' + e.stack); process.exit(2); });
