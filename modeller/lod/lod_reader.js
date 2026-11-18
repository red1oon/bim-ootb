// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_reader.js: reads the open building's sql.js DB into the input every LOD Upgrade pack takes. Read the §LODUP_* log after every run.
// meta {guid:{cls,name,storey,disc,building}}, sched {guid:{name:value}} (element_dxf2bim), world(guid) -> Float64Array (the element's MESH in world space, rotation applied; never the DB rtree, spec §5), from component_geometries or base_geometries.
// Read-only. A table the DB lacks gives an empty set, never an invented one.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodReader = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function has(db, t) { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0; }
  // The layer split's inputs (P3, prompts/MODELLER_LOD_UPGRADE_PILL.md "P3 SPEC"): the tables the extractor writes, read as they are. null when the DB lacks them (the pack then applies to 0).
  // hosts() multi-layer elements with a stored mesh; layerRows(set) material_layers; mesh(hash) the host's LOCAL mesh (component_geometries, else base_geometries);
  // index(hash) component_geometry_layers rows (the extractor already sliced this hash) or []; transform(guid) centre + Euler (radians) as the extractor stored them.
  function layerApi(db) {
    if (!has(db, 'rel_material_layer_set') || !has(db, 'material_layers') || !has(db, 'element_instances') || !has(db, 'element_transforms')) return null;
    var tbl = geomTable(db); if (!tbl) return null;
    var hasIdx = has(db, 'component_geometry_layers'), hostsC = null, setC = {}, meshC = {}, idxC = {};
    function f32(b) { return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
    function i32(b) { return new Int32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
    return {
      table: tbl,
      hosts: function () {
        if (hostsC) return hostsC; hostsC = []; var seen = {};
        var r = db.exec('SELECT r.element_guid, i.geometry_hash, r.layer_set_name, r.layer_count, r.total_thickness_m, r.layer_set_direction, r.direction_sense, r.offset_from_reference_line FROM rel_material_layer_set r JOIN element_instances i ON i.guid = r.element_guid WHERE r.layer_count > 1 ORDER BY r.element_guid');
        if (r.length) r[0].values.forEach(function (v) { if (seen[v[0]]) return; seen[v[0]] = 1; hostsC.push({ guid: v[0], hash: v[1], set: v[2], count: v[3], total: v[4], dir: v[5], sense: v[6], off: v[7] }); });
        return hostsC;
      },
      layerRows: function (set) {
        if (setC[set]) return setC[set]; var st = db.prepare('SELECT sequence, material_name, thickness_m FROM material_layers WHERE layer_set_name = ? ORDER BY sequence'), out = [];
        st.bind([set]); while (st.step()) { var v = st.get(); out.push({ seq: v[0], mat: v[1], th: v[2] }); } st.free(); return (setC[set] = out);
      },
      mesh: function (hash) {
        if (hash in meshC) return meshC[hash]; var st = db.prepare('SELECT vertices, faces FROM ' + tbl + ' WHERE geometry_hash = ?'), out = null;
        st.bind([hash]); if (st.step()) { var v = st.get(); if (v[0] && v[1]) out = { v: Float64Array.from(f32(v[0])), f: i32(v[1]) }; } st.free(); return (meshC[hash] = out);
      },
      index: function (hash) {
        if (!hasIdx) return []; if (idxC[hash]) return idxC[hash]; var st = db.prepare('SELECT layer_seq, material_name, thickness_m, face_start, face_count FROM component_geometry_layers WHERE geometry_hash = ? ORDER BY layer_seq'), out = [];
        st.bind([hash]); while (st.step()) { var v = st.get(); out.push({ seq: v[0], mat: v[1], th: v[2], fs: v[3], fc: v[4] }); } st.free(); return (idxC[hash] = out);
      },
      transform: function (guid) {
        var st = db.prepare('SELECT center_x, center_y, center_z, rotation_x, rotation_y, rotation_z FROM element_transforms WHERE guid = ?'), out = null;
        st.bind([guid]); if (st.step()) { var v = st.get(); out = { c: [v[0], v[1], v[2]], r: [v[3] || 0, v[4] || 0, v[5] || 0] }; } st.free(); return out;
      }
    };
  }
  // ONE reader, both schemas: component_geometries (library / split DBs) else base_geometries (extractor DBs, blobs inline)
  function geomTable(db) { return has(db, 'component_geometries') ? 'component_geometries' : has(db, 'base_geometries') ? 'base_geometries' : null; }
  function fromDb(db) {
    var meta = {}, sched = {};
    if (has(db, 'elements_meta')) { var r = db.exec('SELECT guid, ifc_class, element_name, storey, discipline, building FROM elements_meta ORDER BY guid'); if (r.length) r[0].values.forEach(function (v) { meta[v[0]] = { cls: v[1], name: v[2] || '', storey: v[3], disc: v[4], building: v[5] }; }); }
    if (has(db, 'element_dxf2bim')) { var s = db.exec('SELECT guid, name, value FROM element_dxf2bim ORDER BY guid, name'); if (s.length) s[0].values.forEach(function (v) { (sched[v[0]] = sched[v[0]] || {})[v[1]] = v[2]; }); }
    var gtbl = geomTable(db), canWorld = has(db, 'element_instances') && !!gtbl && has(db, 'element_transforms'), st = null;
    function world(guid) {   // the element's mesh in the extractor frame: world = R(rx,ry,rz) v + centre (R as the extractor decomposed it; the identity when the angles are 0)
      if (!canWorld) return null;
      if (!st) st = db.prepare('SELECT c.vertices, t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z FROM element_instances i JOIN ' + gtbl + ' c USING(geometry_hash) JOIN element_transforms t USING(guid) WHERE i.guid = ?');
      st.bind([guid]); var out = null;
      if (st.step()) {
        var row = st.get(), b = row[0], buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), f = new Float32Array(buf), rx = row[4] || 0, ry = row[5] || 0, rz = row[6] || 0; out = new Float64Array(f.length);
        if (!rx && !ry && !rz) { for (var i = 0; i < f.length; i += 3) { out[i] = f[i] + row[1]; out[i + 1] = f[i + 1] + row[2]; out[i + 2] = f[i + 2] + row[3]; } }
        else {
          var ca = Math.cos(rx), sa = Math.sin(rx), cb = Math.cos(ry), sb = Math.sin(ry), cc = Math.cos(rz), sc = Math.sin(rz), m00 = cb * cc, m01 = sa * sb * cc - ca * sc, m02 = ca * sb * cc + sa * sc, m10 = cb * sc, m11 = sa * sb * sc + ca * cc, m12 = ca * sb * sc - sa * cc, m20 = -sb, m21 = sa * cb, m22 = ca * cb;
          for (var j = 0; j < f.length; j += 3) { var x = f[j], y = f[j + 1], z = f[j + 2]; out[j] = m00 * x + m01 * y + m02 * z + row[1]; out[j + 1] = m10 * x + m11 * y + m12 * z + row[2]; out[j + 2] = m20 * x + m21 * y + m22 * z + row[3]; }
        }
      }
      st.reset(); return out;
    }
    // meta.rgba (host colour), read apart so a DB without the column still opens
    if (has(db, 'elements_meta')) { try { var rc = db.exec('SELECT guid, material_rgba FROM elements_meta'); if (rc.length) rc[0].values.forEach(function (v) { if (meta[v[0]]) meta[v[0]].rgba = v[1]; }); } catch (e) { /* no colour column: parts take the pack default */ } }
    // meta.mat = the stated material (elements_meta.material_name), meta.layerMats = the materials of its layer set: what a material gate (e.g. the weld pack's steel rule) reads
    if (has(db, 'elements_meta')) { try { var rm = db.exec('SELECT guid, material_name FROM elements_meta'); if (rm.length) rm[0].values.forEach(function (v) { if (meta[v[0]]) meta[v[0]].mat = v[1]; }); } catch (e) { /* no material column */ } }
    if (has(db, 'rel_material_layer_set') && has(db, 'material_layers')) { try { var rl = db.exec('SELECT r.element_guid, l.material_name FROM rel_material_layer_set r JOIN material_layers l ON l.layer_set_name = r.layer_set_name ORDER BY r.element_guid, l.sequence'); if (rl.length) rl[0].values.forEach(function (v) { if (meta[v[0]]) (meta[v[0]].layerMats = meta[v[0]].layerMats || []).push(v[1]); }); } catch (e) { /* no layer materials */ } }
    return { meta: meta, sched: sched, world: world, canWorld: canWorld, layers: layerApi(db) };
  }
  return { fromDb: fromDb, has: has };
});
