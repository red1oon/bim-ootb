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

### §F1 — Full navigational scaffold (docs-only, non-invent-safe) — **DONE in PR #10 follow-up commit**
The guide had per-tool click-steps but not the outer HR-guide frame. Add:
- **Getting started** — open the URL, the first three clicks (Open a building → Fit → pick a tool), what the
  four workspace regions are. (The per-tool sections already serve as *Common tasks*; the big-idea + "how it
  works" serve *Under the hood*.)
- **Troubleshooting** — a short table of the real failure modes the E2E suite actually hit and fixed
  (cut/scale vanish on seeded ARC walls → now promoted to B-rep; a mode-revealed pill that looks stranded →
  the rail re-layouts on reveal; a heavy Walk that used to freeze → now one batched commit). Frame each as
  "symptom → why → what to do", grounded in the witnessed fixes, not invented.
> **Acceptance:** `mkdocs build --strict` = 0; the guide reads Getting-started → tools → History → Toolbar →
> Troubleshooting; no fabricated claims (every troubleshooting row traces to a real §CUT-ON-ARC / SCALE-vanish
> / RAIL-STRAND / Walk-batch fix in PR #584/#585). **STATUS: shipped on `docs/modeller-guide-integrate`.**

### §F2 — Recapture frames from the LIVE app at `deviceScaleFactor:2` (needs the app — for a session that drives it)
The current 20 frames are **functional headless-swiftshader** captures from the E2E runs — correct + tight, but
not the polished live-app look the HR/Teams frames have. Recapture from the real modeller:
- Drive `viewer/modeller.html` (live or a local server) through the **same click-paths** the witnesses use,
  with `deviceScaleFactor:2` for crisp 2× frames, and re-tight-crop.
- Replace `docs/img/modeller/*.png` **in place** (same filenames → zero ref churn in `ModellerGuide.md`).
- **Non-invent:** the frame must show the *real* committed result (op-log/scene-graph agreeing) — capture it,
  never composite. If a live capture can't be produced in the environment, say so and keep the E2E frame
  (honest) rather than substitute a prettier fake.
> **Acceptance:** each replaced frame is a real 2× capture of the same asserted state; `mkdocs build --strict`
> = 0; a before/after contact sheet in the PR so a reviewer can see the upgrade. **STATUS: OPEN — needs a live
> app run; not attempted headless to avoid shipping a non-representative capture.**

### §F4 — Add `shot()` capture to the Move + Walk witnesses (needs the harness)
`witness_e2e_move.js` and `witness_e2e_walk.js` predate `e2e_harness.js` and take **no `shot()`**, so the
guide's Move/Walk sections reuse neighbouring frames. Port both onto the harness (or add `shot()` calls) and
capture `move-gizmo`, `walk-fixtures` (the Walk frame already exists; Move does not) so both sections show
their *own* asserted moment.
> **Acceptance:** both witnesses stay green with the added captures; new frames land under
> `modeller/tests/e2e_shots/` and are copied into `docs/img/modeller/`; guide embeds them. **STATUS: OPEN.**

### §F5 — Note the OPENING naming/UX inconsistency (docs-only) — **folded into §F1 Troubleshooting**
`GEOM_OPENING` has no user-facing trigger; the real "make an opening" is the **Cut** tool. The guide should not
imply a separate Opening tool. (Resolved in the guide copy; keep it that way.)

---

## CADENCE / ANTI-DRIFT
- Fresh worktree off `origin/main` for any app/witness work (`sw.js` + `modeller.html` are conflict magnets —
  KEEP-BOTH on conflict, HIGHER `CACHE_VERSION`). Test files (`modeller/tests/*`) are conflict-free.
- Docs edits (§F1, §F5) go on the **bim-compiler** `docs/modeller-guide-integrate` branch (PR #10) or its
  successor — NOT here. This prompt lives in **bim-ootb** because the frames + witnesses do.
- Deploy is the ONE outward step and the **maintainer triggers it** via `scripts/safe_gh_deploy.sh` (no-shrink
  seatbelt) — never bare `mkdocs gh-deploy`.
- Handoff record + gate history: `modeller/tests/E2E_SUITE_RESUME.md §HANDOFF-RESOLVED`.
