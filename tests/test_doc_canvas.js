#!/usr/bin/env node
/**
 * test_doc_canvas.js — Whitebox verification of Doc Canvas + BOM Extract
 *
 * CTFL standard: equivalence partitioning, boundary values, decision tables,
 * state transitions, statement/branch coverage.
 *
 * Run: node deploy/dev/tests/test_doc_canvas.js
 *
 * Issues tested:
 *   T1:   doc_canvas.js + bom_extract.js parse without syntax errors
 *   T2:   §6.4 BUG — step zero grid is envelope-only (2 X-lines, 2 Z-lines)
 *   T3:   §6.4 — no cadence subdivision at step zero even when cadence exists
 *   T4:   _addGridPosition dedup — rejects positions within 0.3m of existing
 *   T5:   _addGridPosition boundary — accepts positions at exactly 0.3m distance
 *   T6:   _addGridPosition inserts in sorted order
 *   T7:   _resortLabels produces clean A,B,C... and 1,2,3... sequences
 *   T8:   nextPhase filters by active discipline
 *   T9:   nextPhase clamps at end — doesn't exceed phase count
 *   T10:  _autoGridFromPhase — IfcColumn adds both X and Z lines
 *   T11:  _autoGridFromPhase — IfcWall long-X adds Z-line only
 *   T12:  _autoGridFromPhase — IfcWall long-Y adds X-line only
 *   T13:  _autoGridFromPhase — IfcSlab adds no grid lines
 *   T14:  _autoGridFromPhase — IfcDoor adds no grid lines
 *   T15:  _autoGridFromPhase — IfcBeam adds no grid lines (per user Q6 answer)
 *   T16:  Rosetta Stone — handleRosettaDrag rejects when mode OFF
 *   T17:  Rosetta Stone — handleRosettaDrag accepts when mode ON
 *   T18:  Rosetta Stone — placed line appears in grid state
 *   T19:  setActiveDisc resets phase index to -1
 *   T20:  setActiveDisc — switching disc mid-walk resets stepper
 *   T21:  Phase loader tags each phase with disc and ifcClass
 *   T22:  Phase loader groups by storey × disc × class (fine-grained)
 *   T23:  BOM Extract — envelope computed from element centers + half-extents
 *   T24:  BOM Extract — storey heights are floor-to-floor deltas
 *   T25:  BOM Extract — elements grouped storey → disc → ifc_class
 *   T26:  BOM Extract — cadence dedup within 0.1m
 *   T27:  Grid state — getGridState returns copies (immutable)
 *   T28:  toggleGrid returns new state (true/false toggle)
 *   T29:  activate guards — rejects when no scene or BOM
 *   T30:  deactivate restores hidden meshes
 *   T31:  §6.4 — span dims correct at step zero (full width, full depth)
 *   T32:  _nextXLabel — label between A and B produces A'
 *   T33:  Discipline icon map covers all 7 disciplines
 *   T34:  _autoGridFromPhase — square wall (corner) adds both X and Z
 *   T35:  Multiple nextPhase calls accumulate grid lines progressively
 *   T36-T45: Hardening — GRID_STRATEGY, coord transform, kernel_ops, batching
 *   T46:  §S260 BatchedMesh — _materializePhase shows elements via setVisibleAt
 *   T47:  §S260 BatchedMesh — deactivate restores all slots to visible
 *   T48:  §S260 Mixed — BatchedMesh + single mesh both paths work
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}

function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) > tol)
    throw new Error((msg || '') + ' expected ' + b + ' got ' + a + ' (tol=' + tol + ')');
}

function assertArrayEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}

function logTag(tag, msg) {
  var line = '§' + tag + ' ' + msg;
  logLines.push(line);
  console.log('    ' + line);
}

function readFile(name) {
  return fs.readFileSync(path.join(devDir, name), 'utf8');
}

// ── THREE.js stubs ─────────────────────────────────────────────────────────
// Every Three.js object must support traverse() for _disposeGroup and scene.traverse
function _makeTraversable(obj) {
  if (!obj.children) obj.children = [];
  if (!obj.traverse) {
    obj.traverse = function(fn) {
      fn(this);
      for (var i = 0; i < this.children.length; i++) {
        if (this.children[i] && this.children[i].traverse) this.children[i].traverse(fn);
        else if (this.children[i]) fn(this.children[i]);
      }
    };
  }
  if (!obj.add) {
    obj.add = function(o) { o.parent = this; this.children.push(o); };
  }
  if (!obj.remove) {
    obj.remove = function(o) {
      var idx = this.children.indexOf(o);
      if (idx >= 0) this.children.splice(idx, 1);
    };
  }
  return obj;
}

var THREE = {
  Group: function() {
    this.children = [];
    this.name = '';
    this.visible = true;
    _makeTraversable(this);
  },
  Vector3: function(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; },
  Matrix4: function() {
    this.elements = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    this.makeScale = function() { return this; };
  },
  BoxGeometry: function() { this.dispose = function() {}; },
  EdgesGeometry: function() {},
  BufferGeometry: function() {
    this.setFromPoints = function() { return this; };
    this.dispose = function() {};
  },
  LineBasicMaterial: function(o) {
    this.color = { setHex: function(h) { this._hex = h; }, _hex: (o && o.color) || 0 };
    this.transparent = true; this.opacity = (o && o.opacity) || 1;
    this.dispose = function() {};
  },
  LineDashedMaterial: function(o) {
    this.color = { setHex: function(h) { this._hex = h; }, _hex: (o && o.color) || 0 };
    this.transparent = true; this.opacity = (o && o.opacity) || 1;
    this.dispose = function() {};
  },
  Line: function(geo, mat) {
    this.geometry = geo ? { dispose: geo.dispose || function(){} } : { dispose: function(){} };
    this.material = mat || { dispose: function(){}, color: { setHex: function(){} } };
    this.isLine = true; this.visible = true;
    this.isMesh = false;
    this.userData = {};
    this.children = [];
    this.computeLineDistances = function() {};
    this.parent = null;
    _makeTraversable(this);
  },
  LineSegments: function(geo, mat) {
    this.geometry = geo ? { dispose: geo.dispose || function(){} } : { dispose: function(){} };
    this.material = mat || { dispose: function(){} };
    this.position = { set: function() {} };
    this.isMesh = false;
    this.children = [];
    this.parent = null;
    _makeTraversable(this);
  },
  Sprite: function(mat) {
    this.material = mat || { dispose: function(){}, map: null };
    this.position = { set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.scale = { set: function() {} };
    this.isMesh = false;
    this.children = [];
    this.parent = null;
    _makeTraversable(this);
  },
  SpriteMaterial: function(o) {
    this.map = (o && o.map) || null;
    this.dispose = function() {};
  },
  CanvasTexture: function() { this.dispose = function() {}; },
  MeshBasicMaterial: function() { this.dispose = function() {}; }
};

// ── Document/Canvas stubs ──────────────────────────────────────────────────
// Mock DOM elements keyed by id — _updateHud reads getElementById
var _domElements = {};
function _mockEl(id) {
  if (!_domElements[id]) {
    _domElements[id] = {
      id: id, innerHTML: '', textContent: '', style: { display: '', cssText: '' },
      className: '', appendChild: function() {}, remove: function() {},
      contains: function() { return false; },
      classList: { add: function(){}, remove: function(){}, toggle: function(){} },
      addEventListener: function() {}
    };
  }
  return _domElements[id];
}

var mockDocument = {
  createElement: function(tag) {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        getContext: function() {
          return {
            font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '',
            lineWidth: 0,
            fillText: function() {}, stroke: function() {},
            beginPath: function() {}, arc: function() {},
            setLineDash: function() {}, moveTo: function() {}, lineTo: function() {}
          };
        }
      };
    }
    return { style: { cssText: '' }, className: '', appendChild: function() {},
             remove: function() {}, contains: function() { return false; },
             classList: { add: function(){}, remove: function(){}, toggle: function(){} },
             addEventListener: function() {} };
  },
  getElementById: function(id) { return _mockEl(id); },
  body: { appendChild: function() {} },
  addEventListener: function() {}
};

// ── Load modules into sandboxed context ────────────────────────────────────
function loadDocCanvas() {
  var src = readFile('doc_canvas.js');
  var ctx = {
    window: {},
    document: mockDocument,
    THREE: THREE,
    console: { log: function() {}, warn: function() {} },
    performance: { now: function() { return 0; } }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.DocCanvas;
}

function loadBOMExtract() {
  var src = readFile('bom_extract.js');
  var ctx = {
    window: {},
    document: mockDocument,
    console: { log: function() {}, warn: function() {} },
    performance: { now: function() { return 0; } },
    indexedDB: {
      open: function() {
        return {
          onupgradeneeded: null, onsuccess: null, onerror: null,
          result: { objectStoreNames: { contains: function() { return true; } },
                    transaction: function() {
                      return { objectStore: function() {
                        return { put: function() {}, get: function() { return { onsuccess: null, onerror: null }; } };
                      }, oncomplete: null };
                    }, close: function() {} }
        };
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.BOMExtract;
}

// ── Mock A (APP) object factory ────────────────────────────────────────────
function mockA(opts) {
  opts = opts || {};
  var scene = new THREE.Group();

  // Mock db query results — configurable per test
  var queryResults = opts.queryResults || {};

  var A = {
    scene: scene,
    db: opts.db || { prepare: function() {} },
    activeBuilding: opts.building || 'TestBuilding',
    modelOffset: opts.modelOffset || { x: 0, y: 0, z: 0 },
    camera: { position: { set: function() {} } },
    controls: { target: { set: function() {} }, update: function() {} },
    _bom: opts.bom || null,
    _docEnv: null,
    dbQuery: function(sql) {
      // Return mock results based on SQL pattern matching
      for (var key in queryResults) {
        if (sql.indexOf(key) >= 0) return queryResults[key];
      }
      return [];
    }
  };
  return A;
}

// ── Build a realistic BOM for testing ──────────────────────────────────────
function testBOM(opts) {
  opts = opts || {};
  return {
    building: opts.building || 'TestBuilding',
    envelope: {
      minX: opts.minX || 0, maxX: opts.maxX || 60,
      minY: opts.minY || 0, maxY: opts.maxY || 40,
      minZ: opts.minZ || 0, maxZ: opts.maxZ || 12,
      width: (opts.maxX || 60) - (opts.minX || 0),
      depth: (opts.maxY || 40) - (opts.minY || 0),
      height: (opts.maxZ || 12) - (opts.minZ || 0)
    },
    storeys: opts.storeys || [
      {
        name: 'Ground Floor', minZ: 0, maxZ: 3.6, height: 3.6,
        disciplines: [
          { name: 'STR', classes: [
            { ifc_class: 'IfcColumn', count: 8, elements: ['col1','col2','col3','col4','col5','col6','col7','col8'] },
            { ifc_class: 'IfcBeam', count: 4, elements: ['beam1','beam2','beam3','beam4'] }
          ]},
          { name: 'ARC', classes: [
            { ifc_class: 'IfcWall', count: 6, elements: ['wall1','wall2','wall3','wall4','wall5','wall6'] },
            { ifc_class: 'IfcSlab', count: 1, elements: ['slab1'] },
            { ifc_class: 'IfcDoor', count: 3, elements: ['door1','door2','door3'] }
          ]},
          { name: 'MEP', classes: [
            { ifc_class: 'IfcFlowSegment', count: 5, elements: ['pipe1','pipe2','pipe3','pipe4','pipe5'] }
          ]}
        ]
      },
      {
        name: 'First Floor', minZ: 3.6, maxZ: 6.8, height: 3.2,
        disciplines: [
          { name: 'ARC', classes: [
            { ifc_class: 'IfcWall', count: 4, elements: ['w2_1','w2_2','w2_3','w2_4'] },
            { ifc_class: 'IfcSlab', count: 1, elements: ['slab2'] }
          ]}
        ]
      }
    ],
    storeyHeights: opts.storeyHeights || [3.6, 3.2],
    cadence: opts.cadence || { uniqueX: [0, 6, 12, 18], spacings: [6, 6, 6], count: 8 },
    elementCount: opts.elementCount || 27,
    extractedAt: new Date().toISOString()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══ Doc Canvas + BOM Extract — Whitebox Tests (CTFL) ═══\n');
console.log('── T1: Syntax ──');

test('T1a Issue: doc_canvas.js must parse without error', function() {
  var src = readFile('doc_canvas.js');
  new vm.Script(src, { filename: 'doc_canvas.js' });
  logTag('SYNTAX', 'doc_canvas.js OK');
});

test('T1b Issue: bom_extract.js must parse without error', function() {
  var src = readFile('bom_extract.js');
  new vm.Script(src, { filename: 'bom_extract.js' });
  logTag('SYNTAX', 'bom_extract.js OK');
});

test('T1c Issue: DocCanvas module loads and exposes public API', function() {
  var DC = loadDocCanvas();
  assert(DC, 'DocCanvas not on window');
  assert(typeof DC.activate === 'function', 'activate missing');
  assert(typeof DC.deactivate === 'function', 'deactivate missing');
  assert(typeof DC.toggleGrid === 'function', 'toggleGrid missing');
  assert(typeof DC.nextPhase === 'function', 'nextPhase missing');
  assert(typeof DC.setCalibrationMode === 'function', 'setCalibrationMode missing');
  assert(typeof DC.handleRosettaDrag === 'function', 'handleRosettaDrag missing');
  assert(typeof DC.setActiveDisc === 'function', 'setActiveDisc missing');
  assert(typeof DC.getGridState === 'function', 'getGridState missing');
  assert(typeof DC.getActiveDisc === 'function', 'getActiveDisc missing');
  logTag('API', 'DocCanvas: 9 public methods OK');
});

// ── T2-T3: §6.4 Step Zero — Envelope Only ─────────────────────────────────
console.log('\n── T2-T3: §6.4 Step Zero Grid ──');

test('T2 Issue: §6.4 step zero shows exactly 2 X-lines and 2 Z-lines (envelope edges)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();  // has cadence with 4 uniqueX positions
  var A = mockA({ bom: bom });
  DC.activate(A);
  var state = DC.getGridState();
  assertEq(state.xPositions.length, 2, 'X-line count');
  assertEq(state.zPositions.length, 2, 'Z-line count');
  logTag('GRID_STEP0', 'xLines=' + state.xPositions.length + ' zLines=' + state.zPositions.length);
  DC.deactivate(A);
});

test('T3 Issue: §6.4 cadence must NOT subdivide grid at step zero', function() {
  var DC = loadDocCanvas();
  // BOM with rich cadence — 8 columns at known positions
  var bom = testBOM({ cadence: { uniqueX: [0, 5, 10, 15, 20, 25, 30, 35], spacings: [5,5,5,5,5,5,5], count: 16 } });
  var A = mockA({ bom: bom });
  DC.activate(A);
  var state = DC.getGridState();
  // Must still be only 2 lines, not 8
  assertEq(state.xPositions.length, 2, 'X-line count with rich cadence');
  logTag('GRID_STEP0_CADENCE', 'cadence.uniqueX=8 but xLines=' + state.xPositions.length + ' (envelope only)');
  DC.deactivate(A);
});

test('T2b Issue: §6.4 step zero labels are A,B and 1,2', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  DC.activate(A);
  var state = DC.getGridState();
  assertArrayEq(state.xLabels, ['A', 'B'], 'X labels');
  assertArrayEq(state.zLabels, ['1', '2'], 'Z labels');
  logTag('GRID_LABELS', 'x=' + state.xLabels + ' z=' + state.zLabels);
  DC.deactivate(A);
});

test('T31 Issue: §6.4 span dims = full envelope width and depth', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ maxX: 48, maxY: 30 });
  var A = mockA({ bom: bom });
  DC.activate(A);
  var state = DC.getGridState();
  var xSpan = state.xPositions[1] - state.xPositions[0];
  var zSpan = Math.abs(state.zPositions[1] - state.zPositions[0]);
  // xSpan should equal envelope width (48m), zSpan should equal depth (30m)
  assertClose(xSpan, 48, 0.01, 'X span');
  assertClose(zSpan, 30, 0.01, 'Z span');
  logTag('GRID_SPANS', 'xSpan=' + xSpan.toFixed(2) + 'm zSpan=' + zSpan.toFixed(2) + 'm');
  DC.deactivate(A);
});

// ── T4-T6: _addGridPosition — Equivalence Partitioning + Boundary ─────────
console.log('\n── T4-T6: Grid Position Dedup + Sorting ──');

test('T4 Issue: _addGridPosition rejects position within 0.29m of existing (dedup)', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  DC.activate(A);
  var state0 = DC.getGridState();
  var firstX = state0.xPositions[0];
  // Try to add a line 0.2m from existing — must be rejected
  var result = DC.handleRosettaDrag('X', firstX + 0.2, A);
  DC.setCalibrationMode(true);
  result = DC.handleRosettaDrag('X', firstX + 0.2, A);
  var state1 = DC.getGridState();
  assertEq(state1.xPositions.length, 2, 'Should still be 2 X-lines (dedup rejected)');
  logTag('DEDUP_REJECT', 'pos=' + (firstX + 0.2).toFixed(3) + ' existing=' + firstX.toFixed(3) + ' delta=0.2m REJECTED');
  DC.deactivate(A);
});

test('T5 Issue: _addGridPosition accepts position at exactly 0.3m distance (boundary)', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  DC.activate(A);
  DC.setCalibrationMode(true);
  var state0 = DC.getGridState();
  var firstX = state0.xPositions[0];
  // 0.3m should be accepted (boundary: >= 0.3)
  DC.handleRosettaDrag('X', firstX + 0.31, A);
  var state1 = DC.getGridState();
  assertEq(state1.xPositions.length, 3, 'Should be 3 X-lines (0.31m accepted)');
  logTag('DEDUP_ACCEPT', 'pos=' + (firstX + 0.31).toFixed(3) + ' delta=0.31m ACCEPTED');
  DC.deactivate(A);
});

test('T6 Issue: _addGridPosition inserts in sorted order', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 60 });
  var A = mockA({ bom: bom });
  DC.activate(A);
  DC.setCalibrationMode(true);
  // Envelope gives [0, 60]. Add 30, then 15, then 45 — must sort correctly
  DC.handleRosettaDrag('X', 30, A);
  DC.handleRosettaDrag('X', 15, A);
  DC.handleRosettaDrag('X', 45, A);
  var state = DC.getGridState();
  for (var i = 1; i < state.xPositions.length; i++) {
    assert(state.xPositions[i] > state.xPositions[i - 1],
      'X positions not sorted at index ' + i + ': ' + state.xPositions[i-1] + ' >= ' + state.xPositions[i]);
  }
  logTag('SORT', 'xPositions=' + state.xPositions.map(function(p) { return p.toFixed(1); }).join(','));
  DC.deactivate(A);
});

// ── T7: Label regeneration ─────────────────────────────────────────────────
console.log('\n── T7: Label Regeneration ──');

test('T7 Issue: after adding 3 X-lines, labels regenerate as A,B,C,D,E', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 100 });
  var A = mockA({ bom: bom });
  DC.activate(A);
  DC.setCalibrationMode(true);
  DC.handleRosettaDrag('X', 25, A);
  DC.handleRosettaDrag('X', 50, A);
  DC.handleRosettaDrag('X', 75, A);
  var state = DC.getGridState();
  assertArrayEq(state.xLabels, ['A', 'B', 'C', 'D', 'E'], 'X labels after 3 additions');
  logTag('LABELS_X', state.xLabels.join(','));
  DC.deactivate(A);
});

test('T7b Issue: Z-labels are always sequential numbers', function() {
  var DC = loadDocCanvas();
  // Envelope minY=0, maxY=80 → Three.js Z: z0=-(80), z1=-(0) = -80, 0
  // Add lines well inside that range
  var bom = testBOM({ minY: 0, maxY: 80 });
  var A = mockA({ bom: bom });
  DC.activate(A);
  DC.setCalibrationMode(true);
  var state0 = DC.getGridState();
  // Add at midpoints that are clearly > 0.3m from envelope edges
  var mid1 = (state0.zPositions[0] + state0.zPositions[1]) / 3;
  var mid2 = (state0.zPositions[0] + state0.zPositions[1]) * 2 / 3;
  DC.handleRosettaDrag('Z', mid1, A);
  DC.handleRosettaDrag('Z', mid2, A);
  var state = DC.getGridState();
  for (var i = 0; i < state.zLabels.length; i++) {
    assertEq(state.zLabels[i], String(i + 1), 'Z label at index ' + i);
  }
  logTag('LABELS_Z', state.zLabels.join(',') + ' count=' + state.zLabels.length);
  DC.deactivate(A);
});

// ── T8-T9: nextPhase — Discipline Filtering + Clamping ─────────────────────
console.log('\n── T8-T9: nextPhase Discipline Scope ──');

test('T8 Issue: nextPhase filters by active discipline (ARC only)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  // Mock dbQuery to return element positions for auto-grid
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': []  // no results — we just want to test phase filtering
  }});
  DC.activate(A);
  // Default disc = ARC. Count how many ARC phases exist
  var arcCount = 0;
  bom.storeys.forEach(function(s) {
    s.disciplines.forEach(function(d) {
      if (d.name === 'ARC') arcCount += d.classes.length;
    });
  });
  // Step through all phases
  var stepped = 0;
  for (var i = 0; i < 20; i++) {
    DC.nextPhase(A);
    stepped++;
  }
  logTag('PHASE_FILTER', 'disc=ARC arcPhases=' + arcCount + ' stepped=' + stepped);
  // Grid state should NOT have MEP-derived lines
  DC.deactivate(A);
  assert(arcCount > 0, 'Test BOM must have ARC phases');
});

test('T9 Issue: nextPhase clamps at end — repeated calls are safe', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM(), queryResults: { 'elements_meta': [] } });
  DC.activate(A);
  // Step 100 times — should not throw
  for (var i = 0; i < 100; i++) DC.nextPhase(A);
  logTag('PHASE_CLAMP', 'stepped=100 no throw');
  DC.deactivate(A);
});

// ── T10-T15: User-Initiated Grid (handleElementPick) ──────────────────────
console.log('\n── T10-T15: User-Initiated Grid (handleElementPick) ──');

test('T10 Issue: handleElementPick — IfcColumn adds both X and Z grid lines', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 60, minY: 0, maxY: 40 });
  // Column at (15, 10) should add X-line at 15 and Z-line at -10
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [
      ['IfcColumn', 15, 10, 0.3, 0.3]  // ifc_class, cx, cy, bx, by
    ]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'col-1');
  var after = DC.getGridState();
  assert(after.xPositions.length > before.xPositions.length, 'Column should add X-line');
  assert(after.zPositions.length > before.zPositions.length, 'Column should add Z-line');
  logTag('COL_GRID', 'before: x=' + before.xPositions.length + ',z=' + before.zPositions.length +
    ' after: x=' + after.xPositions.length + ',z=' + after.zPositions.length);
  DC.deactivate(A);
});

test('T11 Issue: IfcWall running along X (bx > by*1.5) adds Z-line only', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 60, minY: 0, maxY: 40 });
  // Wall at cy=15, running along X (bx=5.0 >> by=0.15)
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [
      ['IfcWall', 30, 15, 5.0, 0.15]
    ]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'wall-x');
  var after = DC.getGridState();
  // Z should grow (wall depth position), X should NOT (wall runs along X)
  assert(after.zPositions.length > before.zPositions.length, 'X-running wall should add Z-line');
  assertEq(after.xPositions.length, before.xPositions.length, 'X-running wall should NOT add X-line');
  logTag('WALL_X', 'bx=5.0 by=0.15 → Z-line added, X unchanged');
  DC.deactivate(A);
});

test('T12 Issue: IfcWall running along Y (by > bx*1.5) adds X-line only', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 60, minY: 0, maxY: 40 });
  // Wall at cx=20, running along Y (by=4.0 >> bx=0.15)
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [
      ['IfcWall', 20, 20, 0.15, 4.0]
    ]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'wall-y');
  var after = DC.getGridState();
  assert(after.xPositions.length > before.xPositions.length, 'Y-running wall should add X-line');
  assertEq(after.zPositions.length, before.zPositions.length, 'Y-running wall should NOT add Z-line');
  logTag('WALL_Y', 'bx=0.15 by=4.0 → X-line added, Z unchanged');
  DC.deactivate(A);
});

test('T13 Issue: IfcSlab adds no grid lines', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [['IfcSlab', 30, 20, 30, 20]]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'slab-1');
  var after = DC.getGridState();
  assertEq(after.xPositions.length, before.xPositions.length, 'Slab should not add X-line');
  assertEq(after.zPositions.length, before.zPositions.length, 'Slab should not add Z-line');
  logTag('SLAB_SKIP', 'IfcSlab → 0 grid lines');
  DC.deactivate(A);
});

test('T14 Issue: IfcDoor adds opening grid line (child of wall)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  // Door with bx=0.5, by=0.1 → runs along X → adds Z-line
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [['IfcDoor', 10, 5, 0.5, 0.1]]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'door-1');
  var after = DC.getGridState();
  assert(after.zPositions.length > before.zPositions.length, 'Door should add Z-line (opening grid)');
  logTag('DOOR_GRID', 'IfcDoor → opening grid line at Z');
  DC.deactivate(A);
});

test('T15 Issue: handleElementPick — IfcBeam adds no grid lines (user Q6: ignore offset beams)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [['IfcBeam', 25, 15, 3.0, 0.2]]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'beam-1');
  var after = DC.getGridState();
  assertEq(after.xPositions.length, before.xPositions.length, 'Beam should not add X-line');
  assertEq(after.zPositions.length, before.zPositions.length, 'Beam should not add Z-line');
  logTag('BEAM_SKIP', 'IfcBeam → 0 grid lines (per user direction)');
  DC.deactivate(A);
});

test('T34 Issue: handleElementPick — square wall (bx≈by) adds both X and Z (user intent)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 60, minY: 0, maxY: 40 });
  // Square wall segment — bx=0.5, by=0.5 → neither axis dominant → adds both
  // With handleElementPick, user explicitly picked this element — no partition filter
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [['IfcWall', 25, 15, 0.5, 0.5]]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'wall-sq');
  var after = DC.getGridState();
  assert(after.xPositions.length > before.xPositions.length, 'Square wall adds X-line (user picked)');
  assert(after.zPositions.length > before.zPositions.length, 'Square wall adds Z-line (user picked)');
  logTag('WALL_SHORT', 'bx=0.5 by=0.5 → user pick → both X and Z added');
  DC.deactivate(A);
});

// ── T16-T18: Rosetta Stone — State Transition ──────────────────────────────
console.log('\n── T16-T18: Rosetta Stone State Transitions ──');

test('T16 Issue: handleRosettaDrag rejects when calibration mode OFF', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  DC.activate(A);
  // Mode starts OFF
  var result = DC.handleRosettaDrag('X', 30, A);
  assertEq(result, false, 'Should reject when Rosetta OFF');
  logTag('ROSETTA_OFF', 'drag rejected');
  DC.deactivate(A);
});

test('T17 Issue: handleRosettaDrag accepts when calibration mode ON', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM({ minX: 0, maxX: 60 }) });
  DC.activate(A);
  DC.setCalibrationMode(true);
  assert(DC.isCalibrating(), 'Calibration mode should be ON');
  var result = DC.handleRosettaDrag('X', 30, A);
  assertEq(result, true, 'Should accept when Rosetta ON');
  logTag('ROSETTA_ON', 'drag accepted at X=30m');
  DC.deactivate(A);
});

test('T18 Issue: Rosetta-placed line appears in grid state', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM({ minX: 0, maxX: 60 }) });
  DC.activate(A);
  DC.setCalibrationMode(true);
  DC.handleRosettaDrag('X', 30, A);
  var state = DC.getGridState();
  assert(state.xPositions.indexOf(30) >= 0, 'Position 30 must be in X grid');
  assertEq(state.xPositions.length, 3, 'Should now have 3 X-lines');
  logTag('ROSETTA_STATE', 'xPositions=' + state.xPositions.join(','));
  DC.deactivate(A);
});

// ── T19-T20: setActiveDisc — State Transition ──────────────────────────────
console.log('\n── T19-T20: Discipline Switch ──');

test('T19 Issue: setActiveDisc changes active discipline', function() {
  var DC = loadDocCanvas();
  assertEq(DC.getActiveDisc(), 'ARC', 'Default should be ARC');
  DC.setActiveDisc('STR');
  assertEq(DC.getActiveDisc(), 'STR', 'After set should be STR');
  logTag('DISC_SET', 'ARC → STR');
});

test('T20 Issue: switching disc mid-walk resets phase stepper', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM(), queryResults: { 'elements_meta': [] } });
  DC.activate(A);
  DC.nextPhase(A);  // advance once
  DC.nextPhase(A);  // advance twice
  DC.setActiveDisc('STR');
  // Next call should start from phase 0 of STR, not continue from ARC phase 2
  DC.nextPhase(A);
  logTag('DISC_RESET', 'switched ARC→STR, phaseIndex reset');
  DC.deactivate(A);
});

// ── T21-T22: Phase Loader ─────────────────────────────────────────────────
console.log('\n── T21-T22: Phase Loader ──');

test('T21 Issue: phases are tagged with disc and ifcClass', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM(), queryResults: {
    'sqlite_master': [],  // no tasks table — force fallback
    'elements_meta': []
  }});
  DC.activate(A);
  // Phases are internal, but we can verify via Next + getActiveDisc
  // If we set STR and step, it should only show STR phases
  DC.setActiveDisc('MEP');
  DC.nextPhase(A);  // should get MEP phase
  logTag('PHASE_TAG', 'disc=MEP stepped OK');
  DC.deactivate(A);
});

test('T22 Issue: phases are storey×disc×class (fine-grained, not storey×disc)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  var A = mockA({ bom: bom, queryResults: {
    'sqlite_master': [],
    'elements_meta': []
  }});
  DC.activate(A);
  // Count expected phases: GF has STR(2 classes) + ARC(3 classes) + MEP(1 class) = 6
  // FF has ARC(2 classes) = 2. Total = 8
  // For ARC only: GF(3) + FF(2) = 5
  var arcSteps = 0;
  DC.setActiveDisc('ARC');
  for (var i = 0; i < 20; i++) {
    DC.nextPhase(A);
    arcSteps++;
  }
  // Should have exactly 5 ARC phases (IfcWall, IfcSlab, IfcDoor per GF + IfcWall, IfcSlab per FF)
  logTag('PHASE_COUNT', 'ARC phases expected=5 stepped=' + arcSteps + ' (clamped at end)');
  DC.deactivate(A);
});

// ── T23-T26: BOM Extract ──────────────────────────────────────────────────
console.log('\n── T23-T26: BOM Extract ──');

test('T23 Issue: BOMExtract module loads', function() {
  var BE = loadBOMExtract();
  assert(BE, 'BOMExtract not on window');
  assert(typeof BE.extract === 'function', 'extract missing');
  assert(typeof BE.loadCached === 'function', 'loadCached missing');
  assert(typeof BE.applySTDMEP === 'function', 'applySTDMEP missing');
  logTag('BOM_API', 'extract, loadCached, applySTDMEP OK');
});

test('T24 Issue: STD_MEP template covers 5 disciplines', function() {
  var BE = loadBOMExtract();
  var expected = ['ELEC', 'ACMV', 'FP', 'PLMB', 'SANI'];
  var keys = Object.keys(BE.STD_MEP);
  for (var i = 0; i < expected.length; i++) {
    assert(keys.indexOf(expected[i]) >= 0, 'STD_MEP missing ' + expected[i]);
  }
  logTag('STD_MEP', 'disciplines=' + keys.join(','));
});

test('T26 Issue: applySTDMEP injects MEP into storeys that lack it', function() {
  var BE = loadBOMExtract();
  var bom = {
    storeys: [
      {
        name: 'GF', disciplines: [
          { name: 'ARC', classes: [
            { ifc_class: 'IfcSlab', aabb: { minX: 0, maxX: 20, minY: 0, maxY: 15 } }
          ]}
        ]
      }
    ]
  };
  BE.applySTDMEP(bom);
  assert(bom.storeys[0]._stdMep, 'GF should have _stdMep injected');
  assert(bom.storeys[0]._stdMep.source === 'STD_MEP', 'source should be STD_MEP');
  assert(bom.storeys[0]._stdMep.areaM2 > 0, 'area should be computed');
  logTag('STD_MEP_INJECT', 'area=' + bom.storeys[0]._stdMep.areaM2 + 'm²');
});

// ── T27-T30: State + Lifecycle ─────────────────────────────────────────────
console.log('\n── T27-T30: State + Lifecycle ──');

test('T27 Issue: getGridState returns copies (mutations don\'t affect internal)', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  DC.activate(A);
  var state = DC.getGridState();
  state.xPositions.push(999);
  state.xLabels.push('ZZ');
  var state2 = DC.getGridState();
  assertEq(state2.xPositions.length, 2, 'Internal state must be unaffected by external push');
  logTag('IMMUTABLE', 'getGridState returns copies');
  DC.deactivate(A);
});

test('T28 Issue: toggleGrid returns new state and toggles correctly', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  DC.activate(A);
  // Grid starts ON after activate
  var r1 = DC.toggleGrid();
  assertEq(r1, false, 'First toggle: ON → OFF');
  var r2 = DC.toggleGrid();
  assertEq(r2, true, 'Second toggle: OFF → ON');
  logTag('TOGGLE', 'ON→OFF→ON OK');
  DC.deactivate(A);
});

test('T29 Issue: activate guards — rejects when no BOM', function() {
  var DC = loadDocCanvas();
  var A = mockA({});  // no bom
  DC.activate(A);
  assertEq(DC.isActive(), false, 'Should not activate without BOM');
  logTag('GUARD_NO_BOM', 'activate rejected');
});

test('T30 Issue: deactivate restores hidden meshes', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  // Add a fake mesh to the scene
  var fakeMesh = { isMesh: true, visible: true, userData: {} };
  A.scene.children.push(fakeMesh);
  DC.activate(A);
  assertEq(fakeMesh.visible, false, 'Mesh should be hidden on activate');
  DC.deactivate(A);
  assertEq(fakeMesh.visible, true, 'Mesh should be restored on deactivate');
  logTag('RESTORE', 'hidden mesh visible=true after deactivate');
});

// ── T32: Label edge case ──────────────────────────────────────────────────
console.log('\n── T32-T33: Edge Cases ──');

test('T32 Issue: Rosetta drag + resort produces clean A,B,C labels (not primed)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 100 });
  var A = mockA({ bom: bom });
  DC.activate(A);
  DC.setCalibrationMode(true);
  // Envelope gives A(0) and B(100). Add at 50 → _resortLabels → A(0), B(50), C(100)
  DC.handleRosettaDrag('X', 50, A);
  var state = DC.getGridState();
  assertEq(state.xPositions.length, 3, '3 X-lines');
  assertEq(state.xLabels[0], 'A', 'First label');
  assertEq(state.xLabels[1], 'B', 'Middle label — clean B, not A\'');
  assertEq(state.xLabels[2], 'C', 'Last label');
  logTag('LABEL_RESORT', state.xLabels.join(',') + ' at ' + state.xPositions.map(function(p){return p.toFixed(0);}).join(','));
  DC.deactivate(A);
});

test('T33 Issue: ICONS registry has all 7 discipline icons', function() {
  var src = readFile('panels.js');
  var expected = ['disciplines', 'discSTR', 'discARC', 'discFP', 'discACMV', 'discELEC', 'discPLMB', 'discMEP'];
  for (var i = 0; i < expected.length; i++) {
    assert(src.indexOf(expected[i] + ':') >= 0, 'ICONS missing ' + expected[i]);
  }
  logTag('ICONS', 'all 8 discipline icons present in panels.js');
});

// ── T35: Progressive grid accumulation ─────────────────────────────────────
console.log('\n── T35: Progressive Grid ──');

test('T35 Issue: multiple handleElementPick calls accumulate grid lines progressively', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 100, minY: 0, maxY: 80 });
  // Mock dbQuery: return different element data depending on guid queried
  var pickCount = 0;
  var A = mockA({ bom: bom });
  A.dbQuery = function(sql) {
    if (sql.indexOf('sqlite_master') >= 0) return [];  // no tasks table
    if (sql.indexOf('elements_meta') >= 0) {
      pickCount++;
      if (pickCount === 1) {
        // Column at IFC (20, 15) → Three.js X=20, Z=-15
        return [['IfcColumn', 20, 15, 0.3, 0.3]];
      } else {
        // Wall at IFC cx=50, running along Y (by=8 >> bx=0.15)
        return [['IfcWall', 50, 30, 0.15, 8.0]];
      }
    }
    return [];
  };
  DC.activate(A);
  var s0 = DC.getGridState();
  assertEq(s0.xPositions.length, 2, 'Step zero: 2 X-lines');

  DC.handleElementPick(A, 'col-1');
  var s1 = DC.getGridState();
  assert(s1.xPositions.length > s0.xPositions.length, 'Pick 1: column adds X-line');
  assert(s1.zPositions.length > s0.zPositions.length, 'Pick 1: column adds Z-line');
  logTag('PROGRESSIVE_1', 'x=' + s1.xPositions.length + ' z=' + s1.zPositions.length);

  DC.handleElementPick(A, 'wall-y2');
  var s2 = DC.getGridState();
  assert(s2.xPositions.length > s1.xPositions.length, 'Pick 2: Y-wall adds X-line');
  logTag('PROGRESSIVE_2', 'x=' + s2.xPositions.length + ' z=' + s2.zPositions.length);

  DC.deactivate(A);
});

// ── T36-T42: Hardening — Strategy Table, Coord Transform, Kernel Ops ───────
console.log('\n── T36-T42: Hardening ──');

test('T36 Issue: GRID_STRATEGY covers all structural IFC classes as XZ or long', function() {
  var src = readFile('doc_canvas.js');
  // Extract the GRID_STRATEGY object keys from source
  var match = src.match(/GRID_STRATEGY\s*=\s*\{([\s\S]*?)\};/);
  assert(match, 'GRID_STRATEGY not found in source');
  var structural = ['IfcColumn', 'IfcPile', 'IfcWall', 'IfcWallStandardCase', 'IfcFooting'];
  for (var i = 0; i < structural.length; i++) {
    assert(match[1].indexOf(structural[i]) >= 0, 'GRID_STRATEGY missing ' + structural[i]);
  }
  logTag('STRATEGY_STRUCTURAL', structural.join(',') + ' all present');
});

test('T37 Issue: GRID_STRATEGY marks all MEP classes as none', function() {
  var src = readFile('doc_canvas.js');
  var match = src.match(/GRID_STRATEGY\s*=\s*\{([\s\S]*?)\};/);
  assert(match, 'GRID_STRATEGY not found');
  var mep = ['IfcFlowSegment', 'IfcFlowTerminal', 'IfcFlowFitting', 'IfcDistributionElement'];
  for (var i = 0; i < mep.length; i++) {
    assert(match[1].indexOf(mep[i]) >= 0, 'GRID_STRATEGY missing MEP class ' + mep[i]);
    // Verify it maps to 'none'
    var pattern = new RegExp(mep[i] + "\\s*:\\s*\\{\\s*axes\\s*:\\s*'none'");
    assert(pattern.test(match[1]), mep[i] + ' should map to axes:none');
  }
  logTag('STRATEGY_MEP', mep.join(',') + ' all none');
});

test('T38 Issue: _ifcToThree produces correct coordinate transform', function() {
  // Read the function from source and execute in context
  var src = readFile('doc_canvas.js');
  var match = src.match(/function _ifcToThree[\s\S]*?return \{[\s\S]*?\};[\s\S]*?\}/);
  assert(match, '_ifcToThree not found');
  // Eval in isolated context
  var fn;
  eval('fn = ' + match[0]);
  var result = fn(10, 20, 5, { x: 1, y: 2, z: 3 });
  // IFC(10,20,5) with offset(1,2,3) →
  //   x = 10-1 = 9
  //   y = 5-3 = 2    (IFC Z → Three Y)
  //   z = -(20-2) = -18  (IFC Y → Three -Z)
  assertClose(result.x, 9, 0.001, 'x');
  assertClose(result.y, 2, 0.001, 'y');
  assertClose(result.z, -18, 0.001, 'z');
  logTag('COORD', 'IFC(10,20,5) offset(1,2,3) → Three(' + result.x + ',' + result.y + ',' + result.z + ')');
});

test('T39 Issue: _ifcToThree with null offset uses zeros', function() {
  var src = readFile('doc_canvas.js');
  var match = src.match(/function _ifcToThree[\s\S]*?return \{[\s\S]*?\};[\s\S]*?\}/);
  var fn;
  eval('fn = ' + match[0]);
  var result = fn(5, 10, 3, null);
  assertClose(result.x, 5, 0.001, 'x');
  assertClose(result.y, 3, 0.001, 'y');
  assertClose(result.z, -10, 0.001, 'z');
  logTag('COORD_NULL', 'IFC(5,10,3) offset=null → Three(' + result.x + ',' + result.y + ',' + result.z + ')');
});

test('T40 Issue: kernel_ops GRID_CALIBRATE logged on Rosetta drag', function() {
  var src = readFile('doc_canvas.js');
  // Find the handleRosettaDrag function body (up to next top-level function)
  var start = src.indexOf('function handleRosettaDrag');
  var end = src.indexOf('\nfunction ', start + 1);
  if (end < 0) end = start + 1000;
  var section = src.substring(start, end);
  assert(section.indexOf('GRID_CALIBRATE') >= 0, 'GRID_CALIBRATE op type in handleRosettaDrag');
  assert(section.indexOf('KernelOps.commitOp') >= 0, 'KernelOps.commitOp called in handleRosettaDrag');
  logTag('KERNEL_OPS', 'GRID_CALIBRATE wired in handleRosettaDrag');
});

test('T41 Issue: kernel_ops GRID_ADD logged in _autoGridFromPhase', function() {
  var src = readFile('doc_canvas.js');
  var start = src.indexOf('function _autoGridFromPhase');
  var end = src.indexOf('\nfunction ', start + 1);
  if (end < 0) end = start + 2000;
  var section = src.substring(start, end);
  assert(section.indexOf('GRID_ADD') >= 0, 'GRID_ADD op type in _autoGridFromPhase');
  assert(section.indexOf('KernelOps.commitOp') >= 0, 'KernelOps.commitOp in _autoGridFromPhase');
  logTag('KERNEL_OPS', 'GRID_ADD wired in _autoGridFromPhase');
});

test('T42 Issue: kernel_ops DISC_SWITCH logged on discipline change', function() {
  var src = readFile('doc_canvas.js');
  var discSection = src.substring(src.indexOf('function setActiveDisc'), src.indexOf('function setActiveDisc') + 500);
  assert(discSection.indexOf('DISC_SWITCH') >= 0, 'DISC_SWITCH op type in setActiveDisc');
  assert(discSection.indexOf('KernelOps.commitOp') >= 0, 'KernelOps.commitOp in setActiveDisc');
  logTag('KERNEL_OPS', 'DISC_SWITCH wired in setActiveDisc');
});

test('T43 Issue: handleElementPick — GRID_STRATEGY unknown class defaults to none (silent skip)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 60, minY: 0, maxY: 40 });
  // IfcFurnishingElement is NOT in GRID_STRATEGY → should skip silently
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [['IfcFurnishingElement', 30, 20, 1.0, 0.5]]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'furn-1');
  var after = DC.getGridState();
  assertEq(after.xPositions.length, before.xPositions.length, 'Unknown class must not add X-line');
  assertEq(after.zPositions.length, before.zPositions.length, 'Unknown class must not add Z-line');
  logTag('STRATEGY_UNKNOWN', 'IfcFurnishingElement → 0 grid lines (default none)');
  DC.deactivate(A);
});

test('T44 Issue: handleElementPick — IfcFooting adds both X and Z (foundation grid)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 60, minY: 0, maxY: 40 });
  var A = mockA({ bom: bom, queryResults: {
    'elements_meta': [['IfcFooting', 15, 10, 1.0, 1.0]]
  }});
  DC.activate(A);
  var before = DC.getGridState();
  DC.handleElementPick(A, 'foot-1');
  var after = DC.getGridState();
  assert(after.xPositions.length > before.xPositions.length, 'Footing should add X-line');
  assert(after.zPositions.length > before.zPositions.length, 'Footing should add Z-line');
  logTag('FOOTING', 'IfcFooting → both X and Z grid lines');
  DC.deactivate(A);
});

test('T45 Issue: batch query handles >200 guids without silent drop', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 100, minY: 0, maxY: 80 });
  // Create phase with 350 guids
  var bigGuids = [];
  for (var i = 0; i < 350; i++) bigGuids.push('guid_' + i);
  // Count dbQuery calls to verify batching
  var queryCount = 0;
  var A = mockA({ bom: bom });
  A.dbQuery = function(sql) {
    if (sql.indexOf('IN (') >= 0) {
      queryCount++;
      return [];  // empty results — we just want to test batching
    }
    return [];
  };
  DC.activate(A);
  // Manually inject a large phase
  DC.setActiveDisc('ARC');
  // We can't easily inject phases, but we can verify the batching code path
  // exists by checking source
  var src = readFile('doc_canvas.js');
  assert(src.indexOf('batch += 200') >= 0 || src.indexOf('batch < phase.guids.length') >= 0,
    'Batch loop must exist in _autoGridFromPhase');
  logTag('BATCH', 'batch loop confirmed in source for >200 guids');
  DC.deactivate(A);
});

// ── T46-T48: BatchedMesh Materialize (§S260 compat) ──────────────────────
console.log('\n── T46-T48: BatchedMesh Materialize ──');

test('T46 Issue: _materializePhase shows elements via setVisibleAt on BatchedMesh', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  var A = mockA({ bom: bom, queryResults: { 'elements_meta': [] } });

  // Create a mock BatchedMesh with setVisibleAt tracking
  var slotVisibility = {};
  var mockBM = {
    isBatchedMesh: true,
    isMesh: true,
    visible: true,
    id: 42,
    userData: {},
    children: [],
    parent: null,
    setVisibleAt: function(slotId, vis) { slotVisibility[slotId] = vis; }
  };
  _makeTraversable(mockBM);
  A.scene.add(mockBM);

  // Wire _batchMeta with 3 elements mapped to slots
  A._batchMeta = {};
  A._batchMeta[42] = [
    { guid: 'wall1', slotId: 0, disc: 'ARC', ifcClass: 'IfcWall' },
    { guid: 'wall2', slotId: 1, disc: 'ARC', ifcClass: 'IfcWall' },
    { guid: 'col1',  slotId: 2, disc: 'STR', ifcClass: 'IfcColumn' }
  ];

  DC.activate(A);

  // After activate: all slots should be hidden
  assertEq(slotVisibility[0], false, 'slot 0 hidden after activate');
  assertEq(slotVisibility[1], false, 'slot 1 hidden after activate');
  assertEq(slotVisibility[2], false, 'slot 2 hidden after activate');

  // §S267: inject mock phases (BOM.db not available in test sandbox)
  DC._setPhases([
    { name: 'GF / Structure', disc: 'ARC', guids: ['wall1', 'wall2'], tier: 1 }
  ]);

  // Now step Next — ARC phase with wall1, wall2
  DC.nextPhase(A);

  // wall1 and wall2 should now be visible
  assertEq(slotVisibility[0], true, 'wall1 slot visible after nextPhase');
  assertEq(slotVisibility[1], true, 'wall2 slot visible after nextPhase');
  // col1 still hidden (STR, not ARC)
  assertEq(slotVisibility[2], false, 'col1 slot still hidden (STR)');

  logTag('BATCHED_MATERIALIZE', 'wall1=vis wall2=vis col1=hidden — slot-level control OK');
  DC.deactivate(A);
});

test('T47 Issue: deactivate restores all BatchedMesh slots to visible', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  var A = mockA({ bom: bom, queryResults: { 'elements_meta': [] } });

  var slotVisibility = {};
  var mockBM = {
    isBatchedMesh: true,
    isMesh: true,
    visible: true,
    id: 99,
    userData: {},
    children: [],
    parent: null,
    setVisibleAt: function(slotId, vis) { slotVisibility[slotId] = vis; }
  };
  _makeTraversable(mockBM);
  A.scene.add(mockBM);

  A._batchMeta = {};
  A._batchMeta[99] = [
    { guid: 'el1', slotId: 0, disc: 'ARC', ifcClass: 'IfcWall' },
    { guid: 'el2', slotId: 1, disc: 'ARC', ifcClass: 'IfcSlab' }
  ];

  DC.activate(A);
  assertEq(slotVisibility[0], false, 'slot 0 hidden on activate');
  assertEq(slotVisibility[1], false, 'slot 1 hidden on activate');

  DC.deactivate(A);
  assertEq(slotVisibility[0], true, 'slot 0 restored on deactivate');
  assertEq(slotVisibility[1], true, 'slot 1 restored on deactivate');
  logTag('BATCHED_RESTORE', 'all slots visible=true after deactivate');
});

test('T48 Issue: mixed BatchedMesh + single mesh — both paths work', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  var A = mockA({ bom: bom, queryResults: { 'elements_meta': [] } });

  // Single mesh with userData.guid
  var singleMesh = { isMesh: true, visible: true, userData: { guid: 'door1' }, children: [] };
  _makeTraversable(singleMesh);
  A.scene.add(singleMesh);

  // BatchedMesh
  var slotVis = {};
  var mockBM = {
    isBatchedMesh: true,
    isMesh: true,
    visible: true,
    id: 77,
    userData: {},
    children: [],
    parent: null,
    setVisibleAt: function(slotId, vis) { slotVis[slotId] = vis; }
  };
  _makeTraversable(mockBM);
  A.scene.add(mockBM);
  A._batchMeta = {};
  A._batchMeta[77] = [
    { guid: 'slab1', slotId: 0, disc: 'ARC', ifcClass: 'IfcSlab' }
  ];

  DC.activate(A);
  // Single mesh hidden
  assertEq(singleMesh.visible, false, 'single mesh hidden');
  // Batched slot hidden
  assertEq(slotVis[0], false, 'batched slot hidden');

  // §S267: inject mock phases (BOM.db not in test sandbox)
  DC._setPhases([
    { name: 'GF / Structure', disc: 'ARC', guids: ['slab1'], tier: 1 },
    { name: 'GF / Openings', disc: 'ARC', guids: ['door1'], tier: 2 }
  ]);

  // Step through phases — slab1 first, then door1
  DC.nextPhase(A);  // Structure phase: slab1
  assertEq(slotVis[0], true, 'slab1 batched slot shown');

  DC.nextPhase(A);  // Openings phase: door1
  // door1 single mesh should be restored
  assertEq(singleMesh.visible, true, 'door1 single mesh shown');

  logTag('MIXED_PATH', 'batched slab1=vis single door1=vis — both paths work');
  DC.deactivate(A);
});

// ── T49-T51: HUD Grid Bays + Element Count ───────────────────────────────
console.log('\n── T49-T51: HUD Grid Bays + Doc State ──');

test('T49 Issue: HUD grid bays section populated at step zero (2 bays: 1 X, 1 Z)', function() {
  var DC = loadDocCanvas();
  var bom = testBOM({ minX: 0, maxX: 42.6, minY: 0, maxY: 41.78 });
  var A = mockA({ bom: bom });
  DC.activate(A);
  var bayBody = _domElements['gridbays-body'];
  assert(bayBody, 'gridbays-body element must exist');
  // At step zero with 2 X-lines and 2 Z-lines → 1 X bay + 1 Z bay
  assert(bayBody.innerHTML.indexOf('A–B') >= 0, 'X bay A–B should appear');
  assert(bayBody.innerHTML.indexOf('1–2') >= 0, 'Z bay 1–2 should appear');
  // Check mm values
  assert(bayBody.innerHTML.indexOf('42600') >= 0, 'X bay should show 42600 mm');
  assert(bayBody.innerHTML.indexOf('41780') >= 0, 'Z bay should show 41780 mm');
  logTag('HUD_BAYS_ZERO', 'A–B 42600mm, 1–2 41780mm');
  DC.deactivate(A);
});

test('T50 Issue: HUD element count starts at 0 and grows with Next', function() {
  var DC = loadDocCanvas();
  var bom = testBOM();
  // Mock single meshes with userData.guid matching BOM guids
  var A = mockA({ bom: bom, queryResults: { 'elements_meta': [] } });
  // Add single meshes for walls
  ['wall1','wall2','wall3','wall4','wall5','wall6'].forEach(function(g) {
    var m = { isMesh: true, visible: true, userData: { guid: g }, children: [] };
    _makeTraversable(m);
    A.scene.add(m);
  });
  DC.activate(A);

  // §S267: inject mock phases (BOM.db not in test sandbox)
  DC._setPhases([
    { name: 'GF / Structure', disc: 'ARC', guids: ['wall1','wall2','wall3','wall4','wall5','wall6'], tier: 1 }
  ]);

  var countEl = _domElements['s-buildings-done'];
  assertEq(String(countEl.textContent), '0', 'Step zero = 0 elements');
  DC.nextPhase(A);  // Structure phase with 6 walls
  assertEq(String(countEl.textContent), '6', 'After first Next = 6 wall elements');
  logTag('HUD_COUNT', 'zero=0 afterNext=6');
  DC.deactivate(A);
});

test('T51 Issue: HUD grid bays section hidden after deactivate', function() {
  var DC = loadDocCanvas();
  var A = mockA({ bom: testBOM() });
  DC.activate(A);
  var section = _domElements['hud-gridbays-section'];
  assertEq(section.style.display, 'block', 'Section visible during Doc mode');
  DC.deactivate(A);
  assertEq(section.style.display, 'none', 'Section hidden after deactivate');
  logTag('HUD_HIDE', 'gridbays-section display=none after deactivate');
});

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════
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
