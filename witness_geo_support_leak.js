// witness_geo_support_leak.js — headless, no browser, NO NAME/CLASS SPECIAL-CASING.
//
// v3 (2026-08-11, 4D closure pass — root cause of the long-standing "pre-existing FAIL 10/7"):
// the 10-ungated/7-leaked FAIL this witness reported since before 2026-08-10 was measured against
// code this repo was NOT shipping, on two independent axes of rot:
//   (1) VIEWER_DIR defaulted to the ABSOLUTE shared checkout (/home/red1/bim-ootb/viewer), which
//       at measurement time was 118 commits behind origin/main — the witness never tested the
//       checkout it lives in. Re-run against current main: 10/7 collapsed to 2/2 with zero code
//       changes. Default is now THIS checkout's own viewer/ (env VIEWER_DIR still overrides).
//   (2) isRealSupport froze at v2's "contained anywhere in my span, co-based allowed" — but the
//       shipped geoGate deliberately moved twice since: §DEQ_V1 (2026-08-07) requires the contained
//       support's base STRICTLY above mine (antisymmetry — two co-based slabs otherwise "support"
//       each other), and §TM_GEO_ORDER_CYCLES/PR#1276 (2026-08-10) requires it to top in my LOWER
//       HALF (an upper-half neighbor rests ON me — the wide version closed 37,927 Terminal elements
//       into cycles). The final 2/2 "leaks" (Hospital 0KbYdy…bo9 wall: only candidates top in its
//       UPPER half at 171.13+ vs mid 169.32; 0WoET…Ltn proxy: only candidate co-based within EPS,
//       165.36 vs 165.34) are exactly the two exclusions — real "no support detectable" cases
//       (visible via §SUPPORT_UNCHECKED where big enough), NOT geoGate misses. v3 aligns the test
//       with the CURRENT shipped predicate so the witness again proves what it claims: "geoGate's
//       OWN rule says support exists here, yet the element scheduled ungated."
//
// v2 (2026-08-04): v1's detection was TOO LOOSE — "any real structure overlapping my XY footprint,
// at ANY Z" — which over-flagged JKR's 3 "Slab Edge" IfcBuildingElementProxy elements whose only
// overlapping structure is a real IfcSlab SITTING ABOVE them (slab base=80.85 = edge's own top=80.85,
// flush — an edge-trim/formwork detail poured at-or-before the slab, not after; nothing real exists
// BELOW these 3 at all). A thing above you is not what holds you up — same causal direction the real
// geoGate()/auditFloating() already use.
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
// v3: default to the checkout THIS witness lives in — the absolute shared-checkout default meant
// the witness silently tested whatever ~/bim-ootb happened to be (118 commits stale when the
// "pre-existing FAIL" was being reported). Fixtures stay in the shared buildings/ dir (they are
// data, not code under test) but honor an env override like the sibling witnesses' BLD_DIR.
var VIEWER = process.env.VIEWER_DIR || path.join(__dirname, 'viewer');
var BUILDINGS_DIR = process.env.BLD_DIR || '/home/red1/bim-ootb/buildings';
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
    // v3: IDENTICAL directional test to the CURRENT shipped geoGate() (schedule_gate.js) — below
    // (EPS tolerance) OR contained with STRICT base (§DEQ_V1 antisymmetry: base strictly above
    // mine, co-based neighbors are siblings not support) topping in my LOWER HALF
    // (§TM_GEO_ORDER_CYCLES/PR#1276: an upper-half neighbor rests ON me). geoGate additionally
    // excludes PROMOTED slabs from contained — structurally satisfied here because this witness's
    // struct pool is seq<=4 only (a promoted slab is seq>4 by definition, never in the pool).
    // Not a looser or different heuristic than the shipped rule itself — that drift is exactly
    // what made v2 report leaks the engine's own physics deliberately rejects.
    function isRealSupport(S, el) {
      var below = S.base_z < el.base_z - EPS;
      var contained = !below && S.base_z > el.base_z + EPS && S.top_z <= (el.base_z + el.top_z) / 2;
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
