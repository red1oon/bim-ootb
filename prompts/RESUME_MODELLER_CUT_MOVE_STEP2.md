# RESUME — cut-move step 2 (GEOM_CUT_RESIZE) then step 3 (rotate frame) — dispatch brief for a fresh coding session

```
# ⚠ DO NOT REMOVE
SCOPE: implement prompts/SPEC_GEOM_CUT_RESIZE.md exactly (step 2). Only after it is merged and every witness in its
§4 is green, implement prompts/SPEC_CUT_FRAME_ROTATE.md (step 3) — and ask first, it is low priority. Do NOT touch:
holes baked into extracted LOD-300 meshes (never); roof/AngleEdge (⛔ paused); the abuts-realign APPLY (report-only by
design, separate spec). Spec before code, spec before tests. Read the log after every witness run — exit code alone is
not evidence; SKIP and silent failures only appear in the log. Honour this until §4 of each spec is all ✅.
```

## Where things are (2026-09-11)
- Merged on main: engine #1706, slide #1710, GEOM_CUT_MOVE step 1 #1711 (8df2568d). Read, in this order:
  1. `prompts/SPEC_GEOM_CUT_MOVE.md` (step 1 — §2 contract, §3 frame math, §6 every witness count)
  2. `modeller/cut_move.js` (154 lines — the ONE definition; everything you add goes here first)
  3. `modeller/bonsai_kernel_worker.js` buildSolids ~:405-430 (pre-scan + GEOM_CUT branch + the GEOM_CUT_MOVE skip)
  4. `modeller/bonsai_gridmove.js` `_cutRiders` ~:313-340 and `commit()` ~:360-380 (the anchor rider + gesture group)
  5. `modeller/tests/witness_cut_move.mjs` (how the REAL worker is driven in node; copy its fixture helpers, add cases)
  6. `modeller/tests/witness_e2e_cut_move.js` (real bCut + real mouse + real Ctrl+Z; extend M5/M6, don't fork it)
- Then the step 2 spec: `prompts/SPEC_GEOM_CUT_RESIZE.md`. Step 3 (later): `prompts/SPEC_CUT_FRAME_ROTATE.md`.

## Mechanics (non-negotiable)
- `~/bim-ootb` main checkout is HOOK-READ-ONLY. Work in a worktree from origin/main:
  `git -C ~/bim-ootb fetch origin && git -C ~/bim-ootb worktree add /tmp/wt-cut-resize -b feat/cut-resize origin/main`
- One PR per step, based on `main` (a bot auto-merges — NEVER stack a PR on a feature branch). PR body = the spec's §4/§5
  witness table with the counts you actually read from the logs.
- Run witnesses from `modeller/tests/`:
  node: `node witness_cut_move.mjs` (≈10 s) · `node witness_opening_slide.js` · `node witness_gridmove_fold_pure.mjs` ·
  `node witness_dagevu_engine.js`. e2e (puppeteer from ~/bim-compiler/node_modules, headless swiftshader, 1-3 min each,
  run ≤3 in parallel): `node witness_e2e_cut_move.js` · `witness_e2e_opening_slide.js` · `witness_e2e_gridstretch.js` ·
  `witness_e2e_stretch_ride.js` · `witness_e2e_grid_greenorange.js`.
- Any node harness that copies `bonsai_kernel_worker.js` into a temp dir MUST also copy `cut_move.js` (the worker
  `import`s it). Both existing .mjs harnesses already do.
- Cache-bust every `<script src="…?v=N">` you touch in `modeller/modeller.html`; the worker URL lives in
  `bonsai_kernel.js` (`bonsai_kernel_worker.js?v=8` → v9 for step 2).
- In e2e, `t.undoToCursor()` is a SCRUB (rows stay active). Use the real Ctrl+Z helper already in
  witness_e2e_cut_move.js (`ctrlZ(t)`) when a later commit must build on the reverted log.
- Known pre-existing failure, not yours: `witness_e2e_cut` C4/C6 (framebuffer pixel-sum checks) fail identically on
  untouched main. Note it in the PR; do not fix it in these PRs.

## Definition of done (step 2)
- `SPEC_GEOM_CUT_RESIZE.md` §5 all [x] with the counts pasted; W-CUT-MOVE ≥16/16 (C0-C6 + R1-R5), W-E2E-CUT-MOVE 8/8
  with M5 asserting hole width UNCHANGED and three gesture rows; the five guard e2e + four node guards green.
- The dimLabel on the e2e fixture reads exactly `… · 1 held · 1 hole held` (no `(Δw …)`).
- Commit message + PR body end with the attribution lines the session provides.
