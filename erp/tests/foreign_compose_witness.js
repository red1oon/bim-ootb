// foreign_compose_witness.js — proves an ADOPTED P6 plan composes with the verbs that landed AFTER the
// §SE arc, on the REAL Hospital model. prompts/FOREIGN_IMPORT_COMPOSE_CHECKS.md.
//
// Issue each block proves:
//   W-IMPORT-DEEPEN    — #518 breakdownByAttribute/addTask run on IMPORTED task ids (A:Axxxx, P6 WBS
//                        depth) with ZERO _cap coverage loss; both edits replay via schedule_sync.applyOp
//                        on a peer db → byte-identical convergence; 5D re-folds total-invariant.
//   W-AUTOBIND-DEEPEN  — §C4 payoff: autoBind coarse-binds a whole class to one task → breakdown by
//                        storey splits it into per-level sub-tasks EACH keeping its element slice → granular
//                        4D with zero manual element-picking and zero element loss.
//   W-IMPORT-WHATIF    — #516 captured-aware: the imported schedule reaches what-if as CAPTURED (the
//                        Generate-guard fires → no re-prompt); a slip (lag edit on an imported link)
//                        ripples through the imported FS/SS/FF/SF logic via computeCpm over the
//                        task_sequences we wrote from the file; discard restores the baseline.
//   NOTE: the ERP C_ProjectPhase blue-branch what-if (whatif.js, #516) acts on a DIFFERENT table; a
//   freshly-imported tasks-table plan reaches it only after the PARKED "fold authored sched→ERP
//   C_Project" step. This witness proves what-if at the schedule-editor/CPM layer where the imported
//   plan actually lives — honest to shipped engine, no invented fold.
'use strict';
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var FIX = path.join(__dirname, '..', '..', 'tests', 'fixtures');
var HOSPITAL_DB = '/home/red1/bim-ootb/buildings/Hospital_meta.db';

