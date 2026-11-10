// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — odoo_migrate.mjs: the "Migrate from Odoo" plugin bundle (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B4-SPEC + §B4-IMPL-SPEC — Witness: W-ODOO-FORM, erp/tests/witness_odoo_form.js). READ THE LOG: §ODOO-FORM lines.
// Dictionary data only (AD_Form 9542001 + menu leaf under Data Import + access), made by migrate_bundle.mjs; the form is the hot chunk odoo_migrate_form.mjs; it loads through the Ninja loader plugin (must be started too).
import { makeBundle } from './migrate_bundle.mjs';
export const { manifest, activate, deactivate } = makeBundle({ id: "org.kernel.odoo.migrate", name: "Migrate from Odoo", version: "1.0.0", formId: 9542001, classname: "org.kernel.odoo.MigrateFromOdoo", tag: "ODOO-FORM", uu: "odoo", seqno: 28, beta: false,
  description: "Load the export of your Odoo (odoo_export.json; an older export: the workbook + manifest.json) into this tenant",
  menuDescription: "Load your Odoo export into this tenant",
  help: "Pick odoo_export.json, the file the Odoo agent wrote (export.js; an older export - the workbook + manifest.json - still loads). Answer which ERP unit each Odoo unit is. Read the summary: every sheet says how many rows will import and why any would be refused. Untick what you do not want (a sheet another one needs stays ticked). Process loads everything in one go, or nothing.",
  hot: "./odoo_migrate_form.mjs" });
