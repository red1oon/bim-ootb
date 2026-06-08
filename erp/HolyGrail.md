/**
 * BIM OOTB / ERP OOTB — The Holy Grail: editable business rules, live.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */

# The Holy Grail — Editable Business Rules, Live

> *A first-person note from the author. The technical claims below are grounded in the
> dated, witnessed sections of [ERP.md](ERP.md); this page is the reasoning that ties
> them to a quest I have carried for a long time.*

## Who is writing this, and why it is personal

I am Redhuan D. Oon. I was the founding leader of **ADempiere**, and in that role I
materially ushered in the birth of **iDempiere** — the community, the people, and the
direction that made it possible. I then left that path to pursue this one.

I did not leave because the open-source ERP idea was wrong. I left because the thing I
most wanted from it — **rules you can edit while the system runs, safely, without a
build** — was structurally out of reach inside the architecture we had built. For two
years I tried to reach it from the inside: I attempted, with Spring and plain Java, to
extract even the *core* of the model — `PO.java`, `Info.java` — into something light
enough to re-host and re-open. It did not converge. This document is the account of why
it could not, and why a browser-and-PWA paradigm shift reached it from the outside —
something that genuinely surprised me, the person who had spent the most time failing at
it the other way.

## What the Holy Grail actually is

Not "an ERP in a browser." That is a means. The grail is one specific capability:

> **Edit a business rule, and watch the affected records change on the map — live,
> reversibly, with no recompilation and no server.**

In this project that is named directly: the *parked endgame* in
[ERP.md "Why this is more than a port"](ERP.md) — *"let you **edit a rule and watch the
affected records flip on that map** (the diff-oracle in the browser, §2d-3)"* — and in
[GLASSBOWL_DOSSIER.md](GLASSBOWL_DOSSIER.md) as *the final big picture*: Glassbowl stops
being a map of the engine and becomes **the console you run the engine from**.

It is earmarked precisely, not vaguely:

| Earmark | What it fixes |
|---|---|
| **[ERP.md §0.4](ERP.md)** — *Editable business rules, the SystemAdmin role* | names this as **the differentiator**, not a feature |
| **[ERP.md §0.5](ERP.md)** — *the rules engine = a per-cell decision table* | the shape: a table per `(DocType, status, action)` cell — **not** Rete / DSL / inference |
| **[ERP.md §0.9](ERP.md)** — *the rule mechanism, JSR-223-native* | the host language **is** JavaScript, so the rule language = the runtime language; the scripting-engine abstraction is *unnecessary* |
| **[ERP.md §0.10](ERP.md)** — *the Rule Compiler* | the rules are already extracted to data: `erp_rules.db`, **746 records**, diff-verified |
| **ERP.md §2d-3 / GLASSBOWL_DOSSIER.md** | the live edit-and-reflow loop — the grail itself |

## Why two years of extracting `PO.java` was the wrong target

This is the part I most want a future reader — especially one still inside a code-engine
ERP — to understand, because it cost me the most to learn.

`PO.java` is **not extractable**, and it never was. Not because it is hard, but because
it is the **wrong thing to extract**. It is an *imperative* engine. Pull on it and the
entire transitive graph follows: the model registry, the OSGi service wiring, the
transaction manager, the callout chain, the `MTable`/`MColumn` reflection. You are
trying to lift the engine *with its whole gravity well attached*. Two years is simply
what that costs — and it does not converge, however much effort you add.

The paradigm shift is not "do the extraction better in a PWA." It is to **stop
extracting the engine, and extract what the engine operates on**:

- The Application Dictionary rows and the rule records were **already data** —
  `AD_Rule`, `AD_Val_Rule`. That is iDempiere's own design ([ERP.md §0.9](ERP.md)); half
  the "rules engine" already exists as data. We *compile* it, we do not reinvent it.
