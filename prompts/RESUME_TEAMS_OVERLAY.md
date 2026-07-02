<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — RESUME: Teams overlay (next session entry point)

**Scope:** the `teams/` collaboration + universal-optics overlay (BIM Modeller/Viewer **and** ERP), built as
a standalone, additive, signed-op-log layer. **Read the log after every run** (Log Mandate). Honour this
preamble until Phase F is `✅ DONE` or this file is retired.

> Paste this prompt to start the next Teams session. Source of truth for the plan = **`teams/ROADMAP.md`**;
> this file is the fast-start + handoff. The work lives in **bim-ootb**, branch **`lane/teams-overlay`**.

> **⚠ DEPLOY GATE (user, 2026-07-02) — NOT pushed to production yet, and stays that way until the Modeller
> lane's in-flight work completes.** Verified against the live `bim-ootb-live`/`bim-ootb-dev` OCI buckets
> 2026-07-02: `teams/`, `teams_embed.js` are 404 everywhere in production — the whole overlay exists only in
> git (`main` + this branch), never uploaded. Do NOT run the OCI `oci os object put` deploy steps in §4 below
> for the production app chrome (`modeller/teams_embed.js` into `modeller.html`, `erp/teams_embed.js` into
> `erp/idempiere.html`) until the Modeller lane's currently-open threads (Terminal-scale perf-guard,
> SampleCastle LOD-catalog-match, guide-screenshot mis-framing — see `bim-compiler prompts/
> RESUME_MODELLER_LOD400_REAL_GEOMETRY.md` / `RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md`) are settled — same
> "schedule only after the modeller session settles" principle `teams/ROADMAP.md §R5` already applies to S11,
> now extended to the production deploy as a whole. The standalone demo pages (`teams-demo/` prefix on
> `bim-ootb-dev`) are NOT gated by this — those are already live and fine to keep updating.
> **Scope is intentionally Modeller + ERP only — the 3D Viewer is deliberately NOT wired and that's fine,
> not a gap to close** (Viewer already carries HBA's Human-Asset overlay; Teams' who-dots/optics answer a
> different question there via `hba_lens.js`'s own surfaces, no need to duplicate the mechanism a third way
> unless asked).
> **`docs/TeamsOverlayGuide.md` needs more/better context screenshots + a step-by-step walkthrough before the
> production deploy** — today it has 4 hero/context screenshots and no numbered walk-through, thin compared to
> `ModellerGuide`'s 21-frame 2× DPR standard (`prompts/RESUME_MODELLER_GUIDE_POLISH.md` pattern) or the HBA
> guide's per-feature capture pass. Do this as part of the SAME session that does the gated production deploy —
> capture screenshots off the real embedded pill (`?teams=1` in `modeller.html`/`erp/idempiere.html`), not the
> standalone demo pages, so the guide matches what a user actually sees.

---

