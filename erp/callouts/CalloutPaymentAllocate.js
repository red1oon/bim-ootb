// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutPaymentAllocate.js — VERBATIM port of org.adempiere.base.callout/src/org/compiere/model/CalloutPaymentAllocate.java
// (prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE scenarios/cp/CalloutPaymentAllocate.json). Methods 2/2: invoice :53, amounts :141.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutPaymentAllocate', function (CalloutEngine, R) {
    var Env = R.Env, Msg = R.Msg;
    function CalloutPaymentAllocate() { CalloutEngine.call(this); }
    CalloutPaymentAllocate.prototype = Object.create(CalloutEngine.prototype);
    function idOf(po, m) { return po ? (po[m]() || 0) : 0; }          // new MPayment(ctx, 0) getters → 0

    // invoice :53-124
    CalloutPaymentAllocate.prototype.invoice = function (ctx, WindowNo, mTab, mField, value) {
      var C_Invoice_ID = value;
      if (this.isCalloutActive() || C_Invoice_ID == null || C_Invoice_ID === 0) return '';
      var C_Payment_ID = Env.getContextAsInt(ctx, WindowNo, 'C_Payment_ID');                      // :61-65 Check Payment
      var payment = R.PO.get('C_Payment', C_Payment_ID);
      if (idOf(payment, 'getC_Charge_ID') !== 0 || idOf(payment, 'getC_Invoice_ID') !== 0 || idOf(payment, 'getC_Order_ID') !== 0)
        return Msg.getMsg(ctx, 'PaymentIsAllocated');
      mTab.setValue('DiscountAmt', Env.ZERO);                                                       // :68-70
      mTab.setValue('WriteOffAmt', Env.ZERO);
      mTab.setValue('OverUnderAmt', Env.ZERO);
      var C_InvoicePaySchedule_ID = 0;                                                              // :72-77
      if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_Invoice_ID') === C_Invoice_ID
        && Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID') !== 0)
        C_InvoicePaySchedule_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID');
      var ts = Env.getContextAsDate(ctx, WindowNo, 'DateTrx');                                      // :80
      var sql = 'SELECT C_BPartner_ID,C_Currency_ID, invoiceOpen(C_Invoice_ID, ?), invoiceDiscount(C_Invoice_ID,?,?), IsSOTrx ' +
        'FROM C_Invoice WHERE C_Invoice_ID=?';                                                      // :82-85
      try {
        var pstmt = R.DB.prepareStatement(sql);
        pstmt.setInt(1, C_InvoicePaySchedule_ID); pstmt.setTimestamp(2, ts); pstmt.setInt(3, C_InvoicePaySchedule_ID); pstmt.setInt(4, C_Invoice_ID);
        var rs = pstmt.executeQuery();
        if (rs.next()) {                                                                            // :96-111
          var InvoiceOpen = rs.getBigDecimal(3);
          if (InvoiceOpen == null) InvoiceOpen = Env.ZERO;
          var DiscountAmt = rs.getBigDecimal(4);
          if (DiscountAmt == null) DiscountAmt = Env.ZERO;
          mTab.setValue('InvoiceAmt', InvoiceOpen);
          mTab.setValue('Amount', InvoiceOpen.subtract(DiscountAmt));
          mTab.setValue('DiscountAmt', DiscountAmt);
          Env.setContext(ctx, WindowNo, mTab.getTabNo(), 'C_Invoice_ID', String(C_Invoice_ID));    // :109 reset as dependent fields get reset
          mTab.setValue('C_Invoice_ID', C_Invoice_ID);
        }
      } catch (e) { return (e && e.message) || String(e); }
      return '';
    };

    // amounts :141-183
    CalloutPaymentAllocate.prototype.amounts = function (ctx, WindowNo, mTab, mField, value, oldValue) {
      if (this.isCalloutActive()) return '';
      var C_Invoice_ID = Env.getContextAsInt(ctx, WindowNo, mTab.getTabNo(), 'C_Invoice_ID');    // :147-149 No Invoice
      if (C_Invoice_ID === 0) return '';
      var Amount = mTab.getValue('Amount'); if (Amount == null) Amount = Env.ZERO;                 // :151-163
      var DiscountAmt = mTab.getValue('DiscountAmt'); if (DiscountAmt == null) DiscountAmt = Env.ZERO;
      var WriteOffAmt = mTab.getValue('WriteOffAmt'); if (WriteOffAmt == null) WriteOffAmt = Env.ZERO;
      var OverUnderAmt = mTab.getValue('OverUnderAmt'); if (OverUnderAmt == null) OverUnderAmt = Env.ZERO;
      var InvoiceAmt = mTab.getValue('InvoiceAmt');
      var colName = mField.getColumnName();                                                         // :169
      if (colName === 'Amount') {                                                                   // :171-175 PayAmt - calculate write off
        if (InvoiceAmt == null) throw new Error('java.lang.NullPointerException');
        OverUnderAmt = InvoiceAmt.subtract(Amount).subtract(DiscountAmt).subtract(WriteOffAmt);
        mTab.setValue('OverUnderAmt', OverUnderAmt);
      } else {                                                                                      // :176-180 calculate Amount
        if (InvoiceAmt == null) throw new Error('java.lang.NullPointerException');
        Amount = InvoiceAmt.subtract(DiscountAmt).subtract(WriteOffAmt).subtract(OverUnderAmt);
        mTab.setValue('Amount', Amount);
      }
      return '';
    };
    return CalloutPaymentAllocate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
