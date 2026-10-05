// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutPayment.js — VERBATIM port of org.adempiere.base.callout/src/org/compiere/model/CalloutPayment.java
// (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE scenarios/cp/CalloutPayment.json).
// Methods 5/5: invoice :57, order :142, charge :211, docType :239, amounts :292.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutPayment', function (CalloutEngine, R) {
    var Env = R.Env, BD = R.BD, RM = R.RM, Msg = R.Msg, Timestamp = R.Timestamp;
    function CalloutPayment() { CalloutEngine.call(this); }
    CalloutPayment.prototype = Object.create(CalloutEngine.prototype);
    function fireDataStatusEEvent(mTab, msg, info, isError) {        // GridTab.fireDataStatusEEvent — a UI status event, no field
      if (typeof mTab.fireDataStatusEEvent === 'function') mTab.fireDataStatusEEvent(msg, info, isError);
      else R.log('§CALLOUT-STATUS ' + msg + ' ' + info);
    }
    function M() { return R.M; }

    // invoice :57-129
    CalloutPayment.prototype.invoice = function (ctx, WindowNo, mTab, mField, value) {
      var C_Invoice_ID = value;
      if (this.isCalloutActive() || C_Invoice_ID == null || C_Invoice_ID === 0) return '';        // :61-63
      mTab.setValue('C_Order_ID', null);                                                            // :64-70
      mTab.setValue('C_Charge_ID', null);
      mTab.setValue('IsPrepayment', false);
      mTab.setValue('DiscountAmt', Env.ZERO);
      mTab.setValue('WriteOffAmt', Env.ZERO);
      mTab.setValue('OverUnderAmt', Env.ZERO);
      var C_InvoicePaySchedule_ID = 0;                                                              // :71-76
      if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_Invoice_ID') === C_Invoice_ID
        && Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID') !== 0)
        C_InvoicePaySchedule_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID');
      var ts = mTab.getValue('DateTrx');                                                            // :78-80
      if (ts == null) ts = new Timestamp(R.now());
      var sql = 'SELECT C_BPartner_ID,C_Currency_ID, invoiceOpen(C_Invoice_ID, ?), invoiceDiscount(C_Invoice_ID,?,?), IsSOTrx ' +
        'FROM C_Invoice WHERE C_Invoice_ID=?';                                                      // :82-85
      try {
        var pstmt = R.DB.prepareStatement(sql);
        pstmt.setInt(1, C_InvoicePaySchedule_ID); pstmt.setTimestamp(2, ts); pstmt.setInt(3, C_InvoicePaySchedule_ID); pstmt.setInt(4, C_Invoice_ID);
        var rs = pstmt.executeQuery();
        if (rs.next()) {                                                                            // :96-116
          mTab.setValue('C_BPartner_ID', rs.getInt(1));
          var C_Currency_ID = rs.getInt(2);
          mTab.setValue('C_Currency_ID', C_Currency_ID);
          var InvoiceOpen = rs.getBigDecimal(3);
          if (InvoiceOpen == null) InvoiceOpen = Env.ZERO;
          var DiscountAmt = rs.getBigDecimal(4);
          if (DiscountAmt == null) DiscountAmt = Env.ZERO;
          mTab.setValue('PayAmt', InvoiceOpen.subtract(DiscountAmt));
          mTab.setValue('DiscountAmt', DiscountAmt);
          Env.setContext(ctx, WindowNo, 'C_Invoice_ID', String(C_Invoice_ID));                     // :113 reset as dependent fields get reset
          mTab.setValue('C_Invoice_ID', C_Invoice_ID);
        }
      } catch (e) { return (e && e.message) || String(e); }                                        // :118-122
      return this.docType(ctx, WindowNo, mTab, mField, value);                                      // :128
    };

    // order :142-196
    CalloutPayment.prototype.order = function (ctx, WindowNo, mTab, mField, value) {
      var C_Order_ID = value;
      if (this.isCalloutActive() || C_Order_ID == null || C_Order_ID === 0) return '';            // :146-148
      mTab.setValue('C_Invoice_ID', null);                                                          // :149-156
      mTab.setValue('C_Charge_ID', null);
      mTab.setValue('IsPrepayment', true);
      mTab.setValue('DiscountAmt', Env.ZERO);
      mTab.setValue('WriteOffAmt', Env.ZERO);
      mTab.setValue('IsOverUnderPayment', false);
      mTab.setValue('OverUnderAmt', Env.ZERO);
      var ts = mTab.getValue('DateTrx');                                                            // :158-160 (read, unused, as in Java)
      if (ts == null) ts = new Timestamp(R.now());
      var sql = 'SELECT COALESCE(Bill_BPartner_ID, C_BPartner_ID) as C_BPartner_ID , C_Currency_ID , GrandTotal FROM C_Order WHERE C_Order_ID=?';  // :162-165
      try {
        var pstmt = R.DB.prepareStatement(sql); pstmt.setInt(1, C_Order_ID);
        var rs = pstmt.executeQuery();
        if (rs.next()) {                                                                            // :173-184
          mTab.setValue('C_BPartner_ID', rs.getInt(1));
          var C_Currency_ID = rs.getInt(2);
          mTab.setValue('C_Currency_ID', C_Currency_ID);
          var GrandTotal = rs.getBigDecimal(3);
          if (GrandTotal == null) GrandTotal = Env.ZERO;
          mTab.setValue('PayAmt', GrandTotal);
        }
      } catch (e) { return (e && e.message) || String(e); }
      return this.docType(ctx, WindowNo, mTab, mField, value);                                      // :195
    };

    // charge :211-227
    CalloutPayment.prototype.charge = function (ctx, WindowNo, mTab, mField, value) {
      var C_Charge_ID = value;
      if (this.isCalloutActive() || C_Charge_ID == null || C_Charge_ID === 0) return '';
      mTab.setValue('C_Invoice_ID', null);
      mTab.setValue('C_Order_ID', null);
      mTab.setValue('IsPrepayment', false);
      mTab.setValue('DiscountAmt', Env.ZERO);
      mTab.setValue('WriteOffAmt', Env.ZERO);
      mTab.setValue('IsOverUnderPayment', false);
      mTab.setValue('OverUnderAmt', Env.ZERO);
      return '';
    };

    // docType :239-277
    CalloutPayment.prototype.docType = function (ctx, WindowNo, mTab, mField, value) {
      var C_Invoice_ID = Env.getContextAsInt(ctx, WindowNo, 'C_Invoice_ID');
      var C_Order_ID = Env.getContextAsInt(ctx, WindowNo, 'C_Order_ID');
      var C_DocType_ID = Env.getContextAsInt(ctx, WindowNo, 'C_DocType_ID');
      var dt = null;
      if (C_DocType_ID !== 0) {                                                                     // :248-253
        dt = R.PO.get('C_DocType', C_DocType_ID);
        Env.setContext(ctx, WindowNo, 'IsSOTrx', dt.isSOTrx() ? 'Y' : 'N');
        mTab.setValue('IsReceipt', dt.isSOTrx() ? 'Y' : 'N');
      }
      if (C_Invoice_ID !== 0) {                                                                     // :255-263
        var inv = R.PO.get('C_Invoice', C_Invoice_ID);
        if (dt != null) { if ((inv ? inv.isSOTrx() : false) !== dt.isSOTrx()) return 'PaymentDocTypeInvoiceInconsistent'; }
      }
      if (C_Order_ID !== 0) {                                                                       // :267-275
        var ord = R.PO.get('C_Order', C_Order_ID);
        if (dt != null) { if ((ord ? ord.isSOTrx() : false) !== dt.isSOTrx()) return 'PaymentDocTypeInvoiceInconsistent'; }
      }
      return '';
    };

    // amounts :292-618
    CalloutPayment.prototype.amounts = function (ctx, WindowNo, mTab, mField, value, oldValue) {
      if (this.isCalloutActive()) return '';                                                        // :295-296
      var C_Invoice_ID = Env.getContextAsInt(ctx, WindowNo, 'C_Invoice_ID');
      var colName = mField.getColumnName();                                                         // :299-304
      if (colName === 'IsOverUnderPayment' || 'Y' !== Env.getContext(ctx, WindowNo, 'IsOverUnderPayment'))
        mTab.setValue('OverUnderAmt', Env.ZERO);
      var C_InvoicePaySchedule_ID = 0;                                                              // :305-310
      if (Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_Invoice_ID') === C_Invoice_ID
        && Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID') !== 0)
        C_InvoicePaySchedule_ID = Env.getContextAsInt(ctx, WindowNo, Env.TAB_INFO, 'C_InvoicePaySchedule_ID');
      var curr_int = mTab.getValue('C_Currency_ID');                                                // :313-317
      if (curr_int == null) curr_int = 0;
      var C_Currency_ID = curr_int;
      var currency = R.PO.get('C_Currency', C_Currency_ID);
      var C_ConversionType_ID = 0;                                                                  // :318-321
      var ii = mTab.getValue('C_ConversionType_ID');
      if (ii != null) C_ConversionType_ID = ii;
      var AD_Client_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Client_ID');
      var AD_Org_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Org_ID');
      var overrideCR = (colName === 'IsOverrideCurrencyRate' ? value : mTab.getValue('IsOverrideCurrencyRate'));   // :325-327
      if (overrideCR == null) overrideCR = false;

      if (colName === 'CurrencyRate') {                                                             // :329-362
        if (value != null) {
          var baseCurrencyRate = value;
          if (baseCurrencyRate.signum() < 0) {
            mTab.setValue(colName, oldValue);
            fireDataStatusEEvent(mTab, 'Invalid', Msg.getElement(ctx, colName), true);
            return '';
          } else if (baseCurrencyRate.signum() === 0) {
            var baseCurrencyId = Env.getContextAsInt(ctx, Env.C_CURRENCY_ID);
            var dateAcct = mTab.getValue('DateAcct');
            baseCurrencyRate = M().MConversionRate.getRate(C_Currency_ID, baseCurrencyId, dateAcct, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
            if (baseCurrencyRate == null) return '';
            mTab.setValue('CurrencyRate', baseCurrencyRate);
          }
          var payAmt = mTab.getValue('PayAmt');
          if (payAmt != null) {
            var convertedAmt = payAmt.multiply(baseCurrencyRate);
            mTab.setValue('ConvertedAmt', convertedAmt);
          }
          return '';
        } else {
          mTab.setValue(colName, oldValue);
          return '';
        }
      } else if (colName === 'ConvertedAmt') {                                                      // :363-392
        if (value != null) {
          var convertedAmt2 = value;
          if (convertedAmt2.signum() === 0) {
            mTab.setValue(colName, oldValue);
            fireDataStatusEEvent(mTab, 'Invalid', Msg.getElement(ctx, colName), true);
            return '';
          }
          var payAmt2 = mTab.getValue('PayAmt');
          if (payAmt2 != null && payAmt2.signum() !== 0) {
            var bcr = convertedAmt2.divide(payAmt2, 12, RM.HALF_UP);
            mTab.setValue('CurrencyRate', bcr);
          } else {
            mTab.setValue('CurrencyRate', null);                                                    // divide by zero
          }
          return '';
        } else {
          mTab.setValue(colName, oldValue);
          return '';
        }
      }
      // Get Open Amount & Invoice Currency :394-435
      var InvoiceOpenAmt = Env.ZERO;
      var C_Currency_Invoice_ID = 0;
      if (C_Invoice_ID !== 0) {
        var ts = mTab.getValue('DateTrx');
        if (ts == null) ts = new Timestamp(R.now());
        var sql = 'SELECT C_BPartner_ID,C_Currency_ID, invoiceOpen(C_Invoice_ID,?), invoiceDiscount(C_Invoice_ID,?,?), IsSOTrx ' +
          'FROM C_Invoice WHERE C_Invoice_ID=?';
        try {
          var pstmt = R.DB.prepareStatement(sql);
          pstmt.setInt(1, C_InvoicePaySchedule_ID); pstmt.setTimestamp(2, ts); pstmt.setInt(3, C_InvoicePaySchedule_ID); pstmt.setInt(4, C_Invoice_ID);
          var rs = pstmt.executeQuery();
          if (rs.next()) {
            C_Currency_Invoice_ID = rs.getInt(2);
            InvoiceOpenAmt = rs.getBigDecimal(3);
            if (InvoiceOpenAmt == null) InvoiceOpenAmt = Env.ZERO;
          }
        } catch (e) { return (e && e.message) || String(e); }
      }
      // Get Info from Tab :439-450
      var PayAmt = mTab.getValue('PayAmt'); if (PayAmt == null) PayAmt = Env.ZERO;
      var DiscountAmt = mTab.getValue('DiscountAmt'); if (DiscountAmt == null) DiscountAmt = Env.ZERO;
      var WriteOffAmt = mTab.getValue('WriteOffAmt'); if (WriteOffAmt == null) WriteOffAmt = Env.ZERO;
      var OverUnderAmt = mTab.getValue('OverUnderAmt'); if (OverUnderAmt == null) OverUnderAmt = Env.ZERO;

      var ConvDate = mTab.getValue('DateTrx');                                                      // :454
      var CurrencyRate = Env.ONE;                                                                   // :456-478
      if ((C_Currency_ID > 0 && C_Currency_Invoice_ID > 0 && C_Currency_ID !== C_Currency_Invoice_ID)
        || colName === 'C_Currency_ID' || colName === 'C_ConversionType_ID') {
        CurrencyRate = M().MConversionRate.getRate(C_Currency_Invoice_ID, C_Currency_ID, ConvDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
        if (CurrencyRate == null || CurrencyRate.compareTo(Env.ZERO) === 0) {
          if (C_Currency_Invoice_ID === 0) return '';                                               // no error message when no invoice is selected
          return 'NoCurrencyConversion';
        }
        InvoiceOpenAmt = InvoiceOpenAmt.multiply(CurrencyRate).setScale(currency.getStdPrecision(), RM.HALF_UP);
      }
      if (colName === 'C_Currency_ID') {                                                            // :480-520 Currency Changed - convert all
        if (oldValue != null && typeof oldValue === 'number' && Number.isInteger(oldValue)) {
          var conversionRate = null;
          var oldId = oldValue;
          if (oldId > 0 && oldId === C_Currency_Invoice_ID) {
            conversionRate = CurrencyRate;
          } else if (oldId > 0) {
            conversionRate = M().MConversionRate.getRate(oldId, C_Currency_ID, ConvDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
            if (conversionRate == null) {
              conversionRate = M().MConversionRate.getRate(C_Currency_ID, oldId, ConvDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
              if (conversionRate != null) conversionRate = BD.fromString('1').divide(conversionRate, 12, RM.HALF_UP);
            }
          }
          if (conversionRate != null) {
            PayAmt = PayAmt.multiply(conversionRate).setScale(currency.getStdPrecision(), RM.HALF_UP);
            mTab.setValue('PayAmt', PayAmt);
            DiscountAmt = DiscountAmt.multiply(conversionRate).setScale(currency.getStdPrecision(), RM.HALF_UP);
            mTab.setValue('DiscountAmt', DiscountAmt);
            WriteOffAmt = WriteOffAmt.multiply(conversionRate).setScale(currency.getStdPrecision(), RM.HALF_UP);
            mTab.setValue('WriteOffAmt', WriteOffAmt);
            OverUnderAmt = OverUnderAmt.multiply(conversionRate).setScale(currency.getStdPrecision(), RM.HALF_UP);
            mTab.setValue('OverUnderAmt', OverUnderAmt);
          }
        }
      } else if (C_Invoice_ID === 0) {                                                              // :522-530 No Invoice
        if (Env.ZERO.compareTo(DiscountAmt) !== 0) mTab.setValue('DiscountAmt', Env.ZERO);
        if (Env.ZERO.compareTo(WriteOffAmt) !== 0) mTab.setValue('WriteOffAmt', Env.ZERO);
        if (Env.ZERO.compareTo(OverUnderAmt) !== 0) mTab.setValue('OverUnderAmt', Env.ZERO);
      } else {
        var processed = mTab.getValueAsBoolean('Processed');                                        // :531
        if (colName === 'PayAmt' && !processed && 'Y' === Env.getContext(ctx, WindowNo, 'IsOverUnderPayment')) {   // :532-543
          OverUnderAmt = InvoiceOpenAmt.subtract(PayAmt).subtract(DiscountAmt).subtract(WriteOffAmt);
          if (OverUnderAmt.signum() > 0) {                                                          // no discount because is not paid in full
            DiscountAmt = Env.ZERO;
            mTab.setValue('DiscountAmt', DiscountAmt);
            OverUnderAmt = InvoiceOpenAmt.subtract(PayAmt).subtract(DiscountAmt).subtract(WriteOffAmt);
          }
          mTab.setValue('OverUnderAmt', OverUnderAmt);
        } else if (colName === 'PayAmt' && !processed) {                                            // :544-550
          WriteOffAmt = InvoiceOpenAmt.subtract(PayAmt).subtract(DiscountAmt).subtract(OverUnderAmt);
          mTab.setValue('WriteOffAmt', WriteOffAmt);
        } else if (colName === 'IsOverUnderPayment' && !processed) {                                // :551-568
          var overUnderPaymentActive = 'Y' === Env.getContext(ctx, WindowNo, 'IsOverUnderPayment');
          if (overUnderPaymentActive) {
            OverUnderAmt = InvoiceOpenAmt.subtract(PayAmt).subtract(DiscountAmt);
            mTab.setValue('WriteOffAmt', Env.ZERO);
            mTab.setValue('OverUnderAmt', OverUnderAmt);
          } else {
            WriteOffAmt = InvoiceOpenAmt.subtract(PayAmt).subtract(DiscountAmt);
            mTab.setValue('WriteOffAmt', WriteOffAmt);
            mTab.setValue('OverUnderAmt', Env.ZERO);
          }
        } else if (!processed) {                                                                    // :574-581 calculate PayAmt
          PayAmt = InvoiceOpenAmt.subtract(DiscountAmt).subtract(WriteOffAmt).subtract(OverUnderAmt);
          mTab.setValue('PayAmt', PayAmt);
        }
      }
      if (colName === 'C_Currency_ID' || colName === 'PayAmt' || colName === 'IsOverrideCurrencyRate') {   // :584-616
        var baseCurrencyId2 = Env.getContextAsInt(ctx, Env.C_CURRENCY_ID);
        if (baseCurrencyId2 === C_Currency_ID) {
          mTab.setValue('IsOverrideCurrencyRate', false);
          mTab.setValue('CurrencyRate', null);
          mTab.setValue('ConvertedAmt', null);
        } else if (!overrideCR) {
          mTab.setValue('CurrencyRate', null);
          mTab.setValue('ConvertedAmt', null);
        } else {
          var payAmt3 = colName === 'PayAmt' ? value : mTab.getValue('PayAmt');
          if (payAmt3 == null) return '';
          if (colName === 'PayAmt') {
            var baseConversionRate = mTab.getValue('CurrencyRate');
            var converted = mTab.getValue('ConvertedAmt');
            if (baseConversionRate == null) {
              if (converted != null) {
                baseConversionRate = converted.divide(payAmt3, 12, RM.HALF_UP);
                mTab.setValue('CurrencyRate', baseConversionRate);
              }
              return '';
            }
            converted = payAmt3.multiply(baseConversionRate);
            var stdPrecision = R.PO.get('C_Currency', baseCurrencyId2).getStdPrecision();             // MCurrency.getStdPrecision(ctx, id)
            if (converted.scale() > stdPrecision) converted = converted.setScale(stdPrecision, RM.HALF_UP);
            mTab.setValue('ConvertedAmt', converted);
          }
        }
      }
      return '';
    };
    return CalloutPayment;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
