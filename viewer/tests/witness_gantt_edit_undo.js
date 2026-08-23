#!/usr/bin/env node
// witness_gantt_edit_undo.js — §GANTT_EDIT_UNDO (2026-08-05). Proves the new ↺ Undo edit button
// (replacing the dead "Copy Touched" slot) actually restores both tables a drag/resize edit
// touches — `tasks` (moveTaskCascade/resizeTask) and `kernel_ops` (retimeTaskElements) — to their
// exact pre-edit values, on a REAL authored schedule against a REAL building fixture.
//
// Convention this repo already established (witness_class_fallback_blackbox.js, K0's own lesson
// "copy the predicate instead of importing it caused the same bug 3x"): slice the SHIPPED functions
// out of time_machine.js by balanced braces, never reimplement the restore logic in the test. The
// sliced block (loadOps, _retimeSpan, retimeTaskElements, commitGanttDrag, undoLastGanttEdit) is
// DOM-heavy in its host file, so this witness supplies a minimal sandbox for its free variables
// (A(), document, window.ScheduleAuthor, the redraw no-ops) — never a second copy of the restore SQL.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
  // §S56: commitGanttDrag/generateGanttSchedule now call _tmBusyRecording (the §TM_BAKE_LOCK
  // guard). Declared here because a sliced function cannot state its own dependencies — the
  // same undeclared-dep class that killed two witnesses in §S62. Adding the name is the fix;
  // the suite runner caught the omission the moment the guard landed.
