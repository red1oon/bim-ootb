// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/CopyFromJournalDoc.js — org.compiere.process.CopyFromJournalDoc, verbatim
// (org.adempiere.base.process/src/org/compiere/process/CopyFromJournalDoc.java). §CP — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.CopyFromJournalDoc', function (SvrProcess, X) {
    function CopyFromJournalDoc() { SvrProcess.call(this); this.m_ID = 0; }
    CopyFromJournalDoc.prototype = Object.create(SvrProcess.prototype);
    CopyFromJournalDoc.prototype.prepare = function () {                                              // :36-49
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'GL_Journal_ID') this.m_ID = para[i].getParameterAsInt();             // ((BigDecimal)getParameter()).intValue()
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA CopyFromJournalDoc ' + name);                       // MProcessPara.validateUnknownParameter
      }
    };
    CopyFromJournalDoc.prototype.doIt = function () {                                                 // :56-70
      var A = X.A, trx = this.get_TrxName(), S = P.PSUP;
      var To_ID = this.getRecord_ID();
      trx.say('§PROC-INFO CopyFromJournalDoc From GL_Journal_ID=' + this.m_ID + ' to ' + To_ID);
      if (To_ID === 0) throw new Error('Target GL_Journal_ID == 0');
      if (this.m_ID === 0) throw new Error('Source GL_Journal_ID == 0');
      var from = trx.get('gl_journal', this.m_ID), to = trx.get('gl_journal', To_ID);               // new MJournal(ctx, id, trx)
      var no = S.MJournal_copyLinesFrom(trx, this.getCtx(), to, from, to.dateacct, 'x');          // to.copyLinesFrom(from, to.getDateAcct(), 'x')
      return A.Msg.parseTranslation(this.getCtx(), '@Copied@=' + no);
    };
    return CopyFromJournalDoc;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
