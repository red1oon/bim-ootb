# ⚠ DO NOT REMOVE
SCOPE: drawn services enter the walk. ACMV runs and terminals come from the drawn-route record where sheets are held; run height follows §7.1 of `prompts/DISC_WALK_DRAWN_MAINS.md`. Read the log after every run; exit code is not evidence. Public repo: no client or project names, and no coordinates or sheet numbers from a private file.
Design: the design lane, 2026-11-08. Owner rulings are quoted. Build: the Modeller lane.

## §1 Data flow. OWNER: *"Tool now, UI later"*
- `modeller/tools/mains_to_db.js <building.db> <sheet.dxf>... [--sheet-meta=json]` runs the shipped `DrawnMains.read` on the named DXFs, against the DB's OWN `ifc_grid_axis`, and writes through `DrawnMains.write`.
- One writer: the later Modeller button will call the same read + write.
- Logs `§MAINS-READ` per sheet, plus a summary `§MAINS-TO-DB sheets= pieces= length= refused=`.
- The film does NOT show or narrate a "load sheets" button. It says the sheets were read by the reader. (§7 Q2, the UI, stays open.)
- **Federated building for heights** (§4): the building DB is made by the existing node extractor with both files, `modeller/tools/extract_ifc2db.js <ARC.ifc> --also <STR.ifc>` (one federation pin, ONE FRAME). It is then opened in the Modeller as a local `.db`. The Modeller's own IFC open is one file at a time, and that is not changed here.

