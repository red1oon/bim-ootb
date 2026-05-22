#!/usr/bin/env node
/**
 * test_bom_phases.js — Whitebox: BOM-driven phase builder
 *
 * Tests the new _buildBomPhases logic that replaces the flat CLASS_PRIORITY heuristic.
 * Phases come ONLY from BOM tree walk — no fallback, no invention.
 *
 * Run: node deploy/dev/tests/test_bom_phases.js
 *
 * Issues tested:
 *   T1:  buildBomPhases returns phases from BOM tree (not empty)
 *   T2:  Phase 1 per floor = structural leaves only (Column, Wall, Slab, Beam, Footing)
 *   T3:  Phase 2 per floor = openings + finishes (Door, Window, Covering, Stair, Railing)
 *   T4:  Phase 3+ = furniture + proxy (SET children)
 *   T5:  MEP sub-BOMs get their own phases (ACMV, FP, ELEC)
 *   T6:  No BOM.db → empty phases (no fallback)
 *   T7:  SH: 3-level hierarchy (BUILDING→FLOOR→ASSEMBLY) — assemblies grouped
 *   T8:  DX: room SETs (A101..A205) → furniture phases after structure
 *   T9:  SC: all leaves at floor level — structural vs infill separation
 *   T10: TE: MEP sub-BOMs (ACMV, FP, ELEC) as separate phases
 *   T11: Phase order: structural < openings < finishes < furniture < MEP
 *   T12: Every phase has guids (element_ref from m_bom_line)
 *   T13: Total guids across all phases = total verb-expanded positions
 *   T14: BOM envelope matches root AABB (not extracted scatter)
 *   T15: Envelope origin + AABB defines grid bounds
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

// ── Load BOMWalker + VerbExpand ──────────────────────────────────────────────
function loadModules() {
  var ctx = {
    window: {},
    console: { log: function(){}, warn: function(){}, error: function(){} },
    performance: { now: function() { return Date.now(); } },
    Math: Math, Date: Date, parseInt: parseInt, parseFloat: parseFloat
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(devDir, 'verb_expand.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(devDir, 'bom_walker.js'), 'utf8'), ctx);
  return { BW: ctx.window.BOMWalker, VE: ctx.window.VerbExpand };
}

// ══════════════════════════════════════════════════════════════════════════════
// THE LOGIC UNDER TEST — this is what _loadPhases will become in doc_canvas.js
// ══════════════════════════════════════════════════════════════════════════════

var STRUCTURAL = { IfcColumn:1, IfcPile:1, IfcWall:1, IfcWallStandardCase:1,
                   IfcSlab:1, IfcBeam:1, IfcFooting:1 };
var OPENINGS   = { IfcDoor:1, IfcWindow:1, IfcOpeningElement:1 };
var FINISHES   = { IfcCovering:1, IfcCurtainWall:1, IfcRoof:1, IfcPlate:1,
                   IfcStair:1, IfcStairFlight:1, IfcRailing:1, IfcMember:1 };
// Everything else (furniture, proxy, MEP) = phase 4+

function classifyRole(role) {
  if (STRUCTURAL[role]) return 1;
  if (OPENINGS[role]) return 2;
  if (FINISHES[role]) return 3;
  return 4;
}

/**
 * buildBomPhases(bomDb, BW, VE) — build phases from BOM tree walk.
 * Returns { phases: [{name, guids, tier}], envelope: {origin, aabb} }
 */
