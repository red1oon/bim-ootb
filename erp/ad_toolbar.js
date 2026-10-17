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
  var api = { CATALOG: CATALOG, layout: layout, tooltip: tooltip, imageFile: imageFile, IMAGE_DIR: 'theme/default/images/' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AdToolbar = api;
})(typeof window !== 'undefined' ? window : globalThis);
