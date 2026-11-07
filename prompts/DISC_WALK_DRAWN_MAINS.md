# ⚠ DO NOT REMOVE
SCOPE: reading a service's drawn centrelines into a plan-level route record, for ANY building. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." On mains, for a file with no ducts in it: a main exists only where a drawn centreline is held, otherwise no main and the walker says so; the reader is its own specced job (`MODELLER_MASTER.md` §RESUME 2026-11-07b).
Status: the reader is SPEC ONLY, nothing built. Design lane wrote it; the Modeller lane executes it. Stub runs stopped ahead of it: §9.
**Owner 2026-11-07, *"Yes"*: start the reader once band spec §11 (provisional) has merged.** Ducts first. Pipe layers get their own data row before the reader takes FP or PLB: on one measured set the water sheets' centreline layer held only fitting stubs, and the runs sat on the single-line pipe layer.

## §1 Issue
Routed runs on a file with no ducts are unconnected stubs: they have no source. Drawings may hold the real route. Nothing reads it, so the walker cannot say which it has. This reader records what a sheet draws, and says plainly what it does not state.

## §2 What a drawn centreline gives, measured
One private Revit-exported set, 4 sheets holding a duct centreline layer: 555 pieces, 343.1 m, 711 fitting blocks. An observation that tests the design, not a default.
| Question | Measured | So the reader |
|---|---:|---|
| Is it one network? | No. Explicit joints: 248 components at 50 mm, and 150 mm gives the same on 3 of 4 sheets. 3 to 8 components per sheet exceed 5 m and hold 39 to 62% of the length | records components, never one network |
| Join by touch? | A 150 mm touch join gives 149 components, but the largest 3 on one sheet mix supply and return; 100 of 106 with terminals are single-system. Explicit joints: 148 of 151 | joins only end to end or through a fitting. A plan cannot tell a joint from a crossing at another height |
| Width? | A parallel outline each side, equal offset within 10 mm: 91 to 98% of length | records width as drawn. **Unchecked:** stated size tags could not be tied to a position, their peak equals a shuffled control |
| Depth? | Only in tags on a few sheets | records none |
| System? | Not on the layer. Read from the terminals a component holds, see above | from terminals only, else `unknown` or `mixed` |
| Do terminals meet a run? | Within 1 m: 165 of 230. One sheet 25 of 80, because its route sheets are not held. Control at a 5 m shift falls | counts `terminal with no run drawn` |
| Height? | None on any sheet | stores no height |

## §3 Rule
1. **A run in the record is a drawn piece, nothing else.** No bridging of gaps, no invented main, no stub.
2. **Strength stays on the row:** position and width `drawn`, system `derived`, height absent.
3. **Plan level only in this change.** No solids and no z. A centreline with no height and no depth cannot be a duct yet (§7).

## §4 Reader
1. **Layers by data row, not code:** a pattern to discipline, for example a `-DUCT-CNTR` ending. Outline and fitting layers the same way. A sheet with no match prints INCONCLUSIVE and adds nothing.
2. **Frame.** A sheet may be plotted at its own offset and rotation. Fit it by the named grid lines it shares with the building: rotation from the lines, offset by least squares on perpendicular distance. Under 50 mm median on at least 5 tags, else REFUSE the sheet, with the numbers. Never fall back to the sheet's raw coordinates. Find where the building's grid is held on each open route; if a route holds none, REFUSE and report it, do not rebuild a grid from guesses.
3. **Mirrored blocks.** On that set's converted DXFs a block with negative X in its parent's frame is mirrored, true X = -X: 109 empty fitting boxes fell to 4 on one sheet when corrected. Centreline lines were unaffected. Cause not confirmed against the source DWG and not tested on a second set, so count and log it, and print whether it fired. Do not assume it holds elsewhere.
4. **Joints:** pieces join end to end within 50 mm, or by both touching one fitting box. A touch on a run's interior with no fitting is not a joint.
5. **Width:** as in §2. No match gives no width, not a default.
6. **System:** the terminal kinds within 1 m of a component. One kind gives that system, several give `mixed`, none gives `unknown`. Terminal kinds are a data row of name words, and those words were only tested on one set.

