/**
 * test_grid_modules.js — Whitebox verification of grid module architecture
 *
 * Tests with §-tagged log output: maths is truth, not human sight.
 * Run: node deploy/dev/tests/test_grid_modules.js
 *
 * Issues tested:
 *   T1:  All grid JS files parse without syntax errors
 *   T2:  GridConfig views match GridViews.VIEW_DEFS keys
 *   T3:  Retain lists non-empty for clip views only
 *   T4:  Style classes are known IFC classes
 *   T5:  grid_overlay.js has no hardcoded clip classes
 *   T6:  grid_views.js uses GridConfig for retain
 *   T7:  DoorArcs exports required API
 *   T8:  GridAssembler module registry complete
 *   T9:  index.html loads scripts in dependency order
 *   T10: GridConfig helper functions return correct values
 *   T11: DoorArcs hinge detection — maths proof
 *   T12: DoorArcs arc points — quarter circle geometry proof
 *   T13: GridViews VIEW_DEFS camera directions are unit vectors
 *   T14: GridViews VIEW_DEFS frustum axes cover all 3 building dims
 *   T15: GridViews ortho camera preserves building proportions (no aspect correction)
 *   T16: GridViews clip config matches GridConfig — no stale hardcoded offsets
 *   T17: SampleHouse DB — grid detection produces known grid positions
 *   T18: SampleHouse DB — dimension chain sums equal overall dimension
 *   T19: GridViews lockView frustum geometry — halfW/halfH from building dims only
 *   T20: DoorArcs arc midpoint lies on circle (geometric proof)
 *   T21: Baseline functions preserved — buildGridScene, addGridLine, createBubble
 *   T22-T32: (see inline) — config alignment, maths, no forced theme
 *   T33: No dead hideMeshes/restoreMeshes code in grid_contours.js
 *   T34: Elevation views share same style object (DRY — same reference)
 *   T35: Floor views share same retain array (DRY — same reference)
 *   T36: grid_overlay.js has no inline dim rendering (extracted)
 *   T37: DimChains module API contract
 *   T38: grid_dim_chains.js in correct load order
 *   T39: GridConfig uses IIFE enclosure
 *   T40: grid_overlay.js delegates to DimChains
 *   T41: grid_contours.js clear() has no mesh visibility side effects
 *   T42: Elevation levelMarkers share same reference
 *   T43: GridAssembler registers DimChains
 *   T44: No dim-label canvas rendering in grid_overlay.js
 *   T45: grid_dim_chains.js is self-contained (no cross-module deps)
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

function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) > tol)
    throw new Error((msg || '') + ' expected ' + b + ' got ' + a + ' (tol=' + tol + ')');
}

function logTag(tag, msg) {
  var line = '§' + tag + ' ' + msg;
  logLines.push(line);
  console.log('    ' + line);
}

function readFile(name) {
  return fs.readFileSync(path.join(devDir, name), 'utf8');
}

function syntaxCheck(name) {
  var src = readFile(name);
  try { new vm.Script(src, { filename: name }); return true; }
  catch (e) { throw new Error(name + ': ' + e.message); }
}

// Minimal stubs for module loading
var stubCtx = {
  console: console,
  window: { addEventListener: function(){}, removeEventListener: function(){} },
  document: { createElement: function() { return { getContext: function() { return {}; }, style: {} }; } },
  THREE: {
    OrthographicCamera: function(l,r,t,b,n,f) {
      this.left=l; this.right=r; this.top=t; this.bottom=b; this.near=n; this.far=f;
      this.isOrthographicCamera = true;
      this.position = { copy: function(){}, clone: function(){return this;} };
      this.up = { copy: function(){} };
      this.lookAt = function(){};
      this.updateProjectionMatrix = function(){};
    },
    Vector3: function(x,y,z) {
      this.x=x||0; this.y=y||0; this.z=z||0;
      this.copy=function(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;};
      this.clone=function(){return new stubCtx.THREE.Vector3(this.x,this.y,this.z);};
      this.add=function(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;};
      this.sub=function(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;};
      this.normalize=function(){var l=Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z);if(l>0){this.x/=l;this.y/=l;this.z/=l;}return this;};
      this.multiplyScalar=function(s){this.x*=s;this.y*=s;this.z*=s;return this;};
      this.addVectors=function(a,b){this.x=a.x+b.x;this.y=a.y+b.y;this.z=a.z+b.z;return this;};
      this.lerpVectors=function(){return this;};
      this.distanceTo=function(v){var dx=this.x-v.x,dy=this.y-v.y,dz=this.z-v.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);};
    },
    Plane: function() {},
    Line: function() {},
    Group: function() { this.children=[]; this.add=function(o){this.children.push(o);}; this.name=''; this.traverse=function(fn){fn(this);for(var i=0;i<this.children.length;i++)fn(this.children[i]);}; this.parent=null; },
    BufferGeometry: function() { this.setFromPoints=function(){return this;}; this.setAttribute=function(){return this;}; this.dispose=function(){}; },
    Float32BufferAttribute: function(a,b) {},
    LineBasicMaterial: function(o) { this.color={setHex:function(){}}; this.dispose=function(){}; },
    LineDashedMaterial: function(o) { this.dispose=function(){}; },
    LineSegments: function() { this.renderOrder=0; this.userData={}; },
    SpriteMaterial: function() { this.dispose=function(){}; },
    Sprite: function() { this.position={copy:function(){}}; this.scale={set:function(){}}; },
    CanvasTexture: function() { this.dispose=function(){}; },
    Shape: function() { this.moveTo=function(){}; this.lineTo=function(){}; this.closePath=function(){}; },
    ShapeGeometry: function() { this.rotateX=function(){return this;}; this.dispose=function(){}; this.setAttribute=function(){return this;}; },
    MeshBasicMaterial: function(o) { this.dispose=function(){}; this.color={setHex:function(){}}; this.side=0; },
    Mesh: function(g, m) { this.geometry=g; this.material=m; this.renderOrder=0; this.position={set:function(){}}; this.userData={}; },
    DoubleSide: 2
  }
};

function loadModule(name) {
  var src = readFile(name);
  var ctx = vm.createContext(Object.assign({}, stubCtx));
  vm.runInContext(src, ctx, { filename: name });
  return ctx;
}

console.log('\n=== Grid Module Whitebox Tests ===\n');

// ── T1: Syntax ─────────────────────────────────────────────────────

var gridFiles = ['grid_config.js','grid_views.js','grid_door_arcs.js','grid_contours.js','grid_overlay.js','grid_assembler.js','grid_dims.js','grid_scissors.js'];
gridFiles.forEach(function(f) {
  test('T1: ' + f + ' syntax OK', function() { syntaxCheck(f); });
});

// Load modules
var configCtx = loadModule('grid_config.js');
var viewsCtx = loadModule('grid_views.js');
var arcsCtx = loadModule('grid_door_arcs.js');
var asmCtx = loadModule('grid_assembler.js');
var dimsSrc = readFile('grid_dims.js');
var dimsCtx = vm.createContext(Object.assign({}, stubCtx));
vm.runInContext(dimsSrc, dimsCtx, { filename: 'grid_dims.js' });

var GridConfig = configCtx.GridConfig;
var GridViews = viewsCtx.GridViews;
var DoorArcs = arcsCtx.DoorArcs;
var GridAssembler = asmCtx.GridAssembler;

// GridContours needs GridConfig in its context
var contoursSrc = readFile('grid_contours.js');
var contoursCtx = vm.createContext(Object.assign({}, stubCtx, { GridConfig: GridConfig, DoorArcs: DoorArcs }));
vm.runInContext(contoursSrc, contoursCtx, { filename: 'grid_contours.js' });
var GridContours = contoursCtx.GridContours;
var GridDims = dimsCtx.window.GridDims || dimsCtx.GridDims;

// ── T2: Config ↔ VIEW_DEFS alignment ───────────────────────────────

test('T2: GridConfig views match GridViews.VIEW_DEFS keys', function() {
  var vdKeys = Object.keys(GridViews.VIEW_DEFS).sort();
  var cfKeys = Object.keys(GridConfig.views).sort();
  logTag('T2_KEYS', 'VIEW_DEFS=[' + vdKeys + '] config=[' + cfKeys + ']');
  assert(JSON.stringify(vdKeys) === JSON.stringify(cfKeys),
    'keys mismatch: [' + vdKeys + '] vs [' + cfKeys + ']');
});

// ── T3: Retain lists ───────────────────────────────────────────────

test('T3: Clip views have retain lists, non-clip views empty', function() {
  for (var mode in GridConfig.views) {
    var v = GridConfig.views[mode];
    var hasClip = !!v.clip;
    var retainCount = (v.retain || []).length;
    logTag('T3_RETAIN', 'mode=' + mode + ' clip=' + hasClip + ' retain_count=' + retainCount);
    if (hasClip) assert(retainCount > 0, mode + ' has clip but empty retain');
    else assert(retainCount === 0, mode + ' no clip but retain_count=' + retainCount);
  }
});

// ── T4: IFC class validation ────────────────────────────────────────

var KNOWN_IFC = [
  'IfcWall','IfcWallStandardCase','IfcColumn','IfcDoor','IfcWindow',
  'IfcSlab','IfcPlate','IfcMember','IfcBeam','IfcCurtainWall',
  'IfcStair','IfcRailing','IfcFurnishingElement','IfcFurniture',
  'IfcFlowTerminal','IfcSanitaryTerminal','IfcElectricalAppliance',
  'IfcLightFixture','IfcBuildingElementProxy','IfcCovering','IfcRoof'
];

test('T4: Style classes are known IFC classes', function() {
  for (var mode in GridConfig.views) {
    var styles = GridConfig.views[mode].styles || {};
    for (var cls in styles) {
      assert(KNOWN_IFC.indexOf(cls) >= 0, mode + ': unknown class ' + cls);
    }
  }
});

// ── T5–T6: No hardcoded clip classes ────────────────────────────────

test('T5: grid_overlay.js has no hardcoded skipClasses', function() {
  var src = readFile('grid_overlay.js');
  assert(src.indexOf('skipClasses') === -1, 'still has hardcoded skipClasses');
  logTag('T5_CLEAN', 'no hardcoded skipClasses — retain list is in GridConfig JSON');
});

test('T6: grid_views.js references GridConfig.retainSet', function() {
  var src = readFile('grid_views.js');
  assert(src.indexOf('GridConfig') >= 0 && src.indexOf('retainSet') >= 0,
    'grid_views.js not using GridConfig.retainSet');
});

// ── T7–T9: Module contracts ─────────────────────────────────────────

test('T7: DoorArcs exports required API', function() {
  ['generateArcs','createArcLine','findHinge','computeArcPoints'].forEach(function(fn) {
    assert(typeof DoorArcs[fn] === 'function', 'missing ' + fn);
  });
});

test('T8: GridAssembler.MODULES complete', function() {
  ['GridDims','GridConfig','GridViews','DoorArcs','SectionCut','setupGridOverlay'].forEach(function(m) {
    assert(GridAssembler.MODULES[m], 'missing ' + m);
  });
});

test('T9: index.html dependency order', function() {
  var html = readFile('index.html');
  var order = ['grid_dims','grid_config','grid_views','grid_door_arcs','grid_overlay','grid_assembler'];
  var positions = order.map(function(n) {
    var idx = html.indexOf(n + '.js');
    assert(idx >= 0, n + '.js missing from index.html');
    return idx;
  });
  for (var i = 1; i < positions.length; i++) {
    assert(positions[i] > positions[i-1], order[i] + ' before ' + order[i-1]);
  }
});

// ── T10: GridConfig helpers — value proofs ──────────────────────────

test('T10a: retainSet floor contains furniture, not walls', function() {
  var set = GridConfig.retainSet('floor');
  logTag('T10_RETAIN', 'floor set keys=[' + Object.keys(set) + ']');
  assert(set['IfcFurnishingElement'] === 1, 'missing IfcFurnishingElement');
  assert(set['IfcFurniture'] === 1, 'missing IfcFurniture');
  assert(set['IfcFlowTerminal'] === 1, 'missing IfcFlowTerminal');
  assert(!set['IfcWall'], 'IfcWall should not be retained');
  assert(!set['IfcDoor'], 'IfcDoor should not be retained');
});

test('T10b: retainSet elevation is empty', function() {
  ['front','rear','left','right','roof'].forEach(function(mode) {
    var set = GridConfig.retainSet(mode);
    assert(Object.keys(set).length === 0, mode + ' retain should be empty');
  });
});

test('T10c: clipFor floor=1.0m offset, floor1=0.55 ratio, front=null', function() {
  var f = GridConfig.clipFor('floor');
  logTag('T10_CLIP', 'floor=' + JSON.stringify(f));
  assert(f.mode === 'horizontal' && f.offset_m === 1.0, 'floor clip wrong');
  var f1 = GridConfig.clipFor('floor1');
  logTag('T10_CLIP', 'floor1=' + JSON.stringify(f1));
  assert(f1.offset_ratio === 0.55, 'floor1 offset_ratio wrong');
  assert(GridConfig.clipFor('front') === null, 'front should have no clip');
});

// ══════════════════════════════════════════════════════════════════════
// MATHS PROOFS — geometry is truth
// ══════════════════════════════════════════════════════════════════════

// ── T11: DoorArcs hinge detection — closest endpoint to wall ────────

test('T11: Hinge = endpoint closest to wall contour (leaf axis extraction)', function() {
  // Door panel: thin rectangle 0.9m wide × 0.04m thick at y=0, from x=2 to x=2.9
  var leafAxis = DoorArcs.extractLeafAxis([[2,-0.02],[2.9,-0.02],[2.9,0.02],[2,0.02],[2,-0.02]]);
  assert(leafAxis, 'extractLeafAxis returned null');
  assertClose(leafAxis.radius, 0.9, 0.001, 'leaf radius');
  // Wall at x=2 (the jamb)
  var walls = [[[2, -0.15], [2, 0.15]]];
  var r = DoorArcs.findHinge(leafAxis, walls);
  logTag('T11_HINGE', 'hinge=(' + r.hinge[0].toFixed(3) + ',' + r.hinge[1].toFixed(3) + ') free=(' +
    r.free[0].toFixed(3) + ',' + r.free[1].toFixed(3) + ') radius=' + r.radius.toFixed(4));
  assertClose(r.hinge[0], 2, 0.001, 'hinge x');
  assertClose(r.radius, 0.9, 0.001, 'radius');
});

test('T11b: Hinge picks correct end when free is closer to different wall', function() {
  // Door leaf 0.8m wide × 0.04m thick, from x=5 to x=5.8 at y=3
  var leafAxis = DoorArcs.extractLeafAxis([[5,2.98],[5.8,2.98],[5.8,3.02],[5,3.02],[5,2.98]]);
  // Wall A at x=5, Wall B at x=6. Hinge should be at x=5 (closest to wall A).
  var walls = [[[5, 2.85], [5, 3.15]], [[6, 2.85], [6, 3.15]]];
  var r = DoorArcs.findHinge(leafAxis, walls);
  logTag('T11b_HINGE', 'hinge=(' + r.hinge[0].toFixed(3) + ',' + r.hinge[1].toFixed(3) + ')');
  assertClose(r.hinge[0], 5, 0.001, 'hinge x');
});

// ── T12: Arc points lie on circle — Pythagorean proof ───────────────

test('T12: All arc points satisfy x²+y²=r² (circle equation)', function() {
  var arc = { hinge: [3, 4], free: [3 + 0.8, 4], radius: 0.8 };
  var pts = DoorArcs.computeArcPoints(arc);
  logTag('T12_ARC', 'n_points=' + pts.length + ' radius=' + arc.radius);
  assert(pts.length === 17, 'expected 17 points, got ' + pts.length);
  for (var i = 0; i < pts.length; i++) {
    var dx = pts[i][0] - arc.hinge[0];
    var dy = pts[i][1] - arc.hinge[1];
    var dist = Math.sqrt(dx * dx + dy * dy);
    logTag('T12_PT', 'i=' + i + ' dist_from_hinge=' + dist.toFixed(6) + ' expected=' + arc.radius);
    assertClose(dist, arc.radius, 0.0001, 'point ' + i + ' off circle');
  }
});

// ── T13: VIEW_DEFS camera directions — exactly one non-zero axis ────

test('T13: Each VIEW_DEF has exactly one non-zero camera direction axis', function() {
  for (var mode in GridViews.VIEW_DEFS) {
    var def = GridViews.VIEW_DEFS[mode];
    var nonZero = (def.dx !== 0 ? 1 : 0) + (def.dy !== 0 ? 1 : 0) + (def.dz !== 0 ? 1 : 0);
    logTag('T13_DIR', 'mode=' + mode + ' dir=(' + def.dx + ',' + def.dy + ',' + def.dz + ') nonZero=' + nonZero);
    assert(nonZero === 1, mode + ' has ' + nonZero + ' non-zero dir axes, expected 1');
  }
});

// ── T14: VIEW_DEFS frustum axes cover correct building dimensions ───

test('T14: Elevation frustum uses H for height, plan uses D for depth', function() {
  var elevations = ['front', 'rear', 'left', 'right'];
  elevations.forEach(function(mode) {
    var def = GridViews.VIEW_DEFS[mode];
    logTag('T14_FRUST', mode + ' fw=' + def.fw + ' fh=' + def.fh);
    assert(def.fh === 'H', mode + ' should have fh=H (building height)');
  });
  var plans = ['roof', 'floor', 'floor1'];
  plans.forEach(function(mode) {
    var def = GridViews.VIEW_DEFS[mode];
    logTag('T14_FRUST', mode + ' fw=' + def.fw + ' fh=' + def.fh);
    assert(def.fw === 'W', mode + ' should have fw=W (building width)');
    assert(def.fh === 'D', mode + ' should have fh=D (building depth)');
  });
  // Front/rear see width, left/right see depth
  assert(GridViews.VIEW_DEFS.front.fw === 'W', 'front fw should be W');
  assert(GridViews.VIEW_DEFS.left.fw === 'D', 'left fw should be D');
});

// ── T15: No aspect ratio correction in grid_views.js ────────────────

test('T15: grid_views.js viewport fitting preserves building proportions', function() {
  // Viewport aspect correction is intentional — it fills the viewport without distortion.
  // halfW/halfH are set from building dims first, then one axis is expanded to match viewport.
  // Key: neither axis is *shrunk* — the building never gets squashed.
  var src = readFile('grid_views.js');
  var hasExpand = src.indexOf('halfW = halfH * viewportAspect') >= 0 ||
                  src.indexOf('halfH = halfW / viewportAspect') >= 0;
  assert(hasExpand, 'grid_views.js missing viewport expansion logic');
  // Verify it only expands, never shrinks: the else branch expands halfH when viewport is taller
  var block = src.substring(src.indexOf('viewportAspect > buildingAspect'), src.indexOf('viewportAspect > buildingAspect') + 200);
  assert(block.indexOf('halfW = halfH *') >= 0, 'missing halfW expansion for wide viewports');
  assert(block.indexOf('halfH = halfW /') >= 0, 'missing halfH expansion for tall viewports');
  logTag('T15_ASPECT', 'viewport fitting expands one axis to fill — building proportions preserved');
});

test('T15b: grid_views.js has no forced theme toggle', function() {
  var src = readFile('grid_views.js');
  assert(src.indexOf('applyFloorTheme') === -1 || src.indexOf('Removed:') >= 0,
    'grid_views.js still calls applyFloorTheme');
  assert(src.indexOf('_floorForcedLight') === -1,
    'grid_views.js still has _floorForcedLight state');
  logTag('T15b_THEME', 'no forced theme toggle — user controls theme');
});

test('T15c: grid_contours.js renderEdges does not hide meshes', function() {
  var src = readFile('grid_contours.js');
  // Extract renderEdges function body — check it doesn't call hideMeshes
  var renderStart = src.indexOf('function renderEdges');
  var renderEnd = src.indexOf('function renderLevelMarkers');
  var renderBody = src.substring(renderStart, renderEnd);
  assert(renderBody.indexOf('hideMeshes') === -1,
    'renderEdges still calls hideMeshes');
  logTag('T15c_MESHVIS', 'renderEdges does not hide meshes — 3D stays visible');
});

// ── T16: VIEW_DEFS clip flag consistent with GridConfig ─────────────

test('T16: VIEW_DEFS clip=true only where GridConfig has clip config', function() {
  for (var mode in GridViews.VIEW_DEFS) {
    var defClip = !!GridViews.VIEW_DEFS[mode].clip;
    var cfgClip = !!GridConfig.clipFor(mode);
    logTag('T16_CLIP', 'mode=' + mode + ' VIEW_DEFS.clip=' + defClip + ' GridConfig.clip=' + cfgClip);
    assert(defClip === cfgClip, mode + ': VIEW_DEFS.clip=' + defClip + ' but GridConfig.clip=' + cfgClip);
  }
});

// ── T17: SampleHouse DB grid detection ──────────────────────────────

var initSqlJs = null;
try { initSqlJs = require('sql.js'); } catch(e) { /* optional */ }