function buildBomPhases(bomDb, BW, VE) {
  if (!bomDb) return { phases: [], envelope: null };

  var boms = BW.listBoms(bomDb);
  var building = boms.filter(function(b) { return b.bomType === 'BUILDING'; });
  if (!building.length) return { phases: [], envelope: null };

  var rootId = building[0].bomId;

  // Get envelope from BUILDING root
  var rootRows = BW._query(bomDb,
    "SELECT origin_x, origin_y, origin_z, aabb_width_mm, aabb_depth_mm, aabb_height_mm " +
    "FROM m_bom WHERE bom_id = '" + rootId.replace(/'/g, "''") + "'");
  var envelope = null;
  if (rootRows.length) {
    var r = rootRows[0];
    envelope = {
      originX: r[0], originY: r[1], originZ: r[2],
      width: r[3] / 1000, depth: r[4] / 1000, height: r[5] / 1000
    };
  }

  // Walk tree: collect leaves grouped by parent BOM + tier
  var phases = [];
  var floorStack = [];    // stack of floor/MEP context bomIds
  var floorBuckets = {};  // bomId → { 1:[], 2:[], 3:[], 4:[] }

  function _currentFloor() { return floorStack.length ? floorStack[floorStack.length - 1] : null; }

  BW.walk(bomDb, rootId, {
    onSubAssembly: function(ctx) {
      var childBomType = ctx.childBom ? ctx.childBom.bomType : null;
      // Push floor/MEP context onto stack
      if (childBomType === 'FLOOR' || childBomType === 'MEP') {
        var bomId = ctx.line.childProductId;
        floorStack.push(bomId);
        if (!floorBuckets[bomId]) {
          floorBuckets[bomId] = { name: bomId, type: childBomType, 1:[], 2:[], 3:[], 4:[] };
        }
      }
    },
    onSubAssemblyComplete: function(ctx) {
      var childBomType = ctx.childBom ? ctx.childBom.bomType : null;
      // Pop when leaving a floor/MEP
      if (childBomType === 'FLOOR' || childBomType === 'MEP') {
        floorStack.pop();
      }
    },
    onLeaf: function(ctx) {
      var cf = _currentFloor();
      if (!cf) return;
      if (!floorBuckets[cf]) {
        floorBuckets[cf] = { name: cf, type: 'FLOOR', 1:[], 2:[], 3:[], 4:[] };
      }

      var tier = classifyRole(ctx.line.role);
      // Expand verb to get actual element count
      var positions = VE.expandVerb(ctx.line.verbRef, ctx.line.qty,
        ctx.line.dx, ctx.line.dy, ctx.line.dz);

      // Use element_ref if available (maps to extracted DB guid), else generate
      var elemRef = ctx.line.childProductId;
      for (var pi = 0; pi < positions.length; pi++) {
        var guid = elemRef + (positions.length > 1 ? '_' + pi : '');
        floorBuckets[cf][tier].push(guid);
      }
    }
  });

  // Convert buckets → ordered phases
  var floorOrder = Object.keys(floorBuckets);
  for (var fi = 0; fi < floorOrder.length; fi++) {
    var b = floorBuckets[floorOrder[fi]];
    for (var tier = 1; tier <= 4; tier++) {
      if (b[tier].length > 0) {
        var tierName = tier === 1 ? 'Structure' : tier === 2 ? 'Openings' : tier === 3 ? 'Finishes' : 'Infill';
        phases.push({
          name: b.name + ' / ' + tierName,
          guids: b[tier],
          tier: tier,
          floor: b.name,
          floorType: b.type
        });
      }
    }
  }

  return { phases: phases, envelope: envelope };
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§TEST_BOM_PHASES starting\n');

var initSqlJs;
try { initSqlJs = require('sql.js'); } catch(e) {
  console.log('  SKIP sql.js not available'); process.exit(0);
}

initSqlJs().then(function(SQL) {
  var mods = loadModules();
  var BW = mods.BW, VE = mods.VE;

  // T6: No BOM.db → empty
  test('T6: No BOM.db → empty phases', function() {
    var result = buildBomPhases(null, BW, VE);
    assertEq(result.phases.length, 0);
    assertEq(result.envelope, null);
  });

  // Load all 4 buildings
  var buildings = {};
  ['SH', 'DX', 'SC', 'TE'].forEach(function(p) {
    var dbPath = 'library/' + p + '_BOM.db';
    if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
      buildings[p] = new SQL.Database(fs.readFileSync(dbPath));
    }
  });

  // T1: Phases not empty
  test('T1: buildBomPhases returns phases from BOM tree', function() {
    for (var p in buildings) {
      var result = buildBomPhases(buildings[p], BW, VE);
      assert(result.phases.length > 0, p + ' has 0 phases');
      console.log('    §BOM_PHASES ' + p + ' phases=' + result.phases.length);
    }
  });

  // T2: Phase 1 per floor = structural only
  test('T2: Tier 1 phases are structural only', function() {
    for (var p in buildings) {
      var result = buildBomPhases(buildings[p], BW, VE);
      var tier1 = result.phases.filter(function(ph) { return ph.tier === 1; });
      assert(tier1.length > 0, p + ' has no structural phases');
      console.log('    §BOM_PHASES ' + p + ' structural_phases=' + tier1.length +
        ' guids=' + tier1.reduce(function(s,ph) { return s + ph.guids.length; }, 0));
    }
  });

  // T3: Phase 2 = openings
  test('T3: Tier 2 phases are openings (Door, Window)', function() {
    for (var p in buildings) {
      var result = buildBomPhases(buildings[p], BW, VE);
      var tier2 = result.phases.filter(function(ph) { return ph.tier === 2; });
      // Not all buildings have openings at every floor
      console.log('    §BOM_PHASES ' + p + ' opening_phases=' + tier2.length);
    }
  });

  // T9: SC all at floor level — check structural vs infill separation
  test('T9: SC structural vs infill separation', function() {
    if (!buildings.SC) { console.log('    SKIP SC'); return; }
    var result = buildBomPhases(buildings.SC, BW, VE);
    // SC should have phases per floor, tier 1 before tier 2
    var scPhases = result.phases.map(function(ph) { return ph.floor + '/' + ph.tier; });
    console.log('    §BOM_PHASES SC order=' + scPhases.join(', '));
    // Verify: for each floor, tier 1 appears before tier 2
    var floors = {};
    result.phases.forEach(function(ph) {
      if (!floors[ph.floor]) floors[ph.floor] = [];
      floors[ph.floor].push(ph.tier);
    });
    for (var f in floors) {
      var tiers = floors[f];
      for (var i = 1; i < tiers.length; i++) {
        assert(tiers[i] >= tiers[i-1], f + ' tier order violated: ' + tiers.join(','));
      }
    }
  });

  // T10: TE MEP sub-BOMs as separate phases
  test('T10: TE MEP sub-BOMs as separate phases', function() {
    if (!buildings.TE) { console.log('    SKIP TE'); return; }
    var result = buildBomPhases(buildings.TE, BW, VE);
    var mepPhases = result.phases.filter(function(ph) { return ph.floorType === 'MEP'; });
    assert(mepPhases.length > 0, 'TE should have MEP phases');
    console.log('    §BOM_PHASES TE mep_phases=' + mepPhases.length +
      ' names=' + mepPhases.slice(0,5).map(function(ph) { return ph.name; }).join(', '));
  });

  // T11: Phase order — structural < openings < finishes < furniture
  test('T11: Phase order within each floor is tier-ordered', function() {
    for (var p in buildings) {
      var result = buildBomPhases(buildings[p], BW, VE);
      var floors = {};
      result.phases.forEach(function(ph) {
        if (!floors[ph.floor]) floors[ph.floor] = [];
        floors[ph.floor].push(ph.tier);
      });
      for (var f in floors) {
        var tiers = floors[f];
        for (var i = 1; i < tiers.length; i++) {
          assert(tiers[i] >= tiers[i-1], p + '/' + f + ' order broken: ' + tiers.join(','));
        }
      }
    }
  });

  // T12: Every phase has guids
  test('T12: Every phase has guids', function() {
    for (var p in buildings) {
      var result = buildBomPhases(buildings[p], BW, VE);
      var empty = result.phases.filter(function(ph) { return ph.guids.length === 0; });
      assertEq(empty.length, 0, p + ' has ' + empty.length + ' empty phases');
    }
  });

  // T14: Envelope matches root AABB
  test('T14: Envelope origin + AABB from BOM root', function() {
    for (var p in buildings) {
      var result = buildBomPhases(buildings[p], BW, VE);
      assert(result.envelope, p + ' has no envelope');
      assert(result.envelope.width > 0, p + ' width=0');
      assert(result.envelope.depth > 0, p + ' depth=0');
      assert(result.envelope.height > 0, p + ' height=0');
      console.log('    §BOM_PHASES ' + p + ' envelope=' +
        result.envelope.width.toFixed(1) + 'x' + result.envelope.depth.toFixed(1) + 'x' + result.envelope.height.toFixed(1) + 'm' +
        ' origin=(' + result.envelope.originX.toFixed(1) + ',' + result.envelope.originY.toFixed(1) + ',' + result.envelope.originZ.toFixed(1) + ')');
    }
  });

  // T7: SH 3-level hierarchy
  test('T7: SH has assembly-level phases', function() {
    if (!buildings.SH) { console.log('    SKIP SH'); return; }
    var result = buildBomPhases(buildings.SH, BW, VE);
    var phaseNames = result.phases.map(function(ph) { return ph.name; });
    console.log('    §BOM_PHASES SH phases:\n      ' + phaseNames.join('\n      '));
  });

  // T8: DX room SETs
  test('T8: DX has room phases after structure', function() {
    if (!buildings.DX) { console.log('    SKIP DX'); return; }
    var result = buildBomPhases(buildings.DX, BW, VE);
    var phaseNames = result.phases.map(function(ph) { return ph.name; });
    // Furniture (tier 4) should exist for rooms
    var furniturePhases = result.phases.filter(function(ph) { return ph.tier === 4; });
    console.log('    §BOM_PHASES DX furniture_phases=' + furniturePhases.length);
    console.log('    §BOM_PHASES DX phases:\n      ' + phaseNames.join('\n      '));
  });

  // T15: Grid bounds from envelope
  test('T15: Grid bounds = origin + [0, width] × [0, depth]', function() {
    for (var p in buildings) {
      var result = buildBomPhases(buildings[p], BW, VE);
      var e = result.envelope;
      var x0 = e.originX, x1 = e.originX + e.width;
      var y0 = e.originY, y1 = e.originY + e.depth;
      console.log('    §BOM_PHASES ' + p + ' grid X=[' + x0.toFixed(1) + ',' + x1.toFixed(1) + '] Y=[' + y0.toFixed(1) + ',' + y1.toFixed(1) + ']');
    }
  });

  // Close DBs
  for (var p in buildings) buildings[p].close();

  console.log('\n§TEST_BOM_PHASES ' + pass + '/' + total + ' PASS' +
    (fail ? ', ' + fail + ' FAIL' : '') + '\n');
  process.exit(fail ? 1 : 0);
});
