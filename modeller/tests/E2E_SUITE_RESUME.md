# RESUME — Modeller real-user E2E suite + world-class ModellerUserGuide (continue fresh session)

```
# ⚠⚠ NEW SESSION: REVIEW FIRST, CAREFULLY, BEFORE WRITING ANYTHING ⚠⚠
This work fans across TWO repos + several branches and overlaps a SEPARATE guide-unification effort.
Re-verify the whole picture is coherent (branches, cross-links, ownership) BEFORE editing. Parallel guide
edits COLLIDE on the shared docs branch (it already happened once). Do the review pass, THEN act. See §HANDOFF.
```

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
13. ✅ SEED-TRUNK (`witness_e2e_seedtrunk.js` 6/6) — Walk ELEC (production discWalk → 267 fixtures) → seedTrunk (the
    Outliner "Route trunk" handler) → the REAL _seedPopup modal (14 candidate entries + Route ▶) → choosing routes +
    renders the trunk (a dwTrunk=ELEC LineSegments, 5494 segs, 4 storeys, not refused) where there was none; VISIBLE.
    Render-only (not op-log), so no slider-undo claim; builds the popup flow ON TOP of W-SEED-TRUNK-RENDER.
14. ☐ (optional) SDG-CASCADE as a user flow (move a host wall → door rides) — W-SDG-CASCADE-MODELLER is node-only.

## ✅ ROSTER COMPLETE — 12 tools each have a green real-user, maths-asserted E2E (#1-#13; #10 OPENING = CUT; #14
optional). 3 REAL DEFECTS the suite caught + fixed this pass: §CUT-ON-ARC (cut vanished on seeded ARC walls —
parent-not-found, never rendered), SCALE-vanish (foldInsert `c.bbox` on a null catalog → ARC wall disappeared),
RAIL-STRAND (mode-revealed pills — Extrude/Run/Apply-fillet — stranded at (0,0), unclickable). All on the
lane/modeller-e2e-suite branch. Run the whole suite: `for w in move walk cut insert scale rotate sketch route
fillet delete gridstretch seedtrunk; do node modeller/tests/witness_e2e_$w.js; done`. NEXT = the GUIDE (below).
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

---

## §HANDOFF — state at session close (2026-07-01) + the multi-agent orchestration plan (REVIEW FIRST)

### What is DONE + pushed (do NOT redo)
- **Modeller E2E suite = COMPLETE.** 12 tools each have a green real-user, maths-asserted E2E
  (`modeller/tests/witness_e2e_*.js` + `e2e_harness.js`). Full suite 88 assertions, 0 fail. Branch
  `lane/modeller-e2e-suite`, **PR red1oon/bim-ootb#585**, SW cache v25→v26. This is the §F "guide-as-E2E"
  principle already applied to the Modeller (a runnable click-path per tool; unreachable screens were fixed,
  not hedged). KEEP INDEPENDENT of the docs work — it's tool-truth, merge on its own merit.
- **3 real defects caught + fixed by the suite** (all "op commits + verifyChain green, but user sees
  nothing/wrong"): §CUT-ON-ARC (cut vanished on seeded ARC walls), SCALE-vanish (`foldInsert` `c.bbox` on a
  null catalog → ARC wall disappeared), RAIL-STRAND (mode-revealed pills stranded at (0,0), unclickable).
- **Guide draft PRESERVED:** `ModellerGuide.md` revamped (per-tool screenshot walkthrough, keeps the
  open-and-edit vision + Walk-evidence tables) + 20 real E2E frames TIGHT-CROPPED → branch
  `bim-compiler docs/modeller-guide-revamp` (pushed, own lane, disjoint files, does NOT touch shared nav).

### The big picture the new session must RE-REVIEW before writing
- The Modeller guide is a THIRD guide alongside a SEPARATE unified effort for HR + Teams + the icon set:
  **`bim-ootb lane/teams-overlay : prompts/RESUME_GUIDES_AND_ICONS_UNIFY.md`** is that effort's source of
  truth (same quality bar A1 step-by-step / A2 tight-crop; §E two-icon-registry reconcile; §F gap log).
  It currently covers HR + Teams only — the Modeller guide needs a **§B3** added there (or folded in).
