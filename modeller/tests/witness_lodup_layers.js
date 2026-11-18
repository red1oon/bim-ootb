#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-LAYERS: the LOD Upgrade pill's "Layers" pack (JS) equals the extractor's layer split (Python). Read the log after every run (§LODUP_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P3 and "P3 SPEC". Oracle: BIMCompiler extractIFCtoDB.py compile_layer_geometry (the slabs + the §LAYER-REFUSE reasons) as written into the JPAM DB by jpam/build_jpam.py section A (the GEN-LY-* parts and their change rows).
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the browser result differs from the proven Python result".
 *   PARITY_COUNTS     the same hosts split and the same parts (88 hosts -> 220), none only on one side; the state of the input (stored slabs re-verified, or envelope sliced) is printed.
 *   PARITY_REFUSED    the same hosts refused with the same reason text (compared in the oracle's order, then as a set).
 *   PARITY_CHANGELIST the 220 ADDED + the REFUSED rows equal the oracle's `upgrade_changes` rows, field by field (REFUSED detail up to the log-name suffix).   PARITY_NAMES the part names.
 *   PARITY_VERTICES   every WORLD vertex within 0.01 mm of the oracle part, both directions, after ONE measured translation (extractor frame -> combined frame; the spread of that translation over all parts is
 *                     asserted, so a wrong rotation or a per-part drift shows); per-part volume within 1e-9 m3; in the stored state also in the oracle's own vertex order. Triangulation of a cap may differ (ear clipping vs GEOS): the vertex SET is compared.
 *   THICKNESS         read independently from the tables: each part's extent along the host's layer axis = its stated layer thickness within 0.01 mm; the layers of a host stack with no gap and no overlap, in sequence order along the direction sense; their sum = the authored total.
 *   SYNTH_TRUTH       a hand-derived fixture (a slab with a through opening, 3 layers, both senses, a rotated wall on AXIS1, two refusals) through the SLICER: volumes, intervals, names, reasons by hand.
 *   ENVELOPE_PARITY   (LODUP_ENVELOPE_DB set) the slicer itself on the restored envelopes equals the same oracle (the DB the extractor started from, before it compiled the split).
 *   CENTRE / DETERMINISM / CHANGELIST_TXT / REGISTRY / BREAK as the P1 and P2 witnesses. BREAK = ignoreSense (the direction sense ignored) must FAIL the parity / stack checks (LODUP_BREAK=1 makes the MAIN run the broken run; expect exit through the same FAIL).
 * Inputs by environment only (no project path in the repo): LODUP_SRC_DB (the extractor DB), LODUP_ORACLE_DB (the JPAM DB), optional LODUP_ENVELOPE_DB; all read only. Unset -> the synthetic fixture alone, parity INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
global.window = undefined;   // pure node: the packs must not need a browser
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Pack = require(path.join(ROOT, 'lod/layer_pack.js')), Rebar = require(path.join(ROOT, 'lod/rebar_pack.js')), Weld = require(path.join(ROOT, 'lod/weld_pack.js')),
  Ops = require(path.join(ROOT, 'lod/lod_ops.js')), Reader = require(path.join(ROOT, 'lod/lod_reader.js')), Registry = require(path.join(ROOT, 'lod/lod_registry.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var SRC = process.env.LODUP_SRC_DB, ORA = process.env.LODUP_ORACLE_DB, ENV = process.env.LODUP_ENVELOPE_DB, MAIN_BREAK = process.env.LODUP_BREAK === '1';
var P1_LOD_UI_SHA = 'c6c4ac30b19aa529ba122c8a7359f1773312195ea72364b210273e5d86743544';   // lod/lod_ui.js as merged in P1 (#3238): P3 must not edit the dialog
var FAILS = [], INCONC = [], VTOL = 1e-5;   // 0.01 mm
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
function q(db, sql, args) { var st = db.prepare(sql), out = []; if (args) st.bind(args); while (st.step()) out.push(st.get()); st.free(); return out; }

// ---- helpers (independent of the pack)
function rotM(a, b, c) { var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c); return [[cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc], [cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc], [-sb, sa * cb, ca * cb]]; }
function bboxOf(W) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < W.length; i += 3) for (var a = 0; a < 3; a++) { if (W[i + a] < lo[a]) lo[a] = W[i + a]; if (W[i + a] > hi[a]) hi[a] = W[i + a]; } return [lo, hi]; }
function centreOf(W) { var b = bboxOf(W); return [0, 1, 2].map(function (a) { return (b[0][a] + b[1][a]) / 2; }); }
function areaOf(W) { var s = 0; for (var i = 0; i + 8 < W.length; i += 9) { var ax = W[i + 3] - W[i], ay = W[i + 4] - W[i + 1], az = W[i + 5] - W[i + 2], bx = W[i + 6] - W[i], by = W[i + 7] - W[i + 1], bz = W[i + 8] - W[i + 2]; s += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2; } return s; }
function volOf(W) { var s = 0; for (var i = 0; i + 8 < W.length; i += 9) s += W[i] * (W[i + 4] * W[i + 8] - W[i + 5] * W[i + 7]) + W[i + 1] * (W[i + 5] * W[i + 6] - W[i + 3] * W[i + 8]) + W[i + 2] * (W[i + 3] * W[i + 7] - W[i + 4] * W[i + 6]); return s / 6; }
function maxNearest(A, B, shift) {   // max over the points of A of the distance to the nearest point of B (A shifted by `shift`)
  var CELL = 1e-4, grid = {}, key = function (x, y, z) { return Math.floor(x / CELL) + ',' + Math.floor(y / CELL) + ',' + Math.floor(z / CELL); }, i;
  for (i = 0; i < B.length; i += 3) { var k = key(B[i], B[i + 1], B[i + 2]); (grid[k] = grid[k] || []).push(i); }
  var worst = 0;
  for (i = 0; i < A.length; i += 3) {
    var x = A[i] + shift[0], y = A[i + 1] + shift[1], z = A[i + 2] + shift[2], cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL), best = Infinity;
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) { var cell = grid[(cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)]; if (!cell) continue; for (var c = 0; c < cell.length; c++) { var j = cell[c], d = Math.hypot(B[j] - x, B[j + 1] - y, B[j + 2] - z); if (d < best) best = d; } }
    if (best === Infinity) best = 1;   // no neighbour within a cell: far beyond tolerance
    if (best > worst) worst = best;
  }
  return worst;
}
function f32(b) { return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }

