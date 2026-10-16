/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// navigate_find.js — S233 Section A: Find Panel
// Extracted from navigate.js. Interface: NavigateFind.init(A, nav, getStartNavigation)
// navigate_find.js reads: A.db, A.activeBuilding, A.scene, A.inputWasVoice,
//   A.walkModeActive, A.status, A.ifc2three, A.findMeshByGuid, A.buildingCentres
// navigate_find.js calls: A.stopNavigation, A.clearRouteCache (set by navigate.js)
// navigate_find.js exposes: A.openFindPanel, A.closeFindPanel, A.clearHighlight
// Witness: W-NAV

(function() {
  'use strict';

  function init(A, nav, getStartNavigation) {
    'use strict';
    // Body split move-only into nf_ui_history.js, nf_tree_lens.js, nf_highlight_cost.js, nf_room.js, nf_trees.js, nf_isolate_drill.js, nf_panel_search.js (loaded before this file) by scripts/split_closure.js
    // (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md). Each part is a generator: phase 1 (to its `yield`) hoists its
    // functions/vars and publishes shared names on NF; phase 2 runs its original statements, parts in original order.
    var R = (typeof window !== 'undefined' ? window : globalThis).__navigateFindParts || {};
    var ORDER = ["ui_history","tree_lens","highlight_cost","room","trees","isolate_drill","panel_search"];
    var missing = ORDER.filter(function (n) { return typeof R[n] !== 'function'; });
    if (missing.length) { console.warn('§SPLIT_PART_MISSING navigate_find ' + missing.join(',')); return; }
    var NF = {};
    var parts = ORDER.map(function (n) { return R[n](NF, A, nav, getStartNavigation); });
    parts.forEach(function (p) { p.next(); });   // phase 1
    parts.forEach(function (p) { p.next(); });   // phase 2
  }

  console.log('§NAV_FIND_VERSION v41 — yellow-outline + focus-bg(tree+results) + adjustable-panel');
  window.NavigateFind = { init: init };

  // §MERGE-GHOST auto-trigger: open viewer with #...ghost → build the merged glass shell with no taps.
  // Loads the lens module (so _mergeGhost exists) once geometry is streamed, then builds once.
  // NOTE: read location.SEARCH (query) — the viewer rewrites location.hash with live camera coords,
  // which wipes a #ghost flag before geometry streams. The query string survives. (hash kept as fallback.)
  if (typeof window !== 'undefined' && location && /ghost/.test(location.search + location.hash)) {
    var _mgTries = 0, _mgPoll = setInterval(function () {
      _mgTries++;
      var A = window.APP || window.A;
      if (!A) { if (_mgTries > 200) clearInterval(_mgPoll); return; }
      var ready = A.meshCache && Object.keys(A.meshCache).length > 20;
      if (!ready) { if (_mgTries > 200) clearInterval(_mgPoll); return; }
      if (typeof window._mergeGhost !== 'function') { if (A.loadNavigate) A.loadNavigate(); return; }
      // §FLY-NO-AUTO-GHOST (2026-07-16, live report "bboxes turning on after some secs"): the Fly
      // tour lazy-loads this module (ensureRooms pre-step), which armed this ghost=1 auto-trigger
      // MID-FLIGHT — the shell built under the running tour. Never build while a tour is active;
      // keep polling and build once the tour ends. Non-tour behavior unchanged.
      if (A.walkMode || A.flyActive || A._flyPreparing) return;
      // §STILL_GHOST_OWNERSHIP (2026-09-24, red1 "Alt+S goes into bboxes"): Alt+S's §STILL_ROOMS lazy-loads this module too,
      // which armed this trigger MID-STILL and swapped the model to ghost boxes under the photo. Same rule as the tour:
      // wait while an Alt+S still is locked, staged or refining; build once it is released.
      // M2 (2026-09-26, red1 "after alt-s escape ... rooftop solar panels and cafeteria tables goes missing"): holding was not
      // enough — the trigger fired on Esc and swapped the model for 4,518 ARC/STR boxes (0 solid triangles drawn). ghost=1 is
      // the landing's default link format, so a module load made by Alt+S / Alt+C for its rooms is not a request for the ghost:
      // skip the auto-shell for good on this page (Alt+X still toggles it by hand).
      if (A._navLoadedBy === 'still' || A._navLoadedBy === 'cinema') { clearInterval(_mgPoll); console.log('[MG] §SHELL_GHOST_AUTO skipped (navigate module loaded by ' + A._navLoadedBy + ', not a ghost request)'); return; }
      if (A._stillLockOn || A._stillRefineActive || A._photoStagingOn) { if (!A._ghostAutoHeldLogged) { A._ghostAutoHeldLogged = true; console.log('[MG] §STILL_GHOST_OWNERSHIP autoBuildHeld=1 (Alt+S still active)'); } return; }
      clearInterval(_mgPoll);
      console.log('[MG] §SHELL_GHOST_AUTO meshCacheKeys=' + Object.keys(A.meshCache).length + ' (deferred build)');
      // build AFTER the panel is interactive — never block open
      var _go = function () {
        if (A._stillLockOn || A._stillRefineActive || A._photoStagingOn) { setTimeout(_go, 1000); return; }   // §STILL_GHOST_OWNERSHIP: a still began meanwhile
        window._mergeGhost();
      };
      if (window.requestIdleCallback) requestIdleCallback(_go, { timeout: 2000 }); else setTimeout(_go, 600);
    }, 400);
  }

})();
