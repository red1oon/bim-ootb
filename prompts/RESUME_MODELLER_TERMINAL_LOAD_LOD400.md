<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — RESUME: Modeller — Terminal load stall + illegal LOD200 geometry

**Scope.** Two defects the user hit live-testing the Modeller on 2026-07-01, AFTER the 12-tool real-user E2E suite
was already fully green. Root-caused (read-only, no fix yet) by an Explore agent the same day. **Read the log after
every run.** Honour this preamble until `✅ DONE`.

> **Why the green suite missed this — read first, don't re-litigate:** every one of the 12 `witness_e2e_*.js` files
> opens ONLY `'Duplex'` (small, 265 rows) — Terminal (48,428 rows) has ZERO E2E coverage, so a load stall there is
> invisible to a fully-green suite. And no witness asserts LOD TIER — `census()`/tri-count checks prove *a mesh
> exists*, which is true for a crude box AND a real component mesh alike. See memory
> `feedback_test_real_user_path_not_seams.md` §RECURRENCE for the full lesson — the fix for THIS bug must ship with
> a Terminal-scale witness + an LOD-tier assertion, or it repeats again.

---

## §RESUME — START HERE (new session)
1. **Sync.** `git -C ~/bim-ootb fetch origin && git -C ~/bim-ootb merge --ff-only origin/main` (or merge if diverged
   — check first). Work in a FRESH `/tmp/wt-*` worktree off `origin/main`, never the shared `~/bim-ootb` checkout
   (PreToolUse hook blocks direct edits there).
2. Read `docs/WalkerDoctrine.md` (LOD400 finish-bar doctrine) and `modeller/tests/E2E_SUITE_RESUME.md` before
   touching `bonsai_kernel.js`/`bonsai_library.js`/`arc_editable.js` — these are load-bearing, many-dependency files.
3. Reproduce BOTH bugs first, by hand, before any code change (per Log Mandate — confirm the diagnosis below still
   holds against current `origin/main`; code may have moved).

---

## BUG 1 — Terminal building stalls/fails to open
**Symptom (user, live):** opening Terminal in the Modeller looks "completely not loaded" — no bbox/placeholder
paints first, just an apparent hang.

**Root cause (traced 2026-07-01):**
- Open flow: `#b-open` → `initOpenChooser` (`modeller/modeller.html:2733-2799`) → `STRWalkerOutliner._openResident`
  (`modeller/str_walker_outliner.js:227-248`) → `_openBuffer` (same file, `:84-118`) → `_seedArcEditable` (`:209-223`)
  → `ArcEditable.seedArc` (`modeller/arc_editable.js:84-98`), which commits EVERY ARC-class element as its own
  signed `GEOM_INSERT` box.
- `foldChainToScene` (`modeller/bonsai_kernel.js:165-222`) builds ONE non-instanced `THREE.Mesh` per op
  **synchronously, in a single pass** (line 215), then swaps the whole scene group at once (line 211: clear-then-
  refold). No batching, no `requestAnimationFrame` yield, no bbox-first placeholder pass — despite comments
  elsewhere in the codebase describing bbox-only proxies as if they existed.
- Scale that breaks this: Duplex = 265 rows, SampleCastle = 3,583 rows, **`Terminal_meta.db` = 48,428 rows**
  (`elements_meta`/`element_transforms`, confirmed via `sqlite3`). `cross_edges.js` was explicitly optimized for
  "the 48k Terminal substrate" (comment at `cross_edges.js:19`) — but the ARC seed/fold path was NOT.
- The 250MB `Terminal_geo.db` (Git-LFS) is **never referenced anywhere in the JS** (repo-wide grep confirmed) — it's
  dead/unused, so there is no lazy-geometry loading path for Terminal at all today.
- **No user feedback on a slow/failed open:** no `setTimeout`/`AbortController`/`setStat(...)` call anywhere in
  `_openBuffer`/`_openResident`/`seedArc` — failures only `console.warn` (`str_walker_outliner.js:246`). A slow
  synchronous fold just blocks the main thread with no spinner/progress — indistinguishable from "broken" to a user.

