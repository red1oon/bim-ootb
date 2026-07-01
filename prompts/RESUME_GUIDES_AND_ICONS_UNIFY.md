<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — RESUME: unify the TWO operate/collab sub-guides + the ONE icon set (single session)

**Scope.** ONE session does BOTH sub-guides (HR_BIM_Asset + Teams overlay) to the **same quality bar**, and
folds the Teams **facet icons** into the ONE `viewer/panels.js` ICONS registry. **Read the log after every run.**
Honour this preamble until `✅ DONE`.

> **Why one session (do NOT split).** The two guides + the icon set must read consistently, and doing them in
> parallel collides on the shared docs branch — it already happened once: Teams guide files were swept into an
> HR commit on `docs/hba-guide-rewrite` (content intact, but attribution muddled). Do both here, serially.

---

## A. The guide quality bar — apply to BOTH `docs/HRBIMAssetGuide.md` AND `docs/TeamsOverlayGuide.md`
User feedback (2026-07-01), verbatim intent — the same note was given to both guides:
1. **Genuine step-by-step navigation.** The guide must show **how the user actually reaches each screen** —
   which app/URL to open, which pill/button to click, *in order* — not "open a surface and find the pill."
   Number the clicks so a first-timer can follow without prior knowledge.
2. **Tightly-framed screenshots.** No dead space. **Crop** empty margins on 3D/building shots; **pull back**
   over-zoomed shots (the HHS avatar shot was too close to grasp context). Element-clip to the content.

Model to follow = the existing HR guide's structure (Getting started → Common tasks → Under the hood →
Troubleshooting, colour-legend tables, non-invent emphasis, watermark, back-links). Both guides already use it.

---

## B. The two guides
### B1 — HR (`docs/HRBIMAssetGuide.md`)
Live in the **Viewer** (FM/Operate pill) — real navigation exists. Screenshots `docs/img/hba_*.png`. Being
re-illustrated on branch `docs/hba-guide-rewrite`. Apply A1 (step-by-step) + A2 (reframe the too-close avatar shot).

### B2 — Teams (`docs/TeamsOverlayGuide.md`) — ALREADY WRITTEN, needs the two fixes
Task-oriented; already linked from `BIMUserGuide.md` / `ModellerGuide.md` / `ERPUserGuide.md` + `mkdocs.yml`
nav (beside HR). **Confine edits to `TeamsOverlayGuide.md` + `docs/img/teams_*.png` — the links/nav are done,
don't re-touch app guides.**

**Honest caveat (keep it):** the Teams overlay is **off-by-default and DEMO-ONLY today** (not yet wired into
the live app toolbars). So its step-by-step must navigate the **standalone demo pages** (that IS the real path
today), and Troubleshooting must keep the "no pill → use a surface where it's enabled" row. Do not imply a
shipped toolbar button.

**Screenshot sources (bim-ootb `lane/teams-overlay`, worktree `/tmp/wt-redpill`):**
- `teams/demo/teams_guide_showcase.html` — rich SAMPLE iDempiere AR page: WHO-dots + `+N` on rows, the tabbed
  Outliner (Tree/Chat/Dashboard), and the four §1b graphs. `?on=1` auto-opens the pane. Handles: `#chrome`
  (the AR rows card), `#dashcard` (the charts card). 0 console errors.
- `teams/teams.html` — the BIM-side hero (Outliner + 3D world + colour ladder). Self-boots (~1.6 s to paint).
- `teams/tests/fixtures/find_rows.html` — Storey→Rooms; call `window.__teamsPaint()` before shooting; `#find` = the card.

**Tight-capture recipe (Playwright, `deviceScaleFactor:2`, assert 0 console errors), element-clip for tight frames:**
```
// serve repo root so ../../viewer/lib/chart.umd.min.js resolves; waitForFunction('window.__teamsReady===true')
await (await pg.$('#find')).screenshot({path:'teams_find_placement.png'});      // rooms card, no margin
await (await pg.$('#dashcard')).screenshot({path:'teams_dashboard.png'});       // the 4 graphs, no pane overlap
await pg.screenshot({clip:{x:0,y:44,width:1320,height:430}});                    // AR rows + pane, tight (?on=1)
// hero: full-page shot of teams/teams.html then crop the right dark void:
//   convert teams_hero_full.png -crop 2060x1440+0+0 +repage teams_hero.png
```
Land images in **`bim-compiler docs/img/teams_*.png`** (overwrite the current wide/loose ones).

