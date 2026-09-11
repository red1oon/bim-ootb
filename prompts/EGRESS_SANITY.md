# ⚠ DO NOT REMOVE — "Egress" (Life-Safety/Fire-Egress Sanity): door-width + travel-distance
# SCOPE: SEQUENCED AFTER prompts/STRUCTURAL_SANITY.md (T1-T7) AND prompts/EXIT_DETECTION.md
#   (T1-T4) — the latter is what upgrades rule 2 from "circulation spine" to a real exit
#   distance (see EXIT_DETECTION.md T5); rules 1 and 3 don't need it. Reuses Structural
#   Sanity's generic chassis (`A.showRuleChecklist`, generic Mode-tint, generic share
#   deep-link) — this spec adds ONLY a rule evaluator + rule config, zero new UI code. Read
#   the log (§ lines) after every run.
# PRIME RULE: EXTRACT OR COMPILE ONLY. Same discipline as Structural Sanity — no invented
#   loads, no invented exit designations. Where a needed signal (e.g. which door is an
#   emergency exit) isn't reliably extractable, say so and scope the rule down or drop it —
#   do not guess.
# HONOUR until ✅ DONE.
# ⚠ THRESHOLD DISCLAIMER (stated up front this time, not retrofitted): door-width and
#   circulation-distance numbers below are UNCITED placeholders (no IBC/NFPA/local-code
#   lookup done). Ship WARNING-ceiling only, same as Structural Sanity's span/depth rule,
#   until an engineer or a cited code clause sets real values per jurisdiction (egress code
#   varies by jurisdiction far more than structural span/depth does — do not ship a single
#   global default as if universal). EXCEPTION: rule 3 (isolated room) is a graph-
#   connectivity FACT, not a threshold guess — it is allowed to ship CRITICAL.
# ⚠ VALIDATION UPDATE (done in-session via Node witness, see RULES v1): the original
#   "travel distance to exit" framing is DEAD — RoomGraph.escapeRoute() returns null for
#   every Hospital room (exits=0 fleet-wide, a documented, deliberate state in
#   common/room_graph.js, not a bug). Replaced with "distance to own-storey circulation
#   spine" + a new "isolated room" rule, both witnessed against real data — see
#   witness_egress_travel_distance.js (repo root, 4/4 pass).

## NAMING
Button label: **"Egress"**, not "Life-Safety" or "Fire Safety Analysis". v1 only checks
door clear width + travel distance to the nearest stair — NOT sprinkler coverage, fire
rating, smoke compartmentation, or fire-door hardware. "Life-Safety" implies that full
scope; "Egress" accurately names what v1 actually does. Same naming discipline as
"Sanity" vs "Structural Analysis" in the prior spec — don't claim a broader category than
what's checked.

## WHY (evidence, not assumption)
`FP` (Fire Protection) discipline = 14,357 elements in Hospital — third-largest discipline,
bigger than STR (2,828), currently zero rule-based check. Egress/travel-distance is the
most regulation-adjacent, highest-liability BIM coordination check in real practice. Natural
next domain following the Clash → Structural Sanity precedent (same rule-based, geometry
+classification-only shape, same UI chassis).

## SOURCE OF TRUTH (non-invent) — validated against real Hospital_meta.db before writing rules
- **Door width**: `IfcDoor` (ARC discipline, 440 in Hospital) via `element_transforms`
  (`bbox_x`/`bbox_y`, `rotation_z` — confirmed 0.0 for all 440 doors in Hospital, same as
  Sanity's beams, so clear width = `max(bbox_x, bbox_y)` is valid without a rotation
  correction). VALIDATED: real widths range 0.859m–3.025m, median 1.078m — **0 of 440
  doors fall under an 0.80m or 0.813m placeholder threshold**. Clean result on this
  building, not a showcase for this rule specifically.
- **CORRECTION to an earlier claim in this spec**: `IfcSpace` geometry is NOT missing —
  it was looked for in the wrong table. `element_transforms` has 0/142 rows for spaces
  (that table is for mesh/BREP elements), but `spatial_structure` carries real, complete
  room rectangles (`center_x/y`, `size_x/y`) for all 142 Hospital spaces — confirmed by
  query, `object_type='COMPILED'`. This is the table `common/room_graph.js` actually reads.
- **`common/room_graph.js` is a portable Node module, NOT browser-only** — another
  correction. It takes a `dbQuery` function and real DB rows, no DOM/THREE.js dependency
  (same pattern proven by `witness_room_graph_path.js` against Duplex). This means the
  travel-distance rule CAN be dry-run with a Node witness, exactly like Sanity's rules —
  no live browser needed for validation. Done: `witness_egress_travel_distance.js` (repo
  root), run against real `buildings/Hospital_meta.db`, 4/4 checks pass.
