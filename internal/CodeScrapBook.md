# Code Scrap Book — the 101 of this codebase

> Orientation notes for reading BIM OOTB, written for someone with a Java /
> iDempiere plugin background. Not a spec, not API docs — a map you can hold in
> your head so no question from another dev catches you flat.
>
> Every number here was measured from the tree, not estimated. Re-measure with
> the commands in [Re-measure](#re-measure) when it drifts.
> Last measured: 2026-09-12 @ `719ebb92`.

---

> **Consolidated 2026-09-14: 1,993 → ~700 lines.** The finished arguments and one-off
> analyses moved to `internal/archive/CodeScrapBook_archive_2026-09-14.md` (1,306 lines):
> where this shape comes from, the named debates, sum-not-units, the iDempiere pick-up
> comparison, the theory behind the patterns, the error/cache/SQL patterns, duplication,
> WebAssembly, cross-origin isolation, why this tree can skip a layer, and rot measured.
> Nothing there is waiting on a decision — read it only for the reasoning behind a number.
> **This file keeps orientation, the open register, and the re-measure commands.**
>
> **Consolidate again on sight past ~1,200 lines — don't wait to be asked.**

## 0. The one-line version

**There is no framework.** No build step, no module system, no dependency
injection, no container. 1,684 `.js` files loaded as plain `<script>` tags into
one global object. If you are looking for the OSGi layer, the `MANIFEST.MF`, the
service registry — they do not exist, and that absence *is* the architecture.

---

## 1. How it loads — script order is the dependency graph

| entry | `<script>` tags |
|---|---|
| `viewer/viewer.html` | **177** |
| `modeller/modeller.html` | 50 |
| `erp/erp.html` | 16 |
| `index.html` (shell/loader) | 11 |

`index.html` is only a shell — it loads the locale, the kernel and the import
builder, then hands off. The real viewer boot is `viewer/viewer.html`.

Load order in that file is literal and load-bearing:

```
loader.js → config.js → db_resolve.js → effects.js → cinema_path_editor.js
→ scene.js → streaming.js → panels.js → tools.js → picking.js
→ cpe_*.js (camera/film) → clash_*.js → *_sanity.js → rule_checklist.js → …
```

**Zero `import` / `export` statements in `viewer/*.js`.** Move a `<script>` tag
above its dependency and the app breaks at runtime with an undefined global. The
HTML file is the closest thing to a build manifest.

### Java translation
| you know | here |
|---|---|
| OSGi bundle + `Import-Package` | position of a `<script>` tag |
| `MANIFEST.MF` | `viewer/viewer.html` |
| `@Inject` / service lookup | `window.Foo` being assigned by an earlier script |
| Maven/Tycho build | none — the files *are* the deploy artifact |

---

## 2. `window.APP` — the one god object

Born in a single line:

```js
// viewer/main.js:10
const APP = window.APP = {};
```

It now carries **165 distinct fields**, assigned from all over the tree. It is
your `Ctx` + `Env` + service locator + session state, fused.

Roughly three kinds of member:

- **Live scene handles** — `APP.camera`, `APP.controls`, `APP._composer`
- **Data handles** — `APP.db`, `APP.dbQuery(...)`, `APP.diffDb`, `APP.activeBuilding`
- **Function pointers other files hang there** — `APP.clearMeasures`,
  `APP.applyFindScope`, `APP.computeDiff`, `APP.dlodTick`, …

Beyond `APP`, there are **235 distinct `window.*` globals** defined across
`viewer/*.js` (`window.Connect`, `window.BOMWalker`, `window.CpeWalk`,
`window.DbResolve`, …). Assigning to `window` **is** the export mechanism.

**Practical consequence:** to find who provides something, `grep` for
`window.Thing =` or `APP.thing =`. There is no other registry to consult.

---

## 3. The data model — SQLite, inside the tab

A building is a **`.db` file fetched over HTTP** and opened with **sql.js
(SQLite compiled to WASM)**. No server, no ORM, no PO/MTable layer. Business
logic is largely *SQL text inside the JS*.

Four table families carry almost everything:

| table | query sites in `viewer/*.js` | what it is |
|---|---|---|
| `elements_meta` | **240** | guid + `ifc_class` — the element master |
| `element_transforms` | **111** | position / rotation per guid |
| `spatial_structure`, `rel_contained_in_space` | 27 + 13 | site → storey → room → element tree |
| `tasks`, `task_elements`, `task_sequences` | 58 + 21 + 16 | the 4D schedule |
| `kernel_ops` | 40 | the ERP op-log (see §4) |

> **Learn this schema before you read any more JS.** Most "how does X work"
> questions resolve to a `SELECT` you can read in ten seconds.

Asset URLs self-heal: building DBs live on OCI in production, not in the
relative `buildings/` tree. `viewer/db_resolve.js` is the one pure decision that
rewrites a failing relative URL to the OCI base and retries **once**.

---

## 4. The ERP side — the part that will feel like home

`erp/` is the iDempiere lineage re-expressed in the browser. The names map
almost one-to-one:

| file | lines | iDempiere analogue |
|---|---|---|
| `erp/ad_ui.js` | 3,361 | `ADWindow` — renders window/tab/field live from the AD |
| `erp/ad_parser.js` | 536 | reads the Application Dictionary |
| `erp/ad_modelval.js` | 823 | `ModelValidator` |
| `erp/ad_process.js` | 780 | process runner |
| `erp/crud_core.js` / `crud_overlay.js` | 1,246 / 2,919 | `PO` save/load + the CRUD dialog |
| `erp/kernel_ops.js` | 952 | **no analogue — read this one** |

### The one genuinely different idea

State is a **deterministic fold over a signed operation log**, not a row you
`UPDATE`. A fact is computed by *replaying* `kernel_ops`, not stored as a guarded
scalar.

- iDempiere: `C_Order.DocStatus = 'CO'` — a scalar you guard with a
  ModelValidator.
- Here: "is this order complete" is **replayed** from the ops, and *"when may
  this Order Complete"* is itself a signed, reversible op that re-folds live.

Undo is not a compensating transaction — it is *dropping an op and re-folding*.
This is why the modeller's op-log **is** the feature tree, and why one log can
fold into two surfaces (model + accounts) that co-vanish on undo.

---

## 5. The spec-block convention — your cheat sheet

**559 `.js` files** open with a header block:

```
# ⚠ DO NOT REMOVE — SPEC (W-DB-404-OCI-RETRY)
SCOPE:  one pure decision — …
WHY:    …
RULES (each is a test case in tests/witness_db_404_oci_retry.js):
  R1 no prodBase   → null
  R2 already on OCI → null
  …
NON-INVENT: only the filename is reused; no path is fabricated.
Read the §-log after every run (Universal Protocol Log Mandate).
```

**Read the header and you know the file without reading the body.** Canonical
example: `viewer/db_resolve.js` lines 1–25.

Each numbered rule `R1..Rn` names a **witness** that proves it. There are
**602 witness-named files** in the tree.

---

## 6. `§` tags — how you prove code actually fired

**1,122 `§` markers** across `viewer/*.js`. They are log tags, e.g.
`§CLASH_FILM_P`, `§CPE_AIM_PIN`, `§RULE_REPORT`, `§INIT_ERROR`.

```bash
grep '§CLASH_FILM_P' out/full720_nohup.out
```

That is the difference between *"the code shipped"* and *"the behaviour
changed."* Exit code 0 is not evidence — SKIPs and silent failures only appear
in the log.

---

## 7. Scale — so you know what you are NOT going to read

| | |
|---|---|
| `.js` files tracked | 1,684 |
| viewer SLOC (excl. vendored `lib/`) | ~159,400 |
| vendored `web-ifc-api-iife.js` alone | 73,617 lines — **never read this** |
| files with a spec block | 559 |
| witness-named files | 602 |

You are not going to read 159k lines, and you do not need to. Read the spec
headers; drop into a body only when a header does not answer the question.

---

## 8. Suggested reading order — ~5,000 lines, two evenings

| # | file | lines | why it earns the slot |
|---|---|---|---|
| 1 | `viewer/db_resolve.js` | ~200 | the spec convention, pure logic, no DOM |
| 2 | `viewer/main.js` | 1,285 | how `APP` gets built; the boot |
| 3 | `common/room_graph.js` | 1,980 | the core BIM abstraction everything consumes |
| 4 | `erp/kernel_ops.js` | 952 | the op-log fold the ERP rests on |
| 5 | `erp/ad_parser.js` | 536 | AD → UI, on home turf |

**Warm-up before all five:** the `witness/` directory — `recon.js` (33 lines),
`w_probe.js` (49), `w_budget_delta.js` (56). Each runs in plain `node`, each
proves exactly one claim. Read one, run it under a debugger, break a constant on
purpose, watch which assert flips.

---

## 9. Answers to the three questions you will actually be asked

**"What's the architecture?"**
> Static files, no build. 177 scripts loaded in order into one global `APP`
> object. Data is SQLite-WASM in the browser tab. ERP state is a fold over a
> signed op-log.

**"How do I add a feature?"**
> New `.js` file → assign your entry point to `window` → add a `<script>` tag at
> the correct position in `viewer.html` → write the spec block → write the
> witness.

**"How do you know it works?"**
> Every rule has a named witness. Corrupt the rule and the number goes wrong.
> Run it yourself.

---

## 10. The navigation tax — measured, and what was done about it

### The finding

The god object has **three spellings**.

```js
// viewer/main.js:10 — created as APP
const APP = window.APP = {};
_mods.forEach(function (fn) { fn(APP); });   // handed to every module

// viewer/scene.js:141 — but every module receives it as `A`
function setupScene(A) { A.camera = camera; }

// viewer/time_machine.js:8831 — and a third spelling exists
app._tmOn = true;
```

So the object is **read as `APP.x`** and **written as `A.x` or `app.x`**.

> `grep "APP.camera ="` returns **nothing**. The field is defined at
> `viewer/scene.js:141` as `A.camera = camera`.

Measured at `719ebb92` over 1,669 non-vendored files:

| | |
|---|---:|
| distinct fields on the object | **1,098** |
| written only as `A.x` / `app.x` — invisible to an `APP.` grep | **979** (89%) |
| read but never written anywhere — phantom | 60 |
| — of those, read from production code | **36** |

**90% of the object cannot be found by grepping the name you read.** §10 says
the IDE cannot follow a global; this is worse — the one tool left, grep, is
lying too. That is the real pick-up cost, and it is one character wide.

The 53 phantoms are a second, smaller finding: fields read but never written
under any spelling. `APP._walkMode` (`viewer/panels.js:1358`) is read once and
assigned nowhere in the tree — a guard that can never be true. 32 of these sit
in production files and are worth a pass.

### The fix — and what was deliberately not done

**Done — `scripts/gen_app_surface.js` → `internal/APP_SURFACE.md`.** A generated
symbol table: every field, its production definition as `file:line`, its write
and read counts, and the phantoms called out. It is the "go to definition" the
architecture never had. **Zero runtime risk** — it reads the tree and writes a
markdown file; not one line of shipping code changes. Proven by
`tests/witness_app_surface.js`, 10 cases (R1–R9 + a negative), all passing.

Regenerate after any change that moves a definition:

```bash
node scripts/gen_app_surface.js     # §APP_SURFACE files=… fields=… phantom=…
node tests/witness_app_surface.js   # 10/10 expected

# §15 (archive) — pattern adoption across production .js (the health metric that matters)
P=$(git ls-files '*.js' | grep -vE '(/lib/|\.min\.|web-ifc|qrcode|/tests/|witness|probe|spike)')
echo "production files: $(echo "$P" | wc -l)"
for pat in 'DO NOT REMOVE' 'SPDX-License-Identifier'; do
  echo "$pat: $(echo "$P" | xargs grep -l "$pat" 2>/dev/null | wc -l)"
done
echo "setupX(A):  $(echo "$P" | xargs grep -lE 'function setup\w*\s*\(\s*A\b' 2>/dev/null | wc -l)"
echo "witnesses on the contract: $(grep -rl 'Witness(' --include='*.js' . | grep -v /lib/ | wc -l) of $(find . -name '*witness*.js' -not -path './*/lib/*' | wc -l)"
```

> **R9 was added after the fact, and is worth knowing about.** The generator is
> regex-based, and a regex cannot tell code from prose. This tree documents its
> own fields *in comments* — `viewer/effects.js:4567` says "Set `A._emberEnabled
> = true` to re-arm for experiments." **30 such sentences were entering the index
> as definitions.** R8 had patched one instance of this class (the tool indexing
> its own spec block); R9 closes the class by blanking comment bodies before
> matching, preserving line and column offsets so every `file:line` still points
> at the real line. The corrected totals are above — and 7 fields moved from
> "defined" to "phantom" once their only "definition" turned out to be a sentence
> about them.

**Not done — renaming `A` → `APP` across the tree.** That is 979 fields over
~295 files of running code, for a benefit the index already delivers. It is the
change most likely to break something working, and §12.5 (archive)'s own rule applies: a
hung queen is not worth a tidier board. If it is ever done, do it one module at
a time behind its witness.

### Impact

- A newcomer's "where is this defined?" goes from **an unanswerable grep** to
  one lookup in a generated table — for **991 fields** that previously had no
  findable definition.
- **32 production phantoms** surfaced that no one was looking for, each either a
  dead guard or a writer that was deleted.
- Costs one `node` command in review to stay current, and the witness fails
  loudly if the generator regresses.

**This is the §12.6 (archive) removal test, run for real.** The claim was "globals are
survivable because they are greppable" (§12.3 (archive)). Tested, it was false — 90% were
not greppable. So the piece got a prop rather than a eulogy: the convention is
now documented and indexed instead of merely asserted.

---

## 11. Open observations — found, not actioned

> **Nothing in this section has been changed.** These are findings awaiting a
> decision. Measured at `719ebb92`, 2026-09-12. When one is closed, move it to
> the log at the end with the PR that closed it.
>
> House rule this section exists to serve: *observe and document; the fix is a
> separate decision.*

### 16.1 Two corrections to this document, found while compiling the register

**§1 is incomplete. There is a third boot mechanism.** §1 says the 177
`<script>` tags in `viewer.html` are the dependency graph. They are not the whole
story — `viewer/main.js:185-213` lazy-loads six more modules at runtime,
sequentially, on first use:

```
find_erp_push.js?v=1 → navigate_find.js?v=58 → navigate_grid.js?v=1
→ navigate_path.js?v=1 → navigate_engine.js?v=1 → navigate_controls.js?v=2
→ navigate.js?v=10      … then setupNavigate(APP), §NAVIGATE_LAZY_LOADED (§S239)
```

Consequences a newcomer will hit:
- `grep 'navigate_controls' viewer/viewer.html` returns **nothing**. The file is
  live, loaded from JS, and looks dead to the obvious check.
- The `?v=` suffixes are **hand-maintained cache-bust versions**, and the
  comment at `main.js:189` records why: a stale `navigate_find.js?v=57` kept its
  own copy of the ERP-push block while the new wiring never ran. Bumping that
  number is part of editing those files. This is an undocumented convention with
  a known failure mode.

**The "9 unaccounted `setupX`" was a false alarm — but it found a real one.**
45 `setupX` functions exist, 36 are named in `main.js`. The other 9 resolve:

| function | initialised by |
|---|---|
| `setupClashFilm`, `setupClashLabels`, `setupClashMatrix`, `setupClashNarrow`, `setupClashReporter`, `setupClashSnag` | **`viewer/measure.js`** |
| `setupEffects`, `setupGIPoc` | `viewer/scene.js` |
| `setupPointerLock` | itself, `navigate_controls.js:57` (file-local, not a module entry) |

None is dead. But **the boot sequence has three owners, not one** — `main.js`,
`scene.js`, and `measure.js` (which initialises the entire six-module clash
subsystem, something its name gives no hint of). §1 and §2 should say so.

---

### 16.2 The register

Ordered by recommended sequence, not severity.

| # | observation | evidence | recommendation |
|---|---|---|---|
| 1 | **3 spec blocks cite a witness that does not exist** | `erp/tests/poc_preview_demo.js` → `w_demo.js`; `erp/tests/earn_gw_hospital_actual.js` → `w_hospital_actual.js`; `erp/tests/fixtures/build_preview_demo.js` → `w_demo.js` | **Do first.** Smallest possible unit, and it is the only case in the tree where the spec convention is actively lying. Either write the witness or drop the citation. 98% integrity (§15.3 (archive)) becomes 100%. |
| 2 | **Document the three boot owners and the lazy loader** | §11.1 above | **Do second.** Pure documentation, zero risk, and it removes the single most likely wrong conclusion a newcomer can reach ("this file is dead"). |
| 3 | **36 production phantom fields** — read, never written under any spelling | full list in `internal/APP_SURFACE.md`; e.g. `APP._walkMode`, `viewer/panels.js:1358`, read once, assigned nowhere | Triage, do not bulk-delete. Each is either a dead guard (remove the branch) or a writer that was deleted (restore it — that one is a live bug). Sort into those two piles before touching anything. |
| 4 | **`A` → `APP` rename — ★ FIRST TASK OF THE FREEZE SESSION** (red1, 2026-09-13) | 63 production files bind `A`; 979 fields invisible to an `APP.` grep (§10) | Per module, as the reading exercise, starting with `viewer/scene.js` (606 sites, and where `APP.camera` is born). Reuse the `BINDS_A` gate from `scripts/gen_app_surface.js`. **Verification is mechanical:** field count and phantom count in `internal/APP_SURFACE.md` must be **identical** before and after — a pure rename moves neither. Run the module's own witness before starting the next file. |
| 5 | **`redControl` adoption: 43 of 545 witnesses (8%)** | `witness_kit/contract.js`; the tree's own `WITNESS_CONTRACT_AUDIT.md §RESULTS` (2026-08-24) already found 12+ files omitting the summary line | Highest value, highest cost (§15.5 (archive)). Do not sweep. Convert a witness when you next touch the thing it guards. Track the ratio with the §17 (archive) block as the health metric. |
| 6 | **`gen_app_surface.js` is regex-based; the string case is still open** | R8 closed self-indexing, R9 closed comments (30 entries). A string literal containing `A.foo =` would still index as a write. Not observed in the tree — **not searched for either** | Either search for it and close the register entry, or swap the scanner to an `acorn` AST walk (~20 lines) which closes R5/R8/R9 and this by construction. The R-rule list is evidence the regex approach keeps finding new leaks. |

---

### 16.3 What the register is really tracking

Items 1, 3, 5 and 6 are the same shape: **an instance was fixed and the class was
left open.**

- R8 patched the tool indexing itself; the comment case (R9, 30 entries) stayed
  open until someone asked a second question.
- The witness-citation convention holds at 98% — the 2% are not decay, they are
  three files that never got finished.
- `redControl` was designed, proven, adopted 43 times, and stopped.

That is §15.3 (archive) stated as a work queue rather than a finding. **The recurring
failure in this codebase is not building the wrong thing — it is stopping one
step after the thing works.** Every row above is a step that was not taken, and
none of them is hard.

### 16.4 More rows

§17.5 (archive) adds rows 7-10 (error handling, cache pins, SQL). Row 7 outranks
everything above it. §19.4 (archive) adds rows 11-13 (duplication) — all gated on the
version freeze. §20.5 (archive) adds rows 14-16 (WASM duplication, the thread
ceiling, and the unexplored checkJS gate). §21.6 (archive) adds rows 17-20 (the
isolation options and the unsupported size claim); row 17 gates 18 and 19.

### 16.5 Closed

*(empty — move rows here with the closing PR number and date.)*

---

## 12. Housekeeping — the low-risk pile

> Measured 2026-09-13 at `719ebb92`. Observation only; nothing changed.
> Separated from §11 because these cost nothing to reason about — but two of
> them are **not** as free as they look, and that is said plainly below.

### 18.1 Genuinely free

| # | item | measured | why it is free |
|---|---|---|---|
| H1 | **105 production files missing the SPDX header** | 75% have it (§15 (archive)); the gap is 105 files — `common/history_tap.js`, `erp/bigdecimal.js`, `erp/erp_persist_ui.js`, `geomapping/classify_geom.js`, … | A comment line. No behaviour, no load order, no test. Closes the highest-adoption pattern in §15 (archive) at 100%. |
| H2 | **~28 real `TODO` markers** | 30 outside `locales/`, 2 of those in vendored `lib/sql-wasm*.js` | Read them and either file or delete. Several name real work: `panels.js:1160` "wire to ubbl_rules.json checker", `doc_canvas.js:1143` "log as GRID_CALIBRATE kernel_op", `erp/chat_lens.js:22` a marked stub. |
| H3 | **`npm run lint` cannot run as configured** | `node_modules` absent; `package.json` pins `eslint ^9.13.0`, but `npx` resolves **10.4.1**, which crashes on this box's **Node v18.19.1** (`TypeError: util.styleText is not a function`) | The lint script is nominal — it has not been runnable here. Pin the major (`eslint@9`) or raise the Node floor, and say which in `package.json`. |

> **Measurement note, since it is instructive.** A first pass reported **140**
> `TODO` markers. It was wrong: `TODO` is a substring of *METODOLOGI* in the
> Malay, Indonesian, Spanish and Portuguese locale files. The real count is ~28.
> The same class of error as R9 in §10 — a regex that cannot tell a word from a
> word fragment. Re-check any grep count before acting on it.

### 18.2 Cheap, but not free — read the cost first

| # | item | measured | the catch |
|---|---|---|---|
| H4 | **121 MB of build artifacts committed** | 19 files under `out/` — `Hospital_FULL_720p_2026-09-07.mp4`, cue/dimcue PNGs, pose JSON. `.gitignore` covers `*.log` and `erp/tests/*.log` but **not `out/`** | Adding `out/` to `.gitignore` stops *new* ones and is free. It does **not** remove the 121 MB already in history — that needs a history rewrite, which is not housekeeping and breaks every open PR and all 1,099 branches. **Do the `.gitignore` line; leave history alone.** |
| H5 | **217 loose `.js` at the repo root, 206 of them scratch** | 167 `witness_*`, 39 `probe_*`. Meanwhile `tests/`, `viewer/tests/` and `erp/tests/` all exist — witnesses live in **four** places: 168 root, 142 `viewer/tests`, 28 `erp/tests`, 23 `tests/` | Moving them is not zero-impact: **43 witness/probe filenames are referenced by name** in CI and scripts, and `compare_witnesses.sh:8-12` hardcodes 13 of them expecting the repo root. A move means updating those 43 references in the same commit. Worth doing, but it is a change, not a tidy. |

### 18.3 What this pile says

Nothing here is a defect. H1, H2 and H3 are three more instances of the §15.3 (archive)
shape — **a convention applied to most of the tree, with a tail nobody
finished**, and a tool configured but never actually run.

H4 and H5 are different, and worth naming separately: they are the residue of
working *fast in one tree*. Probes and bake outputs landed where they were
created, at the root, and were committed because nothing said not to. That is
not carelessness — it is what velocity looks like afterwards. The `.gitignore`
line (H4) is the one change that stops the pile growing, and it costs nothing.

### 18.4 Suggested order, if any of it is wanted

1. **H4's `.gitignore` line** — one line, stops 121 MB becoming 200 MB.
2. **H3** — pin `eslint@9` or raise the Node floor, so `npm run lint` is real.
   Until then no lint finding in this document can be trusted to be complete.
3. **H1** — 105 header lines, mechanical, verifiable by re-running §15 (archive)'s count.
4. **H2** — read 28 TODOs, file or delete.
5. **H5** — last, and only with the 43 references updated in the same commit.

---

## 13. A reading path — what to study, in order

> For getting hands-on after a long stretch of generated code. Picked for
> density, not size. ~1,600 lines total, ~700 read closely.

### 24.0 Start here: the `A` → `APP` rename (§11 row 4)

`viewer/scene.js`, 606 `A.` sites — and where `APP.camera` is born. Renaming it
forces a full read, and the verification is arithmetic, not judgement: field and
phantom counts in `internal/APP_SURFACE.md` must be **identical** before and
after. Better than reading five files, because you have to be right about all 606.

### 24.1 `witness_kit/contract.js` — 144 lines. Read first.

Smallest high-value file in the tree. Three constructs a Java reader trips on:

| construct | where | what it is |
|---|---|---|
| **closure as private state** | `const spec = {…}` captured by every `api` method | JS's answer to `private` — no keyword, the variable is simply unreachable from outside. *The* idiom; once seen, half the tree reads differently |
| **chained builder** | `population(fn) { spec._population = fn; return api; }` | the same shape as a Java builder — the bridge from what you know |
| **typed JSDoc** | `@param {() => object[]} fn` | already written the way `tsc --checkJS` wants (§11 row 16). Shows that gate would cost nothing here |

And it is the `redControl` doctrine — 8% adopted (§15.2 (archive)). You cannot spread a
pattern you have not read.

### 24.2 `erp/kernel_ops.js` — read one chain, not the file

`stableStringify` → `_canonicalV2` → `_contentHash` → `commitOp`. Skip the other
~900 lines on a first pass. That chain is how an operation becomes a hash-chained
fact — `SHA-256(prev_hash | canonical(op))`.

- **the IIFE module** — `(function () { 'use strict';` — JS's answer to a
  package, and the reason there is no `import` anywhere (§1)
- **`Object.keys(v).sort().map(...)`** in `stableStringify` — the functional array
  pipeline, the biggest daily-idiom gap from Java, here doing something that
  matters: canonical serialisation so the same op always hashes the same
- **the idea** — §22 (archive)'s entire argument rests on this file

### 24.3 `erp/ad_parser.js` — 536 lines. Home turf, read last as the reward.

`AD_Table`, `AD_Column`, `AD_Field`, `AD_Tab` — you know these better than any
reviewer. This does at **run time** what `GenerateModel.java` does at build time
into 345,490 lines of `X_*`. Reading it with iDempiere in hand makes §22 (archive) yours
rather than someone's assertion.

---

## 14. Witnessing the canvas — the one case `§`-logs cannot reach

> The standing rule *no pixel-derived evidence* (frame diffing and IoU are GIGO)
> is correct and is **not** relaxed here. This section says what to assert
> instead, and draws the line precisely.

### 25.1 Why a `§`-log cannot settle a render bug

A `§`-tag proves a code path ran. It cannot prove a triangle landed in the right
place, and "it rendered" has no honest log line. That is the real gap — not
tooling, and not discipline.

**But the frame is not the only evidence available.** Everything the rasteriser
consumes is a number that can be read back and asserted on, *before* a pixel
exists. Assert on the renderer's **inputs**, not its output.

### 25.2 The tiers — each one a number, each one greppable

| tier | question | mechanism | already in the tree |
|---|---|---|---|
| **T0** | is it in the scene, where, and enabled? | `object.matrixWorld`, `geometry.boundingBox`, `.visible`, `.layers` | the 0.000 mm geometry witnesses already work this way |
| **T1** | is it on screen, and at what coordinate? | `v.clone().project(camera)` → NDC; inside `[-1,1]` = on screen | `cpe_slab_beat.js:125,130,439`, `city.js:1028` |
| **T2** | is it visible, unoccluded, and is it **this** object? | `Raycaster` from camera through the T1 NDC point; assert the first hit's `guid` | `picking.js`, `hover_name.js`, `grid_drag.js`, `effects.js`, `doc_canvas.js` |
| **T3** | did the rasteriser actually put something there? | `gl.readPixels(x, y, 1, 1)` at the T1-computed coordinate | `witness_photo_skyline_shadow_frustum.js` |
| **—** | was it drawn at all this frame? | `renderer.info.render.calls` / `.triangles` delta | referenced in `effects.js:4005`, `scene.js:220` |

**T2 is the foolproof one.** A raycast from the camera through a point derived
from a known GUID answers *"would this pixel show the door"* using the same
geometry the renderer uses — and returns a **string to compare**, not an image to
judge. It fails loudly, it is deterministic, and it needs no screenshot.

### 25.3 The line — why T3 is not the thing the rule forbids

This is the distinction that matters, and it reconciles rather than contradicts
the standing rule:

> **GIGO is a whole frame compared to another whole frame.** A single pixel read
> at a coordinate *derived from the model* is a witness.
>
> `readPixels` at "where GUID `3xY…` must project given this camera" is an
> assertion with a stated predicate. An IoU over two PNGs is a similarity score
> with no predicate at all — which is exactly why it is garbage in, garbage out.

The coordinate is the evidence. If it comes from the model, the pixel is
admissible. If it comes from the frame, nothing is.

### 25.4 Where none of this reaches — say so rather than fake it

**Shading is genuinely a pixel property.** Wrong colour, wrong light direction,
wrong material, a bloom that is too strong — no scene-graph read settles those,
because the output *is* the claim.

For those, do not assert the output. **Assert the input:** the uniform value, the
light's intensity and position, the material's `.color.getHex()`, the tone-mapping
exposure. That converts *"does it look right"* into *"is the exposure 1.2"* — a
narrower claim, honestly stated, and testable.

**And when the claim truly is "does it look right," that is not a bug report —
it is a judgement, and it needs a human eye.** Asking for a screenshot there is
correct behaviour, not a failure of the witness system. The error is only asking
for one when T0–T3 would have answered.

### 25.5 Register additions

| # | observation | recommendation |
|---|---|---|
| 7 | **15 `§`-tags inside empty catches** — the log can be silently wrong | **Highest priority of anything found.** Not a sweep: these 15 undermine the evidence rule every other finding is verified with. Smallest honest fix is `catch (e) { console.warn('§TAG_FAILED', e); }` so absence and failure stop looking alike. |
| 8 | **584 empty catches (35.6%)** in 107 files | Do **not** sweep. Triage the 4 concentrations only — `time_machine.js`, `cinema_maxq.js`, `crud_overlay.js`, `navigate_find.js` are 140 of the 584. |
| 9 | **246 `?v=` refs, hand-maintained, unenforced** | A witness could compare each `?v=` against the file's last-changed commit and fail on a stale pin. Closes a known shipping hazard. |
| 10 | **`nlp.js` parameterisation is a strength with no test** | One witness asserting user text never reaches `sql`, only `params`, would lock in the good behaviour before someone "simplifies" it. |
| 11 | **345 files inline a test harness that already exists** (~14,800 lines) | Biggest single win in the tree. Convert per directory, not per file — `modeller` (121) is the natural first batch since the harness lives there. Each converted file must still pass its own witness before the next. |
| 12 | **Two browser drivers in parallel** — puppeteer 300, playwright 284 | Decide once, inside the harness. Do not chase it file by file. |
| 13 | **D1–D4: four production extractions**, 14 copies total | Small, safe after the freeze, and D2's home (`common/pill_builder.js`) already exists and is already loaded. |
| 14 | **5 duplicate `.wasm` binaries** — 11 files, 6 unique, ~5 MB shipped twice (`sql-wasm.wasm` in 3 places, `web-ifc.wasm` and `sql-wasm-fts5.wasm` in 2 each) | Housekeeping, post-freeze. One copy, referenced by path. Check the service-worker precache list in the same commit. |
| 15 | **WASM threads unavailable on GH Pages; not recorded** | Document the single-thread ceiling next to `vfs_detect.js`'s note, or move the WASM-heavy surfaces to the COOP/COEP-capable origin. Decide, do not drift. |
| 16 | **`tsc --noEmit --checkJS` is unexplored** — 2 `@ts-check` pragmas in 1,684 files, 0 tsconfig, typed JSDoc already in 48 | The cheapest large win available: catches §14 and §17's defect classes at author time, touches no running code, needs no build step. |
| 17 | **Is `occt-wasm` even built with pthreads?** Unmeasured | **Do this before rows 15, 18 or 19.** One probe. If the answer is no, the whole isolation question is moot. |
| 18 | **Option A (OCI origin) cannot set COOP/COEP alone** — verified against documented capability, not against the live bucket | One `curl -I` against a served object settles it. Do that before any planning. |
| 19 | **Option B (SW header injection) is the thesis-preserving route** — `viewer/sw.js` already has the machinery | Scope it with the `COEP: credentialless` variant so the OCI-hosted building DBs keep loading. First load stays un-isolated by design; degrade honestly. |
| 20 | **The LOC ratio is now pinned and the paper updated** — `measure_bloat.js` → `§BLOAT … ratio=38.9x`, paper synced 2026-09-13 (was 51× / 28,184, stale by 3 months) | **Closed, but give it a cadence:** re-run the script before the paper is cited again. `internal/BLOAT_MEASUREMENT.md`'s DB figures are still 2026-06-06 and unverified since. |
| 21 | **"Bloat" restated as payload would not survive** — 6.41 MB raw / 2.12 MB gzipped over 172 requests | Keep the claim on the two measured axes: lines and database footprint. Do not let it drift into a bundle-size claim in slides. |
| 22 | **Both bloat ratios must travel together** — 38.9× (all shipped) and 2.9× (`M*` only), with generated code in the debug path 88% of the time | Quote the range, never one bound. The script prints both. |
| 23 | **Canvas claims have no witness tier** — the machinery (Raycaster, `.project`, `readPixels`, `renderer.info`) is all in the tree and used in **production code**, but witnesses assert on `§`-logs instead | Add a `witness_kit/render.js` helper exposing `onScreen(guid, cam)`, `visibleHit(guid, cam)` and `drawCalls()`. Same shape as `contract.js`: one place the guarantee lives, so a render claim cannot be made without one. |
| 24 | **The "no pixel evidence" rule reads as banning all pixels** — it means banning *frame-derived* coordinates | Restate it as §14.3: the coordinate must come from the model. A one-line amendment that unblocks T3 without weakening the rule. |

---

## 15. The handover header — what carries a session across a renewal

> Reference implementation: `bim-compiler/prompts/MEP_CLASH_REVEAL_MOVIE.md`
> (5,968 lines, marked *"second hand-off"*, 2026-09-13). Read 2026-09-14.
> Observation; the bim-ootb prompts are **not** being retrofitted to this — see
> §15.4.

### 26.1 Why this one file is the exception

Every other section of this document records the same shape: a convention
invented rigorously and adopted partially (§15.3 (archive)). **This file inverts it.** The
convention is invented *and* fully applied.

The reason is not discipline. It is that in this lane **hand-offs actually
happen**, so the cost of not maintaining the header is paid immediately and by
the same person. Everywhere else, not-finishing costs nothing — which is §23 (archive)'s
finding arriving from the opposite side, and the strongest evidence in this
document that the fix is never exhortation.

### 26.2 The template — six blocks

Consolidated from what that file does. A spec header (§5) says what a file *is*;
a handover header says where the **work** is. They are different documents and
should not be merged.

| block | answers | worked example from the reference |
|---|---|---|
| **STATE** | where is this *now*, and where is the code? | one dated paragraph + § refs; then worktree `/tmp/wt-storey-cut`, branch `feat/storey-section-cut`, base `7833b639`, commits `f3d36dda`/`9a02db1c`, rake still uncommitted, **nothing pushed, no PR** |
| **START** | what do I read first, and what will kill me? | *"New session, in this order: 1–5"*, with the trap at #1 — §91.4 *before running any bake*, because three consecutive sessions died on 2026-09-13 |
| **LOCKED** | what must I not relitigate? | *"no tint, no fade, no darkening, no lit edge, no rake, clash/Sanity layers stay on"* — plus pre-derived constants (Hospital `0.9077..0.9590`, Terminal `0.7252..0.8390`, HHS `0.6877..0.7674`) so nothing is re-measured |
| **OPEN** | what is unfinished, and **what is unverified?** | *"STILL OPEN, none started: …"* and, critically, per-item verification status — *"§100's rake is the newest and is **UNJUDGED on frames**"* |
| **PRACTICE** | what is true of this lane regardless of the current bug? | §59.6, explicitly *"not tied to any one bug"*: canonical DB `~/Downloads/<Name>_silent.db`, verify by `md5sum`, canonical invocation bare `--db --out --gpu real` |
| **UPKEEP** | how does this file stay readable? | archive pointers with line counts and contents, and the self-executing rule — *"do that again on sight, don't wait to be asked"* |

Copyable skeleton:

```
# ⚠ DO NOT REMOVE — <lane>. Read the log after every run.
#   Archives: <file> (§a-§b, N lines). Consolidate on sight past ~2,400 lines.
**ONE-LINE STATE (<date>, <nth> hand-off):** <where it is, § refs>.
  Code: worktree <path>, branch <name>, base <sha>, commits <shas>, <what is uncommitted/unpushed>.
**New session, in this order:** 1. <the trap>  2. <the constants>  3. <the live work>  4. <rulings>  5. <still open>
**LOCKED:** <settled verdicts — do not relitigate>
**OPEN / UNVERIFIED:** <item> — <status: not started | built but UNJUDGED on X>
**PRACTICE (not tied to one bug):** <canonical inputs, canonical invocation>
```

### 26.3 What this replaces

An earlier sketch in this session proposed a four-line preamble — SCOPE, PRIME
RULE, FALSIFIER, HONOUR-until-DONE. **Wrong shape.** That is a spec header, and
the code tree already has 559 of them. None of it survives a session boundary,
because none of it says where the work stopped.

The **OPEN / UNVERIFIED** block is also a better instrument than the proposed
FALSIFIER line. A falsifier states what *would* disprove a claim; *"built but
UNJUDGED on frames"* states that nobody has looked yet — which is the precise
condition under which a returning session (or an assistant) reports something as
done. §14.4's rule lives here: when the claim needs a human eye, say so in the
header rather than discovering it a round later.

### 26.4 Adoption — deliberately not retrofitted

**No bim-ootb prompt is being converted to this.** Measured 2026-09-14: the
`⚠ DO NOT REMOVE` marker is in **41 of 42** prompt files, but the content is not
a template — "read the §-log" appears in **5**, PRIME RULE in **6**,
HONOUR-until-DONE in **6**, a named witness in **10**, a falsifier in **1**.
Imposing a sixth pattern across 42 files at 2% adoption is precisely the
overthinking §11's rows exist to avoid.

**Let it converge instead.** The blocks above earn their place the first time a
lane survives a real hand-off; a lane that never hands off does not need them.
The one prompt that needed this invented it unprompted — which is the only
adoption mechanism this document has seen actually work.

What *was* repaired (2026-09-14, PR #1719): five stale lines in four prompt files
instructing `Edit shipping code ONLY in /home/red1/bim-ootb/` — the exact action
the worktree hook has denied since 2026-06-06. Those were not a missing
convention; they were an active trap, three months old, costing a wasted round to
every session that obeyed them.

---

## 16. Re-measure

```bash
cd ~/bim-ootb
grep -c '<script' viewer/viewer.html                       # script tags
grep -rho 'APP\.[A-Za-z_][A-Za-z0-9_]*' viewer/*.js | sort -u | wc -l   # APP surface
grep -rho 'window\.[A-Za-z_][A-Za-z0-9_]*\s*=' viewer/*.js | sort -u | wc -l
grep -rhoiE 'FROM [a-z_]+' viewer/*.js | sort | uniq -c | sort -rn | head  # hot tables
grep -rl 'DO NOT REMOVE' --include='*.js' . | wc -l        # spec blocks
git ls-files | grep -ciE 'witness'                         # witnesses
git ls-files viewer | grep '\.js$' | grep -v 'viewer/lib/' | xargs wc -l | tail -1

# §10 — the god-object symbol table (regenerate, then prove it)
node scripts/gen_app_surface.js     # writes internal/APP_SURFACE.md
node tests/witness_app_surface.js   # 10/10 expected

# §15 (archive) — pattern adoption across production .js (the health metric that matters)
P=$(git ls-files '*.js' | grep -vE '(/lib/|\.min\.|web-ifc|qrcode|/tests/|witness|probe|spike)')
echo "production files: $(echo "$P" | wc -l)"
for pat in 'DO NOT REMOVE' 'SPDX-License-Identifier'; do
  echo "$pat: $(echo "$P" | xargs grep -l "$pat" 2>/dev/null | wc -l)"
done
echo "setupX(A):  $(echo "$P" | xargs grep -lE 'function setup\w*\s*\(\s*A\b' 2>/dev/null | wc -l)"
echo "witnesses on the contract: $(grep -rl 'Witness(' --include='*.js' . | grep -v /lib/ | wc -l) of $(find . -name '*witness*.js' -not -path './*/lib/*' | wc -l)"
```

---
