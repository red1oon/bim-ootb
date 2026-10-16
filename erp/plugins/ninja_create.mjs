// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_create.mjs - the authoring Ninja (Excel model sheet -> AD model -> live install) as a plugin bundle (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §27, W-NINJA-BUNDLES).
//   Contributes ONE pill, "Ninja" (no image of its own -> the letter box), which opens the Plugin Engine on its Create face; the Create face is shown only while this bundle
//   is ACTIVE (plugin_overlay.js). Built in: installed + started once per browser; Stop removes pill and face. Legacy Ninja = a command-line IApplication, no AD rows.
export const manifest = {
  id: 'org.idempiere.ninja.create',
  name: 'Ninja (model from Excel)',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  budget: { kb: 1, note: 'pill + face gate only; the engine is ninja_model/stage/bundle/create/starter/export.js' }
};
export async function activate(ctx) {
  if (!ctx.pill) throw new Error('host has no pill extension point');
  ctx.pill.register('ninjacreate', { name: 'Ninja', title: 'Ninja - your spreadsheet becomes a running module', order: 4.85,
    action: () => { const A = globalThis.IdmpPillActions; if (A && A.plugin) A.plugin({ face: 'create' }); else throw new Error('Plugin Engine not loaded'); } });
}
export async function deactivate() {}
