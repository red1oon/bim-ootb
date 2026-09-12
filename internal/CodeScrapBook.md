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

## 12. The sum, not the units — and who has argued it

> A working belief of this project, stated plainly: **a design is only as good as
> its sum, not its units — like chess.** §11 judged each choice on its own and
> most of them lost. This section is the rebuttal, the limits of the rebuttal,
> and a test that can settle it.

---

### 13.1 The claim, and who states it best

- **Fred Brooks** — *The Mythical Man-Month* (1975). The strongest single
  statement in software: **"conceptual integrity is the most important
  consideration in system design."** And the corollary that matters here — it is
  better for a system to omit good features and reflect *one* set of design
  ideas than to contain many good but uncoordinated ones. Coherence beats
  a higher-scoring parts list.
- **Russell Ackoff** — a system is never the sum of its parts; it is the
  **product of their interactions**. His thought experiment is the cleanest
  version: take the best engine, the best transmission, the best brakes from
  different cars and assemble them — you do not get the best car. You do not get
  a car at all.
- **Donella Meadows** — *Thinking in Systems: A Primer* (2008) and *Leverage
  Points: Places to Intervene in a System* (1999). Structure generates
  behaviour; you cannot predict a system's behaviour by inspecting its
  components, and the highest-leverage interventions are almost never the
  obvious local ones.
- **Christopher Alexander** — *A Pattern Language* (1977), *The Timeless Way of
  Building* (1979), *The Nature of Order* (2002–04). A pattern has no meaning
  outside its context, and in *Nature of Order* he argues **the whole is prior
  to the parts** — centers get their life from the wholes they sit in. Doubly
  relevant here: he was a building architect, and he is the direct ancestor of
  the software patterns movement. At his OOPSLA 1996 keynote he told that
  movement, to its face, that it had taken his catalogue and left his point.
- **John Gall** — *Systemantics* (1975). **Gall's Law:** "A complex system that
  works is invariably found to have evolved from a simple system that worked. A
  complex system designed from scratch never works and cannot be patched up to
  make it work." Coherence is grown, not assembled.
- **Aristotle**, *Metaphysics* — usually quoted as "the whole is greater than
  the sum of its parts," which he did not write. The actual claim is sharper:
  the whole is something **over and above** its parts — a different kind of
  thing, not a bigger pile.

---

### 13.2 The chess version — and the real debate behind it

The analogy is not decorative. Chess had this exact argument, between two named
players, and the holistic side won.

- **Siegbert Tarrasch** — the great dogmatist. Rules stated absolutely: knights
  before bishops, never this pawn structure, the pieces belong *here*. Judge the
  unit, and the position follows.
- **Aron Nimzowitsch** — *My System* (1925). Attacked Tarrasch head-on and won
  the argument. The **bad bishop** is the crux: a bishop is not bad by nature,
  it is bad **because your own pawns block its diagonals**. Change the pawns and
  the same piece is strong. Value is positional, never intrinsic. Prophylaxis
  and overprotection are the same idea — moves that are pointless as units and
  decisive in relation.
- **Wilhelm Steinitz** — accumulation theory. Small advantages, none of them
  individually winning, sum into a won position; and you may only attack when
  the position has already earned it.
- **Richard Réti** — *Modern Ideas in Chess* (1922). The hypermodern turn:
  control the centre from a distance. A square's value is entirely relational.
- **AlphaZero** — the modern empirical confirmation, documented in
  **Matthew Sadler & Natasha Regan, *Game Changer*** (2019). Trained without
  hand-coded piece values, it routinely gives up material for long-term
  positional compensation that classical engines scored as simply losing. The
  strongest player ever built does not believe in intrinsic unit value.

**Tarrasch is Uncle Bob. Nimzowitsch is Hickey.** The §11 debates are this
debate, run again on different material.

---

### 13.3 Why the frame fits this codebase

Read §11 as a parts list and every line is a loss. Read it as a position and the
pieces defend each other:

| the "weak" unit | what covers it |
|---|---|
| no build step | is *why* it installs nowhere and runs offline — the product thesis |
| 235 globals | the price of no build; made greppable by one naming convention |
| `window.APP` god object | **nothing covers it — checked, 2026-09-12.** See the note below. |
| no type system | covered by 602 witnesses that fail on a violated rule |
| 1,684 unnavigable files | covered by 559 spec headers that answer before you open the body |
| inline SQL | the schema *is* the model; no ORM layer to drift from it |

