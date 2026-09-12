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

## 11. Who argued about this — the named debates

Every choice in this codebase is a position in a fight that real, named people
have had in public. Knowing the names is the difference between *"that's just how
it came out"* and *"that's a side, and here's who holds it."*

Nothing here is settled. Both sides are quoted so you can concede a point
gracefully when a dev has a good one.

---

### 11.1 No build, plain script tags

**For — ship files, skip the toolchain**

- **David Heinemeier Hansson (DHH)** — took Rails off webpack and back to
  import maps in Rails 7, arguing the build step was accidental complexity that
  bought little for most apps. Hotwire is the same bet.
- **Carson Gross** — htmx, and the *Hypermedia Systems* book. Argues the SPA
  build pipeline was a wrong turn for the majority of applications, and that
  hypermedia already had the answer.
- **Alex Russell** (Chrome) — from a different angle: his *Performance
  Inequality Gap* writing is a long, data-heavy prosecution of framework
  payload cost on ordinary devices. Not anti-build, but brutal about what the
  build is buying.
- **Tom MacWright** — *Second-guessing the modern web* (2020), the essay that
  crystallised the doubt for a lot of people.

**Against — the toolchain earns its keep**

- **Rich Harris** (Svelte, now Vercel) — *In defense of the modern web* (2021),
  the direct reply to MacWright. Concedes real bloat, argues the component
  model and build-time optimisation are genuine wins you cannot hand-roll.
- The whole **ES-modules-won** consensus — after the AMD/CommonJS/UMD wars,
  the field standardised on modules precisely to kill implicit load-order
  coupling.

**Where this codebase sits:** hard on the no-build side, and further out than
DHH or htmx go — *no import maps either*, just 177 ordered `<script>` tags.
The honest cost: load order is invisible coupling a bundler would catch at build
time. The honest benefit: the files you edit are the files that deploy, and the
thing still runs with zero install.

---

### 11.2 Globals and one god object

**Against — the case is strong and old**

- **Douglas Crockford** — *JavaScript: The Good Parts*. Global variables are
  the language's worst feature; implicit globals were his standing complaint.
  The module pattern exists because of this argument.
- **Miško Hevery** (AngularJS, now Qwik) — *Singletons are Pathological Liars*
  and *Root Cause of Singletons* on the Google Testing Blog. The sharpest
  formulation: global state makes a function's real dependencies invisible, so
  you cannot test it in isolation. This applies to `window.APP` verbatim.
- **Michael Feathers** — *Working Effectively with Legacy Code*. Global state
  is the top reason code resists being put under test.
- **Arthur Riel** — *Object-Oriented Design Heuristics*, where the God Object
  anti-pattern gets its formal statement.

**For — or at least, the mitigating tradition**

- **Rich Hickey** — *Simple Made Easy* (Strange Loop, 2011). Not a defence of
  globals, but the relevant reframe: the sin is *complecting*, not visibility.
  One explicit, inspectable ambient environment can be simpler than a hidden
  injected graph you cannot follow.
- The lineage you already know — **Emacs**, **AutoCAD**, and
  **iDempiere's own `Ctx`** — all ship a large ambient context and are not
  obviously worse for it in their domain.

**Where this codebase sits:** guilty as charged on testability, and you should
say so plainly. The defence is that `window.APP` is *greppable* — one `grep` for
`APP.thing =` finds the provider, where an injected graph would need tooling.
That is a real trade, not a free pass. Hevery would still win the argument on
unit-testing; the witness scripts are the compensating control.

---

### 11.3 Op-log as the source of truth

This is your best-defended choice — the pundits are largely **on your side**.

**For**

- **Greg Young** — named and popularised CQRS and Event Sourcing. The canonical
  source.
- **Martin Fowler** — the *Event Sourcing* bliki entry (2005) that put it in
  front of the enterprise world.
- **Jay Kreps** (Kafka, Confluent) — *The Log: What every software engineer
  should know about real-time data's unifying abstraction* (2013). The essay
  that made log-as-truth infrastructure orthodoxy.
- **Rich Hickey** — Datomic, *Deconstructing the Database* and *The Value of
  Values*. A database as an accumulating set of facts; a query is a fold at a
  point in time. Your `kernel_ops` fold is this idea.
- **Pat Helland** — *Immutability Changes Everything*. The systems-level
  argument that append-only beats update-in-place once storage is cheap.

**Against — the practitioner backlash**

