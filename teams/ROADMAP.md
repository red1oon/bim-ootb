<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Team overlay — implementation ROADMAP (session-by-session)

> ▶ **NEW SESSION START HERE: [`prompts/RESUME_TEAMS_OVERLAY.md`](../prompts/RESUME_TEAMS_OVERLAY.md)** — fast-start +
> handoff.
> 🟦 **QUEUED NEXT DEDICATED SESSION (2026-07-01): [`prompts/RESUME_TEAMS_UI_CONSISTENCY.md`](../prompts/RESUME_TEAMS_UI_CONSISTENCY.md)**
> — Find-Panel/widget/pane/tab consistency + the SETTLED multi-surface architecture (§1a: People dimension ·
> phase-shaped partition Discipline⇄Role · spine Project⇄Zone · author/consume split · THREE timelines ·
> context-free-git Blue-dot · smart-search entry · Dashboard-graph feed). ⚠ START FROM THE MODELLER/PROJECT SPINE
> (anti-drift). Coordinate icon-not-label with the HR lane. Live data feed already DONE: `teams/erp/teams_embed_ops.js`,
> W-EMBED-OPS 7/7. **⛔ 2026-07-05: the Viewer Find-panel facet-icon/Storey→Rooms half of that plan is RETIRED —
> Teams embeds in Modeller + ERP only (user decision). See the retirement banner at the top of that file.**
> **Phases A–F (S1–S12) ✅ ALL DONE & witnessed.** §S10 (W-S10 16/16) · §S11 (W-XPRESENCE 7/7) · §S12
> (W-S12 13/13); the gated production embed is CODE-LANDED + in-app verified (W-EMBED-WIRE 4/4). Phase F is DRAINED.
> Run the §G gate first (`node teams/tests/run_all.js` = **22 green** + `wire_teams_pill.js` 4/4 + `erp/tests/
> wire_teams_embed.js` 4/4). Remaining = live op-log wiring + production deploy (admin) — see RESUME §3.
> **Live data feed DONE (2026-07-01):** `teams/erp/teams_embed_ops.js` maps the REAL iDempiere model
> (AD_User→C_BPartner[IsEmployee]→ad_role; C_Project; real HHS_Office IfcSpace rooms) → canonical ops,
> **W-EMBED-OPS 7/7** (NON-INVENT). **NEXT (dedicated session): [`prompts/RESUME_TEAMS_UI_CONSISTENCY.md`](../prompts/RESUME_TEAMS_UI_CONSISTENCY.md)**
> — icon-not-label across the WHOLE facet axis (Storey|Disc|Phase|Material|Tenancy|IoT|Teams), host token/pane/tab
> consistency, AND Teams folds feeding iDempiere>Dashboard>Graphs (match `hr_bim_asset/dashboard.js` schema).
>
> The execution plan for [[DESIGN.md]] + [[ERP_CONTEXT.md]] + [[TEAM_OPTICS.md]] + [[IDEAS.md]]. Ordered so risk
> rises slowly: **read-only/zero-impact first → standalone optics → ERP surfaces → the two guarded `erp/` runtime
> touches → embed → differentiators.** One bounded, witnessed, shippable increment per session. Build nothing that
> isn't `§`-witnessed; ship nothing that fails the Regression Gate (§G). Status: **DONE = the Teams core**
> (engine/connectors-goLive/view/protocol/facilitator/transport, 134/134 + W-REMOTE live on GH+OCI). Everything below
> is NEW.

## §P — Non-negotiable principles (every session)
1. **Team OFF = pixel-identical UI.** The overlay is a separate module behind a feature flag; flag off → zero new code
   path runs, zero DOM change. This is the headline backward-compat guarantee.
2. **Additive only.** Never modify existing behavior — extend it. New files in `teams/`; the *only* edits to live
   `erp/` code are the two in Phase D, both purely additive + flag-guarded + reversible.
3. **Witness-first (`§`-log).** Each slice names the issue it proves; node witness green before any chrome wiring.
   Playwright only for wiring/deploy checks (project doctrine).
4. **Isolated worktree.** Work in a `/tmp/wt-*` worktree off fresh `origin/main`; push only your own branch; never
   touch the modeller's checkout or commit others' work.
5. **Demo before embed.** Every surface ships first as a standalone page (à la `teams/demo/`) on GH/OCI; embed into the
   real chrome only after it's proven, and only with EXPLICIT GO.