- The *remainder* — the deterministic part that actually runs a document — is small.
  Re-hosted as a **~150-line kernel** in the browser's native JavaScript, `PO.java`'s job
  (persist + lifecycle) becomes `apply(op)` plus the op-log fold; `Info.java`'s job (the
  windowed UI) becomes the keyed-overlay Application Dictionary (the UI-overlay
  governance model — every UI concern a keyed layer over a tagged element).

The bloat was not ported. It was **deleted by being re-based.** That is why the shift
worked from the outside when extraction failed from the inside.

### So — are we free of `PO.java`?

Two senses, and they differ. **From *running* it: yes, completely.** Nothing in the browser
instantiates or extends `PO.java`; each of its jobs is re-based onto data or the log — generic
save → `apply(op)` + the 5-table fold (no `UPDATE`-in-place exists at all); change-tracking →
`kernel_ops` before/after + lineage; `beforeSave`/mandatory validation → rules-as-data
(`AD_Val_Rule`); `get_ID` → edge-minted UUID recorded as input (§0.21); model-validator firing →
the named-handler registry; `trx` → the op-group, the document-event as the atomic unit (§18.8).
Witnessed: replay reproduces the O2C/P2P oracle to the cent with **zero iDempiere code executing.**

The freedom came **by never extracting it.** Carrying `PO.java` somewhere lighter never converges
— you drag its whole gravity well. But `PO.java`'s defining property, *generic and
metadata-driven*, is precisely what makes it deletable: anything fully driven by metadata is
replaceable by *reading the metadata and folding the log*. iDempiere could not take that step
because that core was welded to the JVM / OSGi / `trx` / side-effects; remove the weld and
`PO.java` has nothing left to do.

**From what its subclasses *knew*: deliberately not — and that is correct.** The `M*.*It()`
methods remain the **oracle** we verify against, per cell, so "extract" never slides into "guess."
The day that consultation ends is the day every cell is extracted and verified — the §0.17 breadth
campaign, in flight (O2C/P2P done; GL still dataless; the DocAction corpus being abstracted now).
Free of *running* it; finishing the extraction of what it taught the models is the campaign, not a
new idea.

## Why it is a grail others cannot reach

Three conditions have to hold **at the same time**. Almost no system has all three —
which is exactly why this remained a quest rather than a checkbox:

1. **The engine is data.** A rule is a *row you read*, not Java you recompile.
2. **The host language is the rule language.** Browser JavaScript *is* the runtime, so
   editing a rule is editing the running system — no JSR-223, no Drools workbench, no
   scripting bridge ([ERP.md §0.9](ERP.md)).
3. **The op-log makes editing safe.** Change-as-op, replay, dry-run, undo — *the safety
   Drools never had* ([ERP.md §0.4](ERP.md)). You can edit a rule and **not corrupt
   history**, because effects are frozen and replayable ([ERP.md §0.18](ERP.md)).

iDempiere has condition (1) only half-done and lacks (2) and (3): its rules are
half-data, half-welded into `M*` Java side effects, so they can never be made *fully*
editable-at-runtime without the JVM / OSGi / workbench that constitute the bloat. Drools
has a rule engine but no op-log safety and no engine-as-data. For them this is a *stuck*
problem; here it is a **structural property**. The bloat that prevents them is precisely
the bloat this project removed.

