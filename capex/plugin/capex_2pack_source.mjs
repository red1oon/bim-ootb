// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the GENERATION SOURCE of the CAPEX dashboard 2Pack (bim-ootb prompts/CAPEX_DASHBOARD.md §5.19; owner 2026-11-03: "Twin plugin bundle"). NODE ONLY, development time:
//   node erp/tools/gen_2pack.js capex/plugin/capex_2pack_source.mjs   → capex/plugin/capex_2pack/2Pack_<version>.zip (the ONE Pack Out engine, pipo_packgen.js → pipo_packout.js). READ the §PACKGEN lines.
// ONE source of truth: the statements ARE the legacy migration scripts (capex/legacy/migration/iD13/postgresql/*.sql — what legacy applies with psql), split by capex/tools/migration_apply.js,
//   in name order (SyncDB.sh), each as a legacy SQLStatement element (SQLStatementElementHandler: DBType ALL + statement). register_migration_script is NOT packed — it is the migration ledger,
//   not dictionary data; the twin's Pack In records the pack in AD_Package_Imp instead (PackInHandler.java:160-235). A released pack is immutable: new scripts = bump provides.version.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const here = path.dirname(fileURLToPath(import.meta.url)), MA = createRequire(import.meta.url)('../tools/migration_apply.js');
const DIR = path.join(here, '..', 'legacy', 'migration', 'iD13', 'postgresql');
const files = fs.readdirSync(DIR).filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
const elements = [];
files.forEach((f) => MA.split(fs.readFileSync(path.join(DIR, f), 'utf8')).filter((st) => !/^SELECT\s+register_migration_script\s*\(/i.test(st))
  .forEach((st, i) => elements.push({ key: f + '#' + i, table: 'SQLStatement', values: { dbType: 'ALL', statement: st } })));
export const manifest = {
  id: 'org.bimootb.capex',
  name: 'CAPEX Dashboard',
  version: '1.0.0',
  provides: { version: '1.0.0', date: '2026-11-03 00:00:00', updateDictionary: false, packsDir: 'capex_2pack',
    description: 'CAPEX dashboard as iDempiere Performance Analysis data (PA_MeasureCalc / PA_Measure / PA_Goal) from ' + files.join(', ') + ' (bim-ootb prompts/CAPEX_DASHBOARD.md §5.19)',
    elements }
};
