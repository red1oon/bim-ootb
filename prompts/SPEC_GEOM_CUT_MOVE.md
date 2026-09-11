# SPEC — GEOM_CUT_MOVE: a carved void follows its opening — Witness: W-CUT-MOVE / W-E2E-CUT-MOVE

```
# ⚠ DO NOT REMOVE
SCOPE (step 1 of the void-linking work, and ONLY step 1): (1) a new signed op `GEOM_CUT_MOVE {cutId, dx, dy, dz}`
registered through the kernel-op chain like every other GEOM op; (2) the worker fold shifts that GEOM_CUT's void box
BEFORE subtracting it (a pure fold override, like GEOM_MOVE on an insert — the signed GEOM_CUT row is never rewritten);
(3) the along-host slide (bonsai_itemdrag.js) emits it as a rider where bakedVoidFor currently REFUSES; (4) the grid
ANCHOR path (bonsai_gridmove.js via the DAGeVu engine) emits the inverse of the fold's proportional shift so a carved
hole stays centred on its HELD door. Out of scope: holes baked into extracted LOD-300 meshes (all 7 real SampleHouse
fillings keep refusing the slide — asserted in witness_e2e_opening_slide O0); a void RESIZE (the fold's SCALE also
widens the hole by f — reported, not corrected; step 2); roof/AngleEdge (⛔ paused). Read the log after every run.
```

Parents: `prompts/SPEC_DAGEVU_SLIDE.md` §3 (S5 "NOT BUILT — a void-translate op … refused instead"),
`prompts/SPEC_DAGEVU_ENGINE.md` §3 (anchor = the opening keeps its world position), `bonsai_kernel_worker.js`
buildSolids GEOM_CUT branch (the void is `kernel.makeBoxFromCorners(P.void.c1, P.void.c2)` subtracted from the parent's
CURRENT solid at the cut's log position), `bonsai_kernel.js` foldChainToScene (GEOM_MOVE on inserts = a net delta
summed from active rows, "a pure fold override like LOD"). Session 2026-09-11.

## §1 Why an op, not a rewrite
The signed chain is append-only: a GEOM_CUT row's `void` is hashed and can never be edited. Today the ONLY dependent
still unlinked from its opening is the carved void: the slide refuses any filling whose host carries a real GEOM_CUT
over it (S6), and a grid stretch with the door HELD (anchor default) lets the fold carry the hole away proportionally
(hole centre → f·c + min·(1−f) + t, the SCALE mapping) while the door stays — a silent mismatch on every sketched wall
with a bCut hole. Both need the same primitive: "this cut's void is now at void + s".

## §2 Contract
```
GEOM_CUT_MOVE  parameters { cutId, parent, dx, dy, dz, induced? }
  cutId   = kernel_ops id of an ACTIVE GEOM_CUT row            (the void being shifted)
  parent  = that cut's parent (the host solid)                 (so deleteFeature(host) soft-deletes it with the cut, and
                                                                redo's ancestor walk re-activates host → this row)
  dx,dy,dz = the shift, in the cut's AUTHORED frame (see §3)   induced = 'fills-opening' (slide) | 'anchor-hold' (grid)
```
- FOLD (worker `buildSolids`): pre-scan the ops of THIS fold → `netShift[cutId] = Σ(dx,dy,dz)` over active
  GEOM_CUT_MOVE rows. At the GEOM_CUT's own position the void box is `{c1 + s, c2 + s}`; the cut is subtracted exactly
  as before. The GEOM_CUT_MOVE row itself is a no-op at its own position. A row whose cutId is not an active GEOM_CUT in
  this fold is IGNORED (tolerant, like GEOM_MOVE on a missing parent) — never a throw, never a guess.
