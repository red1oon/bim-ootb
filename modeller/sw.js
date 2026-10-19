/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// sw.js — Service Worker for the MODELLER app (its own top-level folder, trilogy viewer/·erp/·modeller/).
// Mirrors viewer/sw.js + erp/sw.js: network-first for .html/.js (fresh on deploy), cache-first for
// heavy/immutable assets (.wasm, libs). DB files skip the SW (the modeller caches them in IndexedDB).
// Its caches are PREFIX-SCOPED ('bim-modeller-') so it never deletes the viewer's ('bim-ootb-') or the
// ERP app's ('erp-ootb-') caches — each app owns its own (docs/ERP_FOLDER_HOME.md precedent).
//
// DEPLOY: bump CACHE_VERSION on every deploy. Old caches are purged on activate.
const CACHE_VERSION = 'v107';   // bump on each deploy; per-change detail is the git commit message.
const CACHE_PREFIX = 'bim-modeller-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// Shell libs — auto-precached on install (needed to render the modeller).
const SHELL_LIBS = [
  'lib/three.webgpu.min.js',
  'lib/three.module.min.js',
  'lib/three.core.min.js',
  'lib/OrbitControls.module.js',
  'lib/sql-wasm.js',
  'lib/sql-wasm.wasm',
];
// Deferred — heavy/feature-gated; cache-on-first-use via cacheFirst (lib/ is always cache-first).
const DEFERRED_LIBS = [
  'lib/web-ifc-api-iife.js',
  'lib/web-ifc.wasm',
  'lib/kernel/occt-wasm.js',
  'lib/kernel/occt-wasm.wasm',
  'lib/planegcs/planegcs_dist/planegcs.wasm',
  'lib/dxf-parser.js',   // §DXF-IMPORT (DXF2BIM lane L3): loaded only when 2D drawings are opened
];
const LOCAL_LIBS = [...SHELL_LIBS, ...DEFERRED_LIBS];
const CDN_ASSETS = [];

// Local files to precache on install — the modeller works offline after first visit.
// DB files are NOT here — the resident *_extracted.db / terminal_rules.db are cached in IndexedDB.
const PRECACHE_ASSETS = [
  'modeller.html',
  // Modeller engine (the bonsai_* kernel + outliners + walkers)
  'bonsai_kernel.js',
  'bonsai_kernel_worker.js',
  'bonsai_sketch.js',
  'bonsai_oplog.js',
  'dxf2ifc.js',
  'bonsai_ifc.js',
  'bonsai_grid.js',
  'bonsai_gridmove.js',
  'bonsai_outliner.js',
  'bonsai_library.js',
  'bom_tree.js',
  'bom_tree_outliner.js',
  'cross_edges.js',
  'arc_editable.js',
  'sdg_cascade.js',
  'sdg_gate.js',
  'proj_order_ui.js',   // §S9 ERP Project Order panel (lazy-loads the Viewer-side ERP owners on first click)
  'edit_delta_ui.js',   // §S8 hover/click Δ display (lazy-loads the Viewer-side owners on first use)
  'disc_walker.js',
  'dw_instances_outliner.js',   // §I5 Walked Fixtures per-instance rows (W-E2E-INSTHIDE)
  'teams_embed.js',   // §TEAMS-EMBED — gated Teams overlay (off by default = inert; lazy-loads teams/ when ON)
  'seed_trunk.js',
  'str_walker.js',
  'str_walker_bridge.js',
  'grid_span_gate.js',
  'str_walker_outliner.js',
  'walker_confidence.js',
  'grid_kinematics.js',
  'kernel_ops.js',
  'real_placement_resolver.js',   // WalkerDoctrine.md §10 — shared real-placement gate (routewalker.js's first call site)
  'bonsai_roommove.js',           // ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §2 — whole-room move (GEOM_ROOM_MOVE)
  'bonsai_itemdrag.js',           // ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §3 — free single-item drag (gated by the line above)
  'routewalker.js',
  // §DXF-IMPORT (DXF2BIM lane L3): Open 2D drawings → canvas → Convert; the verbatim BIMCompiler reader modules (dxf2bim/SOURCE.md)
  'dxf_import_ui.js',
  'dxf2bim_import.js',
  'dxf2prep.js',
  'dxf2pair.js',
  'dxf2defaults.js',
  'dxf2typology.js',
  'element_defaults.json',
  'dxf2hatch.js',
  'dxf2panels.js',
  'dxf2section.js',
  'dxf2doors.js',
  'dxf2synth.js',
  'dxf2notes.js',
  'dxf2bill.js',
  'synthetic_ref.json',
  'dxf2bodies.js',
  'dxf2suggest.js',
  'dxf2structure.js',
  'dxf2bim/dxf2bim.js',
  'dxf2bim/dxf2marks.js',
  'dxf2bim/dxf2elev.js',
  'dxf2bim/dxf2mesh.js',
  'dxf2bim/dxf2types.js',
  'dxf2bim/dxf2shell.js',
  'dxf2bim/dxf2shell_config.js',
  'dxf2bim/dxf2qualify.js',
  'dxf_meta_editor.js',   // §DXF-META (lane L4): the Drawing metadata editor
  'dxf_export_ui.js',   // §DXF-EXPORT (lane L5): Export ▸ 2D drawings (DXF)
  'dxf2bim/std2d.js', 'dxf2bim/std2d_scopes.js', 'dxf2bim/std2d_geom.js', 'dxf2bim/std2d_dxf.js', 'dxf2bim/std2d_marks.js', 'dxf2bim/polygon-clipping.js', 'dxf2bim/ifc_extract_core.js',
  // Cross-surface broker — lives in viewer/ (shared), precache for offline Connect.
  '../viewer/connect_scene.js',
  '../viewer/locale_loader.js',  // S226 §R3 — the Modeller's UI language (shared loader; i18n/<code>.json cache on first use)
  '../viewer/lib/room_walker.js',  // §MODELLER-ROOM-INJECT — shared RoomWalker (same file the Viewer's ensureRooms uses)
  '../viewer/dagevu_catalog.json',  // §CATALOG-PATH — bonsai_library.js catalog (shared with the Viewer)
  // §GEOMAP-WIRE — IFC→BOM classifier + bridge + mined artifacts (audit channel; offline parity with online).
  '../geomapping/classify_geom.js',
  '../geomapping/geomap_bridge.js',
  '../geomapping/data/geomap_rules.json',
  '../geomapping/data/relations_SH.json',
  '../geomapping/data/relations_DX.json',
  '../geomapping/data/relations_SC.json',
  '../geomapping/data/alias_map.json',
];

