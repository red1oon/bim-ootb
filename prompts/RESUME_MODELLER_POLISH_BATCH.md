<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — SPEC: Modeller competitive-polish batch (§FABLE5-NOW items 1–10)

**Scope:** implement the ten mechanical items of bim-compiler
`prompts/RESUME_MODELLER_COMPETITIVE_POLISH.md §FABLE5-NOW` (research verified against origin/main 51bfdee,
2026-07-03). Each item wires an EXISTING primitive into a UI seam — no new math, no invention.
**Read the log after every run.** Every claim below closes only on a `§`-tagged witness line.

**Status: ✅ ALL 10 DONE 2026-07-03.** New witnesses all green: W-GM-SURFACE 7/7 (node) · W-OL-SYNC 6/6
(real browser) · W-E2E-NUMROT 7/7 · W-GESTURE-UNDO 9/9 (real kernel_ops chain) · W-OL-PERSIST 4/4 ·
W-GRID-NUMERIC 6/6 (Duplex maxΔ 208.5mm / SampleHouse 0.0mm / SampleCastle 135mm vs tol 300mm — the accuracy
claim is now MEASURED, not asserted). Touched-path regressions green: W-STRETCH-RIDE 9/9, W-E2E-STRETCH-RIDE
9/9, W-E2E-GRIDSTRETCH 7/7, W-E2E-WALK 8/8, W-ARC-EDITABLE 10/10, W-SDG-CASCADE 7/7, W-SDG-GATE 6/6,
W-E2E-ROTATE 7/7, W-E2E-SCALE 7/7, W-E2E-MOVE 9/9. ⚠ Pre-existing (IDENTICAL failures on clean origin/main
51bfdee, NOT this batch): the older `modeller/tests/bonsai_*_live.js` harness generation fails to boot in this
env (outliner/hover/multiselect/gridundo `_live` witnesses — all values `undefined`; the newer witness_e2e_*
generation with the swiftshader flags is the working harness), and smoke_strwalk_modeller.js is
MODULE_NOT_FOUND (missing dep) on both trees.

## §P1 — Surface geomapping confidence in the Outliner (W-GM-SURFACE)
`ArcEditable.buildSeedOps` already computes `geomap = {checked, flagged:[{guid,ifc_class,z,why}], noBand,
inBandRate}` and `str_walker_outliner.js:291-294` stashes it on `window.__gmSeedAudit[key]` — console-only.
**Change:** `str_walker_outliner.js tabRows()` appends a `sw-gm` summary row (checked/flagged/inBandRate) +
top-6 flagged rows (`sw-gmf<i>`, ⚠ guid + z + why), copying the existing `sw-conf`/`sw-lc` render pattern
verbatim. Reads `window.__gmSeedAudit[<open building key>]`; absent audit ⇒ zero new rows (byte-identical).
**Witness:** node `witness_gm_surface.js` — feed a synthetic `__gmSeedAudit`, assert tabRows() emits the
summary + flagged rows with the real values, and emits NOTHING new when audit is absent.

## §P2/3/4 — Bidirectional hover + multi-select sync Outliner⇄canvas (W-OL-SYNC)
- `modeller.html setHover(mesh)` (:843) is a local closure → expose `window.Bonsai.hoverFeature(fid|null)`
  (resolves fid→mesh in the authored group, calls setHover; null clears). Guarded — absent group = no-op.
- `bonsai_outliner.js`: row `onmouseover/onmouseout` (flat `[data-fid]` rows + leaf bnode rows via the
  fid↔guid bridge) call `window.Bonsai.hoverFeature` — symmetric with the click wiring.
- `setActive(id)`: paint SECONDARY selection tint on every row whose fid ∈ `window.Bonsai._selSet` (canvas
  multi-select → Outliner, item 3). Primary keeps `#26456b`; secondaries get the dimmer `#1f3f5c`-family
  row tint. Same membership check for bnode leaf rows through the guid bridge (item 4 = same root cause).
**Witness:** browser (playwright, e2e_harness) `witness_e2e_olsync.js` — author 3 boxes; shift-click-select
2 in canvas ⇒ BOTH Outliner rows tinted (primary ≠ secondary); hover an Outliner row ⇒ mesh emissive =
hover tint 0x14324a; mouseout ⇒ 0. Read `§`-log lines + readPixel-free DOM/scene asserts (real user path).

## §P5 — Dead-click feedback on walked fixture rows (W-OL-DEADCLICK, same witness file as §P2)
`bonsai_outliner.js` leaf click: GUID that never resolves via `__arcFidByGuid` currently silent-no-ops the
canvas. **Change:** when resolution fails, `window.toast('no 3D pick for generated elements yet', 'info')`
(guarded `window.toast &&`) + `§OUTLINER deadclick` log. No behaviour change when the guid resolves.

