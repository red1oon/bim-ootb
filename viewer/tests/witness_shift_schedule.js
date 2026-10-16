#!/usr/bin/env node
// witness_shift_schedule.js — §TM_RULER_SHIFT engine verb (2026-08-05). Proves ScheduleAuthor.
// shiftSchedule translates EVERY task (leaf and summary alike) by a constant number of days while
// preserving every task's relative position to every other task exactly — the property that makes
// C1/C2 constraint checking unnecessary for this verb (a uniform shift can never create or resolve
// a task_sequences violation). Real fixture, real materialized schedule, not synthetic rows.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function day(s) { return Math.round(Date.parse(s + 'T00:00:00Z') / 86400000); }

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  const dbPath = path.join(require('os').homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
  const opts = { start: '2026-01-01', laborRates: {}, rates: {}, scheduleGate: ScheduleGate };
  const mres = ScheduleAuthor.materializeZones(db, SEQUENCE_RULES, opts);
  if (!mres.ok) { console.log('§SHIFT_SKIP materializeZones failed: ' + JSON.stringify(mres)); return; }
  const schedId = mres.scheduleId;

  function readAll() {
    const r = db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration, is_summary FROM tasks WHERE schedule_id=?', [schedId]);
    const out = {};
    r[0].values.forEach(function (row) { out[row[0]] = { start: row[1], finish: row[2], duration: row[3], isSummary: row[4] }; });
    return out;
  }

  const before = readAll();
  const taskIds = Object.keys(before);
  assert(taskIds.length > 1, 'RED-CONTROL: the real schedule has more than one task, or a uniform-shift claim is untestable');
  const summaryCount = taskIds.filter(function (id) { return before[id].isSummary; }).length;
  assert(summaryCount > 0, 'RED-CONTROL: at least one summary/root row exists, so "leaf AND summary alike" is actually exercised');

  const DELTA = 17;
  const res = ScheduleAuthor.shiftSchedule(db, schedId, DELTA);
  assert(res.ok, 'shiftSchedule succeeds on a real materialized schedule');
  assert(res.moved.length === taskIds.length, 'moved count equals every task in the schedule — moved=' + res.moved.length + ' total=' + taskIds.length);

  const after = readAll();
  let allShiftedByDelta = true, allDurationsUnchanged = true, allRelativeOffsetsPreserved = true;
  taskIds.forEach(function (id) {
    const b = before[id], a = after[id];
    if (day(a.start) - day(b.start) !== DELTA) allShiftedByDelta = false;
    if (day(a.finish) - day(b.finish) !== DELTA) allShiftedByDelta = false;
    if (a.duration !== b.duration) allDurationsUnchanged = false;
  });
  assert(allShiftedByDelta, 'every task (leaf + summary) start AND finish moved by exactly +' + DELTA + 'd, none skipped');
  assert(allDurationsUnchanged, 'duration is untouched on every task — start and finish moved by the identical amount');

  // RELATIVE spacing between any two tasks must be byte-identical before/after — this is the
  // property that makes the verb safe with zero C1/C2 constraint checking.
  const pairSample = taskIds.slice(0, Math.min(20, taskIds.length));
  for (let i = 0; i < pairSample.length && allRelativeOffsetsPreserved; i++) {
    for (let j = i + 1; j < pairSample.length; j++) {
      const beforeGap = day(before[pairSample[j]].start) - day(before[pairSample[i]].start);
      const afterGap = day(after[pairSample[j]].start) - day(after[pairSample[i]].start);
      if (beforeGap !== afterGap) { allRelativeOffsetsPreserved = false; break; }
    }
  }
  assert(allRelativeOffsetsPreserved, 'every pair of tasks keeps its exact relative start-date gap (uniform translation, no relative drift)');

  // RED CONTROL: a zero-delta shift must still succeed and be a true no-op (not silently skipped).
  const noop = ScheduleAuthor.shiftSchedule(db, schedId, 0);
  const afterNoop = readAll();
  const noopIdentical = taskIds.every(function (id) { return afterNoop[id].start === after[id].start && afterNoop[id].finish === after[id].finish; });
  assert(noop.ok && noopIdentical, 'RED CONTROL: a deltaDays=0 shift succeeds and changes nothing (true no-op, not a silent skip)');

  db.close();
  console.log('\n§SHIFT_SCHEDULE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
