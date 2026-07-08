// build_component_catalog.js — derive a deduped parts-catalog mesh.db FROM
// bim-compiler/library/component_library.db, WITHOUT ever writing to that source file.
// Source is opened read-only (fs.readFileSync into an in-memory sql.js Database — the source file
// handle is never opened for write, no VACUUM, no DELETE ever touches it). Output is a brand-new file.
// True-duplicate method: same as bim-ootb/modeller/tests/apply_mesh_dedup.js (bbox spread <=1mm
// across every member of a (vertex_count,face_count) group -> collapse to 1 canonical row).
const fs = require('fs');
const initSqlJs = require('sql.js');

const SOURCE = process.argv[2]; // absolute path, read-only
const OUT = process.argv[3] || 'component_catalog_geo.db';

function toF32(blob) { return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }
function sizeOf(p) {
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity,zmin=Infinity,zmax=-Infinity;
  for (let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2];
    if(x<xmin)xmin=x; if(x>xmax)xmax=x; if(y<ymin)ymin=y; if(y>ymax)ymax=y; if(z<zmin)zmin=z; if(z>zmax)zmax=z;}
  return [xmax-xmin, ymax-ymin, zmax-zmin];
}

(async () => {
  const SQL = await initSqlJs();
  const srcBuf = fs.readFileSync(SOURCE);              // READ-ONLY load; SOURCE file is never opened for write
  const srcMd5Before = require('crypto').createHash('md5').update(srcBuf).digest('hex');
  const src = new SQL.Database(srcBuf);                 // in-memory copy only

  const rows = src.exec("SELECT geometry_hash, vertices, faces, normals, vertex_count, face_count FROM component_geometries")[0];
  console.log('§MESHCAT source_rows=' + rows.values.length);

  const groups = new Map();
  for (const [hash, vBlob, fBlob, nBlob, vc, fc] of rows.values) {
    const key = vc + ':' + fc;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ hash, vBlob, fBlob, nBlob, vc, fc });
  }

  const TOL = 0.001;
  const canonicalOf = new Map();   // hash -> canonical hash (identity for kept rows)
  let trueDupGroups = 0, rowsCollapsed = 0;
  for (const [key, members] of groups) {
    if (members.length < 2) { canonicalOf.set(members[0].hash, members[0].hash); continue; }
    const sizes = members.map(m => sizeOf(toF32(m.vBlob)));
    const dx = Math.max(...sizes.map(s=>s[0])) - Math.min(...sizes.map(s=>s[0]));
    const dy = Math.max(...sizes.map(s=>s[1])) - Math.min(...sizes.map(s=>s[1]));
    const dz = Math.max(...sizes.map(s=>s[2])) - Math.min(...sizes.map(s=>s[2]));
    if (dx<=TOL && dy<=TOL && dz<=TOL) {
      trueDupGroups++;
      const sorted = members.slice().sort((a,b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);
      const canonical = sorted[0].hash;
      for (const m of members) canonicalOf.set(m.hash, canonical);
      rowsCollapsed += members.length - 1;
    } else {
      for (const m of members) canonicalOf.set(m.hash, m.hash); // not a true dup group, keep all
    }
  }
  console.log('§MESHCAT trueDupGroups=' + trueDupGroups + ' rowsCollapsed=' + rowsCollapsed);

  // Build output: one row per CANONICAL hash only.
  const out = new SQL.Database();
  out.run("CREATE TABLE component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB NOT NULL, faces BLOB NOT NULL, normals BLOB, vertex_count INTEGER NOT NULL, face_count INTEGER NOT NULL)");
  const byHash = new Map(rows.values.map(v => [v[0], v]));
  const keptCanonicals = new Set(canonicalOf.values());
  const ins = out.prepare("INSERT INTO component_geometries (geometry_hash, vertices, faces, normals, vertex_count, face_count) VALUES (?,?,?,?,?,?)");
  for (const hash of keptCanonicals) {
    const v = byHash.get(hash);
    ins.run([v[0], v[1], v[2], v[3], v[4], v[5]]);
  }
  ins.free();

  // Carry the map table too, repointed to canonical hashes, so provenance (ifc_class/building_type/source)
  // isn't lost -- needed later to actually USE this catalog (class-filtering, mesh-fit clustering).
  const mapRows = src.exec("SELECT building_type, element_ref, ifc_class, storey, ordinal, geometry_hash, source, provenance FROM ad_geometry_map")[0];
  out.run("CREATE TABLE ad_geometry_map (building_type TEXT, element_ref TEXT, ifc_class TEXT, storey TEXT, ordinal INTEGER, geometry_hash TEXT, source TEXT, provenance TEXT)");
  const insMap = out.prepare("INSERT INTO ad_geometry_map (building_type, element_ref, ifc_class, storey, ordinal, geometry_hash, source, provenance) VALUES (?,?,?,?,?,?,?,?)");
  let mapRowsWritten = 0;
  for (const [bt, er, cls, storey, ord, hash, source, prov] of (mapRows ? mapRows.values : [])) {
    const canon = canonicalOf.get(hash);
    if (!canon) continue; // geometry_hash not present in component_geometries (36 known orphans) -> skip
    insMap.run([bt, er, cls, storey, ord, canon, source, prov]);
    mapRowsWritten++;
  }
  insMap.free();
  console.log('§MESHCAT map_rows_written=' + mapRowsWritten + ' (repointed to canonical hashes)');

  fs.writeFileSync(OUT, Buffer.from(out.export()));
  console.log('§MESHCAT kept_rows=' + keptCanonicals.size + ' out_bytes=' + fs.statSync(OUT).size);

  // Prove the source was never mutated.
  const srcMd5After = require('crypto').createHash('md5').update(fs.readFileSync(SOURCE)).digest('hex');
  console.log('§MESHCAT source_md5_before=' + srcMd5Before + ' source_md5_after=' + srcMd5After +
    ' unchanged=' + (srcMd5Before === srcMd5After));
})().catch(e => { console.error('§MESHCAT FATAL', e); process.exit(1); });
