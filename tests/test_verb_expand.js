#!/usr/bin/env node
/**
 * test_verb_expand.js — Whitebox verification of JS verb expanders
 *
 * CTFL: equivalence partitioning (each verb type), boundary (empty verb, zero qty),
 * edge cases (legacy 3-field CLUSTER, unknown verb).
 * Values verified against Java PlacementCollectorVisitor output.
 *
 * Run: node deploy/dev/tests/test_verb_expand.js
 *
 * Issues tested:
 *   T1:  verb_expand.js parses without error
 *   T2:  VerbExpand exposes public API (expandVerb + 7 individual expanders)
 *   T3:  null/empty verbRef → single position at origin
 *   T4:  TILE:3:4:2.0:1.5 → 12 positions (3×4 grid)
 *   T5:  TILE positions match Java: [0,0] [0,1.5] [0,3.0] [0,4.5] [2.0,0] ...
 *   T6:  ROUTE:X:1.2:5|Y:0.8:3 → 8 positions
 *   T7:  ROUTE positions: X leg advances curX, Y leg advances curY
 *   T8:  FRAME:0,5.4,10.8|0,4.8 → 6 positions (3×2 cartesian product)
 *   T9:  FRAME ignores originDx/Dy, uses embedded coords + originDz
 *   T10: CLUSTER from real HI_BOM.db format → per-instance [dx,dy,dz,w,d,h]
 *   T11: CLUSTER legacy 3-field → w,d,h = 0
 *   T12: SPRAY:0.3:2.248 qty=10 → 10 positions in semi-regular grid
 *   T13: LINE:X:0.012,1.772,2.772,3.772 → 4 positions along X
 *   T14: LINE:Y → positions vary Y, keep X/Z from origin
 *   T15: LINE_MULTI:X:0.76,1.76;X:0.00,1.00 → 4 positions
 *   T16: PLACE_DEVICE:rule → single position at origin
 *   T17: Unknown verb → fallback to origin, console.warn
 *   T18: TILE with origin offset → all positions shifted
 *   T19: FRAME:0,5.4,10.8|0,4.8|0.175,0.175 → still 6 positions (3rd segment ignored)
 *   T20: CLUSTER with 7-field (guid) entries → guid ignored, 6-field parsed
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
  if (Math.abs(a - b) > (tol || 0.0001)) throw new Error((msg || '') + ' expected ' + b + ' got ' + a);
}

// ── Load VerbExpand into sandbox ─────────────────────────────────────────────
var warnings = [];
function loadVE() {
  var src = fs.readFileSync(path.join(devDir, 'verb_expand.js'), 'utf8');
  warnings = [];
  var ctx = {
    window: {},
    console: { log: function(){}, warn: function(m) { warnings.push(m); } },
    Math: Math, parseInt: parseInt, parseFloat: parseFloat
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.VerbExpand;
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§TEST_VERB_EXPAND starting\n');

var VE = loadVE();

// T1: Parse
test('T1: verb_expand.js parses without error', function() {
  assert(VE, 'VerbExpand not defined');
});

// T2: Public API
test('T2: VerbExpand exposes full API', function() {
  assertEq(typeof VE.expandVerb, 'function', 'expandVerb');
  assertEq(typeof VE.expandTile, 'function', 'expandTile');
  assertEq(typeof VE.expandRoute, 'function', 'expandRoute');
  assertEq(typeof VE.expandFrame, 'function', 'expandFrame');
  assertEq(typeof VE.expandCluster, 'function', 'expandCluster');
  assertEq(typeof VE.expandSpray, 'function', 'expandSpray');
  assertEq(typeof VE.expandLine, 'function', 'expandLine');
  assertEq(typeof VE.expandLineMulti, 'function', 'expandLineMulti');
});

// T3: null/empty verbRef
test('T3: null verbRef → single position at origin', function() {
  var r = VE.expandVerb(null, 1, 2.5, 3.0, 1.0);
  assertEq(r.length, 1, 'count');
  assertClose(r[0][0], 2.5, 0.0001, 'dx');
  assertClose(r[0][1], 3.0, 0.0001, 'dy');
  assertClose(r[0][2], 1.0, 0.0001, 'dz');
});

// T4: TILE count
test('T4: TILE:3:4:2.0:1.5 → 12 positions', function() {
  var r = VE.expandTile('TILE:3:4:2.0:1.5', 0, 0, 0);
  assertEq(r.length, 12, 'count 3×4=12');
});

// T5: TILE positions match Java output
test('T5: TILE positions match Java PlacementCollectorVisitor', function() {
  var r = VE.expandTile('TILE:3:4:2.0:1.5', 0, 0, 0);
  // First column: ix=0, iy=0..3
  assertClose(r[0][0], 0, 0.0001, '[0,0] x'); assertClose(r[0][1], 0, 0.0001, '[0,0] y');
  assertClose(r[1][0], 0, 0.0001, '[0,1] x'); assertClose(r[1][1], 1.5, 0.0001, '[0,1] y');
  assertClose(r[2][0], 0, 0.0001, '[0,2] x'); assertClose(r[2][1], 3.0, 0.0001, '[0,2] y');
  assertClose(r[3][0], 0, 0.0001, '[0,3] x'); assertClose(r[3][1], 4.5, 0.0001, '[0,3] y');
  // Second column: ix=1, iy=0..3
  assertClose(r[4][0], 2.0, 0.0001, '[1,0] x'); assertClose(r[4][1], 0, 0.0001, '[1,0] y');
  assertClose(r[7][0], 2.0, 0.0001, '[1,3] x'); assertClose(r[7][1], 4.5, 0.0001, '[1,3] y');
  // Third column: ix=2
  assertClose(r[8][0], 4.0, 0.0001, '[2,0] x');
  assertClose(r[11][0], 4.0, 0.0001, '[2,3] x'); assertClose(r[11][1], 4.5, 0.0001, '[2,3] y');
  // All Z = 0
  for (var i = 0; i < 12; i++) assertClose(r[i][2], 0, 0.0001, 'z[' + i + ']');
});

// T6: ROUTE count
test('T6: ROUTE:X:1.2:5|Y:0.8:3 → 8 positions', function() {
  var r = VE.expandRoute('ROUTE:X:1.2:5|Y:0.8:3', 0, 0, 0);
  assertEq(r.length, 8, 'count 5+3=8');
});

// T7: ROUTE positions — X leg then Y leg
test('T7: ROUTE X leg advances curX, Y leg advances curY', function() {
  var r = VE.expandRoute('ROUTE:X:1.2:5|Y:0.8:3', 0, 0, 0);
  // X leg: positions at x=0, 1.2, 2.4, 3.6, 4.8, y=0
  assertClose(r[0][0], 0, 0.0001, 'leg1[0] x');
  assertClose(r[1][0], 1.2, 0.0001, 'leg1[1] x');
  assertClose(r[4][0], 4.8, 0.0001, 'leg1[4] x');
  // Y leg: starts at x=6.0 (after 5 steps of 1.2), y=0, 0.8, 1.6
  assertClose(r[5][0], 6.0, 0.0001, 'leg2[0] x');
  assertClose(r[5][1], 0, 0.0001, 'leg2[0] y');
  assertClose(r[6][1], 0.8, 0.0001, 'leg2[1] y');
  assertClose(r[7][1], 1.6, 0.0001, 'leg2[2] y');
});

// T8: FRAME count
test('T8: FRAME:0,5.4,10.8|0,4.8 → 6 positions (3×2)', function() {
  var r = VE.expandFrame('FRAME:0,5.4,10.8|0,4.8', 0);
  assertEq(r.length, 6, 'count 3×2=6');
});

// T9: FRAME positions use embedded coords + originDz
test('T9: FRAME uses embedded X/Y + originDz=2.5', function() {
  var r = VE.expandFrame('FRAME:0,5.4,10.8|0,4.8', 2.5);
  assertClose(r[0][0], 0, 0.0001); assertClose(r[0][1], 0, 0.0001); assertClose(r[0][2], 2.5, 0.0001);
  assertClose(r[1][0], 0, 0.0001); assertClose(r[1][1], 4.8, 0.0001);
  assertClose(r[2][0], 5.4, 0.0001); assertClose(r[2][1], 0, 0.0001);
  assertClose(r[5][0], 10.8, 0.0001); assertClose(r[5][1], 4.8, 0.0001);
});

// T10: CLUSTER with real HI_BOM.db 6-field format
test('T10: CLUSTER 6-field → per-instance [dx,dy,dz,w,d,h]', function() {
  var verb = 'CLUSTER:0.0,0.0,0.0,0.35,0.35,4.535;0.0,12.6,0.82,0.35,0.15,3.715';
  var r = VE.expandCluster(verb, 0, 0, 0);
  assertEq(r.length, 2, 'count');
  assertClose(r[0][0], 0, 0.001); assertClose(r[0][3], 0.35, 0.001, 'w');
  assertClose(r[0][5], 4.535, 0.001, 'h');
  assertClose(r[1][1], 12.6, 0.001, 'dy[1]');
  assertClose(r[1][4], 0.15, 0.001, 'd[1]');
});

// T11: CLUSTER legacy 3-field → w,d,h = 0
test('T11: CLUSTER legacy 3-field → w,d,h=0', function() {
  var verb = 'CLUSTER:1.0,2.0,3.0;4.0,5.0,6.0';
  var r = VE.expandCluster(verb, 0, 0, 0);
  assertEq(r.length, 2);
  assertClose(r[0][3], 0, 0.001, 'w=0');
  assertClose(r[0][4], 0, 0.001, 'd=0');
  assertClose(r[0][5], 0, 0.001, 'h=0');
});

// T12: SPRAY
test('T12: SPRAY:0.3:2.248 qty=10 → 10 positions', function() {
  var r = VE.expandSpray('SPRAY:0.3:2.248', 10, 0, 0, 0);
  assertEq(r.length, 10, 'count');
});

// T13: LINE:X
test('T13: LINE:X:0.012,1.772,2.772,3.772 → 4 positions along X', function() {
  var r = VE.expandLine('LINE:X:0.012,1.772,2.772,3.772', 4, 0, 5.0, 1.0);
  assertEq(r.length, 4);
  assertClose(r[0][0], 0.012, 0.001);
  assertClose(r[0][1], 5.0, 0.001, 'Y from origin');
  assertClose(r[3][0], 3.772, 0.001);
});

// T14: LINE:Y
test('T14: LINE:Y:1.0,3.0 → positions vary Y', function() {
  var r = VE.expandLine('LINE:Y:1.0,3.0', 2, 2.0, 0, 0);
  assertEq(r.length, 2);
  assertClose(r[0][0], 2.0, 0.001, 'X from origin');
  assertClose(r[0][1], 1.0, 0.001, 'Y=1.0');
  assertClose(r[1][1], 3.0, 0.001, 'Y=3.0');
});

// T15: LINE_MULTI
test('T15: LINE_MULTI:X:0.76,1.76;X:0.00,1.00 → 4 positions', function() {
  var r = VE.expandLineMulti('LINE_MULTI:X:0.76,1.76;X:0.00,1.00', 4, 0, 0, 0);
  assertEq(r.length, 4);
  assertClose(r[0][0], 0.76, 0.001);
  assertClose(r[1][0], 1.76, 0.001);
  assertClose(r[2][0], 0.00, 0.001);
  assertClose(r[3][0], 1.00, 0.001);
});

// T16: PLACE_DEVICE
test('T16: PLACE_DEVICE:rule → single position at origin', function() {
  var r = VE.expandVerb('PLACE_DEVICE:WALL_CENTER', 1, 5.0, 3.0, 2.0);
  assertEq(r.length, 1);
  assertClose(r[0][0], 5.0, 0.001);
  assertClose(r[0][1], 3.0, 0.001);
  assertClose(r[0][2], 2.0, 0.001);
});

// T17: Unknown verb → fallback
test('T17: Unknown verb → fallback to origin + warning', function() {
  warnings = [];
  var VE2 = loadVE();
  var r = VE2.expandVerb('FUTURE_VERB:x:y', 1, 1.0, 2.0, 3.0);
  assertEq(r.length, 1);
  assertClose(r[0][0], 1.0, 0.001);
  assert(warnings.length > 0, 'should warn');
});

// T18: TILE with origin offset
test('T18: TILE with origin offset shifts all positions', function() {
  var r = VE.expandTile('TILE:2:2:1.0:1.0', 10.0, 20.0, 5.0);
  assertEq(r.length, 4);
  assertClose(r[0][0], 10.0, 0.001, '[0,0] x=origin');
  assertClose(r[0][1], 20.0, 0.001, '[0,0] y=origin');
  assertClose(r[3][0], 11.0, 0.001, '[1,1] x');
  assertClose(r[3][1], 21.0, 0.001, '[1,1] y');
  assertClose(r[0][2], 5.0, 0.001, 'z=originDz');
});

// T19: FRAME with 3 segments (3rd = halfW,halfD info only)
test('T19: FRAME with halfW/halfD segment → still 6 positions', function() {
  var r = VE.expandFrame('FRAME:0,5.4,10.8|0,4.8|0.175,0.175', 0);
  assertEq(r.length, 6, '3rd segment ignored for cartesian product');
});

// T20: CLUSTER with 7-field (guid) entries
test('T20: CLUSTER 7-field (guid) → parsed, guid ignored', function() {
  var verb = 'CLUSTER:1.0,2.0,3.0,0.5,0.5,2.0,0ABC123;4.0,5.0,6.0,0.3,0.3,1.0,0DEF456';
  var r = VE.expandCluster(verb, 0, 0, 0);
  assertEq(r.length, 2);
  assertClose(r[0][0], 1.0, 0.001);
  assertClose(r[0][3], 0.5, 0.001, 'w');
  assertClose(r[1][0], 4.0, 0.001);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n§TEST_VERB_EXPAND ' + pass + '/' + total + ' PASS' +
  (fail ? ', ' + fail + ' FAIL' : '') + '\n');
process.exit(fail ? 1 : 0);
