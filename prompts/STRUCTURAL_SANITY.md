# ⚠ DO NOT REMOVE — "Sanity" (Structural Sanity): rule-based load-path/serviceability panel
# SCOPE: a clash-checklist-style sidebar panel (NOT a matrix — see UI MODEL) that flags
#   STR-discipline elements against a small set of deterministic, config-driven rules
#   (geometry + classification only — no FEA, no invented loads/materials). Groups by
#   severity, click row → zoom to element (reuse A.zoomToGuid). Long-press row → shareable
#   deep-link URL (reuse A.shareUrl). Read the log (§ lines) after every run.
# PRIME RULE: EXTRACT OR COMPILE ONLY. Every flag traces to a real bbox/storey/ifc_class
#   from element_transforms + elements_meta, or a rule threshold in structural_rules.json.
#   No solver, no mocked utilization/deflection numbers in the live panel. Ever.
# HONOUR until ✅ DONE.
# ⚠ THRESHOLD DISCLAIMER — UPDATED 2026-09-12 with real code lookups (WebSearch, verified
#   against multiple independent sources per number, not from memory). Floating-member
#   (rule 1) and slab-exclusion remain verified LOGIC, unaffected by this update. Status per
#   number below; still `max_severity: WARNING` on ALL THREE span_depth rules AND on
#   column_continuity — a real citation upgrades the DISCLOSURE, not the severity cap (see
#   each item's own reasoning for why CRITICAL still isn't warranted even where cited).
#   - **span_depth_concrete (16/21, was 20/26)** — CITED: ACI 318-19 Table 9.3.1.1, minimum
#     beam depth to be EXEMPT from an explicit deflection calculation: simply supported
#     h≥L/16, one-end-continuous h≥L/18.5, both-ends-continuous h≥L/21, cantilever h≥L/8.
#     This tool cannot yet classify continuous vs. simply-supported (no such signal is
#     extracted), so it conservatively uses the TIGHTEST case (simply supported, span/depth
#     ≤16) as `warning_ratio`; `critical_ratio`=21 reuses the code's OWN both-ends-continuous
#     figure as a "even the most lenient real code condition is exceeded" heuristic, not a
#     cited critical value in its own right. Still WARNING-ceiling: crossing this ratio means
#     the code REQUIRES a deflection calculation (ACI 24.2), not that the member IS deficient
#     — a real calculation could still pass. NOT YET EMPIRICALLY RE-VALIDATED against a real
#     building (Hospital's 1970 STR beams are 100% steel-named, zero concrete beams to test
#     flag counts against) — grounded in a real citation now, still unvalidated by flag-count.
#   - **span_depth_steel (24/30, unchanged)** — CONFIRMED NOT cited by any code: AISC has no
#     prescribed span/depth table (steel serviceability is deflection-based, Δ≤L/360 live /
#     L/240 total, computed from real load+section I — data this architecture doesn't have).
#     20–24 IS a real, widely-cited PRELIMINARY-SIZING rule of thumb across structural
#     engineering references for W-shape floor beams under typical office loading — our
#     existing 24 sits at the upper (more permissive) end of that real, corroborated range,
#     not an arbitrary number. Still an industry convention, not a code mandate — kept
#     unchanged, now with a verified source for the convention instead of a bare guess.
#   - **span_depth_cantilever (12/16, unchanged)** — PARTIALLY informed: ACI 318-19's own
#     cantilever exemption is h≥L/8 (span/depth≤8) for CONCRETE — tighter than our 12. This
#     rule is material-agnostic (steel and concrete cantilevers share one threshold per
#     RULES v1), so blindly adopting the concrete-only ACI figure would misapply a
#     concrete-specific code number to steel cantilevers. Kept unchanged pending a
#     material-split cantilever rule (mirroring span_depth_steel/concrete's own split) —
#     flagged as a known gap, not silently resolved.
#   - **column_continuity (0.3m tolerance, unchanged)** — RESEARCHED, no applicable citation
#     found. AISC Code of Standard Practice §7.13 gives a real, citable column PLUMBNESS
#     tolerance (≈1:500, deviation from vertical over a column's own height) — but that
#     measures a DIFFERENT question (is this one column straight) from what this rule checks
#     (is there a real support roughly below this column on the floor below — a load-path
#     continuity/transfer-condition screen). Citing the plumbness number here would overclaim
#     code authority for a metric it doesn't actually regulate. Stays an uncited,
#     trial-calibrated heuristic (0.3m, see VALIDATION below) — now with evidence a citation
#     was actually sought and found inapplicable, not just skipped.
#   Treat every number in `structural_rules.json` as an editable placeholder pending an
#   engineer's sign-off, cited or not — a citation here means "grounded in a real code
#   figure," not "validated for this specific screening use."

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

## NAMING — "Sanity", not "Stress" or "Structural Analysis"
Feature name: **Structural Sanity**, UI button label: **"Sanity"** (parallel to "Clash").
Rejected alternatives and why:
- **"Stress"** — collides with a precise engineering term (force/area, MPa) this panel
  never computes. Worse than a stretch: an engineer opening it expecting a stress value
  and finding a ratio breaks trust immediately.
- **"Structural Analysis"** — this IS the correct umbrella term for the field, and it's
  fair to describe Sanity as *part of the structural-analysis workflow* (a pre-analysis
  screening step, same category real engineers call "preliminary review"). But naming
  the FEATURE itself "Structural Analysis" collides even harder than "Stress" — that
  phrase is the canonical name for the real solver-based discipline (ETABS/Robot/STAAD).
  "Sanity" avoids the collision while still being honest: "sanity check" is an established
  engineering idiom for *quick plausibility check, not rigorous proof* — which is exactly
  and only what this panel does.

## WHY NOT REAL FEA (asked directly — answering honestly, not dismissing it)
The solver itself is not the hard part: linear-elastic frame analysis (matrix stiffness
method) is well-documented, 1970s-era numerics, and entirely feasible client-side/WASM for
a building this size (thousands of members, not millions) — this is a data problem, not a
compute problem. The hard part is INPUT: real analysis needs loads (dead/live/wind/seismic),
material grade (E, yield strength), and boundary conditions (pinned/fixed/roller at each
joint) — and VALIDATION on Hospital proved `material_name` is BLANK for all 1970 STR beams
in a real, representative architectural-coordination IFC export. Typical coordination-grade
IFC files do not carry loads or connection stiffness at all; that data lives in a separate
engineer's analysis model, not the BIM coordination model. Bolting a real solver onto
incomplete input produces confident-looking WRONG numbers — more dangerous than no analysis,
and a direct violation of the non-invent Prime Rule. Real FEA is a legitimate, separate,
future roadmap item IF gated on a data-availability check (does this IFC actually carry
loads/material grade/supports?) — never blended into Sanity's rule-based severity model,
and never shipped as a silent fallback when that data is missing.

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

