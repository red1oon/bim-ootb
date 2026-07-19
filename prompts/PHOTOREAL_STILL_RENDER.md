
## §CINEMA_RECIPROCAL BUILT (2026-07-19) — PR bim-ootb#897, sw v813, witnessed 11/11
Implemented in `viewer/effects.js` `_cinemaPathPlan`. **The clamps are gone** — `targetTilt`/
`targetRadius` no longer squeeze the authored pose into a fixed band; ι/α/γ map instead.

**Ray-march MEASURED FIRST (the flagged risk was unfounded — say so, don't quietly drop it):**
32-bin sightline rose costs **0.002–0.008ms**; raster DB read **0.13–0.20ms** (HHS 4 storeys /
Hospital 7 storeys, via `common/storey_raster.js`'s O(1) bitset). Against the ~100ms budget that is
four orders of magnitude of headroom — **no coarse-bin fallback needed, 32 bins is affordable.**

**But the measurement surfaced the REAL constraint, which is not performance:**
`storey_walkable_raster` ships only as a self-heal PATCH, and only for **3 of 11 buildings**
(HHS, Hospital, JKR) — **LTU_AHouse, the user's own test building, has none.** So κ₁/κ₂ were
DEFERRED rather than half-shipped. ι/α/γ and §CINEMA_ANCHOR need no raster and work everywhere.
Tiering for whoever picks κ₁/κ₂ up: Tier A raster → true rose; Tier B room graph → room-rect rose;
Tier C neither → bbox+sun only.

**§CINEMA_ANCHOR table is a RULE LIST, not a flat map** (user: "a matrix style adjustable list is
good design pattern where we can later introduce more verbs to it of many dimensions ie height,
proximity - ranges etc"). Each class → ordered rules, first `when` match wins; `when` today reads
`distLt` (proximity band) and `gammaGt`/`gammaLt` (height band). New dimensions go into `dims`,
new verbs go in as fields beside ellip/turn/swoop/spin — no restructuring.

**Witness `witness_cinema_reciprocal.js` (in bim-ootb), Duplex + HHS, 4 poses each, 11/11 PASS:**
| pose | ι | α | γ | carry | targetTilt | end r | end y | turn |
|---|---|---|---|---|---|---|---|---|
| Establishing | 0 | 5° | 3.04 | 1 | 5° | 44.8 | 13.4 | 0° |
| LobbyTurn | 0.848 | 0° | 0 | 0 | 8° | 101.7 | 7.1 | 153° |
| Bird | 0 | 55° | 30.6 | 1 | 55° | 44.8 | 70.4 | 0° |
| GroundWalk | 0 | 3° | 0.1 | 0.05 | 7.7° | 44.8 | 7.4 | 0° |

Bird's 55° carried exactly (old code clamped to 45°); Lobby ends 101.7m vs Establishing's 44.8m
(intimacy→distance); GroundWalk's low γ makes the band-ease act instead (3°→7.7°).

**⚠ LESSON — three of the witness's OWN first-draft assertions were wrong, not the code.** It
demanded (a) ι differ across all 3 poses — but ι=0 for any pose beyond fill distance is correct by
design; (b) endRadius differ across all 3 — derived from ι, so same; (c) that Establishing be
clamped INTO the 8° band — **that expectation was itself the normalization P1 forbids.** Corrected
by testing the carry-lerp identity plus a true ground-level pose. This is the
`feedback_verify_checker_before_code_under_test` pattern paying off a third time on this project:
verify the checker's ground truth before believing a red result.

**Still UNVERIFIED:** Λ=1.5, γ_carry=2, Δφ_turn=π are first-principles constants, not measured —
the 10s preview loop is what should settle them. And no real-GPU/visual confirmation yet: this is
plan-level numeric proof, not "the film looks right."
