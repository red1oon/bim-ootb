# ⚠ DO NOT REMOVE — UNIFY overlay pill/icons (HR FM/Operate + Teams) · additive, ZERO x-impact
**User, 2026-07-01 — deferred to a fresh session to unify with the Teams overlay session.**

## Goal
Wire the **toolbar pill + ICON** for BOTH overlays in ONE pass, the SAME way — they're both additive modules:
- **HR FM/Operate** — `lane/hr-overlay` (`/tmp/wt-hr`), `viewer/hba_lens.js` (the data-gate poll flips the `hbaFM` pill).
- **Teams** — `lane/teams-overlay` (`/tmp/wt-redpill`), self-mounts `teams_pill` but its icon is missing too.

## Diagnosis already done (don't re-derive)
- Pills ARE built: `§PILL_BUILDER ready actions=32` (viewer/`pill_builder.js` + `panels.js:1754` PillBuilder;
  `window._mainPillActions` is the store — NOT `APP._mainPillActions`).
- Constraint: additive + flag-gated, no edits to other panes. Verify with the regression driver
  `hr_bim_asset/tests/live/action_regression.js` (zero residue, jsErrors=0).

## ✅ DONE 2026-07-01 (both fixed, same session)
- **HR gate fired TOO EARLY** (`lane/hr-overlay` 3112446): `§HBA_GATE FM=on available=[dash] (guidMap=500)` —
  geometry still streaming when the poll's FIRST `guidMap` non-empty tick cleared its interval, so it never
  re-evaluated once the full model streamed in. Fixed: `viewer/hba_lens.js`'s poll now also waits for
  `A.streaming` to flip false (the real stream-complete signal, `viewer/streaming.js` `streamTick`) before
  settling `availableLenses()`. W-HBA-GATE-STREAM 4/4 (`hr_bim_asset/tests/witness_gate_stream.js`, fails
  3/4 on the pre-fix poll — confirmed via stash-diff). Full HBA-ALPHA suite 18/18 unaffected.
- **Teams icon was inline SVG, not the registry glyph** (`lane/teams-overlay` 9e46f3b): `teams_pill.js`
  already supported a host-registry icon (`opts.host.icon()`, §R1) but `erp/teams_embed.js` never passed
  one, so production always drew its own hardcoded `TEAMS_ICON` instead of `window.ICONS.share` (the same
  Lucide glyph the rest of `#idmp-pill` uses). Fixed: a minimal host adapter, used only when `window.ICONS`
  is present (production `idempiere.html` loads `icons.js` first; the plain test fixture doesn't → inline
  fallback unchanged there). W-EMBED-ICON 3/3 (`erp/tests/wire_teams_embed_icon.js`, fails on pre-fix code).
  W-EMBED-WIRE 4/4 + full teams suite 25/25 + modeller embed 4/4 unaffected.
  ⚠ Modeller's Teams pill (`modeller/teams_embed.js`) is UNCHANGED — the modeller has no icon registry at
  all (no `panels.js`/`pill_builder.js` there), so its inline SVG fallback is the legitimate off-host path
  per `teams_pill.js` §R4, not a bug. If the modeller ever grows a registry, revisit.

## Also still OPEN (guide polish — same lane, lower priority)
Rewrite `docs/HRBIMAssetGuide.md` (bim-compiler) as genuine STEP-BY-STEP navigation (open viewer → load building →
**SEE + tap the FM pill on the toolbar** → drawer → lens) and REFRAME the screenshots (building shots have ~245px
empty dark top; the avatar shot is too close — pull the camera back for context). Reframing helper started:
`hr_bim_asset/tests/live/shot_occ.js` (Box3 fit-to-building camera). *These screenshots depend on the pill/icon
fix landing first — the guide must show the real toolbar pill so users know where to click.*

## Done this session (P1–P6, all live/pushed on lane/hr-overlay)
Lens paints (instanced-tint) · rich multi-storey demo data + tickets · GardenWorld aisle-zones · task-oriented
guide + Spatial-ERP integration doc (DEPLOYED gh-pages) · avatar-LOD · Chart.js dashboard fix. 22 witnesses GREEN.
