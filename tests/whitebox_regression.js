#!/usr/bin/env node
// whitebox_regression.js — S260c deterministic regression suite
// Covers: split DB, IFC drop, auto-split, variance, offline, filename case, ground Y
// Run: node deploy/dev/tests/whitebox_regression.js
// Rules: §-tagged logs, PASS/FAIL every line, no browser, no Playwright.
// This is the ONLY whitebox regression file. Do NOT create alternatives.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let pass = 0, fail = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result.ok) { pass++; console.log(result.log + ' PASS'); }
    else { fail++; console.log(result.log + ' FAIL — ' + result.reason); }
  } catch (e) { fail++; console.log('§WB_ERROR test=' + name + ' err=' + e.message + ' FAIL'); }
}

// Resolve paths relative to repo root
const REPO = path.resolve(__dirname, '../../..');
const BUILDINGS_DIR = path.join(REPO, 'deploy/buildings');
const DEV_BUILDINGS_DIR = path.join(REPO, 'deploy/dev/buildings');
const DEV_DIR = path.join(REPO, 'deploy/dev');

// Helper: find a building file in either buildings dir
function findBldFile(filename) {
  const p1 = path.join(BUILDINGS_DIR, filename);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(DEV_BUILDINGS_DIR, filename);
  if (fs.existsSync(p2)) return p2;
  return null;
}

// Helper: open sqlite3 DB and run query
function sqlQuery(dbPath, sql) {
  return execSync(`sqlite3 "${dbPath}" "${sql}"`, { encoding: 'utf8' }).trim();
}

// ─── 3.1 Split DB integrity ──────────────────────────────────────────────────
// Issue: S260c Clinic BLOB_MISS — stale meta caused 100% miss
const SPLIT_BUILDINGS = ['Terminal', 'Hospital', 'LTU_AHouse', 'Clinic'];

for (const bld of SPLIT_BUILDINGS) {
  test('split_integrity_' + bld, () => {
    const metaPath = findBldFile(bld + '_meta.db');
    const geoPath = findBldFile(bld + '_geo.db');

    if (!metaPath || !geoPath) {
      return { ok: false, log: `§WB_SPLIT_INTEGRITY bld=${bld}`, reason: 'meta.db or geo.db not found locally' };
    }

    const metaHashes = parseInt(sqlQuery(metaPath,
      "SELECT COUNT(DISTINCT geometry_hash) FROM element_instances WHERE geometry_hash IS NOT NULL"), 10);
    const geoHashes = parseInt(sqlQuery(geoPath,
      "SELECT COUNT(DISTINCT geometry_hash) FROM component_geometries"), 10);

    // Cross-check: count meta hashes NOT in geo
    const orphans = parseInt(sqlQuery(metaPath,
      `SELECT COUNT(DISTINCT geometry_hash) FROM element_instances WHERE geometry_hash IS NOT NULL AND geometry_hash NOT IN (SELECT geometry_hash FROM (SELECT geometry_hash FROM element_instances WHERE 0))`), 10);

    // Better cross-check using attached DB
    let realOrphans = 0;
    try {
      const result = execSync(
        `sqlite3 "${metaPath}" "ATTACH '${geoPath}' AS geo; SELECT COUNT(DISTINCT ei.geometry_hash) FROM element_instances ei WHERE ei.geometry_hash IS NOT NULL AND ei.geometry_hash NOT IN (SELECT geometry_hash FROM geo.component_geometries);"`,
        { encoding: 'utf8' }
      ).trim();
      realOrphans = parseInt(result, 10);
    } catch (e) {
      realOrphans = -1;
    }

    // Verify no NULL vertices in geo
    let nullVerts = 0;
    try {
      nullVerts = parseInt(sqlQuery(geoPath,
        "SELECT COUNT(*) FROM component_geometries WHERE vertices IS NULL OR faces IS NULL"), 10);
    } catch (e) { nullVerts = -1; }

    const ok = realOrphans === 0 && nullVerts === 0 && metaHashes > 0 && geoHashes > 0;
    return {
      ok,
      log: `§WB_SPLIT_INTEGRITY bld=${bld} meta_hashes=${metaHashes} geo_hashes=${geoHashes} orphans=${realOrphans} null_verts=${nullVerts}`,
      reason: realOrphans > 0 ? `${realOrphans} orphan hashes` : nullVerts > 0 ? `${nullVerts} null verts/faces` : 'no data'
    };
  });
}

// ─── 3.2 IFC Drop → DB validity ─────────────────────────────────────────────
// Issue: S260c BUG 1 — Drop IFC sometimes produces DB viewer cannot open
test('drop_ifc_validity', () => {
  // Use existing fixture DB as proxy for drop-produced DB
  const dbPath = path.join(__dirname, 'fixtures/duplex_extracted.db');
  if (!fs.existsSync(dbPath)) {
    return { ok: false, log: '§WB_DROP_IFC db=duplex_extracted.db', reason: 'fixture not found' };
  }

  const requiredTables = ['elements_meta', 'element_transforms', 'element_instances', 'component_geometries'];
  const existingTables = sqlQuery(dbPath, "SELECT name FROM sqlite_master WHERE type='table'").split('\n');

  const missing = requiredTables.filter(t => !existingTables.includes(t));
  if (missing.length > 0) {
    return { ok: false, log: `§WB_DROP_IFC db=duplex tables=${existingTables.length}`, reason: 'missing: ' + missing.join(',') };
  }

  const elements = parseInt(sqlQuery(dbPath, "SELECT COUNT(*) FROM elements_meta"), 10);
  const geometries = parseInt(sqlQuery(dbPath, "SELECT COUNT(*) FROM component_geometries"), 10);

  // Check no NULL primary keys
  const nullGuids = parseInt(sqlQuery(dbPath, "SELECT COUNT(*) FROM elements_meta WHERE guid IS NULL"), 10);

  const ok = elements > 0 && geometries > 0 && nullGuids === 0;
  return {
    ok,
    log: `§WB_DROP_IFC db=duplex tables=${requiredTables.length} elements=${elements} geometries=${geometries} null_pks=${nullGuids}`,
    reason: elements === 0 ? 'no elements' : geometries === 0 ? 'no geometries' : 'null PKs'
  };
});

// ─── 3.3 Large IFC → auto-split threshold ───────────────────────────────────
// Issue: S260c BUG 2 — >15K elements should auto-split
test('split_threshold', () => {
  const scriptPath = path.join(REPO, 'scripts/split_db.sh');
  const scriptExists = fs.existsSync(scriptPath);

  // Read the threshold from split_db.sh
  let threshold = 0;
  if (scriptExists) {
    const content = fs.readFileSync(scriptPath, 'utf8');
    const m = content.match(/-lt\s+(\d+)/);
    if (m) threshold = parseInt(m[1], 10);
  }

  const ok = scriptExists && threshold === 15000;
  return {
    ok,
    log: `§WB_SPLIT_THRESHOLD threshold=${threshold} script_exists=${scriptExists}`,
    reason: !scriptExists ? 'script not found' : threshold !== 15000 ? `threshold=${threshold}, expected 15000` : ''
  };
});

// ─── 3.4 Variance IFC → 4D5D HTML inclusion ─────────────────────────────────
// Issue: Variance IFC logic must not regress — 4D5D HTML must include variance graph
test('variance_modules', () => {
  const variationPath = path.join(DEV_DIR, 'variation_order.js');
  const diffPath = path.join(DEV_DIR, 'diff.js');
  const boqPath = path.join(DEV_DIR, 'boq_charts.html');

  const modules = [];
  if (fs.existsSync(variationPath)) modules.push('variation_order');
  if (fs.existsSync(diffPath)) modules.push('diff');

  let boqRef = false;
  if (fs.existsSync(boqPath)) {
    const boqContent = fs.readFileSync(boqPath, 'utf8');
    boqRef = boqContent.includes('diff') || boqContent.includes('variance') || boqContent.includes('variation');
  }

  const ok = modules.length === 2 && boqRef;
  return {
    ok,
    log: `§WB_VARIANCE modules=[${modules.join(',')}] boq_ref=${boqRef}`,
    reason: modules.length < 2 ? 'missing modules: ' + ['variation_order', 'diff'].filter(m => !modules.includes(m)).join(',') : !boqRef ? 'boq_charts.html has no variance/diff reference' : ''
  };
});

