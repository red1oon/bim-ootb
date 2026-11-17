// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_reader.js: reads the open building's sql.js DB into the input every LOD Upgrade pack takes. Read the §LODUP_* log after every run.
// meta {guid:{cls,name,storey,disc,building}}, sched {guid:{name:value}} (element_dxf2bim), world(guid) -> Float64Array (the element's MESH in world space; never the DB rtree, spec §5).
// Read-only. A table the DB lacks gives an empty set, never an invented one.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodReader = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function has(db, t) { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0; }
  function fromDb(db) {
    var meta = {}, sched = {};
    if (has(db, 'elements_meta')) { var r = db.exec('SELECT guid, ifc_class, element_name, storey, discipline, building FROM elements_meta ORDER BY guid'); if (r.length) r[0].values.forEach(function (v) { meta[v[0]] = { cls: v[1], name: v[2] || '', storey: v[3], disc: v[4], building: v[5] }; }); }
    if (has(db, 'element_dxf2bim')) { var s = db.exec('SELECT guid, name, value FROM element_dxf2bim ORDER BY guid, name'); if (s.length) s[0].values.forEach(function (v) { (sched[v[0]] = sched[v[0]] || {})[v[1]] = v[2]; }); }
    var canWorld = has(db, 'element_instances') && has(db, 'component_geometries') && has(db, 'element_transforms'), st = null;
    function world(guid) {
      if (!canWorld) return null;
      if (!st) st = db.prepare('SELECT c.vertices, t.center_x, t.center_y, t.center_z FROM element_instances i JOIN component_geometries c USING(geometry_hash) JOIN element_transforms t USING(guid) WHERE i.guid = ?');
      st.bind([guid]); var out = null;
      if (st.step()) { var row = st.get(), b = row[0], buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), f = new Float32Array(buf); out = new Float64Array(f.length); for (var i = 0; i < f.length; i += 3) { out[i] = f[i] + row[1]; out[i + 1] = f[i + 1] + row[2]; out[i + 2] = f[i + 2] + row[3]; } }
      st.reset(); return out;
    }
    return { meta: meta, sched: sched, world: world, canWorld: canWorld };
  }
  return { fromDb: fromDb, has: has };
});
