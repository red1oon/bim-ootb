# ⚠ DO NOT REMOVE
SCOPE: the path from the Modeller's drawn-services walk to the Viewer's film. Drawn ducts and drawn FP equipment are exported as STATED data (two tables in the Viewer DB) and drawn in the film as lines plus labelled markers, with a "drawn-only" view that hides the walked and borrowed meshes. Design lane ruling 2026-11-08, option (A); the owner wants a film at the end. **Read the log after every run: exit code is not evidence. A verdict line prints INCONCLUSIVE, never PASS, when nothing was judged.**
Witness: `viewer/tests/witness_drawn_film_overlay.js` (W-DRAWN-FILM). Builds on `prompts/DISC_WALK_DRAWN_INTEGRATION.md` (the walk) and `prompts/DISC_WALK_DRAWN_MAINS.md`.

## §1 Problem
The walk's drawn ducts are line ops (`params.anchorOnly`, `params.line`, `_dw.kind='drawn-main'`) and drawn FP equipment are anchor-only markers (`_dw.kind='drawn-equipment'`, `meshState='noMesh'`). Neither has a mesh, so `Bonsai.exportViewerDb` (`modeller/viewer_db_export.js`) drops them (`bonsai_ifc.js`: `if (P.anchorOnly) { seedAnchors++; continue; }`), and the bake (`cli_silent_bake.js` -> the Viewer MaxQ pipeline) films nothing drawn. A second gap, found while reading: the export did not carry the opened building's one-frame offset (`georef_offset_*`) at all, because the IFC it builds is already in the local frame and the extractor only writes those rows for a shifted IFC.

