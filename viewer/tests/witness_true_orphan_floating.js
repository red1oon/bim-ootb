// witness_true_orphan_floating.js — §TRUE_ORPHAN_FLOATING: an element with NOTHING physically below
// it, anywhere in its footprint, at any height — the "floating blue slab, isolated near the skyline"
// class of defect (user, 2026-09-11, watching an HHS MaxQ buildup bake: a teal IfcBuildingElementProxy
// disconnected from the building, nothing built under it). Spec: bim-compiler prompts/
// GANTT_ACCURACY.md §SUPPORT_ORPHAN (this witness productionizes that audit's `none-below-at-all`
// measure, the one population in that spec that is NOT dominated by ordinary ceiling-hung MEP —
// see bim-compiler prompts/4D_MODEL_INTEGRITY.md §E: hung-in-a-room elements have a floor
// XY-overlapping them somewhere below; a TRUE orphan has no XY-overlapping element below it at ANY
// height, which is a much smaller and much more defect-like population, 0.46% fleet-wide).
//
// ⚠ DELIBERATELY NOT AN ORDERING/SCHEDULING CHANGE. This file only READS
// `ScheduleAuthor._buildScheduleElements` (pure, no side effects) and never calls
// `ScheduleGate.computeSchedule` or `auditFloating` — it does not touch, wrap, or depend on the
// scheduling engine's known-disagreeing floating judges (bim-compiler prompts/4D_MODEL_INTEGRITY.md
// §I.5e, "four judges"). It answers one narrower, engine-independent geometric question — "is there
// ANY physical element below this one in plan?" — so it cannot regress or interact with §4D_ROOF_
// LOAD_PATH/§4D_WALLS_BEFORE_ROOF/any support-pool classification. Pure audit, additive only.
//
// GENERIC BY CONSTRUCTION, not by building name: globs every `buildings/*_extracted.db` present, so
// a new IFC set dropped into that folder is covered with zero per-building code. The carrier pool is
// EVERY non-opening/non-space element (not a structural-class whitelist) — §E's own lesson ("a
// structural class whitelist read 438 curtain-wall glazing panels as load-bearing") applies just as
// much to a carrier-class whitelist, so this asks the class-blind version of the question instead:
// does ANYTHING sit below it, of any type.
//
// LOG CONTRACT (so a session never needs to eyeball a bake to find one of these again): every run
// prints, per building, the full identifying list of current true orphans — guid, ifc_class, storey,
// height above the building's own ground datum — sorted highest first (the reported symptom is
// always "near the skyline"). This is the evidence; nobody should need to watch a video to locate one.
//
// GATE: regression-only, against a committed baseline (`baselines/true_orphan_floating.json`),
// same split-data-from-code shape as `baselines/midair.json` (witness_midair_zero.js) — a re-lock
// is a data edit with a readable diff, and an eighth building never edits test code.
// A witness that fails every time a real cantilever/canopy exists (a legitimate true orphan) trains
// everyone to ignore it — CLAUDE.md's own "vacuous/scope-blind witness" warning. So this FAILS only
// when a building's count INCREASES past its last-known baseline (a NEW disconnected element
// appeared), and always prints the full list either way. A building with no baseline yet ESTABLISHES
// one and says so out loud (not a silent pass — CLAUDE.md PRIMAL LAW clause 4, no-op must be named).
//
// ⚠ NOT A DUPLICATE OF witness_midair_zero.js's W-MZ-4 "orphans" (`baselines/midair.json` current
// counts Terminal 25, Hospital 35, Duplex 1, HHS 36, Clinic 27, LTU_AHouse 865, JKR 1) — that judge
// asks "does this element TOUCH a structure/wall carrier within GAP below it" (a support-contact
// predicate, restricted to two classes). This one asks the strictly weaker, class-blind question
// "is there ANYTHING — any class — below it in plan, at ANY height, no matter how far" — the
// specific population GANTT_ACCURACY.md §SUPPORT_ORPHAN names `none-below-at-all` and measured as
// the one non-noisy signal (0.46% fleet-wide, vs 63% for the general orphan/floating measures).
// Genuinely different questions, kept separate deliberately (§I.5e's own precedent: "Copies 3 and 4
// deliberately NOT consolidated, reasons recorded" — same discipline applied here to a 5th).
'use strict';
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..');
// Absolute, not __dirname-relative — matches witness_support_invariant_all_buildings.js's own
// convention. Extracted DBs are large dev-machine-local fixtures (bim-compiler CLAUDE.md's
// DB-CHANGES rule: distributed via OCI, never git/LFS), so every worktree reads the ONE shared
// main-checkout copy instead of each needing its own multi-hundred-MB fixture set.
var BUILDINGS_DIR = '/home/red1/bim-ootb/buildings';
var BASELINE_PATH = path.join(__dirname, 'baselines', 'true_orphan_floating.json');

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));

