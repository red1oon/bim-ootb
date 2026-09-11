# SPEC — GEOM_CUT_RESIZE (cut-move step 2): a held door's hole keeps its width — Witness: W-CUT-RESIZE / W-E2E-CUT-MOVE R*

```
# ⚠ DO NOT REMOVE
SCOPE: (1) a new signed op `GEOM_CUT_RESIZE {cutId, parent, fx, fy, fz}` — a multiplicative, per-axis resize of an
earlier GEOM_CUT's void ABOUT ITS OWN CENTRE, folded exactly like GEOM_CUT_MOVE (pre-scan + override at the cut's own
log position; the signed GEOM_CUT row is never rewritten); (2) cut_move.js grows from "net shifts" to "net overrides"
(shift + resize) with ONE signature function; (3) the grid ANCHOR path emits a resize rider g = 1/f alongside its
GEOM_CUT_MOVE rider so the hole's WORLD width is unchanged after the stretch — the residual step 1 only reported.
Out of scope: rotated-after-cut hosts (prompts/SPEC_CUT_FRAME_ROTATE.md, step 3); holes baked into extracted LOD-300
meshes (never); roof/AngleEdge (⛔ paused). Spec before code; read the log after every witness run.
```

Parent: `prompts/SPEC_GEOM_CUT_MOVE.md` (step 1, merged as #1711 → 8df2568d). Read it FIRST — §2 (contract), §3 (frame
math), §5 (witness shapes). This spec changes NOTHING about step 1's centre-hold; it adds width-hold on top.

## §1 The issue (measured, W-CUT-MOVE C3a and W-E2E-CUT-MOVE M5)
The fold's GRID SCALE maps every point of the host, hole included: x → f·x + min·(1−f) + t. Step 1's GEOM_CUT_MOVE rider
s = −Δ/(f·F) keeps the hole's CENTRE under the held door, but the hole's width still becomes f·F·w. On the e2e fixture
(wall 4 m → 5 m, hole 1.6 m) the hole ends 2.0 m wide under a 1.0 m door — reported as `1 hole held (Δw +0.40m)`.
A void resize in the cut's authored frame by g = 1/f cancels it exactly: f · (F · w · g) = F · w.

## §2 Contract
```
GEOM_CUT_RESIZE  parameters { cutId, parent, fx, fy, fz, induced? }
  cutId, parent = as GEOM_CUT_MOVE (the active GEOM_CUT row id; its host solid)
  fx, fy, fz    = per-axis factors (>0) applied to the void's half-extents ABOUT THE VOID'S OWN CENTRE, in the cut's
                  AUTHORED frame; absent field ⇒ 1. induced = 'anchor-hold' (grid) — the slide never emits one.
```
FOLD ORDER (one definition, `cut_move.js applyOverrides(void, ov)`): from the authored `{c1,c2}`:
  centre' = centre + Σshift · half' = half ⊙ Πfactor · c1' = centre' − half' · c2' = centre' + half'.
Because the resize is about the void's OWN centre and the shift moves that centre, shift and resize COMMUTE — the row
order in the log is irrelevant, exactly as GEOM_CUT_MOVE rows already sum in any order (witness this: R4).
Tolerance: a factor ≤ 0 or non-finite ⇒ that row is IGNORED (tolerant, like a cut-move naming a non-active cut) and
logged `§CUT-MOVE ignored GEOM_CUT_RESIZE #id: non-positive factor`. Never a throw, never a clamp.

## §3 Changes, file by file (anchors are 8df2568d line numbers)
`modeller/cut_move.js`
- ADD `netOverrides(ops) → { byCut: { [cutId]: { s:[dx,dy,dz], f:[fx,fy,fz] } }, sig }`. Same walk as `netShifts`
  (:64) — sums GEOM_CUT_MOVE into `s`, multiplies GEOM_CUT_RESIZE into `f` (start [1,1,1]); only active-cut ids count.
  `sig` = per cut `id:sx,sy,sz*fx,fy,fz` for every cut whose s≠0 OR f≠1, sorted by id, `;`-joined ('' when none).
  KEEP `netShifts(ops)` as a thin wrapper (`byCut[id] = ov.s` for entries whose shift ≠ 0, same `sig`) so step 1's
  witnesses and bonsai_ifc keep working unchanged until switched.
