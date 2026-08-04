// witness_gantt_edit_constraints.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT C1/C2.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   A draggable Gantt bar with no constraint checking lets a user "fix" a real schedule violation by
//   dragging it out of sight instead of fixing its cause — against this project's Prime Rule. The
//   existing moveTask() writes dates and nothing else ("CPM invalidation is the caller's concern"),
//   so on its own it is exactly that unsafe drag. moveTaskCascade() is supposed to supply the two
//   missing halves. This witness fails if either is absent or wrong:
//     C2 CLAMP   — a move EARLIER than a predecessor permits must be refused and clamped to the
//                  earliest legal date, naming the binding predecessor. NEVER silently accepted.
//     C1 CASCADE — a move LATER must drag exactly the real task_sequences successors that would
//                  otherwise start before their constraint, transitively, and NOTHING else.
//
//   G-CON-2 is the load-bearing one: it re-runs the OLD moveTask() on the same input and asserts it
//   produces the violation moveTaskCascade prevents. If that ever stops failing, this witness is no
//   longer proving anything and the guard has become decorative.
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var DB_PATH = process.argv[2] || '/home/red1/bim-compiler/deploy/dev/buildings/Terminal_extracted.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-CON PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-CON FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var s = txt.indexOf('var RATES = {'), d = txt.indexOf('var SEQUENCE_DEFAULT');
  var slice = txt.slice(s, txt.indexOf('};', d) + 2);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}
function day(s) { return Math.round(Date.parse(s + 'T00:00:00Z') / 86400000); }
function dstr(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }

