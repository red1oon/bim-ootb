// witness_gap1_task_sequences.js — CPM_FLOAT_GAP.md Gap 1 (phase-level).
// Proves materializeDefault now emits task_sequences SS edges from the already-computed
// §PHASE_OVERLAP_BAND lag, and that computeCpm is no longer blind to a generated (no-plan)
// schedule: real predecessor/successor edges → real ES/EF/LS/LF/float/is_critical, not the
// trivial all-ES=0 result a zero-edge graph gives Kahn's sort.
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, 'viewer');
var DB_PATH = '/home/red1/bim-compiler/deploy/dev/buildings/Terminal_extracted.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-GAP1 PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-GAP1 FAIL  ' + name + (detail ? '  ' + detail : '')); }
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
  var res = ScheduleAuthor.materializeDefault(db, rules.SEQUENCE_RULES, {
    start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES
  });
  check('materialize-produced-5-phases', res.phases.length === 5, 'phases=' + res.phases.length);

  var seq = db.exec('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences');
  var edgeCount = (seq.length && seq[0].values.length) ? seq[0].values.length : 0;
  check('task_sequences-has-N-1-edges', edgeCount === res.phases.length - 1, 'edges=' + edgeCount + ' expected=' + (res.phases.length - 1));

  var deps = ScheduleAuthor.listDependencies(db, res.scheduleId);
  check('listDependencies-sees-them', deps.length === edgeCount, 'listDependencies=' + deps.length);
  deps.forEach(function (d) { console.log('§W-GAP1 EDGE ' + d.predName + ' -> ' + d.succName + ' (' + d.type + ', lag=' + d.lag + 'd)'); });

  var cpm = ScheduleAuthor.computeCpm(db, res.scheduleId, { start: '2026-01-01' });
  check('cpm-no-error', !cpm.error, JSON.stringify(cpm.error || null));
  var nonZeroES = (cpm.tasks || []).filter(function (t) { return t.es > 0; }).length;
  check('cpm-not-trivial-all-ES-zero', nonZeroES > 0, 'tasksWithES>0=' + nonZeroES + '/' + (cpm.tasks || []).length);
  (cpm.tasks || []).forEach(function (t) { console.log('§W-GAP1 TASK ' + t.id + ' es=' + t.es + ' ef=' + t.ef + ' ls=' + t.ls + ' lf=' + t.lf + ' totalFloat=' + t.totalFloat + ' crit=' + t.critical); });
  check('cpm-reports-a-critical-path', (cpm.criticalIds || []).length > 0, 'critical=' + (cpm.criticalIds || []).length);
  console.log('§W-GAP1 CPM projectDuration=' + cpm.projectDuration + ' critical=' + (cpm.criticalIds || []).length + '/' + (cpm.tasks || []).length);

  // Re-run materializeDefault (idempotent rebuild) — edges must not duplicate/accumulate.
  ScheduleAuthor.materializeDefault(db, rules.SEQUENCE_RULES, { start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES });
  var seq2 = db.exec('SELECT COUNT(*) FROM task_sequences');
  check('idempotent-rebuild-no-duplicate-edges', seq2[0].values[0][0] === edgeCount, 'after-rebuild=' + seq2[0].values[0][0]);

  console.log('§W-GAP1 SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
