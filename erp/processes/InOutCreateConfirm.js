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
    // MInOutConfirm.create(ship, confirmType, checkExisting) :64-93
    function create(trx, ship, confirmType, checkExisting) {
      var g = G(), ML = g.ML(), T = g.T(), D = T.D, N = T.N;
      if (checkExisting) {
        var confirmations = trx.find('m_inoutconfirm', { m_inout_id: ship.m_inout_id });      // ship.getConfirmations(false)
        for (var i = 0; i < confirmations.length; i++) if (confirmations[i].confirmtype === confirmType) return confirmations[i];   // :72-76
      }
      var confirm = ML.newRecord(trx, 'm_inoutconfirm', {});                          // new MInOutConfirm(ship, confirmType) :150-156
      confirm.set('docaction', 'CO').set('docstatus', 'DR').set('isapproved', 'N').set('iscancelled', 'N').set('isindispute', 'N').set('processed', 'N');   // setInitialDefaults :125-131
      confirm.set('ad_client_id', ship.ad_client_id).set('ad_org_id', ship.ad_org_id).set('m_inout_id', ship.m_inout_id).set('confirmtype', confirmType);
      g.saveEx(confirm);                                                              // :81
      var shipLines = g.lines(trx, 'm_inoutline', 'm_inout_id', ship.m_inout_id);     // :82
      for (var j = 0; j < shipLines.length; j++) {                                    // :83-89
        var sLine = shipLines[j], cLine = ML.newRecord(trx, 'm_inoutlineconfirm', {});   // new MInOutLineConfirm(confirm) :89-94
        cLine.set('differenceqty', 0).set('scrappedqty', 0).set('processed', 'N');    // setInitialDefaults :67-71
        cLine.set('ad_client_id', confirm.get('ad_client_id')).set('ad_org_id', confirm.get('ad_org_id')).set('m_inoutconfirm_id', confirm.id());
        cLine.set('m_inoutline_id', sLine.m_inoutline_id).set('targetqty', sLine.movementqty).set('confirmedqty', sLine.movementqty);   // setInOutLine :103-109
        // beforeSave :194-208 — Difference = Target - Confirmed - Scrapped
        cLine.set('differenceqty', N(D(cLine.get('targetqty')).subtract(D(cLine.get('confirmedqty'))).subtract(D(cLine.get('scrappedqty')))));
        g.saveEx(cLine);
      }
      return trx.get('m_inoutconfirm', confirm.id());
    }
    InOutCreateConfirm.prototype.doIt = function () {                                 // :69-84
      var trx = this.get_TrxName();
      var shipment = trx.get('m_inout', this.p_M_InOut_ID);                           // :72
      if (!shipment) throw new Error('Not found M_InOut_ID=' + this.p_M_InOut_ID);    // :73-74
      var confirm = create(trx, shipment, this.p_ConfirmType, true);                  // :76
      if (confirm == null) throw new Error('Cannot create Confirmation for ' + shipment.documentno);   // :77-78
      this.addLog(confirm.m_inoutconfirm_id, null, null, confirm.documentno, 727, confirm.m_inoutconfirm_id);   // :81
      return confirm.documentno;                                                       // :83
    };
    return InOutCreateConfirm;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
