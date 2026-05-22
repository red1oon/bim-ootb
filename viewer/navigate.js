/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// navigate.js — S233: Find & Navigate — bootstrap / orchestrator
// Sub-modules loaded before this file (in order):
//   navigate_find.js    → NavigateFind   (Section A: find panel, highlight, entrance)
//   navigate_grid.js    → NavigateGrid   (Sections B/B3/B4: grid, A*, route templates)
//   navigate_path.js    → NavigatePath   (Section C: multi-storey path builder)
//   navigate_engine.js  → NavigateEngine (Section D: turn-by-turn engine)
//   navigate_controls.js→ NavigateControls (Section E: keyboard, pointer lock, preprocess)
// Implementing S233_find_and_navigate.md — Witness: W-NAV

function setupNavigate(A) {
  'use strict';

  // ── Shared nav state — passed by reference to all sub-modules ──
  var nav = {
    results: [],       // [{guid, ifc_class, element_name, storey, discipline, cx, cy, cz}]
    activeIdx: -1,     // selected result index
    waypoints: [],     // [{x,y,z, storey}] in IFC coords
    stepIdx: 0,        // current waypoint index
    active: false,     // navigation in progress
    voiceMode: false,  // speak direction cues
    grid: null,        // occupancy grid for current storey
    gridCache: {},     // storey → grid
    pointerLocked: false,
  };

  A.navActive = false;
  A.navCurrentStep = 0;

  // ── Init sub-modules in dependency order ──
  // A: find panel (creates DOM, exposes openFindPanel, clearHighlight, etc.)
  if (typeof NavigateFind !== 'undefined') {
    NavigateFind.init(A, nav, function() { return A.startNavigation; });
  }
  console.log('[S233] §NAV_FIND_WIRED openFindPanel=' + (typeof A.openFindPanel));

  // B/B3/B4: occupancy grid + A* + route templates
  if (typeof NavigateGrid !== 'undefined') {
    NavigateGrid.init(A, nav);
  }

  // C: multi-storey path builder (calls NavigateGrid functions via A)
  if (typeof NavigatePath !== 'undefined') {
    NavigatePath.init(A, nav);
  }

  // D: turn-by-turn engine (calls NavigatePath + NavigateFind functions via A)
  if (typeof NavigateEngine !== 'undefined') {
    NavigateEngine.init(A, nav);
  }

  // E: keyboard, pointer lock, voice, preprocessing (calls NavigateEngine + NavigateGrid)
  if (typeof NavigateControls !== 'undefined') {
    NavigateControls.init(A, nav);
  }
}
