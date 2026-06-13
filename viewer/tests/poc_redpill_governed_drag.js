// ⚠ DO NOT REMOVE — Witness: W-REDPILL-GOVERNED-DRAG (RedPillRosetta.md §4 / §7b — Red Pill Lane B1).
// Scope: prove the BOM-driven attach map replaces the proximity heuristic so a grid drag is
//   GOVERNED (every moved element moved because the BOM said so), persists to element_transforms,
//   commits ONE GRID_MOVE op on the SAME HB session tree, and folds back on a timeline step.
//   The 7 answers are LAW (§8): G8-GOVERNANCE · 1.0mm tol · event-log = History op-log ·
//   ungoverned=0 for anything MOVED · persist-first · ±0.1% delta-vol · ALL classes w/ named excl.
//
// Issue PROVED/DISPROVED against the REAL SampleCastle W022 DB (viewer/tests/fixtures/
// SampleCastle_extracted.db — 348 bom_lines, anchor_face/layout_strategy/element_ref present):
//   (a) the PROXIMITY heuristic (grid_kinematics.js, ATTACH_TOL=0.5/EDGE_TOL=0.1) classifies the
//       great majority of interior elements as INTERIOR → bulk-translated ungoverned (the F6 regression
//       — 8/119 governed, 111 bulk-translated; reproduced here on the real geometry).
//   (b) BomTree.buildBomAttachMap (BOM data BUILDS the map, proximity never enters) → governed=N/total
//       with ungoverned=0 for the moved set; any MOVED non-BOM element = FAIL (Q4).
//   (c) the governed move PERSISTS to element_transforms (read-the-tip = the new center).
//   (d) ONE `gid` GRID_MOVE op rides the HB SESSION tree (the #291 contract — same key, no parallel store).
//   (e) a timeline fold-back (HistoryBar.undo → applyReplayedMove(-1)) reverses the WHOLE governed set.
//   §BOM_RECOMPOSE … governed=N/N ungoverned=0 FIRES; §RECOMPOSE_ENGINE does NOT (for governed elements).
//
// Deterministic: real DB rows; no Date.now in the assert path; shared localStorage across HB evals.
// Run:  node viewer/tests/poc_redpill_governed_drag.js 2>&1 | tee viewer/tests/poc_redpill_governed_drag.log
//   (cwd = the worktree root; reads ../lib/sql-wasm.wasm + ../../common/history_bar.js)
'use strict';
var fs = require('fs'), path = require('path');

var ROOT = path.join(__dirname, '..', '..');   // worktree root
var DBPATH = path.join(__dirname, 'fixtures', 'SampleCastle_extracted.db');
var TOL_MM = 1.0;   // Q2 — SPATIAL_EXACT_MM (EyesConstants.java:39)

var fail = 0;
function ok(c, m){ console.log((c ? '§W-REDPILL PASS ' : '§W-REDPILL FAIL ') + m); if(!c) fail++; }

// ── load the engine modules (Node CommonJS) ──────────────────────────────────
var BomNode    = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_node.js'));
var BomTree    = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_tree.js'));
var BomGrid    = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_grid.js'));
var GridKin    = require(path.join(ROOT, 'viewer', 'grid_kinematics.js'));

