#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DAGEVU-SLIDE: the along-host OPENING SLIDE through the engine (PURE NODE, REAL SampleHouse).
 * Implementing prompts/SPEC_DAGEVU_SLIDE.md §5 (parent: ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §3.1/§3.3/Q5). Read the log
 * after every run — exit code alone is not evidence.
 *
 * Issue under test: bonsai_itemdrag.js's own header used to say "no separate along-host slide constraint in v1";
 * a hosted door/window dragged with the item tool was a FREE 3-D drag gated by the MEP product resolver (which has
 * no door/window row → refused). This proves a real filling now takes a 1-DOF slide session whose constraint is
 * the engine's HostFillEdge.constrain (DagevuEngine's SECOND consumer), gated per frame by the production SdgGate,
 * committed as the existing GEOM_MOVE shape — and refuses honestly where it cannot be honest.
 *
 *   S0 SUBSTRATE   — real seeded SampleHouse, real rel_fills_host rows, a real WALL-hosted filling picked live
 *   S1 SESSION     — the filling gets a slide session carrying the engine edge; the resolver is NEVER consulted
 *   S2 IN-BOUNDS   — a candidate off-axis + above ⇒ valid, snappedPos holds orthogonal+z, t exact, dimLabel present
 *   S3 OFF-HOST    — a candidate past the wall end ⇒ valid:false 'off-host-extent', NO snappedPos (never a clamp)
 *   S4 OP          — resolveDrop ⇒ GEOM_MOVE {parent:filling, constrained delta}; one 'fills-opening' rider iff a
 *                    seeded opening resolves (same delta)
 *   S5 GATE-RED    — a constructed blocker box on the slide path ⇒ valid:false 'gate-red:clash', conflictIds names it
 *   S6 CARVED-VOID — an active GEOM_CUT {parent:host} over the filling ⇒ the session CARRIES the cut and resolveDrop adds a
 *                    GEOM_CUT_MOVE rider (§CUT-MOVE, prompts/SPEC_GEOM_CUT_MOVE.md); REFUSED without an honest frame (no
 *                    geomOps supplied / the host was rotated after the cut) — never a guessed frame
 *   S7 NO-ENGINE   — DagevuEngine absent ⇒ session null (the constraint has no local fallback)
 *   S8 PLAIN-EXTRUDE — plainExtrudeProfile: a 4-point axis-aligned rectangle ⇒ true; L-shape / rotated / 3-point ⇒ false
 *                    (a sketched rectangular wall is a slide host; its holes are GEOM_CUT ops, riding per S6)
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
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
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
function bboxOf(positions) {
  var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (var i = 0; i < positions.length; i += 3) for (var k = 0; k < 3; k++) { if (positions[i + k] < mn[k]) mn[k] = positions[i + k]; if (positions[i + k] > mx[k]) mx[k] = positions[i + k]; }
  return [mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]];
}
function centreOf(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }
function withinXY(box, pt, tol) { return pt[0] >= box[0] - tol && pt[0] <= box[1] + tol && pt[1] >= box[2] - tol && pt[1] <= box[3] + tol; }
function j(x) { return JSON.stringify(x); }

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-DAGEVU-SLIDE — along-host opening slide through the engine (node, REAL SampleHouse) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));
  var oplog = new SQL.Database();
  var seed = await ArcEditable.seedArc(bdb, {
    commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); },
    building: 'SampleHouse'
  });
  var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid;
  var opByFid = {}; seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
  var fills = CrossEdges.deriveAll(bdb).fills;
  var boxByFid = {}, classByFid = {}, placementByFid = {};
  Object.keys(opByFid).forEach(function (fid) {
    boxByFid[fid] = bboxOf(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: opByFid[fid].params }, null).positions);
    if (opByFid[fid].params && opByFid[fid].params.ifc_class) classByFid[fid] = opByFid[fid].params.ifc_class;
    if (opByFid[fid].params && opByFid[fid].params.placement) placementByFid[fid] = opByFid[fid].params.placement;
  });
  // plainBoxOf: the PRODUCTION cut gate (bonsai_kernel.js _insertCutBox) when it loads under node, else an explicit
  // fixture (logged) — never a re-derived vertex test.
  var plainBoxOf = kernelLoaded
    ? function (fid) { var op = opByFid[fid]; if (!op) return null; try { return !!global.window.Bonsai._insertCutBox({ id: +fid, op_type: 'GEOM_INSERT', parameters: op.params }); } catch (e) { return false; } }
    : function () { return true; };
  console.log('  §SLIDE plainBoxOf oracle = ' + (kernelLoaded ? 'PRODUCTION Bonsai._insertCutBox' : 'FIXTURE (bonsai_kernel.js did not load under node) — always true'));
  var resolverTouched = 0;
  var resolverTrap = new Proxy({}, { get: function (_, k) { resolverTouched++; throw new Error('§SLIDE resolver consulted for a filling (' + String(k) + ')'); } });
  function ctxFor(fid, extra) {
    return Object.assign({ fid: fid, insertParams: opByFid[fid] ? opByFid[fid].params : {}, boxByFid: boxByFid, classByFid: classByFid,
      guidByFid: gbf, fidByGuid: fbg, fills: fills, resolver: resolverTrap, placementByFid: placementByFid, cutOps: [],
      plainBoxOf: plainBoxOf, kinematics: GK, gate: SdgGate, dagevu: DE, cascade: SdgCascade }, extra || {});
  }

  // S0 — pick a REAL wall-hosted filling whose slide session actually forms (log every refusal on the way)
  var pick = null, tried = [];
  for (var i = 0; i < fills.length && !pick; i++) {
    var e = fills[i], h = fbg[e.host_guid], f = fbg[e.filling_guid];
    if (h == null || f == null || !boxByFid[h] || !boxByFid[f]) continue;
    if (ItemDrag.HOST_CLASSES.WALL.indexOf(classByFid[h]) === -1) { tried.push(f + ':host-not-wall'); continue; }
    if (!withinXY(boxByFid[h], centreOf(boxByFid[f]), 0.05)) { tried.push(f + ':centre-outside-host'); continue; }
    var s = ItemDrag.beginItemDragSession(ctxFor(f));
    if (s && s.slide) pick = { fid: f, host: h, row: e, session: s }; else tried.push(f + ':refused');
  }
  chk('S0 SUBSTRATE: real seeded SampleHouse + real rel_fills_host + a real WALL-hosted filling whose slide session forms',
    !!pick, pick ? ('filling=' + pick.fid + '(' + classByFid[pick.fid] + ') host=' + pick.host + '(' + classByFid[pick.host] + ') opening=' + pick.session.slide.openingFid + ' tried=' + j(tried)) : 'tried=' + j(tried));
  if (!pick) { console.log('W-DAGEVU-SLIDE: ' + pass + ' PASS / ' + (fail + 7) + ' FAIL (no fixture — S1-S7 not run)'); process.exit(1); }
  var S = pick.session, sl = S.slide, c = S.preCentre, K = sl.axis, other = 1 - K, ax = 'xy'[K];
  var fb = boxByFid[pick.fid], hb = boxByFid[pick.host];

  // S1 — SESSION
  chk('S1 SESSION: slide session carries the engine edge (HostFillEdge), product=FILLING:*, dims = own AABB, resolver NEVER consulted',
    sl.edge instanceof DE.HostFillEdge && sl.edge.hostFid === pick.host && sl.edge.fillingFid === pick.fid && /^FILLING:/.test(S.real.matchedProductId) &&
    Math.abs(S.real.width - (fb[1] - fb[0])) < 1e-12 && resolverTouched === 0 && sl.tMin <= 0 && sl.tMax >= 0,
    'axis=' + ax + ' t∈[' + sl.tMin.toFixed(3) + ',' + sl.tMax.toFixed(3) + '] resolverTouched=' + resolverTouched);

  // S2 — IN-BOUNDS: scan admissible t (gate may RED on a real neighbour at some t — take the first valid)
  var tOK = null, v2 = null, scan = [0.2, -0.2, 0.4, -0.4, 0.1, -0.1, 0.6, -0.6];
  for (var si = 0; si < scan.length && tOK == null; si++) {
    var t = scan[si]; if (t < sl.tMin || t > sl.tMax) continue;
    var cand = c.slice(); cand[K] += t; cand[other] += 0.3; cand[2] += 0.1;          // off-axis + above: must be dropped
    var v = ItemDrag.canDropAt(S, cand[0], cand[1], cand[2]);
    if (v.valid) { tOK = t; v2 = v; } else console.log('  §SLIDE S2 scan t=' + t + ' → ' + v.reason + ' conflicts=' + j(v.conflictIds));
  }
  chk('S2 IN-BOUNDS: valid; snappedPos = preCentre + t on ' + ax + ' only (orthogonal + z HELD); t exact; dimLabel from the engine',
    v2 && v2.valid && tOK != null && Math.abs(v2.t - tOK) < 1e-12 && Math.abs(v2.snappedPos[K] - (c[K] + tOK)) < 1e-12 && v2.snappedPos[other] === c[other] && v2.snappedPos[2] === c[2] &&
    typeof v2.dimLabel === 'string' && v2.dimLabel.indexOf('#' + pick.fid + ' along #' + pick.host) === 0,
    v2 ? ('t=' + tOK + ' snapped=' + j(v2.snappedPos.map(function (x) { return +x.toFixed(3); })) + ' label="' + v2.dimLabel + '"') : 'no valid t in scan');

  // S3 — OFF-HOST
  var c3 = c.slice(); c3[K] += sl.tMax + 0.5;
  var v3 = ItemDrag.canDropAt(S, c3[0], c3[1], c3[2]);
  chk('S3 OFF-HOST: past the wall end ⇒ valid:false reason=off-host-extent, NO snappedPos, refusal {slide-off-host,t}',
    v3 && v3.valid === false && v3.reason === 'off-host-extent' && v3.snappedPos == null && v3.refusal && v3.refusal.kind === 'slide-off-host',
    j({ reason: v3.reason, t: v3.t, tMax: sl.tMax }));

  // S4 — OP shape (+ rider iff a seeded opening resolves)
  var c4 = c.slice(); c4[K] += (tOK != null ? tOK : 0); c4[other] += 0.3; c4[2] += 0.1;
  var d4 = ItemDrag.resolveDrop(S, c4[0], c4[1], c4[2]);
  var P = d4.op && d4.op.parameters, wantRiders = sl.openingFid != null ? 1 : 0;
  var riderOk = d4.riders && d4.riders.length === wantRiders && d4.riders.every(function (r) {
    return r.op_type === 'GEOM_MOVE' && r.parameters.induced === 'fills-opening' && r.parameters.parent === sl.openingFid &&
      r.parameters.dx === P.dx && r.parameters.dy === P.dy && r.parameters.dz === P.dz; });
  chk('S4 OP: GEOM_MOVE {parent:filling} with the CONSTRAINED delta (off-axis + z components 0); ' + wantRiders + ' fills-opening rider(s) with the same delta',
    d4.committed && d4.op.op_type === 'GEOM_MOVE' && P.parent === pick.fid && Math.abs((K === 0 ? P.dx : P.dy) - (tOK != null ? tOK : 0)) < 1e-12 &&
    (K === 0 ? P.dy : P.dx) === 0 && P.dz === 0 && riderOk,
    j({ op: P, riders: d4.riders }));

  // S5 — GATE-RED: a constructed blocker box sitting exactly where the filling would land at t_b
  var w = fb[2 * K + 1] - fb[2 * K], tB = (w + 0.2 <= sl.tMax) ? (w + 0.2) : -(w + 0.2);
  var box5 = Object.assign({}, boxByFid), blk = fb.slice(); blk[2 * K] += tB; blk[2 * K + 1] += tB; box5[9100] = blk;
  var S5 = ItemDrag.beginItemDragSession(ctxFor(pick.fid, { boxByFid: box5 }));
  var c5 = c.slice(); c5[K] += tB;
  var v5 = S5 ? ItemDrag.canDropAt(S5, c5[0], c5[1], c5[2]) : null;
  chk('S5 GATE-RED: a blocker box on the slide path ⇒ valid:false reason=gate-red:clash, conflictIds names the blocker (the production SdgGate, delta-honest)',
    tB >= sl.tMin && tB <= sl.tMax && v5 && v5.valid === false && /^gate-red:/.test(v5.reason) && /clash/.test(v5.reason) && v5.conflictIds.indexOf('9100') >= 0,
    j({ tB: tB, reason: v5 && v5.reason, conflicts: v5 && v5.conflictIds }));

  // S6 — CARVED VOID (§CUT-MOVE, prompts/SPEC_GEOM_CUT_MOVE.md §4): an active GEOM_CUT over the filling no longer
  // refuses — it RIDES as a GEOM_CUT_MOVE rider in the cut's authored frame. Refuses only without an honest frame.
  var cut = { id: 777, op_type: 'GEOM_CUT', parent: pick.host, parameters: { parent: pick.host, void: { c1: [fb[0], fb[2], fb[4]], c2: [fb[1], fb[3], fb[5]] } } };
  var S6a = ItemDrag.beginItemDragSession(ctxFor(pick.fid, { cutOps: [cut] }));                 // no geomOps ⇒ no frame ⇒ refuse
  var S6 = ItemDrag.beginItemDragSession(ctxFor(pick.fid, { cutOps: [cut], geomOps: [cut] }));
  var c6 = c.slice(); c6[K] += (tOK != null ? tOK : 0); c6[other] += 0.3; c6[2] += 0.1;
  var d6 = S6 ? ItemDrag.resolveDrop(S6, c6[0], c6[1], c6[2]) : null;
  var cr6 = d6 && d6.riders ? d6.riders.filter(function (r) { return r.op_type === 'GEOM_CUT_MOVE'; }) : [];
  var dk = ax === 'x' ? 'dx' : 'dy';
  chk('S6 CARVED-VOID rides (§CUT-MOVE): an active GEOM_CUT {parent:host} over the filling ⇒ session carries cuts=[{cutId:777,F:1}]; resolveDrop adds ONE GEOM_CUT_MOVE {cutId:777, parent:host, d = the door\'s delta (F=1), induced:fills-opening}; WITHOUT geomOps (no frame) ⇒ REFUSED',
    S6a === null && !!S6 && S6.slide.cuts.length === 1 && S6.slide.cuts[0].cutId === 777 && S6.slide.cuts[0].F === 1 && ItemDrag.bakedVoidFor([cut], pick.host, fb) === 777 &&
    !!d6 && d6.committed && cr6.length === 1 && cr6[0].parameters.cutId === 777 && String(cr6[0].parameters.parent) === String(pick.host) &&
    Math.abs(cr6[0].parameters[dk] - d6.op.parameters[dk]) < 1e-12 && cr6[0].parameters.induced === 'fills-opening',
    j({ S6a: S6a, cuts: S6 && S6.slide.cuts, rider: cr6[0] && cr6[0].parameters, door: d6 && d6.op && d6.op.parameters }));
  // S6b — a post-cut GEOM_ROTATE on the host ⇒ no honest authored→world frame ⇒ REFUSED (never a guessed F)
  var rot = { id: 778, op_type: 'GEOM_ROTATE', parent: pick.host, parameters: { parent: pick.host, drot: 30 } };
  var S6b = ItemDrag.beginItemDragSession(ctxFor(pick.fid, { cutOps: [cut], geomOps: [cut, rot] }));
  chk('S6b CARVED-VOID after a host ROTATE ⇒ session REFUSED (frameScale: rotated-after-cut — the authored axis is no longer a world axis)', S6b === null);

  // S7 — NO ENGINE
  var S7 = ItemDrag.beginItemDragSession(ctxFor(pick.fid, { dagevu: { HostFillEdge: null } }));
  chk('S7 NO-ENGINE: DagevuEngine absent ⇒ slide session REFUSED (the constraint has no local fallback); free-drag path untouched', S7 === null);

  // S8 — PLAIN-EXTRUDE oracle (the sketched-wall host, the tool's primary use case)
  var PE = ItemDrag.plainExtrudeProfile;
  chk('S8 PLAIN-EXTRUDE: 4-point axis-aligned rectangle ⇒ true; L-shape (6 pts), rotated square, degenerate 3-point, zero-width ⇒ false',
    PE([[0, 0], [4, 0], [4, 0.2], [0, 0.2]]) === true && PE([[0, 0], [0, 0.2], [4, 0.2], [4, 0]]) === true &&
    PE([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]) === false && PE([[0, 0], [1, 1], [0, 2], [-1, 1]]) === false &&
    PE([[0, 0], [4, 0], [4, 0.2]]) === false && PE([[0, 0], [4, 0], [4, 0], [0, 0]]) === false);

  console.log('W-DAGEVU-SLIDE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
