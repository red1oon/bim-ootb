# ⚠ DO NOT REMOVE — History PERSIST & RECALL across page-leave / tab-close / building-return
# Scope: BUILD (discuss CLOSED 2026-06-08 → see §LOCKED). The history/undo timeline
#        (common/history_bar.js, LIVE) keeps its full per-element trail IN MEMORY — so leaving the
#        building page (→ landing index.html, → ERP idempiere.html) or closing the tab DROPS it. The
#        user wants: **return to the same building later and recall the history.** Decisions are made;
#        confirm the two §VERIFY-FIRST items, then implement the §LOCKED spine + witness + PR.
#        Whitebox §-log is the witness; save every run to a log and READ it before concluding.
#        Edit shipping code ONLY in /home/red1/bim-ootb/. Honour until ✅ DONE.

## ▶ INTENT (user, verbatim sense)
"When we leave a building page to go to the main landing HTML, or to iDempiere, or even close the
tab — but then return to the building — can we still recall back the history? Discuss that, and see
what user experience we can have."

Related, already-agreed deferral (same lane): **camera-stops with no selection are NOT recorded**
(by design — §6b IGNORE bucket). If "record where I parked the camera" comes up, decide it here too.

## ▶ LOCKED (decided with user 2026-06-08 — BUILD TO THIS, the discuss phase is closed)
1. **Silent rehydrate (B) + per-building key (C) = the spine.** On building-open, the timeline line just
   appears already populated from the persisted signed log, keyed by `A.activeBuilding`. NO resume toast
   (option A dropped); fold any "N steps · last: <label>" hint INTO the line, not a dialog.
2. **The signed kernel log ALWAYS records.** The depth toggle's `off`/hide ONLY hides the bar (the view);
   it NEVER stops `kernel_ops` from committing+sealing. "Hide" ≠ "stop the truth." (Verified: `kernel_ops.js`
   has zero `depth`/`HistoryBar` reference — the gate lives only in `common/history_bar.js:80` `push()`.)
