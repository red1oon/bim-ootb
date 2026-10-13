// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_pdf.js — own Excel-sheet -> PDF renderer (replaces the commercial Spire PDF conversion). Input = the engine's cell model (ninja_template_xlsx.js).
// Spec: prompts/NINJAEXCEL_TEMPLATE_ENGINE.md RESULTS 16. NOT a screenshot: every rule below was MEASURED from a Spire-produced reference PDF
// (witness/pdf_geom.py + W33_PdfGeom.js) and is re-checked numerically against it.
//   PAGE   one page (Spire "fit sheet to page"): width = L + sum(col px*0.75) + R ; height = T + sum(row px*0.75) + B ; L=R=36pt (0.5in) T=B=72pt (1in) = the fork's pageSetup.
//   ROWS   px = floor(pt * 96/72) ; pt = px * 0.75 (measured: 10pt -> 9.75, 20pt -> 19.5, 12.75 -> 12.75).
//   COLS   px = f(chars) is HOST-DEPENDENT in Spire (default-font metrics of the machine). Profiles: 'excel' (digit 7px, Excel's own rule) and
//          'spire-local' (calibrated on the reference box: px ~= 7.4167*chars - 0.73, unset columns 67px). A reference PDF from the customer's server re-calibrates it.
//   TEXT   left x = colLeft+2, right x = colRight-2, centre = box centre; wrap line pitch = font line height; clipped to the cell/merge box.
//   FILL   solid rect over the cell/merge box. BORDERS drawn on cell edges: thin = hairline, medium = 2pt, thick = 3pt, double = two 1.334pt lines +/-0.667 with a 0.834 white gap line.
// SEAM: PDFDocument (pdfkit) and a font resolver are injected; no file system / DOM here beyond what pdfkit does.
(function (global) {
  'use strict';
  var PROFILES = {
    'excel': { colPx: function (chars) { return Math.floor(((256 * chars + Math.floor(128 / 7)) / 256) * 7); }, defaultColPx: 64 },
    'spire-local': { colPx: function (chars) { return Math.round(chars * 7.4167 - 0.73); }, defaultColPx: 67 }
  };
  function colName(c) { var s = ''; c = c + 1; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function parseA1(a) { var m = /^([A-Z]+)(\d+)$/.exec(a); if (!m) return null; var c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return { r: parseInt(m[2], 10) - 1, c: c - 1 }; }
  function argb(c) { if (!c || !c.argb) return null; var h = String(c.argb); h = h.length === 8 ? h.slice(2) : h; return '#' + h; }
  function plainStyle(st) {
    if (!st) return true; var b = st.border || {};
    var hasB = ['left', 'right', 'top', 'bottom'].some(function (k) { return b[k] && b[k].style; });
    return !hasB && !(st.fill && st.fill.fgColor) && (!st.numFmt || st.numFmt === 'General');
  }
  function hasLao(t) { return /[຀-໿]/.test(t); }
  // split a string into runs by script: Lao letters (U+0E80-0EFF, zero-width joiners) vs everything else, so each run gets a font that actually HAS its glyphs
  // (measured: Noto Sans Lao on the build host has no ASCII punctuation; sending whole mixed strings to it silently drops '/', '.', '(', ')', bullets)
  // Thai letters (U+0E01-0E5B) get their own run too (same reason: the Latin font has no Thai glyphs) - added with the public Thai trial-balance demo (prompts/NINJAEXCEL_TEMPLATE_ENGINE.md §TB-DEMO)
  function runsOf(t) { var out = [], cur = null; for (var i = 0; i < t.length; i++) { var ch = t[i], lao = /[຀-໿\u200B-\u200D]/.test(ch), th = !lao && /[\u0E01-\u0E5B]/.test(ch); if (cur && cur.lao === lao && cur.th === th) cur.t += ch; else { cur = { t: ch, lao: lao, th: th }; out.push(cur); } } return out; }

  // options: { profile, margins:{l,r,t,b}, defaultRowPt, fonts:{resolve(name,bold,italic,text)->path|stdName}, sheet:'Output', formatNumber(fmt,val)->text }
  function concatBytes(chunks) {                                  // Node Buffer.concat does not exist in a plain browser page; pdfkit chunks are Uint8Array-compatible in both
    if (typeof Buffer !== 'undefined' && Buffer.concat) return Buffer.concat(chunks);
    var n = 0, i; for (i = 0; i < chunks.length; i++) n += chunks[i].length; var out = new Uint8Array(n), o = 0; for (i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; } return out;
  }
  function renderSheet(PDFDocument, model, opts) {
    opts = opts || {}; var P = PROFILES[opts.profile || 'excel'], mg = Object.assign({ l: 36, r: 36, t: 72, b: 72 }, opts.margins || {});
    var ws = model.Sheets[opts.sheet || 'Output'], styles = model._styles || {}, defRow = opts.defaultRowPt || 12.75;
    // ── used range = non-blank value OR non-plain style; hidden cols/rows removed ──
    var maxR = -1, maxC = -1, cells = {};
    Object.keys(ws).forEach(function (k) {
      if (k[0] === '!') return; var p = parseA1(k), c = ws[k], st = c.s != null ? styles[c.s] : null;
      var blank = c.t === 'z' || (c.t === 's' && c.v === ''); if (blank && plainStyle(st)) return;
      cells[k] = c; if (p.r > maxR) maxR = p.r; if (p.c > maxC) maxC = p.c;
    });
    (ws['!merges'] || []).forEach(function (m) { if (cells[colName(m.s.c) + (m.s.r + 1)]) { if (m.e.r > maxR) maxR = m.e.r; if (m.e.c > maxC) maxC = m.e.c; } });
    var colsDef = ws['!cols'] || [], rowsDef = ws['!rows'] || [];
    var colX = [mg.l], rowY = [mg.t], colHidden = [], rowHidden = [];
    for (var c = 0; c <= maxC; c++) { var cd = colsDef[c]; var hid = !!(cd && cd.hidden); var px = hid ? 0 : (cd && cd.width != null ? P.colPx(cd.width) : P.defaultColPx); colHidden[c] = hid; colX.push(colX[c] + px * 0.75); }
    for (var r = 0; r <= maxR; r++) { var rd = rowsDef[r]; var hid2 = !!(rd && rd.hidden); var pt = rd && rd.h != null ? rd.h : defRow; rowHidden[r] = hid2; rowY.push(rowY[r] + (hid2 ? 0 : Math.floor(pt * 96 / 72) * 0.75)); }
    var pageW = colX[maxC + 1] + mg.r, pageH = rowY[maxR + 1] + mg.b;
    var doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: true, compress: false }); var chunks = [];
    doc.on('data', function (d) { chunks.push(d); });
    var done = new Promise(function (res) { doc.on('end', function () { res(concatBytes(chunks)); }); });

    // merge map: master addr -> box ; slave addrs skipped
    var mergeOf = {}, slave = {};
    (ws['!merges'] || []).forEach(function (m) {
      var key = colName(m.s.c) + (m.s.r + 1); mergeOf[key] = m;
      for (var rr = m.s.r; rr <= m.e.r; rr++) for (var cc = m.s.c; cc <= m.e.c; cc++) { var a = colName(cc) + (rr + 1); if (a !== key) slave[a] = key; }
    });
    function box(p, m) { var c2 = m ? m.e.c : p.c, r2 = m ? m.e.r : p.r; return { x0: colX[p.c], y0: rowY[p.r], x1: colX[c2 + 1], y1: rowY[r2 + 1] }; }
    // pass 1: fills ; pass 2: borders ; pass 3: text (Spire order: fill, border, text)
    var order = Object.keys(cells).concat(Object.keys(slave).filter(function (k) { return !cells[k]; }));
    function styleOf(k) { var c = cells[k]; return c && c.s != null ? styles[c.s] : (cells[slave[k]] ? styles[cells[slave[k]].s] : null); }
    var fills = [];
    order.forEach(function (k) {
      var p = parseA1(k); if (p.c > maxC || p.r > maxR || colHidden[p.c] || rowHidden[p.r] || slave[k]) return; var st = styleOf(k);
      var f = st && st.fill && st.fill.fgColor && argb(st.fill.fgColor); if (!f || (st.fill.pattern && st.fill.pattern !== 'solid')) return;
      var bx = box(p, mergeOf[k]); fills.push({ x0: bx.x0, y0: bx.y0, x1: bx.x1, y1: bx.y1, f: f });
    });
    // Spire emits ONE rectangle per horizontal run of equal colour and equal row span -> coalesce the same way
    fills.sort(function (a, b) { return a.y0 - b.y0 || a.y1 - b.y1 || a.f.localeCompare(b.f) || a.x0 - b.x0; });
    var runs = []; fills.forEach(function (r) { var t = runs[runs.length - 1]; if (t && t.f === r.f && Math.abs(t.y0 - r.y0) < 0.01 && Math.abs(t.y1 - r.y1) < 0.01 && Math.abs(t.x1 - r.x0) < 0.01) t.x1 = r.x1; else runs.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, f: r.f }); });
    runs.forEach(function (r) { doc.save().rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0).fill(r.f).restore(); });
    function line(x0, y0, x1, y1, lw, col) { doc.save().lineWidth(lw).strokeColor(col || '#000000').moveTo(x0, y0).lineTo(x1, y1).stroke().restore(); }
    var edges = [];
    function edge(side, b, spec) {
      if (!spec || !spec.style) return; var h = (side === 'top' || side === 'bottom'), pos = side === 'top' ? b.y0 : side === 'bottom' ? b.y1 : side === 'left' ? b.x0 : b.x1;
      edges.push({ h: h, pos: pos, a: h ? b.x0 : b.y0, b: h ? b.x1 : b.y1, s: spec.style, col: argb(spec.color) || '#000000' });
    }
    // Every DECLARED border is drawn. Known deviation D2 (measured, not reproduced): Spire omits some shared vertical borders (v2 fixture: 21 of 622 edge runs differ);
    // the hypothesis 'the right-hand neighbour object decides' was tested against the reference and REJECTED, so the declared border is kept (visually complete).
    Object.keys(cells).concat(Object.keys(slave)).forEach(function (k) {
      var p = parseA1(k); if (p.c > maxC || p.r > maxR || colHidden[p.c] || rowHidden[p.r]) return;
      var mm = slave[k] ? null : (mergeOf[k] || null), b = box(p, mm); var st = styleOf(k); var bd = (st && st.border) || {};
      edge('top', b, bd.top); edge('left', b, bd.left); edge('bottom', b, bd.bottom); edge('right', b, bd.right);
    });
    // one line per run of touching collinear edges with the same style+colour (Spire draws 36->666.75 as ONE line); identical duplicates (shared edges) collapse
    edges.sort(function (x, y) { return (x.h === y.h ? 0 : x.h ? -1 : 1) || x.pos - y.pos || x.s.localeCompare(y.s) || x.col.localeCompare(y.col) || x.a - y.a; });
    var eruns = []; edges.forEach(function (e) { var t = eruns[eruns.length - 1]; if (t && t.h === e.h && Math.abs(t.pos - e.pos) < 0.01 && t.s === e.s && t.col === e.col && e.a <= t.b + 0.01) t.b = Math.max(t.b, e.b); else eruns.push({ h: e.h, pos: e.pos, a: e.a, b: e.b, s: e.s, col: e.col }); });
    eruns.forEach(function (e) {
      function seg(off, lw, cl, inset) { var a0 = e.a + (inset || 0); if (e.h) line(a0, e.pos + off, e.b, e.pos + off, lw, cl); else line(e.pos + off, a0, e.pos + off, e.b, lw, cl); }
      if (e.s === 'double') { seg(-0.667, 1.334, e.col); seg(0.667, 1.334, e.col); seg(0, 0.834, '#FFFFFF', 0.5); }          // Spire insets the white gap line by 0.5pt at its start
      else if (e.s === 'medium' || e.s === 'mediumDashed' || e.s === 'mediumDashDot') seg(0, 2.0, e.col);
      else if (e.s === 'thick') seg(0, 3.0, e.col);
      else seg(0, 0, e.col);                                    // thin / hair / dotted / dashed -> hairline (Spire: lw 0)
    });
    var fmtNum = opts.formatNumber || function (fmt, v) { return String(v); };
    var fonts = opts.fonts || { resolve: function () { return 'Helvetica'; } };
    Object.keys(cells).forEach(function (k) {
      var c = cells[k], p = parseA1(k); if (slave[k] || colHidden[p.c] || rowHidden[p.r] || p.c > maxC) return;
      if (c.t === 'z' || (c.t === 's' && c.v === '')) return;
      var st = c.s != null ? styles[c.s] : null, b = box(p, mergeOf[k]);
      var text = c.t === 'n' ? fmtNum((st && st.numFmt) || c.z || 'General', c.v) : c.t === 'b' ? (c.v ? 'TRUE' : 'FALSE') : String(c.v);
      var fnt = (st && st.font) || {}, size = fnt.size || 10, fpath = fonts.resolve(fnt.name || 'Arial', !!fnt.bold, !!fnt.italic, 'A');   // vertical metrics from the Latin font
      function fontFor(run) { return fonts.resolve(fnt.name || 'Arial', !!fnt.bold, !!fnt.italic, run.lao ? 'ກ' : run.th ? 'ก' : 'A'); }
      function measure(str) { var w = 0; runsOf(str).forEach(function (r) { doc.font(fontFor(r)).fontSize(size); w += doc.widthOfString(r.t); }); return w; }
      doc.font(fpath).fontSize(size); var ascent = doc._font.ascender / 1000 * size, descent = -doc._font.descender / 1000 * size, lh = opts.lineHeightFactor ? size * opts.lineHeightFactor : (ascent + descent + (doc._font.lineGap || 0) / 1000 * size);
      var al = st && st.alignment || {}, h = (al.horizontal && al.horizontal !== 'general') ? al.horizontal : (c.t === 'n' ? 'right' : 'left'), v = al.vertical || 'bottom', wrap = !!al.wrapText;
      var inner = { x0: b.x0 + 2, x1: b.x1 - 2 }, w = inner.x1 - inner.x0;
      var lines = [text];
      if (wrap) { lines = []; text.split('\n').forEach(function (para) { var cur = ''; para.split(' ').forEach(function (wd) { var t = cur ? cur + ' ' + wd : wd; if (cur && measure(t) > w) { lines.push(cur); cur = wd; } else cur = t; }); lines.push(cur); }); }
      var boxH = lines.length * lh, top;
      if (v === 'top') top = b.y0; else if (v === 'center' || v === 'middle') top = b.y0 + ((b.y1 - b.y0) - boxH) / 2; else top = b.y1 - 1 - boxH;
      if (top < b.y0 && v !== 'top') top = b.y0;                                 // text taller than the row: top-aligned (measured)
      doc.save().rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).clip();
      lines.forEach(function (ln, i) {
        var tw = measure(ln), x = h === 'right' ? inner.x1 - tw : (h === 'center' || h === 'centerContinuous') ? b.x0 + ((b.x1 - b.x0) - tw) / 2 : inner.x0 + (al.indent ? al.indent * 9 * 0.75 : 0);
        var fc = fnt.color && argb(fnt.color); doc.fillColor(fc || '#000000');
        var ty = top + i * lh + (lh - (ascent + descent)) / 2, tx = x;
        runsOf(ln).forEach(function (r) { doc.font(fontFor(r)).fontSize(size); doc.text(r.t, tx, ty, { lineBreak: false }); tx += doc.widthOfString(r.t); });
      });
      doc.restore();
    });
    doc.end();
    return done.then(function (buf) { return { pdf: buf, page: [pageW, pageH], range: { rows: maxR + 1, cols: maxC + 1 } }; });
  }

  var API = { renderSheet: renderSheet, PROFILES: PROFILES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.NinjaPdf = API;
})(typeof self !== 'undefined' ? self : this);
