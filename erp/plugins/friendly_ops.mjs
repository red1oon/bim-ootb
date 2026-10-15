// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// friendly_ops.mjs - the opt-in "friendly operations" lens (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15). Behaviour observed in Odoo 17 (an order carries its next
// actions as buttons on the record), written here from scratch over the host's own seams; no Odoo code. Installed = lens ON; stopped = the plain legacy twin.
// It names no table, window or form: every action is derived from the record on screen and the dictionary.
//   FO-M5 Save & Complete - while editing a document (the tab has a DocStatus): Save, then the same Complete the DocAction bar dispatches.
//   FO-M4 open a related form - on a saved record: every generic AD_Form with a menu leaf and a parameter named like this record's key opens with that key already chosen.
export const manifest = {
  id: 'org.kernel.friendly-ops',
  name: 'Friendly operations lens',
  version: '0.1.0',
  engineVersion: '>=0.9.0',
  requires: {}
};

const BREAK = (typeof globalThis !== 'undefined' && globalThis.__FOPS_BREAK) || null;   // witness-only negative control (W-FRIENDLY-OPS F5)

function relatedForms(api) {
  if (!api.keyCol || api.keyVal == null || api.isNew) return [];
  const k = String(api.keyCol).toLowerCase();
  return api.forms().map((f) => ({ f, p: f.params.find((n) => String(n).toLowerCase() === k) })).filter((x) => x.p);
}

const lens = {
  actions(api) {
    const out = [];
    if (api.editing && api.hasDocFsm) out.push({ id: 'save-complete', label: 'Save & Complete', title: 'Save this document, then Complete it (the same Save and Complete as the toolbar and the action bar)' });
    relatedForms(api).forEach(({ f }) => out.push({ id: 'form:' + f.formId, label: f.name, title: 'Open ' + f.name + ' for this record' }));
    return out;
  },
  run(actionId, api) {
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
