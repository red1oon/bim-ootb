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
