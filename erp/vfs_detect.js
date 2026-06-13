// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * vfs_detect.js — CONSTRAINT_MITIGATION_LANE item 3: VFS detection + IndexedDB fallback.
 *   Spec: docs/FoldEngineConstraints.md §4 P0 (OPFS 2.5× vs IDB) + §5/§6 (vfs_backend monitor).
 *
 * OPFS (Origin-Private File System) VFS is ~2.5× faster than the IndexedDB VFS (§2 #5: 83 ms vs 208 ms per
 * 1000 ops). But OPFS-backed SQLite-WASM needs BOTH the OPFS API (`navigator.storage.getDirectory`) AND a
 * cross-origin-isolated context (COOP/COEP headers, surfaced as `crossOriginIsolated===true`). **GitHub Pages
 * sets no COOP/COEP → `crossOriginIsolated` is false → IDB-only there.** That is a HOSTING reality, not a
 * regression — name it so it isn't mistaken for one (memory project_mobile_meta_split: GH Pages has no
 * SharedArrayBuffer/COOP-COEP).
 *
 *   ERP.VFS.detect(env?) -> { backend:'opfs'|'idb', reason, opfsApi, crossOriginIsolated, misconfig }
 *     env defaults to the real browser globals; injectable for the witness.
 *
 * §FALSIFIER (monitor §6): choosing `idb` on an origin that HAS both OPFS API + crossOriginIsolated is a
 *   MISCONFIG — detect() flags `misconfig:true` for that combination so it can never silently downgrade.
 */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ERP = root.ERP || {}; root.ERP.VFS = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  function _defaultEnv() {
    var nav = (typeof navigator !== 'undefined') ? navigator : {};
    var coi = (typeof crossOriginIsolated !== 'undefined') ? crossOriginIsolated
      : (typeof self !== 'undefined' && typeof self.crossOriginIsolated !== 'undefined') ? self.crossOriginIsolated
        : false;
    return {
      opfsApi: !!(nav && nav.storage && typeof nav.storage.getDirectory === 'function'),
      crossOriginIsolated: !!coi
    };
  }

  function detect(env) {
    env = env || _defaultEnv();
    var opfsApi = !!env.opfsApi;
    var coi = !!env.crossOriginIsolated;
    var canOpfs = opfsApi && coi;            // OPFS-VFS needs BOTH
    var backend = canOpfs ? 'opfs' : 'idb';
    var reason;
    if (canOpfs) reason = 'OPFS API + crossOriginIsolated → OPFS VFS (~2.5× IDB)';
    else if (!opfsApi) reason = 'no navigator.storage.getDirectory → IndexedDB VFS';
    else reason = 'OPFS API present but NOT crossOriginIsolated (no COOP/COEP — e.g. GitHub Pages) → IndexedDB VFS';
    // misconfig: could have run OPFS but ended on idb (never true under this logic, but guards a future
    // override path + powers the monitor alert "idb on a COOP/COEP origin").
    var misconfig = (backend === 'idb') && opfsApi && coi;
    console.log('§VFS chosen=' + backend + ' opfsApi=' + (opfsApi ? 'Y' : 'N') +
      ' crossOriginIsolated=' + (coi ? 'Y' : 'N') + ' misconfig=' + (misconfig ? 'Y' : 'N') + ' — ' + reason);
    return { backend: backend, reason: reason, opfsApi: opfsApi, crossOriginIsolated: coi, misconfig: misconfig };
  }

  return { detect: detect };
}));
