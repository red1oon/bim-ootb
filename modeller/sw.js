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
const CACHE_VERSION = 'v17';   // bump on each deploy; per-change detail is the git commit message.
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
  'disc_walker.js',
  'str_walker.js',
  'str_walker_bridge.js',
  'str_walker_outliner.js',
  'walker_confidence.js',
  'grid_kinematics.js',
  'kernel_ops.js',
  'routewalker.js',
  // Cross-surface broker — lives in viewer/ (shared), precache for offline Connect.
  '../viewer/connect_scene.js',
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
