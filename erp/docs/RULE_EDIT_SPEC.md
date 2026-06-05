# RULE_EDIT_SPEC — the ONE gesture: §RULE-EDIT on migrated Odoo data

Spec for `rule_fold.js` (window.RuleFold), wired into `idempiere.html`. Implements
`prompts/RULE_EDIT_ONE_GESTURE.md` (bim-compiler) — a SCOPED E3: **edit one rule → K records re-fold
live, signed + reversible** on the migrated Odoo Client-12 tenant. Spec-first; §-log first; NON-INVENT.

## 1. The population (real, non-invent)
The 35 Odoo products of Client 12, each carrying its **recorded Odoo `list_price`** as an
`M_ProductPrice` row (PriceStd) under the Client-12 "Odoo Sales" price list (`gen_ad_odoo.js` §5b,
witness `§RULE-DATA products=35 priced=35 min=12 max=4000`). Read:
```
SELECT p.M_Product_ID id, p.Name name, pp.PriceStd price
FROM M_ProductPrice pp JOIN M_Product p ON p.M_Product_ID = pp.M_Product_ID
WHERE p.AD_Client_ID = 12 ORDER BY pp.PriceStd DESC
```
N = 35. Every price is real Odoo; absent → honest absent, never synthesized.

## 2. The rule AS DATA (L2 guard)
ONE editable rule, expressed as a data row (engine-as-data):
```
{ rule:'premium', attribute:'PriceStd', op:'gte', T:<threshold> }
```
*"a product qualifies as PREMIUM iff `PriceStd >= T`."* `T` is the editable parameter. Default `T=100`.
The rule's current value is NOT a variable — it is the **fold of the op-log** (last `SET_RULE` wins).

## 3. The derived view (a FOLD, not per-record writes)
`fold(pop, T)` → the PREMIUM set = `{ p ∈ pop : BigDecimal(p.price).compareTo(BigDecimal(T)) >= 0 }`.
Comparison via `bigdecimal.js` (exact, never raw JS Number — money guardrail). Surface: a live badge
**"PREMIUM: K of 35"** + the population list with PREMIUM rows lit. K = |PREMIUM set|.

## 4. The edit = ONE signed op
Changing `T` appends ONE op to a **genuinely-signed** op-log (`kernel_ops.js` W-CHAIN + `erp_signer.js`
W-SIGN, ECDSA P-256):
```
KernelOps.commitOp(opDb, 'SET_RULE',
  { rule:'premium', attribute:'PriceStd', op:'gte', T:<to>, from:<from> },
  <input_guids = the K product ids that cross>, 'RULE:premium', <op_uuid>, <ts>)
KernelOps.sealChain(opDb)      // hash-chain + ECDSA sign each op
KernelOps.verifyChain(opDb)    // → {ok,len,tip}: recompute every op_hash + check prev-link + signature
```
Then **re-fold** → the badge updates → K products cross the boundary, live. This is the closed-verb
membrane: the rule is DATA, the op is a recorded `SET_RULE` on the signed log — no transactional verb
forked, no new `applyOne` op_type (so `erp_kernel.js` frozen-effects replay is untouched).

`chainOk` = `verifyChain().ok` (hash chain integrity **and** ECDSA signature over every `op_hash`).
This is the genuinely-signed log (`id/prev_hash/op_hash/sig`), distinct from the seam's deterministic
`erp_kernel` op-log — reconciling the two (I-4) is out of scope for this scoped E3.

## 5. Reversible
Append the inverse op (`T <to> → <from>`) → re-fold → the K products flip back. Proven by
`setEquals(premium@start, premium@afterReverse)`.

## 6. Determinism (op path)
NO `Date.now()` / `Math.random()` in the op path: `ts` is passed in (deterministic monotone base);
`op_uuid` is an edge-minted recorded INPUT (re-read on replay, never recomputed; not part of the
canonical hash). `commitOp` gains an optional trailing `ts` arg (additive, default `Date.now()` for
existing callers) so the rule-op path is deterministic.

## 7. Acceptance oracle (the E3 half)
Rebuild from the op-log ALONE into a fresh state: `replayOps(opDb,'SET_RULE')` → currentT = last
param.T → re-fold the population → the **rebuilt** PREMIUM set. Assert `rebuilt == live` (same ids,
same K). Witness `§RULE-EDIT-ORACLE rebuilt==live K=<k> chainOk=Y`.

## 8. The witness contract (build until green)
```
§RULE-DATA products=35 priced=35 min=12 max=4000                         (gen_ad_odoo.js §5b)
§RULE-FOLD rule=premium T=100 population=35 affected=23                   (fold@default)
§RULE-EDIT tenant=Odoo(12) rule=premium edit=T:100→500 population=35 \
           affected=11 refold=ok signedOp=<uuid> chainOk=Y reversible=Y   (forward edit)
§RULE-EDIT-ORACLE rebuilt==live K=12 chainOk=Y                            (oracle at tip)
§RULE-EDIT tenant=Odoo(12) rule=premium edit=T:500→100 population=35 \
           affected=11 refold=ok signedOp=<uuid> chainOk=Y reversible=Y   (reverse restores)
§RULE-GESTURE PASS                                                         (all of the above + 0 pageerror)
```
- `population=N` = 35 real records. `affected=K` on a §RULE-EDIT line = how many CROSSED the boundary
  when T changed (K>0, K<N → a real reflow). On §RULE-FOLD, `affected` = the PREMIUM count at that T.
- `refold=ok` = the derived classification re-folded from the changed rule (NOT a per-record rewrite).
- `signedOp`+`chainOk=Y` = the edit is ONE op on the signed log; `verifyChain` validates chain + sig.
- `reversible=Y` = the inverse op flips the K records back (set-equality to the start).

## 9. Honesty boundary
The witness attests **the rule edit + the re-folded derived classification, signed (ECDSA) and
reversible** — NOT a GL posting (Completed ≠ posted, §I-K/§13.6). State exactly what reflowed: a
derived PREMIUM classification over real Odoo prices.
