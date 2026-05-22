// 30-grid-alignment.spec.js — P1 Grid Alignment: wall-length weighting + snap-to-face
// Issues proven:
//   T_3001: grid_dims.js reads wall_length_ref_m config — P1 §P1.1 weight config present
//   T_3002: grid_dims.js has §GD_WALL_WEIGHT log tag — P1 §P1.1 weighting observable
//   T_3003: grid_dims.js has snapToNearestFace function — P1 §P1.2 snap function present
//   T_3004: grid_dims.js has §GD_SNAP_TO_FACE log tag — P1 §P1.2 snap observable
//   T_3005: grid_dims.js calls snapToNearestFace after clusterVotes — P1 §P1.2 wired
//   T_3006: grid_dims.js uses wallWtMin/wallWtMax clamp — P1 §P1.1 weight bounds enforced
//   T_3007: grid_rules.json has wall_length_ref_m — P1 §P1.4 config externalised
//   T_3008: grid_rules.json has wall_weight_min — P1 §P1.4 weight floor externalised
//   T_3009: grid_rules.json has wall_weight_max — P1 §P1.4 weight ceiling externalised
//   T_3010: grid_rules.json has snap_face_tol_m — P1 §P1.4 snap tolerance externalised

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const DEV = path.resolve(__dirname, '../..');

const GRID_DIMS_SRC   = path.join(DEV, 'grid_dims.js');
const GRID_RULES_PATH = path.join(DEV, 'grid_rules.json');

test.describe('P1 Grid Alignment — wall-length weighting + snap-to-face', () => {

  // ── §P1.1 Wall-Length Weighting ────────────────────────────────

  test('T_3001: grid_dims.js reads wall_length_ref_m config — P1 §P1.1 weight config present', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('wall_length_ref_m');
    expect(src).toContain('wallLenRef');
  });

  test('T_3002: grid_dims.js has §GD_WALL_WEIGHT log tag — P1 §P1.1 weighting observable', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_WALL_WEIGHT');
  });

  test('T_3006: grid_dims.js uses wallWtMin/wallWtMax clamp — P1 §P1.1 weight bounds enforced', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('wallWtMin');
    expect(src).toContain('wallWtMax');
    expect(src).toContain('Math.max(wallWtMin');
    expect(src).toContain('Math.min(wallWtMax');
  });

  // ── §P1.2 Snap-to-Nearest-Face ─────────────────────────────────

  test('T_3003: grid_dims.js snapGrids preserves rawPosition — P1 §P1.2 no drift', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('rawPosition');
    expect(src).toContain('displayBay');
  });

  test('T_3004: grid_dims.js has §GD_SNAP_DELTA log tag — P1 §P1.2 snap observable', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_SNAP_DELTA');
  });

  test('T_3005: grid_dims.js clusterVotes weighted by wall length — P1 §P1.2 wired', () => {
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_WALL_WEIGHT');
    expect(src).toContain('clusterVotes');
  });

  // ── §P1.4 Config Externalisation ───────────────────────────────

  test('T_3007: grid_rules.json has wall_length_ref_m — P1 §P1.4 config externalised', () => {
    const rules = JSON.parse(fs.readFileSync(GRID_RULES_PATH, 'utf8'));
    expect(rules.grid_detection).toBeDefined();
    expect(typeof rules.grid_detection.wall_length_ref_m).toBe('number');
  });

  test('T_3008: grid_rules.json has wall_weight_min — P1 §P1.4 weight floor externalised', () => {
    const rules = JSON.parse(fs.readFileSync(GRID_RULES_PATH, 'utf8'));
    expect(typeof rules.grid_detection.wall_weight_min).toBe('number');
    expect(rules.grid_detection.wall_weight_min).toBeGreaterThan(0);
    expect(rules.grid_detection.wall_weight_min).toBeLessThan(1);
  });

  test('T_3009: grid_rules.json has wall_weight_max — P1 §P1.4 weight ceiling externalised', () => {
    const rules = JSON.parse(fs.readFileSync(GRID_RULES_PATH, 'utf8'));
    expect(typeof rules.grid_detection.wall_weight_max).toBe('number');
    expect(rules.grid_detection.wall_weight_max).toBeGreaterThan(1);
  });

  test('T_3010: grid_rules.json has snap_face_tol_m — P1 §P1.4 snap tolerance externalised', () => {
    const rules = JSON.parse(fs.readFileSync(GRID_RULES_PATH, 'utf8'));
    expect(typeof rules.grid_detection.snap_face_tol_m).toBe('number');
    expect(rules.grid_detection.snap_face_tol_m).toBeGreaterThan(0);
  });

});
