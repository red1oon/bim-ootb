// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
//
// dashboard_home.js — HOME DASHBOARD GADGET SELECTION (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D2a; Witness: W-DASH-SELECT).
// Ports which PA_DashboardContent gadgets the legacy Home shows a user/role and where: MDashboardContentAccess.get (dashboards not granted through PA_DashboardContent_Access that are IsShowInLogin, UNION the
// ones an ACTIVE access row grants this role/user, minus those an INACTIVE access row removes) and DashboardController.renderColumns (DashboardController.java:236-300): main dashboard vs side panel by
// IsShowInDashboard, active only, ORDER BY ColumnNo, Line, column count = DISTINCT ColumnNo of the main set, effective column = min(ColumnNo, cols-1). A gadget's KIND comes from the dictionary row
// (zul file / html / chart / goal / window / process / statusline); a row nothing classifies is kind "unknown" (the witness fails on it - never dropped). PURE: select(q, {client, role, user}).
(function (global) {
  'use strict';
  // zulfilepath -> kind (the ZK gadget classes behind them: DPActivities, DPFavourites, DPRecentItems, DPViews, DPRunningJobs, DPCalendar, DPPerformance, DPMenuTree, docstatus.zul)
  var ZUL_KIND = { 'activities.zul': 'activities', 'docstatus.zul': 'docstatus', 'menutree.zul': 'menu', 'favourites.zul': 'favourites', 'recentitems.zul': 'recentitems', 'views.zul': 'views',
    'runningjobs.zul': 'runningjobs', 'calendar.zul': 'calendar', 'performance.zul': 'performance' };
  function kindOf(c) {
    var z = String(c.zulfilepath || '').split('/').pop().toLowerCase();
    if (z) return ZUL_KIND[z] || 'unknown';
    if (c.ad_chart_id != null && String(c.ad_chart_id) !== '') return 'chart';
    if (c.pa_goal_id != null && String(c.pa_goal_id) !== '') return 'goal';
    if (c.html != null && String(c.html) !== '') return 'html';
    if (c.ad_window_id != null && String(c.ad_window_id) !== '') return 'window';
    if (c.ad_process_id != null && String(c.ad_process_id) !== '') return 'process';
    if (c.ad_statusline_id != null && String(c.ad_statusline_id) !== '') return 'statusline';
    return 'unknown';
  }
  function has(q, t) { try { return q("SELECT 1 AS x FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=?", [t]).length > 0; } catch (e) { return false; } }
  function select(q, s) {
    if (!has(q, 'pa_dashboardcontent')) return { ok: false, reason: 'PA_DashboardContent not in this bundle (INCONCLUSIVE)', selected: [], main: [], side: [], cols: 0 };
    var cl = Number(s.client), role = Number(s.role), user = Number(s.user), hasAcc = has(q, 'pa_dashboardcontent_access');
    var A = "SELECT PA_DashboardContent_ID AS id, ColumnNo AS col FROM PA_DashboardContent WHERE " + (hasAcc ? "PA_DashboardContent_ID NOT IN (SELECT PA_DashboardContent_ID FROM PA_DashboardContent_Access WHERE IsActive='Y' AND AD_Client_ID IN (0," + cl + ")) AND " : '') +
      "IsShowInLogin='Y' AND IsActive='Y' AND AD_Client_ID IN (0," + cl + ")" +
      (hasAcc ? " AND PA_DashboardContent_ID NOT IN (SELECT PA_DashboardContent_ID FROM PA_DashboardContent_Access ct2 WHERE ct2.IsActive='N' AND ct2.AD_Client_ID IN (0," + cl + ") AND COALESCE(ct2.AD_Role_ID," + role + ")=" + role + " AND COALESCE(ct2.AD_User_ID," + user + ")=" + user + ")" : '');
    var B = hasAcc ? " UNION ALL SELECT ct.PA_DashboardContent_ID, ct.ColumnNo FROM PA_DashboardContent ct INNER JOIN PA_DashboardContent_Access cta ON ct.PA_DashboardContent_ID=cta.PA_DashboardContent_ID WHERE cta.IsActive='Y' AND ct.IsActive='Y' AND COALESCE(cta.AD_Role_ID," + role + ")=" + role + " AND COALESCE(cta.AD_User_ID," + user + ")=" + user + " AND cta.AD_Client_ID IN (0," + cl + ")" : '';
    var ids = q(A + B + ' ORDER BY col, id').map(function (r) { return Number(r.id); });
    var seen = {}, uniq = ids.filter(function (i) { return seen[i] ? false : (seen[i] = 1); });
    var gad = uniq.length ? q('SELECT * FROM pa_dashboardcontent WHERE pa_dashboardcontent_id IN (' + uniq.join(',') + ')') : [];
    var items = gad.filter(function (c) { return String(c.isactive) === 'Y'; }).map(function (c) {
      return { id: Number(c.pa_dashboardcontent_id), name: c.name, col: Number(c.columnno), line: Number(c.line), main: String(c.isshowindashboard) === 'Y', collapsed: String(c.iscollapsedbydefault) === 'Y', kind: kindOf(c), row: c };
    });
    var main = items.filter(function (g) { return g.main; }), side = items.filter(function (g) { return !g.main; });
    var order = function (a, b) { return a.col - b.col || a.line - b.line; };
    main.sort(order); side.sort(order);
    var cols = main.map(function (g) { return g.col; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
    main.forEach(function (g) { g.effColumn = Math.min(g.col, Math.max(cols, 1) - 1); });
    return { ok: true, selected: uniq, main: main, side: side, cols: cols };
  }
  var api = { select: select, kindOf: kindOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.DashboardHome = api;
})(typeof window !== 'undefined' ? window : this);
