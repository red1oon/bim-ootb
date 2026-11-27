// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// file_it.js - the page file_it.html: open a workbook file, File it, see the document and its books, take the workbook back.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §9 (slice S3b) - Witness: W-FILE-IT (erp/tests/witness_file_it.js).
// The page adds nothing of its own: host_shim.js File it (the same menu action as in Excel) over xlsx_host.js (the workbook file) and runner.js (the kernel).
// What is shown as "the document" and "the books" is runner.facts: read from the kernel database after the commit, never taken from the sheet.
(function () {
  'use strict';
  var W = window, XLSX = W.XLSX;
  function $(id) { return document.getElementById(id); }
  var st = { wb: null, name: null, last: null, verdict: null, busy: false };
  var runner = W.SheetRunner.create({ boot: W.WsKernelWeb.boot, SheetDoor: W.SheetDoor, AP: function () { return W.AdProcess; } });
  var seen = { file: async function (tpl, cells, ledgerLines, noSavedResult) { st.last = await runner.file(tpl, cells, ledgerLines, noSavedResult); return st.last; } };   // the shim's runner; the page keeps what came back

  function text(el, s) { el.textContent = s; }
  function money(v) { return v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function row(tb, cells, cls) {
    var tr = document.createElement('tr'); if (cls) tr.className = cls;
    cells.forEach(function (c) { var td = document.createElement('td'); if (c && c.n) { td.className = 'n'; td.textContent = c.v; } else td.textContent = c == null ? '' : String(c); tr.appendChild(td); });
    tb.appendChild(tr);
  }
  function clear(tb) { while (tb.firstChild) tb.removeChild(tb.firstChild); }

  var ready = runner.open().then(function () {
    var c = W.WsKernelWeb.cost.last;
    text($('engine'), 'Books engine ready: ' + c.scripts + ' program files and ' + (c.bytes / 1048576).toFixed(1) + ' MB of demo books loaded in ' + (c.totalMs / 1000).toFixed(1) + ' s.');
    enable();
  }, function (e) { text($('engine'), 'The books engine could not load: ' + (e && e.message || e)); throw e; });
  ready.catch(function () { /* shown above */ });

  function enable() { $('b-file').disabled = !(st.wb && runner.ready() && !st.busy); }

  function open(bytes, name) {
    st.wb = XLSX.read(bytes, Object.assign({ type: 'array' }, W.SheetAddinXlsx.READ)); st.name = name; st.last = null;
    var vis = st.wb.SheetNames.filter(function (n, i) { var m = st.wb.Workbook && st.wb.Workbook.Sheets && st.wb.Workbook.Sheets[i]; return !(m && m.Hidden); });
    text($('opened'), 'Opened ' + name + ' (sheet' + (vis.length === 1 ? ' ' : 's ') + vis.join(', ') + ').');
    // no marked invoice cells: say it now, in the user's words, with the way on (SHEET_FRONT_DOOR §16.1 F5); the engine's own verdict is unchanged
    if (st.wb.SheetNames.indexOf(W.SheetAddin.TAGS) < 0) text($('opened'), $('opened').textContent + ' Its invoice cells are not marked, so this page cannot file it yet: marking your own layout is not built yet. To see filing work, press Get a sample invoice.');
    show(null); enable();
  }

  function show(r) {
    var v = $('verdict'), f = st.last && st.last.facts, d = $('b-download');
    st.verdict = r ? r.verdict : null;
    $('doc').hidden = $('books').hidden = !(r && r.ok && f);
    $('why').hidden = true; d.hidden = true;
    erpLink(r && r.ok ? f : null);
    if (!r) { v.dataset.verdict = ''; text(v, 'Nothing filed yet.'); return; }
    v.dataset.verdict = r.verdict;
    if (r.ok && f) {
      text(v, 'Filed. ' + f.doctype + ' ' + f.documentno + ' for ' + f.partner + ' is in the books (' + (f.docstatusname || f.docstatus) + ').');
      text($('why'), 'The status cell of your sheet now says: ' + r.text + (r.checksLine ? '\n' + r.checksLine : '')); $('why').hidden = false;
      var dl = $('doc-head'); clear(dl);
      [['Document', f.doctype], ['Number', f.documentno], ['Status', f.docstatusname || f.docstatus], ['Date', f.date], ['Customer', f.partner], ['Lines total', money(f.totallines) + ' ' + f.currency],
        ['Grand total', money(f.grandtotal) + ' ' + f.currency]].forEach(function (p) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = p[0]; dd.textContent = p[1]; dd.dataset.k = p[0]; dl.appendChild(dt); dl.appendChild(dd); });
      var lt = $('doc-lines').tBodies[0]; clear(lt);
      f.lines.forEach(function (l) { row(lt, [l.line, l.product || l.charge, l.description, { n: 1, v: String(l.qty) }, { n: 1, v: money(l.price) }, { n: 1, v: money(l.net) }, l.tax]); });
      var bt = $('books-rows').tBodies[0], dr = 0, cr = 0; clear(bt);
      f.books.forEach(function (b) { dr += Math.round(Number(b.debit) * 100); cr += Math.round(Number(b.credit) * 100); row(bt, [b.book + ' (' + b.currency + ')', b.account, b.accountname, { n: 1, v: money(b.debit) }, { n: 1, v: money(b.credit) }]); });
      row(bt, ['', '', 'Total', { n: 1, v: money(dr / 100) }, { n: 1, v: money(cr / 100) }], 'total');
      var e = JSON.parse(st.last.ledgerLine);
      text($('ledger'), 'Ledger line ' + e.seq + ' added to the hidden sheet _door_ledger of your workbook (' + e.ops + ' record changes, signature ' + e.hash.slice(0, 12) + '...). With it the workbook can rebuild these books on its own.');
    } else {
      text(v, (r.text || ('Not filed (' + r.verdict + ')')) + (r.checksLine ? '\n' + r.checksLine : ''));
    }
    d.hidden = !((r.writes && r.writes.length) || r.ledgerRow);                 // something in the workbook changed: offer it back
  }

  // "Open in the ERP" (§10): the workbook's verified ledger is kept in this origin's storage for the ERP page, which applies each entry once. The link is the ERP page's own
  //   deep link to the document's window and record (window id read from the dictionary by runner.facts). Nothing leaves the device.
  function handOver() { return W.DoorHandover.offer(W.WsKernel, st.name, runner.lines()); }
  function erpLink(f) {
    var a = $('b-erp'), n = $('erp-note'); a.hidden = n.hidden = true;
    if (!f || f.window == null || f.id == null) return;
    var o = handOver();
    if (o.ok) { a.href = '../idempiere.html?window=' + encodeURIComponent(f.window) + '&record=' + encodeURIComponent(f.id); a.hidden = false;
      text(n, 'Opens the ERP in this browser, logs in as you choose there (the demo books are GardenWorld) and shows this document in its own window with its posting. It is taken into the ERP\'s books once.'); }
    else text(n, 'This document cannot be opened in the ERP from here: ' + o.why + '.');
    n.hidden = false;
  }

  async function fileIt() {
    if (!st.wb || st.busy) return;
    st.busy = true; enable(); text($('verdict'), 'Working...'); $('verdict').dataset.verdict = '';
    try {
      await ready;
      var host = W.SheetAddinXlsx.create(XLSX, st.wb, { engineValue: W.SheetAddinExcel.engineValue });
      var shim = W.SheetAddin.create(host, { SheetDoor: W.SheetDoor, runner: seen });
      st.last = null;
      show(await shim.fileIt());
    } catch (e) { $('verdict').dataset.verdict = 'ERROR'; st.verdict = 'ERROR'; text($('verdict'), 'Could not do that: ' + (e && e.message || e)); }
    st.busy = false; enable();
  }

  function download(wb, name) {
    var blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $('file').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    f.arrayBuffer().then(function (b) { open(new Uint8Array(b), f.name); }, function (e) { text($('opened'), 'That file could not be read: ' + (e && e.message || e)); })
      .catch(function (e) { st.wb = null; enable(); text($('opened'), 'That file is not a workbook this page can read: ' + (e && e.message || e)); });
    ev.target.value = '';
  });
  $('b-sample').addEventListener('click', function () {
    var wb = W.SheetSampleInvoice.build(XLSX, {});
    download(wb, 'sample_invoice.xlsx');
    open(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), 'sample_invoice.xlsx');
  });
  $('b-file').addEventListener('click', fileIt);
  $('b-download').addEventListener('click', function () { if (st.wb) download(st.wb, st.name); });
  $('b-erp').addEventListener('click', function (ev) { var o = handOver(); if (!o.ok) { ev.preventDefault(); erpLink(st.last && st.last.facts); } });

  // what a witness reads: the page's state and the kernel database behind the figures on screen (read-only)
  W.FileItPage = { ready: ready, state: st, runner: runner, sql: function (sql, params) { return runner.kernel().q(sql, params || []); },
    journal: function () { return runner.kernel().journal.map(function (e) { return JSON.stringify(e); }); } };
})();
