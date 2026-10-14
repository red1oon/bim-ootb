# ⚠ DO NOT REMOVE — Milestone 3: W-MFG-SNAP (scope: BOM snapshot of a manufacturing order; read the log after every run)

Parent: `Manufacturing Model Milestones and Contracts.md` row W-MFG-SNAP + design rule 3 ("Snapshot on release"). Worktree `/tmp/wt-mfg`, branch `feat/mfg-wire`.

## Issue it proves or disproves
Editing the BOM template after an order exists must never change that order's component lines, and the order's lines must be reproducible from the op log alone
(replay-hash == live-hash), even when the template has since changed or is absent. Also: the explosion arithmetic equals legacy iDempiere's.

## Facts measured 2026-10-14 (reference Postgres, GardenWorld; seed rows)
- DOC CORRECTION to rule 3: legacy snapshots at ORDER CREATION, not at release. Reference DB: 2 PP_Orders, both DocStatus=DR, both already have PP_Order_BOM (2),
  PP_Order_BOMLine (4), PP_Order_Workflow (2), PP_Order_Node (2). Twin rule (legacy is the oracle) => snapshot at creation; "after release" is then trivially covered.
  Caveat: Libero's MPPOrder source is not in the local tree (core iDempiere carries no org.eevolution model), so the trigger is evidenced by DATA, not source.
- Header copy (order 50000 vs template 50004): value, name, bomtype, validfrom, validto, revision, c_uom_id, documentno, description, m_product_id copied verbatim;
  bomuse template 'A' -> order 'M' (2 of 2 orders).
- Line copy: m_product_id, componenttype, qtybom, isqtypercentage, scrap, c_uom_id, validfrom, validto, issuemethod, backflushgroup, leadtimeoffset, iscritical,
  forecast, assay verbatim; m_warehouse_id = the order's warehouse; qtydelivered/qtypost/qtyreject = 0.
- Derived: QtyRequired = QtyBOM x OrderQty / (1 - Scrap/100), scale 8, HALF_UP. Oracle: order 50000 line 10 = 5050.50505051, line 20 = 100; order 50001 = 7070.70707071, 100.

## Design (no new verb, no kernel change)
- New pure module `erp/mfg_snapshot.js`: `explodeOps(q, order)` reads the template through the READ-ONLY query fn (items: PP_Product_BOM / PP_Product_BOMLine) and RETURNS ops:
  CREATE_DOCUMENT PP_Order (DR) + CREATE_LINE PP_Order_BOM (header copy) + CREATE_LINE PP_Order_BOMLine xN (source_line_id = the header line; template ids kept in metadata).
  Identity is an INPUT (uuid derived from DocumentNo+line, no clock/random). Arithmetic via bigdecimal.js only.
- Registered as `Kernel.register('PP_Order','CR', ...)` with wfmc NEW --CR--> DR, so creation goes through the ladder (state machine, violation guard, kernel owns the write).
- Out of scope here (named, not silently skipped): effectivity filtering by ValidFrom/ValidTo = M4 W-MFG-ASOF; routing snapshot (PP_Order_Workflow/Node) = needs the open
  AD_Workflow-vs-routing-table decision; percentage lines (IsQtyPercentage='Y') = handler REFUSES (unverified in legacy) rather than guess.

## Witness `erp/tests/witness_mfg_snap.js` (tag `§MFG-SNAP`)
- N1 ORACLE: exploding orders 50000 and 50001 from the seeded template reproduces the legacy PP_Order_BOM/BOMLine rows in the seed field by field (bomuse noted).
- N2 ISOLATION: after dispatch, edit the template (change a qty, add a line, delete a line) -> the order's lines hash is unchanged. Non-vacuity: template hash did change AND a
  live-template reader would now return different lines.
- N3 REPLAY==LIVE: rebuild a fresh projection from kernel_ops alone (template absent, then template edited) -> order-scope hash (documents+document_lines) equals live.
- N4 DETERMINISM: two independent runs give byte-identical op payloads; kernel `_stats.edgeMintCalls` unchanged across replay.
- N5 REFUSAL: a percentage line makes dispatch fail with a named reason and writes nothing.
- Deliberate breaks (must be red, named): `MFG_BREAK=live` (order lines read from the live template), `MFG_BREAK=reexplode` (replay re-runs the handler instead of replaying ops).

## RESULT 2026-10-14 (logs: ~/Projects/Mfg/logs/w_mfg_snap_{green,live,reexplode,mutation_scale6}.log)
- Green: 7 checks, exit 0. N1 compared 102 fields over both legacy orders: 0 diffs (5050.50505051 / 100 / 7070.70707071 / 100). N2 template hash changed (1a3d02d1 -> 8fc9b96b), order-lines hash did not (69cd2b54).
  N3 live == replay(template absent) == replay(template edited) = 85428131. N4 two runs byte-identical, edgeMintCalls delta 0. N5 percentage line refused, nothing written.
- Breaks, all red at the intended check: `live` -> N2 FAIL (99627548 -> 7332d18b); `reexplode` -> N3 FAIL (f6d7e962 != 85428131). Mutation (QtyRequired scale 8 -> 6) -> N1 FAIL naming both lines.
- Files: erp/mfg_snapshot.js (pure handler, new), erp/tests/witness_mfg_snap.js. No kernel change, no new verb. The module is not yet loaded by any page (same status as the 5-table bridge).
- OPEN (named, not done): (1) effectivity filter ValidFrom/ValidTo at order date = M4; (2) routing snapshot PP_Order_Workflow/Node = needs the AD_Workflow-vs-routing-table decision (parent doc open Q2);
  (3) percentage lines refused, legacy behaviour unevidenced; (4) bomuse A->M fixed from 2-of-2 legacy rows; (5) the parent doc's "snapshot on release" should read "on creation" (evidence above).
- KERNEL HAZARD noted, not touched: CREATE_LINE gets its document_id from the last CREATE_DOCUMENT in the same batch/log, so appending lines to an EXISTING doc later (e.g. at release) is not replay-safe.
  Creation-time snapshot avoids it; any later milestone that adds lines after creation (cost collectors M6) needs a document_id input on the op first.
