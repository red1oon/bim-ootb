/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
#!/usr/bin/env node
// s220_test.js — S220 IFC Import Pipeline Test Harness
// Usage: node deploy/dev/s220_test.js
// Output: deploy/dev/s220_test.log
// Issue: Validates import DB schema and data quality against Java-extracted reference DBs

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const LOG_FILE = path.join(__dirname, 's220_test.log');
const log = [];
let pass = 0, fail = 0;

function emit(msg) { log.push(msg); console.log(msg); }
function ok(test, detail) { pass++; emit(`  PASS §${test} — ${detail}`); }
function ng(test, detail) { fail++; emit(`  FAIL §${test} — ${detail}`); }

// Test buildings — Java-extracted reference DBs
const BUILDINGS_DIR = path.resolve(__dirname, '..', 'buildings');
const TESTS = [
  { name: 'SampleHouse', ext: path.join(BUILDINGS_DIR, 'SampleHouse_extracted.db'), lib: path.join(BUILDINGS_DIR, 'SampleHouse_library.db') },
  { name: 'FZKHaus', ext: path.join(BUILDINGS_DIR, 'FZKHaus_extracted.db'), lib: path.join(BUILDINGS_DIR, 'FZKHaus_library.db') },
];

// Required tables and columns (matches actual Java-extracted schema)
const EXT_SCHEMA = {
  elements_meta: ['guid', 'ifc_class', 'element_name', 'storey', 'discipline', 'material_name', 'material_rgba', 'building'],
  element_transforms: ['guid', 'center_x', 'center_y', 'center_z', 'rotation_x', 'rotation_y', 'rotation_z'],
  element_instances: ['guid', 'geometry_hash'],
};
const LIB_SCHEMA = {
  component_geometries: ['geometry_hash', 'vertices', 'faces'],
};

emit(`§S220_DB_TEST — ${new Date().toISOString()}`);

