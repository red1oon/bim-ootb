# ⚠ DO NOT REMOVE — UNIVERSAL HISTORY timeline: study the old undo, REPLACE it, make it universal
# Scope: turn the new Find-lens view-history scrubber into ONE universal history/undo-redo timeline
#        that works across the WHOLE kernel log AND every panel — and RETIRE the old grid-only undo
#        bar (the user: "it is no longer useful"). Add a pill ICON to open it + a HELP entry. Keep the
#        OFF-toggle. Read shipping code in bim-ootb/viewer/. Whitebox §-log FIRST; SAVE every run to a
#        log and READ it before any conclusion. Witness headless (leak-safe, below). Until ✅ DONE.

## ☠ HARD RULES (cost real incidents)
- Edit shipping code ONLY in `/home/red1/bim-ootb/viewer/`. Whitebox `§`-tagged console.log is the
  PRIMARY witness; Playwright is wiring-only. SAVE every probe run to a log and READ it before concluding.
- Shared `/home/red1/bim-ootb` tree is DIRTY + other sessions are live in it. Do NOT git switch/stash/
  reset/rebase/pull it. Deploy ONLY via an ISOLATED worktree: `git fetch origin && git worktree add -b
  feat/universal-history /tmp/wt-uh origin/main`. cp ONLY your changed viewer files into it; `node --check` each.
- Headless WebGL probes LEAK CPU: put server+curl-retry+probe in a run_*.sh; wrap `timeout --signal=KILL
  150 node probe.js` then `pkill -9 -f chrome-headless-shell`; probe `try{…}finally{await browser.close()}`,
  ≤1 browser, `browser.newContext({serviceWorkers:'block'})`; verify `ps -eo comm|grep -i chrome` clean after.
- `kernel_ops.js` carries a SIGNED hash chain (sealChain/verifyChain, W-CHAIN). This timeline is READ-ONLY
  over it — NEVER mutate kernel_ops rows, never break the chain. Undo/redo of MODEL ops uses the EXISTING
  undoOp/redoOp (the `undone` flag), not row deletion.
- Cut ceremony; decide and let the user judge by what appears. STOP yourself only when about to INVENT
  (no source) OR when a genuine architecture fork needs a user decision you cannot extract.

## ▶ STUDY FIRST (the user said "by right it was to look at the old one")
1. **Old grid undo/redo bar** — `viewer/grid_overlay.js` ~L1557-1595 (`#undo-redo-btns`, `↶ ↷`,
   shown only in grid mode, `hideUndoRedo()` on exit) + `doUndo`/`doRedo` ~L1601-1637 (skip audit ops,
   dispatch to `GridDrag.applyReplayedMove`). This is GRID-ONLY and tied to GridDrag — that narrowness
   is WHY the user calls it "no longer useful". You will RETIRE this bar and fold its capability in.
2. **The kernel log** — `viewer/kernel_ops.js`: `kernel_ops` table (op_uuid, op_type, parameters,
   input/output guids, `undone`, prev_hash/op_hash/sig), `commitOp`, `undoOp(db)`, `redoOp(db)`,
   `replayOps(db,type)`, `sealChain`/`verifyChain`. Op types seen: GRID_MOVE, SESSION_START, ELEMENT_PLACE,
   ELEMENT_PICK. THIS is the model-side history.
3. **The new Find view-history** — `viewer/navigate_find.js` `§VIEWLOG` block (~L219+): `_viewHist`,
   `_viewIdx`, `_pushView`, `_restoreView`, `_restoring` guard, the `#…` bar + off-toggle (localStorage
   `bim.findViewHist.on`). This is the VIEW-side history (lens nav: axis/group/item). It funnels through
   `_drillSelect`/`_setTreeMode`. Read it fully — it is the UX seed for the universal timeline.

## ▶ DESIGN DIRECTION (user, explicit) — ONE single timeline + an "events that matter" gate
- It is **ONE single merged timeline**, NOT two parallel tracks. Model ops and view-nav moments live on
  the same line, time-ordered. (User: "thot its easier to be a single timeline.")
