# ⚠ DO NOT REMOVE — SPEC ONLY (no implementation until this doc is reviewed)
# Mobile Card-Stack for HBA Panes — Design Spec

**Scope:** Mobile-only presentation of the HBA "Human-Asset" panes as a swipeable, scrollable
navigation card-stack. Desktop behaviour is **unchanged** (fixed overlay + drag-by-header).
**Read the log after every run.** This is a spec; no code lands until it is approved.

**Author's note on the non-invent rule:** this feature touches NO data/geometry/DB — it is a pure
DOM/interaction layer over panes that already render. So "extract, don't invent" is satisfied
trivially. The only judgment calls here are UX; §7 flags which I made confidently vs. which are
genuinely open for the user.

---

## 0. Ground truth (what exists today — verified in `/tmp/wt-iot-persist/viewer`)

- **6 pane modules**, all identical shape: `hba_dashboard.js` (`HBADashPane`), `hba_payslip.js`
  (`HBAPayslipPane`), `hba_leave.js` (`HBALeavePane`), `hba_tenancy.js` (`HBATenancyPane`),
  `hba_bom.js` (`HBABomPane`), `hba_iot.js` (`HBAIotPane`). Public API each: `mount(A)` /
  `toggle(A)` / `detect(A)` / `isActive()`.
- **Every pane's `mount()` ends with the SAME two lines** (verified line-for-line):
  ```js
  (document.body || document.documentElement).appendChild(pane);
  if (G.HbaDraggable) G.HbaDraggable.enable(pane, head);   // §P10b — drag by the header
  ```
  (dashboard 96-97, payslip 96-97, tenancy 94-95, bom 91-92, iot 317-318, leave 116-117).
- Each `pane` is `el('div', 'position:fixed;top:54px;right:12px;width:340-420px;max-height:82-86vh;
  overflow:auto;z-index:10050;...')` with id `hba-<name>-pane`, a `head` element (title + × close),
  content below. `× ` calls `toggle(A)` → `unmount()` → `_pane.parentNode.removeChild(_pane)`.
- `hba_iot.js` runs **live timers** (`_barTimer` setInterval, `_cctvTimer` rAF) that `unmount()` stops.
  → the host must NOT re-create/clone pane DOM (would orphan timers + event listeners). It must
  **re-parent the SAME live node**.
- **Orchestration:** `hba_lens.js` `openFamilyDrawer(A)` renders a 9-row drawer (`FAMILY` array);
  `activateLens(A, entry)` routes pane rows to `paneFor(entry).toggle(A)`; lens rows to
  `toggle(A, mode)`. Panes stack at the SAME `top:54px;right:12px` anchor → the problem.
- **Mobile detection ALREADY EXISTS:** `config.js:7` → `window._isMobile = ('ontouchstart' in window
  || navigator.maxTouchPoints > 0);` — read by pill_builder/scene/clash_matrix/streaming/etc. **Reuse
  it. Do not invent a parallel system.**
- **A proven gesture engine ALREADY EXISTS:** `swipe.js` → `window.SwipeStack` (LEFT/RIGHT=prev/next,
  UP=drill, DOWN=back; pointer-capture; `THRESHOLD_PX=80`, `SNAP_MS=200`, translate+fade+snap-back).
  **BUT** it renders cards from `{id, html}` **HTML strings via `innerHTML`** — it cannot host the
  panes' live DOM (event handlers + iot timers die). → **Reuse its gesture MATH & constants by
  reference; do NOT use it as the container.**
- `hba_draggable.js` `HbaDraggable.enable(pane, head)` is desktop-only in spirit; it is a no-op-safe
  DOM utility. It stays exactly as is; the host simply won't call it on mobile.
- Script load order (`viewer.html` 921-932): `hba_lens` → `hba_draggable` → panes. New file loads
  **between draggable (923) and the panes (927)**.

---

## 1. Interaction model

