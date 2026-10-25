# ⚠ DO NOT REMOVE
SCOPE: a measured first-time-user walk of DXF2BIM in the real Modeller (owner 2026-10-22: "concerned about usability, whether the so-called yellow marking suggestions listing and the datums I see on the film is something practical or tedious ... while thinking the user POV steps thru, we may discover efficiency"). This file holds the numbers of the walk, a practical / tedious verdict per task and a ranked list of efficiency proposals, each a short spec for the owner to approve. NO product code was changed by this work. The user manual is NOT here: it is the compiler's `docs/DXF2BIMGuide.md` §3 (3a-3e) + "If something goes wrong" (BIMCompiler PR, same day), linked from `docs/ModellerGuide.md`. Read the log after every run (exit code is not evidence). Every number below comes from the walk's page log, its result JSON or a file it wrote; human seconds are an ESTIMATE (method stated), not a stopwatch. Neutral naming: the shed set is "a common BricsCAD drawing set"; its sheets are private local material, not in the repo, and no frame of them was published.

## 1. How the walk was done
- Real Modeller, `modeller/modeller.html` from a worktree of `origin/main` at `09acbbfa`, served on :8196, headless Chromium on the GPU (the launch flags of `tests/wing_2d_browser.js`), 1600 x 1000 viewport. Driven by real clicks, selects and key presses through Playwright (file chooser, `selectOption`, `click`, `keyboard.type`, canvas `mouse.click`); the page's own state was read only to count and to find where to click on the canvas. Scripts and screenshots: scratchpad only (not committed).
- Inputs:
  - **Duplex** (small, 2 storeys): the standard set written by our writer from `/tmp/db2/DXARC.db` (`std2d.writeStdSet`), the `DXF2BIM-MARK` layer stripped: 8 sheets, 0 markings. The same set with the model's markings (`std2d_marks.deriveMarks`) is the answer key.
  - **HHS office** (bigger, 3 storeys): same, from `/tmp/db2/HHSM2.db`: 9 sheets, 0 markings.
  - **Shed** (the film's set): the nine raw sheets of a common BricsCAD drawing set (no markings), with the facts the film states (the CLI line `ALLARGS` of `witness_dxf_cli.js` C31 / `film_dxf2bim_shed_rec.js`).
- Tasks: T1 open a plain set to a verdict; T2 the yellow list; T3 the sheet facts and datums; T4 clear the blocking items; T5 convert; T6 export.
- Counting: an **action** = one click, one dropdown choice, one typed value (field click + typing + Tab) or one canvas click. A **decision** = an action whose value the user must judge or know. **Human seconds** = Keystroke-Level Model estimate (Card, Moran and Newell 1983 operators: point and click 1.2 s, think 1.35 s per decision, 0.28 s per typed character, a dropdown 2.4 s), plus the measured machine wait; reading a yellow row is counted at 2 s when the user reads the list. Machine ms are measured in the page.

## 2. Measured table

| Set | Task | Actions | Decisions | Typed values | Machine time | Human time (estimate) | Result |
|---|---|---|---|---|---|---|---|
| Duplex (8 sheets) | T1 open | 3 | 0 | 0 | 0.24 s to verdict | 5 s | Blocked 31, 10 yellow |
| | T2 yellow list | 4 Accept-all (+1 scroll of about 1,200 px) | 4 (+1 wrong row to catch) | 0 | 3.8 s | 12 s blind, 154 s if the 71 rows are read | 71 rows in 4 rounds (10 / 49 / 7 / 5) |
| | T3 sheet facts, datums, wall tops | 20 (7 role picks, 11 typed, 2 ticks) | 20 | 11 (50 characters) | about 12 s | 76 s | sheets complete; 84 blocking, then 40 after the wall-top ticks |
| | T4 doors (14) | 83 (16 schedule, 1 tool, 56 per-door, 10 missed canvas clicks) | 18 (4 heights not in the drawing) | 12 | 45 s | 179 s | 28 door items cleared |
| | T4 stacked windows (12) | 41 (1 tool, 4 view turns, 36 per-window) | 12 (family from 37 ids) | 0 | 23 s | 111 s | 12 `fill_unbound` cleared; Qualifies, 75 advisory |
| | T5 convert | 1 | 0 | 0 | 1.24 s | 3 s | 135 inserts, 36 cuts (= witness E5) |
| | T6 export | 2 (IFC) + 1 (marked copies) | 0 | 0 | 0.40 s IFC, 4.1 s copies | 4 s | IFC 316,695 bytes: 96 walls, 14 doors, 22 windows, 2 slabs, 1 roof, 2 storeys, 36 openings; 8 separate DXF downloads |
| HHS (9 sheets) | T1 open | 3 | 0 | 0 | 0.49 s | 5 s | Blocked 34, 11 yellow |
| | T2 yellow list | 4 Accept-all (+1 scroll of about 4,500 px) | 4 (+1 wrong row) | 0 | in T3 | 14 s blind, 332 s read | 159 rows (11 / 135 / 8 / 5); 110 of round 2 are grid rows |
| | T3 | 23 (8 role picks, 12 typed, 3 ticks) | 23 | 12 (62 characters) | 46.4 s for T2 + T3 (verdict re-runs 2 to 3 s each) | 88 s | 248 blocking left |
| | T4 one fix: unmapped layer | 1 | 1 | 0 | 1.3 s | 4 s | `QF:layer_unmapped` 3 -> 0 (`A-DOOR-DFLT` = door) |
| | T4 doors (116, estimate at the Duplex rate) | about 512 (12 widths x 4 + 116 x 4) | 128 | 36 | not run | about 1,180 s | not run: see note |
| | T5 / T6 | not reached | | | | | the model-marked HHS set itself has 169 blocking in Node (71 library-bound, `door_no_strip` 30, `no_host_cut` 45...): a known open item of the foundation lane, not a usability one |
| Shed (9 raw sheets) | T1 open | 3 | 0 | 0 | 0.64 s | 5 s | Blocked 58, 25 yellow |
| | T2 yellow list | 5 Accept-all | 5 | 0 | 6.9 s (round 1 also took grids, ground datum, faces, cut) | 13 s blind, 113 s read | 50 rows (25 / 8 / 5 / 9 / 3) |
| | T3 facts and datums | 19 (14 typed, 5 Add) | 14 | 14 (set 1, levels 3, datums 5 z + 5 drawing y) | about 16 s | 67 s | the datum y values are CAD coordinates read in CAD |
| | T3 layers | 12 (10 choices, 2 split) | 10 | 0 | about 7 s | 40 s | structure set; dimension-text items (24) stop blocking |
| | T3 body heights + Complete | 7 (4 typed, 2 Add, 1 tick) | 5 | 4 (metres from feet-inches) | about 5 s | 24 s | 516 bodies offered |
| | T4 exclude the expansion joint | not done in the walk (2 to 3 actions: Exclude area, pick sheet, drag) | 1 | 0 | | | nothing flags it: 516 bodies instead of 512 (4 false beams) |
| | T5 convert | 1 (+1 Clear after a silent failure) | 0 | 0 | 0.24 to 0.39 s | 3 s | 516 bodies; with the CLI's exclude, 512 (CLI 1.0 s, 512) |
| | T6 export | 2 | 0 | 0 | 0.62 s | 4 s | IFC 1,004,435 bytes, 516 `Dxf2Bim_Evidence` psets |

Totals to Qualifies: Duplex 151 actions (3 + 4 + 20 + 83 + 41); the doors and windows are 124 of them (82 %). The editor's own witness E7 counted 319 actions for the same raw Duplex set on 2026-10-17 (65 selects, 142 typed, 84 clicks, 26 canvas, 2 ticks); the cascading Accept all, the ground and level datums from the drawing and the HAXIS fit have since halved it. Shed to Convert: 47 actions counted by the walk (18 clicks, 10 layer choices, 18 typed values, 1 tick), 28 of them values or choices the user must know.

Check of what the walk produced: the Duplex markings saved by the editor were compared with the model's own markings on every `@UNITS/VIEW/LEVEL/ROOF/FACE/HAXIS/CUT/Z/GRID*` key: 87 of 87 match (positions to 0.01 drawing units), the cut only after it was typed over the wrong suggestion.

## 3. What the owner asked: the yellow list and the datums of the film
**Yellow list: practical if accepted, tedious if read.** Accept all is 4 to 5 clicks for a whole set and every suggestion on the walk but one matched the model. Reading it is another matter: 71 rows (Duplex), 159 (HHS), 50 (shed), one row per grid line and per datum, ungrouped, and the Accept all button sits at the end of the list, 1,200 px (Duplex) and 4,500 px (HHS) below the visible part of the panel. The one wrong row (`@CUT`, below) is taken by Accept all like every other row.

**Datums: mostly practical, two are tedious.**

| Marking | Typed per set (Duplex / HHS / shed) | Verdict | Evidence |
|---|---|---|---|
| `@GRID*` | 0 / 0 / 0 | practical | from labelled grid lines or dimension ticks; 87/87 match on Duplex |
| `@Z` from level texts or the ground line | 0 / 0 / 0 | practical | 4 datums per elevation on Duplex and HHS from their level texts; shed ground line as z 0 |
| `@Z` second datum (shed plinth) | - / - / 10 (5 z + 5 CAD y) | **tedious** | the y is a CAD coordinate; each typed y = ground y + 24.0 in within 0.02 in (5 of 5 sheets), so it is derivable from the units and the accepted ground line |
| `@ROOF` | 6 / 6 / 0 | **tedious** | the same number on the roof plan, every elevation and the section; each of those sheets already holds it as its top `@Z` |
| `@LEVEL` | 3 / 4 / 3 | practical, could be fewer | our own writer puts it in the title (`LEVEL 2 PLAN (FFL +3.100)`) and the editor does not read it |
| `@VIEW` (role) | 7 / 8 / 0 picks | practical on CAD titles, missed on ours | the rule wants a title ENDING in PLAN / ELEVATION / SECTION: the shed's titles pass; ours end in `  1:100` and fail |
| `@SET` | 1 / 1 / 1 | practical | typed once, offered to the other sheets |
| `@FACE`, `@HAXIS` | 0 | practical | from names and a grid fit |
| `@CUT` | 1 / 1 / 0 typed over a **wrong** suggestion | **risk** | 2 of 2 standard sets: the label pair rule took two grid bubbles `A` (same letter as the section) for the section line: `Y,-17591.5` / `Y,-12694.7` against titles `AT X=2304.25` / `AT X=-12736.00` |

## 4. Verdict per task
- **T1 open: practical.** 3 actions, under 1 s. One confusion: the Open pill's tooltip says "Open a building — load a resident or a local .db"; the 2D row is the last row of its menu.
- **T2 yellow list: practical to accept, tedious to read** (above). The source of each row is shown, which is the point of the principle; the cost is volume and the button's place.
- **T3 sheet facts and datums: practical on standard sets (7 to 8 picks, 11 to 12 values), tedious on the shed's datums** (10 values, 5 of them CAD coordinates the editor could derive) and on `@ROOF` (6 repeats).
- **T4 blocking items: tedious.** Doors and windows are 82 % of the Duplex actions. Door heights and window products are not in the drawing at all: the user brings them from a schedule; the editor then asks for one tag per door (14 on Duplex, 116 on HHS in 12 widths: 59 doors are 885 mm, 28 are 933 mm). Door picking misses: 10 missed canvas clicks over 14 doors (the swing box has 1 mm tolerance and the leaf line is its edge). The window list shows 37 family names without sizes; a first-time user can pick a wrong one (the walk did, then removed 17 tags one by one).
- **T5 convert: practical** (1 click, 0.2 to 1.2 s), with one silent failure: converting a second set in a browser that still holds an earlier model failed with `§DXF-CONVERT failed GEOM_CUT parent 72 not found` in the console only; the badge kept *Qualifies*, the canvas stayed empty. Clear then Convert worked.
- **T6 export: practical** (2 clicks, under 1 s). *Save marked copies* downloads one file per sheet (8 / 9 downloads, a browser may ask to allow several).

## 5. Ranked efficiency proposals (each a short spec; none built)
Saving = counted from the walk. Risk = to the rule "never silent / yellow until yours".

**P1. Tag doors by width, in bulk.** Problem: 4 actions per door + misses (Duplex 66 actions for 14 doors; HHS about 464 for 116). Change: in Doors, each schedule row gets "tag all untagged doors with this leaf width" (exact drawn width, the width the row already holds); the result lists the doors tagged and the ones left (other widths, or two rows with one width = refused, listed). Saving: Duplex 66 -> 4 clicks; HHS about 464 -> 12. Risk: low: every tag is still a user action written `@BY=user`; nothing is tagged without a row the user typed; a width shared by two marks is refused, not guessed.

**P2. Group the yellow list and put Accept all at the top.** Problem: 71 / 159 / 50 rows, one per grid line or datum; the button 1,200 to 4,500 px down. Change: rows grouped by rule and sheet ("110 grid lines from labelled grid lines on 9 sheets"), a group expands to its rows, a group can be accepted on its own; Accept all and the count in the section header (sticky). Saving: HHS 159 rows -> about 8 group rows to read; no scrolling to accept. Risk: low if a group never accepts more than it shows and each row stays one click away.

**P3. Stop the wrong `@CUT` suggestion.** Problem: 2 of 2 standard sets proposed a wrong cut and Accept all takes it. Change: read the cut from a section title that states it (`AT X=<n>` / `AT Y=<n>`); refuse the label-pair rule when the paired texts are grid bubbles (a circle around the letter, or the letter on a grid line), with the reason shown. Saving: 1 typed value per set and one wrong yellow removed. Risk: none to the principle (it removes a wrong yellow).

**P4. A second datum by its height, not by a CAD coordinate.** Problem: shed 10 typed values, 5 of them CAD y read in CAD, each derivable (ground + 24.0 in within 0.02 in). Change: once units are confirmed and one datum is accepted, the user types only the datum's z (or states one set-wide datum, "plinth 0.6096 m above ground"); the editor computes its y from the units, looks for a drawn horizontal line at that y on each elevation (stated tolerance) and offers it yellow with that line's handle; no line = refused, shown. Alternative: pick the line on the canvas (like a door). Saving: shed 10 -> 1 to 5 typed, 0 CAD lookups. Risk: medium: the second datum is today a scale cross-check; it stays one only if a drawn line must exist at the computed y (state this rule; never place a datum on no line).

**P5. Offer `@ROOF` like `@SET`.** Problem: the same roof top typed 6 times (Duplex, HHS). Change: when the roof plan or any sheet states `@ROOF`, offer it yellow on the other elevations and the section ("the roof plan states it"); when no sheet does, offer the sheet's highest level-text datum as a yellow candidate with that reason. Saving: 5 typed values per set. Risk: low (yellow, source named).

**P6. Read our own standard titles.** Problem: titles with a scale suffix are not read (`FRONT ELEVATION  1:100`): 7 of 8 Duplex roles and 8 of 9 HHS roles are picked by hand, and the level in `(FFL +3.100)` is typed. Change: strip a trailing scale (`\s+1:\d+$`) before the title rule; read `(FFL <signed number>)` as a yellow `@LEVEL`. Saving: Duplex 7 picks + 3 typed, HHS 8 picks + 4 typed. Risk: low (yellow; the source text shown).

**P7. Window products filtered by the drawn width.** Problem: 37 family names, no sizes; the walk picked a wrong family (17 tags removed one by one). Change: list first the families whose width matches the picked opening's drawn width (with the width shown), the rest below a divider. Saving: one wrong round (17 + 17 actions on the walk); fewer decisions. Risk: low (nothing chosen for the user).

**P8. Say when Convert fails.** Problem: a failed commit is silent in the panel (console only). Change: the 2D panel shows "Convert failed: <reason>" in red; when the reason is a stale history from an earlier model, it says "Clear the canvas, then Convert". Saving: the confusion (the walk needed the console to see it). Risk: positive (removes a silent failure).

**P9. Easier door picking.** Problem: 10 missed canvas clicks over 14 doors. Change: accept a click within a few screen pixels of the door's arc or leaf (screen tolerance, not 1 mm), still refusing a click that two doors claim. Saving: about 10 clicks per 14 doors. Risk: low (ambiguity still refused).

**P10. Typed values in the drawing's units.** Problem: body heights and datums are metres while the shed is in inches (4 conversions by hand, `-1.4478` for -57 in). Change: fields accept `57"`, `-4'-9"`, `1250mm`; the marking stores metres and shows what was typed. Saving: no hand conversions. Risk: low.

**P11. One zip for the marked copies.** Problem: 8 / 9 separate downloads. Change: one `<set>_marked.zip`. Saving: browser prompts. Risk: none.

**P12. The in-app Guide has no 2D section.** `modeller/modeller.html` `initGuide` SECTIONS has no entry for DXF. Proposed text (owner to approve; not added here): `['2D drawings (DXF)', 'Pill ▸ Open ▸ Open 2D drawings (.dxf)… and select all sheets at once. Yellow rows are values read from the drawing that are not yours yet: Accept all (end of the list) or tick them. Choose each sheet\'s role, type the set name once, each plan\'s level and the roof top. Clear what the Verdict lists as blocking (doors: a schedule row, then Tag doors; stacked windows: Tag on an elevation). Convert, then Export ▸ IFC4. Full walk: docs DXF2BIMGuide §3.']`.

Order to build, if approved: P3 and P8 first (correctness, small), then P1 and P2 (most of the time), then P4 / P5 / P6 (datums and titles), then P7, P9-P11.

## 6. Confusion points seen (screenshots in the walk's scratch folder, names only)
- `00_start.png`, `01_openmenu.png`: the dock shows no 2D entry until the Open menu is opened; its tooltip does not mention drawings.
- `duplex_opened.png`: after opening, the canvas shows nothing until the sheets have roles (sheets with no role are not drawn).
- `duplex_49yellow.png`: 49 rows, Accept all off screen.
- `duplex_door_zoom.png`, `duplex_door_pick.png`: the zoomed door is drawn in the same colour as the other lines; three clicks missed before one hit.
- `duplex_verdict_window.png`: `fill_unbound B6` shown three times (three stacked windows at one plan position) with no words saying what to do.
- `duplex_win_try.png`: the Tag tool button reads "Click an element on a plan" while stacked windows must be clicked on an elevation; clicks under the panel do nothing.
- `shed_convert_fail.png`: Qualifies, Convert pressed, empty canvas, no message.
- Layer kind names: the CLI and the lane say `elevdoor`; the Layers list says `door`.

## 7. Not measured / limits
Human seconds are a model, not a person: no user was timed. One machine, one walk per set; the HHS doors (T4) are extrapolated from the Duplex rate, not walked. The shed exclude box was not drawn in the walk (stated from the CLI's `--exclude`). Door heights and window families on the Duplex came from the model (the plain drawings do not carry them): a real user brings them from a schedule.

## 2026-10-26 — the yellow list, measured again after §D46-§D56 (owner: "I see they are a bit long listed. Are there more general settings to reduce such?")
**Method (Node, the page's own suggestion engine):** `modeller/dxf2bim_cli.js --accept-suggestions` over the plain Duplex and plain HHS sets (`prompts/film_dxf2bim_yellow_sets.js` from `~/.cache/dxf2bim/db/{DXARC,HHSM2}.db`) and the 9 raw shed sheets; every `§CLI mark` line tallied by rule. The CLI types `@SET` on every sheet; the page asks once and offers it yellow on the others (`PR-SET`), so add 7 / 8 / 8 rows. Applied defaults and door/window rows come on top (not counted here).
| rule (tier) | Duplex plain (8 sheets) | HHS plain (9) | raw shed (9) |
|---|---|---|---|
| grid lines `PR-GRID` read / `PR-GRID-TICK` inferred | 32 | 160 | 91 (ticks) |
| level datums `PR-Z` read / `PR-Z-GROUND` inferred | 20 | 25 | 5 |
| units `PR-UNITS` | 8 | 9 | 9 |
| role `PR-VIEW` + name `PR-NAME` | 16 | 18 | 16 |
| set name `PR-SET` (page) | 7 | 8 | 8 |
| roof top `PR-ROOF` | 6 | 6 | 0 |
| plan level `PR-LEVEL-TITLE` / `PR-LEVEL` | 3 | 4 | 3 |
| face `PR-FACE` + horizontal axis `PR-HAXIS` + cut | 10 | 10 | 10 |
| **rows to read** | **102** | **240** | **142** |
| distinct rules (one decision each) | 10 | 10 | 10 |
**What the user sees (code, `dxf_meta_editor.js` renderYellows):** one row per proposal, flat; the accept buttons (`Accept all`, or `Accept stated + read` / `Accept inferred` when both tiers are present, §D36) come AFTER the last row; every row is also shown in its sheet card ("Everything below is yellow elsewhere in this panel"). So the list is long for one reason: it is written per ENTITY and per SHEET, while the user decides per RULE and per SET. Grid lines alone are 31 % / 67 % / 64 % of the rows; the per-sheet bookkeeping (units, role, name, set, roof, level, face, axis, cut) is about 50 rows on every set whatever its size.
**General settings that cut the list (proposals; each keeps every row reachable and every value traced):**
- **Y1 One row per rule, expandable (= P2).** "Grid: 160 lines read from labelled grid lines on 8 sheets (worst alignment 0.4 mm)" with its own tick; expand to see and untick single lines. 102 / 240 / 142 rows -> about 10 on each set. Presentation only: the markings written are byte-identical. Falsifier: a set where one rule's rows disagree (two grid labels on one line) must show that row OUTSIDE its group, red, not hidden in the count.
- **Y2 Set-wide facts are one row, not one per sheet.** Units (when every sheet's `$INSUNITS` agrees), the set name, the roof top (one `T/ROOF` value read on several sheets): one row "all 9 sheets". Duplex 8 + 7 + 6 -> 3, HHS 9 + 8 + 6 -> 3, shed 9 + 8 -> 2. A sheet that disagrees stays its own row, red. Falsifier: mixed units in one set.
- **Y3 Accept buttons and a count at the TOP** ("102 yellow · 0 yours · Convert needs: 3"), the list under them; the per-sheet cards keep only what is NOT in the list (their own red asks). Removes the 1,200-4,500 px scroll (P2) and the double display.
- **Y4 (policy, owner's call) "Take what the drawing states and reads".** A setting, off by default, that accepts the STATED and READ tiers on open (the file header, the title texts, labelled grid lines, level texts) and leaves only the INFERRED rows yellow. Duplex: 102 -> 9 rows (face 4, axis 5); HHS: 240 -> 9; shed: the tick grid is inferred, so 142 -> 109 (-> 6 groups with Y1). It changes the standing rule "nothing becomes yours until you tick it" for those tiers, so it needs the owner's words before it is built.
**Order proposed:** Y1 + Y3 together (presentation, no marking changes, biggest cut), then Y2, then Y4 only on the owner's go. Witness claim for Y1-Y3 first: W-YELLOW-GROUP — the rows per group = the per-entity rows of today (counts equal on the three sets), the markings after Accept are byte-identical to today's, a disagreeing row is shown outside its group.
