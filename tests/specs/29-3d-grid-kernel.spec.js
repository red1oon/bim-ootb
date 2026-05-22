// 29-3d-grid-kernel.spec.js — 2D_029: 3D grid planes + kernel_ops + opening labels
// Issues proven:
//   T_2029_01: kernel_ops.js exposes window.KernelOps — §2.2 commitOp available
//   T_2029_02: kernel_ops.js has commitOp function — §2.2 write path present
//   T_2029_03: kernel_ops.js has undoOp function — §4.4 undo available
//   T_2029_04: kernel_ops.js has redoOp function — §4.4 redo available
//   T_2029_05: kernel_ops.js has replayOps function — §2.4 crash recovery path
//   T_2029_06: kernel_ops.js has §KERNEL_OP log tag — §2.5 operations observable
//   T_2029_07: kernel_ops.js has CREATE TABLE kernel_ops DDL — §2.1 schema present
//   T_2029_08: grid_overlay.js has renderGridPlanesIn3D — §3.2 3D planes function present
//   T_2029_09: grid_overlay.js has removeGridPlanes3D — §3.2 cleanup function present
//   T_2029_10: grid_overlay.js has §GRID_3D_PLANES log tag — §3.4 3D planes observable
//   T_2029_11: grid_drag.js has §GRID_3D_DRAG log tag — §4.5 3D drag observable
//   T_2029_12: grid_drag.js calls KernelOps.commitOp — §4.3 drag commits to log
//   T_2029_13: grid_door_arcs.js has addOpeningLabel — §1.3 label function present
//   T_2029_14: grid_door_arcs.js has §DOOR_ARC_LABEL log tag — §1.4 labels observable
//   T_2029_15: cost_panel.js exposes window.CostPanel — §5.2 cost panel available
//   T_2029_16: cost_panel.js has §GRID_3D_BOQ log tag — §5.3 cost query observable
//   T_2029_17: grid_rules.json has plane_3d block — §8 3D plane config externalised
//   T_2029_18: grid_rules.json has opening_label_offset_m — §8 label config externalised
//   T_2029_19: grid_overlay.js has §GRID_3D_BAND_VIS log tag — §6.4 band visibility observable
//   T_2029_20: grid_overlay.js calls KernelOps.replayOps — §2.4 replay wired on init

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const DEV = path.resolve(__dirname, '../..');

const KERNEL_OPS_SRC    = path.join(DEV, 'kernel_ops.js');
const COST_PANEL_SRC    = path.join(DEV, 'cost_panel.js');
const GRID_OVERLAY_SRC  = path.join(DEV, 'grid_overlay.js');
const GRID_DRAG_SRC     = path.join(DEV, 'grid_drag.js');
const GRID_DOOR_ARCS    = path.join(DEV, 'grid_door_arcs.js');
const GRID_RULES_PATH   = path.join(DEV, 'grid_rules.json');

