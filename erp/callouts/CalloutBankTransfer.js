// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutBankTransfer.js — VERBATIM port of org.adempiere.base.callout/src/org/adempiere/base/callout/CalloutBankTransfer.java
// (@Callout IColumnCallout on C_BankTransfer — prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE
// scenarios/cp/CalloutBankTransfer.json). Methods 11/11 (calloutMap :59-82): toAmt, conversionType, fromCurrency, toCurrency,
// fromTenderType, fromCharge, payDate, fromBankAccount, toBankAccount, rate, fromAmt.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  var R = A.RUNTIME, Env = R.Env, BD = R.BD, RM = R.RM;
  var NAME = 'org.adempiere.base.callout.CalloutBankTransfer';
  // Java `Integer != Integer` is a REFERENCE compare: equal only inside the Integer cache (-128..127). Ported as written.
  function refEq(a, b) { return a === b && a >= -128 && a <= 127; }
  function bool(v) { if (v == null) throw new Error('java.lang.NullPointerException'); return v === true || v === 'Y'; }
  function npe(v) { if (v == null) throw new Error('java.lang.NullPointerException'); return v; }

  function toAmt(ctx, windowNo, mTab, mField) {                                                       // :90-111
    var fromAmt_ = mTab.getValue('From_Amt'), toAmt_ = mTab.getValue('To_Amt');
    if (fromAmt_ == null || toAmt_ == null) return '';
    var From_C_Currency_ID = mTab.getValue('From_C_Currency_ID'), To_C_Currency_ID = mTab.getValue('To_C_Currency_ID');
    if (From_C_Currency_ID != null && From_C_Currency_ID > 0 && To_C_Currency_ID != null && To_C_Currency_ID > 0) {
      if (!refEq(From_C_Currency_ID, To_C_Currency_ID)) {
        if (bool(mTab.getValue('IsOverrideCurrencyRate'))) {
          if (fromAmt_.compareTo(BD.ZERO) !== 0) {
            var rate_ = toAmt_.divide(fromAmt_, 12, RM.HALF_UP);
            mTab.setValue('Rate', rate_);
          }
        }
      }
    }
    return '';
  }
  // conversionType :113-136 / fromCurrency :138-160 / toCurrency :162-184 share one body shape; ported per method
  function conversionType(ctx, windowNo, mTab, mField) {
    if (mField.getValue() != null && mTab.getValue('To_AD_Org_ID') != null && mTab.getValue('From_C_Currency_ID') != null) {
      var AD_Client_ID = mTab.getValue('AD_Client_ID'), AD_Org_ID = mTab.getValue('To_AD_Org_ID');
      var From_C_Currency_ID = mTab.getValue('From_C_Currency_ID');
      var amt = npe(mTab.getValue('From_Amt'));
      if (amt.signum() !== 0 && mTab.getValue('To_C_Currency_ID') != null && mTab.getValue('C_ConversionType_ID') != null && mTab.getValue('PayDate') != null) {
        if (!bool(mTab.getValue('IsOverrideCurrencyRate'))) {
          var payDate = mTab.getValue('PayDate'), To_C_Currency_ID = mTab.getValue('To_C_Currency_ID'), C_ConversionType_ID = mTab.getValue('C_ConversionType_ID');
          var rate_ = R.M.MConversionRate.getRate(From_C_Currency_ID, To_C_Currency_ID, payDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
          if (rate_ != null) { mTab.setValue('Rate', rate_); return fromAmt(ctx, windowNo, mTab, mField); }
        }
      }
    }
    return '';
  }
  function fromCurrency(ctx, windowNo, mTab, mField) {
    if (mField.getValue() != null && mTab.getValue('To_AD_Org_ID') != null) {
      var AD_Client_ID = mTab.getValue('AD_Client_ID'), AD_Org_ID = mTab.getValue('To_AD_Org_ID');
      var From_C_Currency_ID = mField.getValue();
      var amt = npe(mTab.getValue('From_Amt'));
      if (amt.signum() !== 0 && mTab.getValue('To_C_Currency_ID') != null && mTab.getValue('C_ConversionType_ID') != null && mTab.getValue('PayDate') != null) {
        if (!bool(mTab.getValue('IsOverrideCurrencyRate'))) {
          var payDate = mTab.getValue('PayDate'), To_C_Currency_ID = mTab.getValue('To_C_Currency_ID'), C_ConversionType_ID = mTab.getValue('C_ConversionType_ID');
          var rate_ = R.M.MConversionRate.getRate(From_C_Currency_ID, To_C_Currency_ID, payDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
          if (rate_ != null) { mTab.setValue('Rate', rate_); return fromAmt(ctx, windowNo, mTab, mField); }
        }
      }
    }
    return '';
  }
  function toCurrency(ctx, windowNo, mTab, mField) {
    if (mField.getValue() != null && mTab.getValue('To_AD_Org_ID') != null) {
      var AD_Client_ID = mTab.getValue('AD_Client_ID'), AD_Org_ID = mTab.getValue('To_AD_Org_ID');
      var To_C_Currency_ID = mField.getValue();
      var amt = npe(mTab.getValue('From_Amt'));
      if (amt.signum() !== 0 && mTab.getValue('From_C_Currency_ID') != null && mTab.getValue('C_ConversionType_ID') != null && mTab.getValue('PayDate') != null) {
        if (!bool(mTab.getValue('IsOverrideCurrencyRate'))) {
          var payDate = mTab.getValue('PayDate'), From_C_Currency_ID = mTab.getValue('From_C_Currency_ID'), C_ConversionType_ID = mTab.getValue('C_ConversionType_ID');
          var rate_ = R.M.MConversionRate.getRate(From_C_Currency_ID, To_C_Currency_ID, payDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
          if (rate_ != null) { mTab.setValue('Rate', rate_); return fromAmt(ctx, windowNo, mTab, mField); }
        }
      }
    }
    return '';
  }
  function fromTenderType(ctx, windowNo, mTab, mField) { mTab.setValue('To_TenderType', mField.getValue()); return ''; }   // :186-189
  function fromCharge(ctx, windowNo, mTab, mField) { mTab.setValue('To_C_Charge_ID', mField.getValue()); return ''; }      // :191-194
  function payDate(ctx, windowNo, mTab, mField) { mTab.setValue('DateAcct', mField.getValue()); return ''; }               // :196-199
  function fromBankAccount(ctx, windowNo, mTab, mField, value) {                                      // :201-240
    var From_C_BankAccount_ID = value;
    if (From_C_BankAccount_ID == null || From_C_BankAccount_ID === 0) return '';
    var ba = npe(R.PO.get('C_BankAccount', From_C_BankAccount_ID));
    var AD_Org_ID = ba.getAD_Org_ID() || 0;
    if (AD_Org_ID > 0) mTab.setValue('From_AD_Org_ID', AD_Org_ID);
    else { AD_Org_ID = Env.getAD_Org_ID(ctx); if (AD_Org_ID > 0) mTab.setValue('From_AD_Org_ID', AD_Org_ID); }
    if ((ba.getC_Currency_ID() || 0) > 0) mTab.setValue('From_C_Currency_ID', ba.getC_Currency_ID());
    var C_BPartner_ID = 0;
    if (AD_Org_ID > 0) C_BPartner_ID = R.DB.getSQLValue(null, "SELECT bp.C_BPartner_ID FROM C_BPartner bp WHERE bp.AD_OrgBP_ID = ? AND bp.IsActive = 'Y' ", AD_Org_ID);
    if (C_BPartner_ID > 0) mTab.setValue('From_C_BPartner_ID', C_BPartner_ID);
    else mTab.setValue('From_C_BPartner_ID', null);
    return '';
  }
  function toBankAccount(ctx, windowNo, mTab, mField, value) {                                        // :242-312
    var To_C_BankAccount_ID = value;
    if (To_C_BankAccount_ID == null || To_C_BankAccount_ID === 0) return '';
    var ba = npe(R.PO.get('C_BankAccount', To_C_BankAccount_ID));
    var AD_Org_ID = ba.getAD_Org_ID() || 0;
    if (AD_Org_ID > 0) mTab.setValue('To_AD_Org_ID', ba.getAD_Org_ID());
    else { AD_Org_ID = Env.getAD_Org_ID(ctx); if (AD_Org_ID > 0) mTab.setValue('To_AD_Org_ID', AD_Org_ID); }
    if ((ba.getC_Currency_ID() || 0) > 0) mTab.setValue('To_C_Currency_ID', ba.getC_Currency_ID());
    var C_BPartner_ID = 0;
    if (AD_Org_ID > 0) C_BPartner_ID = R.DB.getSQLValue(null, "SELECT bp.C_BPartner_ID FROM C_BPartner bp WHERE bp.AD_OrgBP_ID = ? AND bp.IsActive = 'Y' ", AD_Org_ID);
    if (C_BPartner_ID > 0) mTab.setValue('To_C_BPartner_ID', C_BPartner_ID);
    else {
      if (mTab.getValue('From_AD_Org_ID') != null && AD_Org_ID === mTab.getValue('From_AD_Org_ID') &&
        mTab.getValue('From_C_BPartner_ID') != null && mTab.getValue('From_C_BPartner_ID') > 0)
        mTab.setValue('To_C_BPartner_ID', mTab.getValue('From_C_BPartner_ID'));
      else mTab.setValue('To_C_BPartner_ID', null);
    }
    var From_C_Currency_ID = mTab.getValue('From_C_Currency_ID'), To_C_Currency_ID = mTab.getValue('To_C_Currency_ID');   // :290-309
    var PayDate = mTab.getValue('PayDate'), AD_Client_ID = mTab.getValue('AD_Client_ID');
    if (From_C_Currency_ID != null && From_C_Currency_ID > 0 && To_C_Currency_ID != null && To_C_Currency_ID > 0) {
      if (refEq(From_C_Currency_ID, To_C_Currency_ID)) {
        mTab.setValue('Rate', BD.ONE);
        return fromAmt(ctx, windowNo, mTab, mField);
      } else {
        if (PayDate != null && AD_Client_ID != null && mTab.getValue('C_ConversionType_ID') != null) {
          var C_ConversionType_ID = mTab.getValue('C_ConversionType_ID');
          var rate_ = R.M.MConversionRate.getRate(From_C_Currency_ID, To_C_Currency_ID, PayDate, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
          if (rate_ != null) { mTab.setValue('Rate', rate_); return fromAmt(ctx, windowNo, mTab, mField); }
        }
      }
    }
    return '';
  }
  function rate(ctx, windowNo, mTab, mField, value) {                                                 // :314-335
    var fromAmt_ = mTab.getValue('From_Amt');
    if (fromAmt_ == null) return '';
    var From_C_Currency_ID = mTab.getValue('From_C_Currency_ID'), To_C_Currency_ID = mTab.getValue('To_C_Currency_ID');
    if (From_C_Currency_ID != null && From_C_Currency_ID > 0 && To_C_Currency_ID != null && To_C_Currency_ID > 0) {
      if (refEq(From_C_Currency_ID, To_C_Currency_ID)) { mTab.setValue('Rate', BD.ONE); return fromAmt(ctx, windowNo, mTab, mField); }
      else { if (fromAmt_.signum() !== 0) return fromAmt(ctx, windowNo, mTab, mField); }
    }
    return '';
  }
  function fromAmt(ctx, WindowNo, mTab, mField) {                                                     // :345-363
    var rate_ = mTab.getValue('Rate'), fromAmt_ = mTab.getValue('From_Amt');
    if (fromAmt_ == null || rate_ == null) return '';
    var toAmt_ = rate_.multiply(fromAmt_);
    var To_C_Currency_ID = mTab.getValue('To_C_Currency_ID');
    if (To_C_Currency_ID != null && To_C_Currency_ID > 0) {
      var cur = R.PO.get('C_Currency', To_C_Currency_ID);                                             // MCurrency.get
      if (cur != null) toAmt_ = toAmt_.setScale(cur.getStdPrecision(), RM.HALF_UP);
    }
    mTab.setValue('To_Amt', toAmt_);
    return '';
  }
  var MAP = {                                                                                         // calloutMap :59-82
    From_C_BankAccount_ID: function (c, w, t, f, v) { return fromBankAccount(c, w, t, f, v); },
    To_C_BankAccount_ID: function (c, w, t, f, v) { return toBankAccount(c, w, t, f, v); },
    From_Amt: function (c, w, t, f) { return fromAmt(c, w, t, f); },
    PayDate: function (c, w, t, f) { return payDate(c, w, t, f); },
    From_C_Charge_ID: function (c, w, t, f) { return fromCharge(c, w, t, f); },
    From_TenderType: function (c, w, t, f) { return fromTenderType(c, w, t, f); },
    From_C_Currency_ID: function (c, w, t, f) { return fromCurrency(c, w, t, f); },
    To_C_Currency_ID: function (c, w, t, f) { return toCurrency(c, w, t, f); },
    Rate: function (c, w, t, f, v) { return rate(c, w, t, f, v); },
    C_ConversionType_ID: function (c, w, t, f) { return conversionType(c, w, t, f); },
    To_Amt: function (c, w, t, f) { return toAmt(c, w, t, f); }
  };
  A.defineColumnCallout('C_BankTransfer', Object.keys(MAP), NAME, function start(ctx, windowNo, mTab, mField, value, oldValue) {   // :84-88
    var callout = MAP[mField.getColumnName()];
    return callout != null ? callout(ctx, windowNo, mTab, mField, value, oldValue) : '';
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
