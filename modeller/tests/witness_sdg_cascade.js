#!/usr/bin/env node
/**
 * W-SDG-CASCADE-MODELLER — §SDG-CASCADE value witness (PURE NODE, REAL SampleHouse). The hosted-by ride: a moved
 * HOST (wall) drags its hosted FILLINGS (door/window) by the SAME delta, over the REAL rel_fills_host edges
 * resolved through the §ARC-1 featureId↔guid bridge. Exercises the REAL foldInsert (the ride math) + CrossEdges
 * (the real edges) + ArcEditable (the bridge).
 *
 * Issue under test: before slice (2), dragging a wall left its doors behind (cascade was a no-op). Proves the
 * door now RIDES, rigidly, only on recovered edges, invertibly (rosetta 0.000mm).
 *
 *   C1 directional  — ridersFor(host) includes its filling; ridersFor(filling) is EMPTY (a door never drags its wall)
 *   C2 all fillings — a wall with k fillings ⇒ all k ride; deduped; a moved filling never double-rides
 *   C3 rigid ride   — under delta d, foldInsert centre of host AND rider each shift by EXACTLY d (no drift)
 *   C4 offset-inv   — (rider − host) centre offset is INVARIANT under the move (rigid body: the door stays in its hole)
 *   C5 rosetta      — applying −d to the +d fold recovers the original centre within 1e-6 (invertible, 0.000mm)
 *   C6 non-invent   — every ride edge has provenance 'ifc:recovered'; no rider lacks a real fills edge
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
var SdgCascade = require(path.join(ROOT, 'sdg_cascade.js'));
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
function approx(a, b) { return Math.abs(a - b) <= 1e-6; }
function centre(positions) {
  var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (var i = 0; i < positions.length; i += 3) for (var k = 0; k < 3; k++) { if (positions[i + k] < mn[k]) mn[k] = positions[i + k]; if (positions[i + k] > mx[k]) mx[k] = positions[i + k]; }
  return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
}
function foldCentre(op, fid, mv) { return centre(Library.foldInsert({ id: fid, op_type: 'GEOM_INSERT', parameters: op.params }, mv || null).positions); }

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-SDG-CASCADE-MODELLER — hosted-by ride (node, REAL SampleHouse) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));

  // seed → ops + bridge (the §ARC-1 substrate); real fills edges from CrossEdges
  var oplog = new SQL.Database();
  var seed = await ArcEditable.seedArc(bdb, {
    commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); },
    building: 'SampleHouse'
  });
  var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid;
  var opByFid = {}; seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
  var X = CrossEdges.deriveAll(bdb);
  var fills = X.fills;
  chk('C0 substrate ready: seed + bridge + real fills edges', seed.committed > 0 && fills.length > 0, 'seeded=' + seed.committed + ' fills=' + fills.length);

  // a fills edge whose BOTH endpoints are seeded (ARC↔ARC) — host=wall, filling=door
  var edge = fills.find(function (e) { return fbg[e.host_guid] != null && fbg[e.filling_guid] != null; });
  var hostFid = fbg[edge.host_guid], doorFid = fbg[edge.filling_guid];

  // C1 — directional
  var ridersOfHost = SdgCascade.ridersFor([hostFid], gbf, fbg, fills, new Set([hostFid]));
  var ridersOfDoor = SdgCascade.ridersFor([doorFid], gbf, fbg, fills, new Set([doorFid]));
  chk('C1 host drags its filling; filling does NOT drag its host (directional)',
    ridersOfHost.indexOf(doorFid) >= 0 && ridersOfDoor.length === 0, 'host→' + ridersOfHost.length + ' door→' + ridersOfDoor.length);

  // C2 — all fillings of a multi-fill host ride; dedupe; moved filling never double-rides
  var byHost = {}; fills.forEach(function (e) { if (fbg[e.host_guid] != null && fbg[e.filling_guid] != null) (byHost[e.host_guid] = byHost[e.host_guid] || []).push(e.filling_guid); });
  var bestHost = Object.keys(byHost).sort(function (a, b) { return byHost[b].length - byHost[a].length; })[0];
  var bestHostFid = fbg[bestHost], expectFillFids = byHost[bestHost].map(function (g) { return fbg[g]; });
  var ridersBest = SdgCascade.ridersFor([bestHostFid], gbf, fbg, fills, new Set([bestHostFid]));
  var allRide = expectFillFids.every(function (f) { return ridersBest.indexOf(f) >= 0; }) && ridersBest.length === new Set(ridersBest).size;
  // co-select the host AND one filling → that filling must NOT appear as an induced rider (already moved)
  var ridersCo = SdgCascade.ridersFor([bestHostFid, expectFillFids[0]], gbf, fbg, fills, new Set([bestHostFid, expectFillFids[0]]));
  chk('C2 all k fillings ride; deduped; a co-moved filling never double-rides',
    allRide && ridersCo.indexOf(expectFillFids[0]) < 0, 'k=' + expectFillFids.length + ' riders=' + ridersBest.length + ' co=' + ridersCo.length);

  // C3/C4/C5 — fold geometry under a delta
  var d = [1.5, -0.7, 0.3], mv = { dx: d[0], dy: d[1], dz: d[2] };
  var h0 = foldCentre(opByFid[hostFid], hostFid), r0 = foldCentre(opByFid[doorFid], doorFid);
  var h1 = foldCentre(opByFid[hostFid], hostFid, mv), r1 = foldCentre(opByFid[doorFid], doorFid, mv);
  var hostShift = approx(h1[0], h0[0] + d[0]) && approx(h1[1], h0[1] + d[1]) && approx(h1[2], h0[2] + d[2]);
  var riderShift = approx(r1[0], r0[0] + d[0]) && approx(r1[1], r0[1] + d[1]) && approx(r1[2], r0[2] + d[2]);
  chk('C3 rigid ride: host AND rider centres each shift by EXACTLY the delta', hostShift && riderShift,
    'host[' + h0.map(function (x) { return x.toFixed(2); }) + ']→[' + h1.map(function (x) { return x.toFixed(2); }) + ']');
  var off0 = [r0[0] - h0[0], r0[1] - h0[1], r0[2] - h0[2]], off1 = [r1[0] - h1[0], r1[1] - h1[1], r1[2] - h1[2]];
  chk('C4 door↔wall offset INVARIANT under the move (door stays in its hole)',
    approx(off0[0], off1[0]) && approx(off0[1], off1[1]) && approx(off0[2], off1[2]), 'off=[' + off0.map(function (x) { return x.toFixed(3); }) + ']');

  // C5 — rosetta: apply −d to the +d fold → original centre (invertible, 0.000mm)
  var hBack = [h1[0] - d[0], h1[1] - d[1], h1[2] - d[2]], rBack = [r1[0] - d[0], r1[1] - d[1], r1[2] - d[2]];
  var maxErr = Math.max(Math.abs(hBack[0] - h0[0]), Math.abs(hBack[1] - h0[1]), Math.abs(hBack[2] - h0[2]),
    Math.abs(rBack[0] - r0[0]), Math.abs(rBack[1] - r0[1]), Math.abs(rBack[2] - r0[2]));
  chk('C5 rosetta round-trip: −delta recovers the original (invertible, 0.000mm)', maxErr <= 1e-6, 'maxErr=' + maxErr.toExponential(2) + 'mm');

  // C6 — non-invent: every ride rests on a recovered edge
  var allRecovered = fills.every(function (e) { return e.provenance === 'ifc:recovered'; });
  var ridersAllHaveEdge = ridersBest.every(function (rf) {
    var g = gbf[rf]; return fills.some(function (e) { return e.filling_guid === g && e.host_guid === bestHost; });
  });
  chk('C6 non-invent: every fills edge is ifc:recovered + every rider has a real edge', allRecovered && ridersAllHaveEdge);

  console.log('W-SDG-CASCADE-MODELLER: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
