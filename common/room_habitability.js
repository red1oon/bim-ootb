/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * room_habitability.js — §ROOM-HAB shared classifier (VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 1).
 *
 * Real-vs-NON-HABITABLE-real-or-synthetic space classifier: excludes roof/shaft/plant voids from
 * "this is a room" surfaces (schedule placement AND display) via a label-keyword check + a
 * z-band-above-envelope geometry check. NOT a real-vs-synthetic filter (RM_/≈ prefix exclusion) —
 * that is a SEPARATE, stricter concern `modeller/disc_walker.js`'s `spacesOf()` applies on top of
 * this for placement; the Viewer's Room Lens (display-only, `viewer/navigate_find.js`) intentionally
 * shows synthetic `compile_rooms.py` rooms too (labelled honestly — see Task 3), it just must not
 * show a synthetic OR real "Roof"/"Shaft"/etc as if it were a normal room.
 *
 * PROVENANCE: ported from `modeller/disc_walker.js`'s `spaceHabitable()`/`_substrateEnv()`
 * (proven W-ROOM-HAB 5/5, W-ROOM-HAB-SH 6/6, currently live only on the unmerged bim-ootb branch
 * `fable/modeller-lod400-livewire` — main's disc_walker.js does not have this function yet).
 * Landed here as a NEW shared module rather than copy-pasted inline into navigate_find.js, per
 * VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 1's "evaluate a real shared module" instruction: both
 * modeller.html and viewer.html load plain <script> globals (no bundler/ES-modules — see the
 * `../common/pill_builder.js` / `../common/history_bar.js` precedent, already loaded by both pages),
 * so a shared `common/` file is a one-line <script> addition per page, not real plumbing.
 * ⚠ FOLLOW-UP FLAG (not done here, out of this task's scope): when `fable/modeller-lod400-livewire`
 * merges, `disc_walker.js` should be updated to delegate to `window.RoomHabitability` instead of
 * keeping its own inline copy of this logic — otherwise the two definitions can drift apart. Left
 * as a flag for whoever merges that branch, not actioned here (this task never touches disc_walker.js
 * on main, which doesn't have the function to refactor yet).
 */
(function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : {};

  // Exclude-list is verbatim from ROOM_INJECTION_HYBRID.md §6 S1 — grows only by review against
  // real extractions, never guessed.
  var NONHAB_TYPES = ['ROOF', 'SHAFT', 'VOID', 'PLANT', 'PLANT_ROOM', 'EXTERNAL', 'PODIUM',
    'SILL', 'PARAPET', 'BALCONY'];

  // Geometry signal: a space whose ceiling sits ABOVE the building's entire real-element envelope
  // is not enclosed (Duplex R301 Roof: z1 8.91 vs envelope 6.67; all 20 genuine rooms ≤ 5.61).
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

  // Substrate envelope from element_transforms (the same bbox union both disc_walker.js's
  // _substrateEnv and this classifier's zband check use). Returns null if the table/columns
  // are absent (caller should treat that as "no zband signal", label check still applies).
  function envelopeFromTransforms(dbQueryFn) {
    try {
      var rows = dbQueryFn("SELECT MIN(center_x-bbox_x/2) x0, MAX(center_x+bbox_x/2) x1, " +
        "MIN(center_y-bbox_y/2) y0, MAX(center_y+bbox_y/2) y1, MIN(center_z-bbox_z/2) z0, " +
        "MAX(center_z+bbox_z/2) z1 FROM element_transforms");
      if (!rows || !rows.length || rows[0][5] == null) return null;
      var r = rows[0];
      return { x0: r[0], x1: r[1], y0: r[2], y1: r[3], z0: r[4], z1: r[5] };
    } catch (e) { return null; }
  }

  var API = { spaceHabitable: spaceHabitable, NONHAB_TYPES: NONHAB_TYPES,
    envelopeFromTransforms: envelopeFromTransforms };
  ROOT.RoomHabitability = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
