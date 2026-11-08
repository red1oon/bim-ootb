# ⚠ DO NOT REMOVE
SCOPE: ONE FRAME. A file opened on either IFC route lands in one frame: a local origin plus a recorded offset (owner, 2026-11-08: *"Local + recorded offset"*). Then (B), the export writes that offset back. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".

## §1 Issue (measured)
- **Precision:** the Modeller IFC open route keeps raw map coordinates; the Viewer import shifts to a local origin. At map coordinates (x ≈ 465 km, y ≈ 2,766 km), world-scale float32 loses up to 1.6 cm in x and 12.5 cm in y. That float32 lives in the scene meshes and the export (`modeller/bonsai_library.js:87,100` `place()` → `bonsai_ifc.js` `triFaceSet`).
- **Proof:** W-EXPORT-ROUNDTRIP far leg, PR #2708. `§RT-PRECISION float32 on x and y CONFIRMED`: max |dx| 0.0134 m against a half-step of 0.0156; max |dy| 0.1165 against 0.125. Local Duplex: all within 1 mm.
- **Effect on the private set:** 1,284 of 4,147 elements moved more than 1 cm through export.
- **Two frames:** the two routes give one file two frames, so a camera path or grid made on one route does not sit on the other.

## §2 Rule (A): open route, built first
1. **ONE implementation.** Lift the import's rebase rule (`viewer/import_worker.js` ~700-755: the per-axis > 10 km test, the whole-metre offset, the federation pin, the > 1 km disagreement fallback) into a shared module under `common/`. Both routes call it. The import's behaviour must not change (same offsets, byte-identical DB on the residents). No second copy in the open route.
2. **Shift EVERY world-coordinate column of the opened DB.** Columns are found by a sweep of the DB's tables and names (`center_*`, `x0/y0/x1/y1`, `minX..maxZ`, `door_operation` x/y/z, `ifc_spaces` centres, `ifc_grid_axis` ends, `element_world_bbox`; `storey_elevation` only if z shifts), not by a hand list. Element-local geometry blobs do not move.
3. **Record** `georef_offset_x/y/z` in `project_metadata`, exactly as the import does.
4. **Read the site facts, never invent them:**
   - IfcSite RefLatitude/RefLongitude (compound angles) → `site_latitude` / `site_longitude`;
   - true north from the geometric context's TrueNorth;
   - IfcMapConversion (IFC4) if present;
   - the source recorded as `site_latlong_source`, the way the import names it (restore it on the import too where it is empty today).
5. **Federation:** files opened together (e.g. ARC + STR) share one pin, as the import does.

## §3 Witness W-ONE-FRAME (`modeller/tests/witness_one_frame.js`)
- **F1** the same file on both routes gives IDENTICAL `georef_offset_x/y/z`. Public fixture: Duplex with its site placement shifted far, the RT_FAR method of W-EXPORT-ROUNDTRIP. The private set is checked by the design lane.
- **F2** sweep denominator: every world-coordinate column found (printed as table.column) is shifted by the offset, X of N. Red control: one table left unshifted turns F2 red.
- **F3** precision: W-EXPORT-ROUNDTRIP far leg after (A). Centre differences fall to within 1 mm, and the bbox volume holds within 1% on all matched elements.
- **F4** site facts as the file states them (lat/long/true north), with their source; a file with none records none.
- **F5** a local file (all axes < 10 km) is unchanged: offset 0, DB byte-identical to main.
- **F6** W-IFC-GRID, W-IFC-OPEN-ONE and W-IFC-STOREYS stay green.
- **Film tie-in assert** (design lane runs it on the private set): offset equal on both routes, and the corrected film DB's camera path points fall inside the building bbox in the open-route frame.

## §4 Rule (B): export. After (A)
Write the recorded offset back: IfcMapConversion on IFC4, or the IfcSite placement on IFC2X3. Geometry stays local. Round trip: a re-open on either route gives back the same offset, and the original map position to 1 mm.
