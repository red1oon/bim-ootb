#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRIDKINEMATICS-REAL-DUPLEX: Tier 3 of prompts/GRID_KINEMATICS_SANDBOX_PROOF.md's
 * sandbox (§2 Tier 3 — "real building data, Tier 1's engine, still zero browser"). Loads Duplex_extracted.db's
 * REAL element_transforms/elements_meta via sql.js and feeds the REAL positions DIRECTLY into Tier 1's pure
 * grid_kinematics.js engine — bypassing bonsai_gridmove.js, THREE, and the browser entirely.
 *
 * ⚠ AXIS MAPPING (verified from the real code, not assumed — read this before touching the SELECT below):
 * bonsai_grid.js's render() draws X-gridlines as Vector3(x,y0,0)->(x,y1,0) (fixed x, Y sweeps full range) and
 * Y-gridlines as Vector3(x0,y,0)->(x1,y,0) (fixed y=storey height, X sweeps the building) — i.e. this is an
 * ELEVATION-view grid (xs=column positions, ys=STOREY HEIGHTS), matching grid_kinematics.js's own "Y=height
 * in Three.js" convention (its roof/ROOF_LIFT logic only makes sense with Y=height). The extracted DB stores
 * IFC-native columns (center_z = height, center_y = plan depth) — the engine's elem.y must read the DB's
 * center_z, and elem.z must read the DB's center_y. Confirmed empirically: DB center_z values cluster at
 * 0 / 3.1 / 6 (real storey levels), matching bonsai_grid.js's own default ys=[0,3,6].
 *
 * PART A — 5 REAL elements near a real gridline (x=4, one of the product's own default xs), hand-verified
 * against the engine's own _findBestGrid rules (ATTACH_TOL=0.5, EDGE_TOL=0.1) computed by hand from each
 * element's REAL center_x/bbox_x below (found via a fresh query, guids hand-picked for a clean, unambiguous
 * per-element classification):
 *   T1/T2 ATTACH — centerline within 0.5m of x=4
 *   T3/T4 EDGE_LEFT — left edge within 0.1m of x=4 (overrides the ATTACH also in range, per the engine's own
 *                     documented priority: EDGE beats ATTACH)
 *   T5    SPAN — a wide slab whose CENTER is far from x=4 (>0.5m) but whose body strictly straddles x=4
 *
 * PART B — independently RE-DERIVE the mass-sweep number prompts/GRID_SMART_ELEMENT_SCOPE.md's real-browser
 * repro found (~50-100 real elements swept by ONE gridline drag on an unfiltered elementData()) from a FRESH
 * query + the pure engine directly — not re-citing the earlier browser finding. Reproduces the EXACT grid
 * (xs=[0,4,8], ys=[0,3]) and EXACT dragged line (gx1, x=4) from repro_gridmove_duplex_open.js /
 * witness_gridmove_smart_scope.js, feeding ALL 253 real elements (any class, tagged 'IfcWall' — mirrors the
 * UNFIXED bonsai_gridmove.js's own behavior before the class/locality narrowing).
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var GK = require(path.join(ROOT, 'grid_kinematics.js'));

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}

