// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// help_idmp.js — idempiere HOST ADAPTER for the SHARED help_overlay.js (prompts/IDEMPIERE_TOUR_GUIDE.md).
// It REUSES help_overlay.js unchanged — NO FORK: this file contains ZERO coach logic (no coachPlan, no
// buildBadges, no step machine). It only calls window.__help.init({host, nav}) with idempiere's exposed
// globals, mapping the agreed key vocabulary (help_idmp_keymap.json) onto the host contract. READ-ONLY.
//
// HOST CONTRACT (docs/TourGuideHostContract.md §2): the FRONTEND lane (IDEMPIERE_RECORD_PANEL.md) publishes
//   window.IdmpHost = { trace(on), focus(key,map), openTab(key,tab), has(key)->bool, locate(key)->{x,y,r} }
// and tags its DOM by AD key + provides the #idmp-content mount. This adapter consumes that; it does NOT
// tag chrome or expose globals (that is the frontend's host-conformance job). Until IdmpHost lands, every
// nav fn no-ops gracefully (the tour shows its card + Read-more; ShowMe simply has nothing to drive yet).
(function () {
  if (typeof window === 'undefined' || !window.__help || typeof window.__help.init !== 'function') return;

  var KEYMAP = window.__helpIdmpKeymap || {};              // help_idmp_keymap.json, fetched/inlined by the page
  function H() { return window.IdmpHost || {}; }            // the frontend-exposed globals (may be absent yet)

  var nav = {
    // drive ShowMe through the host's exposed globals only — never reach into chrome internals.
    trace:   function (on)       { if (H().trace)   H().trace(on); },
    focus:   function (key)      { if (H().focus)   H().focus(key, KEYMAP[key] || null); },
    openTab: function (key, tab) { if (H().openTab) H().openTab(key, tab); },
    // has(key): does this chrome KNOW this AD key (→ make a numbered badge)? locate(key): its current rect.
    has:     function (key)      { return H().has ? !!H().has(key) : false; },
    locate:  function (key)      { return H().locate ? H().locate(key) : null; },
    jive:    function () {}                                 // idempiere has no audio layer (optional global)
  };

  var host = document.getElementById('idmp-content') || document.body;
  window.__help.init({ host: host, nav: nav, hostName: 'idempiere' });

  var keys = Object.keys(KEYMAP).filter(function (k) { return k !== '__meta'; });
  console.log('§TOUR overlay=help_overlay host=idempiere forked=0 adapter=init-only keys=' + keys.length +
    ' globals=' + (window.IdmpHost ? 'live' : 'pending'));
})();
