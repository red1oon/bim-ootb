// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CopyFromJournal.js — org.compiere.process.CopyFromJournal, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CopyFromJournal.java). §CP — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CopyFromJournal', function (SvrProcess, X) {
    function CopyFromJournal() { SvrProcess.call(this); this.m_ID = 0; }
    CopyFromJournal.prototype = Object.create(SvrProcess.prototype);
    CopyFromJournal.prototype.prepare = function () {                                              // :40-53
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'GL_JournalBatch_ID') this.m_ID = para[i].getParameterAsInt();             // ((BigDecimal)getParameter()).intValue()
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CopyFromJournal ' + name);                       // MProcessPara.validateUnknownParameter
      }
    };
    CopyFromJournal.prototype.doIt = function () {                                                 // :60-74
      var A = X.A, trx = this.get_TrxName(), S = (typeof module !== 'undefined' && module.exports ? require('../model_trade') : global.ModelTrade);
      var To_ID = this.getRecord_ID();
      trx.say('§PROC-INFO CopyFromJournal From GL_JournalBatch_ID=' + this.m_ID + ' to ' + To_ID);
      if (To_ID === 0) throw new Error('Target GL_JournalBatch_ID == 0');
      if (this.m_ID === 0) throw new Error('Source GL_JournalBatch_ID == 0');
      var from = trx.get('gl_journalbatch', this.m_ID), to = trx.get('gl_journalbatch', To_ID);     // new MJournalBatch(ctx, id, trx)
      var no = S.MJournalBatch_copyDetailsFrom(trx, this.getCtx(), to, from);                      // to.copyDetailsFrom(from)
      return A.Msg.parseTranslation(this.getCtx(), '@Copied@=' + no);
    };
    return CopyFromJournal;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