- ADD `applyOverrides(void, ov) → {c1,c2}` (§2 order; `ov` = one byCut entry or undefined ⇒ returns a copy).
- `cutsOver` (:84): use `netOverrides` + `applyOverrides` for the overlap box (a resized hole is still found).
- `anchorShift` (:138): return TWO more fields — `g = 1/f` (the resize factor for this axis) and `through:boolean`
  (true when the void OVERHANGS the host on this axis: vb lo < hb lo − TOL or vb hi > hb hi + TOL, TOL = 0.05).
  A through-axis (the bCut's thickness axis, void ±0.5 m beyond the wall) gets NO resize — shrinking a through-void by
  1/f could stop it cutting through; the fold scaling it is harmless. Keep `residual` as-is (it is what a caller that
  emits no resize still sees).
- `keySuffix` unchanged (`'|cm:' + sig`).
`modeller/bonsai_kernel_worker.js` (:411, :421)
- `const cutMoves = CutMove.netOverrides(ops)` and `const vd = ov ? CutMove.applyOverrides(P.void, ov) : P.void`.
- ADD branch `else if (op.op_type === 'GEOM_CUT_RESIZE') { continue; }` next to the GEOM_CUT_MOVE one (:426).
- Worker URL in `bonsai_kernel.js` `?v=8` → `?v=9` (append "v9: §CUT-RESIZE" to the version comment).
`modeller/bonsai_gridmove.js` `_cutRiders` (:313-340)
- For every SCALE command on the host: after `anchorShift`, if `!r.through` accumulate `g[k] *= r.g` and set
  `res = 0` for that axis (the width is now held); if `r.through` leave `g[k]` at 1 (and the residual as reported).
- Rider shape becomes `{ cutId, parent, dx,dy,dz, fx,fy,fz, fillingFid, residual }`. In `commit()` emit, per rider,
  the GEOM_CUT_MOVE row as today AND, when any factor ≠ 1, one GEOM_CUT_RESIZE row `{cutId, parent, fx,fy,fz,
  induced:'anchor-hold'}` — same gesture group (one Ctrl+Z). Log line: append ` resize=(fx,fy,fz)`.
- dimLabel: `N hole(s) held` with the `(Δw …)` suffix ONLY when a residual remains (through axes) — for the e2e fixture
  the label becomes exactly `… · 1 held · 1 hole held`.
`modeller/bonsai_itemdrag.js` — NO change (the slide never scales). `modeller/bonsai_ifc.js` (:81, :126) — switch to
`netOverrides`/`applyOverrides` (the exported IfcOpeningElement is the resized void). `modeller/modeller_history.js`
(:21, :30) — add `'GEOM_CUT_RESIZE': true` and label `'Cut resize #' + p.cutId`. `modeller.html` — bump cache
versions of every file touched (kernel v9, worker via kernel, gridmove, ifc, history; cut_move.js?v=2).
`modeller/tests/witness_gridmove_fold_pure.mjs` — no change (it already copies cut_move.js).

## §4 Tests — each names the issue it proves
Extend `modeller/tests/witness_cut_move.mjs` (keep C0-C6 byte-identical in intent; add):
- R1 NET-OVERRIDES — two GEOM_CUT_RESIZE rows fx=0.5 and fx=0.8 on cut #2 ⇒ f=[0.4,1,1]; a row with fx=0 is ignored;
  `sig` contains both s and f; `netShifts` wrapper still returns step 1's shape and the SAME `sig` when only shifts
  exist (proves: one signature, backwards-compatible keys).
- R2 FOLD-RESIZE — wall+cut + GEOM_CUT_RESIZE fx=0.5 ⇒ hole [1.6,2.4] (centre 2.0 kept, width 0.8) (proves: the worker
  resizes about the void's own centre).
- R3 WIDTH-HOLD — wall+cut + GRID SCALE f=1.25 + GEOM_CUT_MOVE s=−0.4 + GEOM_CUT_RESIZE fx=0.8 ⇒ hole centre 2.0 AND
  width 1.6 EXACTLY; `anchorShift` returns g=0.8, through=false on x and through=true on y (the ±0.5 thickness
  overhang) (proves: the residual is gone; through-axes are left alone).
- R4 COMMUTE — the R3 chain with the MOVE and RESIZE rows swapped in id order ⇒ byte-identical hole (proves: §2 order
  is well-defined regardless of log order).
- R5 CACHE — after R2/R3, folding the plain wall+cut chain (same op_hashes as C0) is a hit with the original hole;
  the R3 fold's signature differs from C3b's (proves: resize is in the key; no stale hits either way).
Extend `modeller/tests/witness_e2e_cut_move.js` M5/M6 (same fixture, same real gridline drag):
- M5 now asserts THREE rows in the gesture (GEOM_GRID_MOVE + GEOM_CUT_MOVE + GEOM_CUT_RESIZE{fx≈1/f, fy=fz=1}), hole
  centre unchanged ≤1e-3 AND hole width unchanged ≤1e-3 (1.6 m), door unchanged, dimLabel matches `/1 hole held(?! \()/`
  (no Δw suffix), verifyChain true. M6: one real Ctrl+Z reverts all three rows.
Guards to re-run and paste counts into §5: witness_opening_slide (10/10), witness_e2e_opening_slide (8/8; O0 stays
7/7 refusals), witness_e2e_gridstretch 7/7, witness_e2e_stretch_ride 11/11, witness_e2e_grid_greenorange 13/13,
witness_gridmove_fold_pure 12/12, witness_dagevu_engine 13/13. Known pre-existing: witness_e2e_cut C4/C6 fail on
untouched main (pixel-sum checks) — do not "fix" them here, note them.

## §5 Status
- [ ] cut_move.js netOverrides/applyOverrides/anchorShift.g,through · [ ] worker fold + v9 · [ ] gridmove resize rider
- [ ] ifc/history/html registration · [ ] W-CUT-MOVE R1-R5 · [ ] W-E2E-CUT-MOVE M5/M6 updated · [ ] guards pasted
