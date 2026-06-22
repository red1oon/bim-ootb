// author_captured_witness.js — W-AUTHOR-CAPTURED (FUSED_4D5D_WEDGE_LANE — user 2026-06-23)
//
// ISSUE PROVED: a model dropped from Bonsai/Revit can arrive WITH a native IFC schedule
// (import_worker captures IfcWorkSchedule/IfcTask into schedules/tasks/task_elements, keyed by IFC
// GlobalId — NOT 'SCH_AUTHORED'). The wizard must (a) DETECT and edit that imported schedule, and
// (b) NOT rule-generate a competing one — because _cap reads ALL schedule_ids, so two schedules =
// a doubled timeline. This witness builds a SYNTHETIC captured schedule (test scaffolding that
// mirrors import_worker's output — NOT claimed as real building data) on a real SampleHouse and
// proves activeSchedule + the double-read hazard, through the VERBATIM _cap.

var fs = require('fs'), path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var ROOT = path.resolve(__dirname, '..', '..'), VIEWER = path.join(ROOT, 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var SA = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function ck(n, c, d) { if (c) { pass++; console.log('§W-CAPT PASS  ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('§W-CAPT FAIL  ' + n + (d ? '  ' + d : '')); } }
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }
function loadRules() { var t = read('rates.js'), s = t.indexOf('var SEQUENCE_RULES = {'), d = t.indexOf('var SEQUENCE_DEFAULT'); return (new Function(t.slice(s, t.indexOf('};', d) + 2) + '\n return SEQUENCE_RULES;'))(); }
function loadCap() { var t = read('time_machine.js'), s = t.indexOf('var _cap = (function() {'), e = t.indexOf('})();', s) + 5; return new Function('db', t.slice(s, e) + '\n return _cap;'); }

var WIDE = 'CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)';

(async function () {
  var RULES = loadRules(), makeCap = loadCap();
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));

  // ── Simulate import_worker landing a Bonsai/Revit IfcWorkSchedule (GlobalId-keyed) ──
  db.run('DROP TABLE IF EXISTS tasks'); db.run(WIDE);
  db.run('CREATE TABLE IF NOT EXISTS schedules (schedule_id TEXT PRIMARY KEY, name TEXT, status TEXT, created_date TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
  var CAP = '0BonsaiWorkSched0GUID00';   // an IFC-GlobalId-shaped schedule_id (NOT SCH_AUTHORED)
  db.run("INSERT INTO schedules VALUES (?,?,?,?)", [CAP, 'Bonsai Programme', 'PLANNED', '2027-01-01']);
  db.run("INSERT INTO tasks (task_id,schedule_id,name,is_summary,schedule_start,schedule_finish) VALUES ('T_FRAME',?, 'Framing',0,'2027-01-04','2027-02-01')", [CAP]);
  db.run("INSERT INTO tasks (task_id,schedule_id,name,is_summary,schedule_start,schedule_finish) VALUES ('T_FIT',?,  'Fit-out',0,'2027-02-01','2027-03-15')", [CAP]);
  var g = db.exec('SELECT guid FROM elements_meta LIMIT 2')[0].values;
  db.run("INSERT INTO task_elements VALUES ('T_FRAME',?)", [g[0][0]]);
  db.run("INSERT INTO task_elements VALUES ('T_FIT',?)", [g[1][0]]);

  // ── 1. activeSchedule detects the IMPORTED schedule (captured, not authored) ──
  var act = SA.activeSchedule(db);
  ck('detects-captured', !!act && act.id === CAP, 'active=' + (act && act.id));
  ck('flagged-captured', !!act && act.captured === true && act.authored === false, 'captured=' + (act && act.captured));
  ck('captured-name', !!act && act.name === 'Bonsai Programme', 'name=' + (act && act.name));
  ck('captured-taskcount', !!act && act.taskCount === 2, 'tasks=' + (act && act.taskCount));

  // ── 2. the shipped _cap plays the imported schedule (so the TM shows the real Bonsai dates) ──
  var cap = makeCap(db);
  ck('cap-plays-imported', !!cap && cap.taskCount === 2, 'cap.taskCount=' + (cap && cap.taskCount));
  ck('cap-binds-imported', !!cap && cap.guidTask[g[0][0]] === 'T_FRAME', 'guid→' + (cap && cap.guidTask[g[0][0]]));

  // ── 3. WHY the guard matters: if we ALSO rule-generate SCH_AUTHORED, _cap double-reads ──
  SA.materializeDefault(db, RULES, { start: '2026-01-01', phaseDays: 30 });   // the naive (wrong) move
  var capBoth = makeCap(db);
  ck('double-read-hazard', !!capBoth && capBoth.taskCount === 2 + 3, 'cap.taskCount=' + (capBoth && capBoth.taskCount) + ' (2 imported + 3 generated = doubled)');
  // and activeSchedule now PREFERS the user's authored draft (so re-open edits SCH_AUTHORED)
  var act2 = SA.activeSchedule(db);
  ck('authored-wins-when-present', !!act2 && act2.id === 'SCH_AUTHORED' && act2.authored, 'active=' + (act2 && act2.id));

  // ── 4. wiring: the UI adopts/guards (the safeguard that prevents step 3 in the app) ──
  var ui = read('schedule_author_ui.js');
  ck('ui-open-adopts', /function open\(\)[\s\S]{0,900}activeSchedule\(db\(\)\)/.test(ui), 'open() → activeSchedule');
  ck('ui-generate-guards', /if \(act && act\.captured\)[\s\S]{0,400}return;/.test(ui), 'generateDraft bails on captured');
  ck('ui-hides-generate', /function syncControls\(\)[\s\S]{0,300}draft\.style\.display = cap/.test(ui), 'hides Generate when captured');

  console.log('§W-AUTHOR-CAPTURED RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-CAPT ERROR', e); process.exit(2); });
