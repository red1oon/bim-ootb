# ⚠ DO NOT REMOVE
SCOPE: the brief for an ARCHITECT REVIEW session of DXF2BIM (2D DXF sets -> 3D model in the Modeller), written 2026-10-23 at the owner's request. Read-only
review first, specs second, code only if the owner says so. **Read the log after every run; exit code is not evidence.** Honour this block until the review is DONE.

**Who you are this session:** an expert software architect and specification writer (Opus, high effort). Owner's words: *"review of the code and functional steps to be
well designed, checking for any drift, hard-code bypass where it will fail another similar 2D DXF set. Go through the docs/DXF2BIMGuide to ensure it is working,
practical on the canvas, note what has issues or can be improved further, simplified all for a smooth user experience doing such 3D construction from 2D raw DXFs."*

**House rules that bind you (CLAUDE.md, restated because they were broken before):** Deterministic, never invent. Spec before code, spec before tests. The owner's eyes
are never the instrument: every claim is a `§`-tagged value read from a log or a number computed from real state (screenshots only illustrate the guide, they prove nothing).
A witness must be able to say NO-OP / VACUOUS / WRONG; `INCONCLUSIVE`, never `PASS`, when nothing was judged. Work in a `/tmp/wt-*` worktree (run `git worktree list` first;
`~/bim-ootb` is hook-blocked). Headless runs use SOFTWARE GL (`--use-angle=swiftshader`, as `modeller/tests/witness_viewer_db_export.js` does): no GPU beside the owner's live tab
without their say. Do not ask the owner to look at anything. Ask only a genuine decision, batched once at the end, each as one question.

## 0. Read first (do not re-derive what these already say)
`prompts/DXF2BIM_FOUNDATION_LANE.md` (esp. §3b GENERALITY AUDIT AND GUARDRAILS, §D37, §D43) · `prompts/DXF2BIM_USABILITY_REPORT.md` (a measured first-time-user walk: actions, decisions,
human seconds: your baseline, do not redo it, extend it) · `prompts/DXF2BIM_MODELLER_LANE.md` · `prompts/DXF2BIM_ARRANGE.md` · `prompts/DXF2BIM_EVIDENCE_TIERS.md` ·
`bim-compiler docs/DXF2BIM_SPEC.md`, `docs/DXF2BIM_BASIC_SHAPES_SPEC.md`, `docs/DXF2BIMGuide.md` (redone 2026-10-22, session 10) · `prompts/FILM_DXF2BIM_WHY_MARKINGS.md §GUIDE REDO`.

## 1. Part A: design review of the code and the functional steps
The chain: open sheets (`modeller/dxf_import_ui.js`, `dxf2bim_import.js`) -> qualify / the ONE gate (`modeller/dxf2bim/dxf2qualify.js`, `dxf2shell_config.js`) -> arrange + defaults + evidence tiers
(`dxf2defaults.js`, `dxf2suggest.js`, `dxf2prep.js`, `dxf2pair.js`, ARRANGE in `dxf_import_ui.js`) -> metadata editor (`dxf_meta_editor.js`) -> bodies / structure / panels / doors / section
(`dxf2bodies.js`, `dxf2structure.js`, `dxf2panels.js`, `dxf2doors.js`, `dxf2section.js`, `dxf2synth.js`, `dxf2typology.js`) -> Convert (`dxf2bim_import.js`) -> exports (`dxf2ifc.js`, `viewer_db_export.js`,
`dxf_export_ui.js`) and the CLI (`dxf2bim_cli.js`). Reader copies: `modeller/dxf2bim/SOURCE.md` + `sync.sh` (a verbatim copy of bim-compiler modules).
For each stage write down: its ONE owner, its inputs/outputs, what it assumes about the drawing. Then check, with file:line citations:
1. **Drift:** spec vs code (every `A`-numbered assertion in the lane specs has a witness? run `modeller/tests/witness_dxf_*.js` and read the `§` lines; list specs with no witness and witnesses that
   cannot fail); the copied reader modules vs their bim-compiler originals (diff, not memory); CLI vs UI parity (the same marked set must give the same bodies by both); two implementations of one responsibility.
2. **Hard-code that would fail another set** (unverified LEADS seen in passing, confirm or refute each, then hunt for more): `LIB_URL = 'dxf2bim/local/library_subset_duplex.json'` (Duplex-only library);
   `TYPES = { prefer: ['DUPLEX_NOMINAL'], sets: [['DUPLEX_', ...], ['US_', ...]] }` in `dxf2shell_config.js`; layer-map SETS only `DX` / `STD` (NCS/AIA); roles found from title TEXT strings
   ("Floor Plan", "North Elevation": other languages, other conventions?); unit defaults and the `$INSUNITS` path; `bodies.pair_max_width 0.5`, `panel.thickness_inherited 35`, `fan.depth 0.3`, `net.thickness 0.005`
   and the other defaulted rows (are they shed constants? who may change them? are they in the evidence list?); grid-label assumptions (A-D / 01-42, skipping I and O); the north-mirrored `H axis -X` convention;
   anything keyed on a file or sheet NAME; magic tolerances; "mm"/"in" only; 4 sheet roles only.
