// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* build_fresh.js — §ALTC_FRESH_BUILD (bim-compiler prompts/ALTC_FOUNDATION.md §ALTC_FRESH_BUILD).
 * ISSUE: a tab loaded before a deploy keeps running the scripts it loaded (sw.js skipWaiting + clients.claim swap the
 * worker, not the code already in the page), so Alt+C in that tab bakes the OLD build and nothing says so.
 * WHAT: compare the `?v=N` of every script this page loaded with the `?v=N` the server's copy of the same page names.
 * sw.js serves .html network-first, so a no-store fetch of the page is the server's copy. Pure apart from check()'s fetch.
 */
(function (global) {
  'use strict';
  var RX = /<script[^>]*\ssrc="([^"?#]+)\?v=([^"&#]+)"/g;
  function _base(src) { return String(src).split('#')[0].split('?')[0].split('/').pop(); }
  function _ver(src) { var m = /[?&]v=([^&#]+)/.exec(String(src)); return m ? m[1] : null; }
  // diff(servedHtml, loaded) — loaded: array of script src strings (as in document.scripts). -> {compared, stale:[{file,loaded,served}]}
  function diff(servedHtml, loaded) {
    var served = {}, m; RX.lastIndex = 0;
    while ((m = RX.exec(String(servedHtml || ''))) !== null) served[_base(m[1])] = m[2];
    var compared = 0, stale = [], seen = {};
    (loaded || []).forEach(function (src) {
      var f = _base(src), v = _ver(src);
      if (!f || v == null || seen[f] || !(f in served)) return;
      seen[f] = 1; compared++;
      if (served[f] !== v) stale.push({ file: f, loaded: v, served: served[f] });
    });
    return { compared: compared, stale: stale };
  }
  // check(doc, fetchFn, url) -> Promise<{state:'ok'|'stale'|'unknown', compared, stale, reason}>
  function check(doc, fetchFn, url) {
    try {
      var loaded = [].slice.call((doc && doc.scripts) || []).map(function (s) { return s.getAttribute ? (s.getAttribute('src') || '') : (s.src || ''); });
      if (typeof fetchFn !== 'function') return Promise.resolve({ state: 'unknown', compared: 0, stale: [], reason: 'no-fetch' });
      return Promise.resolve(fetchFn(url, { cache: 'no-store' })).then(function (r) {
        if (!r || !r.ok) return { state: 'unknown', compared: 0, stale: [], reason: 'http-' + (r ? r.status : 'none') };
        return r.text().then(function (t) {
          var d = diff(t, loaded);
          return { state: d.stale.length ? 'stale' : 'ok', compared: d.compared, stale: d.stale, reason: '' };
        });
      }).catch(function (e) { return { state: 'unknown', compared: 0, stale: [], reason: 'fetch-failed ' + (e && e.message || e) }; });
    } catch (e) { return Promise.resolve({ state: 'unknown', compared: 0, stale: [], reason: 'error ' + (e && e.message || e) }); }
  }
  var API = { diff: diff, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.BuildFresh = API;
})(typeof window !== 'undefined' ? window : globalThis);
