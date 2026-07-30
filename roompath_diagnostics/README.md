# roompath_diagnostics — the one-off probes cited by VIEWER_FIND_PANEL_ROOM_ACCURACY.md §20–§21.16

These were written as `/tmp/*.js` scratch during the 2026-07-30/31 measurement session and are
committed here so the spec's citations resolve for a future session. They are DIAGNOSTIC PROBES, not
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

**Read `funnel_diag.js` before attempting funnel attempt 2** — A2 is the trap: a straight corridor
passes with left/right deliberately swapped, so it proves nothing about orientation on its own.
