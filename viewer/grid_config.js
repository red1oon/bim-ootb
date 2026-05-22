/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_config.js — View Configuration (JSON strategy)
 *
 * Data-driven config for view presets: what to clip, what to retain,
 * how to style contours and edges. No logic — pure data.
 *
 * To add a retained class: add it to the retain array.
 * To change a line weight: edit the styles entry.
 * To add a new view: add a views entry + matching VIEW_DEFS in grid_views.js.
 */
var GridConfig = (function() {
  'use strict';

  // ── Shared Data (DRY) ──────────────────────────────────────────────

  var FLOOR_RETAIN = [
    'IfcFurnishingElement',
    'IfcFurniture',
    'IfcFlowTerminal',
    'IfcSanitaryTerminal',
    'IfcElectricalAppliance',
    'IfcLightFixture',
    'IfcBuildingElementProxy',
    'IfcCovering'
  ];

  var FLOOR_STYLES = {
    'IfcWall':              { color: '#000000', weight: 3.0 },
    'IfcWallStandardCase':  { color: '#000000', weight: 3.0 },
    'IfcColumn':            { color: '#111111', weight: 2.0 },
    'IfcDoor':              { color: '#555555', weight: 1.0, arc: true },
    'IfcWindow':            { color: '#6699BB', weight: 0.5 },
    'IfcSlab':              { color: '#BBBBBB', weight: 0.3 },
    'IfcFurnishingElement': { color: '#999999', weight: 0.5 },
    'IfcFurniture':         { color: '#999999', weight: 0.5 },
    'IfcStair':             { color: '#777777', weight: 1.0 },
    'IfcRailing':           { color: '#CCCCCC', weight: 0.3 }
  };

  var ELEVATION_STYLES = {
    'IfcWall':              { color: '#000000', weight: 2.5 },
    'IfcWallStandardCase':  { color: '#000000', weight: 2.5 },
    'IfcRoof':              { color: '#000000', weight: 2.5 },
    'IfcSlab':              { color: '#666666', weight: 1.5 },
    'IfcColumn':            { color: '#333333', weight: 2.0 },
    'IfcWindow':            { color: '#444444', weight: 1.0 },
    'IfcDoor':              { color: '#444444', weight: 1.0 },
    'IfcCurtainWall':       { color: '#444444', weight: 1.0 },
    'IfcPlate':             { color: '#444444', weight: 0.5 },
    'IfcBeam':              { color: '#888888', weight: 0.5 },
    'IfcMember':            { color: '#888888', weight: 0.5 },
    'IfcStair':             { color: '#666666', weight: 1.0 },
    'IfcRailing':           { color: '#AAAAAA', weight: 0.3 }
  };

  var LEVEL_MARKERS = {
    enabled: true,
    style: { color: '#666666', weight: 0.5, dash: [0.3, 0.15] },
    labelStyle: { color: '#333333', fontSize: 14 }
  };

  // ── Default style (fallback when no class-specific style) ─────────
  var defaultStyle = { color: '#666666', weight: 0.5 };

  // ── Per-View Configuration ────────────────────────────────────────
  var views = {

    // ── Floor Plans ─────────────────────────────────────────────────

    floor: {
      contourMode: 'section',
      clip: { mode: 'horizontal', offset_m: 1.0 },
      retain: FLOOR_RETAIN,
      retain_mode: 'project_top',
      styles: FLOOR_STYLES
    },

    floor1: {
      contourMode: 'section',
      clip: { mode: 'horizontal', offset_ratio: 0.55 },
      retain: FLOOR_RETAIN,
      retain_mode: 'project_top',
      styles: FLOOR_STYLES
    },

    // ── Elevation Views ─────────────────────────────────────────────

    front: {
      contourMode: 'elevation',
      clip: null,
      retain: [],
      styles: ELEVATION_STYLES,
      levelMarkers: LEVEL_MARKERS
    },

    rear: {
      contourMode: 'elevation',
      clip: null,
      retain: [],
      styles: ELEVATION_STYLES,
      levelMarkers: LEVEL_MARKERS
    },

    left: {
      contourMode: 'elevation',
      clip: null,
      retain: [],
      styles: ELEVATION_STYLES,
      levelMarkers: LEVEL_MARKERS
    },

    right: {
      contourMode: 'elevation',
      clip: null,
      retain: [],
      styles: ELEVATION_STYLES,
      levelMarkers: LEVEL_MARKERS
    },

    // ── Roof ────────────────────────────────────────────────────────

    roof: {
      contourMode: null,
      clip: null,
      retain: [],
      styles: {}
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────

  return {
    defaultStyle: defaultStyle,
    views: views,

    retainSet: function(mode) {
      var view = views[mode];
      if (!view || !view.retain) return {};
      var set = {};
      for (var i = 0; i < view.retain.length; i++) set[view.retain[i]] = 1;
      return set;
    },

    styleFor: function(mode, ifcClass) {
      var view = views[mode];
      if (!view || !view.styles) return defaultStyle;
      return view.styles[ifcClass] || defaultStyle;
    },

    clipFor: function(mode) {
      var view = views[mode];
      return (view && view.clip) ? view.clip : null;
    },

    contourModeFor: function(mode) {
      var view = views[mode];
      return (view && view.contourMode) ? view.contourMode : null;
    },

    levelMarkersFor: function(mode) {
      var view = views[mode];
      return (view && view.levelMarkers) ? view.levelMarkers : null;
    }
  };
})();
