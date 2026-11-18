# ⚠ DO NOT REMOVE
SCOPE: the Viewer's **Save as IFC** exports a SELECTION (by discipline, by class, or the current Find/isolate set) as a valid add-on IFC that a receiving team overlays on its own model. It is the in-browser equivalent of the add-on exports built by `BIMCompiler scripts/lod/export_parts_ifc.py` (LOD400_DEFAULT_RULES_SCOPE.md §9) and the 2026-11-17 delta IFC. Spec only (owner 2026-11-18: *"Spec that Viewer can export by discipline selection to achieve as done"*). Read the log after every run; the exit code is not evidence.

## 1. Today (measured on origin/main, `viewer/ifc_export_worker.js` + `viewer/import.js`)
- Exports the WHOLE DB, IFC4 only.
- One IfcTriangulatedFaceSet per element via a mapped item.
- Colour only: no IfcMaterial, no property sets.
- Every product written with 8 attributes where IFC4 has `PredefinedType`: ifcopenshell.validate flags each one.
- Classes not in its map fall back to IfcBuildingElementProxy: IfcMechanicalFastener, IfcFastener, IfcReinforcingBar, IfcElementAssembly.
- No parent/part relation (`element_parts` ignored).
- Coordinates in the DB frame.
- Project/site/building GlobalIds random per export.
- Element GlobalIds were fixed 2026-11-18 (#3219: unique, stable, valid).
- Unmerged older work on the same file: branch `fix/ifc-export-schema` (2026-10-02) holds a schema-validity fix and a source timestamp.

## 2. Rule (target)
1. **Selection:** the export dialog offers
   - "Whole model";
   - "Discipline" (multi-select from `elements_meta.discipline`, with counts);
   - "Class" (multi-select, counts);
   - "Current Find / isolate result" (`A.activeGuidFilter`).
   
   The selection is ANDed. The dialog shows the element count before export.
2. **Schema:** IFC4 (default) or IFC2X3, so the file opens next to Revit-era models.
3. **Classes:** the map gains IfcReinforcingBar, IfcMechanicalFastener, IfcFastener, IfcElementAssembly, IfcBuildingElementPart.
   - Every product is written with its full attribute list for the chosen schema, `PredefinedType` included.
   - IfcReinforcingBar: NominalDiameter, CrossSectionArea, BarLength, BarRole/PredefinedType.
4. **Relations:** `element_parts` → IfcRelAggregates (host → parts). An exported part whose host is not in the selection references the host's GlobalId in a pset, never a dangling relation.
5. **Materials and psets:**
   - IfcMaterial from `material_name`, with one IfcRelAssociatesMaterial per material.
   - Properties from `element_pset_common` (pset, name, value).
   - Pset `BIMC_Upgrade` from the `upgrade_changes` row (rule, detail, host) when that table exists.
6. **Frame:** if the DB records a site frame (`site_normalization` offsets / a project site placement), the file carries it as the IfcSite placement, so the add-on overlays the author's shared coordinates. Otherwise the DB frame is used, and that is stated in the file description.
7. **Determinism:**
   - Header timestamp from the source (`project_metadata`) or a fixed epoch, logged.
   - Project, site, building and storey GlobalIds derived from names, not random.
   - Two exports of the same selection are byte-identical.
8. **Log:** `§IFC_EXPORT_SEL mode=... disciplines=[...] classes=[...] selected=N written=N byClass={...} schema=... frame=site|db`.

## 3. "As done" acceptance (the witness is the definition of done)
W-IFC-EXPORT-SEL (`viewer/tests/witness_ifc_export_sel.js`, node, the worker run in a vm as in W-IFC-GUID):
- **S1 SELECT:** discipline/class/isolate selection on a fixture gives the exact expected element set.
- **S2 VALID:** `ifcopenshell.validate` reports 0 errors on IFC4 and on IFC2X3 output (python half SKIPs if ifcopenshell is absent).
- **S3 PARTS:** host → part aggregation round-trips (count of IfcRelAggregates = hosts with exported parts).
- **S4 MATERIAL / PSET:** every product has one material, and a fixture pset value round-trips.
- **S5 PARITY (real, optional, `$EXPORT_REAL_DB` + `$EXPORT_REF_IFC`):** exporting the rebar selection of an upgraded DB in IFC2X3 gives the same class counts and GlobalIds as the reference add-on IFC from `export_parts_ifc.py`. Every part's bbox must agree within 1 mm. This is the "as done" check.
- **S6 DETERMINISM:** two exports give the same SHA-256.
- Break switch: drop `PredefinedType`, so S2 must FAIL.

## 4. Order of work (each a PR, spec section first)
1. Rebase `fix/ifc-export-schema` onto main, keeping the #3219 `toIfcGuid`; this lands schema validity.
2. Class map + full attributes + IfcReinforcingBar fields.
3. Selection dialog + `§IFC_EXPORT_SEL`.
4. Materials, psets, `element_parts`.
5. IFC2X3 option + site frame + determinism.
6. S5 parity against the §9 add-on files.

## (a) SPEC — the Export menu + BCF item (2026-11-18; belongs under §0 of PR #3296, placed here so the two PRs do not collide)
**Issue this proves or disproves:** *"a user cannot find IFC or BCF export from the toolbar."* Measured before: the toolbar pill `id:'save'` ("Save Building") writes a `.db` only; IFC is behind Share (imports only), BCF behind the Issues panel.
**Scope:** no new writer, no IFC selection, `modeller/lod/lod_ifc.js` and what the IFC export writes are untouched.
1. **One pill.** `id:'save'` keeps its id (`#pill-save`, the saved order, `wing_2d.js`) and its Ctrl+S binding (`scene.js` still calls `A.saveModelDb` directly). Its visible name becomes **Export** (dictionary rows `pill_export`, `pillc_export_1..3`, new rows, via a `trlKey` on the entry); a tap opens a small menu in the Modeller Export pill's idiom (`modeller.html initExportMenu`: same panel, hover row, outside-click close).
2. **Items (exactly three):** **Building (.db)** = `A.saveModelDb` (unchanged) · **IFC (whole building)** = `A.exportIFC` (unchanged worker; step (b) replaces the writer) · **BCF (issues)** = `A.exportBcf`.
3. **IFC input:** `A.exportIFC(key)` reads an IndexedDB import record. For a building opened from a file it gains an optional second argument `{dbBytes}` (the open single-file DB's own bytes) so the same worker runs; a split building (meta + geo) is greyed with its reason until step (b).
4. **BCF** is greyed with the reason **no saved issues** when `A._getAllIssues()` holds none for the open building.
5. **Log:** every user-visible action prints `§VIEWER_EXPORT_MENU open=… items=…` or `§VIEWER_EXPORT_MENU item=<db|ifc|bcf> …`.
**Witness W-VIEWER-EXPORT-MENU** (`viewer/tests/witness_viewer_export_menu.js`, real Viewer page, software GL, § lines and page state only): E1 the menu lists exactly db / ifc / bcf; E2 Building (.db) reaches `A.saveModelDb` and writes a `.db` named for the building; E3 IFC reaches `A.exportIFC` and a `.ifc` download starts; E4 BCF is disabled with its reason with no issues, and after one issue is saved through the page's own `A._saveIssueToLog` it downloads a `.bcfzip`; E5 Ctrl+S still saves; E6 the pill name is Export in `en_US` and the label resolves in `de_DE`. INCONCLUSIVE when the page never became ready or the menu never opened. Red control: `EXPORT_MENU_RED=nobcf` hides the BCF item, so E1/E4 must FAIL.

## (a) RESULT — 2026-11-18 (bim-ootb `feat/viewer-export-menu`; witness log `viewer/tests/logs/witness_viewer_export_menu.log`, read, not just the exit code)
Built: `viewer/export_menu.js` (the menu, Modeller Export idiom), pill `id:'save'` -> name **Export** with `trlKey:'export'` (`panels.js _relabelPill`; `viewer/tools/help_records.js` and W-VIEWER-I18N (3c) read the same override), `A.exportIFC(key, {dbBytes})` (`import.js`, one optional argument; the worker and what it writes are unchanged), 9 new dictionary rows 1001091-1001099 in 14 locales (`viewer/tools/trl_batch_2026-11-18_export_menu.js`, machine, labelled), `howto.json` + 18 help indexes rebuilt, `sw.js` v1755.
Measured (GardenWorld warehouse DB, software GL, real mouse + real Ctrl+S):
- `§VIEWER_EXPORT_MENU open=true items=3 enabled=db,ifc blocked=bcf:no_saved_issues`
- E1 rows = `db,ifc,bcf`; pill title `Export` · E2 `§SAVE_DONE mode=download name=GardenWorld.db bytes=81920`, file starts `SQLite format 3` · E3 `§EXPORT_IFC key=GardenWorld size=46KB`, `GardenWorld.ifc` 47560 B, `ISO-10303-21;` IFC4
- E4a `§VIEWER_EXPORT_MENU item=bcf blocked reason=no_saved_issues` (no file) · E4b after one issue `§BCF export topics=1 withSnapshot=1 zipB=2546`, `GardenWorld.bcfzip` starts `PK`
- E5 `§KBD_ROUTE Ctrl+S → save` -> `§SAVE_DONE mode=download` · E6 de_DE: pill `Exportieren`, `Gebäude (.db)`, `keine gespeicherten Probleme`
- `§W-VIEWER-EXPORT-MENU PASS 8 of 8 red=none`; red control `EXPORT_MENU_RED=nobcf`: `FAIL failed=[E1,E4a,E4b] of 8`.
Found on the way: a warehouse building auto-engages the pick-walk (`wh_walk.js §C-1`), which hides the whole pill and its trigger until the walk's X is pressed; the witness leaves the walk with its own X like a user. Not changed here.
Known limits: IFC is greyed (reason in the row) for a split meta+geo building or one without `element_instances`/`component_geometries`; step (b) removes that. The guide link of the Export pill in the How To palette now resolves to the guide's "Issues" section (the only place the live guide says "Export" twice); the guide has no Export section yet.
