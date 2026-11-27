// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// excel_host.js - the Excel implementation of the sheet-door HOST INTERFACE (host_shim.js) on Office.js. Adds nothing to the shim's results:
// it only turns Excel's objects into the interface's plain values and back. Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §8.1.
// Office.js names used (Microsoft Learn, checked 2026-11-27): Excel.run; workbook.worksheets .getItem/.getItemOrNullObject(1.4)/.add/.getActiveWorksheet/.load;
//   worksheet.visibility (read 1.1, set 1.2; "Visible"|"Hidden"|"VeryHidden"), .getRange, .getRangeByIndexes, .getUsedRangeOrNullObject(valuesOnly, 1.4);
//   range.address/values/formulas/numberFormat/rowIndex/columnIndex/rowCount/columnCount, range.clear(); workbook.getSelectedRange() (1.1);
//   workbook.settings.getItemOrNullObject/add (1.4).
// Not run on a real Excel (none on the build machine): W-SHEET-ADDIN A8 proves it against a fake Office.js written from those pages.
(function (global) {
  'use strict';
  var ACTOR_KEY = 'door_actor';

  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function strRow(row) { var o = row.map(function (c) { return c == null ? '' : String(c); }); while (o.length && o[o.length - 1] === '') o.pop(); return o; }
  // Excel hands a date as a serial (days since 1899-12-30); the engine wants the printed day. Only a cell whose number format has a date token is converted.
  function isDateFormat(f) { return typeof f === 'string' && /[yd]/i.test(f.replace(/\[[^\]]*\]|"[^"]*"|\\./g, '')) && !/^(general|@)$/i.test(f); }
  function serialToIso(n) { return new Date(Math.round(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)).toISOString().slice(0, 10); }
  // Excel keeps 15 significant digits; a formula's float noise (123.50000000000001) must not reach the books
  function round15(n) { return Number(n.toPrecision(15)); }
  function engineValue(v, fmt) {
    if (typeof v === 'number') return isDateFormat(fmt) ? serialToIso(v) : round15(v);
    return v === '' ? null : v;
  }
  function textForCell(v) { return typeof v === 'string' && v.charAt(0) === '=' ? "'" + v : v; }   // a written text must never become a formula

  function create(ExcelNS) {
    var X = ExcelNS || global.Excel;
    function run(fn) { return X.run(fn); }

    async function readCells(sheet, addrs) {
      return run(async function (ctx) {
        var ws = ctx.workbook.worksheets.getItem(sheet), rs = addrs.map(function (a) { var r = ws.getRange(a); r.load('values,numberFormat'); return r; });
        await ctx.sync();
        var out = {}; addrs.forEach(function (a, i) { out[a] = engineValue(rs[i].values[0][0], rs[i].numberFormat[0][0]); });
        return out;
      });
    }
    async function writeCells(sheet, writes) {
      return run(async function (ctx) {
        var ws = ctx.workbook.worksheets.getItem(sheet);
        writes.forEach(function (w) { ws.getRange(w.cell).values = [[textForCell(w.value)]]; });
        await ctx.sync();
      });
    }
    async function readSheetValues(sheet) {
      return run(async function (ctx) {
        var u = ctx.workbook.worksheets.getItem(sheet).getUsedRangeOrNullObject(false);
        u.load('values,formulas,rowIndex,columnIndex,rowCount,columnCount');
        await ctx.sync();
        var out = {}; if (u.isNullObject) return out;
        for (var i = 0; i < u.rowCount; i++) for (var j = 0; j < u.columnCount; j++) {
          var v = u.values[i][j], f = u.formulas[i][j], isF = typeof f === 'string' && f.charAt(0) === '=';
          if ((v === '' || v == null) && !isF) continue;
          out[colName(u.columnIndex + j) + (u.rowIndex + i + 1)] = { v: v === '' ? null : v, f: isF ? f.slice(1) : null };
        }
        return out;
      });
    }
    async function getHidden(name) {
      return run(async function (ctx) {
        var ws = ctx.workbook.worksheets.getItemOrNullObject(name); await ctx.sync();
        if (ws.isNullObject) return [];
        var u = ws.getUsedRangeOrNullObject(true); u.load('values'); await ctx.sync();
        return u.isNullObject ? [] : u.values.map(strRow);
      });
    }
    async function setHidden(name, rows) {
      return run(async function (ctx) {
        var ws = ctx.workbook.worksheets.getItemOrNullObject(name); await ctx.sync();
        if (ws.isNullObject) { ws = ctx.workbook.worksheets.add(name); ws.visibility = 'VeryHidden'; }
        else { ws.getUsedRangeOrNullObject().clear(); }
        var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        if (rows.length && width) {
          var r = ws.getRangeByIndexes(0, 0, rows.length, width);
          r.numberFormat = rows.map(function () { var a = []; for (var k = 0; k < width; k++) a.push('@'); return a; });      // text first: a chunk of digits or starting with '=' stays text
          r.values = rows.map(function (row) { var a = row.slice(); while (a.length < width) a.push(''); return a; });
        }
        await ctx.sync();
      });
    }
    async function userName() {
      return run(async function (ctx) {
        var s = ctx.workbook.settings.getItemOrNullObject(ACTOR_KEY); s.load('value'); await ctx.sync();
        return s.isNullObject || !s.value ? 'unknown' : String(s.value);
      });
    }
    async function setUserName(name) {
      return run(async function (ctx) {
        var s = ctx.workbook.settings.getItemOrNullObject(ACTOR_KEY); await ctx.sync();
        if (s.isNullObject) ctx.workbook.settings.add(ACTOR_KEY, String(name)); else { s.value = String(name); }
        await ctx.sync();
      });
    }
    async function activeSheet() {
      return run(async function (ctx) { var ws = ctx.workbook.worksheets.getActiveWorksheet(); ws.load('name'); await ctx.sync(); return ws.name; });
    }
    async function visibleSheets() {
      return run(async function (ctx) {
        var c = ctx.workbook.worksheets; c.load('items/name,items/visibility'); await ctx.sync();
        return c.items.filter(function (w) { return w.visibility === 'Visible'; }).map(function (w) { return w.name; });
      });
    }
    async function selectedCell() {
      return run(async function (ctx) {
        var r = ctx.workbook.getSelectedRange(); r.load('address'); await ctx.sync();
        var a = r.address, bang = a.lastIndexOf('!'), sheet = a.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'");
        return { sheet: sheet, cell: a.slice(bang + 1).split(':')[0].replace(/\$/g, '') };
      });
    }
    return { readCells: readCells, writeCells: writeCells, readSheetValues: readSheetValues, getHidden: getHidden, setHidden: setHidden, userName: userName,
      setUserName: setUserName, activeSheet: activeSheet, visibleSheets: visibleSheets, selectedCell: selectedCell };
  }

  var api = { create: create, serialToIso: serialToIso, round15: round15, colName: colName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetAddinExcel = api;
})(typeof window !== 'undefined' ? window : this);
