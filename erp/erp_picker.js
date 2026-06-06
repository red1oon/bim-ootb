/**
 * BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
 *
 * erp_picker.js — the "pick-your-ERP" Install/Migrate dialog (prompts/MIGRATE_ERP_PICKER.md §SPEC).
 *   ONE dialog family: Install + Migrate both call open({mode}). It (S1) lists ALL five ERPs always,
 *   (S2) best-effort DETECTS what is present and highlights it / greys the rest, (S3) defaults to the
 *   detected source and asks "migrate your <X> data?", (S4) routes on confirm:
 *     iDempiere → MigrateShowMe (real PG agent) · Odoo → the real delegate-to-install fold (download the
 *     install-side agent → load odoo_chain.json → RE-FOLD through window.ERPKernel) · others → honest "coming".
 *   NON-INVENT: detection is a liveness probe only (no-cors, opaque) — the browser never reads ERP data
 *   cross-origin; extraction is delegate-to-install. Absent adapter ⇒ honest "coming", never a faked migrate.
 *
 *   §-witnesses (console, §-log first):
 *     §ERP-PICKER open mode=<m> erps=5
 *     §ERP-PICKER detect odoo=<Y|N> idempiere=agent
 *     §ERP-PICKER highlight=<key> greyed=[sap,oracle,dynamics]
 *     §ERP-PICKER default=<key>
 *     §ERP-PICKER confirm erp=<key> route=<route>   |   §ERP-PICKER coming erp=<key>
 *     §ODOO-MIGRATE-BROWSER loaded events=5 mapped=5/5 verbs=[…] newVerbs=[] glDr==glCr verify chainOk=Y
 */
