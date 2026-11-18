/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// export_menu.js — the Viewer's ONE Export menu (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(a); witness viewer/tests/witness_viewer_export_menu.js).
// The toolbar pill id 'save' (panels.js) opens it. Three items, no new writer: Building (.db) = A.saveModelDb (scene.js, Ctrl+S unchanged), IFC (whole building) =
// A.exportIFC (import.js, same worker; the open building's own bytes when it is not an IndexedDB import), BCF (issues) = A.exportBcf (bcf_export.js).
// The panel is the Modeller Export pill's idiom (modeller.html initExportMenu): same panel, hover row, outside-click close. Every user-visible action logs §VIEWER_EXPORT_MENU.
function setupExportMenu(A) {
  'use strict';
  var panel = null, anchorEl = null, opening = false;
  function T(key, dflt) { return (typeof window._trl === 'function') ? window._trl(key, null, dflt) : dflt; }

  // The bytes the IFC worker reads: only a single-file building that carries the extractor's geometry tables (element_instances + component_geometries).
  function ifcInput() {
    if (!A.db) return { ok: false, why: 'no_building' };
    if (A.libDb && A.libDb !== A.db) return { ok: false, why: 'split' };
    try {
      var r = A.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('element_instances','component_geometries','elements_meta')");
      if (!r.length || r[0].values.length < 3) return { ok: false, why: 'no_geometry_tables' };
    } catch (e) { return { ok: false, why: 'unreadable' }; }
    return { ok: true };
  }
  async function states() {
    var ifc = ifcInput(), n = 0;
    try { n = (await A._getAllIssues()).length; } catch (e) { n = 0; }
    return [
      { key: 'db', label: T('ui_exp_db', 'Building (.db)'), sub: T('pill_save', 'Save Building') + ' · Ctrl+S', enabled: !!A.db, why: A.db ? '' : 'no_building' },
      { key: 'ifc', label: T('ui_exp_ifc', 'IFC (whole building)'), sub: ifc.ok ? '.ifc' : T('ui_exp_ifc_none', 'needs a single-file building with geometry tables'), enabled: ifc.ok, why: ifc.ok ? '' : ifc.why },
      { key: 'bcf', label: T('ui_exp_bcf', 'BCF (issues)'), sub: n ? n + ' · .bcfzip' : T('ui_exp_bcf_none', 'no saved issues'), enabled: n > 0, why: n ? '' : 'no_saved_issues', issues: n }
    ];
  }
  async function run(key) {
    if (key === 'db') { console.log('§VIEWER_EXPORT_MENU item=db action=saveModelDb'); if (A.saveModelDb) return A.saveModelDb(); }
    else if (key === 'ifc') {
      var name = (A.activeBuilding || 'building');
      console.log('§VIEWER_EXPORT_MENU item=ifc action=exportIFC building=' + name + ' scope=whole');
      if (A.exportIFC) return A.exportIFC(name, { dbBytes: A.db.export() });
    } else if (key === 'bcf') { console.log('§VIEWER_EXPORT_MENU item=bcf action=exportBcf'); if (A.exportBcf) return A.exportBcf(); }
  }
  function close() { if (panel) panel.style.display = 'none'; if (anchorEl) anchorEl.classList.remove('on'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function place() {
    if (!panel || !anchorEl) return;
    var r = anchorEl.getBoundingClientRect(), pw = panel.offsetWidth || 248, ph = panel.offsetHeight || 180;
    var right = Math.max(8, window.innerWidth - r.left + 10), top = Math.min(Math.max(8, r.bottom - ph), Math.max(8, window.innerHeight - ph - 8));
    if (r.width === 0 && r.height === 0) { right = 70; top = Math.max(8, window.innerHeight - ph - 74); }
    panel.style.right = right + 'px'; panel.style.top = top + 'px';
  }
  A.openExportMenu = async function (anchor) {
    if (opening) return; opening = true;
    try {
      anchorEl = anchor || document.getElementById('pill-save');
      if (panel && panel.style.display === 'block') { close(); console.log('§VIEWER_EXPORT_MENU open=false'); return; }
      var items = await states();
      if (!panel) {
        panel = document.createElement('div'); panel.id = 'v-export-panel';
        panel.style.cssText = 'position:fixed;z-index:10050;width:248px;max-width:calc(100vw - 16px);display:none;padding:10px;background:rgba(20,22,30,0.94);border:1px solid #2c303a;border-radius:12px;color:#c7cdd8;' +
          'font:12px system-ui,sans-serif;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 30px rgba(0,0,0,0.5)';
        document.body.appendChild(panel);
      }
      var h = '<div style="font-size:10px;letter-spacing:.14em;color:#5b6473;margin:2px 4px 8px;text-transform:uppercase">' + esc(T('pill_export', 'Export')) + '</div>';
      items.forEach(function (it) {
        h += '<div class="ve-row" data-key="' + it.key + '" data-disabled="' + (it.enabled ? '0' : '1') + '" data-why="' + esc(it.why) + '" aria-disabled="' + (it.enabled ? 'false' : 'true') + '" style="display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:8px;' +
          'cursor:' + (it.enabled ? 'pointer' : 'not-allowed') + ';opacity:' + (it.enabled ? '1' : '.45') + '"><span class="ve-label">' + esc(it.label) + '<br><span class="ve-sub" style="color:#5b6473;font-size:10.5px">' + esc(it.sub) + '</span></span></div>';
      });
      panel.innerHTML = h;
      Array.prototype.forEach.call(panel.querySelectorAll('.ve-row'), function (d) {
        d.onmouseover = function () { if (d.getAttribute('data-disabled') === '0') d.style.background = '#23262e'; };
        d.onmouseout = function () { d.style.background = 'transparent'; };
        d.onclick = function (e) {
          e.stopPropagation(); var key = d.getAttribute('data-key');
          if (d.getAttribute('data-disabled') === '1') { console.log('§VIEWER_EXPORT_MENU item=' + key + ' blocked reason=' + d.getAttribute('data-why')); return; }
          close(); run(key);
        };
      });
      panel.style.display = 'block'; place(); if (anchorEl) anchorEl.classList.add('on');
      A._exportMenuState = items.map(function (it) { return { key: it.key, enabled: it.enabled, why: it.why }; });
      console.log('§VIEWER_EXPORT_MENU open=true items=' + items.length + ' enabled=' + items.filter(function (i) { return i.enabled; }).map(function (i) { return i.key; }).join(',') +
        ' blocked=' + items.filter(function (i) { return !i.enabled; }).map(function (i) { return i.key + ':' + i.why; }).join(','));
    } finally { opening = false; }
  };
  document.addEventListener('pointerdown', function (e) {
    if (panel && panel.style.display === 'block' && !panel.contains(e.target) && !(anchorEl && anchorEl.contains(e.target))) { close(); console.log('§VIEWER_EXPORT_MENU open=false by=outside'); }
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && panel.style.display === 'block') { close(); console.log('§VIEWER_EXPORT_MENU open=false by=escape'); } });
  console.log('§VIEWER_EXPORT_MENU_MODULE loaded');
}
