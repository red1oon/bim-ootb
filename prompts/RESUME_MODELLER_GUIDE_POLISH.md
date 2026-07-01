<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — RESUME: Modeller User Guide — the last gap is §F2 (uniform 2× recapture)

**Scope.** Bring `docs/ModellerGuide.md` (the DAGeVu Modeller user guide) to the **same quality bar** as the
HR + Teams guides, closing the §F polish gaps that were parked as *non-gating* when the guide was first
integrated. **Read the log after every run.** Honour this preamble until `✅ DONE`.

> **Non-invent is load-bearing here.** Every screenshot in this guide is a **real frame captured from a green
> `witness_e2e_*` run** — never a mock-up, never hand-edited. If a frame is missing or stale, you *capture a
> new one from the app*, you do not draw one. This is the same rule that governs the E2E suite itself
> (`modeller/tests/E2E_SUITE_RESUME.md`; memory `feedback_test_real_user_path_not_seams`).

---

## §RESUME — START HERE (new session)
**Status:** F1 ✅ · F4 ✅ · F5 ✅ (folded). **ONE substantive gap remains — §F2**: bring *all* guide frames to a
single polished 2× standard (spec'd below with its decisions + work-list). Everything else is merge + deploy,
owned by the maintainer (see `## MERGE / DEPLOY`).

**First moves, in order:**
1. **Sync + locate.** `git -C ~/bim-compiler fetch origin` then `gh pr view 10` — if PR #10 merged, branch §F2
   work off the merged tip; else off `origin/docs/modeller-guide-integrate`. Confirm the witness edits landed:
   `gh pr view 585` / bim-ootb `lane/modeller-e2e-suite-2`.
2. **Study the two DONE examples as the template.** The `shot()` + crop pattern in
   `witness_e2e_{move,walk}.js` (bim-ootb `lane/modeller-e2e-suite-2`) → produced `docs/img/modeller/`
   `move-gizmo.png` + `walk-fixtures.png` (2× DPR, canvas-cropped to 1360×1080). §F2 generalises exactly this
   to the other ~18 frames.
3. **Resolve decision G2 BEFORE capturing** (swiftshader-2× vs GPU-headed — see §F2). It changes the whole
   approach; do not guess. Evidence says swiftshader-2× is already clean.
4. Execute §F2's work-list; keep every frame witness-traceable; `mkdocs build --strict` = 0 after each batch.

---

## STATE — what is already DONE (do NOT redo)
- **The 12-tool real-user E2E suite is COMPLETE** (`modeller/tests/witness_e2e_*.js` + `e2e_harness.js`,
  88 assertions, 0 fail) — the data source for every guide frame. Branch `lane/modeller-e2e-suite`, PR #585.
- **The guide is INTEGRATED + coherent** — **bim-compiler PR #10** (`docs/modeller-guide-integrate` → base
  `docs/hba-guide-rewrite` @ `0967ebcdd`). It closed the three Phase-0 coherence gates:
  1. stale-base fixed (built on the live docs tip, not the pre-Teams parent);
  2. Teams cross-link restored (`§Collaborate — the Teams overlay` → `TeamsOverlayGuide.md`);
  3. orphan `ModellerUserGuide.md` deleted + nav collapsed to ONE entry (`ModellerGuide.md`).
  21 real E2E frames live under `docs/img/modeller/`; every ref resolves; `mkdocs build --strict` = 0.
- **§F1 ✅ (scaffold)** — Getting-started + Troubleshooting sections added; every quoted status string verified
  against `modeller.html` `setStat(...)`. **§F4 ✅ (witnessed Move/Walk frames)** — see §F4 below; this is why
  the guide now has 21 frames, and why 2 of them (`move-gizmo.png`, `walk-fixtures.png`) are the new 2× standard
  while the other ~18 are the older 1× captures → **that mismatch is the open §F2 gap.**
- **⚠ Outward step still owned by the maintainer:** merge PR #10, then deploy via
  `ALLOW_SHRINK=1 paths="ModellerUserGuide/" scripts/safe_gh_deploy.sh` (the orphan deletion removes a live
  gh-pages page → the no-shrink seatbelt aborts unless the removal is blessed). Full tracker in `## MERGE / DEPLOY`.

