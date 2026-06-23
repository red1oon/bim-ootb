// schedule_cpm_witness.js — W-SCHED-CPM (FUSED_4D5D_WEDGE_LANE §SE-2)
//
// ISSUE PROVED: computeCpm runs an EXACT critical-path forward/backward pass over the authored
// task_sequences DAG — honouring FS/SS/FF/SF + lag — and writes early/late dates, total + free float,
// and is_critical onto the leaf tasks. Two graphs:
//   (1) a HAND-COMPUTED diamond → assert EXACT ES/EF/LS/LF/float/critical vs by-hand numbers (proves
//       the maths, not merely that it runs).
//   (2) REAL SampleHouse default + an authored FS chain → linear ⇒ every task critical, zero float,
//       projectDuration = Σ durations.
// Whitebox §-log only. This is the §SE-B "DO IT" half (deterministic compute); NO resource leveling.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.resolve(__dirname, '..', '..', 'viewer');
var SH_DB = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-SCHED-CPM PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-SCHED-CPM FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var s = txt.indexOf('var SEQUENCE_RULES = {'), di = txt.indexOf('var SEQUENCE_DEFAULT');
  var slice = txt.slice(s, txt.indexOf('};', di) + 2);
  // eslint-disable-next-line no-new-func
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}

function mkDb(SQL) {
  var db = new SQL.Database();
  db.run('CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)');
  db.run('CREATE TABLE task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))');
  db.run('CREATE TABLE task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
  return db;
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });

  // ── GRAPH 1: hand-computed diamond ───────────────────────────────────────────
  // A→B (FS,0), A→C (FS,+2), B→D (FS,0), C→D (SS,+1). dur A2 B4 C3 D2.
  // By hand: ES/EF A0/2 B2/6 C4/7 D6/8 ; LS/LF A0/2 B2/6 C5/8 D6/8 ;
  // totalFloat A0 B0 C1 D0 (critical A,B,D) ; freeFloat A0 B0 C1 D0.
  var db = mkDb(SQL);
  [['A', 'P2D'], ['B', 'P4D'], ['C', 'P3D'], ['D', 'P2D']].forEach(function (t) {
    db.run('INSERT INTO tasks (task_id,schedule_id,name,is_summary,schedule_duration,status) VALUES (?,?,?,0,?,?)',
      [t[0], 'DIAMOND', t[0], t[1], 'PLANNED']);
  });
  db.run("INSERT INTO task_sequences VALUES ('A','B','FS',0)");
  db.run("INSERT INTO task_sequences VALUES ('A','C','FS',2)");
  db.run("INSERT INTO task_sequences VALUES ('B','D','FS',0)");
  db.run("INSERT INTO task_sequences VALUES ('C','D','SS',1)");

  var r = ScheduleAuthor.computeCpm(db, 'DIAMOND', { start: '2026-01-01' });
  var byId = {}; r.tasks.forEach(function (t) { byId[t.id] = t; });
  var EXPECT = {
    A: { es: 0, ef: 2, ls: 0, lf: 2, totalFloat: 0, freeFloat: 0, critical: true },
    B: { es: 2, ef: 6, ls: 2, lf: 6, totalFloat: 0, freeFloat: 0, critical: true },
    C: { es: 4, ef: 7, ls: 5, lf: 8, totalFloat: 1, freeFloat: 1, critical: false },
    D: { es: 6, ef: 8, ls: 6, lf: 8, totalFloat: 0, freeFloat: 0, critical: true }
  };
  Object.keys(EXPECT).forEach(function (id) {
    var got = byId[id], exp = EXPECT[id];
    var ok = got && ['es', 'ef', 'ls', 'lf', 'totalFloat', 'freeFloat'].every(function (k) { return got[k] === exp[k]; }) && got.critical === exp.critical;
    check('diamond-' + id, ok, got ? ('es' + got.es + ' ef' + got.ef + ' ls' + got.ls + ' lf' + got.lf +
      ' tf' + got.totalFloat + ' ff' + got.freeFloat + ' crit' + got.critical) : 'MISSING');
  });
  check('diamond-projectDuration', r.projectDuration === 8, 'PF=' + r.projectDuration);
  check('diamond-criticalIds', r.criticalIds.sort().join(',') === 'A,B,D', 'critical=' + r.criticalIds.join(','));
  // write-back hit the DB columns (dates + is_critical + float string)
  var wb = db.exec("SELECT early_start, late_finish, total_float, is_critical FROM tasks WHERE task_id='C'")[0].values[0];
  check('diamond-writeback', wb[0] === '2026-01-05' && wb[1] === '2026-01-09' && wb[2] === '1' && wb[3] === 0,
    'C es=' + wb[0] + ' lf=' + wb[1] + ' tf=' + wb[2] + ' crit=' + wb[3]);

  // ── GRAPH 2: real SampleHouse, FS chain ⇒ all critical, PF = Σ durations ──────
  var rules = loadRules();
  var sh = new SQL.Database(new Uint8Array(fs.readFileSync(SH_DB)));
  ScheduleAuthor.materializeDefault(sh, rules.SEQUENCE_RULES, { start: '2026-01-01', phaseDays: 30 });
  var leaves = [];
  (function flat(ns) { ns.forEach(function (n) { if (!n.isSummary) leaves.push(n.id); flat(n.children || []); }); })(ScheduleAuthor.wbsTree(sh, 'SCH_AUTHORED'));
  for (var i = 0; i < leaves.length - 1; i++) ScheduleAuthor.addDependency(sh, leaves[i], leaves[i + 1], 'FS', 0);
  var rc = ScheduleAuthor.computeCpm(sh, 'SCH_AUTHORED', { start: '2026-01-01' });
  check('sh-all-critical', rc.tasks.length > 0 && rc.tasks.every(function (t) { return t.critical; }),
    'critical=' + rc.criticalIds.length + '/' + rc.tasks.length);
  check('sh-zero-float', rc.tasks.every(function (t) { return t.totalFloat === 0; }), 'all total_float=0');
  var sumDur = rc.tasks.reduce(function (a, t) { return a + t.dur; }, 0);
  check('sh-projectDuration-eq-sum', rc.projectDuration === sumDur, 'PF=' + rc.projectDuration + ' Σdur=' + sumDur);

  console.log('§W-SCHED-CPM RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('§W-SCHED-CPM ERROR', e); process.exit(2); });
