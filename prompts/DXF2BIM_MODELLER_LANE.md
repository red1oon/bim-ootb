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
