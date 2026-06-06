# ⚠ DO NOT REMOVE — iDempiere chrome: ONE pill registry + cross-tab history scrubber + Install/Migrate lifecycle
# STATUS: TRIAGE / SPEC ONLY (captured 2026-06-06, user directive). No implementation in this pass — this doc
#   ORGANISES three buried requirements into one systematic plan so a fresh session can execute §A→§B→§C in order.
# SCOPE: the iDempiere renderer chrome — `bim-ootb/erp/idempiere.html` (+ erp_pills.js/pill_builder.js/pills.json,
#   the registry; universal_history.js, the history engine). Edit shipping code ONLY in `/home/red1/bim-ootb/`.
# DOCTRINE: Spec-first · NON-INVENT (every pill/menu/record from a real source) · whitebox §-log is the PRIMARY
#   witness (Playwright = loader/wiring only; a forced-viewport pass ≠ a real-device pass — see [[feedback_whitebox_not_playwright]]).
# DEPLOY: isolated worktree off origin/main → PR → CI → squash-merge; bump `erp/sw.js` CACHE_VERSION (+ any `?v=`).
#   NEVER git switch/stash/reset the shared `/home/red1/bim-ootb` tree (dirty, multi-session).

## ▶ WHY (user, 2026-06-06, verbatim intent)
"That bottom/side bar should be ENTIRELY pill-like registry as done in BIM and erp.html. It has collapsible 3-dots
so it is not going to clutter. … you have to use a history feature at the bottom which works across tabs (see
prompts/HISTORY_SCRUB_FIX.md). Also do the Install/Migrate still live on after login into a client? It should
appear after login only BEFORE selecting a client; upon client it is context-aware. Triage this out first …
new sessions will go thru this systematically, so organise the specs well first."
A lot of the "optics that delight" live in this chrome — so it must be coherent, registry-driven, and honest.

## ▶ §0 — TRIAGE: current state (observed 2026-06-06, `idempiere.html` + registry files)
1. **The iDempiere bottom/side bar is HAND-ROLLED, NOT the registry.** `idempiere.html` builds `#idmp-pillrail`
   inline (~L1119) from a hardcoded 6-item array `[Posted, Graph, Kanban, Rule, Install, Migrate]`; it includes
   NONE of `erp_pills.js` / `pill_builder.js` / `pills.json` (grep = 0 hits). It has NO collapsible ⋯ overflow.
   - Layout: desktop = fixed right-edge vertical strip; `@media(max-width:760px)` = fixed bottom row (this bottom
     dock is the one bit the user liked — keep the behaviour, change the SOURCE to the registry).
2. **erp.html DOES use the registry** = `pills.json` (16-pill manifest, `order`/`icon`/`hold`/`nav` data) +
   `erp_pills.js` (binds `fn`/`isActive` BY ID — functions aren't JSON) + `pill_builder.js` (`PillBuilder`, the
   renderer). PillBuilder ALREADY provides the ⋯ collapse + per-user `{order, hidden}` config (`§SETTINGS_SAVE`,
   `§S282` skip-hidden, pill_builder.js ~L66/L83/L191) — i.e. the "collapsible 3-dots so it won't clutter" the
   user wants is ALREADY in the registry; idempiere just isn't using it.
3. **Install/Migrate are ALWAYS-ON.** The pill rail (incl. Install + Migrate) is appended to `<body>` unconditionally
   and persists AFTER a client is entered. There is also a Migrate-ShowMe CTA on the LOGIN card (`idempiere.html`
   ~L263). So today: Install/Migrate "live on" inside a client session — which the user says is wrong.
4. **No cross-tab history bar in the ERP.** `idempiere.html` has window TABS (`#idmp-wintabs`) but no timeline of
   what you navigated. The VIEWER has the pattern: `viewer/universal_history.js` (merged bar) + the Glassbowl
   `#scrub` double-tap-to-chips bloom (`build/erp/glassbowl.html`), being fixed in [[prompts/HISTORY_SCRUB_FIX.md]].

