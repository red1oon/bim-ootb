# roompath_diagnostics — the one-off probes cited by VIEWER_FIND_PANEL_ROOM_ACCURACY.md §20–§21.16

These were written as `/tmp/*.js` scratch during the 2026-07-30/31 measurement session and are
committed here so the spec's citations resolve for a future session. The `doorprov*` set is from 2026-08-02 (§21.42–§21.44). They are DIAGNOSTIC PROBES, not
witnesses: each answers one question and prints `§`-tagged numbers. The witnesses proper are the
`witness_room_path_*.js` files in the repo root.

Each hardcodes `/tmp/wt-roompath` as the engine path — run from a worktree at that path, or sed the
path. Fixtures come from `~/bim-ootb/buildings/` (never OCI, never the bim-compiler copy — see §21.14).

| script | question it answers | spec section |
|---|---|---|
| `wall_model_check.js` | is `_pointWalkable` wall-aware? (answer: **no** — `chordIllegalCount=0` across 2 real IfcWalls with no door) | §21.2 |
| `util_breakdown.js` | how many rooms does the utility penalty tag, and why? (Clinic **95.7%**, 196× `utility:ACMV`) | §20.6 F2 |
| `ratio_buckets.js` | is the high detour ratio an adjacent-room artifact? (**no** — 40 m+ pairs still 1.88×/2.00×) | §20.5 |
| `viol_control.js` | control: does the SHIPPED engine also "touch walls" under §21.6's F2 test? (**yes**, 1976/1924 — the gate was invalid) | §21.6 |
| `offmap_check.js` | how much of each drawn line leaves the walkable map? (shipped **11.05%/8.22%**, prototype 0.05%/0.02%) | §21.9 |
| `loopcut.js` | do R2 revisits / R3 reversals survive in the prototype? (**R2=R3=0 before AND after string-pull**) | §21.10 |
| `funnel_diag.js` | synthetic funnel unit tests with known answers (A1 passes, A2 shows A1 cannot clear orientation, A3 zigzags) | §21.15 |
| `funnel_unit.js` | RIGOROUS funnel tests over a valid 3-convex-cell L-channel — this is the one that found the convention inversion | §21.18 |
| `door_seq_dump.js` | how many doors does a route really cross, and which pockets do they join? (mean 4.0; every door claimed 3 pockets) | §21.21 |
| `dooradj.js` | how many pockets does each door claim, across tolerances? (**no threshold works** — 0.4m→36% claim >2, 0.0m→almost none connect) | §21.21 |
| `inner.js` | are the pockets a route crosses corridor-shaped or room-shaped? (median 10.2m²/3.7m, only 17% corridor-like) | §21.22 |
| `spine.js` | feasibility of a corridor-spine + room-leaves map (corridors read as 18/33 islands — but see the caveat) | §21.23 |
| `doorprov.js` | falsification test for §21.41's doorway-merge, written BEFORE the code: does carve-provenance separate doorways from rooms? (**yes** — 0.0% of >10 m² pockets misclassify, 14.7%/44.7% of sub-2 m² ones do) | §21.43 |
| `doorprov2.js` | does that rule REACH the failure it was built for? (**no** — §C40c's "41 far ends" are 41 records over 8 groups, and 1 of 8 is pure-carve. Fix withdrawn) | §21.43 |
| `doorprov3.js` | the TRUE component boundary, with no `area>=2.0` filter (54 contacts to the spine, `raster CLEAR=0`, no door within 1.5 m) | §21.43 |
| `doorprov4.js` | per-door: does any door's footprint touch both components? (0 of 96 — **but see `doorprov5.js`, the window was the wrong instrument**) | §21.43 |
| `doorprov5.js` | fleet version, and the probe that **invalidated itself**: `SLACK=2` → "100% of stranded area has no door", `SLACK=8` → 23%. Kept as the worked example for §6 method rule 5 | §21.43 |
| `doorprov6.js` | the instrument that held — march the door's own NORMAL, reach swept 0.60–2.40 m, plus §DP10 blindness control. Found the transposed carve | §21.43 |
| `patch_21_43_transpose.diff` | the axis fix itself: CORRECT geometry, every metric worse (§O3 20% PASS → 94% FAIL). Kept unapplied for the joint (W, pierce) re-sweep | §21.43b |
| `resweep_w_pierce.js` | the §21.44 (W, pierce) re-sweep runner — one process per `ROOMPATH_PIERCE`, both fixtures, 6 W modes + uncarved §T5 denominator, `§SW`/`§SW_O3` + TSV per cell. **Result: stop condition — §O3 PASS in 0/72 cells, no cell ≤ baseline on both fixtures** (`w_sweep_matrix_2026-08-02.tsv`) | RESUME_ROOMPATH_AXIS_RESWEEP.md §6.3 |
| `patch_21_44_transpose_plus_pierce_knob.diff` | the transpose fix PLUS the `ROOMPATH_PIERCE` env knob (default 10 = byte-identical, proven), exactly as swept. Applies clean to baseline; kept unapplied like its parent | RESUME_ROOMPATH_AXIS_RESWEEP.md §6.1–§6.4 |

**Read `funnel_diag.js` before attempting funnel attempt 2** — A2 is the trap: a straight corridor
passes with left/right deliberately swapped, so it proves nothing about orientation on its own.
