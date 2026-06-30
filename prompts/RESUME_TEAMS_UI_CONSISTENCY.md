<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — RESUME: Teams overlay UI CONSISTENCY (dedicated session)

**Scope:** make every Teams overlay widget / pane / tab consistent in **schema + aesthetics** with the host
product it embeds into (BIM Viewer/Modeller `viewer/panels.js`; ERP `erp/idempiere.html` iDempiere chrome).
The Teams overlay must **speak the host's visual language, never impose its own** — that consistency IS the
universal-optics thesis (one overlay, design→operate). **Read the log after every run** (Log Mandate). Honour
this preamble until `✅ DONE` or retired. Spec-first: this file is the spec; witness before chrome.

> Triggered 2026-07-01 in the Teams design dialogue (user: "ensure the UI widgets/panes/tabs are consistent
> schema, aesthetics" + "use icons instead of labels in the Find Panel"). The data feed is already done +
> witnessed (`teams/erp/teams_embed_ops.js`, **W-EMBED-OPS 7/7**); THIS is the visual-consistency pass.

---

## 0. The audited single sources of truth (do NOT re-discover — verified 2026-07-01)
- **Icon + button factory:** `viewer/panels.js` → `A.icon(name, {size,active,title,onClick})` over the `ICONS`
  Lucide registry (`§ICON_MISS` warns on unknown). Icon-only buttons; `title` = the word-on-hover (i18n via `_TRL`).
- **Panel factory:** `viewer/panels.js` → `A.createPanel(id, {closable,content,draggable,onClose})` → `.bim-panel`
  (draggable, `.bim-panel-close` ×, pointer-isolated, focus-registered). The standard pane shell.
- **iDempiere (ERP) tokens** (`erp/` `:root`): `--idmp-bg #eef1f5 · --idmp-panel #fff · --idmp-border #cdd4de ·
  --idmp-header #1c5fa8 · --idmp-blue #1c5fa8 · --idmp-text #2b333d · --idmp-muted #6b7681 · --idmp-hover #e8f0fa
  · --idmp-sel #d6e6f7`. (Viewer side uses `.bim-panel` + dark `--panel rgba(14,20,32,.92)` + `--accent #56d6e0`.)
- **HR Find-panel idiom** (`hr_bim_asset/lens.js`): lenses = **flaticon toggles** (Lucide `users`/`cpu`), icon-only,
  **word on hover**, **active = blue band**, mirroring the existing **Storey / DISC / Phase** facets; reuses the
  panel's **search→results→zoom→popup** rails; rows under **Storey → Rooms** `{id,guid,storey,label,state,detail}`.
- **HR state→colour language** (`overlay.js` COLORS / `dashboard.js` PALETTE — reuse VERBATIM where Teams shows
  state): occupied `#2e7d32` · expiring `#f9a825` · unavailable `#8e24aa` · vacant `#9e9e9e`; aging `<1d #2e7d32 /
  1-3d #f9a825 / 3-7d #fb8c00 / >7d #c62828`.

## 1. The consistency requirements (the spec)
- **R1 — Icon, not label — for the WHOLE facet axis.** The entire Find-panel facet row is icon-driven, not just
  the Teams lens: **Storey | Disc | Material | Tenancy | IoT | Teams** are ALL Lucide glyphs from the ONE
  (⚠ **Phase is NO LONGER a Find-Panel facet** — see §1a: it was a pre-Modeller Time-Machine relic; the Modeller
  now owns the 4D Phase/5D dimension natively. Drop `Phase`/`clock` from the Viewer facet row.)
  `viewer/panels.js` `ICONS` registry — same `size`, same `title`-on-hover, same `active` blue band, one row, no
  mixed icon/text. (Existing in the registry: `disciplines`/`discMEP*` for Disc, `next` for Phase, `users`/`cpu`
  for Tenancy/IoT; ADD registry entries for **Storey** (e.g. `layers`) and **Material** if missing — never fork a
  second icon set.) Teams's toggle is a PEER icon in that same row. `teams_pill.js` already renders an icon glyph +
  hover title (✅ icon-not-label) — the remaining work is: (a) prefer `A.icon` when the host exposes it (fall back
  to the self-contained glyph only on the standalone demo), (b) use the host's active-band colour, not `#3a6df0`.
  - **Agreed icon map (user 2026-07-01, "improvise if you like" → these Lucide keys, verified vs the registry):**
    Storey `layers` (or `home`=house; `layers`=stacked-floors disambiguates from the nav Home button) · Disc
    `wrench` (spanner) · Material `contrast` (a half-lit circle = shaded 3D sphere;
    ✅ exists — true-sphere alt: add `globe`) · Tenancy `users` · IoT `cpu` · Teams `share` (collab-network,
    distinct from Tenancy `users`; ✅ exists). **Need ADDING to `viewer/panels.js` ICONS: `wrench`, `users`,
    `cpu`, and (if chosen) `layers`/`globe`** — add to the ONE registry, never fork a second set.
- **R2 — Pane = host shell.** Use `A.createPanel()` / the Find-panel pane rails; drop the bespoke fixed-right drawer
  with its own border/shadow. Reuse `.bim-panel` + `.bim-panel-close` + draggable + focus-register.
- **R3 — Tabs = ONE schema.** Unify the pane's tabs with the existing Outliner tabs (blame-Tree / Chat-is-oplog /
  Dashboard — `build/erp/branches_mock.html` + `str_walker_outliner.js`). One tab markup/class set, not a new one.
