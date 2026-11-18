#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-JOINTS: the LOD Upgrade pill's "Steel joints" pack (JS) equals the proven Python run. Read the log after every run (§LODUP_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P4 and "P4 SPEC". Oracle (private, read only): the survey of steel beam ends (joint_survey.py) and the fin plate generator v2.1 with the 2026-11-18 centre fix
 * (gen_connections.py), its survey / result JSON and its output DB (150 GEN-CR parts).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the browser result differs from the proven Python result".
 *   PARITY_SURVEY     the 234 beam ends: class, support, clearances, angle, rays per end equal the oracle's (ends matched by their end point; the end LETTER convention is reported).
 *   PARITY_GENERATED  the same 50 joints (same beam / end ids) and the same 150 part ids as the oracle DB.
 *   PARITY_REFUSED    every end in the same category as the oracle (generated, clash, overlap, no room, gap by class, not a rolled I-section = the oracle's "not an I-section in the IFC profiles"); the clash
 *                     neighbours the oracle recorded are among the neighbours the JS found; the counts by reason.
 *   PARITY_CHANGELIST the ADDED rows (guid, class, name) equal the oracle DB's 150 elements; the REFUSED rows are one per refused end (184) with the oracle's reason.
 *   PARITY_VERTICES   every WORLD vertex of every generated part within 0.01 mm of the oracle's, names and classes equal. Joints decided inside the TIE band (plate end exactly half way between two 2 mm samples)
 *                     are counted and listed with their margin; a joint outside 0.01 mm is listed with the margin of its decision, never tuned.
 *   PARITY_VALUES     bolts, plate height, weld leg exact; plate length, web thickness, support wall, the measured clause values within the oracle's own rounding.
 *   CLEAR_POST        the independent re-check on the parts REBUILT FROM THE OP-LOG ROWS (float32 relative vertices + centre, what the Modeller stores): no part surface inside another solid.
 *   BREAK_CHECK       the clash check switched off: the same re-check on the written result must FAIL.
 *   WINDING           (P4 FIX SPEC) every component of every part closed, every directed edge once, signed volume > 0; BREAK_WINDING: the old weld caps must FAIL it. PARITY_VERTICES compares triangles as vertex sets.
 *   CENTRE / DETERMINISM / REGISTRY / RULES / GATE / CHANGELIST_TXT as the P1-P3 witnesses.
 * Inputs by environment only (no project path in the repo): LODUP_SRC_DB (the extracted building DB the survey ran on), LODUP_ORACLE_DB (the oracle's output DB), LODUP_ORACLE_DIR (the folder with
 * joint_survey.json, gen_result.json and log/gen_run1.log); all read only. Any unset -> a SYNTHETIC fixture with hand-derived truth (stated on the first line); parity is then INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
global.window = undefined;   // pure node: the packs must not need a browser
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Pack = require(path.join(ROOT, 'lod/joint_pack.js')), Rebar = require(path.join(ROOT, 'lod/rebar_pack.js')), Weld = require(path.join(ROOT, 'lod/weld_pack.js')),
  Layer = require(path.join(ROOT, 'lod/layer_pack.js')), Ops = require(path.join(ROOT, 'lod/lod_ops.js')), Reader = require(path.join(ROOT, 'lod/lod_reader.js')), Registry = require(path.join(ROOT, 'lod/lod_registry.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var SRC = process.env.LODUP_SRC_DB, ORA = process.env.LODUP_ORACLE_DB, ODIR = process.env.LODUP_ORACLE_DIR, MAIN_BREAK = process.env.LODUP_BREAK === '1';
var P1_LOD_UI_SHA = 'bb35df181b869aa8056b6e78f466880e4debad598ac4c0eda1c69aca439f8fb5';   // lod/lod_ui.js as of P8 (Formats link, Load schedule reads a .dxf; the NAME FIX file was 03791bfb8a26caea); as of the P7 NAME FIX (download names drop the .db; the P7 file was 37e57cb76e4092bf); as of P7 (it gained the Add-on IFC row and the sliced run driver; the P6 file was dfb5d321c6f86f8c); lod/lod_ui.js as of P6 (it gained the declared-input button row and the live-neighbours reader; the P3 file was 703b8250e980def7); lod/lod_ui.js as of the P3 fix; P4 does not edit it
var FAILS = [], INCONC = [], VTOL = 1e-5;   // 0.01 mm
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
function q(db, sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }
function bboxOf(W) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < W.length; i += 3) for (var a = 0; a < 3; a++) { if (W[i + a] < lo[a]) lo[a] = W[i + a]; if (W[i + a] > hi[a]) hi[a] = W[i + a]; } return [lo, hi]; }

// ---- synthetic fixture (used only when the env paths are unset). Metres. Hand-derived truth in SYNTH below.
function boxTris(lo, hi) {
  var c = [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]];
  var F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], out = [];
  F.forEach(function (t) { t.forEach(function (i) { out.push(c[i][0], c[i][1], c[i][2]); }); }); return out;
}
// an I-section beam along x (x0..x1), centred on (y0, z0): half width b, half depth h, flange tf, web tw, root fillet r (0 = welded outline, 12 vertices). Side faces only, normals outward (no end caps).
function iBeam(x0, x1, y0, z0, b, h, tf, tw, r) {
  var P = [], n = 4, arc = function (cy, cz, a0, a1) { for (var k = 0; k <= n; k++) { var a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; P.push([cy + r * Math.cos(a), cz + r * Math.sin(a)]); } }, t2 = tw / 2;
  P.push([b, h], [-b, h], [-b, h - tf]);
  if (r > 0) { P.push([-t2 - r, h - tf]); arc(-t2 - r, h - tf - r, 90, 0); } else P.push([-t2, h - tf]);
  if (r > 0) { arc(-t2 - r, -(h - tf - r), 0, -90); P.push([-b, -(h - tf)]); } else P.push([-t2, -(h - tf)], [-b, -(h - tf)]);
  P.push([-b, -h], [b, -h], [b, -(h - tf)]);
  if (r > 0) { P.push([t2 + r, -(h - tf)]); arc(t2 + r, -(h - tf - r), 270, 180); arc(t2 + r, h - tf - r, 180, 90); } else P.push([t2, -(h - tf)], [t2, h - tf]);
  P.push([b, h - tf]);
  // the arc runs above join the web faces; polygon is closed back to the first point
  var out = [], m = P.length, sgn = 0, i;
  for (i = 0; i < m; i++) { var p = P[i], qq = P[(i + 1) % m]; sgn += p[0] * qq[1] - qq[0] * p[1]; }
  for (i = 0; i < m; i++) {
    var p0 = P[i], p1 = P[(i + 1) % m]; if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1e-12) continue;
    var ey = p1[0] - p0[0], ez = p1[1] - p0[1], on = sgn > 0 ? [ez, -ey] : [-ez, ey];   // outward 2D normal (y, z)
    var A = [x0, y0 + p0[0], z0 + p0[1]], B = [x1, y0 + p0[0], z0 + p0[1]], C = [x1, y0 + p1[0], z0 + p1[1]], D = [x0, y0 + p1[0], z0 + p1[1]];
    [[A, B, C], [A, C, D]].forEach(function (t) { var e1 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], e2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]], nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], d = ny * on[0] + nz * on[1]; var tt = d >= 0 ? t : [t[0], t[2], t[1]]; void nx; tt.forEach(function (v) { out.push(v[0], v[1], v[2]); }); });
  }
  // end caps: ear clipping of the outline (so the part is closed; a joint's end-distance clause ray needs the end face)
  var idx = P.map(function (_, k) { return k; }).filter(function (k) { var p0 = P[k], p1 = P[(k + 1) % m]; return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1e-12; }), poly = idx.map(function (k) { return P[k]; }), pol = poly.slice();
  if (sgn < 0) pol.reverse();   // counter-clockwise
  var cross2 = function (a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }, tris2 = [], guard = 0;
  while (pol.length > 3 && guard++ < 1000) {
    var clipped = false;
    for (i = 0; i < pol.length; i++) {
      var a = pol[(i + pol.length - 1) % pol.length], b = pol[i], c = pol[(i + 1) % pol.length]; if (cross2(a, b, c) <= 1e-12) continue;
      var ok = true; for (var k2 = 0; k2 < pol.length; k2++) { var q2 = pol[k2]; if (q2 === a || q2 === b || q2 === c) continue; if (cross2(a, b, q2) >= 0 && cross2(b, c, q2) >= 0 && cross2(c, a, q2) >= 0) { ok = false; break; } }
      if (ok) { tris2.push([a, b, c]); pol.splice(i, 1); clipped = true; break; }
    }
    if (!clipped) break;
  }
  if (pol.length === 3) tris2.push([pol[0], pol[1], pol[2]]);
  tris2.forEach(function (t) {   // CCW in (y, z) seen from +x is the +x cap's outward winding; the -x cap is the reverse
    [[x1, t, false], [x0, t, true]].forEach(function (cp) { var q3 = cp[2] ? [t[0], t[2], t[1]] : t; q3.forEach(function (v) { out.push(cp[0], y0 + v[0], z0 + v[1]); }); });
  });
  return out;
}
var SYNTH = { y: { A: 0.0, B: 1.0, C: 2.0, D: -1.0 }, support: 'COL_1', gen: 'GEN-CR-BEAM_A-A', n_bolts: 4, plate_H: 250, plate_L: 90, weld: 5, t_sup: 25, tw: 8, zone: 128, addedVerts: 2772, parts: 3 };
function synthetic(SQL) {
  var db = new SQL.Database();
  db.run('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  db.run('CREATE TABLE element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)'); db.run('CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, building TEXT)');
  var N = 0;
  function el(guid, cls, name, mat, W) {
    var b = bboxOf(W), c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2], v = new Float32Array(W.length); for (var i = 0; i < W.length; i += 3) { v[i] = W[i] - c[0]; v[i + 1] = W[i + 1] - c[1]; v[i + 2] = W[i + 2] - c[2]; }
    db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', [guid, cls, name, 'Level 1', 'STR', mat, '0.5,0.5,0.5,1', 'SYN']); db.run('INSERT INTO element_transforms VALUES (?,?,?,?,0,0,0,?,?,?)', [guid, c[0], c[1], c[2], b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]]);
    db.run('INSERT INTO element_instances VALUES (?,?)', [guid, 'syn' + (++N)]); db.run('INSERT INTO component_geometries VALUES (?,?,?,?)', ['syn' + N, new Uint8Array(v.buffer), new Uint8Array(0), 'SYN']);
  }
  var nm = 'Beam - Steel - UB - Universal Beams (M):UB300x150x30:1';
  el('COL_1', 'IfcColumn', 'Column - Steel - UC - Universal Columns (M):UC test:2', 'Steel', boxTris([2.02, -1.3, -1.0], [2.045, 2.3, 1.0]));          // a 25 mm steel wall, 3.6 m wide
  el('BEAM_A', 'IfcBeam', nm, 'Steel', iBeam(0, 2.0, SYNTH.y.A, 0, 0.075, 0.150, 0.012, 0.008, 0.010));                                                 // generates: 20 mm from the wall
  el('BEAM_B', 'IfcBeam', nm, 'Steel', iBeam(0, 2.0, SYNTH.y.B, 0, 0.075, 0.150, 0.012, 0.008, 0.010));                                                 // an obstacle stands in the plate zone: refused for clash
  el('OBST_B1', 'IfcBuildingElementProxy', 'Obstacle', 'Aluminium', boxTris([1.95, 1.010, -0.05], [2.015, 1.020, 0.05]));
  el('OBST_B2', 'IfcBuildingElementProxy', 'Obstacle', 'Aluminium', boxTris([1.95, 0.980, -0.05], [2.015, 0.990, 0.05]));
  el('BEAM_C', 'IfcBeam', nm, 'Steel', iBeam(0, 2.035, SYNTH.y.C, 0, 0.075, 0.150, 0.012, 0.008, 0.010));                                               // ends inside the wall: overlap in the model
  el('BEAM_D', 'IfcBeam', nm, 'Steel', iBeam(0, 2.0, SYNTH.y.D, 0, 0.075, 0.150, 0.012, 0.008, 0));                                                     // welded outline, no root fillet: not a rolled I-section
  return db;
}

