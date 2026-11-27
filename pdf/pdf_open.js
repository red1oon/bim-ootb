// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// pdf_open.js - the ONE owner of "is this PDF open": bytes in, a described document or a NAMED refusal out. Never "opened" with 0 pages.
// Implementing bim-compiler prompts/PDF_EDITOR.md §4.1 (phase P0) - Witness: W-PDFED-P0 (pdf/tests/witness_pdfed_p0.js).
// Reads with the pdf.js build already shipped at modeller/lib/pdfjs/ (Apache-2.0, separate unmodified file). Nothing leaves the device.
// open(pdfjsLib, bytes, { password, keep }) -> { ok:true, pages, text:[per page], outline:[{title,depth}], items:[per page], sizes:[[w,h]], doc? }
//                                            | { ok:false, named:'empty'|'not-a-pdf'|'needs-password'|'wrong-password'|'damaged', message }
// items = the page's text runs in page points, y down: { s, x0, x1, base, h, top, bot } - what the report reader (report_reader.js) reads.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PdfOpen = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function mul(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
  function refuse(named, message) { return { ok: false, named: named, message: String(message || named) }; }
  function head(bytes) { var s = '', n = Math.min(bytes.length, 1024); for (var i = 0; i < n; i++) s += String.fromCharCode(bytes[i]); return s; }
  function pageItems(tc, vt) {
    var out = [], rotated = 0;
    tc.items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var t = mul(vt, it.transform), h = Math.hypot(it.transform[2], it.transform[3]) || it.height || 0;
      if (Math.abs(t[1]) > 1e-3 * (Math.abs(t[0]) || 1)) { rotated++; return; }   // a rotated run is not a table cell: counted, not read
      var sty = tc.styles[it.fontName] || {}, asc = typeof sty.ascent === 'number' && sty.ascent > 0 ? sty.ascent : 0.9, dsc = typeof sty.descent === 'number' && sty.descent < 0 ? sty.descent : -0.22;
      var w = it.width * Math.hypot(vt[0], vt[1]);
      out.push({ s: it.str, x0: t[4], x1: t[4] + w, base: t[5], h: h, top: t[5] - h * asc, bot: t[5] - h * dsc });
    });
    return { items: out, rotated: rotated };
  }
  function flat(nodes, depth, out) { (nodes || []).forEach(function (n) { out.push({ title: String(n.title || ''), depth: depth, dest: n.dest || null }); /*MUT-NEST*/ flat(n.items, depth + 1, out); }); return out; }
  async function open(pdfjsLib, bytes, opts) {
    opts = opts || {};
    if (!bytes || !bytes.length) return refuse('empty', 'the file is empty');
    if (head(bytes).indexOf('%PDF-') < 0) return refuse('not-a-pdf', 'this file is not a PDF (no %PDF- header)');
    var doc;
    try {
      var arg = { data: bytes.slice(0), isEvalSupported: false, useSystemFonts: false, verbosity: 0 };   // a copy: pdf.js takes ownership of the buffer it is given
      if (opts.password != null) arg.password = String(opts.password);
      doc = await pdfjsLib.getDocument(arg).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') return refuse(e.code === 2 ? 'wrong-password' : 'needs-password', e.code === 2 ? 'the password is not correct' : 'this PDF needs a password');
      /*MUT-ERR*/ return refuse('damaged', (e && e.message) || e);
    }
    var out = { ok: true, pages: doc.numPages, text: [], items: [], sizes: [], outline: [], rotated: 0 };
    try {
      if (!(out.pages > 0)) { await doc.destroy(); return refuse('damaged', 'the file holds no pages'); }
      for (var p = 1; p <= doc.numPages; p++) {
        var page = await doc.getPage(p), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent({ disableCombineTextItems: true }), R = pageItems(tc, vp.transform);
        out.text.push(tc.items.map(function (i) { return i.str + (i.hasEOL ? '\n' : ''); }).join('') /*MUT-TEXT*/); out.items.push(R.items); out.rotated += R.rotated; out.sizes.push([vp.width, vp.height]);
        page.cleanup();
      }
      out.outline = flat(await doc.getOutline(), 0, []);
    } catch (e2) { try { await doc.destroy(); } catch (x) { /* already gone */ } return refuse('damaged', (e2 && e2.message) || e2); }
    if (opts.keep) out.doc = doc; else await doc.destroy();
    return out;
  }
  return { open: open, pageItems: pageItems };
});