function readTasks(db) {
  var T = {};
  var r = db.exec("SELECT task_id, schedule_start, schedule_finish FROM tasks " +
    "WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
  if (r.length) r[0].values.forEach(function (x) { T[x[0]] = { start: day(x[1]), finish: day(x[2]) }; });
  return T;
}
function readEdges(db) {
  var E = [];
  var r = db.exec('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences');
  if (r.length) r[0].values.forEach(function (x) {
    E.push({ pred: x[0], succ: x[1], type: x[2] || 'FS', lag: x[3] != null ? x[3] : 0 });
  });
  return E;
}
// Count edges whose constraint is violated by the current dates — the defect a cosmetic drag hides.
function violations(T, E) {
  var v = [];
  E.forEach(function (e) {
    var P = T[e.pred], S = T[e.succ]; if (!P || !S) return;
    var need;
    switch (e.type) {
      case 'SS': need = P.start + e.lag; break;
      case 'FF': need = P.finish + e.lag - (S.finish - S.start); break;
      case 'SF': need = P.start + e.lag - (S.finish - S.start); break;
      default:   need = P.finish + e.lag;
    }
    if (S.start < need) v.push({ edge: e.pred + '->' + e.succ, type: e.type, by: need - S.start });
  });
  return v;
}

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  var rules = loadRules();
  var opts = { start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate };
  function bytes() { return fs.readFileSync(DB_PATH); }   // sql.js takes ownership of the buffer — re-read per Database
  console.log('§W-CON db=' + path.basename(DB_PATH));

  var db = new SQL.Database(bytes());
  var res = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES, opts);
  check('G-CON-0 fixture-authored', res.ok === true, 'zones=' + res.zoneCount + ' edges=' + res.edgeCount);
  if (!res.ok) { console.log('§W-CON RESULT pass=' + pass + ' fail=' + fail); process.exit(1); }

  var T0 = readTasks(db), E = readEdges(db);
  var baseV = violations(T0, E);
  check('G-CON-1 generated-schedule-starts-clean', baseV.length === 0,
    'pre-existing violations=' + baseV.length + (baseV.length ? ' ' + JSON.stringify(baseV.slice(0, 3)) : ''));

  // Pick a task that genuinely has both a predecessor and a successor — otherwise neither rule is
  // exercised and a green run would mean nothing.
  var hasPred = {}, hasSucc = {};
  E.forEach(function (e) { hasSucc[e.pred] = 1; hasPred[e.succ] = 1; });
  var subject = Object.keys(T0).filter(function (id) { return hasPred[id] && hasSucc[id]; })[0];
  check('G-CON-2 found-a-task-with-both-pred-and-succ', !!subject, 'subject=' + subject);
  if (!subject) { console.log('§W-CON RESULT pass=' + pass + ' fail=' + fail); process.exit(1); }

  // ---------- C2: try to move it 30 days EARLIER than legal.
  var tooEarly = dstr(T0[subject].start - 30);
  var mv = ScheduleAuthor.moveTaskCascade(db, 'SCH_AUTHORED', subject, tooEarly, {});
  check('G-CON-3 clamp-refuses-an-illegal-earlier-move', mv.ok && mv.clamped === true,
    'requested=' + tooEarly + ' landed=' + mv.start + ' blockedBy=' + mv.blockedBy);
  check('G-CON-4 clamp-names-the-binding-predecessor', !!mv.blockedBy, 'blockedBy=' + mv.blockedBy);
  var T1 = readTasks(db);
  check('G-CON-5 clamped-move-introduced-no-violation', violations(T1, E).length === 0,
    'violations=' + violations(T1, E).length);

  // ---------- THE LOAD-BEARING CONTROL: the OLD verb on the SAME input must produce the violation.
  // If this stops failing, the constraint guard is no longer proving anything.
  var db2 = new SQL.Database(bytes());
  ScheduleAuthor.materializeZones(db2, rules.SEQUENCE_RULES, opts);
  ScheduleAuthor.moveTask(db2, subject, tooEarly);
  var vOld = violations(readTasks(db2), readEdges(db2));
  check('G-CON-6 RED-CONTROL-old-moveTask-does-violate', vOld.length > 0,
    'unguarded moveTask left ' + vOld.length + ' violated edge(s) — this is what the clamp prevents');

  // ---------- C1: move it 45 days LATER, which must cascade.
  var db3 = new SQL.Database(bytes());
  ScheduleAuthor.materializeZones(db3, rules.SEQUENCE_RULES, opts);
  var T3 = readTasks(db3), E3 = readEdges(db3);
  var later = dstr(T3[subject].start + 45);
  var mv2 = ScheduleAuthor.moveTaskCascade(db3, 'SCH_AUTHORED', subject, later, {});
  check('G-CON-7 later-move-is-accepted-unclamped', mv2.ok && mv2.clamped === false,
    'start=' + mv2.start + ' cascaded=' + mv2.cascaded);
  check('G-CON-8 later-move-cascaded-real-successors', mv2.cascaded > 0, 'cascaded=' + mv2.cascaded);
  var T4 = readTasks(db3);
  check('G-CON-9 cascade-left-zero-violations', violations(T4, E3).length === 0,
    'violations=' + violations(T4, E3).length);

  // Cascade must be PUSH-ONLY and MINIMAL: nothing moved earlier, and nothing moved that was not
  // reachable from the subject over real edges.
  var reach = {}, q = [subject];
  var succOf = {}; E3.forEach(function (e) { (succOf[e.pred] = succOf[e.pred] || []).push(e.succ); });
  while (q.length) { var c = q.shift(); (succOf[c] || []).forEach(function (s) { if (!reach[s]) { reach[s] = 1; q.push(s); } }); }
  var pulledEarlier = 0, movedUnreachable = [];
  Object.keys(T4).forEach(function (id) {
    if (T4[id].start < T3[id].start) pulledEarlier++;
    if (T4[id].start !== T3[id].start && id !== subject && !reach[id]) movedUnreachable.push(id);
  });
  check('G-CON-10 cascade-is-push-only', pulledEarlier === 0, 'tasksPulledEarlier=' + pulledEarlier);
  check('G-CON-11 cascade-touched-only-real-successors', movedUnreachable.length === 0,
    'movedWithoutADependencyPath=' + movedUnreachable.length + ' ' + JSON.stringify(movedUnreachable.slice(0, 5)));

  // ---------- E2: edge-pull resize must change duration AND still respect the constraints.
  var db4 = new SQL.Database(bytes());
  ScheduleAuthor.materializeZones(db4, rules.SEQUENCE_RULES, opts);
  var T5 = readTasks(db4), E5 = readEdges(db4);
  var rs = ScheduleAuthor.resizeTask(db4, 'SCH_AUTHORED', subject,
    dstr(T5[subject].start), dstr(T5[subject].finish + 20), {});
  var T6 = readTasks(db4);
  check('G-CON-12 resize-lengthened-the-bar',
    rs.ok && (T6[subject].finish - T6[subject].start) === (T5[subject].finish - T5[subject].start) + 20,
    'was=' + (T5[subject].finish - T5[subject].start) + 'd now=' + (T6[subject].finish - T6[subject].start) + 'd');
  check('G-CON-13 resize-left-zero-violations', violations(T6, E5).length === 0,
    'violations=' + violations(T6, E5).length);

  // ---------- E3/E4: the link path. Drag-to-link creates a real FS edge; the cycle guard must refuse
  // the reverse of an edge that already exists, because a cyclic schedule is invalid and "fixing" it
  // silently would be worse than refusing.
  var db5 = new SQL.Database(bytes());
  ScheduleAuthor.materializeZones(db5, rules.SEQUENCE_RULES, opts);
  var E5b = readEdges(db5);
  var anEdge = E5b[0];
  check('G-CON-14 fixture-has-an-edge-to-invert', !!anEdge, anEdge ? anEdge.pred + '->' + anEdge.succ : 'none');
  if (anEdge) {
    // Reversing an existing edge closes a 2-cycle — must be refused by wouldCycle.
    check('G-CON-15 wouldCycle-detects-the-inverse-edge',
      ScheduleAuthor.wouldCycle(db5, anEdge.succ, anEdge.pred) === true,
      'inverting ' + anEdge.pred + '->' + anEdge.succ);
    var before = readEdges(db5).length;
    // A genuinely new, acyclic edge must be accepted — otherwise the guard is just refusing everything.
    var leaves = Object.keys(readTasks(db5)).filter(function (id) {
      return !E5b.some(function (e) { return e.pred === id; });
    });
    var roots = Object.keys(readTasks(db5)).filter(function (id) {
      return !E5b.some(function (e) { return e.succ === id; });
    });
    var p = roots[0], s = leaves[0];
    if (p && s && p !== s && !ScheduleAuthor.wouldCycle(db5, p, s)) {
      var addRes = ScheduleAuthor.addDependency(db5, p, s, 'FS', 0);
      check('G-CON-16 acyclic-link-is-accepted', addRes && addRes.ok !== false,
        p + '->' + s + ' edges ' + before + '->' + readEdges(db5).length);
      // E4 unlink must remove exactly that edge and leave the rest alone.
      ScheduleAuthor.removeDependency(db5, p, s);
      check('G-CON-17 unlink-removes-exactly-that-edge', readEdges(db5).length === before,
        'edges back to ' + readEdges(db5).length + ' (was ' + before + ')');
    } else {
      check('G-CON-16 acyclic-link-is-accepted', false, 'could not find an acyclic pair to link');
    }
  }

  console.log('§W-CON RESULT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
