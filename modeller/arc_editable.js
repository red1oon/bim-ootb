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

  // §LOD400-STALL fix (Bug 1 root cause): some elements_meta schemas (e.g. Terminal_meta.db, built by a
  // different extraction path than *_extracted.db) have NO `id` column — guid is the sole PRIMARY KEY. The
  // seed query used to hardcode `ORDER BY m.id`, which THREW for that schema (sql.js "no such column: m.id"),
  // caught by the caller's .catch() → the WHOLE seed silently committed ZERO ops, forever (Terminal never
  // loaded any geometry, not "slowly" — not at all). Detect column presence at runtime (same PRAGMA pattern
  // as any schema probe) and order by `id` when present — UNCHANGED for Duplex/SampleCastle/SampleHouse (their
  // committed op order/ids stay byte-identical, replay-stable) — else fall back to `guid` (also a stable total
  // order; the featureId↔guid bridge below is guid-keyed, not order-dependent, so this fallback is non-invent).
  function _hasIdColumn(db) {
    try {
      var r = db.exec("PRAGMA table_info(elements_meta)");
      if (!r.length) return false;
      return r[0].values.some(function (v) { return v[1] === 'id'; });
    } catch (e) { return false; }
  }

  // ── §LOD-300 CATALOG MIRROR (Bug-2 "illegal LOD200 geometry" — honest PARTIAL fix, user-approved scope). This
  // mirrors ONLY hash+ifc_class+bbox (NOT the mesh v/f blobs — no invention/duplication of geometry data) for the
  // exactly-3 REAL-mesh items in bonsai_library.js's CATALOG (Column/Beam/Door). MUST stay byte-identical to that
  // CATALOG's hash+bbox — if bonsai_library.js's CATALOG ever changes, update this mirror too (a drift here only
  // silently STOPS matching, it can never render a wrong mesh: foldInsert always re-resolves the real mesh from the
  // REAL catalog by hash at fold time; this mirror only decides WHICH hash, if any, to stamp on a seed op).
  // Kept local (not imported) so this module stays a pure DB-reader, dual-exportable to node with no browser deps
  // (fetch/document/atob) — see bonsai_library.js CATALOG for the source of truth.
  var LOD300_CATALOG = [
    { hash: '3e6348624e89b507', ifc_class: 'IfcColumn', bbox: [-0.225, 0.225, -0.4, 0.4, -2.0, 2.0] },
    { hash: '9cbb780e8801984f', ifc_class: 'IfcBeam', bbox: [-2.75, 2.75, -0.15, 0.15, -0.3, 0.3] },
    { hash: 'ed1eee29900658a8', ifc_class: 'IfcDoor', bbox: [-0.89, 0.89, -0.075, 0.075, -1.05, 1.05] }
  ];
  // 5% relative-L1 tolerance on SORTED (w,d,h) dims — data-driven, not invented: measured across
  // Duplex/SampleHouse/SampleCastle_extracted.db (2026-07-01), the ONE genuine structural match (SampleHouse
  // IfcDoor guid 3cUkl32yn9qRSPvBJVyWYp, dims 1.86×0.199×2.11 vs catalog Door 1.78×0.15×2.1) sits at reldist=0.034;
  // every other candidate across all 3 buildings/3 classes is ≥0.074 (SampleCastle IfcBeam) — a clean >2× gap, so
  // 0.05 cleanly separates the one real match from the nearest false positive without hand-tuning to a single case.
  var LOD300_TOL = 0.05;
  function _sorted3(a, b, c) { return [a, b, c].sort(function (x, y) { return x - y; }); }
  // best (lowest-reldist) LOD-300 catalog match for an ifc_class + measured (bx,by,bz), or null if none within tol.
  // Orientation-agnostic (sorted dims): a real element's local w/d/h axes need not align with the catalog's.
  function _matchLod300(cls, bx, by, bz) {
    var dims = _sorted3(bx, by, bz), best = null;
    for (var i = 0; i < LOD300_CATALOG.length; i++) {
      var c = LOD300_CATALOG[i]; if (c.ifc_class !== cls) continue;
      var cb = c.bbox, cd = _sorted3(cb[1] - cb[0], cb[3] - cb[2], cb[5] - cb[4]);
      var dist = Math.abs(dims[0] - cd[0]) + Math.abs(dims[1] - cd[1]) + Math.abs(dims[2] - cd[2]);
      var rel = dist / (cd[0] + cd[1] + cd[2]);
      if (rel <= LOD300_TOL && (!best || rel < best.rel)) best = { hash: c.hash, rel: rel, catBbox: cb };
    }
    return best;
  }

  // buildSeedOps(db) — PURE read of a sql.js *_extracted.db → {ops, skipped, discipline}. Each op is the exact
  // GEOM_INSERT shape foldInsert consumes for a raw-bbox (hash-less) insert.
  function buildSeedOps(db) {
    var hasDisc = _hasDiscipline(db);
    var where = hasDisc ? "m.discipline='ARC'"
      : '(' + ARC_CLASSES.map(function (c) { return "m.ifc_class='" + c + "'"; }).join(' OR ') + ')';
    var hasId = _hasIdColumn(db);
    if (!hasId) _log(TAG + ' §ARC-SEED-SCHEMA elements_meta has no id column — ORDER BY guid fallback (stable, guid-keyed bridge unaffected)');
    var sql = "SELECT m.guid, m.ifc_class, t.center_x, t.center_y, t.center_z, " +
      "t.bbox_x, t.bbox_y, t.bbox_z, t.rotation_z FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid = m.guid WHERE " + where + " ORDER BY " + (hasId ? 'm.id' : 'm.guid');
    var r = db.exec(sql), ops = [], skipped = [], matched = 0, unmatched = 0;
    if (r.length) r[0].values.forEach(function (v) {
      var guid = v[0], cls = v[1], cx = v[2], cy = v[3], cz = v[4], bx = v[5], by = v[6], bz = v[7], rz = v[8] || 0;
      // honest-refuse: never fabricate a box for a NULL/degenerate-bbox element (skipped + logged, excluded from count)
      if (cx == null || cy == null || cz == null || !(bx > 0) || !(by > 0) || !(bz > 0)) {
        skipped.push({ guid: guid, ifc_class: cls, reason: 'no-bbox' }); return;
      }
      var bbox = [-bx / 2, bx / 2, -by / 2, by / 2, -bz / 2, bz / 2];   // MEASURED local box, centred in x/y/z (kept
      // on every op regardless of match — audit trail: what was actually measured, vs what mesh got stamped).
      var seatHalfZ = bz / 2;                                          // §LOD-300: seat half-height defaults to MEASURED
      var m = _matchLod300(cls, bx, by, bz);                           // Bug-2 partial fix: try the 3-item real-mesh catalog
      var params = { bbox: bbox, color: colorFor(cls), provenance: 'recovered:extracted', ifc_class: cls };
      if (m) {
        matched++;
        params.hash = m.hash;
        params.lod = '300';                                            // EXPLICIT: foldInsert's P.lod fallback defaults
        // to '200' (bonsai_library.js lodFor) — a hash alone does NOT upgrade LOD; this must be set for the real mesh
        // to actually render (verified: bonsai_library.js:347 `this.lodFor(op.id, P.lod)`).
        // seat on the MATCHED CATALOG's own half-height (not the measured one) so the swapped-in mesh's WORLD
        // CENTRE still lands exactly on the measured (cx,cy,cz) — "same placement, richer mesh" (doctrine §5):
        // the catalog mesh is symmetric about its local origin in x/y/z (verified against its own baked v-buffer),
        // so only the z seat needs compensating for the catalog/measured height difference; x/y are placement-direct.
        seatHalfZ = (m.catBbox[5] - m.catBbox[4]) / 2;
      } else { unmatched++; }
      // ground-seat: place() seats local zmin (=-seatHalfZ) at placement.z → world centre z = z + seatHalfZ; set
      // z = cz - seatHalfZ so the world-centre lands EXACTLY on (cx,cy,cz). Yaw about Z is centre-invariant.
      // §ARC-ROT-UNIT fix: element_transforms.rotation_z is stored in RADIANS (the Viewer applies it straight
      // into THREE's native-radian Euler — viewer/streaming.js:748 `_euler.set(el.rotX, el.rotZ, -el.rotY)`,
      // no conversion). bonsai_library.js's place() expects DEGREES (`pl.rot * Math.PI/180`) — every OTHER
      // caller (catalog drops, gizmo GEOM_ROTATE deltas) already feeds it degrees. Passing rz straight through
      // silently shrank every rotated ARC wall's yaw by ~57x (e.g. a true -90° wall rotated only -1.57°) —
      // walls meant to form a perpendicular room corner instead rendered nearly parallel/overlapping (the
      // "geometry hell" screenshot). Convert once here so ARC lands on the SAME true angle the Viewer renders.
      params.placement = { x: cx, y: cy, z: cz - seatHalfZ, rot: rz * 180 / Math.PI };
      ops.push({ op_type: 'GEOM_INSERT', params: params, outputGuid: guid });
    });
    return { ops: ops, skipped: skipped, discipline: hasDisc ? 'ARC' : 'fallback', matched: matched, unmatched: unmatched };
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
    // §LOD300-MATCH honesty line (Bug-2 partial fix): matched = real catalog mesh (LOD-300) stamped; unmatched =
    // stays raw-bbox LOD-200 exactly as before — NEVER silently claimed as upgraded. See LOD300_CATALOG/_matchLod300.
    _log(TAG + ' §LOD300-MATCH building=' + name + ' matched=' + built.matched + ' unmatched=' + built.unmatched +
      ' (of ' + built.ops.length + ' seeded; matched ⇒ real catalog mesh LOD-300, unmatched ⇒ raw-bbox LOD-200 unchanged)');
    return { committed: ids.length, skipped: built.skipped.length, ids: ids, bridge: bridge, ops: built.ops,
      matched: built.matched, unmatched: built.unmatched };
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return { buildSeedOps: buildSeedOps, buildBridge: buildBridge, seedArc: seedArc, colorFor: colorFor, ARC_CLASSES: ARC_CLASSES,
    TAG: TAG, LOD300_CATALOG: LOD300_CATALOG, LOD300_TOL: LOD300_TOL, matchLod300: _matchLod300 };
});
