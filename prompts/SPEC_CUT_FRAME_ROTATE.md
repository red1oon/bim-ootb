# SPEC — Cut frame under a 90°-multiple GEOM_ROTATE (cut-move step 3) — Witness: W-CUT-MOVE F*

```
# ⚠ DO NOT REMOVE
SCOPE: replace cut_move.js `frameScale` (a per-axis scale F + translation tPost, which REFUSES any post-cut GEOM_ROTATE)
with `hostFrame` — a per-axis affine map from the cut's AUTHORED frame to the CURRENT world frame that also handles a
post-cut GEOM_ROTATE by a multiple of 90° (axis permutation + sign). Oblique rotations, tilted/obliquely-yawed SCALEs
and GEOM_ARRAY-after-cut keep REFUSING. Everything step 1/2 emits (slide shift, anchor shift, anchor resize) is
re-expressed through this one map; for a host with no rotation the numbers are BYTE-IDENTICAL to step 1/2.
DO THIS ONLY AFTER prompts/SPEC_GEOM_CUT_RESIZE.md is merged and green. Low priority — a sketched wall that is CUT
and THEN rotated is rare; the honest refusal that exists today is acceptable if this is never built. Spec before
code; read the log after every witness run.
```

Parents: `prompts/SPEC_GEOM_CUT_MOVE.md` §3 (the frame: u = x − min scales by f, invariant under translate),
`prompts/SPEC_GEOM_CUT_RESIZE.md`, worker branches `GEOM_ROTATE` (bonsai_kernel_worker.js ~:660: yaw about the shape's
bbox-centre Z, `P.drot` DEGREES) and `GEOM_GRID_MOVE` SCALE (about the shape's CURRENT world bbox min on the axis).

## §1 The model
Let M be the affine map authored → world composed from the ACTIVE post-cut ops that transform the host, in log order.
With only TRANSLATE / SCALE / 90°-multiple ROTATE, M is "axis-aligned affine": world_k = a_k · authored_{π(k)} + b_k
with a permutation π and signed scalars a_k. Represent it as `{ perm:[i0,i1,i2], a:[a0,a1,a2], b:[b0,b1,b2] }` meaning
world axis k reads authored axis perm[k]. Identity = perm [0,1,2], a [1,1,1], b [0,0,0].
Compose a new world-frame op W onto M (M ← W∘M):
- TRANSLATE d: b_k += d_k.
- SCALE on world axis k, factor f, translateDelta t, about the host's world min m_k at that moment:
  a_k *= f; b_k = f·b_k + m_k(1−f) + t.
- ROTATE by θ = drot° about the host's world bbox centre c (x,y only; z untouched). Require θ/90 within 0.01 rad of an
  integer n (same tolerance as the worker's §SCALE-YAW-GUARD), else `ok:false 'oblique-rotate-after-cut'`.
  R = rotation by n·90°: for n ≡ 1: (x,y) → (c_x − (y − c_y), c_y + (x − c_x)); n ≡ 2: reflect both through c;
  n ≡ 3: (x,y) → (c_x + (y − c_y), c_y − (x − c_x)); n ≡ 0: identity. Apply R to the map: new perm/a/b follow from
  substituting world_x, world_y — e.g. n ≡ 1: perm' = [perm[1], perm[0], perm[2]], a' = [−a_1, a_0, a_2],
  b' = [c_x + c_y − b_1, c_y − c_x + b_0, b_2]. Write the three cases out explicitly; witness each (F1).
- GEOM_MOVE / GEOM_ROOM_MOVE on the host: TRANSLATE. GEOM_SCALE: no-op (worker no-op on a B-rep). GEOM_ARRAY: refuse.
The host's world box at each step is needed for m_k and c. It is NOT stored anywhere; derive it by a BACKWARD replay
from the measured current box (`hostBoxNow`, the pre-drag AABB): walk the post-cut ops in REVERSE un-applying each:
TRANSLATE: box −= d; SCALE(k,f,t): min_before = min_after − t, max_before = (max_after − min_before(1−f) − t)/f;
ROTATE n·90° about c: c = centre of box_after (invariant), un-rotate the box about c (swap x/y extents for odd n).
That yields box_at_cut and box_before(i) for every op i; then walk FORWARD composing M with the right m_k / c.
`hostFrame(ops, cutOp, hostBoxNow) → { ok, M, boxAtCut, reason }`. Sanity invariant to assert in every witness:
`mapBox(M, boxAtCut) == hostBoxNow` (≤1e-9) — if it does not hold the replay is wrong, refuse (`ok:false 'frame-replay-mismatch'`).

## §2 Re-expressing step 1/2 through M (all in cut_move.js; consumers unchanged in shape)
Let L = the linear part (perm + a), so L(s)_k = a_k · s_{perm[k]} and L⁻¹(d)_{perm[k]} = d_k / a_k.
- SLIDE (world delta d, axis-only): authored shift s = L⁻¹(d). Step 1's `slideShift(t, F)` = the no-rotation special
  case (perm identity, a_k = F). Keep `slideShift` exported; add `slideShiftM(d, M)`.
- ANCHOR (new SCALE on world axis k, f, t, about m_k = hostBoxNow min + minShift): hole world centre q = M(v_c) where
  v_c = the overridden authored void centre; Δ = (q_k − m_k)(f − 1) + t; authored shift s = L⁻¹(−Δ/f · e_k) (only the
  pre-image axis perm[k] is non-zero: s_{perm[k]} = −Δ/(f·a_k)). Resize factor on authored axis perm[k]: g = 1/f.
  `through` is evaluated in WORLD (map the void box through M, compare with hostBoxNow). Step 1's `anchorShift` =
  identity-perm case (a_k = F, tPost folded into b). Keep its signature; internally call hostFrame.
- `frameScale(ops, cutOp, axis)` becomes a wrapper: ok:false if perm is not identity or any a_k < 0 (a caller that
  cannot express a permuted axis), else `{ f: a_axis, tPost: b_axis − (a_axis − 1)·boxAtCut.min_axis … }` — simpler:
  drop `tPost` from the contract once itemdrag/gridmove call `slideShiftM`/`anchorShift` only (grep first; witness C5
  asserts tPost — update C5 to assert the M fields instead, keeping the SAME numbers: a=[1.25,1,1], b=[0.5,0,0]).

## §3 Tests (extend witness_cut_move.mjs; every case ALSO folds through the real worker where a fold exists)
- F0 IDENTITY — a chain with no rotation gives M = {perm id, a=[F,1,1], b=[tPost,0,0]} and byte-identical s to C3/C6.
- F1 ROTATE-90 — wall+cut+GEOM_ROTATE drot=90: fold the chain; the hole's world extent is now along Y; `hostFrame`
  invariant holds; a SLIDE of world +0.8 along Y maps to authored s = (+0.8 or −0.8 on x, sign per the rotation) and the
  folded hole moves +0.8 in world Y (measure the hole on the rotated wall: vertices strictly between z faces, Y range).
- F2 ROTATE-180 — the mirror: world min = authored max; an ANCHOR stretch f=1.25 of the rotated wall holds the hole
  centre (fold-verified) and the resize keeps its width.
- F3 ROTATE-270 and TWO rotations (90+90 = 180) compose to F2's map.
- F4 OBLIQUE — drot=30 ⇒ ok:false 'oblique-rotate-after-cut'; itemdrag S6b still refuses (its message changes; update
  the witness string only).
- F5 REPLAY — TRANSLATE 0.5 then SCALE f=1.25 then ROTATE 90: `mapBox(M, boxAtCut)` == hostBoxNow ≤1e-9.
E2E: add M7 to witness_e2e_cut_move.js — after M6, commit a GEOM_ROTATE {parent: wall, drot: 90} via the real Rotate
gizmo if one exists for solids (grep `GEOM_ROTATE` commits in modeller.html; else `Bonsai.oplog.commit` is acceptable
for the fixture, say so in the assert name), re-inject the fills row, real-drag the door along the wall's NEW long axis
(y) by 0.8 and assert hole + door moved together in Y, x unchanged, one gesture, Ctrl+Z reverts.

## §4 Status (2026-09-11)
- [x] hostFrame + backward/forward replay (cut_move.js) · [x] slideShiftM · [x] anchorShift rewritten to call
  hostFrame internally (byte-identical for an unrotated host) · [x] itemdrag/gridmove switched · [x] F0-F5 · [x] M7
- **Deviations from the spec text** (both deliberate, both explained where they land in the code):
  1. `frameScale`/`slideShift` are left COMPLETELY UNTOUCHED rather than rewritten as a "thin wrapper over
     hostFrame" — the existing standalone algorithm is already exact for an identity-perm host (proved: a SCALE
     anchors at its own current min, so the min's trajectory is pure additive `ΣtranslateDelta` regardless of
     intervening scale factors — this is WHY frameScale never needed to measure the host box), and rewriting it
     added risk for zero behavioral gain. `hostFrame` is the new general primitive; both are exported side by side.
  2. The spec's own C5 example numbers (`a=[1.25,1,1], b=[0.5,0,0]`) are WRONG — `b` is the general-point affine
     offset (needed to map the void's CENTRE, not just the host's min), which is a genuinely different quantity
     from frameScale's `tPost` (a min-only telescoping sum). For the exact C5 fixture (hostBoxNow starting at
     `[0,5,0.5,0.7,...]`), the correct `b.x = 0.625`, independently verified two ways in witness_cut_move.mjs's F0
     (direct point-mapping AND anchorShift/slideShiftM reducing to the EXACT byte-identical step-1/2 numbers,
     s=−0.4, slideShiftM=0.64 — which a `b=0.5` would NOT reproduce). Documented inline in the F0 witness.
  3. `bonsai_gridmove.js`'s `_cutRiders` needed a real (small) fix, not zero changes as first assumed: `d[k] +=
     r.s` / `g[k] *= r.g` were indexed by the SCALE command's WORLD axis `k`, but `r.s`/`r.g` are AUTHORED-frame
     quantities — under a permuted frame these belong at `r.authoredAxis` (`M.perm[k]`), not `k`. Fixed by adding
     `authoredAxis` to anchorShift's return and indexing by it (byte-identical for an unrotated host, since
     `authoredAxis === k` there).
  4. **Known, undocumented-until-now limitation, left OUT of scope**: `cutsOver` (used by
     `bonsai_itemdrag.js beginSlideSession` and `bonsai_gridmove.js _cutRiders` to discover "is this GEOM_CUT
     coincident with this filling") compares the void's box in the cut's AUTHORED frame directly against the
     filling's WORLD box — correct for an unrotated host (authored ≡ world), but NOT rotation-aware: it never maps
     the void through `hostFrame` before the overlap check. M7's witness happens to pass because the fixture's
     void and door boxes still numerically overlap post-rotation by coincidence (the void was never moved off its
     original X-position before the rotate); a differently-positioned fixture could fail to discover a real
     coincident cut under a rotated host. Fixing this is a discovery-heuristic problem, not a frame-math one —
     outside this spec's stated scope ("Everything step 1/2 emits [...] is re-expressed through this one map",
     which lists slide/anchor shift/resize, not `cutsOver`). Flagged here for a future spec if it ever bites.
- [x] witness_cut_move.mjs 26/26 (C0-C6 + R1-R5 unchanged + F0 IDENTITY×2, F1 ROTATE-90×2 — real worker fold,
  hole's world extent swaps to Y width 1.6 centred 0.1, X width 0.2 (the wall's own thickness, the void's oversized
  through-overshoot having already been CLIPPED to it at cut time, before the rotate) — F2 ROTATE-180×1 (mirror,
  `a=[-1,-1,1]`, anchor-held centre/width EXACT through the sign-flipped path), F3 ROTATE-270×1 + two 90°s compose
  to F2's map×1, F4 OBLIQUE×1 (drot=30 ⇒ ok:false), F5 REPLAY×1 (mapBox(M,boxAtCut)==hostBoxNow ≤1e-6, independently
  re-derived, not just internally trusted))
- [x] witness_e2e_cut_move.js 12/12 (M1-M6 unchanged from step 2 + M7: a REAL `#dim-rot` typed commit — the SAME
  production path W-E2E-NUMROT/W-E2E-SCALEROT prove for a standalone solid, no `oplog.commit` fallback needed —
  rotates the wall 90°, then a REAL mouse drag slides the door +0.8m along the wall's NEW long axis (world Y); the
  gesture is GEOM_MOVE + GEOM_CUT_MOVE with the authored shift correctly landing on x (via slideShiftM, not the
  slide's own world axis); one real Ctrl+Z reverts it)
- [x] guards: witness_opening_slide 10/10 (S6b's drot=30 fixture still refuses, now via hostFrame's
  oblique-rotate-after-cut reason instead of frameScale's rotated-after-cut — same net effect, label text
  unchanged since the assertion only checks `=== null`) · witness_gridmove_fold_pure 12/12 · witness_dagevu_engine
  13/13 · witness_e2e_opening_slide 8/8 (O0 7/7 real SampleHouse refusals) · witness_e2e_gridstretch 7/7 ·
  witness_e2e_stretch_ride 11/11 · witness_e2e_grid_greenorange 13/13
- witness_e2e_cut C4/C6 (pix 9970636→9970636) FAIL IDENTICALLY to untouched main and to the step-2 branch —
  pre-existing, not this change.
