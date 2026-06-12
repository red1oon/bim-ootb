/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// sw.js — Service Worker for offline support (S232, S239 cache versioning)
// Network-first for .html/.js (always fresh on deploy).
// Cache-first for heavy assets (.wasm, images). DB files skip SW (IndexedDB handles them).
//
// DEPLOY: bump CACHE_VERSION on every OCI upload. Old caches are purged on activate.
const CACHE_VERSION = 'v644';   // v644: §KRN_PERSIST_GUARD (P0 cache-clobber fix, user 2026-06-12 "cannot access building when refresh") — kernel_ops.js?v=4 _persistToIdb persists ONLY the building db (APP.db): the IDB write is keyed by APP.DB_URL but exported WHATEVER db handle was committed on, so wh_walk's commitGroup(W.opDb,…) (its own in-memory op-log db) overwrote the cached building with a 16KB op-only db (user log: §KRN_PERSIST url=…warehouse_gardenworld.db size=16KB, was 80KB) → reload §CACHE_HIT served it → no geometry tables, building never loaded. Guard placed BEFORE the debounce timer so a foreign-db commit can't cancel a pending legit persist either; skip logs §KRN_PERSIST_SKIP. erp/kernel_ops.js copy untouched (no APP.DB_URL on ERP pages → persist already a no-op there). Witness scripts/poc_wh_cache.js (W-WH-CACHE, bim-compiler): walk-open → §KRN_PERSIST_SKIP, reload → §CENTRES_RESULT rows=1 + §WH PILL gate=on; falsifier = BUILDING_OPEN's legit §KRN_PERSIST (S243 survive-refresh) still fires. PRIOR — v643: WAREHOUSE PICK-WALK ADDON (SPATIAL_PICKING_SPEC §S-2..§S-5) — DATA-GATED route pill on viewer.html (lights only when the loaded model carries locator-GUID bins; gate-off proven on SampleHouse): wh_route.js (pure route verb — walk order = m_bom_line.ordinal, off-model locator = explicit unroutable step) + wh_walk.js (pick-walk lens: FIND-lens depth ghost/solid/bright + fly-to per step; scan = BarcodeDetector + honest typed fallback through the SAME gate, wrong bin REFUSES; confirmed qty = ONE KernelOps.commitGroup of 2 ENACT_MOVE ops; last step → AdDocFsm.dispatchFor(323) CO, qtyOnHand fold foldKeys=4 diffs=0). Lazy-loads ../erp/erp_engine.js + ../erp/ad_docfsm.js + ad_seed.db at walk-open (network ok, offline walk = v2). +precache wh_route.js, wh_walk.js; ?v= bumps panels.js 38→39 (Lucide route pill), picking.js 26→27 (additive tap forward — non-target tap must NOT advance, falsifier-proven). Witnesses: W-WH-ROUTE PASS + W-WH-LIVE PASS (26 verdicts: walk/scan/complete on 390x844 touch) + W-WH-COMPILE/W-WH-SMOKE regression. PRIOR — v642: WORLD-CARD TRANSPORT FIX (CRUD_EDIT_PERSIST.md Item 3, user 2026-06-11 "clicking a building card still does not guarantee transport") — a RECURRENCE of the v636/v637 deep-link "sometimes" bug. Root cause (deterministic, NOT timing — the card's named suspect (a)): universal_history.js?v=19 _openDbUrl() read the building's re-open key from the ?db= QUERY PARAM, which is ABSENT on any open path without ?db= in the URL (default open / in-app pick) → the BUILDING_OPEN ref.db was null → whole_history._deepUrl fell back to a BARE page url → transport then relied on the fragile load-timing consumeRestore. FIX: _openDbUrl() now prefers the AUTHORITATIVE db the viewer actually loaded (A.DB_URL, set by streaming.js on every building load), so ref.db is ALWAYS stamped → the card deep-links viewer.html?db=<url>&sess=…&ghost=1 → the page reopens the building from its OWN url (no race). import:// dbs (tab-local IndexedDB) stay null on purpose (not cross-page openable → bare-url + RESTORE_KEY same-session fallback). Also new §WHOLE-LANDED trace at the viewer (pairs with §WHOLE-NAV at the click) so a card→land is traceable end-to-end. NO pill/drawer touched (W long-press drawer perpendicular rule intact: viewer/idmp sideways, glass/gravity untouched). Witness viewer/tests/poc_world_card_dbref.js (W-WORLD-DBREF 8/8: openDbUrl→A.DB_URL with no ?db=, REAL BUILDING_OPEN record stamps ref.db, _deepUrl deep-links, import:// → null, A-absent ?db= fallback) + poc_whole_deeplink regression green. PRIOR — v640: §PRECACHE-TRIM (UI_PAYLOAD_PERF.md Win #2) — the auto-install precache no longer pulls the ~8.9MB IFC/Excel giants (web-ifc-api-iife.js + web-ifc.wasm + xlsx + exceljs). LOCAL_LIBS split into SHELL_LIBS (three+sql-wasm+chart+FileSaver, auto-precached — render any building) vs DEFERRED_LIBS (the giants, NOT auto-precached). Every first-visitor's background download drops ~10MB → ~1.5MB. NOTHING lost offline: deferred libs cache (1) on first real use via cacheFirst, (2) on demand via the EXISTING install-badge "download for offline" button (scene.js _startOfflineDownload → GET_PRECACHE, which still returns the FULL SHELL+DEFERRED set). Witness viewer/tests/poc_precache_trim.js (W-PRECACHE-TRIM): install set excludes the giants, GET_PRECACHE full-set intact (button=full offline), deferred lib caches on fetch. PRIOR — v639: Z-DOTS BUGFIX (HISTORY_SESSION_EVENTS.md §RESUME, user 2026-06-11 "new session — the Z line does not show the dots") — (1) the COMMON section path (key 'x' / section-btn → A.toggleSection → applySectionAxis §SECTION ON) never recorded a dot — A1 wired only saveCut; tools.js?v=30 now emits UniversalHistory.recordEvent('SECTION_CUT', axis) at the §SECTION ON site. (2) scrub-restore drives the SAME real setters (HistoryTap.applyView → section.write → toggleSection) — common/history_tap.js?v=5 holds an isApplying() latch during applyView and universal_history.js?v=18 recordEvent gates on it, so browsing the past never mints fake dots. (3) load diagnostic §HIST_SESSION id=<sess> reHome=<bool> treeKey=<key> dots=<n> right after HB.configure — one line pinpoints empty-Z reports (fresh session vs read-only re-home vs non-recording action). Witness viewer/tests/poc_z_events.js extended (W-Z-EVENTS: toggle-path emitter + isApplying gate + diag present). PRIOR — v638: VIEWER SESSIONS (HISTORY_SESSION_EVENTS.md A2 [VIEWER], user 2026-06-11) — W is now a FLAT per-SESSION chooser. universal_history.js?v=17: a session = one open, tied to the browser TAB via sessionStorage (reload CONTINUES it; new tab/visit = NEW session → fresh Z + new W card); the Z tree key is scoped to (building, session) so each session has its own detail; the BUILDING_OPEN ref carries the session. whole_history.js?v=4: a viewer W card deep-links with &sess= so clicking RE-HOMES to that session's Z (read-only) — recording is gated off under ?sess so browsing the past never mutates it (viewer = light lane, no forking). Witness viewer/tests/poc_viewer_sessions.js (W-VIEWER-SESSION ALL PASS). PRIOR — v637: DETAIL EVENTS IN Z (HISTORY_SESSION_EVENTS.md A1, user 2026-06-10) — viewer detail actions that were invisible to history now record as read-only click-jumpable Z dots: clash-inspect, section-cut, measure. New read-only 'event' bucket in universal_history.js?v=16 PROFILES (ON from mid up; default 'max' shows them, 'low'/'off' hide), recorded via UniversalHistory.recordEvent (look-restore on scrub, NEVER a kernel op). Emitters: measure.js?v=49 (§CLASH_DETAIL→CLASH_INSPECT + §MEASURE→MEASURE), section_cut.js?v=8 (SECTION_CUT). Events stay PAGE-LOCAL (Z) — W still milestones-only. Witness viewer/tests/poc_z_events.js (W-Z-EVENTS ALL PASS: records at max, drops at low, 3 emitters wired). PRIOR — v636: WORLD-CARD DEEP-LINK (user 2026-06-10 "sometimes gets to the item, sometimes not") — a foreign World-history card navigated to a BARE page URL + relied on a load-timing consumeRestore, so it only reached the doc/building when the target happened to be ready. Now common/whole_history.js?v=3 buildItems bakes the ref INTO the url (viewer ?db=<dbUrl>&ghost=1 — the landing's openViewer format; idempiere ?window=W[&record=R] — the proven post-login deep-link) so each page's own deferred restore handles it. universal_history.js?v=15 stamps the BUILDING_OPEN ref with the ?db= the viewer was opened with (deterministic re-open key). RESTORE_KEY handoff kept as fallback. Witness common/tests/poc_whole_deeplink.js (W-WHOLE-DEEPLINK ALL PASS). PRIOR — v635: [merge of two v634 lanes] (A) BOMB CLEARS WORLD HISTORY (user 2026-06-10) — the W long-press → bomb cleared only the per-page TIMELINE (bim.hist.tree.*) + UniversalHistory, NEVER the cross-page WORLD log (WholeHistory's own bim.docHistory) → the W overlay still showed its timeline after a bomb. panels.js?v=38 _clearHistoryWithWarning now ALSO calls WholeHistory.clear() + re-renders the open overlay to empty (§HIST_CLEAR via=bomb confirmed world=cleared); witness viewer/tests/poc_bomb_clears_world.js (W-BOMB-WORLD ALL PASS). ALSO "Z doesn't work after bomb": clear() left the page tree EMPTY → open() showed a dead bar. universal_history.js?v=14 UniversalHistory.clear now RE-SEEDS one BUILDING_OPEN of A.activeBuilding (§HIST_RESEED) so Z has a live starting point; bomb order = UniversalHistory.clear (reseed) THEN WholeHistory.clear (wipes world) → Z = 1 "now" dot, World = empty. (B) the W pill's LONG-PRESS DRAWER (Z + bomb) now expands SIDEWAYS — a horizontal row to the LEFT of the W pill (panels.js?v=38 _worldHistDrawer flex-direction column→row + reposition), matching the ERP surfaces. Both lanes touch panels.js → merged into ONE panels.js?v=38. PRIOR — v633: HISTORY UI REWORK (HISTORY_KNOB_DIAL.md) — the amp-knob is SCRAPPED. (1) common/history_bar.js?v=4: the bottom bar is `‹ dots ›` only — ‹/› step the READ-ONLY view cursor, dots click-to-jump, hover=action; the bar is FOCUSABLE (tabindex) → blue left-edge highlight + ←/→ step ONLY while focused (Tab reaches it); knob/depth-slider/amber-halo DELETED. (2) universal_history.js?v=13: recording ALWAYS ON incl. mobile (was off on mobile → no dots); EVERY moment (incl. ops) carries a viewState stamp so stepping onto an op restores the scene (fixes "ticks move dots, scene doesn't change"); duplicate BUILDING_OPEN de-duped on reload (HB.tipInfo). (3) panels.js?v=37: the old History pill is REPLACED by ONE "W" World-history pill (two overlapping circles) — TAP=cross-page overlay, LONG-PRESS=drawer with Z (page dot-timeline) + bomb (clear, warns first, no shortcut). whole_history.js?v=2 mounts {launcher:false} (bottom-left clock retired). 'w' opens the World overlay; 'z' still opens the page bar. common/history_knob.js + its tests DELETED. PRIOR — v632: HISTORY KNOB-DIAL (the amp-knob, now removed). PRIOR — v631: WHOLE-HISTORY cross-page TIME-scroller (HISTORY_WHOLE_TIMELINE.md W1–W3) — new common/whole_history.js?v=1 is the ONE cross-page log every surface mirrors into ({page,ts,label,kind,ref}); history_bar.js?v=2 `_mirror` now routes through it; universal_history.js?v=11 mounts the cross-page launcher (clock pill bottom-left → overlay: WHOLE|THIS toggle + day-axis time scroller, long-press-back steps DAY→DAY into a horizontally-scrollable STRETCH) + best-effort read-only restore. ADDITIVE — the viewer's own bottom bar is untouched. Witnesses tests/poc_whole_{log,bar,time}.js + *_dom.js all PASS. PRIOR — v630: pill reveal-UP cue — viewer #mobile-pill rises on open (PillBuilder _toggle `.pill-revealing` + @keyframes pill-rise in viewer.html); part of the cross-surface pill consistency pass (erp/sw.js v611). pill_builder.js?v=2. (supersedes v629 history-bar merge.)
const CACHE_PREFIX = 'bim-ootb-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// Local copies of vendor libs — single-origin, no CDN dependency.
// §PRECACHE-TRIM (UI_PAYLOAD_PERF.md Win #2): split SHELL (auto-precached on install — needed to
// render ANY building) vs DEFERRED (the ~8.9MB IFC/Excel giants — NOT auto-precached). The deferred
// libs still work offline via TWO existing paths, so NOTHING is lost:
//   (1) cacheFirst() caches each on its FIRST real use (drop an IFC → web-ifc sticks);
//   (2) the install-badge "download for offline" button (scene.js _startOfflineDownload →
//       GET_PRECACHE) force-caches the FULL set on demand — GET_PRECACHE still returns SHELL+DEFERRED.
// This drops the auto-install footprint EVERY first-visitor pays from ~10MB → ~1.5MB.
const SHELL_LIBS = [
  'lib/three.webgpu.min.js', // §S276: r184 WebGPU (imports three.core.min.js)
  'lib/three.module.min.js', // §S276: r184 standard ESM fallback
  'lib/three.core.min.js',  // §S276: r184 core (split build)
  'lib/OrbitControls.module.js',  // §S276: r184 ESM
  'lib/sql-wasm.js',
  'lib/sql-wasm.wasm',
  'lib/chart.umd.min.js',
  'lib/FileSaver.min.js',
];
// DEFERRED — heavy, feature-gated; cache-on-first-use OR via the offline-download button.
const DEFERRED_LIBS = [
  'lib/web-ifc-api-iife.js',  // §S284c: IFC parser (~5.8MB) — only on IFC drag-drop import
  'lib/web-ifc.wasm',          // §S284c: IFC parser WASM (~1.2MB)
  'lib/xlsx.full.min.js',      // ~0.9MB — only on boq_charts.html / spreadsheet export
  'lib/exceljs.min.js',        // ~0.9MB — only on Excel export
];
// FULL set (back-compat): GET_PRECACHE returns this so the offline button = full offline.
const LOCAL_LIBS = [...SHELL_LIBS, ...DEFERRED_LIBS];