> **One row of that table failed its own test, and it is left in as the example.**
> The first draft claimed `window.APP` was "survivable because state is
> replayable from the op-log." Checked at `719ebb92`: the op-log is real and the
> viewer does use it — `kernel_ops` is referenced in **30** `viewer/*.js` files,
> and `viewer/kernel_ops.js` is a genuine hash-chained transactional write path.
> But it covers **authored geometry ops**, not `APP`. `window.APP` is created
> once at `viewer/main.js:10` and mutated in place forever — there is no
> rebuild, no re-fold, no reset anywhere in the tree. Its 165 fields — camera,
> controls, composer, panels, highlights — are ordinary unprotected mutable
> state. Hevery's objection (§11.2) stands undefended on this row. The interlock
> is real for five rows; the sixth was narration.

- **David Parnas** — *On the Criteria To Be Used in Decomposing Systems into
  Modules* (1972). The foundational point: modularity is about what a part
  **hides from** the others. Quality lives in the relations, not the units.
- **Rich Hickey** — *Simple Made Easy* (2011). **Complecting** — braiding
  together — is the sin; simplicity is a property of how things relate, not of
  how small they are.
- **Melvin Conway** — *How Do Committees Invent?* (1968). One author, one
  theory, one uniform shape. Conway's Law predicts this codebase's coherence
  from its org chart of one.

---

### 13.4 Where the chess analogy breaks

Two ways, and the second is the one to worry about.

1. **Chess resets. Software never does.** Every game starts from the same
   position; software inherits its position permanently, and mistakes compound
   instead of clearing. **Ward Cunningham**, who coined *technical debt* (OOPSLA
   1992), was explicit that the debt is the gap between your current
   understanding and what the code says — which is exactly the gap that months
   of generated code opens.
2. **Chess terminates. Software does not.** **James P. Carse**, *Finite and
   Infinite Games* (1986): a finite game is played to win, an infinite game to
   continue play. There is no checkmate here, so "good design" cannot mean a
   winning evaluation. It can only mean **the position keeps absorbing moves** —
   a harsher test than elegance, and the right one.

---

### 13.5 Where holism does not save you

The belief has a failure mode: it can absorb any criticism. Some defects are
absolute, and no coherence redeems them.

- **Saltzer & Schroeder** — *The Protection of Information in Computer Systems*
  (1975), and **Bruce Schneier** after them: security is a chain, and a chain is
  exactly as strong as its weakest link. No amount of positional compensation
  fixes one broken link.
- **Tony Hoare** — introduced the null reference in 1965 and later called it his
  **"billion-dollar mistake."** One local decision, unbounded systemic cost.
  See also his Turing lecture, *The Emperor's Old Clothes* (1980).
- **Nancy Leveson** — *Engineering a Safer World* (2011) and the definitive
  **Therac-25** analysis. Her finding cuts *both* ways and is the honest
  position: serious accidents usually come from unsafe **interactions** among
  components that never individually failed — but Therac-25 still killed people,
  and a local defect was still in the chain.

**In chess terms:** a bad bishop is positional and arguable. A hung queen is
not. Hevery's testability complaint against `window.APP` (§11.2) is a bad
bishop. **A rule that fires wrong with no witness to catch it is a hung queen** —
and this project's own standing rules exist precisely to keep those off the
board.

---

### 13.6 The test that settles it

The claim is only worth holding if it can be wrong. **Karl Popper** — a
proposition that explains every outcome explains nothing.

So make it falsifiable. **Take one piece off the board and see what collapses.**

> Add a bundler tomorrow.
> - *"A lot breaks, because the load order encodes real initialization
>   knowledge"* → the interlock is real, the piece was load-bearing, the
>   position is a position.
> - *"Nothing breaks, it would just be better"* → that piece was habit, not
>   design, and the coherence was narrated after the fact.

Run it on all six rows of the §12.3 table. Whatever survives is the actual
design; the rest is sediment.

The warning attached to this, and it is a sharp one:

- **Parnas & Clements** — *A Rational Design Process: How and Why to Fake It*
  (1986). Their observation is that no real system is ever designed by the
  rational process we describe afterward — **the coherent rationale is
  reconstructed once you already know how it turned out.** That is precisely the
  risk in "a design is only as good as its sum." The removal test is what keeps
  the claim honest, because sediment cannot survive it and structure can.

**Related:** §11.7 — Naur's *theory* is the whole this section is arguing for.
The sum *is* the theory. Losing it is how a codebase with complete source
becomes unmaintainable.

---

## 13. Is this easier to pick up than iDempiere?

Both trees measured, not estimated. iDempiere at `87968daa` (2026-01-16), from
`~/idempiere-dev-setup/idempiere`. bim-ootb at `719ebb92`.

