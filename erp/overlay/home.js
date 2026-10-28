// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/home.js — the legacy HOME dashboard as an OVERLAY (prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D2c, §EXTENSION-LAYER LAW). When the core shows its empty-content placeholder for a logged-in
// session, the Home is drawn next to it (the placeholder is hidden, not removed; the core replaces #idmp-content whenever a window opens, which removes the Home). Reads: window.APP (actor/client/role/org),
// window.__idmpDb (read-only SELECTs; TEMP views only), window.IdmpHost.focus (to open a window by name), IdmpHost.zoom/recentItems/recentRemove (Recent Items, §UDP-6G). NOTHING in the core calls this file.
// W-MF-LENS (TEAMWORK_FRAMEWORK.md §42.5) adds the three plain gadget kinds of DashboardController.asyncRenderComponents (:752-846): HTML (the HTML column rendered as HTML inside PAPanel.css's `.content`, stripHtml :1600-1612), Window (a button
//   named by the window's menu, MDashboardContent.getAD_Menu_ID :237-252) and Process (a button named by the process's menu, :790-805; the client-0 AccessLevel gate :792-798); a click on either button is DefaultDesktop.onMenuSelected(menuId)
//   (DashboardController.onEvent :1150-1158) = the click on that role's own menu leaf. LINKS INSIDE THE HTML: legacy puts the HTML into the page untouched (a plain browser link), and reaches the application through its own URL
//   (AEnv.getZoomUrl :920-940 -> AdempiereWebUI.processParameters :402-430); the twin's application URL carries `?window=<AD_Window_ID>` / `?process=<AD_Process_ID>`, so a click on such a link is resolved against the DICTIONARY (resolveLink) and opened
//   through the same menu leaf; any other link is left to the browser, as legacy leaves it. Goal / Chart / ZUL / StatusLine stay "Not ported yet" and are named. Everything is read at render time from the dictionary: no item is listed here.
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
      '#idmp-home .idmp-pa .content{margin:6px 10px;background:#fff}#idmp-home .idmp-pa .header{background-color:#B5C6C6}#idmp-home .idmp-pa .hrefNode{color:#000;background-color:#EBF1EF;text-align:right;text-decoration:none}' +
      '#idmp-home .idmp-pa .dataGrid{border:1px solid #BBB;border-collapse:collapse;width:60%;background-color:#EBF1EF}#idmp-home .idmp-pa .dataGrid th{text-align:center;padding:2px;font-weight:normal;font-size:13px;background-color:#C6D1CD;border:1px solid #BBB}' +
      '#idmp-home .idmp-pa .dataGrid td{border:1px solid #BBB}#idmp-home .idmp-pa .label{background-color:#C6D1CD}#idmp-home .idmp-pa .tdcontent{background-color:#D6E1DD}#idmp-home .idmp-btn{display:block;margin:4px 0;border:none;background:none;padding:0;color:var(--idmp-link,#1c5fa8);cursor:pointer;font-size:13px;text-align:left}#idmp-home .idmp-btn:hover{text-decoration:underline}' +   // PAPanel.css, scoped to the gadget (legacy injects it page-wide)
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
  // ---- plain gadgets: HTML / Window / Process (DashboardController.asyncRenderComponents) ----
  function stripHtml(h) { return String(h).replace(/<html>/g, '').replace(/<\/html>/g, '').replace(/<body>/g, '').replace(/<\/body>/g, '').replace(/<head>/g, '').replace(/<\/head>/g, ''); }   // :1600-1612 (all=false)
  // DefaultDesktop.onMenuSelected(menuId): the click on the role's own menu leaf. A role without that leaf is refused (its menu does not have the entry), never opened around the menu.
  function openMenu(menuId, why) {
    var lf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + Number(menuId) + '"]');
    if (!lf) { console.log('§DASH-LINK refused menu=' + menuId + ' (not in this role\'s menu)' + (why ? ' from=' + why : '')); return false; }
    console.log('§DASH-LINK open menu=' + menuId + (why ? ' from=' + why : '')); lf.click(); return true;
  }
  // an application link of the HTML -> { ok, kind, id, name, menuId } | { ok:false, reason } | { external:true }. The target must be a row of the dictionary (AD_Window / AD_Process, active) - never a number taken on trust.
  var KIND = { window: { table: 'AD_Window', pk: 'AD_Window_ID' }, process: { table: 'AD_Process', pk: 'AD_Process_ID' } };
  function resolveLink(href) {
    var u; try { u = new URL(href, location.href); } catch (e) { return { ok: false, reason: 'bad-url' }; }
    if (u.origin !== location.origin || u.pathname !== location.pathname) return { external: true };
    var kind = u.searchParams.get('window') != null ? 'window' : u.searchParams.get('process') != null ? 'process' : null;
    if (!kind) return { external: true };
    var id = Number(u.searchParams.get(kind)), K = KIND[kind];
    var row = Number.isInteger(id) && id > 0 ? q('SELECT ' + K.pk + ' AS id, Name AS n FROM ' + K.table + ' WHERE ' + K.pk + "=? AND IsActive='Y'", [id])[0] : null;
    if (!row) return { ok: false, reason: 'not-in-dictionary', kind: kind, id: id };
    var m = q('SELECT AD_Menu_ID AS m FROM AD_Menu WHERE ' + K.pk + "=? AND IsActive='Y' ORDER BY AD_Menu_ID DESC", [id])[0];   // MDashboardContent.getAD_Menu_ID :246-250 (newest active menu of the window)
    return { ok: true, kind: kind, id: id, name: row.n, menuId: m ? Number(m.m) : null };
  }
  function linkClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('.idmp-pa a[href]') : null; if (!a) return;
    var r = resolveLink(a.getAttribute('href')); if (r.external) return;                                   // not an application link: the browser's business, as in legacy
    e.preventDefault();
    if (!r.ok) { console.log('§DASH-LINK refused href=' + a.getAttribute('href') + ' reason=' + r.reason); return; }
    console.log('§DASH-LINK click kind=' + r.kind + ' id=' + r.id + ' name="' + r.name + '" menu=' + r.menuId);
    if (r.menuId == null) { console.log('§DASH-LINK refused ' + r.kind + '=' + r.id + ' reason=no-menu'); return; }
    openMenu(r.menuId, 'html');
  }
  function menuButton(menuId, label) {   // ToolBarButton(menu name) -> onMenuSelected
    var b = el('button', 'idmp-btn', label); b.type = 'button'; b.setAttribute('data-menu-id', menuId);
    b.addEventListener('click', function () { openMenu(menuId, 'button'); }); return b;
  }
  // -> components appended to body (0 = legacy detaches the gadget, :483-492); also logs what it could not draw
  function plainComponents(g, S, body) {
    var c = g.row, n = 0;
    if (c.html != null && String(c.html) !== '') {                                                                      // HTML
      var pa = el('div', 'idmp-pa'), ct = el('div', 'content'); ct.innerHTML = stripHtml(c.html) + '<br>\n'; pa.appendChild(ct); body.appendChild(pa); n++;
    }
    if (Number(c.ad_window_id) > 0) {                                                                                   // Window
      var wm = q("SELECT AD_Menu_ID AS m, Name AS n FROM AD_Menu WHERE AD_Window_ID=? AND IsActive='Y' ORDER BY AD_Menu_ID DESC", [c.ad_window_id])[0];
      if (wm) { body.appendChild(menuButton(wm.m, wm.n)); n++; } else console.log('§DASH-UNPORTED id=' + g.id + ' name="' + g.name + '" kind=window reason=no-menu-for-window-' + c.ad_window_id);
    }
    if (Number(c.ad_process_id) > 0) {                                                                                  // Process / Report
      var pr = q('SELECT accesslevel AS a FROM AD_Process WHERE AD_Process_ID=?', [c.ad_process_id])[0], sys = pr && ['7', '4', '6'].indexOf(String(pr.a)) >= 0;
      if (S.client !== 0 || sys) {                                                                                      // :792-798 (client 0 needs a System-level process)
        var pm = q('SELECT AD_Menu_ID AS m, Name AS n FROM AD_Menu WHERE AD_Process_ID=? ORDER BY AD_Menu_ID', [c.ad_process_id])[0];
        if (String(c.isembedreportcontent) === 'Y') console.log('§DASH-UNPORTED id=' + g.id + ' name="' + g.name + '" kind=embedded-report');
        else if (pm) { body.appendChild(menuButton(pm.m, pm.n)); n++; } else console.log('§DASH-UNPORTED id=' + g.id + ' name="' + g.name + '" kind=process reason=no-menu-for-process-' + c.ad_process_id);
      }
    }
    return n;
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
        } else if (g.kind === 'html' || g.kind === 'window' || g.kind === 'process') {
          if (!plainComponents(g, S, body)) { console.log('§DASH-EMPTY id=' + g.id + ' name="' + g.name + '" kind=' + g.kind + ' components=0 (legacy detaches the gadget: DashboardController.java:483-492)'); return; }
          rendered++; console.log('§DASH-GADGET ' + g.kind + ' id=' + g.id + ' name="' + g.name + '" links=' + body.querySelectorAll('a[href]').length + ' buttons=' + body.querySelectorAll('button[data-menu-id]').length);
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
      home.addEventListener('click', linkClick);
      ph.style.display = 'none'; host.appendChild(home);
      console.log('§DASH-HOME client=' + S.client + ' role=' + S.role + ' user=' + S.user + ' main=' + sel.main.length + ' side=' + sel.side.length + ' cols=' + sel.cols + ' rendered=' + rendered + ' unported=' + unported + ' ids=[' + sel.main.map(function (g) { return g.id; }) + ']');
    } catch (e) { console.log('§OVERLAY home failed (core unaffected): ' + String(e && e.message).slice(0, 160)); }
    finally { busy = false; }
  }
  window.OverlayHome = { render: render, session: session, q: q, el: el, css: css, resolveLink: resolveLink };
  // Plugins & Releases closing is the moment a Start / Stop of a bundle that stages gadget rows can have changed the Home: draw it again (legacy re-renders the home tab, DefaultDesktop.renderHomeTab :602-616)
  try { new MutationObserver(function (ml) { ml.forEach(function (m) { [].forEach.call(m.removedNodes, function (nd) { if (nd.id === 'pr-root') { var h = document.getElementById('idmp-home'), ph = document.querySelector('#idmp-content > #idmp-placeholder'); if (h && ph) { h.remove(); ph.style.display = ''; setTimeout(render, 0); } } }); }); }).observe(document.body, { childList: true }); } catch (e) { console.log('§OVERLAY home console observer failed (core unaffected): ' + e.message); }
  try {
    var host = document.getElementById('idmp-content');
    if (host) { new MutationObserver(function () { setTimeout(render, 0); }).observe(host, { childList: true }); setTimeout(render, 0); }
  } catch (e) { console.log('§OVERLAY home observer failed (core unaffected): ' + e.message); }
})();
