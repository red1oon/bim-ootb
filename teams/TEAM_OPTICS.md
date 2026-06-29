<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Team overlay — the universal OPTICS layer (BIM Modeller/Viewer **and** ERP)

> The Team ("two-person") icon turns on a **zero-footprint dot layer** over the *existing* screens — the same
> gesture, the same code, in BIM and ERP. Companion to [[DESIGN.md]] (the engine) and [[ERP_CONTEXT.md]] (the ERP
> binding). This doc is the **shared** part: optics that both products reuse. Spec-first — execution in a new session.
>
> ▶ **RESUME (new session): review → execute.** Build order in §10; nothing built yet. All optics are folds of the
> one signed op-log (cheap + tamper-evident). Hold to NON-INVENT + determinism + "Team off = pixel-identical UI".

## §1 — The model: a toggle, not a takeover
- **Off (default) → the app is pixel-identical to today.** No relayout, no new windows, no tax. (Hard rule.)
- **On → a lightweight dot layer** appears over the existing screens. Toggle is **per-user and sticky**.
- One interaction grammar: **collapsed dot → hover = readable blurb → click = action.** Detail is on-demand, so
  density stays low. This is how we beat the clutter that kills overlays.

## §2 — Two dot types, one grammar
| Dot | Looks | Hover → blurb | Click → |
|---|---|---|---|
| **Person dot** | small dot, **colour = the person** (deterministic from their signer key; initials inside as fallback) | avatar + name + **last action · timestamp** | (eligible) peek their open items, read-only |
| **Post-it dot** | tiny **pink square**, dot-sized; **faded when resolved/snoozed** | the message + **who/when pinned** (avatar) | open / resolve / reply / promote-share |

**Clutter control = fan-out.** When many dots land on one row/item, collapse to a **+N** cluster (`👤👤+6`) that fans
out on hover/click. Never a pile of overlapping dots.

**Colour = signer.** Same person → same colour everywhere, in BIM and ERP — consistent with the project rule *"every
colour = a signer key"* ([[RESUME_DISTRIBUTED_BRANCHES]] §ladder). Cross-product identity for free.

## §3 — The four optics (all folds of the signed log)
1. **Hover-blame — who/when.** Two grains, both pure folds (revive the parked specs; **delete `AD_ChangeLog`**):
   - *record grain* (`W-RECINFO`): a record-info `(i)` blurb → "who last touched this, when".
   - *field grain* (`W-FIELD-LINEAGE`): dwell ~1s on a field → reverse-chron `value · who · when` from a filtered
     log fold `(table,id,column)`. Always-on, zero setup, **zero extra writes** — the log IS the history.
