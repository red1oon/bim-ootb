# ⚠ DO NOT REMOVE
SCOPE: the brief for an ARCHITECT REVIEW session of DXF2BIM (2D DXF sets -> 3D model in the Modeller), written 2026-10-23 at the owner's request. Read-only
review first, specs second, code only if the owner says so. **Read the log after every run; exit code is not evidence.** Honour this block until the review is DONE.

## ▶▶▶ RESUME HERE (written 2026-10-23 at the end of session 1; read this block, then RESULT parts 1-3 at the bottom)
**State:** all merged to bim-ootb main: #2301 (stock-take + HHS round trip), #2302 D44/D45, #2303 D46-D48, #2304 D50 + F13, #2305 D51-D53, #2306 D54/D55 + the report page
`reports/dxf2bim_stocktake.html` (https://red1oon.github.io/bim-ootb/reports/dxf2bim_stocktake.html; the owner wants reports on github.io, not as Claude artifacts). Modeller sw v130. Specs + RESULT
lines for every rule are in `prompts/DXF2BIM_FOUNDATION_LANE.md` §D44-§D55. **Owner decisions this session (do not re-ask):** `modeller/dxf2bim/` is edited in bim-ootb (F13; `sync.sh`
refuses); best-effort defaults are wanted (amber, stated, one `element_defaults.json` value or `@DEFAULT` to turn off) and supersede L2.3 D3 "never a default"; keep tuning on the machine's
other buildings (JKR first; the Hospital belongs to the wing lane).
**Data (scratch, regenerate):** `/tmp/db2/{DXARC,HHSM2,CLINIC2,LTU2,HOSP2,JKR2}.db` = `node ~/bim-compiler/scripts/extractIFC2DB.js --ifc <ARC> --also <STR> -o <db>`; JKR IFCs in
`~/Downloads/OPEN SOURCE BIM/IFC 4/` (jkrAR25_* + jkrST25-*), HHS / Clinic / LTU / Hospital in `~/bim-compiler/internal/UNMERGED/`, Duplex `~/bim-compiler/reference/residential/`. JKR Viewer db (Room
Injection source) `~/bim-ootb/buildings/JKR_extracted.db` (untracked). The round-trip harness (`rt_sets.js` / `rt_ladder.js`) lived in the session scratchpad: the witnesses carry the claims now.
**Regression recipe:** `SHED_RAW_DIR=~/Videos/dxf2bim_film_work/why/raw NODE_PATH=~/bim-compiler/node_modules node modeller/tests/run_all_witnesses.js` = PASS 40 / ENV 34 / FAIL 4 (the 4 pre-existing:
`struct`, `ticks`, `guardrails` G3 206, `ifc_valid`); the new witnesses need db args: `witness_dxf_{slab_outline,curtain,title,tag_width,grid_label,storey_absorb,slab_estimate,bridge_long,walltop_default,window_parts}.js <db...>`
(`BASE=<older modeller dir>` where they compare), `witness_dxf_material.js <db> <its ARC ifc> [<another firm's ifc>]`.
**Scaling (measured 2026-10-23, after #2307's D51 perf fix):** parse + convert in Node: Duplex 1.0k entities 0.1 s, HHS 3.2k 0.5 s, JKR 4.4k 0.3 s, Clinic 8.1k 0.8 s, Hospital whole 18.8k entities / 7.3 MB 1.6 s, LTU 26.7k / 9 MB 5.1 s (was 41 s: the D51 slab was meshed on the raw wall grid). A rule that builds a grid or a pairwise loop must be timed on LTU before merge. **Two sessions worked this lane on 2026-10-23:** bim-ootb-0a took NEXT (1) window tags by width (`/tmp/wt-archrev`); bim-ootb-1e only landed the D51 perf fix after this block was written.
**NEXT (in order, each spec'd first):** (1) PR-TAG-WIDTH for WINDOWS (JKR: 48 window tags are the main per-element ask; reuse `Dxf2Suggest.tagByWidth` with the window schedule). (2) JKR Level 1 wall
tops: the section states no slab underside above Level 1 (`slab_no_underside`), so D54 cannot default them (281 asks). (3) JKR `opening_outside_wall` 31 and the section-slab conflicts (two slab tops
10 mm apart at 81.18 / 81.19 and 84.48 / 84.49). (4) F15 the writer draws no slab edge on the plans (the real outline D51 estimates). (5) The page has no way to LOAD a firm catalogue yet
(`state.catalogue` is read by Convert, nothing sets it): a "Load catalogue" row in the 2D panel. (6) This brief's Parts A.1-A.3 (drift, hard-code hunt, mutation matrix) and B (walk the guide on the
canvas) are still open. Then the Hospital only with the wing lane's say.

**Who you are this session:** an expert software architect and specification writer (Opus, high effort). Owner's words: *"review of the code and functional steps to be
well designed, checking for any drift, hard-code bypass where it will fail another similar 2D DXF set. Go through the docs/DXF2BIMGuide to ensure it is working,
practical on the canvas, note what has issues or can be improved further, simplified all for a smooth user experience doing such 3D construction from 2D raw DXFs."*

**House rules that bind you (CLAUDE.md, restated because they were broken before):** Deterministic, never invent. Spec before code, spec before tests. The owner's eyes
are never the instrument: every claim is a `§`-tagged value read from a log or a number computed from real state (screenshots only illustrate the guide, they prove nothing).
A witness must be able to say NO-OP / VACUOUS / WRONG; `INCONCLUSIVE`, never `PASS`, when nothing was judged. Work in a `/tmp/wt-*` worktree (run `git worktree list` first;
`~/bim-ootb` is hook-blocked). Headless runs use SOFTWARE GL (`--use-angle=swiftshader`, as `modeller/tests/witness_viewer_db_export.js` does): no GPU beside the owner's live tab
without their say. Do not ask the owner to look at anything. Ask only a genuine decision, batched once at the end, each as one question.

## 0. Read first (do not re-derive what these already say)
`prompts/DXF2BIM_FOUNDATION_LANE.md` (esp. §3b GENERALITY AUDIT AND GUARDRAILS, §D37, §D43) · `prompts/DXF2BIM_USABILITY_REPORT.md` (a measured first-time-user walk: actions, decisions,
human seconds: your baseline, do not redo it, extend it) · `prompts/DXF2BIM_MODELLER_LANE.md` · `prompts/DXF2BIM_ARRANGE.md` · `prompts/DXF2BIM_EVIDENCE_TIERS.md` ·
`bim-compiler docs/DXF2BIM_SPEC.md`, `docs/DXF2BIM_BASIC_SHAPES_SPEC.md`, `docs/DXF2BIMGuide.md` (redone 2026-10-22, session 10) · `prompts/FILM_DXF2BIM_WHY_MARKINGS.md §GUIDE REDO`.

## 1. Part A: design review of the code and the functional steps
The chain: open sheets (`modeller/dxf_import_ui.js`, `dxf2bim_import.js`) -> qualify / the ONE gate (`modeller/dxf2bim/dxf2qualify.js`, `dxf2shell_config.js`) -> arrange + defaults + evidence tiers
(`dxf2defaults.js`, `dxf2suggest.js`, `dxf2prep.js`, `dxf2pair.js`, ARRANGE in `dxf_import_ui.js`) -> metadata editor (`dxf_meta_editor.js`) -> bodies / structure / panels / doors / section
(`dxf2bodies.js`, `dxf2structure.js`, `dxf2panels.js`, `dxf2doors.js`, `dxf2section.js`, `dxf2synth.js`, `dxf2typology.js`) -> Convert (`dxf2bim_import.js`) -> exports (`dxf2ifc.js`, `viewer_db_export.js`,
`dxf_export_ui.js`) and the CLI (`dxf2bim_cli.js`). Reader copies: `modeller/dxf2bim/SOURCE.md` + `sync.sh` (a verbatim copy of bim-compiler modules).
For each stage write down: its ONE owner, its inputs/outputs, what it assumes about the drawing. Then check, with file:line citations:
1. **Drift:** spec vs code (every `A`-numbered assertion in the lane specs has a witness? run `modeller/tests/witness_dxf_*.js` and read the `§` lines; list specs with no witness and witnesses that
   cannot fail); the copied reader modules vs their bim-compiler originals (diff, not memory); CLI vs UI parity (the same marked set must give the same bodies by both); two implementations of one responsibility.
2. **Hard-code that would fail another set** (unverified LEADS seen in passing, confirm or refute each, then hunt for more): `LIB_URL = 'dxf2bim/local/library_subset_duplex.json'` (Duplex-only library);
   `TYPES = { prefer: ['DUPLEX_NOMINAL'], sets: [['DUPLEX_', ...], ['US_', ...]] }` in `dxf2shell_config.js`; layer-map SETS only `DX` / `STD` (NCS/AIA); roles found from title TEXT strings
   ("Floor Plan", "North Elevation": other languages, other conventions?); unit defaults and the `$INSUNITS` path; `bodies.pair_max_width 0.5`, `panel.thickness_inherited 35`, `fan.depth 0.3`, `net.thickness 0.005`
   and the other defaulted rows (are they shed constants? who may change them? are they in the evidence list?); grid-label assumptions (A-D / 01-42, skipping I and O); the north-mirrored `H axis -X` convention;
   anything keyed on a file or sheet NAME; magic tolerances; "mm"/"in" only; 4 sheet roles only.
3. **Generalisation tests, by mutation** (spec the matrix first, then run it): take each known set (Duplex standard set, the same with marks stripped, HHS office, the shed, the Wand and Hospital sets of
   `FILM_DXF2BIM_WAND.md` / `FILM_DXF2BIM_HOSPITAL.md`) and mutate: rename every layer; scale x1000; swap units; mirror an elevation; rename and reorder sheets; drop the section; add an unknown sheet;
   shift a plan's origin; rename the grid labels. Expected behaviour is one of exactly three: **correct result**, **a red "asks" item naming the field**, or **left out and listed**. A silently wrong model is a
   defect; each needs a falsifier. Report which mutations produce which of the three.

## 2. Part B: walk `docs/DXF2BIMGuide.md` on the canvas, step by step
Execute every numbered step in the real Modeller with real clicks (the recorder `prompts/film_dxf2bim_why_rec.js` is the working driver for the shed; its stills copy is the pattern). Raw shed sheets:
`~/Videos/dxf2bim_film_work/why/raw/` (9 DXFs, private: the title block carries a client name, never print it; the canvas draws no TEXT); the CLI-marked answer set: `~/Videos/dxf2bim_film_work/why/cli/marked/`.
For EACH step record: the label exists as written; the claimed outcome is true (the numbers: blocking chip 58 -> 48 -> 45 -> **48** -> 0, 25 yellow rows, 5 second heights, 10 layer choices,
449 -> 445, 512 bodies, 4 left out); actions needed (compare with the usability report); any dead end, ambiguous message, control that is hidden or needs scrolling, state the guide does not predict.
Then try the same steps on a second set (a stripped Duplex) and say where the guide's walk-through stops being true. Re-test the reverse hand-off (Open > local .db of the exported Viewer database
brings back all 512, verified 2026-10-22 headless) and the one thing not tested: editing the reopened structure.

## 3. Part C: simplify the user experience (proposals, not code)
Goal: raw DXFs to a 3D model with the fewest decisions, never inventing. For every point where the user must act, ask: can it be READ (state the evidence), DEFAULTED (yellow, with the evidence tier), INFERRED
(orange, from geometry or a stated convention), or must it ASK (red)? Candidates to examine, not conclusions: the blocking count rising 45 -> 48 after the heights (explain it in the panel, or order the asks
so it never rises); layer meanings suggested from layer names (`Col` -> column) as yellow suggestions with evidence; a second height read from a dimension or level text the sheet already carries; one
checklist that lists the remaining asks in the order to do them with a progress count; why "Convert refused" cannot say what to do next; Undo for every stated value; saved marked copies as the default;
the set name asked once and prefilled from the file name; whether "Accept all" hides risk. Each proposal: the evidence it relies on, the action count before/after (KLM as in the usability report), the falsifier that
would show it wrong on another set, and which tier it lives in.

## 4. Deliverables (append to THIS file under `## RESULT <date>`; nothing else new)
1. **Findings table:** id · severity (P0 wrong model silently / P1 fails another set / P2 friction / P3 polish) · evidence (`§` line or file:line) · falsifier · proposed fix (one line).
2. **Spec sections** for each accepted finding, appended to `DXF2BIM_FOUNDATION_LANE.md` as new numbered sections (spec only; the owner decides what is built). Each states the witness claim FIRST.
3. **Guide corrections:** factual errors fixed in `docs/DXF2BIMGuide.md` (bim-compiler); structural changes proposed first (docs rule). The in-app overlay lives in `modeller/modeller.html initGuide()`.
4. **Mutation matrix** (Part A.3) as a table, with the witness file names you would add. Do not implement unless asked.
5. Housekeeping at the end: one-line pointer in `PROGRESS.md`; no new memory entry (findings live here); prune your own clean, pushed worktrees.

## 5. State at hand-off (verified 2026-10-22/23)
Guide redone and live in the docs source (`docs/DXF2BIMGuide.md`; the GH Pages deploy through `scripts/safe_gh_deploy.sh` is the owner's call); in-app overlay has the 2D-drawings steps (bim-ootb #2297, sw v123);
reverse hand-off verified (512 = 512, same classes); film v4 (EN) and its Malay version are done, local only (`FILM_DXF2BIM_WHY_MARKINGS.md §MALAY VERSION`; cards PR bim-compiler #237 merged); the guide is not yet deployed to GH Pages. Known limits already in the guide: component library local so
door/window fills may be 0; roof/slab estimated (amber); 4 bodies left out on the shed (no elevation / conflicting heights); door and window schedules not read.

## RESULT 2026-10-23 (session 1: stock-take + HHS round trip)

### R0. Stock-take (owner: "take a step back")
Answer given in the session (sources listed in the published stock-take page): the demand is real (small firms still mostly 2D; 2D arrives on 40-50% of projects per Bricsys, a vendor claim); the
format (several sheets read together, evidence tiers, markings stored in the DXF, IFC4 out) is a sound baseline and differs from the AI plan readers (WiseBIM / Plans2BIM, BIMify, BIMxAI:
single plan, heights by hand, accuracy self-reported 80-100%, human clean-up always); BricsCAD BIM V24 (tracing) and CYPE (licensed module) are the vector-native contenders; the open-source
community (OSArch / Bonsai / FreeCAD) has no documented DXF -> IFC path. NOT proven: generality (one raw outside set, the shed) and effort (shed 47 actions, Duplex 151, 82% doors and windows).
Owner direction (2026-10-23): while waiting for outside raw sets, run the round trip on HHS (Hospital is the wing lane's), clean to ARC/STR with clean standard markings and labels, reload it
as 2D, go through the yellow stage again, look at material and dimension assignments (they drive 4D/5D), and learn a common library reference and inference from the round trip
(Pareto: the few rules that settle most of the user's effort). Room topology comes from the Find-panel Room Injection (`viewer/lib/room_walker.js`, rule D22), owner reminder: it helps doors.

### R1. SPEC: the HHS round trip (written before any run; witness claim first)
Inputs: `/tmp/db2/HHSM2.db` = `scripts/extractIFC2DB.js --ifc opensourceBIM_HHS_Office_architect.ifc --also opensourceBIM_HHS_Office_construction.ifc` (bim-compiler, 2026-10-23: 2,811 elements,
133 doors, 112 walls, 75 slabs, 33 curtain walls, 257 columns merged, 33 IfcSpace, 0 IfcWindow); the Viewer db `buildings/HHS_Office_Federated_extracted.db` (room source, as W-ROOMS);
`/tmp/db2/DXARC.db` (Duplex, for the cross-building library test). Clean = the writer's own class filter (`std2d.js loadModel`: walls, doors, windows, slabs, roofs, footings, columns,
openings, stairs; curtain walls as their own pass); proxies (85), coverings (43), members/plates outside curtain walls are not drawn. Harness: scratchpad only, never committed;
the numbers land here.
- **RT-H1 SETS.** The writer gives HHS a marked set (`deriveMarks`, every marking `@BY=model`) and a plain set (the same sheets, no `DXF2BIM-MARK` layer), both WITH the injected rooms.
  Falsifier: a plain sheet holding the mark layer, sheet counts that differ, 0 room labels.
- **RT-H2 RECOVERY (the yellow stage, machine side).** The plain set through the CLI with `--accept-suggestions` only. For every marking key of the answer key (`@UNITS/VIEW/LEVEL/ROOF/FACE/
  HAXIS/CUT/Z/GRID*/LAYER/SET`): SAME (accepted value = model's within 0.01 drawing units), WRONG (a value, not the model's), MISSING (nothing offered). Issue: how much of the yellow stage
  the machine does on a clean standard set; WRONG > 0 is a defect (Accept all takes it).
- **RT-H3 RESIDUAL.** The blocking items left after acceptance, by code, and the fewest typed facts (taken from the answer key, never invented) to Convert; actions counted as in the usability report.
- **RT-H4 DOORS x ROOMS.** Per model door (133): its width, height, type (`element_type`), and the two rooms it joins (the rooms whose rects contain the door centre moved 0.5 m along
  +/- the wall normal; IfcSpace rects of room_walker). Measured: distinct types; share of doors covered by the top-k (width -> type) rules vs the top-k (width, room-pair kind) rules;
  doors with 0 / 1 / 2 rooms. Issue: does room topology settle door decisions beyond width alone? Falsifier: room pair adds no prediction over width (then say so: rooms help placement,
  not typing).
- **RT-H5 MATERIAL / DIMENSION.** Source truth = the IFC's material layer sets and quantity sets (architect IFC: 175 material associations, 2,087 element quantities). For walls, slabs, doors:
  model value vs what the round-tripped model carries (thickness, height, width, material name, quantity); which of them reach the 4D/5D path (code path traced, file:line). Issue: is
  the 3D-from-2D model good enough for quantities, or does the 5D bill rest on defaults?
- **RT-H6 LIBRARY (Pareto).** A reference table learned from a model: wall thickness -> wall type + material layers; door leaf width -> door type + height; slab thickness -> slab type.
  Learned on Duplex, applied to HHS (and the reverse): hit rate per decision class. Issue: can a library from known models answer a raw set's asks as yellow suggestions with evidence
  ("seen in N models")? Falsifier: hit rate near 0 across buildings (then the library is per firm, not common).

### R2. MEASURED (2026-10-23, worktree of `origin/main` at `f0bca680`; harness in the session scratchpad, not committed: `rt_sets.js`, `rt_ladder.js`, `rt_doors.js`, `rt_truth.js`)
**RT-H1 SETS: PASS.** HHS: 9 sheets, marked = 673 markings all `@BY=model`, plain = 0 sheets with the mark layer, 73 rooms labelled from room_walker (96 rects, 11 named, 62 compiled).
Duplex: 8 sheets, 148 markings (no Viewer db for rooms). Answer-key make-up, HHS: `@WALLTOP` 268, `@TAG` 133, grids 160 (`GRIDH` 73, `GRIDY` 45, `GRIDX` 42), `@Z` 25, `@SCHEDULE` 16,
sheet-level 71 (`SET/VIEW/UNITS/NAME/LAYER` 9 each, `ROOF` 6, `HAXIS` 5, `LEVEL` 4, `FACE` 4, `WALLMIN` 3, `DEFAULT` 3, `CUT` 1).

**RT-H2 RECOVERY (Accept all on the plain set; SAME / WRONG / MISSING vs the key, values and positions to 0.01 drawing units).**
| Step | HHS | Duplex |
|---|---|---|
| 0 plain + Accept all | 29 accepted; roles 1 / 9; REFUSED: 8 sheets "markings name no role" | 18 accepted; roles 1 / 8; refused the same way |
| 1 + the role picks (8 `@VIEW`, `@SET`) | 172 accepted; SAME 167 (`UNITS` 9, `FACE` 4, `HAXIS` 5, `Z` 25 / 25, `GRIDH` 57 / 73, `GRIDY` 39 / 45, `GRIDX` 27 / 42); **WRONG 5**: `@LEVEL=0` on all 3 plans (model 0.094 / 3.8 / 7.3), `@CUT=Y,-12694.7` (model `X,-8682.15`), `@NAME` = the whole title with its scale | 74 accepted; **WRONG 3**: `@LEVEL=0` on plan 2 (model 3.1), `@CUT=Y,-17591.5` (model `X,2304.25`), `@NAME` |
| 2 + every missing / wrong sheet-level key | 52 statements: blocked 487 (`no_elevation_height` 366, `no_host_cut` 116, 5 singles). Not needed: `@NAME` (9) and `@DEFAULT` (3) give the same verdict when left out; needed: `@LAYER` (without: `QF:layer_unmapped` 9 + `slab_no_exterior_wall` 4), `@WALLMIN` (without: `wall_below_min_thickness` 5) | 32 statements: refused, plan 1 "missing LEVEL" (stating plan 2's level removed plan 1's `PR-LEVEL` default, D37 by design) |
| 3 + every missing element-level key (= the whole key) | 506 statements: blocked 166 = `lod400_library_unreachable` 71 + `no_host_cut` 45 (library-bound) + `door_no_strip` 30 + `opening_outside_wall` 14 + 6 singles: the known HHS engine state (FOUNDATION lane: 169, the doors hinged 43 mm off their partition) | 78 statements: blocked 36, all `lod400_library_unreachable` (no library in Node) |
Of the 506 HHS statements, `@WALLTOP` (268) + `@TAG` (133) = 401 = **79%**.

**RT-H3 / Pareto, per rule (each measured on both sets).**
- *Wall tops.* HHS: 220 of 268 (82%) are `next level - 0.300`, the slab of the section (3.5 -> 3.8); 16 more at 0.400; 31 run past one storey. Duplex (10): 5 at the next level, 3 at `next - 0.305`,
  2 on the top storey: no single relation (50%).
- *Doors.* Leaf width -> type: purity **1.000** on both (HHS 10 widths = 10 types, 87 doors at 885 mm; Duplex 4 = 4). The key's `@SCHEDULE` is per sheet (HHS 16 rows for 10 types).
- *Titles and level texts the sheets already carry, unread:* `LEVEL 2 PLAN (FFL +3.800)  1:100`, `FRONT ELEVATION  1:100`, `ROOF PLAN - ROOF LEVEL (+10.900)  1:100`, `T/ROOF +10.695` (every
  elevation and the section), `SECTION A-A AT X=-8682.15  1:100`. Read, they give every `@VIEW`, `@LEVEL`, `@ROOF` and `@CUT` of the key on both sets (HHS 19 statements, Duplex 17) and remove all 4 / 2 wrong values.

**RT-H4 DOORS x ROOMS (owner: "did you use the Room Injection, it will help doors").** Rooms on both sides of the door (centre +/- 0.6 m along the wall normal): 25 of 133 doors; one side 70;
none 38 (1.0 m: 25 / 72 / 36). Room pair (hub = a room with >= 4 doors / room / outside) -> type: purity 0.759; width + room pair: 1.000, the same as width alone. **Measured answer: on HHS the
injected rooms do not settle door TYPES (width does) and cover a door on both sides only 19% of the time.** Where they do help: the from/to columns of a door schedule, floor areas and
finishes per room (5D), and a check on the slab (below).

**RT-H5 MATERIAL / DIMENSION (truth = the architect IFC's own layer sets and quantity sets, web-ifc).**
- *Thickness: read correctly.* The round-trip walls carry exactly the model's thickness set: 115 mm (202 pieces), 175 (61), 50 (21), 300 (3).
- *Material: absent.* 112 / 112 model walls carry a layer set (`Mauerwerk - Ziegel` 115 / 175, `Stahlbeton - Ortbeton` 300, `WC Trennwand` 50, `Mauerwerk - Lamellen` 115); thickness -> material
  purity 0.938 (115 mm is shared by Ziegel 62 and Lamellen 7). The standard path builds its elements with no material (`dxf2bim_import.js:424-440`); only the structure path gets one, a constant
  per class (`dxf2bill.js:62-66`, `synthetic_ref.json`). The library's `ad_wall_type.material_primary` is dropped at export (`bim-compiler scripts/export_library_subset.js:41`: `wall_type_id, total_mm` only).
- *Curtain walls: wrong class.* Layer `A-WALL-CURT` (`elevwall`) comes back as solid `IfcWall`: 68 pieces, **721.2 m3**, more than twice the 303.7 m3 of all masonry and concrete walls.
  The model has 33 `IfcCurtainWall`.
- *Slabs: wrong area, silently.* `dxf2shell.js:55-84` (`innerRing`, "rectangular envelope only") gives every storey the rectangle inside the outermost walls: 3 x 65.5 x 53.3 m = 10,473 m2,
  2,094 m3. The model's 150 mm floor slabs total 3,975 m2, 596 m3: 2.6x the area, 3.5x the volume, no gap raised. The injected rooms total 2,852 m2 (72% of the slabs: corridors and walls not in rooms).
- *Wall length:* 755.9 m of pieces (net of openings) against the model's 821.7 m gross. Not a parity claim.
- *What 4D / 5D read:* the Viewer's cost panel prices class rate x bbox volume (`viewer/cost_panel.js:14-22, 81-86`: IfcWall 250 / m3, IfcSlab 200), so a round-tripped HHS is priced on the
  wrong slab and curtain-wall volumes. The CLI's bill (`dxf2bill.js`, rate pack `cidb2024_my`) never reaches the db. A DXF2BIM db has no tasks (the schedule tables are filled only from
  IfcWorkSchedule); 4D sequences by `ifc_class`, so the curtain-wall class error also moves those elements in the sequence.

**RT-H6 LIBRARY ACROSS BUILDINGS: the falsifier holds.** No door width is shared within 1 mm (HHS 760 / 885 / 910 / 1010 / 1085 / 1921 / 1990 / 2062 / 2140 / 2490; Duplex 762 / 813 / 864 / 1250)
and no type name is shared. Door height is 2260 on HHS (99 of 133) and 2032 on Duplex. A TYPE library learned on one building answers nothing on the other. The RULES transfer: width -> type within
a set is 1.000 on both. So the common library is of conventions, and the type and material catalogue is per firm or region.

### R3. FINDINGS
| id | sev | finding | evidence | falsifier | fix (one line) |
|---|---|---|---|---|---|
| F1 | P0 | Slab = rectangle inside the outermost walls on a non-rectangular plan, no gap | `dxf2shell.js:55-84`; HHS 10,473 vs 3,975 m2 | any L / U / courtyard plan: slab area > wall-enclosed area | slab from the enclosed polygon; meanwhile `GAP:slab_not_rectangular` when the rectangle exceeds the enclosure |
| F2 | P0 | Curtain-wall layer read as solid IfcWall | HHS 68 pieces, 721.2 m3 on `A-WALL-CURT` | volume of `elevwall` pieces vs their elevation's glazing | `elevwall` / curtain layer -> `IfcCurtainWall`, area quantity |
| F3 | P1 | Our own standard titles get no role (trailing scale) | `dxf2suggest.js:147`; HHS 8 / 9, Duplex 7 / 8 | a title `X PLAN  1:100` -> role | strip `\s+1:\d+$` before the title rule (= usability P6, open) |
| F4 | P1 | `PR-LEVEL` writes `@LEVEL=0` on every plan when the titles are unread | `dxf2suggest.js:129-140`; HHS 3 wrong, Duplex 1; `\bLEVEL` misses `FLOOR_LEVEL_1` (`_` is a word character) | plans whose title carries `(FFL +n)` | read `(FFL n)` / `LEVEL n` as yellow `@LEVEL`; `[_\W]` boundary |
| F5 | P1 | `PR-CUT` takes grid bubble A for the section label | 2 / 2 sets again (= usability P3, open); caught only by `MARK:axis_cut` | section title `AT X=n` | read the cut from the title first |
| F6 | P1 | No material on the standard path; library material dropped | `dxf2bim_import.js:424-440`, `export_library_subset.js:41` | thickness -> material on a model with layer sets (HHS 0.938) | material by thickness from the firm's catalogue, yellow, with count |
| F7 | P2 | 268 per-wall `@WALLTOP` | RT-H3 | a set where the measured walls disagree (Duplex 50%) must abstain | the self-calibrated wall top (R4.1) |
| F8 | P2 | 133 per-door `@TAG`; schedule per sheet (16 rows for 10 types) | RT-H3 / RT-H4 | two types of one width = refused, listed | bulk by width (= usability P1) + one schedule per set |
| F9 | P2 | `@ROOF` typed 6 times; `T/ROOF +n` text on every sheet unread | plain sheets | a sheet with two `T/ROOF` values = refused | read `T/ROOF` / `ROOF LEVEL (+n)` (= usability P5) |
| F10 | P2 | 37 grid lines not offered after Accept all (`GRIDH` 16, `GRIDX` 15, `GRIDY` 6) | RT-H2 step 1 | | not investigated: next session |
| F11 | P2 | The plain standard set carries no door tags and no schedule table, so the yellow stage is never tested on reading them | plain sheets: 0 occurrences of `88.5 x 2.26` | | the writer draws CAD door tags + a schedule table as ordinary text; a reader rule reads them (READ tier) |
| F12 | P3 | `PR-NAME` takes the whole title with its scale | RT-H2 | | strip the scale (same as F3) |

### R4. PROPOSALS (spec only; the owner decides what is built)
1. **The drawing teaches its own convention (self-calibrated defaults).** For an element the drawing does not measure (an interior wall on no elevation), take the relation the measured elements of THE SAME
   SET show (wall top = next level - the section's slab); offer it INFERRED (orange) with the evidence "k of n measured walls agree", and abstain below a stated agreement (proposed 80%).
   Witness claim first: HHS `@WALLTOP` 268 -> 48 asks (220 inferred, each equal to the model's to 0.001 m); Duplex abstains (50%), 0 wrong. The same shape later for door height, sill height and slab thickness.
2. **Decide per group, not per element.** Doors by leaf width (purity 1.000 on both sets), one schedule per set: HHS 133 tags + 16 rows -> 10 rows; Duplex 24 + 11 -> 4. A width shared by two rows = refused, listed.
3. **Read what the sheets already say.** One title / level-text reader: role, `(FFL n)`, `ROOF LEVEL (+n)`, `T/ROOF +n`, `AT X=n` (READ tier, the text shown): HHS 19 asks -> 0, 4 wrong values removed; Duplex 17 -> 0, 2 removed.
   Other languages and conventions are refused and listed, as today.
4. **Your last job is your library.** A firm's own past model (or a set it already converted) round-trips into its catalogue: thickness -> wall type + material layers (HHS 0.938; an ambiguous thickness
   = a yellow choice listing the candidates with their counts), width -> door type + height. RT-H6 shows this catalogue is per firm, not common; the common part is rules 1-3.
5. **Quantities that 5D can trust:** F1 + F2 first; then pass each element's reader quantities (length / area / volume, from the true outline, not the bbox) into the Viewer db for the cost panel; rooms
   (room_walker) give floor finishes per room and the check rooms <= slab <= enclosure.
**Effect on HHS (counted from R2; actions as statements, the page's pooled `@LAYER` and set-wide `@SET` counted once):** 506 -> about 102 (-80%): `@WALLTOP` -220, `@TAG` -133, schedule -6, titles -19,
`@NAME` / `@DEFAULT` not needed -12, `@SET` -8, `@LAYER` -6. Left: 48 wall tops, 10 schedule rows, 37 grid lines (F10), 3 layer kinds, 3 `@WALLMIN`, 1 set name. With F10 and F11: about 55.

### R5. NEXT
Build order proposed: F1 + F2 (silent 5D errors) -> R4.3 (F3 / F4 / F5 / F9: one reader) -> R4.2 -> R4.1 -> F10 -> R4.4. Parts A.1-A.3 (drift, hard-code hunt, mutation matrix) and B (guide walk)
of this brief are still open; this session did not run them. Every proposal keeps the three outcomes: correct, a red ask naming the field, or left out and listed.

## RESULT 2026-10-23 (session 1, part 2: built "as laid out", owner: "Proceed as you laid out")
Built, each spec'd first in `DXF2BIM_FOUNDATION_LANE.md` with its witness claim, measured on Duplex / HHS / Clinic (+ LTU for D44/D45, the raw shed where it applies):
| Item | Rule | Witness | Effect measured |
|---|---|---|---|
| F1 | §D44 no rectangle slab the walls do not draw (left out and listed) | W-SLAB-OUTLINE | HHS 10,473 m2 of invented slab -> 0 + 3 advisories; Clinic 2, LTU 1; Duplex byte-identical (#2302) |
| F2 | §D45 curtain band = IfcCurtainWall, billed per m2 | W-CURTAIN | HHS 68 pieces (721 m3 of "masonry") -> IfcCurtainWall, 750 / M2 (#2302) |
| F3 F4 F5 F9 F12 | §D46 read titles and level texts (role from the title core, PR-LEVEL-TITLE, PR-ROOF, PR-CUT-TITLE) | W-TITLE | plain sets: roles HHS 1 -> 9 / 9, Duplex 1 -> 8 / 8; every level / roof / cut = the model's, 0 wrong (were 4 / 2 wrong); raw shed unchanged |
| F8 | §D47 tag doors by width, one row per schedule mark (PR-TAG-WIDTH) | W-TAG-WIDTH | Duplex 14 tags in 4 clicks (page); HHS 86 proposed, 0 wrong; Clinic 234 refused (types share a width): listed |
| F10 | §D48 two-character grid labels; the label on the line wins | W-GRID-LABEL | HHS grids 123 -> 160 / 160, Clinic 290 / 290, 0 wrong; raw shed unchanged |
**Statements to the full answer key after D46 + D48 (R2 accounting, ladder re-run):** HHS 506 -> 438 (titles 19, grids 37, NAME / DEFAULT not needed 12); Duplex 78 -> 53. With D47 the 133 / 24
per-door tags become one click per schedule row (HHS 10 rows, Duplex 4), so the per-door work goes to the rows plus the doors width cannot decide.
**R4.1 (self-calibrated wall tops) NOT BUILT: its premise is refuted by measurement.** With the key's `@WALLTOP` removed, the walls that get a height from the drawing are the exterior ones on the
elevations (HHS 38, Duplex 26), and their tops sit AT the next level (HHS 28 of 38 at 0.000, 10 at 0.300) while the interior walls the key states stop 0.300 below it (HHS 220 of 268). A rule
learned from the measured walls would put most HHS interior walls 0.3 m too high. The per-storey group decision already exists in the editor ("Interior walls run to the slab above", one tick
per plan, `@WALLTOP=<level>,slab_above`), so the 268 per-wall statements overstate the user's effort; what is missing is only that the tick is not OFFERED. Proposal (not built): offer it as an
inferred row per plan when that plan has walls with no elevation height and the section states the slab above, naming how many walls it covers. On HHS it would set Level 2 and 3 interior walls to
the model's tops (106 walls) and Level 1 to 3.8 against the model's 3.5 (the model's walls stop at a ceiling the drawings do not show): the user still states that one number.
**R4.4 "your last job is your library" (spec only, §D49 to be written when the owner says go).** A firm's own model (IFC or extracted db) -> `catalogue.json`: wall thickness -> {type, material
layers, count}, door leaf width -> {type, height, count}, slab thickness -> material. Read as yellow suggestions with "seen n times in <catalogue>"; a thickness with two materials = a choice
listing both with counts. Measured basis: HHS thickness -> material 0.938 (115 mm Ziegel 62 / Lamellen 7); across buildings 0 (RT-H6), so the catalogue is the firm's, the rules are common.
Witness claim to write first: learned on HHS Level 1-2 walls, applied to Level 3: hit rate; learned on Duplex, applied to HHS: 0 (the falsifier that keeps it per firm).
**Found on the way (open):** F13 `modeller/dxf2bim/SOURCE.md` says the reader modules are verbatim copies of bim-compiler that must not be edited here, but since F8 (#2271 / #2276 / #2280) and
now D44-D48 they are edited here and bim-compiler master is behind (`dxf2shell.js`, `dxf2bim.js`, `dxf2shell_config.js`, `std2d.js` differ): one source must be named (owner decision).
F14 `bridgeOpenings` bridges the whole gap between two wall pieces when an opening sits in it (Duplex control: a missing wall next to a door became an 11.6 m bridge); a bridge longer than
`gap_max` should be a gap. F15 the slab outline is a fact the plans must state: the writer draws no slab edge on the plans, so a non-rectangular building has no slab after D44 until the writer
draws one (a slab-edge layer) and the reader reads it.

## RESULT 2026-10-23 (session 1, part 3: owner "edit in bim-ootb; proceed with the proposals; best-effort defaults editable in JSON; tune on other buildings, the original JKR model")
F13 decided: `modeller/dxf2bim/` is edited in bim-ootb (`SOURCE.md`; `sync.sh` refuses the old direction). New building: JKR (IFC4 ARC + STR, Malay storey names, survey coordinates ~271 / 721 km, two
storeys 0.2 m apart, windows drawn as separate parts). Built, each spec'd first in `DXF2BIM_FOUNDATION_LANE.md`:
| Rule | What | Measured |
|---|---|---|
| §D50 | a storey with no floor of its own has no plan (absorbed by the next) | JKR 902 -> 343; other buildings byte-identical (#2304) |
| §D51 | best-effort slab over the area the walls bound (amber; `slab.outline_when_not_rect`) | HHS 0 -> 3 slabs, 3,590 m2 vs the model's 3,975; LTU 0 -> 1 (#2305) |
| §D52 | no bridge longer than an opening gap | Clinic 6 and LTU 20 invented lintels (up to 101.85 m) gone, listed (#2305) |
| §D53 | best-effort materials (reference by class) + a firm catalogue by thickness (`tools/catalogue_from_ifc.js`) | one-material thicknesses = the model's 100% (HHS, JKR, LTU); a foreign firm's catalogue 0% right (#2305) |
| §D54 | walls no elevation shows run to the slab above, by default (`wall.top_when_unseen`) | HHS asks 251 -> 1, Duplex 44 -> 0, JKR 510 -> 281; exact on HHS L2 / L3, 0.05-0.30 m off elsewhere |
| §D55 / D55b | a window drawn as parts is one window; a window reaching into its jambs is bounded by them | JKR windows read 6 -> 48 of 48; JKR 343 -> 191 |
**JKR now:** plain set, Accept all alone: roles 9 / 9, every level / roof / cut / grid / datum = the model's; the full model key reads to 191 blocking (902 before D50), of them 118 library-bound
(no library in Node) and 73 engine items (545 before). Still per-element on JKR: window tags (48; a PR-TAG-WIDTH for windows is the next rule, as D47 for doors) and the Level 1 wall tops (the
slab underside above Level 1 is not stated by the section: `slab_no_underside`). Open: the JKR `opening_outside_wall` 31 (doors / windows taller than their wall's band), the section-slab
conflicts at 81.18 / 81.19 and 84.48 / 84.49 (two slab tops 10 mm apart on one level).
