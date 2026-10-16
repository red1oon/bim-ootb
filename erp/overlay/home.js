// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/home.js — the legacy HOME dashboard as an OVERLAY (prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D2c, §EXTENSION-LAYER LAW). When the core shows its empty-content placeholder for a logged-in
// session, the Home is drawn next to it (the placeholder is hidden, not removed; the core replaces #idmp-content whenever a window opens, which removes the Home). Reads: window.APP (actor/client/role/org),
// window.__idmpDb (read-only SELECTs; TEMP views only), window.IdmpHost.focus (to open a window by name), IdmpHost.zoom/recentItems/recentRemove (Recent Items, §UDP-6G). NOTHING in the core calls this file.
(function () {
  'use strict';
  var engineOn = false, dsOn = false, busy = false;
  function q(sql, p) { var st = window.__idmpDb.prepare(sql), out = []; try { if (p) st.bind(p); while (st.step()) { var o = st.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); out.push(k); } } finally { st.free(); } return out; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function css() {
    if (document.getElementById('idmp-ovl-css')) return;
    var s = document.createElement('style'); s.id = 'idmp-ovl-css';
    s.textContent = '#idmp-home{display:flex;gap:12px;padding:12px;align-items:flex-start;flex-wrap:wrap}#idmp-home .idmp-hcol{flex:1 1 260px;min-width:240px;display:flex;flex-direction:column;gap:12px}' +
      '#idmp-home .idmp-gadget{border:1px solid var(--idmp-border,#d0d7de);border-radius:6px;background:var(--idmp-bg2,#fff)}#idmp-home .idmp-gadget>.gh{padding:6px 10px;font-weight:600;font-size:13px;border-bottom:1px solid var(--idmp-border,#d0d7de)}' +
      '#idmp-home .idmp-gadget>.gb{padding:10px;font-size:12px;color:var(--idmp-muted)}#idmp-home .pi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}#idmp-home .pi{text-align:center;color:var(--idmp-fg,inherit)}' +
      '#idmp-home .pi svg{width:100%;max-width:130px}#idmp-home .pi .pt{font-size:11px}#idmp-home .ds-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}' +
      '#idmp-home .ds{border:1px solid var(--idmp-border,#d0d7de);border-radius:6px;padding:8px;text-align:center;cursor:pointer}#idmp-home .ds .dn{font-size:22px;font-weight:700}#idmp-home .ds .dl{font-size:11px;color:var(--idmp-muted)}' +
      '#idmp-home .idmp-hside{flex:0 1 240px}#idmp-home .ri-list{display:flex;flex-direction:column;gap:4px}#idmp-home .ri-item{color:var(--idmp-link,#1c5fa8);text-decoration:none;cursor:pointer}' +
      '#idmp-home .ri-item:hover{text-decoration:underline}#idmp-home .ri-bar{display:flex;justify-content:flex-end;gap:10px;align-items:center;padding:4px 10px;border-top:1px solid var(--idmp-border,#d0d7de)}' +
      '#idmp-home .ri-refresh{border:none;background:none;cursor:pointer;font-size:16px;color:inherit}#idmp-home .ri-trash{font-size:16px}' +
      '.idmp-ovl-pane{padding:14px;max-width:880px}.idmp-ovl-pane h3{margin:0 0 6px}.idmp-ovl-pane .sub{font-size:12px;color:var(--idmp-muted);margin-bottom:8px}.idmp-ovl-pane .fld{margin:8px 0}.idmp-ovl-pane .fld label{font-weight:600;font-size:13px}';
    document.head.appendChild(s);
  }
  function session() {
    var A = window.APP || {}; if (A.actor == null || A.clientId == null || A.roleId == null || !window.__idmpDb) return null;
    var role = A.roleId, cl = A.clientId, all = q('SELECT IsAccessAllOrgs AS a FROM AD_Role WHERE AD_Role_ID=?', [role])[0], orgIds = null;
    if (!all || String(all.a) !== 'Y') orgIds = [0].concat(q("SELECT DISTINCT AD_Org_ID AS o FROM AD_Role_OrgAccess WHERE AD_Role_ID=? AND IsActive='Y'", [role]).map(function (r) { return Number(r.o); }));
    var d = new Date(), p2 = function (n) { return ('0' + n).slice(-2); }, today = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    return { client: cl, user: A.actor, role: role, today: today, now: today + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()), orgIds: orgIds, access: { clientIds: cl === 0 ? [0] : [0, cl], orgIds: orgIds } };
  }
  // Recent Items side gadget = DPRecentItems (org.adempiere.ui.zk/.../dashboard/DPRecentItems.java): links newest first, click -> zoom
  //   (:222-260), refresh button + trash drop target (:183-190, :309-320). The list, the labels and the delete are the CORE's
  //   (IdmpHost.recentItems / recentRemove / zoom); this file only draws them.
  function recentGadget(g) {
    var box = el('div', 'idmp-gadget'); box.setAttribute('data-gadget-id', g.id); box.setAttribute('data-gadget-kind', g.kind); box.setAttribute('data-gadget-name', g.name);
    box.appendChild(el('div', 'gh', g.name)); var body = el('div', 'gb ri-list'); box.appendChild(body);
    var bar = el('div', 'ri-bar'), refresh = el('button', 'ri-refresh', '\u21bb'), trash = el('span', 'ri-trash', '\ud83d\uddd1');
    refresh.title = 'Refresh'; refresh.type = 'button'; trash.title = 'Delete'; bar.appendChild(refresh); bar.appendChild(trash); box.appendChild(bar);
    var load = function () {
      window.IdmpHost.recentItems(function (items) {
        body.innerHTML = '';
        items.forEach(function (it) {
          var a = el('a', 'ri-item', it.label); a.href = '#'; a.draggable = true; a.setAttribute('data-ri-id', it.id); a.setAttribute('data-ri-window', it.windowId);
          a.addEventListener('click', function (e) { e.preventDefault(); console.log('§DASH-RECENT click id=' + it.id + ' window=' + it.windowId + ' ' + it.column + '=' + it.value); window.IdmpHost.zoom(it.windowId, it.column, it.value); });
          a.addEventListener('dragstart', function (e) { try { e.dataTransfer.setData('text/plain', String(it.id)); e.dataTransfer.effectAllowed = 'move'; } catch (er) {} });
          body.appendChild(a);
        });
        console.log('§DASH-GADGET recentitems shown=' + items.length + ' labels=' + JSON.stringify(items.map(function (i) { return i.label; })));
      });
    };
    refresh.addEventListener('click', load);
    trash.addEventListener('dragover', function (e) { e.preventDefault(); });
    trash.addEventListener('drop', function (e) {
      e.preventDefault(); var id = ''; try { id = e.dataTransfer.getData('text/plain'); } catch (er) {}
      if (!id) return; console.log('§DASH-RECENT drop id=' + id);
      window.IdmpHost.recentRemove(/^-?[0-9]+$/.test(id) ? Number(id) : id, function () { load(); });
    });
    load();
    return box;
  }
  function render() {
    if (busy) return; busy = true;
    try {
      var host = document.getElementById('idmp-content'), ph = host && host.querySelector(':scope > #idmp-placeholder');
      if (!ph || host.querySelector('#idmp-home') || !window.DashboardHome || !window.DashboardGadgets || !window.GoalEngine) return;
      var S = session(); if (!S) return;
      var sel = window.DashboardHome.select(q, { client: S.client, role: S.role, user: S.user });
      if (!sel.ok) { console.log('§DASH-HOME INCONCLUSIVE ' + sel.reason); return; }
      css();
      if (!engineOn) { window.GoalEngine.install(window.__idmpDb); engineOn = true; }
      var home = el('div'); home.id = 'idmp-home'; var cols = [], rendered = 0, unported = 0;
      sel.main.forEach(function (g) {
        var box = el('div', 'idmp-gadget'); box.setAttribute('data-gadget-id', g.id); box.setAttribute('data-gadget-kind', g.kind); box.setAttribute('data-gadget-name', g.name);
        box.appendChild(el('div', 'gh', g.name)); var body = el('div', 'gb'); box.appendChild(body);
        if (g.kind === 'performance') {
          var items = window.DashboardGadgets.performance(q, S, window.GoalEngine), grid = el('div', 'pi-grid');
          if (!items.length) { console.log('§DASH-EMPTY id=' + g.id + ' name="' + g.name + '" kind=performance goals=0 (a lazy gadget with nothing to show is detached: DashboardController.java:483-492)'); return; }
          items.forEach(function (it) {
            var pi = el('div', 'pi'); pi.setAttribute('data-goal-id', it.id); pi.setAttribute('data-percent', it.percent); pi.setAttribute('data-color', it.color); pi.title = it.tooltip;
            var frac = Math.max(0, Math.min(1, it.percent / 100)), C = Math.PI * 40;
            pi.innerHTML = '<svg viewBox="0 0 100 58"><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#e3e6ea" stroke-width="12"/><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="' + it.color + '" stroke-width="12" stroke-dasharray="' + (C * frac).toFixed(2) + ' ' + C.toFixed(2) + '"/></svg>';
            pi.appendChild(el('div', 'pt', it.title)); grid.appendChild(pi);
          });
          body.appendChild(grid); rendered++;
          console.log('§DASH-GADGET performance goals=' + items.length + ' titles=' + JSON.stringify(items.map(function (i) { return i.title; })));
        } else if (g.kind === 'docstatus' && window.DashboardDocStatus) {
          if (!dsOn) { window.DashboardDocStatus.install(window.__idmpDb, q); dsOn = true; }
          var inds = window.DashboardDocStatus.indicators(q, S), dg = el('div', 'ds-grid');
          inds.forEach(function (i) {
            var t = el('div', 'ds'); t.setAttribute('data-ds-id', i.id); t.setAttribute('data-ds-count', i.count == null ? '' : i.count); t.title = i.error ? i.error : i.name;
            t.appendChild(el('div', 'dn', i.count == null ? '?' : String(i.count))); t.appendChild(el('div', 'dl', i.name));
            if (i.windowId) t.addEventListener('click', function () { try { var w = q('SELECT Name AS n FROM AD_Window WHERE AD_Window_ID=?', [i.windowId])[0]; if (w && window.IdmpHost && window.IdmpHost.focus) window.IdmpHost.focus('docstatus', { window: w.n }); } catch (e) { console.log('§DASH-HOME zoom failed ' + e.message); } });
            dg.appendChild(t);
          });
          body.appendChild(dg); rendered++;
          console.log('§DASH-GADGET docstatus indicators=' + inds.length + ' ' + inds.map(function (i) { return i.name + '=' + i.count; }).join(' | ') + ' (click opens the window WITHOUT the indicator filter: §DASH-UNPORTED zoom-filter)');
        } else { body.textContent = 'Not ported yet (' + g.kind + ').'; unported++; console.log('§DASH-UNPORTED id=' + g.id + ' name="' + g.name + '" kind=' + g.kind + ' placement=main'); }
        var col = cols[g.effColumn]; if (!col) { col = cols[g.effColumn] = el('div', 'idmp-hcol'); home.appendChild(col); }
        col.appendChild(box);
      });
      var side = null;
      sel.side.forEach(function (g) {
        if (g.kind === 'recentitems' && window.IdmpHost && typeof window.IdmpHost.recentItems === 'function') {
          if (!side) { side = el('div', 'idmp-hcol idmp-hside'); side.id = 'idmp-home-side'; home.insertBefore(side, home.firstChild); }
          side.appendChild(recentGadget(g)); rendered++; return;
        }
        unported++; console.log('§DASH-UNPORTED id=' + g.id + ' name="' + g.name + '" kind=' + g.kind + ' placement=side');
      });
      ph.style.display = 'none'; host.appendChild(home);
      console.log('§DASH-HOME client=' + S.client + ' role=' + S.role + ' user=' + S.user + ' main=' + sel.main.length + ' side=' + sel.side.length + ' cols=' + sel.cols + ' rendered=' + rendered + ' unported=' + unported + ' ids=[' + sel.main.map(function (g) { return g.id; }) + ']');
    } catch (e) { console.log('§OVERLAY home failed (core unaffected): ' + String(e && e.message).slice(0, 160)); }
    finally { busy = false; }
  }
  window.OverlayHome = { render: render, session: session, q: q, el: el, css: css };
  try {
    var host = document.getElementById('idmp-content');
    if (host) { new MutationObserver(function () { setTimeout(render, 0); }).observe(host, { childList: true }); setTimeout(render, 0); }
  } catch (e) { console.log('§OVERLAY home observer failed (core unaffected): ' + e.message); }
})();
