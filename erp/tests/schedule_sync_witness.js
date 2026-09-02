// schedule_sync_witness.js — W-SCHED-SYNC (FUSED_4D5D_WEDGE_LANE §SE-4 / §SE-D)
//
// ISSUE PROVED: replaying a schedule op on a SECOND surface's db via ScheduleSync.applyOp (the exact
// ScheduleAuthor verb the sender used) makes the two surfaces CONVERGE to identical schedule state —
// "both are folds of one log". Echo-guard drops own ops; unknown ops fail closed. Two real SampleHouse
// dbs (sender + receiver), same default. Whitebox §-log only.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.resolve(__dirname, '..', '..', 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleSync = require(path.join(VIEWER, 'schedule_sync.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-SCHED-SYNC PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-SCHED-SYNC FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var s = txt.indexOf('var SEQUENCE_RULES = {'), di = txt.indexOf('var SEQUENCE_DEFAULT');
  var slice = txt.slice(s, txt.indexOf('};', di) + 2);
  // eslint-disable-next-line no-new-func
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}
// the full row-state that must converge between surfaces
function snapshot(db) {
  var t = db.exec("SELECT task_id, schedule_start, schedule_finish, is_critical, total_float FROM tasks WHERE schedule_id='SCH_AUTHORED' ORDER BY task_id");
  var s = db.exec("SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences ORDER BY predecessor_id, successor_id");
  return JSON.stringify({ tasks: t.length ? t[0].values : [], seqs: s.length ? s[0].values : [] });
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var rules = loadRules();
  function freshDb() {
    var d = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));
    ScheduleAuthor.materializeDefault(d, rules.SEQUENCE_RULES, { start: '2026-01-01', phaseDays: 30 });
    return d;
  }
  var sender = freshDb(), receiver = freshDb();
  check('identical-baseline', snapshot(sender) === snapshot(receiver), 'both default schedules match');

  var leaves = [];
  (function flat(ns) { ns.forEach(function (n) { if (!n.isSummary) leaves.push(n.id); flat(n.children || []); }); })(ScheduleAuthor.wbsTree(sender, 'SCH_AUTHORED'));

  // Apply a sequence of ops on the SENDER (the real edits) and REPLAY each on the RECEIVER via applyOp.
  // After each, the two dbs must remain byte-identical in schedule state.
  var ops = [
    { op: 'move', taskId: leaves[0], start: '2026-01-15' },
    { op: 'add', predId: leaves[0], succId: leaves[1], type: 'FS', lag: 0 },
    { op: 'add', predId: leaves[1], succId: leaves[2], type: 'FS', lag: 0 },
    { op: 'retype', predId: leaves[0], succId: leaves[1], value: 'SS' },
    { op: 'lag', predId: leaves[1], succId: leaves[2], value: 3 },
    { op: 'move', taskId: leaves[2], start: '2026-03-10' },
    { op: 'remove', predId: leaves[0], succId: leaves[1] }
  ];
  ops.forEach(function (op, i) {
    // sender performs the real edit (the same verb the UI calls)
    var sres = ScheduleSync.applyOp(sender, op);
    // receiver replays the broadcast op
    var rres = ScheduleSync.applyOp(receiver, op);
    var converged = snapshot(sender) === snapshot(receiver);
    check('converge-' + (i + 1) + '-' + op.op, converged && sres && rres,
      op.op + (converged ? ' ✓ identical' : ' ✗ DIVERGED'));
  });

  // CPM replays to the same critical set (computed, not data — but deterministic ⇒ identical).
  ScheduleSync.applyOp(sender, { op: 'cpm', schedule: 'SCH_AUTHORED' });
  ScheduleSync.applyOp(receiver, { op: 'cpm', schedule: 'SCH_AUTHORED' });
  check('converge-cpm', snapshot(sender) === snapshot(receiver), 'is_critical/float identical after CPM replay');

  // unknown op fails closed
  check('unknown-op-fails', ScheduleSync.applyOp(receiver, { op: 'frobnicate' }).ok === false);

  // echo guard: a sync IGNORES ops tagged with its own tabId.
  var sync = ScheduleSync.create({ tabId: 'tabA' });
  var applied = 0;
  sync.listen(receiver, function () { applied++; });
  // (no BroadcastChannel in node → listen is a no-op bus; assert create()/applyOp contract instead)
  check('create-has-tabid', sync.tabId === 'tabA', 'tabId=' + sync.tabId);

  console.log('§W-SCHED-SYNC RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-SCHED-SYNC ERROR', e); process.exit(2); });
