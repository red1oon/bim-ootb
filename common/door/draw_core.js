// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — draw_core.js: the red1 shell's PURE drawings (bim-compiler prompts/CLI_ERP_IVR.md §22.3, §22.8; step R6 adds the funnel and the tree). READ THE LOG of W-RED1-DRAW.
// Text in, lines out. NO require, NO process, NO terminal codes: it runs unchanged in Node and in the page. It draws only what the envelope holds; it computes nothing.
(function (root) {
  'use strict';
  function cell(v) { return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }
  // a table: cols = names, rows = arrays or objects; each column as wide as its widest cell, capped; the last column is not cut
  function table(cols, rows, o) {
    o = o || {}; var cap = o.cap || 40;
    var get = function (r, i) { return Array.isArray(r) ? r[i] : r[cols[i]]; };
    var w = cols.map(function (c, i) { var m = String(c).length; rows.forEach(function (r) { m = Math.max(m, cell(get(r, i)).length); }); return Math.min(m, cap); });
    var fit = function (s, i) { s = cell(s); if (i === cols.length - 1) return s; return s.length > w[i] ? s.slice(0, w[i] - 1) + '…' : s + new Array(w[i] - s.length + 1).join(' '); };
    var out = [cols.map(fit).join('  ').replace(/\s+$/, '')];
    rows.forEach(function (r) { out.push(cols.map(function (c, i) { return fit(get(r, i), i); }).join('  ').replace(/\s+$/, '')); });
    return out;
  }
  var API = { table: table, cell: cell };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.DrawCore = API;
})(this);
