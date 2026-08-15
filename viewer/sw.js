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
const CACHE_VERSION = 'v1036';   // bump on each deploy; per-change detail is the git commit message.
// v1031 (2026-08-15) streaming.js envInt: beam/railing->0, +13 remaining MEP device classes->0.05
// (a prior PR's version bump for this same change was lost in a squash-merge race -- see git log).
// v1030 (2026-08-15) §PIPE_DUCT_BLUE_TINT / §PHOTO_ENVMAP_DOUBLE_BOOST_FIX (bim-ootb PRs #1367,
// #1369) shipped without a viewer.html script-version bump, so an already-cached browser kept
// serving pre-fix effects.js/streaming.js under the same ?v= URL — user report "why is this still
// blue" after both fixes were confirmed merged. Fix is the viewer.html bump (effects.js?v=17->18,
// streaming.js?v=59->60) in this same commit; CACHE_VERSION bumped alongside per this project's own
// standing convention (every deploy bumps it) so the offline precache path is refreshed too.
// v1029 (2026-08-15) §CPE_DISCIPLINE_REVEAL_PULLOUT: the there-and-back retrace round replaced with
// a pull-out + a single repeated forward lap (effects.js/cinema_maxq.js/cinema_path_editor.js/
// cpe_room_title.js). New beat boundary plan.beats.pullout; A.cpeRevealCaptionAt (new) swaps the
// room title to the discipline name during the tail's own slots; buildup topout now completes at
// the end of the pull-out, not the instant of arrival. See bim-compiler prompts/
// CINEMA_DISCIPLINE_REVEAL.md's dated "session 3" section for the full design/witness record.
// v1028 (2026-08-14) §GANTT_SCHEDULE_STALE: the authored Gantt (schedules/tasks/task_elements) had
// NO staleness signal at all, unlike kernel_ops (canvas), which self-heals via _genVersion/
// _GANTT_CACHE_VERSION. Once materialized, a building's Gantt panel was frozen forever — never
// re-derived however much the scheduling code (gates, display remap, §GANTT_SHIFT_HOURS_DESYNC
// itself) changed since, while canvas kept rendering fresh placements. schedules.gen_version now
// mirrors that same self-heal: a non-captured (synthetic SCH_AUTHORED), non-baselined schedule
// materialized under an older gen_version is re-materialized in place the next time the Gantt
// drawer builds its task index (buildTaskIndex, time_machine.js). Captured (imported) schedules and
// anything with a baseline set are NEVER touched — verified with 6 direct cases (fresh/unstamped/
// stale/baselined/re-stamped/captured), all match spec exactly. See
// prompts/4D_SCHEDULE_PERFECTION.md §GANTT_SCHEDULE_STALE.
// v1027 (2026-08-14) §GANTT_SHIFT_HOURS_DESYNC: schedule_author.js materializeZones() was calling
// computeSchedule() without shiftHours, silently taking the internal 8h/day default while the real
// canvas movie (time_machine.js injectGantt) runs at rates.js SHIFT_HOURS (24h) — Gantt bars authored
// ~3x slower than canvas actually plays. Fixed (#1355): materializeZones forwards opts.shiftHours
// (undefined stays byte-identical, witnesses unaffected); the two real UI entry points now pass
// window.SHIFT_HOURS. Measured Hospital: old call span 88d (8h default) -> fixed call span 30d (24h),
// 2.93x. Does NOT touch kernel_ops/canvas — _GANTT_CACHE_VERSION unchanged. Bumping THIS version only
// so the browser actually fetches the fixed JS on next load (schedules/tasks tables are the
// user-editable product and are never auto-regenerated once materialized — see
// prompts/4D_SCHEDULE_PERFECTION.md). Landed as a follow-up commit — #1355 squash-merged before this
// bump's push reached it (the sw.js-orphan-on-late-push landmine this project already documents).
// v1026 (2026-08-14) §TIER_REGATE_WORKLIST: time_machine.js _tierAuditRegate rewritten from a
// full-array-rescan fixpoint to a worklist/dirty-queue (SESSION 7's named, measured, not-fixed
// bottleneck — 15,466ms of Terminal's 19,773ms 4D-gen wall time). A/B'd byte-identical against the
// old algorithm on all 7 shipped buildings (scripts/probe_tier_regate_worklist.js in bim-compiler);
// 6.1x Terminal, 8.0x LTU_AHouse, 3.0-5.4x the other 5. _GANTT_CACHE_VERSION 18->19 alongside this.
// v1025 (2026-08-14) §SUN_SHADOW_RESTORE: effects.js _buildStillAO() adapter gains a mask/blend pass
// that reconstructs world position from N8AO's own depth texture, samples A.sun.shadow.map the same
// way three.js's own basic getShadow() shader chunk does, edge-detects the raw shadow term, and
// blends the AO-composited image back toward the pre-AO sharp TAA beauty at detected sun-shadow
// BOUNDARIES only — restores the contrast N8AO's denoiseRadius=7 blur (untouched, PR #1343) was
// smearing across the sun-cast shadow edge. Witnessed: +18.7% contrast at a real Clinic sun-shadow
// boundary, 40x tighter near-edge-vs-far-from-edge diff ratio (no bleed into ordinary AO contact
// corners). Bump so returning browsers get the restore pass instead of the old AO-only composite.
// v1022 (2026-08-13) §SUN_SHADOW_DROWNED: effects.js §PHOTO_AO denoiseRadius 12->7, denoiseSamples
// 8->5 — "ever so slight" step up from Alt+G's own never-bumped 6/4 baseline (not a full revert),
// user's own call after the full-revert-to-6 witness measured +9.9% beam-foot shadow contrast but
// risked reintroducing #1331's pre-fix dark/noisy-indoors complaint at the far end. Bump so
// returning browsers get the new denoise pair instead of the old always-8/12 one. Collided with
// #1338's independent same-day v1021 bump (§GROUNDED_OVERRIDE_FIX, kept below) — took one past it,
// per this file's own KEEP-BOTH/take-the-higher merge convention.
// v1021 (2026-08-13) §GROUNDED_OVERRIDE_FIX: time_machine.js's _midairRepair/_midairAudit no longer
// let "grounded" override a real detected floating violation — bump so returning browsers actually
// regenerate the 1,105-element-wider repair instead of replaying a cached pre-fix schedule.
// Collided with #1337's independent same-day v1020 bump (glow-lens soft-edge/shape-fit, kept below)
// — took one past it, per this file's own KEEP-BOTH/take-the-higher merge convention.
// v1020 (2026-08-13) §GLOW_LENS_SOFT_EDGE + §GLOW_LENS_SHAPE_FIT: still-render fixture glow quads
// (effects.js _glowLensOn) now use a feathered-rectangle canvas texture instead of a flat
// untextured plane, and split round-ish fixtures (bbox aspect < 1.25) onto the round soft texture
// instead of forcing every fixture into a rectangle — bump so returning browsers get the softened/
// shape-fit look instead of the old hard-edged one.
// v1019 (2026-08-13) §NIGHT_LIGHT_NEARFIELD: tools.js NIGHT_LIGHT_DECAY 1.5->1.0 — real
// PointLights were blowing out to a flat highlight right up close under ACES tonemapping (bright
// from afar, "not evident" close up) — bump so returning browsers get the retuned falloff.
// v1018 (2026-08-13) §PHOTO_AO_EDGE: N8AO intensity 2->4 in effects.js/effects_gi_poc.js (corner/
// edge contact shadow had gone invisible after the v1016 screenSpaceRadius fix) — bump so
// returning browsers get the new intensity instead of a cached pre-fix pass. This PR's own v1017
// collided with #1333's independent same-day bump (kept below, per this file's own KEEP-BOTH/
// take-the-higher merge convention) — took one past it.
// v1017 (2026-08-13) §TIER2_PER_ELEMENT_CLAMP + §SHIFT_HOURS: 4D schedule generation changed
// (schedule_gate.js computeSchedule's crew shift + time_machine.js's Tier-2 remap) — bump so
// returning browsers regenerate instead of replaying a cached pre-fix schedule/asset set.
// Collided 3x this session, independent same-day bumps, none with a dedicated comment here (see
// their commit messages): #1331 v1013->v1014 (N8AO retune), #1332 v1014->v1015 (SW precache
// cache.add->fetch+put fix), #1334 v1015->v1016 (N8AO screen-space radius fix) — took one past
// the highest per this file's own KEEP-BOTH/take-the-higher merge convention.
// v1013 (2026-08-13) §17.17.4 (W-OCC3-ARM): occlStructEnabled armed default-true in dlod_nav.js —
// bump so returning browsers actually get the new default instead of a cached copy.
// v1012 (2026-08-13) §RULES_TABLE_SOURCE: rates/sequence_rules.json is PRECACHED (line ~234) and its
// content changed — LABOR_RATES.ELECTRICIAN.productivity re-synced to rates.js's 15 class keys. Its
// only readers are mep_report.html and boq_charts.html (viewer.html never calls loadSequenceRules),
// so without this bump those two pages keep costing 7 electrical classes off a stale 8-key table.
// Deliberately NOT accompanied by a _GANTT_CACHE_VERSION bump: the viewer's generated schedule is
// byte-unchanged by this commit (it never reads the JSON, and the rates.js edit is comment-only), so
// forcing every materialized building to re-bake would be churn with no behavioural difference.
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
  // §EFFECTS_COMPOSER_OFFLINE: setupEffects() (effects.js) dynamic-imports these 6 unconditionally
  // on every desktop (non-mobile) load, before streaming.js starts — not gated behind a keypress
  // like Alt+P/Alt+S. ~56KB total, trivial next to the libs above. Were never precached; on a
  // genuine offline+uncached load each import() rejects (sw.js's cacheFirst() synthesizes a 503 on
  // a failed fetch), caught by setupEffects()'s own try/catch (§EFFECTS_INIT_FAIL, degrades to
  // direct render) — not a crash, but silently drops SSAO shadows, the pick/clash/Find outline
  // highlight, and Alt+S Still-Refine. SHELL not DEFERRED: unlike web-ifc/xlsx these aren't behind
  // an optional feature, so they should be as guaranteed-present as the libs above.
  'lib/EffectComposer.js',
  'lib/RenderPass.js',
  'lib/TAARenderPass.js',
  'lib/SSAOPass.js',
  'lib/OutlinePass.js',
  'lib/OutputPass.js',
  'lib/BloomPass.js',
  // §CINEMA_SSAA (2026-07-18) + transitive-import completion: the 6 modules above `import` these
  // 8 (Pass/CopyShader ← everything; ShaderPass/MaskPass ← EffectComposer; SSAARenderPass ←
  // TAARenderPass; SimplexNoise/SSAOShader ← SSAOPass; OutputShader ← OutputPass) — precaching
  // only the 6 top-level files still 503'd the module graph's inner nodes on a genuine
  // offline+uncached load, same failure class §EFFECTS_COMPOSER_OFFLINE describes. In addition,
  // SSAARenderPass.js is now DIRECTLY imported by Cinema Orbit (Alt+C, effects.js §CINEMA_SSAA).
  'lib/Pass.js',
  'lib/CopyShader.js',
  'lib/ShaderPass.js',
  'lib/MaskPass.js',
  'lib/SSAARenderPass.js',
  'lib/SimplexNoise.js',
  'lib/SSAOShader.js',
  'lib/OutputShader.js',
];
// DEFERRED — heavy, feature-gated; cache-on-first-use OR via the offline-download button.
const DEFERRED_LIBS = [
  'lib/web-ifc-api-iife.js',  // §S284c: IFC parser (~5.8MB) — only on IFC drag-drop import
  'lib/web-ifc.wasm',          // §S284c: IFC parser WASM (~1.2MB)
  'lib/xlsx.full.min.js',      // ~0.9MB — only on boq_charts.html / spreadsheet export
  'lib/exceljs.min.js',        // ~0.9MB — only on Excel export
];
// §STAFFAGE_OFFLINE: Alt+P populate-staffage sprite cutouts (~4.2MB, PR #845) — shipped without
// ever being added here, so they fell through to the default cacheFirst() path: cache miss + a
// failed real fetch (offline) synthesizes a 503 (see cacheFirst()'s catch below), breaking Alt+P
// offline even after "Make available offline". Feature-gated like DEFERRED_LIBS, not auto-installed.
// SOURCE OF TRUTH is effects.js's _STAFFAGE_PEOPLE/_STAFFAGE_TREES — this list must mirror it
// exactly (see the matching comment there). Add/remove a staffage png in BOTH places, same PR.
const STAFFAGE_ASSETS = [
  'textures/staffage/people/person_sitting_casual_female.png',
  'textures/staffage/people/person_sitting_formal_male.png',
  'textures/staffage/people/person_standing_casual_male.png',
  'textures/staffage/people/person_standing_gesture_female.png',
  'textures/staffage/people/person_walking_gym_female.png',
  'textures/staffage/people/person_walking_shopping_female.png',
  'textures/staffage/trees/tree_beech.png',
  'textures/staffage/trees/tree_linden_big_old.png',
  'textures/staffage/trees/tree_linden_city.png',
  'textures/staffage/trees/tree_oak_big.png',
  'textures/staffage/trees/tree_oak_young.png',
  'textures/staffage/trees/tree_poplar.png',
];
// FULL set (back-compat): GET_PRECACHE returns this so the offline button = full offline.
const LOCAL_LIBS = [...SHELL_LIBS, ...DEFERRED_LIBS, ...STAFFAGE_ASSETS];

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
  'offline.html',
  'manifest.webmanifest',
  // Core viewer modules (order matches index.html script tags)
  'config.js',
  'db_resolve.js',
  'helpers.js',
  'loader.js',
  'effects.js',
  'cinema_maxq.js',
  'cinema_path_editor.js',
  'cpe_walk.js',
  'cpe_xr.js',
  'lib/mp4_mux.js',   // §MAXQ_MP4 — hand-rolled mp4 muxer; missing => MaxQ silently falls back to webm
  'input_registry.js',
  'scene.js',
  'streaming.js',
  'panels.js',
  'tools.js',
  'picking.js',
  'hover_name.js',
  'cpe_room_title.js',
  'cpe_day_counter.js',
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
  'mep_coordination.js',
  'real_placement_resolver.js',
  'routewalker.js',
  // NOTE: the Modeller app (modeller.html + disc_walker/str_walker*/walker_confidence/cross_edges/
  // bonsai_*) moved to /modeller/ with its own sw — see the trilogy refactor. Not precached here.
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
  'materialize.js',
  'doc_canvas.js',
  // Feature modules loaded by index.html
  '../erp/kernel_ops.js',   // the ONE kernel_ops (v13) — viewer-local copy no longer loaded by viewer.html
  'cost_panel.js',
  'clash_report.js',
  'clash_snag.js',
  'precision_cam.js',
  'schedule_gate.js',
  'time_machine.js',
  'dlod_nav.js',
  'schedule_author.js',
  'schedule_read_4d.js',
  'schedule_author_ui.js',
  'foreign_schedule.js',
  'schedule_diff.js',
  'schedule_sync.js',
  'schedule_editor.html',
  'schedule_editor_ui.js',
  'error_reporter.js',
  'print_sheet.js',
  'ghostglass.js',
  'qrcode.min.js',
  '../common/pill_builder.js',   // THE one canonical builder (PILLS_CONSOLIDATION_REVIEW_2026-07-03 — fork retired)
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
  'elevation.js',
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
  // §OFFLINE-GATEWAY-LEAK: was hardcoded network-first ("during tuning") — precached like every
  // other config file now so it stops re-hitting the network once cached.
  'sfx.json',
];

