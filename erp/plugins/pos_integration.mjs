// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — pos_integration.mjs: the ERP-side POS integration plugin (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §9 + §11: "must be a plugin on the admin side under SystemAdmin role"; twin of the owner's
//   server-side posintegration plugin, ~/Projects/POSIntegration2). Witness: W-POS-SALES (erp/tests/witness_pos_sales.js). READ THE LOG: §POSS lines.
// WHAT IT STAGES (DICTIONARY DATA + one process class; the host has no code for any of it - AD-layer law):
//   - the SQL view I_POSSales: ONE row per sale (ticket key = DocumentNo) joining the till's I_Order lines to its I_Payment tenders, with the totals side by side (lines, tenders, LinesTotal, TendersTotal, Difference),
//     so the clerk sees a mismatch BEFORE importing. A sale whose key was re-sent shows once imported (Y) and once pending. Tenders with no lines show as a sale with Lines=0. Read-only, as every view in the twin.
//   - AD_Table (IsView=Y) + AD_Column + the window / tab / fields "Import POS Sale" (read-only), menu leaves under Data Import (163) for the window and for the process,
//   - AD_Process 9538001 "Import POS Sales" (+ AD_Process_Para) whose class (chunk pos_import_sales.mjs) unravels each ticket all-or-none through the LEGACY Import Orders and Import Payment,
//   - ACCESS: AD_Process_Access and AD_Window_Access for role 0 (System Administrator, where §11 puts the plugin) and role 102 (GardenWorld Admin: the head-office clerk of W-HQ-CLERK); NO other role (the till carries none of this).
// Start stages everything (manifest.dictionary through ctx.dict, refcounted) and creates the view; Stop removes the view and every row and the class. The base hash (seed + patches/ad_seed.db.sql + patches/mfg.sql) is untouched.
// Id band 9538001-9538999 (no seed row, no other bundle).
const NOW = '2026-10-28 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const T_ID = 9538001, W_ID = 9538001, TAB_ID = 9538001, P_ID = 9538001, M_WIN = 9538001, M_PROC = 9538002, TREE = 10, PARENT = 163, ROLES = [[0, 0], [102, 11]];   // [role, client of the access row]

// [column, label, AD_Reference_ID, length, flags]  (flags: K key, D displayed in the grid, B button -> the process)
const COLS = [
  ['I_POSSales_ID', 'POS Sale', 13, 22, 'K'], ['AD_Client_ID', 'Client', 19, 22, ''], ['AD_Org_ID', 'Organization', 19, 22, 'D'], ['IsActive', 'Active', 20, 1, ''],
  ['Created', 'Created', 16, 7, ''], ['CreatedBy', 'Created By', 11, 22, ''], ['Updated', 'Updated', 16, 7, ''], ['UpdatedBy', 'Updated By', 11, 22, ''],
  ['DocumentNo', 'Ticket No', 10, 30, 'D'], ['BPartnerValue', 'Business Partner Key', 10, 40, 'D'], ['DateOrdered', 'Date Ordered', 15, 7, 'D'],
  ['Lines', 'Lines', 11, 10, 'D'], ['Tenders', 'Tenders', 11, 10, 'D'], ['LinesTotal', 'Lines Total', 12, 22, 'D'], ['TendersTotal', 'Tenders Total', 12, 22, 'D'], ['Difference', 'Difference (Tenders - Lines)', 12, 22, 'D'],
  ['I_IsImported', 'Imported', 10, 1, 'D'], ['I_ErrorMsg', 'Import Error Message', 10, 2000, 'D'], ['C_Order_ID', 'Order', 19, 22, 'D'], ['Processing', 'Import POS Sales', 28, 1, 'DB']
];
const colId = (i) => 9538101 + i, fldId = (i) => 9538201 + i;

