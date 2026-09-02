// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// db_resolve.js — building-asset URL self-heal.
//
// # ⚠ DO NOT REMOVE — SPEC (W-DB-404-OCI-RETRY)
// SCOPE: one pure decision — given a building-asset URL that FAILED to fetch, return the
//        OCI prod-base URL to retry, or null when no safe retry exists.
// WHY:   On GH-Pages the building DBs live on OCI (config.js _prodBase), NOT in the relative
//        `buildings/` tree (only warehouse_gardenworld.db is served from the page). A stale or
//        relative db url — e.g. a resumed `pwa_last_db` ('../buildings/Ifc2x3_SampleCastle_…')
//        or an old share link — 404s and BRICKS the viewer boot (§INIT_ERROR, no fallback).
//        Rewriting the failing relative `buildings/<file>` to the OCI base and retrying ONCE
//        lets a dead relative link self-heal instead of dead-ending.
// RULES (each is a test case in tests/witness_db_404_oci_retry.js):
//   R1 no prodBase            → null              (nothing to retry against)
//   R2 already on OCI         → null              (the url IS the prod base → no loop)
//   R3 import:// url          → null              (IDB-only, never networked)
//   R4 not a buildings/ asset → null              (don't rewrite unrelated urls)
//   R5 relative buildings/X   → prodBase+buildings/X        (the heal: ../buildings, buildings, /buildings)
//   R6 absolute non-OCI .../buildings/X → prodBase+buildings/X  (heal a stale absolute GH-Pages link too)
// NON-INVENT: only the filename (url.split('/').pop()) is reused; no path is fabricated.
// Read the §-log after every run (Universal Protocol Log Mandate).
//
// # ⚠ DO NOT REMOVE — SPEC (W-DB-CACHE-KEY) — prompts/HISTORY_PERSIST_RECALL.md §VERIFY-FIRST ITEM 1
// SCOPE: one pure decision — given a building-asset URL, return the CANONICAL IndexedDB cache key.
// WHY:   scene.js cachedFetch() stored/looked up the blob under the raw url STRING, and the two ways
//        a user reaches the same building build two different strings for the same bytes:
//          landing/hub  (index.html:489)          → '<prodBase>buildings/Hospital_extracted.db'
//          ERP red pill (erp/idempiere.html:4716) → '../buildings/Hospital_extracted.db'
//        So opening from the landing cached 251MB under the OCI key, and the Zoom-Across red pill then
//        MISSED, 404'd, retried OCI, and re-downloaded the whole 251MB — every single time, forever,
//        writing a SECOND copy under the relative key. One building, two entries, 502MB.
// RULES (each is a test case in tests/witness_db_cache_key.js):
//   K1 import:// url                  → verbatim   (IDB-only identity; never rewritten)
//   K2 production buildings/<file>    → 'buildings/<file>'  (folds ../buildings, buildings, /buildings,
//                                                            and <prodBase>buildings onto ONE key)
//   K3 deploy/ or modeller/ path seg  → verbatim   (dev bench serves deploy/dev/buildings/Terminal…
//                                                   AND deploy/buildings/Hospital… — same filenames,
//                                                   DIFFERENT bytes. Folding those = wrong geometry.
//                                                   Matches the segment with OR without a leading '/' —
//                                                   ?db=deploy/dev/buildings/X.db (no leading slash,
//                                                   e.g. hand-typed against a repo-root-relative local
//                                                   server) folded onto the shipped K2 key until this
//                                                   fix; every KNOWN tool (dlod_bench.html) already used
//                                                   a leading slash and was never affected. §S76.)
//   K4 anything else                  → verbatim   (../erp/ad_seed.db, non-buildings/ assets)
// NON-INVENT: the key is built from the url's own filename; no path is fabricated, nothing is guessed.
(function () {
  'use strict';

  // ociRetryUrl(url, prodBase) → string | null
  function ociRetryUrl(url, prodBase) {
    if (!url || !prodBase) return null;                              // R1
    if (typeof url !== 'string') return null;
    if (url.indexOf('import://') === 0) return null;                 // R3
    // R2 — already pointed at the prod base (or any OCI object-storage url): no safe retry, avoid a loop.
    if (url.indexOf(prodBase) === 0) return null;
    if (/^https?:\/\/objectstorage\./i.test(url)) return null;
    // R4 — only building assets are OCI-hosted; leave everything else alone.
    if (!/(^|\/)buildings\//.test(url)) return null;
    var file = url.split('/').pop();                                 // R5/R6 — reuse the filename verbatim
    if (!file) return null;
    return prodBase + 'buildings/' + file;
  }

  // cacheKey(url, prodBase) → string   (W-DB-CACHE-KEY — never null; a key is always returned)
  function cacheKey(url, prodBase) {
    if (!url || typeof url !== 'string') return url;
    if (url.indexOf('import://') === 0) return url;                  // K1
    // K3 — dev/authoring trees keep their full path: deploy/dev/buildings/Terminal_extracted.db and
    // deploy/buildings/Terminal_extracted.db are different bytes behind the same filename. Matches
    // 'deploy/'/'modeller/' as a path segment whether or not the url has a leading slash — a bare
    // '?db=deploy/...' (no leading '/') must be caught the same as '/deploy/...' (§S76).
    if (/(^|\/)(deploy|modeller)\//.test(url)) return url;           // K3
    // K2 — the shipped production set, however it was addressed. Strip the query/hash first so a
    // cache-busted '?v=' link folds onto the same key as the plain one.
    var bare = url.split('#')[0].split('?')[0];
    if (!/(^|\/)buildings\//.test(bare)) return url;                 // K4
    var file = bare.split('/').pop();
    if (!file) return url;                                           // K4 — 'buildings/' with no file
    return 'buildings/' + file;                                      // K2
  }

  var DbResolve = { ociRetryUrl: ociRetryUrl, cacheKey: cacheKey };
  if (typeof window !== 'undefined') window.DbResolve = DbResolve;
  if (typeof module !== 'undefined' && module.exports) module.exports = DbResolve;
})();
