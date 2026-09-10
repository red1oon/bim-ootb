# ⚠ DO NOT REMOVE — Structural Sanity: rule-based load-path/serviceability screening panel
# SCOPE: a clash-matrix-style sidebar panel that flags STR-discipline elements against a
#   small set of deterministic, config-driven rules (geometry + classification only — no
#   FEA, no invented loads/materials). Groups by severity, click row → zoom to element
#   (reuse A.zoomToGuid). Read the log (§ lines) after every run.
# PRIME RULE: EXTRACT OR COMPILE ONLY. Every flag traces to a real bbox/storey/ifc_class
#   from element_transforms + elements_meta, or a rule threshold in structural_rules.json.
#   No solver, no mocked utilization/deflection numbers in the live panel. Ever.
# HONOUR until ✅ DONE.

## WHY
Clash detection (`measure.js`, `clash_report.js`) proves the pattern: instant, in-browser,
rule-based, zero solver, real trust because every flag is a real spatial fact. Users want
the same "heads up before proceeding" for structural load-path integrity — but true
utilization %/deflection needs a real FEA solver (loads, material, boundary conditions)
that this client-side, zero-backend architecture does not have and should not fake.

Decision (from prior discussion): scope this as **rule-based structural sanity**, the same
value lane as Solibri Model Checker (instant, deterministic, code-adjacent heuristics) —
NOT the Revit+Robot lane (real FEA numbers). If a real solver is ever integrated, it is a
separate, clearly-labelled feature — this panel never blends the two.

## SOURCE OF TRUTH (non-invent)
- Geometry/classification: `element_transforms` (guid, center_x/y/z, bbox_x/y/z) JOIN
  `elements_meta` (discipline, ifc_class, storey) — same tables `measure.js`/`diff.js`
  already query. No new columns, no new DB.
- Spatial existence checks (column-below, support-under-beam-end) reuse the existing
  `elements_rtree` virtual table built lazily by `measure.js` (`_startRtree`) — do NOT
  build a second R-tree.
- Rule thresholds: new `viewer/rates/structural_rules.json`, same shape/location as
  `viewer/rates/clash_rules.json`. Every number an engineer can inspect/edit, none
  hardcoded in JS.

## RULES v1 (geometry + classification only — no material property required)
Each rule reads its threshold from `structural_rules.json`; defaults below are standard
preliminary-design serviceability ratios (textbook rule-of-thumb), explicitly labelled as
screening heuristics, not a substitute for full analysis:

1. **Span/depth ratio** — `IfcBeam`/`IfcSlab`, discipline STR: long horizontal bbox dim
   (span) ÷ vertical bbox dim (depth). `warning_ratio: 20`, `critical_ratio: 26`.
2. **Cantilever span/depth** — same element, flagged cantilever (no support within
   tolerance at one end via rtree check) — tighter default: `warning_ratio: 7`,
   `critical_ratio: 10`.
3. **Column load-path continuity** — `IfcColumn`: rtree query for a column footprint
   (X/Y within `tolerance_m`) on the storey immediately below. None found (and not
   ground/foundation storey) → CRITICAL "unsupported column".
4. **Beam/slab end support** — `IfcBeam`/`IfcSlab` end points: rtree query for a
   column/wall footprint within `tolerance_m` directly below each end. Neither end
   supported → CRITICAL "floating member".

`structural_rules.json` shape (mirrors `clash_rules.json`):
```json
{
  "structural_rules": [
    { "name": "span_depth_beam", "applies_to": ["IfcBeam","IfcSlab"], "cantilever": false,
      "warning_ratio": 20, "critical_ratio": 26 },
    { "name": "span_depth_cantilever", "applies_to": ["IfcBeam","IfcSlab"], "cantilever": true,
      "warning_ratio": 7, "critical_ratio": 10 },
    { "name": "column_continuity", "applies_to": ["IfcColumn"], "tolerance_m": 0.15 },
    { "name": "member_end_support", "applies_to": ["IfcBeam","IfcSlab"], "tolerance_m": 0.15 }
  ]
}
```

## SEVERITY → UI (reuse diff.js row pattern)
`CRITICAL` (red `#cc4444`) / `WARNING` (orange `#ffaa33`) / `OPTIMIZED` (green `#44cc44`,
collapsed by default — only CRITICAL/WARNING expanded, matching clash-panel noise rules).
Panel = `A.showStructuralSanity()`, same shape as `A.showDiffSummary` (diff.js:246): fixed
sidebar div, grouped rows, `onclick="APP.zoomToGuid(guid)"` (diff.js:187, reused as-is —
no new zoom code). Row shows ifc_class, name, storey, rule name + computed ratio/margin
("Vital Stats"). No new camera/highlight logic.

## COMPUTE STRATEGY — live, on panel open (no sidecar for v1)
Same trigger as clash: lazy, on first panel open, not on model load. One linear pass over
STR-discipline `element_transforms` rows (typically hundreds, not the 48k+ that justified
`ANALYSIS_SIDECAR.md`'s bake step) + rtree point queries for continuity/support checks —
same cost class as a single clash pair query. Cache result in memory for the session;
invalidate on `kernel_ops` change (element moved/resized) same as clash cache invalidation.
Revisit with a sidecar (see [[ANALYSIS_SIDECAR]] pattern) ONLY if profiling on a 48k+
building shows this pass is not cheap — do not pre-build one speculatively.

## OUT OF SCOPE (explicit, to prevent scope creep)
- No utilization %, deflection_mm, or stress_severity from a solver — those require real
  loads/materials/boundary conditions this architecture does not have.
- No "5D Cost Bridge" / live cost-impact stat — separate concern, not part of this panel.
- No mocked red zones in the live per-project panel. A movie-bake / demo-reel mock is a
  SEPARATE, clearly-labelled asset (e.g. `cinema_demo_structural.json`) never read by the
  real panel or by `showStructuralSanity()`.

## TASKS / STATE
- ☐ **T1** `viewer/rates/structural_rules.json` — default rules above, loader mirroring
  `rates.js loadSequenceRules()` (JSON overrides in place, hardcoded fallback always present).
- ☐ **T2** `viewer/structural_sanity.js` — rule evaluator: query STR elements, run the 4
  rules, return `[{guid, ifc_class, name, storey, rule, severity, ratio}]`. Witness:
  `tests/test_structural_sanity_rules.js` — synthetic element_transforms/elements_meta
  fixture (same pattern as `witness_disc_room_type_weight.js`) with one known-CRITICAL
  span/depth beam, one known-unsupported column, one clean beam → assert exact severities.
- ☐ **T3** `A.showStructuralSanity()` panel — reuse `A.zoomToGuid`, `_elInfo`-style lookup,
  diff.js row template. Witness: node-level render of the HTML string, assert row count/
  severity grouping matches T2 fixture output (no live browser needed for this part).
- ☐ **T4** Trigger wiring — sidebar button/menu entry beside existing Clash entry point
  (find it in `viewer.html`'s clash-panel toggle; mirror, don't duplicate the panel-open
  plumbing).
- ☐ **T5 (optional, only if T2 profiling on Terminal/Hospital-scale building is slow)**
  sidecar bake following `analysis_sidecar.js`'s `get5D`/`get4D` OPFS pattern.

## TEST / DEPLOY
Whitebox §-log first (`§STRUCT_SANITY rule=<name> severity=<n>`). `node --check` every
edited JS. Worktree `feat/structural-sanity` off fresh origin/main. Witness each rule with
a fixture assertion (exact severity), not the exit code. No live-panel screenshot claim
without an actual browser run (`run` skill) against a real building DB.
