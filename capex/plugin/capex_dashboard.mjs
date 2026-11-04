// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the CAPEX dashboard as a TWIN PLUGIN BUNDLE (bim-ootb prompts/CAPEX_DASHBOARD.md §5.19; owner 2026-11-03: "Twin plugin bundle"). Witness: W-PA-RENDER.
// The legacy side gets the SAME rows as plain migration scripts (capex/legacy/migration/iD13/postgresql/*.sql, LEGACY CONVENTION). Here they arrive as a 2Pack generated from those scripts
//   (capex_2pack_source.mjs → erp/tools/gen_2pack.js), applied by the host's Pack In at Start (plugin_registry.js packIn → PipoPackIn.incremental, Incremental2PackActivator) and kept/replayed
//   at every load, as legacy keeps a bundle's packed-in dictionary data on Stop. No code: the stock Performance gadget (PA_DashboardContent 50003) draws the goals (overlay/home.js).
// Install once per site (System Administrator → Plugins & Releases → Install by URL → Start). Not a built-in: the built-in lists are core (plugin_overlay.js), and the core is immutable
//   (EXTENSION-LAYER LAW, erp/tests/witness_core_untouched.js).
// §5.26 G6b: when the site has a copy (capex/site_copy.json, written by the small job capex/tools/legacy_snapshot.js beside the app), it is mirrored into main at every start. No file = no change.
import { applyCopy } from './legacy_copy.mjs';
export const manifest = {
  id: 'org.bimootb.capex',
  name: 'CAPEX Dashboard',
  version: '1.0.3',
  engineVersion: '>=0.9.0',
  requires: {},
  packs: ['capex_2pack/2Pack_1.0.0.zip', 'capex_2pack/2Pack_1.0.1.zip', 'capex_2pack/2Pack_1.0.2.zip']   // 1.0.0 = R0 + G2 + G3; 1.0.1 = G4 (the bucket tiles, §5.20); 1.0.2 = G7 (targets, §5.27)
};
export async function activate(ctx) {
  console.log('§CAPEX-PLUGIN start (the 2Pack rows are applied by the host Pack In before this runs)');
  let snap = null, why = '';
  try { const r = await fetch(new URL('../site_copy.json', import.meta.url), { cache: 'no-store' }); if (r.ok) snap = await r.json(); else why = 'HTTP ' + r.status; } catch (e) { why = e.message; }
  if (!snap) { console.log('§DASH_SYNC none (' + why + ')'); return; }
  const t0 = Date.now(), res = applyCopy(ctx.db, snap, m => console.log(m)), heap = globalThis.performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  const age = snap.meta && snap.meta.takenAt ? Math.round((Date.now() - Date.parse(snap.meta.takenAt)) / 60000) : null;
  console.log('§DASH_SYNC done client=' + res.client + ' takenAt=' + (snap.meta && snap.meta.takenAt) + ' age=' + age + 'min ms=' + (Date.now() - t0) + ' heapMB=' + heap);
}
export async function deactivate() { console.log('§CAPEX-PLUGIN stop (packed-in rows are dictionary data: kept, as legacy keeps them)'); }
