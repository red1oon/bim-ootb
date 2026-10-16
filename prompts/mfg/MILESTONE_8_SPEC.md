# ⚠ DO NOT REMOVE — Milestone 8: W-MFG-LEASE (scope: lease-based resource-slot booking with ordered expiry; read the log after every run)

Parent row: "Two orders cannot hold the same resource slot, and an unused lease expires as an ordered op. Break: skip the lease check; a double booking appears." Contracts G-RESERVATION, G-LEASE-EXPIRY (DistributedERP.md).
Worktree `/tmp/wt-mfg`, branch `feat/mfg-wire`.

## Issue it proves or disproves
Through the lease ops, an order's claim on a resource window is exclusive; a lease that is never used is released only by an EXPIRE op that is itself ordered in the log (replay reads no clock);
and the final lease table never contains two live leases overlapping on one resource.

## Facts measured 2026-10-14
- TWIN CHECK (legacy allows double booking): reference Postgres s_resourceassignment has only a primary key, two CHECKs (isactive, isconfirmed), a FK to s_resource and a UU index; NO overlap constraint and NO trigger.
  Core MResourceAssignment.java (115 lines) has no overlap check (only "cannot delete a confirmed assignment"); WAssignmentDialog just saves; MAssignmentSlot only classifies for display. So legacy iDempiere ALLOWS overlapping
  S_ResourceAssignment rows. Therefore the lease layer is ADDITIVE: it guards only claims made through lease ops and does NOT change S_ResourceAssignment CRUD (twin rule: no divergence on legacy operations).
- Real fixture data (primary): legacy orders 8000 and 8001 (PP_Order 50000/50001) BOTH schedule S_Resource 50000 "Fertilizer Plant" over 2008-08-16 .. 2008-08-17 - a genuine double-booking in the seed. Other real resources: 50001 "Assembly Area" etc.
- Real fixture data (boundaries): S_ResourceAssignment 100 and 101 (resource 100 "Garden Layout"): 2003-02-05 10:00-13:00 and 17:00-18:00, unconfirmed. The other 7 rows are HBA presence sessions (not manufacturing).
- G-RESERVATION / G-LEASE-EXPIRY exist only as doc contracts: no implementation anywhere in erp/ or scripts/ (the "lease" grep hits are unrelated "release"). The window boundary convention is NOT evidenced by legacy: this milestone uses
  half-open [from, to) (a booking ending 13:00 and one starting 13:00 do not conflict) and prints it as a convention.

## Design (in the one replay gate, erp/erp_replay.js; no manufacturing verb)
- `leases` table beside `documents`. Ops (all carry actor/timestamp/op_uuid as recorded inputs):
  LEASE {target: lease id, resource, from, to, order, ttl}: order must exist (else 'no such order'), actor must be the order's owner (else 'non-owner', so a HANDOFF moves who may lease), from < to, and no live lease
  (state held|used) on the same resource overlaps -> else rejected 'slot held by <order>'.
  USE {target}: lease must be held; actor must be the order's CURRENT owner; state -> used (never expires). EXPIRE {target}: lease must be held ('in use' / 'already expired' otherwise) and op.timestamp >= granted + ttl
  (else 'not yet expired'); any actor may issue it; state -> expired, slot returns to the pool. A lease past its ttl but with no EXPIRE op yet STILL BLOCKS (expiry is an ordered op, never inferred from a clock).
- The conflict test is `ErpReplay.leaseConflict` (called through the API object so the witness can switch it off for the break).

## Witness `erp/tests/witness_mfg_lease.js` (tag `§MFG-LEASE`)
- E1 REAL orders: order 8000 leases resource 50000 for its scheduled window (granted); order 8001 the same window rejected `slot held by PP_Order:8000`; order 8001 on resource 50001 granted (different resource); non-owner lease rejected.
  E1b REAL boundaries (resource 100 windows): overlap 11:00-12:00 rejected, adjacent 13:00-14:00 granted, 17:00-18:00 granted.
- E2 ordered expiry: EXPIRE before ttl rejected; EXPIRE at/after ttl accepted; a lease request after the ttl timestamp but BEFORE the EXPIRE op is still rejected; after EXPIRE a new overlapping lease is granted.
- E3 USE: a used lease cannot be expired; after HANDOFF the old owner's USE is rejected and the new owner's accepted. E4 order-independence: device logs merged in any order give the same lease table and rejected set.
- E5 invariant (independent of the gate): no two live leases overlap on one resource; non-vacuous (population of live leases > 1 and the scan can fail).
- Deliberate break (must be red, naming both leases): `MFG_BREAK=nocheck` (leaseConflict disabled) -> E1 + E5 FAIL, a double booking appears.

## RESULT 2026-10-14 (logs: ~/Projects/Mfg/logs/w_mfg_lease_{green,nocheck}.log)
- Green, 3 checks (E1 carries the whole 20-op timeline: E2/E3 as written above are cases inside it), exit 0. 12 applied / 8 rejected, each verdict equal to the timeline:
  REAL double-booking refused (order 8001 vs 8000 on resource 50000, window 2008-08-16..17: `slot held by PP_Order:8000`); other real resource (50001) same window granted; non-owner lease refused;
  real legacy windows on resource 100: overlap 11:00-12:00 refused, adjacent 13:00-14:00 granted, 17:00-18:00 granted; EXPIRE before ttl refused; a request after the ttl timestamp but before the EXPIRE op STILL refused;
  EXPIRE (issued by a third device) accepted, then the slot is leasable; EXPIRE of a used lease refused (`in use`); after HANDOFF the old owner's USE refused and the new owner's accepted; USE of a never-granted lease refused.
  E4: four merge orders -> identical lease table + rejected set (10711965 / 7f19d63d). E5: 5 live leases, 0 overlapping pairs; the scanner is proven able to fail (control finds 1).
- Break `nocheck` (leaseConflict disabled): E1 FAIL (ops 4, 8, 12 accepted) and E5 FAIL naming 4 overlapping pairs, e.g. `b1(PP_Order:8000) x b2(PP_Order:8001) on res 100`.
- Changed: erp/erp_replay.js (+leases table, LEASE/USE/EXPIRE ops, leaseConflict, leaseRows; the older ops untouched). Regression: M1-M5, M7 (+ its tamper break still red), W-ROSTER-VERIFY, W-CONTENT-SIGN exit 0.
- LIMITS (named): the half-open boundary convention is a CHOICE, not legacy evidence (legacy has no overlap rule at all). ttl and timestamps are recorded inputs in the same unit (ms here); the unit/default ttl for real shifts is undecided.
  Leases are NOT yet wired to S_ResourceAssignment CRUD nor the finite-scheduler plugin (cheap-features table); a plain CRUD assignment can still overlap, exactly as in legacy. Who issues EXPIRE in production (janitor device) is not built.
