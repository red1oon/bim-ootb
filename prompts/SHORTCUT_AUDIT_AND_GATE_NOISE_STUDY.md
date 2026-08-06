# ⚠ DO NOT REMOVE — Shortcut-audit false positives + WH-gate query noise: a THOROUGH study, not a band-aid
# Scope: two console-noise findings from a live production log (Hospital building, OCI-hosted DB) turned
#        out to be false alarms when hand-traced this session — but the study that would PROVE they're the
#        ONLY false alarms was never done. This prompt is that study. Two separate root causes, one prompt:
#        (1) input_registry.js's checkShortcuts() self-audit is architecturally too shallow to see most of
#            this app's real shortcut-wiring paths, so its dead/MISS output cannot currently be trusted —
#            in either direction. (2) wh_walk.js's gate-check queries a table that legitimately doesn't
#            exist on non-warehouse buildings and logs a scary SQL error before its own catch swallows it;
#            the file's own comment says this "showWhen precedent" pattern is used elsewhere too.
#        Read `docs/TestArchitecture.md` §Anti-Drift + §Whitebox before touching anything. Whitebox §-tagged
#        console.log is the PRIMARY witness — SAVE every probe run to a log and READ it before any
#        conclusion. Honour this file until every item in the ▶ DONE checklist is ✅ or ⛔ with a named blocker.

## ☠ HARD RULES (cost real incidents elsewhere in this project — apply here too)
- Edit shipping code ONLY in a `/tmp/wt-*` worktree off `origin/main` — `~/bim-ootb` is shared, other
  sessions run there live, and Edit/Write/MultiEdit against it is hook-blocked anyway
  (`~/.claude/hooks/block-shared-tree.sh`). `git worktree list` first — reuse before creating a new one.
- Headless WebGL probes LEAK CPU: server+curl-retry+probe in a `run_*.sh`, wrap `timeout --signal=KILL 150
  node probe.js`, `pkill -9 -f chrome-headless-shell` after, verify `ps -eo comm|grep -i chrome` clean.