const column = (c, i) => Object.assign({ ad_column_id: colId(i), name: c[1], description: c[1], columnname: c[0], ad_table_id: T_ID, ad_reference_id: c[2], fieldlength: c[3], iskey: c[4].includes('K') ? 'Y' : 'N', isparent: 'N',
  ismandatory: 'N', isupdateable: 'N', isidentifier: c[0] === 'DocumentNo' ? 'Y' : 'N', seqno: c[0] === 'DocumentNo' ? 1 : 0, istranslated: 'N', isencrypted: 'N', isselectioncolumn: c[0] === 'DocumentNo' ? 'Y' : 'N', isalwaysupdateable: 'N',
  ad_process_id: c[4].includes('B') ? P_ID : null, version: 1 }, STD);
const field = (c, i) => Object.assign({ ad_field_id: fldId(i), name: c[1], description: c[1], iscentrallymaintained: 'N', ad_tab_id: TAB_ID, ad_column_id: colId(i), isdisplayed: c[4].includes('D') ? 'Y' : 'N', displaylength: Math.min(c[3], 60),
  isreadonly: 'Y', seqno: (i + 1) * 10, sortno: null, issameline: 'N', isheading: 'N', isfieldonly: 'N', isencrypted: 'N', isdisplayedgrid: c[4].includes('D') ? 'Y' : 'N', seqnogrid: (i + 1) * 10 }, STD);
const proc = Object.assign({ ad_process_id: P_ID, value: 'Import_POSSales', name: 'Import POS Sales', description: 'Import the till\'s sales: each ticket (I_Order lines + I_Payment tenders) becomes one completed order, its invoice and the receipts allocated to it - all or none per ticket',
  help: 'Runs the legacy Import Orders (206) and Import Payment (343) over ONE ticket at a time, DocAction Complete, linking the receipts to the order\'s invoice. A ticket whose tenders do not add up to its invoice, or whose order or receipts are refused, is left whole (nothing posted) with the reason in Import Error Message. Run it again after correcting the rows.',
  accesslevel: '3', isreport: 'N', isdirectprint: 'N', classname: 'org.kernel.pos.ImportPOSSales', statistic_count: 0, statistic_seconds: 0, isbetafunctionality: 'N', isserverprocess: 'N', showhelp: 'Y', allowmultipleexecution: 'Y' }, STD);
// [id, name, columnname, seq, ref, valrule, mandatory, length]
const PARA = [[9538011, 'Tenant', 'AD_Client_ID', 10, 19, 129, 'N', 10], [9538012, 'Organization', 'AD_Org_ID', 20, 19, 130, 'N', 10], [9538013, 'Bank Account', 'C_BankAccount_ID', 30, 19, null, 'Y', 10], [9538014, 'Ticket No (one ticket only)', 'DocumentNo', 40, 10, null, 'N', 30]]
  .map((r) => Object.assign({ ad_process_para_id: r[0], ad_process_id: P_ID, name: r[1], columnname: r[2], seqno: r[3], ad_reference_id: r[4], ad_val_rule_id: r[5], ismandatory: r[6], fieldlength: r[7], iscentrallymaintained: 'Y', isrange: 'N' }, STD));
const access = (kind, id, role, client) => { const r = Object.assign({ ad_role_id: role, isreadwrite: 'Y', ['ad_' + kind + '_id']: id, ['ad_' + kind + '_access_uu']: 'pos-integration-' + kind + '-' + role }, STD); r.ad_client_id = client; delete r.entitytype; return r; };
const menu = (id, name, desc, action, extra) => Object.assign({ ad_menu_id: id, name, description: desc, issummary: 'N', issotrx: 'Y', isreadonly: 'N', action, iscentrallymaintained: 'Y' }, extra, STD);
const node = (id, seq) => ({ ad_tree_id: TREE, node_id: id, parent_id: PARENT, seqno: seq, ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100 });

