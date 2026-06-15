# ⚠ DO NOT REMOVE
**Lane:** BIM→Project **FINANCE & CONTROL** — make the pushed C_Project / Variation Order *financially real and
PM-controllable*, not just visible documents. The plumbing is shipped (Tasks A/C, §H1 VO, §B round-trip — all LIVE);
this lane is the accounting + project-control half that justifies landing in an ERP instead of a spreadsheet.
**Run rule:** work **§OUTSTANDING top-to-bottom to zero** — take the top open item → spec → build → witness/§-log →
mark it `✅ DONE (witness)` → next. Stop only on user interrupt or a real EXTRACT-blocker (`⛔ BLOCKED: <one question>`,
then move on). **Read the log after every run** (exit code is not evidence). Witness-first · EXTRACT-only · BigDecimal.

---

## Why this lane exists — the two users who must trust the money
**As the Project Manager** I want a *control picture, not a baseline*: *Original Contract Sum + Approved Variations =
Revised Contract Sum*, with **Planned vs Earned vs Actual** and **CPI/SPI/CV/SV** live on the project (the EVM math
already exists in `viewer/variation_order.js` — Excel-only today); variations I can **approve** (DR→CO) so they move
the commitment; a schedule and progress (% / `IsComplete`) that drive earned value and a claim. And before I commit
to anything, I want to **speculate**: push a what-if Project Order / Variation as a *blue* (UNOFFICIAL) draft, see
its impact on the revised contract sum and cash, then **roll it back on the timeline** if I don't like it — or accept
it to make it real. (The Blue Future speculative-branch + the `‹ dots ›` history rail already exist; this lane wires
the BIM-pushed financials INTO them.)

**As the Accountant/Controller** I want money I can **post**: a Malaysian job priced in **RM** needs a real
`C_Currency` (MYR) **and** a `C_Conversion_Rate` — without it nothing posts; BoQ products mapped to **GL accounts**
(`M_Product_Category_Acct`); a real flow **Order → complete → C_Invoice (progress claim, `ProjInvoiceRule`) → Post**
(Dr WIP/Cost, Cr AP) with **Tax** (`C_Tax`) and `DateAcct` in an **open `C_Period`**. Where the seed genuinely can't
post (`fact_acct` is NOT in `ad_seed.db`), give me a **posting *preview* + an honest note**, never a fabricated journal.

The gap in one line: a pushed project shows a `PlannedAmt` but no earned value, no commitment, no revised contract
sum; a VO sits in `DR` forever; nothing invoices and nothing posts. This lane closes that.

---

## §OUTSTANDING (work to zero, in order — foundations first)

**F1 — Currency + conversion-rate fidelity** · `W-FIN-CURRENCY` · ✅ DONE (`tests/poc_fin_currency.js` 6/6 + 5/5 regression)
EXTRACT real `C_Currency` MYR (ISO 4217 = 458) + a `C_Conversion_Rate` (MYR→acct currency) into `ad_seed.db` via a
**reproducible seed script** (not a hand-edit). proj_fold / vo_fold carry the pack currency end-to-end.
*Witness:* fold a CIDB-Malaysia project → `C_Project.C_Currency_ID` = MYR, conversion rate resolvable, **no
`CUR_FALLBACK` note**; amounts unchanged (BigDecimal). Re-run the 5 regression witnesses against the new seed.
> **Done 2026-06-15:** Root cause = the browser passes the pack DISPLAY symbol `'RM'` (`navigate_find _cur()`), not the
> ISO `'MYR'`; the old ISO-only lookup fell back to USD(100). Fix = `_resolveCurrency` (ISO_Code OR CurSymbol; MYR.CurSymbol='RM')
> in `viewer/proj_fold.js` + `viewer/vo_fold.js` → C_Project/C_Order carry MYR(301). MYR currency already in seed; added the
> missing `C_Conversion_Rate` MYR↔USD via `scripts/seed_fin_currency.js` (EXTRACTs `meta.exchange_rate=3.91` from
> `cidb2024_my.json`; reuses seed org/client/conversiontype 114; idempotent). Fold surfaces `convRateToAcct`. W-FIN-CURRENCY
> 6/6 (incl. ZZZ falsifier + amounts-unchanged 1055478==golden); 5 regression witnesses re-pass. LOCALHOST — not deployed.

