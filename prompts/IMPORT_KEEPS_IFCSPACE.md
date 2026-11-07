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
