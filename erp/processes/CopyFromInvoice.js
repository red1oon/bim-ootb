// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CopyFromInvoice.js — org.compiere.process.CopyFromInvoice, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CopyFromInvoice.java). §CP — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CopyFromInvoice', function (SvrProcess, X) {
    function CopyFromInvoice() { SvrProcess.call(this); this.m_ID = 0; }
    CopyFromInvoice.prototype = Object.create(SvrProcess.prototype);
    CopyFromInvoice.prototype.prepare = function () {                                              // :39-52
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'C_Invoice_ID') this.m_ID = para[i].getParameterAsInt();             // ((BigDecimal)getParameter()).intValue()
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CopyFromInvoice ' + name);                       // MProcessPara.validateUnknownParameter
      }
    };
    CopyFromInvoice.prototype.doIt = function () {                                                 // :59-73
      var A = X.A, trx = this.get_TrxName(), S = (typeof module !== 'undefined' && module.exports ? require('../model_invoice') : global.ModelInvoice);
      var To_ID = this.getRecord_ID();
      trx.say('§PROC-INFO CopyFromInvoice From C_Invoice_ID=' + this.m_ID + ' to ' + To_ID);
      if (To_ID === 0) throw new Error('Target C_Invoice_ID == 0');
      if (this.m_ID === 0) throw new Error('Source C_Invoice_ID == 0');
      var from = trx.get('c_invoice', this.m_ID), to = trx.get('c_invoice', To_ID);                 // new MInvoice(ctx, id, trx)
      var no = S.MInvoice_copyLinesFrom(trx, this.getCtx(), to, from, false, false, false);        // to.copyLinesFrom(from, false, false, false)
      return A.Msg.parseTranslation(this.getCtx(), '@Copied@=' + no);
    };
    return CopyFromInvoice;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
