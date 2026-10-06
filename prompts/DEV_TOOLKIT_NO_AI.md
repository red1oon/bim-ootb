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

The codebase avoids Java/build-setup pain, but runtime debugging is hard for a new dev: state is spread
over 3 service workers, IndexedDB/OPFS, SQLite DBs and `§` console lines. Today the thing that reads all
of that and says "here is the bug" is Claude. This toolset is the non-AI substitute.

**Design rule (review 2026-10-06, user agreed):** what Claude really adds is *knowing which thing to look
at first*. So the toolset is **a playbook (§3) + 5 extensions on 3 shared engines (§2, §4)** — not 24
separate tools. Fewer things to install, fewer things to keep working when no AI is around to fix them.

## §1 Measured baseline (bim-ootb `origin/main` @ fb183ddf, 2026-10-06)
| Fact | Value | Source |
|---|---|---|
| JS files in `viewer/` + `erp/` | 976 | `git ls-tree` |
| `console.log` calls carrying a `§` tag | ~5,040 | `git grep -c "console.log(.§"` |
| Distinct `§TAG` names | 5,262 | `git grep -hoE "§[A-Z][A-Z0-9_]{2,}"` |
| Top tags | `§CRUD` 190, `§LOAD_FAIL` 174, `§S260` 169, `§KANBAN` 111 | same |
| Service workers (each own `CACHE_VERSION`) | 3 — `viewer/sw.js`, `erp/sw.js`, `modeller/sw.js` | `git grep -l "const CACHE_VERSION"` |
| Files touching IndexedDB / OPFS | 42 | `git grep -l "indexedDB.open\|navigator.storage.getDirectory"` |
| Witness scripts | 211 `viewer/tests/witness_*.js` + `witness_kit/contract.js` | `ls` |
| Project JSON files (non-package) | 129 | `git ls-tree` |
| Files reading `_isMobile` | 25 | `git grep -c _isMobile` |
| Existing VS Code setup | `jsconfig.json`, `types/erp-globals.d.ts`, tasks *Serve repo* + *Lint viewer*, ESLint recommended (#1896) | `.vscode/` |

#1896 covers **editing** (go-to-definition, lint). Nothing covers **runtime** — what ran, which version
ran, what changed between a good and a bad run. **Key enabler:** the ~5k `§` lines already exist; most
tools read what the code already prints.

## §2 Master table — 5 extensions × 3 engines
Engines: **E1 Log** (parses `§` lines) · **E2 Bridge** (reads the running tab, §4.2) · **E3 Static**
(parses source with ESLint's parser — one parser for every code scan, no regex scans).
| Ext | Tool | Dev's question | Engine | Rank | Spec |
|---|---|---|---|---|---|
| **X1 §-Lens** | T1 Log panel — grouped by tag, click → file:line | "Which code printed this?" | E1 | **P1** | §5.1 |
| | T3 §-Diff (+ CLI) — good vs bad log, by tag | "Worked yesterday — what changed?" | E1 | **P1** | §5.2 |
| | T4 Spec hover — `§TAG` → its prompts/docs paragraph (+ CLI) | "What rule is this tag about?" | E1 | P2 | §5.3 |
| | T21 Perf-budget history — heap + verts per pass over runs | "Is this pass getting heavier?" | E1 | P3 | §5.4 |
| **X2 Live Doctor** | T2 Version Doctor — SW / served JS / disk / patches | "Is my tab running the new code?" | E2 | **P1** | §5.5 |
| | T9 Scene Snapshot — render state as JSON | "What is the canvas showing?" | E2 | **P1** | §5.6 |
| | T19 Local-First Health — 11 checks | "Is local data healthy / near breaking?" | E2 | P2 | §5.7 |
| | T24 Mobile Perf + memory-hog list | "Is the phone keeping up? Who eats memory?" | E2 + E1 | P2 | §5.8 |
| | T7 Data peek — IndexedDB via bridge; SQLite via an existing extension | "What is in the local DB?" | E2 | P3 | recommend, don't build |
| **X3 Maps** | T22 Offline Map — P / R / N / S per file | "Does this work with the network cut?" | E3 | P2 | §5.9 |
| | T23 Platform Map — B / D / M per file + feature | "Is this on mobile, desktop or both?" | E3 | P2 | §5.10 |
| | T13 Precache Auditor + `sw.js` merge helper | "Is every loaded file precached?" | E3 | P2 | shares §5.9 parser |
| | T12 Patch Ledger — shipped vs applied, dry-run | "Is the local DB older than the code?" | E3 + E2 | **P1** | §5.11 |
| **X4 Rules** | T10 Doctrine Lint (JS rules only) | "Am I breaking a project law?" | E3 | **P1** | §5.12 |
| | T14 Witness Lint — no red control / no INCONCLUSIVE path | "Can this witness fail?" | E3 | P2 | §5.12 |
| | T18 JSON schemas from `settings_editor.js` | "Is this JSON valid for the app?" | — | P2 | §5.13 |
| **X5 Workflow** | T5 Witness Explorer — Test panel, PASS / FAIL / INCONCLUSIVE / UNKNOWN | "Do witnesses pass, did they judge anything?" | E1 | P2 | §5.14 |
| | T11 AD Sweep viewer — reads `W-GRIDTAB-LIVE` output, X of N windows | "Which ERP windows fail?" | E1 | P2 | §5.15 |
| | T15 Gantt Edit Chain — one bar edit → each step as numbers | "Did my bar edit propagate?" | E1 | P2 | §5.16 |
| | T16 4D Cache browser — `~/.cache/bim4d/` | "What did the last run say?" | E1 | P2 | §5.16 |
| | T17 Worktree panel — ahead / dirty / occupied, prune-safe | "Which worktrees can go?" | — | P3 | §5.16 |
| | T20 BOM tree browser | "What is under this floor/room?" | — | P3 | later |
| — | T6 Owner Trace (4D) | "Who owns this value?" | — | parked | until `4D_MODEL_INTEGRITY.md §I` is data |
| — | T8 Record / Replay | "Replay the bug offline" | — | parked | after first slice is in use |

**Cut from scope (review 2026-10-06):** Doctrine Lint does not check `oci os object put` (shell, not JS —
belongs to a shell pre-commit check) nor `bar_model.js` edits (a hook already blocks them).
AD Sweep does **not** run its own sweep — `W-GRIDTAB-LIVE` (ERP lane, `ERP_IDEMPIERE_UX_PARITY.md §GT.4`)
already does; X5 only shows its result.

## §3 Playbook — symptom → steps (ships inside the pack, highest value)
A command palette entry *BIM: What's wrong?* → pick a symptom → the steps open the right tool in order.
Each step names the tool and the `§` tags / numbers to read. **Draft list — each row must be checked
against a real past incident before lock (spike S9):**
| Symptom | Steps |
|---|---|
| Blank / empty canvas | T2 Version (stale?) → T19 Health (quota, record size) → T1 filter `§LOAD_FAIL` → T9 Snapshot (loaded vs visible) |
| "It worked yesterday" | Save today's log → T3 §-Diff vs last good log (or the T16 cached run) → missing tags first |
| My change doesn't show | T2 Version — `disk newer than served` = SW cache (§5.5 localhost finding), not your code |
| Slow / janky on phone | T24 on the real device → hog list → T23 is the feature desktop-only by design? |
| Broken offline | T22 Offline Map for that page → the N files are the cause |
| ERP window wrong | T11 AD Sweep — is it one window or all (generic layer, AD-LAYER LAW) |
| 4D bar edit wrong | T15 Edit Chain — which step's number did not move |
| Data lost / odd after reload | T19 Health (eviction, multi-tab, patch drift) → T12 Patch Ledger |
| Witness green but feature broken | T5 — INCONCLUSIVE / UNKNOWN? → T14 Witness Lint (no red control?) |

## §4 Engines
### §4.1 E1 Log engine
- Input A (live): VS Code's JS debugger (`js-debug`) — a debug-adapter tracker reads DAP `output` events
  (text + `source`/`line`). ⚠ **Spike S0** confirms js-debug fills `source`/`line` for page `console.log`;
  if not, file mode only.
- Input B (file): any saved log (`~/.cache/bim4d/*/witness.log`, `node … > x.log`, a saved X1 session).
- One parser: `§TAG` + `key=value` fields + numbers. Used by T1, T3, T4, T5, T11, T15, T16, T21, T24.
- Badges on `INCONCLUSIVE|VACUOUS|NO-OP|FAIL|§LOAD_FAIL`.
- Values come from `§` lines even when a Playwright run produced them (CLAUDE.md: Playwright for wiring,
  `§` lines for values).

### §4.2 E2 Page bridge — the ONLY app-side code, so it has its own rules
- **Off unless asked:** loads only with `?devtk=1` in the URL. Without it, zero code runs (witness proves).
- **Read-only:** answers queries; no write, no eval, no "run this" message type.
- **Origin check:** answers only the dev origin it was opened for (`localhost` / the VS Code debug
  session). Phone over LAN: needs an explicit pairing token shown on the phone screen.
- **One message shape** `{app, query}` → `{app, query, data, ts}`. Queries: `version`, `scene`, `health`,
  `perf`, `idb`.
- **Witness `§DEVTK_BRIDGE`:** without `?devtk=1` → no listener exists; with it, a wrong origin gets no
  answer; a write-shaped message is refused. Red control: drop the origin check → witness must FAIL.
- Spike **S2**: can the tab's active SW version be read from outside without the bridge? If yes, T2 needs
  no app code.

### §4.3 E3 Static engine
- Parses JS with ESLint's parser (already recommended by #1896) — one AST, shared by T10, T12, T13, T14,
  T22, T23. Reads `sw.js` lists, `_isMobile` branches, `fetch(`/`<script src>` hosts, patch files.
- Output is a **claim**. Every X3 map has a witness that runs the real thing and compares (§5.9, §5.10).

## §5 Tool specs (draft — not locked)
### §5.1 T1 Log panel
Tree `TAG → count → lines` in time order; filter; click → file:line. **Witness `§DEVTK_LENS`:** fixture log
with known tags + lines → counts and file:line match. Red control: shuffle line numbers → FAIL.
### §5.2 T3 §-Diff
Two logs → per tag: only-in-good, only-in-bad, count changed, value changed (field by field, e.g.
`moved=0` vs `moved=12`); missing tags first. CLI: `node devtools/sdiff.js good.log bad.log`.
**Witness `§DEVTK_DIFF`:** 3 planted differences → exactly 3 reported. Red control: identical logs →
`INCONCLUSIVE no differences`.
### §5.3 T4 Spec hover
Index `TAG → file:heading` over `prompts/*.md` + `docs/**/*.md` (both repos if present); "no spec found"
shown as such. **Witness `§DEVTK_SPEC`:** a tag known in `4D_MODEL_INTEGRITY.md` resolves there; a made-up
tag → none.
### §5.4 T21 Perf-budget history
Rows `pass · verts added · heap delta` from `§` lines across saved runs. Passes without these fields →
`UNMEASURED` (the to-do list for the PERF BUDGET rule).
### §5.5 T2 Version Doctor
Per app: `CACHE_VERSION` on disk vs the tab's active SW; patches applied (`viewer/scene.js`
`A._applyPendingPatch`, Modeller `str_walker_outliner.js`). Output: `viewer disk v1595 · tab v1589 STALE`.
- **Localhost finding (origin/main `sw.js` ×3):** no localhost bypass; precached files are cache-first
  (`viewer/sw.js:1200`, `modeller/sw.js:121`, `erp/sw.js:11`) → on `localhost:8000` save + reload can serve
  the OLD file. First-slice fix (§6): a VS Code launch config that starts Chrome with the SW bypassed — no
  app change. A `sw.js` localhost rule is the owner lane's call (§7).
- **Witness `§DEVTK_VERSION`:** old SW registered → STALE; after reload → MATCH. Red control: fake equal
  versions → never STALE.
### §5.6 T9 Scene Snapshot
JSON: camera position / target / angle, objects loaded vs visible, bbox, draw calls, verts, heap, app +
building, 4D frame. Diffable with T3. Optional thumbnail labelled *view only, not evidence*. Each field
names the object it reads — **spike S3**. **Witness `§DEVTK_SCENE`:** known building + fixed camera → visible
count and bbox match baseline. Red control: move camera → snapshot differs.
### §5.7 T19 Local-First Health
One line per check: `OK` / `WARN <n vs limit>` / `FAIL` / `INCONCLUSIVE <why>`.
| Check | Why here | Source / state (origin/main 2026-10-06) |
|---|---|---|
| Eviction — `storage.persisted()` | Browser may wipe data (Safari ~7 days) | `erp/DistributedERP.md:323`; `persist()` in `erp/erp_persist.js`, `viewer/scene.js`; **none in `modeller/`** |
| Quota — `storage.estimate()` | Big imports fill storage silently | **no `estimate()` in app code** |
| IDB record vs ~1,042 MB clone limit | `§MULTI_DB_ERROR` on a 172K-element import | memory `project_import_idb_limit`, `§WB_IDB_OVERFLOW` |
| Split vs monolith (monolith null) | export / compare / merge must cope | `§EXPORT_DB_SPLIT`, `§MERGE_BLOCK_SPLIT` |
| Save cost — bytes + seconds | whole-DB rewrites; `runSave()` 57 s unprofiled | PERF BUDGET; CLAUDE.md WORK-TO-ZERO (1) |
| SQLite `integrity_check` / `foreign_key_check` / `user_version` | corrupt DB looks like an app bug | **no `integrity_check` in app code** |
| Patch drift | client DB older than code | T12 |
| ERP op-log replay hash | local ledger is truth until synced | `W-PERSIST`, `erp/ERP.md:1132` |
| Multi-tab writers | two tabs, one DB = lost update | BroadcastChannel/locks in `common/history_bar.js`, `common/whole_history.js`, `erp/ad_ui.js`, `erp/crud_overlay.js` — coverage **spike S5** |
| Heap vs verts (0.17 GB / M verts) | memory is the tab limit | PERF BUDGET, `docs/BrowserScaleBenchmark.md` |
| Version match | stale tab ≠ bug | T2 |
**Witness `§DEVTK_HEALTH`:** planted broken FK, oversized record, unpersisted storage, stale patch → each its
WARN/FAIL; clean fixture → all OK. Red control: disable one check → missing line noticed.
### §5.8 T24 Mobile Perf + memory hog
| Signal | Source | Exists? |
|---|---|---|
| Frame time / FPS | `§FPS_MODE mean= max= n=` sampler, `viewer/main.js:707-725` | yes — reuse |
| Input response (INP) | Event Timing | no |
| Long tasks | `PerformanceObserver('longtask')` | no use in app code |
| Heap | `performance.memory` (Chromium) | a few probes (`§MEM_PROBE`, `§NIGHT_MEM_WITNESS`, `§CLASH_MEM`) |
| Verts vs budget | phone ~0.6 GB ≈ 4 M verts (**unverified**) | CLAUDE.md PERF BUDGET |
| `navigator.deviceMemory` | hint | no |
| WebGL context lost | `viewer/scene.js` handler | yes — count it |
Hog list = T21 rows sorted biggest first. Android: USB + bridge pairing; iOS: heap `INCONCLUSIVE (iOS)`.
Desktop throttle labelled `EMULATED`, never a phone number (MOBILE_PERF PRIME RULE). **No invented
thresholds** — numbers only until **spike S8** extracts existing targets. **Witness `§DEVTK_PERF`:** planted
200 ms busy loop + 50 MB allocation → one long task ≥ 200 ms + heap delta ≈ 50 MB on that pass. Red control:
no busy loop → no long task.
### §5.9 T22 Offline Map (+ T13 shares the parser)
| Tier | Meaning | Rule (`viewer/sw.js`; erp/modeller mirror) |
|---|---|---|
| P precached | offline from install | `PRECACHE_ASSETS` / `_PRECACHE_SET` / `CDN_ASSETS` → cache-first (`isNetworkFirst`, ~L1199) |
| R runtime-cached | offline only if opened online once | non-precached `.html/.js/.sql` → `networkFirst()` stores it (~L1271); `lib/` cache-on-first-use |
| N network-only | breaks offline | no cache rule covers it, or outside SW scope |
| S stored data | offline via app storage | IndexedDB / OPFS (`cachedFetch`) |
Known N/unknown: root Hub `index.html` outside SW scope (`bim-compiler prompts/OFFLINE_HUB_SW_SCOPE_GAP.md`);
external hosts — `cdn.jsdelivr.net` 24, OCI `objectstorage.ap-kulai-2` 9, `raw.githubusercontent.com` 6,
`github.com` 35, `red1oon.github.io` 19 (**spike S6** for OCI S vs N). View: file badges P/R/N, page roll-up,
code lens on external `fetch(` / `<script src>`. **Witness `§DEVTK_OFFLINE`:** load online, `setOffline(true)`
(as `W-OFFLINE-CACHED-CLICK`), reload, list failed requests → must equal the N set. Red control: drop a
file from `PRECACHE_ASSETS` → reported.
### §5.10 T23 Platform Map
Flag owner: `window._isMobile`, `viewer/config.js:12` (touch && `screen.width < 1024`). Code lens `M only` /
`D only` on each branch; file badge B / D / M; feature table (pill / panel / tool). Deliberate splits:
`MOBILE_PERF.md` §SHIPPED STACK, §DELIBERATELY NOT ON MOBILE. **Spike S7:** whole-feature gates vs tweaks.
**Witness `§DEVTK_PLATFORM`:** same building, desktop + phone emulation → `§` tags + panels → T3 diff must
equal the static map. Red control: flip a fixture branch → mismatch reported.
### §5.11 T12 Patch Ledger
Lists `patches/*.sql` + `migration/*.sql`; applied-or-not on this client (bridge); dry-run a patch on a DB
copy. **Witness `§DEVTK_PATCH`:** DB with patch N-1 applied → ledger shows N pending; dry-run applies cleanly
to the copy, original unchanged.
### §5.12 T10 Doctrine Lint + T14 Witness Lint (ESLint plugin `eslint-plugin-bim`)
T10 rules: per-window `table === '<name>'` branch in the AD engine files (AD-LAYER LAW 1); wrapping or
replacing `console.log` around pipeline calls (PRIMAL LAW §3); `dwInit(` without `duplex_rules.db` on a
residential path (Walker Doctrine). T14 rules: witness file with no red control / no INCONCLUSIVE output
(PRIMAL LAW §4, `contract.js` §W-REDCONTROL). **Witness `§DEVTK_LINT`:** one fixture per rule that must
trip it + one clean twin that must not.
### §5.13 T18 JSON schemas
The app's one JSON editor is `viewer/settings_editor.js` (PR #57) with `SettingsEditor.jsonToSchema()`. Do
NOT build another. A script runs it (same overrides as the app) → `devtools/schemas/*.schema.json`, mapped in
`.vscode/settings.json` `json.schemas`. **Spike S4:** which of 129 JSONs the app reads. **Witness
`§DEVTK_JSON`:** good file validates; planted wrong type fails; regenerated schema byte-identical.
### §5.14 T5 Witness Explorer
VS Code Testing API; runs `viewer/tests/witness_*.js` in Node; parses the `§WITNESS_<NAME>` summary from
`contract.js`. Hand-rolled witnesses without it → `UNKNOWN`, never green. **Spike S1:** how many of 211 use
`contract.js`.
### §5.15 T11 AD Sweep viewer
Reads the `W-GRIDTAB-LIVE` sweep output (ERP lane) → `X of N windows`, failing list, click → that window's
AD_Tab / AD_Field / DisplayLogic rows from `ad_seed.db`. No second sweep.
### §5.16 T15 / T16 / T17
T15: one bar edit → `witness_gantt_edit_coherence` chain steps as numbers (timeline delta → projections →
persisted → judge). T16: `~/.cache/bim4d/` per building, cache key fresh/stale vs the hashed source files.
T17: worktree ahead / dirty / occupied (`/proc/*/cwd`), prune only when all three are clear.

## §6 First slice (build in this order)
1. **Playbook skeleton** (§3) — palette entry + the 9 symptom rows, each opening what exists so far.
2. **Localhost freshness** — launch config: Chrome with SW bypassed for `localhost:8000` (no app change).
3. **T3 §-Diff CLI** — no IDE, no bridge; works today on any two logs.
4. **T2 Version Doctor** — via S2 result: no-bridge read if possible, else bridge §4.2 with its witness.
Then X1 panel (T1), then the rest by rank.

## §7 App findings from this triage → owner lanes (not tool work)
| Finding | Evidence | Owner | Handed off |
|---|---|---|---|
| SW has no localhost bypass — save + reload can show old code | `viewer/sw.js:1200`, `modeller/sw.js:121`, `erp/sw.js:11` | Offline/PWA lane | `OFFLINE_HUB_SW_SCOPE_GAP.md` §2026-10-06 |
| Two different `_isMobile` definitions | `viewer/config.js:12` vs `viewer/effects.js:52`, `effects_gi_poc.js:14` | Mobile perf | `MOBILE_PERF.md` §2026-10-06 |
| Modeller never calls `navigator.storage.persist()` | grep `modeller/` | Modeller | `MODELLER_MASTER.md` §2026-10-06 |
| No app code watches quota (`storage.estimate`) | grep | ⛔ no owner lane — user picks | — |
| No app code runs SQLite `integrity_check` | grep | ⛔ no owner lane — user picks | — |

## §8 Packaging — install like any other plugin
- Source `bim-ootb/devtools/vscode/`: `x1-slens/`, `x2-live-doctor/`, `x3-maps/`, `x4-rules/` (also usable
  as plain `eslint-plugin-bim`), `x5-workflow/`, `engines/` (E1–E3, shared), `pack/` = Extension Pack
  (`extensionPack` in `package.json`) + one recommended existing SQLite viewer.
- Build `npx @vscode/vsce package` → `.vsix`. Install: *Extensions → … → Install from VSIX* or
  `code --install-extension bim-devtools-pack.vsix`. `.vscode/extensions.json` recommends the pack.
- Works in VSCodium / Cursor / Open VSX editors (same `.vsix`).
- Nothing in `devtools/` loads in a page except the opt-in bridge (§4.2).
- CLI twins (no IDE): T3 §-Diff, T4 Spec lookup, T19 Health over exported DB files, X4 via `npx eslint`.

## §9 Spikes before lock (each ends in a `§` line)
| Spike | Question | Decides |
|---|---|---|
| S0 | js-debug gives `source`/`line` on page `console.log`? | E1 live vs file-only |
| S1 | How many of 211 witnesses use `contract.js`? | T5 scope |
| S2 | Tab's active SW version readable without the bridge? | T2 needs app code or not |
| S3 | Which objects hold each T9 field? | T9 field list |
| S4 | Which of 129 JSONs the app reads? | T18 list |
| S5 | Which DB writers coordinate across tabs? | T19 multi-tab |
| S6 | Does `cachedFetch` store every OCI building fetch? | T22 OCI S vs N |
| S7 | `_isMobile` gates: whole feature vs tweak? | T23 roll-up |
| S8 | Existing FPS / frame-ms / heap targets in MOBILE_PERF + `§FPS_MODE` lane? | T24 thresholds |
| S9 | Each playbook row matched to a real past incident? | §3 lock |

## §10 Open decisions (user's call)
- ⛔ Publish to Open VSX / Marketplace, or `.vsix` in GitHub Releases only? Default until answered: Releases.
- ⛔ Pack name (working: *BIM DevTools*).
- ⛔ Owner for the quota and `integrity_check` findings (§7).

## §11 Status
| Item | State |
|---|---|
| Triage + review restructure (§2) | ✅ 2026-10-06 — 24 tools → 5 extensions × 3 engines |
| Playbook §3 | draft — lock after S9 |
| Engines §4 | draft — lock after S0, S2 |
| Tool specs §5 | draft — each locks after its spike |
| Findings §7 | 3 handed off, 2 need an owner |
| Implementation | not started — first slice §6 |
