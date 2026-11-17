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

### Review fix 2026-11-18 (before merge)
- `A.filterByGuids` (panels.js:862) only touches meshes that exist when it runs, and `streaming.js` never reads `activeGuidFilter`. So a host streamed AFTER the hook fired would be drawn again. The hook now waits for `APP.streaming === false` (cap 180 s, logged), not `streamedCount > 10`.
- The merge step builds new merged meshes after streaming. `streaming.js` §MERGE_CONTRACT now re-applies any active isolate (`§MERGE_ISOLATE_REAPPLY isolate=N`), the same re-apply as dlod_nav.js:1885. This is generic: it also fixes a Find isolate set during streaming.
- Re-run after the fix: W-PARTS-VIEW pass=8 fail=0; P5 on the layer-split DB hostsHidden=88 partsShown=220 orphanLinks=0; SW audit 296/0. Browser timing still not witnessed (no browser run).
- Known trade-off, owner call: any isolate turns nav-DLOD off (dlod_nav.js:397), so a DB with parts runs without DLOD while the parts view is on.

## S-G4 fix 2026-11-18 (two Viewer defects found by the film lane; specs S-G4a / S-G4b in bim-compiler `prompts/FILM_LOD_UPGRADE_FIND.md`)

### S-G4a, Find open / clear must not drop the parts view
- Issue proved: `A.openFindPanel` runs `A.filterByGuids(null)` (`viewer/nf_panel_search.js:88`), so the parts view that loaded with the DB is replaced by "show everything" and the hosts cover their parts again. Measured: `isolate_size_right_after_Find_opens=null`.
- Fix (ONE rule, in `parts_view.js`, no per-DB code): while the parts view is on, it is the BASE filter. `setupPartsView` wraps `A.filterByGuids`: a `null` argument (clear / restore all) applies the parts keep set instead. A non-null isolate (a Find result set, drawn-only, ...) is applied unchanged. `A.partsView(false)` restores the previous isolate through the original function, so it still reaches "all". `window.filterByGuids` is re-pointed when it was the original. Log: `§PARTS_VIEW base-restore isolate=N`.
- Witness claim: P6 in `viewer/tests/witness_parts_view.js`. With the parts view on, `A.filterByGuids(null)` leaves `activeGuidFilter` = the parts keep set (size 8 in the fixture, not null); a non-null Set passes through unchanged; after `partsView(false)` a `null` clear really means all. `PARTS_VIEW_BREAK=1` makes the base-restore a no-op: P6 must FAIL.

### S-G4b, a key handler must not eat keys typed into an editable field
- Issue proved: `scene.js` panel-focused routing sends plain `' '` to the panel nav and `preventDefault`s it, with no input guard, so `Fin plate` typed into Find becomes `Finplate` (`§KBD_ROUTE panel=find key=  `, 0 matches). The shared guard `notInput` only looked at INPUT/TEXTAREA.
- Fix at the routing point: one predicate `_kbdEditable(target)` (INPUT, TEXTAREA, SELECT, contenteditable) replaces the inline `notInput` test, and `_kbdPanelRouteConsumes(e, noMod)` is the panel-route condition; a plain space (no ctrl/alt/meta) aimed at an editable target is NOT consumed. Arrow / Enter / Ctrl+Space routing is unchanged. The sibling router `navigate_engine.js navKeyHandler` (consumes `' '`, `w`, `s` while walking) gets the same guard.
- Witness claim: `viewer/tests/witness_kbd_editable_route.js` evaluates the REAL predicate text from `scene.js` (marker block) and asserts: space on INPUT / TEXTAREA / contenteditable / SELECT = not consumed; space on a non-editable target = consumed; ArrowDown on INPUT = consumed (unchanged). `KBD_ROUTE_BREAK=1` drops the editable test: the space-on-INPUT legs must FAIL.
- Real-Viewer leg (headless, software GL, JPAM film DB read-only): open Find, type `Fin plate` -> input value `Fin plate`, panel count 50; isolate size after Find opens = the parts keep set, not null.

### RESULT S-G4 fix 2026-11-18
- Node: `witness_parts_view.js` pass=13 fail=0 (P6 BASE-RESTORE / NONNULL-UNCHANGED / CLEAR-FIND-ISOLATE / OFF-MEANS-ALL / NO-PARTS-DB-UNCHANGED; P5 INCONCLUSIVE, optional); with `PARTS_VIEW_BREAK=1` P6 BASE-RESTORE and CLEAR-FIND-ISOLATE FAIL (pass=9 fail=4). `witness_kbd_editable_route.js` PASS pass=11; with `KBD_ROUTE_BREAK=1` the five K1 space-in-field legs FAIL (pass=6 fail=5).
- Real Viewer (headless, software GL, JPAM film DB read-only, Ctrl+O open, `parts_view` line `hostsHidden=181 partsShown=529`): isolate before Find 6956; opening Find logs `§PARTS_VIEW base-restore isolate=6956` and `§FILTER_GUIDS isolate=6956` (was `null`); typing `Fin plate` leaves `input.value="Fin plate"` and the panel shows `50 found` (was `Finplate`, 0); close and reopen Find: isolate 6956.
- Observed, not changed here: on the FIRST Find open of a large model, `navigate_find.js:60-63` auto-builds the shell ghost, and `nf_highlight_cost.js:433` then calls `filterByGuids(new Set())` ("hide solids so the ghost stands alone"), so the isolate reads 0 for as long as that lens is up (it fired ~30 s after the open here). That is the Find lens' own isolate (spec: a Find-made isolate is still cleared), and clearing it returns to 6956. Whether the ghost lens should stack on the parts view is a separate question.
