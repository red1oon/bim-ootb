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

**F2 — UOM fidelity (BoQ speaks m³/m²/m)** · `W-FIN-UOM` · ✅ DONE (`tests/poc_fin_uom.js` 6/6 + 5/5 regression)
EXTRACT the standard `C_UOM` rows (M, M2, M3 — X12DE355) into the seed. The fold already knows the pack unit.
*Witness:* BoQ lines read m³/m²/m (not `EA`), **no `UOM_FALLBACK`**; line qty == the 5D golden to the unit.
> **Done 2026-06-15:** `scripts/seed_fin_uom.js` adds M/M2/M3 (X12DE355 short code = pack/fold convention, same as the
> seed's pre-existing 'CM' row; UNCEFACT = real UN/CEFACT Rec-20 MTR/MTK/MTQ; UOMType LE/AR/VD extracted from AD_Ref_List;
> StdPrecision 3 = QTO precision). Idempotent. W-FIN-UOM 6/6 (16 metre lines resolve; 8 EA classes stay EA = falsifier holds;
> qty==5D golden 3dp). 5 regression re-pass. LOCALHOST — not deployed.

**F3 — GL account mapping** · `W-FIN-GLMAP` · ✅ DONE (`tests/poc_fin_glmap.js` 6/6 + 5/5 regression)
Map BIM `M_Product_Category` → real GL accounts (`M_Product_Category_Acct`, Dr WIP/Expense) and the order → AP, from
the seed's existing chart of accounts (EXTRACT, never invent an account number).
*Witness:* every BIM product/category resolves a Dr account; an order/invoice line has a postable account pair.
> **Done 2026-06-15:** the categories are folded at runtime, so the mapping lives in the fold (as iDempiere's
> MProductCategory does): `proj_fold._seedCategoryAcct` creates `M_Product_Category_Acct` per acct schema, copying the
> full p_*_acct set from `C_AcctSchema_Default` verbatim; `proj_fold._glMap` surfaces the postable pair (Dr WIP `14130` /
> Expense `51200`, Cr AP `21100` from the BP-group / schema default). W-FIN-GLMAP 6/6: primary-schema Dr resolves to a real
> C_ValidCombination→C_ElementValue, every non-null acct traces to the chart, Dr≠Cr. 5 regression re-pass. LOCALHOST.

**F4 — PM control view: contract sum + EVM (live)** · `W-FIN-EVM` (+ `W-FIN-EVM-LIVE` browser) · ✅ DONE (6/6 + 8/8 + 5/5 reg)
Surface, on the C_Project (ERP window + a viewer readout): *Original Contract + Approved VOs = Revised Contract Sum*,
and **PV / EV / AC, CV / SV, CPI / SPI** — reusing `viewer/variation_order.js` math (lift it out of the Excel-only path).
*Witness:* headless math == hand-computed BigDecimal golden; browser-drive renders the control numbers on the project.
> **Done 2026-06-15:** new `viewer/proj_control.js` (BigDecimal) — `evmMetrics` (the variance/index formulas documented in
> variation_order.js, now real), `contractSum` (original + Σ CO-VO GrandTotal = revised; DR VOs are pending), `evm`
> (BAC=Σ phase PlannedAmt, PV=schedule-fraction, EV=Σ IsComplete phases, AC=C_Project.InvoicedAmt — all EXTRACTED;
> CPI/SPI null on zero divisor, never faked). `navigate_find._pushToErp` logs `§PROJ_CONTROL` + shows the contract sum in
> the status bar (viewer.html loads proj_control.js?v=1; proj_fold/vo_fold?v=2). W-FIN-EVM 6/6 (math golden, DR→CO contract
> buckets = F5 hook, project EVM extraction, AC honesty). W-FIN-EVM-LIVE 8/8 (`tests/probe_fin_evm.js`, Hospital): live push →
> §PROJ_CONTROL revised=4,359,746 / BAC / PV / AC=0 + honest note; status bar shows the contract sum. 5 regression re-pass. LOCALHOST.

