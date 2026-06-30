<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Team overlay — implementation ROADMAP (session-by-session)

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
**S3 · Post-it** — `teams/overlay/postit.js`: signed `annot` op + universal **anchor** model
(`doc|field|screen|dashboard|flow|element|broadcast`), private-first, organise axes (anchor/age/status/mention),
**contextual recall**. Witness **W-POSTIT**. Impact: none.
**S4 · Bunch-&-share + work-summary** — `teams/overlay/share_bundle.js`: bundle N post-its → digest; reuse the
universal share sheet + facilitator transports (Team feed / WhatsApp-stub / link); the **on-the-fly work summary**
(fold→`what·who·when`, exportable+editable = training script). Witness **W-BUNDLE-SHARE**, **W-WORK-SUMMARY**. Impact: none.

## Phase C — ERP optics surfaces (standalone demos, read-only)
**S5 · ERP gate + Dashboard-Flow + Involvement + Organiser** — `teams/erp/`: `evaluateGate` (two-branch conflict/
ladder), the **Flow lens** (process-mining discovery from the log: actual path, variants, bottleneck), **involvement**
(participants/role-headcount/active per flow·doc), and the **Organiser** (Team tab = scope filter `mine↔anyone` by
role/project/loc/space + multi-select charts). Standalone demo page. Witnesses **W-ERP-GATE**, **W-ERP-FLOW**,
**W-INVOLVE**, **W-ORGANISER**. Impact: none (reads seeded log).
**S6 · My Work inbox + field lineage** — the Activities "waiting-for-me" per-role queue (`W-ERP-MYWORK`) + field-grain
hover-blame (`W-FIELD-LINEAGE`, the deeper kill-`AD_ChangeLog` fold; **we ADD the fold, we do NOT remove AD_ChangeLog**).
Impact: none.

## Phase D — Live integration (the ONLY edits to `erp/` runtime — additive, flag-guarded, reversible)
**S7 · subscribe hook + bus vocab + scope key** — the two risky touches, isolated together, each behind the Team flag:
- `kernel_ops.commitGroup`: **emit** an op-event on success (GAP-SUBSCRIBE) — additive, after-commit only, no change to
  the commit result/timing. `BroadcastChannel` team vocab (`TEAM_OP`/`TEAM_PRESENCE`), distinct from BIM highlight msgs.
- `erp_seam.read`/`dispatch`: an **optional** `scope={role,org,project,…}` param (GAP-PARTITION-KEY) — **default =
  exact current behavior** when omitted.
- Witnesses **W-EMIT** (emit fires post-commit; existing commit witnesses byte-identical) + **W-SCOPE** (read/dispatch
  identical when scope absent; filters when present). **Gate is mandatory here** — full ERP suite must stay green.
- Impact: the only production-code change in the whole roadmap; ⚠ smallest possible, reversible by the flag.

## Phase E — Sync + embed (deploy)
**S8 · ERP sync over GH/OCI** — point `teams/transport.js` `pushOps/pullOps` at the ERP `kernel_ops` log (one branch
per role/`branch_id`); CAS shared masters (BPartner/Product/acctschema). Witness **W-ERP-SYNC** (remote peer pulls an
ERP branch, verifies, replays to the **same projectionHash**). Live smoke on GH+OCI like `teams/demo/`. Impact: none (transport).
**S9 · Pill + embed + deploy** — a **distinct Teams pill** (2-person icon) in `kanban_host`/ERP chrome via
`pill_builder.js` (NOT `redpill`/`ZoomAcross`); overlay mounts in a pane/iframe. Witness **W-TEAM-WIRE** + the
**Team-OFF pixel-identical** check. EXPLICIT GO → deploy. Impact: chrome (flag-guarded; off = identical).

## Phase F — The differentiators (the "wow")
**S10 · World-at-T (A) + maker-checker/legal signoff (C) + broadcast** — per-record fold-to-T (deterministic, distinct
from the flaky view-scrubber); two-signature `POST`/`Approve` carrying office legality (flips `docStatus→Approved`,
non-repudiation from the op sig); broadcast = signed `annot` w/ broadcast anchor. Witnesses **W-WORLD-AT-T**,
**W-COSIGN**, **W-BROADCAST**.
**S11 · Cross-product BIM↔ERP unified presence (B) — the moat** — one presence/identity fabric over the shared
bus+facilitator; colour=signer across both products; a person's dot reads across BIM↔ERP. ⚠ touches BIM-side — additive
+ isolated, **only when the modeller has settled** (coordinate). Witness **W-XPRESENCE**.
**S12 · Replay-onboarding (D) + nudges (F) + "new feature" stub (H)** — step-recorder replay narrated by the work
summary; ONE dismissible deterministic nudge per item (variance vs measured baseline); a visible **"new feature"**
placeholder stub for blue-branch "propose changes / PR for docs". Witnesses **W-REPLAY**, **W-NUDGE**.

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