export const manifest = {
  id: 'org.kernel.pos-integration',
  name: 'POS integration (head office)',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  chunks: { hot: ['./pos_import_sales.mjs'] },
  dictionary: [
    { table: 'ad_table', idCol: 'ad_table_id', rows: [Object.assign({ ad_table_id: T_ID, name: 'Import POS Sale', description: 'One row per sale: the till\'s order lines joined to its tenders (a view)', tablename: 'I_POSSales', isview: 'Y', accesslevel: '2',
      ad_window_id: W_ID, isdeleteable: 'N', ishighvolume: 'N', ischangelog: 'N', replicationtype: 'L', isactive: 'Y', iscentrallymaintained: 'Y', issecurityenabled: 'N' }, STD)] },
    { table: 'ad_column', idCol: 'ad_column_id', rows: COLS.map(column) },
    { table: 'ad_window', idCol: 'ad_window_id', rows: [Object.assign({ ad_window_id: W_ID, name: 'Import POS Sale', description: 'The till\'s sales waiting to be imported: order lines and tenders side by side', windowtype: 'Q', issotrx: 'Y', isdefault: 'N', isbetafunctionality: 'N' }, STD)] },
    { table: 'ad_tab', idCol: 'ad_tab_id', rows: [Object.assign({ ad_tab_id: TAB_ID, name: 'POS Sale', description: 'One row per ticket key', ad_table_id: T_ID, ad_window_id: W_ID, seqno: 10, tablevel: 0, issinglerow: 'N', isinfotab: 'N', istranslationtab: 'N',
      isreadonly: 'Y', hastree: 'N', issorttab: 'N', isinsertrecord: 'N', orderbyclause: 'I_POSSales_ID' }, STD)] },
    { table: 'ad_field', idCol: 'ad_field_id', rows: COLS.map(field) },
    { table: 'ad_process', idCol: 'ad_process_id', rows: [proc] },
    { table: 'ad_process_para', idCol: 'ad_process_para_id', rows: PARA },
    { table: 'ad_menu', idCol: 'ad_menu_id', rows: [menu(M_WIN, 'Import POS Sale', 'The till\'s sales waiting to be imported', 'W', { ad_window_id: W_ID }), menu(M_PROC, 'Import POS Sales', 'Import the till\'s sales as orders, invoices and receipts', 'P', { ad_process_id: P_ID })] },
    { table: 'ad_treenodemm', idCol: 'node_id', rows: [node(M_WIN, 25), node(M_PROC, 26)] },
    { table: 'ad_window_access', idCol: 'ad_window_access_uu', rows: ROLES.map((r) => access('window', W_ID, r[0], r[1])) },
    { table: 'ad_process_access', idCol: 'ad_process_access_uu', rows: ROLES.map((r) => access('process', P_ID, r[0], r[1])) }
  ]
};

