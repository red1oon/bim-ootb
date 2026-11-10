// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — idempiere_migrate.mjs: the "Migrate from iDempiere (opening balances)" plugin bundle (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDEMPIERE-OPEN-SPEC + §WIRE-SPEC — Witness:
//   W-IDEMPIERE-OPEN, erp/tests/witness_idempiere_open.js). READ THE LOG: §IDMP-FORM lines. Dictionary data only (AD_Form 9545001 + menu leaf under Data Import + access), made by migrate_bundle.mjs.
import { makeBundle } from './migrate_bundle.mjs';
export const { manifest, activate, deactivate } = makeBundle({ id: "org.kernel.idempiere.migrate", name: "Migrate from iDempiere (opening balances)", version: "0.1.0", formId: 9545001, classname: "org.kernel.idempiere.MigrateFromIdempiere", tag: "IDMP-FORM", uu: "idempiere", seqno: 31, beta: true,
  description: "Load the opening balances (trial balance, open invoices, bank balances) a legacy iDempiere's accounting read for the cut-over into this tenant",
  menuDescription: "Load the opening balances of a legacy iDempiere into this tenant",
  help: "Run open_reader.js (idempiere_agent.zip: PGPASSWORD=... node open_reader.js --cutover YYYY-MM-DD --db idempiere --client <AD_Client_ID>) on the machine that has your iDempiere; it reads only, and writes idempiere_open.json. Pick that file here, read the summary (what comes across, what is refused and why, what stays on the clearing accounts), Process. The books are checked against the source.",
  hot: "./idempiere_migrate_form.mjs" });
