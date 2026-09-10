# RESUME — DAGeVu Engine (foundational constraint-graph) + related in-flight tasks

```
# ⚠ DO NOT REMOVE
SCOPE: build modeller/dagevu_engine.js — a small, reusable, OOP (ES6 class-based, not the closure
style used elsewhere in this codebase) "relationship edge" engine that generalizes the existing
proven rel_fills_host stretch-ride pattern into a named, reusable contract. This is the FOUNDATIONAL
piece three concrete asks build on: (1) grid-stretch default flips from "opening rides" to "opening
stays put, host absorbs the delta at its free end", with ride demoted to an explicit per-element
opt-in; (2) a generic live-dimension-readout hook for any constrained drag; (3) future roof
angle/apex editing — EXPLICITLY PAUSED, see below, do not resume without asking first.
Honour this scope until every numbered item below is ✅ or ⛔. Read the log after every witness run —
exit code alone is not evidence.
```

## Why this exists (session 2026-09-10)

User wants DAGeVu's core differentiator — dragging a grid line and dependent geometry (walls,
openings) intuitively adjusting without distortion — extended two ways: (a) an anchored-opening mode
where the opening does NOT ride, the wall grows/shrinks around it instead; (b) a live dimension
readout while dragging, matching what move/rotate/scale already show (grid-move currently shows
NONE — confirmed by grep, zero hits for `dimLabelShow`/`setStat`/`§V7` in `bonsai_gridmove.js`).
Rather than patch these in ad hoc, user asked for a foundational, reusable engine first, explicitly
in clean OOP (their words: "reusable Java like OOP... which we can then claim as our DAGeVu engine").

Roof angle/apex was raised as a third use case but is **PAUSED, not in scope right now** — a live
check found ZERO real measured roof-slope/pitch/apex data anywhere in the codebase (every "roof" hit
is just an `IfcRoof` class/color label). Building it would mean inventing a slope number, which
violates this codebase's NON-INVENT rule. User's own words, 2026-09-10: "pause the roof slope task
as it is not foundational." Do not build `AngleEdge` or research roof data further without the user
raising it again.

## What already exists and must be REUSED, not reinvented

- `modeller/sdg_cascade.js` `stretchRide()`/`ridersFor()` — the proven host→filling ride math, sourced
  strictly from real extracted `rel_fills_host` edges (`cross_edges.js` ~line 246-251, never proximity
  guessing). Green: `witness_sdg_cascade.js` 7/7, `witness_e2e_stretch_ride.js` 9/9.
- `modeller/sdg_gate.js` "abuts-realign" ORANGE check — real wall-adjacency gap math with a
  `proposedDelta` that re-closes a gap. Green: `witness_sdg_gate.js` A8/A8b/A8c.
- `witness_e2e_grid_greenorange.js` (12/12) — the existing per-element opt-out UX during a grid drag
  (ctrl+click a wall to toggle green/excluded vs orange/included, live tinting, stripped from the
  committed `GEOM_GRID_MOVE` command list). The anchor/ride mode toggle should REUSE this exact
  interaction, not invent a new one.
- `bonsai_itemdrag.js`'s `resolveHost()`/`HOST_TOL`/wall-branch — the host-axis/plane math for "which
  wall, which face" — reuse for anchor mode's "which end of the wall is free of openings" derivation.
- `modeller.html` `dimLabelShow()`/`setStat()` (search "§V7") — the existing live-readout UI primitives
  move/rotate/scale already use. Grid-move must call these, not build new UI.

## Full original engine brief (unabridged — the dispatched agent had this; re-read before continuing)

Build `modeller/dagevu_engine.js`:
- Abstract base `RelationEdge` — one contract method `propagate(drivingDelta, realGeometry) →
  { dependentDeltas, dimLabel }`.
- `HostFillEdge extends RelationEdge` — `mode:'ride'` delegates to existing `stretchRide()` (wrap,
  don't duplicate). `mode:'anchor'` (NEW): filling's world position stays fixed; host absorbs the
  whole delta at the END AWAY FROM the opening (derive via real measured position along the wall's
  local axis). Multiple openings on one wall: keep ALL fixed, grow from whichever end is free; if
  openings exist on BOTH ends (no free end), REFUSE honestly (return null/error), never fabricate a
  resolution.
- `AbutsEdge extends RelationEdge` — wraps `sdg_gate.js`'s abuts-realign `proposedDelta` (don't
  reimplement) — closes the gap anchor mode's freed-end growth creates against a real neighbor.
- `AngleEdge` — ⛔ PAUSED, do not build (see above).

