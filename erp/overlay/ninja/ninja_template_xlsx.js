// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_template_xlsx.js — styles-aware xlsx host for ninja_template.js (RUN-TEMPLATE verb).
// WHY: SheetJS CE drops fonts/fills/borders on read+write (prompts/NINJAEXCEL_TEMPLATE_ENGINE.md RESULTS 13), which would break the customer's look & feel.
// ExcelJS (MIT) keeps them. This file only translates: xlsx <-> the engine's cell model. No report logic lives here.
//   Cell model: { t:'n'|'s'|'b'|'z'|'e', v, f?, z? (number format), s? (style id: key into model._styles) }
//   Sheet extras: '!merges' [{s:{r,c},e:{r,c}}], '!cols' [{width,hidden}], '!rows' [{h}]  (0-based, same as SheetJS)
// SEAM: ExcelJS is injected (browser bundle or require('exceljs')); the module never requires it itself.
(function (global) {
  'use strict';
  function colName(c) { var s = ''; c = c + 1; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function addr(r, c) { return colName(c) + (r + 1); }
  function parseA1(a) { var m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a); var c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return { r: parseInt(m[2], 10) - 1, c: c - 1 }; }
  function dateToSerial(d) { return d.getTime() / 86400000 + 25569; }

  // ExcelJS cell value -> model cell
  function toCell(cell, styleId) {
    var v = cell.value, o;
    if (v == null) o = { t: 'z' };
    else if (typeof v === 'number') o = { t: 'n', v: v };
    else if (typeof v === 'string') o = { t: 's', v: v };
    else if (typeof v === 'boolean') o = { t: 'b', v: v };
    else if (v instanceof Date) o = { t: 'n', v: dateToSerial(v) };
    else if (v.formula !== undefined || v.sharedFormula !== undefined) {
      var res = v.result; if (res && typeof res === 'object' && res.error) res = res.error;
      o = { t: typeof res === 'string' ? 's' : 'n', f: cell.formula || v.formula, v: res == null ? 0 : (res instanceof Date ? dateToSerial(res) : res) };
    } else if (v.richText) o = { t: 's', v: v.richText.map(function (x) { return x.text; }).join('') };
    else if (v.error) o = { t: 'e', v: v.error };
    else if (v.text !== undefined) o = { t: 's', v: String(v.text) };
    else o = { t: 's', v: String(v) };
    if (styleId != null) o.s = styleId;
    var nf = cell.style && cell.style.numFmt; if (nf) o.z = nf;
    return o;
  }

  // loadModel(ExcelJS, buffer) -> Promise<model>   model = { SheetNames, Sheets, _styles }
  function loadModel(ExcelJS, buf) {
    var xw = new ExcelJS.Workbook(), styles = {}, keyToId = {}, nStyle = 0, uses = {};
    return xw.xlsx.load(buf).then(function () {
      var model = { SheetNames: [], Sheets: {}, _styles: styles };
      xw.eachSheet(function (ws) {
        var o = { '!merges': [], '!cols': [], '!rows': [] }, maxr = 0, maxc = 0;
        ws.eachRow({ includeEmpty: true }, function (row, rn) {
          if (row.height != null) o['!rows'][rn - 1] = { h: row.height };
          if (row.hidden) (o['!rows'][rn - 1] = o['!rows'][rn - 1] || {}).hidden = true;
          row.eachCell({ includeEmpty: true }, function (cell, cn) {
            var st = cell.style || {}, key = JSON.stringify(st), id = null;
            if (key !== '{}') { id = keyToId[key]; if (id == null) { id = 's' + (nStyle++); keyToId[key] = id; styles[id] = JSON.parse(key); } }
            o[addr(rn - 1, cn - 1)] = toCell(cell, id); if (rn > maxr) maxr = rn; if (cn > maxc) maxc = cn;
            if (id != null) uses[id] = (uses[id] || 0) + 1;
          });
        });
        for (var c = 1; c <= maxc; c++) { var col = ws.getColumn(c); if (col.width != null || col.hidden) o['!cols'][c - 1] = { width: col.width, hidden: !!col.hidden }; }
        (ws.model.merges || []).forEach(function (rg) { var p = rg.split(':'), a = parseA1(p[0]), b = parseA1(p[1] || p[0]); o['!merges'].push({ s: a, e: b }); });
        o['!ref'] = maxr ? 'A1:' + addr(maxr - 1, Math.max(maxc - 1, 0)) : 'A1:A1';
        model.SheetNames.push(ws.name); model.Sheets[ws.name] = o;
      });
      // Default style = what Java gives a cell it creates (HSSF xf 0): the most used style that carries NO border, fill, number format or special alignment.
      // ExcelJS rewrites the workbook default font as Calibri 11 on save, so engine-created cells would otherwise lose the template's own default font.
      var best = null; Object.keys(styles).forEach(function (id) { var st = styles[id], plain = (!st.border || !Object.keys(st.border).length) && (!st.fill || !st.fill.fgColor) && !st.numFmt; if (plain && (best == null || uses[id] > uses[best])) best = id; });
      model._defaultStyleId = best;
      return model;
    });
  }

  // ExcelJS (4.4.0) style de-duplication can merge two xfs whose borders differ only by WHICH side is set (measured: 6 of 6098 cells in a real customer template swapped
  // right<->left / bottom<->top after a write). Giving every border all four sides explicitly (empty object = none) makes the dedupe key distinct.
  function canonStyle(st) {
    var o = JSON.parse(JSON.stringify(st)), b = o.border || {};
    o.border = { left: b.left || {}, right: b.right || {}, top: b.top || {}, bottom: b.bottom || {} };
    if (b.diagonal) o.border.diagonal = b.diagonal;
    return o;
  }
  // saveModel(ExcelJS, model, templateBuffer, sheetNames) -> Promise<Buffer>  — re-open the TEMPLATE and replace only the named sheets' content,
  // so everything the engine does not touch (other sheets, page setup, views, defined names) stays byte-for-byte what the user authored.
  function saveModel(ExcelJS, model, templateBuf, sheetNames) {
    var xw = new ExcelJS.Workbook();
    return xw.xlsx.load(templateBuf).then(function () {
      sheetNames.forEach(function (name) {
        var ws = xw.getWorksheet(name), m = model.Sheets[name]; if (!ws || !m) return;
        (ws.model.merges || []).slice().forEach(function (rg) { ws.unMergeCells(rg); });
        // wipe: spliceRows alone leaves the OLD cell styles in place (measured: ghost styled blanks at the template's original formula-cell addresses)
        ws.eachRow({ includeEmpty: true }, function (row) { row.eachCell({ includeEmpty: true }, function (c) { c.value = null; c.style = {}; }); });
        if (ws.rowCount) ws.spliceRows(1, ws.rowCount);
        Object.keys(m).forEach(function (k) {
          if (k[0] === '!') return; var p = parseA1(k), c = m[k], cell = ws.getCell(p.r + 1, p.c + 1);
          if (c.f) cell.value = { formula: c.f, result: c.v }; else if (c.t === 'n' || c.t === 's' || c.t === 'b') cell.value = c.v; else if (c.t === 'e') cell.value = { error: c.v }; else cell.value = null;
          var sid = c.s != null ? c.s : model._defaultStyleId;                                          // engine-created cell (no style) -> the template's default style, like Java
          cell.style = (sid != null && model._styles[sid]) ? canonStyle(model._styles[sid]) : {};      // always assign: a cell without a style must not inherit a stale one
          if (c.z) cell.numFmt = c.z;
        });
        (m['!rows'] || []).forEach(function (rh, i) { if (rh) { var row = ws.getRow(i + 1); if (rh.h != null) row.height = rh.h; if (rh.hidden) row.hidden = true; } });
        (m['!merges'] || []).forEach(function (mg) {
          ws.mergeCells(mg.s.r + 1, mg.s.c + 1, mg.e.r + 1, mg.e.c + 1);
          // ExcelJS stamps the MASTER cell's style onto every merged cell (measured: neighbours' own borders were swapped/overwritten); Excel/POI keep a style per cell → re-apply
          for (var rr = mg.s.r; rr <= mg.e.r; rr++) for (var cc = mg.s.c; cc <= mg.e.c; cc++) {
            var mc = m[addr(rr, cc)]; if (mc && mc.s != null && model._styles[mc.s]) ws.getCell(rr + 1, cc + 1).style = canonStyle(model._styles[mc.s]);
          }
        });
        (m['!cols'] || []).forEach(function (cd, i) { if (cd) { var col = ws.getColumn(i + 1); if (cd.width != null) col.width = cd.width; col.hidden = !!cd.hidden; } });
      });
      return xw.xlsx.writeBuffer();
    });
  }

  var API = { loadModel: loadModel, saveModel: saveModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.NinjaTemplateXlsx = API;
})(typeof self !== 'undefined' ? self : this);
