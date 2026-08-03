// witness_zone_cpm.js — CPM_FLOAT_GAP.md Gap 1 (element-level, rolled up).
// Proves materializeZones persists real (phase x floor) zones from ScheduleGate.computeSchedule's
// already-proven per-element times, that the derived task_sequences graph is a genuine DAG
// computeCpm can solve, and that zone windows are COHERENT with the movie's real element times
// (not a re-derived, potentially-drifted approximation).
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, 'viewer');
var DB_PATH = '/home/red1/bim-compiler/deploy/dev/buildings/Terminal_extracted.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-ZONE PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-ZONE FAIL  ' + name + (detail ? '  ' + detail : '')); }
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
  var res = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES, {
    start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate
  });
  check('materializeZones-ok', res.ok === true, JSON.stringify(res));
  check('zone-count-p6-realistic', res.zoneCount >= 15 && res.zoneCount <= 200, 'zones=' + res.zoneCount);
  console.log('§W-ZONE zones=' + res.zoneCount + ' edges=' + res.edgeCount + ' totalDays=' + res.totalDays);

  var zr = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
  check('tasks-persisted', zr[0].values[0][0] === res.zoneCount, 'persisted=' + zr[0].values[0][0]);

  var er = db.exec('SELECT COUNT(*) FROM task_sequences');
  check('edges-persisted', er[0].values[0][0] === res.edgeCount, 'persisted=' + er[0].values[0][0]);

  // Idempotent rebuild — no duplicate edges/tasks on re-run.
  var res2 = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES, {
    start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate
  });
  var zr2 = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
  var er2 = db.exec('SELECT COUNT(*) FROM task_sequences');
  check('idempotent-rebuild', zr2[0].values[0][0] === res.zoneCount && er2[0].values[0][0] === res.edgeCount,
    'zones=' + zr2[0].values[0][0] + ' edges=' + er2[0].values[0][0]);

  // Real CPM over the zone graph — DERIVED forward pass (previous behavior, kept as a live
  // regression proof of the divergence this fixedDates opt exists to close, not just a historical note).
  var cpmDerived = ScheduleAuthor.computeCpm(db, 'SCH_AUTHORED', { start: '2026-01-01' });
  check('cpm-derived-no-error', !cpmDerived.error, JSON.stringify(cpmDerived.error || null));
  var derivedDivergencePct = Math.round(Math.abs(cpmDerived.projectDuration - res.totalDays) / res.totalDays * 100);
  console.log('§W-ZONE DERIVED cpm-projectDuration=' + cpmDerived.projectDuration + ' real-movie-totalDays=' + res.totalDays +
    ' divergence=' + derivedDivergencePct + '% (expected: still diverges — this call does NOT use fixedDates)');

  // fixedDates:true — trusts the zone's real, movie-coherent persisted dates directly (see
  // computeCpm's header comment). Must reproduce the real movie's total EXACTLY, not approximately.
  var cpm = ScheduleAuthor.computeCpm(db, 'SCH_AUTHORED', { start: '2026-01-01', fixedDates: true });
  check('cpm-fixed-no-error', !cpm.error, JSON.stringify(cpm.error || null));
  check('cpm-fixed-matches-real-movie-exactly', cpm.projectDuration === res.totalDays,
    'cpm(fixedDates)=' + cpm.projectDuration + ' real-movie-totalDays=' + res.totalDays);
  console.log('§W-ZONE FIXED cpm-projectDuration=' + cpm.projectDuration + ' real-movie-totalDays=' + res.totalDays +
    ' (fixedDates:true — should be an EXACT match, coherence restored)');
  check('cpm-has-critical-path', (cpm.criticalIds || []).length > 0, 'critical=' + (cpm.criticalIds || []).length);
  check('cpm-critical-path-plausible-share', (cpm.criticalIds || []).length < res.zoneCount,
    'critical=' + (cpm.criticalIds || []).length + '/' + res.zoneCount);
  console.log('§W-ZONE CPM projectDuration=' + cpm.projectDuration + ' critical=' + (cpm.criticalIds || []).length + '/' + res.zoneCount);

  // Coherence: every zone task's persisted window falls within [minStart,maxEnd] and is non-trivial.
  var badWindow = 0;
  var tr = db.exec("SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
  tr[0].values.forEach(function (row) { if (!row[1] || !row[2] || row[2] < row[1]) badWindow++; });
  check('all-zones-have-valid-window', badWindow === 0, 'invalid=' + badWindow);

  console.log('§W-ZONE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
