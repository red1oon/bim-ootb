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
