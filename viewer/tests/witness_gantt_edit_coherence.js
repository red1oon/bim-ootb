// witness_gantt_edit_coherence.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT W1.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   A Gantt bar's drawn span is derived from its ELEMENT ops (§GANTT_BAR_IDENTITY K0), while an edit
//   writes TASK dates (§GANTT_EDIT C1/C2). If an accepted edit moves the task but not its elements,
//   the drawer says one thing and the 3D movie plays another — the exact class of divergence PR #1162
//   had to close on the CPM side. W1 re-times each moved task's own elements onto its new window so
//   the two cannot disagree.
//
//   Tests the SHIPPED function: _retimeSpan is sliced out of viewer/time_machine.js source and
//   evaluated, not re-implemented here. Re-implementing it is precisely the hand-copied-duplicate
//   mistake this codebase already paid for three times with the support predicate.
//
//   Fails if a remapped element can land outside its task's new window, if the engine's internal
//   ordering within a zone is not preserved, or if any element ends up with a non-positive duration.
var fs = require('fs');
var path = require('path');
// §S66/§S71: this file used to sit in the repo ROOT, where the suite runner never saw it — a
// witness outside viewer/tests/ does not exist as far as the runner is concerned, which is how
// G-COH-6 below stayed a false negative unnoticed. Path is relative to its new home.
var SRC = path.join(__dirname, '..', 'time_machine.js');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-COH PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-COH FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// ---- Slice the shipped function out of the real source.
var txt = fs.readFileSync(SRC, 'utf8');
var i = txt.indexOf('function _retimeSpan(');
check('G-COH-0 shipped-function-found', i >= 0, 'viewer/time_machine.js');
if (i < 0) { console.log('§W-COH RESULT pass=' + pass + ' fail=' + fail); process.exit(1); }
var depth = 0, started = false, end = i;
for (var c = i; c < txt.length; c++) {
  if (txt[c] === '{') { depth++; started = true; }
  else if (txt[c] === '}') { depth--; if (started && depth === 0) { end = c + 1; break; } }
}
var _retimeSpan = (new Function(txt.slice(i, end) + '\n return _retimeSpan;'))();
check('G-COH-1 shipped-function-evaluates', typeof _retimeSpan === 'function');

var DAY = 86400000;
// A realistic zone: 40 elements laid across a 20-day window, in engine order, some overlapping.
function makeZone(oS, days, n) {
  var ops = [], span = days * DAY;
  for (var k = 0; k < n; k++) {
    var s = oS + Math.floor((k / n) * span);
    var e = oS + Math.floor(((k + 1) / n) * span);
    if (e <= s) e = s + 60000;
    ops.push({ s: s, e: e });
  }
  return ops;
}

// Scenarios: pure move, stretch, shrink, and a move that also changes duration. Each must hold.
// The last case is the one that actually exercises the window clamp, and it is not contrived: a real
// Hospital zone holds thousands of elements, so shrinking one to a single day drives the per-element
// span below the 60s minimum-duration floor. The floor then bumps each end forward, and without a
// clamp the tail of the zone walks straight out past the task's finish.
var CASES = [
  { name: 'move-later-same-duration',   oS: 0, oDays: 20, nS: 45 * DAY, nDays: 20, n: 40 },
  { name: 'move-earlier-same-duration', oS: 60 * DAY, oDays: 20, nS: 10 * DAY, nDays: 20, n: 40 },
  { name: 'stretch-2x',                 oS: 0, oDays: 20, nS: 0, nDays: 40, n: 40 },
  { name: 'shrink-half',                oS: 0, oDays: 20, nS: 0, nDays: 10, n: 40 },
  { name: 'shrink-hard-to-1-day',       oS: 0, oDays: 40, nS: 5 * DAY, nDays: 1, n: 40 },
  { name: 'move-and-stretch',           oS: 12 * DAY, oDays: 13, nS: 80 * DAY, nDays: 33, n: 40 },
  { name: 'dense-zone-shrunk-to-1-day', oS: 0, oDays: 30, nS: 20 * DAY, nDays: 1, n: 5000 }
];

