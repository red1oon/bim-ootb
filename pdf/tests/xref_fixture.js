// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// xref_fixture.js - the witnesses' OWN maker and reader of PDF 1.5+ files (SHEET_FRONT_DOOR §22.3): used by witness_pdf_write.js (W15) and witness_edit_sheet.js (H10).
//   convert(classic PDF) packs the non-stream objects into object streams and writes an xref stream; xsRead is the independent reader of the cross-reference.
//   Written from ISO 32000-2 §7.5.7 / §7.5.8 / §7.4.4.4 and node zlib; it never requires pdf_write.js (the engine does not build a fixture it is judged on).
'use strict';
var zlib = require('zlib');
function count(text, s) { return text.split(s).length - 1; }
// ── this file's own view of a CLASSIC PDF (one xref table, object slices) ──
function struct(bytes) {
  var b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length), s = b.toString('latin1'), sx = s.lastIndexOf('startxref'), xo = Number(/startxref\s+(\d+)/.exec(s.slice(sx))[1]), tr = s.indexOf('trailer', xo);
  var head = /^xref\s+(\d+)\s+(\d+)\s+/.exec(s.slice(xo, xo + 40)), ents = s.slice(xo + head[0].length, tr).match(/\d{10} \d{5} [nf]/g) || [], objs = [];
  ents.forEach(function (e, i) { if (e[17] === 'n') objs.push({ num: Number(head[1]) + i, off: Number(e.slice(0, 10)) }); });
  objs.sort(function (a, c) { return a.off - c.off; }); objs.forEach(function (o, i) { o.end = i + 1 < objs.length ? objs[i + 1].off : xo; o.raw = b.subarray(o.off, o.end); o.head = s.slice(o.off, Math.min(o.end, o.off + 24)); });
  var by = {}; objs.forEach(function (o) { by[o.num] = o; });
  return { b: b, s: s, xrefOff: xo, entries: ents.length, objs: objs, by: by, trailer: s.slice(tr, sx), eofs: count(s, '%%EOF'), prev: /\/Prev\b/.test(s.slice(tr, sx)) };
}

