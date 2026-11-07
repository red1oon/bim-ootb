# ⚠ DO NOT REMOVE
SCOPE: reading a service's drawn centrelines into a plan-level route record, for ANY building. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." On mains, for a file with no ducts in it: a main exists only where a drawn centreline is held, otherwise no main and the walker says so; the reader is its own specced job (`MODELLER_MASTER.md` §RESUME 2026-11-07b).
Status: the reader is SPEC ONLY, nothing built. Design lane wrote it; the Modeller lane executes it. Stub runs stopped ahead of it: §9.

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
1. **Height, first.** What height may a drawn run take, when the sheet states none? This blocks any solid. Candidate from the design lane: inside the ceiling void, between a real ceiling and the structure above it, labelled provisional; where no ceiling is modelled, plan record only.
2. **How the user supplies sheets** on an opened building, once the record is proven.

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

### §9.1 `no sheet held` must not be said of a file that holds the service (design lane, 2026-11-07, checked against the data). Not built
**Issue.** `§WALK-MAINS` prints `none reason=no sheet held` whenever `routeChains` returns 0. That also fires when the file holds the service and no routing rule pairs it.
**Measured:** `Hospital_extracted.db` holds 6,228 pipe segments and 5,900 pipe fittings labelled FP, beside 1,354 sprinklers. `terminal_rules.db` has no `nn` row for FP, only `array` and `grid`, so `routeChains` gives 0 and the walker tells the user `no main: no sheet held`. Removing its 2,655 pattern runs was right; the reason it states is false, and the ruling's own words are "on a file with none of the service". `Terminal_extracted.db` has 0 FP-labelled pipes (its 8,064 pipes are labelled MEP, or PLB in `Terminal_meta.db`), so its `none` holds for the label, and which of those pipes serve fire is not known.
**Rule.**
1. Before saying `none`, count the real pieces of that discipline in the file, classes by a data row (`IfcPipeSegment`, `IfcPipeFitting`, `IfcDuctSegment`, `IfcDuctFitting`, and the generic flow classes).
2. Pieces held and 0 runs: `§WALK-MAINS disc= bldg= held=<n> real=0 reason=no routing rule pairs them`. The result carries `mains: { held, real }`. Status text: `main in the file, not routed: no rule for it`.
3. 0 pieces held: `none reason=no sheet held`, as now.
4. **Do not add an FP `nn` row to make this pass.** A routing row is measured data; adding one is a separate job.
**Witness, added to W-WALK-MAINS:** N6, on `Hospital_extracted.db` FP: prints `held=`, never `no sheet held`. Red control: a fixture with the service's pieces removed prints `none`. Print per fleet walk how many change reason. A walk with no such pieces is not judged here.
