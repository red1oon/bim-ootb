<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# `teams/` — the **Teams overlay** (collaboration + universal optics, standalone & additive)

> A signed-op-log collaboration layer shared by the **BIM Modeller/Viewer** *and* **ERP**: offline,
> git-style branches over one model/ledger, a combined dashboard, blame-tinted views, a chat that IS the
> op-log, the universal **dot-layer optics** (person/post-it dots, fan-out, hover-blame), and an ERP edge
> sync over GitHub/OCI. Everything is a deterministic **fold of one signed log** (NON-INVENT, tamper-evident).
> Specs: `prompts/RESUME_DISTRIBUTED_BRANCHES.md` (bim-compiler) → `DESIGN.md` (engine) · `TEAM_OPTICS.md`
> (shared optics) · `ERP_CONTEXT.md` (ERP binding). **Execution plan + status = [`ROADMAP.md`](ROADMAP.md).**

## Status — Phases A–E complete (S1–S9), all witnessed
The engine core, the universal optics, the ERP read surfaces, the two guarded live hooks, and the sync +
pill are all built and green. **Phase F** (the differentiators) is the only band left — see `ROADMAP.md`.

## ⚠ Separation of concerns — DO NOT BREAK
- **Self-contained + additive.** The only coupling point to a host is `connectors.js` (BIM) / the injected
  host objects in `erp/*` (ERP). The overlay touches **zero** modeller code; the only ever edits to live
  `erp/` runtime are the two **default-off, reversible** Phase-D hooks (`§S7`, proven byte-identical).
- **Team OFF = pixel-identical UI** (the headline guarantee, witnessed in `§S9`): with the flag off, no
  overlay DOM exists and the host screen is byte-for-byte unchanged.
- **Naming:** the **Teams pill** (2-person icon, `teams_pill.js`) is DISTINCT from the ERP/Viewer
  *red-pill / Zoom-Across* (`erp/redpill.png`, `zoom_across.js` — nav/geometry). Don't conflate them.
  ⚠ The line-edit mounting the pill into the **production** `erp/kanban_host.js` chrome is a **gated
  follow-up** — the launcher is proven on the standalone demo page first (per `ROADMAP.md §P5`).

## Layout
| path | role | slice |
|------|------|-------|
| `index.js` | barrel — one import for the whole layer | — |
| `connectors.js` | **the only BIM coupling point** — stub bodies swap to live bindings | — |
| `engine.js` · `gate.js` · `chatlog.js` | branches · owner-gate · total-order · fold · blame · freshness · color ladder · chat==log | core |
| `protocol.js` · `facilitator.js` · `transport.js` | CAS seam · trustless relay · facilitator-over-HTTP (GitHub/OCI) | core |
| `overlay/teams_view.js` | view-model builders (Tree/Chat/Dashboard) + DOM renderers | core |
| `overlay/dot_layer.js` | **universal optics** — person/post-it dots, fan-out `+N`, colour=signer, record-blame | S2 |
| `overlay/postit.js` | post-it = signed `annot` op on a 7-kind universal anchor; private-first; organise/recall | S3 |
| `overlay/share_bundle.js` | bunch-&-share (N post-its → digest → channel) + the `what·who·when` work summary | S4 |
| `overlay/teams_pill.js` | the distinct 2-person **Teams launcher** + flag-guarded mount (OFF = pixel-identical) | S9 |
| `erp/erp_bridge.js` | read-only adapter to a live ERP `kernel_ops` log (sign/verify · World · blame) — host injected | S1 |
| `erp/erp_optics.js` | ERP Dashboard optics — gate ladder · Flow lens (process-mining) · involvement · Organiser | S5 |
| `erp/my_work.js` | the "waiting-for-me" per-role inbox + field-grain hover-blame (adds the fold; keeps `AD_ChangeLog`) | S6 |
| `erp/op_subscribe.js` | teams-side wiring: the kernel's post-commit emit → team bus (`TEAM_OP`), reversible | S7 |
| `erp/erp_sync.js` | ERP `kernel_ops` sync over the transport — export/verify/import a branch; CAS shared masters | S8 |
| `demo/` | standalone live pages (`gh_demo.html` remote-peer · `erp_teams_pill.html` pill demo) | — |
| `tests/` | node `§`-log witnesses (`poc_teams_*.js`) + the chromium wire check (`wire_teams_pill.js`) | — |

Browser globals (UMD): `TeamsConnectors/Engine/Gate/Chatlog/Protocol/Facilitator/Transport`,
`TeamsView`, `TeamsDotLayer`, `TeamsPostit`, `TeamsShareBundle`, `TeamsPill`,
`TeamsErpBridge`, `TeamsErpOptics`, `TeamsMyWork`, `TeamsErpOpSubscribe`, `TeamsErpSync`.

## Run the witnesses
```sh
node teams/tests/run_all.js          # 18 node witness files — ALL must be green
node teams/tests/wire_teams_pill.js  # W-TEAM-WIRE 4/4 — Playwright (chromium) embed check
```
The ERP-side witnesses (`poc_teams_erp_*`, `poc_teams_phase_d`, `poc_teams_my_work`) drive the **real**
`erp/` modules in node (a `window`/WebCrypto/`sql.js` shim) — proving the bridge/sync/hooks against the
actual kernel, not a mock. Witness highlights by slice:
`W-ERP-SIGN/-FOLD` (S1) · `W-DOT-LAYER`+`W-BLAME-RECORD` (S2) · `W-POSTIT` (S3) ·
`W-BUNDLE-SHARE`+`W-WORK-SUMMARY` (S4) · `W-ERP-GATE/-FLOW`+`W-INVOLVE`+`W-ORGANISER` (S5) ·
`W-ERP-MYWORK`+`W-FIELD-LINEAGE` (S6) · `W-EMIT`+`W-SCOPE` (S7) · `W-ERP-SYNC` (S8) · `W-TEAM-WIRE` (S9),
plus the engine/view core (`W-GATE-CROSS-BRANCH`, `W-BLAME-COLOR`, `W-CHAT-IS-LOG`, `W-VIEW`, `W-REMOTE`).

## Live demos (standalone, read-only — `demo/README.md`)
- **Pill demo** (`§S9`): a mock ERP Dashboard + the Teams pill; OFF = pixel-identical, ON mounts the
  overlay. **Live (OCI):** `…/o/teams-demo/demo/erp_teams_pill.html`.
- **Remote peer** (`gh_demo.html`): pulls the shared model from the GitHub/OCI facilitator and folds it.

## Connector seam — STUB → REAL (go-live mapping)
```
evaluateGate  → sdg_gate.evaluate          (§GATE-1 RED/ORANGE clash+clearance)
foldCost      → viewer/rates.js foldCost   (§SE 5D rollup)
sign/verify   → erp/kernel_ops.js          (signed hash-chain; see erp/erp_bridge.js)
subscribeOps  → window 'bonsai:oplog' (BIM) / kernel_ops.setOpEmitter → team bus (ERP, §S7)
bus           → BroadcastChannel('bim_teams')  (Tier-1 awareness)
```
Swapping the stubs leaves the engine + witnesses unchanged — `connectors.goLive(host)` /
`erp_bridge.goLiveErp` / `erp_sync.makeErpTransport` bind each seam to real host code.
