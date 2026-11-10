// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bc_migrate_form.mjs: HOT chunk of plugins/bc_migrate.mjs — the "Migrate from Business Central (alpha)" form descriptor for the ONE generic form engine.
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC — Witness: W-BC-MIGRATE. READ THE LOG: §BC-FORM and §BC-ALPHA lines.
// It owns ONE thing: turning BC's package into the workbook + manifest the "Migrate from Odoo" form already plans and loads (plan / load imported, not copied). The summary, the
//   locks, the units, the dry run and Process are that form's; this one adds the alpha report (§BC-ALPHA, values masked) to the summary and to the result.
import MODEL from './bc_model.mjs';
import { readPackage, convert, alphaReport, WORKBOOK } from './bc_migrate_convert.mjs';
import { DESC as ODOO, bindProcess, withSourceRows } from './odoo_migrate_form.mjs';
import { bookToWorkbook } from './ninja_migrate_process.mjs';
import { readOpen } from '../migrate/connectors/bc_open.mjs';
export const CLASSNAME = 'org.kernel.bc.MigrateFromBC';
const LEDGER = [17, 21, 25, 271];   // G/L Entry, Cust. / Vendor Ledger Entry, Bank Account Ledger Entry: any of them present = the package carries the books
function say(trx, line) { if (trx && trx.say) trx.say(line); console.log(line); }

// the BC file + cutover → the Odoo form's params (a workbook + its manifest), plus the conversion's own problems and the alpha report
export function toOdooParams(trx, params) {
  const files = (params && params.Files) || [], pk = files.find((f) => /\.xlsx?$/i.test(f.name)), cut = params && params.Cutover ? String(params.Cutover).slice(0, 10) : '';
  const out = { problems: [], params: null, manifest: null, report: [] };
  if (!pk) out.problems.push('Pick the Excel file Business Central wrote (Configuration Packages → Export to Excel).');
  if (!cut) out.problems.push('Set the cut-over date: opening stock is counted up to it.');
  if (!pk || !cut) return out;
  const pkg = readPackage(pk.data, MODEL), c = convert(pkg, MODEL, { cutover: cut });
  if (!Object.keys(pkg.tables).length) out.problems.push('No sheet of this file is a Business Central table this migration reads (row 1, cell C1 holds the table id in BC\'s export).');
  c.manifest.problems.forEach((p) => out.problems.push(p));
  out.manifest = c.manifest; out.report = alphaReport(c.manifest);
  out.report.forEach((l) => say(trx, l));
  out.params = { Files: [{ name: WORKBOOK, size: 0, data: bookToWorkbook(c.book) }, { name: 'manifest.json', size: 0, data: c.manifest }] };
  // §WIRE-SPEC: a package that carries the ledger tables also holds the open balances: the SAME package, read by connectors/bc_open.mjs, is handed to the shared planner as an open file
  //   (its format names the template). A masters-only package (no ledger table) brings no balances and no problem - the reader's own "missing table" problems apply once a ledger is there.
  if (LEDGER.some((id) => pkg.tables[id])) out.params.Files.push({ name: 'bc_open.json', size: 0, data: readOpen(pkg, MODEL, { cutover: cut }) });
  return out;
}

export const DESC = {
  title: 'Migrate from Business Central (alpha)',
  emptyText: 'Pick the Excel file Business Central exported (Configuration Packages → Export to Excel) and set the cut-over date.',
  params: [{ name: 'Files', label: 'Business Central package (Excel)', type: 'file', multiple: false, accept: '.xlsx', mandatory: true },
    { name: 'Cutover', label: 'Cut-over date', type: 'date', mandatory: true, default: (trx) => (trx && trx.env && (trx.env.date || trx.env.loginDate)) || '' }],
  columns: ODOO.columns.map((c) => (c.key === 'odoo' ? Object.assign({}, c, { label: 'BC rows' }) : c)),
  rows(trx, params, current) {
    const x = toOdooParams(trx, params);
    const probRows = x.problems.map((t, i) => ({ key: 950 + i, item: '⚠ ' + t, selected: false, locked: true }));
    if (x.problems.length) { say(trx, '§BC-FORM summary problems=' + x.problems.length); return probRows; }
    const rs = ODOO.rows(trx, x.params, current);
    const alpha = { key: 990, item: 'ALPHA — not yet proven against a live Business Central. Alpha report: ' + x.report.length + ' lines in the browser console (§BC-ALPHA, no customer values).', selected: false, locked: true };
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
    const msg = ODOO.run(trx, x.params, rows).replace(/^Migrated from Odoo/, 'Migrated from Business Central (alpha)');
    say(trx, alphaReport(x.manifest, msg).pop());
    return msg;
  }
};

export function activate(ctx) {
  if (!ctx.form) throw new Error('bc-migrate: the host injected no form engine (ctx.form)');
  bindProcess(ctx.process);   // the Odoo plan/load run the Ninja loader through the host's process engine
  ctx.form.register(CLASSNAME, DESC);
  console.log('§BC-FORM descriptor registered class=' + CLASSNAME + ' model=microsoft/BCApps@' + String(MODEL.commit).slice(0, 8) + ' tables=' + Object.keys(MODEL.tables).length);
}
