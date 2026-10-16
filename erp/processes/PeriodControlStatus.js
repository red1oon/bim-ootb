// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/PeriodControlStatus.js — org.compiere.process.PeriodControlStatus, verbatim
// (org.adempiere.base.process/src/org/compiere/process/PeriodControlStatus.java). §CP — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.PeriodControlStatus', function (SvrProcess, X) {
    function PeriodControlStatus() { SvrProcess.call(this); this.p_C_PeriodControl_IDs = null; }
    PeriodControlStatus.prototype = Object.create(SvrProcess.prototype);
    // prepare :52-72
    PeriodControlStatus.prototype.prepare = function () {
      var R = X.A.RUNTIME, para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === '*RecordIDs*') ;
        else R.log('§PROC-UNKNOWN-PARA PeriodControlStatus ' + name);              // MProcessPara.validateUnknownParameter
      }
      this.p_C_PeriodControl_IDs = this.getRecord_IDs();
      if (this.p_C_PeriodControl_IDs == null || this.p_C_PeriodControl_IDs.length === 0) this.p_C_PeriodControl_IDs = [this.getRecord_ID()];
    };
    // doIt :79-139
    PeriodControlStatus.prototype.doIt = function () {
      var A = X.A, R = A.RUNTIME, S = (typeof module !== 'undefined' && module.exports ? require('../model_trade') : global.ModelTrade), trx = this.get_TrxName(), self = this;
      var hasUnposted = false, skipped = [];
      for (var i = 0; i < this.p_C_PeriodControl_IDs.length; i++) {
        var id = this.p_C_PeriodControl_IDs[i];
        var pc = X.get(trx, 'C_PeriodControl', id);
        if (pc == null || pc.get_ID() === 0) throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@NotFound@  @C_PeriodControl_ID@=' + id));
        // :91-93 Permanently closed
        if ('P' === pc.getPeriodStatus()) throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@PeriodStatus@ = ' + pc.getPeriodStatus()));
        // :95-104 No Action — unposted docs block a close
        var p = R.PO.get('C_Period', pc.getC_Period_ID());
        var act = String(pc.getPeriodAction() || '');
        if (('C' === act.toUpperCase() || 'P' === act.toUpperCase()) && S.sysConfigBool('FORCE_POSTING_PRIOR_TO_PERIOD_CLOSE', true, this.getAD_Client_ID()) && S.hasUnpostedDocs(this.getCtx(), p, id)) {
          hasUnposted = true; skipped.push(pc); continue;
        }
        var ch = {};
        if ('O' === act) ch.PeriodStatus = 'O';                                        // :106-108 Open
        if ('C' === act) ch.PeriodStatus = 'C';                                        // :109-111 Close
        if ('P' === act) ch.PeriodStatus = 'P';                                        // :112-114 Close Permanently
        ch.PeriodAction = 'N';                                                          // :115
        var ok = X.save(trx, 'C_PeriodControl', pc, ch).ok;                             // :117
        if (!ok) return '@Error@';                                                      // :119-121 (CacheMgt reset — no cache here)
      }
      var returnVal = '@OK';
      if (hasUnposted) {                                                                // :124-135
        returnVal = A.Msg.getMsg(this.getCtx(), 'CouldNotClosePeriodControl');
        skipped.forEach(function (pc) {
          var displayValue = 'a';
          R.DB.query('SELECT Value AS v, Name AS n FROM AD_Ref_List WHERE AD_Reference_ID=183 ORDER BY Value').forEach(function (v) { if (displayValue === 'a' && v.v === pc.getDocBaseType()) displayValue = v.n; });
          self.addLog(pc.getC_PeriodControl_ID(), null, null, displayValue, 229, pc.getC_PeriodControl_ID());
        });
      }
      return returnVal;
    };
    return PeriodControlStatus;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