// CDN fallback URLs — cached opportunistically if loader falls back to them
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/sql-wasm.js',
  'https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/sql-wasm.wasm',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
];

// Local files to precache on install — viewer works fully offline after first visit.
// DB files are NOT here — they're cached in IndexedDB by A.cachedFetch().
const PRECACHE_ASSETS = [
  // Entry points
  'viewer.html',
  'boq_charts.html',
  'mep_report.html',
  'erp.html',
  'idempiere.html',
  '2d.html',
  'offline.html',
  'manifest.webmanifest',
  // Core viewer modules (order matches index.html script tags)
  'config.js',
  'helpers.js',
  'loader.js',
  'effects.js',
  'input_registry.js',
  'scene.js',
  'streaming.js',
  'panels.js',
  'tools.js',
  'picking.js',
  'tour.js',
  'clash_matrix.js',
  'measure.js',
  'sitecam.js',
  'issues.js',
  'excel.js',
  'walk.js',
  'city.js',
  'rates.js',
  'analysis_sidecar.js',
  'locale_loader.js',
  'decoder.js',
  'nlp.js',
  'semantic_enrichment.js',
  'scene_to_db.js',
  'import_db_builder.js',
  'diff.js',
  'variation_order.js',
  'import.js',
  'routewalker.js',
  // SPATIAL_PICKING_SPEC §S-2..§S-5: warehouse pick-walk addon (data-gated pill)
  'wh_route.js',
  'wh_walk.js',
  'main.js',
  // Workers (fetched on demand by import/export flows)
  'import_worker.js',
  'ifc_export_worker.js',
  'mesh_import_worker.js',
  // Grid + 2D modules
  'grid_config.js',
  'grid_views.js',
  'grid_door_arcs.js',
  'grid_contours.js',
  'grid_dim_chains.js',
  'grid_dims.js',
  'grid_drag.js',
  'grid_scissors.js',
  'grid_overlay.js',
  'grid_assembler.js',
  // S266/S267: Doc pill + BOM modules
  'bom_extract.js',
  'verb_expand.js',
  'bom_walker.js',
  'grid_state.js',
  'bom_engine/bom_strategies.js',
  'bom_engine/bom_constraints.js',
  'bom_engine/bom_diff.js',
  'bom_engine/bom_node.js',
  'bom_engine/bom_tree.js',
  'bom_engine/bom_grid.js',
  'bom_engine/bom_rules.js',
  'grid_kinematics.js',
  'grid_recompose.js',
  'doc_canvas.js',
  'route_walker.js',
  // Feature modules loaded by index.html
  'kernel_ops.js',
  'cost_panel.js',
  'clash_report.js',
  'clash_snag.js',
  'precision_cam.js',
  'schedule_gate.js',
  'time_machine.js',
  'error_reporter.js',
  'print_sheet.js',
  'ghostglass.js',
  'qrcode.min.js',
  'pill_builder.js',   // shared with the ERP app (ERP keeps its own copy at /erp/)
  // NOTE: the ERP app (erp.html, idempiere.html, ad_*/erp_* modules, icons.js, erp_pills.js,
  // pills.json, redpill/aplus.png) moved to /erp/ with its own sw — see ERP_FOLDER_HOME.md.
  // erp.html/idempiere.html below are now reroute STUBS that live in viewer/.
  'list_builder.js',
  'settings_editor.js',
  'panel_nav.js',
  // Lazy-loaded modules
  'navigate.js',
  'wizard.js',
  'wizard_orientation.js',
  'wizard_storeys.js',
  'wizard_classify.js',
  'section_cut.js',
  'dxf-parser.js',
  'dxf_export.js',
  'elevation.js',
  'title_block.js',
  'dlod.js',
  // Vendor libs not in LOCAL_LIBS (loaded by index.html)
  'lib/httpvfs.js',
  // Config files
  'clash_rules.json',
  'grid_rules.json',
  'rates/cidb2024_my.json',
  // Shared sequence/labour rules — one source for 4D schedule baker + drone order.
  // Precached so loadSequenceRules() resolves offline (else falls to hardcoded).
  'rates/sequence_rules.json',
  // §S280g: ground texture config + default tile (grass) precached for offline shadow mode.
  // earth/paved are lazy (cacheFirst caches on first selection).
  'ground_config.json',
  'textures/ground/grass_1k.jpg',
];