**F2 — UOM fidelity (BoQ speaks m³/m²/m)** · `W-FIN-UOM`
EXTRACT the standard `C_UOM` rows (M, M2, M3 — X12DE355) into the seed. The fold already knows the pack unit.
*Witness:* BoQ lines read m³/m²/m (not `EA`), **no `UOM_FALLBACK`**; line qty == the 5D golden to the unit.

**F3 — GL account mapping** · `W-FIN-GLMAP`
Map BIM `M_Product_Category` → real GL accounts (`M_Product_Category_Acct`, Dr WIP/Expense) and the order → AP, from
the seed's existing chart of accounts (EXTRACT, never invent an account number).
*Witness:* every BIM product/category resolves a Dr account; an order/invoice line has a postable account pair.

**F4 — PM control view: contract sum + EVM (live)** · `W-FIN-EVM` (+ `W-FIN-EVM-LIVE` browser)
Surface, on the C_Project (ERP window + a viewer readout): *Original Contract + Approved VOs = Revised Contract Sum*,
and **PV / EV / AC, CV / SV, CPI / SPI** — reusing `viewer/variation_order.js` math (lift it out of the Excel-only path).
*Witness:* headless math == hand-computed BigDecimal golden; browser-drive renders the control numbers on the project.

**F5 — VO approval moves the contract (DR→CO)** · `W-FIN-VO-APPROVE`
Approve a Variation Order through the DocAction FSM (DR→CO, who/when governance) so it **commits** and updates the
project's revised contract sum + `IsCommitment`.
*Witness:* approve VO → C_Project revised-contract-sum / commitment update; a 2nd approve is idempotent; CO is signed.

**F6 — §H2 Progress Claim → C_Invoice + posting preview** · `W-FIN-CLAIM` (+ `W-FIN-CLAIM-POST`)
Complete a phase (% / `IsComplete`) → raise a **progress C_Invoice** (`ProjInvoiceRule`) for the earned portion → show
the **GL posting preview** (Dr Cost, Cr AP). Honest where `fact_acct` is absent (preview only + note).
*Witness:* claim N% → invoice amount == earned value (BigDecimal); posting preview **balances Σ Dr = Σ Cr**.

**F7 — Tax (SST/GST) on the document lines** · `W-FIN-TAX`
EXTRACT a `C_Tax` rate from the seed (or seed a Malaysian SST row, reproducibly) and apply it to order/invoice lines.
*Witness:* invoice carries a tax line; net + tax == gross; totals balance to the cent.

**F8 — Period control** · `W-FIN-PERIOD`
`DateAcct` lands in an **open `C_Period`** (the seed carries `c_period`/`c_periodcontrol`); conversion rate honored.
*Witness:* the invoice/preview's period is open and resolved; a closed-period date is refused (falsifier).

### §BLUE — speculate the Project Order on the timeline, then roll it back (capstone; reuses F4/F5)

**F9 — Speculative ("blue") Project Order / VO** · `W-FIN-BLUE-SPEC`
Route the BIM push through the ERP **kernel op-log on the active blue branch** instead of raw INSERTs: when
`window.BlueFuture` is engaged, `proj_fold`/`vo_fold` commit via `KernelOps.commitGroup(db, ops, BlueFuture.groupMeta())`
so every row carries a `branch_id` (or, lighter: tag the §B-overlaid rows with the active branch). The speculative
C_Project/VO render with the **UNOFFICIAL blue treatment** and feed a *what-if* revised contract sum / EVM (F4) —
invisible to official chrome (`branch_id IS NULL`).
*Witness:* blue push → `KO.branchOps(db, branch)` carries the project/VO ops; an official query (`branch_id IS NULL`)
does **not** see them; the contract-sum control shows the speculative delta only in blue view.

