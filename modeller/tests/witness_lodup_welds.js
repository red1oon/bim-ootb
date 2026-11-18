#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-WELDS: the LOD Upgrade pill's "Truss welds" pack (JS) equals the proven Python run. Read the log after every run (§LODUP_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md §4 P2 and "P2 SPEC". Oracle: BIMCompiler scripts/lod/rebar_from_schedule.py section B (truss welds, outward-winding fix of 2026-11-18), output SHED_rebar.db.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: "the browser result differs from the proven Python result".
 *   PARITY_WELDS      the same weld guids (member, end, plate); the contact scan = the oracle log's end / through counts.
 *   PARITY_REFUSED    the same REFUSED rows with the same reasons (the perpendicular contacts) and the same NOT_BUILT members.
 *   PARITY_CHANGELIST the weld rows of the change list equal the oracle's upgrade_changes rows, field by field.
 *   PARITY_VERTICES   every WORLD vertex within 0.01 mm of the oracle's.
 *   SIZE              each bead's leg, measured on its stored cap triangle, equals AISC 360-16 Table J2.4 for the thinner part (read from the element names HERE, not by the pack).
 *   WELD_WINDING      each bead 24 vertices, every directed edge exactly once and its reverse exactly once, signed volume > 0.
 *   CENTRE            each op's centre = its own bbox centre; provenance generated:welds; attached_to member + plate; no parts_of / element_parts row.
 *   DETERMINISM       two runs, the same op hash.     REGISTRY  the chooser lists exactly the registered packs; one more pack adds one row; lod_ui.js is the P1 file, byte for byte.
 *   BREAK             breakWinding (the pre-correction inward caps) must make WELD_WINDING FAIL (LODUP_BREAK=1 makes the MAIN run the broken run, expect exit through the same FAIL).
 * Inputs by environment only (no project path in the repo): LODUP_SRC_DB (extracted building DB), LODUP_ORACLE_DB (the Python output DB), both read only; LODUP_ORACLE_LOG (optional; default <dir of the oracle DB>/log/run1.log).
 * Either DB unset -> a SYNTHETIC fixture with hand-derived truth (stated on the first line): SYNTH_TRUTH judges it, parity is then INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
