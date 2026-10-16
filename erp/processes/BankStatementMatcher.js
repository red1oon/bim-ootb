// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/BankStatementMatcher.js — org.compiere.process.BankStatementMatcher, verbatim
// (org.adempiere.base.process/src/org/compiere/process/BankStatementMatcher.java) over MBankStatementMatcher (model/MBankStatementMatcher.java).
// §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// NAMED DEPENDENCY (§PROC-UNPORTED-DEP): the matcher implementations. iDempiere core ships NO BankStatementMatcherInterface class
// (only org.idempiere.test fakes), so a C_BankStatementMatcher row can only name a plugin class. A JS plugin registers one with
// AdProcess.BANK_MATCHERS[classname] = { findMatch: function (trx, row, table) → {matched, C_Payment_ID, C_Invoice_ID, C_BPartner_ID, C_DepositBatch_ID} };
// a row whose Classname has no registered implementation is an invalid matcher (MBankStatementMatcher.isMatcherValid false) — skipped as in Java.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.BANK_MATCHERS = P.BANK_MATCHERS || {};
  P.defineProcess('org.compiere.process.BankStatementMatcher', function (SvrProcess, X) {
    var A = X.A, R = A.RUNTIME;
    function BankStatementMatcher() { SvrProcess.call(this); this.m_matchers = null; }
    BankStatementMatcher.prototype = Object.create(SvrProcess.prototype);
    BankStatementMatcher.prototype.prepare = function () {                                                   // :50-63
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) { if (para[i].getParameter() == null) ; else R.log('§PROC-UNKNOWN-PARA BankStatementMatcher ' + para[i].getParameterName()); }
      // MBankStatementMatcher.getMatchers :56-95 — SELECT * FROM C_BankStatementMatcher ORDER BY SeqNo (role-qualified); a SQL error → SEVERE, empty
      try { this.m_matchers = R.DB.query('SELECT * FROM C_BankStatementMatcher WHERE AD_Client_ID IN (0,?) ORDER BY SeqNo', [this.getAD_Client_ID()]); }
      catch (e) { R.log('§PROC-SEVERE MBankStatementMatcher.getMatchers ' + ((e && e.message) || e)); this.m_matchers = []; }
    };
    function tid(n) { return R.DB.getSQLValue(null, 'SELECT AD_Table_ID FROM AD_Table WHERE TableName=?', n); }
    BankStatementMatcher.prototype.doIt = function () {                                                      // :71-90
      var Table_ID = this.getTable_ID(), Record_ID = this.getRecord_ID(), trx = this.get_TrxName();
      if (this.m_matchers == null || this.m_matchers.length === 0) throw new Error('No Matchers found');    // IllegalStateException
      if (Table_ID === tid('I_BankStatement')) return this.matchRow(trx, 'i_bankstatement', Record_ID, false);
      else if (Table_ID === tid('C_BankStatement')) return this.matchStatement(trx, Record_ID);
      else if (Table_ID === tid('C_BankStatementLine')) return this.matchRow(trx, 'c_bankstatementline', Record_ID, true);
      return '??';
    };
    // the matcher loop shared by match(X_I_BankStatement) :101-130 and match(MBankStatementLine) :137-170
    BankStatementMatcher.prototype.matchRow = function (trx, table, id, withBatch) {
      var row = trx.get(table, id);
      if (this.m_matchers == null || row == null || (row.c_payment_id != null && Number(row.c_payment_id) !== 0)) return '--';
      for (var i = 0; i < this.m_matchers.length; i++) {
        var impl = P.BANK_MATCHERS[this.m_matchers[i].classname];                                            // isMatcherValid(): class loadable
        if (!impl) { R.log('§PROC-UNPORTED-DEP BankStatementMatcher matcher class ' + this.m_matchers[i].classname + ' (no JS implementation registered)'); continue; }
        var info = impl.findMatch(trx, row, table);
        if (info != null && info.matched) {
          var ch = {};
          if (info.C_Payment_ID > 0) ch.c_payment_id = info.C_Payment_ID;
          if (info.C_Invoice_ID > 0) ch.c_invoice_id = info.C_Invoice_ID;
          if (info.C_BPartner_ID > 0) ch.c_bpartner_id = info.C_BPartner_ID;
          if (withBatch && info.C_DepositBatch_ID > 0) ch.c_depositbatch_id = info.C_DepositBatch_ID;
          var r = X.ML.save(trx, table, row, ch); if (!r.ok) throw new Error('SaveError ' + table + ': ' + r.error);
          return 'OK';
        }
      }
      return '--';
    };
    BankStatementMatcher.prototype.matchStatement = function (trx, id) {                                      // :178-196
      var bs = trx.get('c_bankstatement', id);
      if (this.m_matchers == null || bs == null) return '--';
      var count = 0, lines = trx.find('c_bankstatementline', { c_bankstatement_id: id }, ['line']);          // bs.getLines(false) ORDER BY Line
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].c_payment_id == null || Number(lines[i].c_payment_id) === 0) { this.matchRow(trx, 'c_bankstatementline', lines[i].c_bankstatementline_id, true); count++; }
      }
      return String(count);
    };
    return BankStatementMatcher;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
