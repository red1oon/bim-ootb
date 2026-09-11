# ⚠ DO NOT REMOVE — Exit Detection + Stair-Time Weighting (common/room_graph.js core fix)
# SCOPE: SEQUENCED BEFORE prompts/EGRESS_SANITY.md's real distance-to-exit rule (Egress's
#   current circulation-spine/isolated-room rules ship regardless and are NOT blocked by
#   this). This is a fix to the SHARED engine (`common/room_graph.js`), not the Egress
#   panel — every consumer benefits (Fly Tour's `entrance` detection is currently WRONG for
#   the same root cause this fixes, see WHY). Read the log (§ lines) after every run.
# PRIME RULE: EXTRACT OR COMPILE ONLY. An exit is real only if a MEASURED exterior test
#   passes (raster + footprint sampling) — never a name/keyword guess (the prior attempt,
#   §G1-EXIT-IS-A-LIFT-DOOR, shipped a lift door as an "exit" this exact way, and was
#   reverted for it). Stair-time weighting uses a real walking-speed convention, disclosed
#   as uncited pending a code/SFPE citation — see THRESHOLD DISCLAIMER.
# HONOUR until ✅ DONE.
# ⚠ THRESHOLD DISCLAIMER: stair descent/ascent speed constants below are a real, commonly-
#   cited evacuation-engineering convention (SFPE Handbook-style: ~0.6–0.8 m/s on stairs vs
#   ~1.2–1.5 m/s on a flat corridor) but NOT pinned to a specific cited edition/clause in
#   this session. Treat as an editable placeholder pending citation, same discipline as
#   Structural Sanity's span/depth ratios — do not present as a settled code value.

## WHY — this is resuming existing, previously-scoped work, not new territory
`common/room_graph.js` already tried real exit detection once (`E4`, per its own header:
OCCUPANT_PATHFINDER.md work order) — turned every door failing a lift-name filter into an
`EXIT::` node. Measured over the fleet's 1633 ARC doors: only Terminal produced exits (5),
and all 5 were elevator doors — nothing in that code ever tested whether a door actually
faces outside. This shipped two real wrong answers (Fly Tour's `entrance` = a lift door on
Terminal; `escapeRoute()`, once wired, would have routed egress INTO a lift) and was
reverted fleet-wide (`exits = 0`, `§G1-EXIT-IS-A-LIFT-DOOR`, 2026-07-26) — "the HONEST
state, not a regression." The revert comment names the real fix directly: **"a real exit
node returns when the MEASURED exterior test lands (work order step 2: sample either side
of a door against the storey walkable raster + footprint — proven feasible, HHS yields 3
candidates of 133 doors)."** That test was designed and validated once, never wired in.
This spec finishes it.

Separately: E3 (stair) edges currently weight by `Math.abs(zB - zA)` — raw vertical rise in
meters, treated as equal to 1m of flat corridor. Real evacuation travel is slower on
stairs than on a corridor; this understates real egress time/distance on every multi-storey
path — including whatever Egress or Fly Tour computes today.

## PART 1 — Exit detection (revives E4, correctly this time)
**Primitive confirmed real and portable** (checked directly, not assumed):
`common/storey_raster.js` exports `StoreyRaster.fromRow(row)` → `.contains(px,py)` — O(1),
DB/file-I/O-free (same portability contract as `room_graph.js`), reads
`storey_walkable_raster` (`storey,res,x0,y0,cols,rows,bits`). Confirmed present and
populated for Hospital (7 rows, one per storey, real `res/x0/y0/cols/rows/bits`).

**⚠ Known gap, NOT yet designed — flagging honestly rather than hand-waving**: the original
work order says "raster **+ footprint**" (two tests). `raster.contains(px,py)` only answers
"is this point inside a real walkable room/slab surface on THIS storey" — a point that
returns `false` could mean genuinely OUTSIDE the building, OR an internal void the raster
doesn't cover (atrium, light well, elevator shaft, open stairwell). Confirmed by grep: no
building-envelope/footprint boundary test exists anywhere in this codebase yet. **T1 below
must design this before the exit test is trustworthy** — without it, this rewrite risks the
exact same false-positive class (an opening to an internal void mistaken for an exterior
door) that killed the prior E4 attempt, just with a different wrong answer than a lift.

