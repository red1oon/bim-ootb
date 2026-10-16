// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutCashJournal.js — VERBATIM port of org.adempiere.base.callout/src/org/compiere/model/CalloutCashJournal.java
// (prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE scenarios/cp/CalloutCashJournal.json). Methods 2/2: invoice :49, amounts :128.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutCashJournal', function (CalloutEngine, R) {
    var Env = R.Env, Timestamp = R.Timestamp;
    function CalloutCashJournal() { CalloutEngine.call(this); }
    CalloutCashJournal.prototype = Object.create(CalloutEngine.prototype);
    function npe(v) { if (v == null) throw new Error('java.lang.NullPointerException'); return v; }

    // invoice :49-114
    CalloutCashJournal.prototype.invoice = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive()) return '';
      var C_Invoice_ID = value;                                                                     // :54-59
      if (C_Invoice_ID == null || C_Invoice_ID === 0) { mTab.setValue('C_Currency_ID', null); return ''; }
      var C_InvoicePaySchedule_ID = 0;                                                              // :61-64
      if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_Invoice_ID') === C_Invoice_ID
        && Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID') !== 0)
        C_InvoicePaySchedule_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID');
      var ts = Env.getContextAsDate(ctx, WindowNo, 'DateAcct');                                     // :67-69 from C_Cash
      if (ts == null) ts = new Timestamp(R.now());
      var sql = 'SELECT C_BPartner_ID, C_Currency_ID,invoiceOpen(C_Invoice_ID, ?), IsSOTrx, invoiceDiscount(C_Invoice_ID,?,?) ' +
        'FROM C_Invoice WHERE C_Invoice_ID=?';                                                      // :71-74
      try {
        var pstmt = R.DB.prepareStatement(sql);
        pstmt.setInt(1, C_InvoicePaySchedule_ID); pstmt.setTimestamp(2, ts); pstmt.setInt(3, C_InvoicePaySchedule_ID); pstmt.setInt(4, C_Invoice_ID);
        var rs = pstmt.executeQuery();
        if (rs.next()) {                                                                            // :85-101
          mTab.setValue('C_Currency_ID', rs.getInt(2));
          var PayAmt = rs.getBigDecimal(3);
          var DiscountAmt = rs.getBigDecimal(5);
          var isSOTrx = 'Y' === rs.getString(4);
          if (!isSOTrx) { PayAmt = npe(PayAmt).negate(); DiscountAmt = npe(DiscountAmt).negate(); }
          mTab.setValue('Amount', npe(PayAmt).subtract(npe(DiscountAmt)));
          mTab.setValue('DiscountAmt', DiscountAmt);
          mTab.setValue('WriteOffAmt', Env.ZERO);
          Env.setContext(ctx, WindowNo, 'InvTotalAmt', PayAmt.toString());
        }
      } catch (e) { return (e && e.message) || String(e); }                                        // :103-107
      return '';
    };

    // amounts :128-159
    CalloutCashJournal.prototype.amounts = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive() || 'I' !== mTab.getValue('CashType')) return '';                  // :131-132 Needs to be Invoice
      var total = Env.getContext(ctx, WindowNo, 'InvTotalAmt');                                     // :134-137
      if (total == null || total.length === 0) return '';
      var InvTotalAmt = R.BD.fromString(total);
      var PayAmt = mTab.getValue('Amount');                                                         // :139-142
      var DiscountAmt = mTab.getValue('DiscountAmt');
      var WriteOffAmt = mTab.getValue('WriteOffAmt');
      var colName = mField.getColumnName();
      if (colName === 'Amount') {                                                                   // :147-151 Amount - calculate write off
        WriteOffAmt = InvTotalAmt.subtract(npe(PayAmt)).subtract(npe(DiscountAmt));
        mTab.setValue('WriteOffAmt', WriteOffAmt);
      } else {                                                                                      // :152-156 calculate PayAmt
        PayAmt = InvTotalAmt.subtract(npe(DiscountAmt)).subtract(npe(WriteOffAmt));
        mTab.setValue('Amount', PayAmt);
      }
      return '';
    };
    return CalloutCashJournal;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