var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'Duplex_extracted.db')));
  console.log('═══ W-GRIDKINEMATICS-REAL-DUPLEX — Tier 3: real Duplex data through the pure engine directly ═══');

  // ── PART A: 5 real elements, hand-verified classification against gridline x=4 ──────────────────────
  var GUIDS_A = [
    '1aj$VJZFn2TxepZUBcKpvt', // ATTACH: cx≈4.030, |4.030-4|=0.030 < ATTACH_TOL(0.5)
    '0iEHWY1$XA8eQeeULq4jpl', // ATTACH: cx≈4.030, |4.030-4|=0.030 < 0.5
    '0dxE1Sy6nDqfpDb5vIMN_Z', // EDGE_LEFT: cx≈4.106 bboxX≈0.152 → lo=cx-half≈4.030, |4.030-4|=0.030 < EDGE_TOL(0.1)
    '0iEHWY1$XA8eQeeULq4j_U', // EDGE_LEFT: same shape, cx≈4.106 bboxX≈0.152 → lo≈4.030
    '2O2Fr$t4X7Zf8NOew3FK4F'  // SPAN: cx≈0.417 bboxX≈7.966 → lo≈-3.566 hi≈4.400; |cx-4|=3.583 (no ATTACH/EDGE),
                              // but 4 strictly inside (lo+0.01, hi-0.01) → SPAN
  ];
  var rowsA = db.exec("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms " +
    "WHERE guid IN ('" + GUIDS_A.join("','") + "')")[0].values;
  var byGuid = {}; rowsA.forEach(function (v) { byGuid[v[0]] = v; });

  chk('PART A: all 5 hand-picked guids found in the real DB', rowsA.length === 5, 'found=' + rowsA.length);

  var elemsA = GUIDS_A.map(function (g) {
    var v = byGuid[g];
    return { guid: g, x: v[1], y: v[3], z: v[2], bboxX: v[4], bboxY: v[6], bboxZ: v[5], ifcClass: 'IfcWall' };
  });
  var engineA = new GK.GridKinematicEngine(elemsA, [{ id: 'gx1', axis: 'x', pos: 4 }]);
  engineA.attachGridToElements();
  var mapA = engineA.getAttachMap()['gx1'] || [];
  var relByGuid = {}; mapA.forEach(function (it) { relByGuid[it.guid] = it.relation; });

  chk('T1 real ATTACH #1 (' + GUIDS_A[0].slice(0, 8) + '…, cx=' + byGuid[GUIDS_A[0]][1].toFixed(3) + ')',
    relByGuid[GUIDS_A[0]] === 'ATTACH', 'got=' + relByGuid[GUIDS_A[0]]);
  chk('T2 real ATTACH #2 (' + GUIDS_A[1].slice(0, 8) + '…, cx=' + byGuid[GUIDS_A[1]][1].toFixed(3) + ')',
    relByGuid[GUIDS_A[1]] === 'ATTACH', 'got=' + relByGuid[GUIDS_A[1]]);
  chk('T3 real EDGE_LEFT #1 (' + GUIDS_A[2].slice(0, 8) + '…, cx=' + byGuid[GUIDS_A[2]][1].toFixed(3) + ' bboxX=' + byGuid[GUIDS_A[2]][4].toFixed(3) + ')',
    relByGuid[GUIDS_A[2]] === 'EDGE_LEFT', 'got=' + relByGuid[GUIDS_A[2]]);
  chk('T4 real EDGE_LEFT #2 (' + GUIDS_A[3].slice(0, 8) + '…, cx=' + byGuid[GUIDS_A[3]][1].toFixed(3) + ' bboxX=' + byGuid[GUIDS_A[3]][4].toFixed(3) + ')',
    relByGuid[GUIDS_A[3]] === 'EDGE_LEFT', 'got=' + relByGuid[GUIDS_A[3]]);
  chk('T5 real SPAN (' + GUIDS_A[4].slice(0, 8) + '…, cx=' + byGuid[GUIDS_A[4]][1].toFixed(3) + ' bboxX=' + byGuid[GUIDS_A[4]][4].toFixed(3) + ', dist=' + Math.abs(byGuid[GUIDS_A[4]][1] - 4).toFixed(3) + ')',
    relByGuid[GUIDS_A[4]] === 'SPAN', 'got=' + relByGuid[GUIDS_A[4]]);

  // ── PART B: independent re-derivation of the mass-sweep count ────────────────────────────────────────
  // EXACT grid + dragged line from repro_gridmove_duplex_open.js / witness_gridmove_smart_scope.js.
  var allRows = db.exec('SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms')[0].values;
  chk('PART B: real Duplex has the expected 253 elements (baseline cited in this spec’s §0)', allRows.length === 253, 'got=' + allRows.length);

  var allElems = allRows.map(function (v) {
    return { guid: v[0], x: v[1], y: v[3], z: v[2], bboxX: v[4], bboxY: v[6], bboxZ: v[5], ifcClass: 'IfcWall' };
  });
  var gridLines = [
    { id: 'gx0', axis: 'x', pos: 0 }, { id: 'gx1', axis: 'x', pos: 4 }, { id: 'gx2', axis: 'x', pos: 8 },
    { id: 'gy0', axis: 'y', pos: 0 }, { id: 'gy1', axis: 'y', pos: 3 }
  ];
  var engineB = new GK.GridKinematicEngine(allElems, gridLines);
  engineB.attachGridToElements();
  var gx1Count = (engineB.getAttachMap()['gx1'] || []).length;

  console.log('  §MASS-SWEEP-REDERIVE gx1(x=4) governed=' + gx1Count + ' of 253 real elements ' +
    '(prompts/GRID_SMART_ELEMENT_SCOPE.md’s own real-browser repro cited ~54; this is an INDEPENDENT ' +
    're-derivation via the pure engine on raw DB rows, not a re-citation — close order-of-magnitude match ' +
    'is the honest cross-check; an exact match is not expected since the real browser path reads live, ' +
    'world-space, post-rotation THREE.js mesh bboxes while this reads raw local DB bbox_x/y/z).');
  chk('PART B: independently re-derived count is the SAME ORDER OF MAGNITUDE as the cited ~54 (dozens, ' +
    'not the ~3-10 the FIXED elementData() narrows to)', gx1Count >= 20 && gx1Count <= 80, 'gx1Count=' + gx1Count);

  console.log('W-GRIDKINEMATICS-REAL-DUPLEX: ' + pass + ' PASS / ' + fail + ' FAIL');
  db.close();
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('FATAL', e); process.exit(1); });
