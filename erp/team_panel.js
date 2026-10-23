// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_panel.js — the Team pill's panel (TEAMWORK_FRAMEWORK §13.8 T1/T2). Loaded on every idempiere.html page, inert until opened.
 * Reads/writes the same IndexedDB 'comm_phone' key 'cfg' that the pairing page and team_sync.js use:
 *   cfg.owner, cfg.repo, cfg.token  — the pipe (system default from TeamDefaults, or the user's own)
 *   cfg.trial                       — true only while the system default repo+key are in use (one-cycle rule, team_trial.js)
 * Turning team mode on = localStorage.teamMode='1' + reload (the loader in idempiere.html then adds the comm scripts). */
(function (global) {
  'use strict';
  var D = function () { return global.TeamDefaults || { owner: '', repo: '', token: '' }; };
  function idb() { return new Promise(function (res, rej) { var r = indexedDB.open('comm_phone', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  async function kvGet(k) { var d = await idb(); return new Promise(function (res) { var q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); }
  async function kvPut(k, v) { var d = await idb(); return new Promise(function (res, rej) { var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }
  function modeOn() { try { return localStorage.getItem('teamMode') === '1' || /[?&]team=1(&|$)/.test(location.search); } catch (e) { return /[?&]team=1(&|$)/.test(location.search); } }
  function ico() { var s = global.ICONS && global.ICONS.users; return s ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px">' + s.svg + '</svg> ' : ''; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // pure: what the panel says, from (cfg, device, defaults, mode) — also the witness's seam
  function describe(cfg, dev, d, on) {
    cfg = cfg || {}; var own = !!(cfg.token && !cfg.trial), sys = !own;
    var owner = cfg.owner || d.owner, repo = cfg.repo || d.repo, haveKey = own ? true : !!(cfg.token || d.token);
    return { source: sys ? 'System default' : 'Your own', owner: owner, repo: repo, keyInstalled: haveKey, trial: sys,
             paired: !!(dev && cfg.space), mode: on ? 'on' : 'off',
             state: !on ? 'Team mode is off' : (!(dev && cfg.space) ? 'Team mode is on — this browser is not paired yet' : 'Team mode is on — paired') };
  }

  async function open() {
    if (document.getElementById('team-panel')) return;
    var cfg = (await kvGet('cfg')) || {}, dev = await kvGet('device'), d = D(), on = modeOn(), v = describe(cfg, dev, d, on);
    var w = document.createElement('div'); w.id = 'team-panel'; w.setAttribute('role', 'dialog');
    w.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:14px/1.45 system-ui,sans-serif';
    w.innerHTML = '<div style="background:#fff;color:#1d1d1f;border-radius:12px;padding:18px;width:min(460px,94vw);max-height:90vh;overflow:auto">' +
      '<div style="font-size:18px;font-weight:600">' + ico() + 'Team</div>' +
      '<div id="tp-state" style="margin:6px 0 10px">' + esc(v.state) + '</div>' +
      '<div style="border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px">' +
        '<div><b id="tp-source">' + esc(v.source) + '</b> <span style="color:#666">· where team data is exchanged</span></div>' +
        '<label style="display:block;margin-top:6px">Repository owner<input id="tp-owner" style="width:100%;min-height:40px" value="' + esc(v.owner) + '"></label>' +
        '<label style="display:block;margin-top:6px">Repository<input id="tp-repo" style="width:100%;min-height:40px" value="' + esc(v.repo) + '"></label>' +
        '<label style="display:block;margin-top:6px">Key (token)<input id="tp-token" type="password" autocomplete="off" style="width:100%;min-height:40px" placeholder="' + (v.source === 'Your own' ? 'saved — type to replace' : 'paste your own to replace the default') + '"></label>' +
        '<div id="tp-key" style="margin-top:6px;color:' + (v.keyInstalled ? '#137a3a' : '#b3261e') + '">' + (v.keyInstalled ? 'Key installed' : 'Trial key not installed — paste your own key, or ask the administrator') + '</div>' +
        '<div style="margin-top:8px"><button id="tp-sys" style="min-height:40px;cursor:pointer">Use system default</button> <button id="tp-own" style="min-height:40px;cursor:pointer">Save as my own</button></div>' +
      '</div>' +
      '<div id="tp-trial" style="margin-bottom:10px;color:#444">' + (v.trial ? 'System default is a <b>trial</b>: it covers one full test cycle (an order, its line and Complete). To keep going, use your own repository and key.' : 'Your own setup: no trial limit.') + '</div>' +
      '<div><button id="tp-mode" style="min-height:40px;cursor:pointer">' + (on ? 'Turn off team mode' : 'Turn on team mode') + '</button> ' +
        '<a id="tp-pair" href="../common/comm/comm_phone.html" target="_blank" style="display:inline-block;min-height:40px;line-height:40px;margin:0 8px">Pair this browser</a> ' +
        '<a id="tp-guide" href="team_guide.html" target="_blank" style="line-height:40px">Team guide</a> ' +
        '<button id="tp-close" style="min-height:40px;cursor:pointer;float:right">Close</button></div></div>';
    document.body.appendChild(w);
    function close() { w.remove(); }
    w.addEventListener('pointerdown', function (e) { if (e.target === w) close(); });
    w.querySelector('#tp-close').onclick = close;
    w.querySelector('#tp-sys').onclick = async function () {
      var c = (await kvGet('cfg')) || {}; c.owner = d.owner; c.repo = d.repo; c.token = d.token; c.trial = true; delete c.pbUrl; delete c.pbSecret;
      if (d.postbox && d.postbox.url) { c.pbUrl = d.postbox.url; c.pbSecret = d.postbox.secret; }
      await kvPut('cfg', c); console.log('§TEAM_PANEL setup=system-default repo=' + d.owner + '/' + d.repo + ' key=' + (d.token ? 'installed' : 'MISSING') + ' trial=true'); close(); open(); };
    w.querySelector('#tp-own').onclick = async function () {
      var o = w.querySelector('#tp-owner').value.trim(), r = w.querySelector('#tp-repo').value.trim(), t = w.querySelector('#tp-token').value.trim();
      var c = (await kvGet('cfg')) || {};
      if (!o || !r || !(t || (c.token && !c.trial))) { w.querySelector('#tp-key').style.color = '#b3261e'; w.querySelector('#tp-key').textContent = 'Own setup needs the owner, the repository and a key'; return; }
      c.owner = o; c.repo = r; if (t) c.token = t; c.trial = false;
      await kvPut('cfg', c); console.log('§TEAM_PANEL setup=own repo=' + o + '/' + r + ' key=saved trial=false'); close(); open(); };
    w.querySelector('#tp-mode').onclick = function () {
      try { if (on) localStorage.removeItem('teamMode'); else localStorage.setItem('teamMode', '1'); } catch (e) {}
      console.log('§TEAM_PANEL mode=' + (on ? 'off' : 'on') + ' (reloading)');
      var u = new URL(location.href); if (on) u.searchParams.delete('team'); else u.searchParams.set('team', '1'); location.href = u.toString(); };
    console.log('§TEAM_PANEL opened ' + JSON.stringify(v));
  }
  global.TeamPanel = { open: open, describe: describe, modeOn: modeOn };
})(typeof window !== 'undefined' ? window : globalThis);
