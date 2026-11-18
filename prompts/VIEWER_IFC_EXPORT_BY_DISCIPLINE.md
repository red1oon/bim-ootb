# ⚠ DO NOT REMOVE
SCOPE: the Viewer's **Save as IFC** exports a SELECTION (by discipline, by class, or the current Find/isolate set) as a valid add-on IFC that a receiving team overlays on its own model. It is the in-browser equivalent of the add-on exports built by `BIMCompiler scripts/lod/export_parts_ifc.py` (LOD400_DEFAULT_RULES_SCOPE.md §9) and the 2026-11-17 delta IFC. Spec only (owner 2026-11-18: *"Spec that Viewer can export by discipline selection to achieve as done"*). Read the log after every run; the exit code is not evidence.

## 0. OWNER DECISIONS 2026-11-18 (govern every section below; read first)
Owner, verbatim: *"The separate optional Viewer export as IFC should be in conjunction with Find Panel selection. It serves a general good purpose."* · *"Export button at the moment is DB, it should have IFC and BCF?"* · *"agree"* (to: one Export menu, IFC by Find selection, BCF, one shared writer).
**Measured today (origin/main):** the toolbar pill **Save Building** (`viewer/panels.js` `id:'save'`, Ctrl+S) writes a `.db` only; IFC is reachable only from the **Share** sheet ("Save as IFC", `share.js saveAsIFC` -> `A.exportIFC`, whole DB, `ifc_export_worker.js`); BCF only from the Issues panel toolbar ("Export BCF", `bcf_export.js A.exportBcf`). Find isolates through `A.filterByGuids(set)` and keeps the set in `A.activeGuidFilter`.
1. **One Export menu on the toolbar** (the Modeller's Export pill is the model): **Building (.db)** (today's Save Building, unchanged, Ctrl+S kept) · **IFC** · **BCF (issues)** (calls `A.exportBcf`; disabled with its reason when there are no saved issues). The Share sheet's "Save as IFC" calls the same IFC export, never a second writer.
2. **IFC selection = Find.** The IFC item offers two choices only: **Whole building**, or **What Find has isolated** (`A.activeGuidFilter`; disabled with "Find and isolate first" when none). Discipline / class / storey are chosen with Find's own lenses, not a second chooser (supersedes §2.1's multi-selects). The dialog states the count before export and the file's description states the selection.
3. **One writer.** The Viewer writes IFC through the Modeller's proven writer `modeller/lod/lod_ifc.js` (GlobalIds, classes incl. IfcReinforcingBar / fasteners / assemblies / parts, materials, Pset, IFC2X3 or IFC4, frame JSON, storeys, determinism, mesh checks; parity-tested in W-LODUP-IFC), with a general element input (any class; the mesh read by `modeller/lod/lod_reader.js` from the Viewer's own sql.js DB, monolith or meta+geo split). `ifc_export_worker.js` is retired once the witness passes (deletion budget: its callers move to the shared writer). A class the writer does not map yet is written as IfcBuildingElementProxy and COUNTED in `§IFC_EXPORT_SEL` (never dropped silently).
4. **Tip and status in plain words**, like the Modeller's Export (IFC): the item's tip says what goes in ("the whole building" / "the N elements Find has isolated"); the status line after export: "IFC (IFC4): N elements, X MB"; file `<building>_IFC4.ifc` / `<building>_selection_IFC4.ifc`.
**Revised order of work (replaces §4):** (a) the Export menu + BCF item (no new writer); (b) the shared writer generalised for any element (class map + proxies counted) and adopted by the Viewer, Whole building first, W-IFC-EXPORT-SEL S2/S6 + a whole-building parity count; (c) "What Find has isolated" + S1 + `§IFC_EXPORT_SEL`; (d) parts / materials / psets S3/S4 and S5 parity against the add-on files; (e) retire `ifc_export_worker.js`. One PR each, spec RESULT appended each time.

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
