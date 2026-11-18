#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-BEAMBARS: the LOD Upgrade pill's "Beam rebar (schedule)" pack (JS) equals the proven Python run. Read the log after every run (§LODUP_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P6 and "P6 SPEC". Oracle (private, read only): BIMCompiler scripts/lod/rebar_beams.py (+ s401_marks.py, rebar_beam_defaults.json), its output DB, run on the base model with the marks JSON.
 * It states a FAIL of its own (STATED, 7 set mismatches on 2 beams); this witness REPRODUCES that FAIL (the same mismatches on the same beams), it does not hide it and does not tune it away.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the browser result differs from the proven Python result".
 *   PARITY_JOIN       every beam joined to its mark by the rule rows (92 of 92); no beam unjoined.
 *   PARITY_SETS       the same set ids as the oracle DB (306), none only on one side, the same host (parts_of) per set.
 *   PARITY_NAMES      the part names equal (count, stated bars, mixed diameters kept, stirrup dia / spacing).
 *   PARITY_VERTICES   every WORLD vertex of every set within 0.01 mm of the oracle's (centres follow the own-bbox rule, so the comparison is in the world frame).
 *   PARITY_CHANGELIST the change rows (ADDED / NOT_BUILT / REFUSED) equal the oracle's upgrade_changes rows after the source rows, field by field, in order.
 *   STATED            re-measured on the WRITTEN geometry (float32 + centre): bars per set against the stated schedule. The oracle FAILS this on 2 beams; PARITY_STATED asserts the SAME mismatches (same sets, same beams) on the JS sets and on the oracle's sets.
 *   INSIDE / LAP      every stored vertex inside its beam's TRUE mesh with at least cover - 1 mm; bars over the stock length flagged "needs lap (not modelled)".
 *   CENTRE / SCHEDULE_INPUT / RULES / NO_SCHEDULE / DETERMINISM / CHANGELIST_TXT / REGISTRY / BREAK (cover off must FAIL INSIDE).
 * Inputs by environment only (no project path in the repo): LODUP_SRC_DB (the base model), LODUP_ORACLE_DB (the oracle's output DB), LODUP_MARKS_JSON (the marks JSON), optional LODUP_ORACLE_LOG; all read only.
 * Any of the three unset -> a SYNTHETIC fixture with hand-derived truth (stated on the first line); parity is then INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
global.window = undefined;   // pure node: the packs must not need a browser
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Rebar = require(path.join(ROOT, 'lod/rebar_pack.js')), Pack = require(path.join(ROOT, 'lod/beambar_pack.js')), Weld = require(path.join(ROOT, 'lod/weld_pack.js')),
  Layer = require(path.join(ROOT, 'lod/layer_pack.js')), Joint = require(path.join(ROOT, 'lod/joint_pack.js')), Gusset = require(path.join(ROOT, 'lod/gusset_pack.js')), Ops = require(path.join(ROOT, 'lod/lod_ops.js')),
  Reader = require(path.join(ROOT, 'lod/lod_reader.js')), Registry = require(path.join(ROOT, 'lod/lod_registry.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var SRC = process.env.LODUP_SRC_DB, ORA = process.env.LODUP_ORACLE_DB, MARKS_FILE = process.env.LODUP_MARKS_JSON, ORA_LOG = process.env.LODUP_ORACLE_LOG, MAIN_BREAK = process.env.LODUP_BREAK === '1';
var LOD_UI_SHA = process.env.LODUP_UI_SHA || '37e57cb76e4092bf43dceb11062a870511119d8efac42a27706372329b5fb096';   // lod/lod_ui.js as of P7 (the Add-on IFC row + sliced run driver; the P6 file was dfb5d321c6f86f8c); the P1-P5 witnesses carry the same constant
var FAILS = [], INCONC = [], VTOL = 1e-5, SIDES = 8, RB_NV = SIDES * 4 * 3, LOOP_NV = 4 * SIDES * 2 * 3;   // 0.01 mm
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
function q(db, sql, bind) { var st = db.prepare(sql), out = []; if (bind) st.bind(bind); while (st.step()) out.push(st.get()); st.free(); return out; }
function bboxOf(W) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < W.length; i += 3) for (var a = 0; a < 3; a++) { if (W[i + a] < lo[a]) lo[a] = W[i + a]; if (W[i + a] > hi[a]) hi[a] = W[i + a]; } return [lo, hi]; }
function rhe(x) { return Pack.roundHalfEven(x); }

// ---- 3x3 symmetric eigen decomposition (Jacobi), sorted by descending eigenvalue: the SVD axes the oracle's witnesses read (bar axis = largest, loop normal = smallest)
function eig3(C) {
  var A = [C[0].slice(), C[1].slice(), C[2].slice()], V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], it, p, qq, r;
  for (it = 0; it < 60; it++) {
    var off = Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]); if (off < 1e-30) break;
    for (p = 0; p < 2; p++) for (qq = p + 1; qq < 3; qq++) {
      if (Math.abs(A[p][qq]) < 1e-300) continue;
      var th = (A[qq][qq] - A[p][p]) / (2 * A[p][qq]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (r = 0; r < 3; r++) { var a1 = A[r][p], a2 = A[r][qq]; A[r][p] = c * a1 - s * a2; A[r][qq] = s * a1 + c * a2; }
      for (r = 0; r < 3; r++) { var b1 = A[p][r], b2 = A[qq][r]; A[p][r] = c * b1 - s * b2; A[qq][r] = s * b1 + c * b2; }
      for (r = 0; r < 3; r++) { var v1 = V[r][p], v2 = V[r][qq]; V[r][p] = c * v1 - s * v2; V[r][qq] = s * v1 + c * v2; }
    }
  }
  var idx = [0, 1, 2].sort(function (x, y) { return A[y][y] - A[x][x]; });
  return idx.map(function (k) { return [V[0][k], V[1][k], V[2][k]]; });   // vectors, largest eigenvalue first
}
function covEig(P) {   // P = list of [x,y,z]; returns {c, vecs}
  var n = P.length, c = [0, 0, 0], i, a, b; P.forEach(function (p) { for (a = 0; a < 3; a++) c[a] += p[a]; }); c = [c[0] / n, c[1] / n, c[2] / n];
  var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; P.forEach(function (p) { for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) C[a][b] += (p[a] - c[a]) * (p[b] - c[b]); });
  return { c: c, vecs: eig3(C) };
}
function chunks(W, nv) { var out = []; for (var o = 0; o + nv * 3 <= W.length; o += nv * 3) { var P = []; for (var k = 0; k < nv; k++) P.push([W[o + 3 * k], W[o + 3 * k + 1], W[o + 3 * k + 2]]); out.push(P); } return out; }
function barChunks(W) {
  return chunks(W, RB_NV).map(function (P) {
    var E = covEig(P), a = E.vecs[0], rad = 0, lo = Infinity, hi = -Infinity;
    P.forEach(function (p) { var rel = [p[0] - E.c[0], p[1] - E.c[1], p[2] - E.c[2]], pr = rel[0] * a[0] + rel[1] * a[1] + rel[2] * a[2], rr = Math.hypot(rel[0] - pr * a[0], rel[1] - pr * a[1], rel[2] - pr * a[2]); if (rr > rad) rad = rr; if (pr < lo) lo = pr; if (pr > hi) hi = pr; });
    return { c: E.c, a: a, dia: 2000 * rad, length: hi - lo };
  });
}
function loopChunks(W) {
  return chunks(W, LOOP_NV).map(function (P) {
    var E = covEig(P), n = E.vecs[2], lo = Infinity, hi = -Infinity; P.forEach(function (p) { var d = (p[0] - E.c[0]) * n[0] + (p[1] - E.c[1]) * n[1] + (p[2] - E.c[2]) * n[2]; if (d < lo) lo = d; if (d > hi) hi = d; });
    return { c: E.c, n: n, dia: 1000 * (hi - lo) };
  });
}
function counter(a) { var o = {}; a.forEach(function (x) { o[x] = (o[x] || 0) + 1; }); return o; }
function sameCounter(a, b) { var ka = Object.keys(a).filter(function (k) { return a[k]; }).sort(), kb = Object.keys(b).filter(function (k) { return b[k]; }).sort(); return ka.join() === kb.join() && ka.every(function (k) { return a[k] === b[k]; }); }

