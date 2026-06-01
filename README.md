# BIM OOTB

[![CI](https://github.com/red1oon/bim-ootb/actions/workflows/ci.yml/badge.svg)](https://github.com/red1oon/bim-ootb/actions/workflows/ci.yml)

**Frictionless BIM. One browser. Zero install.**

Drop an IFC file. Get a full BIM environment in 60 seconds. No server, no signup, no plugins. Beside the model, an ERP kernel forked from iDempiere runs in the same browser -- a building folds into a procurement order through one operation log.

**Live:** [red1oon.github.io/bim-ootb](https://red1oon.github.io/bim-ootb/) -- **Film:** [BIM and ERP, one engine](https://youtu.be/hnLYNcRihzs)

## What it does

- **3D/2D Viewer** -- IFC2x3 + IFC4, parsed entirely in-browser via web-ifc
- **Clash Detection** -- Rule-based spatial clash with snag tracking
- **4D Time Machine** -- Construction sequence playback from BOM data
- **5D Cost Estimation** -- 17 country rate templates, Excel export
- **BOM Engine** -- Bill of Materials extraction and verb expansion, fully in JavaScript
- **Grid System** -- Drag grids, scissors cuts, kinematics, door arcs, dimension chains
- **ERP (Op-Log Engine)** -- iDempiere's model forked into the browser: state as a deterministic fold over a signed operation log. [Glassbowl](https://red1oon.github.io/BIMCompiler/glassbowl.html) renders the engine from its own data; [technical abstract](https://red1oon.github.io/BIMCompiler/OpLogERP/)
- **City Mode** -- 786 buildings loaded simultaneously
- **PWA** -- Works offline after first visit
- **18 Languages** -- Auto-detected from browser locale

## Architecture

80+ vanilla JS modules. No framework, no build step, no server dependency.

The entire application state lives in SQLite databases queried via sql-wasm. Three.js r160 ESM handles rendering with BatchedMesh and distance-based LOD. IFC files are parsed client-side by web-ifc and stored in IndexedDB.

```
index.html          -- Landing page (gallery + IFC import)
viewer/
  viewer.html       -- 3D viewer
  scene.js          -- Renderer, camera, lighting
  streaming.js      -- DB streaming + mesh construction
  panels.js         -- UI panels
  tools.js          -- Measurement, BOQ, charts
  measure.js        -- Clash detection engine
  import.js         -- IFC/mesh import pipeline
  ...80+ modules
  lib/              -- Three.js, sql-wasm, web-ifc
  locales/          -- 18 language packs
  rates/            -- 17 country rate templates
```

## ERP -- Op-Log Engine

Beside the BIM model, the same browser runs an ERP kernel forked from the iDempiere lineage (Compiere -> ADempiere -> iDempiere). State is a *deterministic fold over a signed operation log* -- a fact is computed by replaying the log, not stored as a guarded scalar -- so it runs serverless, over SQLite, and works offline. iDempiere's Application Dictionary (~925 tables) is re-expressed as five relations plus verbs; the same operation log that drives the BIM model folds a building into a procurement order.

A proven kernel and architecture, not a finished ERP. The constituent techniques are established (event sourcing, hash-chained ledgers, single-writer-at-the-edge, local-first); the contribution is their composition under ERP semantics and the BIM<->ERP unification. No head-to-head benchmark against iDempiere is claimed.

- **Explore:** [Glassbowl](https://red1oon.github.io/BIMCompiler/glassbowl.html) -- the engine rendered from its own data
- **Read:** [Op-Log ERP technical abstract](https://red1oon.github.io/BIMCompiler/OpLogERP/)
- **Code:** `viewer/erp.html`, `viewer/ad_*.js`, `viewer/kernel_ops.js`

## 30 Pre-loaded Buildings

The gallery includes 30 IFC buildings from public datasets -- from a simple house (487 elements) to a hospital (40,086 elements). Building databases are served from OCI Object Storage; the viewer code is served from GitHub Pages.

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
| Three.js | r160 ESM | 3D rendering, BatchedMesh, DLOD |
| sql.js | 1.10.3 | SQLite in WASM |
| web-ifc | 0.0.77 | IFC parsing (IFC2x3 + IFC4) |
| SheetJS | 0.20.3 | Excel export |
| Chart.js | 4.x | BOQ/cost charts |

## History

This project is the browser frontend of [BIMCompiler](https://github.com/red1oon/BIMCompiler) -- a BOM-based building compilation engine that began in **October 2025** (concept), became a **Java/Python compiler in January 2026** (21 buildings, 9 verification gates, 1000+ commits), and pivoted to browser-first at **S200 in April 2026** when the viewer outgrew the backend.

The browser sprint (S200--S271, April 20 -- May 23) produced 552 commits and 92 JS modules in 33 days, but the BOM algebra, IFC extraction pipeline, Rosetta Stone verification, and building database that power it were built over the preceding 6 months in the parent project.

## Links

| | URL |
|---|---|
| **Live viewer** | [red1oon.github.io/bim-ootb](https://red1oon.github.io/bim-ootb/) |
| **Film -- BIM and ERP, one engine** | [youtu.be/hnLYNcRihzs](https://youtu.be/hnLYNcRihzs) |
| **Glassbowl** -- ERP engine as data | [red1oon.github.io/BIMCompiler/glassbowl.html](https://red1oon.github.io/BIMCompiler/glassbowl.html) |
| **Op-Log ERP abstract** | [red1oon.github.io/BIMCompiler/OpLogERP](https://red1oon.github.io/BIMCompiler/OpLogERP/) |
| **Documentation** | [red1oon.github.io/BIMCompiler](https://red1oon.github.io/BIMCompiler/) |
| **Parent project** | [github.com/red1oon/BIMCompiler](https://github.com/red1oon/BIMCompiler) |
| **OCI backup** | [ootb-dev bucket](https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb-dev/o/index.html) |

## License

MIT. Copyright (c) 2006--2026 Redhuan D. Oon.