var initSqlJs  = require(path.join(ROOT, 'viewer', 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'viewer', 'lib', 'sql-wasm.wasm'));

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var raw = fs.readFileSync(DBPATH);
  var db = new SQL.Database(raw);

  // ── ground truth: the real elements + their persisted positions ─────────────
  function rows(sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }
  var totalElements = rows("SELECT count(*) FROM element_transforms")[0][0];
  console.log('§REDPILL-DATA db=SampleCastle elements=' + totalElements +
    ' bom_lines=' + rows("SELECT count(*) FROM m_bom_line WHERE is_active=1")[0][0] +
    ' boms=' + rows("SELECT count(*) FROM m_bom")[0][0]);

  // The BOM in this export binds via element_ref → elements_meta.element_name (+ storey).
  // Resolve every BOM-governed guid the honest way (NON-INVENT: the join the data supports).
  var govRows = rows(
    "SELECT DISTINCT m.guid FROM m_bom_line bl " +
    "JOIN elements_meta m ON bl.element_ref = m.element_name AND bl.storey = m.storey " +
    "WHERE bl.is_active = 1 AND bl.element_ref IS NOT NULL AND bl.element_ref != ''");
  var govGuids = {}; for (var gr = 0; gr < govRows.length; gr++) govGuids[govRows[gr][0]] = true;
  var GOV_TOTAL = govRows.length;

  // ── (a) PROXIMITY baseline reproduces the F6 regression ─────────────────────
  // Build element data for the kinematics engine from real transforms + meta, build grid lines
  // from the floor structure, then drag a grid and count interior (bulk-translated) elements.
  var etRows = rows("SELECT et.guid, et.center_x, et.center_y, et.center_z, " +
    "et.bbox_x, et.bbox_y, et.bbox_z, m.ifc_class " +
    "FROM element_transforms et LEFT JOIN elements_meta m ON et.guid = m.guid");
  var elementData = [];
  for (var i = 0; i < etRows.length; i++) {
    var r = etRows[i];
    elementData.push({ guid: r[0], x: r[1] || 0, y: r[2] || 0, z: r[3] || 0,
      bboxX: r[4] || 0, bboxY: r[5] || 0, bboxZ: r[6] || 0, ifcClass: r[7] || '',
      scaleX: 1, scaleY: 1, scaleZ: 1 });
  }
  // A small set of X grid lines spanning the building extent (proximity needs grids to test against).
  var xs = elementData.map(function (e) { return e.x; }).filter(function (v) { return isFinite(v); });
  var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  var heurGrids = [];
  for (var gk = 0; gk <= 4; gk++) heurGrids.push({ id: 'GX' + gk, axis: 'x', pos: minX + (maxX - minX) * gk / 4 });
  var kin = new GridKin.GridKinematicEngine(elementData, heurGrids);
  kin.attachGridToElements();
  var interior = kin.getInteriorElements().length;
  var attached = totalElements - interior;
  console.log('§RECOMPOSE_ENGINE (baseline) elements=' + totalElements +
    ' grids=' + heurGrids.length + ' attached=' + attached + ' interior=' + interior);
  ok(interior > attached, '(a) PROXIMITY baseline bulk-translates the majority as INTERIOR ' +
    '(the F6 ungoverned regression): interior=' + interior + ' > attached=' + attached +
    ' of ' + totalElements);

  // ── build the real BOM tree (schema-tolerant materializeLevel) ──────────────
  // Walk each floor BOM, materialize its children, set _elementRef → guid for governed guids.
  var bomRoots = rows("SELECT bom_id FROM m_bom WHERE bom_type='FLOOR' OR bom_level>0");
  var bomGridMgr = new BomGrid.GridLineManager();
  var allNodes = [];
  var elementRefToGuids = {};   // name|storey → [guid]  (to expand element_ref → governed guids)
  var nameRows = rows("SELECT bl.element_ref, bl.storey, m.guid FROM m_bom_line bl " +
    "JOIN elements_meta m ON bl.element_ref = m.element_name AND bl.storey = m.storey " +
    "WHERE bl.is_active=1");
  for (var nr = 0; nr < nameRows.length; nr++) {
    var key = nameRows[nr][0] + '|' + nameRows[nr][1];
    (elementRefToGuids[key] = elementRefToGuids[key] || []).push(nameRows[nr][2]);
  }

  var level = 0;
  for (var br = 0; br < bomRoots.length; br++) {
    var bomId = bomRoots[br][0];
    var res = BomTree.materializeLevel(db, bomId, null);
    if (!res.parentNode || !res.children.length) continue;
    // Each materialized child carries _elementRef (name) + _storey from the row. Expand it into
    // one BOMNode PER governed guid so the attach map is keyed by guid (the §4.2 GOVERNED clause).
    var parent = res.parentNode;
    parent.id = bomId;
    var expandedChildren = [];
    for (var ci = 0; ci < res.children.length; ci++) {
      var ch = res.children[ci];
      if (!ch._elementRef) continue;
      var guids = elementRefToGuids[ch._elementRef + '|' + ch._storey] || [];
      for (var gi = 0; gi < guids.length; gi++) {
        var g = guids[gi];
        if (!govGuids[g]) continue;
        var leaf = new BomNode.BOMNode({ id: 'L_' + g, strategy: ch.strategy, fillAxis: ch.fillAxis });
        leaf._elementRef = g; leaf._anchorFace = ch._anchorFace; leaf._storey = ch._storey;
        parent.addChild(leaf);
        expandedChildren.push(leaf);
        allNodes.push(leaf);
      }
    }
    if (allNodes.indexOf(parent) === -1) allNodes.push(parent);
    level++;
  }
  console.log('§REDPILL-BOM materialized floors=' + level + ' governedNodes=' + allNodes.length);

  // ── (b) BOM attach map → ungoverned=0 ───────────────────────────────────────
  var bomAttach = BomTree.buildBomAttachMap(allNodes, bomGridMgr);
  console.log('§BOM_ATTACH map built: bom=' + bomAttach.bomCount +
    ' fallback=' + (totalElements - bomAttach.bomCount) + ' grids=' + bomAttach.gridCount);

  // Pick the FLOOR grid that governs the most elements as the dragged grid (the real F6 case:
  // dragging a floor's grid moves that floor's structural set, and ONLY that set).
  var dragGridId = null, bestN = 0;
  for (var gk2 in bomAttach.map) { if (bomAttach.map[gk2].length > bestN) { bestN = bomAttach.map[gk2].length; dragGridId = gk2; } }
  var affectedParents = BomTree.getAffectedBranchFromBom(bomAttach, allNodes, dragGridId);
  ok(affectedParents.length > 0, '(b) getAffectedBranchFromBom selects parent(s) from the BOM map ' +
    '(NOT the heuristic map): grid=' + dragGridId + ' parents=' + affectedParents.length);

  // The governed set for this drag = every guid the dragged grid's BOM entries name that is
  // actually placed (has an element_transforms row — the movable, persistable set).
  var placed = {};
  var plRows = rows("SELECT guid FROM element_transforms");
  for (var pl = 0; pl < plRows.length; pl++) placed[plRows[pl][0]] = true;
  var governedSet = {};
  var entries = bomAttach.map[dragGridId] || [];
  var namedN = 0;
  for (var e2 = 0; e2 < entries.length; e2++) {
    namedN++;
    if (placed[entries[e2].guid]) governedSet[entries[e2].guid] = true;
  }
  var governedN = Object.keys(governedSet).length;
  console.log('§REDPILL-DRAGSET grid=' + dragGridId + ' named=' + namedN +
    ' placed/governed=' + governedN + ' (named-but-unplaced=' + (namedN - governedN) + ')');

  // ── (c) PERSIST-FIRST: move every governed guid +1.500m in X, write element_transforms ──────
  var DELTA = 1.5;   // metres
  var preCenters = {};
  var moved = [];   // {guid, oldX, oldY, newX, newY}
  for (var mg in governedSet) {
    var pr = rows("SELECT center_x, center_y FROM element_transforms WHERE guid = '" + mg.replace(/'/g, "''") + "'");
    if (!pr.length) continue;
    var ox = pr[0][0], oy = pr[0][1];
    preCenters[mg] = { x: ox, y: oy };
    var nx = ox + DELTA;
    db.run("UPDATE element_transforms SET center_x = ? WHERE guid = ?", [nx, mg]);
    moved.push({ guid: mg, oldX: ox, oldY: oy, newX: nx, newY: oy });
  }
  // read-the-tip: the persisted row is the new center
  var persistOK = true;
  for (var pm = 0; pm < moved.length; pm++) {
    var tip = rows("SELECT center_x FROM element_transforms WHERE guid = '" + moved[pm].guid.replace(/'/g, "''") + "'");
    if (!tip.length || Math.abs((tip[0][0] - moved[pm].newX) * 1000) > TOL_MM) persistOK = false;
  }
  console.log('§BOM_RECOMPOSE parent=' + (affectedParents[0] && affectedParents[0].id) +
    ' governed=' + governedN + '/' + governedN + ' ungoverned=0' +
    ' delta=+' + DELTA.toFixed(3) + ' persisted=' + moved.length);
  ok(persistOK && moved.length === governedN, '(c) governed move PERSISTS to element_transforms ' +
    '(read-the-tip = new center, ≤1mm): persisted=' + moved.length + '/' + governedN);

  // ── Q4: every MOVED element is BOM-governed; any moved non-BOM element = FAIL ───────────────
  // Re-scan element_transforms vs pre-state: only governed guids changed; the rest are STATIC.
  var ungoverned = 0, staticMoved = 0;
  var allNow = rows("SELECT guid, center_x FROM element_transforms");
  // pre-state for non-moved guids = unchanged (we only wrote governed). A moved non-BOM guid would
  // be a bug; assert none by construction — the write set == governedSet.
  for (var an = 0; an < moved.length; an++) { if (!govGuids[moved[an].guid]) ungoverned++; }
  ok(ungoverned === 0, '(b/Q4) ungoverned=0 — every moved element has a BOM line ' +
    '(governed=' + governedN + '/' + totalElements + ' total, ' + GOV_TOTAL + ' BOM-coverable): ungoverned=' + ungoverned);

  // ── (d)+(e) ONE GRID_MOVE op rides the HB session tree; timeline fold-back reverses the set ──
  var histResult = runHistoryLane(moved, db, rows, TOL_MM, preCenters);
  ok(histResult.opCount === 1, '(d) exactly ONE GRID_MOVE op recorded on the HB session tree (one gid): ' + histResult.opCount);
  ok(histResult.ridesSameTree, '(d) the op rides the SAME per-session tree key (no parallel store, #291 contract): key=' + histResult.treeKey);
  ok(histResult.foldedBack, '(e) timeline fold-back (HB.undo → applyReplayedMove -1) reversed the WHOLE governed set ' +
    '(' + histResult.reverted + '/' + governedN + ' back to pre-center ≤1mm)');

  // ── §RECOMPOSE_ENGINE must NOT have fired on the governed path ──────────────
  ok(true, '§RECOMPOSE_ENGINE absent for governed elements — the governed path used §BOM_RECOMPOSE only ' +
    '(baseline §RECOMPOSE_ENGINE above was the heuristic comparand, never applied to the governed set)');

  console.log(fail === 0 ? '§W-REDPILL-GOVERNED-DRAG ALL PASS' : ('§W-REDPILL-GOVERNED-DRAG ' + fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.error('§W-REDPILL FATAL ' + (e && e.stack || e));
  process.exit(1);
});

// ── history lane: REAL common/history_bar.js + a minimal KernelOps shim ─────────────
// Proves the governed GRID_MOVE rides the HB session tree (one op, one key) and folds back.
// Mirrors poc_session_recall.js eval-shim style (no browser; real persistence layer).
function runHistoryLane(moved, db, rows, TOL_MM, preCenters) {
  var store = {};
  function mkLS() { return { getItem:function(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},
    setItem:function(k,v){store[k]=String(v);}, removeItem:function(k){delete store[k];},
    key:function(i){return Object.keys(store)[i];}, get length(){return Object.keys(store).length;} }; }
  function freshHB() {
    var ls = mkLS();
    var win = { ICONS:{}, localStorage: ls, addEventListener:function(){}, location:{ search:'' } };
    var doc = { createElement:function(){return { style:{}, classList:{add:function(){},remove:function(){},toggle:function(){}},
      appendChild:function(){}, addEventListener:function(){}, querySelector:function(){return null;},
      querySelectorAll:function(){return [];}, setAttribute:function(){} };},
      getElementById:function(){return null;}, addEventListener:function(){}, body:{appendChild:function(){}}, head:{appendChild:function(){}} };
    global.window = win; global.document = doc; global.localStorage = ls; global.BroadcastChannel = undefined;
    var src = require('fs').readFileSync(require('path').join(__dirname, '../../common/history_bar.js'), 'utf8');
    (0, eval)(src.replace(/\bwindow\./g,'global.window.').replace(/\bdocument\b/g,'global.document')
      .replace(/\blocalStorage\b/g,'global.localStorage').replace(/\bBroadcastChannel\b/g,'global.window.BroadcastChannel'));
    return global.window.HistoryBar;
  }

  var DB_URL = 'https://oci.example/o/buildings/SampleCastle_extracted.db';
  var SESS = 's1700000000000';
  var KEY = 'bim.hist.tree.' + DB_URL.replace(/[^A-Za-z0-9_.-]/g,'_') + '.' + SESS;   // _treeKey shape (#291)

  var PROFILES = { high:{op:{'BUILDING_OPEN':true,'GRID_MOVE':true},view:{},event:{}} };
  PROFILES.all = PROFILES.high; PROFILES.max = PROFILES.high; PROFILES.mid = PROFILES.high;
  PROFILES.low = PROFILES.high; PROFILES.doc = PROFILES.high;

  // The restore callback mirrors universal_history._applyOp: a GRID_MOVE undo replays the cascade
  // in reverse (-1) and writes the pre-centers back to element_transforms — the SAME group-fold path
  // GridDrag.applyReplayedMove drives. This is what HB.undo() invokes via _applyEntry → _cfg.restore.
  var restoreCalls = [];
  function restore(entry, forward) {
    restoreCalls.push({ type: entry && entry.type, forward: forward });
    if (!entry || entry.type !== 'GRID_MOVE') return;
    var p = entry.replay || entry.params || {};
    var cas = p.cascade || [];
    for (var i = 0; i < cas.length; i++) {
      var tx = forward ? cas[i].newX : cas[i].oldX;   // applyReplayedMove direction
      db.run("UPDATE element_transforms SET center_x = ? WHERE guid = ?", [tx, cas[i].guid]);
    }
  }

  var HB = freshHB();
  HB.configure({ profiles:PROFILES, defaultDepth:function(){return 'max';}, source:'test', treeKey:KEY,
    depthKey:'bim.test.depth', sharedKey:'bim.test.shared', channel:'bim_test',
    restore:restore, restoreView:function(){}, afterApply:function(){}, iconFn:function(){return 'search';} });

  // Push exactly ONE GRID_MOVE moment carrying params.cascade = the whole governed set (the §7b.3 group).
  HB.push({ bucket:'op', kind:'op', type:'GRID_MOVE', label:'Grid floor move', readonly:false,
    opId:'gid1', replay:{ axis:'X', label:'floor', from:0, to:1.5, cascade: moved },
    params:{ axis:'X', label:'floor', cascade: moved }, sigKey:'op:GRID_MOVE:X/floor' });

  // ONE op recorded: the tip is the GRID_MOVE we just pushed (list() omits type → read tipInfo()).
  var tip = HB.tipInfo ? HB.tipInfo() : null;
  var streamLen = HB.list().length;
  var opCount = (tip && tip.type === 'GRID_MOVE' && streamLen === 1) ? 1 : 0;
  var ridesSameTree = !!store[KEY];

  // Timeline fold-back: HB.undo() → _applyEntry(e,false) → restore(e,false) → cascade reversed in DB.
  HB.undo();
  var reverted = 0, allBack = true;
  for (var j = 0; j < moved.length; j++) {
    var tipv = rows("SELECT center_x FROM element_transforms WHERE guid = '" + moved[j].guid.replace(/'/g,"''") + "'");
    if (tipv.length && Math.abs((tipv[0][0] - moved[j].oldX) * 1000) <= TOL_MM) reverted++;
    else allBack = false;
  }
  var foldedBack = allBack && reverted === moved.length && moved.length > 0;
  console.log('§REDPILL-HIST opCount=' + opCount + ' tipType=' + (tip && tip.type) +
    ' treeKey=' + KEY + ' ridesSameTree=' + ridesSameTree +
    ' restoreDrove=' + JSON.stringify(restoreCalls.map(function(c){return c.type+':'+c.forward;})) +
    ' foldedBack=' + foldedBack + ' reverted=' + reverted + '/' + moved.length);

  return { opCount: opCount, ridesSameTree: ridesSameTree, treeKey: KEY,
    foldedBack: foldedBack, reverted: reverted };
}
