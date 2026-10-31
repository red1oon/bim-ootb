// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_panel.js — the Team panel, shared by the ERP Team pill and the Modeller's ONE Team icon (TEAMWORK_FRAMEWORK §13.8 T1/T2, §15.15.1). Loaded on every idempiere.html / modeller.html page, inert until opened.
 * The host is whichever adapter is loaded: window.TeamSync (ERP) or window.TeamSyncModeller (Modeller) — same pairing / people calls.
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
  function host() { return global.TeamSync || global.TeamSyncModeller || null; }
  function modeOn() { try { return localStorage.getItem('teamMode') === '1' || /[?&]team=1(&|$)/.test(location.search); } catch (e) { return /[?&]team=1(&|$)/.test(location.search); } }
  function ico() { var s = global.ICONS && global.ICONS.users, body = s ? s.svg : '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'; return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px">' + body + '</svg> '; }
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
      '<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:18px;font-weight:600">' + ico() + 'Team</div><button id="tp-close" style="min-height:40px;cursor:pointer">Close</button></div>' +
      '<div id="tp-state" style="margin:6px 0 10px">' + esc(v.state) + '</div>' +
      '<div id="tp-pairsec" style="border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px;display:none"></div>' +
      '<div id="tp-avatar" style="border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px;display:none"></div>' +
      '<div id="tp-people" style="border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px;display:none"></div>' +
      '<div id="tp-releases" style="border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px;display:none"></div>' +
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
        '<a id="tp-guide" href="../erp/team_guide.html" target="_blank" style="line-height:40px">Team guide</a></div></div>';
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
      try { if (on) localStorage.removeItem('teamMode'); else localStorage.setItem('teamMode', '1'); if (!on && global.TEAM_PANEL_AUTO_OPEN) sessionStorage.setItem('teamPanelAuto', '1'); } catch (e) {}
      console.log('§TEAM_PANEL mode=' + (on ? 'off' : 'on') + ' (reloading)');
      var u = new URL(location.href); if (on) u.searchParams.delete('team'); else u.searchParams.set('team', '1'); location.href = u.toString(); };
    console.log('§TEAM_PANEL opened ' + JSON.stringify(v));
    if (host() && host().pairState) { w.querySelector('#tp-pair').style.display = 'none'; renderPair(w); }
    renderAvatar(w);
    if (host() && host().releases && global.TeamReleasesUI) { var rb = w.querySelector('#tp-releases'); host().pairState().then(function (st) { if (st.enrolled) global.TeamReleasesUI.render(rb, host().releases); }); }      // §46.5 Stage 4: Releases screens
    if (global.TeamsEmbedBim && w.querySelector('#tp-dots') == null) { var db = document.createElement('button'); db.id = 'tp-dots'; db.type = 'button'; db.style.cssText = 'min-height:40px;cursor:pointer;margin:0 8px 10px 0'; db.textContent = 'Show dots on this machine (Outliner)'; db.title = 'The older Teams overlay: dots on the Outliner rows, same-browser presence'; db.onclick = function () { try { localStorage.setItem('teamsEmbed', '1'); } catch (e) {} global.TeamsEmbedBim.init().then(function () { console.log('§TEAM_PANEL dots overlay requested'); close(); }); }; w.querySelector('#tp-mode').parentNode.insertBefore(db, w.querySelector('#tp-mode').parentNode.firstChild); }
    if (host() && host().peopleView) { renderPeople(w); var onP = function () { if (document.body.contains(w)) renderPeople(w, true); else global.removeEventListener('team:people', onP); }; global.addEventListener('team:people', onP); }
  }
  // §13.12.G.1 / §13.12.H: the people strip — one renderer shared with the Modeller (common/comm/team_people_ui.js); this panel only decides WHEN to show it.
  async function renderPeople(w, noRefresh) {
    var T = host(), UI = global.TeamPeopleUI, box = w.querySelector('#tp-people'); if (!box || !T || !UI) return;
    var st = await T.pairState(); if (!st.enrolled) { box.style.display = 'none'; return; }
    if (!noRefresh) { try { await T.refreshPeople(); } catch (e) {} }
    UI.render(box, T);
  }
  // §13.9 pairing inside the panel (no phone page): Start a team · invite · Join · requests + role · Approve. Host-neutral: only TeamSync's pairing calls.
  async function renderPair(w) {
    var T = host(), sec = w.querySelector('#tp-pairsec'); if (!sec) return;
    var st = await T.pairState(), inv = (/#join=([0-9a-f]{64})/.exec(location.hash) || [])[1] || '', html = '<div style="font-weight:600;margin-bottom:6px">Pairing</div>', msg = '';
    function B(id, t) { return '<button id="' + id + '" style="min-height:40px;cursor:pointer;margin:4px 6px 0 0">' + t + '</button>'; }
    var pc = T.planChoices ? T.planChoices() : [], many = pc.length > 1;      // §44 C1: the host (ERP) lists the plans it loaded; a host with none (the Modeller) shows nothing new
    if (!st.space) html += '<div>This browser is not in a team yet.</div>' +
      (many ? '<div id="tp-planbox" style="margin-top:8px"><div style="font-weight:600">Kind of team</div>' + pc.map(function (c) { return '<label style="display:block;min-height:44px"><input type="radio" name="tp-plan" value="' + esc(c.id) + '"' + (c.selected ? ' checked' : '') + ' style="width:20px;height:20px;margin-right:8px"><b>' + esc(c.label) + '</b>' + (c.hint ? ' <span style="color:#666">— ' + esc(c.hint) + '</span>' : '') + '</label>'; }).join('') + '</div>' : '') + B('tp-found', 'Start a team') +
      '<div style="margin-top:8px">or join one:<input id="tp-inv" style="width:100%;min-height:40px" placeholder="invite (64 characters) — or open the invite link" value="' + esc(inv) + '"></div>' + B('tp-join', 'Join');
    else if (st.enrolled) html += '<div id="tp-paired" style="color:#137a3a">✓ Paired · team devices ' + st.devices + ' · this device ' + esc(st.code) + (st.founder ? ' · founder' : '') + '</div>' +
      (many && st.plan ? '<div id="tp-plan" style="margin-top:6px">Kind of team: <b>' + esc((pc.filter(function (c) { return c.id === st.plan; })[0] || { label: st.plan }).label) + '</b> <span style="color:#666">· chosen when the team was started; it cannot be changed</span></div>' : '') +
      (st.founder ? '<div style="margin-top:6px">Invite link for another user or device:<input id="tp-link" readonly style="width:100%;min-height:40px" value="' + esc(T.inviteLink()) + '"></div>' + B('tp-req', 'Check join requests') + '<div id="tp-reqs"></div>' : '') + B('tp-leave', 'Leave this team');
    else html += '<div id="tp-wait">Your device code — tell it to the team founder: <b id="tp-code" style="font:600 20px ui-monospace,monospace;letter-spacing:2px">' + esc(st.code) + '</b></div><div>Waiting for approval — then press Visit.</div>' + B('tp-visit', 'Visit') + B('tp-leave', 'Leave');
    sec.style.display = 'block'; sec.innerHTML = html;
    function act(id, fn) { var b = sec.querySelector('#' + id); if (b) b.onclick = async function () { b.disabled = true; try { await fn(); } catch (e) { if (e && e.message === '__noerr') { b.disabled = false; return; } console.log('🔴 §TEAM_PANEL ' + (e && e.message || e)); sec.insertAdjacentHTML('beforeend', '<div class="tp-err" style="color:#b3261e;margin-top:6px">' + esc(e && e.message || e) + '</div>'); b.disabled = false; return; } renderPair(w); }; }
    act('tp-found', function () { var r = sec.querySelector('input[name=tp-plan]:checked'); return T.found(r ? r.value : undefined); });
    act('tp-join', function () { return T.join(sec.querySelector('#tp-inv').value); });
    act('tp-visit', function () { return T.visit(); });
    act('tp-leave', function () { return T.leave(); });
    act('tp-req', async function () {
      var list = await T.requests(), box = sec.querySelector('#tp-reqs'), opts = T.roles().map(function (r) { return '<option value="' + r.id + '"' + (r.id === 102 ? ' selected' : '') + '>' + esc(r.name) + ' (' + r.id + ')</option>'; }).join('');
      box.innerHTML = list.length ? list.map(function (x, i) { return '<div class="tp-request" data-i="' + i + '" style="padding:6px 0;border-top:1px solid #eee"><b class="tp-rcode" style="font:600 18px ui-monospace,monospace">' + esc(x.code) + '</b> as <select class="tp-role" style="min-height:40px">' + opts + '</select><span class="tp-bound-box"></span> <button class="tp-approve" style="min-height:40px;cursor:pointer">Approve</button></div>'; }).join('') : '<div style="color:#666;margin-top:6px">no pending requests</div>';
      // §44 C2: "Bound to" - only when the host's plan has records addressed to ONE entity for the chosen role (T.bindingFor); the choices are the host's, read from the plan and the dictionary
      function bindBox(row) { var rs = row.querySelector('.tp-role'), role = rs.value, bx = row.querySelector('.tp-bound-box'); row.removeAttribute('data-bound-for'); if (!T.bindingFor) return;
        row._bp = T.bindingFor(Number(role)).then(function (b) { if (rs.value !== role) return;
          bx.innerHTML = b ? '<label style="display:block;margin:6px 0">Bound to <select class="tp-bound" style="min-height:40px;max-width:100%"><option value="">' + (b.optional ? '— not bound (its document numbers are not station-checked) —' : '— choose —') + '</option>' + b.types.map(function (t) { return '<optgroup label="' + esc(t.label) + '">' + t.options.map(function (o) { return '<option value="' + esc(o.uu) + '">' + esc(o.label) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></label>' : '';
          row._bopt = !!(b && b.optional); row.setAttribute('data-bound-for', role); }); }
      box.querySelectorAll('.tp-request').forEach(function (row) { row.querySelector('.tp-role').onchange = function () { bindBox(row); }; bindBox(row); });
      box.querySelectorAll('.tp-approve').forEach(function (bt) { bt.onclick = async function () { var row = bt.closest('.tp-request'); bt.disabled = true;
        try { if (row._bp) await row._bp; var bs = row.querySelector('.tp-bound');
          if (bs && !bs.value && !(row._bopt)) { row.querySelectorAll('.tp-err').forEach(function (x) { x.remove(); }); row.insertAdjacentHTML('beforeend', '<div class="tp-err" style="color:#b3261e">Choose what this device is bound to first: the plan sends it only that record\'s data.</div>'); bt.disabled = false; return; }
          await T.approve(list[Number(row.getAttribute('data-i'))].rq, row.querySelector('.tp-role').value, bs ? bs.value : undefined); } catch (e) { box.insertAdjacentHTML('beforeend', '<div class="tp-err" style="color:#b3261e">' + esc(e && e.message || e) + '</div>'); bt.disabled = false; return; } renderPair(w); }; });
      throw new Error('__noerr');   // keep the list on screen (do not re-render the section)
    });
  }
  // §15.15.2 your avatar: the built-in set as a grid (>= 44 px targets); the choice is saved on this browser (cfg.avatar) and reaches the others at your next Visit
  function renderAvatar(w) {
    var T = host(), AV = global.TeamAvatars, box = w.querySelector('#tp-avatar'); if (!box || !T || !T.setAvatar || !AV) return;
    var cur = T.avatarOf ? T.avatarOf() : null; box.style.display = 'block';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Your avatar</div><div id="tp-av-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:6px">' +
      AV.ids().map(function (id) { return '<button type="button" class="tp-av-pick" data-avatar="' + id + '" aria-label="Avatar ' + id + '" aria-pressed="' + (id === cur ? 'true' : 'false') + '" style="width:48px;height:48px;padding:0;border-radius:50%;cursor:pointer;background:none;border:3px solid ' + (id === cur ? '#1f5fd6' : 'transparent') + ';overflow:hidden">' + AV.svg(id, 42) + '</button>'; }).join('') +
      '</div><div id="tp-av-note" style="margin-top:6px;color:#444">' + (cur ? 'Chosen: ' + cur + '. The others see it after your next Visit.' : 'Not chosen yet: you appear with an automatic one. Pick any — the others see it after your next Visit.') + '</div>';
    box.querySelectorAll('.tp-av-pick').forEach(function (b) { b.onclick = async function () { try { await T.setAvatar(b.getAttribute('data-avatar')); } catch (e) { console.log('🔴 §TEAM_PANEL avatar ' + (e && e.message || e)); } renderAvatar(w); }; });
  }
  // Modeller: after "Turn on team mode" the page reloads — reopen the panel by itself so the next thing on screen is Start a team / Join (§15.15.1)
  global.addEventListener('load', function () { var go = false; try { go = !!global.TEAM_PANEL_AUTO_OPEN && sessionStorage.getItem('teamPanelAuto') === '1'; if (go) sessionStorage.removeItem('teamPanelAuto'); } catch (e) {} if (!go || !modeOn()) return;
    var n = 0, t = setInterval(function () { if (host() && host().pairState) { clearInterval(t); open(); } else if (++n > 200) clearInterval(t); }, 150); });
  // arriving by an invite link on a browser that is not in a team yet: open the panel with the invite prefilled
  global.addEventListener('load', function () { if (!/#join=[0-9a-f]{64}/.test(location.hash) || !modeOn()) return;
    var n = 0, t = setInterval(function () { if (host() && host().pairState) { clearInterval(t); host().pairState().then(function (st) { if (!st.space) open(); }); } else if (++n > 200) clearInterval(t); }, 150); });
  global.TeamPanel = { open: open, describe: describe, modeOn: modeOn, renderPeople: renderPeople, renderAvatar: renderAvatar };
})(typeof window !== 'undefined' ? window : globalThis);
