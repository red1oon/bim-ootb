# An ERP Engine as a Deterministic Fold over a Signed Operation Log

<div class="bim-banner" markdown>
<b>Technical abstract.</b> An accounting kernel whose state is a deterministic fold over an append-only, signed operation log — serverless, in the browser, over SQLite. A companion to the [BIM-ERP](ERP.md) work.
</div>

**Redhuan D. Oon**
ADempiere (2006) | iDempiere (2010) | Author, *Open Source ERP* (2010) | BIM5D (2025)

red1org@gmail.com | [LinkedIn](https://www.linkedin.com/in/red1oon/)

Forked from the iDempiere lineage (Compiere → ADempiere → iDempiere), MIT.

June 2026

---

## Abstract

Conventional ERP systems represent state as mutable rows protected by a database server, a lock manager, and a transaction monitor. This work represents state instead as a *deterministic fold over an append-only, cryptographically signed sequence of operations*: a fact is computed by replaying the log, never stored as a guarded scalar. An accounting kernel built this way executes without a server — in a browser, over SQLite — and accepts writes while partitioned from all peers.

The constituent techniques are established: append-only-log-as-system-of-record with deterministic materialisation (Datomic, event sourcing); hash-chained verifiable ledgers (Amazon QLDB, immudb); single-writer state at the edge (Cloudflare Durable Objects); offline convergence (local-first / CRDT). The contribution is their composition under ERP semantics, with two structural results:

1. **Reduction.** iDempiere's Application Dictionary (≈925 tables) reduces to a five-relation bridge — *documents, lines, journal, containers, items* — plus a small verb set, sufficient to fold an ERP within a single browser context.
2. **Unification.** BIM and ERP share one operation log, so a building model materialises into a procurement order through the same kernel.

The method is *extraction* rather than greenfield specification: iDempiere's model classes act as the oracle and its executed records (the GardenWorld dataset) as static ground truth, each verb validated by multiset-diffing the kernel's projection against those records. We report a kernel and architecture witnessed by deterministic replay, period-close checkpointing (compaction as balance-carried-forward), and a single compare-and-set operation class for the one genuinely shared resource.

## Scope

Offline availability and per-operation verifiability are structural consequences of the log model, not optimisations. Reported latency is local in-memory apply measured against an equivalent client–server SQL baseline that trades synchronous durability for asynchronous convergence; **no head-to-head measurement against iDempiere is claimed.** Live rule editing with online re-fold, foreign-schema migration (Odoo, SAP), and the complete document-action suite are specified and partially witnessed, not shipped.

## Assembly (technical summary)

1. **Treat the Application Dictionary as data** — extract it; ≈925 tables reduce to five relations plus verbs.
2. **De-interleave DocAction** — the document lifecycle becomes a status table, shared verbs, and per-type recipes rather than per-class `completeIt()` methods.
3. **Make state a fold** — replace in-place mutation (`UPDATE qty = qty − 1`) with replay over ordered operations; with no shared mutable cell there is no write contention to serialise.
4. **Compact via the accounting period** — period close is a signed checkpoint carrying balances forward; the live log stays bounded by the open period, not the system lifetime.
5. **Partition by physics, reconcile by CAS** — disjoint aggregates union without coordination; the single shared quantity (the last unit) is one compare-and-set operation class, no lock manager.
6. **Co-locate execution and substrate** — the kernel runs on SQLite in the browser; the same operation log drives the BIM model, so a building folds into a Project Order.

## Witnesses

Each claim is reproducible from the repository, validated by `§`-tagged logs rather than assertion:

| Claim | Witness |
|-------|---------|
| AD → five-relation reduction; verbs reproduce executed output | `scripts/diff_oracle.js`, `diff_oracle_cells.js` (multiset diff vs the GardenWorld oracle) |
| Op-group atomicity (all-or-none); period-close checkpoint reconciles the cold archive to the signed balances to the cent; single CAS across the checkpoint | `scripts/poc_showstopper.js` → `§SHOW PASS` |
| Working set bounded by the period, not the log (flat bootstrap across 100× history) | `scripts/poc_volume.js` → `§VOL PASS` |
| Signed hash-chain, ordered replay, owner-gate / CAS, key-recovery floor | `scripts/poc_chain.js`, `poc_distributed.js`, `poc_sign.js`, `poc_email_dr.js` |

Companion documents: [AD-in-Browser (iDempiere)](ERP.md) · [The Holy Grail (editable rules, live)](HolyGrail.md) · [Distributed ERP (Contention Map)](DistributedERP.md) · [Local-First Prior Art](LocalFirstPriorArt.md).
