# ⚠ DO NOT REMOVE — scope + log discipline
Scope: fix the root-cause POSITION bug in `viewer/import_worker.js` — `GetFlatMesh().
flatTransformation` gives a wrong/partial world transform for elements in certain real-world
IFC files, so a fresh Drop IFC import collapses most elements toward one residual point
instead of their true position ("well formed but miles apart"). Currently this is ONLY
fixed offline (see below) — the goal of this prompt is to close that gap so Drop IFC alone,
in the browser, produces a correct result the first time, no offline step needed.
Whitebox `§`-log first, then confirm live in a browser — Log Mandate applies, read the log
before any conclusion, exit code is not evidence. **PUSH PAUSE is standing**: commit locally,
verify on localhost — do NOT `git push`, do NOT open a PR.

## Context — read RESUME_ARCH_DISC_FILTER_STUCK_HIDDEN.md first for the fuller saga
That file has the full history: a `filterDiscs()` BatchedMesh-enumeration bug that turned out
to be a red herring (kept anyway, harmless, commit `9feb7a2`), and a real x1/1000 vertex-scale
crush bug that WAS the actual cause of "ARCH meshes invisible" — fixed, tested, committed as
`dcf8aa6` ("self-heal x1/1000-crushed geometry vertex scale at import time"). That fix is DONE,
validated, and must not be re-touched by this task.

**This prompt is about the OTHER, still-open bug** — the original position/placement issue that
started the whole investigation, days before the scale bug was even found. It causes the same
visual symptom family but is a completely different mechanism:
- Scale bug (fixed): mesh SHAPE ends up 1000x too small — "dust".
- Position bug (THIS task, still open): mesh shape is the right SIZE, but ends up in the wrong
  PLACE — most elements collapse toward one point, some (mostly `IfcBuildingElementProxy`) land
  correctly, giving the illusion of a coherent building shell when actually broken underneath.

## Where it's currently patched around (offline only — not a browser fix)
`~/Downloads/OPEN SOURCE BIM/jkr_fixed.db` is a fully-correct, hand-repaired copy of the
original broken import, built via:
1. `bim-compiler/scripts/extract_merge_disciplines.py` + `DAGCompiler/python/extractIFCtoDB.py`
   — re-extracts all 7 source IFCs via `ifcopenshell.geom.iterator(... USE_WORLD_COORDS=True)`,
   a full geometry-tessellation engine (NOT web-ifc), giving correct positions.
2. `bim-compiler/scripts/fix_mm_scale_blobs.py` — the offline equivalent of the now-shipped
   `§JKR_SCALE_SELFHEAL` fix.
3. One manual, file-specific repair: the CW (Chilled Water) source file's `IfcSite` was
   exported with a literal `(0,0,0)` placement instead of the real shared value its sibling
   files (`ACMV`/`SP`/`FP`, same `IfcSite` GUID `2S4LwbMxn0dRJ4_xS9Arhq`) correctly carry — a
   genuine source-file authoring defect, fixed by borrowing the sibling's correct offset. This
   is OUT OF SCOPE for this task (see below) — it needs human judgment, not a generic algorithm.

This whole offline detour is real, working, and proves the destination state is achievable — but
a real end user never touches Python. The goal here is closing that gap in the browser.

## What was already tried and FAILED — do not repeat this exact approach
Ported `bim-compiler/DAGCompiler/python/extractIFCtoDB.py`'s `_placement_matrix()` function (a
numpy `IfcLocalPlacement → PlacementRelTo` chain walker) to JavaScript, intending to use it as a
cross-check against `flatTransformation`'s implied position, correcting on disagreement — same
successful pattern as the scale self-heal.

**It failed a live test, and the reason why matters:**
- `_placement_matrix` turned out to be DEAD CODE in that Python file — defined, never called.
  The REAL pipeline that produces correct results (`extractIFCtoDB.py`'s actual extraction path)
  uses `ifcopenshell.geom.iterator(settings, ifc_file)` with `USE_WORLD_COORDS=True` — a full
  geometry-TESSELLATION engine, not a raw entity-attribute placement walk.
- Verified empirically (Python, `ifcopenshell.util.placement.get_local_placement()` — the SAME
  pure-`ObjectPlacement`-chain algorithm as the dead `_placement_matrix` and as the JS port):
  for one specific wall (`guid=2cz3uV5cr48vgUdp1iL8Vy`, `jkrAR25_5a...ifc`), `get_local_placement`
  and the manual JS port agreed EXACTLY (271393.941, 721391.347, 81.0mm) — so the *algorithm* is
  correctly implemented, not a porting bug.
- But the AGGREGATE result across the whole ARC file, using this ObjectPlacement-only method,
  gives Z=[-85.5, 254.5] (a nonsensical 340m spread for a ~91m building) — the EXACT SAME wrong
  range `extractIFCtoDB.py`'s own pre-tessellation diagnostic (`§PRE_NORM`) logs BEFORE it runs
  the real geometry-engine extraction. The real, correct pipeline (tessellation-based) gives
  Z=[80.7, 91.2] for the same file — correct.
- **Conclusion: pure `ObjectPlacement`-chain reading (what both the dead Python function and the
  JS port do) is fundamentally insufficient for this file family.** Something the FULL geometry/
  representation engine composes — almost certainly `IfcMappedItem` / `IfcRepresentationMap.
  MappingTarget` handling, or possibly `IfcGeometricRepresentationSubContext` — is missing from a
  raw placement walk, for at least some elements/classes. NOT CONFIRMED which exactly — that's
  unresolved investigation, not a guess to act on without verifying first.
- The attempted JS fix was reverted (`git checkout -- viewer/import_worker.js` in this worktree).
  HEAD is back to commit `dcf8aa6` (scale self-heal only) — clean, safe, nothing broken.

## What to actually do
1. **Investigate first, don't guess.** Pick one element from `jkrAR25_5a_...ifc` (or any JKR
   file) whose `ObjectPlacement`-walk position is wrong (cross-check against `jkr_fixed.db`'s
   correct value for the same guid). Dump its FULL representation tree via ifcopenshell:
   `IfcProductDefinitionShape → IfcShapeRepresentation → Items[]` — check specifically whether
   any `Items[]` entry is an `IfcMappedItem`, and if so what its `MappingSource.MappingOrigin`
   and the target product's own placement compose to. Compare against what
   `ifcopenshell.geom.create_shape(settings, el)` (with `USE_WORLD_COORDS=True`) actually
   produces for that element, to isolate exactly which extra transform closes the gap.