One full-screen host layer, `#hba-card-stack` (`position:fixed;inset:0;z-index:10060` — one above the
panes' `10050`), created lazily the first time a pane is presented on mobile. Two visual states.

### 1a. Peek-deck state (home)
- The stack's default view: opened panes shown as a **vertical scrollable deck of card-headers** —
  each card is a strip showing the pane's title (reused from its `head`) + a 1-line summary sliver,
  ~64px tall, stacked with a slight overlap/shadow so it reads as a physical deck.
- Container is `overflow-y:auto` → **scrolls when more cards than fit the screen** (requirement 2).
- The pane's full content is present but height-clamped/hidden in this state (see §2 CSS).
- **Tap a card → push it full-screen** (requirement 3).
- The family drawer (launcher) opens as a bottom-sheet in front of the deck (see §2d).

### 1b. Full-screen state
- The tapped card expands to fill the viewport; **its content (the pane's own DOM) fills the screen**
  — the host neutralises the pane's fixed 340-420px width via scoped CSS so it becomes 100% × 100%.
- A slim top bar shows the pane title, a **‹ back** affordance (minimise to deck), and the pane's own
  × (close/remove) stays where the pane drew it.

### 1c. Navigation semantics — push/pop (requirement 4)
Distinguish **minimise** (keep the pane open, return to deck) from **close** (remove the pane):

| Action | Meaning | Effect |
|---|---|---|
| Tap a deck card | push | focus = that card, go full-screen (`_nav.push(i)`) |
| Swipe **down** / tap **‹ back** | minimise (pop) | focus → previous `_nav` entry (usually the deck); **pane stays open** |
| Pane's **×** button | close (remove) | pane `unmount()`s (its own code), host drops it from `_cards`, pops nav → deck |
| Swipe **left / right** in full-screen | switch card | focus moves to adjacent open card **without returning to the deck** (carousel) |

This is the push/pop the user asked for: open several panes → they pile into the deck → tap one to go
full-screen → close (×) or back (swipe-down) → land on the deck → pick a *different* card "from where
they left off." Left/right lets you flip between full-screen cards directly (the user's "swipe to
switch between full-screen cards without going back to the stack first").

**Gesture thresholds (adopted from `swipe.js`, confident default):** horizontal/vertical delta >
`min(80px, cardWidth*0.3)`; snap-back at `200ms ease`; pointer-capture on `pointerdown`. Swipe-to-
**dismiss/remove** (a hard down-fling that deletes a card) is **deliberately excluded from phase 1** to
avoid accidental data loss — down = minimise only. Whether to add fling-to-remove, and its threshold,
is an open question (§7).

---

## 2. Where it hooks into the architecture

**New shared module `viewer/hba_mobile_stack.js` exposing `G.HbaPaneHost`.** It is the *single* place
the desktop/mobile split lives. Panes stay dumb; `hba_lens.js` is untouched.

### 2a. The one pane change (× 6 panes) — a 2-line → 1-line swap
Replace each pane's mount-tail:
```js
(document.body || document.documentElement).appendChild(pane);
if (G.HbaDraggable) G.HbaDraggable.enable(pane, head);
```
with:
```js
(G.HbaPaneHost ? G.HbaPaneHost.present
  : function (p, h) { (document.body || document.documentElement).appendChild(p); if (G.HbaDraggable) G.HbaDraggable.enable(p, h); }
)(pane, head, A);
```
The inline fallback preserves today's behaviour for node witnesses / if the module fails to load.
**No other pane internals change.** `unmount()` stays byte-identical — its `removeChild(_pane)` works
whether the parent is `document.body` (desktop) or a card slot (mobile).

### 2b. `HbaPaneHost.present(pane, head, A)` — the branch
```
present(pane, head, A):
  if (!window._isMobile):
      document.body.appendChild(pane)
      HbaDraggable.enable(pane, head)          // EXACT current desktop path
      return
  // mobile:
  ensureStackEl()                              // lazy-build #hba-card-stack + scoped <style>
  slot = el('div','', ) with class 'hba-card'  // wrapper the host owns
  slot.appendChild(pane)                        // re-parent the LIVE node (timers/handlers intact)
  _cards.push({ id: pane.id, pane, head, slot, title: head.textContent })
  observeRemoval(slot, pane)                    // MutationObserver → auto-drop on pane's own removeChild
  focus(_cards.length - 1)                       // newest pane opens full-screen (confident default, §7)
  render()
```

### 2c. Teardown with ZERO extra pane changes
The host attaches a `MutationObserver(childList)` to each `slot`. When the pane's own `unmount()` runs
`removeChild(_pane)`, the slot goes empty → the observer drops that entry from `_cards`, pops `_nav`,
and `render()`s the deck. So pane `unmount()` needs **no** host-awareness. (Alternative if an observer
is unwanted: expose `HbaPaneHost.release(paneEl)` and add one line to each `unmount()` — but the
observer keeps the per-pane diff to the single §2a line. Prefer the observer.)

### 2d. The launcher drawer on mobile (small, optional-in-phase-4)
`hba_lens.js openFamilyDrawer` is a *launcher* and can stay functionally as is (a pane row tap calls
`paneFor(entry).toggle(A)` → `mount()` → `HbaPaneHost.present` → card pushed full-screen). For polish,
the host exposes `HbaPaneHost.styleDrawer(drawerEl)` that `openFamilyDrawer` MAY call to reflow the
drawer as a bottom-sheet on mobile. This is the ONLY optional `hba_lens.js` touch and is deferred to
phase 4; if skipped, the existing right-anchored drawer still works as the launcher.

**Functions that change:** the 6 panes' single mount-tail line; new `hba_mobile_stack.js`; one
`<script>` tag in `viewer.html` (+ any other host html that loads the panes). **Functions that do NOT
change:** every pane's `mount` body / `unmount` / `toggle` / `detect`; all of `hba_lens.js` (drawer
polish optional); `hba_draggable.js`; `swipe.js`; `config.js`.

---

## 3. Desktop / mobile split

- Single source: **`window._isMobile`** (config.js:7). `HbaPaneHost.present` branches on it and nothing
  else. Desktop → identical to today (append to body + `HbaDraggable.enable`), so desktop is provably
  a no-op change.
- config.js's `_isMobile` (`ontouchstart || maxTouchPoints>0`) is the correct UI-layout variant. The
  renderer files use a stricter `maxTouchPoints>0 && screen.width<1024` — **not** reused here (a touch
  laptop should still get cards; acceptable). Optionally also gate on `window.innerWidth <= 900` if a
  large touchscreen should keep the desktop overlay — flagged as a minor open call (§7), default = plain
  `_isMobile`.
- Detection is read **once per `present()` call** (not cached), so a rotate/resize between opens is
  honoured without extra listeners.

---

## 4. State (plain JS in `hba_mobile_stack.js` — no framework)

```js
var _stackEl = null;         // #hba-card-stack host (lazy)
var _cards   = [];           // [{ id, pane, head, slot, title }] — ORDER = open order (the deck)
var _focus   = -1;           // index of full-screen card; -1 = peek-deck (home)
var _nav     = [-1];         // navigation history of _focus values → push/pop
```
- **open order** = `_cards` array order (deck top-to-bottom).
- **which is full-screen** = `_focus` (-1 = none / deck).
- **push/pop history** = `_nav` (last entry is current focus). `back()` = `_nav.pop()` then focus the
  new last. `close(i)` = splice `_cards[i]`, rebuild `_nav` to drop `i`, focus `-1`.
- No per-card scroll/gesture state persists between renders beyond `_startX/_startY/_dragging` (mirrors
  swipe.js). All derived; nothing stored that a re-render can't rebuild.

---

## 5. Rendering / CSS approach (concrete)

Host injects ONE scoped `<style>` once (in `ensureStackEl`). Panes are re-parented, never restyled
inline (keeps them uniform + reversible):
```css
#hba-card-stack { position:fixed; inset:0; z-index:10060; overflow-y:auto;
  -webkit-overflow-scrolling:touch; background:#0b1620; display:flex; flex-direction:column; }
/* neutralise the pane's fixed 340-420px overlay geometry once inside a card */
#hba-card-stack .hba-card > [id^="hba-"] {
  position:static !important; top:auto; right:auto; left:auto;
  width:100% !important; max-width:100% !important; box-shadow:none !important; }
/* peek strip in deck state — content clamped to the header height */
#hba-card-stack.deck .hba-card { max-height:64px; overflow:hidden; margin:6px 8px; border-radius:12px;
  box-shadow:0 4px 14px #0007; }
/* full-screen focused card fills the viewport, its body scrolls internally */
#hba-card-stack.fs   .hba-card.focus > [id^="hba-"] { height:100vh; max-height:100vh !important;
  border-radius:0; overflow:auto; }
#hba-card-stack.fs   .hba-card:not(.focus) { display:none; }
```
- Deck vs full-screen = toggling a class on `#hba-card-stack` (`deck` / `fs`) + `focus` on one card.
  No layout math in JS beyond gesture translate.
- `[id^="hba-"]` matches every pane id (`hba-leave-pane`, `hba-iot-pane`, …) → **zero per-pane CSS.**
- Gesture drag = set `slot.style.transform = translate(dx,dy)` on `pointermove`, snap-back / commit on
  `pointerup` (copy swipe.js 127-186 math), `touch-action:none;user-select:none` on the focused card.

---

## 6. Phased build order (smallest safe increment first)

- **Phase 0 — this spec.** (done on approval)
- **Phase 1 — prove the mechanism, ONE pane.** Ship `hba_mobile_stack.js` with `present()` where the
  **desktop path is byte-identical to today** (regression-proof: desktop untouched). Wire ONLY
  `hba_leave.js` (simplest, no timers) to call it. Mobile path = single card, straight to full-screen,
  content fills the viewport, pane's × closes it (MutationObserver teardown). No deck, no gestures yet.
  Witness: `§HBASTACK present id=hba-leave-pane mobile=true focus=0`; desktop witness proves the append
  path unchanged.
- **Phase 2 — the deck + scroll + push/pop.** Peek-deck render for N cards, tap-to-fullscreen, ‹ back /
  swipe-down = minimise, × = close→deck, scroll when overflowing. Wire a 2nd pane (`hba_payslip.js`) to
  prove multi-card ordering + nav. Witness `_cards`/`_focus`/`_nav` transitions.
- **Phase 3 — gestures.** Left/right carousel between full-screen cards; down = minimise. Port swipe.js
  gesture math + constants (THRESHOLD_PX, SNAP_MS, pointer-capture). Witness gesture→state changes.
- **Phase 4 — wire the rest.** `hba_dashboard`, `hba_tenancy`, `hba_bom`, `hba_iot` (verify iot timers
  survive re-parent + still stop on unmount). Optional `openFamilyDrawer` bottom-sheet via
  `styleDrawer`. Witness all 6 present/close cleanly, zero residue.
- **Phase 5 — hardening.** Rotate/resize, deep-link fly-to while a card is full-screen, back-button /
  Esc, audit for the `#b-clear`/grid-clear state-leak class (per MEMORY.md) on `_cards`/`_nav`.

Each phase is independently shippable and leaves desktop untouched.

---

## 7. What I'm NOT deciding (open questions for the user)

UX calls I made **confidently** (mine as design author): reuse `window._isMobile`; reuse swipe.js
gesture math + 80px/200ms constants rather than SwipeStack-the-container; minimise-vs-close split
(down=minimise, ×=remove); scoped-CSS re-parent over inline restyle; MutationObserver teardown;
newest-pane-opens-full-screen on present.

Genuinely **open** (please confirm — not facts I can extract, real product choices):
1. **Fling-to-remove gesture?** Phase 1 has down=minimise, ×=remove only. Add a hard down-fling (or
   long-swipe-up) that *deletes* a card, and at what velocity/px threshold? (Default: none — safer.)
2. **On `present`, focus the new card full-screen, or drop it into the deck?** I defaulted to
   full-screen (matches "tap opens it"; opening from the drawer implies intent to view). Confirm.
3. **Large touchscreen (tablet/touch-laptop):** cards, or keep the desktop draggable overlay above some
   viewport width? Default = plain `_isMobile` (touch ⇒ cards). Add an `innerWidth<=900` gate?
4. **Drawer form on mobile:** keep the existing right-anchored list as the launcher, or reflow it to a
   bottom-sheet (phase 4 `styleDrawer`)? Default = keep as-is, polish later.
5. **Animation timing:** adopting swipe.js `SNAP_MS=200`. Fine, or a specific feel you want?

No data/geometry decisions arise in this feature (pure presentation) — the non-invent rule has nothing
to bite on here.