// ---- synthetic fixture with hand-derived truth. Metres. Float32 meshes as the extractor stores them.
function prism(O, H, z0, z1) {   // outer rectangle O (4 points CCW), optional hole H (4 points CCW), extruded z0..z1; faces wound outward (hole walls face into the hole)
  var V = [], F = [], id = function (p, z) { V.push(p[0], p[1], z); return V.length / 3 - 1; }, ob = O.map(function (p) { return id(p, z0); }), ot = O.map(function (p) { return id(p, z1); }), n = O.length, i, j;
  for (i = 0; i < n; i++) { j = (i + 1) % n; F.push(ob[i], ob[j], ot[j], ob[i], ot[j], ot[i]); }
  if (!H) { F.push(ot[0], ot[1], ot[2], ot[0], ot[2], ot[3]); F.push(ob[0], ob[2], ob[1], ob[0], ob[3], ob[2]); return { V: V, F: F }; }
  var hb = H.map(function (p) { return id(p, z0); }), ht = H.map(function (p) { return id(p, z1); });
  for (i = 0; i < n; i++) { j = (i + 1) % n; F.push(ot[i], ot[j], ht[j], ot[i], ht[j], ht[i]); F.push(ob[i], hb[j], ob[j], ob[i], hb[i], hb[j]); F.push(hb[i], ht[j], hb[j], hb[i], ht[i], ht[j]); }
  return { V: V, F: F };
}
var RECT = function (x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; };
var SYNTH = {
  parts: 9, refused: { SYN_D: 'LayerSetDirection missing/unknown (None)', SYN_E: 'body span [0.0000,0.3000] (extent 0.3000) does not align with the authored layer set (total 0.1000, offset 0.0, sense POSITIVE) under absolute OR relative anchoring' },
  // host -> [layer: world interval along its axis [lo,hi] (m), volume m3]
  A: { cen: [5, 6, 0], axis: [0, 0, 1], layers: [[0, 0.02, 0.036], [0.02, 0.07, 0.09], [0.07, 0.1, 0.054]] },
  B: { cen: [0, 0, 3], axis: [0, 0, 1], layers: [[3.08, 3.1, 0.02], [3.03, 3.08, 0.05], [3.0, 3.03, 0.03]] },
  C: { cen: [10, 20, 0], axis: [0, 1, 0], layers: [[20, 20.03, 0.225], [20.03, 20.07, 0.3], [20.07, 20.1, 0.225]] }
};
function synthetic(SQL, asBase) {
  var db = new SQL.Database(), tbl = asBase ? 'base_geometries' : 'component_geometries';
  db.run('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  db.run('CREATE TABLE element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)'); db.run('CREATE TABLE ' + tbl + ' (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB)');
  db.run('CREATE TABLE rel_material_layer_set (element_guid TEXT PRIMARY KEY, layer_set_name TEXT, layer_count INTEGER, total_thickness_m REAL, layer_set_direction TEXT, direction_sense TEXT, offset_from_reference_line REAL)');
  db.run('CREATE TABLE material_layers (layer_set_name TEXT, sequence INTEGER, material_name TEXT, thickness_m REAL, is_ventilated INTEGER)');
  var N = 0;
  function host(guid, cls, name, pr, cen, rz, set, th, dir, sense, off, tot) {
    db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', [guid, cls, name, 'Level 1', 'ARC', 'Mat', '0.5,0.5,0.5,1', 'SYN']); db.run('INSERT INTO element_transforms VALUES (?,?,?,?,0,0,?,0,0,0)', [guid, cen[0], cen[1], cen[2], rz]);
    db.run('INSERT INTO element_instances VALUES (?,?)', [guid, 'syn' + (++N)]); db.run('INSERT INTO ' + tbl + ' VALUES (?,?,?)', ['syn' + N, new Uint8Array(new Float32Array(pr.V).buffer), new Uint8Array(new Int32Array(pr.F).buffer)]);
    db.run('INSERT INTO rel_material_layer_set VALUES (?,?,?,?,?,?,?)', [guid, set, th.length, tot === undefined ? th.reduce(function (a, b) { return a + b; }, 0) : tot, dir, sense, off]);
    th.forEach(function (t, i) { db.run('INSERT INTO material_layers VALUES (?,?,?,?,0)', [set, i, 'Mat' + i, t]); });
  }
  host('SYN_A', 'IfcSlab', 'Floor with opening', prism(RECT(0, 0, 2, 1), RECT(0.75, 0.3, 1.25, 0.7), 0, 0.1), SYNTH.A.cen, 0, 'SET_A', [0.02, 0.05, 0.03], 'AXIS3', 'POSITIVE', 0.0);
  host('SYN_B', 'IfcSlab', 'Floor from the top', prism(RECT(0, 0, 1, 1), null, 0, 0.1), SYNTH.B.cen, 0, 'SET_B', [0.02, 0.05, 0.03], 'AXIS3', 'NEGATIVE', 0.1);
  host('SYN_C', 'IfcWall', 'Turned wall', prism(RECT(0, 0, 0.1, 3), null, 0, 2.5), SYNTH.C.cen, Math.PI / 2, 'SET_C', [0.03, 0.04, 0.03], 'AXIS1', 'POSITIVE', null);   // the box above is extruded in z; its x extent (0.1) is the layer axis
  host('SYN_D', 'IfcWall', 'No direction', prism(RECT(0, 0, 1, 1), null, 0, 0.1), [0, 0, 0], 0, 'SET_D', [0.05, 0.05], null, 'POSITIVE', 0.0);
  host('SYN_E', 'IfcSlab', 'Body does not match the set', prism(RECT(0, 0, 1, 1), null, 0, 0.3), [0, 0, 0], 0, 'SET_E', [0.05, 0.05], 'AXIS3', 'POSITIVE', 0.0);
  return db;
}

