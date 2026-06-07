# ⚠ DO NOT REMOVE — History PERSIST & RECALL across page-leave / tab-close / building-return
# Scope: DISCUSS-FIRST. The history/undo timeline (common/history_bar.js, LIVE) keeps its full
#        per-element trail IN MEMORY — so leaving the building page (→ landing index.html, → ERP
#        idempiere.html) or closing the tab DROPS it. The user wants: **return to the same building
#        later and recall the history.** This prompt frames the problem on the REAL current
#        architecture and lays out UX options — investigate + propose to the user BEFORE building.
#        Whitebox §-log is the witness; save every run to a log and READ it before concluding.
#        Edit shipping code ONLY in /home/red1/bim-ootb/. Honour until ✅ DONE.

## ▶ INTENT (user, verbatim sense)
"When we leave a building page to go to the main landing HTML, or to iDempiere, or even close the
tab — but then return to the building — can we still recall back the history? Discuss that, and see
what user experience we can have."

Related, already-agreed deferral (same lane): **camera-stops with no selection are NOT recorded**
(by design — §6b IGNORE bucket). If "record where I parked the camera" comes up, decide it here too.

## ▶ WHAT PERSISTS TODAY vs WHAT DOESN'T (grounded — verify, don't trust this blindly)
LIVE state of the shipped system (HISTORY_SCRUB_FIX §1–§9, see [[project-history-shared-module]]):

- **Signed kernel log — ALREADY PERSISTED.** `viewer/kernel_ops.js:80` `_persistToIdb(db)` exports the
  whole sql.js DB (incl. `kernel_ops`) to IndexedDB `bim_ootb_cache`, **hash-chain SEALED first**
  (W-CHAIN, tamper-evident at rest). So `ELEMENT_PICK` / `GRID_MOVE` / `BUILDING_OPEN` (the kernel
  ops) survive a refresh AT THE DB LEVEL.
