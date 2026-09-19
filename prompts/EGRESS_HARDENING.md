<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# EGRESS HARDENING — 3 gaps found in a competitor comparison (Solibri/Pathfinder/academic IFC
# compliance checking), all built + witnessed this session

```
# ⚠ DO NOT REMOVE — SCOPE
Read the log after every run (Universal Protocol Log Mandate). This doc covers THREE additive,
opt-in checks — none change the default behaviour of any existing caller unless explicitly
requested. See witness_egress_hardening.js for the proof; read it in full before extending any of
the three items below.
```

## §0 — Why this exists

A comparison of this codebase against Solibri, Thunderhead Pathfinder, and published academic
graph-based IFC compliance-checking research surfaced 3 gaps ranked "most needed" (what a real
code reviewer would refuse to sign off without): (1) room/space coverage validation — is the
report even looking at the whole building, (2) occupant-load-aware egress sizing — a hard IBC
requirement this pipeline never checked at all, (3) the "protected exit stair" distinction —
`egress_sanity.js`'s own header already disclosed measuring to a ground-floor exterior door
instead of the code-defined protected-stair-enclosure terminus. All 3 confirmed NOT already built
anywhere in this codebase before this session (grepped: occupant load, space validation, protected
exit/exit discharge — nothing).

## §1 — Item 1: room/space coverage validation (`common/room_coverage.js`)

**What it measures:** per storey, (sum of compiled room rect area) ÷ (real walkable-raster area,
`common/storey_raster.js` — already built for `EXIT_DETECTION.md`'s footprint test, reused here,
no new data source). Below 50% (UNCITED heuristic screening threshold, disclosed as such — no
WHO/IBC number exists for this) → WARNING.

**Real measured result** (`witness_egress_hardening.js` R1a-c): Hospital's every real-raster
storey flags WARNING, 0.0%-15.2% coverage (matches MEMORY `bim-ootb-t10-hospital-slab-coverage`).
HHS's best storey (55.5%) is more than double Hospital's worst — a real, meaningful gradient, not
a threshold picked to force a story. Duplex has no raster table in this fixture at all → reports
UNKNOWN (null), never a false flag — same "unknown/unavailable, never a guess" discipline
`EXIT_DETECTION.md` already established for the fleet raster-coverage gap.

**Wired into:** `viewer/egress_sanity.js` rule 4 (`space_coverage`), always on (report-generation
time only — see §4 cost). `viewer/rule_checklist.js`'s Egress category list.

## §2 — Item 2: occupant-load-aware door width (`viewer/egress_sanity.js` rule 5, `door_occupant_capacity`)

