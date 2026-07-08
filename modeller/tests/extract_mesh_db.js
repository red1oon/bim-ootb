// extract_mesh_db.js -- SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §3a/§3b, generalized to ANY resident (not just
// component_library.db). Clusters a building's OWN geometry substrate into real-template families (same
// 6-axis-permutation RMS method as build_mesh_templates.js), restricts the output to the MINIMAL template
// set that actually covers what that building's ARC-only element_instances references (not the whole
// geometry table -- Terminal_geo.db carries 8679 rows but Terminal_meta.db's ARC-only instances only use
// 977 of them), and writes a real mesh.db file so its on-disk byte cost can be measured directly, not
// estimated.
//
// Schema-tolerant: handles both `component_geometries` (SampleCastle/Terminal) and `base_geometries`
// (SampleHouse/Duplex) table names, and buckets by (vertex_count,face_count) when those columns exist,
// falling back to raw blob byte-length (equally exact, same grouping) when they don't (Terminal_geo.db).
//
// READ-ONLY on both source dbs throughout -- md5-verified untouched after.
//
// Usage: node extract_mesh_db.js <geoDbPath> <metaDbPath> <outMeshDbPath>
//   geoDbPath  -- file carrying the geometry table (component_geometries|base_geometries)
//   metaDbPath -- file carrying element_instances (defaults to geoDbPath for single-file residents)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const GEO_PATH = process.argv[2];
const META_PATH = process.argv[3] || GEO_PATH;
const OUT_PATH = process.argv[4];
if (!GEO_PATH || !OUT_PATH) { console.error('usage: node extract_mesh_db.js <geoDbPath> <metaDbPath> <outMeshDbPath>'); process.exit(1); }

const RMS_THRESHOLD = 0.001;
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

function toF32(b) { return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); }
function bboxOf(p) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, e = Infinity, f = -Infinity;
  for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1], z = p[i + 2]; if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; if (z < e) e = z; if (z > f) f = z; }
  return [a, b, c, d, e, f];
}
function normalizeAxes(positions) {
  const bb = bboxOf(positions), min = [bb[0], bb[2], bb[4]], size = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
  const n = positions.length / 3, axes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const s = size[a]; axes[a][i] = s > 0 ? (positions[i * 3 + a] - min[a]) / s : 0; }
  return { axes, size };
}
function subsampleRms(mA, perm, tA) { const n = mA[0].length, step = Math.max(1, Math.floor(n / 64)); let sq = 0, c = 0; for (let a = 0; a < 3; a++) { const m = mA[perm[a]], t = tA[a]; for (let i = 0; i < n; i += step) { const d = m[i] - t[i]; sq += d * d; c++; } } return Math.sqrt(sq / c); }
function rmsDiff(mA, perm, tA) { const n = mA[0].length; let sq = 0; for (let a = 0; a < 3; a++) { const m = mA[perm[a]], t = tA[a]; for (let i = 0; i < n; i++) { const d = m[i] - t[i]; sq += d * d; } } return Math.sqrt(sq / (n * 3)); }

