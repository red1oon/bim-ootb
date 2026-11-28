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
//   scripts are refused by name (no standard font has them). listRuns(bytes, page) -> every run with its box and why it is locked (lockOf: the one owner);
//   .pageLock = { reason, message } when the writer refuses the whole page (pageOf: the one owner of "this page's runs", SHEET_FRONT_DOOR §20.2 R3).
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

  // ── the file (ISO 32000-2 §7.5): cross-reference tables AND streams (§7.5.8, any mix, /Prev, hybrid /XRefStm), objects, object streams (§7.5.7), page tree ──
  //   xref[n] = { use, type: 1 (off, gen) | 2 (stm, idx: the object lives inside object stream `stm`) }; os[stm] = that object stream, decoded once at load
  function PdfFile(b) { this.b = b; this.xref = {}; this.bounds = []; this.trailer = null; this.cache = {}; this.os = {}; this.xobjs = {}; this.info = { xref: 'table', objStreams: 0, decodedKB: 0 }; }
  // PNG predictors 10-15 (ISO 32000-2 §7.4.4.4): every row opens with its own filter byte (0 none, 1 sub, 2 up, 3 average, 4 Paeth)
  function unpng(u8, colors, bpc, cols) {
    var rl = Math.ceil(colors * bpc * cols / 8), bpp = Math.max(1, Math.ceil(colors * bpc / 8)), rows = Math.floor(u8.length / (rl + 1)), out = new Uint8Array(rows * rl);
    for (var r = 0; r < rows; r++) {
      var f = u8[r * (rl + 1)], si = r * (rl + 1) + 1, di = r * rl; if (f > 4) throw fail('damaged', 'a predictor row has the unknown filter ' + f);
      for (var i = 0; i < rl; i++) {
        var x = u8[si + i], a = i >= bpp ? out[di + i - bpp] : 0, up = r ? out[di - rl + i] : 0, c = i >= bpp && r ? out[di - rl + i - bpp] : 0, v;
        if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + up; else if (f === 3) v = x + ((a + up) >> 1);
        else { var p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
        out[di + i] = v & 255;
      }
    }
    return out;
  }
  PdfFile.prototype.load = async function () {
    var b = this.b, self = this; if (indexOf(b, '%PDF-', 0, 1024) < 0) throw fail('not-a-pdf', 'this file is not a PDF (no %PDF- header)');
    var sx = lastIndexOf(b, 'startxref'); if (sx < 0) throw fail('damaged', 'the file has no startxref');
    var t = new Lex(b, sx + 9).next(); if (!t || t.t !== 'num') throw fail('damaged', 'startxref holds no offset');
    var off = t.v, seen = {}, firstSection = true;
    while (off != null && !seen[off]) {
      seen[off] = 1; this.bounds.push(off);
      var lx = new Lex(b, off), dict, ents = [], isStm = false; t = lx.next();
      if (t && t.t === 'kw' && t.v === 'xref') {
        for (;;) {
          t = lx.next(); if (!t) throw fail('damaged', 'the cross-reference table has no trailer'); if (t.t === 'kw' && t.v === 'trailer') break;
          var cnt = lx.next(); if (t.t !== 'num' || !cnt || cnt.t !== 'num') throw fail('damaged', 'a cross-reference subsection is malformed');
          for (var i = 0; i < cnt.v; i++) { var o = lx.next(), g = lx.next(), f = lx.next(); if (!f || o.t !== 'num' || g.t !== 'num') throw fail('damaged', 'a cross-reference entry is malformed'); if (f.v === 'n') this.bounds.push(o.v); ents.push([t.v + i, { off: o.v, gen: g.v, use: f.v === 'n', type: 1 }]); }
        }
        var tr = readVal(lx, true); if (!tr || !tr.dict) throw fail('damaged', 'the trailer is not a dictionary'); dict = tr.dict;
        if (dict.XRefStm != null) {   // hybrid (§7.5.8.4): this table first, then its stream (the objects the table leaves out), then /Prev
          var hs = await this.xrefStream(dict.XRefStm), loc = {}; isStm = true;
          ents.forEach(function (e) { if (!(e[0] in loc)) loc[e[0]] = e[1]; });
          var tableWins = false; /*MUT-HYBRID*/   // real hybrids list the hidden objects as FREE in the table and in use in the stream (SHEET_FRONT_DOOR §22.4): the stream's live entry wins over a free one
          hs.ents.forEach(function (e) { if (!(e[0] in loc) || (!tableWins && !loc[e[0]].use && e[1].use)) loc[e[0]] = e[1]; });
          ents = Object.keys(loc).map(function (n) { return [Number(n), loc[n]]; });
        }
      } else if (t && t.t === 'num') { var xs = await this.xrefStream(off); dict = xs.dict; ents = xs.ents; isStm = true; }
      else throw fail('damaged', 'no cross-reference table at startxref');
      ents.forEach(function (e) { if (!(e[0] in self.xref)) self.xref[e[0]] = e[1]; });
      if (firstSection) { firstSection = false; this.trailer = dict; this.info.xref = isStm ? 'stream' : 'table'; }
      off = typeof dict.Prev === 'number' ? dict.Prev : null;
    }
    if (this.trailer.Encrypt != null) throw fail('encrypted', 'this PDF is encrypted: this page cannot write an encrypted file back yet');
    var uniq = {}; this.bounds.forEach(function (v) { if (v > 0) uniq[v] = 1; }); this.bounds = Object.keys(uniq).map(Number).sort(function (x, y) { return x - y; });   // never 0: the header is not an object (and no quadratic scan: 18,000 objects measured)
    var stms = {}; Object.keys(this.xref).forEach(function (n) { var x = self.xref[n]; if (x.use && x.type === 2) stms[x.stm] = 1; });
    for (var sn of Object.keys(stms)) {   // every object stream a live entry names, decoded once (§7.5.7: /N pairs "object-number offset" before /First)
      var so = this.obj(Number(sn)), sd = so && so.stream ? so.val.dict : null; if (!sd) throw fail('damaged', 'object stream ' + sn + ' is missing');
      var bytes = (await this.decode(so, true)).bytes, N = this.res(sd.N), First = this.res(sd.First); if (typeof N !== 'number' || typeof First !== 'number') throw fail('damaged', 'object stream ' + sn + ' has no /N or /First');
      var hl = new Lex(bytes, 0, First), nums = [], offs = [];
      for (var h = 0; h < N; h++) { var hn = hl.next(), ho = hl.next(); if (!hn || !ho || hn.t !== 'num' || ho.t !== 'num') throw fail('damaged', 'object stream ' + sn + ' has a damaged header'); nums.push(hn.v); offs.push(ho.v); }
      this.os[sn] = { bytes: bytes, first: First, nums: nums, offs: offs }; this.info.objStreams++; this.info.decodedKB += bytes.length / 1024;
    }
    return this;
  };
  // a cross-reference STREAM (§7.5.8): /W field widths, /Index subsections, rows of type 0 free, 1 offset+generation, 2 object stream+index
  PdfFile.prototype.xrefStream = async function (off) {
    var o = this.at(off, null), d = o.val && o.val.dict; if (!o.stream || !d || !d.Type || d.Type.name !== 'XRef') throw fail('damaged', 'no cross-reference table or stream at the offset the file names');
    this.bounds.push(off); this.xobjs[o.num] = 1;
    var bytes = (await this.decode(o, true)).bytes, w = this.res(d.W), size = this.res(d.Size), idx = this.res(d.Index) || [0, size];
    if (!Array.isArray(w) || w.length !== 3 || typeof size !== 'number' || !Array.isArray(idx)) throw fail('damaged', 'the cross-reference stream has no usable /W, /Size or /Index');
    w = w.map(Number); var rl = w[0] + w[1] + w[2], ents = [], p = 0;
    for (var s = 0; s + 1 < idx.length; s += 2) for (var i = 0; i < idx[s + 1]; i++) {
      if (p + rl > bytes.length) throw fail('damaged', 'the cross-reference stream is shorter than it says');
      var fld = [], q = p; for (var k = 0; k < 3; k++) { var v = 0; for (var j = 0; j < w[k]; j++) v = v * 256 + bytes[q++]; fld.push(v); } p += rl;
      var tp = w[0] ? fld[0] : 1; /*MUT-TYPE2*/
      var real = fld[1] > 0; /*MUT-ZERO*/   // a type-1 row at offset 0 names no object (real files carry such rows for unused numbers, §22.4)
      var e = tp === 1 ? { off: fld[1], gen: fld[2], use: real, type: 1 } : tp === 2 ? { stm: fld[1], idx: fld[2], gen: 0, use: true, type: 2 } : { off: 0, gen: fld[2], use: false, type: 1 };
      if (e.use && e.type === 1) this.bounds.push(e.off);
      ents.push([idx[s] + i, e]);
    }
    return { dict: d, ents: ents };
  };
  // the object that starts at `off` (a stream's extent included); n = the number it must carry, or null when the offset is all there is
  PdfFile.prototype.at = function (off, n) {
    var b = this.b, lx = new Lex(b, off), a = lx.next(), g = lx.next(), k = lx.next();
    if (!a || a.t !== 'num' || (n != null && a.v !== n) || !g || !k || k.v !== 'obj') throw fail('damaged', n != null ? 'object ' + n + ' is not at its cross-reference offset' : 'there is no object at offset ' + off);
    n = a.v; var o = { num: n, gen: g.v, off: off, val: readVal(lx, true), stream: null }, t = lx.next();
    if (t && t.t === 'kw' && t.v === 'stream' && o.val && o.val.dict) {
      var p = t.e; if (b[p] === 13) p++; if (b[p] === 10) p++;
      var len = this.res(o.val.dict.Length), q = typeof len === 'number' ? p + len : -1; while (q >= 0 && q < b.length && WS[b[q]]) q++;
      if (q < 0 || indexOf(b, 'endstream', q, q + 9) !== q) { var es = indexOf(b, 'endstream', p); if (es < 0) throw fail('damaged', 'stream ' + n + ' has no endstream'); len = es - p; if (b[p + len - 1] === 10) len--; if (b[p + len - 1] === 13) len--; }
      o.stream = { start: p, len: len };
    }
    return o;
  };
  PdfFile.prototype.obj = function (n) {
    if (this.cache[n]) return this.cache[n]; var x = this.xref[n]; if (!x || !x.use) return null;
    if (x.type === 2) {   // inside an object stream: parsed from the decoded bytes (not yet decoded while the cross-reference is still being read: null)
      var S = this.os[x.stm]; if (!S) return null; var k = S.nums[x.idx] === n ? x.idx : S.nums.indexOf(n); if (k < 0) throw fail('damaged', 'object ' + n + ' is not in its object stream');
      return this.cache[n] = { num: n, gen: 0, off: null, val: readVal(new Lex(S.bytes, S.first + S.offs[k]), true), stream: null, inStm: x.stm };
    }
    return this.cache[n] = this.at(x.off, n);
  };
  PdfFile.prototype.res = function (v) { for (var i = 0; v && v.ref != null && i < 32; i++) { var o = this.obj(v.ref); v = o ? o.val : null; } return v; };
  // predOk: the PNG predictors (xref and object streams only; a page content stream is rewritten WITHOUT its /DecodeParms, so there a predictor stays a refusal)
  PdfFile.prototype.decode = async function (o, predOk) {
    var raw = this.b.subarray(o.stream.start, o.stream.start + o.stream.len), f = this.res(o.val.dict.Filter), dp = this.res(o.val.dict.DecodeParms);
    if (Array.isArray(f)) { if (f.length > 1) throw fail('filter-not-supported', 'stream ' + o.num + ' has ' + f.length + ' filters'); f = f.length ? this.res(f[0]) : null; dp = Array.isArray(dp) ? this.res(dp[0]) : dp; }
    if (f == null) return { bytes: raw, flate: false };
    var P = dp && dp.dict ? dp.dict : {}, pr = Number(this.res(P.Predictor)) || 1;
    if (f.name !== 'FlateDecode' || (pr > 1 && !predOk)) throw fail('filter-not-supported', 'stream ' + o.num + ' uses ' + (f.name || 'an unknown filter') + (dp ? ' with a predictor' : ''));
    var bytes = await inflate(raw);
    if (pr >= 10 && pr <= 15 /*MUT-PRED*/) bytes = unpng(bytes, Number(this.res(P.Colors)) || 1, Number(this.res(P.BitsPerComponent)) || 8, Number(this.res(P.Columns)) || 1);
    else if (pr > 1) throw fail('predictor-not-supported', 'stream ' + o.num + ' uses the predictor ' + pr + ', which this page cannot read yet');
    return { bytes: bytes, flate: true };
  };
  PdfFile.prototype.data = function (o) { return this.decode(o, false); };
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
  // the last word before a rewritten file is handed back: it begins byte for byte as the input does up to its first object (SHEET_FRONT_DOOR §22.4).
  //   A file that fails this is NOT written: a named refusal, never a broken file.
  PdfFile.prototype.sound = function (out) {
    var b = this.b, first = this.bounds[0] || 0, skip = false; /*MUT-SOUND*/
    if (skip) return out;
    for (var i = 0; i < first; i++) if (out[i] !== b[i]) throw fail('damaged', 'the rewritten file would not begin as the original does (not written)');
    if (indexOf(out, '%PDF-', 0, 1024) < 0) throw fail('damaged', 'the rewritten file would have no header (not written)');
    return out;
  };
  // a true rewrite: every live type-1 object but the replaced ones is copied byte for byte, object streams untouched (§22.2), a replaced or new object is an
  //   ordinary object (also when its old copy sits in an object stream), then ONE new cross-reference: a classic table when no type-2 entry is left to describe, else ONE xref stream
  PdfFile.prototype.build = async function (replaced) {
    var b = this.b, self = this, bounds = this.bounds, live = Object.keys(this.xref).map(Number).filter(function (n) { var x = self.xref[n]; return n > 0 && x.use && x.type === 1 && !self.xobjs[n]; }).sort(function (x, y) { return self.xref[x].off - self.xref[y].off; });
    var parts = [b.subarray(0, bounds[0])], pos = bounds[0], at = {}, size = Number(this.trailer.Size) || 0;
    live.forEach(function (n) {
      var x = self.xref[n], next = b.length; for (var i = 0; i < bounds.length; i++) if (bounds[i] > x.off) { next = bounds[i]; break; }
      var piece = replaced[n] || b.subarray(x.off, next), off = /*MUT-XREF*/ pos; /*MUT-OBJSTM*/ at[n] = off; parts.push(piece); pos += piece.length; if (n >= size) size = n + 1;
    });
    Object.keys(replaced).map(Number).filter(function (n) { return at[n] == null; }).sort(function (x, y) { return x - y; }).forEach(function (n) { at[n] = pos; parts.push(replaced[n]); pos += replaced[n].length; if (n >= size) size = n + 1; });   // objects the file did not have (§4.5), and the ones that lived in an object stream
    var kept = {}, nKept = 0; Object.keys(this.xref).forEach(function (k) { var x = self.xref[k]; if (x.use && x.type === 2 && at[k] == null) { kept[k] = x; nKept++; if (Number(k) >= size) size = Number(k) + 1; } });
    var free = [0]; for (var n = 1; n < size; n++) if (at[n] == null && !kept[n]) free.push(n);
    var gen = function (k) { return (self.xref[k] && self.xref[k].use && self.xref[k].gen) || 0; }, fgen = function (k) { return k === 0 ? 65535 : (self.xref[k] && self.xref[k].gen) || 0; };
    var tr = {}; Object.keys(this.trailer).forEach(function (key) { if (['Prev', 'XRefStm', 'Type', 'W', 'Index', 'Filter', 'DecodeParms', 'Length', 'Size'].indexOf(key) < 0) tr[key] = self.trailer[key]; });
    if (!nKept) {
      var x = 'xref\n0 ' + size + '\n';
      for (var k = 0; k < size; k++) { if (at[k] != null) x += ('0000000000' + at[k]).slice(-10) + ' ' + ('00000' + gen(k)).slice(-5) + ' n \n'; else x += ('0000000000' + (free[free.indexOf(k) + 1] || 0)).slice(-10) + ' ' + ('00000' + fgen(k)).slice(-5) + ' f \n'; }
      tr.Size = size; parts.push(bytesOf(x + 'trailer\n' + ser({ dict: tr }) + '\nstartxref\n' + pos + '\n%%EOF\n'));
      return this.sound(concat(parts));
    }
    // the xref stream: /W [1 4 2], rows of type 0 / 1 / 2, Flate, no predictor, its own row last (§7.5.8.3)
    var xn = size, rows = new Uint8Array((size + 1) * 7), put = function (k, t, a, c) { var o = k * 7; if (a > 4294967295 || c > 65535) throw fail('too-large', 'the file is too large to be written with a cross-reference stream by this page'); rows[o] = t; rows[o + 1] = a >>> 24; rows[o + 2] = (a >>> 16) & 255; rows[o + 3] = (a >>> 8) & 255; rows[o + 4] = a & 255; rows[o + 5] = c >> 8; rows[o + 6] = c & 255; };
    for (var j = 0; j < size; j++) { if (at[j] != null) put(j, 1, /*MUT-XSOFF*/ at[j], gen(j)); else if (kept[j]) put(j, 2, kept[j].stm, kept[j].idx); else put(j, 0, free[free.indexOf(j) + 1] || 0, fgen(j)); }
    put(xn, 1, pos, 0);
    var z = await deflate(rows), xd = Object.assign({}, tr, { Type: { name: 'XRef' }, Size: size + 1, W: [1, 4, 2], Filter: { name: 'FlateDecode' }, Length: z.length });
    parts.push(concat([bytesOf(xn + ' 0 obj\n' + ser({ dict: xd }) + '\nstream\n'), z, bytesOf('\nendstream\nendobj\nstartxref\n' + pos + '\n%%EOF\n')]));
    var out = concat(parts); if (out.length > 8 && latin1(out, 0, 7) === '%PDF-1.' && out[7] >= 48 && out[7] < 53) out[7] = 53;   // a cross-reference stream is PDF 1.5
    return out;
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
      if (!/^(Type1|TrueType|MMType1)$/.test(st)) { font.why = base + ' is a ' + (st || 'unknown') + ' font (its glyphs are drawn as pictures: not editable here yet)'; return font; }
      var enc = F.res(d.Encoding), encName = enc && enc.name != null ? enc.name : enc && enc.dict ? nm(enc.dict.BaseEncoding) : '', diffs = enc && enc.dict && enc.dict.Differences != null;
      if (tu && tu.stream) readCMap((await F.data(tu)).bytes, font);
      else if (encName === 'WinAnsiEncoding' && !diffs) { for (var wc in WIN) { font.uni[wc] = WIN[wc]; if (!(WIN[wc] in font.code)) font.code[WIN[wc]] = Number(wc); } }
      else { font.why = base + ' has no ToUnicode map and the encoding ' + (encName || 'built into the font') + (diffs ? ' with /Differences' : '') + ': its text cannot be read back for certain'; return font; }
      var fc = F.res(d.FirstChar), ws = F.res(d.Widths);
      if (Array.isArray(ws) && typeof fc === 'number') {
        ws.forEach(function (v, i) { font.w[fc + i] = F.res(v); });
        // a character is CARRIED only if its code has a width above 0 (SHEET_FRONT_DOOR §20.2 R2): a subset lists the codes it holds, an unused one is 0 or outside FirstChar..LastChar
        var anyWidth = false; /*MUT-WIDTHS*/
        if (!anyWidth) Object.keys(font.code).forEach(function (ch) { if (!(font.w[font.code[ch]] > 0)) delete font.code[ch]; });
      }
      else if (STD_FACES[base] !== undefined) { var sf = stdFont(base); font.w = sf.w; if (!tu) { font.uni = sf.uni; font.code = sf.code; } }
      else { font.why = base + ' has no /Widths'; return font; }
      if (STD_FACES[base] !== undefined && !d.FontDescriptor) font.std = true;
      descr(d.FontDescriptor); font.ok = true; return font;
    }
    if (nm(d.Encoding) !== 'Identity-H') { font.why = base + ' uses the encoding ' + (nm(d.Encoding) || 'of an embedded CMap') + ' (this page writes Identity-H text only)'; return font; }
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
    var runs = [], g = { ctm: P, clip: null, font: null, fname: null, size: 0, Tc: 0, Tw: 0, Th: 1, TL: 0, Ts: 0, Tr: 0 }, stack = [], Tm = I, Tlm = I, st = [], path = { rects: [], other: false, clip: false }, forms = 0;
    function line() { Tlm = mul([1, 0, 0, 1, 0, -g.TL], Tlm); Tm = Tlm; }
    function show(els, si, s, e, pre, carry) {
      var f = g.font, known = !!(f && f.ok), bpc = f ? f.bpc : 1, M = mul(Tm, g.ctm), pen = 0, a0 = null, a1 = 0, text = '', n = 0;
      // a WORD GAP drawn as spacing, not as a space glyph (justified text; SHEET_FRONT_DOOR §22.5): a move to the right between two glyphs of at least half the font's
      //   space (150/1000 em when the font has none) reads as a space, and its size is kept so a rewrite can put the same gap back (plan)
      var sp = known && f.code[' '] != null && f.w[f.code[' ']] > 0 ? f.w[f.code[' ']] / 2 : 150, gapOff = false, pend = 0, gaps = [], lastSpace = false; /*MUT-GAPS*/
      (Array.isArray(els) ? els : []).forEach(function (el) {
        if (typeof el === 'number') { pen -= el / 1000 * g.size * g.Th; if (n) pend -= el; return; }
        if (!el || !el.str) return;
        for (var i = 0; i + bpc <= el.str.length; i += bpc) {
          var c = bpc === 2 ? el.str[i] * 256 + el.str[i + 1] : el.str[i], w = known ? (c in f.w ? f.w[c] : f.dw) : 0;
          var u = known && c in f.uni ? f.uni[c] : '�';
          if (!gapOff && pend >= sp && n && !lastSpace && u !== ' ') { text += ' '; gaps.push(pend); } pend = 0; lastSpace = u === ' ';
          if (a0 === null) a0 = pen; pen += (w / 1000 * g.size + g.Tc + (bpc === 1 && c === 32 ? g.Tw : 0)) * g.Th; a1 = pen; n++;
          text += u;
        }
      });
      if (a0 === null) a0 = 0;
      var flat = M[0] > 0 && Math.abs(M[1]) < 1e-6 * M[0] && Math.abs(M[2]) < 1e-6 * Math.abs(M[3] || 1);
      runs.push({ si: si, s: s, e: e, pre: pre, carry: carry, fname: g.fname, font: f, known: known, why: f ? f.why : 'the font ' + g.fname + ' is not in the page resources', size: g.size, Tc: g.Tc, Tw: g.Tw, Th: g.Th, mode: g.Tr,
        k: M[0], h: g.size * Math.abs(M[3]), pen0: M[4], x0: M[4] + a0 * M[0], x1: M[4] + (n ? a1 - g.Tc * g.Th : 0) * M[0], y: M[5] + g.Ts * M[3], a0: a0, a1: a1, adv: pen, text: text, n: n, gaps: gaps, clip: g.clip, flat: flat });
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
          case 'Tr': g.Tr = a[n - 1]; break;
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

  // is this run (its centre cx, its baseline y) in that box: the ONE rule (SHEET_FRONT_DOOR §20.2 R6) for the writer, the sheet side and the page's edit layer
  function inBox(cx, y, box) { return cx >= box[0] - BOX_TOL && cx <= box[2] + BOX_TOL && y >= box[1] - BOX_TOL && y <= box[3] + BOX_TOL; }
  // ── which runs can be written back, ONE owner (SHEET_FRONT_DOOR §18.5 H1): the page's edit layer offers exactly the runs this does not lock, and plan() refuses the same ──
  function lockOf(r) {
    if (!r.n) return { reason: 'empty', message: 'the run draws no glyph' };
    var hidden = r.mode === 3 || r.mode === 7; /*MUT-TR*/   // text render mode 3 / 7 paints nothing (ISO 32000-2 §9.3.6): the hidden text of a scanned page (SHEET_FRONT_DOOR §20.2 R1)
    if (hidden) return { reason: 'invisible-text', message: 'this text is not drawn (the hidden text of a scanned page): changing it would not change what the page shows' };
    if (!r.flat) return { reason: 'rotated-text', message: 'the text is rotated or skewed' };
    if (!r.known) return { reason: 'font-not-supported', message: r.why };
    if (r.carry) return { reason: 'font-not-supported', message: 'the run is split across two content streams' };
    if (/�/.test(r.text)) return { reason: 'no-unicode', message: 'some glyphs of this run (font ' + r.font.name + ') have no Unicode meaning in the file' };
    if (SHAPED.test(r.text)) return { reason: 'script-not-supported', message: scriptOf(r.text) + ' text: its letters are shaped by the font and no standard PDF font has them' };
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
    if (!text && !RR.parseNum(newText)) return no('not-a-number', 'the new text "' + newText + '" is not a number (only a number can go here)');
    if (!text && !RR.parseNum(oldText)) return no('not-a-number', 'the cell holds "' + oldText + '", which is not a number (only a number can go here)');
    if (text && !newText) return no('empty-text', 'an empty text would remove the cell (deleting text is not possible here yet): type the new text');
    /*MUT-DROPTHAI*/
    if (text && SHAPED.test(newText)) return no('script-not-supported', 'no font here can show the ' + scriptOf(newText) + ' text "' + newText + '": its letters are shaped by the font and no standard PDF font has them');
    if (!Array.isArray(box) || box.length !== 4 || box.some(function (v) { return typeof v !== 'number' || !isFinite(v); })) return no('bad-edit', 'the edit names no box');
    var inThis = function (r) { return r.n > 0 && inBox((r.x0 + r.x1) / 2, r.y, box); };
    var hits = runs.filter(function (r) { return /*MUT-BOX*/ inThis(r); }).sort(function (a, b) { return a.x0 - b.x0; });
    if (!hits.length) return no('no-text-in-box', 'no text is drawn in that box' + (runs.forms ? ' (the page draws ' + runs.forms + ' form(s): text inside a form cannot be changed here yet)' : ''));
    var lk = null; hits.some(function (r) { lk = lockOf(r); return !!lk; }); if (lk) return no(lk.reason, lk.message);
    var found = hits.map(function (r) { return r.text; }).join('');
    if (squash(found) !== squash(oldText)) return no('old-text-not-in-box', 'the box holds "' + found + '", not "' + oldText + '"', { found: found });
    if (hits.some(function (r) { return taken.indexOf(r) >= 0; })) return no('duplicate-edit', 'two edits name the same box');
    var align = edit.align === 'left' ? 'left' : edit.align === 'center' || edit.align === 'centre' ? 'center' : 'right', tr = align === 'left' ? hits[0] : hits[hits.length - 1], f = tr.font;
    if (hits.some(function (r) { return r.fname !== tr.fname || r.size !== tr.size || r.Tc !== tr.Tc || r.Th !== tr.Th || r.si !== tr.si || Math.abs(r.y - tr.y) > 0.01; })) return no('several-fonts', 'the text is drawn in several fonts, sizes or lines');
    var X0 = hits[0].x0, X1 = Math.max.apply(null, hits.map(function (r) { return r.x1; }));
    // a run whose word gaps are spacing (interpret: r.gaps): a space typed into it is written as the SAME kind of gap (their median), never as a glyph the run did not use
    var gapsIn = tr.gaps || [], gap = gapsIn.length ? gapsIn.slice().sort(function (a, b) { return a - b; })[gapsIn.length >> 1] : 0, isGap = function (c) { return gap > 0 && c === ' '; };
    var chars = Array.from(newText), missing = chars.filter(function (c, i) { return !isGap(c) && !(c in f.code) && chars.indexOf(c) === i; }), wf = f, sub = null;
    if (missing.length /*MUT-GLYPH*/) {
      var msg = 'the font ' + f.name + ' in this PDF does not carry ' + missing.map(function (c) { return '"' + c + '"'; }).join(', ');
      if (!opts.substitute) return no('glyph-missing', msg, { font: f.name, missing: missing.join('') });
      var cand = Object.keys(fonts).sort().filter(function (k) { var x = fonts[k]; return x !== f && x.ok && !x.std && x.family === f.family && chars.every(function (c) { return isGap(c) || c in x.code; }); })[0];
      if (cand) { wf = fonts[cand]; sub = { from: f.name, to: wf.name, resource: cand, missing: missing.join(''), std: false, why: 'another face of the same family (' + f.family + ') in this file holds every glyph' }; }
      else if (ctx && ctx.std && chars.every(function (c) { return winCode(c) >= 0; })) {
        var ch = chooseStd(f, found, X1 - X0, tr), rk = ctx.std(ch.name); wf = fonts[rk];
        sub = { from: f.name, to: wf.name, resource: rk, missing: missing.join(''), std: true, why: 'no face of ' + f.family + ' in this file holds them; closest standard PDF font: ' + ch.why };
      } else return no('glyph-missing', msg + ', no other font of the family ' + f.family + ' on the page carries them' + (chars.some(function (c) { return winCode(c) < 0; }) ? ', and the standard PDF fonts cannot show ' + chars.filter(function (c) { return winCode(c) < 0; }).map(function (c) { return '"' + c + '"'; }).join(', ') : ''), { font: f.name, missing: missing.join('') });
    }
    var unit = tr.size * tr.Th, G = 0, hex = '';
    chars.forEach(function (c) { if (isGap(c)) { hex += '> ' + fmt(-gap) + ' <'; G += gap / 1000 * tr.size * tr.Th; return; }
      var code = c in wf.code ? wf.code[c] : 0; hex += hexN(code, wf.bpc); G += ((code in wf.w ? wf.w[code] : wf.dw) / 1000 * tr.size + tr.Tc + (wf.bpc === 1 && code === 32 ? tr.Tw || 0 : 0)) * tr.Th; });
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

  // ── one page as the writer sees it, ONE owner (SHEET_FRONT_DOOR §20.2 R3): its runs, fonts and streams, or the reason the whole page is locked.
  //   listRuns (what the edit layer offers) and rewriteNumbers (what is written) both come through here, so offered == writable.
  async function pageOf(F, pages, p, fontCache) {
    var pg = pages[p - 1], rot = ((Number(F.res(pg.inh.Rotate)) || 0) % 360 + 360) % 360, out = { pg: pg, rotate: rot, lock: null, streams: [], fonts: {}, runs: [] };
    if (rot) { out.lock = { reason: 'rotated-page', message: 'page ' + p + ' is turned (/Rotate ' + rot + '): this page cannot write back on a turned page yet' }; return out; }
    var vb = (F.res(pg.inh.CropBox) || F.res(pg.inh.MediaBox) || []).map(function (v) { return F.res(v); }); if (vb.length !== 4) throw fail('damaged', 'page ' + p + ' has no MediaBox');
    if (!F.use) { F.use = {}; pages.forEach(function (q) { F.contents(q).forEach(function (n) { F.use[n] = (F.use[n] || 0) + 1; }); }); }
    var refs = F.contents(pg); if (refs.some(function (n) { return F.use[n] > 1; })) { out.lock = { reason: 'shared-content', message: 'page ' + p + ' shares its content stream with another page' }; return out; }
    for (var n of refs) { var o = F.obj(n), d = await F.data(o); out.streams.push({ obj: o, bytes: d.bytes, flate: d.flate, splices: [] }); }
    var rs = F.res(pg.inh.Resources), fd = rs && rs.dict ? F.res(rs.dict.Font) : null;
    for (var name of Object.keys((fd && fd.dict) || {})) { var v = fd.dict[name], key = v && v.ref != null ? v.ref : null; out.fonts[name] = key != null && fontCache[key] ? fontCache[key] : await loadFont(F, v); if (key != null) fontCache[key] = out.fonts[name]; }
    out.runs = interpret(out.streams.map(function (s) { return s.bytes; }), out.fonts, [1, 0, 0, -1, -Math.min(vb[0], vb[2]), Math.max(vb[1], vb[3])]);
    return out;
  }

  async function rewriteNumbers(bytes, edits, opts) {
    opts = opts || {}; var t0 = Date.now(), refused = [], changes = [], out = bytes, touched = {};
    var all = function (named, message) { (Array.isArray(edits) ? edits : []).forEach(function (e) { refused.push({ cell: (e && e.cell) || null, page: e && e.page, reason: named, message: message }); }); if (!refused.length) refused.push({ cell: null, page: null, reason: named, message: message }); };
    try {
      if (!bytes || !bytes.length) throw fail('not-a-pdf', 'the file is empty');
      if (!Array.isArray(edits) || !edits.length) throw fail('no-edits', 'no edit was given');
      var F = await new PdfFile(bytes).load(), pages = F.pages(), byPage = {}, fontCache = {}, addFonts = [];
      edits.forEach(function (e) { var p = Number(e && e.page); if (!(p >= 1 && p <= pages.length)) refused.push({ cell: (e && e.cell) || null, page: e && e.page, reason: 'no-such-page', message: 'the file has ' + pages.length + ' page(s)' }); else (byPage[p] = byPage[p] || []).push(e); });
      for (var p of Object.keys(byPage)) {
        var P = await pageOf(F, pages, Number(p), fontCache);
        if (P.lock) { byPage[p].forEach(function (e) { refused.push({ cell: e.cell || null, page: e.page, reason: P.lock.reason, message: P.lock.message }); }); continue; }
        var pg = P.pg, streams = P.streams, fonts = P.fonts, runs = P.runs, taken = [];
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
          if (replaced[hn]) throw fail('shared-content', 'two edited pages share one resource dictionary: they cannot be changed in one go yet');
          var val = { dict: Object.assign({}, hold.val.dict) }, rv = val.dict.Resources, rd, fd, fdObj = null;
          if (rv && rv.ref != null) { var ro = F.obj(rv.ref); hold = ro; hn = ro.num; val = { dict: Object.assign({}, ro.val.dict) }; rd = val; }
          else { rd = { dict: Object.assign({}, (rv && rv.dict) || {}) }; val.dict.Resources = rd; }
          var fv = rd.dict.Font; if (fv && fv.ref != null) { fdObj = F.obj(fv.ref); fd = { dict: Object.assign({}, fdObj.val.dict) }; } else { fd = { dict: Object.assign({}, (fv && fv.dict) || {}) }; rd.dict.Font = fd; }
          Object.keys(A.added).forEach(function (k) { var n = size++; replaced[n] = bytesOf(n + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /' + escName(A.added[k]) + ' /Encoding /WinAnsiEncoding >>\nendobj\n'); fd.dict[k] = { ref: n, gen: 0 }; });
          if (replaced[fdObj ? fdObj.num : hn]) throw fail('shared-content', 'two edited pages share one font dictionary: they cannot be changed in one go yet');
          if (fdObj) replaced[fdObj.num] = bytesOf(fdObj.num + ' ' + fdObj.gen + ' obj\n' + ser(fd) + '\nendobj\n');
          else replaced[hn] = bytesOf(hn + ' ' + hold.gen + ' obj\n' + ser(val) + '\nendobj\n');
          log('§PDF_WRITE-FONT-ADDED page=' + (pages.indexOf(A.pg) + 1) + ' fonts=' + Object.keys(A.added).map(function (k) { return k + ':' + A.added[k]; }).join(',') + ' holder=' + (fdObj ? fdObj.num : hn));
        });
        /*MUT-REWRITE*/
        out = await F.build(replaced);
      }
    } catch (e) { all(e && e.named ? e.named : 'damaged', (e && e.message) || String(e)); }
    var ok = !refused.length && changes.length > 0; if (!ok) { out = bytes; changes = []; }
    refused.forEach(function (r) { log('§PDF_WRITE-REFUSED cell=' + (r.cell || '?') + ' page=' + r.page + ' reason=' + r.reason + ' message="' + r.message + '"'); });
    log('§PDF_WRITE ok=' + ok + ' edits=' + (Array.isArray(edits) ? edits.length : 0) + ' applied=' + changes.length + ' refused=' + refused.length + ' bytesIn=' + (bytes ? bytes.length : 0) + ' bytesOut=' + out.length + ' ms=' + (Date.now() - t0) + (F && F.info ? ' xref=' + F.info.xref + ' objStreams=' + F.info.objStreams + ' decodedKB=' + F.info.decodedKB.toFixed(1) : '') +
      (changes.length ? ' cells=' + changes.map(function (c) { return (c.cell || '?') + ':"' + c.oldText + '"->"' + c.newText + '"'; }).join(',') : ''));
    return { ok: ok, bytes: out, changes: changes, refused: refused };
  }

  // ── the sheet side: the same edits on the reader's input, so the reader's own rule judges the edited sheet (one owner) ──
  function applyToItems(pages, edits) {
    var out = (pages || []).map(function (p) { return p; }), refused = [];
    (edits || []).forEach(function (e) {
      var pi = Number(e.page) - 1, items = out[pi], box = e.box; if (!items) { refused.push({ cell: e.cell || null, reason: 'no-such-page' }); return; }
      var hit = items.filter(function (it) { return inBox((it.x0 + it.x1) / 2, it.base, box); }).sort(function (a, b) { return a.x0 - b.x0; });
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
      var F = await new PdfFile(bytes).load(), rootRef = F.trailer.Root, root = rootRef && rootRef.ref != null ? F.obj(rootRef.ref) : null; if (!root || !root.val || !root.val.dict) throw fail('damaged', 'the file has no catalog');
      var copy = function (v) { return { dict: Object.assign({}, v.dict) }; }, key = Array.prototype.map.call(String(name), function (c) { return c.charCodeAt(0); }), cmp = function (a, b) { for (var i = 0; i < a.length && i < b.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
      var holder = { obj: root, val: copy(root.val) }, namesV = holder.val.dict.Names, names;   // holder = the ONE existing object that has to change
      if (namesV && namesV.ref != null) { var no = F.obj(namesV.ref); if (!no || !no.val || !no.val.dict) throw fail('damaged', 'the catalog /Names is not a dictionary'); holder = { obj: no, val: copy(no.val) }; names = holder.val; }
      else { names = namesV && namesV.dict ? copy(namesV) : { dict: {} }; holder.val.dict.Names = names; }
      var efV = names.dict.EmbeddedFiles, tree;
      if (efV && efV.ref != null) { var eo = F.obj(efV.ref); if (!eo || !eo.val || !eo.val.dict) throw fail('damaged', '/EmbeddedFiles is not a dictionary'); holder = { obj: eo, val: copy(eo.val) }; tree = holder.val; }
      else { tree = efV && efV.dict ? copy(efV) : { dict: {} }; names.dict.EmbeddedFiles = tree; }
      if (tree.dict.Kids != null) throw fail('names-tree-not-supported', 'this PDF keeps its attachments in a split name tree (/Kids): the history cannot be put inside it yet');
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
      /*MUT-NOEMBED*/ out = await F.build(put);
      if (out !== bytes && out.length > 8 && latin1(out, 0, 7) === '%PDF-1.' && out[7] >= 48 && out[7] <= 51) out[7] = 52;   // /EmbeddedFiles is PDF 1.4: a 1.0-1.3 header says 1.4
    } catch (e) { refused.push({ reason: e && e.named ? e.named : 'damaged', message: (e && e.message) || String(e) }); out = bytes; replaced = false; }
    log('§PDF_EMBED ok=' + !refused.length + ' name=' + name + ' bytesIn=' + (bytes ? bytes.length : 0) + ' bytesOut=' + out.length + ' data=' + (data ? data.length : 0) + ' stored=' + stored + ' replaced=' + replaced + (refused.length ? ' reason=' + refused[0].reason + ' message="' + refused[0].message + '"' : ''));
    return { ok: !refused.length, bytes: out, replaced: replaced, refused: refused };
  }
  // the text runs of one page, as the writer sees them (for a witness or a host that wants to show what is editable)
  async function listRuns(bytes, page) {
    var F = await new PdfFile(bytes).load(), pages = F.pages(); if (!pages[(page || 1) - 1]) throw fail('no-such-page', 'no page ' + page);
    var P = await pageOf(F, pages, page || 1, {}), runs = P.runs;
    // per run: what the page's edit layer needs (SHEET_FRONT_DOOR §18.5 H1): its box in page points (y down), and why it is locked (lockOf, the one owner), or null
    var out = runs.map(function (r, i) { var lk = lockOf(r); return { i: i, text: r.text, font: r.font ? r.font.name : r.fname, size: r.size, x0: r.x0, x1: r.x1, y: r.y, h: r.h, known: r.known, flat: r.flat, n: r.n, lock: lk ? lk.reason : null, why: lk ? lk.message : null }; });
    out.forms = runs.forms || 0; out.rotate = P.rotate; out.pageLock = P.lock; /*MUT-PAGELOCK*/ return out;   // pageLock: the whole page is refused by the writer (turned, shared content), no run is offered
  }
  // any text run, not only numbers (SHEET_FRONT_DOOR §18.5): the same engine, the same all-or-nothing, the same named refusals
  function rewriteText(bytes, edits, opts) { return rewriteNumbers(bytes, edits, Object.assign({}, opts || {}, { text: true })); }
  return { rewriteNumbers: rewriteNumbers, rewriteText: rewriteText, lockOf: lockOf, inBox: inBox, WIN: WIN, applyToItems: applyToItems, formatLike: formatLike, alignOf: alignOf, record: record, embedFile: embedFile, listRuns: listRuns };
});
