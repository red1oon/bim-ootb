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
# ⚠ THRESHOLD DISCLAIMER: floating-member (rule 1) and slab-exclusion are verified logic —
#   span/depth NUMBERS (24/30 steel, 20/26 concrete) and the 0.3m column tolerance are
#   NOT sourced from a cited code (no Eurocode/ACI/BS lookup done). They were calibrated
#   by trial against Hospital's flag count to reduce noise — that is NOT the same as
#   standards compliance. Steel in particular has no code span/depth table at all; real
#   steel serviceability is deflection-based (Δ≤span/360 from actual load+section I), so
#   span/depth-as-proxy is inherently a rule-of-thumb, not a verified limit. Do NOT ship
#   these as CRITICAL-capable until a cited code clause or an engineer sets them — see
#   `max_severity: WARNING` cap on ALL THREE span_depth rules below (steel, concrete, AND
#   cantilever — cantilever's different numbers do not make it any less uncited). Treat
#   every number in `structural_rules.json` as an editable placeholder, not a validated
#   default.

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
   visible, never silent. Placeholder: `warning_ratio: 24`, `critical_ratio: 30`. **NOT
   sourced from a code citation** — trial-adjusted against Hospital's flag count only (see
   THRESHOLD DISCLAIMER at top). **Ships as WARNING-ceiling only in v1** (never
   auto-CRITICAL) until an engineer or a cited code clause sets real values.
3. **Span/depth ratio — concrete** — same check as rule 2, `element_name` hints
   `Concrete`/`RC`. Placeholder: `warning_ratio: 20`, `critical_ratio: 26`. Same
   uncited/WARNING-ceiling caveat as rule 2.
4. **Cantilever span/depth** — beam with support at exactly one end (rule 1's supported_at,
   not both/neither) — tighter default: `warning_ratio: 12`, `critical_ratio: 16`. Equally
   uncited/trial-adjusted as rules 2–3 — **also WARNING-ceiling only**, not exempt from the
   THRESHOLD DISCLAIMER just because the numbers differ.
5. **Column load-path continuity** — `IfcColumn`: rtree query for a column/footing/wall
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
- ☐ **T3** `A.showRuleChecklist(config)` — GENERIC panel (config: title, button label,
  color map, rule-category list, rows), not Sanity-hardcoded, per SHARED CHASSIS decision
  above. `A.showStructuralSanity()` becomes a thin call into it with Sanity's config. Reuse
  `A.zoomToGuid`, `_elInfo`-style lookup, diff.js row template, plus the 3-button/All toggle
  (UI MODEL). Witness: node-level render of the HTML string, assert row count/severity
  grouping matches T2 fixture output, and assert toggle filters to the right rule category
  (no live browser needed for this part).
- ☐ **T4** Trigger wiring — sidebar button/menu entry beside existing Clash entry point
  (find it in `viewer.html`'s clash-panel toggle; mirror, don't duplicate the panel-open
  plumbing). Button label "Sanity".
- ☐ **T5** GENERIC Mode 3D tint helper — takes a `{guid: severity}` map + a color lookup,
  wireframe-overlays those elements. Same technique as Clash Mode's `DISC_COLORS` overlay
  (measure.js ~1723), just parameterized instead of hardcoded to discipline. Sanity Mode
  calls it with `SEVERITY_COLORS`. Witness: assert material/opacity config matches Clash
  Mode's, only the color lookup differs.
- ☐ **T6** GENERIC long-press share deep-link — takes `{guid, checkId, rule}`, builds
  `?guid=<guid>#<checkId>=<rule>`, calls existing `A.shareUrl()`; on load, `?guid=` re-zooms
  (sitecam.js precedent) and `#<checkId>=<rule>` reopens the matching panel pre-filtered.
  Sanity calls it with `checkId='sanity'`. Witness: URL round-trip (build → parse → same
  guid + checkId + rule out).
- ☐ **T7 (optional, only if T2 profiling on Terminal/Hospital-scale building is slow)**
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