- **UPDATE 2026-09-11 (prompts/EXIT_DETECTION.md T1-T4 landed)**: the paragraph below (kept
  for history) describes v1's situation BEFORE real exit detection existed. It no longer
  applies — `RoomGraph.escapeRoute()` now reaches **149/156 Hospital rooms** (measured after
  the fix, `witness_egress_travel_distance.js` E1), because `common/room_graph.js` gained a
  real, MEASURED raster+footprint exterior-door test (`common/storey_footprint.js`) and E3
  stair edges now carry a real equivalent-corridor-metres weight (not raw vertical rise).
  **Rule 2 is now "distance to real exit" via `escapeRoute()`, demoting circulation-spine
  distance to a FALLBACK** for a room whose building lacks a raster (fleet coverage gap —
  `escapeRoute()` returns null there, same as before) or is one of the genuinely isolated
  rooms. See RULES v1 (REVISED) below for the dual-target design and the real numbers this
  changes — **the old warning_m:30/critical_m:45 thresholds no longer mean what they meant**:
  measured median distance-to-real-exit on Hospital is 93.6m (vs circulation-spine's 51.5m),
  because a real exit concentrated on one storey (Level 1 here) pulls in stair-weighted
  vertical travel for every room above it — 135/149 reachable rooms (90.6%) now exceed the
  OLD 30m warning threshold. Shipping those numbers unchanged would flag nearly every room,
  which is not a useful screening signal — treat them as needing fresh calibration against
  this NEW metric, not just carried forward. T3's evaluator ships a wider placeholder
  (documented there) rather than silently keeping numbers now known to be miscalibrated.
- **HISTORY (pre-2026-09-11, kept for context) — exit target CHANGED from "nearest
  IfcStair" to "own-storey circulation spine"**, based on what the witness found:
  `RoomGraph.escapeRoute()` (the module's actual nearest-EXIT function) returns **null for
  every one of Hospital's 156 rooms** — confirmed by running it, not assumed from a comment.
  This was by the module's own documented design at the time
  (`common/room_graph.js` ~line 768: a prior exit-auto-detection attempt was reverted
  fleet-wide for false positives — "exits=0... that is the HONEST state, not a regression"
  — pending a real exterior-door test that didn't exist yet). So "distance to exit" as
  originally speced could not be built on `escapeRoute()` at the time, and there was no
  ready-made "nearest stair" helper either (stairs appear as `E3` edges between per-storey
  `CIRC::*` circulation nodes, not as targetable point nodes). **v1 used
  `RoomGraph.shortestPath(room, 'CIRC::'+storey)`** — distance from a room to its own
  storey's circulation spine — the achievable, real, non-invented proxy at the time; called
  "distance to circulation," not "distance to exit," in the UI to avoid the same overclaim
  class as "Stress." This is now the FALLBACK target, per the UPDATE above.
- **Real witnessed numbers** (`witness_egress_travel_distance.js`, Hospital, 156 rooms):
  149/156 reachable to their own circulation spine, median 51.5m, farthest outliers 110m–
  260m (14 rooms over 100m) — **NOT yet root-caused as real vs. a routing artifact**; before
  trusting `warning_m`/`critical_m` defaults, inspect the specific farthest rooms in the
  viewer. **7 rooms are fully unreachable** (no path to their own spine at all) — this is
  itself a real, separate, arguably more useful life-safety finding than a distance number
  (an isolated room with zero measured route out) — see RULES v1 below, added as its own
  rule rather than folded into the distance threshold.
- `rel_contained_in_space` (space_guid → element_guid) exists and is real — usable for
  room/door adjacency if the room-graph needs it; confirmed present, not assumed.

## RULES v1 — REVISED after witness validation (witness_egress_travel_distance.js)
1. **Door clear width** — `IfcDoor`: `max(bbox_x, bbox_y)`. Placeholder `warning_m: 0.85`,
   `critical_m: 0.80` (UNCITED — see disclaimer). `max_severity: WARNING` in v1. VALIDATED:
   0/440 Hospital doors flagged (all ≥0.859m) — clean pass, not a showcase for this rule.
2. **Distance to real exit, falling back to circulation spine** (UPDATED 2026-09-11, see
   UPDATE above — `escapeRoute()` is real now) — per room, `RoomGraph.escapeRoute(graph,
   room.guid)`; if that returns null (building has no raster — fleet coverage gap — or the
   room is genuinely isolated, distinct from rule 3 below which only fires on the
   no-path-at-all case against the SPINE target), fall back to
   `RoomGraph.shortestPath(room, 'CIRC::'+storey)` and label the row "to circulation
   (fallback)" vs "to exit" so the UI never overclaims which target a given row actually
   measured. Placeholder `warning_m: 30`, `critical_m: 45` carried forward UNCHANGED from
   v1's circulation-only design — **NOT re-calibrated for the new exit-distance metric**,
   which measures materially farther (median 93.6m vs circulation's 51.5m) because it
   folds in real stair-weighted vertical travel. `max_severity: WARNING` (still uncited).
   90.6% of Hospital's exit-reachable rooms now exceed the warning threshold — ship it,
   but do not present it as a tuned screening signal until an engineer resets these two
   numbers for what "distance to a real exit" actually means on a multi-storey building.
3. **Isolated room (new — found via validation, not originally speced)** — `RoomGraph.
   shortestPath(room, 'CIRC::'+storey)` returns null (no path at all, not just a long one).
   `max_severity` uncapped — this is a real graph-connectivity fact (no measured route out),
   not a threshold guess, so **CRITICAL is appropriate**, unlike rules 1–2. VALIDATED:
   7/156 Hospital rooms are isolated.

`egress_rules.json` shape (mirrors `structural_rules.json`):
```json
{
  "egress_rules": [
    { "name": "door_clear_width", "applies_to": ["IfcDoor"],
      "warning_m": 0.85, "critical_m": 0.80, "max_severity": "WARNING" },
    { "name": "circulation_distance", "applies_to": ["room_graph_node"],
      "target": "exit_or_own_storey_circ", "warning_m": 30, "critical_m": 45,
      "max_severity": "WARNING" },
    { "name": "isolated_room", "applies_to": ["room_graph_node"],
      "target": "own_storey_circ" }
  ]
}
```

## UI — zero new UI code, generic chassis from STRUCTURAL_SANITY.md
`A.showRuleChecklist({ title: 'Egress', checkId: 'egress', colorMap: SEVERITY_COLORS,
categories: ['Door Width','Circulation Distance','Isolated Room'], rows })` — same panel,
same `zoomToGuid`, same Mode-tint helper, same share deep-link (`?guid=<guid>#egress=<rule>`),
all reused as-is from Structural Sanity's T3/T5/T6. This spec adds only `egress_sanity.js`
(the evaluator) + `egress_rules.json`. Lead the panel with **Isolated Room** — smallest (7),
highest-confidence (a graph fact, not a threshold guess), most demo-worthy — same principle
as Structural Sanity leading with Floating Member.

## OUT OF SCOPE (explicit)
- No sprinkler coverage, fire-rated wall/door consistency, or smoke-compartmentation
  checks — real "life-safety" scope, not attempted here.
- No FEA-adjacent fire simulation (smoke/heat modeling) — different discipline entirely.
- Same rule as Sanity: no invented exit designations, no invented occupancy loads.

## TASKS / STATE
- ✅ **T1** Validation done via Node witness (`witness_egress_travel_distance.js`, repo
  root, 4/4 checks pass on real `buildings/Hospital_meta.db`) — NOT a live-browser task in
  the end; `common/room_graph.js` is portable to Node (correction, see SOURCE OF TRUTH).
  Found: `escapeRoute()` returns null fleet-wide (killed the original "nearest stair"/"exit"
  framing), circulation-spine distance is computable for 149/156 rooms (median 51.5m, 14
  outliers over 100m — NOT root-caused, needs a viewer look before the threshold is trusted),
  7/156 rooms fully isolated (promoted to its own rule, #3, CRITICAL-capable). RULES v1
  above already reflects these findings — do not re-derive them, extend the witness instead
  if more validation is needed.
- ✅ **T2** `viewer/rates/egress_rules.json` — the three rules above, loader mirroring
  `structural_rules.json`'s pattern.
- ✅ **T3** `viewer/egress_sanity.js` — evaluator: door width (straightforward, same shape
  as Sanity's span/depth query) + circulation-distance + isolated-room (both via
  `common/room_graph.js`'s `buildGraph`/`escapeRoute`/`shortestPath` — `escapeRoute()` is
  real now, see the UPDATE above; try it first, fall back to `shortestPath(room,
  'CIRC::'+storey)` only when `escapeRoute()` returns null). Witness fixture for door width
  (known-narrow, known-wide). Circulation-distance/isolated-room witness: extend
  `witness_egress_travel_distance.js` in place with `chk()` assertions against real numbers
  (149/156 reachable via escapeRoute() post-fix, 7 isolated) as a regression guard, same
  pattern as Sanity's T2.
- ✅ **T4** Wire into `A.showRuleChecklist` with Egress's config — no new panel code.
  Button label "Egress" beside "Sanity" and "Clash".

## TEST / DEPLOY
Whitebox §-log first (`§EGRESS rule=<name> severity=<n>`). `node --check` every edited JS.
Worktree off fresh origin/main, sequenced after `feat/structural-sanity` merges (depends on
its T3/T5/T6 chassis functions existing). T1's validation is done (`witness_egress_travel_
distance.js`, 4/4 pass) — this spec now has the same pre-validation discipline as
Structural Sanity, with one open item carried forward: the >100m circulation-distance
outliers are witnessed but not yet root-caused (real vs. routing artifact) — resolve that
before treating `warning_m: 30`/`critical_m: 45` as more than a placeholder shape.