- **Greg Young himself** has repeatedly warned it is over-applied — most
  systems do not need it, and teams adopt it for the wrong reasons.
- **Udi Dahan** — the most prominent nuancer; argues event sourcing is a
  narrow tool oversold as an architecture.
- The recurring practitioner genre (*"event sourcing is hard"*): schema
  evolution of old events, replay cost as the log grows, and the fact that
  debugging a fold is harder than reading a row.

**Where this codebase sits:** the critics' strongest point — *"you didn't need
this"* — is answered by your domain, not by theory. A CAD feature tree
**is** an op-log; undo-as-re-fold is the requirement, not a flourish. When both
the model and the accounts fold from one log and co-vanish on undo, you are
using it for the thing it is actually good at.

---

### 11.4 Spec blocks in the source

**Against — the loudest modern voice**

- **Robert C. Martin (Uncle Bob)** — *Clean Code*, comments chapter: "a comment
  is a failure to express yourself in code." Comments rot, code does not lie.
  This is a direct, frontal objection to the 559 `DO NOT REMOVE — SPEC` headers.

**For**

- **Donald Knuth** — *Literate Programming* (1984). Programs should be written
  for humans first, with the prose primary and the code woven through it.
- **D. Richard Hipp** — SQLite. Long prose headers stating invariants, plus
  *How SQLite Is Tested* and 100% MC/DC branch coverage. The living proof that
  prose-plus-obsessive-tests produces some of the most reliable code shipped.
- **Peter Naur** — *Programming as Theory Building* (1985). The central claim:
  the program is not the artifact, the **theory in the programmer's head** is;
  source code is a lossy projection of it. Written-down intent is the only
  transmission mechanism.
- **Hillel Wayne** — *Why Don't People Use Formal Methods?* and related
  writing. Lightweight specs catch design errors tests never reach.

**Where this codebase sits:** Martin's objection has real force — a header that
drifts from the body is worse than no header. Your answer is structural, and it
is a good one: each `R1..Rn` rule names a **witness** that fails when the rule
is violated, so the spec cannot silently rot without a test going red. That
converts prose into something executable, which is precisely the move Martin's
critique does not cover.

---

### 11.5 Witnesses instead of a unit-test suite

**For a different kind of test**

- **James Coplien** — *Why Most Unit Testing is Waste*. Most unit tests assert
  implementation detail and pay no rent; test at the level where behaviour is
  meaningful.
- **DHH** — *TDD is dead. Long live testing.* (2014), which triggered the
  **Is TDD Dead?** conversations with **Kent Beck** and **Martin Fowler** — the
  most-watched debate in the field on how much and what kind of testing.
- **John Hughes** — QuickCheck, *Testing the Hard Stuff and Staying Sane*.
  Property-based testing: state the property, let the machine hunt the
  counterexample. A witness that proves one named claim is a cousin of this.

**Against**

- **Kent Beck** — the TDD case, argued patiently in that same series: tests
  drive design, not just verification, and you lose that if tests come after.

**Where this codebase sits:** closer to Coplien and Hughes than to Beck. The
house rule — *every test must name the issue it proves or disproves* — is the
Coplien position stated as policy. The gap Beck would point at: witnesses
verify, but they never got to shape the design, because they are written after.

---

### 11.6 The meta-argument — worse is better

- **Richard P. Gabriel** — *Worse Is Better* (the "New Jersey style" essay).
  The most-cited framing in the field for why the simpler, less complete,
  easier-to-ship thing beats the correct and elegant thing in practice. Gabriel
  spent years arguing with himself in public about whether he was right.

A static-file app with globals and inline SQL that opens in any browser with no
install is a **New Jersey** artifact, unmistakably. That is a lineage with a
strong track record — C, Unix, and the web itself — and a well-documented
failure mode. Know both halves.

---

### 11.7 The one essay to read for your actual situation

**Peter Naur, *Programming as Theory Building* (1985).**

Naur's argument: a program's real value is the **theory** its builders hold —
why it is shaped this way, which changes are in the spirit of the design and
which are violence to it. Source code is a lossy projection. A team that loses
the theory cannot maintain the program even with complete source, which is why
handing a codebase to fresh developers so often fails.

It is the most precise statement of the position you are in after months of
generating 19,000 lines a week. **Reading the code recovers the projection;
the theory is recovered by working with it** — which is exactly why the
witness-script route in §8 beats reading straight through.

---

## 12. Re-measure

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
