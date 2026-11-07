# ⚠ DO NOT REMOVE
SCOPE: reading a service's drawn centrelines into a plan-level route record, for ANY building. Read the log after every run; exit code is not evidence. Public repo: no client or project names; a real test set is "a private Revit-exported set".
Owner (2026-11-07): "we are abstracting a rules engine not custom to any particular design." On mains, for a file with no ducts in it: a main exists only where a drawn centreline is held, otherwise no main and the walker says so; the reader is its own specced job (`MODELLER_MASTER.md` §RESUME 2026-11-07b).
Status: SPEC ONLY, nothing built. Design lane wrote it; the Modeller lane executes it. Stopping stub runs does not wait for this reader.

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
Solids, fittings as parts, airflow, plumbing and tray layers (the same reader may take them later by data rows), PDF sheets, and any change to `hostBind` or band density.
