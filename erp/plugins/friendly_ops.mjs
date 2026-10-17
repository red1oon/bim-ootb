// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// friendly_ops.mjs - the opt-in "friendly operations" lens (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15). Behaviour observed in Odoo 17 (an order carries its next
// actions as buttons on the record), written here from scratch over the host's own seams; no Odoo code. Installed = lens ON; stopped = the plain legacy twin.
// It names no table, window or form: every action is derived from the record on screen and the dictionary.
//   FO-M5 Save & Complete - while editing a document (the tab has a DocStatus): Save, then the same Complete the DocAction bar dispatches.
//   FO-M4 open a related form - on a saved record: every generic AD_Form with a menu leaf and a parameter named like this record's key opens with that key already chosen.
//   FO-M1 Preview - while editing a record whose model has an afterSave: what Save would write (the same Save chain, never committed).
//   FO-A1 Add <child tab> / Save & back - header: Save, open the child tab and its New in one gesture; child row: Save, back to the parent tab (tab seams only).
//   FO-A2 Next step - a completed document offers the follow-on dictionary process (Ship, Invoice) with its parameters taken from the record; descriptors below are data.
//   FO-B related counts - on a saved record: one button per Zoom Across destination, "<window> (<count>)", opening it exactly as Zoom Across does.

// §42 (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md): Ship / Invoice THE AD WAY - dictionary rows rendered by the host's one toolbar, no lens button. Same classnames as the verbatim ports
//   (InOutGenerate 118, InvoiceGenerate 119); the variants default their parameters from the Order (@Column@ = window context) and show only while the order has something left (@SQL= DisplayLogic).
const NOW = '2026-10-17 00:00:00';
const STD = { ad_client_id: 0, ad_org_id: 0, isactive: 'Y', created: NOW, createdby: 100, updated: NOW, updatedby: 100, entitytype: 'U' };
const P_SHIP = 53401, P_INV = 53402;
const proc = (id, value, name, description, classname) => Object.assign({ ad_process_id: id, value, name, description, accesslevel: '1', isreport: 'N', isdirectprint: 'N', classname, statistic_count: 0, statistic_seconds: 0,
  isbetafunctionality: 'N', isserverprocess: 'N', showhelp: 'Y', allowmultipleexecution: 'Y' }, STD);
// [id, process, name, columnname, seq, ref, refValue, valRule, mandatory, default]
const PARA = [[9534011, P_SHIP, 'Warehouse', 'M_Warehouse_ID', 10, 19, null, null, 'Y', '@M_Warehouse_ID@'], [9534012, P_SHIP, 'Business Partner', 'C_BPartner_ID', 20, 30, null, null, 'N', '@C_BPartner_ID@'],
  [9534013, P_SHIP, 'Document Action', 'DocAction', 50, 17, 135, 219, 'N', 'CO'], [9534014, P_SHIP, 'Consolidate to one Document', 'ConsolidateDocument', 60, 20, null, null, 'N', 'Y'],
  [9534021, P_INV, 'Organization', 'AD_Org_ID', 15, 18, 130, null, 'Y', '@AD_Org_ID@'], [9534022, P_INV, 'Order', 'C_Order_ID', 20, 19, null, 134, 'N', '@C_Order_ID@'],
  [9534023, P_INV, 'Document Action', 'DocAction', 40, 17, 135, 219, 'Y', 'CO'], [9534024, P_INV, 'Consolidate to one Document', 'ConsolidateDocument', 50, 20, null, null, 'N', 'Y']]
  .map((r) => Object.assign({ ad_process_para_id: r[0], ad_process_id: r[1], name: r[2], columnname: r[3], seqno: r[4], ad_reference_id: r[5], ad_reference_value_id: r[6], ad_val_rule_id: r[7], ismandatory: r[8],
    defaultvalue: r[9], fieldlength: 0, iscentrallymaintained: 'Y', isrange: 'N' }, STD));