// ── the converter and the reader ──
function paeth(a, b, c) { var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function pngEnc(data, cols, mode) {   // PNG-predict rows of `cols` bytes: mode 'up' = every row filter 2 (what a writer usually does); 'cycle' = row r takes filter r % 5 (all five)
  var rows = Math.ceil(data.length / cols), out = Buffer.alloc(rows * (cols + 1));
  for (var r = 0; r < rows; r++) {
    var f = mode === 'up' ? 2 : r % 5; out[r * (cols + 1)] = f;
    for (var i = 0; i < cols; i++) {
      var x = data[r * cols + i] || 0, a = i ? data[r * cols + i - 1] || 0 : 0, u = r ? data[(r - 1) * cols + i] || 0 : 0, c = i && r ? data[(r - 1) * cols + i - 1] || 0 : 0;
      out[r * (cols + 1) + 1 + i] = (x - (f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : paeth(a, u, c))) & 255;
    }
  }
  return out;
}
function pngDec(buf, cols) {
  var rows = Math.floor(buf.length / (cols + 1)), out = Buffer.alloc(rows * cols);
  for (var r = 0; r < rows; r++) for (var i = 0; i < cols; i++) {
    var f = buf[r * (cols + 1)], x = buf[r * (cols + 1) + 1 + i], a = i ? out[r * cols + i - 1] : 0, u = r ? out[(r - 1) * cols + i] : 0, c = i && r ? out[(r - 1) * cols + i - 1] : 0;
    out[r * cols + i] = (x + (f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : paeth(a, u, c))) & 255;
  }
  return out;
}
function tiffEnc(data, cols) { var out = Buffer.alloc(data.length); for (var i = 0; i < data.length; i++) out[i] = (data[i] - (i % cols ? data[i - 1] : 0)) & 255; return out; }   // Predictor 2, 8 bit, 1 colour
function xrow(t, a, c) { return [t, (a >> 16) & 255, (a >> 8) & 255, a & 255, (c >> 8) & 255, c & 255]; }   // /W [1 3 2] (the engine writes [1 4 2]: the layout is read, not assumed)
function xstream(num, dict, rows, cols, pred) {   // an xref stream object: its rows, Flate, with a predictor (12 / 2 / 0 none)
  var raw = Buffer.from([].concat.apply([], rows)), body = pred === 12 ? pngEnc(raw, cols, 'up') : pred === 2 ? tiffEnc(raw, cols) : raw, z = zlib.deflateSync(body);
  return Buffer.concat([Buffer.from(num + ' 0 obj\n<< /Type /XRef /W [1 3 2] ' + dict + ' /Filter /FlateDecode' + (pred ? ' /DecodeParms << /Predictor ' + pred + ' /Columns ' + cols + ' >>' : '') + ' /Length ' + z.length + ' >>\nstream\n', 'latin1'), z, Buffer.from('\nendstream\nendobj\n')]);
}
// convert(classic PDF) -> the same objects with the non-stream ones packed into object streams (first one with Predictor 15), and an xref stream (Predictor 12), or (hybrid) a classic table + /XRefStm.
//   o = { pack:false (xref stream only), hybrid:true, xpred:2 (a predictor the engine does not know), chunk:20 }
function convert(bytes, o) {
  o = Object.assign({ pack: true, hybrid: false, chunk: 20, xpred: 12 }, o || {});
  var st = struct(bytes), trl = st.trailer, size0 = Number(/\/Size\s+(\d+)/.exec(trl)[1]), pick = function (k) { var m = new RegExp('/' + k + '\\s+\\d+\\s+\\d+\\s+R').exec(trl); return m ? m[0] : ''; }, idm = /\/ID\s*\[[^\]]*\]/.exec(trl);
  var common = [pick('Root'), pick('Info'), pick('Encrypt'), idm ? idm[0] : ''].join(' ').replace(/\s+/g, ' ').trim(), parts = [Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n', 'latin1')], pos = parts[0].length, at = {}, packed = [], where = {};
  var emit = function (buf, n) { if (n != null) at[n] = pos; parts.push(buf); pos += buf.length; };
  st.objs.forEach(function (ob) {
    var t = ob.raw.toString('latin1'), m = /^(\d+)\s+0\s+obj\s*/.exec(t), e = t.lastIndexOf('endobj');
    if (o.pack && m && e > 0 && !/>>\s*stream\r?\n/.test(t)) packed.push({ num: ob.num, body: t.slice(m[0].length, e).trim() });
    else emit(Buffer.concat([ob.raw.subarray(0, e + 6), Buffer.from('\n')]), ob.num);
  });
  var K = Math.ceil(packed.length / o.chunk), k, stms = [];
  for (k = 0; k < K; k++) {
    var grp = packed.slice(k * o.chunk, (k + 1) * o.chunk), hdr = '', body = '', num = size0 + k;
    grp.forEach(function (p, i) { hdr += p.num + ' ' + body.length + ' '; body += p.body + '\n'; where[p.num] = { stm: num, idx: i }; });
    var raw = Buffer.from(hdr + body, 'latin1'), pr = k === 0, data = pr ? pngEnc(raw, 16, 'cycle') : raw, z = zlib.deflateSync(data);
    emit(Buffer.concat([Buffer.from(num + ' 0 obj\n<< /Type /ObjStm /N ' + grp.length + ' /First ' + hdr.length + ' /Filter /FlateDecode' + (pr ? ' /DecodeParms << /Predictor 15 /Columns 16 >>' : '') + ' /Length ' + z.length + ' >>\nstream\n', 'latin1'), z, Buffer.from('\nendstream\nendobj\n')]), num); stms.push(num);
  }
  var xn = size0 + K, size = xn + 1, xo, i, rows = [];
  if (!o.hybrid) {
    for (i = 0; i < size; i++) rows.push(i === 0 ? xrow(0, 0, 65535) : i === xn ? xrow(1, pos, 0) : at[i] != null ? xrow(1, at[i], 0) : where[i] ? xrow(2, where[i].stm, where[i].idx) : xrow(0, 0, 0));
    xo = pos; emit(xstream(xn, '/Size ' + size + ' ' + common, rows, 6, o.xpred), xn);
    parts.push(Buffer.from('startxref\n' + xo + '\n%%EOF\n')); pos += ('startxref\n' + xo + '\n%%EOF\n').length;
  } else {
    var nums = Object.keys(where).map(Number).sort(function (a, b) { return a - b; }), runs = [];
    nums.forEach(function (n) { var l = runs[runs.length - 1]; if (l && l[0] + l[1] === n) l[1]++; else runs.push([n, 1]); });
    var xs = pos; emit(xstream(xn, '/Size ' + size + ' /Index [' + runs.map(function (r) { return r[0] + ' ' + r[1]; }).join(' ') + '] ' + common, nums.map(function (n) { return xrow(2, where[n].stm, where[n].idx); }), 6, o.xpred), null);
    xo = pos; var x = 'xref\n0 1\n0000000000 65535 f \n', run = null;   // the table lists only the objects that are NOT in an object stream, in subsections (the hidden ones are simply absent: poppler and ghostscript take a free entry there as final)
    for (i = 1; i <= size; i++) { if (i < size && at[i] != null) { if (!run) run = [i, []]; run[1].push(('0000000000' + at[i]).slice(-10) + ' 00000 n \n'); } else if (run) { x += run[0] + ' ' + run[1].length + '\n' + run[1].join(''); run = null; } }
    var tail = x + 'trailer\n<< /Size ' + size + ' ' + common + ' /XRefStm ' + xs + ' >>\nstartxref\n' + xo + '\n%%EOF\n'; parts.push(Buffer.from(tail, 'latin1')); pos += tail.length;
  }
  return { bytes: new Uint8Array(Buffer.concat(parts)), size: size, xrefOff: xo, infoNum: Number((/\/Info\s+(\d+)/.exec(common) || [])[1]) || 0, common: common, objStreams: K, packed: packed.length, stms: stms };
}
// an incremental update on a converted file (a NEWER xref stream with /Prev): the Info object, which lives packed in an object stream below, gets a new ordinary copy
function appendUpdate(c, title) {
  var b = Buffer.from(c.bytes), n = c.infoNum, obj = Buffer.from(n + ' 0 obj\n<< /Title (' + title + ') /Producer (W15 revision 2) >>\nendobj\n'), p0 = b.length, xo = p0 + obj.length, xn = c.size;
  var x = xstream(xn, '/Size ' + (xn + 1) + ' /Index [' + n + ' 1 ' + xn + ' 1] /Prev ' + c.xrefOff + ' ' + c.common, [xrow(1, p0, 0), xrow(1, xo, 0)], 6, 12);
  return new Uint8Array(Buffer.concat([b, obj, x, Buffer.from('startxref\n' + xo + '\n%%EOF\n')]));
}
// the witness's own reader of the cross-reference (classic, stream, hybrid, /Prev): ents[n] = { t:0|1|2, off|stm|idx }, newest first; and of objects, object streams
function xsRead(bytes) {
  var b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length), s = b.toString('latin1'), X = { b: b, s: s, ents: {}, tables: 0, streams: 0, startxrefs: (s.match(/startxref/g) || []).length, prev: 0, xrefObjs: {}, secOffs: [], problems: [] };
  var put = function (n, e, fillFree) { var o = X.ents[n]; if (!o || (fillFree && o.t === 0)) X.ents[n] = e; };
  var dictOf = function (off) { var k = s.indexOf('stream', off); return { dict: s.slice(off, k), k: k }; };
  var section = function (off, main) {
    X.secOffs.push(off);
    if (s.substr(off, 4) === 'xref') {
      X.tables++; var tr = s.indexOf('trailer', off), tk = s.slice(off + 4, tr).trim().split(/\s+/), t = 0, tail = s.slice(tr, s.indexOf('startxref', tr)), ents = [];
      while (t < tk.length) { var first = Number(tk[t++]), cnt = Number(tk[t++]); for (var i = 0; i < cnt; i++) { var o = Number(tk[t++]), g = Number(tk[t++]), f = tk[t++]; ents.push([first + i, f === 'n' ? { t: 1, off: o, gen: g } : { t: 0 }]); } }
      var xs = /\/XRefStm\s+(\d+)/.exec(tail), hs = xs ? stmSection(Number(xs[1])) : null;
      ents.forEach(function (e) { put(e[0], e[1]); }); if (hs) hs.ents.forEach(function (e) { put(e[0], e[1], true); });
      var pv = /\/Prev\s+(\d+)/.exec(tail); if (main) X.size = Number((/\/Size\s+(\d+)/.exec(tail) || [])[1]); return pv ? Number(pv[1]) : null;
    }
    var sec = stmSection(off); sec.ents.forEach(function (e) { put(e[0], e[1]); }); X.streams++; if (main) X.size = sec.size; return sec.prev;
  };
  var stmSection = function (off) {
    X.secOffs.push(off); var d = dictOf(off), W = /\/W\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(d.dict).slice(1).map(Number), size = Number(/\/Size\s+(\d+)/.exec(d.dict)[1]), ix = /\/Index\s*\[([^\]]*)\]/.exec(d.dict), idx = ix ? ix[1].trim().split(/\s+/).map(Number) : [0, size];
    var ds = d.k + 6; if (s[ds] === '\r') ds++; if (s[ds] === '\n') ds++; var len = Number(/\/Length\s+(\d+)/.exec(d.dict)[1]), buf = zlib.inflateSync(b.subarray(ds, ds + len)), pr = /\/Predictor\s+(\d+)/.exec(d.dict), rl = W[0] + W[1] + W[2];
    if (pr && Number(pr[1]) >= 10) buf = pngDec(buf, Number(/\/Columns\s+(\d+)/.exec(d.dict)[1]));
    var ents = [], p = 0, rd = function (w) { var v = 0; for (var j = 0; j < w; j++) v = v * 256 + buf[p++]; return v; };
    for (var q = 0; q + 1 < idx.length; q += 2) for (var i = 0; i < idx[q + 1]; i++) { var t = W[0] ? rd(W[0]) : 1, a = rd(W[1]), c = rd(W[2]); ents.push([idx[q] + i, t === 1 ? { t: 1, off: a, gen: c } : t === 2 ? { t: 2, stm: a, idx: c } : { t: 0 }]); }
    X.xrefObjs[Number(/^(\d+)/.exec(s.slice(off, off + 12))[1])] = off; var pv = /\/Prev\s+(\d+)/.exec(d.dict);
    return { ents: ents, size: size, prev: pv ? Number(pv[1]) : null };
  };
  var off = Number(/startxref\s+(\d+)/.exec(s.slice(s.lastIndexOf('startxref')))[1]), seen = {}, newest = true;
  try { while (off != null && !seen[off]) { seen[off] = 1; if (!newest) X.prev++; off = section(off, newest); newest = false; } } catch (e) { X.problems.push('the cross-reference cannot be read: ' + String(e && e.message || e).slice(0, 80)); }
  X.stmCache = {};
  X.endOf = function (o) {   // one object's bytes, `n g obj` .. `endobj` (a stream's through its endstream), found without the engine
    var e = s.indexOf('endobj', o), k = s.slice(o, e).search(/(>>|\])\s*stream\r?\n/);
    if (k < 0) return { end: e + 6, stream: false };
    var m = /(>>|\])\s*stream\r?\n/.exec(s.slice(o, e)), ds = o + m.index + m[0].length, dict = s.slice(o, o + m.index + 2), lm = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict), len = lm ? (lm[2] ? Number(/^(\d+)/.exec(X.body(Number(lm[1])).trim())[1]) : Number(lm[1])) : -1;
    return { end: s.indexOf('endobj', ds + len) + 6, stream: true, ds: ds, len: len, dict: dict };
  };
  X.objstm = function (n) {   // a decoded object stream: { nums, offs, first, bytes }
    if (X.stmCache[n]) return X.stmCache[n]; var e = X.ents[n], o = X.endOf(e.off), dict = o.dict, buf = zlib.inflateSync(b.subarray(o.ds, o.ds + o.len)), pr = /\/Predictor\s+(\d+)/.exec(dict);
    if (pr && Number(pr[1]) >= 10) buf = pngDec(buf, Number(/\/Columns\s+(\d+)/.exec(dict)[1]));
    var N = Number(/\/N\s+(\d+)/.exec(dict)[1]), first = Number(/\/First\s+(\d+)/.exec(dict)[1]), tk = buf.toString('latin1', 0, first).trim().split(/\s+/).map(Number), nums = [], offs = [];
    for (var i = 0; i < N; i++) { nums.push(tk[2 * i]); offs.push(tk[2 * i + 1]); } return (X.stmCache[n] = { nums: nums, offs: offs, first: first, bytes: buf, dict: dict });
  };
  X.body = function (n) {   // the text of object n (an ordinary object, or one cut out of its object stream)
    var e = X.ents[n]; if (!e || e.t === 0) return ''; if (e.t === 1) { var t = s.slice(e.off, X.endOf(e.off).end); return t.replace(/^\d+\s+\d+\s+obj\s*/, '').replace(/\s*endobj$/, ''); }
    var S = X.objstm(e.stm), i = S.nums.indexOf(n), end = i + 1 < S.offs.length ? S.offs[i + 1] : S.bytes.length - S.first; return S.bytes.toString('latin1', S.first + S.offs[i], S.first + end).trim();
  };
  X.raw = function (n) {   // the object's whole piece of the file: from its first byte to the first byte of whatever follows it (the next object or cross-reference), so a stray byte after `endobj` counts
    var e = X.ents[n], at = e.off, offs = X.secOffs.slice(); Object.keys(X.ents).forEach(function (k) { if (X.ents[k].t === 1) offs.push(X.ents[k].off); });
    var next = offs.filter(function (o) { return o > at; }).sort(function (a, c) { return a - c; })[0]; return b.subarray(at, next == null ? b.length : next);
  };
  X.same = function (Y, n) { try { return X.raw(n).equals(Y.raw(n)); } catch (e) { return false; } };
  X.valid = function () {   // every offset lands on its own `n g obj`; every stream's /Length is exact; every type-2 entry names a real object stream that holds it
    var bad = [], cnt = { t0: 0, t1: 0, t2: 0 };
    X.problems.forEach(function (p) { bad.push(p); });
    Object.keys(X.ents).forEach(function (k) { try {
      var n = Number(k), e = X.ents[k]; cnt['t' + e.t]++;
      if (e.t === 1) {
        var m = /^(\d+)\s+(\d+)\s+obj/.exec(s.substr(e.off, 24)); if (!m || Number(m[1]) !== n) { bad.push('obj ' + n + ' not at ' + e.off); return; }
        var o = X.endOf(e.off); if (o.stream) { var tail = s.substr(o.ds + o.len, 16); if (o.len < 0 || !/^\r?\n?endstream/.test(tail)) bad.push('obj ' + n + ' /Length ' + o.len + ' is not exact'); }
      } else if (e.t === 2) { var h = X.ents[e.stm]; if (!h || h.t !== 1 || !/\/Type\s*\/ObjStm/.test(s.substr(h.off, 200))) { bad.push('obj ' + n + ' names stm ' + e.stm + ' which is no object stream'); return; } if (X.objstm(e.stm).nums[e.idx] !== n) bad.push('obj ' + n + ' is not at index ' + e.idx + ' of stm ' + e.stm); }
    } catch (x) { bad.push('obj ' + k + ' cannot be read: ' + String(x && x.message || x).slice(0, 60)); } });
    return { bad: bad, counts: cnt };
  };
  return X;
}

module.exports = { struct: struct, convert: convert, appendUpdate: appendUpdate, xsRead: xsRead };