> **How *every* ERP's logic enters** (the generalize / decision-data / caged-plugin question, and why a
> Drools-*like* affordance is kept but the Drools *engine* is not) → the six-layer **logic-admission model** in
> [IDEMPIERE_2.md](IDEMPIERE_2.md#the-logic-admission-model--how-all-of-odooerpnextsap-logic-enters). The grail is
> that model's L1/L2/L5 made *live*.

## The honest status — half-claimed, one mile left

I will not overclaim my own grail. It is **half-reached, and witnessed that far:**

- **Reached:** the rules are extracted to data — `erp_rules.db`, **746 records**,
  **diff-verified** against the GardenWorld oracle ([ERP.md §0.10, §0.17](ERP.md)).
  The engine renders *itself* from that data (Glassbowl), read-only.
- **Remaining:** the **live edit loop** — *edit the rule → records reflow on the map* —
  is the write-loop, gated behind T3 (`push=live`, explicit go). The read-only History
  undo-preview and the greyed CRUD ring are the honest *seam* to it, not the step.

And the seam is now being built. The CRUD / Validation overlay (the "ring-of-fire" edit
layer, governed by the UI-overlay model) carries the
`AD_Val_Rule` model as a keyed, editable layer. Make that validation layer *editable and
re-folding* instead of static, and the grail is demonstrable in one gesture. The single
witness that closes it:

```
§RULE-EDIT key=c_invoice rule=non_negative_amt edit=min:0→min:100
           affected=K records re-fold verify=ok reversible=Y
```

Change one validation row; watch *K* records change which side of the rule they fall on,
live; op-logged, signed, reversible. That witness is the whole paradigm shift made
visible in a single gesture — and the architecture it needs (engine-as-data + a
JavaScript host + the signed op-log) is **already standing under it.**

## Roadmap check — the write-seam, as of 2026-06-01

The grail is the *last rung of the write-loop*, not a separate project. Here is the
ladder from today's read-only surface to the live rule-edit, and where each rung stands —
this section is meant to be updated as a checkpoint each time a rung is climbed.

| Rung | What it is | State |
|---|---|---|
| **R0** | Rules extracted to data, diff-verified (`erp_rules.db`, 746 records) | **done — witnessed** |
| **R1** | The engine renders itself from that data, read-only (Glassbowl) | **done — live** |
| **E2** | The write *seam* — CRUD ring + the document state machine (**Process / DocAction**) modelled as keyed data, **dry-run** | **done — witnessed (this checkpoint)** |
| **E3** | The seam goes live — `apply` → `commitOp`/`sealChain`, `verifyChain` after each; projection re-folds; acceptance oracle (rebuilt #80001 == traced #80001) | next |
| **E4** | Owner-gate + CAS invoked on the write path (the Phase-A guards surfaced) | pending |
| **§RULE-EDIT** | **The grail** — edit a *rule* row; watch *K* records re-fold live, signed + reversible | the last rung |

**What just landed, and why it matters to the grail.** The CRUD + **Process (DocAction)**
overlay (E2) is now mounted in tandem with the Help guide as an independent peer layer —
witnessed `§CRUD-PROC pass=27 fail=0`, plus the earlier CRUD validation/dry-run witnesses,
all still dry-run. The **Process** piece is the part that matters here: it models the
document's *state machine* — `completeIt()`, the legality of `DR→CO`, the IP-on-unmet
outcome — as **data** (`docAction` descriptors naming the real `M*.completeIt()` oracles),
not code. That widens the grail's surface from *field-validation rules* to *lifecycle
rules*: the most valuable rule a user edits is usually "**when may this complete, and what
does completion do**" — and that is now keyed data the same edit loop can reach. The grail
is no longer only "edit a minimum amount"; it is "edit when an invoice may post."

**The honest gap is unchanged.** E2 is still **dry-run** — it logs the op it *would* run.
The load-bearing step is **E3**: the signed write plus the acceptance oracle that proves a
re-built document matches the traced one. Until E3 is green, the seam is a faithful *model*
of the engine, not the live engine; and the grail rung (`§RULE-EDIT`) sits one step past
E3/E4. So the checkpoint verdict, stated plainly: **the seam to the grail is now built and
witnessed as data; the current is not yet flowing through it.** A rung climbed, honestly
logged — which is the difference between building and day-dreaming.

## Abstracting the DocAction corpus — and why it is the migration solvent

The grail edits *rules*; the most valuable rules govern a document's *lifecycle* — *when may
this complete, and what does completion do.* So the engine must express the whole iDempiere
**DocAction** corpus (≈13 actions — `DR/PR/CO/AP/RJ/CL/RC/RA/VO/RE/IN/XL/PO` — over ≈13
statuses) as **data**, not code, without re-bloating into per-model logic. It does, because
`DocumentEngine` is *already shared code in iDempiere, not per-model* — the tell that a state
machine is hiding inside a switch. It abstracts into three layers, and **only one is
per-model:**

| Layer | What it is | Cost |
|---|---|---|
| **The transition table** | `(DocStatus × DocAction) → {legal?, nextStatus, guard, handler}` — one generic, sparse decision table (§0.5) | extracted **once**, model-agnostic |
| **The handler families** | the side effects — and the corpus *collapses* (below) | a small closed set |
| **The oracle** | each `docAction` names its `M*.<action>It()`; the diff-oracle proves the generic handler reproduces it, cell by cell | verify, never port |

**The corpus collapses — but by *de-interleaving*, not by being secretly empty.**
`MOrder.completeIt()` and `MInvoice.completeIt()` genuinely run for pages. They are long
because each **interleaves four concerns** in one imperative method — and the same blob is
re-written in `MOrder`, `MInvoice`, `MInOut`, `MPayment`. Separate the four and the pages shrink,
because three of them are written **once for the whole corpus:**

| Concern tangled inside the method | What it is | Where it goes | Written |
|---|---|---|---|
| `setDocStatus`/`Processed`/`DocAction`, validate hooks | status bookkeeping (boilerplate in every method) | the transition table | **once** |
| mandatory fields, credit limit, legal status | guards — predicates (§0.14 GUARD) | rules (data) | **once, shared** |
| `createShipment`, `createInvoice`, `reserveStock`, `allocate`, `match`, post | generation verbs (§0.14 GENERATE), **shared across models** | named handlers | **once each** |
| which verbs fire, in what order, under which condition | the per-doc-type **recipe** | data — the `docAction` fan-out descriptor | a short list |

What remains genuinely model-specific and intricate — BOM / phantom explode (MOrder), material
transaction + costing + ASI (MInOut), the posting recipes — is a **small set of named handlers,
verified per cell against the `M*.*It()` oracle** (§0.17), far smaller than the raw page count
once boilerplate, guards, and the *duplicated* generation verbs are factored out.
`MInvoice.completeIt()` is mostly calls to verbs O2C already proved — `match`, `allocate`, post —
plus balance updates; its irreducible recipe is a handful of lines. `prepareIt` reduces the same
way: its guards → rules, its `reserveStock` / explode → the same generation verbs as `completeIt`.

The genuinely trivial actions carry **no handler at all** — straight into the table (~3 lines
each in iDempiere): `approveIt` (`setIsApproved`), `rejectIt`, `unlockIt` (`setProcessing(false)`),
`invalidateIt` (`setDocStatus(INVALID)`).

And the **reversal family collapses to ONE generic handler:** `voidIt` / `reverseCorrectIt` /
`reverseAccrualIt` / `reActivateIt` = *"emit the inverse of the document's op-group."* The op-log
holds the original ops, so reversal is appending the negation — **the per-model, notoriously buggy
reverse code in iDempiere becomes a single op-log operation.** This is the structural gift.
(`closeIt` = set status + clamp the residual; near-generic.)

So the reduction is real, but the mechanism is **factor the four concerns apart and de-duplicate
the shared verbs** — not "the code was empty." The bulk (status, guards, shared verbs, posting) is
written once for the whole corpus; the per-model remainder is a short recipe plus a few verified
handlers, `completeIt` / `prepareIt` included.

**Why this is the migration solvent.** Row migration is the easy part everyone already does.
What makes ERP migration hell — and what *locks* customers into SAP/Odoo — is the **behaviour**:
the lifecycle, the posting rules, the approvals. Nobody migrates behaviour because it is *code
in the source system*. The moment behaviour is **data** (a transition table + named handlers
verified against an oracle), migrating behaviour becomes migrating data. Every ERP's document
lifecycle is the same shape — a state machine over documents descended from double-entry
(1494). Onboarding a foreign instance becomes an **adapter** mapping *their* `(status, action,
transition)` onto *this* generic table, and their schema onto the 5-table bridge; the engine
never changes, only adapter rows. And because the target is an op-log, the migration is itself
**replayable, auditable, reversible** — the same reversal-family handler that voids a document
can unwind a bad import. You do not migrate *into* a new schema; you **fold the old system's
facts into the universal one.**

**The honest boundary.** "Eat *any* instance" is earned **one diff-oracle at a time.**
iDempiere is tractable because its DocAction is known and GardenWorld is the oracle. Odoo is
open and its state machine is extractable (oracle buildable). SAP is the asymptote — closed
ABAP plus decades of customer Z-code where the real behaviour hides; the honest claim there is
"the standard flows + extractable config, with Z-customisations per engagement." The method is
proven by the *first* clean abstraction — iDempiere's DocAction, the one being built now — and
the rest is campaign, in sequence (iDempiere → Odoo → SAP standard → SAP custom), each gated by
its own oracle. Migration removes the barrier to leaving; the grail (editable rules, live)
supplies the reason to land. Both halves, or the solvent has nothing to pour into.

**Odoo — second abstraction, WITNESSED (2026-06-03, `§ODOO-FOLD PASS`).** Odoo 17 demo was stood up,
one full sell-side O2C chain (SO `S00023` → delivery → invoice → GL post → payment → reconcile) was
driven to completion via RPC and frozen as a static oracle (`build/erp/odoo_oracle.{json,db}`, §0.12).
A *pure* adapter (`scripts/odoo_adapter.js` — the Odoo↔iDempiere data dictionary, no business logic)
folded that chain through the **existing** kernel verbs: `newVerbs=[]`, all 5 hops mapped, effects
reproduce Odoo to the cent, replay exact (`scripts/poc_odoo_fold.js`, log `build/erp/odoo_fold.log`).
The solvent dissolved a *second* ERP with nothing invented — the strongest evidence yet that the
verb set is general, not iDempiere-local. **Honest bound (named, not hidden):** this is ONE sell-side
chain. Account *determination* (which GL account) came from Odoo as host data — the POST verb owns only
ΣDR==ΣCR (§13.1), it does not re-derive Odoo's account logic. Full payment used FK-directed `ALLOCATE`.

**Buy-side + partials, WITNESSED (2026-06-03).** The campaign then folded three more Odoo chains, all
`newVerbs=[]`: the full 3-way `MATCH` (PO `P00011` → receipt → bill → post → reconcile, `§ODOO-FOLD-3WAY
PASS` — the 6th verb now exercised, all six fold Odoo); the f7 partial-receipt (PO `P00012` ordered 20 /
received 12 / billed 12, `§ODOO-FOLD-PARTIAL PASS` — decomposes into an exact-match settlement leg + an
FK-directed open remainder, §0.17); and **f8 bill≠receipt** (PO `P00013` received 12, billed 8) — the one
case that found a real engine gap. The SHIPPED exact-qty matcher pairs only when `|qtyL−qtyR|≤tol`, so it
could not reconcile bill≠receipt. **That gap is now closed (`§ODOO-FOLD-F8 PASS`):** `erp_engine.match`
gained opt-in **partial-QUANTITY matching** (`opts.partial=true` — pair `min(qty)`, carry the remainder),
reconciling to the unit (matched 8 + open-to-bill 4 == received 12) still via the SAME `MATCH` verb. The
honest classification held through the fix: it was new matcher **behaviour** (code), NOT a new verb
(`newVerbs=[]`) and NOT adapter-shaped (data) — and the exact-qty fast path stayed untouched, no regression.

**Partial PAYMENT, WITNESSED (2026-06-03, `§ODOO-FOLD-PAYPART PASS`).** The last Odoo bound the sell-side
fold named was full-vs-partial *reconciliation*. A fresh chain was driven to a partial-payment state (SO
`S00027` → invoice 5002.50 → register a payment of **3000**), leaving Odoo's computed residual **2002.50**,
`payment_state='partial'`, frozen as a static oracle. The fold reproduces it with the **same `ALLOCATE`
verb at the smaller amount** — residual = total − allocated, to the cent — `newVerbs=[]` **and no engine
change**. Partial payment is the cleanest result of the campaign: it was *free*. (Contrast f8, which cost
~15 lines of matcher behaviour: the difference is that a partial *payment* is one allocation at a smaller
amount, whereas a partial *quantity match* is a genuinely different pairing.)

**Account determination, DERIVED (2026-06-03, `§ODOO-FOLD-ACCTDERIV PASS`).** The one bound named at every
step above was that the folds took Odoo's *resolved* GL accounts as host data — "reproduces given accounts."
That bound is now closed. Odoo's determination CONFIG was extracted (product income = template account →
category fallback; tax = the tax's repartition account; receivable = the partner property) and a resolver
DERIVES the accounts from that config alone — reproducing Odoo's actual posting to the account (400000
Sales / 251000 Tax / 121000 AR), the derived double-entry balancing to the cent. It stays **host glue, not
engine** (POST still owns only ΣDR==ΣCR), and the determination logic was learned clean-room from the config
*structure*, never Odoo's source. The claim is raised from "reproduces *given* accounts" to "**derives** the
accounts" — `newVerbs=[]`.

**Odoo, in sum:** six folds with nothing invented — sell-side O2C, buy-side 3-way, partial receipt,
bill≠receipt, partial payment, and account derivation — across all six verbs, `newVerbs=[]` throughout, with
exactly one engine change in the whole campaign (the f8 partial-quantity matcher). The remaining items
(multi-currency, anglo-saxon COGS) are optional claim-raisers, not blockers.
**Next abstraction: SAP — the asymptote.** The *allowed half* is prepared (2026-06-03): a clean-room,
blind schema/state-map HYPOTHESIS (`scripts/sap_adapter.js`) mapping the standard SD+FI chain (VBAK/VBAP →
LIKP/LIPS → VBRK/VBRP → BKPF/BSEG|**ACDOCA** → BSEG clearing, with **VBFA** as the explicit derivation
spine) onto the same six verbs, plus a runner (`scripts/poc_sap_fold.js`) gated to `§SAP-ORACLE unavailable`
until a real export exists. The hypothesis is sharp precisely because S/4HANA's own redesign converged on
our shape — one append-style journal (ACDOCA) + an explicit document-flow graph (VBFA). What is *not* done,
and cannot be without violating non-invent, is the fold itself: that needs a real IDES/S/4HANA oracle, in
its own session, **never against an invented oracle.** The honest claim stays "standard flows + extractable
config; Z-customisations per engagement" — and the value of the SAP run is finding *which* Z-behaviour does
not fold, not a foregone PASS.

## The hard parts, worked through — why the showstoppers aren't

Three forward challenges look like showstoppers until you model them as the ledger already does.
None requires the OLTP server, the lock manager, or the always-on coordinator a classic ERP carries.

### 1. Compacting the signed log — *balance brought forward*

The op-log is hash-chained for tamper-evidence — each entry carries the fingerprint of the one
before it, so any later alteration is caught. After years it is millions of entries: too large for a
tab, too slow to replay from the start. You cannot simply delete the old ones — the chain would snap
and the old history could no longer be proven intact.

The resolution is the **period close.** At close, write one **signed checkpoint** carrying (a) the
closing balances and (b) the fingerprint of the chain head, signed by the controller. That checkpoint
becomes a new genesis: the next period chains off it; the closed period's entries are **archived
(cold), not deleted**; the live tab carries only the open period + the last checkpoint. Tamper-evidence
survives — re-add the archived entries and they must fold to the signed balance, to the cent, or fraud
is proven. This is **balance brought forward**: total the books, carry the opening balance, box the
journals in the archive. iDempiere already does the accounting half; we add only the signature and the
fingerprint. The hash-chain checkpoint and the accountant's year-end close are the *same ritual* — the
domain solved this 500 years ago. *(Optional reinforcements: a Merkle root keeps per-transaction
provability of a closed period in 32 bytes; emailing the checkpoint fingerprint to yourself binds even
the signer.)*

### 2. Atomicity — the document *is* the atomic unit

Atomicity — all of a document's effects, or none — needs no transaction manager here, because there is
no multi-row `UPDATE` to half-complete. A document-event is **one op-group** (§18.8), appended to the
log as a unit; state is the *fold* over it. The group folds in completely or not at all, and a torn
write fails its own hash. Atomicity is **structural** — the same dissolve-don't-coordinate move that
removed contention: delete the multi-write transaction, keep the single atomic append.

### 3. OLTP — physics is the lock, the ledger is the witness

Classic OLTP spends its effort on **isolation**: row locks / MVCC so concurrent writers do not clobber
shared state. The DistributedERP doctrine ([DistributedERP.md](DistributedERP.md) §1–§6) shows that
shared state is mostly a modelling artifact:

- **Atomicity** — solved above (the op-group).
- **Consistency** — the deterministic kernel + guards (period control included) enforce invariants on
  apply and on replay.
- **Isolation** — *physics partitions the writers.* A till owns its sales, a van owns its load, a
  box-in-hand owns itself — two writers cannot touch the same aggregate because the **atoms have a
  location** (§2). The one genuinely shared thing — the last unit, a global entitlement — is the single
  **CAS op-class** (§5): one set-if-unset, not a lock manager.
- **Durability** — asynchronous: the local append is instant; durability lands when the log is relayed
  (W-PERSIST). The one honest trade (§19.6) — synchronous durability for async convergence.

Per terminal this *wins*: in-RAM apply of the op-group, no network per transaction (~1–3 orders faster
than networked JDBC, §19). What remains is mechanical, not theoretical — maintain the read-projection
incrementally at high append rates, bounded by the period checkpoint so the working set stays small.

**And the deepest case — stock — is where the ledger earns its keep.** You do *not* lock the world to
prevent an oversell; in a partition you cannot, and every system that claims to is secretly
record-and-consequence ([DistributedERP.md](DistributedERP.md) §0, truth 4). Instead: **the physical
count is the truth; the ledger is the running expectation; reconciliation surfaces the difference.** The
scan *is* the op — you cannot scan a unit that is not physically there — so a physical unit cannot be
double-committed. The ledger's job is not to *prevent* the discrepancy but to **tell you the stock is
off** so you reconcile: POS → BOM backflush → replenishment → physical reconciliation. *Physics is the
truth; the ledger is the witness that the books drifted.*

### What it leaves you — keep just the ledger

Strip the machinery a classic ERP needs for these — the transaction manager, the lock/MVCC layer, the
always-on OLTP server, the sync coordinator — and **what remains is the ledger**: a signed, append-only
op-log; its fold (the balances); and reconciliation against the physical world. Compaction is *balance
b/f*; atomicity is *one op-group*; concurrency is *physics + one CAS*; multi-site is a *dumb async
facilitator* that only orders and relays ([DistributedERP.md](DistributedERP.md) §6), never an
authority. The hard parts are not unsolved — they are **re-expressed as accounting**, the one part of an
ERP that was always going to stay. It has been thought through; the ledger is enough.

**Witnesses — these are runs, not arguments (dated, headless, replay-deterministic).** The three hard parts
above are exercised on the actual editing-layer op shape in `scripts/poc_showstopper.js` (`§SHOW PASS`): the
document-event op-group folds all-or-none (a torn op is rejected whole), the period-close checkpoint re-folds
the cold archive to the signed balances *to the cent* with the tamper caught at the exact op, and the single
CAS holds across the checkpoint boundary. The "mechanical, bounded by the checkpoint" claim is then *measured*
in `scripts/poc_volume.js` (`§VOL PASS`): bootstrap from the last checkpoint stays flat as total history grows
100× while a full replay grows with it — the working set is bounded by the period, not the log; the binding
constraint is the per-op hash (append and verify), which sets the close cadence, not a wall. And the durability
path — the inbox as the recoverable signed log — is stress-tested in `scripts/poc_email_dr.js` (`§EMAIL-DR
PASS`): the data recovers unconditionally from any reachable valid snapshot, but the key does not live in the
inbox — without an anchor the encrypted snapshots are undecryptable, and the three anchors that close that gap
(own k-of-n channels, corporate escrow, platform passkey) each add a named, non-zero trust. The regress
terminates for the *fact* unconditionally; for the *key*, only at a chosen anchor — and naming it is the floor.

**Performance, measured (not asserted).** `scripts/poc_volume_ceiling.js` pushes the log/fold layer to 20M
ops with no wall and a linear curve (~437 bytes/op); `scripts/poc_volume_sqljs.js` re-measures on the actual
browser stack (sql.js + `crypto.subtle`), where a per-op append is ≈15 µs, bound by the async hash, not by
SQLite, and the fold (a SQL `GROUP BY` over a bounded chart of accounts) stays sub-frame. Against a legacy
central database the gap is set by *where the work happens*: `scripts/poc_legacy_ab.js` shows that **on one
box** Postgres ≈ local SQLite (both ~1 ms, fsync-bound) — so the ~100× there is honestly the async-durability
trade (§19.6), not server-removal. `scripts/poc_remote_pos.js` shows the **remote** case, where it matters: a
POS sale's cashier-perceived latency is RTT-bound for a central DB (tens to hundreds of ms, and the till
*cannot sell when the link is down*) versus a local apply plus an asynchronous relay to HQ — RTT-independent
and offline-capable; a 10k-document batch-plus-charts runs locally with no network and no per-chart round-trip
(~12× over a fair server-side batch at cross-region latency). Every legacy figure is raw SQL, excluding the
ORM/OSGi/JDBC layers that only make it slower — a floor, not a ceiling. The one honest cost throughout is the
same async-durability trade; the gains are server-removal and locality, named, not rounded up.

