# ⚠ DO NOT REMOVE — scope + log discipline
Scope: verify and finish the `filterDiscs()` BatchedMesh/InstancedMesh enumeration bug fix
(Architecture discipline getting stuck permanently hidden). Read the console log after every
run — this bug only shows up in browser console `§` output and live rendering, not in any
offline test. Whitebox `§`-log first, then confirm live in a browser per this repo's standing
rule. **PUSH PAUSE is standing**: commit locally as normal, verify on localhost — do NOT
`git push` and do NOT open a PR. Do not un-push anything already pushed.

## Context (why this exists)
A user session spent a long debugging arc on a real dropped multi-discipline IFC4 building
("jkr" — 7 files, JKR Malaysia gov-works project) that appeared "well formed but miles apart"
in the Viewer. That original position bug (web-ifc's `GetFlatMesh().flatTransformation`
producing a partial/truncated placement composition) was root-caused and worked around via an
offline ifcopenshell-based extractor (bim-compiler `scripts/extract_merge_disciplines.py` +
`DAGCompiler/python/extractIFCtoDB.py`), producing a corrected `jkr_aligned.db`
(`~/Downloads/OPEN SOURCE BIM/jkr_aligned.db`, a copy of `jkr.db` with only
`element_transforms.center_x/y/z` rewritten — geometry BLOBs untouched). That data-side
investigation is DONE — do not re-open it. See `bim-ootb/viewer/import_worker.js`'s new
comment block (2026-07-12) at the top of the geometry-tessellation phase for that history.

**This prompt is about a SEPARATE, unrelated bug found along the way**, in generic Viewer
code (`viewer/panels.js`), not specific to the JKR data at all.

## The bug
`A.filterDiscs(list)` (viewer/panels.js, `§NAV_FIND_002`) — used by every Find-panel
"isolate discipline" / discipline multi-select action — builds its `A.hiddenDiscs` Set by
scanning the THREE.js scene for `o.isMesh` objects only:

```js
A.collectMeshes(o => o.isMesh && o.userData.disc).forEach(obj => {
  if (!keep.has(obj.userData.disc)) A.hiddenDiscs.add(obj.userData.disc);
});
```

But most rendered elements are NOT plain `THREE.Mesh` — they're batched into
`THREE.BatchedMesh` (large uniform disciplines, metadata in `A._batchMeta[mesh.id]` =
`[{guid,storey,disc,ifcClass,slotId}, ...]`) or `THREE.InstancedMesh` (repeated families,
metadata in `A._instanceMeta[mesh.id]` = `[{guid,storey,disc,instanceIndex}, ...]`). A
discipline that's rendered *entirely* as BatchedMesh (e.g. Architecture, being the largest/
most uniform discipline in the jkr building — 3118 elements) is invisible to that `o.isMesh`
scan, so the FIRST isolate/multi-select call of the session silently adds it to
`hiddenDiscs` as an unintended side effect — and it stays hidden for the rest of the
session, even across "show all" / re-selecting it, because `A._applyDiscVisibility()`
(the function that actually *applies* `hiddenDiscs`) correctly handles all three mesh
types — it just never gets a chance to REMOVE a wrongly-added entry, since nothing
re-derives `hiddenDiscs` from scratch except `filterDiscs()` itself, which has the same bug
every time it runs.

Symptom as observed live: bboxes/wireframe for the affected discipline are positioned
correctly (bboxes read live `element_transforms` via a separate code path, unaffected).
The discipline's real mesh geometry is 100% present and correctly bound (verified via direct
SQL: `component_geometries` BLOBs non-null, `element_instances` correctly joined, positions
consistent with every other discipline — see the DB forensics in the user session, not
repeated here). But solid meshes for that discipline never render, in any X-Ray/ghost state,
regardless of DB reload, IndexedDB clear, or even full Service-Worker cache clear — because
the bug lives in an in-memory JS Set (`A.hiddenDiscs`) that a genuinely fresh page load DOES
reset to empty, but re-triggers itself the moment the user does ANY discipline isolate/
multi-select in the Find panel (which is a very common, almost-unavoidable interaction).

`A.filterByGuids()` (element-level isolate, same file) does NOT have this bug — it already
correctly enumerates all three mesh types. Only `A.filterDiscs()`'s internal
hiddenDiscs-*discovery* scan has it.

## Fix already applied (uncommitted-to-main, needs verification)
Location: this worktree (`/tmp/wt-jkr-import-note`, branch
`fix/jkr-import-worker-placement-note`). Check `git worktree list` first — reuse this one if
still present; if it's gone, recreate off `origin/main` and re-derive the fix from this
prompt's description (it's small, ~18 lines).

Two commits already made here (locally, NOT pushed):
1. `945ebcd` — docs-only comment in `import_worker.js` about the separate position bug
   (context, not part of this task).
2. `9feb7a2` — the actual fix: extends `filterDiscs()`'s discovery scan to also walk
   `A._batchMeta` and `A._instanceMeta`, matching the pattern `_applyDiscVisibility()` and
   `filterByGuids()` already use. Read this commit's diff first: `git show 9feb7a2`.

**This fix has NOT been tested live in a browser yet** — it was written from static code
reading + a live bug reproduced against the OLD (unfixed) code, but the fix itself was never
run. That's your job.

## What to actually do
1. `git worktree list` — reuse this worktree if present (branch
   `fix/jkr-import-worker-placement-note`, commit `9feb7a2` should be HEAD).
2. Serve this worktree locally (this repo's usual local dev server — check `package.json` /
   existing scripts, do not invent a new one) and open the Viewer.