Wire into `bonsai_gridmove.js`: anchor becomes the default; ride is the explicit per-element
override via the green/orange toggle (repurpose the existing interaction, don't rebuild it). Wire the
live dimension readout into the same file's pointermove, feeding `dimLabelShow()`/`setStat()`.

**Explicit behavior-change warning carried into the original brief:** this changes a TESTED default
(grid-stretch used to always ride). `witness_e2e_gridstretch.js`, `witness_e2e_stretch_ride.js`,
`witness_sdg_cascade.js` (if it has a grid-driven E2E path), `witness_e2e_grid_greenorange.js` will
need assertions UPDATED to match the new intended default — exactly like `witness_e2e_delete.js` D4
needed updating in the sibling DELETE/REDO fix (below) for an analogous reason. Distinguish "stale
expectation, update it" from "real regression, don't paper over it" for each, and say which.

## Status of the three dispatched tasks (2026-09-10, session paused for a reset)

### 1. ✅ DONE — DELETE/REDO history-tree fix (unrelated bug, not part of the engine, already shipped)
- Root cause: `deleteFeature()` flagged rows `undone=1` but was never wired into `ModellerHistory`'s
  tree — Ctrl+Z after a delete undid the wrong thing, Ctrl+Y only "worked" by op-log accident.
- Fix: `bonsai_oplog.js#setUndone(ids,val)` (id-targeted flip) + `modeller_history.js` wraps
  `deleteFeature()` to push a tree node carrying its row ids; ordinary commits stay on the old path.
- **PR open, unmerged: https://github.com/red1oon/bim-ootb/pull/1704** (branch
  `fix/delete-redo-history-sync`, worktree `/tmp/wt-scale-cut-fix` — still on disk).
- Docs correction for the same fix, also open unmerged: **BIMCompiler PR #100**
  (branch `docs/delete-redo-fix`, worktree `/tmp/wt-bimcompiler-docs`, corrects `docs/ModellerGuide.md`
  §Delete). Live docs site NOT redeployed yet (deliberately — `scripts/safe_gh_deploy.sh` publishes
  publicly, held for explicit go-ahead).
- **Next session: just merge both PRs if the diffs still look right — no further coding needed here.**

### 2. 🔶 IN PROGRESS, KILLED MID-TASK — along-host opening-slide drag (separate feature, not the engine)
- Scope was: let `bonsai_itemdrag.js`'s free single-item drag constrain a hosted filling to slide
  along its OWN host wall's plane/bounds (not free 3D), and either keep a real carved cut void in sync
  or honestly refuse — the gap that file's own header flags at line ~88 ("no separate along-host
  slide constraint in v1, spec §3.1 defers to Q5").
- **Real, substantial, UNVERIFIED progress exists on disk**: 256 lines changed in `bonsai_itemdrag.js`,
  6 lines in `modeller.html`, uncommitted, in worktree
  `/home/red1/bim-ootb/.claude/worktrees/agent-a8b5dc9ca46ba4e72` (branch
  `worktree-agent-a8b5dc9ca46ba4e72`). Never ran its witness test, never confirmed it works —
  treat as a rough draft, not working code, until reviewed and tested.
- **Resumable**: this was a background agent (killed via TaskStop, not completed) — per this
  session's own tooling, sending it another message resumes it from its saved transcript. Its
  agent id: `a8b5dc9ca46ba4e72`. If that id/name no longer resolves next session (agent ids don't
  always survive a hard reset), fall back to: read the diff in that worktree directly, read
  `bonsai_itemdrag.js`'s own header + the original dispatch brief in this session's transcript
  (not reproduced here — this doc is the pointer, not a full copy) — or just re-diagnose from the
  diff itself, it's small enough to read cold.
- **Not part of the "foundational engine" ask** — lower priority, resume only after the engine itself.

### 3. ✅ DONE 2026-09-10 (this PR) — dagevu_engine.js (THE foundational task)
- Built by the primary session (no subagent), spec-first: `prompts/SPEC_DAGEVU_ENGINE.md`. `modeller/dagevu_engine.js`
  (RelationEdge / HostFillEdge anchor|ride / AbutsEdge / DagevuEngine), wired into `bonsai_gridmove.js` +
  `modeller.html` (anchor default, ctrl+click on an opening = anchor↔ride, refusal blocks commit, engine dimLabel
  in setStat + dimLabelShow). W-DAGEVU-ENGINE 10/10; e2e stretch_ride 11/11, greenorange 13/13, gridmove_real 8/8,
  gridstretch 7/7; node stretch_ride 9/9, sdg_cascade 7/7, sdg_gate 11/11. void_anchor G6 fails identically on
  untouched main (cross-edge count drift, pre-existing, not this change).
