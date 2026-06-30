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
  the Teams lens: **Storey | Disc | Phase | Material | Tenancy | IoT | Teams** are ALL Lucide glyphs from the ONE
  `viewer/panels.js` `ICONS` registry — same `size`, same `title`-on-hover, same `active` blue band, one row, no
  mixed icon/text. (Existing in the registry: `disciplines`/`discMEP*` for Disc, `next` for Phase, `users`/`cpu`
  for Tenancy/IoT; ADD registry entries for **Storey** (e.g. `layers`) and **Material** if missing — never fork a
  second icon set.) Teams's toggle is a PEER icon in that same row. `teams_pill.js` already renders an icon glyph +
  hover title (✅ icon-not-label) — the remaining work is: (a) prefer `A.icon` when the host exposes it (fall back
  to the self-contained glyph only on the standalone demo), (b) use the host's active-band colour, not `#3a6df0`.
  - **Agreed icon map (user 2026-07-01, "improvise if you like" → these Lucide keys, verified vs the registry):**
    Storey `layers` (or `home`=house; `layers`=stacked-floors disambiguates from the nav Home button) · Disc
    `wrench` (spanner) · Phase `clock` (✅ exists) · Material `contrast` (a half-lit circle = shaded 3D sphere;
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
- **R6 — Find-panel placement.** WHO-dots append to the SAME Storey→Rooms result rows, AFTER the state chip,
  anchored by room guid (`docOf = row => row.guid`); storey-level cluster `+N` matches HR's density-dot grammar.

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

## 3. Witness (add before any chrome) — W-TEAMS-UI-CONSISTENT (chromium)
Over the real embed + a host fixture exposing `A.icon`/`A.createPanel` + `--idmp-*`:
1. toggle is built via `A.icon` (an `<svg>`/icon button, NOT a text node) and carries a hover `title`.
2. embed style contains NO foreign hardcoded blue (`#3a6df0`) — resolves `--idmp-blue` instead.
3. pane is a `.bim-panel` (or the host Find pane), not a bespoke drawer, when the host factory is present.
4. an identity dot colour ∉ the HR state palette set (R5).
5. OFF (default) still pixel-identical (doctrine §P① unchanged).

## 4. Doctrine (unchanged — `teams/ROADMAP.md §P`)
Additive only · Team OFF = pixel-identical · witness-first (`§`-log green before chrome) · consume-don't-impose ·
determinism + NON-INVENT. Files touched live in `teams/` + the two default-off `erp/` hooks; no new `erp/` edits.
