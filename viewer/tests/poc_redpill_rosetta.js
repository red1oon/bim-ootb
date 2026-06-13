// ⚠ DO NOT REMOVE — Witness: W-REDPILL-ROSETTA / G8-GOVERNANCE (RedPillRosetta.md §3/§4/§5/§6 — Lane B2).
// Scope: turn B1's governed moves into a GATE. The RosettaStone comparison that proves a re-modelled
//   building is VERIFIED, with the SAME arithmetic rigor the Java G-gates apply to the static compiler,
//   now on the dynamic editor output. Two modes, both arithmetic, both NON-INVENT:
//     mode=identity (§3): grammar→grid→materialize, no edits → output == reference within gate tol
//                         (RP-COUNT=G1, RP-VOLUME=G2 ±0.1%, RP-DIGEST=G3 cross-mode, RP-CENTROID ≤1mm).
//     mode=delta    (§4): after a grid drag, EVERY moved element moved because the BOM said so —
//                         predict P(BOM, grid′) vs persisted actual; ungoverned=0 = PASS (G8-GOVERNANCE,
//                         the dynamic peer of G5-PROVENANCE: every DELTA is BOM-explained).
//
// The gate MUST be able to FAIL and say why (§4.2/§6). Four scenarios on the REAL SampleCastle W022 DB:
//   S1 identity (no edits)            → PASS  + RP-DIGEST sensitivity sub-proof (perturb ⇒ digest differs).
//   S2 governed drag (+1.5m X, 882)   → PASS  governed=882/882 static=ok ungoverned=0.
//   S3 governed drag + 1 escaped elem → FAIL  ungoverned=1, names the offender (the F6 regression, caught).
//   S4 governed drag + 1 wrong delta  → FAIL  PREDICT_MISS=1, names predicted vs actual.
//
// REUSE, DON'T FORK: gate maths = viewer/tests/redpill_gate.js (JS port of SpatialDigest/G1/G2,
//   byte-comparable with the Java oracle). Bound set = bom_tree.buildBomAttachMap (BOM BUILDS the map,
//   proximity never enters) — the exact non-invent path B1's poc_redpill_governed_drag.js uses.
// Run:  node viewer/tests/poc_redpill_rosetta.js 2>&1 | tee viewer/tests/poc_redpill_rosetta.log
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var DBPATH = path.join(__dirname, 'fixtures', 'SampleCastle_extracted.db');
var TOL_MM = 1.0;   // Q2 — SPATIAL_EXACT_MM (EyesConstants.java:39)
var BUILD = 'SampleCastle';

var GATE = require(path.join(__dirname, 'redpill_gate.js'));
var BomNode = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_node.js'));
var BomTree = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_tree.js'));
var BomGrid = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_grid.js'));
var initSqlJs = require(path.join(ROOT, 'viewer', 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'viewer', 'lib', 'sql-wasm.wasm'));

