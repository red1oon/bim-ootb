/**
 * BIM OOTB — Modeller. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
 *
 * teams_embed.js — the GATED Teams overlay over the LIVE Modeller scene (teams/ROADMAP.md §S11 follow-up).
 * The ERP analogue is erp/teams_embed.js; this is the BIM-side mount. THE HARD RULE (TEAM_OPTICS §9 ·
 * ROADMAP §P①): **Team OFF (default) = pixel-identical UI** — until a user opts in (localStorage.teamsEmbed='1'
 * | ?teams=1 | window.TEAMS_EMBED===true) init() returns immediately: NO pill, NO pane, NO module fetch, so the
 * modeller is byte-for-byte unchanged. ON → a distinct floating Teams pill mounts; click → contextual dots paint
 * on the Outliner rows (#bonsai-outliner [data-fid]) + a side pane shows presence (cross-product BIM↔ERP) and
 * who-is-on-each-element; OFF again → all overlay DOM removed (reversible).
 *
 * ADDITIVE + ISOLATED (ROADMAP §R5): imports nothing from the modeller engine, edits no op/verb, never writes.
 * It FOLDS a read-only op-log the host hands it (window.TeamsEmbedOps()) and emits a presence heartbeat on the
 * shared bus (connectors seam) — no modeller file is coupled. Folds are deterministic + NON-INVENT (the live
 * heartbeat ts is the only live value; awareness, not a reproducible fold). Lazy-loads the proven teams/ modules.
 * Witness: modeller/tests/wire_teams_embed_modeller.js (OFF pixel-identical · ON mounts · dots · pane · reversible).
 */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;
  function log(m) { try { console.log('§TEAMS-EMBED-BIM ' + m); } catch (e) {} }

  var _self = (document.currentScript && document.currentScript.src) || '';
  var _teamsBase = global.TEAMS_EMBED_BASE || (_self ? _self.replace(/modeller\/teams_embed\.js.*$/, 'teams/') : '../teams/');

  function isEnabled() {
    try {
      if (global.TEAMS_EMBED === true) return true;
      if (/[?&]teams=1\b/.test(global.location ? global.location.search : '')) return true;
      if (global.localStorage && localStorage.teamsEmbed === '1') return true;
    } catch (e) {}
    return false;
  }

  function _need(name, file) {
    return new Promise(function (resolve, reject) {
      if (global[name]) return resolve(global[name]);
      var s = document.createElement('script'); s.src = _teamsBase + file; s.async = false;
      s.onload = function () { resolve(global[name]); };
      s.onerror = function () { reject(new Error('teams_embed(bim): failed ' + file)); };
      document.head.appendChild(s);
    });
  }
  function _ensureDeps() {
    return _need('TeamsConnectors', 'connectors.js')
      .then(function () { return _need('TeamsDotLayer', 'overlay/dot_layer.js'); })
      .then(function () { return _need('TeamsPresence', 'overlay/presence.js'); })
      .then(function () { return _need('TeamsPill', 'overlay/teams_pill.js'); });
  }

  function _hostOps(opts) {
    try {
      if (opts && typeof opts.readOps === 'function') return opts.readOps() || [];
      if (typeof global.TeamsEmbedOps === 'function') return global.TeamsEmbedOps() || [];
    } catch (e) { log('readOps err ' + e.message); }
    return [];
  }
  // the live heartbeat timestamp — the ONLY live (non-fold) value; awareness, not a reproducible fold.
  function _nowTs(opts) {
    if (opts && opts.now != null) return opts.now;
    try { return Math.round(performance.timeOrigin + performance.now()); } catch (e) {}
    return 0;
  }

  var _handle = null, _conn = null, _peerBeats = [], _pane = null, _renderPresence = null;

  function init(opts) {
    opts = opts || {};
    if (!isEnabled()) { log('OFF (default) — pixel-identical'); return Promise.resolve({ enabled: false, mounted: false }); }
    if (_handle || document.getElementById('teams-pill')) return Promise.resolve({ enabled: true, mounted: true, handle: _handle });

    return _ensureDeps().then(function () {
      var TP = global.TeamsPill, D = global.TeamsDotLayer, PR = global.TeamsPresence, C = global.TeamsConnectors;
      // bind the awareness bus to the suite's shared channel (default 'bim_teams'); presence is distinguished
      // by message kind, so it never collides with the host's other bus traffic. Cross-product meets here.
      _conn = (C && C.goLive) ? C.goLive(global, { channel: opts.channel || 'bim_teams' }) : C;
      // §E2E-CROSS fix (TEAMS_OVERLAY_LIVE_E2E_TEST.md): the send-side heartbeat existed, but nothing ever
      // SUBSCRIBED to the bus, so a peer's beat was silently dropped (window.__teamsPeerBeats was read here
      // but never written anywhere in the codebase — a real dual-session E2E reproduced it: each session only
      // ever saw its own row). Subscribe ONCE at init and re-render the open pane live on each peer heartbeat.
      try {
        if (_conn && _conn.bus && _conn.bus.on) {
          _conn.bus.on(opts.channel || 'bim_teams', function (msg) {
            if (!msg || msg.kind !== 'presence') return;
            _peerBeats.push(msg);
            if (_pane && _renderPresence) _renderPresence(_pane);
          });
        }
      } catch (e) { log('bus.on err ' + e.message); }

      // a self-created floating mount (top-right) — nothing exists until ON, so OFF stays pixel-identical.
      var mount = document.createElement('div'); mount.id = 'teams-embed-mount';
      mount.style.cssText = 'position:fixed;top:8px;right:8px;z-index:40;';
      document.body.appendChild(mount);
      _injectStyle();

      var rowSel = opts.rowSelector || '#bonsai-outliner [data-fid]';
      var fidOf = opts.docOf || function (row) { return row.getAttribute('data-fid'); };
      var me = opts.user || global.TeamsEmbedUser || 'me';
      var loc = opts.location || { discipline: 'ARC' };

      function renderPresence(pane) {
        var old = pane.querySelector('.teams-presence-list'); if (old) old.parentNode.removeChild(old);
        var wrap = document.createElement('div'); wrap.className = 'teams-presence-list';
        var beats = [PR.makePresence({ user: me, product: 'bim', location: loc, ts: _nowTs(opts) })].concat(_peerBeats);
        var folded = PR.foldPresence(beats, { now: _nowTs(opts), activeMs: opts.activeMs != null ? opts.activeMs : 60000 });
        PR.presenceDots(folded).forEach(function (p) {
          var r = document.createElement('div'); r.style.cssText = 'display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px dashed #2c303a';
          r.innerHTML = '<span style="display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:9px;font-weight:700;color:#fff;background:' + p.color + (p.faded ? ';opacity:.4' : '') + '">' + p.initials + '</span>' +
            '<span style="font-weight:600">' + p.user + '</span><span style="font-size:11px;font-weight:700;color:#7f8aa0">' + p.product.toUpperCase() + '</span>' +
            '<span style="font-size:12px;color:#7f8aa0">' + p.locText + '</span>';
          wrap.appendChild(r);
        });
        pane.appendChild(wrap);
        log('presence re-rendered (' + folded.length + ' peer' + (folded.length === 1 ? '' : 's') + ')');
      }
      _renderPresence = renderPresence;

      function onMount(pane) {
        var ops = _hostOps(opts);
        // 1) contextual dots on the Outliner rows — who's on each element (colour=signer). Best-effort:
        //    no matching rows → nothing painted (safe).
        if (ops.length && D && D.dotLayerModel) {
          var model = D.dotLayerModel(ops, { on: true, maxVisible: 2 });
          Array.prototype.forEach.call(document.querySelectorAll(rowSel), function (row) {
            var cl = model.clusters.filter(function (c) { return c.anchor === fidOf(row) && c.kind === 'person'; })[0];
            if (!cl) return;
            var wrap = document.createElement('span'); wrap.className = 'teams-row-dots'; wrap.style.cssText = 'margin-left:6px;display:inline-flex;gap:2px;vertical-align:middle';
            cl.visible.forEach(function (d) {
              var dot = document.createElement('span'); dot.className = 'teams-dot';
              dot.style.cssText = 'display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;font-size:8px;font-weight:700;color:#fff;background:' + d.color;
              dot.textContent = d.initials; dot.title = d.blurb; wrap.appendChild(dot);
            });
            if (cl.badge) { var b = document.createElement('span'); b.textContent = cl.badge; b.style.cssText = 'font-size:10px;font-weight:700;color:#7f8aa0'; wrap.appendChild(b); }
            row.appendChild(wrap);
          });
        }
        // 2) presence — emit my BIM heartbeat on the shared bus (peers pick it up via THEIR bus.on
        //    subscription above); render self + any peer beats already collected via _peerBeats.
        var mine = PR.makePresence({ user: me, product: 'bim', location: loc, ts: _nowTs(opts) });
        try { if (_conn && _conn.bus) { _conn.bus.send(opts.channel || 'bim_teams', mine); } } catch (e) {}

        var h = document.createElement('h3'); h.textContent = 'Teams · presence';
        h.style.cssText = 'font:600 11px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#7f8aa0;margin:0 0 8px';
        pane.appendChild(h);
        _pane = pane;
        renderPresence(pane);
        if (!ops.length) { var e0 = document.createElement('div'); e0.style.cssText = 'color:#7f8aa0;font:12px system-ui;margin-top:8px'; e0.textContent = 'No element activity on this scene yet.'; pane.appendChild(e0); }
        log('ON — presence emitted (' + me + '/bim), ' + (ops.length ? 'dots on rows' : 'no host ops'));
      }
      function onUnmount() { _pane = null; Array.prototype.forEach.call(document.querySelectorAll('.teams-row-dots'), function (n) { n.remove(); }); }

      _handle = TP.mountTeamsPill(mount, { label: 'Teams overlay', paneHost: document.body, onMount: onMount, onUnmount: onUnmount });
      global.__teamsEmbedReady = true;
      return { enabled: true, mounted: !!_handle, handle: _handle };
    }).catch(function (e) { log('init failed ' + e.message); return { enabled: true, mounted: false, error: e.message }; });
  }

  function _injectStyle() {
    if (document.getElementById('teams-embed-style')) return;
    var s = document.createElement('style'); s.id = 'teams-embed-style';
    s.textContent = '.teams-pill{width:34px;height:30px;border:1px solid #2c303a;border-radius:8px;background:#1b1d23;color:#7f8aa0;cursor:pointer;display:grid;place-items:center;padding:0}' +
      '.teams-pill.on{color:#fff;background:#3a6df0;border-color:#3a6df0}' +
      '.teams-pane{position:fixed;top:0;right:0;bottom:0;width:300px;background:#1b1d23;border-left:1px solid #2c303a;color:#c7cdd8;box-shadow:-8px 0 24px rgba(0,0,0,.35);padding:14px;overflow:auto;z-index:39;font:13px system-ui}';
    document.head.appendChild(s);
  }

  function destroy() {
    if (_handle) { _handle.destroy(); _handle = null; }
    var m = document.getElementById('teams-embed-mount'); if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  global.TeamsEmbedBim = { init: init, isEnabled: isEnabled, destroy: destroy };
})(typeof window !== 'undefined' ? window : this);
