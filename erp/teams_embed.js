/**
 * BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
 *
 * teams_embed.js — the GATED embed of the distinct Teams pill into the live iDempiere chrome
 * (teams/ROADMAP.md §S9 follow-up, Phase E). The launcher (teams/overlay/teams_pill.js) is proven
 * standalone (W-TEAM-WIRE) + on the S9 demo page; THIS is the one line into production chrome.
 *
 * THE HARD RULE (TEAM_OPTICS §9 · ROADMAP §P①): **Team OFF (default) = pixel-identical UI.** When the
 * flag is OFF, init() returns immediately — NO pill, NO pane, NO extra module fetch (the heavy teams/
 * modules are lazy-loaded ONLY when ON). So the production page is byte-for-byte unchanged unless a user
 * opts in (localStorage.teamsEmbed='1' | ?teams=1 | window.TEAMS_EMBED===true). ON → the pill mounts into
 * the existing pill bar; click → the overlay pane mounts; OFF again → all overlay DOM is removed (reversible).
 *
 * ADDITIVE + self-contained: this file imports nothing from the engine, edits no verb, and never touches a
 * record. It folds a READ-ONLY op-log the host hands it (window.TeamsEmbedOps()) — absent → an honest empty
 * pane (NON-INVENT, no fake activity). Witness: erp/tests/wire_teams_embed.js (OFF pixel-identical · ON
 * mounts into the host header · pane folds the host ops · reversible). Browser-only; pure DOM API.
 */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;                 // node / no DOM: no-op
  function log(m) { try { console.log('§TEAMS-EMBED ' + m); } catch (e) {} }

  // resolve teams/ relative to THIS script (erp/teams_embed.js → ../teams/) so lazy-loaded deps are found.
  var _self = (document.currentScript && document.currentScript.src) || '';
  var _teamsBase = global.TEAMS_EMBED_BASE || (_self ? _self.replace(/erp\/teams_embed\.js.*$/, 'teams/') : '../teams/');

  // the enablement flag — OFF unless explicitly opted in. Read once at init (deterministic per page load).
  function isEnabled() {
    try {
      if (global.TEAMS_EMBED === true) return true;
      if (/[?&]teams=1\b/.test(global.location ? global.location.search : '')) return true;
      if (global.localStorage && localStorage.teamsEmbed === '1') return true;
    } catch (e) {}
    return false;
  }

  // lazy-load a dep <script> ONCE (only reached when the flag is ON). Resolves when present on window.
  function _need(globalName, file) {
    return new Promise(function (resolve, reject) {
      if (global[globalName]) return resolve(global[globalName]);
      var s = document.createElement('script');
      s.src = _teamsBase + file;
      s.async = false;                                          // preserve order (dot_layer before pill use)
      s.onload = function () { resolve(global[globalName]); };
      s.onerror = function () { reject(new Error('teams_embed: failed to load ' + file)); };
      document.head.appendChild(s);
    });
  }
  function _ensureDeps() {
    // already present (witness/demo loads them explicitly) → use them; else lazy-inject the proven trio.
    return _need('TeamsDotLayer', 'overlay/dot_layer.js')
      .then(function () { return _need('TeamsErpOptics', 'erp/erp_optics.js'); })
      .then(function () { return _need('TeamsPill', 'overlay/teams_pill.js'); });
  }

  // the read-only op-log the host hands us (a SIGNED kernel_ops fold). Absent → [] (honest empty, non-invent).
  function _hostOps(opts) {
    try {
      if (opts && typeof opts.readOps === 'function') return opts.readOps() || [];
      if (typeof global.TeamsEmbedOps === 'function') return global.TeamsEmbedOps() || [];
    } catch (e) { log('readOps err ' + e.message); }
    return [];
  }

  var _handle = null;

  // §ICON-REGISTRY (RESUME_OVERLAY_PILL_ICONS.md) — mountTeamsPill already supports a host-registry icon
  // (opts.host.icon(name,opts), teams_pill.js §R1) but production idempiere.html never passed one, so the
  // pill always drew its own hardcoded inline SVG instead of the SAME Lucide glyph set the rest of the
  // #idmp-pill bar uses (window.ICONS, erp/icons.js — verbatim-copied from panels.js ICONS, the source of
  // truth). Build a minimal host adapter ONLY when the real registry is present (production chrome loads
  // icons.js before this file); absent (e.g. a minimal test fixture) → undefined, mountTeamsPill falls back
  // to its own inline glyph exactly as before — no change to anything that doesn't carry the registry.
  function _registryHost() {
    if (typeof global.ICONS !== 'object' || !global.ICONS) return null;
    return {
      icon: function (name, iconOpts) {
        iconOpts = iconOpts || {};
        var ic = global.ICONS[name];
        var btn = document.createElement('button');
        btn.type = 'button';
        if (iconOpts.id) btn.id = iconOpts.id;
        if (iconOpts.title) btn.title = iconOpts.title;
        var sz = iconOpts.size || 18;
        btn.innerHTML = '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ic ? ic.svg : '') + '</svg>';
        return btn;
      }
    };
  }

  // init(opts) — mount the Teams pill IFF enabled. opts = { header?, paneHost?, rowSelector?, docOf?, readOps? }.
  //   header     — where the pill attaches (default: the live #idmp-pill bar, else document.body).
  //   rowSelector/docOf — best-effort row-dot painting onto host records (default: [data-doc] → data-doc attr).
  //   Returns a Promise<{ enabled, mounted, handle? }>. Idempotent (a second call is a no-op while mounted).
  function init(opts) {
    opts = opts || {};
    if (!isEnabled()) { log('OFF (default) — no pill, no pane, pixel-identical'); return Promise.resolve({ enabled: false, mounted: false }); }
    if (_handle || document.getElementById('teams-pill')) return Promise.resolve({ enabled: true, mounted: true, handle: _handle });

    return _ensureDeps().then(function () {
      var TP = global.TeamsPill, D = global.TeamsDotLayer, O = global.TeamsErpOptics;
      var header = opts.header || document.getElementById('idmp-pill') || document.body;
      var rowSel = opts.rowSelector || '[data-doc]';
      var docOf = opts.docOf || function (row) { return row.getAttribute('data-doc'); };

      function onMount(pane) {
        var ops = _hostOps(opts);
        // 1) best-effort row dots (additive; removed on close). No matching rows → nothing painted (safe).
        if (ops.length && D && D.dotLayerModel) {
          var model = D.dotLayerModel(ops, { on: true, maxVisible: 2 });
          Array.prototype.forEach.call(document.querySelectorAll(rowSel), function (row) {
            var anchor = docOf(row);
            var cl = model.clusters.filter(function (c) { return c.anchor === anchor && c.kind === 'person'; })[0];
            if (!cl) return;
            var wrap = document.createElement('span'); wrap.className = 'teams-row-dots'; wrap.style.marginLeft = '6px';
            cl.visible.forEach(function (d) {
              var dot = document.createElement('span'); dot.className = 'teams-dot';
              dot.style.cssText = 'display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:9px;font-weight:700;color:#fff;background:' + d.color + ';margin-right:2px;';
              dot.textContent = d.initials; dot.title = d.blurb; wrap.appendChild(dot);
            });
            if (cl.badge) { var b = document.createElement('span'); b.textContent = cl.badge; b.style.cssText = 'font-size:11px;font-weight:700;color:#7b869c;'; wrap.appendChild(b); }
            row.appendChild(wrap);
          });
        }
        // 2) the pane = involvement summary (who's on each doc) — or an honest empty state.
        var h = document.createElement('h3'); h.textContent = 'Teams · who is on each doc';
        h.style.cssText = 'font:600 12px system-ui;text-transform:uppercase;letter-spacing:.04em;color:#7b869c;margin:0 0 10px;';
        pane.appendChild(h);
        if (!ops.length) { var e0 = document.createElement('div'); e0.style.cssText = 'color:#7b869c;font:13px system-ui;'; e0.textContent = 'No team activity on this page yet.'; pane.appendChild(e0); return; }
        var inv = O.involvement(ops, {});
        inv.hot.forEach(function (hot, i) {
          var d = inv.perDoc[hot.doc];
          var e = document.createElement('div'); e.style.cssText = 'display:flex;gap:8px;padding:7px 0;border-bottom:1px dashed #e6e9f2;';
          var dd = document.createElement('span'); dd.textContent = hot.doc; dd.style.cssText = 'font-weight:700;width:80px;' + (i === 0 ? 'color:#3a6df0;' : '');
          var nn = document.createElement('span'); nn.style.cssText = 'font:12px system-ui;color:#7b869c;'; nn.textContent = hot.count + ' people · ' + d.participants.join(', ');
          e.appendChild(dd); e.appendChild(nn); pane.appendChild(e);
        });
      }
      function onUnmount() {
        Array.prototype.forEach.call(document.querySelectorAll('.teams-row-dots'), function (n) { n.remove(); });  // → OFF baseline
      }

      // a styled pane (fixed right drawer), so the production overlay reads like the S9 demo.
      _injectPaneStyle();
      _handle = TP.mountTeamsPill(header, { label: 'Teams overlay', paneHost: document.body, host: _registryHost(), onMount: onMount, onUnmount: onUnmount });
      log('ON — Teams pill mounted into ' + (header.id ? '#' + header.id : 'body') + ' icon=' + (_registryHost() ? 'registry' : 'inline-fallback'));
      global.__teamsEmbedReady = true;
      return { enabled: true, mounted: !!_handle, handle: _handle };
    }).catch(function (e) { log('init failed ' + e.message); return { enabled: true, mounted: false, error: e.message }; });
  }

  function _injectPaneStyle() {
    if (document.getElementById('teams-embed-style')) return;
    var s = document.createElement('style'); s.id = 'teams-embed-style';
    s.textContent = '.teams-pill{width:34px;height:30px;border:1px solid #e6e9f2;border-radius:8px;background:#fff;color:#7b869c;cursor:pointer;display:grid;place-items:center;padding:0}' +
      '.teams-pill.on{color:#fff;background:#3a6df0;border-color:#3a6df0}' +
      '.teams-pane{position:fixed;top:0;right:0;bottom:0;width:320px;background:#fff;border-left:1px solid #e6e9f2;box-shadow:-8px 0 24px rgba(20,30,60,.08);padding:14px;overflow:auto;z-index:9000}';
    document.head.appendChild(s);
  }

  // teardown (reversible) — close the pane + remove the pill → exact OFF baseline.
  function destroy() { if (_handle) { _handle.destroy(); _handle = null; } }

  global.TeamsEmbed = { init: init, isEnabled: isEnabled, destroy: destroy };
})(typeof window !== 'undefined' ? window : this);
