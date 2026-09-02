// author_4d_witness.js — W-AUTHOR-4D-BLANK (FUSED_4D5D_WEDGE_LANE §AUTHOR-1)
//
// ISSUE PROVED: a user can start from a real model with ZERO 4D metadata, materialize an
// ORGANIZED default schedule (phases = WBS leaves, every element assigned), and CRAFT it by
// reassigning an element to a different phase — and the SHIPPED read-path (injectGantt's `_cap`
// overlay) picks up the authored tasks + honours the reassignment, bound by guid (the P2 link).
//
// Non-invent: real SampleHouse_extracted.db (60 elements, tasks=0 = genuinely blank 4D); the
// `_cap` consumer is EXTRACTED VERBATIM from viewer/time_machine.js (not re-typed); the phase
// rules are EXTRACTED VERBATIM from viewer/rates.js. Whitebox §-log proof only.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');

var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var ROOT = path.resolve(__dirname, '..', '..');           // worktree root
var VIEWER = path.join(ROOT, 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-AUTHOR PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-AUTHOR FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// Extract `var SEQUENCE_RULES = {...}; ... var SEQUENCE_DEFAULT = {...};` verbatim from rates.js.
function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var start = txt.indexOf('var SEQUENCE_RULES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  // eslint-disable-next-line no-new-func
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}

// Extract the REAL `_cap` IIFE verbatim from time_machine.js → a callable function of `db`.
function loadCapConsumer() {
  var txt = fs.readFileSync(path.join(VIEWER, 'time_machine.js'), 'utf8');
  var start = txt.indexOf('var _cap = (function() {');
  if (start < 0) throw new Error('could not find _cap in time_machine.js');
  var end = txt.indexOf('})();', start) + '})();'.length;
  var slice = txt.slice(start, end);
  console.log('§W-AUTHOR CAP-SLICE bytes=' + slice.length + ' (verbatim from time_machine.js)');
  // eslint-disable-next-line no-new-func
  return new Function('db', slice + '\n return _cap;');
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var rulesPack = loadRules();
  var RULES = rulesPack.SEQUENCE_RULES, DEFAULT = rulesPack.SEQUENCE_DEFAULT;
  console.log('§W-AUTHOR RULES-LOADED keys=' + Object.keys(RULES).length + ' default=' + DEFAULT.phase);
  var makeCap = loadCapConsumer();

  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));

  // ── 1. Blank-4D precondition (real model, no schedule) ───────────────────────
  var nElems = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];
  var nTasks0 = db.exec("SELECT COUNT(*) FROM tasks")[0].values[0][0];
  var nTE0 = db.exec("SELECT COUNT(*) FROM task_elements")[0].values[0][0];
  check('blank-tasks', nTasks0 === 0, 'tasks=' + nTasks0);
  check('blank-task_elements', nTE0 === 0, 'task_elements=' + nTE0);
  check('model-has-elements', nElems > 0, 'elements=' + nElems);

  // ── 2. Materialize the organized default schedule ────────────────────────────
  var res = ScheduleAuthor.materializeDefault(db, RULES, { start: '2026-01-01', phaseDays: 30 });
  check('phases-created', res.phases.length >= 2, 'phases=' + res.phases.length +
    ' [' + res.phases.map(function (p) { return p.name + ':' + p.count; }).join(', ') + ']');
  check('every-element-assigned', res.assignmentCount === nElems,
    'assignments=' + res.assignmentCount + ' elements=' + nElems);

  // WBS shape: one summary ROOT (is_summary=1) + N dated leaves (is_summary=0).
  var roots = db.exec("SELECT COUNT(*) FROM tasks WHERE is_summary=1")[0].values[0][0];
  var leaves = db.exec("SELECT COUNT(*) FROM tasks WHERE (is_summary IS NULL OR is_summary=0) AND schedule_start IS NOT NULL")[0].values[0][0];
  check('one-summary-root', roots === 1, 'summaryRoots=' + roots);
  check('dated-leaves-eq-phases', leaves === res.phases.length, 'datedLeaves=' + leaves + ' phases=' + res.phases.length);
  // Every leaf nests under the root (organized WBS tree).
  var orphan = db.exec("SELECT COUNT(*) FROM tasks WHERE is_summary=0 AND wbs_parent <> '" + res.rootId + "'")[0].values[0][0];
  check('leaves-nest-under-root', orphan === 0, 'orphanLeaves=' + orphan);

  // ── 3. Shipped read-path (`_cap`) sees the authored schedule ─────────────────
  var cap = makeCap(db);
  check('cap-active', cap !== null, 'cap=' + (cap ? 'captured' : 'null'));
  check('cap-leafcount', cap && cap.taskCount === res.phases.length, 'cap.taskCount=' + (cap && cap.taskCount));
  var guidMapped = cap ? Object.keys(cap.guidTask).length : 0;
  check('cap-maps-every-guid', guidMapped === nElems, 'guidTask=' + guidMapped + ' elements=' + nElems);

  // Spot-check: an IfcFurniture element must land in the Finishes phase task (rule-correct binding).
  var furn = db.exec("SELECT guid FROM elements_meta WHERE ifc_class='IfcFurniture' LIMIT 1");
  var finishesTask = 'TASK_Finishes';
  if (furn.length && furn[0].values.length) {
    var fg = furn[0].values[0][0];
    check('cap-furniture-in-finishes', cap && cap.guidTask[fg] === finishesTask,
      'IfcFurniture guid->' + (cap && cap.guidTask[fg]));
  } else { check('cap-furniture-in-finishes', false, 'no IfcFurniture element found'); }

  // ── 4. CRAFT: reassign one element to a DIFFERENT phase → re-fold honours it ──
  // Pick a Superstructure (IfcMember) element and a control element we will NOT touch.
  var member = db.exec("SELECT guid FROM elements_meta WHERE ifc_class='IfcMember' LIMIT 2");
  var movedGuid = member[0].values[0][0];
  var controlGuid = member[0].values[1][0];
  var srcTaskBefore = cap.guidTask[movedGuid];
  var ctrlTaskBefore = cap.guidTask[controlGuid];
  // Target a phase that is NOT the source (Architecture).
  var targetTask = 'TASK_Architecture';
  var asg = ScheduleAuthor.assignElement(db, movedGuid, targetTask);
  check('craft-assign-ok', asg.ok === true, 'moved ' + srcTaskBefore + ' -> ' + targetTask);

  var cap2 = makeCap(db);
  check('craft-reassign-honored', cap2 && cap2.guidTask[movedGuid] === targetTask,
    'after re-fold guid->' + (cap2 && cap2.guidTask[movedGuid]));
  check('craft-control-unchanged', cap2 && cap2.guidTask[controlGuid] === ctrlTaskBefore,
    'control still->' + (cap2 && cap2.guidTask[controlGuid]) + ' (was ' + ctrlTaskBefore + ')');
  // The moved element now carries the TARGET task's real window (the overlay payload).
  var targetWin = cap2.win[targetTask];
  check('craft-carries-target-window', !!targetWin && cap2.guidTask[movedGuid] === targetTask,
    'target window name="' + (targetWin && targetWin.name) + '"');

  console.log('§W-AUTHOR-4D-BLANK RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-AUTHOR ERROR', e); process.exit(2); });
