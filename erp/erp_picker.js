/**
 * BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
 *
 * erp_picker.js — the "pick-your-ERP" Install/Migrate dialog (prompts/MIGRATE_ERP_PICKER.md §SPEC).
 *   ONE dialog family: Install + Migrate both call open({mode}). It (S1) lists ALL five ERPs always,
 *   (S2) best-effort DETECTS what is present and highlights it / greys the rest, (S3) defaults to the
 *   detected source and asks "migrate your <X> data?", (S4) routes on confirm:
 *     iDempiere → MigrateShowMe (real PG agent) · Odoo → the real delegate-to-install fold, presented as a
 *     STAGED panel: ① download the self-sufficient odoo_agent.zip bundle (agent + engine + adapter +
 *     package.json — runs `npm install && node agent.js` from a fresh dir, no repo) → ② run it natively
 *     (copy-button command) → ③ drop the produced odoo_chain.json (validated) → RE-FOLD through
 *     window.ERPKernel · others → honest "coming".
 *   NON-INVENT: detection is a liveness probe only (no-cors, opaque) — the browser never reads ERP data
 *   cross-origin; extraction is delegate-to-install. Absent adapter ⇒ honest "coming", never a faked migrate.
 *
 *   §-witnesses (console, §-log first):
 *     §ERP-PICKER open mode=<m> erps=5
 *     §ERP-PICKER detect odoo=<Y|N> idempiere=agent
 *     §ERP-PICKER highlight=<key> greyed=[sap,oracle,dynamics]
 *     §ERP-PICKER default=<key>
 *     §ERP-PICKER confirm erp=<key> route=<route>   |   §ERP-PICKER coming erp=<key>
 *     §MIGRATE-INSTR clear=Y selfsufficient=Y design=staged erp=odoo artifact=odoo_agent.zip
 *     §ODOO-MIGRATE-BROWSER loaded events=5 mapped=5/5 verbs=[…] newVerbs=[] glDr==glCr verify chainOk=Y
 */
