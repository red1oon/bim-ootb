# ⚠ DO NOT REMOVE — SCOPE + LOG MANDATE
Scope: an **Ask** mode in the viewer's Find panel. The user picks/searches/speaks a canned question,
the viewer answers it by CALLING THE ENGINE THAT ALREADY SHIPS (no re-implementation, no new maths),
answers append to an **Answers** list, and **Save** writes one `.xlsx` the user keeps on their disk and
may hand to any AI of their own ("answer only from this file, cite the evidence column").
Nothing leaves the user's machine; no AI API; no server. **Read the witness log after every run —
the exit code is not evidence.**

## §A Why (user, 2026-09-30)
A third party wants computed answers (clashes, 4D, cost, largest room, path to exit) on their own
IFC without our UI flow. Chosen shape: the browser app IS the engine (IFC already extracts in-browser
via web-ifc, `import_own.js:256`); Find's mic + chips are the entry; the saved workbook is the fact
sheet their own AI reads. Their AI can compute raw facts from the IFC itself; what it lacks is the
rules outside the IFC (clash pairs/tolerance, 4D sequencing, rate books, egress) and the tested
engines — the answer must carry that provenance or it adds nothing.

## §B Answer contract (every query, no exceptions)
```
{ id, question, verdict: 'OK'|'INCONCLUSIVE'|'VACUOUS', summary, value,
  evidence: [{tag:'§…', text}], sources: {engine:'file:fn', rules?:'file'}, rows?: [...], cols?: [...],
  building, at: ISO time }
```
- `verdict` = INCONCLUSIVE when the engine's precondition is missing (table absent, bundle not
  loaded) — `summary` names the missing thing. VACUOUS when the engine ran but judged nothing
  (0 rooms, 0 tasks). Never a number presented as an answer in those cases (PRIMAL LAW clause 4).
