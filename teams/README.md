<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# `teams/` — Modeller **Teams overlay** engine (standalone, additive)

> The collaborative layer for the Modeller: offline, signed, git-style branches over ONE building —
> multiple engineers each on an isolated branch of the signed op-log, a combined dashboard, a
> blame-tinted Outliner, and a chat that IS the op-log read as commit messages.
> Spec: `prompts/RESUME_DISTRIBUTED_BRANCHES.md` (bim-compiler). This is the **engine port** of
> `build/redpill/*` from bim-compiler — pure move, witnesses preserved (25/25).

## ⚠ Separation of concerns — DO NOT BREAK
This module is **deliberately self-contained and additive**. The Modeller is in active heavy dev.
- **No UI launcher / pill icon is wired here.** The "Teams" pill (2-person icon) is a *later* step;
  do not place an icon until told.
- **Touches zero modeller code.** Everything depends only on the connector seam (`connectors.js`).
- Naming: red-pill = "Zoom-across to the shared model" in the **ERP/Viewer** (a different, existing
  feature — `viewer/redpill.png`, `viewer/tests/poc_redpill_*`, `erp/redpill.png`). In the **Modeller**
  it is this dedicated **Teams overlay**. This module is named `teams/` to keep the two unambiguous.

## Layout
| file | role |
|------|------|
| `index.js` | barrel — one import for the whole layer (`{ Connectors, Engine, Gate, Chatlog }`) |
| `connectors.js` | **the only coupling point.** Stub bodies to swap for live bindings (see map below) |
| `engine.js` | branches · owner-gate (single-writer) · total-order · fold · blame · freshness |
| `gate.js` | merge gate + color ladder (Tier-1 hint / Tier-2 settle / stale overlay / clash matrix) |
| `chatlog.js` | chat == the signed log (deterministic prose projection, tamper-evidence) |
| `tests/` | the 3 node witnesses (no deps, no modeller) |

Browser globals (UMD): `TeamsConnectors`, `TeamsEngine`, `TeamsGate`, `TeamsChatlog`.

## Connector seam — STUB → REAL (go-live mapping, NOT done here)
```
evaluateGate  → sdg_gate.evaluate          (§GATE-1 RED/ORANGE clash+clearance)
foldCost      → viewer/rates.js foldCost   (§SE 5D rollup)
sign/verify   → erp/kernel_ops.js          (signed hash-chain)
subscribeOps  → window 'bonsai:oplog' event
bus           → BroadcastChannel('bim_teams')  (Tier-1 awareness)
```
Swapping the stubs is a separate, later step; **engine + witnesses do not change** when it happens.

## Run the witnesses (must stay 25/25)
```sh
node teams/tests/run_all.js        # or run each tests/poc_teams_*.js individually
```
- `W-GATE-CROSS-BRANCH` 11/11 — two branches → one clash cell: provisional → verified → stale
- `W-BLAME-COLOR` 5/5 — blame map = last author per element in total order
- `W-CHAT-IS-LOG` 9/9 — chat lines are a deterministic render of signed ops; tamper-evident