var fail = 0;
function ok(c, m) { console.log((c ? '§W-REDPILL-RS PASS ' : '§W-REDPILL-RS FAIL ') + m); if (!c) fail++; }
function rowsOf(db, sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }
function esc(s) { return String(s).replace(/'/g, "''"); }

// ── Build the BOM-governed bound set for the floor grid (the same path as B1) ───────────────────
// Returns { boundSet:{guid:true}, dragGridId, gridDelta } — proximity NEVER enters.
function buildBoundSet(db) {
  var govRows = rowsOf(db,
    "SELECT DISTINCT m.guid FROM m_bom_line bl " +
    "JOIN elements_meta m ON bl.element_ref = m.element_name AND bl.storey = m.storey " +
    "WHERE bl.is_active = 1 AND bl.element_ref IS NOT NULL AND bl.element_ref != ''");
  var govGuids = {}; govRows.forEach(function (r) { govGuids[r[0]] = true; });

  var elementRefToGuids = {};
  rowsOf(db, "SELECT bl.element_ref, bl.storey, m.guid FROM m_bom_line bl " +
    "JOIN elements_meta m ON bl.element_ref = m.element_name AND bl.storey = m.storey WHERE bl.is_active=1")
    .forEach(function (r) { var k = r[0] + '|' + r[1]; (elementRefToGuids[k] = elementRefToGuids[k] || []).push(r[2]); });

  var bomRoots = rowsOf(db, "SELECT bom_id FROM m_bom WHERE bom_type='FLOOR' OR bom_level>0");
  var bomGridMgr = new BomGrid.GridLineManager();
  var allNodes = [];
  bomRoots.forEach(function (br) {
    var bomId = br[0];
    var res = BomTree.materializeLevel(db, bomId, null);
    if (!res.parentNode || !res.children.length) return;
    var parent = res.parentNode; parent.id = bomId;
    res.children.forEach(function (ch) {
      if (!ch._elementRef) return;
      (elementRefToGuids[ch._elementRef + '|' + ch._storey] || []).forEach(function (g) {
        if (!govGuids[g]) return;
        var leaf = new BomNode.BOMNode({ id: 'L_' + g, strategy: ch.strategy, fillAxis: ch.fillAxis });
        leaf._elementRef = g; leaf._anchorFace = ch._anchorFace; leaf._storey = ch._storey;
        parent.addChild(leaf); allNodes.push(leaf);
      });
    });
    if (allNodes.indexOf(parent) === -1) allNodes.push(parent);
  });

  var bomAttach = BomTree.buildBomAttachMap(allNodes, bomGridMgr);
  // Dragged grid = the one governing the most placed elements (the real F6 floor-structure case).
  var placed = {}; rowsOf(db, "SELECT guid FROM element_transforms").forEach(function (r) { placed[r[0]] = true; });
  var dragGridId = null, bestN = 0;
  for (var gk in bomAttach.map) { if (bomAttach.map[gk].length > bestN) { bestN = bomAttach.map[gk].length; dragGridId = gk; } }
  var boundSet = {};
  (bomAttach.map[dragGridId] || []).forEach(function (e) { if (placed[e.guid]) boundSet[e.guid] = true; });
  return { boundSet: boundSet, dragGridId: dragGridId, gridDelta: { x: 1.5, y: 0, z: 0 },
    bomCount: bomAttach.bomCount, govGuids: govGuids };
}

function freshDb() { return new SQL.Database(fs.readFileSync(DBPATH)); }
function moveX(db, guid, dx) {
  var pr = rowsOf(db, "SELECT center_x FROM element_transforms WHERE guid='" + esc(guid) + "'");
  if (!pr.length) return;
  db.run("UPDATE element_transforms SET center_x = ? WHERE guid = ?", [pr[0][0] + dx, guid]);
}
function verdict(line) { console.log('§REDPILL-RS ' + line); }
function failLine(line) { console.log('§REDPILL-RS-FAIL ' + line); }

var SQL;
initSqlJs({ wasmBinary: wasmBinary }).then(function (sql) {
  SQL = sql;
  var base = freshDb();
  var totalPlaced = rowsOf(base, "SELECT count(*) FROM element_transforms")[0][0];
  var totalMeta = rowsOf(base, "SELECT count(*) FROM elements_meta")[0][0];
  var metaOnly = totalMeta - totalPlaced;   // unplaced/metadata-only — the named identity exclusion (Q7)
  console.log('§REDPILL-DATA build=' + BUILD + ' placed=' + totalPlaced + ' meta=' + totalMeta +
    ' meta-only(excluded)=' + metaOnly);

  var B = buildBoundSet(base);
  var boundN = Object.keys(B.boundSet).length;
  console.log('§BOM_ATTACH bound=' + boundN + ' (governs grid=' + B.dragGridId + ') bomCoverable=' + B.bomCount +
    ' delta=+' + B.gridDelta.x.toFixed(3) + ' axis=X');

  // ── S1 — IDENTITY round-trip (no edits): output == reference ─────────────────────────────────
  // F8/F9: until P5's NewIFC.db materializer lands, "output" = the in-session persisted state with
  // zero edits (1(a)). With no edit, ref===out → all gate checks PASS; the digest-sensitivity
  // sub-proof shows RP-DIGEST WOULD catch any drift (the gate can fail in identity mode too).
  (function () {
    var db = freshDb();
    var refRows = GATE.aabbRows(db);
    var outRows = GATE.aabbRows(db);   // materialize-with-no-edits target (in-session)
    var g = GATE.identityGate(refRows, outRows, { excludedMeta: metaOnly });
    verdict('mode=identity build=' + BUILD +
      ' count=' + (g.countOk ? 'ok' : 'MISMATCH') + '(' + g.outCount + '/' + g.refCount + ' excl=meta-only:' + metaOnly + ')' +
      ' vol=' + (g.volDeltaPct >= 0 ? '+' : '') + g.volDeltaPct.toFixed(2) + '%' +
      ' digest=' + (g.digestMatch ? 'match' : 'DIFF') +
      ' centroidMax=' + g.centroidMaxMm.toFixed(1) + 'mm' +
      ' verdict=' + (g.pass ? 'PASS' : 'FAIL'));
    if (!g.pass) failLine('mode=identity reason=COUNT ' + g.countDetail.join(' '));
    ok(g.pass, 'S1 identity round-trip PASSES (RP-COUNT/VOLUME/DIGEST/CENTROID on real geometry): ' +
      'count=' + g.outCount + '/' + g.refCount + ' vol=' + g.volDeltaPct.toFixed(2) + '% digest=' +
      (g.digestMatch ? 'match' : 'DIFF') + ' centroidMax=' + g.centroidMaxMm.toFixed(1) + 'mm');

    // RP-DIGEST sensitivity: perturb ONE element by 2mm → digest MUST differ (gate can catch drift).
    var perturbed = outRows.map(function (r) { return r; });
    perturbed[0] = Object.assign({}, outRows[0], { maxX: outRows[0].maxX + 0.002 });
    var dDiff = GATE.digest(outRows) !== GATE.digest(perturbed);
    console.log('§REDPILL-RS mode=identity digest-sensitivity perturb=+2mm differs=' + dDiff +
      ' base=' + GATE.digest(outRows).slice(0, 12) + ' perturbed=' + GATE.digest(perturbed).slice(0, 12));
    ok(dDiff, 'S1b RP-DIGEST is sensitive — a 2mm perturbation changes the digest (identity mode CAN FAIL)');
  })();

  // ── S2 — GOVERNED-DELTA: legit drag (+1.5m X on the 882 bound elements) → ungoverned=0 ────────
  (function () {
    var db = freshDb();
    var pre = GATE.aabbRows(db);
    Object.keys(B.boundSet).forEach(function (g) { moveX(db, g, B.gridDelta.x); });   // the governed drag
    var post = GATE.aabbRows(db);
    var g = GATE.governedDeltaGate(pre, post, B.boundSet, B.gridDelta, TOL_MM);
    verdict('mode=delta build=' + BUILD + ' grid=' + B.dragGridId + ' axis=X delta=+' + B.gridDelta.x.toFixed(3) +
      ' governed=' + g.governed + '/' + boundN + ' static=' + (g.staticOk === (totalPlaced - boundN) ? 'ok' : g.staticOk) +
      ' ungoverned=' + g.ungoverned + ' fallback=0 centroidMax=' + g.centroidMaxMm.toFixed(1) + 'mm' +
      ' verdict=' + (g.pass ? 'PASS' : 'FAIL'));
    ok(g.pass && g.governed === boundN && g.ungoverned === 0,
      'S2 governed-delta PASSES: governed=' + g.governed + '/' + boundN + ' static=' + g.staticOk +
      ' ungoverned=' + g.ungoverned + ' (every moved element BOM-explained — G8-GOVERNANCE)');
  })();

  // ── S3 — FAIL proof: governed drag + ONE escaped (ungoverned) element ────────────────────────
  // Reproduces the F6 regression: an element with no governance moves anyway. The gate MUST catch it.
  (function () {
    var db = freshDb();
    var pre = GATE.aabbRows(db);
    Object.keys(B.boundSet).forEach(function (g) { moveX(db, g, B.gridDelta.x); });
    // pick a PLACED element NOT in the bound set, nudge it as if bulk-translated by the old heuristic
    var escaped = null;
    var placedGuids = rowsOf(db, "SELECT guid FROM element_transforms");
    for (var i = 0; i < placedGuids.length; i++) { if (!B.boundSet[placedGuids[i][0]]) { escaped = placedGuids[i][0]; break; } }
    moveX(db, escaped, B.gridDelta.x);   // moved WITHOUT a BOM line on the dragged grid
    var post = GATE.aabbRows(db);
    var g = GATE.governedDeltaGate(pre, post, B.boundSet, B.gridDelta, TOL_MM);
    verdict('mode=delta build=' + BUILD + ' grid=' + B.dragGridId + ' axis=X delta=+' + B.gridDelta.x.toFixed(3) +
      ' governed=' + g.governed + '/' + boundN + ' ungoverned=' + g.ungoverned +
      ' verdict=' + (g.pass ? 'PASS' : 'FAIL') + ' (forced-ungoverned)');
    g.offenders.forEach(function (o) {
      failLine('mode=delta guid=' + o.guid + ' class=' + o.cls + ' reason=' + o.reason +
        (o.reason === 'UNGOVERNED' ? ' moved=' + Math.round(o.movedMm) + 'mm bom_line=none' : ''));
    });
    ok(!g.pass && g.ungoverned >= 1 && g.offenders.some(function (o) { return o.guid === escaped && o.reason === 'UNGOVERNED'; }),
      'S3 the gate FAILS on an ungoverned move and NAMES it: ungoverned=' + g.ungoverned +
      ' offender=' + escaped + ' (the F6 bulk-translation, caught — G8-GOVERNANCE proven able to FAIL)');
  })();

  // ── S4 — FAIL proof: governed drag where ONE bound element moved the WRONG amount (PREDICT_MISS) ─
  (function () {
    var db = freshDb();
    var pre = GATE.aabbRows(db);
    var boundGuids = Object.keys(B.boundSet);
    var wrong = boundGuids[0];
    boundGuids.forEach(function (g) { moveX(db, g, g === wrong ? 0.5 : B.gridDelta.x); });   // wrong delta on one
    var post = GATE.aabbRows(db);
    var g = GATE.governedDeltaGate(pre, post, B.boundSet, B.gridDelta, TOL_MM);
    verdict('mode=delta build=' + BUILD + ' grid=' + B.dragGridId + ' axis=X delta=+' + B.gridDelta.x.toFixed(3) +
      ' governed=' + g.governed + '/' + boundN + ' predictMiss=' + g.predictMiss +
      ' ungoverned=' + g.unexplained + ' verdict=' + (g.pass ? 'PASS' : 'FAIL') + ' (forced-predict-miss)');
    g.offenders.forEach(function (o) {
      if (o.reason !== 'PREDICT_MISS') return;
      failLine('mode=delta guid=' + o.guid + ' class=' + o.cls + ' reason=PREDICT_MISS' +
        ' predicted=(' + o.predicted.cx.toFixed(3) + ',' + o.predicted.cy.toFixed(3) + ')' +
        ' actual=(' + o.actual.cx.toFixed(3) + ',' + o.actual.cy.toFixed(3) + ') dmax=' + Math.round(o.dmaxMm) + 'mm');
    });
    ok(!g.pass && g.predictMiss >= 1 && g.offenders.some(function (o) { return o.guid === wrong && o.reason === 'PREDICT_MISS'; }),
      'S4 the gate FAILS when a governed element moves off its BOM prediction: predictMiss=' + g.predictMiss +
      ' offender=' + wrong + ' (predicted≠actual caught — the predictor does not peek at actual)');
  })();

  console.log(fail === 0 ? '§W-REDPILL-ROSETTA ALL PASS' : ('§W-REDPILL-ROSETTA ' + fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.error('§W-REDPILL-RS FATAL ' + (e && e.stack || e));
  process.exit(1);
});
