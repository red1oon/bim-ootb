#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROW7-HGARAGE-GRID: a ROTATED lattice is walked in its own frame (MODELLER_MASTER §RESUME
 * 2026-09-26b NEXT #3; spec prompts/Modeller/NEXT_0926/SPEC_ROW7_HGARAGE.md). Pure node — sql.js + the REAL production
 * modules (cross_edges.js → real_geometry.js, str_walker_bridge.js → str_walker.js). No browser, no network.
 *
 * THE DEFECT. HospitalGarage's 140 STR columns walked to a 15×103 grid with 102 one-column gridlines and colRMS 1.19 m:
 * the per-axis 1D clustering does not describe a lattice that is ROTATED against the world axes. MEASURED (2026-09-26):
 * the column pairs' direction histogram (0.01° bins, mod 90) has ONE bin at −2.00° holding 16.5 % of all 9,730 pairs;
 * the source IFC's IfcSite placement RefDirection #196106 = (0.0349, 0.9994) = 88.000° ≡ −2.000° mod 90 — the extractor
 * applied it into the db's world frame. Walked in the −2° frame: 17×29, colRMS 0.0607 m, 132/140 exact (< 5 mm).
 *
 * Substrates: modeller/Garage_ARC.db (tracked; anchors) + modeller/HospitalGarage_geo.db (gitignored, the OCI file the
 * app fetches; true mesh centres). Without the geo file the anchor leg is judged with its OWN expected numbers (17×29,
 * colRMS 0.0819, 110 exact) — real data, not vacuous — and the log says which substrate was judged. INCONCLUSIVE (exit 2)
 * only when Garage_ARC.db itself is absent. SW_ROOT=<dir> points the walker modules elsewhere (base-vs-fix runs).
 *
 * Each claim names the issue it proves or disproves:
 *   H0 IFC-SOURCED      — the detector's refined angle equals the IfcSite RefDirection angle (88.000° ≡ −2.000°) within
 *                         0.01°: the estimator reproduces the source, it does not invent a rotation.
 *   H1 DETECTOR-FIRES   — swDetectRotation: applied=true, reason 'more-exact', mode share ≥ 10 %, exact 6 → 132 (anchors 6 → 110).
 *   H2 GRID-DESCRIBES   — swbInit(db,{geoDb}): 17×29 (was 15×103), colRMS 0.0607 ± 0.002 (was 1.193), 132/140 exact,
 *                         7 one-column lines (was 102); every gridline value IS a member coordinate (no invented line).
 *   H3 RENDER-WORLD     — swbRenderOps: every column placement lands on its real world centre within that column's own
 *                         residual (≤ 1 mm agreement); every op carries rot = −2.000°; every girder endpoint, re-projected to
 *                         world, coincides with a walked column (≤ 1 mm).
 *   H4 REWALK-FRAME     — swbOnGridMove on a 23-member line, Δ = 1 m: exactly 23 STR_REANCHOR + 46 STR_RESPAN; each column
 *                         moves 1.000 m along the STRUCTURAL axis = world (cos θ, sin θ) = (0.99939, −0.03490); rows are WORLD.
 *   H5 TERMINAL-HELD    — Terminal_arcstr_proof.db: measured |θ| < 0.05° → applied=false (dead-band); 18×10, colRMS 0.1323,
 *                         131 exact — unchanged. INCONCLUSIVE if the gitignored fixture is absent.
 *   H6 HOSPITAL-REFUSED — Hospital_ARC.db (349 columns, tracked): measured −4.999° (= ITS IfcSite −5.000°) but
 *                         applied=false, reason 'fewer-exact' (43 → 26); grid stays 66×56. The witness can say NO.
 *   H7 RED-CONTROL      — the same columns pre-rotated INTO their frame: detector 0.000°, applied=false, axis-aligned
 *                         walk 17×29 — a rotation is never applied where there is none.
 */
'use strict';
var fs = require('fs'), path = require('path');

