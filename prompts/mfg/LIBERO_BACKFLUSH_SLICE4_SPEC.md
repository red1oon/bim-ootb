<!-- SPDX-License-Identifier: GPL-2.0-only -->
# ⚠ DO NOT REMOVE — Libero slice 4: Issue/Receipt one-step ("Backflush"). Scope: the legacy auto-completing collector entry points and the Order Receipt & Issue form's process. READ THE LOG after every run (witness verdict `§LBACK-VERDICT`; exit code alone is not evidence).
Decision record: bim-compiler `prompts/ERP_FRIENDLY_OPS_LENS.md` §11 (owner agreed 2026-10-15). Source: pshepetko/org.idempiere.mfg @ b2adfea0 (GPLv2); every rule below is cited file:line and ported as written, not improved.

## 1. Why
The twin has the collector model and DocAction (slice 3) but not the code legacy uses to CREATE AND COMPLETE collectors, so a user completes every collector by hand and finishing an order took 4 documents in the film. Legacy completes them in one call; this slice ports that call and the form that drives it. Nothing here is Odoo-derived and no behaviour differs from legacy (TWIN CARDINAL RULE).

## 2. Pieces (each = one Java method, one function in `erp/plugins/libero_cost.mjs`)
| Port | Java | Rule |
|---|---|---|
| `createCollector(trx, order, p)` | `MPPCostCollector.createCollector` :73-156 | build the collector (`collectorFields`), save, then `processIt(CO)` in the same transaction; refusal text of the DocAction is thrown |
| `getStorages(trx, product, wh, asi)` | `MPPOrder.getStorages` :206-251 | stocked item only; positive on-hand rows of the warehouse in material-policy order (FIFO or LIFO); ASI as given when the product carries no ASI of its own |
| `createIssue(...)` | `MPPOrder.createIssue` :1256-1330 | skip qty 0; loop the storage rows, `qtyIssue = min(toIssue, onHand)`, one collector per row; type 110 Component Issue, 130 Method Change Variance when the BOM line has QtyBatch=0 and QtyBOM=0, 150 Mix Variance for a co-product; scrap and reject repeat on every row (legacy quirk, kept); `forceIssue` issues the remainder from the line's own locator; a remainder otherwise throws "Should not happen" |
| `createReceipt(...)` | `MPPOrder.createReceipt` :1190-1245 | one collector type 100 when qty, scrap or reject is non-zero; then DateDelivered=movement date, DateStart if empty, DateFinish when (delivered param + scrap) >= toDeliver param (the delivered param is the quantity delivered BEFORE this receipt: kept) |
| `isQtyAvailable(...)` | `MPPOrder.isQtyAvailable` :126-190 | for each selected stocked row: sum of the storage rows' on-hand >= toDeliver + scrap, else the whole process stops before anything is written |
| `backflushRows(trx, order, p)` | `OrderReceiptIssue.executeQuery` :309-540 (form defaults) | per BOM line of type CO or PK: selected when on-hand > 0 and required > 0; percentage lines: perc = QtyBatch / 100 (scale 8, HALF_UP); Backflush => toDeliver x perc, falling back to required - delivered when that is negative or zero (:411-449); OnlyIssue => open; absolute lines: Backflush => toDeliver x QtyBom, OnlyIssue => open; scrap = scrapQty x (perc or QtyBom). Tools (TL): qty = QtyBom, not selected. Other types: nothing |
| `backflush(trx, orderId, p)` | `WOrderReceiptIssue.cmd_process` :895-950 | rule BackFlush / OnlyIssue / OnlyReceipt; locator required for receipt ("NoLocator"); Backflush and OnlyIssue run createIssue for every selected row, Backflush and OnlyReceipt run createReceipt; ALL in one transaction (any refusal rolls the whole thing back) |
Form defaults (WOrderReceiptIssue :598-604): ordered = QtyOrdered, delivered = QtyDelivered, open = ordered - delivered, toDeliver = open, scrap = reject = 0, locator = the warehouse's default locator.
**DEFERRED and named (never silent):** `isCloseDocument` (needs MPPOrder.closeIt, not ported: the call is refused with that text), guarantee-date filter of getStorages, lot/serial ASI generation.
**Host change (one, generic):** `ModelLayer.run` gets `timing: 'PROCESS'` which runs a caller function inside one Trx and returns its op group, so any plugin process is atomic (all-or-none) and traced by `§EVENT_SEQ`. No per-table code.

