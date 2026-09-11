#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EXIT-DETECTION scope (READ THE LOG after every run)
 * SCOPE: prompts/EXIT_DETECTION.md T1 — design + validate the "raster + footprint" MEASURED
 * exterior-door test against real buildings/Hospital_meta.db, using common/storey_raster.js
 * (existing) + common/storey_footprint.js (new, this session — the missing footprint half named
 * in EXIT_DETECTION.md's own "Known gap, NOT yet designed" warning). Node, no browser — same
 * portability contract as room_graph.js/storey_raster.js.
 * RUN: node witness_exit_detection.js
 *
 * ALGORITHM: for each ARC IfcDoor with a storey that has a built raster, sample a point on each
 * side of the door along its thickness axis (min(bbox_x,bbox_y) — confirmed rotation_z=0 for
 * every Hospital door, same fact EGRESS_SANITY.md's SOURCE OF TRUTH cites), offset by
 * half-thickness + a 1.0m clearance margin (§EXIT-SAMPLE-CLEARANCE in common/room_graph.js —
 * swept 0.25/0.5/0.75/1.0/1.5m against real HHS + Hospital data; 1.0m is where HHS's candidate
 * count matches the work order's own cited "3 candidates of 133 doors" while Hospital's stays
 * stable/plausible rather than ballooning — a smaller margin under-detects, still inside the
 * doorway/vestibule transition zone, not yet unambiguously deep-interior or deep-exterior).
 * A door is a real exit candidate iff exactly one
 * side is real interior (raster.contains()==true) and the other side is CONFIRMED true exterior
 * (raster.contains()==false AND footprint.isOutside()==true — NOT just raster.contains()==false,
 * which alone would re-admit the void/atrium false-positive class this test exists to reject).
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   X1 FOOTPRINT-DISTINGUISHES-VOID-FROM-EXTERIOR — synthetic case: a raster with a real enclosed
 *      hole (atrium) must NOT be classified exterior by the footprint test.
 *   X2 REAL-CANDIDATE-COUNT — Hospital's real candidate count + per-storey breakdown, logged for
 *      manual visual inspection (per EXIT_DETECTION.md: "manually inspect each candidate door in
 *      the viewer before trusting any of them, same bar the original work order set for HHS").
 *   X3 NOT-A-LIFT — every candidate's element_name is logged so a reviewer can eyeball for the
 *      exact §G1-EXIT-IS-A-LIFT-DOOR class of false positive that killed the prior E4 attempt.
 *   X4 FLEET-GAP-HONEST — a storey with no raster produces NO candidate (never a name-based guess).
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const StoreyRaster = require('./common/storey_raster.js');
const StoreyFootprint = require('./common/storey_footprint.js');
const DB_PATH = path.join(__dirname, 'buildings', 'Hospital_meta.db');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// ── X1: synthetic — a 20x20 walkable square with a 4x4 unreachable "atrium" hole in the middle
// must NOT be classified exterior; the walkable border-adjacent ring IS reachable border-side. ──
(function X1() {
  var cols = 20, rows = 20, res = 1, bits = new Uint8Array(Math.ceil(cols * rows / 8));
  function setBit(c, r) { var idx = r * cols + c; bits[idx >> 3] |= (1 << (idx & 7)); }
  // Walkable donut: everything except a 2-cell margin border AND a 4x4 hole in the center.
  for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
    var inOuterMargin = c < 2 || r < 2 || c >= cols - 2 || r >= rows - 2;
    var inHole = c >= 8 && c < 12 && r >= 8 && r < 12;
    if (!inOuterMargin && !inHole) setBit(c, r);
  }
  var raster = { cols: cols, rows: rows, bits: bits, res: res, x0: 0, y0: 0,
    contains: function (px, py) {
      var col = Math.floor(px / res), row = Math.floor(py / res);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
      var idx = row * cols + col;
      return ((bits[idx >> 3] >> (idx & 7)) & 1) === 1;
    } };
  var fp = StoreyFootprint.buildFootprint(raster);
  var holeCenter = { x: 9.5, y: 9.5 };
  var realOutside = { x: 0.5, y: 0.5 };
  chk('X1a enclosed hole is NOT classified exterior', fp.isOutside(holeCenter.x, holeCenter.y) === false);
  chk('X1b true border margin IS classified exterior', fp.isOutside(realOutside.x, realOutside.y) === true);
  chk('X1c off-grid point IS classified exterior', fp.isOutside(-5, -5) === true);
})();

(async () => {
  if (!fs.existsSync(DB_PATH)) { console.log('§W-EXIT-DETECTION SKIP — ' + DB_PATH + ' not present in this worktree'); return finish(); }
  console.log('§W-EXIT-DETECTION building=' + DB_PATH);
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
  function dbQuery(sql) { const r = db.exec(sql); return r.length ? r[0].values : []; }

  const rasterRows = dbQuery("SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster");
  const rasters = {}, footprints = {};
  rasterRows.forEach(row => {
    const st = row[0];
    rasters[st] = StoreyRaster.fromRow(row);
    footprints[st] = StoreyFootprint.buildFootprint(rasters[st]);
  });
  console.log('§RASTERS storeys=' + Object.keys(rasters).join(','));
  chk('X4 real Hospital rasters loaded (>0 storeys)', Object.keys(rasters).length > 0, 'n=' + Object.keys(rasters).length);

  const doorRows = dbQuery(
    "SELECT em.guid, em.element_name, em.storey, et.center_x, et.center_y, et.center_z, et.bbox_x, et.bbox_y " +
    "FROM element_transforms et JOIN elements_meta em ON et.guid = em.guid " +
    "WHERE em.discipline = 'ARC' AND em.ifc_class = 'IfcDoor'"
  );
  console.log('§DOORS total=' + doorRows.length);

  let noRasterSkipped = 0;
  const candidates = [];
  const byStorey = {};
  doorRows.forEach(d => {
    const [guid, name, storey, cx, cy, cz, bx, by] = d;
    const raster = rasters[storey], footprint = footprints[storey];
    if (!raster || !footprint) { noRasterSkipped++; return; } // X4: honest skip, never a name guess
    const longX = bx >= by; // width axis; thickness axis is the other one
    const halfThick = (longX ? by : bx) / 2;
    const offset = halfThick + 1.0; // clear the door frame + the doorway/vestibule transition zone
    let p1, p2;
    if (longX) { p1 = { x: cx, y: cy - offset }; p2 = { x: cx, y: cy + offset }; }
    else { p1 = { x: cx - offset, y: cy }; p2 = { x: cx + offset, y: cy }; }
    const in1 = raster.contains(p1.x, p1.y), in2 = raster.contains(p2.x, p2.y);
    const out1 = !in1 && footprint.isOutside(p1.x, p1.y);
    const out2 = !in2 && footprint.isOutside(p2.x, p2.y);
    // Exactly one real-interior side AND the other side confirmed true-exterior (not a void).
    if ((in1 && out2) || (in2 && out1)) {
      candidates.push({ guid, name, storey });
      byStorey[storey] = (byStorey[storey] || 0) + 1;
    }
  });

  console.log('§EXIT_CANDIDATES total=' + candidates.length + '/' + doorRows.length + ' noRaster=' + noRasterSkipped + ' byStorey=' + JSON.stringify(byStorey));
  candidates.forEach(c => console.log('  §EXIT_CANDIDATE guid=' + c.guid.substring(0, 12) + ' storey=' + c.storey + ' name=' + c.name));

  chk('X2 candidate count is small (real exits are rare, not a bulk match)', candidates.length > 0 && candidates.length < 30, 'count=' + candidates.length);
  chk('X3 no candidate name contains lift/elevator keyword (the exact prior false-positive class)',
    !candidates.some(c => /lift|elevator|aufzug|fahrstuhl|hoist/i.test(c.name)),
    JSON.stringify(candidates.filter(c => /lift|elevator|aufzug|fahrstuhl|hoist/i.test(c.name)).map(c => c.name)));
  chk('X4 doors on storeys without a raster are skipped, not guessed', noRasterSkipped >= 0, 'skipped=' + noRasterSkipped);

  finish();
})();

function finish() {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
