# BIM OOTB — Technical Overview

## About (Settings Panel)

**BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.**

Version 0.6 alpha (October 2025 - April 2026)
Creator: Redhuan D. Oon <red1org@gmail.com>
Tickets: github.com/red1oon/BIMCompiler/issues
License: GPL-3.0 / MIT

**Probably the lightest BIM app ever made.**

Browser-native BIM viewer. Drop an IFC file or pick a building — geometry streams
from SQLite databases directly to the GPU via Three.js. No server, no plugins,
no build step. Works on desktop and mobile.

17K lines of vanilla JavaScript — no framework, no build step, no npm, no bundler.
~3MB total download (cached after first visit). Static files only — zero server-side code.
Compare typical web BIM viewers at 50K–200K+ lines with Node backends and heavy frameworks.

- 17K lines of JavaScript + HTML
- 15 languages, locale-aware currency
- 120 Playwright E2E tests
- OCI Object Storage (Always Free tier)

### Dependencies
| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | r128 | 3D rendering, WebGL 2 |
| sql.js | 1.10.3 | WASM SQLite (SQLite 3.44.2) |
| web-ifc | 0.0.77 | IFC2x3 + IFC4 parsing |
| SheetJS | 0.20.3 | Excel export |
| dxf-parser | — | DXF file parsing |

### Browser Compatibility
- Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- Mobile: iOS Safari 15+, Chrome Android
- Requires: WebAssembly, WebGL 2, Web Workers

### Stages

**Stage 1 (current) — Pure Browser**
Everything runs in the browser. No server, no APIs, no backend.
IFC/mesh files are parsed client-side via Web Workers, stored in IndexedDB,
streamed to the GPU. The two SQLite databases ARE the application — there is
no server to talk to. Static HTML + JS files served from OCI Object Storage.

**Stage 2 (planned) — DAGCompiler Backend**
Java-based BOM compilation engine. Reads IFC, builds recursive Bill of Materials
(building → floor → room → furniture → leaf), runs validation rules, produces
4D–8D output databases. Currently 2.1M lines of Java + 2.7M lines of Python
(Blender extraction) + 644K lines of SQL (migration rules). Not yet connected
to the browser app — the databases it produces are the same two-DB format the
browser already consumes. Stage 2 adds server-side compilation, not a new viewer.

### Hosting Requirements
- Static file server only — no CPU/RAM server needed
- All computation runs in the browser (client-side)
- OCI Always Free: 10GB storage, 10TB/mo egress
- Client: 2GB+ RAM, any modern CPU with WebGL 2

---

## Architecture

```
Browser
  index.html          ← viewer shell (Three.js canvas + UI panels)
  landing2.html       ← building picker (manifest-driven cards)
  boq_charts.html     ← 4D/5D BOQ analytics (ExcelJS)
  2d.html             ← DXF 2D plan viewer (Canvas2D)

  ┌─ Core ─────────────────────────────────────┐
  │ streaming.js      DB BLOBs → Float32 → GPU │
  │ scene.js          Three.js scene setup      │
  │ main.js           Boot, DB open, module init│
  │ picking.js        Element selection + info   │
  │ panels.js         Storey/disc filters, HUD  │
  └─────────────────────────────────────────────┘

  ┌─ Features ──────────────────────────────────┐
  │ navigate.js       Find/fly-to/search (1.8K) │
  │ nlp.js            Natural language queries   │
  │ walk.js           Walk mode + GPS compass    │
  │ sitecam.js        Mobile site camera + markup│
  │ section_cut.js    Section cut planes         │
  │ elevation.js      Elevation views            │
  │ grid_dims.js      Grid + dimension overlays  │
  │ diff.js           Model diff / compare       │
  │ city.js           Multi-building city mode   │
  │ issues.js         Issue log + Excel export   │
  │ variation_order.js  Change order tracking    │
  │ rates.js          Cost rate lookups          │
  └─────────────────────────────────────────────┘

  ┌─ Import / Export ───────────────────────────┐
  │ import.js         IFC/mesh import controller │
  │ import_worker.js  Web Worker: IFC parsing    │
  │ import_db_builder.js  Build extracted.db     │
  │ mesh_import_worker.js  OBJ/DAE/3DS import   │
  │ semantic_enrichment.js  Classify elements    │
  │ scene_to_db.js    Three.js scene → DB        │
  │ wizard.js         Step-by-step import wizard │
  │ ifc_export_worker.js  Export to IFC          │
  │ dxf_export.js     Export to DXF              │
  │ dxf-parser.js     Third-party DXF parser     │
  └─────────────────────────────────────────────┘

  ┌─ i18n ──────────────────────────────────────┐
  │ locale_loader.js  Detect locale, settings UI │
  │ locales/*.js      15 language packs          │
  └─────────────────────────────────────────────┘

  ┌─ Infrastructure ────────────────────────────┐
  │ sw.js             Service worker (offline)   │
  │ test/*.html       Manual test harnesses      │
  │ tests/            Playwright E2E suite       │
  └─────────────────────────────────────────────┘
```

