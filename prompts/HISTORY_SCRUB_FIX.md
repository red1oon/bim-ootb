# ⚠ DO NOT REMOVE — History SCRUB fix: picks belong on the timeline + Glassbowl bloom + bottom placement
# Scope: the universal history bar (universal_history.js) records grid-moves/places but DROPS the
#        thing the user actually does in a viewing session — ELEMENT_PICK selections — so the bar shows
#        nothing you did. Fix curation (pick = first-class selection), restore picks read-only, add the
#        Glassbowl #scrub double-tap-to-chips bloom, re-seat the bar as ONE row directly UNDER the status
#        bar, and FULLY retire the legacy grid undo. Edit shipping code ONLY in /home/red1/bim-ootb/viewer/.
#        Whitebox §-log is the PRIMARY witness; SAVE every run to a log and READ it before any conclusion.
#        Witness headless (leak-safe, below). Honour until ✅ DONE.

## ☠ HARD RULES (cost real incidents)
- Edit shipping code ONLY in `/home/red1/bim-ootb/viewer/`. Whitebox `§`-tagged console.log is PRIMARY;
  Playwright is wiring-only. SAVE every probe run to a log and READ it before concluding.
- Shared `/home/red1/bim-ootb` tree is DIRTY + other sessions are live in it. Do NOT git switch/stash/
  reset/rebase/pull it. Deploy ONLY via an ISOLATED worktree off origin/main → PR → CI → squash-merge.
- Headless WebGL probes LEAK CPU: put server+curl-retry+probe in a `run_*.sh`; wrap `timeout
  --signal=KILL 150 node probe.js` then `pkill -9 -f chrome-headless-shell`; probe `try{…}finally{await
  b.close()}`, ≤1 browser, `newContext({serviceWorkers:'block'})`; verify `ps -eo comm|grep -i chrome` clean.
- `kernel_ops.js` carries a SIGNED hash chain (W-CHAIN). This timeline is READ-ONLY over it — NEVER mutate
  kernel_ops rows, never break the chain. An ELEMENT_PICK is read-only by nature: it mutates NOTHING.
- Cut ceremony; decide and let the user judge by what appears. STOP yourself only when about to INVENT
  (no source) OR when a genuine architecture fork needs a user decision you cannot extract.

## ☠ LINE-REF FRESHNESS (navigate_find.js was rewritten by the v41 depth-model PRs #163/165/166)
Line numbers for `navigate_find.js` below are PRE-v41 and HAVE DRIFTED. **Anchor by FUNCTION NAME, not line.**
Current origin/main (2026-06-06, post-merge): `_replayViewObj` ~313 · axis `_pushView` ~546 ·
`_buildShapeMeshes(set,color,solidOpacity,colorOpacity,clipPlanes)` ~940 · `_drillSelect` ~1684 ·
item/group `_pushView` ~1696. `picking.js` (~458 `§BBOX_DEBUG`) + `universal_history.js` (~42 `SIGNIFICANCE`,
~54 drop-log) are UNCHANGED. Always `git grep -n 'function _name' origin/main -- <file>` to re-find before editing.

## ▶ THE BUG (witnessed in user's log this session)
User tapped a door in 3D. The log:
```
§KERNEL_OP committed id=1 type=ELEMENT_PICK params={"cls":"IfcDoor","name":"merk H","disc":"ARC","storey":"02 tweede verdieping"}
§HIST_DROP source=op type=ELEMENT_PICK reason=not-significant label="ELEMENT_PICK"
```
A deliberate selection was DROPPED, and no `§HIST_PUSH` fired the whole session → the bar records nothing
the user did. Root cause: the significance gate (`universal_history.js:42-45`, `:34`) buckets
`ELEMENT_PICK` with audit/bookkeeping (`SESSION_START`/`GRID_DETECT`/`VIEW_FILTER`). Only `GRID_MOVE` and
`ELEMENT_PLACE` qualify.

### Why that's wrong (the categorisation error)
The timeline's whole purpose (UNIVERSAL_HISTORY.md / FIND_LENS_DEPTH_MODEL.md): *"no way to see what was
chosen some steps before"* → retrace the **selection/viewing** path.
- A direct 3D pick **IS a selection moment** — semantically identical to a Find-lens *item-select*
  (`navigate_find.js` item `_pushView`, `kind:'item'`, ~L1696), which IS recorded. So selecting a door via the Find tree gets
  a step, but selecting the SAME door by tapping it in 3D gets dropped. That asymmetry is the defect.