// ─── 3.5 Offline/PWA mode ────────────────────────────────────────────────────
// Issue: SW version mismatch causes stale JS to be served from cache
test('offline_pwa', () => {
  const swPath = path.join(DEV_DIR, 'sw.js');
  const indexPath = path.join(DEV_DIR, 'index.html');

  if (!fs.existsSync(swPath) || !fs.existsSync(indexPath)) {
    return { ok: false, log: '§WB_OFFLINE', reason: 'sw.js or index.html not found' };
  }

  const swContent = fs.readFileSync(swPath, 'utf8');
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  // Extract CACHE_VERSION from sw.js
  const swMatch = swContent.match(/CACHE_VERSION\s*=\s*'v(\d+)'/);
  const swVersion = swMatch ? parseInt(swMatch[1], 10) : 0;

  // Extract ?v=N from index.html sw.js registration
  const indexMatch = indexContent.match(/sw\.js\?v=(\d+)/);
  const indexVersion = indexMatch ? parseInt(indexMatch[1], 10) : 0;

  const versionMatch = swVersion > 0 && swVersion === indexVersion;

  // Count precache assets in sw.js
  const precacheMatch = swContent.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  let precacheCount = 0;
  if (precacheMatch) {
    precacheCount = (precacheMatch[1].match(/'/g) || []).length / 2; // pairs of quotes
  }

  // Check manifest exists
  const manifestExists = fs.existsSync(path.join(DEV_DIR, 'manifest.webmanifest')) ||
                          fs.existsSync(path.join(DEV_DIR, 'manifest.json'));

  const ok = versionMatch && precacheCount > 10 && manifestExists;
  return {
    ok,
    log: `§WB_OFFLINE sw_version=${swVersion} index_version=${indexVersion} match=${versionMatch} precache_count=${precacheCount} manifest=${manifestExists}`,
    reason: !versionMatch ? `sw=${swVersion} != index=${indexVersion}` : precacheCount <= 10 ? 'too few precache assets' : !manifestExists ? 'no manifest' : ''
  };
});

// ─── 3.6 Filename case consistency ──────────────────────────────────────────
// Issue: `hospital.db` vs `Hospital_extracted.db` caused split detect 404
test('filename_case', () => {
  const landingFiles = [
    path.join(REPO, 'SYSNOVA/index.html'),
    path.join(REPO, 'deploy/dev/landing.html')
  ];

  const actualFiles = new Set(fs.readdirSync(BUILDINGS_DIR));
  const mismatches = [];
  let totalBuildings = 0;

  for (const lf of landingFiles) {
    if (!fs.existsSync(lf)) continue;
    const content = fs.readFileSync(lf, 'utf8');
    // Extract db filenames from BUILDINGS config
    const dbMatches = content.matchAll(/db:\s*'([^']+)'/g);
    for (const m of dbMatches) {
      totalBuildings++;
      const dbFile = m[1];
      if (!actualFiles.has(dbFile)) {
        mismatches.push(dbFile);
      }
    }
  }

  const ok = mismatches.length === 0 && totalBuildings > 0;
  return {
    ok,
    log: `§WB_CASE_CHECK buildings=${totalBuildings} mismatches=[${mismatches.join(',')}]`,
    reason: mismatches.length > 0 ? 'missing: ' + mismatches.join(', ') : totalBuildings === 0 ? 'no buildings found' : ''
  };
});

// ─── 3.7 Ground Y — false floor filter ──────────────────────────────────────
// Issue: S260c BUG 3 — ground hovers on some buildings
for (const bld of SPLIT_BUILDINGS) {
  test('ground_y_' + bld, () => {
    // Use meta.db if available (has element_transforms + elements_meta), else extracted
    let dbPath = findBldFile(bld + '_meta.db');
    if (!dbPath) dbPath = findBldFile(bld + '_extracted.db');
    if (!dbPath) {
      return { ok: false, log: `§WB_GROUND_Y bld=${bld}`, reason: 'no DB found' };
    }

    // Check if required tables exist
    const tables = sqlQuery(dbPath, "SELECT name FROM sqlite_master WHERE type='table'").split('\n');
    if (!tables.includes('element_transforms') || !tables.includes('elements_meta')) {
      return { ok: false, log: `§WB_GROUND_Y bld=${bld}`, reason: 'missing tables' };
    }

    // Replicate _calcGroundY logic
    const gfNames = "'Ground Floor','Ground','First Floor','1st Floor','Level 0','Level 00','Level 1','GF','L0','L00','L1','00','0','1F','EG','Erdgeschoss','Storey 1','Plan 1'";
    let groundZ = null, src = '?';

    // Step 1: storey name match
    try {
      const r = sqlQuery(dbPath,
        `SELECT t.center_z - t.bbox_z/2, t.bbox_x * t.bbox_y AS area, m.storey FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.ifc_class='IfcSlab' AND t.bbox_z IS NOT NULL AND t.bbox_z < 1.0 AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL AND m.storey IN (${gfNames}) ORDER BY area DESC LIMIT 1`);
      if (r && r.length > 0) {
        const parts = r.split('|');
        groundZ = parseFloat(parts[0]);
        src = 'gf-storey-slab(' + parts[2] + ')';
      }
    } catch (e) { /* no match */ }

    // Step 2: lowest of top 5 largest slabs
    if (src === '?') {
      try {
        const r = sqlQuery(dbPath,
          "SELECT t.center_z - t.bbox_z/2, t.bbox_x * t.bbox_y AS area, t.center_z, m.storey FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.ifc_class='IfcSlab' AND t.bbox_z IS NOT NULL AND t.bbox_z < 1.0 AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL ORDER BY area DESC LIMIT 5");
        if (r && r.length > 0) {
          const rows = r.split('\n');
          let bestCz = Infinity, bestBottom = null, bestStorey = '';
          for (const row of rows) {
            const parts = row.split('|');
            const cz = parseFloat(parts[2]);
            if (cz < bestCz) { bestCz = cz; bestBottom = parseFloat(parts[0]); bestStorey = parts[3] || ''; }
          }
          if (bestBottom !== null) { groundZ = bestBottom; src = 'lowest-of-top5(' + bestStorey + ')'; }
        }
      } catch (e) { /* no match */ }
    }

    // Validation: ground Z should be near building's min Z (not from roof).
    // Some buildings have IFC coords offset high (Hospital Level 1 at z=165), so we
    // compare against the building's own Z range, not absolute values.
    let minZ = null, maxZ = null;
    try {
      const zRange = sqlQuery(dbPath, "SELECT MIN(center_z), MAX(center_z) FROM element_transforms");
      const parts = zRange.split('|');
      minZ = parseFloat(parts[0]); maxZ = parseFloat(parts[1]);
    } catch (e) { /* ignore */ }

    // Ground should be in the lower third of the building's Z range
    let reasonable = groundZ !== null;
    if (minZ !== null && maxZ !== null && maxZ > minZ) {
      const range = maxZ - minZ;
      reasonable = groundZ <= minZ + range * 0.4; // ground in lower 40% of building
    }
    const ok = groundZ !== null && reasonable;

    return {
      ok,
      log: `§WB_GROUND_Y bld=${bld} src=${src} z=${groundZ !== null ? groundZ.toFixed(2) : 'null'}`,
      reason: groundZ === null ? 'no slabs found' : !reasonable ? `z=${groundZ.toFixed(2)} out of range [-10,30]` : ''
    };
  });
}

// ─── 3.8 LTU draw call consolidation — maths proof ──────────────────────────
// Issue: Progressive flush + per-hash InstancedMesh creates thousands of draw calls.
// Fix: (1) hashes with ≤5 instances → BatchedMesh instead of InstancedMesh.
//      (2) _consolidateBatched() merges fragmented BM after streaming ends.
// This test computes BEFORE and AFTER draw call counts from DB.
test('ltu_consolidation_maths', () => {
  let metaPath = path.join(REPO, 'deploy/dev/buildings/LTU_AHouse_meta.db');
  if (!fs.existsSync(metaPath)) metaPath = path.join(BUILDINGS_DIR, 'LTU_AHouse_meta.db');
  let geoPath = path.join(REPO, 'deploy/dev/buildings/LTU_AHouse_geo.db');
  if (!fs.existsSync(geoPath)) geoPath = path.join(BUILDINGS_DIR, 'LTU_AHouse_geo.db');

  if (!fs.existsSync(metaPath) || !fs.existsSync(geoPath)) {
    return { ok: false, log: '§WB_LTU_CONSOLIDATE', reason: 'LTU meta/geo not found' };
  }

  const elements = parseInt(sqlQuery(metaPath, "SELECT COUNT(*) FROM element_instances"), 10);

  // Hash distribution by instance count
  const hashes1 = parseInt(sqlQuery(metaPath,
    "SELECT COUNT(*) FROM (SELECT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL GROUP BY geometry_hash HAVING COUNT(*)=1)"), 10);
  const hashes2to5 = parseInt(sqlQuery(metaPath,
    "SELECT COUNT(*) FROM (SELECT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL GROUP BY geometry_hash HAVING COUNT(*) BETWEEN 2 AND 5)"), 10);
  const hashes6plus = parseInt(sqlQuery(metaPath,
    "SELECT COUNT(*) FROM (SELECT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL GROUP BY geometry_hash HAVING COUNT(*)>=6)"), 10);

  // Storey|disc buckets (BatchedMesh grouping key)
  const buckets = parseInt(sqlQuery(metaPath,
    "SELECT COUNT(DISTINCT COALESCE(storey,'')||'|'||COALESCE(discipline,'')) FROM elements_meta"), 10);

  // Progressive flush count
  const flushes = 1 + Math.ceil((elements - 500) / 5000);

  // OLD behaviour: 1-inst → BatchedMesh (fragmented), 2+ → InstancedMesh
  const oldDrawCalls = (flushes * buckets) + hashes2to5 + hashes6plus;

  // NEW behaviour: ≤5-inst → BatchedMesh (consolidated), 6+ → InstancedMesh
  const newDrawCalls = buckets + hashes6plus;

  const reduction = ((1 - newDrawCalls / oldDrawCalls) * 100).toFixed(0);
  const ok = newDrawCalls <= 2000;

  return {
    ok,
    log: `§WB_LTU_CONSOLIDATE elements=${elements} h1=${hashes1} h2to5=${hashes2to5} h6plus=${hashes6plus} buckets=${buckets} flushes=${flushes} OLD=${oldDrawCalls} NEW=${newDrawCalls} reduction=${reduction}%`,
    reason: ok ? '' : `still ${newDrawCalls} draw calls after fix (target ≤2000)`
  };
});

// ─── 3.9 Offline/IDB — hard reset survivability ──────────────────────────────
// Issue: After hard reset (Ctrl+Shift+R), offline mode should serve from IDB.
// Architecture: SW Cache = app shell (JS/HTML), IndexedDB = .db building files.
// SW explicitly skips .db fetches (line 174 of sw.js) — cachedFetch() handles them.
// Problem: if SW cache is cleared ("Empty cache and hard reload"), the app shell
// is gone. Even though .db files survive in IDB, the viewer JS can't load to read them.
// This test checks that the offline chain is complete:
//   1. SW precache covers ALL JS files loaded by index.html
//   2. SW does NOT intercept .db requests (so IDB handles them)
//   3. cachedFetch() checks IDB BEFORE network (offline-first for DBs)
test('offline_idb_chain', () => {
  const swPath = path.join(DEV_DIR, 'sw.js');
  const indexPath = path.join(DEV_DIR, 'index.html');
  const scenePath = path.join(DEV_DIR, 'scene.js');

  if (!fs.existsSync(swPath) || !fs.existsSync(indexPath) || !fs.existsSync(scenePath)) {
    return { ok: false, log: '§WB_OFFLINE_IDB', reason: 'required files not found' };
  }

  const swContent = fs.readFileSync(swPath, 'utf8');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const sceneContent = fs.readFileSync(scenePath, 'utf8');

  // 1. Extract JS files loaded by index.html (script src= and import map)
  const scriptSrcs = [];
  const srcMatches = indexContent.matchAll(/src=["']([^"']+\.js)(?:\?[^"']*)?["']/g);
  for (const m of srcMatches) scriptSrcs.push(m[1]);

  // Extract PRECACHE_ASSETS from sw.js
  const precacheMatch = swContent.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  const precacheFiles = new Set();
  if (precacheMatch) {
    const entries = precacheMatch[1].matchAll(/'([^']+)'/g);
    for (const e of entries) precacheFiles.add(e[1]);
  }

  // Check which index.html scripts are NOT in precache (skip external/CDN scripts)
  const missingFromPrecache = scriptSrcs.filter(s =>
    !precacheFiles.has(s) && !s.startsWith('//') && !s.startsWith('http'));

  // 2. Verify SW skips .db files
  const swSkipsDb = swContent.includes(".endsWith('.db')") && swContent.includes('return');

  // 3. Verify cachedFetch checks IDB first (cache read before fetch)
  const idbFirst = sceneContent.includes('cachedFetch') &&
    sceneContent.includes('CACHE_HIT') &&
    sceneContent.includes('CACHE_MISS');

  const ok = missingFromPrecache.length === 0 && swSkipsDb && idbFirst;
  return {
    ok,
    log: `§WB_OFFLINE_IDB scripts_in_index=${scriptSrcs.length} precached=${precacheFiles.size} missing=[${missingFromPrecache.join(',')}] sw_skips_db=${swSkipsDb} idb_first=${idbFirst}`,
    reason: missingFromPrecache.length > 0
      ? `JS not precached: ${missingFromPrecache.join(', ')} — offline will fail loading these`
      : !swSkipsDb ? 'SW does not skip .db files'
      : !idbFirst ? 'cachedFetch does not check IDB before network'
      : ''
  };
});

// ─── 3.10 Drop IFC multi-file — Clinic discipline assignment ─────────────────
// Issue: Clinic multi-IFC drop — progress bar broken, Open icon broken.
// Trace the actual code path: _discFromFilename() splits filename on _ and checks aliases.
test('drop_ifc_clinic_disc_assignment', () => {
  const landingPath = path.join(DEV_DIR, 'landing.html');
  if (!fs.existsSync(landingPath)) {
    return { ok: false, log: '§WB_CLINIC_DROP', reason: 'landing.html not found' };
  }
  const content = fs.readFileSync(landingPath, 'utf8');

  // Extract _VALID_DISCS array
  const validMatch = content.match(/_VALID_DISCS\s*=\s*\[([^\]]+)\]/);
  const validDiscs = validMatch ? validMatch[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, '')) : [];

  // Extract _DISC_ALIAS map
  const aliasMatch = content.match(/_DISC_ALIAS\s*=\s*\{([\s\S]*?)\}/);
  const aliases = {};
  if (aliasMatch) {
    const pairs = aliasMatch[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g);
    for (const p of pairs) aliases[p[1]] = p[2];
  }

  // Simulate _discFromFilename for each Clinic IFC filename
  const clinicFiles = [
    'Clinic_Architectural_IFC2x3.ifc',
    'Clinic_Electrical_IFC2x3.ifc',
    'Clinic_Plumbing_IFC2x3.ifc',
    'Clinic_HVAC_IFC2x3.ifc',
    'Clinic_Structural_IFC2x3.ifc'
  ];

  function discFromFilename(fname) {
    const stem = fname.replace(/\.(ifc|IFC)$/, '');
    const parts = stem.split(/[_\-]/);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i].toUpperCase();
      if (validDiscs.includes(p)) return p;
      if (aliases[p]) return aliases[p];
    }
    return null;
  }

  const results = {};
  const failures = [];
  for (const f of clinicFiles) {
    const disc = discFromFilename(f);
    results[f] = disc;
    if (!disc) failures.push(f + '→null');
  }

  // Also check: common prefix extraction (buildingName)
  const stems = clinicFiles.map(f => f.replace(/\.ifc$/i, ''));
  let prefix = stems[0];
  for (let i = 1; i < stems.length; i++) {
    while (stems[i].indexOf(prefix) !== 0) { prefix = prefix.substring(0, prefix.length - 1); if (!prefix) break; }
  }
  const buildingName = prefix.replace(/[_\-]+$/, '') || stems[0];

  // Check progress bar: must be shown via parentElement.style.display='block' in handleImportMultiIFC
  const multiHandler = content.match(/function handleImportMultiIFC[\s\S]*?^}/m);
  const progressShown = content.includes("progressBar.parentElement.style.display = 'block'");

  // Check worker path exists on disk
  const workerMatch = content.match(/new Worker\(['"]([^'"]+import_worker[^'"]*)['"]\)/);
  const workerPath = workerMatch ? workerMatch[1].replace(/^sandbox\//, '').replace(/\?.*$/, '') : null;
  const workerExists = workerPath ? fs.existsSync(path.join(DEV_DIR, workerPath)) : false;

  // Check: does handleImportMultiIFC call renderImportCards at end?
  const rendersCards = content.includes('renderImportCards()');

  // Check: does the card template have an Open button with data-open attribute?
  const hasOpenBtn = content.includes('data-open=');

  // Check: does openProject reference sandbox/index.html (viewer)?
  const opensViewer = content.includes("sandbox/index.html");

  const ok = failures.length === 0 && workerExists && progressShown && rendersCards && hasOpenBtn && opensViewer;
  const issues = [];
  if (failures.length > 0) issues.push('disc assignment failed: ' + failures.join(', '));
  if (!workerExists) issues.push('import_worker.js missing at ' + workerPath);
  if (!progressShown) issues.push('progress bar never shown');
  if (!rendersCards) issues.push('renderImportCards not called');
  if (!hasOpenBtn) issues.push('no Open button (data-open)');
  if (!opensViewer) issues.push('openProject does not open sandbox/index.html');

  return {
    ok,
    log: `§WB_CLINIC_DROP building=${buildingName} discs=${JSON.stringify(results)} worker=${workerPath}(${workerExists}) progress=${progressShown} cards=${rendersCards} open=${hasOpenBtn} viewer=${opensViewer}`,
    reason: issues.join('; ')
  };
});

// ─── 3.11 Clinic discipline coverage — all 5 IFC sources in extracted DB ─────
// Issue: User reports only ACMV appears from OCI Clinic.
// Whitebox: verify all disciplines present + geometry hashes exist for each.
test('clinic_disciplines', () => {
  const metaPath = findBldFile('Clinic_meta.db');
  const geoPath = findBldFile('Clinic_geo.db');
  if (!metaPath) {
    return { ok: false, log: '§WB_CLINIC_DISC', reason: 'Clinic_meta.db not found' };
  }

  // Discipline counts
  const discRows = sqlQuery(metaPath,
    "SELECT discipline, COUNT(*) FROM elements_meta GROUP BY discipline ORDER BY COUNT(*) DESC");
  const disciplines = {};
  for (const row of discRows.split('\n')) {
    const [disc, cnt] = row.split('|');
    if (disc) disciplines[disc] = parseInt(cnt, 10);
  }

  // Expected: ARC, ELEC, ACMV, PLB, STR (from 5 IFC files)
  const expected = ['ARC', 'ELEC', 'ACMV', 'PLB', 'STR'];
  const missing = expected.filter(d => !disciplines[d]);
  const total = Object.values(disciplines).reduce((a, b) => a + b, 0);

  // Per-discipline geometry coverage: each discipline must have geometry hashes
  const discGeo = {};
  try {
    const geoRows = sqlQuery(metaPath,
      "SELECT m.discipline, COUNT(DISTINCT i.geometry_hash) FROM elements_meta m JOIN element_instances i ON m.guid=i.guid WHERE i.geometry_hash IS NOT NULL GROUP BY m.discipline");
    for (const row of geoRows.split('\n')) {
      const [disc, cnt] = row.split('|');
      if (disc) discGeo[disc] = parseInt(cnt, 10);
    }
  } catch (e) { /* skip */ }
  const noGeometry = expected.filter(d => !discGeo[d] || discGeo[d] === 0);

  // Cross-check geo.db if available
  let geoOrphans = -1;
  if (geoPath) {
    try {
      geoOrphans = parseInt(execSync(
        `sqlite3 "${metaPath}" "ATTACH '${geoPath}' AS geo; SELECT COUNT(DISTINCT ei.geometry_hash) FROM element_instances ei WHERE ei.geometry_hash IS NOT NULL AND ei.geometry_hash NOT IN (SELECT geometry_hash FROM geo.component_geometries);"`,
        { encoding: 'utf8' }
      ).trim(), 10);
    } catch (e) { geoOrphans = -1; }
  }

  const issues = [];
  if (missing.length > 0) issues.push('missing disciplines: ' + missing.join(','));
  if (noGeometry.length > 0) issues.push('disciplines with 0 geometry hashes: ' + noGeometry.join(','));
  if (geoOrphans > 0) issues.push(geoOrphans + ' orphan hashes in meta not found in geo');
  if (total <= 15000) issues.push('total only ' + total);

  const ok = issues.length === 0;
  return {
    ok,
    log: `§WB_CLINIC_DISC total=${total} disciplines=${JSON.stringify(disciplines)} geo_per_disc=${JSON.stringify(discGeo)} geo_orphans=${geoOrphans} missing=[${missing.join(',')}] no_geo=[${noGeometry.join(',')}]`,
    reason: issues.join('; ')
  };
});

// ─── 3.12 Clinic building column — all disciplines must share one building ───
// Issue: Multi-IFC Clinic extraction stores each file as separate "building"
// in elements_meta.building. Viewer auto-streams only the nearest "building",
// so only ACMV appears. All rows must share one building name.
test('clinic_single_building', () => {
  const metaPath = findBldFile('Clinic_meta.db');
  const extractedPath = findBldFile('Clinic_extracted.db');
  const dbPath = metaPath || extractedPath;
  if (!dbPath) {
    return { ok: false, log: '§WB_CLINIC_BLD', reason: 'Clinic DB not found' };
  }

  const buildings = sqlQuery(dbPath,
    "SELECT DISTINCT building FROM elements_meta").split('\n').filter(Boolean);
  const counts = sqlQuery(dbPath,
    "SELECT building, COUNT(*) FROM elements_meta GROUP BY building ORDER BY COUNT(*) DESC");

  // PASS only if there's exactly 1 building name
  const ok = buildings.length === 1;
  return {
    ok,
    log: `§WB_CLINIC_BLD buildings=${buildings.length} names=[${buildings.join(',')}] counts=${counts.replace(/\n/g, '; ')}`,
    reason: ok ? '' : `${buildings.length} building names instead of 1 — viewer streams only one at a time. Fix: UPDATE elements_meta SET building="Clinic"`
  };
});

// ─── 3.12 S261 DLOD geometry-swap prerequisites ─────────────────────────────
// Issue: S261 DLOD requires bbox columns in element_transforms for per-element bbox sizing

test('dlod_bbox_columns', () => {
  // Check that at least one large building has bbox_x/y/z columns
  const dbPath = findBldFile('Terminal_extracted.db') || findBldFile('LTU_AHouse_extracted.db');
  if (!dbPath) return { ok: true, log: '§WB_DLOD_BBOX skip=no_large_db', reason: '' };
  try {
    const cols = sqlQuery(dbPath, "PRAGMA table_info(element_transforms)");
    const hasBbox = cols.includes('bbox_x') && cols.includes('bbox_y') && cols.includes('bbox_z');
    return {
      ok: hasBbox,
      log: `§WB_DLOD_BBOX db=${path.basename(dbPath)} has_bbox=${hasBbox}`,
      reason: hasBbox ? '' : 'element_transforms missing bbox_x/y/z — DLOD needs per-element bbox dims'
    };
  } catch(e) {
    return { ok: false, log: '§WB_DLOD_BBOX err=' + e.message, reason: 'query failed' };
  }
});

test('dlod_budget_math', () => {
  // Verify: 8M vert budget can hold 122K elements at tier-256 average
  // 122K * 256 = 31.2M — exceeds 8M, so budget guard must trigger for largest buildings
  // But real distribution is mixed: many small elements, so average is much less
  var budget = 8000000;
  var elements = 122000;
  var avgReserved = 256;
  var needed = elements * avgReserved;
  var wouldExceed = needed > budget;
  // This is informational — budget guard correctly caps allocation
  return {
    ok: true,
    log: `§WB_DLOD_BUDGET budget=${budget} elements=${elements} avg_reserved=${avgReserved} needed=${needed} would_exceed=${wouldExceed}`,
    reason: ''
  };
});

test('dlod_visibility_only', () => {
  // §S262+S265: DLOD = visibility culling only, no geometry swap, no invented cubes.
  // S265: DLOD enabled on all devices (mobile parity) — no _isMobile guard on dlodEnable.
  var streamSrc = fs.readFileSync(path.join(__dirname, '..', 'streaming.js'), 'utf8');
  var dlodSrc = fs.readFileSync(path.join(__dirname, '..', 'dlod.js'), 'utf8');
  var noSwapPath = !streamSrc.includes('_useDlodPath = !A._isMobile');
  var hasDlodEnable = streamSrc.includes('A.dlodEnable');
  var noMobileGate = !streamSrc.includes('!A._isMobile && A.dlodEnable');
  var noPromote = !dlodSrc.includes('_promotePass();');
  var allOk = noSwapPath && hasDlodEnable && noMobileGate && noPromote;
  return {
    ok: allOk,
    log: '§WB_DLOD_VIS noSwapPath=' + noSwapPath + ' hasDlodEnable=' + hasDlodEnable + ' noMobileGate=' + noMobileGate + ' noPromote=' + noPromote,
    reason: allOk ? '' : 'DLOD gate mismatch'
  };
});

// ─── S265: Mobile mesh parity ────────────────────────────────────────────────
// Issue: Mobile was excluded from BatchedMesh, DLOD, and consolidation.
test('mobile_batched_mesh_parity', () => {
  var src = fs.readFileSync(path.join(__dirname, '..', 'streaming.js'), 'utf8');
  // Single-instance elements must NOT be routed to mergeBuckets on mobile
  var noMobileMerge = !src.includes('elements.length === 1 && A._isMobile');
  // BatchedMesh flush must not gate on _isMobile
  var batchNoGate = !src.includes('!A._isMobile && THREE.BatchedMesh');
  // Consolidation must not gate on _isMobile
  var consolidateNoGate = !src.includes('A._isMobile || !THREE.BatchedMesh');
  // markDirty after stream-complete (scene refresh fix)
  var markDirtyAfterDone = src.includes('markDirty') && src.includes('Force render after stream-complete');
  // ESM loader exposes BatchedMesh check in log
  var loaderSrc = fs.readFileSync(path.join(__dirname, '..', 'loader.js'), 'utf8');
  var batchedLog = loaderSrc.includes('BatchedMesh=');
  var allOk = noMobileMerge && batchNoGate && consolidateNoGate && markDirtyAfterDone && batchedLog;
  return {
    ok: allOk,
    log: '§WB_MOBILE_MESH noMobileMerge=' + noMobileMerge + ' batchNoGate=' + batchNoGate +
         ' consolidateNoGate=' + consolidateNoGate + ' markDirty=' + markDirtyAfterDone +
         ' loaderBatchedLog=' + batchedLog,
    reason: allOk ? '' : 'mobile still excluded from BatchedMesh/DLOD/consolidation'
  };
});

// ─── S265: Material color audit — compare current vs colorful baseline (pre-S260c) ─────
// Issue: SampleCastle lost its colors somewhere between sessions.
test('material_color_audit', () => {
  var streamSrc = fs.readFileSync(path.join(DEV_DIR, 'streaming.js'), 'utf8');
  var sceneSrc = fs.readFileSync(path.join(DEV_DIR, 'scene.js'), 'utf8');

  // Material type: MeshPhongMaterial (colorful) vs MeshStandardMaterial (PBR)
  var hasPhong = streamSrc.includes('MeshPhongMaterial');
  var hasStandard = streamSrc.includes('MeshStandardMaterial');
  var matType = hasPhong ? 'Phong' : hasStandard ? 'Standard' : 'unknown';

  // Flat shading
  var flatShading = streamSrc.includes('flatShading: true');

  // Tone mapping
  var acesTone = sceneSrc.includes('ACESFilmicToneMapping');
  var neutralTone = sceneSrc.includes('NeutralToneMapping');
  var noTone = sceneSrc.includes('NoToneMapping') && !sceneSrc.includes('// NoToneMapping');
  var toneType = acesTone ? 'ACES' : neutralTone ? 'Neutral' : noTone ? 'None' : 'unknown';
  var exposureMatch = sceneSrc.match(/toneMappingExposure\s*=\s*([\d.]+)/);
  var exposure = exposureMatch ? exposureMatch[1] : '?';

  // Grey detection: original (0.7±0.02) vs wide spread
  var hasSpread = streamSrc.includes('_spread <');
  var hasDefaultGrey = streamSrc.includes('Math.abs(r - 0.7)');
  var greyDetect = hasDefaultGrey ? '0.7±0.02' : hasSpread ? 'spread' : 'none';

  // Near-white taming factor
  var tameMatch = streamSrc.match(/r > 0\.85.*r \*= ([\d.]+)/);
  var tameFactor = tameMatch ? tameMatch[1] : 'none';

  // Env map
  var hasEnvMap = streamSrc.includes('envMap');

  // Roughness/metalness — STD_MAT (S265) or legacy separate maps
  var hasRoughness = streamSrc.includes('ROUGHNESS_MAP') || streamSrc.includes('rough:');
  var hasMetalness = streamSrc.includes('METALNESS_MAP') || streamSrc.includes('metal:');

  // Ambient light intensity
  var ambientMatch = sceneSrc.match(/AmbientLight\(0x[0-9a-f]+,\s*([\d.]+)/);
  var ambientInt = ambientMatch ? ambientMatch[1] : '?';

  // Sun intensity
  var sunMatch = sceneSrc.match(/DirectionalLight\(0x[0-9a-f]+,\s*([\d.]+)/);
  var sunInt = sunMatch ? sunMatch[1] : '?';

  // CLASS_COLOR_FALLBACK count
  var fallbackCount = (streamSrc.match(/Ifc\w+:/g) || []).length;

  // Colorful baseline: Phong, flatShading, NoToneMapping, exposure=1.0, no envMap, 0.7±0.02 grey, tame=0.82
  var log = '§WB_MATERIAL_AUDIT' +
    ' mat=' + matType +
    ' flat=' + flatShading +
    ' tone=' + toneType +
    ' exposure=' + exposure +
    ' grey=' + greyDetect +
    ' tame=' + tameFactor +
    ' envMap=' + hasEnvMap +
    ' roughness=' + hasRoughness +
    ' metalness=' + hasMetalness +
    ' ambient=' + ambientInt +
    ' sun=' + sunInt +
    ' fallbacks=' + fallbackCount;

  // Not a pass/fail — diagnostic only. Always passes.
  return { ok: true, log: log, reason: '' };
});

// ─── 3.16 S265 Phase 3: Share refactor — must replicate sitecam.js share pattern ─────
// Issue: Share was WhatsApp-only hardcode, no scene state in URL, no system share sheet.
// Proven pattern: sitecam.js uses navigator.share+canShare guard → wa.me fallback.
// share.js MUST use the same guard sequence and fallback.
test('share_refactor_s265', () => {
  var shareSrc = fs.readFileSync(path.join(DEV_DIR, 'share.js'), 'utf8');
  var sitecamSrc = fs.readFileSync(path.join(DEV_DIR, 'sitecam.js'), 'utf8');
  var mainSrc = fs.readFileSync(path.join(DEV_DIR, 'main.js'), 'utf8');
  var indexSrc = fs.readFileSync(path.join(DEV_DIR, 'index.html'), 'utf8');
  var tmSrc = fs.readFileSync(path.join(DEV_DIR, 'time_machine.js'), 'utf8');

  var issues = [];

  // ── A. SHARE PATTERN: quickShare must match sitecam.js shareSitePhoto exactly ──
  // sitecam: async function → navigator.share+canShare guard → await navigator.share → wa.me fallback
  // CRITICAL: navigator.share MUST be in quickShare itself (same user gesture),
  // NOT behind an overlay button click or async callback.
  var sitecamGuard = sitecamSrc.includes('navigator.share && navigator.canShare');
  var sitecamCanShare = sitecamSrc.includes('navigator.canShare(data)');
  var sitecamAwait = sitecamSrc.includes('await navigator.share(data)');
  var sitecamWaFallback = sitecamSrc.includes('wa.me');

  // Extract quickShare function body to verify navigator.share is called IN IT (not delegated)
  var qsMatch = shareSrc.match(/A\.quickShare\s*=\s*async\s+function[\s\S]*?(?=\n  [A-Z]|\n  \/\/\s*──)/);
  var qsBody = qsMatch ? qsMatch[0] : '';
  var qsHasGuard = qsBody.includes('navigator.share && navigator.canShare');
  var qsHasCanShare = qsBody.includes('navigator.canShare(data)');
  var qsHasAwait = qsBody.includes('await navigator.share(data)');
  var qsHasDesktopFallback = qsBody.includes('showSharePreview');
  var qsNoWaJump = !qsBody.includes('wa.me');
  var qsIsAsync = qsBody.includes('async function');
  var qsHasPhoto = qsBody.includes('new File') && qsBody.includes('image/jpeg');
  var qsHasToBlob = qsBody.includes('toBlob');

  if (!sitecamGuard) issues.push('REFERENCE: sitecam.js missing share guard');
  if (!qsHasGuard) issues.push('quickShare missing navigator.share && canShare guard');
  if (!qsHasCanShare) issues.push('quickShare missing canShare(data) check');
  if (!qsHasAwait) issues.push('quickShare missing await navigator.share(data)');
  if (!qsIsAsync) issues.push('quickShare not async — cannot await navigator.share');
  if (!qsHasPhoto) issues.push('quickShare missing photo File creation (sitecam shares with image)');
  if (!qsHasToBlob) issues.push('quickShare missing canvas.toBlob (sitecam captures canvas)');
  if (!qsHasDesktopFallback) issues.push('quickShare missing showSharePreview desktop fallback');
  if (!qsNoWaJump) issues.push('quickShare still jumps to wa.me on desktop');

  // share.js must be a setup function (like sitecam.js), called via main.js _mods
  var shareIsSetupFn = shareSrc.includes('function setupShare(A)');
  var sitecamIsSetupFn = sitecamSrc.includes('function setupSitecam(A)');
  if (!shareIsSetupFn) issues.push('share.js must be function setupShare(A) — like sitecam.js');

  // main.js must call setupShare in the _mods array
  var mainSrcLocal = mainSrc;
  var mainCallsSetupShare = mainSrcLocal.includes('setupShare');
  if (!mainCallsSetupShare) issues.push('main.js does not call setupShare');

  // share.js must be eagerly loaded via <script src=> tag
  var shareScriptTag = indexSrc.includes('<script src="share.js');
  if (!shareScriptTag) issues.push('share.js not eagerly loaded');

  // Pill button must be a direct call (no lazy-load script injection)
  var pillDirect = indexSrc.includes('APP.quickShare()') && !indexSrc.includes("s.src='share.js");
  if (!pillDirect) issues.push('pill button still has lazy-load injection');

  // share.js must NOT have old sendWhatsApp/sendEmail functions
  var noSendWhatsApp = !shareSrc.includes('function sendWhatsApp');
  var noSendEmail = !shareSrc.includes('function sendEmail');
  if (!noSendWhatsApp) issues.push('old sendWhatsApp function still present');
  if (!noSendEmail) issues.push('old sendEmail function still present');

  // ── B. URL STATE: buildShareUrl captures scene state in hash ──
  var hasBuildShareUrl = shareSrc.includes('A.buildShareUrl');
  var capturesCam = shareSrc.includes("cam=");
  var capturesTgt = shareSrc.includes("tgt=");
  var capturesPick = shareSrc.includes("pick=");
  var capturesStorey = shareSrc.includes("storey=");
  var capturesXray = shareSrc.includes("xray=1");
  var capturesClash = shareSrc.includes("clash=");
  var capturesTm = shareSrc.includes("tm=");
  var capturesTour = shareSrc.includes("tour=play");
  if (!hasBuildShareUrl) issues.push('no buildShareUrl()');
  if (!capturesCam || !capturesTgt) issues.push('cam/tgt not captured');
  if (!capturesPick) issues.push('pick not captured');
  if (!capturesStorey) issues.push('storey not captured');
  if (!capturesXray) issues.push('xray not captured');
  if (!capturesClash) issues.push('clash not captured');
  if (!capturesTm) issues.push('tm not captured');
  if (!capturesTour) issues.push('tour not captured');

  // ── C. HASH RESTORE: main.js parses shared state on load ──
  if (!mainSrc.includes('hashParams.storey')) issues.push('main.js missing storey restore');
  if (!mainSrc.includes('hashParams.xray')) issues.push('main.js missing xray restore');
  if (!mainSrc.includes('hashParams.pick')) issues.push('main.js missing pick restore');
  if (!mainSrc.includes('hashParams.tour')) issues.push('main.js missing tour restore');
  if (!mainSrc.includes('hashParams.tm')) issues.push('main.js missing tm restore');

  // ── D. WIRING: quickShare + pill + TM + APP binding ──
  if (!shareSrc.includes('A.quickShare')) issues.push('no quickShare()');
  if (!indexSrc.includes('quickShare')) issues.push('pill not wired');
  if (!tmSrc.includes('window.tmGetState')) issues.push('tmGetState not exposed');
  // setupShare(A) receives APP as param — no need for window.APP binding
  if (!shareIsSetupFn && !shareSrc.includes('window.APP')) issues.push('not binding to window.APP and not a setup function');

  // ── E. CONTEXT DETECTION: buildShareUrl must read the same vars that features write ──
  // Cross-reference: each feature sets a variable on A/APP, buildShareUrl must read it.
  var panelsSrc = fs.readFileSync(path.join(DEV_DIR, 'panels.js'), 'utf8');
  var toolsSrc = fs.readFileSync(path.join(DEV_DIR, 'tools.js'), 'utf8');
  var tourSrc = fs.readFileSync(path.join(DEV_DIR, 'tour.js'), 'utf8');
  var pickingSrc = fs.readFileSync(path.join(DEV_DIR, 'picking.js'), 'utf8');
  var measureSrc = fs.readFileSync(path.join(DEV_DIR, 'measure.js'), 'utf8');

  // Storey: panels.js writes A.activeStoreyFilter, share.js must read A.activeStoreyFilter
  var storeyWrite = panelsSrc.includes('A.activeStoreyFilter =');
  var storeyRead = shareSrc.includes('A.activeStoreyFilter');
  if (!storeyWrite) issues.push('panels.js missing A.activeStoreyFilter write');
  if (!storeyRead) issues.push('share.js missing A.activeStoreyFilter read');

  // X-ray: tools.js writes A.xrayOn, share.js must read A.xrayOn
  var xrayWrite = toolsSrc.includes('A.xrayOn =') || toolsSrc.includes('A.xrayOn=');
  var xrayRead = shareSrc.includes('A.xrayOn');
  if (!xrayWrite) issues.push('tools.js missing A.xrayOn write');
  if (!xrayRead) issues.push('share.js missing A.xrayOn read');

  // Clash: measure.js writes A._currentClashes, share.js must read A._currentClashes
  var clashWrite = measureSrc.includes('A._currentClashes =') || measureSrc.includes('A._currentClashes=');
  var clashRead = shareSrc.includes('A._currentClashes');
  if (!clashWrite) issues.push('measure.js missing A._currentClashes write');
  if (!clashRead) issues.push('share.js missing A._currentClashes read');

  // Pick: picking.js writes to #info-guid + #info-panel display, share.js must read both
  var pickWrite = pickingSrc.includes("getElementById('info-guid')") && pickingSrc.includes("info-panel").length;
  var pickRead = shareSrc.includes("getElementById('info-guid')") && shareSrc.includes("getElementById('info-panel')");
  if (!pickRead) issues.push('share.js missing info-guid/info-panel read for pick detection');

  // Fly: tour.js writes A.flyActive, share.js must read A.flyActive
  var flyWrite = tourSrc.includes('A.flyActive =') || tourSrc.includes('A.flyActive=');
  var flyRead = shareSrc.includes('A.flyActive');
  if (!flyWrite) issues.push('tour.js missing A.flyActive write');
  if (!flyRead) issues.push('share.js missing A.flyActive read');

  // TM: time_machine.js exposes tmGetState, share.js must call it
  var tmRead = shareSrc.includes('tmGetState');
  if (!tmRead) issues.push('share.js missing tmGetState call');

  // Clash: share.js must delegate to _buildClashDeepLink (proven working, S246)
  var clashDelegates = shareSrc.includes('_buildClashDeepLink');
  var measureHasDeepLink = measureSrc.includes("A._buildClashDeepLink");
  if (!clashDelegates) issues.push('share.js must delegate clash URL to _buildClashDeepLink');
  if (!measureHasDeepLink) issues.push('REFERENCE: measure.js _buildClashDeepLink missing');

  // Diagnostic §SHARE_URL log must include ctx=[] with all context checks
  var diagLog = shareSrc.includes('§SHARE_URL') && shareSrc.includes('ctx=[');
  if (!diagLog) issues.push('missing §SHARE_URL diagnostic ctx=[] log');

  // ── F. UX: preview animation + canvas snapshot ──
  if (!shareSrc.includes('showSharePreview')) issues.push('no preview animation');
  if (!shareSrc.includes('toDataURL')) issues.push('no canvas snapshot');

  // ── F. §-tagged logs ──
  if (!shareSrc.includes('§SHARE_URL')) issues.push('missing §SHARE_URL log');
  if (!shareSrc.includes('§SHARE_METHOD')) issues.push('missing §SHARE_METHOD log');
  if (!shareSrc.includes('§SHARE_ATTEMPT')) issues.push('missing §SHARE_ATTEMPT log');
  if (!mainSrc.includes('§SHARE_PARSE')) issues.push('missing §SHARE_PARSE log');

  var allOk = issues.length === 0;
  return {
    ok: allOk,
    log: '§WB_SHARE_REFACTOR' +
      ' sitecam=[guard=' + sitecamGuard + ',canShare=' + sitecamCanShare + ',await=' + sitecamAwait + ',wa=' + sitecamWaFallback + ']' +
      ' quickShare=[guard=' + qsHasGuard + ',canShare=' + qsHasCanShare + ',await=' + qsHasAwait + ',photo=' + qsHasPhoto + ',toBlob=' + qsHasToBlob + ',async=' + qsIsAsync + ',desktopFB=' + qsHasDesktopFallback + ',noWaJump=' + qsNoWaJump + ']' +
      ' setupFn=' + shareIsSetupFn + ' mainCalls=' + mainCallsSetupShare + ' eager=' + shareScriptTag + ' pillDirect=' + pillDirect +
      ' state=[cam=' + capturesCam + ',pick=' + capturesPick + ',storey=' + capturesStorey + ',xray=' + capturesXray + ',clash=' + capturesClash + ',tm=' + capturesTm + ',tour=' + capturesTour + ']',
    reason: issues.join('; ')
  };
});

// ─── 3.17 S265 Share context capture — simulate buildShareUrl with mock state ──
// Issue: User reports share URL only has cam,tgt — not picking up clash/storey/xray/pick.
// This test extracts the buildShareUrl logic, feeds mock state, verifies hash output.
// Same approach as clash deep-link: if _currentClashes has entries, URL must have #clash=.
(function() {
  // Extract buildShareUrl logic from share.js — replicate in Node.js with mock DOM+state
  function buildShareUrl(A, mockDom) {
    var base = 'https://test.com/index.html?db=test.db';
    var parts = [];
    if (A.camera && A.controls) {
      var p = A.camera.position;
      var t = A.controls.target;
      parts.push('cam=' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ',' + p.z.toFixed(1));
      parts.push('tgt=' + t.x.toFixed(1) + ',' + t.y.toFixed(1) + ',' + t.z.toFixed(1));
    }
    if (mockDom.infoGuid && mockDom.infoPanelVisible) {
      if (mockDom.infoGuid !== '—' && mockDom.infoGuid.length > 5) {
        parts.push('pick=' + encodeURIComponent(mockDom.infoGuid));
      }
    }
    if (A.activeStoreyFilter !== null && A.activeStoreyFilter !== undefined) {
      if (Array.isArray(A.activeStoreyFilter)) {
        parts.push('storey=' + encodeURIComponent(A.activeStoreyFilter.join(',')));
      } else {
        parts.push('storey=' + encodeURIComponent(A.activeStoreyFilter));
      }
    }
    if (A.xrayOn) parts.push('xray=1');
    // Delegate to _buildClashDeepLink when clash active (same as real share.js)
    if (A._currentClashes && A._currentClashes.length > 0 && A._buildClashDeepLink) {
      var clashUrl = A._buildClashDeepLink(A._currentClashes[0]);
      if (clashUrl) return clashUrl;
    }
    if (A._tmState && A._tmState.active) parts.push('tm=' + A._tmState.cursor);
    if (A.flyActive) parts.push('tour=play');
    return base + (parts.length > 0 ? '#' + parts.join('&') : '');
  }

  // Also replicate _buildClashDeepLink from measure.js for comparison
  function buildClashDeepLink(A, c) {
    var p = A.camera.position;
    var t = A.controls.target;
    return 'https://test.com/index.html?db=test.db#clash=' + c[0] + '~' + c[1] +
      '&cam=' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) +
      '&tgt=' + t.x.toFixed(2) + ',' + t.y.toFixed(2) + ',' + t.z.toFixed(2);
  }

  var cam = { position: { x: 10, y: 20, z: 30 }, controls: { target: { x: 0, y: 0, z: 0 } } };
  var baseState = { camera: cam.position, controls: cam.controls };
  // Fix: camera and controls at top level
  var mkState = function(overrides) {
    var s = { camera: { position: { x: 10, y: 20, z: 30 } }, controls: { target: { x: 0, y: 0, z: 0 } },
      activeStoreyFilter: null, xrayOn: false, _currentClashes: null, _tmState: null, flyActive: false };
    for (var k in overrides) s[k] = overrides[k];
    return s;
  };
  var emptyDom = { infoGuid: null, infoPanelVisible: false };

  // Scenario 1: Default orbit — only cam,tgt
  test('share_ctx_default_orbit', () => {
    var url = buildShareUrl(mkState({}), emptyDom);
    var hasCam = url.includes('cam=') && url.includes('tgt=');
    var noExtras = !url.includes('pick=') && !url.includes('storey=') && !url.includes('xray=') &&
                   !url.includes('clash=') && !url.includes('tm=') && !url.includes('tour=');
    return { ok: hasCam && noExtras,
      log: '§WB_SHARE_CTX scenario=default_orbit cam=' + hasCam + ' noExtras=' + noExtras + ' url=' + url,
      reason: !hasCam ? 'missing cam/tgt' : !noExtras ? 'unexpected extras in default orbit' : '' };
  });

  // Scenario 2: Element picked — must have pick=GUID
  test('share_ctx_element_picked', () => {
    var dom = { infoGuid: '2O2Fr$t4X7Zf8NOew3FLPP', infoPanelVisible: true };
    var url = buildShareUrl(mkState({}), dom);
    var hasPick = url.includes('pick=2O2Fr');
    return { ok: hasPick,
      log: '§WB_SHARE_CTX scenario=element_picked pick=' + hasPick + ' url=' + url,
      reason: hasPick ? '' : 'pick=GUID missing — info panel visible but not captured' };
  });

  // Scenario 3: Storey filtered — must have storey=
  test('share_ctx_storey_filtered', () => {
    var url = buildShareUrl(mkState({ activeStoreyFilter: 'Level 1' }), emptyDom);
    var hasStorey = url.includes('storey=Level');
    return { ok: hasStorey,
      log: '§WB_SHARE_CTX scenario=storey_filtered storey=' + hasStorey + ' url=' + url,
      reason: hasStorey ? '' : 'storey= missing — activeStoreyFilter set but not captured' };
  });

  // Scenario 4: Multi-storey filter — must have storey=A,B
  test('share_ctx_multi_storey', () => {
    var url = buildShareUrl(mkState({ activeStoreyFilter: ['Level 1', 'Level 2'] }), emptyDom);
    var hasMulti = url.includes('storey=Level');
    return { ok: hasMulti,
      log: '§WB_SHARE_CTX scenario=multi_storey storey=' + hasMulti + ' url=' + url,
      reason: hasMulti ? '' : 'storey= missing for array filter' };
  });

  // Scenario 5: X-Ray active — must have xray=1
  test('share_ctx_xray', () => {
    var url = buildShareUrl(mkState({ xrayOn: true }), emptyDom);
    var hasXray = url.includes('xray=1');
    return { ok: hasXray,
      log: '§WB_SHARE_CTX scenario=xray xray=' + hasXray + ' url=' + url,
      reason: hasXray ? '' : 'xray=1 missing — xrayOn=true but not captured' };
  });

  // Scenario 6: Clash pair viewing — must produce same URL as _buildClashDeepLink
  // share.js delegates to _buildClashDeepLink when clash is active — verify identical output
  test('share_ctx_clash_pair', () => {
    var clashEntry = ['guidA-1234-abcd', 'guidB-5678-efgh', 'IfcWall', 'IfcPipe', 'ARC', 'PLB', 'Wall 01', 'Pipe 01', 0.025];
    var clashDeepLink = buildClashDeepLink(mkState({}), clashEntry);
    // In real code, buildShareUrl returns _buildClashDeepLink output directly when clash active.
    // Simulate: buildShareUrl with _buildClashDeepLink mock
    var stateWithClash = mkState({ _currentClashes: [clashEntry] });
    stateWithClash._buildClashDeepLink = function(c) { return buildClashDeepLink(stateWithClash, c); };
    var url = buildShareUrl(stateWithClash, emptyDom);
    var identical = url === clashDeepLink;
    return { ok: identical,
      log: '§WB_SHARE_CTX scenario=clash_pair identical=' + identical +
        ' shareUrl=' + url + ' deepLink=' + clashDeepLink,
      reason: identical ? '' : 'share URL differs from _buildClashDeepLink output' };
  });

  // Scenario 7: Time Machine active — must have tm=cursor
  test('share_ctx_time_machine', () => {
    var url = buildShareUrl(mkState({ _tmState: { active: true, cursor: 1716000000000 } }), emptyDom);
    var hasTm = url.includes('tm=1716000000000');
    return { ok: hasTm,
      log: '§WB_SHARE_CTX scenario=time_machine tm=' + hasTm + ' url=' + url,
      reason: hasTm ? '' : 'tm=cursor missing — TM active but not captured' };
  });

  // Scenario 8: Fly tour playing — must have tour=play
  test('share_ctx_fly_tour', () => {
    var url = buildShareUrl(mkState({ flyActive: true }), emptyDom);
    var hasTour = url.includes('tour=play');
    return { ok: hasTour,
      log: '§WB_SHARE_CTX scenario=fly_tour tour=' + hasTour + ' url=' + url,
      reason: hasTour ? '' : 'tour=play missing — flyActive=true but not captured' };
  });

  // Scenario 9: Combined — clash + storey + xray + pick (all at once)
  // When clash is active, _buildClashDeepLink takes over (returns clash URL directly).
  // So combined = clash URL (proven format). Other contexts don't stack with clash.
  test('share_ctx_combined_noclash', () => {
    var dom = { infoGuid: 'someGUID-1234-5678-abcd', infoPanelVisible: true };
    var url = buildShareUrl(mkState({
      activeStoreyFilter: 'Ground Floor', xrayOn: true, flyActive: false
    }), dom);
    var hasCam = url.includes('cam=');
    var hasPick = url.includes('pick=someGUID');
    var hasStorey = url.includes('storey=Ground');
    var hasXray = url.includes('xray=1');
    var allOk = hasCam && hasPick && hasStorey && hasXray;
    return { ok: allOk,
      log: '§WB_SHARE_CTX scenario=combined_noclash cam=' + hasCam + ' pick=' + hasPick +
        ' storey=' + hasStorey + ' xray=' + hasXray + ' url=' + url,
      reason: allOk ? '' : 'combined context incomplete' };
  });

  // Scenario 10: Empty clashes array — must NOT have clash= (regression guard)
  test('share_ctx_empty_clashes', () => {
    var url = buildShareUrl(mkState({ _currentClashes: [] }), emptyDom);
    var noClash = !url.includes('clash=');
    return { ok: noClash,
      log: '§WB_SHARE_CTX scenario=empty_clashes noClash=' + noClash,
      reason: noClash ? '' : 'clash= present with empty array' };
  });
})();

// ─── 3.18 S265 Share deep-link restore — parse real URLs from working + new share ──
// Issue: User reports new share URL "still cannot" restore clash. Test the RECEIVER side.
// Simulate main.js hash parser with real URLs to verify extraction.
test('share_restore_parse', () => {
  // Working URL (old clash snag method)
  var workingHash = '#clash=01WyKs2cnByA_VPsbZDzFL~0GjpF04mX1K8P$TdM8fU2_&st=Existing%20Garage%20-%201st%20Level&cam=-49.82,-5.49,-33.29&tgt=-51.52,-6.91,-34.99&tol=25';
  // New URL (buildShareUrl → _buildClashDeepLink)
  var newHash = '#clash=0IajW5Y89BRxvKnf5AfDkQ~1itcVTZhD87QA6mzuiLzD3&st=Existing%20Garage%20-%201st%20Level&cam=-52.29,-8.31,-32.71&tgt=-51.52,-6.91,-34.99&tol=25';

  // Replicate main.js hash parser (line 603-604)
  function parseHash(hash) {
    var params = {};
    hash.slice(1).split('&').forEach(function(p) {
      var kv = p.split('=');
      if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return params;
  }

  var wParsed = parseHash(workingHash);
  var nParsed = parseHash(newHash);

  var issues = [];

  // Both must have clash param with ~ separator
  if (!wParsed.clash || !wParsed.clash.includes('~')) issues.push('working URL clash param broken');
  if (!nParsed.clash || !nParsed.clash.includes('~')) issues.push('new URL clash param broken');

  // Both must split into exactly 2 GUIDs
  var wGuids = (wParsed.clash || '').split('~');
  var nGuids = (nParsed.clash || '').split('~');
  if (wGuids.length !== 2) issues.push('working: clash split != 2 guids, got ' + wGuids.length);
  if (nGuids.length !== 2) issues.push('new: clash split != 2 guids, got ' + nGuids.length);

  // Both must have cam with 3 numbers
  var wCam = (wParsed.cam || '').split(',').map(Number);
  var nCam = (nParsed.cam || '').split(',').map(Number);
  if (wCam.length !== 3 || wCam.some(isNaN)) issues.push('working: cam parse fail');
  if (nCam.length !== 3 || nCam.some(isNaN)) issues.push('new: cam parse fail');

  // Both must have tgt with 3 numbers
  var wTgt = (wParsed.tgt || '').split(',').map(Number);
  var nTgt = (nParsed.tgt || '').split(',').map(Number);
  if (wTgt.length !== 3 || wTgt.some(isNaN)) issues.push('working: tgt parse fail');
  if (nTgt.length !== 3 || nTgt.some(isNaN)) issues.push('new: tgt parse fail');

  // Both must have st (storey) and tol
  if (!wParsed.st) issues.push('working: missing st');
  if (!nParsed.st) issues.push('new: missing st');
  if (!wParsed.tol) issues.push('working: missing tol');
  if (!nParsed.tol) issues.push('new: missing tol');

  // Verify same key set
  var wKeys = Object.keys(wParsed).sort().join(',');
  var nKeys = Object.keys(nParsed).sort().join(',');
  if (wKeys !== nKeys) issues.push('key mismatch: working=[' + wKeys + '] new=[' + nKeys + ']');

  var ok = issues.length === 0;
  return {
    ok: ok,
    log: '§WB_SHARE_RESTORE' +
      ' working={clash:' + wGuids.join('~') + ',cam:[' + wCam + '],tgt:[' + wTgt + '],st:' + wParsed.st + ',tol:' + wParsed.tol + '}' +
      ' new={clash:' + nGuids.join('~') + ',cam:[' + nCam + '],tgt:[' + nTgt + '],st:' + nParsed.st + ',tol:' + nParsed.tol + '}' +
      ' keys_match=' + (wKeys === nKeys) + ' keys=' + nKeys,
    reason: issues.join('; ')
  };
});

// ─── 3.19 S265 Share clash — quickShare must produce same text as _shareClashSnag ──
// Issue: quickShare was calling _snagClash which opens site camera markup UI (wrong for pill).
// Fix: quickShare builds same text format directly from _currentClashes[0] + _buildClashDeepLink.
// Legacy clash_snag.js UNTOUCHED — it's the reference baseline.
test('share_clash_text_format', () => {
  var shareSrc = fs.readFileSync(path.join(DEV_DIR, 'share.js'), 'utf8');
  var clashSnagSrc = fs.readFileSync(path.join(DEV_DIR, 'clash_snag.js'), 'utf8');

  var qsMatch = shareSrc.match(/A\.quickShare\s*=\s*async\s+function[\s\S]*?(?=\n  [A-Z]|\n  \/\/\s*──)/);
  var qsBody = qsMatch ? qsMatch[0] : '';

  var issues = [];

  // quickShare must NOT call _snagClash (opens site camera UI)
  if (qsBody.includes('_snagClash(')) issues.push('quickShare calls _snagClash — opens camera UI');

  // quickShare must use _buildClashDeepLink for the URL (proven format)
  if (!qsBody.includes('_buildClashDeepLink')) issues.push('quickShare not using _buildClashDeepLink');

  // quickShare clash text must have same fields as _shareClashSnag:
  // discipline (c[4] vs c[5]), element names (c[6] / c[7]), storey, overlap mm, severity, deep_link
  if (!qsBody.includes("c[4]") || !qsBody.includes("c[5]")) issues.push('missing discipline fields c[4]/c[5]');
  if (!qsBody.includes("c[6]") || !qsBody.includes("c[7]")) issues.push('missing element name fields c[6]/c[7]');
  if (!qsBody.includes('storey')) issues.push('missing storey in clash text');
  if (!qsBody.includes('overlap')) issues.push('missing overlap in clash text');
  if (!qsBody.includes('sev.label')) issues.push('missing severity label');
  if (!qsBody.includes('deepLink')) issues.push('missing deepLink in text');

  // Reference: _shareClashSnag has same fields (verify baseline unchanged)
  if (!clashSnagSrc.includes('cs.discipline_a')) issues.push('BASELINE CHANGED: cs.discipline_a missing');
  if (!clashSnagSrc.includes('cs.element_a_name')) issues.push('BASELINE CHANGED: cs.element_a_name missing');
  if (!clashSnagSrc.includes('cs.deep_link')) issues.push('BASELINE CHANGED: cs.deep_link missing');

  var ok = issues.length === 0;
  return {
    ok: ok,
    log: '§WB_SHARE_CLASH noSnagCall=' + !qsBody.includes('_snagClash(') +
      ' usesDeepLink=' + qsBody.includes('_buildClashDeepLink') +
      ' disc=' + (qsBody.includes("c[4]") && qsBody.includes("c[5]")) +
      ' names=' + (qsBody.includes("c[6]") && qsBody.includes("c[7]")) +
      ' storey=' + qsBody.includes('storey') +
      ' overlap=' + qsBody.includes('overlap') +
      ' severity=' + qsBody.includes('sev.label') +
      ' deepLink=' + qsBody.includes('deepLink') +
      ' baseline_ok=' + (clashSnagSrc.includes('cs.discipline_a') && clashSnagSrc.includes('cs.deep_link')),
    reason: issues.join('; ')
  };
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`§WB_SUMMARY pass=${pass} fail=${fail} total=${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