global.window = undefined;   // pure node: the packs must not need a browser
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..');
var Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Pack = require(path.join(ROOT, 'lod/weld_pack.js')), Rebar = require(path.join(ROOT, 'lod/rebar_pack.js')), Ops = require(path.join(ROOT, 'lod/lod_ops.js')),
  Reader = require(path.join(ROOT, 'lod/lod_reader.js')), Registry = require(path.join(ROOT, 'lod/lod_registry.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var SRC = process.env.LODUP_SRC_DB, ORA = process.env.LODUP_ORACLE_DB, MAIN_BREAK = process.env.LODUP_BREAK === '1';
var P1_LOD_UI_SHA = 'bb35df181b869aa8056b6e78f466880e4debad598ac4c0eda1c69aca439f8fb5';   // lod/lod_ui.js as of P8 (Formats link, Load schedule reads a .dxf; the NAME FIX file was 03791bfb8a26caea); as of the P7 NAME FIX (download names drop the .db; the P7 file was 37e57cb76e4092bf); as of P7 (it gained the Add-on IFC row and the sliced run driver; the P6 file was dfb5d321c6f86f8c); lod/lod_ui.js as of P6 (it gained the declared-input button row and the live-neighbours reader; the P3 file was 703b8250e980def7); lod/lod_ui.js as of the P3 fix (live host hide + 'not applicable here'); it was the P1 file (c6c4ac30...) until then
var FAILS = [], INCONC = [];
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
function q(db, sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }

// ---- synthetic fixture (used only when the two env paths are unset). Metres. Hand-derived truth in SYNTH below.
function boxTris(lo, hi) {
  var c = [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]];
  var F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], out = [];
  F.forEach(function (t) { t.forEach(function (i) { out.push(c[i][0], c[i][1], c[i][2]); }); }); return out;
}
var T_PLATE = 0.00635, LEG = 0.038, BOX_TOL = 0.008;   // BOX_TOL: the oracle takes the member axis from the covariance of the triangle-soup vertices (corners repeat unevenly), so a box member's axis tilts by a fraction of a degree; the port inherits it, the hand box is met to 8 mm
var SYNTH = { welds: ['GEN-WD-MEM_A-A-PLT_1', 'GEN-WD-MEM_B-T-PLT_1'], refused: ['MEM_C'], notBuilt: ['MEM_D'], contacts: 3, end: 1, through: 2, lenMm: { 'GEN-WD-MEM_A-A-PLT_1': 100, 'GEN-WD-MEM_B-T-PLT_1': 500 }, sizeMm: 5, addedVerts: 96 };
function synthetic(SQL) {
  var db = new SQL.Database();
  db.run('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  db.run('CREATE TABLE element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)'); db.run('CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, building TEXT)');
  var N = 0;
  function el(guid, cls, name, lo, hi) {
    var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], W = boxTris(lo, hi), v = new Float32Array(W.length); for (var i = 0; i < W.length; i += 3) { v[i] = W[i] - c[0]; v[i + 1] = W[i + 1] - c[1]; v[i + 2] = W[i + 2] - c[2]; }
    db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', [guid, cls, name, 'Level 1', 'STR', 'Steel', '0.5,0.5,0.5,1', 'SYN']); db.run('INSERT INTO element_transforms VALUES (?,?,?,?,0,0,0,?,?,?)', [guid, c[0], c[1], c[2], hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]);
    db.run('INSERT INTO element_instances VALUES (?,?)', [guid, 'syn' + (++N)]); db.run('INSERT INTO component_geometries VALUES (?,?,?,?)', ['syn' + N, new Uint8Array(v.buffer), new Uint8Array(0), 'SYN']);
  }
  var ang = '1.5"x1.5"x1/4" Angle';
  el('PLT_1', 'IfcPlate', '1/4" Thickness Plate', [0, 0, 0], [0.5, 0.3, T_PLATE]);
  el('MEM_A', 'IfcMember', ang, [0.4, 0.1, 0.003], [0.9, 0.1 + LEG, 0.003 + LEG]);        // overlaps the plate over x 0.4..0.5 = its own start: END A, 100 mm
  el('MEM_B', 'IfcMember', ang, [-0.5, 0.2, 0.003], [1.0, 0.2 + LEG, 0.003 + LEG]);       // crosses the whole plate mid-span: THROUGH, 500 mm
  el('MEM_C', 'IfcMember', ang, [0.2, 0.1, -0.3], [0.2 + LEG, 0.1 + LEG, 0.3]);            // stands across the plate face: REFUSED (axis not parallel to the plate plane)
  el('MEM_D', 'IfcMember', ang, [3, 0, 0], [3.5, LEG, LEG]);                               // far away: NOT_BUILT
  return db;
}

