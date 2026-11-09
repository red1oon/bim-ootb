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
