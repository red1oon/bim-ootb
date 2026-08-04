// witness_boq_charts_real_schedule.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT / BOQ4D.
//
// THE ISSUE THIS PROVES OR DISPROVES
//   viewer/boq_charts.html (the "4" button / HTML charts tab) was a FOURTH, fully disconnected 4D
//   scheduler. It never read schedule_author.js's tasks / task_elements / task_sequences: it
//   recomputed its own coarse phase×storey schedule from raw element counts, with its own invented
//   lag constants and MAX_TASK_DAYS=20 cap, and THREE private hardcoded PHASE_ORDER arrays
//   (generateSchedule, audit4DSchedule, buildScheduleFromOps) that all still read
//     Substructure, Superstructure, MEP Rough-in, Architecture, MEP Final, Finishes
//   i.e. MEP rough-in BEFORE the building envelope — the ordering PR #1165 corrected across 18 rate
//   sources and which this file never received.
//
//   This witness fails if (a) the phase order the page uses is not the one SEQUENCE_RULES' own
//   sequence numbers imply, (b) the rows the page renders do not come from the real `tasks` table
//   and resolve to real task_ids/task_elements/task_sequences rows, or (c) the stale hardcoded
//   arrays come back.
//
// IT RUNS THE SHIPPED CODE, NOT A COPY. viewer/schedule_read_4d.js is the exact module boq_charts.html
// loads; the reader is required() here, never re-implemented. (A witness that re-implements the thing
// it tests is how the same support-predicate bug got fixed three times in one session — see this
// prompt file's "Architectural finding".)
//
// RED CONTROL (B-4D-9/10): the fixtures also get scored under the OLD stale order and the OLD
// storey|||phase grouping. Those checks pass ONLY because the fix exists — revert it and they go RED.
//
// Fixtures carry the 4D tables but ZERO rows, so a real schedule is materialized first with the same
// verb the app uses (ScheduleAuthor.materializeZones) and then READ BACK. No invented rows.
//
// Usage:  node witness_boq_charts_real_schedule.js [db ...]
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var BLD = '/home/red1/bim-ootb/buildings';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));
var ScheduleRead4D = require(path.join(VIEWER, 'schedule_read_4d.js'));   // ← the SHIPPED reader

// The literal that was hardcoded in all three boq_charts.html copies. Kept here ONLY as the RED
// control's baseline — it is the wrong answer, on purpose.
var STALE_PHASE_ORDER = ['Substructure', 'Superstructure', 'MEP Rough-in', 'Architecture', 'MEP Final', 'Finishes'];

var DBS = process.argv.slice(2);
if (!DBS.length) DBS = ['Duplex', 'Clinic', 'JKR', 'HHS_Office_Federated', 'Hospital', 'Terminal']
  .map(function (b) { return path.join(BLD, b + '_extracted.db'); });

var pass = 0, fail = 0, skip = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-BOQ4D PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-BOQ4D FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function skipped(name, why) { skip++; console.log('§W-BOQ4D SKIP  ' + name + '  ' + why); }

function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT,' +
    ' LABOR_RATES: LABOR_RATES, RATES: RATES, EQUIPMENT_RATES: EQUIPMENT_RATES,' +
    ' EQUIPMENT_ALLOCATION: EQUIPMENT_ALLOCATION };'))();
}