// ---- independent per-host stack check, read from the tables (not from the pack)
function stackCheck(db, parts) {
  var hosts = {}, bad = [], n = 0, order = 0;
  q(db, 'SELECT r.element_guid, r.layer_set_name, r.layer_set_direction, r.direction_sense, r.layer_count, r.total_thickness_m, t.rotation_x, t.rotation_y, t.rotation_z FROM rel_material_layer_set r JOIN element_transforms t ON t.guid = r.element_guid WHERE r.layer_count > 1').forEach(function (v) { hosts[v[0]] = { set: v[1], dir: v[2], sense: v[3], count: v[4], total: v[5], rot: [v[6], v[7], v[8]] }; });
  var byHost = {}; parts.forEach(function (p) { (byHost[p.host] = byHost[p.host] || []).push(p); });
  var maxExt = 0, maxGap = 0, maxSum = 0, nHosts = 0;
  Object.keys(byHost).sort().forEach(function (g) {
    var H = hosts[g]; if (!H || !{ AXIS1: 1, AXIS2: 1, AXIS3: 1 }[H.dir]) { bad.push([g, 'host or direction unknown']); return; }
    var th = q(db, 'SELECT thickness_m FROM material_layers WHERE layer_set_name = ? ORDER BY sequence', [H.set]).map(function (v) { return v[0]; }), M = rotM(H.rot[0], H.rot[1], H.rot[2]), k = { AXIS1: 0, AXIS2: 1, AXIS3: 2 }[H.dir], ax = [M[0][k], M[1][k], M[2][k]], iv = [];
    byHost[g].sort(function (a, b) { return a.seq - b.seq; }).forEach(function (p) {
      var lo = Infinity, hi = -Infinity; for (var i = 0; i < p.tris.length; i += 3) { var s = p.tris[i] * ax[0] + p.tris[i + 1] * ax[1] + p.tris[i + 2] * ax[2]; if (s < lo) lo = s; if (s > hi) hi = s; }
      var ext = hi - lo, d = Math.abs(ext - th[p.seq]); n++; if (d > maxExt) maxExt = d; if (d > VTOL) bad.push([g, p.seq, 'extent ' + (ext * 1000).toFixed(4) + ' mm vs stated ' + (th[p.seq] * 1000).toFixed(4)]);
      iv.push({ seq: p.seq, lo: lo, hi: hi });
    });
    nHosts++;
    if (iv.length === th.length) {   // every layer present: they must tile the stack with no gap, no overlap, sum = total, and run along the sense
      var bySpan = iv.slice().sort(function (a, b) { return a.lo - b.lo; }), gap = 0; for (var i = 1; i < bySpan.length; i++) gap = Math.max(gap, Math.abs(bySpan[i].lo - bySpan[i - 1].hi));
      var span = bySpan[bySpan.length - 1].hi - bySpan[0].lo, sd = Math.abs(span - H.total); if (gap > maxGap) maxGap = gap; if (sd > maxSum) maxSum = sd;
      if (gap > VTOL || sd > VTOL) bad.push([g, 'stack', 'gap/overlap ' + (gap * 1000).toFixed(4) + ' mm, span vs total ' + (sd * 1000).toFixed(4) + ' mm']);
      var inc = iv.every(function (x, i2) { return i2 === 0 || x.lo > iv[i2 - 1].lo; }), dec = iv.every(function (x, i2) { return i2 === 0 || x.lo < iv[i2 - 1].lo; });
      if (!(H.sense === 'POSITIVE' ? inc : dec)) { order++; bad.push([g, 'order', 'layers do not run along the direction sense ' + H.sense]); }
    }
  });
  return { bad: bad, parts: n, hosts: nHosts, maxExtMm: maxExt * 1000, maxGapMm: maxGap * 1000, maxSumMm: maxSum * 1000, orderBad: order };
}

