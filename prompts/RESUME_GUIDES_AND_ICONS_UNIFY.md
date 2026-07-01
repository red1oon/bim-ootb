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

> **Why the single (viewer/HR) session owns this, not the Teams lane:** `viewer/panels.js` is the HBA/viewer
> seam and a conflict magnet — memory `feedback_hba_teams_share_hhs_no_collision`: **the Teams lane must NOT
> touch `panels.js`.** The session that already edits the viewer adds these keys; the Teams overlay just
> consumes them at runtime. (The Teams lane once drifted by adding these here and reverted — do not repeat from
> the Teams side.)

---

## D. Where things are
- **Teams guide spec + witnesses:** bim-ootb `lane/teams-overlay` — `prompts/RESUME_TEAMS_UI_CONSISTENCY.md`
  (R1–R6 · §1b dashboard · §3b.2 PERT gate all ✅), `teams/UI_CONSISTENCY_GUIDE.md` (the §-witness evidence map).
- **HR spec:** `prompts/RESUME_HR_BIM_ASSET.md`.
- **Docs branch:** `bim-compiler` `docs/hba-guide-rewrite` (both guides + images live here; use an isolated
  worktree, never disrupt a live shared checkout). Deploy ONLY via `scripts/safe_gh_deploy.sh` — never bare `mkdocs gh-deploy`.

**Definition of done:** both guides read as genuine click-by-click walkthroughs with tightly-framed screenshots;
the 5 facet icons are in the ONE registry; `mkdocs` builds; deploy left to the branch owner.