3. **Generalisation tests, by mutation** (spec the matrix first, then run it): take each known set (Duplex standard set, the same with marks stripped, HHS office, the shed, the Wand and Hospital sets of
   `FILM_DXF2BIM_WAND.md` / `FILM_DXF2BIM_HOSPITAL.md`) and mutate: rename every layer; scale x1000; swap units; mirror an elevation; rename and reorder sheets; drop the section; add an unknown sheet;
   shift a plan's origin; rename the grid labels. Expected behaviour is one of exactly three: **correct result**, **a red "asks" item naming the field**, or **left out and listed**. A silently wrong model is a
   defect; each needs a falsifier. Report which mutations produce which of the three.

## 2. Part B: walk `docs/DXF2BIMGuide.md` on the canvas, step by step
Execute every numbered step in the real Modeller with real clicks (the recorder `prompts/film_dxf2bim_why_rec.js` is the working driver for the shed; its stills copy is the pattern). Raw shed sheets:
`~/Videos/dxf2bim_film_work/why/raw/` (9 DXFs, private: the title block carries a client name, never print it; the canvas draws no TEXT); the CLI-marked answer set: `~/Videos/dxf2bim_film_work/why/cli/marked/`.
For EACH step record: the label exists as written; the claimed outcome is true (the numbers: blocking chip 58 -> 48 -> 45 -> **48** -> 0, 25 yellow rows, 5 second heights, 10 layer choices,
449 -> 445, 512 bodies, 4 left out); actions needed (compare with the usability report); any dead end, ambiguous message, control that is hidden or needs scrolling, state the guide does not predict.
Then try the same steps on a second set (a stripped Duplex) and say where the guide's walk-through stops being true. Re-test the reverse hand-off (Open > local .db of the exported Viewer database
brings back all 512, verified 2026-10-22 headless) and the one thing not tested: editing the reopened structure.

## 3. Part C: simplify the user experience (proposals, not code)
Goal: raw DXFs to a 3D model with the fewest decisions, never inventing. For every point where the user must act, ask: can it be READ (state the evidence), DEFAULTED (yellow, with the evidence tier), INFERRED
(orange, from geometry or a stated convention), or must it ASK (red)? Candidates to examine, not conclusions: the blocking count rising 45 -> 48 after the heights (explain it in the panel, or order the asks
so it never rises); layer meanings suggested from layer names (`Col` -> column) as yellow suggestions with evidence; a second height read from a dimension or level text the sheet already carries; one
checklist that lists the remaining asks in the order to do them with a progress count; why "Convert refused" cannot say what to do next; Undo for every stated value; saved marked copies as the default;
the set name asked once and prefilled from the file name; whether "Accept all" hides risk. Each proposal: the evidence it relies on, the action count before/after (KLM as in the usability report), the falsifier that
would show it wrong on another set, and which tier it lives in.

## 4. Deliverables (append to THIS file under `## RESULT <date>`; nothing else new)
1. **Findings table:** id · severity (P0 wrong model silently / P1 fails another set / P2 friction / P3 polish) · evidence (`§` line or file:line) · falsifier · proposed fix (one line).
2. **Spec sections** for each accepted finding, appended to `DXF2BIM_FOUNDATION_LANE.md` as new numbered sections (spec only; the owner decides what is built). Each states the witness claim FIRST.
3. **Guide corrections:** factual errors fixed in `docs/DXF2BIMGuide.md` (bim-compiler); structural changes proposed first (docs rule). The in-app overlay lives in `modeller/modeller.html initGuide()`.
4. **Mutation matrix** (Part A.3) as a table, with the witness file names you would add. Do not implement unless asked.
5. Housekeeping at the end: one-line pointer in `PROGRESS.md`; no new memory entry (findings live here); prune your own clean, pushed worktrees.

## 5. State at hand-off (verified 2026-10-22/23)
Guide redone and live in the docs source (`docs/DXF2BIMGuide.md`; the GH Pages deploy through `scripts/safe_gh_deploy.sh` is the owner's call); in-app overlay has the 2D-drawings steps (bim-ootb #2297, sw v123);
reverse hand-off verified (512 = 512, same classes); film v4 (EN) exists and the Malay version is in progress (`FILM_DXF2BIM_WHY_MARKINGS.md §MALAY VERSION`). Known limits already in the guide: component library local so
door/window fills may be 0; roof/slab estimated (amber); 4 bodies left out on the shed (no elevation / conflicting heights); door and window schedules not read.
