// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bc_migrate_convert.mjs: a Dynamics 365 Business Central configuration package (BC's own "Export to Excel") → the SAME 17-sheet Ninja workbook + manifest
//   the Odoo export writes, so the "Migrate from Odoo" plan/load, the Ninja loader and the sheet contract apply unchanged (one implementation per responsibility).
//   Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC — Witness: W-BC-MIGRATE. READ THE LOG: §BC lines. ALPHA: built from Microsoft's published source
//   (bc_model.json, github.com/microsoft/BCApps @ the commit it names), never run against a live Business Central — the alpha report is how a real package reports back.
// THE FILE (ConfigExcelExchange.Codeunit.al): one sheet per table; row 1 = A package code, B table caption, C TABLE ID (:662-684); row 3 = field captions (or field names, :592);
//   data from row 4 (:450); values in XML format (Format(v,0,9)), Option/Enum = the caption in the user's language (ConfigXMLExchange.FormatFieldValue :1900-1938).
// Pure: no I/O, no clock, no random. Browser + node.
import { LEN, HEADERS, ORDER, uuid5, finishBook, mask } from '../migrate/workbook.mjs';   // the target contract, shared by every source (moved 2026-11-10, §ENGINE-D-SPEC)
export { LEN, HEADERS, ORDER, uuid5, finishBook, mask };
export const WORKBOOK = 'bc_migration.xlsx';


import { readPackage, bcPackage } from '../migrate/connectors/bc_package.mjs';   // HOW the package is read (moved 2026-11-10)
import { run } from '../migrate/engine.mjs';
import { loadTemplate } from '../migrate/template_loader.mjs';
export { readPackage };
export const TEMPLATE = await loadTemplate('bc-w1');

// convert(pkg, model, { cutover }) -> { book, manifest, provenance } — since 2026-11-10 the mapping is DATA: erp/migrate/templates/bc-w1.json, run by the ONE engine
//   (W-MIGRATE-ENGINE: cell-for-cell equal to the hand converter it replaced, kept only as the test oracle erp/tests/fixtures/bc_convert_reference.mjs)
export function convert(pkg, model, opts) {
  opts = opts || {};
  return run(TEMPLATE, bcPackage(pkg, model, TEMPLATE.connector), { CUTOVER: opts.cutover || '' });
}

// the ALPHA REPORT a tester can paste back: tables, counts, header matches, refusals — every quoted value masked, no customer value leaves (§BC-SPEC)
export function alphaReport(manifest, result) {
  const L = ['§BC-ALPHA package=' + (manifest.package ? 'present' : 'none') + ' tables=' + manifest.bc_tables.length + ' model=' + String((manifest.model || {}).commit || '').slice(0, 8) + ' cutover=' + manifest.cutover];
  manifest.bc_tables.forEach((t) => L.push('§BC-ALPHA table=' + t.id + ' "' + t.caption + '" rows=' + t.rows + ' headers=' + t.headers));
  const unk = {}; (manifest.unknown_headers || []).forEach((u) => { (unk[u.table] = unk[u.table] || []).push(u.header); });
  Object.keys(unk).forEach((t) => L.push('§BC-ALPHA unknown-headers table=' + t + ' n=' + unk[t].length + ' ' + JSON.stringify(unk[t].slice(0, 12))));
  (manifest.skipped_sheets || []).forEach((s) => L.push('§BC-ALPHA skipped-sheet ' + JSON.stringify(s.why) + ' tableId=' + (s.tableId || '-')));
  manifest.sheets.forEach((s) => L.push('§BC-ALPHA sheet=' + s.sheet + ' rows=' + s.rows));
  (manifest.problems || []).forEach((p) => L.push('§BC-ALPHA problem ' + mask(p)));
  (manifest.refused || []).forEach((r) => L.push('§BC-ALPHA refused sheet=' + r.sheet + ' n=' + r.n + ' why=' + JSON.stringify(r.why)));
  const rn = {}; (manifest.renamed || []).forEach((r) => { const k = r.table + '.' + r.column + ' (' + r.why.replace(/".*?"/g, '') + ')'; rn[k] = (rn[k] || 0) + 1; });
  Object.keys(rn).forEach((k) => L.push('§BC-ALPHA renamed ' + k + ' n=' + rn[k]));
  (manifest.patches || []).forEach((p) => L.push('§BC-ALPHA patch ' + p.table + '.' + p.column + ' rows=' + p.rows));
  if (result) L.push('§BC-ALPHA result ' + mask(result));
  return L;
}
