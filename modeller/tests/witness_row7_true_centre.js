#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROW7-TRUE-CENTRE: the STR walker bridge reads TRUE mesh centres (MODELLER_MASTER row 7).
 * Pure node — sql.js + the REAL production modules (cross_edges.js → real_geometry.js, str_walker_bridge.js →
 * str_walker.js). No browser, no network. Fixture: modeller/Terminal_arcstr_proof.db (gitignored, .gitignore:49).
 *
 * THE DEFECT (re-measured in #1753, W-ROW7-GRID-BASELINE): str_walker_bridge.js read element_transforms.center_x/y/z,
 * which is the IFC placement ANCHOR, not the volumetric centre. The offset varies per column (p50 19.7 mm, p90 148.1 mm,
 * max 225.6 mm in plan; up to 3.944 m in z), so the emergent grid and its residual were measured on the wrong points:
 * 0.0939 m reported, 0.1039 m true. red1's decision (2026-09-26): chase the TRUE number. §ROW7-TRUE-CENTRE reads the
 * centre from cross_edges.js's own §REAL-AABB box reader (the renderer-parity path #1744 wired) — never re-derived.
 *
 * Each claim names the issue it proves or disproves:
 *   T0 INSTRUMENT     — CrossEdges.readBoxes' real box centre == an INDEPENDENT decode (sqlite3 CLI + hex, anchor +
 *                       raw-blob AABB centre; rotation is 0 on every column here) on 158/158, ≤ 1 mm. If this fails the
 *                       reader is wrong and nothing below may be believed.
 *   T1 BRIDGE-FIRES   — swbInit(db) on the fixture: centres=mesh:158 anchor:0, grid 18×10, colRMS 0.1039 ± 2 mm. The
 *                       honest number is now what ships through the bridge; the flattered 0.0939 is gone from this path.
 *   T2 FALLBACK-LOUD  — the same db with its geometry table dropped: centres=mesh:0 anchor:158, colRMS 0.0939. The
 *                       anchor path is today's behaviour, kept for substrates with no blob, and COUNTED — never silent.
 *   T3 RENDER-Z       — swbRenderOps() column boxes are centred on the real mesh z for 158/158 (issue: the orange
 *                       skeleton column was centred on the anchor z — 63 columns off, max 3.944 m).
 *   T4 TOPOLOGY-HELD  — 18×10, 108 girders, and NO column changes its (xLine,yLine) membership anchor→true. The line
 *                       VALUES move (≤ 153 mm) — that movement IS the correction, not a topology change.
 *   T5 LINE-ON-BEAMS  — Step B's finding, pinned both ways. On the shipped 'mean' fit the two facade lines sit at
 *                       −40.050 / −0.318, i.e. 107 / 161 mm off the line every facade IfcBeam actually occupies
 *                       (34 south at −40.157, 33 north at −0.157, none elsewhere within 1 m). The opt-in
 *                       lineFit:'median' lands both lines ON the beam line (≤ 1 mm) and makes 131/158 columns exact,
 *                       while the headline RMS RISES to 0.1323 (the mean is the least-squares optimum by
 *                       construction). Both numbers are asserted so the decision is reproducible, not argued.
 */
'use strict';
var fs = require('fs'), path = require('path');
var { execSync } = require('child_process');

global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));       // → window.CrossEdges (readBoxes)
var SW = require(path.join(ROOT, 'str_walker.js'));
var Bridge = require(path.join(ROOT, 'str_walker_bridge.js'));    // requires str_walker.js + walker_confidence.js itself
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DB = path.join(ROOT, 'Terminal_arcstr_proof.db');

var EXPECT_ANCHOR = 0.0939, EXPECT_TRUE = 0.1039, EXPECT_MEDIAN = 0.1323, TOL = 0.002;
var BEAM_S = -40.157, BEAM_N = -0.157;   // the facade lines the beams occupy (measured, see T5)

