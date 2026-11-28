// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_toolbar.js — the window toolbar as legacy draws it (bim-compiler prompts/ERP_DEPTH_FILM.md §TB-ICONS). Pure: dictionary rows in, layout out.
//   Port of ADWindowToolbar (org.adempiere.ui.zk/.../adwindow/ADWindowToolbar.java): the button catalogue init() :229-403 + createButton :415-453
//   (theme PNG images/<image>24.png, tooltip = Msg.getMsg(tooltip) + Alt hint), the bar = MToolBarButton.getToolbarButtons("W") (MToolBarButton.java:87-100)
//   filtered by role restriction / advanced flag (hasAccess :1079-1095), IsAddSeparator -> separator, IsShowMore -> overflow popup (:1402-1423).
(function (root) {
  'use strict';
  // name = AD_ToolBarButton.ComponentName; img = theme image stem; msg = AD_Message.Value of the tooltip; alt = accelerator shown after the tooltip.
  var CATALOG = {
    Ignore: { img: 'Ignore', msg: 'Ignore', alt: 'Alt+Z' }, Help: { img: 'Help', msg: 'Help', alt: 'Alt+H' }, New: { img: 'New', msg: 'New', alt: 'Alt+N' },
    Copy: { img: 'Copy', msg: 'Copy', alt: 'Alt+C' }, Delete: { img: 'Delete', msg: 'Delete', alt: 'Alt+D' }, Save: { img: 'Save', msg: 'Save', alt: 'Alt+S' },
    SaveCreate: { img: 'SaveCreate', msg: 'SaveCreate', alt: 'Alt+A' }, Refresh: { img: 'Refresh', msg: 'Refresh', alt: 'Alt+E' }, Find: { img: 'Find', msg: 'Find', alt: 'Alt+F' },
    Attachment: { img: 'Attachment', msg: 'Attachment' }, PostIt: { img: 'PostIt', msg: 'PostIt' }, Chat: { img: 'Chat', msg: 'Chat' }, Label: { img: 'Label', msg: 'Label' },
    Toggle: { img: 'Multi', msg: 'Toggle', alt: 'Alt+T' }, ParentRecord: { img: 'Parent', msg: 'ParentRecord', alt: 'Alt+Up' }, DetailRecord: { img: 'Detail', msg: 'DetailRecord', alt: 'Alt+Down' },
    Report: { img: 'Report', msg: 'Report', alt: 'Alt+R' }, Archive: { img: 'Archive', msg: 'Archive' }, Print: { img: 'Print', msg: 'Print', alt: 'Alt+P' }, Lock: { img: 'Lock', msg: 'Lock' },
    ZoomAcross: { img: 'ZoomAcross', msg: 'ZoomAcross' }, ActiveWorkflows: { img: 'WorkFlow', msg: 'ActiveWorkflows' }, Requests: { img: 'Request', msg: 'Requests' },
    ProductInfo: { img: 'Product', msg: 'ProductInfo' }, Customize: { img: 'Customize', msg: 'Customize' }, Process: { img: 'Process', msg: 'Process', alt: 'Alt+O' },
    QuickForm: { img: 'QuickForm', msg: 'QuickForm' }, AttributeForm: { img: 'AttributeForm', msg: 'AttributeForm' }, Export: { img: 'Export', msg: 'Export' },
    FileImport: { img: 'FileImport', msg: 'FileImport' }, CSVImport: { img: 'CSVImport', msg: 'CSVImport' }, ShowMore: { img: 'ShowMore', msg: 'ShowMore' }
  };
  var MAX_OFFICIAL_ID = 999999;   // MTable.MAX_OFFICIAL_ID
  function yes(v) { return v === 'Y' || v === true || v === 1 || v === '1'; }
  function ord(r) { var s = Number(r.seqno) || 0; return s === 0 ? Number(r.id) : s; }

  // rows: {id, comp, seqno, sep, more, active, advanced, tabId, action, actionClass}; opts: {restricted:[comp], accessAdvanced:bool, role:{canReport,canExport,personalLock}}
  // -> {bar:[{name, sepAfter}], more:[name], skipped:[{name, why}]}.  Rows without a catalogue entry are SKIPPED, never drawn (legacy: buttons.get(name) == null).
  function layout(rows, opts) {
    opts = opts || {}; var restricted = opts.restricted || [], adv = opts.accessAdvanced !== false;
    var list = (rows || []).filter(function (r) { return r.action === 'W' && (r.tabId == null || r.tabId === '') && (Number(r.id) <= MAX_OFFICIAL_ID || r.actionClass) && yes(r.active == null ? 'Y' : r.active); });
    list.sort(function (a, b) { return ord(a) - ord(b) || Number(a.id) - Number(b.id); });
    var out = { bar: [], more: [], skipped: [] }, hasMore = false;
    list.forEach(function (r) {
      if (restricted.indexOf(r.comp) >= 0) { out.skipped.push({ name: r.comp, why: 'restricted' }); return; }
      if (!adv && yes(r.advanced)) { out.skipped.push({ name: r.comp, why: 'advanced' }); return; }
      var rl = opts.role;   // ADWindowToolbar.init creates Report/Archive/Print only for isCanReport (:268-276), Lock only for personal lock (:277-281), Export only for isCanExport (:312-314)
      if (rl && ((rl.canReport === false && /^(Report|Archive|Print)$/.test(r.comp)) || (rl.personalLock === false && r.comp === 'Lock') || (rl.canExport === false && r.comp === 'Export'))) { out.skipped.push({ name: r.comp, why: 'role' }); return; }
      if (!CATALOG[r.comp]) { out.skipped.push({ name: r.comp, why: yes(r.actionClass) || r.actionClass ? 'customization' : 'not-in-catalogue' }); return; }
      if (yes(r.more)) { out.more.push(r.comp); hasMore = true; } else out.bar.push({ name: r.comp, sepAfter: yes(r.sep) });
    });
    if (hasMore) out.bar.push({ name: 'ShowMore', sepAfter: false });   // enableShowMore() appends btnShowMore last
    return out;
  }
  // Tooltip as createButton + the setTooltiptext(... + "    Alt+X") calls: message text, four spaces, accelerator.  msgOf(value) -> AD_Message.MsgText.
  function tooltip(name, msgOf) {
    var c = CATALOG[name]; if (!c) return name;
    var t = msgOf(c.msg) || c.msg; return c.alt ? t + (/^Alt\+(Up|Down)$/.test(c.alt) ? '   ' : '    ') + c.alt : t;   // Parent/Detail use 3 spaces in the Java (:271,:273)
  }
  function imageFile(name) { var c = CATALOG[name]; return c ? c.img + '24.png' : null; }

  // ── The Requests button (bim-compiler prompts/MOBILE_PERF.md WO-35; Witness: W-TOOLBAR-REQUESTS) ──
  //   Port of AbstractADWindowContent.onRequests :3516-3527 -> WRequest (org.adempiere.ui.zk/.../webui/WRequest.java :109-197) over MRequest.getRequestCount :1049-1119 and
  //   MRequest.newRequest :1160-1198 (org.adempiere.base/.../model/MRequest.java). PURE: strings and values in, strings and values out; the host (idempiere.html) reads the rows.
  //   The two lists below ARE the Java's if/else chains, as data keyed by the AD table name (the Java compares AD_Table_ID with Model.Table_ID): no table is named anywhere else.
  var REQUESTS_WINDOW = 232;                                      // SystemIDs.WINDOW_REQUESTS_ALL (SystemIDs.java:230), WRequest :182; the table below is that window's header table
  var REQUEST_TABLE = 'R_Request';
  var REQUEST_COUNT_OR = {                                         // MRequest.getRequestCount :1069-1106: the columns that also count a request for the record
    ad_user: ['AD_User_ID', 'SalesRep_ID'], c_bpartner: ['C_BPartner_ID'], c_order: ['C_Order_ID'], c_invoice: ['C_Invoice_ID'], c_payment: ['C_Payment_ID'],
    m_product: ['M_Product_ID'], c_project: ['C_Project_ID'], c_campaign: ['C_Campaign_ID'], a_asset: ['A_Asset_ID']
  };
  var REQUEST_PREFILL = {                                          // MRequest.newRequest :1169-1198: the column of the NEW request that takes Record_ID
    c_bpartner: 'C_BPartner_ID', ad_user: 'AD_User_ID', c_project: 'C_Project_ID', a_asset: 'A_Asset_ID', c_order: 'C_Order_ID', c_invoice: 'C_Invoice_ID', m_product: 'M_Product_ID',
    c_payment: 'C_Payment_ID', m_inout: 'M_InOut_ID', m_rma: 'M_RMA_ID', c_campaign: 'C_Campaign_ID', r_request: 'R_RequestRelated_ID'
  };
  var REQUEST_PREFILL_FROM_ROW = { c_orderline: 'C_Order_ID' };    // MRequest.newRequest :1199-1205 (FR 2842165): the new request's C_Order_ID is the order of the line (its own C_Order_ID column)
  function reqNum(v) { var n = (v == null || v === '') ? NaN : Number(v); return isFinite(n) ? Math.trunc(n) : -1; }   // GridTable.getKeyID :1043-1060: no key / null -> -1
  function reqLit(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }
  // AbstractADWindowContent.enableRequests(!isNewRow) :2275, isNewRow = rowCount == 0 || isNew :2272; the button is drawn enabled (ADWindowToolbar :307)
  function requestsEnabled(rowCount, isNew) { return !(Number(rowCount) === 0 || isNew === true); }
  // MRequest.getRequestCount's WHERE (:1057-1106), values inlined (the host reads through the tip-shadowed reader, which takes text). recordUU empty -> Record_ID (Util.isEmpty :1060).
  function requestWhere(table, tableId, recordId, recordUU) {
    var t = String(table || '').toLowerCase(), w = "(AD_Table_ID=" + reqNum(tableId) + (recordUU == null || String(recordUU) === '' ? ' AND Record_ID=' + reqNum(recordId) : ' AND Record_UU=' + reqLit(recordUU)) + ')';
    (REQUEST_COUNT_OR[t] || []).forEach(function (c) { w += ' OR ' + c + '=' + reqNum(recordId); });
    return w;
  }
  // the count query (:1107-1110): Processed, COUNT(*) GROUP BY Processed; rows {processed, n} -> [inactive (Processed=Y), active (Processed=N)] (:1121-1128)
  function requestCountSql(where) { return 'SELECT Processed AS processed, COUNT(*) AS n FROM ' + REQUEST_TABLE + ' WHERE ' + where + ' GROUP BY Processed ORDER BY Processed DESC'; }
  function requestCounts(rows) { var c = [0, 0]; (rows || []).forEach(function (r) { c[String(r.processed) === 'Y' ? 0 : 1] += Number(r.n) || 0; }); return c; }
  // WRequest.getRequests :111-137: New always; "Show active Requests (n)" when active > 0; "Show all Requests (a+i)" when inactive > 0. msgOf(value) -> AD_Message.MsgText.
  function requestMenu(msgOf, counts) {
    var out = [{ id: 'new', label: msgOf('RequestNew') }], inactive = counts[0], active = counts[1];
    if (active > 0) out.push({ id: 'active', label: msgOf('RequestActive') + ' (' + active + ')' });
    if (inactive > 0) out.push({ id: 'all', label: msgOf('RequestAll') + ' (' + (active + inactive) + ')' });
    return out;
  }
  // WRequest.onEvent :159-180: the restriction the Request window opens with: active "(where) AND Processed='N'", all "where", new "1=2".
  function requestFilter(id, where) { return id === 'active' ? '(' + where + ") AND Processed='N'" : id === 'all' ? where : '1=2'; }
  // MRequest.newRequest: the columns of the new row, lowercase column -> value. bpartnerId = the current row's C_BPartner_ID (AbstractADWindowContent.onRequests :3520-3523, 0 when none);
  //   rowOf(col) -> the current record's own value (the C_OrderLine branch reads the line's C_Order_ID).
  function requestNewValues(table, tableId, recordId, recordUU, bpartnerId, rowOf) {
    var t = String(table || '').toLowerCase(), v = {};
    v.ad_table_id = reqNum(tableId); v.record_id = reqNum(recordId);                      // :1162-1163
    if (recordUU != null && String(recordUU) !== '') v.record_uu = String(recordUU);       // :1164 (a null UU stays unset)
    if (Number(bpartnerId) > 0) v.c_bpartner_id = Number(bpartnerId);                      // :1166-1167
    if (REQUEST_PREFILL[t]) v[REQUEST_PREFILL[t].toLowerCase()] = reqNum(recordId);        // :1169-1198 (the BPartner case overwrites the line above, as in the Java)
    else if (REQUEST_PREFILL_FROM_ROW[t]) { var o = rowOf ? rowOf(REQUEST_PREFILL_FROM_ROW[t]) : null; if (o != null && o !== '') v[REQUEST_PREFILL_FROM_ROW[t].toLowerCase()] = reqNum(o); }
    return v;
  }
  var requests = { WINDOW: REQUESTS_WINDOW, TABLE: REQUEST_TABLE, COUNT_OR: REQUEST_COUNT_OR, PREFILL: REQUEST_PREFILL, PREFILL_FROM_ROW: REQUEST_PREFILL_FROM_ROW, enabled: requestsEnabled, where: requestWhere,
    countSql: requestCountSql, counts: requestCounts, menu: requestMenu, filter: requestFilter, newValues: requestNewValues };
  var api = { CATALOG: CATALOG, layout: layout, tooltip: tooltip, imageFile: imageFile, IMAGE_DIR: 'theme/default/images/', requests: requests };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AdToolbar = api;
})(typeof window !== 'undefined' ? window : globalThis);
