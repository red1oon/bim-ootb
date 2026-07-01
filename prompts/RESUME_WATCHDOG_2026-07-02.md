<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — WATCHDOG: session sweep 2026-07-02

**Scope.** Several concurrent sessions/worktrees have been advancing since the last watchdog pass
(`RESUME_WATCHDOG_THREE_SESSIONS.md`, 2026-07-01 — all 3 of that pass's threads independently verified DONE by
that point). This is a FRESH pass over what's now open. Same rule as before: **read the log after every run you
verify — a coder's own summary, or a green witness that never asserts the thing that actually matters, is not
proof.** Don't accept a claim on the strength of a commit message alone.

## Threads being watched
| # | Thread | Worktree / branch | Last-seen state (UNVERIFIED — confirm independently) |
|---|---|---|---|
| A | ARC-seed rotation (yaw-only → full 3-axis) + SampleCastle one-source-of-truth | `/tmp/wt-arc-rot-fix` `fix/arc-rotation-full-axes` | 3 commits, claims MERGED to main as **PR #595** (`e4ce58f`) |
| B | Outliner Components-category O(rows×total-ops) paint stall (236× slowdown) | `/tmp/wt-outliner-stall` `fix/modeller-outliner-components-stall` | claims MERGED to main as **PR #596** (`147d098`) |
| C | Terminal signing-speed (Candidate C "batch-sign bulk classes as one row" / Candidate D "decouple paint from signing") | `/tmp/wt-signing-speed` `fix/modeller-signing-speed` off `fix/modeller-terminal-load-lod400` | **NOT STARTED** — worktree only has a sync-merge commit, no actual signing-speed fix yet, despite being spec'd (Candidates C+D in `prompt-main` `c8021de`/`64c2a5f`) |
| D | SampleCastle/Terminal real per-element geometry render (no silent box fallback) + Terminal split-file geo (`Terminal_geo.db` §GEO-SPLIT) | `/tmp/wt-sc-tilt-visual` `feat/samplecastle-tilt-visual-proof` | claims MERGED to main as **PR #598** (`02e5a2a`) |
| E | Walk All Disciplines (new animation choreography across the whole scene) | `/tmp/wt-walk-all-disc` `feat/walk-all-disciplines` | IN PROGRESS, freshly branched off latest main (includes A/B/D already merged) |
| F | HR_BIM_Asset — §CRITICAL "Compile not Model" correction: re-point payroll/occupancy/asset/tenancy onto REAL iDempiere AD tables instead of the invented `hr_seed.db` schema | `/tmp/wt-hr` `lane/hr-overlay` | IN PROGRESS — `fb29e40` "M_Locator is a WMS bin-address not Cartesian, Strata reuses C_Subscription" + `eb69978` "P7 — the payslip UI view over the native payroll compile" (P7-PRE re-point + P7 UI both claim landed in the SAME pass — high-risk claim, verify carefully) |
| G | IFC→BOM geomapping library (aka "Geometry EYES") | spec only: `bim-compiler/prompts/RESUME_IFC_BOM_GEOMAPPING.md` (local, gitignored — NOT in bim-ootb git) | **NOT STARTED.** No `eyes`-named worktree/branch exists in bim-ootb as of this pass. ⚠ If one appears before this pass, the FIRST check is whether it was pointed at the geomapping spec or built independently/divergently — see §COORDINATION below. |

**Why concurrent, not sequential (checked before launch of these lanes originally):** A/B/D/E are all Modeller
`modeller/*` files (arc_editable.js, str_walker_outliner.js, bonsai_kernel.js) — some overlap risk between them
is real given E branched from a main that already has A/B/D merged in; F is HR_BIM_Asset (`hr_bim_asset/` +
`viewer/hba_lens.js`, disjoint file set); G doesn't exist yet. Don't assume zero collision on A/B/D/E the way
the previous watchdog pass could for its 3 fully-disjoint threads — check for merge conflicts / silently
overwritten fixes when E (or any later lane) reaches a PR.

## What the watchdog does, each pass — per thread

**A (ARC rotation) + D (real-geometry render):** these two are the direct fix for the illegal/broken geometry
screenshot from 2026-07-01 (giant diagonal wall slabs, floating furniture-shaped boxes on DX/SH). Don't accept
"merged" as proof it's fixed:
- Pull a FRESH screenshot of Duplex and SampleCastle post-merge (same method as the original bug screenshot —
  open the real Modeller, no cached state) and confirm the walls/furniture are no longer giant/diagonal/floating.
