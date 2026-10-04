// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CopyFromOrder.js — org.compiere.process.CopyFromOrder, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CopyFromOrder.java). §CP — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CopyFromOrder', function (SvrProcess, X) {
    function CopyFromOrder() { SvrProcess.call(this); this.m_ID = 0; }
    CopyFromOrder.prototype = Object.create(SvrProcess.prototype);
    CopyFromOrder.prototype.prepare = function () {                                              // :40-53
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'C_Order_ID') this.m_ID = para[i].getParameterAsInt();             // ((BigDecimal)getParameter()).intValue()
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CopyFromOrder ' + name);                       // MProcessPara.validateUnknownParameter
      }
    };
    CopyFromOrder.prototype.doIt = function () {                                                 // :60-74
      var A = X.A, trx = this.get_TrxName(), S = P.PSUP;
      var To_ID = this.getRecord_ID();
      trx.say('§PROC-INFO CopyFromOrder From C_Order_ID=' + this.m_ID + ' to ' + To_ID);
      if (To_ID === 0) throw new Error('Target C_Order_ID == 0');
      if (this.m_ID === 0) throw new Error('Source C_Order_ID == 0');
      var from = trx.get('c_order', this.m_ID), to = trx.get('c_order', To_ID);                     // new MOrder(ctx, id, trx)
      var no = S.MOrder_copyLinesFrom(trx, this.getCtx(), to, from, false, false);                 // to.copyLinesFrom(from, false, false)  — no Attributes
      return A.Msg.parseTranslation(this.getCtx(), '@Copied@=' + no);
    };
    return CopyFromOrder;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
