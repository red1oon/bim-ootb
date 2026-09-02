// schedule_move_witness.js — W-SCHED-MOVE (FUSED_4D5D_WEDGE_LANE §SE-3)
//
// ISSUE PROVED: moveTask (the drag-to-reschedule verb) shifts a LEAF task to a new start, PRESERVING
// its duration, writing schedule_start/finish — and refuses summary/unknown tasks. On real SampleHouse.
// Whitebox §-log only. The drag gesture itself is proven by §SE-GANTT-SMOKE (headless); this proves the
// engine maths a drag invokes.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.resolve(__dirname, '..', '..', 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-SCHED-MOVE PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-SCHED-MOVE FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var s = txt.indexOf('var SEQUENCE_RULES = {'), di = txt.indexOf('var SEQUENCE_DEFAULT');
  var slice = txt.slice(s, txt.indexOf('};', di) + 2);
  // eslint-disable-next-line no-new-func
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var rules = loadRules();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));
  ScheduleAuthor.materializeDefault(db, rules.SEQUENCE_RULES, { start: '2026-01-01', phaseDays: 30 });

  // pick the first leaf
  var leaves = [];
  (function flat(ns) { ns.forEach(function (n) { if (!n.isSummary) leaves.push(n); flat(n.children || []); }); })(ScheduleAuthor.wbsTree(db, 'SCH_AUTHORED'));
  check('have-leaves', leaves.length >= 1, 'leaves=' + leaves.length);
  var t = leaves[0];
  var before = db.exec("SELECT schedule_start, schedule_finish FROM tasks WHERE task_id='" + t.id + "'")[0].values[0];
  var oldStart = before[0], oldFinish = before[1];
  var oldDur = daysBetween(oldStart, oldFinish);

  // ── move +7 days ─────────────────────────────────────────────────────────────
  var newStart = '2026-01-08';   // oldStart is 2026-01-01 → +7
  var res = ScheduleAuthor.moveTask(db, t.id, newStart);
  check('move-ok', res.ok === true, 'start=' + res.start + ' finish=' + res.finish);
  check('move-start-shifted', res.start === newStart && daysBetween(oldStart, res.start) === 7,
    'oldStart=' + oldStart + ' newStart=' + res.start);
  check('move-duration-preserved', daysBetween(res.start, res.finish) === oldDur,
    'newDur=' + daysBetween(res.start, res.finish) + ' oldDur=' + oldDur);
  // persisted?
  var after = db.exec("SELECT schedule_start, schedule_finish FROM tasks WHERE task_id='" + t.id + "'")[0].values[0];
  check('move-persisted', after[0] === newStart && after[1] === res.finish,
    'db start=' + after[0] + ' finish=' + after[1]);

  // ── refusals ─────────────────────────────────────────────────────────────────
  check('refuse-summary', ScheduleAuthor.moveTask(db, 'TASK_ROOT', '2026-02-01').reason === 'is_summary');
  check('refuse-unknown', ScheduleAuthor.moveTask(db, 'TASK_NOPE', '2026-02-01').reason === 'no_such_task');

  console.log('§W-SCHED-MOVE RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-SCHED-MOVE ERROR', e); process.exit(2); });