## ▶ §A — ONE PILL REGISTRY for the iDempiere bottom/side bar (retire the hand-roll)
GOAL: `idempiere.html`'s bar is rendered by the SAME registry as erp.html/BIM — manifest-driven, with the ⋯
collapse — so there are NO controls outside the pill and nothing hand-authored (the standing "no controls outside
the pill" principle, [[project_erp_remove_two_top_buttons]] / `§PILL-REGISTRY`).
- **Adopt** `pill_builder.js` (`PillBuilder`) + a manifest. Decide: reuse `pills.json` as-is, or a sibling
  `pills_idmp.json` for the iDempiere surface (its action set differs: Posted/Graph/Kanban/Rule today, plus the
  AD-window actions). NON-INVENT: every pill `id` binds a real fn in an `idmp_pills.js` (mirror `erp_pills.js`)
  and a real glyph from `icons.js`/`@bim` — nothing inlined, nothing hand-drawn.
- **Delete** the inline `#idmp-pillrail` builder once parity is proven (don't leave two systems — that was the
  whole point of `§PILL-REGISTRY`).
- **Keep the responsive dock** the user liked: registry pills render as a bottom row at `≤760px`, right-edge strip
  on desktop — drive it from PillBuilder's container styling, not a second CSS block.
- **The ⋯ collapse** must work on the iDempiere surface (overflow + per-user order/hidden persists, like erp.html).
- Witness: `§IDMP-PILLS source=registry pills=N handAuthored=0 overflow=⋯ hidden=k` + 390px screenshot (bottom row,
  ⋯ collapses extras) + desktop screenshot. Reuse [[project_erp_remove_two_top_buttons]]'s `poc_pill_registry.js` shape.
- Spec to extend, not duplicate: `bim-compiler/docs/PILL_MANIFEST_SPEC.md` (idempiereUI I1) — add an "iDempiere
  surface" section.

## ▶ §B — CROSS-TAB HISTORY SCRUBBER at the bottom (the Glassbowl `#scrub` pattern)
GOAL: a thin history bar pinned at the BOTTOM (under the status bar) that records the SEMANTIC navigation of a
session and works ACROSS the iDempiere window tabs — open a window, select a record, switch tab → each is one dot;
double-tap blooms the dots into labelled chips ("Sales Order 1023", "Product ODOO-16"); click a dot = restore that
view, READ-ONLY (re-open the window/tab + re-select the record; never mutate the kernel op-log).
- **Pattern source (mirror, don't reinvent):** Glassbowl `#scrub` (`build/erp/glassbowl.html` `renderScrub`,
  double-tap→bloom, gold=current) + the viewer's `universal_history.js` curation/restore split, as being
  fixed in [[prompts/HISTORY_SCRUB_FIX.md]] (pick = first-class view-class entry; restore re-selects read-only).
- **"Across tabs"** = across `#idmp-wintabs` window tabs within the iDempiere session (NOT browser tabs). A semantic
  moment = {window opened, record selected, tab switched}. Do NOT record hovers, scrolls, or filter keystrokes
  (else "back" is 20 taps deep — same curation lesson as the viewer §GATE).
- **Honesty / determinism:** read-only over any signed op-log (never flip undo/redo flags); no `Date.now`/`Math.random`
  in the record path (`performance.now()` only for meters). Every chip label from a real record field (NON-INVENT).
- **Layout coexistence with §A:** the bottom hosts BOTH the pill row (≤760px) AND this scrubber. Spec the stack
  order explicitly (e.g. scrubber as a 1-row strip directly under `#idmp-status`, pills below it, content padded so
  the last card isn't covered — extends the `§MOBILE-VIEW` `#idmp-content{padding-bottom}` already added).
- Witness: `§IDMP-HIST push=<kind>:<label>` per semantic moment · double-tap→chips · click→`§IDMP-HIST restore=… readOnly=Y`
  · 0 kernel mutations · works after switching window tabs. Whitebox §-log first.

## ▶ §C — Install/Migrate CONTEXT-AWARE LIFECYCLE (triage answer + target)
TRIAGE ANSWER (user's question "do they still live on after login into a client?"): **YES — today they persist as
always-on pills inside the client session. That is the bug.**
TARGET lifecycle:
- **Before a client/tenant is selected** (the entry/login + the client-switcher stage — the "add or pick a tenant"
  moment): Install + Migrate are PROMINENT. This is where they belong — they CREATE/ENTER tenants (Client 12 Odoo,
  13 iDempiere per [[prompts/MIGRATE_INSTALL_TENANT.md]]). The login-card Migrate CTA already lives here — keep it.
- **After a client is entered** (context established): Install/Migrate are NO LONGER generic always-on pills. They
  become **context-aware** — scoped to the current client (e.g. "migrate MORE into THIS tenant" / "install a module
  here"), or demoted out of the primary rail into a context menu. Decide the exact post-entry behaviour with the
  user — this is the one genuine fork (hide vs. transform vs. move-to-overflow). Until then, default = REMOVE from
  the in-client primary rail and surface only pre-client.
- **Ties into §3 (P3 client-switcher) of [[prompts/MIGRATE_INSTALL_TENANT.md]]:** the switcher IS the "before client
  selected" surface that lists 11/12/13 and is where Install/Migrate naturally live. Build §C alongside P3.
- Witness: `§IDMP-LIFECYCLE stage=pre-client install=Y migrate=Y` vs `stage=in-client install=context migrate=context`
  (the generic always-on pills are gone once a client is entered).

## ▶ §D — RED PILL: "just the pill" (our design) ⟷ classic iDempiere L&F  (added 2026-06-06, user-directed; BUILT)
GOAL (user, verbatim intent): "have all icons in iDempiere to be gone and appear, at the main pill, when pressing
the red pill … keeps the UI clean under user control. Three dots pill collapse. Red pill shortcut same as in BIM."
Clarified: "iDempiere users are familiar with their L&F so they can have it, but in our own design we offer them to
use just the pill." / "If they refuse, just ignore our pill." / "Follow common HMI practice … no need to overthink."
- **Model:** ONE master toggle (`redpill` pill, `redpill.png`, key `,` = same as BIM Doc Mode `panels.js`).
  - **OUR design = DEFAULT = "just the pill":** classic chrome (the `#idmp-toolbar` action icons) is HIDDEN; the
    pill IS the UI; record nav moves to the keyboard (arrow keys — see below). `body.idmp-clean`.
  - **Red pill / `,` → classic iDempiere L&F:** reveal the familiar `#idmp-toolbar`; OUR lens pills STEP ASIDE
    (only `#pill-redpill` stays to toggle back) — "if they refuse, just ignore our pill." Persisted (localStorage
    `idmp_pillmode`). The red pill is LIT (`.active`) in just-the-pill mode.
  - **⋯ collapse** (PillBuilder) is unchanged and orthogonal: it tidies the pill list; the red pill swaps paradigms.
- **Common-HMI keyboard (no overthink):** `,` toggles the red pill; ←/→ = prev/next record, Home/End = first/last
  (essential once the toolbar arrows are hidden in pill mode). Ignored while typing in a field or at the login overlay.
- **ICON CONSISTENCY (user, [[feedback_pill_icon_consistency]]):** OUR surface uses ONLY the clean Lucide line-icon
  idiom (`icons.js`, verbatim from `panels.js`); NO differing/unicode glyphs. Applied here: the §B scrubber dropped
  its `↶`/`↷` arrows → **dots-only** (click a dot = jump, which subsumes step undo/redo). `redpill.png` is the one
  allowed raster (the shared brand control). Classic iDempiere chrome may keep its own emoji L&F — it's THEIRS.
- Witness `tests/poc_idmp_redpill.js`: default clean (toolbar hidden, red pill lit, 4 lens pills) → red pill →
  classic (toolbar visible, lens pills 0) → `,` → clean; arrow keys move the record; scrubber arrowButtons=0; 0 errs.
- Reuses what we already built (pill registry + settings editor per-user order/hidden) — no new framework.

## ▶ SEQUENCING (each shippable alone; whitebox witness + PR each)
1. **§A pill registry unification** FIRST (foundational — everything else hangs off the registry + its ⋯/lifecycle
   hooks). Proves parity, deletes the hand-roll.
2. **§C lifecycle** SECOND (small once §A exists — gate Install/Migrate registration by session stage; pair with
   MIGRATE P3 switcher).
3. **§B history scrubber** THIRD (largest; reuses the Glassbowl/`universal_history` pattern; needs the bottom layout
   settled by §A).
GATE before coding §A: confirm with the user — reuse `pills.json` or a sibling `pills_idmp.json`? (action sets differ.)

## ▶ REFERENCES
- Registry: `bim-ootb/erp/{pills.json, erp_pills.js, pill_builder.js}` · spec `bim-compiler/docs/PILL_MANIFEST_SPEC.md`
  (idempiereUI I1) · the "no controls outside the pill" precedent [[project_erp_remove_two_top_buttons]] (`§PILL-REGISTRY`).
- History: [[prompts/HISTORY_SCRUB_FIX.md]] · `prompts/UNIVERSAL_HISTORY.md` · engine `viewer/universal_history.js` ·
  Glassbowl `#scrub` in `build/erp/glassbowl.html` (`renderScrub`) · the Find-lens scrubber note in
  [[prompts/FIND_LENS_DEPTH_MODEL.md]].
- Lifecycle: [[prompts/MIGRATE_INSTALL_TENANT.md]] (P1 emitter · P2 persist ✅ · P3 switcher) · [[project_migrate_erp_picker]].
- Mobile chrome already shipped (build on, don't redo): `§MOBILE-VIEW` record-list cards + bottom pill dock (PR #157,
  sw v586) · `§MOBILE-LANDING` post-login auto-opens the menu drawer + backdrop (PR #159, sw v587).

## ▶ RESUME — NEXT SESSION STARTS HERE (carry-on prompt)
This spec is TRIAGE-COMPLETE and the two gates are now DECIDED by the user (2026-06-06). Just EXECUTE — do NOT
re-ask these; the user explicitly delegated the technicals ("I am weak in such technicals, what do you propose").
- **✅ GATE-1 (§A manifest) — DECIDED: a SIBLING `erp/pills_idmp.json`** (NOT shared with erp.html's `pills.json`).
  Same `PillBuilder` renderer, surface-specific manifest. Rationale: the two surfaces show different action sets;
  a shared manifest forces compromises and cross-surface breakage. Separate data, one engine, zero code dup.
- **✅ GATE-2 (§C in-client behaviour) — DECIDED: HIDE Install/Migrate from the in-client primary rail.** They
  appear ONLY pre-client (login card + the P3 client-switcher) — "set up / bring in a company" lives at the front
  door, not inside the house. The context-aware "import more into THIS client" (option b) is a LATER enhancement,
  explicitly deferred — do not build it now.
- **THEN implement in order §A → §C → §B** (sequencing rationale above). Each: spec the section's witness line
  first, whitebox `§`-log on localhost (NOT a forced-viewport Playwright pass — [[feedback_whitebox_not_playwright]]),
  isolated worktree off `origin/main` → PR → CI → squash-merge → bump `erp/sw.js` CACHE_VERSION.
- **START with §A**: add `erp_pills.js`+`pill_builder.js`+`pills_idmp.json` to `idempiere.html`, render the bar via
  `PillBuilder` (incl. ⋯ collapse), prove `§IDMP-PILLS source=registry pills=N handAuthored=0 overflow=⋯`, then
  DELETE the inline `#idmp-pillrail` builder.
3. Start with **§A** (foundational): add `erp_pills.js`+`pill_builder.js`+manifest to `idempiere.html`, render the
   bar via `PillBuilder`, prove `§IDMP-PILLS source=registry pills=N handAuthored=0 overflow=⋯`, then DELETE the
   inline `#idmp-pillrail` builder.

## ▶ APPENDIX — measured "bloat reduction" (2026-06-06, from ~/idempiere-dev-setup + seed dump; NON-INVENT)
Why this chrome work matters — the project's headline thesis, with real numbers (delivery/definition, NOT feature parity):
- **DB seed:** iDempiere `Adempiere_pg.dmp` = **45.2 MB** → this project `ad_seed.db` = **12.7 MB** (≈3.5× smaller),
  and the 12.7 MB IS the full self-describing Application Dictionary: **378 tables · 1,003 AD_Table · 26,144 AD_Column · 370 windows.**
- **Runtime surface:** iDempiere **1,427,147 Java LOC** / 4,465 files / 294 `.zul` / 60 plugins / JVM+Postgres+3.7 GB build
  → this project **16,068 JS LOC** / 39 files / 884 KB + a 1,079-line HTML, static + SQLite-WASM, offline (≈89× fewer LOC, zero server).
- **Honest caveat:** that 16K LOC RENDERS the dictionary + FOLDS the paths built so far (O2C, journal, signed rule-edit) —
  it is NOT a re-implementation of the full transactional server. Removable bloat = the generic AD-interpretation engine
  (re-expressible leanly because the AD is self-describing) + the entire server/JVM/DB/build stack. Irreducible = each
  transactional verb/process, which must be FOLDED deterministically (the migration-solvent thesis). See [[feedback_erp_perf_claims]].

## ▶ BUGFIX — PILL_REOPEN_FIX (2026-06-07, branch fix/pill-reopen)
**Issue (user, verbatim):** "the mobile version ... that pill when folded after clicking the three dots, failed to
open back on reclicking." The ⋯-collapsed pill never stayed folded / never re-opened on a re-tap.
**Root cause (whitebox-proven):** `pill_builder.js` outside-tap close guard used `e.target !== trigger`. A real tap
on the ⋯ trigger lands on its inner `<svg>`/`<circle>`, so the trigger's OWN tap was mis-classified as an
"outside" tap → `_close()` fired on `pointerdown`, then `_toggle()` re-opened it on `pointerup`. Net: the pill
flickered shut-then-open within ONE tap and never folded. (Instrument probe: `svgEqTrigger=false`;
`after pd2 disp=none` → `after pu2 disp=block`.) The persistent iDempiere dock dodged it only because the
non-persistent close handler is skipped (`opts.persistent`) — the defect lives in the SHARED close guard, so
erp.html's right-edge bar was the broken surface.
**Fix (1 line):** `e.target !== trigger` → `!trigger.contains(e.target)` (treat taps on the trigger's descendants
as trigger taps). Surgical; no behaviour change for legitimate outside taps.
**Witness (`erp/tests/poc_pill_reopen.js`, mobile 390×844 + touch, both PillBuilder surfaces):**
- BUGGY: `§PILL-REOPEN surface=erp.html collapse=N reopen=Y (... collapsedDisplay=block ...) trail=open=true->true->true->true` → `§PILL-REOPEN-RESULT FAIL`
- FIXED: `§PILL-REOPEN surface=erp.html collapse=Y reopen=Y (... trail=open=true->false->true)` and `surface=idempiere.html collapse=Y reopen=Y` → `§PILL-REOPEN-RESULT PASS erp.html=Y idempiere.html=Y pageErrors=0`
- Regression: existing `erp/tests/poc_idmp_pills.js` still `§A-RESULT PASS` (`§A-WITNESS-4 afterToggle1=none afterToggle2=block`).