| | bim-ootb | iDempiere |
|---|---|---|
| own SLOC (excl. vendored) | **372k** | **1.43M** |
| source files | 1,684 `.js` | 4,465 `.java` |
| modules | 3 loose areas | 72 OSGi plugins, 39 manifests |
| biggest file you must know | `erp/ad_ui.js` 3,361 | `PO.java` 6,550 |
| files with a stated spec | 559 | ~0 |
| tests | 602 witnesses | 157 test classes |
| age / contributors | 4 months, 3 | ~20 years, hundreds |

**Verdict: easier to start, harder to navigate, much harder for anyone who is
not the author.**

| dimension | winner | why |
|---|---|---|
| time to first edit | **bim-ootb**, hugely | open file, save, refresh. iDempiere needs Eclipse + `loadtargetplatform.xml` + `setup-db.sh` + Postgres + Jython — a day. `~/idempiere-dev-setup/` is a pile of scripts that exists *because* of this. |
| stated intent | **bim-ootb** | 559 spec headers vs `PO.java`'s 6,550 lines with no header naming its invariants |
| uniformity | **iDempiere**, decisively | learn `GridTab`/`GridTable`/`PO` once and all 72 plugins read alike. bim-ootb is three worlds — viewer, modeller, erp — sharing almost no shape |
| IDE navigation | **iDempiere** | call hierarchy, find-references, type-safe Ctrl-click on `PO.save()`. See §14 — this is the one that hurts |
| external knowledge | **iDempiere**, not close | books, wiki, 20 years of forum archive, hundreds of devs who can answer. bim-ootb has 3 contributors and no outside memory |
| theory survival (§11.7) | **iDempiere** | its theory lives in a community. This one lives in one head, and much of it was generated rather than reasoned through |

**The sharp version:** *iDempiere is hard to get into and easy to stay in. This
is easy to get into and hard to stay in.* For a stranger, iDempiere is the safer
bet today. For its author, this one is easier — the spec headers are his own
notes to himself.

---

## 14. The navigation tax — measured, and what was done about it

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

**90% of the object cannot be found by grepping the name you read.** §14 says
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

# §15 — pattern adoption across production .js (the health metric that matters)
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
change most likely to break something working, and §12.5's own rule applies: a
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

**This is the §12.6 removal test, run for real.** The claim was "globals are
survivable because they are greppable" (§12.3). Tested, it was false — 90% were
not greppable. So the piece got a prop rather than a eulogy: the convention is
now documented and indexed instead of merely asserted.

---

## 15. The theory behind the patterns — measured

> §11 covered who argued about architecture in general. This is the theory of
> **this** codebase: what its patterns actually are, how widely they are kept,
> and the one structural fact that a newcomer most needs and cannot see.
> All figures measured at `719ebb92` over **427 production `.js`** files
> (excluding vendored, minified, tests, witnesses, probes).

---

### 15.1 The five house patterns

| pattern | what it is | files | adoption |
|---|---|---:|---:|
| SPDX licence header | provenance on every file | 322 | **75%** |
| `§`-tagged log line | `console.log('§TAG …')` — proof a path fired | 194 | **45%** |
| IIFE + `window.X =` export | the module system (§1) | 167 | **39%** |
| spec block `⚠ DO NOT REMOVE` | stated scope, rules, non-invent clause | 90 | **21%** |
| `setupX(A)` module entry | the god-object injection contract (§2, §14) | 42 | **10%** |

Alongside these, three smaller conventions carry real weight:

- **`prompts/*.md` — a 43-file design ledger.** Each opens with a
  `# ⚠ DO NOT REMOVE` preamble stating scope and "read the log after every run,"
  and stays authoritative until the work is DONE. This is where a decision lives
  before it becomes code.
- **`§S<n>` — a numbered decision stream.** 74 distinct numbers, currently
  running to `§S288b`. A tag in the source cites the decision that produced the
  line. `§S282b`, `§S287b` — a suffix means the decision was revised.
- **Facade-first migration.** `viewer/input_registry.js` is the clearest
  statement: *"P0 is a FACADE over the existing scene.js focus state … adds the
  API surface WITHOUT changing any behaviour … later phases migrate ownership
  in."* Introduce the seam first, move the logic later, never both at once.

---

### 15.2 The best idea in the tree, and its adoption

`witness_kit/contract.js` states it outright:

> *"JS has no compiler to refuse an incomplete implementer, so the guarantee is
> moved here instead: one shared function every witness is forced to go through,
> that refuses to run without a population, a schema, and a **redControl** — and
> that **PROVES the redControl actually fails**, so a witness that cannot fail is
> caught at author time, not by luck."*

