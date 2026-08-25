#!/usr/bin/env node
// WITNESS — §TEMPLATE_INSTANTIATE: the task grid is EMITTED FROM 4D_template.json, not grouped out
// of the element solve. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S69.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1):
//   the PERSISTED TASK GRID only — `tasks`, `task_sequences`, `task_elements` as materializeZones
//   writes them with opts.template. It says nothing about drawn bars, the movie, or kernel_ops.
//
// ISSUE THIS PROVES OR DISPROVES (§S68): until now the chain ran elements -> phases. deriveZones
// CREATED phases after the solve by grouping placed elements and taking min-start/max-end, so a
// phase bar was an ENVELOPE over what the elements did — and an envelope cannot constrain what drew
// it. That is why phase stacking was never reined in: MEASURED before this change, same-level phase
// pairs overlapping were HHS 10/29 (34%), Clinic 13/65, Duplex 7/38, Terminal 18/109, and 25/25
// persisted lags were the observed date gap restated as its own constraint.
//
// Command: node viewer/tests/witness_4d_template_instantiation.js [Building ...]
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

const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));
const { TemplateTaskRow } = require(path.join(KIT, 'schemas', '4d_instantiation'));
const INV = require(path.join(KIT, 'invariants', '4d_instantiation'));

const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Hospital', 'HHS_Office_Federated', 'Duplex'];
const START = '2026-01-01';

