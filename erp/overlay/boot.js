// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/boot.js — the ONE seam between the iDempiere-twin core (erp/idempiere.html) and the EXTENSION OVERLAY (prompts/ERP_DEPTH_FILM.md §EXTENSION-LAYER LAW, user 2026-10-14: the lens/pill/Home
// features are "an overlay over the immutable core"). The core carries exactly one `<script src="overlay/boot.js">` and nothing else about the overlay: no hooks, no styles, no tables, no manifest entries.
// The overlay reads the core only through its PUBLISHED seams (window.APP actor/client/role/org, window.__idmpDb, window.IdmpHost.focus, window.IdmpPillActions + pills_idmp.json fetch, the #idmp-content mount,
// the wizard's data-genesis-* attributes), writes nothing to the core database (TEMP views only), and every entry point is wrapped so an overlay fault can never break a core flow.
// Kill switch: `?overlay=0` in the URL, or localStorage idmp.overlay = 'off' -> the page is the pure core.
(function () {
  'use strict';
  var off = false;
  try { off = /[?&]overlay=0\b/.test(location.search) || localStorage.getItem('idmp.overlay') === 'off'; } catch (e) {}
  if (off) { console.log('§OVERLAY off (kill switch) - pure core'); return; }

  // ---- pill registration shim (must be installed SYNCHRONOUSLY: the core fetches pills_idmp.json right after this tag runs) ----
  // The core's idmp_pills.js fetches `pills_idmp.json` and binds each pill by id to window.IdmpPillActions. This wraps window.fetch for THAT one URL: it appends the overlay's pill entries to the JSON in
  // flight and adds late-bound actions to window.IdmpPillActions. pills_idmp.json on disk and the core actions are untouched; an action whose overlay module did not load says so instead of throwing.
  var PILLS = [
    { id: 'setuplens', name: 'Setup check', key: '', icon: 'check', order: 1.3, note: 'OVERLAY lens (ERP_DEPTH_FILM.md §SETUP-LENS): READ-ONLY - what the logged-in client still lacks before a first invoice; one SQL per line, legacy mechanism cited; changes no window.' },
    { id: 'windowlens', name: 'Window anatomy', key: '', icon: 'table', order: 1.35, note: 'OVERLAY lens (ERP_DEPTH_FILM.md §WINDOW-LENS): READ-ONLY - what the open window is made of, from the dictionary; changes no window.' }
  ];
  function late(fn) { return function () { var P = window.OverlayPills; if (P && typeof P[fn] === 'function') return P[fn](); console.log('§OVERLAY pill action ' + fn + ' unavailable (overlay module not loaded)'); }; }
  try {
    var realFetch = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '', p = realFetch.apply(this, arguments);
      if (!/pills_idmp\.json/.test(url)) return p;
      return p.then(function (res) {
        return res.clone().json().then(function (mf) {
          if (!mf || !mf.pills) return res;
          PILLS.forEach(function (x) { if (!mf.pills.some(function (y) { return y.id === x.id; })) mf.pills.push(x); });
          window.IdmpPillActions = window.IdmpPillActions || {};
          window.IdmpPillActions.setuplens = late('setupLens'); window.IdmpPillActions.windowlens = late('windowLens');
          console.log('§OVERLAY pills registered ids=' + PILLS.map(function (x) { return x.id; }).join(','));
          return new Response(JSON.stringify(mf), { status: res.status, statusText: res.statusText, headers: res.headers });
        }).catch(function () { return res; });
      });
    };
  } catch (e) { console.log('§OVERLAY pill shim failed (core unaffected): ' + e.message); }
  var cur = document.currentScript, base = cur && cur.src ? cur.src.replace(/[^\/]*$/, '') : 'overlay/';
  var FILES = ['invoice_open.js', 'goal_engine.js', 'dashboard_home.js', 'dashboard_gadgets.js', 'dashboard_docstatus.js', 'setup_lens.js', 'window_lens.js', 'quick_input.js', 'home.js', 'pills.js', 'quicksetup_ui.js'];
  var loaded = 0, failed = [];
  function next(i) {
    if (i >= FILES.length) { console.log('§OVERLAY loaded ' + loaded + '/' + FILES.length + (failed.length ? ' FAILED=' + failed.join(',') : '')); return; }
    var s = document.createElement('script'); s.src = base + FILES[i] + '?v=1';
    s.onload = function () { loaded++; next(i + 1); };
    s.onerror = function () { failed.push(FILES[i]); next(i + 1); };
    try { document.head.appendChild(s); } catch (e) { failed.push(FILES[i]); next(i + 1); }
  }
  next(0);
})();
