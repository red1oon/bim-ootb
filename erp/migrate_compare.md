# Migrate & Compare — Legacy ERP vs the WASM Event-Sourced Browser

> **Status:** DRAFT (2026-06-08). The basic, evaluator-facing companion to the deep papers
> ([ERP.md](ERP.md) · [DistributedERP.md](DistributedERP.md) · [BIMERPPaper.md](BIMERPPaper.md)).
> Every number below traces to a real source file in this repo (path cited per cell).
> Where no head-to-head number exists, the cell says so — nothing here is invented.

---

## Thesis (one paragraph)

A classic ERP (iDempiere, Odoo, SAP) is a **server of record**: every read, write, posting and
period-close is a round-trip to a machine that *owns the truth*. We keep the same accounting and the
same document flow but **delete the server of record**: the authoritative state is a *signed,
hash-chained op-log*, and the current numbers are a deterministic **fold** of that log replayed by a
SQLite-WASM kernel **inside the browser**. The host becomes disposable (like a Git remote); the user
owns the log; a period-close is a *signed checkpoint* the books are carried forward from, not a
server batch job with downtime. This is a claim about the **substrate and delivery**, not feature
breadth — the legacy stacks have vastly more features. What we show is that the *architecture* folds
the same transactions with **zero network on the read/fold path**, proven against a live Odoo and the
real in-browser kernel.

---

## The comparison diagram

```
LEGACY ERP  (iDempiere / Odoo / SAP — "server of record")
────────────────────────────────────────────────────────
  user gesture ──HTTP──▶ app server ──SQL──▶ database ──▶ posting/validation
       ▲                                                        │
       └───────────────── rendered page / row ◀────────────────┘
  • every read & write = a network round-trip
  • the DB OWNS the truth; client is a thin view
  • period close = server batch job (per-row saveEx ≈ 1M round-trips), down-window


OUR WASM EVENT-SOURCE  ("the browser is the server")
────────────────────────────────────────────────────────
  user gesture ──▶ op ──▶ local WASM kernel (commit + hash-chain + sign)
                            │
                            ├─▶ replay/fold (SQLite-WASM, in-memory) ──▶ paint
                            │        0 network on the read/fold path
                            └─▶ (later, async) push signed op to a DUMB facilitator
                                 / user's own channel — host is disposable, log is truth
  • state = Σ(fold of the signed op-log); recomputable by anyone
  • period close = SIGNED CHECKPOINT = balance b/f (no down-window)
```

Source for the "what moved off the server" mapping: **`docs/DistributedERP.md` §0 lines 53–85**
(server→serverless table, each row carries its own proof script). The "no per-interaction network
round-trip (the kernel answers locally)" claim: **`docs/DistributedERP.md` §10 lines 467–468**.

---

## Vitals table

Columns are **architecture**, not a feature scorecard. Numbers are measured on *this* box / *this*
browser POC unless marked. "n/a — architectural" = the legacy stack has no comparable single number
because the property is structural (e.g. it always needs a network).

