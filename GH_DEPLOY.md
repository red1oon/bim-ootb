# Deployment Guide

## GitHub Pages (viewer code)

**URL:** `https://red1oon.github.io/bim-ootb/`

**Deploy:** `git push` to `main`. GitHub Pages rebuilds automatically (~60 seconds).

### Workflow

```
1. Edit files in bim-compiler/deploy/dev/ (source of truth)
2. Copy changed files to bim-ootb/viewer/ (viewer.html for HTML, *.js for JS)
   NOTE: The viewer HTML is viewer/viewer.html, NOT viewer/index.html
   (sandbox/index.html redirects old bookmarks → viewer/viewer.html)
3. Bump viewer/sw.js CACHE_VERSION (e.g. v483 -> v484)
4. Bump ?v=N on changed script tags in viewer/viewer.html
5. git add <changed files> && git commit && git push
6. Verify: https://red1oon.github.io/bim-ootb/
```

### Cache busting

The service worker (`viewer/sw.js`) caches all assets. On every deploy:
- Bump `CACHE_VERSION` in `viewer/sw.js`
- Old caches are purged on service worker activate

No `?v=N` query strings needed -- the service worker handles freshness.

### File map

| File | What |
|------|------|
| `index.html` | Landing page (gallery + IFC import) |
| `viewer/viewer.html` | 3D viewer |
| `viewer/*.js` | All JS modules (~80 files) |
| `viewer/sw.js` | Service worker |
| `viewer/lib/` | Three.js, sql-wasm, web-ifc |
| `viewer/locales/` | 18 language packs |
| `viewer/rates/` | 17 country rate templates |
| `manifest.json` | Building archetypes metadata |
| `sandbox/index.html` | Backward-compat redirect for old bookmarks |

---

## OCI Object Storage (building databases only)

**Bucket:** `bim-ootb` (region: `ap-kulai-2`, Always Free tier)

Building databases are NOT in this git repo (`.gitignore` excludes `*.db`).
The viewer fetches them from OCI via `_prodBase` URL in the landing page.

### What's in the bucket

```
buildings/
  {Name}_extracted.db          -- single DB (small buildings)
  {Name}_meta.db + _geo.db     -- split DB (large buildings >= 15K elements)
  {Name}_positions.bin         -- instance positions
  {Name}_BOM.db                -- BOM data (Red Pill buildings)
  city_index.db                -- 786 building bboxes for city mode
```

### Upload a building DB

```bash
oci os object put --bucket-name bim-ootb \
  --file deploy/buildings/{Name}_extracted.db \
  --name buildings/{Name}_extracted.db \
  --content-type application/octet-stream --force
```

### Source of truth

- **Canonical:** `bim-compiler/deploy/buildings/` (has bbox + BOM)
- **Deployed copy:** OCI `bim-ootb/buildings/`
- **NEVER upload from backup/, input/, or ad-hoc locations**

### Adding a new building

1. Extract the IFC to `deploy/buildings/{Name}_extracted.db`
2. Upload to OCI `bim-ootb/buildings/`
3. Add entry to BUILDINGS object in `index.html`
4. Update `manifest.json` with archetype metadata
5. `git push`

---

## Legacy (deprecated)

These OCI buckets exist but are no longer used for code deployment:

| Bucket | Status |
|--------|--------|
| `bim-ootb-live` | Was production. Code now on GitHub Pages. |
| `bim-ootb-dev` | Frozen. Community users viewing it. Do not touch. |
| `bim-ootb-backup` | Snapshot of old live. Reference only. |
| `bim-ootb-full` | Legacy standalone viewer. Obsolete. |
| `bim-ootb-live2` | Test mirror. Obsolete. |

All viewer code deployment is via GitHub Pages. OCI is for building databases only.
