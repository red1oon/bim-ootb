// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// report_reader.js - a PDF report becomes a CHECKED sheet: cells at the source's own addresses, numbers typed as printed,
//   a "does it add up" verdict found by arithmetic, and for every cell the box on the page it came from.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §7 (slice S10) - Witness: W-SHEET-READER (pdf/tests/witness_sheet_reader.js).
// Pure and host-neutral: read(pages) takes the text runs of each page in page points, y down ({ s, x0, x1, base, h, top, bot },
//   as pdf_open.js hands them); it never touches pdf.js or a file format. Nothing is guessed: a rule that finds nothing says INCONCLUSIVE.
// read(pages) -> { ok, verdict:'ADDS_UP'|'DOES_NOT_ADD_UP'|'INCONCLUSIVE', reason, sheet:{A1:{v,t,text,f?}}, map:{A1:{page,box}}, checks, stats }
// toWorkbook(XLSX, result) -> SheetJS workbook (sheet "Report" + hidden "_door_source" = the source map).   toSnapshot(result) -> S9 snapshot.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ReportReader = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LINE_TOL = 0.3, CELL_GAP = 0.6, SPLIT_GAP = 0.35, SPACE_GAP = 0.1, EDGE_TOL = 1.0, ANCHOR_TOL = 0.5, CENT = 0.005;
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }
  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  function log(s) { if (typeof console !== 'undefined') console.log(s); }

  // 1. lines: runs whose baselines differ by at most LINE_TOL of the smaller font height
  function toLines(items) {
    var it = items.slice().sort(function (a, b) { return a.base - b.base || a.x0 - b.x0; }), lines = [], cur = null;
    it.forEach(function (r) {
      if (cur && Math.abs(r.base - cur.last) <= LINE_TOL * Math.min(r.h, cur.h)) { cur.runs.push(r); cur.last = r.base; cur.h = Math.min(cur.h, r.h); }
      else { cur = { runs: [r], last: r.base, h: r.h }; lines.push(cur); }
    });
    lines.forEach(function (l) { l.base = median(l.runs.map(function (r) { return r.base; })); l.runs.sort(function (a, b) { return a.x0 - b.x0; }); });
    return lines;
  }
  // 2. cells: neighbours closer than CELL_GAP of the font height are one cell
  function cellOf(runs) {
    var c = null;
    runs.forEach(function (r) {
      if (!c) { c = { text: r.s, x0: r.x0, x1: r.x1, top: r.top, bot: r.bot, h: r.h, runs: [r] }; return; }
      var gap = r.x0 - c.x1, h = Math.max(r.h, c.h);
      c.text += (gap > SPACE_GAP * h && !/\s$/.test(c.text) && !/^\s/.test(r.s) ? ' ' : '') + r.s; c.x1 = Math.max(c.x1, r.x1); c.top = Math.min(c.top, r.top); c.bot = Math.max(c.bot, r.bot); c.h = h; c.runs.push(r);
    });
    c.text = c.text.replace(/\s+/g, ' ').trim(); return c;
  }
  function toCells(line) {
    var groups = [], g = null, x1 = 0, h = 0;
    line.runs.forEach(function (r) { if (g && r.x0 - x1 < CELL_GAP * Math.max(r.h, h)) { g.push(r); x1 = Math.max(x1, r.x1); h = Math.max(h, r.h); } else { g = [r]; groups.push(g); x1 = r.x1; h = r.h; } });
    return groups.map(cellOf);
  }
  // 2b. columns that nearly touch: inside a cell, a gap wider than a space where the next run starts on (or the last run ends on)
  //     a cell edge that ANOTHER line shows is a column edge, so the cell is split there
  function splitAtEdges(lines) {
    var L = [], R = [], n = 0;
    lines.forEach(function (l, li) { l.cells.forEach(function (c) { L.push([c.x0, li]); R.push([c.x1, li]); }); });
    var has = function (arr, x, li) { for (var i = 0; i < arr.length; i++) if (arr[i][1] !== li && Math.abs(arr[i][0] - x) <= ANCHOR_TOL) return true; return false; };
    lines.forEach(function (l, li) {
      var out = [];
      l.cells.forEach(function (c) {
        var part = [c.runs[0]];
        for (var i = 1; i < c.runs.length; i++) { var a = c.runs[i - 1], b = c.runs[i]; /*MUT-SPLIT*/ if (b.x0 - a.x1 >= SPLIT_GAP * Math.max(a.h, b.h) && (has(L, b.x0, li) || has(R, a.x1, li))) { out.push(cellOf(part)); part = [b]; n++; } else part.push(b); }
        out.push(part.length === c.runs.length ? c : cellOf(part));
      });
      l.cells = out;
    });
    return n;
  }
  // 3. columns: the vertical bands no table cell crosses
  function toBands(tableLines) {
    var iv = []; tableLines.forEach(function (l) { l.cells.forEach(function (c) { iv.push([c.x0, c.x1]); }); });
    iv.sort(function (a, b) { return a[0] - b[0]; });
    var bands = []; iv.forEach(function (v) { var b = bands[bands.length - 1]; if (b && v[0] <= b[1]) b[1] = Math.max(b[1], v[1]); else bands.push([v[0], v[1]]); });
    return bands;
  }
  // 3b. more bands than any line has cells: a band only a few lines use (a header set apart from its column's data) joins the
  //     neighbour it never shares a line with
  function mergeWeakBands(bands, tableLines) {
    var maxCells = Math.max.apply(null, tableLines.map(function (l) { return l.cells.length; })), merged = 0;
    var inBand = function (c, b) { return c.x0 >= b[0] - EDGE_TOL && c.x0 <= b[1]; };
    var users = function (b) { return tableLines.filter(function (l) { return l.cells.some(function (c) { return inBand(c, b); }); }); };
    /*MUT-WEAK*/ while (bands.length > maxCells) {
      var best = null;
      bands.forEach(function (b, i) {
        var u = users(b);
        [i - 1, i + 1].forEach(function (j) {
          if (j < 0 || j >= bands.length) return;
          var clash = u.some(function (l) { return l.cells.some(function (c) { return inBand(c, bands[j]); }); }); if (clash) return;
          var gap = j < i ? b[0] - bands[j][1] : bands[j][0] - b[1], cand = { i: Math.min(i, j), support: u.length, gap: gap };
          if (!best || cand.support < best.support || (cand.support === best.support && cand.gap < best.gap)) best = cand;
        });
      });
      if (!best) break;
      bands.splice(best.i, 2, [bands[best.i][0], bands[best.i + 1][1]]); merged++;
    }
    return merged;
  }
  function bandOf(bands, x0) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < bands.length; i++) { if (x0 >= bands[i][0] - EDGE_TOL && x0 <= bands[i][1]) return i; var d = Math.min(Math.abs(x0 - bands[i][0]), Math.abs(x0 - bands[i][1])); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // 5. types as printed: a number, a bracketed or signed negative, a lone dash (a dash and bare digits count only in a number column)
  function parseNum(text) {
    var t = String(text).trim(); if (t === '-' || t === '–' || t === '—') return { v: 0, dp: 0, dash: true };
    var m = /^(\()?(-)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?)(\))?$/.exec(t); if (!m || (!!m[1]) !== (!!m[5])) return null;
    var v = Number(m[3].replace(/,/g, '')); if (m[1] /*MUT-BRACKET*/) v = -v; if (m[2]) v = -v;
    return { v: v, dp: m[4] ? m[4].length : 0, dash: false };
  }
  function modeShare(vals) { var best = 0; vals.forEach(function (v) { var n = 0; vals.forEach(function (w) { if (Math.abs(w - v) <= EDGE_TOL) n++; }); if (n > best) best = n; }); return vals.length ? best / vals.length : 0; }

  function readPage(items, pageNo) {
    var st = { items: items.length, lines: 0, tableLines: 0, cols: 0, cells: 0, collisions: 0, blankRows: 0, pitch: 0, edgeSplits: 0, bandsMerged: 0 };
    if (!items.length) return { ok: false, verdict: 'INCONCLUSIVE', reason: 'no text on the page (a scan or an empty page)', sheet: {}, map: {}, checks: [], stats: st };
    var lines = toLines(items); lines.forEach(function (l) { l.cells = toCells(l); }); st.lines = lines.length; st.edgeSplits = splitAtEdges(lines);
    // boxes of neighbouring lines never overlap: where a tall font's box reaches into the next line, both stop at the middle of the overlap
    st.boxesTrimmed = 0;
    for (var li = 1; li < lines.length; li++) {
      var up = lines[li - 1], dn = lines[li], ub = Math.max.apply(null, up.cells.map(function (c) { return c.bot; })), dt = Math.min.apply(null, dn.cells.map(function (c) { return c.top; }));
      if (ub > dt) { var mid = (ub + dt) / 2; up.cells.forEach(function (c) { if (c.bot > mid) { c.bot = mid; st.boxesTrimmed++; } }); dn.cells.forEach(function (c) { if (c.top < mid) { c.top = mid; st.boxesTrimmed++; } }); }
    }
    var table = lines.filter(function (l) { return l.cells.length >= 3; }); st.tableLines = table.length;
    if (table.length < 2) return { ok: false, verdict: 'INCONCLUSIVE', reason: 'no table found (fewer than 2 lines with 3 or more cells)', sheet: {}, map: {}, checks: [], stats: st };
    var bands = toBands(table); st.bandsMerged = mergeWeakBands(bands, table); st.cols = bands.length;
    // 4. rows: a gap of about two pitches is one blank row
    // the pitch of ONE row, from gaps between neighbouring table lines (g1) and between a table line and a same-size neighbour (g2)
    var isT = function (l) { return l.cells.length >= 3; }, g1 = [], g2 = [], g3 = [];
    for (var i = 1; i < lines.length; i++) { var a = lines[i - 1], b2 = lines[i], g = b2.base - a.base; g3.push(g); if (isT(a) && isT(b2)) g1.push(g); else if ((isT(a) || isT(b2)) && Math.abs(a.h - b2.h) < 0.01) g2.push(g); }
    // two or more table-to-table gaps that agree ARE the pitch (wrapped header lines and blank rows are the odd ones out);
    // with fewer, the smallest gap seen next to the table is one row (a double gap is a blank row, not a pitch)
    var votes = function (g) { return g1.filter(function (x) { return Math.abs(x - g) <= 0.05 * g; }); }, top = [];
    g1.forEach(function (g) { var v = votes(g); if (v.length > top.length) top = v; });
    var gaps = g1.length || g2.length ? g1.concat(g2) : g3, gmin = Math.min.apply(null, gaps);
    var pitch = (top.length >= 2 ? median(top) : median(gaps.filter(function (g) { return g <= gmin * 1.5; }))) || 1; st.pitch = Math.round(pitch * 100) / 100;
    var row = 0, prev = null;
    lines.forEach(function (l) { var step = prev == null ? 1 : Math.max(1, Math.round((l.base - prev) / pitch)); /*MUT-BLANK*/ st.blankRows += step - 1; row += step; l.row = row; prev = l.base; });
    // place cells
    var grid = {}, colCells = bands.map(function () { return []; });
    lines.forEach(function (l) {
      l.cells.forEach(function (c) {
        var ci = bandOf(bands, c.x0), a = colName(ci) + l.row;
        if (grid[a]) { st.collisions++; grid[a].text += ' ' + c.text; grid[a].x1 = Math.max(grid[a].x1, c.x1); grid[a].top = Math.min(grid[a].top, c.top); grid[a].bot = Math.max(grid[a].bot, c.bot); }
        else { grid[a] = { text: c.text, x0: c.x0, x1: c.x1, top: c.top, bot: c.bot, row: l.row, col: ci }; colCells[ci].push(grid[a]); }
      });
    });
    // number columns: the table cells share a right edge or a centre (and do not share a left edge more)
    var numCol = bands.map(function (b, ci) { var cs = colCells[ci]; if (cs.length < 2) return false; var r = modeShare(cs.map(function (c) { return c.x1; })), l = modeShare(cs.map(function (c) { return c.x0; })), m = modeShare(cs.map(function (c) { return (c.x0 + c.x1) / 2; })), a = Math.max(r, m); return a >= 0.6 && a > l; });
    var sheet = {}, map = {}, dpMax = 0;
    Object.keys(grid).forEach(function (a) {
      var g = grid[a], n = parseNum(g.text);
      if (n && !numCol[g.col] && (n.dash || !/[.,()]|^-/.test(g.text))) n = null;   // outside a number column only a figure printed AS a figure (decimals, separators, sign, brackets) is a number; bare digits are a code
      sheet[a] = n ? { v: n.v, t: 'n', text: g.text } : { v: g.text, t: 's', text: g.text };
      if (n && n.dp > dpMax) dpMax = n.dp;
      map[a] = { page: pageNo, box: [g.x0, g.top /*MUT-BOX*/, g.x1, g.bot].map(function (v) { return Math.round(v * 100) / 100; }) };
    });
    st.cells = Object.keys(sheet).length; st.numCols = numCol.filter(Boolean).length;
    var checks = addsUp(sheet, numCol, row, dpMax);
    var sums = checks.filter(function (c) { return c.kind === 'SUM'; }), bad = checks.filter(function (c) { return !c.ok; });
    sums.forEach(function (c) { if (c.ok) sheet[c.cell].f = 'SUM(' + c.range + ')'; });
    var verdict = !sums.length ? 'INCONCLUSIVE' : bad.length ? 'DOES_NOT_ADD_UP' : 'ADDS_UP';
    var reason = !sums.length ? 'no total row found: nothing was judged' : bad.length ? bad.map(function (c) { return c.cell + ': printed ' + c.printed.toFixed(dpMax) + ' != rows sum ' + c.computed.toFixed(dpMax); }).join('; ') : sums.length + ' totals agree with their rows';
    return { ok: verdict === 'ADDS_UP', verdict: verdict, reason: reason, sheet: sheet, map: map, checks: checks, stats: st };
  }

  // 6. does it add up: found by arithmetic, never declared
  function addsUp(sheet, numCol, lastRow, dp) {
    var cols = []; numCol.forEach(function (n, ci) { if (n) cols.push(colName(ci)); });
    var num = function (c, r) { var k = sheet[c + r]; return k && k.t === 'n' ? k.v : null; }, tol = CENT;
    var isNumRow = function (r) { return cols.some(function (c) { return num(c, r) != null; }); };
    var checks = [], r = 1;
    function trySum(block, tr) {
      var per = cols.map(function (c) { var p = num(c, tr); if (p == null) return null; var s = 0; block.forEach(function (b) { s += num(c, b) || 0; }); s = Math.round(s * Math.pow(10, dp + 2)) / Math.pow(10, dp + 2); return { kind: 'SUM', cell: c + tr, range: c + block[0] + ':' + c + block[block.length - 1], printed: p, computed: s, ok: /*MUT-SUM*/ Math.abs(p - s) < tol }; }).filter(Boolean);
      var okN = per.filter(function (p) { return p.ok; }).length, real = per.some(function (p) { return p.ok && Math.abs(p.computed) >= tol; });
      return per.length && okN * 2 >= per.length && real ? per : null;
    }
    while (r <= lastRow) {
      if (!isNumRow(r)) { r++; continue; }
      var block = []; while (r <= lastRow && isNumRow(r)) block.push(r++);
      var nxt = r; while (nxt <= lastRow && !isNumRow(nxt)) nxt++;
      var per = null, body = block;
      if (nxt <= lastRow) { per = trySum(block, nxt); if (per) r = nxt + 1; }                       // total after a gap
      if (!per && block.length >= 3) { per = trySum(block.slice(0, -1), block[block.length - 1]); if (per) body = block.slice(0, -1); }   // total right under its rows
      if (per) { Array.prototype.push.apply(checks, per); var rule = rowRule(body, cols, num, tol); if (rule) checks.push(rule); }
    }
    return checks;
  }
  // a row rule with coefficients -1/0/+1 that holds on EVERY row of the block, and on 3+ rows with two non-zero terms
  function rowRule(block, cols, num, tol) {
    if (cols.length < 3 || block.length < 3) return null;
    for (var t = cols.length - 1; t >= 0; t--) {
      var others = cols.filter(function (c, i) { return i !== t; }), n = others.length, combos = Math.pow(3, n);
      for (var k = 0; k < combos; k++) {
        var co = [], x = k, nz = 0; for (var j = 0; j < n; j++) { var q = (x % 3) - 1; x = Math.floor(x / 3); co.push(q); if (q) nz++; }
        if (nz < 2) continue;
        var holds = 0, real = 0, all = true;
        for (var b = 0; b < block.length && all; b++) {
          var s = 0, terms = 0; for (var j2 = 0; j2 < n; j2++) { var v = num(others[j2], block[b]) || 0; s += co[j2] * v; if (co[j2] && Math.abs(v) >= tol) terms++; }
          if (Math.abs((num(cols[t], block[b]) || 0) - s) < tol) { holds++; if (terms >= 2) real++; } else all = false;
        }
        if (all && real >= 3) return { kind: 'ROW', target: cols[t], formula: cols[t] + ' = ' + others.map(function (c, i) { return co[i] ? (co[i] > 0 ? '+ ' : '- ') + c : ''; }).filter(Boolean).join(' ').replace(/^\+ /, ''), rows: holds, of: block.length, ok: true };
      }
    }
    return null;
  }

  function read(pages, opts) {
    opts = opts || {}; var t0 = Date.now(), pn = opts.page || 1, items = (pages && pages[pn - 1]) || [];
    var R = readPage(items, pn); R.stats.ms = Date.now() - t0; R.stats.page = pn;
    log('§SHEET_READER verdict=' + R.verdict + ' ok=' + R.ok + ' page=' + pn + ' items=' + R.stats.items + ' lines=' + R.stats.lines + ' cols=' + R.stats.cols + ' cells=' + R.stats.cells +
      ' blankRows=' + R.stats.blankRows + ' edgeSplits=' + (R.stats.edgeSplits || 0) + ' bandsMerged=' + (R.stats.bandsMerged || 0) + ' boxesTrimmed=' + (R.stats.boxesTrimmed || 0) + ' collisions=' + R.stats.collisions + ' checks=' + R.checks.length + ' ms=' + R.stats.ms + ' reason="' + R.reason + '"');
    return R;
  }
  function split(a) { var m = /^([A-Z]+)(\d+)$/.exec(a), c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return [c - 1, Number(m[2]) - 1]; }
  function toWorkbook(XLSX, R) {
    var ws = {}, maxR = 0, maxC = 0, src = [['cell', 'page', 'x0', 'y0', 'x1', 'y1', 'printed']];
    Object.keys(R.sheet).forEach(function (a) {
      var c = R.sheet[a], rc = split(a); /*MUT-XLSX*/ maxC = Math.max(maxC, rc[0]); maxR = Math.max(maxR, rc[1]);
      ws[a] = c.t === 'n' ? { t: 'n', v: c.v, z: '#,##0.00' } : { t: 's', v: c.v }; if (c.f) ws[a].f = c.f;
      var m = R.map[a]; src.push([a, m.page, m.box[0], m.box[1], m.box[2], m.box[3], c.text]);
    });
    ws['!ref'] = 'A1:' + colName(maxC) + (maxR + 1);
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Report'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(src), '_door_source');
    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
    return wb;
  }
  function toSnapshot(R) { var s = {}; Object.keys(R.sheet).forEach(function (a) { s[a] = { v: R.sheet[a].v, f: R.sheet[a].f || null }; }); return { Report: s }; }
  return { read: read, toWorkbook: toWorkbook, toSnapshot: toSnapshot, parseNum: parseNum, colName: colName };
});
