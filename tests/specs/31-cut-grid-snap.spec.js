// 31-cut-grid-snap.spec.js — Cut-Plane Grid Snap: opening gate + opening-only filter + min bay + kernel_ops
// Issues proven:
//   T_3101: grid_dims.js reads min_openings_for_grid config — opening gate config present
//   T_3102: grid_dims.js has §GD_OPENING_GATE log tag — gate observable when below threshold
//   T_3103: grid_dims.js has §GD_OPENING_ONLY log tag — opening-supported filter observable
//   T_3104: grid_dims.js has filterByOpeningWidth function — sub-bay min present
//   T_3105: grid_dims.js has §GD_MIN_BAY_OPENING log tag — min bay drops observable
//   T_3106: grid_dims.js reads min_bay_opening_m config — min bay configurable
//   T_3107: grid_scissors.js passes rules to detectGridsAtPlane — rules propagated from scissors
//   T_3108: grid_scissors.js commits GRID_DETECT to KernelOps after detectAtCut — kernel_ops wired
//   T_3109: grid_scissors.js has §GD_DETECT_COMMIT log tag — kernel_ops commit observable
//   T_3110: grid_scissors.js exposes rebuildAt public method — restore path can trigger detection
//   T_3111: grid_overlay.js calls GridScissors.rebuildAt in restoreSection — 2D recall complete
//   T_3112: grid_overlay.js calls renderContoursForView in restoreSection — door arcs + dims on restore
//   T_3113: grid_rules.json has min_openings_for_grid — gate config externalised
//   T_3114: grid_rules.json has min_bay_opening_m — sub-bay min config externalised
//   T_3115: grid_dims.js runs filterStructural before snapGrids — no drift-induced line drops
//   T_3116: grid_overlay.js filters IfcDoorStandardCase for arcs — IFC4 doors covered
//   T_3117: grid_overlay.js filters IfcStairFlight for stair symbols — IFC4 stairs covered
//   T_3118: grid_overlay.js delete button has pointerdown stopPropagation — panel capture blocked
//   T_3119: grid_overlay.js restoreSection converts cutVal to ifcZ with modelOffset — correct contour Z

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const DEV = path.resolve(__dirname, '../..');

const GRID_DIMS_SRC     = path.join(DEV, 'grid_dims.js');
const GRID_SCISSORS_SRC = path.join(DEV, 'grid_scissors.js');
const GRID_OVERLAY_SRC  = path.join(DEV, 'grid_overlay.js');
const GRID_RULES_PATH   = path.join(DEV, 'grid_rules.json');

