// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/PaySelectionCreateCheck.js — org.compiere.process.PaySelectionCreateCheck, verbatim
// (org.adempiere.base.process/src/org/compiere/process/PaySelectionCreateCheck.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// MPaySelectionCheck ctors / addLine / isValid come from model_ctor.js (ModelCtor, ONE implementation).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.PaySelectionCreateCheck', function (SvrProcess, X) {
    var A = X.A, ML = X.ML;
    function PaySelectionCreateCheck() { SvrProcess.call(this); this.p_PaymentRule = null; this.p_C_PaySelection_ID = 0; this.p_onepaymentPerInvoice = false; this.m_list = []; }
    PaySelectionCreateCheck.prototype = Object.create(SvrProcess.prototype);
    PaySelectionCreateCheck.prototype.prepare = function () {                                               // :63-85
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'PaymentRule') this.p_PaymentRule = para[i].getParameter();
        else if (name.toLowerCase() === 'isonepaymentperinvoice') this.p_onepaymentPerInvoice = para[i].getParameterAsBoolean();   // MPaySelection.COLUMNNAME_IsOnePaymentPerInvoice
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA PaySelectionCreateCheck ' + name);
      }
      this.p_C_PaySelection_ID = this.getRecord_ID();
      if (this.p_PaymentRule != null && this.p_PaymentRule === 'D') this.p_PaymentRule = null;               // X_C_Order.PAYMENTRULE_DirectDebit
    };
    PaySelectionCreateCheck.prototype.doIt = function () {                                                   // :93-116
      var trx = this.get_TrxName(), PAY = P.PSUP.pay;
      var psel = trx.get('c_payselection', this.p_C_PaySelection_ID);
      if (psel == null) throw new Error('Not found C_PaySelection_ID=' + this.p_C_PaySelection_ID);          // IllegalArgumentException
      if (psel.processed === 'Y') throw new Error('@Processed@');
      var lines = trx.find('c_payselectionline', { c_payselection_id: psel.c_payselection_id }, ['line']);   // psel.getLines(false) ORDER BY Line
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.isactive !== 'Y' || line.processed === 'Y') continue;
        this.createCheck(line);
      }
      PAY.saveRow(trx, 'c_payselection', trx.get('c_payselection', psel.c_payselection_id), { processed: 'Y' });   // psel.setProcessed(true); saveEx()
      return '@C_PaySelectionCheck_ID@ - #' + this.m_list.length;
    };
    PaySelectionCreateCheck.prototype.createCheck = function (line) {                                        // :124-175
      var trx = this.get_TrxName(), PAY = P.PSUP.pay, C = PAY.ctor(), self = this;
      function invBP(l) { var inv = trx.get('c_invoice', l.c_invoice_id); return inv ? inv.c_bpartner_id : null; }   // line.getInvoice().getC_BPartner_ID()
      function cur(l) { return trx.get('c_payselectionline', l.c_payselectionline_id); }
      if (!this.p_onepaymentPerInvoice) {
        for (var i = 0; i < this.m_list.length; i++) {                                                       // Try to find one
          var check = this.m_list[i];
          if (String(check.get('c_bpartner_id')) === String(invBP(line))) {                                  // Add to existing
            C.pscAddLine(trx, check, line);
            if (!check.save()) throw new Error('Cannot save MPaySelectionCheck');
            var r = ML.save(trx, 'c_payselectionline', cur(line), { c_payselectioncheck_id: check.id(), processed: 'Y' });   // setC_PaySelectionCheck_ID; setProcessed(true); save()
            if (!r.ok) throw new Error('Cannot save MPaySelectionLine');
            return;
          }
        }
      }
      var PaymentRule = line.paymentrule;                                                                    // Create new
      if (this.p_PaymentRule != null) { if ('D' !== PaymentRule) PaymentRule = this.p_PaymentRule; }
      var chk = C.MPaySelectionCheckFromLine(trx, line, PaymentRule);
      if (!C.pscIsValid(chk)) {
        var bp = trx.get('c_bpartner', chk.get('c_bpartner_id'));
        throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NotFound@ @C_BP_BankAccount@: ' + (bp ? bp.name : '')));   // AdempiereUserError
      }
      if (!chk.save()) throw new Error('Cannot save MPaySelectionCheck');
      var r2 = ML.save(trx, 'c_payselectionline', cur(line), { c_payselectioncheck_id: chk.id(), processed: 'Y' });
      if (!r2.ok) throw new Error('Cannot save MPaySelectionLine');
      this.m_list.push(chk);
    };
    return PaySelectionCreateCheck;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
