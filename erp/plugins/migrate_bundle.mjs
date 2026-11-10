// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate_bundle.mjs: the plugin BUNDLE of a "Migrate from <source>" form, made from data. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §WIRE-SPEC
//   (it replaces the three near-identical 36-line bundles of odoo / sap / bc). A bundle stages DICTIONARY DATA only (the host has no code for it - AD-LAYER LAW): AD_Form (classname = the
//   descriptor the hot chunk registers with the generic form engine), a menu leaf under Data Import (163), AD_Form_Access for the login role (System Administrator, role 0); every
//   tenant's roles get theirs from the host (§PLUGIN-ROLE-ACCESS, plugin_registry.js). Id band per source (9542001 Odoo, 9543001 BC, 9544001 SAP, 9545001 iDempiere), no seed row.
const NOW = '2026-11-09 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const TREE = 10, PARENT = 163, ROLES = [[0, 0]];

// makeBundle({ id, name, version, formId, classname, tag, uu, seqno, beta, description, help, hot }) -> { manifest, activate, deactivate }
export function makeBundle(o) {
  const F_ID = o.formId;
  const form = Object.assign({ ad_form_id: F_ID, name: o.name, description: o.description, help: o.help, accesslevel: '3', classname: o.classname, isbetafunctionality: o.beta ? 'Y' : 'N' }, STD);
  const menu = Object.assign({ ad_menu_id: F_ID, name: o.name, description: o.menuDescription || o.description, issummary: 'N', issotrx: 'Y', isreadonly: 'N', action: 'X', ad_form_id: F_ID, iscentrallymaintained: 'Y' }, STD);
  const node = { ad_tree_id: TREE, node_id: F_ID, parent_id: PARENT, seqno: o.seqno, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 };
  const access = (role, client) => { const r = Object.assign({ ad_role_id: role, isreadwrite: 'Y', ad_form_id: F_ID, ad_form_access_uu: o.uu + '-migrate-form-' + role }, STD); r.ad_client_id = client; delete r.entitytype; return r; };
  return {
    manifest: { id: o.id, name: o.name, version: o.version || '1.0.0', engineVersion: '>=0.9.0', requires: {}, chunks: { hot: [o.hot] },
      dictionary: [{ table: 'ad_form', idCol: 'ad_form_id', rows: [form] }, { table: 'ad_menu', idCol: 'ad_menu_id', rows: [menu] }, { table: 'ad_treenodemm', idCol: 'node_id', rows: [node] },
        { table: 'ad_form_access', idCol: 'ad_form_access_uu', rows: ROLES.map((r) => access(r[0], r[1])) }] },
    activate: async () => { console.log('§' + o.tag + ' plugin start form=' + F_ID + ' class=' + o.classname + ' (dictionary staged by the host, refcounted)'); },
    deactivate: async () => { console.log('§' + o.tag + ' plugin stop form=' + F_ID); }
  };
}
