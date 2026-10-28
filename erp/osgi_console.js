// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — osgi_console.js: the legacy-looking OSGi stack control panel for the "Plugins & Releases" page (Host work H2; user, 2026-10-15: "we should have the same legacy looking OSGi stack control panel, which legacy users are familiar with").
//   Modelled on the Apache Felix Web Console "Bundles" page that iDempiere administrators use (/osgi/system/console/bundles): a summary line, a filter box, a table  Id | Name | Version | Status | Actions , an expandable
//   detail pane per bundle (Symbolic Name, Version, Location, Activation Policy, Services registered ...), and Install/Update + Reload.  Statuses use OSGi's vocabulary: Active, Starting (a LAZY bundle that is started but not yet
//   activated), Resolved (stopped), Installed.  Id 0 is the system bundle; the built-in modules of this app are listed as always-active bundles (no actions: they are the substrate); plugin bundles come from PluginRegistry.
//   PURE model (model / details / summaryText / statusOf, node-testable: witness_osgi_console.js) + a small DOM render().  No clock, no randomness, no network.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OsgiConsole = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  // OSGi Bundle states as the Felix console words them. Our registry's STOPPED returns to Resolved exactly as an OSGi stop does.
  // Optional bundles the page OFFERS (ERP_FRIENDLY_OPS_LENS.md §30/§37): never auto-installed (the default screen stays the legacy twin's); an offer shows only while the bundle is not installed.
  //   One list for both install faces (this console and the Plugin Engine card).
  var GL = typeof window !== 'undefined' ? window : globalThis;
  GL.PluginOffers = GL.PluginOffers || [{ url: 'plugins/friendly_ops.mjs', id: 'org.kernel.friendly-ops', name: 'Friendly operations', blurb: 'Fewer clicks on the same books: Save & Complete, Add line, Save & back, Ship, Invoice, related records.' }];
  var STATUS = { ACTIVE: 'Active', STARTING: 'Starting', INSTALLED: 'Installed', RESOLVED: 'Resolved', STOPPED: 'Resolved', UNINSTALLED: 'Uninstalled' };
  function statusOf(state) { return STATUS[state] || String(state || ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // model({ systemName, version, builtins:[{id,label,core}], plugins:[registry.list() rows], filter }) -> { rows, summary, counts }
  function model(inp) {
    inp = inp || {};
    var rows = [], n = 0;
    rows.push({ id: n++, kind: 'system', key: null, name: inp.systemName || 'BIM OOTB ERP engine (system bundle)', symbolic: 'system.bundle', version: inp.version || '', state: 'ACTIVE', status: 'Active', actions: {} });
    (inp.builtins || []).forEach(function (b) {
      rows.push({ id: n++, kind: 'builtin', key: b.id, name: b.label || b.id, symbolic: 'bim.' + b.id, version: inp.version || '', state: 'ACTIVE', status: 'Active', actions: {}, core: !!b.core });
    });
    (inp.plugins || []).forEach(function (p) {
      var st = p.state, up = (st === 'ACTIVE' || st === 'STARTING');
      rows.push({ id: n++, kind: 'plugin', key: p.id, name: (p.name || p.id), symbolic: p.id, version: p.version || '', state: st, status: statusOf(st), url: p.url || null, policy: p.policy || null, activation: p.activation || 'eager',
        actions: { start: !up, stop: up, refresh: up, uninstall: true } });
    });
    var f = String(inp.filter || '').trim().toLowerCase();
    var shown = !f ? rows : rows.filter(function (r) { return (r.name + ' ' + r.symbolic + ' ' + r.status + ' ' + r.version).toLowerCase().indexOf(f) >= 0; });
    var counts = { total: rows.length, Active: 0, Starting: 0, Resolved: 0, Installed: 0 };
    rows.forEach(function (r) { if (counts[r.status] != null) counts[r.status]++; });
    return { rows: shown, all: rows, counts: counts, summary: summaryText(counts, shown.length, String(inp.filter || '').trim()) };   // the filter is shown as typed
  }

  // The Felix wording: "Bundle information: 232 bundles in total - all 232 bundles active."  /  "... - 230 bundles active, 2 bundles resolved."
  function summaryText(c, shown, filter) {
    var parts = [];
    if (c.Active === c.total) parts.push('all ' + c.total + ' bundles active');
    else {
      if (c.Active) parts.push(c.Active + ' bundle' + (c.Active === 1 ? '' : 's') + ' active');
      if (c.Starting) parts.push(c.Starting + ' bundle' + (c.Starting === 1 ? '' : 's') + ' starting (lazy)');
      if (c.Resolved) parts.push(c.Resolved + ' bundle' + (c.Resolved === 1 ? '' : 's') + ' resolved');
      if (c.Installed) parts.push(c.Installed + ' bundle' + (c.Installed === 1 ? '' : 's') + ' installed');
    }
    return 'Bundle information: ' + c.total + ' bundles in total - ' + parts.join(', ') + '.' + (filter ? ' Filter "' + filter + '" shows ' + shown + '.' : '');
  }

  // details(row, d) -> [[key, value], ...]: the expanded pane. d = registry.describe(id) for a plugin.
  // W-PLUGIN-ROLE: a read-only role sees the bundle's identity and state, never a value that could be configuration: the location is shown without its query string / fragment (where a key or token would sit).
  function stripQuery(u) { return String(u).replace(/[?#].*$/, ''); }
  function details(row, d, readOnly) {
    var out = [['Symbolic Name', row.symbolic], ['Version', row.version || '-'], ['Bundle Id', String(row.id)], ['Status', row.status + (row.state === 'STARTING' ? ' (started, activates on first demand)' : '')]];
    if (row.kind === 'system') { out.push(['Kind', 'System bundle: the running engine release (service-worker cache version)']); return out; }
    if (row.kind === 'builtin') { out.push(['Kind', row.core ? 'Built-in core module (always active: the substrate the fold runs through)' : 'Built-in optional module']); return out; }
    var m = (d && d.manifest) || {};
    var shownUrl = readOnly ? stripQuery(row.url) : row.url;
    out.push(['Location', shownUrl || '(in memory)']);
    var pol = (d && d.policy) || null, act = m.activation || 'eager';
    out.push(['Activation Policy', (pol || act) + (pol && pol !== act ? '  (admin override; bundle default: ' + act + ')' : '')]);
    var t = m.triggers; if (act === 'lazy' && t) out.push(['Lazy triggers', ['tables: ' + (t.tables || []).join(', '), (t.processes || []).length ? 'processes: ' + t.processes.join(', ') : '', (t.windows || []).length ? 'windows: ' + t.windows.join(', ') : ''].filter(Boolean).join(' · ')]);
    var req = Object.keys(m.requires || {}); out.push(['Require-Bundle', req.length ? req.map(function (k) { return k + ' ' + m.requires[k]; }).join(', ') : '(none)']);
    if (m.engineVersion) out.push(['Engine Version', m.engineVersion]);
    var hot = (m.chunks && m.chunks.hot) || []; out.push(['Hot chunks', hot.length ? String(hot.length) + ' (loaded before the bundle is Active)' : '(none)']);
    if (d && d.budget) out.push(['Declared budget', (d.budget.kb != null ? d.budget.kb + ' KB' : '') + (d.budget.note ? '  ' + d.budget.note : '')]);
    var c = (d && d.contributions) || [];
    out.push(['Services registered', row.state === 'ACTIVE' ? (c.length ? c : '(none)') : '(none - the bundle is not active)']);
    return out;
  }

  // ── DOM ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var CSS =
    '.oc{font-family:Verdana,Arial,sans-serif;font-size:12px;color:#222}' +
    '.oc .oc-bar{background:#2a2e35;color:#fff;padding:6px 10px;display:flex;align-items:center;gap:14px}.oc .oc-bar b{font-size:13px}.oc .oc-tab{padding:3px 10px;background:#444b55;border-radius:3px 3px 0 0;font-size:11.5px}.oc .oc-tab.on{background:#fff;color:#222}' +
    '.oc .oc-tools{display:flex;align-items:center;gap:8px;padding:8px 2px;flex-wrap:wrap}.oc input[type=text]{border:1px solid #9aa3ad;padding:3px 6px;font-size:12px;min-width:200px}' +
    '.oc button{border:1px solid #8f98a3;background:linear-gradient(#fff,#e3e7ec);padding:3px 10px;font-size:12px;cursor:pointer;border-radius:2px}.oc button:hover{background:#f1f4f8}.oc button[disabled]{opacity:.4;cursor:default}' +
    '.oc .oc-sum{padding:4px 2px 8px;color:#333}' +
    '.oc table.oc-t{width:100%;border-collapse:collapse}.oc .oc-t th{background:#cfd5dc;border:1px solid #aab2bb;text-align:left;padding:4px 6px;font-weight:700}' +
    '.oc .oc-t td{border:1px solid #d3d8de;padding:3px 6px;vertical-align:top}.oc .oc-t tr.odd td{background:#f5f7f9}' +
    '.oc .oc-id{width:34px;text-align:right}.oc .oc-ver{width:110px}.oc .oc-st{width:96px}.oc .oc-act{width:150px;white-space:nowrap}' +
    '.oc a.oc-nm{color:#0b5fa8;cursor:pointer;text-decoration:none}.oc a.oc-nm:hover{text-decoration:underline}.oc .oc-sym{color:#6b7480;font-size:10.5px}' +
    '.oc .oc-s-Active{color:#1a7f37;font-weight:700}.oc .oc-s-Starting{color:#b26a00;font-weight:700}.oc .oc-s-Resolved{color:#555}.oc .oc-s-Installed{color:#555;font-style:italic}' +
    '.oc .oc-ic{display:inline-block;width:22px;height:20px;line-height:18px;text-align:center;border:1px solid #9aa3ad;border-radius:2px;background:#fff;margin-right:2px;cursor:pointer;font-size:12px}.oc .oc-ic.off{opacity:.3;cursor:default}' +
    '.oc tr.oc-d td{background:#fbfcfd}.oc table.oc-kv{border-collapse:collapse;width:100%}.oc .oc-kv td{border:0;border-bottom:1px solid #eceff2;padding:2px 6px}.oc .oc-kv td:first-child{width:150px;font-weight:700;color:#444}' +
    '.oc ul.oc-svc{margin:0;padding-left:16px}.oc .oc-inst{display:flex;gap:6px;align-items:center;padding:6px 0}.oc .oc-inst input{flex:1}.oc .oc-offers{margin:6px 0;padding:8px 10px;border:1px solid #9bb7e0;background:#eef5ff;border-radius:6px}.oc .oc-offer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:4px 0}.oc .oc-offer small{color:#556}';
  function ensureCss(doc) { if (doc.getElementById('oc-css')) return; var s = doc.createElement('style'); s.id = 'oc-css'; s.textContent = CSS; doc.head.appendChild(s); }

  // render(el, deps): deps.canWrite === false draws the console READ-ONLY (no Install/Update, offers, per-row actions or activation toggle; W-PLUGIN-ROLE).
  //   deps = { systemName, version, builtins, list():plugin rows, describe(id), start(id), stop(id), refresh(id), uninstall(id), install(url), setPolicy(id, p), reload(), toast(msg) }
  var _open = {}, _filter = '', _showInstall = false;
  function offersHtml(M) {
    var have = {}; (M.all || []).forEach(function (r) { if (r.kind === 'plugin') have[r.key] = 1; });
    var rows = (GL.PluginOffers || []).filter(function (o) { return !have[o.id]; });
    if (!rows.length) return '';
    return '<div class="oc-offers" data-oc-offers><b>Available on this page</b>' + rows.map(function (o) { return '<div class="oc-offer" data-oc-offerrow="' + esc(o.id) + '"><span><b>' + esc(o.name) + '</b> <small>' + esc(o.blurb) + '</small></span><button data-oc-offer="' + esc(o.id) + '">Install and start</button></div>'; }).join('') + '</div>';
  }
  function render(el, deps) {
    var doc = el.ownerDocument; ensureCss(doc);
    var W = deps.canWrite !== false;
    var M = model({ systemName: deps.systemName, version: deps.version, builtins: deps.builtins, plugins: deps.list(), filter: _filter });
    function act(fn, id, msg) { return function () { Promise.resolve().then(function () { return fn(id); }).then(function () { if (msg && deps.toast) deps.toast(msg); render(el, deps); }, function (e) { if (deps.toast) deps.toast(e.message); render(el, deps); }); }; }
    var h = '<div class="oc"><div class="oc-bar"><b>BIM OOTB Web Console</b><span class="oc-tab on">Bundles</span></div>' +
      '<div class="oc-tools"><span>Apply Filter:</span><input type="text" data-oc-filter value="' + esc(_filter) + '"/><button data-oc-clear>Clear</button><button data-oc-reload>Reload</button>' + (W ? '<button data-oc-installtoggle>Install/Update...</button>' : '') + '</div>' +
      (W && _showInstall ? '<div class="oc-inst"><span>Bundle URL:</span><input type="text" data-oc-url placeholder="plugins/my_bundle.mjs or https://.../bundle.mjs"/><button data-oc-doinstall>Install and start</button></div>' : '') +
      (W ? offersHtml(M) : '') +
      '<div class="oc-sum">' + esc(M.summary) + '</div>' +
      '<table class="oc-t"><thead><tr><th class="oc-id">Id</th><th>Name</th><th class="oc-ver">Version</th><th class="oc-st">Status</th><th class="oc-act">Actions</th></tr></thead><tbody>';
    M.rows.forEach(function (r, i) {
      var a = r.actions || {}, ic = function (key, glyph, title) { return '<span class="oc-ic' + (a[key] ? '' : ' off') + '" title="' + title + '" data-oc-' + key + '="' + esc(r.key) + '">' + glyph + '</span>'; };
      h += '<tr class="' + (i % 2 ? 'odd' : '') + '"><td class="oc-id">' + r.id + '</td><td><a class="oc-nm" data-oc-name="' + r.id + '">' + esc(r.name) + '</a>' + (r.name === r.symbolic ? '' : ' <span class="oc-sym">(' + esc(r.symbolic) + ')</span>') + '</td><td class="oc-ver">' + esc(r.version) + '</td>' +
        '<td class="oc-st oc-s-' + r.status + '">' + r.status + '</td><td class="oc-act">' + (r.kind === 'plugin' && !W ? '<span class="oc-sym">view only</span>' : r.kind === 'plugin' ? ic('start', '&#9654;', 'Start') + ic('stop', '&#9632;', 'Stop') + ic('refresh', '&#8635;', 'Refresh (stop and start)') + ic('uninstall', '&#10005;', 'Uninstall') : '<span class="oc-sym">' + (r.kind === 'system' ? 'system' : 'built-in') + '</span>') + '</td></tr>';
      if (_open[r.id]) {
        var d = r.kind === 'plugin' ? deps.describe(r.key) : null, kv = details(r, d, !W);
        h += '<tr class="oc-d"><td></td><td colspan="4"><table class="oc-kv">' + kv.map(function (p) { return '<tr><td>' + esc(p[0]) + '</td><td>' + (Array.isArray(p[1]) ? '<ul class="oc-svc">' + p[1].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : esc(p[1])) + '</td></tr>'; }).join('') +
          (W && r.kind === 'plugin' && r.activation === 'lazy' ? '<tr><td>Set activation</td><td><button data-oc-pol="' + esc(r.key) + '">' + ((r.policy || r.activation) === 'lazy' ? 'Lazy (on demand) - click for Eager (at start)' : 'Eager (at start) - click for Lazy (on demand)') + '</button> <span class="oc-sym">takes effect on the next start</span></td></tr>' : '') +
          '</table></td></tr>';
      }
    });
    h += '</tbody></table></div>';
    el.innerHTML = h;
    var q = function (s) { return el.querySelector(s); };
    q('[data-oc-filter]').addEventListener('input', function (e) { _filter = e.target.value; var pos = e.target.selectionStart; render(el, deps); var n = q('[data-oc-filter]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} });
    q('[data-oc-clear]').onclick = function () { _filter = ''; render(el, deps); };
    q('[data-oc-reload]').onclick = function () { Promise.resolve(deps.reload && deps.reload()).then(function () { render(el, deps); }); };
    var it = q('[data-oc-installtoggle]'); if (it) it.onclick = function () { _showInstall = !_showInstall; render(el, deps); };
    Array.prototype.forEach.call(el.querySelectorAll('[data-oc-offer]'), function (b) { b.onclick = function () { var o = (GL.PluginOffers || []).filter(function (x) { return x.id === b.getAttribute('data-oc-offer'); })[0]; if (o) act(function () { return deps.install(o.url); }, null, 'Installed')(); }; });
    var di = q('[data-oc-doinstall]'); if (di) di.onclick = function () { var u = q('[data-oc-url]').value.trim(); if (!u) { if (deps.toast) deps.toast('Enter a bundle URL'); return; } act(function () { return deps.install(u); }, null, 'Installed')(); };
    [].forEach.call(el.querySelectorAll('[data-oc-name]'), function (a) { a.onclick = function () { var k = a.getAttribute('data-oc-name'); _open[k] = !_open[k]; render(el, deps); }; });
    [['start', 'start', null], ['stop', 'stop', null], ['refresh', 'refresh', null], ['uninstall', 'uninstall', 'Uninstalled']].forEach(function (x) {
      [].forEach.call(el.querySelectorAll('[data-oc-' + x[0] + ']'), function (b) { if (/\boff\b/.test(b.className)) return; b.onclick = act(deps[x[1]], b.getAttribute('data-oc-' + x[0]), x[2]); });
    });
    [].forEach.call(el.querySelectorAll('[data-oc-pol]'), function (b) { b.onclick = function () { var id = b.getAttribute('data-oc-pol'), cur = (deps.describe(id) || {}).policy || ((deps.describe(id) || {}).manifest || {}).activation; act(function () { return deps.setPolicy(id, cur === 'lazy' ? 'eager' : 'lazy'); }, id, 'Activation policy changed (effective on the next start)')(); }; });
  }

  return { model: model, details: details, summaryText: summaryText, statusOf: statusOf, render: render, STATUS: STATUS };
});
