# BIM / ERP OOTB

[![CI](https://github.com/red1oon/bim-ootb/actions/workflows/ci.yml/badge.svg)](https://github.com/red1oon/bim-ootb/actions/workflows/ci.yml)

**Frictionless. Two DBs. One browser. Zero install.**

Two engines in one browser tab, sharing one operation log. Drop an IFC file and get a full BIM environment in 60 seconds. Beside it, an ERP kernel forked from the iDempiere lineage runs over its own SQLite database — and the *same* signed op-log that drives the model folds a building into a procurement order. No server, no signup, no plugins.

**Live:** [red1oon.github.io/bim-ootb](https://red1oon.github.io/bim-ootb/) — **Film (both engines):** [BIM and ERP, one engine](https://youtu.be/hnLYNcRihzs)

Two technical papers, one per engine: **BIM →** [Feature Paper](https://red1oon.github.io/BIMCompiler/FeatureComparison/) · **ERP →** [Migrate & Compare](https://red1oon.github.io/BIMCompiler/MigrateComparisonPaper/).

---

## BIM side

A browser-native IFC viewer — no server, no cloud subscription, no install. Open a URL, drop an IFC file, view a full model with scheduling, cost and clash, all in one tab.

- **3D/2D Viewer** — IFC2x3 + IFC4, parsed entirely in-browser via web-ifc
- **Clash Detection** — rule-based spatial clash with snag tracking
- **4D Time Machine** — construction sequence playback from BOM data
- **5D Cost Estimation** — 17 country rate templates, Excel export
- **BOM Engine** — Bill of Materials extraction and verb expansion, fully in JavaScript
- **Grid System** — drag grids, scissors cuts, kinematics, door arcs, dimension chains
- **City Mode** — 786 buildings loaded simultaneously
- **PWA** — works offline after first visit
- **18 Languages** — auto-detected from browser locale

**Bigger topics shipped recently:**

- **Universal history timeline** — one merged op|view stream in a shared `common/history_bar.js`, retiring the legacy grid-undo bar; recording-depth toggle; persists and recalls across page-leave / tab-close / return
- **Typed natural-language query** — type a question in the viewer bar → SQL → answer + 3D highlight; 92/92 across 7 buildings (EN/Malay/Swedish), zero drift
- **Find / Revit+ Lens** — uniform depth model (ghost / group-solid / shine-through item), room·material·phase·storey lenses, x-ray (Alt+X), tight-FOV group-zoom drill
- **Alt+X envelope ghost** — disc-coloured instanced bbox wireframes (free, no hang) — see the model's skeleton through its skin
- **City Mode (S285)** — camera ray-blast streaming with ARC-first gate and wave eviction; whole-city facade resident, 786 buildings
- **Precision camera** — Auto-Pivot live re-centre orbit (room-centroid / selected element), keyboard cluster
- **Synthesized SFX** — zero-asset cinematic audio overlay (Time-Machine score, nav cues, surface-aware ray-blast)

→ **Read the paper:** [BIM OOTB Feature Paper](https://red1oon.github.io/BIMCompiler/FeatureComparison/)

## ERP side — Op-Log Engine

**Open `erp/erp.html`.** The same browser that renders the building also runs an ERP kernel forked from the iDempiere lineage (Compiere → ADempiere → iDempiere). State is a *deterministic fold over a signed operation log* — a fact is computed by replaying the log, not stored as a guarded scalar — so it runs serverless, over SQLite WASM, and works offline. iDempiere's Application Dictionary (~925 tables) is re-expressed as five relations plus verbs, and the *same* op-log that drives the model folds a building into a procurement order.

The ERP side has its own sprint — ~90 PRs building, in order:

- **AD renderer** — `erp/erp.html`: every window, tab and field rendered live from the Application Dictionary in SQLite WASM; multi-tenant, `?login=` demo auto-login, shareable context (Share pill captures *and* restores), mobile cards ≤760px
- **iDempiere client** — `erp/idempiere.html`: the same AD framework rendered as an iDempiere-flavoured client, with a real Odoo Client 12 tenant folded in as a second renderer
- **Lens family** — over the one op-log: durable, drag-to-`SET_STATUS` **Kanban** (Odoo-marvel cards), chat-as-inbox **feed-fold**, **Data Globe** graph, Accts-Posted ledger lens — one-tap Graph ⇆ Kanban
- **⚖ Rule pill** — *lifecycle-as-data*: "when may this Order Complete" is itself a signed, reversible op that re-folds live; client-scoped to the logged-in tenant, honest-disabled
- **One signed op-log (I-4)** — the live write path is genuinely signed; gated signed **Complete** governs the CO lifecycle; GL debits == credits self-verify on every hop
- **Glassbowl** — `erp/glassbowl.html`: the engine rendered *from its own data* — the kernel inspecting itself
- **Migrate / Install** — pick-your-ERP dialog + the **Odoo Migrate Agent** (`erp/odoo_agent/`, self-contained `.zip`): a native *delegate-to-install* agent — the browser never touches your Odoo; you run it locally, it folds your order→delivery→invoice chain to `odoo_chain.json`, and Install persists the merged tenant so it survives reload

A proven kernel and architecture, not a finished ERP. The constituent techniques are established (event sourcing, hash-chained ledgers, single-writer-at-the-edge, local-first); the contribution is their composition under ERP semantics and the BIM↔ERP unification. Honest about gaps — SAP S/4HANA folding is not-run, B1 is a mock — see the paper.

→ **Read the paper:** [Migrate & Compare — legacy ERP vs the WASM event-sourced browser](https://red1oon.github.io/BIMCompiler/MigrateComparisonPaper/)

---

## Roadmap

**ERP — two big objectives.** Once migration from **both iDempiere and Odoo** is stable on the signed op-log, fold the kernel forward into two new op-log-native apps:

1. **uniCenta POS** — a new browser version, driven by **replenishment** (the POS lifecycle as folds over the same ledger).
2. **Warehouse mobile walk** — a phone-first pick/put-away "walk the aisles" app over the same tenant.

**BIM — two big objectives.**

1. **2D Grid Editor modelling** — author and edit the model from the 2D grid, not just view it.
2. **Parallel history timeline** — the universal op|view timeline running side-by-side across building and ERP context.

---

## Architecture

80+ vanilla JS modules. No framework, no build step, no server dependency.

Application state lives in **two SQLite databases** queried via sql-wasm — one for the BIM model, one for the ERP Application Dictionary. Three.js r160 ESM handles rendering with BatchedMesh and distance-based LOD; IFC files are parsed client-side by web-ifc and stored in IndexedDB. Both engines share one signed operation log.

```
index.html            — Landing page (gallery + IFC import)
viewer/               — BIM engine
  viewer.html         — 3D viewer
  scene.js            — Renderer, camera, lighting
  streaming.js        — DB streaming + mesh construction
  measure.js          — Clash detection engine
  import.js           — IFC/mesh import pipeline
  ...80+ modules
  lib/                — Three.js, sql-wasm, web-ifc
  locales/            — 18 language packs
  rates/              — 17 country rate templates
erp/                  — ERP engine
  erp.html            — ERP OOTB (Application Dictionary app)
  idempiere.html      — iDempiere client, folded from SQLite WASM
  glassbowl.html      — the engine rendered from its own data
  erp_kernel.js       — op-log fold + verbs
  kernel_ops.js       — operation verbs
  erp_signer.js       — hash-chained signed ledger
  rule_fold.js        — client-scoped validation rules
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
| Three.js | r160 ESM | 3D rendering — BatchedMesh, DLOD, post-FX (EffectComposer/SSAO/Outline), WebGPU build |
| SQLite WASM (sql.js) | 1.10.3 + FTS5 | the database for **both** engines — BIM model + ERP Application Dictionary, in-browser |
| sql.js-httpvfs | bundled | range-read streaming of remote `.db` files (load only the pages you touch) |
| web-ifc | 0.0.77 | IFC parsing (IFC2x3 + IFC4), client-side |
| Canvas 2D | native | 2D plans, dimension chains, door arcs, grid overlay, clash/snag, print sheets, Time Machine |
| SheetJS / ExcelJS + FileSaver | 0.20.3 | Excel export |
| Chart.js | 4.x | BOQ / cost charts |
| qrcode.js | bundled | QR share codes |
| bigdecimal.js | bundled | exact decimal GL math (no float money in the ERP ledger) |
| SimplexNoise | bundled | procedural ground / sky textures |
| Service Worker + Web App Manifest | — | PWA / offline-first |
| IndexedDB · Web Workers · BroadcastChannel | native | IFC import store · off-main-thread SQLite/import · cross-tab history sync |

## History

This project is the browser frontend of [BIMCompiler](https://github.com/red1oon/BIMCompiler) — a BOM-based building compilation engine that began in **October 2025** (concept), became a **Java/Python compiler in January 2026** (21 buildings, 9 verification gates, 1000+ commits), and pivoted to browser-first at **S200 in April 2026** when the viewer outgrew the backend. The ERP engine grew alongside it — the iDempiere Application Dictionary folded into the same browser, fully in JavaScript rather than the original Java.

The browser sprint (S200–S271, April 20 — May 23) produced 552 commits and 92 JS modules in 33 days, but the BOM algebra, IFC extraction pipeline, Rosetta Stone verification, and building database that power it were built over the preceding 6 months in the parent project.

## Links

| | URL |
|---|---|
| **Live viewer** | [red1oon.github.io/bim-ootb](https://red1oon.github.io/bim-ootb/) |
| **Film — BIM and ERP, one engine** | [youtu.be/hnLYNcRihzs](https://youtu.be/hnLYNcRihzs) |
| **BIM feature paper** | [red1oon.github.io/BIMCompiler/FeatureComparison](https://red1oon.github.io/BIMCompiler/FeatureComparison/) |
| **ERP migrate & compare paper** | [red1oon.github.io/BIMCompiler/MigrateComparisonPaper](https://red1oon.github.io/BIMCompiler/MigrateComparisonPaper/) |
| **Glassbowl** — ERP engine as data | [red1oon.github.io/BIMCompiler/glassbowl.html](https://red1oon.github.io/BIMCompiler/glassbowl.html) |
| **Op-Log ERP abstract** | [red1oon.github.io/BIMCompiler/OpLogERP](https://red1oon.github.io/BIMCompiler/OpLogERP/) |
| **Documentation** | [red1oon.github.io/BIMCompiler](https://red1oon.github.io/BIMCompiler/) |
| **Parent project** | [github.com/red1oon/BIMCompiler](https://github.com/red1oon/BIMCompiler) |
| **OCI backup** | [ootb-dev bucket](https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/index.html) |

## License

MIT. Copyright (c) 2025–2026 Redhuan D. Oon.
