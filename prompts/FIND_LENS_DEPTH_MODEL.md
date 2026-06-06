# ⚠ DO NOT REMOVE — Find-lens DEPTH MODEL + view-history scrubber: RESUME for a fresh session
# Scope: revamp the Find-lens selection rendering into ONE depth-driven model (ghost/group/item),
#        depth-driven zoom, and a Glassbowl-style view-history SCRUBBER on the undo timeline.
# Edit shipping code in bim-ootb/viewer/ (canonical, GH Pages). Whitebox §-log FIRST; SAVE every run
# to a log and READ it before any conclusion. Witness headless (leak-safe, below). Honour until ✅ DONE.

## ☠ HARD RULES (cost real incidents)
- **Headless WebGL probes LEAK CPU.** Wrap EVERY probe: `timeout --signal=KILL 110 node probe.js ; pkill -9 -f
  chrome-headless-shell`; probe must `try{…}finally{await b.close()}`; ≤1 browser at a time; verify `ps -eo comm |
  grep -i chrome` clean after. (Inline `python -m http.server & ; curl --retry` in a *script file* run with bash —
  inline `&`+curl in one Bash tool call trips the sandbox → exit 144. Use a run_*.sh.)
- **Probes must BLOCK the Service Worker** (`browser.newContext({serviceWorkers:'block'})`) or a stale SW serves an
  old DB and you debug a ghost (cost a long detour this session).
- **Split buildings load `_meta.db`, NOT `_extracted.db`** (streaming.js:~1347 detects the sibling). For Terminal/
  LTU/Clinic/Hospital, sync the local `buildings/<B>_meta.db` from OCI before witnessing, and query the ACTUAL
  loaded db (sql.js) — header range-reads & the wrong sibling will mislead. OCI `_meta.db` already has rooms+mats.
- **Shared bim-ootb tree is DIRTY + DIVERGED.** Deploy ONLY via an isolated worktree off origin/main → PR → CI →
  squash-merge (`--admin` if base races ahead) → SW bump. NEVER checkout/stash/reset/rebase/pull the shared tree.
- Cut ceremony, don't ask trivial Qs — decide and let the user judge by what appears. STOP yourself only when you're
  about to INVENT (no source); following an instruction to read existing code is not over-reach. (see memory)

## ✅ ALREADY LIVE (v595, bim-ootb PR #141 — do not redo)
- Room-lens "stuck" fix: storey/type GROUP rows now expand on row-LABEL tap (was 12px-arrow-only) — `§GROUP_EXPAND_VIA_LABEL`.
- Drill zoom 1.6→1.1 + pad 2→1 (item fills frame). Drill x-ray dim 0.2→0.1 (`§XRAY_DIM opacity=0.1`).
- All in `viewer/navigate_find.js`. SW `v595`, `navigate_find.js?v=18`.

## ⚠ UNCOMMITTED in `viewer/navigate_find.js` this session (NOT deployed — keep + fold into the model)
- **§PERF deferred build:** `_drillSelect` now builds shape meshes in `requestAnimationFrame` (`_drillRAF1/_drillRAF2`)
  with a cancel-on-new-tap re-entrancy guard → tap returns instantly (was ~1500 InstancedMeshes synchronously on the
  pointer handler = the "respond late / unresponsive to touch"). Frame1=selected lit+zoom, frame2=context solid.
- **§PERF query cache:** `_getInstanceRows()` caches the static element_instances⋈transforms⋈meta join per
  activeBuilding (`§INSTROWS_CACHED`, witnessed count=1 across drills) — was re-run twice per tap.
- **`_buildShapeMeshes(set,color,solidOpacity)`** gained a `solidOpacity` param; `_roomSelect` passes 0.3.
  → GENERALIZE this into the depth model below (0.5, all lenses), don't leave it room-only.
- These are SOUND (responsiveness + cache proven). Re-witness after the model rewrite, then deploy.

## ▶ THE AGREED DEPTH MODEL (user-designed; UNIFORM across ALL lenses — Storey·Disc·Room·Material·Phase. No per-lens custom.)
Selection has DEPTH; rendering + zoom are a pure function of depth. The view is `f(axis, group, item) + camera`.
- **rest of building = 0.1 ghost, ALWAYS.** Never hidden. (Storey/Disc selection currently HIDES the rest — change
  `A.filterStorey`/`A.filterDisc` to GHOST it to 0.1 instead. The "glass ghost house" keeps spatial orientation.)
