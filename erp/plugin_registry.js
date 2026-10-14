// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// plugin_registry.js — the Fold Engine OSGi-like plugin host (W-PLUGIN). Implements
//   prompts/PLUGIN_SYSTEM_LANE.md §Phase A. A `.foldbundle` is a single ES module that exports
//   `{ manifest, activate, deactivate }`; this host loads it, runs its lifecycle, and lets it CONTRIBUTE
//   into the SIX extension points (ad_modelval / ad_callout / ad_process / post_resolver token
//   map / kernel_ops / model_layer DocAction) — it adds NO new ServiceRegistry abstraction (out of scope, see the lane card).
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
    // SHARED STATE for out-of-order stops (two bundles stacked on the same token / dictionary row; either may stop first):
    //   token layers  - layered_registry per token key; the effective value is materialised into the host's plain postTokens object, the base (core) value is restored when the last layer goes.
    //   dict refs     - reference counts per dictionary row: a row a bundle activated/inserted stays so while ANY owner still needs it; the previous state returns only when the last owner stops.
    var LR = (typeof module !== 'undefined' && module.exports) ? require('./layered_registry') : (typeof window !== 'undefined' ? window.LayeredRegistry : null);
    var TOK_L = LR.create(), TOK_BASE = {}, DICT_REFS = {};

    // ── SCOPE: every contribution a bundle makes is recorded with its owner (= bundle id) so STOP can undo EXACTLY that (Host work H1, ~/Projects/Mfg/HOST_PLUGIN_LIFECYCLE_SPEC.md; OSGi: stopping a bundle unregisters its services).
    //    The engines (model_layer, ad_process, ad_callout, doc_poster) are LAYERED (layered_registry.js): a bundle registers {owner:id, rank:1} and removing the owner makes the previous (core) entry effective again.
    function makeScope(id) {
      var undo = [], once = {};
      return {
        id: id,
        rec: function (fn) { undo.push(fn); },
        once: function (key, fn) { if (!once[key]) { once[key] = 1; undo.push(fn); } },   // one removeOwner per engine
        size: function () { return undo.length; },
        undoAll: function () { var errs = []; while (undo.length) { try { undo.pop()(); } catch (e) { errs.push(e.message); } } once = {}; return errs; }
      };
    }
    var SAFE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
    // The BundleContext the lane card specifies — injected into activate/deactivate. Each engine is wrapped by a facade that records for undo.
    function buildCtx(manifest, scope) {
      var id = manifest.id, own = { owner: id, rank: 1 };
      function facade(engine) { return engine ? Object.create(engine) : null; }
      var modelval = facade(host.modelval);
      if (modelval) modelval.registerValidator = function (table, timing, name, fn) {
        host.modelval.registerValidator(table, timing, name, fn);
        scope.rec(function () { if (host.modelval.unregisterValidator) host.modelval.unregisterValidator(table, timing, name); });
      };
      var callout = facade(host.callout);
      if (callout) {
        callout.registerHandler = function (name, fn) { host.callout.registerHandler(name, fn, own); scope.once('callout', function () { if (host.callout.removeOwner) host.callout.removeOwner(id); }); };
        if (host.callout.defineCallout) callout.defineCallout = function (fqcn, factory) { var r = host.callout.defineCallout(fqcn, factory, own); scope.once('callout', function () { if (host.callout.removeOwner) host.callout.removeOwner(id); }); return r; };
      }
      var processE = facade(host.process);
      if (processE) {
        processE.registerHandler = function (cn, fn, meta) { host.process.registerHandler(cn, fn, meta, own); scope.once('process', function () { if (host.process.removeOwner) host.process.removeOwner(id); }); };
        if (host.process.defineProcess) processE.defineProcess = function (cn, factory) { var r = host.process.defineProcess(cn, factory, own); scope.once('process', function () { if (host.process.removeOwner) host.process.removeOwner(id); }); return r; };
      }
      var docAction = facade(host.docAction);
      if (docAction) {
        docAction.registerModel = function (table, impl) { host.docAction.registerModel(table, impl, own); scope.once('model', function () { if (host.docAction.removeOwner) host.docAction.removeOwner(id); }); };
        docAction.registerDocAction = function (table, impl) { var r = host.docAction.registerDocAction(table, impl, own); scope.once('model', function () { if (host.docAction.removeOwner) host.docAction.removeOwner(id); }); return r; };
      }
      var docClass = host.docClass ? { register: function (table, impl) { host.docClass.registerDocClass(table, impl, own); scope.once('docclass', function () { host.docClass.removeDocClassOwner(id); }); } } : null;
      // postTokens: a plain object the bundle assigns into; a Proxy turns every assignment into a LAYER owned by this bundle (rank 1), so stopping in ANY order restores the right value.
      var postTokens = null;
      if (host.postTokens) postTokens = new Proxy(host.postTokens, {
        set: function (t, k, v) {
          if (!(k in TOK_BASE)) TOK_BASE[k] = Object.prototype.hasOwnProperty.call(t, k) ? { v: t[k] } : null;
          TOK_L.add(k, v, own); t[k] = TOK_L.top(k).value;
          scope.once('tok:' + k, function () {
            TOK_L.remove(k, id); var top = TOK_L.top(k);
            if (top) t[k] = top.value; else { if (TOK_BASE[k]) t[k] = TOK_BASE[k].v; else delete t[k]; delete TOK_BASE[k]; }
          });
          return true;
        },
        deleteProperty: function (t, k) { delete t[k]; return true; }   // a bundle deleting a CORE token is not supported (documented); deleting its own on deactivate is harmless: stop re-materialises from the layers
      });
      // dict: dictionary staging with rollback (the Ninja pattern: stageModels/rollbackModel). Needs the host's WRITABLE db (run + query).
      function wdb() { if (!host.db || typeof host.db.run !== 'function') throw new Error('plugin ctx.dict: no writable db host injected'); return host.db; }
      function ref(key, owner, onFirst, onLast) {   // reference-counted dictionary state
        var r = DICT_REFS[key] || (DICT_REFS[key] = { owners: [], prev: null });
        if (!r.owners.length) onFirst(r);
        if (r.owners.indexOf(owner) < 0) r.owners.push(owner);
        scope.rec(function () { var rr = DICT_REFS[key]; if (!rr) return; rr.owners = rr.owners.filter(function (o) { return o !== owner; }); if (!rr.owners.length) { onLast(rr); delete DICT_REFS[key]; } });
      }
      var dict = {
        // activate(table, idCol, ids): set IsActive='Y' on EXISTING rows; the previous value returns when the LAST bundle needing the row stops.
        activate: function (table, idCol, ids) {
          if (!SAFE_ID.test(table) || !SAFE_ID.test(idCol)) throw new Error('plugin ctx.dict: bad identifier');
          var d = wdb(), n = 0;
          (ids || []).forEach(function (rid) {
            var cur = d.query('SELECT isactive AS a FROM ' + table + ' WHERE ' + idCol + '=?', [rid]);
            if (!cur.length) return;
            ref('act|' + table + '|' + idCol + '|' + rid, id,
              function (r) { r.prev = cur[0].a; if (r.prev !== 'Y') { d.run('UPDATE ' + table + ' SET isactive=\'Y\' WHERE ' + idCol + '=?', [rid]); n++; } },
              function (r) { if (r.prev !== 'Y') d.run('UPDATE ' + table + ' SET isactive=? WHERE ' + idCol + '=?', [r.prev, rid]); });
          });
          return n;
        },
        // insert(table, idCol, rows): INSERT rows (plain objects) whose id is absent; the rows are deleted when the LAST bundle that inserted (or shares) them stops.
        insert: function (table, idCol, rows) {
          if (!SAFE_ID.test(table) || !SAFE_ID.test(idCol)) throw new Error('plugin ctx.dict: bad identifier');
          var d = wdb(), n = 0;
          (rows || []).forEach(function (r) {
            var key = Object.keys(r).filter(function (k) { return k.toLowerCase() === idCol.toLowerCase(); })[0], rid = key != null ? r[key] : null;
            if (rid == null) throw new Error('plugin ctx.dict.insert: row without ' + idCol);
            var cols = Object.keys(r); cols.forEach(function (c) { if (!SAFE_ID.test(c)) throw new Error('plugin ctx.dict: bad column ' + c); });
            var exists = d.query('SELECT 1 AS x FROM ' + table + ' WHERE ' + idCol + '=?', [rid]).length > 0;
            var k = 'ins|' + table + '|' + idCol + '|' + rid;
            if (exists && !DICT_REFS[k]) return;   // a BASE row (not ours): never touched, never deleted
            ref(k, id,
              function () { d.run('INSERT INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return r[c]; })); n++; },
              function () { d.run('DELETE FROM ' + table + ' WHERE ' + idCol + '=?', [rid]); });
          });
          return n;
        }
      };
      return {
        manifest:   manifest,
        modelval:   modelval,                  // ad_modelval module (registerValidator/fireHooks)
        callout:    callout,                   // ad_callout module  (registerHandler / defineCallout)
        process:    processE,                  // ad_process module  (registerHandler w/ meta.kind / defineProcess)
        postTokens: postTokens,                // post_resolver token map — contribute a token
        // the 6th point (bim-compiler prompts/ERP_MODEL_LAYER.md §DESIGN 2): model_layer.js — a bundle brings its own
        // DocAction class (registerDocAction) and model hooks (registerModel) for its tables; zero host code per table.
        docAction:  docAction,
        docClass:   docClass,                  // doc_poster posting class (legacy IDocFactory): register(table, { derive })
        dict:       dict,                      // dictionary staging with rollback (IsActive flips, row inserts)
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
        state: STATES.INSTALLED, manifest: manifest, requires: manifest.requires || {}, budget: manifest.budget || null
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
      var scope = makeScope(id), ctx = buildCtx(rec.manifest, scope), activated = [];
      try {
        // HOT chunks (manifest.chunks.hot): modules that register synchronous hooks. Loaded and activated BEFORE the bundle is ACTIVE, so no covered save can run without them.
        var hot = (rec.manifest.chunks && rec.manifest.chunks.hot) || [];
        for (var i = 0; i < hot.length; i++) {
          var cm = typeof hot[i] === 'string' ? normalizeModule(await importer(resolveChunk(hot[i], rec.url))) : normalizeModule(hot[i]);
          if (cm && typeof cm.activate === 'function') await cm.activate(ctx);
          activated.push(cm);
        }
        if (typeof lh.module.activate === 'function') await lh.module.activate(ctx);
      } catch (e) {
        // ATOMIC start: undo everything contributed so far and go back to INSTALLED; the error propagates.
        for (var j = activated.length - 1; j >= 0; j--) { try { if (typeof activated[j].deactivate === 'function') await activated[j].deactivate(ctx); } catch (e2) { /* best effort */ } }
        var errs = scope.undoAll();
        rec.state = STATES.INSTALLED; store.put(rec);
        console.log('§PLUGIN-START-FAILED id=' + id + ' undone=' + (errs.length ? 'with ' + errs.length + ' undo error(s)' : 'clean') + ' error=' + e.message);
        throw e;
      }
      lh.ctx = ctx; lh.scope = scope; lh.chunks = activated;
      rec.state = STATES.ACTIVE; store.put(rec);
      var opId = appendOp('PLUGIN_START', { id: id, version: rec.version });
      console.log('§PLUGIN-START   id=' + id + ' state=' + rec.state + ' contributions=' + scope.size());
      return { id: id, state: rec.state, opId: opId };
    }

    async function stopBundle(id) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state !== STATES.ACTIVE) return { id: id, state: rec.state, opId: null };
      var lh = loaded[id], dctx = (lh && lh.ctx) || buildCtx(rec.manifest, makeScope(id));
      // the bundle's own deactivate first (anything custom), then its hot chunks in reverse, then the AUTOMATIC undo of every recorded contribution.
      if (lh && lh.module && typeof lh.module.deactivate === 'function') await lh.module.deactivate(dctx);
      var ch = (lh && lh.chunks) || [];
      for (var i = ch.length - 1; i >= 0; i--) { if (typeof ch[i].deactivate === 'function') await ch[i].deactivate(dctx); }
      var undone = lh && lh.scope ? lh.scope.size() : 0, errs = lh && lh.scope ? lh.scope.undoAll() : [];
      if (lh) { lh.ctx = null; lh.scope = null; lh.chunks = []; }
      rec.state = STATES.STOPPED; store.put(rec);
      var opId = appendOp('PLUGIN_STOP', { id: id });
      console.log('§PLUGIN-STOP    id=' + id + ' state=' + rec.state + ' undone=' + undone + (errs.length ? ' undoErrors=' + errs.length : ''));
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
        return { id: r.id, version: r.version, state: r.state, url: r.url, budget: r.budget || null };
      });
    }
    function get(id) { var r = store.get(id); return r ? { id: r.id, version: r.version, state: r.state, url: r.url, budget: r.budget || null } : null; }
    // resolveChunk(rel, bundleUrl): a chunk URL is relative to the directory of its bundle unless absolute.
    function resolveChunk(rel, bundleUrl) {
      if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(rel) || !bundleUrl) return rel;
      return String(bundleUrl).replace(/[^\/]*$/, '') + rel;
    }
    // restore(saved): what a reload does (plugin_overlay _hydrate): install every saved bundle, then start the ones that were ACTIVE in dependency order. Failures are collected, never thrown.
    async function restore(saved) {
      var failed = [], toStart = [];
      for (var i = 0; i < (saved || []).length; i++) {
        var b = saved[i]; if (!b || !(b.url || b.bundle)) continue;
        try { await installBundle(b.url || b.bundle); if (b.state === STATES.ACTIVE) toStart.push(b.id); }
        catch (e) { if (!/already installed/.test(e.message)) failed.push({ id: b.id, error: e.message }); else if (b.state === STATES.ACTIVE) toStart.push(b.id); }
      }
      var order = toStart; try { order = resolveDeps(toStart.map(function (x) { var r = store.get(x); return { id: x, version: r ? r.version : '0', requires: r ? r.requires : {} }; })); } catch (e) { /* keep saved order; startBundle reports the missing dep */ }
      var started = [];
      for (var k = 0; k < order.length; k++) { try { await startBundle(order[k]); started.push(order[k]); } catch (e) { failed.push({ id: order[k], error: e.message }); } }
      return { started: started, failed: failed };
    }

    return {
      installBundle: installBundle,
      startBundle: startBundle,
      stopBundle: stopBundle,
      restore: restore,
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