// ---- parity of one run against the oracle
function oracleParts(oraDb) {
  var ora = {}; q(oraDb, "SELECT i.guid, c.vertices, t.center_x, t.center_y, t.center_z, m.element_name FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) JOIN elements_meta m USING(guid) WHERE i.guid LIKE 'GEN-LY-%' ORDER BY i.guid")
    .forEach(function (v) { var F = f32(v[1]), W = new Float64Array(F.length); for (var i = 0; i < F.length; i += 3) { W[i] = F[i] + v[2]; W[i + 1] = F[i + 1] + v[3]; W[i + 2] = F[i + 2] + v[4]; } ora[v[0]] = { W: W, name: v[5] }; });
  return ora;
}
function compareRun(R, ora, exactOrder) {
  var mine = {}; R.parts.forEach(function (p) { mine[p.guid] = p; });
  var oIds = Object.keys(ora).sort(), mIds = Object.keys(mine).sort(), onlyO = oIds.filter(function (g) { return !mine[g]; }), onlyM = mIds.filter(function (g) { return !ora[g]; }), both = mIds.filter(function (g) { return ora[g]; });
  var out = { oracle: oIds.length, js: mIds.length, onlyO: onlyO, onlyM: onlyM, both: both.length, nameBad: 0, nameFirst: null, shift: null, spread: 0, soupMax: null, soupN: 0, setMax: 0, setN: 0, volMax: 0, volBad: 0, vcBad: 0 };
  if (!both.length) return out;
  var c1 = centreOf(mine[both[0]].tris), c2 = centreOf(ora[both[0]].W); out.shift = [c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]];
  both.forEach(function (g) {
    var A = mine[g].tris, B = ora[g].W, ca = centreOf(A), cb = centreOf(B);
    if (mine[g].name !== ora[g].name) { out.nameBad++; if (!out.nameFirst) out.nameFirst = [g, mine[g].name, ora[g].name]; }
    out.spread = Math.max(out.spread, Math.hypot(cb[0] - ca[0] - out.shift[0], cb[1] - ca[1] - out.shift[1], cb[2] - ca[2] - out.shift[2]));
    out.setN += A.length / 3; out.setMax = Math.max(out.setMax, maxNearest(A, B, out.shift), maxNearest(B, A, [-out.shift[0], -out.shift[1], -out.shift[2]]));
    var dv = Math.abs(volOf(A) - volOf(B)), lim = areaOf(B) * VTOL + 1e-12; out.volMax = Math.max(out.volMax, dv); out.volRel = Math.max(out.volRel || 0, dv / lim); if (dv > lim) out.volBad++;   // a 0.01 mm move of every face changes the volume by at most area x 0.01 mm (the oracle stores float32 offsets)
    if (A.length !== B.length) out.vcBad++;
    if (exactOrder && A.length === B.length) { out.soupN += A.length / 3; for (var i = 0; i < A.length; i++) out.soupMax = Math.max(out.soupMax || 0, Math.abs(A[i] + out.shift[i % 3] - B[i])); }
  });
  return out;
}
function oracleRows(oraDb) { return q(oraDb, "SELECT seq, change, guid, ifc_class, host_guid, rule, detail FROM upgrade_changes WHERE rule LIKE 'Layer split%' ORDER BY seq"); }
var stripSuffix = function (s) { return String(s).replace(/ \((?:extract_ARC\.log )?§LAYER-REFUSE\)$/, ''); };
function compareRows(R, orows) {
  var my = R.changes.map(function (c, i) { return [i + 1, c.kind, c.guid, c.cls, c.host, c.rule, c.detail]; }), bad = 0, first = null, i, k;
  if (orows.length !== my.length) bad += Math.abs(orows.length - my.length);
  for (i = 0; i < Math.min(orows.length, my.length); i++) for (k = 1; k < 7; k++) if (stripSuffix(orows[i][k]) !== stripSuffix(my[i][k])) { bad++; if (!first) first = { oracle_row: i + 1, field: k, oracle: String(orows[i][k]).slice(0, 200), js: String(my[i][k]).slice(0, 200) }; break; }
  var refO = orows.filter(function (r) { return r[1] === 'REFUSED'; }), refM = my.filter(function (r) { return r[1] === 'REFUSED'; }), sO = refO.map(function (r) { return r[2] + '|' + stripSuffix(r[6]); }).sort().join('\n'), sM = refM.map(function (r) { return r[2] + '|' + stripSuffix(r[6]); }).sort().join('\n');
  var inOrder = refO.length === refM.length && refO.every(function (r, j) { return r[2] === refM[j][2] && stripSuffix(r[6]) === stripSuffix(refM[j][6]); });
  return { rows: my, bad: bad, first: first, orows: orows.length, refO: refO.length, refM: refM.length, refSet: sO === sM, refOrder: inOrder, reasons: (function () { var r = {}; refM.forEach(function (x) { var w = String(x[6]).split(' | ')[1].replace(/\[[^\]]*\]\s*\(extent [^)]*\)\s*/, '[..] (extent ..) ').slice(0, 70); r[w] = (r[w] || 0) + 1; }); return r; })() };
}

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var REAL = !!(SRC && ORA), srcDb, oraDb = null, envDb = null;
  if (REAL) { srcDb = new SQL.Database(new Uint8Array(fs.readFileSync(SRC))); oraDb = new SQL.Database(new Uint8Array(fs.readFileSync(ORA))); if (ENV) envDb = new SQL.Database(new Uint8Array(fs.readFileSync(ENV))); }
  else srcDb = synthetic(SQL, false);
  console.log('§LODUP_MODE pack=layers source=' + (REAL ? 'LODUP_SRC_DB (real)' : 'SYNTHETIC fixture (LODUP_SRC_DB / LODUP_ORACLE_DB unset)') + ' oracle=' + (REAL ? 'LODUP_ORACLE_DB' : 'none') + ' envelope_db=' + (envDb ? 'LODUP_ENVELOPE_DB' : 'none') + ' break=' + (MAIN_BREAK ? 1 : 0));
  var RULES = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/layer_defaults.json'), 'utf8'))), RC = Rules.counts(RULES);
  console.log('§LODUP_RULES pack=layers rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' unset=' + RC.unset);
  var mkInp = function (db) { var rd = Reader.fromDb(db); return { meta: rd.meta, sched: rd.sched, world: rd.world, layers: rd.layers, callouts: [] }; };
  var inp = mkInp(srcDb), logs = [], run = function (i, o) { logs.length = 0; return Pack.run(i, RULES, Object.assign({ log: function (l) { logs.push(l); console.log(l); } }, o || {})); };
  var R = run(inp, { ignoreSense: MAIN_BREAK }), parts = R.parts, applies = Pack.appliesTo(inp);
  verdict('NONVACUOUS', parts.length ? true : (applies ? false : null), 'applies_to=' + applies + ' hosts_split=' + R.stats.hostsSplit + ' parts=' + parts.length + ' refused=' + R.stats.refused + ' added_verts=' + R.stats.addedVerts + (parts.length ? '' : ' (nothing judged)'));

  var syn = synthetic(SQL, true), SI = mkInp(syn), SR = Pack.run(SI, RULES, { log: function (l) { console.log('[synth] ' + l); } });
  // ---- SYNTH_TRUTH: hand-derived expectations through the SLICER (the synthetic DB carries no layer index rows; its meshes live in base_geometries: the reader's fallback)
  (function () {
    var bad = [], byG = {}; SR.parts.forEach(function (p) { (byG[p.host] = byG[p.host] || []).push(p); });
    [['SYN_A', SYNTH.A], ['SYN_B', SYNTH.B], ['SYN_C', SYNTH.C]].forEach(function (pr) {
      var ps = (byG[pr[0]] || []).sort(function (a, b) { return a.seq - b.seq; }), H = pr[1];
      if (ps.length !== 3) { bad.push(pr[0] + ' parts=' + ps.length); return; }
      ps.forEach(function (p, i) {
        var lo = Infinity, hi = -Infinity; for (var j = 0; j < p.tris.length; j += 3) { var s = p.tris[j] * H.axis[0] + p.tris[j + 1] * H.axis[1] + p.tris[j + 2] * H.axis[2]; if (s < lo) lo = s; if (s > hi) hi = s; }
        var w = H.layers[i], v = Math.abs(volOf(p.tris));
        if (Math.abs(lo - w[0]) > 1e-6 || Math.abs(hi - w[1]) > 1e-6) bad.push(pr[0] + ' layer ' + i + ' interval [' + lo.toFixed(6) + ',' + hi.toFixed(6) + '] want [' + w[0] + ',' + w[1] + ']');
        if (Math.abs(v - w[2]) > 1e-6) bad.push(pr[0] + ' layer ' + i + ' volume ' + v.toFixed(8) + ' want ' + w[2]);
        if (p.name !== 'Mat' + i + ' ' + ((w[1] - w[0]) * 1000).toFixed(1) + ' mm (layer ' + i + ' of SET_' + pr[0].slice(4) + ')') bad.push(pr[0] + ' name "' + p.name + '"');
        if (volOf(p.tris) <= 0) bad.push(pr[0] + ' layer ' + i + ' winding inward');
      });
    });
    var refd = {}; SR.audit.refused.forEach(function (r) { refd[r.guid] = r.reason; });
    Object.keys(SYNTH.refused).forEach(function (g) { if (refd[g] !== SYNTH.refused[g]) bad.push(g + ' reason "' + refd[g] + '" want "' + SYNTH.refused[g] + '"'); });
    if (SR.parts.length !== SYNTH.parts || SR.audit.refused.length !== 2 || SR.stats.sliced !== 3 || SR.stats.stored !== 0) bad.push('counts parts=' + SR.parts.length + ' refused=' + SR.audit.refused.length + ' sliced=' + SR.stats.sliced);
    var st = stackCheck(syn, SR.parts); st.bad.forEach(function (b) { bad.push('stack ' + JSON.stringify(b)); });
    verdict('SYNTH_TRUTH', !bad.length, 'parts=' + SR.parts.length + ' (3 hosts x 3 layers, slab with a through opening, both senses, a wall turned 90 degrees on AXIS1) refused=' + SR.audit.refused.length + ' (no direction; body span) volumes+intervals+names+reasons by hand, mismatches=' + bad.length + (bad[0] ? ' first=' + bad[0] : ''));
  })();

  var orows = null, ora = null;
  if (!REAL) { verdict('PARITY', null, 'no oracle (synthetic fixture): counts / reasons / vertices / change rows not compared'); }
  else {
    ora = oracleParts(oraDb); orows = oracleRows(oraDb);
    var C = compareRun(R, ora, true), mineSet = R.audit.hosts.length;
    verdict('PARITY_COUNTS', C.onlyO.length === 0 && C.onlyM.length === 0 && C.oracle > 0, 'oracle_parts=' + C.oracle + ' js_parts=' + C.js + ' only_in_oracle=' + C.onlyO.length + ' only_in_js=' + C.onlyM.length + ' hosts_split=' + mineSet + ' input_state: stored_slabs_verified=' + R.stats.stored + ' envelope_sliced=' + R.stats.sliced + (C.onlyO[0] ? ' first_only_oracle=' + C.onlyO[0] : '') + (C.onlyM[0] ? ' first_only_js=' + C.onlyM[0] : ''));
    var CR = compareRows(R, orows);
    verdict('PARITY_REFUSED', CR.refO > 0 && CR.refO === CR.refM && CR.refSet && CR.refOrder, 'oracle_refused=' + CR.refO + ' js_refused=' + CR.refM + ' same_hosts_and_reasons=' + CR.refSet + ' same_order=' + CR.refOrder + ' reasons=' + JSON.stringify(CR.reasons));
    verdict('PARITY_CHANGELIST', CR.bad === 0 && CR.orows > 0, 'oracle_layer_rows=' + CR.orows + ' js_rows=' + CR.rows.length + ' differing_rows=' + CR.bad + ' (REFUSED detail compared up to the log-name suffix)' + (CR.first ? ' first=' + JSON.stringify(CR.first) : ''));
    verdict('PARITY_NAMES', C.both > 0 && C.nameBad === 0, 'parts_compared=' + C.both + ' name_mismatches=' + C.nameBad + (C.nameFirst ? ' first=' + JSON.stringify(C.nameFirst) : ''));
    console.log('§LODUP_LAYER_FRAME compared in the EXTRACTOR frame (world = R(rx,ry,rz) v + centre); the oracle lives in the combined frame: one measured translation (first part, sorted), printed to this log only; spread over all parts follows');
    verdict('PARITY_VERTICES', C.both > 0 && C.vcBad === 0 && C.setMax <= VTOL && C.spread <= VTOL && C.volBad === 0 && (C.soupMax === null || C.soupMax <= VTOL),
      'parts_compared=' + C.both + ' translation_m=[' + (C.shift || []).map(function (x) { return x.toFixed(6); }).join(',') + '] translation_spread_mm=' + (C.spread * 1000).toFixed(6) + ' vertex_count_mismatch_parts=' + C.vcBad + ' vertices_compared=' + C.setN + ' max_set_distance_mm=' + (C.setMax * 1000).toFixed(6) + ' soup_in_oracle_order=' + (C.soupMax === null ? 'n/a' : 'max_delta_mm=' + (C.soupMax * 1000).toFixed(6) + ' over ' + C.soupN + ' vertices') + ' max_volume_delta_m3=' + C.volMax.toExponential(2) + ' = ' + ((C.volRel || 0) * 100).toFixed(1) + '% of its limit (area x 0.01 mm) (limit 0.01 mm)');
  }

  // ---- THICKNESS + stack, read from the tables
  var SC = stackCheck(srcDb, parts);
  verdict('THICKNESS', SC.parts ? !SC.bad.length : null, 'hosts=' + SC.hosts + ' parts=' + SC.parts + ' max_extent_error_mm=' + SC.maxExtMm.toFixed(6) + ' max_stack_gap_mm=' + SC.maxGapMm.toFixed(6) + ' max_total_error_mm=' + SC.maxSumMm.toFixed(6) + ' order_against_sense=' + SC.orderBad + ' (limit 0.01 mm)' + (SC.bad[0] ? ' first=' + JSON.stringify(SC.bad[0]) : ''));

  // ---- CENTRE (through the same function the pill uses to write ops)
  var built = Ops.build(parts, 'layers', inp.meta), cBad = 0, maxC = 0, poBad = 0, onHost = 0;
  built.ops.forEach(function (o, i) {
    var P = o.params, W = parts[i].tris, bb = bboxOf(W), halfZ = (bb[1][2] - bb[0][2]) / 2, cen = [P.placement.x, P.placement.y, P.placement.z + halfZ], bc = [0, 1, 2].map(function (a) { return (bb[0][a] + bb[1][a]) / 2; });
    var d = Math.max(Math.abs(cen[0] - bc[0]), Math.abs(cen[1] - bc[1]), Math.abs(cen[2] - bc[2])); if (d > maxC) maxC = d; if (d > 1e-6) cBad++;
    if (P.provenance !== 'generated:layers' || o.op_type !== 'GEOM_INSERT' || P.ifc_class !== 'IfcBuildingElementPart') cBad++;
    if (!P.parts_of || P.parts_of.length !== 1 || P.parts_of[0] !== parts[i].host || P.attached_to !== undefined) poBad++;
    var t = q(srcDb, 'SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?', [parts[i].host])[0]; if (t && Math.hypot(cen[0] - t[0], cen[1] - t[1], cen[2] - t[2]) < 1e-6) onHost++;
  });
  var epOk = built.elementParts.length === parts.length && built.elementParts.every(function (r, i) { return r.parent_guid === parts[i].host && r.child_guid === parts[i].guid && r.child_class === 'IfcBuildingElementPart' && r.parent_class === (inp.meta[r.parent_guid] && inp.meta[r.parent_guid].cls); });
  verdict('CENTRE', built.ops.length ? (cBad === 0 && poBad === 0 && epOk) : null, 'ops=' + built.ops.length + ' centre_not_own_bbox_centre=' + cBad + ' max_delta_m=' + maxC.toExponential(2) + ' parts_of_wrong=' + poBad + ' element_parts_rows=' + built.elementParts.length + ' (host -> part, P1 seeding hides the host) ok=' + epOk + ' parts_whose_centre_equals_their_host_centre=' + onHost + ' (a layer sits on the host centre only if it is the middle layer of a symmetric stack)');

  // ---- DETERMINISM: two runs, same op hash
  function opHash(rr) { var b = Ops.build(rr.parts, 'layers', inp.meta), h = crypto.createHash('sha256'); h.update(JSON.stringify(b.ops)); b.assets.forEach(function (a) { h.update(Buffer.from(a.v.buffer)); }); h.update(JSON.stringify(b.elementParts)); h.update(JSON.stringify(rr.changes)); return h.digest('hex'); }
  var h1 = opHash(R), h2 = opHash(run(inp, { ignoreSense: MAIN_BREAK }));
  verdict('DETERMINISM', parts.length ? h1 === h2 : null, 'run1=' + h1.slice(0, 16) + ' run2=' + h2.slice(0, 16));

  // ---- ENVELOPE_PARITY: the slicer itself, on the DB the extractor started from
  if (REAL && envDb) {
    var EI = mkInp(envDb), ER = Pack.run(EI, RULES, { ignoreSense: MAIN_BREAK, log: function (l) { console.log('[envelope] ' + l); } }), EC = compareRun(ER, ora, false), ECR = compareRows(ER, orows), ES = stackCheck(envDb, ER.parts);
    var allSliced = ER.stats.sliced === ER.stats.hostsSplit && ER.stats.stored === 0;
    verdict('ENVELOPE_PARITY', allSliced && EC.onlyO.length === 0 && EC.onlyM.length === 0 && EC.oracle > 0 && EC.vcBad === 0 && EC.setMax <= VTOL && EC.spread <= VTOL && EC.volBad === 0 && ECR.bad === 0 && ECR.refSet && ES.parts > 0 && !ES.bad.length,
      'state: envelope_sliced=' + ER.stats.sliced + ' stored=' + ER.stats.stored + ' oracle_parts=' + EC.oracle + ' js_parts=' + EC.js + ' only_oracle=' + EC.onlyO.length + ' only_js=' + EC.onlyM.length + ' vertex_count_mismatch_parts=' + EC.vcBad + ' vertices_compared=' + EC.setN + ' max_set_distance_mm=' + (EC.setMax * 1000).toFixed(6) + ' translation_spread_mm=' + (EC.spread * 1000).toFixed(6) + ' volume_mismatch_parts=' + EC.volBad + ' max_volume_delta_m3=' + EC.volMax.toExponential(2) + ' changelist_differing_rows=' + ECR.bad + ' refused_same_hosts_and_reasons=' + ECR.refSet + ' thickness_max_error_mm=' + ES.maxExtMm.toFixed(6) + ' stack_max_gap_mm=' + ES.maxGapMm.toFixed(6) + ' stack_problems=' + ES.bad.length + (ES.bad[0] ? ' first=' + JSON.stringify(ES.bad[0]) : '') + ' (cap triangulation differs from GEOS; the vertex set and every volume are compared)');
    var EB = Pack.run(EI, RULES, { ignoreSense: !MAIN_BREAK, log: function () { } }), EBC = compareRun(EB, ora, false), EBS = stackCheck(envDb, EB.parts), ebFail = EBC.onlyO.length > 0 || EBC.setMax > VTOL || EBS.bad.length > 0 || EBC.volBad > 0;
    if (!MAIN_BREAK) verdict('BREAK_CHECK_ENVELOPE', ebFail, 'switch=on (direction sense ignored) on the envelope state: parts=' + EB.parts.length + ' only_in_oracle=' + EBC.onlyO.length + ' max_set_distance_mm=' + (EBC.setMax * 1000).toFixed(3) + ' stack_problems=' + EBS.bad.length + ' expected FAIL of the parity / stack checks -> ' + (ebFail ? 'FAIL as designed' : 'DID NOT FAIL'));
  } else verdict('ENVELOPE_PARITY', null, REAL ? 'LODUP_ENVELOPE_DB unset: the slicer was judged on the synthetic fixture only (SYNTH_TRUTH), not on the oracle' : 'no oracle');

  // ---- BREAK: the direction sense ignored must FAIL the parity / stack checks (stored state)
  var RB = run2(Pack, inp, { ignoreSense: !MAIN_BREAK }), brokenFail;
  function run2(P, i, o) { return P.run(i, RULES, Object.assign({ log: function () { } }, o)); }
  var BS = stackCheck(srcDb, RB.parts), BC = REAL ? compareRun(RB, ora, true) : null;
  brokenFail = REAL ? (BC.onlyO.length > 0 || BC.setMax > VTOL || BS.bad.length > 0 || BC.volBad > 0) : (BS.bad.length > 0 || RB.parts.length !== R.parts.length || RB.stats.refused !== R.stats.refused);
  if (!MAIN_BREAK) verdict('BREAK_CHECK', brokenFail, 'switch=on (direction sense ignored): parts=' + RB.parts.length + ' of ' + R.parts.length + ' refused=' + RB.stats.refused + ' (main ' + R.stats.refused + ')' + (REAL ? ' only_in_oracle=' + BC.onlyO.length + ' max_set_distance_mm=' + (BC.setMax * 1000).toFixed(3) : '') + ' stack_problems=' + BS.bad.length + ' expected FAIL of the parity / stack checks -> ' + (brokenFail ? 'FAIL as designed' : 'DID NOT FAIL'));
  else console.log('§LODUP_BREAK_CHECK main run is the broken run: failed checks=' + (FAILS.join(',') || 'none') + ' (expected some) -> ' + (FAILS.length ? 'PASS' : 'FAIL'));

  // ---- change list text
  var txt = Ops.changeText(R.changes, { model: 'witness', pack: 'layers', rules: RC }), dl = txt.split('\n').filter(function (l) { return /^\d+ \| /.test(l); }).length;
  verdict('CHANGELIST_TXT', R.changes.length ? dl === R.changes.length : null, 'data_lines=' + dl + ' rows=' + R.changes.length);

  // ---- REGISTRY: the chooser lists the packs with no dialog change
  var uiSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'lod/lod_ui.js'))).digest('hex'), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/packs.json'), 'utf8'));
  var manIds = man.packs.map(function (p) { return p.id; }), filesOk = man.packs.every(function (p) { return fs.existsSync(path.join(ROOT, 'lod', p.file)); });
  Registry.clear(); Registry.register(Rebar); Registry.register(Weld); Registry.register(Pack);
  var rowsOf = function (id) { var rf = Registry.get(id).rulesFile; return id === 'layers' ? RULES : !rf ? {} : Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod', rf), 'utf8'))); };
  var ruleFilesOk = Registry.list().every(function (p) { return !p.rulesFile || fs.existsSync(path.join(ROOT, 'lod', p.rulesFile)); }), d1 = Registry.describe(inp, rowsOf, Rules);
  Registry.register({ id: 'dummy', label: 'Dummy (test pack)', appliesTo: function () { return 0; }, run: function () { return { parts: [], changes: [] }; } });
  var d2 = Registry.describe(inp, rowsOf, Rules), lRow = d1.filter(function (x) { return x.id === 'layers'; })[0];
  verdict('REGISTRY', d1.map(function (x) { return x.id; }).join() === 'rebar,welds,layers' && manIds.join() === 'rebar,welds,layers' && filesOk && ruleFilesOk && lRow && lRow.label === 'Layers' && lRow.appliesTo === applies && lRow.stated === RC.stated && lRow.default === RC.default && d2.length === d1.length + 1 && uiSha === P1_LOD_UI_SHA,
    'listed=' + d1.map(function (x) { return x.id + ':"' + x.label + '"(' + x.appliesTo + ')'; }).join(',') + ' packs.json=' + manIds.join() + ' pack_files_exist=' + filesOk + ' rules_files_exist=' + ruleFilesOk + ' layers_applies_to=' + (lRow && lRow.appliesTo) + ' after_one_more=' + d2.length + ' lod_ui_js_is_the_P1_file=' + (uiSha === P1_LOD_UI_SHA));

  // ---- cost (PERF BUDGET)
  var modelVerts = 0; try { var r1 = q(srcDb, 'SELECT SUM(length(b.vertices) / 12) FROM element_instances i JOIN ' + (inp.layers ? inp.layers.table : 'component_geometries') + ' b USING(geometry_hash)'); modelVerts = r1.length && r1[0][0] ? r1[0][0] : 0; } catch (e) { modelVerts = 0; }
  console.log('§LODUP_COST pack=layers addedVerts=' + R.stats.addedVerts + ' modelVerts=' + modelVerts + ' addedPct=' + (modelVerts ? (100 * R.stats.addedVerts / modelVerts).toFixed(2) : '-') + ' heapMB=' + (R.stats.addedVerts * 170 / 1e6).toFixed(2) + ' (0.17 GB per M vertices) warnOver1M=' + (R.stats.addedVerts > 1e6));
  console.log('§LODUP_SUMMARY pack=layers failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + (INCONC.length ? INCONC.join(',') : 'none') + ' mode=' + (REAL ? 'real' : 'synthetic') + (envDb ? '+envelope' : '') + ' break=' + (MAIN_BREAK ? 1 : 0));
  process.exit(MAIN_BREAK ? (FAILS.length ? 0 : 1) : FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_CRASH ' + (e && e.stack || e)); process.exit(2); });
