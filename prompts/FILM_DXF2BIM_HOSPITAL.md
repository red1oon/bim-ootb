# ⚠ DO NOT REMOVE
SCOPE: DRAFT storyboard + spec for the second DXF2BIM film, "A hospital as a series of drawings: split it, check it, put it back" (user 2026-10-17: "the next big one is the Hospital, shows a timer clock alongside to indicate how long things run").
The first film (Duplex, `FILM_DXF2BIM_EN.md`) showed one small building through the whole round trip; this one shows SCALE and the series.
Read the logs after every run (recorder `film.log`, page log, witness logs): exit code is not evidence. Every spoken number comes from a § line of THIS run or a named facts/ log line. No "first", no "only". Neutral naming: no client name anywhere; the Hospital is the repository's open sample set (architect + structure IFC). Media and DB files stay local (`~/Videos/dxf2bim_film_work/`); the repo gets the TSV, the recorder, the facts mapping.
Status: DRAFT. Not recorded. Items marked [RESULT?] depend on a run that has to be repeated fresh before the take.

# §FILM-DXF2BIM-HOSPITAL — spec (2026-10-17, written before any recorder)

## The clock (what it is, what it is not)
- A REAL clock, not an overlay: the Export panel header shows elapsed time with a clock icon (`dxf_export_ui.js`, W-E2E-DXF-EXPORT D8), a per-step list (Reading / Extracting / Drawing / Markings, each in ms) and the time of the last action (Suggest, merge, split + redraw).
- The browser runs one thread: during a synchronous step the clock cannot tick, so the film shows the step list (exact milliseconds) as the proof and the header clock between steps. It never fakes a smooth count.
- The extraction (the slow part, 9 min 24 s and 1.8 GB on Node) is shown in a terminal with `time` and the real elapsed clock burned into the frames of the time-lapse; the speed-up factor is on screen ("x40") and the clock is the real one. The Modeller then opens the finished `.db` (§L5.9): the film says so in words.

## Sources (read first)
- Lane: bim-ootb `prompts/DXF2BIM_MODELLER_LANE.md` §L1.7-L1.14 (writer rules), §L5 (export), §L6 (scoped sets). BIMCompiler PRs #200-#203, bim-ootb #2085-#2093.
- Facts chain (re-run fresh before the take; every log to `~/Videos/dxf2bim_film_work/facts_hospital/`, mapped in `film_dxf2bim_hospital_facts.md`):
  `scripts/extractIFC2DB.js --ifc Hospital_IFC2x3_ARC.ifc --also Hospital_IFC2x3_STR.ifc -o HOSP.db` (`time`, `§ELEMENT_PARTS`, `§MERGE`, `§GEOM_EMPTY`) →
  `witness_std2d_set.js HOSP.db` (W-LOG/W-ENT Python == JS) → `witness_grid_primary.js` → `witness_scopes.js HOSP.db` (partition, assemble) →
  `witness_dxf_scopes_merge.js HOSP.db HOSP 250` (M1-M3, C1-C5) → `witness_e2e_dxf_export.js` (D1-D8, Duplex) → a Hospital panel run through the real Chrome (`/tmp/hosp_e2e.js` pattern: report ms, suggest ms).

