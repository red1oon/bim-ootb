# Deployment Guide

## GitHub Pages (viewer code)

**URL:** `https://red1oon.github.io/bim-ootb/`

**Deploy:** merge to `main` (branch-protected → via PR). CI runs (~95s), then GitHub Pages rebuilds automatically (~60s). Pages deploys ONLY from `main` — pushing a feature branch runs CI but does NOT deploy to production.

### Authentication (required before `git push`)

The remote URL is clean (no embedded token, by design). Push needs a valid credential — if you
see `Invalid username or token / Authentication failed`, the stored token expired or was revoked.
Refresh it (do NOT paste tokens into chat/logs):

```bash
# Preferred — gh CLI keeps the token in the OS keyring (not plaintext):
gh auth login            # choose GitHub.com → HTTPS → paste a fresh PAT (scope: repo)
gh auth setup-git        # makes git use gh for credentials

# Alternative — store helper (plaintext in ~/.git-credentials, less secure):
echo 'https://<user>:<NEW_PAT>@github.com' > ~/.git-credentials   # store helper reads this
```

Fresh PAT: https://github.com/settings/tokens/new?scopes=repo

**CI Status:** Check https://github.com/red1oon/bim-ootb/actions
- ✅ Green check → Safe to deploy
- ❌ Red X → Fix before deploying (see logs)

### Workflow

```
1. Edit files in bim-compiler/deploy/dev/ (source of truth)
2. Copy changed files to bim-ootb/viewer/ (viewer.html for HTML, *.js for JS)
   NOTE: The viewer HTML is viewer/viewer.html, NOT viewer/index.html
   (sandbox/index.html redirects old bookmarks → viewer/viewer.html)
3. Bump viewer/sw.js CACHE_VERSION (e.g. v483 -> v484)
4. (Optional) stage to OCI bim-ootb-dev first to test in the cloud — see §Staging below
5. git add <changed files> && git commit
6. git push to a feature branch (auth required — see §Authentication) → open PR (main is protected)
7. After CI green + review, merge PR to main → Pages auto-deploys
8. Verify: https://red1oon.github.io/bim-ootb/
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
| `bim-ootb-dev` | **Safe-to-break staging/backup.** Deploy here FIRST to test viewer changes before GitHub Pages. (Earlier "frozen / do not touch" note was stale — superseded 2026-05-27.) |
| `bim-ootb-backup` | Snapshot of old live. Reference only. |
| `bim-ootb-full` | Legacy standalone viewer. Obsolete. |
| `bim-ootb-live2` | Test mirror. Obsolete. |

Production viewer code deployment is via GitHub Pages (GH is branch-protected — changes land via PR).
OCI `bim-ootb-dev` is the safe staging target for trying viewer changes in the cloud BEFORE committing
to GitHub. OCI is otherwise for building databases.

### Staging a viewer change to bim-ootb-dev (pre-GitHub)

Requires the `oci` CLI installed + configured. Upload the changed `viewer/` files:

```bash
oci os object put --bucket-name bim-ootb-dev \
  --file viewer/<file> --name viewer/<file> \
  --content-type <type> --force
```

Bump `viewer/sw.js` CACHE_VERSION so the service worker purges stale assets. New JS files must be
added to BOTH `viewer/viewer.html` (script tag, before its dependents) and `sw.js` PRECACHE_ASSETS.