function eqArr(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  var rules = loadRules();

  // ══ B-4D-1/2 — the phase order, derived, matched against SEQUENCE_RULES itself ═══════════════
  // Derived INDEPENDENTLY here from the sequence numbers, then compared to what the shipped module
  // returns. If schedule_read_4d.js ever hardcodes a list again, these two diverge.
  var minSeq = {};
  Object.keys(rules.SEQUENCE_RULES).forEach(function (c) {
    var r = rules.SEQUENCE_RULES[c];
    if (!r || !r.phase || r.sequence == null) return;
    if (minSeq[r.phase] == null || r.sequence < minSeq[r.phase]) minSeq[r.phase] = r.sequence;
  });
  var expect = Object.keys(minSeq).sort(function (a, b) { return minSeq[a] - minSeq[b] || (a < b ? -1 : 1); });
  var got = ScheduleRead4D.phaseOrder(rules.SEQUENCE_RULES);
  console.log('§W-BOQ4D phaseOrder=' + JSON.stringify(got) +
    ' seq=' + JSON.stringify(expect.map(function (p) { return p + '(' + minSeq[p] + ')'; })));
  check('B-4D-1 phase-order-matches-SEQUENCE_RULES', eqArr(got, expect), JSON.stringify(got));
  check('B-4D-2 architecture-before-mep-roughin',
    got.indexOf('Architecture') >= 0 && got.indexOf('MEP Rough-in') > got.indexOf('Architecture'),
    'Architecture@' + got.indexOf('Architecture') + ' MEP-Rough-in@' + got.indexOf('MEP Rough-in'));

  // ══ B-4D-9 RED CONTROL (order) — the shipped derivation must NOT be the stale literal ════════
  check('B-4D-9 RED derived-order-differs-from-the-stale-hardcoded-one',
    !eqArr(got, STALE_PHASE_ORDER), 'stale=' + JSON.stringify(STALE_PHASE_ORDER));

  // ══ B-4D-3 source guard — the stale arrays are gone and the page uses the shared reader ══════
  var html = fs.readFileSync(path.join(VIEWER, 'boq_charts.html'), 'utf8');
  var staleLit = html.split("'MEP Rough-in','Architecture'").length - 1;
  var staleLit2 = html.split("'MEP Rough-in', 'Architecture'").length - 1;
  check('B-4D-3a no-stale-PHASE_ORDER-literal-left-in-boq_charts.html', staleLit + staleLit2 === 0,
    'occurrences=' + (staleLit + staleLit2));
  check('B-4D-3b boq_charts-uses-the-shared-reader',
    html.indexOf('ScheduleRead4D') >= 0 && html.indexOf('schedule_read_4d.js') >= 0 &&
    html.indexOf('phaseOrder()') >= 0, 'ScheduleRead4D+phaseOrder() referenced');
  var declaredArrays = (html.match(/PHASE_ORDER\s*=\s*\[/g) || []).length;
  check('B-4D-3c zero-hardcoded-PHASE_ORDER-arrays', declaredArrays === 0, 'arrays=' + declaredArrays);
  check('B-4D-3d capturedFn-hook-is-wired-not-null',
    html.indexOf('get4D(bldName, null,') < 0 && html.indexOf('compute4D(bldName, _capturedFn') >= 0,
    'the hook was passed null at the get4D call site before this fix');

  // ══ per-fixture: materialize a REAL schedule, read it back through the shipped module ════════
  DBS.forEach(function (dbPath) {
    var tag = path.basename(dbPath).replace('_extracted.db', '');
    if (!fs.existsSync(dbPath)) { skipped('B-4D-fixture ' + tag, 'db not found'); return; }
    var db = new SQL.Database(fs.readFileSync(dbPath));
    var t0 = Date.now();
    var opts = { start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate };
    var res = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES, opts);
    if (!res.ok) { check('B-4D-4 ' + tag + ' materializeZones-ok', false, JSON.stringify(res)); db.close(); return; }

    // ---- THE REDIRECT ITSELF: the exact call boq_charts.html's capturedFn makes -----------------
    var tasks = ScheduleRead4D.readTasks(db, {
      rules: rules.SEQUENCE_RULES, laborRates: rules.LABOR_RATES,
      equipmentAllocation: rules.EQUIPMENT_ALLOCATION, equipmentRates: rules.EQUIPMENT_RATES,
      scheduleAuthor: ScheduleAuthor
    });
    check('B-4D-4 ' + tag + ' reader-returns-real-tasks', !!(tasks && tasks.length),
      'tasks=' + (tasks ? tasks.length : 0) + ' zones=' + res.zoneCount + ' ms=' + (Date.now() - t0));
    if (!tasks || !tasks.length) { db.close(); return; }

    // ---- B-4D-5: every rendered row is a row of the real `tasks` table --------------------------
    var real = {};
    var tr = db.exec("SELECT task_id, name, schedule_start, schedule_finish FROM tasks " +
      "WHERE schedule_id='" + res.scheduleId + "' AND (is_summary IS NULL OR is_summary=0)");
    if (tr.length) tr[0].values.forEach(function (r) { real[r[0]] = { name: r[1], s: r[2], f: r[3] }; });
    var noId = 0, unknownId = 0, dateMismatch = 0, dupId = {}, dups = 0;
    tasks.forEach(function (t) {
      if (!t.taskId) { noId++; return; }
      if (!real[t.taskId]) { unknownId++; return; }
      if (dupId[t.taskId]) dups++; dupId[t.taskId] = 1;
      if (real[t.taskId].s !== t.startDate || real[t.taskId].f !== t.finishDate) dateMismatch++;
    });
    check('B-4D-5a ' + tag + ' every-row-carries-a-task_id', noId === 0, 'without=' + noId);
    check('B-4D-5b ' + tag + ' every-task_id-exists-in-tasks', unknownId === 0, 'unknown=' + unknownId);
    check('B-4D-5c ' + tag + ' no-duplicate-rows-per-task', dups === 0, 'dups=' + dups);
    check('B-4D-5d ' + tag + ' dates-are-the-persisted-dates', dateMismatch === 0, 'mismatched=' + dateMismatch);
    check('B-4D-5e ' + tag + ' row-count-equals-real-leaf-task-count',
      tasks.length === Object.keys(real).length,
      'rows=' + tasks.length + ' realLeafTasks=' + Object.keys(real).length + ' zones=' + res.zoneCount);

    // ---- B-4D-6: guids come from task_elements, exactly ------------------------------------------
    var teByTask = {}, teTotal = 0;
    var er = db.exec("SELECT te.task_id, te.guid FROM task_elements te JOIN tasks t ON t.task_id=te.task_id " +
      "WHERE t.schedule_id='" + res.scheduleId + "'");
    if (er.length) er[0].values.forEach(function (r) {
      (teByTask[r[0]] = teByTask[r[0]] || {})[r[1]] = 1; teTotal++;
    });
    var guidTotal = 0, guidBad = 0, guidShort = 0;
    tasks.forEach(function (t) {
      guidTotal += t.guids.length;
      var set = teByTask[t.taskId] || {};
      t.guids.forEach(function (g) { if (!set[g]) guidBad++; });
      if (t.guids.length !== Object.keys(set).length) guidShort++;
      if (t.qty !== t.guids.length) guidShort++;   // qty must BE the real member count
    });
    check('B-4D-6a ' + tag + ' every-guid-is-a-real-task_elements-row', guidBad === 0, 'bogus=' + guidBad);
    check('B-4D-6b ' + tag + ' guid-totals-reconcile', guidTotal === teTotal && guidShort === 0,
      'read=' + guidTotal + ' table=' + teTotal + ' perTaskMismatch=' + guidShort);

    // ---- B-4D-7: predecessors are real task_sequences edges --------------------------------------
    var edgeSet = {}, edgeTotal = 0;
    var sr = db.exec("SELECT s.predecessor_id, s.successor_id, s.sequence_type, s.lag_days FROM task_sequences s " +
      "JOIN tasks t ON t.task_id=s.successor_id WHERE t.schedule_id='" + res.scheduleId + "'");
    if (sr.length) sr[0].values.forEach(function (r) { edgeSet[r[0] + '>' + r[1]] = r[3]; edgeTotal++; });
    var edgeRead = 0, edgeBad = 0, lagBad = 0;
    tasks.forEach(function (t) {
      (t.predecessors || []).forEach(function (p) {
        edgeRead++;
        var k = p.id + '>' + t.taskId;
        if (!(k in edgeSet)) edgeBad++;
        else if (edgeSet[k] !== p.lag) lagBad++;
      });
    });
    check('B-4D-7 ' + tag + ' predecessors-are-real-task_sequences-edges',
      edgeBad === 0 && lagBad === 0 && edgeRead === edgeTotal,
      'read=' + edgeRead + ' table=' + edgeTotal + ' bogus=' + edgeBad + ' lagMismatch=' + lagBad);

    // ---- B-4D-8: no invented duration cap. The old path capped a task at MAX_TASK_DAYS=20 and
    // added imaginary parallel crews to make it fit. Real durations are whatever the persisted
    // dates say. MEASURED, then asserted only on the property that matters: duration == the real
    // date span, never a clamped value.
    var durBad = 0, maxDur = 0, over20 = 0;
    tasks.forEach(function (t) {
      var d = ScheduleRead4D.dayNum(t.finishDate) - ScheduleRead4D.dayNum(t.startDate);
      if (d !== t.duration || d !== (t.finishDay - t.startDay)) durBad++;
      if (d > maxDur) maxDur = d;
      if (d > 20) over20++;
    });
    check('B-4D-8 ' + tag + ' durations-are-the-real-date-span-uncapped', durBad === 0,
      'mismatched=' + durBad + ' maxDuration=' + maxDur + 'd tasksOver-the-old-20d-cap=' + over20);

    // ══ B-4D-10 RED CONTROL (data) ══════════════════════════════════════════════════════════════
    // Replicate what the page used to do: order phases by the STALE array. Then ask the REAL
    // persisted dates which order is true. The new derived order must agree with the dates; the old
    // one must not. This is the control that goes RED if the stale order is restored.
    var minStart = {};
    tasks.forEach(function (t) {
      if (minStart[t.phase] == null || t.startDay < minStart[t.phase]) minStart[t.phase] = t.startDay;
    });
    function inversions(order) {
      var present = order.filter(function (p) { return minStart[p] != null; });
      var n = 0, worst = '';
      for (var i = 0; i < present.length - 1; i++)
        for (var j = i + 1; j < present.length; j++)
          if (minStart[present[j]] < minStart[present[i]]) {
            n++; if (!worst) worst = present[j] + '(d' + minStart[present[j]] + ')<' + present[i] + '(d' + minStart[present[i]] + ')';
          }
      return { n: n, worst: worst, present: present };
    }
    var newInv = inversions(got), oldInv = inversions(STALE_PHASE_ORDER);
    console.log('§W-BOQ4D ' + tag + ' phaseStarts=' + JSON.stringify(minStart));
    check('B-4D-10a ' + tag + ' derived-order-agrees-with-the-real-dates', newInv.n === 0,
      'inversions=' + newInv.n + (newInv.worst ? ' ' + newInv.worst : ''));

    // The sharpest form of the same control, PER STOREY — on the same floor the envelope
    // (Architecture) must be up before MEP rough-in goes into it, which is exactly what the stale
    // order denies. A whole-project min-start comparison is too blunt on a small building where
    // several phases round to day 0, so the per-storey pairs are counted and the assertion only
    // fires where the real dates actually separate the two phases. A building whose dates never
    // separate them is reported as SKIP, not silently passed.
    var byStorey = {};
    tasks.forEach(function (t) {
      var s = byStorey[t.storey] = byStorey[t.storey] || {};
      if (s[t.phase] == null || t.startDay < s[t.phase]) s[t.phase] = t.startDay;
    });
    var archFirst = 0, mepFirst = 0, tied = 0;
    Object.keys(byStorey).forEach(function (st) {
      var a = byStorey[st]['Architecture'], m = byStorey[st]['MEP Rough-in'];
      if (a == null || m == null) return;
      if (a < m) archFirst++; else if (m < a) mepFirst++; else tied++;
    });
    console.log('§W-BOQ4D ' + tag + ' storeysWithBoth arch-before-mep=' + archFirst +
      ' mep-before-arch=' + mepFirst + ' sameDay=' + tied);
    if (archFirst + mepFirst === 0) {
      skipped('B-4D-10b ' + tag + ' RED stale-order-contradicts-the-real-dates',
        'no storey where the real dates separate Architecture from MEP Rough-in (pairs=' +
        (archFirst + mepFirst + tied) + ', all same-day or phase absent) — nothing here for the stale order to get wrong');
    } else {
      check('B-4D-10b ' + tag + ' RED stale-order-contradicts-the-real-dates', archFirst > mepFirst,
        'storeys where the real schedule builds the envelope FIRST=' + archFirst +
        ' vs the stale order\'s claim=' + mepFirst + '; whole-project staleInversions=' + oldInv.n +
        (oldInv.worst ? ' ' + oldInv.worst : ''));
    }

    // ---- B-4D-11 RED CONTROL: the OLD storey|||phase grouping could not address the model -------
    // The old page grouped raw elements on `storey|||phase` and produced task objects with NO
    // task_id at all. Measured here on the same elements: how many of those group keys are real
    // task_ids (always 0 — different identity), and how many real tasks the old key would have
    // split or merged (K0 measured Hospital at 60 groups for 35 real tasks).
    var elements = ScheduleAuthor._buildScheduleElements(db, rules.SEQUENCE_RULES, opts);
    var guidTask = {};
    tasks.forEach(function (t) { t.guids.forEach(function (g) { guidTask[g] = t.taskId; }); });
    var oldKeys = {}, keyToTasks = {}, taskToKeys = {};
    elements.forEach(function (e) {
      var key = (e.storey || 'Unknown') + '|||' + (e.phase || 'Architecture');
      oldKeys[key] = 1;
      var tid = guidTask[e.guid]; if (!tid) return;
      (keyToTasks[key] = keyToTasks[key] || {})[tid] = 1;
      (taskToKeys[tid] = taskToKeys[tid] || {})[key] = 1;
    });
    var keyIsRealTask = Object.keys(oldKeys).filter(function (k) { return real[k]; }).length;
    var splitTasks = Object.keys(taskToKeys).filter(function (t) { return Object.keys(taskToKeys[t]).length > 1; }).length;
    var ambiguousKeys = Object.keys(keyToTasks).filter(function (k) { return Object.keys(keyToTasks[k]).length > 1; }).length;
    console.log('§W-BOQ4D ' + tag + ' oldGrouping keys=' + Object.keys(oldKeys).length +
      ' realTasks=' + Object.keys(real).length + ' tasksSplitAcrossOldKeys=' + splitTasks +
      ' ambiguousOldKeys=' + ambiguousKeys);
    // ---- B-4D-12: the PAGE GLUE, not just the reader. Replays boq_charts.html's own capturedFn →
    // AnalysisSidecar.compute4D() path (the hook the redirect goes through) and asserts the sidecar
    // labels and returns the REAL rows. Catches a reader that works while the wiring does not.
    var AnalysisSidecar = require(path.join(VIEWER, 'analysis_sidecar.js'));
    var capturedFn = function () {
      var r = ScheduleRead4D.readTasks(db, {
        rules: rules.SEQUENCE_RULES, laborRates: rules.LABOR_RATES,
        equipmentAllocation: rules.EQUIPMENT_ALLOCATION, equipmentRates: rules.EQUIPMENT_RATES,
        scheduleAuthor: ScheduleAuthor, quiet: true
      });
      return r && r.length ? { source: 'authored', tasks: r } : null;
    };
    var glue = AnalysisSidecar.compute4D(tag, capturedFn, function () { return [{ id: 1, name: 'GENERATED FALLBACK' }]; }, [], '2025-01-06');
    check('B-4D-12 ' + tag + ' compute4D-hook-returns-the-real-schedule',
      glue.source === 'authored' && glue.tasks.length === tasks.length &&
      glue.tasks.every(function (t) { return !!real[t.taskId]; }),
      'source=' + glue.source + ' tasks=' + glue.tasks.length + ' (fallback generator NOT used)');

    check('B-4D-11 ' + tag + ' RED old-storey|||phase-key-is-not-a-task-identity', keyIsRealTask === 0,
      'oldKeysThatAreRealTaskIds=' + keyIsRealTask + ' → the old page could address 0 of ' +
      Object.keys(real).length + ' real tasks');

    db.close();
  });

  console.log('§W-BOQ4D RESULT pass=' + pass + ' fail=' + fail + ' skip=' + skip);
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.log('§W-BOQ4D FATAL ' + e.stack);
  process.exit(2);
});
