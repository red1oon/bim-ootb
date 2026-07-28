
### ⚠ AMENDMENT 2 to §CPE_PACE_LOS (user, 2026-07-27) — the total field stays the global speed knob
> *"remember there is also the overall speed control ie the total time of movie length in the panel
> can be set to a faster when reduced, or otherwise"*

Already built (`_state.userTotal`, `§CPE_TOTAL`, uniform `scale` in `_buildOverride`) and it must
survive the pacing work intact. **The interaction is the trap:** `tour.js`'s `_paceBuildRemap` does
TWO things — it redistributes time along the path AND rescales the action's own total via
`meanFactor`. The second one would silently fight an explicitly-keyed total: the user types 40s, the
remap decides the path is open and hands back 31s. So:
- **User has keyed a total → the brake REDISTRIBUTES within it only. `meanFactor` rescaling is OFF.**
  Their number is the film's length, full stop.
- **User has not keyed one → the derived total stands, and `meanFactor` may inform it** (that is the
  §CPE_PACING "length is a consequence of the building" model, which the user already ratified).
**Gate:** with a keyed total of T, the baked film's duration is T ± one frame, no matter how busy or
open the path is — while the WITHIN-film speed still varies. Both halves in one gate, or the brake
can quietly eat the user's setting and still look right.

## §CPE_HOSE_BUILT — implemented and witnessed 2026-07-28 (`bim-ootb` PR #1074, `feat/cpe-hose`)
**23/23 green on Duplex + Hospital_3 (63,415 ops)** — `witness_cpe_hose.js`, `PORT=8421 node witness_cpe_hose.js`.
Built exactly as §CPE_HOSE / §CPE_AIM_DENSITY / §CPE_PREVIEW_BUTTON specify, with ONE stated
deviation (below) and three measured corrections that are now doctrine.

| gate | claim | measured |
|---|---|---|
| W-HOSE-ARC | falloff is arc-length, not world distance | out-and-back twin 0.5 m away in SPACE, half a film away in ARC — moved **0.00e+0 m**; grab point moved 12.000 m of the 12 asked |
| W-HOSE-REACH | reach governs reach | r=0.10 → span 0.195; r=0.30 → span 0.595; r=0.02 → 0.035 (the point-edit end of the continuum) |
| W-HOSE-PLAN | ops reach the FLOWN path | Duplex pathLen 15.3 → 132.5 m; Hospital_3 68.2 → 780.6 m |
| A1 §CPE_AIM_DENSITY | gaze turns toward the mass | angle to centroid 72.4° → 40.0° (Duplex), 75.1° → 61.7° (Hospital_3) |
| A2 §CPE_AIM_DENSITY | no jerk bought with it | peak gaze change **15.8°/f vs 15.8°/f** (Duplex), **43.5 vs 43.5** (Hospital_3) — zero added |
| B1 W-BUILDUP-SAMPLE | mode D opens a clip part-built | placed 0 → 59,161 (mid) → 63,415, monotone (Hospital_3) |
| B2 | mode D is reversible | `tmRestoreDerivedOrder` restores projectStart/End exactly |

### ⚖ THE THREE CAUSES OF THE AIM JERK — measured, and two of my hypotheses were WRONG
Recorded because the next session's first guess will be the same as mine was.
| # | hypothesis | peak deg/frame | verdict |
|---|---|---|---|
| 1 | the argmax subject cell flips frame to frame | 78.5 | smoothing it made it **WORSE** (95.2) — not the cause |
| 2 | the perpendicular projection reverses as the subject crosses the travel axis | 95.2 | real (fixed by fading the projection with `k`), but not the peak |
| 3 | **the rule still held the gaze at the walk→orbit seam** (probe: peak at t=0.8706 against `beats.out=0.8700`) **and aimed against the INSTANTANEOUS tangent**, inheriting the path's own corner rate | 88.4 → 24 → **15.8** | ✅ this was it |
**Settled, do not re-derive:** (a) taper the rule to zero over `CINEMA_TURN_OVERLAP` so Beat 4 picks
up the gaze it was designed to pick up; (b) the travel direction is the local TREND (finite difference
over ~3% of the walk), not the instantaneous tangent — "perpendicular to travel" means to where the
camera is generally heading; (c) the weight and the subject are FIELDS along the path, probed at 65
samples and 2×5-tap binomial smoothed (the §CPE_NOISE_LAW idiom), which also makes the per-pose cost a
lerp instead of a density scan.

### ⚠ DEVIATION FROM §CPE_HOSE.1, stated not buried
The spec argued the hose and the band should be ONE gesture at two falloff radii, and warned against
shipping two affordances. **Shipped: both.** Band handles stay the precise/tangent control — they carry
the length and direction semantics §CPE_BANDS rules 2 and 6 structurally depend on — and the pipe drag
is the hose. The continuum is real and witnessed (reach 2% → 0.035 span, effectively a point edit), but
removing the handles would redesign settled, witnessed behaviour and was out of scope for this PR.
**If the user wants the full unification, that is a deliberate follow-up, not a bug fix.**

### Still open from §CPE_HOSE's own question list (unchanged, still needs the user)
1. falloff shape — shipped as `(1-u²)²`; one line to change.
2. reach is a PERSISTENT editor setting (resolved by the "simplest fastest" guardrail), 15% seed.
3. marker anchoring across a path edit — markers are film-fraction `t`, so a big drag moves what they
   point at. Not yet decided.
4. ARC-only for §CPE_BUILDUP — shipped WITHOUT the filter; the witness reports the ARC count
   (10,941/63,415 on Hospital_3) so the question can be answered from data rather than taste.
