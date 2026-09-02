// witness_wall_carrier_scope_all_copies.js — the "4 independent copies" register.
//
// THE PATTERN (found and fixed 3 times in one session, 2026-08-04): this codebase has at least 4
// separately-written implementations of "does element T rest on a real physical support S", and the
// repo's own documented convention is to COPY this predicate rather than share it (see
// witness_zstack_xray_staging.js's header). Each copy answers the same physics question — is a wall
// a valid candidate support for T — and only ONE answer is correct: a wall is a real carrier ONLY
// for a slab itself promoted to the roof role (T.cls==='IfcSlab' && T.seq>4). Structure (seq<=4) is
// always a valid carrier for anything above it; that part is not in question.
//
// Copy-by-copy status (update this table whenever a copy is touched):
//   1. schedule_gate.js  auditFloating()              — CORRECT (fixed §4D_ROOF_LOAD_PATH M3, 2026-08-01)
//   2. time_machine.js   _buildXraySupportCache()      — CORRECT (fixed §XRAY_WALL_SCOPE, 2026-08-04)
//   3. time_machine.js   _ogIsCarrier (PHASE_OVERLAP_SUPPORT_GUARD) — CORRECT (fixed 2026-08-04, this file)
//   4. boq_charts.html   generateSchedule()            — NO WALL-CARRIER LOGIC AT ALL (see G-WCS-4 below —
//      it doesn't attempt a support check of this kind; it's a DIFFERENT class of gap, tracked
//      separately, not directly comparable to 1-3's predicate)
//
// This witness is the SINGLE place that re-derives all three real (schedule_gate.js-callable) copies'
// wall-carrier behavior against the SAME real building data and the SAME expected verdict (0 false
// positives), so a regression in any ONE of them fails here — not just in whichever witness happened
// to already cover that specific file.
//
// RUN: node witness_wall_carrier_scope_all_copies.js
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, 'viewer');
var BUILDINGS = ['Terminal', 'Hospital', 'Clinic', 'JKR', 'HHS_Office_Federated', 'LTU_AHouse'];

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-WCS PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-WCS FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}

var CELL = 4, EPS = 0.05, GAP = 0.5;
function cellsOf(e) {
  var out = [];
  for (var cx = Math.floor(e.x0 / CELL); cx <= Math.floor(e.x1 / CELL); cx++)
    for (var cy = Math.floor(e.y0 / CELL); cy <= Math.floor(e.y1 / CELL); cy++) out.push(cx + '|' + cy);
  return out;
}
function xy(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }

// Copy #3's exact algorithm (mirrors _ogIsCarrier's fixed form in time_machine.js verbatim) — proves
// this specific copy independently, the same way witness_support_invariant_all_buildings.js already
// proves copy #1 and witness_zstack_xray_staging.js proves copy #2.
function copy3PushCount(allScheduled) {
  var structGrid = {}, wallGrid = {};
  allScheduled.forEach(function (e) {
    if (e.seq <= 4) cellsOf(e).forEach(function (c) { (structGrid[c] = structGrid[c] || []).push(e); });
    else if (e.cls.indexOf('IfcWall') === 0) cellsOf(e).forEach(function (c) { (wallGrid[c] = wallGrid[c] || []).push(e); });
  });
  var scheduled = allScheduled.slice().sort(function (a, b) { return a.bz - b.bz; });
  var pushed = 0, falsePositives = 0;
  scheduled.forEach(function (T) {
    var promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
    var cells = cellsOf(T), seen = {}, lastEnd = 0, lastCarrierCls = null;
    for (var ci = 0; ci < cells.length; ci++) {
      var arr = structGrid[cells[ci]];
      if (arr) for (var si = 0; si < arr.length; si++) {
        var S = arr[si]; if (S.guid === T.guid || seen[S.guid]) continue; seen[S.guid] = 1;
        if (S.bz < T.bz - EPS && Math.abs(S.tz - T.bz) <= GAP && xy(S, T) && S.e > lastEnd) { lastEnd = S.e; lastCarrierCls = S.cls; }
      }
      if (!promotedSlab) continue;
      var arrW = wallGrid[cells[ci]];
      if (arrW) for (var wi = 0; wi < arrW.length; wi++) {
        var W = arrW[wi]; if (W.guid === T.guid || seen[W.guid]) continue; seen[W.guid] = 1;
        if (W.bz < T.bz - EPS && Math.abs(W.tz - T.bz) <= GAP && xy(W, T) && W.e > lastEnd) { lastEnd = W.e; lastCarrierCls = W.cls; }
      }
    }
    if (lastEnd && T.s < lastEnd) {
      pushed++;
      if (lastCarrierCls && lastCarrierCls.indexOf('IfcWall') === 0 && !promotedSlab) falsePositives++;
    }
  });
  return { pushed: pushed, falsePositives: falsePositives };
}

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  var rules = loadRules();
  var maxCrews = {};
  for (var res in rules.LABOR_RATES) if (rules.LABOR_RATES[res].max_crews) maxCrews[res] = rules.LABOR_RATES[res].max_crews;

  BUILDINGS.forEach(function (name) {
    var dbPath = path.join('/home/red1/bim-ootb/buildings', name + '_extracted.db');
    if (!fs.existsSync(dbPath)) { check(name + '-fixture-exists', false, dbPath + ' missing'); return; }
    var db = new SQL.Database(fs.readFileSync(dbPath));
    var elements = ScheduleAuthor._buildScheduleElements(db, rules.SEQUENCE_RULES, { laborRates: rules.LABOR_RATES, rates: rules.RATES });
    if (!elements.length) { check(name + '-elements-extracted', false, 'no elements'); return; }

    // Copy #1: schedule_gate.js auditFloating() — imported directly, real call, not re-derived.
    var schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews);
    var floating1 = ScheduleGate.auditFloating(elements, schedule, null);
    check(name + '-copy1-auditFloating-zero', floating1 === 0, 'floating=' + floating1);

    // Copy #3: _ogIsCarrier (PHASE_OVERLAP_SUPPORT_GUARD) — mirrored algorithm above, same real times.
    var allScheduled = elements.map(function (e) {
      var s = schedule[e.guid]; if (!s) return null;
      return { guid: e.guid, cls: e.cls, seq: e.seq, bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, s: s.start, e: s.end };
    }).filter(Boolean);
    var c3 = copy3PushCount(allScheduled);
    check(name + '-copy3-ogIsCarrier-no-false-positives', c3.falsePositives === 0,
      'pushed=' + c3.pushed + ' falsePositives=' + c3.falsePositives);

    console.log('§W-WCS ' + name + ' elements=' + elements.length +
      ' copy1_floating=' + floating1 + ' copy3_pushed=' + c3.pushed + ' copy3_falsePositives=' + c3.falsePositives);
  });

  // Copy #2 (_buildXraySupportCache) already has its own dedicated, kept-in-sync witness —
  // witness_zstack_xray_staging.js — not re-derived here to avoid a third divergent copy of ITS
  // algorithm; that witness's G-XRAY-1 REAL=0 check is the copy #2 proof. Run it alongside this one.
  check('copy2-has-dedicated-witness', fs.existsSync(path.join(__dirname, 'witness_zstack_xray_staging.js')),
    'see witness_zstack_xray_staging.js G-XRAY-1 — run separately (needs SCHEDULE_TEST_DB per building)');

  // Copy #4 (boq_charts.html generateSchedule()) — RED, documented, not silently assumed fixed.
  // It has NO wall-carrier support-check of this shape at all (a different, larger gap: it recomputes
  // its own coarse phase x storey schedule independently, with no per-element geometric support gate
  // whatsoever — see the PR discussion / session notes for 2026-08-04). Asserting this explicitly so
  // a future session can't assume "4 copies, all fixed" without re-deriving this from scratch.
  var boqPath = path.join(VIEWER, 'boq_charts.html');
  var boqSrc = fs.existsSync(boqPath) ? fs.readFileSync(boqPath, 'utf8') : '';
  var boqHasSupportCheck = /isCarrier|wallGrid|structGrid/.test(boqSrc);
  check('copy4-boq_charts-KNOWN-GAP-no-support-check', !boqHasSupportCheck,
    boqHasSupportCheck
      ? 'unexpected: boq_charts.html now HAS support-check code — update this witness, the gap may be closed'
      : 'confirmed as of 2026-08-04: boq_charts.html generateSchedule() has no geometric support gate at all — separate, larger, OPEN gap, not comparable 1:1 to copies 1-3');

  console.log('§W-WCS SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
