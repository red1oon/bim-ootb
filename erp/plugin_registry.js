// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// plugin_registry.js — the Fold Engine OSGi-like plugin host (W-PLUGIN). Implements
//   prompts/PLUGIN_SYSTEM_LANE.md §Phase A. A `.foldbundle` is a single ES module that exports
//   `{ manifest, activate, deactivate }`; this host loads it, runs its lifecycle, and lets it CONTRIBUTE
//   into the FIVE existing extension points (ad_modelval / ad_callout / ad_process / post_resolver token
//   map / kernel_ops) — it adds NO new ServiceRegistry abstraction (out of scope, see the lane card).
//
// SEPARATION CONTRACT (same as erp_engine.js §0.10): PURE host logic, no DB binding imported. The host
//   injects everything stateful:
//     host.db.query(sql,params) -> rows[]   (read-only SQL; the bundle's setup queries)
//     host.ops.append(opType, params) -> opId (kernel_ops appender — PLUGIN_* lifecycle audit ops)
//     host.import(url) -> Promise<module>   (browser: dynamic import(); node witness: require())
//     host.store                            (bundle-state persistence — IndexedDB in browser, Map in node)
//     host.modelval / host.callout / host.process / host.postTokens — the live engine modules a bundle
//       contributes into (passed through to the bundle's activate(ctx) verbatim).
//   No Date.now / Math.random / DOM / network of its own — deterministic, witness-replayable.
//
// LIFECYCLE (OSGi mapping in the lane card): INSTALLED → RESOLVED → ACTIVE → STOPPED → UNINSTALLED.
//   installBundle  — load module, validate manifest, engineVersion gate, append PLUGIN_INSTALL, store INSTALLED.
//   startBundle    — resolve `requires` (semver + must be ACTIVE first), call activate(ctx), append PLUGIN_START.
//   stopBundle     — call deactivate(ctx), append PLUGIN_STOP, state STOPPED.
//   uninstallBundle— stop if active, append PLUGIN_UNINSTALL, drop from store.
//   resolveDeps    — semver-checked topological sort over a manifest set; rejects missing deps + cycles.
//
// EXTRACT, DON'T INVENT: the host fabricates nothing — every account/value a bundle resolves comes from the
//   bundle's own host.db.query against real seed columns. The host only routes contributions.
'use strict';
// UMD — node: module.exports · browser: window.PluginRegistry (the Phase-D pill consumes it).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PluginRegistry = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {

  var STATES = {
    INSTALLED: 'INSTALLED', RESOLVED: 'RESOLVED', ACTIVE: 'ACTIVE',
    STOPPED: 'STOPPED', UNINSTALLED: 'UNINSTALLED'
  };

  // ── Minimal semver (no dep): parse "1.2.3" → [1,2,3]; satisfies a single-comparator range. ────────────
  // Supported ranges (enough for `engineVersion`/`requires`): "*", "x.y.z", "=x.y.z", ">=", ">", "<=", "<".
  // Pre-release/caret/tilde are deliberately NOT modelled (the lane is non-blocking; extend when a real
  // bundle needs them — never invent semantics we don't exercise).
  function parseVer(v) {
    var m = String(v == null ? '0' : v).trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return [0, 0, 0];
    return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
  }
  function cmpVer(a, b) {
    var x = parseVer(a), y = parseVer(b);
    for (var i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; }
    return 0;
  }
  function satisfies(version, range) {
    var r = String(range == null ? '*' : range).trim();
    if (r === '' || r === '*') return true;
    var m = r.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
    if (!m) return false;
    var op = m[1] || '=', target = m[2], c = cmpVer(version, target);
    switch (op) {
      case '>=': return c >= 0;
      case '>':  return c > 0;
      case '<=': return c <= 0;
      case '<':  return c < 0;
      default:   return c === 0;   // "=" or bare version → exact
    }
  }

  // ── Default in-memory store (node witness). Browser injects an IndexedDB-backed store (Phase D). ───────
  function memStore() {
    var m = {};
    return {
      get:  function (id) { return m[id] || null; },
      put:  function (rec) { m[rec.id] = rec; return rec; },
      del:  function (id) { delete m[id]; },
      list: function () { return Object.keys(m).map(function (k) { return m[k]; }); }
    };
  }

  // ── Manifest validation — id + version are mandatory; the rest is optional/contributory. ───────────────
  function validateManifest(mf) {
    if (!mf || typeof mf !== 'object') throw new Error('plugin: manifest is not an object');
    if (!mf.id || typeof mf.id !== 'string') throw new Error('plugin: manifest.id missing');
    if (!mf.version) throw new Error('plugin ' + mf.id + ': manifest.version missing');
    // `signature` is reserved but NOT enforced (no signing gate — see lane §Out of Scope).
    return true;
  }

  // resolveDeps(manifests[]) — semver-checked topological sort. Each manifest: { id, version, requires:{dep:range} }.
  // Returns dependency-first id order. Throws on a missing dep, a version conflict, or a cycle.
  function resolveDeps(manifests) {
    var byId = {};
    manifests.forEach(function (mf) { byId[mf.id] = mf; });
    // semver gate every declared requirement against the manifest set.
    manifests.forEach(function (mf) {
      var req = mf.requires || {};
      Object.keys(req).forEach(function (dep) {
        var dm = byId[dep];
        if (!dm) throw new Error('unresolved dependency: ' + mf.id + ' requires ' + dep);
        if (!satisfies(dm.version, req[dep]))
          throw new Error('version conflict: ' + mf.id + ' requires ' + dep + '@' + req[dep] + ' but found ' + dm.version);
      });
    });
    // DFS topo sort with on-stack cycle detection.
    var order = [], visiting = {}, done = {};
    function visit(id, stack) {
      if (done[id]) return;
      if (visiting[id]) throw new Error('dependency cycle: ' + stack.concat(id).join(' -> '));
      visiting[id] = true;
      var req = (byId[id].requires) || {};
      Object.keys(req).forEach(function (dep) { visit(dep, stack.concat(id)); });
      visiting[id] = false; done[id] = true; order.push(id);
    }
    manifests.forEach(function (mf) { visit(mf.id, []); });
    return order;
  }

  // ── Registry instance — bound to one host (one DB, one op-log, one engine set). ────────────────────────
  function create(host) {
    host = host || {};
    var store    = host.store || memStore();
    var importer = host.import || function (url) { return import(url); };   // browser default
    var appendOp = (host.ops && host.ops.append) || function () { return null; };
    var loaded   = {};   // id -> { module, ctx } — the live module handle + its activation ctx

    // The BundleContext the lane card specifies — injected into activate/deactivate.
    function buildCtx(manifest) {
      return {
        manifest:   manifest,
        modelval:   host.modelval   || null,   // ad_modelval module (registerValidator/fireHooks)
        callout:    host.callout    || null,   // ad_callout module  (registerHandler)
        process:    host.process    || null,   // ad_process module  (registerHandler w/ meta.kind)
        postTokens: host.postTokens || null,   // post_resolver token map (plain object) — contribute a token
        db:         host.db         || { query: function () { throw new Error('plugin ctx: no db host injected'); } },
        ops:        { append: appendOp }
      };
    }

    // Normalise an imported module across ESM/CJS interop (a default export wraps under `.default`).
    function normalizeModule(mod) {
      if (mod && mod.manifest) return mod;
      if (mod && mod.default && mod.default.manifest) return mod.default;
      return mod;
    }

    async function installBundle(urlOrBundle) {
      var url = null, mod, manifest;
      if (typeof urlOrBundle === 'string') {
        url = urlOrBundle;
        mod = normalizeModule(await importer(url));
        manifest = mod && mod.manifest;
      } else {                                  // an already-loaded bundle object { manifest, activate, ... }
        mod = normalizeModule(urlOrBundle);
        manifest = mod && mod.manifest;
      }
      validateManifest(manifest);
      // engineVersion gate — the bundle declares the engine range it needs; host.engineVersion is the running one.
      if (manifest.engineVersion && host.engineVersion && !satisfies(host.engineVersion, manifest.engineVersion))
        throw new Error('plugin ' + manifest.id + ' requires engine ' + manifest.engineVersion +
                        ' but running ' + host.engineVersion);
      if (store.get(manifest.id)) throw new Error('plugin already installed: ' + manifest.id);

      var opId = appendOp('PLUGIN_INSTALL', { id: manifest.id, version: manifest.version, manifestUrl: url });
      var rec = {
        id: manifest.id, version: manifest.version, url: url,
        state: STATES.INSTALLED, manifest: manifest, requires: manifest.requires || {}
      };
      store.put(rec);
      loaded[manifest.id] = { module: mod, ctx: null };
      console.log('§PLUGIN-INSTALL id=' + manifest.id + ' version=' + manifest.version + ' opId=' + opId);
      return { id: manifest.id, version: manifest.version, opId: opId, state: rec.state };
    }

    async function startBundle(id) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state === STATES.ACTIVE) return { id: id, state: rec.state, opId: null };

      // Resolve `requires`: every dep must be installed, semver-satisfied, and ALREADY ACTIVE (start order).
      var req = rec.requires || {};
      Object.keys(req).forEach(function (dep) {
        var dm = store.get(dep);
        if (!dm) throw new Error(id + ' requires ' + dep + ' (not installed)');
        if (!satisfies(dm.version, req[dep]))
          throw new Error(id + ' requires ' + dep + '@' + req[dep] + ' but found ' + dm.version);
        if (dm.state !== STATES.ACTIVE) throw new Error(id + ' requires ' + dep + ' to be ACTIVE first');
      });
      rec.state = STATES.RESOLVED; store.put(rec);

      var lh = loaded[id] || (loaded[id] = { module: normalizeModule(await importer(rec.url)) });
      var ctx = buildCtx(rec.manifest);
      if (typeof lh.module.activate === 'function') await lh.module.activate(ctx);
      lh.ctx = ctx;
      rec.state = STATES.ACTIVE; store.put(rec);
      var opId = appendOp('PLUGIN_START', { id: id, version: rec.version });
      console.log('§PLUGIN-START   id=' + id + ' state=' + rec.state);
      return { id: id, state: rec.state, opId: opId };
    }

    async function stopBundle(id) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state !== STATES.ACTIVE) return { id: id, state: rec.state, opId: null };
      var lh = loaded[id];
      if (lh && lh.module && typeof lh.module.deactivate === 'function')
        await lh.module.deactivate(lh.ctx || buildCtx(rec.manifest));
      rec.state = STATES.STOPPED; store.put(rec);
      var opId = appendOp('PLUGIN_STOP', { id: id });
      console.log('§PLUGIN-STOP    id=' + id + ' state=' + rec.state);
      return { id: id, state: rec.state, opId: opId };
    }

    async function uninstallBundle(id) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state === STATES.ACTIVE) await stopBundle(id);
      var opId = appendOp('PLUGIN_UNINSTALL', { id: id });
      delete loaded[id];
      store.del(id);
      console.log('§PLUGIN-UNINSTALL id=' + id);
      return { id: id, state: STATES.UNINSTALLED, opId: opId };
    }

    function list() {
      return store.list().map(function (r) {
        return { id: r.id, version: r.version, state: r.state, url: r.url };
      });
    }
    function get(id) { var r = store.get(id); return r ? { id: r.id, version: r.version, state: r.state, url: r.url } : null; }

    return {
      installBundle: installBundle,
      startBundle: startBundle,
      stopBundle: stopBundle,
      uninstallBundle: uninstallBundle,
      resolveDeps: resolveDeps,
      list: list,
      get: get,
      STATES: STATES
    };
  }

  return {
    create: create,
    resolveDeps: resolveDeps,
    satisfies: satisfies,
    parseVer: parseVer,
    cmpVer: cmpVer,
    validateManifest: validateManifest,
    STATES: STATES
  };
});
