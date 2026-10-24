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

const args = process.argv.slice(2);
let ifcPath = null, outPath = null, discOverride = null, alsoPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ifc' && args[i+1]) ifcPath = args[++i];
  else if (args[i] === '-o' && args[i+1]) outPath = args[++i];
  else if (args[i] === '--disc' && args[i+1]) discOverride = args[++i];
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
  await Core.extractToDb({ WebIFC, ifcApi, ifcData, db, Buf: Buffer, discOverride,
    buildingName: path.basename(ifcPath, '.ifc').replace(/\.ifc$/i, ''), sourceName: path.basename(ifcPath),
    log: console.log, progress: m => process.stdout.write('\r  ' + m + '...') });
  if (alsoPath) {
    const edb = new Database(':memory:');
    await Core.extractToDb({ WebIFC, ifcApi, ifcData: new Uint8Array(fs.readFileSync(alsoPath)), db: edb, Buf: Buffer, discOverride,
      buildingName: path.basename(alsoPath, '.ifc'), sourceName: path.basename(alsoPath), log: () => {}, progress: () => {} });
    const qm = sql => db.prepare(sql).all(), qe = sql => edb.prepare(sql).all();
    Core.mergeElements(db, qm, qe, ['IfcColumn'], console.log);
    edb.close();
  }
  db.close();
  const fileSize = fs.statSync(outPath).size;
  console.log(`§DB_WRITTEN ${outPath} size=${(fileSize/1024/1024).toFixed(1)}MB`);
}

main().catch(e => { console.error('§FATAL', e.message); process.exit(1); });