## Picture (one recorder, CPU SwiftShader, 1920x1080; pages switch only under a card)
| # | beat | on screen | issue it would expose |
|---|---|---|---|
| 0 | c1 | title card; one sentence of what a drawing set is for a hospital | — |
| 1 | h01 | the Hospital in 3D in the Modeller (resident), stepped orbit; element count from the page | film claims a model the page did not load |
| 2 | x01-x02 | terminal: the real extraction with `time`, burned-in real clock, "x40" label; the §ELEMENT_PARTS / §MERGE / §GEOM_EMPTY lines scroll; ends `9:24` + 1.8 GB | a number that is not the run's (every figure read from the log) |
| 3 | e01-e02 | Modeller: Export > 2D drawings, pick the `.db`; panel clock + step list; the drawable report rows (8 plans, 1440 walls, 604 columns, grid 128 -> 38 x 39 primary lines, roof from the roof element) | report that differs from the writer's log |
| 4 | g01 | the grid in words: "no IfcGrid in any of the five models, so it is derived; at this size 128 lines a side would not fit a 1:100 sheet: lines carried by at least three elements, or on the exterior, stay" (the §GRID_PRIMARY line) | a rule described that is not the code's |
| 5 | w01-w03 | Sheets: budget 250, **Suggest a split**: 4 wings, counts per wing, the action clock (0.7 s); the user merges two wings, splits one at a grid line, each with its redraw time | a split that is not a partition (D7: merge/split keep one) |
| 6 | k01-k02 | the zip's list: 8 KEY sheets + wing sheets + whole-building sheets, only .dxf; a KEY sheet and a wing sheet rendered from the DXF (ezdxf): grid on both, match lines "MATCH LINE - SEE ...", the wing's owned elements highlighted by handle | overlay not in the drawing (each overlay item is a DXF entity) |
| 7 | a01-a02 | assemble back: import the zip; "44 sheets -> 14", scope checks 0 blocking, same roles as the unscoped set (W-L6-MERGE M2); the clock | "reassembled" claimed without the check |
| 8 | v01 | what the Hospital converts to today [RESULT?]: the importer's refusal or verdict, read from the page (before the curtain-wall rules: "Level 2 is not a drawn elevation boundary"); the Duplex (film 1) is the full round trip | a conversion implied that did not run |
| 9 | l01-l02 | limits card: curtain-wall doors/glass partitions the reader cannot classify (374 pieces on HHS), 345 of 440 door swings from the IFC convention not the mesh, roof outline from the top slab, no GPU, extraction not in the browser (9.5 min) | an unstated limit |
| 10 | n01, end | next (the reader for glass partitions; elevation scopes), credits | — |

## Finding that changes the story (2026-10-17, lane §L1.15, measured on the filming data)
All 1440 Hospital walls are non-orthogonal (several wings at several angles); wall-based grid, host and opening-gap rules do not apply to them. The beats that rest on those rules (the "derived from load-bearing walls" grid, the door symbols on walls) must be reworded: the Hospital's grid is from its 604 columns (21 x 24 after the curtain-wall rules, 128 x 128 before the primary-line rule); walls are drawn as true polygons, not gridded; 505 openings have no gap. Beats 3-4 keep the column grid, 6-7 (series + assemble back) are unaffected, beat 9 (limits) names it first. Until §L1.15 is decided the film does not show the Hospital's wall plans as "complete".

## Honest framing (decisions recorded before the take)
- Hospital to 3D is NOT claimed. Whole-building import of the Hospital is refused the same way with or without the split; the film shows that equality (the split changes nothing) and names the next cause.
- Numbers on screen are the run's: elements, walls, doors, windows, columns, grid before/after, wings, per-wing counts, ms per step. No rounding up.
- The split is a partition by grid line chosen by a stated rule (budget, median element centre, nearest grid line); the user can change it; a KEY sheet carries the grid, dimensions and every marking.

## Acceptance (FILM_PLAN §7 + the user's list)
§NARR_FIT all DETAIL, 0 SHORT/SKIP; §NARR_TONE 0 WRONG; frames == silent master; -16 to -17 LUFS; longest silence (silencedetect -40 dB, 2 s) <= ~7 s; no hard screen change < 1.5 s apart; 0 black frames; contact sheet read frame by frame (clock legible, no toast over content); grep of subtitles + card text for client names / "first" / "only" = 0; every on-screen time traces to a log line.

## Open before recording
1. Fresh Hospital facts run (extraction 9:24 re-timed on the filming machine; the clock burned in from THAT run).
2. [RESULT?] the Hospital importer result after the curtain-wall rules (§L1.14).
3. Spoken script TSV (`film_narration_dxf2bim_hospital_en.tsv`, same format as film 1) after the facts are fixed.
4. Decide with the user: Malay track, music bed, whether the extraction time-lapse is on screen or a card.
