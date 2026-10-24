// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_people_ui.js — the people strip's DOM, shared by the ERP Team panel and the Modeller (TEAMWORK_FRAMEWORK §13.12.G.1 / §13.12.H). One renderer, two hosts.
 * render(box, T) paints, into `box`: the scope toggle (My role scope / Everyone — only when the host has a dictionary), the "Don't show what I'm on" switch, the Inbox line,
 * and one row per person (initials avatar, name, role, "active N min ago", focus badges, click → "last tasks" from the log, "+N others" for people outside my scope).
 * T = the host API: peopleView() → TeamSync's view (null = nothing to show yet), history(person, n), setHide(bool), setMode(m)?, refreshPeople().
 * Nothing here names a window, a table or an element type. Depends on TeamPeople (initials / ageText). Touch targets are >= 44 px. */
(function (global) {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var openHist = {};

  function render(box, T, opts) {
    opts = opts || {}; var TP = global.TeamPeople; if (!box || !T || !TP) return null;
    var v = T.peopleView(); if (!v) { box.style.display = 'none'; return null; }
    function row(p, other) {
      var act = p.lastActive == null ? 'no activity yet' : 'active ' + TP.ageText(p.ageMs);
      var badges = (p.focus || []).map(function (f) { return '<span class="tp-badge" data-uu="' + esc(f.uu) + '" style="display:inline-block;margin:2px 4px 0 0;padding:2px 8px;border-radius:10px;background:#e8f0fe;color:#1a3d7c;font-size:12px">' + esc(f.label || f.table) + ' · ' + esc(TP.ageText(f.ageMs)) + '</span>'; }).join('');
      return '<div class="tp-person' + (other ? ' tp-other' : '') + '" data-person="' + esc(p.person) + '" data-self="' + (p.self ? 1 : 0) + '" data-inscope="' + (p.inScope ? 1 : 0) + '" data-off="' + (p.off ? 1 : 0) + '" role="button" tabindex="0" style="display:flex;gap:10px;align-items:flex-start;min-height:44px;padding:8px 0;border-top:1px solid #eee;cursor:pointer' + (other ? ';display:none' : '') + '">' +
        '<span class="tp-avatar" aria-hidden="true" style="flex:0 0 40px;width:40px;height:40px;border-radius:50%;background:#1f5fd6;color:#fff;display:flex;align-items:center;justify-content:center;font:600 14px system-ui">' + esc(TP.initials(p.name)) + '</span>' +
        '<span style="flex:1;min-width:0"><span class="tp-name" style="font-weight:600">' + esc(p.name) + (p.self ? ' (you)' : '') + '</span> <span class="tp-role" style="color:#666">' + esc(p.roleName || '') + '</span><br><span class="tp-active" style="color:#444">' + esc(act) + '</span><br>' + badges + '<div class="tp-history" style="display:none"></div></span></div>';
    }
    function B(id, t, on) { return '<button id="' + id + '" aria-pressed="' + (on ? 'true' : 'false') + '" style="min-height:44px;cursor:pointer;margin:4px 6px 0 0;padding:0 12px;border:1px solid #1f5fd6;border-radius:8px;' + (on ? 'background:#1f5fd6;color:#fff' : 'background:#fff;color:#1f5fd6') + '">' + t + '</button>'; }
    var inb = v.inbox || [], inbTxt = inb.length ? 'Inbox: ' + inb.length + ' waiting for your role — ' + inb.slice(0, 5).map(function (i) { return '<span class="tp-inbox-item" data-uu="' + esc(i.uu) + '">' + esc(i.label || i.table) + ' (from ' + esc(i.author) + ')</span>'; }).join(', ') : 'Inbox: nothing from upstream roles is waiting for your role';
    box.style.display = 'block';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:6px">People</div>' +
      (v.scopeAvailable ? '<div>' + B('tp-m-scope', 'My role scope', v.effectiveMode === 'scope') + B('tp-m-all', 'Everyone', v.effectiveMode === 'all') + '</div>'
                        : '<div id="tp-noscope" style="color:#666">Role scope needs the AD dictionary, which this app does not have — showing everyone.</div>') +
      '<label style="display:flex;align-items:center;gap:8px;min-height:44px"><input id="tp-hide" type="checkbox"' + (v.hide ? ' checked' : '') + ' style="width:20px;height:20px"> Don\'t show what I\'m on</label>' +
      (v.scopeAvailable ? '<div id="tp-inbox" style="margin:4px 0 8px;color:#444">' + inbTxt + '</div>' : '') +
      (v.unsupported ? '<div id="tp-unsupported" style="color:#b36b00;margin-bottom:6px">This pipe does not carry the focus board yet — activity is shown, what people are on is not.</div>' : '') +
      v.shown.map(function (p) { return row(p, false); }).join('') +
      (v.others.length ? '<button id="tp-others" style="min-height:44px;cursor:pointer;margin-top:6px;border:0;background:none;color:#1f5fd6;text-decoration:underline">+' + v.others.length + ' others</button>' + v.others.map(function (p) { return row(p, true); }).join('') : '');
    var ms = box.querySelector('#tp-m-scope'), ma = box.querySelector('#tp-m-all');
    if (ms) ms.onclick = function () { T.setMode('scope'); };
    if (ma) ma.onclick = function () { T.setMode('all'); };
    box.querySelector('#tp-hide').onchange = function (e) { T.setHide(e.target.checked); };
    var oth = box.querySelector('#tp-others');
    if (oth) oth.onclick = function () { var open = oth.getAttribute('data-open') === '1'; oth.setAttribute('data-open', open ? '0' : '1'); box.querySelectorAll('.tp-other').forEach(function (r) { r.style.display = open ? 'none' : 'flex'; }); oth.textContent = open ? '+' + v.others.length + ' others' : 'hide others'; };
    function showHist(r) {
      var h = r.querySelector('.tp-history'), person = r.getAttribute('data-person'), open = h.style.display !== 'none'; openHist[person] = !open;
      if (open) { h.style.display = 'none'; return; }
      var items = T.history(person, 10);
      h.innerHTML = items.length ? items.map(function (g) { return '<div class="tp-hist" data-table="' + esc(g.table) + '" data-uu="' + esc(g.uu) + '" data-count="' + g.count + '" style="padding:4px 0;color:#333">' + esc(g.label || g.table + ' ' + String(g.uu).slice(0, 8)) + ' · ' + g.count + (g.count === 1 ? ' change' : ' changes') + ' · ' + esc(TP.ageText(Date.now() - g.last)) + '</div>'; }).join('') : '<div class="tp-hist-none" style="color:#666">no tasks yet</div>';
      h.style.display = 'block'; h.onclick = function (e) { e.stopPropagation(); };
    }
    box.querySelectorAll('.tp-person').forEach(function (r) { r.onclick = function () { showHist(r); }; r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showHist(r); } };
      if (openHist[r.getAttribute('data-person')]) { openHist[r.getAttribute('data-person')] = false; showHist(r); } });
    console.log('§TEAM_PEOPLE_UI mode=' + v.effectiveMode + ' shown=' + v.shown.length + ' others=' + v.others.length + ' inbox=' + inb.length + ' hide=' + v.hide);
    return v;
  }

  global.TeamPeopleUI = { render: render, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.TeamPeopleUI;
})(typeof window !== 'undefined' ? window : globalThis);
