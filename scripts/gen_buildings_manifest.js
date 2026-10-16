#!/usr/bin/env node
// GEOMETRY_TRUTH_CHAIN.md §S1 — generate `modeller/buildings_manifest.json`.
//
// NON-INVENT: every number here is COUNTed out of the actual .db files on disk. Nothing is typed
// by hand, nothing is defaulted. Regenerate on demand; commit the JSON (text — the DB-binary ban
// is unaffected).
//
// THE POINT (S0(a), 2026-07-20): a building's identity is a PAIR — a meta db plus the geometry
// substrate it joins against — never a single file. `Hospital_ARC.db` has ZERO `component_geometries`
// and is nonetheless 100% covered, because its meshes live in the shared `mesh.db` and the link is
// `element_instances(guid, geometry_hash)`. A per-file `geo=` count reads that healthy pair as
// broken; that misreading cost a full session. So the manifest records `geoCovered`/`geoMissing`
// — the JOIN — as the authoritative figure.
//
// Usage: node scripts/gen_buildings_manifest.js [--check]
//   (no args)  rewrite modeller/buildings_manifest.json
//   --check    verify the committed manifest still matches the DBs; exit 1 on drift (CI-able)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MODELLER = path.join(ROOT, 'modeller');
const OUT = path.join(MODELLER, 'buildings_manifest.json');

// The residents table is the source of truth for WHICH pairs exist — parsed out of the shipped
// loader rather than duplicated here, so the manifest can never describe a pairing the app doesn't use.
function readResidents() {
  const src = fs.readFileSync(path.join(MODELLER, 'str_walker_outliner.js'), 'utf8');
  const block = src.match(/var RESIDENTS = \[([\s\S]*?)\];/);
  if (!block) throw new Error('RESIDENTS table not found in str_walker_outliner.js — loader changed shape');
  const rows = [];
  for (const line of block[1].split('\n')) {
    const key = line.match(/key:\s*'([^']+)'/);
    const db = line.match(/[^o]db:\s*'([^']+)'/);
    if (!key || !db) continue;
    const geoDb = line.match(/geoDb:\s*'([^']+)'/);
    rows.push({ key: key[1], db: db[1], geoDb: geoDb ? geoDb[1] : null });
  }
  if (!rows.length) throw new Error('RESIDENTS parsed to zero rows — parser is stale');
  return rows;
}

function sqlite(file, sql) {
  try {
    // stderr silenced: "no such table: component_geometries" is the EXPECTED, HEALTHY reading of an
    // ARC resident (its meshes live in the paired mesh.db). Surfacing it as an error is exactly the
    // misread S0(a) documented. A genuinely absent file is caught by fs.existsSync above.
    return execFileSync('sqlite3', [file, sql], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (e) { return null; }
}
function count(file, sql) {
  const r = sqlite(file, sql);
  const n = r === null || r === '' ? null : parseInt(r, 10);
  return Number.isNaN(n) ? null : n;
}

function describe(res) {
  const dbPath = path.join(MODELLER, res.db);
  if (!fs.existsSync(dbPath)) return { key: res.key, db: res.db, error: 'MISSING FILE' };

  const rec = {
    key: res.key,
    db: res.db,
    geoDb: res.geoDb,
    meta: count(dbPath, 'SELECT COUNT(*) FROM elements_meta;'),
    instances: count(dbPath, 'SELECT COUNT(*) FROM element_instances;'),
    distinctHashes: count(dbPath, 'SELECT COUNT(DISTINCT geometry_hash) FROM element_instances;'),
    // geometry rows in the meta db ITSELF — usually 0 for ARC residents, and that is HEALTHY.
    // Recorded only so a reader can see the split; it is NOT the coverage figure.
    geoRowsInMetaDb: count(dbPath, 'SELECT COUNT(*) FROM component_geometries;') || 0
  };

  // THE authoritative number: how many element instances actually resolve a mesh, across the pair.
  const geoPath = res.geoDb ? path.join(MODELLER, res.geoDb) : dbPath;
  if (!fs.existsSync(geoPath)) {
    rec.geoSubstrate = res.geoDb;
    rec.geoSubstrateMissing = true;
    rec.geoCovered = 0;
    rec.geoMissing = rec.instances;
  } else {
    rec.geoSubstrate = res.geoDb || res.db;
    rec.geoCovered = count(dbPath,
      `ATTACH '${geoPath}' AS m; SELECT COUNT(*) FROM element_instances i ` +
      `WHERE EXISTS(SELECT 1 FROM m.component_geometries g WHERE g.geometry_hash = i.geometry_hash);`);
    rec.geoMissing = (rec.instances != null && rec.geoCovered != null) ? rec.instances - rec.geoCovered : null;
  }
  rec.coveragePct = (rec.instances > 0 && rec.geoCovered != null)
    ? +(100 * rec.geoCovered / rec.instances).toFixed(2) : null;
  return rec;
}

function build() {
  const residents = readResidents();
  const buildings = residents.map(describe);
  const substrates = {};
  for (const r of residents) {
    if (!r.geoDb || substrates[r.geoDb]) continue;
    const p = path.join(MODELLER, r.geoDb);
    substrates[r.geoDb] = fs.existsSync(p)
      ? { geometries: count(p, 'SELECT COUNT(*) FROM component_geometries;') }
      : { missing: true };
  }
  return {
    _spec: 'GEOMETRY_TRUTH_CHAIN.md §S1 — generated, never hand-edited. Regenerate: node scripts/gen_buildings_manifest.js',
    _note: 'geoCovered/geoMissing are the JOIN across the (meta db, geo substrate) PAIR. geoRowsInMetaDb=0 is HEALTHY for ARC residents.',
    generated: new Date().toISOString().slice(0, 10),
    substrates,
    buildings
  };
}

// Compare ignoring the generated date — a date-only diff is not drift.
function stripDate(m) { const c = JSON.parse(JSON.stringify(m)); delete c.generated; return c; }

const manifest = build();
const check = process.argv.includes('--check');

if (check) {
  if (!fs.existsSync(OUT)) { console.error('§MANIFEST_CHECK FAIL — no manifest at ' + OUT); process.exit(1); }
  const committed = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const drift = JSON.stringify(stripDate(committed)) !== JSON.stringify(stripDate(manifest));
  for (const b of manifest.buildings) {
    console.log(`§MANIFEST building=${b.key} db=${b.db} geoDb=${b.geoDb} meta=${b.meta} ` +
      `inst=${b.instances} covered=${b.geoCovered} missing=${b.geoMissing} cov=${b.coveragePct}%`);
  }
  console.log('§MANIFEST_CHECK ' + (drift ? 'DRIFT — committed manifest no longer matches the DBs' : 'match'));
  process.exit(drift ? 1 : 0);
}

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
for (const b of manifest.buildings) {
  console.log(`§MANIFEST building=${b.key} db=${b.db} geoDb=${b.geoDb} meta=${b.meta} ` +
    `inst=${b.instances} covered=${b.geoCovered} missing=${b.geoMissing} cov=${b.coveragePct}%`);
}
console.log('§MANIFEST_WRITE ' + OUT + ' buildings=' + manifest.buildings.length);