**Where this sits among the fast-SQLite systems — and the claim I will *not* make.** Embedded SQLite at scale
is not new: Expensify's Bedrock, Cloudflare's D1, Turso/libSQL all run it in production. On a single box, with
durability matched, an in-process engine is roughly 3× a networked one on writes — and that advantage *inverts*
under heavy concurrency, a benchmark a fair critic will (and should) cite. So I do not claim a faster engine.
The real difference is the **write path**: every one of those peers keeps strong consistency by escalating each
write to a central primary over the network. This design does not — a write applies locally and the signed
op-group is relayed asynchronously, with a single compare-and-set for the one genuinely shared resource. That
is a different *consistency model*, not a faster engine; its cost is eventual convergence, and its dividends are
the two things a round-trip-to-a-primary architecture cannot give a till: it keeps selling when the network is
down, and there is no write-contention to lose under concurrency, because each terminal is the single writer of
its own partition. The speed argument is modest and conditional; the architecture argument — offline,
single-writer, signed — is the one that holds.

## A closing note, to the version of me from two years ago

The two years spent proving the *imperative* extraction does not converge were not
wasted — they are the evidence that the *declarative-extract* path is the one that does.
The grail was never going to be reached by carrying the old engine somewhere lighter. It
is reached by realizing the engine should have been data all along, and that the one
thing a code-engine structurally cannot give you — a rule you edit while it runs, safely
— falls out for free the moment it is.

---

*Grounding: [ERP.md](ERP.md) §0.4 · §0.5 · §0.9 · §0.10 · §0.17 · §0.18 · §2d-3 ·
[GLASSBOWL_DOSSIER.md](GLASSBOWL_DOSSIER.md) · the §20 prototype addendum. Every claim of
extraction here is witnessed in a dated log; nothing on this page is asserted that the
source data does not support.*