---

## C. The ONE icon set — fold the Teams facet icons into `viewer/panels.js` (this session only)
Teams overlay spec `RESUME_TEAMS_UI_CONSISTENCY.md` §R1/§2. Teams's own pill already consumes the host's
`A.icon('share')` (exists). The Find-panel **facet row** (Storey · Disc · Material · Tenancy · IoT · Teams) is
meant to be all-icons from the **ONE** registry — these agreed Lucide keys are **MISSING** and must be **ADDED**
to `viewer/panels.js` `ICONS` (additive; never fork a second set):

```js
users:  { svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', trl: null, key: null, desc: 'Tenancy' },
cpu:    { svg: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>', trl: null, key: null, desc: 'IoT' },
wrench: { svg: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', trl: null, key: null, desc: 'Disc' },
layers: { svg: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>', trl: null, key: null, desc: 'Storey' },
globe:  { svg: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>', trl: null, key: null, desc: 'Material' }
```
(`share`, `contrast`, `disciplines`, `next`, `home` already exist. Material may reuse `contrast` — a half-lit
sphere — instead of `globe`; pick one.)

> ⚠ **RECONCILE THE REGISTRY FIRST (HR session correction, §E):** there are TWO icon homes — (1) `viewer/panels.js`
> `ICONS` = the `A.icon()` Lucide set (modeller / Find-panel facets; Teams consumes `A.icon('share')` here);
> (2) the **`pill_builder` registry** = the viewer **toolbar pills** (HR's FM pill). **Toolbar pills must REUSE a
> real `pill_builder` registry glyph — NO inline SVG** — and `tests/.../test_pills_manifest.js` is the **parity
> guard** (it fails on inline/forked icons). So: for a *facet* glyph, add to `panels.js ICONS`; for a *toolbar
> pill* glyph, add/reuse in the `pill_builder` registry, never inline. The SVGs above are the agreed *shapes* —
> place each in the correct registry, then run `test_pills_manifest.js` + `action_regression.js` (zero residue,
> jsErrors=0) to prove parity. Decide the home per icon; do not paste inline SVG onto a pill.

> **Why the single (viewer/HR) session owns this, not the Teams lane:** `viewer/panels.js` + `pill_builder` are
> the HBA/viewer seam and a conflict magnet — memory `feedback_hba_teams_share_hhs_no_collision`: **the Teams lane
> must NOT touch them.** The viewer/HR session adds/reuses the glyphs; the Teams overlay consumes them at runtime.
> (The Teams lane once drifted by adding these to `panels.js` and reverted — do not repeat from the Teams side.)

---

## E. Folded-in HR session closeout (2026-07-01 — that session has CLOSED; skip its diagnosis, build on it)
**Already DIAGNOSED (do NOT re-diagnose):**
- Pills ARE built — `§PILL_BUILDER ready actions=32`; the store is **`window._mainPillActions`** (NOT `APP.`).
- **The FM/Operate gate fires TOO EARLY** — `§HBA_GATE FM=on available=[dash] (guidMap=500)`: geometry is still
  streaming, and the poll **clears its interval on first-ready so it never re-evaluates** → the pill shows only
  `dash`, the operate lenses never light. **Likely fix:** re-run `availableLenses(A)` + **rebuild the pill after
  stream-complete** (or gate on a higher `guidMap` threshold). This is the PREREQUISITE for the HR guide's
  step-by-step (users must see the real toolbar pill to know where to click).
- **Icons:** reuse a real `pill_builder` registry glyph, **no inline SVG** — `test_pills_manifest.js` is the parity
  guard; verify with `action_regression.js` (zero residue, `jsErrors=0`). (This is the §C reconciliation above.)

**Still OPEN (this unified session picks up), depends on the pill-gate fix landing first:**
- Both guides' **genuine step-by-step navigation** + **reframed/cropped screenshots** (§A). HR's need the real
  toolbar pill visible. Reframing helper already started: **`tests/live/shot_occ.js`**.

**Already DONE by HR this session (P1–P6, live + pushed — do NOT redo):** lens paints · rich multi-storey data +
tickets · GardenWorld aisle-zones · task-oriented HR guide + Spatial-ERP integration doc (deployed to gh-pages) ·
avatar-LOD · Chart.js dashboard fix. 22 witnesses green, regression clean, 0 local-only on both branches.

---

## D. Where things are
- **Teams guide spec + witnesses:** bim-ootb `lane/teams-overlay` — `prompts/RESUME_TEAMS_UI_CONSISTENCY.md`
  (R1–R6 · §1b dashboard · §3b.2 PERT gate all ✅), `teams/UI_CONSISTENCY_GUIDE.md` (the §-witness evidence map).
- **HR spec:** `prompts/RESUME_HR_BIM_ASSET.md`.
- **Docs branch:** `bim-compiler` `docs/hba-guide-rewrite` (both guides + images live here; use an isolated
  worktree, never disrupt a live shared checkout). Deploy ONLY via `scripts/safe_gh_deploy.sh` — never bare `mkdocs gh-deploy`.

---

## F. Gaps surfaced by the guide-as-E2E-testing flow (work on later)
> **The guide IS a real-user E2E test.** Writing genuine click-by-click navigation forces you to actually reach
> each screen — **if you can't write a runnable click-path to a screen, that screen isn't reachable = a gap.**
> Treat every "…once it's wired / once the pill lights" hedge in a guide as a logged defect, not prose. Gaps this
> pass exposed (each blocks a step the guide wants to write):

1. **Teams overlay is unwired in the live toolbars** (blocks the Teams guide's real step-by-step). It is
   off-by-default / demo-only — the guide currently navigates the standalone demo pages, not the product. GAP:
   mount the Teams pill into the Viewer / Modeller / ERP toolbars behind the off-by-default flag, so there is a
   real click-path ("open ERP → click the share pill → …"). Until then the guide is honest-but-not-the-product.
2. **HR FM/Operate pill-gate fires too early** (blocks the HR guide's step-by-step) — only `dash` lights; §E fix
   (re-run `availableLenses` + rebuild after stream-complete). Screenshots need the real pill visible.
3. **Icons not yet unified** — the 5 facet glyphs missing from `panels.js ICONS`; toolbar pills need a
   `pill_builder` glyph (no inline SVG, `test_pills_manifest.js` guard). §C.
4. **Smart-search → spine is unwired** (Teams `find_placement`). The engine is search-agnostic; the
   `erp/erp_search.js` FTS typeahead → spine-row selection hookup doesn't exist yet — so the guide can't show
   "search a tenant/element → jump to their team in context." GAP: wire the search entry.
5. **Modeller Role×Project pivot unwired** into `bonsai_outliner.js` (engine-ready `find_placement` design mode,
   deferred per user — no `modeller/` edits till it settles + icon go-ahead). The guide can't yet walk the
   design-side placement.
6. **Screenshots are demo-page, not live-app** (follows from #1/#2). Once the pills are wired/lit, RE-CAPTURE the
   guide shots from the real app (helper `tests/live/shot_occ.js`), so the guide shows the product not a mock.
7. **Guide-data illustration gaps** — the SAMPLE scenario renders the flow graph in raw ms (huge unreadable
   numbers → format as days/hours) and an all-green gate doughnut (seed a scenario with a real dep/resource
   conflict + an over-budget item so the gate ladder + PERT gate visibly show RED/ORANGE, not only green).

Add any NEW gap the next pass hits to this list — the guide flow is the cheapest E2E we have.

---

**Order of work (dependencies):** (1) fix the FM/Operate pill-gate so the real toolbar pill lights (§E) →
(2) reconcile + place the icons in the correct registry, parity-guarded (§C) → (3) recapture tightly-framed
screenshots WITH the real pill visible (§A/§B, helper `tests/live/shot_occ.js`) → (4) rewrite both guides as
click-by-click walkthroughs.

**Definition of done:** the FM pill lights its lenses after stream-complete (gate fix witnessed); the agreed
glyphs sit in the correct ONE registry with `test_pills_manifest.js` + `action_regression.js` green (no inline
SVG, jsErrors=0); both guides read as genuine click-by-click walkthroughs with tightly-framed screenshots;
`mkdocs` builds; deploy left to the branch owner via `scripts/safe_gh_deploy.sh`.
