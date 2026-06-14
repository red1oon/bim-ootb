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
    return _idbGet().then(function (saved) {
      var chain = Promise.resolve();
      (saved || []).forEach(function (b) {
        if (!b || !b.url) return;
        chain = chain.then(function () { return _reg.installBundle(b.url); })
          .then(function () { if (b.state === 'ACTIVE') return _reg.startBundle(b.id); })
          .catch(function (e) { console.warn('§PLUGIN-PILL rehydrate failed id=' + (b.id || '?') + ': ' + e.message); });
      });
      return chain.then(function () { _hydrated = true; });
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
      '.pe-byline{margin-top:14px;padding-top:11px;border-top:1px solid rgba(255,255,255,.07);font-size:11px;color:#8b93a7;text-align:center}' +
      '.pe-byline b{color:#aab3c5;font-weight:600}';
    doc.head.appendChild(s);
  }

  var ICO = function (n) { return (global.OverlayKit && global.OverlayKit.ico) ? global.OverlayKit.ico(n, 16) : ''; };

  function _close(doc) { var o = doc.getElementById('pe-ov'); if (o) o.remove(); }

  function _render(doc) {
    var body = doc.getElementById('pe-list'); if (!body) return;
    var bundles = _reg ? _reg.list() : [];
    body.innerHTML = '';
    if (!bundles.length) { body.innerHTML = '<div class="pe-empty">No plugins installed. Paste a bundle URL above to install.</div>'; return; }
    bundles.forEach(function (b) {
      var row = doc.createElement('div'); row.className = 'pe-row';
      var active = b.state === 'ACTIVE';
      row.innerHTML =
        '<div class="pe-id">' + b.id + ' <small>' + (b.version || '') + (b.url ? ' · ' + b.url.replace(/^https?:\/\//, '') : '') + '</small></div>' +
        '<span class="pe-chip ' + b.state + '">' + b.state + '</span>' +
        '<button class="pe-btn pe-toggle">' + (active ? 'Stop' : 'Start') + '</button>' +
        '<button class="pe-btn pe-uninstall" title="Uninstall">' + ICO('xmark') + '</button>';
      row.querySelector('.pe-toggle').onclick = function () {
        var op = active ? _reg.stopBundle(b.id) : _reg.startBundle(b.id);
        Promise.resolve(op).then(function () { return _persist(); })
          .then(function () { _render(doc); })
          .catch(function (e) { _toast(doc, e.message); });
      };
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
  }

  // open({ doc, db, adQ, KO, engines }) — host injects the page glue; build/hydrate the registry once.
  function open(opts) {
    opts = opts || {};
    var doc = opts.doc || global.document;
    if (!global.PluginRegistry) { _toast(doc, 'plugin_registry.js not loaded'); return; }
    _glue = {
      db: opts.db || null,
      adQ: opts.adQ || null,
      KO: opts.KO || global.KernelOps || null,
      engines: opts.engines || {
        modelval: global.AdModelVal, callout: global.AdCallout, process: global.AdProcess,
        postTokens: (global.PostResolver && global.PostResolver.TOKENS) || null
      }
    };
    if (!_reg) _reg = _buildRegistry(_glue);

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

    // Hydrate persisted bundles, then render. (First open re-activates ACTIVE bundles into the engines.)
    _hydrate().then(function () { _render(doc); }).catch(function () { _render(doc); });
    console.log('§PLUGIN-PILL open bundles=' + (_reg ? _reg.list().length : 0));
  }

  global.PluginEngine = { open: open, _reg: function () { return _reg; } };
})(typeof window !== 'undefined' ? window : this);
