# ⚠ DO NOT REMOVE — Milestone 7: W-MFG-OWN (scope: one owner per order, ordered handoff, tamper-evident log; read the log after every run)

Parent row: "A non-owner device's op on an order is rejected on replay, and shift handoff is an ordered op. Break: tamper one op; verifyChain fails." Contracts G-SINGLE-WRITER, G-ORDERED-HANDOFF (DistributedERP.md).
Worktree `/tmp/wt-mfg`, branch `feat/mfg-wire`.

## Issue it proves or disproves
(1) On replay, only the recorded owner of a PP_Order may mutate it; (2) ownership moves only through an ordered HANDOFF op, so there is never a window with two owners (the old owner's later op is rejected,
the new owner's earlier op is rejected); (3) the verdicts do not depend on which device's log is merged first; (4) a tampered op (e.g. an actor rewritten to the owner) is detected by verifyChain,
including when the attacker re-seals the hash chain, because the content is signed.

## Facts measured 2026-10-14
- `erp/erp_replay.js` already implements the owner-gate (ALLOCATE) and set-if-unset CAS (CLAIM) over (timestamp, op_uuid)-ordered merged logs. It has NO handoff: G-ORDERED-HANDOFF exists only as a contract in
  DistributedERP.md (§178-183, §345); `grep HANDOFF` finds no implementation in erp/ or scripts/. Its status mutation is ALLOCATE-only (status 'allocated').
- A second, pre-seal owner check exists in crud_core.js gateOp (CRUD funnel). AD-LAYER LAW rule 5 (one implementation per responsibility): the replay-side gate stays in erp_replay.js; this milestone EXTENDS it, adds no second gate.
- Chain + signature machinery exists and is witnessed (kernel_ops.js sealChain/verifyChain; v2 content signing, W-CONTENT-SIGN: a tampered row re-sealed still fails 'signature'). Key custody (HQ-signed roster, rotation, revocation) = existing W-ROSTER-VERIFY;
  this milestone cites it and re-runs it as a regression, it does not re-prove it.

## Design (generic, no manufacturing verb)
- erp_replay.js: `normalize` also carries `to` and `status`; `replayGuarded` gains two owner-gated ops: `SET_STATUS` (owner sets documents.status) and `HANDOFF` (current owner sets documents.owner = op.to; refused when `to` is missing).
  ALLOCATE/CLAIM behaviour unchanged (checked by a control in the witness). The gate is shared by all three through one helper.
- Orders are `documents` rows in this projection with doc_type 'PP_Order'.

## Witness `erp/tests/witness_mfg_own.js` (tag `§MFG-OWN`)
Real kernel_ops.js (commit, seal, verifyChain) + real erp_replay.js + ECDSA content signing (erp_snapshot_sign.js), driven in node over sql.js.
- W1 owner-gate: non-owner SET_STATUS on an order rejected, owner accepted. W2 handoff ordering: after HANDOFF A->B, A's SET_STATUS rejected and B's accepted; B's op stamped BEFORE the handoff rejected; a non-owner HANDOFF rejected.
- W3 order-independence: the two device logs merged in either order give the same projection and the same rejected set. W4 control: ALLOCATE non-owner rejected and CLAIM first-wins still hold after the refactor.
- W5 chain: honest log seals and verifyChain ok (signed). W6 negative controls: (a) actor rewritten in place -> verifyChain fails 'payload altered'; (b) rewrite + re-seal by the attacker -> fails 'signature'. Both must be detected, else INCONCLUSIVE-red.
- Deliberate break (must be red, named): `MFG_BREAK=tamper` rewrites one op's actor to the owner before the chain is verified -> W5 FAIL naming brokeAt id and why.

## RESULT 2026-10-14 (logs: ~/Projects/Mfg/logs/w_mfg_own_{green,tamper}.log)
- Green, 7 checks, exit 0. 16 ops, 3 devices, 2 orders: 8 applied / 8 rejected, each verdict equal to the timeline (non-owner SET_STATUS, owner-to-be's op stamped before the handoff, old owner after the handoff, stranger HANDOFF,
  HANDOFF without target, non-owner ALLOCATE, second CLAIM). Final PP_Order:8000 = owner dev:C, status in_progress. W3: four merge orders -> identical projection hash be040c46 and rejected-set hash 98006efd.
  W4: ALLOCATE/CLAIM unchanged by the refactor. W5: signed log verifies. W6a: tamper -> `payload altered`, brokeAt = the tampered op (id 2). W6b: tamper + attacker re-seal -> `signature`.
- Break `tamper` (non-owner's actor rewritten to the owner): W5 FAIL `brokeAt=2 why=payload altered`. The log also SHOWS the harm if replay were not stopped: the forged op was accepted (applied 9 / rejected 7, W1 FAIL "op2 wanted rejected, got accepted").
- `§MFG-OWN-GAP` (printed, not asserted away): with NO signer, a tampered + re-sealed log verifies. Tamper-evidence of ownership rests on the content signature / HQ roster, not the bare hash chain.
- Changed: erp/erp_replay.js (HANDOFF + owner-gated SET_STATUS; one shared gate with ALLOCATE; normalize carries `to`,`status`; loaded by erp.html, additive). Regression: W-ROSTER-VERIFY, W-CONTENT-SIGN, M1-M5 witnesses all exit 0.
- LIMITS (named): erp_replay's `documents` projection is separate from the kernel 5-table projection (an existing split, not introduced here), so ownership is witnessed on the ownership projection, not yet gating kernel
  SET_STATUS/CREATE_LINE on PP_Order directly. Shop-floor device roster join / rotation / revocation is cited (W-ROSTER-VERIFY), not re-proved for manufacturing devices. crud_core.gateOp (pre-seal CRUD check) is a separate, older gate.
