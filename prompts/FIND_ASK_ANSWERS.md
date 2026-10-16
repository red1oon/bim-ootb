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

## §H Leading questions — sentence grammar (user, 2026-09-30)
> *"when they text 'Cost. MEP' the format chosen is our 'Find 5D cost of [materials/personnel/all]'
> combination of sentences"* … *"nothing is invented in their query. It must be from the sentence
> format handling."*

The user never submits free text. Typed/spoken words only FILTER a list of sentences generated from
fixed templates; the user confirms one (click / Enter on the top one). Voice never auto-runs — a voice
final only fills the list. The card and the workbook carry the confirmed sentence verbatim.

**Templates** (slots in `{}`; `[ ]` = optional, omitted when unfilled):
| id | sentence | slot values come ONLY from | engine |
|---|---|---|---|
| cost_total | Find 5D cost of {all\|materials\|labour\|equipment} [for {discipline}] [on {storey}] [for {class}] | `qto_cache` DISTINCT discipline / storey / ifc_class | SUM over `qto_cache` of material_cost / labour_cost / equipment_cost / all three (the decoder.js:217 sum) with the chosen filters |
| schedule_4d | Find 4D schedule [on {storey}] [for phase {phase}] [by {trade}] (none = "for the whole building") | `kernel_ops` ELEMENT_PLACE params storey / phase / resource | the played layer (§C), filtered by the op params. Labour cost only unfiltered (`A._hrCost` is a building total) |
| clash_pair | Find clashes between {discipline} and {discipline} | pairs in `clash_rules.json` whose BOTH disciplines exist in `elements_meta` | §C clash_pair |
| largest_room | Find largest rooms [on {storey}] | rooms from `A.allRoomVolumes()`; storey from the room graph node (`A.getRoomGraph()`) | §C largest_room |
| exit_path | Find path to exit [from {room}] (none = worst-case room) | room names from `A.allRoomVolumes()` | worst: `A.escapeRouteBuild()`; from room: `RoomGraph.escapeRoute(graph, guid)` + `shortestPath` polyline length (cpe_escape_route.js:396-403) |
| counts | Find element count by {discipline\|storey} | — | `elements_meta GROUP BY` |

**Word → slot** (no other mapping exists): intent words pick templates (cost/5d/price/budget ·
4d/schedule/timeline/duration · clash/conflict · room/largest/area · exit/egress/escape · count/how
many); cost-type words (material · labour/labor/personnel/manpower/crew · equipment/plant · all/total);
discipline synonyms = nlp.js `DISC_MAP` (exposed, not copied); any other word fills a slot only if it
is (a) a whole phrase of a slot value, else (b) a prefix (≥2 chars) of a word of a slot value.
Unmatched words are ignored — never placed into a sentence. No intent word → templates that own a
matched slot. Empty input → one default sentence per template.

**Availability, shown up front:** a sentence whose data is absent is listed greyed with the reason
and cannot be confirmed — cost without `qto_cache`; exit without `storey_walkable_raster`; 4D
storey/phase/trade filters only after a timeline exists (the whole-building sentence generates it).

**Witnesses (added to witness_find_ask_answers.js):**
- **W6 GRAMMAR-FROM-DATA** — issue: a suggestion could carry a value the building does not have
  (invention). For a fixed input list, every slot value of every suggestion ∈ the witness's OWN
  vocabulary (its own SQL + its own read of clash_rules.json); availability ⇔ precondition table; and
  on a building with `qto_cache` + MEP, `cost. MEP` → top four = "Find 5D cost of {all, materials,
  labour, equipment} for MEP".
- **W7 FILTER-PARITY** — issue: a filter could be dropped silently (the answer for the whole building
  shown as the answer for Level 1). Filtered cost = witness SQL with the same WHERE; filtered 4D element
  count = witness's own kernel_ops filter; count-by-storey = witness SQL; exit from the worst room =
  the worst-case record's exit.

