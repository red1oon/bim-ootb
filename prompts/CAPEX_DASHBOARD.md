# ⚠ DO NOT REMOVE
SCOPE: the vanilla HTML/JS "CAPEX Project Management — Executive Dashboard" in `capex/` (no framework, no build step, no client name in the code).
It is fed ONLY by real iDempiere project data: Source A = the SQLite ERP DB (`erp/ad_seed.db` or any ERP DB, sql.js in the browser), Source B = the legacy iDempiere
(stock WebServices `query_data`, via a node snapshot because of CORS). **PRIME RULE: every number is computed from rows of a real DB. No sample data, no placeholder,
no random fill. An empty population prints "no data" / VACUOUS / INCONCLUSIVE, never 0% or 100% green.** Read the log after every run (`§DASH_*` lines); exit code is not evidence.
Honour this block until the lane is closed. Cardinal rule: SQLite == legacy; a `§DASH_TWIN ... DIFF` is fixed on the SQLite side, never hidden.

## ▶ RESUME HERE (written 2026-11-02 at the close of session bim-compiler-77; the ONLY current block — read it, then §11, §12, §13, §7)
**The goal (owner, verbatim):** "We can build an adhoc HTML that resembles that dashboard (they eventually will share their app) and perhaps it be adopted or replace theirs as it is
expected to be simple vanilla (their notes so far indicated it was prototyped not wired)" · "This is where we be twinning silently in the background to get a free parity testing
(which we been doing in another lane)." Client context: `~/Projects/SYSNOVA/BIMSYSNOVA_Project.md` (LAST section, links 1-7 + N1-N4) and `~/Projects/SYSNOVA/BIM_OOTB_iDempiere_Integration_Spec.md`.
**State:** page live in `capex/` (#2530); twin vs the LOCAL pilot (#2532) = `§DASH_TWIN_VERDICT FAIL match=4 diff=15 inconclusive=2` (§10). Session 77 measured every DIFF (§11 table):
the harness keeps NO SQLite state (no "post-run SQLite DB" exists — §11 premise correction), so absolute-state DIFFs are history drift + one SQLite-only fold (Hospital) + ONE REAL KERNEL GAP, now fixed:
document-value workflows (legacy "Business Partner Approval" pending per new BP) — `model_layer.js docValue` + W/X/I suspend + boot overlay `ad_docvalue_overlay.js` (base hash unchanged), witness
`erp/tests/witness_docvalue_wf.js` W-DOCVALUE-WF RED 6/7 → GREEN 8/8, break FAILs; 21-witness regression before/after in §11.3.
**▶ NEXT, in order:**
1. **NEXT-1 remainder** (the absolute twin): (a) Hospital #990000 → pushed with the shed's write types (same ⛔ go as 2); (b) history drift → the SQLiteIDEMPIERE lane decides on a persistent SQLite twin reset
   with the pilot (`bim-compiler prompts/SQLiteIDEMPIERE.md §CAPEX-TWIN`); then re-run `node capex/tools/twin.js <twin.db>`. (c) §11.2 DocAction-path responsible gap (ERP lane).
2. **NEXT-2** ⛔ **owner go:** WRITE WS types for C_Project/Phase/Task/Line on the local pilot. Spec §12: the push must carry the folded SQLite rows column for column (today's REST push writes fewer columns
   than the fold → would DIFF by construction).
3. **NEXT-3** handed off (§13): one cost owner = `modeller/dxf2bill.js` (PWD SoR); proj_fold takes the bill's priced rows. Pointer in `prompts/DXF2BIM_ARCHITECT_REVIEW.md` RESUME item 4.
4. **Client questions** (§7, 9 items) go to Sysnova through the owner; the page keeps "definition pending" until answered.
**Machine state left:** the local pilot (`~/idempiere-pilot`, :8088) is running with the 6 extra READ types (§10 has the DELETE restore recipe). Nothing written to the pilot by session 77 (read-only psql + WS reads).
**Rules that bind here:** PRIME RULE (no invented number), CARDINAL TWIN RULE, never `git stash`, never claude-in-chrome, witness = numbers, bim-ootb only via a `/tmp/wt-*` worktree,
no .db committed, every legacy-server config change needs the owner's go, never move the Team base hash (`patches/ad_seed.db.sql`) without the owner — use a boot overlay.

## 1. Purpose
The client (a CAPEX portfolio owner) prototyped an executive dashboard that is not wired to data (screenshot `~/Projects/SYSNOVA/SYSNOVADashboardScreenshot.png`).
This page reproduces its structure (sidebar; filter bar Org / Category / Status / Last Updated; KPI tiles; Project Health donut; Project Stage pipeline; Physical vs Spent;
Schedule Performance; Budget Status) on real iDempiere columns so their programmer can adopt or replace it. Plain files: `capex/index.html`, `dash.css`, `dash.js`
(UI), `tiles.js` (pure compute, the ONE place a formula lives), `adapters.js` (sqlite + legacy adapters), `tools/` (node: fold demo, legacy snapshot, twin), `tests/` (witness).

## 2. Architecture (one compute, two adapters)
`adapter.load() -> data` returns the SAME normalised row sets for either source:
`projects, phases, tasks, lines, orgs, phaseRef (C_Phase), currencies, wf (AD_WF_Activity), unavailable[]`.
`tiles.compute(data, {org, category, status, today}) -> {tiles, notes}` is pure; `tiles.flatten()` gives `name -> canonical string`; the twin compares the flattened maps.
`today` is injectable (`?today=YYYY-MM-DD`, default the browser date) so the witness is deterministic; the page prints the date it used (`§DASH_TODAY`).
Config object (top of `dash.js`, `window.CAPEX_CFG`): `title`, `subtitle`, `erpDb` URL, `legacySnapshot` URL, `buildingsBase`. Org name = `AD_Org.Name` from the data.
Currency = `C_Currency.ISO_Code/CurSymbol` of `C_Project.C_Currency_ID` from the data. Several currencies in the population are NEVER summed together: the tile lists one value per currency.

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

## 4. Adapters
**A — SQLite**: `initSqlJs` (vendored `erp/sqljs/sql-wasm.js`), `fetch(erpDb)`, `SELECT` of the columns above. Column case differs by table in the seed (`c_projectline` is lower-case);
the adapter lower-cases names on read and returns canonical keys. Read-only; never writes.
**B — legacy**: stock `ADInterface/services/rest/model_adservice/query_data` (`ModelCRUDRequest`, `serviceType`, `Filter`), exactly the call `scripts/bridge/ad_client.js` (bim-compiler) makes.
Browsers cannot read it (no CORS rule on the pilot; changing server config needs the owner's go), so `tools/legacy_snapshot.js` (node) reads and writes `capex/legacy_snapshot.json`
(git-ignored, not committed) which the page loads as Source B. Read types REGISTERED on the pilot today: `QueryCProject`, `QueryADOrg` only. NOT registered (adding = WS config, owner's go):
`C_ProjectPhase`, `C_ProjectTask`, `C_ProjectLine`, `C_Phase`, `C_Currency`, `AD_WF_Activity`. Tiles needing them print **INCONCLUSIVE** on B (never a guess); `unavailable[]` says which.

## 5. Twin log lines
`§DASH_TWIN tile=<name> sqlite=<v> legacy=<v> MATCH|DIFF|INCONCLUSIVE` per tile; `§DASH_TWIN_VERDICT PASS|FAIL|INCONCLUSIVE` (PASS only if >=1 tile MATCHed and 0 DIFF; INCONCLUSIVE if nothing was judged;
FAIL on any DIFF). A population difference (the SQLite seed holds a BIM-folded Hospital project the pilot does not) is a DIFF to fix on the SQLite side. Source-A-only runs print `§DASH_TWIN skipped reason=<...>`.

## 6. Witness claims (numbers, not looks) — `capex/tests/witness_capex.js`
Loads the REAL page in headless Chromium (puppeteer, swiftshader) against an ERP DB, with `?today=` fixed, and reads the rendered tile values from the DOM `data-tile` attributes.
- **W-CAPEX-SQL** each tile's rendered value == an independent SQL count/sum run with sqlite directly over the same DB file (does not touch `tiles.js`). Issue proved: the JS compute matches the stated formula.
- **W-CAPEX-FALSIFY** in a temp copy, change one row (Hospital `PlannedAmt`, one phase `IsComplete`, one project `Processed`); the dependent tiles MUST change by the exact amount and unrelated tiles must not. Issue proved: the tiles actually read the DB (not a constant).
- **W-CAPEX-VACUOUS** a temp copy with C_Project emptied: every tile prints "no data" (no `0%`, no green). Issue proved: empty population never looks healthy.
- **W-CAPEX-NODATA-DEFAULTS** no `.db`/snapshot loaded → the page says "no data source", not zeros.
- **W-CAPEX-TWIN-PARSE** `adapters.js` legacy parser against a local stub that serves ONLY rows copied from the SQLite DB in the WS wire shape: normalised rows equal (a transport/parse test, labelled as such; it is NOT a twin result).
- **W-CAPEX-SHED** the shed fold output DB (temp, never committed) renders a SHED row in Projects with currency BDT and its PlannedAmt == SQL.
- No-invented-data audit: grep of `capex/*.js|html|css` for client/company names and `৳`/`$` literals must be empty.
All `§`-lines are printed; verdict lines print INCONCLUSIVE when nothing was judged.

## 7. ⛔ Questions for the client (formula not stated, no honest iDempiere column)
Q1 Health Green/Amber/Red thresholds (we use SPI/CPI 0.9 provisional, only 0.9 is theirs) and whether health uses cost (CPI) at all.
Q2 Project Stage: how do Concept / Initiation / Planning / Execution / Closing map onto `C_Project.C_Phase_ID` (stock `C_Phase` rows are sales-cycle steps in the seed)? Or is it a custom column/`C_ProjectType`?
Q3 Forecast Cost at Completion: formula (EAC = AC + (BAC-EV)/CPI? or Planned + overrun?) and its source columns.
Q4 Committed split "verified vs contract": which columns (`C_ProjectLine.CommittedAmt` vs invoiced? `C_Order` PO totals?).
Q5 Approval Pending: which workflow activities count (all `AD_WF_Activity` suspended? only on project documents? which AD_Table)?
Q6 Procurement Risks and Handover: definition and source columns.
Q7 "Closed" project = `Processed='Y'`? and "completed this year" date = `DateFinish`? Also the BIM link shape (`db=` form vs `building=` form).
Q8 Payment-based financial progress (their own caveat says it is not in the ERP) — which table will carry it?
Q9 Legacy read types for C_ProjectPhase / C_ProjectTask / C_ProjectLine / C_Phase / C_Currency / AD_WF_Activity: owner's go to register them on the legacy server (WS Type rows) so Source B is complete.

## 8. Status log
(see §9 RESULT, appended after the run)

## 9. RESULT 2026-11-02 (first build) — logs read
**Run it:** from the repo root `python3 -m http.server 8765` then open `/capex/index.html` (any static server; sql.js is the repo's vendored `erp/sqljs`). Params: `?db=<erp .db url>` `?today=YYYY-MM-DD` `?snapshot=<legacy json>` `?buildings=<base url>`.
**Source B (legacy):** NOT reached. `curl http://localhost:8088/webui/` = 000 and `tools/legacy_snapshot.js` = `ECONNREFUSED`; the pilot was not restarted (brief: Source A only if down). Read-only `psql` on the docker postgres
(`idempiere_pilot`) shows what the pilot holds today: C_Project 3 rows (Landscape plan 600 bal 0; Standard 0; a second Standard bal 318.6805), C_ProjectPhase 0, C_ProjectLine 1. The SQLite seed holds
Landscape, Standard and the BIM-folded Hospital (990000; 7 phases, 13 tasks, 29 lines), so the real twin will DIFF on population until the SQLite side is aligned to the pilot's rows. Only `QueryCProject`/`QueryADOrg` are registered read types (⛔ Q9).
**Witness** `NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_capex.js <shed_erp.db>` → `§CAPEX_VERDICT PASS asserts=34 failed=0`: W-CAPEX-SQL (21 tile keys x 3 filter sets + 4 mutated DBs + empty + shed, rendered DOM == independent SQL, 0 diffs),
W-CAPEX-FALSIFY F1 (Hospital PlannedAmt +1000 → only `approved_budget` moved, +1000.00), F2 (phase complete → `physical` moved), F3 (Processed → closed +1/active −1), W-CAPEX-VACUOUS (empty C_Project: every tile "no data", no donut ring, no %),
W-CAPEX-NODATA-DEFAULTS, W-CAPEX-SHED, W-CAPEX-BIMLINK, W-CAPEX-TWIN-PARSE (stub), twin negative control (DIFF → FAIL), both-empty → INCONCLUSIVE, PENDING → INCONCLUSIVE, in-page twin wiring, no-client-name audit.
The witness caught one real defect while building (a `return` swallowed by an edit → page error on the org filter) — shown FAIL, fixed, rerun green.
**Known formula quirk (⛔ Q1):** EV counts every `IsComplete='Y'` phase, including phases not yet due, so a project with an early-completed later phase reads SPI>1 (Hospital: Superstructure is flagged complete in the seed → Green).
**Shed fold** (`capex/tools/fold_demo.js` on `/tmp/wt-shed-e2e/buildings/ShedModeller.db` → temp copy of ad_seed.db, not committed): project SHED 990001 created, +6 phases (Substructure 2026-11-01 → Finishes 2027-01-04), +8 tasks, +12 lines,
+3 products, +1 category (C_Project 3→4, C_ProjectPhase 7→13, C_ProjectTask 13→21, C_ProjectLine 29→41, M_Product 311→314). Currency BDT (C_Currency 322, resolved from the pack's `meta.currency`); PlannedAmt 15,147,437 BDT = the 5D golden.
Cost source = the pack's generic `materials` rate table (`apply5DRates`, the Viewer's own path), NOT the PWD SoR `material_rates` (6,227,255 BDT bill; DXF2BIM item N2 still open). Notes: `NO_CONV_RATE BDT→USD` (no C_Conversion_Rate; run `scripts/seed_fin_currency.js` to post), `PLAN_ONLY no supplier → no C_Order`.
On the dashboard: SHED appears in Projects with BDT, Approved Budget gains a third currency line, Schedule shows it On Time (phases start 2026-11-01, none overdue), Health "No EVM data" (no phase ended yet), Budget Status "Not started" (no cost).

## 10. RESULT 2026-11-02 (owner go: local pilot only) — Source B reached, twin run for real
**Done on this machine's pilot only (`~/idempiere-pilot`, DB `idempiere_pilot`), not Kazi's server:** `capex/tools/ws_capex_readtypes.sql` (template = bim-compiler `pilot/ws_changelog_read.sql`: role 102, `isreadwrite='N'`, Read action) applied with
`docker exec -i postgres psql -U adempiere -d idempiere_pilot`; registers `QueryCProjectPhase/Task/Line`, `QueryCPhase`, `QueryCCurrency`, `QueryADWFActivity`. No write types, no legacy data change. Server started with `~/idempiere-pilot/start.sh`, `/webui/` = 200, +10 s.
**WS table counts, before → after** (ws_webservicetype / ws_webservicetypeaccess / ws_webservice_para / ws_webservicefieldoutput): 267/499/924/3465 → 273/505/948/3603 (+6/+6/+24/+138). None of the 6 values existed before.
**Restore:** `DELETE FROM ws_webservicefieldoutput WHERE ws_webservicetype_id IN (SELECT ws_webservicetype_id FROM ws_webservicetype WHERE value IN (<the 6>))`, same for `ws_webservice_para` and `ws_webservicetypeaccess`, then the `ws_webservicetype` rows; restart; counts must return to the "before" row.
**Snapshot:** `§DASH_LEGACY_SNAPSHOT projects=2 phases=0 tasks=0 lines=1 orgs=10 phaseRef=13 currencies=175 wf=264 unavailable=[]` (the role sees client 11: 2 projects; psql earlier counted 3 across clients).
**Twin** (`node capex/tools/twin.js`, status=all and status=active give the same verdict; the page, Source A/B selector, logs the identical `§DASH_TWIN_VERDICT FAIL match=4 diff=15 inconclusive=2`):
MATCH total_projects_closed, active_projects_closing, committed_invoiced, completed_year. INCONCLUSIVE forecast_cost (pending), avg_delay (both no data).
DIFF (sqlite → legacy): total_projects 3→2; active_projects 3→2; approved_budget `100:600,301:64719479`→`100:600`; actual_cost 0.00→318.68; actual_cost_pct_of_plan 0→0.5311; committed_cost `301:87372995` extra on SQLite; health green=1→0; stage "(no phase)" 2→1;
physical `301:0.5724`→no data; spent 0→0.5311; schedule ontime 1→0; budget_status within0/over0/notstarted3 → over1/notstarted1; actual_overrun no data→`100:318.68`; approvals 10→261; last_updated 2026-06-14→2026-11-02 05:33:58.
**Causes (all SQLite-side items under the CARDINAL RULE; none accepted):** (1) POPULATION: the seed holds the BIM-folded Hospital #990000 (and its 7 phases) which legacy does not — drives total/active/approved/committed/health/stage/physical/schedule;
(2) legacy `Standard#100` has `ProjectBalanceAmt=318.6805` from the parity lane's Project Issue runs (PJI1) while the SQLite seed has 0 — drives actual/spent/overrun/budget_status (a replay of PJI1 on the SQLite side must produce the same balance; the seed file is a dictionary seed, not a post-run twin);
(3) `AD_WF_Activity` pending 261 on legacy vs 10 in the seed (legacy accumulated activities from runs); (4) `Updated` timestamps. The dashboard computes identically on both sources (same `tiles.js`); the DIFFs are data-state differences between the two DBs, which is exactly what the twin is for. Fix path: align the SQLite DB under test to the pilot (run the twin against the post-run SQLite DB of `scripts/bridge/run_all.sh`, not the shipped seed).

## 11. NEXT-1 "real twin" — measured premise, DIFF causes, the SQLite-side fixes (spec written BEFORE code, 2026-11-02, session bim-compiler-77)
**Premise correction (measured, not assumed).** There is NO "post-run SQLite DB" of the parallel-run harness to point Source A at: every scenario in `bim-compiler scripts/bridge/` copies
`build/erp/glassbowl_data.db` to `os.tmpdir()`, compares the legacy delta with the SQLite delta, and deletes the copy (`witness_m3_gap.js:20,1137-1174`); `glassbowl_data.db` has no `c_project`
table at all. The legacy pilot, in contrast, KEEPS every run's writes. So the two DBs drift apart by construction: legacy = seed + all harness history, SQLite = seed. The §10 DIFFs are that drift, plus one real kernel gap.
**Each §10 DIFF, its measured cause, its fix (all on the SQLite side — CARDINAL RULE):**

| DIFF tiles | measured cause (read-only psql on `idempiere_pilot` + the seed) | class | fix / owner |
|---|---|---|---|
| total/active projects, approved/committed budget, health, stage, physical, schedule | Hospital #990000 exists only in SQLite: a BIM fold made on the SQLite side and never pushed (the twin principle, SQLiteIDEMPIERE §21: every SQLite op reaches legacy through the Bridge) | UP-push missing | push it with the shed (NEXT-2) through the REST bridge — needs the write WS types (⛔ owner go, same go as NEXT-2) |
| actual cost, spent, budget status, overrun | legacy `Standard#100.ProjectBalanceAmt=318.6805` = 46 `C_ProjectIssue` rows (2026-10-10..11-02), one per harness run of PJI1 (`MProjectIssue.updateBalanceAmt` :555-590 adds `MCost.getCost` per issue); the SQLite side of each run was discarded | harness history not persisted | a persistent SQLite twin that every harness run writes to, reset together with the pilot from one baseline (`pilot/snapshot.sh`) — harness change, SQLiteIDEMPIERE lane; handed off in `bim-compiler prompts/SQLiteIDEMPIERE.md §CAPEX-TWIN` |
| approvals 10 → 261 (now 261 OS on table 291) | legacy `AD_Workflow 131 "Business Partner Approval"` (WorkflowType V, AD_Table 291, DocValueLogic `@Created@=@Updated@`, start node 244 action W) starts on EVERY new C_BPartner (`PO.saveFinish` :2806-2817 → `DocWorkflowManager.process` :70-125) and suspends at the user-window node (`MWFActivity.performWork` :1389-1393 returns false → WFState OS). 251 of the 261 came from BPs created 2026-10-17..22 by user 101 and later deleted (ad_changelog I/D); the activities stay (legacy delete does not remove them). The 2 surviving October BPs (1000472/3) have 1 activity each. SQLite: (a) DATA — the seed patch ships only DocAction process workflows (`build_model_patch.py` WF filter), so workflow 131 is absent; (b) RULE — `model_layer.js` has no doc-value trigger and `runWorkflow` aborts on any node action other than D/Z | DATA + RULE kernel gap | **this session: §11.1** |
| last updated | `MAX(C_Project.Updated)` differs because the rows differ (legacy Standard#100 updated by the issues) | follows the rows above | none on its own; re-judge after the others |

### 11.1 Doc-value workflows in the SQLite kernel (generic — AD-LAYER LAW, no BP-specific code)
- **DATA:** every document-value workflow of the reference DB (`WorkflowType='V'`: today only 131) + its nodes + node-nexts, extracted by `erp/patches/build_docvalue_overlay.py` into `erp/ad_docvalue_wf.js`
  and applied at boot by `erp/ad_docvalue_overlay.js` (idempotent `INSERT OR IGNORE`; call sites = the overlays' own: `idempiere.html`, `ws_kernel.js`, `ws_server.js`). **Not** in the hashed
  `patches/ad_seed.db.sql`: the first try put the 2 rows there and W-IMPORT-ORDER / W-ACCT-PROCESSOR failed `base-hash` — moving the Team BASE hash re-founds every team (owner decision, TEAMWORK §48.11b);
  the boot-overlay path is the lane's accepted alternative (ad_index_overlay.js, ad_import_tables.js).
- **RULE:** `model_layer.js` `_save` → after the AFTER_* validators and `postEvent` (the `PO.saveFinish` order :2800-2817): `docValue(trx, table, live, isNew)` = `MWorkflow.getDocValue` (WorkflowType='V', IsValid='Y', IsActive='Y',
  AD_Client_ID = session client, AD_Table_ID = the table) → for each: skip when `wf.AD_Client_ID != doc.AD_Client_ID`; logic `SQL=` → **named-unported** (`§MODEL-NAMED docvalue-sql`), else
  `AdEvaluator.evaluate(logic, doc)` where the doc carries the save stamps PO sets before `saveFinish` (new: Created = Updated = the save time; change: Updated = the save time, Created kept) → start = `runWorkflow`'s process/activity rows.
- **RULE (shared with DocAction workflows):** `runWorkflow` node actions `W` (UserWindow), `X` (UserForm) and `I` (UserInfo) SUSPEND (UserChoice `C` is a different legacy rule, :1302-1382, left named-unported): the activity stays `WFState='OS'`, `Processed='N'`, the
  process `WFState='OS'`, an event audit `SC/OS` is written (pilot: activity 1000305 / process 1000305 / audit `244|SC|OS`), and the walk stops (no CA abort). Before this change they aborted (`node action W not modeled`).
- **Witness W-DOCVALUE-WF** (`erp/tests/witness_docvalue_wf.js`, issue proved: SQLite starts and suspends the same approval workflow legacy starts, so "Approval Pending" moves the same way):
  (1) new C_BPartner → exactly 1 `ad_wf_process` + 1 `ad_wf_activity` (wf 131, node 244, OS, Processed N, AD_Table 291, Record_ID = the BP) + 1 `ad_wf_eventaudit` (SC, OS) — the pilot values above;
  (2) a later update of the same BP → 0 new activities (logic false once Updated != Created); (3) a new row of a table with no V workflow (C_Project) → 0; (4) `DOCVALUE_BREAK=1` disables the trigger → (1) must FAIL;
  (5) vacuous guard: the patch must carry workflow 131 (else INCONCLUSIVE, not PASS); (6) Approval Pending tile (`tiles.js`, unchanged) on the witness DB moves by exactly +1 per new BP.
  Regression: the existing DocAction-workflow witnesses keep their verdicts (before/after logs).

### 11.2 Named, not fixed here
- The DocAction workflow path (`runWorkflow` without `opts.wf`) still writes `ad_wf_process.ad_wf_responsible_id = NULL` when the workflow has none and the session user on every activity; legacy resolves the
  Invoker (pilot: C_Order wf 116 process → responsible 101 / user 101). Same helpers (`wfStartResp`/`wfNodeResp`) apply; switching that path is a separate change with its own before/after (ERP lane).
- Absolute-state twins need a persistent SQLite twin of the harness (proposal handed to `bim-compiler prompts/SQLiteIDEMPIERE.md §CAPEX-TWIN`).

## 12. NEXT-2 — the shed as a twin scenario (spec, 2026-11-02, session bim-compiler-77) — ⛔ write WS types need the owner's go
**Measured mismatch first (would DIFF even after a push):** the REST bridge (`viewer/erp_rest_push.js` `pushProjectOrder`) writes C_Project `Value`, `Name='BIM: '+building` only (no `C_Currency_ID`,
no `PlannedAmt`), C_ProjectPhase `C_Project_ID/Name/SeqNo/StartDate/EndDate` (no `PlannedAmt`, no `IsComplete`), C_ProjectTask `C_ProjectPhase_ID/Name`, C_ProjectLine `PlannedQty/PlannedPrice/PlannedAmt`.
The SQLite fold (`viewer/proj_fold.js` via `capex/tools/fold_demo.js`) writes currency BDT, the project's and phases' PlannedAmt, and its own Name. The tiles Approved Budget (C_Project.PlannedAmt), Physical
(phase PlannedAmt), currency split and the Projects table would DIFF by construction. **Twin principle (SQLiteIDEMPIERE §21): SQLite is the origin; legacy must receive the SAME rows.** So the push must be
fed FROM the folded SQLite rows (column for column the dashboard reads: §3 tiles 1-16), not from a separate plan object.
**Steps:** (1) `capex/tools/shed_twin.js`: fold the shed into a temp copy of the seed (as `fold_demo.js`) → read back the folded C_Project/Phase/Task/Line/M_Product rows → push those rows' columns with the
REST bridge (`erp_rest_push.js`, extended to carry the extra columns; the column list comes from the folded rows, not a hand list) → `legacy_snapshot.js` → `twin.js` restricted to nothing (full population).
(2) Done-claim: `§DASH_TWIN` MATCH on every tile the SHED row moves (Δ-twin from a snapshot before the push, both sides), and the absolute verdict reported as is.
**⛔ owner go needed:** register WRITE WS types on the local pilot for C_Project / C_ProjectPhase / C_ProjectTask / C_ProjectLine (create + the read already exists) — the pilot today has none of these
(`ws_webservicetype` lists only Query* for the four, plus `Bridge_createData_M_Product*` for products). Same SQL template + restore recipe as §10; nothing on Kazi's server.

## 13. NEXT-3 — one cost source for the shed's Project Lines (spec, 2026-11-02, session bim-compiler-77; hand-off, not a fork)
**Three numbers, measured owners:** (a) DXF2BIM bill 6,227,255 BDT = `modeller/dxf2bill.js` pricing each body by `pack.material_rates[IfcClass]` (PWD SoR 2022 rows, matched on the body's material, row
cited per item/page); (b) proj_fold 15,147,437 BDT = `capex/tools/fold_demo.js` → `apply5DRates(compute5D(...), pack.materials)` = the generic per-class `materials` table of the same pack (no material
match, bbox quantities); (c) film HUD 130,639 = labour from the Time Machine path. **Rule:** the Project Lines carry the stated bill — ONE pricing owner, `dxf2bill.js` (it already reads the SoR rows
and their quantities); `proj_fold` takes its priced rows (class, material, unit, qty, rate, cost, source item) from that bill instead of re-pricing with `materials`. The Viewer's 5D / Time Machine
cost reading `material_rates` is the same carried item (DXF2BIM RESUME item 4). **Owner: the DXF2BIM / 5D lanes** — pointer added to `prompts/DXF2BIM_ARCHITECT_REVIEW.md` RESUME item 4.
**Done-claim for the hand-off:** the shed's `SUM(C_ProjectLine.PlannedAmt)` == the bill total 6,227,255 BDT (a witness reading both), and the fold's per-line `rate` == the bill row's `rate` for the same class+material.

### 11.3 RESULT 2026-11-02 (session bim-compiler-77) — logs read
- **W-DOCVALUE-WF** `NODE_PATH=<bim-ootb>/node_modules node erp/tests/witness_docvalue_wf.js`: RED before the rule (6 of 7 FAIL, `activities=[]`, tile 10→10) → `§DVWF_VERDICT PASS judged=8 failed=0`:
  new BP → activity `[131,244,OS,N,resp 100,user 100]`, process `[131,OS,N,101,101]`, audit `[244,SC,OS]` = the pilot's BP 1000473 row for row; update → no new activity; new C_Project → none;
  `§DVWF_TILE approvals before=10 after=11`. `DOCVALUE_BREAK=1` → `FAIL judged=8 failed=7`. `§DOCVALUE_OVERLAY ensure applied=2 skipped=0`.
- **First design rejected by the witnesses:** the 2 rows in `patches/ad_seed.db.sql` failed W-IMPORT-ORDER / W-ACCT-PROCESSOR `base-hash` (pin a3eef3f5…) → moved to the boot overlay; both PASS again.
- **Regression, before (origin/main ad9a640d) vs after:** 15 model-layer witnesses identical exit codes and verdict lines (void_reversal, event_seq, event_bus, docno_till, import_order, acct_processor,
  costing_sweep, libero_corehooks/activity/mto/bundle, plugin_lifecycle = 0; rma_window_path 2, fn_parity 1, post_matchinv_diff 3 — same on main: patch/oracle-dependent, pre-existing).
  + import_payment, pos_sales, recurring, script_validator PASS; team_base prints base sha256 a3eef3f5… = pin, then crashes on "playwright is not installed" in the worktree (environment);
  mf_lens all checks 🟢 `red=none judged=9`, ran past the 300 s timeout. CI fast checks local: audit_sw_precache, audit_script_tags, audit_spec_paths, W-AGENT-ZIP-SYNC = 0.
- **The CAPEX twin itself is still FAIL** (§11 table): the remaining DIFFs are the Hospital push (⛔ owner go) and the harness history drift (SQLiteIDEMPIERE lane). The approvals tile cannot MATCH 261 until the
  SQLite twin lives the same history; what is proven is that the SAME operation now moves both sides the same way (+1 per new BP).
