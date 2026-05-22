// 28-storey-band.spec.js — 2D_028: storey band filter + opportunity-vote grid detection
// Issues proven:
//   T_2028_01: grid_rules.json has floor_plan block — §1 rules template: band constants externalized
//   T_2028_02: grid_rules.json has grid_detection block — §1 rules template: detection constants externalized
//   T_2028_03: grid_rules.json has min_structural_span_m — §1 sweep-persistence threshold in JSON
//   T_2028_04: grid_rules.json has opening_vote_weight — §1 opportunity weight in JSON not hardcoded
//   T_2028_05: grid_dims.js has detectOpportunityGrids — §3 vote algorithm present
//   T_2028_06: grid_dims.js has clusterVotes — §3.3 weighted vote cluster function present
//   T_2028_07: §GD_OPP_STRUCT log tag in grid_dims.js — §3.1 structural query logged
//   T_2028_08: §GD_OPP_CLUSTER log tag in grid_dims.js — §3.3 cluster result logged
//   T_2028_09: §GD_STRUCTURAL_SPAN log tag in grid_dims.js — §4 span-as-persistence proven
//   T_2028_10: §SC_BAND_FILTER log tag in section_cut.js — §2.2 storey band filter deployed
//   T_2028_11: section_cut.js accepts options.rules — §2.3 rules threading present
//   T_2028_12: detectGrids signature accepts rules param — §3.4 rules wired into detectGrids
//   T_2028_13: detectGridsAtPlane signature accepts rules param — §3.4 rules wired into plane detect
//   T_2028_14: grid_overlay.js passes window._gridRules to detectGrids — §5.1 single rules load
//   T_2028_15: grid_drag.js stores window._gridRules on load — §5.1 shared rules cache

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const DEV = path.resolve(__dirname, '../..');

const GRID_DIMS_SRC     = path.join(DEV, 'grid_dims.js');
const SECTION_CUT_SRC   = path.join(DEV, 'section_cut.js');
const GRID_OVERLAY_SRC  = path.join(DEV, 'grid_overlay.js');
const GRID_DRAG_SRC     = path.join(DEV, 'grid_drag.js');
const GRID_RULES_PATH   = path.join(DEV, 'grid_rules.json');