Numbered 1–5 below to match `structural_rules.json`'s 5 entries exactly (span/depth splits
into 2 JSON entries — steel and concrete — so this is 5 rules total, not 4):

1. **Floating member (headline rule, highest confidence)** — `IfcBeam`: rtree query at
   BOTH end points for a support within `tolerance_m`. A support is (a) a vertical STR
   element (`IfcColumn`/`IfcWallStandardCase`/`IfcFooting`/`IfcMember`) whose Z-range
   brackets the beam end, OR (b) another `IfcBeam` framing in at the same level (its
   zmin within `framing_dz_m` of this beam's zmin) — beam-to-beam framing is normal steel
   practice and must count as support, or every secondary beam false-flags. Zero support
   at BOTH ends → **CRITICAL "floating member"**, independent of span/depth.
2. **Span/depth ratio — steel** — `IfcBeam` only (NOT `IfcSlab` — a slab's own bbox spans
   the whole floor plate, not a real structural span; see VALIDATION). Section material is
   inferred from `element_name` prefix (steel: `UB`/`UC`/`Channel`/`HSS`/`W-shape`) since
   `material_name` is often blank — this is extraction from real text, not invention, but
   IS a heuristic; log `§MATERIAL_INFERRED unmatched=N` so an unmatched fallback is
   visible, never silent. `warning_ratio: 24`, `critical_ratio: 30` — a real, widely-cited
   20–24 preliminary-sizing rule of thumb for steel W-shapes (verified via WebSearch,
   2026-09-12), NOT a code table (AISC has none — steel serviceability is deflection-based,
   see THRESHOLD DISCLAIMER). **Ships as WARNING-ceiling only in v1** (never auto-CRITICAL).
3. **Span/depth ratio — concrete** — same check as rule 2, `element_name` hints
   `Concrete`/`RC`. `warning_ratio: 16`, `critical_ratio: 21` — **CITED: ACI 318-19 Table
   9.3.1.1**, the minimum-depth-to-skip-a-deflection-calculation limits (simply supported
   L/16 used as `warning_ratio`, conservatively — this tool can't yet distinguish continuous
   spans; both-ends-continuous L/21 reused as `critical_ratio`, a heuristic reuse of the
   code's own most-lenient figure, not itself a cited critical value). Still WARNING-ceiling
   — see THRESHOLD DISCLAIMER for why a real citation doesn't change the severity cap here.
4. **Cantilever span/depth** — beam with support at exactly one end (rule 1's supported_at,
   not both/neither) — tighter default: `warning_ratio: 12`, `critical_ratio: 16`. ACI
   318-19's own concrete cantilever exemption (L/8) is tighter still, but this rule is
   material-agnostic (steel + concrete share one threshold) so the concrete-only code figure
   isn't blindly applied — see THRESHOLD DISCLAIMER. **WARNING-ceiling only**, uncited.
5. **Column load-path continuity** — `IfcColumn`: centerline-distance query (NOT footprint
   overlap — see `viewer/structural_sanity.js`'s own header for why) for a column/footing/
   wall support on the storey immediately below (or at foundation level). `tolerance_m: 0.3`
   (NOT clash's 0.025–0.05 — that tolerance is for flush-surface clash, this is
   storey-to-storey centerline drift, a different physical question; see VALIDATION).
   Researched for a citation (AISC §7.13 column plumbness, ≈1:500) — inapplicable, it
   measures a different question (one column's own verticality, not floor-to-floor support
   alignment); stays an uncited, trial-calibrated heuristic. None found → CRITICAL
   "unsupported column".

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
      "warning_ratio": 16, "critical_ratio": 21, "max_severity": "WARNING" },
    { "name": "span_depth_cantilever", "applies_to": ["IfcBeam"], "cantilever": true,
      "warning_ratio": 12, "critical_ratio": 16, "max_severity": "WARNING" },
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
  (rules 2–4 combined — steel + cantilever sub-rules together, since Hospital's beams are
  100% steel-section-named) still flags ~23% (248 would-be-CRIT/215 WARN of 1970) with the
  trial-adjusted thresholds — materially better than the rejected draft's 40% but still
  high enough, and still uncited, that it ships WARNING-ceiling only until an engineer or
  code clause validates it, per rules 2–4 above. This combined figure has NOT been broken
  down per sub-rule (steel vs cantilever counted separately) — do that in T2's witness
  before treating either sub-rule's individual count as known. Column continuity (rule 5)
  at 0.3m tolerance = 22/255 (8.6%) — also trial-adjusted (see THRESHOLD DISCLAIMER), not
  a cited alignment tolerance, and not yet spot-checked against actual transfer conditions.
- **Showcase verdict**: YES, Hospital gives a real showcase — lead the panel with the
  floating-member finding (small, high-confidence, visually obvious once zoomed-to).
  Treat span/depth as secondary/advisory in v1. Do not oversell column continuity in a
  demo until spot-checked.

## SHARED CHASSIS vs SEPARATE ENGINES — precedent: clash_narrow.js
A third rule-based checker is already planned (see `prompts/EGRESS_SANITY.md`, built after
this one) — worth deciding now what to share. Real precedent already exists in this
codebase: `clash_narrow.js` (mesh-true SAT/triangle-exact narrowphase) is ONE shared engine
consumed by two different callers — the live Clash panel (`measure.js` →
`A.clashNarrow.qualifyRows`) AND the movie-bake reveal (`clash_film.js`) — proving shared
engines work here when the underlying computation is genuinely the same.

Sanity vs Egress is the opposite case: Sanity's computation is rtree/bbox point-support
checks; Egress's core check (travel distance to exit) reuses the EXISTING room-graph
pathfinder (`navigate_find.js` `_roomGraphFor()` / `window.RoomGraph.shortestPath()`) —
a different data shape entirely (graph traversal, not spatial point checks). Forcing both
into one "rule engine" would bend Egress's real need to fit Sanity's narrower shape — the
premature-abstraction trap, not a saving.

**Decision: share the UI/interaction chassis only, keep rule evaluators separate.**
Proven identical across Clash (existing), Sanity (this spec), and Egress (planned): the
severity-grouped panel shape, `zoomToGuid` click, Mode-tint (color-keyed wireframe overlay),
and the `?guid=&#check=rule` share deep-link. Build these as small parameterized functions
now (`A.showRuleChecklist(config)`, a generic `SEVERITY_COLORS`-driven tint helper, a
generic share-deep-link builder) instead of Sanity-only hardcoded ones — near-zero extra
cost since Sanity needs them anyway, and it means Egress needs no new UI code, only its own
rule evaluator. T3/T5/T6 below are written against this shared-chassis shape.

## UI MODEL — toggle + severity list, NOT a matrix
Clash's matrix works because clash is a genuine pairwise relationship (ARC×MEP ≠ ARC×STR —
a real 2D intersection). Sanity's rules are independent categories on one discipline (STR)
with no meaningful "X vs Y" cell — a matrix here would be mostly-empty and forced. Instead:
- **3 toggle buttons**: Floating Member / Span-Depth / Column Continuity (filters to one
  rule category), plus an **"All"** default view. "Span-Depth" is ONE button covering all
  3 of rules 2–4 (steel, concrete, cantilever) — not a separate button per sub-rule.
- **"All" view groups by severity first** (CRITICAL across all rules together, scannable
  triage list), rule name shown per row — not siloed by category by default.
- Lead the panel with the **floating member** group — smallest, highest-confidence, most
  demo-worthy (see VALIDATION). Span/depth and column-continuity groups render below it.
`CRITICAL` (red `#cc4444`) / `WARNING` (orange `#ffaa33`) / `OPTIMIZED` (green `#44cc44`,
collapsed by default — only CRITICAL/WARNING expanded, matching clash-panel noise rules).
Panel = `A.showStructuralSanity()`, same shape as `A.showDiffSummary` (diff.js:246): fixed
sidebar div, grouped rows, `onclick="APP.zoomToGuid(guid)"` (diff.js:187, reused as-is —
no new zoom code). Row shows ifc_class, name, storey, rule name + computed ratio/margin
("Vital Stats"). No new camera/highlight logic for click — see 3D TINT below for the
Sanity-Mode wireframe overlay (entered separately from a row click).

## 3D TINT (Sanity Mode) — reuse Clash Mode's technique, keyed by severity not discipline
Clash Mode tints every element by `DISC_COLORS[discipline]` as a translucent wireframe
(`measure.js` ~1723, `MeshBasicMaterial{wireframe:true, opacity:0.2}`). Sanity Mode does the
same over STR elements only, keyed by a new `SEVERITY_COLORS` lookup (red/orange/green) —
same material/technique, no new shader, no per-face tinting, no X-ray logic.

## SHARE / DEEP LINK — long-press row, reuse existing share plumbing (no new infra)
Long-press is an established gesture already (`panels.js`, `picking.js`, `measure.js`).
`sitecam.js` already builds per-element deep links (`?guid=${guid}` → re-zooms on load).
`A.shareUrl(url, title)` (`share.js`) already powers Clash's "Share Report"/"Copy Link".
Sanity row long-press: build `?guid=<guid>#sanity=<rule>` (guid re-triggers zoomToGuid on
load; `sanity=<rule>` hash reopens the panel pre-filtered to that row's category) → call
existing `A.shareUrl(url, title)`. No new sharing code — wires two existing mechanisms.

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
- ✅ **T1** `viewer/rates/structural_rules.json` — default rules above, loader mirroring
  `rates.js loadSequenceRules()` (JSON overrides in place, hardcoded fallback always present).
- ✅ **T2** `viewer/structural_sanity.js` — rule evaluator: query STR elements, run the 5
  rules (floating member, span/depth steel, span/depth concrete, cantilever, column
  continuity), return `[{guid, ifc_class, name, storey, rule, severity, ratio}]`. Witness:
  `tests/test_structural_sanity_rules.js` — synthetic element_transforms/elements_meta
  fixture (same pattern as `witness_disc_room_type_weight.js`) with one floating beam
  (zero support both ends), one beam framing into another beam (must NOT flag floating),
  one known-unsupported column, one clean beam → assert exact severities. Then run against
  real `buildings/Hospital_meta.db` and assert floating-member count is in the 40–50 range
  and concentrated at roof-level storeys — regression guard on the VALIDATION numbers above.
- ✅ **T3** `A.showRuleChecklist(config)` — GENERIC panel (config: title, button label,
  color map, rule-category list, rows), not Sanity-hardcoded, per SHARED CHASSIS decision
  above. `A.showStructuralSanity()` becomes a thin call into it with Sanity's config. Reuse
  `A.zoomToGuid`, `_elInfo`-style lookup, diff.js row template, plus the 3-button/All toggle
  (UI MODEL). Witness: node-level render of the HTML string, assert row count/severity
  grouping matches T2 fixture output, and assert toggle filters to the right rule category
  (no live browser needed for this part).
- ✅ **T4** Trigger wiring — sidebar button/menu entry beside existing Clash entry point
  (find it in `viewer.html`'s clash-panel toggle; mirror, don't duplicate the panel-open
  plumbing). Button label "Sanity".
- ✅ **T5** GENERIC Mode 3D tint helper — takes a `{guid: severity}` map + a color lookup,
  wireframe-overlays those elements. Same technique as Clash Mode's `DISC_COLORS` overlay
  (measure.js ~1723), just parameterized instead of hardcoded to discipline. Sanity Mode
  calls it with `SEVERITY_COLORS`. Witness: assert material/opacity config matches Clash
  Mode's, only the color lookup differs.
- ✅ **T6** GENERIC long-press share deep-link — takes `{guid, checkId, rule}`, builds
  `?guid=<guid>#<checkId>=<rule>`, calls existing `A.shareUrl()`; on load, `?guid=` re-zooms
  (sitecam.js precedent) and `#<checkId>=<rule>` reopens the matching panel pre-filtered.
  Sanity calls it with `checkId='sanity'`. Witness: URL round-trip (build → parse → same
  guid + checkId + rule out).
- ✅ **T7 SKIPPED (optional, only if T2 profiling on Terminal/Hospital-scale building is slow)**
  sidecar bake following `analysis_sidecar.js`'s `get5D`/`get4D` OPFS pattern.

**Note (not a numbered task, no action here):** implementation order across the 3 specs in
this PR is **Structural Sanity (this file) → `prompts/EXIT_DETECTION.md` →
`prompts/EGRESS_SANITY.md`**. Egress's door-width/circulation-spine/isolated-room rules
consume this file's T3/T5/T6 generic chassis (zero new UI code); Exit Detection is a fix to
the shared `common/room_graph.js` engine that Egress's real distance-to-exit rule depends
on (see EXIT_DETECTION.md T5) but does not block Egress's other 3 rules from shipping.

## TEST / DEPLOY
Whitebox §-log first (`§STRUCT_SANITY rule=<name> severity=<n>`). `node --check` every
edited JS. Worktree `feat/structural-sanity` off fresh origin/main. Witness each rule with
a fixture assertion (exact severity), not the exit code. No live-panel screenshot claim
without an actual browser run (`run` skill) against a real building DB.

## T8 §RULE_REPORT — the findings WITHOUT the film, and a Report button on both panels
**Spec origin: `bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §87` (2026-09-12), authored by
the movie-bake session off its own measured bake logs.** Restated here because the
implementation lands in THIS repo; §87 is the authority on rationale, this section on contract.

**T8.1 THE MEASURED CASE.** From that session's bakes: Terminal knows all 205 findings at
**+42s** and finishes the film at +1,194s (3.5% analysis); Hospital knows all 509 at **+101.3s**
and finishes at ~+6,000s (1.7%). Of Hospital's 101.3s, **71.3s is model load** (`§CLI_BAKE_LOADED`)
and ~29s is cinema path planning + render staging a report does not need. The rules themselves
cost about a second. `cli_silent_bake.js` had `--opening-only` but nothing that stops at the
knowing.

**T8.2 ONE PURE BUILDER, THREE SURFACES.** `viewer/rule_report.js` exports
`buildRuleReport({ rowsS, rowsE, ruleDefs, meta })` → a plain object. No DOM, no THREE, no
camera, no `plan` — same portability contract as `viewer/structural_sanity.js`. Surfaces:

| surface | how it gets there | in this repo? |
|---|---|---|
| CLI | `cli_silent_bake.js --findings-only` → writes `<out>.json`, exits before the first frame | ✅ this PR |
| Sanity/Egress panels | a **Report** button → the same object → Blob download | ✅ this PR |
| the film's closing card | `rule_findings_film.js` `_stats` reads the SAME builder | ⛔ that file is on `feat/rule-findings-film`, not on main — wired by that session when it merges |

All surfaces must be unable to disagree about one building. This is the lesson of `0.75` m/step
being written twice across two branches, applied BEFORE the drift rather than after.

**T8.3 ⚠ THE REPORT MUST NOT RIDE `A.ruleFindingsFilmBuild`.** That function needs a `plan`
(§77.3's dwell precompute calls `plan.poseAt`), `A.showRuleModeTint`, and later a camera —
everything findings-only exists to skip. Call `StructuralSanity.evaluate(dbQuery, rules)` and
`EgressSanity.evaluate(dbQuery, rules)` DIRECTLY, the same evaluators the panels already share.
RoomGraph still loads, because egress genuinely needs it.

**T8.4 WHAT IS IN IT — only what already exists, nothing composed.**
- **Provenance**: db name, commit, sw `CACHE_VERSION`, ISO timestamp, and **`rulesSource` per
  rule file: `fetched` | `fallback` | `unknown`.** The panels already draw that distinction
  (`§STRUCT_RULES_JSON loaded=json|fallback`); a report that hid it would present this repo's
  hardcoded fallback thresholds as the project's authored ones.
- **Per-rule set totals** — the same grouping the panel headers and the film boxes state.
- **Per-finding rows**: `guid, ifc_class, name, shortName, storey, rule, severity` and the value
  as `{ value, unit }` — **never a bare `ratio`**, which is metres for `door_clear_width` /
  `circulation_distance` and a dimensionless ratio for `span_depth_*`.
- **Egress stats**: `maxExitDistM`, `maxExitSteps`, carrying the `~` estimate disclosure and the
  `0.75 m/step` assumption as a named field, read from `rule_checklist.js`'s own
  `longestExitSteps()` — not a second copy of the arithmetic.
- **Room-graph facts**: `exits`, `noRaster`, `doors` from `§ROOM_GRAPH_EXITS`. `buildGraph` is
  called by `egress_sanity.js` with its log SILENCED, so the builder cannot see that line; the
  CALLER captures it and passes it in `meta.roomGraph`. Absent → `null` with a stated reason,
  never a fabricated 0.

**T8.5 A ZERO IS A RESULT HERE — a deliberate divergence from the film, stated so nobody
"fixes" it.** The film drops a vacuous card ("never a fabricated zero"). A report lists a rule
with **0 findings explicitly**: "we checked `door_clear_width` and found none" is information on
a page and noise on a moving card. Same data, different surface, different right answer. The
builder therefore needs `ruleDefs` — the rule NAMES it was asked to check — not just the rows.

**T8.6 DETERMINISM IS THE POINT.** Same DB → byte-identical JSON but for the timestamp. That is
what makes it diffable across builds and across rule changes, which is the actual disruption:
today sharpening any of the eight rules costs a full bake to see on a real model.

**T8.7 FORMAT.** One JSON object. CLI writes `<out>.json`; the panel downloads the same bytes
through the convention already in the tree (`variation_order.js` ~267: Blob → `a.download` →
`URL.revokeObjectURL`, plus a `§`-tagged console line). NOT xlsx now — `exceljs` is already here
for Variation Orders and can layer on the same builder later.

**T8.8 THE PIN.** `_buildRuleChecklistHtml(config)` is a GENERIC chassis already rendering a
button row ("All" + one per `config.categories`) and a Close button; both `A.showStructuralSanity`
and `A.showEgressSanity` call it with their own config. **The Report button joins that row, once**
— not per panel — so a third rule panel added later inherits it for free. It reports what the
panel is currently showing (`config.rows`), so an applied category filter is honoured rather than
silently ignored.

**T8.9 TESTS (R-series), `tests/test_rule_report.js`.**
- **R1 PURE** — the builder runs in Node with no DOM/THREE/camera/plan. Fails any version that
  reaches for film state.
- **R2 SAME-NUMBERS** — builder per-rule totals equal a direct count over the same rows. (§87's
  own R2 compares against `ruleFindingsFilm.stats()`; that file is not on main — the film session
  adds that half on its branch. Stated, not silently dropped.)
- **R3 ZERO-IS-LISTED** — a rule in `ruleDefs` with 0 rows appears with `count: 0`.
- **R4 PROVENANCE** — `rulesSource: 'fallback'` survives into the report; a missing source reads
  `unknown`, never `fetched`.
- **R5 UNIT-NOT-BARE** — `door_clear_width` reports `unit: 'm'` and `span_depth_steel` reports
  `unit: 'ratio'`. The overloaded `ratio` field never printed bare.
- **R6 DETERMINISTIC** — the same rows twice give identical JSON but for the timestamp.
- **R7 NO-FILM-DEPS** — a real `--findings-only` run emits no `§MAXQ_*` line and no frames. Grep
  the log; exit code is not evidence.
- **R8 REAL-BUILDING** — the builder over real `buildings/Hospital_meta.db` reproduces the
  evaluators' own `§`-logged counts.

**T8.10 OPEN, NOT SOLVED BY THIS — THE LOAD.** 71.3s of Hospital's 101.3s is model load and the
report cannot go below it. Findings-only makes that the WHOLE cost instead of 1.7% of it, which
is what makes it worth attacking next; measure peak RSS across the load phase before changing
anything.

**T8.11 §RULE_SUFFICIENCY — the report reviews ITS OWN INPUT DATA, not just the findings.**
*(User directive, 2026-09-12: "use it to do the review of data sufficiency also." Added to T8
because a findings file that does not say what it could not see invites the reader to treat a
metadata gap as a structural defect.)*

Measured on the bake DBs this session, by running the shipped evaluators in Node against
`buildings/{Hospital,Terminal,HHS_Office_Federated}_silent.db` — the gaps are not hypothetical:
- `Terminal` and `HHS_Office_Federated` contain **0 `IfcFooting`**. HHS flags **131/131** of its
  Level 1 columns on `column_continuity`, 61% of that building's entire finding count. Terminal
  flags 108/158, of which its two ground storeys are 30/30 and 56/56.
- Terminal has **0 `IfcWallStandardCase`** (all 333 walls are `IfcWall`) and 705 `IfcSlab`;
  neither class is in `COL_SUPPORT_CLASSES`, so a Terminal column can only be supported by
  another column.
- `SUPPORT_CLASSES` omits `IfcWall`. Of Hospital's 217 `span_depth_cantilever` findings — 43% of
  that building's 509 — **not one has a genuinely free end**: 121 sit on an `IfcWall`, 41 on an
  `IfcWallStandardCase` just outside the 0.15 m tolerance, 33 on an `IfcStair`. No Hospital beam
  is named "cantilever" anywhere; `isCantilever` is `supportedCount === 1`, an inference, and it
  PREEMPTS material classification. All 217 are named steel sections and 113 of them would be
  clean under `span_depth_steel`'s own 24/30.
- All 1970 Hospital beams and 604 Hospital columns have `material_name` NULL; HHS columns carry
  `"≈ White"`, a colour. The steel/concrete split therefore runs on `name_hints` alone.
- `IfcSpace` count in `elements_meta` is **0 in all three buildings**. Every room-rule finding
  sits on a synthesized room, and the injection labels its own confidence in the NAME — `≈`
  approximate, `⚠` suspect. Neither evaluator reads that sigil.

**The contract.** `RuleReport.runSufficiencyProbes(dbQuery)` executes a fixed list of probes over
the SAME `dbQuery(sql, params) -> rows` contract the evaluators use — portable, no DOM, no new
table. Each probe returns `{ check, rules, measured, verdict, consequence }` where:
- `measured` is a real count from a real query. Never a guess; a probe whose table/column is
  missing returns `verdict: 'unavailable'` with the error, never a 0 that would read as a finding.
- `verdict` is `ok` | `degraded` | `absent` | `unavailable`, DERIVED from the count by a stated
  threshold in the probe itself — not an opinion typed into the report.
- `consequence` names which rule reads which way when the datum is missing, in plain words.

**Flag-rate is part of sufficiency, not a separate idea.** A rule that fires on ~90% of its
population is not discriminating on that building (HHS `circulation_distance` 68/76; Hospital's
own `Hospital_meta.db` 135/149). The report states `flagged/population` per rule as a measured
ratio and says nothing more about it — the number is the argument.

**The report never downgrades a finding.** Sufficiency sits beside the findings, never edits or
suppresses them: the rules said what they said. The reader decides.

**Tests (extending T8.9):**
- **R9 PROBES-MEASURED** — every probe's `measured` traces to a query actually run; a probe over
  a DB missing the table reports `unavailable`, not `ok` and not `0`.
- **R10 GAP-IS-CAUGHT** — a fixture with 0 `IfcFooting` and columns at the lowest storey yields
  `verdict: 'absent'` on the footing probe. Fails a version that stays silent on the gap that
  produced 131/131 on a real building.
- **R11 FINDINGS-UNTOUCHED** — the finding rows and per-rule totals are byte-identical with and
  without the sufficiency section. Proves it annotates rather than filters.

**T8.12 §STRUCT_WITNESS / §EGRESS_WITNESS — a finding must be able to show its own working.**
*(User directive, 2026-09-12: "so that users can inspect how truthful the output is based on what
assumptions, will right away eye ball that so called isolated rooms are actually not so etc. In
this case, you can harden WITNESS logging to debug if so.")*

T8.11 reviews the DB. This reviews the ROW. A finding's evidence is frequently an ABSENCE — "no
support found", "no path found" — and an absence is precisely what a bare row cannot show. The
reader cannot tell *nothing is there* from *something is there that this rule cannot count*.

**Opt-in, default OFF.** `evaluate(dbQuery, rules, { witness: true })`. Off, nothing changes and
nothing is paid. On, `structural_sanity.js` runs ONE extra query for every element with a
transform — every class, every discipline, the candidates the rules deliberately do not consult —
and `egress_sanity.js` indexes the room graph's own edges once. Measured cost: Hospital 1.4 s,
Terminal 0.56 s, HHS 0.08 s.

**⚠ ADDITIVE OR NOTHING.** The witness explains a finding; it must never create, drop or move one.
R12 asserts `guid|rule|severity|ratio` is identical with witness on and off, on the real
Hospital_meta.db (488 structural + 142 egress rows, unchanged). A witness pass that quietly
widened a tolerance would change counts *and* agree with itself — that is the trap.

**What each rule shows, and what it settles.** Measured on real data, not designed in the abstract:
- `isolated_room` → `graphDegree`, `neighbours[]` (with the edge kind and door name), and
  `storeyHasCirculationNode`. Hospital's 7 isolated rooms are all `graphDegree: 0` with
  `storeyHasCirculationNode: false` — the graph never connected them, so "isolated" describes the
  extraction. HHS's single isolated room has **`graphDegree: 6`**, with four E2 door edges to its
  own storey's spine: it is demonstrably **not** isolated, and the row now says so on its face.
- `column_continuity` → `nearestBelow` (guid, class, centreline offset, top-to-base gap) and
  `rejectedBecause`. Hospital's 24: twelve rejected on centreline offset — one is an
  `IfcWallStandardCase` **foundation retaining wall at 0.315 m against a 0.3 m tolerance**, a
  15 mm miss — nine because `IfcMember` is not a column-support class, two on the z gap, and
  exactly **one** has nothing below it at all.
- `span_depth_cantilever` → `classifiedBy` states outright that cantilever is an INFERENCE from
  `supportedCount === 1` and that no cantilever attribute exists in the schema; `freeEnds[].nearest`
  names what sits at the un-counted end; `wouldBeCleanUnderSteelRule` says whether the
  classification is what produced the flag. Hospital's 217: only **2** have nothing near the free
  end (76 `IfcWall`, 59 `IfcWallStandardCase`, 20 `IfcSlab`, 18 `IfcBeam`…), and **113 of 217**
  would be clean under `span_depth_steel`'s own 24/30.
- `floating_member` → both free ends with their nearest neighbour, searched at 4× the rule's
  tolerance so a near-miss reads as a near-miss rather than as nothing.
- `door_clear_width` → `bboxXM`/`bboxYM` and `widthTakenAs`, plus the standing disclosure that a
  bbox extent is nominal, not clear, width.
- `circulation_distance` → `measuredTo`, `hops`, `doorsOnRoute`, and the room's own `≈`/`⚠` sigil.

**`atLowestModelledLevel`** on `column_continuity` names the commonest false positive outright: a
column on the model's lowest plane in a model with no footings. HHS measures **131/131**.

**Tests:** R12 (above) — rows identical on/off; every `isolated_room` states degree and
neighbours; a degree>0 room reads differently from a degree-0 one; every `column_continuity` names
what is below it or that nothing is, with a reason; every cantilever discloses the inference.

**T8.13 §RULE_FALLBACK_ONE_SOURCE — one literal for the thresholds, one shape for "which file ran".**
*(Handed to this session by the movie-bake session, 2026-09-12: "they own the mechanism — one
source of truth for which rules file loaded, exposed as data rather than a console line. I own the
film's consumer of it: one line on the closing card, written against whatever shape they land.")*

**The hazard was already a bug.** That session verified its two copies byte-identical and concluded
the dedup would be a pure move. That is true *within* its own branch and false across the repo —
`feat/rule-findings-film` is based on `42340b46`, before #1715, so **three** files on it carry
pre-#1715 thresholds:

| source | `span_depth_concrete` | `door_clear_width` critical | `circulation_distance` |
|---|---|---|---|
| main `rates/*.json` (authored) | **16 / 21** | **0.813 m** | **45.7 / 60.96 m** |
| main `rule_checklist.js` | 16 / 21 | 0.813 m | 45.7 / 60.96 m |
| main evaluators (inline defaults) | 16 / 21 | 0.813 m | 45.7 / 60.96 m |
| film `rates/*.json` | 20 / 26 | 0.80 m | 30 / 45 m |
| film `rule_checklist.js` | 20 / 26 | 0.80 m | 30 / 45 m |
| film `rule_findings_film.js` | 20 / 26 | 0.80 m | 30 / 45 m |

That is the whole of the bake-vs-main gap already measured this session: Terminal 205 vs 203, HHS
215 vs 212, Hospital 509 vs 509. Reconciliation IS required on rebase, and the answer is main's
cited values (ACI 318-19 Table 9.3.1.1; IBC 2021 §1010.1.1 and Table 1017.2).

**There were four copies, not two.** Besides the two constants that session found, each evaluator
re-typed every threshold inline as `byName.<rule> || { … }`.

**The shape, landed here:**
1. **`StructuralSanity.FALLBACK_RULES` / `EgressSanity.FALLBACK_RULES`** — the ONE literal each,
   in the module that owns the rule semantics. The inline per-rule defaults now read from it.
   `rule_checklist.js`'s two constants are deleted.
2. **`RuleReport.loadRules(fetchFn, url, fallback, opts)` → `Promise<{ rules, source, url, error }>`**,
   `source` ∈ `fetched` | `fallback`. `fetchFn` is injected, so it stays DOM-free and
   Node-testable. It defines a mechanism, never a fourth copy of the numbers — the fallback is
   passed in by the caller from the evaluator that owns it. A failed fetch is never a silent
   substitution: the caller gets the fallback *and* the reason. Logs `§RULE_RULES_SOURCE`.
3. **`RuleReport.diffRuleThresholds(a, b)`** — compares by rule name and every numeric field, so a
   reordered file passes and a changed threshold does not.
4. The panel caches on `A._structuralRulesSource` / `A._egressRulesSource`; the report's
   `rulesSource` header already carries it (T8.4). `§STRUCT_RULES_JSON` / `§EGRESS_RULES_JSON` are
   kept for log continuity — the fact now travels as data *as well as* a console line.

**The boundary, as that session drew it:** this session owns the mechanism; the film session owns
the film's consumer of it — one line on the closing card, written against the shape above. Nothing
here invents that line's format.

**Tests:** R13 ONE-LITERAL — each `FALLBACK_RULES` equals its `rates/*.json` (a silent edit to
either side fails CI); no other file declares a fallback rules object; and a control proving the
guard catches the exact film-branch drift (concrete 16→20). R14 LOADRULES-SHAPE — `fetched` on ok;
`fallback` + reason on 404, on a thrown fetch, and with no fetch at all; the fallback handed back
IS the evaluator's one literal; and the fact reaches the report's provenance header.

**T8.14 §RULE_OVERLAY — per-jurisdiction rules, merged the way `rates.js` already merges packs.**
*(User instruction, 2026-09-12, after the movie-bake session's observation that `viewer/rates/`
holds 16 per-jurisdiction cost packs against 2 global compliance rulebooks.)*

**Verified before building, because the precedent is stronger than "unused plumbing":** the 16
packs each carry a 9-key schema (materials, labor, equipment, equipment_allocation, `sequence`,
smm_sections, work_packages, provisions, meta), and **15 of them already ship 49 `sequence`
entries** that `rates.js loadRateTemplate()` merges into `SEQUENCE_RULES`. One rulebook is already
regionalised through this mechanism. **No pack carries any compliance block** — so the real
asymmetry is 16 packs × 9 keys, none of them compliance, versus 2 global compliance files.

**The gap this closes.** `loadRateTemplate` merges *per key* — the JSON wins, keys it omits keep
their base value. `RuleReport.loadRules` was all-or-nothing: fetched **or** fallback. A regional
file that wants to change one threshold and inherit the rest could not work on it.

**Merge is per FIELD, one level finer than rates.** An overlay rule patches the fields it names and
inherits the rest:

```
base:    { name: 'door_clear_width', applies_to: ['IfcDoor'], warning_m: 0.85, critical_m: 0.813, max_severity: 'WARNING' }
overlay: { name: 'door_clear_width', critical_m: 1.054 }
result:  { name: 'door_clear_width', applies_to: ['IfcDoor'], warning_m: 0.85, critical_m: 1.054, max_severity: 'WARNING' }
```

That case is real and already documented in `egress_sanity.js`'s own header: IBC 2021 requires
1.054 m (41.5 in) for Group I-2 bed-movement egress doors — Hospital's own occupancy — but main
ships the general §1010.1.1 0.813 m because a blanket 1.054 would false-flag every
non-bed-movement door. **Measured:** Hospital reports **0** `door_clear_width` findings at 0.813 m
and **65** at 1.054 m. An overlay is how that number gets stated without restating the rulebook.

Rules the overlay does not mention are untouched; a rule present only in the overlay is **added**;
rule ORDER follows the base so output stays deterministic (T8.6); the base object is never
mutated; **arrays (`applies_to`, `name_hints`) are replaced wholesale** — there is no sensible
element-wise merge, and silently unioning hints would change which beams a rule claims.

**⚠ An absent overlay is the ORDINARY case, not a failure.** "This jurisdiction states no
override" must not degrade the base the way a failed *base* fetch does. A 404 reports
`source: 'absent'`; a file that exists but will not parse reports `source: 'error'` with the
reason. Conflating those would hide a broken regional file as "no override". Either way the base
rulebook is kept intact and usable.

**⚠ Provenance is the point, not a nicety.** With two layers, `rulesSource: fetched|fallback` per
FILE stops answering "where did this threshold come from" — the question a report exists for. The
report now carries `rulesOverlay` (which overlay, and whether it was fetched/absent/error/none)
and `rulesProvenance`: per overridden rule, exactly which fields the overlay supplied and **what
the base said**. An overlay that restates an identical value records no override.

**Selection follows the rates convention, and reuses its key deliberately:** `?rules=<id>`, else
`localStorage['bim_5d_pack']`, else none. A user who picked `cidb2024_my` for costs has stated
their jurisdiction once; asking again in a second registry is how two registries drift apart —
the exact failure T8.13 just cleaned up. File name: `rates/<kind>_rules_<id>.json`.
CLI: `--rules-overlay ID`, logging `§RULE_OVERLAY` and `§RULE_OVERLAY_APPLIED` per changed rule.

**No jurisdiction file ships in this PR.** The mechanism is here; authoring `egress_rules_my.json`
is a separate decision needing a real code citation per number, exactly as the THRESHOLD
DISCLAIMER demands of every threshold already in the tree.

**Tests:** R15 OVERLAY-MERGE — field override, sibling-field inheritance, untouched rules, stable
order, base not mutated, provenance naming both values, no-op override recording nothing, added
rule, arrays replaced, and the merged rulebook actually running on Hospital (0 → 65 findings).
R16 OVERLAY-LOAD — `none` when unrequested; `absent` on 404 with the base byte-identical and its
own source undegraded; `error` (distinct from absent) on a malformed file with the base still
usable; merge + provenance on a good overlay; and both reaching the report.

## T9 §ZERO_DEFECT_TOOLS — driving the rules to zero LOGIC defects, using T8's fast report as the bench
*(User instruction, 2026-09-12: "we supposed to land an all systems check without baking that is much
faster and report in toto. So use that as benchmark to work till zero defect in tools.")*

**The metric.** Not "fewer findings" — a rule can reach zero by becoming vacuous. The bench is the
**artifact rate**: findings whose OWN witness (T8.12) shows the rule rejected real load-bearing
geometry. Only classes that can carry vertical load count as evidence — `IfcCovering`,
`IfcOpeningElement` (a VOID), ducts, railings and furniture do NOT. The first version of this bench
counted any nearby element and read 76%; corrected, the true baseline was 63%.

| | findings | artifacts | rate |
|---|---|---|---|
| baseline | 2046 | 1295 | **63%** |
| after T9.1 + T9.2 | 1949 | 1205 | 62% |
| after T9.4 | **1603** | **858** | **54%** |

Per building, the rules that moved: Hospital `floating_member` **43 → 0**, `span_depth_cantilever`
**217 → 43**, `column_continuity` 24 → 15; Terminal `column_continuity` **108 → 11**.
`span_depth_steel` rose 204 → 263, which is correct — beams wrongly routed to the cantilever rule
returned to their own material rule.

**T9.1 §SUPPORT_CLASS_PARITY.** `IfcWall` was in neither support list. IfcWall vs
IfcWallStandardCase is an exporter choice, not a structural distinction — Terminal models all 333
of its walls as `IfcWall` and has zero `IfcWallStandardCase`, so a Terminal column could only be
supported by another column. Columns additionally gained `IfcSlab` (80 fleet rejections), `IfcBeam`
(51) and `IfcMember` (9): landing on a transfer slab, transfer beam or truss member is real.

**T9.2 §FRAMING_TOP_OF_STEEL — the framing test used the wrong datum.** It compared beam BOTTOMS.
Steel frames to TOP of steel. Of the 55 beam-to-beam free ends among Hospital's 43 flagged floating
members, **55/55 were rejected by the bottom test and 55/55 pass a top test** — typically a 0.355 m
beam into a 0.841 m beam, tops 4 mm apart, bottoms 482 mm apart. The bake DBs name the storeys
"Level 6 TOS" / "Level 7 TOS" — Top Of Steel. The model stated the convention the test ignored. Now
accepts either datum; a genuinely unsupported end has nothing near either way.

**T9.3 §SLAB_BEARING — NOT DONE, deliberately.** 434 fleet free-ends still sit on an `IfcSlab`.
Adding `IfcSlab` to the BEAM support list would drive `floating_member` toward zero by making the
test vacuous, not correct: a slab spans a whole floor, so its footprint contains nearly every beam
at that level. The right change is a bearing test — beam end at a slab EDGE, not anywhere beneath
it — which is a real design decision, not a class-list edit. Left open and stated.

**T9.4 §SUPPORT_NOT_DISCIPLINE_FILTERED — the root defect.** Every support query carried
`em.discipline = 'STR'`. `discipline` is a label the EXTRACTION assigns for view/layer purposes; a
column holds a beam up whether an exporter tagged it ARC or STR. Hidden by that filter:

| building | support-class elements the rule could not see |
|---|---|
| Hospital | **349 of 604 `IfcColumn` (58%)**, 1282 `IfcWallStandardCase`, 158 `IfcWall`, 2211 `IfcPlate` |
| Terminal | **ALL 333 `IfcWall`, ALL 705 `IfcSlab`**, 33,324 `IfcPlate` |
| LTU_AHouse | 780 of 1785 `IfcColumn`, 2408 `IfcWallStandardCase`, 896 `IfcSlab` |

The five Hospital beams still flagged floating after T9.1/T9.2 each sat on an `IfcWall` at
gapHoriz **0 m** / gapVert **0 m** — touching — invisible only because that wall is discipline ARC.
The SUBJECT of a rule stays STR-filtered; what may HOLD SOMETHING UP is now selected by
`ifc_class` alone. Those are different questions and only one is about drawing layers.

**⚠ THE OLD REGRESSION GUARDS WERE CIRCULAR, and passed for the life of the feature.**
`tests/test_structural_sanity_rules.js` asserted Hospital floating-member count `in [40,50]` and
">=50% at roof levels". Both came from this file's own VALIDATION section, written from the output
of the buggy code. The roof clustering was the bug's fingerprint — roof levels are where beam
depths change — so asserting it kept the bug alive. Replaced with the property the rule actually
claims: **no flagged beam has load-bearing geometry inside the rule's own `tolerance_m`**, with
near-misses OUTSIDE tolerance reported and not asserted, because a tolerance is an engineer's call
and not something a test may settle by widening a number until it passes. Non-vacuity is guarded by
the synthetic fixture, which still flags its deliberately unsupported beam CRITICAL.

**What remains, and why it is not a logic defect:** the `IfcSlab` bearing test (T9.3); the 0.3 m
`column_continuity` tolerance (191 fleet rejections are centreline near-misses — a threshold
question under the THRESHOLD DISCLAIMER); and HHS's 128 ground-floor columns, which are a real
DATA gap the model has no footings for and which T8.11's `footings_modelled: absent` already
discloses on every report.

**T9.5 §ARTIFACT_RATE — the bench, shipped as a tool, and the metric corrected twice.**
*(User: "exploit this benchmark runner.")* `tests/bench_rule_artifacts.js` — fleet runner over every
`buildings/*_{meta,silent}.db`, `--json` to record, `--gate <baseline>` to enforce.
`RuleReport.artifactRates(rows, ruleDefs)` is the pure core, so **every T8 report now grades its own
findings** rather than the metric living in a throwaway script.

**The metric was wrong twice, and both corrections changed which fix looked right.**
1. *Too generous:* the first version counted ANY nearby element as proof a rule erred — including
   `IfcCovering`, ducts, railings and `IfcOpeningElement`, which is a **void**. It read 76% against
   a true 63%, and would have justified adding `IfcSlab` to the beam support list, i.e. T9.3, the
   change that makes the rule vacuous.
2. *Conflated defect with threshold:* the witness searches deliberately WIDER than the rule (4×
   tolerance). Counting every near-miss as an artifact put the fleet at 52% and pointed at
   `floating_member` in LTU_AHouse — where **240 beam-at-free-end cases looked like rule failures
   until the pair was checked properly and not one had a beam both top-aligned AND inside the
   footprint.** They are threshold questions, not logic to repair.

The metric now splits:
- **`defect`** — load-bearing geometry INSIDE the rule's own `tolerance_m`. The rule looked and
  missed. This is what T9 drives to zero.
- **`nearMiss`** — load-bearing geometry outside it. An engineer's threshold call, reported and
  never "fixed" by widening a number until the bench goes green.

| | found | defect | rate | nearMiss |
|---|---|---|---|---|
| `column_continuity` | 923 | **1** | 0% | 331 |
| `span_depth_cantilever` | 472 | 61 | 13% | 252 |
| `isolated_room` | 23 | 8 | 35% | 0 |
| `floating_member` | 328 | **140** | **43%** | 119 |
| **fleet** | **1746** | **210** | **12.0%** | 702 |

So the honest state after T9.1–T9.4: **12% defects, not 52%**, `column_continuity` is effectively
clean at 1-in-923, and the whole remaining target is `floating_member`'s 140 — which is T9.3, the
slab bearing test, still deliberately undone.

**Two traps the gate catches, both demonstrated:**
- **§BENCH_GATE_VACUOUS** — findings collapse >50% while the defect rate does not improve. A rule
  that stops firing without getting more accurate has been switched off, not fixed. Verified
  against a synthetic baseline: `findings 1000 -> 328 (-67%) but rate 43% -> 43%` → FAIL.
- **§BENCH_GATE_FLEET_MISMATCH** — these are fleet TOTALS, and `buildings/*.db` is gitignored, so a
  fresh checkout measures a smaller fleet and every rule silently looks improved. The gate compares
  the measured building set first and refuses to grade across a different one. Verified by hiding
  `Clinic_meta` → FAIL naming the missing building.

**Why a bench and not a test:** these numbers are properties of real buildings and move when a model
is re-extracted. Freezing one into an assertion is the circular-guard mistake T9 documents —
`test_structural_sanity_rules.js` asserted "count in [40,50]" for the life of a bug because that
range came from the buggy code's own output. The baseline is recorded data; the gate compares
against it; non-vacuity is guarded by fixtures that must still fail.