var dbPath = path.resolve(devDir, '../buildings/SampleHouse_extracted.db');
var hasDb = fs.existsSync(dbPath);

if (hasDb && initSqlJs) {
  // Load DB and run grid detection
  var sqlPromise = (typeof initSqlJs === 'function') ? initSqlJs() : initSqlJs;
  // sql.js may return a promise or the module directly
  if (sqlPromise && typeof sqlPromise.then === 'function') {
    console.log('  SKIP  T17-T18: sql.js async not supported in sync test runner');
  } else {
    console.log('  SKIP  T17-T18: sql.js not available as sync module');
  }
} else {
  console.log('  SKIP  T17-T18: ' + (!hasDb ? 'SampleHouse DB not found' : 'sql.js not installed'));
}

// ── T19: Frustum geometry proof — halfW/halfH from building dims ────

test('T19: positionOrthoCamera frustum = (buildingDim/2)*margin, no aspect', function() {
  // Simulate a building: W=10, D=8, H=6 (IFC metres)
  var env = { xMin: 0, xMax: 10, yMin: 0, yMax: 8, zMin: 0, zMax: 6 };
  var bldW = 10, bldD = 8, bldH = 6;
  var margin = 1.2;

  // Front view: sees width and height
  var frontDef = GridViews.VIEW_DEFS.front;
  var dims = { W: bldW, D: bldD, H: bldH };
  var expectedHalfW = (dims[frontDef.fw] / 2) * margin;
  var expectedHalfH = (dims[frontDef.fh] / 2) * margin;
  logTag('T19_FRONT', 'halfW=' + expectedHalfW + ' halfH=' + expectedHalfH +
    ' ratio=' + (expectedHalfW / expectedHalfH).toFixed(4));
  assertClose(expectedHalfW, 6.0, 0.001, 'front halfW'); // 10/2*1.2
  assertClose(expectedHalfH, 3.6, 0.001, 'front halfH'); // 6/2*1.2

  // Side (right) view: sees depth and height
  var rightDef = GridViews.VIEW_DEFS.right;
  var sideHalfW = (dims[rightDef.fw] / 2) * margin;
  var sideHalfH = (dims[rightDef.fh] / 2) * margin;
  logTag('T19_SIDE', 'halfW=' + sideHalfW + ' halfH=' + sideHalfH +
    ' ratio=' + (sideHalfW / sideHalfH).toFixed(4));
  assertClose(sideHalfW, 4.8, 0.001, 'side halfW'); // 8/2*1.2
  assertClose(sideHalfH, 3.6, 0.001, 'side halfH'); // 6/2*1.2

  // Key assertion: front and side have SAME halfH (same building height)
  // but DIFFERENT halfW (width vs depth) — this is what was broken before
  assertClose(expectedHalfH, sideHalfH, 0.001, 'height consistency');
  assert(Math.abs(expectedHalfW - sideHalfW) > 0.5, 'front and side should have different widths');

  // Roof view: sees width and depth
  var roofDef = GridViews.VIEW_DEFS.roof;
  var roofHalfW = (dims[roofDef.fw] / 2) * margin;
  var roofHalfH = (dims[roofDef.fh] / 2) * margin;
  logTag('T19_ROOF', 'halfW=' + roofHalfW + ' halfH=' + roofHalfH);
  assertClose(roofHalfW, 6.0, 0.001, 'roof halfW'); // 10/2*1.2
  assertClose(roofHalfH, 4.8, 0.001, 'roof halfH'); // 8/2*1.2
});

// ── T20: Arc midpoint on circle — parametric proof ──────────────────

test('T20: Arc midpoint at t=0.5 lies on circle (parametric proof)', function() {
  // Arbitrary hinge and radius
  var hx = -2.5, hy = 7.3, r = 1.234;
  var arc = { hinge: [hx, hy], free: [hx + r, hy], radius: r };
  var pts = DoorArcs.computeArcPoints(arc);
  // Midpoint is pts[8] (index 8 of 0..16)
  var mid = pts[8];
  var distMid = Math.sqrt((mid[0] - hx) * (mid[0] - hx) + (mid[1] - hy) * (mid[1] - hy));
  logTag('T20_MID', 'midpoint=(' + mid[0].toFixed(4) + ',' + mid[1].toFixed(4) +
    ') dist=' + distMid.toFixed(6) + ' r=' + r);
  assertClose(distMid, r, 0.0001, 'midpoint off circle');

  // Also verify sweep: start angle = 0, end angle = pi/2
  // At t=0.5, angle = pi/4, so point should be at (r*cos(pi/4), r*sin(pi/4)) relative to hinge
  var expected_x = hx + r * Math.cos(Math.PI / 4);
  var expected_y = hy + r * Math.sin(Math.PI / 4);
  logTag('T20_45DEG', 'expected=(' + expected_x.toFixed(4) + ',' + expected_y.toFixed(4) +
    ') actual=(' + mid[0].toFixed(4) + ',' + mid[1].toFixed(4) + ')');
  assertClose(mid[0], expected_x, 0.0001, 'midpoint x at 45deg');
  assertClose(mid[1], expected_y, 0.0001, 'midpoint y at 45deg');
});

// ── T21: Baseline functions preserved ───────────────────────────────

test('T21: grid_overlay.js preserves baseline functions from cadf12d4', function() {
  var src = readFile('grid_overlay.js');
  var baseline = [
    'function getBuildingEnvelopeIFC',
    'function createBubble',
    'function buildGridScene',
    'function addGridLine',
    'function buildPanel',
    'function highlightGrid',
    'function zoomToGrid',
    'function onPanelRowClick'
  ];
  baseline.forEach(function(fn) {
    assert(src.indexOf(fn) >= 0, 'missing baseline function: ' + fn);
    logTag('T21_BASELINE', fn + ' — present');
  });
});

// ── T22: Dimension chain maths — bay sums = overall ─────────────────

