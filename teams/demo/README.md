<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# Teams demo — durable facilitator on **GitHub** + **OCI** (DESIGN.md §7)

A remote user pulls the **shared model** from a durable, trustless, content-addressed facilitator and
reconstructs the World — no authoritative server, signatures + content hashes are the only trust.

## The store (`store/`)
Seeded by `seed_store.js`, which dogfoods the HTTP transport (fs-backed get/put) to write the exact
layout GitHub-raw / OCI then serve:
```
store/branches/{trunk,MEP,STR}.log.json   signed op chains (the History)
store/cas/<key>.json                      a shared datum (content-addressed seam)
store/tips.json                           branch → tip ref directory
store/presence/{MEP,STR}.json + index     Tier-1 awareness
```
Rebuild: `node teams/demo/seed_store.js` → then commit `store/` (GitHub) and/or upload it (OCI).

## Live facilitators (both verified W-REMOTE 7/7 over real fetch)
- **GitHub** (durable, content-addressed, read = no creds):
  `https://raw.githubusercontent.com/red1oon/bim-ootb/lane/teams-overlay/teams/demo/store/`
- **OCI** object storage — the *second remote user* (dev bucket `bim-ootb-dev`, region `ap-kulai-2`):
  `https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/teams-demo/store/`
  (uploaded with `--content-type application/json` per `deploy/OCI_UPLOAD.md` §RULES.)

## Reproduce
```sh
# remote-pull smoke (node ≥18, real fetch) — proves the trustless guarantees end-to-end:
node teams/demo/smoke_remote.js "https://raw.githubusercontent.com/red1oon/bim-ootb/lane/teams-overlay/teams/demo/store/"
node teams/demo/smoke_remote.js "https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/teams-demo/store/"
```
W-REMOTE asserts: `tips()` lists the branches · every pulled chain re-verifies (`verifyChain`) · `fold`
reconstructs the World (Col-204 moved to y=5.2) · the gate finds the MEP×STR clash · the CAS datum
round-trips by content key · presence summarizes peers.

## Visual demo
`gh_demo.html` — open in a browser; it pulls from the GitHub facilitator by default (override with
`?base=<url>`, e.g. the OCI base) and renders the Tree / Chat / Dashboard / canvas from the pulled,
signed, folded model. Read-only remote peer (no writes). No icon / launcher wired.

## Pill demo — `erp_teams_pill.html` (ROADMAP §S9)
The distinct **Teams pill** (2-person icon) over a mock ERP **AR Dashboard**. Default = pixel-identical to
the bare chrome (no overlay DOM); click the pill → the universal dot-layer paints person/`+N` clusters onto
the rows and an **involvement** pane mounts; click again → reverts to the exact baseline (reversible).
Self-contained (seeded, read-only); proven by `teams/tests/wire_teams_pill.js` (**W-TEAM-WIRE 4/4**, chromium).
- **Live (OCI, renders as HTML):**
  `https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/teams-demo/demo/erp_teams_pill.html`
- **Source (GitHub-raw):** `…/red1oon/bim-ootb/lane/teams-overlay/teams/demo/erp_teams_pill.html`
- ⚠ The line-edit mounting this pill into the **production** `erp/kanban_host.js` chrome is a gated
  follow-up — the launcher is proven standalone first (§P5).

## Lifecycle (DESIGN §7)
First peer = senior host → **promote** to durable: this demo *is* the promotion target (GitHub / OCI).
GH/OCI are async store-and-forward (Tier-2); Tier-1 live presence degrades to last-seen polling here.
Write path (push) over GitHub = git commit (GH is content-addressed); over OCI = `oci os object put`
with `--content-type`. Reads need no creds.