## §2 Data (stated values; nothing re-derived, no invented shape)
The Viewer-DB export reads the committed op-log rows and writes, only when a table has rows:
- `drawn_walk_line(sheet, piece, x0, y0, z0, x1, y1, z1, width_drawn_mm, system, basis, label)`. From `params.line`, `_dw.sheet/piece/widthMm/system/heightBasis/heightLabel`. `basis` is the op's HeightBasis: `void-middle` | `exposed-under-structure` | `on-roof-surface`. `width_drawn_mm` is NULL when the reader found no width.
- `drawn_walk_marker(sheet, item, kind, x, y, z, basis, label, ifc_class, object_type)`. From `params.placement` (the owner's mount anchor) and `_dw.sheet/item/itemKind/heightBasis/label/ifcClass/objectType`. `basis` is `owner-stated` for the 1.2 m owner mount. Drawn terminals that DO have a rule-mined mesh are ordinary exported elements (`BIMOOTB_Walk` Provenance `drawn:terminal`); a terminal with no mesh is counted by the walk (`noMesh`) and committed as no op, so it has no row.
- The sheet column is stored and never shown on screen.
- The one-frame offset: the opened building's `project_metadata` rows `georef_offset_x/y/z` and `unit_scale` are copied into the exported DB unchanged (common/georef_frame.js `metadataRows` names them). Coordinates in both tables are in the same local frame as `element_transforms`.
- Mechanism switch: `exportViewerDb({drawn:false})` writes none of this (the witness's red control).
- Log: `§VIEWERDB §DRAWN-TABLES lines=<n> markers=<n> byBasis={...} offsetRows=<n>`.

## §3 Overlay = a film beat, not an engine
Copied from `viewer/cpe_escape_route.js` (its 3D part): objects tracked in an array, `A.scene.add`, `LineBasicMaterial` with `depthTest:false` (the escape route does not use screen-space line width either), `renderOrder` 1005/1006, a named object each, and a teardown that removes and disposes geometry, material and label texture. `viewer/cpe_drawn_services.js` (`setupCpeDrawnServices(A)`):
- `A.drawnServicesApply(on)`: reads the two tables from `A.db`; lines = one `LineSegments`, markers = an octahedron each plus a plate sprite carrying the marker's `label` (never the sheet). Nothing is drawn, and no error is raised, when the tables are absent.
- Log: `§DRAWN-OVERLAY lines=<n> markers=<n> byBasis={...} sceneObjects=<n>` (byBasis counts lines and markers together); with no tables `§DRAWN-OVERLAY lines=0 markers=0 byBasis={} (this DB states no drawn services: nothing drawn)`.
- **Lazy**: no tag in `viewer.html`. `A.drawnServicesEnable(on)` (in `maxq_start.js`) loads the file on first use (the `wing_2d.js` loadScript idiom) and runs overlay + drawn-only together.
- Open hazard, not changed: `maxq_hud_layers.js` `_cease3D` hides unregistered `depthTest:false` objects while a findings beat is up. The overlay is therefore ceased during that beat, as every unregistered shine-through is.

## §4 Drawn-only view and the bake flag
- `A.drawnOnlyView(on)`: hides the walked and borrowed meshes = elements whose `element_pset_common` row `BIMOOTB_Walk / Provenance` does not start `drawn:` (borrowed bands, schedule placements, routed fixtures; this includes the `Provisional=TRUE` ones, see `viewer/provisional_totals.js`). Drawn terminals (`drawn:terminal`) stay. It uses the viewer's own `A.filterByGuids(keep)` isolate and restores the previous filter on off. View only: no data write, no count change.
- Log: `§DRAWN-ONLY hidden={<class>:<n>} hiddenTotal=<n> shown=<n> overlay=<n> elements=<n>`; `VACUOUS` is appended when no `BIMOOTB_Walk` row exists (nothing hidden, nothing proven).
- Bake flag: `cli_silent_bake.js --drawn-services` / `--no-drawn-services` (same tri-state as `--escape-route`), carried as `FLAGS.drawnServices` -> `__maxqBake` flag list in `viewer/maxq_start.js` -> `await APP.drawnServicesEnable(true)` before `start()`. The overlay and drawn-only view hold for the whole film. Log: `§CLI_BAKE_DRAWN_SERVICES drawnServices=<0|1>`. Not run here (no bake, no GPU).

## §5 Witness claims (W-DRAWN-FILM)
Fixture, public only: `IFC/Duplex_ARC.ifc` + a written STR_A (federated), a duct sheet and an FP equipment sheet read by `mains_to_db.js`; opened in the Modeller page as a local .db and walked there with `window.discWalk('ACMV'|'FP')`; exported; opened in the Viewer page. The one-frame offset rows are written into the fixture (Duplex is in its own frame; the made-up map values are those of `witness_drawn_walk.js`'s mapped pair).
- V1 exported tables = the walk's committed lines/markers (counts, 1 mm, basis/system/width/label per row; counts also = the walk's own `§DW-DRAWN-LINES`).
- V2 overlay `§DRAWN-OVERLAY` counts and byBasis = the table rows; the scene holds that many segments/markers/labels; the overlay file is not loaded at page open.
- V3 drawn-only: hidden per class = the DB's non-drawn `BIMOOTB_Walk` rows (independent SQL), every hidden-set batched slot off and every other on, overlay up, element and table counts unchanged.
- V4 RED one `drawn_walk_line` row deleted -> the overlay count drops by exactly one.
- V5 a DB with no drawn tables draws nothing, with no error.
- V6 the offset rows are in the exported DB and equal the opened building's; RED with the mechanism off they are absent.
- Choices: the HeightBasis values `exposed-under-structure` and `on-roof-surface` are passed through unchanged but this fixture only produces `void-middle` (the exposed case needs a floor-less storey fixture; `witness_drawn_walk.js` X covers the walk side). Rows are written only for committed ops, so plan-only pieces (no z) have none.

## §6 RESULT (2026-11-09)
Log `/tmp/claude-1000/logs/dfo3.log` (read). `§W-DRAWN-FILM PASS 12`: V1 (lines 4/4, markers 3/3, worst coordinate delta 0, bases `void-middle` / `owner-stated`, counts also = the walk's `§DW-DRAWN-LINES`), V1b (ops 269 -> 269), V1c, V2a (lazy), V2 (`§DRAWN-OVERLAY lines=4 markers=3 byBasis={"void-middle":4,"owner-stated":3}` = table; scene 4 segments / 3 markers / 3 labels), V3 (`§DRAWN-ONLY hidden={"IfcFlowTerminal":8,"IfcFireSuppressionTerminal":33,"IfcAlarm":1} hiddenTotal=42 shown=220 overlay=7 elements=262` = independent SQL; 42 batched slots off, 219 on; elements 262 -> 262), V3b (off restores), V4 RED (4 -> 3), V5 (nothing drawn, 0 page errors), V6 (4 offset rows equal; RED mechanism off: 0 rows), V0.
Finding: before this change the export carried NO `georef_offset_*` (V6 RED shows 0 rows with the mechanism off); now it does.
Regression, before (clean copy of origin/main 37130e8e, logs `reg_base_*`) and after (`reg_new_*`): W-DRAWN-WALK 75 pass 0 fail -> 79 pass 0 fail (the baseline copy has no .git so its Y RED was INCONCLUSIVE; not a change); W-DRAWN-MAINS 71/0 -> 71/0; W-WALKED-EXPORT INCONCLUSIVE both (the private shed set is absent here); W-E2E-EXPORT-DB 5 pass / 1 fail both (E1 expects 3 menu rows, the menu has 8: failing on main already, unrelated), E4 byte-identical re-export holds.
NOT run: the bake. The `--drawn-services` path (flag -> `__maxqBake` -> `drawnServicesEnable`) is syntax-checked only; it is unproven that `start()` leaves scene objects added before it in place. First thing to read in the first real bake: `§CLI_BAKE_DRAWN_SERVICES`, then `§DRAWN-OVERLAY` and `§DRAWN-ONLY` and whether `sceneObjects` survives.
Open: the exposed / on-roof bases and a lone plan-only fixture are not in this fixture's rows; labels for line rows are the stated `heightLabel` only (NULL for void-middle).

## §7 SPEC (2026-11-09) — the first real bake's two defects + a frame witness (owner rulings relayed by the design lane)
First real bake (a private set, main `c43d5b72`): the overlay was set up, survived `start()` and was still drawing when the closing movement began; then two defects. Owner: (1) *"Exempt drawn services"*, (2) *"Fix, then re-bake"*.
**§7.1 Ending orbit (defect 1, measured).** `maxq_hud_layers.js` `_cease3D` arm 2 (the net) hides every visible depthTest:false object from storey-reveal onset to the end. The overlay is unregistered, so it was hidden for the whole closing movement. Rule:
- `cpe_drawn_services.js` registers each object it adds as the film layer `drawn.services` (`A.filmLayer`, the §FILM_LAYER mechanism). The layer name does not match `ESC_SUPPRESS_RX` (`/^(measure\.|clash\.)/`), so arm 0 never gates it.
- Arm 2 keeps an object whose registered layer tag is in a NAMED list `CEASE_3D_SUBJECT_LAYERS = ['drawn.services']` (the film's subject, not signage) and counts it as `subject=`. The net itself is unchanged: an object with no layer tag, or with any other tag, is hidden exactly as before. `CEASE_3D_EXEMPT_RX` (the escape glow, by name) is untouched, so W-CEASE's "exactly one name exemption" still holds; W-CEASE gains claims for the subject list.
- Log: the sweep line gains `subject=<n>`; one line `§FINDINGS_CEASE_3D subject layer="drawn.services" kept <n> objects (the film's subject, owner 2026-11-09: "Exempt drawn services")` the first time it keeps any.
- Red switch (witness only): `APP.__ceaseSubjectOff = true` empties the list for that call.
**§7.2 Build-up vs drawn-only (defect 2, from a code read; measured first, §7.4 P0).** `tm_render.js` `renderAtTime` sets single-mesh `visible`, batched `setVisibleAt` and instanced matrices from the schedule alone. `filterByGuids` stores its keep-set in `APP.activeGuidFilter` (`panels.js` 862-864) and no `tm_*.js` reads it, so a hidden element reappears when it is built. Rule, the `§REVEAL_DOOR_LEAK` pattern (the TM owns "is it built", the filter owns "is it shown"):
- In all three branches, the TM's show decision is ANDed with `_isoShown(guid)`. That is true when `APP.activeGuidFilter` is not a Set, or when the Set has the guid. Nothing else changes: frontier highlight, shadows, spark positions and DLOD proxy all keep their own conditions; a hidden element is treated like an unbuilt one in that branch's own way (`visible=false` / `setVisibleAt(false)` / zero matrix).
- Merged meshes are not touched by the TM (no guid branch), so `filterMergedMesh` already holds.
- Log (once per change of the isolate's size, not per frame): `§TM_ISOLATE isolate=<n> keptHidden=<n> (the filter owns "shown", the TM owns "built")`.
**§7.3 Frame witness.** In the bake loop, right after `§FRAME_QA`, when `APP.drawnServicesFrame` exists and the overlay is on: `§DRAWN-OVERLAY-FRAME i=<frame> visible=<n>/<objects> hiddenGuidVisible=<n>/<hiddenTotal>`.
- `visible` = overlay objects that are visible with every ancestor visible.
- `hiddenGuidVisible` = elements in the drawn-only hidden set whose TM slot is visible (single mesh visible with its ancestors, batched `getVisibleAt`, instanced non-zero matrix: the `__tmSnapshotVisible` reads).
- `cpe_drawn_services.js` keeps the hidden set as a Set when the drawn-only view is on.
- The re-bake log is then judged frame by frame: `visible` = objects on every frame, and `hiddenGuidVisible=0` on every frame.
**§7.4 Witness W-DRAWN-FILM-FRAME** (`viewer/tests/witness_drawn_film_frame.js`, public, software GL):
- Fixture: a temp copy of the shipped `buildings/Duplex_extracted.db` plus stated rows: 2 `drawn_walk_line`, 1 `drawn_walk_marker`, and `element_pset_common` `BIMOOTB_Walk/Provenance='band'` on every 4th guid (ordered by guid), so the drawn-only view has a hidden set.
- `--db <file>` runs P0 only, read-only, on any DB (the private probe).
- **P0** (the measurement): with the drawn-only view on and the TM primed (`tmActivateForBake`), at cursor fractions 0.25, 0.5, 0.75, 1.0 (`tmSetCursor`), count hidden-set guids visible (`__tmSnapshotVisible`). On main this is > 0 (defect 2 proven); after the fix it is 0 at every sample.
- **P1**: with no isolate, the visible snapshot at each fraction equals the one taken with the fix's AND switched off (`APP.__tmIsolateOff = true`): build-up unchanged when no isolate is active.
- **P2 RED**: with `APP.__tmIsolateOff = true` and the isolate on, hidden-visible > 0 again (the AND is load-bearing).
- **C1**: `_cease3D` with `_findingsHudSuppress=true`: the overlay's 3 objects stay visible (subject=3), while an added unregistered depthTest:false mesh and an added `measure.datum`-registered one are hidden.
- **C2 RED**: `__ceaseSubjectOff` → the overlay is hidden too.
- **F1**: `APP.drawnServicesFrame(i)` returns `visible=3/3 hiddenGuidVisible=0/<n>` at a mid cursor after the fix, and `hiddenGuidVisible>0` with `__tmIsolateOff`.
- Regression: W-DRAWN-FILM, W-CEASE, W-INCR-EQUIV if present, before/after on the same tree.

## §8 RESULT (2026-11-09) — §7 built
Logs read (session scratchpad `dff/`): `base_public.log` (main `7f08bdc5`), `fix_public.log`, `reg_*`, `wdf_*`, `cease_new*`.
- **P0 on main = defect 2 proven:** with the drawn-only view on, hidden elements visible at build-up fractions 0.25/0.5/0.75/1.0 = 47/125/191/237 of 299 (public Duplex fixture). The same read-only P0 on the private film DB was also > 0 at the end of the build-up (number kept out of this file).
- **After the fix: `§W-DRAWN-FILM-FRAME PASS pass=6 fail=0`.**
  - P0: 0/0/0/0 of 299.
  - P2 RED, AND off: 47/125/191/237 again.
  - P1, no isolate: snapshot visible 219/487/819/1076 with the AND on and off, identical.
  - With the fix, visible = main's visible − main's hidden-visible at each fraction (172/362/628/839), so only the hidden elements are removed.
  - C1: subject=3 kept; the unregistered depthTest:false object and a `measure.datum` object are still hidden. C2 RED: subject list emptied → the overlay is hidden.
  - F1: `§DRAWN-OVERLAY-FRAME i=7 visible=3/3 hiddenGuidVisible=0/299`, and 191/299 with the AND off.
  - 0 page errors.
- **W-CEASE 35/0 → 39/0**, 4 claims added for §CEASE_SUBJECT. The 2 mechanism claims go WRONG on main's code (37/2), the red control; the 2 guards hold either way.
- **Regression, base vs fix:** W-DRAWN-FILM 12/0 = 12/0 (the first base run timed out cold at its Modeller wait, the re-run gave 12/0; the Modeller files are identical on both trees); W-DLOD-TM-OWNERSHIP 4/0 = 4/0; W-RWB 22/0 = 22/0; W-TM-DRAWN-VS-SCHEDULED 4/2 = 4/2 (the 2 fail on main already, unrelated). ESLint clean on the changed files.
- `cpe_drawn_services.js?v=2`, sw `v1704`.
- **Found:** `A.filmLayer` is attached only inside `start()`, but `drawnServicesEnable` runs before it. A plain `if (A.filmLayer)` registration would silently do nothing, so `drawnServicesEnable` attaches the same function first.
- **NOT run:** the re-bake (GPU, next). Judge it by `§DRAWN-OVERLAY-FRAME` on every frame: `visible` = objects, `hiddenGuidVisible=0`.