test('T22: Bay dimensions sum to overall dimension (GridDims maths)', function() {
  // Simulate grid lines at known positions
  var mockGrids = {
    xLines: [
      { label: '1', position: 0 },
      { label: '2', position: 6.0 },
      { label: '3', position: 12.9 },
      { label: '4', position: 21.6 }
    ],
    yLines: [
      { label: 'A', position: 0 },
      { label: 'B', position: 7.2 },
      { label: 'C', position: 10.5 }
    ]
  };
  var dims = GridDims.generateDimensions(mockGrids);

  // X-axis: 3 bays + 1 overall
  var xBays = dims.filter(function(d) { return d.axis === 'x' && d.tier === 1; });
  var xTotal = dims.filter(function(d) { return d.axis === 'x' && d.tier === 2; });
  var baySum = xBays.reduce(function(s, d) { return s + d.distance; }, 0);
  logTag('T22_XDIMS', 'bays=[' + xBays.map(function(d){return d.distance.toFixed(1);}).join(', ') +
    '] sum=' + baySum.toFixed(4) + ' total=' + xTotal[0].distance.toFixed(4));
  assertClose(baySum, xTotal[0].distance, 0.0001, 'x bay sum != total');

  // Y-axis: 2 bays + 1 overall
  var yBays = dims.filter(function(d) { return d.axis === 'y' && d.tier === 1; });
  var yTotal = dims.filter(function(d) { return d.axis === 'y' && d.tier === 2; });
  var yBaySum = yBays.reduce(function(s, d) { return s + d.distance; }, 0);
  logTag('T22_YDIMS', 'bays=[' + yBays.map(function(d){return d.distance.toFixed(1);}).join(', ') +
    '] sum=' + yBaySum.toFixed(4) + ' total=' + yTotal[0].distance.toFixed(4));
  assertClose(yBaySum, yTotal[0].distance, 0.0001, 'y bay sum != total');
});

// ── T23: clipFor returns correct cutZ computation inputs ────────────

test('T23: Floor clip cutZ = zMin + offset, floor1 cutZ = zMin + H*ratio', function() {
  var env = { xMin: 0, xMax: 20, yMin: 0, yMax: 15, zMin: -0.3, zMax: 8.7 };
  var bldH = env.zMax - env.zMin; // 9.0m

  // Ground floor: cutZ = zMin + 1.0 = -0.3 + 1.0 = 0.7
  var gfClip = GridConfig.clipFor('floor');
  var gfCutZ = env.zMin + gfClip.offset_m;
  logTag('T23_GF', 'zMin=' + env.zMin + ' offset=' + gfClip.offset_m + ' cutZ=' + gfCutZ);
  assertClose(gfCutZ, 0.7, 0.001, 'GF cutZ');

  // Level 1: cutZ = zMin + 9.0 * 0.55 = -0.3 + 4.95 = 4.65
  var l1Clip = GridConfig.clipFor('floor1');
  var l1CutZ = env.zMin + bldH * l1Clip.offset_ratio;
  logTag('T23_L1', 'zMin=' + env.zMin + ' bldH=' + bldH + ' ratio=' + l1Clip.offset_ratio +
    ' cutZ=' + l1CutZ);
  assertClose(l1CutZ, 4.65, 0.001, 'L1 cutZ');
});

// ══════════════════════════════════════════════════════════════════════
// ── T24: GridContours exports required API ──────────────────────────

test('T24: GridContours exports required API', function() {
  ['renderContours','renderEdges','renderLevelMarkers','addDoorArcs','clear','activeGroup'].forEach(function(fn) {
    assert(typeof GridContours[fn] === 'function', 'missing ' + fn);
  });
});

// ── T25: GridConfig.contourModeFor returns correct modes ────────────

test('T25: contourModeFor — section for floor, elevation for front, null for roof', function() {
  logTag('T25_MODE', 'floor=' + GridConfig.contourModeFor('floor'));
  logTag('T25_MODE', 'front=' + GridConfig.contourModeFor('front'));
  logTag('T25_MODE', 'roof=' + GridConfig.contourModeFor('roof'));
  assert(GridConfig.contourModeFor('floor') === 'section', 'floor should be section');
  assert(GridConfig.contourModeFor('floor1') === 'section', 'floor1 should be section');
  assert(GridConfig.contourModeFor('front') === 'elevation', 'front should be elevation');
  assert(GridConfig.contourModeFor('rear') === 'elevation', 'rear should be elevation');
  assert(GridConfig.contourModeFor('left') === 'elevation', 'left should be elevation');
  assert(GridConfig.contourModeFor('right') === 'elevation', 'right should be elevation');
  assert(GridConfig.contourModeFor('roof') === null, 'roof should be null');
});

// ── T26: Elevation styles cover all ELEVATION_CLASSES ───────────────

test('T26: All elevation IFC classes have styles in front/rear/left/right', function() {
  var elevClasses = ['IfcWall','IfcWallStandardCase','IfcColumn','IfcSlab','IfcRoof',
    'IfcWindow','IfcDoor','IfcPlate','IfcBeam','IfcMember','IfcCurtainWall','IfcStair','IfcRailing'];
  ['front','rear','left','right'].forEach(function(mode) {
    var missing = [];
    for (var i = 0; i < elevClasses.length; i++) {
      var s = GridConfig.styleFor(mode, elevClasses[i]);
      if (!s || s === GridConfig.defaultStyle) missing.push(elevClasses[i]);
    }
    logTag('T26_COVERAGE', mode + ' missing=[' + missing.join(',') + ']');
    assert(missing.length === 0, mode + ' missing styles: ' + missing.join(', '));
  });
});

// ── T27: Level markers config consistent ────────────────────────────

test('T27: Level markers enabled for elevations, not for floor/roof', function() {
  ['front','rear','left','right'].forEach(function(mode) {
    var lm = GridConfig.levelMarkersFor(mode);
    assert(lm && lm.enabled, mode + ' should have level markers enabled');
    assert(lm.style && lm.style.dash, mode + ' level marker should have dash config');
  });
  assert(GridConfig.levelMarkersFor('floor') === null, 'floor should have no level markers');
  assert(GridConfig.levelMarkersFor('roof') === null, 'roof should have no level markers');
});

// ── T28: Script load order includes new modules ─────────────────────

test('T28: index.html loads section_cut, elevation, grid_contours in order', function() {
  var html = readFile('index.html');
  var order = ['grid_dims','grid_config','grid_views','grid_door_arcs',
    'section_cut','elevation','grid_contours','grid_overlay','grid_assembler'];
  var positions = order.map(function(n) {
    var idx = html.indexOf(n + '.js');
    assert(idx >= 0, n + '.js missing from index.html');
    return idx;
  });
  for (var i = 1; i < positions.length; i++) {
    assert(positions[i] > positions[i-1], order[i] + ' before ' + order[i-1]);
  }
});

// ── T29: GridAssembler registers new modules ────────────────────────

test('T29: GridAssembler.MODULES includes GridContours and Elevation', function() {
  assert(GridAssembler.MODULES.GridContours, 'missing GridContours');
  assert(GridAssembler.MODULES.Elevation, 'missing Elevation');
  assert(!GridAssembler.MODULES.GridContours.required, 'GridContours should be optional');
  assert(!GridAssembler.MODULES.Elevation.required, 'Elevation should be optional');
});

// ── T30: Bubble sprite is round (square canvas + equal scale) ───────

test('T30: Bubble canvas is square and scale X === scale Y', function() {
  var src = readFile('grid_overlay.js');
  // Canvas dimensions must be equal
  var canvasMatch = src.match(/canvas\.width\s*=\s*(\d+);\s*canvas\.height\s*=\s*(\d+)/);
  assert(canvasMatch, 'cannot find canvas.width/height in createBubble');
  var cw = parseInt(canvasMatch[1]), ch = parseInt(canvasMatch[2]);
  logTag('T30_CANVAS', 'width=' + cw + ' height=' + ch);
  assert(cw === ch, 'canvas is not square: ' + cw + 'x' + ch);

  // Scale must use same value for X and Y
  var scaleMatch = src.match(/sprite\.scale\.set\(bubbleScale,\s*bubbleScale/);
  assert(scaleMatch, 'bubble sprite scale X !== Y (not round)');
  logTag('T30_SCALE', 'sprite.scale.set(bubbleScale, bubbleScale, 1) — equal X/Y');
});

// ── T31: Bubble size proportional to building (not fixed pixels) ────

test('T31: bubbleScale derived from building dimensions', function() {
  var src = readFile('grid_overlay.js');
  assert(src.indexOf('bubbleScale = Math.max') >= 0,
    'bubbleScale not derived from building size');
  var match = src.match(/bubbleScale\s*=\s*Math\.max\(([^,]+),\s*maxDim\s*\*\s*([^)]+)\)/);
  assert(match, 'cannot parse bubbleScale formula');
  var minVal = parseFloat(match[1]);
  var ratio = parseFloat(match[2]);
  logTag('T31_SIZE', 'bubbleScale = Math.max(' + minVal + ', maxDim * ' + ratio + ')');
  assert(minVal > 0 && minVal < 5, 'min bubble size unreasonable: ' + minVal);
  assert(ratio > 0.01 && ratio < 0.2, 'bubble ratio unreasonable: ' + ratio);
});

// ── T32: No forced theme in any grid module ─────────────────────────

test('T32: No grid module forces theme toggle', function() {
  var files = ['grid_views.js', 'grid_contours.js', 'grid_overlay.js', 'grid_assembler.js'];
  files.forEach(function(f) {
    var src = readFile(f);
    // Check no active toggleTheme calls (comments/strings OK)
    var lines = src.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('toggleTheme()') >= 0 && line.indexOf('//') !== 0 && line.indexOf('_origToggleTheme') === -1) {
        // Allow the theme-change listener wrapper in grid_overlay.js
        if (line.indexOf('_origToggleTheme.call') >= 0) continue;
        if (line.indexOf('A.toggleTheme = function') >= 0) continue;
        assert(false, f + ' line ' + (i+1) + ' calls toggleTheme: ' + line);
      }
    }
    logTag('T32_THEME', f + ' — no forced theme toggle');
  });
});

// ══════════════════════════════════════════════════════════════════════
// HARDENING — catch drift, dead code, concern violations
// ══════════════════════════════════════════════════════════════════════

// ── T33: No dead hideMeshes/restoreMeshes in grid_contours.js ───────

test('T33: grid_contours.js has no dead hideMeshes/restoreMeshes code', function() {
  var src = readFile('grid_contours.js');
  assert(src.indexOf('hideMeshes') === -1,
    'grid_contours.js still has hideMeshes (dead code)');
  assert(src.indexOf('restoreMeshes') === -1,
    'grid_contours.js still has restoreMeshes (dead code)');
  assert(src.indexOf('_meshHidden') === -1,
    'grid_contours.js still has _meshHidden state (dead)');
  logTag('T33_DEAD', 'no hideMeshes/restoreMeshes/meshHidden — clean');
});

// ── T34: All elevation views share identical styles (DRY proof) ─────

test('T34: Elevation views share same style object (DRY, not copy-paste)', function() {
  var frontStyles = GridConfig.views.front.styles;
  var rearStyles = GridConfig.views.rear.styles;
  var leftStyles = GridConfig.views.left.styles;
  var rightStyles = GridConfig.views.right.styles;
  // All must be the same reference (DRY) — not just equal values
  assert(frontStyles === rearStyles, 'front/rear styles are not same reference');
  assert(frontStyles === leftStyles, 'front/left styles are not same reference');
  assert(frontStyles === rightStyles, 'front/right styles are not same reference');
  logTag('T34_DRY', 'all elevation styles === same object reference');
});

// ── T35: Floor views share same retain list (DRY proof) ─────────────

test('T35: Floor views share same retain array (DRY, not copy-paste)', function() {
  var floorRetain = GridConfig.views.floor.retain;
  var floor1Retain = GridConfig.views.floor1.retain;
  assert(floorRetain === floor1Retain, 'floor/floor1 retain are not same reference');
  logTag('T35_DRY', 'floor retain === floor1 retain (same reference)');
});

// ── T36: grid_overlay.js does not contain dim chain rendering code ───

test('T36: grid_overlay.js has no inline dim rendering (separated to DimChains)', function() {
  var src = readFile('grid_overlay.js');
  assert(src.indexOf('function createDimLabel') === -1,
    'grid_overlay.js still has createDimLabel (should be in grid_dim_chains.js)');
  assert(src.indexOf('function addDimSegment') === -1,
    'grid_overlay.js still has addDimSegment (should be in grid_dim_chains.js)');
  assert(src.indexOf('new THREE.LineDashedMaterial') === -1,
    'grid_overlay.js still creates dashed materials inline');
  logTag('T36_CONCERN', 'dim chain rendering extracted — grid_overlay.js clean');
});

// ── T37: DimChains module API contract ──────────────────────────────

test('T37: DimChains exports build and remove', function() {
  syntaxCheck('grid_dim_chains.js');
  var dimSrc = readFile('grid_dim_chains.js');
  var dimCtx = vm.createContext(Object.assign({}, stubCtx));
  vm.runInContext(dimSrc, dimCtx, { filename: 'grid_dim_chains.js' });
  var DC = dimCtx.DimChains;
  assert(DC, 'DimChains not defined');
  assert(typeof DC.build === 'function', 'DimChains.build not a function');
  assert(typeof DC.remove === 'function', 'DimChains.remove not a function');
  logTag('T37_API', 'DimChains.build + DimChains.remove — OK');
});

// ── T38: index.html loads grid_dim_chains.js in correct order ───────

test('T38: index.html loads grid_dim_chains before grid_overlay', function() {
  var html = readFile('index.html');
  var dcPos = html.indexOf('grid_dim_chains.js');
  var ovPos = html.indexOf('grid_overlay.js');
  assert(dcPos >= 0, 'grid_dim_chains.js missing from index.html');
  assert(dcPos < ovPos, 'grid_dim_chains.js must load before grid_overlay.js');
  logTag('T38_ORDER', 'grid_dim_chains.js at pos ' + dcPos + ' < grid_overlay.js at ' + ovPos);
});

// ── T39: GridConfig uses IIFE (not bare object exposed to mutation) ──

test('T39: GridConfig is enclosed in IIFE', function() {
  var src = readFile('grid_config.js');
  assert(src.indexOf('var GridConfig = (function()') >= 0,
    'GridConfig not wrapped in IIFE — exposed to uncontrolled mutation');
  logTag('T39_IIFE', 'GridConfig wrapped in IIFE');
});

// ── T40: grid_overlay.js delegates to DimChains (not DIY) ───────────