**F5 — VO approval moves the contract (DR→CO)** · `W-FIN-VO-APPROVE` · ✅ DONE (`tests/poc_fin_vo_approve.js` 6/6 + 5/5 reg)
Approve a Variation Order through the DocAction FSM (DR→CO, who/when governance) so it **commits** and updates the
project's revised contract sum + `IsCommitment`.
*Witness:* approve VO → C_Project revised-contract-sum / commitment update; a 2nd approve is idempotent; CO is signed.
> **Done 2026-06-15:** new `viewer/vo_approve.js` `approveVariationOrder` REUSES the real DocAction FSM
> (`erp/ad_docfsm.js` `dispatchOrder`, DR→CO gated — not a blind UPDATE) → DocStatus CO, signed (IsApproved=Y + who
> UpdatedBy / when Updated + the POReference delta-digest content signature), then MOVES the commitment
> (C_Project.CommittedAmt += GrandTotal, IsCommitment='Y'); revised contract sum (proj_control.contractSum) =
> original+VO. W-FIN-VO-APPROVE 6/6: DR→CO, commitment 1312.5→revised 1056790.5, 2nd approve idempotent (no
> double-commit), FSM rejects CO→CO (falsifier = gated). viewer.html ships ad_docfsm.js + vo_approve.js?v=1. 5 reg re-pass. LOCALHOST.

**F6 — §H2 Progress Claim → C_Invoice + posting preview** · `W-FIN-CLAIM` (+ `W-FIN-CLAIM-POST`) · ✅ DONE (`tests/poc_fin_claim.js` 7/7 + 5/5 reg)
Complete a phase (% / `IsComplete`) → raise a **progress C_Invoice** (`ProjInvoiceRule`) for the earned portion → show
the **GL posting preview** (Dr Cost, Cr AP). Honest where `fact_acct` is absent (preview only + note).
*Witness:* claim N% → invoice amount == earned value (BigDecimal); posting preview **balances Σ Dr = Σ Cr**.
> **Done 2026-06-15:** new `viewer/proj_claim.js` — `progressClaim` raises an AP C_Invoice (DocBaseType API, one line per
> newly-complete phase, sets ProjInvoiceRule, idempotent at phase granularity) for the earned EV delta and moves
> C_Project.InvoicedAmt (so EVM AC stops being 0 → CPI computable, closing F4's honesty gap). `postingPreview` derives the
> GL manifest Dr WIP `14130` / Cr AP `21100` (F3 accounts) and balances ΣDr=ΣCr; it does NOT write Fact_Acct (posted=false +
> honest note — a folded claim is previewed, posting is an explicit ERP-app DocAction). W-FIN-CLAIM 7/7 (claim==EV 2240,
> AC→CPI 1.0000, preview balances, idempotent re-claim=0, unbalanced-manifest falsifier caught). viewer.html ships
> proj_claim.js?v=1. 5 regression re-pass. LOCALHOST.

**F7 — Tax (SST/GST) on the document lines** · `W-FIN-TAX` · ✅ DONE (`tests/poc_fin_tax.js` 6/6 + F6 + 5/5 reg)
EXTRACT a `C_Tax` rate from the seed (or seed a Malaysian SST row, reproducibly) and apply it to order/invoice lines.
*Witness:* invoice carries a tax line; net + tax == gross; totals balance to the cent.
> **Done 2026-06-15:** `scripts/seed_fin_tax.js` seeds Malaysia SST (the statutory 6% Service Tax, country MY 238, Standard
> category) + C_Tax_Acct rows copied from the seed's existing 6% tax (idempotent). `proj_claim.progressClaim` gained an
> optional `taxId`: each line carries C_Tax_ID + TaxAmt=round(net×6%), GrandTotal=net+tax (tax-off path preserves F6).
> `postingPreview` adds the recoverable INPUT tax to the tax's T_Credit account. W-FIN-TAX 6/6: net 2240 + tax 134.40 =
> gross 2374.40; preview balances Dr WIP `14130` + Dr InputTax `12610` = Cr AP `21100`; AC moves by NET only (tax recoverable).
> 5 regression + F6 re-pass. LOCALHOST.

**F8 — Period control** · `W-FIN-PERIOD` · ✅ DONE (`tests/poc_fin_period.js` 6/6 + 8 fin + 5/5 reg)
`DateAcct` lands in an **open `C_Period`** (the seed carries `c_period`/`c_periodcontrol`); conversion rate honored.
*Witness:* the invoice/preview's period is open and resolved; a closed-period date is refused (falsifier).
> **Done 2026-06-15:** new `viewer/proj_period.js` — `resolvePeriod(db,dateAcct,docBaseType,client)` returns the covering
> C_Period + its C_PeriodControl status (open === 'O'; C/N/P refuse — real iDempiere gate); `conversionRateAsOf` honours the
> rate's validity window. `proj_claim` resolves the period for DateAcct+'API' (always reported; enforcement opt-in via
> `requireOpenPeriod` so a future-period demo still previews). Aligned the F1 MYR conversion rate validfrom→2000-01-01 (seed
> base-rate convention) so it covers the open GardenWorld-era periods. W-FIN-PERIOD 6/6: open Dec-06 'O' → claim posts in
> window; closed Jun-26 'N' + enforce → refused, no invoice (falsifier); MYR rate resolvable as-of the open date.
> viewer.html ships proj_period.js?v=1. All 8 finance + 5 regression re-pass. LOCALHOST.

