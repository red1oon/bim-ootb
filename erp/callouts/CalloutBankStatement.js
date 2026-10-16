// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutBankStatement.js — VERBATIM port of org.adempiere.base.callout/src/org/compiere/model/CalloutBankStatement.java
// (prompts/ERP_IDEMPIERE_UX_PARITY.md §CP — Witness: W-CP-CALLOUT-ORACLE scenarios/cp/CalloutBankStatement.json).
// Methods 4/4: bankAccount :48, amount :70, payment :116, paymentIntoBatch :167.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutBankStatement', function (CalloutEngine, R) {
    var Env = R.Env;
    function CalloutBankStatement() { CalloutEngine.call(this); }
    CalloutBankStatement.prototype = Object.create(CalloutEngine.prototype);

    // bankAccount :48-57 — MBankAccount.get + load(trx) → the row as stored now
    CalloutBankStatement.prototype.bankAccount = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      var C_BankAccount_ID = value;
      var ba = R.PO.get('C_BankAccount', C_BankAccount_ID);
      if (ba == null) throw new Error('java.lang.NullPointerException');
      mTab.setValue('BeginningBalance', ba.getCurrentBalance());                                    // :55
      return '';
    };

    // amount :70-103
    CalloutBankStatement.prototype.amount = function (ctx, WindowNo, mTab, mField, value) {
      if (this.isCalloutActive()) return '';
      var stmt = mTab.getValue('StmtAmt'); if (stmt == null) stmt = Env.ZERO;                       // :76-82 Get Stmt & Trx
      var trx = mTab.getValue('TrxAmt'); if (trx == null) trx = Env.ZERO;
      var bd = stmt.subtract(trx);
      if (mField.getColumnName() === 'ChargeAmt') {                                                 // :85-92 Charge - calculate Interest
        var charge = value; if (charge == null) charge = Env.ZERO;
        bd = bd.subtract(charge);
        mTab.setValue('InterestAmt', bd);
      } else {                                                                                      // :94-101 Calculate Charge
        var interest = mTab.getValue('InterestAmt'); if (interest == null) interest = Env.ZERO;
        bd = bd.subtract(interest);
        mTab.setValue('ChargeAmt', bd);
      }
      return '';
    };

    // payment :116-155
    CalloutBankStatement.prototype.payment = function (ctx, WindowNo, mTab, mField, value) {
      var C_Payment_ID = value;
      if (C_Payment_ID == null || C_Payment_ID === 0) return '';
      var stmt = mTab.getValue('StmtAmt'); if (stmt == null) stmt = Env.ZERO;                       // :122-124
      if (R.M.ensureView) R.M.ensureView('C_Payment_v');                                            // bundle carries no DB views (callouts/views.js)
      var sql = 'SELECT PayAmt FROM C_Payment_v WHERE C_Payment_ID=?';                              // :126
      try {
        var pstmt = R.DB.prepareStatement(sql); pstmt.setInt(1, C_Payment_ID);
        var rs = pstmt.executeQuery();
        if (rs.next()) {                                                                            // :134-140
          var bd = rs.getBigDecimal(1);
          mTab.setValue('TrxAmt', bd);
          if (stmt.compareTo(Env.ZERO) === 0) mTab.setValue('StmtAmt', bd);
        }
      } catch (e) {
        if (/no such table/i.test(String(e && e.message))) R.unportedDep('CalloutBankStatement.payment', 'view C_Payment_v absent from the bundle');
        return (e && e.message) || String(e);                                                       // :142-146
      }
      this.amount(ctx, WindowNo, mTab, mField, value);                                              // :153 Recalculate Amounts
      return '';
    };

    // paymentIntoBatch :167-186
    CalloutBankStatement.prototype.paymentIntoBatch = function (ctx, WindowNo, mTab, mField, value) {
      var C_DepositBatch_ID = value;
      if (C_DepositBatch_ID == null || C_DepositBatch_ID === 0) return '';
      var stmt = mTab.getValue('StmtAmt'); if (stmt == null) stmt = Env.ZERO;
      var depositAmt;
      try { depositAmt = R.DB.getSQLValueBDEx(null, 'SELECT DepositAmt FROM C_DepositBatch WHERE C_DepositBatch_ID=?', C_DepositBatch_ID); }   // :177-178
      catch (e) { if (/no such table/i.test(String(e && e.message))) R.unportedDep('CalloutBankStatement.paymentIntoBatch', 'table C_DepositBatch absent from the bundle'); throw e; }   // DBException → CalloutEngine.start message
      mTab.setValue('TrxAmt', depositAmt);
      if (stmt.compareTo(Env.ZERO) === 0) mTab.setValue('StmtAmt', depositAmt);
      this.amount(ctx, WindowNo, mTab, mField, value);                                              // :184 Recalculate Amounts
      return '';
    };
    return CalloutBankStatement;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