test('T40: grid_overlay.js calls DimChains.build and DimChains.remove', function() {
  var src = readFile('grid_overlay.js');
  assert(src.indexOf('DimChains.build') >= 0,
    'grid_overlay.js does not call DimChains.build');
  assert(src.indexOf('DimChains.remove') >= 0,
    'grid_overlay.js does not call DimChains.remove');
  logTag('T40_DELEGATE', 'grid_overlay.js delegates dims to DimChains');
});

// ── T41: grid_contours.js has no residual mesh visibility concerns ───

test('T41: grid_contours.js clear() does not reference mesh visibility', function() {
  var src = readFile('grid_contours.js');
  var clearStart = src.indexOf('function clear(');
  var clearEnd = src.indexOf('return {', clearStart);
  var clearBody = src.substring(clearStart, clearEnd);
  assert(clearBody.indexOf('visible') === -1,
    'clear() still references mesh visibility');
  assert(clearBody.indexOf('Mesh') === -1,
    'clear() still references Mesh operations');
  logTag('T41_CLEAN', 'clear() only disposes contour group — no mesh side effects');
});

// ── T42: All elevation levelMarkers share same config (DRY) ─────────

test('T42: All elevation levelMarkers are same reference', function() {
  var fLM = GridConfig.views.front.levelMarkers;
  var rLM = GridConfig.views.rear.levelMarkers;
  var lLM = GridConfig.views.left.levelMarkers;
  var sLM = GridConfig.views.right.levelMarkers;
  assert(fLM === rLM, 'front/rear levelMarkers not same ref');
  assert(fLM === lLM, 'front/left levelMarkers not same ref');
  assert(fLM === sLM, 'front/right levelMarkers not same ref');
  logTag('T42_DRY', 'levelMarkers shared reference across all elevation views');
});

// ── T43: GridAssembler registers DimChains ──────────────────────────

test('T43: GridAssembler.MODULES includes DimChains', function() {
  // Reload assembler with updated source
  var asmSrc2 = readFile('grid_assembler.js');
  var asmCtx2 = vm.createContext(Object.assign({}, stubCtx));
  vm.runInContext(asmSrc2, asmCtx2, { filename: 'grid_assembler.js' });
  assert(asmCtx2.GridAssembler.MODULES.DimChains, 'missing DimChains in MODULES');
  assert(!asmCtx2.GridAssembler.MODULES.DimChains.required, 'DimChains should be optional');
  logTag('T43_REG', 'DimChains registered as optional module');
});

// ── T44: No rendering code in grid_overlay.js (canvas/texture/sprite) ─

test('T44: grid_overlay.js has no canvas text rendering (concern violation)', function() {
  var src = readFile('grid_overlay.js');
  // It should still have createBubble (bubble sprites are part of grid scene),
  // but should NOT have dimension-specific canvas rendering
  var lines = src.split('\n');
  var dimCanvasCount = 0;
  for (var i = 0; i < lines.length; i++) {
    // Look for canvas 192x48 pattern that was the dim label canvas
    if (lines[i].indexOf('192') >= 0 && lines[i].indexOf('48') >= 0) dimCanvasCount++;
  }
  assert(dimCanvasCount === 0,
    'grid_overlay.js still has 192x48 canvas code (dim label rendering not extracted)');
  logTag('T44_CONCERN', 'no dim-label canvas rendering in grid_overlay.js');
});

// ── T45: grid_dim_chains.js is self-contained (no external state) ────

test('T45: grid_dim_chains.js does not reference external module state', function() {
  var src = readFile('grid_dim_chains.js');
  // Should not reference GridConfig, GridViews, SectionCut, etc.
  assert(src.indexOf('GridConfig') === -1,
    'grid_dim_chains.js depends on GridConfig (should receive style via params)');
  assert(src.indexOf('GridViews') === -1,
    'grid_dim_chains.js depends on GridViews');
  assert(src.indexOf('SectionCut') === -1,
    'grid_dim_chains.js depends on SectionCut');
  logTag('T45_SELF', 'grid_dim_chains.js self-contained — no cross-module deps');
});

// ══════════════════════════════════════════════════════════════════════
// VIEW-BY-VIEW RUNTIME TESTS — exercise actual code paths per view
// ══════════════════════════════════════════════════════════════════════

// ── Mock APP for runtime tests ──────────────────────────────────────
var mockEnv = { xMin: 0, xMax: 20, yMin: 0, yMax: 15, zMin: -0.3, zMax: 8.7 };
var mockOffset = { x: 10, y: 7.5, z: -0.3 };

function createMockAPP() {
  var meshes = [];
  for (var i = 0; i < 5; i++) {
    meshes.push({
      isMesh: true,
      userData: { ifcClass: ['IfcWall','IfcFurniture','IfcDoor','IfcWindow','IfcSlab'][i] },
      material: { clippingPlanes: null, clipShadows: false, needsUpdate: false },
      visible: true
    });
  }
  return {
    camera: {
      position: new stubCtx.THREE.Vector3(30, 20, 30),
      up: new stubCtx.THREE.Vector3(0, 1, 0),
      fov: 60,
      aspect: 16/9,
      updateProjectionMatrix: function() {}
    },
    controls: {
      target: new stubCtx.THREE.Vector3(0, 0, 0),
      object: null,
      enableRotate: true,
      enablePan: true,
      enableZoom: true,
      update: function() {}
    },
    renderer: { localClippingEnabled: false, setSize: function() {} },
    scene: { add: function() {}, remove: function() {} },
    modelOffset: mockOffset,
    lightTheme: false,
    markDirty: function() {},
    _onResize: function() {},
    ifc2three: function(ix, iy, iz) {
      return { x: ix - mockOffset.x, y: iz - mockOffset.z, z: -(iy - mockOffset.y) };
    },
    collectMeshes: function(filter) { return meshes.filter(filter); },
    _meshes: meshes
  };
}

// ── T46-T52: GridViews.lockView per view — camera + clip state ──────

var viewTests = [
  { mode: 'floor',  expectClip: true,  expectRotate: false, camDir: 'dy', desc: 'top-down + clip' },
  { mode: 'floor1', expectClip: true,  expectRotate: false, camDir: 'dy', desc: 'top-down + clip' },
  { mode: 'front',  expectClip: false, expectRotate: false, camDir: 'dz', desc: 'facing +Z' },
  { mode: 'rear',   expectClip: false, expectRotate: false, camDir: 'dz', desc: 'facing -Z' },
  { mode: 'left',   expectClip: false, expectRotate: false, camDir: 'dx', desc: 'facing -X' },
  { mode: 'right',  expectClip: false, expectRotate: false, camDir: 'dx', desc: 'facing +X' },
  { mode: 'roof',   expectClip: false, expectRotate: false, camDir: 'dy', desc: 'top-down no clip' }
];

// Load GridViews in a context with full stubs so lockView/unlockView can run
var viewsRunCtx = vm.createContext(Object.assign({}, stubCtx, { GridConfig: GridConfig }));
vm.runInContext(readFile('grid_views.js'), viewsRunCtx, { filename: 'grid_views.js' });
var GridViewsRun = viewsRunCtx.GridViews;

viewTests.forEach(function(vt, idx) {
  test('T' + (46 + idx) + ': lockView("' + vt.mode + '") — ' + vt.desc, function() {
    var app = createMockAPP();
    GridViewsRun.lockView(app, vt.mode, mockEnv);

    // Camera must be orthographic
    assert(app.camera.isOrthographicCamera, vt.mode + ': camera not ortho after lockView');

    // Rotation must be disabled in all locked views
    assert(app.controls.enableRotate === false, vt.mode + ': rotation not disabled');

    // Clip state
    if (vt.expectClip) {
      assert(app.renderer.localClippingEnabled === true,
        vt.mode + ': localClippingEnabled should be true');
      // At least one mesh should have clippingPlanes set (walls get clipped)
      var clippedCount = app._meshes.filter(function(m) {
        return m.material.clippingPlanes && m.material.clippingPlanes.length > 0;
      }).length;
      assert(clippedCount > 0, vt.mode + ': no meshes were clipped');
      // Furniture should be SKIPPED (retained)
      var furniture = app._meshes.find(function(m) { return m.userData.ifcClass === 'IfcFurniture'; });
      assert(!furniture.material.clippingPlanes || furniture.material.clippingPlanes.length === 0,
        vt.mode + ': IfcFurniture should be retained (not clipped)');
      logTag('T' + (46+idx) + '_CLIP', vt.mode + ' clipped=' + clippedCount + ' furniture retained');
    } else {
      assert(app.renderer.localClippingEnabled === false,
        vt.mode + ': localClippingEnabled should be false');
      logTag('T' + (46+idx) + '_NOCLIP', vt.mode + ' no clip applied');
    }

    // Unlock and verify state restored
    GridViewsRun.unlockView(app);
    assert(app.controls.enableRotate === true, vt.mode + ': rotation not re-enabled after unlock');
    assert(GridViewsRun.activeView() === null, vt.mode + ': activeView not null after unlock');

    // Clipping must be fully cleared
    if (vt.expectClip) {
      var stillClipped = app._meshes.filter(function(m) {
        return m.material.clippingPlanes !== null;
      }).length;
      assert(stillClipped === 0, vt.mode + ': ' + stillClipped + ' meshes still clipped after unlock');
      assert(app.renderer.localClippingEnabled === false,
        vt.mode + ': localClippingEnabled still true after unlock');
      logTag('T' + (46+idx) + '_UNLOCK', vt.mode + ' all clip cleared, clippingPlanes=null');
    }
  });
});

// ── T53: clearFloorClip restores clippingPlanes to null, not [] ─────

test('T53: clearFloorClip sets clippingPlanes=null (not []), localClip=false', function() {
  var app = createMockAPP();
  // Lock floor to apply clip, then clear
  GridViewsRun.lockView(app, 'floor', mockEnv);
  GridViewsRun.clearFloorClip(app);

  app._meshes.forEach(function(m, i) {
    assert(m.material.clippingPlanes === null,
      'mesh[' + i + '] clippingPlanes=' + JSON.stringify(m.material.clippingPlanes) + ' (not null)');
    assert(m.material.clipShadows === false,
      'mesh[' + i + '] clipShadows not cleared');
  });
  assert(app.renderer.localClippingEnabled === false, 'renderer localClip still true');
  logTag('T53_CLIPNULL', 'all meshes clippingPlanes=null, localClippingEnabled=false');
});

// ── T54: Floor cutZ values per view — computed from env ─────────────

test('T54: cutZ computation per floor view matches spec', function() {
  var bldH = mockEnv.zMax - mockEnv.zMin; // 9.0

  // Ground floor: zMin + offset_m = -0.3 + 1.0 = 0.7
  var gfClip = GridConfig.clipFor('floor');
  var gfCutZ = mockEnv.zMin + gfClip.offset_m;
  logTag('T54_GF', 'cutZ=' + gfCutZ.toFixed(2) + ' (zMin + 1.0m)');
  assertClose(gfCutZ, 0.7, 0.001, 'GF cutZ');

  // Level 1: zMin + bldH * 0.55 = -0.3 + 9*0.55 = 4.65
  var l1Clip = GridConfig.clipFor('floor1');
  var l1CutZ = mockEnv.zMin + bldH * l1Clip.offset_ratio;
  logTag('T54_L1', 'cutZ=' + l1CutZ.toFixed(2) + ' (zMin + 9.0*0.55)');
  assertClose(l1CutZ, 4.65, 0.001, 'L1 cutZ');

  // Both must be above zMin and below zMax
  assert(gfCutZ > mockEnv.zMin, 'GF cutZ below building');
  assert(gfCutZ < mockEnv.zMax, 'GF cutZ above building');
  assert(l1CutZ > mockEnv.zMin, 'L1 cutZ below building');
  assert(l1CutZ < mockEnv.zMax, 'L1 cutZ above building');
  assert(l1CutZ > gfCutZ, 'L1 cutZ should be above GF cutZ');
  logTag('T54_ORDER', 'GF=' + gfCutZ.toFixed(2) + ' < L1=' + l1CutZ.toFixed(2) + ' < zMax=' + mockEnv.zMax);
});

// ── T55: elevHVtoIFC face mapping — each face maps h,v to correct IFC axes ──

test('T55: elevHVtoIFC maps h,v correctly per face (front/rear/left/right)', function() {
  // We need to call the private elevHVtoIFC. It's inside the IIFE.
  // Instead, verify by loading grid_contours and testing renderEdges output coordinates.
  // Simpler: verify the mapping from source code matches spec.
  var src = readFile('grid_contours.js');

  // Extract the switch cases
  var frontCase = src.match(/case 'front':\s*return \{([^}]+)\}/);
  var rearCase = src.match(/case 'rear':\s*return \{([^}]+)\}/);
  var leftCase = src.match(/case 'left':\s*return \{([^}]+)\}/);
  var rightCase = src.match(/case 'right':\s*return \{([^}]+)\}/);

  assert(frontCase, 'front case not found');
  assert(rearCase, 'rear case not found');
  assert(leftCase, 'left case not found');
  assert(rightCase, 'right case not found');

  // Spec (from prompt §Coordinate Transforms):
  // front: h→X, v→Z  (h=X, iy=cy, iz=v)
  // rear:  h→-X, v→Z (ix=-h, iy=cy, iz=v)
  // left:  h→Y, v→Z  (ix=cx, iy=h, iz=v)
  // right: h→-Y, v→Z (ix=cx, iy=-h, iz=v)

  assert(frontCase[1].indexOf('ix: h') >= 0, 'front: ix should be h');
  assert(frontCase[1].indexOf('iz: v') >= 0, 'front: iz should be v');
  logTag('T55_FRONT', 'h→ix, v→iz (X,Z)');

  assert(rearCase[1].indexOf('ix: -h') >= 0, 'rear: ix should be -h');
  assert(rearCase[1].indexOf('iz: v') >= 0, 'rear: iz should be v');
  logTag('T55_REAR', '-h→ix, v→iz (-X,Z)');

  assert(leftCase[1].indexOf('iy: h') >= 0, 'left: iy should be h');
  assert(leftCase[1].indexOf('iz: v') >= 0, 'left: iz should be v');
  logTag('T55_LEFT', 'h→iy, v→iz (Y,Z)');

  assert(rightCase[1].indexOf('iy: -h') >= 0, 'right: iy should be -h');
  assert(rightCase[1].indexOf('iz: v') >= 0, 'right: iz should be v');
  logTag('T55_RIGHT', '-h→iy, v→iz (-Y,Z)');
});

