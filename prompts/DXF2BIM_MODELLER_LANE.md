# ⚠ DO NOT REMOVE
SCOPE: DXF2BIM inside the Modeller: Duplex → standard 2D set → import → metadata editor → qualify → convert (basic shapes) → IFC4; then the demo film.
Spec before code, for every lane below. Read the log after every run (exit code is not evidence). Every value traces to a DXF entity, a marking a user confirmed, or a named standard convention; nothing is guessed. Work in a /tmp/wt-* worktree (editing ~/bim-ootb directly is hook-blocked). Neutral naming: no client names anywhere.

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

## Order
basic shapes (running) → L1 → L2 → L3 → L4 → film (FILM_PLAN §10), English first.
