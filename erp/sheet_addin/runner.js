// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// runner.js - the BOOKS RUNNER of the sheet door: runner.file(tpl, cells, ledgerLines) -> { result, ledgerLine, facts }.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §9 (slice S3b) - Witness: W-FILE-IT (erp/tests/witness_file_it.js).
// It is what host_shim.js calls for File it (§8.1): ONE transaction through the kernel (ws_kernel inTrx) over SheetDoor.file, the commit, and the kernel's signed
// journal entry handed back as the workbook's ledger line. UMD: the same file runs over the node kernel and over the browser kernel (ws_kernel_web.js boot()).
// The workbook is the book: when the workbook's ledger is not the journal of the kernel in memory, a kernel is made fresh and the ledger replayed first.
// `facts` is the filed document READ BACK FROM THE KERNEL DATABASE (never from the sheet): header, lines, and the accounting entries posted for it.
// No invoice logic here (twin law: Import Invoice does the work); the SQL below only reads what was filed.
(function (global) {
  'use strict';
  // the GardenWorld demo login the S1 / S3 witnesses file with (client 11, org 11, GardenAdmin 100, role 102, warehouse 103); a tenant / login choice is not in this slice
  var SESSION = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103 };

  // facts(k, invoiceId): the document and its books, from the kernel DB
  function facts(k, id) {
    var h = k.one('SELECT i.c_invoice_id, i.documentno, i.docstatus, i.dateinvoiced, i.totallines, i.grandtotal, i.posted, i.issotrx, b.value AS partnervalue, b.name AS partner, ' +
      'c.iso_code AS currency, d.name AS doctype, (SELECT r.name FROM ad_ref_list r JOIN ad_column col ON col.ad_reference_value_id = r.ad_reference_id ' +
      "JOIN ad_table t ON t.ad_table_id = col.ad_table_id WHERE lower(t.tablename) = 'c_invoice' AND lower(col.columnname) = 'docstatus' AND r.value = i.docstatus) AS docstatusname " +
      'FROM c_invoice i LEFT JOIN c_bpartner b ON b.c_bpartner_id = i.c_bpartner_id LEFT JOIN c_currency c ON c.c_currency_id = i.c_currency_id ' +
      'LEFT JOIN c_doctype d ON d.c_doctype_id = i.c_doctype_id WHERE i.c_invoice_id = ?', [id]);
    if (!h) return null;
    var lines = k.q('SELECT l.line, p.value AS productvalue, p.name AS product, ch.name AS charge, l.description, l.qtyinvoiced AS qty, l.priceactual AS price, l.linenetamt AS net, t.name AS tax ' +
      'FROM c_invoiceline l LEFT JOIN m_product p ON p.m_product_id = l.m_product_id LEFT JOIN c_charge ch ON ch.c_charge_id = l.c_charge_id LEFT JOIN c_tax t ON t.c_tax_id = l.c_tax_id ' +
      'WHERE l.c_invoice_id = ? ORDER BY l.line', [id]);
    var books = k.q('SELECT f.fact_acct_id, sc.name AS book, cu.iso_code AS currency, ev.value AS account, ev.name AS accountname, f.amtacctdr AS debit, f.amtacctcr AS credit FROM fact_acct f ' +
      'LEFT JOIN c_elementvalue ev ON ev.c_elementvalue_id = f.account_id LEFT JOIN c_acctschema sc ON sc.c_acctschema_id = f.c_acctschema_id LEFT JOIN c_currency cu ON cu.c_currency_id = sc.c_currency_id ' +
      "WHERE f.record_id = ? AND f.ad_table_id = (SELECT ad_table_id FROM ad_table WHERE lower(tablename) = 'c_invoice') ORDER BY f.fact_acct_id", [id]);
    return { id: h.c_invoice_id, window: zoomWindow(k, 'c_invoice', h.issotrx), documentno: h.documentno, docstatus: h.docstatus, docstatusname: h.docstatusname, date: String(h.dateinvoiced || '').slice(0, 10), doctype: h.doctype,
      partner: h.partner, partnervalue: h.partnervalue, currency: h.currency, totallines: h.totallines, grandtotal: h.grandtotal, posted: h.posted, lines: lines, books: books };
  }

  // zoomWindow(k, table, isSOTrx): the window a record of that table opens in, by legacy's zoom rule (the table's AD_Window_ID; its PO_Window_ID for a purchase-side record). Dictionary read only.
  function zoomWindow(k, table, isSOTrx) {
    var t = k.one('SELECT ad_window_id, po_window_id FROM ad_table WHERE lower(tablename) = ?', [String(table).toLowerCase()]);
    return !t ? null : (String(isSOTrx) === 'N' && t.po_window_id != null ? t.po_window_id : t.ad_window_id);
  }

  // create(deps): deps = { boot() -> Promise<kernel>, SheetDoor, AP() -> ad_process API, session?, actor? }
  function create(deps) {
    var S = Object.assign({}, SESSION, deps.session || {}); if (deps.actor) S.actor = deps.actor;
    var OPTS = { AD_Client_ID: S.clientId, AD_Org_ID: S.orgId };
    var st = { k: null, lines: [] };                                             // the kernel in memory and the journal lines it holds, as the workbook stores them

    // The books left behind: the kernel takes back the save hooks its build() registered (ws_kernel dispose, §10: they close over its database), then the database is closed.
    function close() { if (st.k) { try { st.k.dispose(); st.k.db.close(); } catch (e) { /* already gone */ } } st.k = null; st.lines = []; }
    async function kernelFor(ledgerLines) {
      if (st.k && st.lines.join('\n') === ledgerLines.join('\n')) return st.k;   // same workbook, same books
      if (!st.k || st.lines.length) { close(); st.k = await deps.boot(); }   // another workbook: its own books, from the seed
      if (ledgerLines.length) {
        try { st.k.replay(ledgerLines.join('\n')); } catch (e) { close(); throw e; }   // a replay stopped half way is not a book
        st.lines = ledgerLines.slice();
      }
      return st.k;
    }

    async function file(tpl, cells, ledgerLines) {
      var k;
      try { k = await kernelFor(ledgerLines || []); }
      catch (e) { return { result: { ok: false, verdict: 'REFUSED', reason: 'the books could not be opened: ' + (e && e.message || e), writes: [], checks: [] }, ledgerLine: null, facts: null }; }
      var j0 = k.journal.length, AP = deps.AP();
      var r = k.inTrx(S, { ws: 'sheet_door' }, function (trx) { return deps.SheetDoor.file(trx, { AP: AP, ML: k.ML }, tpl, cells, OPTS); });
      var line = k.journal.length > j0 ? JSON.stringify(k.journal[k.journal.length - 1]) : null, id = null;
      if (line) {
        st.lines.push(line);
        (r.ops || []).forEach(function (o) { if (String(o.table).toLowerCase() === 'c_invoice' && o.op_type === 'CRUD_CREATE') id = o.fields.c_invoice_id; });
      }
      return { result: { ok: r.ok, verdict: r.verdict, reason: r.reason || r.error || null, writes: r.writes || [], checks: r.checks || [], invoice: r.invoice },
        ledgerLine: line, facts: id != null ? facts(k, id) : null, log: (r.log || []).filter(function (l) { return /^§(SHEET_DOOR|IMPORT_INVOICE|MODEL-ERR)/.test(l); }) };
    }

    return { file: file, ready: function () { return !!st.k; }, kernel: function () { return st.k; }, open: function () { return kernelFor(st.lines); }, lines: function () { return st.lines.slice(); } };
  }

  var api = { create: create, facts: facts, zoomWindow: zoomWindow, SESSION: SESSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetRunner = api;
})(typeof window !== 'undefined' ? window : this);
