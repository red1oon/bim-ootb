<!-- SPDX-License-Identifier: GPL-2.0-only -->
# ⚠ DO NOT REMOVE — Libero slice 7: the END of a manufacturing order (void, re-activate, reverse-correct, then close). READ THE LOG after every run (witness verdict `§LEND-VERDICT`; exit code alone is not evidence).
Source: pshepetko/org.idempiere.mfg @ b2adfea0 (GPLv2), `MPPOrder.java`, cited file:line. Ported as written.

## Part A - void / re-activate / reverse-correct (DONE, witnessed)
| Port | Java | Rule |
|---|---|---|
| `voidIt` | `MPPOrder` :745-790 | fire BEFORE_VOID; refused "Cannot void this document because exist transactions" when QtyDelivered > 0; each BOM line with QtyRequired != 0: description + " @Voided@ @QtyRequired@ : (old)", QtyRequired := 0; `voidActivities` (each routing node with QtyRequired != 0 gets "** Voided (old)" once from `voidActivities` and once from `node.voidIt`, then DocStatus VO, DocAction --, QtyRequired / SetupTimeRequired / DurationRequired := 0); if QtyOrdered != 0: description "@Voided@ @QtyOrdered@ : (old)", QtyOrdered := 0, QtyEntered := 0; `orderStock()` and `reserveStock(lines)` (clear the order and the reservations); fire AFTER_VOID; DocStatus VO, DocAction -- |
| `reverseCorrectIt` | :852-856 | = voidIt |
| `reverseAccrualIt` | :858-862 | returns false |
| `reActivateIt` | :864-875 | fire AFTER_REACTIVATE; refused "Cannot re activate this document because exist transactions" when delivered; DocAction CO, Processed N, status In Progress |
Descriptions use `Msg.parseTranslation`: @token@ -> AD_Message.MsgText, else AD_Element.Name, else the token ("** Voided", "Ordered Quantity", "QtyRequired" is not an element so it stays as is). The explicit `orderStock()` in voidIt is a no-op after the QtyOrdered save already ran it in beforeSave (:425-430); kept as written. The AFTER_SAVE of that save does NOT re-explode because DocAction is VO/CL (`afterSave` :452-456).
FSM entry of AD_Table 53027 now: re-activate yes, reverse-correct yes, reverse-accrual no, Void from DR/IP/IN/AP/NA -> VO (the standard engine offers Void before completion and Close after).
Witness `witness_libero_orderend.js` E0-E4 (hand: order 100 x Fertilizer; reserved FG 100, lines 7070.71 / 100): 12 judged, breaks `novoidnode`, `noguard`.

## Part B - close (NEXT)
`closeIt` :792-850 needs `createVariances` (usage-variance collectors, type 120, for every BOM line and every reported routing node), `CostEngine.createUsageVariances`, `MPPOrderWorkflow.closeActivities` for unreported activities, then QtyRequired := QtyDelivered on the lines, QtyOrdered := QtyDelivered, reservations cleared, DocStatus CL. Those collectors are the "Usage / Method variance" items still DEFERRED.