## Data Flow

```
IFC / OBJ / DAE / 3DS
        │
        ▼
  [Web Worker]  ──→  extracted.db  (metadata, transforms, hierarchy)
        │             library.db   (geometry BLOBs: vertices + faces)
        ▼
  [IndexedDB cache]
        │
        ▼
  sql.js (WASM)  ──→  SQL queries  ──→  Float32Array
        │
        ▼
  Three.js BufferGeometry  ──→  GPU
```

Two SQLite databases per building. `extracted.db` holds element metadata,
spatial transforms, and BOM hierarchy. `library.db` holds geometry BLOBs
(pre-tessellated vertices and face indices). The viewer streams BLOBs into
`Float32Array` buffers and pushes them to Three.js `BufferGeometry` — no
intermediate mesh formats.

## Folder Layout

```
deploy/
  dev/                 Active development (NEVER in production directly)
    *.js, *.html       Viewer modules + pages
    locales/           15 language packs (3.8K lines)
    tests/             Playwright E2E suite (26 files, 5.2K lines)
    test/              Manual test harnesses
    test-results/      Playwright artifacts (gitignored)
  sandbox/             Production mirror (promote from dev, never edit)
    *.js, *.html       Prod JS + viewer HTML
    landing.html       Prod landing (generated from landing2.html)
  landing2.html        Landing page SOURCE (dev markers, sed-stripped for prod)
  rates.js             Exchange rate data
  buildings/           Per-building DB pairs (not in git)
```

## Deployment

Three OCI buckets:

| Bucket | Role |
|--------|------|
| `bim-ootb-dev` | Staging — test here first |
| `bim-ootb-live` | Production — what users see |
| `bim-ootb-backup` | Snapshot before each deploy |

Deploy SOP: Test → Snapshot → Copy dev→prod → Smoke test → Git commit.
Rollback: one command copies backup→prod.

See `deploy/OCI_UPLOAD.md` for full procedure.

## Size

| Component | Files | Lines |
|-----------|------:|------:|
| Viewer JS modules | ~30 | 14,000 |
| Viewer HTML pages | 4 | 3,200 |
| Playwright tests | 26 | 5,200 |
| Locale packs | 15 | 3,800 |
| Landing page | 1 | 1,200 |
| **Total** | **~76** | **~27,400** |

## Key Dependencies (all loaded via CDN, no npm)

- **Three.js** r170 — 3D rendering, BufferGeometry, OrbitControls
- **sql.js** 1.11 — WASM SQLite in browser
- **ExcelJS** — Excel export (BOQ charts)
- **web-ifc** — IFC parsing in Web Worker
- **dxf-parser** — DXF file parsing for 2D plans
- **GoatCounter** — privacy-friendly analytics (no cookies)