**⚠ Fleet coverage gap** (found via `viewer/effects.js` comments): `storey_walkable_raster`
is patch-shipped for only 3 of 11 buildings fleet-wide; some live logs show
`no such table: storey_walkable_raster`. Exit detection must degrade to "unknown/unavailable"
for buildings lacking the raster — NEVER silently fall back to a name-based guess (that IS
the reverted mistake). Hospital has it; do not assume every building does.

**Algorithm** (once the footprint test exists): for each ARC-discipline `IfcDoor`, sample
a point just past the door threshold on each side, along the door's thickness axis
(`min(bbox_x,bbox_y)` direction — confirmed `rotation_z=0` for all 440 Hospital doors, same
as Sanity's beams, so this axis is reliable without a rotation correction). One side must
be `raster.contains()==true` (real interior) AND the other side must fail BOTH
`raster.contains()` AND the new footprint test (genuinely outside the building, not just an
uncovered void) → real exit candidate.

## PART 2 — Stair-time weighting (E3 edge fix)
Replace `w: Math.abs(zB - zA) || Math.abs(gr.zhi - gr.zlo)` (room_graph.js ~line 643) with
an equivalent-distance conversion: `w = flightLength / STAIR_SPEED_MPS * CORRIDOR_SPEED_MPS`
where `flightLength` is the real sloped travel distance of the flight (not just vertical
rise — check `IfcStairFlight`'s real going/rise geometry via `element_transforms`, do not
approximate with vertical rise alone, that's the same class of error this whole fix is
correcting). Placeholder constants (UNCITED, see disclaimer): `STAIR_SPEED_MPS: 0.7`,
`CORRIDOR_SPEED_MPS: 1.3`. Keeps the whole graph's weights in one commensurable "equivalent
corridor meters" unit — do not switch to a time unit for just this edge kind.

## TASKS / STATE
- ☐ **T1 (blocking — design + witness before anything else)** Design the building-footprint
  boundary test (the missing half of "raster + footprint"). Options to evaluate against real
  Hospital data: (a) union of all storeys' raster extents as a 2D footprint polygon/hull, (b)
  the building's own overall bbox from `elements_meta`/`spatial_structure` with a slack
  margin. Write `witness_exit_detection.js` (Node, mirror `witness_egress_travel_distance.js`
  — `common/room_graph.js`'s pattern already proves this is Node-witnessable, no browser
  needed) against real `buildings/Hospital_meta.db`. Record real candidate count and
  manually inspect each candidate door in the viewer before trusting any of them — same bar
  the original work order set for HHS (3/133, each one checked, not just counted).
- ☐ **T2** Wire the passing candidates as real `EXIT::` nodes in `buildGraph()`, replacing
  `var exits = 0;` (room_graph.js ~line 785) — keep the §-log line shape, `exits=N` now real.
- ☐ **T3** `escapeRoute()` regression witness: re-run `witness_egress_travel_distance.js`'s
  E1 check — it should now show `reachable > 0` where it previously asserted `reachable ===
  0`. Update that witness's assertion once T1/T2 land (do not leave a stale "always null"
  assertion in a file this spec depends on).
- ☐ **T4** Stair-time weighting: replace the E3 weight formula (PART 2), witness against a
  known real flight (compare old vertical-rise weight vs new equivalent-distance weight on
  the same real Hospital stair, confirm the new number is larger — stairs should never get
  CHEAPER than the old proxy).
- ☐ **T5** Once T1–T4 land, update `prompts/EGRESS_SANITY.md` rule 2 to use the now-real
  `escapeRoute()` for actual distance-to-exit, demoting "distance to circulation spine" to a
  fallback for buildings where the raster/footprint test is unavailable (fleet coverage gap
  above) rather than the only option.

## TEST / DEPLOY
Whitebox §-log first (`§EXIT_CANDIDATE guid=... side_in=... side_out=...`). `node --check`
every edited JS. Worktree off fresh origin/main, sequenced in the same branch/PR chain as
Structural Sanity and Egress (this one runs BETWEEN them). Do not mark T1's footprint test
"done" on a single building's plausible-looking count — spot-check candidate doors visually,
same bar as the original HHS validation, before wiring T2.
