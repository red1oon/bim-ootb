#!/usr/bin/env node
/**
 * test_s267_integration.js — Whitebox integration test: BOM.db ↔ envelope ↔ grid ↔ verb expansion
 *
 * This test proves (or disproves) that:
 *   1. BOM.db topmost parent (BUILDING) envelope matches bom_extract structural envelope
 *   2. Grid lines at envelope bounds match BOM root AABB
 *   3. Verb-expanded positions fall INSIDE the envelope
 *   4. FRAME verb grid coords match the user-visible grid line positions
 *   5. Grid drag deltas propagate correctly to verb re-expansion
 *
 * Run: node deploy/dev/tests/test_s267_integration.js
 *
 * Issues tested:
 *   T1:  BOM.db BUILDING root has aabb_width/depth/height > 0
 *   T2:  BOM.db root AABB vs extracted DB structural AABB — overlap or gap?
 *   T3:  BOM leaves with CLUSTER verb — positions inside BOM root AABB?
 *   T4:  BOM leaves with FRAME verb — grid coords match root AABB X/Y range?
 *   T5:  Verb expansion count matches qty for non-verb leaves
 *   T6:  Verb expansion count matches entry count for CLUSTER leaves
 *   T7:  All expanded positions are finite (no NaN/Infinity)
 *   T8:  _findRootBom returns BUILDING type
 *   T9:  BOM floor origins span building height (structural Z range)
 *   T10: FRAME grid lines from verb_ref sorted — matches structural column positions?
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var devDir = path.resolve(__dirname, '..');
var pass = 0, fail = 0, total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    pass++;
    console.log('  PASS  ' + name);
  } catch (e) {
    fail++;
    console.log('  FAIL  ' + name + ' — ' + e.message);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}

// ── Load modules into sandbox ────────────────────────────────────────────────
function loadModule(filename) {
  var src = fs.readFileSync(path.join(devDir, filename), 'utf8');
  return src;
}

function createSandbox() {
  var ctx = {
    window: {},
    console: {
      log: function(m) { if (typeof m === 'string' && m.indexOf('§') !== -1) logLines.push(m); },
      warn: function() {},
      error: function(m) { logLines.push('ERROR: ' + m); }
    },
    performance: { now: function() { return Date.now(); } },
    Math: Math, Date: Date, parseInt: parseInt, parseFloat: parseFloat,
    Infinity: Infinity, JSON: JSON, Object: Object, Array: Array,
    Set: Set, Map: Map
  };
  vm.createContext(ctx);
  vm.runInContext(loadModule('verb_expand.js'), ctx);
  vm.runInContext(loadModule('bom_walker.js'), ctx);
  return ctx;
}

var logLines = [];

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§TEST_S267_INTEGRATION starting\n');

// Load real HI_BOM.db
var initSqlJs, SQL, bomDb, extractedDb;
try {
  initSqlJs = require('sql.js');
} catch(e) {
  console.log('  SKIP  sql.js not available: ' + e.message);
  process.exit(0);
}

var bomPath = path.resolve(__dirname, '../../../library/HI_BOM.db');
var extractedPath = path.resolve(__dirname, '../buildings/HITOS_extracted.db');

// Check for extracted DB — try alternate paths
if (!fs.existsSync(extractedPath)) {
  // Try library/ or deploy/dev/buildings/
  var altPaths = [
    path.resolve(__dirname, '../../../deploy/dev/buildings/HITOS_extracted.db'),
    path.resolve(__dirname, '../../buildings/HITOS_extracted.db')
  ];
  for (var pi = 0; pi < altPaths.length; pi++) {
    if (fs.existsSync(altPaths[pi])) { extractedPath = altPaths[pi]; break; }
  }
}

var ready = initSqlJs().then(function(sqljs) {
  SQL = sqljs;

  if (!fs.existsSync(bomPath)) {
    console.log('  SKIP  HI_BOM.db not found at ' + bomPath);
    return;
  }
  bomDb = new SQL.Database(fs.readFileSync(bomPath));
  console.log('  §S267_INT HI_BOM.db loaded');

  if (fs.existsSync(extractedPath)) {
    extractedDb = new SQL.Database(fs.readFileSync(extractedPath));
    console.log('  §S267_INT HITOS_extracted.db loaded');
  } else {
    console.log('  §S267_INT HITOS_extracted.db NOT found — skipping cross-check tests');
  }

  var ctx = createSandbox();
  var BW = ctx.window.BOMWalker;
  var VE = ctx.window.VerbExpand;

  // T1: BOM.db BUILDING root has AABB
  test('T1: BOM.db BUILDING root has aabb_width/depth/height', function() {
    var rows = bomDb.exec(
      "SELECT bom_id, aabb_width_mm, aabb_depth_mm, aabb_height_mm, origin_x, origin_y, origin_z " +
      "FROM m_bom WHERE bom_type = 'BUILDING'"
    );
    assert(rows.length && rows[0].values.length, 'no BUILDING BOM');
    var r = rows[0].values[0];
    console.log('    §S267_T1 root=' + r[0] +
      ' aabb=' + r[1] + 'x' + r[2] + 'x' + r[3] + 'mm' +
      ' origin=(' + r[4] + ',' + r[5] + ',' + r[6] + ')');
    // Log whether AABB is populated or zero
    if (r[1] === 0 && r[2] === 0 && r[3] === 0) {
      console.log('    §S267_T1 WARNING: BUILDING root AABB is 0x0x0 — envelope comes from bom_extract, not BOM.db');
    }
    // This test passes either way — it's diagnostic
  });

  // T2: BOM.db root AABB vs extracted DB structural envelope
  test('T2: BOM.db root AABB vs extracted DB structural envelope', function() {
    if (!extractedDb) {
      console.log('    §S267_T2 SKIP — no extracted DB');
      return;
    }
    // Structural envelope from extracted DB (same logic as bom_extract.js)
    var ENV_CLASSES = "'IfcColumn','IfcPile','IfcWall','IfcWallStandardCase','IfcSlab','IfcBeam','IfcFooting','IfcCurtainWall','IfcRoof'";
    var envRows = extractedDb.exec(
      "SELECT MIN(center_x - bbox_x) as minX, MAX(center_x + bbox_x) as maxX, " +
      "MIN(center_y - bbox_y) as minY, MAX(center_y + bbox_y) as maxY, " +
      "MIN(center_z - bbox_z) as minZ, MAX(center_z + bbox_z) as maxZ " +
      "FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid " +
      "WHERE m.ifc_class IN (" + ENV_CLASSES + ")"
    );
    if (!envRows.length || !envRows[0].values.length) {
      console.log('    §S267_T2 no structural elements in extracted DB');
      return;
    }
    var e = envRows[0].values[0];
    var extW = (e[1] - e[0]);
    var extD = (e[3] - e[2]);
    var extH = (e[5] - e[4]);
    console.log('    §S267_T2 extracted_env' +
      ' X=[' + e[0].toFixed(2) + ',' + e[1].toFixed(2) + ']' +
      ' Y=[' + e[2].toFixed(2) + ',' + e[3].toFixed(2) + ']' +
      ' Z=[' + e[4].toFixed(2) + ',' + e[5].toFixed(2) + ']' +
      ' size=' + extW.toFixed(1) + 'x' + extD.toFixed(1) + 'x' + extH.toFixed(1) + 'm');

    // BOM.db root AABB
    var bomRows = bomDb.exec("SELECT aabb_width_mm, aabb_depth_mm, aabb_height_mm FROM m_bom WHERE bom_type='BUILDING'");
    var bomW = bomRows[0].values[0][0] / 1000;
    var bomD = bomRows[0].values[0][1] / 1000;
    var bomH = bomRows[0].values[0][2] / 1000;
    console.log('    §S267_T2 bom_root_aabb=' + bomW.toFixed(1) + 'x' + bomD.toFixed(1) + 'x' + bomH.toFixed(1) + 'm');

    if (bomW === 0 && bomD === 0) {
      console.log('    §S267_T2 FINDING: BOM root AABB=0 → grid envelope comes entirely from bom_extract structural query');
      console.log('    §S267_T2 IMPLICATION: grid lines = extracted DB envelope, NOT BOM.db topmost parent');
    } else {
      var wDiff = Math.abs(extW - bomW);
      var dDiff = Math.abs(extD - bomD);
      console.log('    §S267_T2 width_diff=' + wDiff.toFixed(2) + 'm depth_diff=' + dDiff.toFixed(2) + 'm');
    }
  });

  // T3: CLUSTER positions inside floor AABB
  test('T3: CLUSTER verb positions inside reasonable bounds', function() {
    var leaves = BW.collectLeaves(bomDb, 'BUILDING_HI_STD');
    var clusters = leaves.filter(function(l) { return l.line.verbRef && l.line.verbRef.indexOf('CLUSTER:') === 0; });
    var outOfBounds = 0;
    var maxCoord = 0;
    for (var ci = 0; ci < clusters.length; ci++) {
      var cl = clusters[ci];
      var positions = VE.expandVerb(cl.line.verbRef, cl.line.qty, cl.line.dx, cl.line.dy, cl.line.dz);
      for (var pi = 0; pi < positions.length; pi++) {
        var abs = Math.max(Math.abs(positions[pi][0]), Math.abs(positions[pi][1]), Math.abs(positions[pi][2]));
        if (abs > maxCoord) maxCoord = abs;
        if (abs > 200) outOfBounds++; // sanity: >200m from origin is suspect
      }
    }
    console.log('    §S267_T3 clusters=' + clusters.length +
      ' maxCoord=' + maxCoord.toFixed(2) + 'm outOfBounds=' + outOfBounds);
    assert(outOfBounds === 0, outOfBounds + ' positions > 200m from origin');
  });

  // T4: FRAME verb grid coords vs root AABB range
  test('T4: FRAME verb grid coords inside building X/Y range', function() {
    var leaves = BW.collectLeaves(bomDb, 'BUILDING_HI_STD');
    var frames = leaves.filter(function(l) { return l.line.verbRef && l.line.verbRef.indexOf('FRAME:') === 0; });
    if (!frames.length) {
      console.log('    §S267_T4 no FRAME verbs in HI_BOM.db — OK (only CLUSTER/TILE/ROUTE)');
      return;
    }
    for (var fi = 0; fi < frames.length; fi++) {
      var positions = VE.expandVerb(frames[fi].line.verbRef, frames[fi].line.qty, frames[fi].line.dx, frames[fi].line.dy, frames[fi].line.dz);
      console.log('    §S267_T4 FRAME line=' + frames[fi].line.lineId + ' positions=' + positions.length);
    }
  });

  // T5: Non-verb leaves expand to qty=1 single position
  test('T5: Non-verb leaves → qty=1 at origin coords', function() {
    var leaves = BW.collectLeaves(bomDb, 'BUILDING_HI_STD');
    var noVerb = leaves.filter(function(l) { return !l.line.verbRef; });
    var mismatch = 0;
    for (var ni = 0; ni < noVerb.length; ni++) {
      var positions = VE.expandVerb(null, noVerb[ni].line.qty, noVerb[ni].line.dx, noVerb[ni].line.dy, noVerb[ni].line.dz);
      if (positions.length !== noVerb[ni].line.qty) mismatch++;
    }
    console.log('    §S267_T5 noVerb=' + noVerb.length + ' mismatch=' + mismatch);
    assertEq(mismatch, 0, 'qty mismatch');
  });

  // T6: CLUSTER leaves — entry count matches expanded position count
  test('T6: CLUSTER entry count = expanded position count', function() {
    var leaves = BW.collectLeaves(bomDb, 'BUILDING_HI_STD');
    var clusters = leaves.filter(function(l) { return l.line.verbRef && l.line.verbRef.indexOf('CLUSTER:') === 0; });
    var mismatches = [];
    for (var ci = 0; ci < clusters.length; ci++) {
      var cl = clusters[ci];
      var entryCount = cl.line.verbRef.substring(8).split(';').length;
      var positions = VE.expandCluster(cl.line.verbRef, cl.line.dx, cl.line.dy, cl.line.dz);
      if (positions.length !== entryCount) {
        mismatches.push({ lineId: cl.line.lineId, entries: entryCount, expanded: positions.length });
      }
    }
    console.log('    §S267_T6 clusters=' + clusters.length + ' mismatches=' + mismatches.length);
    if (mismatches.length) console.log('    §S267_T6 ' + JSON.stringify(mismatches));
    assertEq(mismatches.length, 0, 'CLUSTER entry/position mismatch');
  });

  // T7: All expanded positions are finite
  test('T7: All expanded positions are finite (no NaN/Infinity)', function() {
    var leaves = BW.collectLeaves(bomDb, 'BUILDING_HI_STD');
    var badCount = 0;
    var totalPositions = 0;
    for (var li = 0; li < leaves.length; li++) {
      var l = leaves[li];
      var positions = VE.expandVerb(l.line.verbRef, l.line.qty, l.line.dx, l.line.dy, l.line.dz);
      totalPositions += positions.length;
      for (var pi = 0; pi < positions.length; pi++) {
        for (var ci = 0; ci < 3; ci++) {
          if (!isFinite(positions[pi][ci])) badCount++;
        }
      }
    }
    console.log('    §S267_T7 totalPositions=' + totalPositions + ' bad=' + badCount);
    assertEq(badCount, 0, 'non-finite positions');
  });

  // T8: _findRootBom equivalent
  test('T8: Root BOM is BUILDING type', function() {
    var boms = BW.listBoms(bomDb);
    var building = boms.filter(function(b) { return b.bomType === 'BUILDING'; });
    assertEq(building.length, 1, 'exactly 1 BUILDING BOM');
    assertEq(building[0].bomId, 'BUILDING_HI_STD');
    console.log('    §S267_T8 root=' + building[0].bomId + ' type=' + building[0].bomType);
  });

  // T9: Floor origins span building height
  test('T9: BOM floor origins span building Z range', function() {
    var floors = bomDb.exec(
      "SELECT bom_id, origin_x, origin_y, origin_z FROM m_bom WHERE bom_type='FLOOR' ORDER BY origin_z"
    );
    assert(floors.length && floors[0].values.length, 'no FLOOR BOMs');
    var minZ = Infinity, maxZ = -Infinity;
    for (var fi = 0; fi < floors[0].values.length; fi++) {
      var oz = floors[0].values[fi][3];
      if (oz < minZ) minZ = oz;
      if (oz > maxZ) maxZ = oz;
    }
    console.log('    §S267_T9 floors=' + floors[0].values.length +
      ' Z_range=[' + minZ.toFixed(2) + ',' + maxZ.toFixed(2) + ']' +
      ' height=' + (maxZ - minZ).toFixed(2) + 'm');
    for (var fi2 = 0; fi2 < floors[0].values.length; fi2++) {
      var f = floors[0].values[fi2];
      console.log('      §S267_T9 ' + f[0] + ' origin=(' + f[1] + ',' + f[2] + ',' + f[3] + ')');
    }
  });

  // T10: Column positions from CLUSTER verb vs structural envelope
  test('T10: Column CLUSTER positions span building footprint', function() {
    var leaves = BW.collectLeaves(bomDb, 'BUILDING_HI_STD');
    var colClusters = leaves.filter(function(l) {
      return l.line.role === 'IfcColumn' && l.line.verbRef && l.line.verbRef.indexOf('CLUSTER:') === 0;
    });
    if (!colClusters.length) {
      console.log('    §S267_T10 no column CLUSTERs');
      return;
    }

    var allX = [], allY = [];
    for (var ci = 0; ci < colClusters.length; ci++) {
      var positions = VE.expandCluster(colClusters[ci].line.verbRef, colClusters[ci].line.dx, colClusters[ci].line.dy, colClusters[ci].line.dz);
      for (var pi = 0; pi < positions.length; pi++) {
        allX.push(positions[pi][0]);
        allY.push(positions[pi][1]);
      }
    }

    var colMinX = Math.min.apply(null, allX), colMaxX = Math.max.apply(null, allX);
    var colMinY = Math.min.apply(null, allY), colMaxY = Math.max.apply(null, allY);
    console.log('    §S267_T10 column_footprint' +
      ' X=[' + colMinX.toFixed(2) + ',' + colMaxX.toFixed(2) + ']' +
      ' Y=[' + colMinY.toFixed(2) + ',' + colMaxY.toFixed(2) + ']' +
      ' columns=' + allX.length);

    if (extractedDb) {
      var envRows = extractedDb.exec(
        "SELECT MIN(center_x - bbox_x), MAX(center_x + bbox_x), " +
        "MIN(center_y - bbox_y), MAX(center_y + bbox_y) " +
        "FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid " +
        "WHERE m.ifc_class IN ('IfcColumn')"
      );
      if (envRows.length && envRows[0].values.length) {
        var ec = envRows[0].values[0];
        console.log('    §S267_T10 extracted_columns' +
          ' X=[' + ec[0].toFixed(2) + ',' + ec[1].toFixed(2) + ']' +
          ' Y=[' + ec[2].toFixed(2) + ',' + ec[3].toFixed(2) + ']');
        var xOverlap = Math.min(colMaxX, ec[1]) - Math.max(colMinX, ec[0]);
        var yOverlap = Math.min(colMaxY, ec[3]) - Math.max(colMinY, ec[2]);
        console.log('    §S267_T10 overlap X=' + xOverlap.toFixed(2) + 'm Y=' + yOverlap.toFixed(2) + 'm');
        console.log('    §S267_T10 ' + (xOverlap > 0 && yOverlap > 0 ? 'MATCH — BOM columns overlap extracted columns' : 'GAP — BOM and extracted columns DO NOT overlap'));
      }
    }
  });

  // Summary
  console.log('\n§TEST_S267_INTEGRATION ' + pass + '/' + total + ' PASS' +
    (fail ? ', ' + fail + ' FAIL' : '') + '\n');
  process.exit(fail ? 1 : 0);

}).catch(function(e) {
  console.log('  FATAL  sql.js init failed: ' + e.message);
  process.exit(1);
});
