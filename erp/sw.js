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
const CACHE_VERSION = 'v605';   // v605: §0.10a front-door onboarding — Install + Migrate are now first-class buttons on the iDempiere LOGIN CARD (both routed through the one ErpPicker, which delegates to ShowMe/Odoo); the lone direct-ShowMe card button is replaced. In-client, the Install/Migrate rail pills DEMOTE to the ⋯ overflow (restorable) instead of hiding entirely (idmp_pills.js _applyStage uses the builder hidden-set). Witness erp/tests/poc_onboard_front_door.js. v604: migrate_compare.html now FORWARDS to BIMCompiler docs MigrateComparisonPaper (single source, no local-copy drift); the erpdoc 'Read ERP' paper pill gets a distinct 'lightbulb' icon (was 'doc', looked like the other doc pills). v603: the existing 'erpdoc' (Read ERP) pill now links to the Migrate & Compare paper (was BIMCompiler/ERP/) — a one-line URL change; ALSO reverted the erroneously-added 'compare' pill on both manifests + the idmp_pills.js nav block (#198/#199 are undone, net = just the erpdoc link). Prior v601/v602 were that erroneous add. Prior: v600 §INTEG-WIRE — period-close in-app (erp_period_close.js + period_close_ui.js): an accountant closes a period → signed checkpoint = balance b/f on the live sidecar op-log; next load bootstraps from the checkpoint. Substrate (prompts/ERP_SUBSTRATE_INTEGRATION.md Phase 2 slice A) on the collapsed canonical kernel (commitGroup). Witness erp/tests/poc_period_close_wire.js (§INTEG-WIRE).
// v599: INIT-BUBBLE freshness backstop — SWR navigation (v598) reaches a returning user fresh only on the SECOND post-deploy reload (old SW serves the nav before the new one activates); erp.html+idempiere.html now do a one-shot controllerchange→reload so a deploy converges in ONE reload (witness erp/tests/poc_init_deploy_fresh.js: reload1Settled=B, oneReloadConverges=Y);
                                // v598: INIT-BUBBLE INSTANT — navigation served stale-while-revalidate (was network-first), so a warm load paints the init-bubble shell from cache with ZERO network round-trip instead of awaiting the HTML document over the wire (witness erp/tests/poc_init_instant.js: warm bubblePaint 883ms→<300ms under 800ms nav latency); db already deferred off the paint path;
                                // v597: pill ⋯ trigger UX — (a) FLAT horizontal kebab (icons.js moreHoriz) on ALL pill surfaces (erp.html + idempiere, desktop+mobile) so OUR ⋯ differs from Android's own vertical ⋮; (b) mobile dock anchors the ⋯ to a CONSTANT right-edge position (order:-1 + justify-content:flex-start) so it no longer re-centres out from under the finger on collapse;
                                // v596: Kanban "Odoo-marvel" cards + shared Graph/Kanban status palette (KANBAN_MARVEL_SPEC, PR #177) merged with the mobile pill-reopen fix (v595);
                                // v595: PILL_REOPEN_FIX — ⋯-collapsed mobile pill re-opens on re-tap; outside-tap close used `e.target!==trigger`, mis-read the trigger's inner <svg> tap as outside → folded-then-reopened in one tap so it never stayed collapsed; now `!trigger.contains(e.target)` (PR fix/pill-reopen);
                                // v594: Kanban "Odoo-marvel" cards (KANBAN_MARVEL_SPEC) — dictionary-driven avatar+title+amount+date (zero per-model code) + shared semantic status colour palette across Kanban cards AND Graph bars (consistent L&F, status-at-a-glance for the long tail);
                                // v593: ⚖ Rule pill client-scoping (RULE_EDIT_SPEC §11, PR #171) merged with chrome §A–§D — fold over the LOGGED-IN client (window.__idmpClient), honest tenant label + honest-disable on no-population (was hardcoded Odoo Client-12);
                                // v592: §D RED PILL — "just the pill" (our clean design, default) ⟷ classic iDempiere L&F toggle (key ','); scrubber dots-only (dropped ↶/↷ for pill-icon consistency); arrow-key record nav;
                                // v591: §A/§B fix — iDempiere pill dock is PERSISTENT (PillBuilder opts.persistent: outside-tap no longer auto-collapses the primary nav; ⋯ still toggles); mobile stack order pills-flush/scrubber-above;
                                // v590: §B ERP_BOTTOM_BAR — cross-tab history scrubber (Glassbowl #scrub): records window/tab/record nav moments, double-tap blooms chips, dot click = read-only restore;
                                // v589: §C ERP_BOTTOM_BAR lifecycle — Install/Migrate show only pre-client (login/tenant picker), hidden once a client is committed (GATE-2);
                                // v588: §A ERP_BOTTOM_BAR — iDempiere bottom/side bar rendered by the SHARED registry (idmp_pills.js + pills_idmp.json + PillBuilder, ⋯ collapse); retired the hand-rolled #idmp-pillrail;
                                // v587: §MOBILE-LANDING — phone post-login lands on the menu drawer (was empty canvas) + tap-to-close backdrop;
                                // v586: §MOBILE-VIEW — record LIST renders as .acc cards @≤760px (table = desktop only) + bottom pill rail;
                                // v585: Migrate INSTALL persists the merged tenant (shard-in → idbPut) so a
                                //       migrated client (e.g. Odoo 12) survives a plain reload — actual, not transient;
                                // v584: Migrate▸Odoo staged box + self-sufficient odoo_agent.zip bundle (P0);
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
  'erp_period_close.js', // §INTEG-WIRE — period-close fold = signed checkpoint = balance b/f (window.ErpPeriodClose)
  'period_close_ui.js',  // §INTEG-WIRE — in-app close/bootstrap on the live sidecar op-log (window.PeriodClose)
  'migrate_compare.html', // evaluator-facing comparison paper (docs/MigrateComparisonPaper.md) — linked from erp.html+idempiere.html
  'migrate_compare.md',   // its single source; deep papers (ERP/HolyGrail/OpLog/Distributed/BIMERP .md) fetch on-demand, not precached
  'qrcode.min.js',
  'manifest.json',
  'pills.json',
  'idmp_pills.js',     // §A — iDempiere bar registration layer (binds pills_idmp.json fn BY ID to IdmpPillActions)
  'pills_idmp.json',   // §A — sibling manifest for the iDempiere renderer surface (GATE-1: separate from pills.json)
  'idmp_history.js',   // §B — cross-tab history scrubber (Glassbowl #scrub pattern, read-only restore)
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
