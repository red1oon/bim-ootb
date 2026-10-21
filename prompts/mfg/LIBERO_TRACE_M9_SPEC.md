# ⚠ DO NOT REMOVE — M9 W-MFG-TRACE: lot genealogy from the cost collectors. Scope: read-only derivation + a signed, verifiable export slice. READ THE LOG after every run (§MTRACE-VERDICT).

## Contract (Manufacturing Model Milestones and Contracts.md, row W-MFG-TRACE)
"Forward and backward lot genealogy derives from collectors, and an exported slice verifies | Alter one collector; the chain breaks".

## Source facts (pshepetko/org.idempiere.mfg @ b2adfea0)
- `PP_Cost_CollectorMA` is NEVER written upstream: `MPPCostCollectorMA` is only named by `MFG_ModelFactory` (:31, :110, :192). Legacy has no genealogy screen.
- The lot of each move is on the M_Transaction the collector writes: `MPPOrder.createIssue` makes one Component Issue collector per storage row with that row's ASI; `StorageEngine.createTransaction` gives a receipt a fresh ASI ("always create asi so fifo/lifo work", twin `libero_cost.mjs` createTransaction).
- So genealogy is DERIVED: edge = (order, collector DocumentNo, type, product, lot, move qty, collector qty, date).

## Design (libero_cost.mjs `genealogy` / `exportSlice` / `verifySlice`)
- Backward from a lot (product, ASI): its RECEIPT collector moves -> their order -> that order's stock-moving ISSUE collectors (`isIssue && !isVariance`) -> their moves' lots -> recurse (depth 8, cycle-safe).
- Forward: the reverse (a lot's ISSUE moves -> order -> RECEIPT moves -> recurse).
- Completed/Closed collectors only; nothing is written (`§LIBERO-TRACE` line per walk).
- Slice = canonical JSON (sorted keys) of both directions of one lot; signed by the host key (ECDSA P-256, `erp_snapshot_sign.js`, the W-MFG-OWN signer). `verifySlice` recomputes from the collectors and names the first differing bytes.
- Not legacy behaviour (an extra): it reads only, so the twin rule is untouched.

## Witness `erp/tests/witness_mfg_trace.js` (7 checks; break `LTRACE_BREAK=nolot` = moves matched by product alone)
T0 backflush from two KG lots (4000 @9001 older, 6000 @9002) -> issues 4000@9001 + 3000@9002 + BAG 100, receipt into a fresh lot L; T1 backward(FG@L) = exactly those three moves; T2 forward(KG@9001) = FG@L qty 100 of LT-A;
T2b a second order LT-B consumes only lot 9002 -> forward(KG@9002) = FG@L and FG@L2, backward(FG@L2) = KG@9002 7000 + BAG 100 (no leak from 9001); T3 the signed slice verifies (signature + recompute);
T4 altering one collector's MovementQty (4000 -> 3999) makes verifySlice false and names ccQty 4000 vs 3999; T5 restored -> verifies again.

## RESULT (2026-10-21): PASS 7/7; break nolot -> 3 FAIL (T1, T2, T2b), as designed. Log `bim-compiler build/erp/logs_libero/trace3.log`, break `trace_break_nolot.log`.
Limits (named): one level of BOM in the fixture (recursion is coded, not judged across two levels); no UI/QR yet (the "digital product passport" row of the contracts doc).
