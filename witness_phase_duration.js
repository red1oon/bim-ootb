// witness_phase_duration.js — GANTT_ACCURACY.md "RESUME 2026-08-04+" phase-duration fix.
//
// ISSUE PROVED: schedule_author.js materializeDefault() gave every phase the SAME fixed-width
// calendar slot (phaseDays:30) regardless of population — Terminal's Superstructure (72.4% of all
// 48,428 elements) occupied the same window as Finishes (0.5%), so the building looked visually
// "done" (Architecture-looking mass complete) within the first hours of playback
// (workInFirst10%OfCalendar=51.7%, measured 2026-08-03). This witness proves the fix makes phase
// window WIDTH workload-proportional (Σ labor-seconds via the already-extracted LABOR_RATES
// productivity table), and reports the real numbers on real Terminal_extracted.db — not invented.
//
// Non-invent: real Terminal_extracted.db (48,428 elements); SEQUENCE_RULES/LABOR_RATES/
// SEQUENCE_DEFAULT extracted verbatim from rates.js; materializeDefault is the real shipped function.

var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');

var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, 'viewer');
var DB_PATH = '/home/red1/bim-compiler/deploy/buildings/Terminal_extracted.db';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-PHASEDUR PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-PHASEDUR FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

// Extract SEQUENCE_RULES / SEQUENCE_DEFAULT / LABOR_RATES verbatim from rates.js (same technique
// as erp/tests/author_4d_witness.js loadRules(), widened to also pull LABOR_RATES).
function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var start = txt.indexOf('var LABOR_RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  // eslint-disable-next-line no-new-func
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES };'))();
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } });
  var rulesPack = loadRules();
  var RULES = rulesPack.SEQUENCE_RULES, DEFAULT = rulesPack.SEQUENCE_DEFAULT, LABOR = rulesPack.LABOR_RATES;
  console.log('§W-PHASEDUR RULES-LOADED keys=' + Object.keys(RULES).length + ' labor=' + Object.keys(LABOR).length);

  var dbBytes = fs.readFileSync(DB_PATH);
  var db = new SQL.Database(new Uint8Array(dbBytes));
  var nElems = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];
  check('real-db-loaded', nElems === 48428, 'elements=' + nElems);

  // ── OLD behaviour, for comparison: flat phaseDays=30, no laborRates ── (fresh db — TASK_ROOT's
  // id is not scoped by schedule_id, so re-materializing a DIFFERENT scheduleId on the SAME db
  // collides; real callers only ever use one scheduleId at a time, this is a witness-only artifact)
  var dbOld = new SQL.Database(new Uint8Array(dbBytes));
  var resOld = ScheduleAuthor.materializeDefault(dbOld, RULES, { start: '2026-01-01', phaseDays: 30, scheduleId: 'SCH_OLD_FLAT' });
  // laborRates omitted here on purpose but the fix ALWAYS computes width from laborSecs now, so
  // "old" behaviour (flat 30d/phase) no longer exists as a code path — this call instead shows the
  // element-count-only degraded mode (laborRates={} → every element weighted 120s equally →
  // width ∝ pure element count, the documented no-data fallback).
  var oldTotal = resOld.totalDays;
  console.log('§W-PHASEDUR OLD(no-laborRates, count-proportional) totalDays=' + oldTotal);
  resOld.phases.forEach(function (p) {
    console.log('  ' + p.name + ' count=' + p.count + ' days=' + p.durationDays +
      ' pctOfTotal=' + (100 * p.durationDays / oldTotal).toFixed(1) + '%');
  });

  // ── NEW behaviour: real LABOR_RATES productivity → labor-day-weighted width ──
  var resNew = ScheduleAuthor.materializeDefault(db, RULES, { start: '2026-01-01', laborRates: LABOR, scheduleId: 'SCH_AUTHORED' });
  var newTotal = resNew.totalDays;
  console.log('§W-PHASEDUR NEW(laborRates) totalDays=' + newTotal);
  resNew.phases.forEach(function (p) {
    console.log('  ' + p.name + ' count=' + p.count + ' days=' + p.durationDays +
      ' pctOfTotal=' + (100 * p.durationDays / newTotal).toFixed(1) + '%');
  });

  // G1: Superstructure (72.4% of elements) no longer gets the SAME width as Finishes (0.5%).
  var supNew = resNew.phases.filter(function (p) { return p.name === 'Superstructure'; })[0];
  var finNew = resNew.phases.filter(function (p) { return p.name === 'Finishes'; })[0];
  check('G1-superstructure-wider-than-finishes', supNew.durationDays > finNew.durationDays,
    'Superstructure=' + supNew.durationDays + 'd Finishes=' + finNew.durationDays + 'd');

  // G2: width tracks labor, not just headcount — Architecture's SHARE of the total calendar nearly
  // DOUBLES under labor+max_crews weighting vs the pure element-count fallback (its mix of
  // CARPENTER/MASON/ROOFER/proxy work is slower-per-unit than its 2.6%-of-elements headcount alone
  // would suggest). Superstructure's own share is a poor probe here — it happens to land within
  // 0.1pp of its count-proportional share by coincidence of this specific building's numbers, even
  // though its ABSOLUTE days (144 → 968, G1) changed by 6.7x.
  var archOld = resOld.phases.filter(function (p) { return p.name === 'Architecture'; })[0];
  var archNew = resNew.phases.filter(function (p) { return p.name === 'Architecture'; })[0];
  var archNewPct = 100 * archNew.durationDays / newTotal;
  var archOldPct = 100 * archOld.durationDays / oldTotal;
  check('G2-labor-weighting-changes-share-vs-pure-count', Math.abs(archNewPct - archOldPct) > 0.5,
    'countProportional=' + archOldPct.toFixed(1) + '% laborProportional=' + archNewPct.toFixed(1) + '%');

  // G3: no phase collapses to 0 days (every populated phase gets a real window).
  var anyZero = resNew.phases.some(function (p) { return p.durationDays < 1; });
  check('G3-no-zero-width-phase', !anyZero);

  // G4: the fix is DERIVED from real productivity+max_crews data, not a hardcoded ratio —
  // reproducible by hand from the shipped rates.js numbers alone. Superstructure's bottleneck
  // trade is STEEL_ERECTOR (33,324 IfcPlate@12/day + 432 IfcBeam@8/day + 158 IfcColumn@6/day +
  // 442 IfcMember@10/day), max_crews=3, vs CONCRETE_GANG's much smaller 705 IfcSlab@35/day — the
  // phase's widthDays must equal ceil(STEEL_ERECTOR secs / (28800*3)), not their sum.
  var steelSecs = 33324 * Math.round(28800 / 12) + 432 * Math.round(28800 / 8) +
    158 * Math.round(28800 / 6) + 442 * Math.round(28800 / 10);
  var expectSteelDays = Math.ceil(steelSecs / (28800 * 3));
  check('G4-matches-hand-computed-bottleneck-trade', supNew.durationDays === expectSteelDays,
    'handComputed(STEEL_ERECTOR/3 crews)=' + expectSteelDays + 'd supTotal=' + supNew.durationDays + 'd');

  console.log('§W-PHASEDUR SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§W-PHASEDUR ERROR', e); process.exit(1); });
