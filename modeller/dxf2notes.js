// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2notes.js — general notes of a details sheet (prompts/DXF2BIM_MODELLER_LANE.md §L29). Pure, Node + browser.
// A details sheet has no geometry the body readers use; what it states in TEXT/MTEXT is read here by a fixed grammar, each row with its sheet and handle:
//   concrete grade   f'c = <n> MPa            -> fc_MPa       (every concrete body)
//   steel grade      fy = <n> MPa             -> fy_MPa       (every concrete body)
//   casting ratio    <elements> Casting Ratio = a:b:c   -> CastingRatio on exactly the listed element words (footing, column, grade beam, beam, floor)
// A text that does not match is not a note: nothing is guessed. read(sheets) -> { rows, sheets } ; propsFor(el, rows) -> the Pset_Dxf2Bim rows for one body.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Notes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var WORD = [[/grade\s*beam/i, 'gradebeam'], [/footing/i, 'footing'], [/column/i, 'column'], [/beam/i, 'beam'], [/floor|slab/i, 'slab']];
  function clean(t) { return String(t || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/%%[cC]/g, 'dia').replace(/\s+/g, ' ').trim(); }
  function kindsOf(s) {   // element words in a text, longest word first, each source word consumed once ("Grade Beam" is not also "Beam")
    var out = [], rest = s; WORD.forEach(function (w) { if (w[0].test(rest)) { out.push(w[1]); rest = rest.replace(new RegExp(w[0].source, 'ig'), ' '); } }); return out;
  }
  function readSheet(sh) {
    var rows = [];
    ((sh.dxf && sh.dxf.entities) || []).forEach(function (e) {
      if (e.type !== 'TEXT' && e.type !== 'MTEXT') return;
      var t = clean(e.text), m, base = { sheet: sh.name, handle: String(e.handle || ''), text: t };
      m = /f['’]?c\s*=\s*([\d.]+)\s*mpa/i.exec(t); if (m) rows.push(Object.assign({ key: 'fc_MPa', value: m[1], kinds: ['concrete'] }, base));
      m = /\bfy\s*=\s*([\d.]+)\s*mpa/i.exec(t); if (m) rows.push(Object.assign({ key: 'fy_MPa', value: m[1], kinds: ['concrete'] }, base));
      m = /^(.*?)casting\s*ratio\s*=\s*(\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){1,3})/i.exec(t);
      if (m) { var ks = kindsOf(m[1]); if (ks.length) rows.push(Object.assign({ key: 'CastingRatio', value: m[2], kinds: ks }, base)); }
    });
    return rows;
  }
  // ---- schedules (§L30) ----
  var STIR = /@.*\(([AB])\)\s*$/i;
  function pt(e) { var p = e.position || e.startPoint || e.anchorPoint; return p && isFinite(p.x) && isFinite(p.y) ? { x: p.x, y: p.y } : null; }
  function slug(h) { return String(h).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_x_/gi, '_x_'); }
  function readSchedules(sh) {
    var items = [], out = { tables: [], unassigned: [], gaps: [] };
    ((sh.dxf && sh.dxf.entities) || []).forEach(function (e) { if (e.type !== 'TEXT' && e.type !== 'MTEXT') return; var p = pt(e), t = clean(e.text); if (p && t) items.push({ t: t, x: p.x, y: p.y, h: String(e.handle || '') }); });
    var titles = items.filter(function (i) { return /^[A-Za-z ]+\s+schedule$/i.test(i.t); });
    titles.forEach(function (ti) {
      var kind = kindsOf(ti.t.replace(/\s*schedule$/i, ''))[0]; if (!kind) return;
      var box = items.filter(function (i) { return i !== ti && i.x >= ti.x - 40 && i.x <= ti.x + 300 && i.y <= ti.y + 2 && i.y >= ti.y - 70; });
      if (box.some(function (i) { return titles.indexOf(i) >= 0; })) { out.gaps.push({ code: 'GAP:schedule_title_inside_table', detail: ti.t + ' on ' + sh.name }); return; }
      if (box.length < 2) return;
      var ys = box.map(function (i) { return i.y; }).sort(function (a, b) { return b - a; }), bands = [[ys[0]]];
      for (var k = 1; k < ys.length; k++) { var cur = bands[bands.length - 1]; if (cur[cur.length - 1] - ys[k] <= 5) cur.push(ys[k]); else bands.push([ys[k]]); }
      if (bands.length < 2) return;
      var lo = bands[bands.length - 1], yLo = Math.min.apply(null, lo) - 0.001, yHi = Math.max.apply(null, lo) + 0.001;
      var data = box.filter(function (i) { return i.y >= yLo && i.y <= yHi; }), heads = box.filter(function (i) { return i.y > yHi; }), cells = {}, order = [];
      data.sort(function (a, b) { return a.x - b.x; }).forEach(function (c) {
        var h = heads.map(function (q) { return { q: q, d: Math.abs(q.x - c.x) }; }).sort(function (a, b) { return a.d - b.d; })[0], name = null;
        if (h && h.d <= 6) name = slug(h.q.t);
        else { var m = STIR.exec(c.t); if (m) name = 'Stirrup_' + m[1].toUpperCase(); }
        if (!name) { out.unassigned.push({ sheet: sh.name, handle: c.h, text: c.t, why: 'no header within 6 units and no own role' }); return; }
        if (cells[name]) { out.unassigned.push({ sheet: sh.name, handle: c.h, text: c.t, why: 'header ' + name + ' already has a cell' }); return; }
        cells[name] = { text: c.t, handle: c.h }; order.push(name);
      });
      if (cells.Type) out.tables.push({ kind: kind, title: ti.t, sheet: sh.name, handle: ti.h, cells: cells, order: order });
    });
    return out;
  }
  function inchesOf(t) {   // feet-inches grammar of the sheets: 4'-0", 12", 2'-5" -> metres; null when it is not a length
    var m = /^(?:(\d+(?:\.\d+)?)')?-?(?:(\d+(?:\.\d+)?)")?$/.exec(String(t).trim()); if (!m || (m[1] === undefined && m[2] === undefined)) return null;
    return ((Number(m[1] || 0) * 12) + Number(m[2] || 0)) * 0.0254;
  }
  function sectionOf(text) {   // `W" x D"` -> { x, y } metres, or null
    var m = /^(.+?)\s*x\s*(.+)$/i.exec(String(text).trim()); if (!m) return null; var a = inchesOf(m[1]), b = inchesOf(m[2]); return a && b ? { x: a, y: b } : null;
  }
  function schedules(sheets) {
    var tables = [], unassigned = [], gaps = [];
    (sheets || []).forEach(function (sh) { var r = readSchedules(sh); tables = tables.concat(r.tables); unassigned = unassigned.concat(r.unassigned); gaps = gaps.concat(r.gaps); });
    var derived = {}, below = tables.filter(function (t) { return t.kind === 'column' && t.cells.Below_Gr; })[0];
    if (below && !derived.belowgrade) { var sc = sectionOf(below.cells.Below_Gr.text);
      if (!sc) gaps.push({ code: 'GAP:synth_column_belowgrade_unreadable', detail: 'Below_Gr cell "' + below.cells.Below_Gr.text + '" is not a W x D section' });
      else if (Math.abs(sc.x - sc.y) > 1e-9) gaps.push({ code: 'GAP:synth_column_belowgrade_not_square', detail: 'Below_Gr cell "' + below.cells.Below_Gr.text + '" is not square: the section is not applied' });
      else derived.belowgrade = { value: Number(sc.x.toFixed(6)), by: below.sheet + '#' + below.cells.Below_Gr.handle }; }
    return { tables: tables, unassigned: unassigned, gaps: gaps, derived: derived };
  }
  // props of one body from the schedules: the row whose Type equals the body's type name, else (the only row of its kind AND the body has no type name) with the basis stated
  function schedProps(el, tables) {
    var out = {}, k = el.kind, part = !!el.part_of, tn = part ? el.part_type : (el.ifc && el.ifc.type_name), mine = (tables || []).filter(function (t) { return t.kind === k; });
    mine.forEach(function (t) {
      var byType = tn && t.cells.Type.text === tn, single = !tn && mine.length === 1;
      if (!byType && !single) return;
      var P = 'Sched_' + k.charAt(0).toUpperCase() + k.slice(1) + '_';
      t.order.forEach(function (n) { out[P + n] = t.cells[n].text; });
      out['SchedSource_' + k] = t.sheet + '#' + t.handle; out['SchedBasis_' + k] = byType ? 'type name equals the schedule Type' : (part ? 'single schedule row; the drawn column it is part of has no type name' : 'single schedule row; the body has no type name');
    });
    return out;
  }
  function read(sheets) { var rows = [], from = []; (sheets || []).forEach(function (sh) { var r = readSheet(sh); if (r.length || readSchedules(sh).tables.length) { rows = rows.concat(r); from.push(sh.name); } }); return { rows: rows, sheets: from, schedules: schedules(sheets) }; }
  // a sheet with no role that states at least one note is a notes sheet (accepted, not refused)
  function isNotes(sh) { return !sh.role && (readSheet(sh).length > 0 || readSchedules(sh).tables.length > 0); }
  // the rows that apply to one body: 'concrete' = a body whose material names concrete; otherwise the body's own kind (a pad or slab is kind slab)
  function propsFor(el, rows) {
    var out = {}, concrete = !!(el.ifc && /concrete/i.test(el.ifc.material || '')), k = el.kind;
    (rows || []).forEach(function (r) { if (r.kinds.indexOf('concrete') >= 0 ? concrete : r.kinds.indexOf(k) >= 0) { out['Note_' + r.key] = r.value; out['NoteSource_' + r.key] = r.sheet + '#' + r.handle; } });
    return out;
  }
  return { read: read, readSheet: readSheet, isNotes: isNotes, propsFor: propsFor, clean: clean, readSchedules: readSchedules, schedules: schedules, schedProps: schedProps, sectionOf: sectionOf };
});
