// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — bc_migrate.mjs: the "Migrate from Business Central (alpha)" plugin bundle (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §BC-SPEC + §WIRE-SPEC — Witness: W-BC-MIGRATE, erp/tests/witness_bc_migrate.js). READ THE LOG: §BC-FORM lines.
// Dictionary data only (AD_Form 9543001 + menu leaf under Data Import + access), made by migrate_bundle.mjs; the form is the hot chunk bc_migrate_form.mjs; it loads through the Ninja loader plugin (must be started too).
import { makeBundle } from './migrate_bundle.mjs';
export const { manifest, activate, deactivate } = makeBundle({ id: "org.kernel.bc.migrate", name: "Migrate from Business Central (alpha)", version: "0.1.0", formId: 9543001, classname: "org.kernel.bc.MigrateFromBC", tag: "BC-FORM", uu: "bc", seqno: 29, beta: true,
  description: "Load a Dynamics 365 Business Central configuration package (BC's Export to Excel) into this tenant",
  menuDescription: "Load a Business Central configuration package into this tenant",
  help: "In Business Central: Configuration Packages → a package with the tables listed in the guide → Export to Excel. Pick that file here (if it holds the ledger tables, the open balances come across too), set the cut-over date, answer the units, read the summary, Process. ALPHA: built from Microsoft's published table definitions; the alpha report says what your file held.",
  hot: "./bc_migrate_form.mjs" });
