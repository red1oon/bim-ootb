// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/pills.js — the READ-ONLY lens pill ACTIONS ("Setup check", "Window anatomy"). Registration is done by the shim in boot.js (core pill manifest and actions are NOT edited). Every action is
// wrapped: a fault shows a message, never throws into the host (prompts/ERP_DEPTH_FILM.md §EXTENSION-LAYER LAW).
(function () {
  'use strict';
  function H() { return window.OverlayHome || {}; }
  function pane(title) { var c = document.getElementById('idmp-content'); if (!c) return null; var p = document.createElement('div'); p.className = 'idmp-ovl-pane'; var h = document.createElement('h3'); h.textContent = title; p.appendChild(h); return p; }
  function show(p) {   // same effect as the core's own process panes: toolbar/tab strip hidden, content replaced (the core restores them when a window is opened)
    var tb = document.getElementById('idmp-toolbar'), ts = document.getElementById('idmp-tabstrip'), c = document.getElementById('idmp-content');
    if (tb) tb.style.display = 'none'; if (ts) ts.style.display = 'none'; if (c) { c.innerHTML = ''; c.appendChild(p); }
  }
  function sub(p, t) { var d = document.createElement('div'); d.className = 'sub'; d.textContent = t; p.appendChild(d); }
  function rows(p, res, attr) {
    res.rows.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'fld'; row.setAttribute(attr, r.id); row.setAttribute('data-status', r.status);
      var l = document.createElement('label'); l.textContent = (r.status === 'OK' ? '✔ ' : r.status === 'MISSING' ? '✖ ' : '? ') + r.label; row.appendChild(l);
      var s = document.createElement('div'); s.className = 'sub'; s.textContent = r.detail + ' — ' + r.cite; row.appendChild(s); p.appendChild(row);
    });
  }
  function guard(name, fn) { return function () { try { return fn(); } catch (e) { console.log('§OVERLAY ' + name + ' failed (core unaffected): ' + String(e && e.message).slice(0, 160)); try { var p = pane(name); if (p) { sub(p, 'This overlay feature is unavailable: ' + String(e && e.message).slice(0, 100)); show(p); } } catch (e2) {} } }; }
  var setupLens = guard('Setup check', function () {
    if (H().css) H().css(); var p = pane('Setup check'), S = H().session && H().session();
    if (!p || !S || !window.SetupLens) { if (p) { sub(p, 'Log in to a client first.'); show(p); } return; }
    var res = window.SetupLens.compute(H().q, S.client, S.today);
    sub(p, (window.APP && window.APP.clientName ? window.APP.clientName : 'Client ' + S.client) + ' · ' + res.verdict + ' · ' + res.ok + ' ready, ' + res.missing + ' missing, ' + res.inconclusive + ' not judged · read-only');
    rows(p, res, 'data-setuplens-row'); show(p);
    console.log('§SETUP-LENS client=' + S.client + ' verdict=' + res.verdict + ' ok=' + res.ok + ' missing=' + res.missing + ' inconclusive=' + res.inconclusive + ' lines=' + res.rows.map(function (r) { return r.id + '=' + r.status; }).join(','));
  });
  function activeWindowId() {          // the active window tab's label = the name the core opened it with (a menu name) -> its single AD_Window via AD_Menu; ambiguity is reported, never guessed
    var lbl = document.querySelector('#idmp-wintabs .idmp-wintab.active .lbl'); if (!lbl) return { none: true };
    var name = lbl.textContent, w = H().q("SELECT DISTINCT AD_Window_ID AS w FROM AD_Menu WHERE Name=? AND Action='W' AND IsActive='Y' AND AD_Window_ID IS NOT NULL", [name]);
    if (!w.length) w = H().q("SELECT AD_Window_ID AS w FROM AD_Window WHERE Name=? AND IsActive='Y'", [name]);
    return w.length === 1 ? { id: Number(w[0].w), name: name } : { name: name, ambiguous: w.length };
  }
  var windowLens = guard('Window anatomy', function () {
    if (H().css) H().css(); var p = pane('Window anatomy'), S = H().session && H().session(), aw = activeWindowId();
    if (!p || !S || !window.WindowLens) { if (p) { sub(p, 'Log in to a client first.'); show(p); } return; }
    if (aw.none) { sub(p, 'Open a window first.'); show(p); return; }
    if (aw.id == null) { sub(p, 'Cannot tell which dictionary window "' + aw.name + '" is (' + aw.ambiguous + ' candidates) - not guessing.'); show(p); return; }
    var res = window.WindowLens.compute(H().q, aw.id, S.role, S.client);
    sub(p, (res.name || ('Window ' + res.windowId)) + ' · ' + res.tabs + ' tabs · ' + res.fields + ' fields (' + res.displayed + ' displayed) · ' + res.verdict + ' · read-only');
    rows(p, res, 'data-windowlens-row'); show(p);
    console.log('§WINDOW-LENS window=' + res.windowId + ' tabs=' + res.tabs + ' fields=' + res.fields + ' displayed=' + res.displayed + ' verdict=' + res.verdict + ' lines=' + res.rows.map(function (r) { return r.id + '=' + r.status; }).join(','));
  });
  window.OverlayPills = { setupLens: setupLens, windowLens: windowLens };   // bound late by the pill shim in boot.js
})();
