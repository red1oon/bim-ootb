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
  //
  // §ARC-ANCHOR (W-MV-PARITY, 2026-07-02): the blob's local origin is NOT arbitrary — it is the IFC
  // local-placement ANCHOR that element_transforms.center_xyz points at (extractIFCtoDB.py writes
  // center = shape.transformation.matrix[:3,3] and the raw verts UN-rebased: world = center + R·rawVerts;
  // the Viewer has always rendered exactly that). So the (cx,cy,cz) subtracted here is REAL placement
  // information — returned as `anchorOffset` so the fold (bonsai_library.js foldInsert §ARC-ANCHOR) can
  // put it back, rotated with the element: worldVert = center + R·anchorOffset + R·recentredVert.
  // Dropping it (the pre-fix behaviour: seat the AABB centre ON center_xyz) displaced every element whose
  // blob has a non-zero local origin — measured Duplex: 253/265 elements >0.5 m off, max 18.03 m.
  function recenter(positions) {
    var bb = bboxOf(positions);
    var cx = (bb[0] + bb[1]) / 2, cy = (bb[2] + bb[3]) / 2, cz = (bb[4] + bb[5]) / 2;
    var out = new Float32Array(positions.length);
    for (var i = 0; i < positions.length; i += 3) {
      out[i] = positions[i] - cx; out[i + 1] = positions[i + 1] - cy; out[i + 2] = positions[i + 2] - cz;
    }
    return { positions: out, bbox: [bb[0] - cx, bb[1] - cx, bb[2] - cy, bb[3] - cy, bb[4] - cz, bb[5] - cz],
             anchorOffset: [cx, cy, cz] };
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

  // buildGeometryIndex(db, geoDb, templateIndex) — ONE pass over element_instances (in `db`) × the geometry
  // table (in `geoDb`, DEFAULTS to `db` — the original single-file behaviour, byte-identical) -> {
  //   table,                              the table name used ('component_geometries'|'base_geometries'|null)
  //   byGuid:     { guid: geometry_hash|null },     every element_instances row (null hash = no instance link)
  //   resolved:   { geometry_hash: {positions,faces,bbox,anchorOffset,source_status} }   DECODED + RECENTRED
  //               once per DISTINCT hash — source_status is 'MEASURED' for every hash resolved from this
  //               tier (real, untouched extracted geometry).
  // }. Many guids instance the SAME hash (component reuse) — decoding once per hash (not per guid) avoids
  // redundant base64/typed-array work on a 3000+-element building sharing ~2300 distinct meshes.
  //
  // §GEO-SPLIT (2026-07-02, Terminal resident): Terminal_meta.db (element_instances/elements_meta, the WALK
  // substrate) and Terminal_geo.db (component_geometries, the 250MB mesh substrate) are SEPARATE sqlite files
  // — sql.js can't JOIN across two independently-opened Database handles, so this two-pass form replaces the
  // original single JOIN: (1) read guid→hash + the set of DISTINCT needed hashes from `db` alone, (2) resolve
  // only those hashes against `geoDb` (batched IN-lists — Terminal needs ~1,027 distinct hashes out of 9,394).
  // When geoDb === db (every OTHER resident — SampleHouse/Duplex/SampleCastle/SampleCastle-ARC, all single-
  // file), this produces the EXACT same byGuid/resolved sets as the old one-shot JOIN — same skip rules
  // (null hash / missing blob / degenerate vert-or-face count all stay unresolved, same as before).
  //
  // §MESHFIT (SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §1/§3c, bim-compiler): templateIndex is an OPTIONAL third
  // argument — when omitted (every current call site: arc_editable.js, cross_edges.js), behaviour is
  // BYTE-IDENTICAL to before this change, zero new code paths run. When supplied, it is an object exposing
  // `resolveGrafted(hash) -> {positions,faces,bbox,anchorOffset,source_status:'GRAFTED',source_template_hash,
  // source_building} | null` (see modeller/mesh_graft.js's graftFit + a mesh_templates.db-backed adapter) —
  // any hash that did NOT resolve as MEASURED above gets ONE more chance to resolve as an honestly-labeled
  // GRAFTED result before the caller's existing hardfail/box-fallback path runs. A grafted entry is NEVER
  // written into `out.resolved` ahead of / instead of a real MEASURED one — this tier only fires for hashes
  // still unresolved after the real pass above.
  function buildGeometryIndex(db, geoDb, templateIndex) {
    geoDb = geoDb || db;
    var table = geometryTable(geoDb);
    var out = { table: table, byGuid: {}, resolved: {} };
    if (!table || !_hasTable(db, 'element_instances')) return out;
    var r;
    try {
      r = db.exec("SELECT guid, geometry_hash FROM element_instances");
    } catch (e) { _log(TAG + ' index query failed ' + (e && e.message)); return out; }
    if (!r.length) return out;
    var neededHashes = {}, anyNeeded = false;
    r[0].values.forEach(function (v) {
      var guid = v[0], hash = v[1];
      out.byGuid[guid] = hash;
      if (hash != null) { neededHashes[hash] = true; anyNeeded = true; }
    });
    if (!anyNeeded) return out;
    var hashList = Object.keys(neededHashes);
    var BATCH = 500;   // stay well under sqlite's expression-count limits on a huge building
    for (var i = 0; i < hashList.length; i += BATCH) {
      var batch = hashList.slice(i, i + BATCH);
      var placeholders = batch.map(function (h) { return "'" + String(h).replace(/'/g, "''") + "'"; }).join(',');
      var gr;
      try {
        gr = geoDb.exec("SELECT geometry_hash, vertices, faces FROM " + table + " WHERE geometry_hash IN (" + placeholders + ")");
      } catch (e) { _log(TAG + ' geo batch query failed ' + (e && e.message)); continue; }
      if (!gr.length) continue;
      gr[0].values.forEach(function (v) {
        var hash = v[0], vBlob = v[1], fBlob = v[2];
        if (out.resolved[hash]) return;                            // already decoded this hash
        if (!vBlob || !fBlob) return;                              // hash present but blob missing → stays unresolved
        try {
          var raw = toFloat32(vBlob), faces = toUint32(fBlob);
          if (raw.length < 9 || faces.length < 3) return;          // degenerate (<3 verts / <1 tri) → unresolved
          var rc = recenter(raw);
          out.resolved[hash] = { positions: rc.positions, faces: faces, bbox: rc.bbox, anchorOffset: rc.anchorOffset, source_status: 'MEASURED' };
        } catch (e) { /* leave unresolved — caller's hardfail path logs+skips */ }
      });
    }
    // §MESHFIT third tier — only for hashes the real pass above left unresolved, only when the caller opted
    // in by supplying templateIndex (see comment above; absent by default at every existing call site).
    if (templateIndex && typeof templateIndex.resolveGrafted === 'function') {
      hashList.forEach(function (hash) {
        if (out.resolved[hash]) return; // already MEASURED — a graft never overrides real geometry
        var g;
        try { g = templateIndex.resolveGrafted(hash); } catch (e) { g = null; }
        if (g) out.resolved[hash] = g;
      });
    }
    return out;
  }

  function _log(m) { if (typeof console !== 'undefined') console.log(m); }

  return { geometryTable: geometryTable, buildGeometryIndex: buildGeometryIndex, recenter: recenter, bboxOf: bboxOf, TAG: TAG };
});
