# ⚠ DO NOT REMOVE
SCOPE: ONE Modeller toolbar pill, **LOD Upgrade**, that runs the rule-based detail upgrades IN THE BROWSER. The rules are ported from the Python sandbox scripts to JS. Every phase must reproduce the Python result, which is the oracle. A rules engine, not custom to any building. Read the log after every run (`§LODUP_*`); the exit code is not evidence. Spec before code, one PR per phase.

## Owner (2026-11-18, verbatim)
*"can we make the features added to the Modeller pill and converted to JS?"*

## 1. What exists (Python, measured; specs in BIMCompiler `prompts/LOD400_DEFAULT_RULES_SCOPE.md` §6-§9 and the private `LOD400_UPGRADER.md` §AD-§AF)
| Rule pack | Python today | Input it needs | Result on the proven runs |
|---|---|---|---|
| Layer split | extractor (`extractIFCtoDB.py`) → `component_geometry_layers` | the IFC's IfcMaterialLayerSet + usage | PJAM: 88 hosts → 220 layer parts, all within 0.00 mm |
| Rebar from a schedule | `scripts/lod/rebar_from_schedule.py` (+ `rebar_beams.py`) | schedule rows per element (`element_dxf2bim` Sched_*), or a marks JSON | Shed 256 sets; PJAM 306 sets (92/92 beams joined; 2 beams FAIL STATED) |
| Truss welds | same engine | member–gusset contacts | Shed 338 welds |
| Fin-plate joints | private `gen_connections.py` v2.1 + `joint_survey.py` | ray survey of steel beam ends, TRUE mesh boxes | PJAM 50 of 234 ends |
| Bracing gussets | private `gen_gussets.py` | the same survey (STEEL_SKEW) | PJAM 1 of 57 ends |
| Change list + add-on IFC | `upgrade_changes` table + txt; `export_parts_ifc.py` | — | deterministic, byte-identical reruns |