function loadRules() {
  var txt = fs.readFileSync(path.join(VIEWER, 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  return (new Function(slice +
    '\n return { SEQUENCE_RULES: SEQUENCE_RULES, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (e) { return {}; }
}
function saveBaseline(b) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + '\n');
}

var CELL = 4, EPS = 0.05, GROUND_BAND = 1.0;
function cellsOf(e) {
  var o = [];
  for (var i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
    for (var j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
  return o;
}
function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }

// THE MEASURE — engine-independent, class-blind. Returns { total, ground, orphans: [rows] }.
function findTrueOrphans(elements) {
  var grid = {};
  elements.forEach(function (e, i) { cellsOf(e).forEach(function (c) { (grid[c] = grid[c] || []).push(i); }); });

  var sortedZ = elements.map(function (e) { return e.base_z; }).sort(function (a, b) { return a - b; });
  var GROUND = sortedZ[Math.floor(sortedZ.length * 0.01)];

  var orphans = [], groundedCount = 0;
  elements.forEach(function (T, i) {
    if (T.base_z - GROUND <= GROUND_BAND) { groundedCount++; return; } // legitimate DAG seed, not an orphan
    var mark = {}, hasCarrier = false;
    var cells = cellsOf(T);
    for (var c = 0; c < cells.length && !hasCarrier; c++) {
      var bucket = grid[cells[c]] || [];
      for (var k = 0; k < bucket.length; k++) {
        var j = bucket[k];
        if (j === i || mark[j]) continue;
        mark[j] = 1;
        var S = elements[j];
        if (S.base_z < T.base_z - EPS && overlap(S, T)) { hasCarrier = true; break; }
      }
    }
    if (!hasCarrier) orphans.push({
      guid: T.guid, cls: T.cls, storey: T.storey,
      base_z: T.base_z, heightAboveGround: +(T.base_z - GROUND).toFixed(2)
    });
  });
  orphans.sort(function (a, b) { return b.heightAboveGround - a.heightAboveGround; });
  return { total: elements.length, ground: GROUND, groundedCount: groundedCount, orphans: orphans };
}

initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIST, f); } }).then(function (SQL) {
  var rules = loadRules(); // ONE rules module, reused verbatim for every building — no per-building tuning
  var baseline = loadBaseline(), baselineChanged = false;

  var dbFiles = fs.existsSync(BUILDINGS_DIR)
    ? fs.readdirSync(BUILDINGS_DIR).filter(function (f) { return /_extracted\.db$/.test(f); })
    : [];

  var pass = 0, fail = 0, ran = 0;
  function ok(label, detail) { pass++; console.log('  PASS ' + label + (detail ? ' — ' + detail : '')); }
  function bad(label, detail) { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }

  if (dbFiles.length === 0) {
    bad('population-nonempty', 'no buildings/*_extracted.db found — closes §W-EMPTY-POP');
  }

  dbFiles.forEach(function (file) {
    var name = file.replace(/_extracted\.db$/, '');
    var db = new SQL.Database(fs.readFileSync(path.join(BUILDINGS_DIR, file)));
    var elements = ScheduleAuthor._buildScheduleElements(db, rules.SEQUENCE_RULES, {
      laborRates: rules.LABOR_RATES, rates: rules.RATES
    });
    if (!elements.length) { bad(name + '-elements-extracted', 'elements=0'); return; }
    ran += elements.length;

    var m = findTrueOrphans(elements);
    var n = m.orphans.length;
    var prior = baseline[name];

    console.log('§TRUE_ORPHAN_FLOATING ' + name + ' total=' + m.total +
      ' groundZ=' + m.ground.toFixed(2) + 'm groundedExempt=' + m.groundedCount +
      ' trueOrphan=' + n + ' (' + (100 * n / m.total).toFixed(2) + '%)' +
      ' baseline=' + (prior == null ? 'NONE' : prior));

    m.orphans.forEach(function (o) {
      console.log('§TRUE_ORPHAN_FLOATING ' + name + ' ELEMENT guid=' + o.guid + ' class=' + o.cls +
        ' storey="' + o.storey + '" heightAboveGround=' + o.heightAboveGround + 'm');
    });

    if (prior == null) {
      ok(name + '-baseline-established', 'trueOrphan=' + n + ' (no prior baseline — recorded, not silently passed)');
      baseline[name] = n; baselineChanged = true;
    } else if (n > prior) {
      bad(name + '-no-new-true-orphans', 'trueOrphan=' + n + ' > baseline=' + prior + ' — NEW disconnected element(s), see §TRUE_ORPHAN_FLOATING ELEMENT lines above');
    } else {
      ok(name + '-no-new-true-orphans', 'trueOrphan=' + n + ' <= baseline=' + prior + (n < prior ? ' (improved — baseline NOT auto-lowered, update it deliberately)' : ''));
    }
  });

  // SELF-CHECK — proves the detector can actually detect (§W-REDCONTROL spirit): take the last
  // building's real population, inject one synthetic element far outside every existing footprint
  // (guaranteed zero XY overlap with anything, so it MUST have no carrier), and confirm it is found.
  if (dbFiles.length) {
    var lastFile = dbFiles[dbFiles.length - 1];
    var db2 = new SQL.Database(fs.readFileSync(path.join(BUILDINGS_DIR, lastFile)));
    var real = ScheduleAuthor._buildScheduleElements(db2, rules.SEQUENCE_RULES, {
      laborRates: rules.LABOR_RATES, rates: rules.RATES
    });
    var maxX = Math.max.apply(null, real.map(function (e) { return e.x1; }));
    var maxTop = Math.max.apply(null, real.map(function (e) { return e.top_z; }));
    var planted = { guid: '__SELFCHECK_PLANTED_ORPHAN__', cls: 'IfcBuildingElementProxy', storey: '_TEST',
      base_z: maxTop + 50, top_z: maxTop + 51, x0: maxX + 1000, x1: maxX + 1001, y0: 0, y1: 1 };
    var withPlant = findTrueOrphans(real.concat([planted]));
    var found = withPlant.orphans.some(function (o) { return o.guid === planted.guid; });
    if (found) ok('selfcheck-detector-fires-on-planted-orphan', 'the planted disconnected element on ' + lastFile + ' was found');
    else bad('selfcheck-detector-fires-on-planted-orphan', 'planted element was NOT flagged — detector cannot fail, this witness is not trustworthy');
  }

  if (baselineChanged) saveBaseline(baseline);

  console.log('§WITNESS_TRUE_ORPHAN_FLOATING pass=' + pass + ' fail=' + fail + ' ran=' + ran);
  process.exitCode = fail ? 1 : 0;
});
