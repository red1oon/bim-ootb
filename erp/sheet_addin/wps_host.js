// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// wps_host.js - the WPS Office (spreadsheet) implementation of the sheet-door HOST INTERFACE (host_shim.js) over WPS's `Application` object. Adds nothing to the shim's results:
// it only turns WPS objects into the interface's plain values and back. Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §11 (slice S4) - Witness: W-SHEET-WPS (erp/tests/witness_sheet_wps.js).
// The value rules (a date-formatted number as its ISO day, 15 significant digits, a written text starting "=" stays text) are the Excel layer's, passed in as deps.ex (excel_host.js): ONE rule.
// WPS names used, every one on the list in §11.1 [S-B] (the typings package `et-jsapi-declare` 2.5.0, Kingsoft's; names and shapes only, not behaviour):
//   Application.ActiveWorkbook / ActiveSheet / ActiveCell / UserName; Workbook.Worksheets; Sheets.Count / Item(i) / Add(); Worksheet.Name / Visible / Range(a) / Cells / UsedRange / Activate();
//   Range.Value2 / Formula / NumberFormat / Row / Column / Rows / Columns / Count / Item(r, c) / Worksheet / Clear(); enum XlSheetVisibility xlSheetVisible = -1, xlSheetVeryHidden = 2.
// Never a multi-cell Value2 (the shape of that result is UNKNOWN): ranges are walked cell by cell. NOT run on real WPS (none on the build machine): the witness runs it on a fake object model.
(function (global) {
  'use strict';
  var VISIBLE = -1, VERY_HIDDEN = 2;                                     // XlSheetVisibility (typings enum)

  function create(app, deps) {
    var ex = deps.ex, engineValue = ex.engineValue, textForCell = ex.textForCell, colName = ex.colName, strRow = ex.strRow;
    function sheets() { var s = app.ActiveWorkbook.Worksheets, out = []; for (var i = 1; i <= s.Count; i++) out.push(s.Item(i)); return out; }   // Item is 1-based, as Cells.Item is in WPS's own sample
    function byName(n) { return sheets().filter(function (w) { return w.Name === n; })[0] || null; }
    function ws(n) { var w = byName(n); if (!w) throw new Error('this workbook has no sheet named ' + n); return w; }
    function val(r) { var v = r.Value2; return v == null ? '' : v; }
    // the used range, walked one cell at a time: fn(cell, row, column, firstRow, firstColumn), all 1-based sheet positions
    function walk(w, fn) {
      var u = w.UsedRange, r0 = u.Row, c0 = u.Column, nr = u.Rows.Count, nc = u.Columns.Count;
      for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) fn(w.Cells.Item(r0 + i, c0 + j), r0 + i, c0 + j, r0, c0);
    }

    async function readCells(sheet, addrs) {
      var w = ws(sheet), out = {};
      addrs.forEach(function (a) { var r = w.Range(a); out[a] = engineValue(val(r), r.NumberFormat); });
      return out;
    }
    async function writeCells(sheet, writes) {
      var w = ws(sheet);
      writes.forEach(function (x) { w.Range(x.cell).Value2 = textForCell(x.value); });
    }
    async function readSheetValues(sheet) {
      var out = {};
      walk(ws(sheet), function (c, r, k) {
        var v = val(c), f = c.Formula, isF = typeof f === 'string' && f.charAt(0) === '=';
        if (v === '' && !isF) return;
        out[colName(k - 1) + r] = { v: v === '' ? null : v, f: isF ? f.slice(1) : null };
      });
      return out;
    }
    async function getHidden(name) {
      var w = byName(name); if (!w) return [];
      var rows = [];
      walk(w, function (c, r, k, r0, c0) { (rows[r - r0] = rows[r - r0] || [])[k - c0] = val(c); });
      var out = rows.map(function (row) { return strRow(Array.from(row, function (x) { return x == null ? '' : x; })); });
      while (out.length && !out[out.length - 1].length) out.pop();
      return out;
    }
    async function setHidden(name, rows) {
      var w = byName(name), was = null;
      if (!w) { was = app.ActiveSheet; w = app.ActiveWorkbook.Worksheets.Add(); w.Name = name; }
      else w.UsedRange.Clear();
      rows.forEach(function (row, i) { row.forEach(function (text, j) { var c = w.Cells.Item(i + 1, j + 1); c.NumberFormat = '@'; c.Value2 = text; }); });   // text first: a chunk of digits or starting with '=' stays text
      if (was) was.Activate();                                          // the new sheet must not take the user's place in the workbook
      w.Visible = VERY_HIDDEN;
    }
    async function userName() { var n = app.UserName; return n ? String(n) : 'unknown'; }
    async function activeSheet() { return app.ActiveSheet.Name; }
    async function visibleSheets() { return sheets().filter(function (w) { return w.Visible === VISIBLE; }).map(function (w) { return w.Name; }); }
    async function selectedCell() { var c = app.ActiveCell; return { sheet: c.Worksheet.Name, cell: colName(c.Column - 1) + c.Row }; }
    return { readCells: readCells, writeCells: writeCells, readSheetValues: readSheetValues, getHidden: getHidden, setHidden: setHidden, userName: userName,
      activeSheet: activeSheet, visibleSheets: visibleSheets, selectedCell: selectedCell };
  }

  var api = { create: create, VISIBLE: VISIBLE, VERY_HIDDEN: VERY_HIDDEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetAddinWps = api;
})(typeof window !== 'undefined' ? window : this);