## 0. Orientation (where everything is)
- **Repo / branch:** `red1oon/bim-ootb`, branch **`lane/teams-overlay`** (de-facto trunk for this work; all
  pushed, unmerged to `main` — that's known & fine). Work in a `/tmp/wt-*` **worktree**, never the shared
  `~/bim-ootb` checkout (a PreToolUse hook blocks the shared tree).
- **Module:** `teams/` — `README.md` (user guide), `ROADMAP.md` (the plan + §G gate + §R risks),
  `DESIGN.md` / `TEAM_OPTICS.md` / `ERP_CONTEXT.md` (specs), `IDEAS.md`, `COMPETE.md`.
- **Doctrine (non-negotiable, `ROADMAP.md §P`):** ① **Team OFF = pixel-identical UI** (flag off → zero new
  DOM). ② **Additive only** — new files in `teams/`; the ONLY live `erp/` runtime edits are the two
  default-off, reversible Phase-D hooks. ③ **Witness-first** (`§`-log node witness green before any chrome).
  ④ Isolated worktree, push only your branch. ⑤ **Demo before embed** (standalone page → embed only with
  EXPLICIT GO). ⑥ **Determinism + NON-INVENT** (no `Date.now`/`Math.random` in fold/render; every value
  traces to a signed op). ⑦ One signed log; never change the `kernel_ops` schema.

## 1. FIRST — run the regression gate (§G), confirm green before any new work
```sh
# in a fresh worktree off origin/main-merged lane/teams-overlay:
node teams/tests/run_all.js            # 21 node witness files — must be ✅ ALL PASS
node teams/tests/wire_teams_pill.js    # W-TEAM-WIRE 4/4 (Playwright/chromium)
node erp/tests/wire_teams_embed.js     # W-EMBED-WIRE 4/4 (the production-chrome embed: OFF pixel-identical · ON mounts)
```
- **sql.js / WebCrypto shim:** the ERP-side node witnesses (`poc_teams_erp_*`, `poc_teams_phase_d`,
  `poc_teams_my_work`, `poc_teams_erp_sync`) drive the REAL `erp/` modules in node. They self-shim
  `global.window={}` + `global.crypto=require('crypto').webcrypto` and resolve `sql.js` from the checkout's
  `node_modules` (fallback `/home/red1/bim-ootb/node_modules/sql.js`). If a browser test can't find
  `playwright`, symlink it: `ln -s ~/bim-ootb/node_modules node_modules; mkdir -p tests && ln -s
  ~/bim-ootb/tests/node_modules tests/node_modules` (session-local; do NOT commit these symlinks).
- **⚠ Known env limit:** the **full iDempiere app** Playwright tests (`erp/tests/poc_i4_reconcile.js` etc.)
  fail at baseline here (`#pill-kanban` timeout — they need the built app served). The 41/47 **node-only**
  erp tests are green; the 6 reds are pre-existing fixture/server/DOM gaps (verified identical with the
  `erp/` edits reverted). Standalone teams demo pages DO drive fine under chromium.

## 2. DONE — Phases A–E (S1–S9), all witnessed (do NOT redo)
| slice | what | witness |
|---|---|---|
| S1 | `erp/erp_bridge.js` — read-only adapter to a live ERP `kernel_ops` log (sign/verify·World·blame), host injected | W-ERP-SIGN/-FOLD 9/9 |
| S2 | `overlay/dot_layer.js` — universal optics: person/post-it dots, fan-out `+N`, colour=signer, record-blame | W-DOT-LAYER+W-BLAME-RECORD 11/11 |
| S3 | `overlay/postit.js` — signed `annot` on a 7-kind universal anchor; private-first; organise/recall | W-POSTIT 9/9 |
| S4 | `overlay/share_bundle.js` — bunch-&-share → digest → channel; `what·who·when` work-summary | W-BUNDLE-SHARE+W-WORK-SUMMARY 10/10 |
| S5 | `erp/erp_optics.js` — gate ladder · Flow lens (process-mining) · involvement · Organiser | W-ERP-GATE/-FLOW/-INVOLVE/-ORGANISER 13/13 |
| S6 | `erp/my_work.js` — per-role "waiting-for-me" inbox + field-grain lineage (ADDS fold; keeps `AD_ChangeLog`) | W-ERP-MYWORK+W-FIELD-LINEAGE 10/10 |
| S7 | **the gate** — 2 default-off `erp/` hooks: `kernel_ops.setOpEmitter` (post-commit `TEAM_OP`) + `erp_seam` optional `scope`; teams-side `erp/op_subscribe.js` | W-EMIT+W-SCOPE 11/11 (byte-identical when off) |
| S8 | `erp/erp_sync.js` — export/verify/import a `kernel_ops` branch over the transport; CAS shared masters | W-ERP-SYNC 7/7 |
| S9 | `overlay/teams_pill.js` distinct 2-person launcher + standalone demo `demo/erp_teams_pill.html` | W-TEAM-WIRE 4/4 (chromium) |
| S10 | `overlay/world_at_t.js` (re-fold prefix → record/world as-of T) + `erp/cosign.js` (maker-checker four-eyes + legal signoff) + `overlay/broadcast.js` (eligible-gated system-wide sticky) | W-WORLD-AT-T+COSIGN+BROADCAST 16/16 (`poc_teams_s10.js`) |
| S11 | `overlay/presence.js` — unified BIM↔ERP presence: one identity/colour fabric over the shared bus; `whereIs`/`crossProduct` (the moat); zero modeller/erp edits | W-XPRESENCE 7/7 (`poc_teams_presence.js`) |
| S12 | `overlay/replay.js` (step-recorder replay, state re-folds as-of each step) + `erp/nudges.js` (one dismissible nudge/item vs MEASURED baseline) + `overlay/feature_stub.js` (honest disabled "propose-changes" placeholder) | W-REPLAY+NUDGE+FEATURE-STUB 13/13 (`poc_teams_s12.js`) |

**Deployed live (S9):** OCI dev bucket `…/o/teams-demo/demo/erp_teams_pill.html` (text/html; deps
`text/javascript`) + GitHub-raw on `lane/teams-overlay`. Live chromium smoke green (OFF pixel-identical →
ON mounts pane+dots, 0 console errors). Earlier remote-peer demo `demo/gh_demo.html` = W-REMOTE 7/7.

## 3. OPEN / NEXT — Phase F (the differentiators) + the one gated embed
**Pick up at `ROADMAP.md` Phase F.** Same recipe each slice: cite the spec → build additive in `teams/` →
`§`-witness (logs read) → §G gate green → commit + push (0 local-only) → update `ROADMAP.md` + memory.
- **S10 — World-at-T + maker-checker + broadcast.** ✅ **DONE** — `overlay/world_at_t.js` (re-fold a PREFIX →
  record/world as-of T; `before(opId)` = blame→time) + `erp/cosign.js` (maker-checker four-eyes + legal signoff;
  REFUSES self-approval/ineligible; `tampered` on a broken chain) + `overlay/broadcast.js` (eligible-gated
  system-wide sticky; all/role/level targeting; ACK+REVOKE). All standalone pure folds, **zero erp/ edits**;
  **W-WORLD-AT-T+COSIGN+BROADCAST 16/16** (`poc_teams_s10.js`; run_all 19/19). Engine-only, no new chrome
  (like S5–S8).
  - **✅ SHOWCASE DEMO LIVE (deployed 2026-06-30, OCI `teams-demo/`):** `teams/demo/phase_f_showcase.html` —
    a standalone clickable page for all six Phase-F optics (World-at-T · co-sign · broadcast · replay · nudges ·
    presence), each a pure fold over seeded non-invent data.
    URL `https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/teams-demo/demo/phase_f_showcase.html`
    — live chromium smoke GREEN (6 cards, World-at-T verify ✓, co-sign Approved, 3 nudges, 5 presence dots, 0
    console errors). ⚠ Building it surfaced + fixed a real bug: `postit`/`cosign`/`broadcast` leaked private
    `_op`/`_append` into global scope (Node-isolated so witnesses passed, but browser <script> co-load collided
    → cosign built a broadcast op). FIXED by IIFE-wrapping the three (like `erp_bridge.js`); zero behaviour change.
    LESSON: a teams module co-loaded as a browser `<script>` MUST be IIFE-wrapped if it defines common helper
    names — node `require` isolation hides the collision from the witnesses.
- **S12 — Replay-onboarding + nudges + "new feature" stub.** ✅ **DONE** — `overlay/replay.js` (step-recorder,
  state re-folds as-of each step) + `erp/nudges.js` (one dismissible nudge/item vs a MEASURED baseline; too few
  samples → REFUSE) + `overlay/feature_stub.js` (honest disabled "propose-changes" placeholder). All standalone
  pure folds, **zero erp/ edits**; **W-REPLAY+NUDGE+FEATURE-STUB 13/13** (`poc_teams_s12.js`; run_all 20/20).
- **S11 — Cross-product BIM↔ERP unified presence (the moat). ✅ DONE** (modeller paused → unblocked; built
  additive, ZERO modeller/erp edits). `overlay/presence.js`: one identity/colour fabric folded from `presence`
  heartbeats on the SAME shared `BroadcastChannel('bim_teams')` bus both products use — `makePresence` (fixed
  schema, product∈{bim,erp}, NON-INVENT) → `foldPresence` (per-identity, one colour=signer, active-window) →
  `whereIs` / `crossProduct` (an ERP viewer reads BIM peers + vice-versa) / `presenceDots`. The BIM/ERP sides
  only EMIT a heartbeat onto the bus seam — no host file edited (§R5). **W-XPRESENCE 7/7** (`poc_teams_presence.js`;
  run_all 21/21). **→ Phase F (S10/S11/S12) is fully DRAINED.** The only thing the BIM/ERP hosts add later is a
  one-line heartbeat emit on nav (a thin bus `postMessage`, not a code-coupling) — wire when each product is touched.
  - **Live-wiring ready (channel hook):** the awareness bus channel is now INJECTABLE —
    `connectors.goLive(host,{channel})` / `connectors_live.makeConnectors(host,{channel})` (default `'bim_teams'`,
    exposed as `Connectors._channel`). ⚠ The live ERP host opens `BroadcastChannel('bim_erp')` (in `erp/ad_ui.js`)
    and the modeller opens **none** yet — so to make cross-product presence actually MEET, bind the overlay to the
    suite's shared channel (e.g. `goLive(window,{channel:'bim_erp'})`) AND have the modeller emit on the same one.
    This is the existing GAP-BUS-SCOPE seam decision; the migration did NOT touch the bus. W-GOLIVE 15/15 covers it.

### Gated embed — ✅ CODE-LANDED in BOTH products + in-app verified (2026-06-30, user GO); remaining = live data + deploy
- **Modeller (BIM-side) overlay — ✅ landed** (`modeller/teams_embed.js`, W-EMBED-BIM 4/4): OFF (default) =
  pixel-identical; ON (`?teams=1`) → a distinct FLOATING Teams pill mounts (modeller has no toolbar) → click paints
  contextual dots on the Outliner rows (`#bonsai-outliner [data-fid]`, colour=signer = who's on each element) + a
  presence pane (current BIM actor, cross-product-ready) + emits a `bim` heartbeat on the shared bus. `modeller.html`
  +2 guarded lines; `modeller/sw.js` v19→v20 (⚠ main is v23 from the building migration → on merge take the higher
  version + keep both precache adds). In-app smoke on REAL `modeller.html`: OFF inert/0 errors, ON pill mounts/0 errors.
- **The Teams pill is also embedded into PRODUCTION `erp/idempiere.html` chrome** — flag-guarded, additive:
  - `erp/teams_embed.js` (NEW) — ONE inert guarded bootstrap. OFF (default) → `init()` returns immediately,
    NO pill/pane/module-fetch = **pixel-identical**. ON (`localStorage.teamsEmbed='1'` | `?teams=1`) → it
    lazy-loads the proven `teams/` trio (dot_layer/erp_optics/teams_pill) + mounts the **distinct** Teams pill
    INTO the live `#idmp-pill` bar; the pane folds a host-provided read-only op-log (`window.TeamsEmbedOps()`),
    absent → an honest empty pane (NON-INVENT). Reversible.
  - `erp/idempiere.html` — 2 additive guarded lines: `<script src="teams_embed.js?v=1">` + a flag-guarded
    `TeamsEmbed.init({header:#idmp-pill})` right after `IdmpPills.mount()`. `erp/sw.js` bumped `v755→v756`
    + precache `teams_embed.js`.
  - **Witness `erp/tests/wire_teams_embed.js` (W-EMBED-WIRE 4/4, chromium)** over a minimal host fixture:
    OFF=no pill + no module fetch + header byte-identical · ON=pill mounts into `#idmp-pill` (lens pill intact,
    no redpill/zoom collision) · pane folds the host ops (involvement + dots) · reversible.
  - **In-app smoke (real `erp/idempiere.html`, headless chromium):** OFF → `TeamsEmbed` defined, `isEnabled()=false`,
    no `#teams-pill`, **0 teams-attributable console/page errors**. ON (`?teams=1`) → deps lazy-loaded, distinct
    `#teams-pill` mounted with `parentNode==#idmp-pill`. (Exceeded the "harness unavailable" caveat — the bar
    mounted in-env.)
- **REMAINING (the user runs these):** (1) wire `window.TeamsEmbedOps()` to fold the LIVE signed `kernel_ops`
  log into the shape `{id,ts,author,role,cls,verb,target}` (left unwired — needs the live projection schema
  confirmed in the real app; NON-INVENT, no schema guessing) — until then the pane shows the honest empty state;
  (2) optional `rowSelector`/`docOf` so row-dots paint on idempiere's real grid rows; (3) **deploy to production**
  (OCI/gh-pages) only with the no-overwrite deploy discipline + a human eyes-on check — NOT done here (outward-facing),
  **AND gated on the Modeller lane completing (see the DEPLOY GATE callout at the top of this file, 2026-07-02)**;
  (4) refresh `docs/TeamsOverlayGuide.md` with real embedded-pill screenshots + a numbered step-by-step, same
  session as (3) — see the DEPLOY GATE callout.

## 4. Deploy notes (when a slice ships a live page)
- Push branch → GitHub-raw serves the source automatically. For a renderable page, **OCI** is the target:
  `oci os object put -bn bim-ootb-dev --name teams-demo/<path> --file <f> --content-type <MIME> --force`
  — **EVERY put MUST set `--content-type`** (OCI nosniff blocks otherwise). Namespace `ax3cp6tzwuy2`, region
  `ap-kulai-2`. Then **verify live** (curl headers + a chromium smoke against the live URL). Never overwrite
  production app assets; the teams demo lives under the `teams-demo/` prefix only.
