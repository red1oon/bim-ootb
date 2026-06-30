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
4. ☐ INSERT (b-insert → catalog picker → drop on grid → GEOM_INSERT; `showGhost`, `bInsert`, `insertHash`)
5. ☐ SCALE (select INSERT → Move mode → drag cube handle → GEOM_SCALE; gizmo `scaleHandle`, axis 'scaleX/Y/Z')
6. ☐ ROTATE (select INSERT/SOLID → Move mode → drag yaw ring → GEOM_ROTATE; axis 'rotZ')
7. ☐ SKETCH→EXTRUDE (b-sketch place points → b-extrude → GEOM_EXTRUDE/_POLY; `enterSketch`, `_sketchDraft`)
8. ☐ ROUTE→RUN (b-route place points → b-run → GEOM_SWEEP; `_routeDraft`)
9. ☐ FILLET (b-fillet edge-pick → b-applyfillet → GEOM_FILLET; `edgePicking`)
10. ☐ OPENING (GEOM_OPENING — find the trigger; likely opening tool on a wall)
11. ☐ GRID-STRETCH (b-gridmove → drag a gridline → GEOM_GRID_MOVE; `commitGridMove`, hook `window.__gridStretch(id,delta)`)
12. ☐ DELETE (select → b-del / Del key → `deleteSelected`; assert removal + reversible)
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
