// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — odoo_migrate.mjs: the "Migrate from Odoo" plugin (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B4-SPEC + §B4-IMPL-SPEC — Witness: W-ODOO-FORM,
//   erp/tests/witness_odoo_form.js). READ THE LOG: §ODOO-FORM lines.
// WHAT IT STAGES (DICTIONARY DATA + one form descriptor; the host has no code for it — AD-LAYER LAW): AD_Form 9542001 "Migrate from Odoo" (classname org.kernel.odoo.MigrateFromOdoo)
//   drawn by the ONE generic form renderer; a menu leaf under Data Import (163); AD_Form_Access for role 0 (System Administrator) and 102 (GardenWorld Admin). The form
//   (hot chunk odoo_migrate_form.mjs) reads the export folder the user picks, asks the units, shows the summary from a dry run of the Ninja loader (AD_Process 9540001,
//   plugins/ninja_migrate.mjs — it must be started too), and on Process runs that same loader for real, all or nothing. Not core (AD-LAYER LAW §6): a plugin.
// Id band 9542001-9542999 (no seed row, no other bundle).
const NOW = '2026-11-09 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const F_ID = 9542001, M_ID = 9542001, TREE = 10, PARENT = 163, ROLES = [[0, 0]];   // the LOGIN role's row (MForm / MProcess afterSave: the System Administrator starts the plugin); every tenant's roles get theirs from the host (§PLUGIN-ROLE-ACCESS, plugin_registry.js)
const form = Object.assign({ ad_form_id: F_ID, name: 'Migrate from Odoo', description: 'Load the export of your Odoo (odoo_migration.xlsx + manifest.json) into this tenant',
  help: 'Pick the files the Odoo agent wrote (export.js). Answer which ERP unit each Odoo unit is. Read the summary: every sheet says how many rows will import and why any would be refused. Untick what you do not want (a sheet another one needs stays ticked). Process loads everything in one go, or nothing.',
  accesslevel: '3', classname: 'org.kernel.odoo.MigrateFromOdoo', isbetafunctionality: 'N' }, STD);
const menu = Object.assign({ ad_menu_id: M_ID, name: 'Migrate from Odoo', description: 'Load your Odoo export into this tenant', issummary: 'N', issotrx: 'Y', isreadonly: 'N',
  action: 'X', ad_form_id: F_ID, iscentrallymaintained: 'Y' }, STD);
const node = { ad_tree_id: TREE, node_id: M_ID, parent_id: PARENT, seqno: 28, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };
const access = (role, client) => { const r = Object.assign({ ad_role_id: role, isreadwrite: 'Y', ad_form_id: F_ID, ad_form_access_uu: 'odoo-migrate-form-' + role }, STD); r.ad_client_id = client; delete r.entitytype; return r; };

export const manifest = {
  id: 'org.kernel.odoo.migrate',
  name: 'Migrate from Odoo',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  chunks: { hot: ['./odoo_migrate_form.mjs'] },
  dictionary: [
    { table: 'ad_form', idCol: 'ad_form_id', rows: [form] },
    { table: 'ad_menu', idCol: 'ad_menu_id', rows: [menu] },
    { table: 'ad_treenodemm', idCol: 'node_id', rows: [node] },
    { table: 'ad_form_access', idCol: 'ad_form_access_uu', rows: ROLES.map((r) => access(r[0], r[1])) }
  ]
};
export async function activate() { console.log('§ODOO-FORM plugin start form=' + F_ID + ' class=' + form.classname + ' (dictionary staged by the host, refcounted)'); }
export async function deactivate() { console.log('§ODOO-FORM plugin stop form=' + F_ID); }