## 3. Witness W-LIBERO-BACKFLUSH (`erp/tests/witness_libero_backflush.js`), same GardenWorld fixture as W-LIBERO-COST (order 100 x Fertilizer, KG on hand 10000, BAG 500; standard prices KG 2.5, BAG 0.4; BOM lines are ABSOLUTE: KG QtyBom 70 scrap 1, BAG QtyBom 1). Every expected number is hand-computed:
- B1 defaults (form rules): toDeliver = open = 100; KG row = 100 x 70 = 7000 (NOT the 7070.71 required: the form multiplies QtyBom without the scrap divide; kept), BAG row = 100 x 1 = 100; both selected (on-hand > 0, required > 0); scrap 0.
- B2 Backflush on that order after the order is completed: stock KG 10000 -> 3000, BAG 500 -> 400, finished product 0 -> 100; exactly three collectors (110, 110, 100) all `CO`; cost details Material: KG 7000 x 2.5 = -17500, BAG 100 x 0.4 = -40, receipt = +17540 (the issues' cost, calculateFG).
- B3 `§EVENT_SEQ` of the one-step equals the concatenation of the three plain collector saves + completions, event for event, in order (the integrity claim).
- B4 insufficient stock (BAG on hand set to 50) -> isQtyAvailable false -> NOTHING written (no collector, no transaction), refusal text printed.
- B5 forced rollback: the receipt step made to fail (locator 0) -> the issues are rolled back too (storage and collector count unchanged).
- B6 two storage rows for KG (4000 FIFO-older, 6000): an issue of 7000 creates two collectors 4000 and 3000 (one per row, FIFO order), both CO.
- B7 `isCloseDocument` -> refused "DEFERRED: MPPOrder.closeIt" and nothing written.
- B8 scrap repeat quirk: scrap 2 with two storage rows -> both collectors carry scrap 2.
Breaks (MUST exit 1): `LBACK_BREAK=perrow` (one collector per component instead of per storage row), `LBACK_BREAK=noatomic` (no rollback), `LBACK_BREAK=scrapdiv` (defaults divide by 1-scrap%).

## 4. Status (2026-10-15)
Engine DONE and witnessed: `createCollector`, `getStorages`, `createIssue`, `createReceipt`, `isQtyAvailable`, `backflushRows`, `backflush` in `libero_cost.mjs`; `ModelLayer.run` timing `PROCESS`. W-LIBERO-BACKFLUSH: 11 judged / 0 failed; the three breaks (`perrow`, `noatomic`, `scrapdiv`) exit 1. B3 shows the one-step fires the same 96 model events in the same order as the three plain collectors.
Finding while building B5: the twin does NOT reject a stock transaction into a locator that does not exist (legacy's foreign key would); a receipt to locator 999999 succeeded and created stock. Not fixed here (core storage engine, `ModelTrade.storageAdd`): logged for the ERP-depth lane as a TWIN gap.
NOT done (next, in order): (1) UI: an AD_Process "Backflush" on the Manufacturing Order window (button) with a dictionary row in `manifest.dictionary`, its handler calling `ML.run({timing:'PROCESS'})`, defaults from `backflushRows`, row-level quantities editable (the embargo of the InfoWindow port); (2) film beat replacing the four funnel calls; (3) M6 postings (Doc_PPCostCollector), which this slice leaves unchanged per collector.
