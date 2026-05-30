/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Calls sql.js API (MIT, sql-js/sql.js) — loaded from CDN at runtime, not bundled here.
 * All code in this file is original work by the author:
 *   10-table schema design, geometry instancing via hash, BOM-based structure.
 */
// import_db_builder.js — Shared DB builder for IFC import
// Both landing2.html and import.js call buildImportDBs(SQL, data)
// Returns ONE database with all 4 tables (metadata + geometry).
// Geometry is instanced via geometry_hash — dedup preserved, one file to manage.
//
// Enterprise setup: For centralised library across projects, see
//   https://red1oon.github.io/BIMCompiler/BIM_Designer_Browser/
//   or contact the creator for consultation on shared component library setup.

function buildImportDBs(SQL, data) {
  var db = new SQL.Database();

  // S224: Use filename (without .ifc) as building name — IFC project name is often generic ("Project")
  var buildingName = (data.meta.filename || data.meta.name || 'Import').replace(/\.(ifc|dae|obj|glb|gltf|3ds|fbx|stl)$/i, '');

  // Project metadata
  db.run('CREATE TABLE IF NOT EXISTS project_metadata (key TEXT PRIMARY KEY, value TEXT)');
  db.run('INSERT INTO project_metadata VALUES (?,?),(?,?),(?,?),(?,?)',
    ['project_name', data.meta.name, 'import_date', new Date().toISOString(), 'building_name', buildingName, 'source_uri', data.meta.source_uri || '']);

  // Elements
  db.run('CREATE TABLE IF NOT EXISTS elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  db.run('CREATE TABLE IF NOT EXISTS element_instances (guid TEXT PRIMARY KEY, geometry_hash TEXT)');

  // Transaction wrapping — 10x+ speedup for large IFC imports (thousands of rows)
  db.run('BEGIN');

  var stmtEl = db.prepare('INSERT OR IGNORE INTO elements_meta VALUES (?,?,?,?,?,?,?,?)');
  for (var i = 0; i < data.elements.length; i++) {
    var el = data.elements[i];
    stmtEl.run([el.guid, el.ifcClass, el.name, el.storey, el.discipline, null, el.material, buildingName]);
  }
  stmtEl.free();

  var stmtTr = db.prepare('INSERT OR IGNORE INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (var i = 0; i < data.transforms.length; i++) {
    var t = data.transforms[i];
    stmtTr.run([t.guid, t.cx, t.cy, t.cz, t.rx, t.ry, t.rz, t.bx || null, t.by || null, t.bz || null]);
  }
  stmtTr.free();

  var stmtInst = db.prepare('INSERT OR IGNORE INTO element_instances VALUES (?,?)');
  for (var i = 0; i < data.geometries.length; i++) {
    stmtInst.run([data.geometries[i].guid, data.geometries[i].geomHash]);
  }
  stmtInst.free();

  // Geometry BLOBs — same DB, keyed by geometry_hash (instanced, deduped)
  db.run('CREATE TABLE IF NOT EXISTS component_geometries (geometry_hash TEXT PRIMARY KEY, vertices BLOB, faces BLOB, normals BLOB, building TEXT)');
  var stmtGeo = db.prepare('INSERT OR IGNORE INTO component_geometries VALUES (?,?,?,?,?)');
  for (var i = 0; i < data.geometries.length; i++) {
    var g = data.geometries[i];
    stmtGeo.run([g.geomHash, new Uint8Array(g.vertices), new Uint8Array(g.indices),
      g.normals ? new Uint8Array(g.normals) : null, buildingName]);
  }
  stmtGeo.free();

  // §S267: bom_tree — IFC parent→child relationships (IfcRelVoids/Fills/Aggregates)
  if (data.bomTree && data.bomTree.length > 0) {
    db.run('CREATE TABLE IF NOT EXISTS bom_tree (parent_guid TEXT NOT NULL, child_guid TEXT NOT NULL, rel_type TEXT NOT NULL, PRIMARY KEY (parent_guid, child_guid))');
    var stmtBom = db.prepare('INSERT OR IGNORE INTO bom_tree VALUES (?,?,?)');
    for (var bi = 0; bi < data.bomTree.length; bi++) {
      var bt = data.bomTree[bi];
      stmtBom.run([bt.parentGuid, bt.childGuid, bt.relType]);
    }
    stmtBom.free();
    console.log('[S267] §BOM_TREE_TABLE rows=' + data.bomTree.length);
  }

  // 4D_CAPTURE_AND_FALLBACK.md T1/T1b — native IFC 4D schedule (W-CAPTURE / W-VOCAB).
  // Widened DDL (§5.2): CPM dates, float, is_critical, WBS (wbs_parent+is_summary),
  // predefined_type, nullable resource (OUR template concept, captured=null), + a thin
  // calendars carrier. schedule_*/float fields are RAW ISO-8601 strings (verbatim, never
  // re-derived). Tables always created (empty if no programme) so Time Machine probes a
  // stable schema. The split-DB path below copies these into metaDb automatically.
  db.run('CREATE TABLE IF NOT EXISTS schedules (schedule_id TEXT PRIMARY KEY, name TEXT, status TEXT, created_date TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))');
  db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
  db.run('CREATE TABLE IF NOT EXISTS calendars (name TEXT, recurrence_type TEXT, raw TEXT)');

  var _schedId = (data.schedules && data.schedules[0] && data.schedules[0].id) || null;
  var _nSched = 0, _nTask = 0, _nSeq = 0, _nTE = 0, _nCal = 0;
  if (data.schedules && data.schedules.length) {
    var stmtSc = db.prepare('INSERT OR IGNORE INTO schedules VALUES (?,?,?,?)');
    for (var si = 0; si < data.schedules.length; si++) {
      var sc = data.schedules[si];
      stmtSc.run([sc.id, sc.name, sc.status, sc.created]); _nSched++;
    }
    stmtSc.free();
  }
  if (data.tasks && data.tasks.length) {
    // Column order matches the widened DDL above. resource is always null on capture (§5.2).
    var stmtTk = db.prepare('INSERT OR IGNORE INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (var ti2 = 0; ti2 < data.tasks.length; ti2++) {
      var tk = data.tasks[ti2];
      stmtTk.run([tk.id, _schedId, tk.wbsParent || null, tk.name, tk.predefinedType || null,
        (tk.isSummary != null ? tk.isSummary : 0), tk.scheduleStart || null, tk.scheduleFinish || null,
        tk.scheduleDuration || null, tk.earlyStart || null, tk.earlyFinish || null,
        tk.lateStart || null, tk.lateFinish || null, tk.freeFloat || null, tk.totalFloat || null,
        (tk.isCritical != null ? tk.isCritical : null), null, tk.status || null]); _nTask++;
    }
    stmtTk.free();
  }
  if (data.taskSequences && data.taskSequences.length) {
    var stmtSq = db.prepare('INSERT OR IGNORE INTO task_sequences VALUES (?,?,?,?)');
    for (var qi = 0; qi < data.taskSequences.length; qi++) {
      var sq = data.taskSequences[qi];
      stmtSq.run([sq.predId, sq.succId, sq.type, sq.lag]); _nSeq++;
    }
    stmtSq.free();
  }
  if (data.taskElements && data.taskElements.length) {
    var stmtTe = db.prepare('INSERT OR IGNORE INTO task_elements VALUES (?,?)');
    for (var tei = 0; tei < data.taskElements.length; tei++) {
      var te = data.taskElements[tei];
      stmtTe.run([te.taskId, te.guid]); _nTE++;
    }
    stmtTe.free();
  }
  if (data.calendars && data.calendars.length) {
    var stmtCal = db.prepare('INSERT INTO calendars VALUES (?,?,?)');
    for (var cli = 0; cli < data.calendars.length; cli++) {
      var cal = data.calendars[cli];
      stmtCal.run([cal.name || null, cal.recurrenceType || null, cal.raw || null]); _nCal++;
    }
    stmtCal.free();
  }
  console.log('[4D] §4D_TABLES schedules=' + _nSched + ' tasks=' + _nTask + ' sequences=' + _nSeq + ' taskElements=' + _nTE + ' calendars=' + _nCal);

  db.run('COMMIT');

  console.log('[S220] §DB_BUILD single_db: elements=' + data.elements.length + ' transforms=' + data.transforms.length + ' instances=' + data.geometries.length + ' geometries=' + data.geometries.length);
  console.log('[S220] §DB_EXPORT_START — serializing DB (may take a few seconds for large buildings)...');

  var buf = db.export().buffer;
  console.log('[S220] §DB_EXPORT_DONE size=' + (buf.byteLength / 1024 / 1024).toFixed(1) + 'MB');

  // §S260c: Post-export validation — verify DB is usable before handing off
  try {
    var checkDb = new SQL.Database(new Uint8Array(buf));
    var check = checkDb.exec("SELECT COUNT(*) FROM elements_meta");
    var checkCount = (check.length && check[0].values.length) ? check[0].values[0][0] : 0;
    checkDb.close();
    if (checkCount === 0) {
      console.error('[S220] §DB_EXPORT_FAIL — exported DB has 0 elements_meta rows');
    } else {
      console.log('[S220] §DB_EXPORT_VALID rows=' + checkCount);
    }
  } catch(e) {
    console.error('[S220] §DB_EXPORT_CORRUPT — exported DB failed validation: ' + e.message);
  }

  // S260c: Split DB for large buildings (>15K elements) — produces meta + geo for OCI deployment
  // 15K threshold: ensures split files are generated for buildings that benefit from streaming.
  var metaDb = null, geoDb = null;
  if (data.elements.length > 15000) {
    // ── metaDb: everything EXCEPT geometry BLOBs ──
    var mDb = new SQL.Database();
    // Copy schema + data for non-geometry tables
    var allTables = db.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT IN ('component_geometries','base_geometries')");
    if (allTables.length > 0) {
      for (var ti = 0; ti < allTables[0].values.length; ti++) {
        var tName = allTables[0].values[ti][0];
        var tSql = allTables[0].values[ti][1];
        mDb.run(tSql);
        // Copy rows
        var rows = db.exec('SELECT * FROM ' + tName);
        if (rows.length > 0 && rows[0].values.length > 0) {
          var cols = rows[0].columns;
          var placeholders = cols.map(function() { return '?'; }).join(',');
          var insertSql = 'INSERT INTO ' + tName + ' VALUES (' + placeholders + ')';
          mDb.run('BEGIN');
          var mStmt = mDb.prepare(insertSql);
          for (var ri = 0; ri < rows[0].values.length; ri++) {
            mStmt.run(rows[0].values[ri]);
          }
          mStmt.free();
          mDb.run('COMMIT');
        }
      }
    }
    // Note: ifc_properties (if exists) is already included via the allTables query above
    // since it is NOT in the exclusion list (component_geometries, base_geometries)
    metaDb = mDb.export().buffer;
    mDb.close();

    // ── geoDb: ONLY geometry tables ──
    var gDb = new SQL.Database();
    var geoTables = db.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('component_geometries','base_geometries')");
    if (geoTables.length > 0) {
      for (var gi = 0; gi < geoTables[0].values.length; gi++) {
        var gName = geoTables[0].values[gi][0];
        var gSql = geoTables[0].values[gi][1];
        gDb.run(gSql);
        var gRows = db.exec('SELECT * FROM ' + gName);
        if (gRows.length > 0 && gRows[0].values.length > 0) {
          var gCols = gRows[0].columns;
          var gPh = gCols.map(function() { return '?'; }).join(',');
          gDb.run('BEGIN');
          var gStmt = gDb.prepare('INSERT INTO ' + gName + ' VALUES (' + gPh + ')');
          for (var ri = 0; ri < gRows[0].values.length; ri++) {
            gStmt.run(gRows[0].values[ri]);
          }
          gStmt.free();
          gDb.run('COMMIT');
        }
      }
    }
    geoDb = gDb.export().buffer;
    gDb.close();

    var metaSize = (metaDb.byteLength / 1024 / 1024).toFixed(1);
    var geoSize = (geoDb.byteLength / 1024 / 1024).toFixed(1);
    console.log('[S260b] §DB_SPLIT elements=' + data.elements.length + ' meta=' + metaSize + 'MB geo=' + geoSize + 'MB');
  }

  db.close();

  var result = { extractedDb: buf, libraryDb: buf };
  if (metaDb) result.metaDb = metaDb;
  if (geoDb) result.geoDb = geoDb;
  return result;
}
