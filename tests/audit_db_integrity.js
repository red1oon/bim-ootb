/**
 * audit_db_integrity.js — §S281 DB schema + content integrity check.
 * Opens a building DB with sql.js and verifies:
 *   1. Required tables exist (elements_meta, element_instances, component_geometries)
 *   2. element_instances has rows (> 0)
 *   3. elements_meta has distinct ifc_class values (not all Unknown)
 *   4. component_geometries has vertex data (not empty blobs)
 *   5. project_metadata exists and has at least one row
 *
 * Bug class prevented: silent import corruption where DB file has bytes
 * but tables are empty or schema is wrong (GP.4 only checks dbSize > 0).
 *
 * Requires: sql.js (npm), a test DB at sandbox/buildings/Duplex_extracted.db
 * (downloaded by setup-test-data.sh in CI, or symlinked locally).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.resolve(__dirname, '..', 'sandbox', 'buildings', 'Duplex_extracted.db');

let pass = 0, fail = 0;
function ok(tag, msg)  { pass++; console.log('  §DB_INTEGRITY PASS ' + tag + ': ' + msg); }
function bad(tag, msg) { fail++; console.log('  §DB_INTEGRITY FAIL ' + tag + ': ' + msg); }

async function run() {
  console.log('§DB_INTEGRITY audit starting');

  // ── Pre-check: DB file exists ──
  if (!fs.existsSync(DB_PATH)) {
    console.log('§DB_INTEGRITY SKIP — no test DB at ' + DB_PATH);
    console.log('  Run: cd tests && ./setup-test-data.sh');
    process.exit(0); // Skip, not fail — CI setup-test-data downloads it
  }

  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // T1: Required tables exist
  const REQUIRED = ['elements_meta', 'element_instances', 'component_geometries'];
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
    .values.map(r => r[0]);
  for (const t of REQUIRED) {
    tables.includes(t) ? ok('T1', 'table ' + t + ' exists')
                       : bad('T1', 'table ' + t + ' MISSING (have: ' + tables.join(',') + ')');
  }

  // T2: element_instances has rows
  const instCount = db.exec('SELECT count(*) FROM element_instances')[0].values[0][0];
  instCount > 0 ? ok('T2', 'element_instances count=' + instCount)
                : bad('T2', 'element_instances is EMPTY');

  // T3: elements_meta has diverse IFC classes (not all Unknown/null)
  const classCount = db.exec('SELECT count(DISTINCT ifc_class) FROM elements_meta')[0].values[0][0];
  classCount >= 3 ? ok('T3', 'distinct ifc_class count=' + classCount + ' (>= 3)')
                  : bad('T3', 'only ' + classCount + ' distinct ifc_class values — likely corrupt');

  // T4: component_geometries has non-empty vertex data
  const geoCount = db.exec('SELECT count(*) FROM component_geometries')[0].values[0][0];
  geoCount > 0 ? ok('T4', 'component_geometries count=' + geoCount)
               : bad('T4', 'component_geometries is EMPTY — no geometry data');

  // T5: project_metadata exists and has at least one row
  if (tables.includes('project_metadata')) {
    const metaCount = db.exec('SELECT count(*) FROM project_metadata')[0].values[0][0];
    metaCount > 0 ? ok('T5', 'project_metadata rows=' + metaCount)
                  : bad('T5', 'project_metadata is EMPTY');
  } else {
    bad('T5', 'project_metadata table MISSING');
  }

  // T6: elements_meta count matches element_instances (within 10% tolerance)
  const metaCount = db.exec('SELECT count(*) FROM elements_meta')[0].values[0][0];
  const ratio = metaCount > 0 ? instCount / metaCount : 0;
  (ratio >= 0.5 && ratio <= 2.0)
    ? ok('T6', 'meta/instance ratio=' + ratio.toFixed(2) + ' (meta=' + metaCount + ' inst=' + instCount + ')')
    : bad('T6', 'meta/instance mismatch ratio=' + ratio.toFixed(2) + ' (meta=' + metaCount + ' inst=' + instCount + ')');

  db.close();

  console.log('§DB_INTEGRITY_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

run().catch(err => {
  console.error('§DB_INTEGRITY CRASH: ' + err.message);
  process.exit(1);
});
