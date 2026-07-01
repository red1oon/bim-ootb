<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — RESUME: Modeller User Guide — finish the §F polish (review-first)

**Scope.** Bring `docs/ModellerGuide.md` (the DAGeVu Modeller user guide) to the **same quality bar** as the
HR + Teams guides, closing the §F polish gaps that were parked as *non-gating* when the guide was first
integrated. **Read the log after every run.** Honour this preamble until `✅ DONE`.

> **Non-invent is load-bearing here.** Every screenshot in this guide is a **real frame captured from a green
> `witness_e2e_*` run** — never a mock-up, never hand-edited. If a frame is missing or stale, you *capture a
> new one from the app*, you do not draw one. This is the same rule that governs the E2E suite itself
> (`modeller/tests/E2E_SUITE_RESUME.md`; memory `feedback_test_real_user_path_not_seams`).

---

## STATE — what is already DONE (do NOT redo)
- **The 12-tool real-user E2E suite is COMPLETE** (`modeller/tests/witness_e2e_*.js` + `e2e_harness.js`,
  88 assertions, 0 fail) — the data source for every guide frame. Branch `lane/modeller-e2e-suite`, PR #585.
- **The guide is INTEGRATED + coherent** — **bim-compiler PR #10** (`docs/modeller-guide-integrate` → base
  `docs/hba-guide-rewrite` @ `0967ebcdd`). It closed the three Phase-0 coherence gates:
  1. stale-base fixed (built on the live docs tip, not the pre-Teams parent);
  2. Teams cross-link restored (`§Collaborate — the Teams overlay` → `TeamsOverlayGuide.md`);
  3. orphan `ModellerUserGuide.md` deleted + nav collapsed to ONE entry (`ModellerGuide.md`).
  20 real E2E frames live under `docs/img/modeller/`; every ref resolves; `mkdocs build --strict` = 0.
- **⚠ Outward step still owned by the maintainer:** merge PR #10, then deploy via
  `ALLOW_SHRINK=1 paths="ModellerUserGuide/" scripts/safe_gh_deploy.sh` (the orphan deletion removes a live
  gh-pages page → the no-shrink seatbelt aborts unless the removal is blessed).

## THE QUALITY BAR (identical to the HR + Teams guides — see `prompts/RESUME_GUIDES_AND_ICONS_UNIFY.md §A`)
1. **Genuine step-by-step navigation** — which app/URL to open, which pill/button to click, *in order*,
   numbered so a first-timer follows without prior knowledge.
2. **Tightly-framed screenshots** — no dead space; crop 3D/building shots, pull back over-zoomed ones.
3. **The HR-guide shape** — `Getting started → Common tasks → Under the hood → Troubleshooting`, colour-legend
   tables, non-invent emphasis, watermark/back-links.

---

## §F — the polish gaps to close (each is one bounded task)