## THE QUALITY BAR (identical to the HR + Teams guides — see `prompts/RESUME_GUIDES_AND_ICONS_UNIFY.md §A`)
1. **Genuine step-by-step navigation** — which app/URL to open, which pill/button to click, *in order*,
   numbered so a first-timer follows without prior knowledge.
2. **Tightly-framed screenshots** — no dead space; crop 3D/building shots, pull back over-zoomed ones.
3. **The HR-guide shape** — `Getting started → Common tasks → Under the hood → Troubleshooting`, colour-legend
   tables, non-invent emphasis, watermark/back-links.

---

## §F — the polish gaps to close (each is one bounded task)

**Order:** F1 ✅ · F4 ✅ · F5 ✅ (folded). **Only §F2 remains** — and F4 already proved the whole capture+crop
pattern on 2 frames, so §F2 is "do that for the other ~18, to ONE standard." It needs the app/harness.

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

### §F2 — THE REMAINING CHALLENGE: one uniform, polished 2× standard for ALL guide frames
**Why it's still open.** F4 recaptured **2** frames at `deviceScaleFactor:2` + canvas-crop (1360×1080). The
other **~18** are the original functional swiftshader captures at mixed sizes (850–1120px, 1×). The guide now
**mixes two visual standards** — that inconsistency is the load-bearing gap. Bring *every* frame to ONE standard.

**Gaps / decisions to make (spec'd for the stronger model — resolve, don't hand-wave):**

- **G1 — Consistency is the concrete defect.** `identify docs/img/modeller/*.png`: 2 frames @1360×1080, 18 @
  850–1120. Pick ONE standard (recommend **2× DPR, canvas-region crop ≈1360×1080**) and bring all 21 to it.
  A frame you don't recapture must still be *resized/re-cropped* to the standard, or it will read as sloppy.
- **G2 — "Polished live look" is undefined — DECIDE THIS FIRST; it changes everything.** The old bar said "not
  the swiftshader look", but the 2 F4 swiftshader-2× frames are demonstrably clean. Two paths:
  - **(a) Adopt swiftshader-2× as the standard** — cheap, repeatable, fully in-harness, every frame stays
    *asserted* + witness-traceable. **Recommended** unless the architect judges the anti-aliasing wanting.
  - **(b) GPU-headed capture** off the deployed `viewer/modeller.html` — true AA, prettier, but **manual,
    not asserted, not reproducible in CI**. Only if (a) is rejected on look.
  This is an **architect judgment call** (the user is the app architect). Present both, get the call, then commit.
- **G3 — No uniform recapture harness yet.** F4 hand-added `shot()` to 2 witnesses. For all 12 tools, EITHER add
  one `shot('<label>')` at each witness's asserted moment (12 files, the F4 pattern — keeps each frame asserted)
  OR write one orchestrator that replays every click-path. **Prefer per-witness `shot()`** (traceability > DRY).
- **G4 — Crop is not one-size.** Whole-building shots crop to the canvas region
  (`convert IN -crop 1360x1080+600+360 +repage OUT` on a 1200×850@2× frame). **Element close-ups** (fillet
  edges = 13 KB tiny, cut, rotate, scale) need a **computed clip** around the asserted element: project its
  world-bbox → client rect + margin → `pg.screenshot({clip})`. Spec each frame's crop kind (see work-list).

**Work-list — frame → witness → asserted moment → crop kind** (18 open; `move-gizmo`+`walk-fixtures` ✅ done):

