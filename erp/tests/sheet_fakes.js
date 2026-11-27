// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// sheet_fakes.js - the FAKE spreadsheet hosts the sheet-door witnesses share (moved out of witness_sheet_addin.js, bim-compiler prompts/SHEET_FRONT_DOOR.md §8.2 / §11.3):
//   Workbook (an in-memory workbook that RECORDS every cell read and write), PlainHost (the HOST INTERFACE of host_shim.js directly on it) and FakeExcel (a fake Office.js over it,
//   written from Microsoft's public API pages; strict about load-before-read and queued writes). UMD (node + browser: the page witness injects it). Test support only.
(function (global) {
  'use strict';
  var LIMIT = 32767, J = JSON.stringify;
  // ═════════════ the FAKE workbook: every cell read and write is RECORDED ═════════════
  function colStr(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n; }
  function parseA1(a) {
    var p = String(a).replace(/\$/g, '').split(':'), one = function (x) { var m = /^([A-Z]+)(\d+)$/.exec(x); return { r: Number(m[2]), c: colNum(m[1]) }; }, A = one(p[0]), B = p[1] ? one(p[1]) : A;
    return { r1: A.r, c1: A.c, r2: B.r, c2: B.c };
  }
  function A1(r, c) { return colStr(c) + r; }
  function Workbook() { this.sheets = {}; this.active = 'Sheet1'; this.selected = null; this.settings = {}; this.resetLog(); }
  Workbook.prototype.resetLog = function () { this.reads = []; this.writes = []; this.hiddenWrites = 0; this.truncated = 0; this.usedCalls = 0; };
  Workbook.prototype.addSheet = function (name, vis) { return this.sheets[name] = this.sheets[name] || { name: name, vis: vis || 'Visible', cells: {} }; };
  Workbook.prototype.readCell = function (sheet, addr, kind) { this.reads.push({ sheet: sheet, addr: addr, kind: kind }); return this.sheets[sheet].cells[addr]; };
  Workbook.prototype.writeCell = function (sheet, addr, cell, kind) {
    if (typeof cell.v === 'string' && cell.v.length > LIMIT) { cell = Object.assign({}, cell, { v: cell.v.slice(0, LIMIT) }); this.truncated++; }   // the fake LOSES data past the cell limit (never a silent pass)
    this.writes.push({ sheet: sheet, addr: addr, kind: kind }); this.sheets[sheet].cells[addr] = cell;
  };
  Workbook.prototype.setRaw = function (sheet, addr, cell) { this.addSheet(sheet).cells[addr] = cell; };       // fixture set-up, not logged
  Workbook.prototype.setHiddenRows = function (name, rows) {
    var ws = this.addSheet(name, 'VeryHidden'); ws.cells = {}; this.hiddenWrites++;
    for (var i = 0; i < rows.length; i++) for (var j = 0; j < rows[i].length; j++) this.writeCell(name, A1(i + 1, j + 1), { v: rows[i][j], f: null, fmt: '@' }, 'hidden');
  };
  Workbook.prototype.hiddenRows = function (name) {
    var ws = this.sheets[name]; if (!ws) return []; var rows = [];
    Object.keys(ws.cells).forEach(function (a) { var p = parseA1(a), c = ws.cells[a]; if (c.v === '' || c.v == null) return; (rows[p.r1 - 1] = rows[p.r1 - 1] || [])[p.c1 - 1] = String(c.v); });
    var out = []; for (var i = 0; i < rows.length; i++) out.push((rows[i] || []).map(function (x) { return x == null ? '' : x; })); return out;
  };
  Workbook.prototype.visibleReads = function () { return this.reads.filter(function (r) { return !/^_door_/.test(r.sheet); }); };
  Workbook.prototype.visibleWrites = function () { return this.writes.filter(function (w) { return !/^_door_/.test(w.sheet); }); };
  Workbook.prototype.snapshotVisible = function () {
    var o = {}, wb = this; Object.keys(wb.sheets).forEach(function (n) { if (wb.sheets[n].vis !== 'Visible') return; Object.keys(wb.sheets[n].cells).forEach(function (a) { var c = wb.sheets[n].cells[a]; o[n + '!' + a] = J([c.v, c.f]); }); }); return o;
  };
  Workbook.prototype.editChunk = function (name, row, chunk, fn) { var a = A1(row + 1, chunk + 1), c = this.sheets[name].cells[a]; c.v = fn(String(c.v)); };

  // ═════════════ host 1: the plain fake host (the interface, directly on the model) ═════════════
  function PlainHost(m, user) {
    return {
      readCells: async function (sheet, addrs) { var o = {}; addrs.forEach(function (a) { var c = m.readCell(sheet, a, 'cell'); o[a] = c && c.v !== undefined ? c.v : null; }); return o; },
      writeCells: async function (sheet, ws) { ws.forEach(function (w) { m.writeCell(sheet, w.cell, { v: w.value, f: null }, 'cell'); }); },
      readSheetValues: async function (sheet) { m.usedCalls++; var o = {}, ws = m.sheets[sheet]; Object.keys(ws.cells).forEach(function (a) { var c = m.readCell(sheet, a, 'used'); if ((c.v === '' || c.v == null) && c.f == null) return; o[a] = { v: c.v === '' ? null : c.v, f: c.f }; }); return o; },
      getHidden: async function (name) { m.reads.push({ sheet: name, addr: '*', kind: 'hidden' }); return m.hiddenRows(name); },
      setHidden: async function (name, rows) { m.setHiddenRows(name, rows); },
      userName: async function () { return user || 'unknown'; },
      activeSheet: async function () { return m.active; },
      visibleSheets: async function () { return Object.keys(m.sheets).filter(function (n) { return m.sheets[n].vis === 'Visible'; }); },
      selectedCell: async function () { return { sheet: m.selected.sheet, cell: m.selected.addr }; }
    };
  }

  // ═════════════ host 2: a FAKE Office.js over the SAME model (written from Microsoft's public API pages; see excel_host.js header) ═════════════
  //   strict where the real API is strict: a property must be loaded (and synced) before it is read; writes and loads are queued until sync(); getItemOrNullObject needs a sync
  //   before isNullObject; a string written to a cell that is not text-formatted is coerced the way Excel does (number-looking -> number, leading '=' -> formula, leading ' -> text).
  function FakeExcel(m) {
    function coerceIn(v, fmt) {
      if (typeof v === 'string') {
        if (fmt === '@') return { v: v, f: null };
        if (v.charAt(0) === "'") return { v: v.slice(1), f: null };
        if (v.charAt(0) === '=') return { v: null, f: v.slice(1) };
        if (/^-?\d+(\.\d+)?$/.test(v)) return { v: Number(v), f: null };
      }
      return { v: v, f: null };
    }
    function need(o, name) { if (!o._loaded || !(name in o._loaded)) throw new Error('PropertyNotLoaded: ' + name); return o._loaded[name]; }
    function Ctx() {
      var ctx = this; this.q = [];
      this.sync = async function () { var q = ctx.q; ctx.q = []; q.forEach(function (f) { f(); }); };
      this.workbook = { worksheets: new Coll(ctx), settings: new Settings(ctx), getSelectedRange: function () { return new Range(ctx, m.selected.sheet, parseA1(m.selected.addr), 'cell'); } };
    }
    function exists(name) { if (!m.sheets[name]) throw new Error('ItemNotFound: worksheet ' + name); return m.sheets[name]; }
    function Coll(ctx) { this._c = ctx; this._loaded = null; }
    Coll.prototype.getItem = function (n) { return new Ws(this._c, n); };
    Coll.prototype.getItemOrNullObject = function (n) { var w = new Ws(this._c, n); w._resolved = false; this._c.q.push(function () { w._null = !m.sheets[n]; w._resolved = true; }); return w; };
    Coll.prototype.add = function (n) { var w = new Ws(this._c, n); this._c.q.push(function () { if (m.sheets[n]) throw new Error('worksheet exists: ' + n); m.addSheet(n, 'Visible'); }); return w; };
    Coll.prototype.getActiveWorksheet = function () { return new Ws(this._c, m.active); };
    Coll.prototype.load = function () { var c = this; this._c.q.push(function () { c._loaded = { items: Object.keys(m.sheets).map(function (n) { var w = new Ws(c._c, n); w._loaded = { name: n, visibility: m.sheets[n].vis }; return w; }) }; }); return this; };
    Object.defineProperty(Coll.prototype, 'items', { get: function () { return need(this, 'items'); } });
    function Ws(ctx, name) { this._c = ctx; this._n = name; this._loaded = null; this._resolved = true; this._null = false; }
    Object.defineProperty(Ws.prototype, 'isNullObject', { get: function () { if (!this._resolved) throw new Error('PropertyNotLoaded: isNullObject (sync first)'); return this._null; } });
    Object.defineProperty(Ws.prototype, 'name', { get: function () { return need(this, 'name'); } });
    Object.defineProperty(Ws.prototype, 'visibility', { get: function () { return need(this, 'visibility'); }, set: function (v) { var w = this; this._c.q.push(function () { exists(w._n).vis = v; }); } });
    Ws.prototype.load = function () { var w = this; this._c.q.push(function () { var s = exists(w._n); w._loaded = { name: s.name, visibility: s.vis }; }); return this; };
    Ws.prototype.getRange = function (a) { return new Range(this._c, this._n, parseA1(a), 'cell'); };
    Ws.prototype.getRangeByIndexes = function (r, c, nr, nc) { return new Range(this._c, this._n, { r1: r + 1, c1: c + 1, r2: r + nr, c2: c + nc }, 'cell'); };
    Ws.prototype.getUsedRangeOrNullObject = function (valuesOnly) {
      var rg = new Range(this._c, this._n, null, 'used'), n = this._n; rg._resolved = false;
      this._c.q.push(function () {
        var s = exists(n), r1 = 1e9, c1 = 1e9, r2 = 0, c2 = 0, any = false;
        Object.keys(s.cells).forEach(function (a) { var c = s.cells[a]; if (valuesOnly && (c.v === '' || c.v == null) && c.f == null) return; var p = parseA1(a); any = true; r1 = Math.min(r1, p.r1); c1 = Math.min(c1, p.c1); r2 = Math.max(r2, p.r1); c2 = Math.max(c2, p.c1); });
        rg._rect = any ? { r1: r1, c1: c1, r2: r2, c2: c2 } : null; rg._null = !any; rg._resolved = true;
      });
      return rg;
    };
    function Range(ctx, sheet, rect, kind) { this._c = ctx; this._s = sheet; this._rect = rect; this._kind = kind; this._loaded = {}; this._resolved = true; this._null = false; }
    var RP = Range.prototype;
    Object.defineProperty(RP, 'isNullObject', { get: function () { if (!this._resolved) throw new Error('PropertyNotLoaded: isNullObject (sync first)'); return this._null; } });
    ['values', 'formulas', 'numberFormat', 'address', 'rowIndex', 'columnIndex', 'rowCount', 'columnCount'].forEach(function (p) {
      Object.defineProperty(RP, p, { get: function () { return need(this, p); }, set: p === 'values' || p === 'numberFormat' ? function (x) { setter(this, p, x); } : undefined });
    });
    function setter(rg, p, x) {
      rg._c.q.push(function () {
        var R = rg._rect, s = exists(rg._s);
        for (var r = R.r1; r <= R.r2; r++) for (var c = R.c1; c <= R.c2; c++) {
          var a = A1(r, c), old = s.cells[a] || { v: '', f: null }, v = x[r - R.r1][c - R.c1];
          if (p === 'numberFormat') m.writeCell(rg._s, a, { v: old.v, f: old.f, fmt: v }, 'fmt');
          else { var cv = coerceIn(v, old.fmt); m.writeCell(rg._s, a, { v: cv.v, f: cv.f, fmt: old.fmt }, /^_door_/.test(rg._s) ? 'hidden' : 'cell'); }
        }
        if (p === 'values' && /^_door_/.test(rg._s)) m.hiddenWrites++;
      });
    }
    RP.load = function (props) {
      var rg = this; this._c.q.push(function () {
        var want = String(props).split(','), R = rg._rect; if (!R) return;
        if (want.indexOf('values') >= 0 || want.indexOf('formulas') >= 0) { /* a read: record every address of the range (empty or not) */ }
        var vals = [], fs_ = [], fmts = [], s = exists(rg._s);
        for (var r = R.r1; r <= R.r2; r++) { var rv = [], rf = [], rn = []; for (var c = R.c1; c <= R.c2; c++) {
          var a = A1(r, c), cell = want.indexOf('values') >= 0 ? m.readCell(rg._s, a, rg._kind === 'used' ? 'used' : 'cell') : s.cells[a];
          if (want.indexOf('values') < 0 && want.indexOf('formulas') >= 0) m.readCell(rg._s, a, 'used');
          rv.push(cell ? (cell.v == null ? '' : cell.v) : ''); rf.push(cell ? (cell.f != null ? '=' + cell.f : (cell.v == null ? '' : cell.v)) : ''); rn.push(cell && cell.fmt || 'General'); }
          vals.push(rv); fs_.push(rf); fmts.push(rn); }
        if (rg._kind === 'used') m.usedCalls++;
        var q = /^[^A-Za-z0-9_]/.test(rg._s) || /[^A-Za-z0-9_]/.test(rg._s) ? "'" + rg._s.replace(/'/g, "''") + "'" : rg._s;
        var L = { values: vals, formulas: fs_, numberFormat: fmts, address: q + '!' + A1(R.r1, R.c1) + (R.r1 === R.r2 && R.c1 === R.c2 ? '' : ':' + A1(R.r2, R.c2)), rowIndex: R.r1 - 1, columnIndex: R.c1 - 1, rowCount: R.r2 - R.r1 + 1, columnCount: R.c2 - R.c1 + 1 };
        want.forEach(function (w) { w = w.trim(); if (w in L) rg._loaded[w] = L[w]; });
      });
      return this;
    };
    RP.clear = function () { var rg = this; this._c.q.push(function () { if (!rg._rect) return; var s = exists(rg._s); for (var r = rg._rect.r1; r <= rg._rect.r2; r++) for (var c = rg._rect.c1; c <= rg._rect.c2; c++) delete s.cells[A1(r, c)]; }); };
    function Settings(ctx) { this._c = ctx; }
    Settings.prototype.getItemOrNullObject = function (k) { var st = new Setting(this._c, k); st._resolved = false; this._c.q.push(function () { st._null = !(k in m.settings); st._resolved = true; }); return st; };
    Settings.prototype.add = function (k, v) { this._c.q.push(function () { m.settings[k] = v; }); };
    function Setting(ctx, k) { this._c = ctx; this._k = k; this._loaded = {}; this._resolved = true; this._null = false; }
    Object.defineProperty(Setting.prototype, 'isNullObject', { get: function () { if (!this._resolved) throw new Error('PropertyNotLoaded: isNullObject (sync first)'); return this._null; } });
    Object.defineProperty(Setting.prototype, 'value', { get: function () { return need(this, 'value'); }, set: function (v) { var st = this; this._c.q.push(function () { m.settings[st._k] = v; }); } });
    Setting.prototype.load = function () { var st = this; this._c.q.push(function () { st._loaded.value = m.settings[st._k]; }); return this; };
    return { run: async function (fn) { var ctx = new Ctx(), r = await fn(ctx); await ctx.sync(); return r; } };
  }
  var api = { Workbook: Workbook, PlainHost: PlainHost, FakeExcel: FakeExcel, parseA1: parseA1, A1: A1, colStr: colStr, colNum: colNum, LIMIT: LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetFakes = api;
})(typeof window !== 'undefined' ? window : this);
