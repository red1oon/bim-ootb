# ⚠ DO NOT REMOVE
SCOPE: how the disc walker decides what TYPE of space it is in, for ANY building. Read the log after every run; exit code is not evidence.
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." No room, building or sheet name of any project enters this code or its data.

## §1 Issue
`_spaceTypeFor` matches the WHOLE normalised label against `rule_space_type` / `rule_space_alias`. A real space name is usually qualifier + type: "Staff Toilet", "Main Mechanical Room", "Stair A", "Female WC #2". Those get no type, and `placeSchedule` skips an untyped space: no devices, and only a list in the return value says so. Measured on one labelled clinic model: 162 of 798 spaces typed.

## §2 Resolution order (each step only runs if the one before found nothing)
1. Exact type, 2. exact alias: UNCHANGED, so every label that resolves today resolves the same.
3. **NEW, words:** split the label into words on anything not a letter or digit; drop bare numbers. Try runs of words, longest first; within one length, rightmost first (a qualifier comes before its noun). A run matches a type value or an alias, so every mapping stays a row in the rules DB.
4. Geometry fallback: UNCHANGED (discipline gated, config gated).
5. None: reported (§4).

## §3 Guards, derived from the rule rows, no word lists
- **A generic noun loses to a specific word of the same length.** A name is generic if it is the tail of 3 or more rule names (`ROOM`: `PUMP_ROOM`, `TANK_ROOM`, ...). One other name is not enough: `KITCHEN` is the tail of `WET_KITCHEN` and is still a real type. The 3 is `SPACE_WORD.genericTails`. "Main Mechanical Room" -> `MECHANICAL`, not `ROOM`. "Meeting Room" -> `ROOM`.
- **An alias that is only the tail of its own target says less than the target**, so it is not a word: `LOUNGE` -> `DEPARTURE_LOUNGE` must not type "Staff Lounge". It still works as an exact whole label.
- **A code is not a word:** an alias under 3 letters works as an exact label only (`MR` may mean master room or mechanical room inside a longer name), except the setting `SPACE_WORD.shortOk` (`WC`). These settings live in code for now; every mapping is a rule row.

## §4 Report, never silent
`placeSchedule` prints `§DW-SPACE-TYPE disc= spaces= exact= alias= word= geometry= none= ambiguous= typedNoSchedule= left=[...]`. `VACUOUS` when there are no spaces, `INCONCLUSIVE` when none typed. `ambiguous` counts labels holding two different types ("Kitchen / Living"): the rule above picks one, the count says it was a choice.

## §5 Backward compatibility
Only a label that had no type can change, and only from nothing to a type. `_spaceTypeWordOff` restores the old table for a red control.

## §6 Witness `modeller/tests/witness_space_type_words.js`
W1 exact and alias labels unchanged, with the step named. W2 qualifiers type. W3 longest run wins. W4 generic loses. W5 tail alias and short code refused as words. W6 numbers and unknown names stay untyped and are listed. W7 red control. W8 every labelled building held: nothing typed before changes type, moves reported. W9 `placeSchedule` on a real fully labelled residence: placements identical with the step on and off. W10 the §DW-SPACE-TYPE line counts add up, and VACUOUS on an empty building.

## §7 Known limits, not hidden
- `HALL` is an alias of `CORRIDOR` (a residential hallway). As a word it would type "Exhibition Hall" a corridor. No labelled building held has that case. A data decision for later, not a code rule.
- The label is only as good as the DB. `spacesOf` reads `object_type`, else the name. Many extractions keep the room NUMBER in the name and drop the long name, so this step sees nothing until `scripts/stamp_space_longnames.py` (bim-compiler) has run. Having the extractor keep the long name touches what the Find panel groups by, so it is a separate decision.
- `rule_space_type` rows are projected, not measured. Typing a space correctly does not make its schedule right.

## §8 Result 2026-11-07
`witness_space_type_words` PASS 34 of 34. Census: every building held with usable space labels (2): 0 labels changed type, the clinic gains 210 of 798 (from 162 typed), the residence is unchanged at 20 of 21; placements on the residence identical with the step on and off (ACMV 19, ELEC 102, PLB 18). `witness_disc_room_type_weight` 7/0, `witness_dw_livewire` 12/12, `witness_dw_honest_fallback` and `witness_dw_storey_band` pass. `witness_modeller_disc_walk` fails B3, B4 with and without this change (the baseline also fails B6 on that run): not from here.
A trial on a private Revit-exported set with long names stamped on a copy, rules named directly: 36 of 62 numbered rooms typed, was 3. Spaces served for ACMV 4 to 32. Against that model's drawn devices, one building, candidates only: wet rooms agree on exhaust; small habitable rooms agree on count, the device differs; large rooms have no usable schedule row.
**The clinic is a complex-class building: it walks measured bands, not the schedule, so its gain is a census number, not a change in its walk.** Only a building on a rule set with schedules can change, and only spaces with no type today.
**Next details, one at a time, the owner decides:** rows for names still untyped; keeping the long name at extraction; which rule set a non-residential building takes.