2. Once the exact missing composition step is identified and understood (not guessed):
   - **Preferred**: extend the JS placement walker to also compose that missing piece,
     mirroring it faithfully, using `ifcApi.GetLine()` to read the relevant raw IFC entities
     (same pattern as the reverted attempt — see `git show dcf8aa6` for the surrounding style,
     though the removed code itself is gone; re-derive from this prompt's description).
   - **Alternative worth checking first, possibly cheaper**: `viewer/lib/web-ifc.wasm` is
     pinned at web-ifc `0.0.77` (`node_modules/web-ifc/package.json`, md5
     `01a4b337f50e22a587201b83197cea86`). Check web-ifc's upstream changelog/issue tracker for
     any known fix to `GetFlatMesh().flatTransformation` composition for deeply-nested or
     `IfcMappedItem`-heavy placement chains. If a newer version fixes it, that's a smaller,
     more durable change than reimplementing IFC geometry composition by hand — but a version
     bump is its own risk surface (different WASM binary, different API surface potentially) —
     test broadly before trusting it, same rigor as anything else here.
3. Implement as a cross-check/self-heal, not a blind replacement — same proven philosophy as
   the scale fix: compute via the existing method, compute via the new/corrected method, only
   override on a clear, high-confidence disagreement. Never silently trust a single method for
   something this consequential.

## How to verify — reuse the existing test harness, don't reinvent
`/tmp/claude-1000/-home-red1-bim-compiler/3dfd587b-a631-48f9-b14a-4905ae5cb0bd/scratchpad/
selfheal_test/test_selfheal.js` (may have been cleaned up by the time you read this — if gone,
the pattern is simple: plain Node http server serving this worktree, headless Playwright
chromium, `page.evaluate()` that does `new Worker(base+'/viewer/import_worker.js')` directly,
`postMessage({arrayBuffer, filename, wasmBytes})`, inspect the returned `elements`/`geometries`/
`transforms` and console `§` lines from the `done` message — no UI simulation needed, this tests
the worker file directly).

- Ground truth: `~/Downloads/OPEN SOURCE BIM/jkr_fixed.db` — already verified to 0 vertex-scale
  mismatches across all 8985 elements; use its `element_transforms` per-discipline spread as the
  target (`SELECT discipline, MIN/MAX(center_x/y/z) FROM elements_meta JOIN element_transforms
  ... GROUP BY discipline` — expect all 7 disciplines within roughly X 271,392–271,453 /
  Y 721,363–721,405 / Z 68–153, NOT collapsed to a ~271.4/721.4 point, NOT the wide
  -85.5..254.5 pre-tessellation range).
- Test against all 7 JKR source files in `~/Downloads/OPEN SOURCE BIM/IFC 4/` (a full
  `importMultiIFC` merge, matching real usage) — not just the ARC file alone.
- **Non-negotiable regression check**: run the identical test against
  `~/bim-ootb/IFC/Duplex_ARC.ifc` (small, non-georeferenced, never had this bug) and confirm
  ZERO position change from current behavior. A fix that moves anything for a file that already
  works correctly is not acceptable — reject it and go back to step 1.
- §-log everything, save logs, read them before concluding — do not trust a clean exit code.

## Out of scope
- The CW file's own broken zeroed `IfcSite` — a genuine source-file defect, not a generic
  pattern (needs human judgement: noticing a shared `IfcSite` GUID with correct sibling data).
  Do not attempt to auto-detect/auto-fix this class of issue as part of this task.
- Do not modify the scale self-heal (`dcf8aa6`) — already correct, tested, committed, working.
- Do not touch `jkr.db` / `jkr_aligned.db` / `jkr_fixed.db` or anything under
  `~/Downloads/OPEN SOURCE BIM/` — reference-only, not part of this repo.
- Do not push, do not open a PR — standing pause.

## Definition of done
A fresh Drop IFC of all 7 JKR IFC4 files, through the actual browser import path (`import.js` →
`import_worker.js`, no offline step, no Python), produces `element_transforms` positions
matching `jkr_fixed.db`'s per-discipline spread (within a few cm) for the 6 correctly-
georeferenced files (everything except CW, which stays out of scope). Verified live via the
Playwright-driven direct-worker test, with the Duplex regression check showing zero change.
§-logged, committed locally on this worktree/branch, NOT pushed.