- **History VIEW cache (`_stream` in `common/history_bar.js`) — IN-MEMORY, LOST on close.** It is
  DERIVED from the kernel (§9 storage tiers: "rebuildable from the kernel, except view-only lens-nav
  which is ephemeral"). It is NOT persisted today.
- **Cross-app doc log `bim.docHistory` (localStorage) — PERSISTED across tabs AND visits.** Holds
  MAIN/DOC milestones (`BUILDING_OPEN`, …). The landing already renders this union (§8). Survives
  tab close.
- **Depth choice `bim.universalHist.depth` (localStorage) — PERSISTED.**
- Cross-tab live sync: `BroadcastChannel('bim_history')` + the `storage` event (same-origin: viewer,
  landing, ERP all under bim-ootb).

## ▶ THE CORE QUESTION → likely a REHYDRATION, not a new store
The signed truth (kernel_ops) is already persisted. So "recall history on return" is mostly:
**on building-open, rebuild the timeline FROM the persisted kernel_ops (verify the chain first), and
present a resume UX.** Two things to settle by INVESTIGATION before any code:

1. **Does building-open actually reload the IDB-cached DB (with kernel_ops), or re-fetch a FRESH copy
   from OCI (overwriting the cache → kernel_ops gone)?** The user's session log shows `§CACHE_HIT
   Terminal_meta.db` + `§GEO_CACHE_CHECK hit=true` (DBs DO load from cache), but CONFIRM the cached
   blob is the one carrying the session's `kernel_ops`, and that a re-open reads it back. If a fresh
   OCI copy wins, kernel persistence must move to a SEPARATE per-building store (don't bloat the geo DB).
2. **View-nav steps (Find axis/group/item) are pushed to the timeline but are NOT kernel ops** —
   they're view entries. A kernel-only rehydrate would restore picks + milestones but LOSE the Find
   breadcrumb trail (§9 calls lens-nav "ephemeral"). Decide: persist the full view trail too (a small
   per-building view-cache, localStorage/IDB) or accept Find-nav as ephemeral.

## ▶ STORAGE TIERS (from §9) — where persistence fits, and the bloat guard
- **Kernel log** — persisted, signed, tiny (op_type + small params + hash chain). NEVER put images.
- **History view cache** — small text (label, guids, kind). DERIVED; safe to clear; rebuildable.
  THIS is the tier to (optionally) persist per-building for the full-trail recall.
- **Thumbnails** (if ever) — ephemeral, memory-only, capped LRU. Never persisted (bloat guard).
- Constraints: localStorage ≈ 5–10 MB, synchronous, string (the §9 panel showed it at ~17 KB — lots
  of headroom for text trails). IndexedDB for anything bigger / the DB blob. The "one live SIGNED
  WASM kernel shared across tabs" (SharedArrayBuffer) tier is **localhost-only** — GH Pages can't send
  COOP/COEP (same wall as geo-range streaming). Persist-across-visits does NOT need SAB; localStorage
  + IDB suffice and work on GH Pages.

## ▶ UX OPTIONS TO DISCUSS WITH THE USER (pick, don't invent silently)
Building identity = `A.activeBuilding` (e.g. "Ifc2x3_Duplex_Federated") — key the history by it.
- **A. Resume toast** — on return: "Resume your last session? N steps · last: <label>" → restores the
  timeline (and optionally jumps to the last view). Dismiss = start fresh (but keep the stored trail).
- **B. Silent rehydrate** — the scrub bar just opens already populated; user scrubs back at will. No prompt.
- **C. Per-building history** — switching buildings shows THAT building's trail; the bar is keyed by building.
- **D. Landing chip → reopen+restore** — clicking a building's chip on the landing history line opens
  the building AND restores its timeline (the cross-app payoff; landing already lists the opens).
- **E. Glassbowl cross-visit scrubber** — the full multi-visit history as the dot-line + double-tap
  bloom (the `build/erp/glassbowl.html #scrub` pattern), so "yesterday's walk" is one scrub away.
- **F. Retention / privacy** — how many visits / steps before prune (kernel already self-prunes to 2
  SESSION_STARTs); the §9 Cache-Info panel already CLEARS the view cache without touching the kernel.
  Offer "fresh session only" as an opt-out.

## ▶ DECISIONS THE USER MUST MAKE (surface these, then build)
1. Auto-restore silently (B) or prompt-to-resume (A)?
2. Persist the FULL view-nav trail (Find breadcrumbs survive) or kernel-derived only (picks+milestones)?
3. Per-building scope (C) — confirm key = building name; what about the city / multi-building view?
4. Landing/ERP deep-link restore (D) — in scope now, or after the viewer-local recall?
5. Retention window + the clear control (F).

## ▶ WHERE TO BUILD (keep the shared-module shape)
Persistence belongs IN `common/history_bar.js` so the viewer AND ERP both inherit it — extend
`HistoryBar.configure({ persistKey, building })`: on `open`/configure, LOAD this source+building's
stored stream; on `push`, SAVE (debounced) to localStorage/IDB; keep the signed kernel as the source
of truth and the view cache as the rebuildable convenience layer. Viewer adapter
(`viewer/universal_history.js`) passes the building key; restore stays owner-local. Do NOT touch
`navigate_find.js` (separate refactor lane). ERP wires the same `persistKey` against its own data.

## ▶ WITNESS (when built — whitebox §-log first, leak-safe headless)
- Drive picks + a grid move → close the page → re-open the SAME building → the timeline REHYDRATES
  (same steps, same labels); `verifyChain ok=true` on the persisted kernel (`§HIST_CHAIN_OK`).
- Switch to a DIFFERENT building → its own (empty or prior) trail; switch back → first building's trail.
- Cross-tab still syncs (`BroadcastChannel`); the landing union still renders; depth choice still persists.
- No regression: run `tests/run_regression.sh` (the 6 viewer probes) — all green; no PAGEERROR.

## ▶ DELIVERABLE
Investigate the two VERIFY items, write up the persistence + UX recommendation, get the user's
decisions (above), THEN implement in the shared module + witness + PR. Frame the demo around the
novel bit: a **serverless, SIGNED history that survives tab-close and rehydrates on return** — across
landing ↔ viewer ↔ ERP, no backend.
