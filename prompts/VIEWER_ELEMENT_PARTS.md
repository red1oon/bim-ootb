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