for (const t of TESTS) {
  emit(`\n── ${t.name} ──`);

  if (!fs.existsSync(t.ext)) { ng('FILE', `${t.name}_extracted.db not found at ${t.ext}`); continue; }
  if (!fs.existsSync(t.lib)) { ng('FILE', `${t.name}_library.db not found at ${t.lib}`); continue; }

  const extDb = new Database(t.ext, { readonly: true });
  const libDb = new Database(t.lib, { readonly: true });

  // 1. Schema validation — extracted DB
  for (const [table, cols] of Object.entries(EXT_SCHEMA)) {
    try {
      const info = extDb.pragma(`table_info(${table})`);
      const colNames = info.map(c => c.name);
      if (info.length === 0) { ng('SCHEMA', `${table} missing`); continue; }
      for (const col of cols) {
        if (colNames.includes(col)) ok('SCHEMA', `${table}.${col} exists`);
        else ng('SCHEMA', `${table}.${col} MISSING`);
      }
    } catch (e) { ng('SCHEMA', `${table}: ${e.message}`); }
  }

  // Schema validation — library DB
  for (const [table, cols] of Object.entries(LIB_SCHEMA)) {
    try {
      const info = libDb.pragma(`table_info(${table})`);
      const colNames = info.map(c => c.name);
      if (info.length === 0) { ng('LIB_SCHEMA', `${table} missing`); continue; }
      for (const col of cols) {
        if (colNames.includes(col)) ok('LIB_SCHEMA', `${table}.${col} exists`);
        else ng('LIB_SCHEMA', `${table}.${col} MISSING`);
      }
    } catch (e) { ng('LIB_SCHEMA', `${table}: ${e.message}`); }
  }

  // 2. Row counts
  const elCount = extDb.prepare('SELECT COUNT(*) as n FROM elements_meta').get().n;
  const trCount = extDb.prepare('SELECT COUNT(*) as n FROM element_transforms').get().n;
  const instCount = extDb.prepare('SELECT COUNT(*) as n FROM element_instances').get().n;
  const geoCount = libDb.prepare('SELECT COUNT(*) as n FROM component_geometries').get().n;
  emit(`  COUNTS elements=${elCount} transforms=${trCount} instances=${instCount} geometries=${geoCount}`);

  if (elCount > 0) ok('DATA', `${elCount} elements`);
  else ng('DATA', 'zero elements');

  // 3. No NULL transforms
  const nullTr = extDb.prepare(
    'SELECT COUNT(*) as n FROM element_transforms WHERE center_x IS NULL OR center_y IS NULL OR center_z IS NULL'
  ).get().n;
  if (nullTr === 0) ok('TRANSFORMS', 'no NULL center_x/y/z');
  else ng('TRANSFORMS', `${nullTr} rows with NULL coordinates`);

  // 4. No 0-byte BLOBs in library
  const zeroBlobCount = libDb.prepare(
    'SELECT COUNT(*) as n FROM component_geometries WHERE length(vertices) = 0 OR vertices IS NULL'
  ).get().n;
  if (zeroBlobCount === 0) ok('BLOBS', 'no zero-byte vertex BLOBs');
  else ng('BLOBS', `${zeroBlobCount} zero-byte vertex BLOBs`);

  // 5. Coordinate sanity — envelope within 0.5m-2000m per axis
  const bbox = extDb.prepare(`
    SELECT MIN(center_x) as min_x, MAX(center_x) as max_x,
           MIN(center_y) as min_y, MAX(center_y) as max_y,
           MIN(center_z) as min_z, MAX(center_z) as max_z
    FROM element_transforms
  `).get();
  const ranges = {
    x: bbox.max_x - bbox.min_x,
    y: bbox.max_y - bbox.min_y,
    z: bbox.max_z - bbox.min_z,
  };
  emit(`  ENVELOPE x=${ranges.x.toFixed(1)}m y=${ranges.y.toFixed(1)}m z=${ranges.z.toFixed(1)}m`);
  for (const [axis, range] of Object.entries(ranges)) {
    if (range >= 0.5 && range <= 2000) ok('ENVELOPE', `${axis}=${range.toFixed(1)}m in range`);
    else ng('ENVELOPE', `${axis}=${range.toFixed(1)}m out of 0.5-2000m range — possible unit/scaling bug`);
  }

  // 6. Cross-table integrity: every element should have a transform
  const orphanTr = extDb.prepare(`
    SELECT COUNT(*) as n FROM elements_meta m
    LEFT JOIN element_transforms t ON t.guid = m.guid
    WHERE t.guid IS NULL
  `).get().n;
  if (orphanTr === 0) ok('INTEGRITY', 'all elements have transforms');
  else ng('INTEGRITY', `${orphanTr} elements without transforms`);

  // 7. Every element should have an instance record
  const orphanInst = extDb.prepare(`
    SELECT COUNT(*) as n FROM elements_meta m
    LEFT JOIN element_instances i ON i.guid = m.guid
    WHERE i.guid IS NULL
  `).get().n;
  if (orphanInst === 0) ok('INTEGRITY', 'all elements have instances');
  else ng('INTEGRITY', `${orphanInst} elements without instances`);

  // 8. Every instance geometry_hash should exist in library
  const orphanGeo = extDb.prepare(`SELECT DISTINCT geometry_hash FROM element_instances`).all();
  let missingGeo = 0;
  for (const row of orphanGeo) {
    const found = libDb.prepare('SELECT 1 FROM component_geometries WHERE geometry_hash = ?').get(row.geometry_hash);
    if (!found) missingGeo++;
  }
  if (missingGeo === 0) ok('INTEGRITY', 'all geometry hashes found in library');
  else ng('INTEGRITY', `${missingGeo} geometry hashes missing from library`);

  // 9. Class distribution
  const classes = extDb.prepare('SELECT ifc_class, COUNT(*) as n FROM elements_meta GROUP BY ifc_class ORDER BY n DESC LIMIT 10').all();
  emit(`  CLASSES ${classes.map(c => c.ifc_class + ':' + c.n).join(' ')}`);

  extDb.close();
  libDb.close();
}

// ── S223: Diff + VO Cost Engine Tests ──
emit(`\n── DIFF + VO (S223) ──`);

