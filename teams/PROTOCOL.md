# Teams Overlay — Protocol (the 3 resolved OPEN design items)

> ⚠ Scope: resolves the three `⛔ OPEN` items in `prompts/RESUME_DISTRIBUTED_BRANCHES.md §12`
> (cross-ref §3 seam, §7 two-tier sync). Engine = `protocol.js`; witness = `tests/poc_teams_protocol.js`
> (**W-PROTO 17/17**). All helpers are pure `f(input)` — **NO `Date.now` / NO `Math.random`**;
> timestamps and ids are edge-minted INPUTS passed by the caller. NON-INVENT: every output traces to
> its input. Reuses `connectors.js _util.sha256` — no re-implemented crypto, no fork of the frozen engine.

## 1. Shared-datum CAS — the seam (§3, §12.2)
Discipline-split branches are near-conflict-free (disjoint elements). **Zone-splits** are not: conflict
concentrates on a *shared datum* — the column/grid/`datum_plane` that two zones both anchor to. That one
contended object is content-addressed instead of id-addressed:

- `casKey(datum)` = `sha256(stableStringify(datum))`. Same content → same key on **any** node, regardless
  of key order in the object literal (witness `§CAS-SAME`). A changed value → a different key, so the seam
  is **tamper-evident** (`§CAS-TAMPER`).
- `casPut(store, datum)` → `{key, store}`: an **immutable** add. Identical content collapses to the same
  key with **no duplicate** and the input store is left untouched (`§CAS-DEDUP`). `casGet(store, key)`
  round-trips; a miss → `undefined` (`§CAS-ROUNDTRIP`).

Why content-addressing makes the datum mergeable: both zone branches name the datum by *what it is*, not by
a mutable local id, so independent references converge automatically. In total order the first claim owns
it; later branches `casGet` the identical key **read-only** — no element is lost, no write contends.

## 2. Tier-1 heartbeat payload (§7, §12.1)
Tier-1 is **awareness, advisory, sub-second** — distinct from the authoritative Tier-2 gate replay.
`makeHeartbeat({branch, author, tipHash, scope, ts})` → a fixed, minimal schema:

```
{ kind:'heartbeat', branch, author, tip:<tipHash>, scope, ts }
```

It carries the branch **tip hash** (a pointer for "are you behind me?"), not the ops themselves
(`§HB-MINIMAL`). **Awareness vs ops separation:** heartbeats ride `BroadcastChannel('bim_teams')`; the
actual signed ops ride the log (`'bonsai:oplog'`). Keeping the payload to who/where/tip is what keeps it
cheap enough to pulse an optimistic overlay. `summarizeHeartbeats(list)` reduces a stream to a per-branch
presence map = the **latest-by-ts** heartbeat per branch (`§HB-LATEST`) — pure, so the same stream always
yields the same presence map.

## 3. Op-message field default (§12.3)
**Policy:** the stored op keeps `params.message` **optional**; the chat projection fills it
**deterministically**. `withMessage(op, describeFn)` returns a new op (input untouched) whose
`params.message` is:

- the author-written message **verbatim** when present (`§MSG-AUTHOR`), else
- `describeFn(op)` — a deterministic render of `verb`+`params`. The caller passes
  `TeamsChatlog.describe` so the projection is **not forked** (`§MSG-DEFAULT`).

The default is **exactly** the projection — never fabricated prose (`§MSG-NONINVENT`). Same op → same
default, every time.

## Named API finding (engine NOT modified)
`connectors.js _util` exposes `sha256` and `canonical`, but **not** the general recursively key-sorted
`stableStringify`. `_util.canonical` allowlists op fields (`id,ts,branch,author,cls,verb,target,params`),
so hashing a *bare datum* through it drops all of the datum's own fields → every datum would collide.
`protocol.js` therefore re-implements the stable serializer **locally** (`_stable`, byte-identical to the
connector's algorithm) and reuses `_util.sha256` for the digest. This is serialization, not crypto, and
touches nothing in the frozen engine. **Recommendation (no action taken here):** if/when connectors is
next revised, export `stableStringify` on `_util` so CAS and the op-canonicalizer share one serializer.

## Witnesses
`W-PROTO` — `tests/poc_teams_protocol.js`: `§CAS-SAME §CAS-TAMPER §CAS-DEDUP §CAS-ROUNDTRIP`
(W-PROTO-CAS) · `§HB-MINIMAL §HB-LATEST` (W-PROTO-HEARTBEAT) · `§MSG-AUTHOR §MSG-DEFAULT §MSG-NONINVENT`
(W-PROTO-MESSAGE). Run: `node teams/tests/poc_teams_protocol.js 2>&1 | tee teams/logs/protocol.log`.
