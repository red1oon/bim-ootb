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
  function read(sheets) { var rows = [], from = []; (sheets || []).forEach(function (sh) { var r = readSheet(sh); if (r.length) { rows = rows.concat(r); from.push(sh.name); } }); return { rows: rows, sheets: from }; }
  // a sheet with no role that states at least one note is a notes sheet (accepted, not refused)
  function isNotes(sh) { return !sh.role && readSheet(sh).length > 0; }
  // the rows that apply to one body: 'concrete' = a body whose material names concrete; otherwise the body's own kind (a pad or slab is kind slab)
  function propsFor(el, rows) {
    var out = {}, concrete = !!(el.ifc && /concrete/i.test(el.ifc.material || '')), k = el.kind;
    (rows || []).forEach(function (r) { if (r.kinds.indexOf('concrete') >= 0 ? concrete : r.kinds.indexOf(k) >= 0) { out['Note_' + r.key] = r.value; out['NoteSource_' + r.key] = r.sheet + '#' + r.handle; } });
    return out;
  }
  return { read: read, readSheet: readSheet, isNotes: isNotes, propsFor: propsFor, clean: clean };
});
