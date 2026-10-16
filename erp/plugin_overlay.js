// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// plugin_overlay.js — the Plugin Engine pill overlay (prompts/PLUGIN_SYSTEM_LANE.md §Phase D).
//   The browser face of the Fold-Engine plugin host (plugin_registry.js, W-PLUGIN). One pill → one click:
//   paste a raw ES-module URL, Install, and the bundle is ACTIVE — collapsing iDempiere's two-step
//   (drop-JAR-restart + 2Pack-import) into a single in-surface action. The `sql/setup.sql` equivalent runs
//   inside the bundle's activate(ctx).
//
//   REUSE, don't fork: renders with window.OverlayKit (el/ico over the verbatim ICONS registry — clean
//   Lucide only, feedback_pill_icon_consistency), drives the SHARED window.PluginRegistry, and contributes
//   into the live engine modules the host page already loaded (AdModelVal/AdCallout/AdProcess/PostResolver).
//   Bundle state {id,url,version,state} persists in IndexedDB (db 'fold_plugins') and re-activates on open.
//
//   The host page calls PluginEngine.open({ doc, db, adQ, KO, engines }) — the same glue-injection shape
//   PosLens.open / ERPPreview.openPreview use (no DB binding inside the module).
//   §-witness: §PLUGIN-PILL install url=<url> id=<id> state=ACTIVE
(function (global) {
  'use strict';

  var ENGINE_VERSION = '0.10.0';       // the running Fold-Engine version (engineVersion gate target)
  var IDB_NAME = 'fold_plugins', IDB_STORE = 'kv', IDB_KEY = 'bundles';

  // ── IndexedDB: one JSON blob of [{id,url,version,state}] under a single key (simple, one get/one put). ──
  function _idb() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function _idbGet() {
    return _idb().then(function (db) {
      return new Promise(function (res) {
        var r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
        r.onsuccess = function () { res(r.result || []); };
        r.onerror = function () { res([]); };
      });
    }).catch(function () { return []; });
  }
  function _idbPut(list) {
    return _idb().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(list, IDB_KEY);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { res(false); };
      });
    }).catch(function () { return false; });
  }

  // ── Module singleton: ONE registry per page, hydrated once from IDB. ────────────────────────────────────
  var _reg = null, _glue = null, _hydrated = false;

  // ── 2Packs a bundle shipped (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §22 B2-B4) ─────────────────────────────────────────────
  //   IDB key 'packs': { <bundle>: { fingerprint, packs: [{version, bytes}], delta: [[sql, params], ...] } }. The rows are dictionary data: kept whatever the bundle's state.
  var PACKS_KEY = 'packs';
  function _kvGet(key, dflt) {
    return _idb().then(function (db) { return new Promise(function (res) { var r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key); r.onsuccess = function () { res(r.result || dflt); }; r.onerror = function () { res(dflt); }; }); })
      .catch(function () { return dflt; });
  }
  function _kvPut(key, val) {
    return _idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction(IDB_STORE, 'readwrite'); tx.objectStore(IDB_STORE).put(val, key); tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; }); })
      .catch(function () { return false; });
  }
  function _rawDb() { var d = _glue && _glue.db; return (d && typeof d.run === 'function' && typeof d.exec === 'function') ? d : null; }
  function _heapMB() { try { return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 'n/a'; } catch (e) { return 'n/a'; } }
  function _packOpts(db) {
    return { say: function (l) { console.log(l); }, convertSql: global.AdCallout && global.AdCallout.convertSql,
      hasFunction: function (n) { try { db.exec('SELECT ' + n + '()'); return true; } catch (e) { return !/no such function/i.test(e.message); } },
      uuid: function () { return (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : null; } };
  }
  // §24: a pack's stored functions. The module's bodies are bound on the dictionary DB like core's sqlfn.js UDFs (AdCallout.RUNTIME.bindSqlFunctions) - at Start BEFORE the Pack In
  //   (so its CREATE FUNCTION statements are provided and views over them compile) and at every load BEFORE the replay, for every kept pack, whatever the bundle's state.
  function _bindFunctions(db, url, bundleId) {
    if (!url) return Promise.resolve([]);
    var R = global.AdCallout && global.AdCallout.RUNTIME; if (!R || !R.bindSqlFunctions) return Promise.reject(new Error('AdCallout.RUNTIME.bindSqlFunctions missing'));
    return import(/* @vite-ignore */ url).then(function (m) {
      var names = R.bindSqlFunctions(function (n, f) { db.create_function(n, f); }, (m.functions || (m.default && m.default.functions))(R));
      console.log('§PACKIN-FN bundle=' + bundleId + ' bound=[' + names.join(',') + '] from=' + String(url).split('/').pop());
      return names;
    });
  }
  // B2: apply a bundle's packs at Start (the Incremental2PackActivator rule inside PipoPackIn.incremental), keep the bytes of every pack that went in and the delta it wrote.
  function _packApply(bundleId, list, more) {
    var db = _rawDb(), P = global.PipoPackIn, t0 = performance.now(), fnUrl = more && more.functions || null;
    if (!db) return Promise.resolve({ ok: false, error: 'no writable dictionary DB' });
    if (!P) return Promise.resolve({ ok: false, error: 'pipo_packin.js not loaded' });
    return _bindFunctions(db, fnUrl, bundleId).then(function () { return Promise.all(list.map(function (p) { return fetch(p.url).then(function (r) { if (!r.ok) throw new Error(p.url + ' HTTP ' + r.status); return r.arrayBuffer(); }).then(function (b) { return { version: p.version, bytes: new Uint8Array(b) }; }); }))
      .then(function (loaded) {
        return _kvGet(PACKS_KEY, {}).then(function (store) {
          var rdb = P.recording(db), fromScratch = !P.installedVersions(db, bundleId).length;   // nothing of this bundle in the base: what is written now is the WHOLE delta, not an addition
          return P.incremental(rdb, bundleId, loaded, _packOpts(db)).then(function (res) {
            var ok = res.every(function (r) { return r.ok; }), bad = res.filter(function (r) { return !r.ok; })[0];
            var done = !res.length ? Promise.resolve() : (function () {
              var rec = store[bundleId] || { packs: [], delta: [] };
              res.filter(function (r) { return r.ok; }).forEach(function (r) { rec.packs = rec.packs.filter(function (k) { return k.version !== r.version; }).concat(loaded.filter(function (l) { return l.version === r.version; })); });
              rec.delta = fromScratch ? rdb.delta() : rec.delta.concat(rdb.delta()); rec.fingerprint = global.__adSeedFingerprint || null; if (fnUrl) rec.functions = fnUrl; store[bundleId] = rec;
              return _kvPut(PACKS_KEY, store);
            })();
            return done.then(function () {
              console.log('§PACKIN-START bundle=' + bundleId + ' applied=[' + res.filter(function (r) { return r.ok; }).map(function (r) { return r.version; }).join(',') + '] ok=' + ok +
                ' statements=' + rdb.delta().length + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + _heapMB() + (bad ? ' error=' + (bad.stat && bad.stat.error) : ''));
              return { ok: ok, applied: res.map(function (r) { return r.version; }), error: bad ? (bad.version + ': ' + (bad.stat && bad.stat.error)) : null };
            });
          });
        });
      }); }).catch(function (e) { console.log('§PACKIN-START bundle=' + bundleId + ' ok=false error=' + e.message); return { ok: false, error: e.message }; });
  }
  // B4: every load, BEFORE the bundles are restored, every kept bundle's rows are put back: the delta on the same base, else a full Pack In from the kept bytes.
  function _packsReplay() {
    var db = _rawDb(), P = global.PipoPackIn; if (!db || !P) return Promise.resolve();
    return _kvGet(PACKS_KEY, {}).then(function (store) {
      var ids = Object.keys(store), fp = global.__adSeedFingerprint || null, changed = false;
      return ids.reduce(function (chain, id) {
        return chain.then(function () {
          var r = store[id], t0 = performance.now(), reason;
          return _bindFunctions(db, r.functions, id).catch(function (e) { console.log('§PACKIN-FN-ERR bundle=' + id + ' ' + e.message); }).then(function () {
          if (r.fingerprint === fp && (r.delta || []).length) {
            var rr = P.replay(db, r.delta);
            if (rr.ok) { console.log('§PACKIN-REPLAY bundle=' + id + ' mode=delta statements=' + rr.statements + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + _heapMB()); return; }
            reason = 'replay failed at ' + rr.statements + ': ' + rr.error;
          } else reason = 'fingerprint ' + r.fingerprint + ' -> ' + fp;
          var rdb = P.recording(db);
          return P.incremental(rdb, id, r.packs || [], _packOpts(db)).then(function (res) {
            r.delta = rdb.delta(); r.fingerprint = fp; changed = true;
            console.log('§PACKIN-REPLAY bundle=' + id + ' mode=full reason=' + reason + ' applied=[' + res.map(function (x) { return x.version + (x.ok ? '' : '!'); }).join(',') + '] statements=' + r.delta.length + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + _heapMB());
          });
          });
        });
      }, Promise.resolve()).then(function () { return changed ? _kvPut(PACKS_KEY, store) : null; });
    }).catch(function (e) { console.log('§PACKIN-REPLAY-ERR ' + e.message); });
  }

  function _buildRegistry(glue) {
    // db: bind the WRITABLE sql.js handle when the page gave us a raw one (glue.db has .run/.exec) — Ninja
    // Create's bundle.activate → stageModels writes through it; engine bundles still read via the .query
    // makeWritableDbHost attaches (NINJA_MODE_PILL §5). Pre-login (no raw db) → read-only adQ wrapper.
    var hostDb;
    if (glue.db && typeof glue.db.run === 'function' && typeof glue.db.exec === 'function') {
      hostDb = (global.NinjaBundle && global.NinjaBundle.makeWritableDbHost)
        ? global.NinjaBundle.makeWritableDbHost(glue.db)
        : glue.db;
    } else {
      hostDb = { query: function (sql, p) { try { return glue.adQ ? glue.adQ(sql, p) : []; } catch (e) { return []; } } };
    }
    var host = {
      engineVersion: ENGINE_VERSION,
      db: hostDb,
      ops: { append: function (type, params) {
        try { return (glue.KO && glue.db) ? glue.KO.commitOp(glue.db, type, params) : null; } catch (e) { return null; }
      } },
      modelval:   glue.engines && glue.engines.modelval,
      callout:    glue.engines && glue.engines.callout,
      process:    glue.engines && glue.engines.process,
      postTokens: glue.engines && glue.engines.postTokens,
      docAction:  global.ModelLayer || null,   // the DocAction extension point (bim-compiler prompts/ERP_MODEL_LAYER.md §DESIGN 2)
      docFsm:     global.AdDocFsm || null,     // the document-action FSM family table (plugin documents get the DocAction bar): registerFamily / removeFamilyOwner
      form:       global.AdFormGeneric || null, // the generic AD_Form engine (ad_form_generic.js): a bundle registers a form descriptor, the host draws it
      lens:       global.AdLens || null,       // the opt-in operations lens (ad_lens.js, bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15): a bundle registers record actions, the host draws ONE lens bar
      pill:       { register: function (id, desc, owner) { if (!global.IdmpPills || !global.IdmpPills.register) throw new Error('no pill rail on this page'); return global.IdmpPills.register(id, desc, owner); },
                    removeOwner: function (owner) { if (global.IdmpPills && global.IdmpPills.removeOwner) global.IdmpPills.removeOwner(owner); } },   // a bundle's pill on the rail (idmp_pills.js §PILL-CONTRIB, §27)
      packs:      { apply: _packApply },          // a bundle's 2Packs (manifest.packs): Pack In at Start, kept + replayed at load (§22)
      docClass:   global.DocPoster || null,    // the posting-class extension point (legacy IDocFactory): registerDocClass / removeDocClassOwner (Host work H1)
      import: function (url) { return import(/* @vite-ignore */ url); }
      // store: default in-memory; IDB persistence is a side-channel (_persist below) so the registry stays sync.
    };
    return global.PluginRegistry.create(host);
  }

  // Persist the registry's current bundle set to IDB (id/url/version/state).
  function _persist() {
    if (!_reg) return Promise.resolve();
    return _idbPut(_reg.list());
  }

  // Hydrate: read persisted bundles, re-install (and re-activate the ACTIVE ones) into the fresh registry.
  function _hydrate() {
    if (_hydrated) return Promise.resolve();
    return _packsReplay().then(_idbGet).then(function (saved) {
      // one implementation: the registry's restore() installs every saved bundle then restarts the ACTIVE ones in dependency order (Host work H1); failures are collected, never thrown.
      var chain = _reg.restore((saved || []).filter(function (b) { return b && b.url; }))
        .then(function (r) { (r.failed || []).forEach(function (f) { console.warn('§PLUGIN-PILL rehydrate failed id=' + f.id + ': ' + f.error); }); });
      return chain.then(_builtins).then(function () { _hydrated = true; });
    });
  }

  // Built-in bundles (§27): shipped with the page like the bundles of a default OSGi distribution. A builtin this browser has never seen is installed + started ONCE and
  //   remembered (kv 'builtins_seen'); from then on the user's Install/Start/Stop/Uninstall decide - a stopped or uninstalled builtin is never brought back.
  var BUILTINS = ['plugins/ninja_excel.mjs', 'plugins/ninja_create.mjs'];
  function _builtins() {
    if (typeof location === 'undefined') return Promise.resolve();
    return _kvGet('builtins_seen', []).then(function (seen) {
      var todo = BUILTINS.map(function (u) { return new URL(u, location.href).href; }).filter(function (u) { return seen.indexOf(u) < 0; });
      if (!todo.length) return null;
      return todo.reduce(function (p, u) {
        return p.then(function () { return _reg.installBundle(u); }).then(function (b) { return _reg.startBundle(b.id || (b.manifest && b.manifest.id)); })
          .then(function () { seen.push(u); console.log('§PLUGIN-BUILTIN installed+started url=' + u); }, function (e) { if (/already installed/.test(e.message)) { seen.push(u); return; } console.warn('§PLUGIN-BUILTIN failed url=' + u + ': ' + e.message); });
      }, Promise.resolve()).then(function () { return _kvPut('builtins_seen', seen); }).then(function () { return _persist(); });
    });
  }

  // ── Toast (matches idmp_pills _toast styling). ─────────────────────────────────────────────────────────
  function _toast(doc, msg) {
    var t = doc.createElement('div');
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:10001;' +
      'padding:10px 22px;border-radius:8px;font-size:13px;font-family:system-ui,sans-serif;transition:opacity .5s;' +
      'background:rgba(40,44,58,0.95);color:#cdd6e4;border:1px solid rgba(255,255,255,0.1);pointer-events:none;';
    t.textContent = msg; doc.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3100);
  }

  function _css(doc) {
    if (doc.getElementById('pe-style')) return;
    var s = doc.createElement('style'); s.id = 'pe-style';
    s.textContent =
      '#pe-ov{position:fixed;inset:0;z-index:10000;background:rgba(12,14,20,.62);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}' +
      '#pe-card{width:min(560px,92vw);max-height:84vh;overflow:auto;background:#181b24;border:1px solid rgba(255,255,255,.12);border-radius:14px;color:#cdd6e4;box-shadow:0 18px 60px rgba(0,0,0,.5)}' +
      '#pe-card h3{margin:0;padding:16px 18px;font-size:15px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:9px}' +
      '#pe-card .pe-sub{color:#8b93a7;font-weight:400;font-size:12px}' +
      '.pe-body{padding:14px 18px}' +
      '.pe-install{display:flex;gap:8px;margin-bottom:14px}' +
      '.pe-install input{flex:1;background:#11131a;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#cdd6e4;padding:9px 11px;font-size:12.5px}' +
      '.pe-btn{cursor:pointer;border:1px solid rgba(255,255,255,.16);background:#262b39;color:#cdd6e4;border-radius:8px;padding:8px 13px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px}' +
      '.pe-btn:hover{background:#313748}' +
      '.pe-btn.pe-go{background:#2563eb;border-color:#2563eb;color:#fff}' +
      '.pe-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid rgba(255,255,255,.07)}' +
      '.pe-row .pe-id{flex:1;font-size:13px}' +
      '.pe-row .pe-id small{display:block;color:#8b93a7;font-size:11px}' +
      '.pe-chip{font-size:10.5px;font-weight:600;letter-spacing:.04em;padding:3px 8px;border-radius:20px}' +
      '.pe-chip.ACTIVE{background:rgba(34,197,94,.16);color:#4ade80}' +
      '.pe-chip.STARTING{background:rgba(250,204,21,.16);color:#facc15}' +
      '.pe-chip.STOPPED,.pe-chip.INSTALLED,.pe-chip.RESOLVED{background:rgba(148,163,184,.16);color:#94a3b8}' +
      '.pe-empty{color:#8b93a7;font-size:12.5px;padding:14px 0;text-align:center}' +
      '.pe-x{cursor:pointer;color:#8b93a7;font-size:18px;line-height:1;margin-left:auto;background:none;border:none}' +
      // ── tabs (Install / Create) ──
      '.pe-tabs{display:flex;gap:6px;padding:12px 18px 0}' +
      '.pe-tab{cursor:pointer;background:none;border:1px solid rgba(255,255,255,.14);color:#8b93a7;border-radius:8px 8px 0 0;padding:7px 16px;font-size:12.5px;border-bottom:none}' +
      '.pe-tab.on{background:#11131a;color:#cdd6e4;border-color:rgba(255,255,255,.2)}' +
      // ── create face ──
      '.pe-drop{border:1.5px dashed rgba(255,255,255,.22);border-radius:10px;padding:26px 14px;text-align:center;color:#8b93a7;font-size:13px;cursor:pointer;transition:.15s}' +
      '.pe-drop.hot{border-color:#2563eb;background:rgba(37,99,235,.08);color:#cdd6e4}' +
      '.pe-drop .pe-di{display:flex;align-items:center;justify-content:center;gap:8px}' +
      '.pe-starter{display:inline-flex;align-items:center;gap:6px;margin-top:10px;color:#7aa2f7;font-size:12px;cursor:pointer;background:none;border:none}' +
      '.pe-starter:hover{text-decoration:underline}' +
      '.pe-prev{margin-top:14px}' +
      '.pe-pt{padding:9px 0;border-top:1px solid rgba(255,255,255,.07)}' +
      '.pe-pt .pe-pn{font-size:13px;color:#cdd6e4}' +
      '.pe-pt .pe-pm{font-size:11px;color:#8b93a7;margin-left:6px}' +
      '.pe-cols{margin-top:5px;display:flex;flex-wrap:wrap;gap:5px}' +
      '.pe-col{font-size:10.5px;background:#11131a;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:2px 7px;color:#aab3c5}' +
      '.pe-col b{color:#cdd6e4;font-weight:600}' +
      '.pe-warn{margin-top:10px;font-size:11.5px;color:#fbbf24}' +
      '.pe-emit{margin-top:14px;display:flex;justify-content:flex-end}' +
      '.pe-ninja{font-size:12.5px;color:#cdd6e4;margin-bottom:11px}' +
      // ── export (PackOut existing window) sub-section ──
      '.pe-export{margin-top:16px;padding-top:13px;border-top:1px solid rgba(255,255,255,.07)}' +
      '.pe-export .pe-ninja2{font-size:11.5px;color:#8b93a7;margin-bottom:8px}' +
      '.pe-export .pe-exrow{display:flex;gap:7px}' +
      '.pe-win{flex:1;background:#11131a;border:1px solid rgba(255,255,255,.14);color:#cdd6e4;border-radius:8px;padding:7px 9px;font-size:12px}' +
      '.pe-byline{margin-top:14px;padding-top:11px;border-top:1px solid rgba(255,255,255,.07);font-size:11px;color:#8b93a7;text-align:center}' +
      '.pe-byline b{color:#aab3c5;font-weight:600}';
    doc.head.appendChild(s);
  }

  var ICO = function (n) { return (global.OverlayKit && global.OverlayKit.ico) ? global.OverlayKit.ico(n, 16) : ''; };

  function _close(doc) { var o = doc.getElementById('pe-ov'); if (o) o.remove(); }

  // Optional bundles (ERP_FRIENDLY_OPS_LENS.md §30): offered, never auto-installed (the default screen stays the legacy twin's). An offer shows only while the bundle is not installed.
  var OPTIONAL = [{ url: 'plugins/friendly_ops.mjs', id: 'org.kernel.friendly-ops', name: 'Friendly operations', blurb: 'Fewer clicks on the same books: Save & Complete, Add line, Save & back, related records.' }];
  function _renderOffers(doc, bundles) {
    var box = doc.getElementById('pe-available'); if (!box) return;
    box.innerHTML = '';
    OPTIONAL.filter(function (o) { return !bundles.some(function (b) { return b.id === o.id; }); }).forEach(function (o) {
      var row = doc.createElement('div'); row.className = 'pe-row'; row.setAttribute('data-offer', o.id);
      row.innerHTML = '<div class="pe-id">' + o.name + ' <small>' + o.blurb + '</small></div><button class="pe-btn pe-go pe-offer-install">Install</button>';
      row.querySelector('.pe-offer-install').onclick = function () { _doInstall(doc, new URL(o.url, location.href).href); };
      box.appendChild(row);
    });
    console.log('§PLUGIN-OFFER shown=' + box.children.length);
  }

  function _render(doc) {
    var body = doc.getElementById('pe-list'); if (!body) return;
    var bundles = _reg ? _reg.list() : [];
    _renderOffers(doc, bundles);
    body.innerHTML = '';
    if (!bundles.length) { body.innerHTML = '<div class="pe-empty">No plugins installed. Paste a bundle URL above to install.</div>'; return; }
    bundles.forEach(function (b) {
      var row = doc.createElement('div'); row.className = 'pe-row';
      var active = b.state === 'ACTIVE' || b.state === 'STARTING';   // STARTING = started, activates on first demand (lazy)
      var eff = b.policy || b.activation || 'eager', lazyCapable = b.activation === 'lazy';
      row.innerHTML =
        '<div class="pe-id">' + b.id + ' <small>' + (b.version || '') + (b.url ? ' · ' + b.url.replace(/^https?:\/\//, '') : '') + '</small></div>' +
        '<span class="pe-chip ' + b.state + '" title="' + (b.state === 'STARTING' ? 'started; activates on first demand' : '') + '">' + b.state + '</span>' +
        (lazyCapable ? '<button class="pe-btn pe-policy" title="Activation policy (takes effect on next start): lazy = activate on first demand, eager = at start">' + (eff === 'lazy' ? 'On demand' : 'At start') + '</button>' : '') +
        '<button class="pe-btn pe-toggle">' + (active ? 'Stop' : 'Start') + '</button>' +
        '<button class="pe-btn pe-uninstall" title="Uninstall">' + ICO('xmark') + '</button>';
      row.querySelector('.pe-toggle').onclick = function () {
        var op = active ? _reg.stopBundle(b.id) : _reg.startBundle(b.id);
        Promise.resolve(op).then(function () { return _persist(); })
          .then(function () { _render(doc); })
          .catch(function (e) { _toast(doc, e.message); });
      };
      var pb = row.querySelector('.pe-policy');
      if (pb) pb.onclick = function () { try { _reg.setPolicy(b.id, eff === 'lazy' ? 'eager' : 'lazy'); } catch (e) { _toast(doc, e.message); return; } _persist().then(function () { _render(doc); _toast(doc, b.id + ': ' + (eff === 'lazy' ? 'starts eagerly' : 'activates on demand') + ' from the next start'); }); };
      row.querySelector('.pe-uninstall').onclick = function () {
        Promise.resolve(_reg.uninstallBundle(b.id)).then(function () { return _persist(); })
          .then(function () { _render(doc); _toast(doc, 'Uninstalled ' + b.id); })
          .catch(function (e) { _toast(doc, e.message); });
      };
      body.appendChild(row);
    });
  }

  function _doInstall(doc, url) {
    url = (url || '').trim();
    if (!url) { _toast(doc, 'Paste a bundle URL first'); return; }
    if (!global.PluginRegistry) { _toast(doc, 'Plugin engine not loaded'); return; }
    _reg.installBundle(url)
      .then(function (ins) { return _reg.startBundle(ins.id).then(function (st) { return { id: ins.id, state: st.state }; }); })
      .then(function (res) {
        return _persist().then(function () {
          // §-witness — the Phase-D contract line (POSTING discipline: the value is read back from the registry).
          console.log('§PLUGIN-PILL install url=' + url + ' id=' + res.id + ' state=' + res.state);
          _toast(doc, res.id + ' → ' + res.state);
          var input = doc.getElementById('pe-url'); if (input) input.value = '';
          _render(doc);
        });
      })
      .catch(function (e) { console.warn('§PLUGIN-PILL install FAILED url=' + url + ': ' + e.message); _toast(doc, 'Install failed: ' + e.message); });
  }

  // ── Create (PackOut) face ─ NINJA_MODE_PILL §2-5. Drop a sheet → preview derived models → Emit & Install.
  //    Engine is frozen + witnessed (poc_ninja_create §NINJA-PILL). This is the DOM seam only.
  var _tab = 'install';        // 'install' | 'create'
  var _createModel = null;     // last previewed model (what Emit & Install stages)

  function _switchTab(doc, tab) {
    _tab = tab;
    var ib = doc.getElementById('pe-install-body'), cb = doc.getElementById('pe-create-body');
    if (ib) ib.style.display = (tab === 'install') ? '' : 'none';
    if (cb) cb.style.display = (tab === 'create') ? '' : 'none';
    var ti = doc.getElementById('pe-tab-install'), tc = doc.getElementById('pe-tab-create');
    if (ti) ti.className = 'pe-tab' + (tab === 'install' ? ' on' : '');
    if (tc) tc.className = 'pe-tab' + (tab === 'create' ? ' on' : '');
    if (tab === 'create') _populateWindows(doc);   // refresh picker (tenant may have loaded since open)
    console.log('§NINJA-PILL-DOM tab=' + (tab === 'create' ? 'Create' : 'Install'));
  }

  // Render the preview[] the controller derived (table, master↳, column chips name:refType). No re-derivation.
  function _renderPreview(doc, prev, fileName) {
    var box = doc.getElementById('pe-prev'); if (!box) return;
    box.innerHTML = '';
    if (!prev || prev.error) {
      box.innerHTML = '<div class="pe-warn">' + ((prev && prev.error) || 'could not read sheet') + '</div>';
      var b0 = doc.getElementById('pe-emit-btn'); if (b0) b0.disabled = true;
      return;
    }
    _createModel = prev.model;
    (prev.preview || []).forEach(function (p) {
      var row = doc.createElement('div'); row.className = 'pe-pt';
      var head = '<div><span class="pe-pn">' + p.table + '</span>' +
        (p.master ? '<span class="pe-pm">↳ detail of ' + p.master + '</span>'
                  : '<span class="pe-pm">' + (p.columns ? p.columns.length : 0) + ' cols</span>') + '</div>';
      var chips = '<div class="pe-cols">' + (p.columns || []).map(function (c) {
        return '<span class="pe-col"><b>' + c.name + '</b>:' + c.refType + '</span>';
      }).join('') + '</div>';
      row.innerHTML = head + chips;
      box.appendChild(row);
    });
    if (prev.warnings && prev.warnings.length) {
      var w = doc.createElement('div'); w.className = 'pe-warn';
      w.textContent = '⚠ ' + prev.warnings.join(' · ');
      box.appendChild(w);
    }
    var btn = doc.getElementById('pe-emit-btn'); if (btn) btn.disabled = !(prev.preview && prev.preview.length);
    console.log('§NINJA-PILL-DOM drop=' + (fileName || 'sheet') + ' preview=' + ((prev.preview || []).length) +
      ' warnings=' + ((prev.warnings || []).length));
  }

  function _onSheet(doc, file) {
    if (!global.XLSX || !global.NinjaCreate) { _toast(doc, 'Ninja engine not loaded'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = global.XLSX.read(new Uint8Array(fr.result), { type: 'array' });
        _renderPreview(doc, global.NinjaCreate.previewSheet(wb, global.XLSX), file.name);
      } catch (e) { _renderPreview(doc, { error: e.message }, file.name); }
    };
    fr.readAsArrayBuffer(file);
  }

  function _downloadStarter(doc) {
    if (!global.XLSX || !global.NinjaStarter) { _toast(doc, 'Ninja engine not loaded'); return; }
    try {
      var blob = global.NinjaStarter.starterBlob(global.XLSX);
      var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ninja_starter.xlsx';
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      console.log('§NINJA-PILL-DOM starter=ninja_starter.xlsx downloaded');
    } catch (e) { _toast(doc, 'Starter download failed: ' + e.message); }
  }

  // Lazy-load SheetJS (xlsx.mini.min.js) the same way ninja_pill does — Export may run on a fresh open
  // where the report pill hasn't pulled XLSX yet. Resolves to global.XLSX.
  function _ensureXLSX(doc) {
    if (global.XLSX) return Promise.resolve(global.XLSX);
    return new Promise(function (res, rej) {
      var s = doc.createElement('script'); s.src = 'xlsx.mini.min.js?v=1';
      s.onload = function () { console.log('§NINJA-PILL-DOM xlsx=loaded'); res(global.XLSX); };
      s.onerror = function () { rej(new Error('xlsx.mini.min.js failed to load')); };
      doc.head.appendChild(s);
    });
  }

  // Populate the window picker from the live writable AD db (read-only query). Active windows only.
  function _populateWindows(doc) {
    var sel = doc.getElementById('pe-win'); if (!sel) return;
    var db = _glue && _glue.db;
    if (!db || typeof db.exec !== 'function') { return; }   // no tenant loaded → leave placeholder
    var rows;
    try { rows = db.exec("SELECT AD_Window_ID, Name FROM AD_Window WHERE IsActive='Y' ORDER BY Name"); }
    catch (e) { console.warn('§NINJA-PILL-DOM win-list FAILED: ' + e.message); return; }
    var vals = (rows && rows[0] && rows[0].values) || [];
    var html = '<option value="">&mdash; pick a window &mdash;</option>';
    vals.forEach(function (r) {
      html += '<option value="' + r[0] + '">' + String(r[1] || ('Window ' + r[0])).replace(/</g, '&lt;') + '</option>';
    });
    sel.innerHTML = html;
    console.log('§NINJA-PILL-DOM win-list count=' + vals.length);
  }

  function _doExport(doc) {
    if (!global.NinjaExport) { _toast(doc, 'Ninja engine not loaded'); return; }
    var sel = doc.getElementById('pe-win');
    var winId = sel && sel.value ? Number(sel.value) : 0;
    if (!winId) { _toast(doc, 'Pick a window first'); return; }
    if (!_glue || !_glue.db || typeof _glue.db.exec !== 'function') { _toast(doc, 'Load a tenant first (no AD db)'); return; }
    var label = (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || ('window ' + winId);
    _ensureXLSX(doc).then(function (XLSX) {
      var blob = global.NinjaExport.exportBlob(_glue.db, winId, XLSX);
      if (!blob) { _toast(doc, 'Window not found / nothing to export'); console.warn('§NINJA-PILL-DOM export winId=' + winId + ' → null'); return; }
      var fname = label.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || ('window_' + winId);
      var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname + '.xlsx';
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      console.log('§NINJA-PILL-DOM export winId=' + winId + ' file=' + fname + '.xlsx');
      _toast(doc, 'Exported ' + fname + '.xlsx');
    }).catch(function (e) { console.warn('§NINJA-PILL-DOM export FAILED: ' + e.message); _toast(doc, 'Export failed: ' + e.message); });
  }

  function _doEmit(doc) {
    if (!_createModel) { _toast(doc, 'Drop a model sheet first'); return; }
    if (!global.NinjaCreate) { _toast(doc, 'Ninja engine not loaded'); return; }
    if (!_glue || !_glue.db || typeof _glue.db.run !== 'function') { _toast(doc, 'Load a tenant first (no writable AD db)'); return; }
    NinjaCreate.emitAndInstall(_reg, _createModel)
      .then(function (res) {
        return _persist().then(function () {
          console.log('§NINJA-PILL-DOM emit id=' + res.id + ' tables=' + res.tables + ' install=' + res.state);
          _toast(doc, res.id + ' → ' + res.state + ' (' + res.tables + ' tables)');
          _render(doc);                 // the new bundle also shows in the Install list
          _switchTab(doc, 'install');
        });
      })
      .catch(function (e) { console.warn('§NINJA-PILL-DOM emit FAILED: ' + e.message); _toast(doc, 'Emit failed: ' + e.message); });
  }

  function _wireCreate(doc) {
    var dz = doc.getElementById('pe-drop'); if (!dz) return;
    dz.onclick = function () { var i = doc.getElementById('pe-file'); if (i) i.click(); };
    var inp = doc.getElementById('pe-file');
    if (inp) inp.onchange = function (e) { if (e.target.files && e.target.files[0]) _onSheet(doc, e.target.files[0]); };
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('hot'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('hot'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) _onSheet(doc, f);
    });
    var st = doc.getElementById('pe-starter'); if (st) st.onclick = function () { _downloadStarter(doc); };
    var eb = doc.getElementById('pe-emit-btn'); if (eb) eb.onclick = function () { _doEmit(doc); };
    var xb = doc.getElementById('pe-export-btn'); if (xb) xb.onclick = function () { _doExport(doc); };
    _populateWindows(doc);
  }

  // ensure(glue) — build-or-return the ONE shared registry singleton, without opening the DOM overlay.
  //   PLUGIN_SYSTEM_LANE.md §Phase E: the AD-row bridge (ad_modelval_bridge.js) needs to install a
  //   candidate bundle into the SAME registry plugin_release.js's Plugin Management list reads
  //   (pluginReg() -> PluginEngine._reg()) — otherwise an AD-row install would be invisible until an
  //   admin happened to open the Plugin Engine pill first. This is exactly open()'s own glue/registry
  //   setup (below), factored out so a non-DOM caller can reach it; open()'s own behavior is unchanged.
  function ensure(glue) {
    if (!global.PluginRegistry) return null;
    if (!_glue) {
      glue = glue || {};
      _glue = {
        db: glue.db || null,
        adQ: glue.adQ || null,
        KO: glue.KO || global.KernelOps || null,
        engines: glue.engines || {
          modelval: global.AdModelVal, callout: global.AdCallout, process: global.AdProcess,
          postTokens: (global.PostResolver && global.PostResolver.TOKENS) || null
        }
      };
    }
    if (!_reg) _reg = _buildRegistry(_glue);
    return _reg;
  }

  // open({ doc, db, adQ, KO, engines }) — host injects the page glue; build/hydrate the registry once.
  function open(opts) {
    opts = opts || {};
    var doc = opts.doc || global.document;
    if (!global.PluginRegistry) { _toast(doc, 'plugin_registry.js not loaded'); return; }
    ensure(opts);

    _css(doc);
    _close(doc);
    var ov = doc.createElement('div'); ov.id = 'pe-ov';
    ov.innerHTML =
      '<div id="pe-card">' +
        '<h3>' + ICO('plug') + ' Plugin Engine <span class="pe-sub">Fold-Engine bundles</span>' +
          '<button class="pe-x" id="pe-close">&times;</button></h3>' +
        '<div class="pe-tabs">' +
          '<button class="pe-tab on" id="pe-tab-install">Install</button>' +
          '<button class="pe-tab" id="pe-tab-create">Create</button>' +
        '</div>' +
        // Install (PackIn) face — paste a bundle URL.
        '<div class="pe-body" id="pe-install-body">' +
          '<div class="pe-install">' +
            '<input id="pe-url" placeholder="https://raw.githubusercontent.com/&hellip;/my-plugin.mjs" />' +
            '<button class="pe-btn pe-go" id="pe-install">Install</button>' +
          '</div>' +
          '<div id="pe-available"></div>' +
          '<div id="pe-list"></div>' +
        '</div>' +
        // Create (PackOut) face — drop a model sheet, preview, Emit & Install. Ninja mode (tribute to Red1 Ninja).
        '<div class="pe-body" id="pe-create-body" style="display:none">' +
          '<div class="pe-ninja">Ninja mode — your spreadsheet becomes a running module</div>' +
          '<div class="pe-drop" id="pe-drop"><div class="pe-di">' + ICO('upload') + ' drop a .xlsx model sheet here</div></div>' +
          '<input type="file" id="pe-file" accept=".xlsx,.xls" style="display:none" />' +
          '<button class="pe-starter" id="pe-starter">' + ICO('download') + ' Download starter template</button>' +
          '<div class="pe-prev" id="pe-prev"></div>' +
          '<div class="pe-emit"><button class="pe-btn pe-go" id="pe-emit-btn" disabled>' + ICO('plug') + ' Emit &amp; Install</button></div>' +
          // Export (the literal PackOut) — round-trip a live window back to a re-droppable sheet. NINJA_MODE_LANE §1.
          '<div class="pe-export">' +
            '<div class="pe-ninja2">Export an existing window &mdash; round-trip a live module back to a sheet</div>' +
            '<div class="pe-exrow">' +
              '<select class="pe-win" id="pe-win"><option value="">&mdash; pick a window &mdash;</option></select>' +
              '<button class="pe-btn" id="pe-export-btn">' + ICO('download') + ' Export</button>' +
            '</div>' +
          '</div>' +
          '<div class="pe-byline">A friendlier <b>Red1 Ninja</b>, in the browser — Excel defines the model; no JVM, no 2Pack.</div>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) _close(doc); });
    doc.getElementById('pe-close').onclick = function () { _close(doc); };
    doc.getElementById('pe-install').onclick = function () { _doInstall(doc, doc.getElementById('pe-url').value); };
    doc.getElementById('pe-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') _doInstall(doc, e.target.value); });
    doc.getElementById('pe-tab-install').onclick = function () { _switchTab(doc, 'install'); };
    doc.getElementById('pe-tab-create').onclick = function () { _switchTab(doc, 'create'); };
    _wireCreate(doc);
    _tab = 'install';
    // the Create face belongs to the Ninja bundle (§27): shown only while org.idempiere.ninja.create is ACTIVE; opts.face='create' lands on it (the Ninja pill)
    var nc = _reg && _reg.get && _reg.get('org.idempiere.ninja.create'), ncOn = !!(nc && nc.state === 'ACTIVE');
    if (!ncOn) doc.getElementById('pe-tab-create').style.display = 'none';
    else if (opts.face === 'create') _switchTab(doc, 'create');

    // Hydrate persisted bundles, then render. (First open re-activates ACTIVE bundles into the engines.)
    _hydrate().then(function () { _render(doc); }).catch(function () { _render(doc); });
    console.log('§PLUGIN-PILL open bundles=' + (_reg ? _reg.list().length : 0));
  }

  // boot(glue) - Host work H1: build the registry AND restore the persisted ACTIVE bundles NOW (idempiere.html awaits it right after the seed patches), not when the pill is first opened. A bundle whose hot hooks gate core saves
  //   (Libero: C_Order, C_OrderLine, M_Requisition ... , PLUGIN_ARCHITECTURE.md section 3) must be live before the user can save anything. Resolves to the registry (null when the engine is not loaded).
  function boot(glue) { var r = ensure(glue); if (!r) return Promise.resolve(null); return _hydrate().then(function () { return r; }, function () { return r; }); }

  // the demand seam (Host work H2, OSGi lazy activation): crud_overlay asks before running model code for a table; the sync check keeps the common path (nothing pending) synchronous.
  function need(trig) { return _reg ? _reg.need(trig) : Promise.resolve([]); }
  function hasPending(trig) { return !!(_reg && _reg.hasPending && _reg.hasPending(trig)); }
  function noteTouched(tables) { return _reg && _reg.noteTouched ? _reg.noteTouched(tables) : []; }

  global.PluginEngine = { open: open, ensure: ensure, boot: boot, need: need, hasPending: hasPending, noteTouched: noteTouched, persist: function () { return _persist(); }, _reg: function () { return _reg; } };
})(typeof window !== 'undefined' ? window : this);
