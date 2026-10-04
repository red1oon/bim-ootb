// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CopyFromBankStmt.js — org.compiere.process.CopyFromBankStmt, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CopyFromBankStmt.java). §CP — Witness: W-CP-PROC-ORACLE.
// MBankStatementLine(statement) / setPayment / beforeSave / updateHeader live in support_copy.js (MBankStatementLine.java:100-287).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CopyFromBankStmt', function (SvrProcess, X) {
    function CopyFromBankStmt() { SvrProcess.call(this); this.m_C_BankStatement_ID = 0; }
    CopyFromBankStmt.prototype = Object.create(SvrProcess.prototype);
    CopyFromBankStmt.prototype.prepare = function () {                                 // :43-57
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'C_BankStatement_ID') this.m_C_BankStatement_ID = para[i].getParameterAsInt();   // ((BigDecimal)getParameter()).intValue()
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CopyFromBankStmt ' + name);            // MProcessPara.validateUnknownParameter
      }
    };
    CopyFromBankStmt.prototype.doIt = function () {                                    // :63-116
      var A = X.A, trx = this.get_TrxName(), ctx = this.getCtx(), S = P.PSUP;
      var To_C_BankStatement_ID = this.getRecord_ID();
      trx.say('§PROC-INFO CopyFromBankStmt From C_BankStatement_ID=' + this.m_C_BankStatement_ID + ' to ' + To_C_BankStatement_ID);   // :67
      if (To_C_BankStatement_ID === 0) throw new Error('Target C_BankStatement_ID == 0');       // :68-69
      if (this.m_C_BankStatement_ID === 0) throw new Error('Source C_BankStatement_ID == 0');   // :70-71
      var from = trx.get('c_bankstatement', this.m_C_BankStatement_ID), to = trx.get('c_bankstatement', To_C_BankStatement_ID);   // :73-74
      var no = 0;
      if (!('CO' === from.docstatus || 'CL' === from.docstatus)) throw new Error('Source must be closed or complete');   // :76-77
      var lines = trx.find('c_bankstatementline', { c_bankstatement_id: from.c_bankstatement_id }, ['line', 'c_bankstatementline_id']);   // from.getLines(false) ORDER BY Line,C_BankStatementLine_ID (MBankStatement.java)
      for (var i = 0; i < lines.length; i++) {                                         // :78
        var fromLine = lines[i];
        if (fromLine.isactive !== 'Y') continue;                                       // :80-81
        if ((fromLine.c_payment_id || 0) > 0) {                                        // :82
          // check if payment is used on another statement                             // :84-90
          var used = trx.q("SELECT bsl.C_BankStatementLine_ID AS v FROM C_BankStatementLine bsl, C_BankStatement bs WHERE bs.C_BankStatement_ID=bsl.C_BankStatement_ID AND bs.DocStatus IN ('DR', 'CO', 'CL') AND bsl.C_Payment_ID=?", [fromLine.c_payment_id]);
          var pending = trx.find('c_bankstatementline', { c_payment_id: fromLine.c_payment_id }).filter(function (l) { var st = trx.get('c_bankstatement', l.c_bankstatement_id); return st && /^(DR|CO|CL)$/.test(st.docstatus); });
          if (used.length === 0 && pending.length === 0) {                              // DB.getSQLValueEx(...) < 0 (no row → -1; the Trx's own pending lines count too)
            var toLine = S.MBankStatementLine_new(trx, to);                             // new MBankStatementLine(to)
            S.MBankStatementLine_setPayment(toLine, trx.get('c_payment', fromLine.c_payment_id));   // toLine.setPayment(new MPayment(...))
            S.MBankStatementLine_saveEx(trx, ctx, toLine);                              // toLine.saveEx()
            no++;
          } else {
            trx.say('§PROC-INFO C_BankStatementLine not copied - related to a payment already present in a bank statement');   // :99 log.info
          }
        } else {                                                                       // :101
          var tl = S.MBankStatementLine_new(trx, to);                                   // :103
          tl.set('c_currency_id', fromLine.c_currency_id == null || Number(fromLine.c_currency_id) < 1 ? null : fromLine.c_currency_id);   // :104 setC_Currency_ID(int) <1 → null
          tl.set('c_charge_id', fromLine.c_charge_id == null || Number(fromLine.c_charge_id) < 1 ? null : fromLine.c_charge_id);          // :105
          tl.set('stmtamt', fromLine.stmtamt).set('trxamt', fromLine.trxamt).set('chargeamt', fromLine.chargeamt).set('interestamt', fromLine.interestamt);   // :106-109
          tl.set('description', fromLine.description);                                  // :110
          S.MBankStatementLine_saveEx(trx, ctx, tl);                                    // :111
          no++;
        }
      }
      return A.Msg.parseTranslation(this.getCtx(), '@Copied@=' + no);                  // :115
    };
    return CopyFromBankStmt;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
