# ⚠ DO NOT REMOVE
SCOPE: the browser IFC import records what a file states about its rooms and their finishes, WITHOUT touching the Find panel room injection. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".

## Owner's boundary (2026-11-06)
*"Don't reinvent or overwrite the present Rooms injection in Find panel and its auto inject behaviour."* The first draft wrote `spatial_structure`, which switches the needle off (`nf_tree_lens.js:304`: any non-`RM_` row is real data, never compiled over). Withdrawn before any commit.

## Issue
`viewer/import_worker.js` leaves `IfcSpace` out of the render list on purpose, and a browser-imported DB keeps no record of it. The room numbers and `Pset_SpaceCommon` covering values a Revit file states are lost, though the offline extractor keeps the rooms. Measured on a private Revit-exported set: 92 `IfcSpace` in the file, 0 kept. Nothing can join a room schedule to them.

## Spec
1. **Worker, per file:** read `IfcSpace` as DATA. `spaces`: guid, Name, LongName, ObjectType, PredefinedType, storey by `IfcRelAggregates`, world AABB in the SAME frame as `transforms`. `spaceProps`: `Pset_SpaceCommon` single values on spaces only, `-` kept because a blank finish is a statement.
2. **Builder:** record table `ifc_spaces`; properties in `element_pset_common`, the shared extractor's table. **Never `spatial_structure` or `rel_contained_in_space`.** Not `element_psets`, whose presence drives the civil road panels.
3. **Federated drop, both merge sites (`viewer/import.js`, `import_own.js`):** concatenate per file; `_applySiteIdentityCorrection` shifts a file's recorded rooms with its transforms.
4. **No spaces = no new table.** No existing code reads `ifc_spaces`, so no behaviour changes for anyone.
5. Log: `§IMPORT_SPACES file= spaces= withBox= props= ms=`, `VACUOUS` when the file has none.

## Witness
`viewer/tests/witness_import_keeps_spaces.js` (real worker + builder in node): W0 nothing the injection owns is written; W1 count; W2 no spaces, no table; W3 frame; W4 properties on rooms only; W6 parity with an extractor DB (`PARITY_IFC`, `PARITY_DB`); red control. `witness_import_keeps_spaces_live.js` (software rendering): the Viewer's room state and needle lines are compared with a clean main tree.

## Second part: the walker reads this record (owner's decision 2026-11-07: one record of the rooms a file states, both routes)
**Issue.** A room's long name is what a room schedule hangs on, and it was lost on two of three routes:
| Route | Rooms kept | Long name | What the walker saw |
|---|---|---|---|
| Browser import, `viewer/import_worker.js` | none | lost | only inferred `RM_` rooms, which `spacesOf` excludes on purpose, so 0 rooms |
| Python, `DAGCompiler/python/extractIFCtoDB.py`, offline DBs only, NOT in scope | `spatial_structure` | lost (`sp.Name or sp.LongName`) | rooms labelled by number, so almost none typed |
| Modeller open, `modeller/ifc_open_worker.js` = `ifc_extract_core.js` + `ifc_open_db.js` | removed: the extractor writes `IfcSpace` rows, then `residentRule` deletes them (`ifc_open_db.js:14`) | read (`ifc_extract_core.js:371`, replaces `Name`), then deleted | no `spatial_structure` room rows either, so 0 rooms |

Writing the long name into `spatial_structure.object_type` is not an answer: the Find panel's Type view groups by that field first (`viewer/nf_trees.js:135-139`) and habitability reads it (`viewer/nf_room.js:444-448`).

**Spec.**
1. **`spacesOf` (`modeller/disc_walker.js`) reads `ifc_spaces` first** when the table exists and yields a room with a box. Label: long name, else `object_type`, else `name`. Same filter as the other sources (both sizes over 0.1 m), so a room with a NULL box is skipped. Otherwise the two older sources run exactly as today.
2. **What ships is JS: both JS routes write the record.** File open, load and import never run Python, so `extractIFCtoDB.py` is NOT changed.
   - Viewer and landing import: `viewer/import_worker.js` + `import_db_builder.js`, built.
   - **Modeller open, BUILT 2026-11-07:** `ifc_extract_core.js` writes `ifc_spaces` with the same columns, as an additive table after every existing table (the §L1.6 pattern), only when the file has rooms. `Name` and `LongName` are kept separately at the point where line 371 merges them; `elements_meta.element_name` stays as it is. Box and centre: the room's true world bounds (`§WORLD_BBOX`). **Corrected from this spec's first text (the `element_transforms` row): on this route that row holds a placement origin, not a box centre, up to 3.1 m away on a public file (W-SPACE-RECORD-OPEN R4 failed until this changed).** `residentRule` does not list `ifc_spaces` in `ELEMENT_TABLES`, so the record survives it; `residentRule` itself does not change.
   - **Not decided here, ask the owner:** room finish properties on the Modeller route. `residentRule` deletes rooms' `element_pset_common` rows and W-IFC-OPEN-ONE O3 asserts that, so this route keeps names, not finishes.
3. **Find panel untouched:** the walker only reads, and neither route writes a new row or value to `spatial_structure` or `rel_contained_in_space`.
4. Log: `§DW-SPACE-SOURCE source=ifc_spaces rooms= named= noBox=`, printed only when the record is used.

**Witness, `modeller/tests/witness_space_record.js` (W-SPACE-RECORD).** S1 a real building with no table walks the same placements with the code as with an empty table. S2 only inferred rooms: 0 rooms, and a record gives rooms (red control: the same DB without it). S3 label order. S4 NULL box skipped. S5 the record wins over both older sources. S6 a schedule walk types and serves rooms from the record, and from no other source when given numbers only. S7 the walk leaves `spatial_structure` byte-identical. Prints INCONCLUSIVE when no real building is held. The import witness gains long-name parity with an extractor DB and `KEEP_DB=<path>`, so a real import can go to a real Modeller run.
**Witness, Modeller route, `modeller/tests/witness_space_record_open.js` (W-SPACE-RECORD-OPEN):** the same public IFC through both JS routes gives the same rooms, names, long names and sizes, with one constant frame offset. `spacesOf` on the opened DB gives rooms greater than 0 (red control: drop the table, 0). W-IFC-OPEN-ONE unchanged. Falsifier: a file with no rooms writes no table.

**Status 2026-11-07, all on this tree:** both JS routes write the record. W-SPACE-RECORD-OPEN 15 of 15 (two public IFCs with rooms, one without; frame offset 0, red control 0 rooms). W-SPACE-RECORD 13 of 13. Import witness 15 of 15 on those files. W-SCHED-SOURCE 36 of 36. W-SPACE-TYPE-WORDS 34 of 34. W-IFC-OPEN-ONE: see the PR body for its page leg.
**Find panel check (`witness_import_keeps_spaces_live.js`, public Duplex, software rendering), this tree and clean main:** needle present, press compiles, same 9 compiled rooms, 7 `rooms_meta`, 215 elements, identical names, `§NEEDLE_PERSIST idb=ok`. The only difference is the record: 21 here, none on main, whose "builder recorded" line is the expected control FAIL.
**Limits:** room finishes on the Modeller route stay undecided (above). A DB imported before this has no record, so its schedule walk stays at 0 rooms until it is imported again.
