/**
 * BIM OOTB — effects.js — EffectComposer post-processing pipeline
 * Extracted from scene.js (S278 Phase 3)
 * SSAO + OutlinePass + OutputPass. Desktop only — skipped on mobile.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// Implementing S278_REFACTOR_CLASH_PANELS.md §Phase 3 — Witness: W-EFFECTS
async function setupEffects(A, renderer, scene, camera) {
  // <split-driver> (readUnsplit() in viewer/tests/_split_families.js rebuilds the original body here)
  // Body split move-only into fx_composer.js, fx_props_staffage.js, fx_sun_shadow.js, fx_photo_staging.js, fx_still_refine.js, fx_cpe_reveal_bands.js, fx_cinema_path_plan.js, fx_cinema_orbit.js (loaded before this file) by scripts/split_closure.js
  // (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md). Each part is a generator: phase 1 (to its `yield`) hoists its
  // functions/vars and publishes shared names on FXS; phase 2 runs its original statements, parts in original order.
  var R = (typeof window !== 'undefined' ? window : globalThis).__effectsParts || {};
  var ORDER = ["composer","props_staffage","sun_shadow","photo_staging","still_refine","cpe_reveal_bands","cinema_path_plan","cinema_orbit"];
  var missing = ORDER.filter(function (n) { return typeof R[n] !== 'function'; });
  if (missing.length) { console.warn('§SPLIT_PART_MISSING effects ' + missing.join(',')); return; }
  var FXS = {};
  var parts = ORDER.map(function (n) { return R[n](FXS, A, renderer, scene, camera); });
  for (var i = 0; i < parts.length; i++) { var r1 = parts[i].next(); if (r1 && typeof r1.then === 'function') await r1; }
  for (var j = 0; j < parts.length; j++) { var r2 = parts[j].next(); if (r2 && typeof r2.then === 'function') r2 = await r2;
    if (r2 && r2.value && r2.value.__splitReturn) return r2.value.value; }   // an early `return` in the original stops the whole setup
  // </split-driver>
}
