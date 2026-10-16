#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SLIDE-REAL-WALL (pure node, REAL SampleHouse): §SLIDE-REAL-WALLS Phase B — an authored door/window
 * slides along its REAL host wall because the host is seeded from its UNCUT body and its authored opening is a GEOM_CUT
 * row that rides the door (§CUT-MOVE). Spec: prompts/RESUME_MODELLER_LOD400_REAL_GEOMETRY.md §SLIDE-REAL-WALLS.
 * Read the log after every run — exit code alone is not evidence.
 *
 * ISSUE: on main every real host has its opening BAKED into the shipped mesh, so the slide REFUSES (W-DAGEVU-SLIDE S0 —
 * honest, but the user cannot move a door on any resident). Substrate = the PRODUCTION pair the Open path loads:
 * modeller/SampleHouse_ARC.db + the SERVED SampleHouse_geo.db (GEO_BASE + geoDb/geoV read from str_walker_outliner.js's
 * own registry, cached under ~/.cache/bim-modeller-geo/) + the SAME self-heal patch the Modeller applies on open
 * (modeller/patches/SampleHouse_ARC.db.sql: rel_fills_host + slide_hosts / slide_openings written by bim-compiler
 * scripts/gen_slide_host_patch.py — 3 uncut hosts, 7 opening boxes).
 * §FRAME-TRAP (2026-09-30b): the first draft read modeller/SampleHouse_extracted.db — its base_geometries are in the
 * create_shape/placement frame (element_transforms = placement origin + rotation), NOT the served world − center frame
 * the Modeller folds, so every host AABB was off by 4.51 / 7.95 / 5.46 m. The served pair is the only honest reference.
 * NOTE: ARC.db element_transforms.center is the mesh's vertex centroid, NOT the AABB midpoint (Wy4: served world AABB
 * y∈[-1.3914,-1.1014] vs center_y ± bbox_y/2 = [-1.3627,-1.0727]) — so W2 checks position against the SERVED baked fold and
 * extent against element_transforms.bbox (DB truth), never center ± bbox/2.
 *
 * CLAIMS (each names what it proves):
 *   W0 CONTROL-MAIN — WITHOUT the slide tables every WALL-hosted filling's slide session REFUSES (today's S0), so the green
 *                     below is the patch + seed, not a loosened gate. RED-first built in.
 *   W1 PATCH        — the patch applies: slide_hosts=1, slide_openings=2 (M5 2026-09-30b: SampleHouse 3cUkl32yn9qRSPvBJVyWy4 and
 *                     …Ww5 are IfcFacetedBrep bodies that ALREADY carry their 5 openings — no uncut body exists in the source,
 *                     so the generator refuses them, named; only …WXt (IfcBooleanClippingResult, 2 doors) is truly uncut).
 *   W2 SEED-UNCUT   — the 3 hosts seed with realGeomHash = the uncut hash (≠ shipped), params.slideHost, registered uncut;
 *                     the uncut fold's WORLD AABB == the SERVED baked fold's WORLD AABB (≤1 mm): same wall, same place;
 *                     and its extent == element_transforms bbox_x/y/z (≤1 mm, DB truth).
 *   W3 CUTS         — 7 GEOM_CUT rows in 'arcseed-cuts-SampleHouse': parent = host fid, void = the patch box, each void
 *                     inside its host's AABB (x/y) and through the host thickness; Bonsai.canCut(host) true for all 3
 *                     (the plain-box seed for the 12-tri wall, the §SLIDE-SEED single-range seed for the two real bodies).
 *   W4 SESSION      — every one of the 7 fillings forms a slide session (no refusal) carrying exactly its own cut (F=1).
 *   W5 OP           — resolveDrop at an in-bounds t ⇒ GEOM_MOVE {parent: filling, along-axis delta only} + ONE
 *                     GEOM_CUT_MOVE {cutId, parent: host} rider with the same delta — the hole travels with the door.
 *   W6 REPLAY       — a second seedArc on the same op-log commits 0 new rows (both seed groups idempotent).
 *   W7 UNCUT-SOLID  — independent of the generator: the seeded uncut host fold has ≥2 triangle crossings on a thickness-axis
 *                     line through EVERY GEOM_CUT void centre (the hole is the op's, not the body's); the 5 openings of the
 *                     2 refused brep hosts have 0 crossings on their SHIPPED fold (the control that makes W7 falsifiable).
 *   W8 REFUSED-HONEST — the 5 fillings of the refused hosts still REFUSE the slide (baked body, today's honest S0).
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
var _nodeFetch = global.fetch; global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));
var ItemDrag = require(path.join(ROOT, 'bonsai_itemdrag.js'));
var DE = require(path.join(ROOT, 'dagevu_engine.js'));
var SdgGate = require(path.join(ROOT, 'sdg_gate.js'));
var SdgCascade = require(path.join(ROOT, 'sdg_cascade.js'));
var GK = require(path.join(ROOT, 'grid_kinematics.js'));
var kernelLoaded = false;
try { require(path.join(ROOT, 'bonsai_kernel.js')); kernelLoaded = !!(global.window.Bonsai && global.window.Bonsai._insertCutBox); } catch (e) { kernelLoaded = false; }
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library, Bonsai = global.window.Bonsai;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_ARC.db');
var _SWO = fs.readFileSync(path.join(ROOT, 'str_walker_outliner.js'), 'utf8');
var _GEO_BASE = (_SWO.match(/var GEO_BASE = '([^']+)'/) || [])[1];
async function geoFileFor(key) {   // the SAME object the live page fetches (witness_residents_anchor_sweep.js pattern)
  var m = _SWO.match(new RegExp("key: '" + key + "',[^\\n]*?geoDb: '([^']+)',\\s*geoV: (\\d+)"));
  if (!m || !_GEO_BASE) { console.log('  §SLIDE geo registry miss key=' + key); return null; }
  var dir = path.join(process.env.HOME, '.cache', 'bim-modeller-geo'); fs.mkdirSync(dir, { recursive: true });
  var fp = path.join(dir, 'v' + m[2] + '_' + m[1]);
  if (!fs.existsSync(fp) || fs.statSync(fp).size < 1024) {
    var res = await _nodeFetch(_GEO_BASE + m[1] + '?v=' + m[2]);
    var buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || buf.slice(0, 15).toString() !== 'SQLite format 3') { console.log('  §SLIDE geo fetch FAIL ' + m[1] + ' http=' + res.status + ' bytes=' + buf.length); return null; }
    fs.writeFileSync(fp, buf);
  }
  console.log('  §SLIDE geo ' + key + ' ← ' + _GEO_BASE + m[1] + '?v=' + m[2] + ' (' + fs.statSync(fp).size + ' B)');
  return fp;
}
var PATCH = process.env.SLIDE_PATCH || path.join(ROOT, 'patches', 'SampleHouse_ARC.db.sql');   // SLIDE_PATCH=<file>: falsify with another patch (e.g. the pre-M5 WIP one)

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
function j(x) { return JSON.stringify(x); }
function bboxOf(p) { var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; } return [mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]]; }
function centreOf(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }
function withinXY(box, pt, tol) { return pt[0] >= box[0] - tol && pt[0] <= box[1] + tol && pt[1] >= box[2] - tol && pt[1] <= box[3] + tol; }
function applyPatch(db, sql) {   // the loader's own statement-aware apply (str_walker_outliner.js _applyPendingPatch), minus the chunking
  var st = [], buf = [];
  sql.split('\n').forEach(function (ln) { if (!ln.trim().length || /^\s*--/.test(ln)) return; buf.push(ln); if (/;\s*$/.test(ln)) { st.push(buf.join('\n')); buf = []; } });
  var n = 0; st.forEach(function (s) { try { db.run(s); n++; } catch (e) { console.log('  §PATCH_STMT_FAIL ' + (e && e.message) + ' stmt=' + s.slice(0, 60)); } });
  return n;
}
function count(db, sql) { var r = db.exec(sql); return r.length ? r[0].values[0][0] : 0; }

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-SLIDE-REAL-WALL — slide an authored opening along its REAL wall (node, SampleHouse, §SLIDE-REAL-WALLS Phase B) ═══');
  // each Database gets its OWN copy: sql.js MEMFS may own (not copy) the array it is given, so a patched db would write through into the shared buffer
  var bytes = fs.readFileSync(DBPATH), patchSql = fs.readFileSync(PATCH, 'utf8');
  var geoPath = await geoFileFor('SampleHouse');
  if (!geoPath) { console.log('W-SLIDE-REAL-WALL: INCONCLUSIVE — the served SampleHouse_geo.db could not be fetched; nothing judged'); process.exit(2); }
  var geoDb = new SQL.Database(fs.readFileSync(geoPath));
  // main's substrate = the SAME patch file up to (not including) the §SLIDE-REAL-WALLS section — i.e. rel_fills_host + rel_aggregates, no slide tables
  var SLIDE_MARK = patchSql.indexOf('-- SampleHouse_ARC.db §SLIDE-REAL-WALLS Phase B');
  if (SLIDE_MARK < 0) { console.log('W-SLIDE-REAL-WALL: INCONCLUSIVE — the patch carries no §SLIDE-REAL-WALLS section'); process.exit(2); }
  var mainPatchSql = patchSql.slice(0, SLIDE_MARK);
  console.log('  §SLIDE plainBoxOf/canCut oracle = ' + (kernelLoaded ? 'PRODUCTION Bonsai._insertCutBox/canCut' : 'bonsai_kernel.js did not load under node'));

  // ── seed helper (the REAL seedArc + REAL KernelOps.commitGroup on a fresh op-log) ──
  async function seedFrom(db, tag) {
    var oplog = new SQL.Database();
    var commitGroup = function (opsArray, gid) { return KernelOps.commitGroup(oplog, opsArray, { gid: gid, baseTs: 1700000000000 }); };
    var seed = await ArcEditable.seedArc(db, { geoDb: geoDb, registerGeometry: function (a) { Library.registerRealGeometry(a); }, commitGroup: commitGroup, building: 'SampleHouse' });
    var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid, opByFid = {};
    seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
    var fills = CrossEdges.deriveAll(db).fills;
    var boxByFid = {}, classByFid = {}, placementByFid = {};
    Object.keys(opByFid).forEach(function (fid) {
      var P = opByFid[fid].params;
      try { boxByFid[fid] = bboxOf(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: P }, null).positions); } catch (e) { }
      if (P && P.ifc_class) classByFid[fid] = P.ifc_class;
      if (P && P.placement) placementByFid[fid] = P.placement;
    });
    var cutRows = (seed.slideCutOps || []).map(function (c, i) { return { id: seed.slideCutIds[i], op_type: 'GEOM_CUT', parent: c.params.parent, parameters: c.params }; });
    var geomOps = Object.keys(opByFid).map(function (fid) { return { id: +fid, op_type: 'GEOM_INSERT', parent: null, parameters: opByFid[fid].params }; }).concat(cutRows);
    var plainBoxOf = kernelLoaded ? function (fid) { var op = opByFid[fid]; if (!op) return null; try { return !!Bonsai._insertCutBox({ id: +fid, op_type: 'GEOM_INSERT', parameters: op.params }); } catch (e) { return false; } } : function () { return true; };
    var uncutHostOf = function (fid) { var op = opByFid[fid]; return !!(op && op.params && op.params.realGeomHash && Library.isUncutBody(op.params.realGeomHash)); };
    var resolverTrap = new Proxy({}, { get: function (_, k) { throw new Error('§SLIDE resolver consulted for a filling (' + String(k) + ')'); } });
    function ctxFor(fid) {
      return { fid: fid, insertParams: opByFid[fid] ? opByFid[fid].params : {}, boxByFid: boxByFid, classByFid: classByFid, guidByFid: gbf, fidByGuid: fbg,
        fills: fills, resolver: resolverTrap, placementByFid: placementByFid, cutOps: cutRows, geomOps: geomOps, plainBoxOf: plainBoxOf, uncutHostOf: uncutHostOf,
        kinematics: GK, gate: SdgGate, dagevu: DE, cascade: SdgCascade };
    }
    return { seed: seed, oplog: oplog, commitGroup: commitGroup, fbg: fbg, gbf: gbf, opByFid: opByFid, fills: fills, boxByFid: boxByFid, classByFid: classByFid, cutRows: cutRows, ctxFor: ctxFor, tag: tag };
  }
  function wallFills(S) {   // the WALL-hosted fillings whose host + filling both seeded (the slide's population)
    return S.fills.map(function (e) { return { e: e, h: S.fbg[e.host_guid], f: S.fbg[e.filling_guid] }; })
      .filter(function (x) { return x.h != null && x.f != null && S.boxByFid[x.h] && S.boxByFid[x.f] && ItemDrag.HOST_CLASSES.WALL.indexOf(S.classByFid[x.h]) >= 0 && withinXY(S.boxByFid[x.h], centreOf(S.boxByFid[x.f]), 0.05); });
  }

  // ── W0 CONTROL — ARC.db + main's patch (no slide tables): every wall-hosted filling refuses ──
  var plain = new SQL.Database(new Uint8Array(bytes));
  applyPatch(plain, mainPatchSql);
  var C = await seedFrom(plain, 'control');
  var cf = wallFills(C), cRefused = 0, cFormed = 0;
  cf.forEach(function (x) { var s = ItemDrag.beginItemDragSession(C.ctxFor(x.f)); if (s && s.slide) cFormed++; else cRefused++; });
  chk('W0 CONTROL-MAIN: without slide_hosts/slide_openings every WALL-hosted filling REFUSES the slide (today\'s honest S0)',
    cf.length > 0 && cFormed === 0 && cRefused === cf.length && !(C.seed.slide && C.seed.slide.hosts),
    'fillings=' + cf.length + ' refused=' + cRefused + ' formed=' + cFormed + ' slideCuts=' + (C.seed.slideCutIds || []).length);
  plain.close();

  // ── W1 PATCH — the SAME patch the Modeller applies on open ──
  var pdb = new SQL.Database(new Uint8Array(bytes));
  var applied = applyPatch(pdb, patchSql);
  var nHosts = count(pdb, 'SELECT count(*) FROM slide_hosts'), nOpen = count(pdb, 'SELECT count(*) FROM slide_openings');
  chk('W1 PATCH: modeller/patches/SampleHouse_ARC.db.sql applies — slide_hosts=1, slide_openings=2 (M5)', nHosts === 1 && nOpen === 2, 'statements=' + applied + ' hosts=' + nHosts + ' openings=' + nOpen);

  // ── W2 SEED-UNCUT ──
  var S = await seedFrom(pdb, 'patched');
  var hostRows = pdb.exec('SELECT host_guid, geometry_hash, baked_hash FROM slide_hosts')[0].values;
  var w2 = hostRows.map(function (v) {
    var fid = S.fbg[v[0]], op = fid != null ? S.opByFid[fid] : null, P = op && op.params;
    var cop = C.fbg[v[0]] != null ? C.opByFid[C.fbg[v[0]]] : null;   // the control's (baked) op for the same guid
    var a = P ? bboxOf(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: P }, null).positions) : null;
    var b = cop ? bboxOf(Library.foldInsert({ id: +C.fbg[v[0]], op_type: 'GEOM_INSERT', parameters: cop.params }, null).positions) : null;
    var d = (a && b) ? Math.max.apply(null, a.map(function (x, i) { return Math.abs(x - b[i]); })) : Infinity;
    var et = pdb.exec("SELECT bbox_x, bbox_y, bbox_z FROM element_transforms WHERE guid='" + v[0] + "'");   // DB truth: the extent
    var dExt = (a && et.length) ? Math.max(Math.abs((a[1] - a[0]) - et[0].values[0][0]), Math.abs((a[3] - a[2]) - et[0].values[0][1]), Math.abs((a[5] - a[4]) - et[0].values[0][2])) : Infinity;
    return { guid: v[0], fid: fid, uncut: P && P.realGeomHash === v[1], slideHost: !!(P && P.slideHost), reg: Library.isUncutBody(v[1]), notBaked: !!(P && P.realGeomHash !== v[2]),
      dAABB: +d.toFixed(4), dExt: +dExt.toFixed(4), uncutWorld: a && a.map(function (x) { return +x.toFixed(4); }) };
  });
  console.log('  §SLIDE-SEED hosts ' + j(w2));
  chk('W2 SEED-UNCUT: the 1 host seeds with realGeomHash = the uncut hash (≠ shipped), params.slideHost, registered uncut; uncut fold WORLD AABB == served baked fold (≤1 mm), extent == element_transforms bbox (≤1 mm)',
    w2.length === 1 && w2.every(function (x) { return x.fid != null && x.uncut && x.slideHost && x.reg && x.notBaked && x.dAABB <= 1e-3 && x.dExt <= 1e-3; }) && S.seed.slide.hosts === 1,
    'seedUncutHosts=' + S.seed.slide.hosts + ' maxΔAABB=' + Math.max.apply(null, w2.map(function (x) { return x.dAABB; })) + ' maxΔext=' + Math.max.apply(null, w2.map(function (x) { return x.dExt; })));

  // ── W3 CUTS ──
  var oRows = pdb.exec('SELECT opening_guid, host_guid, filling_guid, x0, y0, z0, x1, y1, z1 FROM slide_openings')[0].values;
  var w3 = oRows.map(function (v, i) {
    var cut = S.cutRows.filter(function (c) { return c.parameters.slide && c.parameters.slide.opening === v[0]; })[0];
    var hf = S.fbg[v[1]], hb = S.boxByFid[hf], P = cut && cut.parameters, vd = P && P.void;
    var boxOk = vd && Math.abs(vd.c1[0] - v[3]) < 1e-9 && Math.abs(vd.c1[1] - v[4]) < 1e-9 && Math.abs(vd.c1[2] - v[5]) < 1e-9 && Math.abs(vd.c2[0] - v[6]) < 1e-9 && Math.abs(vd.c2[1] - v[7]) < 1e-9 && Math.abs(vd.c2[2] - v[8]) < 1e-9;
    var k = hb ? ((hb[1] - hb[0]) < (hb[3] - hb[2]) ? 0 : 1) : null;   // thickness axis = the host's shorter XY extent
    var through = hb && vd ? (vd.c1[k] <= hb[2 * k] + 1e-3 && vd.c2[k] >= hb[2 * k + 1] - 1e-3) : false;
    var inside = hb && vd ? (vd.c1[0] >= hb[0] - 1e-3 && vd.c2[0] <= hb[1] + 1e-3 && vd.c1[1] >= hb[2] - 1e-3 && vd.c2[1] <= hb[3] + 1e-3) : false;
    return { opening: v[0], cutId: cut && cut.id, parentOk: !!cut && String(P.parent) === String(hf), boxOk: !!boxOk, inside: inside, through: through, fillingFid: P && P.slide.fillingFid };
  });
  var canCut = hostRows.map(function (v) { var fid = S.fbg[v[0]]; var op = S.opByFid[fid]; return kernelLoaded ? !!Bonsai.canCut({ id: +fid, op_type: 'GEOM_INSERT', parameters: op.params }) : null; });
  console.log('  §SLIDE-SEED cuts ' + j(w3) + ' canCut=' + j(canCut));
  chk('W3 CUTS: 2 GEOM_CUT rows (arcseed-cuts-SampleHouse) — parent = host fid, void = the patch box, inside the host, through its thickness; Bonsai.canCut(host) true',
    w3.length === 2 && S.seed.slideCutIds.length === 2 && w3.every(function (x) { return x.cutId != null && x.parentOk && x.boxOk && x.inside && x.through && x.fillingFid != null; }) &&
    (kernelLoaded ? canCut.every(Boolean) : false),
    'cuts=' + S.seed.slideCutIds.length + (kernelLoaded ? '' : ' (canCut INCONCLUSIVE: kernel not loaded)'));

  // ── W4 SESSION + W5 OP ──
  var slideFill = {}; oRows.forEach(function (v) { slideFill[v[2]] = 1; });
  var allWall = wallFills(S), pf = allWall.filter(function (x) { return slideFill[x.e.filling_guid]; }), refusedPop = allWall.filter(function (x) { return !slideFill[x.e.filling_guid]; }), sess = [], w5 = [];
  pf.forEach(function (x) {
    var s = ItemDrag.beginItemDragSession(S.ctxFor(x.f));
    var myCut = S.cutRows.filter(function (c) { return c.parameters.slide && c.parameters.slide.filling === x.e.filling_guid; })[0];
    var row = { f: x.f, h: x.h, formed: !!(s && s.slide), cuts: s && s.slide ? s.slide.cuts.map(function (c) { return c.cutId + '@F' + c.F; }) : null, ownCut: myCut && myCut.id,
      ok: !!(s && s.slide && myCut && s.slide.cuts.length === 1 && s.slide.cuts[0].cutId === myCut.id && s.slide.cuts[0].F === 1) };
    sess.push(row);
    if (s && s.slide) {
      var sl = s.slide, c = s.preCentre, K = sl.axis, other = 1 - K, dk = K === 0 ? 'dx' : 'dy', tOK = null, d = null;
      [0.2, -0.2, 0.4, -0.4, 0.1, -0.1, 0.6, -0.6].forEach(function (t) {
        if (tOK != null || t < sl.tMin || t > sl.tMax) return;
        var cand = c.slice(); cand[K] += t; cand[other] += 0.3; cand[2] += 0.1;
        var v = ItemDrag.canDropAt(s, cand[0], cand[1], cand[2]); if (v.valid) { tOK = t; d = ItemDrag.resolveDrop(s, cand[0], cand[1], cand[2]); }
      });
      var P = d && d.op && d.op.parameters, riders = (d && d.riders) || [], cm = riders.filter(function (r) { return r.op_type === 'GEOM_CUT_MOVE'; });
      w5.push({ f: x.f, t: tOK, op: d && d.op && d.op.op_type, delta: P && [P.dx, P.dy, P.dz], cutMove: cm.length, cutId: cm[0] && cm[0].parameters.cutId,
        ok: !!(d && d.committed && d.op.op_type === 'GEOM_MOVE' && String(P.parent) === String(x.f) && Math.abs(P[dk] - tOK) < 1e-12 && P[K === 0 ? 'dy' : 'dx'] === 0 && P.dz === 0 &&
          cm.length === 1 && cm[0].parameters.cutId === myCut.id && String(cm[0].parameters.parent) === String(x.h) && Math.abs(cm[0].parameters[dk] - P[dk]) < 1e-12) });
    }
  });
  console.log('  §SLIDE sessions ' + j(sess));
  chk('W4 SESSION: each of the 2 slideable fillings forms a slide session carrying exactly its own GEOM_CUT (F=1) — no refusal',
    pf.length === 2 && sess.every(function (r) { return r.ok; }), 'formed=' + sess.filter(function (r) { return r.formed; }).length + '/' + pf.length);
  console.log('  §SLIDE drops ' + j(w5));
  chk('W5 OP: resolveDrop ⇒ GEOM_MOVE {parent: filling, along-axis delta only} + ONE GEOM_CUT_MOVE {cutId, parent: host} rider with the SAME delta (the hole rides the door) ×2',
    w5.length === 2 && w5.every(function (r) { return r.ok; }), 'ok=' + w5.filter(function (r) { return r.ok; }).length + '/' + w5.length);

  // ── W6 REPLAY ──
  var before = count(S.oplog, 'SELECT count(*) FROM kernel_ops');
  var again = await ArcEditable.seedArc(pdb, { geoDb: geoDb, registerGeometry: function (a) { Library.registerRealGeometry(a); }, commitGroup: S.commitGroup, building: 'SampleHouse' });
  var after = count(S.oplog, 'SELECT count(*) FROM kernel_ops');
  chk('W6 REPLAY: a second seedArc commits 0 new rows (arcseed-SampleHouse + arcseed-cuts-SampleHouse both idempotent)',
    after === before && again.slideCutIds.length === 2, 'rows ' + before + '→' + after + ' cutIds=' + again.slideCutIds.length);

  // ── W7 UNCUT-SOLID — line crossings on the FOLDED positions (the exact buffer the kernel seeds from) ──
  function crossings(pos, idx, o, k) {   // count triangles a line through o along world axis k crosses (projected point-in-triangle)
    var a = (k + 1) % 3, b = (k + 2) % 3, n = 0;
    for (var t = 0; t < idx.length; t += 3) {
      var P0 = idx[t] * 3, P1 = idx[t + 1] * 3, P2 = idx[t + 2] * 3;
      var x0 = pos[P0 + a], y0 = pos[P0 + b], x1 = pos[P1 + a], y1 = pos[P1 + b], x2 = pos[P2 + a], y2 = pos[P2 + b];
      var den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-12) continue;
      var l0 = ((y1 - y2) * (o[a] - x2) + (x2 - x1) * (o[b] - y2)) / den, l1 = ((y2 - y0) * (o[a] - x2) + (x0 - x2) * (o[b] - y2)) / den, l2 = 1 - l0 - l1;
      if (l0 >= 0 && l1 >= 0 && l2 >= 0) n++;
    }
    return n;
  }
  var w7 = S.cutRows.map(function (c) {
    var P = S.opByFid[c.parameters.parent].params, f = Library.foldInsert({ id: +c.parameters.parent, op_type: 'GEOM_INSERT', parameters: P }, null), hb = bboxOf(f.positions);
    var k = (hb[1] - hb[0]) < (hb[3] - hb[2]) ? 0 : 1, vd = c.parameters.void, o = [(vd.c1[0] + vd.c2[0]) / 2, (vd.c1[1] + vd.c2[1]) / 2, (vd.c1[2] + vd.c2[2]) / 2];
    return { cut: c.id, host: c.parameters.parent, crossings: crossings(f.positions, f.indices, o, k) };
  });
  var refusedOpen = (pdb.exec("SELECT opening_guid, host_guid FROM rel_fills_host WHERE opening_guid NOT IN (SELECT opening_guid FROM slide_openings)")[0] || { values: [] }).values;
  var ctl7 = refusedOpen.map(function (v) {   // the refused hosts' SHIPPED fold at their openings — the control: 0 crossings (the body is holed)
    var hf = S.fbg[v[1]], P = S.opByFid[hf].params, f = Library.foldInsert({ id: +hf, op_type: 'GEOM_INSERT', parameters: P }, null), hb = bboxOf(f.positions), k = (hb[1] - hb[0]) < (hb[3] - hb[2]) ? 0 : 1;
    var fb = S.boxByFid[S.fbg[pdb.exec("SELECT filling_guid FROM rel_fills_host WHERE opening_guid='" + v[0] + "'")[0].values[0][0]]], o = centreOf(fb);
    return { opening: v[0], host: hf, crossings: crossings(f.positions, f.indices, o, k) };
  });
  console.log('  §SLIDE uncut-solid cuts=' + j(w7) + ' refused-host control=' + j(ctl7));
  chk('W7 UNCUT-SOLID: the seeded uncut body is SOLID (≥2 crossings) at every GEOM_CUT void centre; the 5 refused openings read 0 crossings on their shipped brep (control)',
    w7.length === 2 && w7.every(function (r) { return r.crossings >= 2; }) && ctl7.length === 5 && ctl7.every(function (r) { return r.crossings === 0; }), 'cuts=' + j(w7.map(function (r) { return r.crossings; })) + ' control=' + j(ctl7.map(function (r) { return r.crossings; })));

  // ── W8 REFUSED-HONEST ──
  var w8 = refusedPop.map(function (x) { var s8 = ItemDrag.beginItemDragSession(S.ctxFor(x.f)); return { f: x.f, h: x.h, formed: !!(s8 && s8.slide) }; });
  console.log('  §SLIDE refused-population ' + j(w8));
  chk('W8 REFUSED-HONEST: the 5 fillings of the 2 brep hosts (no uncut body in the source) still REFUSE the slide — never a hole left behind',
    w8.length === 5 && w8.every(function (r) { return !r.formed; }), 'refused=' + w8.filter(function (r) { return !r.formed; }).length + '/' + w8.length);

  console.log('W-SLIDE-REAL-WALL: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