// I_POSSales: the one-liner SQL view of the owner's proposal (POS_PLUGIN_LOCAL_FIRST §9), SQLite dialect. A sale = (client, org, DocumentNo, imported-or-pending): a re-sent key is a second row, not a merge.
const CLS = (alias) => "(CASE WHEN " + alias + ".i_isimported = 'Y' THEN 'Y' ELSE 'N' END)";
const SAME_SALE = (p, g) => "p.documentno = " + g + ".documentno AND COALESCE(p.ad_client_id,0) = " + g + ".ad_client_id AND COALESCE(p.ad_org_id,0) = " + g + ".ad_org_id AND " + CLS('p') + " = " + g + ".imp";
export const VIEW_SQL =
  "CREATE VIEW i_possales AS " +
  "SELECT t.k AS i_possales_id, t.ad_client_id AS ad_client_id, t.ad_org_id AS ad_org_id, 'Y' AS isactive, t.created AS created, t.createdby AS createdby, t.updated AS updated, t.updatedby AS updatedby, " +
  "t.documentno AS documentno, t.bpartnervalue AS bpartnervalue, t.dateordered AS dateordered, t.lines AS lines, t.tenders AS tenders, t.linestotal AS linestotal, t.tenderstotal AS tenderstotal, " +
  "t.tenderstotal - t.linestotal AS difference, t.i_isimported AS i_isimported, t.i_errormsg AS i_errormsg, t.c_order_id AS c_order_id, 'N' AS processing " +
  "FROM (" +
    "SELECT g.k AS k, g.ad_client_id AS ad_client_id, g.ad_org_id AS ad_org_id, g.created AS created, g.createdby AS createdby, g.updated AS updated, g.updatedby AS updatedby, g.documentno AS documentno, " +
    "g.bpartnervalue AS bpartnervalue, g.dateordered AS dateordered, g.lines AS lines, " +
    "(SELECT COUNT(*) FROM i_payment p WHERE " + SAME_SALE('p', 'g') + ") AS tenders, g.linestotal AS linestotal, " +
    "COALESCE((SELECT SUM(p.payamt) FROM i_payment p WHERE " + SAME_SALE('p', 'g') + "), 0) AS tenderstotal, g.i_isimported AS i_isimported, g.i_errormsg AS i_errormsg, g.c_order_id AS c_order_id " +
    "FROM (SELECT MIN(o.i_order_id) AS k, COALESCE(o.ad_client_id,0) AS ad_client_id, COALESCE(o.ad_org_id,0) AS ad_org_id, MIN(o.created) AS created, MIN(o.createdby) AS createdby, MAX(o.updated) AS updated, MAX(o.updatedby) AS updatedby, " +
    "o.documentno AS documentno, MIN(o.bpartnervalue) AS bpartnervalue, MIN(o.dateordered) AS dateordered, COUNT(*) AS lines, SUM(COALESCE(o.qtyordered,0) * COALESCE(o.priceactual,0)) AS linestotal, " + CLS('o') + " AS imp, " +
    "CASE WHEN SUM(CASE WHEN o.i_isimported = 'E' THEN 1 ELSE 0 END) > 0 THEN 'E' WHEN " + CLS('o') + " = 'Y' THEN 'Y' ELSE 'N' END AS i_isimported, " +
    "MAX(CASE WHEN TRIM(COALESCE(o.i_errormsg,'')) <> '' THEN o.i_errormsg END) AS i_errormsg, MAX(o.c_order_id) AS c_order_id " +
    "FROM i_order o GROUP BY COALESCE(o.ad_client_id,0), COALESCE(o.ad_org_id,0), o.documentno, " + CLS('o') + ") g " +
    "UNION ALL " +
    "SELECT -MIN(p.i_payment_id), COALESCE(p.ad_client_id,0), COALESCE(p.ad_org_id,0), MIN(p.created), MIN(p.createdby), MAX(p.updated), MAX(p.updatedby), p.documentno, MIN(p.bpartnervalue), MIN(p.datetrx), 0, COUNT(*), 0, " +
    "COALESCE(SUM(p.payamt),0), CASE WHEN SUM(CASE WHEN p.i_isimported = 'E' THEN 1 ELSE 0 END) > 0 THEN 'E' WHEN " + CLS('p') + " = 'Y' THEN 'Y' ELSE 'N' END, " +
    "MAX(CASE WHEN TRIM(COALESCE(p.i_errormsg,'')) <> '' THEN p.i_errormsg END), NULL " +
    "FROM i_payment p WHERE NOT EXISTS (SELECT 1 FROM i_order o WHERE o.documentno = p.documentno AND COALESCE(o.ad_client_id,0) = COALESCE(p.ad_client_id,0) AND COALESCE(o.ad_org_id,0) = COALESCE(p.ad_org_id,0) AND " + CLS('o') + " = " + CLS('p') + ") " +
    "GROUP BY COALESCE(p.ad_client_id,0), COALESCE(p.ad_org_id,0), p.documentno, " + CLS('p') +
  ") t";

export async function activate(ctx) {
  const db = ctx.db;
  if (!db || typeof db.run !== 'function') throw new Error('pos-integration: the host injected no writable db (the view cannot be created)');
  try { db.run('DROP VIEW IF EXISTS i_possales'); db.run(VIEW_SQL); }
  catch (e) { try { db.run('DROP VIEW IF EXISTS i_possales'); } catch (e2) { /* best effort */ } throw e; }
  console.log('§POSS-PLUGIN start view=i_possales process=' + P_ID + ' roles=' + ROLES.map((r) => r[0]).join('/') + ' (dictionary staged by the host, refcounted)');
}
export async function deactivate(ctx) {
  try { ctx.db.run('DROP VIEW IF EXISTS i_possales'); } catch (e) { /* the view may already be gone */ }
  console.log('§POSS-PLUGIN stop view=i_possales dropped');
}
