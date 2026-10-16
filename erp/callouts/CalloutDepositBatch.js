// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutDepositBatch.js — VERBATIM port of org.adempiere.base.callout/src/org/compiere/model/CalloutDepositBatch.java
// (prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE scenarios/cp/CalloutDepositBatch.json). Methods 1/1: bankAccount :30.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutDepositBatch', function (CalloutEngine, R) {
    function CalloutDepositBatch() { CalloutEngine.call(this); }
    CalloutDepositBatch.prototype = Object.create(CalloutEngine.prototype);
    // bankAccount :30-38
    CalloutDepositBatch.prototype.bankAccount = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      var C_BankAccount_ID = value;
      var ba = R.PO.get('C_BankAccount', C_BankAccount_ID);                                         // MBankAccount.get :35
      if (ba == null) throw new Error('java.lang.NullPointerException');
      mTab.setValue('C_Currency_ID', ba.getC_Currency_ID());                                        // :36
      return '';
    };
    return CalloutDepositBatch;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
