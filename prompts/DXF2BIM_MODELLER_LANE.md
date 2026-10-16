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
- O3 Symbol by position relative to the cut plane: crossing → the cut contour (as today); wholly above (minZ ≥ cut_z) → the filling's plan bbox outline on `A-GLAZ-OVHD` / `A-DOOR-OVHD`, linetype HIDDEN (drafting convention: overhead = dashed), gap still shown; wholly below (maxZ ≤ cut_z) → outline on `A-GLAZ` / `A-DOOR` continuous (seen below the cut). Window sill lines (R10) and door arcs (§L1.2) unchanged.
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
- Mutations: OP1-control (a copy of a plan with one above-cut gap filled by a host-tagged rectangle) must FAIL OP1; COL1-control (one column contour moved to A-WALL-PRTN) must FAIL COL1; GRID1-control (one bubble relabelled on one storey) must FAIL GRID1; DIM1-control (one T3 point moved 50 mm) must FAIL DIM1.
- **Regression:** `test_std2d.py` (Duplex) `fail=0`; its W2/W3/W10 oracles follow O2 (the 8 Level 2 knife-missed windows now cut gaps, so T3 gains their jambs: still wall-mesh vertex coordinates, the hole edges). Duplex std chain: `mark_dx_set.js std` maps its sheets by storey from the std log, then `DXSET=std rosetta_dx_shell` (was 36/0) and `rosetta_qualify` (0 blocking): changes reported, not hacked.
- **Reader chain on SampleCastle:** as far as it goes; what is Duplex-specific in `mark_dx_set.js` / `rosetta_dx_shell.js` is listed, not hacked to green.

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

## Order
basic shapes (running) → L1 → L2 → L3 → L4 → film (FILM_PLAN §10), English first.
