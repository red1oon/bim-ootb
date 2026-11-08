#!/usr/bin/env node
/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * extract_ifc2db.js — the in-repo copy of bim-compiler's scripts/extractIFC2DB.js, over THIS repo's core (modeller/dxf2bim/ifc_extract_core.js, the one the Modeller
 * and the Viewer-database export run; it writes tables the older bim-compiler core does not, e.g. element_dxf2bim). Witnesses that judge the product's own output use this one (2026-10-24).
 *
 * Usage:
 *   node modeller/tools/extract_ifc2db.js --ifc path/to/file.ifc -o output.db
 *
 * Output: Single SQLite DB with all tables (same as browser Drop IFC save).
 * Viewer loads it as both extDb and libDb (same buffer, same as import_db_builder.js).
 */
const fs = require('fs');
const path = require('path');
const WebIFC = require('web-ifc');
const Database = require('better-sqlite3');
const { Buffer } = require('buffer');
const Core = require('../dxf2bim/ifc_extract_core.js');
const GridRead = require('../../common/ifc_grid_read.js'), GeorefFrame = require('../../common/georef_frame.js');

const args = process.argv.slice(2);
let ifcPath = null, outPath = null, discOverride = null, alsoPath = null, federatePath = null, federateDisc = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ifc' && args[i+1]) ifcPath = args[++i];
  else if (args[i] === '-o' && args[i+1]) outPath = args[++i];
  else if (args[i] === '--disc' && args[i+1]) discOverride = args[++i];
  else if (args[i] === '--federate' && args[i+1]) federatePath = args[++i];   // §1a: a second IFC contributes ALL its elements, its own disciplines, one frame
  else if (args[i] === '--federate-disc' && args[i+1]) federateDisc = args[++i].toUpperCase();   // §1a: the SECOND file's stated discipline (never taken from --disc)
  else if (args[i] === '--also' && args[i+1]) alsoPath = args[++i];   // §L5.8: a second IFC contributes only its columns (grid evidence)
}
if (!ifcPath || !outPath) {
  console.error('Usage: node modeller/tools/extract_ifc2db.js --ifc <file.ifc> -o <output.db> [--disc HEAT]');
  process.exit(1);
}
const VALID_DISCS = ['ARC','STR','MEP','PLB','ACMV','ELEC','FP','VENT','HEAT','SAN','COOL','VOID','AIR','DUCT','HVAC','MECH','FIRE','SPR','GAS','LIFT','CONV','CIV','LAND','EXT','INT','CEIL','ROOF','SITE','DEMO'];
if (discOverride && !VALID_DISCS.includes(discOverride.toUpperCase())) {
  console.error(`Invalid --disc "${discOverride}". Valid: ${VALID_DISCS.join(', ')}`);
  process.exit(1);
}
if (discOverride) discOverride = discOverride.toUpperCase();
if (!fs.existsSync(ifcPath)) {
  console.error(`IFC file not found: ${ifcPath}`);
  process.exit(1);
}


async function main() {
  const ifcData = new Uint8Array(fs.readFileSync(ifcPath));
  const ifcApi = new WebIFC.IfcAPI();
  await ifcApi.Init();
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  const db = new Database(outPath);
  const fedCtx = federatePath ? { GridRead, GeorefFrame } : {};   // §1a: the grid reader is handed in, not looked up as a global (node has none); --also callers are unchanged
  const ex0 = await Core.extractToDb({ WebIFC, ifcApi, ifcData, db, Buf: Buffer, discOverride, ...fedCtx,
    buildingName: path.basename(ifcPath, '.ifc').replace(/\.ifc$/i, ''), sourceName: path.basename(ifcPath),
    log: console.log, progress: m => process.stdout.write('\r  ' + m + '...') });
  if (alsoPath) {
    const edb = new Database(':memory:');
    await Core.extractToDb({ WebIFC, ifcApi, ifcData: new Uint8Array(fs.readFileSync(alsoPath)), db: edb, Buf: Buffer, discOverride, forceGeorefOffset: ex0 && ex0.georefOffset,   // §ONE-FRAME: --also shares the first file's pin
      buildingName: path.basename(alsoPath, '.ifc'), sourceName: path.basename(alsoPath), log: () => {}, progress: () => {} });
    const qm = sql => db.prepare(sql).all(), qe = sql => edb.prepare(sql).all();
    Core.mergeElements(db, qm, qe, ['IfcColumn'], console.log);
    edb.close();
  }
  if (federatePath) {
    const edb = new Database(':memory:');
    // the second file keeps ITS disciplines (no --disc), and is pinned by the first file's offset (the core's GeorefFrame.pinInput rule, forceGeorefOffset passed through)
    await Core.extractToDb({ WebIFC, ifcApi, ifcData: new Uint8Array(fs.readFileSync(federatePath)), db: edb, Buf: Buffer, GridRead, GeorefFrame, discOverride: federateDisc || undefined, forceGeorefOffset: ex0 && ex0.georefOffset,
      buildingName: path.basename(federatePath, '.ifc'), sourceName: path.basename(federatePath), log: () => {}, progress: () => {} });
    const qm = sql => db.prepare(sql).all(), qe = sql => edb.prepare(sql).all();
    const n = Core.mergeElements(db, qm, qe, '*', console.log);
    const has = (d, t) => d.prepare("SELECT 1 x FROM sqlite_master WHERE name=?").get(t);
    let axes = 0, spaces = 0;
    if (has(edb, 'ifc_grid_axis')) {
      if (!has(db, 'ifc_grid_axis')) db.exec(GridRead.DDL);
      const ins = db.prepare('INSERT INTO ifc_grid_axis VALUES (?,?,?,?,?,?,?,?,?,?)');
      for (const r of qe('SELECT * FROM ifc_grid_axis')) { ins.run(r.grid_guid, r.grid_name, r.storey, r.axis_guid, r.tag, r.x0, r.y0, r.x1, r.y1, r.axis_set); axes++; }
    }
    if (has(edb, 'ifc_spaces')) {
      if (!has(db, 'ifc_spaces')) db.exec(edb.prepare("SELECT sql FROM sqlite_master WHERE name='ifc_spaces'").get().sql);
      const rows = qe('SELECT * FROM ifc_spaces'), cols = rows.length ? Object.keys(rows[0]) : [];
      const ins = rows.length ? db.prepare(`INSERT OR IGNORE INTO ifc_spaces (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`) : null;
      rows.forEach(r => { ins.run(...cols.map(c => r[c])); spaces++; });
    }
    const byDisc = {}; qe('SELECT discipline d, count(*) n FROM elements_meta GROUP BY 1').forEach(r => { byDisc[r.d] = r.n; });
    const off = (db.prepare("SELECT value FROM project_metadata WHERE key LIKE 'georef_offset_%' ORDER BY key").all() || []).map(r => r.value);
    console.log(`§FEDERATE second=${path.basename(federatePath)} merged=${n} classes=${qe('SELECT count(DISTINCT ifc_class) n FROM elements_meta')[0].n} byDisc=${JSON.stringify(byDisc)} grid_axes=${axes} spaces=${spaces} offset=(${(ex0 && ex0.georefOffset || [0, 0, 0]).join(',')}) georef_offset_rows=${off.length}`);
    edb.close();
  }
  db.close();
  const fileSize = fs.statSync(outPath).size;
  console.log(`§DB_WRITTEN ${outPath} size=${(fileSize/1024/1024).toFixed(1)}MB`);
}

main().catch(e => { console.error('§FATAL', e.message); process.exit(1); });
