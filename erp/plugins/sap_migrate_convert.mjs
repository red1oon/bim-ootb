// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_migrate_convert.mjs: the SAP Business One agent's sap_export.json (erp/sap_agent/agent.js, read from the user's OWN Service Layer) → the SAME 17-sheet
//   Ninja workbook + manifest the Odoo export and the Business Central converter write, so the "Migrate from Odoo" plan/load and the Ninja loader apply unchanged.
//   Since 2026-11-10 the mapping is DATA: erp/migrate/templates/sap-b1-10.json, run by the ONE migration engine (erp/migrate/engine.mjs) through the export-json connector
//   (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-SPEC + §ENGINE-D-SPEC — Witness: W-MIGRATE-ENGINE, cell-for-cell equal to the hand converter it replaced, which is kept
//   only as the test oracle erp/tests/fixtures/sap_convert_reference.mjs; and W-SAP-MIGRATE). READ THE LOG: §SAP lines. ALPHA, a POC released early.
import { HEADERS, ORDER, mask } from './bc_migrate_convert.mjs';
import { run } from '../migrate/engine.mjs';
import { exportJson } from '../migrate/connectors/export_json.mjs';
import { loadTemplate } from '../migrate/template_loader.mjs';
export const WORKBOOK = 'sap_b1_migration.xlsx';
export const TEMPLATE = await loadTemplate('sap-b1-10');

// convert(exp, { cutover, priceList }) -> { book, manifest, provenance }   (the template's variables: CUTOVER, PRICE_LIST)
export function convert(exp, opts) {
  opts = opts || {};
  return run(TEMPLATE, exportJson(exp, TEMPLATE.connector), { CUTOVER: opts.cutover || '', PRICE_LIST: opts.priceList });
}

// the ALPHA REPORT a tester pastes back: sets, counts, missing fields, sheets, refusals, patches — every quoted value masked, no customer value
export function alphaReport(manifest, result) {
  const L = ['§SAP-ALPHA version=' + (manifest.version || '?') + ' sets=' + manifest.sap_sets.length + ' metadata=' + String((manifest.metadata || {}).sha256 || '').slice(0, 16) + ' cutover=' + manifest.cutover + ' currency=' + (manifest.currency || '-')];
  manifest.sap_sets.forEach((x) => L.push('§SAP-ALPHA set=' + x.set + ' count=' + x.count + ' rows=' + x.rows + ' fields=' + x.read + (x.missing.length ? ' missing=' + JSON.stringify(x.missing) : '')));
  manifest.sheets.forEach((x) => L.push('§SAP-ALPHA sheet=' + x.sheet + ' rows=' + x.rows));
  (manifest.problems || []).forEach((p) => L.push('§SAP-ALPHA problem ' + mask(p)));
  (manifest.refused || []).forEach((r) => L.push('§SAP-ALPHA refused sheet=' + r.sheet + ' n=' + r.n + ' why=' + JSON.stringify(r.why)));
  const rn = {}; (manifest.renamed || []).forEach((r) => { const k = r.table + '.' + r.column + ' (' + r.why + ')'; rn[k] = (rn[k] || 0) + 1; });
  Object.keys(rn).forEach((k) => L.push('§SAP-ALPHA renamed ' + k + ' n=' + rn[k]));
  (manifest.patches || []).forEach((p) => L.push('§SAP-ALPHA patch ' + p.table + '.' + p.column + ' rows=' + p.rows));
  (manifest.notes || []).forEach((n) => L.push('§SAP-ALPHA note ' + mask(n).replace(/\([^)]*\)/g, '(…)')));   // a note's parentheses may list codes: masked
  if (result) L.push('§SAP-ALPHA result ' + mask(result));
  return L;
}
export { HEADERS, ORDER };
