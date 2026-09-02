#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ITEM-DRAG-GATE: the refuse-don't-fabricate gate on free item drag (PURE NODE, REAL SampleHouse).
 * Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §3 — Witness: W-ITEM-DRAG-GATE.
 * Read the log after every run. Exit code alone is not evidence.
 *
 * Issue under test: pascalorg's placement contract is snap-and-adjust — `{valid, conflictIds, adjustedY}`, i.e.
 * an invalid drop is silently corrected into a valid one (COMPETITIVE_PASCALORG_HARVEST.md §1). This codebase
 * deliberately does NOT soften to match it (spec §1 item 5, §4 non-goal): real_placement_resolver.js's header
 * states that catch-and-substitute is "the exact violation this gate exists to make structurally hard to
 * reintroduce". These tests exist to prove the drag actually REFUSES rather than fabricating:
 *
 *   G0 SUBSTRATE  — real seeded SampleHouse geometry + real committed ifc_class map (proves: not synthetic).
 *   G1 SESSION-REFUSE-NOHINT — with NO productHint (the state of EVERY element in the log today, Q5) the session
 *                   throws WalkerGapError and the op-log gains ZERO GEOM_MOVE rows (proves: the drag refuses to
 *                   START; disproves any silent AABB/constant substitution).
 *   G2 SESSION-REFUSE-BADHINT — an unmatched productHint likewise throws WALKER_GAP and commits nothing
 *                   (proves: the refusal is the resolver's, on real ad_product_dim lookup, not a local guard).
 *   G3 SESSION-MATCH — a matched hint yields the REAL sourced dims/anchor from ad_product_dim, byte-equal to the
 *                   resolver's own row, with a citable `source` (proves: what the drag holds is extracted).
 *   G4 COMMIT-REFUSE-COLLISION — a drop whose REAL resolved box overlaps another element returns valid:false with
 *                   the offending fids AND yields NO op; the log length is unchanged (proves: refuse at COMMIT).
 *   G5 NO-AUTO-RELOCATE — that same refused drop returns NO snappedPos and NO corrected position (proves: we
 *                   never convert an invalid drop into a valid one, unlike pascalorg's adjustedY).
 *   G6 COMMIT-REFUSE-NOHOST — a WALL-anchored item dropped where no real wall exists is refused (proves: the
 *                   host constraint is resolved against REAL geometry, never assumed).
 *   G7 VALID-DROP — a drop on a REAL wall face is valid, returns a snappedPos DERIVED from that real face, and
 *                   produces exactly ONE existing-shape GEOM_MOVE op — no new op type (proves: the happy path
 *                   still works, so G4/G6 are refusals of bad drops, not of everything).
 *   G8 ELIGIBILITY — a real rel_fills_host HOST and a structural element both refuse the drag outright before the
 *                   gate is even consulted (proves §3.1: hosts move via gridmove/GEOM_ROOM_MOVE, not this tool).
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
var RPR = require(path.join(ROOT, 'real_placement_resolver.js'));
var ItemDrag = require(path.join(ROOT, 'bonsai_itemdrag.js'));
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
  console.log('═══ W-ITEM-DRAG-GATE — refuse, don\'t fabricate (node, REAL SampleHouse) ═══');
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
  function moveRows() { return oplog.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='GEOM_MOVE'")[0].values[0][0]; }

  // The dragged item: a REAL non-structural, non-host, non-filling seeded element (SampleHouse furniture).
  var hostGuids = {}, fillGuids = {};
  fills.forEach(function (e) { if (e.host_guid) hostGuids[e.host_guid] = 1; if (e.filling_guid) fillGuids[e.filling_guid] = 1; });
  var draggable = Object.keys(boxByFid).filter(function (fid) {
    var cls = classByFid[fid], g = gbf[fid];
    return cls != null && ItemDrag.STRUCTURAL_CLASSES.indexOf(cls) === -1 && !hostGuids[g] && !fillGuids[g];
  });
  // Prefer a genuine loose FIXTURE (IfcFurniture) — the class this tool actually targets (spec §3.1) — over
  // whatever merely happens to pass the filter first (SampleHouse's fid 4 is an IfcOpeningElement).
  var itemFid = draggable.filter(function (fid) { return classByFid[fid] === 'IfcFurniture'; })[0] || draggable[0];
  var wallFid = Object.keys(boxByFid).filter(function (fid) {
    return classByFid[fid] === 'IfcWall' || classByFid[fid] === 'IfcWallStandardCase';
  })[0];
  var hostFid = fbg[Object.keys(hostGuids)[0]];
  var baseCtx = {
    fid: itemFid, insertParams: opByFid[itemFid].params, boxByFid: boxByFid,
    classByFid: classByFid, guidByFid: gbf, fills: fills, resolver: RPR
  };
  chk('G0 substrate: REAL seeded SampleHouse geometry + real committed ifc_class map + real rel_fills_host; a real draggable item, a real wall and a real host picked',
    itemFid != null && wallFid != null && hostFid != null && Object.keys(boxByFid).length > 0 && fills.length > 0,
    'item=' + itemFid + '(' + classByFid[itemFid] + ') wall=' + wallFid + '(' + classByFid[wallFid] + ') host=' + hostFid + ' fids=' + Object.keys(boxByFid).length + ' fills=' + fills.length);

  // ── G1: NO productHint (every log-sourced element today, Q5) ⇒ WalkerGapError, ZERO move rows ───
  var before = moveRows(), threw1 = null;
  try { ItemDrag.beginItemDragSession(baseCtx); } catch (e) { threw1 = e; }
  chk('G1 session-refuse (no hint, Q5): with no productHint the session THROWS WalkerGapError(WALKER_GAP) and the op-log gains ZERO GEOM_MOVE rows — the drag never starts, nothing is substituted',
    threw1 && threw1.name === 'WalkerGapError' && threw1.code === 'WALKER_GAP' && moveRows() === before,
    'threw=' + (threw1 && threw1.name) + ' code=' + (threw1 && threw1.code) + ' moveRows ' + before + '→' + moveRows());

  // ── G2: an unmatched hint ⇒ the SAME refusal, from the resolver's own real lookup ───────────────
  var threw2 = null;
  try { ItemDrag.beginItemDragSession(Object.assign({}, baseCtx, { productHint: 'AIRCON_POINT' })); } catch (e) { threw2 = e; }
  chk('G2 session-refuse (unmatched hint): a productHint with no real ad_product_dim row throws WALKER_GAP carrying the full search context; still ZERO GEOM_MOVE rows',
    threw2 && threw2.code === 'WALKER_GAP' && threw2.gap && threw2.gap.productHint === 'AIRCON_POINT' && moveRows() === before,
    'gap.searched=' + JSON.stringify(threw2 && threw2.gap && threw2.gap.searched) + ' moveRows=' + moveRows());

  // ── G3: a matched hint ⇒ REAL sourced dims, byte-equal to the resolver's own extracted row ──────
  var s = ItemDrag.beginItemDragSession(Object.assign({}, baseCtx, { productHint: 'SINK' }));
  var row = RPR.REAL_PRODUCT_DIM[RPR.PRODUCT_ALIAS.SINK];
  chk('G3 session-match: a matched hint yields the REAL ad_product_dim dims + anchor, byte-equal to the extracted row, with a citable source — nothing defaulted',
    s && s.real.width === row.width && s.real.depth === row.depth && s.real.height === row.height &&
    s.real.anchor.requires_host === row.requires_host && s.real.matchedProductId === 'FIXTURE_SINK' &&
    /component_library\.db:ad_product_dim:FIXTURE_SINK$/.test(s.real.source),
    'dims=' + s.real.width + ',' + s.real.depth + ',' + s.real.height + ' host=' + s.real.anchor.requires_host + ' source=' + s.real.source);

  // ── G4/G5: a colliding drop ⇒ refused at COMMIT, no op, no corrected position ───────────────────
  // Aim the item's REAL box straight at another real element's centre — a genuine AABB overlap.
  var victimFid = Object.keys(boxByFid).filter(function (f) { return String(f) !== String(itemFid) && classByFid[f] === 'IfcFurniture'; })[0];
  var vc = centreOf(boxByFid[victimFid]);
  var bad = ItemDrag.resolveDrop(s, vc[0], vc[1], vc[2]);
  var beforeG4 = moveRows();
  chk('G4 commit-refuse (collision): the item\'s REAL resolved box overlapping a real element returns valid:false WITH the offending fids, produces NO op, and leaves the log length unchanged',
    !bad.committed && bad.op === null && bad.verdict.valid === false &&
    bad.verdict.conflictIds.length > 0 && bad.verdict.conflictIds.indexOf(String(victimFid)) !== -1 &&
    moveRows() === beforeG4,
    'victim=' + victimFid + ' reason=' + bad.verdict.reason + ' conflicts=[' + bad.verdict.conflictIds.join(',') + '] moveRows=' + moveRows());
  chk('G5 no-auto-relocate: the refused drop carries NO snappedPos and NO corrected position — an invalid drop stays invalid, never nudged into validity (deliberately stricter than pascalorg\'s adjustedY)',
    bad.verdict.snappedPos === undefined && !('adjustedY' in bad.verdict) && bad.op === null,
    'verdictKeys=' + Object.keys(bad.verdict).join(','));

  // ── G6: WALL-anchored item dropped where no real wall exists ⇒ refused ─────────────────────────
  var far = ItemDrag.resolveDrop(s, 500, 500, 1.2);
  chk('G6 commit-refuse (no host): a WALL-anchored item dropped where NO real wall exists is refused — the host constraint is resolved against real geometry, never assumed',
    !far.committed && far.verdict.valid === false && far.verdict.reason === 'no-host:WALL' && far.op === null,
    'reason=' + far.verdict.reason + ' conflicts=' + far.verdict.conflictIds.length);

  // ── G7: a real wall face ⇒ valid, snapped from that real face, ONE existing-shape GEOM_MOVE ────
  // Scan along the real wall's long axis for a position whose REAL box clears every other element. This is a
  // SEARCH over real geometry for a legitimately free spot — not a nudge of a refused drop (see G5).
  var wb = boxByFid[wallFid], good = null, tried = 0;
  var longAxis = (wb[1] - wb[0]) >= (wb[3] - wb[2]) ? 0 : 1;
  for (var t = 0.05; t <= 0.95 && !good; t += 0.02) {
    tried++;
    var px = longAxis === 0 ? wb[0] + t * (wb[1] - wb[0]) : (wb[0] + wb[1]) / 2;
    var py = longAxis === 1 ? wb[2] + t * (wb[3] - wb[2]) : (wb[2] + wb[3]) / 2;
    var pz = (wb[4] + wb[5]) / 2;
    var v = ItemDrag.canDropAt(s, px, py, pz);
    if (v.valid) good = { p: [px, py, pz], v: v };
  }
  var okDrop = good ? ItemDrag.resolveDrop(s, good.p[0], good.p[1], good.p[2]) : null;
  chk('G7 valid-drop: a drop resolving a REAL wall host is valid, returns a snappedPos derived from that real wall face, and yields exactly ONE existing-shape GEOM_MOVE {parent,dx,dy,dz} — no new op type',
    !!good && good.v.hostFid === String(wallFid) && Array.isArray(good.v.snappedPos) &&
    okDrop.committed && okDrop.op.op_type === 'GEOM_MOVE' &&
    JSON.stringify(Object.keys(okDrop.op.parameters).sort()) === JSON.stringify(['dx', 'dy', 'dz', 'parent']) &&
    String(okDrop.op.parameters.parent) === String(itemFid),
    good ? ('host=' + good.v.hostFid + ' snapped=[' + good.v.snappedPos.map(function (n) { return n.toFixed(3); }).join(',') + '] op=' + okDrop.op.op_type +
      ' params=' + Object.keys(okDrop.op.parameters).sort().join(',') + ' after ' + tried + ' probes') : ('no free wall position found after ' + tried + ' probes'));

  // ── G8: eligibility — a real HOST and a structural element refuse before the gate is consulted ─
  var hostRefused = ItemDrag.beginItemDragSession(Object.assign({}, baseCtx, { fid: hostFid, insertParams: opByFid[hostFid].params, productHint: 'SINK' }));
  var structRefused = ItemDrag.beginItemDragSession(Object.assign({}, baseCtx, { fid: wallFid, insertParams: opByFid[wallFid].params, productHint: 'SINK' }));
  // Every REAL rel_fills_host host in this building is also a wall, so the structural rule fires FIRST and would
  // mask the host rule. Isolate the host branch by neutralising the class rule (structuralClasses: []) — the guid
  // and the fills rows stay real; only the other rule is stood down so this test proves what it claims.
  var hostOnly = ItemDrag.eligibility({ fid: hostFid, classByFid: classByFid, guidByFid: gbf, fills: fills, structuralClasses: [] });
  var itemOnly = ItemDrag.eligibility({ fid: itemFid, classByFid: classByFid, guidByFid: gbf, fills: fills, structuralClasses: [] });
  chk('G8 eligibility (§3.1): a real rel_fills_host HOST and a structural element BOTH refuse the drag outright (return null) even with a matching productHint; with the class rule stood down the HOST rule alone still refuses that same real host (and only it) — hosts move via gridmove or GEOM_ROOM_MOVE, not this tool',
    hostRefused === null && structRefused === null && moveRows() === before &&
    hostOnly.ok === false && /is-a-host/.test(hostOnly.reason) && itemOnly.ok === true,
    'hostFid=' + hostFid + '→null structuralFid=' + wallFid + '→null hostRuleAlone="' + hostOnly.reason + '" itemRuleAlone.ok=' + itemOnly.ok + ' moveRows=' + moveRows());

  console.log('W-ITEM-DRAG-GATE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