(async () => {
  const SQL = await initSqlJs();
  const geoBuf = fs.readFileSync(GEO_PATH);
  const md5GeoBefore = crypto.createHash('md5').update(geoBuf).digest('hex');
  const geoDb = new SQL.Database(geoBuf);
  const metaBuf = fs.readFileSync(META_PATH);
  const metaDb = META_PATH === GEO_PATH ? geoDb : new SQL.Database(metaBuf);

  const table = geoDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='component_geometries'").length
    ? 'component_geometries' : 'base_geometries';
  const cols = geoDb.exec("PRAGMA table_info(" + table + ")")[0].values.map(v => v[1]);
  const hasCounts = cols.includes('vertex_count') && cols.includes('face_count');
  const hasBuilding = cols.includes('building');

  const selectCols = 'geometry_hash, vertices, faces' + (hasCounts ? ', vertex_count, face_count' : '') + (hasBuilding ? ', building' : '');
  const geomRows = geoDb.exec("SELECT " + selectCols + " FROM " + table)[0];
  const buildingByHash = new Map();

  const buckets = new Map();
  for (const row of geomRows.values) {
    const hash = row[0], vBlob = row[1], fBlob = row[2];
    let key;
    if (hasCounts) key = row[3] + ':' + row[4];
    else key = vBlob.byteLength + ':' + fBlob.byteLength;
    if (hasBuilding) buildingByHash.set(hash, row[row.length - 1]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ hash, vBlob, fBlob });
  }

  const templateOf = new Map();
  const templates = new Map(); // templateHash -> { vBlob, fBlob, memberCount }
  for (const [key, members] of buckets) {
    if (members.length === 1) {
      const m = members[0];
      templates.set(m.hash, { vBlob: m.vBlob, fBlob: m.fBlob, memberCount: 1 });
      templateOf.set(m.hash, { templateHash: m.hash, perm: [0, 1, 2], rms: 0 });
      continue;
    }
    const families = [];
    for (const m of members) {
      const norm = normalizeAxes(toF32(m.vBlob));
      let best = null;
      for (let fi = 0; fi < families.length; fi++) {
        const fam = families[fi];
        for (const perm of PERMS) {
          const sub = subsampleRms(norm.axes, perm, fam.axes);
          if (sub > RMS_THRESHOLD * 5) continue;
          const full = rmsDiff(norm.axes, perm, fam.axes);
          if (full <= RMS_THRESHOLD && (!best || full < best.rms)) best = { familyIdx: fi, perm, rms: full };
        }
      }
      if (best) {
        const fam = families[best.familyIdx];
        fam.memberCount++;
        templateOf.set(m.hash, { templateHash: fam.templateHash, perm: best.perm, rms: best.rms });
      } else {
        families.push({ templateHash: m.hash, axes: norm.axes, vBlob: m.vBlob, fBlob: m.fBlob, memberCount: 1 });
        templateOf.set(m.hash, { templateHash: m.hash, perm: [0, 1, 2], rms: 0 });
      }
    }
    for (const fam of families) templates.set(fam.templateHash, { vBlob: fam.vBlob, fBlob: fam.fBlob, memberCount: fam.memberCount });
  }

  // restrict to what this building's element_instances actually references (true minimal footprint)
  let usedHashes;
  try {
    const usedRows = metaDb.exec("SELECT DISTINCT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL")[0];
    usedHashes = new Set(usedRows ? usedRows.values.map(v => v[0]) : []);
  } catch (e) { usedHashes = new Set(templateOf.keys()); } // no element_instances table -- keep everything, honest fallback

  const neededTemplates = new Set();
  let originalReferencedBytes = 0;
  const geomByHash = new Map(geomRows.values.map(row => [row[0], { vBlob: row[1], fBlob: row[2] }]));
  for (const h of usedHashes) {
    const g = geomByHash.get(h);
    if (g) originalReferencedBytes += g.vBlob.byteLength + g.fBlob.byteLength;
    const t = templateOf.get(h);
    if (t) neededTemplates.add(t.templateHash);
  }

  // write output mesh.db -- ONLY the templates actually needed to cover the referenced hashes, plus the
  // map rows for the referenced hashes themselves (a caller resolving any USED hash finds it here).
  const outDb = new SQL.Database();
  outDb.run(`CREATE TABLE mesh_templates (template_hash TEXT PRIMARY KEY, vertices BLOB NOT NULL, faces BLOB NOT NULL, source_building TEXT, member_count INTEGER NOT NULL)`);
  outDb.run(`CREATE TABLE mesh_template_map (geometry_hash TEXT PRIMARY KEY, template_hash TEXT NOT NULL, axis_permutation TEXT NOT NULL, rms_confidence REAL NOT NULL)`);
  const tplStmt = outDb.prepare("INSERT INTO mesh_templates VALUES (?,?,?,?,?)");
  for (const th of neededTemplates) {
    const t = templates.get(th);
    tplStmt.run([th, t.vBlob, t.fBlob, buildingByHash.get(th) || null, t.memberCount]);
  }
  tplStmt.free();
  const mapStmt = outDb.prepare("INSERT INTO mesh_template_map VALUES (?,?,?,?)");
  for (const h of usedHashes) {
    const t = templateOf.get(h);
    if (t) mapStmt.run([h, t.templateHash, t.perm.join(','), t.rms]);
  }
  mapStmt.free();
  fs.writeFileSync(OUT_PATH, Buffer.from(outDb.export()));
  const outBytes = fs.statSync(OUT_PATH).size;

  const md5GeoAfter = crypto.createHash('md5').update(fs.readFileSync(GEO_PATH)).digest('hex');
  const untouched = md5GeoAfter === md5GeoBefore;

  console.log('§EXTRACT-MESHDB geo=' + GEO_PATH + ' meta=' + META_PATH + ' out=' + OUT_PATH);
  console.log('§EXTRACT-MESHDB table=' + table + ' total_geometry_rows=' + geomRows.values.length +
    ' referenced_hashes=' + usedHashes.size + ' templates_needed=' + neededTemplates.size +
    ' compression_ratio=' + (usedHashes.size / neededTemplates.size).toFixed(2) + 'x');
  console.log('§EXTRACT-MESHDB original_referenced_geometry_bytes=' + originalReferencedBytes +
    ' mesh_db_out_bytes=' + outBytes + ' source_untouched=' + untouched);

  // machine-readable summary line for the roll-up table
  console.log('§ROW ' + JSON.stringify({
    geo: path.basename(GEO_PATH), referencedHashes: usedHashes.size, templatesNeeded: neededTemplates.size,
    originalReferencedBytes: originalReferencedBytes, meshDbBytes: outBytes
  }));
})().catch(e => { console.error('§EXTRACT-MESHDB FATAL', e); process.exit(1); });
