/**
 * ERP OOTB — AD-driven ERP from SQLite WASM. No server. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// erp/sw.js — Service Worker for the ERP app's own folder home (docs/ERP_FOLDER_HOME.md).
// Scope = /erp/ (registered by erp.html / idempiere.html). Distinct cache PREFIX from the
// BIM viewer SW so the two coexist on one origin — each purges ONLY its own prefix.
// Navigation (.html) = STALE-WHILE-REVALIDATE (instant cached first paint + background refresh — the
// init-bubble must be INSTANT, ERP_INIT_BUBBLE_INSTANT.md); network-first for non-precached .js (fresh on
// deploy); cache-first for precached assets/.wasm/images. Freshness on deploy is carried by the SW version
// bump (skipWaiting+clients.claim precache the new shell), so SWR strands a user at most one load post-deploy.
const CACHE_VERSION = 'v737';   // bump on each deploy; per-change detail is the git commit message.
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
  'ad_docfsm.js',
  'ad_evaluator.js',
  'ad_graph.js',
  'ad_modelval.js',
  'ad_parser.js',
  'ad_process.js',    // B-5/C-5 — process dispatch spine (window.AdProcess), W-PROC / W-AD-PROC-LIVE
  'ad_table_map.js',
  'vfs_detect.js',    // CONSTRAINT_MITIGATION item 3 — OPFS/IDB detection at boot (§VFS monitor)
  'ad_ui.js',
  'erp_panel.js',
  'erp_persist.js',
  'erp_pills.js',
  'erp_replay.js',
  'erp_search.js',
  'erp_signer.js',
  '../common/about_diy.js',  // ABOUT_BOX_CONSOLIDATE.md — shared About/DIY modal (replaces migrate_showme.js here)
  'migrate_agent.js',
  'overlay_kit.js',    // CONSISTENCY_FINISH.md §K-1 — shared import-overlay toolbox (window.OverlayKit)
  'erp_picker.js',     // MIGRATE_ERP_PICKER.md §SPEC — pick-your-ERP Install/Migrate dialog (window.ErpPicker)
  'genesis.html',      // SYSTEM_ADMIN_LANE §5 L1 — Initial Tenant Setup wizard (W-GENESIS-WIZARD-LIVE)
  'genesis.js',        // genesis engine (UMD, window.Genesis) — births a tenant as a signed op-log
  'genesis_seed.js',   // NON-INVENT default-genesis data (311 iDempiere default accounts + 73 default-acct maps)
  'system_tenant.js',  // SYSTEM_ADMIN_LANE §SA1 — boot overlay: System(0) login surface (W-GENESIS-SYSADMIN)
  'system_monitor.js', // SYSTEM_ADMIN_LANE §6 — iDempiere System Monitor (serverless reframe, window.SystemMonitor)
  'plugin_release.js', // SYSTEM_ADMIN_LANE §6 — Plugin Management + gated Release/Update (window.PluginRelease)
  'erp_snapshot_sign.js', // ECDSA P-256 signer (UMD, window.ErpSnapshotSign) — signs the genesis bundle head
  '14-sap-chain.json', // SAP /DMO/ Flight PoC oracle (fetch-fold-install demo data; user can replace via file-drop)
  'idmp_session.js',
  'erp_descriptor.js',  // DESCRIPTOR SEAM (IDEMPIERE_2.md pivot, renderer #2) — one chrome, N dictionaries; AD = first descriptor
  'odoo_descriptor.js', // RENDERER #2 — the Odoo descriptor (?erp=odoo); reads the two pulled artifacts below
  'odoo_model.json',    // Odoo dictionary slice (menus/windows/fields/records) — pulled live via odoo_agent/extract_model.js
  'odoo_chain.json',    // Odoo folded O2C chain (provenance) — pulled live via odoo_agent/agent.js
  'user_names.js',     // ERP_AUDIT_CHANGELOG Task 2 — AD_User_ID → real AD_User.Name for the change-log (NON-INVENT)
  'erp_postings.js',   // FRONTEND_LANE_MASTER §2 Item C — frozen read-fold (UMD copy, window.ERPPostings)
  'accts_posted.js',   // Accts-Posted lens (buildCtx/buildPostedVM/mount/mountAccordion, window.AcctsPosted)
  'post_resolver.js',  // POSTING_PREVIEW_PANEL.md — token→account resolver (UMD, window.PostResolver), FOLD-frozen
  'doc_poster.js',     // POSTING_PREVIEW_PANEL.md — per-doc GL derivation (UMD, window.DocPoster), == fact_acct(318)
  'erp_preview.js',    // Posting-Preview seam (window.ERPPreview) — sql.js facade + gate + reuse AcctsPosted renderer
  'ad_callout.js',     // PLUGIN_SYSTEM_LANE §Phase D — callout dispatch (window.AdCallout); gives callout bundles a live target
  'plugin_registry.js',// PLUGIN_SYSTEM_LANE §Phase A — Fold-Engine plugin host (window.PluginRegistry), W-PLUGIN
  'plugin_overlay.js', // PLUGIN_SYSTEM_LANE §Phase D — the Plugin Engine pill overlay (window.PluginEngine); v2 = +Create face
  'ninja_model.js',   // NINJA CREATE (PackOut) — pure model-sheet parser (window.NinjaModel)
  'ninja_stage.js',   // NINJA CREATE — stageModels/rollbackModel into the sql.js AD (window.NinjaStage)
  'ninja_bundle.js',  // NINJA CREATE — emitBundle + makeWritableDbHost (window.NinjaBundle)
  'ninja_create.js',  // NINJA CREATE — previewSheet + emitAndInstall controller (window.NinjaCreate)
  'ninja_starter.js', // NINJA CREATE — starter-sheet generator (window.NinjaStarter; starterBlob, client-side)
  'ninja_export.js',  // NINJA EXPORT (PackOut existing window) — extractModel→workbook serialize (window.NinjaExport), W-NINJA-EXPORT
  'plugins/widget_callout.mjs',     // example bundle — M_Product.Name → upper (C-1)
  'plugins/production_validator.mjs',// example bundle — M_Production BEFORE_SAVE qty<0 reject (C-2)
  'plugins/wip_token.mjs',          // example bundle — {Production.WIP} token from seed (C-3)
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
  'bim_orders_overlay.js', // BIM→Project §B round-trip: overlay viewer-folded Project Orders + VO amendments from OPFS at boot
  'rule_fold.js',      // THE ONE GESTURE (window.RuleFold) — signed, reversible rule edit + re-fold (RULE_EDIT_SPEC)
  'erp_engine.js',     // POS_ADDON_SPEC — engine verbs (UMD of bim-compiler scripts/erp_engine.js, window.ERPEngine)
  'crud_overlay.js',   // SO_FULL_CRUD_GAP.md T1-T4 — CRUD ring-of-fire + DocAction overlay (window.__crud); glassbowl + idempiere both mount it
  'blue_future.js',    // FRONTEND_LANE_MASTER §OUTSTANDING item 0 — Blue Future UNOFFICIAL speculative-branch skin (W-BLUE-FUTURE-LIVE)
  'crud_ops.json',     // SO_FULL_CRUD_GAP.md — keyed CRUD verb/field/docAction store the overlay fetches on enable (incl. T1 docPolicy fan-out table)
  'pos_core.js',       // POS_ADDON_SPEC §P-1..§P-4 — POS fold glue (window.POSCore), == bim-compiler build/erp source
  'img_store.js',      // POS_KILLER_DEMO E-3 — device-local images folder (IDB, window.ImgStore), == bim-compiler build/erp source
  'pos_lens.js',       // POS_ADDON_SPEC — dumb-terminal POS lens (window.PosLens): record/pay/SEND, zero client state
  'sfx.json',          // §R2-AUDIO — ERP-surface SFX config (subtle POS earcons; sfx.js itself rides the viewer scope)
  'ninja_excel.js',   // NINJA EXCEL — Excel-as-report-binder engine (read/gate/run/verify; == bim-compiler build/erp)
  'ninja_rule.js',    // NINJA EXCEL — RULE tier: business phrase → SQL candidates from the AD dictionary (§7)
  'ninja_pill.js',    // NINJA EXCEL — the lens UI (drop/download); xlsx.mini.min.js lazy-loads, see below
  'xlsx.mini.min.js', // SheetJS (vendored) — lazy-loaded by ninja_pill.js on first open; precached for offline
  'ninja_sample.xlsx',// runnable sample workbook (generated from ad_seed.db stored columns)
  'erp_period_close.js', // §INTEG-WIRE — period-close fold = signed checkpoint = balance b/f (window.ErpPeriodClose)
  'period_close_ui.js',  // §INTEG-WIRE — in-app close/bootstrap on the live sidecar op-log (window.PeriodClose)
  'migrate_compare.html', // evaluator-facing comparison paper (docs/MigrateComparisonPaper.md) — linked from erp.html+idempiere.html
  'migrate_compare.md',   // its single source; deep papers (ERP/HolyGrail/OpLog/Distributed/BIMERP .md) fetch on-demand, not precached
  'qrcode.min.js',
  'manifest.json',
  'pills.json',
  'idmp_pills.js',     // §A — iDempiere bar registration layer (binds pills_idmp.json fn BY ID to IdmpPillActions)
  'pills_idmp.json',   // §A — sibling manifest for the iDempiere renderer surface (GATE-1: separate from pills.json)
  'zoom_across.js',    // abstract cross-surface Zoom Across registry (record → related surface; window.ZoomAcross)
  'redpill.png',       // RED PILL img — the contextual "Zoom Across" pill (showWhen:zoom-across)
  'idmp_history.js',   // §B — cross-tab history scrubber (Glassbowl #scrub pattern, read-only restore)
  'glassbowl_pills.js',   // §GB-PILLS — Glassbowl+Gravity ⋯ registry binding (binds pills_glassbowl/gravity.json BY ID)
  'pills_glassbowl.json', // §GB-PILLS — Glassbowl manifest (home/trace/untangle/reset/mute/panel/edit/qr/showme/about)
  'pills_gravity.json',   // §GRV-PILLS — Gravity manifest (home/undo/redo/edit/showme)
  'initbubble.json',
  'aplus.png',
  'logo_glass.png',       // glass-bubble client logo (header + sign-in mark)
  'doublebubble.jpg',     // big/main brand mark (login card · header · System Monitor) — NEUTRAL, not iDempiere's logo
  'favicon.png',          // tab/favicon (small bubble) — replaces the browser's default globe
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
  // SYSTEM_ADMIN_LANE §6 — GATED RELEASES (no auto-adopt-latest). We DON'T skipWaiting() here: a new deploy
  // installs but STAYS in `waiting` until the System admin clicks Apply in the Release page (→ SKIP_WAITING
  // message below). The running app therefore stays on its release until updated on purpose — a release/update
  // surface iDempiere has no in-app equivalent of. First-ever install still activates immediately (no prior
  // worker to supersede), so a cold visit is unaffected; only UPDATES wait. W-PLUGIN-RELEASE.
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
  if (event.request.mode === 'navigate') { event.respondWith(staleWhileRevalidate(event.request)); return; }
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

// staleWhileRevalidate — serve the cached document INSTANTLY (no network wait) while refreshing the cache
// in the background. Used for navigations so the init-bubble shell paints immediately on a warm load
// instead of awaiting the HTML over the network (ERP_INIT_BUBBLE_INSTANT.md). First-ever visit (no cache)
// awaits the network. Query is stripped for the cache key (the precached 'erp.html'/'idempiere.html' shell),
// so deep-links (?window=…) still hit the cached shell and the page reads its own params at runtime.
function staleWhileRevalidate(request) {
  var cacheUrl = request.url.split('?')[0];
  var revalidate = fetch(request).then(resp => {
    if (resp && resp.status === 200) {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone));
    }
    return resp;
  }).catch(() => null);
  return caches.match(cacheUrl).then(cached => {
    if (cached) return cached;   // instant — background revalidate already in flight
    return revalidate.then(r => r || caches.match(cacheUrl)).then(r => r ||
      new Response('<h1>Offline</h1><p>Open the ERP after a first online visit.</p>',
        { headers: { 'Content-Type': 'text/html' } }));
  });
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