- `evidence` = the § line(s) the ENGINE ITSELF emitted during that call (captured by wrapping
  console.log for the call's duration — the log is still printed, not suppressed), plus one
  `§ASK_ANSWER id=… verdict=… value=…` line this module prints.
- Each answer is appended to `A.askAnswers[]` and rendered as a card in the Answers list.

## §C Query catalog (v1)
| id | question | engine (existing, cited) | value |
|---|---|---|---|
| `clash_pair` | Clashes between disc A and disc B (default ARC vs MEP; any pair in clash_rules.json) | `A._loadClashRules` (measure.js:76) + `A._queryClashesPairAll(rules,a,b)` (measure.js:526); tolerance = that pair's rule `tolerance_m` | broad-phase (bbox) count; + narrow-phase CLASH count when `A._qualifyClashRows` exists (clash_narrow.js) |
| `schedule_4d` | 4D schedule timeline + labour cost | 1) authored: `ScheduleRead4D.readTasks(A.db)` (schedule_read_4d.js:78). 2) else the PLAYED layer: `window.tmGenerateTimeline()` (time_machine.js:10346) writes `kernel_ops`; read `ELEMENT_PLACE` rows the way `loadOps()` (time_machine.js:203) does (the TM only loads `_ops` when activated — measured: `tmOpsSnapshot()` = 0 after generate); labour cost = `A._hrCost` (§HR_COST) | elements, start, finish (local date), days, trades; labour cost + person-days |
| `cost_total` | Total cost (5D) | `BimDecoder.decode('total cost')` + `formatResult` over `A.db` — the same call `nlp.js:288-306` makes (reads `qto_cache`) | grand total in `_TRL.cur` |
| `largest_room` | Largest rooms | `A.allRoomVolumes()` (navigate_find.js:2303); area per room = Σ `size.x*size.z` over its boxes, grouped by `guid` | top 10 rooms by floor area m² |
| `exit_path` | Worst-case path to exit | `A.escapeRouteBuild()` (cpe_escape_route.js:359) — the argmax room | from-room, exit, hops, route cost + drawn walk metres if the record has them. **Route cost is NOT metres** (cpe_escape_route.js:84-90) — label it as cost |
| `counts` | Element counts by discipline | SQL `elements_meta GROUP BY discipline` (same table Find's discipline axis reads) | per-discipline counts |

Free text / voice: the existing `_handleInput` NLP path is untouched. Ask adds a searchable list of
the catalog; a typed Ask question is matched to a catalog id by keyword, never parsed into new SQL.

## §D UI
- Find panel gets a two-pill switch above the tree: **Find | Ask**. Ask shows: a filter box over the
  catalog, a disc-A/disc-B pair picker for `clash_pair`, **Run** per entry, and the **Answers** list
  (newest last, each card = question, summary, verdict badge, evidence tag). **Save .xlsx** + **Clear**.
- Mic: a voice final while in Ask mode matches the catalog (same keyword match as typed).

## §E Save — one workbook
- ExcelJS lazy-loaded from `lib/exceljs.min.js` (not loaded by viewer.html today; boq_charts.html:59
  precedent). Download = the export_4d.js:143-149 pattern. File `BIM_OOTB_<bld>_Answers_<date>.xlsx`.
- Sheet **Answers**: one row per answer — #, question, verdict, summary, value, evidence tags,
  engine source, building, time. Row 1 above the table: viewer URL (hyperlink) + the canned prompt
  for the user's AI.
- One detail sheet per answer that has `rows` (4D tasks, clash pairs, rooms, route hops).
- Visual 4D/5D pages are LINKED (hyperlink cells), not embedded — an xlsx cannot carry HTML.

## §F Witnesses (each names the issue it proves)
`viewer/tests/witness_find_ask_answers.js` (puppeteer, own static server, BLD env; buildings read from
`~/bim-ootb/buildings`):
- **W1 ENGINE-PARITY** — issue: an Ask answer could drift from the engine it claims to wrap. For each
  id, after `A.askRun(id)` the witness calls the same engine independently in-page and asserts equal
  value (clash count, tasks+days, room top area, cost total, escape from/exit).
- **W2 EVIDENCE-REAL** — issue: evidence could be decorative. Every OK answer's `evidence` must contain
  ≥1 engine § tag that also appears in the page console log captured by the witness.
- **W3 HONEST-INCONCLUSIVE** — issue: a missing table could yield a fake 0. On Clinic (no `qto_cache`,
  no `storey_walkable_raster`) `cost_total` and `exit_path` must be INCONCLUSIVE/VACUOUS, not OK.
  On Hospital (both present, `_meta.db`) they must be OK. If a building lacks the table the OK-case is
  reported INCONCLUSIVE by the witness, never PASS.
- **W4 SAVE-ROUNDTRIP** — issue: the file the user keeps could differ from the screen. The workbook
  buffer (from `A.askBuildWorkbook()`) is parsed in node (`xlsx` package): Answers sheet row count =
  `A.askAnswers.length`, each row's verdict + value = the card's.
- **W5 UI-WIRED** — issue: a working API behind a dead button. Click Ask pill → filter "clash" →
  Run → exactly one new card in the DOM with the answer's summary.

## §G Status
- 2026-09-30 spec written. Branch `feat/find-ask-answers` (bim-ootb). Built: `viewer/find_ask.js`,
  2 hooks in `navigate_find.js` (mount after panel append; `_handleInput` delegates while Ask is
  active), `main.js` bundle entry (`find_ask.js?v=1`, `navigate_find.js?v=61`), sw `v1450`.
- **Clinic — `§ASKW_VERDICT PASS judgedOK=4/6 pass=8 fail=0`** (`/tmp/witness_find_ask_answers_Clinic.log`):
  - clash ARC vs MEP: **46 box overlaps → 22 mesh-level clashes**, 8 cleared by the triangle test
    (`§CLASH_NARROWPHASE falsePositiveRate=52.2%`) — the §A value-add, measured: a box-only answer
    over-reports by 2×.
  - 4D: 16,114 elements, 137 days, 9 trades, labour 1,418,277 (3,048.1 person-days, `§HR_COST`).
  - largest room: `≈ First Floor R20` 323.4 m² of 118 (≈ = a compiled room, not an IfcSpace).
  - cost_total INCONCLUSIVE (no `qto_cache`), exit_path INCONCLUSIVE (`§ESCAPE_ROUTE_BUILD FAIL
    reason=metadata-absent storey_walkable_raster=0`) — W3 honest.
  - (re-run after fixes: still PASS 4/6; clash wording now "46 box overlaps: 24 cleared by the shape tests".)
- **Hospital — `§ASKW_VERDICT PASS judgedOK=6/6 pass=8 fail=0`** (`/tmp/witness_find_ask_answers_Hospital.log`):
  - clash ARC vs MEP: **200 box overlaps → 0 mesh-level clashes** (all 200 cleared by the shape tests).
  - 4D: 63,415 elements, 2022-02-27 → 2023-07-31 (519 days), 9 trades, labour 5,124,799 (11,860.1 person-days).
  - cost_total: 76,439,535 (`§NLP_DEC kind=cost`, qto_cache in `_meta.db` is visible to `A.db`).
  - largest room `≈ Level 1 R13` 294.0 m² of 142; exit: worst room `≈ Level 4 R26`, 202.6 m drawn walk,
    8 doors, of 156 rooms.
  - W1 caught a real bug on the first Hospital run: the cost answer stored the display LABEL cell
    ("total") as its value — fixed to read the decoder's own planned SQL (`d.sql`), not the text.
- ⚠ Open, not this lane's: the shipped decoder summary reads "$ 76,439,535 (RM 293,998,212)" in the
  headless run — the `_TRL.cur/cur2/cur_rate` pairing looks inverted there. Ask reports it verbatim.
- First run caught a real miss: 4D read the empty `tasks` table and answered INCONCLUSIVE although
    the generator had run (`§GANTT injected=16114`) — wrong owner; fixed per §I (played layer).
