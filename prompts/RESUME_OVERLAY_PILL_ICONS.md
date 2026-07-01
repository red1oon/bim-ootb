# ⚠ DO NOT REMOVE — UNIFY overlay pill/icons (HR FM/Operate + Teams) · additive, ZERO x-impact
**User, 2026-07-01 — deferred to a fresh session to unify with the Teams overlay session.**

## Goal
Wire the **toolbar pill + ICON** for BOTH overlays in ONE pass, the SAME way — they're both additive modules:
- **HR FM/Operate** — `lane/hr-overlay` (`/tmp/wt-hr`), `viewer/hba_lens.js` (the data-gate poll flips the `hbaFM` pill).
- **Teams** — `lane/teams-overlay` (`/tmp/wt-redpill`), self-mounts `teams_pill` but its icon is missing too.

## Diagnosis already done (don't re-derive)
- Pills ARE built: `§PILL_BUILDER ready actions=32` (viewer/`pill_builder.js` + `panels.js:1754` PillBuilder;
  `window._mainPillActions` is the store — NOT `APP._mainPillActions`).
- HR gate fires TOO EARLY: `§HBA_GATE FM=on available=[dash] (guidMap=500)` — geometry still streaming, so only
  `[dash]` is available at gate time. The poll in `hba_lens.js` clears its interval on FIRST ready → it never
  re-evaluates once the full model has streamed. Likely fix: re-run `availableLenses(A)` + rebuild the pill after
  stream-complete (or gate on a higher guidMap threshold), so the FM pill shows with its icon + all lenses.
- Icons come from the pill_builder registry (`pills.json` + panels.js icon set); the overlays must reuse a real
  registry glyph (no inline SVG) — see `viewer/tests/test_pills_manifest.js` (the parity guard).
- Constraint: additive + flag-gated, no edits to other panes. Verify with the regression driver
  `hr_bim_asset/tests/live/action_regression.js` (zero residue, jsErrors=0).

## Also still OPEN (guide polish — same lane, lower priority)
Rewrite `docs/HRBIMAssetGuide.md` (bim-compiler) as genuine STEP-BY-STEP navigation (open viewer → load building →
**SEE + tap the FM pill on the toolbar** → drawer → lens) and REFRAME the screenshots (building shots have ~245px
empty dark top; the avatar shot is too close — pull the camera back for context). Reframing helper started:
`hr_bim_asset/tests/live/shot_occ.js` (Box3 fit-to-building camera). *These screenshots depend on the pill/icon
fix landing first — the guide must show the real toolbar pill so users know where to click.*

## Done this session (P1–P6, all live/pushed on lane/hr-overlay)
Lens paints (instanced-tint) · rich multi-storey demo data + tickets · GardenWorld aisle-zones · task-oriented
guide + Spatial-ERP integration doc (DEPLOYED gh-pages) · avatar-LOD · Chart.js dashboard fix. 22 witnesses GREEN.
