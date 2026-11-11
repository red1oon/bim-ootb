// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — odoo_migrate_convert.mjs: the Odoo agent's RAW odoo_export.json (erp/odoo_agent/export.js, read from the user's OWN Odoo) → target sheets, by the ONE migration
//   engine (erp/migrate/engine.mjs) on the DATA template erp/migrate/templates/odoo-17.json. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3C-SPEC 1(c) — Witness:
//   W-MIGRATE-ENGINE ODOO-OPEN-* and W-OPEN-BALANCES. READ THE LOG: §MIGE / §MIG lines.
//   The open balances of ANY source (this one included) are read by plugins/open_sources.mjs (§WIRE-SPEC); this file keeps only the WHOLE-book path of the raw export. No mapping code lives here.
import { run } from '../migrate/engine.mjs';
import { exportJson } from '../migrate/connectors/export_json.mjs';
import { loadTemplate } from '../migrate/template_loader.mjs';
import { OPEN_ORDER } from '../migrate/workbook.mjs';
export const FILE = 'odoo_export.json';
export const TEMPLATE = await loadTemplate('odoo-17');
const isExport = (data) => !!(data && data.manifest && data.manifest.format === TEMPLATE.connector.format);

// §ODOO-ENGINE-SPEC O3: the WHOLE book from the agent's raw rows — the 17 master sheets (always, as the agent's workbook had them) + the open sheets that have rows.
export const hasMasters = (data) => isExport(data) && !!(data.sets && data.sets['res.partner'] && data.sets['product.product']);
export function convert(exp, variables) {
  const conn = exportJson(exp, TEMPLATE.connector), r = run(TEMPLATE, conn, variables || {});
  const book = r.book.filter((b) => !OPEN_ORDER.includes(b.name.slice(2)) || b.rows.length > 1);
  // STOCK VALUE (W-MIGRATION-TRADE COST): the template's M_InventoryLine provenance already holds each line's product cost (Odoo standard_price). The 17-sheet format has no cost column, so it rides as an
  //   extra CurrentCostPrice column on the stock-line sheet; the stage-2 stock import turns it into a Cost Adjustment (ImportInventory.java:524-572). A zero / unknown cost stays blank - never invented.
  const il = book.findIndex((b) => /M_InventoryLine$/.test(b.name)), pv = r.provenance && r.provenance.M_InventoryLine;
  if (il >= 0 && pv && pv.length === book[il].rows.length - 1 && pv.some((x) => x && Number(x.cost) > 0))
    book[il] = { ...book[il], rows: book[il].rows.map((row, i) => row.concat([i === 0 ? 'CurrentCostPrice' : (pv[i - 1] && Number(pv[i - 1].cost) > 0 ? Number(pv[i - 1].cost) : '')])) };
  // the non-invent proof on this path: every set the agent read holds exactly the rows Odoo counted (count == rows), said per set when it does not
  const short = conn.report().filter((x) => x.count != null && x.rows !== x.count && !/^(tb|open_moves|account\.group|res\.country|res\.country\.state|res\.company)$/.test(x.set)).map((x) => x.set + ' (Odoo counted ' + x.count + ', the file holds ' + x.rows + ')');
  return { book, manifest: r.manifest, provenance: r.provenance, short };
}