- **R4 — Tokens, never hardcode.** Consume host CSS vars. ERP map: active→`--idmp-blue`, border→`--idmp-border`,
  muted→`--idmp-muted`, panel→`--idmp-panel`, text→`--idmp-text`, hover→`--idmp-hover`, sel→`--idmp-sel`. Viewer
  map: `.bim-panel` / `--panel` / `--accent`. Hardcoded fallbacks ALLOWED only for the standalone demo page.
- **R5 — Identity vs State colour MUST be distinguishable.** The signer-hued identity dots (`dot_layer` `colorOf`)
  must NOT collide with HR's state palette (R0) — reserve a hue family or use a ring/badge so "who" never reads as
  "state." When Teams shows STATE, reuse HR's exact palette.
- **R6 — Find-panel placement (OPERATE-phase pivot — see §1a).** WHO-dots append to the SAME Storey→Rooms result
  rows, AFTER the state chip, anchored by room guid (`docOf = row => row.guid`); storey-level cluster `+N` matches
  HR's density-dot grammar. The DESIGN-phase counterpart pivots Role×Project→Element on the Modeller Outliner (same
  `dotLayerModel`, `anchorOf = element/task`). Both grouped by Role; smart-search (`erp_search.js`) is the entry.

## 1a. SETTLED ARCHITECTURE — the People dimension (resolved 2026-07-01, after a drift check)
> ⚠ **ANTI-DRIFT (root cause, do not repeat):** the 2026-07-01 drift came from anchoring Teams on
> **HHS_Office HR, which is a `Viewer.FindPanel` artifact (operate / SPACE-spine)** — while the Teams overlay's
> HOME is the **Modeller/Team side (design / PROJECT-spine)**. HHS was reached for only because it had live
> data; its space-spine is the *operate-phase projection*, NOT the universal model. **When picking up this work,
> start from the Modeller/Project spine; treat HHS/Viewer.FindPanel as the handover (operate) end, not the seed.**

