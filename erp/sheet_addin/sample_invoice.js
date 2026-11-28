// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// sample_invoice.js - builds a small TAGGED invoice workbook (the S1 witness invoice on the GardenWorld demo seed: customer C&W, Oak 2 x 61.75, Elm 3 x 10.00)
// so file_it.html can be tried before "Mark my invoice" (S7) exists. Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §9 - Witness: W-FILE-IT (it files
// this very workbook). A template is DATA (§2): the layout below is one `_door_tags` entry, nothing in the engine knows it. UMD (node + browser).
(function (global) {
  'use strict';
  var TPL = { kind: 'invoice', fixed: { issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD' },
    header: { partner: 'B3', date: 'F3', docno: 'F2', subtotal: 'G20', grandtotal: 'G22', status: 'G24' },
    lines: { from: 8, to: 18, cols: { product: 'B', description: 'C', qty: 'D', price: 'E', amount: 'G' } } };
  var LINES = [{ product: 'Oak', description: 'Oak tree, 2m', qty: 2, price: 61.75 }, { product: 'Elm', description: 'Elm tree', qty: 3, price: 10 }];
  function serial(iso) { var p = iso.split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000); }

  // build(XLSX, o) -> workbook. o (all optional): docno, partner, date (ISO day), lines [{product, description, qty, price|null}], subtotal, grandtotal (null = left blank), tpl
  function build(XLSX, o) {
    o = o || {};
    var tpl = o.tpl || TPL, H = tpl.header, L = tpl.lines, ws = {}, lines = o.lines || LINES, sum = 0, priced = true;
    function put(a, v, extra) { ws[a] = Object.assign(typeof v === 'number' ? { t: 'n', v: v } : { t: 's', v: String(v) }, extra || {}); }
    put('B1', 'INVOICE'); put('A3', 'Customer'); put('E2', 'Number'); put('E3', 'Date'); put('F20', 'Subtotal'); put('F22', 'Total'); put('F24', 'Status');
    put(L.cols.product + (L.from - 1), 'Item'); put(L.cols.description + (L.from - 1), 'Description'); put(L.cols.qty + (L.from - 1), 'Qty'); put(L.cols.price + (L.from - 1), 'Price'); put(L.cols.amount + (L.from - 1), 'Amount');
    put(H.partner, o.partner || 'C&W'); put(H.date, serial(o.date || '2026-11-20'), { z: 'yyyy-mm-dd' });
    if (o.docno) put(H.docno, o.docno);
    lines.forEach(function (l, i) {
      var r = L.from + i;
      put(L.cols.product + r, l.product); if (l.description) put(L.cols.description + r, l.description); put(L.cols.qty + r, l.qty);
      if (l.price == null) { priced = false; return; }                          // a blank price: the price list prices the line, no amount is printed
      var amt = Math.round(l.qty * l.price * 100) / 100; sum = Math.round((sum + amt) * 100) / 100;
      put(L.cols.price + r, l.price, { z: '0.00' }); put(L.cols.amount + r, amt, { z: '0.00', f: L.cols.qty + r + '*' + L.cols.price + r });
    });
    if (priced || o.subtotal != null) put(H.subtotal, o.subtotal != null ? o.subtotal : sum, o.subtotal != null ? { z: '0.00' } : { z: '0.00', f: 'SUM(' + L.cols.amount + L.from + ':' + L.cols.amount + L.to + ')' });
    var grand = o.grandtotal !== undefined ? o.grandtotal : (priced ? sum : null);   // GardenWorld's Standard tax is 0%: the books' total equals the lines (W-FILE-IT F1 holds it)
    if (grand != null) put(H.grandtotal, grand, { z: '0.00' });
    ws['!ref'] = 'A1:G24';
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[{ t: 's', v: JSON.stringify(tpl) }]]), '_door_tags');
    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 2 }] };
    return wb;
  }

  var api = { build: build, TPL: TPL, LINES: LINES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetSampleInvoice = api;
})(typeof window !== 'undefined' ? window : this);