// ---- the parts as the Modeller stores them: float32 vertices relative to the op's centre + the centre (what a reload reads); this is what CLEAR_POST re-checks
function written(parts, meta) {
  var b = Ops.build(parts, 'joints', meta);
  return b.ops.map(function (o, i) {
    var v = b.assets[i].v, P = o.params, halfZ = (P.bbox[5] - P.bbox[4]) / 2, c = [P.placement.x, P.placement.y, P.placement.z + halfZ], W = new Float64Array(v.length);
    for (var k = 0; k < v.length; k += 3) { W[k] = v[k] + c[0]; W[k + 1] = v[k + 1] + c[1]; W[k + 2] = v[k + 2] + c[2]; }
    return { guid: parts[i].guid, beam: parts[i].beam, support: parts[i].support, kind: parts[i].kind, tris: W };
  });
}
var ruleSnap = function (R) { return JSON.stringify(Object.keys(R).sort().map(function (k) { return [k, R[k].value, R[k].source]; })); };

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var REAL = !!(SRC && ORA && ODIR), srcDb, oraDb = null, oSurvey = null, oResult = null, oLog = '';
  if (REAL) {
    srcDb = new SQL.Database(new Uint8Array(fs.readFileSync(SRC))); oraDb = new SQL.Database(new Uint8Array(fs.readFileSync(ORA)));
    oSurvey = JSON.parse(fs.readFileSync(path.join(ODIR, 'joint_survey.json'), 'utf8')); oResult = JSON.parse(fs.readFileSync(path.join(ODIR, 'gen_result.json'), 'utf8'));
    try { oLog = fs.readFileSync(path.join(ODIR, 'log', 'gen_run1.log'), 'utf8'); } catch (e) { oLog = ''; }
  } else srcDb = synthetic(SQL);
  console.log('§LODUP_MODE pack=joints source=' + (REAL ? 'LODUP_SRC_DB (real)' : 'SYNTHETIC fixture (LODUP_SRC_DB / LODUP_ORACLE_DB / LODUP_ORACLE_DIR unset)') + ' oracle=' + (REAL ? 'LODUP_ORACLE_DB + LODUP_ORACLE_DIR' : 'none') + ' break=' + (MAIN_BREAK ? 1 : 0));
  var inp = Reader.fromDb(srcDb); inp.callouts = [];
  var RULES = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/joint_defaults.json'), 'utf8'))), RC = Rules.counts(RULES);
  console.log('§LODUP_RULES pack=joints rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' unset=' + RC.unset);
  var run = function (rows, o) { return Pack.run(inp, rows, Object.assign({ log: function (l) { console.log(l); } }, o || {})); };
  var R = run(RULES, { noClash: MAIN_BREAK }), parts = R.parts, A = R.audit, applies = Pack.appliesTo(inp, RULES);
  verdict('NONVACUOUS', parts.length ? true : (applies ? false : null), 'applies_to=' + applies + ' parts=' + parts.length + ' joints=' + R.stats.joints + ' ends=' + R.stats.ends + ' added_verts=' + R.stats.addedVerts + (parts.length ? '' : ' (nothing judged)'));
  var mine = {}; parts.forEach(function (p) { mine[p.guid] = p; });
  var resBy = {}; A.results.forEach(function (r) { resBy[r.guid + '|' + r.end] = r; });

  if (!REAL) {   // ---- SYNTH_TRUTH: hand-derived expectations
    var endAt = function (g, wall) { return A.results.filter(function (r) { return r.guid === g && (r.end_point[0] > 1) === wall; })[0]; }, cat = function (g, wall) { var r = endAt(g, wall); return r ? r.result : '-'; };
    var a = A.generated[0] || {}, plate = mine[SYNTH.gen + '-PL'], pb = plate ? bboxOf(plate.tris) : null, ids = parts.map(function (p) { return p.guid; }).sort().join();
    var truth = cat('BEAM_A', true) === 'GENERATED' && cat('BEAM_B', true) === 'REFUSED_CLASH' && cat('BEAM_C', true) === 'OVERLAP_IN_MODEL' && cat('BEAM_D', true) === 'NOT_I' && ['A', 'B', 'C', 'D'].every(function (k) { return cat('BEAM_' + k, false) === 'GAP'; });
    var vals = a.n_bolts === SYNTH.n_bolts && Math.abs(a.plate_H - SYNTH.plate_H) < 1e-9 && Math.abs(a.plate_L - SYNTH.plate_L) < 0.01 && a.weld_mm === SYNTH.weld && Math.abs(a.support_t_measured_mm - SYNTH.t_sup) < 0.01 && Math.abs(a.tw_measured_mm - SYNTH.tw) < 0.3 && Math.abs(a.zone_mm - SYNTH.zone) < 0.05;
    var hitsObst = A.results.filter(function (r) { return r.result === 'REFUSED_CLASH'; }).every(function (r) { return r.hit_guids.some(function (g) { return /^OBST_B/.test(g); }); });
    verdict('SYNTH_TRUTH', truth && vals && hitsObst && R.stats.addedVerts === SYNTH.addedVerts && parts.length === SYNTH.parts && ids === 'GEN-CR-BEAM_A-A-BT,GEN-CR-BEAM_A-A-PL,GEN-CR-BEAM_A-A-WD' && R.stats.refused === 7,
      'A wall end generated bolts=' + a.n_bolts + ' plateH=' + a.plate_H + ' plateL=' + (a.plate_L && a.plate_L.toFixed(3)) + ' weld=' + a.weld_mm + ' wall=' + (a.support_t_measured_mm && a.support_t_measured_mm.toFixed(2)) + ' tw=' + (a.tw_measured_mm && a.tw_measured_mm.toFixed(3)) + ' zone=' + (a.zone_mm && a.zone_mm.toFixed(3)) +
      ' | wall ends: A ' + cat('BEAM_A', true) + ' B ' + cat('BEAM_B', true) + ' C ' + cat('BEAM_C', true) + ' D ' + cat('BEAM_D', true) + ' | free ends=' + ['A', 'B', 'C', 'D'].map(function (k) { return cat('BEAM_' + k, false); }).join('/') + ' addedVerts=' + R.stats.addedVerts + ' refused_rows=' + R.stats.refused + ' (hand-derived: 4 bolts, 250 x 90 plate, 5 mm weld, 25 mm wall, 8 mm web (0.3 mm: the oracle median over the web faces and the first fillet segment), zone 128, 2772 vertices)');
    verdict('PARITY', null, 'no oracle (synthetic fixture): survey / ids / reasons / vertices / change rows not compared');
  } else {
    // ---- PARITY_SURVEY: ends matched by guid + nearest end point
    var near = function (r) { var best = null; oSurvey.forEach(function (o) { if (o.guid !== r.guid) return; var d = Math.hypot(o.end_point[0] - r.end_point[0], o.end_point[1] - r.end_point[1], o.end_point[2] - r.end_point[2]); if (!best || d < best.d) best = { d: d, o: o }; }); return best; };
    var diff = [], sameLetter = 0, maxEp = 0, matched = 0;
    A.survey.forEach(function (r) {
      var m = near(r); if (!m) { diff.push([r.guid, 'no oracle end']); return; } matched++; var o = m.o; maxEp = Math.max(maxEp, m.d); if (o.end === r.end) sameLetter++;
      if (o.cls !== r.cls || (o.support || null) !== (r.support || null)) diff.push([r.guid, r.end, 'class/support', o.cls + '/' + (o.support || '-'), r.cls + '/' + (r.support || '-')]);
      ['clear_min_mm', 'clear_max_mm', 'angle', 'D_mm', 'B_mm', 'rays_hit', 'rays_support'].forEach(function (k) { if (k in o && Math.abs(o[k] - r[k]) > 0.06) diff.push([r.guid, r.end, k, o[k], r[k]]); });
    });
    var byClass = {}; A.survey.forEach(function (r) { byClass[r.cls] = (byClass[r.cls] || 0) + 1; });
    verdict('PARITY_SURVEY', oSurvey.length > 0 && A.survey.length === oSurvey.length && matched === oSurvey.length && !diff.length, 'oracle_ends=' + oSurvey.length + ' js_ends=' + A.survey.length + ' matched_by_end_point=' + matched + ' max_end_point_delta_m=' + maxEp.toExponential(1) + ' end_letter_same=' + sameLetter + ' differing_fields=' + diff.length + ' classes=' + JSON.stringify(byClass) + (diff[0] ? ' first=' + JSON.stringify(diff[0]) : '') + ' (end letter: JS convention = first axis component negative; numpy gave the same on all members)');
    // ---- PARITY_GENERATED / REFUSED: category per end
    var oGen = {}; oResult.forEach(function (o) { oGen[o.guid + '|' + o.end] = o; });
    var oraCat = function (o) { var r = oGen[o.guid + '|' + o.end]; return r ? r.result : (o.cls === 'STEEL_WEB' ? 'NOT_I' : 'GAP'); };
    var catPairs = {}, catBad = [];
    A.survey.forEach(function (r) { var m = near(r); if (!m) return; var oc = oraCat(m.o), jr = resBy[r.guid + '|' + r.end], jc = jr ? jr.result : '-'; catPairs[oc + '>' + jc] = (catPairs[oc + '>' + jc] || 0) + 1; if (oc !== jc) catBad.push([r.guid, r.end, oc, jc]); });
    var oraIds = q(oraDb, "SELECT guid FROM elements_meta WHERE guid LIKE 'GEN-CR-%' ORDER BY guid").map(function (v) { return v[0]; }), mIds = Object.keys(mine).sort();
    var onlyO = oraIds.filter(function (g) { return !mine[g]; }), onlyM = mIds.filter(function (g) { return oraIds.indexOf(g) < 0; });
    verdict('PARITY_GENERATED', oraIds.length > 0 && !onlyO.length && !onlyM.length && A.generated.length === oResult.filter(function (o) { return o.result === 'GENERATED'; }).length, 'oracle_parts=' + oraIds.length + ' js_parts=' + mIds.length + ' only_in_oracle=' + onlyO.length + ' only_in_js=' + onlyM.length + ' js_joints=' + A.generated.length + ' oracle_joints=' + oResult.filter(function (o) { return o.result === 'GENERATED'; }).length + (onlyO[0] ? ' first_only_oracle=' + onlyO[0] : '') + (onlyM[0] ? ' first_only_js=' + onlyM[0] : ''));
    // the clash neighbours the oracle recorded (at most 4 per joint) must be among those the JS found
    var clashMiss = [], clashN = 0, firstSame = 0;
    A.results.filter(function (r) { return r.result === 'REFUSED_CLASH'; }).forEach(function (r) { var m = near(r), o = m && oGen[m.o.guid + '|' + m.o.end]; if (!o || !o.clash) return; clashN++; var want = o.clash.map(function (c) { return c[1]; }); if (want.some(function (g) { return r.hit_guids.indexOf(g) < 0; })) clashMiss.push([r.guid, want.filter(function (g) { return r.hit_guids.indexOf(g) < 0; })]); if (r.clash[0][1] === o.clash[0][1]) firstSame++; });
    var reasonOracle = {}; if (oLog) oLog.split('\n').forEach(function (l) { var mm = /^§CONN_GEN (.+) ends=(\d+)$/.exec(l); if (mm) reasonOracle[mm[1]] = +mm[2]; });
    var mapR = { 'gap: not an I-section in the IFC profiles': A.survey.length ? Pack.REASON.NOT_I : '' }, reasonJs = A.reasons, rBad = [];
    Object.keys(reasonOracle).forEach(function (k) { var kk = mapR[k] || k; if ((reasonJs[kk] || 0) !== reasonOracle[k]) rBad.push([k, reasonOracle[k], reasonJs[kk] || 0]); });
    verdict('PARITY_REFUSED', !catBad.length && catPairs && !clashMiss.length && (oLog ? !rBad.length : true) && Object.keys(reasonOracle).length > 0, 'ends_by_category(oracle>js)=' + JSON.stringify(catPairs) + ' differing_ends=' + catBad.length + ' clash_joints=' + clashN + ' oracle_neighbours_missing_in_js=' + clashMiss.length + ' first_hit_same=' + firstSame + '/' + clashN + ' reasons_oracle=' + JSON.stringify(reasonOracle) + ' differing_reason_counts=' + rBad.length + (rBad[0] ? ' first=' + JSON.stringify(rBad[0]) : '') + (catBad[0] ? ' first_end=' + JSON.stringify(catBad[0]) : '') + ' (the oracle\'s "not an I-section in the IFC profiles" is the JS "not a rolled I-section": the IFC profile table is not in the DB; the mesh decides)');
    // ---- PARITY_CHANGELIST
    var oraEl = {}; q(oraDb, "SELECT guid, ifc_class, element_name FROM elements_meta WHERE guid LIKE 'GEN-CR-%'").forEach(function (v) { oraEl[v[0]] = [v[1], v[2]]; });
    var addedRows = R.changes.filter(function (c) { return c.kind === 'ADDED'; }), refRows = R.changes.filter(function (c) { return c.kind === 'REFUSED'; }), chBad = [];
    addedRows.forEach(function (c) { var o = oraEl[c.guid]; if (!o || o[0] !== c.cls || o[1] !== mine[c.guid].name) chBad.push([c.guid, o ? [o[0], o[1].slice(0, 60)] : null, [c.cls, mine[c.guid].name.slice(0, 60)]]); });
    var refEnds = A.survey.length - A.generated.length;
    verdict('PARITY_CHANGELIST', oraIds.length > 0 && addedRows.length === oraIds.length && !chBad.length && refRows.length === refEnds && refRows.every(function (c) { return c.host === c.guid && /: gap: /.test(c.detail); }), 'oracle_elements=' + oraIds.length + ' js_ADDED=' + addedRows.length + ' name_or_class_mismatch=' + chBad.length + ' js_REFUSED=' + refRows.length + ' refused_ends_expected=' + refEnds + ' (one per refused end, host = the beam, the oracle reason in the detail)' + (chBad[0] ? ' first=' + JSON.stringify(chBad[0]) : ''));
    // ---- PARITY_VERTICES + PARITY_VALUES
    var ora = {}; q(oraDb, "SELECT i.guid, c.vertices, t.center_x, t.center_y, t.center_z FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) WHERE i.guid LIKE 'GEN-CR-%' ORDER BY i.guid")
      .forEach(function (v) { var b = v[1], f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), W = new Float64Array(f.length); for (var i = 0; i < f.length; i += 3) { W[i] = f[i] + v[2]; W[i + 1] = f[i + 1] + v[3]; W[i + 2] = f[i + 2] + v[4]; } ora[v[0]] = W; });
    var vcBad = 0, maxD = 0, nVert = 0, off = {}, perPart = {};
    // P4 FIX SPEC: each triangle is compared as a vertex SET (the best of its 6 vertex orders), so a winding fixed here and not in the oracle is still judged on positions; the re-wound triangles are counted
    var PERM = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]], rewound = {};
    mIds.forEach(function (g) { if (!ora[g]) return; var a = mine[g].tris, b = ora[g]; if (a.length !== b.length) { vcBad++; return; } nVert += a.length / 3; var d = 0;
      for (var t = 0; t < a.length; t += 9) { var best = Infinity, bp = 0; PERM.forEach(function (pm, pi) { var m = 0; for (var k = 0; k < 3; k++) for (var c = 0; c < 3; c++) { var dd = Math.abs(a[t + 3 * k + c] - b[t + 3 * pm[k] + c]); if (dd > m) m = dd; } if (m < best) { best = m; bp = pi; } }); if (best > d) d = best; if (bp > 2) rewound[g.slice(-2)] = (rewound[g.slice(-2)] || 0) + 1; }
      perPart[g] = d; if (d > maxD) maxD = d; if (d > VTOL) off[g.replace(/-(PL|BT|WD)$/, '')] = Math.max(off[g.replace(/-(PL|BT|WD)$/, '')] || 0, d); });
    console.log('§LODUP_JOINT_REWOUND triangles whose winding differs from the oracle (the P4 FIX SPEC weld caps; positions equal) by part kind: ' + JSON.stringify(rewound));
    var offList = Object.keys(off).sort().map(function (k) { var jr = A.generated.filter(function (x) { return 'GEN-CR-' + x.guid + '-' + (x.end > 0 ? 'B' : 'A') === k; })[0]; return k + ' delta_mm=' + (off[k] * 1000).toFixed(4) + ' tie_margin_mm=' + (jr ? jr.tie_margin_mm.toFixed(4) : '?'); });
    var tieJoints = A.generated.filter(function (x) { return x.tie_margin_mm <= 0.01; }).length;
    verdict('PARITY_VERTICES', vcBad === 0 && nVert > 0 && Object.keys(off).length === 0, 'parts_compared=' + Object.keys(perPart).length + ' vertices_compared=' + nVert + ' vertex_count_mismatch_parts=' + vcBad + ' max_world_delta_mm=' + (maxD * 1000).toFixed(6) + ' tolerance=0.01 mm | joints decided inside the tie band (plate end half way between two 2 mm samples, margin <= 0.01 mm)=' + tieJoints + ' of ' + A.generated.length + ' (the deeper sample wins; rule fixed after the first run, see the spec)' + (offList.length ? ' | joints outside tolerance: ' + offList.slice(0, 10).join('; ') : ' | joints outside tolerance: none'));
    var valBad = []; A.generated.forEach(function (j) { var m = near(j), o = m && oGen[m.o.guid + '|' + m.o.end]; if (!o) { valBad.push([j.guid, 'no oracle']); return; }
      [['n_bolts', 0], ['plate_H', 1e-6], ['weld_mm', 0]].forEach(function (kv) { if (Math.abs(o[kv[0]] - j[kv[0]]) > kv[1]) valBad.push([j.guid, kv[0], o[kv[0]], j[kv[0]]]); });
      if (Math.abs(o.plate_L - j.plate_L) > 0.01) valBad.push([j.guid, 'plate_L', o.plate_L, j.plate_L]); if (Math.abs(o.tw_measured_mm - j.tw_measured_mm) > 0.006) valBad.push([j.guid, 'tw', o.tw_measured_mm, j.tw_measured_mm]);
      if (Math.abs(o.support_t_measured_mm - j.support_t_measured_mm) > 0.051) valBad.push([j.guid, 'support_t', o.support_t_measured_mm, j.support_t_measured_mm]); if (Math.abs(o.web_mm - j.web_mm) > 0.051) valBad.push([j.guid, 'web_mm', o.web_mm, j.web_mm]);
      Object.keys(o.measured || {}).forEach(function (k) { if (!j.measured || Math.abs(o.measured[k] - j.measured[k]) > 0.011) valBad.push([j.guid, 'measured.' + k, o.measured[k], j.measured[k]]); });
      if (Object.keys(j.checks).some(function (k) { return !j.checks[k]; })) valBad.push([j.guid, 'a clause check failed']); });
    verdict('PARITY_VALUES', A.generated.length > 0 && !valBad.length, 'joints=' + A.generated.length + ' differing_values=' + valBad.length + ' (bolts, plate height, weld exact; plate length 0.01 mm; web 0.006 mm, wall and clear web within the oracle\'s 0.1 rounding; the 7 measured clause values 0.011 mm) clause_failures=' + A.ruleFail.length + (valBad[0] ? ' first=' + JSON.stringify(valBad[0]) : ''));
  }

  // ---- CLEAR_POST on the parts REBUILT FROM THE OP-LOG ROWS
  var wr = written(parts, inp.meta), cp = parts.length ? Pack.clearPost(inp, RULES, wr, function () { }) : null;
  var cpv = verdict('CLEAR_POST', parts.length ? (MAIN_BREAK ? cp.fails.length === 0 : cp.fails.length === 0) : null, 'parts_checked=' + (cp ? cp.checked : 0) + ' failures=' + (cp ? cp.fails.length : 0) + ' (the stored float32 vertices + centre, every neighbour of every part, the clash check ' + (MAIN_BREAK ? 'OFF' : 'on') + ')' + (cp && cp.fails[0] ? ' first=' + JSON.stringify(cp.fails[0]) : ''));
  // ---- CLAUSES re-read on the written result: independent of the generator's own variables (plate thickness, bolt count, weld legs from the stored vertices)
  var clBad = [], clN = 0;
  A.generated.forEach(function (j) {
    var base = 'GEN-CR-' + j.guid + '-' + (j.end > 0 ? 'B' : 'A'), bt = wr.filter(function (w) { return w.guid === base + '-BT'; })[0], pl = wr.filter(function (w) { return w.guid === base + '-PL'; })[0]; if (!bt || !pl) { clBad.push([base, 'part missing']); return; } clN++;
    var m = /^(\d+) x M20 bolt/.exec(mine[base + '-BT'].name), nb = m ? +m[1] : -1, perBolt = bt.tris.length / 3 / nb;   // vertices per bolt are fixed by the builder: 5 prisms
    if (nb !== j.n_bolts || perBolt !== 672) clBad.push([base, 'bolt count/vertices', nb, perBolt]);
    // plate: 8 corners; the two big faces are parallel: thickness = the smallest extent of the corner set along its smallest principal direction, here the distance between the two faces of the 12 triangles
    var P = pl.tris, ns = []; for (var t = 0; t + 8 < P.length; t += 9) { var e1 = [P[t + 3] - P[t], P[t + 4] - P[t + 1], P[t + 5] - P[t + 2]], e2 = [P[t + 6] - P[t], P[t + 7] - P[t + 1], P[t + 8] - P[t + 2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], L = Math.hypot(n[0], n[1], n[2]); ns.push({ n: [n[0] / L, n[1] / L, n[2] / L], a: L, p: [P[t], P[t + 1], P[t + 2]] }); }
    var big = ns.slice().sort(function (x, y) { return y.a - x.a; })[0], th = 0; ns.forEach(function (s) { var dp = Math.abs((s.p[0] - big.p[0]) * big.n[0] + (s.p[1] - big.p[1]) * big.n[1] + (s.p[2] - big.p[2]) * big.n[2]); if (dp > th) th = dp; });
    if (Math.abs(th * 1000 - 10) > 0.05) clBad.push([base, 'plate thickness mm', th * 1000]);
  });
  verdict('CLAUSES', clN ? !clBad.length : null, 'joints_rechecked=' + clN + ' mismatches=' + clBad.length + ' (bolt count vs the part name and 672 vertices per bolt; plate thickness from the stored plate faces = the 10 mm row; AISC 360-16 edge / pitch / weld clauses are the pack\'s measured §LODUP_JOINT_RULES, compared in PARITY_VALUES)' + (clBad[0] ? ' first=' + JSON.stringify(clBad[0]) : ''));

  // ---- CENTRE (through the same function the pill uses to write ops)
  var built = Ops.build(parts, 'joints', inp.meta), cBad = 0, maxC = 0, attBad = 0, partsOfBad = 0;
  built.ops.forEach(function (o, i) {
    var P = o.params, W = parts[i].tris, bb = bboxOf(W), halfZ = (bb[1][2] - bb[0][2]) / 2, cen = [P.placement.x, P.placement.y, P.placement.z + halfZ], bc = [0, 1, 2].map(function (a) { return (bb[0][a] + bb[1][a]) / 2; });
    var d = Math.max(Math.abs(cen[0] - bc[0]), Math.abs(cen[1] - bc[1]), Math.abs(cen[2] - bc[2])); if (d > maxC) maxC = d; if (d > 1e-6) cBad++;
    if (P.provenance !== 'generated:joints' || o.op_type !== 'GEOM_INSERT' || !/capacity not checked/.test(P.note) || !/capacity not checked/.test(P.name)) cBad++;
    if (!P.attached_to || P.attached_to.join() !== parts[i].attach.join() || P.attached_to.length !== 1) attBad++;
    if (P.parts_of !== undefined) partsOfBad++;
  });
  verdict('CENTRE', built.ops.length ? (cBad === 0 && attBad === 0 && partsOfBad === 0 && built.elementParts.length === 0) : null, 'ops=' + built.ops.length + ' centre_not_own_bbox_centre=' + cBad + ' max_delta_m=' + maxC.toExponential(2) + ' attached_to_wrong=' + attBad + ' ops_with_parts_of=' + partsOfBad + ' element_parts_rows=' + built.elementParts.length + ' (provenance generated:joints, the name and the op note say "configuration only, capacity not checked", attached_to = the beam, no element_parts row so the beam stays drawn)');

  // ---- RULES: edited rows change the result; a stated row beats a default edit; the shipped rows carry a source
  var t1 = Rules.merge(RULES, { bolt_pitch_mm: { value: 70, source: 'stated: test edit' }, plate_thickness_mm: { value: 12, source: 'stated: test edit' } }), t2 = Rules.merge(t1.rows, { bolt_pitch_mm: { value: 60, source: 'default: attempt' } });
  var R2 = parts.length ? Pack.run(inp, t1.rows, { log: function () { }, noClash: MAIN_BREAK }) : null;
  var pitchTxt = R2 && R2.parts.length ? /pitch 70/.test(R2.parts.filter(function (p) { return p.kind === 'BT'; })[0].name) : null, plTxt = R2 && R2.parts.length ? / 12 x /.test(R2.parts.filter(function (p) { return p.kind === 'PL'; })[0].name) : null;
  var noSrc = Object.keys(RULES).filter(function (k) { return !/^(default|stated|unset)/.test(String(RULES[k].source)); });
  verdict('RULES', R2 ? (pitchTxt && plTxt && t2.refused.length === 1 && t2.rows.bolt_pitch_mm.value === 70 && noSrc.length === 0) : null, 'edited pitch 60 -> 70 and plate 10 -> 12: bolt name has pitch 70=' + pitchTxt + ' plate name has 12=' + plTxt + '; a default edit over the stated row refused=' + t2.refused.length + ' rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' rows_without_source_kind=' + noSrc.length);

  // ---- GATE: only steel members are judged: relabel every member's material -> nothing judged (INCONCLUSIVE, not PASS); an empty gate row (red control) brings the members back
  (function () {
    var meta2 = {}; Object.keys(inp.meta).forEach(function (g) { meta2[g] = Object.assign({}, inp.meta[g]); if (meta2[g].cls === 'IfcBeam' || meta2[g].cls === 'IfcMember') { meta2[g].mat = 'Concrete - Precast'; meta2[g].layerMats = null; } });
    var inp2 = Object.assign({}, inp, { meta: meta2, src: {} }), lg = [], cut = Pack.survey(inp2, RULES, function (l) { lg.push(l); }), openG = Rules.merge(RULES, { member_material_gate: { value: '', source: 'stated: test (gate off)' } }).rows, off = Pack.survey(inp2, openG, function () { });
    var on = Pack.survey(inp, RULES, function () { }), applies2 = Pack.appliesTo(inp2, RULES);
    verdict('GATE', on.rows.length ? (cut.rows.length === 0 && applies2 === 0 && off.rows.length === on.rows.length && lg.join('\n').indexOf('nothing left to judge') >= 0) : null, 'steel members: ends=' + on.rows.length + ' | every beam/member relabelled concrete: ends=' + cut.rows.length + ' applies_to=' + applies2 + ' ("nothing left to judge" logged=' + (lg.join('\n').indexOf('nothing left to judge') >= 0) + ') | gate row emptied: ends=' + off.rows.length);
  })();

  // ---- DETERMINISM: two runs, same op hash
  function opHash(rr) { var b = Ops.build(rr.parts, 'joints', inp.meta), h = crypto.createHash('sha256'); h.update(JSON.stringify(b.ops)); b.assets.forEach(function (a) { h.update(Buffer.from(a.v.buffer)); }); h.update(JSON.stringify(b.elementParts)); h.update(JSON.stringify(rr.changes)); return h.digest('hex'); }
  var h1 = opHash(R), h2 = opHash(run(RULES, { noClash: MAIN_BREAK }));
  verdict('DETERMINISM', parts.length ? h1 === h2 : null, 'run1=' + h1.slice(0, 16) + ' run2=' + h2.slice(0, 16));

  // ---- WINDING (P4 FIX SPEC): every component of every generated part closed, every directed edge used once, signed volume > 0. The red control: the old weld caps must FAIL it.
  function windBad(P) { var bad = { open: 0, inconsistent: 0, inward: 0 }, comps = 0;
    P.forEach(function (p) { var t = p.tris, key = function (i) { return t[i].toFixed(6) + ',' + t[i + 1].toFixed(6) + ',' + t[i + 2].toFixed(6); }, n = t.length / 9, V = [], par = [], f = function (x) { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }, byV = {}, i, k;
      for (i = 0; i < n; i++) { V.push([key(9 * i), key(9 * i + 3), key(9 * i + 6)]); par.push(i); }
      V.forEach(function (v, i2) { v.forEach(function (kk) { if (byV[kk] !== undefined) par[f(i2)] = f(byV[kk]); else byV[kk] = i2; }); });
      var C = {}; for (i = 0; i < n; i++) (C[f(i)] = C[f(i)] || []).push(i);
      Object.keys(C).forEach(function (r) { comps++; var E = {}, D = {}, vol = 0; C[r].forEach(function (ti) { var v = V[ti], o = 9 * ti; for (k = 0; k < 3; k++) { var a = v[k], b = v[(k + 1) % 3]; E[a < b ? a + '|' + b : b + '|' + a] = (E[a < b ? a + '|' + b : b + '|' + a] || 0) + 1; D[a + '>' + b] = (D[a + '>' + b] || 0) + 1; }
          vol += (t[o] * (t[o + 4] * t[o + 8] - t[o + 5] * t[o + 7]) - t[o + 1] * (t[o + 3] * t[o + 8] - t[o + 5] * t[o + 6]) + t[o + 2] * (t[o + 3] * t[o + 7] - t[o + 4] * t[o + 6])) / 6; });
        if (Object.keys(E).some(function (e) { return E[e] !== 2; })) bad.open++; else if (Object.keys(D).some(function (e) { return D[e] !== 1; })) bad.inconsistent++; else if (vol <= 0) bad.inward++; }); });
    bad.components = comps; bad.total = bad.open + bad.inconsistent + bad.inward; return bad; }
  var WB = windBad(parts);
  verdict('WINDING', parts.length ? WB.total === 0 : null, 'parts=' + parts.length + ' components=' + WB.components + ' open=' + WB.open + ' inconsistent=' + WB.inconsistent + ' inward=' + WB.inward + ' (each component closed, every directed edge once, signed volume > 0)');
  if (parts.length && !MAIN_BREAK) { var RW = run(RULES, { breakWeldWinding: true }), WB2 = windBad(RW.parts);
    verdict('BREAK_WINDING', WB2.total > 0, 'switch=on (the old weld caps): ' + WB2.total + ' bad components of ' + WB2.components + ' (inconsistent=' + WB2.inconsistent + ' inward=' + WB2.inward + ') expected WINDING=FAIL got WINDING=' + (WB2.total ? 'FAIL' : 'PASS')); }
  // ---- BREAK: the clash check switched off; the same re-check on the written result must FAIL (a clash check that cannot fail is not a check)
  if (!MAIN_BREAK) {
    var RB = Pack.run(inp, RULES, { noClash: true, log: function () { } }), wb = written(RB.parts, inp.meta), cb = RB.parts.length ? Pack.clearPost(inp, RULES, wb, function () { }) : null;
    var bkWord = !cb ? 'INCONCLUSIVE' : (cb.fails.length ? 'FAIL' : 'PASS');
    verdict('BREAK_CHECK', bkWord === 'FAIL', 'switch=on (clash check off: ' + RB.stats.joints + ' joints written instead of ' + R.stats.joints + ') expected CLEAR_POST=FAIL got CLEAR_POST=' + bkWord + ' (parts_checked=' + (cb ? cb.checked : 0) + ' failures=' + (cb ? cb.fails.length : 0) + (cb && cb.fails[0] ? ' first=' + JSON.stringify(cb.fails[0]) : '') + ')');
  } else console.log('§LODUP_BREAK_CHECK main run is the broken run: CLEAR_POST=' + cpv + ' (expected FAIL) -> ' + (cpv === 'FAIL' ? 'PASS' : 'FAIL'));

  // ---- change list text
  var txt = Ops.changeText(R.changes, { model: 'witness', pack: 'joints', rules: RC }), dl = txt.split('\n').filter(function (l) { return /^\d+ \| /.test(l); }).length;
  verdict('CHANGELIST_TXT', R.changes.length ? dl === R.changes.length : null, 'data_lines=' + dl + ' rows=' + R.changes.length + ' wording_line=' + /capacity not checked/.test(txt));

  // ---- REGISTRY: the chooser lists the packs with no dialog change; lod_ui.js is the P3 file, byte for byte
  var uiSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'lod/lod_ui.js'))).digest('hex'), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/packs.json'), 'utf8'));
  var manIds = man.packs.map(function (p) { return p.id; }), filesOk = man.packs.every(function (p) { return fs.existsSync(path.join(ROOT, 'lod', p.file)); });
  Registry.clear(); [Rebar, Weld, Layer, Pack].forEach(function (p) { Registry.register(p); });
  var rowsOf = function (id) { return id === 'joints' ? RULES : !Registry.get(id).rulesFile ? {} : Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod', Registry.get(id).rulesFile), 'utf8'))); };
  var ruleFilesOk = Registry.list().every(function (p) { return !p.rulesFile || fs.existsSync(path.join(ROOT, 'lod', p.rulesFile)); }), d1 = Registry.describe(inp, rowsOf, Rules);
  Registry.register({ id: 'dummy', label: 'Dummy (test pack)', appliesTo: function () { return 0; }, run: function () { return { parts: [], changes: [] }; } });
  var d2 = Registry.describe(inp, rowsOf, Rules), jRow = d1.filter(function (x) { return x.id === 'joints'; })[0];
  verdict('REGISTRY', d1.map(function (x) { return x.id; }).join() === 'rebar,welds,layers,joints' && manIds.slice(0, 4).join() === 'rebar,welds,layers,joints' && filesOk && ruleFilesOk && jRow && jRow.label === 'Steel joints' && jRow.appliesTo === applies && jRow.stated === RC.stated && jRow.default === RC.default && d2.length === d1.length + 1 && uiSha === P1_LOD_UI_SHA,
    'listed=' + d1.map(function (x) { return x.id + ':"' + x.label + '"(' + x.appliesTo + ')'; }).join(',') + ' packs.json=' + manIds.join() + ' pack_files_exist=' + filesOk + ' rules_files_exist=' + ruleFilesOk + ' joints_applies_to=' + (jRow && jRow.appliesTo) + ' after_one_more=' + d2.length + ' lod_ui_js_is_the_P3_file=' + (uiSha === P1_LOD_UI_SHA) + ' (the dialog renders exactly describe(); no UI code changed)');

  // ---- cost (PERF BUDGET)
  var srcVerts = 0; try { var bxs = inp.boxes(); srcVerts = q(srcDb, 'SELECT SUM(length(c.vertices) / 12) FROM element_instances i JOIN component_geometries c USING(geometry_hash)')[0][0] || 0; void bxs; } catch (e) { srcVerts = 0; }
  console.log('§LODUP_COST pack=joints addedVerts=' + R.stats.addedVerts + ' modelVerts=' + srcVerts + ' addedPct=' + (srcVerts ? (100 * R.stats.addedVerts / srcVerts).toFixed(2) : '-') + ' heapMB=' + (R.stats.addedVerts * 170 / 1e6).toFixed(2) + ' (0.17 GB per M vertices) warnOver1M=' + (R.stats.addedVerts > 1e6) + ' ms=' + R.stats.ms);
  console.log('§LODUP_SUMMARY pack=joints failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + (INCONC.length ? INCONC.join(',') : 'none') + ' mode=' + (REAL ? 'real' : 'synthetic') + ' break=' + (MAIN_BREAK ? 1 : 0));
  process.exit(MAIN_BREAK ? (cpv === 'FAIL' ? 0 : 1) : FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_CRASH ' + (e && e.stack || e)); process.exit(2); });