var pass = 0, fail = 0;
function chk(name, ok, detail) { console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + '  ' + (detail || '')); ok ? pass++ : fail++; }
function rms(a) { return Math.sqrt(a.reduce(function (s, r) { return s + r * r; }, 0) / (a.length || 1)); }
function q(sql) { return execSync('sqlite3 -separator \'|\' "' + DB + '" "' + sql + '"', { maxBuffer: 1 << 28 }).toString().trim().split('\n').filter(Boolean); }

console.log('═══ W-ROW7-TRUE-CENTRE — the STR walker bridge reads TRUE mesh centres (pure node, real modules) ═══');
var sz = 0; try { sz = fs.statSync(DB).size; } catch (e) { sz = 0; }
if (sz < 1024) {
  console.log('  ⚠ INCONCLUSIVE — substrate absent: ' + DB + ' is ' + sz + ' bytes (gitignored; copy it from the main checkout).');
  console.log('W-ROW7-TRUE-CENTRE: INCONCLUSIVE (0 judged) — NOT a pass');
  process.exit(2);
}

// ── independent decode (no sql.js, no RealGeometry): anchor + raw blob AABB centre ──
var anchors = {}; q("SELECT m.guid,t.center_x,t.center_y,t.center_z,t.bbox_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'")
  .forEach(function (r) { var v = r.split('|'); anchors[v[0]] = { x: +v[1], y: +v[2], z: +v[3], bz: +v[4] }; });