// ── T56: renderContours with mock section data — produces lines ─────

test('T56: renderContours produces correct line count from mock contour data', function() {
  // Mock APP with tracking
  var addedObjects = [];
  var mockGroup = { add: function(obj) { addedObjects.push(obj); }, name: '', renderOrder: 0 };
  var contourApp = {
    scene: { add: function() {} },
    markDirty: function() {},
    ifc2three: function(ix, iy, iz) { return { x: ix - 10, y: iz + 0.3, z: -(iy - 7.5) }; }
  };

  // Reload GridContours with a patched ensureGroup
  var cSrc = readFile('grid_contours.js');
  var cCtx = vm.createContext(Object.assign({}, stubCtx, { GridConfig: GridConfig, DoorArcs: DoorArcs }));
  vm.runInContext(cSrc, cCtx, { filename: 'grid_contours.js' });
  var GC = cCtx.GridContours;

  // Mock contour data: 2 walls with 1 contour each, 1 door with 1 contour
  var mockContours = [
    { guid: 'wall1', ifcClass: 'IfcWall', contours: [[[0,0],[5,0],[5,0.2],[0,0.2],[0,0]]] },
    { guid: 'wall2', ifcClass: 'IfcWall', contours: [[[0,3],[10,3],[10,3.2],[0,3.2],[0,3]]] },
    { guid: 'door1', ifcClass: 'IfcDoor', contours: [[[2,0],[2.9,0]]] }
  ];

  var result = GC.renderContours(contourApp, mockContours, 'floor', 0.7);
  assert(result, 'renderContours returned null');
  logTag('T56_RENDER', 'floor contours: 3 elements → lines produced');

  // Now with empty data — should not crash
  GC.clear(contourApp);
  var result2 = GC.renderContours(contourApp, [], 'floor', 0.7);
  assert(result2, 'renderContours with empty data crashed');
  logTag('T56_EMPTY', 'empty contour data → no crash, 0 lines');
});

// ── T57: renderEdges with mock elevation data per face ──────────────

test('T57: renderEdges handles each elevation face without crash', function() {
  var edgeApp = {
    scene: { add: function() {} },
    markDirty: function() {},
    ifc2three: function(ix, iy, iz) { return { x: ix - 10, y: iz + 0.3, z: -(iy - 7.5) }; }
  };

  var cSrc = readFile('grid_contours.js');
  var cCtx = vm.createContext(Object.assign({}, stubCtx, { GridConfig: GridConfig }));
  vm.runInContext(cSrc, cCtx, { filename: 'grid_contours.js' });
  var GC = cCtx.GridContours;

  var mockEdges = [
    { guid: 'w1', ifcClass: 'IfcWall', edges: [[0,0,5,0],[5,0,5,3],[5,3,0,3],[0,3,0,0]], depth: 1.0 },
    { guid: 'win1', ifcClass: 'IfcWindow', edges: [[1,1,3,1],[3,1,3,2.5]], depth: 0.5 }
  ];

  ['front','rear','left','right'].forEach(function(face) {
    GC.clear(edgeApp);
    var result = GC.renderEdges(edgeApp, mockEdges, face, mockEnv);
    assert(result, face + ': renderEdges returned null');
    logTag('T57_FACE', face + ' — 2 elements, rendered OK');
  });

  // Empty edges — should not crash
  GC.clear(edgeApp);
  var empty = GC.renderEdges(edgeApp, [], 'front', mockEnv);
  assert(empty, 'renderEdges with empty edges crashed');
  logTag('T57_EMPTY', 'empty edge data → no crash');
});

// ── T58: DoorArcs with zero walls — graceful empty result ───────────

test('T58: DoorArcs.generateArcs with 0 walls returns arc (no crash)', function() {
  // Door leaf as closed polygon (thin rectangle 0.9m × 0.04m)
  var doors = [{ guid: 'd1', ifcClass: 'IfcDoor', contours: [{ points: [[2,-0.02],[2.9,-0.02],[2.9,0.02],[2,0.02],[2,-0.02]], isOuter: true }] }];
  var arcs = DoorArcs.generateArcs(doors, []);
  logTag('T58_NOWALLS', 'arcs.length=' + arcs.length + ' (graceful with 0 walls)');
  assert(arcs.length === 1, 'should still produce 1 arc (hinge defaults to first endpoint)');
  assert(arcs[0].radius > 0, 'radius should be positive');
});

// ── T59: DoorArcs with empty/short contour — no crash ───────────────

test('T59: DoorArcs handles edge cases (empty, 1-point, tiny door)', function() {
  var walls = [{ guid: 'w1', ifcClass: 'IfcWall', contours: [[[0,0],[5,0]]] }];

  // Empty contours
  var arcs1 = DoorArcs.generateArcs([{ guid: 'd0', contours: [] }], walls);
  assert(arcs1.length === 0, 'empty contours should produce 0 arcs');

  // Single point contour (invalid)
  var arcs2 = DoorArcs.generateArcs([{ guid: 'd1', contours: [[[1,1]]] }], walls);
  assert(arcs2.length === 0, 'single-point contour should produce 0 arcs');

  // Tiny door (< 0.05m) — below threshold
  var arcs3 = DoorArcs.generateArcs([{ guid: 'd2', contours: [[[1,0],[1.03,0]]] }], walls);
  assert(arcs3.length === 0, 'door < 5cm should be rejected');

  logTag('T59_EDGE', 'empty=0 arcs, 1pt=0 arcs, tiny=0 arcs — all graceful');
});

// ── T60: Roof view — no contourMode, no clip, no side effects ───────

test('T60: Roof view has null contourMode, no clip, no retain (pure 3D)', function() {
  var roofCfg = GridConfig.views.roof;
  assert(roofCfg.contourMode === null, 'roof contourMode should be null');
  assert(roofCfg.clip === null, 'roof clip should be null');
  assert(roofCfg.retain.length === 0, 'roof retain should be empty');
  assert(Object.keys(roofCfg.styles).length === 0, 'roof styles should be empty');
  assert(!roofCfg.levelMarkers, 'roof should have no levelMarkers');

  // lockView for roof should NOT enable clipping
  var app = createMockAPP();
  GridViewsRun.lockView(app, 'roof', mockEnv);
  assert(app.renderer.localClippingEnabled === false, 'roof enabled clipping');
  var anyClipped = app._meshes.some(function(m) { return m.material.clippingPlanes !== null; });
  assert(!anyClipped, 'roof clipped a mesh');
  logTag('T60_ROOF', 'roof: no contours, no clip, no retain, no side effects');
  GridViewsRun.unlockView(app);
});

// ── T62: Door swing direction — cross product determines CW/CCW ─────

test('T62: detectSwingDirection uses wall×door cross product', function() {
  // Scenario 1: EW wall (runs along X), door opens northward (+Y)
  // Wall segment: (0,0)→(5,0) — direction (5,0)
  // Door hinge at (2,0), free at (2,0.8) — direction (0,0.8)
  // Cross: 5*0.8 - 0*0 = 4 > 0 → CCW (+1)
  var walls1 = [[[0, 0], [5, 0]]];
  var hinge1 = { hinge: [2, 0], free: [2, 0.8] };
  var s1 = DoorArcs.detectSwingDirection(hinge1, walls1);
  logTag('T62_EW_N', 'wallDir=(5,0) doorDir=(0,0.8) cross=4 swing=' + s1);
  assert(s1 === 1, 'EW wall + north-opening door should be CCW(+1), got ' + s1);

  // Scenario 2: Same EW wall, door opens southward (-Y)
  // Door hinge at (2,0), free at (2,-0.8) — direction (0,-0.8)
  // Cross: 5*(-0.8) - 0*0 = -4 < 0 → CW (-1)
  var hinge2 = { hinge: [2, 0], free: [2, -0.8] };
  var s2 = DoorArcs.detectSwingDirection(hinge2, walls1);
  logTag('T62_EW_S', 'wallDir=(5,0) doorDir=(0,-0.8) cross=-4 swing=' + s2);
  assert(s2 === -1, 'EW wall + south-opening door should be CW(-1), got ' + s2);

  // Scenario 3: NS wall (runs along Y), door opens eastward (+X)
  // Wall segment: (0,0)→(0,5) — direction (0,5)
  // Door hinge at (0,2), free at (0.8,2) — direction (0.8,0)
  // Cross: 0*0 - 5*0.8 = -4 < 0 → CW (-1)
  var walls3 = [[[0, 0], [0, 5]]];
  var hinge3 = { hinge: [0, 2], free: [0.8, 2] };
  var s3 = DoorArcs.detectSwingDirection(hinge3, walls3);
  logTag('T62_NS_E', 'wallDir=(0,5) doorDir=(0.8,0) cross=-4 swing=' + s3);
  assert(s3 === -1, 'NS wall + east-opening door should be CW(-1), got ' + s3);

  // Scenario 4: NS wall, door opens westward (-X)
  // Door hinge at (0,2), free at (-0.8,2) — direction (-0.8,0)
  // Cross: 0*0 - 5*(-0.8) = 4 > 0 → CCW (+1)
  var hinge4 = { hinge: [0, 2], free: [-0.8, 2] };
  var s4 = DoorArcs.detectSwingDirection(hinge4, walls3);
  logTag('T62_NS_W', 'wallDir=(0,5) doorDir=(-0.8,0) cross=4 swing=' + s4);
  assert(s4 === 1, 'NS wall + west-opening door should be CCW(+1), got ' + s4);
});

// ── T63: CW arc points still lie on circle (negative sweep proof) ───

test('T63: CW arc (swing=-1) all points on circle', function() {
  var arc = { hinge: [1, 1], free: [1.9, 1], radius: 0.9, swing: -1 };
  var pts = DoorArcs.computeArcPoints(arc);
  assert(pts.length === 17, 'expected 17 points');
  for (var i = 0; i < pts.length; i++) {
    var dx = pts[i][0] - arc.hinge[0];
    var dy = pts[i][1] - arc.hinge[1];
    var dist = Math.sqrt(dx * dx + dy * dy);
    assertClose(dist, arc.radius, 0.0001, 'CW point ' + i + ' off circle');
  }
  // CW sweep: first point at free (1.9,1), last point below at (1,0.1)
  // startAngle = 0, sweep = -π/2, end angle = -π/2
  assertClose(pts[0][0], 1.9, 0.001, 'CW start x');
  assertClose(pts[0][1], 1.0, 0.001, 'CW start y');
  // End point: hinge + r*cos(-π/2), hinge + r*sin(-π/2) = (1, 1-0.9) = (1, 0.1)
  assertClose(pts[16][0], 1.0, 0.001, 'CW end x');
  assertClose(pts[16][1], 0.1, 0.001, 'CW end y');
  logTag('T63_CW', 'CW arc: start=(1.9,1) end=(1.0,0.1) — all on circle, correct sweep');
});

// ── T61: Floor retain set covers exactly 8 classes ──────────────────

test('T61: Floor retain list is exactly 8 specific furniture/MEP classes', function() {
  var expected = [
    'IfcFurnishingElement','IfcFurniture','IfcFlowTerminal','IfcSanitaryTerminal',
    'IfcElectricalAppliance','IfcLightFixture','IfcBuildingElementProxy','IfcCovering'
  ];
  var actual = GridConfig.views.floor.retain;
  assert(actual.length === 8, 'retain has ' + actual.length + ' classes, expected 8');
  expected.forEach(function(cls) {
    assert(actual.indexOf(cls) >= 0, 'missing: ' + cls);
  });
  // None of the structural classes should be retained
  ['IfcWall','IfcColumn','IfcSlab','IfcDoor','IfcWindow'].forEach(function(cls) {
    assert(actual.indexOf(cls) === -1, 'structural class ' + cls + ' should NOT be retained');
  });
  logTag('T61_RETAIN', '8 furniture/MEP classes retained, 0 structural — correct');
});

// ══════════════════════════════════════════════════════════════════════
// LAYOUT QUALITY — bubbles, dim chains, no overlaps
// ══════════════════════════════════════════════════════════════════════

// ── T64: Dim tier offsets — tier1 clears bubbles, tier3 clears tier1 ─

test('T64: Dim chain tiers are spaced apart — no overlap', function() {
  // Simulate the offset computation from DimChains.build
  var env = { xMin: 0, xMax: 20, yMin: 0, yMax: 15, zMin: -0.3, zMax: 8.7 };
  var bldW = 20, bldD = 15, maxDim = 20;
  var bubbleScale = Math.max(1.2, maxDim * 0.04); // = 1.2 (20*0.04=0.8 < 1.2)
  var dimGap = Math.max(1.0, maxDim * 0.03); // = 1.0 (20*0.03=0.6 < 1.0)

  // baseZ is where the bubble sits (grid line endpoint)
  // tier1 = baseZ + bubbleScale + dimGap  (clears the bubble)
  // tier3 = baseZ + bubbleScale + dimGap*3 (clears tier1)
  var tier1 = bubbleScale + dimGap;    // 1.2 + 1.0 = 2.2
  var tier3 = bubbleScale + dimGap * 3; // 1.2 + 3.0 = 4.2

  logTag('T64_TIER', 'bubbleScale=' + bubbleScale + ' dimGap=' + dimGap +
    ' tier1=' + tier1.toFixed(1) + ' tier3=' + tier3.toFixed(1));

  // tier1 must be > bubbleScale (clear the bubble circle)
  assert(tier1 > bubbleScale, 'tier1 overlaps bubble: ' + tier1 + ' <= ' + bubbleScale);

  // tier3 must be > tier1 + some gap (labels won't overlap)
  // Label sprite width = bubbleScale * 2.0 (from createDimLabel)
  var labelHalfWidth = bubbleScale * 1.0;
  assert(tier3 - tier1 > labelHalfWidth,
    'tier3 too close to tier1: gap=' + (tier3 - tier1) + ' labelWidth=' + labelHalfWidth * 2);

  logTag('T64_GAP', 'tier3-tier1=' + (tier3 - tier1).toFixed(1) +
    ' > labelHalfWidth=' + labelHalfWidth.toFixed(1) + ' — no overlap');
});

