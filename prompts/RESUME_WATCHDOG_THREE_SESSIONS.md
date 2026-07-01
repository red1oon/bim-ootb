<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — WATCHDOG: three concurrent sessions launched 2026-07-01

**Scope.** Three independent work threads were spun up as SEPARATE, CONCURRENT sessions (deliberately not one
sequential session — they touch different files/subsystems, see the independence check below). This prompt is for
a SEPARATE watchdog session/pass that checks on all three — it does NOT do the work itself. **Read the log after
every run you're verifying — a coder's claim without a `§`-tagged log line, or a green witness that never asserts
the thing that actually matters, is not proof.** Honour this preamble until all three are `✅ DONE` or `⛔ BLOCKED`.

## The three sessions being watched
| # | Thread | Resume doc | Repo / worktree | Branch |
|---|---|---|---|---|
| 1 | §F2 outward steps (merge PR #10 + deploy) + fold `lane/modeller-e2e-suite-2` | `prompts/RESUME_MODELLER_GUIDE_POLISH.md` | bim-ootb / bim-compiler | `docs/modeller-guide-integrate` (bim-compiler PR #10), `lane/modeller-guide-f2` (bim-ootb, pushed no PR yet) |
| 2 | Terminal load stall + illegal LOD200 fix | `prompts/RESUME_MODELLER_TERMINAL_LOAD_LOD400.md` | bim-ootb | fresh `/tmp/wt-*` off `origin/main` (not yet created as of hand-off) |
| 3 | HR/HBA + Teams overlay pill/icon unification | `prompts/RESUME_OVERLAY_PILL_ICONS.md` | bim-ootb | `lane/hr-overlay` (`/tmp/wt-hr`), `lane/teams-overlay` (`/tmp/wt-redpill`) |

**Why concurrent, not sequential (checked before launch, don't re-litigate):** #2 touches `modeller/bonsai_kernel.js`
/`bonsai_library.js`/`arc_editable.js`/`str_walker_outliner.js` (the Modeller's authoring/fold engine). #3 touches
`viewer/panels.js`/`hba_lens.js`/`teams_pill.js` (the Viewer's overlay layer, a different pipeline — OCI-backed
consume path, not the Modeller's live fold). #1 is docs + a small already-scoped merge/deploy. No file overlap
across the three — safe to run in parallel worktrees/sessions.

## What the watchdog does, each pass
For EACH of the three, don't just read the coder session's own summary — verify independently:

**#1 (§F2 outward steps):**
- `gh pr view 10` (bim-compiler) — merged? `gh pr view <n>` for whatever PR number `lane/modeller-guide-f2` got.
- If claimed deployed: fetch the live gh-pages URL for `ModellerGuide.md` and confirm the 2× frames are actually
  there (not just that the deploy script exited 0 — the no-shrink seatbelt can abort soft; check its actual log).
- `lane/modeller-e2e-suite-2` folded in or PR'd on its own? Don't let it silently vanish.

**#2 (Terminal/LOD) — the highest-risk one, per today's recurrence lesson (`feedback_test_real_user_path_not_seams`
§RECURRENCE):**
- Do NOT accept "witnesses green" alone. Check specifically:
  - Is there a NEW witness that opens **Terminal** (not just Duplex)? If every witness still only opens Duplex,
    the claim "Terminal load fixed" is unproven — flag it.
  - Is there an assertion that can distinguish a real LOD400 mesh from a primitive box (e.g. a catalog `hash`/id
    on the mesh's `userData`, or a structural-complexity check)? "tris > 0" / "mesh exists" is NOT sufficient —
    a `BoxGeometry` also has nonzero, plausible-looking tris. If the only evidence is a tri-count, flag it.
  - Read the actual log output of any new witness (`node modeller/tests/witness_e2e_terminal*.js 2>&1 | tee`),
    don't trust a reported PASS count secondhand.
  - If the fix claims a load-time bound, is there a number in the log (e.g. "Terminal opened in Xs")? A claim of
    "fast now" with no measured number is a handwave.

**#3 (overlay pill/icon unification):**
- `hr_bim_asset/tests/live/action_regression.js` mentioned in the resume doc as the regression driver — was it
  actually run, and does its log show `jsErrors=0` + zero residue? Don't accept "should work now" without it.
- Confirm BOTH pills (HR FM + Teams) got the fix in the SAME pass (the resume doc's whole point is doing both
  together, not just one) — check both `viewer/hba_lens.js` and the Teams pill wiring were touched.
- The HR gate-timing bug (`§HBA_GATE FM=on available=[dash]` firing before full stream) — was the underlying
  re-poll/threshold fix actually made, or just the icon/pill cosmetic layer? Both were named as open in the
  resume doc; check which (or both) got closed.

## Reporting format
For each of the 3: `✅ DONE (evidence: <the specific log line/URL/PR you checked>)`, or `🔶 IN PROGRESS (last seen:
<branch/commit>)`, or `⛔ STUCK/HANDWAVED (<what claim wasn't backed by evidence, and what's missing>)`. Don't mark
anything DONE on the strength of a session's own summary alone — you must have independently found the log line,
URL, or file it claims exists.

Relates [[feedback_architect_first_before_tasking]] (systems view before tasking — this doc IS that view, kept so
the watchdog doesn't have to re-derive it) and [[feedback_test_real_user_path_not_seams]].
