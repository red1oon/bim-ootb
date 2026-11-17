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
- Toolbar button `#b-lodup`, "LOD Upgrade", same icon idiom as its siblings. It is enabled when a model is open.
- **Lazy:** the pill's JS loads on first press, never at boot (`BROWSER_BOOT_WEIGHT.md`).
- **Panel:** one row per rule pack.
  - Each row shows: applies to N elements (measured on the open model); rule rows: S stated / D defaults; last run: added / refused; and a **Run** button.
  - Each row has a **Rules** link that opens its rule rows (value, unit, source). Editing a row and re-running gives the new result; no code changes.
  - The panel also has **Change list (.txt)** and **Add-on IFC** downloads.
- **Writes through the op-log:** every added part is a normal op (a GEOM_INSERT-class op with provenance `generated:<pack>`, plus `element_parts` rows), so Undo, Save and Export carry it. Refusals are logged and listed, never silently dropped.
- **Wording on every generated steel part:** "configuration only, capacity not checked".

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
