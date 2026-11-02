# ⚠ DO NOT REMOVE
SCOPE: the **Project Order / CAPEX dashboard** — `capex/` in bim-ootb (vanilla HTML/JS, no framework, no build step, no client name in code) — its data, its twin with legacy iDempiere, and its road to
being **editable without code or AI**. Every number comes from rows of a real DB (SQLite ERP twin = Source A, legacy iDempiere via stock WebServices = Source B). An empty population prints
"no data" / INCONCLUSIVE, never 0 % or green. **Read the log after every run (`§DASH_*`, `§SHED_*`, `§FILM_SHOT`); the exit code is not evidence.** Spec before code; every witness names the issue it
proves and has a break switch that must FAIL. Honour this block until the lane is closed. Full history (sessions 88 + 77, 2026-11-02 → 11-03): `prompts/archive/CAPEX_DASHBOARD_history_2026-11-02_to_11-03.md`.

## ▶ RESUME HERE (rewritten 2026-11-03 at the close of session bim-compiler-77 for a NEW session dedicated to this dashboard — the ONLY current block)
**Owner's goal (verbatim):** "We can build an adhoc HTML that resembles that dashboard (they eventually will share their app) and perhaps it be adopted or replace theirs as it is expected to be simple
vanilla" · "This is where we be twinning silently in the background to get a free parity testing" · "Of course we like to move things to our framework, thus the dashboard is something external to
idempiere core" · "pending what they designed for their dashboard, which we can then compare, but we like them to consider our local first framework as a transition" · "the BIM integration concept
is that all data is GIGO from the BIM side" · roadmap: "Dashboard Editor (where user can make changes without coding or AI)" · (2026-11-03, on hearing legacy defines dashboards as PA data) **"then we can continue the twin-legacy parity, where our side is a true twin and idempiere side retains its learning curve"**.
**The frame (§4 — read it before designing anything):** the dashboard is where the whole scheme meets — BIM computes the project (no rekeying), the ERP holds it (Project Order), the twin proves
SQLite == legacy, and the dashboard shows it. The editable dashboard is NOT a new invention: legacy iDempiere already defines dashboards as DATA (Performance Analysis: `PA_MeasureCalc` SQL,
`PA_Measure`, `PA_Goal`, `PA_ColorSchema` thresholds, `PA_DashboardContent`, `AD_Chart`). Port that mechanism (AD-LAYER LAW), move today's hard-coded tile formulas into those rows, and the "editor" is the
generic AD windows over them — the same rows then run in legacy ZK and in the SQLite twin, and the twin judges them.
**Guiding rule (owner, above):** the dashboard is DEFINED the iDempiere way (PA / AD_Chart rows, maintained in the windows legacy users already know — their learning curve is kept, nothing new to
learn); OUR side is a TRUE twin that executes the same rows and must show the same values (CARDINAL RULE). The `capex/` page becomes a renderer of those rows, not a second formula engine.
**State (all merged on bim-ootb main; witnessed):** page `capex/` (#2530) · twin tools (#2532, #2539–#2541, #2545) · shed and HHS pushed to the LOCAL pilot and twinned PASS (shed 121/121 rows,
HHS 160/160 rows, 16/16 judged tiles, Last Updated = PER_SOURCE) · kernel fixes found by the twin: document-value workflows, legacy project-line rules, REST bridge (service type per method,
namespaced replies, UOM by code), real UUIDs, mandatory tax category (+ boot overlay), local time · `?project=` filter · films EN/ZH/MS v5 (`~/Videos/CAPEX_Dashboard_Addon_narrated_{EN,ZH,MS}_AFTER_2026-11-03_v5.mp4`).
**▶ NEXT, in order (spec before code; each its own §5 entry):**
1. **R0 — ✅ DONE (§5.4): YES, legacy computes a CAPEX tile as PA data with no Java** — Approved Budget (USD) 4,996,920.867 == our tile to the cent. Three legacy behaviours found that bind R2
   (§5.4). Not in R0: AD_Chart, the ZK render, the colour (no target stated, §6 Q1).
2. **R1 — ONE schedule — ✅ DONE (engine + node path, witness §5.2); HHS re-pushed to the pilot + twin PASS (§5.4)**; R1-f ✅ (§5.6: the viewer's push carries the Gantt's programme); open: the SHED re-push
   (its building DB is gone, §5.4); re-voice the films.