The Team overlay is NOT a peer subject-pane to Tenancy/IoT and NOT nailed under Storey. It is **one
cross-cutting People dimension, grouped by ROLE** (`AD_Role` + the HR operator·vendor·personnel roles),
that cross-tabs against a **phase-dependent spine**:
- **SURFACE OWNERSHIP (refined 2026-07-01): the axis is AUTHOR vs CONSUME, not strictly time vs space.**
  - **Modeller = AUTHORING ONLY** (confined to traditional BIM authoring): creates geometry/structure AND
    **authors the 4D-Phase + 5D-cost data into the DB**. Opening a DB under the **Modeller lens reveals the deeper
    4D/5D** authoring depth. The Modeller HOSTS a **DESIGN What-If / Blue-dot History** (git branching + merge-back
    across users over the oplog `branch_id`, BLUE FUTURE — "you build that wing, I build this") — but NOT the *4D-Gantt
    Time-Machine playback* (that's the Viewer). NB the Viewer runs the SAME context-free git engine on SCHEDULE/PERT
    ops (see the THREE-TIMELINES note, ③); Blue-dot is universal, only its op-vocabulary + merge GATE are per-context.
  - **Viewer = CONSUME / HANDOFF / BACKOFFICE-ADMIN + operate.** The **Time Machine = the 4D Gantt-chart schedule
    playback specifically** (a SEPARATE timeline, tasks×calendar), and it STAYS in the Viewer, NOT the Modeller
    (decided 2026-07-01) — the user authors in the Modeller, then SWITCHES to the Viewer as the handoff/review/admin
    surface. So **`Phase` is deprecated as a Find-Panel FACET** (the pre-Modeller relic), but 4D schedule REVIEW
    lives on as the Viewer's 4D-Gantt Time Machine. The Find Panel keeps only SPACE/operate facets (Storey, Disc,
    Material) + operate lenses.
  - **THREE DISTINCT TIMELINES — DO NOT CONFLATE (clarified 2026-07-01):** ① **4D Gantt — Time Machine**
    (tasks×calendar, the construction *schedule*; Viewer playback). ② **Kernel oplog — World/History** (ops×log-order,
    who/what/when *events*; the Teams CORE — blame · World-at-T · replay; a substrate on BOTH surfaces). ③ **What-If —
    Blue dot** (git-style branches+merge over the oplog `branch_id`/BLUE FUTURE; the flagship oplog showcase,
    W-GATE-CROSS-BRANCH 11/11). **③ is CONTEXT-FREE GIT — it runs on BOTH surfaces; only the op-vocabulary + merge
    GATE differ:** Modeller = **DESIGN** branching ("you build that wing, I build this, join up"); Viewer = **SCHEDULE/
    PERT** branching ("construct this first? delay? resequence?"). The branch/merge/diff/blame machinery is UNIVERSAL
    git; the per-context plug-in is the **merge GATE** (spatial-join clash ↔ PERT dependency/resource conflict). The
    Teams World/History (②) is its OWN event timeline — NOT the 4D Gantt (①). It UNDERPINS the Blue-dot (③) on both
    surfaces and serves World-at-T review; it is not the Time Machine.
- **Design / build — 4D construction** (Modeller Outliner, `bonsai_outliner.js`; Product/Project hat; building =
  **BIM: Hospital** `C_Project 990000`) → spine = **Project → Task/Element**, team grouped by **Discipline**
  (ARC/STR/MEP crews — `disc*` icons already exist), **inherently PHASED** (the Modeller has 4D, so the construction
  matrix carries the phase axis for free). A discipline-team CUTS ACROSS zones/buildings.
- **Operate / maintain — 7D FM · IoT · the Tandem (digital-twin) handover** (Viewer Find Panel,
  `navigate_find.js`; Asset/Resource hat; building = **HHS_Office**) → spine = **Space zone (Storey → Room)**,
  team grouped by **Role** (FM operator/vendor/personnel), **phase-less** (7D = a present-state world). The role-team
  is ALIGNED to the zone it services. (This is why Storey holds operationally — confirmed.)
- **The TEAM PARTITION is itself phase-shaped: Discipline (4D construction) → Role (7D operate)** — Discipline IS
  construction's expression of "role." Both the PARTITION and the SPINE (Project↔Zone) hand over at design→operate. The
  Tandem handover is the hinge; the **World/History timeline carries the same role-team across it**
  (re-anchored from "what they designed" → "what zone they now maintain") — the cross-product continuity moat.
- **Smart search = the universal entry on BOTH surfaces** — REUSE `erp/erp_search.js` (FTS5 across all AD
  tables: C_BPartner/AD_User/M_Product/C_Project/A_Asset…, BM25 typeahead, deep-links to the AD window).
  Find any tenant/staff/device/project/element → see its role-team in the active spine's context. Do NOT rebuild.
- **Engine = one Role×Spine matrix, rendered two ways** (operate: Role×Zone; design: Role×Project) — same
  `dotLayerModel` clusters, different `anchorOf`. R6 below is the OPERATE-phase pivot specifically.

