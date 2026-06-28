#!/usr/bin/env node
/**
 * W-SDG-GATE — §GATE-1 value witness (PURE NODE, REAL SampleHouse). The RED/ORANGE conformity gate: after a
 * move/ride, flag the hard violations the edit BROKE (RED) and soft accept/ignore (ORANGE), delta-honestly (a
 * pre-existing as-extracted overlap is NOT flagged). Pure geometry over MEASURED seeded AABBs + RECOVERED edges.
 *
 *   A1 clean      — lift a wall into open space ⇒ red=0 orange=0
 *   A2 RED clash  — drive wall A onto wall B ⇒ red has clash{A,B,depth>tol}
 *   A3 delta-honest — a pre-existing B–C overlap, move a DIFFERENT wall ⇒ no clash mentions {B,C}
 *   A4 door-out   — slide a DOOR off its wall ⇒ red door-out{door,host}; move the HOST (door rides) ⇒ none
 *   A5 ORANGE     — bring a wall within < CLEARANCE of a neighbour (gap shrinks) ⇒ orange clearance{…}; far ⇒ none
 *   A6 non-invent — gate reads only the passed AABBs + edges; CLEARANCE is an explicit param
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
var SdgGate = require(path.join(ROOT, 'sdg_gate.js'));
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
function aabb(p) { var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; } return [mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]]; }
function tr(b, d) { return [b[0] + d[0], b[1] + d[0], b[2] + d[1], b[3] + d[1], b[4] + d[2], b[5] + d[2]]; }
function ctr(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }
function hasKind(arr, kind, x, y) { return arr.some(function (r) { return r.kind === kind && ((r.a === x && r.b === y) || (r.a === y && r.b === x)); }); }

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-SDG-GATE — §GATE-1 RED/ORANGE conformity (node, REAL SampleHouse) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));
  var oplog = new SQL.Database();
  var seed = await ArcEditable.seedArc(bdb, { commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); }, building: 'SampleHouse' });
  var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid;
  var opByFid = {}; seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
  var fills = CrossEdges.deriveAll(bdb).fills;

  // base (seeded) boxes for every fid
  var base = {}; Object.keys(opByFid).forEach(function (fid) { base[fid] = aabb(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: opByFid[fid].params }).positions); });

  // rel: hosted-by pairs are EXPECTED contact (never a clash); hostOf for door-out
  var fillsPairs = {}, hostOf = {};
  fills.forEach(function (e) { var hf = fbg[e.host_guid], ff = fbg[e.filling_guid]; if (hf != null && ff != null) { fillsPairs[Math.min(hf, ff) + '|' + Math.max(hf, ff)] = 1; hostOf[ff] = hf; } });
  var rel = { related: function (a, b) { return !!fillsPairs[Math.min(a, b) + '|' + Math.max(a, b)]; }, hostOf: hostOf };

  // the seeded walls
  var walls = Object.keys(opByFid).filter(function (fid) { var c = opByFid[fid].params.ifc_class; return c === 'IfcWall' || c === 'IfcWallStandardCase'; }).map(Number);
  var A = walls[0], B = walls[1], C = walls[2];

  // A1 — clean: lift wall A +10m into open space
  var b1 = {}; Object.keys(base).forEach(function (f) { b1[f] = base[f]; });
  var a1 = {}; Object.keys(base).forEach(function (f) { a1[f] = (+f === A) ? tr(base[f], [0, 0, 10]) : base[f]; });
  var g1 = SdgGate.evaluate(b1, a1, [A], rel, {});
  chk('A1 clean move (lift into open space) → no flags', g1.red.length === 0 && g1.orange.length === 0, 'red=' + g1.red.length + ' orange=' + g1.orange.length);

  // A2 — RED clash: drive wall A onto wall B (delta = B.centre − A.centre)
  var dAB = [ctr(base[B])[0] - ctr(base[A])[0], ctr(base[B])[1] - ctr(base[A])[1], ctr(base[B])[2] - ctr(base[A])[2]];
  var a2 = {}; Object.keys(base).forEach(function (f) { a2[f] = (+f === A) ? tr(base[f], dAB) : base[f]; });
  var g2 = SdgGate.evaluate(base, a2, [A], rel, {});
  chk('A2 RED clash: wall driven onto another wall → clash{A,B} flagged', hasKind(g2.red, 'clash', A, B), 'red=' + JSON.stringify(g2.red.slice(0, 2)));

  // A3 — delta-honest: pre-existing B–C overlap (in BOTH before+after), move a DIFFERENT wall A cleanly
  var dCB = [ctr(base[B])[0] - ctr(base[C])[0], ctr(base[B])[1] - ctr(base[C])[1], ctr(base[B])[2] - ctr(base[C])[2]];
  var b3 = {}, a3 = {};
  Object.keys(base).forEach(function (f) { b3[f] = (+f === C) ? tr(base[f], dCB) : base[f]; });   // C already on B (as-extracted-like)
  Object.keys(base).forEach(function (f) { a3[f] = (+f === C) ? tr(base[f], dCB) : ((+f === A) ? tr(base[f], [0, 0, 10]) : base[f]); });
  var g3 = SdgGate.evaluate(b3, a3, [A], rel, {});
  chk('A3 delta-honest: pre-existing B–C overlap NOT flagged when a different wall moves', !hasKind(g3.red, 'clash', B, C) && g3.red.length === 0, 'red=' + g3.red.length);

  // A4 — door-out: pick a fills edge whose filling centre IS within the host footprint (so "leaving" is detectable),
  // then slide the door off its wall (alone) vs ride-the-host (move host + ALL its fillings, as the real cascade does).
  var inHost = function (h, f) { var hb = base[h], c = ctr(base[f]); return c[0] >= hb[0] - 0.05 && c[0] <= hb[1] + 0.05 && c[1] >= hb[2] - 0.05 && c[1] <= hb[3] + 0.05; };
  var fe = fills.find(function (e) { var h = fbg[e.host_guid], f = fbg[e.filling_guid]; return h != null && f != null && inHost(h, f); });
  var door = fbg[fe.filling_guid], host = fbg[fe.host_guid];
  var hostFillings = fills.filter(function (e) { return fbg[e.host_guid] === host && fbg[e.filling_guid] != null; }).map(function (e) { return fbg[e.filling_guid]; });
  var far = [8, 8, 0];
  var a4a = {}; Object.keys(base).forEach(function (f) { a4a[f] = (+f === door) ? tr(base[f], far) : base[f]; });   // door alone
  var g4a = SdgGate.evaluate(base, a4a, [door], rel, {});
  var ride = [host].concat(hostFillings);                                                                            // host + ALL its fillings ride (cascade)
  var a4b = {}; Object.keys(base).forEach(function (f) { a4b[f] = (ride.indexOf(+f) >= 0) ? tr(base[f], far) : base[f]; });
  var g4b = SdgGate.evaluate(base, a4b, ride, rel, {});
  chk('A4 door-out: sliding a DOOR off its wall → red door-out{door,host}; moving the host (all fillings ride) → none',
    hasKind(g4a.red, 'door-out', door, host) && !g4b.red.some(function (r) { return r.kind === 'door-out'; }), 'alone=' + g4a.red.length + ' ride=' + g4b.red.length);

  // A5 — ORANGE clearance band (real wall A + a constructed neighbour overlapping in Y,Z, separated in X)
  var wa = base[A], wid = wa[1] - wa[0];
  var nb = [wa[1] + 2.0, wa[1] + 2.0 + wid, wa[2], wa[3], wa[4], wa[5]];   // neighbour 2.0m away on +X (gap 2.0 > clearance)
  var bb = {}; bb[A] = wa; bb['9001'] = nb;
  // move A to within 0.3m of the neighbour (gap 0.3 < 0.5 clearance, no overlap)
  var aTight = {}; aTight[A] = tr(wa, [2.0 - 0.3, 0, 0]); aTight['9001'] = nb;
  var g5 = SdgGate.evaluate(bb, aTight, [A], { related: function () { return false; } }, {});
  // control: move A only 1.0m closer (gap 1.0 > clearance) → no orange
  var aFar = {}; aFar[A] = tr(wa, [1.0, 0, 0]); aFar['9001'] = nb;
  var g5c = SdgGate.evaluate(bb, aFar, [A], { related: function () { return false; } }, {});
  chk('A5 ORANGE clearance: gap shrinks below CLEARANCE → orange; stays above → none',
    g5.orange.some(function (o) { return o.kind === 'clearance' && o.gap < 0.5; }) && g5c.orange.length === 0,
    'tight=' + JSON.stringify(g5.orange[0] || null) + ' far=' + g5c.orange.length);

  // A6 — non-invent: explicit CLEARANCE param changes the band, nothing hardcoded/fabricated
  var g6 = SdgGate.evaluate(bb, aTight, [A], { related: function () { return false; } }, { clearance: 0.2 });   // 0.3 gap > 0.2 → no orange
  chk('A6 non-invent: CLEARANCE is an explicit param (0.2 ⇒ 0.3m gap no longer ORANGE)', g6.orange.length === 0, 'orange@0.2=' + g6.orange.length);

  console.log('W-SDG-GATE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
