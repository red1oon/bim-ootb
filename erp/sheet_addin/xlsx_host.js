// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// xlsx_host.js - the sheet-door HOST INTERFACE (host_shim.js) over a workbook FILE held in memory by SheetJS: the host of file_it.html, where no
// spreadsheet program is running. Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §9 (slice S3b) - Witness: W-FILE-IT. UMD (node + browser).
// It adds nothing to the shim's results: it turns SheetJS cells into the interface's plain values and back. A cell reaches the engine the way the Excel
// layer hands it over (ONE rule, excel_host.js engineValue): a date-formatted number as its ISO day, a number at Excel's 15 significant digits.
// The workbook must be read with XH.READ ({ cellNF, cellFormula, sheetStubs }) so number formats, formulas and formula cells WITHOUT a saved result are there (§12: noSavedResult).
(function (global) {
  'use strict';

  // create(XLSX, wb, deps): deps = { engineValue (excel_host.js), userName? }
  function create(XLSX, wb, deps) {
    var ev = deps.engineValue, who = deps.userName || 'unknown';
    function meta(i) { wb.Workbook = wb.Workbook || {}; var a = wb.Workbook.Sheets = wb.Workbook.Sheets || []; while (a.length <= i) a.push({ Hidden: 0 }); return a[i]; }
    function visibleNames() { return wb.SheetNames.filter(function (n, i) { return !meta(i).Hidden; }); }
    function ws(name) { var s = wb.Sheets[name]; if (!s) throw new Error('this workbook has no sheet named ' + name); return s; }
    function strRow(row) { var o = row.map(function (c) { return c == null ? '' : String(c); }); while (o.length && o[o.length - 1] === '') o.pop(); return o; }

    // a stub (t 'z') is a formula cell the file holds NO result for: SheetJS gives it v 0, which is not a saved result (§12 Rule 1)
    function hasValue(c) { return !!c && c.t !== 'z' && c.v != null; }
    async function readCells(sheet, addrs) {
      var s = ws(sheet), out = {};
      addrs.forEach(function (a) { var c = s[a]; out[a] = hasValue(c) ? ev(c.v, c.z) : null; });
      return out;
    }
    async function noSavedResult(sheet, addrs) {
      var s = ws(sheet);
      return addrs.filter(function (a) { var c = s[a]; return !!c && c.f != null && c.f !== '' && !hasValue(c); });
    }
    async function writeCells(sheet, writes) {
      var s = ws(sheet), rg = s['!ref'] ? XLSX.utils.decode_range(s['!ref']) : null;
      writes.forEach(function (w) {
        s[w.cell] = typeof w.value === 'number' ? { t: 'n', v: w.value } : { t: 's', v: String(w.value) };
        var at = XLSX.utils.decode_cell(w.cell);
        if (!rg) rg = { s: { r: at.r, c: at.c }, e: { r: at.r, c: at.c } };
        rg.s.r = Math.min(rg.s.r, at.r); rg.s.c = Math.min(rg.s.c, at.c); rg.e.r = Math.max(rg.e.r, at.r); rg.e.c = Math.max(rg.e.c, at.c);
      });
      if (rg) s['!ref'] = XLSX.utils.encode_range(rg);
    }
    async function readSheetValues(sheet) {
      var s = ws(sheet), out = {};
      Object.keys(s).forEach(function (a) { if (a.charAt(0) !== '!' && (hasValue(s[a]) || s[a].f != null)) out[a] = { v: hasValue(s[a]) ? s[a].v : null, f: s[a].f == null ? null : s[a].f }; });
      return out;
    }
    // writeSheetValues(sheet, cells): the inverse of readSheetValues - the sheet holds exactly `cells` ({ addr: { v, f } }) afterwards (a rewound or merged sheet, §14).
    //   A cell that stays keeps its number format; a sheet the workbook lacks is added; nothing else of the workbook is touched.
    async function writeSheetValues(sheet, cells) {
      if (!wb.Sheets[sheet]) XLSX.utils.book_append_sheet(wb, {}, sheet);
      var s = wb.Sheets[sheet], rg = null;
      Object.keys(s).forEach(function (a) { if (a.charAt(0) !== '!' && !cells[a]) delete s[a]; });
      Object.keys(cells).forEach(function (a) {
        var c = cells[a], old = s[a], v = c.v;
        if (old && hasValue(old) && old.v === v && (old.f == null ? null : old.f) === (c.f == null ? null : c.f)) { grow(a); return; }      // unchanged: the cell object stays as read
        var n = v == null ? { t: 'z' } : typeof v === 'number' ? { t: 'n', v: v } : typeof v === 'boolean' ? { t: 'b', v: v } : { t: 's', v: String(v) };
        if (c.f != null) n.f = c.f;
        if (old && old.z != null && old.t === n.t) n.z = old.z;
        s[a] = n; grow(a);
      });
      function grow(a) {
        var at = XLSX.utils.decode_cell(a);
        if (!rg) rg = { s: { r: at.r, c: at.c }, e: { r: at.r, c: at.c } };
        rg.s.r = Math.min(rg.s.r, at.r); rg.s.c = Math.min(rg.s.c, at.c); rg.e.r = Math.max(rg.e.r, at.r); rg.e.c = Math.max(rg.e.c, at.c);
      }
      if (rg) s['!ref'] = XLSX.utils.encode_range(rg); else delete s['!ref'];
    }
    async function getHidden(name) {
      var s = wb.Sheets[name];
      return s && s['!ref'] ? XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: '' }).map(strRow) : [];
    }
    async function setHidden(name, rows) {                                       // every cell TEXT (a chunk of digits or one starting with '=' stays what it is), sheet very hidden
      var s = XLSX.utils.aoa_to_sheet(rows.map(function (r) { return r.map(function (c) { return { t: 's', v: String(c) }; }); }));
      if (wb.Sheets[name]) wb.Sheets[name] = s; else XLSX.utils.book_append_sheet(wb, s, name);
      meta(wb.SheetNames.indexOf(name)).Hidden = 2;
    }
    async function activeSheet() {
      var v = wb.Workbook && wb.Workbook.Views && wb.Workbook.Views[0], n = v && v.activeTab != null ? wb.SheetNames[v.activeTab] : null, vis = visibleNames();
      return n && vis.indexOf(n) >= 0 ? n : vis[0];
    }
    return { readCells: readCells, noSavedResult: noSavedResult, writeCells: writeCells, readSheetValues: readSheetValues, writeSheetValues: writeSheetValues, getHidden: getHidden, setHidden: setHidden,
      userName: async function () { return who; }, activeSheet: activeSheet, visibleSheets: async function () { return visibleNames(); },
      selectedCell: async function () { return { sheet: await activeSheet(), cell: 'A1' }; } };
  }

  var READ = { cellNF: true, cellFormula: true, sheetStubs: true };               // how a workbook must be read for this host (sheetStubs: without it SheetJS DROPS a formula cell that has no saved result, §12)
  var api = { create: create, READ: READ };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetAddinXlsx = api;
})(typeof window !== 'undefined' ? window : this);