### §4.2a Where the building grid is held (measured 2026-11-08; owner ruled the same day, *"Yes, keep the grid"*)
**Measured (bim-ootb main `50fbbc28`, both lanes):** no open route holds a named grid. Resident and local `.db` files have no grid table; the IFC open route (`ifc_extract_core.js` via `ifc_open_db.js`) and the Viewer import (`import_worker.js` → `import_db_builder.js`) never read `IfcGrid`. The Modeller's and Viewer's grids are derived from columns and walls, and their labels are generated (`viewer/grid_dims.js` 477-478, 513-534), so they cannot match a sheet's tags: under §4.2 they count as a rebuilt grid. On the private set the IFCs state it: ARC 24 `IfcGrid`, 222 axes, all tagged, 28 distinct tags; STR 20 grids, 285 axes. Tags repeat across grids (about one grid per storey or view).
**Owner's ruling:** both IFC open routes keep the stated grid as data, one row per axis, in the element frame. The Find panel and room injection are not touched.
**Carrier (built after the reader):** table `ifc_grid_axis(grid_guid, grid_name, storey, axis_guid, tag, x0, y0, x1, y1)`, written by the open route (`ifc_extract_core.js`) and the import route (`import_db_builder.js`). Each route writes in its OWN `element_transforms` frame: the open route keeps the map offset, the import is local (design lane F86). Axis curves sit in the grid's `ObjectPlacement`, relative to its storey, so apply the same placement chain the elements get; raw curve coordinates are wrong. Write the start and end of the curve as stated (`IfcPolyline`, trimmed `IfcLine`). Witness W-IFC-GRID: axes and tags per grid equal the file's; per route, axes agree with that route's own elements (column centres on their tagged axes), never "equal coordinates across routes"; the design lane checks against its independent private read; red control: a file with no grid writes no rows.
**Fit rule:** a sheet fits against ONE grid's axes (one `grid_guid`), never the pooled set; the reader tries each held grid and keeps the best that passes §4.2's test, logging the others. **Until the carrier lands, and on any route that still holds none:** `§MAINS-REFUSE sheet= reason=no named grid held on this route`.
**Order (owner, relayed by the design lane):** the reader first, with the grid as an input, witness M1-M9 on fixtures; then the carrier; then the reader fits against it on the private set.