**Fix shape (not yet implemented — decide/spec before coding):**
1. Batch + yield `foldChainToScene`'s per-op mesh build (e.g. `requestAnimationFrame`/chunked loop) instead of one
   synchronous pass, OR add a genuine bbox-first placeholder pass that paints immediately, refining after.
2. Add a `setStat(...)` progress line + a soft timeout/abort in `_openBuffer`/`seedArc` so a slow open is VISIBLE,
   never a silent hang.
3. Gate any batching specifically for large opens (~48k-row scale) — don't regress Duplex/SampleCastle's already-
   fine load time with unneeded overhead.

## BUG 2 — illegal LOD200 boxy geometry (LOD400 required)
**Symptom (user, live, screenshot `~/Pictures/Screenshots/Screenshot from 2026-07-01 12-07-54.png`):** Duplex's
walls/columns/furniture render as plain boxy primitives, not real component-library meshes. User: this is **illegal**,
not an acceptable interim state — LOD400 is the stated finish bar (`docs/WalkerDoctrine.md`).

**Root cause (traced 2026-07-01):**
- `bonsai_library.js` only ever implements TWO tiers. `lodFor` (`bonsai_library.js:297`) defaults to `'200'`,
  upgradeable only to `'300'` (real catalog mesh) via `setLod`/the `#b-lod` button (`modeller.html:1602-1614, 1956`).
  **There is no LOD400 tier anywhere in the engine — it was never built. This is not a fallback-on-error.**
- Seeded/pre-existing building geometry (Duplex's own walls/columns — exactly what the screenshot shows) is
  inserted by `ArcEditable.buildSeedOps` (`arc_editable.js:38-65`) as a **raw-bbox `GEOM_INSERT` with no `hash`
  field at all**. `foldInsert` (`bonsai_library.js:333-348`) explicitly documents: *"Box-proxy (LOD-200) only:
  there is no catalog mesh to refine to."* This is the PERMANENT path for the whole base building, not an edge
  case — it explains why the ENTIRE seeded Duplex (not just new inserts) renders boxy.
- DiscWalker-generated fixtures ALSO hard-code `lod:'200'` (`modeller.html:2298`) and render via
  `window._dwPrimGeo` (`modeller.html:2164`) — a documented "LOD400 swap point" in comments. Grep confirms
  `_dwPrimGeo` is assigned exactly ONCE, to the default `THREE.BoxGeometry` stub, and never overridden anywhere.
  The intended component-library wiring for this swap point was never built.

**Fix shape (not yet implemented — decide/spec before coding):**
1. Decide whether ARC-seeded elements should carry a catalog `hash` (matched by geometry/type at seed time) so
   `foldInsert` can resolve a real LOD300/400 mesh instead of falling to raw bbox.
2. Wire `window._dwPrimGeo` to `bonsai_library`'s real catalog resolution before shipping ANY "LOD400 finish" claim
   for disc-walked fixtures.
3. If a true LOD400 tier doesn't exist yet in `bonsai_library.js`, that's the actual gap — spec it (what makes a
   mesh "400" vs "300"?) before wiring anything to it.

---

## NON-NEGOTIABLE — how "done" must be proven this time (per the recurrence lesson)
Per `feedback_test_real_user_path_not_seams.md` §RECURRENCE, a green witness suite ALREADY failed to catch these
once. Before claiming either bug fixed:
- Add a **Terminal-scale witness** (opens Terminal, not Duplex) asserting a load-time bound AND that SOME geometry
  (even a placeholder) paints before full detail — not just "op-log committed".
- Add an **LOD-tier assertion** that can actually distinguish a box from a real component mesh — e.g. assert a
  seeded/inserted mesh's `userData` carries a catalog `hash`/id, or a minimum geometry complexity a synthetic
  `BoxGeometry` structurally cannot satisfy. "tris > 0" or "mesh exists" is NOT sufficient — a box has tris too.
- Both new assertions go in `modeller/tests/` alongside the existing `witness_e2e_*.js` suite; read the log, not
  just the exit code.

## MERGE / DEPLOY
Not yet started — this is a fresh investigation handoff, no branch/PR exists for the fix yet. Follow the same
worktree + Log Mandate + Spec-First discipline as every other Modeller session (see `~/bim-compiler/CLAUDE.md`).