## 1b. Dashboard Graphs — Teams folds FEED iDempiere > Dashboard > Graph/s (rich info)
The Teams optics are not only a Find-panel/pill overlay — their folds can populate **native iDempiere Dashboard
graphs** exactly as HR does. **Schema to match VERBATIM = `hr_bim_asset/dashboard.js`**: pure **Chart.js config
builders** (`type:'bar'|'doughnut'|stacked-bar`) over a replayed pivot, a shared `PALETTE`, a `kpi` block, every
series value READ from the op-log (NON-INVENT — no fabricated numbers), `Date.now`-free, **watermarked** (sample
/ not-official). Add a `teams/erp/teams_dashboard.js` that returns the same config shape so the graphs drop into
`PA_DashboardContent` gadgets beside HR's. Candidate Teams graphs (each a fold already built in S5/S6/S10–S12):
- **Involvement** — bar: people-count per doc/room (`erp_optics.involvement.hot`), colour=`--idmp-blue`.
- **Flow / process-mining** — bar: avg dwell per step + bottleneck highlight (`erp_optics.flowLens`).
- **Gate ladder** — stacked bar / doughnut: verified-green / orange / red counts (`erp_optics.evaluateGate`).
- **Presence heat** — bar: active participants per storey/role over the active-window (`overlay/presence`).
- **Post-it aging** — doughnut: open annotations by age, REUSING HR's `AGE_COLORS` (one aging language).
Same palette tokens (R4), same state colours (R0), same watermark + KPI conventions → visually one dashboard.

## 2. Coordinate with the HR lane (parallel work)
The HR lane is independently moving its Find Panel to **icons instead of labels**. Align: (a) shared icon names
from the ONE `viewer/panels.js` `ICONS` registry (tenancy `users`, IoT `cpu`, pick a Teams presence glyph), and
(b) the SAME active-band colour, so both lanes match pixel-for-pixel. Do not fork a second icon set.

## ✅ STATUS — R1/R2/R4/R5 + OFF DONE (2026-07-01, lane/teams-overlay, /tmp/wt-redpill)
**W-TEAMS-UI-CONSISTENT 6/6 GREEN** (`teams/tests/ui_consistent.js`, chromium over `teams/tests/fixtures/idmp_host.html`).
The overlay now SPEAKS THE HOST LANGUAGE when a host factory is injected:
- **R1 (icon):** `teams_pill.js` takes `opts.host`; when `host.icon` exists the pill is built via `host.icon('share', …)`
  from the host's ONE registry (`share` already exists — no registry edit needed), active band = host `.active` class.
  Self-contained glyph fallback retained for the standalone demo (no host). §UI-ICON.
- **R2/R3 (pane):** when `host.createPanel` exists the pane is the host `.bim-panel` shell (closable, draggable),
  removed on close for reversibility. §UI-PANE.
- **R4 (tokens):** active band resolves `--idmp-blue`; the overlay injects NO `#3a6df0` (witness scans all sheets/inline). §UI-TOKEN.
- **R5 (dot ≠ state):** identity dot `colorOf` (hsl) ∉ HR state palette. §UI-DOTID.
- **OFF / reversible:** pixel-identical, `W-TEAM-WIRE 4/4` (demo fallback) + node suite 22/22 unregressed. §UI-OFF.
- **⚠ LANE DISCIPLINE (held):** this lane touched ONLY `teams/` — `viewer/panels.js` is the HBA/viewer seam and a
  conflict magnet; Teams CONSUMES the host factory at runtime, never edits it. (Initial drift — adding facet icons to
  `panels.js` — was caught and reverted.) The fixture self-contains only the `share` glyph the pill needs.

**↪ CROSS-LANE HAND-OFF (NOT this lane):** the R1 facet-icon ADDS (`users`/`cpu`/`wrench`/`layers`/`globe` for
Storey/Disc/Material/Tenancy/IoT) belong to the **HR/viewer Find-Panel icon-ification** (§2), which already owns
`viewer/panels.js`. Add them there, to the ONE registry — do NOT fork from the Teams lane.

