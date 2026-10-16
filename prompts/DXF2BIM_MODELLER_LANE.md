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
- R3 `@VIEW=PLAN` + `@ROOF` and no `@LEVEL` → roof plan at `@ROOF` (BASIC_SHAPES_SPEC §11 CF-2). Only for this role the `MARK:missing` keys `LEVEL`, `GRIDX(>=2)`, `GRIDY(>=2)` are expected.
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
