# BIM OOTB

**Frictionless BIM. One browser. Zero install.**

Drop an IFC file. Get a full BIM environment in 60 seconds. No server, no signup, no plugins.

**Live:** [red1oon.github.io/bim-ootb](https://red1oon.github.io/bim-ootb/)

## What it does

- **3D/2D Viewer** -- IFC2x3 + IFC4, parsed entirely in-browser via web-ifc
- **Clash Detection** -- Rule-based spatial clash with snag tracking
- **4D Time Machine** -- Construction sequence playback from BOM data
- **5D Cost Estimation** -- 17 country rate templates, Excel export
- **BOM Engine** -- Bill of Materials extraction and verb expansion, fully in JavaScript
- **Grid System** -- Drag grids, scissors cuts, kinematics, door arcs, dimension chains
- **ERP** -- iDempiere Application Dictionary rendered in-browser from SQLite
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

## 30 Pre-loaded Buildings

The gallery includes 30 IFC buildings from public datasets -- from a simple house (487 elements) to a hospital (40,086 elements). Building databases are served from OCI Object Storage; the viewer code is served from GitHub Pages.

## Deploy

`git push` to `main` deploys to GitHub Pages. No CI, no build step.

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

Built in 30 days (April--May 2026) via vibe coding. Extracted from [BIMCompiler](https://github.com/red1oon/BIMCompiler) -- a Java/Python BOM compilation engine that proved the BOM-based approach. The browser viewer outgrew the backend and became the product.

## License

MIT. Copyright (c) 2006--2026 Redhuan D. Oon.
