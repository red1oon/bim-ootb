# ⚠ DO NOT REMOVE — Analysis Sidecar lifecycle: invalidation, staleness, cleanup
# SCOPE: the OPFS analysis sidecars (`*_5d` / `*_4d`, `viewer/analysis_sidecar.js`, spec
#   `prompts/ANALYSIS_SIDECAR.md`) are a permanent-ish PERFORMANCE CACHE — currently keyed
#   on BUILDING NAME ONLY, with NO version/hash → a re-extracted building serves STALE
#   quantities/schedule forever (OPFS persists across sessions). Close that gap.
# PRINCIPLE: the sidecar is a CACHE, NOT a backup or a security store. The source of truth
#   is the building DB (OCI/IDB). The cache must NEVER diverge from it silently, and the app
#   must NEVER depend on it existing (always recomputable). Read the log after every run.

## THE GAP (why this prompt exists)
- `get5D`/`get4D` key the OPFS file on `<building>` only. If a building's DB changes
  (re-extract, new geometry, edited basis), the OPFS hit returns STALE data indefinitely.
- No cleanup → every building visited leaves a sidecar; no eviction policy, unbounded growth.
- OPFS is BEST-EFFORT storage (browser may evict under pressure) → not a reliable store.
- Security: OPFS is same-origin-only but UNENCRYPTED on disk → on a shared device the cached
  cost/building data is readable from the browser profile. Not an auth boundary.

## TASKS
1. **Version key (the core fix)** — derive a cheap source signature from the LOADED DB (e.g.
   byte-length + a fast column hash, or a `meta` version / extract-timestamp if the DB carries
   one). Fold it into the key: `<building>@<sig>_5d.json`. On open: compute sig → OPFS hit ONLY
   if sig matches → else recompute + rebake. Witness: `§SIDECAR_SIG building=.. hit=bool sig=..`.
2. **Staleness guard (belt-and-braces)** — store `sig` + `bakedAt` INSIDE the JSON; on read,
   if the live DB sig differs from the stored sig, treat as MISS even if the filename matched.
3. **Cleanup / eviction** — on bake, prune other sigs for the SAME building (keep latest only);
   optional global cap (LRU by `bakedAt`) on sidecar count/bytes. Witness: `§SIDECAR_PRUNE removed=N`.
4. **Persistence intent (optional)** — `navigator.storage.persist()` so the cache isn't evicted
   mid-session; log whether granted. Do NOT treat as guaranteed; the recompute fallback stays.
5. **Doc the security posture** — add a short note to `ANALYSIS_SIDECAR.md`: OPFS is origin-private
   but unencrypted/persistent; never cache anything more sensitive than what the served DB already
   exposes; the sidecar is not a security or auth mechanism.

## NON-GOALS
- It is a CACHE, not a backup. Keep the get5D/get4D recompute fallback — app behaviour must work
  with the sidecar absent. Do NOT make any feature DEPEND on the sidecar existing.

## TEST / WITNESS (whitebox first; OPFS needs a real browser)
- Headless Chromium (reuse the puppeteer OPFS-round-trip harness from session 2026-06-05):
  bake → mutate the mock DB so its sig changes → reopen → assert MISS + rebake (NOT stale OPFS):
  `§SIDECAR_SIG hit=false`. Then assert exactly ONE sig file remains per building (`§SIDECAR_PRUNE`).
- Node-level: unit-test the sig function (same bytes → same sig; one changed column → different sig).

## SOURCES
- `prompts/ANALYSIS_SIDECAR.md` (sidecar spec, §T3/T5 OPFS lazy-bake).
- `viewer/analysis_sidecar.js` — `get5D`/`get4D`/`compute5D`/`sidecarRead`/`sidecarWrite`.
- OPFS round-trip witness pattern (puppeteer) shipped 2026-06-05 (PR #136).