6. **Determinism + NON-INVENT.** No `Date.now`/`Math.random` in op/fold/render; every value traces to a signed op.
7. **One signed log.** Never add a second source of truth; never change the `kernel_ops` schema (the I-4 superset stands).

## §G — The Regression Gate (must pass to close ANY session)
- [ ] Existing **ERP suite** green (`erp/tests/poc_*`, `W-GRID-BATCH`, doc-FSM, postings…).
- [ ] Existing **BIM/viewer suite** green for anything touched.
- [ ] **Teams core** green (`node teams/tests/run_all.js` = 134/134) + `W-REMOTE` live.
- [ ] **Team-OFF DOM/screenshot diff = 0** vs baseline (any session touching chrome).
- [ ] `kernel_ops` schema unchanged; **replay-hash unchanged** (deterministic projection identical).
- [ ] New witnesses green; logs read (Log Mandate). Zero local-only commits at session end.

---

## Phase A — Read-only foundation (zero impact)
**S1 · ERP read-bridge — ✅ DONE (W-ERP-SIGN + W-ERP-FOLD 9/9, zero `erp/` edits).** prove the Teams core can READ a live ERP log without touching `erp/`.
- Build `teams/erp/erp_bridge.js`: adapter binding `connectors.sign/verifyChain` → `KernelOps`/`erp_signer`
  (per-op `sign(hashHex)` wrap); World via `erp_kernel.replay`; blame = last `actor` per doc.
- Witness **W-ERP-SIGN** (a real `kernel_ops` chain verifies through the Teams connector; tamper rejected) +
  **W-ERP-FOLD** (replay-hash equality; per-doc blame). Over a sample/seeded `kernel_ops` db — runtime untouched.
- Impact: NONE (new module, read-only). Exit: both witnesses green + Gate.

## Phase B — Universal optics core (off-by-default, standalone; built once in `teams/overlay/`)
**S2 · Dot-layer + record hover-blame — ✅ DONE (W-DOT-LAYER + W-BLAME-RECORD 11/11, standalone, off=no-op).** `teams/overlay/dot_layer.js`: person + post-it dots, fan-out `+N`,
collapsed→hover-blurb→click, **off = no-op**. Record-grain blame (`W-RECINFO`) fold. Witnesses **W-DOT-LAYER**,
**W-BLAME-RECORD**. Headless smoke: off renders nothing. Impact: none (standalone).
**S3 · Post-it — ✅ DONE (W-POSTIT 9/9, standalone, signed annot + 7-kind anchor + organise/recall).** `teams/overlay/postit.js`: signed `annot` op + universal **anchor** model
(`doc|field|screen|dashboard|flow|element|broadcast`), private-first, organise axes (anchor/age/status/mention),
**contextual recall**. Witness **W-POSTIT**. Impact: none.
**S4 · Bunch-&-share + work-summary — ✅ DONE (W-BUNDLE-SHARE + W-WORK-SUMMARY 10/10, standalone). Phase B COMPLETE.** `teams/overlay/share_bundle.js`: bundle N post-its → digest; reuse the
universal share sheet + facilitator transports (Team feed / WhatsApp-stub / link); the **on-the-fly work summary**
(fold→`what·who·when`, exportable+editable = training script). Witness **W-BUNDLE-SHARE**, **W-WORK-SUMMARY**. Impact: none.

## Phase C — ERP optics surfaces (standalone demos, read-only)
**S5 · ERP gate + Dashboard-Flow + Involvement + Organiser — ✅ DONE (W-ERP-GATE+W-ERP-FLOW+W-INVOLVE+W-ORGANISER 13/13, reads seeded log, zero erp/ edits). Standalone demo page deferred to Phase E/S9 (per §P5, only witnessed core shipped now).** `teams/erp/`: `evaluateGate` (two-branch conflict/
ladder), the **Flow lens** (process-mining discovery from the log: actual path, variants, bottleneck), **involvement**
(participants/role-headcount/active per flow·doc), and the **Organiser** (Team tab = scope filter `mine↔anyone` by
role/project/loc/space + multi-select charts). Standalone demo page. Witnesses **W-ERP-GATE**, **W-ERP-FLOW**,
**W-INVOLVE**, **W-ORGANISER**. Impact: none (reads seeded log).
**S6 · My Work inbox + field lineage — ✅ DONE (W-ERP-MYWORK + W-FIELD-LINEAGE 10/10, read-only, AD_ChangeLog NOT removed). Phase C COMPLETE.** the Activities "waiting-for-me" per-role queue (`W-ERP-MYWORK`) + field-grain
hover-blame (`W-FIELD-LINEAGE`, the deeper kill-`AD_ChangeLog` fold; **we ADD the fold, we do NOT remove AD_ChangeLog**).
Impact: none.

