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

## 10. L1 — lifecycle-as-data (the stretch): "when may this Order complete"
The same engine carries a SECOND rule, promoting from L2 (a classification guard) to **L1 — a guard on
a document's lifecycle transition**, the most valuable rule a user edits.

- **Rule (DATA):** *an order (DocStatus ∈ {DR,IP}) may **Complete (`CO`) without approval iff
  `GrandTotal ≤ T`** (an approval ceiling).* This is a guard on the wfmc `CO` transition (the manifest's
  `["DR","CO","CO"]`/`["IP","CO","CO"]`), so editing `T` is **lifecycle-as-data**.
- **Population (non-invent):** all real Odoo sale orders carried into the shard as `C_Order` (Client 12)
  with real `GrandTotal` + `DocStatus` mapped from the Odoo state (draft/sent→DR, sale→IP, done→CO,
  cancel→VO). `gen_ad_odoo.js §5c` → `§RULE-DATA-L1 orders=26 DR+IP=26 min=434.13 max=5002.5`.
- **Fold:** `cmp='lte'` → "MAY COMPLETE: K of 26". Default `T0=1500` (K=12) → edited `T1=3000` (K=21).
- Same signed op (`SET_RULE`, now carrying `layer/gate`), same oracle, same reverse. Witness:
```
§RULE-FOLD layer=L1 rule=maycomplete gate=Complete(CO) T=1500 population=26 affected=12
§RULE-EDIT layer=L1 rule=maycomplete tenant=Odoo(12) gate=Complete(CO) edit=T:1500→3000 \
           population=26 affected=9 refold=ok signedOp=… chainOk=Y reversible=Y
§RULE-EDIT-ORACLE layer=L1 rule=maycomplete rebuilt==live K=21 chainOk=Y
§RULE-EDIT layer=L1 … edit=T:3000→1500 … reversible=Y
§RULE-GESTURE layer=L1 rule=maycomplete PASS N=26 K0=12 K1=21 affected=9 signed=Y
```
- **Honesty:** L1 attests *which orders the lifecycle rule WOULD admit to Complete under the current
  signed guard* — it does NOT itself post the Complete (no GL/status write here); it makes the
  admission rule editable, signed, and reversible. The closed-verb membrane holds: the guard is DATA.

Both rules share ONE generalized engine (`RULES` registry in `rule_fold.js`) and ONE signed op-log
(rule-tagged `SET_RULE` ops); the ⚖ Rule overlay switches between them.

## 11. Client-scoping (the honest tenant) — bug fix 2026-06-06
**Issue it proves/disproves:** "the Rule pill is hard-bound to Odoo." `rule_fold.js` hardcoded
`AD_Client_ID = 12` in BOTH rule populations and stamped `tenant=Odoo(12)` on every §RULE-EDIT line.
On any non-Odoo login (e.g. GardenWorld, Client 11) the pill therefore queried Odoo's rows — returning
**0** under a GardenWorld-only seed — and lied `tenant=Odoo(12) FAIL no-population`, even though
GardenWorld has 114 priced products that the rule *should* fold. The engine is supposed to be
client-agnostic (the AD is the model; the tenant is data), so the rule must fold over the **logged-in
client**.

- **Source of the client (NON-INVENT):** the live login session. `idempiere.html` `applySession()`
  exposes `window.__idmpClient = _session.client` (`{id, name}`); `rule_fold.js` reads it (with an
  `opts.client` override for tests). No client ⇒ honest no-client, never a hardcoded default.
- **Scope:** each rule's `load(adDb, clientId)` substitutes the live `clientId` (coerced to a number)
  for the literal `12`. Odoo logins still resolve `clientId=12` → identical results (regression below).
- **Honest-disable:** when the logged-in client has **no population** for a rule (e.g. GardenWorld has
  0 DR/IP orders → `maycomplete`), the overlay disables ▶ Run for that rule and states the real client;
  it never pretends Odoo. Emits `§RULE-DISABLE rule=<id> client=<Name>(<id>) reason=no-population`.

Witness contract (`tests/poc_rule_client_scope.js` — whitebox §-log first):
```
# (A) regression — login Odoo(12) with the 12-odoo shard: UNCHANGED
§RULE-EDIT layer=L2 rule=premium tenant=Odoo(12) … edit=T:100→500 population=35 …   (still 12 of 35)
§RULE-GESTURE layer=L2 rule=premium PASS N=35 …

# (B) the fix — login GardenWorld(11), no Odoo shard: scoped to the real client
§RULE-OPEN  rules=[premium(L2),maycomplete(L1)] tenant=GardenWorld(11)        (the honest tenant, NOT Odoo(12))
§RULE-SCOPE rule=premium client=GardenWorld(11) population=114                (client 11's 114, NOT 0, NOT 35)
§RULE-SCOPE rule=maycomplete client=GardenWorld(11) population=0
§RULE-DISABLE rule=maycomplete client=GardenWorld(11) reason=no-population    (0 DR/IP orders → honest-disable ▶ Run)
§RULE-CLIENT-SCOPE PASS premium.tenant=GardenWorld(11) premium.pop=114 maycomplete=disabled odooRegress=PASS
```
- Pass = (A) Odoo gesture still PASS (no regression) AND (B) `population` & `tenant` reflect the live
  client (114 / GardenWorld(11), not 0 / Odoo(12)) AND `maycomplete` honest-disabled AND 0 pageerrors.
