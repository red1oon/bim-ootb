# ⚠ DO NOT REMOVE
SCOPE: the vanilla HTML/JS "CAPEX Project Management — Executive Dashboard" in `capex/` (no framework, no build step, no client name in the code).
It is fed ONLY by real iDempiere project data: Source A = the SQLite ERP DB (`erp/ad_seed.db` or any ERP DB, sql.js in the browser), Source B = the legacy iDempiere
(stock WebServices `query_data`, via a node snapshot because of CORS). **PRIME RULE: every number is computed from rows of a real DB. No sample data, no placeholder,
no random fill. An empty population prints "no data" / VACUOUS / INCONCLUSIVE, never 0% or 100% green.** Read the log after every run (`§DASH_*` lines); exit code is not evidence.
Honour this block until the lane is closed. Cardinal rule: SQLite == legacy; a `§DASH_TWIN ... DIFF` is fixed on the SQLite side, never hidden.

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
