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
const CACHE_VERSION = 'v615';   // v615: UI-UNPARK §1 ON THE REAL AD-UI — ad_ui.js sources f.DisplayLogic + HIDES fields whose AD DisplayLogic is false for the open record (window.AdEvaluator); ad_evaluator.js loaded in erp.html before ad_ui.js. Witness erp/tests/poc_ad_displaylogic.js: AD_Menu#101 (Action=W) shown=10 hidden=5 (hides Workflow/Task/Process/Form/InfoWindow, keeps Window). PRIOR — v614: HISTORY KNOB on the ERP bar — idmp_history.js?v=4 gains the 5-stop breadth dial (off/low/mid/high/max) that surfaces the sniffer's §-stream DOC EVENTS at dial-able breadth via the shared common/history_tap.js?v=2 STOPS (low=POSTED/PCLOSE/KERNEL_OP milestones · mid=+CRUD/RULE/SIGN/NAVIGATE doc-changes · high=+KANBAN/ERP_SEARCH/AD_GRAPH/AD_DATA aids); doc-event ticks coloured by category (milestone gold · change blue · aid grey), press=bloom labels them, nav dots stay the restorable backbone; thumbnail (3rd richness) deferred per §LOCKED-5. Witness erp/tests/poc_idmp_history_knob.js §KNOB-RESULT PASS (off=0 · low=[POSTED] · mid=[POSTED,CRUD,RULE] · high=+AD_DATA, monotonic, persists, bloom labels); #216 tap regression §TAP-RESULT PASS. PRIOR — v613: UI-UNPARK §1 (AD_BEHAVIOR_HANDOFF) — fields REACT to AD logic on the Glassbowl CRUD form. ad_evaluator.js (window.AdEvaluator) now ships; crud_overlay.js synced from the build/erp source-of-truth (it was 0× effectiveFlags on main — the whole logic-eval foundation + the new applyAdLogic land together): DisplayLogic false→hide the row, ReadOnlyLogic→disable, MandatoryLogic→toggle the * marker, re-applied on every input/change so the form reshapes like iDempiere. Witness scripts/poc_ad_logic_live.js (6/6 real DisplayLogic flip visible↔hidden, 4/4 MandatoryLogic flip required; §FALSIFIER no-logic field inert) + poc_logic_eval ALL PASS. PRIOR — v612: PILL OUTSIDE-CLICK CLOSES, CONSISTENT ALL SURFACES (user wrap 2026-06-09: "click outside closes — intuitive + standard"). The two ERP bars (erp_pills.js?v=27, idmp_pills.js?v=7) drop `persistent:true` → a tap OUTSIDE the strip now collapses it (a ⋯ tap still toggles; tapping a pill INSIDE keeps it open) — matching the BIM viewer, the standard everywhere. Witness poc_pill_consistency.js §C-D flipped to OUTSIDE-CLOSES + §C-E re-tap-toggle (14/14). PRIOR — v611: PILL BOTTOM-RIGHT + CLICK-REVEAL-UP, CONSISTENT ALL SURFACES (user wrap 2026-06-09) — the pill ⋯ now rests at the BOTTOM-RIGHT corner (was right-edge vertically-CENTRED; collapsing used to drift it to mid-screen) and STAYS there; tapping it RISES the strip UP from behind the ⋯ (@keyframes pill-rise + PillBuilder _toggle `.pill-revealing`) and it STAYS OPEN until the user re-taps ⋯ (persistent dock) — the old auto STRIP-PEEK that slid pills out and RE-COLLAPSED is REMOVED ("and not collapse"). Collapsed-by-default everywhere; a gentle ⋯ bob cues "there's more". Applied to idempiere.html (idmp_pills.js?v=6), erp.html (erp_pills.js?v=26), and the BIM viewer (viewer/pill_builder.js?v=2 + viewer.html #mobile-pill) — the viewer was already bottom-right and keeps tap-outside-to-close. ERP.HTML SURGERY: the 7 toast-only 'arrives in a later task' stub pills (find/read/ledger/graphs/edit/process/settings) are REMOVED (that depth lives on idempiere.html; erp.html is the lean globe that funnels there); INSTALL + MIGRATE pills ADDED (reuse window.ErpPicker via erp_picker.js?v=26); the help pill is now a real dismissible HelpGuide card (tap a bubble → records; go deeper via iDempiere/Glassbowl/Gravity). pills.json?v=25 (16→11 pills), pill_builder.js?v=26. Witness poc_pill_consistency.js (§PILL-CONSISTENCY). PRIOR — v610: §P4 FRONT-DOOR PILL FINISH (prompts/FRONT_DOOR_PILL_FINISH.md §P4) — (§P4-4) the login-card onboarding row (Install/Migrate buttons + 'New here?' sub) is RETIRED: Install/Migrate are pill-ONLY now (behind the ⋯, login/pre-client-gated), reached via the kept window.openInstallFor/openMigrateFor — "stick to the pill" reverses #204's card buttons; (§P4-3) the self-reveal cue is now a TRUE STRIP PEEK — the actual hidden pills slide OUT (visible) then RE-COLLAPSE on the right strip (idmp_pills.js _evalReveal + @keyframes idmp-strip-peek), not just a ⋯ bob (with collapse-by-default a bob never showed the icons); (§P4-1/§P4-2) ShowMe is now CONTEXT-GATED — at the front door (pre-client) it drives an ONBOARDING store (overview steps → a visible centred card raised above the z-120 login via #helpCard z-index bump), in-client it restores the default AD tour (help_ops.json), driven through the SHARED help_overlay.js via the new additive setOps() — NO fork (erp.html/glassbowl diff=0). Fixes "ShowMe gives nothing at login" (the 6 AD-tour steps targeted nonexistent in-client keys → 0 badges behind the login). idmp_pills.js?v=5, help_overlay.js?v=23. Witness poc_pill_mobile.js PASS (§P4-1 onboard-card onTop + §P4-2 in-client o2c restore + §P4-3 peek visible→recollapse + §P3-A/B + §P0 + §P2); onboard 7/7 + idmp-host 32/0 + precache 100/0 green. v609: §P3-REOPENED CLEAN PILL PASS (prompts/FRONT_DOOR_PILL_FINISH.md) — (1) the iDempiere pill rail now mounts COLLAPSED BY DEFAULT on BOTH desktop + mobile (idmp_pills.js mount → PB.close): the clean resting state is just the ⋯; pills reveal ONLY on the user's ⋯ tap (also kills the mobile expanded-strip-over-content overlap), the §P2 peek cue fires at boot inviting the tap; (2) HELP/SHOWME is now a CLEAN Lucide 'showme' PILL (circleHelp, pills_idmp.json order 8, NOT stage-gated) that TOGGLES the shared help_overlay.js #needHelpCk (no fork) + lights when on (IdmpPillActive.showme) — the header '?' TEXT glyph is REMOVED and the floating 'NeedHelp?' checkbox is CSS-suppressed on this surface (#needHelpWrap display:none), honouring clean-Lucide-only + no-controls-outside-the-pill. icons.js +circleHelp; pills_idmp.json bumped ?v=26. Witness poc_pill_mobile.js PASS incl. §P3-A (collapsed-default) + §P3-B (showme clean pill); onboard 7/7 + idmp-host 31/0 green. v608: FRONT-DOOR PILL FINISH (prompts/FRONT_DOOR_PILL_FINISH.md) — (1) the iDempiere pill rail now mounts COLLAPSED BY DEFAULT on BOTH desktop + mobile (idmp_pills.js mount → PB.close): the clean resting state is just the ⋯; pills reveal ONLY on the user's ⋯ tap (also kills the mobile expanded-strip-over-content overlap), the §P2 peek cue fires at boot inviting the tap; (2) HELP/SHOWME is now a CLEAN Lucide 'showme' PILL (circleHelp, pills_idmp.json order 8, NOT stage-gated) that TOGGLES the shared help_overlay.js #needHelpCk (no fork) + lights when on (IdmpPillActive.showme) — the header '?' TEXT glyph is REMOVED and the floating 'NeedHelp?' checkbox is CSS-suppressed on this surface (#needHelpWrap display:none), honouring clean-Lucide-only + no-controls-outside-the-pill. icons.js +circleHelp; pills_idmp.json bumped ?v=26. Witness poc_pill_mobile.js PASS incl. §P3-A (collapsed-default) + §P3-B (showme clean pill); onboard 7/7 + idmp-host 31/0 green. v608: FRONT-DOOR PILL FINISH (prompts/FRONT_DOOR_PILL_FINISH.md) — §P0 new mobile-viewport visibility witness (erp/tests/poc_pill_mobile.js: 390×844 asserts #idmp-pillbar + install/migrate/erpdoc + lens pills RENDERED+visible+on-screen, not just config — disproves "pills missing on mobile"); §P1 the redundant 'How this compares' link is DROPPED from the iDempiere login card (the lightbulb erpdoc pill houses it now); §P2 the mobile pill strip is now a RIGHT-edge VERTICAL strip (mirrors desktop, was a bottom row dock) with safe-area inset + a self-reveal PEEK cue (idmp_pills.js _evalReveal) that fires WHENEVER pills are tucked behind the ⋯ (collapsed bar OR non-empty hidden-set: on mount / every stage change / every ⋯ toggle) — a brief 2-bob attract, not a loop. Witness poc_pill_mobile.js PASS + 390px screenshot; onboard 7/7 + idmp-host 31/0 regression green. (v607 = the independent in-flight #203 disposable-host persistence arc; this takes the higher version.)   // v606: PILL-ORGANISE pass (recovered from orphaned commit 368f681 after #204's squash-merge): the 'How this compares' paper is now a lightbulb 'Read / Compare' PILL (id=erpdoc) on iDempiere (was only a pre-auth login-card link); the redundant free-floating erp.html HUD compare-link is REMOVED (the lightbulb pill houses it); the login-card compare link gets the lightbulb icon; Install/Migrate pill icons reworked save→download (onto-device) + pipe→arrowRightLeft (transfer-across). Witness erp/tests/poc_onboard_front_door.js (7/7). v605: §0.10a front-door onboarding — Install + Migrate are first-class buttons on the iDempiere LOGIN CARD (both routed through the one ErpPicker, which delegates to ShowMe/Odoo); the lone direct-ShowMe card button is replaced. In-client, the Install/Migrate rail pills DEMOTE to the ⋯ overflow (restorable) instead of hiding entirely (idmp_pills.js _applyStage uses the builder hidden-set). [earlier PILL-ORGANISE note merged into v606]: the 'How this compares' paper is now a lightbulb 'Read / Compare' PILL (id=erpdoc) on iDempiere too (was only a pre-auth login-card link); the redundant free-floating erp.html HUD compare-link is REMOVED (the lightbulb pill houses it); the login-card compare link gets the lightbulb icon. Install/Migrate pill icons reworked save→download (onto-device) + pipe→arrowRightLeft (transfer-across) for clearer metaphors. Witness erp/tests/poc_onboard_front_door.js. v604: migrate_compare.html now FORWARDS to BIMCompiler docs MigrateComparisonPaper (single source, no local-copy drift); the erpdoc 'Read ERP' paper pill gets a distinct 'lightbulb' icon (was 'doc', looked like the other doc pills). v603: the existing 'erpdoc' (Read ERP) pill now links to the Migrate & Compare paper (was BIMCompiler/ERP/) — a one-line URL change; ALSO reverted the erroneously-added 'compare' pill on both manifests + the idmp_pills.js nav block (#198/#199 are undone, net = just the erpdoc link). Prior v601/v602 were that erroneous add. Prior: v600 §INTEG-WIRE — period-close in-app (erp_period_close.js + period_close_ui.js): an accountant closes a period → signed checkpoint = balance b/f on the live sidecar op-log; next load bootstraps from the checkpoint. Substrate (prompts/ERP_SUBSTRATE_INTEGRATION.md Phase 2 slice A) on the collapsed canonical kernel (commitGroup). Witness erp/tests/poc_period_close_wire.js (§INTEG-WIRE).
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
  'ad_evaluator.js',
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