- Check the witness that was added for the rotation fix (`witness_arc_editable.js` A9/A10 per the 2026-07-01
  commit `d28b4c7`'s description) still passes, AND that it was actually extended to cover SampleCastle's
  1942/1942 rotated elements claim, not just re-asserted on the same small Duplex set.
- The furniture-floating bug specifically (bad `center_z`/`bbox_z` in `element_transforms`, confirmed present
  in BOTH Modeller's and Viewer's DB copies on 2026-07-01) — was this actually a ROTATION-unit bug in disguise,
  or a SEPARATE extraction bug? If A's fix doesn't also correct the furniture case, that's still open — check
  explicitly, don't assume one fix closed both.

**B (Outliner stall):** the memory record (`project_modeller_outliner_components_stall.md`) said "236× measured
slowdown... fix drafted not applied" as of the last check. Confirm the ACTUAL measured before/after numbers in
a real log (not just "fixed" in a commit message) — the whole point of this bug was a live-measured slowdown,
so the fix needs a live-measured improvement number to match.

**C (signing-speed):** per this session's own design discussion 2026-07-02 — the two candidates spec'd
(batch-sign-as-one, decouple-paint-from-signing) are NOT yet implemented (worktree only has a sync commit).
When this lane produces real commits, check specifically:
- Does it preserve the `featureId↔guid` bridge for anything that still needs individual edit/select (flagged as
  a real tradeoff in this session's dialogue — batching bulk elements into one signed op means they lose
  individual featureIds; that should be a STATED decision in the commit, not a silent side effect).
- Is there a real, measured Terminal open-time number in the log (not "fast now" with no number)?

**E (Walk All Disciplines):** described by the Modeller session itself as "a real 3D-engine feature (new
animation choreography across the whole scene), not a small tweak." No specific claim to verify yet as of this
pass (still being implemented) — when it reaches a PR, apply the same standard as everything else this project
has been burned by: a green seam witness is not proof the real user-facing animation works — get a real-user
E2E witness (per `feedback_test_real_user_path_not_seams`), not just an op-log assertion.

**F (HR_BIM_Asset native re-point + payslip UI) — the highest-risk claim in this pass.** The §CRITICAL finding
(2026-07-02) was that the ENTIRE payroll/occupancy/asset engine had been writing to an invented, isolated
`hr_seed.db` instead of iDempiere's real dormant `hr_process`/`hr_movement`/`hr_concept`/`hr_concept_acct`
tables — this is `RESUME_HR_BIM_ASSET.md`'s own P7-PRE (blocking) item. The worktree now shows BOTH the re-point
AND the P7 payslip UI landing in the same pass, plus an `M_Locator`/`C_Subscription` correction for Strata/
Tenancy. Do NOT accept this as done without:
- Confirming `hr/engine.js`'s payroll profile actually reads/writes `ad_full.db`'s real `hr_*` tables now, not
  a renamed/still-separate `hr_seed.db` — check the actual SQL/table names in the diff, not the commit message.
- Confirming the payslip pane (P7) renders off those REAL rows (`hr_movement`), not off leftover demo data from
  before the re-point — if P7 was built against the OLD schema and the re-point happened in the same pass,
  check they're actually wired together, not two independent unmerged pieces of work.
- Re-running the GL-balance witness (`E8-gl-balanced`, previously `Dr=8400 Cr=8400` against the invented
  schema) against the NEW native-table path — does it still balance through `hr_concept_acct`'s real GL mapping?
- The `M_Locator` finding ("is a WMS bin-address, not Cartesian coordinates") — if Occupancy/Tenancy previously
  assumed `M_Locator` for spatial binding, and that assumption was wrong, check what it was corrected TO, and
  whether that correction is witnessed, not just asserted.

**G (IFC→BOM geomapping / "Geometry EYES") — coordination check, not a progress check.** This lane hasn't
started. If it has by the time you read this: was it pointed at `bim-compiler/prompts/RESUME_IFC_BOM_GEOMAPPING.md`
first (the spec + 3-phase Fable5→Sonnet workflow drafted 2026-07-02), or did it proceed independently? If
independently, compare its design against that spec's §DESIGN (relationship-walk → curated-table → geometry-
last-resort tiering) and §EVIDENCE (storey/4D5D work, room's measured 24% recall as the cautionary tale) before
letting it continue — this exact duplication risk was flagged in the spec itself.

## Reporting format
Same as the previous pass: `✅ DONE (evidence: <the specific log line/URL/PR you personally checked>)`,
`🔶 IN PROGRESS (last seen: <branch/commit>)`, or `⛔ STUCK/HANDWAVED (<what claim wasn't backed by evidence>)`.
Don't mark anything DONE on a session's own summary alone.

Relates [[feedback_test_real_user_path_not_seams]], [[feedback_architect_first_before_tasking]], and this
session's [[feedback_model_allocation_mastermind_vs_execution]] (relevant to how G should be staffed once it
starts).
