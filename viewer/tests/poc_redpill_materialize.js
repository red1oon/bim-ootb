// ⚠ DO NOT REMOVE — Witness: W-REDPILL-MATERIALIZE (RED_PILL.md §11.5 P5 / §9 MATERIALIZE;
//   NEW_FROM_REFERENCE.md §8.3 / §12 Phase 5; CLOSES RedPillRosetta.md F9 + identity mode 1(b)).
//
// Scope: prove P5 — an EDITED Red Pill session materializes into a REAL NewIFC.db file that the
//   G8-GOVERNANCE RosettaStone gate verifies. poc_redpill_rosetta.js ran the identity gate on the
//   IN-SESSION state (1a) because "P5's NewIFC.db materializer" did not exist (its own line 110).
//   This witness runs the SAME gate on the materialized FILE (1b) — what F9 was blocking.
//
//   NON-INVENT: materialization = Materialize.toBuffer(db) = db.export() of the edited in-memory db.
//   No geometry computed; gate maths reused verbatim from redpill_gate.js (== Java SpatialDigest/G1/G2).
//
// Five issues, each named (a test that can't reveal pass/fail is not a test — CLAUDE.md):
//   M1 — IDENTITY round-trip on the FILE (1b): no edits → reopen NewIFC.db → identityGate PASS
//        (RP-COUNT/VOLUME/DIGEST/CENTROID). Proves the forward path is LOSSLESS into a real file.
//   M2 — SCHEMA round-trips: NewIFC.db has the same tables + elements_meta count → viewer-loadable.
//   M3 — EDITED session → the FILE carries the governed edits (read-the-tip on NewIFC.db = new
//        center, ≤1mm) AND stays governed (governedDeltaGate ungoverned=0). The edit survives export.
//   M4 — REFERENCE untouched (§16.7): a fresh read of the fixture from DISK digests identical to the
//        pre-materialize reference → materialize never wrote back to the reference.
//   M5 — DETERMINISM (§8.3/§14 "same log → same NewIFC.db"): materialize the same state twice →
//        identical geometry digest.
//
// Run:  node viewer/tests/poc_redpill_materialize.js 2>&1 | tee viewer/tests/poc_redpill_materialize.log
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var DBPATH = path.join(__dirname, 'fixtures', 'SampleCastle_extracted.db');
var TOL_MM = 1.0;   // Q2 — SPATIAL_EXACT_MM (EyesConstants.java:39)
var BUILD = 'SampleCastle';

var GATE = require(path.join(__dirname, 'redpill_gate.js'));
var MAT = require(path.join(ROOT, 'viewer', 'materialize.js'));
var BomNode = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_node.js'));
var BomTree = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_tree.js'));
var BomGrid = require(path.join(ROOT, 'viewer', 'bom_engine', 'bom_grid.js'));
var initSqlJs = require(path.join(ROOT, 'viewer', 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'viewer', 'lib', 'sql-wasm.wasm'));

