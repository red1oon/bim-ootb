/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_assembler.js — Wiring Layer for Grid Module Family
 *
 * Single entry point: GridAssembler.init(APP)
 * Replaces direct setupGridOverlay(APP) call in main.js.
 *
 * Dependency graph (load order):
 *   grid_dims.js      → GridDims       (grid detection — no deps)
 *   grid_config.js    → GridConfig     (view config JSON — no deps)
 *   grid_views.js     → GridViews      (camera/clip — needs GridConfig)
 *   grid_door_arcs.js → DoorArcs       (door swing arcs — no deps)
 *   section_cut.js    → SectionCut     (mesh slicing — no deps)
 *   grid_overlay.js   → setupGridOverlay (scene/panel — needs GridDims, GridViews)
 *   grid_assembler.js → GridAssembler  (this file — needs all above)
 *
 * Log tag: §GRID_ASSEMBLE
 */
var GridAssembler = (function() {
  'use strict';

  // ── Module Registry ───────────────────────────────────────────────
  var MODULES = {
    GridDims:         { required: true,  desc: 'grid detection' },
    GridConfig:       { required: true,  desc: 'view config' },
    GridViews:        { required: true,  desc: 'camera/clip/theme' },
    DoorArcs:         { required: false, desc: 'door swing arcs' },
    SectionCut:       { required: false, desc: 'mesh slicing engine' },
    Elevation:        { required: false, desc: 'elevation projection engine' },
    GridContours:     { required: false, desc: '2D contour/edge renderer' },
    DimChains:        { required: false, desc: 'dimension chain renderer' },
    GridDrag:         { required: false, desc: 'grid line drag editing' },
    setupGridOverlay: { required: true,  desc: 'grid scene/panel' }
  };

  function log(msg) { console.log('[GridAssembler] ' + msg); }

  /** Check which modules are loaded */
  function checkModules() {
    var ok = true;
    var loaded = [];
    var missing = [];
    for (var name in MODULES) {
      var present = (name === 'setupGridOverlay')
        ? typeof setupGridOverlay === 'function'
        : typeof window[name] !== 'undefined';
      if (present) {
        loaded.push(name);
      } else {
        if (MODULES[name].required) {
          log('§GRID_ASSEMBLE MISSING required: ' + name + ' (' + MODULES[name].desc + ')');
          ok = false;
        }
        missing.push(name + (MODULES[name].required ? ' (REQUIRED)' : ' (optional)'));
      }
    }
    log('§GRID_ASSEMBLE loaded=[' + loaded.join(', ') + ']');
    if (missing.length) log('§GRID_ASSEMBLE missing=[' + missing.join(', ') + ']');
    return ok;
  }

  /**
   * Initialize the entire grid module family.
   * Call this once from main.js instead of setupGridOverlay(APP).
   *
   * @param {Object} APP — the viewer application object
   * @returns {boolean} true if init succeeded
   */
  function init(APP) {
    if (!checkModules()) {
      log('§GRID_ASSEMBLE FAIL — required modules missing');
      return false;
    }

    // Wire grid overlay (scene objects, panel, dimensions)
    setupGridOverlay(APP);

    log('§GRID_ASSEMBLE OK — APP.toggleGridOverlay ready');
    return true;
  }

  return {
    init:         init,
    checkModules: checkModules,
    MODULES:      MODULES
  };
})();
