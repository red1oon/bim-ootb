# ⚠ DO NOT REMOVE — Witness harness hardening + shortcut-audit false positives + WH-gate query noise
# Scope: THREE things, in this order, one prompt — organise before you review, so the review's own witness
#        probes aren't rebuilt later: (0) the WITNESS pattern itself (real-state, no-mock, falsifiable
#        claims) is proven high-value but has 3 concrete gaps hit live this session (no shared harness, no
#        persisted run log, no fixture caching — a stale-state race + an accidental multi-minute rebuild
#        both traced to this) — harden it FIRST. (1)+(2) two console-noise findings from a live production
#        log (Hospital building, OCI-hosted DB) traced clean this session — false alarms, but the STUDY that
#        would prove they're the ONLY false alarms was never done: input_registry.js's checkShortcuts()
#        self-audit is architecturally too shallow to see most of this app's real shortcut-wiring paths, and
#        wh_walk.js's gate-check queries a table that legitimately doesn't exist on non-warehouse buildings
#        and logs a scary SQL error before its own catch swallows it (the file's own comment names this
#        "showWhen precedent" pattern as used elsewhere too).
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

## ▶ PHASE 0 — witness harness hardening (precursor: organise FIRST, so Phase 1/Issue 1/2 don't rebuild)
Do this before Phase 1 and before writing any of Issue 1/2's own witness probes. Reasoning (assessed
2026-08-06, in the session that scoped this doc): the WITNESS pattern itself is high-value where it's been
used — real app state, no mocks, falsifiable-by-design claims tied to a named issue — proven again this
session (`witness_tour_scrub.js`'s new `W-SCRUB-PANEL-TAB` claim caught two real bugs in its own test logic
before passing, not just a rubber-stamp green). But it has three concrete, evidenced gaps, and Issue 1/2's
own Witness Plan (below) is about to need exactly the infrastructure those gaps are missing — so build it
ONCE here, generically, not as a one-off buried inside this study's own probe scripts:

1. **Shared harness, not reinvented per file.** Every `witness_*.js` (dozens, repo root) reinvents its own
   `claim()` assertion helper and puppeteer launch/page/cleanup boilerplate from scratch. Extract ONE shared
   module (e.g. `scripts/witness_harness.js`) — the common `claim(name,pass,detail)` + result-collection +
   summary-printing + browser lifecycle (launch args, leak-safe cleanup per the HARD RULES above) — that any
   witness, old or new, can `require()`. Migrate `witness_tour_scrub.js` to it as the first proof it actually
   generalizes (it already has a `claim()` shaped exactly like this — that's the extraction candidate).
2. **Persistent run log — one place to see the whole picture.** Right now a witness's result exists only in
   whatever terminal happened to run it. Add a small persisted, append-only log (e.g.
   `witness_runs.ndjson` or similar — one line per run: timestamp, git commit, witness file, claims
   PASS/FAIL) that the harness writes to automatically. A dev should be able to answer "is the app healthy /
   what broke recently" by reading one file, not by knowing which of the ~dozens of `witness_*.js` scripts
   to individually re-run and scroll through.
3. **Fixture/state-caching to cut the "over-debug over-runs" cost.** The concrete evidence: this session's
   `W-SCRUB-PANEL-TAB` work hit a real stale-state race (claims sharing one long-lived browser page leaked
   `walkActions`/`_tourStarts` from an earlier claim) AND separately triggered an accidental multi-minute
   full building re-stream from earlier seeks — both because nothing in the shared session checkpoints or
   isolates state between claims. Study whether a "warm session" fixture (load the building/DB ONCE, snapshot
   a known-good checkpoint, let claims restore-to-checkpoint instead of re-deriving state via more app calls)
   is feasible for this app's architecture — if yes, land it; if the app's global-singleton `window.APP`
   shape genuinely resists checkpointing, say so explicitly rather than half-attempting it.

**Explicitly NOT in scope here:** CI-gating ("GREEN before commit is a LOCAL discipline, not automation" —
`RosettaStoneGateTest.java` note in the top-level `CLAUDE.md`). That's a separate process/architecture
decision the user has not asked for in this doc — don't fold it in.

Once Phase 0 lands, Issue 1/2's own Witness Plan (below) MUST use the new shared harness — writing another
one-off puppeteer script at that point would be exactly the double-work this precursor exists to prevent.

## ▶ PHASE 1 — bounded pattern-shape sweep (after Phase 0, before Issue 1/2's tasks)
Scoped to exactly two subsystems — the input/shortcut wiring and the DB-query-gate wiring — NOT a general
codebase read-through. The leaf-level code read carefully this session (dated `§`-tag rationale, defensive
guards, witness discipline throughout `scene.js`/`tour.js`/`wh_walk.js`) — this is not a "vibe-coded mess"
in the usual sense. The two findings below are narrower: organic-growth drift where a session solved
something locally instead of reusing a shared mechanism already on hand. Sweep for exactly these three
SHAPES (a proxy for "is there more lurking," bounded and falsifiable — not "read everything for quality"):

**Shape A — self-auditing code that never checks itself against real state.** `checkShortcuts()`
(`input_registry.js:124-164`) is the found instance: it verifies shortcuts by string-matching a function's
own source text, never by observing a real effect. Grep for other self-referential "audit"/"check"/"verify"
functions in `viewer/*.js` that grade against static text/config rather than live app state, and note them —
don't fix them here, just confirm whether this project has more than the one instance.

**Shape B — catch-and-swallow masking an expected-but-noisy failure.** `wh_walk.js:50-57`'s `gateNow()` is
the found instance (already scoped as Issue 2 Task 1's grep sweep — don't duplicate the work, just confirm
Issue 2 Task 1 covers this shape fully).

**Shape C — a mechanism reinvented locally where a shared one already exists.** 11+ files each own an
independent `keydown` listener (`precision_cam.js`, `grid_drag.js`, `doc_canvas.js`, `navigate_controls.js`,
`navigate_engine.js`, `cinema_path_editor.js`, `print_sheet.js`, `nlp.js`, `main.js`, `sfx.js`,
`navigate_find.js` — re-grep, this list drifts) instead of extending `input_registry.js`, which reads as the
intended canonical registry. For each of those 11+ files: is the local listener there because the shared
registry genuinely can't serve that case (e.g. `precision_cam.js`'s `e.code==='CapsLock'` needs raw
`KeyboardEvent.code`, which `_shortcuts`'s string-key map may not support), or is it just historical —
written before `input_registry.js` existed, or before whoever wrote it knew it existed? That distinction
matters for Issue 1 Task 4's architecture choice: a shared registry (option b) is only the right call if
most of these 11+ cases could ACTUALLY move into it. Also grep briefly for this same "reinvented locally"
shape in one or two OTHER small subsystems (e.g. panel-close handling, given `_scrubHide`-style teardown
functions have appeared ad hoc in at least one other recent session) — a couple of data points, not a full
survey — just enough to say whether Shape C is confined to keydown-handling or is a wider habit worth its
own future prompt.

Output of Phase 1: a short table (shape × file × verdict: confirmed-instance / false-alarm / not-applicable)
appended to this doc before Issue 1/2's tasks proceed. If Phase 1 surfaces a NEW confirmed instance of any
shape outside the two issues already scoped here, note it and decide then whether it's in-scope for this
same session or belongs in its own future prompt — don't silently fold in unbounded new scope mid-session.

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
Headless, `§`-tagged, real app state — see `docs/TestArchitecture.md` §Whitebox Testing. Both probes below
are written USING Phase 0's shared harness (`claim()` + cleanup + the persisted run log) — not as new
standalone puppeteer scripts. If Phase 0 wasn't actually landed before this point, stop and go back to it;
writing one-off probes here is the exact double-work Phase 0 exists to prevent.
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
The irreducible reasoning here is Phase 0's harness-architecture call (can this app's `window.APP`
singleton actually be checkpointed?), Task 4's shortcut-audit architecture choice (a/b/c), and the
falsification pass (Task 5, Issue 1 Witness) that proves nothing else is hiding — that has to happen in one
head holding the whole picture, which is exactly Fable 5's 1M-context strength, not a fit for a narrow
single-file patch session.
Suggested effort: `high` to start (this is wide-file-count study, not oracle-equivalence-grade proof
construction) — escalate to `xhigh` only if Task 1/2's inventory genuinely stalls on ambiguity.
Recommend running this as a **fresh Fable session**, this doc as its opening spec, NOT continued in the
current Sonnet session — per the user's own framing when this was scoped (2026-08-06).

## ▶ DONE (fill in as the study proceeds — every ✅ needs a `§`-lined witness citation, every ⛔ needs a
##      named blocker, not a silent drop)
- [ ] Phase 0 item 1: shared witness harness module extracted, `witness_tour_scrub.js` migrated as proof
- [ ] Phase 0 item 2: persisted run log landed, at least one real run appended to it
- [ ] Phase 0 item 3: fixture/checkpoint caching landed, OR explicitly ruled infeasible with a stated reason
- [ ] Phase 1: shape × file × verdict table appended (self-audit / catch-swallow / reinvented-mechanism)
- [ ] Task 1 (Issue 1): full 11+-file keydown-listener inventory, every bound key traced to a live handler
- [ ] Task 2 (Issue 1): every `_shortcuts` entry independently traced (not just the 5 originally flagged)
- [ ] Task 3 (Issue 1): MISS-checker's real source located and read
- [ ] Task 4 (Issue 1): architecture (a)/(b)/(c) chosen and justified in a dated section below
- [ ] Task 5 (Issue 1): post-fix audit re-run AND independent real-state verification (not self-graded),
      probe written using Phase 0's shared harness
- [ ] Task 1 (Issue 2): full grep sweep for the "maybe-absent-table gate" idiom, call-site count stated
- [ ] Task 2 (Issue 2): shared silent primitive landed (if >1 site) or single-site fix justified (if =1)
- [ ] Witness run headless via the shared harness, persisted log entry written, § lines cited above
- [ ] PR opened via `/tmp/wt-*` worktree discipline (never edit `~/bim-ootb` directly)