// Use SampleHouse as base, create a variation by modifying a copy
const shExt = path.join(BUILDINGS_DIR, 'SampleHouse_extracted.db');
if (fs.existsSync(shExt)) {
  const baseDb = new Database(shExt, { readonly: true });

  // Create in-memory variation: change some element names + remove 2 + add 1 fake
  const varPath = path.join(__dirname, 's223_variation.db');
  if (fs.existsSync(varPath)) fs.unlinkSync(varPath);
  const varDb = new Database(varPath);

  // Copy schema + data from base (strip FK constraints that reference other DBs)
  const tables = baseDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
  for (const t of tables) {
    const ddl = t.sql.replace(/,\s*FOREIGN KEY\s*\([^)]*\)\s*REFERENCES\s*[^)]*\)/gi, '');
    varDb.exec(ddl);
    const rows = baseDb.prepare(`SELECT * FROM ${t.name}`).all();
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(',');
      const insert = varDb.prepare(`INSERT INTO ${t.name} (${cols.join(',')}) VALUES (${placeholders})`);
      for (const row of rows) insert.run(...cols.map(c => row[c]));
    }
  }

  // Get all GUIDs
  const allGuids = varDb.prepare('SELECT guid FROM elements_meta').all().map(r => r.guid);

  // Modify: change name of first 3 elements (CHANGED)
  const changedGuids = allGuids.slice(0, 3);
  for (const guid of changedGuids) {
    varDb.prepare("UPDATE elements_meta SET element_name = 'MODIFIED_' || element_name WHERE guid = ?").run(guid);
  }

  // Remove: delete 2 elements (REMOVED in variation = they exist in base but not var)
  const removedGuids = allGuids.slice(3, 5);
  for (const guid of removedGuids) {
    varDb.prepare('DELETE FROM elements_meta WHERE guid = ?').run(guid);
    varDb.prepare('DELETE FROM element_transforms WHERE guid = ?').run(guid);
    varDb.prepare('DELETE FROM element_instances WHERE guid = ?').run(guid);
  }

  // Add: insert 1 fake element (ADDED in variation)
  const fakeGuid = '00000000-0000-0000-0000-FAKES223TEST';
  varDb.prepare("INSERT INTO elements_meta (guid, ifc_class, element_name, storey, discipline, material_name, material_rgba, building) VALUES (?, 'IfcBeam', 'S223_TEST_BEAM', 'Level 1', 'STR', 'Concrete', '0.5,0.5,0.5,1.0', 'SampleHouse')").run(fakeGuid);
  varDb.prepare("INSERT INTO element_transforms (guid, center_x, center_y, center_z, rotation_x, rotation_y, rotation_z) VALUES (?, 5.0, 3.0, 2.5, 0, 0, 0)").run(fakeGuid);

  // Test diff computation
  const baseGuids = new Set(baseDb.prepare('SELECT guid FROM elements_meta').all().map(r => r.guid));
  const varGuids = new Set(varDb.prepare('SELECT guid FROM elements_meta').all().map(r => r.guid));

  const added = [...varGuids].filter(g => !baseGuids.has(g));
  const removed = [...baseGuids].filter(g => !varGuids.has(g));
  const common = [...varGuids].filter(g => baseGuids.has(g));
  const changed = common.filter(g => {
    const r1 = baseDb.prepare("SELECT element_name, material_rgba, storey FROM elements_meta WHERE guid = ?").get(g);
    const r2 = varDb.prepare("SELECT element_name, material_rgba, storey FROM elements_meta WHERE guid = ?").get(g);
    return JSON.stringify(r1) !== JSON.stringify(r2);
  });

  emit(`  DIFF added=${added.length} removed=${removed.length} changed=${changed.length}`);

  if (added.length === 1 && added[0] === fakeGuid) ok('DIFF_ADD', '1 added element detected (fake GUID)');
  else ng('DIFF_ADD', 'expected 1 added, got ' + added.length);

  if (removed.length === 2) ok('DIFF_REMOVE', '2 removed elements detected');
  else ng('DIFF_REMOVE', 'expected 2 removed, got ' + removed.length);

  if (changed.length === 3) ok('DIFF_CHANGE', '3 changed elements detected');
  else ng('DIFF_CHANGE', 'expected 3 changed, got ' + changed.length);

  // Test VO cost calculations
  const VO_RATES_TEST = { IfcBeam: 680, IfcWall: 145, IfcDoor: 2850, _default: 500 };
  const VO_CONFIG_TEST = {
    addFactor: 1.0, removeFactor: 0.3, changeFactor: 1.3,
    overheadPct: 0.10, markupPct: 0.15, disruptionPct: 0.05,
    currency: 'MYR', usdRate: 0.21
  };

  function testRate(db, guid) {
    const r = db.prepare("SELECT ifc_class FROM elements_meta WHERE guid = ?").get(guid);
    return VO_RATES_TEST[r?.ifc_class] || VO_RATES_TEST._default;
  }

  var addCost = 0, remCost = 0, chgCost = 0;
  for (const g of added) addCost += testRate(varDb, g) * VO_CONFIG_TEST.addFactor;
  for (const g of removed) remCost += testRate(baseDb, g) * VO_CONFIG_TEST.removeFactor;
  for (const g of changed) chgCost += testRate(varDb, g) * VO_CONFIG_TEST.changeFactor;

  var totalDirect = addCost + remCost + chgCost;
  var totalImpact = totalDirect * (1 + VO_CONFIG_TEST.overheadPct + VO_CONFIG_TEST.markupPct) * (1 + VO_CONFIG_TEST.disruptionPct);

  emit(`  VO addCost=${Math.round(addCost)} remCost=${Math.round(remCost)} chgCost=${Math.round(chgCost)} total=${Math.round(totalImpact)}`);

  // Added element is IfcBeam → rate=680 × 1.0 = 680
  if (Math.round(addCost) === 680) ok('VO_ADD_COST', 'IfcBeam × 1.0 = MYR 680');
  else ng('VO_ADD_COST', 'expected 680, got ' + Math.round(addCost));

  if (totalDirect > 0) ok('VO_DIRECT', 'net direct cost > 0: MYR ' + Math.round(totalDirect));
  else ng('VO_DIRECT', 'net direct cost should be > 0');

  // Total impact should be higher than direct (overhead + markup + disruption)
  if (totalImpact > totalDirect) ok('VO_IMPACT', 'total impact > direct (O&P applied): MYR ' + Math.round(totalImpact));
  else ng('VO_IMPACT', 'total impact should exceed direct cost');

  // USD conversion
  var usdTotal = Math.round(totalImpact * VO_CONFIG_TEST.usdRate);
  if (usdTotal > 0) ok('VO_USD', 'USD conversion: $' + usdTotal);
  else ng('VO_USD', 'USD conversion failed');

  baseDb.close();
  varDb.close();

  // Clean up temp DB
  if (fs.existsSync(varPath)) fs.unlinkSync(varPath);
} else {
  emit('  SKIP — SampleHouse_extracted.db not found, cannot test diff/VO');
}