- **GROUP selected (storey / discipline / material / room-floor) → that group = 1.0 SOLID** + **ZOOM-TO-FIT the
  group so it fills the screen** (new — group selection currently filters but doesn't frame; reuse `_zoomToBox`).
- **ITEM selected within a group → its group drops to 0.5** (semi-transparent, depthWrite off) **and the item =
  bright blue (cyan), shining THROUGH the 0.5 group.** Item zoom = current 1.1 (user: "fine, keep").
- Three tiers read cleanly because: 0.1↔0.5 is a 0.4 gap (not the muddy 0.2 of 0.1/0.3) AND the item is COLOR not
  another opacity step. Carry the hierarchy with colour/brightness (+ optional thin outline) — opacity is secondary.
- This SUPERSEDES the "Material item has no middle tier" behaviour (user accepted the uniform model over that).

## ▶ VIEW-HISTORY SCRUBBER — revamp the existing UNDO timeline to the GLASSBOWL `#scrub` pattern (W-VIEWLOG)
Problem (user): "no way to see what was chosen some steps before." The undo/kernel bar records model picks
(`§KERNEL_OP type=ELEMENT_PICK`, `§KRN_CHAIN`) but NOT lens navigation, so you can't retrace your viewing path.
- **Target pattern = Glassbowl `#scrub`** in `bim-compiler/build/erp/glassbowl.html` (search `#scrub` CSS ~L128-138
  "Feature 2 W-VIEWLOG" + `renderHistory`): a thin DOT-LINE scrubber pinned bottom-center; each dot = a visited view,
  current dot gold; **double-tap BLOOMS** every dot into a **labelled CHIP** (so you SEE each prior step: "Storey 2",
  "Room Aras 01", "ACMV ducts") and jump straight back. Read-only navigation (moves the view, never mutates).
- **Apply to the viewer:** the existing undo timeline lives in `viewer/grid_overlay.js` (~L1555-1590, `§UNDO`,
  `undoRedo`) + `viewer/kernel_ops.js`. Revamp it (or add a sibling view-log layer) so each SEMANTIC lens-nav moment
  pushes a view-state {axis, group, item, camera pose} — and ONLY semantic ones (axis change, group select, item
  select). Do NOT record expands, hovers, or camera micro-nudges (else "back" is 20 taps deep). Restore is
  deterministic: replay `f(axis,group,item)` rebuilds opacity/zoom/highlight, then lerp the camera.
- Read the glassbowl scrub code first (the user pointed here explicitly) — mirror its dot-line + double-tap-bloom UX,
  don't reinvent it.

## PERF + ACCEPTED-FLAKINESS
- 0.1 whole-building ghost = real overdraw (transparency kills early-z). User: "even heavy it's OK." Still GATE-TEST
  on Hospital (63k elems) vs the S286 idle gate; if FPS regresses, fallback = "ghost only nearby storeys", not whole.
- User ACCEPTS an occasional scene REFRESH under heavy activity as an escape hatch — do NOT engineer it away. The
  deferred-build + query-cache changes already reduce the main-thread overload that caused it.

## WITNESS TARGETS (whitebox §-log first; Playwright = wiring only)
- Overlay material opacities after a drill: rest 0.1 · group 0.5 (item-selected) or 1.0 (group-selected) · item cyan
  opaque (probe: `scene.traverse` → `userData._shapeOverlay` → material.opacity/transparent). 
- Group select frames the group (camera bbox fills viewport). Item select keeps 1.1.
- Scrubber records N semantic steps, double-tap blooms to labelled chips, click restores the exact prior view.
- Responsiveness: synchronous tap-handler time stays low (build deferred); `§INSTROWS_CACHED` count=1. No CPU leak.

## DEPLOY (clean-worktree)
Bump `viewer/sw.js` v595→**v596** + `navigate_find.js?v=18→19` (+ any other module ?v you touch) in `viewer/main.js`.
`git worktree add -b feat/<name> /tmp/wt origin/main`; cp ONLY your changed viewer files in; `node --check` each;
commit those paths; push; `gh pr create --base main`; wait `gh pr checks` green (e2e is FLAKY — rerun `gh run rerun
<id> --failed` if the golden-path streaming test fails); `gh pr merge --squash --admin --delete-branch`; verify
`pages-build-deployment` success + curl live sw.js = v596; `git worktree remove /tmp/wt --force`.

## ▶ PILL SPEC — Alt+X "Ghost X-Ray" (one-mesh x-ray) — to wire into the pill registry
Status: keybind + engine DONE (`window.toggleGhostXray`, scene.js Alt+X, navigate_find.js `_buildMergedGhost`).
Remaining = the PILL UI. Spec:
- **What:** a second x-ray that swaps the building for ONE merged, colored, see-through **envelope shell**
  (~7% of elements, ~3 MB, one draw). Cached after first build — kept in RAM (cheap), toggle = visibility.
- **Key:** `Alt+X` (sits beside present `Alt+Z` x-ray, which stays as-is).
- **Icon:** a GHOST glyph (distinct from the eye used by Alt+Z x-ray).
- **Placement (user):** it is a **sub-pill dragged OUT of the X-Ray pill** — i.e. a variant that lives under
  the existing `xray` pill, revealed by dragging from it (sibling-of-xray, not a top-level slot).
- **Wire:** in `panels.js` — (1) add to the action list (~L1057, beside `id:'xray'`):
  `{ id:'ghostxray', name:'Ghost X-Ray', key:'Alt+X', icon:I.ghost.svg,
     fn:function(){ if(window.toggleGhostXray) window.toggleGhostXray(); },
     isActive:function(){ return !!(window._ghostXrayOn); } }`
  (2) register in the pill registry (~L668) as a release-able icon under/next to `xray`.
  (3) add a `ghost` SVG to the icon set `I`. (4) expose an `_ghostXrayOn` flag from navigate_find for `isActive`.
- **Behavior when on:** drills render `selection (solid + yellow OUTLINE) + immediate parent (solid) + shell`,
  sliding the window down as you go deeper; base hidden; no per-element x-ray. Off → restore base, shell hidden (kept).
