// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_open_convert.mjs: the open-balances file of an SAP Business One Service Layer (sap_open.json, written by erp/sap_agent/open_reader.js) → the open-balance sheets, by the ONE
//   migration engine on migrate/templates/sap-b1-10-open.json. ALPHA, never run on a real company. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-BC-OPEN-SPEC — Witness: W-SAPBC-OPEN (§SBO-*).
//   No mapping code here: this file runs the engine and carries the READER's own problems (e.g. source-not-frozen) into the manifest, where the target side (open_balances.mjs) and the form show them.
import { run } from '../migrate/engine.mjs';
import { exportJson } from '../migrate/connectors/export_json.mjs';
import { loadTemplate } from '../migrate/template_loader.mjs';
export const FILE = 'sap_open.json';
export const TEMPLATE = await loadTemplate('sap-b1-10-open');
export const isOpenFile = (data) => !!(data && data.manifest && data.manifest.format === TEMPLATE.connector.format);

// convert(exp, variables) -> { book (every sheet with rows), manifest (problems = the reader's + the engine's), provenance }
export function convert(exp, variables) {
  const r = run(TEMPLATE, exportJson(exp, TEMPLATE.connector), variables || {});
  const book = r.book.filter((b) => b.rows.length > 1);
  const man = Object.assign({}, r.manifest, { problems: (r.manifest.problems || []).concat((exp && exp.manifest && exp.manifest.problems) || []) });
  return { book, manifest: man, provenance: r.provenance };
}
