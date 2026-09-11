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

## §4 Status
- [ ] hostFrame + backward replay · [ ] slideShiftM / anchorShift via M · [ ] itemdrag/gridmove switched · [ ] F0-F5 · [ ] M7
