/**
 * ERP OOTB — AD-driven ERP from SQLite WASM. No server. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// erp/sw.js — Service Worker for the ERP app's own folder home (docs/ERP_FOLDER_HOME.md).
// Scope = /erp/ (registered by erp.html / idempiere.html). Distinct cache PREFIX from the
// BIM viewer SW so the two coexist on one origin — each purges ONLY its own prefix.
// Network-first for .html/.js (fresh on deploy); cache-first for .wasm/images.
const CACHE_VERSION = 'v584';   // v584: Migrate▸Odoo staged box + self-sufficient odoo_agent.zip bundle (P0);
                                // v583: GATED COMPLETE — the editable, signed L1 rule "order may Complete iff
                                //       GrandTotal ≤ T" now GATES the real CO transition engine-side (dispatch
                                //       admission guard); edit the rule → a blocked order completes, signed;
                                // v582: I-4 — ONE signed op-log: the live write path (a doc Complete via the
                                //       seam) is now a genuinely SIGNED op (W-CHAIN+W-SIGN), on the SAME chain
                                //       as the ⚖ rule edit (erp_kernel unified to kernel_ops's schema);
                                // v581: ⚖ Rule — L1 lifecycle rule "may this Order Complete iff GrandTotal ≤ T"
                                //       (rule registry: L2 premium + L1 may-complete; 26 real Odoo orders in shard);
                                // v580: ⚖ Rule pill — THE ONE GESTURE (rule_fold.js + bigdecimal.js): edit one
                                //       rule → K Odoo products re-fold live, signed (ECDSA) + reversible;
                                // v579: removed top-right ⛶ maximize + 🔍 search HUD icons (dup of pill rail);
                                // v578: glassbowl/gravity pills → LOCAL nav (was remote BIMCompiler GH Pages);
const CACHE_PREFIX = 'erp-ootb-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// sql.js-fts5 WASM — local copy in erp/lib (self-contained home), CDN fallback.
const LOCAL_LIBS = [
  'lib/sql-wasm-fts5.js',
  'lib/sql-wasm-fts5.wasm',
];
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/sql.js-fts5@1.4.0/dist/sql-wasm.js',
  'https://cdn.jsdelivr.net/npm/sql.js-fts5@1.4.0/dist/sql-wasm.wasm',
];

// ERP files resident in erp/. ad_seed.db is NOT here — .db skips the SW (fetched directly).
const PRECACHE_ASSETS = [
  'erp.html',
  'idempiere.html',
  'ad_charts.js',
  'ad_data.js',
  'ad_graph.js',
  'ad_parser.js',
  'ad_table_map.js',
  'ad_ui.js',
  'erp_panel.js',
  'erp_persist.js',
  'erp_pills.js',
  'erp_replay.js',
  'erp_search.js',
  'erp_signer.js',
  'migrate_showme.js',
  'migrate_agent.js',
  'erp_picker.js',     // MIGRATE_ERP_PICKER.md §SPEC — pick-your-ERP Install/Migrate dialog (window.ErpPicker)
  'idmp_session.js',
  'erp_postings.js',   // FRONTEND_LANE_MASTER §2 Item C — frozen read-fold (UMD copy, window.ERPPostings)
  'accts_posted.js',   // Accts-Posted lens (buildCtx/buildPostedVM/mount/mountAccordion, window.AcctsPosted)
  'menu_seed.js',
  'role_band.js',
  'icons.js',
  'pill_builder.js',   // duplicated from viewer/ (BIM keeps its own) — see ERP_FOLDER_HOME.md
  'kernel_ops.js',     // shared infra — dedupe to common/ later (ERP_FOLDER_HOME.md)
  'erp_kernel.js',     // engine (window.ERPKernel) — kanban_lens.html publishes window.ERP via the seam
  'erp_seam.js',       // engine seam (window.ERPSeam.makeSeam) — ENGINE_CONTRACT §1 write path
  'kanban_lens.js',    // Kanban board chrome (buildBoard/resolveDrag/mount) — lens + idempiere
  'kanban_host.js',    // reusable Kanban host: publish window.ERP + persist/restore the op-log
  'bigdecimal.js',     // exact decimal compare for the rule fold (never raw JS Number) — window.BigDecimal
  'rule_fold.js',      // THE ONE GESTURE (window.RuleFold) — signed, reversible rule edit + re-fold (RULE_EDIT_SPEC)
  'qrcode.min.js',
  'manifest.json',
  'pills.json',
  'initbubble.json',
  'redpill.png',
  'aplus.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        [...PRECACHE_ASSETS, ...LOCAL_LIBS].map(url =>
          cache.add(url).catch(err => console.warn('§SW_PRECACHE_SKIP', url, err.message))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge ONLY this app's old caches (prefix-scoped) — never touch the BIM viewer's caches.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const _PRECACHE_SET = new Set(PRECACHE_ASSETS);

function isNetworkFirst(url) {
  var base = url.split('?')[0];
  if (base.includes('/lib/')) return false;
  for (const cdn of CDN_ASSETS) { if (url === cdn || base === cdn) return false; }
  var filename = base.split('/').pop();
  if (_PRECACHE_SET.has(filename)) return false;
  if (base.endsWith('.html') || base.endsWith('.js')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (event.request.method !== 'GET') return;
  if (url.split('?')[0].endsWith('.db')) return;   // ad_seed.db handled by the page directly
  if (event.request.mode === 'navigate') { event.respondWith(networkFirst(event.request)); return; }
  if (isNetworkFirst(url)) { event.respondWith(networkFirst(event.request)); return; }
  event.respondWith(cacheFirst(event.request));
});

function networkFirst(request) {
  var cacheUrl = request.url.split('?')[0];
  return fetch(request)
    .then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone));
      }
      return resp;
    })
    .catch(() => caches.match(cacheUrl).then(r => {
      if (r) return r;
      if (cacheUrl.endsWith('.js')) return new Response('', { status: 503 });
      return new Response('<h1>Offline</h1><p>Open the ERP after a first online visit.</p>',
        { headers: { 'Content-Type': 'text/html' } });
    }));
}

function cacheFirst(request) {
  var cacheUrl = request.url.split('?')[0];
  return caches.match(cacheUrl).then(cached => cached || caches.match(request)).then(cached => {
    if (cached) return cached;
    return fetch(request).then(resp => {
      if (!resp || resp.status !== 200) return resp;
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone));
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
