// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// production_validator.mjs — C-2 witness bundle (prompts/PLUGIN_SYSTEM_LANE.md §Phase C).
// Contributes ONE BEFORE_SAVE model validator into the live ad_modelval REGISTRY (registerValidator pattern):
// reject an M_Production whose production qty is negative. Returns an error STRING (fireHooks aborts on the
// first non-null) — the iDempiere fireModelChange semantics.
export const manifest = {
  id: 'com.example.production-guard',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  contributions: { validator: { module: 'self', tables: ['M_Production'] } }
};

export async function activate(ctx) {
  ctx.modelval.registerValidator('M_Production', 'BEFORE_SAVE', 'ProductionGuard.qtyNonNeg', function (c, info) {
    var r = info.record || {};
    // accept either PascalCase (AD) or lowercase (sqlite) column casing, like the engine's own readers.
    var raw = r.ProductionQty != null ? r.ProductionQty
            : (r.productionqty != null ? r.productionqty : r.qty);
    var q = Number(raw);
    if (Number.isFinite(q) && q < 0) return 'M_Production.ProductionQty must be >= 0 (got ' + q + ')';
    return null;
  });
}

export async function deactivate(ctx) {
  // ad_modelval keeps an array per (table,timing); filter our hook out on stop (best-effort).
  try {
    var reg = ctx.modelval && ctx.modelval.REGISTRY;
    var slot = reg && reg['m_production'] && reg['m_production']['BEFORE_SAVE'];
    if (slot) reg['m_production']['BEFORE_SAVE'] = slot.filter(function (h) { return h.name !== 'ProductionGuard.qtyNonNeg'; });
  } catch (e) { /* leave registered if shape differs — non-fatal */ }
}
