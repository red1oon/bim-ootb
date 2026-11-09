// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_migrate_form.mjs: HOT chunk of plugins/sap_migrate.mjs — the "Migrate from SAP Business One (alpha)" form descriptor for the ONE generic form engine.
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC — Witness: W-SAP-MIGRATE. READ THE LOG: §SAP-FORM and §SAP-ALPHA lines.
// It owns ONE thing: turning the agent's sap_export.json into the workbook + manifest the "Migrate from Odoo" form already plans and loads (plan / load imported, not copied).
import { convert, alphaReport, WORKBOOK } from './sap_migrate_convert.mjs';
import { DESC as ODOO, bindProcess, withSourceRows } from './odoo_migrate_form.mjs';
import { bookToWorkbook } from './ninja_migrate_process.mjs';
export const CLASSNAME = 'org.kernel.sap.MigrateFromB1';
function say(trx, line) { if (trx && trx.say) trx.say(line); console.log(line); }

export function toOdooParams(trx, params) {
  const files = (params && params.Files) || [], f = files.find((x) => /\.json$/i.test(x.name)), cut = params && params.Cutover ? String(params.Cutover).slice(0, 10) : '';
  const out = { problems: [], params: null, manifest: null, report: [] };
  if (!f) out.problems.push('Pick the sap_export.json the SAP Business One agent wrote (download the agent below, run it on a machine that reaches your Service Layer).');
  if (!cut) out.problems.push('Set the cut-over date: the price list and the opening stock are dated at it.');
  if (!f || !cut) return out;
  const pl = params.PriceList != null && String(params.PriceList).trim() !== '' ? String(params.PriceList).trim() : undefined;
  const c = convert(f.data, { cutover: cut, priceList: pl });
  c.manifest.problems.forEach((p) => out.problems.push(p));
  out.manifest = c.manifest; out.report = alphaReport(c.manifest);
  out.report.forEach((l) => say(trx, l));
  out.params = { Files: [{ name: WORKBOOK, size: 0, data: bookToWorkbook(c.book) }, { name: 'manifest.json', size: 0, data: c.manifest }] };
  return out;
}

export const DESC = {
  title: 'Migrate from SAP Business One (alpha)',
  emptyText: 'Pick the sap_export.json the SAP Business One agent wrote and set the cut-over date.',
  params: [{ name: 'Files', label: 'SAP Business One export (sap_export.json)', type: 'file', multiple: false, accept: '.json', mandatory: true },
    { name: 'Cutover', label: 'Cut-over date', type: 'date', mandatory: true, default: (trx) => (trx && trx.env && (trx.env.date || trx.env.loginDate)) || '' },
    { name: 'PriceList', label: 'Business One price list number (blank = the lowest)', type: 'string', mandatory: false }],
  columns: ODOO.columns.map((c) => (c.key === 'odoo' ? Object.assign({}, c, { label: 'B1 rows' }) : c)),
  rows(trx, params, current) {
    const x = toOdooParams(trx, params);
    if (x.problems.length) { say(trx, '§SAP-FORM summary problems=' + x.problems.length); return x.problems.map((t, i) => ({ key: 950 + i, item: '⚠ ' + t, selected: false, locked: true })); }
    const rs = ODOO.rows(trx, x.params, current);
    const alpha = { key: 990, item: 'ALPHA (a proof of concept) — not yet run against a live SAP Business One. Alpha report: ' + x.report.length + ' lines in the browser console (§SAP-ALPHA, no customer values).', selected: false, locked: true };
    return [alpha].concat(withSourceRows(rs, x.manifest));
  },
  after: ODOO.after,   // §E1 stage 2: the shared opening-stock completion (Import Inventory, DocAction CO) - one implementation, odoo_migrate_form.mjs
  run(trx, params, rows) {
    const x = toOdooParams(trx, params);
    if (x.problems.length) throw new Error('Not migrated: ' + x.problems.join(' '));
    const msg = ODOO.run(trx, x.params, rows).replace(/^Migrated from Odoo/, 'Migrated from SAP Business One (alpha)');
    say(trx, alphaReport(x.manifest, msg).pop());
    return msg;
  }
};

export function activate(ctx) {
  if (!ctx.form) throw new Error('sap-migrate: the host injected no form engine (ctx.form)');
  bindProcess(ctx.process);
  ctx.form.register(CLASSNAME, DESC);
  console.log('§SAP-FORM descriptor registered class=' + CLASSNAME);
}
