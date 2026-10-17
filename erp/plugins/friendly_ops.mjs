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
export const manifest = {
  id: 'org.kernel.friendly-ops',
  name: 'Friendly operations lens',
  version: '0.2.0',
  engineVersion: '>=0.9.0',
  requires: {}
};

const BREAK = (typeof globalThis !== 'undefined' && globalThis.__FOPS_BREAK) || null;   // witness-only negative control (W-FRIENDLY-OPS F5)

// FO-A2 descriptors: DATA, resolved against the dictionary at run time (process by classname, parameters from the record's columns, applicability by a query on the record).
const NEXT = [
  { table: 'c_order', status: 'CO', id: 'ship', label: 'Ship', class: 'org.compiere.process.InOutGenerate',
    preset: { M_Warehouse_ID: 'm_warehouse_id', C_BPartner_ID: 'c_bpartner_id' },
    when: "SELECT 1 FROM c_orderline WHERE c_order_id=:key AND qtyordered<>qtydelivered AND m_product_id IS NOT NULL" },
  { table: 'c_order', status: 'CO', id: 'invoice', label: 'Invoice', class: 'org.compiere.process.InvoiceGenerate',
    preset: { AD_Org_ID: 'ad_org_id', C_Order_ID: 'c_order_id' },
    when: "SELECT 1 FROM c_orderline WHERE c_order_id=:key AND qtyordered<>qtyinvoiced" },
  // FO-A4: a NEW record of another table with fields preset (a value starting '@' is read from the 'when' row, else from this record's column)
  { table: 'c_order', status: 'CO', id: 'pay', label: 'Receive payment', newTable: 'c_payment',
    preset: { AD_Org_ID: 'ad_org_id', C_BPartner_ID: 'c_bpartner_id', C_Invoice_ID: '@c_invoice_id' },
    when: "SELECT c_invoice_id FROM c_invoice WHERE c_order_id=:key AND docstatus='CO' AND ispaid='N' ORDER BY c_invoice_id LIMIT 1" }
];
function nextSteps(api) {
  if (!api.tab || api.keyVal == null || api.isNew || api.dirty) return [];
  const t = String(api.tab.tableName || '').toLowerCase(), st = String(api.val('docstatus') || '');
  return NEXT.filter((n) => n.table === t && n.status === st && api.exists(n.when));   // a step whose 'when' finds nothing (nothing left to ship / invoice / pay) is not offered
}

function relatedForms(api) {
  if (!api.keyCol || api.keyVal == null || api.isNew) return [];
  const k = String(api.keyCol).toLowerCase();
  return api.forms().map((f) => ({ f, p: f.params.find((n) => String(n).toLowerCase() === k) })).filter((x) => x.p);
}

const lens = {
  actions(api) {
    const out = [];
    nextSteps(api).forEach((n) => out.push({ id: 'next:' + n.id, label: n.label, title: n.label + ' this document: runs the dictionary process with this record\'s values already set' }));
    if (api.editing && api.hasAfterSave && (api.isNew || api.dirty)) out.push({ id: 'preview', label: 'Preview', title: 'Show what Save will write, without saving' });
    if (api.editing && api.hasDocFsm && (api.isNew || api.legal.indexOf('CO') >= 0)) out.push({ id: 'save-complete', label: 'Save & Complete', title: 'Save this document, then Complete it (the same Save and Complete as the toolbar and the action bar)' });
    if (api.editing || api.keyVal != null) api.childTabs().forEach((c) => out.push({ id: 'add:' + c.idx, label: 'Add ' + c.name, title: 'Save this record, then open a new ' + c.name + ' row (one step instead of Save, tab, New)' }));
    const pt = api.level > 0 && api.editing ? api.parentTab() : null;
    if (pt) out.push({ id: 'back:' + pt.idx, label: 'Save & back to ' + pt.name, title: 'Save this row and return to ' + pt.name });
    relatedForms(api).forEach(({ f }) => out.push({ id: 'form:' + f.formId, label: f.name, title: 'Open ' + f.name + ' for this record' }));
    if (!api.isNew) api.related().forEach((d) => out.push({ id: 'rel:' + d.windowId + ':' + d.table, label: d.name + ' (' + d.count + ')', title: d.count + ' ' + d.name + ' record(s) for this one' }));
    return out;
  },
  run(actionId, api) {
    if (actionId === 'preview') return api.previewSave();
    const nx = /^next:(.+)$/.exec(actionId);
    if (nx) { const n = NEXT.find((x) => x.id === nx[1]); if (!n) return null; const wr = api.row(n.when) || {}; const pre = {}; Object.keys(n.preset).forEach((k) => { const v = n.preset[k]; pre[k] = v.charAt(0) === '@' ? wr[v.slice(1)] : api.val(v); });
      if (n.newTable) return api.openNew(n.newTable, BREAK === 'nopreset' ? {} : pre);
      return api.runProcess(n.class, BREAK === 'nopreset' ? {} : pre); }
    const ad = /^(add|back):(\d+)$/.exec(actionId);
    if (ad) { const idx = Number(ad[2]);
      if (ad[1] === 'add') return BREAK === 'noclimb' ? api.openChildNew(idx) : api.saveThen(() => api.openChildNew(idx));
      return api.saveThen(() => api.goTab(idx)); }
    const r = /^rel:(\d+):(.+)$/.exec(actionId);
    if (r) { const d = api.related().find((x) => String(x.windowId) === r[1] && x.table === r[2]); return d ? api.openRelated(d) : null; }
    if (actionId === 'save-complete') {
      if (BREAK === 'skipsave') return api.docAction('CO');
      return api.saveThen(() => api.docAction('CO'));
    }
    const m = /^form:(\d+)$/.exec(actionId);
    if (m) {
      const hit = relatedForms(api).find(({ f }) => f.formId === Number(m[1]));
      if (hit) return api.openForm(hit.f.formId, { [hit.p]: api.keyVal });
    }
    return null;
  }
};

export async function activate(ctx) { if (!ctx.lens) throw new Error('host has no lens extension point'); ctx.lens.register('friendly-ops', lens); }
export async function deactivate() { /* ctx.lens registrations are owner-removed by the registry on stop */ }
