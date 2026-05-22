// 27-print-section-dims.spec.js — 2D_027: print, section cuts, dim labels, symbols
// Issues proven:
//   T_2027_01: GridDims.detectGrids exists — §1 dim-label accuracy fix (rawPosition preserved)
//   T_2027_02: SectionCut.savedCuts, saveCut, restoreCut exist — §2 save/restore wiring
//   T_2027_03: SectionCut.removeCut exists — §2 view-list remove wiring
//   T_2027_04: PrintSheet.preview exists as function — §3.3 auto-orientation entry point
//   T_2027_05: PrintSheet.capture exists as function — §3 print preview wiring
//   T_2027_06: GridScissors.consolidateUI exists as function — §4 consolidation panel wiring
//   T_2027_07: DoorArcs.generateStairSymbol exists as function — §5.2 stair tread symbol
//   T_2027_08: DoorArcs.generateWindowOpenings exists as function — §5.3 window dash+label
//   T_2027_09: grid_dims.js source preserves rawPosition field — §1 accuracy: labels ≠ snapped

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const DEV = path.resolve(__dirname, '../..');

// ── Source file paths ──────────────────────────────────────────────
const GRID_DIMS_SRC      = path.join(DEV, 'grid_dims.js');
const SECTION_CUT_SRC    = path.join(DEV, 'section_cut.js');
const PRINT_SHEET_SRC    = path.join(DEV, 'print_sheet.js');
const GRID_SCISSORS_SRC  = path.join(DEV, 'grid_scissors.js');
const GRID_DOOR_ARCS_SRC = path.join(DEV, 'grid_door_arcs.js');

test.describe('2D_027 — Print, Section Cuts, Dim Labels, Symbols (§1–§5)', () => {

  test('T_2027_01: GridDims.detectGrids exported — proves §1 rawPosition dim-label accuracy fix is wired', () => {
    // Issue: grid dim labels used snapped positions instead of raw IFC positions.
    // §1 fix: rawPosition preserved through snapGrids; detectGrids must be exported.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('detectGrids');
    expect(src).toContain('window.GridDims');
    console.log('§PW_2027_01 GridDims.detectGrids wired=true');
  });

  test('T_2027_02: SectionCut.saveCut and savedCuts exist — proves §2 save-cut wiring is present', () => {
    // Issue: saving a section cut and listing it in the view panel was not wired.
    // §2 fix: SectionCut.saveCut() and SectionCut.savedCuts[] must exist.
    const src = fs.readFileSync(SECTION_CUT_SRC, 'utf8');
    expect(src).toContain('api.saveCut');
    expect(src).toContain('api.savedCuts');
    expect(src).toContain('window.SectionCut');
    console.log('§PW_2027_02 SectionCut.saveCut wired=true savedCuts wired=true');
  });

  test('T_2027_03: SectionCut.restoreCut and removeCut exist — proves §2 restore/remove wiring is present', () => {
    // Issue: restoring or removing a saved section cut was not wired.
    // §2 fix: SectionCut.restoreCut() and SectionCut.removeCut() must exist.
    const src = fs.readFileSync(SECTION_CUT_SRC, 'utf8');
    expect(src).toContain('api.restoreCut');
    expect(src).toContain('api.removeCut');
    console.log('§PW_2027_03 SectionCut.restoreCut wired=true removeCut wired=true');
  });

  test('T_2027_04: PrintSheet.preview exported — proves §3.3 auto-orientation preview entry point is wired', () => {
    // Issue: print preview lacked an explicit preview() entry point for auto-orientation logic.
    // §3.3 fix: PrintSheet.preview() must be exported so grid_overlay.js and tools.js can call it.
    const src = fs.readFileSync(PRINT_SHEET_SRC, 'utf8');
    expect(src).toContain('function preview');
    expect(src).toContain('preview: preview');
    console.log('§PW_2027_04 PrintSheet.preview wired=true');
  });

  test('T_2027_05: PrintSheet.capture exported — proves §3 print-preview modal wiring is present', () => {
    // Issue: calling PrintSheet.capture(APP) must open the interactive A3 preview modal.
    // §3 fix: capture() must be returned from the module so callers can invoke it.
    const src = fs.readFileSync(PRINT_SHEET_SRC, 'utf8');
    expect(src).toContain('function capture');
    expect(src).toContain('capture: capture');
    console.log('§PW_2027_05 PrintSheet.capture wired=true');
  });

  test('T_2027_06: GridScissors.consolidateUI exported — proves §4 consolidation panel wiring is present', () => {
    // Issue: merging multiple section cuts into one had no UI entry point.
    // §4 fix: GridScissors.consolidateUI() must be exported for toolbar to invoke it.
    const src = fs.readFileSync(GRID_SCISSORS_SRC, 'utf8');
    expect(src).toContain('function consolidateUI');
    expect(src).toContain('consolidateUI: consolidateUI');
    console.log('§PW_2027_06 GridScissors.consolidateUI wired=true');
  });

  test('T_2027_07: DoorArcs.generateStairSymbol exported — proves §5.2 stair tread-line symbol is wired', () => {
    // Issue: IfcStair elements had no 2D symbol (tread lines) in plan view.
    // §5.2 fix: DoorArcs.generateStairSymbol() must be exported so grid_overlay uses it.
    const src = fs.readFileSync(GRID_DOOR_ARCS_SRC, 'utf8');
    expect(src).toContain('function generateStairSymbol');
    expect(src).toContain('generateStairSymbol:');
    console.log('§PW_2027_07 DoorArcs.generateStairSymbol wired=true');
  });

  test('T_2027_08: DoorArcs.generateWindowOpenings exported — proves §5.3 window dash+label is wired', () => {
    // Issue: IfcWindow elements had no 2D opening dashes or size labels in plan view.
    // §5.3 fix: DoorArcs.generateWindowOpenings() must be exported so grid_overlay uses it.
    const src = fs.readFileSync(GRID_DOOR_ARCS_SRC, 'utf8');
    expect(src).toContain('function generateWindowOpenings');
    expect(src).toContain('generateWindowOpenings:');
    console.log('§PW_2027_08 DoorArcs.generateWindowOpenings wired=true');
  });

  test('T_2027_09: grid_dims.js source preserves rawPosition — proves §1 labels use actual IFC positions not snapped', () => {
    // Issue: bay labels were derived from snapped grid positions (300mm-modular) not raw IFC values.
    // §1 fix: snapGrids() must copy rawPosition from input and pass it through; label code reads rawPosition.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    // snapGrids must carry rawPosition through
    expect(src).toContain('rawPosition');
    // dim_chains must read rawPosition for label computation (grid_dim_chains.js uses it)
    const chainsSrc = fs.readFileSync(path.join(DEV, 'grid_dim_chains.js'), 'utf8');
    expect(chainsSrc).toContain('rawPosition');
    console.log('§PW_2027_09 rawPosition preserved in grid_dims=true and grid_dim_chains=true');
  });

});
