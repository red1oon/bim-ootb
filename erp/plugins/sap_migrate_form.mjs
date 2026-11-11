// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_migrate_form.mjs: HOT chunk of plugins/sap_migrate.mjs — the "Migrate from SAP Business One (alpha)" form descriptor for the ONE generic form engine.
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC — Witness: W-SAP-MIGRATE. READ THE LOG: §SAP-FORM and §SAP-ALPHA lines.
// It owns ONE thing: turning the agent's sap_export.json into the workbook + manifest the "Migrate from Odoo" form already plans and loads (plan / load imported, not copied).
import { convert, alphaReport, WORKBOOK } from './sap_migrate_convert.mjs';
import { DESC as ODOO, bindProcess, withSourceRows } from './odoo_migrate_form.mjs';
import { bookToWorkbook } from './ninja_migrate_process.mjs';
import * as OS from './open_sources.mjs';
export const CLASSNAME = 'org.kernel.sap.MigrateFromB1';
function say(trx, line) { if (trx && trx.say) trx.say(line); console.log(line); }

export const FORMAT = 'sap-b1-open-json-v1';
// the picked files -> the Odoo form's params: sap_export.json (masters) -> the workbook + manifest it plans; sap_open.json (the balances, agent --cutover) is handed on AS IS to the
//   shared planner (open_sources.mjs reads it by its format - §WIRE-SPEC). The balances file alone is a whole migration of the balances (the template makes the accounts / partners it needs).
export function toOdooParams(trx, params) {
  const files = (params && params.Files) || [], open = files.find((x) => OS.formatOf(x.data) === FORMAT), f = files.find((x) => /\.json$/i.test(x.name) && !OS.isOpenFile(x.data)), cut = params && params.Cutover ? String(params.Cutover).slice(0, 10) : '';
  const out = { problems: [], params: null, manifest: null, report: [], converted: false };
  const wrong = OS.wrongFile(files, FORMAT, 'the file the SAP Business One agent wrote with --cutover (sap_open.json)'); if (wrong) out.problems.push(wrong);
  if (!f && !open) out.problems.push('Pick the sap_export.json the SAP Business One agent wrote (download the agent below, run it on a machine that reaches your Service Layer) and, for the balances, the sap_open.json it writes with --cutover.');
  if (!cut && (f || !open)) out.problems.push('Set the cut-over date: the price list and the opening stock are dated at it.');
  if (open && cut) { const cp = OS.cutoverProblem(open.data, cut); if (cp) out.problems.push(cp); }
  if (out.problems.length || (!f && !open)) return out;
  out.params = { Files: [] };
  if (f) {
    const pl = params.PriceList != null && String(params.PriceList).trim() !== '' ? String(params.PriceList).trim() : undefined;
    const c = convert(f.data, { cutover: cut, priceList: pl });
    c.manifest.problems.forEach((p) => out.problems.push(p));
    out.manifest = c.manifest; out.report = alphaReport(c.manifest); out.converted = true;
    out.report.forEach((l) => say(trx, l));
    out.params.Files.push({ name: WORKBOOK, size: 0, data: bookToWorkbook(c.book) }, { name: 'manifest.json', size: 0, data: c.manifest });
  }
  if (open) out.params.Files.push(open);
  return out;
}

export const DESC = {
  title: 'Migrate from SAP Business One (alpha)',
  emptyText: 'Pick the sap_export.json the SAP Business One agent wrote (and sap_open.json for the balances) and set the cut-over date.',
  params: [{ name: 'Files', label: 'SAP Business One export (sap_export.json: the masters; sap_open.json: the balances)', type: 'file', multiple: true, accept: '.json', mandatory: true },
    { name: 'Cutover', label: 'Cut-over date (with sap_export.json)', type: 'date', mandatory: false, default: (trx) => (trx && trx.env && (trx.env.date || trx.env.loginDate)) || '' },
    { name: 'PriceList', label: 'Business One price list number (blank = the lowest)', type: 'string', mandatory: false }],
  columns: ODOO.columns.map((c) => (c.key === 'odoo' ? Object.assign({}, c, { label: 'B1 rows' }) : c)),
  rows(trx, params, current) {
    const x = toOdooParams(trx, params);
    if (x.problems.length) { say(trx, '§SAP-FORM summary problems=' + x.problems.length); return x.problems.map((t, i) => ({ key: 950 + i, item: '⚠ ' + t, selected: false, locked: true })); }
    const rs = ODOO.rows(trx, x.params, current);
    const alpha = { key: 990, item: 'ALPHA (a proof of concept) — not yet run against a live SAP Business One. ' + (x.converted ? 'Alpha report: ' + x.report.length + ' lines in the browser console (§SAP-ALPHA, no customer values).' : 'Balances only (sap_open.json).'), selected: false, locked: true };
    return [alpha].concat(withSourceRows(rs, x.manifest));
  },
  // §E1 stage 2 + §WIRE-SPEC: the shared stage 2 (opening stock, the open balances, the books checked against the source) must plan from the CONVERTED params, as rows() and run() do - planning from the raw
  //   pick left `open` empty, so the books were never verified against the source (found by W-SAPBC-OPEN BC-LOAD shipped-verifier)
  after(trx, params, rows) {
    const x = toOdooParams(trx, params);
    if (x.problems.length) throw new Error('Not migrated: ' + x.problems.join(' '));
    return ODOO.after(trx, x.params, rows);
  },
  run(trx, params, rows) {
    const x = toOdooParams(trx, params);
    if (x.problems.length) throw new Error('Not migrated: ' + x.problems.join(' '));
    const msg = ODOO.run(trx, x.params, rows).replace(/^Migrated from Odoo/, 'Migrated from SAP Business One (alpha)');
    if (x.converted) say(trx, alphaReport(x.manifest, msg).pop());
    return msg;
  }
};

export function activate(ctx) {
  if (!ctx.form) throw new Error('sap-migrate: the host injected no form engine (ctx.form)');
  bindProcess(ctx.process);
  ctx.form.register(CLASSNAME, DESC);
  console.log('§SAP-FORM descriptor registered class=' + CLASSNAME);
}
