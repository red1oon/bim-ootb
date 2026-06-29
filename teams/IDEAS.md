<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Team overlay — ideas worth considering (Claude's proposals)

> NOT committed scope — a menu for the user to accept/reject in the review session. Each is rated for *fit*
> (how native it is to the signed-log architecture: World=fold(History), signed ops, deterministic, non-invent)
> and *effort*. The good ones are nearly free **because we keep one signed op-log** — features other ERPs bolt
> on, we fold. Companions: [[DESIGN.md]] · [[ERP_CONTEXT.md]] · [[TEAM_OPTICS.md]].

## A. Time-travel "World at T" — scrub any screen to any moment ★★ (fit: native · effort: low)
Because `World = fold(History)`, folding a **prefix** of the log renders any screen *as it was* at any instant — or
*as a peer's branch sees it*. A time handle in Team mode: drag → the grid/Dashboard re-folds to that instant. "Show
this invoice before Bob's edit." Pairs with hover-blame: click a "who/when" → rewind there. (BIM already has a
time-machine; this is the same fold, ported.) Quick win.

## B. Cross-product unified presence — BIM ↔ ERP, one signer fabric ★★★ (fit: native · effort: medium)
Colour = signer is universal, and both products ride the **same bus + facilitator**. So a person's dot can read
"Alice is in the Viewer on Level 3" *while you're in ERP*, and vice-versa. One presence/awareness fabric across the
**whole suite** — the QS costing in ERP and the engineer in the model see each other. **Nobody has unified BIM+ERP
presence.** This is a genuine moat, not a me-too feature.

## C. Maker-checker co-sign — segregation of duties from the crypto we already have ★★ (fit: native · effort: low)
A high-value `POST`/approval can require **two signatures** recorded as two signed ops on one group hash. Native
maker-checker / four-eyes — an audit/compliance staple — for almost free, enforced by the gate ladder + eligible-role
gating. Strong selling point for finance.

## D. Replay-as-onboarding — "watch how this was done", always current ★★ (fit: native · effort: low-med)
The log is a deterministic event stream, so a newbie can **replay a real completed flow** step-by-step, narrated by
the chat-is-log ("here's how last month's credit memo was processed"). Training that's never stale because it's the
real history, not a manual. Directly serves your "signal/teach newbies" goal.

## E. Post-it → soft-task → formal handoff — bottom-up workflow ★★ (fit: native · effort: medium)
A post-it like "@Bob please approve" pinned to a doc is a **soft task**. If acted on, it can graduate into a real
Activity / ordered-handoff op. The team's *informal* coordination (stickies/@mentions) becomes the de-facto process —
which the Flow lens (process-mining) then reveals. The informal layer feeds the formal one; no upfront BPMN needed.

## F. Deterministic nudges — "stuck / unusual", measured not guessed ★ (fit: native · effort: medium)
Per-item orange nudges from log folds + measured baselines (NON-INVENT, measure-don't-whitelist): "this PO sat in
*submitted* 9d (p95 = 2d)", "this doc skipped the usual approver", "Carol posted 3× her daily norm". Variance vs a
measured baseline, not ML. The proactive half of the Flow lens (§5.1).

## G. Compliance bundle = signed export — the audit trail IS the log ★ (fit: native · effort: low)
The op-log is already tamper-evident + replayable (= the audit trail, `ERP.md`). A "compliance bundle" = a
sign-verified export of a flow's full history for an auditor — deterministic, no separate audit subsystem. Rides the
**bunch-&-share** sheet ([[TEAM_OPTICS.md]] §5). Pairs naturally with C (co-sign).

## H. Blue-branch "propose changes" — a PR for ERP docs ★★ (fit: native · effort: medium)
`branch_id` (speculative "blue" branches) already exists. A user drafts changes on a blue branch; the team sees them
as **provisional** (dashed ladder); the owner **accepts** → folds in. "Propose changes" like a GitHub PR, for ERP
documents — the draft-vs-craft model ([[RESUME_DISTRIBUTED_BRANCHES]]) applied to ERP. Powerful, but bigger; later.

---
### My pick if we want maximum signal for minimum build
**A (time-travel scrub)** + **C (co-sign)** + **D (replay-onboarding)** are all *low effort + native + demo-friendly*,
and **B (unified BIM↔ERP presence)** is the one true moat worth investing in. F/G/H are strong follow-ons.

---
## User verdicts + net-new concepts (design dialogue 2026-06-30)
**All accepted.** A (clarified) · B (clarified) · C (+broadcast +legal signoff) · D · E (folds into Organiser) ·
F (guarded) · G (upgraded) · H (stub now).

**Three net-new concepts — promoted to spec:**
- **The Organiser = the Team tab in the Dashboard** — a filterable 360 lens (scope filter `mine ↔ anyone` by
  role/project/location/space + multi-select charts like the Graph feature). Unifies B's filter + C's overwhelm-toggle
  + the Team-tab idea. → [[ERP_CONTEXT.md]] §5.2, [[TEAM_OPTICS.md]] §5.1.
- **Broadcast** — admin → all/level/role announcement = a signed `annot` with a `broadcast` anchor (system-wide sticky).
- **On-the-fly work summary** (G+D) — fold a flow/period → readable digest (what·who·when), exportable + editable,
  doubles as the training/replay script. "Summary of work done on the fly."

**Clarifications:**
- **A** = re-FOLD data "as of T" (exact, deterministic) — NOT the existing flaky view-scrubber. Per-record/panel first.
- **C** = app-level **signoff** flips `docStatus→Approved` + carries office legality (confirmed memo, saves paperwork);
  non-repudiation from the op signature; real PKI optional later.
- **F** = ONE clear orange nudge per item, dismissible (never a wall).
- **H** = a visible "new feature" placeholder stub now; build later.