| Vital | iDempiere | Odoo | SAP | Our WASM event-source |
|---|---|---|---|---|
| **Period close** | Server batch job + down-window (per-row `saveEx` ≈ ~1M round-trips on a 40-yr depreciation run) [^dep] | Server batch job [^arch] | Server batch job [^arch] | **Signed checkpoint = balance b/f**, no down-window; 40k-op close-fold ≈ **2.68 s** in-browser, archived=40000→live=1, reconcile **maxDiff=0c** [^pclose][^drive] |
| **Server round-trip (read/fold path)** | network round-trip per interaction [^arch] | network round-trip per interaction [^arch] | network round-trip per interaction [^arch] | **0 — the kernel answers locally** (no server of record on read/fold) [^noround] |
| **Bootstrap (open the books)** | re-query the server [^arch] | re-query the server [^arch] | re-query the server [^arch] | **~53× faster from checkpoint than genesis replay** — fromCkpt **0.90 ms** vs fromGenesis **47.70 ms**, browser-measured at 40k ops, same result [^drive] |
| **Storage primitive (1000 ops, one atomic commit)** | Postgres durable WAL+fsync **5.24 ms** (0.0052 ms/op) [^bench] | (Postgres, same engine) [^arch] | n/a — architectural [^arch] | sql.js in-browser incl. sha256 chain **208.45 ms** (0.2084 ms/op) — slower per-op, buys **no server**; Postgres buys durability+concurrency+network we DEFER to the install [^bench] |
| **Commit throughput (batch vs naive, 5000 ops)** | n/a — architectural [^arch] | n/a — architectural [^arch] | n/a — architectural [^arch] | batch `commitGroup` **~22,492 ops/s = 2.4× naive** per-op+sealChain [^sync] |
| **Fold/append ceiling (in-process)** | n/a — architectural [^arch] | n/a — architectural [^arch] | n/a — architectural [^arch] | append+fold **stay linear to 20,000,000 ops** (largest fit; ~437 B/op retained); fold ~40M ops/s hot [^ceiling] |
| **Deployment / bloat (DB seed)** | `Adempiere_pg.dmp` **45.2 MB** [^bloat] | n/a — different schema [^arch] | n/a — different schema [^arch] | `erp/ad_seed.db` **12.7 MB** (≈**3.5×** smaller); the 12.7 MB IS the self-describing AD [^bloat] |
| **Deployment / bloat (runtime LOC)** | **1,427,147 Java LOC** / 4,465 files + JVM+Postgres+3.7 GB build [^bloat] | n/a — different codebase [^arch] | n/a — different codebase [^arch] | **16,068 JS LOC** / 39 files / 884 KB, static + SQLite-WASM, offline (≈**89×** fewer LOC, zero server/JVM/DB) [^bloat] |
| **Live-DB → SQLite footprint** | Postgres **143 MB** on-disk (GardenWorld) [^bloat2] | n/a — architectural [^arch] | n/a — architectural [^arch] | **43 MB SQLite** (925 tables, 187,133 rows) ≈ **3.3×** smaller; gzip 11.7 MB (3.7×) [^bloat2] |
| **Data ownership / durability** | server DB owns the record [^arch] | server DB owns the record [^arch] | server DB owns the record [^arch] | **user-owned signed op-log**; host disposable (Git analogy); durably stored via the user's own channel + export; tamper caught by `verifyChain()`, forgery caught by ECDSA-P256 signature [^own][^pclose] |
| **Migration fold (does the legacy flow fold into our verbs?)** | folds via the 6 verbs (the AD is the source) [^bloat] | **PROVEN against LIVE Odoo 17** — SO S00023 → 5/5 hops, newVerbs=[], GL ΣDr==ΣCr 5002.50 [^odoo] | **B1 (Business One) PROVEN vs a MOCK export** (5/5, journal balances 770.00); **S/4HANA NOT-RUN — gated on a real oracle** [^b1][^sap] | the migration-solvent thesis: every hop maps to `CREATE_DOCUMENT/CREATE_LINE/SET_STATUS/POST/ALLOCATE` [^odoo][^b1] |

---

## Method & honesty

**What is measured (real, on this box / browser):**
- Period-close fold, balance-b/f, reconcile-to-0c, tamper/forgery rejection, determinism — on the
  **real kernel** (`scripts/test_kernel_period_close.js`) and against **real double-entry POST ops**
  (`scripts/test_integ_postings_reconcile.js`).
- Browser-measured 40k-op close-fold timing, bootstrap 53× speedup, reconcile maxDiff=0
  (`build/erp/period_close_drive.log`, an in-browser drive).
- Storage primitive sql.js-vs-Postgres (`build/erp/bench_oplog_pg.log`), batch throughput
  (`build/erp/sync_poc_smoke.log`), volume ceiling to 20M ops (`build/erp/poc_volume_ceiling.log`).
