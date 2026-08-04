// witness_geo_support_leak.js — headless, no browser, NO NAME/CLASS SPECIAL-CASING.
//
// v2 (2026-08-04): v1's detection was TOO LOOSE — "any real structure overlapping my XY footprint,
// at ANY Z" — which over-flagged JKR's 3 "Slab Edge" IfcBuildingElementProxy elements whose only
// overlapping structure is a real IfcSlab SITTING ABOVE them (slab base=80.85 = edge's own top=80.85,
// flush — an edge-trim/formwork detail poured at-or-before the slab, not after; nothing real exists
// BELOW these 3 at all). A thing above you is not what holds you up — same causal direction the real
// geoGate()/auditFloating() already use. v2 uses the IDENTICAL directional test as the shipped
// §GEO_SUPPORT_LEAK fix in schedule_gate.js's geoGate(): a real support is either (a) below my base
// (EPS tolerance) or (b) its ENTIRE vertical span is contained within my own [base_z,top_z] — the
// exact test that correctly catches the trucks (a real ramp genuinely contained within their oversized
// bbox) and correctly does NOT catch JKR's slab-edge case (the slab pokes above the edge's own top).
//
// ISSUE THIS PROVES: geoGate() used to test ONLY (a), missing real, geometrically-contained support
// (confirmed live+by-coordinate on Hospital's two "Semi Truck" IfcBuildingElementProxy elements: a
// real IfcSlab ramp + retaining walls sit directly in their footprint, fully contained within their
// own oversized vertical span, yet every real footing/slab/wall base in that footprint is above the
// truck's own base_z, so pre-fix geoGate found nothing and scheduled them at hour 0).
//
// No name/class special-casing — the leak signature is measured purely from real coordinates, using
// only the engine's existing seq<=4/>4 structural split (not invented here). No fallback, no guessed
// auto-correction — this only detects and reports. Exits non-zero (FAILS) if the signature exists
// anywhere in a building.
var fs = require('fs');
var path = require('path');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
var VIEWER = process.env.VIEWER_DIR || '/home/red1/bim-ootb/viewer';
var BUILDINGS_DIR = '/home/red1/bim-ootb/buildings';
var EPS = 0.05;   // m — matches schedule_gate.js's own EPS exactly, not a new constant

var ScheduleAuthor = require(path.join(VIEWER, 'schedule_author.js'));
var ScheduleGate = require(path.join(VIEWER, 'schedule_gate.js'));

var BUILDINGS = (process.argv[2] ? [process.argv[2]] : ['Duplex', 'Clinic', 'JKR', 'HHS_Office_Federated', 'Hospital', 'Terminal']);

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
  var maxCrews = {};
  for (var res in rules.LABOR_RATES) if (rules.LABOR_RATES[res].max_crews) maxCrews[res] = rules.LABOR_RATES[res].max_crews;

  var totalLeaks = 0, totalUngated = 0;

  BUILDINGS.forEach(function (name) {
    var dbPath = path.join(BUILDINGS_DIR, name + '_extracted.db');
    if (!fs.existsSync(dbPath)) { console.log('§GEO_LEAK SKIP ' + name + ' (fixture missing)'); return; }
    var db = new SQL.Database(fs.readFileSync(dbPath));

    var opts = { start: '2026-01-01', laborRates: rules.LABOR_RATES, rates: rules.RATES, scheduleGate: ScheduleGate };
    var mres = ScheduleAuthor.materializeZones(db, rules.SEQUENCE_RULES, opts);
    if (!mres.ok) { console.log('§GEO_LEAK SKIP ' + name + ' materializeZones failed: ' + JSON.stringify(mres)); return; }

    var elements = ScheduleAuthor._buildScheduleElements(db, rules.SEQUENCE_RULES, {
      laborRates: rules.LABOR_RATES, rates: rules.RATES
    });
    var schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews);
    var baseMs = 0;

    var struct = elements.filter(function (e) { return e.seq <= 4; });
    var nonst = elements.filter(function (e) { return e.seq > 4; });

    function xyOverlap(a, b) {
      return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    }
    // IDENTICAL directional test to the shipped geoGate() fix — below (EPS tolerance) OR fully
    // contained within my own vertical span. Not a looser or different heuristic than the fix itself.
    function isRealSupport(S, el) {
      var below = S.base_z < el.base_z - EPS;
      var contained = !below && S.base_z > el.base_z - EPS && S.top_z < el.top_z + EPS;
      return (below || contained) && xyOverlap(S, el);
    }

    var leaks = [], ungatedHere = 0;
    nonst.forEach(function (el) {
      var sch = schedule[el.guid];
      if (!sch) return;
      if (sch.start > baseMs) return;           // already gated correctly — not the signature we're checking
      ungatedHere++;
      var realSupportHere = struct.some(function (s) { return isRealSupport(s, el); });
      if (realSupportHere) {
        leaks.push({ guid: el.guid, cls: el.cls, seq: el.seq, storey: el.storey,
          base_z: el.base_z, top_z: el.top_z });
      }
    });
    totalUngated += ungatedHere;

    if (leaks.length) {
      console.log('\n§GEO_LEAK ' + name + ' ungated=' + ungatedHere + ' leaked=' + leaks.length +
        ' — real CONTACT support exists but geoGate found none:');
      leaks.slice(0, 10).forEach(function (l) {
        console.log('  guid=' + l.guid + ' cls=' + l.cls + ' seq=' + l.seq + ' storey=' + l.storey +
          ' base_z=' + l.base_z.toFixed(2) + ' top_z=' + l.top_z.toFixed(2));
      });
      if (leaks.length > 10) console.log('  ... +' + (leaks.length - 10) + ' more');
    } else {
      console.log('§GEO_LEAK ' + name + ' ungated=' + ungatedHere + ' leaked=0');
    }
    totalLeaks += leaks.length;
  });

  console.log('\n§GEO_LEAK_SUMMARY totalUngated=' + totalUngated + ' totalLeaked=' + totalLeaks);
  console.log(totalLeaks ? 'WITNESS FAIL — leak signature present, no fallback applied' : 'WITNESS PASS — signature absent');
  process.exit(totalLeaks ? 1 : 0);
}).catch(function (e) { console.error('§GEO_LEAK_ERROR', e); process.exit(1); });
