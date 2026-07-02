#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRID-NUMERIC: §P10 (prompts/RESUME_MODELLER_POLISH_BATCH.md). Read the log after every run.
 *
 * Issue under test: tests/specs/30-grid-alignment / 31-cut-grid-snap are entirely `src.toContain(...)` string-
 * presence checks — they prove the alignment CODE exists, never that a detected grid line actually lands on a
 * real structural centerline of a real building. The accuracy claim was UNVERIFIED (a credibility gap, not a
 * UX gap). This witness runs the REAL window.GridDims.detectGrids over REAL extracted buildings and asserts
 * the numbers.
 *
 * Checks, per building (Duplex, SampleHouse, SampleCastle — wall-bearing ×2 + column-framed):
 *   Q1 detected   — detectGrids finds ≥2 lines on ≥1 axis (zero lines = the gap itself, FAIL loud)
 *   Q2 aligned    — EVERY grid line sits within the module's own snap tolerance (grid_rules
 *                   face_cluster_tol_m) of a REAL wall/column centerline read independently from
 *                   elements_meta⋈element_transforms; max |Δ| reported per axis
 * Ground truth mirrors the voter's orientation rule but is computed IN THIS FILE from the raw rows (columns/
 * near-square/ambiguous → both axes; Y-running walls → X only; X-running walls → Y only) — extract, not echo.
 */
'use strict';
var fs = require('fs'), path = require('path');

global.window = global.window || {};
var ROOT = path.join(__dirname, '..');
require(path.join(ROOT, '..', 'viewer', 'grid_dims.js'));      // → window.GridDims (REAL viewer module)
var GridDims = window.GridDims;
var rules = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'viewer', 'grid_rules.json'), 'utf8'));
var gd = rules.grid_detection || {};
var TOL = gd.face_cluster_tol_m || 0.3;                        // the module's OWN claimed snap radius
var MINSPAN = gd.min_structural_span_m || 1.80;
var STRUCT = gd.structural_classes || ['IfcWall', 'IfcWallStandardCase', 'IfcColumn', 'IfcBeam', 'IfcMember'];

var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));

var BUILDINGS = ['Duplex_extracted.db', 'SampleHouse_extracted.db', 'SampleCastle_extracted.db'];

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}

// independent ground truth: structural centerlines per axis, straight from the raw rows
function centerlines(db) {
  var sql = "SELECT m.ifc_class, t.center_x, t.center_y, t.bbox_x, t.bbox_y FROM elements_meta m " +
    "JOIN element_transforms t ON m.guid = t.guid WHERE m.ifc_class IN ('" + STRUCT.join("','") + "') " +
    "AND t.bbox_z >= " + MINSPAN;
  var r = db.exec(sql), x = [], y = [];
  if (r.length) r[0].values.forEach(function (v) {
    var cls = v[0], cx = +v[1], cy = +v[2], bx = +v[3], by = +v[4];
    if (cls === 'IfcColumn' || (bx > 0 && Math.abs(bx - by) / Math.max(bx, by) < 0.5)) { x.push(cx); y.push(cy); }
    else if (by > bx * 1.5) x.push(cx);          // runs in Y → a vertical (X-position) centerline
    else if (bx > by * 1.5) y.push(cy);          // runs in X → a horizontal (Y-position) centerline
    else { x.push(cx); y.push(cy); }
  });
  return { x: x, y: y };
}
function maxDev(lines, cands) {
  var worst = 0;
  lines.forEach(function (L) {
    var p = L.rawPosition != null ? L.rawPosition : L.position;
    var best = Infinity;
    cands.forEach(function (c) { var d = Math.abs(c - p); if (d < best) best = d; });
    if (best > worst) worst = best;
  });
  return worst;
}

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  console.log('═══ W-GRID-NUMERIC — §P10 grid lines land on REAL structural centerlines (tol=' + TOL + 'm) ═══');
  BUILDINGS.forEach(function (name) {
    var db = new SQL.Database(fs.readFileSync(path.join(ROOT, name)));
    var g = GridDims.detectGrids(db, null, rules);
    var truth = centerlines(db);
    var nx = g.xLines.length, ny = g.yLines.length;
    chk('Q1 ' + name + ' detected ≥2 lines on ≥1 axis', nx >= 2 || ny >= 2,
      'x=' + nx + ' y=' + ny + ' (truth centerlines x=' + truth.x.length + ' y=' + truth.y.length + ')');
    var dx = nx ? maxDev(g.xLines, truth.x) : 0;
    var dy = ny ? maxDev(g.yLines, truth.y) : 0;
    console.log('  §GRID-NUMERIC ' + name + ' xLines=' + nx + ' maxΔx=' + (dx * 1000).toFixed(1) + 'mm  yLines=' + ny + ' maxΔy=' + (dy * 1000).toFixed(1) + 'mm');
    chk('Q2 ' + name + ' EVERY line within ' + TOL + 'm of a real centerline', dx <= TOL && dy <= TOL,
      'maxΔ=' + (Math.max(dx, dy) * 1000).toFixed(1) + 'mm');
    db.close();
  });
  console.log('W-GRID-NUMERIC ' + (fail ? 'FAIL' : 'PASS') + '  pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('FATAL', e); process.exit(1); });