3. **R2 — the PA engine in the SQLite kernel**, generic (MMeasure / MGoal / MColorSchema semantics ported from the legacy source, cited file:line), witnessed against the same rows on the pilot.
4. **R3 — tiles as data:** each §3 tile → a `PA_MeasureCalc` / `PA_Measure` (+ `PA_ColorSchema` for health) row; `tiles.js` keeps only what PA cannot express (named); deletion budget stated.
5. **R4 — the editor:** the generic AD windows (Performance Measurement / Goal / Color Schema / Dashboard Content) in our ERP UI — no dashboard-specific code; an edit re-renders and re-twins.
6. **R5 — Sysnova's own design** (pending them): compare tile by tile with §3; their definition wins; then the DOWN sync (§5 R5). Client questions §6 go via the owner.
**Rules that bind:** PRIME RULE · CARDINAL TWIN RULE (SQLite == legacy incl. L&F; fixes on the SQLite side; exemptions only in the owner's words) · AD-LAYER LAW (one generic engine, X of N) · one
owner per relation (4D: `bim-compiler prompts/4D_MODEL_INTEGRITY.md §I`) · never move the Team base hash (`erp/patches/ad_seed.db.sql`) without the owner — use a boot overlay · every legacy-server config
change needs the owner's go (local pilot only so far) · never `git stash` · never claude-in-chrome · bim-ootb only in a `/tmp/wt-*` worktree · no `.db` committed ·
**LEGACY CONVENTION (owner 2026-11-03: "at the legacy side, all changes, add-on be following its convention ie as a plugin or migration script if there is no processes")** —
anything we change or add on a legacy iDempiere (pilot or client) ships the way iDempiere ships its own: DATA-only (AD/PA/WS rows, no Java) = a migration script in its format
(`migration/iD13/postgresql/<yyyymmddHHMM>_<ticket>.sql`, first statement `SELECT register_migration_script('<file>') FROM dual;`, plain DML with IDs ≥ 1000000 + `*_UU`, as written by ZK's
"Log Migration Script"; measured in `~/idempiere-dev-setup/idempiere/migration/iD13/postgresql/202601130707_IDEMPIERE-6815.sql`); anything with a process / callout / model validator = an OSGi
plugin (2Pack in the bundle). **Staging (owner, same day: "we do things adhoc as POC first, quick and dirty. But once proven or clearer, we evolve to convention"):** a POC on the LOCAL pilot may be
ad-hoc; once it is proven — and always before it reaches a client server — it is re-expressed in the convention. Proven and due: the three pilot scripts
`capex/tools/ws_capex_{readtypes,writetypes,updatetypes}.sql` (ad-hoc `DO $$` blocks; the twin PASSed on them) → one migration script each (named, not yet done).

## 1. What exists (map — read the file before changing it)
| piece | file | witness |
|---|---|---|
| page (UI only draws) | `capex/index.html`, `dash.js`, `dash.css` | `capex/tests/witness_capex.js` (38 asserts; run with a SHED fold DB as arg) |
| the ONE compute | `capex/tiles.js` `compute(data, {org, category, status, project, today})`, `flatten`, `twin` (PER_SOURCE: `last_updated`) | same |
| sources | `capex/adapters.js` (`fromSqlite`, `loadLegacy` via stock `query_data`) | W-CAPEX-TWIN-PARSE (stub) |
| BIM → Project Order | `viewer/proj_fold.js` (legacy line rules `_legacyProjectRules`; ⚠ own schedule = R1), `capex/tools/fold_demo.js` (seed + patch + boot overlays) | `tests/poc_proj_push.js`, `poc_fin_*` |
| push to legacy | `viewer/erp_rest_push.js` (`{query, create}` types, `unprefix`, UOM by X12DE355) | `tests/poc_erp_rest_push.js` (mock binds a type to a method, namespaced replies) |
| scenario twin | `capex/tools/shed_twin.js <fold.db> <Value> [today]`, `phase_progress.js`, `legacy_snapshot.js`, `twin.js` | `§SHED_TWIN_VERDICT` |
| pilot config (LOCAL only) | `capex/tools/ws_capex_{readtypes,writetypes,updatetypes}.sql` (restore recipes in each header) | before/after ws counts in the archive §10/§12.2/§15.1 |
| kernel fixes the twin found | `erp/model_layer.js` doc-value workflows · `erp/ad_docvalue_overlay.js` · `erp/ad_taxcat_overlay.js` · `viewer/proj_claim.js` line rounding · `viewer/proj_order_state.js` VO basis | `erp/tests/witness_docvalue_wf.js`, `witness_taxcat_overlay.js`, `viewer/tests/witness_s9_pure.js` |
| film | `capex/tools/film_shots.js`, `capex/tools/film_cards/`; recipe = bim-compiler `prompts/FILM_NARRATION.md` ▶ PLAYBOOK C | numbers in `§FILM_SHOT` lines |

## 2. Architecture (unchanged)
`adapter.load() → data` (projects, phases, tasks, lines, orgs, phaseRef, currencies, wf, unavailable[]) → `tiles.compute(data, filters)` (pure) → page draws / twin compares flattened maps.
`?today=` injectable, `?project=<Value>` scopes one project on both sources, currencies never summed together. Source B in a browser needs a snapshot (no CORS on legacy).

## 3. Tile → SQL table (the thing the client reviews)
`P` = C_Project rows after the Org (`AD_Org_ID`) and Category (`ProjectCategory`) filters; `S` = `P` after the Status filter; `A` = `S` that are Active (the "(Active)" tiles). Status filter: Active = `IsActive='Y' AND Processed='N'`,
Closed = `Processed='Y'`, Inactive = `IsActive='N'`, All. "Today" = the page date. Legacy column = same name through WS read type (§4).
Tiles marked (D) use a formula the client never stated: the page prints it as a footnote under the tile; the thresholds are ⛔ questions (§7).

| # | Tile | Formula over iDempiere columns (SQLite SQL form) | Population |
|---|---|---|---|
| 1 | Total Projects (All) | `SELECT COUNT(*) FROM C_Project` (Org/Category filters only); sub "Closed" = `COUNT(*) WHERE Processed='Y'` | P |
| 2 | Active Projects | `COUNT(*) WHERE IsActive='Y' AND Processed='N'`; sub = of those, `C_Phase.Name='Closed'` (D) | P |
| 3 | Approved Budget | `SUM(PlannedAmt)` per `C_Currency_ID` | S |
| 4 | Actual Cost | `SUM(ProjectBalanceAmt)` per currency; sub "% of plan" = Actual / `SUM(PlannedAmt)` (no data when plan is 0/NULL) | S |
| 5 | Committed Cost | `SUM(CommittedAmt)` per currency; sub = `SUM(InvoicedAmt)` invoiced (the client's "verified / contract" split has no stated column: ⛔ Q4) | S |
| 6 | Forecast Cost at Completion | **definition pending (client)** — ⛔ Q3 | — |
| 7 | Projects Completed this year (D) | `COUNT(*) WHERE Processed='Y' AND strftime('%Y',DateFinish)=strftime('%Y',today)` | P |
| 8 | Project Health (D) | per project in A: BAC=`SUM(phase.PlannedAmt)`, PV=`SUM(phase.PlannedAmt WHERE EndDate<=today)`, EV=`SUM(phase.PlannedAmt WHERE IsComplete='Y')`, AC=`ProjectBalanceAmt`; SPI=EV/PV, CPI=EV/AC when AC>0. **No EVM data** = PV is 0/NULL. Else Green = every defined index >=0.9, Red = every defined index <0.9, Amber = mixed. 0.9 is the only threshold the client stated (At Risk SPI<0.9) | A |
| 9 | Project Stage (pipeline) | `SELECT C_Phase.Name, COUNT(*) FROM C_Project JOIN C_Phase USING(C_Phase_ID) GROUP BY 1`; NULL → "(no phase)". The client's five stages (Concept…Closing) have no stated mapping onto `C_Phase`: ⛔ Q2 | A |
| 10 | Physical vs Spent | Physical = `SUM(phase.PlannedAmt WHERE IsComplete='Y') / SUM(phase.PlannedAmt)` per currency (client caveat: "planned-weighted phase progress"); Spent = `SUM(ProjectBalanceAmt)/SUM(PlannedAmt)`. Client caveat shown verbatim: "Physical = planned-weighted phase progress. Spent = issued material cost + budget (payment-based financial progress is not in the ERP)." | A |
| 11 | Schedule Performance (D) | per project in A: **No schedule data** = no phase with both StartDate and EndDate; **At Risk** = SPI<0.9 (client's number); else **Delayed** = any phase with `IsComplete='N' AND EndDate<today`; else **On Time**. Average Delay = mean over Delayed+At Risk of `max(today-EndDate)` over its overdue incomplete phases (days) | A |
| 12 | Budget Status (D) | per project in A: **Not started (no cost)** = `ProjectBalanceAmt` NULL/0; **Over** = `ProjectBalanceAmt > COALESCE(PlannedAmt,0)`; else **Within**. Actual Overrun = `SUM(ProjectBalanceAmt-COALESCE(PlannedAmt,0))` over Over, per currency | A |
| 13 | Approval Pending (sidebar badge) (D) | `SELECT COUNT(*) FROM AD_WF_Activity WHERE WFState='OS' AND Processed='N'` (the client's 514 has no stated definition: ⛔ Q5) | system |
| 14 | Last Updated | `MAX(C_Project.Updated)` (data, never the clock) | P |
| 15 | Sidebar: Projects | table of P: Value, Name, Org, Currency, Planned, Actual, Committed, Phase, "BIM" link | P |
| 16 | Sidebar: Budget & Cost | per-project Planned / Committed / Invoiced / Actual rows | P |
| 17 | Sidebar: Procurement Risks, Handover | **definition pending (client)** — ⛔ Q6 | — |

BIM link (row action): `../viewer/viewer.html?db=<buildingsBase><Value>_extracted.db&record=<C_Project_ID>` (viewer `config.js` reads `db` and `record`; the integration spec's
`index.html?building=<name>&record=<id>` form is the landing page's, which the Viewer does not read — recorded, ⛔ Q7). Shown ONLY when the file answers HEAD 200.


## 4. FRAMEWORK — the dashboard as iDempiere's own data (session 77's take, measured 2026-11-03)
**Why this is the finale:** every lane meets here — DXF2BIM/IFC → 4D/5D (computed, never typed) → Project Order (ERP) → push (WebServices) → twin (parity) → dashboard (decision). A number on a tile is
only as good as the chain behind it; the twin is what lets us say so with evidence. So the dashboard must not become a second, private formula engine.
**Measured:** legacy pilot holds `PA_Measure` 4 · `PA_MeasureCalc` 6 (columns `SelectClause, WhereClause, DateColumn, KeyColumn, OrgColumn, BPartnerColumn, ProductColumn, AD_Table_ID`) ·
`PA_Goal` 4 · `PA_ColorSchema` 2 (e.g. "Red (50) - Yellow (100) - Green": mark1 50 / mark2 100 / mark3 9999) · `PA_DashboardContent` 12. The SQLite seed has `pa_measure`, `pa_goal`,
`pa_dashboardcontent`, `pa_ratio*`, `pa_report*` (+ `pa_measurecalc`, `pa_colorschema`, `ad_chart` from `erp/patches/build_ad_seed_patch.sh:40`) — **but no SQLite code runs them** (only `erp/team_plan.js`
mentions PA). So: legacy's design is "dashboard = rows"; ours is "dashboard = `tiles.js`".
**Consequences (to verify in R0, not assumed):** (a) much of a CAPEX dashboard is expressible in legacy WITHOUT Java — counts/sums as MeasureCalc SQL, thresholds as a ColorSchema (= client Q1), charts as
AD_Chart; (b) per-project logic (EVM health, schedule buckets, average delay) needs either SQL in MeasureCalc or stays named in `tiles.js`; (c) once tiles are PA rows, the SAME definition runs on both
sides — the twin compares a definition's result, not two hand-written formulas — and the "editor" is the generic AD windows (AD-LAYER LAW) — "without coding or AI" is literally true.
**Our value, stated honestly:** not that a dashboard is impossible in legacy, but (1) the DATA that fills it comes from BIM (the empty "no schedule / no cost" buckets), (2) it runs local-first on the twin,
(3) one definition is proven equal on both sides, (4) it is editable as data — and if Sysnova prefers, the same PA rows also run in their legacy ZK.

## 5. ROADMAP — specs to write before each build
- **R0 legacy capability probe** — rows: one `PA_MeasureCalc` (SELECT SUM(PlannedAmt) FROM C_Project …), one `PA_Measure`, one `PA_Goal` + `PA_ColorSchema`, one `AD_Chart`; read back by WS + the ZK
  dashboard render. Witness W-PA-LEGACY-PROBE (value == `tiles.js` approved_budget for the same population; a broken SelectClause must show an error, not a number). ⛔ owner go (pilot config).
- **R1 ONE schedule** — the Project Order fold computes NO schedule: phases/dates from the 4D owner's task list (`{phase, storey, sDays, eDays, guids}`, the objects `run.json` persists); no 4D programme →
  no dates + `NO_4D_SCHEDULE`; lines' phase from their elements' 4D task (never `rates/sequence_rules.json`, "a MIRROR, never executed"); delete the fold's duration loop. Measured gap: HHS 4D last task
  day 54 / `§CPM_RUN makespanDays=35.4` vs fold 2026-11-01 → 2028-05-24; Superstructure 247 d vs ~24 d. Witness W-FOLD-ONE-SCHEDULE (RED on today's fold); regression shed+HHS twin, `poc_fin_evm`,
  `witness_s9_pure`, `poc_fin_period`. Then re-voice the films' model beat with the real programme length.
- **R2 PA engine in SQLite** — port `MMeasure` / `MMeasureCalc` / `MGoal` / `MColorSchema` (legacy source `~/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model/`, cite file:line)
  as ONE generic module; witness = the same rows give the same values as R0 on the pilot.
- **R3 tiles as data** — map each §3 tile to PA rows; what PA cannot express stays in `tiles.js`, NAMED; deletion budget (lines −/+) in the PR.
- **R4 editor** — generic AD windows over PA tables in our ERP UI; an edit → re-render → re-twin; X of N PA windows pass (AD-LAYER LAW rule 2).
- **R5 Sysnova design + DOWN sync** — compare their app tile by tile with §3 (their definitions win); then the read-down sync of the 8 tables into SQLite (idempotent, by `*_UU`, `§DASH_SYNC`
  counts) — read-only role + types on THEIR server via the owner; network path = small job / relay / CORS (owner's choice).
- **Carried (other lanes):** one cost source for BIM lines = `modeller/dxf2bill.js` (DXF2BIM lane) · DocAction-path workflow responsible = Invoker (ERP lane) · seed `bim-…` UUIDs ⏸ HOLD (base hash) ·
  persistent harness twin = SQLiteIDEMPIERE lane proposal (`bim-compiler prompts/SQLiteIDEMPIERE.md §CAPEX-TWIN`).

### 5.1 R1 BUILD SPEC (2026-11-03, written before code) — the fold takes the 4D owner's programme
**Measured first (logs: `cache_4d_run.js HHS_Office_Federated` at code key `b1ea8c3659df` — the persisted run was stale code `dda4439f69cd`):** `§CPM_RUN makespanDays=34.4`; 16 tasks, 6 phases,
day 0 → 53 (Superstructure 0-23, Architecture Envelope 14-25, MEP Rough-in 21-48, Architecture Closeup 30-41, MEP Final 33-52, Finishes 45-53). All 6,839 priced elements sit in a 4D task (0 without).
Fold line keys whose elements span TWO 4D phases: `IfcSlab` (Superstructure 79 / Envelope 4) and `IfcPlate` (Superstructure 191 / Envelope 438) — so a line cannot be keyed by product alone.
**Input (the owner's own objects, no new shape):** `opts.schedule = { start:'YYYY-MM-DD', tasks:[{id, phase, storey, sDays, eDays, guids}], phaseSeq:{phase→sequence} }` = `materializeZones(...).tasks`
(what `cache_4d_run.js` persists as `run.json.tasks`); `phaseSeq` from `rates/4D_template.json phases[].sequence` (owner of the task grid). Days → date = `start + days` (the owner's `_addDays`).
Priced rows gain `guids` (the elements of the row); a producer that has a schedule groups its rows by (disc, cls, storey, 4D task) so no row spans two tasks.
**Rules:**
- R1-a phases = the 4D phases present; SeqNo = template sequence; StartDate/EndDate = start + min(sDays) / start + max(eDays) over that phase's tasks.
- R1-b one C_ProjectTask per 4D task, Name = `<phase> — <storey>` (the name the owner writes into `tasks.name`), under its phase; SeqNo = template sequence.
- R1-c a row's phase and task = the 4D task of its guids. A row with no guids, a guid in no task, or guids in >1 task → phase `Unsequenced`, no task, note `ROW_NOT_IN_ONE_4D_TASK` (never a guess).
  With a schedule, C_ProjectLine natural key = (project, product, 4D task) — every line sits in exactly one Gantt bar; a product over two bars is two lines. Without one: (project, product) as today.
- R1-d no `opts.schedule` → phases grouped as today (classify) with NULL StartDate/EndDate and note `NO_4D_SCHEDULE`; tasks per resource as today. No duration is computed on ANY path.
- R1-e deletion: the duration loop (`LR.productivity`, `Math.ceil(count/20)`, the serial cursor) goes; `laborRates` is no longer read by the fold.
- R1-f producers: `capex/tools/fold_demo.js` reads the schedule via `scripts/cache_4d_run.js read()` (current code key; builds if missing); browser callers (`find_erp_push.js`,
  `proj_order_state.js`) pass none yet → `NO_4D_SCHEDULE` (honest); wiring them to the Time Machine's `materializeZones` result is NAMED, not in this build.
**Witness W-FOLD-ONE-SCHEDULE (`capex/tests/witness_fold_one_schedule.js`, names the defect: "the Project Order carries a programme the 4D owner never produced"):** HHS from the cache — every phase's
Start/End == start + min/max of its 4D tasks; phase set == 4D phase set; task count == 4D task count; every line's phase == the 4D phase of its rows' guids; elements conserved; project PlannedAmt with vs without a
programme differs by at most the per-line 3-dp quantity rounding (bound computed); no `NO_4D_SCHEDULE`. Negative: no schedule → 0 dated phases + `NO_4D_SCHEDULE`. Break switch `BREAK=1` (shift one task) must FAIL. RED on main (main ignores `opts.schedule`:
its phase dates come from its own serial duration loop). Regression before/after: `poc_proj_push`, `poc_fin_evm`, `poc_fin_period`, `witness_s9_pure` (baseline on main: proj_push FAIL and
fin_evm FAIL — both ONLY the stale `navigate_find.js` source-contract check, pre-existing; fin_period PASS; s9_pure 8/0/0).

### 5.2 R1 RESULT (2026-11-03) — logs read (scratch logs, not committed)
**W-FOLD-ONE-SCHEDULE RED on main → GREEN:** main `§W_FOLD1_VERDICT FAIL judged=11 fail=5` (dates, tasks 10≠16, 66/66 lines in the wrong phase, no-programme path dated) → after `PASS judged=11 fail=0`;
`BREAK=1` → `FAIL fail=1` (PHASE-DATES). HHS order now: 6 phases / 16 tasks (one per Gantt bar, `<phase> — <storey>`) / 45 lines (product × 4D task), programme **2026-11-01 → 2026-12-24**
(was → 2028-05-24); Superstructure 2026-11-01 → 11-24 (was 247 d). Money: PlannedAmt 4,996,320.807 with vs 4,996,320.867 without (|Δ| 0.06, bound 18.33 — per-line 3-dp rounding only).
Also fixed on the way: the old serial loop wrote dates in LOCAL time (`toISOString` of a local midnight → Superstructure started 2026-10-31 for a 2026-11-01 start); dates are now UTC days (the owner's `_addDays`).
**Code (lines):** `viewer/proj_fold.js` (duration loop + `laborRates` gone; `opts.schedule`; `NO_4D_SCHEDULE`; `ROW_NOT_IN_ONE_4D_TASK`), new `capex/tools/fold_inputs.js` (ONE node producer: per-element 5D qty grouped
by 4D task + `schedule4D()` from `cache_4d_run.js read()`), `capex/tools/fold_demo.js` uses it (5th arg = start), witness `capex/tests/witness_fold_one_schedule.js`.
**Regression (19 fold callers, before/after, §-lines diffed):** exit codes identical. Two had gone VACUOUS, not red, and were fixed by feeding them the programme: `poc_fin_evm` EVM_4 judged `asOf=null`
(PV 0 = gold 0) → now asOf 2026-06-16, PV 69,147.91 = gold over overlapping 4D phases; `poc_proj_push` §PROJ_SEQ judged null dates → restated: SeqNo = template sequence, dates = the 4D window,
NO ordering claim (Duplex 4D starts MEP Rough-in before Architecture Envelope — "starts monotonic" would have been invented), 5D golden = legacy line rule exact (1,054,482.22784 = fold).
Pre-existing FAILs unchanged (main too): `poc_proj_push`/`poc_fin_evm` source-contract on `navigate_find.js`, `poc_fin_uom`, `poc_bim_overlay` (seed has no BIM rows), `poc_proj_fold_proxy_disc` RED control.
KRN seal hashes moved in `poc_fin_blue_*` (row content changed: NULL dates) — expected. Dashboard compute on the HHS fold (node, `tiles.compute ?project=`): 2026-11-03 On Time; 2026-12-10 At Risk, avg delay 16 d.
**Finding (5D, not 4D — no 4D fix needed):** Duplex prices 1,190 elements, the 4D run schedules 1,119; the 71 extra are `IfcOpeningElement` 50 + `IfcSpace` 21 (voids and rooms — not built work, the 4D owner
rightly leaves them out). They now land in `Unsequenced` with a note instead of a classify() phase. Question for the cost lane: should the 5D quantity producer price voids/spaces at all.
**Open from R1:** (a) R1-f browser: `find_erp_push.js` / `proj_order_state.js` pass no programme → `NO_4D_SCHEDULE` until wired to the Time Machine's `materializeZones` result;
(b) pilot: HHS #1000005 and SHED #1000004 were pushed with the old tree (resource tasks, serial dates) — re-push + `shed_twin.js` needs the owner's go (pilot write); (c) `erp/tests/bake_gw_hospital_seed.js`
still folds without a programme — re-baking moves the Team base hash (⏸ HOLD); (d) films: re-voice the model beat with the programme length read from the recording run's `§FOLD_DEMO_PHASE` lines (nothing voiced before that run).

### 5.3 R0 BUILD SPEC (owner "go" 2026-11-03, written before code) — can legacy compute a CAPEX tile as PA data, with no Java?
**Legacy mechanism, read in source (`~/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model/`):** a Calculated measure's value =
`MMeasureCalc.getSqlPI` (`:153-189`: SelectClause + " " + WhereClause, date filter only for data type T) → `addRestrictions` → `role.addAccessSQL(sql, null, true, false)` (`:612`, the role's client/org
access) → `DB.getSQLValueBD` → `MGoal.setMeasureActual` (`MMeasure.java:500-541`), performance = actual ÷ target, 0 when target is 0 (`MGoal.java:428-436`). It is computed ONLY on a model save of the
goal (`MGoal.afterSave` new record / target / scope changed → `updateGoal(true)`, `:597-605`) or on a ZK dashboard render (`WPAWidget.java:54` → `updateGoal(false)`, which runs when DateLastRun is null
or older than the refresh interval, `:390-399`). A plain SQL insert computes nothing.
**Rows (the tile = "Approved Budget", USD line; `tiles.js` population S with status=all → `SUM(PlannedAmt)` of C_Project where C_Currency_ID=100):**
- migration script (LEGACY CONVENTION, data only) `capex/legacy/migration/iD13/postgresql/202611031900_CAPEX-R0.sql`: PA_MeasureCalc "CAPEX Approved Budget (USD)" (AD_Table C_Project,
  `SELECT SUM(PlannedAmt) FROM C_Project` / `WHERE C_Currency_ID=100`, OrgColumn AD_Org_ID) + PA_Measure (type C, data type S) — client 11, IDs from the 1000000 band + fixed UUs; then the stock
  post-migration `update_sequences` so later saves cannot collide.
- the GOAL is user data (a goal belongs to a user/role, as in the window): created through stock `create_data` (a model save → legacy computes it). Target: **none stated by the client** → 0, so
  GoalPerformance = 0 and the colour is NOT judged (INCONCLUSIVE, §6 Q1). Colour schema = the stock "Red (50) - Yellow (100) - Green" (mandatory column).
- POC-stage pilot types (ad-hoc, `capex/tools/ws_capex_patypes.sql`): `BridgeCreatePAGoal` (createData, PA_Goal) + `QueryPAGoal` (read). AD_Chart and the ZK render are NOT in R0 (named).
**Witness W-PA-LEGACY-PROBE (`capex/tools/pa_probe.js`, issue: "a CAPEX tile cannot be defined as iDempiere PA data without Java"):** legacy `PA_Goal.MeasureActual` (WS read) == `tiles.js`
approved_budget USD over a fresh legacy snapshot (same role 102), to the cent; DateLastRun set by the save. Negative: a goal on a measure whose SelectClause is broken must NOT yield a number
(an error, or MeasureActual unset) — that negative measure is inserted pilot-only by the probe and deleted after. Break switch `BREAK=1` compares against the tile + 1 cent → FAIL.

### 5.4 RESULT 2026-11-03 (owner "go") — R0 legacy PA probe + HHS re-push; logs read (scratch, not committed)
**R0 — W-PA-LEGACY-PROBE `capex/tools/pa_probe.js` PASS judged=4 fail=0, `BREAK=1` → FAIL.** Pilot before→after: `ad_migrationscript` 1300→1301 (`202611031900_CAPEX-R0.sql`, status CO, the first script we
ship in iDempiere's own format) · pa_measurecalc 6→7 · pa_measure 4→5 · `update_sequences()` run (PA_Measure/PA_MeasureCalc next = 1000001) · ws types 280→283 (`ws_capex_patypes.sql`, POC ad-hoc:
BridgeCreatePAGoal, BridgeUpdatePAGoal [MeasureTarget only], QueryPAGoal) · one goal left: "CAPEX Approved Budget (USD)", MeasureActual 4,996,920.867, target 0, performance 0.
Legacy's own measure SQL (`SELECT SUM(PlannedAmt) FROM C_Project WHERE C_Currency_ID=100` + role 102 access) == `tiles.js` approved_budget USD over a fresh legacy read: 4,996,920.87.
**Three legacy behaviours, each from the log AND the source — they bind R2 (the SQLite PA engine must twin them, CARDINAL RULE):**
- (a) **A goal is not computed when it is created.** `MGoal.afterSave` → `updateGoal(true)` → `MMeasure.updateCalculatedGoals` → `MGoal.getMeasureGoals` (`MGoal.java:150-163`) reads with NO trx, so the
  goal still inside its create transaction is invisible: 0 goals updated. MeasureActual stays 0; DateLastRun is set by the constructor default (my probe's first "computed = DateLastRun set" check was
  a bad proxy and is gone). It computes on the next model save that CHANGES target/scope, or on a ZK render once the refresh interval (default 30 min, `MGoal.java:390-399`) has passed.
- (b) **Performance uses the previous committed target.** The same no-trx re-read means a save of target 1→0 scores actual ÷ 1 (GoalPerformance 4,996,920.867 with target 0). The probe resets it to
  legacy's rule for target 0 (= 0, `MGoal.java:428-436`) and logs it.
- (c) **A broken measure shows 0, never an error.** `DB.getSQLValueBD` (`DB.java:1393-1404`) catches the SQL error, logs, returns null; `MMeasure.java:530-535` turns null into 0. No error reaches the caller.
  ⚠ This collides with this lane's PRIME RULE ("an empty / failed population prints no data, never 0") — the twin of a legacy PA tile shows 0 where our page shows "no data". Not decided here (R2 design).
**HHS re-push (pilot write, owner go):** the deletion of the old tree was refused by this session's safety gate, so the old project was kept and made reversible instead: #1000005 Value →
`HHS_Office_Federated_preR1`, IsActive=N (restore = rename back). Push bug found and fixed first: `viewer/erp_rest_push.js` looked a line up by (phase, product) — with lines per product × 4D task it would
have found the first storey's line and dropped the rest; the key now includes the line's task (`poc_erp_rest_push` §-lines identical, PASS — it never pushes two lines of one product in a phase, so the
twin below is the real check). `shed_twin.js <HHS fold> HHS_Office_Federated 2026-11-03`: new project #1000006, `created phases=6 tasks=16 lines=45`, **rows 302/302 MATCH, tiles 16 MATCH / 0 DIFF**,
Last Updated PER_SOURCE. Re-run at today=2026-12-10: `created +0` (idempotent), health red=1, schedule At Risk=1, avg delay 16.00 d — the same on both sides.
**SHED not re-pushed:** its building DB (`/tmp/wt-shed-e2e/buildings/ShedModeller.db`) no longer exists anywhere on disk; rebuilding it is the DXF2BIM lane's job (`prompts/DXF2BIM_ARCHITECT_REVIEW.md`).
On the pilot SHED #1000004 still carries the OLD fold's serial dates. Re-fold (no 4D run exists for the shed → phases without dates, `NO_4D_SCHEDULE`) and re-push when the DB is back.

### 5.5 DECISION + R1-f SPEC (2026-11-03; owner "you can decide") — written before code
**Decision (the §5.4 (c) collision):** the SQLite PA engine (R2) returns what legacy returns — a measure whose SQL fails is **0**, as in legacy (CARDINAL TWIN RULE, incl. L&F) — and logs
`§PA_MEASURE_ERROR measure=<id> sql=<…> err=<…>`. The PRIME RULE is kept by the witness, not by a different number: the twin judges any measure whose SQL errored on EITHER side as INCONCLUSIVE,
never MATCH, and a page built on PA rows shows the error mark beside the 0 only where legacy ZK also does (to be read from the ZK source when R4 builds it). `tiles.js` tiles keep "no data" until R3
moves them onto PA rows. (a) and (b) are twinned too: no compute on create, performance against the previously committed target.
**R1-f — the viewer's push takes the programme the viewer already has.** Owner of "which schedule is active": `ScheduleAuthor.activeSchedule(db)` (authored `SCH_AUTHORED` first, else the imported
one). Owner of the rows: what `materializeZones` / the import wrote — `tasks` (non-summary, dated) + `task_elements`. New `ProjFold.scheduleFromDb(bdb, template)` → the fold's `opts.schedule`
shape: `start` = the schedule's earliest task start; per task `sDays/eDays` = days from it; `phase` = the template phase whose name prefixes the task name as `<phase> — <storey>` (the name
`_writeTemplateSchedule` writes), else the task's WBS parent (summary) name, else none → its rows go to `Unsequenced` (`TASK_PHASE_UNKNOWN`); `phaseSeq` from the template, else by earliest start
(note `PHASE_SEQ_FROM_START`). No active schedule → null → `NO_4D_SCHEDULE` (as today). Callers: `find_erp_push.js _pushToErp` and `proj_order_state.js generate` pass it (`A.db`, `window._4dTemplate`);
their priced rows gain `guids` (both already start from a guid set). Phase dates in the order = the Gantt's own dates.
**Witness W-FOLD-SCHEDULE-FROM-DB (`capex/tests/witness_fold_schedule_from_db.js`; issue: "the viewer's push ignores the programme on screen"):** run the shipped pipeline on HHS (`cache_4d_run.build`
with a read-only `onDb` hook, no second harness) → `scheduleFromDb(db, template)` == the run's own `res.tasks` (same ids, phase, storey, guid sets, day offsets); then the fold over it gives phase
dates == the DB's task dates. Negative: a DB with no schedule → null. Break `BREAK=1` (drop one task_elements row) must FAIL. Regression: `witness_s9_pure`, `witness_civil_find_erp_push`, W-FOLD-ONE-SCHEDULE.

### 5.6 R1-f RESULT (2026-11-03) — logs read
`ProjFold.scheduleFromDb` + `ProjFold.pricedPerTask` (viewer/proj_fold.js), wired in `find_erp_push.js _pushToErp` (whole-selection size cap kept) and `proj_order_state._foldOpts` (`env.schedule`).
`scripts/cache_4d_run.js build(bld, force, want, hooks)` gained a read-only `onDb` hook (cache_4d_run.js is not in its own code key — caches unaffected).
- **W-FOLD-SCHEDULE-FROM-DB PASS 8/8** (`capex/tests/witness_fold_schedule_from_db.js`): reader == the pipeline's own 16 tasks (ids, phase, storey, start/end, 6,839 element ids); no schedule → null; `BREAK=1` → FAIL.
- **W-FIND-PUSH-4D PASS 5/5** (`capex/tests/witness_find_push_4d.js`, headless — the REAL `_pushToErp` with stubbed OPFS/DOM): `§PROJ_PUSH_SCHEDULE from=building db SCH_AUTHORED tasks=16`, order
  phases == the Gantt's dates (Superstructure 2026-01-01 → 01-24 … Finishes 02-15 → 02-23), 16 tasks; no programme → 6 phases without dates + `§PROJ_PUSH_SCHEDULE none`; `BREAK=1` → FAIL.
- Regression: W-FOLD-ONE-SCHEDULE 11/11, `witness_s9_pure` 8/0/0, `poc_proj_push` engine PASS, `poc_erp_rest_push` PASS, `witness_exact_lookup_p2` 8/0 — unchanged; `poc_fin_evm` only its
  pre-existing EVM_6 source-contract FAIL. NOT run: `viewer/tests/witness_civil_find_erp_push.js` (Playwright + full GPU viewer — not run unasked; my one attempt was from the wrong cwd and closed).

## 6. ⛔ Questions for the client (via the owner; Q1 thresholds map to `PA_ColorSchema` once R3 lands) (formula not stated, no honest iDempiere column)
Q1 Health Green/Amber/Red thresholds (we use SPI/CPI 0.9 provisional, only 0.9 is theirs) and whether health uses cost (CPI) at all.
Q2 Project Stage: how do Concept / Initiation / Planning / Execution / Closing map onto `C_Project.C_Phase_ID` (stock `C_Phase` rows are sales-cycle steps in the seed)? Or is it a custom column/`C_ProjectType`?
Q3 Forecast Cost at Completion: formula (EAC = AC + (BAC-EV)/CPI? or Planned + overrun?) and its source columns.
Q4 Committed split "verified vs contract": which columns (`C_ProjectLine.CommittedAmt` vs invoiced? `C_Order` PO totals?).
Q5 Approval Pending: which workflow activities count (all `AD_WF_Activity` suspended? only on project documents? which AD_Table)?
Q6 Procurement Risks and Handover: definition and source columns.
Q7 "Closed" project = `Processed='Y'`? and "completed this year" date = `DateFinish`? Also the BIM link shape (`db=` form vs `building=` form).
Q8 Payment-based financial progress (their own caveat says it is not in the ERP) — which table will carry it?
Q9 Legacy read types for C_ProjectPhase / C_ProjectTask / C_ProjectLine / C_Phase / C_Currency / AD_WF_Activity: owner's go to register them on the legacy server (WS Type rows) so Source B is complete.


## 7. Machine state (left 2026-11-03)
Local pilot `~/idempiere-pilot` (:8088, docker `postgres` DB `idempiere_pilot`) runs with the CAPEX read/write/update WS types + the R0 PA types (restore recipes in the four `ws_capex_*.sql` headers),
migration `202611031900_CAPEX-R0.sql` applied (PA_MeasureCalc/PA_Measure 1000000) + goal "CAPEX Approved Budget (USD)", and holds pushed projects SHED (#1000004, OLD fold: serial dates),
HHS_Office_Federated (#1000006, R1 fold: 4D dates, 45 lines) and the kept pre-R1 HHS (#1000005, Value `HHS_Office_Federated_preR1`, inactive; its Superstructure IsComplete=Y from the film beat). Nothing on any client server. Film inputs kept in `~/.cache/capex_film/` (scratch DBs + legacy snapshots, not committed).
