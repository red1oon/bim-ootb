// ⚠ DO NOT REMOVE — prompts/PDF2BIM_VECTOR_PROBE.md §41: PDF -> the sheet model the rules read: stroked paths in page points, y down, and words with their boxes. No rule lives here. W-PD2 measures it against the Python chain's reader.
// Usage: Pdf2DxfReader.read(pdfjsLib, data /* Uint8Array */) -> Promise<{pages:{"1":{paths:[{d,m,sw,col}],words:[[text,xMin,yMin,xMax,yMax]]}}, stats}>
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Pdf2DxfReader = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function mul(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
  function n(v) { return String(Math.round(v * 1e6) / 1e6); }
  function pagePaths(ops, OPS, vt) {
    var last = null, prev = null, out = [], ctm = vt.slice(), stack = [], lw = 1, col = '0%, 0%, 0%', colStack = [], d = [], start = null, hasPath = false, images = 0;
    var P = function (x, y) { return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]; };
    function moveTo(x, y) { var q = P(x, y); start = q; last = q; prev = null; if (d.length && d[d.length - 1].charAt(0) === 'M') d.pop(); d.push('M ' + n(q[0]) + ' ' + n(q[1])); hasPath = true; }   // a move after a move replaces it, as pdftocairo writes it
    function fx(v) { return Math.round(v * 256); }
    function lineTo(x, y) {   // as cairo's path does in its 1/256 fixed point, which the rules were written against: a line to the same point is dropped, a line continuing the last line's direction extends it
      var q = P(x, y), L = d.length ? d[d.length - 1] : '', cu = last;
      if (cu && fx(q[0]) === fx(cu[0]) && fx(q[1]) === fx(cu[1]) && L.charAt(0) === 'L') return;
      if (L.charAt(0) === 'L' && prev && cu) {
        var ax = fx(cu[0]) - fx(prev[0]), ay = fx(cu[1]) - fx(prev[1]), bx = fx(q[0]) - fx(cu[0]), by = fx(q[1]) - fx(cu[1]);
        if ((ax === 0 && ay === 0) || (ax * by - ay * bx === 0 && ax * bx + ay * by > 0)) { d[d.length - 1] = 'L ' + n(q[0]) + ' ' + n(q[1]); last = q; return; }
      }
      d.push('L ' + n(q[0]) + ' ' + n(q[1])); prev = cu; last = q;
    }
    function curve(a, b, c, e, f, g) { var p = P(a, b), q = P(c, e), r = P(f, g); last = r; prev = null; d.push('C ' + n(p[0]) + ' ' + n(p[1]) + ' ' + n(q[0]) + ' ' + n(q[1]) + ' ' + n(r[0]) + ' ' + n(r[1])); }
    function close() { if (d.length && d[d.length - 1].charAt(0) === 'M') return;   /* nothing drawn since the last move: a close does nothing */ d.push('Z'); if (start) { d.push('M ' + n(start[0]) + ' ' + n(start[1])); last = start; prev = null; } }   // the rules' closed-rectangle test counts a return to the start, as pdftocairo writes it
    function paint(stroke, closeIt) { if (closeIt) close(); if (stroke && hasPath && d.length) out.push({ d: d.join(' '), m: [1, 0, 0, 1, 0, 0], sw: (lw * Math.hypot(ctm[0], ctm[1])) || 0.12, col: col }); d = []; start = null; hasPath = false; }
    var cur = [0, 0];
    for (var i = 0; i < ops.fnArray.length; i++) {
      var fn = ops.fnArray[i], a = ops.argsArray[i];
      switch (fn) {
        case OPS.save: stack.push(ctm.slice()); colStack.push([lw, col]); break;
        case OPS.restore: if (stack.length) { ctm = stack.pop(); var c0 = colStack.pop(); lw = c0[0]; col = c0[1]; } break;
        case OPS.transform: ctm = mul(ctm, a); break;
        case OPS.setLineWidth: lw = a[0]; break;
        case OPS.setStrokeRGBColor: col = (a[0] / 2.55) + '%, ' + (a[1] / 2.55) + '%, ' + (a[2] / 2.55) + '%'; break;
        case OPS.paintImageXObject: case OPS.paintInlineImageXObject: case OPS.paintImageMaskXObject: case OPS.paintJpegXObject: images++; break;
        case OPS.constructPath:
          var sub = a[0], args = a[1], k = 0;
          for (var j = 0; j < sub.length; j++) {
            var o = sub[j];
            if (o === OPS.moveTo) { moveTo(args[k], args[k + 1]); cur = [args[k], args[k + 1]]; k += 2; }
            else if (o === OPS.lineTo) { lineTo(args[k], args[k + 1]); cur = [args[k], args[k + 1]]; k += 2; }
            else if (o === OPS.curveTo) { curve(args[k], args[k + 1], args[k + 2], args[k + 3], args[k + 4], args[k + 5]); cur = [args[k + 4], args[k + 5]]; k += 6; }
            else if (o === OPS.curveTo2) { curve(cur[0], cur[1], args[k], args[k + 1], args[k + 2], args[k + 3]); cur = [args[k + 2], args[k + 3]]; k += 4; }
            else if (o === OPS.curveTo3) { curve(args[k], args[k + 1], args[k + 2], args[k + 3], args[k + 2], args[k + 3]); cur = [args[k + 2], args[k + 3]]; k += 4; }
            else if (o === OPS.closePath) close();
            else if (o === OPS.rectangle) { var x = args[k], y = args[k + 1], w = args[k + 2], h = args[k + 3]; k += 4; moveTo(x, y); lineTo(x + w, y); lineTo(x + w, y + h); lineTo(x, y + h); close(); cur = [x, y]; }
          }
          break;
        case OPS.stroke: case OPS.fillStroke: case OPS.eoFillStroke: paint(true, false); break;
        case OPS.closeStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke: paint(true, true); break;
        case OPS.fill: case OPS.eoFill: case OPS.endPath: paint(false, false); break;
      }
    }
    return { paths: out, images: images };
  }
  function pageWords(tc, vt) {
    var o = [];
    tc.items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var t = mul(vt, it.transform), sty = tc.styles[it.fontName] || {}, size = Math.hypot(it.transform[2], it.transform[3]), asc = typeof sty.ascent === 'number' ? sty.ascent : .9, dsc = typeof sty.descent === 'number' ? sty.descent : -.2;
      // a run may hold several words: the widths are shared out by characters. Upright text only needs x; a rotated run keeps its own direction
      var str = it.str, L = str.length, re = /\S+/g, m, ux = t[0] / (Math.hypot(t[0], t[1]) || 1), uy = t[1] / (Math.hypot(t[0], t[1]) || 1), W = it.width * Math.hypot(vt[0], vt[1]);
      while ((m = re.exec(str))) {
        var a = W * m.index / L, b = W * (m.index + m[0].length) / L, x0 = t[4] + ux * a, y0 = t[5] + uy * a, x1 = t[4] + ux * b, y1 = t[5] + uy * b, top = size * asc, bot = size * dsc;
        var X = [x0 + (uy) * top, x0 + (uy) * bot, x1 + (uy) * top, x1 + (uy) * bot], Y = [y0 - ux * top, y0 - ux * bot, y1 - ux * top, y1 - ux * bot];
        o.push([m[0], Math.min.apply(null, X), Math.min.apply(null, Y), Math.max.apply(null, X), Math.max.apply(null, Y)]);
      }
    });
    return o;
  }
  async function read(pdfjsLib, data, onPage) {
    var doc = await pdfjsLib.getDocument({ data: data, isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise, pages = {}, stats = { pages: doc.numPages, paths: 0, words: 0, images: 0, perPage: {} };
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p), vp = page.getViewport({ scale: 1 }), vt = vp.transform, ops = await page.getOperatorList(), tc = await page.getTextContent({ disableCombineTextItems: true }), R = pagePaths(ops, pdfjsLib.OPS, vt);
      pages[String(p)] = { paths: R.paths, words: pageWords(tc, vt) }; stats.paths += R.paths.length; stats.words += pages[String(p)].words.length; stats.images += R.images; stats.perPage[p] = { paths: R.paths.length, words: pages[String(p)].words.length, images: R.images };
      page.cleanup(); if (onPage) onPage(p, doc.numPages);
    }
    await doc.destroy();
    return { pages: pages, stats: stats };
  }
  return { read: read, pagePaths: pagePaths, pageWords: pageWords };
});