self.addEventListener('install', (event) => {
  // §PRECACHE-TRIM: auto-precache the SHELL only (not the deferred IFC/Excel giants). The deferred
  // libs cache on first use (cacheFirst) or via the offline-download button (GET_PRECACHE = full set).
  const _installSet = [...PRECACHE_ASSETS, ...SHELL_LIBS];
  console.log('§PRECACHE-TRIM install set=' + _installSet.length + ' deferred=' + DEFERRED_LIBS.length +
    ' (web-ifc/xlsx/exceljs off the install path, ~8.9MB)');
  // §SW_PRECACHE_STALE_FIX (2026-08-13): cache.add(url) fetches through the BROWSER's own HTTP
  // cache — a same-origin GET with an unexpired Cache-Control (these static assets serve
  // max-age=600) can be satisfied from that cache instead of hitting network, even during a
  // brand-new install triggered by a real CACHE_VERSION bump. Real repro: edit a precached file,
  // bump CACHE_VERSION, deploy — a browser that loaded the OLD file within the last 10 minutes
  // silently re-precaches that same stale response into the NEW version's cache, and won't
  // self-correct until the NEXT version bump. `{cache: 'reload'}` forces the underlying fetch to
  // bypass HTTP cache validation, so install always pulls the real current network response.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        _installSet.map(url =>
          fetch(url, { cache: 'reload' })
            .then(resp => cache.put(url, resp))
            .catch(err => console.warn('§SW_PRECACHE_SKIP', url, err.message))
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
  // room_walker.js lives under lib/ by folder placement only — it's OUR frequently-changing
  // room logic (PR #773/#776/#779 all touched it), not a third-party immutable vendor lib.
  // The blanket lib/ rule below silently starved it of the network-first path for 3 straight
  // deploys (found 2026-07-14, prompts/FUNCTIONAL_SPACE_MGMT_NEXT_SESSION.md §CACHE-LANDMINE) —
  // exempt it explicitly rather than trusting folder placement to imply immutability.
  if (base.endsWith('/lib/room_walker.js')) return true;
  // lib/ files are versioned and immutable — always cache-first
  if (base.includes('/lib/')) return false;
  // CDN fallback assets are also immutable — cache-first
  for (const cdn of CDN_ASSETS) {
    if (url === cdn || base === cdn) return false;
  }
  // Precached local files — cache-first (CACHE_VERSION bump purges + refreshes)
  var filename = base.split('/').pop();
  if (_PRECACHE_SET.has(filename)) return false;
  // §SQL-PATCH-NETWORK-FIRST (2026-07-25, measured on a real user session —
  // VIEWER_FIND_PANEL_ROOM_ACCURACY.md §17): `buildings/patches/*.sql` used to fall through to
  // cacheFirst, because only .html/.js were network-first and .sql matched nothing. That silently
  // breaks THE PROJECT'S OWN DB-CHANGE DOCTRINE (CLAUDE.md §DB CHANGES): every DB fix ships as a
  // small .sql applied at load by A._applyPendingPatch(), so an UPDATED patch could never reach an
  // already-installed client — the SW kept serving the first body it ever cached. Proven live: the
  // regenerated Hospital walkable raster went to OCI at 07:45:18Z, and a session SIX HOURS later
  // (rooms_meta.built_at 13:37:44Z) still compiled against the OLD raster — its saved db carries the
  // pre-fix Level 1 signature (x0=-0.0147 cols=304 rows=332 instead of x0=-12.5998 cols=403 rows=372)
  // and its console reproduced all three pre-fix §PATH_LEGAL_DETOUR_FAIL legs exactly
  // (34.2m/96, 39.5m/135, 10.1m/34). With the live patch applied to that same saved db: zero
  // DETOUR_FAIL. networkFirst (not no-cache) keeps the offline PWA path intact — it falls back to the
  // cached body when the network is gone, which is what §38-offline-pwa needs.
  if (base.endsWith('.sql')) return true;
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
