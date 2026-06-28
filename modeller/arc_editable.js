// arc_editable.js — §ARC-1 (RESUME_ARC_EDITABLE_SUBSTRATE.md): seed the REAL ARC building as gizmo-EDITABLE,
// guid-carrying signed GEOM_INSERT op-rows. This is the substrate the Phase-2 SDG forward-fold cascade rests on:
// before this, the modeller's editable scene was synthetic-only (user inserts/sketches) — real walls/doors existed
// only as walker DATA + overlay markers, so "drag wall → door rides" had no wall to grab.
//
// NON-INVENT: every element's box is its MEASURED bbox at its MEASURED centre (element_transforms); nothing is
// fabricated. The box lands its WORLD CENTRE exactly on center_xyz (place() ground-seat math, rotation-invariant).
// Each seed op carries output_guid = the real IFC guid → the featureId↔guid bridge (kernel_ops.output_guid,
// persisted + replay-stable) that the cascade slice uses to look up swXEdges neighbours by guid.
//
// Dual-export (window + node) like cross_edges.js, so the value witness (W-ARC-EDITABLE) runs pure-node.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ArcEditable = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TAG = '§ARC';

  // ARC palette by ifc_class — COSMETIC ONLY (colour never touches geometry/position; non-invent geometry holds).
  var PALETTE = {
    IfcWall: 0xb9c4cf, IfcWallStandardCase: 0xb9c4cf, IfcSlab: 0x9aa6b0, IfcRoof: 0x8a94a0,
    IfcDoor: 0xc8a06a, IfcWindow: 0x7fb0c8, IfcCovering: 0xcdd6dd, IfcOpeningElement: 0xff8c42,
    IfcFurniture: 0xa9b8a0, IfcStair: 0x9aa6b0, IfcRailing: 0x9aa6b0, IfcColumn: 0x8f9aa6, IfcBeam: 0x8f9aa6
  };
  function colorFor(cls) { return PALETTE[cls] != null ? PALETTE[cls] : 0xb9c4cf; }

  // discipline='ARC' is the canonical filter (VISION-LOCK: ARC = sole edited substrate). When the discipline
  // column is absent/empty, fall back to an ARC-ish class set (LOGGED at the call site — measure-don't-whitelist
  // caveat: this is a discipline-recovery fallback, not a geometry whitelist).
  var ARC_CLASSES = ['IfcWall', 'IfcWallStandardCase', 'IfcDoor', 'IfcWindow', 'IfcSlab', 'IfcRoof',
    'IfcCovering', 'IfcColumn', 'IfcBeam', 'IfcStair', 'IfcRailing', 'IfcFurniture', 'IfcOpeningElement'];

  function _hasDiscipline(db) {
    try { var r = db.exec("SELECT COUNT(*) FROM elements_meta WHERE discipline='ARC'"); return !!(r.length && r[0].values[0][0] > 0); }
    catch (e) { return false; }
  }

  // buildSeedOps(db) — PURE read of a sql.js *_extracted.db → {ops, skipped, discipline}. Each op is the exact
  // GEOM_INSERT shape foldInsert consumes for a raw-bbox (hash-less) insert.
  function buildSeedOps(db) {
    var hasDisc = _hasDiscipline(db);
    var where = hasDisc ? "m.discipline='ARC'"
      : '(' + ARC_CLASSES.map(function (c) { return "m.ifc_class='" + c + "'"; }).join(' OR ') + ')';
    var sql = "SELECT m.guid, m.ifc_class, t.center_x, t.center_y, t.center_z, " +
      "t.bbox_x, t.bbox_y, t.bbox_z, t.rotation_z FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid = m.guid WHERE " + where + " ORDER BY m.id";
    var r = db.exec(sql), ops = [], skipped = [];
    if (r.length) r[0].values.forEach(function (v) {
      var guid = v[0], cls = v[1], cx = v[2], cy = v[3], cz = v[4], bx = v[5], by = v[6], bz = v[7], rz = v[8] || 0;
      // honest-refuse: never fabricate a box for a NULL/degenerate-bbox element (skipped + logged, excluded from count)
      if (cx == null || cy == null || cz == null || !(bx > 0) || !(by > 0) || !(bz > 0)) {
        skipped.push({ guid: guid, ifc_class: cls, reason: 'no-bbox' }); return;
      }
      var bbox = [-bx / 2, bx / 2, -by / 2, by / 2, -bz / 2, bz / 2];   // MEASURED local box, centred in x/y/z
      // ground-seat: place() seats local zmin (=-bz/2) at placement.z → world centre z = z + bz/2; set z = cz - bz/2
      // so the box world-centre lands EXACTLY on (cx,cy,cz). Yaw about Z is centre-invariant.
      var placement = { x: cx, y: cy, z: cz - bz / 2, rot: rz };
      ops.push({
        op_type: 'GEOM_INSERT',
        params: { bbox: bbox, placement: placement, color: colorFor(cls), provenance: 'recovered:extracted', ifc_class: cls },
        outputGuid: guid
      });
    });
    return { ops: ops, skipped: skipped, discipline: hasDisc ? 'ARC' : 'fallback' };
  }

  // buildBridge(ops, ids) — ops[i] committed as kernel_ops row ids[i] (== its featureId). Build both directions
  // and stash on window for O(1) cascade neighbour lookup (guid → swXEdges → neighbour guid → featureId).
  function buildBridge(ops, ids) {
    var fidByGuid = {}, guidByFid = {};
    for (var i = 0; i < ops.length && i < ids.length; i++) {
      fidByGuid[ops[i].outputGuid] = ids[i];
      guidByFid[ids[i]] = ops[i].outputGuid;
    }
    if (typeof window !== 'undefined') { window.__arcFidByGuid = fidByGuid; window.__arcGuidByFid = guidByFid; }
    return { fidByGuid: fidByGuid, guidByFid: guidByFid };
  }

  // seedArc — orchestrator. INJECTED io:
  //   io.commitGroup(opsArray, gid) -> Promise<{ids, committed, idempotent}>   (the only writer)
  //   io.fold()  -> Promise   (optional: redraw the chain after seeding)
  //   io.building -> string   (deterministic gid 'arcseed-<building>' → idempotent re-seed)
  // commits the WHOLE building as ONE op-group (atomic, one hash-chain, idempotent by gid) then folds once.
  async function seedArc(buildingDb, io) {
    io = io || {};
    var name = io.building || 'building';
    var built = buildSeedOps(buildingDb);
    var gid = 'arcseed-' + name;
    var groupOps = built.ops.map(function (o) { return { op_type: o.op_type, params: o.params, outputGuid: o.outputGuid }; });
    var res = await io.commitGroup(groupOps, gid);
    var ids = (res && res.ids) || [];
    var bridge = buildBridge(built.ops, ids);
    if (io.fold) { try { await io.fold(); } catch (e) { _log(TAG + ' fold after seed failed ' + (e && e.message)); } }
    built.skipped.forEach(function (s) { _log(TAG + ' §ARC-SEED skip guid=' + s.guid + ' class=' + s.ifc_class + ' reason=' + s.reason); });
    _log(TAG + ' §ARC-SEED building=' + name + ' committed=' + ids.length + ' skipped=' + built.skipped.length +
      ' disc=' + built.discipline + ' idempotent=' + !!(res && res.idempotent));
    return { committed: ids.length, skipped: built.skipped.length, ids: ids, bridge: bridge, ops: built.ops };
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return { buildSeedOps: buildSeedOps, buildBridge: buildBridge, seedArc: seedArc, colorFor: colorFor, ARC_CLASSES: ARC_CLASSES, TAG: TAG };
});