3. **No auto-prune window.** Drop the "keep 2 SESSION_STARTs" concern for this scope — the log accumulates
   until the user clears cache. Clearing the cache is the ONLY purge. (500 steps ≈ ~0.5 MB RAM, ~0.3 MB in
   the DB — negligible on mobile; the only real mobile cost is the EXISTING whole-DB `_persistToIdb` blob
   write, which #189 does NOT add to — the new view-stream persist is text, a few hundred KB.)
4. **Clear = two distinct controls.** "Clear view trail" = cosmetic (extend `clear()` at `history_bar.js:174`
   to drop the persisted view stream for this building). "Reset signed log" = a NEW GENESIS (you don't delete
   a hash-chained append-only log, you re-genesis it) — separate, confirm-gated. Surface both; don't conflate.
5. **Thumbnail film-strip is IN SCOPE (promoted from §FUTURE), bounded:** snapshot canvas → ~96×64 crop →
   memory-only LRU (~20), shown in the BLOOMED chip on DESKTOP ONLY; mobile stays text. **EPHEMERAL by design
   — NEVER persisted, NEVER enters the kernel, no mobile path.** So it touches none of the persistence/mobile
   surface above. ONE verify item: capture timing under the S286 idle-render gate — `preserveDrawingBuffer:false`
   + on-demand render means `toDataURL()` can be blank; grab the snapshot right after a render (or in the
   render loop), confirm a non-blank dataURL via `§HIST_THUMB w=.. h=.. bytes=..` before wiring the chip.

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

## ▶ UX — IN SCOPE (decided; build) vs DEFERRED (don't build, don't drop)
Building identity = `A.activeBuilding` (e.g. "Ifc2x3_Duplex_Federated") — key the history by it.
IN SCOPE:
- **B. Silent rehydrate** — the scrub bar just opens already populated; user scrubs back at will. No prompt.
- **C. Per-building history** — switching buildings shows THAT building's trail; the bar is keyed by building.
- **Clear controls** — "Clear view trail" (cosmetic) + "Reset signed log" (new genesis, confirm-gated). See §LOCKED-4.
- **Thumbnail film-strip** — desktop bloomed-chip only, ephemeral memory LRU. See §LOCKED-5.
DEFERRED (later PRs — not in #189, not dropped):
- **A. Resume toast** — dropped in favour of B; any "N steps · last:<label>" hint folds into the line.
- **D. Landing chip → reopen+restore** — cross-app deep-link; after the viewer-local recall lands.
- **E. Glassbowl cross-visit scrubber** — multi-visit dot-line + bloom (`build/erp/glassbowl.html #scrub`).
- **Full view-nav trail persistence** — Find breadcrumbs surviving visits; v1 is kernel-derived only.
- **ERP wiring** — shared module gets the `persistKey`/`building` hooks; wiring iDempiere onto it is the hand-off.
- **Retention/prune window + privacy opt-out** — none for now (§LOCKED-3: accumulate until clear-cache).

## ▶ DECISIONS — ALL MADE (see §LOCKED; recorded here for trace)
1. Auto-restore silently (B). ✅
2. Kernel-derived only (picks+milestones); full view-nav trail deferred. ✅
3. Per-building scope (C), key = `A.activeBuilding`; city / multi-building view deferred. ✅
4. Landing/ERP deep-link restore (D) deferred to a follow-up. ✅
5. No retention window; clear-cache is the only purge + the two clear controls (§LOCKED-3/4). ✅
6. `off`/hide hides the bar only; signed log always records (§LOCKED-2). ✅
7. Thumbnail film-strip IN, bounded + ephemeral (§LOCKED-5). ✅

## ▶ WHERE TO BUILD (keep the shared-module shape)
Persistence belongs IN `common/history_bar.js` so the viewer AND ERP both inherit it — extend
`HistoryBar.configure({ persistKey, building })`: on `open`/configure, LOAD this source+building's
stored stream; on `push`, SAVE (debounced) to localStorage/IDB; keep the signed kernel as the source
of truth and the view cache as the rebuildable convenience layer. Viewer adapter
(`viewer/universal_history.js`) passes the building key; restore stays owner-local. Do NOT touch
`navigate_find.js` (separate refactor lane). ERP wires the same `persistKey` against its own data.

## ▶ WITNESS (whitebox §-log first, leak-safe headless)
- Drive picks + a grid move → close the page → re-open the SAME building → the timeline REHYDRATES
  (same steps, same labels); `verifyChain ok=true` on the persisted kernel (`§HIST_CHAIN_OK`).
- Switch to a DIFFERENT building → its own (empty or prior) trail; switch back → first building's trail.
- Toggle depth `off`, drive a pick, toggle back on → the pick is STILL in the signed log (hide ≠ stop):
  `§HIST_DROP reason=off` on the view BUT `§KERNEL_OP committed` for the same action.
- Clear view trail → bar empties, signed chain intact. Reset signed log → new genesis, `verifyChain ok=true`.
- Thumbnail (desktop): a recorded step yields a non-blank crop (`§HIST_THUMB w=96 h=64 bytes>0`); the
  bloomed chip shows it; LRU cap holds (~20); MOBILE shows text, no thumbnail path taken.
- Cross-tab still syncs (`BroadcastChannel`); the landing union still renders; depth choice still persists.
- No regression: run `tests/run_regression.sh` (the 6 viewer probes) — all green; no PAGEERROR.

## ▶ VERIFY-FIRST (the two grounded unknowns — confirm BEFORE writing feature code)
1. **Load-path:** does building re-open READ BACK the IDB-cached DB carrying `kernel_ops`, or refetch a
   FRESH OCI copy and overwrite the cache (→ kernel gone)? If fresh wins, persist the view stream + a
   per-building kernel snapshot in a SEPARATE store — do NOT bloat the geo DB. (`§GEO_CACHE_CHECK hit`
   exists; confirm the cached blob is the one carrying the session's ops and that re-open reads it.)
2. **Thumbnail capture timing** under the S286 idle-render gate (§LOCKED-5) — non-blank dataURL or bust.

## ▶ DELIVERABLE
Discuss phase is CLOSED (see §LOCKED + §DECISIONS-ALL-MADE). Confirm the two §VERIFY-FIRST items, THEN
implement in the shared module + witness + PR. Frame the demo around the novel bit: a **serverless,
SIGNED history that survives tab-close and rehydrates on return** — across landing ↔ viewer ↔ ERP, no
backend; the append-only chain you can re-genesis but never silently edit.
