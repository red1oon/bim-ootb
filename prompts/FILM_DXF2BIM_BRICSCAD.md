# ⚠ DO NOT REMOVE
SCOPE: DRAFT storyboard + spec for the DXF2BIM chapter "From a BricsCAD 2D drawing to a costed ERP order" (user 2026-10-18: "Opening Chapter 'From BricsCAD 2D drawing to full ERP schedule and costing'"; "the film need not mention the farm or the sponsor, merely how a common BricsCAD file is processed").
Read the logs after every run (recorder log, page log, witness logs): exit code is not evidence. Every spoken number comes from a § line or a named facts/ log line of THIS run. No "first", no "only". NEUTRAL NAMING: the drawing is "a common BricsCAD file"; the title block of EVERY sheet carries the client's name: no frame may show it (crop or blank the title block before any sheet is drawn on screen; check each rendered frame).
Status: DRAFT 1 RECORDED 2026-10-18 (live app, real raw sheets, narrated + subtitled, 130 s): `~/Videos/DXF2BIM_Chapter_BricsCAD_to_ERP_1920x1080_25fps_2026-10-18_draft1.mp4`; recorder `prompts/film_dxf2bim_bricscad_rec.js` (CDP screencast with its own frame timestamps: puppeteer's page.screencast drifted 24% from the wall clock), narration `prompts/film_narration_dxf2bim_bricscad_en.tsv`, assembled by BIMCompiler `prompts/film_dxf2bim_assemble.sh` (Kokoro voices). Facts of the take (§FILM_FACT in the recorder log): 3 sheets raw, 14 elevation grid marks + 18 plan grid marks, @Z=0 at y -4470.581, 32 columns + 32 footings, type name `12"x12" R.C.C Column`, IFC 64 typed, DB elements=64, Find 32 found, cost $ 1,268, Project Order contract $ 1,268 (saved). Frames checked: no title block or client text on screen (the sheets are never drawn). Not done: English only (the Malay track, music/credits review, a re-take with the title-block frame check automated).

# §FILM-DXF2BIM-BRICSCAD — spec (2026-10-18)

## Evidence chain (one command per step, all witnessed; logs to the film work dir)
`modeller/tests/witness_dxf_shed_columns.js` (W-DXF-SHED, real raw sheets, SKIP without them: H1-H6) -> Export IFC4 (`Bonsai.ifc.build()`, `§IFC-SEED seeded=24 typed=24`) -> `scripts/extractIFC2DB.js --ifc … -o … ` (`§SUMMARY elements=24`) -> Viewer `?db=` (Find -> cost -> `› ERP`, `§PROJ_PUSH project=… plannedAmt=…`, `§PROJ_PUSH_LINK`). Drivers used for the proof frames: scratchpad `film_shed_columns.js` (Modeller half + IFC + DB) and `proof/viewer_proof2.js` (Viewer half); both to be turned into the recorder.
Specs behind each beat: lane §L7.2 (yellow defaults, All defaults, shiver), §L7.8-L7.9 (pre-processor, loops), §L7.10 (typed bodies), §L7.11 (grid from ticks, ground datum), §L7.12 (Layers kinds + structure Convert), §L7.13 (type names).

## Picture (one recorder, 1920x1080; the Modeller and the Viewer are two pages, switched under a card)
| # | beat | on screen | issue it would expose |
|---|---|---|---|
| 0 | c1 | title card: "From a BricsCAD 2D drawing to a costed ERP order"; one sentence: a drawing set carries geometry; a model needs meaning | — |
| 1 | d01 | the two sheets as drawn (floor plan, South elevation), title block blanked; "no markings, no layers we chose" | a frame showing the title block |
| 2 | o01 | Open 2D drawings: the settings sheet opens by itself; ONLY three suggestions per sheet, yellow: units (from the file header), view and name (from the title text) [H1] | a suggestion the drawing does not state |
| 3 | a01-a02 | Accept all: the grid positions come from the dimension ticks (14 on the elevation), the ground line is z 0, "South" is the minY face; the All-defaults list empties; the Metadata button would shiver if closed [H2] | marks placed at label text (the 9-in offset, §L7.10 follow-up) |
| 4 | f01 | the three facts a person must state: the set name, the plan level, the plinth datum "PL = 2'-0" above ground" (read from the column detail, typed 0.6096 m) [H3] | a datum the app guessed |
| 5 | l01 | Layers: the one decision: layer `Col` is Column on the plan, layer `0` is Column on the elevation [H4] | a body kind the user did not choose |
| 6 | s01 | the structure-set sentence from the panel: "32 bodies will be built" (all 32 columns; the first run left 8 end columns out, closed by the overlap rule); with the foundation plan added: the 32 footings WAIT, listed under "Body heights" because no elevation shows them [H4, F2] | silent loss or silent guess |
| 7 | c02-c03 | the footing depth stated once from the detail (-1.4478..-1.143 m), then Convert: 32 columns (16 at 24..122 in, 12 drawn 36 in tall, 4 at the east end 24..120) + 32 footings 48 x 60 in as drawn, each centred on a column; names = the drawing's own label `12"x12" R.C.C Column` as a yellow default [H5, H6, F3] | heights/names the drawing does not state |
| 8 | m01 | Save marked copies: the SAME settings sheet the 3D-to-2D export writes (every value now a marking in the DXF) | a sidecar |
| 9 | i01-i02 | Export IFC4; terminal: the usual IFC -> DB extractor, `elements=24`, 4D tasks 0 (Time Machine injects them in the Viewer, not shown: already known) | — |
| 10 | v01-v03 | Viewer on that DB: Find "IfcColumn" -> 24 found -> select one: cost $ 1,294 in the Find panel -> `› ERP` -> status "Project Order: 1 lines · contract $ 1,294 (saved)" -> green `open ↗` (iDempiere project window): "it is ERP-ready" | a cost/ERP figure not from the run |
| 11 | n01 | limits card (below), next, credits | — |

## Honest framing (decisions recorded before the take)
- COLUMNS AND FOOTINGS ONLY. Beams and grade beams are drawn as two parallel lines broken at every column and in different pieces on the two edges, with the expansion-joint lines among them (a rule to bridge them is not stated by the drawing, and the joint would become a bogus beam); the trusses are a typical section repeated at a spacing the drawing does not state; the roof outline, doors, fans and pads need the owner. The card says so; the film does not show the hand-traced full shed as an import.
- The footing depth is a number the PERSON states from the detail (the elevations do not show it); the film says so on screen. The first run left 8 end columns out (unequal face lengths); fixed, and a second elevation (North) gives the same 32 with the same heights.
- The cost is the Viewer's rate-based estimate for the class and the geometry's quantities, not a tender; the Project Order is a proposal pushed into the ERP model, not a posted document.
- No GPU: SwiftShader frames; the speed is the page's, not the film's.
- Defaults are shown as defaults (yellow) and are never presented as the drawing's own statements.

## Frames already produced earlier (2026-10-18, scratchpad `film/`, superseded by the recorded take): 01 opened raw (yellow), 02 accepted, 03 facts typed, 04 layers typed, 05/05b columns on the canvas, 06 Find + cost, 07 ERP pushed. [RESULT?] re-take after the type-name change (L7.13): names replace "IfcColumn 1".
