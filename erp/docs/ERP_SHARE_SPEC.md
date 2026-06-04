# ERP Share Pill — Capture & Restore Full Context (spec)

**Issue:** the `share` pill on `erp.html` copies a bare `location.href` — it does NOT capture the
current ERP context, so a recipient lands on the home globe, not where the sender was.

**Goal (user):** ONE Share control in the pill that **captures AND restores full context**.

## Non-invent principle
The RESTORE side already exists in `erp.html`: on load it reads `?client=` / `?window=` / `?record=`
and calls `ADUI.setClient` / `ADUI.openWindow` / `ADUI.navToRecord`. So Share must emit a URL using the
**same param names** — capture is the mirror of the existing restore, nothing new invented.

## Context model (what is shareable)
`{ client, screen, window, record }`, all read from live ADUI state:
- `client` = `_currentClient` (system | gardenworld)
- `screen` = `_currentScreen` (home | window | charts | more)
- `window` = `_currentWindow.id` (only when screen=window)
- `record` = pk of `_currentRecords[_currentRecordIdx]` via `_caseGet(rec, tab.tableName+'_ID')`

## Changes
1. **ad_ui.js** — add `getContext()` (returns the model) + `buildShareUrl()` (emits
   `<origin><path>?client=&window=&record=` using the existing restore params). Expose both on `ADUI`.
   §-log: `§AD_UI buildShareUrl <url>`.
2. **erp_pills.js** — `share` fn → `ADUI.buildShareUrl()` → `navigator.share({url})` (mobile) /
   `clipboard.writeText` + toast (desktop). §-log: `§SHARE url=<url>`.
3. **erp.html** — fix a latent restore TIMING bug: the `?window/?record` deep-link ran *before*
   `_waitAndHydrate` finished hydrating (openWindow would hit the not-ready guard). Move the
   window/record restore INSIDE `_waitAndHydrate`, right after `ADUI.hydrate(db)` — so a shared link
   restores reliably on a cold load.

## Witness — `tests/poc_share_roundtrip.js` (real Chromium)
- `§SHARE-CAPTURE` — open a window + land on its first record; `ADUI.getContext()` has
  `window`+`record`; `buildShareUrl()` emits `?client=&window=&record=`.
- `§SHARE-RESTORE` — open that URL in a FRESH page; after hydrate, `ADUI.getContext().window` ==
  captured window and `.record` == captured record, `screen=window`. Round-trip is symmetric.
- `§SHARE-ROUNDTRIP PASS` iff capture==restore. Proves the pill captures AND restores full context.