### §BLUE — speculate the Project Order on the timeline, then roll it back (capstone; reuses F4/F5)

**F9 — Speculative ("blue") Project Order / VO** · `W-FIN-BLUE-SPEC` · ✅ DONE (`tests/poc_fin_blue_spec.js` 5/5)
Route the BIM push through the ERP **kernel op-log on the active blue branch** instead of raw INSERTs: when
`window.BlueFuture` is engaged, `proj_fold`/`vo_fold` commit via `KernelOps.commitGroup(db, ops, BlueFuture.groupMeta())`
so every row carries a `branch_id` (or, lighter: tag the §B-overlaid rows with the active branch). The speculative
C_Project/VO render with the **UNOFFICIAL blue treatment** and feed a *what-if* revised contract sum / EVM (F4) —
invisible to official chrome (`branch_id IS NULL`).
*Witness:* blue push → `KO.branchOps(db, branch)` carries the project/VO ops; an official query (`branch_id IS NULL`)
does **not** see them; the contract-sum control shows the speculative delta only in blue view.
> **Done 2026-06-15:** new `viewer/blue_fold.js` `commitBlue` REUSES `KernelOps.commitGroup(db, ops, {branch_id})` (exactly
> what `BlueFuture.groupMeta()` hands signed commits) + tags the projection rows (C_Project/C_Order, branch_id column
> ALTERed in idempotently). `proj_control.contractSum` gained a column-safe `branch` arg (official = branch_id IS NULL;
> blue view = + the branch) and a `whatIfRevised` (original + approved + pending). `navigate_find._pushToErp` routes through
> BlueFold when `window.BlueFuture.isBlue()` (no-op in the plain viewer → white push, EVM-LIVE 8/8 unchanged). W-FIN-BLUE-SPEC
> 5/5: blue VO op carried by branchOps, official op-projection + official query both empty, what-if delta only in blue view.

**F10 — Roll back / accept the speculation on the timeline** · `W-FIN-BLUE-ROLLBACK` · ✅ DONE (engine, `tests/poc_fin_blue_rollback.js` 5/5)
Reuse the `‹ dots ›` history rail + `BlueFuture`: step-back / discard (`KO.discardBranch(db, branch)`) folds the
speculative Project Order away **atomically** (official state unchanged = the rollback the user asked for); a long-press
accept (`KO.acceptBranchUpTo(db, branch, uptoId)`) turns the blue ops **white** → it becomes the real, official
Project Order.
*Witness:* headless — `discardBranch` → `branchOps` empty + official contract sum reverts; `acceptBranchUpTo` → ops
go white + appear in official chrome. Browser — the blue Project Order **rolls back via the timeline gesture** and the
revised contract sum reverts; accept lands it official. (Reuses `W-BLUE-FUTURE` kernel + `project_history_branch_tree`.)
> **Done 2026-06-15 (engine):** `blue_fold.discardBlue` wraps `KernelOps.discardBranch` + drops the blue projection rows;
> `blue_fold.acceptBlue` wraps `KernelOps.acceptBranchUpTo` + clears branch_id on the rows. W-FIN-BLUE-ROLLBACK 5/5:
> discard → branchOps empty + blue VO row gone + blue what-if reverts to original while official is untouched the whole
> cycle; accept → blue ops turn white (branch_id IS NULL), row becomes official, official contract sum picks up the VO.
> ⏳ **Remaining (browser):** drive the live ERP `‹ dots ›` rail gesture on a BIM-pushed blue Project Order — reuses the
> already-shipped `BlueFuture` discardAll/acceptUpTo (which call exactly these kernel seams); blue_fold is wired for it.

