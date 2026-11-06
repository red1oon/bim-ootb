# ⚠ DO NOT REMOVE
SCOPE: where a complex-class building reads its room schedules, for ANY building. Read the log after every run; exit code is not evidence.
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." On this design: "your advice is sound. Follow that."

## §1 Issue
`common/walk_rules.js` gives a non-residential, non-farm building `terminal_rules.db`, which has no `rule_space_schedule`. So `placeSchedule` returns `noRules` and the whole building walks measured bands: the type of the room never matters, even when the rooms are named. Only the residential set holds schedules.

## §2 Decision
The primary rules stay the building's class rules: measured clearances, gate, routing, shims, measured bands. Room TYPES and SCHEDULES come from a named source when the primary has none. This extends §BORROW (WalkerDoctrine §2) from one discipline's rows to the room schedule. **The schedule rows are projected, not measured** (`rule_space_type.provenance`), and were mined on a residential building: a complex building starts from weaker data for those rooms. Every placement from a source carries `schedFrom`, and the walk logs it.

## §3 Rules
1. `WalkRules.scheduleDb(name)`: one owner, a data map `{ 'terminal_rules.db': 'duplex_rules.db' }`. Residential: none, it has its own. Farm: none, unchanged.
2. `dwScheduleSource(db)` / `dwScheduleSourceFile(SQL, base, file)`: registers or clears the source. The primary is never switched. A primary that has schedules ignores the source.
3. `_schedDbFor(disc)` is the one read point for `rule_space_type`, `rule_space_alias`, `rule_space_schedule`, `rule_code_spacing`. Nothing else reads the source.
4. **No space typed with a row, or no spaces at all: the walk is the measured-band walk of today, placement for placement.**
5. **Mixed:** spaces with a schedule row take the schedule. The measured-band walk still runs for the rest, and any band placement inside a served space (plan box and height) is dropped, so a room is never filled twice. A typed space with no row for this discipline is not served: bands stay in it. A plan box over-covers a rotated room, so some neighbours lose band devices; the count is logged, not hidden.
6. A measured walk that can serve nothing leaves the schedule result alone, instead of refusing it.
7. **Meshes:** `_dwResolveMeshes` also tries the source rules' source building, after the primary's. On the trial below every schedule mesh resolved from the primary's source, so this step did not fire: it is a fallback for a hash the primary's source lacks, and it has not been exercised live.
8. **One physical room is served once.** A federated building carries the same room once per discipline model. Rooms with the same plan box and floor within `SPACE_SAME_M` (0.25 m) are one room, and a copy that can be typed is kept over one that cannot. Found by comparing with a real federated model: 798 rows, 292 boxes, where the schedule filled rooms three times and the collision spreader made the copies look distinct. Log `§DW-SPACE-ONE-ROOM`. A building with all rooms different keeps its list, in order.
9. Log: `§DW-SCHED-SOURCE disc= primary= schedule= spaces= served=` and `§DW-SCHED-MIXED disc= scheduled= measuredKept= measuredDropped=`. Return `mode: 'schedule+measured'`, with both `schedule` and `measured`.

## §4 Witness `modeller/tests/witness_schedule_source.js`
S1 no source: complex building measured, primary holds no schedule tables (the existing M6 boundary). S2 source on a building with no spaces: placements identical. S3 source on a building whose spaces have no type: placements identical. S4 source on a residence: identical, its own rows win. S5 a labelled complex building: mode, placements from the source in served rooms, band placements outside them, none inside. S6 primary reads unchanged with a source set: clearances and routing rows. S7 red control: source cleared, the same building returns to its measured walk exactly. S9 a federated room is served once: no two schedule rooms share a box; a residence keeps its room count. S8 one owner: `scheduleDb` map, `rulesDb` unchanged for every name, the modeller's mesh path names the source. Reruns: `witness_terminal_nospaces`, `witness_dx_walkback_rsgt`, `witness_dw_livewire`, `witness_space_type_words`, `witness_seam_w3_class`.

## §5 Known limits
- A real project reaches this only when its DB holds long names: see `DISC_WALK_SPACE_TYPE_WORDS.md` §7, still a separate decision.
- The schedule says one device per typed room for most types, whatever the room's size. Large rooms with a row will be under-served; rows are data to correct, not code.
- Band placements in a typed room with no row are the old behaviour, not a judgement that they suit that room.

## §6 Result 2026-11-07
`witness_schedule_source` PASS 36 of 36. Identical to today: a building with no spaces (ELEC 744, ACMV 1312, PLB 890), spaces with nothing typed, a residence with its own rows, and the same complex building with the source cleared. `witness_space_type_words` 34/0, `witness_dw_livewire` 12/12, `witness_disc_room_type_weight` 7/0, `witness_seam_w3_class` PASS, `witness_walk_rules_mesh`, `witness_dw_honest_fallback`, `witness_dw_storey_band` pass.
**A labelled federated clinic (full model, node):** 798 rows, 288 rooms, 87 served. ELEC 774 to 1130 against 2081 real terminals; ACMV 935 to 1000; FP 850 to 912; PLB unchanged (no served row). The shipped resident `Clinic_ARC.db` has no space rows, so its Walk does not change: only a DB opened with real typed rooms does.
**Real Modeller page, software rendering, a private set with long names on a copy, opened under a neutral name:** class rules stay `terminal_rules.db`; ACMV 35 schedule + 1701 band placements, ELEC 187 + 1374; meshes resolved 5/5 and 8/8, all committed.
**Seen, not fixed, each a data decision:** (1) residential rows on a complex building: 84 ceiling fans in the clinic. (2) The bands stay at the reference building's density: 1701 ACMV band placements on the private set, 1538 of them floating, where its drawings show 269 terminals and units. Bands were already this dense before this change; it is now visible beside the schedule. `build/disc_walker.js` in bim-compiler is an older copy and does not have this.