The Modeller already draws parts (#3232: parts seeded, hosts with parts hidden) and the per-layer gate (`arc_editable.js` §LAYER-GATE).

## 2. The pill
**Owner decisions on the pill (2026-11-18, verbatim, in order; the last one stands):**
- *"I think an up arrow for upgrade be good with label below it what it is ie LOD400, Rebar.."*
- *"or just up arrow, and it opens a dialog box panel to choose what to upgrade as in future we be having more"*
- *"no label, just the arrow"*

What stands:
- Toolbar button `#b-lodup` = the Lucide `arrow-up` glyph ONLY (no `<span>` label), same 24-viewBox stroke idiom as its sibling pills. Path copied verbatim from `lucide-static@0.468.0/icons/arrow-up.svg` (ISC): `m5 12 7-7 7 7` and `M12 19V5`. Never hand-drawn. It carries `title="Upgrade - choose what to add (rebar, ...)"` and `aria-label="Upgrade"`. No other glyphs anywhere in the panel (Run is a text button).
- It is enabled when the Modeller is ready (like its siblings); the panel itself says "Open a building first" with no model.
- **Lazy:** nothing under `modeller/lod/` loads at boot; the first press loads the engine, then the dialog.
- **The dialog is a chooser over a registry.** `lod/lod_registry.js` holds the packs; each pack registers `{id, label, rulesFile, appliesTo(input), run(input, rules, opts)}`; `lod/packs.json` lists the pack files in dialog order. The dialog renders ONLY `LodRegistry.describe()`. Adding a future pack (Layers, Joints, Welds, Gussets, ...) = one new file + one line in `packs.json`: no toolbar change, no dialog change. The witness asserts the dialog model lists exactly the registered packs and that registering one more adds exactly one row.
- Each entry shows: applies to N elements (measured on the open model); rule rows: S stated / D defaults (U unset); last run: added / refused / not built; a **Run** button; a **Rules** link that opens its rule rows (value, unit, source) for editing. Editing a row and re-running gives the new result; no code change.
- The panel also has **Change list (.txt)** and **Add-on IFC** (disabled until P7).
- **Writes through the op-log:** one Run = ONE gesture (one Undo removes it all) of GEOM_INSERT rows (same `realGeomHash` + placement shape as the DXF convert) with `provenance: 'generated:<pack>'` and `parts_of: [host guids]`. `element_parts` and `upgrade_changes` are derived from the live ops after every op-log event, so Undo leaves no stale row. Refusals are logged and listed, never silently dropped.
- **Wording on every generated steel part:** "configuration only, capacity not checked" (op `note`, panel footer, change list).

## 3. Rules as data (public, generic)
The rule-row JSON packs move to `modeller/lod/rules/*.json`, each row `{value, unit, source}`:
- AISC 360-16 detailing rows;
- the rebar defaults;
- the weld table;
- the gusset rows.

No project values go in these packs. A stated value (schedule, DXF note) always wins over a default.

## 4. Phases (each = spec section, JS port, parity witness against the Python oracle, PR)
| Phase | Pack | Parity witness (issue: *"the browser result differs from the proven Python result"*) |
|---|---|---|
| P1 | Pill + panel + rules engine + change list + **Rebar from DXF-attached schedules** (Shed) | W-LODUP-REBAR: on the Shed export, the JS sets equal the Python run (`SHED_rebar.db`): same set ids, bar n/dia/spacing, every vertex within 0.01 mm, the same change-list rows. Determinism: two runs give the same op hash. Break: drop cover, so INSIDE FAILs. |
| P2 | Truss welds | W-LODUP-WELDS: 338 welds, same contacts, outward winding (the `§SHEDRB_WELD_WINDING` rule) |
| P3 | Layer split from layer sets | W-LODUP-LAYERS: PJAM 220 parts within 0.01 mm of the extractor's; the 9 refusals have the same reasons |
| P4 | Fin-plate joints (survey + clash with TRUE boxes) | W-LODUP-JOINTS: the same 50 generated, the same refusal counts by reason (14 clash, 20 overlap, ...) |
| P5 | Bracing gussets | W-LODUP-GUSSETS: the same 1 / 56 split by reason |
| P6 | Rebar from a schedule TABLE (marks JSON, e.g. S-401 read by the Modeller's table reader) | W-LODUP-BEAMBARS: PJAM 306 sets, the same 7 STATED mismatches |
| P7 | Add-on IFC download in the browser | the same class counts and GlobalIds as `export_parts_ifc.py` (converges with bim-ootb `VIEWER_IFC_EXPORT_BY_DISCIPLINE.md` §3 S5) |

## 5. Known faults to fix while porting (not to copy)
- **Part centres (found by the film, 2026-11-18):** all 150 Python connection parts store their host beam's centre as their own, so Find flies 1-3.7 m off. The JS port stores each part's own bbox centre. A witness asserts centre = bbox centre.
- **DB rtree:** do not trust it as a host box (wrong for about 1/3 of elements on PJAM). Use the mesh.
- **Clash checks:** must be able to FAIL (break switch); scope = every neighbour, not only the support.

## 6. Cost (PERF BUDGET)
Each pack logs `§LODUP_COST pack= addedVerts= heapMB=`. Rebar is vertex-heavy: on the Shed, about 225 k added vertices against 33 k model vertices. On a phone-class budget, the panel warns before Run when the added vertices would pass 1 M.

## P1 RESULT (2026-11-18) — pill + chooser + rules engine + change list + Rebar from DXF-attached schedules
Built: `modeller/lod/` = `lod_rules.js` (rows `{value, unit, source}`; stated beats default; an edit with a default source never replaces a stated row), `lod_registry.js` (the pack registry; `describe()` is the dialog's only model), `rebar_pack.js` (port of `rebar_from_schedule.py` section A: footings, columns, ties, beams listed NOT_BUILT; welds stay P2), `lod_ops.js` (parts to GEOM_INSERT ops, each centre = its own bbox centre; the change list text), `lod_reader.js` (open DB to the pack input, world MESH not the rtree), `lod_ui.js` (the lazy chooser), `packs.json`, `rules/rebar_defaults.json` (no project value in it: the column end-zone row ships `unset`; the person or the witness enters the stated length). Pill `#b-lodup` in `modeller.html`; modeller `sw.js` v288.

Witness `modeller/tests/witness_lodup_rebar.js` (node; paths by `LODUP_SRC_DB` / `LODUP_ORACLE_DB` only; unset = synthetic fixture, P1 parity then INCONCLUSIVE). Logs: scratchpad `lodup_p1_parity.log`, `lodup_p1_parity_break.log`, `lodup_p1_synth.log`, `lodup_p1_live.log`.
| Check | Shed result vs `SHED_rebar.db` |
|---|---|
| PARITY_SETS | 256 / 256, none only on one side |
| PARITY_NAMES | 0 mismatches (n, dia, spacing, stated string) |
| PARITY_VERTICES | 208,896 world vertices, 1,440 bars/loops, max delta 0.000075 mm (limit 0.01) |
| PARITY_CHANGELIST | 291 / 291 rows (256 ADDED rebar + 35 beam NOT_BUILT), 0 differing |
| STATED / TIE_SPACING / SIZE / INSIDE / COUNTS | PASS (0 mismatches; INSIDE min margin 40.000 mm; 64 footing sets) |
| CENTRE | 256 ops, own bbox centre, 0 off; 0 parts sit on their host's centre |
| DETERMINISM | two runs, same op hash |
| BREAK | cover dropped: INSIDE FAIL (215,040 of 215,040 vertices), COUNTS FAIL; `LODUP_BREAK=1` main run exits through the same FAIL |
| REGISTRY | dialog model lists exactly `rebar`; one more registered pack adds exactly one row |
Two honest limits of the parity run: the beam callout texts (a details-sheet DXF, not in the model DB) are re-read from the oracle's first NOT_BUILT row and re-formatted by the pack, so that column tests the formatting only; the stated 20 in end-zone length is read from the oracle's own change-list text (or `LODUP_ZONE_IN`).

Real Modeller (headless, software GL, served from a `git archive` of the branch): opening the Shed export, the pill is the arrow only (0 spans, `aria-label="Upgrade"`, the two verbatim Lucide paths), 0 requests under `lod/` before the press, 8 after; the dialog has 1 row = the registry; applies to 128 elements; rules 0 stated / 11 default / 1 unset, then 1 / 11 / 0 after the stated zone row is entered. Run: `§LODUP_RUN ops=256 ids_contiguous=true verify=true added=256 notBuilt=35`, `§LODUP_COST addedVerts=208896 heapMB=92..159`, 256 scene meshes / 208,896 vertices drawn, `element_parts` 320, `upgrade_changes` 291, change list 291 data lines. A second Run is refused (256 of 256 already in the model). Undo removes all 256 ops and empties both derived tables; Redo brings back 256 / 320 / 291.

Deviations and findings: (1) the 208,896 rebar vertices, as the Python run, are 6.3x the 33,168 model vertices (spec §6 said about 225 k with welds). (2) The op-log autosave to localStorage exceeds its quota with the 256 stored meshes (`§OPLOG autosave FAILED to localStorage ... falling back to IndexedDB`, existing fallback, edits stay); the meshes ride in `geom_assets` as JSON like the DXF convert's. A leaner stored form is a follow-up for the heavier packs. (3) One of three live runs died with a detached-frame error from the harness after the Run (the Run itself had logged complete); the two other runs passed identically. (4) The no-callouts wording is "details sheet not supplied" (the Python text named its CLI flag). (5) Add-on IFC stays disabled until P7.

## P2 SPEC (2026-11-18) — Truss welds (pack `welds`, label "Truss welds")
**Issue it proves or disproves:** *"the browser result differs from the proven Python result"* for the weld part of BIMCompiler `scripts/lod/rebar_from_schedule.py` (section B, "build 3"), including the outward-winding fix of 2026-11-18. Oracle output: `SHED_rebar.db` (338 ADDED `IfcFastener`, 10 NOT_BUILT members, 26 REFUSED members) and its log (`§SHEDRB_WELD_SCAN members=168 plates=117 contacts=364 end_contacts=225 through_contacts=139`, `§SHEDRB_WELD_BUILT welds=338 skipped=26`, `§SHEDRB_WELD_WINDING beads=676 ... -> PASS`).

**What is ported (same maths, same order, no clock, no random, every loop over sorted keys):**
1. Per plate: a frame from the minimum-area rectangle of its in-plane triangle edges (thickness axis = smallest world extent); the plate box in that frame.
2. Per member: centroid + long axis (largest-eigenvalue direction of the vertex covariance, sign fixed by the largest component), its end positions along that axis.
3. Contact member x plate: bounding boxes first; then triangle-box separating-axis test (Akenine-Moller) plus a ray-parity test for the plate-box corners inside the member mesh; the contact interval along the member axis = the member triangles clipped to the plate box (Sutherland-Hodgman, 6 planes). Interval shorter than 1e-6 m = touch only. End contact (A, B or AB) when the interval reaches within `weld_contact_end_tol_mm` of a member end, otherwise THROUGH (T).
4. Weld = two triangular fillet beads (8 triangles each, 24 vertices) laid on the +face of the plate along the two outer edges of the member section, length = the overlap interval. Size = AISC 360-16 Table J2.4 minimum for the thinner part (plate thickness read from its name, else measured; member leg thickness read from its name). Bead end caps are wound outward from the bead's own centroid (the 2026-11-18 correction).
5. Refused, never dropped: a contact whose member axis is not parallel to the plate plane (|axis . plate normal| > 0.05) gets `REFUSED ... member axis not parallel to the plate plane ...` (the 26 perpendicular "Section run" contacts on the Shed); a member that does not cross the plate-face plane gets `... no seam`. Members with no contact at all: `NOT_BUILT` (10 on the Shed).

**Pack contract (reuses the P1 engine unchanged):** `lod/weld_pack.js` registers `{id:'welds', label:'Truss welds', rulesFile:'rules/weld_defaults.json', appliesTo, run}`; the rule rows are `lod/rules/weld_defaults.json` (`{value, unit, source}`: the J2.4 table, contact end tolerance, parallel limit, the two name patterns; no project value in it); one line in `lod/packs.json`; the P1 ops/provenance path writes `GEOM_INSERT` with `provenance: 'generated:welds'`, each part's own bbox centre, the P1 change list and the "configuration only, capacity not checked" note. `lod_ui.js` is NOT edited: the chooser lists the pack because it renders `LodRegistry.describe()`; the witness asserts the dialog model gains exactly one row `welds` and that `lod_ui.js` is byte-identical to its P1 hash. Only `lod_ops.js` gains one generic, pack-agnostic field (a part may carry `attach:[guids]`: written as `params.attached_to`, no `element_parts` row) because the oracle writes NO `element_parts` rows for welds, and `element_parts` makes `arc_editable.js` hide the parent on reload: a weld must not hide its steel member.

**Inputs:** `inp.meta`, `inp.world(guid)` (the world MESH, never the rtree). A model without members or plates gives `applies to 0` and a run that says INCONCLUSIVE.

**Witness W-LODUP-WELDS (`modeller/tests/witness_lodup_welds.js`, node; env `LODUP_SRC_DB`, `LODUP_ORACLE_DB`, optional `LODUP_ORACLE_LOG`; both DBs read only; unset = a synthetic fixture with hand-derived truth, parity then INCONCLUSIVE):**
- PARITY_WELDS: the same 338 weld guids (member, end, plate), none only on one side; the contact scan 364 = end 225 + through 139 (from the oracle log, else from the weld guids) and 10 members without contact.
- PARITY_REFUSED: the same 26 REFUSED rows with the same reasons; PARITY_CHANGELIST: the weld rows (ADDED, NOT_BUILT, REFUSED) equal the oracle's `upgrade_changes` rows seq>=292, field by field.
- PARITY_VERTICES: every world vertex of every weld within 0.01 mm of the oracle's.
- SIZE: every bead's leg, measured from its stored cap triangle, equals the J2.4 row for the thinner part read independently from the element names (5 mm for 6.35 mm).
- WELD_WINDING: each bead 24 vertices, every directed edge exactly once and its reverse exactly once, signed volume > 0.
- CENTRE: each weld op's centre = its own bbox centre; provenance `generated:welds`; wording present; no `parts_of`, `attached_to` = member + plate.
- DETERMINISM: two runs, the same op hash. REGISTRY: the chooser model lists `rebar,welds`; adding one more pack adds exactly one row.
- BREAK: option `breakWinding` (the old inward caps) must make WELD_WINDING FAIL; `LODUP_BREAK=1` makes the main run the broken run (expected exit through the same FAIL).
- COST: `§LODUP_COST pack=welds addedVerts= modelVerts= heapMB=`.
- Also re-run W-LODUP-REBAR (must still PASS), then ONE headless real-Modeller run (Shed open, the pill, the chooser lists Rebar + Truss welds, Run welds, read `§LODUP_*` incl. COST, Undo, Redo).