## §DONE
- ✅ **F1 — Currency + conversion-rate fidelity** — `W-FIN-CURRENCY` (`tests/poc_fin_currency.js`) 6/6 + 5/5 regression.
  `_resolveCurrency` (ISO|CurSymbol) in proj_fold/vo_fold kills CUR_FALLBACK ('RM'→MYR 301); `scripts/seed_fin_currency.js`
  seeds C_Conversion_Rate MYR↔USD from the CIDB pack (3.91). Amounts unchanged. LOCALHOST (2026-06-15).
- ✅ **F2 — UOM fidelity** — `W-FIN-UOM` (`tests/poc_fin_uom.js`) 6/6 + 5/5 regression. `scripts/seed_fin_uom.js` adds
  M/M2/M3 (UNCEFACT MTR/MTK/MTQ, UOMType LE/AR/VD); BoQ reads m/m²/m³, no UOM_FALLBACK, qty==5D golden. LOCALHOST (2026-06-15).
- ✅ **F3 — GL account mapping** — `W-FIN-GLMAP` (`tests/poc_fin_glmap.js`) 6/6 + 5/5 regression. `proj_fold._seedCategoryAcct`
  copies C_AcctSchema_Default → M_Product_Category_Acct per BIM category; `_glMap` exposes Dr WIP 14130/Cr AP 21100. LOCALHOST (2026-06-15).
- ✅ **F4 — Contract sum + EVM** — `W-FIN-EVM` (`tests/poc_fin_evm.js`) 6/6 + `W-FIN-EVM-LIVE` (`tests/probe_fin_evm.js`) 8/8 + 5/5
  regression. `viewer/proj_control.js` (contractSum/evm/evmMetrics, BigDecimal); `navigate_find` logs §PROJ_CONTROL + status bar. LOCALHOST (2026-06-15).
- ✅ **F5 — VO approval (DR→CO)** — `W-FIN-VO-APPROVE` (`tests/poc_fin_vo_approve.js`) 6/6 + 5/5 regression. `viewer/vo_approve.js`
  reuses `erp/ad_docfsm.js` dispatchOrder (gated DR→CO), moves C_Project.CommittedAmt + IsCommitment, idempotent, signed. LOCALHOST (2026-06-15).
- ✅ **F6 — Progress claim → C_Invoice + posting preview** — `W-FIN-CLAIM` (`tests/poc_fin_claim.js`) 7/7 + 5/5 regression.
  `viewer/proj_claim.js` progressClaim (AP invoice == EV, moves InvoicedAmt→AC) + postingPreview (Dr WIP/Cr AP balances, no fact_acct write). LOCALHOST (2026-06-15).
- ✅ **F7 — Tax (SST) on lines** — `W-FIN-TAX` (`tests/poc_fin_tax.js`) 6/6 + F6 + 5/5 regression. `scripts/seed_fin_tax.js`
  (MY SST 6% + C_Tax_Acct); proj_claim optional taxId → line TaxAmt, net+tax==gross, preview adds Dr input-tax (12610), balances. LOCALHOST (2026-06-15).
- ✅ **F8 — Period control** — `W-FIN-PERIOD` (`tests/poc_fin_period.js`) 6/6 + 8 finance + 5/5 regression. `viewer/proj_period.js`
  resolvePeriod/conversionRateAsOf; proj_claim opt-in requireOpenPeriod gate (open posts, closed refused). MYR rate validfrom→2000. LOCALHOST (2026-06-15).

- ✅ **F9 — Speculative blue Project Order/VO** — `W-FIN-BLUE-SPEC` (`tests/poc_fin_blue_spec.js`) 5/5. `viewer/blue_fold.js`
  reuses KernelOps.commitGroup({branch_id}); contractSum branch arg + whatIfRevised; navigate_find routes blue when engaged. LOCALHOST (2026-06-15).
- ✅ **F10 — Roll back / accept on the timeline** — `W-FIN-BLUE-ROLLBACK` (`tests/poc_fin_blue_rollback.js`) 5/5 (engine).
  blue_fold discardBlue (KO.discardBranch + drop rows) / acceptBlue (KO.acceptBranchUpTo + white rows). Browser ‹dots›-gesture drive remaining. LOCALHOST (2026-06-15).

**🎯 Lane F1–F10 engine-complete 2026-06-15** — 12 finance witnesses (F1–F8 + F9/F10) + EVM-LIVE browser + 5 regression, all green,
all LOCALHOST. ONE remaining sub-item: F10 live ERP ‹dots›-timeline gesture drive (engine + wiring done, reuses shipped BlueFuture).

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