## §P6 — Typed numeric input for Rotate/Scale (W-E2E-NUMROT)
Mirror `#dim-move`: add `#dim-rot` (degrees) + `#dim-scale` (axis-prefixed factor, e.g. `z1.5`) inputs,
shown/hidden with move-mode alongside dim-move. Enter in `#dim-rot` ⇒ `commitRotate(deg)` (existing signed
path). Enter in `#dim-scale` ⇒ parse `/^([xyz])\s*([\d.]+)$/` ⇒ `commitScale(ax, f)`; malformed input ⇒
setStat hint, no commit. Gated exactly like the gizmo handles (rotate: selection is INSERT/SOLID set;
scale: single INSERT) — refuse with the same honest setStat message otherwise.
**Witness:** browser `witness_e2e_numrot.js` — place an insert, type 90° Enter ⇒ ONE signed GEOM_ROTATE
drot=90 in kernel_ops + mesh AABB swaps x/y extents (maths, not eyes); type `x2` Enter ⇒ GEOM_SCALE fx=2 +
AABB x-extent ×2 within 1e-3.

## §P7 — Help panel lists M + G (no witness needed beyond spec audit)
`modeller.html` SHORTCUTS map gains `'b-move': 'M'`; add a keyboard-only row for `G` (snap-to-geometry
toggle while moving) next to the existing Undo/Redo/Esc rows. Text-only.

## §P8 — Grid-stretch-with-rider = ONE undo step (W-GESTURE-UNDO)
Today `gridmove.commit` commits GEOM_GRID_MOVE then N separate rider GEOM_MOVEs ⇒ N+1 Ctrl+Z to revert one
gesture. `kernel_ops` rows already carry `gid`. **Change (additive, prefix-scoped):**
- `bonsai_oplog.js` new `commitGesture(opsArray)` — one `KernelOps.commitGroup` under gid
  `gesture-grp-<n>` (same deterministic baseTs formula as commit()), verify, authoritative re-fold, emit.
- `undo()`/`redo()`: if the top active/undone row's gid starts with `gesture-` ⇒ toggle EVERY row of that
  gid together. Any other gid (incl. `arcseed-*`, `geom-grp-*` singles, `bomtree-*`) keeps today's one-row
  behaviour — the giant ARC seed group must NEVER mass-undo.
- `bonsai_gridmove.js commit()`: when riders exist, commit [GEOM_GRID_MOVE, …rider GEOM_MOVEs] via
  commitGesture; zero riders ⇒ existing single-op path untouched (byte-identical logs for rider-less drags).
**Witness:** node `witness_gesture_undo.js` vs REAL kernel_ops + oplog shim — commit a gesture group of 3,
one undo() ⇒ all 3 undone, one redo() ⇒ all 3 back; a plain single op still undoes alone; an `arcseed-`
group undoes ONE row only (regression pin).

## §P9 — Outliner collapsed-state persists (W-OL-PERSIST, node)
`bonsai_outliner.js` `_collapsed` loads from `localStorage['dagevu_modeller_ol_collapsed']` at mount, saves
(try-wrapped, debounce-free — writes are tiny) on every toggle. `_adjLens` stays session-only (a lens, not
layout). Node witness with a localStorage stub: toggle → new instance → state restored.

## §P10 — Real numeric grid-alignment witness (W-GRID-NUMERIC, node)
`tests/specs/30/31` are string-presence only — the accuracy claim is UNVERIFIED. New node witness
`modeller/tests/witness_grid_numeric.js`: load REAL `modeller/Duplex_extracted.db` (+ SampleHouse) with
sql.js, run `window.GridDims.detectGrids(db)` (shimmed window), then for EVERY detected grid line assert
the nearest wall/column centerline from `elements_meta⋈element_transforms` is within `snap_face_tol_m`
(the module's own tolerance; report the max |Δ| in the log). Zero grid lines detected ⇒ FAIL loud (that IS
the credibility gap). Numbers from the DB only — non-invent.

## §OPEN — discovered while witnessing, NOT fixed here (pre-existing engine semantics, needs a scope call)
- **GEOM_SCALE folds on LOCAL axes, but the scale cube handles + ghost preview are WORLD-aligned.** Measured
  by W-E2E-NUMROT's first run: rotate an insert 90° then commit fx=2 ⇒ WORLD-Y doubles (ext [0.8,0.45]→
  [0.8,0.9]) while the drag ghost would have previewed a world-X stretch. Affects the existing drag path
  identically (same op) — for a rotated component the preview and the fold disagree. Fix belongs in the
  fold/preview pair (bonsai_library foldInsert scale vs scaleGhostShow), not in §P6's input wiring.

## Non-goals (stay §NEEDS-DESIGN): eye/visibility toggle, scene-filter dimming, per-instance pick identity,
collapsed-ancestor auto-expand, virtualization, outline shader, shadows/AO, floating dims, PBR, R/S keys.
