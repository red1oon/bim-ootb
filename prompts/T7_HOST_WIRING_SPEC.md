# ⚠ DO NOT REMOVE — T7 host wiring: ErpShard.maybeShard into the POS host + lazy shard history, 2026-07-04
# Scope: bim-compiler prompts/FABLE5_FOLLOWUP_2026-07-04.md §Item 1 (carried from FABLE5_WRAPUP §4b —
# "ErpShard host opt-in unwired"). Builds ON prompts/T7_INCREMENTAL_SHARD_SPEC.md (the engine, PR #636);
# this spec is the WIRING half. Read the log after every run. Witness: W-T7-HOST (extends
# erp/tests/witness_t7_incremental.js — extend, don't replace).

## The gap being closed
`erp/erp_shard.js` shipped (#636) but NOTHING calls it — the ~5k-op POS scale cliff is still fully live.
The shard target is the POS/kanban op log: `window.ERP.opDb` (kanban_host projDb), persisted at
`bim_ootb_cache/dbs/idmp_kanban_proj`. Threshold = **5000** (the tested value: erp_shard.maybeShard's
default + the W-T7-INC ~4.9k synthetic log). The crud sidecar log (`glassbowl_kernel_ops`) is NOT
sharded by this wiring — `__crud.readTip` / lineage-hover / kanban tips read the sidecar and are
unaffected (verified: idempiere.html:4118 reads `__crud.readTip`, not the projDb).

## Discovered pre-wiring hazards (walkers that assume the FULL log is hot)
Naively calling maybeShard would corrupt three POS folds — each walks raw `kernel_ops` rows from t0:
1. **`pos_lens.nextIds`** (SYNC, on the Pay path) — `COUNT(CREATE_DOCUMENT)` → deterministic PKs.
   Post-shard the count collapses → **PK reuse/collision** with archived orders. Hard corruption.
2. **`pos_lens.logMovements` + `pendingInbound` → `suggestAll`** — replenishment stock arithmetic
   loses pre-shard movements/open POs → wrong suggestions + double-order (defeats the
   pendingInbound=no-double-order guard, bc #19/#22).
3. **`kitchen_lens._opRows` → `KitchenCore.foldTickets`** — pre-shard undelivered DR tickets vanish
   from the KDS queue (a deliver-later sale older than the boundary is still owed to the customer).

## Build (all additive; DEFAULT OFF preserved — nothing changes until a host injects the hooks)
1. **`erp/erp_shard.js`** — snapshot payload gains cumulative **`opCounts`** ({op_type: n} over ALL ops
   up to the boundary = prior snapshot's opCounts + this shard's rows). A recorded INPUT (period-close
   doctrine, same as projState) for counter-style walkers that cannot await a lazy fetch. Also new
   **`loadArchivedOps(db, store, key)`**: walk shards BACKWARD from the hot snapshot (loadShard verifies
   each internally; boundary link = recorded baseTipHash, same rule as verifyShards), return the full
   archived prefix ASCENDING; cache on `db.__shardArchive = {atSeq, ops}` so the fetch happens ONCE per
   generation (a new shard bumps seq → refetch). Tamper/missing ⇒ `{ok:false, why, seq}` — callers get
   an HONEST refusal, never a silently-thin history.
2. **`erp/kanban_host.js`** — host glue: `shardStore()` ({get,put} over bim_ootb_cache/dbs — the same
   IDB the blob lives in, so shard blobs ride the existing store), `maybeShard(projDb, projKey, opts)`
   (ErpShard.maybeShard @5000 → on sharded=true PERSIST the shrunk hot blob — that IS the instant first
   paint: boot loads [snapshot + open shard] only), `archivedOps(projDb, projKey, opts)` (lazy history
   for scrub/fold surfaces).
3. **`erp/pos_lens.js`** — (a) `nextIds` += latest-snapshot `opCounts.CREATE_DOCUMENT` (sync, hot-db
   query, O(1)); (b) replenish folds accept lazily-fetched archived rows: `suggestAll(b3, opDb, archived)`
   prepends them into logMovements/pendingInbound walks; generateReplenish awaits `cfg.archivedOps()`
   first (panel-open path — async is fine there, NEVER on the Pay path); (c) after each successful
   commit+chainVerify (sale / deliver-later / replenish-commit) call debounced `cfg.maybeShard()`
   (2s, the `_persistToIdb` idiom). No cfg hooks injected → byte-identical behavior (default off).
4. **`erp/kitchen_lens.js`** — on open, await `cfg.archivedOps()` once; `_opRows` folds
   [archived ⊕ hot]; a failed archive fetch folds hot-only + §-warns (honest degradation).
5. **`erp/idempiere.html`** — openPosFor injects `maybeShard` + `archivedOps`; openKitchenFor injects
   `archivedOps` (all via KanbanHost, key `_KPROJ`).

## Time-Machine decision (stated, not implicit)
There is no dedicated op-log Time-Machine UI on the ERP pages today (Z-bar/W-pill = nav history;
viewer TM = 4D schedule). The surfaces that DO scrub op-log history from t0 on the POS host are the
kitchen queue fold + the replenishment pending fold — THOSE are wired to lazy `loadShard` (via
loadArchivedOps). First paint needs only the hot blob (boot path unchanged, already small post-shard).
The lineage hover reads the un-sharded crud sidecar — no wiring needed until that log ever shards.

## Verify — W-T7-HOST (new §s appended to witness_t7_incremental.js, node, real ECDSA)
§T7-HOST-OFF  below threshold through KanbanHost.maybeShard: no-op, export bytes byte-identical
              (matches existing §T7-OFF, but through the HOST path).
§T7-HOST      past ~5k ops: shards for real; measured boot-verify + blob-size drop (the first-paint
              proxy, same methodology as §T7-SNAP's measured drop).
§T7-COUNT     nextIds continuity: next PK id identical pre-shard vs post-shard (+ opCounts cumulative
              across TWO generations) — no collision window.
§T7-LAZY      kitchen foldTickets([archived ⊕ hot]) == foldTickets(pre-shard full log) — a pre-shard
              undelivered DR ticket is STILL QUEUED post-shard; suggestAll equality pre vs post+archived.
§T7-LAZY-NEG  tampered archived shard ⇒ loadArchivedOps {ok:false, why:'payload altered'}; MISSING
              shard blob ⇒ {ok:false, why:'missing'} — both refuse, neither fabricates a thin history.
§T7-RACE      a commitGroup landing MID-SHARD is never lost. DISCOVERED during this wiring: shard()
              runs across awaits (crypto + the store) and used `DELETE id < snapId` — an op committed
              between the archive export and the snapshot got an id below snapId ⇒ deleted but never
              archived = a silently lost SIGNED sale. FIX (erp_shard.js): the shard is PINNED to
              id ≤ baseTipId (export bounded, delete bounded, opCounts derived from the archived array
              itself); a mid-shard survivor rides the hot log across the boundary, the T2 v1-sig guard
              extends to survivors (they get re-sealed too), and verifyShards/loadArchivedOps SCAN for
              the prior snapshot instead of assuming it is the shard's first row. An op landing between
              verifyChain and the MAX(id) pin ⇒ av.tip ≠ v.tip ⇒ safe ABORT (retry next debounce).
Each § prints measured/compared values; read build/t7_incremental.log before concluding.
