# ⚠ DO NOT REMOVE
SCOPE: spec + storyboard of the film "One wing, out of the 3D: 2D sheets from a hospital model" (owner 2026-10-21: "a dedicated film showing that off first, how a load Hospital navigate to a wing to do the successful 2D render export"). The Viewer's 2D wand (lane `prompts/DXF2BIM_FOUNDATION_LANE.md` §F7) on the Hospital, live data. Read the logs after every run (recorder `film.log`, the page's `§WING2D_*` lines): exit code is not evidence. Every number on screen or spoken comes from a § line of THIS take (`§FILM_FACT`). Plain tone: no "first", "only", "novel" (prior-art search is not done, lane §F7), no superlatives; limits are shown as plainly as features. Neutral naming: the Hospital is the repository's open sample set (architecture + structure IFC); no client or sponsor name. Media stay local (`~/Videos/dxf2bim_film_work/wand/`); the repo gets this spec, the recorder, the TSV.
Status: SPEC (2026-10-21). Not recorded.

## What the film proves (and the issue each beat would expose)
The person loads a large hospital model in the Viewer, finds a wing that stands at its own angle, lays the 2D plane on it, and gets that wing's drawing set (plans, key sheet, elevations, section, roof) as DXF, turned to the wing, stamped with its frame, without cutting the 3D.

| # | beat | on screen (real clicks / drags in the live Viewer) | fact shown / spoken (source line) | issue it would expose |
|---|---|---|---|---|
| 0 | c1 | chapter card 1 LOAD | — | — |
| 1 | h01 | the Hospital streams in from the live bucket; status reaches DONE; a slow orbit around the building | elements loaded, seconds to DONE (page status + §-lines) | a model the page did not load |
| 2 | c2 / s01 | chapter card 2 THE PLANE; Section Cut opens, mode `2D`: a standing plane appears, NOTHING is cut | the wall directions read from the model: 85 / 10 / 70 / 3 / 2 / 78 deg (`wing2dState().fam`) | a plane that clips the model |
| 3 | s02 | the camera moves over the north-west wing; the plane is dragged onto it, then one edge handle is dragged to turn it; it snaps to 70 deg; the panel's live count of framed walls rises | turn, length, walls framed (`§WING2D_PLANE`) | a snap the model does not have |
| 4 | c3 / x01 | chapter card 3 THE SHEETS; `2D` pressed; the layout lifts out of the building as a card | sheets, writer gaps, ms of sidecar fetch / export (`§WING2D_SIDECAR`, `§WING2D_EXPORT`) | a time that is not the run's |
| 5 | x02 | click: the card fills the canvas; tabs walked: the plane's plan scope, KEY, an elevation, the section at the plane, the roof; zoom + pan on the plan | per sheet: entities drawn == the DXF's (`overlay.drawn.stats`), north arrow 5 deg `ifc_truenorth` (`§WING2D_NORTH`) | a drawing that is not the writer's output |
| 6 | x03 | Save: the card flies to the pill area; the zip's file list (from the download, listed on a card) | file names + @FRAME line read from the saved zip | a saved set that differs from what was shown |
| 7 | c4 / l01 | chapter card 4 LIMITS, then a plain limits card | the wing elevation draws only walls flush with its envelope face; room names are not drawn (the rooms are computed, not named); measured on a desktop, not a phone; the reader's gap count of this wing stated as a number | an unstated limit |
| 8 | end | credits (voices, script, data source) | — | — |

## How it is recorded
- Recorder `prompts/film_dxf2bim_wand_rec.js`, same anatomy as `film_dxf2bim_shed_rec.js`: puppeteer, CDP screencast frames with their own timestamps, `§FILM_CHAPTER` / `§FILM_BEAT` / `§FILM_FACT` lines, one backdrop still per chapter. 1920 x 1080. The Viewer page is the LIVE one (`https://red1oon.github.io/bim-ootb/viewer/viewer.html?db=<OCI>/buildings/Hospital_extracted.db`), so the film shows what a person gets today.
- Drags are real pointer events on the plane and its handles (projected from `APP._wing2d.parts`), never `wing2dSet`; the camera moves with the orbit controls (pointer drags / wheel), stepped so software GL keeps up.
- Narration: TSV `prompts/film_narration_dxf2bim_wand_en.tsv` (same columns as the BricsCAD film: id, lang, source, SHORT, DETAIL, two voices F / M), fitted and muxed with the compiler's `film_narration_poly.py` / `film_narration_mux.py`; chapter cards from `film_title_cards.py` with `FILM_SET=wand`; music bed `film_music_bed.py`.

## Acceptance
0 page errors in the take; every `§FILM_FACT` the narration quotes is present in `film.log`; §NARR_FIT all DETAIL or SHORT, 0 SKIP; frames == silent master; -16 to -17 LUFS; no black frames; a contact sheet read frame by frame (the plane visible on the wing, the card legible, no toast over the drawing); grep of subtitles and card text for client names / "first" / "only" / "novel" = 0.
