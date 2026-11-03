# ⚠ DO NOT REMOVE
SCOPE: the **Project Order / CAPEX dashboard** — `capex/` in bim-ootb (vanilla HTML/JS, no framework, no build step, no client name in code) — its data, its twin with legacy iDempiere, and its road to
being **editable without code or AI**. Every number comes from rows of a real DB (SQLite ERP twin = Source A, legacy iDempiere via stock WebServices = Source B). An empty population prints
"no data" / INCONCLUSIVE, never 0 % or green. **Read the log after every run (`§DASH_*`, `§SHED_*`, `§FILM_SHOT`); the exit code is not evidence.** Spec before code; every witness names the issue it
proves and has a break switch that must FAIL. Honour this block until the lane is closed. Full history (sessions 88 + 77, 2026-11-02 → 11-03): `prompts/archive/CAPEX_DASHBOARD_history_2026-11-02_to_11-03.md`.

## ▶ RESUME HERE (rewritten 2026-11-03 end of session for a NEW session — the ONLY current block; older resume text is history in §5.x)
**TWO TASKS — keep them apart (owner 2026-11-03):**
- **TASK 1 — THE DASHBOARD** (this file). Built from the ground up on OUR SQLite WASM framework (§5.13): data in the browser's SQLite ERP DB (the twin) → dashboard DEFINED as iDempiere PA rows
  (PA_MeasureCalc / PA_Measure / PA_Goal / PA_ColorSchema / PA_DashboardContent — the same rows legacy runs, R0 §5.4) → a SQLite PA engine → a generic renderer → the generic AD windows as the editor.
  NOT inside the iDempiere plugin, NOT a ZK gadget, NOT a separate server (§5.12 superseded).
- **TASK 2 — THE iDEMPIERE PLUGIN `org.idempiere.bimootb`** = ONLY the BIM Viewer → ERP Project Order (owner: *"the plugin is only for the BIM to ERP Project Order"*). Lane file: bim-compiler
  `prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md` §8–§8.8 (two bundles: tab + 2Pack / the viewer at `/bimootb`). The dashboard's files are NOT in it.
