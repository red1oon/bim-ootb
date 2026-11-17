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
