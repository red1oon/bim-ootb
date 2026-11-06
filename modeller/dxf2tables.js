// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2tables.js — a schedule drawn as a ruled table, read as rows and named columns (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D111). Pure, Node + browser.
// The ruled lines say where the cells are; each text goes to the cell that holds it; a header cell covers the columns its own lines span. Nothing is typed in: a table
// the lines do not close, or a text outside every cell, is counted and listed. Not a parser of what a row MEANS: the door, beam or panel reader owns that.
// read(sheet) -> { tables: [{ bbox, columns: [name], rows: [{ cells: [text], filled: [bool], run: [id], section }], headerRows, headerBasis, fill }], rejected }. filled[c] = the text came down a merged cell; run[c] = rows sharing one merged cell share an id, 0 = none. Rule lines come from LINE and LWPOLYLINE.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ BM: require('./dxf2beams.js'), REF: require('./element_defaults.json') });
  else root.Dxf2Tables = factory({ BM: root.Dxf2Beams, REF: null });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var clean = D.BM.parts.clean, LIM = (D.REF && D.REF.defaults['read.tables']) || null;   // element_defaults.json read.tables: the numbers are the user's, not this file's
  function setRef(ref) { LIM = ref.defaults['read.tables']; }   // the browser hands the registry over, as Dxf2Defaults.create does
  function median(a) { var s = a.slice().sort(function (p, q) { return p - q; }); return s.length ? s[s.length >> 1] : 0; }
  function textsOf(ents) {
    var out = [];
    ents.forEach(function (e) {
      if (e.type !== 'TEXT' && e.type !== 'MTEXT') return;
      var q = e.position || e.startPoint, t = clean(e.text || ''); if (!q || !t) return;
      var h = e.height || e.textHeight || 0, a = e.attachmentPoint || 7, x = q.x, y = q.y;   // the insertion point sits on the text's edge: move it into the text
      if (e.type === 'MTEXT') { if (a <= 3) y -= h / 2; else if (a >= 7) y += h / 2; if (a % 3 === 1) x += h / 4; else if (a % 3 === 0) x -= h / 4; } else y += h / 2;
      out.push({ t: t, x: x, y: y, h: h, handle: String(e.handle || '') });
    });
    return out;
  }
  function segsOf(ents, tol) {
    var H = [], V = [];
    function add(a, b) {
      if (!a || !b) return;
      if (Math.abs(a.y - b.y) <= tol && Math.abs(a.x - b.x) > tol) H.push({ y: (a.y + b.y) / 2, a: Math.min(a.x, b.x), b: Math.max(a.x, b.x) });
      else if (Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) > tol) V.push({ x: (a.x + b.x) / 2, a: Math.min(a.y, b.y), b: Math.max(a.y, b.y) });
    }
    ents.forEach(function (e) {
      if (e.type === 'LINE' && e.vertices && e.vertices.length >= 2) add(e.vertices[0], e.vertices[1]);
      else if (e.type === 'LWPOLYLINE' && e.vertices) { for (var i = 1; i < e.vertices.length; i++) add(e.vertices[i - 1], e.vertices[i]); if (e.shape) add(e.vertices[e.vertices.length - 1], e.vertices[0]); }
    });
    return { H: H, V: V };
  }
  function components(H, V, tol) {   // lines that touch are one drawing; V is sorted by x so each H only visits the verticals inside its own span
    var n = H.length + V.length, par = new Int32Array(n); for (var i = 0; i < n; i++) par[i] = i;
    function find(a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }
    var order = V.map(function (v, k) { return k; }).sort(function (p, q) { return V[p].x - V[q].x; }), xs = order.map(function (k) { return V[k].x; });
    H.forEach(function (h, hi) {
      var lo = 0, hiB = xs.length; while (lo < hiB) { var m = (lo + hiB) >> 1; if (xs[m] < h.a - tol) lo = m + 1; else hiB = m; }
      for (var j = lo; j < xs.length && xs[j] <= h.b + tol; j++) { var vk = order[j], v = V[vk]; if (h.y >= v.a - tol && h.y <= v.b + tol) par[find(hi)] = find(H.length + vk); }
    });
    var groups = {};
    H.forEach(function (h, k) { var r = find(k); (groups[r] = groups[r] || { H: [], V: [] }).H.push(h); });
    V.forEach(function (v, k) { var r = find(H.length + k); (groups[r] = groups[r] || { H: [], V: [] }).V.push(v); });
    return Object.keys(groups).map(function (k) { return groups[k]; });
  }
  function bands(vals, tol) { var s = vals.slice().sort(function (a, b) { return a - b; }), out = []; s.forEach(function (v) { if (!out.length || v - out[out.length - 1] > tol) out.push(v); }); return out; }
  function slot(edges, v) { for (var i = 0; i < edges.length - 1; i++) if (v >= edges[i] && v < edges[i + 1]) return i; return -1; }
  var NUM = /^[-+]?\d[\d,.]*\s*(?:m²|m2|mm|kw|kva|a|%)?$/i;
  // one ruled block: its column edges and its rows, each row with the texts per column. A block's own lines decide what is merged (spanOf, fill-down).
  function block(g, T, tol) {
    var xs = bands(g.V.map(function (v) { return v.x; }), tol), ysAsc = bands(g.H.map(function (h) { return h.y; }), tol);
    if (xs.length < 3 || ysAsc.length < 3) return null;
    var nc = xs.length - 1, nr = ysAsc.length - 1, x0 = xs[0], x1 = xs[nc], y0 = ysAsc[0], y1 = ysAsc[nr];
    var inside = T.filter(function (q) { return q.x >= x0 && q.x < x1 && q.y >= y0 && q.y < y1; }); if (inside.length < 4) return null;
    var grid = []; for (var r = 0; r < nr; r++) { grid.push([]); for (var c = 0; c < nc; c++) grid[r].push([]); }
    inside.forEach(function (q) { var c = slot(xs, q.x), r = nr - 1 - slot(ysAsc, q.y); if (c >= 0 && r >= 0 && r < nr) grid[r][c].push(q); });
    var used = 0; grid.forEach(function (R) { R.forEach(function (C) { if (C.length) used++; }); });
    if (used / (nr * nc) < LIM.fill_min) return null;   // a plan's linework closes cells too: they stay empty
    function spanOf(r, c) {   // a cell runs left and right until a vertical crosses this row
      var yMid = (ysAsc[nr - 1 - r] + ysAsc[nr - r]) / 2, wall = function (x) { return g.V.some(function (v) { return Math.abs(v.x - x) <= tol && v.a <= yMid && v.b >= yMid; }); }, a = c, b = c;
      while (a > 0 && !wall(xs[a])) a--; while (b < nc - 1 && !wall(xs[b + 1])) b++; return [a, b];
    }
    function floorBelow(r, c) {   // is there a rule under row r in this column? none = the cell runs down into the next row
      var y = ysAsc[nr - 1 - r], xm = (xs[c] + xs[c + 1]) / 2; return g.H.some(function (h) { return Math.abs(h.y - y) <= tol && h.a <= xm && h.b >= xm; });
    }
    function words(C) { return C.slice().sort(function (p, q) { return (q.y - p.y) || (p.x - q.x); }).map(function (q) { return q.t; }).join(' '); }
    var rows = grid.map(function (R, ri) {
      return { cells: R.map(words), span: function (c) { return spanOf(ri, c); }, open: function (c) { return ri < nr - 1 && !floorBelow(ri, c); } };
    });
    return { xs: xs, y0: y0, y1: y1, rows: rows, n: inside.length, used: used, area: nr * nc };
  }
  function sameEdges(a, b, tol) { return a.length === b.length && a.every(function (v, i) { return Math.abs(v - b[i]) <= tol * 2; }); }
  function assemble(blocks) {   // blocks stacked with the same column edges are one table (Revit breaks a schedule into a heading block and one body per group)
    blocks.sort(function (a, b) { return b.y1 - a.y1; });
    var nc = blocks[0].xs.length - 1, all = [], starts = [], runId = 0;
    blocks.forEach(function (B) {
      starts.push(all.length);
      // a merged cell (no rule between its rows) holds its text in ONE of them, often the middle: it belongs to every row of the run, inside this block only.
      // Two different texts in one run = a missing rule, not a merge: left as drawn.
      var cells = B.rows.map(function (R) { return R.cells.slice(); }), runs = B.rows.map(function () { return {}; });
      for (var c = 0; c < nc; c++) for (var r = 0; r < B.rows.length; r++) {
        var e = r; while (e < B.rows.length - 1 && B.rows[e].open(c)) e++;
        if (e > r) { var run = {}; for (var k = r; k <= e; k++) if (B.rows[k].cells[c]) run[B.rows[k].cells[c]] = 1; var u = Object.keys(run); if (u.length === 1) { runId++; for (var m = r; m <= e; m++) { cells[m][c] = u[0]; runs[m][c] = runId; } } }
        r = e;
      }
      B.rows.forEach(function (R, i) { all.push({ cells: cells[i], own: R.cells, span: R.span, runs: runs[i] }); });
    });
    function isData(R) { var f = R.cells.filter(Boolean); return f.length >= Math.max(3, nc * LIM.data_row_share) && f.filter(function (t) { return NUM.test(t); }).length >= 2; }
    var first = -1;
    for (var i = 0; i < all.length && first < 0; i++) if (isData(all[i])) first = i;
    if (blocks.length > 1 && (first < 0 || first > starts[1])) first = starts[1];   // a separate top block with no number row in it is the heading
    var basis = 'number-row';
    if (first < 0) {   // a list with no number column (a sheet register): the heading is the first row that fills three cells, and it must be a real table
      var used0 = blocks.reduce(function (n, B) { return n + B.used; }, 0), area0 = blocks.reduce(function (n, B) { return n + B.area; }, 0);
      if (used0 / area0 >= LIM.list_fill_min && all.length >= 4) for (var h = 0; h < all.length - 1 && first < 0; h++) if (all[h].own.filter(Boolean).length >= 3) { first = h + 1; basis = 'no-number-row'; }
    }
    if (first < 1) return null;
    var names = []; for (var c = 0; c < nc; c++) names.push([]);
    for (var rh = 0; rh < first; rh++) all[rh].own.forEach(function (t, ch) { if (!t) return; var sp = all[rh].span(ch); if (sp[1] - sp[0] + 1 > nc * LIM.title_span_share) return; for (var k = sp[0]; k <= sp[1]; k++) names[k].push(t); });
    var rows = [], section = null;
    for (var rd = first; rd < all.length; rd++) {
      var own = all[rd].own, full = own.filter(Boolean);
      if (!full.length) continue;
      if (full.length === 1) { var at = own.findIndex(Boolean), s2 = all[rd].span(at); if (s2[1] - s2[0] + 1 > nc * LIM.section_span_share) { section = full[0]; continue; } }
      rows.push({ cells: all[rd].cells, own: own, runs: all[rd].runs, section: section });
    }
    // a heading that covers two grid columns is one column: a stray rule in the body must not split it (a value sits in either half)
    var keep = [], colNames = names.map(function (n) { return n.join(' / '); });
    colNames.forEach(function (n, c) { if (c && n && n === colNames[c - 1]) keep[keep.length - 1].push(c); else keep.push([c]); });
    rows.forEach(function (R) {   // filled[c] = this cell's text came down a merged run: it is not this row's own statement (a key check must not count it)
      R.filled = keep.map(function (K) { return K.every(function (c) { return !R.own[c]; }) && K.some(function (c) { return R.cells[c]; }); });
      R.cells = keep.map(function (K) { return K.map(function (c) { return R.cells[c]; }).filter(Boolean).join(' '); }); R.run = keep.map(function (K) { for (var q = 0; q < K.length; q++) if (R.runs[K[q]]) return R.runs[K[q]]; return 0; }); delete R.own; delete R.runs;
    });
    colNames = keep.map(function (K) { return colNames[K[0]]; });
    var used = blocks.reduce(function (n, B) { return n + B.used; }, 0), area = blocks.reduce(function (n, B) { return n + B.area; }, 0);
    return { bbox: [blocks[0].xs[0], blocks[blocks.length - 1].y0, blocks[0].xs[nc], blocks[0].y1], blocks: blocks.length, columns: colNames, rows: rows, headerRows: first, headerBasis: basis, fill: Number((used / area).toFixed(3)) };
  }
  function read(sheet) {
    if (!LIM) { console.log('§DXF_TABLES INCONCLUSIVE: no read.tables row (setRef)'); return { tables: [], rejected: 0 }; }
    if (LIM.value === 'off') { console.log('§DXF_TABLES off: read.tables = off'); return { tables: [], rejected: 0 }; }
    var ents = (sheet && sheet.dxf && sheet.dxf.entities) || [], T = textsOf(ents), tol = Math.max(median(T.map(function (q) { return q.h; })) * LIM.edge_tol_text_h, 1e-6), S = segsOf(ents, tol);
    var blocks = [], rejected = 0, big = 0;
    components(S.H, S.V, tol).forEach(function (g) { if (g.V.length < 2 || g.H.length < 2) return; big++; var b = block(g, T, tol); if (b) blocks.push(b); else rejected++; });
    var groups = [];
    blocks.forEach(function (b) { var hit = groups.filter(function (G) { return sameEdges(G[0].xs, b.xs, tol); })[0]; if (hit) hit.push(b); else groups.push([b]); });
    var tables = [];
    groups.forEach(function (G) {   // same edges do not make one table: a block that opens with its own title or repeats the heading starts a new one
      G.sort(function (a, b) { return b.y1 - a.y1; });
      var runs = [], headWords = null;
      G.forEach(function (b) {
        var nc = b.xs.length - 1, top = b.rows[0], one = top.cells.filter(Boolean), titled = one.length === 1 && (function () { var sp = top.span(top.cells.findIndex(Boolean)); return sp[1] - sp[0] + 1 > nc * LIM.title_span_share; })();
        var words = {}; b.rows.slice(0, 4).forEach(function (R) { R.cells.forEach(function (t) { if (t && !NUM.test(t)) words[t] = 1; }); });
        var repeat = headWords && Object.keys(headWords).length >= 3 && Object.keys(headWords).filter(function (w) { return words[w]; }).length >= Object.keys(headWords).length * LIM.heading_repeat_share;
        if (!runs.length || titled || repeat) { runs.push([b]); headWords = words; } else runs[runs.length - 1].push(b);
      });
      runs.forEach(function (R) { var t = assemble(R); if (t) tables.push(t); else rejected += R.length; });
    });
    console.log('§DXF_TABLES sheet=' + (sheet.name || '?') + ' texts=' + T.length + ' lines=' + (S.H.length + S.V.length) + ' candidates=' + big + ' tables=' + tables.length + ' rejected=' + rejected + ' rows=' + tables.reduce(function (n, t) { return n + t.rows.length; }, 0) + (tables.length ? '' : ' INCONCLUSIVE: no ruled table read'));
    return { tables: tables, rejected: rejected };
  }
  return { read: read, setRef: setRef, parts: { textsOf: textsOf, segsOf: segsOf, components: components } };
});