var totalOps = 0, outside = 0, disordered = 0, nonPositive = 0, worstCase = '';
CASES.forEach(function (cs) {
  var ops = makeZone(cs.oS, cs.oDays, cs.n);
  var oE = cs.oS + cs.oDays * DAY, nE = cs.nS + cs.nDays * DAY;
  var prevS = -Infinity, caseBad = 0;
  ops.forEach(function (op) {
    var r = _retimeSpan(op.s, op.e, cs.oS, oE, cs.nS, nE);
    totalOps++;
    // W1's core claim: an element never leaves its task's new window.
    if (r.s < cs.nS || r.e > nE) { outside++; caseBad++; }
    // The engine already ordered this zone correctly — an edit must preserve that, not re-derive it.
    if (r.s < prevS) { disordered++; caseBad++; }
    prevS = r.s;
    if (r.e <= r.s) { nonPositive++; caseBad++; }
  });
  if (caseBad && !worstCase) worstCase = cs.name;
  console.log("§W-COH case=" + cs.name + " ops=" + cs.n + " bad=" + caseBad);
});

check('G-COH-2 no-element-escapes-its-task-window', outside === 0,
  'escaped=' + outside + '/' + totalOps + (worstCase ? ' worstCase=' + worstCase : ''));
check('G-COH-3 engine-internal-order-preserved', disordered === 0, 'reordered=' + disordered);
check('G-COH-4 no-zero-or-negative-durations', nonPositive === 0, 'nonPositive=' + nonPositive);

// ---- RED CONTROL — corrected 2026-08-04. The first version of this control asserted that a NAIVE
// remap (affine, no window clamp) escapes the window. It does not, and cannot for realistic input:
// the affine map sends [oS,oE] onto [nS,nE] exactly, and the 60s minimum-duration bump only fires
// when a task's new span divided by its element count drops below 1ms — that needs more elements
// than a day has milliseconds. So the clamp inside _retimeSpan is belt-and-braces, NOT a
// load-bearing fix, and this witness must not claim otherwise.
//
// The real defect W1 exists to prevent is different and much larger: the task's dates move while its
// ELEMENTS DO NOT. That is the drawer-vs-movie divergence. The honest control is therefore to skip
// the re-time entirely and confirm the elements are then left stranded outside the task's new window.
var strandedNoRetime = 0, checkedNoRetime = 0;
CASES.forEach(function (cs) {
  if (cs.nS === cs.oS) return;                 // pure resize keeps the origin — not a divergence case
  var ops = makeZone(cs.oS, cs.oDays, cs.n);
  var nE = cs.nS + cs.nDays * DAY;
  ops.forEach(function (op) {
    checkedNoRetime++;
    if (op.s < cs.nS || op.e > nE) strandedNoRetime++;   // untouched op vs the task's NEW window
  });
});
check('G-COH-5 RED-CONTROL-without-W1-elements-are-stranded', strandedNoRetime > 0,
  'skipping the re-time strands ' + strandedNoRetime + '/' + checkedNoRetime +
  ' elements outside their task window — that divergence is exactly what W1 prevents');