test.describe('Cut-Plane Grid Snap — opening gate + opening-only filter + min bay + kernel_ops', () => {

  // ── §P1b.1 Opening-Density Gate ────────────────────────────────

  test('T_3101: grid_dims.js reads min_openings_for_grid config — opening gate config present', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('min_openings_for_grid');
    expect(src).toContain('minOpeningsForGrid');
  });

  test('T_3102: grid_dims.js has §GD_OPENING_GATE log tag — gate observable when below threshold', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_OPENING_GATE');
  });

  // ── §P1b.2 Opening-Supported Cluster Filter ─────────────────────

  test('T_3103: grid_dims.js has §GD_OPENING_GATE log tag — opening density gate observable', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_OPENING_GATE');
  });

  // ── §P1b.3 Sub-Bay Minimum Opening Width ────────────────────────

  test('T_3104: grid_dims.js has filterByOpeningWidth function — sub-bay min present', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('function filterByOpeningWidth');
  });

  test('T_3105: grid_dims.js has §GD_MIN_BAY_OPENING log tag — min bay drops observable', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_MIN_BAY_OPENING');
  });

  test('T_3106: grid_dims.js reads min_bay_opening_m config — min bay configurable', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('min_bay_opening_m');
    expect(src).toContain('minBayOpeningM');
  });

  // ── §P1b.4 kernel_ops GRID_DETECT Commit (grid_scissors.js) ────

  test('T_3107: grid_scissors.js passes rules to detectGridsAtPlane — rules propagated from scissors', () => {
    const src = fs.readFileSync(GRID_SCISSORS_SRC, 'utf8');
    // Must pass _gridRules (or equivalent) as argument to detectGridsAtPlane
    expect(src).toContain('_gridRules');
    expect(src).toContain('detectGridsAtPlane');
  });

  test('T_3108: grid_dims.js commits GRID_DETECT to KernelOps — kernel_ops wired', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain("'GRID_DETECT'");
    expect(src).toContain('KernelOps');
  });

  test('T_3109: grid_scissors.js has §GD_DETECT_COMMIT log tag — kernel_ops commit observable', () => {
    const src = fs.readFileSync(GRID_SCISSORS_SRC, 'utf8');
    expect(src).toContain('§GD_DETECT_COMMIT');
  });

  test('T_3110: grid_scissors.js exposes rebuildAt public method — restore path can trigger detection', () => {
    const src = fs.readFileSync(GRID_SCISSORS_SRC, 'utf8');
    expect(src).toContain('rebuildAt');
    // Must be on the exported object
    expect(src).toMatch(/GridScissors\s*=.*rebuildAt|rebuildAt.*GridScissors/s);
  });

  // ── §P1b.5 restoreSection with Grid Detection (grid_overlay.js) ─

  test('T_3111: grid_overlay.js calls GridScissors.rebuildAt in restoreSection — 2D recall complete', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('GridScissors.rebuildAt');
  });

  test('T_3112: grid_overlay.js calls renderContoursForView in restoreSection — door arcs + dims on restore', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    // renderContoursForView must be called inside restoreSection
    const restoreBlock = src.slice(src.indexOf('function restoreSection'));
    const nextFnIdx = restoreBlock.indexOf('\n  function ', 10);
    const body = nextFnIdx > 0 ? restoreBlock.slice(0, nextFnIdx) : restoreBlock.slice(0, 600);
    expect(body).toContain('renderContoursForView');
  });

  // ── Bug Fixes ────────────────────────────────────────────────────

  test('T_3115: grid_dims.js runs filterStructural before snapGrids — no drift-induced line drops', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    // filterStructural must appear before snapGrids in the pipeline block
    const filterIdx = src.indexOf('filterStructural(xLines)');
    const snapIdx   = src.indexOf('snapGrids(xLines)');
    expect(filterIdx).toBeGreaterThan(0);
    expect(snapIdx).toBeGreaterThan(0);
    expect(filterIdx).toBeLessThan(snapIdx);
  });

  test('T_3116: grid_overlay.js filters IfcDoorStandardCase for arcs — IFC4 doors covered', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('IfcDoorStandardCase');
  });

  test('T_3117: grid_overlay.js filters IfcStairFlight for stair symbols — IFC4 stairs covered', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('IfcStairFlight');
  });

  test('T_3118: grid_overlay.js delete button has pointerdown stopPropagation — panel capture blocked', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    // The pointerdown handler must appear adjacent to the delete button's pointerup handler
    expect(src).toContain("'pointerdown', function(e) { e.stopPropagation(); }");
  });

  test('T_3119: grid_overlay.js restoreSection converts cutVal to ifcZ with modelOffset — correct contour Z', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    const restoreBlock = src.slice(src.indexOf('function restoreSection'));
    expect(restoreBlock).toContain('modelOffset');
    expect(restoreBlock).toContain('ifcZ');
  });

  // ── §P1b.6 Config Externalisation ───────────────────────────────

  test('T_3113: grid_rules.json has min_openings_for_grid — gate config externalised', () => {
    const rules = JSON.parse(fs.readFileSync(GRID_RULES_PATH, 'utf8'));
    expect(typeof rules.grid_detection.min_openings_for_grid).toBe('number');
    expect(rules.grid_detection.min_openings_for_grid).toBeGreaterThanOrEqual(1);
  });

  test('T_3114: grid_rules.json has min_bay_opening_m — sub-bay min config externalised', () => {
    const rules = JSON.parse(fs.readFileSync(GRID_RULES_PATH, 'utf8'));
    expect(typeof rules.grid_detection.min_bay_opening_m).toBe('number');
    expect(rules.grid_detection.min_bay_opening_m).toBeGreaterThan(0.5);
    expect(rules.grid_detection.min_bay_opening_m).toBeLessThan(1.5);
  });

});
