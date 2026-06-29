<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Teams overlay — the abstract **World / History** collaboration core

> One signed-log substrate behind **every** collaborative surface in the system. The BIM Modeller's
> "Teams overlay" (collaborate by **discipline**) and the ERP's team workspace (collaborate by
> **role / team**) are two *specializations* of the same core. Collaboration is not a feature bolted on —
> it **falls out of the signed op-log for free**: no server added, the need for one removed.

## 0. The one mental model: World = fold(History)

This is a **World / History timeline** — git-like, replayable.

```
        History  (the signed op-log = the timeline of facts)
   ┌───────────────────────────────────────────────────────────────┐
   o──o──o──o──o──o──o──o──o──o──o──o──o──o──o──o──o──o──o─►  trunk
            └──o──o──o──┐         (branch = an alternate timeline / fork)
                        └──o──o──► walker
   ┌───────────────────────────────────────────────────────────────┐
        World    (current state)  =  fold(totalOrder(History))
```

- **History** = the append-only, signed, hash-chained op-log. Every op is a *fact* (a signed input), never
  an invented value. This is the source of truth. *(engine: `append` + connector `sign`/`verifyChain`.)*
- **World** = the current folded state, `fold(totalOrder(ops))`. Deterministic projection of History.
  Re-derivable at any point on the timeline (scrub = fold a prefix). *(engine: `totalOrder` + `fold`.)*
- **Branch** = a fork of the timeline with an `owner`, a `scope`, and a `forkPoint`. Merging is **folding
  measured facts**, so it is computable — not a manual reconcile. *(engine: `makeBranch`, gate `hint`/`settle`.)*
- **Blame / verdict** = per-element overlay on the World: who last touched it (History), and its merge verdict
  (gate). *(engine: `blame`; gate: `ladder`/`matrix`.)*

Everything below is this model with the domain-specific parts pushed behind ONE seam.

## 1. The generic partition axis (`scope`)

A branch is scoped to a slice of the World. **The scope key is opaque to the core** — the domain decides what it means:

| | BIM Modeller (Teams overlay) | ERP (team workspace) |
|---|---|---|
| **scope axis** | discipline (ARC / STR / MEP / QS) | role / team (Sales / AP / Inventory / Approver) |
| **branch** | a discipline-walker over one building | a role-team over one document/period |
| **owner-gate** | only the discipline owner writes its geom | only the role writes its own postings/fields |
| **annotation** | cross-discipline note / post-it | cross-role comment / review note |
| **a "geom" op** | INSERT/MOVE/SIZE/DELETE element | CREATE/AMEND/POST/VOID document line |

The core engine never says "discipline" or "BIM" — it says `scope`. `disc` in the current BIM code is simply
*this domain's name for the scope key*. ERP binds the same field to role/team. **Do not hardcode the domain into
the engine, protocol, gate-axis, or view-model.**

## 2. The op — domain-agnostic fact

```
op = { id, ts, branch, author, cls, verb, target, params }      // id, ts = edge-minted INPUTS (never Date.now())
```

- **`cls`** (op-class) generalizes across domains:
  - `geom` → **state-mutating domain op**, owner/role-gated (single-writer per scope). BIM: place/move/size/delete.
    ERP: create/amend/post/void.
  - `annot` → cross-scope annotation (allowed from any branch). BIM: post-it. ERP: review comment.
  - `git` → timeline management (PUSH / REBASE / merge). Domain-independent.
- **`verb` / `params`** are the domain vocabulary, but the engine treats them as opaque (only `fold` interprets the
  small known geom verbs; a domain can supply its own fold via the seam).

## 3. The ONLY coupling — the connector seam

The whole point of separation: the core depends on nothing but `connectors.js`. To retarget a domain, swap the
seam bindings. The engine, protocol, view-model, and witnesses **do not change**.

| seam method | BIM Modeller binding | ERP binding | shared |
|---|---|---|---|
| `sign` / `verifyChain` | `erp/kernel_ops.js` | `erp/kernel_ops.js` | ✅ same hash-chain |
| `evaluateGate` | `sdg_gate.evaluate` (RED clash / ORANGE clearance) | role/permission + validation rules | — |
| `foldCost` | `viewer/rates.js` (5D) | ERP cost / GL rollup | — |
| `subscribeOps` | window `'bonsai:oplog'` | ERP op stream | — |
| `bus` | `BroadcastChannel('bim_teams')` | same bus, different channel | ✅ same mechanism |

`connectors_live.js` feature-detects these and falls back to deterministic stubs when absent → the layer runs
standalone (and in tests) with no domain present.

## 4. The verdict ladder — generic, not BIM-specific

Per-element/-cell state, computed by the gate over the merged World:

