# ⚠ DO NOT REMOVE — T7 incremental primitives + 4b sharding/lazy-first-paint, 2026-07-04
# Scope: bim-compiler prompts/FABLE5_WRAPUP_2026-07-03.md §Item 4 (+4b) — wire the ALREADY-EXISTING
# incremental primitives (diagnosis: prompts/KERNEL_TIMEBOMB_AUDIT_2026-07-03.md §T7), then make the
# signed snapshot op the shard boundary (4b — strategy call deferred to Claude by the user).
# Read the log after every run. Witness: W-T7-INC (erp/tests/witness_t7_incremental.js).

## The bomb being defused
Every axis is O(whole-history) per action: `_idbPersist` full-`sealChain`s the log on every debounced
persist; POS/kitchen/CRUD run full `verifyChain` (per-op ECDSA verify) after every SEND/save/DocAction;
`readTip`/`listTip`/`tipValues` full-scan + JSON.parse the log per (table,id) per paint; the log grows
monotonically forever (no ERP-side checkpoint — `compact()` is modeller semantics, must never run on
financial data). A busy POS (~300 ops/day) hits ~5k ops in 2–3 weeks → 1–5s per sale, climbing.

## Fix 1 — incremental seal on the persist path
`kernel_ops._idbPersist`: `sealChain(db)` → `sealFrom(db)` (exists since §I-K, seals only rows past the
last sealed tip — O(new), not O(log)). `sealChain` (full) REMAINS the post-compaction / post-import /
post-shard re-seal — those paths renumber or delete rows, sealFrom would be wrong there.

## Fix 2 — tip-cached incremental verify
New `verifyChainIncremental(db)` in kernel_ops.js:
- Cache `db.__krnVerifiedTip = {id, hash}` — set by BOTH full `verifyChain` (on ok) and the incremental
  path (on ok). No cache → delegates to full `verifyChain` (so the FIRST verify of a session is always
  full — boot/restore is never trusted on a warm cache).
- With cache: O(1) guard (the cached row must still hold the cached op_hash — catches deletes/reseals
  under our feet), then per-op verify (same hash-link + v1/v2 sig + group-torn logic as full) for rows
  `id > cache.id` only, seeded prev = cache.hash.
- SEMANTICS (documented, witnessed): the incremental path re-verifies the NEW ops; the prefix is trusted
  because THIS session already verified it against the same in-RAM db. An in-RAM tamper BEHIND the cached
  tip is caught by the next FULL verify (boot, import, snapshot), not by the incremental hot path — same
  trust window the full-verify-per-action had between two actions.
Call sites switched (hot paths only): `crud_overlay.js` DocAction + CRUD save; `kanban_host.js`
`ERP.chainVerify` (which pos_lens/kitchen consume via cfg) + `ERP.seal` → `sealFrom`. Boot/import/merge
paths keep full verify.

## Fix 3 — memoized tip-folds (moveDeltaFor precedent, modeller #596)
New pure module `erp/tip_fold.js` (window.TipFold; node-loadable with global.window): a per-db memo
keyed by branch-view with stamp {maxId, n, undoneN} read in ONE cheap query. Stamp unchanged → cached
verdicts; only NEW rows (id > cached maxId) are scanned and folded forward (last-wins overwrite);
undo/redo or compaction changes n/undoneN/maxId → full rebuild (correct, rare). Wired into
`crud_overlay.readTip` / `tipValues` (per-(table,id) hot paint paths); `listTip` keeps its single
forward scan (it is already O(ops) once per grid, not per row) but reuses the same stamped cache for
its op rows. Fallback: TipFold absent → old full-scan path unchanged.

## Fix 4 — signed snapshot op (period-close pattern, NON-destructive by default)
New module `erp/erp_shard.js` (composes on kernel_ops + erp_kernel — kernel_ops.js stays lean):
- Op type `SHARD_SNAPSHOT`, committed via `commitGroup` (device-signed, `_sigv:2` content-signed).
  params.payload = { op_type:'SHARD_SNAPSHOT', shardSeq, baseTipId, baseTipHash (prior chain head),
  prevSnapshotContent (content-hash of prior snapshot op | 'GENESIS'), count, projState (the five
  projection tables' rows — recorded INPUT, replay-seedable) }.
- `erp_kernel.applyOne` gains the `SHARD_SNAPSHOT` case: seed the projection from projState
  (INSERT OR REPLACE). ⇒ `replay([snapshot, post-ops])` rebuilds the projection WITHOUT genesis —
  "folds start FROM the snapshot". Witness: projectionHash(fold-from-snapshot) ==
  projectionHash(fold-from-genesis).

## Fix 4b — snapshot = shard boundary; instant first paint; lazy history
- `ErpShard.shard(db, opts)` — opts.store = injectable {get,put} (IDB in browser, in-mem in node tests):
  1. FULL `verifyChain` must be green (never checkpoint unverified history).
  2. ARCHIVE FIRST (T3 lesson — the missing cold-archive leg): export rows id ≤ tip as a JSON ops array
     (the exportBranch shape) → `store.put('<key>::shard:<seq>')` → READ BACK + re-verify hash links →
     only a CONFIRMED verified copy unlocks step 4. Store failure ⇒ ABORT, db untouched.
  3. Commit the SHARD_SNAPSHOT op (step above).
  4. DELETE rows id < snapshot op, then full `sealChain` re-seal — the hot chain restarts at the
     snapshot (prior head preserved INSIDE the signed snapshot params; v2 content sigs survive the
     re-seal by design — T2/#630).
- Shard-boundary verification ≡ full-chain: `verifyShard(blob, snapshotParams)` recomputes the archived
  array's hash links end-to-end and requires final tip == snapshotParams.baseTipHash; shard k's first
  prev == shard k-1's snapshot-recorded head, back to GENESIS. A tampered archived op breaks its shard's
  recomputed links → DETECTED lazily, cryptographically, without eager load. Witnessed.
- Instant first paint: after sharding, the persisted hot blob IS small ([snapshot + open shard]) —
  boot/restore paths need NO change; they load the hot blob as today. History views lazy-`loadShard()`
  older shards backward, each verified before use.
- DEFAULT OFF: sharding runs ONLY via explicit `ErpShard.shard()` / opt-in `maybeShard(db,{threshold})`.
  A log below threshold never shards → read path byte-identical (witnessed: db.export() bytes equal).

## Witness — W-T7-INC (erp/tests/witness_t7_incremental.js, node, ~5k-op synthetic log, REAL ECDSA signer)
§T7-SEAL   sealFrom after +1 group seals ONLY the new rows, tip identical to full sealChain, measured ms drop.
§T7-VERIFY incremental == full verdict+tip; measured ms drop at 5k ops; tamper AFTER cached tip → caught
           incrementally; tamper BEHIND cached tip → caught by the next FULL verify (semantics honest).
§T7-TIP    TipFold readTip/tipValues == unmemoized fold on every (table,id); measured ms drop per paint
           sweep; undo invalidation correct.
§T7-SNAP   fold-from-snapshot projectionHash == fold-from-genesis; archive-confirm gate: failing store ⇒
           NO delete; post-shard hot log = snapshot + open ops only.
§T7-SHARD  tampered archived shard DETECTED on lazy verify; clean shards chain back to GENESIS.
§T7-OFF    below-threshold log: maybeShard no-op, export bytes byte-identical.
Each § prints measured before/after ms — "must show a real, measured drop, not just 'should be faster'".