// The EXECUTED table, whole-file — slicing rates.js drops SEQUENCE_NAME_OVERRIDES and SHIFT_HOURS.
function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8'), sb);
  return sb;
}
const T = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', '4D_template.json'), 'utf8'));
const dayOf = iso => Math.round((Date.parse(iso) - Date.parse(START)) / 86400000);

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const SHIFT = T.calendar.hours_per_shift;
  const rows = [];
  const perBuilding = [];

  for (const bld of BUILDINGS) {
    const file = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§4DTI_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    const _l = console.log, _w = console.warn;
    const logs = [];
    console.log = (...a) => { const s = a.join(' '); if (s.indexOf('§TPL_') === 0 || s.indexOf('§AUTHOR_TPL') === 0) logs.push(s); };
    console.warn = () => {};
    const res = ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES, {
      start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
      scheduleGate: ScheduleGate, shiftHours: SHIFT, template: T
    });
    const els = ScheduleAuthor._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT
    });
    console.log = _l; console.warn = _w;
    if (!res.ok) { console.log('§4DTI_FAIL ' + bld + ' ' + res.reason); db.close(); continue; }

    // Read back what was PERSISTED — never the in-memory return value. A witness that trusts the
    // function's own report cannot catch a write that silently dropped rows.
    const q = s => { const r = db.exec(s); return r.length ? r[0].values : []; };
    const taskRows = q("SELECT task_id,name,schedule_start,schedule_finish FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0");
    const seqRows = q("SELECT predecessor_id,successor_id,sequence_type,lag_days FROM task_sequences");
    const teRows = q("SELECT task_id,guid FROM task_elements");

    const byGuid = {}; els.forEach(e => { byGuid[e.guid] = e; });
    const work = {}, guidsOf = {};
    teRows.forEach(([tid, g]) => {
      (guidsOf[tid] = guidsOf[tid] || []).push(g);
      const e = byGuid[g]; if (!e) return;
      const w = work[tid] || (work[tid] = {});
      const tr = (e.resource && e.resource !== '_DEFAULT') ? e.resource : '_DEFAULT';
      w[tr] = (w[tr] || 0) + (e.installSecs || 0);
    });
    const shiftSecs = SHIFT * 3600;
    const mc = t => (R.LABOR_RATES[t] && R.LABOR_RATES[t].max_crews) || 1;

    const bRows = taskRows.map(([tid, name, s, f]) => {
      const w = work[tid] || {};
      let crewDays = 0, any = 0;
      Object.keys(w).forEach(t => {
        if (t === '_DEFAULT') return; any = 1;
        const d = w[t] / (shiftSecs * mc(t)); if (d > crewDays) crewDays = d;
      });
      if (!any) crewDays = (w._DEFAULT || 0) / shiftSecs;
      const dash = name.indexOf(' — ');
      return {
        building: bld, taskId: tid, name,
        phase: dash > 0 ? name.slice(0, dash) : name,
        storey: dash > 0 ? name.slice(dash + 3) : '',
        startDay: dayOf(s), endDay: dayOf(f), crewDays,
        guids: guidsOf[tid] || [],
        members: (guidsOf[tid] || []).length
      };
    });
    rows.push(...bRows);
    perBuilding.push({ bld, tasks: bRows, seq: seqRows, els, logs, te: teRows, totalDays: res.totalDays });

    const stack = INV.phaseOverlapCount(bRows, T);
    const breaches = INV.gridCrewBreaches(bRows, els, R.LABOR_RATES, SHIFT);
    console.log('§4DTI_CREW ' + bld + ' breaches=' + breaches.length + (breaches.length ? ' [' + breaches.join('; ') + ']' : ' — every trade within max_crews'));
    console.log('§4DTI_ASSIGN ' + bld + ' elements=' + els.length + ' assignedToTasks=' + new Set(teRows.map(r => r[1])).size +
      ' orphaned=' + (els.length - new Set(teRows.map(r => r[1])).size));
    console.log('§4DTI ' + bld + ' els=' + els.length + ' tasks=' + bRows.length + ' edges=' + seqRows.length +
      ' totalDays=' + res.totalDays + ' sameLevelPhaseOverlaps=' + stack.overlapping + '/' + stack.pairs +
      ' distinctLags=' + JSON.stringify(Array.from(new Set(seqRows.map(r => r[3])))));
    logs.filter(l => l.indexOf('§TPL_PHASE_ABSENT') === 0 || l.indexOf('§TPL_PHASE_COVERAGE') === 0)
      .forEach(l => console.log('   ' + l));
    db.close();
  }

  Witness('4d_template_instantiation')
    .population(() => rows)
    .schema(TemplateTaskRow)
    // THE POINT (§S68): packed and strictly sequential — no two phases on the same level overlap.
    .invariant('no-same-level-phase-overlap', () => perBuilding.every(b => INV.phaseOverlapCount(b.tasks, T).overlapping === 0))
    // duration_rule: a task's window must cover its own per-trade work content.
    .invariant('window-covers-per-trade-work', rs => INV.windowCoversWork(rs))
    // The tautology killer: every persisted lag is the TEMPLATE's declared value, not a date gap.
    .invariant('lags-come-from-the-template', () => perBuilding.every(b => INV.lagsAreTemplateDeclared(b.seq, T)))
    // §4D_BAND_MONOTONIC as data: a phase never starts before the same phase one level below ends.
    .invariant('ladder-holds-across-levels', () => perBuilding.every(b => INV.ladderHolds(b.tasks, b.seq)))
    // Float must EXIST — an edge graph that is tight everywhere is the old tautology in a new shape.
    .invariant('float-exists-somewhere', () => perBuilding.every(b => INV.slackEdgeCount(b.tasks, b.seq) > 0))
    // Crew capacity across the emitted grid, the HOP6b check as a gate.
    .invariant('task-grid-is-crew-legal', () => perBuilding.every(b => INV.gridCrewBreaches(b.tasks, b.els, R.LABOR_RATES, SHIFT).length === 0))
    // NO SILENT LOSS: every element the engine built must land in exactly one task. Caught a real
    // defect in the instantiator (a building-scope phase dropped its own upper-level elements) that
    // every other number — tasks, edges, days, coverage — reported as fine.
    .invariant('every-element-lands-in-a-task', () => perBuilding.every(b => INV.everyElementLandsInATask(b.els.length, b.te)))
    // Absence is REPORTED, never silent — the §S67 HOP1/HOP3 defect.
    .invariant('absence-is-reported', () => perBuilding.every(b => b.logs.some(l => l.indexOf('§TPL_PHASE_COVERAGE') === 0)))
    .redControl(rs => rs.map((r, i) => i ? r : Object.assign({}, r, { endDay: r.startDay })))
    .run();
})();
