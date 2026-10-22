# ⚠ DO NOT REMOVE
SCOPE: D36 EVIDENCE TIERS + FLY TO THE EVIDENCE in the Modeller's Drawing metadata panel. Owner 2026-10-22: "Are some of the defaults of 100% confidence and the rest not? ... green for those and yellow of lesser, and even more orange towards red ... is this realistic?" and "clicking on the orange will fly to that sheet or bring it closer any part so user can visually grasp if the value is correctly set". A VIEW + LIST change: no rule, marking, verdict or gate changes. Read the logs after every run (`§DXF-EVIDENCE` lines, the witness output): exit code is not evidence. Builds on D34 ARRANGE (`prompts/DXF2BIM_ARRANGE.md`: placement of a sheet by its yellow values); build after it lands (same two files).
Status: SPEC 2026-10-22, to be built after D34.

## Facts it stands on (measured 2026-10-22, `modeller/dxf2suggest.js`)
- No suggestion carries a confidence number. A rule emits a proposal only when its evidence is unique; ambiguous or absent evidence is `refused` with the reason. So no percentage is stated anywhere (three measured sets cannot calibrate one).
- What differs is the KIND of evidence, fixed per rule. Shed (suggestions only, 131 rows): stated 9, read 16, inferred 106 (grid tick 91, ground 5, face 4, axis 5, cut 1). The one measured wrong default (`PR-CUT`, wrong on 2 of 2 of our standard sets) and the rule whose reason says "convention, not evidence" (`PR-FACE`) are both in the inferred tier.
- Each proposal carries the sheet position of its evidence (`x`, `y`) and names the entity it read in `why` (`dimension tick <handle>`, `ground line <handle>`, `grid line <handle> + label`); the canvas keeps world segments per entity (`state.canvas[name].segOf[handle]`); a verdict item click already zooms the camera to its entity.

## Tiers (a static table, rule -> tier; colours follow the panel's existing meaning: green = yours, red = blocking)
| tier | rules | row look |
|---|---|---|
| stated: the file states it | PR-UNITS (`$INSUNITS`), PR-SET (the other sheets state it) | yellow, mark "stated" |
| read: a text names it | PR-VIEW, PR-NAME (title text), PR-Z (level text on its line), PR-GRID (label on its grid line) | yellow, mark "read" |
| inferred: geometry or a convention | PR-GRID-TICK, PR-Z-GROUND, PR-FACE, PR-HAXIS, PR-CUT | orange, mark "inferred" |
Every suggestion stays NOT yours until accepted (the yellow rule). Accepted = green "you" as today; refused / blocking = red as today.

## Behaviour
1. Each yellow row shows its tier mark; inferred rows are orange (row + its sheet's tint on the canvas in D34's preview).
2. Accept buttons split: `Accept stated + read` and `Accept inferred` (each takes only its rows); the old single Accept all stays only when one tier is present.
3. Click on a row (any tier; the orange ones are the cue) = fly to its evidence: the camera eases to the evidence on the PLACED sheet (accepted or preview placement) and frames it in the canvas right of the panels; the evidence entity is highlighted, other sheets dimmed; the row's field stays in view; the row offers Accept / Type over. Per rule:
   - PR-GRID-TICK: the tick + its label text; PR-GRID: the grid line + label;
   - PR-Z-GROUND: the ground line along its length; PR-Z: the level line + its text;
   - PR-FACE: the elevation on its face plane beside the plan's outer wall (the plan's envelope edge highlighted);
   - PR-HAXIS: the elevation's grid lines carried down onto the plan's grid lines (a mirror shows as crossing lines);
   - PR-CUT: the two section labels on the plan + the section standing at the cut;
   - PR-UNITS / PR-SET / PR-VIEW / PR-NAME: the sheet as a whole (no single entity).
   A row whose sheet is not placed says so and frames the sheet as drawn.
4. Logs: `§DXF-EVIDENCE tiers stated=<n> read=<n> inferred=<n>`; per click `§DXF-EVIDENCE fly sheet=<name> rule=<rule> handle=<h> cam=<before>-><after>`.

## Witness W-EVIDENCE (each line names the issue it proves)
- E1 "every rule has one tier": the table covers every `rule:` in dxf2suggest.js (a new rule without a tier FAILS).
- E2 "the tier counts are the list's": shed 9 / 16 / 106, Duplex plain round 1 + 2 counted from the rows.
- E3 "the camera goes to the evidence": for one row of each rule on the shed, the highlighted entity's world box is inside the visible canvas (right of the panels) after the fly, and its handle is the one in `why`.
- E4 "split accept takes only its tier": after `Accept stated + read` no stated / read row remains and every inferred row does.
- E5 "only a view": markings / verdict identical before and after any number of clicks; 0 page errors.
