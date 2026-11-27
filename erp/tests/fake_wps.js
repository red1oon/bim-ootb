// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// fake_wps.js - a FAKE WPS Spreadsheets object model over the shared in-memory workbook (sheet_fakes.js Workbook), for the sheet-door witnesses. UMD (node + browser: the page witness injects it).
// Bim-compiler prompts/SHEET_FRONT_DOOR.md §11 (slice S4). NOT WPS: it is built ONLY from the API names in CITED below, each with its source (§11.1 [S-B] = the typings package et-jsapi-declare 2.5.0,
// Kingsoft's, names and shapes only; [S-A] = the wpsjs 2.2.3 scaffold). It is STRICT: reading or setting any member not in CITED THROWS (P6), so an invented name cannot pass silently.
// The typings give shapes, not behaviour; what this fake does where they are silent is an ASSUMPTION, listed in ASSUMED and printed by the witness (real WPS decides them):
//   A1 an empty cell's Value2 is undefined; A2 Sheets.Item is 1-based (S-A's Cells.Item is) and throws past Count; A3 Sheets.Add() adds a visible sheet and makes it the active one (Excel's rule);
//   A4 hiding the ACTIVE sheet throws; A5 the used range of an empty sheet is the single cell A1; A6 a string written to a cell not formatted "@" is coerced like Excel (digits -> number, leading "=" -> formula);
//   A7 a date cell's Value2 is its serial number (Excel's rule); A8 a multi-cell Value2 is NOT modelled (throws: its shape is unknown); A9 a cell holds at most 32,767 characters (data past it is LOST, counted).
(function (global) {
  'use strict';
  var SF = typeof module !== 'undefined' && module.exports ? require('./sheet_fakes.js') : global.SheetFakes;
  var parseA1 = SF.parseA1, A1 = SF.A1;
  var CITED = {
    Application: { ActiveWorkbook: 'S-B lib.et.d.ts Application.ActiveWorkbook', ActiveSheet: 'S-B lib.et.d.ts Application.ActiveSheet', ActiveCell: 'S-B lib.et.d.ts Application.ActiveCell',
      UserName: 'S-B lib.et.d.ts Application.UserName', PluginStorage: 'S-B index.d.ts AddonRoot.PluginStorage', CreateTaskPane: 'S-B index.d.ts AddonRoot.CreateTaskPane', GetTaskPane: 'S-B index.d.ts AddonRoot.GetTaskPane',
      ribbonUI: 'S-B index.d.ts AddonRoot.ribbonUI (S-A ribbon.js assigns it)' },
    PluginStorage: { getItem: 'S-B index.d.ts PluginStorage.getItem', setItem: 'S-B index.d.ts PluginStorage.setItem' },
    TaskPane: { ID: 'S-B index.d.ts CustomTaskpane.ID', Visible: 'S-B index.d.ts CustomTaskpane.Visible', Navigate: 'S-B index.d.ts CustomTaskpane.Navigate' },
    Workbook: { Worksheets: 'S-B lib.et.d.ts Workbook.Worksheets', ActiveSheet: 'S-B lib.et.d.ts Workbook.ActiveSheet', Name: 'S-B lib.et.d.ts Workbook.Name' },
    Sheets: { Count: 'S-B lib.et.d.ts Sheets.Count', Item: 'S-B lib.et.d.ts Sheets.Item', Add: 'S-B lib.et.d.ts Sheets.Add' },
    Worksheet: { Name: 'S-B lib.et.d.ts Worksheet.Name', Visible: 'S-B lib.et.d.ts Worksheet.Visible + enum XlSheetVisibility', Cells: 'S-B lib.et.d.ts Worksheet.Cells', Range: 'S-B lib.et.d.ts Worksheet.Range',
      UsedRange: 'S-B lib.et.d.ts Worksheet.UsedRange', Activate: 'S-B lib.et.d.ts Worksheet.Activate' },
    Range: { Value2: 'S-B lib.et.d.ts Range.Value2', Formula: 'S-B lib.et.d.ts Range.Formula', NumberFormat: 'S-B lib.et.d.ts Range.NumberFormat', Row: 'S-B lib.et.d.ts Range.Row', Column: 'S-B lib.et.d.ts Range.Column',
      Rows: 'S-B lib.et.d.ts Range.Rows', Columns: 'S-B lib.et.d.ts Range.Columns', Item: 'S-B lib.et.d.ts Range.Item', Worksheet: 'S-B lib.et.d.ts Range.Worksheet', Clear: 'S-B lib.et.d.ts Range.Clear' },
    Count: { Count: 'S-B lib.et.d.ts Range.Count (Rows / Columns are Ranges)' }
  };
  var ASSUMED = ['empty Value2 is undefined', 'Sheets.Item is 1-based and throws past Count', 'Sheets.Add() makes the new sheet active', 'hiding the active sheet throws', 'used range of an empty sheet = A1',
    'a string written to a non-@ cell is coerced like Excel (digits -> number, leading = -> formula, leading apostrophe = text prefix)', 'a date cell Value2 is its serial', 'multi-cell Value2 not modelled', 'cell limit 32,767 characters, the rest is lost'];
  var VIS = { Visible: -1, Hidden: 0, VeryHidden: 2 }, VIS_NAME = { '-1': 'Visible', '0': 'Hidden', '2': 'VeryHidden' };

  // strict(cls, raw): the object WPS code sees; any member not in CITED[cls] throws on read and on write
  function strict(cls, raw) {
    var allowed = CITED[cls];
    return new Proxy(raw, {
      get: function (t, p) { if (typeof p === 'symbol') return t[p]; if (!Object.prototype.hasOwnProperty.call(allowed, p)) throw new Error('NotCited: ' + cls + '.' + String(p) + ' is not an API name on the cited list (spec 11.1)'); return t[p]; },
      set: function (t, p, v) { if (typeof p === 'symbol' || !Object.prototype.hasOwnProperty.call(allowed, p)) throw new Error('NotCited: set ' + cls + '.' + String(p)); t[p] = v; return true; }
    });
  }
  function coerceIn(v, fmt) {
    if (typeof v === 'string') {
      if (fmt === '@') return { v: v, f: null };
      if (v.charAt(0) === "'") return { v: v.slice(1), f: null };                    // ASSUMED A10 (Excel's text prefix)
      if (v.charAt(0) === '=') return { v: null, f: v.slice(1) };
      if (/^-?\d+(\.\d+)?$/.test(v)) return { v: Number(v), f: null };
    }
    return { v: v, f: null };
  }
  function isEmpty(c) { return !c || ((c.v === '' || c.v == null) && c.f == null); }

  // app(m, opts) -> the Application object over the model m (a SheetFakes.Workbook); opts.user = UserName
  var PANES = new WeakMap();                                              // the task panes an app created (witness-side, not WPS API)
  function app(m, opts) {
    opts = opts || {}; var panes = [], store = {}, sheetObjs = {};
    function exists(n) { if (!m.sheets[n]) throw new Error('ItemNotFound: worksheet ' + n); return m.sheets[n]; }
    function names() { return Object.keys(m.sheets); }
    function rangeOf(sheet, rect, kind) {
      var one = rect.r1 === rect.r2 && rect.c1 === rect.c2, a = one ? A1(rect.r1, rect.c1) : null;
      function single(what) { if (!one) throw new Error('NotModelled: ' + what + ' of a multi-cell range (shape unknown, spec 11.1 [S-B])'); }
      var raw = {
        get Value2() { single('Value2'); var c = m.readCell(sheet, a, kind); if (isEmpty(c)) return undefined; return c.v == null ? '' : c.v; },       // ASSUMED A1, A7
        set Value2(x) { single('Value2'); var old = exists(sheet).cells[a] || { v: '', f: null }, cv = coerceIn(x, old.fmt); m.writeCell(sheet, a, { v: cv.v, f: cv.f, fmt: old.fmt }, /^_door_/.test(sheet) ? 'hidden' : 'cell'); if (/^_door_/.test(sheet)) m.hiddenWrites++; },
        get Formula() { single('Formula'); var c = m.readCell(sheet, a, kind); return isEmpty(c) ? '' : (c.f != null ? '=' + c.f : String(c.v)); },
        get NumberFormat() { single('NumberFormat'); var c = exists(sheet).cells[a]; return c && c.fmt || 'General'; },
        set NumberFormat(x) { single('NumberFormat'); var old = exists(sheet).cells[a] || { v: '', f: null }; m.writeCell(sheet, a, { v: old.v, f: old.f, fmt: x }, 'fmt'); },
        get Row() { return rect.r1; }, get Column() { return rect.c1; },
        get Rows() { return strict('Count', { Count: rect.r2 - rect.r1 + 1 }); }, get Columns() { return strict('Count', { Count: rect.c2 - rect.c1 + 1 }); },
        get Worksheet() { return sheetObj(sheet); },
        Item: function (r, c) { if (c == null) throw new Error('NotModelled: Item(index) with one argument'); return rangeOf(sheet, { r1: rect.r1 + r - 1, c1: rect.c1 + c - 1, r2: rect.r1 + r - 1, c2: rect.c1 + c - 1 }, 'item'); },
        Clear: function () { var s = exists(sheet); for (var r = rect.r1; r <= rect.r2; r++) for (var c = rect.c1; c <= rect.c2; c++) delete s.cells[A1(r, c)]; return true; }
      };
      return strict('Range', raw);
    }
    function usedRect(sheet) {
      m.usedCalls++; var s = exists(sheet), r1 = 1e9, c1 = 1e9, r2 = 0, c2 = 0, any = false;
      Object.keys(s.cells).forEach(function (a) { var c = s.cells[a]; if (isEmpty(c)) return; var p = parseA1(a); any = true; r1 = Math.min(r1, p.r1); c1 = Math.min(c1, p.c1); r2 = Math.max(r2, p.r1); c2 = Math.max(c2, p.c1); });
      return any ? { r1: r1, c1: c1, r2: r2, c2: c2 } : { r1: 1, c1: 1, r2: 1, c2: 1 };                    // ASSUMED A5
    }
    function sheetObj(name) {
      if (sheetObjs[name]) return sheetObjs[name];
      var raw = {
        get Name() { return exists(name).name; },
        set Name(n) { var s = exists(name); delete m.sheets[name]; s.name = n; m.sheets[n] = s; if (m.active === name) m.active = n; sheetObjs[n] = sheetObjs[name]; delete sheetObjs[name]; name = n; },
        get Visible() { return VIS[exists(name).vis]; },
        set Visible(v) { if (v !== -1 && m.active === name) throw new Error('CannotHide: the active sheet (assumption A4)'); exists(name).vis = VIS_NAME[String(v)]; },
        get Cells() { return rangeOf(name, { r1: 1, c1: 1, r2: 1048576, c2: 16384 }, 'item'); },
        Range: function (a, b) { if (b !== undefined) throw new Error('NotModelled: Range(Cell1, Cell2)'); var r = parseA1(a); if (r.r1 !== r.r2 || r.c1 !== r.c2) throw new Error('NotModelled: Range("' + a + '") spans cells'); return rangeOf(name, r, 'cell'); },
        get UsedRange() { return rangeOf(name, usedRect(name), 'used'); },
        Activate: function () { m.active = name; }
      };
      return sheetObjs[name] = strict('Worksheet', raw);
    }
    var sheets = strict('Sheets', {
      get Count() { return names().length; },
      Item: function (i) { if (typeof i === 'number') { var n = names()[i - 1]; if (n === undefined) throw new Error('ItemNotFound: sheet index ' + i); return sheetObj(n); } return sheetObj(i); },   // ASSUMED A2
      Add: function () { var k = 1; while (m.sheets['Sheet' + k]) k++; var n = 'Sheet' + k; m.addSheet(n, 'Visible'); m.active = n; return sheetObj(n); }        // ASSUMED A3
    });
    var wb = strict('Workbook', { get Worksheets() { return sheets; }, get ActiveSheet() { return sheetObj(m.active); }, get Name() { return 'fake.xlsx'; } });
    var a = strict('Application', {
      get ActiveWorkbook() { return wb; }, get ActiveSheet() { return sheetObj(m.active); },
      get ActiveCell() { if (!m.selected) throw new Error('NoSelection'); return rangeOf(m.selected.sheet, parseA1(m.selected.addr), 'cell'); },
      get UserName() { return opts.user === undefined ? '' : opts.user; }, set UserName(v) { opts.user = v; },
      get PluginStorage() { return strict('PluginStorage', { getItem: function (k) { return k in store ? String(store[k]) : ''; }, setItem: function (k, v) { store[k] = v; } }); },
      CreateTaskPane: function (url) { var p = { url: url, visible: false, id: panes.length + 1, navigated: [] }; panes.push(p); return pane(p); },
      GetTaskPane: function (id) { var p = panes.filter(function (x) { return x.id === id; })[0]; if (!p) throw new Error('NoSuchPane ' + id); return pane(p); },
      ribbonUI: undefined
    });
    PANES.set(a, panes); return a;
    function pane(p) { return strict('TaskPane', { get ID() { return p.id; }, get Visible() { return p.visible; }, set Visible(v) { p.visible = v; }, Navigate: function (u) { p.url = u; p.navigated.push(u); } }); }
  }

  // fromJSON(j): a model from { sheets: { name: { vis, cells: { addr: {v, f, fmt} } } }, active, selected: {sheet, addr} } (the page witness hands its fixture over this way)
  function fromJSON(j) {
    var m = new SF.Workbook(); m.sheets = {}; Object.keys(j.sheets).forEach(function (n) { m.sheets[n] = { name: n, vis: j.sheets[n].vis || 'Visible', cells: JSON.parse(JSON.stringify(j.sheets[n].cells)) }; });
    m.active = j.active || Object.keys(m.sheets)[0]; m.selected = j.selected || null; m.resetLog(); return m;
  }
  var api = { app: app, panesOf: function (a) { return PANES.get(a); }, fromJSON: fromJSON, CITED: CITED, ASSUMED: ASSUMED, VIS: VIS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.FakeWps = api;
})(typeof window !== 'undefined' ? window : this);