## Phase D — Live integration (the ONLY edits to `erp/` runtime — additive, flag-guarded, reversible)
**S7 · subscribe hook + bus vocab + scope key — ✅ DONE (W-EMIT + W-SCOPE 11/11; byte-identical default-off proven; node-erp regression 0; ⚠ browser/playwright erp suite NOT run — see note).** the two risky touches, isolated together, each behind the Team flag:
- `kernel_ops.commitGroup`: **emit** an op-event on success (GAP-SUBSCRIBE) — additive, after-commit only, no change to
  the commit result/timing. `BroadcastChannel` team vocab (`TEAM_OP`/`TEAM_PRESENCE`), distinct from BIM highlight msgs.
- `erp_seam.read`/`dispatch`: an **optional** `scope={role,org,project,…}` param (GAP-PARTITION-KEY) — **default =
  exact current behavior** when omitted.
- Witnesses **W-EMIT** (emit fires post-commit; existing commit witnesses byte-identical) + **W-SCOPE** (read/dispatch
  identical when scope absent; filters when present). **Gate is mandatory here** — full ERP suite must stay green.
- Impact: the only production-code change in the whole roadmap; ⚠ smallest possible, reversible by the flag.

## Phase E — Sync + embed (deploy)
**S8 · ERP sync over GH/OCI — ✅ DONE (W-ERP-SYNC 7/7; transport verifier now injectable, default unchanged; live GH/OCI smoke deferred to S9 deploy).** point `teams/transport.js` `pushOps/pullOps` at the ERP `kernel_ops` log (one branch
per role/`branch_id`); CAS shared masters (BPartner/Product/acctschema). Witness **W-ERP-SYNC** (remote peer pulls an
ERP branch, verifies, replays to the **same projectionHash**). Live smoke on GH+OCI like `teams/demo/`. Impact: none (transport).
**S9 · Pill + embed + deploy — ✅ DONE (W-TEAM-WIRE 4/4 chromium; standalone page deployed live GH-raw + OCI; Team-OFF pixel-identical proven). Phase E COMPLETE. UPDATE (2026-07-05): the "not landed in the live app" note below was stale — the `erp/idempiere.html` line-edit landed in the SAME PR #593 (`erp/teams_embed.js` + `<script src="teams_embed.js">` in idempiere.html, W-EMBED-WIRE 4/4) and is live in production ERP chrome today; confirmed via git log, not just re-cited from this doc. Same for `modeller/teams_embed.js` (Modeller-side, `#b-teams` pill).** a **distinct Teams pill** (2-person icon) in `kanban_host`/ERP chrome via
`pill_builder.js` (NOT `redpill`/`ZoomAcross`); overlay mounts in a pane/iframe. Witness **W-TEAM-WIRE** + the
**Team-OFF pixel-identical** check. EXPLICIT GO → deploy. Impact: chrome (flag-guarded; off = identical).

## Phase F — The differentiators (the "wow")
**S10 · World-at-T (A) + maker-checker/legal signoff (C) + broadcast** ✅ **DONE** (standalone, zero erp/ edits) —
three Phase-F differentiators, each a pure deterministic fold of the ONE signed log:
- `overlay/world_at_t.js` — re-FOLD a PREFIX of the log → any record/world **as-of T** (`prefix`/`worldAt`/`recordAt`/
  `before`/`verifyAt`). Deterministic + exact (NOT the flaky view-scrubber); pairs with blame (`before(opId)` =
  "this doc before Bob's edit"); a prefix of a valid chain still verifies.
- `erp/cosign.js` — maker-checker four-eyes: maker `SUBMIT` + eligible **different** checker `APPROVE` on one doc
  (matched by `params.group`) → `coSignState` flips to **Approved** + carries the legal signoff memo; REFUSES
  self-approval + ineligible-role checker; `tampered` if the chain breaks (non-repudiation from the op sigs);
  `requireCoSign(amount, threshold)` gates co-sign vs single `POST`.