test.describe('2D_029 — 3D Grid Planes + kernel_ops + Opening Labels', () => {

  // ── §2 kernel_ops.js ───────────────────────────────────────────

  test('T_2029_01: kernel_ops.js exposes window.KernelOps — §2.2 commitOp available', () => {
    const src = fs.readFileSync(KERNEL_OPS_SRC, 'utf8');
    expect(src).toContain('window.KernelOps');
  });

  test('T_2029_02: kernel_ops.js has commitOp function — §2.2 write path present', () => {
    const src = fs.readFileSync(KERNEL_OPS_SRC, 'utf8');
    expect(src).toContain('function commitOp');
    expect(src).toContain('INSERT INTO kernel_ops');
  });

  test('T_2029_03: kernel_ops.js has undoOp function — §4.4 undo available', () => {
    const src = fs.readFileSync(KERNEL_OPS_SRC, 'utf8');
    expect(src).toContain('function undoOp');
    expect(src).toContain('undone = 1');
  });

  test('T_2029_04: kernel_ops.js has redoOp function — §4.4 redo available', () => {
    const src = fs.readFileSync(KERNEL_OPS_SRC, 'utf8');
    expect(src).toContain('function redoOp');
    expect(src).toContain('undone = 0');
  });

  test('T_2029_05: kernel_ops.js has replayOps function — §2.4 crash recovery path', () => {
    const src = fs.readFileSync(KERNEL_OPS_SRC, 'utf8');
    expect(src).toContain('function replayOps');
    expect(src).toContain('ORDER BY id');
  });

  test('T_2029_06: kernel_ops.js has §KERNEL_OP log tag — §2.5 operations observable', () => {
    const src = fs.readFileSync(KERNEL_OPS_SRC, 'utf8');
    expect(src).toContain('§KERNEL_OP committed');
    expect(src).toContain('§KERNEL_OP undo');
    expect(src).toContain('§KERNEL_OP redo');
    expect(src).toContain('§KERNEL_OP replay');
  });

  test('T_2029_07: kernel_ops.js has CREATE TABLE kernel_ops DDL — §2.1 schema present', () => {
    const src = fs.readFileSync(KERNEL_OPS_SRC, 'utf8');
    expect(src).toContain('CREATE TABLE IF NOT EXISTS kernel_ops');
    expect(src).toContain('op_type TEXT NOT NULL');
    expect(src).toContain('parameters TEXT NOT NULL');
    expect(src).toContain('undone INTEGER DEFAULT 0');
  });

  // ── §3 3D Planes in grid_overlay.js ────────────────────────────

  test('T_2029_08: grid_overlay.js has renderGridPlanesIn3D — §3.2 3D planes function present', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('function renderGridPlanesIn3D');
    expect(src).toContain('PlaneGeometry');
    expect(src).toContain('gridPlanes3D');
  });

  test('T_2029_09: grid_overlay.js has removeGridPlanes3D — §3.2 cleanup function present', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('function removeGridPlanes3D');
    expect(src).toContain('.geometry.dispose()');
  });

  test('T_2029_10: grid_overlay.js has §GRID_3D_PLANES log tag — §3.4 3D planes observable', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('§GRID_3D_PLANES count=');
  });

  // ── §4 3D drag in grid_drag.js ────────────────────────────────

  test('T_2029_11: grid_drag.js has §GRID_3D_DRAG log tag — §4.5 3D drag observable', () => {
    const src = fs.readFileSync(GRID_DRAG_SRC, 'utf8');
    expect(src).toContain('§GRID_3D_DRAG axis=');
    expect(src).toContain('§GRID_3D_DRAG_END');
  });

  test('T_2029_12: grid_drag.js calls KernelOps.commitOp — §4.3 drag commits to log', () => {
    const src = fs.readFileSync(GRID_DRAG_SRC, 'utf8');
    expect(src).toContain('KernelOps.commitOp');
    expect(src).toContain("'GRID_MOVE'");
  });

  // ── §1 Opening labels in grid_door_arcs.js ────────────────────

  test('T_2029_13: grid_door_arcs.js has addOpeningLabel — §1.3 label function present', () => {
    const src = fs.readFileSync(GRID_DOOR_ARCS, 'utf8');
    expect(src).toContain('function addOpeningLabel');
    expect(src).toContain('opening_label_offset_m');
    expect(src).toContain('opening_label_font_px');
  });

  test('T_2029_14: grid_door_arcs.js has §DOOR_ARC_LABEL log tag — §1.4 labels observable', () => {
    const src = fs.readFileSync(GRID_DOOR_ARCS, 'utf8');
    expect(src).toContain('§DOOR_ARC_LABEL guid=');
    expect(src).toContain('width=');
    expect(src).toContain('tag=');
  });

  // ── §5 Cost panel ─────────────────────────────────────────────

  test('T_2029_15: cost_panel.js exposes window.CostPanel — §5.2 cost panel available', () => {
    const src = fs.readFileSync(COST_PANEL_SRC, 'utf8');
    expect(src).toContain('window.CostPanel');
    expect(src).toContain('refresh');
    expect(src).toContain('hide');
  });

  test('T_2029_16: cost_panel.js has §GRID_3D_BOQ log tag — §5.3 cost query observable', () => {
    const src = fs.readFileSync(COST_PANEL_SRC, 'utf8');
    expect(src).toContain('§GRID_3D_BOQ elements=');
    expect(src).toContain('area=');
    expect(src).toContain('vol=');
  });

  // ── §8 Rules extension ────────────────────────────────────────

  test('T_2029_17: grid_rules.json has plane_3d block — §8 3D plane config externalised', () => {
    const raw = fs.readFileSync(GRID_RULES_PATH, 'utf8');
    const rules = JSON.parse(raw);
    expect(rules).toHaveProperty('plane_3d');
    expect(rules.plane_3d).toHaveProperty('plane_opacity');
    expect(rules.plane_3d).toHaveProperty('plane_color_x');
    expect(rules.plane_3d).toHaveProperty('plane_color_y');
    expect(rules.plane_3d).toHaveProperty('show_on_drag');
  });

  test('T_2029_18: grid_rules.json has opening_label_offset_m — §8 label config externalised', () => {
    const raw = fs.readFileSync(GRID_RULES_PATH, 'utf8');
    const rules = JSON.parse(raw);
    expect(rules.floor_plan).toHaveProperty('opening_label_offset_m');
    expect(rules.floor_plan).toHaveProperty('opening_label_font_px');
  });

  // ── §6 Storey band visibility ─────────────────────────────────

  test('T_2029_19: grid_overlay.js has §GRID_3D_BAND_VIS log tag — §6.4 band visibility observable', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('§GRID_3D_BAND_VIS bandMin=');
    expect(src).toContain('shown=');
    expect(src).toContain('hidden=');
  });

  // ── §2.4 Replay on init ───────────────────────────────────────

  test('T_2029_20: grid_overlay.js calls KernelOps.replayOps — §2.4 replay wired on init', () => {
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('KernelOps.replayOps');
    expect(src).toContain("'GRID_MOVE'");
    expect(src).toContain('§KERNEL_OP replay moves=');
  });

});