**Order:** **F1** (docs-only — DONE) → **F4** (add `shot()` to the Move/Walk witnesses, producing new frames)
→ **F2** (2× recapture — *consumes* F4's new frames, so run it last). **F5** is folded into F1. Do F1's docs
edits without any app; F4 + F2 both need the app/harness (see each task's "how to run").

> **Refs are pinned to 2026-07-01.** Branch names + PR numbers below (`lane/modeller-e2e-suite`, PR #584/#585,
> `docs/modeller-guide-integrate` = PR #10) may have merged/renamed since. If anything looks stale, re-check
> before acting: `gh pr view <n>`, `git -C ~/bim-ootb log --oneline -5 origin/main`. The *acceptance criteria*
> (below) are the durable contract — the refs are just today's pointers.

### §F1 — Full navigational scaffold (docs-only, non-invent-safe) — **DONE in PR #10 follow-up commit**
The guide had per-tool click-steps but not the outer HR-guide frame. Add:
- **Getting started** — open the URL, the first three clicks (Open a building → Fit → pick a tool), what the
  four workspace regions are. (The per-tool sections already serve as *Common tasks*; the big-idea + "how it
  works" serve *Under the hood*.)
- **Troubleshooting** — a short table of the real failure modes the E2E suite actually hit and fixed
  (cut/scale vanish on seeded ARC walls → now promoted to B-rep; a mode-revealed pill that looks stranded →
  the rail re-layouts on reveal; a heavy Walk that used to freeze → now one batched commit). Frame each as
  "symptom → why → what to do", grounded in the witnessed fixes, not invented.
**Traceability — every Troubleshooting row maps to a witnessed fix (cross-check before editing that row):**

| Guide row | Real fix | Anchor to verify |
|---|---|---|
| Cut/Scale "does nothing" on a seeded ARC wall | §CUT-ON-ARC (baked mesh → JIT B-rep box); SCALE-vanish (`foldInsert` `c.bbox` on a null catalog) | `witness_e2e_cut.js` 7/7 · `witness_e2e_scale.js` 7/7 (branch `lane/modeller-e2e-suite`, PR #585) |
| Pill stuck at top-left (mode-revealed) | RAIL-STRAND — `layoutRail()` MutationObserver re-runs on reveal | `witness_e2e_sketch.js` 8/8 · `witness_e2e_route.js` 8/8 (PR #585) |
| Walk "hangs" on a big building | IDB borrow timeout + one batched `commitSeedGroup` (112s → 2.5s) | `witness_e2e_walk.js` (PR #584, sw v25) · `disc_walker.js` |
| No "Opening" tool | `GEOM_OPENING` is a sample primitive; real path is Cut | roster item #10, `E2E_SUITE_RESUME.md` |
| Status-line strings quoted in the guide | verified against `modeller/modeller.html` `setStat(...)` | move ~L1490 `Δ(dx,dy,dz)`, scale L1551, walk L1761 (bim-compiler PR #10) |

> **Acceptance:** `mkdocs build --strict` = 0; the guide reads Getting-started → tools → History → Toolbar →
> Troubleshooting; every Troubleshooting row + every quoted status string traces to the table above (no
> fabricated claims). **STATUS: shipped on `docs/modeller-guide-integrate` (PR #10).**

### §F2 — Recapture frames from the LIVE app at `deviceScaleFactor:2` (needs the app — for a session that drives it)
The current 20 frames are **functional headless-swiftshader** captures from the E2E runs — correct + tight, but
not the polished live-app look the HR/Teams frames have. Recapture from the real modeller:
- **How to run the app:** the E2E harness already boots a static server + headless Chromium — reuse it. Run a
  witness (`node modeller/tests/witness_e2e_<tool>.js`) and, in `e2e_harness.js`, raise the page's
  `deviceScaleFactor` to `2` (viewport/launch option) so `shot()` writes crisp 2× frames. (Alternative: point a
  headed browser at the deployed `viewer/modeller.html` and capture the same click-path — but prefer the
  harness so the capture stays asserted.)
- Drive the **same click-paths** the witnesses use, and re-tight-crop.
- Replace `docs/img/modeller/*.png` **in place** (same filenames → zero ref churn in `ModellerGuide.md`).
- **Non-invent:** the frame must show the *real* committed result (op-log/scene-graph agreeing) — capture it,
  never composite.
- **⛔ If no app/harness environment is available** (sandbox with no Chromium, no server): **SKIP F2 + F4, keep
  the existing E2E frames, and say so explicitly in the PR** ("live recapture deferred — no app env; frames are
  the functional E2E captures"). Never ship a prettier fake in place of a true capture — an honest older frame
  beats an invented new one.
> **Acceptance:** each replaced frame is a real 2× capture of the same asserted state; `mkdocs build --strict`
> = 0; a before/after contact sheet in the PR so a reviewer can see the upgrade. **STATUS: OPEN — needs a live
> app run; not attempted headless to avoid shipping a non-representative capture.**

### §F4 — Add `shot()` capture to the Move + Walk witnesses (needs the harness)
`witness_e2e_move.js` and `witness_e2e_walk.js` predate `e2e_harness.js` and take **no `shot()`**, so the
guide's Move/Walk sections reuse neighbouring frames. Port both onto the harness (or add `shot()` calls) and
capture `move-gizmo`, `walk-fixtures` (the Walk frame already exists; Move does not) so both sections show
their *own* asserted moment.
> **Acceptance:** both witnesses stay green with the added captures; new frames land under
> `modeller/tests/e2e_shots/` and are copied into `docs/img/modeller/`; guide embeds them. **STATUS: ✅ DONE
> 2026-07-01** — `witness_e2e_move.js` (9/9) captures `W-E2E-MOVE-{gizmo,moved}.png`; `witness_e2e_walk.js`
> (8/8) captures `W-E2E-WALK-fixtures.png` **and** the real `#stat` line `ELEC — 267 placed across 5 storeys ·
> 0 routed` (used to correct an invented Troubleshooting string). Frames captured at `deviceScaleFactor:2`,
> canvas-cropped to the tight style, copied into `docs/img/modeller/` (`move-gizmo.png` new, `walk-fixtures.png`
> replaced in place) and embedded — bim-compiler PR #10; witness edits on `lane/modeller-e2e-suite-2`. This also
> **partially satisfies §F2**: the two new frames are already real 2× captures — only the *other 18* frames
> remain to recapture from the polished live app.

### §F5 — Note the OPENING naming/UX inconsistency (docs-only) — **folded into §F1 Troubleshooting**
`GEOM_OPENING` has no user-facing trigger; the real "make an opening" is the **Cut** tool. The guide should not
imply a separate Opening tool. (Resolved in the guide copy; keep it that way.)

---

## CADENCE / ANTI-DRIFT
- **What "read the log" means (Log Mandate):** the witnesses have **no dedicated log file** — each prints
  `§`-tagged results to **stdout**. Redirect and READ it, never trust the exit code:
  `node modeller/tests/witness_e2e_<tool>.js 2>&1 | tee /tmp/e2e_<tool>.log`. A green exit with a SKIP/`refused`
  line in the log is NOT a pass. (`mkdocs build --strict` likewise: read its output, not just the exit.)
- Fresh worktree off `origin/main` for any app/witness work (`sw.js` + `modeller.html` are conflict magnets —
  KEEP-BOTH on conflict, HIGHER `CACHE_VERSION`). Test files (`modeller/tests/*`) are conflict-free.
- Docs edits (§F1, §F5) go on the **bim-compiler** `docs/modeller-guide-integrate` branch (PR #10) or its
  successor — NOT here. This prompt lives in **bim-ootb** because the frames + witnesses do.
- Deploy is the ONE outward step and the **maintainer triggers it** via `scripts/safe_gh_deploy.sh` (no-shrink
  seatbelt) — never bare `mkdocs gh-deploy`.
- Handoff record + gate history: `modeller/tests/E2E_SUITE_RESUME.md §HANDOFF-RESOLVED`.
