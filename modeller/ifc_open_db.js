// ⚠ DO NOT REMOVE — P-X one converter, one DB format (prompts/DXF2BIM_ARCHITECT_REVIEW.md ### P-X SPEC — Witness: W-IFC-OPEN-ONE). Read the log after every run.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ifc_open_db.js — the ONE owner of "a raw .ifc opened in the Modeller → the building DB". The shared extractor (dxf2bim/ifc_extract_core.js, the converter every
// resident and every export uses) converts the file; then the residents' rule, MEASURED on all of them (P-X spec table): the element rows of IfcSpace and
// IfcOpeningElement are removed from the element tables, every discipline is kept (the ARC seed draws discipline='ARC' itself), meshes no element references
// are removed, every other table (spatial_structure, rel_fills_host, rel_aggregates …) stays as extracted. Nothing is derived here. Dual export: the browser
// worker (ifc_open_worker.js) and the Node witness run this same file. Log tag §IFC-OPEN-X.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IfcOpenDb = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DROP = ['IfcSpace', 'IfcOpeningElement'];
  // the extractor's tables keyed by an ELEMENT guid (elements_meta last: the others are matched against it)
  var ELEMENT_TABLES = ['element_transforms', 'element_instances', 'element_world_bbox', 'element_pset_common', 'element_type', 'door_operation', 'element_dxf2bim', 'elements_meta'];
  function has(db, t) { try { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0; } catch (e) { return false; } }
  function one(db, sql) { var r = db.exec(sql); return r.length ? r[0].values[0][0] : 0; }
  // residentRule(db, drop): in place on a sql.js Database the extractor wrote. drop defaults to DROP (a witness passes [] as its falsifier).
  function residentRule(db, drop) {
    drop = drop || DROP;
    var dropped = {}, meshesDropped = 0;
    drop.forEach(function (c) { dropped[c] = 0; });
    db.run('BEGIN');
    if (drop.length) {
      var inList = drop.map(function (c) { return "'" + String(c).replace(/'/g, "''") + "'"; }).join(',');
      var r = db.exec('SELECT ifc_class, count(*) FROM elements_meta WHERE ifc_class IN (' + inList + ') GROUP BY ifc_class');
      if (r.length) r[0].values.forEach(function (v) { dropped[v[0]] = v[1]; });
      db.run('CREATE TEMP TABLE _px_drop AS SELECT guid FROM elements_meta WHERE ifc_class IN (' + inList + ')');
      ELEMENT_TABLES.forEach(function (t) { if (has(db, t)) db.run('DELETE FROM "' + t + '" WHERE guid IN (SELECT guid FROM _px_drop)'); });
      db.run('DROP TABLE _px_drop');
    }
    if (has(db, 'component_geometries') && has(db, 'element_instances')) {
      db.run('DELETE FROM component_geometries WHERE geometry_hash NOT IN (SELECT geometry_hash FROM element_instances WHERE geometry_hash IS NOT NULL)');
      meshesDropped = db.getRowsModified();
    }
    db.run('COMMIT');
    return { dropped: dropped, meshesDropped: meshesDropped };
  }
  // open(ctx): ctx = { WebIFC, ifcApi (initialised), SQL, Core (IfcExtractCore), bytes (Uint8Array), name (file stem), log, drop }
  // → { db (sql.js Database, the building DB), total, kept, dropped, meshesDropped, psetRows, ms, line }
  async function open(ctx) {
    var t0 = Date.now(), log = ctx.log || function () {}, db = new ctx.SQL.Database();
    await ctx.Core.extractToDb({ WebIFC: ctx.WebIFC, ifcApi: ctx.ifcApi, ifcData: ctx.bytes, db: ctx.Core.sqljsDb(db), Buf: ctx.Core.browserBuf,
      buildingName: ctx.name, sourceName: ctx.name + '.ifc', log: log, progress: ctx.progress || function () {} });
    var total = one(db, 'SELECT count(*) FROM elements_meta'), r = residentRule(db, ctx.drop);
    var kept = one(db, 'SELECT count(*) FROM elements_meta'), psetRows = has(db, 'element_pset_common') ? one(db, 'SELECT count(*) FROM element_pset_common') : 0;
    var ms = Date.now() - t0;
    var line = '§IFC-OPEN-X file=' + ctx.name + '.ifc elements=' + total + ' kept=' + kept + ' dropped=' + JSON.stringify(r.dropped) + ' meshesDropped=' + r.meshesDropped + ' psetRows=' + psetRows + ' ms=' + ms;
    log(line);
    return { db: db, total: total, kept: kept, dropped: r.dropped, meshesDropped: r.meshesDropped, psetRows: psetRows, ms: ms, line: line };
  }
  return { DROP: DROP, ELEMENT_TABLES: ELEMENT_TABLES, residentRule: residentRule, open: open };
});
