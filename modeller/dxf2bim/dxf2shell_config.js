// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2shell_config.js — the ONE configuration of the basic-shapes pipeline (docs/DXF2BIM_BASIC_SHAPES_SPEC.md §1, §11).
// Shared by tests/dxf2bim/rosetta_dx_shell.js (Node witness) and the Modeller import (bim-ootb modeller/dxf2bim_import.js,
// copied verbatim) so both runs use the SAME numbers. Values moved verbatim from rosetta_dx_shell.js @ b4739b50a; nothing new.
// NO wall/door/window heights and NO slab values here. elev_tol, gap_min/gap_max, min_thickness, host_tol, door.min_width: SANDBOX.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2ShellConfig = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAP_PLAN = { version: 1, rules: [
    { match: 'exact', pattern: 'A-WALL-FULL', type: 'wall' }, { match: 'exact', pattern: 'A-WALL-PRTN', type: 'wall' }, { match: 'exact', pattern: 'A-WALL-PATT', type: 'ignore' },
    { match: 'exact', pattern: 'A-DOOR', type: 'opening' }, { match: 'exact', pattern: 'A-GLAZ', type: 'glazing' },
    { match: 'exact', pattern: 'A-GRID', type: 'ignore' }, { match: 'exact', pattern: 'A-ANNO-TEXT', type: 'ignore' }, { match: 'exact', pattern: 'A-ANNO-DIMS', type: 'ignore' },
    { match: 'exact', pattern: 'A-FURN', type: 'ignore' }, { match: 'exact', pattern: 'A-TTLB', type: 'ignore' }, { match: 'exact', pattern: '0', type: 'ignore' }] };
  var MAP_ELEV = { version: 1, rules: [{ match: 'exact', pattern: 'A-GLAZ', type: 'glazing' }, { match: 'exact', pattern: 'A-ELEV-WALL', type: 'elevwall' }, { match: 'exact', pattern: 'A-DOOR', type: 'elevdoor' }] };
  var MAP_LEVL = { version: 1, rules: [{ match: 'exact', pattern: 'A-ANNO-LEVL', type: 'levelline' }, { match: 'exact', pattern: 'A-ELEV-LEVL', type: 'levelline' }] };
  var MAP_ROOF = { version: 1, rules: [{ match: 'exact', pattern: 'A-ROOF', type: 'roof' }, { match: 'exact', pattern: 'A-GLAZ', type: 'glazing' }] };
  var CFG = { version: 1, units: 'mm', snap_tol: 0.001, elev_tol: 0.003, host_tol: 0.3, align_tol: 0.05, wall_mode: 'footprint',
    wall: { height_from_elevation: true, min_thickness: 0.05, polygon_footprint: true }, opening: { door: { from_elevation: true, min_width: 0.5 }, window: { from_elevation: true }, gap_min: 0.3, gap_max: 5 } };
  // type binding (rosetta_dx_types chain): SANDBOX sets by id prefix, prefer DUPLEX_NOMINAL; fills: size_tol
  var TYPES = { size_tol: 0.005, prefer: ['DUPLEX_NOMINAL'], sets: [['DUPLEX_', 'DUPLEX_NOMINAL'], ['US_', 'US_BBOX']] };
  var FILL = { size_tol: 0.005 };
  var MARK_ALIGN_TOL = 0.001;   // plan<->elevation grid alignment tolerance (as rosetta_dx_shell.js MK.align(..., 0.001))
  function setOf(id) { for (var i = 0; i < TYPES.sets.length; i++) if (id.indexOf(TYPES.sets[i][0]) === 0) return TYPES.sets[i][1]; return undefined; }
  // §11 run_id: identity of the drawing set + this config (NOT of the library: fills are a separate, reported input).
  // storeyRuns = Dxf2Bim.run run_id per storey plan in level order; sheetHashes = sha256 hex of every sheet text used.
  // §13 (2026-10-16): `maps` (optional) = the layer maps the run used ({plan, elev, levl, roof[, sect]}); omitted = the DX maps (the DX run_id is unchanged).
  function runId(canon, hashHex, storeyRuns, sheetHashes, maps) {
    return hashHex(canon({ pipeline: 'dxf2shell', storey_runs: storeyRuns.slice(), sheets: sheetHashes.slice().sort(), config: CFG, maps: maps || { plan: MAP_PLAN, elev: MAP_ELEV, levl: MAP_LEVL, roof: MAP_ROOF } }));
  }
  // §13: moved VERBATIM from tests/dxf2bim/set_configs.js (STD maps, DX_QUALIFY) and rosetta_dx_shell.js (CASING) so the Modeller copy runs the
  // std set with the same values. STD: the L1 standard set (2D_Layout/python/std2d.py), lane spec L2.3, built from the R12 layer names.
  var CASING = 0.076;   // R1b door casing (rosetta_dx_shell.js; L2.7 rule 2 passes it as the schedule head frame)
  var QUALIFY = { tol: { grid: 0.010 /* L1.1 R5 grid_merge_tol */, dim: 0.0005 /* L1 W3 */, level: CFG.elev_tol /* rosetta_dx_shell CFG */, align: 0.001 /* rosetta_dx_shell MK.align call */ },
    grid: { min_wall_len: 1.0 /* L1.1 R4 */ }, layers: { grid: ['A-GRID'], dims: ['A-ANNO-DIMS'] /* NCS names, L1.1 R12 */ } };   // layers.bearing removed (L2.3 D4)
  function ign(l) { return { match: 'exact', pattern: l, type: 'ignore' }; }
  var STD = {
    // lane spec §L1.6: A-GLAZ-OVHD / A-DOOR-OVHD = dashed outlines of openings above the cut (drafting annotation; the opening is the gap + its
    // elevation, so reading them again would double count). A-FLOR-STRS (stair cut outline) and S-COLS / A-COLS (columns): the reader has no
    // stair or column shape yet, so they are excluded, stated here, not read as walls.
    MAP_PLAN: { version: 1, rules: MAP_PLAN.rules.concat(['A-GLAZ-SILL', 'A-ANNO-NOTE', 'A-ANNO-TTLB', 'A-GLAZ-OVHD', 'A-DOOR-OVHD', 'A-FLOR-STRS', 'S-COLS', 'A-COLS'].map(ign)) },
    MAP_ELEV: { version: 1, rules: [{ match: 'exact', pattern: 'A-GLAZ', type: 'glazing' }, { match: 'exact', pattern: 'A-WALL', type: 'elevwall' }, { match: 'exact', pattern: 'A-DOOR', type: 'elevdoor' }] },
    MAP_LEVL: MAP_LEVL,
    // lane spec L1.4 F4/F5: the std ROOF plan (DX roof map + the R12 annotation layers ignored) and the SECTION sheet
    MAP_ROOF: { version: 1, rules: MAP_ROOF.rules.concat(['A-GRID', 'A-ANNO-DIMS', 'A-ANNO-LEVL', 'A-ANNO-TTLB'].map(ign)) },
    MAP_SECT: { version: 1, rules: [{ match: 'exact', pattern: 'S-SLAB', type: 'sectslab' }, { match: 'exact', pattern: 'A-ROOF', type: 'roof' }, { match: 'exact', pattern: 'A-SECT', type: 'sectwall' }].concat(['A-WALL-PATT', 'A-GRID', 'A-ANNO-DIMS', 'A-ANNO-LEVL', 'A-ANNO-TTLB'].map(ign)) },
    EXCL_ELEV: { version: 1, rules: ['A-GLAZ-SILL', 'A-ROOF', 'A-GRID', 'A-ANNO-DIMS', 'A-ANNO-NOTE', 'A-ANNO-TTLB'].map(ign) },
    QUALIFY: QUALIFY };
  return { MAP_PLAN: MAP_PLAN, MAP_ELEV: MAP_ELEV, MAP_LEVL: MAP_LEVL, MAP_ROOF: MAP_ROOF, CFG: CFG, TYPES: TYPES, FILL: FILL, MARK_ALIGN_TOL: MARK_ALIGN_TOL, setOf: setOf, runId: runId,
    CASING: CASING, QUALIFY: QUALIFY, STD: STD };
});
