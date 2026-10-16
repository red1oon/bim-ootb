// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/MatchPODelete.js — org.compiere.process.MatchPODelete, verbatim
// (org.adempiere.base.process/src/org/compiere/process/MatchPODelete.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// MMatchPO.beforeDelete/afterDelete (:1215-1250: posted → Fact_Acct; order line QtyDelivered/QtyInvoiced) live in model_match.js.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.MatchPODelete', function (SvrProcess, X) {
    var A = X.A, ML = X.ML;
    function MatchPODelete() { SvrProcess.call(this); this.p_M_MatchPO_ID = 0; }
    MatchPODelete.prototype = Object.create(SvrProcess.prototype);
    MatchPODelete.prototype.prepare = function () { this.p_M_MatchPO_ID = this.getRecord_ID(); };          // :46-49
    MatchPODelete.prototype.doIt = function () {                                                            // :57-89
      var trx = this.get_TrxName(), msg = '';
      var po = trx.get('m_matchpo', this.p_M_MatchPO_ID);
      if (po == null) throw A.AdempiereException('@NotFound@ @M_MatchPO_ID@ ' + this.p_M_MatchPO_ID);       // AdempiereUserError
      var reversalId = po.reversal_id || 0;
      if (!this.deleteMatchPO(po)) return '@Error@';
      msg += '@Deleted@';
      if (reversalId > 0) {
        var porev = trx.get('m_matchpo', reversalId);
        if (porev == null) throw A.AdempiereException('@NotFound@ @M_MatchPO_ID@ ' + reversalId);
        if (!this.deleteMatchPO(porev)) return '@Error@ @Reversal_ID@';
        msg += ' + @Deleted@ @Reversal_ID@';
      }
      return msg;
    };
    MatchPODelete.prototype.deleteMatchPO = function (po) {                                                 // :91-112
      var trx = this.get_TrxName(), D = A.toBD, orderLineId = null, qtyReserved = null;
      var isMatchReceipt = (po.m_inoutline_id != null && Number(po.m_inoutline_id) !== 0);
      if (isMatchReceipt) {
        orderLineId = po.c_orderline_id;
        var ol = trx.get('c_orderline', orderLineId);
        qtyReserved = X.ML.D(ol.qtyreserved).add(X.ML.D(po.qty));                  // orderLine.setQtyReserved(getQtyReserved().add(po.getQty())) — in memory
      }
      if (ML.remove(trx, 'm_matchpo', po).ok) {
        if (isMatchReceipt) {
          var r = ML.save(trx, 'c_orderline', trx.get('c_orderline', orderLineId), { qtyreserved: ML.N(qtyReserved) });     // orderLine.save(trxName)
          if (!r.ok) throw A.AdempiereException("Delete MatchPO failed to restore PO's On Ordered Qty");              // AdempiereUserError
        }
        return true;
      }
      return false;                                                                                         // po.saveEx() has nothing pending
    };
    return MatchPODelete;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
