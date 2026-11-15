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
  // THE CLASH FUNNEL (§22.8, R6): the Viewer's own clash answer (viewer_verbs value) as a tree. Every number is a field of the value, none computed; the tree is drawn
  // only when the value's own parts add up (box overlaps = mesh clashes + cleared + unjudged; cleared = box-turn test + triangle test), else it says which do not.
  function funnel(v, o) {
    o = o || {}; var A = !!o.ascii, T = A ? '+-' : '├─', E = A ? '\\-' : '└─', V = A ? '| ' : '│ ';
    var need = ['bboxOverlaps', 'meshClashes', 'cleared', 'unknown', 'obbRejected', 'triangleClear', 'contained'];
    if (!v || need.some(function (k) { return typeof v[k] !== 'number'; })) return null;
    var sum1 = v.meshClashes + v.cleared + v.unknown === v.bboxOverlaps, sum2 = v.obbRejected + v.triangleClear === v.cleared;
    if (!sum1 || !sum2) return ['the answer\'s parts do not add up, so no funnel is drawn: ' + (sum1 ? '' : 'meshClashes ' + v.meshClashes + ' + cleared ' + v.cleared + ' + unknown ' + v.unknown + ' != bboxOverlaps ' + v.bboxOverlaps + ' ') + (sum2 ? '' : 'obbRejected ' + v.obbRejected + ' + triangleClear ' + v.triangleClear + ' != cleared ' + v.cleared)];
    var w = String(v.bboxOverlaps).length, n = function (x) { x = String(o.brk === 'off1' && x === v.meshClashes ? x + 1 : x); return new Array(w - x.length + 1).join(' ') + x; };   // off1: W-RED1-DRAW falsifier
    var tol = typeof v.toleranceM === 'number' ? '  (at ' + Math.round(v.toleranceM * 1000) + ' mm)' : '';
    return [
      n(v.bboxOverlaps) + ' box overlaps  ' + (v.discA || '') + ' x ' + (v.discB || '') + tol,
      T + ' ' + n(v.meshClashes) + ' clash at mesh level',
      V + '   ' + E + ' ' + n(v.contained) + ' of them one inside the other',
      T + ' ' + n(v.cleared) + ' cleared by the shape tests',
      V + '   ' + T + ' ' + n(v.obbRejected) + ' turned boxes do not touch',
      V + '   ' + E + ' ' + n(v.triangleClear) + ' triangles do not touch',
      E + ' ' + n(v.unknown) + ' not judged'
    ];
  }
  var API = { table: table, cell: cell, funnel: funnel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.DrawCore = API;
})(this);
