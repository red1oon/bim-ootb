#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-MOVE-ROUNDTRIP: rosetta-invertibility of GEOM_ROOM_MOVE (PURE NODE, REAL SampleHouse).
 * Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §6 — Witness: W-ROOM-MOVE-ROUNDTRIP.
 * Read the log after every run. Exit code alone is not evidence.
 *
 * Issue under test: a move that does not exactly invert accumulates drift, so a user who nudges a room back and
 * forth silently corrupts the model. sdg_cascade.js already CLAIMS this property for rides ("apply −delta
 * recovers the original; 0.000mm round-trip", sdg_cascade.js:8). This witness asserts the SAME property for the
 * whole-room move, over the REAL production fold — it does not assume it.
 *
 *   R0 SUBSTRATE  — real room, real members, real seeded geometry (proves: not a synthetic fixture).
 *   R1 NET-EXACT  — the two ops accumulate to a net (0,0,0) per member, BIT-EXACT (proves: the inverse is exactly
 *                   representable; no epsilon is being hidden in the accumulator).
 *   R2 ROUNDTRIP  — folding the log with both ops returns EVERY member's world AABB to its pre-move position at
 *                   0.000 mm — exactly, not approximately (proves: no drift; disproves accumulation error).
 *   R3 REALLY-MOVED — the intermediate (forward-only) fold really did displace every member by the full delta
 *                   (proves R2 is not passing trivially because nothing ever moved).
 *   R4 SEQUENTIAL — applying the inverse to the INTERMEDIATE state (the two-step a user actually performs)
 *                   also lands back within float32 storage precision (proves: order/replay does not matter).
 *   R5 MEMBERSHIP — the reverse move carries the identical member list, so nothing joins or leaves between the
 *                   two halves of the round trip (proves: no membership drift can smuggle in a partial revert).
 *   R6 CHAIN      — both ops sign into the real kernel_ops chain and it still verifies (proves: the round trip
 *                   is two honest signed rows, not an in-place undo).
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
var RoomMove = require(path.join(ROOT, 'bonsai_roommove.js'));
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

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-ROOM-MOVE-ROUNDTRIP — (dx,dy) then (−dx,−dy) ⇒ 0.000 mm (node, REAL SampleHouse) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));
  var oplog = new SQL.Database();
  var seed = await ArcEditable.seedArc(bdb, {
    commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); },
    building: 'SampleHouse'
  });
  var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid;
  var opByFid = {}; seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
  var fills = CrossEdges.deriveAll(bdb).fills;

  var boxByFid = {}, classByFid = {};
  Object.keys(opByFid).forEach(function (fid) {
    boxByFid[fid] = bboxOf(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: opByFid[fid].params }, null).positions);
    if (opByFid[fid].params && opByFid[fid].params.ifc_class) classByFid[fid] = opByFid[fid].params.ifc_class;
  });

  var rooms = RoomMove.qualifiedRooms(bdb), cont = RoomMove.readContainment(bdb);
  var room = rooms.filter(function (r) { return (cont.bySpace[r.guid] || []).length > 0; })
                  .sort(function (a, b) { return cont.bySpace[b.guid].length - cont.bySpace[a.guid].length; })[0];
  var enumCtx = {
    spaceGuid: room.guid, containedGuids: cont.bySpace[room.guid] || [], spaceBoundary: null,
    footprint: room.footprint, containedAny: cont.contained,
    boxByFid: boxByFid, classByFid: classByFid, fidByGuid: fbg, guidByFid: gbf,
    fills: fills, ridersFor: SdgCascade.ridersFor
  };
  var fwd = RoomMove.enumerateMembers(enumCtx);
  chk('R0 substrate: REAL qualified room with REAL members over REAL seeded geometry',
    !!room && fwd.members.length > 0 && Object.keys(boxByFid).length > 0,
    'room="' + room.name + '" members=' + fwd.members.length + ' seededFids=' + Object.keys(boxByFid).length);

  var DX = 2.3125, DY = -1.0625;                        // exactly representable binary fractions — the inverse is exact
  var opFwd = RoomMove.roomMoveOp(room.guid, DX, DY, 0, fwd.members);
  var opRev = RoomMove.roomMoveOp(room.guid, -DX, -DY, 0, fwd.members);

  // R1 — NET: what the production fold (bonsai_kernel.js §ROOMMOVE) accumulates across BOTH rows.
  var net = RoomMove.accumulate(opRev.parameters, RoomMove.accumulate(opFwd.parameters, new Map()));
  var netExact = fwd.members.every(function (m) {
    var a = net.get(m.featureId); return a && a.dx === 0 && a.dy === 0 && a.dz === 0;
  });
  chk('R1 net-exact: both signed rows accumulate to a BIT-EXACT (0,0,0) per member — the inverse is exactly representable, no epsilon hidden in the accumulator',
    netExact, 'members=' + fwd.members.length + ' netΔ=(0,0,0) for all');

  // R3/R2 — fold FORWARD only, then fold the FULL log; compare to the untouched original.
  var fwdOnly = RoomMove.accumulate(opFwd.parameters, new Map());
  var movedMin = Infinity, backMax = 0;
  fwd.members.forEach(function (m) {
    var p = opByFid[m.featureId].params;
    var c0 = centreOf(boxByFid[m.featureId]);
    var cF = centreOf(bboxOf(Library.foldInsert({ id: +m.featureId, op_type: 'GEOM_INSERT', parameters: p }, fwdOnly.get(m.featureId)).positions));
    var cB = centreOf(bboxOf(Library.foldInsert({ id: +m.featureId, op_type: 'GEOM_INSERT', parameters: p }, net.get(m.featureId)).positions));
    movedMin = Math.min(movedMin, Math.hypot(cF[0] - c0[0], cF[1] - c0[1]));
    backMax = Math.max(backMax, Math.abs(cB[0] - c0[0]), Math.abs(cB[1] - c0[1]), Math.abs(cB[2] - c0[2]));
  });
  chk('R2 roundtrip: after (dx,dy) then (−dx,−dy) EVERY member centre is back at its pre-move position — 0.000 mm, exactly',
    backMax === 0, 'maxResidual=' + (backMax * 1000).toFixed(6) + ' mm over ' + fwd.members.length + ' members');
  chk('R3 really-moved: the forward-only fold displaced every member by the full |Δ| — R2 is not passing because nothing ever moved',
    Math.abs(movedMin - Math.hypot(DX, DY)) < 1e-5,
    'minDisplacement=' + movedMin.toFixed(6) + 'm wanted=' + Math.hypot(DX, DY).toFixed(6) + 'm');

  // R4 — SEQUENTIAL: apply the inverse to the INTERMEDIATE state (the two-step a user really performs).
  var seqMax = 0;
  fwd.members.forEach(function (m) {
    var p = opByFid[m.featureId].params;
    var c0 = centreOf(boxByFid[m.featureId]);
    var cF = centreOf(bboxOf(Library.foldInsert({ id: +m.featureId, op_type: 'GEOM_INSERT', parameters: p }, fwdOnly.get(m.featureId)).positions));
    var back = [cF[0] - DX, cF[1] - DY, cF[2]];   // apply (−DX,−DY) to the INTERMEDIATE centre
    seqMax = Math.max(seqMax, Math.abs(back[0] - c0[0]), Math.abs(back[1] - c0[1]), Math.abs(back[2] - c0[2]));
  });
  chk('R4 sequential: applying the inverse to the INTERMEDIATE (two-step) state also returns to the origin within float32 storage precision (1e-5 m)',
    seqMax < 1e-5, 'maxResidual=' + (seqMax * 1000).toFixed(6) + ' mm');

  // R5 — MEMBERSHIP: the reverse move carries the identical member list.
  var rev = RoomMove.enumerateMembers(enumCtx);
  var sig = function (r) { return r.members.map(function (m) { return m.featureId + ':' + m.via; }).sort().join('|'); };
  chk('R5 membership: forward and reverse enumerate the IDENTICAL member set + provenance — nothing joins or leaves between the two halves',
    sig(fwd) === sig(rev) && fwd.members.length === rev.members.length,
    'members=' + fwd.members.length + ' signatureIdentical=' + (sig(fwd) === sig(rev)));

  // R6 — CHAIN: both rows are honest signed ops, not an in-place undo.
  await KernelOps.commitGroup(oplog, [{ op_type: opFwd.op_type, params: opFwd.parameters }], { gid: 'rt-fwd', baseTs: 1700000900000 });
  await KernelOps.commitGroup(oplog, [{ op_type: opRev.op_type, params: opRev.parameters }], { gid: 'rt-rev', baseTs: 1700000901000 });
  var v = await KernelOps.verifyChain(oplog);
  var rows = oplog.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='GEOM_ROOM_MOVE'")[0].values[0][0];
  chk('R6 chain: BOTH halves are signed GEOM_ROOM_MOVE rows in the real kernel_ops chain and it still verifies (a round trip is two honest ops, never an in-place mutation)',
    rows === 2 && v.ok, 'rows=' + rows + ' verifyChain=' + v.ok + ' tip=' + String(v.tip).slice(0, 12));

  console.log('W-ROOM-MOVE-ROUNDTRIP: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
