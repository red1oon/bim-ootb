// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_migrate.mjs: the "Migrate from SAP Business One (alpha)" plugin bundle (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC + §WIRE-SPEC — Witness: W-SAP-MIGRATE, erp/tests/witness_sap_migrate.js). READ THE LOG: §SAP-FORM lines.
// Dictionary data only (AD_Form 9544001 + menu leaf under Data Import + access), made by migrate_bundle.mjs; the form is the hot chunk sap_migrate_form.mjs; it loads through the Ninja loader plugin (must be started too).
import { makeBundle } from './migrate_bundle.mjs';
export const { manifest, activate, deactivate } = makeBundle({ id: "org.kernel.sap.migrate", name: "Migrate from SAP Business One (alpha)", version: "0.1.0", formId: 9544001, classname: "org.kernel.sap.MigrateFromB1", tag: "SAP-FORM", uu: "sap", seqno: 30, beta: true,
  description: "Load the master data and, from sap_open.json, the open balances the SAP Business One agent read from your Service Layer into this tenant",
  menuDescription: "Load an SAP Business One export into this tenant",
  help: "Run the SAP Business One agent (sap_agent.zip: node agent.js --url https://<server>:50000 --company <CompanyDB> --user <user>) on a machine that reaches your Service Layer. Pick the sap_export.json it wrote (the masters) and, if you ran it with --cutover, the sap_open.json too (the balances; alone it brings only the balances), set the cut-over date, answer the units, read the summary, Process. ALPHA, a proof of concept: the field names are checked against your own server; the alpha report says what your export held.",
  hot: "./sap_migrate_form.mjs" });