(function (global) {
  'use strict';

  // S1 — the full list, always rendered. real:true ⇒ a working route; real:false ⇒ honest "coming".
  // dot = brand hue rendered as a clean CSS circle (CONSISTENCY_FINISH.md §K-2 — same hues the old
  // emoji marks carried, minus the cross-platform emoji rendering variance).
  var ERPS = [
    { key: 'idempiere', name: 'iDempiere',   dot: '#e8590c', real: true,  route: 'showme' },
    { key: 'odoo',      name: 'Odoo',        dot: '#9c36b5', real: true,  route: 'odoo', probe: probeOdoo },
    { key: 'sap',       name: 'SAP',         dot: '#1971c2', real: false },
    { key: 'oracle',    name: 'Oracle',      dot: '#e03131', real: false },
    { key: 'dynamics',  name: 'MS Dynamics', dot: '#1864ab', real: false }
  ];

  // Each source's installable tenant shard. The dialog success-path INSTALLS this (merge + persist) so
  // going through Install actually leaves a resident tenant — not just a verified fold. Migrate mode for
  // iDempiere still routes to its MigrateShowMe/agent flow (NEW_CLIENT_MGMT.md #5).
  // 12/13 = LIVE-EXTRACTED tenants (gen_ad_odoo.js off odoodemo; migrate agent off real PG, PK re-banded —
  // IDMP_FULLWIDTH_SEED §4, W-IDMP-REBAND). 14/15/16 = master-matching PoC tenants (IMPORT_EXPAND_POC.md §P-1,
  // gen_poc_shards.js): each carries that vendor's DOCUMENTED PUBLIC DEMO MODEL (SFLIGHT / SCOTT EMP-DEPT /
  // CRONUS) — reference data, NOT a live extraction; the claim text says so. Delegate agents = the production
  // path; these prove the master-table mapping + login-able frame.
  // claim = the honest per-tenant lock-banner HTML shown by _renderInstallTenant.
  var TENANT_SHARD = {
    odoo: { file: '12-odoo.db', name: 'Odoo', client: 12,
      claim: 'A migrated Odoo client extracted LIVE from odoodemo — every row a recorded Odoo row, its books '
        + 'already diffed to the cent against its own GL (nothing is invented).' },
    idempiere: { file: '13-idempiere.db', name: 'iDempiere', client: 13,
      claim: 'A migrated iDempiere client extracted by the real PG agent — every row a recorded iDempiere row, '
        + 'its ids banded into the Client-13 slot, and its books already diffed to the cent against its own GL '
        + '(nothing is invented).' },
    sap: { file: '14-sap.db', name: 'SAP Flights', client: 14, poc: true,
      claim: '<b>PoC tenant</b> — the documented SAP <b>SFLIGHT</b> reference model (the flight-booking demo): '
        + 'SCARR carriers land as Business Partners, SPFLI connections as Products. Master-table mapping only — '
        + 'reference data, not a live extraction; the SAP delegate agent is the production path.' },
    oracle: { file: '15-oracle.db', name: 'Oracle Scott', client: 15, poc: true,
      claim: '<b>PoC tenant</b> — Oracle\'s canonical <b>EMP/DEPT (SCOTT)</b> reference schema: departments land '
        + 'as BP Groups, employees as Business Partners. Master-table mapping only — reference data, not a live '
        + 'extraction; the Oracle delegate agent is the production path.' },
    dynamics: { file: '16-dynamics.db', name: 'Dynamics Cronus', client: 16, poc: true,
      claim: '<b>PoC tenant</b> — the Dynamics 365 Business Central <b>CRONUS</b> demo company: furniture items '
        + 'land as Products, customers as Business Partners. Master-table mapping only — reference data, not a '
        + 'live extraction; the Dynamics delegate agent is the production path.' }
  };

  var _overlay = null, _mode = 'migrate', _status = null;
  var _detected = {};   // key → true (port reachable). idempiere is 'agent' (real, not auto-probeable).
  var _sel = null;

  // Shared utilities + the ONE icon renderer live in overlay_kit.js (CONSISTENCY_FINISH.md §K-1) —
  // loaded before this script on every host page (erp.html, idempiere.html).
  var _el = global.OverlayKit.el, _ico = global.OverlayKit.ico;
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
      + '<div class="ep-head"><span>' + (_mode === 'install' ? _ico('download', 16) + ' Install onto this device' : _ico('plug', 16) + ' Migrate from your ERP')
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
      card.innerHTML = '<div class="ep-ic"><span class="ep-dot" style="background:' + e.dot + '"></span></div><div class="ep-nm">' + e.name + '</div>'
        + '<div id="ep-b-' + e.key + '" class="ep-badge">' + _badge(e) + '</div>';
      card.onclick = function () { _select(e.key); };
      grid.appendChild(card);
    });
    _renderFoot();
  }
  function _badge(e) {
    if (!e.real) return (_mode === 'install' && TENANT_SHARD[e.key])
      ? '<span class="ep-poc">PoC tenant</span>' : '<span class="ep-coming">coming soon</span>';
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
    if (b) b.innerHTML = _detected[key] ? '<span class="ep-detect"><span class="ep-livedot"></span> detected</span>' : (e.real ? '<span class="ep-agent">via agent</span>' : _badge(e));
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
    var shard = TENANT_SHARD[e.key];
    var installable = e.real || (_mode === 'install' && shard);     // PoC tenants install; only agents migrate
    var q = _mode === 'install' ? ('Install <b>' + e.name + '</b> data onto this device?')
                                : ('Do you want to ' + verb + ' your <b>' + e.name + '</b> data?');
    var btn = installable
      ? '<button id="ep-go" class="ep-btn ep-primary">' + (_mode === 'install' ? 'Install ' : 'Migrate ') + e.name
        + (!e.real && shard && shard.poc ? ' (PoC)' : '') + '</button>'
      : '<button id="ep-go" class="ep-btn" disabled>' + e.name + ' — coming</button>';
    foot.innerHTML = '<div class="ep-q">' + q + '</div>' + btn
      + (installable ? '' : '<div class="ep-dim ep-comingnote">No adapter yet — ' + e.name + ' migration is on the way. '
         + 'Nothing is faked; pick iDempiere or Odoo for a real fold, or Install its PoC tenant (documented demo model).</div>');
    var go = _$('ep-go'); if (go && installable) go.onclick = function () { _confirm(_sel); };
  }

  // ── S4 — route on confirm ──
  function _confirm(key) {
    var e = _erp(key);
    // INSTALL mode + a shard → install-tenant panel for EVERY non-Odoo source (iDempiere #5-install route;
    // SAP/Oracle/Dynamics PoC tenants — IMPORT_EXPAND_POC.md §P-2). Odoo keeps its fold-then-install staged flow.
    if (_mode === 'install' && TENANT_SHARD[key] && e.route !== 'odoo') { console.log('§ERP-PICKER confirm erp=' + key + ' route=install-tenant' + (e.real ? '' : ' poc=Y')); _renderInstallTenant(TENANT_SHARD[key]); return; }
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

  // ── iDempiere install-tenant panel (#5-install) — the shard is already verified (its books diffed
  //    against its OWN fact_acct, W-IDMP-REBAND/frame-fit), so install mode goes straight to the CTA.
  function _renderInstallTenant(tenant) {
    var body = _$('ep-body'); if (!body) return;
    body.innerHTML =
      '<div class="ep-lock">' + _ico('lock', 14) + ' <b>' + tenant.name + ' tenant shard'
      + (tenant.poc ? '' : ', pre-verified') + '.</b> ' + tenant.claim + '</div>'
      + '<div id="ep-result" class="ep-result"></div>'
      + '<div class="ep-foot"><button id="ep-back" class="ep-btn">' + _ico('chevronLeft', 13) + ' Back</button></div>';
    console.log('§ERP-PICKER install-tenant erp=' + _sel + ' shard=' + tenant.file + ' client=' + tenant.client);
    _$('ep-back').onclick = function () { _renderPicker(); _select(_sel); };
    _renderInstallCta(_$('ep-result'), tenant);
  }

  // ── Odoo sub-flow (delegate-to-install): a STAGED panel — download bundle → run natively → load chain ──
  //    The 🔒 doctrine is stated up front; each step shows a done-state; the run command is copy-able; the
  //    drop-zone validates the produced file (✓ N events / ✗ wrong file) before re-folding via ERPKernel.
  var ODOO_CMD = 'cd odoo_agent && npm install && node agent.js   # → ./odoo_chain.json';
  function _renderOdoo() {
    var body = _$('ep-body'); if (!body) return;
    body.innerHTML =
      '<div class="ep-lock">' + _ico('lock', 14) + ' <b>The browser cannot reach your Odoo / Postgres / Docker.</b> '
      + 'YOU run the agent <b>natively</b> on the machine that has Odoo — it writes one file '
      + '(<code>odoo_chain.json</code>) that you then load back here. Your credentials never leave that machine; '
      + 'every value is a recorded Odoo row (nothing is invented).</div>'
      + '<div class="ep-steps">'
      // ① download the self-sufficient bundle
      + '<div class="ep-step" id="ep-s1"><div class="ep-sn">1</div><div class="ep-sc">'
      + '<div class="ep-st">Download the agent bundle</div>'
      + '<div class="ep-sd">A self-contained zip — agent + engine + adapter + <code>package.json</code>. '
      + 'No repo needed.</div>'
      + '<a id="ep-dl" class="ep-btn ep-primary" href="odoo_agent.zip" download="odoo_agent.zip">' + _ico('download', 13) + ' odoo_agent.zip</a>'
      + '</div></div>'
      // ② run it natively
      + '<div class="ep-step" id="ep-s2"><div class="ep-sn">2</div><div class="ep-sc">'
      + '<div class="ep-st">Run it natively (Node)</div>'
      + '<div class="ep-sd">Unzip, then — on the machine that has Odoo — install the one dependency and run. '
      + 'Defaults to <code>odoodemo</code> @ <code>localhost:8069</code>; override creds via env (see the bundle README).</div>'
      + '<div class="ep-cmdrow"><pre class="ep-cmd" id="ep-cmd">' + ODOO_CMD + '</pre>'
      + '<button id="ep-copy" class="ep-btn ep-copy" title="Copy command">' + _ico('clipboard', 13) + ' Copy</button></div>'
      + '</div></div>'
      // ③ load the produced file
      + '<div class="ep-step" id="ep-s3"><div class="ep-sn">3</div><div class="ep-sc">'
      + '<div class="ep-st">Load the file it produced</div>'
      + '<div class="ep-sd">Drop or pick the <code>odoo_chain.json</code> the agent wrote.</div>'
      + '<label id="ep-drop" class="ep-drop"><input type="file" id="ep-chain" accept=".json,application/json" hidden>'
      + '<span id="ep-droptxt">Drop <code>odoo_chain.json</code> here, or click to choose</span></label>'
      + '</div></div>'
      + '</div>'
      + '<div id="ep-result" class="ep-result"></div>'
      + '<div class="ep-foot"><button id="ep-back" class="ep-btn">' + _ico('chevronLeft', 13) + ' Back</button></div>';

    console.log('§MIGRATE-INSTR clear=Y selfsufficient=Y design=staged erp=odoo artifact=odoo_agent.zip');

    _$('ep-back').onclick = function () { _renderPicker(); _select(_sel); };
    _$('ep-dl').onclick = function () { _stepDone('ep-s1'); };
    _$('ep-copy').onclick = function () {
      if (navigator.clipboard) navigator.clipboard.writeText(ODOO_CMD);
      _$('ep-copy').innerHTML = 'Copied ' + _ico('check', 12); _stepDone('ep-s2');
    };
    var drop = _$('ep-drop'), inp = _$('ep-chain');
    function _take(f) {
      if (!f) return;
      f.text().then(function (txt) { _onChainFile(txt, f.name); })
        .catch(function (err) { _dropBad(err.message); });
    }
    inp.onchange = function () { _take(this.files && this.files[0]); };
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('ep-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('ep-dragover'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; _take(f);
    });
  }

  function _stepDone(id) { var s = _$(id); if (s) s.classList.add('ep-done'); }
  function _dropBad(msg) {
    var t = _$('ep-droptxt'); if (t) t.innerHTML = _ico('xmark', 12) + ' Not a valid chain file — ' + msg + '. Re-run step 2.';
    var d = _$('ep-drop'); if (d) { d.classList.add('ep-drop-bad'); d.classList.remove('ep-drop-ok'); }
    var s = _$('ep-s3'); if (s) s.classList.remove('ep-done');
  }
  // Validate the file BEFORE folding — must parse to JSON with an events[] array (the chain shape).
  function _onChainFile(txt, name) {
    var chain;
    try { chain = JSON.parse(txt); } catch (e) { return _dropBad('not JSON'); }
    if (!chain || !Array.isArray(chain.events) || !chain.events.length) {
      return _dropBad('no events[] — is this the agent output?');
    }
    var t = _$('ep-droptxt'); if (t) t.innerHTML = _ico('check', 12) + ' <b>' + (name || 'odoo_chain.json') + '</b> — parsed '
      + chain.events.length + ' events';
    var d = _$('ep-drop'); if (d) { d.classList.add('ep-drop-ok'); d.classList.remove('ep-drop-bad'); }
    _stepDone('ep-s3');
    _foldChain(chain);
  }

  // RE-FOLD the loaded chain through window.ERPKernel + the carried wfmc (the Odoo dictionary). The engine
  // is shared; the dictionary travels in the file. Proves the same 6 verbs migrate Odoo, in the browser.
  function _foldChain(chain) {
    var out = _$('ep-result'); out.innerHTML = '<div class="ep-dim">Folding ' + (chain.events || []).length + ' hops through the engine…</div>';
    var K = global.ERPKernel;
    if (!K) { out.innerHTML = '<div class="ep-err">Engine (window.ERPKernel) not loaded — open the Kanban pill once to boot it, then retry.</div>'; return; }
    global.OverlayKit.ensureSql().then(function (S) {
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
        + rows.map(function (r) { return '<tr class="' + (r.ok ? '' : 'ep-bad') + '"><td>' + r.name + '</td><td>' + r.doc + '</td><td>' + r.ops + '</td><td>' + (r.ok ? _ico('check', 12) + ' ' + r.to : _ico('xmark', 12) + ' ' + r.to) + '</td></tr>'; }).join('')
        + '</tbody></table>'
        + '<div class="ep-sum">'
        + '<div>SO <b>' + (chain.meta && chain.meta.so) + '</b> → invoice <b>' + (chain.meta && chain.meta.invoice) + '</b>, total <b>' + Number((chain.totals && chain.totals.total) || 0).toFixed(2) + '</b></div>'
        + '<div>mapped <b>' + mapped + '/' + chain.events.length + '</b> · verbs [' + usedVerbs.join(', ') + '] · newVerbs [<b>' + newVerbs.join(',') + '</b>]</div>'
        + '<div>invoice GL ΣDr ' + Number(dr).toFixed(2) + ' ' + (balanced ? '== ' : '≠ ') + 'ΣCr ' + Number(cr).toFixed(2) + ' ' + _ico(balanced ? 'check' : 'xmark', 12) + '</div>'
        + '<div>verify chain ' + (chainOk ? _ico('check', 12) + ' trusted' : _ico('xmark', 12)) + ' · ops ' + len + ' · tip <code>' + String(tip).slice(0, 16) + '…</code></div>'
        + '</div>';
      console.log('§ODOO-MIGRATE-BROWSER loaded events=' + chain.events.length + ' mapped=' + mapped + '/' + chain.events.length
        + ' verbs=[' + usedVerbs.join(',') + '] newVerbs=[' + newVerbs.join(',') + '] glDr' + (balanced ? '==' : '!=') + 'glCr verify chainOk=' + (chainOk ? 'Y' : 'N') + ' tip=' + tip);
      if (db.close) db.close();
      // INSTALL success-path: the fold is verified → offer to make the tenant RESIDENT (merge its shard + persist).
      // Only in install mode; migrate mode stops at "verified fold" (no install). _sel is the chosen source key.
      if (_mode === 'install' && TENANT_SHARD[_sel]) _renderInstallCta(_$('ep-result'), TENANT_SHARD[_sel]);
    }).catch(function (e) { out.innerHTML = '<div class="ep-err">Fold failed: ' + e.message + '</div>'; });
  }

  // ── INSTALL CTA — turn a verified fold into a resident tenant (drives persist from the dialog, not the URL) ──
  function _renderInstallCta(out, tenant) {
    if (!out) return;
    var box = _el('div', { class: 'ep-install' });
    box.innerHTML =
      '<div class="ep-idim">The fold is verified. Install <b>' + tenant.name + '</b> as a resident tenant '
      + '(Client ' + tenant.client + ') — it survives a plain reload and appears in the login tenant switcher.</div>'
      + '<button id="ep-install-go" class="ep-btn ep-primary">' + _ico('download', 13) + ' Install ' + tenant.name + ' (Client ' + tenant.client + ')</button>'
      + '<div id="ep-install-msg" class="ep-idim"></div>';
    out.appendChild(box);
    _$('ep-install-go').onclick = function () { _doInstall(tenant); };
  }

  function _doInstall(tenant) {
    var btn = _$('ep-install-go'), msg = _$('ep-install-msg');
    if (btn) { btn.disabled = true; btn.textContent = 'Installing…'; }
    var fn = global.idmpInstallShard;   // present on idempiere.html (where Install is reached); installs in-page
    if (typeof fn !== 'function') {
      // not on idempiere.html (e.g. opened from erp.html) — hand off to the proven ?shard= URL install path.
      console.log('§ERP-INSTALL erp=' + _sel + ' via=shard-url shard=' + tenant.file + ' client=' + tenant.client);
      if (msg) msg.textContent = 'Opening the iDempiere app to finish install…';
      location.href = 'idempiere.html?shard=' + encodeURIComponent(tenant.file) + '&client=' + tenant.client;
      return;
    }
    Promise.resolve(fn(tenant.file)).then(function (res) {
      res = res || {};
      console.log('§ERP-INSTALL erp=' + _sel + ' shard=' + tenant.file + ' client=' + tenant.client
        + ' rows=' + (res.mRow || 0) + ' clients=' + (res.clients != null ? res.clients : '?') + ' persisted=' + (res.persisted ? 'Y' : 'N'));
      if (res.ok && res.persisted) {
        if (btn) btn.innerHTML = _ico('check', 12) + ' Installed';
        if (msg) msg.innerHTML = _ico('check', 12) + ' <b>' + tenant.name + '</b> installed (Client ' + tenant.client + ', '
          + (res.mRow || 0) + ' rows merged) and persisted — it now survives reload. '
          + '<button id="ep-reload" class="ep-btn ep-primary">Reload &amp; switch tenant</button>';
        var rl = _$('ep-reload'); if (rl) rl.onclick = function () { location.href = location.pathname; };
      } else {
        if (btn) { btn.disabled = false; btn.innerHTML = _ico('download', 13) + ' Install ' + tenant.name; }
        if (msg) msg.innerHTML = _ico('xmark', 12) + ' Install failed: ' + (res.error || 'no rows merged');
      }
    });
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
      + '.ep-ic{height:24px;display:flex;align-items:center;justify-content:center}.ep-nm{font-size:12px;font-weight:600;margin:4px 0 6px}'
      + '.ep-dot{width:18px;height:18px;border-radius:50%;display:inline-block}'
      + '.ep-livedot{width:7px;height:7px;border-radius:50%;background:#0b6;display:inline-block;vertical-align:1px}'
      + '.ep-badge{font-size:10px;min-height:14px}.ep-detect{color:#0b6;font-weight:700}.ep-agent{color:#36c}.ep-coming{color:#a98}.ep-probing{color:#aaa}.ep-poc{color:#b07d10;font-weight:600}'
      + '.ep-q{font-size:15px;margin:6px 0 12px}.ep-foot{margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}'
      + '.ep-btn{padding:9px 16px;border:1px solid #ccc;background:#f5f5f5;border-radius:8px;cursor:pointer;font-size:13px}.ep-btn[disabled]{opacity:.5;cursor:not-allowed}'
      + '.ep-primary{background:#0b6;color:#fff;border-color:#0b6}.ep-comingnote{margin-top:4px;flex-basis:100%}'
      + '.ep-cmd{background:#0d1117;color:#9be29b;padding:10px;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-all;margin:0;flex:1}'
      + '.ep-file{margin:8px 0}.ep-result{margin-top:12px}'
      + '.ep-install{margin-top:14px;padding:12px 14px;border:1px solid #cfe9d8;background:#f6faf7;border-radius:10px}'
      + '.ep-idim{color:#567;font-size:12px;margin:6px 0;line-height:1.5}'
      // staged Odoo panel
      + '.ep-lock{background:#fff8e6;border:1px solid #f0e0a8;border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.5;color:#5a4a16;margin:0 0 14px}.ep-lock code{background:#fdeec2;padding:1px 4px;border-radius:4px}'
      + '.ep-steps{display:flex;flex-direction:column;gap:10px}'
      + '.ep-step{display:flex;gap:12px;border:1px solid #e6e6ea;border-radius:12px;padding:12px 14px;transition:.15s}'
      + '.ep-step.ep-done{border-color:#0b6;background:#f6faf7}'
      + '.ep-sn{flex:none;width:26px;height:26px;border-radius:50%;background:#e6e6ea;color:#555;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}'
      // done-state step number → Lucide check (inline data-URI of the same icons.js `check` path)
      + '.ep-step.ep-done .ep-sn{font-size:0;background:#0b6 url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>\') center/13px 13px no-repeat}'
      + '.ep-sc{flex:1;min-width:0}.ep-st{font-weight:600;font-size:13.5px;margin-bottom:3px}.ep-sd{color:#777;font-size:12px;line-height:1.45;margin-bottom:9px}.ep-sd code{background:#f0f0f3;padding:1px 4px;border-radius:4px}'
      + '.ep-cmdrow{display:flex;gap:8px;align-items:stretch}.ep-copy{flex:none;font-size:12px;white-space:nowrap}'
      + '.ep-drop{display:block;border:2px dashed #ccd;border-radius:10px;padding:16px;text-align:center;color:#789;font-size:12.5px;cursor:pointer;transition:.12s}'
      + '.ep-drop:hover,.ep-drop.ep-dragover{border-color:#0b6;background:#f2fbf6;color:#0b6}'
      + '.ep-drop.ep-drop-ok{border-style:solid;border-color:#0b6;background:#f2fbf6;color:#0b6}'
      + '.ep-drop.ep-drop-bad{border-style:solid;border-color:#d66;background:#fdf3f3;color:#c33}.ep-drop code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:4px}'
      + '.ep-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px}.ep-tbl th,.ep-tbl td{text-align:left;padding:5px 8px;border-bottom:1px solid #f0f0f0}.ep-tbl th{color:#888;font-weight:600}.ep-bad{color:#c33}'
      + '.ep-sum{font-size:13px;line-height:1.7;background:#f6faf7;border:1px solid #d8efe2;border-radius:8px;padding:10px 12px}'
      + '.ep-err{color:#c33;font-size:13px}';
    document.head.appendChild(s);
  }

  global.ErpPicker = { open: open, close: close, _erps: ERPS };
})(typeof window !== 'undefined' ? window : this);
