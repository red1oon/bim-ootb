// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — ninja_migrate.mjs: the Ninja data-migration plugin (owner's org.red1.ninja MigrateExcelData, adopted 2026-11-09 for ALL data migration).
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §NINJA-DECISION + §NINJA-LOADER-SPEC — Witness: W-NINJA-MIGRATE (erp/tests/witness_ninja_migrate.js). READ THE LOG: §NINJA lines.
// WHAT IT STAGES (DICTIONARY DATA + one process class; the host has no code for it - AD-LAYER LAW): AD_Process 9540001 "Migrate Excel Data" whose class
//   (hot chunk ninja_migrate_process.mjs) loads a workbook - one sheet per AD table, row 1 = AD column names - through the model layer's PO save, all or nothing;
//   its four AD_Process_Para = exactly the four the Java prepare() reads; a menu leaf under Data Import (163); process access for role 0 (System Administrator)
//   and 102 (GardenWorld Admin). Not core (AD-LAYER LAW §6): it arrives as a plugin like any extra module. Stop removes every row and the class.
// Id band 9540001-9540999 (no seed row, no other bundle).
const NOW = '2026-11-09 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const P_ID = 9540001, M_PROC = 9540001, TREE = 10, PARENT = 163, ROLES = [[0, 0], [102, 11]];   // [role, client of the access row]

const proc = Object.assign({ ad_process_id: P_ID, value: 'Ninja_MigrateExcelData', name: 'Migrate Excel Data',
  description: 'Load a workbook into this tenant: one sheet per table (sheet name = table name), row 1 = column names, every row saved as a record - all or nothing',
  help: 'Each sheet is named after a table (a 2-character order prefix is dropped when Processed is ticked) and its first row names the columns. A column ending _ID is looked up by Name, or by another column written Column>OtherColumn (C_BP_Group_ID>IsDefault). Detail lines find their header by Document No. Every row is saved like a record entered in its window (defaults, checks, accounting rows). If any row is refused, nothing is saved and every refusal is listed. Tick Active to UPDATE existing rows instead (matched on the first two columns).',
  accesslevel: '3', isreport: 'N', isdirectprint: 'N', classname: 'org.idempiere.ninja.process.MigrateExcelData', statistic_count: 0, statistic_seconds: 0, isbetafunctionality: 'N',
  isserverprocess: 'N', showhelp: 'Y', allowmultipleexecution: 'N' }, STD);
// [id, name, columnname, seq, ref, mandatory, length] — the four parameters MigrateExcelData.prepare() reads (File_Directory, Processed, IsActive, WhereClause)
const PARA = [[9540011, 'File', 'File_Directory', 10, 38, 'Y', 255], [9540012, 'Sheet names carry a 2-character order prefix', 'Processed', 20, 20, 'N', 1],
  [9540013, 'Update existing rows (match on the first two columns)', 'IsActive', 30, 20, 'N', 1], [9540014, 'Where clause (update mode)', 'WhereClause', 40, 14, 'N', 2000]]
  .map((r) => Object.assign({ ad_process_para_id: r[0], ad_process_id: P_ID, name: r[1], columnname: r[2], seqno: r[3], ad_reference_id: r[4], ad_val_rule_id: null, ismandatory: r[5], fieldlength: r[6],
    iscentrallymaintained: 'N', isrange: 'N', defaultvalue: r[2] === 'Processed' ? 'Y' : r[2] === 'IsActive' ? 'N' : null }, STD));
const access = (id, role, client) => { const r = Object.assign({ ad_role_id: role, isreadwrite: 'Y', ad_process_id: id, ad_process_access_uu: 'ninja-migrate-process-' + role }, STD); r.ad_client_id = client; delete r.entitytype; return r; };
const menu = Object.assign({ ad_menu_id: M_PROC, name: 'Migrate Excel Data', description: 'Load a workbook (one sheet per table) into this tenant', issummary: 'N', issotrx: 'Y', isreadonly: 'N',
  action: 'P', ad_process_id: P_ID, iscentrallymaintained: 'Y' }, STD);
const node = { ad_tree_id: TREE, node_id: M_PROC, parent_id: PARENT, seqno: 27, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };

export const manifest = {
  id: 'org.idempiere.ninja.migrate',
  name: 'Ninja data migration (Migrate Excel Data)',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  chunks: { hot: ['./ninja_migrate_process.mjs'] },
  dictionary: [
    { table: 'ad_process', idCol: 'ad_process_id', rows: [proc] },
    { table: 'ad_process_para', idCol: 'ad_process_para_id', rows: PARA },
    { table: 'ad_menu', idCol: 'ad_menu_id', rows: [menu] },
    { table: 'ad_treenodemm', idCol: 'node_id', rows: [node] },
    { table: 'ad_process_access', idCol: 'ad_process_access_uu', rows: ROLES.map((r) => access(P_ID, r[0], r[1])) }
  ]
};

export async function activate() { console.log('§NINJA-PLUGIN start process=' + P_ID + ' class=' + proc.classname + ' roles=' + ROLES.map((r) => r[0]).join('/') + ' (dictionary staged by the host, refcounted)'); }
export async function deactivate() { console.log('§NINJA-PLUGIN stop process=' + P_ID); }
