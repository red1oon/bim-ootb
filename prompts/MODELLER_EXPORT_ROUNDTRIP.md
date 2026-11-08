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
- C9 (added 2026-11-08, design lane): (a) GlobalId stability = C6a; (b) geometry per matched element: vertex count and bbox volume within 1%, from the re-open DBs (pairs = GlobalId, else same class + nearest centre, so a pairing error would show as a volume mismatch); (c) `material_name` and `material_rgba` per matched element, re-open DBs; (d) storey elevation values = C4; (e) `georef_offset_*` keys (re-open DBs), true north (file text, source states it vs export); (f) `Pset_SpaceCommon` property sets, N from the source text because the open rule drops IfcSpace rows from A, B counted in the export file text; (g) `IfcOpeningElement` and `IfcRelVoidsElement` in the export text vs the openings A holds (distinct `rel_fills_host.opening_guid`; op-log GEOM_CUT also logged); (h) length unit of source vs export, file text; (i) walked runs in an `IfcDistributionSystem` / with ports, file text (N = walked runs, VACUOUS on public files; walked fixtures in a system measured too).
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

### RESULT 2026-11-08 addendum, C9 (log `/tmp/rt_out/rt_run3.log`; whole run PASS=10 GAP=50 INCONCLUSIVE=14, exit 0, red control still SEES IT on both)
| Claim | Duplex | SampleHouse | How measured |
|---|---|---|---|
| C9a GlobalId stability | 0 of 218 GAP | 0 of 60 GAP | re-open DBs (= C6a) |
| C9b vertex count per matched element | 33 of 196 GAP | 2 of 24 GAP | re-open DBs; pairs by nearest centre (no GlobalId survives) |
| C9b bbox volume within 1% | 196 of 196 PASS | 24 of 24 PASS | re-open DBs (also confirms the pairing) |
| C9c `material_name` | 0 of 0 INCONCLUSIVE (A holds no names) | same | re-open DBs |
| C9c `material_rgba` | 52 of 196 GAP | 10 of 24 GAP | re-open DBs |
| C9d storey elevation values | 0 of 4 GAP | 0 of 2 GAP | = C4 |
| C9e `georef_offset_*` | 0 of 0 INCONCLUSIVE (local model) | same | re-open DBs |
| C9e true north | 0 of 0 INCONCLUSIVE (source does not state it) | 0 of 1 GAP | file text |
| C9e site lat/long | 0 of 2 GAP | 0 of 2 GAP | = C7b, file text |
| C9f `Pset_SpaceCommon` | 0 of 21 GAP | 0 of 4 GAP | N from source text, B from export text |
| C9g `IfcOpeningElement` in file / `IfcRelVoidsElement` | 0 of 50 / 0 of 50 GAP | 0 of 7 / 0 of 7 GAP | file text; op-log GEOM_CUT = 0 on both (the opened model holds openings only as `rel_fills_host`) |
| C9h length unit export = source | 1 of 1 PASS (metre) | 0 of 1 GAP (source millimetre, export metre; positions already agree, C6d) | file text |
| C9i runs in a system / with ports | 0 of 0 / 0 of 0 INCONCLUSIVE (no runs on public files) | same | file text |
| C9i walked fixtures in an `IfcDistributionSystem` | 0 of 177 GAP | 0 of 24 GAP | file text (`IfcDistributionSystem` = 0) |
The vertex-count GAP is re-tessellation on re-open (triangulated face set vs the extractor's mesh), not lost shape: bbox volume matches on every matched element.

## RESULT 2026-11-08 far-coordinate leg (`RT_FAR=dx,dy`; log `/tmp/rt_out/rt_far2.log`)
Why: a real file at map coordinates (hundreds of km from the origin in x and thousands in y) showed 1,284 of 4,147 matched elements moved over 1 cm and bbox volume within 1% on only 181 of 1,371. Hypothesis: float32 precision at large coordinates.
Instrument: the witness copies public `IFC/Duplex_ARC.ifc` to a temp dir and edits STEP text only: a new `#39115=IFCCARTESIANPOINT((dx,dy,0.))` is appended and the site's `IfcAxis2Placement3D #38272` Location is repointed from the shared origin point `#3` (`(0.,0.,0.)`, used by other placements, so it is left alone) to it. Site `#38274` -> placement `#38273` -> axis `#38272`. C6d's denominator is now every A element with a position (an element with no same-class element within 2 m is a mismatch, not a move): local Duplex C6d reads 373 of 392 GAP, was 373 of 373 (the 19 are the no-geometry and STR rows, as in C6b).
| Duplex | local | far (500000, 3000000) |
|---|---|---|
| centre distance | <=1 mm 373 / all others 0 | <=1 mm 173, <=1 cm 15, <=3 cm 62, <=6 cm 73, <=10 cm 33, <=50 cm 15, >50 cm 0 (371 matched) |
| \|dx\| | all 373 <=1 mm | <=1 mm 185, <=1 cm 170, <=3 cm 16; max 0.0134 m; float32 half-step at x 0.0156 m |
| \|dy\| | all 373 <=1 mm | <=1 mm 178, <=1 cm 24, <=3 cm 49, <=6 cm 73, <=10 cm 33, <=50 cm 14; max 0.1165 m; half-step at y 0.125 m |
| \|dz\| | all <=1 mm | 368 <=1 mm, 3 above 1 cm, max 0.4973 m (z is a few metres: not float32; looks like 1-3 mispaired same-class neighbours) |
| C6d within 1 cm | 373 of 392 | 188 of 390 |
| C9b bbox volume within 1% | 196 of 196; deviation all <=0.1% | 24 of 196; <=1% 24, <=5% 47, <=10% 13, <=50% 93, >50% 19 |
`§RT-PRECISION [Duplex_FAR] float32 on x and y CONFIRMED`: measured max sits at 0.86 x half-step on x and 0.93 x on y. The far copy reproduces the real file's moves, so large-coordinate float32 is the cause, not the centre rule.

### Float32 paths world coordinates pass through (code read only, nothing changed)
- WRITE side, the cause: `bonsai_library.js:87` and `:100` (`place()`: `new Float32Array(positions.length)`, then `out[i] = cs*x - sn*y + ox` and the quaternion branch `out[i] = v.x + ox`). The world position is added to the local vertex and stored as float32 at world scale. `foldInsert` returns these arrays; `bonsai_ifc.js` `_build` seeded branch (`:~260-263`, `_arrMesh(fo.positions, ...)` for carried rows, and the scene mesh `geometry.attributes.position` for seeded ones) copies them into `IfcCartesianPointList3D` (`triFaceSet`, `bonsai_ifc.js:~236-246`) with no recentring and no placement. Scene meshes are three.js float32 BufferGeometry.
- Seed: `arc_editable.js:79` (`new Float32Array(vb.buffer, ...)`, slide hosts: blob-local, recentred by `RealGeometry.recenter`, small values); the element centre is `center_xyz` from `element_transforms` (double), added back in `place()` above (`ox`, `oy`, `oz`, `rotAnchor` returns doubles).
- Open route (extractor): `dxf2bim/ifc_extract_core.js:459-460` `GetVertexArray` returns web-ifc's float32 vertex buffer (element-local); `:475-482` applies `flatTransformation` in doubles (`wx = m[0]*lx + ... + m[12]`) into the JS array `allVerts` (doubles); `:490-497` the centre is the double mean; `:499-503` `new Float32Array(allVerts.length)` stores `allVerts - c` (centre-subtracted, small, so precise). The stored mesh blobs and `component_geometries` are therefore not the problem; `element_transforms.center_*` and `element_world_bbox` are doubles. `:583` is the mm autoScale on the blob.
- So the open route is precise at large coordinates only for what it reads from a clean file. Re-open of OUR export reads the already-quantised points: the loss happens at export (`bonsai_library.js:87,100` -> `triFaceSet`), not at re-open. web-ifc `StreamAllMeshes` is not used by these files.
- A fix is out of scope here; the shape of it (recentre per element and write an IfcLocalPlacement, or accumulate in doubles) is the design lane's call.
