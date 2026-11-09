// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — odoo_migrate_convert.mjs: the Odoo agent's RAW odoo_export.json (erp/odoo_agent/export.js, read from the user's OWN Odoo) → target sheets, by the ONE migration
//   engine (erp/migrate/engine.mjs) on the DATA template erp/migrate/templates/odoo-17.json. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3C-SPEC 1(c) — Witness:
//   W-MIGRATE-ENGINE ODOO-OPEN-* and W-OPEN-BALANCES. READ THE LOG: §MIGE / §MIG lines.
//   Today the template carries the OPEN BALANCES only (the opening journal + the open invoices); the 17 master sheets still come from the agent's workbook and join the template in
//   the next step (owner decision 2026-11-10: the agent ships raw rows, the browser maps). No mapping code lives here: this file only runs the engine.
import { run } from '../migrate/engine.mjs';
import { exportJson } from '../migrate/connectors/export_json.mjs';
import { loadTemplate } from '../migrate/template_loader.mjs';
import { OPEN_ORDER } from '../migrate/workbook.mjs';
export const FILE = 'odoo_export.json';
export const TEMPLATE = await loadTemplate('odoo-17');
export const isExport = (data) => !!(data && data.manifest && data.manifest.format === TEMPLATE.connector.format);

// openBalances(exp, variables) -> { sheets: [{ table, rows }] (only the open sheets that have rows), manifest }   (variables: the template's, e.g. AR_CLEARING)
export function openBalances(exp, variables) {
  const r = run(TEMPLATE, exportJson(exp, TEMPLATE.connector), variables || {});
  const sheets = r.book.filter((b) => OPEN_ORDER.includes(b.name.slice(2)) && b.rows.length > 1).map((b) => ({ table: b.name.slice(2), rows: b.rows }));
  return { sheets, manifest: r.manifest, provenance: r.provenance };
}
