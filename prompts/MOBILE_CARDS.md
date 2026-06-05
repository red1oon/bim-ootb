# ⚠ DO NOT REMOVE — Scope guard
**Scope:** §MOBILE-VIEW — render the iDempiere record LIST as stacked `.acc` cards at `@media (max-width:760px)`
INSTEAD of the desktop `<table class="idmp-grid">`. Desktop (>760px) keeps the EXACT existing grid. Also: single-
column forms (already done by §MOBILE-GRIDFIT), horizontally-scrollable tabs (already done), and dock the pill
rail as a BOTTOM bar on mobile so it stops covering records.
**Read the log after EVERY run** — `erp/tests/poc_mobile_cards.log` — exit code is NOT evidence. NON-INVENT: cards
show real record fields from the loaded `ad_seed.db` (the same `_displayFields(tab)` the grid uses), no fabricated
rows/columns. Honour this block until §MOBILE-VIEW is `✅ DONE (witness)`.

---

## §1 — What renders the list (the surface)
`erp/idempiere.html` is a SELF-CONTAINED iDempiere chrome (it does NOT use `ad_ui.js` for the list).
- `renderBody()` (≈L704) → `_viewMode==='grid'` → `host.appendChild(buildGrid(tab))`.
- `buildGrid(tab)` (≈L712) builds `<table class="idmp-grid">` from `cols = _displayFields(tab).slice(0,7)` × `_records`.
  Each `<tr>` carries `data-ad-table`/`data-ad-record` (host contract — MUST be preserved) and a click→form handler.

## §2 — Where the ≤760px card branch is injected (CSS-toggle, not viewport-branch)
**Render BOTH, let CSS hide one.** This survives orientation/resize, matches "desktop exactly as-is", and keeps the
host-contract `data-ad-*` tags on the desktop table untouched.
- `buildGrid(tab)` returns a wrapper `<div class="idmp-listwrap">` containing:
  1. the EXISTING `<table class="idmp-grid">` (UNCHANGED markup + handlers + `data-ad-*` tags), and
  2. a NEW `<div class="idmp-cards">` of one `.acc` card per record.
- CSS: at the top level `.idmp-cards{display:none}` (desktop: cards hidden, table shown — desktop UNCHANGED).
  Inside `@media (max-width:760px)`: `.idmp-grid{display:none}` + `.idmp-cards{display:block}` (mobile: table
  hidden, cards shown). One DOM, two skins.

## §3 — How cards reuse `.acc` (the existing accordion idiom)
Mirror the `accts_posted.js mountAccordion` precedent (`.acc/.hd/.bd/.lbl/.chv`):
- One `.acc` per record. `.hd` = the record IDENTIFIER (first display field's value, fallback `Record N`) + a `.chv`
  chevron. Tap `.hd` → open the record in FORM view (`_recIdx=i; _viewMode='form'; renderBody()`) — same action the
  desktop row click performs (NON-INVENT: identical handler semantics).
- `.bd` (collapsed by default) = the record's fields as stacked `label : value` rows (a `.idmp-cardfld` per field,
  using the SAME `_displayFields(tab)` + `fmt()` + `recVal()` the grid uses — same data, no new query).
- Each `.acc` carries the SAME `data-ad-table`/`data-ad-record` tags (host contract holds on mobile too).
- A `.chv` open/close toggle on `.hd` tap-to-expand (peek fields without leaving the list); a separate explicit
  "Open ›" affordance enters form view. (KISS: chevron tap = expand body; full-card tap = open form.)

## §4 — Pill rail → bottom bar on mobile
`buildPillRail()` (≈L1023) appends `#idmp-pillrail` (a fixed RIGHT vertical rail, `z-index:1200`). On mobile it
overlaps the rows. In the `@media (max-width:760px)` `_injectPillCSS` block, re-dock `#idmp-pillrail` as a fixed
BOTTOM bar: `left:0;right:0;bottom:0;top:auto;transform:none;flex-direction:row;justify-content:space-around;
border-radius:0`, and pad `#idmp-content{padding-bottom:64px}` so the last card clears the bar. Desktop rail
unchanged (CSS lives only inside the media query).

## §5 — Witness (the EXACT line proven)
Whitebox `§`-log in `renderBody()`/`buildGrid()`:
`§MOBILE-VIEW cards=<N> rows=<N> tableHidden@≤760=<Y/N> cardsShown@≤760=<Y/N> desktopTable=<Y/N> pillRail=bottom@≤760`
- At 390×844: `cards=N (N>0)`, `tableHidden@≤760=Y`, `cardsShown@≤760=Y`, pill rail bottom-docked.
- At 1280 (desktop): the `<table class="idmp-grid">` is visible (`desktopTable=Y`, cards hidden).
- 0 pageerrors.
Test: `erp/tests/poc_mobile_cards.js` (harness copied from `poc_mobile_gridfit.js`): load a window with rows, read
the `§MOBILE-VIEW` line, assert cards>0 + table hidden ≤760 + table shown @1280 + 0 pageerrors, screenshot
before/after at 390px, print `§MOBILE-VIEW … PASS/FAIL`, exit non-zero on fail.

## §6 — Status
- ✅ DONE (witness) — branch `feat/mobile-cards`, sw v585→v586.
  Witness (tests/poc_mobile_cards.log): `§MOBILE-VIEW cards=35 tableHidden@≤760=Y cardsShown@≤760=Y
  pillRail=bottom@≤760:Y desktopTable=Y mobileOk=true desktopOk=true` → `§MOBILE-VIEW PASS`. 35 real Odoo
  products (window=140), card titles = AD identifier (e.g. `ODOO-16 · Corner Desk Right Sit`), 0 pageerrors at
  both 390px and 1280px. Screenshots: tests/mobile_cards_{before,after}_390.png, mobile_cards_desktop_1280.png.