| Frame(s) | Witness | Moment to `shot()` | Crop |
|---|---|---|---|
| `workspace-open` | the open flow (any witness post-`t.open`) | after Open + Fit | canvas |
| `insert-catalog`, `insert-placed` | `witness_e2e_insert.js` | catalog armed / after ground-click | canvas |
| `sketch-profile`, `sketch-wall` | `witness_e2e_sketch.js` | profile laid / after Extrude | canvas → element-clip |
| `route-spine`, `route-run` | `witness_e2e_route.js` | spine laid / after Sweep-Run | canvas |
| `cut-select`, `cut-open` | `witness_e2e_cut.js` | wall selected / opening cut | element-clip (the wall) |
| `fillet-edges2`, `fillet-rounded` | `witness_e2e_fillet.js` | edge markers / rounded | element-clip (lone solid) |
| `gizmo` | move/transform | gizmo raised (handle close-up) | element-clip |
| `scale-stretched` | `witness_e2e_scale.js` | after scale commit | element-clip |
| `rotate-yaw` | `witness_e2e_rotate.js` | after rotate commit | element-clip |
| `gridstretch-before`, `gridstretch-after` | `witness_e2e_gridstretch.js` | before / after gridline drag | canvas |
| `delete-gone` | `witness_e2e_delete.js` | after soft-delete | canvas |
| `seedtrunk-entry`, `seedtrunk-trunk` | `witness_e2e_seedtrunk.js` | popup shown / trunk routed | canvas |

- **Replace `docs/img/modeller/*.png` in place** (same filenames → zero ref churn). **Non-invent:** the frame
  must show the *real* committed result (op-log/scene-graph agreeing) — capture, never composite.
- **⛔ If no app/harness env** (no Chromium/GPU/server): do NOT ship fakes. Resize the existing frames to the G1
  standard (honest, no new capture) and note "live 2× recapture deferred — no app env" in the PR.
> **Acceptance:** all 21 frames at ONE standard (uniform DPR + crop discipline); each recaptured frame is a real
> capture of its asserted state; a before/after contact sheet in the PR; `mkdocs build --strict` = 0.
> **STATUS: OPEN — the one remaining task.** F4 delivered the pattern + 2 of 21; ~18 remain + the G1 resize.

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

## MERGE / DEPLOY — the outward steps (maintainer-owned; tracked here so the new session knows what's open)
Verify each with `gh pr view <n>` before assuming state — refs pinned 2026-07-01.
- **bim-ootb PR #585** — the 12-tool E2E suite (`lane/modeller-e2e-suite`). Merge on its own tool-truth merit.
- **bim-ootb `lane/modeller-e2e-suite-2`** — the F4 witness `shot()` edits + the `E2E_SUITE_RESUME.md`
  handoff notes. Fold into #585 or PR it separately.
- **bim-compiler PR #10** (`docs/modeller-guide-integrate`) — the guide + §F1/§F4 frames. Merge → then deploy.
- **bim-ootb PR #586** (`prompt-main`) — this spec on `main`.
- **DEPLOY (last, maintainer only):** after PR #10 merges, `ALLOW_SHRINK=1 paths="ModellerUserGuide/"
  scripts/safe_gh_deploy.sh` (blesses the orphan-page removal; the seatbelt aborts otherwise). Never bare
  `mkdocs gh-deploy`.

---

## CADENCE / ANTI-DRIFT
- **What "read the log" means (Log Mandate):** the witnesses have **no dedicated log file** — each prints
  `§`-tagged results to **stdout**. Redirect and READ it, never trust the exit code:
  `node modeller/tests/witness_e2e_<tool>.js 2>&1 | tee /tmp/e2e_<tool>.log`. A green exit with a SKIP/`refused`
  line in the log is NOT a pass. (`mkdocs build --strict` likewise: read its output, not just the exit.)
- Fresh worktree off `origin/main` for any app/witness work (`sw.js` + `modeller.html` are conflict magnets —
  KEEP-BOTH on conflict, HIGHER `CACHE_VERSION`). Test files (`modeller/tests/*`) are conflict-free.
- **§F2 spans two repos:** the witness `shot()` edits go on **bim-ootb** (`lane/modeller-e2e-suite-2` or a
  fresh lane off `origin/main`); the recaptured/cropped `docs/img/modeller/*.png` + any guide edits go on
  **bim-compiler** (`docs/modeller-guide-integrate` / PR #10 or its successor). This prompt lives in bim-ootb
  because the witnesses do. (Done §F1/§F5 already shipped on PR #10.)
- Deploy is the ONE outward step and the **maintainer triggers it** via `scripts/safe_gh_deploy.sh` (no-shrink
  seatbelt) — never bare `mkdocs gh-deploy`.
- Handoff record + gate history: `modeller/tests/E2E_SUITE_RESUME.md §HANDOFF-RESOLVED`.