**F10 — Roll back / accept the speculation on the timeline** · `W-FIN-BLUE-ROLLBACK`
Reuse the `‹ dots ›` history rail + `BlueFuture`: step-back / discard (`KO.discardBranch(db, branch)`) folds the
speculative Project Order away **atomically** (official state unchanged = the rollback the user asked for); a long-press
accept (`KO.acceptBranchUpTo(db, branch, uptoId)`) turns the blue ops **white** → it becomes the real, official
Project Order.
*Witness:* headless — `discardBranch` → `branchOps` empty + official contract sum reverts; `acceptBranchUpTo` → ops
go white + appear in official chrome. Browser — the blue Project Order **rolls back via the timeline gesture** and the
revised contract sum reverts; accept lands it official. (Reuses `W-BLUE-FUTURE` kernel + `project_history_branch_tree`.)

## §DONE
- ✅ **F1 — Currency + conversion-rate fidelity** — `W-FIN-CURRENCY` (`tests/poc_fin_currency.js`) 6/6 + 5/5 regression.
  `_resolveCurrency` (ISO|CurSymbol) in proj_fold/vo_fold kills CUR_FALLBACK ('RM'→MYR 301); `scripts/seed_fin_currency.js`
  seeds C_Conversion_Rate MYR↔USD from the CIDB pack (3.91). Amounts unchanged. LOCALHOST (2026-06-15).

---

## Discipline (non-negotiable)
- **Whitebox `§`-log witness FIRST** — every claim names a witness; a browser visual-drive closes "log≠visual proof".
- **EXTRACT / COMPILE only** — never invent a currency, rate, GL account, tax, UOM, period, or journal line. Real
  ISO 4217 / iDempiere rows only. Where the seed can't post for real, **preview + honest note** — never fabricate `fact_acct`.
- Money/qty via **BigDecimal** (`erp/bigdecimal.js`); any posting/claim must **balance (Σ Dr = Σ Cr)** or the witness FAILS.
- Seed additions (MYR / UOM / conversion / acct / tax) = a **reproducible script** under `scripts/` or `erp/`, not a
  hand-edit; re-run all 5 regression witnesses against the regenerated seed.
- `deploy/live/*` is production — never edit. Localhost until explicit **GO**; deploy = right SW bump
  (viewer `viewer/sw.js` v659 / ERP `erp/sw.js` v689→) → PR→`main`→Pages. ERP sw changelog = the git commit (2026-06-15 convention).
- **Worktree** `/tmp/wt-bim2proj` (shared `~/bim-ootb` is hook-blocked). Prior lane branches were squash-merged —
  start a **fresh branch off `origin/main`** per card (or per small group), don't reuse.

```
git -C /tmp/wt-bim2proj fetch origin && git -C /tmp/wt-bim2proj checkout -b feat/fin-<card> origin/main
# regression — all must pass before AND after each card:
cd /tmp/wt-bim2proj && for w in poc_proj_schema poc_find_cost poc_proj_push poc_vo_fold poc_bim_overlay; do \
  NODE_PATH=$HOME/bim-ootb/node_modules node tests/$w.js >/dev/null 2>&1 && echo "$w PASS" || echo "$w FAIL"; done
# browser: PORT=8147 python3 -m http.server (from worktree); NODE_PATH=$HOME/bim-ootb/tests/node_modules node tests/probe_*.js
```

## Read first (each session opening this lane)
Memory `project_bim_to_project.md` (state + named gaps), `project_posting_preview.md`, `project_erp_reporting_lane.md`;
specs `docs/ERP.md`, `docs/BIMtoProject.md`, `docs/BIMtoERP.md`; reuse `viewer/variation_order.js` (EVM math),
`erp/doc_poster.js` / `erp/ad_process.js` (posting engine), `viewer/proj_fold.js` + `viewer/vo_fold.js` (the folds to extend).
