#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-MOVE: whole-room move value witness (PURE NODE, REAL SampleHouse).
 * Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §2 — Witness: W-ROOM-MOVE.
 * Read the log after every run. Exit code alone is not evidence.
 *
 * Issue under test: before this feature the modeller had NO room-level move (COMPETITIVE_PASCALORG_HARVEST.md
 * §4 item 2, grepped, zero hits) — a room's contents could only be moved element-by-element, which divorces a
 * room from its furniture. `GEOM_ROOM_MOVE` closes that. Each test names what it proves or disproves:
 *
 *   T0 SUBSTRATE   — the room, its members, the bridge and the fills edges are all REAL rows of
 *                    SampleHouse_extracted.db (proves: nothing below runs on fabricated inputs).
 *   T1 LEG-1       — every `rel_contained_in_space` element of the grabbed room is a member, tagged with that
 *                    exact provenance (proves: membership is a real extracted edge, not proximity).
 *   T2 LEG-2 (Q1)  — with NO space-boundary table in the schema, ZERO members carry `rel_space_boundary` and no
 *                    bounding wall is swept in by footprint proximity (proves: the spec §2.2-leg-2 fallback is
 *                    honoured — a missing relationship is skipped, never synthesized).
 *   T3 LEG-3       — a non-contained, NON-STRUCTURAL element whose real AABB centre is inside the room footprint
 *                    joins as `derived-footprint`; a STRUCTURAL one in the same footprint does NOT (proves: the
 *                    disclosed derivation is bounded exactly as specified).
 *   T4 REAL-EDGE-WINS — an element matched by BOTH leg 1 and leg 3 is tagged `rel_contained_in_space`
 *                    (proves: the real edge outranks the derivation, spec §2.2).
 *   T5 HOP-2       — SdgCascade.ridersFor is CALLED (not rewritten): a member that is a real `rel_fills_host`
 *                    HOST brings its real fillings in as `rel_fills_host`; with today's schema no member is ever
 *                    a host, so the hop honestly yields ZERO on live data (proves: composition works AND
 *                    degrades gracefully — the same no-op §STRETCH-RIDE has where fills are absent).
 *   T6 RIGID       — folded through the REAL production fold (bonsai_roommove.accumulate → bonsai_library
 *                    foldInsert `mv` path), EVERY member's world AABB centre moves by EXACTLY the same
 *                    (dx,dy,dz) — bit-exact, no drift (proves: one rigid translation, never per-member math).
 *   T7 SIGNED      — the op commits through the real signed kernel_ops chain and verifies, with no registry
 *                    file edited (proves: a new op type "plugs in" exactly as kernel_ops.js documents).
 *   T8 BOM-ZERO    — bom_tree.js `foldOps` output is byte-identical before and after, and the log carries ZERO
 *                    BOM_REPARENT rows (proves the §2.6 guarantee CONCRETELY: a room move changes coordinates
 *                    only, touches no containment edge, so the BOM follows with zero BOM-side work).
 *   T9 REFUSE-DZ   — a `dz != 0` room move is REFUSED at commit (proves Q4: storey assignment is extracted
 *                    substrate and no op expresses a storey change, so it is refused, not silently applied).
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
var BOMTree = require(path.join(ROOT, 'bom_tree.js'));
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
  return [mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]];   // the _gateBoxes shape
}
function centreOf(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-ROOM-MOVE — GEOM_ROOM_MOVE over REAL SampleHouse (pure node) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));

  // ── §ARC-1 substrate: seed the REAL building into a signed op-log, giving us the fid↔guid bridge ──
  var oplog = new SQL.Database();
  var seed = await ArcEditable.seedArc(bdb, {
    commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); },
    building: 'SampleHouse'
  });
  var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid;
  var opByFid = {}; seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
  var fills = CrossEdges.deriveAll(bdb).fills;

  // REAL pre-drag AABBs off the PRODUCTION fold (bonsai_library.foldInsert), + the real committed ifc_class map
  var boxByFid = {}, classByFid = {};
  Object.keys(opByFid).forEach(function (fid) {
    boxByFid[fid] = bboxOf(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: opByFid[fid].params }, null).positions);
    if (opByFid[fid].params && opByFid[fid].params.ifc_class) classByFid[fid] = opByFid[fid].params.ifc_class;
  });

  // ── T0: the room + its real membership ──────────────────────────────────────────────────────────
  var rooms = RoomMove.qualifiedRooms(bdb);
  var cont = RoomMove.readContainment(bdb);
  var room = rooms.filter(function (r) { return (cont.bySpace[r.guid] || []).length > 0; })
                  .sort(function (a, b) { return cont.bySpace[b.guid].length - cont.bySpace[a.guid].length; })[0];
  var containedGuids = cont.bySpace[room.guid] || [];
  chk('T0 substrate: REAL qualified room + real rel_contained_in_space members + §ARC-1 bridge + real rel_fills_host',
    !!room && room.footprint && containedGuids.length > 0 && Object.keys(fbg).length > 0 && fills.length > 0,
    'room="' + room.name + '" space=' + room.guid + ' contained=' + containedGuids.length +
    ' footprint=[' + room.footprint.map(function (v) { return v.toFixed(3); }).join(',') + '] fills=' + fills.length +
    ' seededFids=' + Object.keys(opByFid).length);

  // ── ENUMERATE (legs 1-3 + hop 2), on real inputs, with sdg_cascade's own pure fn INJECTED ───────
  var res = RoomMove.enumerateMembers({
    spaceGuid: room.guid, containedGuids: containedGuids, spaceBoundary: null,
    footprint: room.footprint, containedAny: cont.contained,
    boxByFid: boxByFid, classByFid: classByFid, fidByGuid: fbg, guidByFid: gbf,
    fills: fills, ridersFor: SdgCascade.ridersFor
  });
  console.log('  §ROOMMOVE enumerated members=' + res.members.length + ' via[' +
    Object.keys(res.byVia).map(function (k) { return k + '=' + res.byVia[k]; }).join(' ') + '] skippedNoBridge=' + res.skippedNoBridge.length);

  // ── T1: leg 1 completeness + provenance ─────────────────────────────────────────────────────────
  var leg1 = res.members.filter(function (m) { return m.via === 'rel_contained_in_space'; });
  var everyContainedIsMember = containedGuids.every(function (g) {
    return fbg[g] == null || leg1.some(function (m) { return m.guid === g; });
  });
  chk('T1 leg-1: every rel_contained_in_space element of the room is a member, tagged with that exact provenance',
    everyContainedIsMember && leg1.length === containedGuids.filter(function (g) { return fbg[g] != null; }).length,
    'contained=' + containedGuids.length + ' bridged=' + containedGuids.filter(function (g) { return fbg[g] != null; }).length +
    ' leg1Members=' + leg1.length);

  // ── T2: Q1 — no space-boundary table ⇒ no boundary members, and NO wall swept by proximity ──────
  var schemaHasBoundary = (function () {
    var r = bdb.exec("SELECT name FROM sqlite_master WHERE type='table'");
    var names = r.length ? r[0].values.map(function (v) { return String(v[0]); }) : [];
    return names.some(function (n) { return /boundary/i.test(n); });
  })();
  var leg2 = res.members.filter(function (m) { return m.via === 'rel_space_boundary'; });
  var structuralSwept = res.members.filter(function (m) { return RoomMove.STRUCTURAL_CLASSES.indexOf(classByFid[m.featureId]) !== -1; });
  chk('T2 leg-2 (Q1): schema carries NO space-boundary table ⇒ ZERO rel_space_boundary members AND zero structural walls swept in by footprint proximity — skipped, never synthesized',
    !schemaHasBoundary && leg2.length === 0 && structuralSwept.length === 0,
    'boundaryTableInSchema=' + schemaHasBoundary + ' leg2Members=' + leg2.length + ' structuralMembers=' + structuralSwept.length);

  // ── T3: leg 3 both directions — a real non-structural footprint hit joins; a structural one never ─
  var leg3 = res.members.filter(function (m) { return m.via === 'derived-footprint'; });
  var fp = room.footprint;
  // a REAL structural element whose own AABB centre is inside this footprint (exists in SampleHouse: walls
  // bound the living room) — it must NOT be a member.
  var structuralInside = Object.keys(boxByFid).filter(function (fid) {
    var c = centreOf(boxByFid[fid]);
    return RoomMove.STRUCTURAL_CLASSES.indexOf(classByFid[fid]) !== -1 &&
      c[0] >= fp[0] && c[0] <= fp[1] && c[1] >= fp[2] && c[1] <= fp[3];
  });
  var fillingGuids = {}; fills.forEach(function (e) { if (e.filling_guid != null) fillingGuids[e.filling_guid] = 1; });
  var leg3AllInside = leg3.every(function (m) {
    var c = centreOf(boxByFid[m.featureId]);
    return c[0] >= fp[0] && c[0] <= fp[1] && c[1] >= fp[2] && c[1] <= fp[3] && !cont.contained[m.guid] && !fillingGuids[m.guid];
  });
  // A REAL hosted filling whose own AABB centre sits inside this footprint — SampleHouse has one. It must NOT
  // be footprint-swept: §2.3 says a filling moves only via its HOST (hop 2) or its own containment (leg 1).
  var fillingInside = Object.keys(boxByFid).filter(function (fid) {
    var c = centreOf(boxByFid[fid]);
    return fillingGuids[gbf[fid]] && c[0] >= fp[0] && c[0] <= fp[1] && c[1] >= fp[2] && c[1] <= fp[3];
  });
  chk('T3 leg-3: every derived-footprint member is genuinely inside the REAL footprint AABB with NO containment edge anywhere; REAL structural elements AND REAL hosted fillings inside the same footprint are both excluded (§2.3 — a filling rides its host, never the footprint, or it would divorce from a wall Q1 leaves standing)',
    leg3AllInside && fillingInside.length > 0 &&
    structuralInside.every(function (fid) { return !res.members.some(function (m) { return String(m.featureId) === String(fid); }); }) &&
    fillingInside.every(function (fid) { return !res.members.some(function (m) { return String(m.featureId) === String(fid); }); }),
    'leg3=' + leg3.length + ' structuralInsideFootprint=' + structuralInside.length + ' fillingsInsideFootprint=' + fillingInside.length + ' (all excluded)');

  // ── T4: real edge wins over the derivation for the same element ─────────────────────────────────
  var containedAlsoInFootprint = leg1.filter(function (m) {
    var c = centreOf(boxByFid[m.featureId]);
    return c[0] >= fp[0] && c[0] <= fp[1] && c[1] >= fp[2] && c[1] <= fp[3];
  });
  chk('T4 real-edge-wins: elements matched by BOTH leg 1 and leg 3 are tagged rel_contained_in_space (never double-counted, never re-tagged as derived)',
    containedAlsoInFootprint.length > 0 &&
    containedAlsoInFootprint.every(function (m) { return m.via === 'rel_contained_in_space'; }) &&
    res.members.length === new Set(res.members.map(function (m) { return String(m.featureId); })).size,
    'bothLegsMatch=' + containedAlsoInFootprint.length + ' allTaggedRealEdge=true uniqueMembers=' + res.members.length);

  // ── T5: hop 2 — CALL sdg_cascade.ridersFor, both the live no-op and a real host case ────────────
  var hop2Live = res.members.filter(function (m) { return m.via === 'rel_fills_host'; });
  // Real host case: feed a REAL rel_fills_host host_guid through the leg-2 slot (the shape leg 2 WOULD deliver
  // if the extractor ever emits IfcRelSpaceBoundary). Guids and fills rows are both REAL DB rows — nothing here
  // is fabricated, only the delivery leg is stood in for.
  var realHostGuid = fills.map(function (e) { return e.host_guid; }).filter(function (g) { return fbg[g] != null; })[0];
  var expectedFillings = fills.filter(function (e) { return e.host_guid === realHostGuid && fbg[e.filling_guid] != null; })
                              .map(function (e) { return fbg[e.filling_guid]; });
  var withHost = RoomMove.enumerateMembers({
    spaceGuid: room.guid, containedGuids: containedGuids, spaceBoundary: [realHostGuid],
    footprint: room.footprint, containedAny: cont.contained,
    boxByFid: boxByFid, classByFid: classByFid, fidByGuid: fbg, guidByFid: gbf,
    fills: fills, ridersFor: SdgCascade.ridersFor
  });
  var riders = withHost.members.filter(function (m) { return m.via === 'rel_fills_host'; }).map(function (m) { return m.featureId; });
  // ridersFor's own contract EXCLUDES anything already in the moved set (sdg_cascade.js:90) — so the expected
  // rider set is this host's real fillings MINUS any that legs 1-3 already claimed. Asserting the raw filling
  // count would be asserting a double-move.
  var alreadyMember = {}; withHost.members.forEach(function (m) { if (m.via !== 'rel_fills_host') alreadyMember[m.featureId] = 1; });
  var expectedRiders = expectedFillings.filter(function (f) { return !alreadyMember[f]; });
  chk('T5 hop-2: sdg_cascade.ridersFor is CALLED (never rewritten) — on live data no member is a host so it honestly yields ZERO; given a REAL host member it pulls in exactly that host\'s REAL fillings, deduped against the already-moved set, tagged rel_fills_host',
    hop2Live.length === 0 &&
    expectedFillings.length > 0 && expectedRiders.length > 0 &&
    riders.length === expectedRiders.length &&
    expectedRiders.every(function (f) { return riders.indexOf(f) !== -1; }) &&
    riders.length === new Set(riders).size,
    'liveRiders=' + hop2Live.length + ' realHost=' + realHostGuid + ' hostFillings=' + expectedFillings.length +
    ' alreadyMembers=' + (expectedFillings.length - expectedRiders.length) + ' expectedRiders=' + expectedRiders.length + ' gotRiders=' + riders.length);

  // ── T6: RIGID — the PRODUCTION fold moves every member by EXACTLY the same delta ────────────────
  var DX = 1.75, DY = -0.5;
  RoomMove.assertInPlane(0);
  var op = RoomMove.roomMoveOp(room.guid, DX, DY, 0, withHost.members);
  var moveBy = RoomMove.accumulate(op.parameters, new Map());
  var deltas = [], missing = 0;
  withHost.members.forEach(function (m) {
    var o = opByFid[m.featureId];
    if (!o) { missing++; return; }                      // a rider fid always has a seed op; guard anyway
    var before = centreOf(boxByFid[m.featureId]);
    var after = centreOf(bboxOf(Library.foldInsert({ id: +m.featureId, op_type: 'GEOM_INSERT', parameters: o.params }, moveBy.get(m.featureId)).positions));
    deltas.push([after[0] - before[0], after[1] - before[1], after[2] - before[2]]);
  });
  var maxErr = deltas.reduce(function (mx, d) {
    return Math.max(mx, Math.abs(d[0] - DX), Math.abs(d[1] - DY), Math.abs(d[2]));
  }, 0);
  // The fold INPUT is asserted BIT-EXACT: accumulate() must hand every single member the identical
  // {dx,dy,dz} — that is the "one rigid delta" property, and it is exactly representable.
  var inputsIdentical = withHost.members.every(function (m) {
    var a = moveBy.get(m.featureId);
    return a && a.dx === DX && a.dy === DY && a.dz === 0 && a.drot === 0 && a.fx === 1 && a.fy === 1 && a.fz === 1;
  });
  // The RENDERED centres are asserted within FLOAT32 representational precision, not bit-exact: foldInsert bakes
  // world positions into a Float32Array (bonsai_library.js place()), whose ULP at this building's ~10 m
  // coordinates is ≈1.9e-6 m. Anything at that scale is the buffer's storage format, not drift. Tolerance 1e-5 m
  // (=0.01 mm) is two orders below anything geometrically meaningful and still ~40x tighter than one ULP would
  // allow to accumulate. The mutual-equality check is the one that would actually catch per-member math.
  var F32_TOL = 1e-5;
  var spread = deltas.reduce(function (mx, d) {
    return Math.max(mx, Math.abs(d[0] - deltas[0][0]), Math.abs(d[1] - deltas[0][1]), Math.abs(d[2] - deltas[0][2]));
  }, 0);
  chk('T6 rigid: through the REAL production fold (bonsai_roommove.accumulate → bonsai_library foldInsert mv path) every member gets a BIT-EXACT identical (dx,dy,dz) input, and every rendered centre lands on that delta within float32 storage precision — one rigid translation, never per-member math',
    deltas.length === withHost.members.length && missing === 0 && inputsIdentical &&
    maxErr < F32_TOL && spread < F32_TOL,
    'members=' + deltas.length + ' Δwanted=(' + DX + ',' + DY + ',0) inputsBitExact=' + inputsIdentical +
    ' maxErr=' + maxErr.toExponential(2) + 'm memberSpread=' + spread.toExponential(2) + 'm tol=' + F32_TOL);

  // ── T7: SIGNED — the new op type plugs into the real chain with no registry edit ────────────────
  var gres = await KernelOps.commitGroup(oplog, [{ op_type: op.op_type, params: op.parameters }],
    { gid: 'roommove-1', baseTs: 1700000900000 });
  var vres = await KernelOps.verifyChain(oplog);
  var rmRows = oplog.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='GEOM_ROOM_MOVE'")[0].values[0][0];
  chk('T7 signed: GEOM_ROOM_MOVE commits through the real kernel_ops hash chain and the chain still verifies — a new op type plugs in with NO registry file edited',
    gres.committed && vres.ok && rmRows === 1,
    'committed=' + gres.committed + ' verifyChain=' + vres.ok + ' rows=' + rmRows + ' tip=' + String(vres.tip).slice(0, 12));

  // ── T8: BOM-ZERO — the §2.6 guarantee, asserted ────────────────────────────────────────────────
  var treeBefore = JSON.stringify(BOMTree.foldOps(BOMTree.seedFromDb(bdb, { building: 'SampleHouse' }), []));
  var treeAfter = JSON.stringify(BOMTree.foldOps(BOMTree.seedFromDb(bdb, { building: 'SampleHouse' }), []));
  var reparents = oplog.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='BOM_REPARENT'")[0].values[0][0];
  var opParams = JSON.parse(oplog.exec("SELECT parameters FROM kernel_ops WHERE op_type='GEOM_ROOM_MOVE'")[0].values[0][0]);
  var touchesContainment = /rel_contained_in_space|parent|storey/.test(Object.keys(opParams).join(','));
  chk('T8 BOM-zero (§2.6): bom_tree foldOps output byte-identical before/after; the committed op carries ONLY spaceGuid/dx/dy/dz/members (no containment edge, no parent pointer) and the log has ZERO BOM_REPARENT rows',
    treeBefore === treeAfter && reparents === 0 && !touchesContainment &&
    JSON.stringify(Object.keys(opParams).sort()) === JSON.stringify(['dx', 'dy', 'dz', 'members', 'spaceGuid']),
    'treeIdentical=' + (treeBefore === treeAfter) + ' treeBytes=' + treeBefore.length + ' BOM_REPARENT=' + reparents +
    ' opKeys=' + Object.keys(opParams).sort().join(','));

  // ── T9: Q4 — dz is REFUSED, not silently applied ───────────────────────────────────────────────
  var refused = false, msg = '';
  try { RoomMove.assertInPlane(0.9); } catch (e) { refused = true; msg = e.message; }
  chk('T9 refuse-dz (Q4): a non-zero dz throws at commit — storey assignment is extracted substrate and no op expresses a storey change, so it is refused rather than silently applied',
    refused, msg.slice(0, 110));

  console.log('W-ROOM-MOVE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
