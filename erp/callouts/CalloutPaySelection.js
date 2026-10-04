// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutPaySelection.js — VERBATIM port of org.adempiere.base.callout/src/org/compiere/model/CalloutPaySelection.java
// (prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE scenarios/cp/CalloutPaySelection.json). Methods 2/2: payAmt :54, invoice :90.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutPaySelection', function (CalloutEngine, R) {
    var Env = R.Env, Timestamp = R.Timestamp;
    function CalloutPaySelection() { CalloutEngine.call(this); }
    CalloutPaySelection.prototype = Object.create(CalloutEngine.prototype);
    function npe(v) { if (v == null) throw new Error('java.lang.NullPointerException'); return v; }

    // payAmt :54-77
    CalloutPaySelection.prototype.payAmt = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var ii = mTab.getValue('C_Invoice_ID');                                                       // :59-64 get invoice info
      if (ii == null) return '';
      var C_Invoice_ID = ii;
      if (C_Invoice_ID === 0) return '';
      var OpenAmt = mTab.getValue('OpenAmt');                                                       // :66-70
      var PayAmt = mTab.getValue('PayAmt');
      var DiscountAmt = mTab.getValue('DiscountAmt');
      var WriteOffAmt = mTab.getValue('WriteOffAmt');
      var DifferenceAmt = npe(OpenAmt).subtract(npe(PayAmt)).subtract(npe(DiscountAmt)).subtract(npe(WriteOffAmt));
      mTab.setValue('DifferenceAmt', DifferenceAmt);                                                // :74
      return '';
    };

    // invoice :90-148
    CalloutPaySelection.prototype.invoice = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || value == null) return '';
      var C_Invoice_ID = value;                                                                     // :95-97
      if (C_Invoice_ID === 0) return '';
      var C_BankAccount_ID = Env.getContextAsInt(ctx, WindowNo, 'C_BankAccount_ID');
      var PayDate = Env.getContextAsDate(ctx, WindowNo, 'PayDate');                                 // :99-102
      if (PayDate == null) PayDate = new Timestamp(R.now());
      var OpenAmt = Env.ZERO, DiscountAmt = Env.ZERO, IsSOTrx = false;                             // :104-106
      if (R.M.ensureView) R.M.ensureView('C_Invoice_v');                                            // bundle carries no DB views (callouts/views.js)
      var sql = 'SELECT currencyConvertInvoice(i.C_Invoice_ID, ba.C_Currency_ID, invoiceOpen(i.C_Invoice_ID, 0), i.DateInvoiced),' +
        ' currencyConvert(paymentTermDiscount(i.GrandTotal,i.C_Currency_ID,i.C_PaymentTerm_ID,i.DateInvoiced, ?)' +
        ', i.C_Currency_ID, ba.C_Currency_ID, i.DateInvoiced, i.C_ConversionType_ID, i.AD_Client_ID, i.AD_Org_ID)' +
        ', i.IsSOTrx FROM C_Invoice_v i, C_BankAccount ba WHERE i.C_Invoice_ID=? AND ba.C_BankAccount_ID=?';   // :107-115
      try {
        var pstmt = R.DB.prepareStatement(sql);
        pstmt.setInt(2, C_Invoice_ID); pstmt.setInt(3, C_BankAccount_ID); pstmt.setTimestamp(1, PayDate);
        var rs = pstmt.executeQuery();
        if (rs.next()) {                                                                            // :125-130
          OpenAmt = rs.getBigDecimal(1);
          DiscountAmt = rs.getBigDecimal(2);
          IsSOTrx = 'Y' === rs.getString(3);
        }
      } catch (e) {                                                                                 // :132-135 SQLException is logged, not returned
        R.unportedDep('CalloutPaySelection.invoice', 'SQL ' + ((e && e.message) || e));
      }
      mTab.setValue('OpenAmt', OpenAmt);                                                            // :142-146
      mTab.setValue('PayAmt', npe(OpenAmt).subtract(npe(DiscountAmt)));
      mTab.setValue('DiscountAmt', DiscountAmt);
      mTab.setValue('DifferenceAmt', Env.ZERO);
      mTab.setValue('IsSOTrx', IsSOTrx);
      return '';
    };
    return CalloutPaySelection;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
