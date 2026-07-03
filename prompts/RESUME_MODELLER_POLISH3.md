<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — §POLISH3 spec: Modeller §NEEDS-DESIGN items 1,2,4,5,6,7 (Outliner visibility/scale + render polish)

**Scope:** the six still-open §NEEDS-DESIGN items from bim-compiler `prompts/RESUME_MODELLER_COMPETITIVE_POLISH.md`
(items 1 eye-toggle, 2 filter→scene, 4 auto-expand-on-pick, 5 Outliner virtualization, 6 selection outline,
7 shadows/AO). Item 3 (per-instance pick identity) already shipped in §POLISH2 (PR #620) and its §DECISIONS-2
sequencing rule binds this batch: **per-instance hide/rows stay DEFERRED** — instanced buckets are treated
whole-bucket here. Read the log after every run; exit code is not evidence.

## Design decisions (made here so the build is mechanical)

- **§V1 eye-toggle semantics (item 1):** an eye toggle appears on every BOM-tree row (group + leaf).
  A leaf whose GUID resolves to a real mesh (`window.__arcFidByGuid` / authored fid) hides THAT mesh
  (`mesh.visible=false` — raycaster skips invisible for free). A DISCIPLINE node (`data-disc`) hides its whole
  walked InstancedMesh bucket (`dwDisc===disc → visible=false`) — bucket-only per §DECISIONS-2, per-instance
  hide deferred until real per-instance identity UI lands. A GROUP node applies the same rule to every
  descendant (resolvable leaves + disc buckets). Hidden state is a session **lens** (in-memory, NOT persisted;
  a re-walk/re-fold that rebuilds meshes resets it — documented, honest). New seams:
  `window.Bonsai.setFeatureVisible(fid,vis)` + `window.Bonsai.setDiscVisible(disc,vis)` (modeller.html),
  `Outliner._hidden` + per-row 👁 glyph (bonsai_outliner.js).
- **§V2 filter→scene = DIM, not hide (item 2):** the safer semantic from the research spec — non-matching
  elements go ghost (per-mesh `material.transparent=true; opacity=0.15`), matches keep full opacity; clearing
  the box restores exactly (pre-dim opacity/transparent saved once per material — materials are per-mesh
  `MeshStandardMaterial`, bonsai_kernel.js:167, so no shared-material bleed). Walked InstancedMesh buckets dim
  whole-bucket when NO leaf under that discipline matches (bucket granularity, same §DECISIONS-2 rule).
  Seam: `window.Bonsai.dimExcept({fids:Set, discs:Set}|null)`; the Outliner computes the matched sets during
  the same `_paint` walk it already does per keystroke.
- **§V3 auto-expand on pick (item 4):** `setActive(id)` that finds no rendered row for id/altId walks the
  BOM-tree data (`cat.tree()`, DFS) for the ancestor path, clears each collapsed flag on that path (incl. the
  `tcat|` category header and windowed chunks — §V4), repaints once, then retries the restyle. One retry max
  (no loop); a genuinely absent id stays a clean no-op as today.
- **§V4 Outliner scale = bounded DOM + O(k) pick, not a virtual scroller (item 5):** three concrete fixes,
  honest about what they are: (a) **windowed sibling lists** — any node with more than `OL_CHUNK=250` visible
  children renders the first window + one `… show N more` row (click widens that node's window by another
  chunk) → whole-tree DOM is bounded at Terminal scale; (b) **O(selection) `setActive`** — restyle touches
  only the previously-painted rows + the rows of the current selection (targeted
  `querySelector('[data-fid="…"]')` lookups) instead of `querySelectorAll` over every row per pick;
  (c) **delegated hover** — ONE mouseover/mouseout listener pair on `#bo-tree` replaces per-row rebinding
  (setActive used to rebind every row's handlers on every pick). A full react-window-style scroller is NOT
  built — with (a) capping the DOM this is the 20%-of-work/80%-of-value cut; flagged, not silent.
- **§V5 selection outline = EdgesGeometry overlay (item 6):** bright edge outline (`LineSegments`,
  `EdgesGeometry(geo, 30°)`) added per selected mesh — primary `#4fc3f7`, secondaries dimmer `#2b6a9c` — on
  top of the kept emissive fill. Chosen over inverted-hull (world-baked geometry + flat normals → corner
  gaps) and over `OutlinePass` (needs EffectComposer — NOT in the vendored standard build, verified
  `lib/`). Overlays carry `userData.selOutline`, are cached per `geometry.uuid`, rebuilt on `bonsai:oplog`
  (a re-fold swaps geometry → new uuid), and disposed on deselect. Selections are small → O(k) cost.
- **§V6 shadows now, SSAO deferred (item 7):** `renderer.shadowMap` (PCF — r184 DEPRECATED PCFSoftShadowMap;
  the setter coerces it to PCFShadowMap, measured by W-E2E-SHADOWS H1's first RED) + the existing key
  `DirectionalLight` promoted to a shadow caster whose ortho frustum is FITTED to the scene bbox on every
  `frameBox` (fit/open/view), + a `ShadowMaterial` ground plane at z=0 (subtle, opacity .22), + cast/receive
  flags applied event-driven (`bonsai:oplog` + walk render). **PERF GUARD** (same doctrine as
  `DW_ALL_PROXY_THRESHOLD`): total elements (authored meshes + walked instances) >
  `window.SHADOW_MAX_ELEMENTS=20000` → shadows auto-off with a `§SHADOW guard` log. Manual override
  `window.Bonsai.setShadows(true|false|'auto')`. **SSAO/EffectComposer is DEFERRED** — the vendored three
  build ships no postprocessing modules; vendoring them + Terminal-scale perf validation is its own slice
  (logged in §DONE as an honest gap, not silently skipped).

## Witness claims (real-user-path, puppeteer swiftshader, maths-asserted — templates witness_e2e_move.js)

- **W-E2E-OLVIRT** (§V3+§V4): open Duplex → (a) a node with >OL_CHUNK children renders ≤ OL_CHUNK+1 rows and
  the footer count still reports the REAL total; (b) clicking `show more` adds exactly the next window;
  (c) collapse the storey branch, real-click an element in the canvas → its row is auto-expanded, painted
  active, scrolled into view; (d) pick restyle touches ≤ (prevPainted + selection) rows (instrumented
  counter), never the full row count; (e) no pageerror.
- **W-E2E-OLEYE** (§V1): eye on an ARC leaf → that mesh `visible===false` + framebuffer checksum changes;
  eye again → restored. Eye on a walked DISC node → every `dwDisc` bucket of that disc `visible===false`;
  restore. Hidden mesh is NOT pickable (raycast returns neighbour/null). No pageerror.
- **W-E2E-OLFILTER** (§V2): type a term matching ONE element → that mesh keeps opacity 1, a non-matching
  mesh drops to 0.15 (transparent true), framebuffer changes; clear the box → all opacities restored exactly
  (pre-dim snapshot). No pageerror.
- **W-E2E-SELOUTLINE** (§V5): real-click an element → scene gains exactly one `selOutline` LineSegments with
  >0 edge segments matching that fid; shift-click a second → two outlines, primary vs secondary colours
  differ; click empty space → outlines removed AND geometries disposed (`geometry.attributes` freed count).
  Framebuffer changes when the outline appears. No pageerror.
- **W-E2E-SHADOWS** (§V6): after open, `renderer.shadowMap.enabled===true`, key light `castShadow===true`,
  ≥1 authored mesh `castShadow===true`, ground `ShadowMaterial` plane present; toggling
  `Bonsai.setShadows(false)` changes the framebuffer checksum vs on; lowering `SHADOW_MAX_ELEMENTS` below
  the scene count + re-applying → shadows auto-off + `§SHADOW guard` line in the console log. No pageerror.

## Regression gate

`witness_e2e_olsync.js`, `witness_e2e_instpick.js`, `witness_e2e_move.js`, `witness_e2e_walk_all_disciplines.js`
must stay green (they exercise every seam this batch touches: setActive, hover, pick, walk render, materials).
Logs saved under `modeller/tests/logs/` and READ before any DONE claim.

## §V7 — follow-up slice (items 8 + 10 of §NEEDS-DESIGN, named in the same watchdog assignment)

- **§V7 floating dimension readout (item 8):** ONE reusable canvas-texture `THREE.Sprite` (core build, no
  CSS2DRenderer — not vendored), `depthTest:false` + high renderOrder so it reads over geometry, scaled by
  camera distance to hold constant screen size. Shown DURING every gizmo drag at the live drag point with the
  SAME number the status bar computes (never a second math path): move `ΔX +1.20m` (snapped delta), rotate
  `+15°`, scale `X ×1.25`, grid-drag `A Δ0.60m`. Hidden on commit/cancel/exit. Seam: `dimLabelShow(text,pos)` /
  `dimLabelHide()` + `window.__dimLabel` witness oracle.
- **§V8 R/S shortcuts (item 10): ⛔ BLOCKED — needs the user/Sonnet nod the research spec already flagged,**
  plus a NEW fact found here: the industry `R`=rotate convention COLLIDES with the modeller's existing
  `R`=Insert shortcut (modeller.html SHORTCUTS map + help panel). Arming rotate/scale sub-modes is mechanical
  once keys are chosen; choosing keys (rebind Insert? pick other letters?) is a user-facing UX decision, not
  an EXTRACT. One question: which bindings — (a) keep R=Insert, use e.g. `T`(turn)/`S`(scale), or (b) rebind
  Insert (Blender uses Shift+A) and take R/S?

- **W-E2E-FLOATDIM** (§V7): real move-gizmo drag held mid-drag → a `dimLabel` sprite is IN the scene, its
  text equals the status bar's snapped delta (same number, maths-compared), positioned within the element's
  neighbourhood (≤ diag of the drag), constant-screen-size scale > 0; release → hidden. Rotate ring drag →
  `°` text matches the snapped angle. No pageerror.

## # DONE appendix (fill as items land — every claim needs a § log line)

- 2026-07-03 §V1–§V6 SHIPPED — bim-ootb PR #625 (squash 5715364). Witnesses: W-E2E-OLVIRT 5/5 ·
  W-E2E-OLEYE 5/5 · W-E2E-OLFILTER 4/4 · W-E2E-SELOUTLINE 5/5 · W-E2E-SHADOWS 5/5 (logs
  modeller/tests/logs/w_e2e_*.log). Regression: W-OL-SYNC 6/6 · W-E2E-INSTPICK 7/7 · W-E2E-MOVE 9/9 ·
  W-E2E-WALK-ALL 10/10. Pre-existing env reds (before==after, baseline-verified): bonsai_outliner_live,
  bonsai_outliner_incr_live, bonsai_multiselect_live, bonsai_hover_live. Two real findings measured by
  first-RED witnesses: THREE Raycaster does NOT skip invisible objects (pick paths filter o.visible now);
  r184 deprecated PCFSoftShadowMap (setter coerces to PCFShadowMap).
- 2026-07-03 §V7 SHIPPED (follow-up slice, lane/modeller-polish-4) — floating dimension readout on all four
  drag flavours (move/rotZ/scale/grid). W-E2E-FLOATDIM 6/6 (mid-drag held: ΔX +1.00m == status bar, at the
  ghost ≤5cm, +30° on the ring, hidden on release). Regression: W-E2E-MOVE 9/9 · W-E2E-ROTATE 7/7 ·
  W-E2E-SCALE 7/7 · W-E2E-GRIDSTRETCH 7/7 (logs modeller/tests/logs/). §V8 (item 10 R/S shortcuts) stays
  ⛔ BLOCKED on the key-binding question above.