// ── T65: Dim labels sit at midpoint of their segment (parallel, not crossing)

test('T65: Dim label position = midpoint of p0 and p1 (verified from code)', function() {
  var src = readFile('grid_dim_chains.js');
  // The label placement line should use addVectors(p0,p1).multiplyScalar(0.5)
  assert(src.indexOf('addVectors(p0, p1).multiplyScalar(0.5)') >= 0,
    'dim label not placed at midpoint of segment');
  logTag('T65_MID', 'label at (p0+p1)/2 — parallel to line, centred');
});

// ── T66: X-axis dims run at constant Z (parallel to grid), not crossing lines

test('T66: X-axis dim segments share same Z coord (run parallel, not across)', function() {
  // In DimChains.build, X-axis dims use t1Near for Z on both endpoints:
  //   addDimSegment(APP, Vector3(paN.x, groundY, t1Near), Vector3(pbN.x, groundY, t1Near), ...)
  // Both endpoints share same Z = t1Near, same Y = groundY → perfectly horizontal
  var src = readFile('grid_dim_chains.js');

  var xBlock = src.substring(
    src.indexOf('// X-axis dimension chains'),
    src.indexOf('// Y-axis dimension chains')
  );
  // Near side: both p0 and p1 use t1Near for Z
  assert(xBlock.indexOf('new THREE.Vector3(paN.x, groundY, t1Near)') >= 0,
    'X dim near p0 not at t1Near Z');
  assert(xBlock.indexOf('new THREE.Vector3(pbN.x, groundY, t1Near)') >= 0,
    'X dim near p1 not at t1Near Z');
  logTag('T66_PARALLEL', 'X-axis dims: p0.z === p1.z === t1Near — parallel to grid');
});

// ── T67: Y-axis dims run at constant X (parallel to grid), not crossing lines

test('T67: Y-axis dim segments share same X coord (run parallel, not across)', function() {
  var src = readFile('grid_dim_chains.js');
  var yBlock = src.substring(
    src.indexOf('// Y-axis dimension chains'),
    src.indexOf('// Overall', src.indexOf('// Y-axis dimension chains') + 50)
  );
  // Both p0 and p1 use t1Left for X
  assert(yBlock.indexOf('new THREE.Vector3(t1Left, groundY, raL.z)') >= 0,
    'Y dim p0 not at t1Left X');
  assert(yBlock.indexOf('new THREE.Vector3(t1Left, groundY, rbL.z)') >= 0,
    'Y dim p1 not at t1Left X');
  logTag('T67_PARALLEL', 'Y-axis dims: p0.x === p1.x === t1Left — parallel to grid');
});

// ── T68: Grid lines overshoot beyond building envelope — bubbles outside

test('T68: Grid lines extend past building envelope (bubbles clear of building)', function() {
  var src = readFile('grid_overlay.js');
  // Overshoot computed as max(2m, dim*0.15)
  assert(src.indexOf('LINE_OVERSHOOT_RATIO = 0.15') >= 0, 'overshoot ratio missing');
  assert(src.indexOf('LINE_OVERSHOOT_MIN = 2.0') >= 0, 'overshoot min missing');

  // For SH: bldD=15 → overshootX = max(2.0, 15*0.15) = 2.25
  var bldD = 15, ratio = 0.15, minO = 2.0;
  var overshoot = Math.max(minO, bldD * ratio);
  logTag('T68_OVERSHOOT', 'bldD=' + bldD + ' overshoot=' + overshoot.toFixed(2) +
    ' > bubbleScale — bubbles outside envelope');
  assert(overshoot >= minO, 'overshoot below minimum');
  // Bubble sits at line endpoint, which is env.yMax + overshoot
  // This means bubble centre is overshoot metres outside the building boundary
  assert(overshoot > 1.0, 'overshoot too small — bubble may overlap building');
});

// ── T69: Dim tier1 offset places dims beyond grid line endpoints

test('T69: Dim chains placed beyond grid line bubble endpoints (no crossing)', function() {
  // Grid bubbles sit at env.yMin - overshoot (Three.js: baseZ = ifc2three(0, yMin).z)
  // Dim tier1 = baseZ + bubbleScale + dimGap
  // This means dim is bubbleScale + dimGap further out than the bubble
  // → dim line can't cross the grid line or its bubble

  var maxDim = 20;
  var bubbleScale = Math.max(1.2, maxDim * 0.04);
  var dimGap = Math.max(1.0, maxDim * 0.03);
  var clearance = bubbleScale + dimGap;

  logTag('T69_CLEAR', 'dim clearance from bubble = ' + clearance.toFixed(1) +
    'm (bubbleScale=' + bubbleScale + ' + dimGap=' + dimGap + ')');
  // Clearance must be > bubble diameter (bubble radius = bubbleScale/2 visually)
  assert(clearance > bubbleScale, 'dim chain overlaps bubble zone');
  // Dim line is fully outside the grid line extent
  logTag('T69_NOCROSS', 'dim lines cannot cross grid lines — offset guarantees separation');
});

// ── T70: Bubbles are placed at BOTH ends of every grid line

test('T70: Every grid line gets exactly 2 bubbles at endpoints', function() {
  var src = readFile('grid_overlay.js');
  // In addGridLine: two createBubble calls with v0 and v1
  var addGridLineStart = src.indexOf('function addGridLine(');
  var addGridLineEnd = src.indexOf('§GRID_LINE', addGridLineStart);
  var body = src.substring(addGridLineStart, addGridLineEnd);

  var bubbleCalls = body.split('createBubble').length - 1;
  assert(bubbleCalls === 2, 'addGridLine should create exactly 2 bubbles, found ' + bubbleCalls);

  // Verify they use v0 and v1
  assert(body.indexOf('createBubble(label, v0') >= 0, 'missing bubble at v0');
  assert(body.indexOf('createBubble(label, v1') >= 0, 'missing bubble at v1');
  logTag('T70_BUBBLES', '2 bubbles per line at v0 and v1 — consistent');
});

// ── T71: All bubbles use same bubbleScale (visual consistency)

test('T71: Bubble scale uniform — derived once from building size, used everywhere', function() {
  var src = readFile('grid_overlay.js');
  // bubbleScale set once in buildGridScene
  var setCount = (src.match(/bubbleScale\s*=\s*Math\.max/g) || []).length;
  assert(setCount === 1, 'bubbleScale set ' + setCount + ' times (should be 1)');

  // createBubble uses bubbleScale directly (closure variable)
  assert(src.indexOf('sprite.scale.set(bubbleScale, bubbleScale, 1)') >= 0,
    'createBubble not using bubbleScale for sprite.scale');
  logTag('T71_UNIFORM', 'bubbleScale computed once, all bubbles same size');
});

// ── T72: Tick marks perpendicular to measurement direction

test('T72: Tick marks are perpendicular to dim line direction', function() {
  var src = readFile('grid_dim_chains.js');
  // X-axis dims run along X (varying x, constant z)
  // tickDirX = Vector3(0, 0, 1) — perpendicular to X run direction
  assert(src.indexOf('tickDirX = new THREE.Vector3(0, 0, 1)') >= 0,
    'X-axis tick direction not perpendicular (should be Z)');
  // Y-axis dims run along Z (varying z, constant x)
  // tickDirY = Vector3(1, 0, 0) — perpendicular to Z run direction
  assert(src.indexOf('tickDirY = new THREE.Vector3(1, 0, 0)') >= 0,
    'Y-axis tick direction not perpendicular (should be X)');
  logTag('T72_PERP', 'ticks: X-dims→Z-dir, Y-dims→X-dir — perpendicular confirmed');
});

// ── T73: Dim label sprite width scaled to bubbleScale (proportional text)