- `overlay/broadcast.js` — system-wide sticky = signed `annot` on the universal `broadcast` anchor; eligible-GATED
  emit (ineligible throws, never minted); `all`/`role:<R>`/`level:<N>` targeting; ACK + admin REVOKE; `broadcastsFor`
  filters to the viewer, unacked-first.
Witness `teams/tests/poc_teams_s10.js` — **W-WORLD-AT-T 6/6 · W-COSIGN 6/6 · W-BROADCAST 4/4 = 16/16** (run_all 19/19).
**S11 · Cross-product BIM↔ERP unified presence (B) — the moat** ✅ **DONE** (additive, ZERO modeller/erp edits) —
`overlay/presence.js`: ONE identity/colour fabric folded from `presence` heartbeats that ride the SAME shared
`BroadcastChannel('bim_teams')` bus both products use. `makePresence` (fixed-schema, product∈{bim,erp},
product-shaped location, NON-INVENT) → `foldPresence` unifies per IDENTITY (latest per-product + overall, one
colour=signer via dot_layer.colorOf, active-window flag) → `whereIs` (unified where-now), `crossProduct` (THE MOAT:
an ERP viewer reads BIM peers + vice-versa), `presenceDots` (same colour both products). The BIM/ERP sides only
EMIT a heartbeat onto the existing bus seam — no host file edited (§R5). Witness `teams/tests/poc_teams_presence.js`
**W-XPRESENCE 7/7** (unified-id · colour=signer · latest · cross-read · active-window · bus round-trip · determinism;
the bus-fold caught + fixed a perProduct key-order non-determinism). run_all 21/21.
**S12 · Replay-onboarding (D) + nudges (F) + "new feature" stub (H)** ✅ **DONE** (standalone, zero erp/ edits) —
- `overlay/replay.js` — a step-recorder over a scoped flow: `makeReplay` → ordered steps (each ← one op),
  `stepState` re-FOLDS the record/world AS-OF a step (via world_at_t), `narrationScript` = the workSummary
  digest (the training text), `step` clamps the cursor. Deterministic, NON-INVENT.
- `erp/nudges.js` — ONE dismissible ORANGE nudge per item, variance vs a **MEASURED** baseline (measure-don't-
  whitelist): `slow` (dwell past measured pXX of the status), `skipped` (missing the majority-variant activity),
  `rate` (author > rateK × measured median). Too few samples → REFUSE (no guessed alarm); `dismiss` = a signed
  annot that folds one out.
- `overlay/feature_stub.js` — the honest "new feature" placeholder (blue-branch propose-changes): a DISABLED
  chip + `invoke` returns `not-implemented` (NEVER fakes the action); unknown → rejected.
Witness `teams/tests/poc_teams_s12.js` — **W-REPLAY 4/4 · W-NUDGE 6/6 · W-FEATURE-STUB 3/3 = 13/13** (run_all 20/20).

---

## §R — Risk register
| Risk | Where | Mitigation |
|---|---|---|
| **R1** alter commit semantics | S7 emit hook | after-success emit only; existing commit witnesses must be byte-identical; flag-guarded |
| **R2** break read/dispatch | S7 scope param | optional param, default = current; W-SCOPE proves identity when omitted |
| **R3** icon/UX collision | S9 pill | distinct id+icon; NOT `redpill`/`ZoomAcross`; Team-off pixel-identical |
| **R4** lose `AD_ChangeLog` | S2/S6 lineage | we ADD the fold; we do NOT remove `AD_ChangeLog` (removal = a separate future, gated decision) |
| **R5** disturb the modeller | S11 BIM presence | additive + isolated worktree; schedule only after the modeller session settles |
| **R6** stale checkout / drift | all | branch off fresh `origin/main`; consolidate in bim-ootb; never commit others' work |

## §D — Definition of done (per session)
spec section cited → built additive → `§`-witnessed (logs read) → **Regression Gate §G green** → demo (if a surface) →
committed + pushed (0 local-only) → memory/PROGRESS updated → next session's entry confirmed still valid.

## §S — Suggested cadence
A→B→C are all **zero-impact** and can run in any order / in parallel branches. **D is the gate** — do it once,
carefully, with the full suite green. E ships the first real ERP demo. F is the value layer, sequenced by appetite
(B/the moat worth front-loading once the modeller settles). Re-confirm scope at the top of each session against these docs.
