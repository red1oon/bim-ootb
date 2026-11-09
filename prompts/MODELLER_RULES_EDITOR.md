# ⚠ DO NOT REMOVE — scope: the walker's rules readable and editable as JSON in the Modeller, through the project's ONE JSON editor. Read the log after every run.

**Owner, 2026-11-09:** *"The rules are editable JSON"* (film narration ask), then *"If can abstract out the editor and close the gap."*
**Gap (code read, bim-ootb `c070ab69`):** the walker's rules are SQLite tables in `modeller/<class>_rules.db` (rule_space_schedule, rule_placement, rule_shim, rule_routing …; some columns hold JSON, e.g. `rule_routing.params_json`), shipped as text patches (`modeller/patches/*.sql`). No user can see or edit them in the Modeller. The project's standard JSON editor (`viewer/settings_editor.js`, "ZERO app-specific identifiers … free for any app to reuse") lives in the Viewer only.

## Rule
1. **One editor, shared.** `viewer/settings_editor.js` moves to `common/settings_editor.js` unchanged (git mv). The Viewer loads `../common/settings_editor.js`; its sw precache and the 6 tests that read the file point there. No second editor.
2. **Rules as JSON.** `modeller/rules_editor.js` (lazy, first click) shows the loaded rule set as `{ <table>: [ {id, label, …columns} ] }`, one collapsible section per rule table, through `SettingsEditor.jsonToSchema` (no renderer change). Row id = `<table>:<rowid>`; `rules_meta` is read-only.
3. **An edit is a cell.** `onChange(rowId, key, value)` records `{ "<table>:<rowid>": { <column>: value } }`. Save applies each cell to the live rules DB (`UPDATE … WHERE rowid=?`, bound parameters) and stores the edit set in `localStorage['dw_rules_user:<rules file>']`.
4. **Edits travel like the self-heal patch.** `DiscWalker.dwInit` re-applies the stored edit set after the shipped patch (`§DW-RULES-USER file= cells= ok|error`). Reset clears it and reloads the shipped rules. A cell whose row/column no longer exists is skipped and counted, never invented.
5. **Contribute.** Download writes the edit set as JSON (rules file, building class, cells, and the equivalent SQL) for a user to send back.
6. **Entry:** toolbar button `#b-rules` "Rules", title "Walker rules (JSON): read and edit the rules the walker uses for this building type".
7. Log: `§RULES-EDIT open file= class= tables= rows=`, `§RULES-EDIT save cells=`, `§RULES-EDIT reset`, `§RULES-EDIT download cells=`.

## Witness W-E2E-RULES-EDIT (Duplex, real UI)
- E1 OPEN: the Rules button opens the editor on the loaded rule set; `rule_space_schedule` row count = the DB's.
- E2 EDIT-CHANGES-WALK: walk ELEC; type a new `z_offset_m` (+0.5 m) into a placed device's schedule row in the editor; Save; walk again: that device's z moves by +0.5 m (±1e-6), every other device unchanged. RED: no editor on main.
- E3 PERSISTS: reload the page, open Duplex, walk: `§DW-RULES-USER … cells=1 ok` and the same +0.5 m.
- E4 RESET: Reset → the walk returns to the original z.
- E5 DOWNLOAD: the downloaded JSON holds the one cell and its SQL.
- Regression: the Viewer's settings-editor tests (6) and W-JSON-4D5D on the moved file.