- Recon correction: grid-move DID already show a §V7 readout (modeller.html ~line 2004, grid Δ only); the engine
  label now rides on it.
- Status of item 1 as of 2026-09-10: bim-ootb PR #1704 MERGED; BIMCompiler PR #100 still OPEN (docs).
- Original state before this session, kept for history:
#### (was) 🔶 BARELY STARTED, KILLED — dagevu_engine.js itself
- Agent got only as far as "I'll start by exploring the codebase" — **zero files touched, no worktree
  ever created**. Genuinely nothing lost; also genuinely nothing done.
- Agent id: `a9dfff070e94bb7ce` (same resumability caveat as above — try SendMessage first, fall back
  to a fresh dispatch reading this file if it doesn't resolve).
- Mid-flight scope cut already applied before it was killed: **drop `AngleEdge`/roof entirely** (see
  PAUSED note above) — don't redispatch with the original roof-inclusive brief, use the narrowed one
  in "Full original engine brief" above (AngleEdge already marked ⛔ there).

## Separate backlog item (2026-09-10, not part of the engine work) — repo-root script clutter

`bim-ootb` repo root has ~202 loose scripts that should be nested into their proper folders:
- **163 `witness_*.js`** directly at root (not in any `tests/` dir). By naming (`witness_cinema_*`,
  `witness_gantt_*`, `witness_tour_*`, `witness_room_*`, `witness_cpe_*`, `witness_maxq_*`,
  `witness_photo_*`, etc.) these clearly belong in `viewer/tests/` alongside the 133 already there —
  confirmed ZERO filename collisions against every existing nested tests dir (viewer/modeller/
  hr_bim_asset/erp/geomapping/teams/common/tests).
- **39 other loose scripts** (`probe_*`, `sandbox_*`, `cli_*`, `poc_*`, `smoke_*`, `drag_test.js`,
  `optics_*`, `cdp.js`, `import_own.js`) plus **1 `.py`** (`score_frame_budget.py`) — same clutter
  pattern. `eslint.config.js` is legitimate, leave it at root.

**NOT a safe blind `git mv`.** At least 66 of the 163 witness files build filesystem paths off
`__dirname` ASSUMING `__dirname` is the repo root — e.g. `path.join(__dirname, 'viewer', 'scene.js')`,
`path.join(__dirname, 'common', 'room_graph.js')`, `path.join(__dirname, 'buildings', ...)`,
`path.join(__dirname, 'modeller', 'lib', 'sql-wasm.wasm')`. Moving any of them one directory deeper
breaks that resolution silently. (One exception found: `execSync('git show origin/main:common/...',
{cwd:__dirname})` is SAFE regardless of depth — git resolves `rev:path` against the repo root, not
cwd, as long as cwd is anywhere inside the repo.)

**The fix is mechanically uniform IF the move is exactly one level deep** (e.g. everything into
`viewer/tests/`, which is one level deeper than root): every repo-root-relative `path.join(__dirname,
X, ...)` / `__dirname + '/X/...'` needs exactly one `'..'` inserted right after `__dirname`. But
"uniform mechanical fix" still means: apply it, then actually RUN a representative sample of the
moved witness files to confirm nothing broke — don't trust the pattern-match alone. That's real token
cost (a meaningful fraction of 163 test runs, several needing headless Chrome), which is why this was
deferred rather than done same-session (user, 2026-09-10: "be careful on the tokens burning fast").

**Not investigated at all yet:** which folder each of the 39 non-witness scripts actually belongs in
(probably `scripts/` or a new `sandbox/`/`probes/` dir — didn't check for an existing home), and
whether THEY have the same `__dirname`-as-root coupling (likely, given the shared authoring pattern,
but unconfirmed).

**Suggested approach next session:** pick ONE destination folder, move+fix+verify in a small batch
(e.g. 10-15 files), confirm the pattern holds, then batch the rest — don't attempt all ~200 in one
pass untested.

## How to resume next session

1. Try `SendMessage` to agent id `a9dfff070e94bb7ce` (the engine) first — cheapest path if it resolves.
2. If not, re-dispatch fresh using the "Full original engine brief" section above verbatim as the
   prompt (it already has the roof-cut applied) — a fresh Fable-tier agent, isolated worktree.
3. Opening-slide (`a8b5dc9ca46ba4e72`) is lower priority — pick up after the engine lands, either by
   resuming that agent id or reviewing/finishing the existing 256-line diff by hand.
4. Merge PR #1704 (bim-ootb) and PR #100 (BIMCompiler) whenever convenient — independent of the above.