3. **Reproduce the bug first, on a build WITHOUT the fix**, to confirm the diagnosis before
   trusting the fix — e.g. `git stash` the fix commit temporarily, or check out the parent
   commit (`945ebcd`) in a second worktree. Steps: open any building with a large enough
   discipline to guarantee BatchedMesh use (jkr_aligned.db is available at
   `~/Downloads/OPEN SOURCE BIM/jkr_aligned.db` if still present, or any duplex/sample
   building with 500+ elements in one discipline), do ANY discipline isolate via Find panel
   (pick a discipline, isolate it), then switch back to "ALL" / show-all. Confirm via
   console: `Array.from(A.hiddenDiscs)` shows a discipline that should be visible but isn't
   rendering solid meshes (bboxes fine, meshes missing). Screenshot it. This confirms
   baseline (bug present).
4. Re-apply the fix (`9feb7a2`), repeat the exact same steps, confirm
   `Array.from(A.hiddenDiscs)` no longer wrongly retains the discipline after "show all",
   and the discipline's solid meshes render. Screenshot it. `§`-log both `§DISC_FILTER`
   lines from before/after for the log record.
5. Regression check: confirm normal discipline isolate/multi-select still correctly HIDES
   disciplines not in the keep list (the fix is additive — verify it didn't accidentally
   make everything always-visible). Test isolating a single discipline and confirm only that
   one renders.
6. Test on at least one OTHER building beyond jkr_aligned.db (a duplex/sample building) to
   confirm no regression on smaller buildings where BatchedMesh may not even be used.
7. `§`-log everything, save the log file, read it back before concluding (Log Mandate).
8. Commit locally if you make any further changes (new commit, don't amend). **Do NOT
   push, do NOT open a PR** — PUSH PAUSE is standing until the user lifts it.
9. Report: witness screenshots (before/after), the `§DISC_FILTER`/`hiddenDiscs` log lines,
   and explicit confirmation the regression check passed.

## Out of scope
- Do NOT re-investigate the original JKR position/placement bug (`import_worker.js`
  `flatTransformation` issue) — that's closed, documented in that file's own comment.
- Do NOT touch `jkr.db` / `jkr_aligned.db` / any file under `~/Downloads/OPEN SOURCE BIM/` —
  not part of this repo, not this task.
- Do NOT push or open a PR (standing pause).

---

## 2026-07-12 — VERIFICATION EXECUTED (Fable) — diagnosis NOT confirmed; fix harmless & kept

Driver: session scratchpad `drive_discfilter.js` (headless chromium, real user path — Role View
cycle to Structural then back to All, plus direct `filterDiscs(['STR'])`/`filterDiscs(null)`),
served from this worktree on :8097. Full logs: `discfilter_out/{OLD_jkr,NEW_jkr,NEW_duplex,
OLD_clinic}.log` + 16 screenshots (scratchpad).

### Step 3 result — the bug does NOT reproduce on the parent commit (945ebcd)
Run on the ACTUAL repro building (`jkr_aligned.db`, 8,985 elements) with the UNFIXED panels.js:
- `§DRV CONTAINER_STATS invisibleToScan=[]` — every discipline, ARC included, IS visible to the
  old `o.isMesh && o.userData.disc` scan. Root fact the diagnosis missed: **THREE.BatchedMesh and
  InstancedMesh both extend Mesh (`isMesh===true`), and every one of jkr's 271 BatchedMesh
  containers carries mesh-level `userData.disc`** (`batchNoDisc:0`). The scan sees the containers.
- `STATE_AFTER_STR_ISOLATE hiddenDiscs=[PLB,ELEC,ARC,MEP,ACMV,FP]` — CORRECT full complement,
  ARC properly hidden during isolate.
- `STATE_AFTER_SHOW_ALL hiddenDiscs=[]` — nothing stuck. Same clean result on Clinic (16,071
  elements, OLD code) and via direct filterDiscs probes. §DISC_FILTER lines all correct.
- Direction-of-failure note: even where the scan CAN miss a discipline, the consequence is the
  disc *never entering* hiddenDiscs → it stays VISIBLE during someone else's isolate (a leak).
  This mechanism cannot produce "stuck hidden" — a disc absent from the scan can't be added to
  the hidden set. The observed live symptom (ARC solids never rendering) must have a different
  root cause (candidates for a fresh investigation WITH the original repro recipe: filterByGuids/
  room-isolate/X-Ray interplay leaving per-slot BatchedMesh visibility behind, or a streaming-
  side failure to build ARC's batched buckets in that session).

### Step 4-6 — fix verified behavior-neutral and kept
- Fixed panels.js (9feb7a2) on jkr: identical correct states (isolate complement, clean show-all).
- Duplex regression (small building, 38 batch + 106 instanced containers): STR isolate hides
  exactly [ARC,MEP]; show-all clears; §DISC_FILTER lines correct. PASSED.
- The fix DOES close a real latent gap the numbers expose: all 1,120 InstancedMesh containers
  have NO mesh-level `userData.disc` (`instNoDisc:1120`) — a discipline rendered ONLY as
  InstancedMesh (zero batched buckets, zero plain meshes) would be invisible to the old scan and
  would LEAK (stay visible) during isolates. Neither test building has such a discipline today,
  but imported/instanced-heavy families could. Keep the fix.

### Verdict
KEEP commit 9feb7a2 (additive, regression-clean, closes the instanced-only leak). The
"Architecture stuck permanently hidden" symptom is NOT explained by this fix — do not close the
original symptom on the strength of it; it needs its own repro-first session using the exact
original interaction sequence (which panels/lens actions were taken, X-Ray state, etc.).
NOT pushed — standing push-pause honored.
