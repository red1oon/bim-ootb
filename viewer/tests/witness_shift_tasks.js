#!/usr/bin/env node
// witness_shift_tasks.js — §GANTT_GROUP_MOVE engine verb (2026-08-05). Proves ScheduleAuthor.
// shiftTasks translates ONLY the given task_id subset by a constant number of days, and — the
// property that actually matters for a marquee-selected group — every task NOT in the list stays
// byte-identical. Real fixture, real materialized schedule.
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
  if (!mres.ok) { console.log('§SKIP materializeZones failed: ' + JSON.stringify(mres)); return; }
  const schedId = mres.scheduleId;

  function readAll() {
    const r = db.exec('SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE schedule_id=?', [schedId]);
    const out = {};
    r[0].values.forEach(function (row) { out[row[0]] = { start: row[1], finish: row[2] }; });
    return out;
  }

  const before = readAll();
  const allIds = Object.keys(before);
  assert(allIds.length >= 4, 'RED-CONTROL: the real schedule has at least 4 tasks — a subset-vs-rest test needs both groups non-trivial');
  const selected = allIds.slice(0, Math.floor(allIds.length / 2));
  const untouched = allIds.slice(Math.floor(allIds.length / 2));
  assert(untouched.length > 0, 'RED-CONTROL: a real "untouched" group actually exists to check');

  const DELTA = 9;
  const res = ScheduleAuthor.shiftTasks(db, selected, DELTA);
  assert(res.ok, 'shiftTasks succeeds on a real subset');
  assert(res.moved.length === selected.length, 'moved count equals exactly the requested subset — moved=' + res.moved.length + ' requested=' + selected.length);

  const after = readAll();
  const selectedShifted = selected.every(function (id) {
    return day(after[id].start) - day(before[id].start) === DELTA && day(after[id].finish) - day(before[id].finish) === DELTA;
  });
  assert(selectedShifted, 'every SELECTED task moved by exactly +' + DELTA + 'd');

  const restUntouched = untouched.every(function (id) { return after[id].start === before[id].start && after[id].finish === before[id].finish; });
  assert(restUntouched, 'every NON-selected task is byte-identical before/after — the whole point of a scoped group move');

  // RED CONTROL: an id list containing a bogus, non-existent task_id must not blow up and must
  // still move the real ones — proves the verb is robust against a stale selection.
  const withBogus = selected.slice(0, 2).concat(['TASK_DOES_NOT_EXIST']);
  const res2 = ScheduleAuthor.shiftTasks(db, withBogus, 3);
  assert(res2.ok && res2.moved.length === 2, 'RED CONTROL: a bogus task_id in the selection is silently ignored, real ones still move — moved=' + (res2.moved || []).length);

  db.close();
  console.log('\n§SHIFT_TASKS SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