// ---- independent checks on the stored vertices (not the generator's own variables)
var J24 = [[6, 3], [13, 5], [19, 6], [999, 8]];   // AISC 360-16 Table J2.4: minimum fillet size by thinner part joined (mm)
function j24(tMm) { for (var i = 0; i < J24.length; i++) if (tMm <= J24[i][0]) return J24[i][1]; return null; }
function frac(s) { var m = /^(\d+)(?:\/(\d+))?$/.exec(s); return m ? (m[2] ? +m[1] / +m[2] : +m[1]) * 25.4 : null; }
function legsFromName(plate, member) { var a = /(\d+(?:\/\d+)?)"\s*Thickness/.exec(plate || ''), b = /x(\d+\/\d+)"/.exec(member || ''); return [a ? frac(a[1]) : null, b ? frac(b[1]) : null]; }
function winding(parts) {
  var bad = [], beads = 0, volMin = null;
  parts.forEach(function (p) {
    var W = p.tris; if (W.length % 72) { bad.push([p.guid, 'vertices ' + W.length / 3]); return; }
    for (var o = 0; o < W.length; o += 72) {
      beads++; var dirs = {}, key = function (i) { return [W[i], W[i + 1], W[i + 2]].map(function (x) { return (Math.round(x * 1e6) / 1e6).toFixed(6); }).join(','); }, vol = 0, t, k;
      for (t = 0; t < 8; t++) {
        var ids = [0, 1, 2].map(function (k) { return o + 9 * t + 3 * k; });
        for (k = 0; k < 3; k++) { var kk = key(ids[k]) + '>' + key(ids[(k + 1) % 3]); dirs[kk] = (dirs[kk] || 0) + 1; }
        var a = [W[ids[0]], W[ids[0] + 1], W[ids[0] + 2]], b = [W[ids[1]], W[ids[1] + 1], W[ids[1] + 2]], c = [W[ids[2]], W[ids[2] + 1], W[ids[2] + 2]];
        vol += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      }
      vol /= 6; var once = true, paired = true; Object.keys(dirs).forEach(function (d) { if (dirs[d] !== 1) once = false; var r = d.split('>'); if (dirs[r[1] + '>' + r[0]] !== 1) paired = false; });
      volMin = volMin === null ? vol : Math.min(volMin, vol); if (!(once && paired && vol > 0)) bad.push([p.guid, (o / 72) | 0, once, paired, vol]);
    }
  });
  return { bad: bad, beads: beads, volMin: volMin };
}
function bboxOf(W) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < W.length; i += 3) for (var a = 0; a < 3; a++) { if (W[i + a] < lo[a]) lo[a] = W[i + a]; if (W[i + a] > hi[a]) hi[a] = W[i + a]; } return [lo, hi]; }

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var REAL = !!(SRC && ORA), srcDb, oraDb = null;
  if (REAL) { srcDb = new SQL.Database(new Uint8Array(fs.readFileSync(SRC))); oraDb = new SQL.Database(new Uint8Array(fs.readFileSync(ORA))); }
  else srcDb = synthetic(SQL);
  console.log('§LODUP_MODE pack=welds source=' + (REAL ? 'LODUP_SRC_DB (real)' : 'SYNTHETIC fixture (LODUP_SRC_DB / LODUP_ORACLE_DB unset)') + ' oracle=' + (REAL ? 'LODUP_ORACLE_DB' : 'none') + ' break=' + (MAIN_BREAK ? 1 : 0));
  var rd = Reader.fromDb(srcDb), inp = { meta: rd.meta, sched: rd.sched, world: rd.world, callouts: [] };
  var base = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/weld_defaults.json'), 'utf8'))), RULES = base, RC = Rules.counts(RULES);
  console.log('§LODUP_RULES pack=welds rows=' + RC.total + ' stated=' + RC.stated + ' default=' + RC.default + ' unset=' + RC.unset);
  var logs = [], run = function (rows, o) { logs.length = 0; return Pack.run(inp, rows, Object.assign({ log: function (l) { logs.push(l); console.log(l); } }, o || {})); };
  var R = run(RULES, { breakWinding: MAIN_BREAK }), parts = R.parts, A = R.audit, applies = Pack.appliesTo(inp, RULES);   // P3 fix: the member-plate contacts the run finds
  verdict('NONVACUOUS', parts.length ? true : (applies ? false : null), 'applies_to=' + applies + ' welds=' + parts.length + ' added_verts=' + R.stats.addedVerts + (parts.length ? '' : ' (nothing judged)'));
  var mine = {}; parts.forEach(function (p) { mine[p.guid] = p; });
  var win = winding(parts);
  var endCount = function (g) { return /-(A|B|AB)-[^-]*$/.test(g); };

  if (!REAL) {   // ---- SYNTH_TRUTH: hand-derived expectations
    var ids = parts.map(function (p) { return p.guid; }).sort(), refG = R.changes.filter(function (c) { return c.kind === 'REFUSED'; }).map(function (c) { return c.guid; }).sort(), nbG = R.changes.filter(function (c) { return c.kind === 'NOT_BUILT'; }).map(function (c) { return c.guid; }).sort();
    var lenBad = [], boxBad = [];
    parts.forEach(function (p) { var m = /member (?:end \w+|through contact) to gusset plate$/.test(p.name) && / x (\d+) mm,/.exec(p.name); if (!m || +m[1] !== SYNTH.lenMm[p.guid]) lenBad.push([p.guid, p.name]); });
    var bA = bboxOf(mine[SYNTH.welds[0]] ? mine[SYNTH.welds[0]].tris : new Float64Array(3)), wantA = [[0.4, 0.095, T_PLATE], [0.5, 0.1 + LEG + 0.005, T_PLATE + 0.005]];
    for (var a = 0; a < 3; a++) { if (Math.abs(bA[0][a] - wantA[0][a]) > BOX_TOL) boxBad.push('lo' + a + '=' + bA[0][a] + ' want ' + wantA[0][a]); if (Math.abs(bA[1][a] - wantA[1][a]) > BOX_TOL) boxBad.push('hi' + a + '=' + bA[1][a] + ' want ' + wantA[1][a]); }
    verdict('SYNTH_TRUTH', ids.join() === SYNTH.welds.join() && refG.join() === SYNTH.refused.join() && nbG.join() === SYNTH.notBuilt.join() && R.stats.contacts === SYNTH.contacts && R.stats.endContacts === SYNTH.end && R.stats.throughContacts === SYNTH.through && R.stats.addedVerts === SYNTH.addedVerts && !lenBad.length && !boxBad.length,
      'welds=' + ids.join('+') + ' refused=' + refG.join('+') + ' not_built=' + nbG.join('+') + ' contacts=' + R.stats.contacts + ' (end ' + R.stats.endContacts + ', through ' + R.stats.throughContacts + ') addedVerts=' + R.stats.addedVerts + ' length_mismatches=' + lenBad.length + ' weld_A_box_mismatches=' + boxBad.length + (boxBad.length ? '[' + boxBad.join('; ') + ']' : '') + ' (hand-derived: A at the plate end, 100 mm; B through, 500 mm; C across the face refused; D no contact)');
    verdict('PARITY', null, 'no oracle (synthetic fixture): guids / reasons / vertices / change rows not compared');
  } else {
    // ---- PARITY_WELDS
    var oraIds = q(oraDb, "SELECT guid FROM upgrade_changes WHERE change='ADDED' AND ifc_class='IfcFastener' ORDER BY seq").map(function (v) { return v[0]; }).sort(), mIds = Object.keys(mine).sort();
    var onlyO = oraIds.filter(function (g) { return !mine[g]; }), onlyM = mIds.filter(function (g) { return oraIds.indexOf(g) < 0; });
    var logPath = process.env.LODUP_ORACLE_LOG || path.join(path.dirname(ORA), 'log', 'run1.log'), oEnd = null, oThr = null, oCon = null, oNo = null;
    try { var m1 = /§SHEDRB_WELD_SCAN members=(\d+) plates=(\d+) contacts=(\d+) end_contacts=(\d+) through_contacts=(\d+) touch_only=(\d+) members_without_any_contact=(\d+)/.exec(fs.readFileSync(logPath, 'utf8')); if (m1) { oCon = +m1[3]; oEnd = +m1[4]; oThr = +m1[5]; oNo = +m1[7]; } } catch (e) { /* log absent: the scan counts are then INCONCLUSIVE */ }
    verdict('PARITY_WELDS', !onlyO.length && !onlyM.length && oraIds.length > 0, 'oracle_welds=' + oraIds.length + ' js_welds=' + mIds.length + ' only_in_oracle=' + onlyO.length + ' only_in_js=' + onlyM.length + (onlyO[0] ? ' first_only_oracle=' + onlyO[0] : '') + (onlyM[0] ? ' first_only_js=' + onlyM[0] : '') + ' (member, end, plate)');
    verdict('PARITY_SCAN', oCon === null ? null : (R.stats.contacts === oCon && R.stats.endContacts === oEnd && R.stats.throughContacts === oThr && A.noContact.length === oNo),
      'js contacts=' + R.stats.contacts + ' (end ' + R.stats.endContacts + ', through ' + R.stats.throughContacts + ') members_without_contact=' + A.noContact.length + ' | oracle log ' + (oCon === null ? 'not found (' + logPath + ')' : 'contacts=' + oCon + ' (end ' + oEnd + ', through ' + oThr + ') members_without_contact=' + oNo));
    // ---- PARITY_REFUSED + CHANGELIST
    var orows = q(oraDb, "SELECT seq, change, guid, ifc_class, host_guid, rule, detail FROM upgrade_changes WHERE ifc_class='IfcFastener' OR (ifc_class='IfcMember' AND change IN ('NOT_BUILT','REFUSED')) ORDER BY seq");
    var myrows = R.changes.map(function (c, i) { return [i + 1, c.kind, c.guid, c.cls, c.host, c.rule, c.detail]; });
    var refO = orows.filter(function (r) { return r[1] === 'REFUSED'; }), refM = myrows.filter(function (r) { return r[1] === 'REFUSED'; }), refBad = 0, refFirst = null;
    if (refO.length !== refM.length) refBad = Math.abs(refO.length - refM.length);
    for (var i = 0; i < Math.min(refO.length, refM.length); i++) for (var k = 1; k < 7; k++) if (String(refO[i][k]) !== String(refM[i][k])) { refBad++; if (!refFirst) refFirst = { field: k, oracle: String(refO[i][k]).slice(0, 140), js: String(refM[i][k]).slice(0, 140) }; break; }
    var reasons = {}; refM.forEach(function (r) { var w = String(r[6]).split(': ')[1]; reasons[w] = (reasons[w] || 0) + 1; });
    verdict('PARITY_REFUSED', refBad === 0 && refO.length > 0, 'oracle_refused=' + refO.length + ' js_refused=' + refM.length + ' differing_rows=' + refBad + ' reasons=' + JSON.stringify(reasons).slice(0, 220) + (refFirst ? ' first=' + JSON.stringify(refFirst) : ''));
    var rowBad = Math.abs(orows.length - myrows.length), first = null;
    for (var i2 = 0; i2 < Math.min(orows.length, myrows.length); i2++) for (var k2 = 1; k2 < 7; k2++) if (String(orows[i2][k2]) !== String(myrows[i2][k2])) { rowBad++; if (!first) first = { oracle_seq: orows[i2][0], field: k2, oracle: String(orows[i2][k2]).slice(0, 170), js: String(myrows[i2][k2]).slice(0, 170) }; break; }
    verdict('PARITY_CHANGELIST', rowBad === 0 && orows.length > 0, 'oracle_weld_rows=' + orows.length + ' (ADDED ' + orows.filter(function (r) { return r[1] === 'ADDED'; }).length + ', NOT_BUILT ' + orows.filter(function (r) { return r[1] === 'NOT_BUILT'; }).length + ', REFUSED ' + refO.length + ') js_rows=' + myrows.length + ' differing_rows=' + rowBad + (first ? ' first=' + JSON.stringify(first) : '') + ' (order, kind, guid, class, host, rule text, detail text; seq re-numbered)');
    // ---- PARITY_VERTICES
    var ora = {}; q(oraDb, "SELECT i.guid, c.vertices, t.center_x, t.center_y, t.center_z, m.element_name FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) JOIN elements_meta m USING(guid) WHERE i.guid LIKE 'GEN-WD-%' ORDER BY i.guid")
      .forEach(function (v) { var b = v[1], f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), W = new Float64Array(f.length); for (var i = 0; i < f.length; i += 3) { W[i] = f[i] + v[2]; W[i + 1] = f[i + 1] + v[3]; W[i + 2] = f[i + 2] + v[4]; } ora[v[0]] = { W: W, name: v[5] }; });
    var vcBad = 0, maxD = 0, nVert = 0, worst = null, nameBad = 0, nameFirst = null;
    mIds.forEach(function (g) {
      if (!ora[g]) return; var a = mine[g].tris, b = ora[g].W; if (mine[g].name !== ora[g].name) { nameBad++; if (!nameFirst) nameFirst = [g, mine[g].name, ora[g].name]; }
      if (a.length !== b.length) { vcBad++; return; } nVert += a.length / 3;
      for (var i = 0; i < a.length; i++) { var d = Math.abs(a[i] - b[i]); if (d > maxD) { maxD = d; worst = g; } }
    });
    verdict('PARITY_VERTICES', vcBad === 0 && maxD <= 1e-5 && nVert > 0 && nameBad === 0, 'welds_compared=' + mIds.filter(function (g) { return ora[g]; }).length + ' vertices_compared=' + nVert + ' vertex_count_mismatch_welds=' + vcBad + ' name_mismatches=' + nameBad + ' max_world_delta_mm=' + (maxD * 1000).toFixed(6) + ' (worst ' + worst + ') tolerance=0.01 mm' + (nameFirst ? ' first_name=' + JSON.stringify(nameFirst) : ''));
    var byEnd = { A: 0, B: 0, AB: 0, T: 0 }; mIds.forEach(function (g) { var m = /^GEN-WD-.*-(A|B|AB|T)-[^-]*$/.exec(g); if (m) byEnd[m[1]]++; });
    console.log('§LODUP_WELD_ENDS built welds by end: ' + JSON.stringify(byEnd) + ' end-kind welds=' + mIds.filter(endCount).length);
  }

  // ---- SIZE: the leg measured on each bead's own cap triangle vs AISC J2.4 for the thinner part, names read here
  var sizeBad = [], sizeN = 0, sizeSet = {};
  parts.forEach(function (p) {
    var pm = p.attach, nm = legsFromName(inp.meta[pm[1]] && inp.meta[pm[1]].name, inp.meta[pm[0]] && inp.meta[pm[0]].name), tp = nm[0];
    if (tp === null) { var bb = bboxOf(inp.world(pm[1])), ex = [bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]]; tp = Math.min(ex[0], ex[1], ex[2]) * 1000; }
    var thin = Math.min.apply(null, [tp, nm[1]].filter(function (x) { return x !== null; })), want = j24(thin), W = p.tris;
    for (var o = 0; o < W.length; o += 72) {
      sizeN++; var P3 = [0, 1, 2].map(function (k) { return [W[o + 3 * k], W[o + 3 * k + 1], W[o + 3 * k + 2]]; }), ed = [0, 1, 2].map(function (k) { var a = P3[k], b = P3[(k + 1) % 3]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000; }), leg = Math.min.apply(null, ed);
      sizeSet[want] = 1; if (Math.abs(leg - want) > 0.01) sizeBad.push([p.guid, leg.toFixed(4), want]);
    }
  });
  verdict('SIZE', sizeN ? !sizeBad.length : null, 'beads=' + sizeN + ' leg_mismatches=' + sizeBad.length + ' sizes_mm=' + Object.keys(sizeSet).join('/') + ' (leg = shortest edge of the bead cap; table = AISC 360-16 J2.4 for the thinner part read from the names)' + (sizeBad[0] ? ' first=' + JSON.stringify(sizeBad[0]) : ''));

  // ---- WELD_WINDING
  var wv = verdict('WELD_WINDING', win.beads ? !win.bad.length : null, 'beads=' + win.beads + ' not_closed_or_inconsistent=' + win.bad.length + ' min_signed_volume_mm3=' + ((win.volMin || 0) * 1e9).toFixed(3) + (win.bad[0] ? ' first=' + JSON.stringify(win.bad[0]) : ''));

  // ---- CENTRE (through the same function the pill uses to write ops)
  var built = Ops.build(parts, 'welds', inp.meta), cBad = 0, maxC = 0, attBad = 0, partsOfBad = 0;
  built.ops.forEach(function (o, i) {
    var P = o.params, W = parts[i].tris, bb = bboxOf(W), halfZ = (bb[1][2] - bb[0][2]) / 2, cen = [P.placement.x, P.placement.y, P.placement.z + halfZ], bc = [0, 1, 2].map(function (a) { return (bb[0][a] + bb[1][a]) / 2; });
    var d = Math.max(Math.abs(cen[0] - bc[0]), Math.abs(cen[1] - bc[1]), Math.abs(cen[2] - bc[2])); if (d > maxC) maxC = d; if (d > 1e-6) cBad++;
    if (P.provenance !== 'generated:welds' || o.op_type !== 'GEOM_INSERT' || !/capacity not checked/.test(P.note)) cBad++;
    if (!P.attached_to || P.attached_to.join() !== parts[i].attach.join() || P.attached_to.length !== 2) attBad++;
    if (P.parts_of !== undefined) partsOfBad++;
  });
  verdict('CENTRE', built.ops.length ? (cBad === 0 && attBad === 0 && partsOfBad === 0 && built.elementParts.length === 0) : null, 'ops=' + built.ops.length + ' centre_not_own_bbox_centre=' + cBad + ' max_delta_m=' + maxC.toExponential(2) + ' attached_to_wrong=' + attBad + ' ops_with_parts_of=' + partsOfBad + ' element_parts_rows=' + built.elementParts.length + ' (provenance generated:welds, GEOM_INSERT, wording present)');

  // ---- RULES: an edited J2.4 row changes the size; a stated row beats a default edit
  var t1 = Rules.merge(RULES, { weld_min_table_mm: { value: '6:3, 13:7, 19:8, 999:10', source: 'stated: test edit' } }), t2 = Rules.merge(t1.rows, { weld_min_table_mm: { value: '6:3, 13:5, 19:6, 999:8', source: 'default: attempt' } });
  var R2 = parts.length ? Pack.run(inp, t1.rows, { log: function () { } }) : null, w2 = R2 && R2.parts.length ? bboxOf(R2.parts[0].tris) : null, w1 = parts.length ? bboxOf(parts[0].tris) : null;
  var sizeEdited = R2 && R2.parts.length ? (function () { var W = R2.parts[0].tris, P3 = [0, 1, 2].map(function (k) { return [W[3 * k], W[3 * k + 1], W[3 * k + 2]]; }); return Math.min.apply(null, [0, 1, 2].map(function (k) { var a = P3[k], b = P3[(k + 1) % 3]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000; })); })() : null;
  void w1; void w2;
  verdict('RULES', R2 ? (Math.abs(sizeEdited - 7) < 0.01 && t2.refused.length === 1 && t2.rows.weld_min_table_mm.value === '6:3, 13:7, 19:8, 999:10') : null, 'edited_table_13mm_row 5 -> 7 mm (a 6.35 mm part) gives leg=' + (sizeEdited === null ? '-' : sizeEdited.toFixed(3)) + ' mm; a default edit over the stated row refused=' + t2.refused.length + ' shipped_rows stated=' + RC.stated + ' default=' + RC.default + ' unset=' + RC.unset);

  // ---- GATE: only steel members and steel plates are judged (P3 FIX SPEC 2): re-label the plates as concrete -> nothing judged; gate off (red control) -> the contacts come back
  (function () {
    var meta2 = {}; Object.keys(inp.meta).forEach(function (g) { meta2[g] = Object.assign({}, inp.meta[g]); if (meta2[g].cls === 'IfcPlate') meta2[g].mat = 'Concrete - Precast'; });
    var inp2 = Object.assign({}, inp, { meta: meta2 }), on = Pack.run(inp, RULES, { log: function () { } }), cut = Pack.run(inp2, RULES, { log: function () { } }), off = Pack.run(inp2, RULES, { log: function () { }, noMaterialGate: true });
    var asStr = Rules.merge(RULES, { weld_material_gate: { value: 'steel, iron', source: 'stated: test edit' } }).rows, viaStr = Pack.run(inp, asStr, { log: function () { } });
    verdict('GATE', on.stats.contacts > 0 ? (cut.stats.judged === 0 && cut.parts.length === 0 && off.stats.contacts === on.stats.contacts && viaStr.stats.contacts === on.stats.contacts) : null,
      'steel plates+members: contacts=' + on.stats.contacts + ' | plates relabelled concrete: judged=' + cut.stats.judged + ' welds=' + cut.parts.length + ' | gate off on that input: contacts=' + off.stats.contacts + ' | a comma-separated string value behaves as the list: contacts=' + viaStr.stats.contacts);
  })();

  // ---- DETERMINISM: two runs, same op hash
  function opHash(rr) { var b = Ops.build(rr.parts, 'welds', inp.meta), h = crypto.createHash('sha256'); h.update(JSON.stringify(b.ops)); b.assets.forEach(function (a) { h.update(Buffer.from(a.v.buffer)); }); h.update(JSON.stringify(b.elementParts)); h.update(JSON.stringify(rr.changes)); return h.digest('hex'); }
  var h1 = opHash(R), h2 = opHash(run(RULES, { breakWinding: MAIN_BREAK }));
  verdict('DETERMINISM', parts.length ? h1 === h2 : null, 'run1=' + h1.slice(0, 16) + ' run2=' + h2.slice(0, 16));

  // ---- BREAK: the pre-correction inward caps, WELD_WINDING must FAIL
  var RB = Pack.run(inp, RULES, { breakWinding: !MAIN_BREAK, log: function () { } }), wb = winding(RB.parts);
  var bkRes = wb.beads ? !wb.bad.length : null, bkWord = bkRes === null ? 'INCONCLUSIVE' : bkRes ? 'PASS' : 'FAIL';
  if (!MAIN_BREAK) verdict('BREAK_CHECK', bkWord === 'FAIL', 'switch=on (inward caps, the 2026-11-18 defect) expected WELD_WINDING=FAIL got WELD_WINDING=' + bkWord + ' (beads=' + wb.beads + ' bad=' + wb.bad.length + ')');
  else console.log('§LODUP_BREAK_CHECK main run is the broken run: WELD_WINDING=' + wv + ' (expected FAIL) -> ' + (wv === 'FAIL' ? 'PASS' : 'FAIL'));

  // ---- change list text
  var txt = Ops.changeText(R.changes, { model: 'witness', pack: 'welds', rules: RC }), dl = txt.split('\n').filter(function (l) { return /^\d+ \| /.test(l); }).length;
  verdict('CHANGELIST_TXT', R.changes.length ? dl === R.changes.length : null, 'data_lines=' + dl + ' rows=' + R.changes.length + ' wording_line=' + /capacity not checked/.test(txt));

  // ---- REGISTRY: the chooser lists the packs with no dialog change
  var uiSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'lod/lod_ui.js'))).digest('hex'), man = JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/packs.json'), 'utf8'));
  var manIds = man.packs.map(function (p) { return p.id; }), filesOk = man.packs.every(function (p) { return fs.existsSync(path.join(ROOT, 'lod', p.file)); });
  Registry.clear(); Registry.register(Rebar); Registry.register(Pack);
  var rowsOf = function (id) { return id === 'welds' ? RULES : !Registry.get(id).rulesFile ? {} : Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod', Registry.get(id).rulesFile), 'utf8'))); };
  var ruleFilesOk = Registry.list().every(function (p) { return fs.existsSync(path.join(ROOT, 'lod', p.rulesFile)); }), d1 = Registry.describe(inp, rowsOf, Rules);
  Registry.register({ id: 'dummy', label: 'Dummy (test pack)', appliesTo: function () { return 0; }, run: function () { return { parts: [], changes: [] }; } });
  var d2 = Registry.describe(inp, rowsOf, Rules), wRow = d1.filter(function (x) { return x.id === 'welds'; })[0];
  verdict('REGISTRY', d1.map(function (x) { return x.id; }).join() === 'rebar,welds' && manIds.slice(0, 2).join() === 'rebar,welds' && filesOk && ruleFilesOk && wRow && wRow.label === 'Truss welds' && wRow.appliesTo === applies && d2.length === d1.length + 1 && uiSha === P1_LOD_UI_SHA,
    'listed=' + d1.map(function (x) { return x.id + ':"' + x.label + '"'; }).join(',') + ' packs.json=' + manIds.join() + ' pack_files_exist=' + filesOk + ' rules_files_exist=' + ruleFilesOk + ' welds_applies_to=' + (wRow && wRow.appliesTo) + ' after_one_more=' + d2.length + ' lod_ui_js_is_the_P3_fix_file=' + (uiSha === P1_LOD_UI_SHA) + ' (the dialog renders exactly describe(); no UI code changed)');

  // ---- cost (PERF BUDGET)
  var srcVerts = 0; Object.keys(inp.meta).forEach(function (g) { var w = inp.world(g); if (w) srcVerts += w.length / 3; });
  console.log('§LODUP_COST pack=welds addedVerts=' + R.stats.addedVerts + ' modelVerts=' + srcVerts + ' addedPct=' + (srcVerts ? (100 * R.stats.addedVerts / srcVerts).toFixed(2) : '-') + ' heapMB=' + (R.stats.addedVerts * 170 / 1e6).toFixed(2) + ' (0.17 GB per M vertices) warnOver1M=' + (R.stats.addedVerts > 1e6));
  console.log('§LODUP_SUMMARY pack=welds failed=' + (FAILS.length ? FAILS.join(',') : 'none') + ' inconclusive=' + (INCONC.length ? INCONC.join(',') : 'none') + ' mode=' + (REAL ? 'real' : 'synthetic') + ' break=' + (MAIN_BREAK ? 1 : 0));
  process.exit(MAIN_BREAK ? (wv === 'FAIL' ? 0 : 1) : FAILS.length ? 1 : 0);
}).catch(function (e) { console.error('§LODUP_CRASH ' + (e && e.stack || e)); process.exit(2); });
