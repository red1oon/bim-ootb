#!/usr/bin/env node
// WITNESS — W-S7-TASK-GRAIN — the #info-4d panel cannot be read as a per-element date.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-GRAIN / §S7-INJECT-WITNESS / §S7-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: §S7-GRAIN was CORRECTED by measurement 2026-09-13 — the first
// draft of this spec section claimed "this door is built 2027-04-12" is true of that door. It is
// not: `task_elements` maps a guid to a TASK, and the element inherits that task's WHOLE window,
// so the answer is only ever as fine as the task grid. On Hospital that grid is 41 windows spread
// over 63,415 elements — the biggest single task ("MEP Rough-in — Level 3") holds 9,545 of them.
// A panel that rendered the window WITHOUT the task's name would read as "this element is built on
// this day", which is false for all but a handful of elements in that task. This witness proves
// two independent things, neither of which is optional:
//   (1) the DATA is genuinely coarse — the number of DISTINCT (schedule_start,schedule_finish)
//       windows equals the TASK count, not the ELEMENT count, on a real persisted schedule; and
//   (2) the RENDERED #info-4d block (find_erp_push.js _show4DWindow, S7-DO item 2) always carries
//       the task's own NAME beside its window — never a bare date — for every member-bearing task,
//       checked against an INDEPENDENT direct-SQL read (never against the render function's own
//       query), so a future edit that dropped the name from the template would fail this witness.
//
// POPULATION: the REAL persisted schedule on Hospital_silent.db (41 leaf tasks, 63,415
// task_elements) — the exact numbers §S7-GRAIN cites. Not a fixture; measured live below.
//
// Command: node viewer/tests/witness_s7_task_grain.js
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
const DB_PATH = path.join(BLD_DIR, 'Hospital_silent.db');