**Numbers, WebSearch-verified 2026-09-18** (both fetched from up.codes, matched against ICC's own
chapter text):
- IBC 2021 Table 1004.5, "Business areas" = 150 gross sf/person = 13.94 m²/person. Occupancy-generic
  default — this pipeline extracts no occupancy classification (same disclosed limitation the
  existing `door_clear_width` rule already states for I-2's 1.054m bed-movement figure). A room
  whose real occupancy uses a denser Table 1004.5 factor (I-2 inpatient treatment = 240 gross sf,
  assembly w/o fixed seating = 15 net sf) would need real occupancy data this tool doesn't have.
- IBC 2021 §1005.3.2 "other egress components" (doors/corridors/ramps): 0.2 in/occupant
  non-sprinklered, 0.15 in/occupant sprinklered. No sprinkler data extracted either — uses the
  stricter non-sprinklered figure (0.00508 m/occupant), the same "over-flag, never under-flag"
  conservative bias `circulation_distance`'s own citation already states as this tool's design
  philosophy.

**LOCAL only, disclosed:** sums the occupant load of the room(s) a door directly connects to (via
its real E1/E2/E9 room-graph edges), NOT the full cumulative downstream convergence §1005.1
defines for a real capacity audit (a stairwell collecting multiple floors, a building's main exit
collecting a whole storey). Building that is a materially larger graph-traversal task, left open.

**Real measured result:** 0/0/0 flags on Duplex/HHS/Hospital — a REAL, honest finding, not a dead
rule: these buildings' room sizes at the Business-occupancy density never produce a load exceeding
a standard door's static minimum, so `door_clear_width`'s existing static threshold is the binding
constraint for typical rooms, not occupant-load sizing. **Proven live, not assumed** (witness R2b):
a synthetic 3000 m² hall behind a 0.9m door correctly flags (occupant load 215, required 1.09m).
Occupant-load sizing's real value is at high-density/assembly spaces and convergence points —
neither exercised by this session's available fixtures.

## §3 — Item 3: protected exit-stair terminus (`common/room_graph.js` `escapeRouteViaProtectedStair()`)

**The gap:** `egress_sanity.js`'s own header (THRESHOLD CITATIONS block) already discloses that
`escapeRoute()` measures distance-to-exit by walking the FULL stair chain down to a real
ground-floor `EXIT::` node — not the code-defined terminus (Table 1017.2: distance to the nearest
available exit, and a protected exit-stair enclosure counts as "reached" on entry). Stated
conservative bias: over-flags, never under-flags — safe, but not the code-defined quantity.

**What this pipeline CANNOT claim:** no `FireRating`/enclosure property is extracted anywhere
(grepped `common/*.js` + `DAGCompiler/python/extractIFCtoDB.py` — confirmed absent), so there is no
way to verify a stairwell is actually fire-rated/protected vs. an open feature stair.

**What it DOES measure, as a real graph fact:** whether the room's own storey's `CIRC::<storey>`
node — the ONE per-storey node every E3 stair edge actually connects — is confirmed, by real
E3-chain connectivity, to lead to a real measured `EXIT::` node. A disclosed PROXY ("this floor's
circulation is confirmed to reach a real exit via some stair"), not a fire-rating verification.

**Design correction found and fixed IN THIS SESSION, not shipped broken:** the first attempt
targeted `stairwp` nodes (the stair's own real per-flight-end render position). Measured directly:
`escapeRoute()` called FROM a stairwp guid returns null — `stairwp` nodes are polyline-rendering
metadata only (`§API-COMPAT-WAYPOINT`), never wired into `_buildAdjacency()`'s real traversable
edges. Corrected to target `CIRC::<storey>` instead (verified routable). `witness_egress_hardening.js`
R3d specifically checks for this class of regression (a stairwp guid must stay unroutable) so a
future session cannot silently reintroduce the broken design.

**Real measured result** (R3a-c): Hospital 12/30 rooms improved (Level 2: 95.4m→60.5m, Level 4:
106.9m→54.1m), HHS 68/77 rooms improved. **Zero rooms ever got worse**, on either building — a
min-of-two by construction, never regresses the existing conservative-but-safe number.

**Wired as OPT-IN** (`opts.protectedExitStair`, default unset/false) into `egress_sanity.js`'s
`circulation_distance` rule. Every existing caller — including `rule_checklist.js`'s live "Longest
path to exit" headline stat — is BYTE-IDENTICAL unless it explicitly opts in (R3e, verified).
With it on, Hospital's own "steps" stat measurably drops 143→131 (R3f) — the number moves toward
the true code-defined quantity, never away from it. **Flipping the default is left for whoever
reviews this PR** — it changes a number already shown on screen, so that decision isn't made here.

## §4 — Cost measurement: "how much does this cost in seconds during pathing?"

Measured directly (`witness_egress_hardening.js` COST-A/B, `buildings/Hospital_silent.db`, the
largest fixture, 440 doors):

- **`buildGraph()`: UNCHANGED — median 103ms across 5 runs**, identical to before this PR (zero
  lines touched inside `buildGraph()` itself; `escapeRouteViaProtectedStair()` is a wholly separate
  new function).
- **The live interactive Find Panel path (`RoomGraph.shortestPath`, `navigate_find.js`'s own call
  sites) is untouched by this entire PR** — confirmed by grep: zero call sites for
  `escapeRouteViaProtectedStair`/`RoomCoverage` exist outside `egress_sanity.js`. **Cost added to
  interactive pathing: 0ms**, not because it's fast, but because it never runs there.
- **`escapeRouteViaProtectedStair()` itself, worst case (cold cache):** 0.87ms/room on Hospital
  (26ms for all 30 rooms), vs. `escapeRoute()`'s own 0.50ms/room baseline — sub-millisecond either
  way. This only runs when `egress_sanity.js`'s Sanity report is generated (opt-in), never during
  interactive pathing.
- **Full Sanity-report generation** (`EgressSanity.evaluate()`, all 5 rules including the 2 new
  ones): 136ms on Hospital, 33ms on HHS, 12ms on Duplex — milliseconds, not seconds, and this is a
  once-per-report-open cost, not a per-click cost.

**Answer: effectively zero cost in seconds, anywhere.** The worst-case number found in this session
is 136ms of one-time report-generation time on the largest available fixture — three orders of
magnitude below "seconds," and it doesn't touch interactive pathing at all.

## STATUS — 2026-09-18: all 3 items built + witnessed; PR open, not merged

`witness_egress_hardening.js`: 13/13 green. Re-ran the 3 pre-existing room-graph/path witnesses
plus the prior session's real-AABB witness: `witness_room_graph_real_aabb.js` 13/13,
`witness_room_graph_path.js` 15/15, `witness_room_path_raster_polyline.js` pass=5/fail=2 (confirmed
pre-existing — same `Hospital storeys=0 rooms=0` root cause as the prior PR's own baseline check,
not caused by this work), `witness_room_path_ui.js` SKIPs (pre-existing missing fixture). **Zero
new regressions.** bim-ootb branch `feat/egress-hardening`, PR opened — **merge is the user's
call**, per `common/room_graph.js`'s own header ("the most real-world-regression-hardened file in
this codebase").

Still open, deliberately out of scope this pass: item 2's cumulative-downstream-convergence
calculation (§1005.1's full definition, vs. this pass's LOCAL-only scope); item 1's threshold is a
disclosed heuristic, not code-cited; item 3's `opts.protectedExitStair` default is left OFF pending
review, since flipping it changes an already-shown number.