const ACCESS = [P_SHIP, P_INV].flatMap((pid) => [102, 103, 200001].map((role) => { const r = Object.assign({ ad_process_id: pid, ad_role_id: role, isreadwrite: 'Y', ad_process_access_uu: 'fo-rows-' + pid + '-' + role }, STD); delete r.entitytype; return r; }));
const leftSql = (col) => '@SQL=SELECT 1 FROM C_Order o JOIN C_OrderLine ol ON ol.C_Order_ID=o.C_Order_ID WHERE o.C_Order_ID=@C_Order_ID:0@ AND o.DocStatus=\'CO\' AND ol.M_Product_ID IS NOT NULL AND ol.QtyOrdered<>ol.' + col;
const button = (id, comp, name, pid, seq, dl) => Object.assign({ ad_toolbarbutton_id: id, componentname: comp, name, action: 'W', ad_tab_id: 186, ad_process_id: pid, seqno: seq, displaylogic: dl,
  iscustomization: 'N', isadvancedbutton: 'N', isaddseparator: 'N', isshowmore: 'N' }, STD);

export const manifest = {
  id: 'org.kernel.friendly-ops',
  name: 'Friendly operations lens',
  version: '0.3.0',
  engineVersion: '>=0.9.0',
  requires: {},
  dictionary: [
    { table: 'ad_process', idCol: 'ad_process_id', rows: [proc(P_SHIP, 'FO_Order_Ship', 'Ship', 'Generate the shipment for this order', 'org.compiere.process.InOutGenerate'),
      proc(P_INV, 'FO_Order_Invoice', 'Invoice', 'Generate the invoice for this order', 'org.compiere.process.InvoiceGenerate')] },
    { table: 'ad_process_para', idCol: 'ad_process_para_id', rows: PARA },
    { table: 'ad_process_access', idCol: 'ad_process_access_uu', rows: ACCESS },
    { table: 'ad_toolbarbutton', idCol: 'ad_toolbarbutton_id', rows: [button(53431, 'FO_Order_Ship', 'Ship', P_SHIP, 20, leftSql('QtyDelivered')), button(53432, 'FO_Order_Invoice', 'Invoice', P_INV, 30, leftSql('QtyInvoiced'))] }
  ]
};

const BREAK = (typeof globalThis !== 'undefined' && globalThis.__FOPS_BREAK) || null;   // witness-only negative control (W-FRIENDLY-OPS F5)

// FO-A4 descriptor (Receive payment): DATA. Ship / Invoice are no longer here: they are dictionary rows (manifest.dictionary below, ERP_FRIENDLY_OPS_LENS.md §42).
const NEXT = [
  // a NEW record of another table with fields preset (a value starting '@' is read from the 'when' row, else from this record's column)
  { table: 'c_order', status: 'CO', id: 'pay', label: 'Receive payment', newTable: 'c_payment',
    preset: { AD_Org_ID: 'ad_org_id', C_BPartner_ID: 'c_bpartner_id', C_Invoice_ID: '@c_invoice_id' },
    when: "SELECT c_invoice_id FROM c_invoice WHERE c_order_id=:key AND docstatus='CO' AND ispaid='N' ORDER BY c_invoice_id LIMIT 1" }
];
function nextSteps(api) {
  if (!api.tab || api.keyVal == null || api.isNew || api.dirty) return [];
  const t = String(api.tab.tableName || '').toLowerCase(), st = String(api.val('docstatus') || '');
  return NEXT.filter((n) => n.table === t && n.status === st && api.exists(n.when));   // a step whose 'when' finds nothing (nothing left to ship / invoice / pay) is not offered
}

const lens = {
  actions(api) {
    const out = [];
    nextSteps(api).forEach((n) => out.push({ id: 'next:' + n.id, label: n.label, title: n.label + ' this document: runs the dictionary process with this record\'s values already set' }));
    if (api.editing && api.hasAfterSave && (api.isNew || api.dirty)) out.push({ id: 'preview', label: 'Preview', title: 'Show what Save will write, without saving' });
    return out;
  },
  run(actionId, api) {
    if (actionId === 'preview') return api.previewSave();
    const nx = /^next:(.+)$/.exec(actionId);
    if (nx) { const n = NEXT.find((x) => x.id === nx[1]); if (!n) return null; const wr = api.row(n.when) || {}; const pre = {}; Object.keys(n.preset).forEach((k) => { const v = n.preset[k]; pre[k] = v.charAt(0) === '@' ? wr[v.slice(1)] : api.val(v); });
      if (n.newTable) return api.openNew(n.newTable, BREAK === 'nopreset' ? {} : pre);
      return null; }
    return null;
  }
};

export async function activate(ctx) { if (!ctx.lens) throw new Error('host has no lens extension point'); ctx.lens.register('friendly-ops', lens); }
export async function deactivate() { /* ctx.lens registrations are owner-removed by the registry on stop */ }
