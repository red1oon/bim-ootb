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

  var DbResolve = { ociRetryUrl: ociRetryUrl };
  if (typeof window !== 'undefined') window.DbResolve = DbResolve;
  if (typeof module !== 'undefined' && module.exports) module.exports = DbResolve;
})();
