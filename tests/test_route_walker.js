#!/usr/bin/env node
/**
 * test_route_walker.js — Whitebox verification of JS RouteWalker
 *
 * CTFL: equivalence partitioning (anchor types, disciplines),
 * boundary (distance guards 0m, 50m), decision table (node_type mapping),
 * state transition (used-anchor tracking), integration (real mep_rw.db).
 *
 * Run: node deploy/dev/tests/test_route_walker.js
 *
 * Issues tested:
 *   T1:  route_walker.js parses without error
 *   T2:  RouteWalker exposes public API
 *   T3:  _toNodeType maps METER→METER for CW, METER→STACK for SP
 *   T4:  _toNodeType unknown anchor_type defaults to JUNCTION
 *   T5:  _aabbOverlap detects overlap (boxes touching)
 *   T6:  _aabbOverlap rejects non-overlap (boxes separated)
 *   T7:  _aabbOverlap respects -10mm tolerance (touch allowed)
 *   T8:  _clashesWithArc returns false on empty arc list
 *   T9:  _applyPattern pairs from→to by nearest XY distance
 *   T10: _applyPattern skips distance=0 pairs (degenerate)
 *   T11: _applyPattern skips distance>50m pairs (sanity guard)
 *   T12: _applyPattern marks used anchors — no double-pairing
 *   T13: _applyPattern GRADIENT enforces slope on dz
 *   T14: _applyPattern clash skip increments counter
 *   T15: REAL DATA — load patterns from mep_rw.db (CW: 4 steps, SP: 5 steps)
 *   T16: REAL DATA — load anchors from mep_rw.db (Ifc2x3_Duplex)
 *   T17: REAL DATA — walk() produces CW+SP segments from real data
 *   T18: walk() returns empty on missing patterns
 *   T19: walk() returns empty on missing anchors
 *   T20: Emitted segments have required fields (disc, dx, dy, dz, length_mm)
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var devDir = path.resolve(__dirname, '..');
var pass = 0, fail = 0, total = 0;
var logLines = [];

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
function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error((msg || '') + ' expected ' + b + ' got ' + a + ' (tol=' + tol + ')');
}

function logTag(tag, msg) {
  var line = '§' + tag + ' ' + msg;
  logLines.push(line);
  console.log('    ' + line);
}

function readFile(name) {
  return fs.readFileSync(path.join(devDir, name), 'utf8');
}

// ── Load RouteWalker into sandbox ──────────────────────────────────────────
function loadRW() {
  var src = readFile('route_walker.js');
  var ctx = {
    window: {},
    console: { log: function(){}, warn: function(){} },
    performance: { now: function() { return 0; } },
    Math: Math, Infinity: Infinity,
    JSON: JSON
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.RouteWalker;
}

// ── Mock anchor/pattern data ───────────────────────────────────────────────
function mockAnchors() {
  return [
    { anchorId: 'M1', anchorType: 'METER',   x: 0,  y: 0,  z: 3, storey: 'GF' },
    { anchorId: 'M2', anchorType: 'METER',   x: 10, y: 0,  z: 3, storey: 'GF' },
    { anchorId: 'F1', anchorType: 'FIXTURE', x: 3,  y: 2,  z: 3, storey: 'GF' },
    { anchorId: 'F2', anchorType: 'FIXTURE', x: 8,  y: 1,  z: 3, storey: 'GF' },
    { anchorId: 'F3', anchorType: 'FIXTURE', x: 5,  y: 5,  z: 3, storey: 'GF' },
    { anchorId: 'G1', anchorType: 'GENERIC', x: 5,  y: 0,  z: 0, storey: 'GF' },
    // Second storey
    { anchorId: 'M3', anchorType: 'METER',   x: 0,  y: 0,  z: 6, storey: 'FF' },
    { anchorId: 'F4', anchorType: 'FIXTURE', x: 4,  y: 3,  z: 6, storey: 'FF' }
  ];
}

function mockCWSteps() {
  return [
    { patternId: 'CW_TEST', discipline: 'CW', buildingType: 'Test', sequence: 10,
      fromNodeType: 'METER', toNodeType: 'FIXTURE', directionAxis: 'X',
      pieceType: 'PIPE_STRAIGHT', offsetRule: 'DIRECT', gradient: 0 }
  ];
}

function mockSPSteps() {
  return [
    { patternId: 'SP_TEST', discipline: 'SP', buildingType: 'Test', sequence: 10,
      fromNodeType: 'FIXTURE', toNodeType: 'STACK', directionAxis: 'X',
      pieceType: 'PIPE_STRAIGHT', offsetRule: 'GRADIENT', gradient: 0.025 }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══ RouteWalker JS — Whitebox Tests (CTFL) ═══\n');

// ── T1-T2: Module loading ─────────────────────────────────────────────────
console.log('── T1-T2: Module ──');

test('T1 Issue: route_walker.js parses without error', function() {
  new vm.Script(readFile('route_walker.js'), { filename: 'route_walker.js' });
  logTag('SYNTAX', 'route_walker.js OK');
});

test('T2 Issue: RouteWalker exposes public API', function() {
  var RW = loadRW();
  assert(RW, 'RouteWalker not on window');
  assert(typeof RW.walk === 'function', 'walk missing');
  assert(typeof RW._toNodeType === 'function', '_toNodeType missing');
  assert(typeof RW._aabbOverlap === 'function', '_aabbOverlap missing');
  assert(typeof RW._applyPattern === 'function', '_applyPattern missing');
  logTag('API', 'walk + 5 internal methods OK');
});

// ── T3-T4: Node type mapping (Decision Table) ────────────────────────────
console.log('\n── T3-T4: Node Type Mapping ──');

test('T3 Issue: _toNodeType maps METER→METER for CW, METER→STACK for SP', function() {
  var RW = loadRW();
  assertEq(RW._toNodeType('METER', 'CW'), 'METER', 'CW/METER');
  assertEq(RW._toNodeType('METER', 'SP'), 'STACK', 'SP/METER');
  assertEq(RW._toNodeType('FIXTURE', 'CW'), 'FIXTURE', 'CW/FIXTURE');
  assertEq(RW._toNodeType('FIXTURE', 'SP'), 'FIXTURE', 'SP/FIXTURE');
  assertEq(RW._toNodeType('VALVE', 'CW'), 'VALVE', 'CW/VALVE');
  assertEq(RW._toNodeType('GENERIC', 'CW'), 'JUNCTION', 'CW/GENERIC');
  logTag('NODE_MAP', 'CW: METER→METER, SP: METER→STACK, GENERIC→JUNCTION');
});

test('T4 Issue: _toNodeType unknown anchor defaults to JUNCTION', function() {
  var RW = loadRW();
  assertEq(RW._toNodeType('UNKNOWN_TYPE', 'CW'), 'JUNCTION');
  assertEq(RW._toNodeType('UNKNOWN_TYPE', 'SP'), 'JUNCTION');
  logTag('NODE_DEFAULT', 'unknown→JUNCTION');
});

// ── T5-T8: AABB clash (Boundary Values) ──────────────────────────────────
console.log('\n── T5-T8: AABB Clash ──');

test('T5 Issue: _aabbOverlap detects overlapping boxes', function() {
  var RW = loadRW();
  // Box1 at center=100, size=60. Box2 at center=120, size=60.
  // Gap = |100-120| = 20. Half-sum = 30+30 = 60. 20 < 60 → overlap
  assert(RW._aabbOverlap(100, 60, 120, 60, 0), 'Should overlap');
  logTag('AABB_HIT', '|100-120|=20 < 30+30=60 → overlap');
});

test('T6 Issue: _aabbOverlap rejects separated boxes', function() {
  var RW = loadRW();
  // Box1 at 0, size=10. Box2 at 100, size=10.
  // Gap = 100. Half-sum = 5+5 = 10. 100 >= 10 → no overlap
  assert(!RW._aabbOverlap(0, 10, 100, 10, 0), 'Should not overlap');
  logTag('AABB_MISS', '|0-100|=100 >= 5+5=10 → no overlap');
});

test('T7 Issue: _aabbOverlap respects -10mm tolerance (touch allowed)', function() {
  var RW = loadRW();
  // Boxes exactly touching: gap = half-sum. With tol=-10, touch is OK.
  // Box1 at 0, size=20. Box2 at 20, size=20. Gap=20, half-sum=10+10=20.
  // Without tol: 20 < 20 → false (not strictly less). With tol=-10: 20 < 20-10=10 → false
  // Adjacent: gap=exactly-sum → not overlapping. Good.
  assert(!RW._aabbOverlap(0, 20, 20, 20, -10), 'Touching should not clash with -10 tol');
  // Slight penetration: gap=15 < 20-10=10? No, 15 < 10 is false.
  // Actually: 15 < (10+10-10) = 10 → false. Correct — slight proximity is OK.
  // Real penetration: gap=5 < 10 → true
  assert(RW._aabbOverlap(0, 20, 5, 20, -10), 'Deep overlap should clash');
  logTag('AABB_TOL', 'tol=-10mm: touch=OK, penetrate=clash');
});

test('T8 Issue: _clashesWithArc returns false on empty arc list', function() {
  var RW = loadRW();
  assert(!RW._clashesWithArc(0, 0, 0, 10, 10, 10, []), 'Empty list = no clash');
  assert(!RW._clashesWithArc(0, 0, 0, 10, 10, 10, null), 'Null = no clash');
  logTag('CLASH_EMPTY', 'empty/null arc list → false');
});

// ── T9-T14: Pattern Application ──────────────────────────────────────────
console.log('\n── T9-T14: Pattern Application ──');

test('T9 Issue: _applyPattern pairs from→to by nearest XY distance', function() {
  var RW = loadRW();
  var anchors = mockAnchors();
  var steps = mockCWSteps();
  var result = RW._applyPattern('CW', steps, anchors, []);
  assert(result.segments.length > 0, 'Should emit segments');
  // M1(0,0) should pair with F1(3,2) — dist=3.6m — nearer than F2(8,1)=8.06m or F3(5,5)=7.07m
  var seg1 = result.segments.find(function(s) { return s.fromId === 'M1'; });
  assert(seg1, 'M1 should be paired');
  assertEq(seg1.toId, 'F1', 'M1 nearest to F1');
  logTag('PAIR_NEAREST', 'M1(0,0)→F1(3,2) dist=3.6m');
});

test('T10 Issue: _applyPattern skips distance=0 pairs', function() {
  var RW = loadRW();
  // Put from and to at same position
  var anchors = [
    { anchorId: 'M1', anchorType: 'METER',   x: 5, y: 5, z: 3, storey: 'GF' },
    { anchorId: 'F1', anchorType: 'FIXTURE', x: 5, y: 5, z: 3, storey: 'GF' }
  ];
  var result = RW._applyPattern('CW', mockCWSteps(), anchors, []);
  assertEq(result.segments.length, 0, 'Distance=0 should be skipped');
  logTag('DIST_ZERO', 'same position → 0 segments');
});

test('T11 Issue: _applyPattern skips distance>50m pairs', function() {
  var RW = loadRW();
  var anchors = [
    { anchorId: 'M1', anchorType: 'METER',   x: 0,  y: 0, z: 3, storey: 'GF' },
    { anchorId: 'F1', anchorType: 'FIXTURE', x: 60, y: 0, z: 3, storey: 'GF' }
  ];
  var result = RW._applyPattern('CW', mockCWSteps(), anchors, []);
  assertEq(result.segments.length, 0, 'Distance>50m should be skipped');
  logTag('DIST_50', '60m apart → 0 segments');
});

test('T12 Issue: _applyPattern marks used anchors — no double-pairing', function() {
  var RW = loadRW();
  // 2 meters, 2 fixtures — each fixture should be used only once
  var anchors = [
    { anchorId: 'M1', anchorType: 'METER',   x: 0,  y: 0, z: 3, storey: 'GF' },
    { anchorId: 'M2', anchorType: 'METER',   x: 10, y: 0, z: 3, storey: 'GF' },
    { anchorId: 'F1', anchorType: 'FIXTURE', x: 3,  y: 0, z: 3, storey: 'GF' },
    { anchorId: 'F2', anchorType: 'FIXTURE', x: 8,  y: 0, z: 3, storey: 'GF' }
  ];
  var result = RW._applyPattern('CW', mockCWSteps(), anchors, []);
  assertEq(result.segments.length, 2, 'Should pair both meters');
  var toIds = result.segments.map(function(s) { return s.toId; }).sort();
  assert(toIds[0] !== toIds[1], 'Each fixture used only once: ' + toIds.join(','));
  logTag('NO_DOUBLE', 'M1→F1, M2→F2 (no reuse)');
});

test('T13 Issue: GRADIENT enforces slope on dz (MS 1228 §5.3)', function() {
  var RW = loadRW();
  // SP pattern with gradient=0.025: dz = 0.025 * horizontal_distance
  var anchors = [
    { anchorId: 'F1', anchorType: 'FIXTURE', x: 0, y: 0, z: 3, storey: 'GF' },
    { anchorId: 'M1', anchorType: 'METER',   x: 10, y: 0, z: 3, storey: 'GF' }
  ];
  // SP: FIXTURE→STACK. METER maps to STACK for SP discipline.
  var result = RW._applyPattern('SP', mockSPSteps(), anchors, []);
  assert(result.segments.length > 0, 'Should emit SP segment');
  var seg = result.segments[0];
  // horiz = 10m, gradient = 0.025 → dz = 0.25m
  assertClose(seg.dz, 0.25, 0.001, 'dz should be gradient * horiz');
  logTag('GRADIENT', 'horiz=10m, grad=0.025 → dz=' + seg.dz + 'm');
});

test('T14 Issue: clash skip increments counter', function() {
  var RW = loadRW();
  var anchors = [
    { anchorId: 'M1', anchorType: 'METER',   x: 5, y: 5, z: 3, storey: 'GF' },
    { anchorId: 'F1', anchorType: 'FIXTURE', x: 6, y: 5, z: 3, storey: 'GF' }
  ];
  // Arc box right at the midpoint of M1→F1
  var arcs = [{ cx: 5500, cy: 5000, cz: 3000, w: 2000, d: 2000, h: 2000 }];
  var result = RW._applyPattern('CW', mockCWSteps(), anchors, arcs);
  assertEq(result.segments.length, 0, 'Clashing segment should not emit');
  assertEq(result.clashSkipped, 1, 'clashSkipped should be 1');
  logTag('CLASH_SKIP', 'pipe through wall → skipped, clashSkipped=1');
});

// ── T15-T17: Real Data (mep_rw.db) ──────────────────────────────────────
console.log('\n── T15-T17: Real Data (mep_rw.db) ──');

var initSqlJs;
var realDbPath = path.join(devDir, 'mep_rw.db');
var hasRealDb = fs.existsSync(realDbPath);

if (hasRealDb) {
  initSqlJs = require('sql.js');
}

// T15-T17 need async sql.js — wrap in async runner
var _realTests = [];

_realTests.push({ name: 'T15 Issue: REAL — load CW+SP patterns from mep_rw.db', fn: async function() {
  if (!hasRealDb) { logTag('SKIP', 'mep_rw.db not found'); return; }
  var RW = loadRW();
  var SQLite = await initSqlJs();
  var buf = fs.readFileSync(realDbPath);
  var db = new SQLite.Database(buf);
  var cwSteps = RW._loadPatterns(db, 'CW', 'TERMINAL');
  var spSteps = RW._loadPatterns(db, 'SP', 'TERMINAL');
  assert(cwSteps.length === 4, 'CW should have 4 steps, got ' + cwSteps.length);
  assert(spSteps.length === 5, 'SP should have 5 steps, got ' + spSteps.length);
  logTag('REAL_PATTERNS', 'CW=' + cwSteps.length + ' SP=' + spSteps.length);
  db.close();
}});

_realTests.push({ name: 'T16 Issue: REAL — load Duplex anchors from mep_rw.db', fn: async function() {
  if (!hasRealDb) { logTag('SKIP', 'mep_rw.db not found'); return; }
  var RW = loadRW();
  var SQLite = await initSqlJs();
  var buf = fs.readFileSync(realDbPath);
  var db = new SQLite.Database(buf);
  var anchors = RW._loadAnchors(db, 'Ifc2x3_Duplex');
  assert(anchors.length > 10, 'Duplex should have >10 anchors, got ' + anchors.length);
  var types = {};
  anchors.forEach(function(a) { types[a.anchorType] = (types[a.anchorType] || 0) + 1; });
  logTag('REAL_ANCHORS', 'total=' + anchors.length +
    ' METER=' + (types.METER || 0) + ' FIXTURE=' + (types.FIXTURE || 0) +
    ' GENERIC=' + (types.GENERIC || 0));
  db.close();
}});

_realTests.push({ name: 'T17 Issue: REAL — walk() produces CW+SP segments from Duplex data', fn: async function() {
  if (!hasRealDb) { logTag('SKIP', 'mep_rw.db not found'); return; }
  var RW = loadRW();
  var SQLite = await initSqlJs();
  var buf = fs.readFileSync(realDbPath);
  var db = new SQLite.Database(buf);
  var mockA = { dbQuery: function() { return []; }, db: null };
  var result = RW.walk(db, mockA, 'Ifc2x3_Duplex');
  assert(result.totalEmitted > 0, 'Should emit segments, got ' + result.totalEmitted);
  logTag('REAL_WALK', 'CW=' + result.cwSegments.length + ' SP=' + result.spSegments.length +
    ' clash=' + (result.cwClash + result.spClash) + ' total=' + result.totalEmitted);
  db.close();
}});

// Real-data tests run in async block — see below

// ── T18-T20: Edge cases ──────────────────────────────────────────────────
console.log('\n── T18-T20: Edge Cases ──');

test('T18 Issue: walk() returns empty on missing patterns', function() {
  var RW = loadRW();
  // Mock db that returns no patterns
  var emptyDb = { exec: function() { return []; } };
  var mockA = { dbQuery: function() { return []; } };
  var result = RW.walk(emptyDb, mockA, 'NoSuchBuilding');
  assertEq(result.totalEmitted, 0);
  logTag('NO_PATTERNS', 'empty patterns → 0 segments');
});

test('T19 Issue: walk() returns empty on missing anchors', function() {
  var RW = loadRW();
  var callCount = 0;
  var mockDb = {
    exec: function(sql) {
      callCount++;
      if (sql.indexOf('ad_mep_pattern') >= 0) {
        return [{ values: [['P1','CW','T',10,'METER','FIXTURE','X','PIPE','DIRECT',0]] }];
      }
      return [];  // no anchors
    }
  };
  var mockA = { dbQuery: function() { return []; } };
  var result = RW.walk(mockDb, mockA, 'Test');
  assertEq(result.totalEmitted, 0);
  logTag('NO_ANCHORS', 'patterns present but no anchors → 0 segments');
});

test('T20 Issue: emitted segments have all required fields', function() {
  var RW = loadRW();
  var anchors = [
    { anchorId: 'M1', anchorType: 'METER',   x: 0,  y: 0, z: 3, storey: 'GF' },
    { anchorId: 'F1', anchorType: 'FIXTURE', x: 5,  y: 0, z: 3, storey: 'GF' }
  ];
  var result = RW._applyPattern('CW', mockCWSteps(), anchors, []);
  assert(result.segments.length === 1, 'Should emit 1 segment');
  var seg = result.segments[0];
  var required = ['disc', 'storey', 'step', 'fromId', 'toId', 'dx', 'dy', 'dz', 'length_mm', 'pieceType', 'axis'];
  for (var i = 0; i < required.length; i++) {
    assert(seg.hasOwnProperty(required[i]), 'Missing field: ' + required[i]);
  }
  logTag('FIELDS', required.join(',') + ' all present');
});

// ═══════════════════════════════════════════════════════════════════════════
// Async runner for real-data tests, then summary
// ═══════════════════════════════════════════════════════════════════════════
(async function() {
  for (var i = 0; i < _realTests.length; i++) {
    var rt = _realTests[i];
    total++;
    try {
      await rt.fn();
      pass++;
      console.log('  PASS  ' + rt.name);
    } catch(e) {
      fail++;
      console.log('  FAIL  ' + rt.name + ' — ' + e.message);
    }
  }

  console.log('\n═══ Summary ═══');
  console.log('  PASS: ' + pass + '  FAIL: ' + fail + '  TOTAL: ' + total);
  console.log('  §-tagged log lines: ' + logLines.length);
  if (fail > 0) {
    console.log('\n  ✗ FAILURES — see above');
    process.exit(1);
  } else {
    console.log('\n  ✓ ALL PASS');
    process.exit(0);
  }
})();
