#!/usr/bin/env node
/**
 * test_bom_walker.js — Whitebox verification of JS BOMWalker
 *
 * CTFL: tree traversal (BUILDING→FLOOR→LEAF), boundary (MAX_DEPTH guard),
 * structural dispatch (sub-assembly / PHANTOM / leaf / dangling).
 * Real data: HI_BOM.db (504KB, 7 BOMs, 447 lines).
 *
 * Run: node deploy/dev/tests/test_bom_walker.js
 *
 * Issues tested:
 *   T1:  bom_walker.js parses without error
 *   T2:  BOMWalker exposes public API
 *   T3:  _loadBom returns null for missing BOM
 *   T4:  _loadLines returns empty for missing BOM
 *   T5:  walk() returns error stats for missing root
 *   T6:  MOCK — walk 2-level tree: BUILDING → 2 FLOOR → leaves
 *   T7:  MOCK — PHANTOM lines are skipped (onPhantom called, not onLeaf)
 *   T8:  MOCK — dangling child_product_id is neither sub-assembly nor leaf
 *   T9:  MOCK — MAX_DEPTH guard stops infinite recursion
 *   T10: MOCK — collectLeaves returns all leaf contexts
 *   T11: REAL DATA — listBoms on HI_BOM.db returns 7 BOMs
 *   T12: REAL DATA — walk BUILDING_HI_STD → 6 sub-assemblies (floors)
 *   T13: REAL DATA — walk HI_L1_STR → leaf count > 0 (1.etg elements)
 *   T14: REAL DATA — total leaves from BUILDING walk = m_bom_line LEAF count
 *   T15: REAL DATA — walkSelf fires onSubAssembly for root (level=-1)
 *   T16: REAL DATA — collectLeaves returns array of ctx with line.verbRef
 *   T17: REAL DATA — leaf ctx has role (IFC class)
 *   T18: REAL DATA — leaf ctx has qty and dimensions
 *   T19: REAL DATA — verb_ref types match DB (CLUSTER, TILE, ROUTE only)
 *   T20: REAL DATA — performance: full BUILDING walk < 100ms
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

// ── Load BOMWalker into sandbox ──────────────────────────────────────────────
var errors = [];
function loadBW() {
  var src = fs.readFileSync(path.join(devDir, 'bom_walker.js'), 'utf8');
  errors = [];
  var ctx = {
    window: {},
    console: {
      log: function() {},
      warn: function() {},
      error: function(m) { errors.push(m); }
    },
    performance: { now: function() { return Date.now(); } },
    Math: Math, Date: Date,
    parseInt: parseInt, parseFloat: parseFloat
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.BOMWalker;
}

// ── Mock sql.js Database ─────────────────────────────────────────────────────
function mockDb(tables) {
  // tables: { 'SELECT ...': { columns: [...], values: [[...], ...] } }
  return {
    exec: function(sql) {
      for (var pattern in tables) {
        if (sql.indexOf(pattern) !== -1) {
          return [tables[pattern]];
        }
      }
      return [];
    }
  };
}

function buildMockBomDb() {
  // BUILDING → 2 FLOOR → leaves
  var boms = {
    'BUILDING_TEST': { columns: ['bom_id','Value','Name','bom_level','bom_type','origin_x','origin_y','origin_z'],
      values: [['BUILDING_TEST','BUILDING_TEST','Test Building','SET','BUILDING',0,0,0]] },
    'FLOOR_A': { columns: ['bom_id','Value','Name','bom_level','bom_type','origin_x','origin_y','origin_z'],
      values: [['FLOOR_A','FLOOR_A','Floor A','SET','FLOOR',0,0,0]] },
    'FLOOR_B': { columns: ['bom_id','Value','Name','bom_level','bom_type','origin_x','origin_y','origin_z'],
      values: [['FLOOR_B','FLOOR_B','Floor B','SET','FLOOR',0,0,3.2]] }
  };

  var lines = {
    'BUILDING_TEST': { columns: ['M_BOM_Line_ID','bom_id','child_product_id','component_type','role','qty','dx','dy','dz','verb_ref','sequence','allocated_width_mm','allocated_depth_mm','allocated_height_mm','storey'],
      values: [
        [1,'BUILDING_TEST','FLOOR_A','MAKE','FLOOR',1,0,0,0,null,10,0,0,0,'GF'],
        [2,'BUILDING_TEST','FLOOR_B','MAKE','FLOOR',1,0,0,3.2,null,20,0,0,0,'FF']
      ] },
    'FLOOR_A': { columns: ['M_BOM_Line_ID','bom_id','child_product_id','component_type','role','qty','dx','dy','dz','verb_ref','sequence','allocated_width_mm','allocated_depth_mm','allocated_height_mm','storey'],
      values: [
        [10,'FLOOR_A','COL_350','LEAF','IfcColumn',4,0,0,0,'CLUSTER:0,0,0,0.35,0.35,3.2;5.4,0,0,0.35,0.35,3.2',100,350,350,3200,'GF'],
        [11,'FLOOR_A','PHANTOM_SPACER','PHANTOM','IfcBuildingElementProxy',1,0,0,0,null,200,0,0,0,'GF'],
        [12,'FLOOR_A','WALL_200','LEAF','IfcWall',1,0,0,0,null,300,200,5000,3200,'GF']
      ] },
    'FLOOR_B': { columns: ['M_BOM_Line_ID','bom_id','child_product_id','component_type','role','qty','dx','dy','dz','verb_ref','sequence','allocated_width_mm','allocated_depth_mm','allocated_height_mm','storey'],
      values: [
        [20,'FLOOR_B','COL_350','LEAF','IfcColumn',2,0,0,0,'TILE:2:1:5.4:0',100,350,350,3200,'FF'],
        [21,'FLOOR_B','DANGLING_REF','LEAF','IfcFurnishingElement',1,0,0,0,null,200,0,0,0,'FF']
      ] }
  };

  return {
    exec: function(sql) {
      // BOM lookup
      if (sql.indexOf('FROM m_bom WHERE') !== -1) {
        for (var bid in boms) {
          if (sql.indexOf(bid) !== -1) return [boms[bid]];
        }
        return [];
      }
      // Line lookup
      if (sql.indexOf('FROM m_bom_line WHERE') !== -1) {
        for (var lid in lines) {
          if (sql.indexOf(lid) !== -1) return [lines[lid]];
        }
        return [];
      }
      // listBoms
      if (sql.indexOf('FROM m_bom WHERE is_active') !== -1) {
        var all = [];
        for (var k in boms) all.push(boms[k].values[0].slice(0, 4));
        return [{ columns: ['bom_id','Name','bom_level','bom_type'], values: all }];
      }
      return [];
    }
  };
}

// ── Circular BOM for MAX_DEPTH test ──────────────────────────────────────────
function buildCircularDb() {
  return {
    exec: function(sql) {
      if (sql.indexOf('FROM m_bom WHERE') !== -1) {
        return [{ columns: ['bom_id','Value','Name','bom_level','bom_type','origin_x','origin_y','origin_z'],
          values: [['CIRC','CIRC','Circular','SET','FLOOR',0,0,0]] }];
      }
      if (sql.indexOf('FROM m_bom_line WHERE') !== -1) {
        return [{ columns: ['M_BOM_Line_ID','bom_id','child_product_id','component_type','role','qty','dx','dy','dz','verb_ref','sequence','allocated_width_mm','allocated_depth_mm','allocated_height_mm','storey'],
          values: [[1,'CIRC','CIRC','MAKE','IfcColumn',1,0,0,0,null,10,0,0,0,null]] }];
      }
      return [];
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§TEST_BOM_WALKER starting\n');

var BW = loadBW();

// T1: Parse
test('T1: bom_walker.js parses without error', function() {
  assert(BW, 'BOMWalker not defined');
});

// T2: Public API
test('T2: BOMWalker exposes full API', function() {
  assertEq(typeof BW.walk, 'function');
  assertEq(typeof BW.walkSelf, 'function');
  assertEq(typeof BW.collectLeaves, 'function');
  assertEq(typeof BW.listBoms, 'function');
  assertEq(typeof BW._loadBom, 'function');
  assertEq(typeof BW._loadLines, 'function');
});

// T3: _loadBom null for missing
test('T3: _loadBom returns null for missing BOM', function() {
  var db = buildMockBomDb();
  var result = BW._loadBom(db, 'NONEXISTENT');
  assertEq(result, null);
});

// T4: _loadLines empty for missing
test('T4: _loadLines returns empty for missing BOM', function() {
  var db = buildMockBomDb();
  var result = BW._loadLines(db, 'NONEXISTENT');
  assertEq(result.length, 0);
});

// T5: walk missing root
test('T5: walk returns zero stats for missing root', function() {
  errors = [];
  BW = loadBW();
  var db = buildMockBomDb();
  var stats = BW.walk(db, 'NONEXISTENT', {});
  assertEq(stats.leafCount, 0);
  assert(errors.length > 0, 'should log error');
});

// T6: Walk 2-level tree
test('T6: MOCK — BUILDING → 2 FLOOR → leaves', function() {
  BW = loadBW();
  var db = buildMockBomDb();
  var subs = [], leaves = [], phantoms = [];
  var stats = BW.walk(db, 'BUILDING_TEST', {
    onSubAssembly: function(ctx) { subs.push(ctx.line.childProductId); },
    onSubAssemblyComplete: function() {},
    onLeaf: function(ctx) { leaves.push(ctx.line.childProductId); },
    onPhantom: function(ctx) { phantoms.push(ctx.line.childProductId); }
  });
  assertEq(subs.length, 2, '2 sub-assemblies (FLOOR_A, FLOOR_B)');
  assertEq(leaves.length, 4, '4 leaves (2 in A + 2 in B incl. dangling)');
  assertEq(phantoms.length, 1, '1 PHANTOM');
  assertEq(stats.subAssemblyCount, 2);
});

// T7: PHANTOM
test('T7: MOCK — PHANTOM calls onPhantom, not onLeaf', function() {
  BW = loadBW();
  var db = buildMockBomDb();
  var phantomIds = [];
  BW.walk(db, 'BUILDING_TEST', {
    onPhantom: function(ctx) { phantomIds.push(ctx.line.childProductId); }
  });
  assert(phantomIds.indexOf('PHANTOM_SPACER') !== -1, 'PHANTOM_SPACER fired');
});

// T8: Dangling reference treated as leaf (product exists but no child BOM)
test('T8: MOCK — dangling child treated as leaf', function() {
  BW = loadBW();
  var db = buildMockBomDb();
  var leafIds = [];
  BW.walk(db, 'BUILDING_TEST', {
    onLeaf: function(ctx) { leafIds.push(ctx.line.childProductId); }
  });
  assert(leafIds.indexOf('DANGLING_REF') !== -1, 'DANGLING_REF is leaf');
});

// T9: MAX_DEPTH guard
test('T9: MOCK — MAX_DEPTH guard stops circular BOM', function() {
  errors = [];
  BW = loadBW();
  var db = buildCircularDb();
  var stats = BW.walk(db, 'CIRC', {});
  // Should terminate and log error, not crash
  assert(errors.some(function(e) { return e.indexOf('MAX_DEPTH') !== -1; }), 'MAX_DEPTH error logged');
});

// T10: collectLeaves
test('T10: MOCK — collectLeaves returns all leaf contexts', function() {
  BW = loadBW();
  var db = buildMockBomDb();
  var leaves = BW.collectLeaves(db, 'BUILDING_TEST');
  assertEq(leaves.length, 4, '4 leaves total');
  assert(leaves[0].line, 'ctx has line');
  assert(leaves[0].bom, 'ctx has bom');
});

// ── REAL DATA TESTS (require HI_BOM.db + sql.js) ────────────────────────────
var realDb = null;
var SQL = null;

try {
  var initSqlJs = require('sql.js');
  var bomPath = path.resolve(__dirname, '../../../library/HI_BOM.db');
  if (fs.existsSync(bomPath)) {
    // sql.js returns a promise
    var sqlReady = initSqlJs();
    sqlReady.then(function(sqljs) {
      SQL = sqljs;
      var buf = fs.readFileSync(bomPath);
      realDb = new SQL.Database(buf);
      console.log('  §BOM_WALKER_TEST HI_BOM.db loaded (' + buf.length + ' bytes)');
      runRealTests();
      finish();
    }).catch(function(e) {
      console.log('  SKIP  Real data tests — sql.js init failed: ' + e.message);
      finish();
    });
  } else {
    console.log('  SKIP  Real data tests — HI_BOM.db not found at ' + bomPath);
    finish();
  }
} catch(e) {
  console.log('  SKIP  Real data tests — sql.js not available: ' + e.message);
  finish();
}

function runRealTests() {
  BW = loadBW();

  // T11: listBoms
  test('T11: REAL — listBoms returns 7 BOMs', function() {
    var boms = BW.listBoms(realDb);
    assertEq(boms.length, 7, 'HI_BOM.db has 7 BOMs');
    console.log('    §BOM_WALKER_TEST boms=' + boms.map(function(b) { return b.bomId; }).join(','));
  });

  // T12: Walk BUILDING → 6 floor sub-assemblies
  test('T12: REAL — BUILDING_HI_STD → 6 sub-assemblies', function() {
    var subs = [];
    BW.walk(realDb, 'BUILDING_HI_STD', {
      onSubAssembly: function(ctx) { subs.push(ctx.line.childProductId); }
    });
    assertEq(subs.length, 6, '6 floor BOMs');
    console.log('    §BOM_WALKER_TEST floors=' + subs.join(','));
  });

  // T13: Walk 1.etg → leaves > 0
  test('T13: REAL — HI_L1_STR has leaves', function() {
    var count = 0;
    BW.walk(realDb, 'HI_L1_STR', {
      onLeaf: function() { count++; }
    });
    assert(count > 0, 'expected leaves, got ' + count);
    console.log('    §BOM_WALKER_TEST HI_L1_STR leaves=' + count);
  });

  // T14: Total leaves from BUILDING = m_bom_line LEAF count
  test('T14: REAL — total leaves match m_bom_line count', function() {
    var stats = BW.walk(realDb, 'BUILDING_HI_STD', {});
    // Count non-sub-assembly, non-PHANTOM lines in DB
    var rows = realDb.exec(
      "SELECT COUNT(*) FROM m_bom_line WHERE is_active = 1 " +
      "AND component_type != 'PHANTOM' " +
      "AND child_product_id NOT IN (SELECT bom_id FROM m_bom WHERE is_active = 1)"
    );
    var dbCount = rows[0].values[0][0];
    assertEq(stats.leafCount, dbCount, 'leaf count mismatch: walker=' + stats.leafCount + ' db=' + dbCount);
    console.log('    §BOM_WALKER_TEST totalLeaves=' + stats.leafCount + ' dbCount=' + dbCount);
  });

  // T15: walkSelf fires root onSubAssembly at level=-1
  test('T15: REAL — walkSelf fires root at level=-1', function() {
    var rootLevel = null;
    BW.walkSelf(realDb, 'BUILDING_HI_STD', {
      onSubAssembly: function(ctx) {
        if (rootLevel === null) rootLevel = ctx.level;
      }
    });
    assertEq(rootLevel, -1, 'root level=-1');
  });

  // T16: collectLeaves returns ctx with verbRef
  test('T16: REAL — collectLeaves ctx has line.verbRef', function() {
    var leaves = BW.collectLeaves(realDb, 'BUILDING_HI_STD');
    assert(leaves.length > 0);
    var withVerb = leaves.filter(function(l) { return l.line.verbRef; });
    assert(withVerb.length > 0, 'some leaves have verb_ref');
    console.log('    §BOM_WALKER_TEST withVerb=' + withVerb.length + '/' + leaves.length);
  });

  // T17: Leaf ctx has role (IFC class)
  test('T17: REAL — leaf ctx has role', function() {
    var leaves = BW.collectLeaves(realDb, 'BUILDING_HI_STD');
    var withRole = leaves.filter(function(l) { return l.line.role; });
    assert(withRole.length > 0, 'leaves have role');
    var roles = {};
    withRole.forEach(function(l) { roles[l.line.role] = (roles[l.line.role] || 0) + 1; });
    console.log('    §BOM_WALKER_TEST roles=' + JSON.stringify(roles));
  });

  // T18: Leaf ctx has qty and dimensions
  test('T18: REAL — leaf ctx has qty and allocated dimensions', function() {
    var leaves = BW.collectLeaves(realDb, 'BUILDING_HI_STD');
    var first = leaves[0];
    assert(first.line.qty >= 1, 'qty >= 1');
    assert(typeof first.line.allocWidth === 'number', 'allocWidth is number');
  });

  // T19: Verb types match DB
  test('T19: REAL — verb_ref types are CLUSTER, TILE, ROUTE only', function() {
    var leaves = BW.collectLeaves(realDb, 'BUILDING_HI_STD');
    var verbTypes = {};
    leaves.forEach(function(l) {
      if (l.line.verbRef) {
        var prefix = l.line.verbRef.substring(0, l.line.verbRef.indexOf(':'));
        verbTypes[prefix] = (verbTypes[prefix] || 0) + 1;
      }
    });
    var types = Object.keys(verbTypes).sort();
    console.log('    §BOM_WALKER_TEST verbTypes=' + JSON.stringify(verbTypes));
    // HI_BOM.db only has CLUSTER, TILE, ROUTE
    types.forEach(function(t) {
      assert(['CLUSTER', 'TILE', 'ROUTE'].indexOf(t) !== -1, 'unexpected verb: ' + t);
    });
  });

  // T20: Performance
  test('T20: REAL — full BUILDING walk < 100ms', function() {
    var t0 = Date.now();
    BW.walk(realDb, 'BUILDING_HI_STD', {});
    var ms = Date.now() - t0;
    assert(ms < 100, 'took ' + ms + 'ms (limit 100ms)');
    console.log('    §BOM_WALKER_TEST perf=' + ms + 'ms');
  });
}

function finish() {
  console.log('\n§TEST_BOM_WALKER ' + pass + '/' + total + ' PASS' +
    (fail ? ', ' + fail + ' FAIL' : '') + '\n');
  process.exit(fail ? 1 : 0);
}