// ---- the stored form (float32 relative to the op's centre + the centre): what a reload reads. sets = {guid: Float64Array world}
function written(parts, meta) {
  var b = Ops.build(parts, 'beambars', meta), out = {};
  b.ops.forEach(function (o, i) {
    var v = b.assets[i].v, P = o.params, halfZ = (P.bbox[5] - P.bbox[4]) / 2, c = [P.placement.x, P.placement.y, P.placement.z + halfZ], W = new Float64Array(v.length);
    for (var k = 0; k < v.length; k += 3) { W[k] = v[k] + c[0]; W[k + 1] = v[k + 1] + c[1]; W[k + 2] = v[k + 2] + c[2]; }
    out[parts[i].guid] = W;
  });
  return out;
}
function opHash(rr, meta) { var b = Ops.build(rr.parts, 'beambars', meta), h = crypto.createHash('sha256'); h.update(JSON.stringify(b.ops)); b.assets.forEach(function (a) { h.update(Buffer.from(a.v.buffer)); }); h.update(JSON.stringify(b.elementParts)); h.update(JSON.stringify(rr.changes)); return h.digest('hex'); }

// ---- STATED (the oracle's check, on the written geometry): returns the mismatch list [[beam, set, text]]
function statedCheck(run, sets, meshOf) {
  var A = run.audit, bad = [], judged = 0, spJudged = 0, spSkips = 0, kids = {};
  Object.keys(sets).forEach(function (g) { var host = g.replace(/^GEN-RB-/, '').replace(/-(BOT|TOP|SIDE|STR)$/, ''), nm = g.slice(g.lastIndexOf('-') + 1); (kids[host] = kids[host] || {})[nm] = g; });
  A.hosts.forEach(function (gb) {
    if (A.unjoined.indexOf(gb) >= 0 || !A.REC[gb] || A.REC[gb].ds === undefined) return;
    var info = A.REC[gb], row = A.MARKS[A.HM[gb]], k = kids[gb] || {}, meas = {}; judged++;
    [['BOT', counter(info.bot_dias)], ['TOP', counter(info.top_dias)]].forEach(function (nw) {
      var name = nw[0], want = nw[1], ch = k[name] ? barChunks(sets[k[name]]) : [], got = {};
      ch.forEach(function (c) { if (Math.abs(c.dia - Math.round(c.dia)) > 0.01) bad.push([gb, name, 'dia ' + c.dia.toFixed(3) + ' is not a whole stated dia']); var d = Math.round(c.dia); got[d] = (got[d] || 0) + 1; });
      if (!sameCounter(got, want)) bad.push([gb, name, 'bars placed ' + JSON.stringify(got) + ' != stated ' + JSON.stringify(want)]);
      meas[name] = ch;
    });
    if (row.stirrup && !k.STR) bad.push([gb, 'STR', 'no stirrup set']);
    if (k.STR) {
      var lc = loopChunks(sets[k.STR]), n0 = lc[0].n, dsMm = row.stirrup[0], spMm = row.stirrup[1];
      if (lc.some(function (c) { return Math.abs(c.dia - dsMm) > 0.01; })) bad.push([gb, 'STR', 'stirrup dia != ' + dsMm]);
      var pos = lc.map(function (c) { return c.c[0] * n0[0] + c.c[1] * n0[1] + c.c[2] * n0[2]; }).sort(function (x, y) { return x - y; });
      for (var i = 0; i + 1 < pos.length; i++) { var gp = (pos[i + 1] - pos[i]) * 1000, kk = rhe(gp / spMm); spJudged++; if (kk < 1 || Math.abs(gp - kk * spMm) > 0.05) bad.push([gb, 'STR', 'gap ' + gp.toFixed(3) + ' mm is not a whole multiple of the stated ' + spMm + ' mm']); else if (kk > 1) spSkips += kk - 1; }
    }
    var sd = row.side ? Pack.parseSide(row.side) : null;
    if (info.side_levels && sd) {
      var ch2 = k.SIDE ? barChunks(sets[k.SIDE]) : [], face = { 0: [], 1: [] };
      if (ch2.length) {
        var a = ch2[0].a, vd = [-a[1], a[0], 0], vn = Math.hypot(vd[0], vd[1], vd[2]); vd = [vd[0] / vn, vd[1] / vn, vd[2] / vn];
        var lat = ch2.map(function (c) { return c.c[0] * vd[0] + c.c[1] * vd[1] + c.c[2] * vd[2]; }), mid = (Math.max.apply(null, lat) + Math.min.apply(null, lat)) / 2;
        ch2.forEach(function (c, ci) { face[lat[ci] <= mid ? 0 : 1].push(c.c[2]); }); face[0].sort(function (x, y) { return x - y; }); face[1].sort(function (x, y) { return x - y; });
      }
      var zA = Math.max.apply(null, meas.BOT.map(function (c) { return c.c[2]; }).concat([-1e9])), zB = Math.min.apply(null, meas.TOP.map(function (c) { return c.c[2]; }).concat([1e9])), Tm = meshOf(gb);
      if (!meas.BOT.length) zA = bboxOf(Tm)[0][2] + A.COVER + row.stirrup[0] / 1000; if (!meas.TOP.length) zB = bboxOf(Tm)[1][2] - A.COVER - row.stirrup[0] / 1000;
      var nexp = sd.kind === 'pitch' ? Math.ceil((zB - zA) / (sd.pitch / 1000) - 1e-9) - 1 : Math.floor(sd.n / 2); nexp = Math.max(nexp, 0);
      if (face[0].length !== nexp || face[1].length !== nexp) bad.push([gb, 'SIDE', 'levels per face ' + face[0].length + '/' + face[1].length + ' != expected ' + nexp + ' from the stored bottom/top bars']);
      if (ch2.some(function (c) { return Math.abs(c.dia - sd.dia) > 0.01; })) bad.push([gb, 'SIDE', 'dia != stated ' + sd.dia]);
      if (sd.kind === 'pitch') [0, 1].forEach(function (f) { var seq = [zA].concat(face[f], [zB]); for (var j = 0; j + 1 < seq.length; j++) if (seq[j + 1] - seq[j] > sd.pitch / 1000 + 1e-5) { bad.push([gb, 'SIDE', 'a gap exceeds the stated pitch ' + sd.pitch]); break; } });
    }
  });
  return { bad: bad, judged: judged, spJudged: spJudged, spSkips: spSkips };
}
function insideCheck(run, sets, meshOf, cover, tol) {   // every distinct stored vertex vs the host's TRUE mesh (never the rtree): min margin
  var A = run.audit, worst = Infinity, worstG = null, nBad = 0, nVert = 0, setsBad = [], TSC = {};
  Object.keys(sets).sort().forEach(function (g) {
    var host = g.replace(/^GEN-RB-/, '').replace(/-(BOT|TOP|SIDE|STR)$/, ''), TS = TSC[host] || (TSC[host] = new Pack.TriSet(meshOf(host))), W = sets[g], seen = {}, nb = 0, m = Infinity;
    for (var i = 0; i < W.length; i += 3) {
      var key = (Math.round(W[i] * 1e9) / 1e9) + ',' + (Math.round(W[i + 1] * 1e9) / 1e9) + ',' + (Math.round(W[i + 2] * 1e9) / 1e9); if (seen[key]) continue; seen[key] = 1; nVert++;
      var d = TS.signed([W[i], W[i + 1], W[i + 2]]); if (d < m) m = d; if (d < cover - tol) nb++;
    }
    nBad += nb; if (nb) setsBad.push(g); if (m < worst) { worst = m; worstG = g; }
  });
  return { sets: Object.keys(sets).length, nVert: nVert, nBad: nBad, setsBad: setsBad, worst: worst, worstG: worstG };
}

