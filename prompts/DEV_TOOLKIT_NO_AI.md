# ⚠ DO NOT REMOVE — scope + log rule
**Scope:** a set of IDE extensions (VS Code first) that let a developer debug this PWA/local-first
codebase **without Claude** — when tokens run out or AI is not available. Triage + spec only until a
section is marked `✅ SPEC LOCKED`. No implementation before its spec row and its witness claim.
**Read the log after every run.** Exit code is not evidence. Each tool's witness prints a `§DEVTK_*` line;
a tool whose witness judged nothing prints `INCONCLUSIVE`, never `PASS`.

---

## §0 Why (user, 2026-10-06)
> *"a more powerful toolset that helps to debug easily whenever Claude AI is not available or tokens run
> out, this is the next best thing to use"* … *"like extensions to an IDE. make it into a set where devs can
> then install it as how usually such plugins are installed."*

The codebase already avoids Java/build-setup pain, but runtime debugging is hard for a new dev: state is
spread over 3 service workers, IndexedDB/OPFS, SQLite DBs and `§` console lines. Today the thing that
reads all of that and says "here is the bug" is Claude. This toolset is the non-AI substitute: **each tool
answers one question a dev would otherwise ask Claude.**

## §1 Measured baseline (bim-ootb `origin/main` @ fb183ddf, 2026-10-06)
| Fact | Value | Source |
|---|---|---|
| JS files in `viewer/` + `erp/` | 976 | `git ls-tree` |
| `console.log` calls carrying a `§` tag | ~5,040 | `git grep -c "console.log(.§"` |
| Distinct `§TAG` names | 5,262 | `git grep -hoE "§[A-Z][A-Z0-9_]{2,}"` |
| Top tags | `§CRUD` 190, `§LOAD_FAIL` 174, `§S260` 169, `§KANBAN` 111 | same |
| Service workers (each has its own `CACHE_VERSION`) | 3 — `viewer/sw.js`, `erp/sw.js`, `modeller/sw.js` | `git grep -l "const CACHE_VERSION"` |
| Files touching IndexedDB / OPFS | 42 | `git grep -l "indexedDB.open\|navigator.storage.getDirectory"` |
| Witness scripts | 211 `viewer/tests/witness_*.js` + `witness_kit/contract.js` builder | `ls` |
| Existing VS Code setup | `jsconfig.json`, `types/erp-globals.d.ts`, tasks *Serve repo* + *Lint viewer*, ESLint recommended (#1896) | `.vscode/` |

**What #1896 covers:** editing help (go-to-definition, lint). **What nothing covers yet:** runtime — what
ran, which version ran, what changed between a good and a bad run. That gap is this file's scope.

**Key enabler:** the `§` lines already exist (~5k). Most tools here need **zero new app instrumentation** —
they read what the code already prints.

## §2 The question each tool replaces
| # | Dev's question (what they'd ask Claude) | Tool | Big tool it simplifies |
|---|---|---|---|
| T1 | "Which code printed this, and what happened in order?" | **§-Lens** — log panel grouped by tag, click → file:line | DevTools console + tracing (OpenTelemetry) |
| T2 | "Is my tab even running the new code?" | **Version Doctor** — SW versions, served JS, applied DB patches | DevTools Application tab |
| T3 | "It worked yesterday — what's different?" | **§-Diff** — compare two `§` logs by tag: new / missing / changed values | Log diff + manual bisect |
| T4 | "Which spec rule is this tag about?" | **§-Spec hover** — hover a `§TAG` in code or log → the prompts/docs paragraph that defines it | Asking the AI / grepping docs |
| T5 | "Do the witnesses pass, and did they judge anything?" | **Witness Explorer** — the 211 witnesses in VS Code's Test panel, PASS / FAIL / INCONCLUSIVE | Test-framework setup |
| T6 | "Who owns this value?" | **Owner Trace** — for a 4D question, the owning function from `4D_MODEL_INTEGRITY.md §I` | Profiler / call graph |
| T7 | "What is in the local DB right now?" | **Data peek** — open SQLite / IndexedDB snapshot read-only | DB Browser + IndexedDB inspector |
| T8 | "Let me replay the bug offline" | **Record/Replay** — save inputs + `§` log, replay headless in Node | Replay.io |

## §3 Triage (rank = pain killed ÷ cost)
| Rank | Tool | Pain evidence | Cost | Verdict |
|---|---|---|---|---|
| **P1** | T1 §-Lens | CLAUDE.md PRIMAL LAW §3: "the shipped §-log is PRIMARY EVIDENCE" — but it is unreadable as raw console scroll at ~5k call sites | S–M (see §4.1 mechanism) | **BUILD FIRST** |
| **P1** | T2 Version Doctor | Memory: "stale tab serves stale JS" — recurring false defects (CPE resume 2026-09-01; `AGENT_QUEUE.md` "check the INSTRUMENT before believing the defect") | S | **BUILD FIRST** |
| **P1** | T3 §-Diff | Every regression hunt is a good-vs-bad comparison; today done by eye or by Claude | S (pure text over two log files) | **BUILD FIRST** |
| P2 | T4 §-Spec hover | 5,262 tags; their meaning lives in `prompts/*.md` + `docs/`, which only Claude reads fluently | S (index tag → file:heading) | build second |
| P2 | T5 Witness Explorer | 211 witnesses run by hand; INCONCLUSIVE rule (PRIMAL LAW §4) not visible | M (needs a summary-line contract — §4.5) | build second |
| P3 | T6 Owner Trace | Real (5 re-derivations in 2 sessions) but covers 4D only; needs §I as data, not prose | M | park until §I is machine-readable |
| P3 | T7 Data peek | **Existing extensions already do SQLite** (e.g. SQLite viewers on Open VSX) | — | **don't build** — recommend one in the pack; IndexedDB part rides on T2's page bridge |
| P3 | T8 Record/Replay | Highest power, highest cost; app state (WebGL, SW, OPFS) is hard to replay faithfully | L | park; revisit after T1–T3 are used |

## §4 Specs for P1/P2 (draft — not locked)

### §4.1 T1 §-Lens
- **Input A (live):** VS Code's built-in JS debugger (`js-debug`, launch config *Chrome: serve + debug*).
  The extension registers a debug-adapter tracker and reads DAP `output` events — these carry the
  console text **and** `source`/`line`, so click-to-source needs no app change.
  ⚠ **Spike S0 must confirm** that js-debug fills `source`/`line` for `console.log` in a page script.
  If it does not, fall back to Input B only.
- **Input B (offline):** a saved log file (`*.log`, e.g. `~/.cache/bim4d/*/witness.log`, any `node … > x.log`).
- **View:** tree `TAG → count → lines` in time order; filter box; a red badge on lines matching
  `INCONCLUSIVE|VACUOUS|NO-OP|FAIL|§LOAD_FAIL`.
- **Witness `§DEVTK_LENS`:** feed a fixture log with known tags and line numbers → assert counts per tag
  and file:line per line. Red control: shuffle the line numbers → the witness must FAIL.
  *Issue it proves:* a dev can get from a `§` line to the code that printed it with one click.

### §4.2 T2 Version Doctor
- **Reads:** for each of the 3 apps — `CACHE_VERSION` in the `sw.js` on disk vs what the running tab's
  active service worker reports; plus the list of `patches/*.sql` the self-heal loader applied
  (`viewer/scene.js` `A._applyPendingPatch`, Modeller `str_walker_outliner.js`).
- **Needs one tiny page bridge** (opt-in, `?devtk=1`): the page answers a `postMessage` with
  `{app, swVersion, patchesApplied}`. This is the only app-side code in P1. Spec it beside the loader.
- **Output:** one status line per app: `viewer  disk v1595 · tab v1589  ✗ STALE — hard-reload`.
- **Witness `§DEVTK_VERSION`:** serve the repo, load the page with an old SW registered → must report
  STALE; reload → must report MATCH. Red control: fake equal versions → must not report STALE.
  *Issue it proves:* "stale tab" is caught before it is mistaken for a code bug.

### §4.3 T3 §-Diff
- **Input:** two log files (good, bad) — from §-Lens "save log", from `cache_4d_run.js`, or any witness log.
- **Output:** per tag: `only in good`, `only in bad`, `count changed`, `value changed` (numbers in the line
  compared field by field, e.g. `§TPL_LAYER_SELFCHECK moved=0` vs `moved=12`). Sorted: missing tags first.
- **Ships also as a CLI** (`node devtools/sdiff.js good.log bad.log`) so it works with no IDE at all.
- **Witness `§DEVTK_DIFF`:** two fixture logs with 3 planted differences → exactly those 3 reported.
  Red control: identical logs → must print `INCONCLUSIVE no differences`, not PASS-with-findings.

### §4.4 T4 §-Spec hover
- Build an index `TAG → [file:heading]` by grepping `prompts/*.md` and `docs/**/*.md` (bim-ootb + bim-compiler
  if present). Hover shows the paragraph; "no spec found" is shown as such (that itself is a finding).
- **Witness `§DEVTK_SPEC`:** a tag known to be in `4D_MODEL_INTEGRITY.md` resolves there; a made-up tag
  resolves to "none".

### §4.5 T5 Witness Explorer
- Uses VS Code's Testing API. Discovers `viewer/tests/witness_*.js`, runs each in Node, parses its
  `§WITNESS_<NAME>` summary (the line `witness_kit/contract.js` prints).
- **Gap to close first:** only witnesses built on `contract.js` print a uniform summary; hand-rolled ones
  do not. Count how many of the 211 use `contract.js` before building (spike S1). Non-uniform ones show
  as `UNKNOWN`, never green.

## §5 Packaging — install like any other plugin
- **Source:** `bim-ootb/devtools/vscode/` — one folder per extension (`slens/`, `version-doctor/`,
  `sdiff/`, `spec-hover/`, `witness-explorer/`) + `pack/` = an **Extension Pack** (`extensionPack` field in
  its `package.json`) that installs the set in one go, plus a recommended existing SQLite viewer (T7).
- **Build:** `npx @vscode/vsce package` per extension → `.vsix` files.
- **Install (dev, any machine):** VS Code → Extensions → `…` → *Install from VSIX*, or
  `code --install-extension bim-devtools-pack.vsix`. Repo `.vscode/extensions.json` lists the pack, so
  VS Code offers it on first open.
- **Also works in:** VSCodium / Cursor / any Open VSX-based editor (same `.vsix`).
- **No runtime coupling:** nothing in `devtools/` is loaded by a page, except the opt-in `?devtk=1` bridge (§4.2).
- **CLI twins:** T3 and T4 also ship as plain `node` scripts — the "no IDE at all" fallback.

## §6 Spikes before locking (each ends in a `§` line, not an opinion)
| Spike | Question | Decides |
|---|---|---|
| S0 | Does js-debug give `source`/`line` on page `console.log` output events? | T1 live mode vs file-only |
| S1 | How many of 211 witnesses print a `contract.js` summary? | T5 scope |
| S2 | Can the running tab report its active SW version to an outside caller without the bridge? | whether §4.2 needs app code at all |

## §7 Open decisions (user's call)
- ⛔ **Publish publicly** to Open VSX / VS Code Marketplace, or keep `.vsix` in GitHub Releases only?
  (Publishing is outward-facing; default until answered = GitHub Releases.)
- ⛔ **Name** of the pack (working name: *BIM DevTools*).

## §8 Status
| Item | State |
|---|---|
| Triage (§2–§3) | ✅ written 2026-10-06 |
| P1 specs §4.1–§4.3 | draft — lock after S0, S2 |
| P2 specs §4.4–§4.5 | draft — lock after S1 |
| Packaging §5 | draft |
| Implementation | not started |
