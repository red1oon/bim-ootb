// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// table_fixture.js - small PDF tables MADE BY THE WITNESSES (no binary in git): a title, header, rows of a label and right-aligned figures, a blank row, a total row.
//   Used by witness_pdf_write.js (W16) and witness_edit_sheet.js (E3, SHEET_FRONT_DOOR §30). Written from ISO 32000-2 §7 and the Adobe Helvetica widths; never the engine.
// ledger({ rows:[[label, fig, fig, ...]], totals:[t1, t2, ...], clip:[colIndex] }) -> Uint8Array
//   figures are printed as given (strings), right edge of column k at 250 + 90*k pt; totals sit after one blank row; clip: the totals of these columns are drawn inside a
//   clip rectangle exactly as wide as the printed total (so a wider total does not fit: the writer says does-not-fit)
'use strict';
var W = { '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, '.': 278, ',': 278, '(': 333, ')': 333, '-': 333 };
function width(s, size) { var w = 0; for (var i = 0; i < s.length; i++) w += W[s[i]] || 556; return w * size / 1000; }
function esc(s) { return String(s).replace(/([()\\])/g, '\\$1'); }
function ledger(o) {
  var size = 10, pitch = 14, y0 = 760, rows = o.rows, ops = [], clip = o.clip || [], right = function (k) { return 250 + 90 * k; };
  var put = function (text, x, y) { ops.push('BT /F1 ' + size + ' Tf 1 0 0 1 ' + x.toFixed(3) + ' ' + y + ' Tm (' + esc(text) + ') Tj ET'); };
  put('Ledger', 60, y0); put('Item', 60, y0 - pitch); (o.header || rows[0].slice(1).map(function (_, k) { return 'Col' + (k + 1); })).forEach(function (h, k) { put(h, right(k) - width(h, size), y0 - pitch); });
  rows.forEach(function (r, i) { var y = y0 - pitch * (i + 2); put(r[0], 60, y); r.slice(1).forEach(function (t, k) { put(t, right(k) - width(t, size), y); }); });
  var yt = y0 - pitch * (rows.length + 2 + 1);
  put('Total', 60, yt); o.totals.forEach(function (t, k) {
    var x = right(k) - width(t, size);
    if (clip.indexOf(k) >= 0) ops.push('q ' + (x - 0.01).toFixed(3) + ' ' + (yt - 3) + ' ' + (width(t, size) + 0.02).toFixed(3) + ' ' + (size + 4) + ' re W n'); put(t, x, yt); if (clip.indexOf(k) >= 0) ops.push('Q');
  });
  var content = ops.join('\n'), objs = { 1: '<< /Type /Catalog /Pages 2 0 R >>', 2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', 4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 5: { stream: content } };
  var out = '%PDF-1.4\n', off = {};
  [1, 2, 3, 4, 5].forEach(function (n) { off[n] = out.length; var b = objs[n]; out += n + ' 0 obj\n' + (typeof b === 'string' ? b : '<< /Length ' + b.stream.length + ' >>\nstream\n' + b.stream + '\nendstream') + '\nendobj\n'; });
  var x = out.length; out += 'xref\n0 6\n0000000000 65535 f \n'; for (var n = 1; n <= 5; n++) out += ('0000000000' + off[n]).slice(-10) + ' 00000 n \n';
  return new Uint8Array(Buffer.from(out + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n', 'latin1'));
}
// the witness's own cent arithmetic (integers), to make a total that is exactly right: sum(['0.10', '20.20']) -> '20.30'
function cents(t) { return Math.round(Number(String(t).replace(/,/g, '')) * 100); }
function money(c) { var s = Math.abs(c), i = String(Math.floor(s / 100)).replace(/\B(?=(\d{3})+$)/g, ','), f = ('0' + (s % 100)).slice(-2); return (c < 0 ? '-' : '') + i + '.' + f; }
function sum(list) { return money(list.reduce(function (a, t) { return a + cents(t); }, 0)); }
module.exports = { ledger: ledger, width: width, sum: sum, cents: cents, money: money };