- **provisional** (Tier-1 hint, advisory, fast — inflated/coarse) → **verified-{red|orange|green}** (Tier-2, precise)
  → **stale** (the branch's fork point fell behind trunk; re-fold to revalidate).
- **RED** = hard stop. BIM: geometric clash (door-crush / UBBL). ERP: validation failure / unbalanced post / permission deny.
- **ORANGE** = soft, accept-or-ignore. BIM: over budget vs Project-Order baseline. ERP: over approval limit / variance.
- **GREEN** = clean. The ladder is the same in both domains; only the gate binding differs.

## 5. The view — World/History surfaces (domain-agnostic view-model)

The view-model builders (`overlay/teams_view.js`) take engine+gate output and emit pure models; the DOM renderer
styles them. All three surfaces are just lenses on World+History:

- **Tree** (blame-tinted World) — elements/documents tinted by last author (History) + ladder color (verdict).
- **Chat == History** — the op-log projected to prose (`chatlog.render`); the chat *is* the commit-message stream,
  tamper-evident. Not a side channel.
- **Dashboard** — scope×scope clash/conflict matrix, per-branch budget/limit rails, branch freshness.
- **(future) Timeline scrubber** — fold a prefix of History to view the World at any point; diff two branches.
- **Canvas markers** — World elements colored by the ladder (BIM 3D; ERP could be a doc/board layout).

### Embedding — an overlay, not a takeover
Teams is a self-contained `teams/` module **overlaid** into host apps — `erp/` and `modeller/` — behind a **Teams
icon** (the 2-person toggle, wired later, not now). "See what others are doing" turns the overlay **on**:
- The renderers mount into a **host-provided container** (`renderTree(rootEl, …)`), so the overlay can appear
  **in-frame / split-screen** alongside the host without owning the page or its state.
- `teams.html` doubles as the **standalone demo** AND the **iframe content** for an in-frame embed (cheapest
  isolation: the host drops an `<iframe src="teams/teams.html">` in a split pane; the overlay talks home over the
  `BroadcastChannel('bim_teams')` bus / `'bonsai:oplog'` seam — no DOM entanglement with the host).
- The folder is named **`teams/overlay/`** on purpose — it is *the embeddable overlay surface*, **not** the host
  app's own `view/` layer. No conflation: nothing in `teams/` assumes it owns the page.

## 6. Invariants (carry across BIM and ERP)

- **NON-INVENT** — every value traces to a signed op (History) or a deterministic fold of it. No fabricated data.
- **Determinism** — no `Date.now`/`Math.random` in op/fold/render paths; `id`/`ts` are edge-minted inputs.
- **Single-writer per scope** — `geom`/state ops are owner/role-gated; `annot` is cross-scope.
- **Tamper-evidence** — History is hash-chained + signed; editing the past breaks the chain.
- **Additive & separate** — the core touches no host code; one seam, swappable per domain. No UI launcher here.

## 7. The facilitator — optional, **trustless** relay (never a source of truth)

The thesis is serverless: collaboration works with **no authoritative server**. But a *facilitator* (a dumb
relay / rendezvous) is useful for presence and for async, cross-network collaboration. It is **trustless** — it
can never forge truth, because truth is signed (History) and content-addressed (shared datums). It is always
**optional**: remove it and same-machine/LAN collaboration still works.

### What it does (and ONLY this)
1. **Store-and-forward signed ops** — `pushOps(branch, ops)` / `pullOps(branch, sinceHash)`. Git-like "dumb remote"
   for branch tips. Receiver re-runs `verifyChain` → a tampered/forged op is rejected on arrival.
2. **CAS blob store for shared datums** — `putBlob(datum) → key` / `getBlob(key)`, key = content hash (`protocol.casKey`).
   Immutable + content-addressed → the facilitator *cannot* alter a shared datum without changing its key.
3. **Presence / awareness broker** — relays Tier-1 heartbeats (`protocol.makeHeartbeat`) between branches.
   Awareness only — carries tips, never the ops themselves.
4. **Ref directory** — `tips()` → `{branch: tipHash}`; lets a joining peer discover branches to pull.

### What it CANNOT do (why trustless is safe)
- **Forge / amend an op** — breaks `op_hash`/`sig` (client `verifyChain` rejects).
- **Alter a shared datum** — changes its CAS key (client `casKey` mismatch).
- **Invent a verdict** — the gate/ladder runs **client-side** over the verified World; the facilitator never sees a verdict it can fake.
- Worst a malicious/faulty facilitator can do = **withhold / reorder / replay**. Mitigations are built in:
  total order is `(ts,id)` (deterministic regardless of arrival order) · dedup by `op_hash` · gaps detected via
  `prev_hash` chain · replay is idempotent. → **eventual convergence** despite a hostile relay.

### Tiers (degrade gracefully — pick the lowest that works)
- **Tier 0 — none.** Single user, multiple branches, offline. Same-machine tabs via `BroadcastChannel('bim_teams')`.
- **Tier 1 — peer/LAN.** Direct gossip (WebRTC / local relay) for presence + op exchange. No durable server.
- **Tier 2 — facilitator.** A dumb relay for async + cross-network: a serverless function + object store, or the
  ERP **edge suite** (`docs/DistributedERP.md`, `scripts/erp_seam.js makeSeam {read,dispatch,verify}`,
  `kernel_ops` signed chain). **Auth = keys/signatures, not server identity.** This is exactly the "secured-distributed /
  serverless" ERP doctrine — the facilitator is the transport *under* `erp_seam`, shared by BIM and ERP.

### Lifecycle — senior peer → promotion → durable host
The facilitator is **not** a thing you stand up first. It *emerges* and can be *promoted*:
1. **Senior peer (zero-config).** When the first user comes on board, **the first peer IS the facilitator** —
   it holds the relay service + its location (a URL / channel it advertises in its heartbeat). New joiners point at it.
2. **Promote to durable.** Because the facilitator holds **no truth** (only signed ops + content-addressed blobs),
   its state is fully portable — copy the logs + CAS to any host and re-point peers. So the senior peer can be
   **promoted** to a dedicated permanent service: an **office server**, or a hosted remote (**GitHub / OCI**).
3. **Hand-off is loss-free.** Promotion = `pullOps`/`getBlob` everything from the senior peer, `pushOps`/`putBlob`
   into the durable host, re-advertise the new location. No verdicts/world to migrate (re-derived client-side).

### Demo topology — GitHub (facilitator) + OCI (second remote user)
Concrete plan for *this* project:
- **GitHub = the durable demo facilitator.** GH is *natively content-addressed* — git objects are keyed by hash,
  exactly like our CAS — so the branch logs + shared-datum blobs map onto it directly (a repo / Pages tree as the
  store; raw content for `pullOps`/`getBlob`; the GH API or commits for `pushOps`/`putBlob`). Append-only + signed
  → GH can host it untrusted.
- **OCI = a second remote user.** Test real cross-network collaboration: this machine = peer A, an **OCI**-hosted
  client = peer B, both syncing through the GH facilitator. (Reuse the existing OCI object-store path; obey
  `deploy/OCI_UPLOAD.md` §RULES — every `put` needs `--content-type`.)
- **Tier note:** GH/OCI are **async store-and-forward (Tier-2)** — durable, not real-time. Tier-1 *presence*
  (live heartbeats) needs a live channel (BroadcastChannel/WebRTC) and **degrades to last-seen polling** over
  GH/OCI. Ops/CAS converge regardless (the trustless guarantees in this section hold over any transport).
- This is the project's **"secured-distributed / serverless"** ERP doctrine made concrete: the facilitator is a
  dumb durable mirror; keys/signatures are the auth, not the host.

### Abstract interface (one seam, loopback-testable)
```
Facilitator = {
  pushOps(branch, ops),            // → {accepted, rejected:[{at,why}]}  (verifyChain on receipt)
  pullOps(branch, sinceHash),      // → ops after sinceHash (gap-checked by prev_hash)
  putBlob(datum) -> key,           // CAS, dedup, content-addressed
  getBlob(key),                    // → datum | null
  announce(heartbeat),             // presence in
  presence(),                      // → summarizeHeartbeats(latest per branch)
  tips()                           // → {branch: tipHash}
}
```
Build path: a **stub `facilitator.js`** (in-memory loopback over `protocol` + `connectors.verifyChain`) witnessed
for — relay preserves the chain · tamper rejected on push · CAS dedup/round-trip · presence summarize · **reorder +
replay still converge** (the trustless guarantee). The live binding (serverless / ERP edge) swaps in later; engine,
view, and witnesses do not change.

## 8. Module map (this folder)

| file | role | domain-agnostic? |
|---|---|---|
| `engine.js` | branches · owner-gate · total-order · **fold (World)** · blame · freshness | ✅ core |
| `gate.js` | merge gate + verdict ladder + matrix | ✅ core (gate binding via seam) |
| `chatlog.js` | **History → chat** projection + tamper-check | ✅ core |
| `connectors.js` / `connectors_live.js` | the seam (stub + feature-detected live) | ✅ the coupling point |
| `protocol.js` | shared-datum CAS seam · Tier-1 heartbeat · op-message default | ✅ core |
| `overlay/teams_view.js` | view-model builders + DOM renderer | ✅ (scope-agnostic) |
| `index.js` | barrel | ✅ |

BIM and ERP each add only: a scope source, a `gate`/`foldCost` binding, and a domain vocabulary of verbs — nothing
in this folder needs to fork.
