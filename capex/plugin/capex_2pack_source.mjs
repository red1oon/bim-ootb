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
// which scripts each released pack carries (a released pack is immutable; a new script = a new version, applied after the earlier ones by Incremental2PackActivator)
export const PACKS = { '1.0.0': ['202611031900_CAPEX-R0.sql', '202611032000_CAPEX-G2.sql', '202611032100_CAPEX-G3.sql'], '1.0.1': ['202611032200_CAPEX-G4.sql'], '1.0.2': ['202611041000_CAPEX-G7.sql'], '1.0.3': ['202611111300_CAPEX-Q2-STAGES.sql', '202611111310_CAPEX-PROPOSED-MEASURES.sql'], '1.0.4': ['202611121000_CAPEX-S2-HEALTH-OVERDUE.sql', '202611121200_CAPEX-Q3-EAC-FLOATDIV.sql'], '1.0.5': ['202611121500_CAPEX-ENTITYTYPE-A.sql'], '1.0.6': ['202611131300_CAPEX-PAGE-MEASURES.sql'], '1.0.7': ['202611131500_CAPEX-RETIRE-FIXED-CURRENCY.sql'], '1.0.8': ['202611141000_CAPEX-FORECAST-PROJECTS.sql'] };
const VERSION = process.env.CAPEX_PACK || Object.keys(PACKS).sort().pop();   // default = the newest; CAPEX_PACK=1.0.0 re-generates an older one (gen_2pack must say "unchanged")
const files = PACKS[VERSION];
if (!files) throw new Error('no pack ' + VERSION);
const elements = [];
files.forEach((f) => MA.split(fs.readFileSync(path.join(DIR, f), 'utf8')).filter((st) => !/^SELECT\s+register_migration_script\s*\(/i.test(st))
  .forEach((st, i) => elements.push({ key: f + '#' + i, table: 'SQLStatement', values: { dbType: 'ALL', statement: st } })));
export const manifest = {
  id: 'org.bimootb.capex',
  name: 'CAPEX Dashboard',
  version: VERSION,
  provides: { version: VERSION, date: '2026-11-03 00:00:00', updateDictionary: false, packsDir: 'capex_2pack',
    description: 'CAPEX dashboard as iDempiere Performance Analysis data (PA_MeasureCalc / PA_Measure / PA_Goal) from ' + files.join(', ') + ' (bim-ootb prompts/CAPEX_DASHBOARD.md §5.19)',
    elements }
};