// ── Minimal fake DOM ────────────────────────────────────────────────────────────────────────────
// find_erp_push.js only ever calls document.getElementById(id).{style.display,innerHTML} — a real
// jsdom would be overkill (and not a repo dependency) for exercising that surface headlessly. This
// is the SAME technique the module's own dual-mode export (`module.exports = API` alongside
// `window.FindErpPush = API`) was written to allow: run the real render code, no browser required.
function makeFakeDom() {
  const els = {};
  global.document = {
    getElementById: function (id) {
      if (!els[id]) els[id] = { style: { display: '' }, innerHTML: '' };
      return els[id];
    }
  };
  return els;
}

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
  const sched = ScheduleAuthor.activeSchedule(db);
  assert(!!(sched && sched.id), 'Hospital_silent.db has a real active schedule (id=' + (sched && sched.id) + ')');

  // ---- (1) the data is genuinely coarse — measured directly, independent of any reader code -----
  const taskCountRows = db.exec(
    "SELECT COUNT(*) FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)", [sched.id]);
  const taskCount = taskCountRows.length ? taskCountRows[0].values[0][0] : 0;

  const elementCountRows = db.exec(
    "SELECT COUNT(*) FROM task_elements te JOIN tasks t ON t.task_id=te.task_id WHERE t.schedule_id=?", [sched.id]);
  const elementCount = elementCountRows.length ? elementCountRows[0].values[0][0] : 0;

  const distinctWindowRows = db.exec(
    "SELECT COUNT(DISTINCT schedule_start || '|' || schedule_finish) FROM tasks " +
    "WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)", [sched.id]);
  const distinctWindows = distinctWindowRows.length ? distinctWindowRows[0].values[0][0] : 0;

  console.log('  measured: tasks=' + taskCount + ' distinctWindows=' + distinctWindows + ' task_elements=' + elementCount);
  assert(taskCount === 41, 'Hospital_silent.db carries 41 leaf tasks (the exact §S7-GRAIN measurement)');
  assert(elementCount === 63415, 'Hospital_silent.db carries 63,415 task_elements (the exact §S7-GRAIN measurement)');
  assert(distinctWindows === taskCount,
    'distinct (schedule_start,schedule_finish) windows (' + distinctWindows + ') == task count (' + taskCount +
    '), not element count (' + elementCount + ') — the panel cannot be finer than the task grid');
  assert(distinctWindows < elementCount,
    'windows (' + distinctWindows + ') << elements (' + elementCount + ') — real coarseness, not a coincidence of scale');

  const biggest = db.exec(
    "SELECT t.task_id, t.name, COUNT(*) c FROM task_elements te JOIN tasks t ON t.task_id=te.task_id " +
    "WHERE t.schedule_id=? GROUP BY t.task_id ORDER BY c DESC LIMIT 1", [sched.id]);
  const [bigTaskId, bigTaskName, bigCount] = biggest.length ? biggest[0].values[0] : [null, null, 0];
  console.log('  biggest task: "' + bigTaskName + '" (' + bigTaskId + ') members=' + bigCount);
  assert(bigTaskName === 'MEP Rough-in — Level 3' && bigCount === 9545,
    'biggest task is "MEP Rough-in — Level 3" with 9,545 members (the exact §S7-GRAIN marquee example)');

  // ---- (2) the RENDERED #info-4d block always carries the task NAME beside its window -----------
  // Every task that has at least one member element, one deterministic representative guid each
  // (MIN(guid) — same convention as W-S7-WINDOW, no randomness).
  const taskRows = db.exec(
    "SELECT DISTINCT te.task_id FROM task_elements te JOIN tasks t ON t.task_id=te.task_id " +
    "WHERE t.schedule_id=? ORDER BY te.task_id", [sched.id]);
  const taskIds = taskRows.length ? taskRows[0].values.map(r => r[0]) : [];
  assert(taskIds.length > 0, 'at least one member-bearing task to check (' + taskIds.length + ')');

  const els = makeFakeDom();
  global.ScheduleRead4D = ScheduleRead4D;
  global.ScheduleAuthor = ScheduleAuthor;
  const FindErpPush = require('../find_erp_push.js');
  const A = { db: db, activeBuilding: 'Hospital', cachedFetch: function () { return Promise.resolve(null); } };
  const mod = FindErpPush.create({ A: A, getLastSelSet: function () { return null; }, getLastSelLabel: function () { return ''; }, selectionPriced: function () { return null; }, cur: function () { return 'RM'; } });
  assert(typeof mod.show4DWindow === 'function', 'find_erp_push.js exports show4DWindow(guid) — the S7-DO item 2 render function');

  let checked = 0, everyRowHasName = true, everyRowHasWindow = true, noBareDate = true;
  const DATE_ONLY_RE = /^\s*\d{4}-\d{2}-\d{2}\s*$/;
  taskIds.forEach(taskId => {
    const gr = db.exec('SELECT MIN(guid) FROM task_elements WHERE task_id=?', [taskId]);
    const guid = gr.length && gr[0].values.length ? gr[0].values[0][0] : null;
    if (!guid) return;
    // Independent direct-SQL ground truth for this task's name/window — NOT via show4DWindow's own query.
    const dr = db.exec('SELECT name, schedule_start, schedule_finish FROM tasks WHERE task_id=?', [taskId]);
    const d = dr.length && dr[0].values.length ? dr[0].values[0] : null;
    if (!d || !d[1] || !d[2]) return;   // undated task with members — schedule_read_4d.js's own documented miss, skip (covered by W-S7-WINDOW)
    checked++;
    els['info-4d'] = { style: { display: '' }, innerHTML: '' };   // fresh element each call, like a real re-render
    mod.show4DWindow(guid);
    const html = els['info-4d'].innerHTML;
    const expectedName = d[0];
    const hasName = html.indexOf(expectedName) !== -1;
    const hasStart = html.indexOf(String(d[1]).slice(0, 10)) !== -1;
    const hasFinish = html.indexOf(String(d[2]).slice(0, 10)) !== -1;
    if (!hasName) { everyRowHasName = false; console.log('    MISSING NAME task=' + taskId + ' expected="' + expectedName + '"'); }
    if (!hasStart || !hasFinish) { everyRowHasWindow = false; console.log('    MISSING WINDOW task=' + taskId); }
    // The block must be MORE than a bare date sitting alone — a line consisting of ONLY a date with
    // no other text on it would be exactly the misreading §S7-GRAIN was corrected to prevent. Since
    // the task name is asserted present above, this checks no row is emitted as a standalone date.
    const rowsText = html.replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    if (rowsText.some(r => DATE_ONLY_RE.test(r))) { noBareDate = false; console.log('    BARE DATE ROW task=' + taskId + ' html=' + html); }
  });
  assert(checked === taskIds.length && checked > 0, 'checked all ' + checked + ' member-bearing dated tasks');
  assert(everyRowHasName, 'EVERY rendered #info-4d block includes the task\'s own name (verified against independent SQL, not show4DWindow\'s own query)');
  assert(everyRowHasWindow, 'EVERY rendered #info-4d block includes both start and finish dates');
  assert(noBareDate, 'no rendered row is a bare stand-alone date — the task name always accompanies it');

  db.close();
  console.log('§WITNESS_S7_TASK_GRAIN pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — the persisted schedule is genuinely task-grain (41 windows / 63,415 elements, biggest task 9,545 members) AND #info-4d always names the task beside its window — never a bare date that would misread as a per-element build day');
})();