## §1a Federation merges ALL of the second file (design lane, code read on main; built BEFORE the height work)
**Issue.** `modeller/tools/extract_ifc2db.js --also` merges only `IfcColumn` (`Core.mergeElements(..., ['IfcColumn'])`). A structural model's slabs and beams never arrive, so §4's "structure above" finds nothing and every drawn piece falls to plan-only. The extractor also passes no `GridRead` in `ctx`, and in node the core may not find the global reader: whether the federated DB holds `ifc_grid_axis` is to be verified, not assumed.
**Rule.**
1. New flag `--federate <second.ifc>`. `--also` keeps its old behaviour exactly (columns only).
2. `--federate` extracts the second file with its OWN discipline (a `--disc` override from file 1 is not applied to file 2) and the shared pin (`forceGeorefOffset` from file 1, through `GeorefFrame.pinInput`'s rule inside the core), then merges ALL its elements: `elements_meta`, `element_transforms`, `element_instances`, `component_geometries` (bodies), `element_world_bbox`, `element_pset_common`, `element_type`, `element_parts`, `rel_fills_host`. Guids already held are never overwritten. `mergeElements(..., '*')` is the all-classes mode; a class list behaves as before.
3. Grids: both files' `ifc_grid_axis` rows are kept, `grid_guid` unchanged. `ifc_spaces` rows of the second file are added to the first's. The tool passes `GridRead` (and `GeorefFrame`) to the core so the table is written in node.
4. **Discipline of the second file (measured in the core, found while building).** `DISC_MAP` labels `IfcSlab`, `IfcRoof` and `IfcCovering` as `ARC` whatever file they come from; only `IfcBeam`/`IfcColumn`/`IfcFooting`/`IfcMember` are `STR`. A structural model's slab therefore arrives labelled `ARC` and §4's "STR-discipline only" would never see it. The caller states the second file's discipline: `--federate-disc STR` sets it for every element of the second file (the same explicit statement `--disc` is for file 1, never inherited from it). Without it the second file keeps the class map's labels, its slabs read `ARC`, and the walk correctly finds no structure and goes plan-only (F6).
5. Log: `§FEDERATE second=<file> merged=<n> classes=<n> byDisc={..} grid_axes=<n> spaces=<n> offset=(x,y,z)`.
**Witness W-FEDERATE (claims F1-F5, in `modeller/tests/witness_drawn_walk.js`).** F1 element count per discipline equals the two single opens' counts added; F2 STR `IfcSlab` and `IfcBeam` are present with bodies; F3 the georef offset equals the ARC single open's; F4 `ifc_grid_axis` and `ifc_spaces` rows equal the single opens' counts; F6 without `--federate-disc` the STR file's slab reads `ARC` (the class map), the beam stays `STR`. F5 RED: the same fixtures through `--also` (main's behaviour) hold 0 STR slabs, so F2 must FAIL there. No public STR IFC exists in `IFC/` (only `Duplex_ARC.ifc` and `SampleHouse_ARC.ifc`), so the witness writes a small ARC and STR pair, as `witness_ifc_grid.js` writes its IFC.

## §2 Walker, ACMV runs
- When `drawn_route` rows exist, the ACMV walk commits each drawn piece as an op IN PLACE of band ducts (band duct pieces are already not placed, §9.2: the drawn piece IS the run).
- **Strength is per attribute, not one flag:**
  - position = `drawn`;
  - width = `drawn` when the reader found it, else none;
  - height = `provisional` (§7.1 void middle) or absent.
- Do NOT set the §11 `Provisional=TRUE` flag on drawn pieces: drawn length is real data and counts in totals. Record the height strength in its own property: `BIMOOTB_Walk` `HeightBasis` = `void-middle` | `none`.
- §9.1's "no sheet held" must not fire for ACMV once `drawn_route` exists.
- Log: `§WALK-MAINS disc=ACMV drawn=<m> pieces=<n> heightKnown=<n> planOnly=<n>`.
- A placed total, where the walker reports one, counts drawn pieces.

## §3 Look
- A line at height. Where the film needs it visible, a screen-space-width line, which still implies no depth.
- The drawn width is a property and a label, never a ribbon or solid.
- Plan-only pieces (no z) are not drawn in 3D; they are listed and counted.

## §4 Height (§7.1 inputs)
- **Ceiling** = the existing host search: `modeller/disc_walker.js` `hostBind` (~L1370) with `_AREA_HOST`'s IfcCovering rule (~L1307), "the ceiling whose real outline holds the point" (#2681). Reuse it at each piece's midpoint; do not write a second ceiling query.
- **Structure above** = IfcSlab / IfcBeam / IfcRoof of the STRUCTURE discipline only: the lowest one's LOWER face above the ceiling at that point.
- Never take an ARC finish slab as structure: finish layers are not enclosures. With no STR, rule §7.1.3 applies: plan only, counted.
- Height = the middle of that void, labelled `provisional`, naming which ceiling and which structure.
- Sloped or deep coverings are logged (§7.1.5). On the private ARC: 32 IfcCovering, some sloped, avg bbox_z 0.51 m.
- Heights sit in the federation's ONE FRAME.

## §5 Terminals. OWNER: *"Drawn replace borrowed"*
- On a storey a held sheet covers, place the DRAWN terminals. The reader counts them; kind comes from name words.
  - position = drawn;
  - height = the ceiling whose real outline holds them, via the host search, labelled.
- Drop the borrowed band terminals on that storey. Elsewhere, borrowed ones stay provisional.
- Log: `§WALK-TERMINALS storey=<s> drawn=<n> borrowedDropped=<n>`.
- Terminals of no kind are placed and counted, but never give a system.

## §6 Witness W-DRAWN-WALK (`modeller/tests/witness_drawn_walk.js`)
- **D1** tool → DB → open → Walk: the ACMV runs equal the drawn_route pieces (count, length); no band duct pieces. RED: no drawn_route gives the §9 behaviour.
- **D2** height: a piece under a covering with STR structure above gets the void middle, labelled. RED: with no STR, planOnly counts it and it gets no z.
- **D3** an ARC finish slab above is never taken as structure.
- **D4** drawn pieces carry no Provisional=TRUE, HeightBasis is set, and Viewer totals count them (ProvTotals).
- **D5** terminals: on a covered storey, drawn placed and band dropped, both counted. On an uncovered storey, band stays provisional.
- **D6** §9.1 "no sheet held" does not fire when drawn_route exists.
- **D7** the look: committed runs are line ops, with no solid or ribbon mesh.
- Public fixtures only; the design lane runs the private set.

## RESULT 2026-11-08 (Modeller lane; log `/tmp/claude-1000/scratch/logs/w2.log`)
`modeller/tests/witness_drawn_walk.js` (W-DRAWN-WALK + W-FEDERATE): `§VERDICT CLAIM MET pass=28 fail=0 inconclusive=0`, node only, software only.
**Built.** `modeller/tools/mains_to_db.js` (§1; also stores `drawn_sheet_meta` and `drawn_terminal`, because `DrawnMains.read()` exposes neither the sheet's storey nor terminal positions: the tool computes the terminals from the reader's own fit, the same expanded entities and rules rows, and logs `§MAINS-TERMINALS ... reader_count= agree|DISAGREE`). `extract_ifc2db.js --federate <ifc> [--federate-disc STR]` and `Core.mergeElements(..., '*')` (§1a). `disc_walker.js`: `_drawnIntegrate` wraps `dwWalk` (§2, §4, §5), `DiscWalker.drawnOps` builds the ops. `modeller.html`: `_commitDrawnMains`, `_renderDrawnMains` (§3). `bonsai_ifc.js`/`ifc_extract_core.js`: `HeightBasis` in the `BIMOOTB_Walk` set.
**Decisions made while building.**
- `DISC_MAP` labels `IfcSlab`/`IfcRoof` as `ARC` whatever the file, so "STR-discipline only" needs the caller to state the second file's discipline (`--federate-disc STR`, §1a.4). Without it the walk finds no structure and goes plan only (F6).
- Heights use the ceiling's UPPER face (the void starts there) and the structure's lower face; terminals sit on the ceiling's LOWER face. A drawn piece's storey is the one the caller states for its sheet (`--sheet-meta`); with none, the pieces are plan only ("no storey stated").
- A committed run is a GEOM_INSERT with `anchorOnly:true` and `params.line`: invisible, skipped by the IFC export and by every count (not saved as a duct, as §9.3.4), drawn by the page as `LineSegments`. Plain 1-px lines; a screen-space-width material was not added.
- `placed` counts every drawn piece (plan-only ones included: their drawn length is real); `heightKnown`/`planOnly` split them.
- Borrowed band terminals = provisional, non-main-class placements whose storey (their host's, else nearest storey by median z) is a covered storey. Room-schedule terminals (`sched:*`) are not band and stay. A drawn terminal takes the dropped terminals' rule-mined device mesh; with none to copy it is listed and counted (`noMesh`), never boxed.
**Claims.** F1-F7 (federation) and D1-D7 as §6, plus the red controls: F5 (`--also`, main's behaviour, holds 0 STR slab/beam), D1 (no `drawn_route` gives "none reason=no sheet held"), D2 (no STR: heightKnown=0 planOnly=5), D3 (witness-only `drawnStructAnyDisc` takes the ARC slab and moves P1 from 2.7785 to 2.7260). D5 runs on the public Clinic DB (borrowed band terminals; First Floor covered: drawn=3 borrowedDropped=49, 229 kept provisional elsewhere, independent count agrees), its grid rows given to the DB directly (Clinic states none).
**Regression, before (HEAD tree) vs after:** W-WALK-MAINS 6/0 both; W-BAND-NO-HOST 43/1 both (P3 fails in both: it compares with main's walker); W-DRAWN-MAINS 53/0 both; W-ONE-FRAME 29/2/1 before, 32/2/0 after (F1d RED IFCSPACE and IFCOPENINGELEMENT fail in both: the control compares with origin/main, which now has the fix); W-WALK-ROUTED-NODE Duplex 5/1 both, log lines identical (the W6 stubs line, as before).
**Not done.** No page run (software GL) of the new commit and render: the page code is syntax-checked (inline script `node --check`) and D7 checks the renderer's source and the op shape. No private set read.

## §7 Design-lane rulings 2026-11-08 (on the decisions the RESULT above listed; written before the build)
1. **Discipline of the second file.** `--federate-disc STR` (explicit, never inherited from `--disc`) stays as the TOOL rule. **OPEN, not fixed today:** `DISC_MAP`'s class-to-discipline label overrides the file's discipline (an `IfcSlab` in a structural file reads ARC). The later rule is "the file's discipline, stated by the user or read from the file, wins over the class map". Reading it from `IfcProject` or the model view is a separate design and the owner's call.
2. **Counts.** `placed` = `heightKnown`, i.e. committed with geometry. A plan-only piece is a record, not a placement. Log `§WALK-MAINS disc=ACMV drawn=<all pieces>/<m> placed=<heightKnown> planOnly=<rest>`; `drawn=` may still carry the length total. The status text and every placed total follow.
3. **Storey SET per sheet.** A sheet names a set of storeys; `hostBind` picks, per piece and per terminal, the storey whose ceiling holds it.
   - The set comes from the sheet's view title, matched to storey names by word through an ALIAS data row (`modeller/drawn_sheet_aliases.json`: a pattern and a storey index counted up from ground, e.g. "first floor" = the first storey above ground). Where no word matches, the tool takes the set as an argument (`--sheet-meta` `storeys:[...]`). Never guessed. A sheet with no set from either source is plan only, logged.
   - Title parsing: the title text is not reliably findable in a DXF (no title-block parsing is built), so the title is accepted as an ARGUMENT (`title` in `--sheet-meta`), not read from the file. Said in the tool's log.
   - The set is stored in `drawn_sheet_meta`, one row per storey.
   - A piece (or terminal) held by the ceilings of more than one storey of the set is AMBIGUOUS, since a plan states no z: it is plan only and counted (`ambiguous=`), never picked.
   - Witness: a 2-storey set places pieces on both storeys by ceiling; a title word that matches no storey and has no argument gives plan only, logged.
4. **Height faces confirmed:** ceiling UPPER face, structure LOWER face. §7.1.5 is logged as `sloped=<n>`: pieces whose ceiling has `bbox_z` > 0.3 m. A non-horizontal ceiling mesh is already refused as a host by `hostBind`'s `uprightHz` rule (so it never holds a piece); that is stated in the log.
5. **`sched:*` terminals are borrowed** (projected from residential room schedules, not measured). On a storey a sheet covers they are dropped too, logged apart: `§WALK-TERMINALS storey=<s> drawn=<n> borrowedDropped=<band> schedDropped=<sched>`. Elsewhere they stay.

## RESULT 2 2026-11-08 (§7 rulings built; log `/tmp/claude-1000/scratch/logs/w4.log`)
W-DRAWN-WALK `§VERDICT CLAIM MET pass=33 fail=0 inconclusive=0` (was 28). eslint (`npx --no-install eslint`) 0 errors on `disc_walker.js`, `mains_to_db.js`, `extract_ifc2db.js`, `bonsai_ifc.js`, `ifc_extract_core.js` (the witness file is in the ignore list).
**Changed claims.**
- D1/D4/D2-RED: counts per §7.2: `§WALK-MAINS disc=ACMV drawn=5/14.650 placed=4 planOnly=1`; the walk's `placed` total = non-provisional placements + heightKnown (asserted); RED with no STR: `placed=0 planOnly=5`.
- D5a (Duplex): `§WALK-TERMINALS storey=Level 1 drawn=3 borrowedDropped=0 schedDropped=11`; the base walk's independent count of `sched:*` terminals on Level 1 is 11, the other 8 stay (§7.5).
- D5 (Clinic): `§WALK-TERMINALS storey=First Floor drawn=3 borrowedDropped=49 schedDropped=46`, independent counts 49 and 46, the rest kept.
- New D8/D8b (§7.3 set): sheet with storeys [Level 1, Level 2]: `drawn=4/8.800 placed=2 planOnly=2`, `byStorey={"Level 1":1,"Level 2":1}`, `ambiguous=1 noCeiling=1`. Q1 on Level 1 (z 2.727), Q2 on Level 2 (z 5.928), checked against the coverings' world boxes; P1 (held by both storeys' ceilings) is plan only, never picked. Duplex's Level 2 ceilings all lie inside its Level 1 footprint (measured), so the fixture DB gets one extra Level 2 ceiling copied 10 m in x (a stated fixture edit); the STR roof slab was widened to match.
- New D9: title "FIRST FLOOR CEILING PLAN" gives `source=title storeys=["Level 2"]` (alias index 1 above ground) and its pieces are placed on Level 2; title "BASEMENT SERVICES PLAN" gives `none: no storey word ... (the sheet is plan only)` and the walk `placed=0 planOnly=4 noStoreySet=4`.
- New D4d: `sloped=0 slopedCeilings=0 (sloped = ceiling bbox_z > 0.3 m; a non-horizontal ceiling mesh is refused as a host by hostBind, so it holds none)`.
**Built.** `modeller/drawn_sheet_aliases.json` (alias rows, data); `mains_to_db.js --sheet-meta` takes `storeys:[...]` or `title` (the title is an ARGUMENT: a DXF title is not reliably findable, no title-block parsing); `drawn_sheet_meta` holds one row per storey; the walker picks the storey per piece and per terminal by the ceiling that holds it. A walk whose pieces are all plan only carries `w.reason` ("N drawn runs held, all plan only (...)"), so the page says why it placed nothing.
**Regression (same set, this tree):** W-WALK-MAINS 6/0 (before 6/0); W-BAND-NO-HOST 43/1 (before 43/1, the same P3); W-DRAWN-MAINS 67/0 (53/0 before; the merge added the other lane's claims); W-WALK-ROUTED-NODE Duplex 5/1 with log lines identical to before; W-ONE-FRAME 34/0/0 (before 29/2/1: the two F1d reds now pass on the merged main).
