// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// ad_recent.js — AD_RecentItem, the per-user recent records list (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-6). Pure: rows in, intents out.
//   Port of MRecentItem (org.adempiere.base/.../MRecentItem.java): get :179-217 (by Record_UU when given, else Record_ID; user + client),
//   addModifiedField :225-259 (RecentItems_MaxSaved <= 0 -> off; new row, or new role/window/tab, or touch Updated), touchUpdatedRecord
//   :291-299 (touch + deleteExtraRecentItems :305-330: keep the newest MaxSaved per user+client by Updated DESC), getFromUser :336-349
//   (active, client, ORDER BY Updated DESC), getLabel :354-413 (window name + ": " + TitleLogic, else DocumentNo / Value / Name, else [id];
//   a record that no longer loads -> the row is deleted and skipped).
//   Witness: W-UDP6-ENGINE (erp/tests/witness_udp6_recent_engine.js) against the real MRecentItem in the pilot JVM.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
(function (global) {
  'use strict';
  function eq(a, b) { return a != null && b != null && String(a) === String(b); }
  function blank(v) { return v == null || String(v) === ''; }
  // get :179-217 — the user's row for the record (UU wins when the caller has one)
  function find(rows, a) {
    return (rows || []).filter(function (r) {
      if (!eq(r.ad_table_id, a.table) || !eq(r.ad_user_id, a.user) || !eq(r.ad_client_id, a.client)) return false;
      return !blank(a.uu) ? eq(r.record_uu, a.uu) : eq(r.record_id, a.record);
    })[0] || null;
  }
  // addModifiedField :225-259 -> [{ op: 'create', fields } | { op: 'update', id, changes } | { op: 'touch', id }]
  function addModified(rows, a, maxSaved) {
    if (maxSaved != null && Number(maxSaved) <= 0) return [];
    var r = find(rows, a);
    if (!r) return [{ op: 'create', fields: { ad_table_id: Number(a.table), record_id: a.record == null ? 0 : Number(a.record), record_uu: blank(a.uu) ? null : String(a.uu),
      ad_user_id: Number(a.user), ad_role_id: Number(a.role), ad_window_id: Number(a.window), ad_tab_id: Number(a.tab) } }];
    if (!eq(r.ad_role_id, a.role) || !eq(r.ad_window_id, a.window) || !eq(r.ad_tab_id, a.tab))
      return [{ op: 'update', id: r.ad_recentitem_id, changes: { ad_role_id: Number(a.role), ad_window_id: Number(a.window), ad_tab_id: Number(a.tab) } }];
    return [{ op: 'touch', id: r.ad_recentitem_id }];
  }
  // touchUpdatedRecord :291-299 + deleteExtraRecentItems :305-330. `after` = the rows as they will be once the touch is applied
  //   (the caller passes its own Updated for the touched id); returns the touch plus a delete per row beyond MaxSaved.
  function touchUpdated(rows, a, maxSaved, nowTs) {
    var r = find(rows, a); if (!r) return [];
    var max = Number(maxSaved) > 0 ? Number(maxSaved) : 50, out = [{ op: 'touch', id: r.ad_recentitem_id }];
    var mine = (rows || []).filter(function (x) { return eq(x.ad_user_id, a.user) && eq(x.ad_client_id, a.client); })
      .map(function (x) { return { id: x.ad_recentitem_id, updated: eq(x.ad_recentitem_id, r.ad_recentitem_id) ? nowTs : String(x.updated) }; })
      .sort(function (x, y) { return x.updated < y.updated ? 1 : x.updated > y.updated ? -1 : 0; });
    mine.slice(max).forEach(function (x) { out.push({ op: 'delete', id: x.id }); });
    return out;
  }
  // getFromUser :336-349
  function listFor(rows, user, client) {
    return (rows || []).filter(function (r) { return eq(r.ad_user_id, user) && eq(r.ad_client_id, client) && String(r.isactive || 'Y') === 'Y'; })
      .sort(function (x, y) { var a = String(x.updated), b = String(y.updated); return a < b ? 1 : a > b ? -1 : 0; });
  }
  // getLabel :354-413. po = the record's row (lower-case keys) or null (not loadable -> null = delete the recent row);
  //   resolve(table, keyCol, id, col) = the value of `col` on the record `id` of `table` (for TitleLogic @Col<Sub>@ - Env.parseVariable).
  function label(windowName, titleLogic, po, resolve) {
    if (!po) return null;
    var g = function (c) { for (var k in po) if (po.hasOwnProperty(k) && k.toLowerCase() === String(c).toLowerCase()) return po[k]; return undefined; };
    var ident = '';
    if (!blank(titleLogic)) {
      var t = String(titleLogic).replace(/@([A-Za-z0-9_]+)(?:<([A-Za-z0-9_]+)>)?@/g, function (w, col, sub) {
        var v = g(col); if (v == null) return '';
        if (sub && resolve) { var rv = resolve(col.replace(/_ID$/i, ''), col, v, sub); return rv == null ? '' : String(rv); }
        return String(v);
      });
      if (!blank(t)) ident = ' ' + t;
    }
    if (!ident) {
      ['DocumentNo', 'Value', 'Name'].forEach(function (c) { var v = g(c); if (v !== undefined) ident += ' ' + (v == null ? '' : String(v)); });
      if (!ident) ident = ' [' + (po.__id != null ? po.__id : '') + ']';
    }
    return windowName + ': ' + ident.substring(1);
  }
  var API = { find: find, addModified: addModified, touchUpdated: touchUpdated, listFor: listFor, label: label };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.AdRecent = API;
  else if (global) global.AdRecent = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
