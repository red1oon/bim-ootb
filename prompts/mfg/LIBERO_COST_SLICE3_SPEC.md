# ⚠ DO NOT REMOVE — Libero bundle, slice 3: ORDER DocAction + COST COLLECTOR (Receipt 100 / Issue 110) (read the log after every run)

Parent: `LIBERO_BUNDLE_SLICE1_SPEC.md` (slices 1-2, scene 2), `CONVENTIONS_STUDY.md` §10-11. Witness: `erp/tests/witness_libero_cost.js` (tag `§LCOST`). Oracle: the Libero Java (pshepetko @ b2adfea0, the author-confirmed lineage) read verbatim + core `model_cost.js`/`model_trade.js` for what core already ports. There are NO legacy rows to compare against (reference Postgres: PP_Cost_Collector 0, PP_Order_Cost 0, M_CostDetail rows for collectors 0), so every expectation in the witness is computed INDEPENDENTLY by hand from the Java formulas, never from the code under test.

## Issue it proves or disproves
After a manufacturing order is completed, a Component Issue moves stock OUT, books the BOM line delivery and a cost detail per Standard cost element; a Material Receipt moves finished goods IN, books the order delivery and the finished-goods cost from the issues (calculateFG); refusals are the Java's (costing method, period/ASI); stopping the bundle leaves data and removes behaviour.

## Source map (file:line, Libero repo)
- `MPPOrder.prepareIt` :547-604 (needs lines; one warehouse; DocType target; reserveStock(lines) + orderStock), `approveIt` :659-668, `completeIt` :686-730 (implicit approve, `createStandardCosts` :1495-1580 -> PP_Order_Cost via `MPPOrderCost(MCost, PP_Order_ID)`, `autoReportActivities` :1455-1491 (milestone activities only: a milestone routing is REFUSED here, named), DocAction=CL).
- `MPPOrder.orderStock` :606-657. **Fork divergence found 2026-10-15:** pshepetko `MStorageOnHand.add(..., ordered)` ADDS the ordered qty to ON-HAND; logilite (`org.idempiere.mfg2`) uses `MStorageReservation.add(..., false)`. Core iDempiere's own invariant is that ordered/reserved qty lives in M_StorageReservation, never on hand, so the port uses the RESERVATION semantics (`SOURCE.orderStock='reservation'`); the pshepetko variant is kept behind `SOURCE.orderStock='onhand'` and is a flip of one constant. Logged `§LIBERO-ORDERSTOCK`.
- `MPPCostCollector` :73-142 (createCollector), :208-220 (ctor defaults), setPP_Order :144-160, `prepareIt` :300-387, `completeIt` :404-570 (Issue/Receipt/Activity/Variance branches; this slice ports Issue+Receipt, the others are REFUSED by name), `beforeSave` :712-745, movement type W+ (receipt) / W- (issue) :926-935.
- `StorageEngine.createTransaction` :49-140 + `checkMaterialPolicy` :146-250 (FIFO/LIFO over on-hand; incoming creates an ASI; MA rows in PP_Cost_CollectorMA), `create` :260-275 (M_Transaction then `CostEngine.createCostDetail`).
- `CostEngine.createCostDetail` :258-320, `getProductActualCostPrice` :105-125, `calculateFG` :220-272, `createRateVariances` / `createMethodVariances` (:520-655: rate variance for an Issue when order std price != actual price; method variance only for MethodChange collectors), `getCostingMethod` :55-65 (**a product whose category/schema costing method is not Standard is REFUSED: "Costing method not supported - A"** - GardenWorld ships Average PO, so Standard Costing is a SETUP PREREQUISITE the witness and the film show).
- Core reuse (not re-ported): `model_trade` storageAdd/reservationAdd, `model_cost` MCostDetail new/save/process, `model_master.clientAcctSchemas`.

## Deferred (named, printed as §LIBERO-DEFERRED)
Activity Control collectors + routing resource base value; Usage/Method/Mix variance collector creation; reversal/void of collectors; `MPPOrder.voidIt/closeIt/createVariances`; subcontracting `createPO`; PP_Order_BOMLineMA (logilite only); the Doc_PPCostCollector posting (M6).

## RESULT 2026-10-15 (witness `witness_libero_cost.js`, 20 checks PASS; breaks nostd/calcfg/noreserve/onhand red; live `poc_libero_live.js` V6)
Every number below was computed by hand first (comments in the witness), none read from the code under test.
- Order: creation reserves the finished product (orderStock 100, reservation semantics) and each stocked BOM line (reserved = required: KG 7070.71, BAG 100). DocAction CO: PP_Order_Cost snapshot = 20 rows = an independent count over M_Cost; status CO, DocAction CL, approved.
- **Costing-method refusal:** an Issue under Average PO is refused "Costing method not supported - A", nothing moves. Standard Costing is therefore a SETUP PREREQUISITE (the witness flips the three categories to S as a labelled fixture).
- Issues: KG 7070.71 out (10000 -> 2929.29), Material detail 2.5 x -7070.71 = -17676.775, BAG 0.4 x -100 = -40, one detail per Standard element x schema (5 x 2), BOM lines delivered/reserved 0, FIFO MA row, collector CO/Processed/CL with DocType 50013.
- Receipts: 40 then 60. FG cost 40/100 x 17716.775 = 7086.71, then 60/60 x (17716.775 - 7086.71) = 10630.065; the two sum to exactly the issued cost; a NEW ASI per receipt (two storage rows 40 + 60); order delivered 100, DateStart/DateFinish set, reservation released, supply MRP 0.
- Rate variance: a standard price (2.0, the order snapshot) below the actual (2.5) produces ONE completed Rate Variance collector with details (+17676.775, +7070.71) and (-14141.42, -7070.71).
- Refusals: Receipt on an order with no QtyEntered (calculateFG divide by zero, nothing moves); Activity Control (160), Usage (120), Method Change (130) collectors REFUSED by name; Issue without a BOM line (FillMandatory).
- Stop: collector model + DocAction gone, data kept.
- **Facts found while building (decisions/risks):**
  1. orderStock fork divergence (above). Default = reservation semantics; `SOURCE.orderStock='onhand'` is the pshepetko variant and the `onhand` break proves the witness sees it (ordered qty lands on hand).
  2. `CostEngine.calculateFG` divides by `QtyEntered - QtyDelivered`: an order MUST carry QtyEntered (a UI order does). Setting QtyEntered at creation triggers the explode-twice quirk (§LIBERO-DOUBLE-EXPLODE), so the fixture sets it after creation.
  3. Changing M_Cost.CurrentCostPrice directly is undone by core cost HISTORY at the next detail processing (`getCostInfo`), so standard price changes must go through the cost-update path; the variance test moves the order's snapshot instead.
  4. A short stock splits an Issue over the existing storage plus a NEW ASI (two M_Transactions, two cost details) - faithful StorageEngine behaviour.
  5. The local core `MStorageOnHand.add` has no 7-arg overload that Libero calls, i.e. this Libero snapshot is not compile-exact for the local core; the date-material-policy argument is the movement date (incoming) / the matched storage row's (outgoing).
  6. Core drops seen at apply (not the bundle): `m_cost.processed`, `m_storageonhand.m_warehouse_id` - CORE ports write columns the seed tables lack.