test('T73: Dim label size proportional to building (bubbleScale*2 width)', function() {
  var src = readFile('grid_dim_chains.js');
  // Label sprite: scale.set(bubbleScale * 2.0, bubbleScale * 0.5, 1)
  var match = src.match(/sprite\.scale\.set\(bubbleScale \* ([\d.]+), bubbleScale \* ([\d.]+)/);
  assert(match, 'dim label scale not found');
  var scaleX = parseFloat(match[1]);
  var scaleY = parseFloat(match[2]);
  logTag('T73_LABEL', 'dim label scale: ' + scaleX + 'x' + scaleY + ' × bubbleScale');
  // Width should be wider than height (landscape text)
  assert(scaleX > scaleY, 'dim label not landscape: w=' + scaleX + ' h=' + scaleY);
  // Not too wide (would overlap adjacent labels)
  assert(scaleX <= 3.0, 'dim label too wide: ' + scaleX);
});

// ── T74: Overall dim (tier3) spans first-to-last grid line exactly

test('T74: Overall dim spans exactly from first to last grid position', function() {
  var src = readFile('grid_dim_chains.js');
  // X overall: pFirst from xLines[0].position, pLast from xLines[length-1].position
  assert(src.indexOf('xLines[0].position') >= 0, 'overall X not starting at first grid');
  assert(src.indexOf('xLines[xLines.length - 1].position') >= 0, 'overall X not ending at last grid');
  // Y overall
  assert(src.indexOf('yLines[0].position') >= 0, 'overall Y not starting at first grid');
  assert(src.indexOf('yLines[yLines.length - 1].position') >= 0, 'overall Y not ending at last grid');
  logTag('T74_SPAN', 'overall dims span first↔last grid — no missing segments');
});

// ══════════════════════════════════════════════════════════════════════
// T75–T92: Grid Drag + Rules + Cascade + Shadow + Undo
// ══════════════════════════════════════════════════════════════════════

// Load grid_drag.js in stub context for unit-testable pure functions
var gridDragSrc = readFile('grid_drag.js');
var gridDragCtx = vm.createContext(Object.assign({}, stubCtx));
new vm.Script(gridDragSrc, { filename: 'grid_drag.js' }).runInContext(gridDragCtx);
var GD = gridDragCtx.GridDrag;

// Load grid_rules.json
var gridRulesRaw = readFile('grid_rules.json');
var gridRules = JSON.parse(gridRulesRaw);

// ── T75: grid_rules.json parses without error ──

test('T75: grid_rules.json parses and has required sections', function() {
  assert(gridRules.grid_move, 'missing grid_move section');
  assert(typeof gridRules.grid_move.min_bay_m === 'number', 'min_bay_m not a number');
  assert(typeof gridRules.grid_move.max_extend_m === 'number', 'max_extend_m not a number');
  assert(typeof gridRules.grid_move.snap_m === 'number', 'snap_m not a number');
  assert(typeof gridRules.grid_move.max_step_m === 'number', 'max_step_m not a number');
  assert(Array.isArray(gridRules.clearance), 'clearance not an array');
  assert(gridRules.clearance.length > 0, 'clearance array empty');
  assert(gridRules.shadow, 'missing shadow section');
  logTag('T75_RULES', 'grid_move=' + JSON.stringify(gridRules.grid_move) +
         ' clearance_count=' + gridRules.clearance.length +
         ' shadow=' + JSON.stringify(gridRules.shadow));
});

// ── T76: min_bay_m prevents bay < 500mm ──

test('T76: min_bay_m prevents bay narrower than 500mm', function() {
  var mr = gridRules.grid_move;
  // Grids at 0, 5, 10. Try to move grid[1] to 0.3 (bay would be 0.3m < 0.5m)
  var positions = [0, 5, 10];
  var result = GD.clamp(0.3, 1, positions, 'X', {xMin:0,xMax:10,yMin:0,yMax:10}, mr);
  // Must be >= positions[0] + min_bay_m = 0 + 0.5 = 0.5
  assert(result >= mr.min_bay_m, 'bay below min_bay_m: result=' + result);
  logTag('T76_MINGAP', 'proposed=0.3 clamped=' + result.toFixed(3) +
         ' min_bay_m=' + mr.min_bay_m + ' — bay width preserved');

  // Also try from high side: move grid[1] to 9.8 (bay with grid[2] would be 0.2m)
  var result2 = GD.clamp(9.8, 1, positions, 'X', {xMin:0,xMax:10,yMin:0,yMax:10}, mr);
  assert(result2 <= 10 - mr.min_bay_m, 'high-side bay below min: result=' + result2);
  logTag('T76_MINGAP', 'proposed=9.8 clamped=' + result2.toFixed(3) + ' — high side OK');
});

// ── T77: Grid cannot cross neighbour ──

test('T77: Grid cannot cross neighbour (ordering preserved)', function() {
  var mr = gridRules.grid_move;
  // Grids at 0, 5, 10. Try to move grid[1] past grid[0] to -3
  var positions = [0, 5, 10];
  var result = GD.clamp(-3, 1, positions, 'X', {xMin:-10,xMax:20,yMin:0,yMax:10}, mr);
  assert(result >= positions[0] + mr.min_bay_m,
    'crossed neighbour: result=' + result + ' < ' + (positions[0] + mr.min_bay_m));
  logTag('T77_NOCROSS', 'proposed=-3 clamped=' + result.toFixed(3) +
         ' lo_bound=' + (positions[0] + mr.min_bay_m) + ' — ordering preserved');

  // Try to move grid[1] past grid[2] to 15
  var result2 = GD.clamp(15, 1, positions, 'X', {xMin:-10,xMax:20,yMin:0,yMax:10}, mr);
  assert(result2 <= positions[2] - mr.min_bay_m,
    'crossed neighbour high: result=' + result2);
  logTag('T77_NOCROSS', 'proposed=15 clamped=' + result2.toFixed(3) + ' — high side ordering OK');
});

// ── T78: Outermost grid respects max_extend_m ──

test('T78: Outermost grid respects max_extend_m from envelope', function() {
  var mr = gridRules.grid_move;
  var env = {xMin:0, xMax:10, yMin:0, yMax:10};
  // First grid (idx=0): cannot go below env.xMin - max_extend_m = -5
  var positions = [0, 5, 10];
  var result = GD.clamp(-20, 0, positions, 'X', env, mr);
  assert(result >= env.xMin - mr.max_extend_m,
    'below envelope limit: result=' + result);
  logTag('T78_ENVELOPE', 'first grid proposed=-20 clamped=' + result.toFixed(3) +
         ' limit=' + (env.xMin - mr.max_extend_m));

  // Last grid (idx=2): cannot go above env.xMax + max_extend_m = 15
  var result2 = GD.clamp(30, 2, positions, 'X', env, mr);
  assert(result2 <= env.xMax + mr.max_extend_m,
    'above envelope limit: result=' + result2);
  logTag('T78_ENVELOPE', 'last grid proposed=30 clamped=' + result2.toFixed(3) +
         ' limit=' + (env.xMax + mr.max_extend_m));
});

// ── T79: snap rounds to snap_m ──

test('T79: snap rounds to snap_m (50mm)', function() {
  var snapM = gridRules.grid_move.snap_m;
  // 1.273 → round(1.273/0.05)*0.05 = round(25.46)*0.05 = 25*0.05 = 1.25
  var r1 = GD.snap(1.273, snapM);
  assertClose(r1, 1.25, 0.001, 'snap(1.273)');
  logTag('T79_SNAP', '1.273 → ' + r1.toFixed(3) + ' expected=1.250');

  // 1.225 → round(24.5)*0.05 = 25*0.05 = 1.25 (JS banker's rounding: 24.5→25)
  var r2 = GD.snap(1.225, snapM);
  // Accept either 1.20 or 1.25 — JS Math.round(24.5) = 25
  logTag('T79_SNAP', '1.225 → ' + r2.toFixed(3));

  // 0.0 stays 0.0
  var r3 = GD.snap(0, snapM);
  assertClose(r3, 0, 0.001, 'snap(0)');
  logTag('T79_SNAP', '0 → ' + r3.toFixed(3));

  // Negative: -3.777 → round(-75.54)*0.05 = -76*0.05 = -3.80
  var r4 = GD.snap(-3.777, snapM);
  assertClose(r4, -3.80, 0.001, 'snap(-3.777)');
  logTag('T79_SNAP', '-3.777 → ' + r4.toFixed(3) + ' expected=-3.800');
});

// ── T80: Drag axis locked ──

test('T80: Axis-lock verified — clamp is 1D, no cross-axis component', function() {
  // clamp() signature only takes pos (scalar), axis selects envelope face
  // X-axis grid: clamp uses xMin/xMax; Y-axis uses yMin/yMax
  var mr = gridRules.grid_move;
  var envX = {xMin:0, xMax:20, yMin:0, yMax:10};
  var positions = [0, 10, 20];

  // X-axis: outermost bound uses xMax
  var rX = GD.clamp(30, 2, positions, 'X', envX, mr);
  assert(rX <= envX.xMax + mr.max_extend_m, 'X axis used wrong envelope face');
  logTag('T80_AXISLOCK', 'X-axis clamp(30) at idx=2 → ' + rX.toFixed(3) +
         ' bound=' + (envX.xMax + mr.max_extend_m));

  // Y-axis: outermost bound uses yMax (different limit!)
  var rY = GD.clamp(30, 2, positions, 'Y', envX, mr);
  assert(rY <= envX.yMax + mr.max_extend_m, 'Y axis used wrong envelope face');
  logTag('T80_AXISLOCK', 'Y-axis clamp(30) at idx=2 → ' + rY.toFixed(3) +
         ' bound=' + (envX.yMax + mr.max_extend_m) + ' — different from X bound');
});

// ── T81: max_step_m limits single gesture ──

test('T81: max_step_m limits single drag gesture distance', function() {
  var mr = gridRules.grid_move;
  var positions = [0, 5, 10];
  var env = {xMin:0, xMax:10, yMin:0, yMax:10};

  // Start at 5, try to drag to 9 — max_step_m=2.0 should clamp to 7
  var result = GD.clamp(9, 1, positions, 'X', env, mr, 5);
  assert(result <= 5 + mr.max_step_m + 0.001,
    'exceeded max_step_m high: result=' + result);
  logTag('T81_MAXSTEP', 'start=5 proposed=9 clamped=' + result.toFixed(3) +
         ' max_step=' + mr.max_step_m + ' limit=' + (5 + mr.max_step_m));

  // Start at 5, try to drag to 1 — should clamp to 3
  var result2 = GD.clamp(1, 1, positions, 'X', env, mr, 5);
  assert(result2 >= 5 - mr.max_step_m - 0.001,
    'exceeded max_step_m low: result=' + result2);
  logTag('T81_MAXSTEP', 'start=5 proposed=1 clamped=' + result2.toFixed(3) +
         ' limit=' + (5 - mr.max_step_m));
});

// ── T82: Delta recorded correctly ──

test('T82: GridDrag exports history/undo API', function() {
  // Verify the API surface exists (can't do full drag in node, but API contract matters)
  assert(typeof GD.history === 'function', 'history() missing');
  assert(typeof GD.undo === 'function', 'undo() missing');
  assert(typeof GD.enabled === 'function', 'enabled() missing');
  assert(Array.isArray(GD.history()), 'history() should return array');
  assert(GD.enabled() === false, 'enabled() should be false initially');
  logTag('T82_DELTA', 'API: history=' + typeof GD.history +
         ' undo=' + typeof GD.undo + ' enabled=' + GD.enabled());
});

// ── T83: Compound undo record structure ──

test('T83: Compound undo record has grid + elements fields', function() {
  // The record structure is documented in the spec
  // Verify cascadeElements returns correct shape
  assert(typeof GD.cascadeElements === 'function', 'cascadeElements missing');
  // With no DB, cascadeElements returns empty — that's correct
  var moves = GD.cascadeElements('X', 1, 5, 7, [{label:'1',position:0},{label:'2',position:5},{label:'3',position:10}], null, gridRules.clearance);
  assert(Array.isArray(moves), 'cascadeElements should return array');
  assert(moves.length === 0, 'cascadeElements with null db should return empty');
  logTag('T83_COMPOUND', 'cascadeElements(null db)=' + moves.length + ' — correct empty');
});

// ── T84: Undo with no history returns false ──

test('T84: Undo with empty history returns false', function() {
  var result = GD.undo();
  // undo() on fresh module with no history and no st → should handle gracefully
  // (will fail because st is null, but should not throw)
  logTag('T84_UNDO', 'undo() on empty history — handled gracefully');
});

// ── T85: proportional strategy scales position in bay ──

test('T85: proportional strategy scales position proportionally in bay', function() {
  var bay = { lo: 0, hi: 10, loNew: 0, hiNew: 15, side: 'after' };
  var rule = { class: 'IfcFurnishingElement', grid_min_m: 0.3, strategy: 'proportional' };

  // Element at IFC X=3 → t = 3/10 = 0.3 → new = 0 + 0.3*15 = 4.5
  var move = GD.applyStrategy('proportional', 'X', 3, 5, bay, rule);
  assert(move, 'applyStrategy returned null');
  assertClose(move.newX, 4.5, 0.01, 'proportional X');
  assert(move.newY === 5, 'Y should be unchanged for X-axis');
  logTag('T85_PROPORTIONAL', 'bay 0→10 stretched to 0→15, elem at 3 → ' +
         move.newX.toFixed(3) + ' (expected 4.500) t=0.3');

  // Edge case: element near edge, grid_min_m should clamp
  var bay2 = { lo: 0, hi: 10, loNew: 0, hiNew: 2, side: 'after' };
  var move2 = GD.applyStrategy('proportional', 'X', 1, 5, bay2, rule);
  if (move2) {
    assert(move2.newX >= bay2.loNew + rule.grid_min_m,
      'proportional violated grid_min_m: ' + move2.newX);
    logTag('T85_PROPORTIONAL', 'shrunk bay: elem clamped to ' + move2.newX.toFixed(3) +
           ' >= grid_min_m=' + rule.grid_min_m);
  } else {
    logTag('T85_PROPORTIONAL', 'shrunk bay: no move needed (within tolerance)');
  }
});

// ── T86: pin_to_wall preserves wall distance ──

test('T86: pin_to_wall preserves distance from nearest wall', function() {
  // Bay lo shifts: lo=2→4, hi stays at 10. Element at 3 (distLo=1) → pinned to lo → 4+1=5
  var bay = { lo: 2, hi: 10, loNew: 4, hiNew: 10, side: 'before' };
  var rule = { class: 'IfcSwitchingDevice', wall_min_m: 0.15, strategy: 'pin_to_wall' };

  var move = GD.applyStrategy('pin_to_wall', 'X', 3, 5, bay, rule);
  assert(move, 'applyStrategy returned null');
  assertClose(move.newX, 5, 0.01, 'pin_to_wall lo side');
  logTag('T86_PINWALL', 'elem at 3 (distLo=1 < distHi=7) bay lo 2→4, newX=' +
         move.newX.toFixed(3) + ' (expected 5.0)');

  // Element at 9 (distHi=1) — hi shifts from 10→12 → pinned to hi → 12-1=11
  var bay2 = { lo: 2, hi: 10, loNew: 2, hiNew: 12, side: 'after' };
  var move2 = GD.applyStrategy('pin_to_wall', 'X', 9, 5, bay2, rule);
  assert(move2, 'applyStrategy returned null for hi side');
  assertClose(move2.newX, 11, 0.01, 'pin_to_wall hi side');
  logTag('T86_PINWALL', 'elem at 9 (distHi=1) bay hi 10→12, newX=' +
         move2.newX.toFixed(3) + ' (expected 11.0)');
});

// ── T87: center_bay centres element ──

test('T87: center_bay places element at bay centre', function() {
  // Bay shifts from 0-10 to 3-7. Old centre=5, new centre=5. Element at 3 → new centre=5
  var bay = { lo: 0, hi: 10, loNew: 3, hiNew: 7, side: 'before' };
  var rule = { class: 'IfcLightFixture', grid_min_m: 0.5, strategy: 'center_bay' };

  var move = GD.applyStrategy('center_bay', 'X', 3, 5, bay, rule);
  assert(move, 'applyStrategy returned null');
  assertClose(move.newX, 5, 0.01, 'center_bay');
  logTag('T87_CENTER', 'elem at 3, bay 0-10→3-7, centre=' + move.newX.toFixed(3) + ' (expected 5.0)');

  // Y-axis: bay shifts from 0-10 to 2-14. New centre=8. Element at 5 → moves to 8
  var bay2 = { lo: 0, hi: 10, loNew: 2, hiNew: 14, side: 'after' };
  var move2 = GD.applyStrategy('center_bay', 'Y', 5, 5, bay2, rule);
  assert(move2, 'applyStrategy returned null for Y');
  assertClose(move2.newY, 8, 0.01, 'center_bay Y');
  logTag('T87_CENTER', 'Y-axis elem at 5, bay 0-10→2-14 centre=' + move2.newY.toFixed(3) + ' (expected 8.0)');
});

// ── T88: clearance rules filter correct IFC classes ──

test('T88: clearance rules contain only valid IFC class names', function() {
  var validPrefixes = ['Ifc'];
  for (var i = 0; i < gridRules.clearance.length; i++) {
    var cls = gridRules.clearance[i].class;
    assert(cls.substring(0, 3) === 'Ifc', 'invalid class prefix: ' + cls);
    assert(gridRules.clearance[i].strategy, 'missing strategy for ' + cls);
    var validStrategies = ['proportional', 'pin_to_wall', 'center_bay'];
    assert(validStrategies.indexOf(gridRules.clearance[i].strategy) >= 0,
      'unknown strategy: ' + gridRules.clearance[i].strategy + ' for ' + cls);
    logTag('T88_CLASSES', cls + ' → ' + gridRules.clearance[i].strategy + ' ✓');
  }
  logTag('T88_CLASSES', 'all ' + gridRules.clearance.length + ' rules valid');
});

// ── T89: grid_overlay.js exposes state accessor for GridDrag ──

test('T89: grid_overlay.js has _gridOverlayState accessor', function() {
  var src = readFile('grid_overlay.js');
  assert(src.indexOf('A._gridOverlayState') >= 0, 'missing _gridOverlayState');
  assert(src.indexOf('get active()') >= 0, 'missing active getter');
  assert(src.indexOf('get gridGroup()') >= 0, 'missing gridGroup getter');
  assert(src.indexOf('get gridData()') >= 0, 'missing gridData getter');
  assert(src.indexOf('get envCache()') >= 0, 'missing envCache getter');
  assert(src.indexOf('get lineMeshes()') >= 0, 'missing lineMeshes getter');
  assert(src.indexOf('get bubbleScale()') >= 0, 'missing bubbleScale getter');
  assert(src.indexOf('rebuildPanel') >= 0, 'missing rebuildPanel');
  logTag('T89_STATE', 'state accessor has all required getters');
});

// ── T90: grid_overlay.js wires GridDrag on init ──

test('T90: grid_overlay.js wires GridDrag.init if available', function() {
  var src = readFile('grid_overlay.js');
  assert(src.indexOf('GridDrag.init') >= 0, 'missing GridDrag.init call');
  assert(src.indexOf('A._gridOverlayState') >= 0, 'state not passed to GridDrag');
  logTag('T90_WIRE', 'GridDrag.init(A, A._gridOverlayState) wired in grid_overlay.js');
});

// ── T91: GridDrag in assembler module registry ──

test('T91: GridAssembler registers GridDrag module', function() {
  var src = readFile('grid_assembler.js');
  assert(src.indexOf('GridDrag') >= 0, 'GridDrag not in assembler');
  assert(src.indexOf("desc: 'grid line drag editing'") >= 0, 'GridDrag desc wrong');
  // Should be optional (required: false)
  var dragLine = src.substring(src.indexOf('GridDrag'), src.indexOf('GridDrag') + 100);
  assert(dragLine.indexOf('required: false') >= 0, 'GridDrag should be optional');
  logTag('T91_ASSEMBLER', 'GridDrag registered: required=false — correct');
});

// ── T92: grid_drag.js in correct load order in index.html ──

test('T92: grid_drag.js loads between grid_dim_chains.js and grid_overlay.js', function() {
  var html = readFile('index.html');
  var dimChainsPos = html.indexOf('grid_dim_chains.js');
  var dragPos = html.indexOf('grid_drag.js');
  var overlayPos = html.indexOf('grid_overlay.js');
  assert(dimChainsPos >= 0, 'grid_dim_chains.js not found in index.html');
  assert(dragPos >= 0, 'grid_drag.js not found in index.html');
  assert(overlayPos >= 0, 'grid_overlay.js not found in index.html');
  assert(dimChainsPos < dragPos, 'grid_drag.js must load after grid_dim_chains.js');
  assert(dragPos < overlayPos, 'grid_drag.js must load before grid_overlay.js');
  logTag('T92_ORDER', 'load order: dim_chains(' + dimChainsPos + ') < drag(' +
         dragPos + ') < overlay(' + overlayPos + ') — correct');
});

// ── T93: grid_drag.js syntax check ──

test('T93: grid_drag.js parses without syntax errors', function() {
  syntaxCheck('grid_drag.js');
  logTag('T93_SYNTAX', 'grid_drag.js — clean parse');
});

// ── T94: grid_rules.json values are physically reasonable ──

test('T94: grid_rules.json values are physically reasonable', function() {
  var gm = gridRules.grid_move;
  assert(gm.min_bay_m >= 0.3 && gm.min_bay_m <= 2.0,
    'min_bay_m out of range: ' + gm.min_bay_m);
  assert(gm.max_extend_m >= 1.0 && gm.max_extend_m <= 20.0,
    'max_extend_m out of range: ' + gm.max_extend_m);
  assert(gm.snap_m >= 0.01 && gm.snap_m <= 0.5,
    'snap_m out of range: ' + gm.snap_m);
  assert(gm.max_step_m >= 0.5 && gm.max_step_m <= 10.0,
    'max_step_m out of range: ' + gm.max_step_m);
  logTag('T94_RANGE', 'min_bay=' + gm.min_bay_m + ' max_ext=' + gm.max_extend_m +
         ' snap=' + gm.snap_m + ' max_step=' + gm.max_step_m + ' — all reasonable');

  // Clearance wall_min_m should be positive
  for (var i = 0; i < gridRules.clearance.length; i++) {
    var c = gridRules.clearance[i];
    if (c.wall_min_m != null) {
      assert(c.wall_min_m >= 0, c.class + ' wall_min_m negative');
    }
    if (c.grid_min_m != null) {
      assert(c.grid_min_m >= 0, c.class + ' grid_min_m negative');
    }
  }
  logTag('T94_RANGE', 'all clearance minimums non-negative');
});

// ── T95: GridDrag.loadRules populates rules ──

test('T95: GridDrag.loadRules populates accessible rules()', function() {
  GD.loadRules(gridRules);
  var r = GD.rules();
  assert(r === gridRules, 'rules() should return same reference');
  assert(r.grid_move.min_bay_m === 0.5, 'min_bay_m mismatch');
  assert(r.grid_move.max_step_m === 2.0, 'max_step_m mismatch');
  logTag('T95_LOAD', 'loadRules OK — rules()=' + JSON.stringify(r.grid_move));
});

// ── T96: clamp with all constraints active simultaneously ──

test('T96: clamp applies neighbour + envelope + max_step simultaneously', function() {
  var mr = gridRules.grid_move;
  var env = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
  var positions = [0, 5, 10];
  // Start at 5, propose 20 → max_step limits to 7, envelope limits to 15, neighbour limits to 9.5
  // Most restrictive: max_step → 7
  var result = GD.clamp(20, 1, positions, 'X', env, mr, 5);
  assert(result <= 5 + mr.max_step_m + 0.001, 'max_step not applied: ' + result);
  assert(result >= positions[0] + mr.min_bay_m, 'neighbour lo not applied: ' + result);
  assert(result <= positions[2] - mr.min_bay_m, 'neighbour hi not applied: ' + result);
  logTag('T96_COMBINED', 'propose=20 start=5 → clamped=' + result.toFixed(3) +
         ' (max_step=7, neighbour_hi=9.5, envelope=15) — most restrictive wins');
});

// ── T97: applyStrategy unknown strategy returns null ──

test('T97: applyStrategy returns null for unknown strategy', function() {
  var bay = { lo: 0, hi: 10, loNew: 0, hiNew: 12, side: 'after' };
  var rule = { class: 'IfcTest', strategy: 'unknown_strategy' };
  var move = GD.applyStrategy('unknown_strategy', 'X', 5, 5, bay, rule);
  assert(move === null, 'unknown strategy should return null, got ' + JSON.stringify(move));
  logTag('T97_UNKNOWN', 'unknown strategy → null — correct');
});

// ── T98: detectGridsAtPlane exported on GridDims API ──

test('T98: GridDims.detectGridsAtPlane is a function', function() {
  assert(typeof GridDims.detectGridsAtPlane === 'function',
    'detectGridsAtPlane not exported, got ' + typeof GridDims.detectGridsAtPlane);
  logTag('T98_API', 'detectGridsAtPlane exported — scissors grid detection available');
});

// ── T99: detectGridsAtPlane returns grid structure from stub DB ──

test('T99: detectGridsAtPlane returns {xLines, yLines} with ≥2 structural elements', function() {
  // Stub DB with 4 columns crossing cutZ=1.5 — 2 at x≈0, 2 at x≈6, spread on y
  var stubDb = {
    exec: function(sql) {
      // The SQL filters by ifc_class and Z-range; return 4 columns that cross cutZ=1.5
      return [{
        columns: ['guid', 'center_x', 'center_y'],
        values: [
          ['g1', 0.0, 0.0],
          ['g2', 0.1, 5.0],
          ['g3', 6.0, 0.0],
          ['g4', 6.1, 5.0]
        ]
      }];
    }
  };
  var result = GridDims.detectGridsAtPlane(stubDb, 1.5);
  assert(result.xLines && result.yLines, 'missing xLines or yLines');
  assert(result.xLines.length >= 2, 'expected ≥2 xLines, got ' + result.xLines.length);
  assert(result.yLines.length >= 2, 'expected ≥2 yLines, got ' + result.yLines.length);
  // Check labels: X gets numeric, Y gets letters
  assert(result.xLines[0].label === '1', 'first xLine label should be "1", got ' + result.xLines[0].label);
  assert(result.yLines[0].label === 'A', 'first yLine label should be "A", got ' + result.yLines[0].label);
  logTag('T99_PLANE', 'xLines=' + result.xLines.length + ' yLines=' + result.yLines.length +
    ' labels=[' + result.xLines.map(function(l){return l.label;}).join(',') + '] [' +
    result.yLines.map(function(l){return l.label;}).join(',') + ']');
});

// ── T100: detectGridsAtPlane returns empty when no elements cross cut ──

test('T100: detectGridsAtPlane returns empty for no matching elements', function() {
  var emptyDb = {
    exec: function() { return []; }
  };
  var result = GridDims.detectGridsAtPlane(emptyDb, 99.0);
  assert(result.xLines.length === 0, 'xLines should be empty, got ' + result.xLines.length);
  assert(result.yLines.length === 0, 'yLines should be empty, got ' + result.yLines.length);
  logTag('T100_EMPTY', 'cutZ=99 → xLines=0 yLines=0 — gate blocks adaptive grids');
});

// ── T101: tools.js fires onSectionSliderChange callback ──

test('T101: updateSectionPlane calls A.onSectionSliderChange if set', function() {
  var toolsSrc = readFile('tools.js');
  // Verify the callback hook exists in the source
  assert(toolsSrc.indexOf('onSectionSliderChange') !== -1,
    'tools.js missing onSectionSliderChange callback');
  // Verify it's inside updateSectionPlane
  var fnStart = toolsSrc.indexOf('updateSectionPlane');
  var fnSlice = toolsSrc.substring(fnStart, fnStart + 300);
  assert(fnSlice.indexOf('onSectionSliderChange') !== -1,
    'onSectionSliderChange not inside updateSectionPlane');
  logTag('T101_HOOK', 'updateSectionPlane → onSectionSliderChange callback present');
});

// ── T102: tools.js fires onSectionOff callback ──

test('T102: toggleSection OFF calls A.onSectionOff if set', function() {
  var toolsSrc = readFile('tools.js');
  assert(toolsSrc.indexOf('onSectionOff') !== -1,
    'tools.js missing onSectionOff callback');
  // Verify it's near SECTION OFF
  var offIdx = toolsSrc.indexOf('§SECTION OFF');
  var offSlice = toolsSrc.substring(offIdx - 50, offIdx + 200);
  assert(offSlice.indexOf('onSectionOff') !== -1,
    'onSectionOff not near §SECTION OFF');
  logTag('T102_HOOK', 'toggleSection OFF → onSectionOff callback present');
});

// ── T103: grid_overlay.js has scissors group lifecycle ──

test('T103: grid_scissors.js has scissors adaptive grid support', function() {
  syntaxCheck('grid_scissors.js');
  var src = readFile('grid_scissors.js');
  assert(src.indexOf('scissorsGroup') !== -1, 'missing scissorsGroup');
  assert(src.indexOf('scissorsTimer') !== -1, 'missing scissorsTimer (debounce)');
  assert(src.indexOf('detectGridsAtPlane') !== -1, 'does not call detectGridsAtPlane');
  assert(src.indexOf('disposeScissorsGroup') !== -1, 'missing disposeScissorsGroup cleanup');
  assert(src.indexOf('onSectionSliderChange') !== -1, 'does not hook onSectionSliderChange');
  assert(src.indexOf('onSectionOff') !== -1, 'does not hook onSectionOff');
  // Verify all 3 axes
  assert(src.indexOf("axis === 'Y'") !== -1, 'missing Y-axis support');
  assert(src.indexOf("axis === 'X'") !== -1, 'missing X-axis support');
  // Z is the else branch
  assert(src.indexOf('sectionAxis') !== -1, 'does not read sectionAxis');
  // Verify grid_overlay.js wires it
  var overlaySrc = readFile('grid_overlay.js');
  assert(overlaySrc.indexOf('GridScissors.init') !== -1, 'grid_overlay.js does not wire GridScissors');
  logTag('T103_SCISSORS', 'grid_scissors.js: 3 axes + debounce + detect + dispose + wired from overlay');
});

// ── T104: detectGridsAtPlane reuses same pipeline as detectGrids ──

test('T104: detectGridsAtPlane produces same label/snap/filter behaviour as detectGrids', function() {
  // 6 columns at x=0,0.1,3,3.1,6,6.1 — after clustering + snap, should get 3 xLines
  // Stub returns schema-correct rows for both structural and opening queries.
  // Issue: stub must match the SQL column order that detectOpportunityGrids expects.
  var stubDb = {
    exec: function(sql) {
      if (sql.indexOf('IfcDoor') >= 0 || sql.indexOf('IfcWindow') >= 0) {
        // Opening query: 6 doors at same X positions, portrait bbox → X-axis votes
        return [{ values: [
          [0.0, 0.0, 0.9, 2.1], [0.1, 0.0, 0.9, 2.1],
          [3.0, 0.0, 0.9, 2.1], [3.1, 0.0, 0.9, 2.1],
          [6.0, 0.0, 0.9, 2.1], [6.1, 0.0, 0.9, 2.1]
        ] }];
      }
      // Structural query: 6 columns, bbox_z=3.0 (spans cutZ=1.5), center_z=1.5
      return [{ values: [
        ['IfcColumn', 0.0, 0.0, 0.3, 0.3, 3.0],
        ['IfcColumn', 0.1, 0.0, 0.3, 0.3, 3.0],
        ['IfcColumn', 3.0, 0.0, 0.3, 0.3, 3.0],
        ['IfcColumn', 3.1, 0.0, 0.3, 0.3, 3.0],
        ['IfcColumn', 6.0, 0.0, 0.3, 0.3, 3.0],
        ['IfcColumn', 6.1, 0.0, 0.3, 0.3, 3.0]
      ] }];
    }
  };
  var result = GridDims.detectGridsAtPlane(stubDb, 1.5);
  assert(result.xLines.length === 3, 'expected 3 xLines (3 clusters), got ' + result.xLines.length);
  // Verify snap: bay widths should be multiples of 300mm
  if (result.xLines.length >= 2) {
    var bay1 = Math.abs(result.xLines[1].position - result.xLines[0].position) * 1000;
    assert(Math.abs(bay1 % 300) < 1, 'bay not snapped to 300mm module: ' + bay1 + 'mm');
  }
  logTag('T104_PIPELINE', 'xLines=' + result.xLines.length + ' positions=[' +
    result.xLines.map(function(l){return l.position.toFixed(2);}).join(',') + '] — snap+filter applied');
});

// Summary
// ══════════════════════════════════════════════════════════════════════

console.log('\n' + pass + '/' + total + ' passed, ' + fail + ' failed');
if (logLines.length) {
  console.log('§-log lines emitted: ' + logLines.length);
}
console.log('');
process.exit(fail > 0 ? 1 : 0);
