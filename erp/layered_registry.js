// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — layered_registry.js: the ONE layering/undo primitive for every extension registry (Host work H1, ~/Projects/Mfg/HOST_PLUGIN_LIFECYCLE_SPEC.md; Witness W-PLUGIN-LIFECYCLE).
//   OSGi parity: a service registered by a bundle has an owner and a ranking (Libero's DS components declare service.ranking=1); the highest rank wins, then the latest registration; stopping the bundle removes ITS layers and the
//   next layer (ultimately the core one) is the effective entry again. Used by model_layer (MODEL, DOCS), ad_process, ad_callout and doc_poster so stop restores the system instead of leaving overrides behind (AD-LAYER LAW rule 5).
//   PURE: no clock, no randomness; the registration sequence is a counter.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LayeredRegistry = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  function create() {
    var L = {}, seq = 0;
    function order(a, b) { return (a.rank - b.rank) || (a.seq - b.seq); }
    return {
      // add(key, value, {owner, rank}) -> the layer record. owner default 'core', rank default 0.
      add: function (key, value, opts) {
        opts = opts || {};
        var rec = { key: key, value: value, owner: opts.owner == null ? 'core' : String(opts.owner), rank: opts.rank == null ? 0 : Number(opts.rank), seq: ++seq };
        (L[key] = L[key] || []).push(rec); L[key].sort(order);
        return rec;
      },
      // remove(key, owner) -> number of layers removed
      remove: function (key, owner) {
        var a = L[key]; if (!a) return 0; var n = a.length;
        L[key] = a.filter(function (r) { return r.owner !== String(owner); });
        if (!L[key].length) delete L[key];
        return n - (L[key] ? L[key].length : 0);
      },
      removeOwner: function (owner) { var n = 0, self = this; Object.keys(L).forEach(function (k) { n += self.remove(k, owner); }); return n; },
      top: function (key) { var a = L[key]; return a && a.length ? a[a.length - 1] : null; },
      layers: function (key) { return (L[key] || []).slice(); },   // ascending: lowest first, effective last
      keys: function () { return Object.keys(L); },
      owners: function () { var o = {}; Object.keys(L).forEach(function (k) { L[k].forEach(function (r) { o[r.owner] = 1; }); }); return Object.keys(o).sort(); }
    };
  }
  return { create: create };
});
