// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// pdf_write.js - numbers-only, in-place PDF write-back: a number changed in the sheet is rewritten in the SAME PDF, in the box
//   the report reader's source map names. No reflow, nothing else touched, the old glyphs really gone (a true rewrite, not an
//   appended revision), a refusal always named.
// Implementing bim-compiler prompts/PDF_EDITOR.md §4.3 (phase P4, narrow cut) - Witness: W-PDF-WRITE (pdf/tests/witness_pdf_write.js).
// Clean room: written from ISO 32000-2 (§7.5 file structure, §8.4 graphics state, §9 text and fonts) and our own measurements.
// No library: Flate through the platform's own DecompressionStream / CompressionStream (browser and node 18+).
// rewriteNumbers(bytes, edits, { substitute }) -> Promise<{ ok, bytes, changes:[...], refused:[{ cell, reason, message }] }>
//   edit = { page, box:[x0,y0,x1,y1], oldText, newText, cell?, align? } - page points, y down, as report_reader.js maps a cell.
//   ALL OR NOTHING: one refused edit -> ok:false and `bytes` is the input, unchanged.
// rewriteText(bytes, edits, { substitute }) -> the same, for ANY text run (SHEET_FRONT_DOOR §18.5); a missing glyph takes another face of the family, else the closest
//   standard PDF font (Helvetica / Times / Courier, from the FontDescriptor: §18.6), added to the page's resources and stated in change.fontSub; Thai and other shaped
//   scripts are refused by name (no standard font has them). listRuns(bytes, page) -> every run with its box and why it is locked (lockOf: the one owner).
// applyToItems(pages, edits) -> the same edits on the reader's input (so the reader's own adds-up rule judges the EDITED sheet).
// formatLike(columnTexts, typedText) -> the typed number printed the way its column is printed (no float arithmetic).
// alignOf(readResult, cell) -> { align:'right'|'center'|'left', decided } from the edge the column's number cells share (the source map).
// record(SheetHistory, history, snapshot, changes, actor, at, sheet?) -> one S9 journal entry, one CELL_SET per applied change.
// embedFile(bytes, name, data) -> Promise<{ ok, bytes, replaced, refused }> - ONE embedded file stream (ISO 32000-2 §7.11.4) listed in the
//   catalog's /Names /EmbeddedFiles (§7.9.6); saving again replaces it in place. PDF_EDITOR.md §4.5 - Witness: W-PDF-HISTORY (pdf/tests/witness_pdf_history.js).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./report_reader.js')); else root.PdfWrite = factory(root.ReportReader); })(typeof self !== 'undefined' ? self : this, function (RR) {
  'use strict';
  var BOX_TOL = 0.5, FIT_TOL = 0.01, I = [1, 0, 0, 1, 0, 0];
  var WS = { 0: 1, 9: 1, 10: 1, 12: 1, 13: 1, 32: 1 }, DELIM = { 40: 1, 41: 1, 60: 1, 62: 1, 91: 1, 93: 1, 123: 1, 125: 1, 47: 1, 37: 1 };
  function log(s) { if (typeof console !== 'undefined') console.log(s); }
  function fail(named, message) { var e = new Error(message || named); e.named = named; return e; }
  function squash(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
  function latin1(b, s, e) { var out = ''; for (var i = s; i < e; i++) out += String.fromCharCode(b[i]); return out; }
  function bytesOf(str) { var u = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255; return u; }
  function concat(parts) { var n = 0; parts.forEach(function (p) { n += p.length; }); var out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out; }
  function indexOf(b, word, from, to) { var n = word.length, end = Math.min(to == null ? b.length : to, b.length) - n; outer: for (var i = from || 0; i <= end; i++) { for (var j = 0; j < n; j++) if (b[i + j] !== word.charCodeAt(j)) continue outer; return i; } return -1; }
  function lastIndexOf(b, word) { var n = word.length; outer: for (var i = b.length - n; i >= 0; i--) { for (var j = 0; j < n; j++) if (b[i + j] !== word.charCodeAt(j)) continue outer; return i; } return -1; }
  function fmt(v) { var s = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s; }
  function hexv(c) { return c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1; }
  function hex4(c) { return ('000' + c.toString(16)).slice(-4); }
  function hexN(c, bpc) { return bpc === 1 ? ('0' + (c & 255).toString(16)).slice(-2) : hex4(c); }

  // ── WinAnsiEncoding (ISO 32000-2 Annex D) and the standard PDF fonts (SHEET_FRONT_DOOR §18.5-18.6: the closest standard font when a run's own font lacks a glyph) ──
  // Widths: the Adobe Core 14 AFM metrics (Copyright (c) 1985, 1987, 1989, 1990, 1997 Adobe Systems Incorporated. All Rights Reserved. "may be used, copied, and
  //   distributed for any purpose and without charge, with or without modification, provided that all copyright notices are retained"), put in WinAnsi order 32..255.
  //   Modified: only the advance widths are kept. Oblique faces share their upright widths; Courier is 600 throughout.
  var WIN = (function () { var t = {}, x = { 128: 0x20AC, 130: 0x201A, 131: 0x0192, 132: 0x201E, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x02C6, 137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017D, 145: 0x2018, 146: 0x2019, 147: 0x201C, 148: 0x201D, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x02DC, 153: 0x2122, 154: 0x0161, 155: 0x203A, 156: 0x0153, 158: 0x017E, 159: 0x0178 };
    for (var c = 32; c < 256; c++) { var u = c < 127 || c >= 160 ? c : x[c]; if (u) t[c] = String.fromCharCode(u); } return t; })();
  var STDW = {
    'Helvetica': '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,0,0,333,556,537,278,333,0,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500',
    'Helvetica-Bold': '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,0,0,333,611,556,278,333,0,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556',
    'Times-Roman': '250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,0,500,0,333,500,444,1000,500,500,333,1000,556,333,889,0,611,0,0,333,333,444,444,350,500,1000,333,980,389,333,722,0,444,722,250,333,500,500,500,500,200,500,333,760,276,500,564,333,760,333,400,564,0,0,333,500,453,250,333,0,310,500,750,750,750,444,722,722,722,722,722,722,889,667,611,611,611,611,333,333,333,333,722,722,722,722,722,722,722,564,722,722,722,722,722,722,556,500,444,444,444,444,444,444,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,564,500,500,500,500,500,500,500,500',
    'Times-Bold': '250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,0,500,0,333,500,500,1000,500,500,333,1000,556,333,1000,0,667,0,0,333,333,500,500,350,500,1000,333,1000,389,333,722,0,444,722,250,333,500,500,500,500,220,500,333,747,300,500,570,333,747,333,400,570,0,0,333,556,540,250,333,0,330,500,750,750,750,500,722,722,722,722,722,722,1000,722,667,667,667,667,389,389,389,389,722,722,778,778,778,778,778,570,778,722,722,722,722,722,611,556,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,500,556,500',
    'Times-Italic': '250,333,420,500,500,833,778,214,333,333,500,675,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,675,675,675,500,920,611,611,667,722,611,611,722,722,333,444,667,556,833,667,722,611,722,611,500,556,722,611,833,611,556,556,389,278,389,422,500,333,500,500,444,500,444,278,500,500,278,278,444,278,722,500,500,500,500,389,389,278,500,444,667,444,444,389,400,275,400,541,0,500,0,333,500,556,889,500,500,333,1000,500,333,944,0,556,0,0,333,333,556,556,350,500,889,333,980,389,333,667,0,389,556,250,389,500,500,500,500,275,500,333,760,276,500,675,333,760,333,400,675,0,0,333,500,523,250,333,0,310,500,750,750,750,500,611,611,611,611,611,611,889,667,611,611,611,611,333,333,333,333,722,667,722,722,722,722,722,675,722,722,722,722,722,556,611,500,500,500,500,500,500,500,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,675,500,500,500,500,500,444,500,444',
    'Times-BoldItalic': '250,389,555,500,500,833,778,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,832,667,667,667,722,667,667,722,778,389,500,667,611,889,722,722,611,722,667,556,611,722,667,889,667,611,611,333,278,333,570,500,333,500,500,444,500,444,333,500,556,278,278,500,278,778,556,500,500,500,389,389,278,556,444,667,500,444,389,348,220,348,570,0,500,0,333,500,500,1000,500,500,333,1000,556,333,944,0,611,0,0,333,333,500,500,350,500,1000,333,1000,389,333,722,0,389,611,250,389,500,500,500,500,220,500,333,747,266,500,606,333,747,333,400,570,0,0,333,576,500,250,333,0,300,500,750,750,750,500,667,667,667,667,667,667,944,667,667,667,667,667,389,389,389,389,722,722,722,722,722,722,722,570,722,722,722,722,722,611,611,500,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,444,500,444'
  };
  var STD_FACES = { 'Helvetica': 'Helvetica', 'Helvetica-Bold': 'Helvetica-Bold', 'Helvetica-Oblique': 'Helvetica', 'Helvetica-BoldOblique': 'Helvetica-Bold', 'Times-Roman': 'Times-Roman', 'Times-Bold': 'Times-Bold',
    'Times-Italic': 'Times-Italic', 'Times-BoldItalic': 'Times-BoldItalic', 'Courier': '', 'Courier-Bold': '', 'Courier-Oblique': '', 'Courier-BoldOblique': '' };
  var SHAPED = /[\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u1780-\u17FF]/;
  function scriptOf(s) { var c = (SHAPED.exec(s) || [''])[0].charCodeAt(0); return c >= 0x0E00 && c <= 0x0E7F ? 'Thai' : c >= 0x0E80 && c <= 0x0EFF ? 'Lao' : c >= 0x0590 && c <= 0x05FF ? 'Hebrew' : c >= 0x0600 && c <= 0x08FF ? 'Arabic' : c >= 0x0900 && c <= 0x0DFF ? 'Indic' : c >= 0x1780 && c <= 0x17FF ? 'Khmer' : c >= 0x1000 && c <= 0x109F ? 'Myanmar' : 'Tibetan'; }
  function winCode(ch) { for (var c in WIN) if (WIN[c] === ch) return Number(c); return -1; }
  // a standard font as the writer sees it: one-byte WinAnsi codes, the AFM widths
  function stdFont(base) {
    var face = STD_FACES[base], ws = face ? STDW[face].split(',').map(Number) : null, f = { name: base, family: base.replace(/-.*$/, ''), ok: true, std: true, why: '', bpc: 1, uni: {}, code: {}, w: {}, dw: 0 };
    for (var c = 32; c < 256; c++) if (WIN[c]) { f.uni[c] = WIN[c]; if (!(WIN[c] in f.code)) f.code[WIN[c]] = c; f.w[c] = ws ? ws[c - 32] : 600; }
    return f;
  }

  // ── tokens (ISO 32000-2 §7.2-7.3): one lexer for the file's objects, the content stream and the ToUnicode map ──
  function Lex(b, pos, end) { this.b = b; this.pos = pos || 0; this.end = end == null ? b.length : end; }
  Lex.prototype.next = function () {
    var b = this.b, end = this.end, c;
    for (;;) { if (this.pos >= end) return null; c = b[this.pos]; if (WS[c]) this.pos++; else if (c === 37) { while (this.pos < end && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++; } else break; }
    var s = this.pos, p, out;
    if (c === 47) {                                                              // /Name
      p = s + 1; out = ''; while (p < end && !WS[b[p]] && !DELIM[b[p]]) { if (b[p] === 35 && hexv(b[p + 1]) >= 0 && hexv(b[p + 2]) >= 0) { out += String.fromCharCode(hexv(b[p + 1]) * 16 + hexv(b[p + 2])); p += 3; } else out += String.fromCharCode(b[p++]); }
      this.pos = p; return { t: 'name', v: out, s: s, e: p };
    }
    if (c === 40) {                                                              // (literal string)
      out = []; var depth = 1; p = s + 1;
      while (p < end && depth > 0) {
        var ch = b[p++];
        if (ch === 92) { var d = b[p++]; if (d === 110) out.push(10); else if (d === 114) out.push(13); else if (d === 116) out.push(9); else if (d === 98) out.push(8); else if (d === 102) out.push(12); else if (d >= 48 && d <= 55) { var o = d - 48; for (var k = 0; k < 2 && b[p] >= 48 && b[p] <= 55; k++) o = o * 8 + b[p++] - 48; out.push(o & 255); } else if (d === 13) { if (b[p] === 10) p++; } else if (d !== 10) out.push(d); }
        else if (ch === 40) { depth++; out.push(ch); } else if (ch === 41) { depth--; if (depth) out.push(ch); } else out.push(ch);
      }
      this.pos = p; return { t: 'str', v: out, s: s, e: p };
    }
    if (c === 60 && b[s + 1] === 60) { this.pos = s + 2; return { t: '<<', s: s, e: s + 2 }; }
    if (c === 60) {                                                              // <hex string>
      out = []; p = s + 1; var hi = -1; while (p < end && b[p] !== 62) { var x = hexv(b[p++]); if (x < 0) continue; if (hi < 0) hi = x; else { out.push(hi * 16 + x); hi = -1; } } if (hi >= 0) out.push(hi * 16);
      this.pos = p + 1; return { t: 'str', v: out, hex: true, s: s, e: p + 1 };
    }
    if (c === 62 && b[s + 1] === 62) { this.pos = s + 2; return { t: '>>', s: s, e: s + 2 }; }
    if (c === 91 || c === 93) { this.pos = s + 1; return { t: c === 91 ? '[' : ']', s: s, e: s + 1 }; }
    p = s; while (p < end && !WS[b[p]] && !DELIM[b[p]]) p++; if (p === s) p = s + 1;
    var w = latin1(b, s, p); this.pos = p;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return { t: 'num', v: Number(w), int: /^[+-]?\d+$/.test(w), s: s, e: p };
    return { t: 'kw', v: w, s: s, e: p };
  };
  // values: number | {name} | {str,hex} | [array] | {dict} | {ref,gen} | true | false | null | {kw}
  function readVal(lx, refs, tok) {
    var t = tok || lx.next(); if (!t) return undefined;
    if (t.t === 'num') { if (refs && t.int) { var save = lx.pos, a = lx.next(); if (a && a.t === 'num' && a.int) { var r = lx.next(); if (r && r.t === 'kw' && r.v === 'R') return { ref: t.v, gen: a.v }; } lx.pos = save; } return t.v; }
    if (t.t === 'name') return { name: t.v };
    if (t.t === 'str') return { str: t.v, hex: !!t.hex };
    if (t.t === '[') { var arr = []; for (;;) { var u = lx.next(); if (!u || u.t === ']') return arr; arr.push(readVal(lx, refs, u)); } }
    if (t.t === '<<') { var d = {}; for (;;) { var k = lx.next(); if (!k || k.t === '>>') return { dict: d }; if (k.t === 'name') d[k.v] = readVal(lx, refs); } }
    if (t.t === 'kw') return t.v === 'true' ? true : t.v === 'false' ? false : t.v === 'null' ? null : { kw: t.v };
    return undefined;
  }
  function escName(n) { var s = ''; for (var i = 0; i < n.length; i++) { var c = n.charCodeAt(i); s += c < 33 || c > 126 || DELIM[c] || c === 35 ? '#' + ('0' + c.toString(16)).slice(-2) : n[i]; } return s; }
  function ser(v) {
    if (v === null || v === undefined) return 'null'; if (v === true || v === false) return String(v); if (typeof v === 'number') return fmt(v);
    if (Array.isArray(v)) return '[' + v.map(ser).join(' ') + ']';
    if (v.name != null) return '/' + escName(v.name); if (v.ref != null) return v.ref + ' ' + v.gen + ' R';
    if (v.str) return '<' + v.str.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('') + '>';
    if (v.dict) return '<<' + Object.keys(v.dict).map(function (k) { return '/' + escName(k) + ' ' + ser(v.dict[k]); }).join(' ') + '>>';
    return 'null';
  }

  // ── Flate (ISO 32000-2 §7.4.4) through the platform ──
  async function pipe(u8, Ctor) {
    if (typeof Ctor !== 'function' || typeof Response !== 'function') throw fail('filter-not-supported', 'this host has no DecompressionStream / CompressionStream');
    var ts = new Ctor('deflate'), w = ts.writable.getWriter(), p = w.write(u8).then(function () { return w.close(); }); p.catch(function () { /* reported through the readable side */ });
    try { return new Uint8Array(await new Response(ts.readable).arrayBuffer()); } catch (e) { throw fail('damaged', 'a compressed stream could not be read (' + (e && e.message || e) + ')'); }
  }
  function inflate(u8) { return pipe(u8, typeof DecompressionStream !== 'undefined' ? DecompressionStream : null); }
  function deflate(u8) { return pipe(u8, typeof CompressionStream !== 'undefined' ? CompressionStream : null); }

  // ── the file (ISO 32000-2 §7.5): classic cross-reference table(s), objects, page tree ──
  function PdfFile(b) { this.b = b; this.xref = {}; this.bounds = []; this.trailer = null; this.cache = {}; }
  PdfFile.prototype.load = function () {
    var b = this.b; if (indexOf(b, '%PDF-', 0, 1024) < 0) throw fail('not-a-pdf', 'this file is not a PDF (no %PDF- header)');
    var sx = lastIndexOf(b, 'startxref'); if (sx < 0) throw fail('damaged', 'the file has no startxref');
    var t = new Lex(b, sx + 9).next(); if (!t || t.t !== 'num') throw fail('damaged', 'startxref holds no offset');
    var off = t.v, seen = {};
    while (off != null && !seen[off]) {
      seen[off] = 1; this.bounds.push(off);
      var lx = new Lex(b, off); t = lx.next();
      if (!t || t.t !== 'kw' || t.v !== 'xref') throw t && t.t === 'num' ? fail('xref-stream', 'this PDF keeps its cross-reference in a stream (PDF 1.5+): not in this cut') : fail('damaged', 'no cross-reference table at startxref');
      for (;;) {
        t = lx.next(); if (!t) throw fail('damaged', 'the cross-reference table has no trailer'); if (t.t === 'kw' && t.v === 'trailer') break;
        var cnt = lx.next(); if (t.t !== 'num' || !cnt || cnt.t !== 'num') throw fail('damaged', 'a cross-reference subsection is malformed');
        for (var i = 0; i < cnt.v; i++) { var o = lx.next(), g = lx.next(), f = lx.next(); if (!f || o.t !== 'num' || g.t !== 'num') throw fail('damaged', 'a cross-reference entry is malformed'); var n = t.v + i; if (f.v === 'n') this.bounds.push(o.v); if (!(n in this.xref)) this.xref[n] = { off: o.v, gen: g.v, use: f.v === 'n' }; }
      }
      var tr = readVal(lx, true); if (!tr || !tr.dict) throw fail('damaged', 'the trailer is not a dictionary');
      if (tr.dict.XRefStm != null) throw fail('xref-stream', 'this PDF keeps part of its cross-reference in a stream (hybrid file): not in this cut');
      if (!this.trailer) this.trailer = tr.dict;
      off = typeof tr.dict.Prev === 'number' ? tr.dict.Prev : null;
    }
    if (this.trailer.Encrypt != null) throw fail('encrypted', 'this PDF is encrypted: writing encrypted files is phase P7');
    this.bounds = this.bounds.filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (x, y) { return x - y; });
    return this;
  };
  PdfFile.prototype.obj = function (n) {
    if (this.cache[n]) return this.cache[n]; var x = this.xref[n]; if (!x || !x.use) return null;
    var b = this.b, lx = new Lex(b, x.off), a = lx.next(), g = lx.next(), k = lx.next();
    if (!a || a.v !== n || !g || !k || k.v !== 'obj') throw fail('damaged', 'object ' + n + ' is not at its cross-reference offset');
    var o = this.cache[n] = { num: n, gen: g.v, off: x.off, val: readVal(lx, true), stream: null }, t = lx.next();
    if (t && t.t === 'kw' && t.v === 'stream' && o.val && o.val.dict) {
      var p = t.e; if (b[p] === 13) p++; if (b[p] === 10) p++;
      var len = this.res(o.val.dict.Length), q = typeof len === 'number' ? p + len : -1; while (q >= 0 && q < b.length && WS[b[q]]) q++;
      if (q < 0 || indexOf(b, 'endstream', q, q + 9) !== q) { var es = indexOf(b, 'endstream', p); if (es < 0) throw fail('damaged', 'stream ' + n + ' has no endstream'); len = es - p; if (b[p + len - 1] === 10) len--; if (b[p + len - 1] === 13) len--; }
      o.stream = { start: p, len: len };
    }
    return o;
  };
  PdfFile.prototype.res = function (v) { for (var i = 0; v && v.ref != null && i < 32; i++) { var o = this.obj(v.ref); v = o ? o.val : null; } return v; };
  PdfFile.prototype.data = async function (o) {
    var raw = this.b.subarray(o.stream.start, o.stream.start + o.stream.len), f = this.res(o.val.dict.Filter), dp = this.res(o.val.dict.DecodeParms);
    if (Array.isArray(f)) { if (f.length > 1) throw fail('filter-not-supported', 'stream ' + o.num + ' has ' + f.length + ' filters'); f = f.length ? this.res(f[0]) : null; dp = Array.isArray(dp) ? this.res(dp[0]) : dp; }
    if (f == null) return { bytes: raw, flate: false };
    if (f.name !== 'FlateDecode' || (dp && dp.dict && (this.res(dp.dict.Predictor) || 1) > 1)) throw fail('filter-not-supported', 'stream ' + o.num + ' uses ' + (f.name || 'an unknown filter') + (dp ? ' with a predictor' : ''));
    return { bytes: await inflate(raw), flate: true };
  };
  PdfFile.prototype.pages = function () {
    var out = [], self = this, root = this.res(this.trailer.Root); if (!root || !root.dict) throw fail('damaged', 'the file has no catalog');
    (function walk(ref, inh, depth) {
      var node = self.res(ref); if (!node || !node.dict || depth > 64) return; var d = node.dict, mine = {};
      ['Resources', 'MediaBox', 'CropBox', 'Rotate'].forEach(function (k) { mine[k] = d[k] != null ? d[k] : inh[k]; });
      mine.ResFrom = d.Resources != null ? (ref && ref.ref != null ? ref.ref : null) : inh.ResFrom;   // the page-tree node whose dictionary holds /Resources (§18.5: a standard font is added there)
      var kids = self.res(d.Kids); if (Array.isArray(kids)) kids.forEach(function (k) { walk(k, mine, depth + 1); }); else out.push({ dict: d, inh: mine, num: ref && ref.ref != null ? ref.ref : null });
    })(root.dict.Pages, {}, 0);
    if (!out.length) throw fail('damaged', 'the file holds no pages');
    return out;
  };
  PdfFile.prototype.contents = function (pg) {
    var c = pg.dict.Contents, self = this; if (c == null) return [];
    if (c.ref != null) { var o = this.obj(c.ref); if (o && o.stream) return [c.ref]; c = o ? o.val : null; }
    return Array.isArray(c) ? c.map(function (r) { if (!r || r.ref == null || !self.obj(r.ref) || !self.obj(r.ref).stream) throw fail('damaged', 'a page content entry is not a stream'); return r.ref; }) : [];
  };
  // a true rewrite: every object but the replaced ones is copied byte for byte, then ONE new cross-reference table
  PdfFile.prototype.build = function (replaced) {
    var b = this.b, self = this, bounds = this.bounds, live = Object.keys(this.xref).map(Number).filter(function (n) { return n > 0 && self.xref[n].use; }).sort(function (x, y) { return self.xref[x].off - self.xref[y].off; });
    var parts = [b.subarray(0, bounds[0])], pos = bounds[0], at = {}, size = Number(this.trailer.Size) || 0;
    live.forEach(function (n) {
      var x = self.xref[n], next = b.length; for (var i = 0; i < bounds.length; i++) if (bounds[i] > x.off) { next = bounds[i]; break; }
      var piece = replaced[n] || b.subarray(x.off, next), off = /*MUT-XREF*/ pos; at[n] = off; parts.push(piece); pos += piece.length; if (n >= size) size = n + 1;
    });
    Object.keys(replaced).map(Number).filter(function (n) { return !(self.xref[n] && self.xref[n].use); }).sort(function (x, y) { return x - y; }).forEach(function (n) { at[n] = pos; parts.push(replaced[n]); pos += replaced[n].length; if (n >= size) size = n + 1; });   // objects the file did not have (§4.5)
    var free = [0]; for (var n = 1; n < size; n++) if (at[n] == null) free.push(n);
    var x = 'xref\n0 ' + size + '\n';
    for (var k = 0; k < size; k++) {
      if (at[k] != null) x += ('0000000000' + at[k]).slice(-10) + ' ' + ('00000' + ((self.xref[k] && self.xref[k].use && self.xref[k].gen) || 0)).slice(-5) + ' n \n';
      else { var nx = free[free.indexOf(k) + 1] || 0; x += ('0000000000' + nx).slice(-10) + ' ' + (k === 0 ? '65535' : ('00000' + ((self.xref[k] && self.xref[k].gen) || 0)).slice(-5)) + ' f \n'; }
    }
    var tr = {}; Object.keys(this.trailer).forEach(function (key) { if (key !== 'Prev' && key !== 'XRefStm') tr[key] = self.trailer[key]; }); tr.Size = size;
    parts.push(bytesOf(x + 'trailer\n' + ser({ dict: tr }) + '\nstartxref\n' + pos + '\n%%EOF\n'));
    return concat(parts);
  };

  // ── fonts (ISO 32000-2 §9.7-9.10): Type0 / Identity-H with a ToUnicode map and /W widths ──
  function family(base) { return base.replace(/(PS)?MT$/, '').replace(/[-,](Regular|Bold|Italic|Oblique|BoldItalic|BoldOblique|Medium|Light|SemiBold|Semibold|Black|Roman|Book|It)+$/, '').replace(/PS$/, ''); }
  function readCMap(bytes, font) {
    var lx = new Lex(bytes, 0), t, val = function (a) { var n = 0; a.forEach(function (x) { n = n * 256 + x; }); return n; };
    var u16 = function (a) { var s = ''; for (var i = 0; i + 1 < a.length; i += 2) s += String.fromCharCode(a[i] * 256 + a[i + 1]); return s; };
    var put = function (code, s) { if (!(code in font.uni)) font.uni[code] = s; if (s.length && !(s in font.code)) font.code[s] = code; };
    while ((t = lx.next())) {
      if (t.t !== 'kw') continue;
      if (t.v === 'beginbfchar') { for (;;) { var a = lx.next(); if (!a || a.t !== 'str') break; var d = lx.next(); if (!d || d.t !== 'str') break; put(val(a.v), u16(d.v)); } }
      else if (t.v === 'beginbfrange') {
        for (;;) {
          var lo = lx.next(); if (!lo || lo.t !== 'str') break; var hi = lx.next(), dst = lx.next(); if (!hi || !dst) break;
          if (dst.t === '[') { var k = 0, e; while ((e = lx.next()) && e.t !== ']') if (e.t === 'str') put(val(lo.v) + k++, u16(e.v)); }
          else if (dst.t === 'str') { var base = u16(dst.v), n = val(hi.v) - val(lo.v); for (var j = 0; j <= n && j < 65536 && base.length; j++) put(val(lo.v) + j, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + j)); }
        }
      }
    }
  }
  async function loadFont(F, v) {
    var fd = F.res(v), d = (fd && fd.dict) || {}, nm = function (x) { x = F.res(x); return x && x.name != null ? x.name : ''; }, base = (nm(d.BaseFont) || '?').replace(/^[A-Z]{6}\+/, '');
    var font = { name: base, family: family(base), ok: false, why: '', bpc: 2, uni: {}, code: {}, w: {}, dw: 1000, flags: null, weight: null, italic: /Italic|Oblique/i.test(base) };
    var descr = function (fdv) { var x = F.res(fdv); if (!x || !x.dict) return; var fl = F.res(x.dict.Flags), fw = F.res(x.dict.FontWeight), ia = F.res(x.dict.ItalicAngle); if (typeof fl === 'number') font.flags = fl; if (typeof fw === 'number') font.weight = fw; if (typeof ia === 'number' && ia !== 0) font.italic = true; };
    var st = nm(d.Subtype), tu = d.ToUnicode && d.ToUnicode.ref != null ? F.obj(d.ToUnicode.ref) : null;
    if (st !== 'Type0') {   // one-byte fonts (SHEET_FRONT_DOOR §18.5): decoded through their ToUnicode map, or through WinAnsiEncoding when they name it without /Differences
      font.bpc = 1; font.dw = 0;
      if (!/^(Type1|TrueType|MMType1)$/.test(st)) { font.why = base + ' is a ' + (st || 'unknown') + ' font (its glyphs are drawn as pictures: not editable in this cut)'; return font; }
      var enc = F.res(d.Encoding), encName = enc && enc.name != null ? enc.name : enc && enc.dict ? nm(enc.dict.BaseEncoding) : '', diffs = enc && enc.dict && enc.dict.Differences != null;
      if (tu && tu.stream) readCMap((await F.data(tu)).bytes, font);
      else if (encName === 'WinAnsiEncoding' && !diffs) { for (var wc in WIN) { font.uni[wc] = WIN[wc]; if (!(WIN[wc] in font.code)) font.code[WIN[wc]] = Number(wc); } }
      else { font.why = base + ' has no ToUnicode map and the encoding ' + (encName || 'built into the font') + (diffs ? ' with /Differences' : '') + ': its text cannot be read back for certain'; return font; }
      var fc = F.res(d.FirstChar), ws = F.res(d.Widths);
      if (Array.isArray(ws) && typeof fc === 'number') ws.forEach(function (v, i) { font.w[fc + i] = F.res(v); });
      else if (STD_FACES[base] !== undefined) { var sf = stdFont(base); font.w = sf.w; if (!tu) { font.uni = sf.uni; font.code = sf.code; } }
      else { font.why = base + ' has no /Widths'; return font; }
      if (STD_FACES[base] !== undefined && !d.FontDescriptor) font.std = true;
      descr(d.FontDescriptor); font.ok = true; return font;
    }
    if (nm(d.Encoding) !== 'Identity-H') { font.why = base + ' uses the encoding ' + (nm(d.Encoding) || 'of an embedded CMap') + ' (only Identity-H in this cut)'; return font; }
    if (!tu || !tu.stream) { font.why = base + ' has no ToUnicode map'; return font; }
    var ds = F.res(d.DescendantFonts), desc = Array.isArray(ds) ? F.res(ds[0]) : null; if (!desc || !desc.dict) { font.why = base + ' has no descendant font'; return font; }
    descr(desc.dict.FontDescriptor);
    if (typeof F.res(desc.dict.DW) === 'number') font.dw = F.res(desc.dict.DW);
    var W = F.res(desc.dict.W) || [];
    for (var i = 0; i < W.length;) { var c = F.res(W[i]), nx = F.res(W[i + 1]); if (Array.isArray(nx)) { for (var k = 0; k < nx.length; k++) font.w[c + k] = F.res(nx[k]); i += 2; } else { var w2 = F.res(W[i + 2]); for (var cc = c; cc <= nx; cc++) font.w[cc] = w2; i += 3; } }
    readCMap((await F.data(tu)).bytes, font); font.ok = true; return font;
  }

  // ── the content stream (ISO 32000-2 §8.4, §9.3-9.4): every text run with its font, glyphs, text and extent in page points ──
  function mul(a, b) { return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]; }
  function interpret(streams, fonts, P) {
    var runs = [], g = { ctm: P, clip: null, font: null, fname: null, size: 0, Tc: 0, Tw: 0, Th: 1, TL: 0, Ts: 0 }, stack = [], Tm = I, Tlm = I, st = [], path = { rects: [], other: false, clip: false }, forms = 0;
    function line() { Tlm = mul([1, 0, 0, 1, 0, -g.TL], Tlm); Tm = Tlm; }
    function show(els, si, s, e, pre, carry) {
      var f = g.font, known = !!(f && f.ok), bpc = f ? f.bpc : 1, M = mul(Tm, g.ctm), pen = 0, a0 = null, a1 = 0, text = '', n = 0;
      (Array.isArray(els) ? els : []).forEach(function (el) {
        if (typeof el === 'number') { pen -= el / 1000 * g.size * g.Th; return; }
        if (!el || !el.str) return;
        for (var i = 0; i + bpc <= el.str.length; i += bpc) {
          var c = bpc === 2 ? el.str[i] * 256 + el.str[i + 1] : el.str[i], w = known ? (c in f.w ? f.w[c] : f.dw) : 0;
          if (a0 === null) a0 = pen; pen += (w / 1000 * g.size + g.Tc + (bpc === 1 && c === 32 ? g.Tw : 0)) * g.Th; a1 = pen; n++;
          text += known && c in f.uni ? f.uni[c] : '�';
        }
      });
      if (a0 === null) a0 = 0;
      var flat = M[0] > 0 && Math.abs(M[1]) < 1e-6 * M[0] && Math.abs(M[2]) < 1e-6 * Math.abs(M[3] || 1);
      runs.push({ si: si, s: s, e: e, pre: pre, carry: carry, fname: g.fname, font: f, known: known, why: f ? f.why : 'the font ' + g.fname + ' is not in the page resources', size: g.size, Tc: g.Tc, Tw: g.Tw, Th: g.Th,
        k: M[0], h: g.size * Math.abs(M[3]), pen0: M[4], x0: M[4] + a0 * M[0], x1: M[4] + (n ? a1 - g.Tc * g.Th : 0) * M[0], y: M[5] + g.Ts * M[3], a0: a0, a1: a1, adv: pen, text: text, n: n, clip: g.clip, flat: flat });
      Tm = mul([1, 0, 0, 1, pen, 0], Tm);
    }
    function endPath() {
      if (path.clip) {
        var c = g.ctm, one = path.rects.length === 1 && !path.other && Math.abs(c[1]) < 1e-9 && Math.abs(c[2]) < 1e-9, rect = g.clip ? g.clip.rect : null;
        if (one) { var r = path.rects[0], xa = r[0] * c[0] + c[4], xb = (r[0] + r[2]) * c[0] + c[4], ya = r[1] * c[3] + c[5], yb = (r[1] + r[3]) * c[3] + c[5], nr = [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)]; rect = rect ? [Math.max(rect[0], nr[0]), Math.max(rect[1], nr[1]), Math.min(rect[2], nr[2]), Math.min(rect[3], nr[3])] : nr; }
        g.clip = { rect: rect, complex: !one || !!(g.clip && g.clip.complex) };
      }
      path = { rects: [], other: false, clip: false };
    }
    streams.forEach(function (bytes, si) {
      var lx = new Lex(bytes, 0), t, s0 = -1, carry = st.length > 0;
      while ((t = lx.next())) {
        if (t.t !== 'kw') { if (s0 < 0) s0 = t.s; st.push(readVal(lx, false, t)); continue; }
        var a = st, n = a.length, s = s0 < 0 ? t.s : s0;
        switch (t.v) {
          case 'q': stack.push(Object.assign({}, g)); break;
          case 'Q': if (stack.length) g = stack.pop(); break;
          case 'cm': if (n >= 6) g.ctm = mul(a.slice(-6), g.ctm); break;
          case 'BT': Tm = Tlm = I; break;
          case 'Tf': if (n >= 2) { g.fname = a[n - 2] && a[n - 2].name; g.font = fonts[g.fname] || null; g.size = a[n - 1]; } break;
          case 'Tc': g.Tc = a[n - 1]; break;
          case 'Tw': g.Tw = a[n - 1]; break;
          case 'Tz': g.Th = a[n - 1] / 100; break;
          case 'TL': g.TL = a[n - 1]; break;
          case 'Ts': g.Ts = a[n - 1]; break;
          case 'Td': Tlm = mul([1, 0, 0, 1, a[n - 2], a[n - 1]], Tlm); Tm = Tlm; break;
          case 'TD': g.TL = -a[n - 1]; Tlm = mul([1, 0, 0, 1, a[n - 2], a[n - 1]], Tlm); Tm = Tlm; break;
          case 'Tm': if (n >= 6) Tm = Tlm = a.slice(-6); break;
          case 'T*': line(); break;
          case 'Tj': show([a[n - 1]], si, s, t.e, '', carry); break;
          case 'TJ': show(a[n - 1], si, s, t.e, '', carry); break;
          case '\'': line(); show([a[n - 1]], si, s, t.e, 'T* ', carry); break;
          case '"': if (n >= 3) { g.Tw = a[n - 3]; g.Tc = a[n - 2]; line(); show([a[n - 1]], si, s, t.e, fmt(g.Tw) + ' Tw ' + fmt(g.Tc) + ' Tc T* ', carry); } break;
          case 're': if (n >= 4) path.rects.push(a.slice(-4)); break;
          case 'm': case 'l': case 'c': case 'v': case 'y': case 'h': path.other = true; break;
          case 'W': case 'W*': path.clip = true; break;
          case 'n': case 'f': case 'F': case 'f*': case 'S': case 's': case 'B': case 'B*': case 'b': case 'b*': endPath(); break;
          case 'Do': forms++; break;
          case 'BI': { var u; while ((u = lx.next()) && !(u.t === 'kw' && u.v === 'ID')) { /* the inline image's dictionary */ } var p = lx.pos; while (p < bytes.length && !(WS[bytes[p]] && bytes[p + 1] === 69 && bytes[p + 2] === 73 && (p + 3 >= bytes.length || WS[bytes[p + 3]]))) p++; lx.pos = Math.min(bytes.length, p + 3); break; }
          default: break;
        }
        st = []; s0 = -1; carry = false;
      }
    });
    runs.forms = forms;
    return runs;
  }

  // ── which runs can be written back, ONE owner (SHEET_FRONT_DOOR §18.5 H1): the page's edit layer offers exactly the runs this does not lock, and plan() refuses the same ──
  function lockOf(r) {
    if (!r.n) return { reason: 'empty', message: 'the run draws no glyph' };
    if (!r.flat) return { reason: 'rotated-text', message: 'the text is rotated or skewed' };
    if (!r.known) return { reason: 'font-not-supported', message: r.why };
    if (r.carry) return { reason: 'font-not-supported', message: 'the run is split across two content streams' };
    if (/�/.test(r.text)) return { reason: 'no-unicode', message: 'some glyphs of this run (font ' + r.font.name + ') have no Unicode meaning in the file' };
    if (SHAPED.test(r.text)) return { reason: 'script-not-supported', message: scriptOf(r.text) + ' text: its letters are shaped by the font and no standard PDF font has them (an embedded font is slice B)' };
    return null;
  }
  // the closest standard PDF font (SHEET_FRONT_DOOR §18.6 step 3): family from the FontDescriptor flags (fixed-pitch -> Courier, serif -> Times, else Helvetica),
  //   weight / slant from the name, /FontWeight, /Flags and /ItalicAngle; with no description, the family whose widths fit the run's old text best
  function chooseStd(f, oldText, oldW, tr) {
    var fl = f.flags, bold = /Bold|Black|Heavy|Semi|Demi/i.test(f.name) || (f.weight || 0) >= 600 || !!(fl != null && (fl & 262144)), it = !!f.italic || !!(fl != null && (fl & 64));
    var fams = fl == null ? ['Helvetica', 'Times', 'Courier'] : (fl & 1) ? ['Courier'] : (fl & 2) ? ['Times'] : ['Helvetica'];
    var face = function (fam) { return fam === 'Times' ? (bold ? (it ? 'Times-BoldItalic' : 'Times-Bold') : (it ? 'Times-Italic' : 'Times-Roman')) : fam + (bold || it ? '-' + (bold ? 'Bold' : '') + (it ? 'Oblique' : '') : ''); };
    var best = null;
    fams.forEach(function (fam) {
      var nm = face(fam), sf = stdFont(nm), w = 0, all = true; Array.from(oldText).forEach(function (c) { if (c in sf.code) w += (sf.w[sf.code[c]] / 1000 * tr.size + tr.Tc) * tr.Th; else all = false; });
      var ratio = all && oldW > 0 ? w * tr.k / oldW : null, miss = ratio == null ? 9 : Math.abs(ratio - 1);
      if (!best || miss < best.miss) best = { name: nm, ratio: ratio, miss: miss };
    });
    var why = (fl == null ? 'no font description, best width fit of ' + fams.join('/') : 'described as ' + ((fl & 1) ? 'fixed-pitch' : (fl & 2) ? 'serif' : 'sans-serif')) + (bold ? ', bold' : '') + (it ? ', italic' : '') +
      (best.ratio != null ? ', old text width ' + best.ratio.toFixed(2) + ' of the original' : '');
    return { name: best.name, why: why };
  }
  // ── one edit against the page's runs: a named refusal, or the change and its splices ──
  //   numbers only (PDF_EDITOR §4.3) unless opts.text (SHEET_FRONT_DOOR §18.5: any text run); glyphs from the run's own font, else another face of the SAME family,
  //   else (opts.substitute, WinAnsi text) the closest standard font added to the page's resources (ctx.std), stated (§18.6)
  function plan(edit, runs, fonts, opts, taken, ctx) {
    var no = function (reason, message, more) { return { refuse: Object.assign({ cell: edit.cell || null, page: edit.page, reason: reason, message: message }, more || {}) }; };
    var oldText = String(edit.oldText == null ? '' : edit.oldText).trim(), newText = String(edit.newText == null ? '' : edit.newText).trim(), box = edit.box, text = !!opts.text;
    if (!text && !RR.parseNum(newText)) return no('not-a-number', 'the new text "' + newText + '" is not a number (numbers only in this cut)');
    if (!text && !RR.parseNum(oldText)) return no('not-a-number', 'the cell holds "' + oldText + '", which is not a number (numbers only in this cut)');
    if (text && !newText) return no('empty-text', 'an empty text would remove the cell (deleting is slice B): type the new text');
    /*MUT-DROPTHAI*/
    if (text && SHAPED.test(newText)) return no('script-not-supported', 'no font here can show the ' + scriptOf(newText) + ' text "' + newText + '": its letters are shaped by the font and no standard PDF font has them (an embedded font is slice B)');
    if (!Array.isArray(box) || box.length !== 4 || box.some(function (v) { return typeof v !== 'number' || !isFinite(v); })) return no('bad-edit', 'the edit names no box');
    var inBox = function (r) { var cx = (r.x0 + r.x1) / 2; return r.n > 0 && cx >= box[0] - BOX_TOL && cx <= box[2] + BOX_TOL && r.y >= box[1] - BOX_TOL && r.y <= box[3] + BOX_TOL; };
    var hits = runs.filter(function (r) { return /*MUT-BOX*/ inBox(r); }).sort(function (a, b) { return a.x0 - b.x0; });
    if (!hits.length) return no('no-text-in-box', 'no text is drawn in that box' + (runs.forms ? ' (the page draws ' + runs.forms + ' form(s): text inside a form is not in this cut)' : ''));
    var lk = null; hits.some(function (r) { lk = lockOf(r); return !!lk; }); if (lk) return no(lk.reason, lk.message);
    var found = hits.map(function (r) { return r.text; }).join('');
    if (squash(found) !== squash(oldText)) return no('old-text-not-in-box', 'the box holds "' + found + '", not "' + oldText + '"', { found: found });
    if (hits.some(function (r) { return taken.indexOf(r) >= 0; })) return no('duplicate-edit', 'two edits name the same box');
    var align = edit.align === 'left' ? 'left' : edit.align === 'center' || edit.align === 'centre' ? 'center' : 'right', tr = align === 'left' ? hits[0] : hits[hits.length - 1], f = tr.font;
    if (hits.some(function (r) { return r.fname !== tr.fname || r.size !== tr.size || r.Tc !== tr.Tc || r.Th !== tr.Th || r.si !== tr.si || Math.abs(r.y - tr.y) > 0.01; })) return no('several-fonts', 'the text is drawn in several fonts, sizes or lines');
    var X0 = hits[0].x0, X1 = Math.max.apply(null, hits.map(function (r) { return r.x1; }));
    var chars = Array.from(newText), missing = chars.filter(function (c, i) { return !(c in f.code) && chars.indexOf(c) === i; }), wf = f, sub = null;
    if (missing.length /*MUT-GLYPH*/) {
      var msg = 'the font ' + f.name + ' in this PDF does not carry ' + missing.map(function (c) { return '"' + c + '"'; }).join(', ');
      if (!opts.substitute) return no('glyph-missing', msg, { font: f.name, missing: missing.join('') });
      var cand = Object.keys(fonts).sort().filter(function (k) { var x = fonts[k]; return x !== f && x.ok && !x.std && x.family === f.family && chars.every(function (c) { return c in x.code; }); })[0];
      if (cand) { wf = fonts[cand]; sub = { from: f.name, to: wf.name, resource: cand, missing: missing.join(''), std: false, why: 'another face of the same family (' + f.family + ') in this file holds every glyph' }; }
      else if (ctx && ctx.std && chars.every(function (c) { return winCode(c) >= 0; })) {
        var ch = chooseStd(f, found, X1 - X0, tr), rk = ctx.std(ch.name); wf = fonts[rk];
        sub = { from: f.name, to: wf.name, resource: rk, missing: missing.join(''), std: true, why: 'no face of ' + f.family + ' in this file holds them; closest standard PDF font: ' + ch.why };
      } else return no('glyph-missing', msg + ', no other font of the family ' + f.family + ' on the page carries them' + (chars.some(function (c) { return winCode(c) < 0; }) ? ', and the standard PDF fonts cannot show ' + chars.filter(function (c) { return winCode(c) < 0; }).map(function (c) { return '"' + c + '"'; }).join(', ') : ''), { font: f.name, missing: missing.join('') });
    }
    var unit = tr.size * tr.Th, G = 0, hex = '';
    chars.forEach(function (c) { var code = c in wf.code ? wf.code[c] : 0; hex += hexN(code, wf.bpc); G += ((code in wf.w ? wf.w[code] : wf.dw) / 1000 * tr.size + tr.Tc + (wf.bpc === 1 && code === 32 ? tr.Tw || 0 : 0)) * tr.Th; });
    var Wd = (G - tr.Tc * tr.Th) * tr.k;
    var nx1 = align === 'right' ? X1 : align === 'left' ? X0 + Wd : (X0 + X1) / 2 + Wd / 2, nx0 = nx1 - Wd;
    var skipFit = false; /*MUT-FIT*/
    if (!skipFit) {
      var c = tr.clip && tr.clip.rect, wide = 'the new ' + (text ? 'text' : 'number') + ' needs ' + Wd.toFixed(2) + ' pt';
      if (c && ((nx0 < c[0] - FIT_TOL && nx0 < X0 - FIT_TOL) || (nx1 > c[2] + FIT_TOL && nx1 > X1 + FIT_TOL))) return no('does-not-fit', wide + ', its cell is clipped to ' + (c[2] - c[0]).toFixed(2) + ' pt');
      var over = function (a, b, o) { return Math.min(b, o.x1) - Math.max(a, o.x0); };
      var nb = runs.filter(function (o) { return hits.indexOf(o) < 0 && o.flat && o.n > 0 && squash(o.text) && Math.abs(o.y - tr.y) < 0.5 * tr.h && over(nx0, nx1, o) > FIT_TOL && !(over(X0, X1, o) > FIT_TOL); })[0];
      if (nb) return no('does-not-fit', wide + ' and would reach into "' + nb.text + '" beside it');
    }
    var start = (nx0 - tr.pen0) / tr.k, lead = /*MUT-EDGE*/ -start * 1000 / unit, tail = -(tr.adv - (start + G)) * 1000 / unit, sp = [];
    hits.forEach(function (r) {
      var t;
      if (r !== tr) t = r.pre + '[' + (Math.abs(r.adv) > 1e-9 ? fmt(-r.adv * 1000 / (r.size * r.Th)) : '') + '] TJ';   // keeps its pen advance, loses its glyphs
      else {
        var redbox = ''; /*MUT-REDBOX*/   // the on-screen "font not same" box is the PAGE's, never written here (§18.6 H5)
        t = r.pre + (sub ? '/' + escName(sub.resource) + ' ' + fmt(r.size) + ' Tf ' : '') + '[' + (Math.abs(lead) > 1e-6 ? fmt(lead) + ' ' : '') + '<' + hex + '>' + (Math.abs(tail) > 1e-6 ? ' ' + fmt(tail) : '') + '] TJ' + (sub ? ' /' + escName(r.fname) + ' ' + fmt(r.size) + ' Tf' : '') + redbox;
      }
      sp.push({ si: r.si, s: r.s, e: r.e, text: t }); taken.push(r);
    });
    if (sub) {
      log('§PDFED-FONT-SUB cell=' + (edit.cell || '?') + ' page=' + edit.page + ' from=' + sub.from + ' to=' + sub.to + ' missing="' + sub.missing + '" new="' + newText + '" stated=true');
      log('§EDSHEET-FONT cell=' + (edit.cell || '?') + ' page=' + edit.page + ' from=' + sub.from + ' to=' + sub.to + ' standard=' + sub.std + ' why="' + sub.why + '"');
    }
    var r2 = function (v) { return Math.round(v * 1000) / 1000; };
    return { splices: sp, change: { cell: edit.cell || null, page: edit.page, box: box.slice(), oldText: oldText, newText: newText, font: f.name, size: tr.size, align: align, runs: hits.length, x0Before: r2(X0), x1Before: r2(X1), x0After: r2(nx0), x1After: r2(nx1), fontSub: sub ? { from: sub.from, to: sub.to, missing: sub.missing, standard: sub.std, why: sub.why } : null, clip: !tr.clip ? 'none' : tr.clip.complex ? 'unjudged' : 'rect' } };
  }

  async function rewriteNumbers(bytes, edits, opts) {
    opts = opts || {}; var t0 = Date.now(), refused = [], changes = [], out = bytes, touched = {};
    var all = function (named, message) { (Array.isArray(edits) ? edits : []).forEach(function (e) { refused.push({ cell: (e && e.cell) || null, page: e && e.page, reason: named, message: message }); }); if (!refused.length) refused.push({ cell: null, page: null, reason: named, message: message }); };
    try {
      if (!bytes || !bytes.length) throw fail('not-a-pdf', 'the file is empty');
      if (!Array.isArray(edits) || !edits.length) throw fail('no-edits', 'no edit was given');
      var F = new PdfFile(bytes).load(), pages = F.pages(), use = {}, byPage = {}, fontCache = {}, addFonts = [];
      pages.forEach(function (pg) { F.contents(pg).forEach(function (n) { use[n] = (use[n] || 0) + 1; }); });
      edits.forEach(function (e) { var p = Number(e && e.page); if (!(p >= 1 && p <= pages.length)) refused.push({ cell: (e && e.cell) || null, page: e && e.page, reason: 'no-such-page', message: 'the file has ' + pages.length + ' page(s)' }); else (byPage[p] = byPage[p] || []).push(e); });
      for (var p of Object.keys(byPage)) {
        var pg = pages[p - 1], pageNo = function (named, message) { byPage[p].forEach(function (e) { refused.push({ cell: e.cell || null, page: e.page, reason: named, message: message }); }); };
        if ((Number(F.res(pg.inh.Rotate)) || 0) % 360) { pageNo('rotated-page', 'page ' + p + ' is rotated'); continue; }
        var vb = (F.res(pg.inh.CropBox) || F.res(pg.inh.MediaBox) || []).map(function (v) { return F.res(v); }); if (vb.length !== 4) throw fail('damaged', 'page ' + p + ' has no MediaBox');
        var refs = F.contents(pg); if (refs.some(function (n) { return use[n] > 1; })) { pageNo('shared-content', 'page ' + p + ' shares its content stream with another page'); continue; }
        var streams = []; for (var n of refs) { var o = F.obj(n), d = await F.data(o); streams.push({ obj: o, bytes: d.bytes, flate: d.flate, splices: [] }); }
        var rs = F.res(pg.inh.Resources), fd = rs && rs.dict ? F.res(rs.dict.Font) : null, fonts = {};
        for (var name of Object.keys((fd && fd.dict) || {})) { var v = fd.dict[name], key = v && v.ref != null ? v.ref : null; fonts[name] = key != null && fontCache[key] ? fontCache[key] : await loadFont(F, v); if (key != null) fontCache[key] = fonts[name]; }
        var runs = interpret(streams.map(function (s) { return s.bytes; }), fonts, [1, 0, 0, -1, -Math.min(vb[0], vb[2]), Math.max(vb[1], vb[3])]), taken = [];
        var ctx = { added: {}, std: function (base) {   // a standard font for this page: one already in its resources, else a new resource (written below)
          var have = Object.keys(fonts).sort().filter(function (k) { return fonts[k].std && fonts[k].name === base; })[0]; if (have) return have;
          var k = 'DoorStd1'; for (var i = 2; fonts[k]; i++) k = 'DoorStd' + i;
          fonts[k] = stdFont(base); ctx.added[k] = base; return k;
        } };
        byPage[p].forEach(function (e) { var pl = plan(e, runs, fonts, opts, taken, opts.substitute ? ctx : null); if (pl.refuse) { refused.push(pl.refuse); return; } changes.push(pl.change); pl.splices.forEach(function (sp) { streams[sp.si].splices.push(sp); touched[streams[sp.si].obj.num] = streams[sp.si]; }); });
        if (Object.keys(ctx.added).length) addFonts.push({ pg: pg, added: ctx.added });
      }
      if (!refused.length) {
        var replaced = {};
        for (var num of Object.keys(touched)) {
          var S = touched[num], parts = [], pos = 0;
          S.splices.sort(function (a, b) { return a.s - b.s; }).forEach(function (sp) { var keep = ''; /*MUT-KEEP*/ parts.push(S.bytes.subarray(pos, sp.s), bytesOf(keep + sp.text)); pos = sp.e; });
          parts.push(S.bytes.subarray(pos));
          var data = concat(parts), dict = Object.assign({}, S.obj.val.dict); if (S.flate) data = await deflate(data); dict.Length = data.length;
          replaced[num] = concat([bytesOf(num + ' ' + S.obj.gen + ' obj\n' + ser({ dict: dict }) + '\nstream\n'), data, bytesOf('\nendstream\nendobj\n')]);
        }
        // the standard fonts a substitution needs (§18.5-18.6): ONE new font object each, and the ONE object that holds the page's /Font dictionary gets the new names.
        //   Nothing else changes; a font already added by an earlier edit is reused, never added twice.
        var size = Number(F.trailer.Size) || 0; Object.keys(F.xref).forEach(function (n) { if (Number(n) >= size) size = Number(n) + 1; });
        addFonts.forEach(function (A) {
          var pd = A.pg.dict, hn = A.pg.inh.ResFrom != null ? A.pg.inh.ResFrom : A.pg.num, hold = F.obj(hn); if (!hold || !hold.val || !hold.val.dict) throw fail('damaged', 'the page\'s resources are not in a dictionary');
          if (replaced[hn]) throw fail('shared-content', 'two edited pages share one resource dictionary: not in this cut');
          var val = { dict: Object.assign({}, hold.val.dict) }, rv = val.dict.Resources, rd, fd, fdObj = null;
          if (rv && rv.ref != null) { var ro = F.obj(rv.ref); hold = ro; hn = ro.num; val = { dict: Object.assign({}, ro.val.dict) }; rd = val; }
          else { rd = { dict: Object.assign({}, (rv && rv.dict) || {}) }; val.dict.Resources = rd; }
          var fv = rd.dict.Font; if (fv && fv.ref != null) { fdObj = F.obj(fv.ref); fd = { dict: Object.assign({}, fdObj.val.dict) }; } else { fd = { dict: Object.assign({}, (fv && fv.dict) || {}) }; rd.dict.Font = fd; }
          Object.keys(A.added).forEach(function (k) { var n = size++; replaced[n] = bytesOf(n + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /' + escName(A.added[k]) + ' /Encoding /WinAnsiEncoding >>\nendobj\n'); fd.dict[k] = { ref: n, gen: 0 }; });
          if (replaced[fdObj ? fdObj.num : hn]) throw fail('shared-content', 'two edited pages share one font dictionary: not in this cut');
          if (fdObj) replaced[fdObj.num] = bytesOf(fdObj.num + ' ' + fdObj.gen + ' obj\n' + ser(fd) + '\nendobj\n');
          else replaced[hn] = bytesOf(hn + ' ' + hold.gen + ' obj\n' + ser(val) + '\nendobj\n');
          log('§PDF_WRITE-FONT-ADDED page=' + (pages.indexOf(A.pg) + 1) + ' fonts=' + Object.keys(A.added).map(function (k) { return k + ':' + A.added[k]; }).join(',') + ' holder=' + (fdObj ? fdObj.num : hn));
        });
        /*MUT-REWRITE*/
        out = F.build(replaced);
      }
    } catch (e) { all(e && e.named ? e.named : 'damaged', (e && e.message) || String(e)); }
    var ok = !refused.length && changes.length > 0; if (!ok) { out = bytes; changes = []; }
    refused.forEach(function (r) { log('§PDF_WRITE-REFUSED cell=' + (r.cell || '?') + ' page=' + r.page + ' reason=' + r.reason + ' message="' + r.message + '"'); });
    log('§PDF_WRITE ok=' + ok + ' edits=' + (Array.isArray(edits) ? edits.length : 0) + ' applied=' + changes.length + ' refused=' + refused.length + ' bytesIn=' + (bytes ? bytes.length : 0) + ' bytesOut=' + out.length + ' ms=' + (Date.now() - t0) +
      (changes.length ? ' cells=' + changes.map(function (c) { return (c.cell || '?') + ':"' + c.oldText + '"->"' + c.newText + '"'; }).join(',') : ''));
    return { ok: ok, bytes: out, changes: changes, refused: refused };
  }

  // ── the sheet side: the same edits on the reader's input, so the reader's own rule judges the edited sheet (one owner) ──
  function applyToItems(pages, edits) {
    var out = (pages || []).map(function (p) { return p; }), refused = [];
    (edits || []).forEach(function (e) {
      var pi = Number(e.page) - 1, items = out[pi], box = e.box; if (!items) { refused.push({ cell: e.cell || null, reason: 'no-such-page' }); return; }
      var hit = items.filter(function (it) { var cx = (it.x0 + it.x1) / 2; return cx >= box[0] - BOX_TOL && cx <= box[2] + BOX_TOL && it.base >= box[1] - BOX_TOL && it.base <= box[3] + BOX_TOL; }).sort(function (a, b) { return a.x0 - b.x0; });
      if (!hit.length) { refused.push({ cell: e.cell || null, reason: 'no-text-in-box' }); return; }
      if (squash(hit.map(function (it) { return it.s; }).join('')) !== squash(e.oldText)) { refused.push({ cell: e.cell || null, reason: 'old-text-not-in-box' }); return; }
      if (out[pi] === pages[pi]) items = out[pi] = items.slice();
      var first = Object.assign({}, hit[0], { s: String(e.newText).trim(), x1: Math.max.apply(null, hit.map(function (it) { return it.x1; })) });
      out[pi] = items.filter(function (it) { return hit.indexOf(it) < 1; }).map(function (it) { return it === hit[0] ? first : it; });
    });
    return { ok: !refused.length, pages: out, refused: refused };
  }
  // the typed number, printed the way its column is printed: decimals, grouping, brackets and the dash for zero are READ from the column
  function formatLike(texts, typed) {
    var t = String(typed == null ? '' : typed).trim(), m = /^(\()?([-+])?(\d[\d,]*)?(?:\.(\d*))?(\))?$/.exec(t), nums = (texts || []).map(function (x) { return String(x).trim(); }).filter(function (x) { return RR.parseNum(x); });
    if (!m || (!m[3] && !m[4]) || (!!m[1]) !== (!!m[5])) return { ok: false, reason: 'not-a-number', message: '"' + t + '" is not a number' };
    if (!nums.length) return { ok: false, reason: 'no-format', message: 'the column prints no number to take the format from' };
    var dash = nums.filter(function (x) { return !/\d/.test(x); })[0] || null, digits = nums.filter(function (x) { return /\d/.test(x); });
    var dp = 0; digits.forEach(function (x) { var k = /\.(\d+)/.exec(x); if (k && k[1].length > dp) dp = k[1].length; });
    var group = digits.some(function (x) { return /\d,\d{3}/.test(x); }), brackets = digits.some(function (x) { return x[0] === '('; });
    var neg = !!m[1] || m[2] === '-', ip = (m[3] || '0').replace(/,/g, '').replace(/^0+(?=\d)/, ''), fp = m[4] || '';
    if (fp.replace(/0+$/, '').length > dp) return { ok: false, reason: 'too-many-decimals', message: '"' + t + '" has more decimals than the column prints (' + dp + ')' };
    fp = (fp + new Array(dp + 1).join('0')).slice(0, dp);
    if (!/[1-9]/.test(ip + fp)) { if (dash) return { ok: true, text: dash }; neg = false; }
    if (group) ip = ip.replace(/\B(?=(\d{3})+$)/g, ',');
    var body = ip + (dp ? '.' + fp : '');
    return { ok: true, text: neg ? (brackets ? '(' + body + ')' : '-' + body) : body };
  }
  // which edge does this cell's column keep? Read from the source map: the edge (within 1 pt) most number cells of the column share.
  // A tie goes right, then centre, and is reported decided:false (cells of one width share all three: no evidence).
  function alignOf(R, cell) {
    var col = String(cell).replace(/\d+$/, ''), bx = Object.keys((R && R.sheet) || {}).filter(function (a) { return a.replace(/\d+$/, '') === col && R.sheet[a].t === 'n' && R.map[a]; }).map(function (a) { return R.map[a].box; });
    var share = function (pick) { var v = bx.map(pick), best = 0; v.forEach(function (x) { var n = v.filter(function (y) { return Math.abs(y - x) <= 1; }).length; if (n > best) best = n; }); return best; };
    var r = share(function (b) { return b[2]; }), l = share(function (b) { return b[0]; }), c = share(function (b) { return (b[0] + b[2]) / 2; });
    var align = r >= l && r >= c ? 'right' : c >= l ? 'center' : 'left';
    return { align: align, decided: align === 'right' ? r > l && r > c : align === 'center' ? c > l : true, cells: bx.length, right: r, centre: c, left: l };
  }
  // S9 history: one journal entry per rewrite, one CELL_SET per applied change (erp/sheet_history.js; no second log format)
  async function record(H, history, snap, changes, actor, at, name) {
    var next = {}; Object.keys(snap || {}).forEach(function (s) { next[s] = Object.assign({}, snap[s]); });
    var sheet = next[name || 'Report'] = next[name || 'Report'] || {};
    (changes || []).forEach(function (c) { if (!c.cell) return; var n = RR.parseNum(c.newText); sheet[c.cell] = { v: n ? n.v : c.newText, f: c.f || null }; });   // a typed number; c.f = the formula the re-read still finds there (a total that still adds up stays a SUM, SHEET_FRONT_DOOR §16.2); without one, over a found SUM S9 flags it typedOverFormula
    var r = await H.record(history, snap, next, actor, at);
    return { verdict: r.verdict, entry: r.entry, line: r.line, snapshot: next };
  }
  // ── an embedded file (ISO 32000-2 §7.11.3-7.11.4, name tree §7.9.6): the history travels inside the PDF (PDF_EDITOR.md §4.5) ──
  // A full rewrite like rewriteNumbers: every object that need not change is copied byte for byte (the page content is never touched).
  async function embedFile(bytes, name, data) {
    var out = bytes, replaced = false, refused = [], stored = 0;
    try {
      if (!bytes || !bytes.length) throw fail('not-a-pdf', 'the file is empty');
      if (!/^[A-Za-z0-9_.-]+$/.test(String(name))) throw fail('bad-name', 'an embedded file name holds letters, digits, _ . - only');
      var F = new PdfFile(bytes).load(), rootRef = F.trailer.Root, root = rootRef && rootRef.ref != null ? F.obj(rootRef.ref) : null; if (!root || !root.val || !root.val.dict) throw fail('damaged', 'the file has no catalog');
      var copy = function (v) { return { dict: Object.assign({}, v.dict) }; }, key = Array.prototype.map.call(String(name), function (c) { return c.charCodeAt(0); }), cmp = function (a, b) { for (var i = 0; i < a.length && i < b.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
      var holder = { obj: root, val: copy(root.val) }, namesV = holder.val.dict.Names, names;   // holder = the ONE existing object that has to change
      if (namesV && namesV.ref != null) { var no = F.obj(namesV.ref); if (!no || !no.val || !no.val.dict) throw fail('damaged', 'the catalog /Names is not a dictionary'); holder = { obj: no, val: copy(no.val) }; names = holder.val; }
      else { names = namesV && namesV.dict ? copy(namesV) : { dict: {} }; holder.val.dict.Names = names; }
      var efV = names.dict.EmbeddedFiles, tree;
      if (efV && efV.ref != null) { var eo = F.obj(efV.ref); if (!eo || !eo.val || !eo.val.dict) throw fail('damaged', '/EmbeddedFiles is not a dictionary'); holder = { obj: eo, val: copy(eo.val) }; tree = holder.val; }
      else { tree = efV && efV.dict ? copy(efV) : { dict: {} }; names.dict.EmbeddedFiles = tree; }
      if (tree.dict.Kids != null) throw fail('names-tree-not-supported', 'this PDF keeps its attachments in a split name tree (/Kids): not in this cut');
      var arr = (F.res(tree.dict.Names) || []).slice(), at = -1; for (var i = 0; i + 1 < arr.length; i += 2) { var k = F.res(arr[i]); if (k && k.str && cmp(k.str, key) === 0) at = i; }
      var raw = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data)), z = await deflate(raw), put = {}, size = Number(F.trailer.Size) || 0; stored = z.length;
      Object.keys(F.xref).forEach(function (n) { if (Number(n) >= size) size = Number(n) + 1; });
      var streamObj = function (num, gen) { return concat([bytesOf(num + ' ' + gen + ' obj\n<< /Type /EmbeddedFile /Subtype /text#2Fplain /Filter /FlateDecode /Length ' + z.length + ' /Params << /Size ' + raw.length + ' >> >>\nstream\n'), z, bytesOf('\nendstream\nendobj\n')]); };
      if (at >= 0 /*MUT-TWICE*/) {   // already there: the stream object alone is replaced, in place
        var fs = F.res(arr[at + 1]), ef = fs && fs.dict ? F.res(fs.dict.EF) : null, sr = ef && ef.dict ? (ef.dict.F || ef.dict.UF) : null, so = sr && sr.ref != null ? F.obj(sr.ref) : null;
        if (!so || !so.stream) throw fail('damaged', 'the attachment ' + name + ' has no embedded file stream');
        put[so.num] = streamObj(so.num, so.gen); replaced = true;
      } else {
        var sn = size, fn = size + 1, pos = 0; while (pos < arr.length && cmp((F.res(arr[pos]) || {}).str || [], key) < 0) pos += 2;
        arr.splice(pos, 0, { str: key }, { ref: fn, gen: 0 }); tree.dict.Names = arr;
        put[sn] = streamObj(sn, 0);
        put[fn] = bytesOf(fn + ' 0 obj\n<< /Type /Filespec /F (' + name + ') /UF (' + name + ') /EF << /F ' + sn + ' 0 R /UF ' + sn + ' 0 R >> >>\nendobj\n');
        put[holder.obj.num] = bytesOf(holder.obj.num + ' ' + holder.obj.gen + ' obj\n' + ser(holder.val) + '\nendobj\n');
      }
      /*MUT-NOEMBED*/ out = F.build(put);
      if (out !== bytes && out.length > 8 && latin1(out, 0, 7) === '%PDF-1.' && out[7] >= 48 && out[7] <= 51) out[7] = 52;   // /EmbeddedFiles is PDF 1.4: a 1.0-1.3 header says 1.4
    } catch (e) { refused.push({ reason: e && e.named ? e.named : 'damaged', message: (e && e.message) || String(e) }); out = bytes; replaced = false; }
    log('§PDF_EMBED ok=' + !refused.length + ' name=' + name + ' bytesIn=' + (bytes ? bytes.length : 0) + ' bytesOut=' + out.length + ' data=' + (data ? data.length : 0) + ' stored=' + stored + ' replaced=' + replaced + (refused.length ? ' reason=' + refused[0].reason + ' message="' + refused[0].message + '"' : ''));
    return { ok: !refused.length, bytes: out, replaced: replaced, refused: refused };
  }
  // the text runs of one page, as the writer sees them (for a witness or a host that wants to show what is editable)
  async function listRuns(bytes, page) {
    var F = new PdfFile(bytes).load(), pg = F.pages()[(page || 1) - 1]; if (!pg) throw fail('no-such-page', 'no page ' + page);
    var vb = (F.res(pg.inh.CropBox) || F.res(pg.inh.MediaBox)).map(function (v) { return F.res(v); }), streams = [], fonts = {}, rs = F.res(pg.inh.Resources), fd = rs && rs.dict ? F.res(rs.dict.Font) : null;
    for (var n of F.contents(pg)) streams.push((await F.data(F.obj(n))).bytes);
    for (var name of Object.keys((fd && fd.dict) || {})) fonts[name] = await loadFont(F, fd.dict[name]);
    var runs = interpret(streams, fonts, [1, 0, 0, -1, -Math.min(vb[0], vb[2]), Math.max(vb[1], vb[3])]);
    // per run: what the page's edit layer needs (SHEET_FRONT_DOOR §18.5 H1): its box in page points (y down), and why it is locked (lockOf, the one owner), or null
    var out = runs.map(function (r, i) { var lk = lockOf(r); return { i: i, text: r.text, font: r.font ? r.font.name : r.fname, size: r.size, x0: r.x0, x1: r.x1, y: r.y, h: r.h, known: r.known, flat: r.flat, n: r.n, lock: lk ? lk.reason : null, why: lk ? lk.message : null }; });
    out.forms = runs.forms; out.rotate = ((Number(F.res(pg.inh.Rotate)) || 0) % 360 + 360) % 360; return out;   // a turned page (/Rotate): rewriteNumbers refuses it (rotated-page)
  }
  // any text run, not only numbers (SHEET_FRONT_DOOR §18.5): the same engine, the same all-or-nothing, the same named refusals
  function rewriteText(bytes, edits, opts) { return rewriteNumbers(bytes, edits, Object.assign({}, opts || {}, { text: true })); }
  return { rewriteNumbers: rewriteNumbers, rewriteText: rewriteText, lockOf: lockOf, WIN: WIN, applyToItems: applyToItems, formatLike: formatLike, alignOf: alignOf, record: record, embedFile: embedFile, listRuns: listRuns };
});
