# Code Scrap Book — the 101 of this codebase

> Orientation notes for reading BIM OOTB, written for someone with a Java /
> iDempiere plugin background. Not a spec, not API docs — a map you can hold in
> your head so no question from another dev catches you flat.
>
> Every number here was measured from the tree, not estimated. Re-measure with
> the commands in [Re-measure](#re-measure) when it drifts.
> Last measured: 2026-09-12 @ `719ebb92`.

---

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

## 10. Where this shape comes from

This is not an accident of vibe coding — it is a recognisable, deliberate family.

**Script-tags-and-globals, no build**
- **Early jQuery-era apps / classic ASP.NET + WebForms front-ends** — ordered
  `<script>` tags, everything on `window`. Same shape, usually by inertia.
- **Blender's Python add-on layer** — a flat namespace, load order matters,
  registration by assignment.
- **QGIS / ArcGIS plugin trees** — a file dropped in a directory, discovered and
  wired by convention rather than a manifest.
- **The HTMX / "no-build" revival (Alpine.js, Hotwire, Datastar)** — the
  *deliberate* modern version: ship files, skip the toolchain. Same trade
  consciously made.

**The "one live global context object"**
- **`window.APP`** here ≈ **Emacs' global buffer/mode state**, ≈ **AutoCAD's
  document/editor context**, ≈ classic **`Ctx` in iDempiere/ADempiere**. A large
  ambient environment plus function pointers, not an injected graph.

**Event/op-log as the source of truth** (the `kernel_ops` idea)
- **Event sourcing / CQRS** — Axon, EventStoreDB, Kafka-as-ledger.
- **Datomic** — the database as an accumulating log of facts; a query is a fold
  at a point in time.
- **Git itself** — the working tree is a fold over commits; `revert` is a new op,
  not a mutation.
- **CAD feature trees** — FreeCAD, OpenSCAD, Onshape: geometry is a *replay* of
  parametric ops. This codebase's modeller is explicitly this, with the log
  signed.
- **Redux / Elm architecture** — same fold, smaller scope.

**The literate spec-block header**
- **Knuth's literate programming**, and closer to home, **SQLite's own source**
  — which is famous for long prose headers stating invariants, and for a test
  suite whose whole purpose is to prove them. The `DO NOT REMOVE — SPEC` +
  witness pairing is that discipline, applied per file.

**Nearest single comparison:** SQLite's source tree — prose-heavy headers,
obsessive per-claim tests, deliberately boring build. With Datomic's log-as-truth
model bolted on, and an early-2000s script-tag deployment story.

---

## Re-measure

```bash
cd ~/bim-ootb
grep -c '<script' viewer/viewer.html                       # script tags
grep -rho 'APP\.[A-Za-z_][A-Za-z0-9_]*' viewer/*.js | sort -u | wc -l   # APP surface
grep -rho 'window\.[A-Za-z_][A-Za-z0-9_]*\s*=' viewer/*.js | sort -u | wc -l
grep -rhoiE 'FROM [a-z_]+' viewer/*.js | sort | uniq -c | sort -rn | head  # hot tables
grep -rl 'DO NOT REMOVE' --include='*.js' . | wc -l        # spec blocks
git ls-files | grep -ciE 'witness'                         # witnesses
git ls-files viewer | grep '\.js$' | grep -v 'viewer/lib/' | xargs wc -l | tail -1
```
