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
| T9 | "What is the canvas actually showing?" | **Scene Snapshot** — the render state as numbers (JSON), diffable with T3 | Screenshot / eyeballing the canvas |

## §3 Triage (rank = pain killed ÷ cost)
| Rank | Tool | Pain evidence | Cost | Verdict |
|---|---|---|---|---|
| **P1** | T1 §-Lens | CLAUDE.md PRIMAL LAW §3: "the shipped §-log is PRIMARY EVIDENCE" — but it is unreadable as raw console scroll at ~5k call sites | S–M (see §4.1 mechanism) | **BUILD FIRST** |
| **P1** | T2 Version Doctor | Memory: "stale tab serves stale JS" — recurring false defects (CPE resume 2026-09-01; `AGENT_QUEUE.md` "check the INSTRUMENT before believing the defect") | S | **BUILD FIRST** |
| **P1** | T3 §-Diff | Every regression hunt is a good-vs-bad comparison; today done by eye or by Claude | S (pure text over two log files) | **BUILD FIRST** |
| **P1** | T9 Scene Snapshot | PRIMAL LAW §1 + FUNDAMENTAL LAW: screenshots are not proof — but devs still need to know what the canvas shows. Numbers give both | S (rides on T2's bridge) | **BUILD FIRST** (user agreed 2026-10-06) |
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

- **Localhost freshness finding (2026-10-06, read from `origin/main` `sw.js` ×3):** the service workers
  have **no localhost bypass**. Precached files are cache-first everywhere (`viewer/sw.js:1200`,
  `modeller/sw.js:121`; `erp/sw.js:11`). So on `localhost:8000`, **save + reload can serve the OLD file**
  until `CACHE_VERSION` is bumped. Serving from the working tree is live for network-first files only.
  Spec options, pick one at lock: (a) the dev launch config starts Chrome with the SW bypassed
  (no app change); (b) a `?nosw` / localhost rule in the 3 `sw.js` (app change, 3 files).
  Version Doctor must flag this case per file: `disk newer than served → STALE (SW cache)`.

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

### §4.6 T9 Scene Snapshot (user agreed 2026-10-06)
- **What:** one command in VS Code → the running tab (via the `?devtk=1` bridge, §4.2) returns JSON:
  camera position / target / angle, objects loaded vs visible, model bounding box, draw calls, vertex
  count, heap (`performance.memory`), active app + building, 4D frame / time position.
- **Use:** saved next to the `§` log; compared with T3 (`visible 1,204 vs 3,880`). Numbers are the truth.
- **Thumbnail (optional):** a small canvas image saved beside the JSON, labelled *view only, not evidence*.
  It is never what a witness asserts on. Existing pixel-diff witnesses stay the only place pixels become
  a number.
- **Field list is extracted, not invented:** each field must name the existing object it reads (e.g. the
  viewer's camera / renderer `info`) at spec lock — spike S3.
- **Witness `§DEVTK_SCENE`:** load a known building at a fixed camera → visible count and bbox match a
  stored baseline. Red control: move the camera → the snapshot must differ.
  *Issue it proves:* a dev can state what the canvas shows as numbers, without a screenshot.

## §5 Packaging — install like any other plugin
- **Source:** `bim-ootb/devtools/vscode/` — one folder per extension (`slens/`, `version-doctor/`,
  `sdiff/`, `scene-snapshot/`, `spec-hover/`, `witness-explorer/`) + `pack/` = an **Extension Pack** (`extensionPack` field in
  its `package.json`) that installs the set in one go, plus a recommended existing SQLite viewer (T7).
- **Build:** `npx @vscode/vsce package` per extension → `.vsix` files.
- **Install (dev, any machine):** VS Code → Extensions → `…` → *Install from VSIX*, or
  `code --install-extension bim-devtools-pack.vsix`. Repo `.vscode/extensions.json` lists the pack, so
  VS Code offers it on first open.
- **Also works in:** VSCodium / Cursor / any Open VSX-based editor (same `.vsix`).
- **No runtime coupling:** nothing in `devtools/` is loaded by a page, except the opt-in `?devtk=1` bridge (§4.2).
- **CLI twins:** T3 and T4 also ship as plain `node` scripts — the "no IDE at all" fallback.

## §9 Framework-specific tools (user agreed all, 2026-10-06)
Tools only THIS codebase needs — each makes a written rule (CLAUDE.md / memory) visible or checkable.
| # | Tool | Rule it enforces / pain | Rank |
|---|---|---|---|
| T10 | **Doctrine Lint** — custom ESLint rules: per-window `if (table==='c_order')` in the AD engine; wrapping/silencing `console.log` around pipeline calls; `dwInit` without `duplex_rules.db` on a residential path; edits to `bar_model.js`; `oci os object put` without `--content-type` | AD-LAYER LAW 1, PRIMAL LAW §3, Walker Doctrine, OCI MIME rule — the drift Claude is reminded of most | **P1** |
| T11 | **AD Sweep panel** — reads `ad_seed.db`, runs the generic grid invariants over every AD window → `X of N pass`; click a window → its AD_Tab/AD_Field/DisplayLogic rows | AD-LAYER LAW 2–3 (invariant × denominator) | **P1** |
| T12 | **Patch Ledger** — every `patches/*.sql` / `migration/*.sql`, applied-or-not on this client, dry-run on a DB copy | DB CHANGES = patch + self-heal loader | **P1** |
| T13 | **Precache Auditor** — every file a page loads is in its `sw.js` precache list; `sw.js` merge helper (keep both additions, higher `CACHE_VERSION`) | `§OFFLINE-GATEWAY-LEAK` class; `sw.js` = conflict magnet | P2 |
| T14 | **Witness Lint** — a witness with no red control or no INCONCLUSIVE path is flagged | PRIMAL LAW §4; `contract.js` §W-REDCONTROL | P2 |
| T15 | **Gantt Edit Chain view** — one bar edit → timeline delta → recomputed projections → persisted → judge re-score, each as numbers | PRIMAL LAW §2 | P2 |
| T16 | **4D Cache browser** — `~/.cache/bim4d/` per building: `witness.log`, `run.json`, cache key fresh/stale | PRIMAL LAW §5 (run once, read forever) | P2 |
| T17 | **Worktree panel** — ahead / dirty / occupied per worktree, prune-safe button | Worktree Hygiene closeout rule | P2 |
| T20 | BOM tree browser (building → floor → room → leaf) | BOM PRINCIPLE | P3 |
| T21 | Perf budget tracker — heap + verts per pass from `§` lines over time | PERF BUDGET (0.17 GB / M verts) | P3 |

## §10 T18 JSON — schemas, not a second editor
- **The app already has ONE JSON editor:** `viewer/settings_editor.js` (PR #57) with
  `SettingsEditor.jsonToSchema()` (infers a schema from any project JSON). Do NOT build another.
- **IDE side = feed VS Code's built-in JSON editor real schemas.** A script runs `jsonToSchema` (plus the
  same overrides the app uses) over the project JSONs → `devtools/schemas/*.schema.json`, mapped in
  `.vscode/settings.json` `json.schemas`. Result: autocomplete + red squiggle on a bad key/value in
  `4D_template.json`, `grid_rules`, `clash_rules`, `corporate`, … — same rules in the app and the IDE.
- 129 non-package JSON files on `origin/main`; spike S4 lists which ones are app-consumed (schema-worthy).
- **Witness `§DEVTK_JSON`:** a known-good JSON validates; a planted wrong type fails; a schema regenerated
  from the same file is byte-identical (no drift between app and IDE).

## §11 T19 Local-First Health Monitor
One panel (and a CLI twin over exported DB files) that answers: **"is this browser's local data healthy,
and how close is it to breaking?"** Each check is a known failure of THIS architecture, with its source.
| Check | Why it matters here | Source / current state (origin/main, 2026-10-06) |
|---|---|---|
| **Eviction protection** — `navigator.storage.persisted()` per app | Browser can wipe local data (Safari ~7 days) | `erp/DistributedERP.md:323`. `persist()` is requested in `erp/erp_persist.js` and `viewer/scene.js`; **no call found in `modeller/`** |
| **Quota** — `navigator.storage.estimate()` usage / quota | Imports of big buildings fill storage silently | **No `estimate()` call found in app code** — nobody watches it today |
| **IDB record size** vs ~1,042 MB structured-clone limit | `§MULTI_DB_ERROR The structured clone is too large` (172K-element import) | memory `project_import_idb_limit`; fixed by split-only storage, guard by `§WB_IDB_OVERFLOW` |
| **Split vs monolith** — record has meta+geo, monolith null; flag consumers that expect monolith | Export / compare / merge must handle null db | same memory (`§EXPORT_DB_SPLIT`, `§MERGE_BLOCK_SPLIT`) |
| **Save cost** — last save bytes + seconds | Whole-DB rewrites scale with model size; `runSave()` 57 s never profiled | PERF BUDGET "save deltas, not the DB"; CLAUDE.md WORK-TO-ZERO item (1) |
| **SQLite integrity** — `PRAGMA integrity_check`, `foreign_key_check`, `user_version` vs expected | A corrupt or half-patched local DB looks like an app bug | **No `integrity_check` call in app code** today |
| **Patch drift** — applied patches vs shipped (T12) | Client DB older than the code reading it | self-heal loader convention |
| **Op-log replay hash** (ERP) — export → replay → hash equal | Local ledger is the truth until synced | `W-PERSIST`, `erp/ERP.md:1132` |
| **Multi-tab** — how many tabs hold the same DB; who writes | Two tabs writing one local DB = lost update | `BroadcastChannel`/locks appear in `common/history_bar.js`, `common/whole_history.js`, `erp/ad_ui.js`, `erp/crud_overlay.js` — **coverage across writers unknown, spike S5** |
| **Heap vs verts** — `performance.memory` vs 0.17 GB / M verts | Memory, not draw speed, is the tab's limit (phones ~0.6 GB) | PERF BUDGET, `docs/BrowserScaleBenchmark.md` |
| **Version match** — SW / served JS / disk (T2) | Stale tab mistaken for a code bug | §4.2 |
- **Output:** one line per check: `OK` / `WARN <number vs limit>` / `FAIL` / `INCONCLUSIVE <why not measured>`.
- **Reads via the same `?devtk=1` bridge as T2/T9** — one bridge, read-only, opt-in. No write path.
- **Witness `§DEVTK_HEALTH`:** planted cases — DB with a broken FK, oversized record, unpersisted storage,
  stale patch → each reported as the matching WARN/FAIL; a clean fixture → all OK. Red control: disable
  one check → the witness must notice the missing line.
- **Real gaps already found by this triage** (not tool work — real app findings, owner lanes to decide):
  modeller has no `persist()`; no app code watches quota; no app code runs `integrity_check`.

## §6 Spikes before locking (each ends in a `§` line, not an opinion)
| Spike | Question | Decides |
|---|---|---|
| S0 | Does js-debug give `source`/`line` on page `console.log` output events? | T1 live mode vs file-only |
| S1 | How many of 211 witnesses print a `contract.js` summary? | T5 scope |
| S4 | Which of the 129 JSON files are read by app code? | T18 schema list |
| S5 | Which local-DB writers coordinate across tabs (locks / BroadcastChannel), which don't? | T19 multi-tab check |
| S3 | Which existing viewer/erp/modeller objects hold each T9 field? | T9 field list |
| S2 | Can the running tab report its active SW version to an outside caller without the bridge? | whether §4.2 needs app code at all |

## §7 Open decisions (user's call)
- ⛔ **Publish publicly** to Open VSX / VS Code Marketplace, or keep `.vsix` in GitHub Releases only?
  (Publishing is outward-facing; default until answered = GitHub Releases.)
- ⛔ **Name** of the pack (working name: *BIM DevTools*).

## §8 Status
| Item | State |
|---|---|
| Triage (§2–§3) | ✅ written 2026-10-06 |
| P1 specs §4.1–§4.3, §4.6 | draft — lock after S0, S2, S3 |
| P2 specs §4.4–§4.5 | draft — lock after S1 |
| §9 framework tools T10–T17, T20–T21 | triaged, specs to write |
| §10 T18 JSON schemas | draft |
| §11 T19 Health Monitor | draft — lock after S5 |
| Packaging §5 | draft |
| Implementation | not started |
