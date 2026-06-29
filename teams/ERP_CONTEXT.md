<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Teams overlay — the **ERP** specialization (plan)

> How the abstract World/History collaboration core ([[DESIGN.md]]) binds to ERP. Companion to
> `DESIGN.md` §1 (generic scope axis) — here the axis is **role / team / org** — and to [[TEAM_OPTICS.md]]
> (the universal dot-layer optics shared with the BIM Modeller/Viewer). Spec-first: this is the plan; build
> follows in witnessed slices (§9). All file:line cites are real ERP code in bim-ootb `erp/`.
>
> ▶ **RESUME (new session): review → execute.** Concept is LOCKED (design dialogue 2026-06-30). Build = §9 here +
> [[TEAM_OPTICS.md]] §8. Nothing built yet. Lead surface = the **Dashboard-Flow** (§5, §5.1); Team = a non-invasive
> **optics toggle** ([[TEAM_OPTICS.md]]); WhatsApp = a conceptual batched-op transport ([[COMPETE.md]]).

## §0 — The thesis: ERP already IS a World/History engine
The Teams core says *World = fold(History)*. **ERP already implements both halves** — so the overlay is
thin (collaboration shell + cross-device transport), not a rebuild:

| Teams core concept | ERP already has it | file |
|---|---|---|
| **History** = signed hash-chained op-log | `kernel_ops` (`id` PK total-order + `op_uuid` cross-device + `prev_hash`/`op_hash`/`sig`, `branch_id`, `user_tag`) | `erp/kernel_ops.js:9-26` |
| **World** = `fold(History)` | `erp_kernel.replay(log)→projection` (documents/lines/items/journal), deterministic `projectionHash` | `erp/erp_kernel.js:203,68` |
| **branch** (timeline fork) | `branch_id` speculative "blue" branches; `acceptBranchUpTo` clears the tag in place | `kernel_ops.js:586` |
| **owner-gate** (single-writer per scope) | `erp_seam.dispatch` owner-gate on first `user_tag` | `erp/erp_seam.js:104-108` |
| **the gate** (RED/ORANGE) | FSM legality + balanced-post + signed admission rules | `erp_kernel.js:251`, `ad_docfsm.js`, `erp_seam.js:88-101` |
| **foldCost** | `doc_poster.fold` (Dr=Cr postings) + `erp_postings.centMap` | `erp/doc_poster.js:21`, `erp_postings.js:43` |
| **chat == History** | `chat_lens.js` already folds `kernel_ops` rows → chat bubbles | `erp/chat_lens.js` |
| **board view** | `kanban_lens` folds `doc_status` → columns/cards (drag = `SET_STATUS` op) | `erp/kanban_lens.js` |

**So the Teams overlay ADDS to ERP only:** (a) the *collaboration view* — branch/blame tint, presence,
role×role conflict dashboard — over the existing log; (b) the *trustless facilitator/transport* for
cross-device sync (the `DistributedERP.md` "dumb post office", which is **doctrine-only today** — and is
exactly `teams/transport.js` + `teams/facilitator.js`); (c) two small hooks (subscribe + team scope).

## §1 — Seam bindings (ERP), grounded
`connectors.goLive(host)` ([[DESIGN.md]] §3) binds each seam method to real ERP code:

