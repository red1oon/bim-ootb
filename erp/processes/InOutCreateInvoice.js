// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InOutCreateInvoice.js — org.compiere.process.InOutCreateInvoice, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InOutCreateInvoice.java). §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InOutCreateInvoice', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function InOutCreateInvoice() { SvrProcess.call(this); this.p_M_InOut_ID = 0; this.p_M_PriceList_ID = 0; this.p_InvoiceDocumentNo = null; }
    InOutCreateInvoice.prototype = Object.create(SvrProcess.prototype);
    InOutCreateInvoice.prototype.prepare = function () {                              // :46-62
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_PriceList_ID') this.p_M_PriceList_ID = para[i].getParameterAsInt();
        else if (name === 'InvoiceDocumentNo') this.p_InvoiceDocumentNo = para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InOutCreateInvoice ' + name);
      }
      this.p_M_InOut_ID = this.getRecord_ID();
    };
    InOutCreateInvoice.prototype.doIt = function () {                                 // :70-146
      var A = X.A, Env = A.Env, g = G(), C = g.ctor(), T = g.T(), HU = T.HU, trx = this.get_TrxName();
      if (this.p_M_InOut_ID === 0) throw new Error('No Shipment');                     // :76
      var ship = trx.get('m_inout', this.p_M_InOut_ID);                                // :79
      if (!ship) throw new Error('Shipment not found');                                // :80
      if ('CO' !== ship.docstatus) throw new Error('Shipment not completed');           // :82
      var invoice = C.MInvoiceFromInOut(trx, ship, null);                              // :85 new MInvoice(ship, null)
      if (this.p_M_PriceList_ID !== 0 && !T.nz(ship.m_rma_id)) invoice.set('m_pricelist_id', this.p_M_PriceList_ID);   // :87-88
      if (this.p_InvoiceDocumentNo != null && String(this.p_InvoiceDocumentNo).length > 0) invoice.set('documentno', this.p_InvoiceDocumentNo);   // :89-90
      if (!invoice.save()) throw new Error('Cannot save Invoice');                     // :91
      var shipLines = g.lines(trx, 'm_inoutline', 'm_inout_id', ship.m_inout_id);      // :93 getLines(false)
      for (var i = 0; i < shipLines.length; i++) {                                     // :94-106
        var sLine = shipLines[i], line = C.MInvoiceLine(trx, invoice);
        C.ilSetShipLine(trx, line, sLine);                                             // line.setShipLine(sLine)
        if (C.sameOrderLineUOM(trx, sLine)) C.ilSetQtyEntered(trx, line, A.toBD(String(sLine.qtyentered)));
        else C.ilSetQtyEntered(trx, line, A.toBD(String(sLine.movementqty)));
        C.ilSetQtyInvoiced(trx, line, A.toBD(String(sLine.movementqty)));
        if (!line.save()) throw new Error('Cannot save Invoice Line');
      }
      if (T.nz(invoice.get('c_order_id'))) {                                           // :108
        var order = trx.get('c_order', invoice.get('c_order_id'));
        invoice.set('paymentrule', order.paymentrule); invoice.set('c_paymentterm_id', order.c_paymentterm_id);   // :110-111
        g.saveEx(invoice);                                                              // :112
        invoice.load();                                                                 // :113 refresh from DB
        var opss = [];                                                                  // :115 MOrderPaySchedule.getOrderPaySchedule(ctx, C_Order_ID, 0, trx)
        try { opss = trx.q("SELECT * FROM C_OrderPaySchedule ops WHERE IsActive='Y' AND C_Order_ID=? ORDER BY DueDate", [order.c_order_id]); }
        catch (e) { trx.say('§PROC-UNPORTED-DEP MOrderPaySchedule.getOrderPaySchedule — table C_OrderPaySchedule absent from the bundle (InOutCreateInvoice.java:115) — treated as no order schedule'); }
        var ipss = trx.q("SELECT * FROM C_InvoicePaySchedule ips WHERE IsActive='Y' AND C_Invoice_ID=? ORDER BY DueDate", [invoice.id()]);   // :116
        if (ipss.length === 0 && opss.length > 0) {                                    // :117
          var ogt = A.toBD(String(order.grandtotal)), igt = A.toBD(String(invoice.get('grandtotal')));
          var percent = Env.ONE, samePct = true;
          if (ogt.compareTo(igt) !== 0) { percent = igt.divide(ogt, 10, A.RoundingMode.HALF_UP); samePct = false; }   // :121-122
          var cur = trx.get('c_currency', order.c_currency_id), scale = Number(cur.stdprecision);   // :123-124
          opss.forEach(function (ops) {                                                  // :126-141
            var f = {}; Object.keys(ops).forEach(function (k) { if (!/^(c_orderpayschedule_id|c_orderpayschedule_uu|created|createdby|updated|updatedby|c_order_id)$/.test(k)) f[k] = ops[k]; });   // PO.copyValues
            var ipo = g.ML().newRecord(trx, 'c_invoicepayschedule', f);
            if (!samePct) {
              var prop = A.toBD(String(ops.dueamt)).multiply(percent);                   // :131
              if (prop.scale() > scale) prop = prop.setScale(scale, A.RoundingMode.HALF_UP);
              ipo.set('dueamt', prop);
            }
            ipo.set('c_invoice_id', invoice.id()).set('ad_org_id', ops.ad_org_id).set('processing', ops.processing).set('isactive', ops.isactive);
            g.saveEx(ipo);                                                                // :140
          });
        }
        // invoice.validatePaySchedule() (MInvoice.java:1107-1139)
        ipss = trx.q("SELECT * FROM C_InvoicePaySchedule ips WHERE IsActive='Y' AND C_Invoice_ID=? ORDER BY DueDate", [invoice.id()]);
        if (ipss.length === 0) invoice.set('ispayschedulevalid', 'N');
        else {
          var total = Env.ZERO;
          ipss.forEach(function (s) { if (s.dueamt != null) total = total.add(A.toBD(String(s.dueamt))); });
          var valid = A.toBD(String(invoice.get('grandtotal'))).compareTo(total) === 0;
          invoice.set('ispayschedulevalid', valid ? 'Y' : 'N');
          ipss.forEach(function (s) { if ((s.isvalid === 'Y') !== valid) { var r = X.save(trx, 'C_InvoicePaySchedule', s, { isvalid: valid }); if (!r.ok) throw new Error(r.error || 'SaveError'); } });
        }
        g.saveEx(invoice);                                                              // :144
      }
      var inv = trx.get('c_invoice', invoice.id());
      this.addLog(inv.c_invoice_id, inv.dateinvoiced, inv.grandtotal, inv.documentno, 318, inv.c_invoice_id);   // :147
      return inv.documentno;                                                            // :149
    };
    return InOutCreateInvoice;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