- **Present AS the status bar — and JUST that.** The present undo/redo bar already doubles as a status
  bar; the universal timeline should TAKE OVER that status-bar slot (one lean bottom bar = the timeline +
  its ↶ ↷ + the off-toggle/icon), NOT add a second chrome element. Keep it minimal — a status bar, nothing
  heavier. (User: "it seems to be a status bar also the present undo/redo.. so yes we can have status bar
  but just that.") Reuse the existing bar's footprint/placement rather than introducing new UI furniture.
- The hard part is **CURATION: a mechanism for picking the events that MATTER.** Not every kernel op and
  not every view tweak belongs on the timeline — a flood makes "back" useless. Build ONE centralized
  significance gate that BOTH sources pass through before an entry is recorded:
    - Make it data-driven and simple (KISS): e.g. a `significant(event)` predicate / a registry of
      qualifying op-types + a per-push `significant` flag — ONE place that answers "does this matter?".
    - View side: axis change · group select · item select QUALIFY; expands/hovers/camera micro-nudges do NOT.
    - Model side: meaningful committed ops (e.g. ELEMENT_PLACE, a settled GRID_MOVE) QUALIFY; pure audit/
      bookkeeping rows (SESSION_START, GRID_DETECT, and the like) do NOT. Coalesce rapid repeats of the
      same op (e.g. a drag emitting many GRID_MOVE) into ONE entry, not twenty.
    - `§-log every drop` (what was filtered and why) — silent curation reads as "nothing happened".
  Keep the gate easy to tune (one table/threshold), because "what matters" will be adjusted by feel.

## ▶ WHAT TO BUILD — ONE universal history timeline
- **Replace** the old grid `#undo-redo-btns` with a single universal timeline control that is available
  across ALL panels (not grid-only, not find-only) — a standard undo/redo `↶ ↷` plus a step row.
- **Universal over BOTH logs:** it shows, in time order, BOTH model ops (the kernel_ops log — grid moves,
  element places/picks, etc.) AND view-nav moments (the view-history). Undo/redo steps backward/forward
  through this merged stream:
    - a VIEW step → restore that view (replay `_drillSelect`/`_setTreeMode` + lerp camera), read-only.
    - a MODEL-OP step → the existing `undoOp`/`redoOp` on kernel_ops (the `undone` flag + GridDrag replay),
      NEVER row deletion, never break the W-CHAIN.
  Decide a clean merge/ordering (timestamps or a unified sequence counter) — STUDY both before choosing;
  if the two streams can't be cleanly merged without a user call, STOP and report that one fork.
- **Pill ICON to open it** + a **HELP entry** (mirror however other panels expose help — study the
  existing help/`?` affordance in the viewer and match it; don't invent a new pattern).
- **OFF-toggle stays** (persisted, default ON): off → stop recording + hide the bar.
- Keep it READ-ONLY-safe: never corrupt kernel_ops; the view layer stays a sibling.

## WITNESS TARGETS (whitebox §-log first; Playwright = wiring only; adapt tests/probe_depth.js + the
##  agent's tests/probe_viewhist.js)
- Old grid `#undo-redo-btns` is GONE (querySelector null) and the universal bar is present instead.
- Drive a mix: a grid move (model op) + Find group/item selects (view ops) → the timeline lists BOTH in
  order (`§HIST_PUSH`/`§HIST_LIST` with kind=op|view). Undo steps back through the merged stream:
  a view step restores the view (overlays/opacity/camera match), a model-op step flips `undone` and
  replays — `verifyChain` still PASSES after (prove it, `§HIST_CHAIN_OK`).
- Pill icon opens the bar; Help entry present. Off-toggle: hides + stops recording + persists across reload.
- Save probe output to a log; READ it before concluding; chrome procs clean after.

## DEPLOY — implement + witness + open PR, then PAUSE for review (do NOT auto-merge)
This REPLACES a core control and touches `kernel_ops.js` + `grid_overlay.js`, so unlike the additive
prior PRs: bump `viewer/sw.js` CACHE_VERSION (read the CURRENT value off fresh origin/main first — it
moves; take higher on conflict, sw.js is the merge magnet) + any `?v=` you touch in `viewer/main.js`;
commit ONLY changed viewer paths; `node --check` each; push `feat/universal-history`; `gh pr create
--base main`; wait `gh pr checks` green (e2e is FLAKY — `gh run rerun <id> --failed` for the golden-path
streaming flake). **Then STOP and report the PR for human review — do NOT `gh pr merge`.** Report: the
study findings (how old undo worked, the merge design you chose), the PR number, and the §-witness lines.