var hashes = {}; q("SELECT guid,geometry_hash FROM element_instances").forEach(function (r) { var v = r.split('|'); hashes[v[0]] = v[1]; });
var geo = {};
execSync('sqlite3 "' + DB + '" "SELECT geometry_hash, hex(vertices) FROM component_geometries"', { maxBuffer: 1 << 30 })
  .toString().trim().split('\n').forEach(function (line) {
    var i = line.indexOf('|'); if (i < 0) return;
    var h = line.slice(0, i), hx = line.slice(i + 1); if (!hx) return;
    var buf = Buffer.from(hx, 'hex'), n = Math.floor(buf.length / 4);
    var f = new Float32Array(buf.buffer, buf.byteOffset, n);
    var mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
    for (var k = 0; k + 2 < f.length; k += 3) for (var a = 0; a < 3; a++) { var v = f[k + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    geo[h] = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  });
var indep = {}; Object.keys(anchors).forEach(function (g) { var c = geo[hashes[g]]; if (c) indep[g] = { x: anchors[g].x + c[0], y: anchors[g].y + c[1], z: anchors[g].z + c[2] }; });
var nCols = Object.keys(anchors).length;

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var bytes = fs.readFileSync(DB);
  var db = new SQL.Database(bytes);

  // T0 — instrument check FIRST
  var boxes = CrossEdges.readBoxes(db), byGuid = {}; boxes.forEach(function (b) { byGuid[b.guid] = b; });
  var agree = 0, resolvedReal = 0, worst = 0;
  Object.keys(anchors).forEach(function (g) {
    var b = byGuid[g], ic = indep[g]; if (!b || !b.real || !ic) return; resolvedReal++;
    var a = b.aabb, d = Math.max(Math.abs((a[0] + a[1]) / 2 - ic.x), Math.abs((a[2] + a[3]) / 2 - ic.y), Math.abs((a[4] + a[5]) / 2 - ic.z));
    worst = Math.max(worst, d); if (d <= 0.001) agree++;
  });
  chk('T0 INSTRUMENT (CrossEdges.readBoxes real centre == independent blob decode — believe nothing below if red)',
    nCols === 158 && resolvedReal === nCols && agree === nCols, 'columns=' + nCols + ' real=' + resolvedReal + ' agree=' + agree + ' worst=' + (worst * 1000).toFixed(3) + 'mm');
  if (agree !== nCols) { console.log('W-ROW7-TRUE-CENTRE: ' + pass + ' PASS / ' + (fail + 5) + ' FAIL (T0 red — remaining claims not judged)'); process.exit(1); }

  // T1 — the bridge itself, on the real path (geoDb defaults to db: single-file fixture)
  var st = Bridge.swbInit(db);
  var colRMS = rms(st.base.walked.map(function (w) { return w.residual; }));
  chk('T1 BRIDGE-FIRES (swbInit reads mesh centres: 158 mesh / 0 anchor, 18×10, colRMS == the honest 0.1039)',
    st.centres.mesh === 158 && st.centres.anchor === 0 && st.base.grid.xLines.length === 18 && st.base.grid.yLines.length === 10 && Math.abs(colRMS - EXPECT_TRUE) <= TOL,
    'centres=mesh:' + st.centres.mesh + ' anchor:' + st.centres.anchor + ' grid=' + st.base.grid.xLines.length + 'x' + st.base.grid.yLines.length + ' colRMS=' + colRMS.toFixed(4) + ' expected=' + EXPECT_TRUE);

  // T3 — rendered column boxes centred on the real mesh z (place() ground-seats bbox[4] at placement.z ⇒ centre = z + bz/2)
  var rr = Bridge.swbRenderOps();
  var zOk = 0, zWorst = 0, zN = 0, zOffAnchor = 0, zWorstAnchor = 0;
  rr.ops.slice(0, rr.columnN).forEach(function (op) {
    var g = op.outputGuid.replace(/^SW2D-/, ''), ic = indep[g]; if (!ic) return; zN++;
    var cz = op.params.placement.z - op.params.bbox[4];              // ground-seat: local zmin lands at placement.z
    var d = Math.abs(cz - ic.z); zWorst = Math.max(zWorst, d); if (d <= 0.001) zOk++;
    var da = Math.abs(anchors[g].z - ic.z); zWorstAnchor = Math.max(zWorstAnchor, da); if (da > 0.001) zOffAnchor++;
  });
  chk('T3 RENDER-Z (skeleton column boxes centred on the real mesh z — the anchor z had ' + zOffAnchor + ' off, max ' + zWorstAnchor.toFixed(3) + ' m)',
    zN === 158 && zOk === 158, 'columns=' + zN + ' centredOnMesh=' + zOk + ' worst=' + (zWorst * 1000).toFixed(2) + 'mm');

  // T4 — topology held anchor→true: same grid shape, same girder count, same membership; line values move
  var colsA = Object.keys(anchors).map(function (g) { return { guid: g, x: anchors[g].x, y: anchors[g].y, z: anchors[g].z }; });
  var skA = SW.swWalkSkeleton(colsA), skT = st.base;
  function memb(sk, cols) { return cols.map(function (c) { return sk.grid.xLines.indexOf(SW.swNearest(c.x, sk.grid.xLines).line) + '|' + sk.grid.yLines.indexOf(SW.swNearest(c.y, sk.grid.yLines).line); }); }
  var colsT = Object.keys(anchors).map(function (g) { return { guid: g, x: indep[g].x, y: indep[g].y }; });
  var mA = memb(skA, colsA), mT = memb(skT, colsT), moved = 0; mA.forEach(function (m, i) { if (m !== mT[i]) moved++; });
  var maxShift = 0; skA.grid.xLines.forEach(function (v, i) { maxShift = Math.max(maxShift, Math.abs(skT.grid.xLines[i] - v)); }); skA.grid.yLines.forEach(function (v, i) { maxShift = Math.max(maxShift, Math.abs(skT.grid.yLines[i] - v)); });
  chk('T4 TOPOLOGY-HELD (18×10, 108 girders, 0 columns change line membership; the line VALUES move — that is the correction)',
    skA.grid.xLines.length === skT.grid.xLines.length && skA.grid.yLines.length === skT.grid.yLines.length && skA.girders.length === skT.girders.length && skT.girders.length === 108 && moved === 0,
    'anchorGrid=' + skA.grid.xLines.length + 'x' + skA.grid.yLines.length + ' girders=' + skA.girders.length + '/' + skT.girders.length + ' membershipChanged=' + moved + ' maxLineShift=' + (maxShift * 1000).toFixed(0) + 'mm');

  // T5 — Step B pinned: the beams prove the facade line; mean misses it, median lands on it; RMS goes UP
  var beamGuids = {}; q("SELECT guid FROM elements_meta WHERE discipline='STR' AND ifc_class='IfcBeam'").forEach(function (g) { beamGuids[g] = 1; });
  var sOn = 0, sNear = 0, nOn = 0, nNear = 0;
  boxes.forEach(function (b) { if (!b.real || !beamGuids[b.guid]) return; var y = (b.aabb[2] + b.aabb[3]) / 2;
    if (Math.abs(y - BEAM_S) < 1.0) { sNear++; if (Math.abs(y - BEAM_S) <= 0.001) sOn++; }
    if (Math.abs(y - BEAM_N) < 1.0) { nNear++; if (Math.abs(y - BEAM_N) <= 0.001) nOn++; } });
  var yMean = skT.grid.yLines, y0m = yMean[0], y9m = yMean[yMean.length - 1];
  var skM = SW.swWalkSkeleton(colsT, { lineFit: 'median' }), yMed = skM.grid.yLines, y0d = yMed[0], y9d = yMed[yMed.length - 1];
  var rmsM = rms(skM.walked.map(function (w) { return w.residual; }));
  var exactMean = skT.walked.filter(function (w) { return w.residual < 0.005; }).length, exactMed = skM.walked.filter(function (w) { return w.residual < 0.005; }).length;
  var rx = rms(colsT.map(function (c) { return c.x - SW.swNearest(c.x, skT.grid.xLines).line; })), ry = rms(colsT.map(function (c) { return c.y - SW.swNearest(c.y, skT.grid.yLines).line; }));
  chk('T5 LINE-ON-BEAMS (all facade beams sit on one line each; mean fit misses it by 107/161 mm, median lands on it; RMS rises 0.1039→0.1323 — a decision, not a metric)',
    sNear === 34 && sOn === 34 && nNear === 33 && nOn === 33 &&
    Math.abs(y0m - BEAM_S) > 0.1 && Math.abs(y9m - BEAM_N) > 0.15 &&
    Math.abs(y0d - BEAM_S) <= 0.001 && Math.abs(y9d - BEAM_N) <= 0.001 &&
    skM.grid.xLines.length === 18 && skM.grid.yLines.length === 10 && Math.abs(rmsM - EXPECT_MEDIAN) <= TOL && exactMed > exactMean,
    'beams S=' + sOn + '/' + sNear + '@' + BEAM_S + ' N=' + nOn + '/' + nNear + '@' + BEAM_N +
    ' | mean Y0=' + y0m.toFixed(3) + ' Y9=' + y9m.toFixed(3) + ' (off ' + ((y0m - BEAM_S) * 1000).toFixed(0) + '/' + ((y9m - BEAM_N) * 1000).toFixed(0) + 'mm) exact=' + exactMean + '/158 RMS=' + colRMS.toFixed(4) + ' (dx ' + rx.toFixed(4) + ' dy ' + ry.toFixed(4) + ')' +
    ' | median Y0=' + y0d.toFixed(3) + ' Y9=' + y9d.toFixed(3) + ' exact=' + exactMed + '/158 RMS=' + rmsM.toFixed(4));

  // T2 — fallback: same bytes, geometry table dropped ⇒ anchors, counted, 0.0939
  var db2 = new SQL.Database(bytes); db2.run('DROP TABLE component_geometries');
  var st2 = Bridge.swbInit(db2);
  var rms2 = rms(st2.base.walked.map(function (w) { return w.residual; }));
  chk('T2 FALLBACK-LOUD (no geometry table ⇒ anchors: 0 mesh / 158 anchor, colRMS 0.0939 — today\'s path, counted in the log)',
    st2.centres.mesh === 0 && st2.centres.anchor === 158 && Math.abs(rms2 - EXPECT_ANCHOR) <= TOL,
    'centres=mesh:' + st2.centres.mesh + ' anchor:' + st2.centres.anchor + ' colRMS=' + rms2.toFixed(4) + ' expected=' + EXPECT_ANCHOR);
  db.close(); db2.close();

  console.log('W-ROW7-TRUE-CENTRE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('W-ROW7-TRUE-CENTRE: CRASH ' + (e && e.stack || e)); process.exit(1); });
