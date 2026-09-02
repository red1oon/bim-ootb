// author_blank_start_witness.js — W-AUTHOR-BLANK-START (FUSED_4D5D_WEDGE_LANE §MI-FLOW)
//
// ISSUE PROVED: a "true blank start" organizes the phases (WBS) + assignments but leaves them
// UNDATED, so the schedule does NOT appear in the Time Machine until the USER originates the dates
// (the auto-schedule becomes an optional "suggest a start"). The shipped read-path (_cap, extracted
// VERBATIM from time_machine.js) SKIPS NULL-dated leaf tasks → nothing shows; after
// scheduleContiguous the same _cap picks them up. Real SampleHouse. Whitebox §-log only.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var ROOT = path.resolve(__dirname, '..', '..');
var VIEWER = path.join(ROOT, 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var SA = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-BLANK PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-BLANK FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }

function loadRules() {
  var t = read('rates.js');
  var s = t.indexOf('var SEQUENCE_RULES = {');
  var d = t.indexOf('var SEQUENCE_DEFAULT');
  var slice = t.slice(s, t.indexOf('};', d) + 2);
  // eslint-disable-next-line no-new-func
  return (new Function(slice + '\n return SEQUENCE_RULES;'))();
}
function loadCap() {
  var t = read('time_machine.js');
  var s = t.indexOf('var _cap = (function() {');
  var e = t.indexOf('})();', s) + '})();'.length;
  // eslint-disable-next-line no-new-func
  return new Function('db', t.slice(s, e) + '\n return _cap;');
}

(async function () {
  var RULES = loadRules();
  var makeCap = loadCap();
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));
  var nElems = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];

  // ── BLANK start: organize phases + assignments, but UNDATED ───────────────────
  var res = SA.materializeDefault(db, RULES, { start: '2026-01-01', phaseDays: 30, blank: true });
  check('blank-flag', res.blank === true, 'blank=' + res.blank);
  check('phases-organized', res.phases.length >= 2, 'phases=' + res.phases.length);
  check('elements-assigned', res.assignmentCount === nElems, 'assignments=' + res.assignmentCount + '/' + nElems);

  // leaf tasks exist but are UNDATED
  var leaves = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0")[0].values[0][0];
  var dated = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0 AND schedule_start IS NOT NULL")[0].values[0][0];
  check('leaves-exist', leaves === res.phases.length, 'leaves=' + leaves);
  check('leaves-undated', dated === 0, 'datedLeaves=' + dated);

  // the shipped read-path sees NOTHING (no dated leaf → _cap null) — the TM stays blank.
  var cap0 = makeCap(db);
  check('cap-blank-invisible', cap0 === null, 'cap=' + (cap0 ? 'captured' : 'null'));

  // ── The user ORIGINATES the dates (the deliberate "suggest a start") ──────────
  var sc = SA.scheduleContiguous(db, 'SCH_AUTHORED', { start: '2026-03-01', phaseDays: 20 });
  check('scheduled-all', sc.scheduled === res.phases.length, 'scheduled=' + sc.scheduled);
  var dated2 = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0 AND schedule_start IS NOT NULL")[0].values[0][0];
  check('now-all-dated', dated2 === res.phases.length, 'datedLeaves=' + dated2);

  // now the SAME shipped read-path PICKS THEM UP — the schedule appears in the TM, bound by guid.
  var cap1 = makeCap(db);
  check('cap-now-visible', cap1 !== null && cap1.taskCount === res.phases.length,
    'cap.taskCount=' + (cap1 && cap1.taskCount));
  check('cap-maps-every-guid', cap1 && Object.keys(cap1.guidTask).length === nElems,
    'guidTask=' + (cap1 && Object.keys(cap1.guidTask).length) + '/' + nElems);
  // first phase starts where the USER said (origination honored)
  var firstStart = db.exec("SELECT MIN(schedule_start) FROM tasks WHERE schedule_id='SCH_AUTHORED' AND is_summary=0")[0].values[0][0];
  check('origin-honored', String(firstStart).slice(0, 10) === '2026-03-01', 'firstStart=' + firstStart);

  console.log('§W-AUTHOR-BLANK-START RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-BLANK ERROR', e); process.exit(2); });