// ---- The drag path must call the shipped function, not inline its own arithmetic.
// §S71 — THIS CHECK WAS A FALSE NEGATIVE. It used to read txt.slice(rt, rt + 2200): a fixed window
// from the function's start. retimeTaskElements then grew (the §S22_EPOCH_FIX audit code) and the
// _retimeSpan call moved to offset 5073 — outside the window. The assertion was wrong, the code was
// always fine, and nobody noticed because the file lived outside viewer/tests/ and never ran.
// A text slice cannot state its own dependencies; brace-match the real body instead. Same class as
// every other fixed-window finding on this lane.
function fnBody(src, name) {
  var idx = src.indexOf('function ' + name + '(');
  if (idx < 0) return '';
  var d = 0, open = false;
  for (var i = idx; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) return src.slice(idx, i + 1); }
  }
  return '';
}
var rtBody = fnBody(txt, 'retimeTaskElements');
check('G-COH-6 retime-path-uses-the-shipped-function', rtBody.length > 0 && rtBody.indexOf('_retimeSpan(') >= 0,
  'retimeTaskElements must not carry its own copy of the remap (brace-matched body=' + rtBody.length +
  ' chars; the old fixed 2200-char window made this a false negative once the function grew past it)');

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §S71 (RESUME item 5) — G-COH-7..9: the LIVE audit counters, not synthetic input.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   retimeTaskElements logs §RETIME_OUTLIER_AUDIT on EVERY real commit — outsideOldWindow /
//   collapsed60s / inverted. Those counters exist because of §S7: an element that rides OUTSIDE its
//   bar's drawn window (the §GANTT_MINI_TRIM Tukey trim makes the bar narrower than the ops it
//   summarises) is remapped by the same linear _retimeSpan as the ones inside, and a bad remap can
//   crush such an outlier to the 60s floor or invert it (end before start). Until now NOTHING
//   asserted them: G-COH-2..4 above test the pure _retimeSpan on synthetic spans, which is a
//   different claim from "a real drag, on a real schedule, through the real commit path, produced
//   zero collapses and zero inversions."
//
//   So this section drives the SHIPPED commitGanttDrag over a REAL fixture and reads the REAL log
//   line it emits. Bars come from the REAL GanttModel.buildTasks (trim included) — hand-built bars
//   whose windows exactly equal their ops' span would have no outliers at all, and would make the
//   assertion vacuous. G-COH-9 is the red control for exactly that.
'use strict';
var vm = require('vm');
var os = require('os');
var initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
var ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
var ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
var GanttModel = require(path.join(__dirname, '..', 'gantt_model.js'));

