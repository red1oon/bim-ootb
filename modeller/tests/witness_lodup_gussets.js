#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-GUSSETS: the LOD Upgrade pill's "Bracing gussets" pack (JS) equals the proven Python run. Read the log after every run (§LODUP_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P5 and "P5 SPEC". Oracle (private, read only): the gusset generator (gen_gussets.py, centre-fixed): its per-end result JSON, its log (gus_run1.log), its output DB (3 GEN-GU parts),
 * run on the base model (JPAM.db). Rule rows: the oracle's 12 gusset rows + the shared fin-plate rows (modeller/lod/rules/gusset_defaults.json, public, generic).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the browser result differs from the proven Python result".
 *   PARITY_SURVEY     the 57 STEEL_SKEW ends judged: the same ends (guid + end point), the same support, class STEEL_SKEW on all.
 *   PARITY_GENERATED  the same 1 joint, the same 3 part ids as the oracle DB.
 *   PARITY_REFUSED    every end in the same category as the oracle; the counts by reason equal the oracle log; every clash neighbour the oracle recorded is among those the JS found. A decision that FLIPPED is listed
 *                     with its end and both reasons, never tuned.
 *   PARITY_ECCENT     the measured eccentricity (J1.1) per end within 0.1 mm of the oracle's.
 *   PARITY_VERTICES   every WORLD vertex of every generated part within 0.01 mm of the oracle's; names and classes equal.
 *   PARITY_VALUES     attachment, bolts, plate size, thickness, weld, wall, filler, contact gap and the measured clause values within the oracle's own rounding; 0 clause failures.
 *   PARITY_CHANGELIST the ADDED rows equal the oracle DB's (guid, class, name, detail); one REFUSED row per refused end (host = the brace) carrying the oracle's reason.
 *   CLEAR_POST        the independent re-check on the parts REBUILT FROM THE OP-LOG ROWS (float32 vertices + centre): no part surface inside another solid.   BREAK_CHECK  the clash check off must FAIL it.
 *   CLAUSES / CENTRE / RULES (incl. the shared rows equal the joints pack's) / GATE / DETERMINISM / CHANGELIST_TXT / REGISTRY (5 packs) as the P1-P4 witnesses.
 * Inputs by environment only (no project path in the repo): LODUP_SRC_DB (the base model), LODUP_ORACLE_DB (the oracle's output DB; the per-end result JSON is read from <that path>.result.json), LODUP_ORACLE_DIR (the folder
 * with log/gus_run1.log); all read only. Any unset -> a SYNTHETIC fixture with hand-derived truth (stated on the first line); parity is then INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
global.window = undefined;   // pure node: the packs must not need a browser
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Joint = require(path.join(ROOT, 'lod/joint_pack.js')), Pack = require(path.join(ROOT, 'lod/gusset_pack.js')), Rebar = require(path.join(ROOT, 'lod/rebar_pack.js')), Weld = require(path.join(ROOT, 'lod/weld_pack.js')),
  Layer = require(path.join(ROOT, 'lod/layer_pack.js')), Ops = require(path.join(ROOT, 'lod/lod_ops.js')), Reader = require(path.join(ROOT, 'lod/lod_reader.js')), Registry = require(path.join(ROOT, 'lod/lod_registry.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var SRC = process.env.LODUP_SRC_DB, ORA = process.env.LODUP_ORACLE_DB, ODIR = process.env.LODUP_ORACLE_DIR, MAIN_BREAK = process.env.LODUP_BREAK === '1';
var P1_LOD_UI_SHA = 'bb35df181b869aa8056b6e78f466880e4debad598ac4c0eda1c69aca439f8fb5';   // lod/lod_ui.js as of P8 (Formats link, Load schedule reads a .dxf; the NAME FIX file was 03791bfb8a26caea); as of the P7 NAME FIX (download names drop the .db; the P7 file was 37e57cb76e4092bf); as of P7 (it gained the Add-on IFC row and the sliced run driver; the P6 file was dfb5d321c6f86f8c); lod/lod_ui.js as of P6 (it gained the declared-input button row and the live-neighbours reader; the P3 file was 703b8250e980def7); lod/lod_ui.js as of the P3 fix; P5 does not edit it
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

// an equal-leg angle L100x100x8 brace: axis u (horizontal unit), lateral e (horizontal, perpendicular), the in-plane leg horizontal (top at zref + 8 mm), the outstanding leg hanging down. phi rotates the section about its area centroid
// (45 deg: neither leg lies in the plane of brace axis and support axis). The section origin (l = 0.05, h = 0) runs along the line P0 + t u, t in [0, len]. Closed mesh: side faces per outline edge + two end caps of 5 cells.
function angleBrace(P0, u, e, len, zref, phi) {
  var cl = 0.0, ch = -30656 / 1536 / 1000;   // area centroid of the L (rects 8 x 92 at (4,-46), 8 x 8 at (4,4), 92 x 8 at (54,4), mm): hcg = -19.9583 mm; lcg
  cl = (736 * 4 + 64 * 4 + 736 * 54) / 1536 / 1000;
  var rot = function (p) { var l = p[0] - cl, h = p[1] - ch, c = Math.cos(phi), s = Math.sin(phi); return [cl + l * c - h * s, ch + l * s + h * c]; };
  var W = function (t, p) { var r = rot(p); return [P0[0] + t * u[0] + (r[0] - 0.05) * e[0], P0[1] + t * u[1] + (r[0] - 0.05) * e[1], zref + r[1]]; };
  var out = [], push = function (a, b, c) { [a, b, c].forEach(function (v) { out.push(v[0], v[1], v[2]); }); }, quadW = function (a, b, c, d) { push(a, b, c); push(a, c, d); };
  var outline = [[0, 0.008], [0.1, 0.008], [0.1, 0], [0.008, 0], [0.008, -0.092], [0, -0.092]];
  for (var i = 0; i < outline.length; i++) { var p = outline[i], r2 = outline[(i + 1) % outline.length]; quadW(W(0, p), W(len, p), W(len, r2), W(0, r2)); }
  var cells = [[[0, -0.092], [0.008, -0.046]], [[0, -0.046], [0.008, 0]], [[0, 0], [0.008, 0.008]], [[0.008, 0], [0.054, 0.008]], [[0.054, 0], [0.1, 0.008]]];
  cells.forEach(function (c) { [0, len].forEach(function (t) { var a = W(t, [c[0][0], c[0][1]]), b = W(t, [c[1][0], c[0][1]]), cc = W(t, [c[1][0], c[1][1]]), d = W(t, [c[0][0], c[1][1]]); quadW(a, b, cc, d); }); });
  return out;
}
var SQ = Math.SQRT1_2, SYNTH = { ecc: 150.0, tg: 10, plate_W: 70, plate_L: 35 + 35 / SQ + 95, weld: 5, t_sup: 8, n_bolts: 2, addedVerts: 1308, parts: 3, refused: 3 };
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
  var nmL = 'Beam - Steel - L (EA) - Equal Leg Angles (M):L100x100x8.0:1', ZREF = 0.150 + 30656 / 1536 / 1000, u = [SQ, SQ, 0], e = [SQ, -SQ, 0], L = 1.2;
  var start = function (x, back) { return [x - (L + back) * u[0], -0.004 - (L + back) * u[1], 0]; };   // the centre line meets the web face y = -0.004 at x, `back` m beyond the cap
  // one 2 m support per brace (an 8 mm web, the web zone +-272 mm): a long extrusion is two triangles per face, and the oracle's 2.5 m triangle window (support_window_m) would keep only half of them
  [0.5, 2.5, 4.0, 5.5].forEach(function (x, i) { el('SUP' + (i + 1), 'IfcBeam', 'Beam - Steel - UB - Universal Beams (M):UB600x190x101:' + (9 + i), 'Steel', iBeam(x - 1.0, x + 1.0, 0, 0, 0.095, 0.300, 0.016, 0.008, 0.010)); });
  el('BR1', 'IfcBeam', nmL, 'Steel', angleBrace(start(0.5, 0), u, e, L, ZREF, 0));                    // the cap meets the web face on the centre line: generated (web T)
  el('BR2', 'IfcBeam', nmL, 'Steel', angleBrace(start(2.5, 0), u, e, L, ZREF, 0));                    // the same, with an obstacle in the plate and bolt-head zone: refused for clash
  el('OBST', 'IfcBuildingElementProxy', 'Obstacle', 'Aluminium', boxTris([2.4513, -0.0527, 0.182], [2.4713, -0.0327, 0.200]));
  el('BR3', 'IfcBeam', nmL, 'Steel', angleBrace(start(4.0, 0.040), u, e, L, ZREF, 0));                // the cap stops 40 mm short of the contact: no room for the first bolt edge distance
  el('BR4', 'IfcBeam', nmL, 'Steel', angleBrace(start(5.5, 0), u, e, L, ZREF, Math.PI / 4));          // both legs 45 deg off the plane: ambiguous gusset plane
  return db;
}

// ---- the parts as the Modeller stores them: float32 vertices relative to the op's centre + the centre (what a reload reads); this is what CLEAR_POST re-checks
function written(parts, meta) {
  var b = Ops.build(parts, 'gussets', meta);
  return b.ops.map(function (o, i) {
    var v = b.assets[i].v, P = o.params, halfZ = (P.bbox[5] - P.bbox[4]) / 2, c = [P.placement.x, P.placement.y, P.placement.z + halfZ], W = new Float64Array(v.length);
    for (var k = 0; k < v.length; k += 3) { W[k] = v[k] + c[0]; W[k + 1] = v[k + 1] + c[1]; W[k + 2] = v[k + 2] + c[2]; }
    return { guid: parts[i].guid, beam: parts[i].beam, support: parts[i].support, kind: parts[i].kind, atype: parts[i].atype, tris: W };
  });
}
var ruleSnap = function (R) { return JSON.stringify(Object.keys(R).sort().map(function (k) { return [k, R[k].value, R[k].source]; })); };
var tail = function (n) { return String(n).replace(/:\d+$/, '').split(':').pop(); };

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var REAL = !!(SRC && ORA && ODIR), srcDb, oraDb = null, oResult = null, oLog = '';
  if (REAL) {
    srcDb = new SQL.Database(new Uint8Array(fs.readFileSync(SRC))); oraDb = new SQL.Database(new Uint8Array(fs.readFileSync(ORA)));
    oResult = JSON.parse(fs.readFileSync(ORA + '.result.json', 'utf8'));
    try { oLog = fs.readFileSync(path.join(ODIR, 'log', 'gus_run1.log'), 'utf8'); } catch (e) { oLog = ''; }
  } else srcDb = synthetic(SQL);
  console.log('§LODUP_MODE pack=gussets source=' + (REAL ? 'LODUP_SRC_DB (real)' : 'SYNTHETIC fixture (LODUP_SRC_DB / LODUP_ORACLE_DB / LODUP_ORACLE_DIR unset)') + ' oracle=' + (REAL ? 'LODUP_ORACLE_DB + its .result.json + LODUP_ORACLE_DIR/log' : 'none') + ' break=' + (MAIN_BREAK ? 1 : 0));
  var inp = Reader.fromDb(srcDb); inp.callouts = [];
  var RULES = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/gusset_defaults.json'), 'utf8'))), RC = Rules.counts(RULES);
  console.log('§LODUP_RULES pack=gussets rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' unset=' + RC.unset);
  var run = function (rows, o) { return Pack.run(inp, rows, Object.assign({ log: function (l) { console.log(l); }, trace: process.env.LODUP_TRACE ? function (l) { console.log(l); } : undefined }, o || {})); };
  var R = run(RULES, { noClash: MAIN_BREAK }), parts = R.parts, A = R.audit, applies = Pack.appliesTo(inp, RULES);
  verdict('NONVACUOUS', parts.length ? true : (applies ? false : null), 'applies_to=' + applies + ' parts=' + parts.length + ' joints=' + R.stats.joints + ' ends=' + R.stats.ends + ' added_verts=' + R.stats.addedVerts + (parts.length ? '' : ' (nothing judged)'));
  var mine = {}; parts.forEach(function (p) { mine[p.guid] = p; });
  var resBy = {}; A.results.forEach(function (r) { resBy[r.guid + '|' + r.end] = r; });

  if (!REAL) {   // ---- SYNTH_TRUTH: hand-derived expectations
    var cat = function (g) { var r = A.results.filter(function (x) { return x.guid === g; })[0]; return r ? r.result : '-'; };
    var a = A.generated[0] || {}, ids = parts.map(function (p) { return p.guid; }).sort().join(), ob = A.results.filter(function (r) { return r.result === 'REFUSED_CLASH'; });
    var truth = cat('BR1') === 'GENERATED' && cat('BR2') === 'REFUSED_CLASH' && cat('BR3') === 'NO_ROOM' && cat('BR4') === 'AMBIGUOUS_PLANE';
    var vals = a.atype === 'web T' && a.n_bolts === SYNTH.n_bolts && a.tg === SYNTH.tg && Math.abs(a.plate_W - SYNTH.plate_W) < 0.01 && Math.abs(a.plate_L - SYNTH.plate_L) < 0.01 && a.weld_mm === SYNTH.weld && Math.abs(a.t_sup - SYNTH.t_sup) < 0.01 && Math.abs(a.ecc - SYNTH.ecc) < 0.05 && a.filler === 0;
    var hitsObst = ob.length === 1 && ob[0].hit_guids.indexOf('OBST') >= 0;
    verdict('SYNTH_TRUTH', truth && vals && hitsObst && R.stats.addedVerts === SYNTH.addedVerts && parts.length === SYNTH.parts && ids === 'GEN-GU-BR1-A-BT,GEN-GU-BR1-A-PL,GEN-GU-BR1-A-WD'.replace(/BR1-A/g, 'BR1-' + (resBy['BR1|1'] ? 'B' : 'A')) && R.stats.refused === SYNTH.refused,
      'BR1 ' + cat('BR1') + ' (atype=' + a.atype + ' bolts=' + a.n_bolts + ' t=' + a.tg + ' plate ' + (a.plate_W && a.plate_W.toFixed(2)) + ' x ' + (a.plate_L && a.plate_L.toFixed(3)) + ' weld=' + a.weld_mm + ' wall=' + (a.t_sup && a.t_sup.toFixed(2)) + ' ecc=' + (a.ecc && a.ecc.toFixed(3)) + ') BR2 ' + cat('BR2') + ' (hits the obstacle=' + hitsObst + ') BR3 ' + cat('BR3') + ' BR4 ' + cat('BR4') + ' reasons=' + JSON.stringify(A.results.map(function (r) { return [r.guid, r.why || '']; })) + ' addedVerts=' + R.stats.addedVerts + ' refused_rows=' + R.stats.refused +
      ' (hand-derived: web T, 2 bolts, 10 x 70 x 179.497 mm plate = 35 + 35/cos45 + 95, 5 mm weld for the 8 mm web, eccentricity 150.0 = the centroid height of the angle above the support axis by construction, 1308 vertices = 1224 bolts + 36 plate + 48 welds)');
    verdict('PARITY', null, 'no oracle (synthetic fixture): survey / ids / reasons / vertices / eccentricity / change rows not compared');
  } else {
    // ---- PARITY_SURVEY: the oracle's 57 judged ends, matched by guid + nearest end point
    var near = function (r) { var best = null; oResult.forEach(function (o) { if (o.guid !== r.guid) return; var d = Math.hypot(o.end_point[0] - r.end_point[0], o.end_point[1] - r.end_point[1], o.end_point[2] - r.end_point[2]); if (!best || d < best.d) best = { d: d, o: o }; }); return best; };
    var matched = 0, maxEp = 0, sDiff = [], sameLetter = 0;
    A.ends.forEach(function (r) { var m = near(r); if (!m) { sDiff.push([r.guid, 'no oracle end']); return; } matched++; maxEp = Math.max(maxEp, m.d); if (m.o.end === r.end) sameLetter++; if (m.o.support !== r.support || m.o.cls !== 'STEEL_SKEW') sDiff.push([r.guid, r.end, m.o.support, r.support]); });
    verdict('PARITY_SURVEY', oResult.length > 0 && A.ends.length === oResult.length && matched === oResult.length && !sDiff.length, 'oracle_judged=' + oResult.length + ' js_judged=' + A.ends.length + ' matched_by_end_point=' + matched + ' max_end_point_delta_m=' + maxEp.toExponential(1) + ' end_letter_same=' + sameLetter + ' support_or_class_differs=' + sDiff.length + (sDiff[0] ? ' first=' + JSON.stringify(sDiff[0]) : ''));
    // ---- PARITY_GENERATED / REFUSED
    var oraIds = q(oraDb, "SELECT guid FROM elements_meta WHERE guid LIKE 'GEN-GU-%' ORDER BY guid").map(function (v) { return v[0]; }), mIds = Object.keys(mine).sort(), oGenN = oResult.filter(function (o) { return o.result === 'GENERATED'; }).length;
    var onlyO = oraIds.filter(function (g) { return !mine[g]; }), onlyM = mIds.filter(function (g) { return oraIds.indexOf(g) < 0; });
    verdict('PARITY_GENERATED', oraIds.length > 0 && !onlyO.length && !onlyM.length && A.generated.length === oGenN, 'oracle_parts=' + oraIds.length + ' js_parts=' + mIds.length + ' only_in_oracle=' + onlyO.length + ' only_in_js=' + onlyM.length + ' js_joints=' + A.generated.length + ' oracle_joints=' + oGenN + (onlyO[0] ? ' first_only_oracle=' + onlyO[0] : '') + (onlyM[0] ? ' first_only_js=' + onlyM[0] : ''));
    var catPairs = {}, flipped = [], whyBad = [], clashMiss = [], clashN = 0, firstSame = 0;
    A.ends.forEach(function (r) {
      var m = near(r); if (!m) return; var o = m.o, jr = resBy[r.guid + '|' + r.end], jc = jr ? jr.result : '-'; catPairs[o.result + '>' + jc] = (catPairs[o.result + '>' + jc] || 0) + 1;
      if (o.result !== jc) flipped.push((r.guid + '/' + (r.end > 0 ? 'B' : 'A')) + ' oracle=' + o.result + ' js=' + jc + (jr && jr.why ? ' (' + jr.why + ')' : '') + ' ecc=' + (jr && jr.ecc !== undefined ? jr.ecc.toFixed(2) : '-'));
      if (o.why && jr && jr.why && o.why !== jr.why) whyBad.push([r.guid.slice(0, 8), o.why.slice(0, 60), jr.why.slice(0, 60)]);
      if (o.result === 'REFUSED_CLASH' && jr && jr.result === 'REFUSED_CLASH') { clashN++; var want = o.clash.map(function (c) { return c[1]; }); if (want.some(function (g) { return jr.hit_guids.indexOf(g) < 0; })) clashMiss.push([r.guid, want]); if (jr.clash[0][1] === o.clash[0][1]) firstSame++; }
    });
    var reasonOracle = {}; var mm0 = /refused=(\{[^}]*\})/.exec(oLog.split('\n').filter(function (l) { return /^§GUS_COUNTS/.test(l); })[0] || ''); if (mm0) mm0[1].replace(/'([A-Z_]+)': (\d+)/g, function (_, k, n) { reasonOracle[k] = +n; });
    var rBad = Object.keys(reasonOracle).filter(function (k) { return (A.reasons[k] || 0) !== reasonOracle[k]; }), extraJs = Object.keys(A.reasons).filter(function (k) { return k !== 'generated' && !(k in reasonOracle); });
    verdict('PARITY_REFUSED', !flipped.length && !clashMiss.length && !rBad.length && !extraJs.length && Object.keys(reasonOracle).length > 0, 'ends_by_category(oracle>js)=' + JSON.stringify(catPairs) + ' flipped_decisions=' + flipped.length + ' oracle_neighbours_missing_in_js=' + clashMiss.length + ' first_hit_same=' + firstSame + '/' + clashN + ' reasons_oracle=' + JSON.stringify(reasonOracle) + ' reasons_js=' + JSON.stringify(A.reasons) + ' differing_reason_counts=' + (rBad.length + extraJs.length) + ' reason_text_differs=' + whyBad.length + (whyBad[0] ? ' first_text=' + JSON.stringify(whyBad[0]) : '') + (flipped.length ? ' FLIPPED: ' + flipped.join('; ') : ' (flipped decisions: none; nothing was tuned)'));
    // ---- PARITY_ECCENT
    var eBad = [], eN = 0, eMax = 0;
    A.results.forEach(function (r) { var m = near(r); if (!m || m.o.ecc === undefined || r.ecc === undefined) return; eN++; var d = Math.abs(m.o.ecc - r.ecc); if (d > eMax) eMax = d; if (d > 0.1) eBad.push([r.guid, m.o.ecc, r.ecc]); });
    var eOracleMissing = oResult.filter(function (o) { return o.ecc === undefined; }).length;
    verdict('PARITY_ECCENT', eN > 0 && !eBad.length, 'ends_compared=' + eN + ' (oracle rows without an eccentricity: ' + eOracleMissing + ') max_delta_mm=' + eMax.toExponential(2) + ' tolerance=0.1 mm differing=' + eBad.length + (eBad[0] ? ' first=' + JSON.stringify(eBad[0]) : ''));
    // ---- PARITY_CHANGELIST
    var oraEl = {}; q(oraDb, "SELECT guid, ifc_class, element_name FROM elements_meta WHERE guid LIKE 'GEN-GU-%'").forEach(function (v) { oraEl[v[0]] = [v[1], v[2]]; });
    var oraCh = {}; q(oraDb, "SELECT change, guid, detail FROM upgrade_changes WHERE guid LIKE 'GEN-GU-%'").forEach(function (v) { oraCh[v[1]] = v[2]; });
    var addedRows = R.changes.filter(function (c) { return c.kind === 'ADDED'; }), refRows = R.changes.filter(function (c) { return c.kind === 'REFUSED'; }), chBad = [], detBad = 0;
    addedRows.forEach(function (c) { var o = oraEl[c.guid]; if (!o || o[0] !== c.cls || o[1] !== mine[c.guid].name) chBad.push([c.guid, o ? [o[0], o[1].slice(0, 60)] : null, [c.cls, mine[c.guid].name.slice(0, 60)]]); if (oraCh[c.guid] !== c.detail) detBad++; });
    var refEnds = A.ends.length - A.generated.length, oRef = {}; q(oraDb, "SELECT host_guid, detail FROM upgrade_changes WHERE change = 'REFUSED' AND rule = 'Gusset connection'").forEach(function (v) { (oRef[v[0]] = oRef[v[0]] || []).push(v[1]); });
    var refReasonBad = refRows.filter(function (c) { return !(/ \| [A-Z_]+/.test(c.detail)) || c.host !== c.guid; }).length;
    verdict('PARITY_CHANGELIST', oraIds.length > 0 && addedRows.length === oraIds.length && !chBad.length && detBad === 0 && refRows.length === refEnds && !refReasonBad, 'oracle_elements=' + oraIds.length + ' js_ADDED=' + addedRows.length + ' name_or_class_mismatch=' + chBad.length + ' detail_text_differs=' + detBad + ' js_REFUSED=' + refRows.length + ' refused_ends_expected=' + refEnds + ' (one per refused end, host = the brace, the reason code in the detail; the oracle writes its refusal detail as a Python dict, so only the reason code and the host are compared)' + (chBad[0] ? ' first=' + JSON.stringify(chBad[0]) : ''));
    // ---- PARITY_VERTICES
    var ora = {}; q(oraDb, "SELECT i.guid, c.vertices, t.center_x, t.center_y, t.center_z FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) WHERE i.guid LIKE 'GEN-GU-%' ORDER BY i.guid")
      .forEach(function (v) { var b = v[1], f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), W = new Float64Array(f.length); for (var i = 0; i < f.length; i += 3) { W[i] = f[i] + v[2]; W[i + 1] = f[i + 1] + v[3]; W[i + 2] = f[i + 2] + v[4]; } ora[v[0]] = W; });
    var vcBad = 0, maxD = 0, nVert = 0, off = [];
    mIds.forEach(function (g) { if (!ora[g]) return; var a2 = mine[g].tris, b2 = ora[g]; if (a2.length !== b2.length) { vcBad++; return; } nVert += a2.length / 3; var d = 0; for (var i = 0; i < a2.length; i++) { var dd = Math.abs(a2[i] - b2[i]); if (dd > d) d = dd; } if (d > maxD) maxD = d; if (d > VTOL) off.push(g + ' delta_mm=' + (d * 1000).toFixed(4)); });
    verdict('PARITY_VERTICES', vcBad === 0 && nVert > 0 && !off.length, 'parts_compared=' + mIds.filter(function (g) { return ora[g]; }).length + ' vertices_compared=' + nVert + ' vertex_count_mismatch_parts=' + vcBad + ' max_world_delta_mm=' + (maxD * 1000).toFixed(6) + ' tolerance=0.01 mm | parts outside tolerance: ' + (off.length ? off.join('; ') : 'none'));
    var valBad = []; A.generated.forEach(function (j) { var m = near(j), o = m && m.o; if (!o) { valBad.push([j.guid, 'no oracle']); return; }
      if (o.atype !== j.atype) valBad.push([j.guid, 'atype', o.atype, j.atype]);
      [['n_bolts', 0], ['tg', 0], ['weld_mm', 0], ['plate_W', 0.01], ['plate_L', 0.01], ['t_leg', 0.006], ['t_sup', 0.051], ['filler', 0.006], ['overlap', 0.006], ['gap', 0.006], ['contact_gap', 0.006], ['lap', 0.06], ['leg_len', 0.06]].forEach(function (kv) { if (Math.abs(o[kv[0]] - j[kv[0]]) > kv[1]) valBad.push([j.guid, kv[0], o[kv[0]], j[kv[0]]]); });
      if (Math.abs(o.measured.pitch - j.measured.pitch) > 0.011 || Math.abs(o.measured.plate_t - j.measured.plate_t) > 0.011) valBad.push([j.guid, 'measured pitch / plate_t']);
      ['e_pl', 'e_toe'].forEach(function (k) { o.measured[k].forEach(function (x, i) { if (Math.abs(x - j.measured[k][i]) > 0.11) valBad.push([j.guid, 'measured.' + k, x, j.measured[k][i]]); }); });
      o.measured.welds.forEach(function (x, i) { if (Math.abs(x - j.measured.welds[i]) > 0.011) valBad.push([j.guid, 'weld leg', x, j.measured.welds[i]]); });
      if (Object.keys(j.checks).some(function (k) { return !j.checks[k]; })) valBad.push([j.guid, 'a clause check failed']); if (o.neighbours_tested !== j.nb) valBad.push([j.guid, 'neighbours_tested', o.neighbours_tested, j.nb]); });
    verdict('PARITY_VALUES', A.generated.length > 0 && !valBad.length, 'joints=' + A.generated.length + ' differing_values=' + valBad.length + ' (attachment, bolts, thickness, weld exact; plate size 0.01 mm; leg thickness / filler / gap / contact gap 0.006 mm; wall 0.051 mm (the oracle rounds to 0.1); measured pitch / plate_t 0.011, edge distances 0.11 mm (rounded to 0.1)) clause_failures=' + A.ruleFail.length + ' neighbours_tested=' + A.generated.map(function (x) { return x.nb; }).join(',') + (valBad[0] ? ' first=' + JSON.stringify(valBad[0]) : ''));
  }

  // ---- CLEAR_POST on the parts REBUILT FROM THE OP-LOG ROWS
  var wr = written(parts, inp.meta), cp = parts.length ? Pack.clearPost(inp, RULES, wr, function () { }) : null;
  var cpv = verdict('CLEAR_POST', parts.length ? cp.fails.length === 0 : null, 'parts_checked=' + (cp ? cp.checked : 0) + ' failures=' + (cp ? cp.fails.length : 0) + ' (the stored float32 vertices + centre, every neighbour of every part, the clash check ' + (MAIN_BREAK ? 'OFF' : 'on') + '; skipped as too large: ' + (cp ? cp.skipped.length : 0) + ')' + (cp && cp.fails[0] ? ' first=' + JSON.stringify(cp.fails[0]) : ''));
  // ---- CLAUSES re-read on the written result, independent of the generator's own variables
  var clBad = [], clN = 0;
  A.generated.forEach(function (j) {
    var base = 'GEN-GU-' + j.guid + '-' + (j.end > 0 ? 'B' : 'A'), bt = wr.filter(function (w) { return w.guid === base + '-BT'; })[0], pl = wr.filter(function (w) { return w.guid === base + '-PL'; })[0]; if (!bt || !pl) { clBad.push([base, 'part missing']); return; } clN++;
    var m = /^(\d+) x M20 bolt/.exec(mine[base + '-BT'].name), nb = m ? +m[1] : -1, perBolt = bt.tris.length / 3 / nb;   // 5 prisms: 16-gon x2 (180 each), hexagon x2 (60), 12-gon (132) -> 612 vertices
    if (nb !== j.n_bolts || perBolt !== 612) clBad.push([base, 'bolt count/vertices', nb, perBolt]);
    var Pp = pl.tris, ns = []; for (var t = 0; t + 8 < Pp.length; t += 9) { var e1 = [Pp[t + 3] - Pp[t], Pp[t + 4] - Pp[t + 1], Pp[t + 5] - Pp[t + 2]], e2 = [Pp[t + 6] - Pp[t], Pp[t + 7] - Pp[t + 1], Pp[t + 8] - Pp[t + 2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], L = Math.hypot(n[0], n[1], n[2]); ns.push({ n: [n[0] / L, n[1] / L, n[2] / L], a: L, p: [Pp[t], Pp[t + 1], Pp[t + 2]] }); }
    var big = ns.slice().sort(function (x, y) { return y.a - x.a; })[0], th = 0; ns.forEach(function (s) { var dp = Math.abs((s.p[0] - big.p[0]) * big.n[0] + (s.p[1] - big.p[1]) * big.n[1] + (s.p[2] - big.p[2]) * big.n[2]); if (dp > th) th = dp; });
    if (Math.abs(th * 1000 - j.tg) > 0.05) clBad.push([base, 'plate thickness mm', th * 1000, j.tg]);
  });
  verdict('CLAUSES', clN ? !clBad.length : null, 'joints_rechecked=' + clN + ' mismatches=' + clBad.length + ' (bolt count vs the part name and 612 vertices per bolt; plate thickness from the stored plate faces = max(leg, 10 mm row); the 14 AISC 360-16 clauses are the pack\'s measured §LODUP_GUSSET_RULES, compared in PARITY_VALUES)' + (clBad[0] ? ' first=' + JSON.stringify(clBad[0]) : ''));

  // ---- CENTRE (through the same function the pill uses to write ops)
  var built = Ops.build(parts, 'gussets', inp.meta), cBad = 0, maxC = 0, attBad = 0, partsOfBad = 0;
  built.ops.forEach(function (o, i) {
    var P = o.params, W = parts[i].tris, bb = bboxOf(W), halfZ = (bb[1][2] - bb[0][2]) / 2, cen = [P.placement.x, P.placement.y, P.placement.z + halfZ], bc = [0, 1, 2].map(function (a) { return (bb[0][a] + bb[1][a]) / 2; });
    var d = Math.max(Math.abs(cen[0] - bc[0]), Math.abs(cen[1] - bc[1]), Math.abs(cen[2] - bc[2])); if (d > maxC) maxC = d; if (d > 1e-6) cBad++;
    if (P.provenance !== 'generated:gussets' || o.op_type !== 'GEOM_INSERT' || !/capacity not checked/.test(P.note) || !/capacity not checked/.test(P.name)) cBad++;
    if (!P.attached_to || P.attached_to.join() !== parts[i].attach.join() || P.attached_to.length !== 1) attBad++;
    if (P.parts_of !== undefined) partsOfBad++;
  });
  verdict('CENTRE', built.ops.length ? (cBad === 0 && attBad === 0 && partsOfBad === 0 && built.elementParts.length === 0) : null, 'ops=' + built.ops.length + ' centre_not_own_bbox_centre=' + cBad + ' max_delta_m=' + maxC.toExponential(2) + ' attached_to_wrong=' + attBad + ' ops_with_parts_of=' + partsOfBad + ' element_parts_rows=' + built.elementParts.length + ' (provenance generated:gussets, the name and the op note say "configuration only, capacity not checked", attached_to = the brace, no element_parts row so the brace stays drawn)');

  // ---- RULES: edited rows change the result; a stated row beats a default edit; the shared rows equal the joints pack's; every row has a source
  var t1 = Rules.merge(RULES, { bolt_pitch_mm: { value: 70, source: 'stated: test edit' }, gusset_min_thickness_mm: { value: 12, source: 'stated: test edit' } }), t2 = Rules.merge(t1.rows, { bolt_pitch_mm: { value: 60, source: 'default: attempt' } });
  var R2 = parts.length ? Pack.run(inp, t1.rows, { log: function () { }, noClash: MAIN_BREAK }) : null;
  var pitchTxt = R2 && R2.parts.length ? /pitch 70/.test(R2.parts.filter(function (p) { return p.kind === 'BT'; })[0].name) : null, plTxt = R2 && R2.parts.length ? /Gusset plate 12 x/.test(R2.parts.filter(function (p) { return p.kind === 'PL'; })[0].name) : null;
  var noSrc = Object.keys(RULES).filter(function (k) { return !/^(default|stated|unset)/.test(String(RULES[k].source)); });
  var JR = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/joint_defaults.json'), 'utf8'))), shared = Object.keys(RULES).filter(function (k) { return k in JR; }), sharedBad = shared.filter(function (k) { return JSON.stringify(RULES[k]) !== JSON.stringify(JR[k]); });
  var gus12 = ['plane_tol_deg', 'gauge_fraction_of_leg', 'gusset_min_thickness_mm', 'lap_min_mm', 'lap_t_factor', 'filler_max_mm', 'filler_flag_mm', 'flange_interval_max_fraction', 'contact_tol_mm', 'planar_tol_mm', 'overlap_with_leg_max', 'parity_max_triangles'].filter(function (k) { return !(k in RULES); });
  verdict('RULES', R2 ? (pitchTxt && plTxt && t2.refused.length === 1 && t2.rows.bolt_pitch_mm.value === 70 && noSrc.length === 0 && !sharedBad.length && !gus12.length) : null, 'edited pitch 60 -> 70 and gusset thickness 10 -> 12: bolt name has pitch 70=' + pitchTxt + ' plate name has 12=' + plTxt + '; a default edit over the stated row refused=' + t2.refused.length + ' rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' rows_without_source_kind=' + noSrc.length + ' shared_rows_with_joint_defaults=' + shared.length + ' differing=' + sharedBad.length + ' oracle_gusset_rows_missing=' + gus12.length);

  // ---- GATE: only steel members are judged: relabel every member's material -> nothing judged (INCONCLUSIVE, not PASS)
  (function () {
    var meta2 = {}; Object.keys(inp.meta).forEach(function (g) { meta2[g] = Object.assign({}, inp.meta[g]); if (meta2[g].cls === 'IfcBeam' || meta2[g].cls === 'IfcMember') { meta2[g].mat = 'Concrete - Precast'; meta2[g].layerMats = null; } });
    var inp2 = Object.assign({}, inp, { meta: meta2, src: {} }), lg = [], r3 = Pack.run(inp2, RULES, { log: function (l) { lg.push(l); } }), applies2 = Pack.appliesTo(inp2, RULES);
    verdict('GATE', R.stats.ends ? (r3.stats.ends === 0 && applies2 === 0 && lg.join('\n').indexOf('nothing left to judge') >= 0 && /INCONCLUSIVE/.test(lg.join('\n'))) : null, 'steel members: judged ends=' + R.stats.ends + ' | every beam/member relabelled concrete: judged=' + r3.stats.ends + ' applies_to=' + applies2 + ' ("nothing left to judge" and INCONCLUSIVE logged=' + (lg.join('\n').indexOf('nothing left to judge') >= 0) + ')');
  })();

  // ---- DETERMINISM: two runs, same op hash
  function opHash(rr) { var b = Ops.build(rr.parts, 'gussets', inp.meta), h = crypto.createHash('sha256'); h.update(JSON.stringify(b.ops)); b.assets.forEach(function (a) { h.update(Buffer.from(a.v.buffer)); }); h.update(JSON.stringify(b.elementParts)); h.update(JSON.stringify(rr.changes)); return h.digest('hex'); }
  var h1 = opHash(R), h2 = opHash(run(RULES, { noClash: MAIN_BREAK }));
  verdict('DETERMINISM', parts.length ? h1 === h2 : null, 'run1=' + h1.slice(0, 16) + ' run2=' + h2.slice(0, 16));

  // ---- BREAK: the clash check switched off; the same re-check on the written result must FAIL (a clash check that cannot fail is not a check)
  if (!MAIN_BREAK) {
    var RB = Pack.run(inp, RULES, { noClash: true, log: function () { } }), wb = written(RB.parts, inp.meta), cb = RB.parts.length ? Pack.clearPost(inp, RULES, wb, function () { }) : null;
    var bkWord = !cb ? 'INCONCLUSIVE' : (cb.fails.length ? 'FAIL' : 'PASS');
    verdict('BREAK_CHECK', bkWord === 'FAIL', 'switch=on (clash check off: ' + RB.stats.joints + ' joints written instead of ' + R.stats.joints + ') expected CLEAR_POST=FAIL got CLEAR_POST=' + bkWord + ' (parts_checked=' + (cb ? cb.checked : 0) + ' failures=' + (cb ? cb.fails.length : 0) + (cb && cb.fails[0] ? ' first=' + JSON.stringify(cb.fails[0]) : '') + ')');
  } else console.log('§LODUP_BREAK_CHECK main run is the broken run: CLEAR_POST=' + cpv + ' (expected FAIL) -> ' + (cpv === 'FAIL' ? 'PASS' : 'FAIL'));

  // ---- change list text
  var txt = Ops.changeText(R.changes, { model: 'witness', pack: 'gussets', rules: RC }), dl = txt.split('\n').filter(function (l) { return /^\d+ \| /.test(l); }).length;
  verdict('CHANGELIST_TXT', R.changes.length ? dl === R.changes.length : null, 'data_lines=' + dl + ' rows=' + R.changes.length + ' wording_line=' + /capacity not checked/.test(txt));

  // ---- REGISTRY: the chooser lists the packs with no dialog change; lod_ui.js is the P3 file, byte for byte
  var uiSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'lod/lod_ui.js'))).digest('hex'), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/packs.json'), 'utf8'));
  var manIds = man.packs.map(function (p) { return p.id; }), filesOk = man.packs.every(function (p) { return fs.existsSync(path.join(ROOT, 'lod', p.file)); });
  Registry.clear(); [Rebar, Weld, Layer, Joint, Pack].forEach(function (p) { Registry.register(p); });
  var rowsOf = function (id) { return id === 'gussets' ? RULES : !Registry.get(id).rulesFile ? {} : Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod', Registry.get(id).rulesFile), 'utf8'))); };
  var ruleFilesOk = Registry.list().every(function (p) { return !p.rulesFile || fs.existsSync(path.join(ROOT, 'lod', p.rulesFile)); }), d1 = Registry.describe(inp, rowsOf, Rules);
  Registry.register({ id: 'dummy', label: 'Dummy (test pack)', appliesTo: function () { return 0; }, run: function () { return { parts: [], changes: [] }; } });
  var d2 = Registry.describe(inp, rowsOf, Rules), gRow = d1.filter(function (x) { return x.id === 'gussets'; })[0];
  verdict('REGISTRY', d1.map(function (x) { return x.id; }).join() === 'rebar,welds,layers,joints,gussets' && manIds.slice(0, 5).join() === 'rebar,welds,layers,joints,gussets' && filesOk && ruleFilesOk && gRow && gRow.label === 'Bracing gussets' && gRow.appliesTo === applies && gRow.stated === RC.stated && gRow.default === RC.default && d2.length === d1.length + 1 && uiSha === P1_LOD_UI_SHA,
    'listed=' + d1.map(function (x) { return x.id + ':"' + x.label + '"(' + x.appliesTo + ')'; }).join(',') + ' packs.json=' + manIds.join() + ' pack_files_exist=' + filesOk + ' rules_files_exist=' + ruleFilesOk + ' gussets_applies_to=' + (gRow && gRow.appliesTo) + ' after_one_more=' + d2.length + ' lod_ui_js_is_the_P3_file=' + (uiSha === P1_LOD_UI_SHA) + ' (the dialog renders exactly describe(); no UI code changed)');

  // ---- cost (PERF BUDGET)
  var srcVerts = 0; try { srcVerts = q(srcDb, 'SELECT SUM(length(c.vertices) / 12) FROM element_instances i JOIN component_geometries c USING(geometry_hash)')[0][0] || 0; } catch (e) { srcVerts = 0; }
  console.log('§LODUP_COST pack=gussets addedVerts=' + R.stats.addedVerts + ' modelVerts=' + srcVerts + ' addedPct=' + (srcVerts ? (100 * R.stats.addedVerts / srcVerts).toFixed(3) : '-') + ' heapMB=' + (R.stats.addedVerts * 170 / 1e6).toFixed(2) + ' (0.17 GB per M vertices) warnOver1M=' + (R.stats.addedVerts > 1e6) + ' ms=' + R.stats.ms);
  console.log('§LODUP_SUMMARY pack=gussets failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + (INCONC.length ? INCONC.join(',') : 'none') + ' mode=' + (REAL ? 'real' : 'synthetic') + ' break=' + (MAIN_BREAK ? 1 : 0));
  process.exit(MAIN_BREAK ? (cpv === 'FAIL' ? 0 : 1) : FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_CRASH ' + (e && e.stack || e)); process.exit(2); });
