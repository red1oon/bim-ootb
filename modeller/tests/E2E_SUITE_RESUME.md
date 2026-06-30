# RESUME — Modeller real-user E2E suite + world-class ModellerUserGuide (continue fresh session)

```
# ⚠ DO NOT REMOVE
SCOPE: build a FULL real-user, maths-asserted, atomic E2E for EVERY authoring tool, and populate a world-class
ModellerUserGuide whose screenshots are CAPTURED FROM THE REAL APP during the E2E runs (NON-INVENT — never fabricate
a screenshot). Standard (user, 2026-07-01): a test must emulate a real USER SERIES OF ACTIONS through the PRODUCTION
path and confirm each function works COMPLETELY, PERFECTLY, ATOMICALLY — by MATHS (op-log + scene-graph + readPixels),
never by eye, never via an engine seam. A tool counts as "developed" ONLY with a green real-user E2E.
Branch: lane/modeller-e2e-suite (WIP, NOT merged — two other lane sessions active; rebase off fresh origin/main).
```

## DONE (merged to main, bim-ootb #584, sw v25)
- **W-E2E-MOVE 9/9** (`witness_e2e_move.js`) — open→pick→drag X gizmo→commit→undo; atomic to 2.4e-8m, X-only, reversible.
- **W-E2E-WALK 8/8** (`witness_e2e_walk.js`) — open→discWalk ELEC→render+commit→undo; 2.5s, 267 fixtures.
  (Found+fixed two real Walk bugs: IDB borrow hang + 112s commit freeze. See PR #584.)

## THE HARNESS (this branch) — `modeller/tests/e2e_harness.js`  ✅ validated
`runE2E(NAME, async t => {...})`. ctx `t`: `open(key)`, `proj/centre/pixsum`, `pick()`, `clickSel(sel)`,
`drag(downPx,upPx,steps)` (real pg.mouse), `oplog()`, `lastOp()`, `census(predFn)`, `verifyChain()`,
`undoToCursor(c)` (real #hist-slider), `shot(label)` (→ `modeller/tests/e2e_shots/<NAME>-<label>.png`),
`assert(name,cond,detail)`, `sleep`. Auto: server, swiftshader launch, §-console + pageerror capture, NO-ERROR assert,
exit code. The disc-walk meshes live under the `dwRoot` SUB-group (census walks g.children + dwRoot.children).

## ✅ CUT DONE — `witness_e2e_cut.js` 7/7 (the suite caught a 3rd genuine tool defect, like the Walk hang)
- ✅ C1 select · ✅ C2 GEOM_CUT commits (len+1, parent==fid) · ✅ C3 verifyChain · ✅ C4 VISIBLE (pix flips) ·
  ✅ C5 REVERSIBLE (cursor 254→253) · ✅ C6 GEOMETRY-REVERSIBLE (undo returns the frame EXACTLY: pix0==postUndo).
- **ROOT CAUSE (deeper than the resume's "undo bug" guess):** a seeded ARC wall is a BAKED `GEOM_INSERT` mesh, not a
  worker B-rep, so the occt fold of `GEOM_CUT` threw `parent not found`. The op committed to the signed log (C2/C3
  green) but never RENDERED (C4) and the failed fold skipped `syncHistory()`, leaving the slider dead at max=0 →
  undo collapsed to 0 (C5). The undo→0 was a downstream SYMPTOM, not the bug.
- **FIX (non-invent):** a box-like insert that is a `GEOM_CUT`/`GEOM_FILLET` target is PROMOTED to a worker B-rep box
  built from its EXACT measured world-AABB corners (`bonsai_kernel._insertCutBox` → `_foldChain` `seedBoxes` →
  worker `buildSolids` pre-seed). The box == the baked mesh vertex-for-vertex (ARC walls are 8-vert axis-aligned
  boxes, verified). Rotated/non-box inserts return null → the cut handler REFUSES up front (honest, logged) — a
  measured future-work boundary, never an invented shape. Worker cache bumped v5→v6.

## ROSTER — build a real-user E2E for each (then mark "developed")
Toolbar (id=b-*) + op types are the ground truth (grep modeller.html). Authoring tools:
1. ✅ MOVE (GEOM_MOVE)   2. ✅ WALK (discWalk)   3. ✅ CUT (GEOM_CUT — 7/7, §CUT-ON-ARC fix)
4. ✅ INSERT (`witness_e2e_insert.js` 7/7) — Insert pill → catalog `.ins-c` leaf → ground click → GEOM_INSERT;
   ATOMIC by scene census (mesh featureId==op id), VISIBLE, REVERSIBLE (cursor + mesh gone). NOTE census evals the
   predicate SOURCE in-page → bake literals in (no node closure): `new Function('o','return o.featureId==='+id)`.
5. ✅ SCALE (`witness_e2e_scale.js` 7/7) — select → Move pill → drag +X scale CUBE → GEOM_SCALE fx; ATOMIC by the
   measured X-extent ratio == fx. ⚠ caught + fixed a 4th real defect: `foldInsert` scale branch did `base.bbox ||
   c.bbox` with c==null for a RAW-bbox ARC insert → threw → the wall VANISHED. Guarded `(c ? c.bbox : rawBox)` like
   the rotate branch (bonsai_library.js). EVERY ARC wall is a raw-bbox insert, so scale-vanish hit all of them.
6. ✅ ROTATE (`witness_e2e_rotate.js` 7/7) — select → Move pill → drag yaw RING 30° → GEOM_ROTATE drot; ATOMIC by
   the rendered footprint AABB (X-extent == ex·cosθ + ey·sinθ), REVERSIBLE. Single insert = exactly +1 op.
7. ✅ SKETCH→EXTRUDE (`witness_e2e_sketch.js` 8/8) — Sketch pill → 4 ground clicks → depth → Extrude pill →
   GEOM_EXTRUDE_POLY (real occt B-rep). ⚠ caught + fixed a 5th real defect (UX-breaking): the L-rail `layoutRail()`
   positions only currently-VISIBLE pills + runs at startup/resize/toggle, NOT on reveal — so a mode-revealed pill
   (Extrude, Run, Apply-fillet, dim-* inputs) stranded at its default position:fixed origin (0,0), top-left under
   the panel, UNCLICKABLE for real users too. Fix: a MutationObserver on #bar button `style` re-runs layoutRail on
   any display toggle (disconnect around our own writes → no loop). modeller.html. ⚠ bump sw CACHE_VERSION on deploy.
8. ✅ ROUTE→RUN (`witness_e2e_route.js` 8/8) — Route pill → ≥2 ground clicks (a spine) → profile → Sweep-Run pill →
   GEOM_SWEEP (occt pipe B-rep). ATOMIC by census, VISIBLE, REVERSIBLE. Confirms the rail fix unblocks the Run pill.
9. ✅ FILLET (`witness_e2e_fillet.js` 8/8) — Clear → Sketch→Extrude a lone wall → select → Fillet pill (reads 12
   edges, renders markers) → click an edge marker → radius → Apply pill → GEOM_FILLET. ATOMIC by the wall's
   triangle count (12→40, the round adds geometry), REVERSIBLE (→12). Needs a B-rep SOLID (ARC inserts have no
   worker edges) so it authors one first; clearing to an empty model makes select + edge-pick unambiguous.
10. ✅ OPENING — RESOLVED by extraction: GEOM_OPENING has NO user-facing trigger. It is a legacy SAMPLE PRIMITIVE
    (`const OPENING` line ~369; comment "real authoring is Sketch + Insert; WALL/OPENING are the sample primitives
    the witness folds directly") folded via the dev `author()` path behind a `?q=opening` param. The real-user
    "make an opening in a wall" IS the CUT tool (GEOM_CUT) → covered by W-E2E-CUT 7/7. Not a separate tool.
11. ✅ GRID-STRETCH (`witness_e2e_gridstretch.js` 7/7) — seed a grid {xs:[0,4,8]} + a wall spanning A→B (scene
    setup, like opening a building), then Move-Grid pill → REAL drag of gridline B → GEOM_GRID_MOVE recomposes the
    wall. ATOMIC by the wall's X-extent (4.000→5.500 == drag Δ), REVERSIBLE (→4.000). ⚠ SETUP GOTCHA: clear via the
    #b-clear BUTTON, not a direct oplog.clear() — the latter leaves stale building meshes in the THREE group that a
    LEAF extrude optimistic-appends onto → fid collision (mismeasure). Drove the real pointer drag, not __gridStretch.
12. ✅ DELETE (`witness_e2e_delete.js` 6/6) — select → Delete pill → soft-delete (active op-count −1, mesh removed,
    undone=1 so verifyChain stays valid); real-user reverse = Redo (Ctrl+Y) → count + mesh restored. ATOMIC by census.
13. ☐ SEED-TRUNK full user flow (Outliner "Route trunk" → `_seedPopup` choose entry → render+animate; render gate
    W-SEED-TRUNK-RENDER already exists — add the POPUP user flow on top)
14. ☐ (optional) SDG-CASCADE as a user flow (move a host wall → door rides) — W-SDG-CASCADE-MODELLER is node-only.
Each: real input → assert COMMIT (op-log +N, right op_type/params), ATOMIC (rendered == committed by maths),
VISIBLE (readPixels), REVERSIBLE (undo restores cursor + geometry), verifyChain ok, shot() at key moments.

## THE GUIDE — `docs/ModellerUserGuide.md` (bim-compiler docs/, mkdocs) — world-class
- Structure: Overview/vision (ARC substrate + 3D-grid handle + walkers fill ARC + ONE Outliner) → per-tool sections
  (what it does · how, step-by-step · the real screenshot · the signed-op it commits · undo). Group by: Navigate /
  Author geometry (wall/sketch/extrude/route/insert/cut/fillet/opening) / Transform (move/scale/rotate/grid-stretch/
  delete) / Generate (Walk disciplines, Seed-trunk) / History (undo/redo slider, op-log).
- Screenshots: copy the BEST frames from `modeller/tests/e2e_shots/` into `docs/img/modeller/` (bim-compiler) and
  embed. Real frames only. Caption each with the asserted fact (e.g. "Move commits a signed GEOM_MOVE; undo is exact").
- Existing `docs/ModellerGuide.md` (pill rail reference) — fold its accurate pill list in; supersede with the new guide.
- Deploy docs ONLY via `scripts/safe_gh_deploy.sh` (no-shrink seatbelt). Add to mkdocs nav.

## CADENCE / ANTI-DRIFT
- Fresh worktree off origin/main each session (sw.js + modeller.html are conflict magnets — KEEP-BOTH on conflict,
  HIGHER CACHE_VERSION). Test files (modeller/tests/*) are conflict-free.
- Witness-first, run to GREEN, read the §-log, never claim done without the green real-user E2E.
- Memory: [[feedback_test_real_user_path_not_seams]] is the load-bearing rule.
```
