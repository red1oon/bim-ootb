// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/InOutCreateConfirm.js — org.compiere.process.InOutCreateConfirm, verbatim
// (org.adempiere.base.process/src/org/compiere/process/InOutCreateConfirm.java), with MInOutConfirm.create
// (org.adempiere.base/src/org/compiere/model/MInOutConfirm.java:64-93) + MInOutLineConfirm ctor/setInOutLine/beforeSave
// (MInOutLineConfirm.java:89-109,194-208) ported inline (no other lane owns them).
// §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.InOutCreateConfirm', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    function InOutCreateConfirm() { SvrProcess.call(this); this.p_M_InOut_ID = 0; this.p_ConfirmType = null; }
    InOutCreateConfirm.prototype = Object.create(SvrProcess.prototype);
    InOutCreateConfirm.prototype.prepare = function () {                              // :46-60
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'ConfirmType') this.p_ConfirmType = para[i].getParameter();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA InOutCreateConfirm ' + name);
      }
      this.p_M_InOut_ID = this.getRecord_ID();
    };
    InOutCreateConfirm.prototype.doIt = function () {                                 // :69-84
      var trx = this.get_TrxName();
      var shipment = trx.get('m_inout', this.p_M_InOut_ID);                           // :72
      if (!shipment) throw new Error('Not found M_InOut_ID=' + this.p_M_InOut_ID);    // :73-74
      var confirm = G().MO().MInOutConfirm_create(trx, shipment, this.p_ConfirmType, true);                  // :76
      if (confirm == null) throw new Error('Cannot create Confirmation for ' + shipment.documentno);   // :77-78
      this.addLog(confirm.m_inoutconfirm_id, null, null, confirm.documentno, 727, confirm.m_inoutconfirm_id);   // :81
      return confirm.documentno;                                                       // :83
    };
    return InOutCreateConfirm;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
