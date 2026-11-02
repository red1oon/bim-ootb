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
1. **R0 — measure what legacy can already do** (answers "is the Sysnova dashboard doable in legacy?"): define ONE CAPEX measure (Approved Budget) + one goal with a colour schema + one chart as PA/AD_Chart
   rows on the LOCAL pilot and read the result back (WS read + ZK render log). The rows ship as ONE migration script in iDempiere's format (LEGACY CONVENTION below) — PA is data, no process,
   so no plugin. ⛔ owner go: it is a config change on the pilot (data rows, restorable).
2. **R1 — ONE schedule — ✅ DONE (engine + node path, witness §5.2)**; open from it: browser callers pass no programme yet (R1-f), re-push + re-twin HHS/shed on the pilot (owner go), re-voice the films.
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
Local pilot `~/idempiere-pilot` (:8088, docker `postgres` DB `idempiere_pilot`) runs with the CAPEX read/write/update WS types (restore recipes in the three `ws_capex_*.sql` headers) and holds pushed
projects SHED (#1000004) and HHS_Office_Federated (#1000005, Superstructure IsComplete=Y). Nothing on any client server. Film inputs kept in `~/.cache/capex_film/` (scratch DBs + legacy snapshots, not committed).