- Bloat figures `du`/`wc`/sqlite-measured 2026-06-06 (`internal/BLOAT_MEASUREMENT.md`, summarised in
  the bloat memory).
- The Odoo fold is against a **running Odoo 17** instance (`build/erp/odoo_fold_live.log`,
  `§ODOO-FOLD-LIVE PASS`).

**What is architectural (a property, not a head-to-head number):**
- "0 round-trip" — a *structural* fact (no server of record on the read/fold path), not a benchmark.
  The honest counter is that server-removal only wins over a network; on-box the durable Postgres
  primitive is *faster* per-op (it buys durability + concurrency we defer).
- Most "ERP cells" marked *n/a — architectural* because the legacy stack exposes no single comparable
  number (e.g. throughput ceiling, batch-vs-naive) — its design is server-bound by definition.

**NOT feature parity — say it plainly.** iDempiere, Odoo and SAP have *vastly* more features,
processes, localisations and integrations than this engine. The 16K LOC RENDERS the dictionary and
FOLDS the paths built so far (order-to-cash, journal/posting, signed rule-edit, period close). It does
**not** re-implement the full transactional server. The reduction is a **delivery/definition**
reduction (the generic AD-interpretation engine is leaner because the AD is self-describing; the whole
server/build stack is removed). Each transactional verb/process is irreducible and must still be folded
deterministically. See `feedback_erp_perf_claims` and the honest-caveat block in the bloat memory.

---

## GAPS (vitals lacking a measured source — do not claim a number)

1. **SAP S/4HANA fold** — BLOCKED. `build/erp/sap_fold.log` says `§SAP-FOLD NOT-RUN (skeleton ready;
   gated on oracle access)`. No real SAP O2C+FI export has been folded; only **SAP Business One (B1)
   against a hand-authored MOCK** has (`build/erp/b1_fold.log`). The "SAP" column is therefore
   *partly mock, partly not-run* — never present S/4HANA as proven.
2. **Odoo / SAP server-side period-close timing & down-window** — no measured number; marked
   *architectural*. We have our own 2.68 s/40k-op figure but no head-to-head legacy batch-close time.
3. **Odoo / SAP server round-trip latency (ms)** — not measured here. The closest real datum is the
   iDempiere depreciation run (`DepreciationPerf.md`: per-row `saveEx` ≈ ~1M round-trips), and the
   `feedback_erp_perf_claims` matrix (REMOTE per-txn 2–5 orders, RTT-bound) — both iDempiere-flavoured,
   not Odoo/SAP. Cite as illustrative, not as an Odoo/SAP measurement.
4. **Postgres per-op floor vs our per-op** is a *primitive-only* comparison (no callouts/posting/JVM on
   either side) — `bench_oplog_pg.log` states this explicitly; do not extrapolate to whole-document cost.
5. **Live-DB → SQLite (143 MB → 43 MB)** was measured on a static dump + repo (Docker Postgres was NOT
   running at measure time) — see the bloat memory caveat.

---

## Further reading — go deeper

This page is the on-ramp. To see *how* each claim is built, follow these into the deep papers:

- **[ERP.md](ERP.md)** — the **"AD-in-a-browser" blueprint**: how the iDempiere Application Dictionary is
  folded from SQLite and rendered as a live client, the six verbs (`CREATE_DOCUMENT / CREATE_LINE /
  SET_STATUS / POST / ALLOCATE / MATCH`) every document flow reduces to, and the full engine reference.
  *Start here if you want the whole architecture.*
- **[HolyGrail.md](HolyGrail.md)** — the **end-state vision and its "hard parts"**: multi-site sync, durability
  on disposable hosts, and compaction = the period-close *signed checkpoint = balance b/f* you just saw.
  *Read this for where the whole effort is converging and why these were the hard problems.*