self.addEventListener('install', (event) => {
  // §PRECACHE-TRIM: auto-precache the SHELL only (not the deferred IFC/Excel giants). The deferred
  // libs cache on first use (cacheFirst) or via the offline-download button (GET_PRECACHE = full set).
  const _installSet = [...PRECACHE_ASSETS, ...SHELL_LIBS];
  console.log('§PRECACHE-TRIM install set=' + _installSet.length + ' deferred=' + DEFERRED_LIBS.length +
    ' (web-ifc/xlsx/exceljs off the install path, ~8.9MB)');
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
  // Purge ONLY this app's old caches (prefix-scoped) — the ERP app at /erp/ owns its own
  // 'erp-ootb-' caches and must not be deleted here (docs/ERP_FOLDER_HOME.md).
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Build a Set of precache basenames for O(1) lookup in isNetworkFirst()
const _PRECACHE_SET = new Set(PRECACHE_ASSETS);

// Returns true for URLs that should use network-first strategy.
// Precached files use cache-first — freshness guaranteed by CACHE_VERSION bump on deploy.
function isNetworkFirst(url) {
  var base = url.split('?')[0];
  // lib/ files are versioned and immutable — always cache-first
  if (base.includes('/lib/')) return false;
  // CDN fallback assets are also immutable — cache-first
  for (const cdn of CDN_ASSETS) {
    if (url === cdn || base === cdn) return false;
  }
  // Precached local files — cache-first (CACHE_VERSION bump purges + refreshes)
  var filename = base.split('/').pop();
  if (filename === 'sfx.json') return true;   // sfx config — always fresh (network-first) during tuning
  if (_PRECACHE_SET.has(filename)) return false;
  // Unknown JS/HTML not in precache list — network-first (safe default)
  if (base.endsWith('.html') || base.endsWith('.js')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip DB file fetches — handled by IndexedDB in cachedFetch()
  if (url.split('?')[0].endsWith('.db')) return;

  // Navigation requests always network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Network-first for local .html and .js — always get fresh on deploy
  if (isNetworkFirst(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for CDN libs, .wasm, images, CSS — these are immutable or change rarely
  event.respondWith(cacheFirst(event.request));
});

// Try network, fall back to cache (for files that change on deploy)
function networkFirst(request) {
  // Strip ?v=N query string for cache matching — HTML references main.js?v=11
  // but precache stores main.js. Both should match.
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
      // JS files: return empty 503 (script onerror handlers deal with it)
      if (cacheUrl.endsWith('.js')) return new Response('', { status: 503 });
      // Navigation: return offline page (resolve URL relative to SW scope)
      var offlineUrl = new URL('offline.html', self.registration.scope).href;
      return caches.match(offlineUrl).then(page =>
        page || new Response('<h1>Offline</h1><p>Open a building you viewed before.</p>',
          { headers: { 'Content-Type': 'text/html' } })
      );
    }));
}

// Try cache, fall back to network (for heavy/immutable assets + precached files)
function cacheFirst(request) {
  // Strip ?v=N for cache lookup — precache stores bare filenames
  var cacheUrl = request.url.split('?')[0];
  return caches.match(cacheUrl).then(cached => {
    if (cached) return cached;
    // Also try with the full URL (CDN assets are stored with full URL)
    return caches.match(request);
  }).then(cached => {
    if (cached) return cached;
    return fetch(request).then(resp => {
      if (!resp || resp.status !== 200) return resp;
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone));
      return resp;
    }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
  });
}

// §S283: Message handler — SKIP_WAITING for update flow, GET_PRECACHE for install flow
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_PRECACHE') {
    // Return the full precache list so the install flow can force-cache all assets
    event.ports[0].postMessage({ assets: PRECACHE_ASSETS, libs: LOCAL_LIBS, version: CACHE_VERSION });
  }
});