self.addEventListener('install', (event) => {
  const _installSet = [...PRECACHE_ASSETS, ...SHELL_LIBS];
  console.log('§MODELLER-SW install set=' + _installSet.length + ' deferred=' + DEFERRED_LIBS.length);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        _installSet.map(url =>
          cache.add(url).catch(err => console.warn('§SW_PRECACHE_SKIP', url, err.message))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge ONLY this app's old caches (prefix-scoped) — never the viewer/ERP caches.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const _PRECACHE_SET = new Set(PRECACHE_ASSETS.map(p => p.split('/').pop()));

function isNetworkFirst(url) {
  var base = url.split('?')[0];
  if (base.includes('/dxf2bim/local/')) return true;   // §L3.2 locally generated library subset: regenerated in place, never served stale
  if (base.endsWith('/dxf2bim/library/latest.json')) return true;   // §L3.4 the ONE mutable library object (names the current library sha)
  if (/\/dxf2bim\/library\/[0-9a-f]{12}\//.test(base)) return false;   // §L3.4 OCI library index/shards, versioned by library sha: immutable → cache-first
  if (base.includes('/lib/')) return false;            // versioned/immutable → cache-first
  var filename = base.split('/').pop();
  if (_PRECACHE_SET.has(filename)) return false;       // precached → cache-first (version bump refreshes)
  if (base.endsWith('.html') || base.endsWith('.js')) return true;  // unknown → network-first
  return false;
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (event.request.method !== 'GET') return;
  if (url.split('?')[0].endsWith('.db')) return;       // DBs → IndexedDB, skip SW
  if (event.request.mode === 'navigate') { event.respondWith(networkFirst(event.request)); return; }
  if (isNetworkFirst(url)) { event.respondWith(networkFirst(event.request)); return; }
  event.respondWith(cacheFirst(event.request));
});

function networkFirst(request) {
  var cacheUrl = request.url.split('?')[0];
  return fetch(request)
    .then(resp => {
      if (resp && resp.status === 200) { const clone = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone)); }
      return resp;
    })
    .catch(() => caches.match(cacheUrl).then(r => {
      if (r) return r;
      if (cacheUrl.endsWith('.js')) return new Response('', { status: 503 });
      return new Response('<h1>Offline</h1><p>Open a resident you viewed before.</p>',
        { headers: { 'Content-Type': 'text/html' } });
    }));
}

function cacheFirst(request) {
  var cacheUrl = request.url.split('?')[0];
  return caches.match(cacheUrl).then(cached => cached || caches.match(request)).then(cached => {
    if (cached) return cached;
    return fetch(request).then(resp => {
      if (!resp || resp.status !== 200) return resp;
      const clone = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone));
      return resp;
    }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
  });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_PRECACHE') {
    event.ports[0].postMessage({ assets: PRECACHE_ASSETS, libs: LOCAL_LIBS, version: CACHE_VERSION });
  }
});