global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var MODS = process.env.SW_ROOT || ROOT;
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));
var SW = require(path.join(MODS, 'str_walker.js'));
var Bridge = require(path.join(MODS, 'str_walker_bridge.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var META = path.join(ROOT, 'Garage_ARC.db'), GEO = path.join(ROOT, 'HospitalGarage_geo.db');
var TERM = path.join(ROOT, 'Terminal_arcstr_proof.db'), HOSP = path.join(ROOT, 'Hospital_ARC.db');

// IFC-sourced constant (HospitalGarage_IFC4.ifc #196106 IFCDIRECTION, the IfcSite placement RefDirection) — cited, not tuned.
var IFC_SITE_REFDIR = [0.0348994967025161, 0.999390827019096];
var IFC_DEG = Math.atan2(IFC_SITE_REFDIR[1], IFC_SITE_REFDIR[0]) * 180 / Math.PI;      // 88.000
var IFC_MOD90 = ((IFC_DEG + 45) % 90 + 90) % 90 - 45;                                    // −2.000
var HOSP_IFC_DEG = Math.atan2(-0.0871557427476697, 0.996194698091745) * 180 / Math.PI;  // −5.000 (Hospital_IFC4_STR.ifc IfcSite)
// axis = the axis-aligned (pre-fix) grid the detector's gate compared against: 15×103 on mesh centres, 15×102 on anchors
var EXPECT = { mesh: { grid: '17×29', rms: 0.0607, exact: 132, axis: '15×103' }, anchor: { grid: '17×29', rms: 0.0819, exact: 110, axis: '15×102' } };
var TOL = 0.002, EX_TOL = SW.SW_GRID_EXACT_TOL || 0.005;

var pass = 0, fail = 0;
function chk(name, ok, detail) { console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + '  ' + (detail || '')); ok ? pass++ : fail++; }
function rms(a) { return Math.sqrt(a.reduce(function (s, r) { return s + r * r; }, 0) / (a.length || 1)); }
function exists(f) { try { return fs.statSync(f).size > 1024; } catch (e) { return false; } }
function gridStr(g) { return g.xLines.length + '×' + g.yLines.length; }
function singles(g) { return g.xMeta.filter(function (m) { return m.members.length === 1; }).length + g.yMeta.filter(function (m) { return m.members.length === 1; }).length; }
function exactN(st) { return st.base.walked.filter(function (w) { return w.residual < EX_TOL; }).length; }

console.log('═══ W-ROW7-HGARAGE-GRID — the rotated lattice is walked in its own frame (pure node, real modules) ═══');
if (!exists(META)) {
  console.log('  ⚠ INCONCLUSIVE — substrate absent: ' + META);
  console.log('W-ROW7-HGARAGE-GRID: INCONCLUSIVE (0 judged) — NOT a pass');
  process.exit(2);
}
var haveGeo = exists(GEO), leg = haveGeo ? 'mesh' : 'anchor', E = EXPECT[leg];
console.log('  substrate: ' + META + (haveGeo ? ' + ' + GEO + ' (true mesh centres)' : ' (ANCHORS — HospitalGarage_geo.db absent; copy it from OCI for the mesh leg)'));

initSqlJs({ wasmBinary: wasmBinary }).then(function (SQL) {
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(META)));
  var geo = haveGeo ? new SQL.Database(new Uint8Array(fs.readFileSync(GEO))) : null;
  var opts = geo ? { geoDb: geo } : {};

  var st = Bridge.swbInit(db, opts);
  var g = st.base.grid, rot = g.rotation;
  if (!rot || typeof SW.swDetectRotation !== 'function') {
    chk('H0 IFC-SOURCED (detector exists)', false, 'no swDetectRotation / grid.rotation on this tree — pre-fix modules');
    console.log('W-ROW7-HGARAGE-GRID: ' + pass + ' PASS / ' + (fail + 7) + ' FAIL (no detector — remaining claims not judged)');
    process.exit(1);
  }

  // H0 — the measured angle IS the IFC's site rotation
  chk('H0 IFC-SOURCED (refined angle == IfcSite RefDirection #196106 = ' + IFC_DEG.toFixed(3) + '° ≡ ' + IFC_MOD90.toFixed(3) + '° mod 90, within 0.01°)',
    Math.abs(rot.thetaDeg - IFC_MOD90) <= 0.01, 'measured=' + rot.thetaDeg.toFixed(4) + '° mode=' + rot.modeDeg.toFixed(2) + '° ifc=' + IFC_MOD90.toFixed(4) + '°');

  // H1 — detector census + gate
  chk('H1 DETECTOR-FIRES (applied, reason more-exact, mode share ≥ 10 %, exact 6 → ' + E.exact + ')',
    rot.applied && rot.reason === 'more-exact' && rot.modeShare >= 0.10 && rot.exact0 === 6 && rot.exactRot === E.exact,
    'applied=' + rot.applied + ' reason=' + rot.reason + ' share=' + (rot.modeShare * 100).toFixed(1) + '% pairs=' + rot.pairs + ' exact ' + rot.exact0 + '→' + rot.exactRot + ' grid ' + rot.grid0 + '→' + rot.gridRot);

  // H2 — the grid describes the layout, and every line is a real coordinate
  var ex = exactN(st), sg = singles(g);
  var allReal = g.xMeta.every(function (m) { return m.members.indexOf(m.value) >= 0; }) && g.yMeta.every(function (m) { return m.members.indexOf(m.value) >= 0; });
  chk('H2 GRID-DESCRIBES (' + leg + ' leg: ' + E.grid + ', colRMS ' + E.rms + ' ± ' + TOL + ', ' + E.exact + '/140 exact, 7 one-column lines — was ' + E.axis + ' / 1.19 / 6 / ~102; every line value is a member coordinate)',
    st.centres.mesh === (haveGeo ? 140 : 0) && gridStr(g) === E.grid && Math.abs(st.colRMS - E.rms) <= TOL && ex === E.exact && sg === 7 && allReal && rot.grid0 === E.axis,
    'centres=mesh:' + st.centres.mesh + ' anchor:' + st.centres.anchor + ' grid=' + gridStr(g) + ' colRMS=' + st.colRMS.toFixed(4) + ' exact=' + ex + ' singletons=' + sg + ' linesReal=' + allReal + ' axisAligned=' + rot.grid0);

  // H3 — render ops are WORLD and carry the yaw; girder endpoints land on walked columns
  var boxes = CrossEdges.readBoxes(db, geo || undefined), centre = {};
  boxes.forEach(function (b) { if (b.real) centre[b.guid] = [(b.aabb[0] + b.aabb[1]) / 2, (b.aabb[2] + b.aabb[3]) / 2]; });
  if (!haveGeo) db.exec("SELECT m.guid,t.center_x,t.center_y FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class='IfcColumn'")[0].values.forEach(function (r) { centre[r[0]] = [r[1], r[2]]; });
  var rr = Bridge.swbRenderOps(), byGuid = {}; st.base.walked.forEach(function (w) { byGuid[w.guid] = w; });
  var colOk = 0, colN = 0, rotOk = 0, worstAgree = 0, worldCols = [];
  rr.ops.slice(0, rr.columnN).forEach(function (op) {
    var w = byGuid[op.outputGuid], c = centre[op.outputGuid.replace(/^SW2D-/, '')]; if (!w || !c) return; colN++;
    var p = op.params.placement, d = Math.hypot(p.x - c[0], p.y - c[1]);
    var agree = Math.abs(d - w.residual); worstAgree = Math.max(worstAgree, agree); if (agree <= 0.001) colOk++;
    if (Math.abs(p.rot - rot.thetaDeg) <= 1e-9) rotOk++;
    worldCols.push([p.x, p.y]);
  });
  var girOk = 0, girN = 0;
  st.base.girders.forEach(function (gd) {
    girN++;
    var a = SW.swToWorld(gd.from[0], gd.from[1], g.theta), b = SW.swToWorld(gd.to[0], gd.to[1], g.theta);
    var hit = function (p) { return worldCols.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) <= 0.001; }); };
    if (hit(a) && hit(b)) girOk++;
  });
  var girRot = rr.ops.slice(rr.columnN).every(function (op) { return Math.abs(op.params.placement.rot - rot.thetaDeg) <= 1e-9; });
  chk('H3 RENDER-WORLD (column placements sit on the real world centres within each residual; every op rot=' + rot.thetaDeg.toFixed(3) + '°; every girder endpoint on a walked column)',
    colN === 140 && colOk === 140 && rotOk === 140 && girRot && girN === rr.girderN && girOk === girN,
    'columns=' + colN + ' agree=' + colOk + ' worst=' + (worstAgree * 1000).toFixed(3) + 'mm rotOk=' + rotOk + ' girders=' + girN + ' endpointsOnColumns=' + girOk + ' girderRot=' + girRot);

  // H4 — a grid drag re-walks in the frame, along the structural axis, and persists WORLD rows
  var xi = -1; g.xMeta.forEach(function (m, i) { if (xi < 0 && m.members.length === 23) xi = i; });
  var u = g.xLines[xi], cf = SW.swToFrame(st.centroid.x, st.centroid.y, g.theta), wd = SW.swToWorld(u, cf[1], g.theta);
  var ops = [], r4 = Bridge.swbOnGridMove({ axis: 'x', datum: wd[0], delta: 1 }, function (t, p) { ops.push({ t: t, p: p }); }, {});
  var re = ops.filter(function (o) { return o.t === 'STR_REANCHOR'; }), rs = ops.filter(function (o) { return o.t === 'STR_RESPAN'; });
  var want = [Math.cos(g.theta), Math.sin(g.theta)];
  var dirOk = re.every(function (o) { return Math.abs(o.p.to[0] - o.p.from[0] - want[0]) <= 1e-6 && Math.abs(o.p.to[1] - o.p.from[1] - want[1]) <= 1e-6; });
  var fromWorld = re.every(function (o) { var c = centre[o.p.srcGuid]; return c && Math.hypot(o.p.from[0] - c[0], o.p.from[1] - c[1]) <= 0.5; });
  var spanOk = rs.every(function (o) { return Math.abs(Math.abs(o.p.newSpan - o.p.oldSpan) - 1) <= 1e-6; });
  chk('H4 REWALK-FRAME (Δ=1 m on the 23-member line: 23 STR_REANCHOR + 46 STR_RESPAN; each column moves 1.000 m along world (cosθ, sinθ) = (' + want[0].toFixed(5) + ', ' + want[1].toFixed(5) + '); rows are WORLD; spans ±1.000)',
    !!r4 && re.length === 23 && rs.length === 46 && dirOk && fromWorld && spanOk && r4.exceptions.length === 0,
    'committed=' + (r4 && r4.committed) + ' reanchor=' + re.length + ' respan=' + rs.length + ' dirOk=' + dirOk + ' fromWorld=' + fromWorld + ' spanOk=' + spanOk + ' exceptions=' + (r4 && r4.exceptions.length));

  // H5 — Terminal held (dead-band)
  if (exists(TERM)) {
    var tdb = new SQL.Database(new Uint8Array(fs.readFileSync(TERM)));
    var ts = Bridge.swbInit(tdb), tr = ts.base.grid.rotation, tex = exactN(ts);
    chk('H5 TERMINAL-HELD (measured |θ| < ' + SW.SW_GRID_ROT_MIN_DEG + '° → applied=false; 18×10, colRMS 0.1323, 131 exact — unchanged)',
      tr && !tr.applied && tr.reason === 'below-deadband' && Math.abs(tr.thetaDeg) < SW.SW_GRID_ROT_MIN_DEG && gridStr(ts.base.grid) === '18×10' && Math.abs(ts.colRMS - 0.1323) <= TOL && tex === 131 && ts.base.grid.theta === 0,
      'measured=' + (tr ? tr.thetaDeg.toFixed(4) : '?') + '° reason=' + (tr && tr.reason) + ' grid=' + gridStr(ts.base.grid) + ' colRMS=' + ts.colRMS.toFixed(4) + ' exact=' + tex);
    tdb.close();
  } else {
    console.log('  ⚠ INCONCLUSIVE H5 — fixture absent (gitignored): ' + TERM);
    chk('H5 TERMINAL-HELD (INCONCLUSIVE — fixture absent, nothing judged)', false, '');
  }

  // H6 — Hospital: the measured −5° IS its IfcSite rotation, and the support gate still REFUSES it
  if (exists(HOSP)) {
    var hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSP)));
    var hs = Bridge.swbInit(hdb), hr = hs.base.grid.rotation;
    chk('H6 HOSPITAL-REFUSED (349 columns: measured ' + HOSP_IFC_DEG.toFixed(3) + '° = its IfcSite, but exact would fall 43 → 26 → applied=false, grid stays 66×56)',
      hr && !hr.applied && hr.reason === 'fewer-exact' && Math.abs(hr.thetaDeg - HOSP_IFC_DEG) <= 0.01 && hr.exact0 === 43 && hr.exactRot === 26 && gridStr(hs.base.grid) === '66×56' && hs.base.grid.theta === 0,
      'measured=' + (hr ? hr.thetaDeg.toFixed(4) : '?') + '° reason=' + (hr && hr.reason) + ' exact ' + (hr && hr.exact0) + '→' + (hr && hr.exactRot) + ' grid=' + gridStr(hs.base.grid) + ' share=' + (hr ? (hr.modeShare * 100).toFixed(1) : '?') + '%');
    hdb.close();
  } else {
    console.log('  ⚠ INCONCLUSIVE H6 — substrate absent: ' + HOSP);
    chk('H6 HOSPITAL-REFUSED (INCONCLUSIVE — substrate absent, nothing judged)', false, '');
  }

  // H7 — red control: columns already in their frame → no rotation applied, same lattice
  var frameCols = db.exec("SELECT m.guid,t.center_x,t.center_y,t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'")[0].values
    .map(function (r) { var c = centre[r[0]] || [r[1], r[2]]; var p = SW.swToFrame(c[0], c[1], g.theta); return { guid: r[0], x: p[0], y: p[1], z: r[3] }; });
  var d7 = SW.swDetectRotation(frameCols), sk7 = SW.swWalkSkeleton(frameCols);
  chk('H7 RED-CONTROL (the same columns pre-rotated into their frame: detector reads ~0°, applied=false, axis-aligned walk is ' + E.grid + ')',
    !d7.applied && d7.reason === 'below-deadband' && Math.abs(d7.thetaDeg) < 0.01 && gridStr(sk7.grid) === E.grid && sk7.grid.theta === 0,
    'measured=' + d7.thetaDeg.toFixed(4) + '° reason=' + d7.reason + ' grid=' + gridStr(sk7.grid));

  db.close(); if (geo) geo.close();
  console.log('W-ROW7-HGARAGE-GRID: ' + pass + ' PASS / ' + fail + ' FAIL (' + leg + ' leg)');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.log('  ❌ FATAL ' + (e && e.stack || e)); console.log('W-ROW7-HGARAGE-GRID: FATAL'); process.exit(1); });
