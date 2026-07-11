/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// common/room_habitability.js — §ROOM-HAB shared classifier.
// Implementing bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md
// §2 Task 1 — Witness: W-ROOM-HAB (5/5, ROOM_INJECTION_HYBRID.md §6 S1) + W-VIEWER-ROOM-HAB.
//
// spaceHabitable() is ported VERBATIM (same tokens, same exclude-list, same zband tolerance) from
// bim-ootb modeller/disc_walker.js on the unmerged branch fable/modeller-lod400-livewire @ 2821b8e
// (the branch where ROOM_INJECTION_HYBRID.md §6's Task 5 classifier was built and witnessed
// W-ROOM-HAB 5/5). This file exists so the Modeller (disc_walker.js spacesOf(), once that branch
// merges) and the Viewer (navigate_find.js _allRoomVolumes(), wired below) call the SAME
// enforcement point instead of two copies that can drift apart — per this doc's §3 guardrail,
// checked before writing this file: both apps load plain <script> tags (no bundler/ES-modules;
// viewer/main.js's APP.loadNavigate() appends navigate_find.js etc. as plain <script src=...>,
// modeller/modeller.html loads disc_walker.js the same way), and both already share files this
// way via the existing common/ directory (common/pill_builder.js, common/history_tap.js). A real
// shared module is therefore the natural fit here, not a copy-paste port.
//
// Real-vs-synthetic (RM_/≈ guid+name tagging) is a SEPARATE, already-solved concern (spacesOf()'s
// own guid NOT LIKE 'RM\_%' exclusion) — this classifier only answers "is this honestly-extracted
// IfcSpace row a HABITABLE room," not "is this row synthetic." A synthetic COMPILED row (object_type
// ='COMPILED') never carries a real space-type label, so it normalizes to 'COMPILED' and never
// matches the exclude-list below — it passes this filter (correctly; its exclusion from placement
// is a different, already-existing mechanism).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RoomHabitability = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Verbatim from disc_walker.js's NONHAB_TYPES (ROOM_INJECTION_HYBRID.md §6 S1 Signal A) —
  // grows only by review against real extractions, never guessed further.
  var NONHAB_TYPES = ['ROOF', 'SHAFT', 'VOID', 'PLANT', 'PLANT_ROOM', 'EXTERNAL', 'PODIUM',
    'SILL', 'PARAPET', 'BALCONY'];

  // Verbatim from disc_walker.js's spaceHabitable(space, env, excludeList).
  // space: {label, z1} (z1 = top of the space's bbox); env: {z1} (substrate envelope top), or null.
  function spaceHabitable(space, env, excludeList) {
    var list = excludeList || NONHAB_TYPES;
    var norm = String(space.label || '').toUpperCase().replace(/[\s]+/g, '_')
      .replace(/[_\s]*\d+$/, '').trim();
    var toks = norm.split('_');
    for (var i = 0; i < list.length; i++)
      if (norm === list[i] || toks.indexOf(list[i]) >= 0) return { ok: false, why: 'label:' + list[i] };
    if (env && env.z1 != null && space.z1 > env.z1 + 0.25)
      return { ok: false, why: 'zband:' + space.z1.toFixed(2) + '>' + env.z1.toFixed(2) };
    return { ok: true };
  }

  return { spaceHabitable: spaceHabitable, NONHAB_TYPES: NONHAB_TYPES };
});
