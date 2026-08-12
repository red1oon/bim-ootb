// witness_gantt_bar_identity.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT K0.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   The Time Machine Gantt drawer built its bars by grouping raw kernel_ops on `storey|phase`,
//   producing bar objects carrying NO task_id. That is why no bar was ever draggable —
//   moveTask(db, taskId, ...) had nothing to be handed. K0 re-keys the rollup on the REAL task
//   identity, joined by GUID through task_elements.
//
//   This witness fails if that join does not actually resolve: if elements the viewer will emit
//   ELEMENT_PLACE ops for have no task_elements row, they produce bars with taskId=null which stay
//   permanently non-editable. Coverage is therefore the load-bearing number, not a formality.
//
// WHY THE JOIN IS BY GUID AND NOT BY NAME (regression this locks down):
//   deriveZones keys a zone on collapsePhase(e.storey); the drawer reads the RAW p.storey off the op
//   parameters. Those two strings legitimately differ, so a storey/phase string match would silently
//   mis-associate bars with tasks. G-ID-5 below measures that divergence directly — if it is ever 0
//   the name-match would have been safe, and this witness says so rather than assuming.
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, 'viewer');
var DB_PATH = process.argv[2] || '/home/red1/bim-compiler/deploy/dev/buildings/Terminal_extracted.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-BARID PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-BARID FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  var rules = loadRules();
  var db = new SQL.Database(fs.readFileSync(DB_PATH));
  console.log('§W-BARID db=' + path.basename(DB_PATH));

  var opts = { start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate };
  var res = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES, opts);
  check('G-ID-0 materializeZones-ok', res.ok === true, JSON.stringify(res.reason || res.zoneCount));
  if (!res.ok) { console.log('§W-BARID RESULT pass=' + pass + ' fail=' + fail); process.exit(1); }

  // The element set the viewer will emit ELEMENT_PLACE ops for — the same builder the author path uses.
  var elements = ScheduleAuthor._buildScheduleElements(db, rules.SEQUENCE_RULES, opts);
  check('G-ID-1 elements-present', elements.length > 0, 'elements=' + elements.length);

  // ---- Rebuild the viewer's identity index with the SAME SQL time_machine.js buildTaskIndex() uses.
  var guidTask = {}, tasks = {};
  var tr = db.exec("SELECT task_id, name FROM tasks WHERE schedule_id='SCH_AUTHORED' " +
    'AND (is_summary IS NULL OR is_summary=0)');
  if (tr.length) tr[0].values.forEach(function (r) { tasks[r[0]] = r[1]; });
  var er = db.exec("SELECT te.guid, te.task_id FROM task_elements te " +
    "JOIN tasks t ON t.task_id = te.task_id WHERE t.schedule_id='SCH_AUTHORED'");
  if (er.length) er[0].values.forEach(function (r) { guidTask[r[0]] = r[1]; });

  var taskCount = Object.keys(tasks).length;
  check('G-ID-2 tasks-indexed', taskCount === res.zoneCount, 'indexed=' + taskCount + ' zones=' + res.zoneCount);

  // ---- THE LOAD-BEARING CHECK: every element that will produce an op resolves to a real task.
  var resolved = 0, unresolved = 0, missByCls = {};
  elements.forEach(function (e) {
    if (guidTask[e.guid]) resolved++;
    else { unresolved++; missByCls[e.cls] = (missByCls[e.cls] || 0) + 1; }
  });
  var pct = Math.round(resolved / elements.length * 1000) / 10;
  console.log('§W-BARID coverage resolved=' + resolved + '/' + elements.length + ' (' + pct + '%)' +
    (unresolved ? ' unresolvedByClass=' + JSON.stringify(missByCls) : ''));
  check('G-ID-3 every-element-resolves-to-a-task', unresolved === 0,
    'unresolved=' + unresolved + ' → that many bars would stay non-editable');

  // ---- Referential integrity: no task_elements row pointing at a task that does not exist.
  var orphan = 0;
  for (var g in guidTask) if (!tasks[guidTask[g]]) orphan++;
  check('G-ID-4 no-orphan-task-refs', orphan === 0, 'orphans=' + orphan);

  // ---- G-ID-5: does the OLD storey|phase key actually differ from real task identity?
  // Groups the same guids the way drawGanttMini used to (raw storey + phase off the element), then
  // counts keys that span more than one real task. >0 proves the old key genuinely mis-associated
  // bars and that K0's guid join is not a cosmetic rename.
  var keyToTasks = {};
  elements.forEach(function (e) {
    var tid = guidTask[e.guid]; if (!tid) return;
    var key = (e.storey || '_UNKNOWN') + '|' + (e.phase || 'Architecture');
    (keyToTasks[key] = keyToTasks[key] || {})[tid] = 1;
  });
  var ambiguous = 0, keys = 0;
  for (var k in keyToTasks) { keys++; if (Object.keys(keyToTasks[k]).length > 1) ambiguous++; }
  var taskToKeys = {};
  elements.forEach(function (e) {
    var tid = guidTask[e.guid]; if (!tid) return;
    var key = (e.storey || '_UNKNOWN') + '|' + (e.phase || 'Architecture');
    (taskToKeys[tid] = taskToKeys[tid] || {})[key] = 1;
  });
  var split = 0;
  for (var t in taskToKeys) if (Object.keys(taskToKeys[t]).length > 1) split++;
  // MEASUREMENT, not an assertion — these two numbers quantify what the OLD key got wrong on this
  // building. Reported, never asserted: a building where the old key happened to be 1:1 is a real
  // and acceptable outcome, not a failure. MEASURED 2026-08-04: Terminal/Duplex/Clinic/JKR/
  // LTU_AHouse/HHS all 1:1, but HOSPITAL drew 60 bars for 35 real tasks — 19 tasks each split
  // across several rows, because collapsePhase() merges storey aliases the raw p.storey key does not.
  console.log('§W-BARID oldKeyGroups=' + keys + ' realTasks=' + taskCount +
    ' ambiguousOldKeys=' + ambiguous + ' tasksSplitAcrossOldKeys=' + split +
    (split ? '  ← the old drawer drew ' + keys + ' bars for ' + taskCount + ' real tasks' : ''));

  // ---- G-ID-5 (real assertion): under the guid join, the drawer's bar count must equal the model's
  // task count exactly. Fails if a zone task carries no elements (an unclickable phantom bar) or if
  // the join drops a task entirely.
  var barKeys = {};
  elements.forEach(function (e) { var tid = guidTask[e.guid]; if (tid) barKeys['T:' + tid] = 1; });
  var barCount = Object.keys(barKeys).length;
  check('G-ID-5 bars-equal-model-tasks', barCount === taskCount,
    'bars=' + barCount + ' tasks=' + taskCount + ' (old key would have drawn ' + keys + ')');

  console.log('§W-BARID RESULT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
