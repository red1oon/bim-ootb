// witness_support_invariant_all_buildings.js — "generic killer for any IFC" claim, first principles:
// nothing appears without support (schedule_gate.js §4D_ROOF_LOAD_PATH / auditFloating header:
// "0 ⇒ nothing floats over its physical support. Works for any class").
//
// This invariant was already proven 0 on Hospital + LTU_AHouse via a full-pipeline Puppeteer bake
// (witness_4d_roof_load_path.js G-RLP-6). This witness extends the SAME check — same engine call
// (ScheduleGate.computeSchedule + auditFloating), same SEQUENCE_RULES, zero per-building code — to
// every large building fixture available, the fast Node path witness_zone_cpm.js already uses
// (no browser/bake needed for this particular claim: auditFloating only needs geometry + the
// computed schedule, both available directly from the extracted DB).
//
// A generic engine claim can't rest on 2 buildings out of 6 available. Fixtures run here:
// Terminal, Hospital, Clinic, JKR, HHS_Office_Federated, LTU_AHouse (Duplex excluded — user ruling
// 2026-08-04: "DX too small for our engine", small/residential buildings are a different regime,
// see witness_zone_cpm_duplex.js instead).
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var BUILDINGS_DIR = '/home/red1/bim-ootb/buildings';

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));

var BUILDINGS = ['Terminal', 'Hospital', 'Clinic', 'JKR', 'HHS_Office_Federated', 'LTU_AHouse'];

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-SUPPORT-ALL PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-SUPPORT-ALL FAIL  ' + name + (detail ? '  ' + detail : '')); }
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
  var rules = loadRules();   // ONE rules module, reused verbatim for every building — no per-building tuning
  var maxCrews = {};
  for (var res in rules.LABOR_RATES) if (rules.LABOR_RATES[res].max_crews) maxCrews[res] = rules.LABOR_RATES[res].max_crews;

  BUILDINGS.forEach(function (name) {
    var dbPath = path.join(BUILDINGS_DIR, name + '_extracted.db');
    if (!fs.existsSync(dbPath)) { check(name + '-fixture-exists', false, dbPath + ' missing'); return; }
    var db = new SQL.Database(fs.readFileSync(dbPath));
    var elCount = db.exec('SELECT COUNT(*) FROM elements_meta')[0].values[0][0];

    var elements = ScheduleAuthor._buildScheduleElements(db, rules.SEQUENCE_RULES, {
      laborRates: rules.LABOR_RATES, rates: rules.RATES
    });
    check(name + '-elements-extracted', elements.length > 0, 'elements=' + elements.length + '/' + elCount);
    if (!elements.length) return;

    var schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews);
    var placed = Object.keys(schedule).length;
    check(name + '-nothing-dropped', placed === elements.length,
      'placed=' + placed + ' elements=' + elements.length);

    // THE claim: 0 ⇒ nothing floats over its physical support. No classFilter (null) — audits every
    // class against every candidate support, exactly as auditFloating's own header describes.
    var floating = ScheduleGate.auditFloating(elements, schedule, null);
    check(name + '-nothing-appears-without-support', floating === 0,
      'floating=' + floating + '/' + elements.length);

    console.log('§W-SUPPORT-ALL ' + name + ' elements=' + elements.length + ' placed=' + placed + ' floating=' + floating);
  });

  console.log('§W-SUPPORT-ALL SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
});
