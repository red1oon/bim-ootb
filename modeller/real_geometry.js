// real_geometry.js — read the BUILDING'S OWN per-element mesh (component_geometries / base_geometries,
// keyed by element_instances.geometry_hash) out of a *_extracted.db, so the Modeller can render the REAL
// scanned geometry instead of a raw-bbox proxy box. Companion to viewer/scene.js `A.blobToGeometry` — but
// NOT a copy of it: the Modeller's own coordinate convention (arc_editable.js/bonsai_library.js) is Z-up
// DIRECT (no Y/Z axis swap — verified 2026-07-02: a real element's own vertex-blob extent matches its
// element_transforms bbox_x/y/z axis-for-axis, unlike the Viewer's Y-up convention which needs the swap).
//
// PURE READ, dual-export (node + browser) like arc_editable.js/cross_edges.js — no THREE/DOM dependency,
// so the value witness can run headless in node exactly like W-ARC-EDITABLE.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RealGeometry = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var TAG = '§REALGEOM';

  // sql.js BLOB columns come back as a Uint8Array view — reinterpret the SAME backing buffer (byteOffset-
  // aware: a BLOB'S view can be non-zero-offset into a shared page buffer) as the typed array it encodes.
  function toFloat32(blob) { return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }
  function toUint32(blob) { return new Uint32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }

  // bbox of a flat x,y,z position array -> [xmin,xmax,ymin,ymax,zmin,zmax] (same layout used everywhere
  // else in the modeller: bonsai_library.js boxArrays/bboxOf, arc_editable.js's synthetic raw-bbox).
  function bboxOf(p) {
    var a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, e = Infinity, f = -Infinity;
    for (var i = 0; i < p.length; i += 3) {
      var x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; if (z < e) e = z; if (z > f) f = z;
    }
    return [a, b, c, d, e, f];
  }

  // Re-centre RAW local positions about their own bbox CENTRE (all 3 axes) — every OTHER local mesh in
  // this codebase (bonsai_library.js's 3-item CATALOG, arc_editable.js's synthetic raw-bbox insert) is
  // stored/built symmetric-about-origin, because place()'s (bonsai_library.js) rotate-about-(0,0)-then-
  // translate-by-(placement.x,y) math implicitly assumes local (0,0) == the shape's own geometric centre.
  // A real IFC-extracted mesh's own local origin is an arbitrary placement point (often NOT its bbox
  // centre) — re-centring here (a pure rigid translation of the SAME vertices, no shape change, NON-INVENT)
  // makes it drop into that same convention with zero changes to place()/foldInsert's math.
  function recenter(positions) {
    var bb = bboxOf(positions);
    var cx = (bb[0] + bb[1]) / 2, cy = (bb[2] + bb[3]) / 2, cz = (bb[4] + bb[5]) / 2;
    var out = new Float32Array(positions.length);
    for (var i = 0; i < positions.length; i += 3) {
      out[i] = positions[i] - cx; out[i + 1] = positions[i + 1] - cy; out[i + 2] = positions[i + 2] - cz;
    }
    return { positions: out, bbox: [bb[0] - cx, bb[1] - cx, bb[2] - cy, bb[3] - cy, bb[4] - cz, bb[5] - cz] };
  }

  function _hasTable(db, name) {
    try { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + name + "'").length > 0; }
    catch (e) { return false; }
  }
  // which geometry table this db carries — deployed dbs vary: `component_geometries` (ARC-BOM residents,
  // e.g. SampleCastle_ARC_extracted.db) or `base_geometries` (the *_extracted.db family). Neither present ⇒
  // null (caller degrades to no-real-geometry, exactly today's raw-bbox-only behaviour, unchanged).
  function geometryTable(db) {
    if (_hasTable(db, 'component_geometries')) return 'component_geometries';
    if (_hasTable(db, 'base_geometries')) return 'base_geometries';
    return null;
  }

  // buildGeometryIndex(db) — ONE pass over element_instances × the geometry table -> {
  //   table,                              the table name used ('component_geometries'|'base_geometries'|null)
  //   byGuid:     { guid: geometry_hash|null },     every element_instances row (null hash = no instance link)
  //   resolved:   { geometry_hash: {positions,faces,bbox} }   DECODED + RECENTRED once per DISTINCT hash
  // }. Many guids instance the SAME hash (component reuse) — decoding once per hash (not per guid) avoids
  // redundant base64/typed-array work on a 3000+-element building sharing ~2300 distinct meshes.
  function buildGeometryIndex(db) {
    var table = geometryTable(db);
    var out = { table: table, byGuid: {}, resolved: {} };
    if (!table || !_hasTable(db, 'element_instances')) return out;
    var r;
    try {
      r = db.exec("SELECT ei.guid, ei.geometry_hash, g.vertices, g.faces FROM element_instances ei " +
        "LEFT JOIN " + table + " g ON g.geometry_hash = ei.geometry_hash");
    } catch (e) { _log(TAG + ' index query failed ' + (e && e.message)); return out; }
    if (!r.length) return out;
    r[0].values.forEach(function (v) {
      var guid = v[0], hash = v[1], vBlob = v[2], fBlob = v[3];
      out.byGuid[guid] = hash;
      if (hash == null || out.resolved[hash]) return;           // no link, or already decoded this hash
      if (!vBlob || !fBlob) return;                              // hash present but blob missing → stays unresolved
      try {
        var raw = toFloat32(vBlob), faces = toUint32(fBlob);
        if (raw.length < 9 || faces.length < 3) return;          // degenerate (<3 verts / <1 tri) → unresolved
        var rc = recenter(raw);
        out.resolved[hash] = { positions: rc.positions, faces: faces, bbox: rc.bbox };
      } catch (e) { /* leave unresolved — caller's hardfail path logs+skips */ }
    });
    return out;
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return { geometryTable: geometryTable, buildGeometryIndex: buildGeometryIndex, recenter: recenter, bboxOf: bboxOf, TAG: TAG };
});
