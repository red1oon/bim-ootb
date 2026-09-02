// apply_mesh_dedup.js — reusable *_geo.db / *_extracted.db true-duplicate collapse.
// Groups component_geometries rows by (vertex-bytes, face-bytes), keeps a group only if every member's
// real decoded bbox SIZE agrees within 1mm on all 3 axes (same method as bim-compiler's
// internal/Terminal_Analysis.md §4 — a (vlen,flen) match alone is NOT enough, see that doc's retracted
// first pass), then collapses each true-dup group to 1 canonical row (smallest hash, deterministic) and
// repoints any *_meta.db element_instances rows still pointing at a collapsed hash before deleting it.
// Usage: node apply_mesh_dedup.js <geo.db> <meta.db> [--apply]   (dry-run without --apply)
// Caller MUST `VACUUM` the geo db afterward — sqlite doesn't shrink the file on DELETE alone.
// First real application: Terminal_geo.db, 2026-07-08 (§NEXT item 2, RESUME_MESH_DEDUP_AND_ONBOARDING.md)
// — 72 groups, 9394→8679 rows, 261,349,376→159,444,992 bytes after VACUUM. Verified with a real headless
// smoke test (W-ARC-ONLY-SMOKE-Terminal, meshCount=35552, 0 errors) before/after.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const GEO_PATH = process.argv[2] || path.join(__dirname, 'Terminal_geo.db');
const META_PATH = process.argv[3] || path.join(__dirname, 'Terminal_meta.db');
const APPLY = process.argv.includes('--apply');

function toF32(blob) { return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4); }
function sizeOf(p) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    if (z < zmin) zmin = z; if (z > zmax) zmax = z;
  }
  return [xmax - xmin, ymax - ymin, zmax - zmin];
}

(async () => {
  const SQL = await initSqlJs();
  const geoBuf = fs.readFileSync(GEO_PATH);
  const geoDb = new SQL.Database(geoBuf);
  const metaBuf = fs.readFileSync(META_PATH);
  const metaDb = new SQL.Database(metaBuf);

  const rows = geoDb.exec("SELECT geometry_hash, vertices, faces, length(vertices) vl, length(faces) fl FROM component_geometries")[0];
  console.log('§DEDUP-APPLY total_rows=' + rows.values.length);

  // group by (vertex-byte-length, face-byte-length)
  const groups = new Map();
  for (const [hash, vBlob, fBlob, vl, fl] of rows.values) {
    const key = vl + ':' + fl;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ hash, vBlob, fBlob, vl, fl });
  }

  const TOL = 0.001; // 1mm
  let trueDupGroups = 0, rowsToDelete = [], bytesBefore = 0, bytesAfterCanonical = 0;
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const sizes = members.map(m => sizeOf(toF32(m.vBlob)));
    const dx = Math.max(...sizes.map(s => s[0])) - Math.min(...sizes.map(s => s[0]));
    const dy = Math.max(...sizes.map(s => s[1])) - Math.min(...sizes.map(s => s[1]));
    const dz = Math.max(...sizes.map(s => s[2])) - Math.min(...sizes.map(s => s[2]));
    const groupBytes = members.reduce((a, m) => a + m.vl + m.fl, 0);
    if (dx <= TOL && dy <= TOL && dz <= TOL) {
      trueDupGroups++;
      // canonical = lexicographically smallest hash, deterministic + reproducible
      members.sort((a, b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);
      const canonical = members[0];
      bytesBefore += groupBytes;
      bytesAfterCanonical += canonical.vl + canonical.fl;
      for (let i = 1; i < members.length; i++) rowsToDelete.push({ hash: members[i].hash, canonical: canonical.hash });
    }
  }
  console.log('§DEDUP-APPLY trueDupGroups=' + trueDupGroups + ' rowsToDelete=' + rowsToDelete.length +
    ' bytesBefore=' + bytesBefore + ' bytesAfterCanonical=' + bytesAfterCanonical +
    ' savedBytes=' + (bytesBefore - bytesAfterCanonical));

  // cross-check against Terminal_meta.db's element_instances — must NOT reference any hash we're about to delete
  const instRows = metaDb.exec("SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL")[0];
  const referenced = new Set(instRows ? instRows.values.map(v => v[0]) : []);
  console.log('§DEDUP-APPLY referenced_distinct_hashes_in_meta=' + referenced.size);
  const toDeleteSet = new Set(rowsToDelete.map(r => r.hash));
  const collisions = rowsToDelete.filter(r => referenced.has(r.hash));
  console.log('§DEDUP-APPLY collisions_with_meta_referenced=' + collisions.length);
  if (collisions.length) {
    console.log('§DEDUP-APPLY WILL REPOINT ' + collisions.length + ' referenced rows to their canonical hash');
  }

  if (!APPLY) {
    console.log('§DEDUP-APPLY DRY-RUN — no files modified. Re-run with --apply to write changes.');
    return;
  }

  // Apply: repoint any referenced rows in Terminal_meta.db first (defensive — expected 0), then delete
  // the redundant rows from Terminal_geo.db.
  if (collisions.length) {
    const stmt = metaDb.prepare("UPDATE element_instances SET geometry_hash = ? WHERE geometry_hash = ?");
    for (const c of collisions) { stmt.run([c.canonical, c.hash]); }
    stmt.free();
    fs.writeFileSync(META_PATH, Buffer.from(metaDb.export()));
    console.log('§DEDUP-APPLY meta repointed+written');
  }

  const delStmt = geoDb.prepare("DELETE FROM component_geometries WHERE geometry_hash = ?");
  for (const r of rowsToDelete) { delStmt.run([r.hash]); }
  delStmt.free();
  const remaining = geoDb.exec("SELECT count(*) FROM component_geometries")[0].values[0][0];
  console.log('§DEDUP-APPLY remaining_rows=' + remaining);
  fs.writeFileSync(GEO_PATH, Buffer.from(geoDb.export()));
  console.log('§DEDUP-APPLY geo written, new_size_bytes=' + fs.statSync(GEO_PATH).size);
})().catch(e => { console.error('§DEDUP-APPLY FATAL', e); process.exit(1); });