- A pick **mutates nothing** → it is VIEW-class, not a model op. It must NOT go through `undoOp`/`redoOp`
  flag-flipping (`_applyOp`, `:195`); restore = re-select/re-highlight + frame, read-only.
- Its label is also broken: `_opLabel` (`:116`) has no ELEMENT_PICK case → falls through to `return
  opType` → bar reads "ELEMENT_PICK" instead of "merk H · door".

## ▶ STUDY FIRST — how the OLD undo was *supposed* to work (and why it didn't)
1. **Legacy grid bar** `viewer/grid_overlay.js:1554-1641` (`#undo-redo-btns`, `doUndo`/`doRedo`). Design
   intent: walk the kernel_ops log, **skip audit ops** (loop ≤10, `§UNDO skip audit`), undo the first
   `UNDOABLE_OPS` hit (`GRID_MOVE` only, `:1602`) by replaying `GridDrag.applyReplayedMove`. Why it under-
   delivered: (a) GRID-ONLY — one op type; (b) no view/nav awareness — a pure viewing session produced an
   empty/blind bar; (c) no step list, no labels — just ↶↷ with nothing to *see*. `showUndoRedo` is already
   no-op'd when UniversalHistory exists (`:1558-1561`) — this fix RETIRES the code path for good.
2. **The merged bar** `viewer/universal_history.js` (full read). The §GATE (`:28-57`) is the ONE curation
   point — tune there, not at call sites. Restore split: ops via `_applyOp` (flag-flip), views via
   `_viewRestore` → `navigate_find` `_replayViewObj` (`:311`). Dots render at `:296-326` (round=view,
   square=op, label only in `title` tooltip — invisible on touch).
3. **Pick commit site** `viewer/picking.js:599` — `KernelOps.commitOp(A.db,'ELEMENT_PICK',{cls,name,disc,
   storey},[g])`. The `g` (guid) is the element to re-select on restore.
4. **Glassbowl #scrub seed** `bim-compiler/build/erp/glassbowl.html:128-138` (CSS) + `:782-790`
   (`renderScrub`, double-tap→`vlBloom` toggle). Bottom-center dot-line; `overflow-x:auto`; double-tap the
   BAR (not a dot) blooms every dot into a labelled chip; gold = current. Mirror this; don't reinvent.

## ▶ WHAT TO BUILD
### 1. Curation — a pick is a first-class selection (the core fix)
- Move `ELEMENT_PICK` OUT of the drop bucket. It QUALIFIES. Keep real bookkeeping dropped
  (`SESSION_START`/`GRID_DETECT`/`VIEW_FILTER`) and keep coalescing distinct→separate, same→folded.
- Record a pick as a **view-class** entry (or an op entry carrying a view-style restore — your call, but it
  must restore read-only, never flag-flip). Store the guid + cls/name/disc/storey from params.
- **Label by element**, not op type: `"merk H · door"` (name + humanised class), tooltip/chip can carry
  disc/storey. Add the ELEMENT_PICK case wherever labels are built (`_opLabel` or a view-label path).
- **Restore = re-focus the element as a SHAPE MESH, NOT a bbox.** ☠ HARD CONSTRAINT (user): a restored pick
  must render the element's actual **shape mesh** (lit, cyan shine-through), NEVER the legacy yellow **bbox
  box** picking.js draws today (`picking.js:431-481`, `§BBOX_DEBUG`, dims from `element_transforms`). Cubes/
  boxes = non-renderable proxy (memory `feedback_no_cubes_render_gate`).
- ☠ ARCHITECTURE (user-corrected — do NOT couple touch to Find): a **tap** and a **Find drill** are two
  independent ROUTES to the same outcome ("element X is focused"). Find does not own touch. So do NOT
  "replay the pick through Find." Instead extract the shape-mesh focus into a NEUTRAL shared primitive —
  e.g. `A.focusElement(guids, {item:true})` — that lights elements as shape meshes (item cyan shine-through,
  rest 0.1 ghost; the depth model) and frames them. BOTH the tap handler (`picking.js`) AND Find's
  `_drillSelect` call it; history-restore calls it directly. The good renderer currently lives inside
  navigate_find (`_buildShapeMeshes`) — lift it (or expose it) as this shared primitive; don't make callers
  pretend to be Find.
