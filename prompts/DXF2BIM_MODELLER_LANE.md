# ⚠ DO NOT REMOVE
SCOPE: DXF2BIM inside the Modeller: Duplex → standard 2D set → import → metadata editor → qualify → convert (basic shapes) → IFC4; then the demo film.
Spec before code, for every lane below. Read the log after every run (exit code is not evidence). Every value traces to a DXF entity, a marking a user confirmed, or a named standard convention; nothing is guessed. Work in a /tmp/wt-* worktree (editing ~/bim-ootb directly is hook-blocked). Neutral naming: no client names anywhere.

## ▶ RESUME (next session, written 2026-10-17)
Read this block first, then the sections it names. Work to zero; spec first, then code; read every log; use worktrees only (editing ~/bim-ootb directly is hook-blocked); neutral naming (no client name in any repo, film or doc).

**RESUME (end of session 2026-10-17, written for the next session; READ THIS FIRST, then §L1.14, §L1.15, §L5.7, §L6.7).**
- **Built and witnessed this session:** §L1.7-L1.14 writer rules (voided hosts, sliver rect, columns as grid evidence, roof plan variants, staggered bubbles, primary grid, IFC-convention door swing, curtain walls), §L5 Modeller export (IFC or model `.db`, structure IFC columns, drawable report, zip of .dxf only, real elapsed clock + step times), §L6 scoped sets (suggest / merge / split wings by grid line, KEY + wing sheets, importer assembles them back). Python writer `std2d.py` = oracle, JS port `std2d*.js` = what the Modeller runs; parity witnesses on Duplex x2, SampleCastle, HHS (+structure), Hospital (ARC + STR).
- **Open PRs (the auto-mode classifier blocks my merging; the user merges):** BIMCompiler #202 (sliver rule) and #203 (everything else; branch `feat/export-structure-columns`, stacked), bim-ootb #2093 (branch `feat/dxf2bim-sliver-rect`). #203 now contains everything through the curtain walls (head `584c3af89`: scoped sets, roof pseudo-storey, curtain walls). After the BIMCompiler merges: `modeller/dxf2bim/sync.sh <BIMCompiler> <master commit>` so SOURCE.md names a master commit.
- **DECIDED 2026-10-17: option (a), per-wing frame, spec §L1.16 (build next: oracle, port, importer). Was:** the Hospital is NOT rectilinear: 1440 of 1440 walls non-orthogonal, several wings at several angles (85 deg: 542 walls, 10: 203, 70: 147, ...). Options: (a) per-wing rotation carried by `@SCOPE` (recommended, writer rotates a wing into its own axes, importer rotates back, report walls left unframed), (b) oriented walls in the reader (rewrite), (c) state the limit and film the Hospital as scale + series only.
- **Film:** `prompts/FILM_DXF2BIM_HOSPITAL.md` (DRAFT storyboard, real panel clock). Beats that rest on wall rules must be reworded until §L1.15 is decided. Film 1 (Duplex) exists (BIMCompiler `film/dxf2bim-en`).
- **Data you need (local, not in git):** `/tmp/db2/*.db` are scratch; regenerate with `scripts/extractIFC2DB.js --ifc <ifc> [--also <structure.ifc>] -o <db>` (Hospital ARC+STR 9 min 24 s, 1.8 GB; IFCs in `~/bim-compiler/internal/UNMERGED/Hospital_IFC2x3_{ARC,STR}.ifc`, HHS `opensourceBIM_HHS_Office_{architect,construction}.ifc`, SampleCastle `internal/sources/`). The old `Hospital_extracted.db` in bim-ootb/buildings is the OLD schema (no world bbox etc.): the 2D writer needs a fresh Node-schema extraction.
- **Known remaining on HHS (importer `blocked`):** 374 unclassified door pieces + 51 doors without host cut (50 mm glass-partition walls, not curtain walls), 67 interior curtain bands without elevation height, `QF:set_storey_unstated` (a wall edge at z=3.2278 m). Not claimed anywhere.
- **Witness commands (all must stay green):** `tests/dxf2bim/witness_std2d_set.js <db> <PREFIX.DB>` (needs `STD2D_PY` oracle path if testing an unmerged Python change), `witness_scopes.js`, `witness_grid_primary.js`, `witness_extract_core.js` (ALLOW_NEW=element_type,element_parts), `witness_extract_sqljs.js`; bim-ootb `modeller/tests/witness_dxf_export_roundtrip.js`, `witness_dxf_scopes_merge.js`, `witness_e2e_dxf_export.js` (14 checks, headless Chrome), `witness_dxf_import_node.js` (DXSET=std, DXF2BIM_BC=<BIMCompiler tree>).

**Update 2026-10-17 (end of session): L5 is built (§L5.7), PRs: BIMCompiler #200 (§L1.7), #201 (std2d port S1-S5a + extractor core), bim-ootb this one (Modeller export). Merge order: #200, #201, then this one, then re-run `modeller/dxf2bim/sync.sh <BIMCompiler> <merge commit>` so SOURCE.md names a master commit. NEXT: the Duplex web-ifc blocking items (§L5.7 not-solved 1), the film re-cut with the export step.**

