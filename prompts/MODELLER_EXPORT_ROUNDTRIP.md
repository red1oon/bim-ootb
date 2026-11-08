# ⚠ DO NOT REMOVE — MODELLER_EXPORT_ROUNDTRIP

**Scope:** MEASUREMENT ONLY. Does what the Modeller assembles (Open, then Walk ALL) survive the shipped IFC export and a re-open through the same open route? Witness `modeller/tests/witness_export_roundtrip.js` (W-EXPORT-ROUNDTRIP). No fix is made here; GAP is the expected finding, not a failure.
**Read the log after EVERY run** (`§RT` lines, `§RT-CONTROL`, `§RT-HEAP`). Exit code 0 only says the harness did not break; it is not evidence.
Parent spec: bim-compiler `prompts/MODELLER_MASTER.md` `## §EXPORT-ROUNDTRIP` (owner's queue item 2). Private results never go in this repo: run with `RT_DB=<path>` / `RT_IFC=<path>` on a private file and keep the log outside the repo.

## Issue it exposes
"What the Modeller holds does not reach the hand-off IFC." G2 measured this on a private set: 0 `IfcBuildingStorey`, none of the routed runs, 2,323 of 6,461 elements. This witness re-measures on public residents, per claim, as X of N.

## Chain
1. A = the building as the page holds it after Open and Walk ALL: the opened building DB (`window.__dwBuf`, tables as the extractor wrote them) plus the op-log (`Bonsai.oplog._geomOps()`: seeded inserts and walked `params._dw` fixtures/runs).
2. Export = the shipped path: `Bonsai.ifc.build()` (what Export > IFC calls through `exportModel`).
3. B = those bytes re-opened by the SAME route: `modeller/ifc_open_db.js` + `dxf2bim/ifc_extract_core.js` in node (as W-IFC-GRID / W-IFC-OPEN-ONE). File-text facts (storeys, containment, IfcSpace, ports, site lat/long) are read from the exported text.

## Claims (each `§RT <claim> X of N`; N from A; PASS iff X = N, GAP otherwise, INCONCLUSIVE iff N = 0)
- C1 elements per IFC class (X = min(B, A) per class; classes only in B listed as extra).
- C2 elements per discipline.
- C3 storeys: `IfcBuildingStorey` in the file vs A storeys; A elements contained in a storey (vs in the building directly); per-storey element counts.
- C4 carried tables, rows A vs B: `storey_elevation` (and elevations equal), `ifc_grid_axis` (VACUOUS when A has none), `ifc_spaces` / IfcSpace in the file, `rel_fills_host`, `element_type`, `element_pset_common` (all), `BIMOOTB_Walk` and `Provisional` rows (per walked fixture), `rel_aggregates`.
- C5 routed runs: walked ops without `_dw.ifc` (pipe/duct segments, fittings) vs B class counts of those classes; swept solids and ports counted in the file text (ports are not held in the op-log: A side stated n/a).
- C6 position: GlobalId survival (A guids found in B), then for matched elements the world-bbox centre difference (median, max, metres). Matching is by GlobalId first, else same class + nearest centre within 2 m (labelled `fallback`). Walked fixtures: A centre from `Bonsai.library.foldInsert` (the renderer's own fold, never re-derived).
- C7 frame: every `project_metadata` key of A equal in B; site RefLatitude/RefLongitude, IfcMapConversion, IfcProjectedCRS of the SOURCE file present in the export.
- C8 RED CONTROL: the same model exported with ONE seeded element removed from `_geomOps`. C1 for that class must show B-1 (GAP, chosen from a class that PASSES in the main run) and no other class may change. If it does not, the instrument is blind: `§RT-CONTROL BLIND`.

## Harness rules
Software GL only. No GPU, no bake. Walk ALL needs the rules mesh from object storage; if it cannot complete, walk claims print INCONCLUSIVE with the reason, never PASS. Source DB/IFC never written. Heap (`performance.memory`) and timing logged at the end.
Usage: `node modeller/tests/witness_export_roundtrip.js > /tmp/rt.log 2>&1` (`RT_IFC=<ifc>[,<ifc>]`, `RT_DB=<db>`, `RT_NOWALK=1`).

## RESULT 2026-11-08
Run: `node modeller/tests/witness_export_roundtrip.js`, tree origin/main `8d1ede96`, public Duplex (`IFC/Duplex_ARC.ifc`) and SampleHouse (`IFC/SampleHouse_ARC.ifc`), Open then Walk ALL, software GL. Log: `/tmp/rt_out/rt_run2.log` (outside the repo). Numbers below are from that log only. Totals: PASS=7 GAP=36 INCONCLUSIVE=5; exit 0; 0 page errors; page heap 177 MB (Duplex) / 110 MB (SampleHouse); 40.8 s wall.
A (Duplex) = 218 element rows of the opened DB + 177 walked fixtures (ACMV 19, ELEC 102, PLB 18, FP 38 of which 38 provisional) = 395. A (SampleHouse) = 60 + 24 walked = 84.
Instrument fixes found on the first full run, before this table: C4 `element_pset_common` passed 215 of 215 because B's 531 rows were the export's own `BIMOOTB_Walk` rows (177 x 3); it now counts only rows outside that set. C7a no longer counts keys the witness itself forces (`building_name`, `source_file`) or `import_date`.

| Claim | Duplex | SampleHouse |
|---|---|---|
| C1 elements per class (total) | 317 of 395 GAP | 46 of 84 GAP |
| C2 elements per discipline | 234 of 395 GAP | 38 of 84 GAP |
| C3a `IfcBuildingStorey` in the file vs storeys A holds | 0 of 4 GAP | 0 of 2 GAP |
| C3b elements naming a storey, contained in one (file: 373 / 62 directly in the building) | 0 of 146 GAP | 0 of 20 GAP |
| C3c per-storey counts | 0 of 146 GAP | 0 of 20 GAP |
| C4 `storey_elevation` rows / values | 0 of 4 / 0 of 4 GAP | 0 of 2 / 0 of 2 GAP |
| C4 `ifc_grid_axis` | 0 of 0 INCONCLUSIVE (VACUOUS, A has no grid) | same |
| C4 `ifc_spaces` / `IfcSpace` in the file | 0 of 21 GAP / 0 of 21 GAP | 0 of 4 / 0 of 4 GAP |
| C4 `rel_fills_host` | 0 of 50 GAP | 0 of 7 GAP |
| C4 `element_type` | 0 of 38 GAP | 0 of 7 GAP |
| C4 `element_pset_common` (outside `BIMOOTB_Walk`) | 0 of 215 GAP | 0 of 79 GAP |
| C4 `BIMOOTB_Walk` set on walked fixtures | 177 of 177 PASS | 24 of 24 PASS |
| C4 `Provisional=TRUE` rows | 38 of 38 PASS | 0 of 0 INCONCLUSIVE |
| C4 `rel_aggregates` rows / pairs by GlobalId | 0 of 15 / 0 of 15 GAP (11 element-level) | 0 of 28 / 0 of 28 GAP (26 element-level) |
| C5 routed runs | 0 of 0 INCONCLUSIVE (VACUOUS) | same |
| C6a GlobalId of A elements found in B | 0 of 218 GAP | 0 of 60 GAP |
| C6b element with a same-class element within 2 m (all by nearest-centre fallback) | 373 of 392 GAP | 48 of 82 GAP |
| C6c/C6d centre difference of the matched | median 0.0000 m, max 0.0000 m; 373 of 373 within 1 cm PASS | same; 48 of 48 PASS |
| C7a `project_metadata` keys carried | 0 of 1 GAP (`project_name` 0001 -> "Bonsai model") | 0 of 1 GAP ("Project Number" -> "Bonsai model") |
| C7b frame facts the source states (IfcSite lat, lon) | 0 of 2 GAP | 0 of 2 GAP |
| C8 red control | SEES IT: IfcFurnishingElement 61 -> 60, nothing else moved, C1 317 -> 316 | SEES IT: IfcPlate 6 -> 5, C1 46 -> 45 |

C1 rows that GAP, Duplex: `IfcWallStandardCase` 0 of 56 (written as `IfcWall`, which then reads 57 for A's 1: relabel), `IfcBeam` 0 of 8, `IfcFooting` 0 of 7, `IfcMember` 0 of 4 (the 19 STR rows), `IfcRoof` 0 of 1 and `IfcStair` 0 of 2 (no geometry). SampleHouse: `IfcFurniture` 0 of 14 (read back as `IfcFurnishingElement`), `IfcWallStandardCase` 0 of 2, `IfcMember` 0 of 20, `IfcCurtainWall` 0 of 2.
C2: walked ELEC/ACMV/PLB discipline is lost (Duplex ELEC 0 of 102, ACMV 0 of 19, PLB 0 of 18; B reads all 139 as `MEP`); FP 38 of 38.
Not measurable here: C5 (no drawn mains on a public file, `§WALK-MAINS none reason=no sheet held`, so no routed runs exist to export; swept solids and ports in the file are 0 and 0; ports are not held in the op-log); C4 grid (no public IFC states a grid); a private leg (`RT_DB`, later, results stay out of the repo).
The walk label survives (C4 BIMOOTB_Walk, Provisional) and positions of what is exported are exact; everything the Modeller holds about structure, identity and context does not.
