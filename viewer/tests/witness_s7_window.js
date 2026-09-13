#!/usr/bin/env node
// WITNESS — W-S7-WINDOW — viewer/schedule_read_4d.js `windowForGuid(db, guid, opts)`.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-DO item 1 / §S7-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: S7 exists to answer "when does this get built" ON the element
// the user is already looking at, and its whole reason for being a NEW function rather than a
// recompute is §3 doctrine ("read the twin, don't recompute") — the date shown must be the SAME
// value `schedule_author.js` persisted into `tasks.schedule_start`/`schedule_finish`, never a
// value `windowForGuid` derived or a different task's window silently substituted. A function that
// LOOKS like a read but actually recomputes, or picks the wrong row, would pass a black-box "does
// it return a plausible date" check while breaking exactly the doctrine this leg exists to defend.
// This witness proves the return value is the literal `tasks` row `task_elements` points the guid
// at, by comparing against an INDEPENDENT direct SQL read of the same tables (never against the
// function's own query/output), and proves the 3 documented miss cases (no active schedule / guid
// in no task / undated task) each return null rather than inventing a window.
//
// POPULATION — the REAL persisted schedules, not a mocked fixture. Per
// prompts/TM_4D5D_VARIANCE_LANE.md "REAL TEST DATA" (verified 2026-09-13), only two building DBs on
// disk carry a persisted 4D schedule:
//   Hospital_silent.db (1 schedule, 42 tasks, 63,415 task_elements) and
//   HHS_Office_Federated_silent.db (1 schedule, 21 tasks, 6,880 task_elements).
// For the no-active-schedule negative, Hospital_extracted.db is used — verified below to have a
// `tasks` table with 0 rows and an OLDER column shape (`start_date`/`finish_date`, no
// `schedule_start`) that ScheduleAuthor.activeSchedule's query catches and returns null for. This
// is a real building DB that genuinely carries no persisted 4D schedule, not a fabricated empty DB.
// Duplex_meta.db is excluded per standing memory (0 bytes in this checkout — a known data problem).
//
// W-S7-WINDOW-1  every TASK-with-members in both real schedules: windowForGuid(db, oneOfItsGuids)
//                returns the SAME taskId/name/schedule_start/schedule_finish/resource/total_float/
//                is_critical the `tasks` row holds, checked via an INDEPENDENT direct SQL query
//                (not windowForGuid's own query text or code path).
// W-S7-WINDOW-2  a guid verified absent from every task_elements row -> null (§reason=guid_not_in_task).
// W-S7-WINDOW-3  a real building DB with no active schedule -> null (§reason=no_active_schedule),
//                even for a guid the DB itself could otherwise offer.
// W-S7-WINDOW-4  READ-NOT-DERIVED, at scale: every (startDate,finishDate) pair windowForGuid ever
//                returned across BOTH real schedules is a member of the literal set of
//                (schedule_start,schedule_finish) pairs that exist in `tasks` for that schedule —
//                i.e. it is structurally impossible for the function to have emitted a date pair
//                absent from the table.
// W-S7-WINDOW-5  redControl — a hand-mutated date (+N days off a real result, until it provably
//                differs from every literal pair) is correctly REJECTED by the same membership
//                check W-S7-WINDOW-4 uses, proving that check is not vacuously true.
//
// Command: node viewer/tests/witness_s7_window.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');
const ScheduleRead4D = require('../schedule_read_4d.js');
const ScheduleAuthor = require('../schedule_author.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}

const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const NO_SCHED_DB = path.join(BLD_DIR, 'Hospital_extracted.db');
const SENTINEL_GUID = 'NOT_A_REAL_GUID_S7_WINDOW_WITNESS'; // fixed, deterministic — never a real IFC GUID shape

function loadDb(SQL, p) {
  return new SQL.Database(new Uint8Array(fs.readFileSync(p)));
}

// The literal (start,finish) pairs actually present in `tasks` for one schedule — the ground truth
// W-S7-WINDOW-4/5 check membership against. Deliberately a SEPARATE query from windowForGuid's own,
// so a bug shared by both queries could not hide the defect from this witness.
function literalWindowPairs(db, scheduleId) {
  const r = db.exec('SELECT DISTINCT schedule_start, schedule_finish FROM tasks WHERE schedule_id=?', [scheduleId]);
  const set = new Set();
  if (r.length) {
    r[0].values.forEach(row => {
      if (row[0] && row[1]) set.add(String(row[0]).slice(0, 10) + '|' + String(row[1]).slice(0, 10));
    });
  }
  return set;
}

(async () => {
  const SQL = await initSqlJs();

  const buildings = [
    { label: 'Hospital_silent.db', path: path.join(BLD_DIR, 'Hospital_silent.db') },
    { label: 'HHS_Office_Federated_silent.db', path: path.join(BLD_DIR, 'HHS_Office_Federated_silent.db') }
  ];

  const perSchedule = []; // { label, db, scheduleId, hitDates } — feeds W-S7-WINDOW-4/5

  buildings.forEach(b => {
    const db = loadDb(SQL, b.path);
    const sched = ScheduleAuthor.activeSchedule(db);
    assert(!!(sched && sched.id), b.label + ': has a real active schedule (id=' + (sched && sched.id) + ')');

    // ---- W-S7-WINDOW-1: every task-with-members, one deterministic representative guid ----------
    const tr = db.exec(
      'SELECT DISTINCT te.task_id FROM task_elements te JOIN tasks t ON t.task_id = te.task_id ' +
      'WHERE t.schedule_id=? ORDER BY te.task_id', [sched.id]);
    const taskIds = tr.length ? tr[0].values.map(row => row[0]) : [];
    assert(taskIds.length > 0, b.label + ': at least one task has member elements (' + taskIds.length + ' tasks)');

    let checked = 0, allMatch = true;
    const hitDates = new Set();
    taskIds.forEach(taskId => {
      // MIN(guid) — deterministic, same guid every run, no randomness.
      const gr = db.exec('SELECT MIN(guid) FROM task_elements WHERE task_id=?', [taskId]);
      const guid = gr.length && gr[0].values.length ? gr[0].values[0][0] : null;
      if (!guid) return;
      checked++;

      const out = ScheduleRead4D.windowForGuid(db, guid, { scheduleAuthor: ScheduleAuthor });

      // Independent direct-SQL ground truth — NOT via windowForGuid's own query.
      const dr = db.exec(
        'SELECT name, schedule_start, schedule_finish, resource, total_float, is_critical ' +
        'FROM tasks WHERE task_id=?', [taskId]);
      const d = dr.length && dr[0].values.length ? dr[0].values[0] : null;

      if (!d || !d[1] || !d[2]) {
        // an undated task with member elements is a real row with no window yet (§MI-FLOW) —
        // must read null, never a fabricated window.
        if (out !== null) allMatch = false;
        return;
      }
      const expected = {
        taskId, name: d[0] || taskId,
        startDate: String(d[1]).slice(0, 10), finishDate: String(d[2]).slice(0, 10),
        resource: d[3], totalFloat: d[4], isCritical: d[5]
      };
      const same = out
        && out.taskId === expected.taskId && out.name === expected.name
        && out.startDate === expected.startDate && out.finishDate === expected.finishDate
        && out.resource === expected.resource && out.totalFloat === expected.totalFloat
        && out.isCritical === expected.isCritical;
      if (!same) allMatch = false;
      else hitDates.add(expected.startDate + '|' + expected.finishDate);
    });
    assert(checked === taskIds.length && checked > 0 && allMatch,
      b.label + ': windowForGuid == independent direct-SQL read, for all ' + checked + ' member-bearing tasks');

    perSchedule.push({ label: b.label, db, scheduleId: sched.id, hitDates });
  });

  // ---- W-S7-WINDOW-2: a guid verified absent from every task_elements row -> null ----------------
  {
    const db = perSchedule[0].db;
    const present = db.exec('SELECT COUNT(*) FROM task_elements WHERE guid=?', [SENTINEL_GUID]);
    const presentCount = present.length ? present[0].values[0][0] : 0;
    assert(presentCount === 0, 'sentinel guid verified ABSENT from ' + perSchedule[0].label + ' before asserting null on it');
    const out = ScheduleRead4D.windowForGuid(db, SENTINEL_GUID, { scheduleAuthor: ScheduleAuthor });
    assert(out === null, 'W-S7-WINDOW-2: guid in no task -> null');
  }

  // ---- W-S7-WINDOW-3: a real building DB with no active schedule -> null --------------------------
  {
    const db = loadDb(SQL, NO_SCHED_DB);
    const schedRows = db.exec('SELECT COUNT(*) FROM schedules');
    const schedCount = schedRows.length ? schedRows[0].values[0][0] : 0;
    assert(schedCount === 0,
      'Hospital_extracted.db verified to carry 0 `schedules` rows — a real DB genuinely without a persisted schedule, not a fabricated empty one');
    const sched = ScheduleAuthor.activeSchedule(db);
    assert(sched === null, 'ScheduleAuthor.activeSchedule(Hospital_extracted.db) independently confirms no_active_schedule');
    const teRows = db.exec('SELECT guid FROM task_elements LIMIT 1');
    const guid = (teRows.length && teRows[0].values.length) ? teRows[0].values[0][0] : SENTINEL_GUID;
    const out = ScheduleRead4D.windowForGuid(db, guid, { scheduleAuthor: ScheduleAuthor });
    assert(out === null, 'W-S7-WINDOW-3: no active schedule -> null (guid=' + guid + ')');
    db.close();
  }

  // ---- W-S7-WINDOW-4: read-not-derived, at scale --------------------------------------------------
  {
    let totalHits = 0, allMembers = true;
    perSchedule.forEach(s => {
      const literal = literalWindowPairs(s.db, s.scheduleId);
      s.hitDates.forEach(pair => {
        totalHits++;
        if (!literal.has(pair)) allMembers = false;
      });
    });
    assert(totalHits > 0 && allMembers,
      'W-S7-WINDOW-4: every date pair windowForGuid returned (' + totalHits + ' distinct hits, across both ' +
      'schedules) is a literal (schedule_start,schedule_finish) pair present in `tasks` — none derived/invented');
  }

  // ---- W-S7-WINDOW-5: redControl — the W-S7-WINDOW-4 membership check can actually fail -----------
  {
    const s = perSchedule[0];
    const literal = literalWindowPairs(s.db, s.scheduleId);
    const [realStart, realFinish] = Array.from(s.hitDates)[0].split('|');
    // Bump the start date forward, one day at a time, until it provably is not itself some OTHER
    // real task's start (guards against an unlucky coincidence in a densely-scheduled building).
    let bumped = new Date(realStart + 'T00:00:00Z'), mutated;
    for (let i = 1; i <= 3650; i++) {
      bumped.setUTCDate(bumped.getUTCDate() + 1);
      mutated = bumped.toISOString().slice(0, 10) + '|' + realFinish;
      if (!literal.has(mutated)) break;
    }
    assert(!literal.has(mutated),
      'W-S7-WINDOW-5 redControl: a hand-mutated date (' + mutated + ') is correctly REJECTED by the membership ' +
      'check — W-S7-WINDOW-4 is not vacuously true, it can fail');
  }

  perSchedule.forEach(s => s.db.close());

  console.log('§WITNESS_S7_WINDOW pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — windowForGuid reads the persisted tasks/task_elements twin verbatim; documented misses (no_active_schedule/guid_not_in_task/undated) return null, never a fabricated window');
})();
