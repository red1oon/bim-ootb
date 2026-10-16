
### ⚠ AMENDMENT 2 to §CPE_PACE_LOS (user, 2026-07-27) — the total field stays the global speed knob
> *"remember there is also the overall speed control ie the total time of movie length in the panel
> can be set to a faster when reduced, or otherwise"*

Already built (`_state.userTotal`, `§CPE_TOTAL`, uniform `scale` in `_buildOverride`) and it must
survive the pacing work intact. **The interaction is the trap:** `tour.js`'s `_paceBuildRemap` does
TWO things — it redistributes time along the path AND rescales the action's own total via
`meanFactor`. The second one would silently fight an explicitly-keyed total: the user types 40s, the
remap decides the path is open and hands back 31s. So:
- **User has keyed a total → the brake REDISTRIBUTES within it only. `meanFactor` rescaling is OFF.**
  Their number is the film's length, full stop.
- **User has not keyed one → the derived total stands, and `meanFactor` may inform it** (that is the
  §CPE_PACING "length is a consequence of the building" model, which the user already ratified).
**Gate:** with a keyed total of T, the baked film's duration is T ± one frame, no matter how busy or
open the path is — while the WITHIN-film speed still varies. Both halves in one gate, or the brake
can quietly eat the user's setting and still look right.

## §CPE_CHECKBOX_SAVE (2026-10-06) — a checkbox is an edit, and every checkbox is saved
> User, 2026-10-06: *"it does not allow to save when we changed boxes, and it does not save new boxes"*.

**Cause 1 (dirty).** `viewer/cinema_path_editor.js` `_isEdited()` (~L803) compares only buildup / roomTitle /
reveal against their `orig*` baselines (§CPE_EDIT_BASELINE). clash, measure, storeyReveal, loadPath,
visualPanel, audioPanel, escapeRoute, sunCompass, sunDate, bakeRes, and the film-bounce box are not in it, so
toggling only one leaves `_isEdited()` false and `_syncButtons()` keeps Save disabled. Their change handlers also
never call `_syncButtons()`, and (after a Save) never clear `_state.staged`, so a second change after a save
stays "Path saved".
**Cause 2 (persist).** `viewer/scene.js` `_writeCinemaPathTable` (~L760) writes 21 columns; `viewer/effects.js`
`_cpeLoadFromDb` (~L10616) reads them. loadPath, visualPanel, audioPanel, escapeRoute, sunCompass, sunDate,
bakeRes and bounce have no column, so they are lost on save/reopen and invisible to `cli_silent_bake.js`
(§CPE_FLAGS_PORTABLE: a saved path must bake as authored).

**Fix (owners only, no second path).**
1. `_isEdited()` gains ONE table-driven check over all flag keys: current value ON, or differs from the open/restore
   baseline `_state.origFlags` (snapshotted at open and in `_applyPanelState`). Same one-way+both-directions rule
   as §CPE_EDIT_BASELINE. Every flag handler goes through `_flagChanged()` = `staged=false` + `_markPreviewStale()`
   + `_syncButtons()`.
2. `_buildOverride()` carries `filmBounce`; `_writeCinemaPathTable` appends columns `load_path, visual_panel,
   audio_panel, escape_route, sun_compass, sun_date TEXT, bake_res TEXT, film_bounce`, each declared with
   `ALTER TABLE ADD COLUMN` semantics (the table is rebuilt each save, so an old DB upgrades on save).
3. `_cpeLoadFromDb` probes `PRAGMA table_info` per column; absent/NULL column leaves the key UNDEFINED so today's
   defaults hold (`loadPath` undefined still falls back to Measure, cinema_maxq.js `_loadPath`).
4. `cli_silent_bake.js`: the DB-staged override already feeds `__maxqBake`'s flag merge and the `bakeRes` reader, so
   the new keys are picked up with no CLI change; explicit `--load-path`/`--no-*` etc. still override. `filmBounce`
   is applied to `A._filmBounceOff` in `__maxqBake` unless `--bounce` was passed explicitly.
**Witness.** `viewer/tests/witness_cpe_checkbox_save.js` (W-CPE-CHECKBOX-SAVE): slices the shipped `_isEdited`,
`_writeCinemaPathTable`, `_cpeLoadFromDb` and runs them. RED control on origin/main code; GREEN: each of 11 boxes
(+bounce) alone makes the path dirty; each round-trips ON and OFF through a real sql.js DB; an old 21-column and
a 14-column DB still load with unchanged defaults. No migration .sql needed: the self-heal is the per-save table
rebuild plus the per-column probe on read.
