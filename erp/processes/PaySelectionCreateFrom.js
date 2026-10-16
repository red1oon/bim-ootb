// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/PaySelectionCreateFrom.js — org.compiere.process.PaySelectionCreateFrom, verbatim
// (org.adempiere.base.process/src/org/compiere/process/PaySelectionCreateFrom.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// SQL functions currencyConvertInvoice/invoiceOpen/invoiceDiscount/currencyConvert are the sqlfn.js/views.js UDFs; the view C_Invoice_v
// is created by callouts/views.js (M.ensureView). invoiceWriteOff = the live PG function: sysconfig PAYSELECTION_CUSTOM_INVOICEWRITEOFF_FUNCTION
// else 0 (pg_get_functiondef) — invoiceWriteOff() is the callouts/sqlfn.js UDF, called in the SQL as Java does.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.PaySelectionCreateFrom', function (SvrProcess, X) {
    var A = X.A, R = A.RUNTIME;
    function PaySelectionCreateFrom() { SvrProcess.call(this); this.p_OnlyDiscount = false; this.p_OnlyDue = false; this.p_IncludeInDispute = false; this.p_MatchRequirement = 'N';
      this.p_PaymentRule = null; this.p_C_BPartner_ID = 0; this.p_C_BP_Group_ID = 0; this.p_C_PaySelection_ID = 0; this.p_OnlyPositive = false; this.p_DueDate = null; }
    PaySelectionCreateFrom.prototype = Object.create(SvrProcess.prototype);
    PaySelectionCreateFrom.prototype.prepare = function () {                                                  // :78-113
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'OnlyDiscount') this.p_OnlyDiscount = 'Y' === para[i].getParameter();
        else if (name === 'OnlyDue') this.p_OnlyDue = 'Y' === para[i].getParameter();
        else if (name === 'IncludeInDispute') this.p_IncludeInDispute = 'Y' === para[i].getParameter();
        else if (name === 'MatchRequirement') this.p_MatchRequirement = para[i].getParameter();
        else if (name === 'PaymentRule') this.p_PaymentRule = para[i].getParameter();
        else if (name === 'C_BPartner_ID') this.p_C_BPartner_ID = para[i].getParameterAsInt();
        else if (name === 'C_BP_Group_ID') this.p_C_BP_Group_ID = para[i].getParameterAsInt();
        else if (name === 'DueDate') this.p_DueDate = para[i].getParameter();
        else if (name === 'PositiveBalance') this.p_OnlyPositive = 'Y' === para[i].getParameter();
        else R.log('§PROC-UNKNOWN-PARA PaySelectionCreateFrom ' + name);
      }
      this.p_C_PaySelection_ID = this.getRecord_ID();
    };
    PaySelectionCreateFrom.prototype.doIt = function () {                                                      // :121-340
      var trx = this.get_TrxName(), PAY = P.PSUP.pay, C = PAY.ctor(), D = A.toBD, ZERO = A.Env.ZERO;
      var psel = trx.get('c_payselection', this.p_C_PaySelection_ID);
      if (psel == null) throw new Error('Not found C_PaySelection_ID=' + this.p_C_PaySelection_ID);           // IllegalArgumentException
      if (psel.processed === 'Y') throw new Error('@Processed@');
      var payDate = String(psel.paydate);
      var dueDate = this.p_DueDate == null ? payDate : String(this.p_DueDate.toString());                    // :133 p_DueDate = psel.getPayDate()
      var C_CurrencyTo_ID = R.DB.getSQLValue(null, 'SELECT C_Currency_ID FROM C_BankAccount WHERE C_BankAccount_ID=?', psel.c_bankaccount_id);   // MPaySelection.getC_Currency_ID :119-128
      R.M.ensureView('c_invoice_v');
      var sql = 'SELECT C_Invoice_ID,' +
        ' currencyConvertInvoice(i.C_Invoice_ID,?,invoiceOpen(i.C_Invoice_ID, i.C_InvoicePaySchedule_ID), ?) AS PayAmt,' +
        ' currencyConvertInvoice(i.C_Invoice_ID,?,invoiceDiscount(i.C_Invoice_ID,?,i.C_InvoicePaySchedule_ID),?) AS DiscountAmt,' +
        ' PaymentRule, IsSOTrx, ' +
        ' currencyConvert(invoiceWriteOff(i.C_Invoice_ID),i.C_Currency_ID, ?,?,i.C_ConversionType_ID,i.AD_Client_ID,i.AD_Org_ID) AS WriteOffAmt ' +
        'FROM C_Invoice_v i ';
      var w = 'WHERE ';
      w += 'D' === this.p_PaymentRule ? "i.IsSOTrx='Y'" : "i.IsSOTrx='N'";                                   // X_C_Order.PAYMENTRULE_DirectDebit
      w += " AND i.IsPaid='N' AND i.DocStatus IN ('CO','CL')" + ' AND i.AD_Client_ID=?' +
        ' AND NOT EXISTS (SELECT * FROM C_PaySelectionLine psl INNER JOIN C_PaySelectionCheck psc ON (psl.C_PaySelectionCheck_ID=psc.C_PaySelectionCheck_ID)' +
        ' LEFT OUTER JOIN C_Payment pmt ON (pmt.C_Payment_ID=psc.C_Payment_ID)' +
        " WHERE i.C_Invoice_ID=psl.C_Invoice_ID AND psl.IsActive='Y'" +
        " AND (pmt.DocStatus IS NULL OR pmt.DocStatus NOT IN ('VO','RE')) )" +
        ' AND i.C_Invoice_ID NOT IN (SELECT psl.C_Invoice_ID FROM C_PaySelectionLine psl WHERE psl.C_PaySelection_ID=?)';
      if (!this.p_IncludeInDispute) w += " AND i.IsInDispute='N'";
      if (this.p_PaymentRule != null) w += ' AND i.PaymentRule=?';
      if (this.p_OnlyDiscount) { w += this.p_OnlyDue ? ' AND (' : ' AND '; w += 'invoiceDiscount(i.C_Invoice_ID,?,i.C_InvoicePaySchedule_ID) > 0'; }
      if (this.p_OnlyDue) { w += this.p_OnlyDiscount ? ' OR ' : ' AND '; w += 'i.DueDate<=?'; if (this.p_OnlyDiscount) w += ')'; }
      if (this.p_C_BPartner_ID !== 0) w += ' AND i.C_BPartner_ID=?';
      else if (this.p_C_BP_Group_ID !== 0) w += ' AND EXISTS (SELECT * FROM C_BPartner bp WHERE bp.C_BPartner_ID=i.C_BPartner_ID AND bp.C_BP_Group_ID=?)';
      if (this.p_MatchRequirement === 'P' || this.p_MatchRequirement === 'B')
        w += ' AND EXISTS (SELECT * FROM C_InvoiceLine il WHERE i.C_Invoice_ID=il.C_Invoice_ID AND QtyInvoiced=(SELECT SUM(Qty) FROM M_MatchPO m WHERE il.C_InvoiceLine_ID=m.C_InvoiceLine_ID))';
      if (this.p_MatchRequirement === 'R' || this.p_MatchRequirement === 'B')
        w += ' AND EXISTS (SELECT * FROM C_InvoiceLine il WHERE i.C_Invoice_ID=il.C_Invoice_ID AND QtyInvoiced=(SELECT SUM(Qty) FROM M_MatchInv m WHERE il.C_InvoiceLine_ID=m.C_InvoiceLine_ID))';
      if (this.p_OnlyPositive) {                                                                              // :222-241
        var sub = w.replace(/\bi\b/g, 'i1').replace(/\bpsl\b/g, 'psl1').replace(/\bpsc\b/g, 'psc1').replace(/\bpmt\b/g, 'pmt1').replace(/\bbp\b/g, 'bp1').replace(/\bil\b/g, 'il1');
        w += ' AND i.c_bpartner_id NOT IN ( SELECT i1.C_BPartner_ID FROM C_Invoice_v i1 ' + sub +
          ' GROUP BY i1.C_BPartner_ID HAVING sum(invoiceOpen(i1.C_Invoice_ID, i1.C_InvoicePaySchedule_ID)) <= 0) ';
      }
      sql += w;
      var args = [C_CurrencyTo_ID, payDate, C_CurrencyTo_ID, payDate, payDate, C_CurrencyTo_ID, payDate, psel.ad_client_id, this.p_C_PaySelection_ID];   // :248-262
      var tail = [];
      if (this.p_PaymentRule != null) tail.push(this.p_PaymentRule);
      if (this.p_OnlyDiscount) tail.push(payDate);
      if (this.p_OnlyDue) tail.push(dueDate);
      if (this.p_C_BPartner_ID !== 0) tail.push(this.p_C_BPartner_ID); else if (this.p_C_BP_Group_ID !== 0) tail.push(this.p_C_BP_Group_ID);
      args = args.concat(tail);
      if (this.p_OnlyPositive) args = args.concat([psel.ad_client_id, this.p_C_PaySelection_ID]).concat(tail);   // :264-275
      var rows = R.DB.query(sql, args), lines = 0;
      for (var k = 0; k < rows.length; k++) {                                                                  // :277-306
        var rs = rows[k], C_Invoice_ID = Number(rs.c_invoice_id), PayAmt = rs.payamt == null ? null : D(rs.payamt);
        if (PayAmt == null) {
          var iv = trx.get('c_invoice', C_Invoice_ID), dt = iv ? trx.q('SELECT name FROM c_doctype WHERE c_doctype_id=?', [iv.c_doctype_id])[0] : null;
          return '@Error@ @PaySelectionPayAmtIsNull@ (' + (dt ? dt.name : '') + ' ' + (iv ? iv.documentno : '') + ')';     // MInvoice.getDocumentInfo
        }
        if (C_Invoice_ID === 0 || ZERO.compareTo(PayAmt) === 0) continue;
        var DiscountAmt = D(rs.discountamt), WriteOffAmt = D(rs.writeoffamt), PaymentRule = rs.paymentrule, isSOTrx = 'Y' === rs.issotrx;
        lines++;
        var pselLine = C.MPaySelectionLine(trx, psel, lines * 10, PaymentRule);
        C.pslSetInvoice(pselLine, C_Invoice_ID, isSOTrx, PayAmt, PayAmt.subtract(DiscountAmt).subtract(WriteOffAmt), DiscountAmt, WriteOffAmt);
        if (!pselLine.save()) throw new Error('Cannot save MPaySelectionLine');                                // IllegalStateException
      }
      return '@C_PaySelectionLine_ID@  - #' + lines;
    };
    return PaySelectionCreateFrom;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