## §I Escape route with alternatives — one owner shared with the Alt-C film (user, 2026-09-30)
> *"What about best escape route, with alternatives?"* … *"During alt-c film baking, at last part
> 'Escape Route', we made use of the same?"* — yes: the film's §ESCAPE_ROUTE_REVEAL record
> (`cpe_escape_route.js escapeRouteBuild`) already computes the alternatives (escapeRoutes +
> divergenceFrom, §13.1). Ask must read THAT, not a second copy.

- The §13.1 alternates block moves VERBATIM out of `escapeRouteBuild()` into
  `_computeAlternates(RG, graph, node, esc, poly, _rec)`; the film calls it exactly as before.
- New `A.escapeRouteFor(roomGuid)` — the same passes the film makes for its winner (escapeRoute →
  shortestPath polyline measured in three-space → `_computeAlternates`), for one named room. Read-only,
  does not touch the film's cached record. Logs `§ESCAPE_ROUTE_FOR`.
- Ask `exit_path` answer = best route (exit, walk m, doors) + every reachable alternative exit in the
  engine's rank order (walk m each) + the no-choice shared length (`commonPathM`) and where routes
  split. Ranking stays the engine's route cost (NOT re-sorted by metres); nothing is rated safer.
- **W8 FILM-PARITY** — issue: Ask's alternatives could disagree with the film. The worst-case Ask
  answer's exitsReachable / commonPath / split node / alternate count = the film's own
  `§ESCAPE_ROUTE_ALTERNATES` line; `escapeRouteFor(worst room)` = the film record (same exit, walk,
  common path, alternate exits in order); every alternate is a graph exit node ≠ the best exit.

## §J External-AI test — our own Claude as the outside user (user, 2026-09-30)
> *"we be testing with our own Claude Code as the 'external AI user'"* … *"do the next step"*

The end of the chain is not "the workbook saves" — it is **an outside AI, given only the saved file
and our canned prompt, answers from it without inventing**. Test it with a fresh Claude (Agent tool,
Sonnet, NO project context, told to read only the one .xlsx).

1. `witness_find_ask_answers.js` gains `SAVE_XLSX=<path>`: after W1–W8 it writes the FULL answers
   workbook (defaults + the W7 drill-down sentences) to disk — the same bytes Save .xlsx downloads.
2. The fresh Claude gets: the file path, the prompt from the workbook's own "Prompt for your AI" cell,
   and a fixed question list — answerable ones (clashes ARC vs MEP, schedule length, total cost,
   materials cost STR on Level 1, worst escape route + alternatives, largest room) and TRAPS the file
   cannot answer (clashes PLB vs STR, cost on Level 3, fire-sprinkler count).
3. **W9 AI-GROUNDED** (`scripts`-free judge, `viewer/tests/judge_external_ai.py`) — issue: an outside AI
   could state numbers the file never gave (the exact failure the product exists to prevent). PASS iff
   (a) every number in each answer appears in the workbook, (b) each answerable question cites an
   Evidence tag or Engine value present in the row it used, (c) every trap is answered "not in the
   file" with no number. Reports per-question and overall; INCONCLUSIVE if the AI returned nothing.

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
- **2026-09-30 §H sentence grammar built** — `viewer/find_ask_grammar.js` (templates, vocabulary, word→slot
  matching), `find_ask.js` runners take the confirmed sentence's slots, `nlp.js` exposes `A._nlpDiscMap`
  (one owner of discipline synonyms). Witness now W1–W7:
  - **Hospital `§ASKW_VERDICT PASS judgedOK=6/6 pass=10 fail=0`** — `cost. MEP` → exactly the 4 sentences;
    W6 offDataSlots=0 over 10 inputs; W7: "Find 5D cost of materials for STR on Level 1" = 5,007,579 =
    witness SQL; "Find 4D schedule on Level 1" = 9,018 elements = own op filter (labour cost withheld —
    building total only); count by storey = SQL; "Find path to exit from ≈ Level 4 R26" → same exit as the
    worst-case record.
  - **Clinic `§ASKW_VERDICT PASS judgedOK=4/6 pass=10 fail=0`** — W7 judged sched ("on TOF Footing" = 1,680)
    + countStorey; cost/exit sentences listed greyed (no qto_cache / no raster), costMep n/a.
  - Found + fixed by the witness: a stale-suggestion RACE — on Clinic's slow first vocabulary build the
    empty-box request resolved after the typed one and overwrote the list; the click then hit a greyed
    sentence and ran nothing. Now only the newest request redraws (`§ASK_SUGGEST_STALE`).
  - Voice final fills the list only (W5 `voiceRan=0`).
  - Known limit: "clash plumbing structure" → no sentence, because `clash_rules.json` has no PLB rule;
    the hint line does not yet say that a rule is missing.

