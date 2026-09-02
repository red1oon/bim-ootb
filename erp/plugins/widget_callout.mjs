// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// widget_callout.mjs — C-1 witness bundle (prompts/PLUGIN_SYSTEM_LANE.md §Phase C).
// Single-file .foldbundle: one ES module = manifest + activate + deactivate. Contributes ONE callout into
// the live ad_callout REGISTRY (no new abstraction) — fires on M_Product.Name and uppercases it.
export const manifest = {
  id: 'com.example.widget-callout',
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {},
  contributions: { callout: { module: 'self', tables: ['M_Product'] } }
};

const HANDLER = 'com.example.WidgetCallout.upperName';

export async function activate(ctx) {
  // Register into the SAME ad_callout registry the engine already dispatches through (registerHandler pattern).
  ctx.callout.registerHandler(HANDLER, function (c, info) {
    var r = info.record || {};
    var name = r.Name != null ? r.Name : r.name;
    return { derived: { Name: String(name == null ? '' : name).toUpperCase() } };
  });
}

export async function deactivate(ctx) {
  // ad_callout exposes its REGISTRY object — drop our handler on stop (best-effort cleanup).
  if (ctx.callout && ctx.callout.REGISTRY) delete ctx.callout.REGISTRY[HANDLER];
}
