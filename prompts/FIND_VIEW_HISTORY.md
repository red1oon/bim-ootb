# ⚠ DO NOT REMOVE — Find-lens VIEW-HISTORY timeline (standard undo/redo + off-toggle): RESUME
# Scope: a STANDARD undo/redo timeline for Find-lens VIEW navigation (not model ops), with a
#        visible icon to TURN IT OFF. Read-only: it moves the view, never mutates kernel_ops.
# Edit shipping code in bim-ootb/viewer/ (canonical, GH Pages). Whitebox §-log FIRST; SAVE every
# run to a log and READ it before any conclusion. Witness headless (leak-safe, below). Until ✅ DONE.

## ☠ HARD RULES (cost real incidents — same as FIND_LENS_DEPTH_MODEL.md)
- **Headless WebGL probes LEAK CPU.** Wrap EVERY probe: `timeout --signal=KILL 150 node probe.js`
  in a run_*.sh, then `pkill -9 -f chrome-headless-shell`; probe must `try{…}finally{await browser.close()}`;
  ≤1 browser at a time; verify `ps -eo comm | grep -i chrome` clean after. Inline `&`+curl in one Bash
  tool call trips the sandbox → put the http.server + curl-retry in the run_*.sh, not inline.
- **Probes must BLOCK the Service Worker** (`browser.newContext({serviceWorkers:'block'})`) or a stale SW
  serves an old build and you debug a ghost.
- **Shared bim-ootb tree is DIRTY + DIVERGED.** Deploy ONLY via an isolated worktree off origin/main →
  PR → CI (e2e is FLAKY: `gh run rerun <id> --failed`) → squash-merge (`--admin` if base races) → SW bump.
  NEVER checkout/stash/reset/rebase/pull the shared tree. cp ONLY your changed viewer files into the worktree.
- Cut ceremony; decide and let the user judge by what appears. STOP only when about to INVENT (no source).

## ✅ DEPENDS ON (already LIVE on main as of this writing)
The uniform §DEPTH model (PR #143). The view is a pure function of selection depth and funnels through
ONE entry: `viewer/navigate_find.js` `_drillSelect(litSet, label, tag, groupSet, ctxOpacity)`:
- GROUP select → `_drillSelect(null, label, tag, groupSet)` (group 1.0 solid + fit-zoom).
- ITEM select  → `_drillSelect(itemSet, label, tag, groupSet[, ctxOpacity])` (cyan item + group 0.5).
- AXIS change  → `_setTreeMode(mode)`.
This is the ENTIRE semantic surface to record — there is no other lens-nav state.

## ▶ WHAT TO BUILD — a STANDARD view-history undo/redo (user re-scoped from the Glassbowl bloom)
The user said: "the timeline scrub should be a **standard one** and **has an icon to turn it off**."
So: a plain, familiar undo/redo timeline for VIEWS — NOT the fancy double-tap-bloom. Mirror the look of
the EXISTING grid undo/redo bar (`viewer/grid_overlay.js` ~L1557-1595, `#undo-redo-btns`, the `↶ ↷`
buttons) so it reads as the same control the app already has.

Requirements:
1. **Records only SEMANTIC view moments** — axis change, group select, item select. NEVER expands,
   hovers, or camera micro-nudges (else "back" is 20 taps deep). The funnel above is exactly these.
2. **A view = the params needed to replay** `{tag, label, mode:'group'|'item', litGuids:[], groupGuids:[],
   ctxOpacity, axis, cam:{pos,target}}`. Snapshot `cam` AFTER the zoom settles (or store and lerp to it).
3. **Standard undo/redo UX:** back (↶) / forward (↷) buttons step through `viewHist`. A thin row of
   step markers is fine, but keep it standard — no double-tap bloom required. Current step highlighted.
   Clicking a marker / pressing back restores that view.
4. **Restore = replay, deterministic:** re-call `_drillSelect(litSet, label, tag, groupSet, ctxOpacity)`
   from the stored guids (rebuilds opacity/zoom/highlight), then lerp the camera to the stored pose
   (reuse `_lerpCam`). Restoring must NOT itself push a new history entry (guard with a `_restoring` flag).
5. **OFF TOGGLE (the icon):** a visible button that turns the view-history OFF — when off, stop recording
   AND hide the bar. Persist the on/off choice (localStorage) so it stays off across reloads. Default ON.
6. **Read-only / separate layer:** NEVER touches `kernel_ops` or the grid undo. This is a sibling
   view-log, its own array + DOM. Clears/rebuilds on building switch and on Find-panel close.

## WIRING NOTES
- Push a view from inside `_drillSelect` (covers group+item; it is only called on real selects) and from
  `_setTreeMode` (axis). Skip the push when `_restoring` is true and when the off-toggle is off.
- `_drillSelect`'s build is deferred (rAF); snapshot the camera pose on a short timeout after the zoom,
  or store the target box and lerp on restore. Either is fine — witness whichever you choose.
- Only show the bar while the Find panel is open and at least 1 view is recorded.

## WITNESS TARGETS (whitebox §-log first; Playwright = wiring only; adapt tests/probe_depth.js)
- Drive: open Find → tap a storey (GROUP) → expand → tap a type leaf (ITEM) → change axis. Then:
  - `§VIEWLOG_PUSH` fires exactly 3× (group, item, axis) — NOT on expand/hover. Log n + label each.
  - Press back: `§VIEWLOG_RESTORE idx=… label=…`; assert the scene overlays + opacities match the
    earlier view (re-probe `userData._shapeOverlay` opacity: group→1.0, item→0.5/cyan) and the camera
    moved back toward the stored pose. Restoring pushes NO new entry (n unchanged).
  - Toggle OFF → bar hidden, a further select does NOT push (n unchanged); reload → still off (localStorage).
- Save the probe output to a log; READ the log before any conclusion. Verify chrome procs clean after.

## DEPLOY (clean-worktree, same flow as #143)
Bump `viewer/sw.js` (current → next v) + any `?v=` you touch in `viewer/main.js`.
`git worktree add -b feat/find-view-history /tmp/wt-vh origin/main`; cp ONLY changed viewer files in;
`node --check` each; commit those paths; push; `gh pr create --base main`; wait `gh pr checks` green
(rerun flaky e2e); `gh pr merge --squash --admin --delete-branch`; verify pages-build-deployment +
curl live sw.js = new v; `git worktree remove /tmp/wt-vh --force`.
