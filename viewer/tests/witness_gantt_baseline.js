#!/usr/bin/env node
// witness_gantt_baseline.js — ⚑ Set Baseline (2026-08-05). Proves ScheduleAuthor.setBaseline /
// getBaselineVariance against a REAL authored schedule + a REAL drag (moveTaskCascade), on real
// building fixtures. Both verbs are exported and node-testable directly — no slicing needed, unlike
// the DOM-coupled UI functions witness_gantt_edit_undo.js had to slice.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDING = process.argv[2] || 'Terminal';

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const dbPath = path.join(BLD_DIR, BUILDING + '_extracted.db');
  if (!fs.existsSync(dbPath)) { console.log('§BASELINE_SKIP ' + BUILDING + ' fixture missing'); return; }
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
  const mres = ScheduleAuthor.materializeZones(db, SEQUENCE_RULES, { start: '2026-01-01', laborRates: {}, rates: {}, scheduleGate: ScheduleGate });
  if (!mres.ok) { console.log('§BASELINE_SKIP materializeZones failed: ' + JSON.stringify(mres)); db.close(); return; }
  const schedId = 'SCH_AUTHORED';

  // RED CONTROL: no baseline set yet -> honest refusal, not a fabricated empty-success.
  const preRes = ScheduleAuthor.getBaselineVariance(db, schedId);
  assert(preRes.ok === false && preRes.reason === 'no_baseline', 'RED-CONTROL getBaselineVariance before any setBaseline call refuses honestly');

  const setRes = ScheduleAuthor.setBaseline(db, schedId);
  assert(setRes.ok === true && setRes.taskCount > 0, 'setBaseline captures every task row — taskCount=' + (setRes && setRes.taskCount));

  const v0 = ScheduleAuthor.getBaselineVariance(db, schedId);
  assert(v0.ok === true, 'getBaselineVariance succeeds once a baseline exists');
  const nonZeroAtStart = v0.tasks.filter(function (t) { return t.varianceDays !== 0; });
  assert(nonZeroAtStart.length === 0,
    'immediately after baseline, every task shows 0 variance (baseline == current) — nonZero=' + nonZeroAtStart.length);
  assert(v0.tasks.length === setRes.taskCount, 'getBaselineVariance covers exactly the tasks setBaseline captured');

  // Real drag — same engine verb commitGanttDrag uses, real cascade, on a task with a real successor.
  const seqR = db.exec('SELECT predecessor_id FROM task_sequences GROUP BY predecessor_id HAVING COUNT(*) >= 1');
  const dragTaskId = (seqR.length ? seqR[0].values[0][0] : null) ||
    db.exec("SELECT task_id FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0) LIMIT 1")[0].values[0][0];
  const curR = db.exec('SELECT schedule_start FROM tasks WHERE task_id=?', [dragTaskId]);
  const newStart = new Date(Date.parse(curR[0].values[0][0] + 'T00:00:00Z') + 20 * 86400000).toISOString().slice(0, 10);
  const moveRes = ScheduleAuthor.moveTaskCascade(db, schedId, dragTaskId, newStart, {});
  assert(moveRes.ok === true, 'the real drag itself succeeds — dragTask=' + dragTaskId + ' cascaded=' + (moveRes && moveRes.cascaded));
  const movedIds = (moveRes.moved || []).map(function (m) { return m.id; });

  const v1 = ScheduleAuthor.getBaselineVariance(db, schedId);
  const nonZeroAfter = v1.tasks.filter(function (t) { return t.varianceDays !== 0; }).map(function (t) { return t.taskId; });
  const wrongZero = movedIds.filter(function (id) { return nonZeroAfter.indexOf(id) < 0; });
  const wrongNonZero = nonZeroAfter.filter(function (id) { return movedIds.indexOf(id) < 0; });
  console.log('§BASELINE ' + BUILDING + ' dragTask=' + dragTaskId + ' cascaded=' + moveRes.cascaded +
    ' movedByDrag=' + movedIds.length + ' nonZeroVariance=' + nonZeroAfter.length);
  assert(wrongZero.length === 0, 'every task the drag actually moved shows non-zero variance — missing=' + JSON.stringify(wrongZero));
  assert(wrongNonZero.length === 0, 'no task OUTSIDE the drag shows spurious variance — spurious=' + JSON.stringify(wrongNonZero));

  // Re-baseline (idempotent overwrite, single baseline — not P6's multi-baseline numbering).
  const setRes2 = ScheduleAuthor.setBaseline(db, schedId);
  assert(setRes2.taskCount === setRes.taskCount, 're-baselining does not change the task count (overwrite, not accumulation)');
  const rowCountR = db.exec('SELECT COUNT(*) FROM task_baseline WHERE schedule_id=?', [schedId]);
  assert(rowCountR[0].values[0][0] === setRes.taskCount, 'task_baseline row count still equals taskCount after re-baseline — no duplicate rows');
  const v2 = ScheduleAuthor.getBaselineVariance(db, schedId);
  const nonZeroAfterRebaseline = v2.tasks.filter(function (t) { return t.varianceDays !== 0; });
  assert(nonZeroAfterRebaseline.length === 0,
    'after re-baselining, every task shows 0 variance again (new baseline == current) — nonZero=' + nonZeroAfterRebaseline.length);

  db.close();
  console.log('\n§W-BASELINE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§BASELINE_ERROR', e); process.exit(1); });
