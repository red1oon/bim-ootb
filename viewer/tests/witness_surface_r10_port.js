// ⚠ DO NOT REMOVE — port witness for §SURFACE_R10 (bim-compiler PHOTOREAL_STILL_RENDER.md §SURFACE_R10). Read the log after every run.
// Issue it proves or disproves: "viewer/surface_r10.js is a faithful port of the Python measurement"
// (photoreal scratchpad r10/split_lib.py + measure_windows.py + measure_doors.py). A port that drifted —
// a different rounding, a different cluster, a different threshold — would print different per-building
// counts than the measurement's logs (windows_all.log / doors_all.log; 40 % floor re-run r10port/*40.log).
// Pure Node, read-only DB access (better-sqlite3, readonly), geometry decoded exactly as scene.js
// A.blobToGeometry does (Y<->Z swap), NO silhouette refinement — so this isolates the algorithm; the
// in-app witness (witness_surface_r10.js) proves the same counts on the geometry the viewer really renders.
// Usage: node viewer/tests/witness_surface_r10_port.js [Terminal Hospital LTU_AHouse JKR]
const Database = require('/home/red1/bim-compiler/node_modules/better-sqlite3');
const R10 = require('../surface_r10.js');
const DIR = '/home/red1/bim-ootb/buildings';
const B = {
  Terminal: ['Terminal_meta.db', 'Terminal_geo.db', 'component_geometries'],
  Hospital: ['Hospital_meta.db', 'Hospital_geo.db', 'component_geometries'],
  JKR: ['JKR_extracted.db', 'JKR_extracted.db', 'component_geometries'],
  LTU_AHouse: ['LTU_AHouse_meta.db', 'LTU_AHouse_geo.db', 'base_geometries'],
};
const alpha = s => { try { const p = s.split(','); return p.length >= 4 ? +p[3] : 1; } catch (e) { return 1; } };
function decode(vb, fb) {
  const v = new Float32Array(vb.buffer, vb.byteOffset, vb.byteLength / 4), f = new Uint32Array(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength));
  const pos = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 3) { pos[i] = v[i]; pos[i + 1] = v[i + 2]; pos[i + 2] = -v[i + 1]; }
  return { pos, idx: f.subarray(0, Math.floor(f.length / 3) * 3) };
}
for (const bld of (process.argv.slice(2).length ? process.argv.slice(2) : ['Terminal', 'Hospital', 'LTU_AHouse'])) {
  const [meta, geo, table] = B[bld];
  const dm = new Database(DIR + '/' + meta, { readonly: true, fileMustExist: true });
  const dg = geo === meta ? dm : new Database(DIR + '/' + geo, { readonly: true, fileMustExist: true });
  const q = dg.prepare(`SELECT vertices, faces FROM ${table} WHERE geometry_hash = ?`);
  for (const cls of ['IfcWindow', 'IfcDoor']) {
    const rows = dm.prepare("SELECT m.guid, i.geometry_hash, m.material_rgba FROM elements_meta m LEFT JOIN element_instances i ON i.guid = m.guid WHERE m.ifc_class = ?").all(cls);
    const single = rows.filter(r => alpha(r.material_rgba) >= 1 && r.geometry_hash);
    const byHash = new Map(); single.forEach(r => { if (!byHash.has(r.geometry_hash)) byHash.set(r.geometry_hash, 0); byHash.set(r.geometry_hash, byHash.get(r.geometry_hash) + 1); });
    const tally = {}; let meshes = 0;
    for (const [h, n] of byHash) {
      const row = q.get(h); if (!row || !row.vertices || !row.faces) { tally.NO_MESH = (tally.NO_MESH || 0) + n; continue; }
      const g = decode(row.vertices, row.faces); meshes++;
      const r = cls === 'IfcWindow' ? R10.classifyWindow(g.pos, g.idx) : R10.classifyDoor(g.pos, g.idx);
      tally[r.verdict] = (tally[r.verdict] || 0) + n;
    }
    console.log(`§SURFACE_R10_PORT bld=${bld} class=${cls} singleStyle=${single.length} meshes=${meshes} ` + Object.keys(tally).sort().map(k => k + '=' + tally[k]).join(' '));
  }
}
