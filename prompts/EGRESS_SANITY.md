# ⚠ DO NOT REMOVE — "Egress" (Life-Safety/Fire-Egress Sanity): door-width + travel-distance
# SCOPE: SEQUENCED AFTER prompts/STRUCTURAL_SANITY.md ships (T1–T7). Reuses that spec's
#   generic chassis (`A.showRuleChecklist`, generic Mode-tint, generic share deep-link) —
#   this spec adds ONLY a rule evaluator + rule config, zero new UI code. Read the log
#   (§ lines) after every run.
# PRIME RULE: EXTRACT OR COMPILE ONLY. Same discipline as Structural Sanity — no invented
#   loads, no invented exit designations. Where a needed signal (e.g. which door is an
#   emergency exit) isn't reliably extractable, say so and scope the rule down or drop it —
#   do not guess.
# HONOUR until ✅ DONE.
# ⚠ THRESHOLD DISCLAIMER (stated up front this time, not retrofitted): door-width and
#   travel-distance numbers below are UNCITED placeholders (no IBC/NFPA/local-code lookup
#   done). Ship WARNING-ceiling only, same as Structural Sanity's span/depth rule, until an
#   engineer or a cited code clause sets real values per jurisdiction (egress code varies
#   by jurisdiction far more than structural span/depth does — do not ship a single global
#   default as if universal).

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
- **Travel distance to exit**: reuse `navigate_find.js`'s existing `_roomGraphFor()` /
  `window.RoomGraph.shortestPath()` — do NOT build a second pathfinder. Exit target =
  nearest `IfcStair` (60 in Hospital, ARC discipline) rather than an "exit door" tag,
  because **no reliable exit-door signal exists in this dataset** — checked `element_name`
  for "Exit"/"Ext" text hints, zero matches. Using stairs as the egress target is itself a
  simplification (misses ground-floor doors leading directly outside) but is grounded in a
  real, reliably-classified element rather than an invented tag.
- **NOT YET VALIDATED (unlike every Structural Sanity rule)**: `IfcSpace` has **zero**
  entries in `element_transforms` in Hospital (0/142) — rooms carry no simple center/bbox
  here, so the travel-distance computation cannot be dry-run with a standalone SQL script
  the way Sanity's rules were. It depends on `storey_walkable_raster` (present in
  `Hospital_meta.db`) + the live `RoomGraph` engine, both of which only run inside the
  browser app. **Before this rule ships with any severity above informational, run it live
  in-browser against Hospital and record real flag counts** — do not assume it will produce
  a showcase result the way floating-member did for Sanity. This is an open validation
  task (T1 below), not a design decision made yet.
- `rel_contained_in_space` (space_guid → element_guid) exists and is real — usable for
  room/door adjacency if the room-graph needs it; confirmed present, not assumed.

## RULES v1
1. **Door clear width** — `IfcDoor`: `max(bbox_x, bbox_y)`. Placeholder `warning_m: 0.85`,
   `critical_m: 0.80` (UNCITED — see disclaimer). `max_severity: WARNING` in v1.
2. **Travel distance to nearest stair** — per occupied space (via `RoomGraph.shortestPath`
   from space to nearest `IfcStair`), placeholder `warning_m: 30`, `critical_m: 45`
   (UNCITED — jurisdiction-dependent, see disclaimer). `max_severity: WARNING` in v1.
   **UNVALIDATED against real data — see SOURCE OF TRUTH above.**

`egress_rules.json` shape (mirrors `structural_rules.json`):
```json
{
  "egress_rules": [
    { "name": "door_clear_width", "applies_to": ["IfcDoor"],
      "warning_m": 0.85, "critical_m": 0.80, "max_severity": "WARNING" },
    { "name": "travel_to_exit", "applies_to": ["IfcSpace"], "exit_target": "IfcStair",
      "warning_m": 30, "critical_m": 45, "max_severity": "WARNING" }
  ]
}
```

## UI — zero new UI code, generic chassis from STRUCTURAL_SANITY.md
`A.showRuleChecklist({ title: 'Egress', checkId: 'egress', colorMap: SEVERITY_COLORS,
categories: ['Door Width','Travel Distance'], rows })` — same panel, same `zoomToGuid`,
same Mode-tint helper, same share deep-link (`?guid=<guid>#egress=<rule>`), all reused
as-is from Structural Sanity's T3/T5/T6. This spec adds only `egress_sanity.js` (the
evaluator) + `egress_rules.json`.

## OUT OF SCOPE (explicit)
- No sprinkler coverage, fire-rated wall/door consistency, or smoke-compartmentation
  checks — real "life-safety" scope, not attempted here.
- No FEA-adjacent fire simulation (smoke/heat modeling) — different discipline entirely.
- Same rule as Sanity: no invented exit designations, no invented occupancy loads.

## TASKS / STATE
- ☐ **T1 (blocking, do first)** Live-browser validation: run `RoomGraph.shortestPath` from
  each Hospital `IfcSpace` to its nearest `IfcStair`, log real distances, confirm the
  computation is even feasible at Hospital's scale (142 spaces × 60 stairs) before writing
  the rule's default thresholds into `egress_rules.json`. Record real counts here, same as
  Structural Sanity's VALIDATION section, before marking any threshold as more than a
  guess.
- ☐ **T2** `viewer/rates/egress_rules.json` — the two rules above, loader mirroring
  `structural_rules.json`'s pattern.
- ☐ **T3** `viewer/egress_sanity.js` — evaluator: door width (straightforward, same shape
  as Sanity's span/depth query) + travel distance (calls existing `RoomGraph`, per T1's
  findings). Witness fixture for door width (known-narrow door, known-wide door). Travel-
  distance witness depends on T1's outcome — do not fabricate one before T1 runs.
- ☐ **T4** Wire into `A.showRuleChecklist` with Egress's config — no new panel code.
  Button label "Egress" beside "Sanity" and "Clash".

## TEST / DEPLOY
Whitebox §-log first (`§EGRESS rule=<name> severity=<n>`). `node --check` every edited JS.
Worktree off fresh origin/main, sequenced after `feat/structural-sanity` merges (depends on
its T3/T5/T6 chassis functions existing). Do not start T2 threshold defaults until T1's
live-browser numbers exist — this spec explicitly does not have Sanity's level of
pre-validation, and should not pretend otherwise.
