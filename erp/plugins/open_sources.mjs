// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — open_sources.mjs: the OPEN-BALANCES FILES of every source, ONE mechanism. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §WIRE-SPEC — Witness: W-IDEMPIERE-OPEN /
//   W-SAPBC-OPEN / W-ODOO-FORM (§WIRE-*). A source is DATA here: the name of its open-balances template (erp/migrate/templates/<name>.json). A file is an open file of that source when its
//   manifest.format is the template's connector.format; the ONE engine (migrate/engine.mjs) maps it; the shared planner (odoo_migrate_form.mjs plan) and the shared loader (open_balances.mjs)
//   do the rest. Adding a source = adding a template name below; no host code, no per-source branch (AD-LAYER LAW). Pure: no I/O, no clock, no random.
import { run } from '../migrate/engine.mjs';
import { exportJson } from '../migrate/connectors/export_json.mjs';
import { loadTemplate } from '../migrate/template_loader.mjs';
import { OPEN_ORDER } from '../migrate/workbook.mjs';
export const SOURCES = ['odoo-17', 'idempiere-open', 'sap-b1-10-open', 'bc-w1-open'];
export const TEMPLATES = {};
for (const name of SOURCES) { const t = await loadTemplate(name); TEMPLATES[t.connector.format] = t; }
export const FORMATS = Object.keys(TEMPLATES);

export const formatOf = (data) => (data && data.manifest && data.manifest.format) || null;
export const isOpenFile = (data) => !!TEMPLATES[formatOf(data)];
// detect(files) -> the first picked file that is the open-balances file of ANY registered source (null if none)
export const detect = (files) => (files || []).find((f) => f && isOpenFile(f.data)) || null;

// convert(data, variables) -> { book (every sheet with rows), manifest (problems = the engine's + the reader's), provenance, template }
export function convert(data, variables) {
  const t = TEMPLATES[formatOf(data)];
  if (!t) throw new Error('not an open-balances file of a known source (format ' + formatOf(data) + ')');
  const r = run(t, exportJson(data, t.connector), variables || {});
  const book = r.book.filter((b) => b.rows.length > 1);
  const man = Object.assign({}, r.manifest, { problems: (r.manifest.problems || []).concat((data.manifest && data.manifest.problems) || []) });
  return { book, manifest: man, provenance: r.provenance, template: t };
}
// sheets(conv, have) -> [{ table, rows }]. `have` = the tables the base book (masters from a workbook / the engine) already has, [] for none. The OPEN sheets are always taken; any other sheet the file's
//   template made (the accounts, partners, locations, price list its documents need) only when the base book has no sheet of that table - never two sheets of one table (open-only: all of them).
export function sheets(conv, have) {
  const h = have || [];
  return conv.book.map((b) => ({ table: b.name.slice(2), rows: b.rows })).filter((s) => OPEN_ORDER.includes(s.table) || !h.includes(s.table));
}
// cutoverProblem(open file, the form's cut-over date) -> a problem text or '' (one shared check: a form that also asks a date must agree with the file)
export function cutoverProblem(data, cut) {
  const c = String((data && data.manifest && data.manifest.cutover) || '').slice(0, 10), d = String(cut || '').slice(0, 10);
  return c && d && c !== d ? 'The open-balances file is cut at ' + c + ' but the cut-over date is ' + d + '. Use one date: read the source again for ' + d + ', or set the date to ' + c + '.' : '';
}
// wrongFile(files, format, what) -> a problem text when a picked file is an open file of ANOTHER source than this form's (one shared check for every source form), else ''
export function wrongFile(files, format, what) {
  const other = (files || []).find((f) => f && isOpenFile(f.data) && formatOf(f.data) !== format);
  return other ? other.name + ' is not ' + what + ' (its format is ' + formatOf(other.data) + '). Use the "Migrate from ..." form of that source.' : '';
}
