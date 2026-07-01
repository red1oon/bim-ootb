<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Teams Overlay — UI Consistency Guide

**Scope.** The Teams overlay must SPEAK THE HOST'S VISUAL LANGUAGE (BIM Viewer/Modeller `viewer/panels.js`;
ERP iDempiere `--idmp-*` chrome) and NEVER impose its own — that consistency IS the universal-optics thesis
(one overlay, design→operate). Spec = `prompts/RESUME_TEAMS_UI_CONSISTENCY.md`. This guide is the dev/verify
companion: what was built, how each requirement is met, and **the exact whitebox `§` log line that proves it**.

> **Lane rule (non-negotiable).** This lane touches `teams/` ONLY. `viewer/panels.js` is the HBA/viewer seam
> (a conflict magnet) — Teams CONSUMES the host factory at runtime, it does not edit it. Facet-icon registry
> additions (`users`/`cpu`/`wrench`/`layers`/`globe`) are a **cross-lane hand-off** to the HR/viewer lane.

## Files (all under `teams/`)
| File | Role |
|---|---|
| `overlay/teams_pill.js` | Host-aware launcher — pill via `host.icon('share')`, pane via `host.createPanel` → `.bim-panel`; self-contained glyph + `.teams-pane` fallback off-host. |
| `overlay/find_placement.js` | R6 engine — one Role×Spine matrix, design (Project→Element) + operate (Storey→Rooms), storey `+N` rollup. Reuses `dot_layer`. |
| `overlay/teams_tabs.js` | R3 tab shell — the ONE canonical `.tabs > .tab(.on)[data-t]` + `.pane#pane-<id>` markup (verbatim from `teams.html`). |
| `overlay/embed_outliner.js` | R3 content — fills Tree(blame)/Chat(op-log)/Dashboard(involvement) into the tab shell from existing folds. |
| `erp/teams_dashboard.js` | §1b — HR-schema Chart.js config builders (involvement/flow/gate/aging/presence), watermarked, `Date.now`-free. |
| `pert_gate.js` | §3b.2 — schedule merge-gate, `gate.js`'s twin: dependency violation / cycle / resource double-booking. |

## Requirements → how met → **whitebox proof** (the `§` line to read in the log)
Run each witness with `2>&1 | tee teams/logs/<name>.log` then **READ the log** — the `§` line carries the actual
value, not a pass/fail string (Log Mandate: exit code is not evidence).

| Req | Met by | Witness (`node teams/tests/…`) | Proof `§` line (actual value) |
|---|---|---|---|
| **R1** icon-not-label | pill = `host.icon('share')`, active band = host `.active` | `ui_consistent.js` | `§UI-ICON … svg=true factory=true title="Teams overlay"` |
| **R2/R3** host pane | pane = `host.createPanel` → `.bim-panel` | `ui_consistent.js` | `§UI-PANE … class="bim-panel" close=true` |
| **R4** tokens | active band resolves `--idmp-blue`, no `#3a6df0` | `ui_consistent.js` | `§UI-TOKEN … bg=rgb(28, 95, 168) foreign=false` |
| **R5** dot ≠ state | identity `colorOf` (hsl) ∉ HR state palette | `ui_consistent.js` | `§UI-DOTID … dot=rgb(215, 66, 78)` |
| **OFF** pixel-identical | no overlay DOM until ON; reversible | `ui_consistent.js` / `wire_teams_pill.js` | `§UI-OFF … pane=false dots=0` |
| **no silent fail** | 0 console.error / pageerror | `ui_consistent.js` (+ dom + tabs) | `§UI-NOERR … errs=0` |
| **R6** placement | one Role×Spine matrix, 2 anchorOf | `poc_teams_find_placement.js` | `§SAME-ENGINE design=[1,2,5] operate=[1,2,5]` · `§STOREY-ROLLUP L2 badge=+3` |
| **R6** render | dots after state chip, storey `+N` | `find_placement_dom.js` | `§FP-AFTER-CHIP ok=true` · `§FP-STOREY-N {"L1":"+3","L2":"+5"}` |
| **R3** one tab schema | embed data-t === `teams.html` data-t | `tabs_consistent.js` | `§TABS-PARITY embed=["tree","chat","dash"] teams.html=["tree","chat","dash"]` |
| **§1b** dashboard | HR-schema configs from folds | `poc_teams_dashboard.js` | `§INVOLVE data=[3,2]` · `§AGING data=[1,0,1,0]` · `§NO-DATENOW noDateNow=true` |
| **§3b.2** PERT gate | dep/cycle/resource conflicts | `poc_teams_pert_gate.js` | `§DEP-VIOLATION roofViol={…"by":3}` · `§CYCLE cycles=[["A","B"]]` |

## Run everything (session-end gate)
```sh
# node value-verification suite (auto-discovers poc_teams_*.js) — the PRIMARY truth path
node teams/tests/run_all.js            # → ✅ ALL TEAMS WITNESSES PASS  (25/25)

# chromium wiring/render checks (NOT in run_all) — each also asserts 0 console errors
node teams/tests/ui_consistent.js      # → W-TEAMS-UI-CONSISTENT 7/7
node teams/tests/find_placement_dom.js # → W-FIND-PLACEMENT-DOM 5/5
node teams/tests/tabs_consistent.js    # → W-TEAMS-TABS 6/6
node teams/tests/wire_teams_pill.js    # → W-TEAM-WIRE 4/4
```
**Always read the `.log` after a run.** A stale log is not truth — re-run before trusting it (a stale
`presence.log` once showed `FAIL` after the source was already fixed; the fresh run is authoritative).

## Settled decisions (user, 2026-07-01 — do not re-litigate)
- Team partition **Discipline (4D) → Role (7D)** — CONFIRMED, locked.
- **Project stays implicit** — the design spine, NOT a Find-panel facet; earns no glyph.
- Modeller Role×Project pivot — **engine-ready, NOT wired**; no `modeller/` edits until that session settles + icon go-ahead.
- 4D-Gantt Time Machine is a genuine exception (an authored *schedule*, not an oplog projection) — kept visibly separate.
