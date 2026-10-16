# ⚠ DO NOT REMOVE — Milestone 5: W-MFG-MRP (scope: PP_MRP rows as a deterministic derived fold; read the log after every run)

Parent: `Manufacturing Model Milestones and Contracts.md` row W-MFG-MRP + design rule 6 ("MRP output is derived ... rebuilt by a deterministic fold, never hand-written"). Worktree `/tmp/wt-mfg`, branch `feat/mfg-wire`.

## Issue it proves or disproves
Two MRP runs over the same state, and a run over a state REBUILT FROM THE OP LOG ALONE, give byte-identical PP_MRP rows; nothing in a row comes from a clock, a counter or iteration luck.
Also: for the legacy orders the derived rows equal legacy iDempiere's stored PP_MRP rows (field by field, on the derivable fields).

## Facts measured 2026-10-14 (seed pp_mrp, 56 rows: FCT/D 50, MOP/D 4, MOP/S 2)
- The 6 MOP rows belong to legacy orders 50000/50001 (3 each): one D row per BOM component line (qty = the snapshot line's QtyRequired, product = the component) and one S row for the order's product (qty = QtyOrdered 100).
  Copied from the order: DocStatus, Name (= DocumentNo), AD_Org_ID, AD_Client_ID, M_Warehouse_ID, S_Resource_ID, DateOrdered, DatePromised, DateStartSchedule. D rows DateFinishSchedule = order's (2008-08-17).
- NOT derivable, excluded from the fold by design: PP_MRP_ID and Value (minted sequence numbers 50061.., 50045..), DatesSimulation (wall clock at insert: 18:02:27, :30, :35, :41, :43, :46 - differs per row),
  Created/Updated, IsAvailable (N on 6/6; meaning not evidenced). Identity of a derived row = a deterministic key from DocumentNo + type + line (an input, like every other id).
- AMBIGUOUS (reported, not asserted away): S row DateFinishSchedule = 2008-08-16 = the order's DateStartSchedule, but both legacy orders have the identical date pair, so a different rule (e.g. finish - 1 day)
  fits equally. The fold uses "= DateStartSchedule" and the witness prints `§MFG-MRP-AMBIGUOUS`.
- No planned-order rows exist in the seed (no S/MOP row without an order), and the 50 FCT rows come from forecast lines. Netting / planned-order generation and forecast demand have NO legacy evidence here.

## Design
- New pure module `erp/mfg_mrp.js`: `fold(q)` reads the kernel projection (documents PP_Order + their document_lines snapshot) through a READ-ONLY query and RETURNS PP_MRP row objects sorted by key. It writes nothing,
  emits no ops (derived, not logged; per rule 6 only an approved planned order would ever enter the log), reads no clock, mints no counter.
- `erp/mfg_snapshot.js` explodeOps: the order input may carry `attrs` (DateOrdered, DatePromised, DateStartSchedule, DateFinishSchedule, S_Resource_ID, AD_Org_ID, AD_Client_ID) copied verbatim into the CREATE_DOCUMENT payload,
  because the fold may only use what the log holds.
- Out of scope, named: netting / planned orders (MRP "run" proper), forecast demand (FCT), sales/purchase order demand-supply, QtyDelivered in the supply qty (order op has none yet), IsAvailable.

## Witness `erp/tests/witness_mfg_mrp.js` (tag `§MFG-MRP`)
- R1 ORACLE: rows for the two legacy orders equal the seed's 6 MOP rows on the derivable fields. R2 run1 == run2 == fold over replay-rebuilt projection (hash). R3 the fold's rows carry none of the excluded fields.
- R4 non-vacuity: population > 0 and a changed order changes the hash. R5 the fold is read-only (projection hash unchanged across it). R6 ambiguity printed.
- Deliberate breaks (must be red, named): `MFG_BREAK=clock` (a wall-clock stamp inside the fold), `MFG_BREAK=counter` (a running pp_mrp_id counter) -> run1 != run2 / replay.

## RESULT 2026-10-14 (logs: ~/Projects/Mfg/logs/w_mfg_mrp_{green,clock,counter}.log)
- Green, 5 checks, exit 0. R1: 6 legacy PP_MRP rows, 6 matched, 84 fields compared, 0 diffs. R2: run1 == run2 == replay = dabc9e5d (6 rows each). R3: no excluded column present. R4: a third order (qty 250) -> 9 rows, hash changes.
  R5: fold read-only (projection hash and op count unchanged).
- Breaks red: `clock` -> R2 (b3f3fdd / ec4bfb0 / 9e317a77) + R3 (datesimulation on all 6 rows); `counter` -> R2 + R3 (pp_mrp_id on all 6 rows).
- Printed, not asserted away: `§MFG-MRP-AMBIGUOUS` (S-row DateFinishSchedule rule fits one data point only).
- Files: erp/mfg_mrp.js (pure fold, new), erp/tests/witness_mfg_mrp.js, erp/mfg_snapshot.js (order input `attrs` carried into the CREATE_DOCUMENT payload). M3/M4/M2/M1 witnesses re-run green.
- NOT DONE (named): MRP netting / planned-order generation (no legacy planned-order rows to extract from), forecast demand (50 FCT rows exist; needs M_ForecastLine in the kernel projection), sales/purchase order demand-supply,
  QtyDelivered in supply qty, IsAvailable. "Planned orders enter the log only on approval" (rule 6) is therefore untested: nothing generates planned orders yet.