var fail = 0;
function ok(c, m) { console.log((c ? '§W-REDPILL-MAT PASS ' : '§W-REDPILL-MAT FAIL ') + m); if (!c) fail++; }
function rowsOf(db, sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }
function esc(s) { return String(s).replace(/'/g, "''"); }
function verdict(line) { console.log('§REDPILL-RS ' + line); }

// ── Same BOM-governed bound set as poc_redpill_rosetta.js (proximity NEVER enters) ──────────────
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
  var placed = {}; rowsOf(db, "SELECT guid FROM element_transforms").forEach(function (r) { placed[r[0]] = true; });
  var dragGridId = null, bestN = 0;
  for (var gk in bomAttach.map) { if (bomAttach.map[gk].length > bestN) { bestN = bomAttach.map[gk].length; dragGridId = gk; } }
  var boundSet = {};
  (bomAttach.map[dragGridId] || []).forEach(function (e) { if (placed[e.guid]) boundSet[e.guid] = true; });
  return { boundSet: boundSet, dragGridId: dragGridId, gridDelta: { x: 1.5, y: 0, z: 0 } };
}

function moveX(db, guid, dx) {
  var pr = rowsOf(db, "SELECT center_x FROM element_transforms WHERE guid='" + esc(guid) + "'");
  if (!pr.length) return;
  db.run("UPDATE element_transforms SET center_x = ? WHERE guid = ?", [pr[0][0] + dx, guid]);
}
function tableNames(db) {
  return rowsOf(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(function (r) { return r[0]; });
}

var SQL;
initSqlJs({ wasmBinary: wasmBinary }).then(function (sql) {
  SQL = sql;
  function freshDb() { return new SQL.Database(fs.readFileSync(DBPATH)); }

  var ref0 = freshDb();
  var totalPlaced = rowsOf(ref0, "SELECT count(*) FROM element_transforms")[0][0];
  var totalMeta = rowsOf(ref0, "SELECT count(*) FROM elements_meta")[0][0];
  var metaOnly = totalMeta - totalPlaced;
  var refRows = GATE.aabbRows(ref0);
  var refDigest = GATE.digest(refRows);
  var refTables = tableNames(ref0);
  console.log('§REDPILL-DATA build=' + BUILD + ' placed=' + totalPlaced + ' meta=' + totalMeta +
    ' meta-only(excluded)=' + metaOnly + ' tables=' + refTables.length + ' refDigest=' + refDigest.slice(0, 12));

  // ── M1 — IDENTITY round-trip on the REAL exported FILE (1b) — the F9 closer ───────────────────
  (function () {
    var db = freshDb();                          // grammar → grid → full cascade, ZERO edits
    var buf = MAT.toBuffer(db);                  // P5 materialize → NewIFC.db bytes
    var newifc = new SQL.Database(buf);          // reopen the FILE — this is 1(b), not in-session 1(a)
    var outRows = GATE.aabbRows(newifc);
    var g = GATE.identityGate(refRows, outRows, { excludedMeta: metaOnly });
    verdict('mode=identity target=NewIFC.db build=' + BUILD +
      ' count=' + (g.countOk ? 'ok' : 'MISMATCH') + '(' + g.outCount + '/' + g.refCount + ')' +
      ' vol=' + (g.volDeltaPct >= 0 ? '+' : '') + g.volDeltaPct.toFixed(2) + '%' +
      ' digest=' + (g.digestMatch ? 'match' : 'DIFF') +
      ' centroidMax=' + g.centroidMaxMm.toFixed(1) + 'mm verdict=' + (g.pass ? 'PASS' : 'FAIL'));
    ok(g.pass && g.digestMatch,
      'M1 identity round-trip on the EXPORTED FILE (1b) PASSES — forward path is lossless into NewIFC.db: ' +
      'count=' + g.outCount + '/' + g.refCount + ' vol=' + g.volDeltaPct.toFixed(2) + '% digest=' +
      (g.digestMatch ? 'match' : 'DIFF') + ' centroidMax=' + g.centroidMaxMm.toFixed(1) + 'mm (F9 CLOSED)');
    newifc.close();
  })();

  // ── M2 — SCHEMA round-trips: the file is a valid extracted-DB the viewer can load unmodified ──
  (function () {
    var db = freshDb();
    var newifc = new SQL.Database(MAT.toBuffer(db));
    var outTables = tableNames(newifc);
    var sameTables = JSON.stringify(outTables) === JSON.stringify(refTables);
    var metaCount = rowsOf(newifc, "SELECT count(*) FROM elements_meta")[0][0];
    var placedCount = rowsOf(newifc, "SELECT count(*) FROM element_transforms")[0][0];
    console.log('§MAT-SCHEMA tables=' + outTables.length + ' sameAsRef=' + sameTables +
      ' elements_meta=' + metaCount + ' element_transforms=' + placedCount);
    ok(sameTables && metaCount === totalMeta && placedCount === totalPlaced,
      'M2 NewIFC.db schema round-trips — same ' + refTables.length + ' tables, meta=' + metaCount +
      '/' + totalMeta + ', transforms=' + placedCount + '/' + totalPlaced + ' (viewer/clash/ERP load it unmodified)');
    newifc.close();
  })();

  // ── M3 — EDITED session → the FILE carries the governed edits AND stays governed ─────────────
  (function () {
    var db = freshDb();
    var pre = GATE.aabbRows(db);
    var B = buildBoundSet(db);
    var boundGuids = Object.keys(B.boundSet);
    boundGuids.forEach(function (g) { moveX(db, g, B.gridDelta.x); });   // the governed drag (B1 persists to element_transforms)

    var newifc = new SQL.Database(MAT.toBuffer(db));                     // materialize the EDITED session
    var post = GATE.aabbRows(newifc);                                    // read-the-tip ON THE FILE

    // (a) the edit physically survived export: each moved element sits at its new center IN the file
    var fileByGuid = {}; post.forEach(function (r) { fileByGuid[r.guid] = r; });
    var preByGuid = {}; pre.forEach(function (r) { preByGuid[r.guid] = r; });
    var carried = 0, miss = 0;
    boundGuids.forEach(function (g) {
      var want = preByGuid[g].cx + B.gridDelta.x, got = fileByGuid[g] ? fileByGuid[g].cx : null;
      if (got !== null && Math.abs(got - want) * 1000 <= TOL_MM) carried++; else miss++;
    });
    console.log('§MAT-EDIT bound=' + boundGuids.length + ' carriedIntoFile=' + carried + ' miss=' + miss + ' delta=+' + B.gridDelta.x);
    ok(carried === boundGuids.length && miss === 0,
      'M3a edited session persists INTO NewIFC.db — ' + carried + '/' + boundGuids.length +
      ' governed moves at new center in the FILE (read-the-tip ≤1mm)');

    // (b) re-running the G8 governed-delta gate on the FILE: every move still BOM-explained
    var g = GATE.governedDeltaGate(pre, post, B.boundSet, B.gridDelta, TOL_MM);
    verdict('mode=delta target=NewIFC.db build=' + BUILD + ' grid=' + B.dragGridId + ' axis=X delta=+' +
      B.gridDelta.x.toFixed(3) + ' governed=' + g.governed + '/' + boundGuids.length +
      ' ungoverned=' + g.ungoverned + ' verdict=' + (g.pass ? 'PASS' : 'FAIL'));
    ok(g.pass && g.governed === boundGuids.length && g.ungoverned === 0,
      'M3b the materialized file STILL passes G8-GOVERNANCE: governed=' + g.governed + '/' + boundGuids.length +
      ' ungoverned=' + g.ungoverned + ' (the edit is governed end-to-end, file included)');
    newifc.close();
  })();

  // ── M4 — REFERENCE untouched (§16.7 byte-identity precondition) ──────────────────────────────
  (function () {
    // materialize edited an in-memory copy; the fixture on disk must be byte/geometry identical.
    var diskAgain = freshDb();
    var diskDigest = GATE.digest(GATE.aabbRows(diskAgain));
    console.log('§MAT-REF refDigest=' + refDigest.slice(0, 12) + ' diskAfter=' + diskDigest.slice(0, 12) +
      ' identical=' + (diskDigest === refDigest));
    ok(diskDigest === refDigest,
      'M4 reference is untouched after materialize+edit — fresh disk read digests identical (§16.7 holds)');
    diskAgain.close();
  })();

  // ── M5 — DETERMINISM: same edited state materialized twice → identical geometry digest ────────
  (function () {
    function buildEdited() {
      var db = freshDb();
      var B = buildBoundSet(db);
      Object.keys(B.boundSet).forEach(function (g) { moveX(db, g, B.gridDelta.x); });
      return db;
    }
    var d1 = new SQL.Database(MAT.toBuffer(buildEdited()));
    var d2 = new SQL.Database(MAT.toBuffer(buildEdited()));
    var dig1 = GATE.digest(GATE.aabbRows(d1)), dig2 = GATE.digest(GATE.aabbRows(d2));
    console.log('§MAT-DETERM run1=' + dig1.slice(0, 12) + ' run2=' + dig2.slice(0, 12) + ' equal=' + (dig1 === dig2));
    ok(dig1 === dig2,
      'M5 materialization is deterministic — same event log → same NewIFC.db geometry digest (§8.3/§14)');
    d1.close(); d2.close();
  })();

  console.log(fail === 0 ? '§W-REDPILL-MATERIALIZE ALL PASS' : ('§W-REDPILL-MATERIALIZE ' + fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.error('§W-REDPILL-MAT FATAL ' + (e && e.stack || e));
  process.exit(1);
});
