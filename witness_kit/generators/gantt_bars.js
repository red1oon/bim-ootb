// witness_kit/generators/gantt_bars.js — the REAL drawer's bar model, driven end-to-end on a real
// building. Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65 STAGE 3.
//
// WHY A GENERATOR AND NOT AN INLINE BLOCK IN THE WITNESS: the same assembly is needed by the
// single-building and the fleet witness, and hand-copying it is the exact drift class witness_kit
// exists to prevent (WITNESS_CONTRACT_AUDIT.md's #1 rot source). Same reasoning as
// generators/schedule_4d.js.
//
// WHAT IT DRIVES, and why each piece is the real one:
//   - ScheduleAuthor.materializeZones — the PRODUCTION authoring path (schedule_author_ui.js:284,
//     time_machine.js buildTaskIndex's stale-regen). NOT materializeDefault: that produces 6 coarse
//     phase tasks while production produces ~17 zone tasks, and every earlier witness in this lane
//     drove the wrong one, which is a large part of why they stayed green through real defects
//     (§S65 STAGE 1).
//   - ScheduleAuthor._buildScheduleElements + ScheduleGate.computeSchedule — the same element solve
//     injectGantt's kernel_ops ELEMENT_PLACE rows carry.
//   - idx in the SHAPE buildTaskIndex() actually builds — { id, name, start, finish } per task
//     (time_machine.js:5295). A first cut passed only { name } and silently exercised the ops
//     fallback instead of the path under test; the witness looked unchanged and proved nothing.
//   - GanttModel.buildTasks / GanttModel.computeDays — the REAL drawer model, called, never mirrored.
//
// WHAT IT IS NOT: this is not the persisted kernel_ops table and not the rendered canvas. It is the
// drawer's MODEL layer — the function whose output the canvas draws rectangles from. Named per
// WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1 so nobody extends its claim past what it checks.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const initSqlJs = require('sql.js');   // same resolution as generators/schedule_4d.js
const SA = require(path.join(ROOT, 'viewer', 'schedule_author.js'));
const SG = require(path.join(ROOT, 'viewer', 'schedule_gate.js'));
require(path.join(ROOT, 'viewer', 'cpm_schedule.js'));
require(path.join(ROOT, 'viewer', 'support_sweep.js'));
const GM = require(path.join(ROOT, 'viewer', 'gantt_model.js'));

const DAY = 86400000;

function rowsFrom(r) {
  if (!r.length) return [];
  return r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => o[c] = v[i]); return o; });
}

function loadRealRates() {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'rates.js'), 'utf8'), sandbox);
  return sandbox;
}

/**
 * generateRealGanttBars(dbPath, opts) -> Promise<row[]>
 * One row per drawn bar, carrying both what the drawer WILL draw and the authored window it must
 * match, plus the pixel width at a realistic canvas so a "too thin to see" claim is a number.
 * @param {string} dbPath
 * @param {{start?:string, barW?:number}} [opts]
 * @returns {Promise<object[]>}
 */
async function generateRealGanttBars(dbPath, opts) {
  opts = opts || {};
  const start = opts.start || '2026-08-25';
  const barW = opts.barW || 340;   // real drawer: rc.clientWidth - 60 (time_machine.js:5868)

  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const R = loadRealRates();
  const shift = (R.SHIFT_HOURS > 0) ? R.SHIFT_HOURS : 24;

  // schedule_author.js emits one §CLASS_UNMATCHED warn per unmatched ELEMENT; on Hospital that alone
  // exceeded run_witness_suite.js's 1MB spawnSync maxBuffer and got the child SIGTERM'd while the
  // script exits 0 standalone (WITNESS_INTERFACE_FRAMEWORK.md §6). Mute locally — not in the shared
  // engine, not in the runner.
  const mute = ['log', 'warn', 'error'].map(k => { const o = console[k]; console[k] = () => {}; return [k, o]; });
  let els, solve;
  try {
    const res = SA.materializeZones(db, R.SEQUENCE_RULES, {
      start, laborRates: R.LABOR_RATES, rates: R.RATES || {},
      scheduleGate: SG, shiftHours: shift, defaultRule: R.SEQUENCE_DEFAULT
    });
    if (!res || !res.ok) { db.close(); mute.forEach(([k, o]) => console[k] = o); return []; }
    els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES || {}, defaultRule: R.SEQUENCE_DEFAULT,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES
    });
    const maxCrews = {};
    for (const r in R.LABOR_RATES) if (R.LABOR_RATES[r].max_crews) maxCrews[r] = R.LABOR_RATES[r].max_crews;
    solve = SG.computeSchedule(els, Date.parse(start), 1, maxCrews, shift);
  } finally { mute.forEach(([k, o]) => console[k] = o); }

  const tasks = rowsFrom(db.exec('SELECT * FROM tasks'));
  const te = rowsFrom(db.exec('SELECT task_id, guid FROM task_elements'));

  const win = {}, taskRow = {};
  tasks.forEach(t => {
    if (Number(t.is_summary) === 1 || !t.schedule_start || !t.schedule_finish) return;
    const s = Date.parse(t.schedule_start), e = Date.parse(t.schedule_finish);
    if (!isFinite(s) || !isFinite(e)) return;
    win[t.task_id] = { s, e, name: t.name };
    taskRow[t.task_id] = { id: t.task_id, name: t.name, start: t.schedule_start, finish: t.schedule_finish };
  });
  const guidTask = {};
  te.forEach(r => {
    if (!win[r.task_id]) return;
    if (!guidTask[r.guid] || win[r.task_id].s < win[guidTask[r.guid]].s) guidTask[r.guid] = r.task_id;
  });

  const byGuid = {}; els.forEach(e => byGuid[e.guid] = e);
  const ops = [];
  Object.keys(solve).forEach(g => {
    const e = byGuid[g]; if (!e) return;
    ops.push({
      op_type: 'ELEMENT_PLACE', output_guid: g,
      start_ts: solve[g].start, end_ts: solve[g].end,
      parameters: { storey: e.storey || '_UNKNOWN', phase: e.phase || 'Architecture' }
    });
  });

  const built = GM.buildTasks(ops, { guidTask, tasks: taskRow }, R.SEQUENCE_RULES);
  const days = GM.computeDays(ops, taskRow);
  const axis = Math.max(1, days.axisEnd - days.axisStart);

  const out = built.tasks.map(b => {
    const w = b.taskId ? win[b.taskId] : null;
    return {
      building: path.basename(dbPath).replace(/_extracted\.db$/, ''),
      taskId: b.taskId || null,
      name: (w && w.name) || (b.phase + '|' + b.storey),
      phase: b.phase,
      spanFrom: b.spanFrom,
      startTs: b.startTs, endTs: b.endTs,
      winStart: w ? w.s : null, winEnd: w ? w.e : null,
      widthPx: ((b.endTs - b.startTs) / axis) * barW,
      axisDays: axis / DAY,
      members: b.count
    };
  });
  db.close();
  return out;
}

module.exports = { generateRealGanttBars, DAY };