### §4.3 Reader, build (Modeller lane, 2026-11-08). Written before the code
- **Module** `modeller/drawn_mains.js`, pure, UMD (browser global `DrawnMains` + `require()`). `read({ entities, sheet, layerRows, terminalWords, grid })`: `entities` from the existing DXF parse (`deps.DxfParser().parseSync` as `dxf2bim.js` S1 uses; the module takes parsed entities, it does not parse). `grid` = `[{ grid_guid, tag, x0, y0, x1, y1 }]` in building coordinates, or empty/absent → REFUSE as §4.2a. Returns `{ sheet: {fit, counts, refused?}, rows: [...] }` and prints the §5 log lines.
- **Data rows, not code:** `modeller/drawn_mains_rules.json` holds the layer patterns (centreline, outline, fitting, sheet grid tags) per discipline, and the terminal kind words. Ducts only; FP and PLB rows are absent until measured (§8).
- **Sheet grid:** the sheet's own grid lines and their tags come from layers named by the data rows; frame = rotation from matched lines + offset by least squares on perpendicular distance; median residual < 50 mm on ≥ 5 matched tags, else REFUSE with the numbers. No fallback to raw sheet coordinates.
- **Joints, width, system, mirrored blocks:** exactly §4.4-§4.6 and §4.3.
- **Write:** `DrawnMains.write(db, result)`: tables `drawn_route(sheet, piece, x0, y0, x1, y1, component, system, width_drawn_mm, provenance)` and `drawn_route_sheet(sheet, fit_rot_deg, fit_dx, fit_dy, fit_median_mm, fit_tags, grid_guid, pieces, length_m, components, over5m, width_share, terminals, no_run, mirrored, refused)`; re-reading a sheet replaces its rows; nothing else is written. No z, no depth (§3.3; §7.1 heights come in a later step, M10).
- **Walker:** no change in this step beyond reading the record's presence for `§WALK-MAINS ... drawn=<m>`; how a user supplies sheets on an opened building is still the owner's §7 Q2, so no UI.
- **Witness** `modeller/tests/witness_drawn_mains.js`, M1-M9 as §6, fixtures built by the witness with `Std2dDxf` (the repo's DXF writer) and parsed with the same parser the reader's callers use; M5 includes the §4.2a REFUSE (no grid given) and a two-grid case where only one grid's tags fit. Each claim shown failing on a broken variant (red control) where §6 names one.

### §4.3 amendments 2026-11-08 (design lane, measured on the private set)
1. **Grid tags may be nested.** On all 4 real duct sheets there are 0 top-level grid texts and 0 grid inserts; the grid lines and tags sit inside ONE block INSERT of the linked architecture model. The reader looks for every role layer (grid lines, grid tags, centrelines, outlines, terminal inserts) inside block inserts too, recursively (depth 8, cycle-guarded), with each insert's transform applied: insertion point, rotation, x/y scale (a negative scale is applied as drawn), and the block base point. Block definitions come from the parser's `dxf.blocks`. Fitting-layer inserts are not expanded: their block is the box. Witness M13; red control: the same sheet read top-level only must REFUSE.
2. **Rules row shape** `{discipline, role, pattern, standard, source}`, so the file can become a DB table later. Terminal words are rows with role `terminal_<system>`. A grep of `modeller/`, `viewer/`, `common/` found no existing word store mapping terminal names to a system (`viewer/import_worker.js` maps names to a discipline only), so the words stay in `modeller/drawn_mains_rules.json`.
3. **Sheet identity is number + revision, not the file name.** `read({ sheet: { number, revision } })`; the caller supplies both (title-block parsing is not in this step). `write()` replaces a sheet number's rows only when the given revision is the same or newer; an older one prints `§MAINS-REFUSE sheet= reason=older revision held (<held> > <given>)` and leaves the held rows alone. Revision order: both numeric by number, else upper-case by length then text (A < B < Z < AA). `drawn_route_sheet` gains `sheet_number`, `revision`. Witness M11.
4. **Round trip, M12:** write to a sql.js DB, export the bytes, reopen, read back identical rows; every other table's row count unchanged.
Out of scope: wall-direction self-check, height (§7.1), IFC Axis export.

## §5 Output
A new table, for example `drawn_route`: `sheet, piece, x0, y0, x1, y1, component, system, width_drawn_mm, provenance`, in building coordinates, plus one row per sheet with its fit and counts. It writes nothing to `spatial_structure` or the Find panel's tables. Re-reading a sheet replaces that sheet's rows.
**Log:** `§MAINS-READ sheet= fit= pieces= length= components= over5m= width_share= terminals= no_run= mirrored=`, and `§MAINS-REFUSE sheet= reason=`.
**Walker:** `§WALK-MAINS disc= drawn=<metres> | none reason=<no sheet held | sheet refused | no centreline layer>`. The status line says the same in words.

## §6 Witness: `modeller/tests/witness_drawn_mains.js` (W-DRAWN-MAINS)
Issue it proves or disproves: the record claims more than the sheet draws. Fixtures are small DXFs built by the witness.
- **M1** two runs crossing with no fitting stay 2 components. Red control: a touch join must fail this.
- **M2** two pieces through one fitting box become 1 component.
- **M3** input length = recorded length, per sheet.
- **M4** a sheet with no centreline layer prints INCONCLUSIVE, never PASS.
- **M5** a rotated, offset sheet lands on the building to 1 mm. A wrong grid tag makes it REFUSE.
- **M6** a mirrored fitting joins after correction, and the log counts it. A set with none prints 0.
- **M7** supply and return on one component reads `mixed`; no terminals reads `unknown`.
- **M8** no row has a z, a depth, or a piece absent from the sheet.
- **M9** the walker prints `none` with its reason when no sheet is held, and places no run.
Design lane re-runs the private set on the merged code against §2. **A second set is required before this reader is called general.**

## §7 Owner's questions, one at a time. Not decided here
1. **Height: RULED, owner 2026-11-07, *"Yes to all four"*.** See §7.1.
2. **How the user supplies sheets** on an opened building, once the record is proven.

### §7.1 Height of a drawn run. Not built
Where a sheet states no height, a run takes one only inside the ceiling void.
1. For each piece, at its midpoint: the real ceiling whose outline holds it (the host search's reader, §10 of the band spec), and the lowest structure above that ceiling at the same point.
2. **The piece's centreline takes the middle of that void, labelled `provisional`.** Say which ceiling and which structure in the row.
3. **No modelled ceiling there, or no structure above it: plan record only, no z.** Log the count. A room's top is not a ceiling.
4. A component's pieces may land at different heights where ceilings step. Record that and count it; do not bridge it with an invented riser.
5. A deep or sloped ceiling's lower face is not its soffit. Log pieces on such a host.
6. **A height does not make a solid.** Depth is still unstated on most runs, so a run stays a centreline at height until depth is stated by the sheet. Do not assume a depth.
Replaces §3.3's "no z", and §6 M8 for rows that qualify. Add M10: a piece under a ceiling with structure above gets the void's middle and the label; red control, a piece with no ceiling gets no z.

## §8 Not in this change
Solids, fittings as parts, airflow, tray layers, PDF sheets, and any change to `hostBind` or band density. **FP and PLB:** the owner's ruling covers them, and the same reader takes them by data rows, but §2 was measured on duct layers only. Measure pipe layers the same way before enabling those rows.

## §9 Stub runs stop now, ahead of the reader (owner 2026-11-07; built by the Modeller lane)
**Owner's rulings:** HVAC, *"Drawn centreline only"*, then for the other services, *"HVAC, FP and PLB"*: on a file with none of that service, a discipline stops producing runs and the walker says why.
**Issue.** Measured on the 9 ARC-only residents, the pattern bridge's runs are not a network: ACMV and FP are lone 2-point stubs (Hospital ACMV 3,047 runs = 3,047 components, 22.6 km; FP 2,908 = 2,908, 34.9 km; HHS FP has one exception of 14 points); PLB is small clusters (Hospital 19,457 runs = 8,778 components, largest 45 of 28,024 points, 136 km).
**Rule.**
1. A data row by discipline: `ACMV`, `FP`, `PLB` take their mains from a drawing only. The pattern bridge (`_bridgeIfEmpty`) makes no runs for them. `routePattern` itself is unchanged and still callable.
2. **Real runs still route.** `routeChains` pairs real `elements_meta` rows and is untouched: a file holding that service keeps its runs, and its log says `real=<n>`.
3. **The walker says so.** `§WALK-MAINS disc= drawn=<metres> | none reason=<no sheet held | sheet refused | no centreline layer>`. Only `no sheet held` can fire until the reader exists. The status line says the same in words. The result carries `mains: { real, none }`.
4. **Not in this rule:** `ELEC` (13 connected runs on 2 residents, not asked), and a `bom-tree` row (§D65, a built tree from the library's sprinkler BOM, the owner's own rule, only in `farm_rules.db`). Band placements, including band duct and pipe pieces, do not change. Whether those pieces should stay with no main is a separate question for the owner.
5. `opts.keepPatternStubs` restores the bridge. For witnesses only; no UI.
**Witness `modeller/tests/witness_walk_mains.js` (W-WALK-MAINS).** Issue it proves or disproves: runs with no source are still produced, or the rule removed real runs.
- **N1** each ruled discipline on an ARC-only resident: 0 runs, and `§WALK-MAINS ... none reason=no sheet held`. **Red control:** `keepPatternStubs` must route more than 0, so the gate is what removed them. A resident the bridge never routed is not judged.
- **N2** placements are identical with and without the gate, by class and position to 1e-3 m.
- **N3** a file with that service keeps its runs: same count as the walker before this change, log says `real=`.
- **N4** ELEC runs and a `bom-tree` row are unchanged.
- **N5** a walk with nothing to judge prints INCONCLUSIVE.

**§9 RESULT 2026-11-07.** Fleet, 118 walks against #2681: placed unchanged on every walk, 0 walks to zero. Runs: FP 12,273 → 0; ACMV 18,335 → 11,682; PLB 69,157 → 37,407; ELEC 13 → 13. What remains in ACMV and PLB is real rows only (N3: Hospital ACMV 4,736, PLB 13,824, Terminal ACMV 1,002, PLB 4,315, each unchanged, each logging `real=`). Hospital and Terminal FP now say `none`. **CORRECTED, see §9.1:** only Terminal has no FP-labelled pipes; Hospital holds them.
W-WALK-MAINS 7 of 7 (23 walks judged, 34,944 stub runs in its red control). Real page: W-BAND-NO-HOST B7f, ACMV and FP on public Clinic: `__dwChains` 0 and status `no main: no sheet held`.
Pattern engine witnesses now run behind the witness-only `window.__dwKeepPatternStubs` / `opts.keepPatternStubs`, same results as before: W-ROUTE-PATTERN-BRIDGE 10/0, W-SEED-OUTWARD-REVEAL 9/0, W-MEP-OPENPATH 27/2 (M5, M7 fail on main too). W-WALK-ROUTED W6 still prints `WRONG unconnected stubs` on the engine, as it should. Not run here, exit 1 before and after for reasons outside this change: W-DISC-DENSITY, W-MEP-ROUTE-RENDER, W-MODELLER-ROUTER-NNCHAIN. W-FP-BOM-TREE is INCONCLUSIVE (its marked set is absent), so the `bom-tree` path has no run behind it here; the code path only changes by its log line.
**Left for the owner:** band duct and pipe pieces still stand with no main (fleet: 22,562 duct pieces on ACMV walks, 19,752 pipe segments on PLB walks).

### §9.1 `no sheet held` must not be said of a file that holds the service (design lane, 2026-11-07, checked against the data). Built, RESULT below
**Issue.** `§WALK-MAINS` prints `none reason=no sheet held` whenever `routeChains` returns 0. That also fires when the file holds the service and no routing rule pairs it.
**Measured:** `Hospital_extracted.db` holds 6,228 pipe segments and 5,900 pipe fittings labelled FP, beside 1,354 sprinklers. `terminal_rules.db` has no `nn` row for FP, only `array` and `grid`, so `routeChains` gives 0 and the walker tells the user `no main: no sheet held`. Removing its 2,655 pattern runs was right; the reason it states is false, and the ruling's own words are "on a file with none of the service". `Terminal_extracted.db` has 0 FP-labelled pipes (its 8,064 pipes are labelled MEP, or PLB in `Terminal_meta.db`), so its `none` holds for the label, and which of those pipes serve fire is not known.
**Rule.**
1. Before saying `none`, count the real pieces of that discipline in the file, classes by a data row (`IfcPipeSegment`, `IfcPipeFitting`, `IfcDuctSegment`, `IfcDuctFitting`, and the generic flow classes).
2. Pieces held and 0 runs: `§WALK-MAINS disc= bldg= held=<n> real=0 reason=no routing rule pairs them`. The result carries `mains: { held, real }`. Status text: `main in the file, not routed: no rule for it`.
3. 0 pieces held: `none reason=no sheet held`, as now.
4. **Do not add an FP `nn` row to make this pass.** A routing row is measured data; adding one is a separate job.
**Witness, added to W-WALK-MAINS:** N6, on `Hospital_extracted.db` FP: prints `held=`, never `no sheet held`. Red control: a fixture with the service's pieces removed prints `none`. Print per fleet walk how many change reason. A walk with no such pieces is not judged here.
**§9.1 RESULT 2026-11-07.** W-WALK-MAINS 9 of 9, including N6 on Hospital FP (`held=12128 real=0 reason=no routing rule pairs them`) and its red control (the same file with those pieces removed says `none reason=no sheet held`). Real page, public Clinic: B7 15 of 15. Fleet, 118 walks against #2682: placed and runs identical on every walk. **7 walks change reason:** `Clinic_extracted` and `Clinic_meta` ACMV (3,138 generic flow pieces) and PLB (6,211), `Hospital_extracted` and `Hospital_meta` FP (12,128), `JKR_extracted` FP (45). After: `held` 7, `none` 39, `real` 11, no ruling applies or nothing placed 61. No routing row was added. The label is the file's own: a pipe labelled MEP does not count for FP, so `none` there holds for the label only.

### §9.2 Band duct and pipe pieces with no main stop too (owner 2026-11-07, *"agree"*, to: should the walker stop scattering them?)
**Issue.** §9 stopped the runs; the pieces remained. A measured-band walk still places duct segments, duct fittings and pipe segments at density positions, with no route between them: 22,562 duct pieces on ACMV walks and 19,752 pipe segments on PLB walks across the fleet. That is the fabricated network doctrine §4 forbids.
**Rule.**
1. In a discipline of `_MAINS_DRAWN_ONLY`, a band placement (`placed:*`) whose class is in `_MAIN_PIECE_CLASSES` is not placed. Same two data rows as §9 and §9.1. ELEC is not in the row, so it does not change.
2. **Accounted for as refused, reason `no-main`,** so input = bound + unhosted + not judged + refused still holds. `refusedNoHost.noMain` carries the count, and the log line prints `noMain=`.
3. **Terminals stay:** sprinklers, air terminals and sanitary devices are not pieces of a main. Their band density remains the owner's open question.
4. **Not touched:** real elements in the file, schedule rows (`sched:*`), `shim:host-*`, a `bom-tree` network and its parts.
5. `opts.keepPatternStubs` / `window.__dwKeepPatternStubs` keep the pieces too, because the pattern engine's witnesses use them as anchors. `opts.noHostBind` still gives the raw walk.
6. A walk with only such pieces places nothing and takes the existing refused path, with the reason. **Print how many walks go to zero, by name: the owner sees them.**
**Witness, added to W-WALK-MAINS.** Issue: pieces with no main are still placed, or the rule took something else with it.
- **N7** every ruled discipline on every ARC-only resident: 0 band pieces in the output, and `noMain` = the pieces the raw walk placed. Red control: the switch keeps more than 0. Nothing to judge prints INCONCLUSIVE.
- **N8** every other placement identical with and without the rule, to 1e-3 m (replaces N2).
- **N9** ELEC's placements unchanged against the walker before this rule.
**§9.2 RESULT 2026-11-07.** W-WALK-MAINS 11 of 11: 16 walks judged, 0 pieces left, each counted as `no-main`, red control 18,739 pieces, every other placement identical. Fleet, 118 walks against #2686: placed 110,583 → 68,237, `noMain` 42,346, routed runs unchanged, ELEC unchanged. No piece of a ruled discipline remains.
**Walks that placed devices and now place none: 2, for the owner to see.** `SampleCastle_ARC` ACMV 12 → 0 and `SampleHouse_ARC` ACMV 4 → 0, both on the refused path with the reason. Their rows are 35 mm `IfcFlowFitting` and `IfcFlowSegment` from 2 measured Duplex rows, hosted on ceilings. They are not the window vent grilles (`ACMV_WINDOW_SHIM`), which this walk does not place on these buildings.
Other witnesses: W-BAND-NO-HOST 34/0, B7 real page 15 of 15, W-WALKED-EXPORT-DB on Duplex 6 of 6, W-DW-LIVEWIRE 12/12, W-ROUTE-PATTERN-BRIDGE 10/0, W-SEED-OUTWARD-REVEAL 9/0, W-MEP-OPENPATH 27/2 (M5, M7 fail on main too), W-BORROW-FP, W-ELEC-HOSTBIND, W-SHIM-SELECT, W-SPACE-SCOPED and W-TERMINAL-GEOSPLIT unchanged, W-UX-DISC 5/3 (fails on main too; B6 passed once in an earlier run, so it is not stable).
**Newly failing, as the rule requires, not changed here.** Pointed at the shipped walker, W-TERM-NOSPACES 8/0 → 6/2 (T6, T8: `IfcPipeSegment 0/739`, they grade band pipes against a measured count) and W-DWWALK-HOSTBIND 5/1 → 4/2 (W4: PLB placed 7 of 11). Those scripts test bim-compiler's older `build/disc_walker.js`, so as written they stay green; update these claims when they are repointed.

### §9.3 A corridor trunk is not a main (owner 2026-11-07, *"Yes to all four"*). Built, RESULT below
`SeedTrunk.planTrunk` draws a trunk from an entry a person picks. It stays outside "a main exists only where a drawn centreline is held", on these terms:
1. **Available, user-triggered only.** If the walker's automatic path can still reach it (`_corridorJunctions`, for a discipline outside the row), state which and why.
2. **Never a main:** `§WALK-MAINS` is unaffected, and neither `real=` nor `drawn=` counts it.
3. **Says so:** the status line reads, for example, `proposed trunk, not a drawn main`.
4. **Not saved or exported as a duct or pipe.** Check whether it can reach the DB or IFC export today; if it can, that path changes in this work, and the PR says what changed.
**Witness, W-WALK-MAINS:** N10, a trunk drawn from a chosen entry leaves `mains` unchanged, prints the status words, and adds 0 rows to a commit or export. Red control: a fixture that routes it into a commit must fail.
**§9.3 RESULT 2026-11-07.** N10 lives in the page witness W-E2E-SEEDTRUNK, because only the page routes a trunk from a chosen entry: 11 of 11 on Duplex. A trunk adds 0 op-log rows (298 → 298) and 0 IFC entities (no class changed), emits no `§WALK-MAINS` line and one `§TRUNK-PROPOSED ... committed=0`, and the status reads `proposed trunk, not a drawn main · 94 served, 8 refused, 281.1 m`. Red control: one deliberate GEOM_INSERT through the walk's own commit call moves the same counters (298 → 299).
**§9.3.4, checked:** the trunk never reached the DB or the export before this change either. `window.seedTrunk` renders `LineSegments` into `__dwTrunk` and commits nothing; this change only adds the words. **§9.3.1, stated:** the automatic path still reaches `planTrunk` through `_corridorJunctions` for **ELEC**, the one discipline in `_RW_PATTERN_DISC` outside `_MAINS_DRAWN_ONLY`, on every ELEC walk where no real ELEC run pairs. Those junctions are anchors for the pattern engine; ELEC's runs were not ruled on, so this is not changed. For the owner.

**§4.3 RESULT 2026-11-08.** `modeller/drawn_mains.js`, `modeller/drawn_mains_rules.json`, `modeller/tests/witness_drawn_mains.js` (W-DRAWN-MAINS): 41 pass, 0 fail, 0 inconclusive, node only. M1 crossing runs = 2 components; red, touch join reads 1. M2 fitting box joins 2 pieces to 1; red, no fitting stays 2; endpoints 40 mm apart join, 70 mm do not. M3 input 13.5 m = sheet = rows; red, a dropped piece gives 10.5 m. M4 no centreline layer prints INCONCLUSIVE, 0 rows. M5 rotations 30, -150, 0, 89.5 deg with offsets land to 0.0000 mm on 8 tags; all tags shifted by one: REFUSE (median 5000 mm); 4 matched tags: REFUSE; no grid (absent or empty): REFUSE `no named grid held on this route`; two grids (both orders): fit names G1, G2 logged FAIL; offered only G2: REFUSE (892.5 mm). Not asserted, logged as INFO: two swapped tags among 8 still fit (median test is robust to a minority). M6 mirrored fitting joins after correction, `mirrored=1`; red, correction off reads 2; a set with none logs `mirrored=0`. M7 mixed / supply / unknown, red nearest-terminal variant calls the mixed one `supply`. W1 width 400 and 595 mm where outlines sit each side within 10 mm, null otherwise (share 0.400). M8 no z/depth/height column, no row absent from the sheet, the 2 m gap stays a gap; red, a bridge row and a z column are each caught. M11 newer revision replaces (2 to 4 rows), older refused with rows unchanged, red a revision-blind writer changes the dump. M12 exported bytes reopen to identical rows, other tables unchanged. M13 grid inside an offset, rotated block insert (and a mirrored-X one) fits to 0.0000 mm; red, top-level only REFUSES. M9 on Clinic ACMV: `none reason=no sheet held`, 0 runs, no `drawn=`; red, keepPatternStubs routes 359.
**Not as specced / for the design lane:** Std2dDxf writes no INSERT or BLOCK, so fittings, terminals and the nested-grid block are built directly in the parsed-entity shape (logged). Outline, fitting, grid-line and grid-tag layer patterns and the terminal words are placeholders (only the `-DUCT-CNTR` ending is from the spec); `standard: unconfirmed` on every row. Fitting box = AABB of the block's vertices under the insert transform; with a rotated insert that is a bounding box. The mirrored correction is read as: a negative X scale on a fitting insert uses the positive scale for its box (box on the other side of the insertion point). Piece = one LINE or one polyline segment. The walker is untouched, so `drawn=` is not printed yet. A real set was not read (no private data here), so none of this is tested on one.
