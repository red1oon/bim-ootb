// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InvoiceCreateInOut.js — org.compiere.process.InvoiceCreateInOut, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InvoiceCreateInOut.java). §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InvoiceCreateInOut', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function InvoiceCreateInOut() { SvrProcess.call(this); this.p_M_Warehouse_ID = 0; this.p_C_Invoice_ID = 0; this.m_inout = null; this.p_C_DocType_ID = 0; }
    InvoiceCreateInOut.prototype = Object.create(SvrProcess.prototype);
    InvoiceCreateInOut.prototype.prepare = function () {                              // :59-73
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_Warehouse_ID') this.p_M_Warehouse_ID = para[i].getParameterAsInt();   // PARAM_M_Warehouse_ID :43
        else if (name === 'C_DocType_ID') this.p_C_DocType_ID = para[i].getParameterAsInt();       // PARAM_C_DocType_ID :44
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InvoiceCreateInOut ' + name);
      }
      this.p_C_Invoice_ID = this.getRecord_ID();
    };
    InvoiceCreateInOut.prototype.doIt = function () {                                 // :82-102
      var A = X.A, g = G(), trx = this.get_TrxName(), msg = function (m) { return A.Msg.parseTranslation(A.Env, m); };
      var parse = function (m) { return A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), m)); }.bind(this);
      if (this.p_C_Invoice_ID <= 0) throw parse('@FillMandatory@ @C_Invoice_ID@');      // :86 FillMandatoryException
      if (this.p_M_Warehouse_ID === 0) throw parse('@FillMandatory@ @M_Warehouse_ID@');  // :88
      var invoice = trx.get('c_invoice', this.p_C_Invoice_ID);                          // :90
      if (!invoice) throw parse('@NotFound@ @C_Invoice_ID@');                           // :92
      if ('CO' !== invoice.docstatus) throw parse('@InvoiceCreateDocNotCompleted@');    // :94
      var ils = g.lines(trx, 'c_invoiceline', 'c_invoice_id', invoice.c_invoice_id);     // :97 getLines(false)
      for (var i = 0; i < ils.length; i++) this.createLine(invoice, ils[i]);
      if (this.m_inout == null) throw parse('@InvoiceFullyMatched@');                   // :99 InvoiceFullyMatchedException
      var io = trx.get('m_inout', this.m_inout.id());
      this.addLog(io.m_inout_id, io.movementdate, null, io.documentno, 319, io.m_inout_id);   // :102
      return io.documentno;                                                              // :104
    };
    // getCreateHeader :112-121
    InvoiceCreateInOut.prototype.getCreateHeader = function (invoice) {
      var g = G(), C = g.ctor(), trx = this.get_TrxName();
      if (this.m_inout != null) return this.m_inout;
      this.m_inout = C.MInOutFromInvoice(trx, invoice, 0, null, this.p_M_Warehouse_ID);
      if (this.p_C_DocType_ID !== 0) this.m_inout.set('c_doctype_id', this.p_C_DocType_ID);
      g.saveEx(this.m_inout);
      return this.m_inout;
    };
    // createLine :129-157
    InvoiceCreateInOut.prototype.createLine = function (invoice, invoiceLine) {
      var A = X.A, g = G(), C = g.ctor(), T = g.T(), trx = this.get_TrxName(), D = T.D;
      var qtyMatched = D(trx.q("SELECT COALESCE(SUM(Qty),0) AS q FROM M_MatchInv WHERE C_InvoiceLine_ID=? AND Processed=?", [invoiceLine.c_invoiceline_id, 'Y'])[0].q);   // MInvoiceLine.getMatchedQty :1419-1426
      var qtyInvoiced = D(invoiceLine.qtyinvoiced);
      var qtyNotMatched = qtyInvoiced.subtract(qtyMatched);
      if (qtyNotMatched.signum() === 0) return null;                                    // :134-137 fully matched
      var inout = this.getCreateHeader(invoice);
      var sLine = C.MInOutLine(trx, inout);
      C.ioSetInvoiceLine(trx, sLine, invoiceLine, 0, T.Y(invoice.issotrx) ? qtyNotMatched : A.Env.ZERO);   // :141-142 (Locator 0)
      C.ioSetQtyEntered(trx, sLine, qtyNotMatched);                                     // :143
      C.ioSetMovementQty(trx, sLine, qtyNotMatched);                                    // :144
      if (g.isCreditMemo(trx, trx.get('c_invoice', invoice.c_invoice_id) && new (g.ML().PO)(trx, 'c_invoice', trx.get('c_invoice', invoice.c_invoice_id)))) {   // :145 invoice.isCreditMemo()
        C.ioSetQtyEntered(trx, sLine, D(sLine.get('qtyentered')).negate());
        C.ioSetMovementQty(trx, sLine, D(sLine.get('movementqty')).negate());
      }
      g.saveEx(sLine);                                                                  // :150
      var r = X.save(trx, 'C_InvoiceLine', invoiceLine, { m_inoutline_id: sLine.id() }); // :152-153
      if (!r.ok) throw new Error(r.error || 'SaveError');
      return sLine;
    };
    return InvoiceCreateInOut;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