- **[OpLogERP.md](OpLogERP.md)** — the **event-sourcing model in one page**: why the authoritative state is a
  *signed, hash-chained op-log* and the current numbers are a deterministic **fold** of it — not a row in a
  server DB. *The shortest explanation of "the log is the truth."*
- **[DistributedERP.md](DistributedERP.md)** — the **serverless / secured doctrine + adversarial contention map**:
  the server→serverless table behind the "0 round-trip" claim, the Git-remote "host is disposable" analogy,
  and the honest counter-arguments. *Read this for the distributed-systems reasoning and the proof scripts.*
- **[BIMERPPaper.md](BIMERPPaper.md)** — the **"why / provenance" piece** (Redhuan Oon, 30 years of ERP):
  the motivation, the lineage from iDempiere/Adempiere/Compiere, and what problem this is really solving.

---

## Footnote sources

[^pclose]: `build/erp/test_kernel_period_close.log` — `§PCLOSE-FOLD` archived=15→live=1, `§PCLOSE-RECONCILE … maxDiff=0c`, tamper/forgery/determinism all PASS on the real kernel.
[^drive]: `build/erp/period_close_drive.log` — in-browser drive: `close N=20000 closeFold=2681.8ms archived=40000 live=1`; `bootstrap fromCkpt=0.90ms fromGenesis=47.70ms speedup=53.0x same=true`; `reconcile maxDiff=0c`.
[^noround]: `docs/DistributedERP.md` §0 (server→serverless table, lines 53–85) + §10 lines 467–468 ("no per-interaction network round-trip (the kernel answers locally)").
[^bench]: `build/erp/bench_oplog_pg.log` — N=1000 ops, one atomic commit: sql.js 208.45 ms (0.2084 ms/op, incl. sha256 chain); Postgres durable WAL+fsync 5.24 ms (0.0052 ms/op). Explicitly "NOT a head-to-head".
[^sync]: `build/erp/sync_poc_smoke.log` — 5,000 events: naive 9,390 ops/s; batch commitGroup 22,492 ops/s = 2.4× (corroborated `sync_poc_prod_smoke.log`).
[^ceiling]: `build/erp/poc_volume_ceiling.log` — append/fold stay LINEAR; largestFit=20,000,000 ops, ~437 B/op retained; fold ~40.8M ops/s hot at 5M.
[^bloat]: bloat memory (`reference_bloat_reduction.md`, measured 2026-06-06 from `~/idempiere-dev-setup/idempiere`) — seed 45.2 MB → 12.7 MB (≈3.5×); 1,427,147 Java LOC → 16,068 JS LOC (≈89×). Full evidence `internal/BLOAT_MEASUREMENT.md`.
[^bloat2]: same memory — LIVE GardenWorld DB Postgres 143 MB on-disk → 43 MB SQLite (925 tables, 187,133 rows, ≈3.3×); gzip 11.7 MB (3.7×).
[^odoo]: `build/erp/odoo_fold_live.log` — `§ODOO-FOLD-LIVE PASS`: live odoodemo (Odoo 17, :8069) SO S00023, 5/5 hops mapped, newVerbs=[], total 5002.50 == oracle, GL ΣDr==ΣCr.
[^b1]: `build/erp/b1_fold.log` — `§B1-FOLD PASS`: SAP Business One O2C + OJDT/JDT1, 5/5 hops, journal 770.00==770.00. Source = a hand-authored MOCK Service-Layer shape (user-authorized 2026-06-05), NOT a real export.
[^sap]: `build/erp/sap_fold.log` — `§SAP-FOLD NOT-RUN` / `BLOCKED — awaiting a REAL SAP oracle. No fold claimed.` (S/4HANA).
[^own]: `docs/DistributedERP.md` §0 lines 74–80 (the Git analogy — log is truth, host disposable) + the signed-checkpoint/tamper proofs in [^pclose].
[^arch]: Architectural property of a server-of-record ERP — no comparable single measured number in this repo; stated as structure, not benchmarked. Honest-caveat doctrine: `feedback_erp_perf_claims`.
