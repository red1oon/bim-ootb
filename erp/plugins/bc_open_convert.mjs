// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bc_open_convert.mjs: a Business Central configuration package (read by migrate/connectors/bc_package.mjs) → the open-balance sheets: connectors/bc_open.mjs reads the ledger
//   tables into the neutral sets, the ONE migration engine maps them on migrate/templates/bc-w1-open.json. ALPHA, never run on a real company. Implementing bim-compiler
//   prompts/MIGRATE_INSTALL_TENANT.md §SAP-BC-OPEN-SPEC — Witness: W-SAPBC-OPEN (§SBO-*). No mapping code here; the reader's problems (table-missing, unknown-account ...) are carried into the manifest.
import { run } from '../migrate/engine.mjs';
import { exportJson } from '../migrate/connectors/export_json.mjs';
import { loadTemplate } from '../migrate/template_loader.mjs';
import { readOpen } from '../migrate/connectors/bc_open.mjs';
export const TEMPLATE = await loadTemplate('bc-w1-open');
export { readOpen };

// fromOpen(open) -> { book, manifest, provenance, open }: the neutral sets (the reader's output, or a test's mutation of it) through the ONE engine
export function fromOpen(open) {
  const r = run(TEMPLATE, exportJson(open, TEMPLATE.connector), {});
  const book = r.book.filter((b) => b.rows.length > 1);
  const man = Object.assign({}, r.manifest, { problems: (r.manifest.problems || []).concat(open.manifest.problems || []) });
  return { book, manifest: man, provenance: r.provenance, open };
}
// convert(pkg, model, { cutover, say }) -> { book, manifest, provenance, open }   (pkg = bc_migrate_convert.readPackage(...))
export function convert(pkg, model, opts) { return fromOpen(readOpen(pkg, model, opts || {})); }