var FS_ = require(path.join(VIEWER, 'foreign_schedule.js'));
var SA = require(path.join(VIEWER, 'schedule_author.js'));
var SYNC = require(path.join(VIEWER, 'schedule_sync.js'));
global.ScheduleAuthor = SA;   // schedule_sync.applyOp dispatches through the global

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-COMPOSE PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-COMPOSE FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }
function loadRates() {
  var t = read('rates.js');
  function block(m) { var s = t.indexOf(m); return t.slice(s, t.indexOf('};', s) + 2); }
  var src = block('var RATES = {') + '\n' + block('var RATES_DEFAULT');
  return (new Function(src + '\n return {RATES:RATES, RATES_DEFAULT:RATES_DEFAULT};'))();
}
function scalar(db, sql, p) { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
// total elements sitting on a NON-summary leaf (the _cap coverage set)
function leafCoverage(db) {
  return scalar(db, 'SELECT COUNT(*) FROM task_elements te JOIN tasks t ON t.task_id=te.task_id ' +
    'WHERE t.is_summary IS NULL OR t.is_summary=0');
}
function freshBound(SQL, HOSP) {
  var db = new SQL.Database(HOSP);
  var data = FS_.toScheduleData(FS_.parseXER(fs.readFileSync(path.join(FIX, 'Hospital_GW_Programme.bound.xer'), 'utf8')));
  FS_.adoptIntoDb(db, data);
  FS_.autoBind(db, 'GW-HOSP');
  return db;
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  if (!fs.existsSync(HOSPITAL_DB)) { console.log('§W-COMPOSE SKIP Hospital DB absent: ' + HOSPITAL_DB); process.exit(0); }
  var HOSP = new Uint8Array(fs.readFileSync(HOSPITAL_DB));
  var rates = loadRates();
  var SID = 'GW-HOSP', PHASE = 'A:A2010';   // Columns — autoBound to all IfcColumn (STR), spans 4 storeys

  // ── W-IMPORT-DEEPEN ─────────────────────────────────────────────────────────────────────────────
  var db = freshBound(SQL, HOSP);
  check('imported-ids-namespaced', /^A:/.test(PHASE) && scalar(db, 'SELECT 1 FROM tasks WHERE task_id=?', [PHASE]) === 1,
    'operating on imported P6 id ' + PHASE);
  var covBefore = leafCoverage(db);
  var phaseElems = scalar(db, 'SELECT COUNT(*) FROM task_elements WHERE task_id=?', [PHASE]);
  var pStart = scalar(db, 'SELECT schedule_start FROM tasks WHERE task_id=?', [PHASE]);

  var bd = SA.breakdownByAttribute(db, SID, PHASE, 'storey');
  check('deepen-breakdown-ok', bd.ok && bd.created >= 2, 'created ' + (bd && bd.created) + ' per-storey children');
  check('deepen-parent-summary', scalar(db, 'SELECT is_summary FROM tasks WHERE task_id=?', [PHASE]) === 1,
    'imported phase becomes a roll-up summary');
  var covAfter = leafCoverage(db);
  check('deepen-zero-cap-loss', covAfter === covBefore, 'leaf coverage before=' + covBefore + ' after=' + covAfter + ' (no element orphaned)');
  var childWin = scalar(db, 'SELECT schedule_start FROM tasks WHERE wbs_parent=? LIMIT 1', [PHASE]);
  check('deepen-children-inherit-window', childWin === pStart, 'child start=' + childWin + ' == parent ' + pStart);

  // addTask under an imported WBS summary node (deterministic id; summaries carry no window)
  var at = SA.addTask(db, SID, { name: 'Precast columns', wbsParent: 'W:W2' });
  check('deepen-addtask-ok', at.ok && at.taskId === 'TASK_Precast_columns', 'new leaf id=' + (at && at.taskId) + ' (deterministic)');
  // addTask under a DATED imported leaf → inherits its window AND must NOT force the leaf to a summary
  var leafPhase = 'A:A1010';
  var leafStart = scalar(db, 'SELECT schedule_start FROM tasks WHERE task_id=?', [leafPhase]);
  var at2 = SA.addTask(db, SID, { name: 'Pad footings', wbsParent: leafPhase });
  check('deepen-addtask-window', at2.ok && scalar(db, 'SELECT schedule_start FROM tasks WHERE task_id=?', [at2.taskId]) === leafStart,
    'new leaf inherits dated parent window ' + leafStart);
  check('deepen-parent-not-forced-summary', scalar(db, 'SELECT is_summary FROM tasks WHERE task_id=?', [leafPhase]) === 0,
    'addTask under a leaf does NOT summarise it (keeps its own _cap)');

  // ── W-IMPORT-DEEPEN: applyOp peer-convergence on imported ids ────────────────────────────────────
  var dbA = freshBound(SQL, HOSP), dbB = freshBound(SQL, HOSP);
  SA.breakdownByAttribute(dbA, SID, PHASE, 'storey');
  var rA = SA.addTask(dbA, SID, { name: 'Precast columns', wbsParent: 'W:W2' });
  // peer replays the SAME ops via the sync verb (taskId carried so the add is deterministic)
  SYNC.applyOp(dbB, { op: 'breakdown', schedId: SID, taskId: PHASE, attr: 'storey' });
  SYNC.applyOp(dbB, { op: 'addtask', schedId: SID, taskId: rA.taskId, name: 'Precast columns', wbsParent: 'W:W2' });
  var bufA = Buffer.from(dbA.export()), bufB = Buffer.from(dbB.export());
  check('deepen-applyop-converges', bufA.equals(bufB), 'peer dbs byte-identical after replay (' + bufA.length + ' bytes)');

  // ── W-IMPORT-DEEPEN: 5D re-folds, total invariant across breakdown ───────────────────────────────
  var dbC = freshBound(SQL, HOSP);
  var foldBefore = SA.foldCost(dbC, SID, rates.RATES, rates.RATES_DEFAULT, 'USD').total;
  SA.breakdownByAttribute(dbC, SID, PHASE, 'storey');
  var foldAfter = SA.foldCost(dbC, SID, rates.RATES, rates.RATES_DEFAULT, 'USD').total;
  check('deepen-5d-total-invariant', foldBefore > 0 && foldAfter === foldBefore,
    'project 5D total before=' + foldBefore + ' after=' + foldAfter + ' (breakdown moves cost, never mints it)');

  // ── W-AUTOBIND-DEEPEN (§C4): coarse autoBind → per-storey slices, each keeping its elements ───────
  var dbD = freshBound(SQL, HOSP);
  var coarse = scalar(dbD, 'SELECT COUNT(*) FROM task_elements WHERE task_id=?', [PHASE]);
  var bd2 = SA.breakdownByAttribute(dbD, SID, PHASE, 'storey');
  var sumChildren = scalar(dbD, 'SELECT COUNT(*) FROM task_elements te JOIN tasks t ON t.task_id=te.task_id WHERE t.wbs_parent=?', [PHASE]);
  check('autobind-deepen-no-loss', sumChildren === coarse, 'coarse autoBind ' + coarse + ' columns → Σ per-storey children ' + sumChildren);
  // each per-storey child is a PURE single-storey slice (a true partition, not a name guess)
  var impure = scalar(dbD,
    "SELECT COUNT(*) FROM (SELECT t.task_id FROM tasks t JOIN task_elements te ON te.task_id=t.task_id " +
    "JOIN elements_meta m ON m.guid=te.guid WHERE t.wbs_parent=? GROUP BY t.task_id HAVING COUNT(DISTINCT m.storey)>1)", [PHASE]);
  check('autobind-deepen-slice-pure', bd2.ok && impure === 0, 'per-storey children carrying mixed storeys=' + impure);

  // ── W-IMPORT-WHATIF (§C2) ────────────────────────────────────────────────────────────────────────
  var dbW = freshBound(SQL, HOSP);
  var act = SA.activeSchedule(dbW);
  check('whatif-imported-is-captured', !!act && act.id === SID && act.captured === true,
    'activeSchedule captured=' + (act && act.captured) + ' → what-if adopts it, no Generate re-prompt');

  var base = SA.computeCpm(dbW, SID);
  var baseDur = base.projectDuration;
  var succEsBase = base.tasks.filter(function (t) { return t.id === 'A:A2020'; })[0].es;  // Beams, FS-after Columns
  check('whatif-baseline-cpm', baseDur === 300, 'imported plan projectDuration=' + baseDur + ' (matches the file)');

  // SLIP: delay Beams by adding +10d lag on the imported A2010→A2020 FS link → ripple through the chain
  var upd = SA.updateDependency(dbW, 'A:A2010', 'A:A2020', { lag: 10 });
  var slip = SA.computeCpm(dbW, SID);
  var succEsSlip = slip.tasks.filter(function (t) { return t.id === 'A:A2020'; })[0].es;
  check('whatif-slip-ripples-FS', upd.ok && succEsSlip === succEsBase + 10 && slip.projectDuration === baseDur + 10,
    'A:A2020 ES ' + succEsBase + '→' + succEsSlip + ', projectDuration ' + baseDur + '→' + slip.projectDuration + ' (honours imported FS+lag)');

  // DISCARD: restore the lag → CPM returns to the baseline (what-if is reversible)
  SA.updateDependency(dbW, 'A:A2010', 'A:A2020', { lag: 0 });
  var disc = SA.computeCpm(dbW, SID);
  check('whatif-discard-restores', disc.projectDuration === baseDur, 'discard → projectDuration back to ' + disc.projectDuration);

  console.log('\n§W-COMPOSE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-COMPOSE ERROR', e); process.exit(1); });
