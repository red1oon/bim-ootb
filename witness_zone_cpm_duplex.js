// witness_zone_cpm_duplex.js — 4D_SCHEDULE_PERFECTION.md gap #2 (multi-building validation).
// witness_zone_cpm.js proved materializeZones/computeCpm(fixedDates) on Terminal (48,428 elements,
// 22 real floor-ranks) and Hospital (63,415 elements) — both large. Neither is a SMALL building.
// Per WalkerDoctrine.md, SH/DX/SC-class buildings are a genuinely different regime. This runs the
// SAME proof shape against Duplex_extracted.db (1,193 elements, 5 storeys — the standing small-
// building fixture this project already uses everywhere else) on a SCRATCH COPY (never mutates the
// shared ~/bim-ootb/buildings/ fixture — CLAUDE.md worktree-hygiene rule).
// Unlike witness_zone_cpm.js, the zone-count bound here is NOT the large-building 15-200 P6-realistic
// range — a small building legitimately produces far fewer zones. The real claims under test:
// zone count is sane (not 1, not the full 1,193-element count), edges form a DAG, and
// computeCpm(fixedDates:true) still EXACTLY matches the real movie total — the same coherence
// guarantee, on a structurally different (few-storey, few-element) building.
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, 'viewer');
var DB_PATH = '/tmp/claude-1000/-home-red1-bim-compiler/6ecb6170-ccda-494f-9a59-8acfc118b0f4/scratchpad/Duplex_extracted_witness.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-ZONE-DX PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-ZONE-DX FAIL  ' + name + (detail ? '  ' + detail : '')); }
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

  var elCount = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];
  var storeys = db.exec("SELECT DISTINCT storey FROM elements_meta WHERE storey NOT LIKE 'Unknown'")[0].values.map(function (r) { return r[0]; });
  console.log('§W-ZONE-DX FIXTURE elements=' + elCount + ' storeys=' + storeys.length + ' [' + storeys.join(',') + ']');

  var res = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES, {
    start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate
  });
  check('materializeZones-ok', res.ok === true, JSON.stringify(res));
  // Small-building bound: sane means more than a single monolithic zone, and nowhere near a
  // per-element (1,193) blowup — NOT the large-building 15-200 P6-realistic range.
  check('zone-count-sane-for-small-building', res.zoneCount > 1 && res.zoneCount < elCount,
    'zones=' + res.zoneCount + ' elements=' + elCount);
  console.log('§W-ZONE-DX zones=' + res.zoneCount + ' edges=' + res.edgeCount + ' totalDays=' + res.totalDays);

  var zr = db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
  check('tasks-persisted', zr[0].values[0][0] === res.zoneCount, 'persisted=' + zr[0].values[0][0]);

  var er = db.exec('SELECT COUNT(*) FROM task_sequences');
  check('edges-persisted', er[0].values[0][0] === res.edgeCount, 'persisted=' + er[0].values[0][0]);

  // fixedDates:true must reproduce the real movie's total EXACTLY — same coherence guarantee proven
  // on Terminal/Hospital, now checked on a structurally different (few-storey) building.
  var cpm = ScheduleAuthor.computeCpm(db, 'SCH_AUTHORED', { start: '2026-01-01', fixedDates: true });
  check('cpm-fixed-no-error', !cpm.error, JSON.stringify(cpm.error || null));
  check('cpm-fixed-matches-real-movie-exactly', cpm.projectDuration === res.totalDays,
    'cpm(fixedDates)=' + cpm.projectDuration + ' real-movie-totalDays=' + res.totalDays);
  console.log('§W-ZONE-DX FIXED cpm-projectDuration=' + cpm.projectDuration + ' real-movie-totalDays=' + res.totalDays);

  // DAG check: computeCpm itself bails with error:'cycle' if the topo sort can't consume every
  // task — reuse that as the DAG proof rather than re-implementing cycle detection here.
  check('edges-form-a-dag', cpm.error !== 'cycle', 'error=' + (cpm.error || null));

  check('cpm-has-critical-path', (cpm.criticalIds || []).length > 0, 'critical=' + (cpm.criticalIds || []).length);

  var badWindow = 0;
  var tr = db.exec("SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE schedule_id='SCH_AUTHORED' AND (is_summary IS NULL OR is_summary=0)");
  tr[0].values.forEach(function (row) { if (!row[1] || !row[2] || row[2] < row[1]) badWindow++; });
  check('all-zones-have-valid-window', badWindow === 0, 'invalid=' + badWindow);

  console.log('§W-ZONE-DX SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
