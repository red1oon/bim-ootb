# BIM OOTB
### Two databases. One browser. Zero install. No permission required.

[![CI](https://github.com/red1oon/bim-ootb/actions/workflows/ci.yml/badge.svg)](https://github.com/red1oon/bim-ootb/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A building is a manufactured product with coordinates. Drop an IFC file into a browser tab and watch it become what it always should have been — a thing you can query, cost, schedule, and *own*. No installer. No seat license. No server to rent. No salesman to call.

Beside it runs a full ERP kernel, folded from the Compiere → ADempiere → iDempiere lineage, that reproduces a real ERP's books **to the cent** — serverless, offline, in the same tab. The building becomes a procurement order. The order becomes accounts. All of it from one signed log you can replay and verify yourself.

**Why this exists, plainly.** The big tools are cathedrals — and cathedrals are worth building. They house real work, they employ brilliant engineers, they carry decades of hard-won domain knowledge. This stands on all of that, gratefully. What it adds is a **bazaar beside the cathedral** — open, composable, running in a browser tab — because the best ideas in this industry deserve to reach the widest possible hands. The ambition is to become the first truly unified BIM-ERP platform: not by displacing what came before, but by taking the next step nobody has taken yet.

**Who's doing this.** I'm Redhuan D. Oon — *red1*. I helped found the ADempiere ERP project in 2006, arriving with a Java ERP and PostgreSQL background — now facing an entirely new but exciting learning curve. One person, a machine, various AI led by Claude Code as pair programmer that overworks and overdrank, and a genuine curiosity about how far the discipline can actually stretch — watching a building become a procurement order, watching geometry fold into accounts, watching it all fit inside a single browser tab.

**How it's built — the only three rules.**
- **Extract or compile, never invent.** Every number traces to a real source.
- **Talk is cheap.** Every claim here has a witness you can run; corrupt the rule and the number goes wrong. If it doesn't reproduce, it isn't true.
- **In the open, or not at all.** MIT-licensed, because a tool you can't fork is a tool that owns you.

It won't replace Autodesk or SAP this year. It already does things they were never shaped to do — and it gets closer every week, mostly because it's a genuine blast to build.

**This README is the doorway, not the house.** The works — the proofs, the changes, the arguments — are in the docs and the commit log below. Scour them, break the thing, send a fix.

- ▶️ [Open the live app](https://red1oon.github.io/bim-ootb/) · [Watch the film](https://youtu.be/hnLYNcRihzs)
- 🧭 [What's landed vs the frontier](https://red1oon.github.io/BIMCompiler/StrategicIndustryPositioning/)
- 📜 [How it got here — Federation → Compiler → Browser](https://red1oon.github.io/BIMCompiler/PROJECT_CHRONOLOGY/)
- 🌱 [Push it further (start here)](https://red1oon.github.io/BIMCompiler/CONTRIBUTING/)

*Build it like you mean it. Give it away like it's nothing.*

— Redhuan D. Oon · MIT Licensed · 2025–2026

---

## BIM side

A browser-native IFC viewer — no server, no cloud subscription, no install. Open a URL, drop an IFC file, view a full model with scheduling, cost and clash, all in one tab.

- **3D/2D Viewer** — IFC2x3 + IFC4, parsed entirely in-browser via web-ifc
- **Clash Detection** — rule-based spatial clash with snag tracking
- **4D Time Machine** — construction sequence playback from BOM data
- **5D Cost Estimation** — 17 country rate templates, Excel export
- **BOM Engine** — Bill of Materials extraction and verb expansion, fully in JavaScript
- **PWA** — works offline after first visit
- **18 Languages** — auto-detected from browser locale

**Bigger topics shipped recently:**

- **Universal history timeline** — one merged op|view stream in a shared `common/history_bar.js`, retiring the legacy grid-undo bar; recording-depth toggle; persists and recalls across page-leave / tab-close / return
- **Typed natural-language query** — type a question in the viewer bar → SQL → answer + 3D highlight; 92/92 across 7 buildings (EN/Malay/Swedish), zero drift
- **Find / Revit+ Lens** — uniform depth model (ghost / group-solid / shine-through item), room·material·phase·storey lenses, x-ray (Alt+X), tight-FOV group-zoom drill
- **Alt+X envelope ghost** — disc-coloured instanced bbox wireframes (free, no hang) — see the model's skeleton through its skin
- **Precision camera** — Auto-Pivot live re-centre orbit (room-centroid / selected element), keyboard cluster
- **Synthesized SFX** — zero-asset cinematic audio overlay (Time-Machine score, nav cues, surface-aware ray-blast)
- **DAGeVu authoring modeller** (`viewer/modeller.html`) — a browser BIM *authoring* surface beside the viewer: an occt-wasm B-rep kernel as a pure `ops → mesh` function, where the signed op-log **is** the feature tree and geometry is a deterministic fold. Insert library components at LOD from a BOM-hierarchy catalog (real meshes), drop a whole house / floor / room as a recursive BOM-assembly, sketch with a planegcs constraint solver, sweep / fillet / chamfer — all replayable and reversible. Real buildings with rooms, storeys and typed cross-edges load as resident assemblies; the 3D construction grid is the active authoring frontier. Renamed from "Bonsai" to avoid a brand clash
- **Connect Scene** — shared cross-surface context over the one op-log: selection, timeline and identity cross between the DAGeVu modeller, the viewer and the ERP while the surfaces stay separate (one log → two folds that co-vanish on undo)
- **4D/5D Schedule Editor** (`viewer/schedule_editor.html`) — a full authoring arc built on top of the Time Machine: collapsible WBS outline, dependency editing, bounded CPM with critical-path highlight, drag-to-reschedule Gantt bars with duration lock, and live cross-tab sync via BroadcastChannel — every edit replays on the 3D viewer's Time Machine in real time

→ **Read the paper:** [BIM OOTB Feature Paper](https://red1oon.github.io/BIMCompiler/FeatureComparison/)

## ERP side — Kernel-ERP (Op-Log Engine)

**Open `erp/erp.html`.** The same browser that renders the building also runs **Kernel-ERP**, an ERP kernel folded from the iDempiere lineage (Compiere → ADempiere → iDempiere). State is a *deterministic fold over a signed operation log* — a fact is computed by replaying the log, not stored as a guarded scalar — so it runs serverless, over SQLite WASM, and works offline. iDempiere's Application Dictionary (~925 tables) is re-expressed as five relations plus verbs, and the *same* op-log that drives the model folds a building into a procurement order.

The ERP side has its own long sprint, in order:

- **AD renderer** — `erp/erp.html`: every window, tab and field rendered live from the Application Dictionary in SQLite WASM; multi-tenant, `?login=` demo auto-login, shareable context (Share pill captures *and* restores), mobile cards ≤760px
- **iDempiere client** — `erp/idempiere.html`: the same AD framework rendered as an iDempiere-flavoured client, with a real Odoo Client 12 tenant folded in as a second renderer
- **Lens family** — over the one op-log: durable, drag-to-`SET_STATUS` **Kanban** (Odoo-marvel cards), chat-as-inbox **feed-fold**, **Data Globe** graph, Accts-Posted ledger lens — one-tap Graph ⇆ Kanban
- **⚖ Rule pill** — *lifecycle-as-data*: "when may this Order Complete" is itself a signed, reversible op that re-folds live; client-scoped to the logged-in tenant, honest-disabled
- **One signed op-log** — the live write path is genuinely signed; gated signed **Complete** governs the CO lifecycle; GL debits == credits self-verify on every hop
- **Glassbowl** — `erp/glassbowl.html`: the engine rendered *from its own data* — the kernel inspecting itself
- **Migrate / Install** — pick-your-ERP dialog + the **Odoo Migrate Agent** (`erp/odoo_agent/`, self-contained `.zip`): a native *delegate-to-install* agent — the browser never touches your Odoo; you run it locally, it folds your order→delivery→invoice chain to `odoo_chain.json`, and Install persists the merged tenant so it survives reload
- **iDempiere fidelity** — `erp/idempiere.html` is made indistinguishable from real iDempiere: classic ADWindow chrome, one toolbar, folder tabs, in-place CRUD, Zoom-Across where-used drill, dirty-exit gate. Non-native extensions live on a `⋯` pill rail. Diffed to the cent against a real `idempiere_test` instance
- **AD_Process as a fold** — iDempiere's stored processes are re-expressed as deterministic op-log derivations (no new verbs, gated to the ported document family, consequences *extracted* not invented): project → Sales Order (164), Sales Order → shipment (118) and → invoice (119), plus report folds (M_InOut, M_Movement, M_Inventory, C_Project, PP_Order, C_Payment)
- **Genesis / System Admin** — an Initial Tenant Setup wizard *births* a tenant as a signed op-log and posts it to the cent in-browser; a born tenant becomes a login-able resident client. A System login reaches a System Monitor and a Plugins & Releases surface

A proven kernel and architecture, not a finished ERP. The constituent techniques are established (event sourcing, hash-chained ledgers, single-writer-at-the-edge, local-first); the contribution is their composition under ERP semantics and the BIM↔ERP unification. Honest about gaps — SAP S/4HANA folding is not-run, B1 is a mock — see the paper.

→ **Read the paper:** [Migrate & Compare — legacy ERP vs the WASM event-sourced browser](https://red1oon.github.io/BIMCompiler/MigrateComparisonPaper/)

---

## Roadmap

**ERP — two big objectives.** Once migration from **both iDempiere and Odoo** is stable on the signed op-log, fold the kernel forward into two new op-log-native apps:

1. **uniCenta POS** — a new browser version, driven by **replenishment** (the POS lifecycle as folds over the same ledger).
2. **Warehouse mobile walk** — a phone-first pick/put-away "walk the aisles" app over the same tenant.

**BIM — authoring.** The DAGeVu modeller (above) now brings B-rep authoring to the browser over the op-log; next:

1. **Modeller 3D Grid** — the DAGeVu modeller now drives authoring through a live 3D grid (stretch ≠ scale, wall-opening containment, conformity indicators); the old 2D canvas overlay has given way to this as the active frontier.

**Common — across both engines.** *Connect Scene* now shares selection, timeline and identity across the modeller, the viewer and the ERP over the one op-log; next:

1. **Parallel history timeline** — a single scrubbable op|view timeline running side-by-side across the BIM building *and* the ERP context over the shared op-log.

---

## Architecture

140+ vanilla JS modules (≈100 BIM + 40 ERP). No framework, no build step, no server dependency.

Application state lives in **two SQLite databases** queried via sql-wasm — one for the BIM model, one for the ERP Application Dictionary. Three.js r184 ESM handles rendering with BatchedMesh and distance-based LOD; IFC files are parsed client-side by web-ifc and stored in IndexedDB. Both engines share one signed operation log.

```
index.html            — Landing page (gallery + IFC import)
index2.html           — Morpheus front door ("choose your door" launcher)
viewer/               — BIM engine
  viewer.html         — 3D viewer (read-only)
  modeller.html       — DAGeVu B-rep authoring surface
  bonsai_kernel.js    — occt-wasm B-rep kernel (ops → mesh)
  connect_scene.js    — cross-surface op-log bus (selection/timeline/identity)
  scene.js            — Renderer, camera, lighting
  streaming.js        — DB streaming + mesh construction
  measure.js          — Clash detection engine
  import.js           — IFC/mesh import pipeline
  ...100+ modules
  lib/                — Three.js, sql-wasm, web-ifc
  locales/            — 18 language packs
  rates/              — 17 country rate templates
erp/                  — Kernel-ERP engine
  erp.html            — ERP OOTB (Application Dictionary app)
  idempiere.html      — Kernel-ERP — iDempiere-faithful client, folded from SQLite WASM
  glassbowl.html      — the engine rendered from its own data
  erp_kernel.js       — op-log fold + verbs
  kernel_ops.js       — operation verbs
  erp_signer.js       — hash-chained signed ledger
  rule_fold.js        — client-scoped validation rules
  ad_process.js       — stored processes re-expressed as op-log folds
  genesis.html        — Initial Tenant Setup (births a tenant as a signed op-log)
  system_tenant.js    — System Administrator surface (Monitor, Plugins & Releases)
  kanban_lens.js      — Kanban lens   chat_lens.js — feed-fold inbox
  ad_graph.js         — Data Globe    ad_ui.js — AD renderer
  odoo_agent/         — native delegate-to-install migration agent
  docs/               — ERP feature specs
```

## 25 Pre-loaded Buildings

The gallery includes 25 IFC buildings from public datasets (8 landmark + 17 city) — from a simple house (487 elements) to a hospital (40,086 elements). Building databases are served from OCI Object Storage; the viewer code is served from GitHub Pages.

## Deploy

`git push` triggers CI (badge above). Merge to `main` deploys to GitHub Pages.

Building databases (.db files) are hosted on OCI Object Storage (`bim-ootb` bucket) and are not in this repo.

See [GH_DEPLOY.md](GH_DEPLOY.md) for details.

## Development

```bash
# Local dev server
cd bim-ootb
python3 -m http.server 8000
# Open http://localhost:8000

# Run tests
cd tests && npm install && npx playwright test
```

## Built with

| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | r184 ESM | 3D rendering — BatchedMesh, DLOD, post-FX (EffectComposer/SSAO/Outline), WebGPU build |
| SQLite WASM (sql.js) | 1.10.3 + FTS5 | the database for **both** engines — BIM model + ERP Application Dictionary, in-browser |
| sql.js-httpvfs | bundled | range-read streaming of remote `.db` files (load only the pages you touch) |
| web-ifc | 0.0.77 | IFC parsing (IFC2x3 + IFC4), client-side |
| occt-wasm (OpenCascade) + planegcs | bundled | DAGeVu authoring — B-rep kernel (`ops → mesh`) + sketch constraint solver |
| Canvas 2D | native | 2D plans, dimension chains, door arcs, grid overlay, clash/snag, print sheets, Time Machine |
| SheetJS / ExcelJS + FileSaver | 0.20.3 | Excel export |
| Chart.js | 4.x | BOQ / cost charts |
| qrcode.js | bundled | QR share codes |
| bigdecimal.js | bundled | exact decimal GL math (no float money in the ERP ledger) |
| SimplexNoise | bundled | procedural ground / sky textures |
| Service Worker + Web App Manifest | — | PWA / offline-first |
| IndexedDB · Web Workers · BroadcastChannel | native | IFC import store · off-main-thread SQLite/import · cross-tab history sync |

## History

This project is the browser frontend of [BIMCompiler](https://github.com/red1oon/BIMCompiler) — a BOM-based building compilation engine that began in **October 2025** (concept), became a **Java/Python compiler in January 2026** (21 buildings, 9 verification gates, 1000+ commits), and pivoted to browser-first at **S200 in April 2026** when the viewer outgrew the backend. That parent browser sprint (S200–S271, April 20 — May 23) produced 552 commits and 92 JS modules in 33 days.

Then the browser outgrew the parent: **`bim-ootb` was split into its own repo on 23 May 2026** and has run as one continuous sprint since — **800+ commits across 540+ PRs through June 2026**, now **140+ vanilla JS modules** (≈100 BIM + 40 ERP). The BIM viewer hardened (universal history timeline, typed natural-language query, Find/Revit+ lenses, City Mode) and grew an **authoring counterpart — the DAGeVu B-rep modeller** — while the **ERP engine emerged beside it** as **Kernel-ERP**: the iDempiere Application Dictionary folded into the same browser in JavaScript rather than the original Java, made indistinguishable from real iDempiere — with stored processes themselves re-expressed as op-log folds — then extended to fold a live Odoo tenant through the same signed op-log.

The BOM algebra, IFC extraction pipeline, Rosetta Stone verification, and building database that power the viewer were built over the preceding 6 months in the parent project.

## Links

| | URL |
|---|---|
| **Live viewer** | [red1oon.github.io/bim-ootb](https://red1oon.github.io/bim-ootb/) |
| **Morpheus front door** | [red1oon.github.io/bim-ootb/index2.html](https://red1oon.github.io/bim-ootb/index2.html) |
| **DAGeVu authoring modeller** | [red1oon.github.io/bim-ootb/viewer/modeller.html](https://red1oon.github.io/bim-ootb/viewer/modeller.html) |
| **Film — BIM and ERP, one engine** | [youtu.be/hnLYNcRihzs](https://youtu.be/hnLYNcRihzs) |
| **BIM feature paper** | [red1oon.github.io/BIMCompiler/FeatureComparison](https://red1oon.github.io/BIMCompiler/FeatureComparison/) |
| **ERP migrate & compare paper** | [red1oon.github.io/BIMCompiler/MigrateComparisonPaper](https://red1oon.github.io/BIMCompiler/MigrateComparisonPaper/) |
| **Glassbowl** — ERP engine as data | [red1oon.github.io/BIMCompiler/glassbowl.html](https://red1oon.github.io/BIMCompiler/glassbowl.html) |
| **Op-Log ERP abstract** | [red1oon.github.io/BIMCompiler/OpLogERP](https://red1oon.github.io/BIMCompiler/OpLogERP/) |
| **Documentation** | [red1oon.github.io/BIMCompiler](https://red1oon.github.io/BIMCompiler/) |
| **Parent project** | [github.com/red1oon/BIMCompiler](https://github.com/red1oon/BIMCompiler) |
| **OCI backup** | [ootb-dev bucket](https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/index.html) |

## Contributors

- **Redhuan D. Oon** (*red1*) — architecture, compiler, viewer, ERP engine, everything

## License

MIT. Copyright (c) 2025–2026 Redhuan D. Oon.