(function (global) {
  'use strict';

  // S1 — the full list, always rendered. real:true ⇒ a working route; real:false ⇒ honest "coming".
  var ERPS = [
    { key: 'idempiere', name: 'iDempiere',   icon: '🟧', real: true,  route: 'showme' },
    { key: 'odoo',      name: 'Odoo',        icon: '🟣', real: true,  route: 'odoo', probe: probeOdoo },
    { key: 'sap',       name: 'SAP',         icon: '🔵', real: false },
    { key: 'oracle',    name: 'Oracle',      icon: '🔴', real: false },
    { key: 'dynamics',  name: 'MS Dynamics', icon: '🟦', real: false }
  ];

  var _overlay = null, _mode = 'migrate', _status = null;
  var _detected = {};   // key → true (port reachable). idempiere is 'agent' (real, not auto-probeable).
  var _sel = null, _SQL = null;

  function _el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function _$(id) { return document.getElementById(id); }
  function _erp(k) { return ERPS.filter(function (e) { return e.key === k; })[0]; }
  function _say(m) { if (typeof _status === 'function') _status(m); }

  // ── S2 — best-effort liveness probe (no-cors = opaque; reachable ⇒ resolve). Never reads ERP data. ──
  function probe(url, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(false); } }, ms);
      try {
        fetch(url, { mode: 'no-cors', cache: 'no-store' })
          .then(function () { if (!done) { done = true; clearTimeout(t); resolve(true); } })
          .catch(function () { if (!done) { done = true; clearTimeout(t); resolve(false); } });
      } catch (e) { if (!done) { done = true; clearTimeout(t); resolve(false); } }
    });
  }
  function probeOdoo() { return probe('http://localhost:8069/web/health', 1200); }

  function open(opts) {
    opts = opts || {};
    _mode = opts.mode === 'install' ? 'install' : 'migrate';
    _status = opts.status || null;
    _detected = {}; _sel = null;
    _injectStyle();
    if (_overlay) close();
    _overlay = _el('div', { id: 'ep-overlay', class: 'ep-overlay' });
    _overlay.innerHTML =
      '<div class="ep-card" role="dialog" aria-label="Pick your ERP">'
      + '<div class="ep-head"><span>' + (_mode === 'install' ? '⬇ Install onto this device' : '🔌 Migrate from your ERP')
      + '</span><button id="ep-x" class="ep-x" aria-label="Close">&times;</button></div>'
      + '<div id="ep-body" class="ep-body"></div></div>';
    document.body.appendChild(_overlay);
    _$('ep-x').onclick = close;
    _overlay.addEventListener('click', function (e) { if (e.target === _overlay) close(); });
    console.log('§ERP-PICKER open mode=' + _mode + ' erps=' + ERPS.length);
    _renderPicker();
    _runDetection();
  }
  function close() { if (_overlay) { _overlay.remove(); _overlay = null; } }

  // ── render the card grid + footer question ──
  function _renderPicker() {
    var body = _$('ep-body'); if (!body) return;
    body.innerHTML =
      '<p class="ep-dim">Pick the system to ' + _mode + ' from. We detect what is running on this machine and '
      + 'pre-select it — the others are listed for when their adapter lands.</p>'
      + '<div id="ep-grid" class="ep-grid"></div>'
      + '<div id="ep-foot" class="ep-foot"></div>';
    var grid = _$('ep-grid');
    ERPS.forEach(function (e) {
      var card = _el('div', { id: 'ep-c-' + e.key, class: 'ep-cardlet' });
      card.innerHTML = '<div class="ep-ic">' + e.icon + '</div><div class="ep-nm">' + e.name + '</div>'
        + '<div id="ep-b-' + e.key + '" class="ep-badge">' + _badge(e) + '</div>';
      card.onclick = function () { _select(e.key); };
      grid.appendChild(card);
    });
    _renderFoot();
  }
  function _badge(e) {
    if (!e.real) return '<span class="ep-coming">coming soon</span>';
    if (e.probe) return '<span class="ep-probing">detecting…</span>';
    return '<span class="ep-agent">via agent</span>';
  }

  function _runDetection() {
    var probes = ERPS.filter(function (e) { return e.real && e.probe; });
    Promise.all(probes.map(function (e) {
      return e.probe().then(function (live) { _detected[e.key] = !!live; _paintCard(e.key); return [e.key, live]; });
    })).then(function () {
      console.log('§ERP-PICKER detect odoo=' + (_detected.odoo ? 'Y' : 'N') + ' idempiere=agent');
      // S3 default: a detected ERP wins; else the first real one.
      var hit = ERPS.filter(function (e) { return _detected[e.key]; })[0];
      var def = hit || ERPS.filter(function (e) { return e.real; })[0];
      var greyed = ERPS.filter(function (e) { return !e.real; }).map(function (e) { return e.key; });
      console.log('§ERP-PICKER highlight=' + (hit ? hit.key : 'none') + ' greyed=[' + greyed.join(',') + ']');
      console.log('§ERP-PICKER default=' + def.key);
      _select(def.key);
    });
  }

  function _paintCard(key) {
    var e = _erp(key), b = _$('ep-b-' + key), c = _$('ep-c-' + key);
    if (b) b.innerHTML = _detected[key] ? '<span class="ep-detect">● detected</span>' : (e.real ? '<span class="ep-agent">via agent</span>' : '<span class="ep-coming">coming soon</span>');
    if (c) c.classList.toggle('ep-live', !!_detected[key]);
  }

  function _select(key) {
    _sel = key;
    ERPS.forEach(function (e) { var c = _$('ep-c-' + e.key); if (c) c.classList.toggle('ep-sel', e.key === key); });
    _renderFoot();
  }

  function _renderFoot() {
    var foot = _$('ep-foot'); if (!foot || !_sel) return;
    var e = _erp(_sel);
    var verb = _mode === 'install' ? 'install' : 'migrate';
    var q = _mode === 'install' ? ('Install <b>' + e.name + '</b> data onto this device?')
                                : ('Do you want to ' + verb + ' your <b>' + e.name + '</b> data?');
    var btn = e.real
      ? '<button id="ep-go" class="ep-btn ep-primary">' + (_mode === 'install' ? 'Install ' : 'Migrate ') + e.name + '</button>'
      : '<button id="ep-go" class="ep-btn" disabled>' + e.name + ' — coming</button>';
    foot.innerHTML = '<div class="ep-q">' + q + '</div>' + btn
      + (e.real ? '' : '<div class="ep-dim ep-comingnote">No adapter yet — ' + e.name + ' migration is on the way. '
         + 'Nothing is faked; pick iDempiere or Odoo for a real fold.</div>');
    var go = _$('ep-go'); if (go && e.real) go.onclick = function () { _confirm(_sel); };
  }

  // ── S4 — route on confirm ──
  function _confirm(key) {
    var e = _erp(key);
    if (!e.real) { console.log('§ERP-PICKER coming erp=' + key); _say(e.name + ' migration is coming.'); return; }
    console.log('§ERP-PICKER confirm erp=' + key + ' route=' + e.route);
    if (e.route === 'showme') {
      close();
      if (global.MigrateShowMe && global.MigrateShowMe.open) global.MigrateShowMe.open();
      else _say('Migrate ShowMe overlay not loaded.');
      return;
    }
    if (e.route === 'odoo') { _renderOdoo(); return; }
  }

  // ── Odoo sub-flow (delegate-to-install): run the agent → load chain → re-fold via ERPKernel ──
  function _renderOdoo() {
    var body = _$('ep-body'); if (!body) return;
    body.innerHTML =
      '<p class="ep-dim">The browser never connects to Odoo directly (delegate-to-install). Run the '
      + 'extractor on the machine that has Odoo — it pulls the chain and writes <code>odoo_chain.json</code>, '
      + 'which you load here. Every value below is a recorded Odoo row.</p>'
      + '<p><b>1.</b> Get the install-side agent and run it (needs Node + sql.js + the adapter):</p>'
      + '<a class="ep-btn ep-primary" href="odoo_agent.js" download="odoo_agent.js">⬇ Download odoo_agent.js</a>'
      + '<pre class="ep-cmd">node odoo_agent.js   # → build/erp/odoo_chain.json</pre>'
      + '<p><b>2.</b> Load the <code>odoo_chain.json</code> it produced:</p>'
      + '<input type="file" id="ep-chain" accept=".json,application/json" class="ep-file">'
      + '<div id="ep-result" class="ep-result"></div>'
      + '<div class="ep-foot"><button id="ep-back" class="ep-btn">&larr; Back</button></div>';
    _$('ep-back').onclick = function () { _renderPicker(); _select(_sel); };
    _$('ep-chain').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      f.text().then(function (txt) { _foldChain(JSON.parse(txt)); })
        .catch(function (err) { _$('ep-result').innerHTML = '<div class="ep-err">Load failed: ' + err.message + '</div>'; });
    };
  }

  function _ensureSql() {
    if (_SQL) return Promise.resolve(_SQL);
    if (typeof initSqlJs !== 'function') return Promise.reject(new Error('sql.js not loaded'));
    return initSqlJs({ locateFile: function () { return 'lib/sql-wasm-fts5.wasm'; } }).then(function (S) { _SQL = S; return S; });
  }

  // RE-FOLD the loaded chain through window.ERPKernel + the carried wfmc (the Odoo dictionary). The engine
  // is shared; the dictionary travels in the file. Proves the same 6 verbs migrate Odoo, in the browser.
  function _foldChain(chain) {
    var out = _$('ep-result'); out.innerHTML = '<div class="ep-dim">Folding ' + (chain.events || []).length + ' hops through the engine…</div>';
    var K = global.ERPKernel;
    if (!K) { out.innerHTML = '<div class="ep-err">Engine (window.ERPKernel) not loaded — open the Kanban pill once to boot it, then retry.</div>'; return; }
    _ensureSql().then(function (S) {
      var db = new S.Database(); K.initProjection(db);
      var qfn = function (s, p) { return K.query(db, s, p); };
      var known = chain.KNOWN_VERBS || ['CREATE_DOCUMENT', 'CREATE_LINE', 'SET_STATUS', 'ALLOCATE', 'MATCH', 'POST'];
      var rows = [], used = {}, mapped = 0;
      chain.events.forEach(function (ev) { K.register(ev.d.docType, ev.d.action, (function (ops) { return function () { return ops; }; })(ev.ops)); });
      chain.events.forEach(function (ev, i) {
        ev.ops.forEach(function (o) { used[o.op_type] = 1; });
        var r = K.dispatch(db, { wfmc: chain.wfmc, guards: [], query: qfn, actor: 'odoo:migrate', baseTs: 1000 + i * 100 }, ev.d);
        if (r.ok) mapped++;
        rows.push({ name: ev.name, doc: ev.d.docType + ':' + ev.d.action, ops: ev.ops.length, ok: !!r.ok, to: r.to || (r.stage + ':' + r.reason) });
      });
      var usedVerbs = Object.keys(used).sort();
      var newVerbs = usedVerbs.filter(function (v) { return known.indexOf(v) < 0; });
      var dr = (chain.gl && chain.gl.dr) || 0, cr = (chain.gl && chain.gl.cr) || 0, balanced = Number(dr).toFixed(2) === Number(cr).toFixed(2);
      // verify: replay the op-log twice; identical rebuild = trust (the §1 replay-hash check).
      var chainOk = false, tip = '', len = 0;
      try { var a = K.replay(db, new S.Database()), b = K.replay(db, new S.Database()); chainOk = a.hash === b.hash; tip = a.hash; len = a.ops; } catch (e) {}
      out.innerHTML =
        '<table class="ep-tbl"><thead><tr><th>hop</th><th>doc</th><th>ops</th><th>→</th></tr></thead><tbody>'
        + rows.map(function (r) { return '<tr class="' + (r.ok ? '' : 'ep-bad') + '"><td>' + r.name + '</td><td>' + r.doc + '</td><td>' + r.ops + '</td><td>' + (r.ok ? '✓ ' + r.to : '✗ ' + r.to) + '</td></tr>'; }).join('')
        + '</tbody></table>'
        + '<div class="ep-sum">'
        + '<div>SO <b>' + (chain.meta && chain.meta.so) + '</b> → invoice <b>' + (chain.meta && chain.meta.invoice) + '</b>, total <b>' + Number((chain.totals && chain.totals.total) || 0).toFixed(2) + '</b></div>'
        + '<div>mapped <b>' + mapped + '/' + chain.events.length + '</b> · verbs [' + usedVerbs.join(', ') + '] · newVerbs [<b>' + newVerbs.join(',') + '</b>]</div>'
        + '<div>invoice GL ΣDr ' + Number(dr).toFixed(2) + ' ' + (balanced ? '== ' : '≠ ') + 'ΣCr ' + Number(cr).toFixed(2) + ' ' + (balanced ? '✓' : '✗') + '</div>'
        + '<div>verify chain ' + (chainOk ? '✓ trusted' : '✗') + ' · ops ' + len + ' · tip <code>' + String(tip).slice(0, 16) + '…</code></div>'
        + '</div>';
      console.log('§ODOO-MIGRATE-BROWSER loaded events=' + chain.events.length + ' mapped=' + mapped + '/' + chain.events.length
        + ' verbs=[' + usedVerbs.join(',') + '] newVerbs=[' + newVerbs.join(',') + '] glDr' + (balanced ? '==' : '!=') + 'glCr verify chainOk=' + (chainOk ? 'Y' : 'N') + ' tip=' + tip);
      if (db.close) db.close();
    }).catch(function (e) { out.innerHTML = '<div class="ep-err">Fold failed: ' + e.message + '</div>'; });
  }

  function _injectStyle() {
    if (_$('ep-style')) return;
    var s = _el('style', { id: 'ep-style' });
    s.textContent =
      '.ep-overlay{position:fixed;inset:0;background:rgba(8,10,16,.66);z-index:99998;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}'
      + '.ep-card{background:#fff;color:#1a1d22;width:min(560px,94vw);max-height:90vh;overflow:auto;border-radius:14px;box-shadow:0 22px 64px rgba(0,0,0,.45)}'
      + '.ep-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;font-weight:700;font-size:17px;color:#0b6}'
      + '.ep-x{border:0;background:none;font-size:24px;cursor:pointer;color:#999;line-height:1}'
      + '.ep-body{padding:18px 20px;font-size:14px;line-height:1.5}.ep-dim{color:#777;font-size:12px;margin:0 0 14px}'
      + '.ep-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;margin:6px 0 16px}'
      + '.ep-cardlet{border:2px solid #e6e6ea;border-radius:12px;padding:12px 6px;text-align:center;cursor:pointer;opacity:.55;transition:.12s}'
      + '.ep-cardlet:hover{border-color:#bcd}.ep-cardlet.ep-live{opacity:1}.ep-cardlet.ep-sel{border-color:#0b6;box-shadow:0 0 0 3px rgba(11,170,102,.18)}'
      + '.ep-ic{font-size:24px}.ep-nm{font-size:12px;font-weight:600;margin:4px 0 6px}'
      + '.ep-badge{font-size:10px;min-height:14px}.ep-detect{color:#0b6;font-weight:700}.ep-agent{color:#36c}.ep-coming{color:#a98}.ep-probing{color:#aaa}'
      + '.ep-q{font-size:15px;margin:6px 0 12px}.ep-foot{margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}'
      + '.ep-btn{padding:9px 16px;border:1px solid #ccc;background:#f5f5f5;border-radius:8px;cursor:pointer;font-size:13px}.ep-btn[disabled]{opacity:.5;cursor:not-allowed}'
      + '.ep-primary{background:#0b6;color:#fff;border-color:#0b6}.ep-comingnote{margin-top:4px;flex-basis:100%}'
      + '.ep-cmd{background:#0d1117;color:#9be29b;padding:10px;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-all;margin:8px 0}'
      + '.ep-file{margin:8px 0}.ep-result{margin-top:12px}'
      + '.ep-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px}.ep-tbl th,.ep-tbl td{text-align:left;padding:5px 8px;border-bottom:1px solid #f0f0f0}.ep-tbl th{color:#888;font-weight:600}.ep-bad{color:#c33}'
      + '.ep-sum{font-size:13px;line-height:1.7;background:#f6faf7;border:1px solid #d8efe2;border-radius:8px;padding:10px 12px}'
      + '.ep-err{color:#c33;font-size:13px}';
    document.head.appendChild(s);
  }

  global.ErpPicker = { open: open, close: close, _erps: ERPS };
})(typeof window !== 'undefined' ? window : this);