2. **Row / record avatars** — a glanceable "who last touched" thumbnail at the end of a grid row. *Ambient*, not a
   click-through (complements, doesn't duplicate, the record-info / ChangeLog).
3. **Presence + peek** — person dots show who's *on an item now* (Tier-1 heartbeats); an **eligible** user clicks →
   read-only view of a peer's open items. This is the Team delta over the *solo* History timeline ("see only your own").
4. **Post-it** (§5) — the one *active* optic: an anchored note. The rest are passive awareness.

## §4 — Post-it: the personal layer that organises itself and graduates to team
Digitises the real habit (stickies on a monitor) and removes its three weaknesses — **lost / siloed / no recall**:
- **A post-it is a signed `annot` op** ([[DESIGN.md]] §2) anchored to a universal **anchor**:
  `{ kind: doc | field | screen | dashboard | flow | element, ref }`. BIM's *element* anchor and ERP's *doc* anchor
  are the **same primitive**.
- **Private-first.** Default = yours only (your monitor). It's never lost (on the log), and it **resurfaces in
  context** — a sticky on `INV-001` reappears when you open `INV-001`. (Physical stickies can't do this; this is the hook.)
- **Promote, don't re-create.** One op, escalating visibility: **private → shared (team) → bundled (digest)**.
- **Organise axes** (the power): by **anchor**, by **age** (old/new), by **status** (open/done/snoozed), by
  **@mention/follow**. The "wall" self-tidies (cluster, fade-resolved, nudge-stale).

## §5 — Share + "bunch & share" (reuse BIM's proven snag pattern)
BIM already does this — **we port the pattern, universal**:
| BIM (exists) | Universal / ERP |
|---|---|
| **share icon** (separate, per record) → shares a panel record (snapshot / Copy URL / QR) `viewer/clash_snag.js`, `helpers.js:369` | the **same** universal share icon → shares the current panel record |
| **snag** an element/clash → markup + metadata `viewer/clash_snag.js` | a **post-it** on any anchor |
| **punch-list export** (bundle of snags → Excel) `viewer/excel.js` | **bunch & share** (N post-its → one socmed digest) |
| each issue deep-links back to the element | each sticky deep-links back to its anchor |

- **Share-one** = the existing universal icon (no new icon for the common case).
- **Bunch & share** = select stickies (all / this-week / this-flow / unresolved) → one **bundle** (each = note +
  anchor + tiny snapshot + status) → push to a channel; the receiver taps an item and jumps to it (BCF-style).
- **Channels = transports** (the post office, [[DESIGN.md]] §7): the **Team feed**, **WhatsApp** (batched ops, [[ERP_CONTEXT.md]]),
  a **link/QR**. WhatsApp is just one share target, not a feature of its own.

## §5.1 — Additions (design dialogue 2026-06-30): Organiser · Broadcast · World-at-T · Work-summary
- **The Organiser** (cross-product) — a filterable **Team tab** = scope filter (`mine ↔ anyone`, by
  role/project/location/space) + multi-select charts (mirror the **Graph** feature). The *same* control governs which
  **person dots / POVs** you see — the dial from personal to whole-team (anti-overwhelm, anti-miscommunication).
  BIM filters by discipline/space; ERP by role/org/project ([[ERP_CONTEXT.md]] §5.2).
- **Broadcast anchor** — extend the anchor set (§4) with `broadcast` (target = all / level / role). An admin
  announcement is just a signed `annot` with a broadcast anchor = a system-wide sticky. (Broadcast-eligible gated.)
- **World-at-T** (the "time-travel" optic) — because `World = fold(History)`, fold a **prefix** → re-render a
  record/panel **as of any instant**: *exact + deterministic*, NOT the existing flaky view-scrubber (that restores a
  UI view). Per-record/panel first ("this doc as of T"), global later. Pairs with hover-blame (click a who/when → rewind).
- **On-the-fly work summary** — bunch-&-share's sibling: fold a flow/period → a readable digest (`what · who · when`),
  **exportable + editable**, doubling as the **replay/training script** (the step-recorder narrates it). The log → a report, free.

## §6 — Gating gradient ("eligible users")
- **Everyone** (general group, read-only): the activity feed + presence dots — see what others do.
- **Eligible roles** (team-lead / supervisor / `isShowAcct` in ERP; project role in BIM): the deeper optics — field
  lineage, peek into a peer's open items, posting amounts. Gates cleanly off the role carried in each signed op.

## §7 — Cross-product reuse (what is shared vs product-specific)
**Shared (build once, in `teams/`):** the engine ([[DESIGN.md]]: connectors / engine / gate / chatlog / protocol /
facilitator / transport), the **dot-layer view** (`teams/overlay/` — person/post-it dots, fan-out, hover-blurb,
share-bundle), the post-it `annot` op + anchor model, the gating gradient, colour-from-signer.
**Product-specific (thin binding):**
| | BIM (Modeller/Viewer) | ERP |
|---|---|---|
| scope axis | discipline / branch | role / org ([[ERP_CONTEXT.md]] §2) |
| anchor kinds | element, view, clash | doc, field, screen, dashboard, flow |
| World fold | geometry (`engine.fold`) | `erp_kernel.replay` |
| gate | `sdg_gate` (clash) | `erp_seam` (FSM/balanced/rules) |
| headline surface | Tree / 3D canvas (few users) | **Dashboard-Flow** (many users, [[ERP_CONTEXT.md]] §5) |
| existing share | `clash_snag` / punch-list | reuse the universal share icon |

## §8 — Build (cross-product, witnessed; new session)
1. **Dot-layer view** in `teams/overlay/` — person + post-it dots, fan-out `+N`, hover-blurb, off=no-op. (W-DOT-LAYER)
2. **Post-it `annot` op + anchor model** + organise axes (anchor/age/status/mention) + contextual recall. (W-POSTIT)
3. **Bunch & share** — bundle N post-its → digest; reuse the universal share sheet + the facilitator transports. (W-BUNDLE-SHARE)
4. **Hover-blame** — record (`W-RECINFO`) then field (`W-FIELD-LINEAGE`) folds; deletes `AD_ChangeLog`. (W-BLAME)
5. **Bind per product** — BIM anchors (element/view) + ERP anchors (doc/field/dashboard); ERP Dashboard-Flow as headline.
Discovery-first: ship the *cheap* optics (row avatars + record hover-blame + post-it-on-Dashboard) before field-lineage
and presence-peek. Everything off-by-default; everything a log fold.

## §9 — Invariants
NON-INVENT · determinism (no `Date.now`/`Math.random` in fold/render) · **Team off = pixel-identical UI** · single
signed log (no second system) · tamper-evidence · colour = signer. The overlay never moves the host's pixels when off.
