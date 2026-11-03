// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the CAPEX dashboard as a TWIN PLUGIN BUNDLE (bim-ootb prompts/CAPEX_DASHBOARD.md §5.19; owner 2026-11-03: "Twin plugin bundle"). Witness: W-PA-RENDER.
// The legacy side gets the SAME rows as plain migration scripts (capex/legacy/migration/iD13/postgresql/*.sql, LEGACY CONVENTION). Here they arrive as a 2Pack generated from those scripts
//   (capex_2pack_source.mjs → erp/tools/gen_2pack.js), applied by the host's Pack In at Start (plugin_registry.js packIn → PipoPackIn.incremental, Incremental2PackActivator) and kept/replayed
//   at every load, as legacy keeps a bundle's packed-in dictionary data on Stop. No code: the stock Performance gadget (PA_DashboardContent 50003) draws the goals (overlay/home.js).
// Install once per site (System Administrator → Plugins & Releases → Install by URL → Start). Not a built-in: the built-in lists are core (plugin_overlay.js), and the core is immutable
//   (EXTENSION-LAYER LAW, erp/tests/witness_core_untouched.js).
export const manifest = {
  id: 'org.bimootb.capex',
  name: 'CAPEX Dashboard',
  version: '1.0.1',
  engineVersion: '>=0.9.0',
  requires: {},
  packs: ['capex_2pack/2Pack_1.0.0.zip', 'capex_2pack/2Pack_1.0.1.zip']   // 1.0.0 = R0 + G2 + G3; 1.0.1 = G4 (the bucket tiles, §5.20)
};
export async function activate() { console.log('§CAPEX-PLUGIN start (the 2Pack rows are applied by the host Pack In before this runs)'); }
export async function deactivate() { console.log('§CAPEX-PLUGIN stop (packed-in rows are dictionary data: kept, as legacy keeps them)'); }