**What the CAPEX film's "no change" line meant (correction, owner 2026-11-03: "Clarify over our film statement that no change needed actually meant"):** the shipped film says (bim-compiler
`prompts/film_narration_capex_addon_en_v5.tsv` row 2): *"F: So what do I have to change in iDempiere? M: Nothing. No plugin, no new table. It reads through the standard web services, keeps its own
local copy, and the dashboard runs on that copy."* **"Nothing" overclaimed** — the same row's own fact column says "read-only query types + create types on the test server". What is true FOR THE
DASHBOARD: no change to iDempiere's code, no plugin, no new table or column. It still needs SETUP DATA on their
iDempiere: read-only web-service types for the tables it reads + a read-only user/role (and, once PA-defined, its PA rows) — data, shipped the iDempiere way (migration script / 2Pack, LEGACY
CONVENTION below). It does NOT cover the BIM push: sending a Project Order INTO iDempiere needs TASK 2's plugin (its create types, the "BIM OOTB Push" master role, settings, the BIM tab). Any future
film/doc says it this way: *"No change to iDempiere's code or tables. The dashboard needs only read-only setup data; the BIM push is one standard plugin."*
**Sysnova (2026-11-03):** their PM replied their dashboard is **still a prototype** (§6 Q-S2) → **we proceed with ours**, as we are further along (owner). Q-S1/Q-S3..S6 stay useful (their tile
definitions feed L2 rows); Q1–Q8 still open.
**State (merged, witnessed — details in the §5.x RESULT sections):** R0 legacy PA probe (#2551) · R1 one schedule from the 4D owner (#2550) · R1-f viewer push carries the Gantt (#2552) · SHED on R1 (#2555)
· WS lookups by DataRow keys, no free Filter (IDEMPIERE-1784, #2558) · money tiles SUM-then-round (#2559) · P5 viewer push lands in iDempiere, password in memory only (#2561) · viewer store opens with the
ERP boot overlays (#2563) · specs §5.12/§5.13 (#2567, #2568). Plugin (bim-compiler): renewal #316, P5 tab login context #319, browser checks + bundle rule + ZK requires #321.
**▶ NEXT — TASK 1 (dashboard, §5.13 build order; spec line + witness before each):**
1. **G1** `erp/pa_engine.js` — port MMeasure / MMeasureCalc / MGoal / MColorSchema (cite `~/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model/` file:line); SQL through
   `erp/ad_callout.js convertSql`; W-PA-ENGINE: the R0 measure (Approved Budget USD) == the pilot goal "CAPEX Approved Budget (USD)" to the cent; broken SQL → 0 + INCONCLUSIVE (§5.5); BREAK=1 FAIL.
2. **G2** the §3 count/sum tiles as PA rows (W-PA-TILES-ORACLE: each == `tiles.js`) · **G3** renderer from PA_DashboardContent (W-PA-RENDER) · **G4** bucket tiles (health / schedule / budget status:
   PA SQL in both dialects, or named generic tile kinds) · **G5** editor windows X of 5 (W-PA-EDITOR) · **G6** DOWN copy of a real site (needs their read-only account, §6 Q-S3/Q-S4).
3. Then `tiles.js`'s hand formulas are deleted (deletion budget) — today's `capex/` page is the ORACLE until every PA tile matches.
**▶ NEXT — TASK 2 (plugin, bim-compiler §8.8):** B3 = the BIM tab in ZK: give tab 200500 its AD_Field rows (key C_Project_ID hidden, Value, Name, Description) through the dictionary, push the
link-back Description (`BIM src db=…`) with the plan (`viewer/erp_push_plan.js` + the `BIMOOTB_Create_C_Project` whitelist), re-Pack-Out, reinstall, re-run B3 headless. Then the film "Installing BIM to
iDempiere" (storyboard §8.5 — ⛔ owner OK of the storyboard + language set still pending). Later: the Tycho/Maven build (the convention) replaces `tools/build_bundle_poc.sh`.
**Machine state:** local pilot `~/idempiere-pilot` (:8088, DB `idempiere_pilot`, RUNNING) holds the POC types (Filter Constant `1=1`), the BIMOOTB_* types + master role, the R0 PA rows + goal, role
"BIM Push Test" 1200003, and test projects (SHED #1000007 + SHED_preR1 #1000004, HHS #1000010 + HHS_Office_Federated_preR1/_preKeys #1000005/#1000006, HHS_PLUGIN_POC #1000009, witness runs
HHS_VIEWER_PUSH_* #1000011-#1000014 — never deleted: the safety gate refuses deletes; rename + IsActive=N instead). Clean plugin-only test instance `~/idempiere-bimplugin` (:8098/:8454, DB
`idempiere_bimplugin` = TEMPLATE pilot_snap, STOPPED; `start.sh`/`stop.sh` — its stop pattern matches ONLY that path; install = 2 `bundles.info` lines). Scratch: bundles under the session scratchpad
(rebuild with bim-compiler `iDempiereOOTB/org.idempiere.bimootb/tools/build_bundle_poc.sh <server> <bim-ootb> <out>` — it must print `§BIMOOTB_BUNDLE`).
**Landmines learned this session (do not re-learn):** iDempiere refuses a FREE `Filter` WS param on any model save (IDEMPIERE-1784) → find by DataRow keys · a WS access refusal is cached 60 min per
(role, type) → restart or Cache Reset after including a role · Pack Out exports only the LOGIN client's rows, and role 0 is not allowed on web services (use a System WS role) · a web bundle that
Require-Bundles org.adempiere.ui.zk fails to start (split the viewer into its own bundle) and the tab bundle must Require-Bundle zcommon/zk/zul/zweb · headless Chrome: `--disable-gpu` kills WebGL —
use `--use-gl=swiftshader --disable-gpu-sandbox --enable-unsafe-swiftshader` · never `pkill -f <text in your own command>` · a copied server's stop script must be re-pointed BEFORE first start.
**Rules that bind:** PRIME RULE · CARDINAL TWIN RULE (SQLite == legacy incl. L&F; fixes on the SQLite side; exemptions only in the owner's words) · AD-LAYER LAW (one generic engine, X of N) · one
owner per relation (4D: `bim-compiler prompts/4D_MODEL_INTEGRITY.md §I`) · never move the Team base hash (`erp/patches/ad_seed.db.sql`) without the owner — use a boot overlay · every legacy-server config
change needs the owner's go (local pilot / test instance only so far) · never `git stash` · never claude-in-chrome · bim-ootb only in a `/tmp/wt-*` worktree · no `.db` committed · agents = Sonnet.
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

### 5.7 SHED on the R1 fold (2026-11-03, agent) — SPEC (written before the pilot steps)
Claim: the SHED Project Order, folded with the 4D owner's programme (R1) and re-pushed to the LOCAL pilot, twins PASS. Steps: (1) pick the building DB by measuring against the old fold (golden 15,147,437 BDT, 6 phases, 8 tasks, 12 lines);
(2) `cache_4d_run.js` for it; (3) `fold_demo.js` with `BLD_DIR` = scratch (`§FOLD_INPUT_4D`, `§FOLD_DEMO_PHASE`); (4) pilot: rename old #1000004 to `SHED_preR1` + IsActive=N ONLY if the new Value is `SHED` (no deletes), count before/after;
(5) `shed_twin.js` at 2026-11-03 then at a later date: `§SHED_TWIN_VERDICT` must PASS, second run `created +0`. A DIFF is a SQLite-side defect to fix (CARDINAL TWIN RULE), never hidden. Scratch: `/tmp/claude-shed-scratch` (no .db committed).

### 5.7 RESULT (2026-11-03, agent) — logs read (scratch `/tmp/claude-shed-scratch`, not committed)
**Source chosen (measured):** the CLI on the marked sheets (`dxf2bim_cli.js --sheets .../why/cli/marked/*.dxf --out D --pack pwd2024_bd --complete --ifc` → `D/model.ifc`, 512 bodies) extracted with `~/bim-compiler/scripts/extractIFC2DB.js`; the extractor takes the building name
from the IFC basename, so `SHED.ifc` → building `SHED` → project Value `SHED` (`model.ifc` → `model`). Compared on the old fold (golden 15,147,437 / 6 phases / 8 tasks / 12 lines), all folded without a programme: kept model
`ShedDrawing_512_extracted.db` → golden 14,836,915 (-310,522), 11 lines, 2 products; CLI-from-marked → 15,139,267 (-8,170), 11 lines. Neither reproduces the gone DB exactly (the CLI one is 0.05 % off; the kept one was rebuilt with manual
`--layer/--datum/--bodyz` options, 2 % off). With the programme the CLI one gives 12 lines (the old count): golden 15,139,268; PlannedAmt 15,139,265.66847 (`§FOLD_DEMO_NOTE LEGACY_LINE_RULE`). Residual gap to 15,147,437 is a different source DB, not explained further.
**4D run (yes):** `BLD_DIR=D cache_4d_run.js SHED` → `§CACHE_BUILT SHED n=512 scheduled=512` (code key b1ea8c3659df), `§CELL_RUN makespanDays=5.1`, `§AUTHOR_TPL tasks=5 edges=4 totalDays=9`, `§TPL_PHASE_COVERAGE declared=7 levels=1 tasksEmitted=5 absentPhasesEntirely=2` (single storey; MEP Rough-in absent).
**Fold:** `§FOLD_INPUT_4D bld=SHED tasks=5 lastDay=9`; created 5 phases / 5 tasks / 12 lines / 2 products; programme 2026-11-01 → 11-10 (Substructure 11-01→11-02, Superstructure 11-02→11-07, Envelope 11-07→11-08, Closeup 11-08→11-09, Finishes 11-09→11-10). Old fold: 6 phases / 8 tasks (serial dates to 2027-01-04).
`witness_fold_one_schedule.js SHED` → `§W_FOLD1_VERDICT INCONCLUSIVE no building db for SHED` (it reads only `buildings/<bld>_extracted.db`; scratch DB not copied in, by rule).
**Pilot:** old #1000004 → Value `SHED_preR1`, name `BIM: SHED (pre-R1 fold, kept)`, IsActive=N (no deletes; restore = rename back). New SHED = **#1000007**. Counts c_project/phase/task/line before 6/18/34/77 → after 7/23/39/89.
**Twin, today=2026-11-03:** `§SHED_PUSH projectId=1000007 created={"projects":1,"phases":5,"tasks":5,"lines":12}` · `§SHED_TWIN_VERDICT PASS tiles(match=17 diff=0 inconclusive=2) rows(match=109 diff=0)` (inconclusive = forecast_cost PENDING, actual_overrun no data; last_updated PER_SOURCE; schedule atrisk=1, avg_delay 1.00 d).
**Twin, today=2026-12-10:** `created={projects:0,phases:0,tasks:0,lines:0}` (idempotent) · `§SHED_TWIN_VERDICT PASS tiles(match=17 diff=0 inconclusive=2) rows(match=109 diff=0)`; health red=1, schedule atrisk=1, avg_delay 38.00 d, budget_status notstarted=1 — same on both sides.
No defect found; no code changed.

### 5.8 No FREE `Filter` — legacy lookups by DataRow KEY fields (2026-11-03, agent) — SPEC
**Issue:** iDempiere refuses a FREE `Filter` web-service parameter (`MWebServicePara.beforeSave :114-121`, IDEMPIERE-1784); a properly made 2Pack of our types failed with it. Our pilot types were inserted by SQL (rule skipped), and the push + CAPEX tools sent
`Filter` strings. **Mechanism (read from source, not guessed):** `ModelADServiceImpl.validateParameter :307-338` (a Filter may only be Constant; a type with no Filter param refuses a sent Filter: "invalid parameter Filter"); `queryData :1470-1500` (each DataRow
field whitelisted as `WS_WebServiceFieldInput` becomes `col LIKE ?` for CHAR columns, `col=?` otherwise; a non-whitelisted column → "input column X not allowed" `:1494-1498`).
**Design (one owner):** `viewer/erp_rest_push.js` `queryRows(base, login, type, table, keys)` — DataRow keys on the wire, then an EXACT post-filter (ids as numbers, else strings) because CHAR keys are LIKE (`_`/`%` wildcards; a literal `\` is doubled), logging
`§ERP_REST_LIKE_EXTRA table=… dropped=N`; any non-200 / non-`WindowTabData` reply THROWS (`§ERP_REST_QUERY_ERR` — a legacy fault must never read as "0 rows", which would create a duplicate). `findOrCreate` and every capex tool (`shed_twin`, `phase_progress`, `pa_probe`) use it;
`adapters.loadLegacy` simply stops sending `Filter:''`. Pilot types: Filter param → Constant `1=1`; key columns → `WS_WebServiceFieldInput` (`capex/tools/ws_capex_querykeys.sql`, UPDATE/INSERT only, idempotent; the three create-scripts now insert Filter as `C`/`1=1`).
**Keys:** C_Project `Value` (+`C_Project_ID` for reads) · C_ProjectPhase `C_Project_ID`+`Name` (+`C_ProjectPhase_ID`) · C_ProjectTask `C_ProjectPhase_ID`+`Name` · C_ProjectLine `C_ProjectPhase_ID`+`M_Product_ID` (+`C_ProjectTask_ID` when the line has a task) · M_Product `Value` · M_Product_Category `Name` · C_UOM `X12DE355` · PA_Goal `Name`+`PA_Goal_ID`.
**Mock (`tests/mock_adinterface_server.js`)** now enforces legacy's two rules (request Filter → HTTP 500 "invalid parameter Filter"; non-whitelisted query DataRow column → 500 "input column X not allowed") and binds string keys with LIKE semantics. Witness claims (each can FAIL): old client vs new mock FAILs (6 mismatches);
`§POC_LIKE_EXTRA` (`BREAK=1` → FAIL); twin end-of-chain `created +0` and `§SHED_TWIN_VERDICT PASS`. Not touched: `BIMOOTB_*` types (the plugin, other session — its `BIMOOTB_Query_<Table>` types must whitelist the same keys to be read with `BRIDGE_SVC=bimootb`); `erp/tests/witness_ws_*.js` (send Filter to other types, out of capex/viewer scope).

### 5.8 RESULT (2026-11-03, agent) — logs read (scratch `/tmp/claude-wskeys-scratch`, not committed; spec and code were written in the same pass — the SPEC above was not committed ahead of the code)
**Mock, `tests/poc_erp_rest_push.js`.** BEFORE (main): `§POC_RUN1 … OK` · `§POC_RUN2_CALLS query=14 create=0 OK` · `§POC_WHITELIST_REJECT … OK` · `§POC_D1_METHOD_BOUND … calls=26 OK` · `§POC_ERP_REST_PUSH_VERDICT PASS` (mock accepted Filter strings — it could not fail on them).
AFTER (new mock + new client): `§POC_FILTER_REFUSED status=500 OK (legacy: invalid parameter Filter)` · `§POC_QUERY_COLUMN_REFUSED status=500 OK (legacy: input column Description not allowed)` · `§POC_CLIENT_FILTER_FREE filtersSentByClient=0 OK` ·
`§ERP_REST_LIKE_EXTRA table=M_Product dropped=1 kept=0` · `§POC_LIKE_EXTRA productsCreatedForKey_WALL_=1 expected=1 likeExtraLogged=1 OK (exact post-filter dropped the LIKE extra)` · `§POC_ERP_REST_PUSH_VERDICT PASS` (RUN2_CALLS query=14 create=0, D1 calls=26, unchanged).
Break: `BREAK=1` → `§POC_LIKE_EXTRA … expected=0 … MISMATCH` + `VERDICT FAIL (1)`. OLD client (main) against the NEW mock → `VERDICT FAIL (6)` (the mock now refuses what legacy refuses).
**Pilot rows (local pilot, docker `postgres` / `idempiere_pilot`)** — `capex/tools/ws_capex_querykeys.sql`: `§WS_QUERYKEYS filter_params_set_to_constant=11 input_rows_added=15`, re-run `=0 / 0` (idempotent). Types changed (11): QueryCProject, QueryCProjectPhase, QueryCProjectTask, QueryCProjectLine, QueryMProduct, QueryMProductCategory,
QueryCUOM, QueryPAGoal, QueryCPhase, QueryCCurrency, QueryADWFActivity — all `F`/none → `C`/`1=1`; key inputs 0 → as listed above on the first 8. Whole-DB Filter params: Free 122 → 111, Constant 8 → 19. No row deleted; no BIMOOTB_* type touched. Server restarted (`stop.sh`/`start.sh`), /webui/ 200.
**Twins (pilot, today=2026-11-03; all queries now `keys=` only — 217 key-queries in one HHS log, 0 Filters).**
- SHED, BEFORE (main code, Filter) → AFTER: `§SHED_PUSH projectId=1000007 created={"categories":0,"products":0,"projects":0,"phases":0,"tasks":0,"lines":0}` · `§SHED_TWIN_VERDICT PASS tiles(match=17 diff=0 inconclusive=2) rows(match=109 diff=0)` — identical both runs.
- HHS, BEFORE (main code) on the pilot as found: `§SHED_TWIN_VERDICT FAIL tiles(match=16 diff=0 inconclusive=3) rows(match=295 diff=7)`; AFTER the change, same pilot state: identical `FAIL … rows(match=295 diff=7)`. **Pre-existing, not from this change:** the pilot's HHS project (#1000006) had been pushed from an earlier fold whose UUs differ, so the compare fell back to
  description and mismatched the 3 duplicate-description line pairs (Architecture Envelope/IfcSlab, MEP Rough-in/IfcFlowFitting, Superstructure/IfcPlate). Fix used (§5.7 precedent, no deletes): #1000006 renamed `HHS_Office_Federated_preKeys`, IsActive=N, and the fold re-pushed THROUGH THE NEW KEY LOOKUPS from scratch:
  `§SHED_PUSH projectId=1000010 created={"categories":0,"products":0,"projects":1,"phases":6,"tasks":16,"lines":45}` · `§SHED_TWIN_VERDICT PASS tiles(match=16 diff=0 inconclusive=3) rows(match=302 diff=0) created={…projects:1,phases:6,tasks:16,lines:45}`; 2nd run: `created={"categories":0,"products":0,"projects":0,"phases":0,"tasks":0,"lines":0}` · `§SHED_TWIN_VERDICT PASS … rows(match=302 diff=0)`.
  Pilot totals c_project/phase/task/line 8/29/55/134 → 9/35/71/179 (restore = rename back).
- `legacy_snapshot.js`: BEFORE `projects=7 phases=29 tasks=55 lines=134 orgs=10 phaseRef=13 currencies=175 wf=264 unavailable=[]` → AFTER the key change (same data) identical; after the fresh HHS push `projects=8 phases=35 tasks=71 lines=179` (the added project only).
- `pa_probe.js`: BEFORE (main code) `§PA_PROBE_VERDICT FAIL judged=4 fail=1` (`legacy=14989562.481 tile=14989562.49`) → AFTER `FAIL judged=4 fail=1` (same assert; after the fresh HHS push `legacy=19985883.288 tile=19985883.30`); `BREAK=1` → FAIL. **Pre-existing, unchanged by this work:** the pilot now holds 3-dp PlannedAmt, and legacy's raw sum differs from the tile's cent-rounded sum at the 3rd decimal (the §5.4 PASS predates the HHS/SHED pushes). Not fixed here; a SQLite-side (tiles.js) rounding question for the owner/next lane. Asserts 1, 3, 4 PASS.
**Other regressions (BEFORE on main → AFTER):** `witness_fold_one_schedule.js` `§W_FOLD1_VERDICT PASS judged=11 fail=0 inconclusive=0` → same · `witness_find_push_4d.js` `§W_FP4D_VERDICT FAIL judged=5 fail=3` → same 3 FAILs (ORDER PHASE DATES, ONE TASK PER GANTT BAR order=0, NO PROGRAMME → no dates) — already failing on main, it does not use the REST push · `witness_capex.js` NOT run (headless-Chromium witness; the brief forbids browser runs) — `adapters.loadLegacy` change (drop `Filter:''`) is covered by `legacy_snapshot.js` and both twins, which call it.

### 5.9 Money tiles: SUM then round once; W-FIND-PUSH-4D stub follows #2557 (2026-11-03) — spec + result; logs read
**Defect (found by `pa_probe` once the pilot held 3+ USD projects):** `tiles.js sumBy` rounded each project to the cent and then added (`cents()` per row) — the tile's own formula
(`SUM(C_Project.PlannedAmt) per C_Currency_ID`) and legacy's PA measure add first and round once: `legacy=14989562.481 tile=14989562.49`, later `19985883.288` vs `19985883.30`. Both twin sides run
`tiles.js`, so the twin could not see it; only the legacy measure (R0) could. **Fix (SQLite side, CARDINAL):** `sumBy` adds each currency's values exactly (the value's own decimal text as a BigInt
at 1e-9) and rounds half away from zero once. Every money tile goes through `sumBy` (approved, actual, committed, invoiced, the % of plan and spent denominators).
**Witness W-TILES-SUM-ONCE** (`capex/tests/witness_tiles_sum_once.js`, node): main's tiles.js FAIL 3/4 (3 × 0.004 → 0 instead of 1 cent; the pilot-shape sum 1498896249 instead of 1498896248;
-0.005 → 0) → PASS 4/4; `BREAK=1` → FAIL. **End of chain:** `pa_probe` `§PA_PROBE_VERDICT PASS judged=4 fail=0` (legacy 19985883.288 == tile 19985883.29); HHS twin
`§SHED_TWIN_VERDICT PASS tiles(match=16 diff=0 inconclusive=3) rows(match=302 diff=0)` created +0.
**Instrument fix:** `capex/tests/witness_find_push_4d.js` stubbed `ProjOrderState.openStore`; #2557 moved the push to `ProjOrderState.shared()`, so the push fell through to a real fetch
(`§PROJ_PUSH_DBERR not used`) and the witness read an empty store (FAIL 3/5 — reported in §5.8 as "fails on main"). Stub now provides `shared/persistShared` → PASS 5/5 on main + this change.

### 5.10 P5 — the viewer's own Find › ERP push lands in a real iDempiere (2026-11-03, agent) — SPEC POINTER + RESULT (logs read; scratch `/tmp/claude-p5-scratch`, not committed)
**Spec (the contract, written before code):** bim-compiler `prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md` §8.6 SPEC P5 (branch `plugin/p5-viewer-push`). Items 1-4 built here: `viewer/erp_push_plan.js` (`planFromDb(db, value)` → `{plan, notes}` MOVED from `capex/tools/shed_twin.js`; `bimootbServiceTypes()`; `legacyTarget(loc)`),
`A.LEGACY_ERP` (+ `A.LEGACY_ERP_CTX` = the five non-secret `erp*` URL params) in `config.js`, `_pushLegacy` in `find_erp_push.js` after the local fold (password dialog; password only in the `_erpPass` closure variable, scrubbed from every logged string, forgotten on any failed push), `viewer.html` tags, `sw.js` v1676.
**Deletion budget:** `shed_twin.js` −25/+4 (inline plan builder, `uuField`/`UUID`/`notes`, the BRIDGE_SVC map deleted → shared module); whole change 9 files incl. the new module (69) and witness (166).
**Finding while building:** the plugin's `BIMOOTB_Query_C_Project` whitelists key `Value` only (not `C_Project_ID`) — a read by `C_Project_ID` is HTTP 500; the witness reads the project by `Value`.
**Witness `capex/tests/witness_viewer_push_legacy.js` (W-VIEWER-PUSH-LEGACY)** — drives the REAL `_pushToErp`; issue: "the viewer's push stops at its local store / lands different numbers / duplicates / leaks or keeps a refused password". Dialog stubbed; target = local pilot :8088, GardenAdmin, client 11, role 1200003, org 11, wh 103.
First attempt FAILed 13 (modules not exposed as globals in the harness — `§PROJ_PUSH_LEGACY_ERR … reason=module-absent`), second errored on the C_Project_ID read above; a third run passed but with phase dates `null → null` on both sides (the 4D template global was not set) — made non-vacuous (dates must be non-empty), then:
`§W_VPL_PROJECT HHS_VIEWER_PUSH_261103050809 legacy C_Project_ID=1000013` · `§PROJ_PUSH_LEGACY … created={"categories":0,"products":0,"projects":1,"phases":6,"tasks":10,"lines":19}` · PlannedAmt legacy=fold=4996320.724 · six phase dates identical (e.g. Superstructure 2026-01-01 → 2026-01-24 both) ·
2nd push `created` all 0, no 2nd dialog · no target `§PROJ_PUSH_LEGACY skip=no-target`, fetchCalls=0 · wrong password `Error login - User invalid`, fetchCalls=1, 0 rows created, status text shows the failure, next push asks again (asks=2), cancelled dialog → `skip=no-credentials` · password absent from 939 captured lines (real and wrong).
`§W_VPL_VERDICT PASS judged=24 fail=0 project=HHS_VIEWER_PUSH_261103050809 legacyId=1000013`. Break: `BREAK=1` → `§W_VPL_ASSERT FAIL LEGACY == FOLD: phase count legacy=6 fold=6` · `§W_VPL_VERDICT FAIL judged=24 fail=1 … legacyId=1000014 (BREAK=1 — must be FAIL)`.
Pilot projects left in place (no deletes): 1000011, 1000012 (early iterations, no dates), 1000013 (the PASS run), 1000014 (the BREAK run). Each run adds one.
**Regression BEFORE (main, detached checkout) → AFTER:** `§W_FP4D_VERDICT PASS judged=5 fail=0` → same · `§POC_ERP_REST_PUSH_VERDICT PASS` → same · `§W_FOLD1_VERDICT PASS judged=11 fail=0 inconclusive=0` → same ·
HHS `§SHED_TWIN_VERDICT PASS tiles(match=16 diff=0 inconclusive=3) rows(match=302 diff=0) created={…0…}` → identical; SHED (`fold_shed.db`, the file with Value `SHED`) `§SHED_TWIN_VERDICT PASS tiles(match=17 diff=0 inconclusive=2) rows(match=109 diff=0) created={…0…}` → identical (non-`§ERP_REST` log lines diff-empty for HHS).
Not done: the BIM tab passing the `erp*` params (bim-compiler `BIMTabPanel`, other lane); the shipped DOM dialog `_askLoginDom` is untested headlessly (no browser allowed) — the witness stubs `D.askErpLogin` as specified.

### 5.11 The viewer's Project-Order store opens with the ERP's boot overlays (2026-11-03) — spec + result; logs read
**Found by the headless browser check** (bim-compiler `prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §8.8`, software GL, test instance): the viewer's real push from `/bimootb` was refused by legacy —
`§ERP_REST_CREATE_ERR M_Product: … null value in column "c_taxcategory_id"`. Cause: `ProjOrderState.openStore` (`viewer/proj_order_state.js:42-53`) opened the seed / OPFS store WITHOUT the ERP's own boot
overlays, which every other opener applies (`erp/idempiere.html:1155-1156`, `erp/ws_kernel.js:19-20`, `capex/tools/fold_demo.js:19`) — so the viewer's ERP data was not the ERP app's (TWIN rule).
**Fix:** `openStore` applies `AdDocValueOverlay` + `AdTaxCatOverlay` (globals in the browser, `require` in node; idempotent; logged `§S9-STORE overlays src=…`); `viewer.html` loads
`../erp/ad_docvalue_wf.js`, `ad_docvalue_overlay.js`, `ad_taxcat_overlay.js` (the ERP's order, `erp/idempiere.html:505`); sw precache + bump.
**Witness W-VIEWER-STORE-OVERLAYS** (`capex/tests/witness_viewer_store_overlays.js`, node): raw seed 41 products without a tax category (a default exists) → the store 0; `BREAK=1` (overlays hidden) → 41 → FAIL;
main's `proj_order_state.js` → 41. **End of chain (browser, test instance):** the same push then `§PROJ_PUSH_LEGACY base=http://localhost:8098 … projectId=1000003`; legacy == local fold (7/10/16,
PlannedAmt 383827.36788); the real password dialog shown prefilled (user/client/role/org/warehouse read-only, only the password typed), removed after submit, password in 0 of 697 log lines.

### 5.12 SPEC — the dashboard the way Sysnova runs theirs: a standalone app beside iDempiere (2026-11-03; written before code) — ⛔ SUPERSEDED by §5.13 (owner: ground up, same SQLite WASM framework)
**Owner:** *"i was originally proposing that the plugin is only for the BIM to ERP Project Order"* · *"If u already could guess from the info what they are using we be copying that"*. So the dashboard is
NOT in `org.idempiere.bimootb` and NOT a ZK gadget; it copies the ARCHITECTURE Sysnova's own dashboard shows (the framework is not knowable from what we have, and the page stays vanilla).
**Evidence (screenshot `~/Projects/SYSNOVA/SYSNOVADashboardScreenshot.png`, 2026-09-02 screen share; notes `BIMSYSNOVA_Project.md` §Target dashboard):** URL `http://172.16.9.25:8000/v2/#/dashboard` = a
separate web app on its own port (not iDempiere's `/webui`), plain HTTP on the LAN; `/v2/` + sidebar link "← Classic dashboard (v1)" = two versions served by one app; `#/dashboard` = a single-page app with
hash routes, sidebar Dashboard · Projects · Budget & Cost · Procurement Risks · Approval Pending (514) · Handover; footer "PMO Analytics — Live data from iDempiere" = it reads iDempiere live, so a server
part on that port reads iDempiere (a page alone could not without CORS) — HOW (database or web services) is NOT known (Q-S2). Port 8000 = the default of Python dev servers / Laravel `artisan serve`: a hint, not a fact.
**Build (bim-ootb, no framework, no new dependency):**
1. `capex/server.js` (node `http`): serves `capex/` at `/v2/` (index.html), hash routes `#/dashboard`, `#/projects`, `#/budget`, `#/procurement`, `#/approvals`, `#/handover` — the same six modules; a module with
   no stated definition shows "definition pending (client)" (§6 Q6), never a made-up table. Port from env (default 8000 like theirs; refuses to start if taken, never kills a process).
2. `GET /api/legacy` — the server reads iDempiere through its stock web services with a dedicated READ-ONLY service account given by env (`LEGACY_BASE`, `LEGACY_USER`, `LEGACY_PASS`, client/role/org):
   the SAME `adapters.loadLegacy` the snapshot tool uses (one owner; `capex/tools/legacy_snapshot.js` becomes a thin caller). Short cache (env seconds), `§DASH_SERVE` logs (row counts, ms) — the password
   never in a response, a log line or the page. No account configured → HTTP 503 `{"error":"no legacy source"}` and the page shows "no data source" (no zeros).
3. Page: a third source `fromServer('/api/legacy')` in `capex/adapters.js` (the page picks it when served by `server.js`); Source A (our SQLite twin) unchanged; `tiles.js` unchanged — one compute.
4. The iDempiere side needs only the read-only account + its read types (the CAPEX read types, Filter Constant since §5.8): later shipped as the DASHBOARD's own setup pack (iDempiere convention), never
   inside the BIM plugin. POC: the local pilot already holds them.
**Witness W-DASH-SERVE (node, local pilot):** `/api/legacy` row counts == `legacy_snapshot.js` (projects/phases/tasks/lines …); the tiles computed from the API payload == the tiles `shed_twin.js` computes
from legacy for HHS and SHED (`?project=`); `/v2/` serves index.html and the six routes; no account → 503 + "no data source"; the password string in no response body/header/log; a second server on a
taken port refuses to start. Break: `BREAK=1` drops one project from the payload → the count compare FAILs.
**Open (owner → Sysnova PM, §6 Q-S1..Q-S6):** their app's source, live or prototype, how it reads iDempiere, how it signs in, the tile definitions, where it runs.

### 5.13 SPEC — the CAPEX dashboard from the ground up, on our SQLite WASM framework (2026-11-03; written before code; supersedes §5.12)
**Owner:** *"just act as if we are doing it afresh, as it is better we do from the ground up and i prefer to be same SQLite WASM framework"* — and earlier: the plugin is only BIM → Project Order; legacy
defines dashboards as PA data ("our side is a true twin and idempiere side retains its learning curve"). Whatever Sysnova runs is not copied; their answers (§6 Q-S1..Q-S6) only feed the DEFINITIONS.
**Measured before writing:** the ERP kernel already converts iDempiere SQL to SQLite at one choke point (`erp/ad_callout.js:264 convertSql`, via `makeDB().query`); the seed holds `pa_measure` 4 /
`pa_goal` 4 / `pa_dashboardcontent` 3 and the boot patch adds `pa_measurecalc`, `pa_colorschema`, `ad_chart` (`erp/patches/build_ad_seed_patch.sh:40`); the dictionary already has the windows
Performance Measure, Performance Measure Calculation, Performance Goal, Performance Color Schema, Dashboard Content (rendered by the ONE generic AD engine — to be measured, not assumed).
**Layers (each one owner, AD-LAYER LAW — no dashboard-specific window code):**
- **L1 Data = the SQLite WASM ERP DB in the browser** (same schema as iDempiere). Local-first: the twin's own rows (BIM folds, documents) — and, for a site that runs iDempiere, a DOWN copy of its
  project tables (C_Project, C_ProjectPhase, C_ProjectTask, C_ProjectLine, C_Phase, C_Currency, AD_Org, AD_WF_Activity) by `*_UU`, idempotent, read-only on their side (§14 build order 1).
- **L2 Definitions = PA rows** (PA_MeasureCalc SQL, PA_Measure, PA_Goal, PA_ColorSchema, PA_DashboardContent) — THE SAME rows legacy runs (R0 proved legacy computes a CAPEX tile from them, no Java).
  Rows ship as data: our boot overlay / patch on our side, a migration script or 2Pack on theirs (LEGACY CONVENTION) — one definition, two engines.
- **L3 Engine = a SQLite port of MMeasure / MMeasureCalc / MGoal / MColorSchema** (`erp/pa_engine.js`, cited file:line from `~/idempiere-dev-setup/idempiere/org.adempiere.base`): SelectClause + WhereClause
  through `convertSql`, the role's access restriction as legacy adds it (`MMeasureCalc.java:612`), performance = actual ÷ target, colour from the schema marks; legacy's three behaviours twinned as decided
  in §5.5 (no compute on create; performance against the previously committed target; a failed SQL = 0 + `§PA_MEASURE_ERROR`, judged INCONCLUSIVE by the witness).
- **L4 Renderer = a home dashboard driven by PA_DashboardContent rows** in our ERP app: each content row → its goal/measure → value + colour + the formula text; no per-tile code. The visual
  vocabulary is the one the client asked for (the §3 tiles: counts, sums per currency, health ring, stage pipeline, physical vs spent, schedule / budget buckets) built as GENERIC tile kinds a row picks.
- **L5 Editor = the generic AD windows above**, in our ERP UI; an edit → re-compute → re-render → re-twin. "Without coding or AI" is then literally true.
- **Twin:** the same PA rows on both sides; legacy `PA_Goal.MeasureActual` (WS read) vs our engine's value, per goal, to the cent (`capex/tools/pa_probe.js` grows into it).
- **The `capex/` page + `tiles.js` (today's build) become the ORACLE** during the move: every PA-defined tile must equal its `tiles.js` value on the same data; when all match, `tiles.js`'s hand formulas
  are deleted (deletion budget stated). What PA cannot express (per-project EVM health, average delay) is MEASURED first: either one MeasureCalc SQL per bucket that runs in both dialects, or it stays a
  named generic tile kind in L4 — never a hidden special case.
**Build order (each its own spec line + witness before code):** G1 the PA engine on the seed + the R0 measure (Approved Budget USD) == legacy's goal on the pilot · G2 the §3 count/sum tiles as PA rows,
each == `tiles.js` · G3 the renderer from PA_DashboardContent · G4 the bucket tiles (health, schedule, budget status) — PA SQL or named tile kinds · G5 the editor windows X of N (the five above) ·
G6 the DOWN copy for a real site (needs their read-only account — §6 Q-S3/Q-S4).
**Witnesses (named before code):** W-PA-ENGINE (G1: same rows → same value as legacy, cent-exact; broken SQL → 0 + INCONCLUSIVE; BREAK=1 FAIL) · W-PA-TILES-ORACLE (G2/G4: each PA tile == `tiles.js`) ·
W-PA-RENDER (G3: the rendered value of every content row == its engine value, read from the DOM headlessly) · W-PA-EDITOR (G5: X of 5 windows open, edit a target → the tile moves on both sides).

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
**For the Sysnova PM (owner's ask 2026-11-03: "their script and whether it is live or still prototype"):**
Q-S1 Please share the dashboard's source code (the v2 app at `:8000/v2`, and v1 if it still runs) — or a zip / repo access.
Q-S2 Is it LIVE on real Kazi Farms data today, or a prototype on sample/test data? (Footer says "Live data from iDempiere" — which iDempiere: production or a copy?)
  **ANSWER (Sysnova PM, via the owner, 2026-11-03): still a PROTOTYPE.** → we proceed with ours (TASK 1, §5.13).
Q-S3 How does it read iDempiere — straight from the PostgreSQL database (SQL / views), through iDempiere web services, or through a REST plugin? Read-only user?
Q-S4 How do users sign in to it — its own login, the iDempiere login, or none (LAN only)?
Q-S5 For each tile, the formula or SQL it uses (answers §6 Q1–Q8 in one go), and what "Procurement Risks" and "Handover" show.
Q-S6 Where does it run (server, port 8000, what starts it) and who maintains it.


## 7. Machine state (left 2026-11-03)
Local pilot `~/idempiere-pilot` (:8088, docker `postgres` DB `idempiere_pilot`) runs with the CAPEX read/write/update WS types + the R0 PA types (restore recipes in the four `ws_capex_*.sql` headers),
migration `202611031900_CAPEX-R0.sql` applied (PA_MeasureCalc/PA_Measure 1000000) + goal "CAPEX Approved Budget (USD)", and holds pushed projects SHED (#1000007, R1 fold: 4D dates, 12 lines; the old fold is kept as #1000004 `SHED_preR1`, inactive),
HHS_Office_Federated (#1000006, R1 fold: 4D dates, 45 lines) and the kept pre-R1 HHS (#1000005, Value `HHS_Office_Federated_preR1`, inactive; its Superstructure IsComplete=Y from the film beat). Nothing on any client server. Film inputs kept in `~/.cache/capex_film/` (scratch DBs + legacy snapshots, not committed).