**Update 2026-10-17 (earlier).** Lane 2 closed as far as the model allows: §L1.7 (BIMCompiler #200, spec in this PR) accounts the 51 fully-voided SampleCastle frame walls (`host_voided`, E5 51/51 vs IfcOpenShell); the remaining 366 unhosted openings are unstated in the IFC (V4) and stay `GAP:opening_no_host` (closing them needs a user `@TAG` host marking). Duplex regression `test_std2d` fail=0. Known: `witness_extract_2d_tables.py` E1 compares against `origin/master`, which now contains the new tables, so it fails with "new tables []"; repoint its base at the pre-#196 commit. NEXT: lane 3 (L5 spec above). Do not patch `tests/dxf2bim/mark_dx_set.js` for N storeys: it is Duplex-specific throughout (window families `M_Fixed`/`M_Casement`, `elements_rtree` SQL, WALLTOP, HAXIS fitted to FLOOR_GF, 1-char grid labels); derive markings in the JS port (L5.1 c) generalised from the start, using `mark_dx_set.js std` only as the Duplex oracle.

**Where things stand (all merged unless marked).**
- **Round trip, witnessed on the Duplex:**
  - L1 standard 2D writer (BIMCompiler `2D_Layout/python/std2d.py`): grid on load-bearing axes, 3-tier DIMENSION entities, door hinge/swing from IFC `door_operation`, plan = everything the cut plane passes through, roof plan, section.
  - L2 qualify verdict (`deploy/dev/dxf2qualify.js`).
  - L3 Modeller import → Convert (ARC-seed form) → IFC4 with storeys.
  - L4 metadata editor, including @BY, @LAYER and the door schedule (#2071).
  - The std Duplex set QUALIFIES with 0 blocking; a RAW set reaches Qualifies HONESTLY through the editor (#2071 bc9fff0a + §L4.4 elevation tagging: stacked windows tagged by clicking them in elevations, z from the pick; E7 33/33, 319 UI actions, 40 → 0 blocking). Library labels now live in the marked DXF (#2072 a5759c69). PUBLIC site verified: fresh browser → library source=oci → OCI marked sample qualifies → Convert 36/36 fills. Open: L2 page witness flakes under load (4/9 OCI runs, no crash found; crash capture added).
- **Library:** published to OCI as versioned shards `dxf2bim/library/<sha12>/` + `latest.json`, with samples at `dxf2bim/samples/duplex/{raw,marked}/`. Labels now go in the marked DXF as `@TAG … @BY=model` (BIMCompiler #195). Check that bim-ootb #2071 (doors) and #2072 (labels fix) landed on main, and that the public Modeller loads `source=oci`.
- **Docs (live):**
  - https://red1oon.github.io/BIMCompiler/DXF2BIMGuide/
  - https://red1oon.github.io/BIMCompiler/DXF2BIM_TechnicalNote/
  - Deploy only via `scripts/safe_gh_deploy.sh`. The live site carries pages from other branches (BIMToolsGuide, CivilWorksGuide, NinjaExcel manual, LegacyOracle spec, figs, glassbowl_data.db), so bring their sources into the deploy tree.
  - Update the guide with: the sample-set links, the raw → Qualifies walkthrough (Doors section), library on OCI, multi-storey results.
- **Films:**
  - EN `~/Videos/DXF2BIM_Demo_EN_1920x1080_24fps_2026-10-16_v2_resync.mp4` (BIMCompiler #192; click ripple ~2:42 needs a re-take).
  - MS in progress at handoff: check for `~/Videos/DXF2BIM_Demo_MS_*.mp4` and its PR.
  - The EN film predates the door schedule. A re-cut of chapter 6 (raw → Qualifies) is now possible.
- **Possibly in flight at handoff** (check PRs/branches, resume or redo):
  - multi-storey acid test (SampleCastle + HHS), plus the Node extractor additions (`rel_fills_host` incl. void-only openings, world bboxes/meshes, Pset IsExternal/LoadBearing), §L1.6 (openings from the host relation, not the knife; columns as gridded column symbols; storey names from the model);
  - the MS film.

**Multi-storey acid test result (2026-10-17; BIMCompiler #196 merged; spec §L1.6 = bim-ootb #2074):**
- **What #196 delivered:**
  - The Node extractor now writes world bboxes, `rel_fills_host`, IsExternal/LoadBearing and storey placement. Existing tables are unchanged on 5 IFCs; the witness passes on 8. std2d reads ONE DB.
  - Duplex from the Node DB: the same entity counts. Plan polygons differ 7–24 mm² because the geometry engines cut casings differently.
  - Columns are now gridded column symbols (SampleCastle 9/9, HHS structure 257/257).
  - One building grid across storeys; 3 dimension tiers pass; SampleCastle storeys come from the model (0/3/6/9 m; the old knife was 240 mm low).
- **What is NOT solved:**
  - SampleCastle plan openings: 9/164, 7/136, 7/116, 10/39. The knife is not the cause.
    - 357 of 455 openings have no wall host (no fills relation, no void).
    - 65 hosts (51 walls) have EMPTY geometry from web-ifc.
    - HHS curtain walls have no geometry either, so the HHS façade is empty.
  - Readability: SampleCastle's grid at 28×31 is too dense (the 10 mm merge tol was a Duplex choice; the user decides). Bubbles and dim texts overlap. 8 columns are too asymmetric to grid.
  - mark_dx_set.js / rosetta_dx_shell.js are Duplex-specific (sheet list, @SET=DX, old-schema SQL, 1-char grid labels). Generalise them to N storeys + the Node schema.
  - Re-sync modeller/dxf2bim copies (dxf2shell_config.js changed in #196).
- **PNGs:** ~/Videos/dxf2bim_work/acid/

**NEXT LANES (in order).**
1. **Extractor = one schema.** std2d must read ONLY the Node extractor DB (`scripts/extractIFC2DB.js`; never the Python one). Prove the Duplex std set is identical from the Node DB.
2. **§L1.6 acid test on multi-storey models:** SampleCastle (5 storeys, stairs, 259 windows, 205 doors, 23 columns) and HHS (257 columns).
   - Pass condition: every door/window of each storey is a gap in its host wall in plan whatever its sill height, with high windows dashed; columns are drawn as columns and gridded; three dimension tiers; one building grid across storeys.
   - Before/after numbers per storey.
3. **NEW (user, 2026-10-17): BIM → 2D export INSIDE the Modeller.**
   - User flow: "Loading user BIM into Modeller as present feature is good so user and code can examine that all is proper and markings can auto derive …, then allow export to choose DXF".
   - **Steps:**
     - (a) open the user's IFC (exists);
     - (b) a "drawable?" check report (storeys, hosts, door handing, geometry readable);
     - (c) markings derived automatically from the model (`@BY=model`, as `mark_dx_set.js std` does);
     - (d) Export → "2D drawings (DXF)" writes the standard set with markings embedded; re-importing it must Qualify.
   - **Decision to make in the spec:** port std2d.py to JS (recommended) vs Pyodide.
   - Depends on lanes 1–2.
4. **Zone-stretch of real LOD400 meshes** (user proposal, agreed in principle):
   - Stretch planes per door/window family, read from the mesh structure (frame vs panel). Frame and hardware keep their real size; only the panel/glass zones stretch.
   - Exact catalogue match first. Stretch only when the type is known.
   - Range limits → `GAP:stretch_out_of_range`.
   - Provenance "family X stretched from W0×H0 to W×H", and BOM as a custom size.
   - Witness on the Farmhouse openings (0 bound today).
5. **CAD DXF (BricsCAD/AutoCAD): INSERT/block expansion** (nested transforms, mirror) + ATTRIB values as tags (`@BY=file`). ASCII DXF only today. Ask the user for a real BricsCAD-exported set for a blind test.
6. **Fewer UI actions:** smarter proposals (levels/faces from title and level texts, schedules from drawing tables) to cut the 282 actions.
7. **Prior-art search** (commercial tools, ML research, patents) before any "first/unique" wording. Optionally, a Zenodo DOI for the technical note (the user's account).

**Standing decisions.**
- Metadata lives IN the DXF (`DXF2BIM-MARK`, `@BY=model|user`, no sidecars).
- Library data is never committed to git, and the old root `component_library.db` on OCI is never touched.
- The old hand-made Duplex sheets stay as a recorded finding: swings 6/14, casing-inclusive arcs, roof +43 mm.
- No "any DXF" claim until a blind test passes.

# DXF2BIM in the Modeller: lane spec (2026-10-16)

## 0. Sources
- Reader spec of record: BIMCompiler `docs/DXF2BIM_SPEC.md` + `docs/DXF2BIM_USER_GUIDE.md` (PR #176, merged 9afff321d). Modules: BIMCompiler `deploy/dev/dxf2{bim,elev,marks,mesh,types}.js` (UMD: `module.exports` / `root.Dxf2*`, so they load in a browser as-is).
- Basic-shapes lane (walls / slabs / roof / openings + LOD400 fills): `BASIC_SHAPES_SPEC.md` (in progress, merged into the reader spec when witnessed).
- Demo storyboard: the user's words (2026-10-16): "Duplex reduced to 2Ds imported into Modeller, where the editor shows all such metadata, which for a raw 2D is where it needs to be filled in".
- Modeller integration map (read 2026-10-16, file:line in `modeller/`):
  - **Open chooser:** `initOpenChooser` modeller.html:5544-5630. `pickLocal` takes one file, `.db/.sqlite/.ifc`; there is no drag-drop.
  - **Op-log:** `Bonsai.oplog.commit` bonsai_oplog.js:318 / `commitGesture` :374.
  - **GEOM_EXTRUDE_POLY** `{profile:{points},depth}`: z=0, +Z only, no base elevation (bonsai_kernel_worker.js:76-86).
  - **GEOM_CUT** `{parent, void:{c1,c2}}` (modeller.html:1732).
  - **GEOM_INSERT** `{hash, placement:{x,y,z,rot}, lod}`: library-backed; the LOD400 hard-fail is at bonsai_library.js:443-447.
  - **Panels:** closest pattern is `#ins-panel` (modeller.html:107-140, :3788). Lucide SVGs inline, no unicode glyphs. The help panel auto-lists `#bar` buttons.
  - **Tests:** `modeller/tests/*_live.js` (puppeteer, swiftshader, `?feature=demo`, `§TAG` logs); E2E rig `tests/e2e_harness.js`.
  - **sw.js:** add new files to PRECACHE, bump CACHE_VERSION (v79 on read), `?v=` on changed files.
  - **No dxf-parser in bim-ootb:** vendor it into `modeller/lib/` (+ `DEFERRED_LIBS`).
  - **IFC export gaps** (bonsai_ifc.js):
    - every GEOM_EXTRUDE_POLY becomes an IfcWall at the origin (:196-206)
    - GEOM_MOVE is ignored
    - no IfcBuildingStorey / containment

## L1. Standard 2D set from the model (writer). No hand-doctoring.
Problem (measured 2026-10-16 on `DX_*_20260428_0636.dxf`):
- grid bubbles are only 0,1,2 × A,B (the envelope)
- dimension texts are only the overall 8800 and 17800
- there is no grid at the interior wall axes and no chained dimensions

Past Duplex sets needed manual doctoring (user).
Rule (deterministic, from the model's wall axes; conventions adopted from the NCS v5 / AIA layer guidelines in `2D_Layout/reference_samples` and common drafting practice; each is a stated choice):
- **G1 Grid axes.** One grid line per distinct wall AXIS position (exterior + load-bearing interior walls) along X and along Y. Positions are merged when within `grid_merge_tol` (stated, e.g. 10 mm). Partitions below `grid_min_wall_len` are not gridded.
- **G2 Labels.** Numbers 1..n left→right on vertical lines; letters A..n bottom→top on horizontal lines; I and O skipped; bubbles at both ends, outside the dimension strings.
- **G3 Dimension strings, per side, outside the plan:**
  - (1) overall
  - (2) grid-to-grid
  - (3) openings/wall-ends on the exterior faces
  - Each is a real DIMENSION entity whose measurement equals the model distance. Text overrides are forbidden.
- **G4 Elevations:**
  - the same grid bubbles projected onto that face
  - a level datum per storey (FFL) plus the roof top, from the model storeys
  - height dimension strings
- **G5 Layers:** NCS/AIA names (A-WALL, A-DOOR, A-GLAZ, A-GRID, A-ANNO-DIMS, A-ANNO-LEVL, A-ROOF, A-FLOR).
- **G6 Door symbol:** leaf line + 90° swing arc, hinge at the true hinge jamb, arc on the side it opens into.
- **G7 Window symbol:** glazing lines inside the wall gap, with the sill shown.
- **G8 Metadata:** optionally the `DXF2BIM-MARK` layer with the @-markings derived from the model (roles, units, levels, tags). The film's "filled" state is this layer; the "raw" state is the same file without it.

Writer: extend the existing `2D_Layout/python/drawing_writer_dxf.py` (BIMCompiler).
Tests (each names the issue):
- **W1** two runs give byte-identical output: nondeterminism
- **W2** every interior load-bearing wall axis has a grid line and none is extra: grid invented or missing
- **W3** each DIMENSION's measurement equals its two points' distance and the model distance within 0.5 mm, no text overrides: doctored or wrong dims
- **W4** labels sequential, I/O skipped, no duplicates: unreadable grid
- **W5** each door arc lies on the side it opens into in the model, hinge at the model's hinge jamb: swing wrong
- **W6** elevation levels equal the model storey elevations: level invented
- **W7** mutation: shift one wall 50 mm in the model → W2/W3 report it

### L1.1 Refinements before coding (2026-10-16)
Source of every value: `DX_extracted.db` (tables `elements_meta`, `elements_rtree` bbox in m, `element_transforms`, `base_geometries`, `rel_fills_host`, `spatial_structure`). The DB has no storey-elevation column, no LoadBearing/IsExternal property and no door placement axis or OperationType. Each rule below says how the value is derived, or names it as a GAP. "Convention" = a stated drafting choice, never something read from a drawing. Name strings (e.g. "Exterior", "Party Wall") are not used by any rule.
- **R1 Storey elevation.** `elev(S)` = min `minZ` of the IfcWall elements contained in S. Storey without walls → `GAP:storey_no_walls` (no datum drawn). Cross-check on Duplex against the source IFC `IfcBuildingStorey.Elevation`: Level 1 0, Level 2 3.1, Roof 6.0, T/FDN −1.25 (equal, 4/4).
- **R2 Foundation and grid storey.** Foundation storey = the storey that contains IfcFooting. Grid storey = the lowest storey above it (Duplex: Level 1). Convention: one structural grid per building, derived on the grid storey and reused on every plan and elevation.
- **R3 Wall axis.** The plan bbox must be axis-aligned (else `GAP:wall_not_orthogonal`, not gridded). The longer plan extent is the length. The axis is the bbox centre across the thickness.
- **R4 Gridded walls (G1).** A grid-storey wall is gridded when its length ≥ `grid_min_wall_len` = 1000 mm and either:
  - (a) **load-bearing**: a parallel foundation wall's thickness band strictly contains the wall axis, and the overlap along the length is ≥ 50 % of the wall length (the wall bears on it); or
  - (b) **exterior**: its outer face lies on the plan envelope bbox within 10 mm.
  - Duplex result expected: X axes 0.2085 / 4.4 / 8.5915 m; Y axes −17.5915 / −9.9715 / −7.8285 / −0.2085 m.
- **R5 Merge.** `grid_merge_tol` = 10 mm. The merged position is the mean of its members, rounded to 0.1 mm.
- **R6 Labels (G2), convention US NCS.** Numbers 1..n go on lines of constant X, left→right. Letters A..Z, skipping I and O, go on lines of constant Y, bottom→top. This supersedes the earlier JKR-style letters-on-X in `derive_grids`, for the std set only.
- **R7 Plan sheet (1:100), convention.** All offsets are measured outward from the envelope, in paper mm (×100 in model). Dimension tiers per side, inner→outer:
  - (3) openings/wall-ends at 10
  - (2) grid-to-grid at 18
  - (1) overall at 26
  - Grid lines run to 33. Bubbles (r 4, label 3.5 mm) are centred at 37, at both ends.
  - Dimension style STD100: architectural tick, text 2.5 mm, `dimdec` 0 (mm), measurement text only (no override).
  - Cut plane = storey elevation + 1200 mm (existing §5.1a).
- **R8 Openings string (G3-3).** Each section-cut wall contour contributes its run along that exterior face line (the min..max of its vertices within ±5 mm of the face). The points are the ends of the union of those runs (runs within 1 mm merge, so abutting walls make no false break), plus the envelope corners. Contour mid-edge vertices (mesh slicing artefacts) are therefore not dimensioned. The first run measured mid-edge vertices and gave 47/52 mm junk segments; this was seen in the PNG.
- **R7a Narrow dimensions.** When a segment is shorter than its text (digits × 0.9 × 2.5 mm + 1 mm, paper), the text moves 4.5 paper mm outward with a leader (`dimtmove` 1). The measurement is unchanged.
- **R9 Door swing (G6).** The DB door mesh is axis-aligned and symmetric across its width. The leaf panel is offset across the wall thickness, so the swing side = the face the leaf is offset to (the frame/casing is mirror-symmetric about the door centre; the leaf is not. Swing sign = the sign shared by the thickness-axis vertex coordinates that have no mirror partner −v within 1 mm). If no leaf is found or the sign is mixed → `GAP:door_swing`. Witness: 14/14 Duplex doors have a leaf-offset sign equal to the source IFC door local +Y, the direction its IFC `Plan` swing arc opens into.
  - **Hinge jamb is NOT in the DB** (the width-symmetric mesh carries no placement X axis or OperationType) → `GAP:door_hinge` for every such door. The writer then draws the cut jambs and the closed leaf (section cut) plus a `HINGE ?` note on A-ANNO-NOTE on the swing side. It draws no arc and never picks a side.
  - Upstream fix (not this lane): the extractor persists the IfcDoor placement X axis + OperationType. Both are present in the Duplex IFC for 14/14 doors.
- **R10 Window (G7).** The cut contour (frame + glass) goes on A-GLAZ. Both wall-face lines across the opening go on A-GLAZ-SILL; the interior one is the sill/stool. A-GLAZ-SILL is the NCS minor group; it keeps the reader's A-GLAZ rectangles unmixed. Elevation: the window outline goes on A-GLAZ, and its bottom edge is repeated on A-GLAZ-SILL.
- **R11 Elevations (G4).**
  - Faces (names kept from the existing writer): FRONT = min Y, REAR = max Y, LEFT = min X, RIGHT = max X.
  - Convention: the projection is as seen by an observer outside the face. Horizontal axis: FRONT +X, REAR −X, LEFT −Y, RIGHT +Y. This corrects the existing writer's mirrored LEFT/RIGHT.
  - What is drawn:
    - walls whose outer face is on that envelope face (≤ 10 mm), on A-WALL
    - their hosted openings via `rel_fills_host`, on A-DOOR / A-GLAZ, when the opening's longer plan extent runs along that face (this excludes a corner wall's openings on the other face)
    - the roof element silhouette on A-ROOF
  - Levels: one datum per storey with elevation ≥ the grid storey, text `<storey name> <±z.zzz>` on A-ANNO-LEVL, plus **T/ROOF** = max Z of IfcRoof, else of the highest IfcSlab.
  - Height dimension chain (storey to storey to T/ROOF) plus the overall, both left of the face.
  - Grid bubbles for the grid lines perpendicular to the face sit below the lowest datum: 12 paper mm below, bubble 16 below.
  - The foundation storey (below grade) is listed in the log, not drawn. Natural grade is not in the DB, so no grade line is drawn.
- **R12 Layers (G5).** A-WALL-FULL (walls whose axis is within `grid_merge_tol` of a parallel grid line; on every plan storey) and A-WALL-PRTN (other walls); these are the names the DXF2BIM reader map consumes. A-WALL-PATT holds the solid poché. The rest: A-DOOR, A-GLAZ, A-GLAZ-SILL, A-GRID, A-ANNO-DIMS, A-ANNO-LEVL, A-ANNO-NOTE, A-ANNO-TTLB, A-ROOF, A-WALL (elevation outline). Furniture and MEP are not drawn on the std set.
- **R13 Determinism.**
  - `ezdxf.options.write_fixed_meta_data_for_testing = True` (fixed $TDCREATE/$TDUPDATE/GUIDs).
  - Iteration is sorted by guid / coordinate.
  - File names carry no timestamp: `output/STD/DX_{FLOOR_GF,FLOOR_FF,FRONT,REAR,LEFT,RIGHT}_std.dxf` (git-ignored). The log is `log_DX_std.txt`, which also lists every `§GAP`.
- **R14 G8 marks.** Deferred (optional in G8); not in this pass.
- **Tests: `2D_Layout/python/test_std2d.py`.** Expectations are recomputed in the test from the DB, independently of the writer code. The W5/W6 oracle is the source IFC, when present.
  - W5 checks three things:
    - (a) the closed leaf sits on the IFC +Y side
    - (b) every drawn arc has its hinge at the IFC hinge jamb
    - (c) every `GAP:door_hinge` door has no arc
  - W5 control: the DXF with mirrored notes/leaves must FAIL.
  - W7: the drawing from the original DB is checked against a copy with one interior load-bearing wall shifted 50 mm. W2/W3 must FAIL on it, and must PASS on the drawing regenerated from the mutated copy.
- **Witness (2026-10-16, BIMCompiler branch `feat/dxf2bim-std2d`).**
  - Grid: 1/2/3 at x 208.5 / 4400 / 8591.5 mm; A/B/C/D at y −17591.5 / −9971.5 / −7828.5 / −208.5 mm.
  - Tests: W1–W7 PASS. The W5 control (mirrored swing) FAILS as required; W7 stale W2+W3 FAIL, regenerated PASS. Gaps: `GAP:door_hinge` 14/14.
  - Reader re-run (copy of rosetta_dx.js on the std plans): walls are unchanged versus the old set (L1 29 pieces, 17/17; L2 27 pieces, 12/17, the same pre-existing R1b FAIL); windows are unchanged (4/4, 10/10). Doors fall from 6+6 to 0, because the reader needs an ARC and the hinge is a GAP. This is fixed by the upstream extractor fix in R9, not by drawing guessed arcs.
  - The old set's door arcs agreed with the IFC on swing side 6/14 and hinge jamb 8/14, i.e. they were invented.

### L1.2 Door hinge from the IFC: `door_operation` table → std2d arcs (2026-10-16)
Closes the R9 `GAP:door_hinge` upstream, as R9 asked: the extractor persists the door's operation type and placement axes; std2d draws the arc only from them. Nothing is guessed.

**Source of handing (Duplex, IFC2X3).** Every IfcDoor is typed through `IfcRelDefinesByType` → `IfcDoorStyle.OperationType` (Duplex: 6 styles, 3 `.SINGLE_SWING_LEFT.` + 3 `.SINGLE_SWING_RIGHT.`, covering 14/14 doors). The door frame is its `ObjectPlacement` (IfcLocalPlacement chain of IfcAxis2Placement3D).

**IFC definition relied on** (offline sources only; the buildingSMART HTML pages are not available offline):
- IfcOpenShell 0.8.4 ships the IFC IfcDoor documentation text in `ifcopenshell/mvd/mvd_examples/officials/ReferenceView_V1-2.mvdxml` (concept "Door Attributes"). Quoted exactly:
  - "The door panel (for swinging doors) opens always into the direction of the positive Y axis of the local placement. The determination of whether the door opens to the left or to the right is done at the level of the *IfcDoorType*. Here it is a left side opening door given by *IfcDoorType.OperationType* = SingleSwingLeft" — "refered to as LEFT HAND (LH) in US", "refered to as DIN-R (right hung) in Germany".
  - "If the door panel (for swinging doors) opens to the right, a separate door style needs to be used (here *IfcDoorTypee.OperationType* = SingleSwingRight) and it always opens into the direction of the positive Y axis of the local placement." — "RIGHT HAND (RH) in US", "DIN-L (left hung) in Germany".
  - "NOTE There are different definitions in various countries on what a left opening or left hung or left swing door is (same for right). Therefore the IFC definition may derivate from the local standard and need to be mapped appropriately."
- The figures (ifcdoor-fig01..04) and the enum item text ("hinges on the left side as viewed in the direction of the positive y-axis") are **not** available offline: `ifcopenshell/util/schema/ifc{2x3,4,4x3}_types.json` carry only the enum description, web-ifc ships no docs. So the left/right side is derived, and stated as such:
  - US LH = viewed from the side away from which the door swings (i.e. looking along +Y), hinges on the left. DIN-R = viewed from the side the door opens toward (looking along −Y), hinges on the right. Both name the same physical door, so SingleSwingLeft = **hinges on the left when looking along +Y = the −X jamb** (Z up: looking along +Y, right is +X).
  - Cross-check in code: IfcOpenShell `api/geometry/add_door_representation.py` draws the SINGLE_SWING_LEFT 2D panel + quarter arc at the panel's start (local min X) opening into +Y, and mirrors it about the panel centre for `RIGHT`.
  - Witness on the data (below): every Duplex IFC `Plan` swing arc agrees with this reading.

**D1 Table (extractor `scripts/extractIFC2DB.js`, web-ifc; new table only, no existing table or output changes).**
`door_operation(guid TEXT PRIMARY KEY, operation_type TEXT, source TEXT, x_axis TEXT, y_axis TEXT, z_axis TEXT, origin TEXT, overall_width REAL, overall_height REAL)`
- One row per extracted IfcDoor that has an operation type; doors without one get no row (counted in the log, `§DOOR_OP none=`).
- `operation_type`: the enum value as written (e.g. `SINGLE_SWING_LEFT`, `DOUBLE_DOOR_SINGLE_SWING`, `NOTDEFINED`, `USERDEFINED`).
- `source`: `style` (IFC2X3 `IfcDoorStyle.OperationType`, also an IFC4 file still using IfcDoorStyle), `type` (IFC4 `IfcDoorType.OperationType`) or `occurrence` (IFC4 `IfcDoor.OperationType`). Precedence follows IFC4 IfcDoor ("OperationType shall only be used if no type object IfcDoorType is assigned, providing its own IfcDoorType.OperationType"): the type/style value wins when it is set; the occurrence is used only when no type/style value exists.
- `x_axis`, `y_axis`, `z_axis`: unit vectors of the door's ObjectPlacement resolved to world (the whole IfcLocalPlacement chain; per IfcAxis2Placement3D, Z = Axis or (0,0,1), X = RefDirection or (1,0,0) made orthogonal to Z, Y = Z × X). JSON `[x,y,z]`. IFC is Z-up, the same frame as the DB.
- `origin`: placement origin in metres, JSON `[x,y,z]`. Length unit from `IfcProject.UnitsInContext` (IfcSIUnit prefix, or IfcConversionBasedUnit factor). The DB geometry is in metres, so `origin` is too.
- `overall_width`, `overall_height`: IfcDoor.OverallWidth/Height in metres (null when absent). Recorded, not used by std2d.
- A placement that is not an IfcLocalPlacement of IfcAxis2Placement3D/2D → axes and origin null (logged); the row keeps its operation type.
- Log: `§DOOR_OP guid=… op=… source=… x=… y=…` per door and `§DOOR_OPERATION rows=n style=a type=b occurrence=c none=d`.

**D2 Hinge and swing rule (std2d R9b; supersedes the R9 hinge GAP when D1 is present).**
- H1 Applies only to `SINGLE_SWING_LEFT` / `SINGLE_SWING_RIGHT` with all three axes present and `z_axis` = (0,0,1) within 1e-6 (a vertical door). Everything else — no row, other operation types (double, sliding, folding, revolving, NOTDEFINED, USERDEFINED), tilted placement — keeps `GAP:door_hinge` and the `HINGE ?` note. No arc is drawn.
- H2 Swing side = +`y_axis` (mvdXML text above).
- H3 Hinge jamb = the leaf's −`x_axis` end for LEFT, its +`x_axis` end for RIGHT.
- H4 Leaf = the mesh components (face-connected vertex sets of the DB door mesh) that hold an R9 leaf vertex (a thickness-axis coordinate, measured along `y_axis`, with no mirror partner within 1 mm). Leaf extent along `x_axis` = [s0, s1]; leaf width = s1 − s0 = arc radius. Hinge point = the leaf end from H3 at the leaf's +`y_axis` face (the edge the leaf turns about when it opens toward +Y).
- H5 Geometry must agree with the enum: the R9 leaf-offset sign along `y_axis` must be +. If the mesh leaf sits on the −Y side → `GAP:door_handing_conflict` (logged with both values), no arc. No leaf found → `GAP:door_swing` as before.
- Drawn on A-DOOR, tagged with the door GUID: the open leaf line hinge → hinge + width·Y, and a 90° ARC centred on the hinge, radius = leaf width, from the closed-leaf direction (toward the latch jamb: +X for LEFT, −X for RIGHT) to +Y. `§DOOR … hinge=… swing=+Y op=… source=…` in the log.
- std2d gets the table from the DB itself, or from `--door-ops <db>` (the Node-extracted DB) joined on GUID. The DX_extracted.db std input is unchanged.

**Tests.**
- Extractor witness `scripts/witness_door_operation.py` (oracle = IfcOpenShell reading the IFC, independent of web-ifc):
  - X1 regression: origin/master extractor vs this one on 5 IFCs (Duplex_ARC, Duplex Federated, Ifc4_SampleHouse mm, SampleHouse_ARC, Ifc4_WallElementedCase): every pre-existing table identical row-for-row (only `project_metadata.import_date` differs): the new table changed an existing output.
  - X2 every IfcDoor with an operation type has a row whose type, source, axes (1e-6) and origin (1e-6 m) equal the oracle: wrong or missing handing data.
  - X3 IFC4 mm file (Ifc4_SampleHouse: type + occurrence both set, one DOUBLE_DOOR_SINGLE_SWING): source = `type`, and the origin (m) lies within one door size of the door's DB mesh bbox (a missed or doubled mm→m scale puts it ~1000× away; the origin itself need not be inside the mesh: the double door's sits 121 mm off it, on the wall face): precedence or unit scale wrong.
  - X3-occurrence: a copy of that IFC with the three IfcDoorType OperationType values removed must give source = `occurrence` with the IfcDoor values: the occurrence path is dead.
  - X4 geometry agreement per door: the hinge jamb from H3 equals the jamb of the IFC `Plan` swing-arc centre, and the IFC Plan arc opens toward +Y, and the DB mesh leaf offset (R9, about the mesh bbox centre along `y_axis`) is +Y: enum disagrees with the physical door. The 3D mesh carries no hinge hardware (it is symmetric along X), so the hinge's geometric witness is the IFC Plan curve; the swing has two (Plan curve + mesh leaf). A file with neither (Ifc4_SampleHouse: no Plan curve, asymmetric Revit mesh) is reported as INFO "no contradiction, no witness", never as a PASS.
  - X4-control: the same IFC with one IfcDoorStyle's LEFT/RIGHT swapped (copy) must FAIL X4 on exactly that style's doors: X4 is blind.
- `2D_Layout/python/test_std2d.py --door-ops <db>` W5 (extends L1.1 W5): for every door with an arc, (a) arc centre within 5 mm of the IFC Plan swing-arc centre (hinge position), (b) hinge on the IFC enum's jamb (sign along IFC +X from the door centre), (c) arc mid-direction and leaf line along IFC +Y (swing side), (d) radius = IFC OverallWidth within 2 mm; every door without an arc has a `GAP:door_hinge`; Duplex expects 14 arcs, 0 hinge GAPs.
  - W5-control-hinge: every arc mirrored across the door centre along X (hinge on the other jamb, same swing side) must FAIL.
  - W5-control-swing: every arc mirrored across the door centre along Y (other face) must FAIL.
- Reader: a copy of `tests/dxf2bim/rosetta_dx.js` pointed at the std plans reports door arcs found per storey and matched to the source doors (D-MATCH, copy only: hinge within 5 mm of the IFC Plan arc centre, width within 2 mm of OverallWidth, swing on IFC +Y); Duplex expects 14 (Level 1: 6, Level 2: 8).

**Witness (2026-10-16, BIMCompiler branch `feat/door-hinge`).** Duplex re-extracted with the Node extractor to a new DB (`2D_Layout/input/DX_ARC_node_extracted.db`, outside git; DX_extracted.db untouched).
- `witness_door_operation.py`: X1 5/5 IFCs identical on every pre-existing table (1014 / 4370 / 263 / 263 / 29 rows); X2 5/5 (Duplex 14 rows source `style`; SampleHouse 3 rows source `type`, mm; WallElementedCase 0 doors, inch unit resolved 0.0254); X3 + X3-occurrence PASS; X4 Duplex 14/14 AGREE (hinge: enum = IFC Plan arc jamb 14/14; swing: enum +Y = Plan arc 14/14 = mesh leaf 14/14); X4-control flags exactly the 2 doors of the swapped style. Extractor has no other test of its own; X1 is the regression proof.
- Per door (Duplex): 6 SINGLE_SWING_LEFT (hinge −X jamb), 8 SINGLE_SWING_RIGHT (hinge +X jamb), all swing +Y; enum and geometry agree 14/14, no conflict.
- `test_std2d.py --door-ops`: W1–W7 PASS; W5 14 arcs, 0 hinge GAPs, every hinge 0.00–0.01 mm from the IFC Plan arc centre, jamb = enum 14/14, swing on +Y 14/14, radius = OverallWidth 14/14. W5-control-hinge and W5-control-swing each FAIL on 14/14 doors, as required. Without `--door-ops` the L1.1 behaviour is unchanged (14 hinge GAPs, W5 PASS, swing control FAILs).
- Reader copy on the std plans: doors found 6 + 8 = 14, D-MATCH 14/14; walls R1a/R1b-stated/R1c PASS on both storeys, windows R4 PASS.
- Findings:
  - Reader R3 FAILS on the std set: it compares the arc radius with the source door bbox long side, which includes the 2 × 76 mm casing (0.914 vs 0.762 …). The std arc radius is the leaf width (= OverallWidth = the IFC Plan arc radius). R1b-stated already removes the casing; R3 does not. Fix in the reader lane, not here (the old sheets passed R3 because their arcs used the casing-inclusive width).
  - W1 across processes is not deterministic on origin/master either: ezdxf's OBJECTS section order follows Python's hash seed (FRONT differed in 1 of 3 runs; identical with `PYTHONHASHSEED=0`). Within one process W1 holds. Pre-existing; the L1.1 claim "across two separate CLI processes" was a lucky pair.

### L1.3 Fixes from the §L1.2 findings: cross-process determinism + reader R3 leaf width (2026-10-16)
**F1 Determinism (std2d, R13).**
- Cause, read in ezdxf 1.4.3 `sections/classes.py`: at save, `ClassesSection.add_required_classes` appends one CLASS per DXF type in use by iterating `entitydb.dxf_types_in_use()`, a Python `set` of strings. String hashes are salted per process, so the CLASSES section order (e.g. LAYOUT vs ACDBPLACEHOLDER) changes between processes. Entities, handles and every other section were identical in the observed diffs.
- Fix: before each `saveas`, std2d registers the CLASS entries itself in a fixed order: ezdxf's own `REQUIRED_CLASSES` list for the DXF version, then the types in use **sorted**. `ClassesSection.register` skips keys that already exist, so ezdxf's own call at save then adds nothing in hash order. This needs no `PYTHONHASHSEED`: the caller's environment is not used.
- Test W1-proc (issue: nondeterminism across processes): 5 separate CLI runs, each with a different `PYTHONHASHSEED` (1..5), must give byte-identical files for all 6 views. Control W1-proc-control: the same 5 runs with the fix disabled (the CLI run with `_stable_classes` replaced by a no-op) must differ, which proves the 5 seeds really change the hash order.

**F2 Reader R3 (`tests/dxf2bim/rosetta_dx.js`).**
- R3 compared the arc radius with the source door bbox long side. That side includes the casing on both jambs, so a correct leaf-width arc (the std set, radius = IFC OverallWidth) failed.
- Rule: the source door width for R3 = bbox long side − 2 × `CASING`. This is the same constant (0.076, evidenced by `R1-evidence`) and the same casing rule that R1b-stated already applies to doors. No second casing value. Tolerance unchanged: 2 mm.
- The script reads the std set when `STD_DIR` is set (`DX_<view>_std.dxf`); otherwise it reads the old timestamped set, as before.
- Expected: std set with door ops → R3 14/14 (6 + 8). Old timestamped set: its arcs were drawn with the casing-inclusive width (0.914 / 0.965 / 1.016 / 1.402 m), so on the leaf rule they are no source leaf width. R3 states the old set's verdict as measured (see results), not adjusted to pass.

**Results (2026-10-16, BIMCompiler branch `fix/std2d-det-r3`).**
- F1: W1-proc PASS (5 CLI runs, seeds 1..5, one digest for the 6-file set); W1-proc-control PASS (fix disabled: seed 4 differs, 2 distinct digests). Five more runs with `PYTHONHASHSEED` unset (random): one digest. W1–W7 and the W5 controls unchanged (`SUMMARY fail=0`).
- F2: std set with door ops → R3 PASS on both storeys (Level 1 6/6, Level 2 8/8 = 14/14). The rest of rosetta_dx is unchanged on the std set (`SUMMARY fail=0`).
- F2, old timestamped set: R3 changes from PASS to **FAIL** on both storeys. Its arc radii (0.914 / 0.965 / 1.402, and 0.914 / 1.016) equal the casing-inclusive bbox exactly, and no leaf width (0.762 / 0.813 / 0.864 / 1.25). Keeping its old PASS would need a second criterion that accepts the casing-inclusive radius, which is the error R3 now catches. Open decision (coordinator/user): accept the old-set R3 FAIL as the truth about those sheets (their swings were already 6/14 and hinges 8/14 right), or retire the old set from rosetta_dx in favour of the std set.
- Unit suites `tests/dxf2bim/test_*.js` 16/16 `SUMMARY fail=0`. `rosetta_dx_shell.js` 35 PASS, 1 FAIL: the known RF-d roof top (6.5 drawn vs 6.457 source).
- G8 / `DXF2BIM-MARK` for the std set: no writer on master yet. #179/#180 read markings, and `mark_dx_set.js` marks only the old set. So the std set was regenerated with door ops only: `2D_Layout/output/STD/` (14 arcs, 0 GAPs).

### L1.4 Std set completion: folder determinism, roof plan, building section (+ reader), window-match finding (2026-10-16)
Written before the code. BIMCompiler branch `fix/std2d-det-r3` (same PR as §L1.3).

**F3 Determinism across folders.**
- Reported by L2: std outputs written into different folders differ.
- Measured on origin/master std2d: 10 processes (`PYTHONHASHSEED` 1..10) writing into folders of different names and depths. Only the CLASSES section ever differs (seeds 4, 7, 10). Its entries are named after object classes (LAYOUT, ACDBPLACEHOLDER). The folder makes no difference: same seed, different folders gives identical bytes. This is the §L1.3 F1 cause, already fixed.
- W1 and W1-proc now write every run into a different folder (different names and depths), so a folder dependence would be caught.

**F4 Roof plan sheet `DX_ROOF_std.dxf`** (no sheet stated the "Roof" storey, so qualify blocked the roof).
- Storey: the highest storey whose IfcWalls start at its R1 elevation and that has no plan cut (Duplex: "Roof", R1 elevation 6.000, from the parapet walls).
- Content, all from the model:
  - **A-ROOF:** one closed outline = plan envelope of that storey's walls (the roof edge; `roofPlan` requires it to equal the top plan's wall envelope).
  - **A-GLAZ:** each IfcWindow contained in that storey (skylights) as a closed plan bbox rectangle.
  - The grid (G1/G2, the same lines as the plans).
  - Dims: T2 grid-to-grid and T1 overall on 4 sides. There is no T3, because no wall is cut.
  - Level texts on A-ANNO-LEVL: `<STOREY> +6.000` and `T/ROOF +6.457` (R11 roof top).
  - Title `ROOF PLAN - ROOF (+6.000) 1:100`.
- Markings: std2d writes none (as for every std sheet). Needed from `mark_dx_set.js std` (L2's script): `@SET=DX @VIEW=ROOF @UNITS=mm @NAME=ROOF PLAN @LEVEL=6 @ROOF=6.457`, the #182 form. @LEVEL = R1 elevation of the storey from the model; @ROOF = T/ROOF as on the std elevations.
- Reader map: `set_configs.js` STD.MAP_ROOF = DX MAP_ROOF (A-ROOF roof, A-GLAZ glazing) + ignore for A-GRID, A-ANNO-DIMS, A-ANNO-LEVL, A-ANNO-TTLB.

**F5 Building section sheet `DX_SECTION_std.dxf`** (the real place for slab thickness).
- **Cut:** a vertical plane at constant X midway between grid lines 1 and 2 (convention: the first bay; Duplex X = 2304.25 mm). It cuts both storeys and the roof.
- **Viewed toward −X:** the sheet's horizontal axis is plan +Y (h = y, mm) and vertical is z (mm).
- **Geometry:** triangle meshes from the DB sliced by the plane (the `section_cut.slice_mesh` engine with axes permuted), chained into closed contours.
  - **S-SLAB:** cut IfcSlab contours, except the R11 roof element. This includes the finish-floor slabs, which sit on top of the structural slab.
  - **A-ROOF:** cut contours of the R11 roof element (IfcRoof, else the highest IfcSlab).
  - **A-SECT:** cut IfcWall contours. A-WALL-PATT holds the poché hatch.
- **Annotation, as on the elevations (R11):**
  - level datum lines and texts on A-ANNO-LEVL for every plan storey plus the "Roof" storey and T/ROOF
  - height dims (chain + overall) left of the section
  - grid bubbles for the Y grid lines (letters) below
  - title `SECTION A-A AT X=2304.25  1:100`
- **Markings format (agreed here, before code; the reader enforces it):**
  - `@VIEW=SECTION` needs `@SET`, `@UNITS`, `@HAXIS`, `@CUT`, `@GRIDH` (≥2), `@Z` (≥2). `@ROOF` is optional.
  - `@CUT=<X|Y>,<plan coordinate in the sheet's @UNITS>`, e.g. `@CUT=X,2304.25`. The HAXIS axis must not equal the CUT axis (`MARK:axis_cut`).
  - Alignment and z calibration work exactly as for ELEV (`align`: GRIDH vs plan grids, @Z pairs).
  - Needed from `mark_dx_set.js std` (L2): the same evidence rules it uses for elevations, plus @CUT from the title text.
- **Reader** (deploy/dev; `dxf2marks.js` accepts `SECTION` and `CUT`; `dxf2shell.js` gets new `sectionSlabs`):
  - Every closed polyline on a layer typed `sectslab` (S-SLAB) or `roof` (A-ROOF) becomes a rectangle in (plan h, z) through the align map. A non-rectangle gives `GAP:section_not_rect`.
  - For each stated plan level L, the slab at L = the S-SLAB rectangles whose **top** is within `elev_tol` of L. Its underside is their bottom.
    - None found → `GAP:section_no_slab`.
    - Undersides that disagree → `GAP:section_slab_conflict`.
    - top − bottom ≤ tol → `GAP:section_bad_thickness`.
  - Roof: the A-ROOF rectangle(s): bottom and top. When `@ROOF` is given, the top must equal it (else `GAP:section_roof_top_conflict`).
  - `slabZ(upper, lower, cfg, opts)` takes `opts.section`. With a section slab at `upper.level`, it returns top/bottom from the section (`source: 'section'`). Without one, it behaves as before. When the elevation-derived top is also present and differs, it raises `GAP:slab_top_conflict`.
- **Tests:**
  - Unit (`tests/dxf2bim/test_section.js`):
    - the marking keys and errors
    - a synthetic section reading GF / FF / roof
    - a finish floor on top of the slab is not taken as the slab
    - a missing slab gives a GAP
    - a non-rectangle gives a GAP
    - conflicting undersides give a GAP
    - `slabZ` uses the section
    - mutation: the FF underside moved 50 mm, so the reader reports the moved value and the witness check fails
  - Witness `tests/dxf2bim/rosetta_dx_section.js`, on a marked copy of the std section. The marking step in the test is from evidence plus the model levels, until `mark_dx_set.js std` does it.
    - **SX1:** FF slab = 2.795..3.100 equals the source IfcSlab at the cut (the old set got it from wall ends).
    - **SX2:** GF slab = −0.127..0.000.
    - **SX3:** roof 6.000..6.457.
    - **SX-control:** the FF underside line moved 50 mm in a copy must FAIL SX1.
  - `test_std2d.py`:
    - **W8 (roof plan):** outline = roof-storey wall envelope; skylights = the model's roof-storey IfcWindow bboxes 2/2.
    - **W9 (section):** every S-SLAB/A-ROOF contour's z extent equals a model element's z extent at the cut (0.5 mm).

**F6 The 5 std windows not matched to elevations** (GF A3, C2; FF C0, CE, F1).
- The writer is right: the std elevation glazing equals the IFC window bboxes, and the plan window boxes equal them too.
- **Cause:** `mark_dx_set.js` stores grid positions with `Math.round(c)`. The std grid lines sit on 0.5 mm (208.5, −17591.5 …), and JS rounds −x.5 toward +∞. So the −X / −Y elevations (REAR, LEFT) align 1 mm off, which is more than `snap_tol` 1 mm.
- **Probe** (a scratch copy of the script with 0.1 mm rounding, R5): `GAP:no_elevation_match` 5 → 0; DW-windows Level 1 4/4, Level 2 18/18.
- Fix belongs to L2 (`mark_dx_set.js`); reported, not edited.

**L1.4 results (2026-10-16, BIMCompiler `fix/std2d-det-r3`).**
- **F3:** W1 and W1-proc PASS with every run in a different folder (5 seeds × folder names and depths). W1-proc-control still differs with the fix disabled.
- **F4 roof plan:** W8 PASS. The outline equals the Roof-storey wall envelope (0..8800 × −17800..0) and the skylights match 2/2. W8-control (outline moved 50 mm) FAILS as required.
- **F5 section:** cut at X = 2304.25. W9 PASS: 11 slab/roof cuts, every z extent equals the DB. W9-control FAILS as required.
  - Reader unit tests `test_section.js`: 17/17 PASS.
  - Witness `rosetta_dx_section.js`, all PASS:
    - **SX1:** FF slab 2.795..3.100 (t = 0.305) equals the source IfcSlab.
    - **SX2:** GF −0.127..0.
    - **SX3:** roof 6.000..6.457.
    - **SX-slabZ:** PASS.
    - **SX-control:** the FF underside moved 50 mm reads 2.745 and FAILS SX1, as required.
- **Regression:**
  - `tests/dxf2bim/test_*.js` 17/17 suites `SUMMARY fail=0`. test_qualify M1 now uses `@VIEW=DETAIL` as its invalid view, because SECTION is valid now.
  - `rosetta_dx_shell` (old set): 35 PASS + the known RF-d.
  - `rosetta_qualify`: `SUMMARY fail=0`.
  - `rosetta_dx` with `STD_DIR`: `SUMMARY fail=0`.
- **Still blocking the std verdict** (unchanged at 160, because the new sheets are not in the qualify input yet):
  - `QF:set_no_roof` 1 and `QF:set_storey_unstated` 1: need DX_ROOF_std marked (`mark_dx_set.js std`, L2) and fed to DXSET=std rosetta_dx_shell / rosetta_qualify.
  - `GAP:slab_no_underside` 2: needs DX_SECTION_std marked per this section and the std shell pipeline to pass `{section}` to `slabZ`. dxf2qualify must also accept a SECTION-role sheet.
  - `GAP:no_elevation_match` 5: the F6 marker rounding.
  - `GAP:no_elevation_height` 54 (14 with @WALLTOP), `GAP:opening_unclassified` 74, `GAP:no_host_cut` 19, `QF:elev_height_dim_missing` 4: pre-existing L2 / reader items.

### L1.5 Plans show what the cut plane cuts, not storey membership (2026-10-16)
Written before the code. BIMCompiler branch `fix/std2d-plan-cut` (off master 73ad2c00f).

**Problem (L2.7 result: std set blocked 8, all FF doors 150/152).** `write_plan` drew a section-cut element only when the element's *storey* was the plan's storey. Two Duplex walls, `2O2Fr$t4X7Zf8NOew3FLTF` and `2O2Fr$t4X7Zf8NOew3FL8v`, belong to "Level 1" but run from z 2.612 to 6.000. The FF plan cut (Level 2 elevation 3.100 + `CUT_OFFSET` 1.200 = **4.300 m**; GF: 0.000 + 1.200 = 1.200 m) passes through them, yet the FF plan omitted them. Without their jambs, doors 150/152 had no opening box, host, height or cut.

**Rule P1 (drafting standard).** A floor plan shows every element cut by that plan's cut plane, whatever storey the model assigns it to.
- **Cut contours:** IfcWall/IfcWallStandardCase/IfcColumn/IfcDoor/IfcWindow whose DB z-range strictly contains the cut height (`minZ < cut_z < maxZ`, the `section_cut` CUT test) are drawn. The storey filter on cut contours is removed.
- **Plan walls:** the same set (walls whose z-range contains the cut height) drives the R12 layer choice (on a grid axis → A-WALL-FULL), the envelope and the R8 face runs.
- **Opening symbols stay with storey membership:** door arcs (§L1.2) and window sill lines (R10) still come from the storey's IfcDoor/IfcWindow. An opening belongs to the storey whose floor it opens from.
- A wall that spans two plans' cut heights appears on both plans. On the Duplex no wall spans both 1.2 and 4.3 (query: 0 walls with `minZ < 1.2 AND maxZ > 4.3`). The two walls above appear only on FF, because they start at 2.612, above the GF cut.
- **Log:** `§PLAN_CUT view=… cut_z=… walls=n (other-storey walls=k: guid@storey …)`.

**Tests (`test_std2d.py`).**
- W2 and W3 expectations are recomputed from the DB by cut height, not storey. The test's own query `walls_cut(db, cut_z)` replaces `walls_bbox(db, storey)` for the plan being checked; the grid stays derived on the grid storey (R2).
- **W10 (issue: an element cut by the plan's cut plane is missing, or one not cut is drawn):**
  - every DB wall whose z-range contains the cut height has ≥1 contour tagged with its GUID on that plan, and no other wall does
  - FF must contain LTF and L8v
- **W10-control:** a copy of the FF plan with the LTF contours deleted must FAIL W10.
- **Pipeline double count:** `rosetta_dx_shell` (DXSET=std) is checked so that each source wall is reconstructed once. The same model wall drawn on two plans must not become two 3D walls. If it does, this is reported, not hacked. On the Duplex no wall is on two plans (see above).
- **Re-run from master:** std2d `--door-ops`, then `mark_dx_set.js std <door_ops.db>`, `DXSET=std rosetta_dx_shell.js`, `rosetta_qualify.js`. The target is std set blocking = 0.

**L1.5 results (2026-10-16, BIMCompiler #188, from master 73ad2c00f).**
- `§PLAN_CUT`: FLOOR_GF cut_z 1.200 has 17 walls, 0 from other storeys. FLOOR_FF cut_z 4.300 has 19 walls; 2 belong to another storey (`…FL8v`, `…FLTF` @ Level 1).
- **test_std2d:** `fail=0`.
  - W10 GF 17/17, FF 19/19.
  - W10-control FAILS, as required.
  - The origin/master FF plan FAILS W10, missing exactly the 2 walls.
- **Std Duplex qualify:** **qualifies, blocking 0** (was 8), advisory 36.
- **Regression:** unit suites 18/18 `fail=0`; rosetta_dx_section, rosetta_qualify and rosetta_dx std `fail=0`; rosetta_dx_shell old 33/3, unchanged.
- **R1a answer key** (`rosetta_dx`, `rosetta_dx_shell`): it took source walls by storey, so the 2 walls' 4 FF pieces read as "invented". Precision is now checked against every wall the plane cuts. Recall (R1b) stays storey-scoped (L2's call).
- **Open (reader/witness lane):** `rosetta_dx_shell` std OV Level 2 FAILS for doors 150/152 (`below=false`). Their host walls start at 2.612, but FF walls are rebuilt from the FF level 3.1, and OV samples only wall solids. Either the below-level part of a cross-storey wall is rebuilt (from the section or a marking), or the FF slab (2.795..3.1) counts as the material below.
- **Double count:** not exercised (no Duplex wall is on two plans). The reader has no cross-plan identity, so a wall drawn on two plans would become one 3D wall per plan.

### L1.6 Multi-storey acid test: openings from the host relation, columns, model storeys, one building grid (2026-10-17, before code)
Inputs: two real multi-storey models, re-extracted with the Node extractor only (`scripts/extractIFC2DB.js`), DBs outside git.
- **SampleCastle** `Ifc2x3_SampleCastle.ifc` (IFC2X3, 6 storeys -1000/0/3000/6000/9000/12000 mm; 205 IfcDoor, 259 IfcWindow, 23 IfcColumn, 9 IfcStair, 0 IfcFooting). Only 74 IfcRelFillsElement / 79 IfcRelVoidsElement for 464 doors+windows (counted in the IFC text).
- **HHS Office structure** `opensourceBIM_HHS_Office_construction.ifc` (the federated set's structural model: 257 IfcColumn, round; 36 walls; the architect model has no column). Run separately for COL1 (`construction2.ifc` is again a one-GlobalId-edit copy).
- **HHS Office** `opensourceBIM_HHS_Office_architect.ifc` (IFC2X3, 4 storeys; 133 IfcDoor, 0 IfcWindow: the facade is IfcCurtainWall + IfcPlate/IfcMember; 0 IfcFooting). `architect2.ifc` is the same file with one wall's GlobalId and Name edited (1-line diff, `3XrBtx9eX7mQE6EqWHPk0L` → `…k0a`, "New Wall"): a change-detection copy, not a federated source. `architect.ifc` is used.

Problem (user, 2026-10-17): "we could not even place the knife cut right … sometimes we cut too low or too high and not catch the openings on the floor plan". Measured on the Duplex already: Level 2 has 18 IfcWindow, 8 of them do not cross the 4.300 m knife (4 at z 3.200–3.959, 4 at 4.851–5.610), so today's FF plan shows them on a solid wall.

**P0 Extractor prerequisite (Node extractor, additive tables only, #181 contract).** std2d read its geometry and hosts from the old Python-schema DB (`elements_rtree`, `base_geometries`, `rel_fills_host`) and only `door_operation` from the Node DB. The Node DB has none of those. New tables, written after every existing table; every existing table unchanged row for row:
- `element_world_bbox(guid TEXT PRIMARY KEY, minX REAL, maxX REAL, minY REAL, maxY REAL, minZ REAL, maxZ REAL)`: world AABB in metres of the tessellated mesh (the same world vertices the extractor already centres and stores; the same autoScale), one row per element with a transform row, IfcOpeningElement included (openings have no mesh blob, so their bbox is otherwise not in the DB). Plain REAL (double), not an R*Tree: an R*Tree stores float32 and needs an integer id; the Node `elements_meta` has none. The name is deliberately not `elements_rtree`: viewer `section_cut.js`/`elevation.js` switch on that table name and join `m.id`, which a Node DB does not have.
- Mesh: no new table. `component_geometries` (vertices float32 xyz relative to `element_transforms.center_*`, faces int32 triples) is the same layout as the old `base_geometries`; std2d reads it.
- `rel_fills_host(opening_guid TEXT PRIMARY KEY, host_guid TEXT, filling_guid TEXT, host_class TEXT, filling_class TEXT, provenance TEXT DEFAULT 'ifc:recovered')`: the schema `cross_edges.js` already reads (PATHB, `extractIFCtoDB.py extract_rel_fills_host`): one row per IfcRelVoidsElement opening; filling from IfcRelFillsElement on the same opening, NULL for a void-only opening.
- `element_pset_common(guid TEXT, pset TEXT, name TEXT, value TEXT, source TEXT, PRIMARY KEY(guid, pset, name))`: `IsExternal` and `LoadBearing` from any `Pset_*Common` (e.g. Pset_WallCommon, Pset_ColumnCommon) on an extracted element; `value` 'TRUE'/'FALSE'/'UNKNOWN' as written (IfcBoolean/IfcLogical); `source` 'occurrence' (IfcRelDefinesByProperties) or 'type' (the type object's HasPropertySets); occurrence wins over type for the same pset+name (IFC rule: occurrence properties override type properties).
- `storey_elevation(guid TEXT PRIMARY KEY, name TEXT, elevation_attr_m REAL, placement_z_m REAL)`: per IfcBuildingStorey its `Elevation` attribute and its ObjectPlacement origin z resolved to world, both × the file length unit (IfcProject.UnitsInContext, as door_operation; null when unresolved). Needed because `spatial_structure.elevation` (§S18) is written in file units when the geometry is not autoScaled (SampleCastle: −1000/0/3000 for metres geometry).
- Log: `§WORLD_BBOX rows=`, `§REL_FILLS_HOST rows= filled= void_only=`, `§PSET_COMMON rows= occurrence= type=`, `§STOREY_ELEVATION`.
- std2d (and `section_cut.py`, `test_std2d.py`) read ONE DB through `model_db.py`, which exposes per-connection temp views `m_bbox(guid,minX..maxZ)`, `m_geom(geometry_hash, vertices, faces, vertex_count, face_count)`, `m_fills(filling_guid, host_guid, opening_guid)` over either schema (Node tables above, or the old `elements_rtree`/`base_geometries`/`rel_fills_host(element_guid, host_guid)`).
- **Tests `scripts/witness_extract_2d_tables.py`** (oracle IfcOpenShell, independent of web-ifc):
  - E1 regression: origin/master extractor vs this one on the 5 #181 IFCs: every pre-existing table identical row for row (only `import_date` differs); the only new tables are the 3 above (issue: an additive table changed an existing output).
  - E2 `rel_fills_host` rows equal the IfcOpenShell IfcRelVoidsElement ∘ IfcRelFillsElement chain (opening, host, filling, classes) on the 5 IFCs + SampleCastle + HHS (issue: host relation missing or wrong). E2-control: a copy with one IfcRelFillsElement removed must show exactly that filling as NULL.
  - E3 `element_world_bbox` equals min/max of `component_geometries` vertices + centre within 1e-5 m for every element with a mesh (issue: bbox not the stored mesh), and on the Duplex walls/doors/windows equals the old IfcOpenShell-tessellated `DX_extracted.db` `elements_rtree` within 1 mm (issue: a different world frame or scale).
  - E4 `element_pset_common` equals IfcOpenShell `get_psets` (occurrence over type) for IsExternal/LoadBearing on every element of the 7 IFCs (issue: property missing or wrong source).
  - Duplex proof: the std set from the Node DB (Duplex_ARC) vs from `DX_extracted.db` (old), same std2d: byte-identical, else every differing entity explained.

**R1' Storey elevation = the model's storey placement** (`storey_elevation.placement_z_m`, the frame the geometry is in) when the DB has it; R1 (min wall minZ) is the fallback, and a difference > 1 mm is logged `§LEVEL_R1_DIFF`. Measured: SampleCastle walls start below their floor (R1 gives −0.240 / 2.840 / 5.910 / 8.910 for storeys placed at 0 / 3 / 6 / 9 m), so today's knife sits 240 mm too low (0.960 instead of 1.200 above the floor): one cause of "cut too low". Duplex: R1 = IFC elevation 4/4 (§L1.1), unchanged; HHS: equal (0.0942 / 3.8 / 7.3).

**O Openings in plan from the host relation, not the knife.**
- O1 Host. (a) Authored: `rel_fills_host` filling → host (provenance `ifc`). (b) When the opening has no authored row (SampleCastle: 390 of 464): the host is the wall whose own mesh, sliced at the opening's mid-height (minZ+maxZ)/2, has a hole covering the opening's plan centre along the wall (provenance `mesh_void`: the void is in that wall's geometry, extracted, not a proximity guess). Zero or several such walls → `GAP:opening_no_host`. A host that is not IfcWall/IfcWallStandardCase (curtain wall, slab, roof) → `GAP:opening_host_not_wall`; a non-orthogonal host → `GAP:opening_host_not_orthogonal`.
- O2 Gap. Every IfcDoor/IfcWindow of the storey (storey membership, §L1.5) cuts a gap in its host's plan contour on that storey's plan, whatever its sill height. Gap = rectangle: along the wall = the IfcOpeningElement's plan extent (authored) or the measured hole edges in the mid-height slice (mesh_void); across = the host wall bbox ±1 mm. The wall contour polygon minus the rectangle is drawn (shapely difference; pieces < 1 mm² dropped), only when the contour actually overlaps the rectangle (an opening the knife crosses already has its hole in the cut, and is left as cut). Host not cut at this plan → `GAP:opening_host_not_cut`.
- O3 Symbol by position relative to the cut plane: crossing → the cut contour (as today); wholly above (minZ ≥ cut_z) → the filling's plan bbox outline on `A-GLAZ-OVHD` / `A-DOOR-OVHD`, linetype DASHED (drafting convention: overhead = dashed; ezdxf's standard linetype set has no HIDDEN, and a layer naming an undefined linetype is an invalid DXF: seen in the first render), gap still shown; wholly below (maxZ ≤ cut_z) → outline on `A-GLAZ` / `A-DOOR` continuous (seen below the cut). Window sill lines (R10) and door arcs (§L1.2) unchanged.
- Log `§OPENING guid= cls= host= host_source=ifc|mesh_void pos=cut|above|below gap=drawn|in_cut`.

**C Columns as columns.**
- C1 IfcColumn cut contours go on `S-COLS` (IfcColumn is a structural member by its IFC definition), or `A-COLS` when the model states `Pset_ColumnCommon.LoadBearing = FALSE`; closed polyline + SOLID hatch on the same layer (filled section symbol). No longer on A-WALL-*.
- C2 Columns are grid evidence: a plan-storey column's axis = the mean of its distinct plan mesh vertices, accepted when they are equidistant from it or point-symmetric about it within 1 mm (rectangle, square, rotated rectangle, the regular polygon of a round column: web-ifc tessellates the HHS d = 300 columns as 11-gons, so neither the bbox centre nor point symmetry works); it contributes one X and one Y grid entry through that axis (common practice: grid lines run through column centres); otherwise `GAP:column_not_symmetric`. Merged as R5. (Amended after the first HHS structural run: its 257 columns are round, d = 300, so the R3 orthogonal test rejected all of them.)

**N Storeys from the model.** Plan view key = `FLOOR_<storey name>` (upper case, every run of non-alphanumerics → `_`), title `<STOREY NAME> PLAN (FFL ±z.zzz)`. The GF/FF list is retired. The Duplex reader harness maps its sheets by storey (see Regression).

**M One building grid.** Grid evidence is collected on every plan storey (each against its own wall envelope), merged once, labelled once (R6) and drawn on every plan, elevation and section. With the Duplex footing regime this gives the same lines as before (Level 1/2/Roof exterior axes are identical: x 0.2085/8.5915, y −17.5915/−0.2085).

**LB Load-bearing without footings.** R4(a) (bears on a foundation wall) needs IfcFooting; neither model has one. Evidence that remains, each stated, never a name:
- LB1 the model's `Pset_WallCommon.LoadBearing = TRUE`;
- LB2 vertical continuity: a parallel wall on the storey directly above or below whose thickness band strictly contains the wall axis with overlap ≥ 50 % of the wall length (the R4(a) test with the adjacent storey in place of the foundation);
- LB3 exterior (R4(b), per storey envelope);
- LB4 columns (C2).
When a foundation storey exists (Duplex), R4(a)+R4(b) on the grid storey govern as before and LB1/LB2 are not used. No footing → grid storey = the lowest storey with walls.
- Precedence (amended 2026-10-17 after the first SampleCastle run, before re-running): a model statement wins over inference. A wall whose `LoadBearing` is stated (TRUE or FALSE) is judged by LB1 alone; LB2 applies only to walls with no statement. Measured: with LB2 applied to every wall SampleCastle gets 55 × 50 grid lines (221 walls gridded by continuity alone, most of them stated `LoadBearing = FALSE`); with the precedence 27 × 31. HHS states FALSE on all 112 walls, so its grid is exterior-only.

**Out of scope here (stated):** stair symbols (the cut outline of IfcStair/IfcStairFlight only, if the cut passes; no tread arrows); curtain-wall plan symbol (HHS facade: its panels are IfcPlate/IfcMember with storey "Unknown"); elevations stay envelope bbox rectangles; roof = bbox; skewed walls stay `GAP:wall_not_orthogonal`; only SINGLE_SWING doors get arcs.

**Tests (`2D_Layout/python/test_std2d_acid.py <db> --dir <std dir>`; expectations from the DB with the test's own queries; runs on any std set, so the same checks measure master = "before").**
- OP1 (issue: an opening the knife misses is drawn on a solid wall): per plan storey, every IfcDoor/IfcWindow of the storey with a wall host (authored or mesh_void) has zero host-contour area inside its gap rectangle shrunk 1 mm along the wall; count == model count; openings wholly above the cut also have a HIDDEN outline tagged with their GUID. Reported per storey: model / wall-hosted / gap.
- COL1 (issue: columns drawn as partitions or not gridded): every IfcColumn whose z-range contains a plan's cut_z has a closed polyline + hatch on S-COLS/A-COLS tagged with its GUID, none on A-WALL-*, and its centre is within 10 mm of an X and a Y grid line.
- DIM1 (issue: a missing or wrong tier): on every plan, every side has the three tiers (T1 overall / T2 grid-to-grid / T3 detail), each DIMENSION = its points' distance = the model within 0.5 mm (T1 envelope of the cut walls, T2 consecutive building-grid lines, T3 points = coordinates of the cut walls' mesh vertices or opening/void bbox edges), no text override.
- GRID1 (issue: an unreadable or per-storey grid): labels sequential, I/O skipped, no duplicates, both bubbles; identical grid (positions within 0.5 mm, labels) on every plan; the line set equals the test's own recomputation of M/LB/C2.
- OP1-knife (issue: "cut too low"): the writer re-run with the knife at 0.3 m above each storey (below every sill and most door heads stay crossed; master and §L1.6 alike, CUT_OFFSET patched in the run only) and OP1 at that knife. With the 1.2 m knife the three models have no wall-hosted opening the knife misses, so OP1's gap rule is only exercised by this run.
- DIM1 T3 oracle: the cut walls'/columns' mesh vertex coordinates, plus their slice points at the knife (a sloped wall end is cut mid-edge), plus opening/void bbox edges.
- Mutations: OP1-control (a copy of a plan with one above-cut gap filled by a host-tagged rectangle) must FAIL OP1; COL1-control (one column contour moved to A-WALL-PRTN) must FAIL COL1; GRID1-control (one bubble relabelled on one storey) must FAIL GRID1; DIM1-control (one T3 point moved 50 mm) must FAIL DIM1.
- **Regression:** `test_std2d.py` (Duplex) `fail=0`; its W2/W3/W10 oracles follow O2 (the 8 Level 2 knife-missed windows now cut gaps, so T3 gains their jambs: still wall-mesh vertex coordinates, the hole edges). Duplex std chain: `mark_dx_set.js std` maps its sheets by storey from the std log, then `DXSET=std rosetta_dx_shell` (was 36/0) and `rosetta_qualify` (0 blocking): changes reported, not hacked.
- **Reader chain on SampleCastle:** as far as it goes; what is Duplex-specific in `mark_dx_set.js` / `rosetta_dx_shell.js` is listed, not hacked to green.

**L1.6 results (2026-10-17, BIMCompiler branch `feat/std2d-l16-multistorey`, off master).** Before = origin/master std2d.py run unmodified on a scratch copy of each Node DB given the old table names; after = this branch. Knife 1.2 m unless stated.
- **P0 extractor** (`witness_extract_2d_tables.py`): E1 5/5 IFCs every pre-existing table identical row for row (1028 / 4384 / 266 / 266 / 29 rows); E2 rel_fills_host = IfcOpenShell chain on 8/8 IFCs (first run caught `IfcWallelementedcase`: the class name is now the web-ifc schema class name); E3 bbox = stored mesh ≤ 0.002 mm on 8/8, and = the old IfcOpenShell `elements_rtree` ≤ 0.003 mm on 95 Duplex walls/doors/windows; E4 psets = IfcOpenShell 8/8; E2-control FAILS as required. New log `§GEOM_EMPTY`: web-ifc 0.0.77 tessellates to nothing 51 IfcWallStandardCase (the walls holding SampleCastle's authored openings), 4 IfcWall, 48 IfcCovering, 14 proxies; HHS 33 IfcCurtainWall. Those elements have no bbox/mesh row, so no plan draws them.
- **Duplex from ONE DB:** test_std2d `fail=0` on the old DB and on the Node DB. Old vs Node std set: same entity count in all 8 sheets; elevations/roof/section equal at 0.1 mm (bytes differ only in float digits); plans: 7 polygons differ by 6.9–23.9 mm² (web-ifc vs IfcOpenShell tessellation of door casings / window frames, and a 0.6 mm wall sliver). Two schema fixes found by this proof: R9 door leaf test now about the bbox centre (the Node mesh is stored about the vertex mean) and at 0.1 mm rounding (3 dp flipped −0.2085/+0.2085).
- **Acid (before → after), per storey:**
  - SampleCastle (4 plans): grid 1×1 → 28×31 (one grid on every storey, GRID1 FAIL → PASS); DIM1 FAIL (no T2) → PASS; COL1 0/9 → 9/9 columns as filled S-COLS, gridded; OP1 FAIL → FAIL: of 164/136/116/39 doors+windows only 9/7/7/10 have a wall host with geometry (all gapped, before and after); 128/110/101/18 have no host (no rel_fills_host and no wall void: the outer leaf is not an IfcWall), 27/19/8/11 are hosted by walls web-ifc did not tessellate; above-cut openings dashed 0 → 13/1/1/1. Storey elevations R1 → R1' (−0.24/2.84/5.91/8.91 → 0/3/6/9; knife was 240 mm low).
  - HHS architect (3 plans): OP1 36/43, 32/39, 31/34 gapped before and after (7/7/3 doors with no host: curtain-wall doors); DIM1 FAIL both (one X grid line, so no T2 on N/S: the facade is curtain wall, every wall states LoadBearing FALSE, no columns in this model); COL1 vacuous.
  - HHS structure (3 plans): COL1 0/257 → 257/257 (131/85/41, filled, gridded); grid 1×3 → 14×14; DIM1, GRID1 FAIL → PASS.
  - Knife 0.3 m stress: no wall-hosted opening without its void already in the cut exists in the three models, so O2's subtraction never fires (`gap=drawn` 0); the dashed overhead symbols do (SC 97/89/66/9, Duplex FF 8). OP1-control (a re-filled gap) FAILS as required.
- **Regression:** Duplex std chain `rosetta_dx_shell` std 38/0 (master 38/0), `rosetta_qualify` std qualifies, blocking 0 (one pass on the way showed `QF:layer_unmapped` for the new A-GLAZ-OVHD; the std plan map now excludes A-GLAZ-OVHD / A-DOOR-OVHD / A-FLOR-STRS / S-COLS / A-COLS, stated); 19 reader unit suites `fail=0`.
- **Reader chain on SampleCastle:** `mark_dx_set.js` / `rosetta_dx_shell.js` are Duplex-specific (sheet list and storey names, `@SET=DX`, the old-schema DB and its SQL, one-character grid labels, HAXIS fitted to FLOOR_GF only), so no marking was written. Unmarked, the qualify verdict is blocked 26, all marking causes (10 sheets with no role, 10 with no units, no plan / roof roles, 4 faces with no elevation); the reader itself reports 714 `opening_unclassified`, 72 `no_host_cut`, 101 `wall_below_min_thickness` on the four plans.
- **Open:** web-ifc empty geometry (above); SampleCastle grid is dense (28×31 lines, many 40–200 mm apart: walls change thickness storey to storey; the 10 mm merge is the Duplex tolerance), so bubbles and T2/T3 texts overlap (seen in the PNG); 8 SampleCastle columns not symmetric (not gridded); curtain-wall plan symbol, stair symbol, elevations from faces: out of scope; mark_dx_set / rosetta generalisation to N storeys and the Node schema.

### L1.7 Hosts the voids remove entirely (2026-10-17, before code)
Finding (IfcOpenShell on `Ifc2x3_SampleCastle.ifc`, independent of web-ifc): the 51 IfcWallStandardCase with empty geometry (`§GEOM_EMPTY`) are window-frame walls (name `kozijn`, one extruded 1210 x 114 mm profile, depth 1850 mm), each with exactly one IfcRelVoidsElement. With `disable-opening-subtractions` all 51 tessellate (8 vertices); with the opening subtracted both engines return nothing: the opening removes the whole wall. So "host has no geometry" is not an extractor defect here; the model states a wall that is nothing but its void.
- **V1 rule.** An authored host (`rel_fills_host`) of class IfcWall/IfcWallStandardCase that has no `element_world_bbox` row and at least one void row is `host_voided`: nothing of it exists to cut a gap in. The filling symbol (O3) is still drawn; the opening is accounted `gap=host_voided`, not `GAP:opening_host_no_geometry`. No geometry is invented for the wall.
- **V2 witness (names its issue: a host miscounted as a defect, or a non-voided host hidden under the rule).** `witness_extract_2d_tables.py` E5: for every V1 host on the 8 IFCs, IfcOpenShell with `disable-opening-subtractions` yields vertices and with subtraction yields none; any V1 host failing this FAILS E5. Control: a V1 host whose opening is deleted from the IFC copy must leave the V1 set.
- **V3 acid effect.** SampleCastle openings hosted by such walls (27/19/8/11 per plan) move from GAP to accounted; the other 128/110/101/18 (no authored host, no wall void) are unchanged and remain `GAP:opening_no_host` until their host class is identified (next step).

- **V4 finding: the unhosted remainder is unstated in the model (measured 2026-10-17).** SampleCastle: 390 of 464 doors/windows have no IfcRelFillsElement (IfcOpenShell `FillsVoids` empty; the 74 that fill an opening sit in 60 IfcWallStandardCase and 14 IfcBuildingElementProxy). Where the other 390 sit (bbox centre +-20 mm, inside the element's z range): in no element 239, in an IfcWall bbox 59 (no void in that wall's mesh at the opening), in IfcCovering 53, in IfcSpace 27, other 12. The model states no host for any of them, so `GAP:opening_no_host` stands: choosing the IfcWall of the 59 would be a proximity guess, which O1 forbids. Closing this needs a user marking (`@TAG` host), not code.

## L2. Qualify verdict (reader side, module `dxf2qualify.js`)
Input: the set of sheets + markings + settings. Output: `{verdict: 'qualifies'|'blocked', blocking:[...], advisory:[...]}` per basic shape.
- **Blocking:**
  - units not user-stated
  - a storey with no plan role, or no `@LEVEL`
  - a building face with no elevation role
  - a layer neither mapped nor excluded
  - dimension text ≠ measured
  - a grid line on no wall axis or face (tol stated)
  - grid labels out of order or duplicated
  - elevation level ≠ plan level
  - any blocking GAP from walls / slabs / roof / openings
- **Advisory:** type_unbound, schedule_conflict, label_* gaps.
- **Tests:**
  - Q1 Duplex marked set → qualifies
  - Q2 Duplex with the mark layer stripped → blocked, exactly the missing markings listed
  - Q3 jscad → blocked on units (header ≠ drawing) and unmapped layers
  - Q4 Farmhouse marked → its true list
  - Q5 mutation: alter one DIMENSION text → blocked with that handle

### L2.1 Refinements before coding (2026-10-16)
Read first: BIMCompiler `deploy/dev/dxf2{marks,bim,elev,shell}.js`, `tests/dxf2bim/rosetta_dx_shell.js`, `farm_*.js`, `t8_sandbox.js`, and the L1.1 rules (R4-R12) in the L1 worktree. Measured on the inputs (2026-10-16):
- Duplex sheets: there are no DIMENSION entities; dimensions are exploded LINE + TEXT on A-ANNO-DIMS ("8800", "3200mm"). Grid lines lie on the envelope's outer faces (x 0 / 8800, y −17800 / 0), with letters on constant-X lines and numbers on constant-Y lines. Elevation level lines are at 0 / 3.2 / 5.6 / 6.0 / 6.5 (sill, head and ceiling datums are mixed in); there is no line at Level 2 = 3.1.
- jscad: 63 DIMENSION entities with no override; their block text is feet-inches (`3'-1"` for a raw measurement of 37), while `$INSUNITS` = 4 (mm).
- Farmhouse: 467 DIMENSION entities on A-DIMSx, 91 with overrides (`EQ`, `VARIES`, `15' TYP`, …), `$DIMLFAC` 0.99985. Two marked regions.

**Contract.** `Dxf2Qualify.qualify(input, settings)` is a pure function. It is UMD and loads in a browser as `root.Dxf2Qualify` with `Dxf2Marks` and `Dxf2Bim`. It reads its input and never changes it; it never fixes or fills anything. Same input gives the same output, byte for byte, whatever the entity order.
- `input.files[]` = `{name, dxf, layer_maps | layer_maps_by_view{PLAN,ELEV}}`. `dxf` is the dxf-parser output (entities, header, blocks). One file holds one sheet, or one sheet per `@REGION` (`Dxf2Marks.describeAll`). The sheet id is `name`, or `name#k` for the k-th region in describeAll order. Entities belong to a region by the reader's rule: all of their points are inside. Entities fully inside an `@EXCLUDE` are left out. Entities outside every region are not part of the set and are not judged.
- `input.plan_ops{sheetId: ops}` = the plan pipeline's ops (DXF_WALL rects in metres). `input.gaps[]` = the pipeline's gap records `{code, sheet, handle?, shape?, …}`.
- Output: `{verdict: 'qualifies'|'blocked', blocking[], advisory[], by_shape{walls,slabs,roof,openings}: {verdict, blocking, advisory}, sheets[], checks[]}`.
  - Item = `{code, shape, sheet, handles[], pos:{x,y}|null, message}` plus detail fields. `pos` is in that sheet's raw drawing coordinates (for zoom). It comes from the first handle's entity, or from the stated geometry.
  - Items are sorted by code, sheet, first handle (numeric), then message.
  - `shape: 'set'` blocks all four shapes. A shape qualifies only when no blocking item has its shape or `set`.
- **Unverifiable = not qualified.** When a check needs an input that is absent (plan ops, a setting), it emits a blocking item (`QF:check_skipped` or `QF:setting_missing`). The check is never passed silently.
- Role-independent checks run on every sheet: layers, unit evidence, and dimension texts. They use the `@UNITS` factor, or `$INSUNITS` when units are unstated.
- Role-dependent checks need the role and `@UNITS`: grid, dimension coverage, and elevation. A sheet without them gets only its marking items for these checks.

**Settings** (metres; no defaults; each traces to a stated source). A missing one gives `QF:setting_missing {need}`.
- `tol.grid` 0.010 (L1.1 R5)
- `tol.dim` 0.0005 (L1 W3)
- `tol.level` 0.003 (`CFG.elev_tol`, rosetta_dx_shell)
- `tol.align` 0.001 (rosetta_dx_shell's `MK.align` call)
- `grid.min_wall_len` 1.0 (L1.1 R4)
- `layers.grid`, `layers.dims`, `layers.bearing`: exact layer names. Duplex / L1 output: A-GRID, A-ANNO-DIMS, A-WALL-FULL (R12: walls on a grid axis are A-WALL-FULL).

**Blocking codes**
- Markings (all `shape: set`):
  - `QF:sheet_no_role`: no `@VIEW`.
  - `QF:units_unstated`: no `@UNITS` (checked on every sheet, with or without a role).
  - `QF:plan_no_level`: a PLAN without `@LEVEL`.
  - `QF:mark_missing {keys}`: any other `MARK:missing` key.
  - `QF:mark_invalid {mark_code}`: every other `MARK:*` error (malformed, conflict, view_ambiguous, set_mismatch, axis_face).
  - `QF:set_mismatch`: files carry different `@SET`.
  - `QF:set_no_plan`: no sheet is a PLAN.
  - `QF:plan_level_duplicate`: two plans state the same `@LEVEL`.
  - `QF:face_no_elev {face}`: see "face covered" below.
  - `QF:elev_align_fail {mark_code}`: `Dxf2Marks.align(refPlan, elev, tol.align)` fails (align_fail or level_scale_fail).
  - The reference plan is the PLAN with the lowest `@LEVEL`. It is the grid storey, per L1.1 R2.
- **A building face covered:** the building's faces are the 4 orthogonal sides of the plan envelope, minX, maxX, minY and maxY. The envelope is the axis-aligned bbox of the reference plan's DXF_WALL rects. A face is covered when some ELEV sheet states `@FACE` = that side. Its alignment is reported separately, as `elev_align_fail`, so one fault is not listed twice. A non-rectangular plan still has exactly these 4 faces. A recessed face is not a separate face in v1.
- `QF:units_conflict {implied}`: dimension evidence contradicts the units. A DIMENSION's displayed text carries an explicit unit (feet-inches `'`/`"`, or a `mm`/`cm`/`m` suffix). Its length disagrees with the measurement × `$DIMLFAC` × the sheet factor (the `@UNITS` factor if stated, else `$INSUNITS`). It agrees with exactly one other unit in the reader's table (mm, cm, m, in, ft). There is one item per sheet, holding all such handles. Those dimensions are then not reported again as `dim_text_mismatch`. This is the jscad case: `$INSUNITS` mm, while the drawing's own dimensions are in inches.
- `QF:layer_unmapped {layer, count}`: a layer has entities in the sheet scope, but no rule in that sheet's layer maps matches it. A rule of type `ignore` counts as excluded. The `DXF2BIM-MARK` layer is the reader's own. There is one item per (sheet, layer), carrying all of its handles. The pipeline's own `GAP:unmapped_layer` records are folded into this item, not double-listed.
- Dimensions (G3; on PLAN and ELEV sheets; `layers.dims`):
  - Measured value (DIMENSION type 0 rotated): the projection of p13→p14 on the group-50 angle. Type 1 (aligned): |p14 − p13|.
  - Displayed text: the override (group 1). If there is none, it is the dimension block's single TEXT/MTEXT. `<>` means "measured". MTEXT codes are stripped.
  - Types other than 0/1 (angular, radial, ordinate) are not checked; they are counted in `checks`.
  - Text grammar: a decimal number (drawing units), or `F'`, `F'-I"`, `I"`, `I N/D"`, `F'-I N/D"`, or a decimal with `mm|cm|m`.
  - The tolerance is max(`tol.dim`, half of the text's last written unit). For example, `8800` gives 0.5 mm, and `6'-6"` gives 0.5 in.
  - `QF:dim_text_mismatch {text, measured}`: the text parses, and its length ≠ measured × DIMLFAC × factor.
  - `QF:dim_text_unreadable {text}`: an override that is not a length (`EQ`, `15' TYP`). G3 forbids overrides, and this one cannot be verified.
  - `QF:dim_not_entity {text}`: a TEXT/MTEXT on a dims layer that parses as a length but is not a DIMENSION entity (an exploded dimension). Each such text is one item.
- Grid (G1, G2; PLAN sheets; `layers.grid`):
  - Grid line: a LINE or 2-point LWPOLYLINE that is axis-parallel within `tol.grid`. A skew one is advisory `QF:grid_line_skew`.
  - Label: the single TEXT/MTEXT whose insertion point lies inside a CIRCLE (on a grid layer) centred on the line (perpendicular distance ≤ `tol.grid`).
  - `QF:grid_unlabelled`: a line has no bubble label.
  - `QF:grid_label_conflict`: a line's two bubbles disagree.
  - `QF:grid_off_axis {pos}`: a grid line is within `tol.grid` of no DXF_WALL rect's axis (centre across the thickness) and of no rect face. Any wall layer counts.
  - `QF:grid_missing {axis, pos, walls}`: a wall piece on a `layers.bearing` layer, with length ≥ `grid.min_wall_len`, has no parallel grid line within `tol.grid` of its AXIS (G1, R3/R4). Pieces are merged per position within `tol.grid`. A grid on a face does not satisfy G1.
  - `QF:grid_label_dup`: two lines carry the same label.
  - `QF:grid_label_series`: a constant-X line is not labelled with a number, or a constant-Y line is not labelled with a letter (G2 / R6).
  - `QF:grid_label_order`: sorted by position, the labels are not exactly 1..n (left→right) or A..(n), skipping I and O (bottom→top).
- Plan dimension strings (G3, per side, 4 sides):
  - A DIMENSION is on side S when its dimension-line point (group 10) lies outside the envelope on S, and it measures along S.
  - Required spans: (1) the overall envelope extent along S; (2) each consecutive grid-to-grid interval.
  - Required points: (3) the ends of the union of the exterior wall-pieces' runs on that face. These are the rects whose outer face lies on the envelope face within `tol.grid`; runs within `tol.dim` merge; the points include the envelope corners (R8).
  - A span is covered by a DIMENSION on S whose [min, max] along S equals it within `tol.dim`. A point is covered by a definition point (13/14) of a DIMENSION on S.
  - Codes: `QF:dim_missing {side, kind: overall|grid, span}` and `QF:dim_point_missing {side, at}`.
- Elevations (G4; ELEV sheets that align):
  - `QF:elev_grid_missing {label}`: a reference-plan grid line runs perpendicular to the face (its axis = the `@HAXIS` axis) and lies within the face extent. The elevation has no grid line with the same label at its projected `h` within `tol.grid`.
  - `QF:elev_level_mismatch {level}`: a plan `@LEVEL` (every plan in the set), or the elevation's `@ROOF`, has no level line (a layer typed `levelline`) at that z within `tol.level`. The message names the nearest line.
  - `QF:elev_roof_unstated`: the elevation has no `@ROOF` (the G4 roof datum).
  - `QF:elev_height_dim_missing {span}`: the datums are the plan levels ∪ `@ROOF`, sorted. Each consecutive interval, and the overall lowest→roof, needs a vertical DIMENSION in that elevation whose z-span (via the `@Z` calibration) equals it within `tol.dim`.
- Pipeline gaps: every `input.gaps` record whose code is not advisory is blocking, as `GAP:*` with its own code.
  - Shape: the record's `shape` if given. Otherwise `kind` door/window → openings. Otherwise this stated table:
    - `slab_*` → slabs; `roof_*` → roof
    - `wall_*`, `no_elevation_height`, `elevation_height_conflict`, `no_elevation_for_face`, `no_height`, `duplicate_footprint`, `zero_length`, `bad_outline`, `layers_sum_mismatch` → walls
    - `door_*`, `window_*`, `opening_*`, `fill_*`, `no_lod*`, `lod*`, `no_host*`, `gap_height_conflict`, `no_elevation_match`, `unknown_block`, `no_fill_geometry`, `type_*` → openings
    - anything else → set
- `QF:check_skipped {check, need}`: a check cannot run because its input is absent (for example, no plan ops for a PLAN sheet).

**Advisory codes:** `GAP:type_unbound`, `GAP:schedule_conflict`, `GAP:label_*` (L2), `QF:grid_line_skew`, and `QF:dim_override_equal` (an override whose value equals the measurement: G3 forbids it, but the value is right).

**Not checked in v1 (stated):**
- A storey that has no plan sheet at all. Storeys are known only from plans; elevation datums mix sill, head and ceiling lines (measured above), so they cannot name storeys. The editor's sheet list is where a missing storey shows.
- Roof plan sheets: dxf2marks has no roof view, and `@VIEW` is PLAN|ELEV only. A roof plan in the set is therefore `QF:sheet_no_role` until a role exists (open question).
- G5-G7 layer names and door/window symbols.

**Tests** (`tests/dxf2bim/test_qualify.js`, script-written fixtures; each names its issue):
- Q1: a complete marked fixture set (plan + 4 elevations, real DIMENSIONs, grid on axes) → `qualifies`, 0 blocking.
- Q2: the same set with the mark layer stripped → blocking is exactly 5×`sheet_no_role` + 5×`units_unstated` + `set_no_plan` + 4×`face_no_elev`, and nothing else.
- Q3: a jscad-like fixture (header mm, feet-inch dims, unmapped layer) → `units_conflict {implied: in}` + `layer_unmapped`. With `@UNITS=in` stated, the conflict goes.
- Q4: a two-region file → entities outside the regions are not judged; an `EQ` override gives `dim_text_unreadable`; an equal override is advisory.
- Q5 (mutation): change one DIMENSION's text in the Q1 set → blocked, exactly one `dim_text_mismatch` carrying that handle.
- Plus:
  - every G-check broken once, each named
  - shuffled entity order gives an identical verdict
  - the input is unchanged after qualify (hash before = after)
  - pipeline advisory vs blocking gaps

Real data: `tests/dxf2bim/rosetta_qualify.js`. It reports the true list for each of these and asserts nothing about Duplex passing, since L1 is pending:
- Duplex marked (elevations from `out/marked_shell`, plus the unmarked ROOF sheet)
- Duplex stripped (the difference from marked must be marking codes only)
- jscad (Q3)
- Farmhouse (Q4)
- the Q5 mutation on a real DIMENSION (Farmhouse)

Duplex pipeline gaps come from `rosetta_dx_shell.js` (main variant A), which writes them to the git-ignored `out/marked_shell/dx_shell_gaps.json`. Configs are not copied: the DX / Farmhouse / jscad maps and configs move into `tests/dxf2bim/set_configs.js`, and the scripts import them.

### L2.2 Results (2026-10-16; BIMCompiler `deploy/dev/dxf2qualify.js`)
- `test_qualify.js`: 36/36 PASS.
  - Q1 qualifies with 0 blocking.
  - Q2 is exactly 5 `sheet_no_role` + 5 `units_unstated` + `set_no_plan` + 4 `face_no_elev`.
  - Q3 `units_conflict {in}` + `layer_unmapped`.
  - Q4 regions / `EQ` / equal override.
  - Q5: exactly one `dim_text_mismatch` carrying the changed handle.
  - One break per check (G1-G4, F, U, L, M, K, S, P). Order shuffle gives the same verdict, and the input is unchanged.
- `rosetta_qualify.js` (real sets): SUMMARY fail=0. Each set: verdict, then blocking items by code.
  - **Duplex marked (today, L1 pending): blocked, 358 blocking + 28 advisory (`type_unbound`).**
    - Drawing-standard items:
      - `grid_missing` 8: the 4 exterior wall axes per plan; the grids sit on the faces
      - `grid_label_series` 8: letters on constant-X lines
      - `dim_not_entity` 44: exploded dims plus scale-bar numerals on A-ANNO-DIMS
      - `dim_missing` 16, `dim_point_missing` 52
      - `elev_level_mismatch` 4: no Level 2 = 3.1 line; the nearest is 3.2
      - `elev_height_dim_missing` 12
      - `layer_unmapped` 31: A-ANNO-SECT on plans; the elevation maps do not exclude A-GRID / A-ANNO-* / A-TTLB / A-ROOF / 0
      - DX_ROOF: `sheet_no_role` + `units_unstated`, since no roof view exists
    - Pipeline gaps (variant A):
      - `opening_unclassified` 76, `wall_below_min_thickness` 40, `no_elevation_height` 36, `no_host_cut` 26, `door_below_min_width` 2, `slab_no_underside` 1
  - **Duplex stripped:** 94 blocking. The 17 items not in the marked verdict are all marking codes: 6 sheets × (`sheet_no_role` + `units_unstated`), `set_no_plan`, and 4 `face_no_elev`.
  - **jscad:** 133 blocking: `units_conflict` (63 feet-inch dims vs `$INSUNITS` mm), `units_unstated`, `sheet_no_role`, `layer_unmapped` 9, `setting_missing` 2 (grid / bearing layers), `set_no_plan`, `face_no_elev` 4, and plan-run gaps.
  - **Farmhouse:** 51 blocking + 1 advisory:
    - `dim_text_mismatch` 1: elevation dim 44E1 reads `30"` but measures 25.01 in
    - `dim_text_unreadable` 2 (`EQ`)
    - `face_no_elev` 3, `elev_roof_unstated`, `layer_unmapped` 2 (title-block layers inside the plan region)
    - `check_skipped` 2 (the elevation region has no layer map)
    - `setting_missing` 2
    - plan-run gaps: `wall_line_unpaired` 26, `unsupported_entity` 7, `wall_pair_ambiguous` 5
  - Q5 on a real DIMENSION (Farmhouse 1F1A, override `99'-9"`): exactly one new `dim_text_mismatch` 1F1A; total 51 → 52.
- Regression:
  - 16 unit suites: SUMMARY fail=0
  - rosetta_dx_shell: 33/34, the known RF-d roof-top FAIL; its log differs only by the new gap-dump line
  - farm_heights: log identical
  - t8_sandbox: identical except timing (configs moved to `set_configs.js`)

### L2.3 Decisions on the L2 open questions (user, 2026-10-16), as rules before code
(Numbered L2.3 because L2.2 already holds the L2 results.) KISS and non-invent. Each rule names its test. These rules supersede L2.1 wherever they differ.
Measured first, on the L1 std set (BIMCompiler master 31aaca2db, `std2d.py` regenerated into the git-ignored `2D_Layout/output/STD/`):
- Header `$DIMLFAC` = 100, yet every dimension block renders 1:1 (block `*D2` text `4835`, measured 4835 mm). The header value is the default for new dimensions, not the factor of the ones that exist (the per-style value is not parsed).
- All overrides are `<>`.
- Elevations draw datums LEVEL 1 0, LEVEL 2 3.1, ROOF 6.0 (the model storey "Roof", 4 parapet walls 6.0-6.609) and T/ROOF 6.457 (the highest IfcSlab, R11). Elevation A-WALL rectangles start at 0, 3.1 and 6.0. There is no roof plan sheet.
- Doors: A-DOOR section contours only, no arcs (`GAP:door_hinge` ×14 in the writer log).

**D1 Roof role.**
- dxf2marks accepts `@VIEW=ROOF`. It requires `@SET @VIEW @UNITS @LEVEL @ROOF`:
  - `@LEVEL` = the roof storey level (R1)
  - `@ROOF` = the roof top (BASIC_SHAPES §5.3)
- A ROOF sheet gets the role-independent checks (layers, units, dimension texts). It gets no grid or dimension-string checks, because it has no walls.
- A ROOF sheet's `@LEVEL` is a stated level. Elevation datums and height chains use the plan levels, plus that level, plus `@ROOF`.
- `QF:set_no_roof` (shape **roof** only): the set has no ROOF sheet; the roof outline needs one (BASIC_SHAPES R-O).
- `QF:roof_level_mismatch`: an elevation's `@ROOF` differs from the ROOF sheet's `@ROOF` by more than `tol.level`.
- **Supersedes BIMCompiler BASIC_SHAPES_SPEC §11 CF-2** (merged in #180 while this was being written). CF-2 read a roof plan as "`@VIEW=PLAN` + `@ROOF`, no `@LEVEL`". The marking step of `rosetta_dx_shell.js` that writes `out/marked_shell/DX_ROOF_shell.dxf` now writes `@VIEW=ROOF`, plus `@LEVEL` = the "Roof" storey level from the model (R1: min wall minZ of storey "Roof", as `mark_dx_set.js` does for plans). `@ROOF` is unchanged (the value the elevations agree on).
  - The L3 Modeller import (`modeller/dxf2bim_import.js`) must read `view === 'ROOF'` as the roof role. This is a one-line change in that lane.
  - The set run_id changes, because the roof sheet text changes.
- Tests: QR1 roof sheet present → no roof item; QR2 roof sheet absent → `set_no_roof`, and only the roof shape is blocked; QR3 roof top differs → `roof_level_mismatch`.

**D2 Storeys come only from plans.**
- Storeys are the `@LEVEL` values of PLAN sheets. A ROOF sheet's `@LEVEL` also counts as stated.
- `QF:set_storey_unstated {level}`: an elevation shows a level band with no stated level.
  - A band is a bottom z (through the `@Z` calibration) at which the closed axis-aligned rectangles on `elevwall` layers starting there, taken together, cover the elevation's full width (the min..max h of all its elevwall rectangles, joints ≤ `tol.grid`).
  - Measured: the old set's wall pieces above windows start at 2.612 and 5.712 but do not span the face, so they are not bands. Its foundation rectangles at −1.25 do span it, and that is the model storey T/FDN, which has no plan.
- Band bottoms within `tol.level` merge. One item is emitted per unstated z, naming the elevation and its rectangle handles.
- Nothing is inferred from datum lines or texts.
- Test: QS1 an elevation band at 6.0 with no plan → `set_storey_unstated 6`.

**D3 Gaps count once, against the final stage.**
- `input.resolved{sheetId: [handles]}` = the handles that the final shell/cut stage resolved: every opening of a bridged void, those openings' part handles, and every placed fill's handle.
- `GAP:no_host_cut` and `GAP:opening_unclassified` on a resolved handle are dropped as superseded, and counted in `checks.gaps_superseded`. Every other gap is kept.
- Interior wall heights:
  - `GAP:no_elevation_height` on a wall-layer entity (its layer's rule type is `wall` or `wallline` in that sheet's maps) blocks.
  - The exception is a stated user convention: the new marking `@WALLTOP=<level>,slab_above` (any sheet; `<level>` must equal a PLAN `@LEVEL`, else `QF:walltop_unknown_storey`).
  - Covered gaps become advisory `QF:convention_applied`, and the verdict lists `conventions: [{level, rule, sheet, handle, source: 'user-stated'}]`.
  - Never a default: the marking tools do not write it. The rosetta shows the verdict without it and, separately labelled, with it.
- Tests:
  - QG1 superseded gaps dropped, others kept
  - QG2 interior wall gap blocks without `@WALLTOP`
  - QG3 advisory with it, plus `conventions` listed
  - QG4 a door's `no_elevation_height` still blocks under `@WALLTOP`
  - QG5 `@WALLTOP` naming no plan level → `walltop_unknown_storey`

**D4 G1 reader rule for any DXF.**
- `QF:grid_off_axis` (a stray grid line) is tested against the wall rects of EVERY plan in the set. Per L1.1 R2, one building grid is reused on all plans. Measured: std FF grid C (y −7.8285) has its wall only on GF.
- `QF:grid_missing` now applies to exterior envelope axes only: wall pieces whose outer face lies on the envelope face within `tol.grid`, with length ≥ `grid.min_wall_len`. Their axes merge within `tol.grid`, and each needs a parallel grid line.
- Interior grid coverage is a writer-side rule only (L1 W2). The setting `layers.bearing` is removed.
- Tests: QD4a an interior wall without a grid is not blocked; QD4b an exterior axis without a grid is blocked.

**D5 Dimension overrides.**
- A numeric text that differs from its measurement → `QF:dim_text_mismatch` (blocking), as before.
- Recognised drafting notes are advisory `QF:dim_note {note, measured_m}`, with the measured value shown in the message:
  - `EQ`
  - `VERIFY` / `V.I.F.`
  - `<length> TYP` / `TYPICAL` / `VERIFY` / `V.I.F.`, when the length equals the measurement. A differing length is `dim_text_mismatch`.
- Any other non-length override stays `QF:dim_text_unreadable` (blocking), e.g. `VARIES`, `80" MIN CLEAR`.
- Displayed text:
  - An override of `<>` or nothing means the dimension block's single text, which is now checked too. It is the CAD rendering of the measurement.
  - `$DIMLFAC` from the header is no longer applied (measured above). The measurement is compared at 1:1.
- Tests: QN1 `EQ` advisory; QN2 `30 TYP` equal → advisory; QN3 `31 TYP` on 30 → mismatch; QN4 `VARIES` → unreadable; QN5 the block text differs from the measurement → mismatch.

**Convergence: markings for the L1 std set** (G8 stays deferred in the writer).
- `mark_dx_set.js` gains a std profile (`node mark_dx_set.js std`). It reads `2D_Layout/output/STD/DX_*_std.dxf` and writes `tests/dxf2bim/out/marked_std/DX_*_marked.dxf` (copies; originals untouched; git-ignored).
- Evidence rules are as before:
  - `@UNITS` from `$INSUNITS` = 4
  - grids from A-GRID lines plus the nearest single-character label
  - `@HAXIS` by unique fit against the GF plan grid
  - `@FACE` from the sheet name (R11)
  - `@Z` from A-ANNO-LEVL lines paired with their `±z.zzz` texts
- From the model: `@LEVEL` (R1), and `@ROOF` on elevations (R11 T/ROOF).
- The std layer maps are new constants in `set_configs.js` (`STD.*`), built from the R12 layer names: A-WALL is the elevation outline, and A-GLAZ-SILL, A-ANNO-NOTE and A-ANNO-TTLB are ignored.
- The pipeline gaps come from `rosetta_dx_shell.js` with `DXSET=std`. It uses the same pipeline with the std maps. With no roof plan in the std set, the roof-plan stage yields its own gap, so the roof shape stays blocked.
- `rosetta_qualify.js` reports the std verdict, then the same with `@WALLTOP` stated for both plan levels (labelled user-stated).
- The expected residue is door items only (no arcs until the door-hinge lane), plus anything this run proves otherwise. That residue is reported, not asserted.

### L2.4 Results of L2.3 (2026-10-16; BIMCompiler branch feat/dxf2bim-qualify-decisions)
- `test_qualify.js`: 52/52 PASS. This adds QR2/QR3 roof, QS1 band vs window piece, QG1-QG5 gaps-once / `@WALLTOP`, QD4a/b exterior-only grid, and QN1-QN6 notes. Q2 is now exactly 6 `sheet_no_role` + 6 `units_unstated` + `set_no_plan` + `set_no_roof` + 4 `face_no_elev`.
- **L1 std set, marked from the model (`mark_dx_set.js std`), pipeline `DXSET=std rosetta_dx_shell.js`.** Qualify: **blocked, 132**. Every drawing-standard check passes:
  - G1 grid on axes and labels
  - G3 dimension strings, texts and points
  - G4 elevation grid and level datums
  - layers, units
  - Blocking, by cause:
    - doors: `opening_unclassified` 74 (A-DOOR section contours with no swing arc; the door-hinge lane)
    - interior wall heights: `no_elevation_height` 40. These become 40 advisory `convention_applied` when the user states `@WALLTOP` → 92.
    - windows: `no_elevation_match` 5 and `no_host_cut` 5, on the same 5 A-GLAZ handles (GF A3, C2; FF C0, CE, F1). Also, rosetta_dx_shell's DW-windows check finds 9 source windows with no window in the std run, and 4 of them have no gap. Both are for the L1 writer or the reader's glazing match.
    - slabs: `slab_no_underside` 2. GF has no storey below (§10.8 already says so). FF has no wall end below the top, because the std elevations draw the 2-storey exterior walls continuously from 0 to 6.0 (DB: Level 1 IfcWall z 0..6.0).
    - roof storey: `set_no_roof` 1 (L1 writes no roof plan); `set_storey_unstated` 1 (elevation band 6.0, the model storey "Roof" with 4 parapet walls, has no plan); `elev_height_dim_missing` 4. The chain 3.1→6.0→6.457 is drawn, but 6.0 is not a stated level until a ROOF sheet states it.
  - rosetta_dx_shell std: 23 PASS / 8 FAIL: doors, windows, Level 2 slab, roof outline.
- **Old Duplex set:** 343 blocking.
  - `set_storey_unstated` −1.25: the foundation band, model storey T/FDN, with no plan.
  - 18 gaps superseded by the shell/cut stage.
  - The roof sheet is now `@VIEW=ROOF` with `@LEVEL` 6.
- Regression:
  - unit suites 16/16: SUMMARY fail=0
  - rosetta_dx_shell (old): 35/36, the known RF-d; it differs only in the roof marking line and run_id (expected: the roof sheet text changed)
  - mark_dx_set old copies: byte-identical
  - farm_heights: identical
  - t8: identical except timing
  - rosetta_qualify: fail=0
- Finding for L1 (W1): two `std2d.py` runs into different directories give DXFs that differ in the OBJECTS section (LAYOUT / ACDBPLACEHOLDER order).

### L2.5 Std set to green: @WALLTOP from the model, and window accounting (2026-10-16, before code)
Input: the std set regenerated from master `std2d.py` with `--door-ops` (a `door_operation` DB extracted from `Ifc2x3_Duplex_Architecture.ifc` by `scripts/extractIFC2DB.js`, 14 rows, 14 arcs, 0 `§GAP`). Markings come from `mark_dx_set.js std`; pipeline gaps come from `DXSET=std rosetta_dx_shell.js`.

**W1 `@WALLTOP` derived from the model** (`mark_dx_set.js std`, PLAN sheets only; never written for a raw user drawing, where it stays the editor's question).
- **Interior wall** of storey S: an IfcWall in S whose plan bbox has no outer face on S's wall envelope bbox within 10 mm. This is the same rule as L1.1 R4(b), `EXT_FACE_TOL`.
- **Slab above** a wall: every IfcSlab whose minZ > level(S) + tol and whose plan bbox overlaps the wall's bbox with positive area. Its underside is the minimum minZ of those slabs.
- **Confirmed** when every interior wall of S has a slab above and |wall maxZ − underside| ≤ tol. The tol is 0.003 m (`CFG.elev_tol`, the pipeline's own height tolerance).
- If confirmed, `@WALLTOP=<level>,slab_above` is written on that plan. Otherwise nothing is written, and the wall-height gaps stay blocking.
- The log lists every interior wall with its top, its underside and confirmed / not confirmed.
- Measured on the DB before coding:
  - Level 1: interior walls top at 2.795, but also at 3.1 (4.03..4.182) and at 3.1 / 6.0 (the four walls based at 2.612).
  - Level 2: two walls top at 5.695, under the 6.0 roof slab.
  - Expectation: the rule probably confirms neither storey. The result is reported as measured.

**W2 Windows accounted.** Measured, std set: rosetta_dx_shell's DW-windows lists 9 source windows with "no window" (GF 76, 79; FF 80-83, 89-91).
- **None is silent.** Each lies under ONE plan A-GLAZ entity that carries `GAP:no_elevation_match`: GF A3, C2; FF C0, CE, F1. 81-83 and 89-91 are three stacked windows on one plan spot each, so one entity explains three. DW-windows did not look for an explaining gap; DW-doors does.
- **Cause of the mismatch: the marking tool, not the writer.**
  - `mark_dx_set.js` writes grid positions with `Math.round` to whole mm. The std grid axes sit on half millimetres (208.5, 17591.5).
  - JS rounds +208.5 → 209 but −208.5 → −208. On mirrored elevations (REAR −X, LEFT −Y) the `@GRIDH` calibration is then 1 mm off the plan's `@GRIDX/@GRIDY`.
  - Elevation openings land 1 mm off their plan glazing. Example: REAR cluster 9E at 3.549..8.384 vs plan 3.548..8.383. That exceeds `snap_tol` 0.001, so `no_elevation_match` follows.
  - The L1 writer's glazing is right: 9E's raw coordinates equal the model ±0.
- **Fix:**
  - (a) `mark_dx_set.js std` writes grid positions and `@Z` y at 0.001 mm (`toFixed(3)`), no whole-mm rounding. The old-set profile keeps whole mm, so its copies stay byte-identical; its positions are integers.
  - (b) DW-windows counts a source window "explained" when no window matches it but a `DXF_GAP` with an A-GLAZ handle has its plan box (the entity's bbox) within 10 mm of the source box. A window with neither a match nor such a gap is a FAIL ("vanished without a trace").
- **Tests:**
  - W2-acc: the std run has 0 unexplained windows; each explained window names its gap handle.
  - W2-mut: the window gaps are filtered out of the ops before the check, and the check must FAIL.

**W3 Shape attribution by layer** (found while coding). On the std set, 14 door `GAP:no_elevation_height` records (layer A-DOOR) are counted under walls, because the gap carries no `kind` and the code table maps `no_elevation_height` to walls.
- New order: the record's `shape`, then `kind`, then **the rule type of the gap's `layer` in that sheet's maps**:
  - `opening`, `glazing`, `elevdoor` → openings
  - `wall`, `wallline` → walls
  - otherwise the code table
- `@WALLTOP` already keys on the layer's wall type, so it is unaffected.
- Test QG6: a `no_elevation_height` on an A-DOOR layer → openings, not walls.

**Report:** the std-set verdict by cause after W1-W3, and rosetta_dx_shell std PASS/FAIL.

**Results (2026-10-16, BIMCompiler branch `feat/dxf2bim-std-green`).**
- **W1:** the model confirms `@WALLTOP` on neither storey, so nothing is written and the 40 wall-height gaps stay blocking. Interior walls that do not reach the slab underside:
  - Level 1 (underside 2.795; 12 of 17 confirm): walls 1014 and 1019 (base 2.612, top 6.0), and 1029, 1037, 1038 (top 3.1)
  - Level 2 (underside 6.0; 19 of 21 confirm): walls 1033 and 1034 (top 5.695)
- **W2:**
  - Before the fix, all 9 unmatched source windows were explained by the gap on their plan opening (A3, C2, C0, CE ×3, F1 ×3). None was silent.
  - After the 0.001 mm marking fix, all 22 std windows match: DW-windows L1 4/4, L2 18/18, 0 window items in the verdict.
  - Controls: M-W2 (a window removed, no gap) FAILs with "vanished without a trace"; M-W2g (removed, gap logged) gives "explained".
- **W3:** door height gaps are now counted under openings (QG6).
- **Std set verdict: blocked, 150.** By cause:
  - doors, 102:
    - `opening_unclassified` 74 (A-DOOR section contours)
    - `no_host_cut` 14
    - `no_elevation_height` 14
    - rosetta_dx_shell DW-doors 0/14 with `GAP:door_no_strip`: the leaf-width arc ≠ the casing-inclusive source bbox, the same R3 issue §L1.3 fixed in rosetta_dx but not in rosetta_dx_shell
  - interior wall heights, 40 (above)
  - slab underside, 2
  - roof storey, 6: `set_no_roof`, `set_storey_unstated` 6.0, `elev_height_dim_missing` 4
  - windows, 0
  - With a user-stated `@WALLTOP` it would be 110.
- rosetta_dx_shell std: 27/4. The 4 FAILs are SL-d L2, RF-a (no roof plan), and DW-doors L1/L2.
- Regression:
  - unit suites 16/16: fail=0; test_qualify 53/53
  - rosetta_dx_shell old: 35/36, the known RF-d
  - old marked copies: byte-identical
  - farm_heights: identical; t8: identical except timing
  - rosetta_qualify: fail=0

### L2.6 Std set: per-wall heights, door symbol accounting, door heights from the schedule, leaf-width check (2026-10-16, before code)
Decisions (coordinator, 2026-10-16), as rules. The SECTION / roof-sheet work and `std2d.py` belong to another lane and are not touched here.

**A. Interior wall heights, per wall, from the model** (`mark_dx_set.js std`).
- Grammar (dxf2marks, key `WALLTOP`, multi):
  - `@WALLTOP=<level>,slab_above`: the storey-wide rule (L2.3).
  - `@WALLTOP=handle:<h>,<z_top_m>`: wall entity `<h>` (a DXF handle on a wall-typed layer of that plan) has its top at absolute `<z_top_m>` metres. Its base stays the plan's storey level.
  - The two forms combine on one plan: a per-wall marking wins for its handle; the storey rule covers the other wall-height gaps of that plan.
  - Malformed → `MARK:malformed`. The same handle with two values → `MARK:conflict`.
- Tool:
  - The plan is run through `Dxf2Bim.run` (std map, shell CFG) to get its DXF_WALL pieces. A piece belongs to a model interior wall when its rect lies inside the wall's plan bbox within 2 mm.
  - The tool writes `@WALLTOP=<level>,slab_above` when at least one interior wall that has a piece on the plan passes the L2.5 W1 test (top = slab underside). For each interior wall on the plan that fails it, it writes a `handle:` line: `<h>` = the piece's handle, `<z_top_m>` = the wall's model maxZ (3 decimals).
  - A wall whose model base ≠ the storey level (> tol), or whose piece matches 2 walls with different tops, gets no marking: the gap stays and is logged.
  - Measured: the exceptions on the plans are GF 9F → wall 1029 (3.1) and FF 99/9B → walls 1034/1033 (5.695). Walls 1014/1019/1037/1038 start at 2.612, so the plan cut does not show them.
- Pipeline:
  - New `Dxf2Elev.applyWallTops(after, before, desc, level, U)` runs after `applyWallHeights`, and only when the plan carries `@WALLTOP`.
  - A per-wall entry makes the wall op height `z − level`, `height_source: 'marking'`.
  - The storey rule makes it `U − level`, with U the slab underside (§4.2 / W-H3), `height_source: 'slab_above_marking'`.
  - Without markings nothing changes, so the old set is unchanged.
  - rosetta_dx_shell variant A calls it.
- qualify: a `GAP:no_elevation_height` whose handle has a per-wall marking → advisory `QF:height_stated` (source marking). The storey form stays `QF:convention_applied` (L2.3).
- Tests: grammar, conflict, per-wall wins over storey-wide, and a mutation (a wrong handle leaves the gap).

**B. Door symbol accounting** (`deploy/dev/dxf2bim.js` §12 D1).
- Today a segment is absorbed into a door only when one of its endpoints is on the hinge or an arc end, so the rest of that polyline is `GAP:opening_unclassified`.
- New rule: an entity on an opening-typed layer (LINE / LWPOLYLINE / POLYLINE) is a door part when any point of its outline (vertex or segment) lies within `snap_tol` of that door's hinge or either arc end. The WHOLE entity is then absorbed into the door's `parts` (all its segments).
- An entity touching points of two different doors is ambiguous → `GAP:door_part_ambiguous`, not absorbed.
- Entities touching no door point stay as before: rectangle clusters, else `GAP:opening_unclassified`.
- Measured, std GF: 20 of 34 A-DOOR polylines touch a hinge or arc end (distance 0); 6 of 6 leaf LINEs do. The other 14 are not attached: the casing on the far wall face (417 / 124 mm away = the wall thickness) and leaf panels (104 mm). They stay gaps, and the report lists them.
- Tests:
  - DP1: a polyline touching the hinge mid-segment is absorbed whole
  - DP2: a far-face casing stays a gap
  - DP3: touching two doors → ambiguous
  - DP4: mutation (moved 2×snap_tol away → gap)
  - DP5: determinism

**C. Door heights from the schedule** (USER_GUIDE §1: labels set what geometry cannot decide). Path checked first: no schedule → height path exists today. `bindTypes` B5 only compares the schedule with the measured size (`GAP:schedule_conflict`), and `applyDoorHeights` replaces a door with no elevation by its gap.
- New, in `applyDoorHeights(ops, elevs, cfg, opts)`, with `opts.schedule` from `Dxf2Types.scheduleFromDesc`:
  - The elevation is tried first.
  - If no elevation matches and the door carries a `label` (from `@TAG` / `@LABEL`) whose schedule entry is class door with a height, then height = schedule h and `height_source: 'schedule'`.
  - Otherwise `GAP:no_elevation_height`, as today.
  - The width stays the arc's. Schedule vs measured differences stay `GAP:schedule_conflict` (B5), as today.
- Order in the pipeline: `applyTags` on the plan's `@TAG`s runs before `applyDoorHeights`.
- Std set: it has no schedule or tags (L1 writes none; the other lane will add them). For now `mark_dx_set.js std` writes them **model-derived**, logged as such, and only when the door-ops DB is given (`node mark_dx_set.js std <door_ops.db>`):
  - `@SCHEDULE=<element_type>,door,<w_mm>,<h_mm>`, one per door type, with w/h = IFC OverallWidth / OverallHeight from `door_operation`. If two doors of one type differ, it refuses that type.
  - `@TAG=door,<element_type>` at each door's plan bbox centre.
- Tests:
  - DS1: no elevation + tag + schedule → schedule height
  - DS2: elevation present → elevation wins
  - DS3: no tag → gap
  - DS4: schedule entry of class window → gap
  - DS5: mutation (wrong tag text) → gap

**D. rosetta_dx_shell DW-doors width.** The source door width is the bbox long side − 2 × `CASING`, using the `CASING` already defined in rosetta_dx_shell.js (0.076, the R1b constant that §L1.3 used). No new number.

**E. Std ROOF and SECTION sheets** (L1 #183: 8 sheets; the SECTION format is §L1.4).
- `mark_dx_set.js std` marks both:
  - ROOF: `@SET @VIEW=ROOF @UNITS=mm @NAME @LEVEL @ROOF`. `@LEVEL` = the "Roof" storey from the model (R1, min wall minZ); `@ROOF` = R11 T/ROOF from the model.
  - SECTION: `@SET @VIEW=SECTION @UNITS=mm @NAME @CUT @HAXIS @GRIDH @Z @ROOF`.
    - `@CUT` comes from the sheet title "… AT X=2304.25". The value is in the sheet's `@UNITS` (mm), so it is written `@CUT=X,2304.25`, not 2.30425.
    - `@HAXIS` by a unique fit against the GF plan grid; `@GRIDH` / `@Z` by the same evidence rules as the elevations; `@ROOF` from the model.
    - Same evidence rules as the `markSection` step of `rosetta_dx_section.js`, whose header names this script as the place for it.
- Std shell pipeline (`DXSET=std`):
  - the roof plan stage reads the marked DX_ROOF;
  - `Dxf2Shell.sectionSlabs` on the marked section feeds `slabZ(…, {section})` for both storeys and `roofZ`.
- qualify:
  - a SECTION sheet is a stated role (no `sheet_no_role`);
  - it gets the role-independent checks (layers, units, dimension texts) and `elev_align_fail` alignment against the reference plan;
  - its `@ROOF` takes part in `roof_level_mismatch`;
  - it is not a face (no `face_no_elev`).

**F. Old-set R3 / DW-doors (lead decision).** The old set's arcs are drawn at the casing-inclusive bbox, so its DW-doors now FAIL on the leaf rule. That FAIL is kept and recorded in the log as a known finding, like RF-d. No rule is added to accept it.

**G. Door hinge on the wall face** (found while coding D).
- `Dxf2Shell.doorStrip` requires the hinge on the wall strip's CENTRE line. The old set draws it there; the std set (L1.2 R9) draws it on the wall FACE: arc 10E at x 8.800, wall 8.383..8.800.
- Rule: the hinge lies within the strip's thickness band (between its two faces, ±tol).
- One strip per direction is still required; ambiguity is still `GAP:door_host_ambiguous`.
- Tests: DH1 hinge on a face → strip found; DH2 hinge outside the band → `door_no_strip`; old set unchanged.

**Report:** the std-set verdict by cause.

**Results (2026-10-16, BIMCompiler branch `feat/dxf2bim-std-doors`, rebased on #183).** The std set is 8 sheets, regenerated from master `std2d.py --door-ops`.
- **A:** markings written from the model:
  - GF: `@WALLTOP=0,slab_above` + `handle:9F,3.1`
  - FF: `@WALLTOP=3.1,slab_above` + `handle:99,5.695` + `handle:9B,5.695`
  - Pipeline: L1 marking 1 + slab_above 16; L2 marking 2 + slab_above 21. 0 interior-wall gaps remain.
- **B:** std `opening_unclassified` 34→14 (GF) and 40→16 (FF); the old set is unchanged.
- **C:**
  - schedule heights for 6/6 GF doors and 4/8 FF doors.
  - The other 4 FF doors (14C, 14E, 156, 158) stay `no_elevation_height`. Their tag is `GAP:label_ambiguous` because the reader's door hit rule (SANDBOX: a swing disc around the hinge) catches two doors whose hinges are 0.22 m apart.
- **D:** with leaf widths, std DW-doors widths are 14/14 equal.
- **E:**
  - ROOF and SECTION are marked: `@CUT=X,2304.25` (mm), `@HAXIS=+Y`, A..D, `@Z` 0/3.1/6/6.457, `@ROOF` 6.457.
  - The section feeds slabZ: L1 −0.127..0, L2 2.795..3.1. The roof plan: outline + 2 holes, z 6..6.457.
  - rosetta_dx_shell std: SL-d, RF-a, RF-d and DW-doors L1 now PASS (31/4).
- **F:** the old set's DW-doors L1/L2 FAIL is logged as KNOWN FINDING, as is RF-d. Old rosetta_dx_shell: 33/3.
- **G:** std DW-doors L1 6/6, L2 2/8.
- **Std verdict: blocked, 56. Walls, slabs and roof qualify; all 56 blocking items are doors:**
  - `opening_unclassified` 30: A-DOOR outlines touching no hinge or arc end (far-face casing 417/124 mm away, leaf panels)
  - `no_host_cut` 8 and `no_elevation_height` 4 (FF)
  - `fill_size_mismatch` 6 (GF): library products include the casing, dw 0.152 / dh 0.076 vs the leaf
  - `fill_no_void` 4, `door_host_ambiguous` 2 and `opening_gap_unbounded` 2 (FF T-junction hinges on a face shared by two strips)
- **Regression** (each vs the master baseline):
  - unit suites 18/18 fail=0: test_qualify 58, test_std_rules 20, test_section 17
  - rosetta_dx: old 13/2 (L1.3 known), std 15/0, both unchanged
  - rosetta_dx_section: 9 PASS, plus its required control FAIL; fail=0, unchanged
  - farm_heights: identical; t8: identical except timing
  - rosetta_qualify: fail=0
  - old marked copies: byte-identical

### L2.7 Doors by drafting practice, and the source of a marking (2026-10-16, before code)
Decisions (coordinator, 2026-10-16), written as rules. Measured on the std set (L2.6 results): 30 door-layer outlines are not attached to a door; 6 GF fills differ from the leaf by dw 0.152 / dh 0.076; 4 FF tags are ambiguous; 8 FF doors have no host or cut.

**1. Door symbol = arc + leaf + frame/casing** (`dxf2bim.js` §12 D1, after the L2.6 touch rule).
- **Opening box of a door**, computed in the reader from the drawn walls:
  - The closed leaf direction is the arc end whose hinge→end segment runs along a wall piece's direction.
  - The strip is the wall pieces parallel to that direction whose band (between the two faces) contains the hinge (on a face or the axis).
  - Jamb to jamb: the wall-free interval along the strip that contains the leaf span: s0 = the nearest piece end ≤ the leaf start, s1 = the nearest piece start ≥ the leaf end. If either is missing, there is no box.
  - Across: the band of the two jamb pieces (union of their across ranges). Pieces are not filtered by length, because a jamb can be a short or square stub (std 10B, 0.1 m; 10D, square).
  - Along, the box is [s0, s1] ∪ the along-extent of the parts the L2.6 touch rule already attached to that door. That is the drawn casing extent. Measured: the std walls stop at the hinge, so s0..s1 is the leaf span (1.25). The frame drawn at the hinge spans −16.879..−15.477 (1.402 = the source opening).
  - A door-layer entity belongs to the box when its bbox lies within the along range (±snap_tol) and its across range overlaps or touches the band (±snap_tol).
  - The box is stored on the door op as `opening_box` (metres: along axis, s0, s1, band).
- **Attachment:** an entity not attached by the L2.6 touch rule is attached to the door whose opening box holds it. If two boxes hold it → `GAP:door_part_ambiguous`. If none → unchanged (rectangle cluster, else `opening_unclassified`).
- Tests:
  - DB1: far-face casing absorbed
  - DB2: a leaf panel inside the gap absorbed
  - DB3: an entity outside the gap stays a gap
  - DB4: in two boxes → ambiguous
  - DB5 (mutation): an entity shifted beyond s1 + 2 × snap_tol → gap

**2. Cut and fill from drawn evidence** (`dxf2shell`).
- **The cut opening** = the drawn wall gap (the `bridgeOpenings` void s0..s1, jamb face to jamb face) × the door height.
- **Door height:**
  - From the elevation, as drawn.
  - From the schedule, as the schedule leaf height + the head frame. The plan and the schedule do not draw the head frame, so `applyDoorHeights(opts.schedule_head_frame)` adds the caller's existing `CASING` (R1b, 0.076).
  - The leaf height is kept as `leaf_height`. Type binding (`Dxf2Types.request`) measures doors by `leaf_height`, because library families are nominal leaf sizes; the head frame belongs to the opening, not to the type. Without the option, nothing is added.
- **The fill check** (`placeFills`) compares the library product (frame included) with the drawn opening. Door width = the opening box's along-extent (frame drawn) when the door has one, else the void width (s1 − s0). Height = the door's opening height. The cut itself stays the drawn wall gap (bridgeOpenings void). The leaf width stays only in the arc check (rosetta DW-doors).
- rosetta_dx_shell OV / FL keep comparing against the source opening bbox (frame included), which is the same measure.
- Tests:
  - DF1: void width used, not the leaf
  - DF2: schedule height + head frame = product height → no `fill_size_mismatch`
  - DF3 (mutation): no head frame given → `fill_size_mismatch` dh 0.076

**3. Tag → door** (`dxf2types` `hits`).
- A door tag binds to the door whose **swing box** (hinge, closed end, open end) or **opening box** (rule 1) contains the tag point. This replaces the swing disc.
- Exactly one door → bound. Zero → `label_unmatched`. Several → `label_ambiguous` (as today).
- Doors without `opening_box` (old set) use the swing box only.
- Tests:
  - DT1: a tag at the opening centre binds
  - DT2: two adjacent doors 0.22 m apart, each tag binds to its own door
  - DT3 (mutation): a tag outside both boxes → `label_unmatched`

**4. Hosting at T-junctions** (`Dxf2Shell.doorStrip`).
- The host = the strip whose face or axis the hinge lies on (L2.6 G) AND whose direction is parallel to the closed leaf.
- The closed leaf is the arc end whose span H→E is a wall-free gap bounded by strip pieces at both ends (jamb to jamb).
- Applied only when the L2.6 passes give more than one candidate, so single hits (the old set) are unchanged. If 2 remain → `GAP:door_host_ambiguous`. There is no tie-break by order or size.
- Tests:
  - DH3: a T-junction, hinge on the faces of two strips, closed leaf along one → hosted
  - DH4: both spans bounded → ambiguous

**5. Source of a marking: `@BY`** (binding grammar; the L4 editor writes the same).
- A suffix in the SAME TEXT entity: `@KEY=VALUE @BY=model|user`, for example `@LEVEL=3.1 @BY=user`.
- `@BY` qualifies the other `@KEY` in that one TEXT and nothing else. It is not a scope by position or handle order.
- A TEXT holding only `@BY`, a second `@BY`, or another value → `MARK:by_invalid` (blocking, qualify `QF:mark_invalid`).
- `describe` keeps `by` on the entries that carry a source: `walltop`, `walltop_walls`, `labels`, `tags`, `schedule`, plus `desc.by[KEY]` for single keys.
- No `@BY` → `by: 'file'`.
- qualify:
  - conventions and stated heights show `source: 'stated (model)' | 'stated (user)' | 'stated (file)'`
  - the L2.3 `'user-stated'` label is retired
- `mark_dx_set.js std` writes `@BY=model` on every std marking. The old profile writes none, so its copies stay byte-identical and read as "stated (file)".
- Tests:
  - BY1: suffix read and the key still parsed
  - BY2: only `@BY` → by_invalid
  - BY3: a second `@BY` → by_invalid
  - BY4: another value → by_invalid
  - BY5: no `@BY` → file
  - BY6: no leaking to the next TEXT
  - BY7 (mutation): `@BY=model` placed in a separate TEXT next to the marking → by_invalid, and the marking reads as file

**Report:** the std verdict by cause; rosetta_dx_shell std/old; all suites against a master baseline.

**Results (2026-10-16, BIMCompiler branch `feat/dxf2bim-std-doors2`; baseline = master 550068a03).**
- **Std set qualify: blocked, 8** (was 56). Walls, slabs and roof qualify.
  - GF doors: 0 items. 6/6 have opening boxes, frames are absorbed, fills match the product, tags bind, heights come from the schedule + head frame.
  - FF: 6 of 8 doors are clean.
  - **The 8 left are all FF doors 150 and 152:** `no_host_cut` 2, `no_elevation_height` 2 (tag unmatched: no box), and their 4 casing outlines unattached (BA, BB, BF, C0).
  - Cause (L1 writer fact): their host walls are model walls 1019 and 1014, in storey "Level 1", z 2.612..6.0. The FF cut at 4.3 m passes through them, but `std2d.py` draws walls by storey membership, so the FF plan omits them. With no drawn jamb, no opening box exists and no host is found.
- rosetta_dx_shell:
  - std 34 PASS / 1 FAIL: DW-doors L2, the same 2 doors; was 31/4. OV and FL now pass.
  - old 33/3, unchanged: RF-d and DW-doors are the known findings.
- **Old Duplex qualify:** 343 → 347. 4 new `fill_size_mismatch` dw 0.152 (GF doors). Its arcs are casing-inclusive (1.402), so the span overlaps the wall pieces, no opening box exists, and the fill is compared with the drawn wall gap (1.25). This is the rule-2 truth about drawings already ruled wrong (L2.6 F); no rule accepts it.
- Implementation notes found while coding:
  - Thin F5b stub candidates (e.g. AF, 20 mm) count as jamb pieces.
  - A line's pieces are those with the band of a long parallel piece.
  - When the door has an opening box, `doorStrip` takes the host from it: the two jamb pieces, parallel to the closed leaf. This is rule 4 by construction; without a box, the L2.6 passes and the bounded-span filter apply.
- Tests:
  - `test_std_rules` 38: DB1/2/4/5, DF0-3, DT1-3, DH3/4, BY1-7, plus the L2.6 set
  - `test_qualify` 60: QG3 stated (file) / QG3b stated (model) / QBY
  - `test_types` LB5 now uses the swing box
- Regression:
  - unit suites 18/18 fail=0
  - rosetta_dx old 13/2 and std 15/0, unchanged
  - rosetta_dx_section 9 + control, unchanged
  - farm_heights: identical; t8: identical except timing
  - rosetta_qualify: fail=0
  - old marked copies: byte-identical (no `@BY`)

### L2.8 Wall base from stated sources, one wall per footprint across storeys, R1b over cut walls (2026-10-16, before code)
Decisions (coordinator, 2026-10-16), written as rules. Measured on master d06a63c8a (std set qualifies: 0 blocking / 36 advisory):
- rosetta_dx_shell std 34/1. OV L2: doors 66/67 (150/152), "below=false".
- Their host walls 1014/1019 (model z 2.612..6.0) are built from the FF level 3.1, so 2.612..3.1 is missing.
- The section (cut X = 2.30425) draws 1014 as A-SECT B5 (2.612..3.1) + B7 (5.132..6.0). 1019 is not cut by the section and is interior, so no elevation shows it.
- The same A-SECT layer holds foundation walls (−1.25..0) and the GF exterior wall (BD, 0..3.1) at the same `h` as FF pieces.
- Same plan footprint on GF and FF: 2 pieces in each set, the 0.417 × 0.417 corner posts (std 107 / 10D; old 6E / E3). The model holds separate stacked walls there (0..3.1 and 3.1..6.0).

**1. Wall base from the lowest stated source** (`Dxf2Shell.applyWallBases`, after the wall heights).
- (a) Section, when the section cuts the piece: its along-range on the cut axis contains the `@CUT` coordinate.
  - The section's wall rects are closed polylines on a layer typed `sectwall` (std map: A-SECT; until now `ignore`). They are mapped with the section's `@HAXIS` / `@Z` calibration. Their h-range equals the piece's cross range (±snap_tol).
  - A rect counts for this plan's wall when:
    - its z0 ≥ the next lower plan level (or ≥ this plan's level for the lowest plan; walls below the lowest storey are foundations, outside the set's storeys);
    - its z0 < the piece's top; and
    - the lower plan draws no wall on the same line (no lower-plan piece with the same cross band ±snap_tol), because such a rect is that plan's wall. Measured: GF lintel/sill rects BB (2.52..3.1) and B9 (0..0.1) sit at a GF window where no GF piece passes the cut, but the GF plan draws that wall line, so they are GF material.
  - base = the lowest z0 of those rects; `base_source: 'section'`.
  - When the cut falls inside a drawn opening (a door's `opening_box` s0..s1, or a window's bbox, on the same band), the section rects at that h state the base of that wall. The base therefore applies to the opening's two jamb pieces (the pieces ending at s0 and starting at s1). Measured: the cut passes through door 152's opening (1.483..2.347), so B5/B7 state wall 1014's base at the opening, not at a piece.
  - S-SLAB rects are never wall material.
- (b) Else the elevation's base (`applyWallHeights`): `base_source: 'elevation'`.
- (c) Else the plan level: `base_source: 'plan_level'`. When the piece's model storey can't be stated, nothing in the drawings states a base below the plan level, so the pipeline logs advisory `GAP:wall_base_from_plan_level` (qualify: advisory) on interior pieces whose height came from a marking or slab_above.
- The top is unchanged. Base and top never extend through a slab: the base is a section wall rect, never an S-SLAB.
- rosetta_dx_shell OV: "wall below missing" is explained when the host carries `wall_base_from_plan_level` (the drawings state no base below). The host is the piece holding the opening centre, or the jamb pieces of the infill box there. Target: std fail = 0.
- Tests:
  - WB1: a section-cut piece takes the section base
  - WB2: a lower-plan rect (stacked wall) is not taken
  - WB3: a foundation rect below the lowest plan is not taken
  - WB4: an uncut interior piece → plan level + advisory
  - WB5 (mutation): the section rect moved 50 mm → the base follows; the S-SLAB is never used

**2. One wall per footprint across consecutive plans** (`Dxf2Shell.mergeStacked`, applied to the final element set just before meshing; the per-storey reasoning before it (openings bridged, slabs, witnesses) keeps the plan pieces, since FF bridging needs its own jamb pieces).
- Two pieces, on consecutive plans (by `@LEVEL`), with the same rect (±snap_tol), whose stated z-ranges OVERLAP or TOUCH (±elev_tol), are ONE wall.
  - It is kept on the lower plan, with z = the union of the stated ranges and `height_source: 'stacked:<lower source>+<upper source>'`.
  - The upper piece is removed and recorded as `merged_into`.
  - Plans carry no GUIDs, so matching is by footprint only.
  - Different footprints, or ranges separated by a gap, stay separate.
- Duplex: the 2 corner posts per set (stacked 0..3.1 + 3.1..6.0) become one post 0..6.0. The volume is identical.
  - rosetta_dx_shell R6 compares a merged piece with the union of the source walls that hold it (stacked).
  - The OBJ hash changes; the element count drops by 2 per set.
- Tests:
  - MS1: a two-storey wall drawn on both plans with overlapping heights (0..6 each) → one wall 0..6
  - MS2 (mutation): the upper footprint shifted 10 mm → two walls
  - MS3: a gap between the ranges (0..2.8 / 3.1..6) → two walls

**3. R1b over every cut wall** (rosetta_dx.js R1b and rosetta_dx_shell R1b-u). Recall is scored over every source wall the plan's cut plane cuts (any model storey), symmetric with R1a. The expected uncovered length uses the source openings the plane cuts (any storey) whose plan centre lies in that wall.

**Results (2026-10-16, BIMCompiler branch `feat/dxf2bim-wall-base`; baseline = master d06a63c8a).**
- **rosetta_dx_shell std: 36 PASS / 0 FAIL** (was 34/1).
  - Wall bases: L1 section 5 / elevation 9 / plan level 15; L2 section 6 / elevation 11 / plan level 24.
  - Door 152 (wall 1014): the section cut lies inside its opening, so jambs 13B/13D take base 2.612 (B5) and the infill under the door is solid.
  - Door 150 (wall 1019, not cut, interior): explained by `wall_base_from_plan_level` on jamb 103.
  - Merged across plans: the 2 corner posts (107+12B, 10D+139 → 0..6.0). R6-stacked PASS. R1b-u over every cut wall: 17/17, 19/19.
- **Std qualify: qualifies, 0 blocking, 75 advisory** (`type_unbound` 36 + `wall_base_from_plan_level` 39).
- **Old set:**
  - rosetta_dx_shell 33/4 (was 33/3): + R6-stacked PASS, + R1b-u L2 FAIL 17/19.
  - rosetta_dx 12/3 (was 13/2): R1b-stated L2 FAIL 17/19.
  - Both new FAILs are KNOWN FINDINGS: the old writer drew walls by storey, so its FF plan omits 1014 and 1019, which the 4.3 m plane cuts. Recall over every cut wall exposes it.
  - Its mesh holds 104 elements (106 − 2 merged corner posts); the volume is unchanged.
  - Old qualify: unchanged (347).
- Tests:
  - `test_std_rules` 47: WB1-6 (WB6 = cut inside a door opening → its jambs), MS1-3
  - All 18 unit suites fail=0.
- Unchanged: rosetta_dx std 15/0, rosetta_dx_section, farm_heights; t8 identical except timing; old marked copies byte-identical.

## L3. Import + convert in the Modeller
- **Open chooser:**
  - new row "Open 2D drawings (.dxf)…" with `multiple`
  - vendored dxf-parser
  - the BIMCompiler `dxf2*.js` modules copied into `modeller/` (same source, synced, version-stamped)
- **Sheet roles** come from markings when present, otherwise from the editor (L4).
- **Canvas:**
  - plan sheets as `THREE.LineSegments` at z = level
  - elevation sheets mapped onto their face plane (u, v) → (x, y_face, z)
  - roof plan at roof level
- **Convert** (only when L2 says qualifies), as one `commitGesture`:
  - walls → GEOM_EXTRUDE_POLY (+ GEOM_MOVE for base z)
  - slabs → GEOM_EXTRUDE_POLY with `ifc_class: IfcSlab`
  - roof → per the basic-shapes rule
  - openings → GEOM_CUT on the host op
  - door/window fills → GEOM_INSERT with the library product (LOD400 or hard fail)
  - every op carries `provenance:{dxf_handle, layer, sheet, run_id}`
- **IFC export fix (bonsai_ifc.js):**
  - honour GEOM_MOVE and `ifc_class` on extrudes (IfcSlab / IfcRoof)
  - create IfcBuildingStorey per level and containment
- **Tests:**
  - C1 Duplex standard set → convert → element counts and positions equal the basic-shapes witness (same run_id)
  - C2 IFC round trip: export → web-ifc read → walls / slabs / roof / doors / windows counts and storeys equal
  - C3 convert refused while blocked
  - C4 undo of convert removes everything (one gesture)

### L3 design decision (2026-10-16, read arc_editable.js:255-500)
Convert emits the SAME representation the Modeller already uses for an opened ARC resident such as the Duplex:
- each wall / slab / roof body is registered as real geometry (`Library.registerRealGeometry`, `rg:` prefix) and committed as `GEOM_INSERT {realGeomHash, placement, ifc_class, provenance}`. The body is the drawing-derived mesh from dxf2mesh/dxf2shell, uncut.
- one `GEOM_CUT {parent: host fid, void:{c1,c2}, slide:{opening, filling, fillingFid}, provenance:'dxf:opening'}` per opening, exactly like §SLIDE-SEED.
- door/window fills are `GEOM_INSERT` of the bound LOD400 library product (hard fail if absent).
Why:
- (1) a converted model and the opened Duplex are like-for-like, so C1 compares op-for-op and the film can show both side by side
- (2) "the hole rides the door" (§CUT-MOVE) works on converted models for free
- (3) bonsai_ifc.js already exports GEOM_INSERT through the rendered mesh with the `_CLASS_MAP` class, so the extrude-at-origin export gap does not apply
Remaining exporter work: IfcBuildingStorey per level + containment (it has none today). Honest label: wall/slab/roof bodies are drawing-derived solids (exact footprint × height read from the elevation), not catalogue LOD400 components. The LOD400 rule applies to library products, and those bodies are never a fallback for one.

### L3 build spec (2026-10-16, written before the code)
Scope: import + canvas + convert. The metadata editor is L4; the L2 verdict module does not exist yet, so the L3 gate is role-completeness only (below), stated.

**Sources (copied, never forked).**
- `modeller/dxf2bim/`: `dxf2{bim,elev,marks,mesh,types,shell}.js` VERBATIM from BIMCompiler `b4739b50a` (`deploy/dev/`), plus `dxf2shell_config.js` from the BIMCompiler branch `feat/dxf2bim-shell-config` (BASIC_SHAPES_SPEC §11: the pipeline config moved out of `rosetta_dx_shell.js`; roof-plan role marking; run_id; element summary). `SOURCE.md` names the commits and SHA-256 of each file.
- `modeller/lib/dxf-parser.js` vendored verbatim (`DEFERRED_LIBS`).
- `modeller/dxf2bim_import.js` (UMD, runs in Node and in the page): the ORCHESTRATION of `rosetta_dx_shell.js pipeline()` ported, nothing else. Answer-key reads (DX_extracted.db) stay in the witness; the window labels the Node run takes from the source model are an optional input (`library.labels`), never read by the module.
- SHA-256 in the page: `crypto.subtle` is async, the modules need a sync `hashHex`; a standard FIPS 180-4 SHA-256 over the UTF-8 bytes is inlined in `dxf2bim_import.js`. Its equality with Node `crypto` is witnessed by C1 (run_id equal: every sheet hash and storey run id feeds it).

**Sheet roles (R), from `DXF2BIM-MARK` markings only.**
- R1 `@VIEW=PLAN` + `@LEVEL` → storey plan at that level. Storeys sorted by level, named `Level 1..n` (the source model's naming, as `rosetta_dx_shell.js`).
- R2 `@VIEW=ELEV` + `@FACE` → elevation on that face.
- R3 `@VIEW=ROOF` + `@LEVEL` + `@ROOF` (all `NEED.ROOF` keys present) → roof plan at `@ROOF` (BIMCompiler #182, lane L2.3 D1, superseding BASIC_SHAPES_SPEC §11 CF-2's `@VIEW=PLAN` + `@ROOF`; re-synced 2026-10-16, §L3.2).
- R4 anything else (no marking, unknown view, any other marking error) → NO ROLE.
- Gate (convert allowed): every sheet has a role, ≥1 plan, ≥1 elevation, exactly 1 roof plan. Otherwise Convert is refused and the panel names each sheet and reason (C3). The L2 verdict replaces this gate when it lands.

**Canvas.** One toggleable `THREE.Group` (`dxf-sheets`) in `A.scene`, one `THREE.LineSegments` per sheet: LINE, LWPOLYLINE/POLYLINE (closed when flagged), ARC and CIRCLE (tessellated, 64 segments per full turn: a display choice, not geometry); TEXT/MTEXT/DIMENSION/INSERT are not drawn (counted in the log). Plan: (x, y) × units factor at z = `@LEVEL`. Roof plan: same at z = `@ROOF`. Elevation: horizontal coordinate h → plan axis by `Dxf2Marks.align(lowest plan, elevation).toPlan(h)`, vertical v → z by its `zOf(v)` (`@Z` calibration); the face plane coordinate is the matching side of the lowest storey's outer wall envelope (`Dxf2Shell.envelope` of its pieces: minX/maxX/minY/maxY). An elevation that does not align is drawn nowhere and logged. Log `§DXF-IMPORT`.

**Convert = ONE `commitGesture`, the ARC-seed form (L3 design decision).** The pipeline output (`rosetta_dx_shell.js` variant A, the main model) maps to:
- wall pieces (rect boxes, polygon prisms), floor slab(s) with a thickness, roof: the module's own mesh, registered `Library.registerRealGeometry` (`rg:dxf-<guid>`, recentred, anchorOffset 0) and committed `GEOM_INSERT {realGeomHash, bbox, placement{x,y,z,rot:0}, ifc_class, storey, storey_elev, provenance}`. Roof: `storey:'Roof'` with NO `storey_elev` (no drawn storey elevation; the exporter then contains it in the building, never a guessed storey).
- openings: each §6 void group (drawn gap G between pieces A and B of a strip) becomes ONE uncut host body G × strip × [zb, zt] (`Dxf2Shell.prismRect`, registered `uncut`) plus one `GEOM_CUT {parent: that body's fid, void:{c1,c2} = G × strip × [z0,z1], slide:{opening: handles, filling: null, fillingFid: null}, provenance}` per opening z-interval, as §SLIDE-SEED. The §6 infill boxes are therefore NOT committed: the cut body is what they are. Checked before commit: union(void z-intervals) + Σ infill heights = zt − zb for each group, else convert refuses (no invented body). Parent fids are the group's own row ids (KernelOps.commitGroup assigns `max(id)+1..+N`, contiguous; asserted after commit, mismatch → undo + refuse).
- every op: `provenance {dxf_handle, layer, sheet, run_id}` (body: `A+B` handles; cut: opening handles; slab: ring members; roof: A-ROOF handle).
- run_id = `Dxf2ShellConfig.runId` (§11 CF-3): same inputs → same run_id as the Node run.
- Log `§DXF-CONVERT counts=` by class and storey, cuts, fills, gaps.

**Fills (LOD400) — measured 2026-10-16, STOPPED.** The Node run binds 26 fills to 10 distinct library meshes (`component_library.db` `ad_geometry_map` + `component_geometries`): 0d09a8ed5fac514f, 572cdb8f6f10644c, 34f667346c53d06d, 4c3526d658d27caf, 974f0644c797ee99, 3a5339a7cb23ab05, 02788fc8c663321e, 9a16688fa4310a1f, 00b72db6daa0796e, 7951f4f3f56f1d2b. The Modeller's geometry sources: `viewer/dagevu_geometries.json` holds 3 of them (3a5339a7…, 9a16688f…, 7951f4f3…), `Duplex_geo.db` (OCI) 0, the legacy 3-mesh CATALOG 0. The binding itself needs `ad_opening_family` (DUPLEX_*/US_* ids + descriptions), `ad_wall_type` and every door/window `ad_geometry_map` row (the ambiguity rule needs all candidates): none of these rows is in any Modeller source. So the page calls the module with no library: every opening that would need a fill is reported `GAP:lod400_library_unreachable` (hard fail, `console.error`), no fill op, no box. `Dxf2BimImport.convert` with library rows (Node) runs the full fill path; witness C1-PORT proves it equals the Node run.

**Witnesses (`modeller/tests/`, each names its issue).**
- `witness_dxf_import_node.js` C1-PORT: the module in Node, with the library rows and labels the Node run uses, reproduces `out/duplex_basic_shapes_elements.json` element-for-element (guid, class, storey, bbox 1 mm) incl. 26 fills, and its run_id. Issue: the port drifted from the pipeline.
- `witness_dxf_convert.js` (puppeteer):
  - C1 Duplex marked set → convert: run_id equal; every non-infill element (pieces, slab, roof) is one committed op with the Node guid, class, storey, and rendered bbox within 1 mm; every void group's rendered cut body has the bbox of the union of its Node infill boxes (1 mm) and their summed volume (1e-6 m³); counts by class and storey logged; fills: Node 26 vs page 0 = the named GAP (not a pass).
  - C1-FALSIFY: the same comparator against a Node summary with one piece and one infill box moved 2 mm must report exactly those two.
  - C2 export IFC → reimport: products by class equal the committed inserts by class, storeys = 2, contained == products.
  - C3 the GF plan replaced by its raw (unmarked) original → convert refused naming that sheet, op-log unchanged.
  - C4 one undo → every converted op inactive, no converted mesh left.
  - Screenshot `~/Videos/dxf2bim_work/l3/` read by eye.
- Regression: W-IFC-SPATIAL, W-IFC-EXPORT-SEED, W-BONSAI-IFC.

**Not claimed (L3).** Fills (library unreachable, above); IfcRelVoidsElement for converted openings (the exporter links voids only to extruded walls); the converted model surviving a page reload (`rg:` meshes are registered per session, like a resident's before its geo arrives); the L2 verdict; any building but the Duplex.

**L3 results (2026-10-16).** BIMCompiler side: PR #180 (§11; OBJ `246ce6f0…` unchanged). Logs: `modeller/tests/logs/witness_dxf_import_node.log`, `witness_dxf_convert.log`.
- C1-PORT 5/5: the module in Node equals the Node run element-for-element (106 incl. 26 fills, 40 infill), same run_id `2045e4e0…`; the inlined SHA-256 equals Node crypto; falsify reports the one moved element.
- Page, real UI (chooser with `multiple`, 7 sheets): C0 canvas PASS (plan wall lines at z = @LEVEL, roof at 6.5, each elevation's A-ELEV-WALL on its face plane spanning the envelope [0,-17.8,8.8,0]); C1 run_id equal; parity: 40 solids (L1 18 walls, L2 20 walls + 1 slab, roof 1) one-to-one with rendered bbox within 1 mm, and 18 cut bodies (L1 8, L2 10) equal to the union of the 40 Node infill boxes (bbox 1 mm, volume 1e-5 m³); 84 ops in ONE gesture (58 GEOM_INSERT + 26 GEOM_CUT), all with provenance; C1-FALSIFY reports exactly the 2 moved boxes. **GAP C1 FILLS**: Node 26, page 0 (`GAP:lod400_library_unreachable` ×26, console.error, no box).
- C2: reimport IfcWall 56 / IfcSlab 1 / IfcRoof 1 = committed; IfcOpeningElement 26; storeys 2; contained 58 = products. C3: the raw GF plan → refused naming that sheet, Convert disabled, op-log 0→0. C4: one undo → 0 converted ops, 0 meshes.
- Regression: W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS.

### L3.2 Fills from the real library (2026-10-16, written before the code)
Closes the L3 GAP C1 FILLS (`GAP:lod400_library_unreachable` x26). User rule: no LFS or DB on GitHub; prototyping stays LOCAL on this machine, deploy = OCI later.
- **Encoding (read from code, then measured).** `component_geometries.vertices` = float32 little-endian xyz triples, `faces` = int32 little-endian index triples (BIMCompiler `GeometryIntegrityChecker.blobToFloats/blobToInts`, `extractIFCtoDB.py` `faces.astype(np.int32).tobytes()`, the Node run's `readFloatLE`/`readInt32LE`). `normals` is NULL for all 10 bound meshes (exported as `null`, not invented). Check: decoded mesh bbox vs the source door/window extent in `DX_extracted.db`.
- **Export (BIMCompiler `scripts/export_library_subset.js`, committed there).** Input: a pipeline run's element summary (`out/duplex_basic_shapes_elements.json`: the fills' `family_id` + `geometry_hash`) and optionally the labels that run applied. Output JSON (no timestamp; same input twice = byte-identical):
  - header: source DB path basename, its SHA-256 and byte size, the input summary's SHA-256 + run_id, row counts per table and mesh count;
  - `rows.ad_opening_family` (all active rows, the columns the pipeline reads) and `rows.ad_wall_type` (all active): `bindTypes` chooses among ALL size candidates, so a subset of them could bind differently;
  - `rows.ad_geometry_map`: for every BOUND family, every door/window map row with the same class and `Dxf2Shell.pairKey` size key (the candidate set `familyToRef` and the orientation rule read), deduped by element_ref|hash as the pipeline does;
  - `complete_for_families`: those bound family ids (the candidate set is complete only for them);
  - `meshes[hash]`: decoded `vertices` (flat), `faces` (flat), `normals` (null when NULL), counts;
  - `labels` (optional): the window labels the Node run applied, written by `rosetta_dx_shell.js` to `out/duplex_basic_shapes_labels.json` (from the source model: round trip, stated; L4 tags replace them).
  The script refuses (exit 1) when a bound geometry_hash is not in the candidate set or a mesh row is missing.
- **Where it lives.** Written to `modeller/dxf2bim/local/library_subset_duplex.json`, a git-IGNORED dir served with the Modeller. NOT committed (no library data in bim-ootb). Missing file → the page path is unchanged: `GAP:lod400_library_unreachable`, no box. Deploy: OCI (the production loader and the full-library loader are OPEN, need the user).
- **Module (`dxf2bim_import.js`).** `librarySubset(json)` → the `library` object `convert` already takes ({families, wallTypes, geoms, labels}) plus `complete` and `missing`. A family whose selected product (`Dxf2Shell.familyToRef` over the map rows, which are all present) has a candidate row whose mesh is absent is WITHHELD: selection without every candidate mesh could pick another one (the orientation rule reads each candidate's bbox). Its openings are taken out before `placeFills` and each is a hard `GAP:lod400_mesh_missing` (product + missing hash), so EVERY fill of that product fails (both orientations), and the storey's other fills go through `placeFills` unchanged. A bound family outside `complete_for_families` → `GAP:lod400_not_in_subset`, same way. `fill_unbound` gaps (not hard in the module) are reported too.
- **Ops.** Each fill = `GEOM_INSERT {realGeomHash:'lib-<geometry_hash>', bbox, placement{x,y,z,rot:0}, ifc_class IfcDoor|IfcWindow, storey, storey_elev, provenance{dxf_handle, layer, sheet, run_id, element_ref, geometry_hash, family_id}}` in the SAME convert gesture. The library mesh is registered ONCE per hash via `Library.registerRealGeometry` (`rg:lib-<hash>`, recentred on its bbox centre, anchorOffset 0); `lib-` keeps it apart from a resident's `rg:<hash>`. Cut `slide.filling` stays null (not claimed).
- **Witnesses** (each run regenerates the JSON first via the export script, then reads the log):
  - C1-PORT-SUBSET (`witness_dxf_import_node.js` P6): the module with the subset JSON instead of the DB equals the Node run element-for-element incl. 26 fills. Issue: the subset loses a candidate or a label, so a fill binds differently.
  - P7 DETERMINISM: two exports byte-identical.
  - C1-FILLS (page): 26 fills placed; each one's rendered centre and bbox equal the Node run's within 1 mm, class and storey equal.
  - C1-FILLS-FALSIFY (page, JSON served with one mesh removed): exactly the Node fills of that mesh's product (element_ref) hard-fail with `GAP:lod400_mesh_missing`, all others placed, no extra insert (no box).
  - C2: reimport adds IfcDoor 4 + IfcWindow 22 (= committed), storeys 2, contained == products.
  - Regression: C0-C4, W-IFC-SPATIAL, W-IFC-EXPORT-SEED, W-BONSAI-IFC. Screenshot `~/Videos/dxf2bim_work/l3/l3b_fills.png`, read by eye.
- **Re-sync (same PR).** BIMCompiler master `4bb4bf3c0` (#182) moved the roof sheet to `@VIEW=ROOF` + `@LEVEL` + `@ROOF`: `dxf2marks.js` re-copied verbatim (SOURCE.md), R3 above updated, marked inputs + Node reference regenerated with the master scripts: run_id `501b2d4e…` (was `2045e4e0…`), OBJ `246ce6f0…` unchanged. `sw.js`: `dxf2bim/local/` network-first (a regenerated subset is never served stale), cache v82.
- **Open, needs the user:** deploy of the subset (OCI) and the full-library loader; `slide.filling` link cut↔fill; any building but the Duplex.

**L3.2 results (2026-10-16).** Logs `modeller/tests/logs/witness_dxf_import_node.log`, `witness_dxf_convert.log` (inputs: BIMCompiler `feat/library-subset-export` on master 4bb4bf3c0).
- Encoding: float32 LE vertices / int32 LE faces, normals NULL (20/20). Decoded bbox 00b72db6… = 0.467 × 1.402 × 2.086 m and 974f0644… = 4.835 × 0.417 × 2.420 m, equal to the source `M_Single-Flush:1250…` and `M_Fixed:4835…` extents in DX_extracted.db (to 0.1 mm).
- Subset: 104,632 bytes (68 families, 18 wall types, 20 map rows, 20 meshes, 12 labels), source DB sha256 `7e5df6e1…`; two exports byte-identical (P7).
- Node: P1-P7 PASS (P6: subset == Node run, 106 elements incl. 26 fills).
- Page: C0, C1 RUN-ID/PARITY/COUNTS/PROVENANCE/CUTS PASS; **C1 FILLS PASS** 26/26 (IfcDoor 4, IfcWindow 22; rendered centre + bbox 1 mm); C1 FILLS-FALSIFY PASS (mesh 00b72db6 dropped → exactly fills 10F, 111 `GAP:lod400_mesh_missing`, 24 placed, 82 inserts, no box); **C2 PASS** reimport IfcWall 56 / IfcSlab 1 / IfcRoof 1 / IfcDoor 4 / IfcWindow 22, storeys 2, contained 84 = products; C3, C4 PASS.
- Regression: W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS. Screenshot `l3b_fills.png` read: doors and glazing sit in the cut openings.

### L3.3 L3 on the std set (2026-10-16, written before the code)
The film uses the std Duplex set (BIMCompiler master `d06a63c8a`: 8 sheets GF/FF plans, 4 elevations, ROOF, SECTION; markings from the model, `@BY=model`; dxf2qualify verdict **qualifies**, 0 blocking). The old marked set is verdict **blocked** (347). L3 must convert the std set like the Node run (`DXSET=std rosetta_dx_shell.js`) and refuse what qualify blocks.
- **Same source, no fork (BIMCompiler §13, PR on master).** The std layer maps, the qualify settings and the door casing lived in test scripts (`set_configs.js`, `rosetta_dx_shell.js`): moved verbatim into `deploy/dev/dxf2shell_config.js` (`STD`, `QUALIFY`, `CASING`), logs unchanged. The std run_id now covers the SECTION sheet and the std maps (`runId(..., maps)`; DX run_id unchanged); the std run writes `out/duplex_basic_shapes_elements_std.json` + `_labels_std.json`.
- **Copies.** `modeller/dxf2bim/sync.sh <BIMCompiler dir> <commit>` copies `dxf2{bim,elev,marks,mesh,types,shell,shell_config,qualify}.js` + `dxf-parser.js` VERBATIM with `git show <commit>:deploy/dev/<f>` and rewrites SOURCE.md (commit + sha256 per file). Re-synced from the §13 commit (BIMCompiler branch `feat/dxf2bim-std-modeller` = master `e3e9c70cd` + §13; re-sync from master once it merges).
- **Layer-map set (DX or STD), from evidence, refusing when ambiguous.** Each set's elevation map names its elevation-wall layer (`MAP_ELEV` rule type `elevwall`: DX `A-ELEV-WALL`, STD `A-WALL`). The set is the one whose elevwall layer has entities on EVERY elevation sheet; both or neither → gate refuses `layer set ambiguous` naming the sheets. No new constant: the layers are read from the copied config.
- **R5 SECTION role.** `@VIEW=SECTION` with no `MARK:missing` (NEED: SET, VIEW, UNITS, HAXIS, CUT + `GRIDH(>=2)`, `Z(>=2)`) → role `section`. Gate: at most 1 section. Canvas: a section sheet aligns to the lowest plan by `Dxf2Marks.align` (as the Node run); a point (h, v) → plan axis `map.axis` = `toPlan(h)`, the `@CUT` axis = the cut coordinate × the sheet's unit factor, z = `zOf(v)`. Not aligned → not drawn, logged.
- **Pipeline port = master `pipeline()` (variant A), same calls, same order:** `applyElevations` → `applyWallHeights` → plan `@TAG`s (`T.applyTags`) → `applyDoorHeights` with the plan schedule (`T.scheduleFromDesc`) and `schedule_head_frame: CASING`; the SECTION sheet (if any) → `S.sectionSlabs(…, STD.MAP_SECT, align map, storey levels, CFG, @ROOF)` passed to `slabZ`; `@WALLTOP` → `E.applyWallTops(after, before, desc, level, U)` with U = the next storey's slab underside, the top storey's = roof bottom; maps of the chosen set; run_id with the set's maps (STD: + sect) over all sheet texts; after the wall tops, L2.8 (BIMCompiler `e3e9c70cd`) `S.applyWallBases` per storey (section cut walls > elevation > plan level + `GAP:wall_base_from_plan_level` advisory, in the qualify gaps as shape walls) and, before meshing, `S.mergeStacked` (one wall per footprint across consecutive plans). Rest unchanged (labels, binding, bridge, fills, mesh).
- **Qualify gate (ONE function, `DxfImportUI.convertGate()`, shared with the L4 editor).** Runs at import: roles gate (R1-R5) → the pipeline (with the local library subset) → the qualify input exactly as the Node run builds it (`files` {name, dxf, layer_maps per role: plan [PLAN], roof [ROOF], section [STD.SECT], elev DX [ELEV, LEVL] / STD [ELEV, LEVL, EXCL_ELEV]}, `plan_ops` = each plan's `Dxf2Bim.run` ops, `gaps` + `resolved` per sheet as `rosetta_dx_shell.js` writes `dx_shell_gaps.json`) → `Dxf2Qualify.qualify(input, set QUALIFY)`. Convert is enabled only when roles pass AND verdict = qualifies; otherwise the panel lists the blocking count by code and the first items (sheet, handle, message). Stated consequence: with no library subset the fills' `GAP:lod400_library_unreachable` are blocking (openings) → the set is refused, never converted without its fills.
- **Witnesses (std set; inputs regenerated first by the master chain, read every log):**
  - Node `witness_dxf_import_node.js` with `DXSET=std`: P1-P7 against `duplex_basic_shapes_elements_std.json`; P8 VERDICT: the module's qualify verdict equals rosetta_qualify's std verdict (qualifies, blocking 0, advisory count). Issue: the port's gaps or qualify input drift from the Node run.
  - Page `witness_dxf_convert.js` with `DXSET=std`: C0 (plans, roof, elevations, SECTION on its cut plane: every read layer at the cut coordinate (1 mm), its cut walls A-SECT spanning the plan envelope along the section axis (1 mm); amended 2026-10-16 after the first run: the S-SLAB lines extend beyond the envelope (drawn content, -22.18..-0.42 m), so 'S-SLAB within the envelope' was not a rule of the drawing), C1 (run_id, every element incl. the fills within 1 mm), C1-FILLS, C2 (IFC classes = committed, storeys 2, contained = products), C3 (the OLD marked set: verdict blocked → Convert disabled, forced convert refused, op-log unchanged; and a std plan without markings → roles refuse), C4 one undo.
  - C1-FILLS-FALSIFY (std): one mesh removed from the served subset → exactly that product's Node fills get `GAP:lod400_mesh_missing`, these are the only blocking items, so the gate refuses (Convert disabled, forced convert refused, op-log unchanged).
  - Regression: the old set C0 (canvas only, it no longer converts), W-IFC-SPATIAL, W-IFC-EXPORT-SEED, W-BONSAI-IFC. Screenshot `~/Videos/dxf2bim_work/l3/l3_std_converted.png`, read by eye.

**L3.3 results (2026-10-16).** BIMCompiler `feat/dxf2bim-std-modeller` (master `e3e9c70cd` #189 + §13): chain std2d → mark std → `DXSET=std rosetta_dx_shell` 36/0 (std run_id `0c538552…`, 158 elements, 51 infill) → rosetta_qualify std **qualifies**, 0 blocking, 75 advisory; old set blocked 347. §13 left every Node log unchanged except the two new std checks. Copies re-synced by `sync.sh` from `8cba44890`.
- Node (`witness_dxf_import_node.js`, read): std P1-P8 PASS (P2 158/158, P6 36 fills from the subset, P8 module verdict == Node verdict: qualifies, 75 advisory); old set P1-P8 PASS (P8 both blocked, 347). Subset (std) 136,432 bytes.
- Page (`witness_dxf_convert.js`, read): C0 std 8 sheets PASS (SECTION: all read layers at x = 2.30425, A-SECT spanning the envelope -17.8..0); C0 GATE: one gate → STD set, qualifies; C1 run_id `0c538552…` equal, PARITY 71 solids + 28 cut bodies (51 infill) within 1 mm, COUNTS, PROVENANCE (171 ops), CUTS 36; **C1 FILLS 36/36** (IfcDoor 14, IfcWindow 22) within 1 mm; C1 FALSIFY; **C2** reimport IfcWall 96 / IfcSlab 2 / IfcRoof 1 / IfcDoor 14 / IfcWindow 22, storeys 2, contained 135 = products; C4 one undo; C1-FILLS-FALSIFY (mesh 00b72db6 dropped → fills 110, 112 `GAP:lod400_mesh_missing`, the only 2 blocking, refused, op-log 0→0); C3 raw GF refused by roles naming it; C3 old set: C0 PASS, refused by the verdict (blocked 347). All PASS.
- Regression: W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS. Screenshot `l3_std_converted.png` read: two storeys, doors and glazing in the cut openings, roof with two skylight holes; `l3_std_imported_sheets.png`: 8 sheets incl. the section on its plane.
- Stated: the gate runs the whole pipeline at import (the convert commits that judged run). The page reads ONE local subset file; the witness writes the std one (the old set then reports `GAP:lod400_not_in_subset` for its other products, and is blocked anyway). Old marked set: no longer converts (qualify blocks it).

### L3.4 The library on OCI, the public Modeller loads it (2026-10-17, written before the code)
User (2026-10-17): "Yes do send those library to OCI" (the library stays local while prototyping, goes to OCI at deploy). Closes the §L3.2 open item "deploy of the subset (OCI) and the full-library loader".
- **Measured first.** `component_library.db` 230,539,264 bytes, sha256 `7e5df6e1…`: 23,888 meshes (187 MB of blobs, every IFC class). The binder (`bindTypes` + `familyToRef` + `placeFills`) reads only `ad_opening_family` (68 active), `ad_wall_type` (18 active) and the IfcDoor/IfcWindow `ad_geometry_map` rows (804, 337 after the element_ref|hash dedup) with their meshes (331 hashes, 87,100 vertices, 168,256 triangles, normals NULL 331/331, 0 rows without a mesh). The GitHub Pages Modeller cannot range-stream a DB (no COOP/COEP), so the library ships as JSON. **FULL = that binder universe**, not the 23,888 meshes (pipes, plates, … are never read by a DXF fill).
- **Labels finding.** The std set's 36 fills need the 12 Level 2 window labels the Node run takes from the source model (round trip, stated in §L3.2): the module with the subset minus its labels places 24/36 and the verdict is blocked (12). Labels are run data, not library data: they ship per run_id (below) and apply only when the imported set's run_id equals it; any other drawing set gets none (its ambiguous windows stay blocked until `@TAG`, §L4.1).
- **Export (BIMCompiler `scripts/export_library_subset.js --full --out-dir <dir> [--labels <labels.json> …]`).** Same queries, decoding and dedup as the subset mode. Writes, deterministic (no timestamp; twice → byte-identical):
  - `<sha12>/index.json` (`dxf2bim-library-index/1`): source {db, sha256, bytes}; encoding; shard rule `geometry_hash[0:2]`; counts; `rows.ad_opening_family` + `rows.ad_wall_type` (all active: the binder chooses among all of them); `rows.ad_geometry_map` = every deduped door/window row with its `shard`; `geometry_shard` {hash: shard}; `shards` [{name, meshes, rows, bytes, sha256}].
  - `<sha12>/shard_XX.json` (`dxf2bim-library-shard/1`): the meshes whose hash starts with XX (decoded as the subset) + the map rows that point at them.
  - `labels/<run_id>.json` (`dxf2bim-labels/1`) per `--labels` file: {run_id, source file + sha256, labels}.
  - `latest.json`: {format, library_sha256, path `<sha12>/index.json`}. `<sha12>` = first 12 hex of the DB sha256, so a cached shard is never served for another library.
- **OCI (bucket `bim-ootb`, new prefix `dxf2bim/`; the old root `component_library.db` is untouched).** `dxf2bim/library/<sha12>/…`, `dxf2bim/library/latest.json`, `dxf2bim/library/labels/<run_id>.json` (the export dir uploaded as is), each `--content-type application/json`, gzip-encoded as the bucket's building DBs (OCI_UPLOAD rule 8); verified by curl (`--compressed` sha256 == local, Content-Type, `Access-Control-Allow-Origin` for Origin `https://red1oon.github.io`). latest.json is the one mutable object: an overwrite may lag the OCI edge cache (OCI_UPLOAD), the versioned files never change.
- **Loader (`dxf_import_ui.js loadLibrary(sheets)`, pure parts in `dxf2bim_import.js`).**
  1. Local override: `dxf2bim/local/library_subset_duplex.json` present → used as today; log `§DXF-LIB source=local sha=<db sha12>`.
  2. Else OCI: `latest.json` (no-store) → `index.json` → `Dxf2BimImport.loadOci`: starts from the index alone (families + wall types, no meshes, `complete` = []). Iterate (≤ 4 passes, each one `convert`, ~0.1 s): the run's `GAP:lod400_not_in_subset` type ids are the bound families not yet loaded → their candidate rows (`Dxf2Shell.pairKey`, the export's rule) → their shards (fetched once, memoised) → `libraryFromShards` (the subset form, then `librarySubset`, so withheld/missing behave as §L3.2); the run's run_id → `labels/<run_id>.json` (404 = none, memoised). Stop when no new family and the labels of that run_id are known. Log `§DXF-LIB source=oci sha=<sha12> shards=<n> families=<n> labels=<run_id12|none> passes=<n>`.
  3. Any fetch or format failure → `null` → `GAP:lod400_library_unreachable` (no box), as today; log `§DXF-LIB source=none reason=…`.
  - The module: `convert` takes the labels from `library.labelsByRun[run_id]` when the library carries `labelsByRun` (run_id is computed before the labels are applied), else `library.labels` (the local subset, unchanged).
- **sw.js.** `…/dxf2bim/library/<sha12>/…` and `…/dxf2bim/library/labels/…` cache-first (immutable per name); `latest.json` network-first; local/ network-first as before. CACHE_VERSION bump, `?v=` on the changed files.
- **Witnesses (each names its issue; read every log).**
  - L1 `witness_dxf_lib_oci_node.js`: the module fed from the shards DOWNLOADED from OCI (the loader's own iteration, Node fetch) vs the Node run from the local DB: the 36 std fills (14 IfcDoor, 22 IfcWindow) equal by guid, element_ref, geometry_hash, bbox 1 mm; verdict qualifies. Issue: the shards lost a candidate, a mesh or the labels, so a fill binds or sits differently. Plus: the downloaded objects' sha256 == the export (index lists them), and two exports byte-identical.
  - L2 (page, `witness_dxf_convert.js` `DXF_LIB=oci`): the local subset URL answers 404 (as on GitHub Pages, where the folder does not exist); the std set → log `source=oci`, qualifies, convert, C1 FILLS 36/36 within 1 mm. Issue: the public page cannot reach the library (CORS, content type, path) or builds another one.
  - L3 falsify (page, test hook = puppeteer answering latest.json with a non-existent sha; production code unchanged): `GAP:lod400_library_unreachable`, no fill insert, gate refuses. Issue: an unreachable library silently yields boxes or a pass.
  - Regression: `witness_dxf_import_node.js` (old + std), `witness_dxf_convert.js` (local subset), `witness_dxf_meta_editor.js`, W-IFC-SPATIAL, W-IFC-EXPORT-SEED, W-BONSAI-IFC.
- **Samples (for the user guide, BIMCompiler PR #194).** `dxf2bim/samples/duplex/raw/` = the std2d output (8 sheets, no markings), `…/marked/` = `mark_dx_set.js std` output (8 sheets), from one master chain run; `text/plain`; a `README.txt` (source: the public Duplex IFC in bim-ootb `IFC/`, the chain, what raw vs marked means). Not committed to git.


**L3.4 results (2026-10-17).** BIMCompiler PR #195 (`--full`, on master `0c0abb7b2`; std chain re-run first: std2d output and marked std set byte-equal to master's, std run_id `0c538552…` SUMMARY fail=0). Logs `modeller/tests/logs/witness_dxf_lib_oci_node.log`, `witness_dxf_convert.log`.
- Export: 190 shards + index + 1 labels + latest = 7,404,950 bytes in 193 files (1,498,603 gzip-encoded on OCI); two runs `diff -r` empty; subset mode output unchanged (136,432 bytes, same sha256).
- OCI: `dxf2bim/library/7e5df6e10027/` + `latest.json` + `labels/0c538552….json`: all 193 objects sha256 == local (curl `--compressed`); `Content-Type: application/json`, `content-encoding: gzip`, `access-control-allow-origin: *` for Origin `https://red1oon.github.io` (GET and OPTIONS preflight). Old root `component_library.db` untouched (477,155,328 bytes, 2026-04-20). Samples `dxf2bim/samples/duplex/{raw,marked}/` 8 + 8 DXF (`application/dxf`, sha256 == local) + `README.txt`.
- L1 `witness_dxf_lib_oci_node.js` O1-O4 PASS: loader 3 passes, 29 shards / 9 families / labels of run `0c538552…`, 32 objects fetched (941,177 bytes decoded) byte-identical to a fresh export; fills 36/36 (IfcDoor 14, IfcWindow 22, 14 meshes) == the Node run (guid, product, hash, bbox 1 mm), verdict qualifies.
- L2 `DXF_LIB=oci witness_dxf_convert.js` (local URL 404): `§DXF-LIB source=oci sha=7e5df6e10027 shards=29 families=9 labels=0c538552e616 passes=3`; C0-C4 PASS incl. **C1 FILLS 36/36** (1 mm), C2 reimport IfcDoor 14 / IfcWindow 22. One earlier attempt died in `waitForFunction` ("Waiting failed") under machine load average 22; the re-run passed whole.
- L3 C5 LIB-UNREACHABLE PASS (both modes): latest.json → sha `000…` → `§DXF-LIB source=none`, 36 `GAP:lod400_library_unreachable`, the only blocking code, gate refused, forced convert refused, op-log 0→0, 0 meshes.
- Regression: `witness_dxf_convert.js` local mode 17/17 (`source=local`), `witness_dxf_import_node.js` old + std fail=0, `witness_dxf_meta_editor.js` fail=0, W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS.
- Stated: the sample run's 12 Level 2 window labels come from the source model (round trip); any other drawing set gets none.


### L3.5 No labels sidecar: the window products are @TAG markings in the marked set (lead review 2026-10-17, written before the code)
Supersedes the labels parts of §L3.4 (its "Labels finding" route, `labels/<run_id>.json`, the loader's labels fetch, `convert`'s `labelsByRun`). Rule: metadata lives IN the DXF (`DXF2BIM-MARK`), its source via `@BY`; no sidecar (§L4.1/§L4.2, the @BY decision).
- **BIMCompiler (§14 LF-4, PR #195).** `mark_dx_set.js std` writes, for each `819mm x 759mm` window of the plan's storey, `@TAG=window,z=<mid z m>,<family id> @BY=model` at its plan bbox centre (mm), with the same model-name → family map and the same points/z the Node run used as labels (`M_Fixed` → DUPLEX_SMALL_FIXED, `M_Casement` → DUPLEX_CASEMENT); a window with no family → REFUSE. Grammar: `@TAG=<class>,[z=m,]<text>` (dxf2marks.js), applied by `Dxf2Types.applyTags` with the same `hits()` as `applyLabels`. `rosetta_dx_shell.js` applies no source-model labels to the std set (the old DX set keeps them). `--full` exports library data only (no `--labels`).
- **Modeller.** `loadOci` fetches latest → index → shards only; `convert` reads `library.labels` (the local subset's, now empty for std) as before §L3.4. sw.js: the `labels/` cache rule goes. OCI: the labels object is deleted; `marked/DX_FLOOR_FF_marked.dxf` is replaced in place (+12 `@TAG`), README notes it (sha256 list + change line). The RAW set lacks the tags by design: the editor's Tag tool is where a user states them.
- **Witnesses.** L1 O1-O4 (no labels anywhere), L2 `DXF_LIB=oci` C0-C5 (C1 FILLS 36/36 from the marked set + library alone), L3 C5, regression as §L3.4 + `witness_dxf_import_node.js` std without labels (issue: the tags do not bind as the labels did → P2/P6 fail). The std run_id changes (the FF plan text changed); elements equal the §L3.3 run by class, storey, product, hash, bbox, volume (only guids, which hash the run_id, change).


**L3.5 results (2026-10-17).** BIMCompiler PR #195 `eb259b90c` (mark std: 12 window tags, Level 2 tags labelled=20; `DXSET=std rosetta_dx_shell.js` fail=0, fills 36/36, run_id `0215ad6c…`, elements equal the §L3.3 run but for guids; `rosetta_qualify.js` std qualifies 0/75; `verify_marks_dx.js std` fail=0). OCI: `labels/…` deleted (404), `marked/DX_FLOOR_FF_marked.dxf` + README replaced, sha256 == local; library objects unchanged (re-export byte-identical).
- L1 O1-O4 PASS: 2 passes, 29 shards, 31 objects (no labels) == fresh export; fills 36/36 (14 + 22) == the Node run, verdict qualifies.
- L2 `DXF_LIB=oci` 17/17: `source=oci … passes=2`, C1 RUN-ID `0215ad6c…`, C1 FILLS 36/36; L3 C5 PASS; local mode 17/17.
- Regression: `witness_dxf_import_node.js` old + std (std without labels) fail=0, `witness_dxf_meta_editor.js` fail=0, W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS.
- Rebased on main `bc9fff0a` (#2071, §L4.4): sw.js v88, `dxf_import_ui.js?v=6`. Re-run: L2 `DXF_LIB=oci` 17/17 (C1 FILLS 36/36), `witness_dxf_meta_editor.js` 33/33 (E7 319 actions), L1 O1-O4, std import fail=0.
- L2 flake (puppeteer "Waiting failed" right after the convert commit, 4 of ~9 OCI runs at load average 22-30, 0 of ~5 local runs): the witness now records renderer crashes (`PAGECRASH`), an unexpected browser disconnect and Chrome minidumps (`--crash-dumps-dir`, `DXF_CRASH_DIR`), and prints the error's cause. The one failing run with that capture showed no crash, no disconnect and no minidump; the next run (load 39) passed. Waits unchanged. Cause not yet identified (stated, open).

## L4. Metadata editor (Modeller panel, `#ins-panel` pattern, Lucide icons)
- **Sections:**
  - Sheets (role, level / face)
  - Units
  - Layers (map / exclude, with saved templates for NCS/AIA)
  - Tags (click an element on the canvas, choose from the canned vocabulary)
  - Exclude areas (drag a box)
  - Verdict (live L2 result, blocking list clickable → zooms to the item)
- **Propose → confirm:** the pipeline's evidence-based proposals (as `farm_mark.js`, refusing when ambiguous) show as suggestions. Nothing becomes a marking until the user confirms it. A confirmed marking records `confirmed_by: user`.
- **Save:** writes the markings back as `DXF2BIM-MARK` texts into a downloaded copy of the DXF. The original is never modified.
- **Tests:**
  - E1 Duplex marked → every field shows the file's markings, verdict green
  - E2 stripped → blanks shown red; filling them via UI actions (E2E harness) reproduces the original markings byte-equal and the verdict turns green
  - E3 an unconfirmed proposal never reaches the saved file
  - E4 mutation: the editor writes one wrong level → Q-verdict blocked


### L4.1 Build spec (2026-10-16, written before the code; revised the same day on the §L3.3 base)
Scope: the "Drawing metadata" panel, the live verdict, propose → confirm, save. Module `modeller/dxf_meta_editor.js` (lazy, loaded with the import scripts); hooks only in `dxf_import_ui.js` (button, canvas index, `applySheets`, `holdGate`) and `dxf2bim_import.js` (`setWith`, `qualifyNotRun`, a user-stated set). Inputs: the old Duplex marked set (7 sheets, `rosetta_qualify.js` Q1) and the std set (8 sheets), regenerated with BIMCompiler master `be1dcda91` (std2d `--door-ops` → `mark_dx_set.js std` → `DXSET=std rosetta_dx_shell.js`; `mark_dx_set.js` → `rosetta_dx_shell.js`).

**Sources.** The copies (incl. `dxf2qualify.js`) are synced by the §L3.3 script `modeller/dxf2bim/sync.sh <BIMCompiler> <commit>`; one command, no second script. The witness checks every copy equals `git show HEAD:deploy/dev/<f>` of the BIMCompiler that made its inputs (E0).

**ONE gate.** The verdict the editor shows is `DxfImportUI.convertGate()` (§L3.3), never a second computation: the editor hands in the EFFECTIVE sheets (below), its layer rules and the set it states (`applySheets`), the gate runs roles → pipeline (local library subset) → qualify, and Convert follows `gate.ok`. While a change is pending the gate is held (`holdGate`: Convert off). When the pipeline cannot run (roles incomplete, or the pipeline refuses), the gaps are UNKNOWN: `Dxf2BimImport.qualifyNotRun` qualifies the same files with one blocking `GAP:pipeline_not_run {reason}` (shape set) in place of the gaps, so marking / layer / unit / dimension / grid items still show and nothing passes silently.

**Marking model.** Per sheet (one view per file; `@REGION` files: open question) a list `{key, value, x, y, source}`:
- `file`: read by `Dxf2Marks.readMarks`. Shown by its `@BY` suffix: none → "from file", `model` → "from model", `user` → "you".
- `user`: typed / chosen, or a proposal the user ticked. Shown "you".
- Proposals are a separate list: never a marking, never in the verdict input, never saved until ticked.
- Canonical form (E2): the sorted `@KEY=VALUE` strings (the `@BY` suffix stripped) plus the position that carries meaning: x for `@GRIDX`/`@GRIDH`, y for `@GRIDY`/`@Z`, x,y for `@TAG`; other positions ignored.
- Effective sheet text: the original text when the markings equal the file's; else `Dxf2Marks.writeMarks(strip(original), markings)`; `strip` drops every TEXT/MTEXT on `DXF2BIM-MARK` in ENTITIES (group-code walk, nothing else touched). Position-free markings are written at (0,0).
- **Source `@BY` (lead decision; BIMCompiler #187 grammar):** a per-marking suffix in the SAME TEXT, e.g. `@LEVEL=3.1 @BY=user`; it qualifies the other `@KEY` of that TEXT only (no scope by position or handle order). The editor writes ` @BY=user` on every marking the user enters or ticks, when the synced grammar accepts it (runtime check: `describe('@LEVEL=1 @BY=user')` gives level 1, no error); otherwise without it, said in the panel. No sidecar.

**Sections.**
- Sheets: role select (PLAN / ELEV / ROOF / SECTION = `@VIEW`) and the keys its role needs (`Dxf2Marks` NEED): `@SET @NAME`; PLAN `@LEVEL` + grids (`@GRIDX/@GRIDY` label + position); ELEV `@FACE @HAXIS @ROOF` + `@GRIDH` + `@Z` (z + drawing y); ROOF `@LEVEL @ROOF`; SECTION `@HAXIS @CUT` + `@GRIDH @Z`. Needed and empty → red.
- Units: per sheet a select, empty until picked; beside it "file says X" ($INSUNITS in the tooltip). The header is never applied by itself (it is a proposal with a tick).
- Layers: the layer-map set in use (DX / STD of `dxf2shell_config.js`, chosen by the gate from the elevation-wall layer evidence, or stated by the user in a select) and every layer per role with the set's type ("template", read-only). A layer the set does not match is red; the user picks wall / door / glazing / dims / grid / level / ignore (+ roof on ROOF sheets). The rule is appended as an exact rule to that role's map for the pipeline AND qualify (`Dxf2BimImport.setWith`); dims / grid also join `QUALIFY.layers`. With rules the run_id hashes the effective maps (stated). Type → rule: wall = wall (plan) / elevwall (elev); door = opening / elevdoor; glazing; level = levelline (levl map); roof; dims, grid, ignore = ignore.
- Tags: a Tag tool; click an entity on a plan or roof sheet on the canvas (raycast on the sheet's lines, per-segment handle index) → class (door / window / wall) + a value from the canned vocabulary: the local library subset's family ids and the set's `@SCHEDULE` texts. Writes `@TAG=<class>,<value>` at the entity's raw bbox centre. No free text.
- Excludes: an Exclude tool; drag a box on a chosen plan or roof sheet (on its z plane) → `@EXCLUDE=x0,y0,x1,y1` raw. Elevations: open.
- Wall tops: per PLAN the convention `@WALLTOP=<level>,slab_above` (tick + level field, default the plan's `@LEVEL`) and the wall-layer `GAP:no_elevation_height` list of the verdict, each clickable, with a top-z field writing the per-wall grammar `@WALLTOP=handle:<h>,<z_top_m>` (BIMCompiler #186).
- Verdict: chip "Qualifies" (green, 0 blocking) / "Blocked · N"; blocking (red) / advisory (amber) per shape (walls / slabs / roof / openings); the items (code, message); a click frames the canvas on the item (its handles' drawn segments, else its `pos`, raw → world by the sheet's role mapping), panned clear of the panel, and highlights the segments.

**Proposals (evidence only; ambiguous → none, with the reason).** PR-UNITS (`$INSUNITS`), PR-VIEW / PR-NAME (one title TEXT ending PLAN / ELEVATION / SECTION; ROOF PLAN → ROOF), PR-SET (the other sheets agree), PR-GRID (grid-layer LINE axis-parallel within 1 mm + exactly one 1-char label within 0.06 m across and 0.7 m beyond an end: `mark_dx_set.js gridLines`), PR-Z (`LEVEL ±z` / level-layer `±z` text paired with its own y or a level line: `levelPairs`), PR-HAXIS (unique fit against the lowest plan's grids, 1 mm), PR-FACE (sheet name FRONT/REAR/LEFT/RIGHT, repo convention R11, labelled as such). None for `@LEVEL`, `@ROOF`, `@WALLTOP`, tags, excludes.

**Save.** One button: per sheet a download `<base>_marked.dxf` (base = file name without `.dxf` and a trailing `_marked`) with the effective text. The opened files are never written. Re-import gives the same markings.

**Witnesses** (`modeller/tests/witness_dxf_meta_editor.js`, real UI through `tests/e2e_harness.js`; log `tests/logs/witness_dxf_meta_editor.log`):
- E0 COPIES: copies == BIMCompiler HEAD modules. E1 FROM-FILE: marked set → every marking "from file", no red field; editor verdict counts by code == Node `Dxf2Qualify` over the same files + maps + plan ops + `dx_shell_gaps.json`. E1 ZOOM: a verdict click frames + highlights the item's segments.
- E2 FILL: the set stripped by the witness's own stripper → role / units red; every value entered through selects, typing and Add clicks; the in-page verdict, the saved copies' canonical markings and the re-imported copies' verdict equal the marked set's; E2 BY: every saved marking carries `@BY=user` (grammar accepts it).
- E3 UNCONFIRMED: suggestions listed; one ticked (GF PR-UNITS); Save → only that marking in any file.
- E4 MUTATION: `@WALLTOP=3.2,slab_above` on FF (no plan at 3.2) → exactly one new blocking `QF:walltop_unknown_storey` on the new marking's handle; control 3.1 → no new blocking, the 17 FF wall height gaps leave the blocking list (the pipeline applies stated tops, `Dxf2Elev.applyWallTops`); untick → the file verdict again.
- E5: old set blocked → Convert disabled, `convert()` refused, op-log unchanged; std set → layer set STD from the drawings, editor verdict == gate, qualifies → Convert enabled, a real click converts (one gesture).
- T1 / X1 UI sanity: Tag tool click writes `@TAG` at the picked entity centre; Exclude drag writes `@EXCLUDE`.
- Screenshots `~/Videos/dxf2bim_work/l4/` (filled, verdict zoom, raw, mid-fill, std); regression `witness_dxf_import_node.js` (old + std), `witness_dxf_convert.js`, W-IFC-SPATIAL, W-IFC-EXPORT-SEED, W-BONSAI-IFC.

**Not claimed (L4.1).** Changing a template-mapped layer's type; excludes on elevations; `@REGION` (multi-view) files; layer rules surviving re-import (the DXF grammar has no layer key; session only).

**L4.1 results (2026-10-16).** BIMCompiler master `be1dcda91` (copies equal, E0). Log `modeller/tests/logs/witness_dxf_meta_editor.log`: SUMMARY fail=0 gap=0.
- E1: 76 file markings shown, all "from file", 0 red; verdict blocked 347 + 28 advisory, counts by code == Node. Zoom: 16 segments highlighted.
- E2: stripped → 7/7 role + 7/7 units red (verdict 72 incl. `GAP:pipeline_not_run`); 76 UI actions; in-page verdict, 7 saved copies (markings equal, every one `@BY=user`) and their re-import all == E1.
- E3: 21 suggestions, GF PR-UNITS ticked → saved files hold exactly `@UNITS=mm @BY=user` on GF, nothing else.
- E4: one `QF:walltop_unknown_storey` (handle 2AC = `@WALLTOP=3.2,slab_above @BY=user`); control 3.1: 347 → 330, 17 FF wall gaps gone, nothing new; untick restores.
- E5: old set Convert disabled, refused, op-log 0→0; std: set STD (evidence), qualifies 0 / 75 advisory, run_id `0c538552…` (= Node), Convert enabled, click → 171 ops (135 inserts, 36 cuts).
- T1 `@TAG=door,BATHROOM_DOOR` at the picked door centre; X1 `@EXCLUDE` from a drag.
- Regression: Node old + std SUMMARY fail=0; `witness_dxf_convert.js` 15/15; W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS.


### L4.2 Layer rules as markings: `@LAYER=<name>,<type>` (lead decision 2026-10-16, written before the code)
Closes the L4.1 open question "layer rules are session only". The layer map a user states becomes part of the drawing, like every other marking.

**Grammar (BIMCompiler `deploy/dev/dxf2marks.js`).**
- `@LAYER=<layer name>,<type>`, MULTI key, per sheet (a plan sheet and an elevation sheet each carry their own). The name is everything before the LAST comma (layer names may hold commas; types never do); both parts non-empty, else `MARK:malformed`.
- `<type>` is a rule type the reader of THAT view accepts (one table in dxf2marks, `LAYER_TYPES`, each entry traced to the code that reads it), plus `dims` and `grid`:
  - PLAN: `wall wallline slab component opening glazing ignore` (= `Dxf2Bim` `validateMap` TYPES, the plan reader's own check)
  - ELEV: `elevwall elevdoor glazing levelline ignore` (`Dxf2Elev.elevWallRects` / `elevClusters(…,'glazing'|'elevdoor')`, `Dxf2Shell.levelLinesZ`)
  - ROOF: `roof glazing ignore` (`Dxf2Shell.roofPlan`)
  - SECTION: `sectslab sectwall roof ignore` (`Dxf2Shell.sectionSlabs`, L2.8 section walls)
  - `dims` / `grid` (every view): the layer joins the qualify settings `layers.dims` / `layers.grid` for that sheet; for the readers it is `ignore`.
  - A type outside the view's list → `MARK:layer_type {layer, type, view}`. Checked after the loop (the view may come later in handle order); a sheet without `@VIEW` keeps its `@LAYER` unchecked (its `MARK:missing VIEW` already blocks).
- The same layer stated twice with different types → `MARK:conflict`. `@BY` applies as for every marking (L2.7 rule 5).
- `desc.layers = [{layer, type, by, handle}]` sorted by layer. Helpers: `Dxf2Marks.layerMap(desc)` → `{version:1, rules:[{match:'exact', pattern, type (dims/grid → ignore)}]}` or null; `Dxf2Marks.withLayers(map, desc)` → the map with those rules FIRST (first match wins in `matchRule`, so a stated rule overrides the configured set's rule for that layer; every other layer keeps the set's rule).

**Reader.**
- `dxf2qualify.js`: every configured map of a sheet passes through `withLayers` (the stated rules first in EACH map: qualify reads some types map by map, e.g. level lines, so a separate prepended map would not override them); with no configured map, the sheet's maps are `[layerMap(desc)]`. Grid / dims checks use `settings.layers.grid|dims` ∪ the sheet's `@LAYER …,grid|dims`. The verdict lists `layer_rules: [{sheet, layer, type, source: file|model|user, handle}]` (stated, like `conventions`).
- The pipeline callers apply `withLayers` per sheet: BIMCompiler `rosetta_dx_shell.js` (plans, elevations: elev + level maps, roof, section) and the Modeller port `dxf2bim_import.js` (same calls). Files without `@LAYER` are unchanged (identity), so every existing log and run_id stays.

**Modeller.** Copies re-synced by `sync.sh` from the BIMCompiler branch commit (re-sync from master once it merges). `dxf2bim_import.js` passes every map of a sheet through `Dxf2Marks.withLayers(map, sheet.desc)` (plan run, elevation elev + level maps, roof, section, and `qualifyNotRun`'s plan runs); the canvas brightness rule too.

**Editor (Modeller, L4.1 Layers section).** A user layer choice IS a `@LAYER=<layer>,<reader type> @BY=user` marking on every sheet of that role holding the layer (types: wall → wall / elevwall, door → opening / elevdoor, glazing, level → levelline, roof, dims, grid, ignore). File `@LAYER` markings show in the Layers section as "from file" / "from model". The session-only layer rules of L4.1 (`setWith` rules) are removed; the user-stated layer set stays.

**Tests.**
- BIMCompiler `tests/dxf2bim/test_layer_marks.js`, each names its issue: grammar (name with a comma, missing type, unknown type per view → `MARK:layer_type`, conflict, `@BY` kept, order-independent); `withLayers` overrides only the stated layer; the PLAN list equals what `Dxf2Bim.run` validateMap accepts (each type runs, an unknown one throws).
- `test_qualify.js`: QL1 an unmapped layer stated `ignore` → its `layer_unmapped` goes and the verdict lists the rule with its source; QL2 **mutation**: the FRONT elevation states `@LAYER=A-ANNO-LEVL,ignore` (wrong type for its level lines) → exactly 2 new blocking `QF:elev_level_mismatch` on FX_FRONT (z 0 and the roof 3), nothing else; QL3 `@LAYER=X,grid` makes X a grid layer for that sheet only.
- Regression: all BIMCompiler dxf2bim unit suites, rosetta_dx_shell (old + std: logs identical but timing), rosetta_qualify fail=0.
- Modeller `witness_dxf_meta_editor.js` E6 ROUND-TRIP, on the OLD marked set (its sheets carry 31 `QF:layer_unmapped`: A-ANNO-SECT on plans, annotation / title layers on elevations): every unmapped layer is mapped through the Layers UI (`ignore`, or `grid` / `dims` where the layer is one) → no `layer_unmapped` left and nothing else new; Save → each saved copy carries exactly those `@LAYER=… @BY=user` markings; re-import → the Layers section shows them as "you" with the same types, no red layer, and the verdict counts equal the pre-save verdict. Plus E1–E5 unchanged.

**Not built (as recorded in L4.1, decided "fine as recorded"):** one local library subset file; excludes on elevations; `@REGION` multi-view files; changing a set-mapped layer's type through the UI (it can be stated as `@LAYER` in the file, which then overrides).

**L4.2 results (2026-10-16).** BIMCompiler PR branch `feat/dxf2bim-layer-marking` `5ff2d85a7` (on master `be1dcda91`); Modeller copies synced from it by `sync.sh` (re-sync from master once it merges).
- BIMCompiler: `test_layer_marks.js` LM1-LM7 PASS (LM7 mutation: the wall layer stated `ignore` → 4 walls → 0); `test_qualify.js` QL1-QL3 PASS (QL2 mutation: exactly 2 `elev_level_mismatch` on FX_FRONT, z 0 and 3; QL3: plan `grid_missing` 4 → 0 with its own `@LAYER=A-GRID,grid`, FRONT unchanged). Regression vs master: 18 unit suites, rosetta_dx_shell old + std, mark_dx_set old + std, rosetta_qualify: outputs identical (paths aside) + the new checks.
- Modeller `witness_dxf_meta_editor.js`: E0-E6, T1, X1 PASS (SUMMARY fail=0 gap=0). E6: 12 layer choices (plans A-ANNO-SECT; elevations 0, A-ANNO-DIMS dims, A-ANNO-TEXT, A-GRID grid, A-ROOF, A-TTLB; roof sheet layers) → the 31 `layer_unmapped` gone, nothing new (347 → 316), verdict `layer_rules` all `user`; saved copies carry exactly those `@LAYER=… @BY=user` (1 per plan, 6 per elevation); re-import restores 12/12 ("you", same type), 0 red, verdict 316 / 28 equal. E2 (stripped → filled → saved → re-imported) still equal to E1; the witness now waits for the panel to settle before typing a row (a verdict re-render left puppeteer handles stale: a test race, not a user path).
- Regression: `witness_dxf_import_node.js` old + std fail=0, `witness_dxf_convert.js` 15/15, W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS. Screenshot `l4_editor_layers_reimport.png` read: stated layers with their select and "you", set layers as "template".


### L4.3 Doors: the door schedule and door tags in the editor; a raw set to "Qualifies" (2026-10-17, written before the code)
Problem (film take 11, `~/Videos/dxf2bim_film_work/take11.out`; reproduced in Node on the regenerated std set, BIMCompiler master `0c0abb7b2`): the std set with every DXF2BIM-MARK text removed, filled through the editor, stays **blocked, 28** = `GAP:no_elevation_height` 14 + `GAP:no_host_cut` 14, the 14 interior doors. No elevation draws them; the reader takes their height only from a door schedule through the door's tag (§L2.6 C: `@TAG=door,<mark>` → `@SCHEDULE=<mark>,door,<w>,<h>` → `height_source: 'schedule'`), and the editor has no schedule entry. Measured with the port in Node, removing marking keys from the marked std set:
- only `@TAG` + `@SCHEDULE` removed → blocked 28 (the same 28), elements 129 (no IfcDoor);
- per-wall `@WALLTOP=handle:…` removed (GF A1, FF 9B/9D) → qualifies, 158 elements, every element bbox equal: those walls already take their height from the drawings (elevation / section, §L2.8), and `applyWallTops` applies a per-wall top only to a wall-height gap. Not a blocker, not an editor gap: the Wall tops list (L4.1) shows only walls without a height, so the user is never asked for them.
- the SECTION `@ROOF` removed → qualifies, elements equal; but the editor has no field for it (take 11: "no field for @ROOF"), so a raw set cannot be filled to the marked set's markings. Fixed here: SECTION shows the "Roof top (m)" field (the std grammar §L2.6 E lists `@ROOF` on the section).

**Doors section (`dxf_meta_editor.js`, between Tags and Exclude areas; Lucide `door-open`).**
- **Schedule table** (drafting door-schedule columns: MARK · WIDTH · HEIGHT, plus DOORS = how many tags name it, and the source). Rows = the plans' `@SCHEDULE …,door,…` markings (shown "from file" / "from model" / "you") plus the rows the user adds (mark, width, height → Add). Width and height are in the plans' `@UNITS` (header shows it); when the plans state different units, or none, the table is read-only and says why (no conversion is guessed). Editing a row (its width or height field) makes it the user's: the file markings with that mark are replaced. A mark stated with two sizes is red (`MARK:conflict` in the reader too).
- **Where the schedule is written.** The reader reads the schedule per plan (`Dxf2Types.scheduleFromDesc` of that plan). A user row is written as `@SCHEDULE=<mark>,door,<w>,<h> @BY=user` on every PLAN sheet that holds a `@TAG` naming that mark; a row no tag names yet is written on every plan sheet (nothing typed is lost on Save). Position-free: (0,0).
- **Tag doors tool.** Click a door on a plan on the canvas. The click is resolved by the reader's own door rule (§L2.7 rule 3, `Dxf2Types` `hits`): the plan's door openings (`Dxf2Bim.run` of the effective sheet with the set's plan map + the sheet's `@LAYER` rules, `DXF_OPENING kind door`) whose swing box (hinge + both arc ends) or drawn opening box (`opening_box`) contains the clicked point on that plan's z plane (± `CFG.snap_tol`). Exactly one → picked (its arc highlighted); zero → "no door here"; several → "N doors here" and nothing is picked. The picked card shows the door (sheet, arc handle, leaf width read from the arc in the plan units) and a mark field: pick a schedule mark from the list or type a new one. "Tag" writes `@TAG=door,<mark> @BY=user` at the door's drawn opening-box centre (along-range and band midpoints, raw units), else its swing-box centre. Before writing, the point is checked against every door of that plan with the same rule: if it lies in more than one door's box the tag is refused (it would read `GAP:label_ambiguous`). A door that already carries a tag (any source) has it replaced. A typed mark that is not in the schedule becomes a red row "no size" until its width and height are entered.
- **Door list** per plan: each door (arc handle, leaf width, its mark or "no tag"); a door the verdict blocks (`GAP:no_elevation_height` / `no_host_cut` on its handle) is red; a click frames and highlights it (the L4.1 zoom). Section count = blocking door items.
- **Proposals** (evidence only, never a marking until ticked; ambiguous → none, with the reason), as BIMCompiler `farm_types.js` reads marks and schedules from the drawing's own text (SPEC §55):
  - PR-SCHEDULE: on a plan sheet holding a TEXT/MTEXT (not on DXF2BIM-MARK) whose text has a header line with MARK and SIZE (or WIDTH): each line (MTEXT `\P`-separated, or a TEXT entity) `<mark> <w> x <h>[unit] <description>`, with `<mark>` one token. Class door when the description names DOOR / PANEL / GLAZED (farm_types), window when WINDOW / DOUBLE HUNG / CASEMENT / FIXED; anything else → refused. A unit symbol (`"` / `mm`) must agree with the sheet's `@UNITS`; without one the numbers are in the sheet's units (dimension-text convention). Window rows are refused here ("window: not a door row").
  - PR-TAG: a TEXT (not on DXF2BIM-MARK) on a plan whose text equals a schedule mark (rows in the table) and whose insertion point lies in exactly one door's swing box or opening box (the reader rule above) → `@TAG=door,<mark>` at that door's opening-box centre (as the tool writes). Zero or several doors → refused with the reason.
- `@BY=user` on every marking the section writes (§L2.7 rule 5).

**Hooks.** `dxf2bim_import.js`: `planDoors(sheet, setName)` (pure; `Dxf2Bim.run` with `MK.withLayers(SET.MAP_PLAN, sheet.desc)`, returns the door openings with hinge, width, swing angles, opening_box, factor). No reader rule is added in the Modeller; the BIMCompiler grammar is unchanged (no BIMCompiler PR needed).

**Witness E7 (`witness_dxf_meta_editor.js`, real UI, std set regenerated by the master chain).**
- E7 RAW: the 8 marked std sheets with DXF2BIM-MARK stripped by the witness's own stripper (each compared with the std2d output it was marked from; logged).
- E7 FILL: every value through the UI: roles, set, name, level / face / H axis / roof / cut, grids, `@Z`, units, the wall-top convention per plan, the four schedule rows typed (mark, width, height, Add), then 14 door tags with the Tag doors tool (a real canvas click on each door's arc, the mark picked from the list, Tag). The "user's knowledge" is stated in the log: the marks and sizes are the std set's own `@SCHEDULE` values (model-derived, IFC OverallWidth/OverallHeight, §L2.6 C), and which door carries which mark is the std set's `@TAG` (the door whose box holds it). UI actions counted (selects, typed fields, Add / Tag clicks, canvas clicks, ticks).
- E7 VERDICT: blocked 28 before the Doors section → **qualifies, 0 blocking**, advisory counts by code == the marked std set's (E5).
- E7 SAVED: the saved copies' canonical markings (§L4.1, `@BY` stripped, TAG with position) == the marked std set's, except the per-wall `@WALLTOP` the UI never asks for (listed in the log by handle); every saved marking `@BY=user`.
- E7 CONVERT: a real Convert click → inserts / cuts / counts by storey and class == E5's conversion of the marked std set, and every pipeline element (class, storey, bbox 1 mm) equal.
- E7-FALSIFY (before Convert): the 0864 row's height typed 2132 instead of 2032 → exactly the doors tagged with that mark become blocking (one item each, measured in Node: 6 × `GAP:fill_unbound`, no library door of 864 × 2132 + head frame), nothing else blocks; typed back → qualifies.
- E7 PROPOSE: a witness copy of the stripped GF plan carrying, on a non-mark layer, a door schedule MTEXT ("MARK  SIZE …" rows from the std schedule) and one mark TEXT inside each GF door's opening box → the Doors section lists PR-SCHEDULE / PR-TAG suggestions; Save without ticking → no `@SCHEDULE`/`@TAG` in any file; one row ticked → exactly that marking.
- Regression: E0–E6, T1, X1, `witness_dxf_convert.js`, `witness_dxf_import_node.js` (old + std), W-IFC-SPATIAL, W-IFC-EXPORT-SEED, W-BONSAI-IFC. Screenshots `~/Videos/dxf2bim_work/l4/l4_doors_schedule.png` (Doors section: schedule + door list mid-tagging) and `l4_raw_qualifies.png` (the raw set filled, chip Qualifies), read by eye.

**Not claimed (L4.3).** Window schedules / window tags in the Doors section (the Tags section's canned vocabulary stays); schedule tables drawn as separate TEXT cells in a grid (only header + row lines); converting schedule sizes between units.


**L4.3 results (2026-10-17).** Inputs regenerated in a BIMCompiler master worktree (`0c0abb7b2`: std2d `--door-ops` → `mark_dx_set.js std` → `DXSET=std rosetta_dx_shell.js` 38 PASS / 0 FAIL, run_id `0c538552…`, 158 elements; old set `mark_dx_set.js` → `rosetta_dx_shell.js`, the known 4 FAIL of §L2.8). Copies unchanged (E0: no drift). No reader grammar change, no BIMCompiler PR. Log `modeller/tests/logs/witness_dxf_meta_editor.log`: SUMMARY fail=0 gap=0.
- E7 RAW: the 8 stripped sheets are byte-equal to the std2d output they were marked from.
- E7 FILL, verdict path: opened raw blocked 31 (roles / units) → sheets + units 72 (`no_elevation_height` 58 + `no_host_cut` 14) → wall-top convention ticked on both plans 28 (`no_elevation_height` 14 + `no_host_cut` 14 = the film's 28, all A-DOOR) → 4 schedule rows + 14 door tags → **qualifies, 0 blocking**, advisory 75 by code == the marked std set (`type_unbound` 36, `wall_base_from_plan_level` 39). **282 UI actions** (53 selects, 142 typed fields, 71 Add / Tag / tool clicks, 14 canvas clicks on doors, 2 ticks; each door picked on its first canvas click).
- Per-wall `@WALLTOP` (GF A1, FF 9B / 9D) not asked by the UI: those walls have a height from the drawings, so no gap lists them; the result is identical without them.
- E7 SAVED: 8 copies, every marking `@BY=user`, canonical markings == the marked std set's except those 3 per-wall tops; the 14 tags sit at the model's tag points (the opening-box centre, within 0.01 mm).
- E7 CONVERT (real click): 135 inserts + 36 cuts = 171 ops, counts by storey/class and all 158 pipeline elements (class, storey, bbox 1 mm) == E5's conversion of the marked std set.
- E7-FALSIFY: 0864 height 2032 → 2132 → exactly 6 blocking `GAP:fill_unbound` on the 6 FF doors tagged 0864 (158, 15A, 15C, 15E, 160, 162); typed back → qualifies.
- E7 PROPOSE: 3 PR-SCHEDULE suggested from the plan's schedule text, 0 markings until ticked, none in files saved unticked; after ticking D1, its 2 tag texts are suggested as PR-TAG (doors 114, 116); saved = exactly `@SCHEDULE=D1,door,762,2032 @BY=user` + one `@TAG=door,D1 @BY=user`.
- Found while witnessing: the op-log autosaves per origin, so pages in one browser share it; E5's converted model was restored into the E7 page without its per-session `rg:` meshes (`GEOM_CUT parent … not found`). Test isolation: E5 clears the op-log after its reference conversion (stated in the log). `§DXF-CONVERT commit nextId=… oplog=…` is now logged before every commit.
- Regression: E0–E6, T1, X1 PASS; `witness_dxf_import_node.js` old + std fail=0; `witness_dxf_convert.js` 15/15; W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS. Screenshots `l4_doors_schedule.png` (schedule with 4 rows, door list mid-tagging, untagged doors blocking) and `l4_raw_qualifies.png` (chip Qualifies, 0 / 75, Convert enabled) read.

### L4.4 Tags from the elevations: stacked windows, `@TAG=<class>,z=<m>,<value>` (lead decision 2026-10-17, written before the code)
Why: BIMCompiler #195 (§14 LF-4) moved the std set's twelve 819 x 759 window products from a labels sidecar into the marked plan as `@TAG=window,z=<mid z>,<family> @BY=model`. They sit in 4 plan positions x 3 heights (FF plan: FRONT/REAR/LEFT/RIGHT, z 3.5795 / 4.405 / 5.2305), so a tag binds only with z (`Dxf2Types.applyTags` → `hits()` tests the op's z interval). The §L4.1 Tag tool wrote `@TAG=<class>,<value>` at a plan entity's centre, with no z: the raw set stayed blocked by 12 `GAP:fill_unbound` (E7 measured after the rebase on #2070).
- **Elevation pick (the drafting way).** With the Tag tool on, a click on an ELEVATION sheet's opening line (glazing → window, elevdoor → door, the set's elevation map, §L4.2 `@LAYER` rules included) resolves through the READER's own functions, `Dxf2BimImport.elevPick(sheets, set, elevName, handle)` (pure):
  - the elevation is aligned to the lowest plan by `Dxf2Marks.align` (as the pipeline and the canvas), its openings read by `Dxf2Elev.elevClusters` (the clusters `applyElevations` uses); the picked handle's cluster gives the plan interval [p0, p1] along the face and [z0, z1]; z = (z0 + z1) / 2, rounded to 0.1 mm. The user never types z for a picked element.
  - the plan: the PLAN sheet with the highest `@LEVEL` ≤ z.
  - the position: that plan's reader openings (`Dxf2Bim.run`, the class's DXF_OPENING ops), those whose plan footprint overlaps [p0, p1] along the face axis; of these the one whose footprint is nearest the elevation's face side (`@FACE`: minY / maxY / minX / maxX of the plan's wall envelope, `Dxf2Shell.envelope`). Its footprint centre (window: `bbox` or centre/width/depth, as `Dxf2Types` footprint; door: the opening box, else the swing box) is written, in the plan's drawing units.
  - none, or two at the same distance → no tag, the reason shown (never a guess).
  - writes `@TAG=<class>,z=<z>,<value> @BY=user` on that plan; the card shows the plan, the elevation handle and z before the user picks the value.
- **Manual z.** The tag card has an optional z field (metres). On a plan pick it is empty: empty → `@TAG=<class>,<value>` as before; a number → `@TAG=<class>,z=<z>,<value>`. On an elevation pick it shows the derived z (editable).
- **Witness E7 (amended).** After the doors, the 12 stacked windows are tagged by real canvas clicks on their glazing lines in the 4 elevations (camera facing each face), the value chosen from the vocabulary (library family ids). Then E7 VERDICT / FALSIFY / SAVED / CONVERT as §L4.3. E7 SAVED compares window tags from an elevation pick with a stated tolerance, because the editor writes the READER's plan opening centre and the drawn opening's mid height, while `mark_dx_set.js` writes the MODEL's window bbox centre and mid z: position and z tolerance = the measured maximum difference (logged per tag), stated in the results; every other marking compares as before (0.01 drawing units). New checks: E7 WINDOW-PICKS (each click resolves to the plan + opening + z that binds the model's window: the 12 picks give 12 distinct (position, z), each within the stated tolerance of a marked-set tag with the same value) and E7-ELEV-FALSIFY (a click on an elevation wall line, not an opening → no tag, reason shown). The E7 action count is reported.

**L4.4 results (2026-10-17).** Rebased on main `605b3b20` (#2070); copies re-synced by `sync.sh` from BIMCompiler master `bf9401061` (#195; modules unchanged, SOURCE.md only); sw.js v87, `dxf_import_ui.js?v=5`. Logs `modeller/tests/logs/witness_dxf_meta_editor.log` etc.
- Node check of `elevPick` on the marked std set: every FF glazing cluster in the 4 elevations resolves to the marked set's window tag: 12/12, |Δx|,|Δy| ≤ 0.001 drawing units (mm; the marked tags carry the model centre to 0.001 mm, the pick the reader's opening centre), Δz = 0. Stated tolerance therefore = the existing 0.01 drawing units of E7 SAVED (unchanged), z compared exactly.
- `witness_dxf_meta_editor.js` 33/33 (fail=0): E7 BLOCKED-BY-DOORS+WINDOWS (40 = 28 door items + 12 window `fill_unbound`); E7 WINDOW-PICKS 12/12 by real clicks in FRONT/REAR/LEFT/RIGHT (distinct 12, max Δ 0.001 mm, Δz 0); E7-ELEV-FALSIFY (a wall-line click: no tag, "No tag: … not on an opening layer"); E7 VERDICT 40 → 0 blocking, advisory 75 = the marked set's; E7-FALSIFY / RESTORE; E7 SAVED (only the 3 per-wall tops the UI never asks for); E7 CONVERT == E5 (135 inserts, 36 cuts). **E7 UI actions = 319** (65 selects, 142 typed, 84 clicks, 26 canvas clicks, 2 ticks).
- Regression: `witness_dxf_convert.js` local 17/17 and `DXF_LIB=oci` 17/17 (C1 FILLS 36/36; load average 23, no crash this run); `witness_dxf_import_node.js` old + std fail=0; `witness_dxf_lib_oci_node.js` O1-O4; W-IFC-SPATIAL 4/4, W-IFC-EXPORT-SEED 7/7, W-BONSAI-IFC PASS.

## L5. BIM → 2D export inside the Modeller (2026-10-17, spec before code)
User flow (user, 2026-10-17): open the user's BIM in the Modeller so the user and the code can check all is proper and markings auto-derive; then Export → choose DXF.

### L5.1 Steps
- (a) Open IFC: exists (`bonsai_ifc.js`). Output of the open step is the Node-schema model DB (`scripts/extractIFC2DB.js` schema, one schema only, per lane 1).
- (b) "Drawable?" report, computed from that DB, each line with a count and a source table: storeys (model elevations), wall hosts resolved (`rel_fills_host`/void) vs openings without host, walls/hosts with empty geometry, door handing present (`door_operation`), columns gridded. Unresolvable items are listed as `§GAP:<code>`, never filled.
- (c) Markings derived from the model, `@BY=model`, same rules as `mark_dx_set.js std` (generalised to N storeys + Node schema, see below). Shown in the existing metadata editor (`dxf_meta_editor.js`) so the user can override (`@BY=user`).
- (d) Export → "2D drawings (DXF)": writes the std set (plans per storey, 4 elevations, roof, section) with the markings embedded in the DXF (`DXF2BIM-MARK`, no sidecar).

### L5.2 Decision: port std2d.py to JS (not Pyodide)
Measured on `bim-compiler/2D_Layout/python`: std2d.py 1195 lines + section_cut.py 686 + model_db.py 63. Third-party use: ezdxf (DXF write), numpy (array ops: array/abs/round/unique/frombuffer, trivial in typed arrays), shapely (only `unary_union` x2, `intersection` x2, `make_valid` x3, `Polygon`/`LineString`/`box`).
- JS port: shapely use is small; polygon boolean ops need one vetted library (polygon-clipping, pinned version) with `make_valid` replaced by a stated ring-cleaning step. DXF writing is plain text; the reader modules (`dxf2*.js`) already define the entity set to emit.
- Pyodide: ships numpy/shapely wheels but adds a tens-of-MB runtime to a zero-install, offline-capable page, a second language to keep deterministic, and ezdxf via micropip at run time (network). Rejected.
- Port is gated by parity, not by trust: same Duplex Node DB through std2d.py and the JS port must give the same per-layer entity counts, grid labels, dimension values, and plan polygon areas within the 7–24 mm² engine tolerance already recorded for #196. The Python writer stays as the oracle until parity holds, then is frozen as the test reference.

### L5.3 Preconditions (from the RESUME block, unsolved today)
Lanes 1–2 must reach their pass condition first, otherwise (b) would honestly report most SampleCastle openings as GAP: openings without a host (357 of 455), hosts with empty web-ifc geometry (65), HHS curtain walls without geometry. Also generalise `mark_dx_set.js` and `rosetta_dx_shell.js` (Duplex sheet list, `@SET=DX`, old-schema SQL, 1-char grid labels) to N storeys and the Node schema.

### L5.4 Witnesses (each names the issue it proves)
- W-L5-ROUNDTRIP: Duplex IFC → Modeller export → re-import → verdict Qualifies, 0 blocking. Proves export markings are complete.
- W-L5-PARITY: JS vs std2d.py on the Duplex Node DB, counts/areas as above. Proves the port, not just that it runs.
- W-L5-GAP-HONEST: SampleCastle export reports the §L1.6 gaps in (b) and does not invent hosts. Proves non-invent.
- W-L5-NO-SIDECAR: exported set has exactly the DXF files, no `.json`/`.db` next to them.

### L5.5 UI
Export entry in the existing Modeller menu, Lucide icon from `icons.js`; drawable report in the `#ins-panel` pattern used by L4. No new pill types.

### L5.6 Port slices (2026-10-17, before code)
Source of record is BIMCompiler `deploy/dev/std2d*.js` (UMD, no DOM, no DB: takes plain model arrays, returns DXF text + log lines), copied into `modeller/dxf2bim/` by `sync.sh` like the reader modules. Slices, each ending in a parity witness against `std2d.py` as oracle on the Duplex Node DB (`Duplex_ARC`):
- **S1 plan geometry** (`std2d_geom.js`, BIMCompiler `deploy/dev/`): port of `section_cut.py` `slice_mesh` / `chain_segments` / contour classification, the exact call `write_plan` makes for its plan polygons. No polygon library is needed here (the plan polygons are the section contours); the union (shapely `unary_union`/`make_valid`, used only for hole detection in `_slice_poly`) moves to S2 with a vendored, pinned `polygon-clipping`. Witness **W-S1** (issue: the port draws a different wall plan than the oracle): for every cut element on every plan cut z, JS contours equal the Python contours (same count, same winding, every vertex within 1e-9 m); control: the first cut wall's mesh shifted 5 mm must FAIL. Oracle numbers come from `std2d_s1_oracle.py` run in the witness, not typed in.
- S2 grid + hosts + openings (R4-R6, O1-O3); S3 DXF writer (entities, layers, DIMENSION as defpoints + `BIMGUID` xdata as the reader needs; no ezdxf-rendered dimension blocks unless the reader requires them: checked in S3 spec) with the per-layer entity-count witness; S4 elevations/roof/section; S5 Modeller wiring (L5.1 b-d). Each slice gets its own spec paragraph before its code.

### L5.7 Results (2026-10-17; BIMCompiler PRs #200 + #201, bim-ootb this PR)
All slices built to the L5.6 order and each ended in its parity witness (BIMCompiler `tests/dxf2bim/`, `modeller/tests/`):
- **S1 plan contours** (`std2d_geom.js`) W-S1: contours equal `section_cut.py` vertex for vertex (maxDev 0) on Duplex, Duplex federated, SampleCastle (840 elements), HHS architect (241), HHS structure (313); control (first cut wall shifted 5 mm) fails on all.
- **S2-S4 set** (`std2d.js` + `std2d_dxf.js`, vendored `polygon-clipping` 0.15.7 MIT sha256 `de2bdc06...`) W-LOG + W-ENT: the log equals the Python log per § family (SampleCastle 3060 lines; oracle = #200 for §L1.7) and entity counts per layer + DIMENSION points per file equal (ezdxf reads both) on all five models; JS writes the Duplex set in ~80 ms. Numeric ties: CPython 3.12 `sum()` is Neumaier-compensated, reproduced in the grid means (`pySum`).
- **Reader verdict**: the JS-written Duplex set and the Python-written one give the same qualify verdict through `mark_dx_set.js std` + `rosetta_dx_shell` (both: blocked, 5 blocking, 75 advisory, same codes).
- **Extractor in the browser**: the extractor body moved verbatim into `scripts/ifc_extract_core.js` (CLI thin). W-EXTRACT-MOVE: every table row-for-row identical to the pre-move script on 4 IFCs; W-EXTRACT-BROWSER: the browser path (Uint8Array shim + sql.js) writes the same DB as the Node path (Duplex 1624 rows, SampleHouse 433). One additive table, `element_type` (IfcRelDefinesByType type Name, else the occurrence ObjectType) for the door schedule/tags.
- **S5a markings** (`std2d_marks.js`) W-MARKS: equal to `mark_dx_set.js std` on all 8 Duplex sheets (excluded and stated: @SET/@NAME naming, window @TAG which needs a product-family map the model does not name, per-handle @WALLTOP exceptions where web-ifc splits one Duplex wall differently from IfcOpenShell: INFO line).
- **S5b Modeller** (`dxf_export_ui.js`, Export > "2D drawings (DXF)", lazy scripts, sw.js v89): W-E2E-DXF-EXPORT 6/6 in headless Chrome: real #b-export click, drawable report shown before any download, the .zip passes Info-ZIP `unzip -t`, holds only the 8 .dxf sheets, and every sheet equals the Node pipeline's text byte for byte.
- **Round trip** W-L5-ROUNDTRIP (`modeller/tests/witness_dxf_export_roundtrip.js`): the exported Duplex set is accepted by the Modeller's own importer: all 8 sheets get a role from their markings, set STD detected from evidence, **0 marking-class (QF:*) blocking**; the verdict is still `blocked` for reasons that are not the export: 35 `lod400_library_unreachable` (no OCI library in Node) and 5 `GAP:*` pipeline gaps at Level 2 caused by web-ifc tessellating one door's host wall as slivers (0.6 mm trapezoid where the IfcOpenShell DB has a 1 mm rectangle). Control: removing a plan @LEVEL is noticed.
- **Not solved, stated:** (1) a Duplex opened through web-ifc does not reach 0 blocking (above); I tried dropping engine slivers and duplicate contours and reverted it: it only traded `wall_footprint_not_rect` for `no_host_cut`, and breaks parity with the oracle. A wall-contour regularisation rule (snap to the host bbox for orthogonal walls) is the next candidate, decided with the Python oracle, not in the port alone. (2) Single-storey models (SampleHouse) give a grid of < 2 lines: the report says "not drawable" and no markings are written. (3) Window products stay untagged (no family map in the model); doors are tagged. (4) SampleCastle/HHS: the §L1.6 gaps are reported by the drawable report, not drawn.

### L1.8 Sliver contours of orthogonal walls (2026-10-17, decided with the Python oracle)
Finding: the Duplex Level 2 door host wall has a genuine 0.62 mm remnant in the IFC (the old IfcOpenShell DB has it too, as a clean rectangle); web-ifc meshes that thin end as a wedge (5 points, top edge 73 mm diagonal), so the reader reported `wall_footprint_not_rect` (or `no_host_cut` when the sliver was simply dropped). Six web-ifc settings (fast bools off, four tolerances) change nothing.
- **S1 rule (Python `write_plan` and JS `writePlan`, same commit):** for an IfcWall judged orthogonal (R3), a plan contour whose mean width (area / longest bbox side) is below the plan merge tolerance (1 mm) and that is not already an axis-aligned rectangle is replaced by its bounding rectangle; logged `§SLIVER_RECT`. A rectilinear wall's remnant is rectilinear by R3; nothing else is changed.
- **Result:** Duplex via web-ifc: the 5 `GAP:*` at Level 2 are gone (W-L5-ROUNDTRIP R4b: 0 pipeline gaps; the only blocking left in Node is the 36 `lod400_library_unreachable`, i.e. the OCI library is not loaded there). W-LOG/W-ENT parity holds on all 5 models (rule fires once, Duplex only).

### L1.9 / L1.10 / L2.9 HHS with its structure file (2026-10-17, decided; spec before code)
Input: the architect model plus the structural model of the same federated set (same storeys, same frame). **L5.8:** the structure IFC contributes ONLY its IfcColumn (`mergeElements`, `extractIFC2DB.js --also`): the column axes are the building-grid evidence the architect model does not state (every HHS wall states LoadBearing FALSE). Result: 257/257 columns gridded, grid 12 x 13, parity Python == JS (log 1080 lines, 9 sheets).
- **L1.9 Roof plan without roof walls.** HHS "Roof Level" holds no wall, so F4 found no roof storey. Rule: when no unplanned storey above the grid storey has walls, the highest unplanned storey above it takes the roof plan if the model states a roof element (R11: IfcRoof, else the highest IfcSlab); the outline is that element's envelope (log `§ROOF_OUTLINE ... roof element(s), §L1.9`). Python and JS.
- **L1.10 Grid bubbles that cannot overlap.** The importer reads a bubble's label from the TEXT inside its circle; two grid lines 0.2 m apart (HHS column rows) put one bubble's text inside the other's circle, so a line "has bubbles K / L" (`QF:grid_label_conflict`) and the label order breaks. Rule (drafting practice: stagger): on each side, lines whose spacing is below 1.05 x the bubble diameter (840 mm model) are assigned tiers greedily (lowest tier with no neighbour of that tier within 840 mm); tier t extends the line AND its bubble outward by t x 900 mm (bubble centre stays on its own line axis, still at the end of the line). Plans, roof plan, elevations, section; Python and JS.
- **L2.9 Columns are grid evidence in the importer.** `QF:grid_off_axis` tested a grid line only against wall axes/faces, so a line through column centres (the structural convention, R4 LB4/C2) was "off axis". Rule (reader, `dxf2qualify.js`): the centre (bbox centre of the closed polyline, in metres) of every entity on the column layers (`S-COLS`, `A-COLS`) of any plan counts as an axis position for both directions, same tolerance as walls. No change when a set has no column layer.
- **Witnesses:** W-LOG/W-ENT parity (HHS merged, Duplex, SampleCastle, HHS, HHS structure); W-L5-ROUNDTRIP on HHS + structure: R4 (no QF blocking) must PASS; the remaining pipeline gaps are listed, not hidden.

**L1.9/L1.10/L2.9/L5.8 results (2026-10-17).** BIMCompiler `feat/export-structure-columns` (stacked on #202), bim-ootb `feat/dxf2bim-sliver-rect`. Parity Python == JS (log + entity counts + DIMENSION points + A-GRID line/bubble coordinates) on HHS merged (1080 log lines, 9 sheets), Duplex x2, SampleCastle, HHS, HHS structure; the 19 BIMCompiler reader suites fail=0 (+2 tests for L2.9). HHS architect + structure through the Modeller importer: 9 of 9 sheets get a role, STD set detected, marking-class blocking 0; QF blocking 73 -> 1 (`grid_label_conflict` 6, `grid_label_order` 3, `grid_off_axis` 63 gone). **Open on HHS, stated:** `QF:set_storey_unstated` (the LEFT elevation shows a level band at z = 3.2278 m: a wall whose edge is not a storey, no plan states it) and 527 `GAP:*` (435 `opening_unclassified`: curtain-wall doors/glazing; 47 `no_elevation_height`; 30 `no_host_cut`; roof/section/slab gaps): the pipeline cannot yet read curtain-wall openings or web-ifc door hinges at this scale, so HHS stays `blocked` and is reported as such, not trimmed.

## L6. Scoped sets: a large building drawn as a series, one scope per sheet (2026-10-17, spec before code)
Why (user, 2026-10-17): a Hospital cannot honestly be one sheet per storey; a drafting office breaks it down by wing/zone with a match line and a key plan, and the sheets stay one set because they share ONE grid and ONE set of levels. The export does the same; the conversion integrity comes from the shared grid/levels and from every element being drawn exactly once, not from the sheet boundaries.
### L6.1 Scope
- A scope = a storey (or all) x a rectangle in **building-grid terms** (grid labels, e.g. X 3-9 x Y C-H) -> model mm from the one grid. Named by its labels (`GF_A-F_1-6`). The grid is the same object as in L1.1 R4-R6/L1.10: nothing new is invented, a scope cannot start between grid lines.
- **User chooses** (Export panel "Split"): none (default, today's behaviour) | by storey (one sheet per storey is already the default) | by wing: pick a scope rectangle per wing by grid range, any number, may be left to the rest; or **Suggest**: when a storey's drawn contours exceed the budget (default 1500, a stated constant) the writer proposes the smallest split by recursive bisection along the grid line nearest the median of element centres, alternating X/Y; the user edits or accepts. The suggestion is deterministic and logged (`§SCOPE_SUGGEST`).
### L6.2 Ownership (no loss, no double drawing)
- Every element drawn on a plan belongs to exactly ONE scope of its storey: the scope containing the centre of its plan bbox (ties on a scope edge: the lower-left scope). It is drawn WHOLE in the owner sheet (never clipped), so a wall crossing a match line is complete in its owner and absent in the neighbour: the importer sees each wall once.
- The neighbour's side of a match line carries only the match-line symbol (layer `A-ANNO-MATCH`, dashed line + text `MATCH LINE - SEE <scope>`), no geometry.
- Dimensions: T1/T2/T3 run over the scope's own envelope; T2 uses the grid lines inside the scope plus the bounding ones.
### L6.3 What is shared by every sheet
`@SET`, `@UNITS`, `@LEVEL` of its storey, the FULL grid labels and positions of the lines inside the scope + one bay beyond on each side (`@GRIDX/@GRIDY` as today), the storey level texts. New marking **`@SCOPE=<name>,<x0>,<y0>,<x1>,<y1>`** (mm, the rectangle) on every scoped sheet; a sheet without it is the whole storey (today). Elevations, roof plan and section stay whole-building by default (light); an elevation scope is a later item.
### L6.4 Importer
- Sheets with the same `@LEVEL` and different `@SCOPE` are ONE storey: their wall/opening ops are concatenated before the pipeline (heights, hosts, convert unchanged).
- New checks (blocking `QF:`): `scope_overlap` (two scope rectangles of one storey overlap by more than the grid merge tolerance), `scope_grid_disagree` (a grid label has two positions across sheets), `scope_level_conflict` (same scope name, two levels). Advisory: `scope_gap` (the union of a storey's scopes leaves part of the envelope undrawn), `scope_duplicate_piece` (the same wall rectangle in two sheets).
### L6.5 Witnesses (each names its issue)
- W-L6-PARTITION: for Duplex split into two wings and SampleCastle split by the suggestion, the sets of drawn GUIDs per storey are disjoint across scopes and their union equals the unscoped drawn set (issue: an element lost or drawn twice at a match line); control: one element moved to the wrong scope must FAIL.
- W-L6-MERGE: Convert of the scoped set equals Convert of the unscoped set: same elements by class/storey/bbox (1 mm) (issue: the split changed the model); control: one sheet's @LEVEL changed must FAIL.
- W-L6-GRID: the same label has the same position on every sheet (issue: a sheet carries its own grid).
- W-L6-SCALE (Hospital ARC + STR, Node-schema extraction): writes in seconds; every sheet under the entity budget; the drawable report names scopes, counts and gaps; reports, does not trim.
- Python == JS parity (W-LOG/W-ENT extended with the scope arguments) because the oracle remains the Python writer.
### L6.6 Not in this slice
Elevation/section scopes, scope-aware door-hinge fallbacks, per-discipline sets (MEP is a different lane: ARC + STR only here).

### L1.11 A readable grid: primary lines when the derived grid is too dense (2026-10-17, spec before code; Python oracle first)
Finding (Hospital ARC + STR, 15,306 + 255 elements; no IFC of the five tested states an IfcGrid, so the grid is always derived): R4-R6/LB1-LB4/C2 give 128 x 128 lines, unreadable at 1:100 and useless as the shared grid of a scoped set (L6). Duplex (3x4), HHS (12x13), SampleCastle (28x31) are readable and must not change.
- **Rule.** Per axis, when the clustered lines exceed GRID_READABLE_MAX (= 40, the number of bubbles a 1:100 side holds at the stagger of L1.10 without the tiers exceeding three), a line is kept when it is supported by at least k distinct elements (walls and columns whose axis falls in its cluster, over all plan storeys) OR a wall on it is exterior (R4(b)); k starts at 3 and rises by 1 until the axis has at most GRID_READABLE_MAX lines or k exceeds the largest support (then only exterior lines remain, even if above the cap: stated, not hidden). Labels are assigned after the filter. Columns/walls of a dropped line are no longer `gridded`.
- Log `§GRID_PRIMARY axis=x lines=128 -> 36 support>=3 dropped=92` (or `§GRID_PRIMARY axis=x within cap 12`); Python `derive_grid` and JS `deriveGrid` in the same commit.
- Witness W-GRID-PRIMARY: (a) Duplex, HHS merged, SampleCastle outputs unchanged (parity + their pre-rule logs: no `dropped`); (b) Hospital: both axes <= 40 or only-exterior with a stated reason, Python == JS; control: a doctored threshold changes the line count.
### L5.9 A model .db as input (large models)
Extraction of the Hospital takes 9 min 24 s and 1.8 GB in Node (web-ifc wasm), too much for the browser. Export > 2D drawings accepts a Node-schema `.db` made by `scripts/extractIFC2DB.js` (and `--also` for the structure file) and skips extraction; a `.db` without `element_world_bbox` is refused with the command to run, never read as another schema.

### L1.12 Door swing from the IFC convention when the mesh has no leaf offset (2026-10-17; Python oracle first, JS same commit)
Finding: R9 reads the swing side from an asymmetric leaf in the door mesh; HHS's glass door elements (and some SampleCastle ones) have a symmetric leaf, so 69 of HHS's 99 single-swing doors (345 of the Hospital's 440 doors) got `GAP:door_swing` although the IFC states `SINGLE_SWING_LEFT/RIGHT`, the placement axes and OverallWidth.
- **Rule.** Only when R9 finds nothing: if the door has a single-swing operation type, a vertical placement z, X and Y axes aligned to the world axes (1e-6) and an OverallWidth, the door swings toward +Y of its placement (IFC convention for swinging doors); hinge = the LEFT (-X) or RIGHT (+X) jamb = bbox centre along X -/+ OverallWidth/2, at the bbox centre along Y; radius = OverallWidth. Otherwise the gap stays (`GAP:door_swing` with the reason). Where R9 does speak it is unchanged and still checks the IFC (H5).
- Logged: `§DOOR guid= swing=ifc_convention ...` and `§DOOR_ARC ... basis=ifc_convention`. Provenance is visible; the arc is not claimed to be mesh-measured.
- Result: HHS 99 of 99 single-swing doors drawn (69 by the convention), 0 `GAP:door_swing`; Duplex unchanged; SampleCastle +8 arcs; parity Python == JS on all three. Reader (HHS): `opening_unclassified` 435 -> 374 (the rest are curtain-wall and no-host openings), `door_no_strip` 20 and `no_host_cut` 51 now visible as doors the reader sees but cannot host.

**L1.11/L5.9/L1.12 results (2026-10-17).** Hospital (architect + structure columns; Node extraction 9 min 24 s, 1.8 GB): derived grid 128 x 128 -> 38 x 39 (primary lines), writer ~1.0 s for 13 sheets, Python == JS exactly (4716 log lines, 13 sheets, A-GRID coordinates included) after fixing one JS precision difference (world coordinates float32 -> float64: at 170 m site elevations a degenerate contour flipped). Duplex 3x4, HHS 12x13, SampleCastle 28x31 unchanged by L1.11. Export accepts a model .db (W-E2E-DXF-EXPORT D6/D6b in the browser, 8/8). Still open: curtain walls (178 IfcCurtainWall have no web-ifc geometry: the symbol must come from the IFC placement/profile), the HHS `QF:set_storey_unstated` level band, scoped sets (L6, spec only).

### L1.13 Roof plan when the model has no roof storey (2026-10-17; Python oracle first, JS same commit)
Hospital: all 8 storeys carry floor plans; the roof is an element above the top storey and no storey is left for F4/L1.9, so no roof plan and the importer (which needs one) could not qualify it. Rule: when F4 and L1.9 find no storey but the model states a roof element (R11: IfcRoof, else the highest IfcSlab) that lies above the grid storey, the roof plan takes a stated pseudo-storey `ROOF` whose level is the lowest z of the roof element(s) (their bbox minZ); outline = envelope of the roof element(s), `@ROOF` = T/ROOF as before. Logged `§LEVEL_ROOF_ELEMENT`. Nothing else changes (Duplex, HHS, SampleCastle already have a roof storey).

### L6.7 Results, slice 1 (2026-10-17)
Built as specified in L6.1-L6.5, with one design simplification worth stating: a scoped set is **one whole-storey document serialised several ways** (same entity handles). KEY sheet = the untagged annotation (grid, dimensions, level/title texts) + every marking; wing sheet = the elements it owns (+ its own grid range, title, match lines). So assembling back is a union by handle and the Python writer stays the oracle for the whole plan (scoping is a pure post-process, not a second writer). `std2d_scopes.js` (suggest, ownership, split), `@SCOPE` marking (`dxf2marks.js`), `mergeScopes` + checks in `modeller/dxf2bim_import.js`, panel in `dxf_export_ui.js` (max elements per sheet, Suggest, split at a grid line, merge two wings sharing an edge: always a partition).
- **W-L6-PARTITION/ASSEMBLE** (`tests/dxf2bim/witness_scopes.js`): every storey of Duplex (budget 25), SampleCastle, HHS merged (80), Hospital (default 250): each element drawn in exactly one wing sheet (dup 0, lost 0), annotation only on KEY, union of sheets == the whole plan by handle, whole-plan text unchanged; controls (doubled / lost entity) fail as required.
- **W-L6-MERGE + CHECKS** (`modeller/tests/witness_dxf_scopes_merge.js`): Duplex via the Modeller's own importer: scoped set (8 -> 14 sheets) assembles to the same sheets, roles and gate; `convert` ops equal the unscoped set's (136 ops, 2 storeys; `run_id`/derived hashes normalised: they hash the sheet bytes), verdict identical; doctored sets flagged: `scope_level_conflict`, `scope_overlap`, `scope_no_key`, `scope_duplicate_piece`. SampleCastle and Hospital: scoped == unscoped behaviour (both stop at the same refusal where the unscoped set already does).
- **W-E2E-DXF-EXPORT D7a-e** (real browser, 13/13): Suggest -> merge -> split through the panel; the downloaded zip (13 files: 2 KEY + 5 wings + 6 whole-building sheets) passes `unzip -t`, only .dxf; imported back = the same model as the unscoped set.
- **Hospital (architect + structure .db)**: report 0.85 s, Suggest 0.66 s through the panel; 4 wings (178 / 155 / 161 / 175 elements on Level 1), 14 sheets with the L1.13 roof sheet; Python == JS (4872 log lines, 14 sheets). Importing the whole Hospital to 3D is refused identically scoped or not: Level 2's @LEVEL is not a drawn elevation boundary (the façade, mostly curtain wall with no web-ifc geometry, shows no wall band there).
- **Not in this slice (stated):** elevation/section scopes (whole-building by default), per-discipline sets, the Hospital convert (curtain-wall symbol L1.x next), a scope editor by dragging rectangles on a key plan.

### L1.14 Curtain walls in plan, host and elevation (2026-10-17; spec before code; Python oracle first, JS same commit)
Finding (HHS architect; Hospital the same): an IfcCurtainWall has no representation (web-ifc and IfcOpenShell: nothing), but it aggregates (IfcRelAggregates) its panels (IfcPlate), mullions (IfcMember) and sometimes doors; all 629 plates and 1450 members of HHS belong to one of its 33 curtain walls, and carry the geometry (storey "Unknown"). Prototype on HHS: cut at each storey's plan plane the parts' sections form a straight axis-aligned band 0.1-0.2 m thick and 3-54 m long (62 of 62 non-empty cuts; elongation 40-290).
- **Extractor (additive):** table `element_parts(parent_guid, child_guid, parent_class, child_class)`: every IfcRelAggregates whose RelatingObject is an IfcCurtainWall (log `§ELEMENT_PARTS rows=`). Witnesses: W-EXTRACT-MOVE with `ALLOW_NEW=element_parts`.
- **Model:** a curtain wall is loaded with a synthetic bbox = the union of its parts' bboxes (class IfcCurtainWall, no mesh); its parts (plates/members) are loaded with their meshes; its door parts become the doors' host (`host_source=ifc_part`).
- **Plan (C1):** per plan storey, the parts crossed by the cut plane are sectioned (the same slice as walls); a curtain wall is drawn when the union of those sections is a band: thin side <= CURTAIN_MAX_THICK (0.6 m, stated) and length >= 2 x thin side; then ONE closed rectangle (the band's bounding rectangle) on layer `A-WALL-CURT` tagged with the curtain wall's GUID, no hatch (glazing). Any other shape: `GAP:curtainwall_not_a_run` with the numbers, nothing drawn. Log `§CURTAIN guid= storey= rect= parts= cut=`.
- **Doors (C2):** a door that is a part of a curtain wall cuts its gap in that wall's rectangle exactly as a wall door does (O2): along = the door's bbox extent along the run, across = the rectangle; hosts logged `host_source=ifc_part`.
- **Envelope (C3):** the plan envelope E (dimension strings, grid ends) is the envelope of the cut walls AND the drawn curtain rectangles (a curtain-wall facade IS the building edge).
- **Elevation (C4):** a curtain wall is an elevation wall rectangle on `A-WALL` over its parts' z-range when its face is on the exterior face line (as walls): the importer sees a wall band at every storey the curtain wall spans (the Hospital refusal "@LEVEL is not a drawn elevation boundary").
- **Reader (C5):** `A-WALL-CURT` is a wall layer of the std plan map (type `wall`): it hosts doors, converts to a wall element (glazing material is a later item, stated). 
- **Witnesses:** Python == JS (W-LOG/W-ENT) on HHS merged + Hospital; HHS importer: `opening_unclassified`/`no_host_cut` fall; Hospital: the `@LEVEL ... not a drawn elevation boundary` refusal goes (or names its next cause); control: a curtain wall with its parts removed draws nothing and logs nothing invented.

### L1.15 Finding: the Hospital is not rectilinear (2026-10-17, measured; no code yet)
Hospital ARC + STR (15,306 + 255 elements; curtain-wall parts extracted): `GAP:wall_not_orthogonal` = **1440 of 1440 walls**, `GAP:opening_host_not_orthogonal` 505, `GAP:curtainwall_not_a_run` 156 of 178 curtain walls. Principal axis of each wall's plan section, modulo 90 deg: 85 (542 walls), 10 (203), 70 (147), 3 (128), 2 (102), 77 (62), 78 (57), 84 (30): several wings at several angles, not one rotated frame. So grid evidence, hosts, opening gaps and door symbols that rest on R3 (axis-aligned walls) and the reader's rectangle pieces (`rect` params, wall strips, `opening_box`) do not apply to most of the Hospital. What it DOES get today: every wall/column/door contour drawn as its true section polygon, the primary grid from columns (21 x 24 lines after the curtain-wall rules), scoped sheets that partition and reassemble (L6), the report that says all this.
- **Options (not decided):** (a) a per-wing frame: a scope (L6) carries a rotation `@SCOPE=<name>,<rect>,<angle>`; the writer rotates that wing's coordinates into its own axes so R3 holds inside the wing, the importer rotates back; fits a few distinct angles, not a curved plan. (b) oriented walls in the reader (wall piece = oriented rectangle): a reader rewrite, every strip/opening rule changes. (c) state the limit and film the Hospital as scale + series (L6) only.
- Recommendation: (a) for wings with a dominant angle (the 85 deg family is 38 % of walls), with the count of walls left unframed reported per wing; decide with the user before building.

### L1.16 Decision + spec: per-wing frame (2026-10-17, user chose option (a) of L1.15)
Decision (user): a scope carries a rotation, `@SCOPE=<name>,<rect>,<angle>`; angle in degrees, CCW, about the rect centre, 0 when absent (old sets read unchanged).
- **Writer:** for a scope with angle a, every element whose plan principal axis is within `frame_tol` (1 deg, stated) of a (mod 90) is rotated by -a about the rect centre BEFORE the R3/grid/host/opening rules, so those rules see an axis-aligned wing. Elements not within tol are NOT rotated and NOT framed: they are drawn as their true section polygon and counted in the report per wing (`§WING_UNFRAMED n/N`). Nothing is snapped.
- **Importer:** rotates the wing's converted geometry by +a about the same centre; `scope` checks (L6) run in the rotated frame; the angle is read only from the marking, never guessed.
- **Suggest:** the panel proposes one wing per dominant angle (histogram of principal axes mod 90, bin 1 deg, wings with >= 5 % of walls), user confirms.
- **Witnesses (each names its issue):** W-L116-ROT: Duplex rotated by 30 deg as a synthetic model must give the SAME entity counts, grid labels and dimension values as unrotated (proves the frame removes the rotation; control: angle 0 on the rotated model reproduces the L1.15 `wall_not_orthogonal` gaps). W-L116-BACK: export then import returns every element within 1e-6 m of the source (proves the rotate-back). W-L116-HOSP: Hospital reports per wing framed/unframed counts that sum to 1440, no wall silently dropped.
- Build order: Python oracle `std2d.py` -> JS port `std2d*.js` -> importer + panel; each slice ends in its witness.

#### L1.16 Results, slice 1 = writer (2026-10-17, BIMCompiler branch `feat/wing-frame`, stacked on #203)
JS only (`std2d.js`: `elementAngle`, `frameModel`, `rotateModel`, `writeWingSet`); the Python oracle is NOT changed: W-L116-ROT compares the rotated run with the unrotated Duplex run itself, which is the stronger oracle for a rotation.
- **W-L116-ROT** (`tests/dxf2bim/witness_wing_frame.js`): Duplex rotated in memory by 30, 7 and 85 deg; the wing frame finds the angle and gives the same per-layer entity counts (208 + 302 entities), the same texts (grid labels, dimension values) and the same grid lists as the unrotated Duplex: ALL PASS x3. Control (frame at 0 deg on the rotated model) frames 0 of 57 walls.
- **W-L116-HOSP** (counts, no wall dropped): walls 1440 = framed + unframed in every wing: 85 deg frames 594 (unframed 846), 10 deg 224, 70 deg 165. Inside a wing, walls with an off-axis face still report `GAP:wall_not_orthogonal` (113 / 58 / 42) and columns `column_not_symmetric`; nothing is snapped. Picture: `~/Videos/dxf2bim_work/acid/hospital_L1_wing85_straightened.png` vs `hospital_L1_whole_today.png`.
- **Not built yet:** W-L116-BACK (the importer rotates a wing back: `@SCOPE=<name>,<rect>,<angle>` in `std2d_marks.js`, `dxf2marks.js`, importer merge), the panel's per-angle suggest, a Hospital wing set through the Modeller. A wing has its OWN grid, so it is a separate set per angle, not a sheet of the L6 handle-union.

#### L1.16 Slice 2 finding: the rotate-back is a kernel question, not an importer one (2026-10-17, read from `modeller/bonsai_kernel_worker.js`, not yet run)
The importer turns a wall into a baked GEOM_INSERT mesh and cuts its openings as axis-aligned boxes promoted from the mesh's own AABB ("only axis-aligned boxes are promoted, rotated/non-box refused host-side", worker :347). A GEOM_ROTATE on an INSERT parent is a tolerant NO-OP in the worker (:672-676: the host folds insert yaw via `placement.rot`, about the insert's own centre). So the order "convert in the wing frame, cut, then rotate by +angle about the wing centre" has no supported path: rotating before the cut is refused, after the cut is a no-op.
- **Options:** (i) wing walls and openings are baked already rotated (the importer rotates the converted mesh AND the cut-void geometry by +angle: the cut is then a non-axis-aligned prism the worker does not promote today, so it needs a kernel extension: a void given as a rotated box = `void:{c1,c2,rot}` about the parent centre; (ii) the importer imports a wing in its own frame and marks the model with `frame:{angle,ox,oy}` (no rotate-back in the op-log; the 3D model is straight and the IFC carries a placement rotation on the storey/site); (iii) bake the openings into the mesh in the wing frame in the importer (no GEOM_CUT), then place with `placement.rot` and the rotated centre (kernel unchanged; loses the editable cut). **CHOSEN by the user (2026-10-17), built as slice 3.**
- **Recommendation:** (iii) first (smallest, witnessable in Node: W-L116-BACK = every baked body within 1e-6 m of the source), then (i) only if the editable cut matters on rotated wings. Needs the user's call because (iii) trades the editable cut for the rotated wing.
- **Not built:** `@FRAME` marking and its parser, rotate-back, panel suggest. Nothing in this slice changes behaviour; `writeWingSet` (slice 1) stands on its own.

#### L1.16 Slice 3 results: wing as a full set, `@FRAME`, importer turn-back (option (iii)), 2026-10-17
- **Writer:** `writeStdSet(q, prefix, {wing:{name,angle?,tol?}})` writes a wing as a FULL standard set in its own frame (plans, 4 elevations, roof, section); slabs/roofs/footings are framed by their own angle, an opening follows its host (or the kept element whose bbox holds its centre when the IFC host is not a model element, e.g. skylights). **W-L116-ROT** now compares ALL 8 sheets with the unrotated Duplex (entities per layer + texts): ALL PASS at 30, 7, 85, 45 deg (BIMCompiler `tests/dxf2bim/witness_wing_frame.js`).
- **Marking:** `@FRAME=<angle deg>,<x mm>,<y mm>` on every sheet of a wing set (`std2d_marks.js` writes, `dxf2marks.js` validates; mm sheets only).
- **Importer:** `frameOfSheets` reads it; `toOps(R,{frame})` rotates every body's world vertices by +angle about the centre and BAKES the openings of a framed wall (one prism per infill z-interval, no GEOM_CUT); a library fill gets the rotated centre and `placement.rot = angle`.
- **W-L116-BACK** (`modeller/tests/witness_dxf_wing_back.js`, B1 frame read, B2 bodies, B3 control): the Duplex rotated in memory by 30/7/85/45 deg, wing set -> importer with @FRAME == the straight set baked and rotated by +angle: 122 bodies, 0 unmatched, worst vertex deviation 1e-5 m. Control (frame ignored): 122 of 122 unmatched. Tolerance is 1e-4 m, NOT the 1e-6 m first written in this spec: the DXF carries mm to 3 decimals, 1e-5 m is what it can give.
- **Regression:** straight-path witnesses unchanged: `witness_std2d_set.js` W-LOG/W-ENT (py=318 lines = js), `witness_dxf_export_roundtrip.js` (QF blocking 0, 0 pipeline gaps), `witness_dxf_scopes_merge.js`.
- **Not witnessed:** library fills on a wing (no OCI library in Node: fills = 0 in B2); the in-browser path (panel button, Modeller fold of baked bodies); a Hospital wing through the importer (wing sets of real wings still carry `wall_not_orthogonal` inside the wing, so the importer's verdict for them is not claimed); the panel's per-angle suggest. sw.js v91.

#### L1.16 Slice 4 results: the browser run (2026-10-17)
Panel: a "WING (ROTATED FRAME)" section appears for a building whose walls are not on X/Y (one angle family other than 0, or several): a select "Draw the whole building | wing at <deg> (<n> walls)"; choosing one redraws that wing straight (all 8 sheets, `@FRAME` on each), the report line states framed / total and that the rest is left out and counted. The importer UI turns a wing set back (`R.frame` -> `toOps({frame})`) and refuses an inconsistent `@FRAME`. sw.js v92.
- **W-E2E-DXF-WING** (`modeller/tests/witness_e2e_dxf_wing.js`, headless Chrome, real panel and importer; fixture `make_rotated_db.js` = the Duplex `.db` rotated 30 deg, synthetic and stated): 7 PASS / 0 FAIL: W1 panel offers "wing at 30 (57 walls)"; W2 zip valid, 8 `.dxf` only, `@FRAME=30` on 8/8; W3 browser zip == Node wing pipeline byte for byte; W4a the importer reads the frame, set STD, verdict qualifies; W4b Convert commits 158 bodies (walls 119, slabs 2, roof 1, doors 14, windows 22); W5 live scene bbox == Node turned-back bodies, deviation 7.8e-7 m, 3.86 m away from the straight frame.
- **Stated step in the test:** the export does not tag window products (no family map in the model; same for a straight export; lane §L5.7 item 3). The test adds the Duplex's own round-trip window `@TAG` labels (12) in the wing frame, as the Duplex samples do; without them the gate blocks on `GAP:fill_unbound` x12, unrelated to the wing.
- **Regression:** `witness_e2e_dxf_export.js` 14/14, `witness_dxf_wing_back.js` 4 angles, `witness_dxf_export_roundtrip.js`, `witness_dxf_scopes_merge.js`, BIMCompiler `witness_std2d_set.js` (prefix DXARC.DB).
- **Still not done:** a real Hospital wing through Convert (walls with off-axis faces inside a wing stay `wall_not_orthogonal`); window family tagging for model-exported sets.

#### Prior-art search, first pass (2026-10-17, three standard web searches; NOT exhaustive, no "first/unique" wording allowed on this basis)
- **IFC -> 2D drawings:** BlenderBIM/IfcOpenShell drawing generation (SVG/PDF; DXF via conversion), K-BIM D-Generator (plans/sections/elevations to DWG, 2016, inactive), DComposer (PDF), BricsCAD BIM (commercial), ifcbuilder.ai (vendor claim: PDF/DXF with layers). No maintained open tool found that writes grid + 3-tier dimensions + embedded markings and re-imports.
- **2D -> BIM:** CYPE and ARCHLine.XP (commercial DXF/DWG wall/door/window recognition, vendor figure 90-95 %), research with deep learning + rules (2023 Automation in Construction MEP; 2025 sketch-plan YOLO + rules; 2026 ECCC paper on OCR + text-geometry alignment, which names dimension/text alignment as the open problem). Ours differs by being rule-based and marking-driven, but a difference is not a first.
- **Rotated wings:** only user-forum material (Archicad rotated grids, Shapr3D "rotate to orthogonal before DXF export"). Local frames per wing are ordinary drafting practice; we found no tool that derives wing angles from the model and writes `@FRAME` for a lossless turn-back. Unverified beyond these searches.
- **Second pass (Revit / Archicad, 2026-10-17, standard web search, forum + vendor-help level; check against a current version before quoting):** Revit: keep the model orthogonal to Project North and rotate the CROP REGION per view against a reference line, reference planes + scope box + rotated work-plane grid for an angled wing; True North is a location setting (Project Base Point). Archicad: no native rotation of the floor-plan view; the construction grid can be rotated per window (numeric angle, graphical, or picked from an element) and is the same for all stories; whole-plan rotation by a hot-linked file. So per-view / per-grid rotation by a person is established practice in both; what we add is deriving the angle families from the model and carrying the angle in the drawing for a lossless turn-back. Still no "first/unique" wording.

- **Next if wanted:** patents (Google Patents/Espacenet), a second pass on "drawing-to-model round trip with embedded markings".

#### L1.17 Finding: why 113 walls of the 85-deg Hospital wing are still not orthogonal (2026-10-17, measured on HOSP2.db, no code yet)
In the 85-deg wing (594 walls) `GAP:wall_not_orthogonal` = 113: **95** of them have a consistent direction (face-quality q > 0.99) and fail R3 only through a small end/junction face off the wing axes (normal components 0.065 = 3.75 deg and 0.259 = 15 deg: mitred or angled wall ends, a trapezoid in plan), 17 have q 0.9-0.99, 1 has q 0.7-0.9. Also in the wing: `column_not_symmetric` 46, `door_hinge` 43, `door_swing` 2, `opening_no_host` 2, `window_no_host` 2.
- **Option (a), no invention:** judge R3 on the LONG faces only (area-weighted: faces whose normals are within tol of the wing axes carry >= 90 % of the vertical-face area, the rest are end faces), so the wall gets its axis, grid evidence and host; its plan contour stays the true trapezoid; the importer then honestly reports `wall_footprint_not_rect` for those pieces. Gains grid + hosts + opening gaps; changes no geometry.
- **Option (b), needs a stated tolerance:** also replace the trapezoid by its bounding rectangle (as the L1.8 sliver rule does for a 1 mm remnant). Not free: it moves an end by up to thickness x tan(angle) (200 mm wall, 15 deg: 54 mm). Only with a user-stated tolerance and a per-wall log line.
- **Order:** (a) first, measure how many walls then import; (b) only if the user states the tolerance.

#### L1.17 Results (2026-10-17): option (a) built, option (b) measured and rejected as a general rule
- **(a) built** (`orthogonalLong`, wing sets only via `model.longFaceR3`, `§ENDFACE_R3` log line per wall): Hospital 85-deg wing `GAP:wall_not_orthogonal` **113 -> 0**; the contour is unchanged. Straight sets untouched: `witness_std2d_set.js` W-LOG py=318 = js, W-ENT, Duplex wing witnesses at 30/7 deg, `witness_dxf_wing_back.js` pass. The Python oracle is not changed (wing sets have no oracle; straight parity holds because the flag is wing-only). sw.js v93.
- **(b) measured on the 113 walls** (end offset = how far a plan vertex sits from the wall's bounding-rectangle end): <= 5 mm: 0, <= 10 mm: 0, <= 15 mm: 11, <= 25 mm: 14, <= 50 mm: 18, <= 100 mm: 19 of 113; median offset 2.9 m, p90 9.8 m. So most of these walls are NOT rectangles with mitred ends: they bend (polyline walls with 3.75 / 15 deg kinks) or branch. A bounding-rectangle snap would move parts of them by metres. **Do not apply (b) as a rule.** A stated tolerance of 15 mm would touch 11 walls only.
- **Importer on the wing after (a)** (Node, library not loaded): the Hospital 85-deg wing writes 14 sheets with roles, but Convert refuses before any verdict: `@LEVEL=171.811 is not a drawn elevation boundary (BASIC_SHAPES_SPEC §2.3 LV)`. The Hospital's walls stop 0.2 m under the next level (Level 1 walls top 171.61, Level 2 at 171.811), so the reader's elevation-boundary rule (levels = drawn wall tops/bottoms) does not see the storey datum. Next item: spec first (how a floor build-up between a wall top and the next level is stated: from the model's slab thickness, not a guess).

#### L1.18 Stepped buildings: elevations per storey envelope (2026-10-17; found on the Hospital 85-deg wing)
Finding: the Convert refusal "@LEVEL=171.811 is not a drawn elevation boundary" was NOT a floor build-up problem (my first reading). The elevation draws only the walls on the GRID storey's envelope face (+/- 10 mm), and the Hospital steps in: envelope y0 of the wing is 49.61 (Level 1), 57.56 (Level 2), 72.84 (Levels 3-5), so the four elevations held 6 wall rectangles, all Level 1; no rectangle starts at Level 2's 171.811.
- **Rule (wing sets only, `model.perStoreyEnv`, so the Python oracle and straight sets are unchanged):** the exterior walls of a storey are the walls on that storey's own envelope face (R-ELEV per storey). Everything else in the elevation is as before.
- **Result:** Hospital 85-deg wing: the importer no longer refuses; it reaches a verdict: blocked, 834 blocking, by code: opening_unclassified 257, no_elevation_height 175, lod400_library_unreachable 120 (no library in Node), wall_below_min_thickness 58, no_host_cut 22, door_part_ambiguous 16, slab_no_exterior_wall 16, QF:dim_missing 16, no_elevation_for_face 12, no_host 10, section_no_slab 8, others 1-3. Straight-set parity (W-LOG/W-ENT) and the Duplex wing witnesses (30/7 deg), wing turn-back, export round trip: unchanged. sw.js v94.
- **Next:** the biggest honest blockers are openings the reader cannot classify (257) and openings with no elevation height (175): both rest on the elevation sheets of a stepped wing showing each opening against the wall it is in; spec first.

### L1.19 Spec: collinear vertices in cut contours (opening classification, 2026-10-17; spec BEFORE code)
**Evidence (Hospital 85-deg wing, after L1.18, Node, `GAP:opening_unclassified` = 257):** 256 of 257 are ONE shape: a closed `A-DOOR` LWPOLYLINE of **9 vertices** (e.g. 915 x 51 mm: corners plus extra vertices lying on the straight edges, such as `[42706.3, 83499.4]` between `[42706.3, 83521.7]` and `[42706.3, 83470.7]`), 1 of 15 vertices. They are the plan section of a door leaf cut by `G.elementContours`: the mesh splits one straight edge into several collinear pieces (leaf, frame, casing meet on one line). The reader's rectangle test (`dxf2bim.js` W4: 4 corners, 2 parallel + 4 perpendicular pairs) counts segments, so a rectangle with 5 extra vertices is "unclassified": 9 unconsumed parts, one gap per door. The Duplex doors are 4-vertex rectangles and classify.
**Rule (L1.19, lossless):** in a wing set a cut contour drops every vertex that lies on the straight line through its two neighbours (perpendicular distance <= 0.001 mm, the DXF's own resolution); nothing else about the contour changes (same area, same extent, same polygon). Logged `§COLLINEAR_DROP guid=<g> cls=<c> before=<n> after=<m>`. Wing sets only for now (`model.perStoreyEnv` family); promoted to the Python oracle and the straight path once it holds with NO change on Duplex, SampleCastle and HHS (W-LOG/W-ENT unchanged).
**Witnesses (issue each proves):**
- W-L119-OPEN: Hospital 85-deg wing `GAP:opening_unclassified` falls from 257; the count that remains is listed with its cause (proves the shape was the cause, not a symptom).
- W-L119-AREA: every changed contour has the same area (1e-6 mm2 relative) and the same bbox as before (proves lossless).
- W-L119-CONTROL: a contour with a REAL 5 deg kink is NOT changed (proves it removes collinear points only, never straightens).
- Straight-set parity (W-LOG/W-ENT) and the Duplex wing witnesses unchanged.
**Not claimed:** `GAP:no_host_cut` (142), `no_elevation_height` (175), `wall_below_min_thickness` (58) are separate causes; the first may follow once doors classify (a classified door cuts its host), the others get their own measurement after this rule.

#### L1.19 Results (2026-10-17)
Built as specified (wing sets only; `dropCollinear`, `§COLLINEAR_DROP` log lines). **W-L119-AREA** pass (8 vertices -> 4, area and extent equal), **W-L119-CONTROL** pass (a 4 mm bend kept), straight-set parity W-LOG/W-ENT unchanged (py=318 = js), Duplex wing witnesses unchanged. sw.js v95.
- **W-L119-OPEN, partly:** Hospital 85-deg wing `GAP:opening_unclassified` **257 -> 160**. The 96 doors that were 9-vertex rectangles now classify; 97 of them become rect openings that need a stated sill/height (`GAP:no_dimension` 97, the reader's `opening.rect.sill/height` config, not a guess).
- **Remaining 160, measured:** closed 4-vertex `A-DOOR` rectangles of **76 x 25 mm** (and 25 x 76) plus 915 x 51 / 813 x 51: one Hospital door is drawn as MANY contours (413 `A-DOOR` contours on the first plan: leaf, frame sides, casing returns, each its own rectangle, because the mesh is separate parts). The tiny ones are door parts, not openings. Next rule candidate (spec first): union the touching contours of ONE element into its outline (polygon-clipping is already vendored), logged per door, so the reader sees one outline per door as it does on the Duplex; witness = the union has the same area as the sum of the non-overlapping parts.
- **Not changed by this rule:** `no_host_cut` 142, `no_elevation_height` 175, `wall_below_min_thickness` 58.

### L1.20 Spec: one outline per door/window (union of touching contours of ONE element), 2026-10-17; spec BEFORE code
**Evidence (Hospital 85-deg wing after L1.19):** 160 `GAP:opening_unclassified` remain, all closed 4-vertex `A-DOOR` rectangles of 76 x 25 / 25 x 76 / 915 x 51 / 813 x 51 mm; the first plan holds 413 `A-DOOR` contours for its doors: one door element is cut into many parts (leaf, frame sides, casing returns), each part its own contour, so the reader sees many small rectangles that are not an opening.
**Rule (wing sets only, same flag as L1.18/L1.19; promoted to the Python oracle only when Duplex/SampleCastle/HHS show NO change):** for an IfcDoor / IfcWindow element with 2 or more contours on one plan, the contours are united (`polygon-clipping` union, vendored 0.15.7) into the outline(s) they form. A union result with a HOLE is not used (the element keeps its parts, logged `§OPEN_UNION_HOLE`); a result with more than one disjoint ring keeps those rings (logged). Logged per element `§OPEN_UNION guid=<g> cls=<c> parts=<n> -> rings=<m> area_sum=<a> area_union=<b>`. Walls and columns are NOT united (their parts are real separate hatched pieces, and the sliver / collinear rules already cover them).
**Witnesses:**
- W-L120-AREA: for every united element, union area <= sum of part areas and the union bbox == the bbox of the parts (proves nothing is lost or grown); where the parts do not overlap, union area == sum (to 1e-6 relative).
- W-L120-CONTROL: two DISJOINT contours of one element stay two rings (the union does not bridge a gap).
- W-L120-OPEN: Hospital 85-deg wing `GAP:opening_unclassified` falls from 160; the remainder is listed by shape and cause.
- Unchanged: straight-set parity (W-LOG/W-ENT), Duplex wing witnesses, W-L119.
**Not claimed:** `no_dimension` (97, needs a stated sill/height), `no_host_cut` 142, `no_elevation_height` 175, `wall_below_min_thickness` 58.

**L1.20b (amendment, measured the same day, BEFORE its code):** the union alone does not help: of 189 united Hospital door/window elements, 176 stay MULTI-ring because their parts are disjoint (no union bug: `union area == sum of parts`, max difference 0.30 mm2). Measured example: a door element of bbox 965 x 173 mm = a 813 x 51 leaf plus four 76 x 25 casing corner blocks at the four corners of the bbox; another is 1982 x 173 = two 915 x 51 leaves plus four corner blocks. The corner blocks are casing returns, not openings.
- **Rule:** in a wing set, when the parts of one door/window element remain more than one ring after the union, the element is drawn as ONE rectangle: its own plan bbox (the element's IFC world bbox, in the wing frame). This is the same shape the writer already draws for an opening above or below the cut (`planOpenings`), so the convention exists. Condition: every part is an axis-aligned rectangle (4 vertices, edges on X/Y within 0.001 mm); otherwise the parts are kept (`§OPEN_BBOX_SKIP reason=part_not_axis_rect`). The bbox contains every part by construction (checked, logged). Logged `§OPEN_BBOX guid=<g> cls=<c> parts=<n> bbox=<w> x <d> mm`.
- **What it adds (stated):** the drawn outline covers the gaps between the casing blocks and the leaf: area not in the section. It is the footprint of the door product with its casing, not the cut.
- **Witnesses:** W-L120B-CONTAIN (every replaced element's bbox contains all its parts and equals the extent of the parts); W-L120B-CONTROL (an element with a rotated part is NOT replaced); W-L120B-OPEN (Hospital 85-deg wing `GAP:opening_unclassified` falls from 129; remainder listed); Duplex wing and straight-set parity unchanged.

## Order
basic shapes (running) → L1 → L2 → L3 → L4 → L5 (after L1.6 acid test) → film (FILM_PLAN §10), English first.