- Whitebox doctrine (`docs/TestArchitecture.md` — [[feedback_whitebox_not_playwright]],
  [[feedback_log_not_visual_proof]]): every claim below is proven by a real `§`-tagged log line or a piece
  of real app state read programmatically (e.g. did `A.selectedRoom` actually change) — never a screenshot,
  never "the audit line now says ok" as its own proof (that's grading your own homework, see below).
- Non-invent: every claim in this doc cites `file:line` from the ACTUAL current checkout, not memory of a
  prior session. Line numbers drift — re-`grep -n` before trusting one that looks stale.
- Cut ceremony; decide and let the user judge by what appears. STOP only when about to INVENT (no source)
  or a genuine architecture fork needs a user decision you cannot extract from this doc or the code.

## ▶ CONTEXT — the log that started this (Hospital building, live OCI-hosted DB, 2026-08-06)
```
scene.js?v=55:1 §HELPERS_QUERY_ERR no such table: m_bom_line SELECT COUNT(*) FROM m_bom_line WHERE role='BIN'
  (anonymous) @ scene.js  ← (anonymous) @ helpers.js  ← gateNow @ wh_walk.js ← setInterval
scene.js?v=55:1 §SHORTCUT key=+ status=dead target=_zoomStep
scene.js?v=55:1 §SHORTCUT key=- status=dead target=_zoomStep
scene.js?v=55:1 §SHORTCUT key=z status=dead target=toggleOpen
scene.js?v=55:1 §SHORTCUT key=w status=dead target=toggleOpen
scene.js?v=55:1 §SHORTCUT key=r status=dead target=_cycleRoom
scene.js?v=55:1 §SHORTCUT_AUDIT MISS action=help key=F1 — no scene.js shortcut
scene.js?v=55:1 §SHORTCUT_AUDIT MISS action=xray key=Alt+Z — no scene.js shortcut
scene.js?v=55:1 §SHORTCUT_AUDIT MISS action=fullscreen key=F11 — no scene.js shortcut
scene.js?v=55:1 §SHORTCUT_AUDIT MISS action=precision key=Caps Lock — no scene.js shortcut
```
Hand-traced this session (Sonnet, ad hoc — NOT the systematic study this prompt asks for). Every single one
turned out to be a **false positive**:

| Flag | Real wiring found | Why the audit missed it |
|---|---|---|
| `+`/`-` dead, target=`_zoomStep` | `scene.js:1361 function _zoomStep(dir)` — module-private closure, called correctly from `scene.js:1540-1541` | resolver only checks `window[n]`/`window.APP[n]`/`window.A[n]`, never the enclosing closure |
| `r` dead, target=`_cycleRoom` | `scene.js:1469 async function _cycleRoom()`, called from `scene.js:1749` | same — module-private closure |
| `z`/`w` dead, target=`toggleOpen` | `scene.js:1563-1564` call `UniversalHistory.toggleOpen()` / `WholeHistory.toggleOpen()` | resolver checks only 3 top-level names, not `window.UniversalHistory.toggleOpen` |
| MISS help/F1, xray/Alt+Z, fullscreen/F11 | hardcoded directly in scene.js's own keydown handler, `scene.js:2529-2534`ish (F1/F11) and `:2518` (Alt+Z) — BEFORE the `_shortcuts` map is ever consulted | the MISS-checker (source TBD — see Issue 1 task 3) apparently only knows about the `_shortcuts` map, not this handler's earlier hardcoded branches |
| MISS precision/Caps Lock | `precision_cam.js:180`, `if (e.code === 'CapsLock') toggleFine();` — its OWN independent `keydown` listener | MISS-checker has no visibility outside scene.js at all |

**The open question this prompt exists to answer:** given the audit's blind spot is this wide, is there
ALSO a real dead shortcut hiding in the noise that got dismissed along with these nine? Nobody has checked.
That is the actual job here — not silencing the log.

## ▶ ISSUE 1 — checkShortcuts() self-audit is architecturally too shallow to trust
`input_registry.js:124-164` (`InputReg.checkShortcuts`) resolves a shortcut function's body via regex
(`/(?:\b(?:window|A|APP)\.)?([a-zA-Z_$][\w$]*)\s*\(/g`) and checks each called name against `window[n]`,
`window.APP[n]`, `window.A[n]` ONLY — one level deep, three roots. This project has at minimum **11 files**
with their own independent `keydown` listeners outside `_shortcuts`/`checkShortcuts`'s view entirely:
`precision_cam.js`, `grid_drag.js`, `doc_canvas.js`, `navigate_controls.js`, `navigate_engine.js`,
`cinema_path_editor.js`, `print_sheet.js`, `nlp.js`, `main.js`, `sfx.js`, `navigate_find.js` (re-grep —
this list is a `grep -rln "addEventListener('keydown'"` snapshot, will drift).

### Task 1 — full inventory, not a sample
For every one of those 11+ files: read the listener, list every key it binds, confirm each still resolves
to a live handler by reading the call, not by re-running the same shallow heuristic on it. Note any key
that's bound in TWO places (potential real conflict, different bug class from "dead").

### Task 2 — audit every `_shortcuts` entry, not just the 5 flagged ones
`scene.js:1539` onward. The ones marked `status=ok` are not proven correct either — the heuristic could
false-negative-PASS a shortcut whose resolved name coincidentally matches an unrelated global with the same
name. Trace every key's REAL call chain to its REAL current target. Flag anything that's actually dead (a
name that resolved historically but the function was since renamed/removed) — that would be the genuine
bug this whole investigation is checking for.

### Task 3 — find and audit the MISS-checker itself
The `§SHORTCUT_AUDIT MISS action=... key=... — no scene.js shortcut` lines were NOT produced by
`input_registry.js:124-164` (that emits `§SHORTCUT key=...`, a different tag). Locate the actual source
(the stack trace pointed through `panels.js` — start there, likely a command-palette or help-overlay action
list cross-checked against `_shortcuts`). Read what it actually checks and why it doesn't know about
scene.js's own hardcoded early-return branches (F1/F11/Alt+Z/Alt+S/Alt+G/Alt+J/Alt+C/Alt+P/Ctrl+S/Ctrl+O/
Backspace/`\`, all around `scene.js:2511-2560`) or cross-file listeners.

### Task 4 — pick ONE architecture, don't half-do two
Options, in ascending order of invasiveness:
  **(a) Deeper static resolver** — teach `checkShortcuts` to accept a caller-supplied local-function map
  (covers module-private closures) and to walk one more level into known nested namespaces
  (`UniversalHistory`, `WholeHistory`, `InputReg`, ...), plus an explicit, commented skip-list for the
  handful of genuinely cross-file cases (CapsLock, the scene.js hardcoded branches). Minimum viable fix.
  **(b) Real registration, real audit** — every keydown-bound key (in ALL 11+ files, including the hardcoded
  scene.js branches and precision_cam.js's CapsLock) registers into ONE shared table at setup time (e.g.
  `window._allShortcuts.register(key, fn, {source: 'precision_cam.js'})`). The audit then has exactly one
  place to look and needs no name-resolution heuristics at all — it just checks the registered `fn` is
  callable. This is the architecturally honest fix given the file is already called `input_registry.js` and
  clearly intended to be the canonical registry; right now it only covers a subset.
  **(c) Introspective resolver** — parse the actual `addEventListener('keydown', ...)` call sites across
  `viewer/*.js` at audit time (most robust, most invasive, probably not worth it vs (b)).
Justify the choice in a dated section appended to THIS file before writing code. Don't build (a) as a
stopgap and call it done if (b) is the right long-term answer — say so and either do it or explicitly defer
it with a reason, don't silently ship the weaker fix.

### Task 5 — grade against reality, not against your own skip-list
After the fix, re-run the audit on a real loaded building and independently verify (via real app state, not
the audit's own "ok" output) that every previously-flagged key still does its real thing: `+`/`-` actually
dolly the camera (read `A.camera.position` before/after), `r` actually cycles `A.selectedRoom` or equivalent,
`z`/`w` actually open `UniversalHistory`/`WholeHistory` panels (check DOM), F1/F11/Alt+Z/CapsLock each fire
their real effect. This is the falsifiable proof — "audit says 0 dead" alone is not evidence of anything if
the audit is what you just edited.

## ▶ ISSUE 2 — m_bom_line / WH-gate query noise, and its siblings
`wh_walk.js:50-57`:
```js
function gateNow() {
  if (!A || !A.db) return false;
  try {
    var b = A.dbQuery("SELECT COUNT(*) FROM m_bom_line WHERE role='BIN'");
    var e = A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcBuildingElementProxy' AND guid GLOB '[0-9]*'");
    return b.length && Number(b[0][0]) > 0 && e.length && Number(e[0][0]) > 0;
  } catch (err) { return false; }
}
```
Called once via a one-shot poll (`wh_walk.js:58-71`, `clearInterval` fires on first sight of `A.db`) — NOT a
repeating error, confirmed. FUNCTIONALLY CORRECT on Hospital (no warehouse schema → pill correctly stays
off, feature correctly stays inert, exactly as documented at `wh_walk.js:13-15`, the "DATA-GATED" comment).
The wart: `A.dbQuery`/`helpers.js`'s `§HELPERS_QUERY_ERR` console.error fires BEFORE `gateNow`'s own catch
swallows it, so every non-warehouse building prints a scary-looking SQL error at load for a table that was
never supposed to exist there.

`wh_walk.js:13` says outright: *"DATA-GATED (the pos-pill showWhen precedent)"* — naming `pos_lens.js` (or
wherever the pos-pill lives) as a PRIOR instance of this exact "query a maybe-absent table, catch it, treat
absence as gate-off" idiom. That is the actual signal this issue is not a one-off.

### Task 1 — find every instance of the idiom
`grep -rn` for the pattern across `viewer/*.js`: a `try { A.dbQuery(...) } catch` (or `A.db.exec`) whose
purpose is testing whether an OPTIONAL table/column exists, not handling a real error. Confirm which ones
share `wh_walk.js`'s noisy-but-correct shape. Count the call sites before deciding the fix's shape.

### Task 2 — one shared, silent primitive — not a patch per call site
If Task 1 finds more than one call site (expected, given the file's own comment names a precedent): add ONE
shared helper — e.g. `A.dbTableExists(name)` that checks `sqlite_master` first (never throws, never logs),
or a `dbQuery(sql, params, {silent:true})` opt-in that skips the `§HELPERS_QUERY_ERR` console.error for
expected-absent-schema checks — and migrate every found call site to it. Fix `wh_walk.js` alone ONLY if
Task 1 proves it's genuinely the only call site; otherwise a single-site patch is the exact band-aid this
prompt is trying to avoid.

## ▶ WITNESS PLAN
Headless, `§`-tagged, real app state — see `docs/TestArchitecture.md` §Whitebox Testing.
- **Issue 1:** one probe per chosen architecture option, loading a real building, dispatching every bound
  key found in Task 1's inventory (not just the 9 originally flagged), asserting a REAL observable effect
  per key (camera moved, panel opened, mode toggled) — not merely reading the audit's own verdict.
- **Issue 2:** load 2-3 buildings spanning "has warehouse schema" / "doesn't" / "has neither table nor any
  optional schema at all", confirm zero `§HELPERS_QUERY_ERR` (or its replacement, if the helper changes the
  tag) on all three, and confirm `WHWalk`'s pill/gate state is still correct in each (on only when it should
  be) — a silence-only fix that also broke the gate itself would be worse than the noise.

## ▶ RECOMMENDATION — Fable-mode dispatch, not the next Sonnet/Opus turn
This is exploratory, wide-context, cross-file architecture work (11+ files, an undetermined number of
`dbQuery`-gate call sites, a real "is there a hidden bug" open question) rather than a scoped known fix —
the profile this project already reserves for a Fable dispatch (see `[[project_fable5_lane.md]]`'s
allocation rule: *"Fable does the irreducible new reasoning; Opus/Sonnet replicate the proven pattern"*).
The irreducible reasoning here is Task 4's architecture choice (a/b/c) plus the falsification pass (Task 5,
Issue 1 Witness) that proves nothing else is hiding — that has to happen in one head holding the whole
picture, which is exactly Fable 5's 1M-context strength, not a fit for a narrow single-file patch session.
Suggested effort: `high` to start (this is wide-file-count study, not oracle-equivalence-grade proof
construction) — escalate to `xhigh` only if Task 1/2's inventory genuinely stalls on ambiguity.
Recommend running this as a **fresh Fable session**, this doc as its opening spec, NOT continued in the
current Sonnet session — per the user's own framing when this was scoped (2026-08-06).

## ▶ DONE (fill in as the study proceeds — every ✅ needs a `§`-lined witness citation, every ⛔ needs a
##      named blocker, not a silent drop)
- [ ] Task 1 (Issue 1): full 11+-file keydown-listener inventory, every bound key traced to a live handler
- [ ] Task 2 (Issue 1): every `_shortcuts` entry independently traced (not just the 5 originally flagged)
- [ ] Task 3 (Issue 1): MISS-checker's real source located and read
- [ ] Task 4 (Issue 1): architecture (a)/(b)/(c) chosen and justified in a dated section below
- [ ] Task 5 (Issue 1): post-fix audit re-run AND independent real-state verification (not self-graded)
- [ ] Task 1 (Issue 2): full grep sweep for the "maybe-absent-table gate" idiom, call-site count stated
- [ ] Task 2 (Issue 2): shared silent primitive landed (if >1 site) or single-site fix justified (if =1)
- [ ] Witness run headless, log saved + read, § lines cited above
- [ ] PR opened via `/tmp/wt-*` worktree discipline (never edit `~/bim-ootb` directly)
