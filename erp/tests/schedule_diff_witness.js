// schedule_diff_witness.js — proves §4D_SCHEDULE_DIFF (viewer/schedule_diff.js) on the REAL Hospital
// model: matches the synthetic-but-grounded GW-Hospital P6 programme (tests/gen_foreign_schedule.js —
// real WBS/IFC-class vocabulary, real Hospital element counts drive the binding sidecar) against OUR
// own materializeDefault labor-rate x real-quantity estimate for the SAME building, and reports the
// variance — exactly the feature the user asked for ("our 4D schedule diff and show them their
// variance - ie correcting theirs!" — CPM_FLOAT_GAP.md).
//
// ⚠ No real (non-synthetic) P6/MSP export was obtained for this session (prompts/XER_REAL_FIXTURE_PROOF.md
// stays ⛔ BLOCKED — two of the three public-sample leads returned HTTP 521/500 when checked). This
// witness therefore runs against the SAME synthetic Hospital_GW_Programme fixture the rest of the
// foreign_schedule.js suite already treats as its demo/coverage fixture (real building, real element
// counts, synthetic activity DURATIONS/DATES only) — see gen_foreign_schedule.js header. Real-file
// calibration of the phase-matching vocabulary remains open, named here rather than silently dropped.
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
var DIFF = require(path.join(VIEWER, 'schedule_diff.js'));
global.ScheduleAuthor = SA;   // schedule_diff.js's SA() reads global.ScheduleAuthor (globalThis fallback)

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-DIFF PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-DIFF FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function read(f) { return fs.readFileSync(path.join(VIEWER, f), 'utf8'); }
// rates.js is a browser global-assigning script (no module.exports) — eval its rule/rate blocks the
// same way the other witnesses in this suite already do (foreign_compose_witness.js loadRates()).
function loadRates() {
  var t = read('rates.js');
  function block(m, endTok) { var s = t.indexOf(m); return t.slice(s, t.indexOf(endTok, s) + endTok.length); }
  var src = block('var RATES = {', '};') + '\n' +
    block('var LABOR_RATES = {', '};') + '\n' +
    block('var SEQUENCE_RULES = {', '};') + '\n' +
    block('var SEQUENCE_DEFAULT', ';') + '\n' +
    block('var SEQUENCE_NAME_OVERRIDES = [', '];');
  return (new Function(src + '\n return {RATES:RATES, LABOR_RATES:LABOR_RATES, ' +
    'SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES};'))();
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  if (!fs.existsSync(HOSPITAL_DB)) { console.log('§W-DIFF SKIP Hospital DB absent: ' + HOSPITAL_DB); process.exit(0); }
  var HOSP = new Uint8Array(fs.readFileSync(HOSPITAL_DB));
  var R = loadRates();
  global.SEQUENCE_RULES = R.SEQUENCE_RULES; global.LABOR_RATES = R.LABOR_RATES;
  global.SEQUENCE_DEFAULT = R.SEQUENCE_DEFAULT; global.SEQUENCE_NAME_OVERRIDES = R.SEQUENCE_NAME_OVERRIDES;
  global.RATES = R.RATES;

  // ── §W-DIFF-BASIC: XER path, unmatched activities honestly reported, not silently dropped ─────────
  var db1 = new SQL.Database(HOSP);
  var xerText = fs.readFileSync(path.join(FIX, 'Hospital_GW_Programme.xer'), 'utf8');
  var det1 = FS_.parseForeign(xerText, 'Hospital_GW_Programme.xer');
  check('parsed-xer', det1.format === 'XER' && det1.parsed.activities.length === 14, 'activities=' + det1.parsed.activities.length);
  var data1 = FS_.toScheduleData(det1.parsed, { scheduleId: 'GW-HOSP-XER' });
  var res1 = DIFF.computeScheduleDiff(db1, data1, { shadowScheduleId: 'SCH_DIFF_XER' });
  check('diff-ran-no-error', !res1.error, JSON.stringify(res1.error || 'ok'));
  check('diff-coverage-reported', res1.summary.theirActivities === 14,
    'theirActivities=' + res1.summary.theirActivities + ' matched=' + res1.summary.matchedActivities +
    ' unmatched=' + res1.summary.unmatchedActivities);
  check('diff-matched-most-activities', res1.summary.matchedActivities >= 10,
    'matched=' + res1.summary.matchedActivities + '/14 (coarse name/WBS matcher, real vocabulary — see §4D_DIFF_MATCH log above)');
  check('diff-produced-phase-rows', res1.phases.length >= 3, 'matchedPhases=' + res1.phases.length);
  // every row must trace to REAL numbers: ourDays from materializeDefault (>0, real labor math),
  // theirDays from the file's own start/finish window (>0, real dates) — never invented.
  var allReal = res1.phases.every(function (r) { return r.ourDays > 0 && r.theirDays >= 0 && r.flag && r.flagMsg; });
  check('diff-rows-trace-to-real-numbers', allReal, JSON.stringify(res1.phases.map(function (r) {
    return { phase: r.phase, ours: r.ourDays, theirs: r.theirDays, flag: r.flag };
  })));

  // ── §W-DIFF-XML-EQ: PMXML of the SAME plan produces the SAME diff verdicts as XER (format-agnostic) ──
  var db2 = new SQL.Database(HOSP);
  var pmxmlText = fs.readFileSync(path.join(FIX, 'Hospital_GW_Programme.xml'), 'utf8');
  var det2 = FS_.parseForeign(pmxmlText, 'Hospital_GW_Programme.xml');
  var data2 = FS_.toScheduleData(det2.parsed, { scheduleId: 'GW-HOSP-XML' });
  var res2 = DIFF.computeScheduleDiff(db2, data2, { shadowScheduleId: 'SCH_DIFF_XML' });
  var flags1 = res1.phases.map(function (r) { return r.phase + '=' + r.flag; }).sort().join(',');
  var flags2 = res2.phases.map(function (r) { return r.phase + '=' + r.flag; }).sort().join(',');
  check('diff-format-agnostic-xer-vs-pmxml', flags1 === flags2 && res1.phases.length === res2.phases.length,
    'xer[' + flags1 + '] vs pmxml[' + flags2 + ']');

  // ── §W-DIFF-MSPDI: MS Project reader path too (all 3 foreign_schedule.js formats covered) ─────────
  var db3 = new SQL.Database(HOSP);
  var mspText = fs.readFileSync(path.join(FIX, 'Hospital_GW_MSProject.xml'), 'utf8');
  var det3 = FS_.parseForeign(mspText, 'Hospital_GW_MSProject.xml');
  check('parsed-mspdi', det3.format === 'MSPDI', 'format=' + det3.format);
  var data3 = FS_.toScheduleData(det3.parsed, { scheduleId: 'GW-HOSP-MSP' });
  var res3 = DIFF.computeScheduleDiff(db3, data3, { shadowScheduleId: 'SCH_DIFF_MSP' });
  check('diff-mspdi-ran', !res3.error && res3.phases.length >= 3, 'matchedPhases=' + (res3.phases && res3.phases.length));

  // ── §W-DIFF-SENSITIVITY: an activity list artificially compressed to 20% of real duration must be
  // flagged 'optimistic' (proves the flag logic actually fires, not just always 'realistic') ─────────
  var db4 = new SQL.Database(HOSP);
  var compressed = JSON.parse(JSON.stringify(data1));
  compressed.tasks.forEach(function (t) {
    if (t.isSummary || !t.scheduleStart || !t.scheduleFinish) return;
    // shrink every activity's window to start..start+1 (near-zero duration) — an absurdly optimistic plan
    t.scheduleFinish = t.scheduleStart;
  });
  var res4 = DIFF.computeScheduleDiff(db4, compressed, { shadowScheduleId: 'SCH_DIFF_COMPRESSED' });
  var anyOptimistic = res4.phases.some(function (r) { return r.flag === 'optimistic'; });
  check('diff-flags-optimistic-plan', anyOptimistic, JSON.stringify(res4.phases.map(function (r) { return r.phase + '=' + r.flag; })));

  // ── §W-DIFF-SENSITIVITY-SLOW: an activity list artificially stretched 10x must flag 'slow' ─────────
  var db5 = new SQL.Database(HOSP);
  var stretched = JSON.parse(JSON.stringify(data1));
  stretched.tasks.forEach(function (t) {
    if (t.isSummary || !t.scheduleStart || !t.scheduleFinish) return;
    var s = Date.parse(t.scheduleStart + 'T00:00:00Z'), f = Date.parse(t.scheduleFinish + 'T00:00:00Z');
    var stretchedF = new Date(s + (f - s) * 10).toISOString().slice(0, 10);
    t.scheduleFinish = stretchedF;
  });
  var res5 = DIFF.computeScheduleDiff(db5, stretched, { shadowScheduleId: 'SCH_DIFF_STRETCHED' });
  var anySlow = res5.phases.some(function (r) { return r.flag === 'slow'; });
  check('diff-flags-slow-plan', anySlow, JSON.stringify(res5.phases.map(function (r) { return r.phase + '=' + r.flag; })));

  console.log('\n§W-DIFF SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-DIFF ERROR', e); process.exit(1); });