// ---- synthetic fixture (used only when the env paths are unset). Metres. Hand-derived truth in SYNTH below.
function boxTris(lo, hi, rotDeg) {
  var c = [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]];
  var F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], out = [], r = (rotDeg || 0) * Math.PI / 180, cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  F.forEach(function (t) { t.forEach(function (i) { var x = c[i][0] - cx, y = c[i][1] - cy; out.push(cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r), c[i][2]); }); }); return out;
}
// Truth by hand: a 4.000 x 0.300 x 0.600 m closed box beam, cover 40 mm, stirrup T10 @ 150, marks T1 (bottom 2T20 + 2T16 = mixed, top 2T16, side 2T12-300).
//  bar ends: a bar stops where its ring is 40.1 mm (cover + 0.1 mm fit margin) from the end faces -> length 4000 - 2 x 40.1 = 3919.8 mm.  Bars across the width: 4 in ONE layer (centre pitch 60.7 mm - 20 mm = 40.7 mm >= 25 mm).
//  Side bars: 2T12-300: zA = 58 mm, zB = 542 mm above the bottom -> ceil(484 / 300) = 2 segments -> 1 level per face -> 2 bars.   Stirrups: first loop at 45.2 mm, a loop's section reaches 5 mm further, so it fits at 40.2 mm; 27 positions, all fit.
var SYNTH = { len: 3919.8, bot: { 20: 2, 16: 2 }, top: { 16: 2 }, side: 2, loops: 27, sets: 8 };   // beams B1 (axis x) and B2 (turned 30 deg) each give BOT, TOP, SIDE, STR (4 sets); B3 has a mark not in the schedule -> NOT_BUILT
function synthetic(SQL) {
  var db = new SQL.Database();
  db.run('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  db.run('CREATE TABLE element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)'); db.run('CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, building TEXT)');
  var N = 0;
  function el(guid, cls, name, W) {
    var b = bboxOf(W), c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2], v = new Float32Array(W.length), f = new Uint32Array(W.length / 3); for (var i = 0; i < W.length; i += 3) { v[i] = W[i] - c[0]; v[i + 1] = W[i + 1] - c[1]; v[i + 2] = W[i + 2] - c[2]; } for (i = 0; i < f.length; i++) f[i] = i;
    db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', [guid, cls, name, 'Level 1', 'STR', 'Concrete', '0.6,0.6,0.6,1', 'SYN']); db.run('INSERT INTO element_transforms VALUES (?,?,?,?,0,0,0,?,?,?)', [guid, c[0], c[1], c[2], b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]]);
    db.run('INSERT INTO element_instances VALUES (?,?)', [guid, 'syn' + (++N)]); db.run('INSERT INTO component_geometries VALUES (?,?,?,?)', ['syn' + N, new Uint8Array(v.buffer), new Uint8Array(f.buffer), 'SYN']);
  }
  el('B1', 'IfcBeam', 'Beam - Concrete - Rectangular (M):T1(300x600):1', boxTris([0, 0, 3], [4, 0.3, 3.6], 0));
  el('B2', 'IfcBeam', 'Beam - Concrete - Rectangular (M):T1(300x600):2', boxTris([10, 0, 3], [14, 0.3, 3.6], 30));
  el('B3', 'IfcBeam', 'Beam - Concrete - Rectangular (M):T9(300x600):3', boxTris([20, 0, 3], [24, 0.3, 3.6], 0));
  el('S1', 'IfcBeam', 'Beam - Steel - UB - Universal Beams (M):UB600x190x101:4', boxTris([30, 0, 3], [34, 0.2, 3.6], 0));   // a steel beam: no mark in its name -> not a host
  return db;
}
var SYN_MARKS = { T1: { w: 300, h: 600, bottom: [[2, 20], [2, 16]], top: [[2, 16]], hanger: [], side: '2T12-300', stirrup: [10, 150], stirrup_legs: 2, stirrup_balance: null, stirrup_inner: '', source: 'synthetic table row 1' } };

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var REAL = !!(SRC && ORA && MARKS_FILE), srcDb, oraDb = null, marks, oLog = '';
  if (REAL) { srcDb = new SQL.Database(new Uint8Array(fs.readFileSync(SRC))); oraDb = new SQL.Database(new Uint8Array(fs.readFileSync(ORA))); marks = JSON.parse(fs.readFileSync(MARKS_FILE, 'utf8')); try { oLog = ORA_LOG ? fs.readFileSync(ORA_LOG, 'utf8') : ''; } catch (e) { oLog = ''; } }
  else { srcDb = synthetic(SQL); marks = SYN_MARKS; }
  console.log('§LODUP_MODE pack=beambars source=' + (REAL ? 'LODUP_SRC_DB (real)' : 'SYNTHETIC fixture (LODUP_SRC_DB / LODUP_ORACLE_DB / LODUP_MARKS_JSON unset)') + ' oracle=' + (REAL ? 'LODUP_ORACLE_DB' + (oLog ? ' + LODUP_ORACLE_LOG' : '') : 'none'));
  var inp = Reader.fromDb(srcDb), inpNo = Object.assign({}, inp);   // inpNo: no schedule loaded
  inp.inputs = { beambars: { schedule: marks } };
  var RULES = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/beambar_defaults.json'), 'utf8'))), RC = Rules.counts(RULES);
  console.log('§LODUP_RULES pack=beambars rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' unset=' + RC.unset);
  var run = function (rows, o, inpX) { return Pack.run(inpX || inp, rows, Object.assign({ log: function (l) { console.log(l); } }, o || {})); };
  var meshOf = function (g) { var m = inp.mesh(g), F = m.F, V = m.V; if (!F) return V; var o = new Float64Array(F.length * 3); for (var i = 0; i < F.length; i++) { o[3 * i] = V[3 * F[i]]; o[3 * i + 1] = V[3 * F[i] + 1]; o[3 * i + 2] = V[3 * F[i] + 2]; } return o; };

  // ---- NO_SCHEDULE: with nothing loaded the pack judges nothing and says so (INCONCLUSIVE, never PASS)
  var lg0 = [], r0 = Pack.run(inpNo, RULES, { log: function (l) { lg0.push(l); } }), ap0 = Pack.appliesTo(inpNo, RULES);
  verdict('NO_SCHEDULE', r0.parts.length === 0 && ap0 === 0 && /VACUOUS/.test(lg0.join('\n')) && /INCONCLUSIVE/.test(lg0.join('\n')) && !!r0.stats.say, 'no schedule loaded: parts=' + r0.parts.length + ' applies_to=' + ap0 + ' say="' + r0.stats.say + '" (a vacuous run is logged INCONCLUSIVE, not PASS)');

  var R = run(RULES, { breakCover: MAIN_BREAK }), parts = R.parts, A = R.audit, applies = Pack.appliesTo(inp, RULES), meta = inp.meta;
  verdict('NONVACUOUS', parts.length ? true : (applies ? false : null), 'applies_to=' + applies + ' sets=' + parts.length + ' beams_built=' + R.stats.beamsBuilt + ' added_verts=' + R.stats.addedVerts + (parts.length ? '' : ' (nothing judged)'));
  var mine = {}; parts.forEach(function (p) { mine[p.guid] = p; });
  var sets = written(parts, meta), nJoined = A.hosts.length - A.unjoined.length;

  if (!REAL) {   // ---- SYNTH_TRUTH: hand-derived expectations
    var sp = function (g) { return mine[g]; }, lens = function (g) { return barChunks(sets[g]).map(function (c) { return c.length * 1000; }); }, within = function (a, v, t) { return a.length > 0 && a.every(function (x) { return Math.abs(x - v) <= t; }); };
    var okAll = true, why = [];
    ['B1', 'B2'].forEach(function (b) {
      var g = function (s) { return 'GEN-RB-' + b + '-' + s; };
      if (!sp(g('BOT')) || !sp(g('TOP')) || !sp(g('SIDE')) || !sp(g('STR'))) { okAll = false; why.push(b + ' set missing'); return; }
      var bc = barChunks(sets[g('BOT')]), tc = barChunks(sets[g('TOP')]), sc = barChunks(sets[g('SIDE')]), lc = loopChunks(sets[g('STR')]);
      if (!sameCounter(counter(bc.map(function (c) { return Math.round(c.dia); })), SYNTH.bot) || !sameCounter(counter(tc.map(function (c) { return Math.round(c.dia); })), SYNTH.top) || sc.length !== SYNTH.side || lc.length !== SYNTH.loops) { okAll = false; why.push(b + ' bar counts bot/top/side/loops ' + bc.length + '/' + tc.length + '/' + sc.length + '/' + lc.length); }
      if (!within(lens(g('BOT')), SYNTH.len, 0.05) || !within(lens(g('TOP')), SYNTH.len, 0.05) || !within(lens(g('SIDE')), SYNTH.len, 0.05)) { okAll = false; why.push(b + ' bar length not ' + SYNTH.len + ' mm: ' + lens(g('BOT')).map(function (x) { return x.toFixed(2); }).join('/')); }
    });
    var dirB2 = barChunks(sets['GEN-RB-B2-BOT'])[0].a, ang = Math.abs(Math.abs(dirB2[0] * Math.cos(Math.PI / 6) + dirB2[1] * Math.sin(Math.PI / 6)) - 1);
    if (ang > 1e-6) { okAll = false; why.push('B2 bars not along the beam axis (30 deg): ' + ang.toExponential(2)); }
    var nb = R.changes.filter(function (c) { return c.kind === 'NOT_BUILT' && c.host === 'B3' && /No schedule row/.test(c.rule); }).length;
    if (nb !== 1 || A.unjoined.join() !== 'B3' || A.hosts.indexOf('S1') >= 0 || parts.length !== SYNTH.sets) { okAll = false; why.push('join: unjoined=' + A.unjoined.join() + ' hosts=' + A.hosts.join() + ' sets=' + parts.length); }
    verdict('SYNTH_TRUTH', okAll && !why.length, 'two concrete beams (one turned 30 deg) x {BOT 2T20 + 2T16 mixed in one layer, TOP 2T16, SIDE 2T12-300 -> 2 bars, STR T10 @ 150 -> 27 loops}, every bar ' + SYNTH.len + ' mm = 4000 - 2 x 40.1; B3 (mark not in the schedule) NOT_BUILT ' + nb + '; the steel beam is not a host' + (why.length ? ' | ' + why.join('; ') : '') +
      ' (hand-derived: cover 40 + 0.1 fit margin from each end face; 4 bars one layer: 60.7 - 20 = 40.7 >= 25 mm; side zA 58, zB 542 -> ceil(484/300) = 2 -> 1 level per face; loops 45.2 + 150 k <= 3954.8 -> 27)');
    verdict('PARITY', null, 'no oracle (synthetic fixture): sets / names / vertices / change rows / STATED mismatches not compared');
  } else {
    // ---- PARITY_JOIN
    var oraHosts = q(oraDb, "SELECT DISTINCT parent_guid FROM element_parts WHERE child_guid LIKE 'GEN-RB-%' ORDER BY 1").map(function (v) { return v[0]; });
    verdict('PARITY_JOIN', A.hosts.length > 0 && A.unjoined.length === 0 && nJoined === A.hosts.length, 'beams matched by the rule rows=' + A.hosts.length + ' joined=' + nJoined + ' unjoined=' + A.unjoined.length + ' marks_used=' + Object.keys(A.used).length + ' of ' + Object.keys(A.MARKS).length + ' unused=' + JSON.stringify(A.unused) + ' oracle_beams_with_sets=' + oraHosts.length);
    // ---- PARITY_SETS + NAMES
    var oraEl = {}; q(oraDb, "SELECT m.guid, m.ifc_class, m.element_name, p.parent_guid FROM elements_meta m JOIN element_parts p ON p.child_guid = m.guid WHERE m.guid LIKE 'GEN-RB-%' ORDER BY m.guid").forEach(function (v) { oraEl[v[0]] = { cls: v[1], name: v[2], host: v[3] }; });
    var oraIds = Object.keys(oraEl).sort(), mIds = Object.keys(mine).sort(), onlyO = oraIds.filter(function (g) { return !mine[g]; }), onlyM = mIds.filter(function (g) { return !oraEl[g]; }), hostBad = mIds.filter(function (g) { return oraEl[g] && (mine[g].parents.join() !== oraEl[g].host); });
    verdict('PARITY_SETS', oraIds.length > 0 && !onlyO.length && !onlyM.length && !hostBad.length, 'oracle_sets=' + oraIds.length + ' js_sets=' + mIds.length + ' only_in_oracle=' + onlyO.length + ' only_in_js=' + onlyM.length + ' host_differs=' + hostBad.length + (onlyO[0] ? ' first_only_oracle=' + onlyO[0] : '') + (onlyM[0] ? ' first_only_js=' + onlyM[0] : ''));
    var nmBad = mIds.filter(function (g) { return oraEl[g] && (oraEl[g].name !== mine[g].name || oraEl[g].cls !== mine[g].cls); });
    verdict('PARITY_NAMES', oraIds.length > 0 && !nmBad.length, 'names_compared=' + mIds.filter(function (g) { return oraEl[g]; }).length + ' differing=' + nmBad.length + ' (count, stated bars incl. mixed diameters, stirrup dia @ spacing, mark, source)' + (nmBad[0] ? ' first=' + JSON.stringify([nmBad[0], oraEl[nmBad[0]].name.slice(0, 80), mine[nmBad[0]].name.slice(0, 80)]) : ''));
    // ---- PARITY_VERTICES (world)
    var ora = {}; q(oraDb, "SELECT i.guid, c.vertices, t.center_x, t.center_y, t.center_z FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) WHERE i.guid LIKE 'GEN-RB-%' ORDER BY i.guid")
      .forEach(function (v) { var b = v[1], f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), W = new Float64Array(f.length); for (var i = 0; i < f.length; i += 3) { W[i] = f[i] + v[2]; W[i + 1] = f[i + 1] + v[3]; W[i + 2] = f[i + 2] + v[4]; } ora[v[0]] = W; });
    var vcBad = 0, maxD = 0, nVert = 0, off = [];
    mIds.forEach(function (g) { if (!ora[g]) return; var a2 = mine[g].tris, b2 = ora[g]; if (a2.length !== b2.length) { vcBad++; return; } nVert += a2.length / 3; var d = 0; for (var i = 0; i < a2.length; i++) { var dd = Math.abs(a2[i] - b2[i]); if (dd > d) d = dd; } if (d > maxD) maxD = d; if (d > VTOL) off.push(g + ' delta_mm=' + (d * 1000).toFixed(4)); });
    verdict('PARITY_VERTICES', vcBad === 0 && nVert > 0 && !off.length, 'sets_compared=' + mIds.filter(function (g) { return ora[g]; }).length + ' vertices_compared=' + nVert + ' vertex_count_mismatch_sets=' + vcBad + ' max_world_delta_mm=' + (maxD * 1000).toFixed(6) + ' tolerance=0.01 mm | sets outside tolerance: ' + (off.length ? off.slice(0, 5).join('; ') + (off.length > 5 ? ' ... (' + off.length + ')' : '') : 'none'));
    // ---- PARITY_CHANGELIST: the oracle's rows after the source rows
    var n0 = q(srcDb, 'SELECT COALESCE(MAX(seq), 0) FROM upgrade_changes')[0][0], oraCh = q(oraDb, 'SELECT seq, change, guid, ifc_class, host_guid, rule, detail FROM upgrade_changes WHERE seq > ? ORDER BY seq', [n0]).map(function (v) { return { kind: v[1], guid: v[2], cls: v[3], host: v[4], rule: v[5], detail: v[6] }; });
    var chBad = [], nC = Math.min(oraCh.length, R.changes.length);
    for (var ci = 0; ci < nC; ci++) { var o1 = oraCh[ci], m1 = R.changes[ci]; ['kind', 'guid', 'cls', 'host', 'rule', 'detail'].forEach(function (f) { if (o1[f] !== m1[f]) chBad.push([ci + 1 + n0, f, String(o1[f]).slice(0, 120), String(m1[f]).slice(0, 120)]); }); }
    var kindsO = counter(oraCh.map(function (c) { return c.kind; })), kindsM = counter(R.changes.map(function (c) { return c.kind; }));
    verdict('PARITY_CHANGELIST', oraCh.length > 0 && oraCh.length === R.changes.length && chBad.length === 0, 'source_rows_kept=' + n0 + ' oracle_rows=' + oraCh.length + ' js_rows=' + R.changes.length + ' by_kind oracle=' + JSON.stringify(kindsO) + ' js=' + JSON.stringify(kindsM) + ' field_mismatches=' + chBad.length + (chBad[0] ? ' first=' + JSON.stringify(chBad[0]) : ''));
    // ---- STATED: reproduced (the oracle states a FAIL of its own); the same mismatches on the same beams, on the JS sets and on the oracle's sets
    var stJ = statedCheck(R, sets, meshOf), stO = statedCheck(R, ora, meshOf), key = function (b) { return b.map(function (x) { return x[0] + '|' + x[1]; }).sort().join(); }, byS = function (b) { return JSON.stringify(counter(b.map(function (x) { return x[1]; }))); };
    var beamsOf = function (b) { var o = {}; b.forEach(function (x) { o[A.HM[x[0]] + ' ' + String(meta[x[0]].name).split(':').pop()] = 1; }); return Object.keys(o).sort(); };
    var oraStatedNum = /set_mismatches=(\d+)/.exec(oLog.split('\n').filter(function (l) { return /STATED/.test(l); })[0] || '');
    console.log('§LODUP_STATED beams_judged=' + stJ.judged + ' set_mismatches=' + stJ.bad.length + ' by_set=' + byS(stJ.bad) + ' beams_affected=' + beamsOf(stJ.bad).length + ' (mark, Revit id)=' + JSON.stringify(beamsOf(stJ.bad)) + ' stirrup_gaps_checked=' + stJ.spJudged + ' skipped_positions_inside_gaps=' + stJ.spSkips + (stJ.bad[0] ? ' first=' + JSON.stringify(stJ.bad[0]) : '') + ' -> ' + (stJ.bad.length ? 'FAIL (the oracle states the same FAIL: see PARITY_STATED)' : 'PASS'));
    verdict('PARITY_STATED', stJ.judged > 0 && stJ.bad.length > 0 && key(stJ.bad) === key(stO.bad) && stJ.bad.length === stO.bad.length && (!oraStatedNum || +oraStatedNum[1] === stJ.bad.length), 'JS mismatches=' + stJ.bad.length + ' on the oracle sets=' + stO.bad.length + ' same sets=' + (key(stJ.bad) === key(stO.bad)) + ' beams=' + JSON.stringify(beamsOf(stJ.bad)) + (oraStatedNum ? ' oracle_log_mismatches=' + oraStatedNum[1] : ' (no LODUP_ORACLE_LOG: the oracle sets re-measured by the same check are the reference)') + ' (the oracle FAILS STATED on 2 beams, composite meshes; reproduced, not tuned)');
    // ---- LAP: every bar over the stock length flagged, the same set as the oracle's stored bars
    var lapJ = [], lapO = [], flagged = {}; R.changes.forEach(function (c) { if (/needs lap \(not modelled\)/.test(c.detail)) flagged[c.host] = 1; });
    Object.keys(sets).sort().forEach(function (g) { if (!/-(BOT|TOP|SIDE)$/.test(g)) return; barChunks(sets[g]).forEach(function (c) { if (c.length > A.STOCK) lapJ.push(g); }); });
    Object.keys(ora).sort().forEach(function (g) { if (!/-(BOT|TOP|SIDE)$/.test(g)) return; barChunks(ora[g]).forEach(function (c) { if (c.length > A.STOCK) lapO.push(g); }); });
    var unflag = lapJ.filter(function (g) { return !flagged[g.replace(/^GEN-RB-/, '').replace(/-(BOT|TOP|SIDE)$/, '')]; }), oLap = /over_12m=(\d+)/.exec(oLog);
    verdict('LAP', lapJ.length > 0 && lapJ.length === lapO.length && !unflag.length && (!oLap || +oLap[1] === lapJ.length), 'bars_over_stock=' + lapJ.length + ' oracle_bars_over_stock=' + lapO.length + ' in_beams=' + Object.keys(counter(lapJ.map(function (g) { return g.replace(/^GEN-RB-/, '').replace(/-(BOT|TOP|SIDE)$/, ''); }))).length + ' unflagged=' + unflag.length + (oLap ? ' oracle_log=' + oLap[1] : ''));
  }

  // ---- STATED on the synthetic fixture (hand-derived: must PASS) / INSIDE on the written geometry
  if (!REAL) { var stS = statedCheck(R, sets, meshOf); verdict('STATED', stS.judged ? stS.bad.length === 0 : null, 'beams_judged=' + stS.judged + ' set_mismatches=' + stS.bad.length + (stS.bad[0] ? ' first=' + JSON.stringify(stS.bad[0]) : '')); }
  var ins = insideCheck(R, sets, meshOf, A.COVER, 1e-3), oraIns = REAL ? insideCheck(R, (function () { var o = {}; q(oraDb, "SELECT i.guid, c.vertices, t.center_x, t.center_y, t.center_z FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) WHERE i.guid LIKE 'GEN-RB-%' ORDER BY i.guid").forEach(function (v) { var b = v[1], f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), W = new Float64Array(f.length); for (var i = 0; i < f.length; i += 3) { W[i] = f[i] + v[2]; W[i + 1] = f[i + 1] + v[3]; W[i + 2] = f[i + 2] + v[4]; } o[v[0]] = W; }); return o; })(), meshOf, A.COVER, 1e-3) : null;
  var oIns = /distinct_vertices=(\d+)/.exec(oLog.split('\n').filter(function (l) { return /INSIDE/.test(l); })[0] || '');
  var insV = verdict('INSIDE', ins.nVert ? ins.nBad === 0 : null, 'sets=' + ins.sets + ' distinct_vertices=' + ins.nVert + ' violating_vertices=' + ins.nBad + ' sets_violating=' + ins.setsBad.length + ' min_margin_mm=' + (ins.worst * 1000).toFixed(3) + ' (worst set ' + ins.worstG + ') required>=cover-1mm (cover ' + A.COVER * 1000 + '; the stored float32 + centre vs the beam\'s TRUE mesh, cover rule row ' + (MAIN_BREAK ? 'with placement cover OFF = the broken run' : 'kept') + ')' +
    (oraIns ? ' | oracle sets measured the same way: distinct_vertices=' + oraIns.nVert + ' min_margin_mm=' + (oraIns.worst * 1000).toFixed(3) + (oIns ? ' oracle_log_distinct_vertices=' + oIns[1] : '') : ''));
  if (REAL && !MAIN_BREAK) verdict('PARITY_INSIDE', oraIns.nVert === ins.nVert && Math.abs(oraIns.worst - ins.worst) < 1e-5 && (!oIns || +oIns[1] === ins.nVert), 'distinct_vertices js=' + ins.nVert + ' oracle=' + oraIns.nVert + (oIns ? ' log=' + oIns[1] : '') + ' min_margin_mm js=' + (ins.worst * 1000).toFixed(4) + ' oracle=' + (oraIns.worst * 1000).toFixed(4));

  // ---- CENTRE (through the same function the pill uses to write ops)
  var built = Ops.build(parts, 'beambars', meta), cBad = 0, maxC = 0, poBad = 0;
  built.ops.forEach(function (o, i) {
    var P = o.params, W = parts[i].tris, bb = bboxOf(W), halfZ = (bb[1][2] - bb[0][2]) / 2, cen = [P.placement.x, P.placement.y, P.placement.z + halfZ], bc = [0, 1, 2].map(function (a) { return (bb[0][a] + bb[1][a]) / 2; });
    var d = Math.max(Math.abs(cen[0] - bc[0]), Math.abs(cen[1] - bc[1]), Math.abs(cen[2] - bc[2])); if (d > maxC) maxC = d; if (d > 1e-6) cBad++;
    if (P.provenance !== 'generated:beambars' || o.op_type !== 'GEOM_INSERT' || !/capacity not checked/.test(P.note)) cBad++;
    if (!P.parts_of || P.parts_of.join() !== parts[i].parents.join() || P.parts_of.length !== 1 || P.attached_to !== undefined) poBad++;
  });
  verdict('CENTRE', built.ops.length ? (cBad === 0 && poBad === 0 && built.elementParts.length === parts.length) : null, 'ops=' + built.ops.length + ' centre_not_own_bbox_centre=' + cBad + ' max_delta_m=' + maxC.toExponential(2) + ' parts_of_wrong=' + poBad + ' element_parts_rows=' + built.elementParts.length + ' (provenance generated:beambars, parts_of = the beam, own bbox centre, not the beam\'s)');

  // ---- SCHEDULE_INPUT: the marks file is checked before use; a malformed one is refused with its reason
  var good = Pack.validateMarks(marks), bad1 = Pack.validateMarks([]), bad2 = Pack.validateMarks({}), bad3 = Pack.validateMarks({ X: { w: 300, h: 600, bottom: [[2]], top: [] } }), bad4 = Pack.validateMarks({ X: { w: 300, h: 600, bottom: [[2, 16]], top: [], stirrup: [10] } });
  verdict('SCHEDULE_INPUT', good.ok && !bad1.ok && !bad2.ok && !bad3.ok && !bad4.ok && !!bad3.why && !!bad4.why, 'the loaded file: ' + good.summary + ' accepted=' + good.ok + ' | refused: array="' + bad1.why + '", empty="' + bad2.why + '", bad bars="' + bad3.why + '", bad stirrup="' + bad4.why + '"');

  // ---- RULES (on a two-beam model so it stays quick): a stated cover edit changes the result; a default edit over it is refused; the join rows decide the hosts; a mark with no row is NOT_BUILT
  (function () {
    var two = A.hosts.slice(0, 2), meta2 = {}; two.forEach(function (g) { meta2[g] = meta[g]; });
    var inp2 = Object.assign({}, inp, { meta: meta2, src: {} }), base = Pack.run(inp2, RULES, { log: function () { } }),
      t1 = Rules.merge(RULES, { beam_cover_mm: { value: 50, source: 'stated: test edit' } }), t2 = Rules.merge(t1.rows, { beam_cover_mm: { value: 30, source: 'default: attempt' } }), r50 = Pack.run(inp2, t1.rows, { log: function () { } });
    var len = function (rr) { var g = rr.parts.filter(function (p) { return /-BOT$/.test(p.guid); })[0]; return g ? barChunks(written([g], meta2)[g.guid])[0].length * 1000 : null; };
    var l40 = len(base), l50 = len(r50), dL = l40 - l50;
    var rx = Rules.merge(RULES, { mark_regex: { value: ':(ZZ[0-9]+)\\(', source: 'stated: test edit' } }), rj = Pack.run(inp2, rx.rows, { log: function () { } });
    var one = A.hosts.filter(function (g) { return A.HM[g] === A.HM[two[0]]; })[0], marks2 = {}; Object.keys(marks).forEach(function (k) { if (k !== A.HM[two[0]]) marks2[k] = marks[k]; });
    var inp3 = Object.assign({}, inp2, { inputs: { beambars: { schedule: marks2 } } }), r3 = Pack.run(inp3, RULES, { log: function () { } }), nbRows = r3.changes.filter(function (c) { return c.kind === 'NOT_BUILT' && /No schedule row/.test(c.rule); });
    var noSrc = Object.keys(RULES).filter(function (k) { return !/^(default|stated|unset)/.test(String(RULES[k].source)); });
    verdict('RULES', base.parts.length > 0 && l40 !== null && Math.abs(dL - 20) < (REAL ? 0.5 : 0.05) && t2.refused.length === 1 && t2.rows.beam_cover_mm.value === 50 && rj.parts.length === 0 && nbRows.length >= 1 && noSrc.length === 0,
      'cover 40 -> 50 (stated): a bar is ' + (l40 && l40.toFixed(2)) + ' -> ' + (l50 && l50.toFixed(2)) + ' mm (shorter by ' + (dL && dL.toFixed(2)) + ' = 2 x 10 within ' + (REAL ? '0.5 mm: the real beam end is not a plain box face' : '0.05 mm') + '); a default edit over the stated row refused=' + t2.refused.length + '; mark_regex edited to match nothing: parts=' + rj.parts.length + '; mark "' + A.HM[two[0]] + '" removed from the schedule: NOT_BUILT "No schedule row" rows=' + nbRows.length + ' (nothing guessed); rows=' + RC.total + ' all with a source (' + noSrc.length + ' without)');
  })();

  // ---- DETERMINISM: two runs, the same op hash
  var h1 = opHash(R, meta), t1s = Date.now(), R2 = run(RULES, { breakCover: MAIN_BREAK }), h2 = opHash(R2, meta);
  verdict('DETERMINISM', parts.length ? h1 === h2 : null, 'run1=' + h1.slice(0, 16) + ' run2=' + h2.slice(0, 16) + ' (the ops, the float32 meshes, the element_parts rows and the change rows)');

  // ---- BREAK: the cover dropped at placement; INSIDE (judged against the cover rule row) must FAIL INSIDE
  if (!MAIN_BREAK) {
    var RBk = run(RULES, { breakCover: true }), setsB = written(RBk.parts, meta), insB = insideCheck(RBk, setsB, meshOf, A.COVER, 1e-3), bw = insB.nVert ? (insB.nBad > 0 ? 'FAIL' : 'PASS') : 'INCONCLUSIVE';
    verdict('BREAK_CHECK', bw === 'FAIL', 'switch=on (placement cover 0: bars and loops touch the beam surface; ' + RBk.stats.added + ' sets written) expected INSIDE=FAIL got INSIDE=' + bw + ' (violating_vertices=' + insB.nBad + ' of ' + insB.nVert + ' distinct, sets_violating=' + insB.setsBad.length + ', min_margin_mm=' + (insB.worst * 1000).toFixed(3) + ')');
  } else console.log('§LODUP_BREAK_CHECK main run is the broken run: INSIDE=' + insV + ' (expected FAIL) -> ' + (insV === 'FAIL' ? 'PASS' : 'FAIL'));

  // ---- change list text
  var txt = Ops.changeText(R.changes, { model: 'witness', pack: 'beambars', rules: RC }), dl = txt.split('\n').filter(function (l) { return /^\d+ \| /.test(l); }).length;
  verdict('CHANGELIST_TXT', R.changes.length ? dl === R.changes.length : null, 'data_lines=' + dl + ' rows=' + R.changes.length + ' wording_line=' + /capacity not checked/.test(txt));

  // ---- REGISTRY: the chooser lists the packs with the dialog generic; the schedule input is declared by the pack; lod_ui.js is the P6 file (the file-input row)
  var uiSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'lod/lod_ui.js'))).digest('hex'), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/packs.json'), 'utf8')), manIds = man.packs.map(function (p) { return p.id; });
  var filesOk = man.packs.every(function (p) { return fs.existsSync(path.join(ROOT, 'lod', p.file)); });
  Registry.clear(); [Rebar, Weld, Layer, Joint, Gusset, Pack].forEach(function (p) { Registry.register(p); });
  var rowsOf = function (id) { return id === 'beambars' ? RULES : !Registry.get(id).rulesFile ? {} : Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod', Registry.get(id).rulesFile), 'utf8'))); };
  var ruleFilesOk = Registry.list().every(function (p) { return !p.rulesFile || fs.existsSync(path.join(ROOT, 'lod', p.rulesFile)); }), dNo = Registry.describe(inpNo, function (id) { return id === 'beambars' ? RULES : {}; }, Rules).filter(function (x) { return x.id === 'beambars'; })[0];
  var d1 = Registry.describe(inp, function (id) { return id === 'beambars' ? RULES : (rowsOf(id)); }, Rules), bRow = d1.filter(function (x) { return x.id === 'beambars'; })[0];
  Registry.register({ id: 'dummy', label: 'Dummy (test pack)', appliesTo: function () { return 0; }, run: function () { return { parts: [], changes: [] }; } });
  var d2 = Registry.describe(inp, rowsOf, Rules);
  verdict('REGISTRY', d1.map(function (x) { return x.id; }).join() === 'rebar,welds,layers,joints,gussets,beambars' && manIds.join() === 'rebar,welds,layers,joints,gussets,beambars' && filesOk && ruleFilesOk && bRow && bRow.label === 'Beam rebar (schedule)' && bRow.appliesTo === applies && dNo.appliesTo === 0 &&
    bRow.inputs && bRow.inputs.length === 1 && bRow.inputs[0].id === 'schedule' && /Load schedule/.test(bRow.inputs[0].label) && d2.length === d1.length + 1 && (uiSha === LOD_UI_SHA) !== false,
    'listed=' + d1.map(function (x) { return x.id + ':"' + x.label + '"(' + x.appliesTo + ')'; }).join(',') + ' packs.json=' + manIds.join() + ' pack_files_exist=' + filesOk + ' rules_files_exist=' + ruleFilesOk + ' beambars_applies_to=' + (bRow && bRow.appliesTo) + ' (0 without a schedule: ' + (dNo && dNo.appliesTo) + ') input="' + (bRow && bRow.inputs && bRow.inputs[0] && bRow.inputs[0].label) + '" after_one_more=' + d2.length + ' lod_ui_sha=' + uiSha.slice(0, 16));

  // ---- cost (PERF BUDGET)
  var srcVerts = 0; try { srcVerts = q(srcDb, 'SELECT SUM(length(c.vertices) / 12) FROM element_instances i JOIN component_geometries c USING(geometry_hash)')[0][0] || 0; } catch (e) { srcVerts = 0; }
  console.log('§LODUP_COST pack=beambars addedVerts=' + R.stats.addedVerts + ' modelVerts=' + srcVerts + ' addedPct=' + (srcVerts ? (100 * R.stats.addedVerts / srcVerts).toFixed(2) : '-') + ' heapMB=' + (R.stats.addedVerts * 170 / 1e6).toFixed(2) + ' (0.17 GB per M vertices) warnOver1M=' + (R.stats.addedVerts > 1e6) + ' ms=' + R.stats.ms);
  console.log('§LODUP_SUMMARY pack=beambars failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + (INCONC.length ? INCONC.join(',') : 'none') + ' mode=' + (REAL ? 'real' : 'synthetic') + ' break=' + (MAIN_BREAK ? 1 : 0));
  process.exit(MAIN_BREAK ? (insV === 'FAIL' ? 0 : 1) : FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_CRASH ' + (e && e.stack || e)); process.exit(2); });
