# ⚠ DO NOT REMOVE
SCOPE: the Viewer shows an element's **parts** (table `element_parts`, parent → child) instead of the parent's own body, so a layer split or any decomposition is visible. Generic, for any DB with `element_parts`; no per-building code. Read the log after every run (`§PARTS_VIEW`, `§W-PARTS-VIEW`); the exit code is not evidence.

## Issue (2026-11-18)
A DB can carry an element AND its parts: a wall and its layer pieces (insulation, finish, board), each in the same volume. `element_parts` is read nowhere under `viewer/` (measured on origin/main), so the parent body is drawn over its parts. The parts can be found by the Find panel's text search, but they cannot be SEEN: they share the host's faces. Measured on a layer-split model DB: 88 hosts, 220 parts, all coincident.

## Rule
- On DB open, if `element_parts` exists and has rows whose child is present in `elements_meta`, the Viewer hides every PARENT that has at least one present child, and keeps everything else. It uses the existing generic isolate `A.filterByGuids(keepSet)`, as the drawn-only view does (`cpe_drawn_services.js` `A.drawnOnlyView`), never a second hide mechanism.
- `A.partsView(on)`: `on=false` restores the previous filter, the same restore pattern as `drawnOnlyView`. It is on by default after open when parts exist.
- One log line: `§PARTS_VIEW hostsHidden=N partsShown=M elements=E byHostClass={...}`. When there is no table or no row: `§PARTS_VIEW VACUOUS (no element_parts rows: nothing hidden)`.
- Find still lists hosts; only their body is not drawn while the parts view is on.
- A parent whose children are ALL missing from `elements_meta` is not hidden. It is counted as `orphanLinks`.

## Witness W-PARTS-VIEW (`viewer/tests/witness_parts_view.js`; issue: *"a host and its parts are drawn in the same place, so the parts are invisible"*)
Node, no browser. Loads `viewer/parts_view.js` (the logic as a pure function `partsKeepSet(rows, allGuids)` + the `A.partsView` wiring) against a fixture DB built in the test with sql.js or better-sqlite3:
- **P1 HIDE:** 3 hosts with 2, 3 and 1 parts, and 2 unrelated elements. The keep set excludes the 3 hosts and includes the 6 parts and 2 others.
- **P2 ORPHAN:** a link whose child is absent leaves its parent visible; `orphanLinks=1`.
- **P3 VACUOUS:** no table, so `VACUOUS` is printed and nothing is hidden.
- **P4 RESTORE:** `partsView(false)` gives back the previous filter object.
- **P5 REAL (optional):** if `$PARTS_REAL_DB` is set, open it read-only. hostsHidden = distinct present parents, partsShown = present children, and the counts are printed. Off on CI.
- Break switch `PARTS_VIEW_BREAK=1` makes the keep set include parents, so P1 must FAIL.

## RESULT 2026-11-18
Built: `viewer/parts_view.js` (pure `partsKeepSet(rows, all)` + `A.partsView(on)`), lazy-loaded from `viewer/main.js` (new `§PARTS_VIEW` block just before `§LIGHT_FIELD_DB`), `viewer/sw.js` (`parts_view.js` in PRECACHE next to `cpe_drawn_services.js`, `CACHE_VERSION` v1736 -> v1737), `viewer/viewer.html` (`main.js?v=64`), witness `viewer/tests/witness_parts_view.js`.
- **Hook point:** DB open sets `A.db` at `streaming.js:3829` (split) / `:4032` (whole); meshes do not exist yet there, so the hook is the post-init `if (APP.db)` block in `main.js`: it reads `element_parts` row count; only if > 0 does it inject `parts_view.js?v=1`, wait for `APP.streamedCount > 10` (same gate as the scene-state restore, 20 x 1500 ms cap) + 1500 ms, then `APP.partsView(true)`. Isolate = `A.filterByGuids` (`panels.js:862`), restore pattern = `cpe_drawn_services.js:87-94`.
- **Choice beyond the spec:** if an isolate is already active at that moment (a saved Find isolate from `§SCENE_STATE_RESTORE`, or the user's), it is NOT overridden: `§PARTS_VIEW SKIP (an isolate is already active: not overridden)`. `A.partsView(true)` called twice keeps the first previous isolate (no stacking).
- **Known side effect (owner decision):** `filterByGuids` sets `A.activeGuidFilter`, and `dlod_nav.js:397` (`_gateBlockReason`) fully disengages nav-DLOD while any isolate is active, so a parts DB runs with DLOD off while the parts view is on. This follows from the spec's "use the existing isolate"; `partsView(false)` re-enables it.
- **Normal run (`parts_normal.log`):** `§PARTS_VIEW hostsHidden=3 partsShown=6 elements=11 byHostClass={"IfcWall":2,"IfcSlab":1}`; P1 HIDE/LOG/ISOLATE-USED, P2 ORPHAN (`orphanLinks=1`), P3 VACUOUS (+ empty table), P4 RESTORE (+ RESTORE-ALL) all `§PASS`; P5 `§INCONCLUSIVE` (no `$PARTS_REAL_DB`). Verdict `INCONCLUSIVE-PARTIAL pass=8 fail=0 inconclusive=1`.
- **Break (`PARTS_VIEW_BREAK=1`):** `§FAIL P1 HIDE | keep=11 ... hosts-in-keep=H1,H2,H3`, `§FAIL P2 ORPHAN`; verdict `FAIL pass=6 fail=2`, exit 1.
- **P5 with `$PARTS_REAL_DB` (read-only, a layer-split model DB):** `§P5 real db: element_parts rows=220 elements=6828 hostsHidden=88 partsShown=220 orphanLinks=0 byHostClass={"IfcWallStandardCase":52,"IfcSlab":16,"IfcCovering":20} hostsStillInKeep=0 (SQL says hosts=88 parts=220)`, `§PASS P5 REAL`, verdict `PASS pass=9`. Same DB with the break: `§FAIL P5 REAL` (hosts still in keep).
- **SW audit:** `§SW_AUDIT_SUMMARY 296 found, 0 missing, 0 known-missing, 296 total`; `§SW_AUDIT_UNLISTED_SUMMARY 219 precached, 0 unlisted`.
- Not witnessed here: the browser wiring in `main.js` (timing + lazy load) is Node-untestable under the no-browser rule; the witness drives `A.partsView` against a stub of `A.db`/`A.filterByGuids`.
