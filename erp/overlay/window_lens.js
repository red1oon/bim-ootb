// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// window_lens.js — WINDOW ANATOMY LENS (bim-compiler prompts/ERP_DEPTH_FILM.md §WINDOW-LENS; Witness: W-WINDOW-LENS + poc_window_lens_live).
// READ-ONLY "what is this window made of": tabs, fields, buttons, access, numbering — straight from the Application Dictionary, one SQL per line, legacy mechanism cited, INCONCLUSIVE (never OK)
// when a table or the population is absent. It writes nothing and changes no window. PURE: compute(q, windowId, roleId, clientId) with q(sql, params) -> [{lowercase col: value}].
(function (global) {
  'use strict';
  function hasTable(q, t) { try { return q("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=?", [t]).length > 0; } catch (e) { return false; } }
  function line(id, label, cite, status, detail) { return { id: id, label: label, cite: cite, status: status, detail: detail }; }
  function inc(id, label, cite, why) { return line(id, label, cite, 'INCONCLUSIVE', why); }
  function need(q, tables) { return tables.filter(function (t) { return !hasTable(q, t); }); }
  function compute(q, windowId, roleId, clientId) {
    var w = hasTable(q, 'ad_window') ? q("SELECT name, windowtype FROM ad_window WHERE ad_window_id=?", [windowId])[0] : null;
    var rows = [], perTab = [], tabs = 0, fields = 0, displayed = 0;
    // 1 window
    rows.push(!hasTable(q, 'ad_window') ? inc('window', 'Window', 'AD_Window', 'AD_Window not in this bundle') : !w ? line('window', 'Window', 'AD_Window', 'MISSING', 'no AD_Window ' + windowId)
      : line('window', 'Window', 'AD_Window', 'OK', w.name + ' (type ' + (w.windowtype || '?') + ', id ' + windowId + ')'));
    // 2 tabs + 3 fields
    var m1 = need(q, ['ad_tab', 'ad_field']);
    if (m1.length) { rows.push(inc('tabs', 'Tabs', 'AD_Tab', 'table not in this bundle: ' + m1.join(','))); rows.push(inc('fields', 'Fields', 'AD_Field', 'table not in this bundle: ' + m1.join(','))); }
    else {
      var tb = q("SELECT t.ad_tab_id AS id, t.name AS name, t.tablevel AS lvl, t.ad_table_id AS tbl, (SELECT COUNT(*) FROM ad_field f WHERE f.ad_tab_id=t.ad_tab_id AND f.isactive='Y') AS fields, " +
        "(SELECT COUNT(*) FROM ad_field f WHERE f.ad_tab_id=t.ad_tab_id AND f.isactive='Y' AND f.isdisplayed='Y') AS disp FROM ad_tab t WHERE t.ad_window_id=? AND t.isactive='Y' ORDER BY t.seqno", [windowId]);
      tb.forEach(function (t) { perTab.push({ id: t.id, name: t.name, level: t.lvl, table: t.tbl, fields: t.fields, displayed: t.disp }); fields += t.fields; displayed += t.disp; });
      tabs = tb.length;
      rows.push(!tabs ? inc('tabs', 'Tabs', 'AD_Tab (active, by seqno)', 'the window has no active tab (vacuous population)')
        : line('tabs', 'Tabs', 'AD_Tab (active, by seqno)', 'OK', tabs + ': ' + perTab.map(function (t) { return t.name + '(L' + t.level + ')'; }).join(' › ')));
      rows.push(!tabs ? inc('fields', 'Fields', 'AD_Field IsActive / IsDisplayed', 'no tab, nothing to count')
        : line('fields', 'Fields', 'AD_Field IsActive / IsDisplayed', 'OK', fields + ' active, ' + displayed + ' displayed — ' + perTab.map(function (t) { return t.name + ' ' + t.displayed + '/' + t.fields; }).join('; ')));
    }
    // 4 buttons (AD_Reference 28) and the process each runs
    var m4 = need(q, ['ad_tab', 'ad_field', 'ad_column']);
    if (m4.length || !tabs) rows.push(inc('buttons', 'Buttons and the process they run', 'AD_Column AD_Reference_ID=28, AD_Process_ID', m4.length ? 'table not in this bundle: ' + m4.join(',') : 'no tab'));
    else {
      var hp = hasTable(q, 'ad_process');
      var bt = q("SELECT f.name AS fname, c.columnname AS cn, " + (hp ? "(SELECT p.name FROM ad_process p WHERE p.ad_process_id=c.ad_process_id)" : "NULL") + " AS proc FROM ad_field f JOIN ad_tab t ON t.ad_tab_id=f.ad_tab_id JOIN ad_column c ON c.ad_column_id=f.ad_column_id " +
        "WHERE t.ad_window_id=? AND t.isactive='Y' AND f.isactive='Y' AND f.isdisplayed='Y' AND c.ad_reference_id=28 ORDER BY t.seqno, f.seqno", [windowId]);
      rows.push(line('buttons', 'Buttons and the process they run', 'AD_Column AD_Reference_ID=28, AD_Process_ID', 'OK', bt.length + (bt.length ? ': ' + bt.slice(0, 8).map(function (b) { return (b.cn || b.fname) + (b.proc ? '→' + b.proc : ''); }).join(', ') + (bt.length > 8 ? ', …' : '') : ' (none)')));
    }
    // 5 access
    if (need(q, ['ad_window_access']).length) rows.push(inc('access', 'Who can open it', 'AD_Window_Access; MRole window access', 'AD_Window_Access not in this bundle'));
    else {
      var ac = q("SELECT COUNT(DISTINCT ad_role_id) AS n FROM ad_window_access WHERE ad_window_id=? AND isactive='Y'", [windowId])[0].n, mine = roleId == null ? null : q("SELECT isreadwrite AS rw FROM ad_window_access WHERE ad_window_id=? AND ad_role_id=? AND isactive='Y'", [windowId, roleId])[0];
      rows.push(line('access', 'Who can open it', 'AD_Window_Access; MRole window access', ac > 0 ? 'OK' : 'MISSING', ac + ' role(s) hold it' + (roleId == null ? '' : mine ? '; your role: ' + (mine.rw === 'Y' ? 'read-write' : 'read-only') : '; your role: no access')));
    }
    // 6 numbering — tab tables carrying a DocumentNo column
    var m6 = need(q, ['ad_tab', 'ad_table', 'ad_column', 'ad_sequence']);
    if (m6.length || !tabs) rows.push(inc('numbering', 'Document numbering', 'MSequence.getDocumentNo', m6.length ? 'table not in this bundle: ' + m6.join(',') : 'no tab'));
    else {
      var nt = q("SELECT DISTINCT tb.tablename AS tn FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id JOIN ad_column c ON c.ad_table_id=tb.ad_table_id WHERE t.ad_window_id=? AND t.isactive='Y' AND c.columnname='DocumentNo' AND c.isactive='Y'", [windowId]);
      if (!nt.length) rows.push(line('numbering', 'Document numbering', 'MSequence.getDocumentNo', 'OK', 'not a numbered document window (no DocumentNo column on its tables)'));
      else {
        var dts = hasTable(q, 'c_doctype') ? q("SELECT COUNT(*) AS n FROM c_doctype WHERE ad_client_id IN (0,?) AND isactive='Y' AND docnosequence_id IS NOT NULL", [clientId == null ? 0 : clientId])[0].n : null;
        var per = nt.map(function (r) { return r.tn + ': ' + q("SELECT COUNT(*) AS n FROM ad_sequence WHERE name=? AND isactive='Y'", ['DocumentNo_' + r.tn])[0].n + ' table sequence'; });
        rows.push(line('numbering', 'Document numbering', 'MSequence.getDocumentNo (DocType sequence, else DocumentNo_<Table>)', 'OK', per.join('; ') + (dts == null ? '' : '; doc types with their own sequence for this client: ' + dts)));
      }
    }
    // 7 integrity — every tab's AD_Table exists
    if (need(q, ['ad_table']).length || !tabs) rows.push(inc('integrity', 'Every tab has its table', 'AD_Tab.AD_Table_ID', 'AD_Table not in this bundle or no tab'));
    else { var lost = perTab.filter(function (t) { return !q("SELECT 1 AS x FROM ad_table WHERE ad_table_id=?", [t.table]).length; }); rows.push(line('integrity', 'Every tab has its table', 'AD_Tab.AD_Table_ID', lost.length ? 'MISSING' : 'OK', lost.length ? 'tab(s) without a table: ' + lost.map(function (t) { return t.name; }).join(',') : tabs + ' of ' + tabs + ' tabs resolve their table')); }
    var judged = rows.filter(function (r) { return r.status === 'OK' || r.status === 'MISSING'; }).length;
    return { windowId: windowId, name: w ? w.name : null, rows: rows, perTab: perTab, tabs: tabs, fields: fields, displayed: displayed,
      verdict: !tabs ? 'INCONCLUSIVE' : rows.some(function (r) { return r.status === 'MISSING'; }) ? 'GAPS' : rows.some(function (r) { return r.status === 'INCONCLUSIVE'; }) ? 'OK-BUT-UNJUDGED' : 'OK', judged: judged };
  }
  var api = { compute: compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.WindowLens = api;
})(typeof window !== 'undefined' ? window : this);