## §CLASS-SHARED — an edit belongs to a building TYPE, and says so (2026-11-09, owner: "yes", build them)
**Owner, 2026-11-09:** *"Since the JSON is newly constructed, should we put a note that it be reviewed against the other building models?"* then *"yes"* to (a) (b) (c) below.
**Issue (code read, bim-ootb `0a3f1b0c`):** the rules live in one file per building TYPE, so one edited cell changes every building of that type. The editor did not say so; the downloaded edit carried no record of which buildings it was checked on; nothing proved that opening the editor (with no edit) leaves walks unchanged.
**Measured, code read:**
- `common/walk_rules.js`: `duplex_rules.db` → residential (residents SampleHouse, Duplex, SampleCastle); `terminal_rules.db` → terminal (HHS, Clinic, Hospital, HospitalGarage, Terminal); `farm_rules.db` → farm (**no resident**; only a user's own building whose name matches the farm pattern).
- A file is also read by the OTHER type: terminal walks read room schedules from `duplex_rules.db` (`SCHEDULE_SOURCE`); residential walks borrow FP from `terminal_rules.db` (`modeller.html` `_dwEnsureBorrow`). The page applies a user's edits only where the file is the building's own rules (`dwInit` → `applyUserRules`), not where it is read as schedule source or FP borrow (`dwScheduleSourceFile`, `dwBorrowFile`). So a live edit stays inside its type, but the same edit folded into the shipped file would move the other type's walks too. The fleet check below therefore walks every READER of the file, not only its own type.

**Rules:**
- **(a) Header.** Under the title: *"These rules are shared by every <class> building"* and the residents of that class (from `WalkRules.rulesDb` over the Open chooser's resident list), or *"no resident building uses them"*. Log: `§RULES-EDIT open … shared=<n> residents=<names>`.
- **(b) `checkedOn`.** The downloaded edit file carries `checkedOn: []`. The page never fills it (it runs no fleet check). Only the fleet check writes it.
- **(c1) Sweep, no edit (page).** For every resident: open it, Walk ALL twice (the second walk is the reference: a walk reads the other services' placements, so walk 1 ≠ walk 2 is expected), open the editor, close it, Walk ALL again. Same placements as the reference, per discipline (JSON of `{device, ifc_class, x, y, z}`), the rules DB content unchanged (SHA-256 over every table's rows in rowid order; not `export()`, which closes and reopens the DB and would disturb the walker), nothing stored. `farm_rules.db` (no resident): load it with no building open, open and close the editor, content unchanged; the walk is stated NOT JUDGED.
- **(c2) Fleet check (node).** `modeller/tests/rules_edit_fleet_check.js <edits.json> [out.json]`: the readers of the edit's rules file = every Modeller resident whose own rules, schedule source or FP borrow is that file (roles `own|schedule|borrowFP`, from the real `WalkRules` + the page's borrow rule). Each reader × each discipline: walk with the shipped rules, then with the cells applied to that file wherever it is opened; list what moved. Writes the edit file back with `checkedOn` (buildings walked) and `fleet` (rows: building, role, disc, placed before/after, moved). `§RULES-FLEET row …`, `§RULES-FLEET done readers= walks= moved=`.

**Witness W-RULES-CLASS (page, real UI) — `modeller/tests/witness_rules_class.js`:**
- C1 HEADER: on Duplex the header says *"shared by every residential building"* and lists SampleHouse, Duplex, SampleCastle; on Terminal *"terminal"* and its 5. RED on main.
- C2 CHECKEDON: the download holds `checkedOn` = `[]`. RED on main.
- C3 NO-EDIT SWEEP: (c1) on every resident; farm content-only. A resident whose walk placed nothing = VACUOUS for that row.
- C4 NOT BLIND: on Duplex, one saved cell (+0.5 m `z_offset_m`, the W-E2E-RULES-EDIT pick) makes the same comparison FAIL; then Reset.

**Witness W-RULES-FLEET (node) — `modeller/tests/witness_rules_fleet.js`:**
- F1 EMPTY EDIT: an edit file with no cells → every reader walked, moved = 0 on every row.
- F2 ONE CELL: the Duplex +0.5 m cell → Duplex (own) moves exactly the devices of that row; every reader row is listed; `checkedOn` = the readers walked.
- F3 STALE CELL: a cell whose row does not exist is counted skipped, nothing moves.

**Witness method findings (measured while building it, 2026-11-09):**
- **Walk ALL is not a re-walk.** It skips every service already present (measured on Duplex: second Walk ALL = walked 0, skipped 4). A first draft compared two Walk ALLs and "passed" while judging nothing. The witness now re-walks each discipline itself and counts that each re-walk ran.
- **Re-walks take a few passes to settle (walker behaviour, not the editor).** Each service avoids the others' current placements. Duplex, no editor opened: round 2 moved 2/5/2 ACMV/ELEC/PLB devices, round 3 moved 1/1/1, rounds 4 and 5 identical. Clinic: PLB 1,520 → 1,519 on the first re-walk, then stable. A user who walks a service again can therefore see a few devices move with no rule changed. The page reference is a settled walk (two identical rounds in a row); the node fleet check walks each service independently (avoid = []), so its difference is the edit alone.
- **The node fleet check counts the walker's placements before the page's LOD400 mesh gate.** SampleHouse: node places ELEC 26, PLB 7, FP 17; the page refuses all four services there ("no LOD400 mesh … refused, never a box"). So a fleet row can show a device moving that the page would refuse to draw. The page sweep marks SampleHouse VACUOUS for that reason.

## §CLASS-SHARED RESULT 2026-11-09 (branch `feat/rules-editor-class-checkedon`, off main `0a3f1b0c`)
**RED on main first** (Duplex): C1 `no #rules-shared`, C2 `checkedOn=undefined`; C3 passes (regression guard); C4 not blind.
**W-RULES-CLASS (page), per resident, logs `witness_rules_class` runs:**
| Resident | file | C1 header | C3 settled placements, open+close = same | rules hash |
|---|---|---|---|---|
| SampleHouse | duplex | ✅ | VACUOUS: the page refuses all 4 services (no LOD400 mesh) | 8eda6607 = |
| Duplex | duplex | ✅ (+ C2 ✅) | ✅ 177 | 8eda6607 = |
| SampleCastle | duplex | ✅ | ✅ 126 (FP) | 8eda6607 = |
| HHS | terminal | ✅ | ✅ 1,840 | c845704a = |
| Clinic | terminal | ✅ | ✅ 1,519 | c845704a = |
| Hospital | terminal | — (RESIDENTS run) | ✅ 9,125 | c845704a = |
| HospitalGarage | terminal | — | **INCONCLUSIVE**: the headless tab died (detached frame) after the settled re-walks, before the editor opened; twice (64 and 117 min, software GL). Instrument limit, not an editor result. | — |
| Terminal | terminal | ✅ | ✅ 2,298 | c845704a = |
| (farm_rules.db) | farm | ✅ "every farm building; no resident building uses them" | content only, walk NOT JUDGED | 385a894c = |
C4 NOT BLIND ✅: one stored cell (`rule_space_schedule:78` z 0.85 → 1.35) → ELEC and PLB differ from the settled reference.
**Bug found by the farm row and fixed:** the header took the class from the open building's NAME, so with `farm_rules.db` loaded and no building open it said "terminal". Now `WalkRules.classOf(file)` (added to the one owner, `common/walk_rules.js`; W-SEAM-W3C still PASS). The first farm assertion did not check the class word; it does now.
**W-RULES-FLEET (node) 4/0, 6 min:** F1 empty edit, `duplex_rules.db`: 8 readers (3 own, 5 schedule), 42 walks, 27,937 placements, moved 0. F1 `terminal_rules.db`: 8 readers (5 own, 3 borrowFP), 42 walks, moved 0. F2 the Duplex cell: Duplex ELEC moved 6 = the 6 devices of that row; no other row of any reader moved; `checkedOn` = all 8. F3 the stale cell: skipped 1 on every reader.
**Regression:** W-E2E-RULES-EDIT 7/0 · W-BAND-REANCHOR 12/0 · W-MAINS 6/0 · W-DRAWN-WALK 87/0 · W-SEAM-W3C PASS. The harness edits are additive (`openBuildingRules(…, edit)`, e2e `protocolTimeout` opt).
**Open (owner):** a user's live edit reaches only buildings whose OWN rules are that file; the other type reads the same file without the edit (schedule source, FP borrow). Should a live edit also apply where the file is read as schedule source / FP borrow? (Today: no. The fleet check reports both.)

## §ALL-READERS — an edit applies wherever its file is read (owner 2026-11-10: "Go with your take on both")
**Question (§CLASS-SHARED RESULT, open):** should a live edit also apply where the file is read as schedule source / FP borrow? **Decided: yes.** One file = one truth: the same file must not read two ways in one browser, and the fleet check already walks it that way, so the page and the check now agree.
**Issue (code read, `disc_walker.js` `dwBorrowFile` ~L68, `dwScheduleSourceFile` ~L79, `a751e458`):** only `dwInit` (own rules) calls `applyUserRules`. A terminal building reads `duplex_rules.db` room schedules through `dwScheduleSourceFile`, which applies neither the user's cells nor the self-heal patch (the node harness applies the patch on every open, so page and harness also disagree there). A residential building borrows FP from `terminal_rules.db` through `dwBorrowFile`, which applies the patch but not the cells. Both cache by file name, so a newer saved edit would not reach an already-open copy.
**Rules:**
1. One opener for a side file: `_openSide(db, file, baseUrl)` = self-heal patch, then the user's cells (`applyUserRules`), the same order as `dwInit`. Used by `dwBorrowFile` and `dwScheduleSourceFile`. `§DW-RULES-USER file= cells= skipped= ok` prints for side files too, with `as=schedule|borrow:<disc>`.
2. The cache key is the file AND the stored edit's `saved` stamp: an open copy whose stamp differs from storage is reopened.
3. Header names every reader: own class (as now) + *"Also read by <names> for their room schedules"* (residents whose `WalkRules.scheduleDb` is this file) + *"… for their sprinkler (FP) rules"* (residents whose own file has no FP rule, when this file is the FP source). The FP source is named once, `WalkRules.FP_BORROW = 'terminal_rules.db'`, and `_dwEnsureBorrow` and the node harness read it from there. Whether a file has an FP rule is read from that file (`DiscWalker.fileHasRules`, the same cached loader as `dwInit`).
**Witness W-RULES-CLASS, added claims:**
- C1 (extended): Duplex header says "Also read by HHS, Clinic, Hospital, HospitalGarage, Terminal for their room schedules"; Terminal header "Also read by SampleHouse, Duplex, SampleCastle for their sprinkler (FP) rules". RED on main.
- C5 SCHEDULE-READER: a stored cell on `duplex_rules.db` (`rule_space_schedule:78` z_offset_m = 1.35), open Clinic, walk ELEC: the room-schedule copy the walk opened holds 1.35, and `§DW-RULES-USER … as=schedule`. RED on main. **Limit, measured:** no public resident's walk serves a space from the schedule source (`§DW-SCHED-SOURCE … spaces=0 served=0` on HHS, Clinic and Terminal), so on public data this proves the rules the walk reads, not a moved device.
- C6 BORROW-READER: a stored cell on `terminal_rules.db` (one FP `rule_placement` value), open Duplex, walk FP: the borrowed FP rules hold the stored value (read from `DiscWalker.sideDbs().borrow.FP`) and `§DW-RULES-USER … as=borrow:FP`. RED on main. (Limit, stated: this proves the cell reaches the borrowed rules, not a moved sprinkler.)
- C7 STALE-COPY: with Clinic open and walked, store a second value (1.6) for the C5 cell, walk again: the copy holds 1.6 (rule 2).

## §ALL-READERS RESULT 2026-11-10 (branch `feat/rules-edit-all-readers`, off main `a751e458`)
**RED on main**, with only the read-only `sideDbs()` hook added so the copies could be inspected: C5 schedule copy held the shipped **0.85**, C7 **0.85**, C6 borrowed FP rules held the shipped **172**; C1 both headers lacked the "Also read by" line.
**GREEN:** W-RULES-CLASS (Duplex, Terminal, readers) 9/0 + readers re-run 4/0:
- C1: Duplex "… Also read by HHS, Clinic, Hospital, HospitalGarage, Terminal for their room schedules."; Terminal "… Also read by SampleHouse, Duplex, SampleCastle for their sprinkler (FP) rules." (the FP readers are read from each file: `fileHasRules`).
- C5 held 1.35, `§DW-RULES-USER file=duplex_rules.db cells=1 skipped=0 ok as=schedule`. C7 held 1.6 with Clinic still open. C6 held 999, `… ok as=borrow:FP`.
- C3 no-edit unchanged: Duplex 177, Terminal 2,298. C4 not blind.
**Regression:** W-E2E-RULES-EDIT 7/0 · W-RULES-FLEET 4/0 · W-SEAM-W3C PASS · W-BAND-REANCHOR 12/0.
**Changed:** `disc_walker.js` one side-file opener (`_openSide`: patch, then cells) for both `dwBorrowFile` and `dwScheduleSourceFile`; the cache reopens a copy whose stored edit changed; the schedule source now gets the self-heal patch too (as the node harness always did). `WalkRules.FP_BORROW` names the FP source once (`_dwEnsureBorrow` and the harness read it; two literals removed). sw v268.
**Witness fix found on the way:** the FP borrow is made on OPEN (`__ensureDiscWalker`), so its log line comes before the walk; C6 reads the log from before the open.