function sliceNamed(src, name) {
  var idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found in time_machine.js');
  var d = 0, open = false;
  for (var i = idx; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

(async function () {
  var BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
  var BUILDING = process.env.COH_BLD || 'Duplex';
  var dbPath = path.join(BLD_DIR, BUILDING + '_extracted.db');
  if (!fs.existsSync(dbPath)) {
    console.log('§W-COH SKIP G-COH-7..9 — fixture missing at ' + dbPath);
    console.log('§W-COH RESULT pass=' + pass + ' fail=' + fail);
    process.exit(fail ? 1 : 0);
  }
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  var db = new SQL.Database(fs.readFileSync(dbPath));
  var rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  var SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;

  // §TPL_MODEL (2026-08-27, bim-compiler prompts/4D_MODEL_INTEGRITY.md §L) — JUDGE THE CANONICAL
  // MODEL. This call used to pass no `template:`, so schedule_author.js's fork fell through to the
  // legacy deriveZones envelope and every claim below was measured on the model the 2026-08-27
  // ruling calls DEAD CODE. The witness was 10/0 green over the wrong construct — the failure the
  // user named as "WITNESS is moot if underlying design is poor", and PRIMAL LAW clause 2's
  // §CRISIS case: an editor witness that never edited the canonical timeline.
  var TPL_PATH = path.join(__dirname, '..', 'rates', '4D_template.json');
  var TPL = fs.existsSync(TPL_PATH) ? JSON.parse(fs.readFileSync(TPL_PATH, 'utf8')) : null;

  // Tee console.log so G-COH-10 can read the shipped §TPL_MODEL verdict rather than re-deriving
  // which branch ran. PRIMAL LAW clause 3 — the line is still PRINTED, never suppressed.
  var _seen = [];
  var _log = console.log, _warn = console.warn;
  console.log = function () { _seen.push(Array.prototype.join.call(arguments, ' ')); _log.apply(console, arguments); };
  console.warn = function () { _seen.push(Array.prototype.join.call(arguments, ' ')); _warn.apply(console, arguments); };

  var mres = ScheduleAuthor.materializeZones(db, SEQUENCE_RULES,
    { start: '2026-01-01', laborRates: {}, rates: {}, scheduleGate: ScheduleGate, template: TPL });

  console.log = _log; console.warn = _warn;
  var _modelLine = _seen.filter(function (l) { return l.indexOf('§TPL_MODEL') === 0; }).pop() || '';
  var _isCanonical = _modelLine.indexOf('model=template') >= 0;
  // VACUOUS-aware: if the fork emitted nothing at all we cannot say which model ran, and that is
  // an INCONCLUSIVE state, not a pass. It is reported as a FAIL because a witness that cannot see
  // its own subject is exactly the §CRISIS this claim exists to prevent recurring.
  check('G-COH-10 the-model-under-test-is-the-CANONICAL-template-path',
    _isCanonical,
    _modelLine ? _modelLine.slice(0, 120)
               : 'INCONCLUSIVE — no §TPL_MODEL line was emitted; which model was judged is UNKNOWN');
  if (!mres.ok) {
    console.log('§W-COH SKIP G-COH-7..9 — materializeZones failed: ' + JSON.stringify(mres));
    console.log('§W-COH RESULT pass=' + pass + ' fail=' + fail);
    process.exit(fail ? 1 : 0);
  }

  // Seed kernel_ops the way a built Gantt does: one ELEMENT_PLACE per task_elements guid, spread
  // ACROSS its task's own window in engine order (the real scheduler installs a zone's elements
  // sequentially, it does not stack them all on the window's first instant). The spread is what
  // gives GanttModel's Tukey trim something to trim, i.e. what produces real outliers.
  db.run('CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, ' +
    'op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
  var tr = db.exec("SELECT task_id, name, schedule_start, schedule_finish FROM tasks WHERE schedule_id='" +
    mres.scheduleId + "' AND (is_summary IS NULL OR is_summary=0)");
  var win = {};
  (tr.length ? tr[0].values : []).forEach(function (r) {
    win[r[0]] = { s: Date.parse(r[2] + 'T00:00:00Z'), e: Date.parse(r[3] + 'T00:00:00Z'), name: r[1] };
  });
  var te = db.exec('SELECT task_id, guid FROM task_elements');
  var byTask = {};
  (te.length ? te[0].values : []).forEach(function (r) { (byTask[r[0]] = byTask[r[0]] || []).push(r[1]); });
  var ins = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
  db.run('BEGIN');
  Object.keys(byTask).forEach(function (tid) {
    var w = win[tid]; if (!w) return;
    var guids = byTask[tid], n = guids.length, span = Math.max(1, w.e - w.s), step = span / n;
    guids.forEach(function (g, k) {
      var s = Math.round(w.s + k * step), e = Math.round(s + step);
      ins.run([s, 'ELEMENT_PLACE', JSON.stringify({ _end_ts: e, storey: 'L', phase: 'Architecture', task_id: tid }), '[]', g]);
    });
  });
  ins.free();
  db.run('COMMIT');

  // Bars from the REAL model, trim included.
  var opsRows = db.exec("SELECT id, timestamp, op_type, parameters, output_guid FROM kernel_ops WHERE op_type='ELEMENT_PLACE' ORDER BY timestamp");
  var ops = opsRows[0].values.map(function (r) {
    var pj = JSON.parse(r[3]);
    return { id: r[0], start_ts: r[1], end_ts: pj._end_ts, op_type: r[2], parameters: pj, output_guid: r[4] };
  });
  var idx = { ok: true, scheduleId: mres.scheduleId, tasks: {}, guidTask: {} };
  Object.keys(win).forEach(function (t) { idx.tasks[t] = { id: t, name: win[t].name, start: null, finish: null }; });
  Object.keys(byTask).forEach(function (t) { byTask[t].forEach(function (g) { idx.guidTask[g] = t; }); });
  var model = GanttModel.buildTasks(ops, idx, SEQUENCE_RULES);
  var bars = model.tasks.filter(function (b) { return b.taskId && b.guids && b.guids.length; });

  // How many ops does the TRIM leave outside their own bar? This is the population the audit counts.
  var outsideByBar = {};
  var opByGuid = {};
  ops.forEach(function (o) { opByGuid[o.output_guid] = o; });
  bars.forEach(function (b) {
    var n = 0;
    b.guids.forEach(function (g) {
      var o = opByGuid[g]; if (!o) return;
      if (o.start_ts < b.startTs - 1 || o.end_ts > b.endTs + 1) n++;
    });
    outsideByBar[b.taskId] = n;
  });
  var totalOutside = Object.keys(outsideByBar).reduce(function (a, k) { return a + outsideByBar[k]; }, 0);
  console.log('§W-COH_FIXTURE building=' + BUILDING + ' bars=' + bars.length + ' ops=' + ops.length +
    ' opsOutsideTheirTrimmedBar=' + totalOutside);

  // ── Drive the SHIPPED commit path and capture its own log line.
  var captured = [];
  var sliced = ['_tmBusyRecording', '_tmEditLocked', '_retimeSpan', 'retimeTaskElements', 'commitGanttDrag']
    .map(function (n) { return sliceNamed(txt, n); }).join('\n');
  var sandbox = {
    console: { log: function () { captured.push(Array.prototype.join.call(arguments, ' ')); }, warn: function () {} },
    JSON: JSON, Date: Date, Math: Math,
    _ganttTasks: bars, _taskIndex: { scheduleId: mres.scheduleId }, _lastEdit: null, _cursor: 0,
    _ops: ops,
    window: { ScheduleAuthor: ScheduleAuthor, performance: null },
    A: function () { return { db: db }; },
    document: { getElementById: function () { return null; } },
    invalidateGanttModel: function () {}, computeDays: function () {}, drawGanttMini: function () {},
    renderAtTime: function () {}, _tmResyncAfterRetime: function () {}, _tmAnnotateCpm: function () {},
    _tmPersistEdit: function () {}
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(sliced + '\nthis.__commit = commitGanttDrag;', sandbox);

  // Two real gestures on the bar with the MOST outliers — a move and a shrink. A shrink is the
  // dangerous one: it compresses the window an outlier is being remapped into, which is precisely
  // how a collapse-to-60s or an inversion would appear if _retimeSpan got it wrong.
  var target = bars.slice().sort(function (a, b) { return (outsideByBar[b.taskId] || 0) - (outsideByBar[a.taskId] || 0); })[0];
  var audits = [];
  [['move', 20], ['resizeR', -Math.max(1, Math.round(0.3 * (target.endTs - target.startTs) / 86400000))]].forEach(function (g) {
    captured.length = 0;
    sandbox.__commit(target, g[0], g[1]);
    var line = captured.filter(function (l) { return l.indexOf('§RETIME_OUTLIER_AUDIT') === 0; })[0] || '';
    var m = line.match(/outsideOldWindow=(\d+) collapsed60s=(\d+) inverted=(\d+)/);
    audits.push({ gesture: g[0] + ' ' + g[1] + 'd', line: line,
      outside: m ? +m[1] : -1, collapsed: m ? +m[2] : -1, inverted: m ? +m[3] : -1 });
  });
  audits.forEach(function (a) { console.log('§W-COH_AUDIT ' + a.gesture + ' → ' + (a.line || '(NO §RETIME_OUTLIER_AUDIT LINE)')); });

  check('G-COH-7 audit-line-is-emitted-on-every-commit',
    audits.every(function (a) { return a.outside >= 0; }),
    'a commit that stops logging §RETIME_OUTLIER_AUDIT silently removes the only signal these counters carry');

  check('G-COH-8 no-collapse-no-inversion-on-a-real-drag',
    audits.every(function (a) { return a.collapsed === 0 && a.inverted === 0; }),
    audits.map(function (a) { return a.gesture + ':collapsed=' + a.collapsed + ',inverted=' + a.inverted; }).join(' | ') +
    ' — collapse/inversion here is the §S7 edit-path defect');

  check('G-COH-9 RED-CONTROL-the-counters-were-actually-exercised',
    audits.some(function (a) { return a.outside > 0; }),
    'outsideOldWindow=' + audits.map(function (a) { return a.outside; }).join(',') +
    ' — with zero outliers G-COH-8 asserts nothing, because the counters only ever count ops that ' +
    'ride outside their trimmed bar');

  db.close();
  console.log('§W-COH RESULT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