- **2026-09-30 §I escape alternates built** (branch `feat/ask-escape-alternates`):
  - **Hospital `§ASKW_VERDICT PASS judgedOK=6/6 pass=11 fail=0`** — W8: film `exits=8 common=180.28 m
    split="Corridor — Level 1" drawn=7` = Ask `exits=8 common=180.28 split="Corridor — Level 1" alts=7`;
    `escapeRouteFor(worst room)` = film record (same exit, walk, common path, alternate order); every
    alternate is a graph exit ≠ best. Answer: "Best: ≈ Level 4 R26 → …766840, 202.6 m walk, 8 doors. 7
    alternative exits (210, 225, 261, 241, 241, … m); the first 180.3 m has no choice of route (routes split
    at Corridor — Level 1)."
  - Alternatives are in the ENGINE's order (route cost, which penalises utility rooms), so walk metres
    are not monotonic (261 before 241) — by design, not re-sorted.
  - **Clinic `§ASKW_VERDICT PASS judgedOK=4/6 pass=11 fail=0`** — W8 n/a (no walk raster).
- **2026-09-30 §J external-AI test — `§W9_VERDICT PASS judged=9 fail=0`** (branch `feat/ask-external-ai-test`):
  - Workbook: `SAVE_XLSX` Hospital run (`§ASKW_SAVED answers=10 bytes=43743`, witness `PASS 6/6 pass=11`).
  - Outside AI = a fresh Claude (Sonnet, Agent tool, no project context, told to read only the one .xlsx and
    follow the workbook's own "Prompt for your AI" cell). Questions: `viewer/tests/external_ai_questions.json`.
  - 6/6 answerable questions: every number found in the workbook, both Evidence + Engine cells cited
    verbatim (e.g. q5 listed all 7 alternative exits with walk metres from the exit detail sheet). 3/3 traps
    (clash PLB vs STR, equipment cost for MEP, sprinkler-head count) answered "not in the file", no number.
  - Red control: fabricated answers (invented cost 81,250,000; a correct number with no citation; a trap
    answered "about 40") → `§W9_VERDICT FAIL judged=3 fail=3`.
  - Judge defect found + fixed on the first real run: a refusal naming "STR Level 1" was read as stating the
    number 1. Workbook labels carrying a digit are now stripped before numbers are read (red control still
    FAIL 3/3 after the fix).
  - Infra note: the first Hospital save timed out at 15 min under load average 28 on 20 cores (other
    sessions' headless-Chrome runs) — retried with `LOAD_MS=2400000`, not a code fault.

## §K ✅ CLOSED 2026-10-02 (bim-ootb #1816) — live split-DB buildings carry no `qto_cache`, so cost sentences are greyed LIVE (found 2026-10-01)
Found while capturing `docs/AskFirstSteps.md` (bim-compiler) on the live site. The live viewer opens
Hospital / Terminal in split mode (`§DB_SPLIT_DETECT` → `_meta.db` + `_geo.db`); `A.db` is the META db.
- Live Terminal `A.db` tables (`§CENTRES_QUERY`): project_metadata, elements_meta, element_transforms,
  element_instances, rel_contained_in_space, spatial_structure, rel_aggregates, storey_walkable_raster —
  **no qto_cache** → `§ASK_VOCAB … qto=false`, every "Find 5D cost …" sentence greyed.
- The live `Terminal_extracted.db` DOES have it (161 rows, downloaded + counted) — but split mode never
  reads the extracted DB. Live `Hospital_meta.db`: no qto_cache either. Local `Hospital_meta.db` has 218
  rows, which is why §G's Hospital witness passed: **the local DB is not the live DB.**
- Same gap hits the shipped NLP "total cost" chip (decoder.js reads `qto_cache` from `A.db`).
- Fix per the DB rule (patch + self-heal loader, never a binary): add `qto_cache` CREATE + INSERTs
  (rows copied from that building's own live `_extracted.db`) to `buildings/patches/<bld>_meta.db.sql` on
  OCI — the loader `A._applyPendingPatch` already applies it. Needs the owner of those patch files'
  generator, or user OK, since the patch files are shared with other lanes. Witness: re-run
  `witness_find_ask_answers.js` against the LIVE URL (not the local DB) — cost_total OK on Terminal.

### §K.1 Fix (user "go", 2026-10-02) — a SEPARATE, owned cost patch per split building
Measured on the LIVE bucket: `Terminal_extracted.db` qto_cache 161 rows, `Hospital_extracted.db` 218 rows
(both `cidb2024_my`, computed 2026-05-07); `_meta.db` and `_geo.db` of both: no qto_cache. The shared
`patches/<bld>_meta.db.sql` is NOT touched — live `Terminal_meta.db.sql` (OCI, 2026-08-28) and the repo
copy already DISAGREE (repo carries 2,074 `UPDATE element_transforms` lines OCI lacks): another lane's
open state, left alone.
- **Patch:** `buildings/patches/<bld>_meta.db.qto.sql`, generated by `scripts/gen_qto_patch.py` from the
  building's own LIVE `_extracted.db` qto_cache (rows copied verbatim, source etag/md5 in the header).
  Idempotent and non-duplicating: rows go to a staging table, copied into `qto_cache` only if it is
  empty, staging dropped.
- **Loader:** `A._applyPendingPatch` applies the existing `<db>.sql` exactly as before, THEN the optional
  `<db>.qto.sql` (404 → `§PATCH_QTO_NONE`, applied → `§PATCH_QTO`), each independent of the other.
- **Upload:** through `scripts/oci_patch_gate.js` (OCI_UPLOAD.md rule 6), `--verify
  scripts/verify_qto_patch.py` = patched served meta bytes hold exactly the source rows (count + every
  row + Σ material/labour/equipment).
- **Witness (live):** the docs capture against the LIVE URL — "Find 5D cost of materials for MEP" on
  Terminal = OK, value = SUM(material_cost) over the live extracted DB's MEP rows.
- **§K.1 DONE + witnessed LIVE (2026-10-02):** both `.qto.sql` uploaded via `oci_patch_gate.js` (`§GATE_VERDICT
  PASS` → `UPLOAD_VERIFIED`; Terminal 161/161, Hospital 218/218 rows; re-apply unchanged). Loader merged
  (#1816, `scene.js?v=65`). Live Terminal capture: `§PATCH_QTO Terminal_meta.db applied (166 statements)
  qto_cache rows=161`; "cost MEP" → exactly the 4 cost sentences; "Find 5D cost of materials for MEP" =
  **2,038,000** (62 rows, 9,733 elements) = `SUM(material_cost)` over the live `Terminal_extracted.db` MEP rows.
  Docs page `AskFirstSteps` now carries the cost step (BIMCompiler #165 + safe deploy).
  - Side observation, NOT this lane: Terminal ARC vs MEP clashes read 114 live vs 107 on the local split
    files — consistent with the repo-vs-OCI `Terminal_meta.db.sql` transform drift noted in §K.1.