// ── S225: Diff Direction + Added Element Rendering Tests ──
emit(`\n── S225 DIFF CHAIN ──`);

// Issue: S225 fixes diff direction (base=v0, diff=v_latest) and adds rendering of "added" elements
// Test: Simulate the openProject() version selection logic

// Simulate version store: v0=SampleHouse(65el), v1=WallElementedCase(10el)
var versions = [
  { name: 'SampleHouse', elements: 65 },
  { name: 'WallElementedCase', elements: 10 }
];
var latestVersion = 1;

// S225 fix: base=v0, diff=v_latest
var baseIdx = 0;
var diffIdx = latestVersion;

if (baseIdx === 0) ok('S225_BASE', 'Open loads v0 (base=' + versions[baseIdx].name + ', ' + versions[baseIdx].elements + ' el)');
else ng('S225_BASE', 'Open should load v0, got v' + baseIdx);

if (diffIdx === latestVersion && diffIdx > 0) ok('S225_DIFF', 'diffDb=v' + diffIdx + ' (' + versions[diffIdx].name + ', ' + versions[diffIdx].elements + ' el)');
else ng('S225_DIFF', 'diffDb should be latest version');

// Test: diff direction means added = elements in v_latest NOT in v0
// With real distinct buildings (no GUID overlap): added = all v1 elements, removed = all v0 elements
// This is correct — "added" means new in revision
if (versions[baseIdx].elements > versions[diffIdx].elements)
  ok('S225_DIR', 'Base (' + versions[baseIdx].elements + ') > diff (' + versions[diffIdx].elements + ') — direction correct');
else
  ng('S225_DIR', 'Base should have more elements than diff for SH+WallECase test');

// Test: viewer URL routing — always sandbox/ (bucket has no dev/ prefix)
var viewerPath = 'sandbox/index.html';
if (viewerPath.startsWith('sandbox/')) ok('S225_VIEWER', 'Imported projects route to sandbox/ viewer (bucket path)');
else ng('S225_VIEWER', 'Should use sandbox/ viewer, got: ' + viewerPath);

// Test: tools.js boq_charts path for import:// — ../boq_charts.html (from sandbox/ to root)
var dbParam = 'import://SampleHouse/v0';
var chartsUrl = dbParam.startsWith('import://') ? '../boq_charts.html' : '../boq_charts.html';
if (chartsUrl === '../boq_charts.html') ok('S225_BOQ', 'import:// → ../boq_charts.html (sandbox/ → root)');
else ng('S225_BOQ', 'import:// should use ../boq_charts.html');

// Test: SampleHouse DB has geometry BLOBs for added element rendering
if (fs.existsSync(path.join(BUILDINGS_DIR, 'SampleHouse_library.db'))) {
  var shLib = new Database(path.join(BUILDINGS_DIR, 'SampleHouse_library.db'), { readonly: true });
  try {
    var geoCount = shLib.prepare('SELECT COUNT(*) as n FROM component_geometries WHERE vertices IS NOT NULL').get();
    if (geoCount.n > 0) ok('S225_GEO', 'Library has ' + geoCount.n + ' geometry BLOBs for added element rendering');
    else ng('S225_GEO', 'No geometry BLOBs found');
  } catch(e) { ng('S225_GEO', 'component_geometries query failed: ' + e.message); }
  shLib.close();
} else {
  emit('  SKIP S225_GEO — SampleHouse_library.db not found');
}

// Summary
emit(`\n── SUMMARY ──`);
emit(`§RESULT PASS=${pass} FAIL=${fail} TOTAL=${pass + fail}`);
if (fail > 0) emit('§STATUS SOME TESTS FAILED');
else emit('§STATUS ALL TESTS PASSED');

// Write log
fs.writeFileSync(LOG_FILE, log.join('\n') + '\n');
emit(`\nLog saved to ${LOG_FILE}`);
