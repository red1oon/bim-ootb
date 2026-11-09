// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_migrate.mjs: the "Migrate from SAP Business One" plugin, ALPHA (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC — Witness: W-SAP-MIGRATE,
//   erp/tests/witness_sap_migrate.js). READ THE LOG: §SAP lines.
// WHAT IT STAGES (DICTIONARY DATA + one form descriptor — AD-LAYER LAW): AD_Form 9544001 "Migrate from SAP Business One (alpha)" (classname org.kernel.sap.MigrateFromB1) drawn
//   by the ONE generic form renderer; a menu leaf under Data Import (163); AD_Form_Access for roles 0 and 102. The form (hot chunk sap_migrate_form.mjs) reads the sap_export.json
//   the SAP agent (erp/sap_agent/agent.js) wrote from the user's own Service Layer, converts it (sap_migrate_convert.mjs) and hands the result to the "Migrate from Odoo" plan /
//   Ninja loader — so it needs plugins org.idempiere.ninja.migrate started. Not core: a plugin.
// Id band 9544001-9544999 (no seed row, no other bundle).
const NOW = '2026-11-09 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const F_ID = 9544001, M_ID = 9544001, TREE = 10, PARENT = 163, ROLES = [[0, 0], [102, 11]];
const form = Object.assign({ ad_form_id: F_ID, name: 'Migrate from SAP Business One (alpha)', description: 'Load the master data the SAP Business One agent read from your Service Layer into this tenant',
  help: 'Run the SAP Business One agent (sap_agent.zip: node agent.js --url https://<server>:50000 --company <CompanyDB> --user <user>) on a machine that reaches your Service Layer. Pick the sap_export.json it wrote, set the cut-over date, answer the units, read the summary, Process. ALPHA, a proof of concept: the field names are checked against your own server; the alpha report says what your export held.',
  accesslevel: '3', classname: 'org.kernel.sap.MigrateFromB1', isbetafunctionality: 'Y' }, STD);
const menu = Object.assign({ ad_menu_id: M_ID, name: 'Migrate from SAP Business One (alpha)', description: 'Load an SAP Business One export into this tenant', issummary: 'N', issotrx: 'Y', isreadonly: 'N',
  action: 'X', ad_form_id: F_ID, iscentrallymaintained: 'Y' }, STD);
const node = { ad_tree_id: TREE, node_id: M_ID, parent_id: PARENT, seqno: 30, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };
const access = (role, client) => { const r = Object.assign({ ad_role_id: role, isreadwrite: 'Y', ad_form_id: F_ID, ad_form_access_uu: 'sap-migrate-form-' + role }, STD); r.ad_client_id = client; delete r.entitytype; return r; };

export const manifest = {
  id: 'org.kernel.sap.migrate',
  name: 'Migrate from SAP Business One (alpha)',
  version: '0.1.0',
  engineVersion: '>=0.9.0',
  requires: {},
  chunks: { hot: ['./sap_migrate_form.mjs'] },
  dictionary: [
    { table: 'ad_form', idCol: 'ad_form_id', rows: [form] },
    { table: 'ad_menu', idCol: 'ad_menu_id', rows: [menu] },
    { table: 'ad_treenodemm', idCol: 'node_id', rows: [node] },
    { table: 'ad_form_access', idCol: 'ad_form_access_uu', rows: ROLES.map((r) => access(r[0], r[1])) }
  ]
};
export async function activate() { console.log('§SAP-FORM plugin start form=' + F_ID + ' class=' + form.classname + ' (dictionary staged by the host, refcounted)'); }
export async function deactivate() { console.log('§SAP-FORM plugin stop form=' + F_ID); }
