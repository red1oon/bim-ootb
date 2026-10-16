#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §MIXED_PROGRAMME (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MIXED_PROGRAMME)
// Scope: the 4D programme of a road model that also holds a bridge (and the BIM partner's ground-treatment / gabion /
// chainage / right-of-way files). Runs the SHIPPED schedule_author.js materializeZones in node, rates.js in a vm, and the
// template the viewer's gate (time_machine.js _hasCivil: ANY civil row) selects. Read the log after every run.
//
// ISSUES THIS PROVES OR DISPROVES:
//  M1 "road + bridge gets the building template, no civil order" → gate picks 4d_template_civil when any row is civil.
//  M2 "piles after the embankment"                               → Ground Treatment task finishes ≤ Earthworks task start.
//  M3 "bridge alongside earthworks + pavement" (user ruling)      → Substructure task starts when Earthworks starts.
//  M4 "lamps before pavement"                                     → every finishing task starts ≥ Pavement task finish.
//  M5 "chainage labels / right-of-way scheduled as work"         → 0 CHAINAGE/ROW guids in any task.
//  M6 "an element of the model reaches no task"                  → every scheduled element is in exactly one task.
// Prints §MP_MAKESPAN — the programme length the standard (editable) labour rates give.
// CAN REPORT ITS OWN FAILURE: VACUOUS when the population a check judges is empty (e.g. no GEOTECH rows → M2 VACUOUS).
// Usage: node viewer/tests/witness_civil_mixed_programme.js <model.db>
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const V = path.join(__dirname, '..'), HOME = os.homedir();

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.log('§MP_VERDICT INCONCLUSIVE no db'); process.exit(2); }
  // rates.js as the browser sees it: its globals exist BEFORE the modules load (cpm_schedule reads SEQUENCE_CIVIL at load)
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8') + ';this.__CIV=SEQUENCE_CIVIL;this.__CR=CIVIL_RATES;', sb);
  global.SEQUENCE_CIVIL = sb.__CIV; global.CIVIL_RATES = sb.__CR;
  const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
  const SA = require(path.join(V, 'schedule_author.js')); global.ScheduleAuthor = SA;
  global.SupportSweep = require(path.join(V, 'support_sweep.js'));
  global.CpmSchedule = require(path.join(V, 'cpm_schedule.js'));
  global.GanttModel = require(path.join(V, 'gantt_model.js'));
  globalThis.RoomWalker = require(path.join(V, 'lib', 'room_walker.js'));
  globalThis.LevelDeriver = require(path.join(V, 'lib', 'level_deriver.js'));
  globalThis.LocationAxis = require(path.join(V, 'location_axis.js'));
  const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
  const SQL = await initSqlJs({ locateFile: f => path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist', f) });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
  const keys = Object.keys(sb.__CIV);
  // the viewer's gate, through the same population owner
  const g = db.exec("SELECT COUNT(*), SUM(CASE WHEN discipline IN (" + keys.map(() => '?').join(',') + ") THEN 1 ELSE 0 END) FROM elements_meta WHERE " + SA.scheduledWhere(''), keys);
  const n = g[0].values[0][0], c = g[0].values[0][1] || 0;
  const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', c > 0 ? '4D_template_civil.json' : '4D_template.json'), 'utf8'));
  console.log(`§MP_GATE scheduled=${n} civil=${c} template=${T.meta.id} v${T.meta.version}`);
  const base = { start: '2026-01-01', laborRates: sb.LABOR_RATES, rates: sb.RATES, nameOverrides: sb.SEQUENCE_NAME_OVERRIDES,
    defaultRule: sb.SEQUENCE_DEFAULT, scheduleGate: SG, shiftHours: T.calendar.hours_per_shift, template: T, db: db, civilRules: sb.__CIV };
  globalThis.APP = { db: db };
  const res = SA.materializeZones(db, sb.SEQUENCE_RULES, base);   // §-log ON (PRIMAL LAW 3)
  const tasks = (res && res.tasks) || [];
  const by = {}; tasks.forEach(t => { (by[t.phase] = by[t.phase] || []).push(t); });
  const span = ph => by[ph] ? { s: Math.min(...by[ph].map(t => t.sDays)), e: Math.max(...by[ph].map(t => t.eDays)), n: by[ph].reduce((a, t) => a + t.guids.length, 0), tasks: by[ph].length } : null;
  const phases = Object.keys(by);
  phases.forEach(ph => { const s = span(ph); console.log(`§MP_PHASE ${ph.padEnd(22)} tasks=${s.tasks} elements=${s.n} day ${s.s.toFixed(1)} → ${s.e.toFixed(1)}`); });
  const makespan = Math.max(0, ...tasks.map(t => t.eDays));
  console.log(`§MP_MAKESPAN days=${makespan.toFixed(1)} (calendar days of the template calendar; labour = rates.js LABOR_RATES, editable)`);

  const V_ = {};
  V_.M1 = c > 0 ? (T.meta.id === '4d_template_civil' ? 'GREEN' : 'RED') : 'VACUOUS no civil rows';
  const gt = span('Ground Treatment'), ew = span('Earthworks'), pv = span('Pavement'), sub = span('Substructure');
  V_.M2 = !gt ? 'VACUOUS no Ground Treatment task' : !ew ? 'VACUOUS no Earthworks task' : (gt.e <= ew.s + 1e-9 ? 'GREEN' : `RED gt.e=${gt.e} ew.s=${ew.s}`);
  V_.M3 = !sub ? 'VACUOUS no Substructure task' : !ew ? 'VACUOUS no Earthworks task' : (Math.abs(sub.s - ew.s) < 1e-9 ? 'GREEN' : `RED sub.s=${sub.s} ew.s=${ew.s}`);
  const fin = ['Road Furniture', 'Signage', 'Road Lighting', 'Road Marking'].map(span).filter(Boolean);
  V_.M4 = !pv ? 'VACUOUS no Pavement task' : !fin.length ? 'VACUOUS no finishing task' : (fin.every(f => f.s >= pv.e - 1e-9) ? 'GREEN' : 'RED finishing starts before pavement ends');
  const refRows = db.exec("SELECT guid FROM elements_meta WHERE discipline IN ('CHAINAGE','ROW')");
  const refs = new Set(refRows.length ? refRows[0].values.map(r => r[0]) : []);
  let inTask = 0; const seen = new Map();
  tasks.forEach(t => t.guids.forEach(gd => { if (refs.has(gd)) inTask++; seen.set(gd, (seen.get(gd) || 0) + 1); }));
  V_.M5 = !refs.size ? 'VACUOUS no CHAINAGE/ROW rows' : (inTask === 0 ? 'GREEN' : `RED ${inTask} reference elements in tasks`);
  const dup = [...seen.values()].filter(v => v > 1).length, missing = n - seen.size;
  console.log(`§MP_COVERAGE scheduled=${n} in_tasks=${seen.size} missing=${missing} in_two_tasks=${dup} references_excluded=${refs.size}`);
  V_.M6 = (missing === 0 && dup === 0) ? 'GREEN' : `RED missing=${missing} dup=${dup}`;
  const all = Object.keys(V_).map(k => k + '=' + V_[k]);
  const verdict = all.some(s => /RED/.test(s)) ? 'RED' : all.every(s => /GREEN/.test(s)) ? 'GREEN' : 'PARTIAL';
  console.log('§MP_VERDICT ' + verdict + ' ' + all.join(' · '));
  process.exit(verdict === 'RED' ? 1 : 0);
})().catch(e => { console.log('§MP_ERR ' + e.stack); process.exit(2); });