- Bonus this earns: the LIVE tap highlight also upgrades from the bbox box to the shape mesh (same source) —
  not just on restore. (Keep `§PICK`/info-panel behaviour; replace only the visual highlight.)
- **The §PERF work in navigate_find is now COMMITTED + LIVE** (origin/main, `navigate_find ?v=28`, v41 —
  PR#165/166, 2026-06-06): deferred-rAF `_drillSelect` build, `_getInstanceRows` cache `§INSTROWS_CACHED`,
  `_buildShapeMeshes(set,color,solidOpacity)`. ALSO live now: ghost MAX-blend shell @0.12, whole-row focus
  band (`.row-focus`), Find drag fix (`measure.js`), x-ray-restore-on-room-lens-exit. So start this work
  from FRESH `origin/main` (it carries all of the above) — reuse `_buildShapeMeshes` inside the shared
  primitive; keep it; re-witness. (No longer "uncommitted/at-risk" — it's shipped.)
- On the TIMELINE, a tapped element and a Find-drilled element are the SAME step kind ("selected element X")
  — distinguish steps by WHAT was selected (single element vs group/scope), never by HOW (tap vs Find).

### 2. Glassbowl bloom (currently missing — labels are hover-only → invisible on touch)
- Add double-tap-the-BAR → bloom: dots expand into labelled chips (mirror glassbowl `:783-790` +
  `.bloom` CSS `:136-138`). Double-tap again collapses. Tapping a CHIP/dot = `jumpTo` (read-only restore).
- Current dot/chip = gold (`#ffd479`, glow). `overflow-x:auto` + auto-scroll so the gold one stays in view.
- **Chip icons (polish, user wants it) — by WHAT, not HOW:**
  - SINGLE element step → the element's **discipline icon** from the existing set in `viewer/panels.js`
    (`discARC` house, `discACMV` wavy, `discMEP`/`pipe` elbow, `discELEC` bolt, `discSTR`, `discPLMB`).
    Map by the element's `disc` (already in pick params + meta). Fallback = a generic box outline.
  - GROUP / scope step (Storey N, all of a discipline, a room/material set) → ONE **scope icon** — the
    `search` magnifier (`panels.js:12`) fits (Find narrows scope). The magnifier NEVER appears on a single-
    element chip.
  - Reuse `A.icon(name)` (`panels.js:~60`) to render the SVGs at chip size; don't hand-roll new SVGs.

### 3. Placement — ONE row directly UNDER the status bar (bottom, horizontal)
- DECISION (user-agreed): **bottom, horizontal**, NOT a left rail. It is a timeline (reads left→right), it
  fuses with the centered status bar into one unit, and it is the most thumb-native spot on mobile.
- Re-seat `#universal-hist-btns` from `bottom:32px;left:16px` (`universal_history.js:269`) to sit centered
  **immediately below `#status-bar-wrap`** (`viewer.html:37-38`, currently `bottom:16px;left:50%`). Treat
  status + scrub as a two-row stack: status text on top, the ↶ ↷ + dot-line scrub row beneath it. Reuse the
  status-bar footprint per UNIVERSAL_HISTORY.md §DESIGN ("present AS the status bar — and JUST that"); do
  not add a third chrome element. (Documented FALLBACK only if bottom ever collides with `⋯`/pill: a left
  vertical rail — but ship bottom.)
- Mobile (`viewer.html:360,409` status @ `bottom:calc(64px+safe-area)` / `bottom:2px`): keep the scrub in
  the bottom thumb zone, clear of `#mobile-bar` (⋯, bottom-right) and `#mobile-pill`. Chips bloom UPWARD.
  `max-width` ~74vw + horizontal scroll (glassbowl values).

### 4. Maximise / fullscreen — the scrub line (and status) must SURVIVE it
- ☠ HARD CONSTRAINT (user): when the screen is **maximised**, the history scrub line must STAY visible so
  you can keep thumb-scrubbing. AND the status bar going away on maximise is itself a bug — **status should
  also remain** ("which shuldnt" go away). The scrub is the persistent thumb control; don't let chrome-hide
  swallow it.
- Two maximise paths to handle (study both, witness both):
  - **Native fullscreen** — `A.toggleFullscreen` (`tools.js:362`) / [] single-tap (`panels.js:1017-1021`,
    `§MINMAX single-tap`). The scrub + status live in normal DOM so they SHOULD persist — verify they do
    (no `:fullscreen{}` rule hides them) and fix if the OS/CSS drops them.
  - **Focus-latest double-tap** — `focusOnlyLatest` (`panels.js:950+`) hides panels+HUD via `.swipe-hidden`.
    EXEMPT the status-bar + scrub row from this hide (do NOT add them to `_focusOnlyHidden`). Confirm whether
    `#status` is currently caught here — if so, that is the "status goes away" the user means; un-hide it.

### 5. Retire the legacy grid undo for good
- Remove the dead `#undo-redo-btns` build/`doUndo`/`doRedo`/`UNDOABLE_OPS` path in `grid_overlay.js`
  (`:1554-1641`) — or reduce to a hard no-op with a `§`-note — so there is ONE undo path. Verify nothing
  else calls `showUndoRedo`/`doUndo`/`doRedo`. Universal Ctrl+Z/Shift+Z already route through
  universal_history (`:351-356`).

### 6. Recording-DEPTH toggle on the history icon (user-designed) — built on the EXISTING gate
The significance gate (`universal_history.js:42-57`, `SIGNIFICANCE` table) is already the ONE data-driven
decision point — so a depth toggle is just SWAPPING which profile that gate consults. NOT a refactor.
Make the history icon a **3-state recording-depth** cycle (tap to cycle):
- **Blue (normal / ALL)** — record everything: ELEMENT_PICK, axis/group/item, menu touches. "Replay exactly
  what I did." (= the current default profile + picks, from §1.)
- **Green (DOC events only)** — stricter profile: record only doc-level events, DROP taps + Find-nav. The
  advanced "clean trail." (user: "advanced users wanna skip trivial → only real items.")
- **Grey/dim (OFF)** — record nothing (the existing OFF-toggle `:238`, fold into the cycle).
Implement as TWO `SIGNIFICANCE` profiles (`PROFILE.all` / `PROFILE.doc`) + an active-profile pointer the
icon switches; `significant()` reads the active one. Persist the choice (localStorage, like `ENABLED_KEY`).
- **DOC profile whitelist (the viewer's "real items"):** `BUILDING_OPEN` (new, §7) · `GRID_MOVE` (grid line
  moved) · `ELEMENT_PLACE` · design SAVE/OPEN · 4D capture · clash-snag created. DROP: ELEMENT_PICK, axis/
  group/item, menu touches. (Tune the table by feel — that's the whole point of the centralised gate.)

### 6b. EVENT CLASSIFICATION — the CANONICAL list (BOTH sessions classify HERE — do not invent your own)
☠ READ THIS BEFORE adding any `History.push`. There are exactly TWO buckets. Do NOT add a third, do NOT
re-decide per feature, do NOT push anything not on these lists without adding it here first. This is the
single source of truth the depth toggle (§6) and the cross-tab bridge (§CONTRACT) both read.

**THE ONE DECISION RULE (use this for anything not explicitly listed):**
> Does it change the CONTEXT (what you're looking at / which page) OR change DATA? → **MAIN.**
> Is it navigation WITHIN the current context that changes nothing? → **ALL.**
> Is it a hover / scroll / expand / camera nudge / idle redraw? → **IGNORE (record nothing).**

**MAIN / DOC events (coarse; GREEN mode; these CROSS TABS):** context switches + data mutations + milestones.
- ANY app: **tab / page / mode change** (switching tab, panel takeover, 2D↔3D, opening another app/page). ← user: a tab change IS a main event.
- VIEWER: `BUILDING_OPEN`, IFC import, **axis / lens / view-mode switch** (the viewer's "tab change" analog),
  `GRID_MOVE` (grid line moved), `ELEMENT_PLACE`, design SAVE/OPEN, 4D capture, clash-snag created.
- ERP: tab/window change, doc/line moved, order/SO/PO completed, **signed rule edit**, posting committed,
  document status change, payment/allocation. (The user's "only happens in Red Pill/ERP" events.)

**ALL events (fine-grained; BLUE mode only; STAY LOCAL to the tab — never cross tabs):** breadcrumbs of what
you did *inside* one context, for replay.
- VIEWER: `ELEMENT_PICK` (tap an element), group select (a specific storey/disc/room/material), item drill,
  Find search/filter applied.
- ERP: a specific record opened, list row navigation, search/filter applied within a tab.

**IGNORE (record NOTHING — neither bucket):** hover, scroll, row expand/collapse, camera micro-nudges,
idle/awake re-renders, focus changes, transient toasts.

**☠ CROSS-TAB RULE (this is the "how does it manage across tabs" answer):**
- **MAIN events** → written to the SHARED log `bim.history.v1` + a `BroadcastChannel('bim_history')` ping →
  appear on EVERY tab's line (the app-wide trail). MAIN is the ONLY thing that crosses tabs.
- **ALL events** → stay in the tab's OWN local history; NOT broadcast (else tab B re-renders on tab A's every
  tap = flood). So the depth toggle doubles as the cross-tab filter: GREEN = the shared MAIN trail (identical
  on every tab); BLUE = this tab's local ALL detail merged with the shared MAIN trail.
- Net per tab = [this tab's fine detail] + [the app-wide MAIN trail from all tabs]. Restore stays owner-local
  (§CONTRACT §3): clicking a MAIN step from another app deep-links to that app's tab, never restores in place.
- **If unsure where something goes: apply THE ONE DECISION RULE above. Do NOT guess, do NOT add a new bucket,
  do NOT silently push un-listed events — add the event to this section first, then push it.**

### 7. Record "building opened" (the one NEW event to add now)
Building launch today = `A.streamBuilding(name)` (`city.js:622`); SESSION_START exists but no open event.
Add a `BUILDING_OPEN` significant event (commit a kernel op OR push a view-style entry) when a building
finishes loading — label = building name, scope icon. This is the minimum so a fresh session's timeline
shows "opened <Building>" even before any tap. Qualifies in BOTH profiles (all + doc).

### 8. Landing-page history line (sibling timeline — SEPARATE tab/context)
**WHY THIS MATTERS (positioning, honest):** the cross-tab tech itself is commodity (Figma/Docs sync tab
state). What is novel — *to our knowledge, scoped to BIM/ERP* (not a universal negative) — is an **app-wide,
serverless, SIGNED history/undo timeline shared LIVE across tabs**. BIM tools are single-session; ERP
"history" is a server-side audit log, not a client-side scrubber. The first is the COMBINATION: signed
kernel chain + no backend + one history spanning landing↔viewer↔ERP. Frame the demo around that, not the pipe.

☠ ARCHITECTURE FACT: the landing (`index.html`) opens each building/viewer in a NEW TAB via `window.open`
(`index.html:424,502,850,921`) — landing and viewer are different windows, CANNOT share one live
`UniversalHistory` object. Landing already tracks opens (`openTabs`/`renderTabs`, `index.html:~346+`).
- Give the LANDING its own doc-mode history line (same dot/bloom UX), recording: IFC imported · building
  opened · city launched. Inherently "doc mode" (no element taps exist on landing).
- To merge with the viewer's opens: both write doc-events to ONE shared `localStorage` log key (e.g.
  `bim.docHistory`); landing renders the union. This is the only cross-tab bridge — keep it append-only,
  read-only on the landing. Moderate addition; NOT a viewer rewrite. (Can ship after the viewer bar.)
- **Cross-tab tech — what runs WHERE (host constraint):**
  - SHIP (works on GitHub Pages, no special headers): `BroadcastChannel` (already in repo — `main.js:171`
    `bim_4d`, `ad_ui.js` `bim_erp`) for live "refresh" pings + the shared `localStorage` doc-log for
    persistence. This is the baseline landing↔viewer bridge.
  - PROWESS DEMO (LOCAL-ONLY): the "one signed WASM kernel shared live across all tabs" via the
    cross-origin-isolated / `SharedArrayBuffer` tier needs COOP+COEP response headers that **GitHub Pages
    cannot send** → it must run on **localhost** (or a host where headers are controllable). Same wall that
    blocked geo-range streaming (memory `project_mobile_meta_split`). Do NOT attempt the SAB tier on the GH
    Pages deploy; build it as a local demo. (`SharedWorker`/OPFS sit between — usable but out of scope here.)

### 9. Storage tiers + bloat control (the "Cache Info / clear history" answer)
THREE tiers, deliberately separate — this is what makes clearing safe and bloat bounded:
- **Kernel log** (`kernel_ops`) — PERSISTED, SIGNED, tiny. Records WHAT happened only: `op_type`,
  `parameters` (small JSON), guids, hash chain (`kernel_ops.js:10-21`; hash over
  `op_type|parameters|input|output`, `:123`). NO image/BLOB column. Already self-prunes to the last 2
  SESSION_START boundaries (`:278`). ☠ NEVER put thumbnails/images in `parameters` — it bloats the DB AND
  the signed hash of every op. The kernel stores *what you did*, never *what it looked like*.
- **History view cache** — PERSISTED, tiny text (dot-line steps: label, guids, kind). DERIVED from the
  kernel. Safe to clear; rebuildable from the kernel (except view-only lens-nav, which is ephemeral).
- **Thumbnails** (if built, §FUTURE) — NOT persisted. Memory-only, capped LRU (~20), regenerated on demand
  by replaying the view + snapshot. Self-maintaining → bloat is structurally bounded (the heavy tier is the
  one we never keep). "Fresh session only" is the floor; lazy + capped is tighter.
- **Settings ▸ Cache Info panel** (user-requested): list each browser store with its SIZE + a CLEAR button —
  e.g. kernel log · history view cache · thumbnails · imported-building DBs (IndexedDB) · SW caches. Precedent
  exists: `index.html` already has `clearAllCache()` (`:304`). Clearing the history view cache MUST NOT touch
  kernel_ops (prove `verifyChain` still passes after) — offer a separate guarded "clear kernel" if at all.
- POC proving all of the above (two separate stores, cross-tab sync, depth toggle, clear-vs-rebuild,
  size readout): `bim-ootb/poc/xtab_history_poc.html` (serverless, BroadcastChannel+localStorage tier).

## ▶ CROSS-APP CONTRACT — the COMMON place (iDempiere/ERP session: build to THIS section)
Goal: ONE history line, same look + same log, across viewer AND every ERP page. Viewer (`viewer/*`) and
ERP (`erp/*`) are SAME-ORIGIN (both under bim-ootb, opened as tabs from `index.html`) → `localStorage` +
`BroadcastChannel` are shared across them with zero server. Each app already has its own signed `kernel_ops`
+ `commitOp` (`viewer/kernel_ops.js`, `erp/kernel_ops.js`) — they stay separate; only the HISTORY VIEW is shared.

**1. Common collection point (the "common place"):** one append-only `localStorage` key — `bim.history.v1` —
an array of event objects (capped/pruned, like kernel's 2-session prune). EVERY app appends here through the
ONE significance gate. This is what makes the log come from a common place.

**2. Common live-sync:** `BroadcastChannel('bim_history')`, message `'sync'` → every tab re-reads
`bim.history.v1` and re-renders. (ERP keeps `bim_erp` for its own messaging; `bim_history` is the shared bar's
channel.) Plus the `storage` event as a cross-tab backup. (POC proves this exact pattern.)

**3. Event contract (the shape both apps write):**
`{ seq, ts, source:'viewer'|'erp'|'landing', kind:'op'|'view', type, label, icon, restore }`
- `type` passes the shared significance gate (DOC profile = the "real items"). ERP's significant types are the
  doc-level ones the user means: doc/line moved, order completed, **signed rule edit**, posting (NOT every menu
  touch). Viewer's: BUILDING_OPEN, ELEMENT_PICK, GRID_MOVE, … (this prompt's §1/§6).
- `restore` is an OWNER-LOCAL payload: each app interprets its own events. Clicking a same-app step restores
  in place (read-only); clicking a FOREIGN-source step deep-links / focuses that app's tab (you can't restore
  an ERP doc inside the viewer). Keep foreign steps read-only labels for now.

**4. Common UI component:** ONE shared bar module both pages include (generalise `viewer/universal_history.js`
or factor a `common/history_bar.js`) so it looks identical everywhere — bottom-center dot-line + double-tap
bloom + the 3-state depth toggle (§6) + OFF. It renders from `bim.history.v1`; it does NOT know about any
specific kernel. Each app feeds it by wrapping its own `commitOp` to also call `History.push({source,…})`
through the gate (the viewer wrapper at `universal_history.js:330-348` is the template; ERP mirrors it).

**4b. The shared API (code to THIS — the module owns ~95%; apps inject only 2 things):**
```js
History.push({ source:'erp', kind:'op', type:'RULE_EDIT', label:'Signed rule: credit limit',
               icon:'doc', restore:{ docId:4711 } });   // log one event (runs through the shared gate)
History.registerRestore('erp', function(ev){ openDoc(ev.restore.docId); }); // how to restore THIS app's events
History.setDepth('all'|'doc'|'off');  History.open();  History.undo();  History.redo();  History.jumpTo(i);
```
The module OWNS (identical everywhere, no per-app code): dot-line UI + bloom, depth toggle + OFF, persistence
to `bim.history.v1`, `BroadcastChannel('bim_history')` sync, significance gate, coalesce, prune/cap, undo/redo/
jump. Each app SUPPLIES only: (a) `push()` calls wired onto its own `commitOp`, (b) one `registerRestore(source,
fn)` (restore can't be abstract — only each app rebuilds its own state), (c) its significant `type`s in the DOC
profile table. `registerViewRestore` in `universal_history.js:134` is the existing seed for (b) — generalise it
to `registerRestore(source, fn)`. This is the "just call the class, share all behaviour" model the user asked for.

**5. Layout contract for ERP pages (what to tell the iDempiere session now):** leave the **bottom ~40px
center strip CLEAR** on every ERP page (no fixed footer/toolbar overlapping bottom-center) so the shared line
docks there, same slot as the viewer's status bar. Don't build a second/own history widget — include the
common module and write to `bim.history.v1`.

**6. Host constraint:** the shared-log + BroadcastChannel tier runs anywhere incl. GitHub Pages. The
"one live signed WASM kernel shared across tabs" (SharedArrayBuffer) tier is LOCAL-ONLY (§8).

## ▶ FUTURE / EXPLORE (note only — do NOT build this pass)
- **Movie-thumbnail chips (EXPLORE, user-requested).** Feasible with existing primitives: snapshot via
  `A.canvas.toDataURL()` (`tools.js:351`; WebGL needs the frame to have just rendered — the idle gate
  already renders on each nav/pick, so capture in that wake), then "cut where the event is" by projecting
  the element's bbox corners to screen (`point.project(A.camera)`, proven `city.js:1015`/`measure.js:1580`),
  cropping that 2D rect to a small (~96×64) thumbnail. Store small (few KB) per RECORDED step (not per
  frame). DESKTOP: show the thumbnail in the bloomed chip (big screen = real visual cue). MOBILE: stay
  dots+labels (no room). Cost = one snapshot+crop per significant event — cheap at that cadence. Explore +
  report cost/quality before committing.
  - ☠ EPHEMERAL by design (user): thumbnails are NOT persisted and NEVER enter the kernel. Memory-only,
    capped LRU (~20, evict oldest), regenerated on demand by replaying the view + snapshot. "Fresh session
    only" is the floor. This keeps the heavy tier off disk → bloat stays bounded (see §9).
- **ERP / Red Pill doc-line moves** are the canonical "real items" (doc moved, line edited, signed rule
  edit). The Viewer's nearest equivalents are the DOC-profile whitelist in §6. Revisit when the ERP + viewer
  histories are unified.

## WITNESS TARGETS (whitebox §-log first; Playwright = wiring only)
- Tap an element in 3D → `§HIST_PUSH ... kind=view/op label="<name> · <class>"` (NOT §HIST_DROP). Pick a
  second distinct element → second step. Re-tap same element fast → coalesced (one step).
- `§HIST_DROP` STILL fires for SESSION_START/GRID_DETECT/VIEW_FILTER (prove bookkeeping stays out).
- `jumpTo` a pick step → the element re-highlights + frames (probe scene highlight + camera bbox). Read-only:
  `verifyChain` PASSES after (`§HIST_CHAIN_OK`).
- Mixed drive: grid move + Find group/item + 3D pick → merged stream lists ALL in order (`§HIST_LIST`).
- Double-tap the bar → blooms to labelled chips; tap chip restores. Bar sits centered directly under the
  status bar (probe getBoundingClientRect: scrub.top ≈ status.bottom, both horizontally centered).
- Legacy `#undo-redo-btns` GONE (querySelector null). Save probe output to a log; READ it; chrome clean after.
- **Restore renders SHAPE MESH, not bbox** — after `jumpTo` a pick step, probe `scene.traverse` for
  `userData._shapeOverlay` material on the picked guid (cyan, shine-through). Assert NO `§BBOX_DEBUG`-style
  box highlight is the restore mechanism. (FIND_LENS_DEPTH_MODEL.md opacity targets: rest 0.1 · group 0.5 ·
  item cyan.)
- **Maximise persistence** — drive native fullscreen AND `focusOnlyLatest`; probe `getBoundingClientRect` +
  computed `display`: scrub row AND `#status` both still visible/on-screen in BOTH maximise modes.
- **Depth toggle** — cycle the icon Blue→Green→Off. In GREEN, a tap is dropped (`§HIST_DROP ... profile=doc`)
  while a `BUILDING_OPEN`/`GRID_MOVE` is kept; in BLUE the same tap is kept. Choice persists across reload.
- **Building open** — load a building → `§HIST_PUSH ... BUILDING_OPEN label="<Building>"` appears with NO
  prior taps (fresh-session timeline is non-empty).

## ▶ WHITEBOX MUST PROVE TWO THINGS (user, explicit): IT WORKS + IT DOESN'T IMPACT OTHERS
The §-log debug must demonstrate BOTH, in one readable log — not just the happy path.
- **WORKS:** the §HIST_PUSH/§HIST_LIST/§HIST_CHAIN_OK + shape-mesh-restore + maximise-persistence lines above.
- **NO REGRESSION (prove each still fires unchanged):**
  - Picking still works end-to-end — `§PICK`, `§PICK_BBOX`, info-panel populates; tap-to-deselect still
    clears. (The bbox highlight on a LIVE pick is untouched; only the timeline RESTORE uses shape mesh.)
  - Find lens unaffected — `§GROUP_EXPAND_VIA_LABEL`, `§ROOM_SELECT`, `§XRAY_DIM`, `§INSTROWS_CACHED`
    (count stays 1) all still fire; the uncommitted §PERF deferred-build path is intact.
  - Kernel chain intact — `§KRN_CHAIN sealed`, `verifyChain ok=true` before AND after a timeline jump.
  - Grid drag still commits + replays (`§KERNEL_OP type=GRID_MOVE`) even with the legacy bar removed.
  - Idle/render gate untouched — `§IDLE_GATE`/`§RENDER_LOOP` still park-on-idle (no new always-on rAF from
    the bar). The scrub re-render must be event-driven, not per-frame.
  - `node deploy/dev/tests/audit_specs.js` (or the bim-ootb equivalent) exits 0 after any Playwright change.

## DEPLOY — implement + witness + open PR, then PAUSE for review (do NOT auto-merge)
Touches `universal_history.js` + `grid_overlay.js` + `picking.js` + `viewer.html` (+ maybe navigate_find).
Bump `viewer/sw.js` CACHE_VERSION (read CURRENT off fresh origin/main first — it moves; take HIGHER on
conflict, sw.js is the merge magnet) + any `?v=` you touch in `viewer/main.js`. `git fetch origin && git
worktree add -b feat/history-scrub-fix /tmp/wt-hsf origin/main`; cp ONLY changed viewer paths in; `node
--check` each; commit; push; `gh pr create --base main`; wait `gh pr checks` green (e2e FLAKY — `gh run
rerun <id> --failed` for the golden-path streaming flake). **Then STOP and report the PR for human review —
do NOT `gh pr merge`.** Report: study findings (why old undo under-delivered), the PR number, §-witness lines.
```