const sliced = [
  '_tmBusyRecording',
  // §S69: the per-site refusal moved into one helper, so the sliced verbs call THIS now. Sliced
  // rather than stubbed — it is five lines and slicing the real one keeps the sandbox honest about
  // what the guard actually does (with no recording flag set on the fake app, it returns false).
  '_tmEditLocked',
  'loadOps', '_retimeSpan', 'retimeTaskElements', 'commitGanttDrag', 'undoLastGanttEdit'
].map(function (n) { return sliceFn(tmSrc, n); }).join('\n');

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDING = process.argv[2] || 'Duplex';

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const dbPath = path.join(BLD_DIR, BUILDING + '_extracted.db');
  if (!fs.existsSync(dbPath)) { console.log('§UNDO_SKIP ' + BUILDING + ' fixture missing'); return; }
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
  const opts = { start: '2026-01-01', laborRates: {}, rates: {}, scheduleGate: ScheduleGate };
  const mres = ScheduleAuthor.materializeZones(db, SEQUENCE_RULES, opts);
  if (!mres.ok) { console.log('§UNDO_SKIP materializeZones failed: ' + JSON.stringify(mres)); db.close(); return; }

  // Seed kernel_ops the way a real built/played Gantt would — one ELEMENT_PLACE row per
  // task_elements guid, timed at its task's own real window. This is the substrate
  // retimeTaskElements/commitGanttDrag operate on in the live app (loadOps()'s own table).
  db.run('CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, ' +
    'op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
  const tr = db.exec("SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
  const taskWindow = {};
  tr[0].values.forEach(function (row) {
    taskWindow[row[0]] = { s: Date.parse(row[1] + 'T00:00:00Z'), e: Date.parse(row[2] + 'T00:00:00Z') };
  });
  const teAll = db.exec('SELECT task_id, guid FROM task_elements');
  const guidsByTask = {};
  const insOp = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
  db.run('BEGIN');
  teAll[0].values.forEach(function (row) {
    const tid = row[0], guid = row[1], w = taskWindow[tid]; if (!w) return;
    (guidsByTask[tid] = guidsByTask[tid] || []).push(guid);
    insOp.run([w.s, 'ELEMENT_PLACE', JSON.stringify({ _end_ts: w.e }), '[]', guid]);
  });
  insOp.free();
  db.run('COMMIT');

  // Pick a real task that has at least one real successor (a cascade case, not a trivial single move)
  // — the SAME task_sequences data the app's own moveTaskCascade reads.
  const seqR = db.exec("SELECT predecessor_id FROM task_sequences GROUP BY predecessor_id HAVING COUNT(*) >= 1");
  const candidates = (seqR.length ? seqR[0].values.map(r => r[0]) : []).filter(function (id) { return taskWindow[id]; });
  const dragTaskId = candidates[0] || Object.keys(taskWindow)[0];

  // ── Sandbox: real sliced functions, minimal free-variable stubs ──
  const _ganttTasks = Object.keys(taskWindow).map(function (tid) {
    return { taskId: tid, guids: guidsByTask[tid] || [], startTs: taskWindow[tid].s, endTs: taskWindow[tid].e, storey: '', phase: '' };
  });
  const sandbox = {
    console: console, JSON: JSON, Date: Date, Math: Math,
    _ganttTasks: _ganttTasks, _taskIndex: { scheduleId: 'SCH_AUTHORED' }, _lastEdit: null, _cursor: 0,
    window: { ScheduleAuthor: ScheduleAuthor, performance: null },
    A: function () { return { db: db }; },
    document: { getElementById: function () { return null; } },
    invalidateGanttModel: function () {}, computeDays: function () {}, drawGanttMini: function () {}, renderAtTime: function () {},
    // §GANTT_RETIME_RESYNC (PR #1240) added this call to every retime commit path; a cache/index
    // rebuild is a no-op here (the witness asserts on the DB rows, not the render caches)
    _tmResyncAfterRetime: function () {},
    // §GANTT_CPM_ANNOTATE (§S68) added a second such call to the same paths. Stubbed for the same
    // reason — it only writes early_*/late_*/float/is_critical and this witness asserts on
    // schedule_start/schedule_finish. That annotate cannot touch those columns is proven separately,
    // on the real verb rather than a stub, by witness_gantt_cpm_annotate.js W-CPM-2.
    _tmAnnotateCpm: function () {}
  };
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nglobalThis.__ops = _ops = loadOps(); ' +
    'globalThis.__commit = commitGanttDrag; globalThis.__undo = undoLastGanttEdit; ' +
    'globalThis.__getLastEdit = function(){ return _lastEdit; };', sandbox);
  sandbox._ops = sandbox.__ops;

  function snapshot() {
    const t = {}, o = {};
    db.exec("SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id='SCH_AUTHORED'")[0].values
      .forEach(function (r) { t[r[0]] = r[1] + '|' + r[2] + '|' + r[3]; });
    db.exec("SELECT output_guid, timestamp, parameters FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0].values
      .forEach(function (r) { o[r[0]] = r[1] + '|' + r[2]; });
    return { t: t, o: o };
  }
  function diffKeys(a, b) {
    const keys = Object.keys(a); const out = [];
    keys.forEach(function (k) { if (a[k] !== b[k]) out.push(k); });
    return out;
  }

  const before = snapshot();

  // Drag the chosen task 20 days later — real engine verb (moveTaskCascade), real cascade.
  const bar = _ganttTasks.filter(function (b) { return b.taskId === dragTaskId; })[0];
  sandbox.__commit(bar, 'move', 20);
  const afterEdit = snapshot();
  const changedTasksAfterEdit = diffKeys(before.t, afterEdit.t);
  const changedOpsAfterEdit = diffKeys(before.o, afterEdit.o);

  console.log('§UNDO ' + BUILDING + ' dragTask=' + dragTaskId +
    ' tasksChangedByEdit=' + changedTasksAfterEdit.length + ' opsChangedByEdit=' + changedOpsAfterEdit.length);

  // RED CONTROL: the edit must actually have changed something, or the restore assertion below is vacuous.
  assert(changedTasksAfterEdit.length > 0, 'RED-CONTROL the drag actually changed at least one task row');
  assert(changedOpsAfterEdit.length > 0, 'RED-CONTROL the drag actually changed at least one kernel_ops row');
  assert(sandbox.__getLastEdit() !== null, '_lastEdit is populated after a committed edit');

  sandbox.__undo();
  const afterUndo = snapshot();
  const stillWrongTasks = diffKeys(before.t, afterUndo.t);
  const stillWrongOps = diffKeys(before.o, afterUndo.o);

  assert(stillWrongTasks.length === 0,
    'every task row restored to its exact pre-edit value — mismatched=' + JSON.stringify(stillWrongTasks));
  assert(stillWrongOps.length === 0,
    'every kernel_ops row restored to its exact pre-edit value — mismatched=' + JSON.stringify(stillWrongOps));
  assert(sandbox.__getLastEdit() === null, '_lastEdit cleared after undo (single-level, not a stack)');

  // Second undo click must be a safe no-op — not throw, not touch the DB further.
  let threw = false;
  try { sandbox.__undo(); } catch (e) { threw = true; }
  const afterSecondUndo = snapshot();
  assert(!threw, 'a second Undo click (nothing left to undo) does not throw');
  assert(diffKeys(before.t, afterSecondUndo.t).length === 0 && diffKeys(before.o, afterSecondUndo.o).length === 0,
    'a second Undo click leaves state unchanged (true no-op, not a second reversal)');

  // Scope check: tasks/ops OUTSIDE the cascade must never have been touched by either edit or undo.
  const untouchedTaskIds = Object.keys(before.t).filter(function (id) { return changedTasksAfterEdit.indexOf(id) < 0; });
  const everTouchedWrongly = untouchedTaskIds.filter(function (id) { return afterEdit.t[id] !== before.t[id] || afterUndo.t[id] !== before.t[id]; });
  assert(everTouchedWrongly.length === 0, 'tasks outside the real cascade were never mutated by edit or undo');

  db.close();
  console.log('\n§W-UNDO SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§UNDO_ERROR', e); process.exit(1); });