A `Witness()` will not run unless you also supply a deliberately corrupted
population, and the kit then **verifies that corruption is rejected**. A test
that cannot fail is refused at author time.

That is mutation testing's central insight, enforced as a mandatory builder
contract rather than an optional tool — and it is the mechanical form of this
project's own standing rule, *every test must name the issue it proves or
disproves*. It is the strongest single idea in the codebase.

| | |
|---|---:|
| witness-named `.js` files | 545 |
| that go through the `Witness()` contract | **43** |
| **adoption** | **8%** |

The tree already knows: `contract.js` cites an audit
(`WITNESS_CONTRACT_AUDIT.md §RESULTS`, 2026-08-24) that found 12+ files omitting
even the summary line. **The best idea here is the least adopted one.**

---

### 15.3 The structural finding

Test whether the conventions **rot** — a spec block citing a witness file that
no longer exists:

| | |
|---|---:|
| files carrying a spec block | 561 |
| of those, citing a witness by filename | 174 (31%) |
| whose cited witness **exists on disk** | **171** |
| dangling citations | **3** |

> **Integrity where applied: 98%. Coverage: 10–45%.**

This is the theory, and it holds across all five patterns independently:

> **The patterns here are invented rigorously and adopted partially. The failure
> mode is not decay — it is incompleteness.** Nothing rots. The tail simply never
> gets converted, because the next pattern is more interesting to invent than the
> last one is to finish.

---

### 15.4 Why this is the real comprehension hazard

Bigger than the naming tax of §14, and harder to see.

The documented theory — this README, the spec headers, `CLAUDE.md`'s standing
rules — describes a codebase that exists in **10–45% of the files**. A newcomer
reads `viewer/db_resolve.js` with its numbered rules and named witness, forms a
theory of a rigorous tree, then opens one of the 79% with no spec block and
concludes the convention is decoration. **Both conclusions are wrong**, and
nothing in the tree tells them which file they are holding.

This is **Naur (§11.7) with a twist**. He warned the projection is *lossy*. Here
it is also **aspirational**: the documents describe the intended theory, not the
realized one. A reader cannot recover the theory from the artifact, because the
artifact is a partially-applied version of it.

Hence a rule worth adding to the reading order in §8:

> **Check adoption before you trust a convention.** Before assuming a pattern is
> house style, count it. The `Re-measure` block in §16 is there for exactly this.

---

### 15.5 What follows from it

The measurements point one way, and it is not toward more design.

1. **Stop inventing patterns; convert the tail.** Five patterns is plenty. None
   is below 98% integrity where applied, so none needs redesign — they need
   coverage. Invention is the pleasant half and it is already done.
2. **The highest-leverage target is `redControl`: 43 of 545.** Everything else
   here defends against *misunderstanding* the code. This one defends against a
   test that silently proves nothing — the only failure that can make every other
   guarantee in this document false at once. §12.5's hung queen, exactly.
3. **Convert as you read, not in a sweep.** The same argument as §14's rename:
   adding a spec block to a file forces you to state its scope and its
   non-invent clause, which cannot be done without understanding it. Naur's
   theory is rebuilt by the act of writing the header, and not at all by a
   scripted pass.
4. **Adoption is measurable, so make it visible.** The §16 block already counts
   four of the five patterns. A trend line on those numbers is a better health
   metric for this codebase than any test-pass count.

**The one-sentence theory:** *this codebase is a set of well-designed
conventions applied to a minority of itself, and the work that remains is
finishing, not designing.*

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

# §14 — the god-object symbol table (regenerate, then prove it)
node scripts/gen_app_surface.js     # writes internal/APP_SURFACE.md
node tests/witness_app_surface.js   # 10/10 expected

# §15 — pattern adoption across production .js (the health metric that matters)
P=$(git ls-files '*.js' | grep -vE '(/lib/|\.min\.|web-ifc|qrcode|/tests/|witness|probe|spike)')
echo "production files: $(echo "$P" | wc -l)"
for pat in 'DO NOT REMOVE' 'SPDX-License-Identifier'; do
  echo "$pat: $(echo "$P" | xargs grep -l "$pat" 2>/dev/null | wc -l)"
done
echo "setupX(A):  $(echo "$P" | xargs grep -lE 'function setup\w*\s*\(\s*A\b' 2>/dev/null | wc -l)"
echo "witnesses on the contract: $(grep -rl 'Witness(' --include='*.js' . | grep -v /lib/ | wc -l) of $(find . -name '*witness*.js' -not -path './*/lib/*' | wc -l)"
```