## ✅ R6 DONE — Find-panel placement: ONE Role×Spine matrix, two renderings (2026-07-01)
**W-FIND-PLACEMENT 8/8** (node engine) + **W-FIND-PLACEMENT-DOM 4/4** (chromium render). New module
`teams/overlay/find_placement.js` (REUSES dot_layer — colorOf · dotLayerModel · clusterByAnchor, no fork):
- **`placementModel(ops, spine, opts)`** folds the op-log onto a spine; the SAME engine renders both pivots,
  only `anchorOf` differs (§1a) — built **design/Project-spine FIRST** (anti-drift), operate second:
  - **DESIGN** (home): Role × Project→Element, `anchorOf = element id`, parent = project/task.
  - **OPERATE** (handover): Role × Zone Storey→Rooms, `anchorOf = room guid`, parent = storey.
- **Storey rollup** = child dots re-anchored to the parent → `clusterByAnchor` → `+N` density cluster (HR's grammar).
- **By-role partition** per leaf AND parent = distinct persons per role, every name traced to an op (NON-INVENT).
- **`unplaced`** — an op whose anchor has NO spine node is reported, NEVER invented onto a row.
- **`paintFindPlacement(container, model, opts)`** (browser-only, no-op in node) appends WHO-dots AFTER the row's
  state chip + a `+N` storey-density badge, reusing the `.tcluster/.tdot/.tbadge` classes. OFF = pixel-identical.
- Fixtures: `teams/tests/fixtures/find_rows.html` (operate Storey→Rooms). Node suite 23/23. Lane-clean (teams/ only).
- **Smart-search entry (§R6 "erp_search.js is the entry") = NOT wired here** — the engine is search-agnostic; wiring
  the FTS typeahead → spine selection is a follow-on once the host Find panel exposes its row set.

## ✅ R3 DONE — tabs = ONE schema (2026-07-01)
**W-TEAMS-TABS 5/5** (chromium, schema parity with `teams.html`). The embed pane's Outliner now uses the SAME
tab markup/class set as `teams/teams.html` (the ported branches_mock Outliner) — never a second tab schema:
- **`teams/overlay/teams_tabs.js`** — the ONE tab shell: canonical `.tabs > .tab(.on)[data-t]` + `.pane#pane-<id>`
  markup (verbatim from teams.html), switch = toggle `.on` + show/hide pane (identical to teams.html's `tab()`).
  Active band resolves `--idmp-blue`/`--accent` (§R4), scoped to `.teams-pane`/`.bim-panel` (no leak). Node-testable
  `tabsModel(defs)`.
- **`teams/overlay/embed_outliner.js`** — fills the 3 canonical tabs from folds ALREADY in the embed (NON-INVENT):
  Tree = per-anchor blame (`dot_layer.recordBlame`) · Chat = the signed op-log itself · Dashboard = involvement
  (`erp_optics`). Both demo pages (`teams/demo/erp_teams_pill.html`, `teams/tests/fixtures/idmp_host.html`) call it.
- **Parity proven from source:** the witness reads teams.html's own `data-t` set and asserts the embed matches
  `[tree,chat,dash]` — not a hardcode. Switch + default-tree + OFF-pixel-identical all green.
- Unregressed: W-TEAM-WIRE 4/4 (`.pe` now under pane-dash, still resolves) · W-TEAMS-UI-CONSISTENT 6/6 · suite 23/23.
  Lane-clean (teams/ only — teams.html itself UNCHANGED; it is the reference, the shell matches it).

**↪ FOLLOW-ON (content, not schema):** the embed Tree/Chat/Dashboard reuse the blame/op-log/involvement folds;
wiring the FULL engine view-models (`teams_view.treeModel/chatModel/dashboardModel` — ladder verdicts, clash matrix,
5D budgets) into the ERP embed is a richer content pass (needs the settle/ladder result on the ERP side).

## ✅ §1b DONE — Teams Dashboard graphs (2026-07-01)
**W-TEAMS-DASHBOARD 8/8** (node). `teams/erp/teams_dashboard.js` = pure Chart.js config builders, the SAME schema
as `hr_bim_asset/dashboard.js` (type bar|doughnut · shared palette · kpi block · watermarked · no `Date.now`),
so the graphs drop into `PA_DashboardContent` gadgets beside HR's. Every series READ from a Teams fold (NON-INVENT):
- **Involvement** bar = people per doc (`erp_optics.involvement.hot`), colour `--idmp-blue`.
- **Flow** bar = avg dwell per transition, bottleneck in red (`erp_optics.flowLens`, mines DATA ops not post-its).
- **Gate ladder** doughnut = verified green/orange/red/provisional counts (`erp_optics.evaluateGate.counts`, data ops).
- **Post-it aging** doughnut = open annotations by age, REUSING HR's `AGE_COLORS` verbatim (one aging language).
- **Presence heat** bar = active participants per product (`overlay/presence`) — added ONLY when beats supplied.
- `build(ops, {asOf})` → `{ charts, kpi:{docs,people,openPostits,bottleneck,gate}, watermark }`. `asOf` defaults to
  max op ts (deterministic, never the wall clock). Read-only folds, zero erp/ edits. Suite 24/24, lane-clean.

**REMAINING (chrome, follow-on):** the Modeller Role×Project pivot — **DECISION (user 2026-07-01): KEEP ENGINE-READY,
DO NOT WIRE** (`find_placement` design mode stays unwired; no `modeller/` edits until the modeller session settles +
the Teams icon go-ahead). §3b edges 1–4 are now all settled (1 doctrine note · 2 PERT gate built · 3 partition
confirmed · 4 Project implicit). Start any future pivot from the Modeller/Project spine (§1a anti-drift), not HHS.

## 3. Witness (add before any chrome) — W-TEAMS-UI-CONSISTENT (chromium)
Over the real embed + a host fixture exposing `A.icon`/`A.createPanel` + `--idmp-*`:
1. toggle is built via `A.icon` (an `<svg>`/icon button, NOT a text node) and carries a hover `title`.
2. embed style contains NO foreign hardcoded blue (`#3a6df0`) — resolves `--idmp-blue` instead.
3. pane is a `.bim-panel` (or the host Find pane), not a bespoke drawer, when the host factory is present.
4. an identity dot colour ∉ the HR state palette set (R5).
5. OFF (default) still pixel-identical (doctrine §P① unchanged).

## 3b. OPEN edges (carried in from the 2026-07-01 design dialogue — resolve here, don't lose them)
1. **4D-Gantt is the genuine exception** — it's an authored *schedule* artifact (tasks×calendar), NOT an oplog
   projection like ②/③. Keep it visibly separate; don't force-unify it into the World/History engine.
2. ~~**The PERT merge-GATE does not exist yet**~~ **✅ DONE 2026-07-01 — `teams/pert_gate.js` (W-PERT-GATE 9/9).**
   The SCHEDULE-context twin of the spatial `teams/gate.js`, SAME shape (hint Tier-1 · settle Tier-2 red>orange>green
   · ladder staleness · matrix). Conflicts: dependency violation (finish-to-start broken, with `by`), dependency
   cycle (DFS), resource double-booking (overlapping same-resource windows). `foldSchedule` folds SCHEDULE ops
   (SCHEDULE/RESCHEDULE/SETDEP/ASSIGN/DELETE, last-writer) → tasks; deterministic, no Date.now, NON-INVENT. The
   context-free git engine + this gate = Viewer-side SCHEDULE What-If is now unblocked (wiring to a Viewer UI is the
   remaining chrome). suite 25/25, lane-clean.
3. ~~**Discipline@4D / Role@7D partition** is the working read~~ **✅ CONFIRMED (user 2026-07-01).** The team
   partition IS Discipline (4D construction) → Role (7D operate); Discipline is construction's expression of "role,"
   both partition and spine hand over at the Tandem hinge. LOCKED — do not re-litigate.
4. ~~**Project as a facet icon**~~ **✅ RESOLVED (user 2026-07-01): STAYS IMPLICIT.** Project is the design SPINE,
   not a Find-panel facet toggle — it earns NO glyph. The facet row keeps Storey/Disc/Material + operate lenses.

## 4. Doctrine (unchanged — `teams/ROADMAP.md §P`)
Additive only · Team OFF = pixel-identical · witness-first (`§`-log green before chrome) · consume-don't-impose ·
determinism + NON-INVENT. Files touched live in `teams/` + the two default-off `erp/` hooks; no new `erp/` edits.
