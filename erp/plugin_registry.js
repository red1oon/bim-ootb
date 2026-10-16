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
    INSTALLED: 'INSTALLED', RESOLVED: 'RESOLVED', STARTING: 'STARTING', ACTIVE: 'ACTIVE',
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
      var undo = [], once = {}, labels = [];
      return {
        id: id,
        label: function (l) { labels.push(l); },                      // what the bundle contributed, for the OSGi console detail pane (the 'Services registered' list)
        labels: function () { return labels.slice(); },
        rec: function (fn) { undo.push(fn); },
        once: function (key, fn) { if (!once[key]) { once[key] = 1; undo.push(fn); } },   // one removeOwner per engine
        size: function () { return undo.length; },
        undoAll: function () { var errs = []; while (undo.length) { try { undo.pop()(); } catch (e) { errs.push(e.message); } } once = {}; labels = []; return errs; }
      };
    }
    var SAFE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/, packed = {};   // packed[id] = this bundle's packs went in through the host's Pack In
    // §PACKIN-CHECK (§22 B7): a bundle that ships its dictionary as packs may register a form only under a Classname its dictionary carries (legacy: AD_Form.Classname -> the factory lookup).
    function formCheck(manifest, classname) {
      if (!(manifest.packs || []).length || !packed[manifest.id] || !host.db || typeof host.db.query !== 'function') return;
      var n = host.db.query("SELECT COUNT(*) AS n FROM ad_form WHERE classname=? AND isactive='Y'", [classname]);
      var ok = n && n[0] && Number(n[0].n) > 0;
      console.log('§PACKIN-CHECK bundle=' + manifest.id + ' form=' + classname + ' row=' + (ok ? 'yes' : 'NO'));
      if (!ok) throw new Error('§PACKIN-CHECK ' + manifest.id + ': form ' + classname + ' has no active AD_Form row');
    }
    // The BundleContext the lane card specifies — injected into activate/deactivate. Each engine is wrapped by a facade that records for undo.
    function buildCtx(manifest, scope) {
      var id = manifest.id, own = { owner: id, rank: 1 };
      function facade(engine) { return engine ? Object.create(engine) : null; }
      var modelval = facade(host.modelval);
      if (modelval) modelval.registerValidator = function (table, timing, name, fn) {
        host.modelval.registerValidator(table, timing, name, fn); scope.label('ModelValidator  ' + table + ' ' + timing + '  ' + name);
        scope.rec(function () { if (host.modelval.unregisterValidator) host.modelval.unregisterValidator(table, timing, name); });
      };
      var callout = facade(host.callout);
      if (callout) {
        callout.registerHandler = function (name, fn) { host.callout.registerHandler(name, fn, own); scope.label('ICallout handler  ' + name); scope.once('callout', function () { if (host.callout.removeOwner) host.callout.removeOwner(id); }); };
        if (host.callout.defineCallout) callout.defineCallout = function (fqcn, factory) { var r = host.callout.defineCallout(fqcn, factory, own); scope.label('ICallout class  ' + fqcn); scope.once('callout', function () { if (host.callout.removeOwner) host.callout.removeOwner(id); }); return r; };
        if (host.callout.defineColumnCallout) callout.defineColumnCallout = function (table, columns, name, start) { host.callout.defineColumnCallout(table, columns, name, start, own); scope.label('IColumnCallout  ' + table + '.' + [].concat(columns).join('/') + '  ' + name); scope.once('callout', function () { if (host.callout.removeOwner) host.callout.removeOwner(id); }); };
      }
      var processE = facade(host.process);
      if (processE) {
        processE.registerHandler = function (cn, fn, meta) { host.process.registerHandler(cn, fn, meta, own); scope.label('IProcessFactory handler  ' + cn); scope.once('process', function () { if (host.process.removeOwner) host.process.removeOwner(id); }); };
        if (host.process.defineProcess) processE.defineProcess = function (cn, factory) { var r = host.process.defineProcess(cn, factory, own); scope.label('IProcessFactory process  ' + cn); scope.once('process', function () { if (host.process.removeOwner) host.process.removeOwner(id); }); return r; };
      }
      var docAction = facade(host.docAction);
      if (docAction) {
        docAction.registerModel = function (table, impl) { host.docAction.registerModel(table, impl, own); scope.label('IModelFactory  ' + table + '  [' + Object.keys(impl || {}).sort().join(', ') + ']'); scope.once('model', function () { if (host.docAction.removeOwner) host.docAction.removeOwner(id); }); };
        docAction.registerDocAction = function (table, impl) { var r = host.docAction.registerDocAction(table, impl, own); scope.label('DocAction class  ' + table); scope.once('model', function () { if (host.docAction.removeOwner) host.docAction.removeOwner(id); }); return r; };
      }
      var docFsm = host.docFsm ? { register: function (tableId, fam) { host.docFsm.registerFamily(tableId, fam, id); scope.label('DocAction FSM  AD_Table ' + tableId + '  (' + (fam && fam.name) + ')'); scope.once('docfsm', function () { host.docFsm.removeFamilyOwner(id); }); } } : null;
      var form = host.form ? { register: function (classname, desc) { formCheck(manifest, classname); host.form.register(classname, desc, own); scope.label('IFormFactory  ' + classname); scope.once('form', function () { host.form.removeOwner(id); }); } } : null;   // the generic AD_Form engine (ad_form_generic.js): a form is a descriptor, never host code
      var lens = host.lens ? { register: function (lid, desc) { host.lens.register(lid, desc, own); scope.label('Ops lens  ' + lid); scope.once('lens', function () { host.lens.removeOwner(id); }); } } : null;   // the opt-in operations lens (ad_lens.js): record actions over the host's own seams, never a write of its own
      var docClass = host.docClass ? { register: function (table, impl) { host.docClass.registerDocClass(table, impl, own); scope.label('IDocFactory  ' + table); scope.once('docclass', function () { host.docClass.removeDocClassOwner(id); }); } } : null;
      // postTokens: a plain object the bundle assigns into; a Proxy turns every assignment into a LAYER owned by this bundle (rank 1), so stopping in ANY order restores the right value.
      var postTokens = null;
      if (host.postTokens) postTokens = new Proxy(host.postTokens, {
        set: function (t, k, v) {
          if (!(k in TOK_BASE)) TOK_BASE[k] = Object.prototype.hasOwnProperty.call(t, k) ? { v: t[k] } : null;
          TOK_L.add(k, v, own); t[k] = TOK_L.top(k).value; scope.label('GL token  ' + k);
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
        docFsm:     docFsm,                    // the document-action state machine entry of a plugin's own document table (ad_docfsm.js DOC_FAMILY, layered, owner-removed)
        form:       form,                      // generic AD_Form descriptor: register(classname, { params, columns, rows, run })
        lens:       lens,                      // opt-in operations lens: register(id, { actions(api), run(actionId, api) }) (ERP_FRIENDLY_OPS_LENS.md §15)
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

    // ── LAZY ACTIVATION (Host work H2, OSGi Bundle-ActivationPolicy: lazy) ───────────────────────────────────────────────────────────────────────────────────────────────────
    //   START   = the admin chose to run the bundle. EAGER bundles activate right away (state ACTIVE). LAZY bundles (manifest.activation 'lazy' + triggers, or the admin override rec.policy) become STARTING: hooks NOT live, code not loaded.
    //   ACTIVATE = the first demand: need({table|process|window}) at an async seam activates every STARTING bundle whose declared trigger matches (what OSGi does when a consumer first requests the bundle's service / loads its class).
    var pending = {}, inflight = {};   // id -> { tables:{}, processes:{}, windows:{} } of STARTING bundles ; id -> Promise of an activation in progress
    function norm(list) { var o = {}; (list || []).forEach(function (x) { o[String(x).toLowerCase()] = 1; }); return o; }
    function policyOf(rec) { var p = rec.policy || (rec.manifest && rec.manifest.activation) || 'eager'; var t = rec.manifest && rec.manifest.triggers;
      return (p === 'lazy' && t && ((t.tables || []).length || (t.processes || []).length || (t.windows || []).length)) ? 'lazy' : 'eager'; }

    // manifest.dictionary = [{ table, idCol, rows }] - the 2Pack part of a bundle (menu/window rows): staged at START, even for a LAZY bundle, because the user must be able to REACH the lazy trigger (the menu leaf of the window) before any code has run.
    //   Undone (refcounted, previous state restored) at STOP or a failed activation. Code-time staging stays available through ctx.dict inside activate().
    function stageDictionary(rec, scope) {
      var dict = (rec.manifest && rec.manifest.dictionary) || []; if (!dict.length) return 0;
      var c = buildCtx(rec.manifest, scope), n = 0;
      dict.forEach(function (d) { n += c.dict.insert(d.table, d.idCol, d.rows) || 0; });
      return n;
    }
    // manifest.packs = ['dir/2Pack_<x.y.z>.zip', ...] relative to the bundle (ERP_FRIENDLY_OPS_LENS.md §22 B1); manifest.sqlFunctions = './x.mjs' exporting functions(R) -> { name: { arity, fn } } (§24). The host applies them (fetch + PipoPackIn.incremental on the dictionary DB) and keeps them;
    //   the rows they write are DICTIONARY data, outside the bundle's undo scope: Stop and Uninstall leave them, as legacy does.
    async function packIn(rec) {
      var packs = (rec.manifest && rec.manifest.packs) || []; if (!packs.length) return null;
      if (!host.packs || typeof host.packs.apply !== 'function') {   // a headless host (node model witnesses) has no dictionary pipeline: said loudly, and the §PACKIN-CHECK is not applied (nothing was packed in)
        console.log('§PACKIN-SKIP bundle=' + rec.id + ' packs=' + packs.length + ' reason=host has no Pack In (headless host; the dictionary rows of the packs are NOT applied)'); packed[rec.id] = false; return null; }
      var list = packs.map(function (p) { var m = /2Pack_(\d+\.\d+\.\d+)\.zip$/.exec(p); if (!m) throw new Error('plugin ' + rec.id + ': pack name ' + p + ' is not 2Pack_<x.y.z>.zip'); return { version: m[1], url: resolveChunk(p, rec.url) }; });
      var fnUrl = rec.manifest.sqlFunctions ? resolveChunk(rec.manifest.sqlFunctions, rec.url) : null;   // the bodies of the packs' CREATE FUNCTION statements (§24): they belong to the pack, bound by the host with it
      var r = await host.packs.apply(rec.id, list, { functions: fnUrl });
      if (!r || !r.ok) throw new Error('plugin ' + rec.id + ': Pack In failed - ' + (r && r.error || 'no result'));
      packed[rec.id] = true;
      return r;
    }
    function undoStartScope(id) { var lh = loaded[id]; if (lh && lh.startScope) { var errs = lh.startScope.undoAll(); lh.startScope = null; return errs; } return []; }

    async function startBundle(id) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state === STATES.ACTIVE || rec.state === STATES.STARTING) return { id: id, state: rec.state, opId: null };
      checkRequires(rec, false);
      await packIn(rec);   // §22 B2: the bundle's 2Packs go in BEFORE its dictionary staging and before any code (Incremental2PackActivator.start); a failed pack refuses the Start
      if (policyOf(rec) === 'lazy') {
        var sc0 = makeScope(id); try { stageDictionary(rec, sc0); } catch (e0) { sc0.undoAll(); throw e0; } (loaded[id] || (loaded[id] = {})).startScope = sc0;
        var t = rec.manifest.triggers; pending[id] = { tables: norm(t.tables), processes: norm(t.processes), windows: norm(t.windows) };
        rec.state = STATES.STARTING; store.put(rec);
        var lop = appendOp('PLUGIN_START', { id: id, version: rec.version, lazy: true });
        console.log('§PLUGIN-START   id=' + id + ' state=' + rec.state + ' (lazy: activates on first demand)');
        return { id: id, state: rec.state, opId: lop };
      }
      return activateNow(id, 'start');
    }

    // requires: every dependency must be installed + semver-satisfied; an ACTIVE one is fine; a STARTING one is activated on demand first (OSGi lazy dependency); anything else is an error.
    function checkRequires(rec, allowPending) {
      var req = rec.requires || {};
      Object.keys(req).forEach(function (dep) {
        var dm = store.get(dep);
        if (!dm) throw new Error(rec.id + ' requires ' + dep + ' (not installed)');
        if (!satisfies(dm.version, req[dep])) throw new Error(rec.id + ' requires ' + dep + '@' + req[dep] + ' but found ' + dm.version);
        if (dm.state !== STATES.ACTIVE && !(dm.state === STATES.STARTING)) throw new Error(rec.id + ' requires ' + dep + ' to be ACTIVE first');
      });
    }

    async function activateNow(id, why) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state === STATES.ACTIVE) return { id: id, state: rec.state, opId: null };
      checkRequires(rec);
      var req = rec.requires || {};
      for (var d = 0; d < Object.keys(req).length; d++) { var dep = Object.keys(req)[d]; if (store.get(dep).state === STATES.STARTING) await need({ activateId: dep }); }
      rec.state = STATES.RESOLVED; store.put(rec);   // pending[id] stays until the activation COMPLETES, so a concurrent need() finds it and awaits the same in-flight activation

      var lh = loaded[id] || (loaded[id] = {}); if (!lh.module) lh.module = normalizeModule(await importer(rec.url));
      var scope = makeScope(id), ctx = buildCtx(rec.manifest, scope), activated = [];
      try {
        if (!lh.startScope) stageDictionary(rec, scope);   // an EAGER bundle stages its dictionary with its activation; a LAZY one already did at START
        // HOT chunks (manifest.chunks.hot): modules that register synchronous hooks. Loaded and activated BEFORE the bundle is ACTIVE, so no covered save can run without them.
        var hot = (rec.manifest.chunks && rec.manifest.chunks.hot) || [];
        for (var i = 0; i < hot.length; i++) {
          var cm = typeof hot[i] === 'string' ? normalizeModule(await importer(resolveChunk(hot[i], rec.url))) : normalizeModule(hot[i]);
          if (cm && typeof cm.activate === 'function') await cm.activate(ctx);
          activated.push(cm);
        }
        if (typeof lh.module.activate === 'function') await lh.module.activate(ctx);
      } catch (e) {
        // ATOMIC activation: undo everything contributed so far and go back to INSTALLED; the error propagates (to start / to the seam that demanded it).
        for (var j = activated.length - 1; j >= 0; j--) { try { if (typeof activated[j].deactivate === 'function') await activated[j].deactivate(ctx); } catch (e2) { /* best effort */ } }
        var errs = scope.undoAll().concat(undoStartScope(id));
        rec.state = STATES.INSTALLED; store.put(rec); delete pending[id];
        console.log('§PLUGIN-START-FAILED id=' + id + ' undone=' + (errs.length ? 'with ' + errs.length + ' undo error(s)' : 'clean') + ' error=' + e.message);
        throw e;
      }
      lh.ctx = ctx; lh.scope = scope; lh.chunks = activated;
      rec.state = STATES.ACTIVE; store.put(rec); delete pending[id];
      var opId = appendOp(why === 'demand' ? 'PLUGIN_ACTIVATE' : 'PLUGIN_START', { id: id, version: rec.version, why: why });
      console.log('§PLUGIN-' + (why === 'demand' ? 'ACTIVATE' : 'START   ') + ' id=' + id + ' state=' + rec.state + ' contributions=' + scope.size());
      return { id: id, state: rec.state, opId: opId };
    }

    // need(trigger): trigger = { table } | { process } | { window } | { activateId } - activates the matching STARTING bundles (one activation per bundle even under concurrent demand). Resolves to the activated ids.
    function matching(trig) {
      trig = trig || {};
      return Object.keys(pending).filter(function (id) {
        var p = pending[id];
        if (trig.activateId) return id === trig.activateId;
        return (trig.table && p.tables[String(trig.table).toLowerCase()]) || (trig.process && p.processes[String(trig.process).toLowerCase()]) || (trig.window != null && p.windows[String(trig.window).toLowerCase()]);
      });
    }
    function hasPending(trig) { return matching(trig).length > 0; }   // SYNC: lets a seam skip the async hop when nothing needs activating
    async function need(trig) {
      var ids = matching(trig);
      var done = [];
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (!inflight[id]) inflight[id] = activateNow(id, 'demand').then(function () { return null; }, function (e) { return e; });
        var err = await inflight[id]; delete inflight[id];
        if (err) throw err;
        done.push(id);
      }
      return done;
    }
    // noteTouched(tables): the seam reports the tables a run read/wrote; a declared trigger table of a STILL-STARTING bundle means a cascade reached it before it was active: logged loudly (never silent) and activated for the next run.
    function noteTouched(tables) {
      var missed = [];
      Object.keys(pending).forEach(function (id) { (tables || []).forEach(function (t) { if (pending[id].tables[String(t).toLowerCase()]) missed.push({ id: id, table: String(t).toLowerCase() }); }); });
      missed.forEach(function (m) { console.log('§PLUGIN-LAZY-MISSED bundle=' + m.id + ' table=' + m.table + ' (a run touched a trigger table before the bundle was active; activating for the next run)'); });
      if (missed.length) { var seen = {}; missed.forEach(function (m) { if (!seen[m.id]) { seen[m.id] = 1; need({ activateId: m.id }).catch(function (e) { console.log('§PLUGIN-LAZY-ERR ' + m.id + ': ' + e.message); }); } }); }
      return missed;
    }
    function setPolicy(id, policy) {
      var rec = store.get(id); if (!rec) throw new Error('plugin not installed: ' + id);
      if (policy != null && policy !== 'eager' && policy !== 'lazy') throw new Error('policy must be eager, lazy or null');
      rec.policy = policy; store.put(rec); return { id: id, policy: policy };
    }

    async function stopBundle(id) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state === STATES.STARTING) { undoStartScope(id); delete pending[id]; rec.state = STATES.STOPPED; store.put(rec); var sop = appendOp('PLUGIN_STOP', { id: id, lazy: true }); console.log('§PLUGIN-STOP    id=' + id + ' state=' + rec.state + ' (cancelled before activation)'); return { id: id, state: rec.state, opId: sop }; }
      if (rec.state !== STATES.ACTIVE) return { id: id, state: rec.state, opId: null };
      var lh = loaded[id], dctx = (lh && lh.ctx) || buildCtx(rec.manifest, makeScope(id));
      // the bundle's own deactivate first (anything custom), then its hot chunks in reverse, then the AUTOMATIC undo of every recorded contribution.
      if (lh && lh.module && typeof lh.module.deactivate === 'function') await lh.module.deactivate(dctx);
      var ch = (lh && lh.chunks) || [];
      for (var i = ch.length - 1; i >= 0; i--) { if (typeof ch[i].deactivate === 'function') await ch[i].deactivate(dctx); }
      var undone = lh && lh.scope ? lh.scope.size() : 0, errs = lh && lh.scope ? lh.scope.undoAll() : [];
      errs = errs.concat(undoStartScope(id));
      if (lh) { lh.ctx = null; lh.scope = null; lh.chunks = []; }
      rec.state = STATES.STOPPED; store.put(rec);
      var opId = appendOp('PLUGIN_STOP', { id: id });
      console.log('§PLUGIN-STOP    id=' + id + ' state=' + rec.state + ' undone=' + undone + (errs.length ? ' undoErrors=' + errs.length : ''));
      return { id: id, state: rec.state, opId: opId };
    }

    async function uninstallBundle(id) {
      var rec = store.get(id);
      if (!rec) throw new Error('plugin not installed: ' + id);
      if (rec.state === STATES.ACTIVE || rec.state === STATES.STARTING) await stopBundle(id);
      var opId = appendOp('PLUGIN_UNINSTALL', { id: id });
      delete loaded[id];
      store.del(id);
      console.log('§PLUGIN-UNINSTALL id=' + id);
      return { id: id, state: STATES.UNINSTALLED, opId: opId };
    }

    function list() {
      return store.list().map(function (r) {
        return { id: r.id, version: r.version, state: r.state, url: r.url, name: (r.manifest && r.manifest.name) || null, budget: r.budget || null, policy: r.policy || null, activation: (r.manifest && r.manifest.activation) || 'eager' };
      });
    }
    function get(id) { var r = store.get(id); return r ? { id: r.id, version: r.version, state: r.state, url: r.url, name: (r.manifest && r.manifest.name) || null, budget: r.budget || null, policy: r.policy || null, activation: (r.manifest && r.manifest.activation) || 'eager' } : null; }
    // describe(id): everything the OSGi console shows for one bundle (manifest, policy, what it registered while active).
    function describe(id) {
      var r = store.get(id); if (!r) return null; var lh = loaded[id];
      return { id: r.id, version: r.version, state: r.state, url: r.url, policy: r.policy || null, manifest: r.manifest, budget: r.budget || null,
               contributions: lh && lh.scope ? lh.scope.labels() : [], pendingTriggers: pending[id] ? { tables: Object.keys(pending[id].tables), processes: Object.keys(pending[id].processes), windows: Object.keys(pending[id].windows) } : null };
    }
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
        var wasUp = (b.state === STATES.ACTIVE || b.state === STATES.STARTING);
        try { await installBundle(b.url || b.bundle); if (b.policy !== undefined && store.get(b.id)) { var rr0 = store.get(b.id); rr0.policy = b.policy; store.put(rr0); } if (wasUp) toStart.push(b.id); }
        catch (e) { if (!/already installed/.test(e.message)) failed.push({ id: b.id, error: e.message }); else if (wasUp) toStart.push(b.id); }
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
      need: need,
      describe: describe,
      hasPending: hasPending,
      noteTouched: noteTouched,
      setPolicy: setPolicy,
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
