// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/MatchInvDelete.js — org.compiere.process.MatchInvDelete, verbatim
// (org.adempiere.base.process/src/org/compiere/process/MatchInvDelete.java). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// MMatchInv.beforeDelete/afterDelete (posted → period + Fact_Acct; deleteMatchInvCostDetail) live in model_match.js.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.MatchInvDelete', function (SvrProcess, X) {
    var A = X.A, ML = X.ML;
    function MatchInvDelete() { SvrProcess.call(this); this.p_M_MatchInv_ID = 0; }
    MatchInvDelete.prototype = Object.create(SvrProcess.prototype);
    MatchInvDelete.prototype.prepare = function () { this.p_M_MatchInv_ID = this.getRecord_ID(); };      // :46-49
    MatchInvDelete.prototype.doIt = function () {                                                          // :57-83
      var trx = this.get_TrxName(), msg = '';
      var inv = trx.get('m_matchinv', this.p_M_MatchInv_ID);
      if (inv == null) throw A.AdempiereException('@NotFound@ @M_MatchInv_ID@ ' + this.p_M_MatchInv_ID);   // AdempiereUserError
      var reversalId = inv.reversal_id || 0;
      if (!ML.remove(trx, 'm_matchinv', inv).ok) return '@Error@';                                         // inv.delete(true)
      msg += '@Deleted@';
      if (reversalId > 0) {
        var invrev = trx.get('m_matchinv', reversalId);
        if (invrev == null) throw A.AdempiereException('@NotFound@ @M_MatchInv_ID@ ' + reversalId);
        if (!ML.remove(trx, 'm_matchinv', invrev).ok) return '@Error@ @Reversal_ID@';
        msg += ' + @Deleted@ @Reversal_ID@';
      }
      return msg;
    };
    return MatchInvDelete;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
