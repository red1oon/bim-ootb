// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/PaymentOnline.js — org.compiere.process.PaymentOnline, verbatim
// (org.adempiere.base.process/src/org/compiere/process/PaymentOnline.java) over MPayment.processOnline (MPayment.java:491-642).
// §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// NAMED DEPENDENCY (§PROC-UNPORTED-DEP): the external payment processor (PaymentProcessor.create(...).processCC() — MPayment.java:540-560)
// and the C_PaymentTransaction / C_OnlineTrxHistory bookkeeping that follows a processor call (:576-635) are not in the bundle. Every
// branch before the processor call (already voided / delayed / approved, no BankAccountProcessor → "PaymentNoProcessorModel") is ported.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.PaymentOnline', function (SvrProcess, X) {
    var A = X.A, R = A.RUNTIME, Msg = A.Msg;
    function PaymentOnline() { SvrProcess.call(this); }
    PaymentOnline.prototype = Object.create(SvrProcess.prototype);
    PaymentOnline.prototype.prepare = function () {                                                          // :44-55
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) { if (para[i].getParameter() == null) ; else R.log('§PROC-UNKNOWN-PARA PaymentOnline ' + para[i].getParameterName()); }
    };
    // MPayment.setPaymentProcessor(tender, CCType, C_PaymentProcessor_ID) :1085-1128 — MBankAccountProcessor.find(...) over C_BankAccount_Processor
    function findProcessors(pay, amt) {
      var sql = 'SELECT bap.* FROM C_BankAccount_Processor bap, C_PaymentProcessor pp, C_BankAccount ba WHERE pp.C_PaymentProcessor_ID = bap.C_PaymentProcessor_ID' +
        " AND ba.C_BankAccount_ID = bap.C_BankAccount_ID AND ba.AD_Client_ID=? AND pp.IsActive='Y' AND ba.IsActive='Y' AND bap.IsActive='Y' " +
        ' AND (bap.C_Currency_ID IS NULL OR bap.C_Currency_ID=?) AND (bap.MinimumAmt IS NULL OR bap.MinimumAmt = 0 OR bap.MinimumAmt <= ?)';
      var t = pay.tendertype, cc = pay.creditcardtype;
      if (t === 'A') sql += " AND bap.AcceptDirectDeposit='Y' AND pp.AcceptDirectDeposit='Y' ";
      else if (t === 'D') sql += " AND bap.AcceptDirectDebit='Y' AND pp.AcceptDirectDebit='Y' ";
      else if (t === 'K') sql += " AND bap.AcceptCheck='Y' AND pp.AcceptCheck='Y' ";
      else if (cc === 'C') sql += " AND bap.AcceptATM='Y' AND pp.AcceptATM='Y' ";
      else if (cc === 'A') sql += " AND bap.AcceptAMEX='Y' AND pp.AcceptAMEX='Y' ";
      else if (cc === 'V') sql += " AND bap.AcceptVISA='Y' AND pp.AcceptVISA='Y' ";
      else if (cc === 'M') sql += " AND bap.AcceptMC='Y' AND pp.AcceptMC='Y' ";
      else if (cc === 'D') sql += " AND bap.AcceptDiners='Y' AND pp.AcceptDiners='Y' ";
      else if (cc === 'N') sql += " AND bap.AcceptDiscover='Y' AND pp.AcceptDiscover='Y' ";
      else if (cc === 'P') sql += " AND bap.AcceptCORPORATE='Y' AND pp.AcceptCORPORATE='Y' ";
      sql += ' ORDER BY ba.IsDefault DESC ';
      try { return R.DB.query(sql, [pay.ad_client_id, pay.c_currency_id, amt]); }
      catch (e) { R.log('§PROC-SEVERE MBankAccountProcessor.find ' + ((e && e.message) || e)); return null; }  // s_log.SEVERE → return null
    }
    PaymentOnline.prototype.doIt = function () {                                                              // :62-76
      var trx = this.get_TrxName(), ctx = this.getCtx(), PAY = P.PSUP.pay, T = PAY.T();
      var row = trx.get('c_payment', this.getRecord_ID());                                                   // new MPayment(ctx, Record_ID, trx)
      if (row == null) throw new Error('PO.load: not found C_Payment_ID=' + this.getRecord_ID());
      var ch = {}, approved = false, err = null, ok;
      // ── MPayment.processOnline :491-642
      ch.isonline = 'Y'; err = null;                                                                         // setIsOnline(true); setErrorMessage(null)
      var trxType = row.trxtype;
      var done = false;
      if (trxType === 'V' || trxType === 'C') {                                                              // TRXTYPE_Void / TRXTYPE_CreditPayment
        if (T.Y(row.isvoided)) { err = Msg.getMsg(ctx, 'PaymentAlreadyVoided'); ok = true; done = true; }
      } else if (trxType === 'D') {                                                                          // TRXTYPE_DelayedCapture
        if (T.Y(row.isdelayedcapture)) { err = Msg.getMsg(ctx, 'PaymentAlreadyDelayedCapture'); ok = true; done = true; }
      } else if (T.Y(row.isapproved)) { err = Msg.getMsg(ctx, 'PaymentAlreadyProcessed'); ok = true; done = true; }
      if (!done) {
        var procs = findProcessors(row, row.payamt);                                                          // setPaymentProcessor() :1090-1100
        if (procs == null || procs.length === 0) procs = findProcessors(row, 0);                              // Relax Amount
        var bap = null;
        (procs || []).forEach(function (b) { if (bap == null && (!row.c_paymentprocessor_id || Number(row.c_paymentprocessor_id) === 0 || Number(b.c_paymentprocessor_id) === Number(row.c_paymentprocessor_id))) bap = b; });
        if (bap == null) {                                                                                    // :520-537
          err = Msg.getMsg(ctx, 'PaymentNoProcessorModel');
          if (row.c_paymentprocessor_id && Number(row.c_paymentprocessor_id) > 0) {
            var pp = trx.get('c_paymentprocessor', row.c_paymentprocessor_id);
            err += ': MPaymentProcessor[' + row.c_paymentprocessor_id + ',' + (pp ? pp.name : '') + ']';
          }
          ok = false; done = true;
        } else {
          R.log('§PROC-UNPORTED-DEP PaymentOnline PaymentProcessor.create(' + bap.c_bankaccount_processor_id + ').processCC() — external payment processor; C_PaymentTransaction/C_OnlineTrxHistory bookkeeping :576-635 not ported');
          err = Msg.getMsg(ctx, 'PaymentNoProcessor');                                                        // pp == null branch :543-544
          approved = false; ch.isapproved = 'N'; ok = approved;
          if (trxType === 'V' || trxType === 'C') ch.isvoided = 'N';
          done = true;
        }
      }
      // saveEx
      PAY.saveRow(trx, 'c_payment', row, ch);
      if (!ok) throw new Error(err);                                                                          // throw new Exception(pp.getErrorMessage())
      return 'OK';
    };
    return PaymentOnline;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