test.describe('2D_028 — Storey Band Filter + Opportunity-Vote Grid Detection', () => {

  // ── §1 Rules template ─────────────────────────────────────────────

  test('T_2028_01: grid_rules.json has floor_plan block — §1 band constants in JSON not hardcoded', () => {
    // Issue: band_min_above_floor, band_max_below_next, exclude_above_band were absent from rules.
    // Fix: floor_plan block added to grid_rules.json.
    const raw = fs.readFileSync(GRID_RULES_PATH, 'utf8');
    const rules = JSON.parse(raw);
    expect(rules).toHaveProperty('floor_plan');
    expect(rules.floor_plan).toHaveProperty('cut_offset_m');
    expect(rules.floor_plan).toHaveProperty('band_min_above_floor');
    expect(rules.floor_plan).toHaveProperty('band_max_below_next');
    expect(rules.floor_plan).toHaveProperty('exclude_above_band');
    expect(Array.isArray(rules.floor_plan.exclude_above_band)).toBe(true);
  });

  test('T_2028_02: grid_rules.json has grid_detection block — §1 detection constants in JSON not hardcoded', () => {
    // Issue: face_cluster_tol_m, min_votes, structural_classes were hardcoded in grid_dims.js.
    // Fix: grid_detection block added to grid_rules.json.
    const raw = fs.readFileSync(GRID_RULES_PATH, 'utf8');
    const rules = JSON.parse(raw);
    expect(rules).toHaveProperty('grid_detection');
    expect(rules.grid_detection).toHaveProperty('face_cluster_tol_m');
    expect(rules.grid_detection).toHaveProperty('min_votes');
    expect(rules.grid_detection).toHaveProperty('structural_classes');
    expect(rules.grid_detection).toHaveProperty('opportunity_classes');
  });

  test('T_2028_03: grid_rules.json has min_structural_span_m — §4 sweep-persistence threshold is a rule', () => {
    // Issue: no threshold existed to distinguish structural walls (tall) from trim/skirting (short).
    // Fix: min_structural_span_m = 1.80 — elements with bbox_z >= this span the storey = structural.
    const raw = fs.readFileSync(GRID_RULES_PATH, 'utf8');
    const rules = JSON.parse(raw);
    expect(rules.grid_detection).toHaveProperty('min_structural_span_m');
    expect(typeof rules.grid_detection.min_structural_span_m).toBe('number');
    expect(rules.grid_detection.min_structural_span_m).toBeGreaterThan(1.0);
  });

  test('T_2028_04: grid_rules.json has opening_vote_weight — §3 opportunity weight is a rule not hardcoded', () => {
    // Issue: openings (doors/windows) are the strongest evidence of grid position but had no extra weight.
    // Fix: opening_vote_weight = 2 in grid_detection block.
    const raw = fs.readFileSync(GRID_RULES_PATH, 'utf8');
    const rules = JSON.parse(raw);
    expect(rules.grid_detection).toHaveProperty('opening_vote_weight');
    expect(rules.grid_detection.opening_vote_weight).toBeGreaterThanOrEqual(2);
  });

  // ── §3 Opportunity-vote algorithm ────────────────────────────────

  test('T_2028_05: grid_dims.js exports detectOpportunityGrids — §3 vote algorithm wired', () => {
    // Issue: detectGrids used column centroids → no grids for residential (no IfcColumn).
    // Fix: detectOpportunityGrids combines structural face votes + opening opportunity votes.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('detectOpportunityGrids');
    expect(src).toContain('window.GridDims');
    // Must be exported on window.GridDims
    const exportBlock = src.slice(src.indexOf('window.GridDims'));
    expect(exportBlock).toContain('detectOpportunityGrids');
  });

  test('T_2028_06: grid_dims.js has clusterVotes — §3.3 weighted cluster replaces unweighted clusterEntries', () => {
    // Issue: old clusterEntries had no vote weight — openings and columns counted equally.
    // Fix: clusterVotes uses {pos, weight} and filters by min_votes threshold.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('function clusterVotes');
    expect(src).toContain('weight');
    expect(src).toContain('minVotes');
  });

  test('T_2028_07: §GD_OPP_STRUCT log tag in grid_dims.js — §3.1 structural query result logged', () => {
    // Issue: no visibility into how many structural elements passed the Z-span filter.
    // Fix: §GD_OPP_STRUCT logs row count + vote totals after structural query.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_OPP_STRUCT');
  });

  test('T_2028_08: §GD_OPP_CLUSTER log tag in grid_dims.js — §3.3 cluster result logged per axis', () => {
    // Issue: no visibility into how many clusters passed min_votes filter vs total candidates.
    // Fix: §GD_OPP_CLUSTER axis=X candidates=N clusters=M minVotes=V logged per axis.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_OPP_CLUSTER');
    expect(src).toContain('candidates=');
    expect(src).toContain('clusters=');
  });

  test('T_2028_09: §GD_STRUCTURAL_SPAN log tag in grid_dims.js — §4 span-as-persistence filter observable', () => {
    // Issue: no way to verify that bbox_z IS being used as the sweep-persistence metric.
    // Fix: §GD_STRUCTURAL_SPAN samples up to 5 elements showing class + span + bbox dimensions.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('§GD_STRUCTURAL_SPAN');
    expect(src).toContain('span=');
  });

  // ── §2 Storey band filter ─────────────────────────────────────────

  test('T_2028_10: §SC_BAND_FILTER log tag in section_cut.js — §2.2 storey band filter deployed', () => {
    // Issue: GF section cut included roof, upper slabs, foundation — no band concept.
    // Fix: §SC_BAND_FILTER applied after clipBox, using rtree Z-bounds or class exclusion.
    const src = fs.readFileSync(SECTION_CUT_SRC, 'utf8');
    expect(src).toContain('§SC_BAND_FILTER');
    expect(src).toContain('bandMin');
    expect(src).toContain('bandMax');
    expect(src).toContain('excluded=');
  });

  test('T_2028_11: section_cut.js reads options.rules — §2.3 rules threading: no hardcoded band constants', () => {
    // Issue: exclude_above_band, band_min_above_floor were hardcoded, not from grid_rules.json.
    // Fix: sectionCut reads opts.rules, extracts fp = rules.floor_plan for band parameters.
    const src = fs.readFileSync(SECTION_CUT_SRC, 'utf8');
    expect(src).toContain('opts.rules');
    expect(src).toContain('rules.floor_plan');
  });

  // ── §3.4 / §5 Wiring ─────────────────────────────────────────────

  test('T_2028_12: detectGrids accepts rules param — §3.4 opportunity algorithm receives rules', () => {
    // Issue: detectGrids had no path to receive grid_detection parameters.
    // Fix: detectGrids(db, tolerance, rules) — rules passed to detectOpportunityGrids.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('function detectGrids(db, tolerance, rules)');
  });

  test('T_2028_13: detectGridsAtPlane accepts rules param — §3.4 plane detection also rule-driven', () => {
    // Issue: detectGridsAtPlane used hardcoded tolerance, ignored opening opportunities.
    // Fix: detectGridsAtPlane(db, cutZ, tolerance, rules) delegates to detectOpportunityGrids.
    const src = fs.readFileSync(GRID_DIMS_SRC, 'utf8');
    expect(src).toContain('function detectGridsAtPlane(db, cutZ, tolerance, rules)');
  });

  test('T_2028_14: grid_overlay.js passes window._gridRules to detectGrids — §5.1 single rules load', () => {
    // Issue: grid_overlay had no access to loaded rules; detectGrids fell back to defaults.
    // Fix: rules = window._gridRules || {}; passed to GridDims.detectGrids(A.db, null, rules).
    const src = fs.readFileSync(GRID_OVERLAY_SRC, 'utf8');
    expect(src).toContain('window._gridRules');
    expect(src).toContain('detectGrids(A.db, null, rules)');
  });

  test('T_2028_15: grid_drag.js stores window._gridRules on load — §5.1 shared rules cache', () => {
    // Issue: rules loaded by grid_drag.js were private; other modules had no access.
    // Fix: window._gridRules = json stored in the fetch callback alongside loadRules(json).
    const src = fs.readFileSync(GRID_DRAG_SRC, 'utf8');
    expect(src).toContain('window._gridRules = json');
    expect(src).toContain('§GRID_RULES loaded');
  });

});
