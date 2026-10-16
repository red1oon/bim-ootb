/**
 * BIM OOTB — Door Real-Position Resolver (prompts/Viewer/FindRooms/ROOM_GRAPH_REAL_AABB.md §4 item 3).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * common/room_graph.js's E1/E2/E4/E9 door-matching has always read element_transforms.center_x/y
 * directly — the IFC local-placement ANCHOR, not a door's real volumetric AABB centre. Same convention
 * bim-ootb #1744 measured + fixed for modeller/cross_edges.js's §REAL-AABB. Measured door-position
 * offset (SampleCastle, 2026-09-18, ROOM_GRAPH_REAL_AABB.md §2): median 20mm, max 249mm; real
 * edge-decision impact confirmed on Duplex (§2b) — 8/14 doors changed matched edges, concentrated in
 * the §AMBIGUOUS-RESIDUAL-RESCUE (E9) layer.
 *
 * This module resolves each door's real world AABB centre the SAME way cross_edges.js's PRIVATE
 * `_realAabb`/`_buildRealVerts` do (that file exports neither — its API is deriveAdjacency/faceTouch/
 * deriveDatumsAnchored/deriveSpans/readFillsHost/readAggregates/deriveAll only — so the ~15-line
 * formula is PORTED here, not re-derived; keep the two in sync if cross_edges.js's convention changes):
 * rotate the door's real vertex blob by yaw (rotation_z) about Z, translate by the placement anchor
 * (center_xyz), envelope the result. Yaw-only, same conservative guard as cross_edges.js — a genuinely
 * 3-axis-rotated door is left OUT of the returned map (falls back to the caller's coarse center_x/y,
 * today's unchanged behaviour for that case) rather than risk an under-tested quaternion port.
 *
 * NOTE ON COORDINATES: this operates in the SAME raw DB frame element_transforms/spatial_structure
 * already share (center_xyz + rotation_z, "world = center + R·rawVert" per real_geometry.js's own
 * header) — NOT the Viewer's Y-up Three.js render frame. viewer/scene.js `A.blobToGeometry`'s Y↔Z
 * swap is a rendering-only detail (feeding THREE.BufferGeometry) and does not apply here; room/door
 * positions in this DB frame never need it, which is also why room_graph.js can compare
 * spatial_structure.center_x/y against element_transforms.center_x/y directly today with no swap.
 *
 * ADDITIVE / GRACEFULLY DEGRADING: any failure (RealGeometry module absent, no geoDb, no
 * geometry_hash, unresolvable blob, 3-axis rotation, query error) simply omits that door from the
 * returned map — never a hard failure, never worse than today's coarse-position behaviour.
 *
 * Caller contract: `resolveDoorRealXY(db, geoDb)` — db/geoDb are raw sql.js-style Database objects
 * (`.exec()`), e.g. the Viewer's `A.db`/`A.libDb` or the Modeller's `db`/`gdb` — NOT the
 * `dbQuery(sql, params)` wrapper room_graph.js itself uses. Kept as a SEPARATE module (not folded into
 * room_graph.js) on purpose, so that file stays DB/file I/O-free (dual-mode node+browser, see its own
 * header) — this is the one place in this lane that touches a live DB handle. Returns
 * `{ doorGuid: [x,y] }` for every ARC IfcDoor whose real position resolved; omits everything else.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DoorRealPosition = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Soft dependency, resolved LAZILY at call time (not IIFE-load time) — same load-order-safe pattern
  // cross_edges.js's own `_getRealGeometry()` uses, for the same reason (a module-scope capture here
  // could freeze `undefined` if this file loads before real_geometry.js).
  var _requiredRealGeometry;
  function _getRealGeometry() {
    if (typeof window !== 'undefined' && window.RealGeometry) return window.RealGeometry;
    if (_requiredRealGeometry !== undefined) return _requiredRealGeometry;
    _requiredRealGeometry = (typeof require === 'function')
      ? (function () { try { return require('../modeller/real_geometry.js'); } catch (e) { return null; } })()
      : null;
    return _requiredRealGeometry;
  }

  // Ported from modeller/cross_edges.js's private `_realAabb` (see file header) — same rotate-then-
  // translate-then-envelope formula, reduced to the XY centre (the only thing room_graph.js needs).
  function _realAabbCentreXY(positions, cx, cy, rz) {
    var cs = Math.cos(rz), sn = Math.sin(rz);
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (var i = 0; i < positions.length; i += 3) {
      var x = positions[i], y = positions[i + 1];
      var wx = cs * x - sn * y + cx, wy = sn * x + cs * y + cy;
      if (wx < mnx) mnx = wx; if (wx > mxx) mxx = wx;
      if (wy < mny) mny = wy; if (wy > mxy) mxy = wy;
    }
    return [(mnx + mxx) / 2, (mny + mxy) / 2];
  }

  // Ported from modeller/cross_edges.js's private `_buildRealVerts` (see file header) — guid -> RAW
  // (un-recentred) vertex blob, undoing real_geometry.js's own recenter() split so the world formula
  // above operates on the positions it's documented against.
  function _buildRealVerts(db, geoDb) {
    var RealGeometry = _getRealGeometry();
    if (!RealGeometry || !RealGeometry.buildGeometryIndex) return null;
    var idx;
    try { idx = RealGeometry.buildGeometryIndex(db, geoDb); } catch (e) { return null; }
    if (!idx || !idx.table) return null;
    var out = {};
    Object.keys(idx.byGuid).forEach(function (guid) {
      var hash = idx.byGuid[guid], rc = hash != null ? idx.resolved[hash] : null;
      if (!rc) return;
      var ao = rc.anchorOffset, p = rc.positions, raw = new Float32Array(p.length);
      for (var i = 0; i < p.length; i += 3) { raw[i] = p[i] + ao[0]; raw[i + 1] = p[i + 1] + ao[1]; raw[i + 2] = p[i + 2] + ao[2]; }
      out[guid] = raw;
    });
    return out;
  }

  function resolveDoorRealXY(db, geoDb) {
    var out = {};
    if (!db) return out;
    var realVerts;
    try { realVerts = _buildRealVerts(db, geoDb); } catch (e) { return out; }
    if (!realVerts) return out;
    try {
      var r = db.exec("SELECT m.guid, t.center_x, t.center_y, t.rotation_x, t.rotation_y, t.rotation_z " +
        "FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid " +
        "WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
      if (!r.length) return out;
      r[0].values.forEach(function (v) {
        var guid = v[0], cx = v[1], cy = v[2], rx = v[3], ry = v[4], rz = v[5];
        var raw = realVerts[guid];
        if (!raw) return;                                              // unresolvable → caller keeps coarse
        if (Math.abs(rx || 0) >= 1e-9 || Math.abs(ry || 0) >= 1e-9) return; // §REAL-AABB yaw-only guard
        out[guid] = _realAabbCentreXY(raw, cx, cy, rz || 0);
      });
    } catch (e) { /* graceful — caller falls back to coarse for every guid */ }
    return out;
  }

  return { resolveDoorRealXY: resolveDoorRealXY };
});
