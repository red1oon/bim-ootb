// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bc_migrate.mjs: the "Migrate from Business Central" plugin, ALPHA (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC — Witness: W-BC-MIGRATE,
//   erp/tests/witness_bc_migrate.js). READ THE LOG: §BC lines.
// WHAT IT STAGES (DICTIONARY DATA + one form descriptor — AD-LAYER LAW): AD_Form 9543001 "Migrate from Business Central (alpha)" (classname org.kernel.bc.MigrateFromBC) drawn
//   by the ONE generic form renderer; a menu leaf under Data Import (163); AD_Form_Access for roles 0 and 102. The form (hot chunk bc_migrate_form.mjs) reads BC's own
//   configuration-package Excel file, converts it (bc_migrate_convert.mjs + bc_model.mjs, Microsoft's published table definitions) and hands the result to the "Migrate from
//   Odoo" plan / Ninja loader — so it needs plugins org.idempiere.ninja.migrate started (and loads plugins/odoo_migrate_form.mjs itself). Not core: a plugin.
// Id band 9543001-9543999 (no seed row, no other bundle).
const NOW = '2026-11-09 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const F_ID = 9543001, M_ID = 9543001, TREE = 10, PARENT = 163, ROLES = [[0, 0]];   // the LOGIN role's row (MForm / MProcess afterSave: the System Administrator starts the plugin); every tenant's roles get theirs from the host (§PLUGIN-ROLE-ACCESS, plugin_registry.js)
const form = Object.assign({ ad_form_id: F_ID, name: 'Migrate from Business Central (alpha)', description: "Load a Dynamics 365 Business Central configuration package (BC's Export to Excel) into this tenant",
  help: 'In Business Central: Configuration Packages → a package with the tables listed in the guide → Export to Excel. Pick that file here, set the cut-over date, answer the units, read the summary, Process. ALPHA: built from Microsoft\'s published table definitions; the alpha report says what your file held.',
  accesslevel: '3', classname: 'org.kernel.bc.MigrateFromBC', isbetafunctionality: 'Y' }, STD);
const menu = Object.assign({ ad_menu_id: M_ID, name: 'Migrate from Business Central (alpha)', description: 'Load a Business Central configuration package into this tenant', issummary: 'N', issotrx: 'Y', isreadonly: 'N',
  action: 'X', ad_form_id: F_ID, iscentrallymaintained: 'Y' }, STD);
const node = { ad_tree_id: TREE, node_id: M_ID, parent_id: PARENT, seqno: 29, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };
const access = (role, client) => { const r = Object.assign({ ad_role_id: role, isreadwrite: 'Y', ad_form_id: F_ID, ad_form_access_uu: 'bc-migrate-form-' + role }, STD); r.ad_client_id = client; delete r.entitytype; return r; };

export const manifest = {
  id: 'org.kernel.bc.migrate',
  name: 'Migrate from Business Central (alpha)',
  version: '0.1.0',
  engineVersion: '>=0.9.0',
  requires: {},
  chunks: { hot: ['./bc_migrate_form.mjs'] },
  dictionary: [
    { table: 'ad_form', idCol: 'ad_form_id', rows: [form] },
    { table: 'ad_menu', idCol: 'ad_menu_id', rows: [menu] },
    { table: 'ad_treenodemm', idCol: 'node_id', rows: [node] },
    { table: 'ad_form_access', idCol: 'ad_form_access_uu', rows: ROLES.map((r) => access(r[0], r[1])) }
  ]
};
export async function activate() { console.log('§BC-FORM plugin start form=' + F_ID + ' class=' + form.classname + ' (dictionary staged by the host, refcounted)'); }
export async function deactivate() { console.log('§BC-FORM plugin stop form=' + F_ID); }
