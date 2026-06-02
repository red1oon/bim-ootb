# Adversarial Review — chat_lens.js / chat_lens.html (lane-3 worker F1)

**Reviewer:** adversarial (read-only on all chrome/engine code)
**Date:** 2026-06-03
**Artifacts reviewed:** `chat_lens.js`, `chat_lens.html`, `tests/poc_chat_chrome.js`, `tests/poc_chat_chrome.log`
**Cross-checked against:** `prompts/MOBILE_CHAT_LENS.md`, `build/erp/poc_chat.log`, `prompts/LENS_FAMILY.md`
**Witness re-run:** `node tests/poc_chat_chrome.js` → EXIT=0, all green (log at `/tmp/review_rerun.log`, byte-equivalent to F1's `tests/poc_chat_chrome.log`).

## Verdict table

| # | Check | Verdict | Citation |
|---|-------|---------|----------|
| 1 | Faithful fold (bubble traces to real op) | **PASS** | `chat_lens.js:110-124` (id=op_uuid, sender=user_tag, verb=op_type); witness `poc_chat_chrome.js:71`; log §CHAT-CHROME-THREAD bubbles=5 handAuthored=0, matches `poc_chat.log:11` msgs=5 |
| 2 | Dismiss is view-only | **PASS** | `chat_lens.js:179-182` mutate only `vm.dismissed`; log §CHAT-CHROME-DISMISS `logRows=5 unchanged=Y` (`poc_chat_chrome.log:17`) |
| 3 | Pills-as-flips | **CONCERN** | Recent/Anchor are clean view-ops (`chat_lens.js:186,199-204`); **Replay sets `vm.replayStep` (`:193`) but no consumer honors it** — `visibleBubbles` (`:169-171`, the only render filter) ignores it, so the scrub is hollow; witness asserts only `view==='replay'` + step is set (`poc_chat_chrome.js:103`), never that the step limits rendered bubbles |
| 4 | Verified tick honesty | **PASS** | `chat_lens.js:104-108` folds tick from `op_hash`/`sig`; absent → `tickSource='identity'`, glyph `·`, never ✓/🔒; log §CHAT-CHROME-TICK `signedBubbles=0 fabricated=0` (`poc_chat_chrome.log:30`) |
| 5 | No fabricated coverage | **CONCERN** | Chrome does NOT render coverage at all — no `coverage:partial`, no journal. Honest (nothing fabricated: `grep coverage chat_lens.* ` = comment only), but the §CHAT-COVERAGE fold proven in `poc_chat.log:40` is dropped from the lens + unwitnessed in `poc_chat_chrome.js`. Omission, not a lie |
| 6 | Mobile reflow real | **PASS** | `chat_lens.js:156-164` exposes `viewport/layout/bubbleMaxWidthPct/threadListCollapsible`; consumed by `mountChat` (`:240`) + CSS (`chat_lens.html:21-37`); log §CHAT-CHROME-REFLOW `viewport=mobile` (`poc_chat_chrome.log:36`) |
| 7 | Globals deferred | **PASS** | Only `window.X=` assignment is the sanctioned `window.ChatLens=api` (`:34`); `send`/`dispatch`/nav all `// TODO(STEP-0):` (`:22-23,224`); UserNames/FeedFold are keyed `// TODO(integrate):` fallback calls (`:46-51,60-63`) — no global minted. (Nit: comment `:24` names `resolveSender`, code `:46` calls `resolveTag`.) Per LENS_FAMILY §STEP 0 |
| 8 | Lane ownership | **PASS** | F1 touched only `chat_lens.js`, `chat_lens.html`, `tests/poc_chat_chrome.js` (git status). Sibling workers' files (feed_fold.js, kanban_lens.*, user_names.js) untouched; no reach into backend/overlay/seam docs |
| 9 | Witness integrity | **PASS-with-nit** | Each test NAMES its issue (ISSUE 1-5 headers); log backs every § line; re-run reproduces EXIT=0. Nit: witness covers 5 of the lens's claims but does NOT exercise Replay-step rendering (check 3) or coverage (check 5) — those claims are absent rather than falsely proven |

## Prioritized findings (F1 owns the fix — NOT applied here)

### CONCERN-1 (check 3) — Replay pill is a hollow flip
`chat_lens.js:190-195` `flipReplay` sets `vm.replayStep` but nothing reads it. `visibleBubbles` (`:169-171`) — the sole filter feeding `mountChat` (`:238`) — returns the full fold minus dismissals, with no `view==='replay'` / `replayStep` slice. The spec (`MOBILE_CHAT_LENS.md:59`, "scrub/re-play a thread's op-log from t0") and §CHAT-REPLAY treat replay as a *progressive reveal*. As built, the Replay pill only changes `vm.view` and clears dismissals (identical visible output to Recent Changes).
**Minimal remediation:** make `visibleBubbles` honor replay, e.g. when `vm.view==='replay' && vm.replayStep!=null` slice the post-dismissal list to `[0, vm.replayStep)`; then add a witness assertion that `flipReplay(vm, 2)` yields exactly 2 visible bubbles and `flipReplay(vm, null)` restores N. (Leave dismiss/restore semantics untouched.)

### CONCERN-2 (check 5) — Coverage degrade not carried into the lens
The proven engine fold includes §CHAT-COVERAGE (`poc_chat.log:40`: `coverage=partial … fabricated=0`), and the spec (`MOBILE_CHAT_LENS.md:104-109`) calls the posted-message degrade a showcase of the degrade principle "IN the lens." The chrome's view-model has no `coverage` field and `mountChat` renders no posting/books strip; `poc_chat_chrome.js` has no coverage test. This is honest (nothing is fabricated — verified `grep`), but it drops a proven, spec-named fold and leaves it unwitnessed in the chrome.
**Minimal remediation:** thread a `coverage` object (e.g. `{ posted:'partial', note:'install local for per-doc', clientDr, clientCr }`) from the engine read into `buildThreadVM`/`vm`, render it as a labelled header strip, and add a §CHAT-CHROME-COVERAGE witness asserting `fabricated=0` + the partial label. If coverage is deliberately deferred to a later bounded build, say so explicitly in the scope-guard header so it is a *named* out-of-scope, not a silent gap.

### NIT-1 (check 7/9) — comment/code drift
`chat_lens.js:24` documents the integration hook as `window.UserNames.resolveSender(user_tag)`, but the keyed call at `:46` is `window.UserNames.resolveTag(userTag, adUserRows)`. Harmless, but align the comment so the integration key is unambiguous for the host lane.

## Overall verdict: **APPROVE-WITH-NITS**

The core falsifiable claims hold under attack: the fold is faithful (every bubble = a real op, handAuthored=0, cross-checked against `poc_chat.log`), dismiss/pills never mutate the op-log (logRows 5→5), the verified tick degrades honestly to `identity` with zero fabricated ✓/🔒, the mobile fields are real (consumed by mount + CSS), no exposed-global is minted, and F1 stayed strictly inside its three files.

**What I tried to break and could not:** (a) find a swipe/flip path that deletes or edits an op — none; all view-ops touch only `vm.dismissed`/`vm.view`/`vm.anchor`/`vm.replayStep`. (b) find a faked tick — the glyph ladder `🔒/✓/·/''` is strictly gated on `sig`/`op_hash`/identity presence. (c) find a fabricated anchor — `flipAnchor` (`:199`) only lines up an engine-supplied fold; the FK SQL lives in the html seam-stub, clearly `// TODO(STEP-0): read(relatedDocs)`, over real rows. (d) find a minted global — only `window.ChatLens`, the sanctioned namespace.

The two CONCERNs are **completeness gaps, not falsifications**: Replay is wired but inert, and the proven coverage-degrade fold is absent from the lens + its witness. Neither fabricates a value. Fix or explicitly defer both (with a §-witness for Replay-step) to reach clean APPROVE.