- Docs topology (verify — it's tangled): `master` is FROZEN/stale (2026-06-16, no Modeller in USER_GUIDE);
  the live docs superset is `origin/docs/hba-guide-rewrite` (+~510). `USER_GUIDE.md → [Guide](ModellerGuide.md)`
  is the real trace — so `ModellerGuide.md` (NOT the orphan `ModellerUserGuide.md`) is the live file. gh-pages
  already serves ModellerGuide/, ModellerUserGuide/ (orphan) + img/modeller/*. A read-only coherence-review
  agent was launched at close to map links/nav/gh-pages/collisions — RE-RUN or finish that review FIRST.

### The orchestration plan (review-first → fan out isolated → re-check)
- **Phase 0 — coherence review (read-only, FIRST):** inventory every guide + cross-links + mkdocs nav + what
  gh-pages serves + branch-collision map; output a **disjoint-file partition**. Gates the fan-out.
- **Phase 1 — fan out, EACH IN ITS OWN WORKTREE (isolation), DISJOINT files:** Modeller (`ModellerGuide.md`
  + `img/modeller/*`, base = `docs/modeller-guide-revamp`) · HR (`HRBIMAssetGuide.md` + `img/hba_*`) · Teams
  (`TeamsOverlayGuide.md` + `img/teams_*`, demo-page nav, keep the demo-only caveat) · Icons (`viewer/panels.js`
  ICONS + pill_builder reconcile). Same quality bar for all.
- **SERIALIZE (one owner, never parallel — the collision surfaces):** `mkdocs.yml` nav · `USER_GUIDE.md`
  cross-links · `viewer/panels.js`. Apply AFTER the guide agents return.
- **Phase 2 — coherence re-check + integrate:** confirm one voice, all cross-links resolve, consolidate the
  `ModellerUserGuide.md` orphan INTO `ModellerGuide.md`, clean the nav; branch/PR per slice; deploy is the
  ONE outward step via `scripts/safe_gh_deploy.sh` (no-shrink seatbelt) — USER triggers it, not the agent.

### ⛔ COHERENCE REVIEW RESULT (read-only agent, 2026-07-01) — GATING items, fix these FIRST
1. **`docs/modeller-guide-revamp` is STALE-BASED — do NOT merge as-is.** Its tip `3e3c03517` is the direct
   PARENT of the live docs superset tip `origin/docs/hba-guide-rewrite` = `0967ebcdd`. That parent predates the
   commit that added the whole Teams deliverable + HR reframe, so a naive merge/diff **looks like it deletes
   TeamsOverlayGuide.md + all `img/teams_*` + the Teams nav line + the Teams cross-links** (a false collision from
   the stale base, NOT from Modeller edits). **FIX = rebase the branch onto `0967ebcdd` first.** Expect a small
   `ModellerGuide.md` conflict (hba tip added +8 lines there — the Teams cross-link) owned by the Modeller lane.
2. **The revamp DROPPED the Teams cross-link.** hba's `ModellerGuide.md` links `TeamsOverlayGuide.md` (line ~308,
   a card invariant: BIM/ERP/Modeller all link Teams). The rewritten draft links only USER_GUIDE + index →
   RESTORE the Teams link on rebase.
3. **Orphan `ModellerUserGuide.md` vs `ModellerGuide.md`.** Both are in nav with near-identical labels; only
   `ModellerGuide.md` is linked from the front door (`USER_GUIDE.md` line 39); `ModellerUserGuide.md` has ZERO
   inbound links (its content already folded into hba). The revamp renames ModellerGuide's H1 to
   "DAGeVu Modeller — User Guide", DUPLICATING the orphan's nav label → **consolidate: delete/redirect the orphan,
   collapse to ONE Modeller nav entry** (a SHARED `mkdocs.yml` edit — serialize to the nav owner).
- **Partition CONFIRMED disjoint** (guide files + image folders don't overlap) → safe to parallel-fan-out **iff
  each lane branches off `0967ebcdd`**. SERIALIZE only: `mkdocs.yml`, `USER_GUIDE.md`, `viewer/panels.js`+`pill_builder`.
- **The unified card covers HR + Teams ONLY** — the Modeller guide is a SEPARATE, un-carded effort (add a §B3, or
  run Modeller as its own lane A in parallel). Card §F#5 says "no `modeller/` app edits till the pivot settles" —
  the guide (docs-only) is unaffected; the E2E suite already did its app fixes on `lane/modeller-e2e-suite` (fine).
- gh-pages live img path is `img/modeller/` (a subfolder), NOT `img/modeller_*`. HR=`img/hba_*`, Teams=`img/teams_*`.

### Modeller guide §F gaps still to close (for the unified pass)
1. Step-by-step scaffold — add the HR-guide shape (Getting started → Common tasks → Under the hood →
   Troubleshooting); the draft has per-tool click-steps but not the full navigational frame (user A1).
2. Recapture frames from the LIVE app at `deviceScaleFactor:2` (current 20 are headless-swiftshader E2E
   captures — functional + tight-cropped, but not the polished live app) (user A2).
3. Consolidate orphan `ModellerUserGuide.md` → `ModellerGuide.md`; fix `mkdocs.yml` nav (one entry) +
   `USER_GUIDE.md` link (SHARED files — serialize).
4. Move/Walk witnesses are pre-harness (no `shot()`) → add capture for their guide frames.
5. `OPENING` has no user trigger (it's the CUT tool) — a naming/UX inconsistency to note.
