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

## RULES v1 — REVISED after dry-run validation against real Hospital_meta.db
First draft (concrete-style thresholds, slabs included, vertical-only supports) was
validated against `buildings/Hospital_meta.db` (2827 STR elements) before any code was
written, per Prime Directive (verify against real data, not assumption). It over-flagged
badly — see VALIDATION below. Rules below are the corrected v1, re-validated on the same
data. `structural_rules.json` still holds every threshold; nothing here is hardcoded in JS.

1. **Floating member (headline rule, highest confidence)** — `IfcBeam`: rtree query at
   BOTH end points for a support within `tolerance_m`. A support is (a) a vertical STR
   element (`IfcColumn`/`IfcWallStandardCase`/`IfcFooting`/`IfcMember`) whose Z-range
   brackets the beam end, OR (b) another `IfcBeam` framing in at the same level (its
   zmin within `framing_dz_m` of this beam's zmin) — beam-to-beam framing is normal steel
   practice and must count as support, or every secondary beam false-flags. Zero support
   at BOTH ends → **CRITICAL "floating member"**, independent of span/depth.
2. **Span/depth ratio** — `IfcBeam` only (NOT `IfcSlab` — a slab's own bbox spans the
   whole floor plate, not a real structural span; see VALIDATION). Section material is
   inferred from `element_name` prefix (steel: `UB`/`UC`/`Channel`/`HSS`/`W-shape`;
   concrete: `Concrete`/`RC`) since `material_name` is often blank — this is extraction
   from real text, not invention, but IS a heuristic; log `§MATERIAL_INFERRED unmatched=N`
   so an unmatched fallback is visible, never silent. Steel default: `warning_ratio: 24`,
   `critical_ratio: 30`. Concrete default: `warning_ratio: 20`, `critical_ratio: 26`.
   **Ships as WARNING-ceiling only in v1** (never auto-CRITICAL) until an engineer
   confirms per-section-type thresholds against real Hospital output — see VALIDATION.
3. **Cantilever span/depth** — beam with support at exactly one end (rule 1's supported_at,
   not both/neither) — tighter default: `warning_ratio: 12`, `critical_ratio: 16`.
4. **Column load-path continuity** — `IfcColumn`: rtree query for a column/footing/wall
   footprint within `tolerance_m` on the storey immediately below (or at foundation level).
   `tolerance_m: 0.3` (NOT clash's 0.025–0.05 — that tolerance is for flush-surface clash,
   this is storey-to-storey centerline drift, a different physical question; see
   VALIDATION). None found → CRITICAL "unsupported column".

`structural_rules.json` shape (mirrors `clash_rules.json`):
```json
{
  "structural_rules": [
    { "name": "floating_member", "applies_to": ["IfcBeam"], "tolerance_m": 0.15,
      "framing_dz_m": 0.4 },
    { "name": "span_depth_steel", "applies_to": ["IfcBeam"], "material": "steel",
      "name_hints": ["UB","UC","Channel","HSS"], "cantilever": false,
      "warning_ratio": 24, "critical_ratio": 30, "max_severity": "WARNING" },
    { "name": "span_depth_concrete", "applies_to": ["IfcBeam"], "material": "concrete",
      "name_hints": ["Concrete","RC"], "cantilever": false,
      "warning_ratio": 20, "critical_ratio": 26, "max_severity": "WARNING" },
    { "name": "span_depth_cantilever", "applies_to": ["IfcBeam"], "cantilever": true,
      "warning_ratio": 12, "critical_ratio": 16 },
    { "name": "column_continuity", "applies_to": ["IfcColumn"], "tolerance_m": 0.3 }
  ]
}
```

## VALIDATION — dry run against buildings/Hospital_meta.db (2827 STR elements)
Run before implementation (Spec-First: prove the design on real data first). Numbers are
from a Python prototype against the real DB, not invented:

- **Building profile**: 1970 `IfcBeam`, 553 `IfcFooting`, 255 `IfcColumn`, 28
  `IfcWallStandardCase`, 8 storeys (Level 1–7A). `material_name` is BLANK for all 1970
  beams — confirmed by query, not assumed — so material inference must use
  `element_name` (100% of Hospital beams carry a UB/UC/Channel steel-section prefix,
  e.g. `UB-Universal Beam:838x292x194UB`).
- **First-draft rules (rejected)**: span/depth on slabs → 9/11 slabs false-CRITICAL
  (ratios 219–672 — bbox-is-not-span artifact). Span/depth with concrete-style
  thresholds (20/26) on steel beams → 252 CRITICAL + 547 WARNING of 1970 (40% flagged).
  End-support check counting only vertical elements → traced one flagged "unsupported"
  17m beam and found it frames cleanly into two perpendicular primary beams — beam-to-
  beam framing wasn't recognized as support. Column continuity at clash-style
  `tolerance_m=0.15` → 55/255 (22%) flagged; raising to 0.3 dropped it to 22/255 (8.6%)
  and it plateaus by 0.5–1.0m (17–18) — 0.15 was measuring ordinary storey-to-storey
  centerline drift, not real discontinuity.
- **Revised rules (this spec)**: floating-member (rule 1) = **43/1970 beams (2.2%)**,
  clustered at roof levels (Level 6: 26, Level 7: 8, Level 3–5: 9) — a real, explainable,
  demo-worthy finding (something a visual scan of the model would not catch). Span/depth
  with steel-appropriate thresholds (24/30) still flags ~23% (248 CRIT/215 WARN) —
  materially better than 40% but still high enough that it ships WARNING-ceiling only
  until validated, per rule 2 above. Column continuity at 0.3m tolerance = 22/255 (8.6%),
  plausible order of magnitude, not yet spot-checked against actual transfer conditions.
- **Showcase verdict**: YES, Hospital gives a real showcase — lead the panel with the
  floating-member finding (small, high-confidence, visually obvious once zoomed-to).
  Treat span/depth as secondary/advisory in v1. Do not oversell column continuity in a
  demo until spot-checked.

## SEVERITY → UI (reuse diff.js row pattern)
Lead the panel with the **floating member** group — smallest, highest-confidence, most
demo-worthy (see VALIDATION). Span/depth and column-continuity groups render below it.
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
- ☐ **T2** `viewer/structural_sanity.js` — rule evaluator: query STR elements, run the 5
  rules (floating member, span/depth steel, span/depth concrete, cantilever, column
  continuity), return `[{guid, ifc_class, name, storey, rule, severity, ratio}]`. Witness:
  `tests/test_structural_sanity_rules.js` — synthetic element_transforms/elements_meta
  fixture (same pattern as `witness_disc_room_type_weight.js`) with one floating beam
  (zero support both ends), one beam framing into another beam (must NOT flag floating),
  one known-unsupported column, one clean beam → assert exact severities. Then run against
  real `buildings/Hospital_meta.db` and assert floating-member count is in the 40–50 range
  and concentrated at roof-level storeys — regression guard on the VALIDATION numbers above.
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
