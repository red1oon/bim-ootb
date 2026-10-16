// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_excel.mjs - the NinjaExcel lens as a plugin bundle (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §27, W-NINJA-BUNDLES).
//   Contributes ONE pill, "Excel Report" (Excel-as-report-binder: ninja_excel.js / ninja_rule.js / ninja_pill.js, still page scripts). Built in: installed + started once per
//   browser (plugin_overlay BUILTINS); Stop removes the pill, Start brings it back. No dictionary rows: legacy Ninja is a command-line IApplication with no AD entry point.
export const manifest = {
  id: 'org.idempiere.ninja.excel',
  name: 'Ninja Excel Report',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  budget: { kb: 1, note: 'pill only; the engine is ninja_excel.js + ninja_rule.js + ninja_pill.js' }
};
export async function activate(ctx) {
  if (!ctx.pill) throw new Error('host has no pill extension point');
  ctx.pill.register('ninja', { name: 'Excel Report', icon: 'grid', order: 4.8,
    action: () => { if (!globalThis.NinjaPill) throw new Error('NinjaExcel engine not loaded'); globalThis.NinjaPill.open({ db: globalThis.__idmpDb }); } });
}
export async function deactivate() {}