- CACHE: op_hash keys assume "output = f(prefix)". A cut-move is retroactive (it changes an EARLIER op's output), so
  when any net shift is non-zero in a fold, EVERY shape/mesh key in that fold carries the fold's cut-move signature
  (`|cm:<cutId>:<dx>,<dy>,<dz>;…`, sorted by cutId). Zero cut-moves ⇒ keys byte-identical to today. One rebuild per
  distinct shift set; scrub/undo back to a prefix without the move hits the original keys.
- KERNEL host side: `_geomOps()` already returns every `GEOM%` row; GEOM_CUT_MOVE is NOT LEAF (authoritative re-fold);
  not PARENT_MUTATING for seeding (its cut already promotes the host). `modeller_history.js` OP_TYPES gets the type.
- IFC export (`bonsai_ifc.js`): the IfcOpeningElement is built from the SAME net-shifted void (one definition).

## §3 Frame math — one definition, shared (`modeller/cut_move.js`, dual-export window+node+worker)
The void is authored in world coordinates at the cut's log position. Ops AFTER the cut that transform the host map it:
TRANSLATE (GEOM_MOVE / GRID TRANSLATE / ROOM_MOVE) shifts; GRID SCALE maps x → f·x + min·(1−f) + t; GEOM_ROTATE spins
about the bbox centre. Per axis, the void's OFFSET from the host's min `u = x − min` obeys u' = f·u under SCALE and is
invariant under TRANSLATE. Hence with `F = Π f_i` over post-cut SCALE commands on that axis:
- `frameScale(ops, cutOp, axis) → { f:F, ok, reason }` — ok:false when a post-cut GEOM_ROTATE (any angle) or an
  obliquely-yawed SCALE (worker's §SCALE-YAW-GUARD path) touches the host: the authored axis is no longer a world axis
  ⇒ the consumer REFUSES (never approximates).
- SLIDE: a door slid by world `t` on the axis needs the hole moved by `t` in world ⇒ authored shift `s = t / F`.
- ANCHOR: the new SCALE `(f, t)` would move the hole's current world centre `q` by `Δ = (q − min)(f − 1) + t`
  (the fold's own proportional shift). Holding it: `s = −Δ / (f · F)`. `q − min = F · u_cut` where
  `u_cut = (authored void centre + net existing shifts) − (min_now − T_post)` and `T_post` = Σ post-cut host
  translations (GEOM_MOVE d, GRID TRANSLATE delta, GRID SCALE translateDelta, ROOM_MOVE d) on that axis — every term
  read from the log + the host's measured pre-drag AABB. Width residual `|f − 1| · w` is REPORTED (log + dimLabel).
- TRANSLATE commands in the same gesture carry the hole and the held door alike ⇒ no correction. RIDE mode ⇒ door and
  hole take the same proportional mapping ⇒ no rider.

## §4 Consumers
- `bonsai_itemdrag.js` beginSlideSession: `bakedVoidFor` no longer refuses — the session records `slide.cutId` (+
  frame F per axis from `frameScale`, refusing on ok:false with the reason). `resolveDrop` adds ONE rider
  `GEOM_CUT_MOVE {cutId, parent:host, d/F on the slide axis, induced:'fills-opening'}` to the existing gesture group.
- `bonsai_gridmove.js` previewCommands: for every HELD filling whose host has a SCALE command in the post-override
  command list, every active GEOM_CUT (parent = host) whose void overlaps the filling's pre-drag AABB gets one
  `GEOM_CUT_MOVE {…, induced:'anchor-hold'}` rider (`cutRiders`); commit() appends them to the gesture group.
  frameScale ok:false ⇒ a refusal `{kind:'cut-move-unmappable'}` that blocks commit exactly like anchor-no-free-end.
  dimLabel gains ` · N hole(s) held (Δw +0.23m)`.

## §5 Tests — each names the issue it proves
`witness_cut_move.mjs` (node, drives the REAL worker fold like witness_gridmove_fold_pure.mjs):
- C1 NET-SHIFT — two cut-moves on one cut sum; a cut-move naming a non-active cut is ignored; no cut-moves ⇒ empty
  signature (proves: the fold override is additive and tolerant; keys unchanged when unused).
- C2 FOLD-SHIFT — box [0,4]×[0,0.2]×[0,3] with a through-void at x∈[1.2,2.8]; adding GEOM_CUT_MOVE dx=0.8 moves the
  hole's measured vertex extent to [2.0,3.6], width unchanged (proves: the worker shifts the void before subtracting).
- C3 FOLD-SCALE-INVERSE — the same wall + a GRID SCALE f=1.25 (min fixed): without a rider the hole centre goes
  2.0→2.5; with the anchor rider s=−0.4 it stays at 2.0, width 1.6→2.0 (proves: the inverse shift holds the centre
  under the fold's own mapping; the width residual is real and reported).
- C4 CACHE — folding chain A (no move) then A+move then A again yields the original hole (proves: no stale hit).
- C5 FRAME — frameScale: post-cut SCALE ⇒ F; pre-cut SCALE ignored; post-cut ROTATE ⇒ ok:false; slideShift(0.8,F=1.25)
  = 0.64; anchorShift with translateDelta≠0 and with F≠1 verified against the composed mapping.
`witness_e2e_cut_move.js` (e2e, sketched wall + the REAL bCut button + a sketched door in the hole):
- M1 GRAB — the door grabs into a SLIDE session carrying cutId (the S6 refusal is gone for a movable void).
- M2 COMMIT — a real +0.8 m mouse drag commits ONE gesture: GEOM_MOVE + GEOM_CUT_MOVE {cutId, dx≈0.8, dy=dz=0}.
- M3 HOLE-FOLLOWS — the wall mesh's hole extent moved by the same dx (vertex-measured); door and hole centres coincide.
- M4 UNDO — one undo restores hole and door.
- M5 ANCHOR — grid-stretch B(4)→5 with the door held: gesture = GEOM_GRID_MOVE + GEOM_CUT_MOVE; door centre unchanged,
  hole centre unchanged (≤1e-3), hole width = 1.25× (reported residual), verifyChain true; undo restores.
Regression guard: witness_opening_slide (S6 becomes "session carries cutId"), witness_e2e_opening_slide 8/8,
witness_dagevu_engine, witness_gridmove_fold_pure, witness_e2e_gridstretch, witness_e2e_stretch_ride, witness_e2e_cut.

## §6 Status (2026-09-11)
- [x] `modeller/cut_move.js` (triple-export; the worker imports it, main thread + node share it) · [x] worker fold (pre-scan +
  cache-key signature; worker URL v8) · [x] registration: modeller_history OP_TYPES/label, bonsai_ifc net-shifted void,
  modeller.html script tag + cache bumps · [x] slide rider (bonsai_itemdrag S5; S6 refusal replaced) · [x] anchor rider
  (bonsai_gridmove `_cutRiders` → GEOM_CUT_MOVE induced:'anchor-hold'; dimLabel "N hole(s) held (Δw ±x.xxm)")
- [x] witness_cut_move.mjs 11/11 (REAL worker fold: C2 hole [1.2,2.8]→[2.0,3.6]; C3 centre held at 2.0 under f=1.25, min-edge
  translateDelta, and a prior F=1.25; C4 cache no stale hit; C6 slide after a stretch rides 0.64 authored = 0.8 world)
- [x] witness_e2e_cut_move.js 8/8 (real bCut + real mouse slide: GEOM_MOVE + GEOM_CUT_MOVE one gesture, hole follows 0.8 m;
  real Ctrl+Z; real gridline drag with the door held: cut rider dx=−0.40, hole centre unchanged, width 1.6→2.0 reported)
- [x] guards: witness_opening_slide 10/10 (S6 rewritten: carved void now RIDES; S6b rotate-after-cut refuses) ·
  witness_e2e_opening_slide 8/8 (O0 still 7/7 real SampleHouse refusals — baked meshes) · witness_e2e_gridstretch 7/7 ·
  witness_e2e_stretch_ride 11/11 · witness_e2e_grid_greenorange 13/13 · witness_gridmove_fold_pure 12/12 (harness copies
  cut_move.js) · witness_dagevu_engine 13/13 · witness_stretch_ride 9/9 · witness_item_drag_gate 9/9 · sdg_cascade 7/7 · sdg_gate 11/11
- witness_e2e_cut C4/C6 (framebuffer pixel-sum checks on a real Duplex element) FAIL IDENTICALLY on untouched origin/main
  20e4fd28 (pix 9970636→9970636 both trees) — pre-existing, not this change; C1-C3/C5 (commit, chain, undo) pass in both.
- Known residual (spec preamble): a held door's hole is (f−1)·F·w wider after a stretch — REPORTED in the log/dimLabel, not
  corrected. Step 2 = a void resize op. Not started.
- STEP 2 candidates (not built): void resize; a 90°-multiple GEOM_ROTATE frame mapping (today: refuse); baked LOD-300 holes (never).