| seam method | ERP binding | file | note |
|---|---|---|---|
| `sign` / `verifyChain` | `KernelOps.setSigner(erp_signer)` + `KernelOps.verifyChain(db)→{ok,len,tip}` | `kernel_ops.js:600-618`, `erp_signer.js:35` | **adapter needed:** ERP's per-op signer is `sign(hashHex)→sigHex` + batch `sealChain`, not `sign(op,prev)`. Thin wrap. |
| `evaluateGate` | the `erp_seam.dispatch` ladder: `ad_docfsm` legality + balanced-post + admission `SET_RULE` thresholds | `erp_kernel.js:251`, `ad_docfsm.js:30,46`, `erp_seam.js:88-101` | "conflict" = two branches touching one doc/account, or a merged post that unbalances, or a rule-guard breach |
| `foldCost` | `doc_poster.fold` / `post_resolver.resolve` / `erp_period_close.foldBalances` | `doc_poster.js:21,45`, `post_resolver.js:60` | per-doc `grandtotal`; aggregate Σ(DR)−Σ(CR) cents |
| `subscribeOps` | **ADD** an emit on `kernel_ops.commitOp`/`commitGroup` success | `kernel_ops.js:268` | GAP-SUBSCRIBE (today it's poll-the-tip via `window.ERP.opDb`) |
| `bus` | `BroadcastChannel('bim_erp')` (rename channel + new team-message vocab) | `ad_ui.js:2695`, `connect_scene.js` | GAP-BUS-SCOPE (today carries BIM highlight events, not op-awareness) |

## §2 — The scope axis = role / team / org
ERP's partition is richer than BIM's single `discipline`:
- **who** = `ctx.actor` / `user_tag` (single-writer tag, `erp_seam.js:104`).
- **role** = `AD_Role` + `role.actions` capability set + `isShowAcct` (`idmp_session.js:237,253`).
- **org/team** = `allowOrgs` (`AD_Role_OrgAccess`, `idmp_session.js:145`); the read filter is org-scoped (`erp_seam.js:53-59`).
- **branch** = `branch_id` (already a speculative-branch column).

**Plan:** the Teams `scope` = `{ role, org }`; the `branch` = `branch_id`; the `owner` = `user_tag`. A geom-style
single-writer rule becomes: *a role/org may write its own documents; cross-role touches are annotations or require
an ordered handoff op* (= `DistributedERP.md` G-ORDERED-HANDOFF, §9-D). **GAP-PARTITION-KEY:** there is no first-class
"team" key today — introduce `scope={role,org}` and thread it through `erp_seam.read`'s filter + `dispatch`'s owner-gate.

## §3 — Op-class generalization (DESIGN §2, ERP vocabulary)
- `geom` (state-mutating, owner/role-gated) → ERP **document op**: `CREATE_DOCUMENT` · `CREATE_LINE` · `SET_STATUS`
  · `POST` · `VOID` (the `erp_kernel.applyOne` verbs, `:105-168`). The engine treats `verb`/`params` as opaque;
  **ERP supplies its own fold = `erp_kernel.replay`** (the BIM `engine.fold` is the *BIM* specialization).
- `annot` (cross-scope) → an ERP **review comment / note** on a doc (cross-role allowed; a posting is not).
- `git` (timeline mgmt) → `branch_id` create / `acceptBranchUpTo` (merge) / period checkpoint.

## §4 — The verdict ladder in ERP (DESIGN §4)
- **provisional** — an op on a speculative `branch_id` not yet accepted (Tier-1 "what if I post this").
- **verified-RED** (hard stop) — FSM-illegal transition · unbalanced POST (ΣDR≠ΣCR) · owner-gate / role-no-grant ·
  period-closed · group-torn · missing rate-as-input. (`erp_kernel.js:156,251,275`, `erp_seam.js:83,107`)
- **verified-ORANGE** (soft) — admission `rule-guard` breach: over approval limit / variance (e.g. `C_Order:CO`
  requires `GrandTotal ≤ T`, the signed `SET_RULE` threshold). (`erp_seam.js:88-101`, `kanban_host.js:90`)
- **verified-GREEN** — would commit clean.
- **stale** — branch behind the accepted tip → rebase (re-evaluate against the new tip).

## §5 — The view surfaces (reuse the shell; Dashboard is the ERP HOOK)
**Same 3-surface shell as BIM, but a DIFFERENT default — because the user counts differ (user 2026-06-30):**
BIM = *few* users per building → the Tree/canvas is primary, collaboration is a tint. **ERP = *many* users per
flow/doc → the Dashboard is primary, and that IS the hook.** When the Teams ("two-person") icon is on, it paints the
colourful overlay + the combined chat; **the Dashboard answers "how many people are involved in this flow / doc, and
who?"** — the question that matters when dozens touch one order→invoice→payment cycle.

- **Dashboard (PRIMARY for ERP) — INVOLVEMENT.** Per flow/doc: distinct **participants** (count + avatars), **per-role
  headcount**, **who's active now** (presence), and where many converge = the **bottleneck/contention** cell. Plus the
  role×role conflict matrix + approval-limit rails (`SET_RULE` thresholds) + branch freshness. `involvement(ops)` →
  `{ perDoc:{doc:{participants[],roles[],active}}, perFlow:{...}, hot:[docs with most participants] }`.
- **Chat == History — UNIFY with iDempiere's NATIVE record chat.** iDempiere already ships per-record chat
  (`CM_Chat`/`CM_ChatEntry`, surfaced as **"View Chat" + "Chat Type"** — both ALREADY in our AD menu seed,
  `erp/menu_seed.js`). So **don't reinvent**: the combined thread = (a) human **comments** = `CM_ChatEntry` rows on
  `AD_Table+Record_ID` (our `annot`/`COMMENT` op maps 1:1 → interoperable with stock iDempiere) + (b) signed **action**
  ops (created/submitted/posted) from `kernel_ops`, rendered together by `erp/chat_lens.js` (already "ERP as a
  WhatsApp/Telegram thread"). One thread per doc/flow; Teams adds verdict badge + tamper-check + presence. **Study
  `CM_Chat`/`CM_ChatEntry` schema for the comment↔op mapping.**
- **Tree** (blame-tinted World) — documents → lines (BOM-shaped), tinted by last `actor` + ladder color. Secondary in ERP.
- **Board / canvas** — **reuse `erp/kanban_lens`** (doc-status board) as the ERP analog of the BIM 3D canvas; color cards
  by the ladder + by participant-count.
- **Presence** — who's on which doc/branch now (Tier-1 heartbeats over the bus). Feeds the Dashboard involvement count.
- **Optics overlay** — the dots/avatars/post-its that paint over all of the above are the UNIVERSAL layer — see
  [[TEAM_OPTICS.md]] (shared verbatim with the BIM Modeller/Viewer). This doc only adds the ERP *bindings* (anchors =
  doc/field/screen/dashboard/flow; scope = role/org).

## §5.1 — Workflow → a "Flow" lens (process-mining), NOT a BPMN tab  (researched 2026-06-30)
iDempiere ships a real `AD_Workflow` engine (General / Document-Process / Document-Value / Manufacturing; per-node
responsible; approval hierarchy; **Workflow Activities** = a pending-task queue). But across every modern ERP,
**operational users don't work inside BPMN diagrams** — diagrams *design* a process, boards/inboxes *run* it
([[COMPETE.md]] §Workflow). Decision:
- **Keep Kanban (DocAction/Status) as the operational view** (`erp/kanban_lens.js`); do NOT add a BPMN "Workflow" tab.
- **Dashboard "Flow" tab = lightweight PROCESS-MINING over the op-log.** We already have the event log
  (`case=doc · activity=verb · actor · ts`) that Celonis/Signavio require — so for ~free we show the **actual** path
  docs take, **variants**, and **where it stalls** (the bottleneck/involvement hook, §5). `AD_Workflow` becomes the
  **"to-be" reference** for *conformance* (this doc skipped approval / looped) — a reference overlay, not a daily UI.
- **Adopt the "Activities" pattern** (SAP My Inbox · Odoo Activities · NetSuite · iDempiere Workflow Activities) as a
  **"My Work" per-role inbox** ("what's waiting for me") — a fold of the log + open docs.
- **Sequencing:** discovery-first (flow + bottleneck + involvement from the log alone, zero setup) → conformance
  (needs an `AD_Workflow` to-be) as a later slice. Keep it proportionate (a Flow lens, not a Celonis install).

## §5.2 — The Organiser (the Team tab in the Dashboard)  (user 2026-06-30)
Promote a first-class **Team tab** in the Dashboard = a filterable **360 lens** (the anti-overwhelm "unified view").
It folds three earlier asides into one surface (B-filter + C overwhelm-toggle + "Team tab like Graph"):
- **Scope filter:** `mine only` ↔ `anyone`, narrowed by **role / project / location / space** — dial from your own
  assigned items to the whole team's POV (anti-miscommunication). Same scope key as §2 (role/org + project/loc/space).
- **Multi-select charts** (mirror the existing **Graph** feature): involvement, flow/bottleneck (§5.1), presence, nudges.
- It's where **presence + POVs + broadcasts** converge. Cross-product: reuses the BIM multi-chart pattern ([[TEAM_OPTICS.md]]).
- **Broadcast:** a SystemAdmin → all/level/role **announcement** = a signed `annot` op with a `broadcast` anchor (a
  system-wide post-it). Same primitive as a sticky, wider target; surfaces in the Organiser + as a dot. (Broadcast-eligible gated.)

## §6 — Cross-device: the facilitator IS the missing ERP transport
`DistributedERP.md` (§6, §0.53-77) specifies a **serverless "dumb post office"**: accept + total-order + persist +
relay signed ops; rebuildable from the logs; business-time (not real-time) sync; ordered-handoff for ownership.
**That transport does not exist in `erp/` today (GAP-LIVE-TRANSPORT) — and it is precisely what I already built:**
- `teams/facilitator.js` (in-mem) + `teams/transport.js` (`makeHttpFacilitator` over GitHub/OCI) = the post office.
- It store-and-forwards **signed** ops, re-verifies on pull, rejects tamper + history-rewrite, converges under
  reorder/replay — i.e. it already satisfies `DistributedERP.md` G-SIGN / W-CHAIN / G-SINGLE-WRITER / determinism.
- **Plan:** point the transport's `pushOps`/`pullOps` at the ERP `kernel_ops` log (one branch per role/branch_id);
  CAS for shared masters (BPartner/Product/acctschema). The GH+OCI demo (`teams/demo/`) becomes the ERP edge demo.

## §7 — GAPs and how this plan closes them
- **GAP-SUBSCRIBE** → add `subscribeOps` emit on `kernel_ops.commitGroup` success (one line at the commit boundary).
- **GAP-BUS-SCOPE** → reuse `BroadcastChannel` with a new team vocab (`TEAM_PRESENCE`, `TEAM_OP`) distinct from the
  BIM highlight messages.
- **GAP-WRITE-WIRING** → attach the overlay to the boot that already wires the seam: **`kanban_host.js`** publishes
  `window.ERP` (dispatch/ctx/read/verify/opDb); `idempiere.html` still TODOs its `dispatch` (`:2825`). Target
  `kanban_host` first.
- **GAP-LIVE-TRANSPORT** → filled by `teams/transport.js` (§6).
- **GAP-PARTITION-KEY** → introduce `scope={role,org}` + thread through `read`/`dispatch` (§2).

## §8 — Embedding (DESIGN §5) + the icon-collision warning
- ERP is **stable / not in active dev** → unlike the modeller, a **Teams pill CAN be wired here** (when you say go).
- ⚠ **Do NOT reuse the existing red-pill.** "red-pill" is overloaded in ERP/viewer: (a) `erp/redpill.png` = the
  **Zoom-Across** cross-surface nav pill (`zoom_across.js`, key `,`); (b) `viewer/tests/poc_redpill_*` = the
  **Red-Pill Rosetta** governed-drag gate. Both are navigation/geometry, not collaboration. The Teams overlay gets a
  **distinct pill id + 2-person icon** (the "Teams" pill), mounted via `pill_builder.js`/`erp_pills.js`.
- The overlay mounts into a host container (in-frame / split-screen), `teams.html`/`gh_demo.html` style — no DOM
  entanglement; talks home over the bus + `window.ERP` seam.

## §9 — Build slices (spec-first, each witnessed; nothing built until you say go)
1. **ERP sign adapter** — `connectors.goLive` binds `sign`/`verifyChain` to `KernelOps`/`erp_signer`. Witness: an ERP
   `kernel_ops` chain verifies through the Teams connector; a tampered op is rejected. (W-ERP-SIGN)
2. **ERP fold + blame** — bind World to `erp_kernel.replay`; blame = last `actor` per doc. Witness: replay-hash
   equality + per-doc blame. (W-ERP-FOLD)
3. **ERP evaluateGate** — two speculative branches → conflict set (same-doc / unbalanced-merge / rule-guard).
   Witness: RED on unbalanced, ORANGE on over-limit, GREEN clean. (W-ERP-GATE)
4. **View binding** — treeModel/dashboardModel over ERP data; align chat with `chat_lens`. Witness: doc tree +
   role×role matrix + freshness. (W-ERP-VIEW)
5. **Facilitator sync** — push/pull `kernel_ops` over GH/OCI; CAS shared masters. Witness: remote peer pulls an ERP
   branch, verifies, replays to the same projectionHash. (W-ERP-SYNC) — reuses `teams/transport.js`.
6. **Pill + embed** — a distinct Teams pill in `kanban_host`/ERP chrome, overlay mounts in a pane. (witness: wiring)
7. **Flow lens (process-mining)** — discover the actual doc path + bottleneck + involvement from the op-log (§5.1);
   conformance vs `AD_Workflow` later. (W-ERP-FLOW)
8. **My Work inbox** — the Activities pattern: per-role "waiting for me" queue, a fold of the log + open docs. (W-ERP-MYWORK)

> **The universal OPTICS slices (dot-layer, post-it, bunch-&-share, hover-blame) live in [[TEAM_OPTICS.md]] §8** —
> built once in `teams/overlay/`, shared with BIM. **First demo (new session), discovery-first:** Dashboard-Flow
> (discovery + bottleneck + involvement, no `AD_Workflow` needed) + the cheap optics (row avatars + record
> hover-blame + post-it-on-Dashboard + bunch-&-share) + read-only general group. Each slice node-witnessed (§-log
> first), then a GH/OCI demo like `teams/demo/`. Nothing built until the new session executes.

## §10 — Invariants (already ERP doctrine — adopt verbatim)
NON-INVENT · determinism (`replay-hash == live-hash`) · single-writer (`G-SINGLE-WRITER` + ordered handoff) ·
tamper-evidence (`W-SIGN`/`W-CHAIN`) · reconciliation = double-entry ledger. The Teams overlay must not weaken any.
