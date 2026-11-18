/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// export_menu.js — the Viewer's ONE Export menu (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(a); witness viewer/tests/witness_viewer_export_menu.js).
// The toolbar pill id 'save' (panels.js) opens it. Five items, no new writer (step (b2) added Schedule and 5D cost): Schedule = window.tmExportSchedule (tm_gantt_edit.js: the Time Machine drawer's own MSP / PMXML / XER writers), 5D cost = A.export4D5D({exportKind:'5d'}) (boq_charts.html writes the workbook with its own save5D()). Items 1-3: Building (.db) = A.saveModelDb (scene.js, Ctrl+S unchanged), IFC (scope chips: Whole building | Find selection (N), step (c)) =
// A.exportIfcShared (ifc_export_shared.js: the Modeller's lod_ifc.js writer fed with the open building, monolith or split meta+geo; step (b) of prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md), BCF (issues) = A.exportBcf (bcf_export.js).
// The panel is the Modeller Export pill's idiom (modeller.html initExportMenu): same panel, hover row, outside-click close. Every user-visible action logs §VIEWER_EXPORT_MENU.
function setupExportMenu(A) {
  'use strict';
  var panel = null, anchorEl = null, opening = false;
  var schedKind = 'msp';   // MSP (default) | PMXML | XER, kept per page like A.ifcSchemaChoice
  A.scheduleKindChoice = function () { return schedKind; };
  var ifcScope = 'whole';   // IFC scope chip (step (c)): whole | selection; 'selection' counts only while Find's isolate holds elements, else the effective scope falls back to whole
  // what Find has isolated: A.activeGuidFilter as a Set with size > 0 (an EMPTY set is "nothing isolated": the merged-ghost lens uses filterByGuids(new Set()))
  function isoCount() { var f = A.activeGuidFilter; return (f && typeof f.has === 'function' && f.size > 0) ? f.size : 0; }
  function effScope() { return (ifcScope === 'selection' && isoCount() > 0) ? 'selection' : 'whole'; }
  A.ifcScopeChoice = effScope;
  function T(key, dflt, repl) { var s = (typeof window._trl === 'function') ? window._trl(key, repl || null, dflt) : dflt; if (repl && s === dflt) for (var k in repl) s = s.replace('{' + k + '}', repl[k]); return s; }

  // The IFC item needs the building's element tables and a geometry table: in A.db (a monolith) or in A.libDb (a split meta+geo pair).
  function ifcInput() {
    if (!A.db) return { ok: false, why: 'no_building' };
    if (!window.LodIfc || !window.LodReader || !A.exportIfcShared) return { ok: false, why: 'writer_not_loaded' };
    try {
      var has = function (db, t) { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0; };
      var geo = (A.libDb && A.libDb !== A.db) ? A.libDb : A.db;
      if (!has(A.db, 'elements_meta') || !has(A.db, 'element_instances') || !has(A.db, 'element_transforms') || !(has(geo, 'component_geometries') || has(geo, 'base_geometries'))) return { ok: false, why: 'no_geometry_tables' };
    } catch (e) { return { ok: false, why: 'unreadable' }; }
    return { ok: true };
  }
  // The Schedule item exists only when a schedule does: the same read the drawer buttons start from (ScheduleAuthor.wbsTree on the schedule the drawer would pick). READ-ONLY: activeSchedule + wbsTree
  // never write, and the menu never generates a schedule (the first one is born from a real Time Machine open, tmHasExistingSchedule rule).
  function scheduleInput() {
    if (!A.db) return { ok: false, why: 'no_building' };
    var SA = window.ScheduleAuthor;
    if (!SA || !SA.wbsTree) return { ok: false, why: 'no_schedule' };
    var id = 'SCH_AUTHORED', n = 0;
    try { var act = SA.activeSchedule && SA.activeSchedule(A.db); if (act && act.id) id = act.id; n = SA.wbsTree(A.db, id).length; } catch (e) { n = 0; }
    if (!n) return { ok: false, why: 'no_schedule' };
    if (typeof window.tmExportSchedule !== 'function') return { ok: false, why: 'writer_not_loaded' };
    return { ok: true, id: id };
  }
  async function states() {
    var ifc = ifcInput(), sch = scheduleInput(), n = 0, iso = isoCount(), scope = effScope();
    try { n = (await A._getAllIssues()).length; } catch (e) { n = 0; }
    return [
      { key: 'db', label: T('ui_exp_db', 'Building (.db)'), sub: T('pill_save', 'Save Building') + ' · Ctrl+S', enabled: !!A.db, why: A.db ? '' : 'no_building' },
      { key: 'ifc', label: 'IFC', sub: ifc.ok ? (scope === 'selection' ? T('ui_exp_scope_find_tip', 'the {n} elements Find has isolated', { n: iso }) : T('ui_exp_ifc_tip', 'the whole building')) + ' · .ifc' : T('ui_exp_ifc_none', 'needs a building with geometry tables'), tip: scope === 'selection' ? T('ui_exp_scope_find_tip', 'the {n} elements Find has isolated', { n: iso }) : T('ui_exp_ifc_tip', 'the whole building'), schema: ifc.ok, scopes: ifc.ok, iso: iso, scope: scope, enabled: ifc.ok, why: ifc.ok ? '' : ifc.why },
      { key: 'bcf', label: T('ui_exp_bcf', 'BCF (issues)'), sub: n ? n + ' · .bcfzip' : T('ui_exp_bcf_none', 'no saved issues'), enabled: n > 0, why: n ? '' : 'no_saved_issues', issues: n },
      { key: 'schedule', label: T('ui_exp_sched', 'Schedule'), sub: sch.ok ? T('ui_exp_sched_tip', 'the building\'s work schedule, for MS Project or Primavera P6') : T('ui_exp_sched_none', 'open the Time Machine once to make the schedule'), tip: T('ui_exp_sched_tip', 'the building\'s work schedule, for MS Project or Primavera P6'), kinds: sch.ok, enabled: sch.ok, why: sch.ok ? '' : sch.why },
      { key: 'cost5d', label: T('ui_exp_5d', '5D cost'), sub: T('ui_exp_5d_tip', 'cost workbook (Excel): bill of quantities, materials, labour, equipment') + ' · .xlsx', tip: T('ui_exp_5d_tip', 'cost workbook (Excel): bill of quantities, materials, labour, equipment'), enabled: !!(A.db && A.activeBuilding), why: (A.db && A.activeBuilding) ? '' : 'no_building' }
    ];
  }
  async function run(key) {
    if (key === 'db') { console.log('§VIEWER_EXPORT_MENU item=db action=saveModelDb'); if (A.saveModelDb) return A.saveModelDb(); }
    else if (key === 'ifc') {
      var name = (A.activeBuilding || 'building'), schema = A.ifcSchemaChoice ? A.ifcSchemaChoice() : 'IFC4', scope = effScope(), nIfc = scope === 'selection' ? isoCount() : -1;
      if (scope === 'whole') { try { var rr = A.db.exec('SELECT COUNT(*) FROM elements_meta'); nIfc = rr.length ? rr[0].values[0][0] : 0; } catch (e) { nIfc = 0; } }
      console.log('§VIEWER_EXPORT_MENU item=ifc action=exportIfcShared building=' + name + ' scope=' + scope + ' n=' + nIfc + ' schema=' + schema);
      if (A.exportIfcShared) return A.exportIfcShared({ name: name, schema: schema, scope: scope });
    } else if (key === 'bcf') { console.log('§VIEWER_EXPORT_MENU item=bcf action=exportBcf'); if (A.exportBcf) return A.exportBcf(); }
    else if (key === 'schedule') {
      console.log('§VIEWER_EXPORT_MENU item=schedule action=tmExportSchedule kind=' + schedKind);
      if (typeof window.tmExportSchedule !== 'function') return;
      var r = await window.tmExportSchedule(schedKind);
      if (A.status) A.status.textContent = r && r.ok ? (r.msg || (r.file + ': ' + r.tasks + ' tasks / ' + r.links + ' links')) : T('ui_exp_sched_none', 'open the Time Machine once to make the schedule');
      console.log('§VIEWER_EXPORT_MENU item=schedule result=' + (r && r.ok ? 'ok file=' + r.file + ' tasks=' + r.tasks + ' links=' + r.links : 'refused why=' + (r && r.why)));
    } else if (key === 'cost5d') {
      console.log('§VIEWER_EXPORT_MENU item=cost5d action=export4D5D export=5d');
      if (A.export4D5D) return A.export4D5D({ exportKind: '5d' });
    }
  }
  // IFC4 (default) / IFC2X3: two small buttons inside the IFC row (not rows of their own: the menu keeps exactly five items); a tap on one chooses the schema and does not export.
  // The Schedule row's MSP / PMXML / XER toggle is the same idiom (data-kind in place of data-schema; a tap chooses the format and does not export).
  function schemaToggle() { return chips('ve-sch', 'data-schema', ['IFC4', 'IFC2X3'], A.ifcSchemaChoice ? A.ifcSchemaChoice() : 'IFC4'); }
  function kindToggle() { return chips('ve-kind', 'data-kind', ['MSP', 'PMXML', 'XER'], schedKind.toUpperCase()); }
  // IFC scope chips (step (c)): Whole building | Find selection (N), under the row's label; the Find chip is disabled (data-why=no_isolate) when nothing is isolated, with the plain hint beneath.
  // A tap on a chip chooses the scope and never exports.
  function scopeChips(it) {
    function chip(val, text, on, off) {
      return '<span class="ve-scope" data-scope="' + val + '" data-disabled="' + (off ? '1' : '0') + '"' + (off ? ' data-why="no_isolate" title="' + esc(T('ui_exp_scope_none', 'Find and isolate first')) + '"' : '') + ' aria-pressed="' + on + '" aria-disabled="' + (off ? 'true' : 'false') + '" style="padding:2px 6px;border-radius:6px;font-size:10px;margin-right:4px;display:inline-block;margin-top:3px;cursor:' + (off ? 'not-allowed' : 'pointer') + ';opacity:' + (off ? '.45' : '1') +
        ';border:1px solid ' + (on ? '#5b8def' : '#2c303a') + ';color:' + (on ? '#dfe6f5' : '#7b8494') + ';background:' + (on ? '#26324a' : 'transparent') + '">' + esc(text) + '</span>';
    }
    var off = !it.iso;
    return '<br>' + chip('whole', T('ui_exp_scope_whole', 'Whole building'), it.scope === 'whole', false) + chip('selection', T('ui_exp_scope_find', 'Find selection ({n})', { n: it.iso }), it.scope === 'selection', off) +
      (off ? '<br><span class="ve-hint" style="color:#5b6473;font-size:10.5px">' + esc(T('ui_exp_scope_none', 'Find and isolate first')) + '</span>' : '');
  }
  function chips(cls, attr, list, cur) {
    return '<span class="ve-schema" style="margin-left:auto;display:flex;gap:4px">' + list.map(function (s) {
      return '<span class="' + cls + '" ' + attr + '="' + s + '" aria-pressed="' + (s === cur) + '" style="padding:2px 6px;border-radius:6px;font-size:10px;border:1px solid ' + (s === cur ? '#5b8def' : '#2c303a') + ';color:' + (s === cur ? '#dfe6f5' : '#7b8494') + ';background:' + (s === cur ? '#26324a' : 'transparent') + '">' + s + '</span>';
    }).join('') + '</span>';
  }
  function close() { if (panel) panel.style.display = 'none'; if (anchorEl) anchorEl.classList.remove('on'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function place() {
    if (!panel || !anchorEl) return;
    var r = anchorEl.getBoundingClientRect(), pw = panel.offsetWidth || 272, ph = panel.offsetHeight || 260;
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
        panel.style.cssText = 'position:fixed;z-index:10050;width:272px;max-width:calc(100vw - 16px);display:none;padding:10px;background:rgba(20,22,30,0.94);border:1px solid #2c303a;border-radius:12px;color:#c7cdd8;' +
          'font:12px system-ui,sans-serif;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 30px rgba(0,0,0,0.5)';
        document.body.appendChild(panel);
      }
      var h = '<div style="font-size:10px;letter-spacing:.14em;color:#5b6473;margin:2px 4px 8px;text-transform:uppercase">' + esc(T('pill_export', 'Export')) + '</div>';
      items.forEach(function (it) {
        h += '<div class="ve-row" data-key="' + it.key + '" data-disabled="' + (it.enabled ? '0' : '1') + '" data-why="' + esc(it.why) + '" aria-disabled="' + (it.enabled ? 'false' : 'true') + '" style="display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:8px;' +
          'cursor:' + (it.enabled ? 'pointer' : 'not-allowed') + ';opacity:' + (it.enabled ? '1' : '.45') + '"' + (it.tip ? ' title="' + esc(it.tip) + '"' : '') + '><span class="ve-label" style="flex:1;min-width:0">' + esc(it.label) + '<br><span class="ve-sub" style="color:#5b6473;font-size:10.5px">' + esc(it.sub) + '</span>' + (it.scopes ? scopeChips(it) : '') + '</span>' +
          (it.schema ? schemaToggle() : '') + (it.kinds ? kindToggle() : '') + '</div>';
      });
      panel.innerHTML = h;
      Array.prototype.forEach.call(panel.querySelectorAll('.ve-sch'), function (b) {
        b.onclick = function (e) {
          e.stopPropagation(); var s = b.getAttribute('data-schema'); if (A.setIfcSchemaChoice) A.setIfcSchemaChoice(s); console.log('§VIEWER_EXPORT_MENU ifc_schema=' + s);
          Array.prototype.forEach.call(panel.querySelectorAll('.ve-sch'), function (o) { var on = o.getAttribute('data-schema') === s; o.setAttribute('aria-pressed', on); o.style.borderColor = on ? '#5b8def' : '#2c303a'; o.style.color = on ? '#dfe6f5' : '#7b8494'; o.style.background = on ? '#26324a' : 'transparent'; });
        };
      });
      Array.prototype.forEach.call(panel.querySelectorAll('.ve-scope'), function (b) {
        b.onclick = function (e) {
          e.stopPropagation(); var v = b.getAttribute('data-scope');
          if (b.getAttribute('data-disabled') === '1') { console.log('§VIEWER_EXPORT_MENU item=ifc blocked reason=' + b.getAttribute('data-why')); return; }
          ifcScope = v; console.log('§VIEWER_EXPORT_MENU ifc_scope=' + v);
          Array.prototype.forEach.call(panel.querySelectorAll('.ve-scope'), function (o) { var on = o.getAttribute('data-scope') === v; o.setAttribute('aria-pressed', on); o.style.borderColor = on ? '#5b8def' : '#2c303a'; o.style.color = on ? '#dfe6f5' : '#7b8494'; o.style.background = on ? '#26324a' : 'transparent'; });
          var sub = panel.querySelector('.ve-row[data-key="ifc"] .ve-sub'), row = panel.querySelector('.ve-row[data-key="ifc"]');
          if (sub && row) { var tipTxt = v === 'selection' ? T('ui_exp_scope_find_tip', 'the {n} elements Find has isolated', { n: isoCount() }) : T('ui_exp_ifc_tip', 'the whole building'); sub.textContent = tipTxt + ' · .ifc'; row.setAttribute('title', tipTxt); }
        };
      });
      Array.prototype.forEach.call(panel.querySelectorAll('.ve-kind'), function (b) {
        b.onclick = function (e) {
          e.stopPropagation(); var k = b.getAttribute('data-kind'); schedKind = k.toLowerCase(); console.log('§VIEWER_EXPORT_MENU schedule_kind=' + schedKind);
          Array.prototype.forEach.call(panel.querySelectorAll('.ve-kind'), function (o) { var on = o.getAttribute('data-kind') === k; o.setAttribute('aria-pressed', on); o.style.borderColor = on ? '#5b8def' : '#2c303a'; o.style.color = on ? '#dfe6f5' : '#7b8494'; o.style.background = on ? '#26324a' : 'transparent'; });
        };
      });
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
      A._exportMenuIfc = (function () { var i = items.filter(function (x) { return x.key === 'ifc'; })[0]; return i && { scope: i.scope, iso: i.iso, findChipEnabled: !!i.iso }; })();
      console.log('§VIEWER_EXPORT_MENU open=true items=' + items.length + ' enabled=' + items.filter(function (i) { return i.enabled; }).map(function (i) { return i.key; }).join(',') +
        ' blocked=' + items.filter(function (i) { return !i.enabled; }).map(function (i) { return i.key + ':' + i.why; }).join(',') + ' ifc_scope=' + (items[1].scope || 'whole') + ' find_chip=' + (items[1].iso ? 'enabled n=' + items[1].iso : 'disabled why=no_isolate'));
    } finally { opening = false; }
  };
  document.addEventListener('pointerdown', function (e) {
    if (panel && panel.style.display === 'block' && !panel.contains(e.target) && !(anchorEl && anchorEl.contains(e.target))) { close(); console.log('§VIEWER_EXPORT_MENU open=false by=outside'); }
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && panel.style.display === 'block') { close(); console.log('§VIEWER_EXPORT_MENU open=false by=escape'); } });
  console.log('§VIEWER_EXPORT_MENU_MODULE loaded');
}
