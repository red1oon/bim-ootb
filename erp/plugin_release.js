// BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// plugin_release.js — SYSTEM_ADMIN_LANE §6. iDempiere's Plugin Management (OSGi bundles), reframed for a
//   serverless fold-engine — PLUS a Release/Update surface iDempiere has NO in-app equivalent of:
//     · RELEASE — the running release (sw CACHE_VERSION). Check for updates; a new deploy WAITS (gated, not
//       auto-latest) until Apply (→ SKIP_WAITING). "Further releases come through updates," not silent jumps.
//     · PLUGINS — foreign code as plugins over OUR registry (window.PluginRegistry, W-PLUGIN): list / enable /
//       disable / remove, each signed + reversible (Holy-Grail law: foreign imperative code is a plugin).
//     · MODULES — our OWN code, folded as modules: core (always-on substrate) vs optional (features), each at
//       the running release. (Live optional on/off via the pill-gate seam = the immediate follow-up.)
//   NON-INVENT: real sw version, real registry rows; honest where a tier isn't loaded yet. W-PLUGIN-RELEASE.
(function (global) {
  'use strict';

  // ask any SW worker (controller or the waiting one) for its CACHE_VERSION
  function workerVersion(worker) {
    return new Promise(function (res) {
      if (!worker) return res(null);
      try { var ch = new MessageChannel(); ch.port1.onmessage = function (e) { res(e.data && e.data.version || null); };
        worker.postMessage({ type: 'GET_PRECACHE' }, [ch.port2]); setTimeout(function () { res(null); }, 800); }
      catch (e) { res(null); }
    });
  }
  function reg() { return global.__swReg || null; }
  function pluginReg() { try { return (global.PluginEngine && global.PluginEngine._reg && global.PluginEngine._reg()) || null; } catch (e) { return null; } }

  // our own code, folded as modules — core substrate vs optional features (NON-INVENT: these ship in PRECACHE)
  var MODULES = [
    { id: 'ad_parser', core: true, label: 'AD dictionary fold (windows/tabs/fields)' },
    { id: 'idmp_session', core: true, label: 'Session · context (Ctx/Env) · client+org scope' },
    { id: 'ad_data', core: true, label: 'Record read / write fold' },
    { id: 'crud_overlay', core: true, label: 'CRUD + DocAction (signed commit)' },
    { id: 'doc_poster', core: true, label: 'GL posting (== fact_acct)' },
    { id: 'genesis', core: true, label: 'Initial Tenant Setup (op-logged birth)' },
    { id: 'system_tenant', core: true, label: 'System(0) login surface' },
    { id: 'pos_lens', core: false, label: 'POS terminal lens' },
    { id: 'kanban_lens', core: false, label: 'Kanban board' },
    { id: 'ninja_create', core: false, label: 'Ninja window builder' },
    { id: 'plugin_overlay', core: false, label: 'Plugin Engine (foreign bundles)' },
    { id: 'blue_future', core: false, label: 'Blue Future (speculative branch)' },
    { id: 'system_monitor', core: false, label: 'System Monitor' }
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  var CSS =
    '#pr-root{position:fixed;inset:0;z-index:1400;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}' +
    '#pr-root .pr-backdrop{position:absolute;inset:0;background:rgba(8,12,20,.55)}' +
    '#pr-root .pr-modal{position:relative;z-index:1;background:#fff;color:#1b2430;width:600px;max-width:94vw;max-height:88vh;overflow:auto;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.45)}' +
    '#pr-root .pr-head{display:flex;align-items:center;gap:9px;padding:13px 16px;background:#0a4ea3;color:#fff;border-radius:10px 10px 0 0;position:sticky;top:0}' +
    '#pr-root .pr-head b{font-size:15px}#pr-root .pr-sub{font-size:11px;opacity:.82;flex:1}' +
    '#pr-root .pr-x{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;padding:0 4px}' +
    '#pr-root .pr-body{padding:8px 16px 16px}' +
    '#pr-root .pr-grp{color:#0a4ea3;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #0a4ea3;padding:14px 0 5px;margin-bottom:6px}' +
    '#pr-root .pr-rel{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;padding:4px 0}' +
    '#pr-root .pr-tag{font-weight:700}' +
    '#pr-root .pr-up{background:#fff7e6;border:1px solid #ffd591;color:#ad6800;border-radius:5px;padding:2px 8px;font-size:11.5px;font-weight:700}' +
    '#pr-root .pr-ok{color:#237804;font-weight:600;font-size:12px}' +
    '#pr-root button.pr-btn{background:#0a4ea3;color:#fff;border:0;border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer}' +
    '#pr-root button.pr-btn.ghost{background:#eef1f5;color:#1b2430}' +
    '#pr-root .pr-row{display:flex;align-items:center;gap:9px;font-size:12.5px;padding:6px 0;border-bottom:1px solid #eef1f5}' +
    '#pr-root .pr-row .nm{font-weight:600}#pr-root .pr-row .meta{color:#8a95a3;font-size:11px}' +
    '#pr-root .pr-row .sp{flex:1}' +
    '#pr-root .pr-badge{display:inline-block;border-radius:4px;font-size:10px;font-weight:700;padding:1px 6px}' +
    '#pr-root .pr-badge.core{background:#f0f5ff;color:#1d39c4;border:1px solid #adc6ff}' +
    '#pr-root .pr-badge.opt{background:#f6ffed;color:#389e0d;border:1px solid #b7eb8f}' +
    '#pr-root .pr-dim{color:#8a95a3;font-size:11.5px;padding:6px 0}';
  function ensureCss() { if (document.getElementById('pr-css')) return; var s = document.createElement('style'); s.id = 'pr-css'; s.textContent = CSS; document.head.appendChild(s); }

  function close() { var r = document.getElementById('pr-root'); if (r) r.remove(); }

  function renderRelease(host, cur, waitingVer) {
    var el = host.querySelector('#pr-release'); if (!el) return;
    if (waitingVer) {
      el.innerHTML = '<div class="pr-rel"><span>Running: <span class="pr-tag">' + esc(cur || '?') + '</span></span>'
        + '<span class="pr-up">Update available &rarr; ' + esc(waitingVer) + '</span>'
        + '<button class="pr-btn" data-pr-apply>Apply update</button></div>'
        + '<div class="pr-dim">A new release is installed but held. Applying activates it and reloads — this is how further releases land (no silent auto-update).</div>';
      el.querySelector('[data-pr-apply]').addEventListener('click', function () {
        var r = reg(); if (r && r.waiting) { console.log('§PLUGIN-RELEASE apply waiting=' + waitingVer); r.waiting.postMessage({ type: 'SKIP_WAITING' }); }
      });
    } else {
      el.innerHTML = '<div class="pr-rel"><span>Running: <span class="pr-tag">' + esc(cur || '(uncontrolled)') + '</span></span>'
        + '<span class="pr-ok">&#10003; up to date</span><button class="pr-btn ghost" data-pr-check>Check for updates</button></div>'
        + '<div class="pr-dim">This app is pinned to its release until you update it — a release/update surface iDempiere has no in-app equivalent of.</div>';
      el.querySelector('[data-pr-check]').addEventListener('click', function () {
        var r = reg(); if (!r) return; console.log('§PLUGIN-RELEASE check');
        r.update().then(function () { return refreshRelease(host); }).catch(function () {});
      });
    }
  }
  function refreshRelease(host) {
    var r = reg();
    return Promise.all([workerVersion(navigator.serviceWorker && navigator.serviceWorker.controller), workerVersion(r && r.waiting)])
      .then(function (v) { console.log('§PLUGIN-RELEASE state running=' + v[0] + ' waiting=' + (v[1] || 'none')); renderRelease(host, v[0], v[1]); });
  }

  function renderPlugins(host) {
    var el = host.querySelector('#pr-plugins'); if (!el) return;
    var pr = pluginReg();
    var rows = pr ? pr.list() : null;
    if (!pr) { el.innerHTML = '<div class="pr-dim">Plugin Engine not active yet — open it from the &middot;&middot;&middot; rail to load a <b>.foldbundle</b>; loaded plugins appear here to enable / disable / remove.</div>'; return; }
    if (!rows.length) { el.innerHTML = '<div class="pr-dim">No plugins installed. A plugin is foreign code as a signed, reversible bundle — never auto-imported.</div>'; return; }
    el.innerHTML = '';
    rows.forEach(function (p) {
      var on = /ACTIVE|STARTED|RESOLVED|ENABLED/i.test(String(p.state));
      var row = document.createElement('div'); row.className = 'pr-row';
      row.innerHTML = '<span class="nm">' + esc(p.id) + '</span><span class="meta">v' + esc(p.version || '?') + ' &middot; ' + esc(p.state) + '</span>'
        + '<span class="sp"></span><button class="pr-btn ghost" data-pr-toggle>' + (on ? 'Disable' : 'Enable') + '</button>'
        + '<button class="pr-btn ghost" data-pr-remove>Remove</button>';
      row.querySelector('[data-pr-toggle]').addEventListener('click', function () {
        try { if (on) pr.stopBundle(p.id); else pr.startBundle(p.id); console.log('§PLUGIN-RELEASE toggle id=' + p.id + ' ->' + (on ? 'stop' : 'start')); } catch (e) {}
        renderPlugins(host);
      });
      row.querySelector('[data-pr-remove]').addEventListener('click', function () {
        try { pr.uninstallBundle(p.id); console.log('§PLUGIN-RELEASE remove id=' + p.id); } catch (e) {}
        renderPlugins(host);
      });
      el.appendChild(row);
    });
  }

  function renderModules(host, cur) {
    var el = host.querySelector('#pr-modules'); if (!el) return;
    el.innerHTML = MODULES.map(function (m) {
      return '<div class="pr-row"><span class="nm">' + esc(m.id) + '</span>'
        + '<span class="pr-badge ' + (m.core ? 'core">core &middot; always-on' : 'opt">optional') + '</span>'
        + '<span class="meta">' + esc(m.label) + '</span><span class="sp"></span>'
        + '<span class="meta">' + esc(cur || '') + '</span></div>';
    }).join('') + '<div class="pr-dim">Our own code, folded as modules. Core modules are the substrate the fold runs through; optional features can be turned off (live on/off via the pill gate — next).</div>';
  }

  function open() {
    ensureCss(); close();
    var root = document.createElement('div'); root.id = 'pr-root';
    root.innerHTML =
      '<div class="pr-modal"><div class="pr-head"><b>Plugins &amp; Releases</b>'
      + '<span class="pr-sub">iDempiere Plugin Management + the release/update surface it lacks</span>'
      + '<button class="pr-x" data-pr-close title="Close">&times;</button></div>'
      + '<div class="pr-body">'
      + '<div class="pr-grp">Release</div><div id="pr-release"><div class="pr-dim">checking…</div></div>'
      + '<div class="pr-grp">Plugins (foreign code)</div><div id="pr-plugins"></div>'
      + '<div class="pr-grp">Modules (our code)</div><div id="pr-modules"></div>'
      + '</div></div><div class="pr-backdrop" data-pr-close></div>';
    document.body.appendChild(root);
    root.querySelectorAll('[data-pr-close]').forEach(function (e) { e.addEventListener('click', close); });
    console.log('§PLUGIN-RELEASE open');
    workerVersion(navigator.serviceWorker && navigator.serviceWorker.controller).then(function (cur) {
      renderModules(root, cur); renderPlugins(root); refreshRelease(root);
    });
  }

  global.PluginRelease = { open: open, close: close };
})(typeof window !== 'undefined' ? window : this);
